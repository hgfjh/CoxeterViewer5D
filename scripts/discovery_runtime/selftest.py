"""End-to-end checks for the discovery runtime without Sage or GAP."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from .checkpoints import CheckpointJournal, JournalIdentityMismatch
from .hashing import sha256_file, sha256_json
from .permutations import PackedPermutationSpool
from .processes import ManagedProcessRunner
from .resources import ResourcePlan, ResourcePortfolio
from .scratch import ScratchPolicy, create_scratch_workspace
from .session import DiscoveryRuntimeSession
from .cache import PersistentCachePolicy, create_persistent_cache_location


def _scratch_check(root: Path, include_wsl: bool) -> dict[str, Any]:
    source = root / "input.json"
    source.write_text('{"rank":2}\n', encoding="utf-8")
    output = root / "published.bin"
    manifest = root / "copy-manifest.json"
    policy = ScratchPolicy(
        prefer_wsl=include_wsl,
        allow_local_fallback=not include_wsl,
        keep_on_failure=False,
        local_base_directory=root / "scratch-roots",
        manifest_destination=manifest,
    )
    with create_scratch_workspace(policy) as workspace:
        staged = workspace.stage_input(source)
        generated = workspace.host_file("outputs/result.bin")
        generated.parent.mkdir(parents=True, exist_ok=True)
        generated.write_bytes(b"exact-action-placeholder")
        workspace.publish_output("outputs/result.bin", output)
        kind = workspace.kind
        filesystem_type = workspace.filesystem_type
        execution_path = staged.execution_path
    record = json.loads(manifest.read_text(encoding="utf-8"))
    assert record["status"] == "completed"
    assert record["inputs"][0]["sha256"] == sha256_file(source)
    assert record["outputs"][0]["sha256"] == sha256_file(output)
    return {
        "kind": kind,
        "filesystemType": filesystem_type,
        "stagedExecutionPath": execution_path,
    }


def _persistent_cache_check(root: Path, include_wsl: bool) -> dict[str, Any]:
    policy = PersistentCachePolicy(
        prefer_wsl=include_wsl,
        allow_local_fallback=not include_wsl,
        native_base_directory=None if include_wsl else root / "persistent-cache",
    )
    cache = create_persistent_cache_location(policy)
    host, execution = cache.ensure_directory("self-test")
    host_accessible = host.is_dir()
    if cache.kind == "wsl-ext4":
        assert not execution.startswith("/mnt/")
        assert cache.execution_path.endswith("/.cache/coxeter-viewer/torsion-free")
    if host_accessible:
        host.rmdir()
    return {
        "kind": cache.kind,
        "filesystemType": cache.filesystem_type,
        "executionPath": cache.execution_path,
        "testNamespaceHostAccessible": host_accessible,
    }


def _checkpoint_check(root: Path) -> dict[str, Any]:
    input_hash = sha256_json({"system": "I2(5)"})
    config_hash = sha256_json({"maxIndex": 10})
    path = root / "search.journal.jsonl"
    journal = CheckpointJournal(path, input_hash=input_hash, config_hash=config_hash)
    journal.append(stage="quotient", key="mod-2", status="started")
    journal.append(
        stage="quotient", key="mod-2", status="completed", payload={"order": 10}
    )
    resumed = CheckpointJournal(path, input_hash=input_hash, config_hash=config_hash)
    assert resumed.completed_keys("quotient") == {"mod-2"}
    try:
        CheckpointJournal(
            path,
            input_hash=sha256_json({"system": "A3"}),
            config_hash=config_hash,
        )
    except JournalIdentityMismatch:
        mismatch_rejected = True
    else:
        mismatch_rejected = False
    assert mismatch_rejected
    summary = resumed.summary()
    return {"events": summary.events, "lastHash": summary.last_hash}


def _permutation_check(root: Path) -> dict[str, Any]:
    path = root / "action.permrows"
    with PackedPermutationSpool(path, degree=5, mode="w") as spool:
        spool.append_rows(
            [
                (1, 0, 2, 3, 4),
                (0, 2, 1, 4, 3),
            ]
        )
        summary = spool.finalize_manifest()
    with PackedPermutationSpool(path, mode="r") as spool:
        assert list(spool.iter_rows()) == [
            (1, 0, 2, 3, 4),
            (0, 2, 1, 4, 3),
        ]
    return {
        "rows": summary.row_count,
        "bytes": summary.file_bytes,
        "sha256": summary.sha256,
    }


def _portfolio_check() -> dict[str, Any]:
    plan = ResourcePlan(
        light_workers=4,
        heavy_workers=1,
        memory_budget_bytes=8 * 1024**2,
        detected_available_bytes=8 * 1024**2,
        logical_cpus=8,
    )
    heavy_lock = threading.Lock()
    active_heavy = 0
    peak_heavy = 0

    def light_task(context):
        context.check_cancelled()
        time.sleep(0.01)
        return context.name

    def heavy_task(context):
        nonlocal active_heavy, peak_heavy
        with heavy_lock:
            active_heavy += 1
            peak_heavy = max(peak_heavy, active_heavy)
        try:
            context.check_cancelled()
            time.sleep(0.02)
            return context.name
        finally:
            with heavy_lock:
                active_heavy -= 1

    with ResourcePortfolio[str](plan) as portfolio:
        futures = [
            portfolio.submit_light(f"light-{index}", 512 * 1024, light_task)
            for index in range(6)
        ]
        futures += [
            portfolio.submit_heavy(f"heavy-{index}", 3 * 1024**2, heavy_task)
            for index in range(2)
        ]
        values = [future.result(timeout=5) for future in futures]
        stats = portfolio.stats()
        peak_bytes = portfolio.budget.snapshot().peak_reserved_bytes
    assert len(values) == 8 and peak_heavy == 1 and stats.failed == 0
    return {
        "tasks": len(values),
        "peakHeavy": peak_heavy,
        "peakReservedBytes": peak_bytes,
    }


def _process_tree_check(root: Path) -> dict[str, Any]:
    ready = root / "child-ready"
    forbidden = root / "descendant-survived"
    grandchild = (
        "import time; from pathlib import Path; time.sleep(0.6); "
        f"Path({str(forbidden)!r}).write_text('alive', encoding='utf-8')"
    )
    parent = (
        "import subprocess, sys, time; from pathlib import Path; "
        f"subprocess.Popen([sys.executable, '-c', {grandchild!r}]); "
        f"Path({str(ready)!r}).write_text('ready', encoding='utf-8'); "
        "time.sleep(30)"
    )
    cancel = threading.Event()
    runner = ManagedProcessRunner(poll_seconds=0.02, terminate_grace_seconds=0.1)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            runner.run,
            [sys.executable, "-c", parent],
            cancel_event=cancel,
            timeout_seconds=5,
        )
        deadline = time.monotonic() + 3
        while not ready.exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        assert ready.exists(), "process-tree self-test did not start its descendant"
        cancel.set()
        result = future.result(timeout=5)
    time.sleep(0.8)
    assert result.cancelled and not forbidden.exists()
    return {
        "cancelled": result.cancelled,
        "returncode": result.returncode,
        "memoryEnforcement": result.memory_enforcement,
    }


def _wsl_process_tree_check(root: Path) -> dict[str, Any]:
    policy = ScratchPolicy(
        prefer_wsl=True,
        allow_local_fallback=False,
        keep_on_failure=False,
    )
    cancel = threading.Event()
    runner = ManagedProcessRunner(poll_seconds=0.02, terminate_grace_seconds=0.1)
    with create_scratch_workspace(policy) as workspace:
        if workspace.kind != "wsl-ext4" or workspace.distro is None:
            raise AssertionError("live WSL test did not receive a WSL ext4 workspace")
        ready_host = workspace.host_file("control/ready")
        survived_host = workspace.host_file("control/survived")
        ready_execution = workspace.execution_file("control/ready")
        survived_execution = workspace.execution_file("control/survived")
        workspace.host_file("control").mkdir(parents=True)
        command = [
            "sh",
            "-c",
            '(sleep 0.7; printf bad > "$2") & printf ready > "$1"; sleep 30',
            "runtime-selftest",
            ready_execution,
            survived_execution,
        ]
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                runner.run_wsl,
                command,
                distro=workspace.distro,
                execution_control_directory=workspace.execution_file(".runtime"),
                cwd=workspace.execution_path,
                cancel_event=cancel,
                timeout_seconds=5,
            )
            deadline = time.monotonic() + 3
            while not ready_host.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            assert ready_host.exists(), (
                "WSL process-tree test did not start its descendant"
            )
            cancel.set()
            result = future.result(timeout=10)
        time.sleep(0.9)
        assert result.cancelled and not survived_host.exists(), (
            f"WSL cancellation result cancelled={result.cancelled}, "
            f"returncode={result.returncode}, descendantSurvived={survived_host.exists()}"
        )
        return {
            "cancelled": result.cancelled,
            "returncode": result.returncode,
            "memoryEnforcement": result.memory_enforcement,
        }


def _wsl_session_check(root: Path) -> dict[str, Any]:
    nonce = uuid.uuid4().hex
    request = root / "wsl-session-request.json"
    request.write_text(json.dumps({"selfTestNonce": nonce}) + "\n", encoding="utf-8")
    checkpoint_directory = root / "wsl-session-checkpoints"
    published = root / "wsl-session-result.txt"
    scratch_policy = ScratchPolicy(
        prefer_wsl=True,
        allow_local_fallback=False,
        keep_on_failure=False,
    )
    with DiscoveryRuntimeSession(
        request,
        {"selfTestNonce": nonce},
        checkpoint_directory,
        scratch_policy=scratch_policy,
    ) as runtime:
        scratch_host = runtime.paths.scratch_host_path
        cache_host, cache_execution = runtime.cache_paths("session-probe.txt")
        command = [
            "sh",
            "-c",
            'printf cache > "$1"; mkdir -p outputs; printf passed > outputs/result.txt',
            "runtime-selftest",
            cache_execution,
        ]
        result = runtime.run_backend(
            "wsl-session",
            command,
            mode="auto",
            timeout_seconds=10,
            check=True,
        )
        runtime.publish_output("outputs/result.txt", published)
        run_cache = runtime.paths.run_cache_host_path
        catalogue_cache = runtime.paths.catalogue_cache_host_path
    assert result.returncode == 0
    assert published.read_text(encoding="utf-8") == "passed"
    assert cache_host.read_text(encoding="utf-8") == "cache"
    assert not scratch_host.exists()
    # The nonce makes these self-test cache identities unique and safe to remove.
    shutil.rmtree(run_cache)
    try:
        catalogue_cache.rmdir()
    except OSError:
        pass
    return {
        "returncode": result.returncode,
        "scratchCleaned": not scratch_host.exists(),
        "cacheExecutionPath": cache_execution,
    }


def run_self_test(*, include_wsl: bool = False) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="coxeter-runtime-selftest-") as directory:
        root = Path(directory)
        checks: dict[str, Any] = {
            "scratch": _scratch_check(root, include_wsl),
            "persistentCache": _persistent_cache_check(root, include_wsl),
            "checkpoint": _checkpoint_check(root),
            "permutationSpool": _permutation_check(root),
            "portfolio": _portfolio_check(),
            "processTree": _process_tree_check(root),
        }
        if include_wsl:
            checks["wslProcessTree"] = _wsl_process_tree_check(root)
            checks["wslSession"] = _wsl_session_check(root)
    host_plan = ResourcePlan.for_host()
    return {
        "status": "passed",
        "checks": checks,
        "hostPlan": {
            "logicalCpus": host_plan.logical_cpus,
            "lightWorkers": host_plan.light_workers,
            "heavyWorkers": host_plan.heavy_workers,
            "memoryBudgetBytes": host_plan.memory_budget_bytes,
            "detectedAvailableBytes": host_plan.detected_available_bytes,
        },
    }
