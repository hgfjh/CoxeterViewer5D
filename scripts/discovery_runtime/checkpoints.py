"""Hash-bound, append-only checkpoints for long finite-group searches.

A checkpoint from a different Coxeter input or search configuration must never
be resumed accidentally.  The journal header binds both hashes, and each event
commits to the previous event hash.  A small head file keeps appends constant
time; every open still verifies the full chain.
"""

from __future__ import annotations

import json
import os
import re
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Literal

from .hashing import (
    atomic_write_json,
    canonical_json_bytes,
    sha256_file,
    sha256_json,
)


CheckpointStatus = Literal["started", "progress", "completed", "failed", "skipped"]
_HASH = re.compile(r"^[0-9a-f]{64}$")


class JournalError(RuntimeError):
    """Base class for checkpoint integrity failures."""


class JournalIdentityMismatch(JournalError):
    """Raised when input or configuration differs from the journal header."""


class JournalCorruption(JournalError):
    """Raised when an event or hash-chain invariant fails."""


@dataclass(frozen=True)
class CheckpointEvent:
    sequence: int
    timestamp: str
    stage: str
    key: str
    status: CheckpointStatus
    payload: dict[str, Any]
    previous_hash: str
    event_hash: str


@dataclass(frozen=True)
class JournalSummary:
    input_hash: str
    config_hash: str
    events: int
    completed: int
    last_hash: str
    repaired_truncated_tail: bool


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _require_hash(value: str, name: str) -> str:
    normalized = value.lower()
    if not _HASH.fullmatch(normalized):
        raise ValueError(f"{name} must be a SHA-256 hex digest")
    return normalized


@contextmanager
def _exclusive_file_lock(path: Path) -> Iterator[None]:
    """Serialize journal writers across both threads and worker processes."""

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as stream:
        if os.name == "nt":
            import msvcrt

            stream.seek(0, os.SEEK_END)
            if stream.tell() == 0:
                stream.write(b"\0")
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


class CheckpointJournal:
    """Append and resume exact-search milestones with hash-chain validation."""

    SCHEMA_VERSION = 1

    def __init__(
        self,
        path: Path | str,
        *,
        input_hash: str,
        config_hash: str,
        repair_truncated_tail: bool = True,
    ) -> None:
        self.path = Path(path)
        self.input_hash = _require_hash(input_hash, "input_hash")
        self.config_hash = _require_hash(config_hash, "config_hash")
        self.repair_truncated_tail = repair_truncated_tail
        self._head_path = self.path.with_suffix(self.path.suffix + ".head.json")
        self._lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        self._thread_lock = threading.RLock()
        self._events: list[CheckpointEvent] = []
        self._header_hash = ""
        self._last_hash = ""
        self._repaired_tail = False
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._thread_lock, _exclusive_file_lock(self._lock_path):
            if not self.path.exists():
                self._create()
            self._scan_and_rebuild_head()

    @classmethod
    def for_input(
        cls,
        path: Path | str,
        *,
        input_path: Path | str,
        config: Any,
        repair_truncated_tail: bool = True,
    ) -> "CheckpointJournal":
        return cls(
            path,
            input_hash=sha256_file(input_path),
            config_hash=sha256_json(config),
            repair_truncated_tail=repair_truncated_tail,
        )

    def _create(self) -> None:
        header_body = {
            "kind": "header",
            "schemaVersion": self.SCHEMA_VERSION,
            "inputHash": self.input_hash,
            "configHash": self.config_hash,
            "createdAt": _utc_now(),
        }
        header = {**header_body, "headerHash": sha256_json(header_body)}
        try:
            with self.path.open("xb") as stream:
                stream.write(canonical_json_bytes(header) + b"\n")
                stream.flush()
                os.fsync(stream.fileno())
        except FileExistsError:
            pass

    def append(
        self,
        *,
        stage: str,
        key: str,
        status: CheckpointStatus,
        payload: dict[str, Any] | None = None,
    ) -> CheckpointEvent:
        if not stage or not key:
            raise ValueError("stage and key must be nonempty")
        if status not in ("started", "progress", "completed", "failed", "skipped"):
            raise ValueError(f"Unknown checkpoint status: {status}")
        event_payload = {} if payload is None else payload
        if not isinstance(event_payload, dict):
            raise TypeError("checkpoint payload must be a JSON object")
        # Validate serializability before taking the cross-process lock.
        canonical_json_bytes(event_payload)

        with self._thread_lock, _exclusive_file_lock(self._lock_path):
            state = self._read_current_head()
            sequence = int(state["sequence"]) + 1
            previous_hash = str(state["lastHash"])
            body = {
                "kind": "event",
                "sequence": sequence,
                "timestamp": _utc_now(),
                "stage": stage,
                "key": key,
                "status": status,
                "payload": event_payload,
                "previousHash": previous_hash,
            }
            event_hash = sha256_json(body)
            record = {**body, "eventHash": event_hash}
            encoded = canonical_json_bytes(record) + b"\n"
            with self.path.open("ab") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
                byte_offset = stream.tell()
            head = {
                "schemaVersion": self.SCHEMA_VERSION,
                "inputHash": self.input_hash,
                "configHash": self.config_hash,
                "sequence": sequence,
                "lastHash": event_hash,
                "byteOffset": byte_offset,
            }
            atomic_write_json(self._head_path, head, pretty=False)
            event = CheckpointEvent(
                sequence=sequence,
                timestamp=body["timestamp"],
                stage=stage,
                key=key,
                status=status,
                payload=event_payload,
                previous_hash=previous_hash,
                event_hash=event_hash,
            )
            self._events.append(event)
            self._last_hash = event_hash
            return event

    def record_artifact(
        self,
        *,
        stage: str,
        key: str,
        artifact_path: Path | str,
        metadata: dict[str, Any] | None = None,
    ) -> CheckpointEvent:
        artifact = Path(artifact_path)
        payload = {
            "artifactPath": str(artifact),
            "artifactBytes": artifact.stat().st_size,
            "artifactSha256": sha256_file(artifact),
            "metadata": metadata or {},
        }
        return self.append(stage=stage, key=key, status="completed", payload=payload)

    def refresh(self) -> None:
        with self._thread_lock, _exclusive_file_lock(self._lock_path):
            self._scan_and_rebuild_head()

    def events(self) -> tuple[CheckpointEvent, ...]:
        self.refresh()
        return tuple(self._events)

    def latest(self, stage: str, key: str) -> CheckpointEvent | None:
        self.refresh()
        return next(
            (
                event
                for event in reversed(self._events)
                if event.stage == stage and event.key == key
            ),
            None,
        )

    def completed_keys(self, stage: str) -> frozenset[str]:
        self.refresh()
        latest: dict[str, CheckpointStatus] = {}
        for event in self._events:
            if event.stage == stage:
                latest[event.key] = event.status
        return frozenset(key for key, status in latest.items() if status == "completed")

    def summary(self) -> JournalSummary:
        self.refresh()
        return JournalSummary(
            input_hash=self.input_hash,
            config_hash=self.config_hash,
            events=len(self._events),
            completed=sum(event.status == "completed" for event in self._events),
            last_hash=self._last_hash,
            repaired_truncated_tail=self._repaired_tail,
        )

    def _read_current_head(self) -> dict[str, Any]:
        try:
            head = json.loads(self._head_path.read_text(encoding="utf-8"))
            valid = (
                head.get("schemaVersion") == self.SCHEMA_VERSION
                and head.get("inputHash") == self.input_hash
                and head.get("configHash") == self.config_hash
                and head.get("byteOffset") == self.path.stat().st_size
                and isinstance(head.get("sequence"), int)
                and _HASH.fullmatch(str(head.get("lastHash", ""))) is not None
            )
            if valid:
                return head
        except (OSError, json.JSONDecodeError, TypeError):
            pass
        self._scan_and_rebuild_head()
        return {
            "schemaVersion": self.SCHEMA_VERSION,
            "inputHash": self.input_hash,
            "configHash": self.config_hash,
            "sequence": len(self._events),
            "lastHash": self._last_hash,
            "byteOffset": self.path.stat().st_size,
        }

    def _scan_and_rebuild_head(self) -> None:
        events: list[CheckpointEvent] = []
        repaired = False
        previous_hash = ""
        header_hash = ""
        last_good_offset = 0
        with self.path.open("r+b") as stream:
            line_number = 0
            while True:
                line_start = stream.tell()
                raw = stream.readline()
                if not raw:
                    break
                line_number += 1
                if not raw.endswith(b"\n"):
                    if not self.repair_truncated_tail:
                        raise JournalCorruption(
                            "Checkpoint journal has a truncated tail"
                        )
                    stream.truncate(line_start)
                    repaired = True
                    break
                last_good_offset = stream.tell()
                try:
                    record = json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise JournalCorruption(
                        f"Invalid JSON on checkpoint line {line_number}"
                    ) from exc
                if line_number == 1:
                    header_hash = self._validate_header(record)
                    previous_hash = header_hash
                    continue
                event = self._validate_event(record, len(events) + 1, previous_hash)
                events.append(event)
                previous_hash = event.event_hash
            stream.flush()
            if repaired:
                os.fsync(stream.fileno())

        if not header_hash:
            raise JournalCorruption("Checkpoint journal has no header")
        self._events = events
        self._header_hash = header_hash
        self._last_hash = previous_hash
        self._repaired_tail = self._repaired_tail or repaired
        head = {
            "schemaVersion": self.SCHEMA_VERSION,
            "inputHash": self.input_hash,
            "configHash": self.config_hash,
            "sequence": len(events),
            "lastHash": previous_hash,
            "byteOffset": last_good_offset,
        }
        atomic_write_json(self._head_path, head, pretty=False)

    def _validate_header(self, record: Any) -> str:
        if not isinstance(record, dict) or record.get("kind") != "header":
            raise JournalCorruption("First checkpoint record is not a header")
        if record.get("schemaVersion") != self.SCHEMA_VERSION:
            raise JournalCorruption("Unsupported checkpoint schema version")
        if record.get("inputHash") != self.input_hash:
            raise JournalIdentityMismatch("Checkpoint input hash does not match")
        if record.get("configHash") != self.config_hash:
            raise JournalIdentityMismatch(
                "Checkpoint configuration hash does not match"
            )
        body = {key: value for key, value in record.items() if key != "headerHash"}
        expected = sha256_json(body)
        if record.get("headerHash") != expected:
            raise JournalCorruption("Checkpoint header hash does not match")
        return expected

    @staticmethod
    def _validate_event(
        record: Any, expected_sequence: int, previous_hash: str
    ) -> CheckpointEvent:
        if not isinstance(record, dict) or record.get("kind") != "event":
            raise JournalCorruption(
                f"Checkpoint record {expected_sequence} is not an event"
            )
        if record.get("sequence") != expected_sequence:
            raise JournalCorruption("Checkpoint sequence is not contiguous")
        if record.get("previousHash") != previous_hash:
            raise JournalCorruption("Checkpoint previous hash does not match")
        body = {key: value for key, value in record.items() if key != "eventHash"}
        expected_hash = sha256_json(body)
        if record.get("eventHash") != expected_hash:
            raise JournalCorruption("Checkpoint event hash does not match")
        status = record.get("status")
        if status not in ("started", "progress", "completed", "failed", "skipped"):
            raise JournalCorruption(f"Unknown checkpoint status: {status}")
        payload = record.get("payload")
        if not isinstance(payload, dict):
            raise JournalCorruption("Checkpoint payload is not an object")
        return CheckpointEvent(
            sequence=expected_sequence,
            timestamp=str(record.get("timestamp")),
            stage=str(record.get("stage")),
            key=str(record.get("key")),
            status=status,
            payload=payload,
            previous_hash=previous_hash,
            event_hash=expected_hash,
        )
