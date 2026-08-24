"""Stable integration API for torsion-free discovery launchers.

``DiscoveryRuntimeSession`` is intentionally small.  It owns one scratch
workspace, one cancellation signal, backend process execution, and persistent
checkpoint journals.  Mathematical code remains responsible for choosing the
search strategy and deciding whether an artifact passes.
"""

from __future__ import annotations

import os
import re
import threading
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Literal, Mapping, Sequence

from .cache import (
    PersistentCacheLocation,
    PersistentCachePolicy,
    create_persistent_cache_location,
)
from .checkpoints import CheckpointJournal
from .hashing import atomic_write_json, copy_file_streaming, sha256_file, sha256_json
from .processes import ManagedProcessRunner, ProcessResult
from .scratch import (
    ScratchPolicy,
    ScratchWorkspace,
    StagedFile,
    create_scratch_workspace,
)


RUNTIME_API_VERSION = "1.0"
ExecutionMode = Literal["auto", "native", "wsl"]
_SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


class RuntimeCancelled(RuntimeError):
    """Raised when cancellation is requested before a process can start."""


class CancelFileMonitor:
    """Translate a file created by a desktop/browser bridge into an Event."""

    def __init__(self, path: Path | str | None, *, poll_seconds: float = 0.2) -> None:
        if poll_seconds <= 0:
            raise ValueError("cancel-file poll interval must be positive")
        self.path = None if path is None else Path(path).resolve()
        self.poll_seconds = poll_seconds
        self.event = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.path is None or self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self._watch,
            name="coxeter-cancel-file",
            daemon=True,
        )
        self._thread.start()

    def _watch(self) -> None:
        while not self._stop.is_set() and not self.event.is_set():
            if self.path is not None and self.path.is_file():
                self.event.set()
                return
            self._stop.wait(self.poll_seconds)

    def cancel(self) -> None:
        self.event.set()

    def close(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=max(1.0, self.poll_seconds * 3))
            self._thread = None

    def __enter__(self) -> "CancelFileMonitor":
        self.start()
        return self

    def __exit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        self.close()


@dataclass(frozen=True)
class RuntimePaths:
    input_host_path: Path
    input_execution_path: str
    scratch_host_path: Path
    scratch_execution_path: str
    checkpoint_directory: Path
    copy_manifest_path: Path
    persistent_cache_host_path: Path
    persistent_cache_execution_path: str
    catalogue_cache_host_path: Path
    catalogue_cache_execution_path: str
    run_cache_host_path: Path
    run_cache_execution_path: str


class DiscoveryRuntimeSession:
    """Own the resource boundary for one exact discovery request.

    Typical launcher use::

        with DiscoveryRuntimeSession(input_path, config, checkpoints) as runtime:
            result = runtime.run_backend("sage-mod2", ["sage", "worker.py", ...])
            if result.returncode == 0:
                runtime.publish_output("outputs/action.bin", final_path)
    """

    def __init__(
        self,
        input_path: Path | str,
        search_config: Mapping[str, Any],
        checkpoint_directory: Path | str,
        *,
        scratch_policy: ScratchPolicy | None = None,
        cache_policy: PersistentCachePolicy | None = None,
        cancel_file: Path | str | None = None,
        cancel_poll_seconds: float = 0.2,
        process_runner: ManagedProcessRunner | None = None,
    ) -> None:
        self.input_path = Path(input_path).resolve()
        if not self.input_path.is_file():
            raise FileNotFoundError(self.input_path)
        self.search_config = dict(search_config)
        self.input_hash = sha256_file(self.input_path)
        self.config_hash = sha256_json(self.search_config)
        self.checkpoint_directory = Path(checkpoint_directory).resolve()
        self.checkpoint_directory.mkdir(parents=True, exist_ok=True)
        self.copy_manifest_path = (
            self.checkpoint_directory / "runtime-copy-manifest.json"
        )
        base_policy = scratch_policy or ScratchPolicy(keep_on_failure=False)
        self.scratch_policy = replace(
            base_policy, manifest_destination=self.copy_manifest_path
        )
        self.cache_policy = cache_policy
        self.cancel_monitor = CancelFileMonitor(
            cancel_file, poll_seconds=cancel_poll_seconds
        )
        self.process_runner = process_runner or ManagedProcessRunner()
        self.workspace: ScratchWorkspace | None = None
        self.persistent_cache: PersistentCacheLocation | None = None
        self.staged_input: StagedFile | None = None
        self._catalogue_cache_paths: tuple[Path, str] | None = None
        self._run_cache_paths: tuple[Path, str] | None = None
        self._journal_paths: dict[str, Path] = {}
        self._closed = False

    def start(self) -> "DiscoveryRuntimeSession":
        if self.workspace is not None:
            return self
        self.workspace = create_scratch_workspace(self.scratch_policy)
        try:
            cache_policy = self.cache_policy or PersistentCachePolicy(
                prefer_wsl=self.workspace.kind == "wsl-ext4",
                allow_local_fallback=self.workspace.kind != "wsl-ext4",
                distro=self.workspace.distro,
            )
            self.persistent_cache = create_persistent_cache_location(cache_policy)
            self._catalogue_cache_paths = self.persistent_cache.ensure_directory(
                f"catalogues/{self.input_hash}"
            )
            self._run_cache_paths = self.persistent_cache.ensure_directory(
                f"runs/{self.input_hash}/{self.config_hash}"
            )
            suffix = self.input_path.suffix or ".json"
            self.staged_input = self.workspace.stage_input(
                self.input_path, relative_path=f"inputs/request{suffix}"
            )
            self.cancel_monitor.start()
        except BaseException:
            self.workspace.close(succeeded=False)
            self.workspace = None
            self.persistent_cache = None
            raise
        return self

    @property
    def cancel_event(self) -> threading.Event:
        return self.cancel_monitor.event

    @property
    def paths(self) -> RuntimePaths:
        workspace, staged, cache = self._require_started()
        assert self._catalogue_cache_paths is not None
        assert self._run_cache_paths is not None
        catalogue_host, catalogue_execution = self._catalogue_cache_paths
        run_host, run_execution = self._run_cache_paths
        return RuntimePaths(
            input_host_path=staged.host_path,
            input_execution_path=staged.execution_path,
            scratch_host_path=workspace.host_path,
            scratch_execution_path=workspace.execution_path,
            checkpoint_directory=self.checkpoint_directory,
            copy_manifest_path=self.copy_manifest_path,
            persistent_cache_host_path=cache.host_path,
            persistent_cache_execution_path=cache.execution_path,
            catalogue_cache_host_path=catalogue_host,
            catalogue_cache_execution_path=catalogue_execution,
            run_cache_host_path=run_host,
            run_cache_execution_path=run_execution,
        )

    def request_cancel(self) -> None:
        self.cancel_monitor.cancel()

    def journal(
        self, name: str, *, additional_config: Mapping[str, Any] | None = None
    ) -> CheckpointJournal:
        """Open a persistent journal bound to this input and search configuration."""

        self._safe_name(name)
        config_hash = self.config_hash
        if additional_config:
            config_hash = sha256_json(
                {
                    "baseConfigHash": self.config_hash,
                    "additional": dict(additional_config),
                }
            )
        _workspace, _staged, _cache = self._require_started()
        assert self._run_cache_paths is not None
        assert self.persistent_cache is not None
        if os.name == "nt" and self.workspace is not None and self.workspace.kind == "wsl-ext4":
            # msvcrt byte-range locks are not dependable on \\wsl.localhost.
            # Heavy backend checkpoints still live in ext4; only this compact
            # orchestration journal stays on the Windows side. Keep each
            # configuration in its own directory so a backend upgrade selects
            # a fresh journal instead of colliding with a valid older run.
            checkpoint_root = (
                self.checkpoint_directory
                / ".runtime-journals"
                / self.config_hash
            )
            checkpoint_root.mkdir(parents=True, exist_ok=True)
        else:
            checkpoint_root, _checkpoint_execution = self.persistent_cache.ensure_directory(
                f"runs/{self.input_hash}/{self.config_hash}/checkpoints"
            )
        journal_path = checkpoint_root / f"{name}.journal.jsonl"
        self._journal_paths[name] = journal_path
        return CheckpointJournal(
            journal_path,
            input_hash=self.input_hash,
            config_hash=config_hash,
        )

    def stage_file(
        self, source: Path | str, *, relative_path: str | Path | None = None
    ) -> StagedFile:
        workspace, _staged, _cache = self._require_started()
        return workspace.stage_input(source, relative_path=relative_path)

    def publish_output(
        self, relative_path: str | Path, destination: Path | str
    ) -> StagedFile:
        workspace, _staged, _cache = self._require_started()
        return workspace.publish_output(relative_path, destination)

    def run_backend(
        self,
        name: str,
        command: Sequence[str],
        *,
        mode: ExecutionMode = "auto",
        timeout_seconds: float | None = None,
        memory_limit_bytes: int | None = None,
        env: Mapping[str, str] | None = None,
        check: bool = False,
    ) -> ProcessResult:
        """Run one backend with cancel-file polling and process-tree cleanup."""

        self._safe_name(name)
        workspace, _staged, _cache = self._require_started()
        if self.cancel_event.is_set():
            raise RuntimeCancelled("Cancellation was requested before backend launch")
        if mode not in ("auto", "native", "wsl"):
            raise ValueError(f"Unknown execution mode: {mode}")
        if mode == "wsl" and (os.name != "nt" or workspace.kind != "wsl-ext4"):
            raise RuntimeError("WSL execution requested but WSL scratch is unavailable")
        use_wsl = mode == "wsl" or (
            mode == "auto" and os.name == "nt" and workspace.kind == "wsl-ext4"
        )
        stdout_path = workspace.host_file(f"logs/{name}.stdout.log")
        stderr_path = workspace.host_file(f"logs/{name}.stderr.log")
        if use_wsl:
            if workspace.distro is None:
                raise RuntimeError("WSL execution requested without a distribution")
            return self.process_runner.run_wsl(
                command,
                distro=workspace.distro,
                execution_control_directory=workspace.execution_file(".runtime"),
                cwd=workspace.execution_path,
                env=env,
                timeout_seconds=timeout_seconds,
                cancel_event=self.cancel_event,
                stdout_path=stdout_path,
                stderr_path=stderr_path,
                memory_limit_bytes=memory_limit_bytes,
                check=check,
            )
        return self.process_runner.run(
            command,
            cwd=workspace.host_path,
            env=env,
            timeout_seconds=timeout_seconds,
            cancel_event=self.cancel_event,
            stdout_path=stdout_path,
            stderr_path=stderr_path,
            memory_limit_bytes=memory_limit_bytes,
            check=check,
        )

    def close(self, *, succeeded: bool = True) -> None:
        if self._closed:
            return
        # Any in-flight synchronous runner shares this event and will tear down
        # its complete process tree before returning.
        self.cancel_monitor.cancel()
        self.cancel_monitor.close()
        try:
            self._mirror_checkpoints()
        finally:
            if self.workspace is not None:
                self.workspace.close(succeeded=succeeded)
            self._closed = True

    def _mirror_checkpoints(self) -> None:
        records: list[dict[str, Any]] = []
        for name, source in sorted(self._journal_paths.items()):
            if not source.is_file():
                continue
            destination = self.checkpoint_directory / source.name
            copied = copy_file_streaming(source, destination)
            records.append(
                {
                    "name": name,
                    "sourceCachePath": str(source),
                    "destinationPath": str(destination),
                    "bytes": copied.bytes_copied,
                    "sha256": copied.sha256,
                }
            )
            head = source.with_suffix(source.suffix + ".head.json")
            if head.is_file():
                copy_file_streaming(
                    head,
                    self.checkpoint_directory / head.name,
                )
        if records:
            atomic_write_json(
                self.checkpoint_directory / "checkpoint-mirror-manifest.json",
                {"schemaVersion": 1, "inputHash": self.input_hash, "records": records},
            )

    def cache_paths(
        self, relative_path: str | Path, *, scope: str = "run"
    ) -> tuple[Path, str]:
        """Return matching host/backend paths inside an identity-scoped cache."""

        _workspace, _staged, cache = self._require_started()
        assert self._run_cache_paths is not None
        assert self._catalogue_cache_paths is not None
        if scope == "run":
            host_root, execution_root = self._run_cache_paths
        elif scope == "catalogue":
            host_root, execution_root = self._catalogue_cache_paths
        elif scope == "root":
            host_root, execution_root = cache.host_path, cache.execution_path
        else:
            raise ValueError("cache scope must be 'run', 'catalogue', or 'root'")
        relative = PersistentCacheLocation._relative(relative_path)
        suffix = "/".join(relative.parts)
        return host_root.joinpath(*relative.parts), f"{execution_root}/{suffix}"

    def _require_started(
        self,
    ) -> tuple[ScratchWorkspace, StagedFile, PersistentCacheLocation]:
        if (
            self.workspace is None
            or self.staged_input is None
            or self.persistent_cache is None
            or self._catalogue_cache_paths is None
            or self._run_cache_paths is None
        ):
            raise RuntimeError("DiscoveryRuntimeSession has not been started")
        if self._closed:
            raise RuntimeError("DiscoveryRuntimeSession is closed")
        return self.workspace, self.staged_input, self.persistent_cache

    @staticmethod
    def _safe_name(name: str) -> None:
        if not _SAFE_NAME.fullmatch(name):
            raise ValueError(
                "Runtime names must start with an alphanumeric character and contain "
                "only letters, numbers, dot, underscore, or hyphen"
            )

    def __enter__(self) -> "DiscoveryRuntimeSession":
        return self.start()

    def __exit__(self, exc_type: object, _exc: object, _tb: object) -> None:
        self.close(succeeded=exc_type is None)
