"""Streaming hashes and atomic file copies for discovery artifacts.

Large permutation actions must not be materialized as JSON strings merely to
compute a digest.  These helpers keep hashing and copying bounded by the chunk
size, and they fsync files that are intended to survive a backend crash.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from dataclasses import asdict, dataclass, is_dataclass
from pathlib import Path
from typing import Any, BinaryIO


DEFAULT_CHUNK_BYTES = 1024 * 1024


def _replace_with_retry(source: Path, destination: Path) -> None:
    """Replace atomically, tolerating short antivirus/OneDrive leases."""

    for attempt in range(8):
        try:
            os.replace(source, destination)
            return
        except PermissionError:
            if os.name != "nt" or attempt == 7:
                raise
            time.sleep(0.025 * (2**attempt))


@dataclass(frozen=True)
class CopyDigest:
    bytes_copied: int
    sha256: str


def canonical_json_bytes(value: Any) -> bytes:
    """Encode JSON deterministically for cache and checkpoint identities."""

    if is_dataclass(value):
        value = asdict(value)
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json_bytes(value))


def sha256_stream(stream: BinaryIO, chunk_bytes: int = DEFAULT_CHUNK_BYTES) -> str:
    """Hash an open binary stream without retaining its contents."""

    if chunk_bytes < 1:
        raise ValueError("chunk_bytes must be positive")
    digest = hashlib.sha256()
    while chunk := stream.read(chunk_bytes):
        digest.update(chunk)
    return digest.hexdigest()


def sha256_file(path: Path | str, chunk_bytes: int = DEFAULT_CHUNK_BYTES) -> str:
    with Path(path).open("rb") as stream:
        return sha256_stream(stream, chunk_bytes)


def copy_file_streaming(
    source: Path | str,
    destination: Path | str,
    *,
    chunk_bytes: int = DEFAULT_CHUNK_BYTES,
    durable: bool = True,
) -> CopyDigest:
    """Atomically copy one file while computing the source-byte digest.

    The temporary file is created beside the destination, so ``os.replace``
    never crosses a filesystem boundary.  This is the copy primitive used when
    data enters or leaves WSL scratch space.
    """

    source_path = Path(source)
    destination_path = Path(destination)
    if not source_path.is_file():
        raise FileNotFoundError(f"Copy source is not a file: {source_path}")
    if chunk_bytes < 1:
        raise ValueError("chunk_bytes must be positive")

    destination_path.parent.mkdir(parents=True, exist_ok=True)
    # Keep the temporary basename short. Hash-scoped cache directories can be
    # deep enough that repeating the final filename crosses Windows MAX_PATH.
    temporary = destination_path.parent / f".copy-{uuid.uuid4().hex}.part"
    digest = hashlib.sha256()
    bytes_copied = 0
    try:
        with source_path.open("rb") as source_stream, temporary.open("xb") as output:
            while chunk := source_stream.read(chunk_bytes):
                output.write(chunk)
                digest.update(chunk)
                bytes_copied += len(chunk)
            output.flush()
            if durable:
                os.fsync(output.fileno())
        _replace_with_retry(temporary, destination_path)
    finally:
        temporary.unlink(missing_ok=True)

    return CopyDigest(bytes_copied=bytes_copied, sha256=digest.hexdigest())


def atomic_write_json(
    path: Path | str,
    value: Any,
    *,
    pretty: bool = True,
    durable: bool = True,
) -> None:
    """Write JSON through a same-directory temporary file."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.parent / f".json-{uuid.uuid4().hex}.part"
    text = (
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True, allow_nan=False)
        if pretty
        else canonical_json_bytes(value).decode("utf-8")
    )
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.write("\n")
            stream.flush()
            if durable:
                os.fsync(stream.fileno())
        _replace_with_retry(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
