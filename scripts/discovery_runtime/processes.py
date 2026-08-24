"""Bounded external processes with descendant-safe cancellation.

Sage and GAP may create helper processes.  Killing only the Windows ``wsl.exe``
launcher or only the immediate POSIX child can leave those helpers consuming
memory.  Each run therefore owns a POSIX session, a Windows Job Object, or both
for a WSL launch.
"""

from __future__ import annotations

import ctypes
import os
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, replace
from pathlib import Path, PurePosixPath
from typing import Callable, Mapping, Sequence


_ENVIRONMENT_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class ProcessResult:
    command: tuple[str, ...]
    returncode: int
    duration_seconds: float
    timed_out: bool
    cancelled: bool
    termination_reason: str | None
    stdout_path: str | None
    stderr_path: str | None
    memory_enforcement: str

    @property
    def succeeded(self) -> bool:
        return self.returncode == 0 and not self.timed_out and not self.cancelled


class ManagedProcessError(RuntimeError):
    def __init__(self, result: ProcessResult) -> None:
        outcome = result.termination_reason or f"exit status {result.returncode}"
        super().__init__(f"Command failed with {outcome}: {' '.join(result.command)}")
        self.result = result


class _WindowsJob:
    """Kill-on-close Job Object, with an optional aggregate memory limit."""

    JOB_OBJECT_LIMIT_JOB_MEMORY = 0x00000200
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9

    def __init__(
        self, process: subprocess.Popen[bytes], memory_bytes: int | None
    ) -> None:
        from ctypes import wintypes

        class IoCounters(ctypes.Structure):
            _fields_ = [
                ("ReadOperationCount", ctypes.c_ulonglong),
                ("WriteOperationCount", ctypes.c_ulonglong),
                ("OtherOperationCount", ctypes.c_ulonglong),
                ("ReadTransferCount", ctypes.c_ulonglong),
                ("WriteTransferCount", ctypes.c_ulonglong),
                ("OtherTransferCount", ctypes.c_ulonglong),
            ]

        class BasicLimitInformation(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_longlong),
                ("PerJobUserTimeLimit", ctypes.c_longlong),
                ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wintypes.DWORD),
                ("SchedulingClass", wintypes.DWORD),
            ]

        class ExtendedLimitInformation(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", BasicLimitInformation),
                ("IoInfo", IoCounters),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateJobObjectW.restype = wintypes.HANDLE
        kernel32.SetInformationJobObject.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            ctypes.c_void_p,
            wintypes.DWORD,
        ]
        kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]

        handle = kernel32.CreateJobObjectW(None, None)
        if not handle:
            raise OSError(ctypes.get_last_error(), "CreateJobObjectW failed")
        information = ExtendedLimitInformation()
        information.BasicLimitInformation.LimitFlags = (
            self.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        )
        if memory_bytes is not None:
            information.BasicLimitInformation.LimitFlags |= (
                self.JOB_OBJECT_LIMIT_JOB_MEMORY
            )
            information.JobMemoryLimit = memory_bytes
        if not kernel32.SetInformationJobObject(
            handle,
            self.JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
            ctypes.byref(information),
            ctypes.sizeof(information),
        ):
            error = ctypes.get_last_error()
            kernel32.CloseHandle(handle)
            raise OSError(error, "SetInformationJobObject failed")
        process_handle = wintypes.HANDLE(int(getattr(process, "_handle")))
        if not kernel32.AssignProcessToJobObject(handle, process_handle):
            error = ctypes.get_last_error()
            kernel32.CloseHandle(handle)
            raise OSError(error, "AssignProcessToJobObject failed")
        self._kernel32 = kernel32
        self._handle = handle

    def terminate(self, exit_code: int = 1) -> None:
        if self._handle:
            self._kernel32.TerminateJobObject(self._handle, exit_code)

    def close(self) -> None:
        if self._handle:
            self._kernel32.CloseHandle(self._handle)
            self._handle = None


class ManagedProcessRunner:
    """Run commands without a shell and bound their time and process tree."""

    def __init__(
        self, *, poll_seconds: float = 0.05, terminate_grace_seconds: float = 1.0
    ) -> None:
        if poll_seconds <= 0 or terminate_grace_seconds < 0:
            raise ValueError("Invalid process timing configuration")
        self.poll_seconds = poll_seconds
        self.terminate_grace_seconds = terminate_grace_seconds

    def run(
        self,
        command: Sequence[str],
        *,
        cwd: Path | str | None = None,
        env: Mapping[str, str] | None = None,
        timeout_seconds: float | None = None,
        cancel_event: threading.Event | None = None,
        stdout_path: Path | str | None = None,
        stderr_path: Path | str | None = None,
        memory_limit_bytes: int | None = None,
        check: bool = False,
        termination_hook: Callable[[str], None] | None = None,
    ) -> ProcessResult:
        if not command or any(
            not isinstance(part, str) or "\0" in part for part in command
        ):
            raise ValueError("command must be a nonempty sequence of safe strings")
        if timeout_seconds is not None and timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if memory_limit_bytes is not None and memory_limit_bytes < 1:
            raise ValueError("memory_limit_bytes must be positive")

        actual_command = tuple(command)
        memory_enforcement = "admission-only"
        if os.name != "nt" and memory_limit_bytes is not None:
            prlimit = shutil.which("prlimit")
            if prlimit:
                actual_command = (
                    prlimit,
                    f"--as={memory_limit_bytes}",
                    "--",
                    *actual_command,
                )
                memory_enforcement = "prlimit-address-space"

        stdout_handle = self._open_log(stdout_path)
        stderr_handle = self._open_log(stderr_path)
        popen_stdout = (
            stdout_handle if stdout_handle is not None else subprocess.DEVNULL
        )
        popen_stderr = (
            stderr_handle if stderr_handle is not None else subprocess.DEVNULL
        )
        creationflags = 0
        popen_options: dict[str, object] = {}
        if os.name == "nt":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            popen_options["start_new_session"] = True

        process: subprocess.Popen[bytes] | None = None
        windows_job: _WindowsJob | None = None
        started = time.monotonic()
        timed_out = False
        cancelled = False
        termination_reason: str | None = None
        try:
            process = subprocess.Popen(
                actual_command,
                cwd=None if cwd is None else os.fspath(cwd),
                env=None if env is None else {**os.environ, **env},
                stdin=subprocess.DEVNULL,
                stdout=popen_stdout,
                stderr=popen_stderr,
                shell=False,
                creationflags=creationflags,
                **popen_options,
            )
            if os.name == "nt":
                try:
                    windows_job = _WindowsJob(process, memory_limit_bytes)
                    memory_enforcement = (
                        "windows-job-memory" if memory_limit_bytes else "windows-job"
                    )
                except OSError:
                    windows_job = None

            while process.poll() is None:
                elapsed = time.monotonic() - started
                if cancel_event is not None and cancel_event.is_set():
                    cancelled = True
                    termination_reason = "cancelled"
                    break
                if timeout_seconds is not None and elapsed >= timeout_seconds:
                    timed_out = True
                    termination_reason = "timeout"
                    break
                time.sleep(self.poll_seconds)

            if termination_reason is not None:
                if termination_hook is not None:
                    try:
                        termination_hook(termination_reason)
                    except OSError:
                        pass
                self._terminate_tree(process, windows_job)
            returncode = process.wait()
            result = ProcessResult(
                command=tuple(command),
                returncode=returncode,
                duration_seconds=time.monotonic() - started,
                timed_out=timed_out,
                cancelled=cancelled,
                termination_reason=termination_reason,
                stdout_path=None if stdout_path is None else str(Path(stdout_path)),
                stderr_path=None if stderr_path is None else str(Path(stderr_path)),
                memory_enforcement=memory_enforcement,
            )
            if check and not result.succeeded:
                raise ManagedProcessError(result)
            return result
        finally:
            if windows_job is not None:
                # Kill-on-close also catches descendants that outlive a successful parent.
                windows_job.close()
            if process is not None and process.poll() is None:
                self._terminate_tree(process, None)
            if stdout_handle is not None:
                stdout_handle.close()
            if stderr_handle is not None:
                stderr_handle.close()

    @staticmethod
    def _open_log(path: Path | str | None):
        if path is None:
            return None
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        return destination.open("wb")

    def _terminate_tree(
        self, process: subprocess.Popen[bytes], windows_job: _WindowsJob | None
    ) -> None:
        if os.name == "nt":
            try:
                process.send_signal(signal.CTRL_BREAK_EVENT)
            except (OSError, ValueError):
                try:
                    process.terminate()
                except OSError:
                    pass
            self._wait_briefly(process)
            if process.poll() is None:
                if windows_job is not None:
                    windows_job.terminate()
                else:
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=5,
                    )
            return

        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        self._wait_briefly(process)
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def _wait_briefly(self, process: subprocess.Popen[bytes]) -> None:
        deadline = time.monotonic() + self.terminate_grace_seconds
        while process.poll() is None and time.monotonic() < deadline:
            time.sleep(min(self.poll_seconds, max(0, deadline - time.monotonic())))

    def run_wsl(
        self,
        command: Sequence[str],
        *,
        distro: str,
        execution_control_directory: str,
        cwd: str | None = None,
        env: Mapping[str, str] | None = None,
        timeout_seconds: float | None = None,
        cancel_event: threading.Event | None = None,
        stdout_path: Path | str | None = None,
        stderr_path: Path | str | None = None,
        memory_limit_bytes: int | None = None,
        check: bool = False,
    ) -> ProcessResult:
        """Run a WSL command in its own Linux session and kill that session on exit."""

        if os.name != "nt":
            raise RuntimeError("run_wsl is only needed by a Windows host")
        if not command:
            raise ValueError("WSL command cannot be empty")
        control = PurePosixPath(execution_control_directory)
        if not control.is_absolute() or ".." in control.parts:
            raise ValueError(
                "execution_control_directory must be an absolute safe path"
            )
        wsl_exe = shutil.which("wsl.exe")
        if wsl_exe is None:
            raise FileNotFoundError("wsl.exe was not found")

        subprocess.run(
            [wsl_exe, "-d", distro, "--exec", "mkdir", "-p", str(control)],
            check=True,
            timeout=10,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        pid_file = str(control / f"process-group-{uuid.uuid4().hex}.pid")
        limit = 0 if memory_limit_bytes is None else memory_limit_bytes
        script = (
            'umask 077; pid_file="$1"; limit="$2"; shift 2; '
            'printf "%s\\n" "$$" > "$pid_file"; '
            'if [ "$limit" -gt 0 ] && command -v prlimit >/dev/null 2>&1; then '
            'exec prlimit --as="$limit" -- "$@"; fi; exec "$@"'
        )
        linux_command = list(command)
        if env:
            assignments: list[str] = []
            for name, value in sorted(env.items()):
                if not _ENVIRONMENT_NAME.fullmatch(name) or "\0" in value:
                    raise ValueError(f"Unsafe WSL environment assignment: {name!r}")
                assignments.append(f"{name}={value}")
            linux_command = ["/usr/bin/env", *assignments, *linux_command]

        wrapped = [wsl_exe, "-d", distro]
        if cwd is not None:
            wrapped.extend(["--cd", cwd])
        wrapped.extend(
            [
                "--exec",
                "setsid",
                "--wait",
                "sh",
                "-c",
                script,
                "coxeter-runtime",
                pid_file,
                str(limit),
                *linux_command,
            ]
        )

        def terminate_linux_group(_reason: str) -> None:
            self._kill_wsl_group(wsl_exe, distro, pid_file)

        try:
            result = self.run(
                wrapped,
                timeout_seconds=timeout_seconds,
                cancel_event=cancel_event,
                stdout_path=stdout_path,
                stderr_path=stderr_path,
                check=False,
                termination_hook=terminate_linux_group,
            )
            result = replace(
                result,
                command=tuple(command),
                memory_enforcement=(
                    "wsl-prlimit-or-admission" if memory_limit_bytes else "wsl-session"
                ),
            )
            if check and not result.succeeded:
                raise ManagedProcessError(result)
            return result
        finally:
            subprocess.run(
                [wsl_exe, "-d", distro, "--exec", "rm", "-f", "--", pid_file],
                check=False,
                timeout=5,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

    def _kill_wsl_group(
        self, wsl_exe: str, distro: str, pid_file: str, *, graceful: bool = True
    ) -> None:
        read = subprocess.run(
            [wsl_exe, "-d", distro, "--exec", "cat", pid_file],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
        )
        value = read.stdout.strip()
        if not value.isdigit() or int(value) < 2:
            return
        group = value
        if graceful:
            subprocess.run(
                [
                    wsl_exe,
                    "-d",
                    distro,
                    "--exec",
                    "/bin/kill",
                    "-TERM",
                    "--",
                    f"-{group}",
                ],
                check=False,
                timeout=5,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            time.sleep(self.terminate_grace_seconds)
        subprocess.run(
            [
                wsl_exe,
                "-d",
                distro,
                "--exec",
                "/bin/kill",
                "-KILL",
                "--",
                f"-{group}",
            ],
            check=False,
            timeout=5,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
