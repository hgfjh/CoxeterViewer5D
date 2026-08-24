"""Persistent exact-search cache paths, separate from ephemeral scratch.

WSL backends use the distribution user's cache directory.  They never place
catalogues or resumable checkpoints under ``/mnt/c``.  Native fallbacks use the
host user's standard cache root and inherit that user's filesystem protection.
"""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Literal

from .scratch import (
    _UNSAFE_FILESYSTEMS,
    _WSL_CONTROL_TIMEOUT_SECONDS,
    _inside_wsl,
    _linux_filesystem_type,
    _select_wsl_distro,
    _wsl_unc_path,
)


CacheKind = Literal["wsl-ext4", "windows-local", "posix-local", "local-fallback"]


@dataclass(frozen=True)
class PersistentCachePolicy:
    prefer_wsl: bool = True
    allow_local_fallback: bool = True
    distro: str | None = None
    native_base_directory: Path | None = None


class PersistentCacheLocation:
    """A durable cache root with equivalent host and backend paths."""

    def __init__(
        self,
        *,
        kind: CacheKind,
        host_path: Path,
        execution_path: str,
        filesystem_type: str | None,
        distro: str | None,
        fallback_reason: str | None = None,
    ) -> None:
        self.kind = kind
        self.host_path = host_path
        self.execution_path = execution_path.rstrip("/") or "/"
        self.filesystem_type = filesystem_type
        self.distro = distro
        self.fallback_reason = fallback_reason

    @staticmethod
    def _relative(value: str | Path) -> PurePosixPath:
        relative = PurePosixPath(str(value).replace("\\", "/"))
        if relative.is_absolute() or not relative.parts:
            raise ValueError(f"Cache path must be relative: {value}")
        if any(part in ("", ".", "..") for part in relative.parts):
            raise ValueError(f"Cache path contains an unsafe component: {value}")
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

    def ensure_directory(self, relative_path: str | Path) -> tuple[Path, str]:
        """Create an identity-scoped directory with owner-only POSIX access."""

        host = self.host_file(relative_path)
        execution = self.execution_file(relative_path)
        if self.kind == "wsl-ext4" and os.name == "nt":
            if self.distro is None:
                raise RuntimeError("WSL cache has no distribution")
            wsl_exe = shutil.which("wsl.exe")
            if wsl_exe is None:
                raise FileNotFoundError("wsl.exe was not found")
            subprocess.run(
                [
                    wsl_exe,
                    "-d",
                    self.distro,
                    "--exec",
                    "mkdir",
                    "-p",
                    "--mode=700",
                    "--",
                    execution,
                ],
                check=True,
                timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                [wsl_exe, "-d", self.distro, "--exec", "chmod", "700", execution],
                check=True,
                timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            permissions = subprocess.run(
                [
                    wsl_exe,
                    "-d",
                    self.distro,
                    "--exec",
                    "stat",
                    "-c",
                    "%a",
                    execution,
                ],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
            ).stdout.strip()
            if permissions != "700":
                raise RuntimeError(
                    f"Persistent WSL cache directory has mode {permissions}, expected 700"
                )
        else:
            host.mkdir(parents=True, exist_ok=True, mode=0o700)
            if os.name != "nt":
                host.chmod(0o700)
                if stat.S_IMODE(host.stat().st_mode) != 0o700:
                    raise RuntimeError("Persistent cache directory is not mode 700")
        return host, execution


def _native_cache_root(policy: PersistentCachePolicy) -> Path:
    if policy.native_base_directory is not None:
        return policy.native_base_directory.expanduser().resolve()
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA")
        parent = (
            Path(local_app_data) if local_app_data else Path.home() / "AppData/Local"
        )
        return parent / "CoxeterViewer5D/cache/torsion-free"
    xdg_cache = os.environ.get("XDG_CACHE_HOME")
    parent = Path(xdg_cache).expanduser() if xdg_cache else Path.home() / ".cache"
    return parent / "coxeter-viewer/torsion-free"


def _create_native_cache(
    policy: PersistentCachePolicy, fallback_reason: str | None = None
) -> PersistentCacheLocation:
    root = _native_cache_root(policy)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name != "nt":
        root.chmod(0o700)
    filesystem_type = _linux_filesystem_type(root) if os.name != "nt" else None
    if _inside_wsl() and filesystem_type in _UNSAFE_FILESYSTEMS:
        raise RuntimeError(
            f"Persistent WSL cache resolved to mounted filesystem {filesystem_type}"
        )
    if _inside_wsl() and filesystem_type not in _UNSAFE_FILESYSTEMS:
        kind: CacheKind = "wsl-ext4"
    elif fallback_reason:
        kind = "local-fallback"
    elif os.name == "nt":
        kind = "windows-local"
    else:
        kind = "posix-local"
    return PersistentCacheLocation(
        kind=kind,
        host_path=root,
        execution_path=str(root),
        filesystem_type=filesystem_type,
        distro=os.environ.get("WSL_DISTRO_NAME") if _inside_wsl() else None,
        fallback_reason=fallback_reason,
    )


def _create_windows_wsl_cache(policy: PersistentCachePolicy) -> PersistentCacheLocation:
    wsl_exe = shutil.which("wsl.exe")
    if wsl_exe is None:
        raise FileNotFoundError("wsl.exe was not found")
    distro = _select_wsl_distro(wsl_exe, policy.distro)
    script = (
        'umask 077; base="${XDG_CACHE_HOME:-$HOME/.cache}/coxeter-viewer/torsion-free"; '
        'mkdir -p "$base"; chmod 700 "$base"; printf "%s\\n" "$base"'
    )
    execution_path = subprocess.run(
        [wsl_exe, "-d", distro, "--exec", "sh", "-c", script],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
    ).stdout.strip()
    path = PurePosixPath(execution_path)
    if (
        not path.is_absolute()
        or ".." in path.parts
        or execution_path.startswith("/mnt/")
    ):
        raise RuntimeError(
            f"WSL returned an unsafe persistent cache path: {execution_path}"
        )
    filesystem_type = subprocess.run(
        [
            wsl_exe,
            "-d",
            distro,
            "--exec",
            "stat",
            "-f",
            "-c",
            "%T",
            execution_path,
        ],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
    ).stdout.strip()
    if filesystem_type.lower() in _UNSAFE_FILESYSTEMS:
        raise RuntimeError(
            f"Persistent WSL cache resolved to mounted filesystem {filesystem_type}"
        )
    permissions = subprocess.run(
        [wsl_exe, "-d", distro, "--exec", "stat", "-c", "%a", execution_path],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=_WSL_CONTROL_TIMEOUT_SECONDS,
    ).stdout.strip()
    if permissions != "700":
        raise RuntimeError(
            f"Persistent WSL cache root has mode {permissions}, expected 700"
        )
    return PersistentCacheLocation(
        kind="wsl-ext4",
        host_path=_wsl_unc_path(distro, execution_path),
        execution_path=execution_path,
        filesystem_type=filesystem_type,
        distro=distro,
    )


def create_persistent_cache_location(
    policy: PersistentCachePolicy | None = None,
) -> PersistentCacheLocation:
    """Create or open the owner-only cache used by exact backend sessions."""

    selected = policy or PersistentCachePolicy()
    if os.name == "nt" and selected.prefer_wsl:
        try:
            return _create_windows_wsl_cache(selected)
        except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
            if not selected.allow_local_fallback:
                raise
            return _create_native_cache(
                selected, fallback_reason=f"WSL persistent cache unavailable: {exc}"
            )
    return _create_native_cache(selected)
