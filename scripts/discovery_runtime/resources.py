"""Resource admission and bounded worker portfolios.

Worker counts alone do not protect a finite-group search: one Sage process can
use more memory than every lightweight modulus probe combined.  ``MemoryBudget``
therefore admits work by declared bytes, while ``ResourcePortfolio`` keeps
separate pools for lightweight and memory-heavy jobs.
"""

from __future__ import annotations

import ctypes
import os
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from typing import Callable, Generic, Literal, TypeVar


GIB = 1024**3
TaskKind = Literal["light", "heavy"]
T = TypeVar("T")


class ResourceCancelled(RuntimeError):
    """Raised when a queued task is cancelled before admission."""


class ResourceTimeout(TimeoutError):
    """Raised when a byte reservation cannot be admitted in time."""


@dataclass(frozen=True)
class ResourceSnapshot:
    total_bytes: int
    reserved_bytes: int
    available_bytes: int
    peak_reserved_bytes: int
    active_leases: int
    active_heavy_leases: int
    queued_requests: int


@dataclass(frozen=True)
class ResourcePlan:
    """Host-aware defaults for a portfolio of external algebra jobs."""

    light_workers: int
    heavy_workers: int
    memory_budget_bytes: int
    detected_available_bytes: int
    logical_cpus: int

    @classmethod
    def for_host(
        cls,
        *,
        light_workers: int | None = None,
        heavy_workers: int = 1,
        memory_fraction: float = 0.72,
        host_reserve_bytes: int = 3 * GIB,
    ) -> "ResourcePlan":
        if heavy_workers < 1:
            raise ValueError("heavy_workers must be positive")
        if not 0 < memory_fraction <= 1:
            raise ValueError("memory_fraction must lie in (0, 1]")
        available = available_memory_bytes()
        logical_cpus = max(1, os.cpu_count() or 1)
        if light_workers is None:
            if logical_cpus >= 16:
                light_workers = 6
            elif logical_cpus >= 8:
                light_workers = 5
            elif logical_cpus >= 4:
                light_workers = 4
            else:
                light_workers = logical_cpus
        if not 1 <= light_workers <= 64:
            raise ValueError("light_workers must lie between 1 and 64")

        floor = min(256 * 1024**2, available)
        fractional = int(available * memory_fraction)
        after_reserve = max(floor, available - host_reserve_bytes)
        budget = min(available, max(floor, min(fractional, after_reserve)))
        return cls(
            light_workers=light_workers,
            heavy_workers=heavy_workers,
            memory_budget_bytes=budget,
            detected_available_bytes=available,
            logical_cpus=logical_cpus,
        )


def available_memory_bytes() -> int:
    """Return currently available physical memory using only the stdlib."""

    if os.name == "nt":

        class MemoryStatusEx(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = MemoryStatusEx()
        status.dwLength = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return int(status.ullAvailPhys)

    meminfo = "/proc/meminfo"
    if os.path.isfile(meminfo):
        with open(meminfo, encoding="ascii") as stream:
            for line in stream:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) * 1024

    page_size = getattr(os, "sysconf", lambda _name: 0)("SC_PAGE_SIZE")
    available_pages = getattr(os, "sysconf", lambda _name: 0)("SC_AVPHYS_PAGES")
    if page_size and available_pages:
        return int(page_size * available_pages)
    return 2 * GIB


@dataclass
class _Request:
    token: object
    bytes_requested: int
    kind: TaskKind


class ResourceLease:
    def __init__(self, budget: "MemoryBudget", amount: int, kind: TaskKind) -> None:
        self._budget = budget
        self.amount = amount
        self.kind = kind
        self._released = False

    def release(self) -> None:
        if self._released:
            return
        self._released = True
        self._budget._release(self.amount, self.kind)

    def __enter__(self) -> "ResourceLease":
        return self

    def __exit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        self.release()


class MemoryBudget:
    """A fair-enough byte semaphore with an independent heavy-job cap."""

    def __init__(self, total_bytes: int, *, heavy_limit: int = 1) -> None:
        if total_bytes < 1:
            raise ValueError("total_bytes must be positive")
        if heavy_limit < 1:
            raise ValueError("heavy_limit must be positive")
        self.total_bytes = total_bytes
        self.heavy_limit = heavy_limit
        self._reserved = 0
        self._peak = 0
        self._leases = 0
        self._heavy = 0
        self._queue: list[_Request] = []
        self._condition = threading.Condition()

    def acquire(
        self,
        bytes_requested: int,
        *,
        kind: TaskKind = "light",
        timeout: float | None = None,
        cancel_event: threading.Event | None = None,
    ) -> ResourceLease:
        if not 0 < bytes_requested <= self.total_bytes:
            raise ValueError(
                f"bytes_requested must be in [1, {self.total_bytes}], got "
                f"{bytes_requested}"
            )
        if kind not in ("light", "heavy"):
            raise ValueError(f"Unknown task kind: {kind}")
        request = _Request(object(), bytes_requested, kind)
        deadline = None if timeout is None else time.monotonic() + timeout
        with self._condition:
            self._queue.append(request)
            try:
                while True:
                    if cancel_event is not None and cancel_event.is_set():
                        raise ResourceCancelled("Resource admission was cancelled")
                    selected = self._next_admissible()
                    if selected is request:
                        self._queue.remove(request)
                        self._reserved += bytes_requested
                        self._peak = max(self._peak, self._reserved)
                        self._leases += 1
                        if kind == "heavy":
                            self._heavy += 1
                        return ResourceLease(self, bytes_requested, kind)

                    remaining = (
                        None if deadline is None else deadline - time.monotonic()
                    )
                    if remaining is not None and remaining <= 0:
                        raise ResourceTimeout(
                            f"Timed out reserving {bytes_requested} bytes"
                        )
                    self._condition.wait(
                        0.1 if remaining is None else min(0.1, remaining)
                    )
            except BaseException:
                if request in self._queue:
                    self._queue.remove(request)
                    self._condition.notify_all()
                raise

    def _next_admissible(self) -> _Request | None:
        for request in self._queue:
            memory_fits = self._reserved + request.bytes_requested <= self.total_bytes
            heavy_fits = request.kind != "heavy" or self._heavy < self.heavy_limit
            if memory_fits and heavy_fits:
                return request
        return None

    def _release(self, amount: int, kind: TaskKind) -> None:
        with self._condition:
            self._reserved -= amount
            self._leases -= 1
            if kind == "heavy":
                self._heavy -= 1
            if self._reserved < 0 or self._leases < 0 or self._heavy < 0:
                raise RuntimeError("Resource lease accounting became negative")
            self._condition.notify_all()

    def snapshot(self) -> ResourceSnapshot:
        with self._condition:
            return ResourceSnapshot(
                total_bytes=self.total_bytes,
                reserved_bytes=self._reserved,
                available_bytes=self.total_bytes - self._reserved,
                peak_reserved_bytes=self._peak,
                active_leases=self._leases,
                active_heavy_leases=self._heavy,
                queued_requests=len(self._queue),
            )


@dataclass(frozen=True)
class TaskContext:
    name: str
    kind: TaskKind
    memory_bytes: int
    cancel_event: threading.Event

    def check_cancelled(self) -> None:
        if self.cancel_event.is_set():
            raise ResourceCancelled(f"Task {self.name!r} was cancelled")


@dataclass(frozen=True)
class PortfolioStats:
    submitted: int
    completed: int
    failed: int
    cancelled: int


class ResourcePortfolio(Generic[T]):
    """Run 4-6 light probes beside a separately capped heavy queue."""

    def __init__(self, plan: ResourcePlan) -> None:
        self.plan = plan
        self.budget = MemoryBudget(
            plan.memory_budget_bytes, heavy_limit=plan.heavy_workers
        )
        self.cancel_event = threading.Event()
        self._light = ThreadPoolExecutor(
            max_workers=plan.light_workers, thread_name_prefix="coxeter-light"
        )
        self._heavy = ThreadPoolExecutor(
            max_workers=plan.heavy_workers, thread_name_prefix="coxeter-heavy"
        )
        self._stats_lock = threading.Lock()
        self._submitted = 0
        self._completed = 0
        self._failed = 0
        self._cancelled = 0
        self._closed = False

    def submit_light(
        self,
        name: str,
        memory_bytes: int,
        function: Callable[[TaskContext], T],
    ) -> Future[T]:
        return self._submit("light", name, memory_bytes, function)

    def submit_heavy(
        self,
        name: str,
        memory_bytes: int,
        function: Callable[[TaskContext], T],
    ) -> Future[T]:
        return self._submit("heavy", name, memory_bytes, function)

    def _submit(
        self,
        kind: TaskKind,
        name: str,
        memory_bytes: int,
        function: Callable[[TaskContext], T],
    ) -> Future[T]:
        if self._closed:
            raise RuntimeError("ResourcePortfolio is closed")
        context = TaskContext(name, kind, memory_bytes, self.cancel_event)
        executor = self._heavy if kind == "heavy" else self._light
        with self._stats_lock:
            self._submitted += 1

        def invoke() -> T:
            try:
                context.check_cancelled()
                with self.budget.acquire(
                    memory_bytes, kind=kind, cancel_event=self.cancel_event
                ):
                    context.check_cancelled()
                    result = function(context)
                with self._stats_lock:
                    self._completed += 1
                return result
            except ResourceCancelled:
                with self._stats_lock:
                    self._cancelled += 1
                raise
            except BaseException:
                with self._stats_lock:
                    self._failed += 1
                raise

        return executor.submit(invoke)

    def cancel(self) -> None:
        self.cancel_event.set()

    def stats(self) -> PortfolioStats:
        with self._stats_lock:
            return PortfolioStats(
                self._submitted,
                self._completed,
                self._failed,
                self._cancelled,
            )

    def shutdown(self, *, wait: bool = True, cancel_futures: bool = True) -> None:
        if self._closed:
            return
        self._closed = True
        if cancel_futures:
            self.cancel()
        self._light.shutdown(wait=wait, cancel_futures=cancel_futures)
        self._heavy.shutdown(wait=wait, cancel_futures=cancel_futures)

    def __enter__(self) -> "ResourcePortfolio[T]":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.shutdown(cancel_futures=exc is not None)
