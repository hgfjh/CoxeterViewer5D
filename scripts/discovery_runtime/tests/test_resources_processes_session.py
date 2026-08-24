from __future__ import annotations

import json
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from scripts.discovery_runtime import (
    DiscoveryRuntimeSession,
    ManagedProcessRunner,
    ManagedProcessError,
    MemoryBudget,
    PersistentCachePolicy,
    ResourcePlan,
    ResourcePortfolio,
    ResourceTimeout,
    ScratchPolicy,
)


class ResourceTests(unittest.TestCase):
    def test_byte_budget_blocks_until_a_lease_is_released(self) -> None:
        budget = MemoryBudget(100, heavy_limit=1)
        lease = budget.acquire(80)
        with self.assertRaises(ResourceTimeout):
            budget.acquire(30, timeout=0.05)
        lease.release()
        with budget.acquire(30, timeout=0.1):
            self.assertEqual(budget.snapshot().reserved_bytes, 30)
        self.assertEqual(budget.snapshot().reserved_bytes, 0)

    def test_portfolio_never_exceeds_the_heavy_worker_cap(self) -> None:
        plan = ResourcePlan(4, 1, 1024, 1024, 8)
        lock = threading.Lock()
        active = 0
        peak = 0

        def task(_context):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            time.sleep(0.03)
            with lock:
                active -= 1
            return 1

        with ResourcePortfolio[int](plan) as portfolio:
            futures = [
                portfolio.submit_heavy(str(index), 512, task) for index in range(3)
            ]
            self.assertEqual(sum(future.result() for future in futures), 3)
        self.assertEqual(peak, 1)


class ProcessAndSessionTests(unittest.TestCase):
    def test_checked_timeout_is_always_a_failure(self) -> None:
        runner = ManagedProcessRunner(poll_seconds=0.01, terminate_grace_seconds=0.01)
        with self.assertRaises(ManagedProcessError) as captured:
            runner.run(
                [sys.executable, "-c", "import time; time.sleep(20)"],
                timeout_seconds=0.1,
                check=True,
            )
        self.assertTrue(captured.exception.result.timed_out)
        self.assertIn("timeout", str(captured.exception))

    def test_cancellation_kills_a_descendant_process(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ready = root / "ready"
            survived = root / "survived"
            grandchild = (
                "import time; from pathlib import Path; time.sleep(0.5); "
                f"Path({str(survived)!r}).write_text('bad', encoding='utf-8')"
            )
            parent = (
                "import subprocess, sys, time; from pathlib import Path; "
                f"subprocess.Popen([sys.executable, '-c', {grandchild!r}]); "
                f"Path({str(ready)!r}).write_text('ok', encoding='utf-8'); "
                "time.sleep(20)"
            )
            cancel = threading.Event()
            runner = ManagedProcessRunner(
                poll_seconds=0.01, terminate_grace_seconds=0.05
            )
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(
                    runner.run,
                    [sys.executable, "-c", parent],
                    cancel_event=cancel,
                    timeout_seconds=5,
                )
                deadline = time.monotonic() + 3
                while not ready.exists() and time.monotonic() < deadline:
                    time.sleep(0.01)
                self.assertTrue(ready.exists())
                cancel.set()
                result = future.result(timeout=5)
            time.sleep(0.65)
            self.assertTrue(result.cancelled)
            self.assertFalse(survived.exists())

    def test_runtime_session_stages_runs_checkpoints_publishes_and_cleans(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            request = root / "request.json"
            request.write_text('{"rank":2}\n', encoding="utf-8")
            checkpoints = root / "checkpoints"
            published = root / "final.txt"
            policy = ScratchPolicy(
                prefer_wsl=False,
                keep_on_failure=False,
                local_base_directory=root / "scratch",
            )
            cache_policy = PersistentCachePolicy(
                prefer_wsl=False,
                native_base_directory=root / "persistent-cache",
            )
            with DiscoveryRuntimeSession(
                request,
                {"maxIndex": 10},
                checkpoints,
                scratch_policy=policy,
                cache_policy=cache_policy,
            ) as runtime:
                scratch = runtime.paths.scratch_host_path
                cache = runtime.paths.persistent_cache_host_path
                journal = runtime.journal("modules")
                journal.append(stage="module", key="small", status="completed")
                command = [
                    sys.executable,
                    "-c",
                    "from pathlib import Path; Path('outputs').mkdir(); "
                    "Path('outputs/result.txt').write_text('passed', encoding='utf-8')",
                ]
                result = runtime.run_backend(
                    "fixture", command, mode="native", timeout_seconds=5, check=True
                )
                self.assertEqual(result.returncode, 0)
                runtime.publish_output("outputs/result.txt", published)
            self.assertFalse(scratch.exists())
            self.assertTrue(cache.exists())
            self.assertEqual(published.read_text(encoding="utf-8"), "passed")
            manifest = json.loads(
                (checkpoints / "runtime-copy-manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["status"], "completed")
            self.assertTrue((checkpoints / "modules.journal.jsonl").is_file())
            self.assertTrue((checkpoints / "checkpoint-mirror-manifest.json").is_file())

    def test_cancel_file_stops_a_running_session_process(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            request = root / "request.json"
            request.write_text("{}\n", encoding="utf-8")
            cancel_file = root / "cancel"
            policy = ScratchPolicy(
                prefer_wsl=False,
                keep_on_failure=False,
                local_base_directory=root / "scratch",
            )
            cache_policy = PersistentCachePolicy(
                prefer_wsl=False,
                native_base_directory=root / "persistent-cache",
            )
            with DiscoveryRuntimeSession(
                request,
                {},
                root / "checkpoints",
                scratch_policy=policy,
                cache_policy=cache_policy,
                cancel_file=cancel_file,
                cancel_poll_seconds=0.01,
            ) as runtime:
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(
                        runtime.run_backend,
                        "wait",
                        [sys.executable, "-c", "import time; time.sleep(20)"],
                        mode="native",
                        timeout_seconds=5,
                    )
                    time.sleep(0.1)
                    cancel_file.write_text("cancel\n", encoding="utf-8")
                    result = future.result(timeout=5)
                self.assertTrue(result.cancelled)


if __name__ == "__main__":
    unittest.main()
