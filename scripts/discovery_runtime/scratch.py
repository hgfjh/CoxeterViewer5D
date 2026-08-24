"""Scratch workspaces for native, WSL, and fallback discovery runs.

On Windows, heavy Linux algebra jobs should work in the distribution's ext4
filesystem rather than under ``/mnt/c``.  This module stages inputs once,
publishes only requested outputs, and records hashes for both directions.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Literal

from .hashing import atomic_write_json, copy_file_streaming, sha256_file


ScratchKind = Literal["wsl-ext4", "posix-local", "windows-local", "local-fallback"]
_UNSAFE_FILESYSTEMS = {"9p", "drvfs", "fuseblk"}
_WSL_SCRATCH_PATTERN = re.compile(r"^/[^\0]*/coxeter-runtime\.[A-Za-z0-9]+$")
_WSL_CONTROL_TIMEOUT_SECONDS = 45


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class ScratchPolicy:
    prefer_wsl: bool = True
    allow_local_fallback: bool = True
    keep: bool = False
    keep_on_failure: bool = True
    distro: str | None = None
    local_base_directory: Path | None = None
    wsl_base_directory: str = "/tmp"
    manifest_destination: Path | None = None


@dataclass(frozen=True)
class StagedFile:
    logical_path: str
    host_path: Path
    execution_path: str
    bytes: int
    sha256: str


class ScratchWorkspace:
    """A unique scratch directory with verified ingress and egress copies."""

    def __init__(
        self,
        *,
        kind: ScratchKind,
        host_path: Path,
        execution_path: str,
        filesystem_type: str | None,
        distro: str | None,
        policy: ScratchPolicy,
        fallback_reason: str | None = None,
    ) -> None:
        self.kind = kind
        self.host_path = host_path
        self.execution_path = execution_path.rstrip("/") or "/"
        self.filesystem_type = filesystem_type
        self.distro = distro
        self.policy = policy
        self.fallback_reason = fallback_reason
        self.workspace_id = uuid.uuid4().hex
        self._closed = False
        self._input_counter = 0
        self._manifest: dict[str, Any] = {
            "schemaVersion": 1,
            "workspaceId": self.workspace_id,
            "kind": kind,
            "filesystemType": filesystem_type,
            "distro": distro,
            "executionRoot": self.execution_path,
            "fallbackReason": fallback_reason,
            "createdAt": _utc_now(),
            "status": "running",
            "inputs": [],
            "outputs": [],
        }

    def _relative(self, value: str | Path) -> PurePosixPath:
        normalized = str(value).replace("\\", "/")
        relative = PurePosixPath(normalized)
        if relative.is_absolute() or not relative.parts:
            raise ValueError(f"Scratch path must be relative: {value}")
        if any(part in ("", ".", "..") for part in relative.parts):
            raise ValueError(f"Scratch path contains an unsafe component: {value}")
        return relative

    def host_file(self, relative_path: str | Path) -> Path:
        relative = self._relative(relative_path)
        return self.host_path.joinpath(*relative.parts)

    def execution_file(self, relative_path: str | Path) -> str:
        relative = self._relative(relative_path)
        suffix = "/".join(relative.parts)
        return (
            f"{self.execution_path}/{suffix}"
            if self.execution_path != "/"
            else f"/{suffix}"
        )

    def stage_input(
        self, source: Path | str, *, relative_path: str | Path | None = None
    ) -> StagedFile:
        """Copy an input into scratch and record the bytes that were copied."""

        self._ensure_open()
        source_path = Path(source).resolve()
        if relative_path is None:
            relative_path = f"inputs/{self._input_counter:04d}-{source_path.name}"
            self._input_counter += 1
        relative = self._relative(relative_path)
        destination = self.host_file(relative)
        if destination.exists():
            raise FileExistsError(f"Scratch input already exists: {relative}")
        copied = copy_file_streaming(source_path, destination)
        staged = StagedFile(
            logical_path=relative.as_posix(),
            host_path=destination,
            execution_path=self.execution_file(relative),
            bytes=copied.bytes_copied,
            sha256=copied.sha256,
        )
        self._manifest["inputs"].append(
            {
                "sourcePath": str(source_path),
                "logicalPath": staged.logical_path,
                "bytes": staged.bytes,
                "sha256": staged.sha256,
            }
        )
        return staged

    def publish_output(
        self, relative_path: str | Path, destination: Path | str
    ) -> StagedFile:
        """Copy one requested result out of scratch and verify its digest."""

        self._ensure_open()
        relative = self._relative(relative_path)
        source = self.host_file(relative)
        destination_path = Path(destination).resolve()
        copied = copy_file_streaming(source, destination_path)
        destination_hash = sha256_file(destination_path)
        if copied.sha256 != destination_hash:
            destination_path.unlink(missing_ok=True)
            raise OSError(f"Output digest changed while copying {relative}")
        result = StagedFile(
            logical_path=relative.as_posix(),
            host_path=destination_path,
            execution_path=str(destination_path),
            bytes=copied.bytes_copied,
            sha256=copied.sha256,
        )
        self._manifest["outputs"].append(
            {
                "logicalPath": result.logical_path,
                "destinationPath": str(destination_path),
                "bytes": result.bytes,
                "sha256": result.sha256,
            }
        )
        return result

    def manifest(self) -> dict[str, Any]:
        return {
            **self._manifest,
            "inputs": list(self._manifest["inputs"]),
            "outputs": list(self._manifest["outputs"]),
        }

    def write_manifest(self, destination: Path | str) -> None:
        atomic_write_json(destination, self.manifest())

    def close(self, *, succeeded: bool = True) -> None:
        if self._closed:
            return
        self._manifest["status"] = "completed" if succeeded else "failed"
        self._manifest["closedAt"] = _utc_now()
        internal_manifest = self.host_path / "runtime-copy-manifest.json"
        atomic_write_json(internal_manifest, self._manifest)
        if self.policy.manifest_destination is not None:
            self.write_manifest(self.policy.manifest_destination)
        self._closed = True
        should_keep = self.policy.keep or (
            not succeeded and self.policy.keep_on_failure
        )
        if not should_keep:
            self._cleanup()

    def _cleanup(self) -> None:
        try:
            shutil.rmtree(self.host_path)
            return
        except FileNotFoundError:
            return
        except OSError:
            if self.kind != "wsl-ext4" or os.name != "nt" or self.distro is None:
                raise

        # The path was generated from a UUID and is checked again before removal.
        if not _WSL_SCRATCH_PATTERN.fullmatch(self.execution_path):
            raise RuntimeError(
                f"Refusing to remove unexpected WSL path: {self.execution_path}"
            )
        subprocess.run(
            [
                shutil.which("wsl.exe") or "wsl.exe",
                "-d",
                self.distro,
                "--exec",
                "rm",
                "-rf",
                "--",
                self.execution_path,
            ],
            check=True,
            timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def _ensure_open(self) -> None:
        if self._closed:
            raise RuntimeError("ScratchWorkspace is closed")

    def __enter__(self) -> "ScratchWorkspace":
        return self

    def __exit__(self, exc_type: object, _exc: object, _tb: object) -> None:
        self.close(succeeded=exc_type is None)


def _inside_wsl() -> bool:
    if os.environ.get("WSL_DISTRO_NAME"):
        return True
    try:
        return (
            "microsoft"
            in Path("/proc/sys/kernel/osrelease").read_text(encoding="ascii").lower()
        )
    except OSError:
        return False


def _decode_mount_path(value: str) -> str:
    return (
        value.replace("\\040", " ")
        .replace("\\011", "\t")
        .replace("\\012", "\n")
        .replace("\\134", "\\")
    )


def _linux_filesystem_type(path: Path) -> str | None:
    try:
        resolved = path.resolve()
        matches: list[tuple[int, str]] = []
        for line in (
            Path("/proc/self/mountinfo").read_text(encoding="utf-8").splitlines()
        ):
            before, after = line.split(" - ", 1)
            fields = before.split()
            mount = Path(_decode_mount_path(fields[4]))
            try:
                resolved.relative_to(mount)
            except ValueError:
                continue
            matches.append((len(str(mount)), after.split()[0]))
        return max(matches)[1] if matches else None
    except (OSError, ValueError, IndexError):
        return None


def _decode_wsl_list(raw: bytes) -> list[str]:
    if raw.count(b"\x00") > max(2, len(raw) // 8):
        text = raw.decode("utf-16-le", errors="replace")
    else:
        text = raw.decode("utf-8", errors="replace")
    return [
        line.strip().strip("\x00") for line in text.splitlines() if line.strip(" \x00")
    ]


def _select_wsl_distro(wsl_exe: str, requested: str | None) -> str:
    if requested:
        if "\0" in requested or any(char in requested for char in "\r\n"):
            raise ValueError("WSL distribution name contains control characters")
        return requested
    environment_choice = os.environ.get("COXETER_WSL_DISTRO")
    if environment_choice:
        return environment_choice
    result = subprocess.run(
        [wsl_exe, "--list", "--quiet"],
        check=True,
        capture_output=True,
        timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
    )
    distributions = _decode_wsl_list(result.stdout)
    if not distributions:
        raise RuntimeError("WSL is installed but no distribution is available")
    return distributions[0]


def _wsl_unc_path(distro: str, linux_path: str) -> Path:
    suffix = linux_path.lstrip("/").replace("/", "\\")
    candidates = [
        Path(f"\\\\wsl.localhost\\{distro}\\{suffix}"),
        Path(f"\\\\wsl$\\{distro}\\{suffix}"),
    ]
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        for candidate in candidates:
            if candidate.is_dir():
                return candidate
        time.sleep(0.05)
    raise OSError(f"Cannot access WSL scratch through {candidates[0]}")


def _create_windows_wsl_workspace(policy: ScratchPolicy) -> ScratchWorkspace:
    wsl_exe = shutil.which("wsl.exe")
    if wsl_exe is None:
        raise FileNotFoundError("wsl.exe was not found")
    distro = _select_wsl_distro(wsl_exe, policy.distro)
    base = PurePosixPath(policy.wsl_base_directory)
    if not base.is_absolute() or ".." in base.parts:
        raise ValueError("wsl_base_directory must be an absolute safe path")
    # Choosing the random name on the host means cleanup still knows the exact
    # directory if a cold WSL launch times out after Linux created it.
    created = f"{str(base).rstrip('/')}/coxeter-runtime.{uuid.uuid4().hex}"
    if not _WSL_SCRATCH_PATTERN.fullmatch(created):
        raise RuntimeError(f"Generated an unexpected WSL path: {created!r}")
    try:
        subprocess.run(
            [
                wsl_exe,
                "-d",
                distro,
                "--exec",
                "mkdir",
                "--mode=700",
                "--",
                created,
            ],
            check=True,
            timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        filesystem_type = subprocess.run(
            [wsl_exe, "-d", distro, "--exec", "stat", "-f", "-c", "%T", created],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
        ).stdout.strip()
        if filesystem_type.lower() in _UNSAFE_FILESYSTEMS:
            raise RuntimeError(
                f"WSL scratch resolved to slow mounted filesystem {filesystem_type}"
            )
        host_path = _wsl_unc_path(distro, created)
        return ScratchWorkspace(
            kind="wsl-ext4",
            host_path=host_path,
            execution_path=created,
            filesystem_type=filesystem_type,
            distro=distro,
            policy=policy,
        )
    except BaseException:
        subprocess.run(
            [wsl_exe, "-d", distro, "--exec", "rm", "-rf", "--", created],
            check=False,
            timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        raise


def _create_local_workspace(
    policy: ScratchPolicy, *, fallback_reason: str | None = None
) -> ScratchWorkspace:
    base = policy.local_base_directory
    if base is not None:
        base.mkdir(parents=True, exist_ok=True)
    host_path = Path(tempfile.mkdtemp(prefix="coxeter-runtime.", dir=base))
    inside_wsl = _inside_wsl()
    filesystem_type = _linux_filesystem_type(host_path) if os.name != "nt" else None
    if inside_wsl and filesystem_type in _UNSAFE_FILESYSTEMS:
        shutil.rmtree(host_path)
        host_path = Path(tempfile.mkdtemp(prefix="coxeter-runtime.", dir="/tmp"))
        filesystem_type = _linux_filesystem_type(host_path)
    if inside_wsl and filesystem_type not in _UNSAFE_FILESYSTEMS:
        kind: ScratchKind = "wsl-ext4"
    elif fallback_reason is not None:
        kind = "local-fallback"
    elif os.name == "nt":
        kind = "windows-local"
    else:
        kind = "posix-local"
    return ScratchWorkspace(
        kind=kind,
        host_path=host_path,
        execution_path=str(host_path),
        filesystem_type=filesystem_type,
        distro=os.environ.get("WSL_DISTRO_NAME") if inside_wsl else None,
        policy=policy,
        fallback_reason=fallback_reason,
    )


def create_scratch_workspace(
    policy: ScratchPolicy | None = None,
) -> ScratchWorkspace:
    """Choose WSL ext4 when available, otherwise return a safe local workspace.

    Python is never required by the browser build.  On systems without WSL the
    fallback is an ordinary unique temporary directory, and no shell command is
    constructed from browser or imported-data strings.
    """

    selected = policy or ScratchPolicy()
    if os.name == "nt" and selected.prefer_wsl:
        try:
            return _create_windows_wsl_workspace(selected)
        except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
            if not selected.allow_local_fallback:
                raise
            return _create_local_workspace(
                selected, fallback_reason=f"WSL scratch unavailable: {exc}"
            )
    return _create_local_workspace(selected)
