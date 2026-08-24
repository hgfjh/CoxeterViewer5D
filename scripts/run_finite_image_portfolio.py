#!/usr/bin/env python3
"""Run a hash-bound portfolio of exact finite-image module searches.

The mathematical work remains in ``torsion_free_finite_image.py`` and
``packed_composite_solver.py``.  This script coordinates those programs while
enforcing three resource and certificate boundaries:

* characteristics 3, 5, 7, and 11 are recognition-heavy jobs and run one at a
  time; completed artifacts are checked by a pool of four to six light threads;
* every reusable action is copied into content-addressed storage and is kept
  even when it leaves some torsion witnesses uncovered; and
* a complete action is materialized only after the packed solver reports a
  witness-free diagonal orbit, then independently checked and retained by
  content hash; and
* a materialized survivor is automatically handed to the in-repo two-track
  promotion pipeline. That pipeline starts over with complete spherical
  freeness checks, tries the smaller lawful subcomplex first, and uses the
  full Davis quotient as a stronger fallback.

Run this program under the pinned Sage Python when using the default worker.
The worker itself enumerates every eligible prime ideal above the requested
rational prime, including extension residue fields supported by the source
Coxeter representation.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import copy
import hashlib
import json
import math
import os
import shutil
import signal
import subprocess
import sys
import threading
from array import array
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Mapping, Protocol, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import finite_image_module_catalogue as module_catalogue  # noqa: E402
import finite_image_recognition as recognition  # noqa: E402


SCHEMA_VERSION = 1
ORCHESTRATOR_VERSION = "1.4.0"
ARTIFACT_TYPE = "finite-image-residue-module-portfolio"
CHECKPOINT_TYPE = "finite-image-residue-module-portfolio-checkpoint"
MATERIALIZATION_REQUEST_TYPE = "finite-image-action-materialization-request"
MATERIALIZED_ACTION_TYPE = "finite-image-materialized-composite-action"
FIBERING_PROMOTION_TYPE = "materialized-action-two-track-promotion"
DEFAULT_FIBERING_SCRIPT = SCRIPT_DIR / "run_materialized_fibering.ts"
DEFAULT_MOD3_STRUCTURAL_CERTIFICATE = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_mod3_structural_certificate.json"
)
DEFAULT_ODD_PRIME_STRUCTURAL_CERTIFICATES = {
    prime: SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / f"compact_5_cube_mod{prime}_structural_certificate.json"
    for prime in (5, 7, 11)
}
MOD2_SEED_PRIME = 2
REQUIRED_PRIMES = (3, 5, 7, 11)
SCHEDULED_PRIMES = (MOD2_SEED_PRIME, *REQUIRED_PRIMES)
SOLVER_ID = "packed-composite-permutation-module-solver"
SOLVER_VERSION = "2.0.0"
HEX_DIGITS = frozenset("0123456789abcdef")
REQUIRED_PROMOTION_IMPLEMENTATION_PATHS = frozenset(
    {
        "package.json",
        "pnpm-lock.yaml",
        "scripts/run_materialized_fibering.ts",
        "src/compression/construction.ts",
        "src/davis/fullQuotient.ts",
        "src/fibering/fullDavisCertificate.ts",
        "src/fibering/fullDavisMorse.ts",
        "src/fibering/fullDavisSearch.ts",
        "src/fibering/lawfulNpcCertificate.ts",
        "src/fibering/lawfulSearch.ts",
        "src/fibering/lawfulTrack.ts",
        "src/fibering/materializedActionPipeline.ts",
        "src/fibering/pullingTriangulation.ts",
        "src/fibering/schreierHomomorphism.ts",
        "src/fibering/schreierPresentation.ts",
        "src/fibering/wallHomomorphism.ts",
        "src/topology/collapsibility.ts",
        "src/torsionFree/certification.ts",
        "src/torsionFree/quotient.ts",
        "src/utils/canonicalSha256.ts",
        "src/walls/coorientation.ts",
        "src/walls/wallSystem.ts",
    }
)


class PortfolioError(RuntimeError):
    """Base class for fail-closed portfolio errors."""


class StaleCheckpointError(PortfolioError):
    """The checkpoint belongs to different source data or implementations."""


class StaleArtifactError(PortfolioError):
    """A worker artifact or packed action failed its declared hash contract."""


class PortfolioBudgetExceeded(PortfolioError):
    """Retaining every exact module would exceed the declared byte budget."""


class WorkerExecutionError(PortfolioError):
    """A child process did not produce a readable result artifact."""


class MissingRequiredModuleError(PortfolioError):
    """The portfolio lacks exact modules from a required characteristic."""


class InvalidPromotionArtifactError(PortfolioError):
    """The downstream full-Davis result failed its source/hash contract."""


def canonical_json(value: Any) -> str:
    """Return the certificate encoding used for portfolio hashes."""

    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def require_sha256(value: Any, field_name: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in HEX_DIGITS for character in value)
    ):
        raise StaleArtifactError(
            f"{field_name} must be a lowercase 64-character SHA-256 digest."
        )
    return value


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    """Replace a JSON journal without exposing a partially written checkpoint."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    os.replace(temporary, path)


def read_json_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkerExecutionError(f"Cannot read JSON artifact {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise WorkerExecutionError(f"JSON artifact {path} is not an object.")
    return value


def relative_posix(path: Path, base: Path) -> str:
    return Path(os.path.relpath(path, base)).as_posix()


def unique_file_bytes(paths: Sequence[Path]) -> int:
    """Count referenced files once, independent of unrelated cache contents."""

    resolved = {path.resolve() for path in paths}
    return sum(path.stat().st_size for path in resolved)


def generator_row_hashes(path: Path, descriptor: Mapping[str, Any]) -> list[str]:
    """Hash each generator row without decoding the permutation points."""

    degree = int(descriptor["degree"])
    encoding = str(descriptor["encoding"])
    widths = {"uint16-le": 2, "uint32-le": 4}
    try:
        row_bytes = degree * widths[encoding]
    except KeyError as exc:
        raise StaleArtifactError(
            f"Unsupported packed permutation encoding {encoding!r}."
        ) from exc
    hashes: list[str] = []
    with path.open("rb") as stream:
        for _generator in range(int(descriptor["generatorCount"])):
            digest = hashlib.sha256()
            remaining = row_bytes
            while remaining:
                block = stream.read(min(remaining, 1024 * 1024))
                if not block:
                    raise StaleArtifactError("Packed permutation row ended early.")
                digest.update(block)
                remaining -= len(block)
            hashes.append(digest.hexdigest())
        if stream.read(1):
            raise StaleArtifactError("Packed permutation rows have trailing bytes.")
    return hashes


@dataclass(frozen=True, slots=True)
class PortfolioConfig:
    input_path: Path
    output_dir: Path
    worker_python: Path = Path(sys.executable)
    solver_python: Path = Path(sys.executable)
    worker_script: Path = SCRIPT_DIR / "torsion_free_finite_image.py"
    solver_script: Path = SCRIPT_DIR / "packed_composite_solver.py"
    seed_artifacts: tuple[Path, ...] = ()
    primes: tuple[int, ...] = REQUIRED_PRIMES
    light_workers: int = 4
    heavy_workers: int = 1
    cache_dir: Path = Path.home() / ".cache" / "coxeter-viewer" / "portfolio"
    max_object_bytes: int = 8 * 1024 * 1024 * 1024
    max_action_bytes: int = 512 * 1024 * 1024
    module_cache_bytes: int = 4 * 1024 * 1024 * 1024
    max_index: int = 576_000
    max_modules: int = 4096
    max_subgroups: int = 65_536
    worker_timeout: int = 7200
    recognition_timeout: int = 3600
    solver_timeout: int = 7200
    solver_max_bytes: int = 2 * 1024 * 1024 * 1024
    solver_max_mapped_bytes: int = 32 * 1024 * 1024 * 1024
    solver_max_combinations: int = 250_000
    solver_max_factors: int = 8
    solver_max_degree: int = 2_000_000
    solver_max_cartesian_points: int = 16_000_000
    solver_checkpoint_interval: int = 250
    run_fibering_pipeline: bool = True
    fibering_runtime: tuple[str, ...] = ()
    fibering_script: Path = DEFAULT_FIBERING_SCRIPT
    fibering_timeout: int = 7200
    fibering_max_input_bytes: int = 512 * 1024 * 1024
    fibering_exact_wall_limit: int = 24
    fibering_max_candidates: int = 1_000_000
    fibering_time_budget_ms: int = 3_600_000
    research_gap: Path | None = None
    research_gap_manifest: Path | None = None
    mod3_structural_certificate: Path | None = DEFAULT_MOD3_STRUCTURAL_CERTIFICATE
    mod5_structural_certificate: Path | None = DEFAULT_ODD_PRIME_STRUCTURAL_CERTIFICATES[5]
    mod7_structural_certificate: Path | None = DEFAULT_ODD_PRIME_STRUCTURAL_CERTIFICATES[7]
    mod11_structural_certificate: Path | None = DEFAULT_ODD_PRIME_STRUCTURAL_CERTIFICATES[11]
    resume: bool = True
    dry_run: bool = False

    def __post_init__(self) -> None:
        if self.light_workers < 4 or self.light_workers > 6:
            raise ValueError("light_workers must be between 4 and 6.")
        if self.heavy_workers != 1:
            raise ValueError("Exactly one memory-heavy worker is permitted.")
        if tuple(sorted(set(self.primes))) != REQUIRED_PRIMES:
            raise ValueError("The exact residue portfolio is fixed at primes 3,5,7,11.")
        for field_name in (
            "max_object_bytes",
            "max_action_bytes",
            "module_cache_bytes",
            "max_index",
            "max_modules",
            "max_subgroups",
            "worker_timeout",
            "recognition_timeout",
            "solver_timeout",
            "solver_max_bytes",
            "solver_max_mapped_bytes",
            "solver_max_combinations",
            "solver_max_factors",
            "solver_max_degree",
            "solver_max_cartesian_points",
            "solver_checkpoint_interval",
            "fibering_timeout",
            "fibering_max_input_bytes",
            "fibering_exact_wall_limit",
            "fibering_max_candidates",
            "fibering_time_budget_ms",
        ):
            if int(getattr(self, field_name)) <= 0:
                raise ValueError(f"{field_name} must be positive.")


@dataclass(frozen=True, slots=True)
class WorkerJob:
    id: str
    prime: int
    resource_class: str
    output_path: Path
    command: tuple[str, ...]
    job_sha256: str


@dataclass(frozen=True, slots=True)
class WorkerExecution:
    return_code: int
    cancelled: bool = False
    timed_out: bool = False


class JobRunner(Protocol):
    def run(
        self,
        job: WorkerJob,
        *,
        timeout_seconds: int,
        cancel_event: threading.Event,
    ) -> WorkerExecution: ...


class SubprocessJobRunner:
    """Launch one isolated child process and cancel its complete process group."""

    def __init__(self, log_dir: Path) -> None:
        self.log_dir = log_dir

    @staticmethod
    def _creation_options() -> dict[str, Any]:
        if os.name == "nt":
            return {"creationflags": getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)}
        return {"start_new_session": True}

    @staticmethod
    def _terminate_group(process: subprocess.Popen[Any]) -> None:
        if process.poll() is not None:
            return
        try:
            if os.name == "nt":
                process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=8)
            return
        except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
            pass
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                os.killpg(process.pid, signal.SIGKILL)
        except (OSError, ProcessLookupError):
            process.kill()
        process.wait(timeout=8)

    def run(
        self,
        job: WorkerJob,
        *,
        timeout_seconds: int,
        cancel_event: threading.Event,
    ) -> WorkerExecution:
        self.log_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = self.log_dir / f"{job.id}.stdout.log"
        stderr_path = self.log_dir / f"{job.id}.stderr.log"
        with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
            try:
                process = subprocess.Popen(
                    list(job.command),
                    stdout=stdout,
                    stderr=stderr,
                    **self._creation_options(),
                )
            except OSError as exc:
                raise WorkerExecutionError(
                    f"Cannot start {job.id}: {exc}. Run the portfolio under the "
                    "pinned Sage environment or pass --worker-python explicitly."
                ) from exc
            remaining = timeout_seconds
            while process.poll() is None and remaining > 0 and not cancel_event.wait(1):
                remaining -= 1
            if process.poll() is None:
                cancelled = cancel_event.is_set()
                self._terminate_group(process)
                return WorkerExecution(
                    return_code=process.returncode or -1,
                    cancelled=cancelled,
                    timed_out=not cancelled,
                )
            return WorkerExecution(return_code=int(process.returncode))


class ContentAddressedStore:
    """Thread-safe store with a hard byte cap and digest verification."""

    def __init__(self, root: Path, module_root: Path, maximum_bytes: int) -> None:
        self.root = root
        self.module_root = module_root
        self.maximum_bytes = maximum_bytes
        self._lock = threading.Lock()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.module_root / "packed").mkdir(parents=True, exist_ok=True)
        existing = [path for path in self.root.rglob("*") if path.is_file()]
        existing.extend(path for path in self.module_root.rglob("*") if path.is_file())
        self._bytes = sum(path.stat().st_size for path in set(existing))
        if self._bytes > self.maximum_bytes:
            raise PortfolioBudgetExceeded(
                f"Existing object store uses {self._bytes} bytes, above the "
                f"{self.maximum_bytes}-byte cap."
            )

    @property
    def stored_bytes(self) -> int:
        with self._lock:
            return self._bytes

    def _copy_verified(
        self,
        source: Path,
        destination: Path,
        expected_sha256: str,
        expected_bytes: int | None = None,
    ) -> Path:
        expected = require_sha256(expected_sha256, "object sha256")
        size = source.stat().st_size
        if expected_bytes is not None and size != expected_bytes:
            raise StaleArtifactError(
                f"{source} has {size} bytes; expected {expected_bytes}."
            )
        if sha256_file(source) != expected:
            raise StaleArtifactError(f"{source} does not match its SHA-256 digest.")
        with self._lock:
            if destination.is_file():
                if (
                    destination.stat().st_size != size
                    or sha256_file(destination) != expected
                ):
                    raise StaleArtifactError(
                        f"Content-addressed object {destination} is corrupt."
                    )
                return destination
            if self._bytes + size > self.maximum_bytes:
                raise PortfolioBudgetExceeded(
                    "Persisting every exact module requires "
                    f"{self._bytes + size} bytes, above the "
                    f"{self.maximum_bytes}-byte cap. No module was dropped."
                )
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
            shutil.copyfile(source, temporary)
            os.replace(temporary, destination)
            self._bytes += size
        return destination

    def put_artifact(self, source: Path) -> tuple[str, Path]:
        digest = sha256_file(source)
        destination = self.root / digest[:2] / f"{digest}.json"
        return digest, self._copy_verified(source, destination, digest)

    def put_json(
        self, value: Mapping[str, Any], suffix: str = ".json"
    ) -> tuple[str, Path]:
        encoded = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
        digest = sha256_bytes(encoded)
        destination = self.root / digest[:2] / f"{digest}{suffix}"
        with self._lock:
            if destination.is_file():
                if destination.read_bytes() != encoded:
                    raise StaleArtifactError(
                        f"Content-addressed JSON object {destination} is corrupt."
                    )
                return digest, destination
            if self._bytes + len(encoded) > self.maximum_bytes:
                raise PortfolioBudgetExceeded(
                    "Writing the portfolio object would exceed max_object_bytes."
                )
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
            temporary.write_bytes(encoded)
            os.replace(temporary, destination)
            self._bytes += len(encoded)
        return digest, destination

    def put_packed(
        self, source: Path, descriptor: Mapping[str, Any]
    ) -> tuple[str, Path]:
        digest = require_sha256(descriptor.get("sha256"), "packed rows sha256")
        destination = self.module_root / "packed" / f"{digest}.permutations.bin"
        return digest, self._copy_verified(
            source,
            destination,
            digest,
            int(descriptor["byteLength"]),
        )


def worker_artifact_hash(artifact: Mapping[str, Any]) -> str:
    body = copy.deepcopy(dict(artifact))
    supplied = require_sha256(body.pop("artifactHash", None), "artifactHash")
    actual = sha256_json(body)
    if supplied != actual:
        raise StaleArtifactError(
            f"Worker artifactHash is stale: expected {supplied}, computed {actual}."
        )
    return supplied


def worker_command(
    config: PortfolioConfig, prime: int, output_path: Path
) -> tuple[str, ...]:
    command = [
        str(config.worker_python),
        str(config.worker_script),
        "--input",
        str(config.input_path),
        "--output",
        str(output_path),
        "--cache-dir",
        str(config.cache_dir),
        "--prime",
        str(prime),
        "--max-index",
        str(config.max_index),
        "--max-modules",
        str(config.max_modules),
        "--max-subgroups",
        str(config.max_subgroups),
        "--memory-bytes",
        str(config.max_action_bytes),
        "--module-cache-bytes",
        str(config.module_cache_bytes),
        "--timeout",
        str(config.worker_timeout),
        "--recognition",
        "required",
        "--recognition-timeout",
        str(config.recognition_timeout),
        "--materialization",
        "deferred",
        "--resume",
    ]
    if config.research_gap is not None:
        command.extend(("--research-gap", str(config.research_gap)))
    if config.research_gap_manifest is not None:
        command.extend(("--research-gap-manifest", str(config.research_gap_manifest)))
    structural_certificates = {
        3: config.mod3_structural_certificate,
        5: config.mod5_structural_certificate,
        7: config.mod7_structural_certificate,
        11: config.mod11_structural_certificate,
    }
    structural_certificate = structural_certificates.get(prime)
    if structural_certificate is not None and structural_certificate.is_file():
        command.extend(
            ("--structural-certificate", str(structural_certificate))
        )
    return tuple(command)


def build_plan(config: PortfolioConfig) -> dict[str, Any]:
    input_text = config.input_path.read_text(encoding="utf-8")
    input_hash = sha256_bytes(input_text.encode("utf-8"))
    implementation = {
        "orchestratorSha256": sha256_file(Path(__file__)),
        "finiteImageWorkerSha256": sha256_file(config.worker_script),
        "packedSolverSha256": sha256_file(config.solver_script),
        "moduleCatalogueSha256": sha256_file(
            SCRIPT_DIR / "finite_image_module_catalogue.py"
        ),
        "fiberingCliSha256": (
            sha256_file(config.fibering_script)
            if config.fibering_script.is_file()
            else None
        ),
        "fiberingPipelineSha256": sha256_file(
            REPOSITORY_ROOT / "src" / "fibering" / "materializedActionPipeline.ts"
        ),
        "dependencyLockSha256": sha256_file(REPOSITORY_ROOT / "pnpm-lock.yaml"),
    }
    structural_certificate_paths = {
        3: config.mod3_structural_certificate,
        5: config.mod5_structural_certificate,
        7: config.mod7_structural_certificate,
        11: config.mod11_structural_certificate,
    }
    structural_certificates = {
        str(prime): (
            {"status": "available", "sha256": sha256_file(path)}
            if path is not None and path.is_file()
            else {"status": "absent", "sha256": None}
        )
        for prime, path in structural_certificate_paths.items()
    }
    scientific_config = {
        "inputSha256": input_hash,
        "primes": list(REQUIRED_PRIMES),
        "mod2SeedRequired": True,
        "mod3StructuralCertificate": structural_certificates["3"],
        "structuralCertificatesByCharacteristic": structural_certificates,
        "residuePolicy": "all-prime-ideals-emitted-by-existing-sage-backend",
        "maxIndex": config.max_index,
        "maxModulesPerImage": config.max_modules,
        "maxSubgroupsPerImage": config.max_subgroups,
        "maxActionBytes": config.max_action_bytes,
        "moduleCacheBytes": config.module_cache_bytes,
        "solver": {
            "maxBytes": config.solver_max_bytes,
            "maxMappedBytes": config.solver_max_mapped_bytes,
            "maxCombinations": config.solver_max_combinations,
            "maxFactors": config.solver_max_factors,
            "maxDegree": config.solver_max_degree,
            "maxCartesianPoints": config.solver_max_cartesian_points,
            "checkpointInterval": config.solver_checkpoint_interval,
        },
        "fullDavisPromotion": {
            "enabled": config.run_fibering_pipeline,
            "maxInputBytes": config.fibering_max_input_bytes,
            "exactWallLimit": config.fibering_exact_wall_limit,
            "maxCandidates": config.fibering_max_candidates,
            "timeBudgetMs": config.fibering_time_budget_ms,
        },
        "implementation": implementation,
    }
    run_key = sha256_json(scientific_config)
    staging = config.output_dir / "staging"
    jobs: list[WorkerJob] = []
    for prime in SCHEDULED_PRIMES:
        job_kind = (
            "required-mod2-partial-module-seed"
            if prime == MOD2_SEED_PRIME
            else "exact-residue-search"
        )
        job_body = {"runKey": run_key, "prime": prime, "kind": job_kind}
        job_hash = sha256_json(job_body)
        output_path = staging / f"{job_hash}.json"
        jobs.append(
            WorkerJob(
                id=f"residue-p{prime}-{job_hash[:12]}",
                prime=prime,
                resource_class="memory-heavy-recognition",
                output_path=output_path,
                command=worker_command(config, prime, output_path),
                job_sha256=job_hash,
            )
        )
    return {
        "runKey": run_key,
        "inputSha256": input_hash,
        "scientificConfig": scientific_config,
        "jobs": jobs,
    }


def fresh_checkpoint(plan: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": CHECKPOINT_TYPE,
        "orchestratorVersion": ORCHESTRATOR_VERSION,
        "runKey": plan["runKey"],
        "inputSha256": plan["inputSha256"],
        "jobs": {
            job.id: {
                "jobSha256": job.job_sha256,
                "prime": job.prime,
                "resourceClass": job.resource_class,
                "status": "pending",
            }
            for job in plan["jobs"]
        },
        "seedArtifacts": {},
        "solver": {"status": "pending"},
    }


def load_checkpoint(
    path: Path, plan: Mapping[str, Any], resume: bool
) -> dict[str, Any]:
    if not resume or not path.is_file():
        return fresh_checkpoint(plan)
    checkpoint = read_json_object(path)
    expected = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": CHECKPOINT_TYPE,
        "orchestratorVersion": ORCHESTRATOR_VERSION,
        "runKey": plan["runKey"],
        "inputSha256": plan["inputSha256"],
    }
    mismatches = [
        key for key, value in expected.items() if checkpoint.get(key) != value
    ]
    expected_jobs = {job.id: job for job in plan["jobs"]}
    if set(checkpoint.get("jobs", {})) != set(expected_jobs):
        mismatches.append("jobs")
    else:
        for job_id, job in expected_jobs.items():
            if checkpoint["jobs"][job_id].get("jobSha256") != job.job_sha256:
                mismatches.append(f"jobs.{job_id}.jobSha256")
    if mismatches:
        raise StaleCheckpointError(
            "Refusing stale portfolio checkpoint; mismatched " + ", ".join(mismatches)
        )
    for record in checkpoint["jobs"].values():
        if record.get("status") == "running":
            record["status"] = "pending"
    return checkpoint


def _attempt_summary(attempt: Mapping[str, Any]) -> dict[str, Any]:
    recognition = attempt.get("structuralRecognition")
    source = attempt.get("source")
    return {
        "candidateId": attempt.get("candidateId"),
        "status": attempt.get("status"),
        "reason": attempt.get("reason"),
        "rationalPrime": attempt.get("rationalPrime"),
        "sourceKind": attempt.get(
            "sourceKind", source.get("kind") if isinstance(source, Mapping) else None
        ),
        "sourceHash": attempt.get("sourceHash"),
        "primeIdealNorm": attempt.get("primeIdealNorm", attempt.get("idealNorm")),
        "residueDegree": attempt.get("residueDegree"),
        "residueFieldOrder": attempt.get("residueFieldOrder"),
        "relationChecksPassed": all(
            bool(check.get("passed")) for check in attempt.get("relationChecks", [])
        ),
        "sphericalChecksPassed": all(
            bool(check.get("injective"))
            for check in attempt.get("sphericalRestrictionChecks", [])
        ),
        "recognitionStatus": recognition.get("status")
        if isinstance(recognition, Mapping)
        else "not-run",
        "recognitionActionSha256": (
            recognition.get("actionHash") if isinstance(recognition, Mapping) else None
        ),
        "recognitionManifestSha256": (
            recognition.get("manifestHash")
            if isinstance(recognition, Mapping)
            else None
        ),
    }


def _metadata_if_present(raw: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = raw.get(key)
        if value not in (None, {}, []):
            return copy.deepcopy(value)
    return None


def _screening_record(
    artifact: Mapping[str, Any], attempt: Mapping[str, Any]
) -> Mapping[str, Any] | None:
    attempt_search = attempt.get("subgroupSearch")
    if isinstance(attempt_search, Mapping):
        return attempt_search
    search = artifact.get("search")
    if isinstance(search, Mapping) and str(search.get("candidateId")) == str(
        attempt.get("candidateId")
    ):
        return search
    return None


def validate_degree_compatibility_obstruction(
    artifact: Mapping[str, Any],
    attempt: Mapping[str, Any],
    *,
    expected_max_index: int,
    witness_summary: Mapping[str, Any],
) -> dict[str, Any] | None:
    """Validate a complete no-useful-factor result for characteristic three."""

    if int(attempt.get("rationalPrime", 0)) != 3:
        return None
    screen = _screening_record(artifact, attempt)
    if not isinstance(screen, Mapping) or screen.get("reason") not in {
        "recognized-index-obstruction",
        "matrix-only-recognized-index-obstruction",
    }:
        return None
    if (
        screen.get("complete") is not True
        or screen.get("terminal") is not True
        or screen.get("indexScreeningComplete") is not True
    ):
        raise StaleArtifactError(
            "A mod-3 recognized-index obstruction is marked incomplete."
        )
    bounds = artifact.get("bounds")
    if not isinstance(bounds, Mapping):
        raise StaleArtifactError("The mod-3 obstruction has no search bounds.")
    maximum = int(bounds.get("maxIndex", bounds.get("maxActionDegree", 0)))
    if maximum != expected_max_index:
        raise StaleArtifactError(
            "The mod-3 obstruction covers a different maximum action degree."
        )
    lower_bound = int(
        bounds.get("lowerBoundDivisor") or witness_summary.get("lowerBound") or 0
    )
    if lower_bound <= 0:
        raise StaleArtifactError(
            "The mod-3 obstruction has no exact spherical divisibility bound."
        )
    targets = list(range(lower_bound, maximum + 1, lower_bound))
    decisions = screen.get("targetIndexDecisions")
    if not isinstance(decisions, list):
        raise StaleArtifactError("The mod-3 target-index decisions are missing.")
    normalized_decisions = [
        {"target": int(item.get("target", 0)), "decision": item.get("decision")}
        for item in decisions
        if isinstance(item, Mapping)
    ]
    if normalized_decisions != [
        {"target": target, "decision": "ruled-out"} for target in targets
    ]:
        raise StaleArtifactError(
            "The mod-3 obstruction does not rule out every current target degree."
        )
    factor_screen = screen.get("partialModuleDegreeScreen")
    if (
        not isinstance(factor_screen, Mapping)
        or factor_screen.get("complete") is not True
        or factor_screen.get("compatibleDegrees") != []
    ):
        raise StaleArtifactError(
            "The mod-3 obstruction lacks a complete no-compatible-factor screen."
        )
    natural_degrees = factor_screen.get("naturalOrbitDegrees", [])
    if not isinstance(natural_degrees, list) or any(
        isinstance(value, bool) or not isinstance(value, int) or value <= 1
        for value in natural_degrees
    ):
        raise StaleArtifactError("The mod-3 natural orbit degrees are malformed.")
    if any(target % degree == 0 for degree in natural_degrees for target in targets):
        raise StaleArtifactError(
            "A declared incompatible mod-3 factor actually divides a target degree."
        )
    structural = attempt.get("structuralRecognition")
    bridge = attempt.get("recognitionBridge")
    if not isinstance(structural, dict) or not isinstance(bridge, Mapping):
        raise StaleArtifactError(
            "The mod-3 obstruction lacks structural recognition metadata."
        )
    action_hash = require_sha256(bridge.get("actionHash"), "recognition actionHash")
    manifest_hash = require_sha256(
        bridge.get("manifestHash"), "recognition manifestHash"
    )
    if structural.get("actionHash") != action_hash:
        raise StaleArtifactError(
            "The mod-3 structural certificate has a stale action hash."
        )
    try:
        recognition.validate_screening_certificate(
            structural,
            expected_action_hash=action_hash,
            expected_manifest_hash=manifest_hash,
        )
    except ValueError as exc:
        raise StaleArtifactError(
            f"The mod-3 structural certificate is invalid: {exc}"
        ) from exc
    if structural.get("screening", {}).get("complete") is not True:
        raise StaleArtifactError("The mod-3 structural screening is incomplete.")
    if any(
        recognition.screening_decision(structural, target) != "ruled-out"
        for target in targets
    ):
        raise StaleArtifactError(
            "The structural certificate disagrees with the target ledger."
        )
    if not recognition.no_compatible_transitive_factor(structural, targets):
        raise StaleArtifactError(
            "The structural certificate does not prove factor incompatibility."
        )
    record: dict[str, Any] = {
        "kind": "complete-recognized-index-and-factor-obstruction",
        "characteristic": 3,
        "candidateId": attempt.get("candidateId"),
        "sourceResidue": _attempt_summary(attempt),
        "inputSha256": artifact.get("inputHash"),
        "matrixSha256": artifact.get("matrixDigest"),
        "witnessSha256": witness_summary.get("witnessSha256"),
        "recognitionActionSha256": action_hash,
        "toolchainManifestSha256": manifest_hash,
        "finiteImageOrder": screen.get(
            "finiteImageOrder",
            structural.get("recognition", {}).get("finiteImageOrder"),
        ),
        "targetRange": {
            "lowerBoundDivisor": lower_bound,
            "maximumDegree": maximum,
            "targetCount": len(targets),
            "targetsSha256": sha256_json(targets),
        },
        "targetIndexDecisions": copy.deepcopy(normalized_decisions),
        "partialModuleDegreeScreen": copy.deepcopy(factor_screen),
        "structuralRecognition": copy.deepcopy(structural),
        "recognitionBridge": copy.deepcopy(bridge),
        "complete": True,
        "claims": [
            "no useful characteristic-3 transitive factor in the current target range"
        ],
        "nonClaims": [
            "no characteristic-3 factor beyond the recorded range",
            "global nonexistence of a torsion-free cover",
        ],
    }
    record["obstructionSha256"] = sha256_json(record)
    return record


def rebuild_catalogue_from_search_modules(
    artifact: Mapping[str, Any],
    *,
    expected_input_hash: str,
    matrix_hash: str,
    witness_summary: Mapping[str, Any],
    store: ContentAddressedStore,
) -> dict[str, Any] | None:
    """Recover exact checkpoint modules when catalogue sealing was interrupted.

    This is not a permissive importer.  Every row blob, source-image transfer
    hash, witness id, relation check, and subgroup fingerprint must still be
    present.  The rebuilt catalogue retains the worker's original completeness
    flag and therefore cannot turn a bounded partial search into a completeness
    claim.
    """

    search = artifact.get("search")
    if not isinstance(search, Mapping):
        return None
    raw_modules = [
        item for item in search.get("modules", []) if isinstance(item, Mapping)
    ]
    if not raw_modules:
        return None
    candidate_id = str(search.get("candidateId", "")).strip()
    finite_image_order = search.get("finiteImageOrder")
    attempts = [
        item
        for item in artifact.get("residueAttempts", [])
        if isinstance(item, Mapping) and str(item.get("candidateId")) == candidate_id
    ]
    if len(attempts) != 1:
        raise StaleArtifactError(
            "Exact search modules cannot be bound to one residue attempt."
        )
    attempt = attempts[0]
    bridge = attempt.get("recognitionBridge")
    structural_recognition = attempt.get("structuralRecognition")
    image_hash = bridge.get("actionHash") if isinstance(bridge, Mapping) else None
    try:
        image_hash = require_sha256(image_hash, "recognition actionHash")
        image_order = int(finite_image_order)
        characteristic = int(attempt["rationalPrime"])
    except (KeyError, TypeError, ValueError) as exc:
        raise StaleArtifactError(
            "Exact search modules lack finite-image recognition metadata."
        ) from exc
    witness_ids = list(witness_summary["witnessIds"])
    witness_index = {identifier: index for index, identifier in enumerate(witness_ids)}
    if not witness_summary["complete"]:
        raise StaleArtifactError(
            "Exact search modules lack a complete spherical witness catalogue."
        )
    finite_image = module_catalogue.build_finite_image_record(
        image_id=candidate_id,
        characteristic=characteristic,
        finite_image_sha256=image_hash,
        order=image_order,
        origin={
            "kind": "recovered-exact-congruence-image",
            "recognitionActionSha256": image_hash,
            "sourceHash": attempt.get("sourceHash", image_hash),
            "residueFieldOrder": attempt.get("residueFieldOrder"),
            "structuralRecognitionStatus": (
                structural_recognition.get("status", "unknown")
                if isinstance(structural_recognition, Mapping)
                else "unknown"
            ),
        },
    )
    modules: list[dict[str, Any]] = []
    source_generator_count = len(artifact.get("sourceSystem", {}).get("generators", []))
    if source_generator_count <= 0:
        raise StaleArtifactError("Recovered modules have no source generator order.")
    for raw in raw_modules:
        packed = raw.get("packedPermutationRows")
        if not isinstance(packed, Mapping):
            raise StaleArtifactError(
                "An exact search module is missing packed permutation rows."
            )
        source = Path(str(packed.get("path", "")))
        descriptor = module_catalogue.build_packed_row_descriptor(
            degree=int(packed["degree"]),
            generator_count=int(packed["generatorCount"]),
            packed_sha256=str(packed["sha256"]),
            byte_length=int(packed["byteLength"]),
            source_generator_order=packed.get("sourceGeneratorOrder"),
        )
        if descriptor["generatorCount"] != source_generator_count:
            raise StaleArtifactError(
                "Recovered module generator count disagrees with the source system."
            )
        store.put_packed(source, descriptor)
        covered_ids = [str(value) for value in raw.get("coveredWitnessIds", [])]
        if any(identifier not in witness_index for identifier in covered_ids):
            raise StaleArtifactError(
                "Recovered module refers to a stale torsion witness id."
            )
        relation_checks = raw.get("relationChecks", [])
        if (
            not raw.get("transitive")
            or not relation_checks
            or not all(bool(check.get("passed")) for check in relation_checks)
        ):
            raise StaleArtifactError(
                "Recovered module did not pass transitivity and Coxeter relations."
            )
        coverage = module_catalogue.build_fixed_point_coverage(
            [witness_index[identifier] for identifier in covered_ids],
            len(witness_ids),
            str(witness_summary["witnessSha256"]),
        )
        if raw.get("status") == "passed":
            spherical_orbits = raw.get("sphericalOrbitChecks", [])
            if not spherical_orbits or not all(
                bool(check.get("free")) for check in spherical_orbits
            ):
                raise StaleArtifactError(
                    "A recovered torsion-free module lacks its spherical orbit checks."
                )
        modules.append(
            module_catalogue.build_module_record(
                source_sha256=expected_input_hash,
                matrix_sha256=matrix_hash,
                witness_sha256=str(witness_summary["witnessSha256"]),
                finite_image_sha256=image_hash,
                finite_image_id=candidate_id,
                characteristic=characteristic,
                degree=int(raw["degree"]),
                origin={
                    "kind": "recovered-exact-coset-action",
                    "candidateOrigin": copy.deepcopy(
                        raw.get("origin", {"kind": "subgroup-search"})
                    ),
                },
                subgroup_fingerprint=str(raw["subgroupFingerprint"]),
                packed_rows=descriptor,
                fixed_point_coverage=coverage,
                status=("torsion-free" if raw.get("status") == "passed" else "partial"),
            )
        )
    return module_catalogue.build_catalogue(
        source_sha256=expected_input_hash,
        matrix_sha256=matrix_hash,
        witness_sha256=str(witness_summary["witnessSha256"]),
        witness_count=len(witness_ids),
        source_generator_count=source_generator_count,
        finite_images=[finite_image],
        modules=modules,
        scope={
            "kind": "recovered-bounded-finite-image-subgroup-search",
            "candidateId": candidate_id,
            "terminalReason": search.get("reason"),
            "recoveredAfterCatalogueSealFailure": True,
        },
        complete=bool(search.get("complete")),
        max_unique_packed_bytes=store.maximum_bytes,
    )


def derive_residue_search_completion(
    artifact: Mapping[str, Any], *, expected_max_index: int
) -> dict[str, Any]:
    """Derive bounded completion from residue records, not a summary boolean."""

    bounds = artifact.get("bounds")
    attempts = [
        item
        for item in artifact.get("residueAttempts", [])
        if isinstance(item, Mapping)
    ]
    reasons: list[str] = []
    if (
        not isinstance(bounds, Mapping)
        or int(bounds.get("maxIndex", 0)) != expected_max_index
    ):
        reasons.append("worker bounds do not match the scheduled maximum index")
    if artifact.get("ok") is not True or artifact.get("errors") not in ([], None):
        reasons.append("worker reported an error")
    if not attempts:
        reasons.append("declared residue catalogue is empty")

    source_records: list[dict[str, Any]] = []
    terminal_records: list[dict[str, Any]] = []
    seen_candidates: set[str] = set()
    for attempt in attempts:
        candidate_id = str(attempt.get("candidateId", "")).strip()
        prime = int(attempt.get("rationalPrime", 0))
        source_record = {
            "candidateId": candidate_id,
            "rationalPrime": prime,
            "coefficientModel": attempt.get("coefficientModel"),
            "primeIdeal": attempt.get("primeIdeal"),
            "primeIdealNorm": attempt.get("primeIdealNorm"),
            "residueDegree": attempt.get("residueDegree"),
            "residueFieldOrder": attempt.get("residueFieldOrder"),
        }
        source_record["sourceSha256"] = sha256_json(source_record)
        source_records.append(source_record)
        record_reasons: list[str] = []
        if not candidate_id or candidate_id in seen_candidates or prime <= 1:
            record_reasons.append("candidate identity is missing or duplicated")
        seen_candidates.add(candidate_id)
        status = attempt.get("status")
        reason = attempt.get("reason")
        terminal = False
        if status == "rejected":
            if reason == "relation-failure":
                terminal = isinstance(attempt.get("detail"), str) and bool(
                    str(attempt.get("detail")).strip()
                )
            elif reason == "spherical-restriction-not-injective":
                relation_checks = attempt.get("relationChecks")
                spherical_checks = attempt.get("sphericalRestrictionChecks")
                terminal = (
                    isinstance(relation_checks, list)
                    and bool(relation_checks)
                    and all(
                        isinstance(check, Mapping) and check.get("passed") is True
                        for check in relation_checks
                    )
                    and isinstance(spherical_checks, list)
                    and bool(spherical_checks)
                    and any(
                        isinstance(check, Mapping) and check.get("injective") is False
                        for check in spherical_checks
                    )
                )
            if not terminal:
                record_reasons.append("rejected residue lacks exact terminal evidence")
        elif status == "accepted":
            relation_checks = attempt.get("relationChecks")
            spherical_checks = attempt.get("sphericalRestrictionChecks")
            if not (
                isinstance(relation_checks, list)
                and bool(relation_checks)
                and all(
                    isinstance(check, Mapping) and check.get("passed") is True
                    for check in relation_checks
                )
            ):
                record_reasons.append("accepted residue lacks exact relation checks")
            if not (
                isinstance(spherical_checks, list)
                and bool(spherical_checks)
                and all(
                    isinstance(check, Mapping) and check.get("injective") is True
                    for check in spherical_checks
                )
            ):
                record_reasons.append(
                    "accepted residue lacks exact spherical-injectivity checks"
                )
            screen = _screening_record(artifact, attempt)
            if isinstance(screen, Mapping):
                search_reason = str(screen.get("reason", ""))
                terminal = (
                    screen.get("complete") is True
                    and search_reason not in {"probe-only", "catalogue-only"}
                    and any(
                        screen.get(key) is True
                        for key in (
                            "terminal",
                            "frontierExhausted",
                            "minimumProved",
                            "indexScreeningComplete",
                        )
                    )
                )
                modules = screen.get("modules", [])
                if modules not in (None, []) and not (
                    isinstance(modules, list)
                    and all(
                        isinstance(module, Mapping)
                        and module.get("transitive") is True
                        and isinstance(module.get("subgroupFingerprint"), str)
                        and bool(module.get("subgroupFingerprint"))
                        and isinstance(module.get("relationChecks"), list)
                        and bool(module.get("relationChecks"))
                        and all(
                            isinstance(check, Mapping) and check.get("passed") is True
                            for check in module.get("relationChecks", [])
                        )
                        for module in modules
                    )
                ):
                    terminal = False
                    record_reasons.append(
                        "declared partial modules lack exact terminal records"
                    )
            if not terminal:
                record_reasons.append("accepted residue search is not terminal")
        else:
            record_reasons.append("residue status is neither accepted nor rejected")
        terminal_records.append(
            {
                "candidateId": candidate_id,
                "status": status,
                "terminal": terminal and not record_reasons,
                "reasons": record_reasons,
            }
        )

    declared_complete = False
    if source_records:
        models = {record["coefficientModel"] for record in source_records}
        primes = {record["rationalPrime"] for record in source_records}
        if models == {"integral-standard-tits"}:
            only = source_records[0]
            prime = int(only["rationalPrime"])
            declared_complete = (
                len(source_records) == 1
                and len(primes) == 1
                and only["candidateId"] == f"GF({prime})"
                and only["residueFieldOrder"] == prime
                and only["primeIdeal"] is None
            )
        elif models == {"cyclotomic-standard-tits"} and len(primes) == 1:
            prime = next(iter(primes))
            expected_prefix = f"p{prime}-ideal"
            ordinals: list[int] = []
            declared_complete = True
            for record in source_records:
                try:
                    ordinal_text = (
                        str(record["candidateId"])
                        .removeprefix(expected_prefix)
                        .split("-q", 1)[0]
                    )
                    ordinals.append(int(ordinal_text))
                except (TypeError, ValueError):
                    declared_complete = False
                try:
                    residue_degree = int(record["residueDegree"])
                    residue_order = int(record["residueFieldOrder"])
                    ideal_norm = int(record["primeIdealNorm"])
                    declared_complete = declared_complete and (
                        record["primeIdeal"] is not None
                        and residue_degree > 0
                        and residue_order == prime**residue_degree
                        and ideal_norm == residue_order
                        and str(record["candidateId"]).endswith(f"-q{residue_order}")
                    )
                except (TypeError, ValueError):
                    declared_complete = False
            declared_complete = declared_complete and sorted(ordinals) == list(
                range(len(source_records))
            )
        if not declared_complete:
            reasons.append("declared residue/prime-ideal catalogue is malformed")

    reported = artifact.get("searchCompleteness")
    examined = (
        reported.get("residueCandidatesExamined")
        if isinstance(reported, Mapping)
        else None
    )
    if examined is not None and int(examined) != len(source_records):
        reasons.append("reported residue count disagrees with the declared catalogue")
    if any(not record["terminal"] for record in terminal_records):
        reasons.append("one or more declared residue searches are nonterminal")
    catalogue_hash = sha256_json(source_records)
    spherical_catalogue = artifact.get("sphericalCatalogue")
    implementation = (
        spherical_catalogue.get("implementationSha256")
        if isinstance(spherical_catalogue, Mapping)
        else None
    )
    if implementation is None:
        reasons.append("worker artifact omits its implementation hash")
    else:
        require_sha256(implementation, "worker implementationSha256")
    return {
        "complete": not reasons and declared_complete,
        "maximumIndex": expected_max_index,
        "declaredResidueCatalogueSha256": catalogue_hash,
        "declaredResidueCount": len(source_records),
        "declaredRationalPrimes": sorted(
            {int(record["rationalPrime"]) for record in source_records}
        ),
        "sourceRecords": source_records,
        "terminalRecords": terminal_records,
        "artifactDeclaredImplementationSha256": implementation,
        "reasons": reasons,
    }


def ingest_artifact(
    artifact_path: Path,
    *,
    expected_input_hash: str,
    expected_max_index: int,
    store: ContentAddressedStore,
) -> dict[str, Any]:
    """Validate one worker artifact and retain every exact module it contains."""

    artifact = read_json_object(artifact_path)
    if artifact.get("artifactType") != "coxeter-finite-image-search":
        raise StaleArtifactError(
            f"{artifact_path} is not a finite-image search artifact."
        )
    artifact_hash = worker_artifact_hash(artifact)
    if artifact.get("inputHash") != expected_input_hash:
        raise StaleArtifactError(
            f"{artifact_path} belongs to a different source input hash."
        )
    byte_hash, stored_artifact = store.put_artifact(artifact_path)
    matrix_hash = require_sha256(artifact.get("matrixDigest"), "matrixDigest")
    attempts = [
        item
        for item in artifact.get("residueAttempts", [])
        if isinstance(item, Mapping)
    ]
    attempts_by_id = {str(item.get("candidateId")): item for item in attempts}
    witness_summary = _witness_catalogue_summary(artifact)
    degree_obstructions = [
        obstruction
        for item in attempts
        if (
            obstruction := validate_degree_compatibility_obstruction(
                artifact,
                item,
                expected_max_index=expected_max_index,
                witness_summary=witness_summary,
            )
        )
        is not None
    ]
    raw_modules = {
        str(item.get("subgroupFingerprint")): item
        for item in artifact.get("search", {}).get("modules", [])
        if isinstance(item, Mapping) and item.get("subgroupFingerprint")
    }
    result: dict[str, Any] = {
        "artifactSha256": byte_hash,
        "workerArtifactHash": artifact_hash,
        "artifactObject": relative_posix(stored_artifact, store.module_root.parent),
        "status": artifact.get("status"),
        "ok": artifact.get("ok") is True,
        "inputSha256": expected_input_hash,
        "matrixSha256": matrix_hash,
        "residueAttempts": [_attempt_summary(item) for item in attempts],
        "searchCompleteness": copy.deepcopy(artifact.get("searchCompleteness", {})),
        "derivedResidueCompletion": derive_residue_search_completion(
            artifact, expected_max_index=expected_max_index
        ),
        "modules": [],
        "finiteImages": [],
        "catalogueComplete": False,
        "degreeCompatibilityObstructions": degree_obstructions,
    }
    catalogue_raw = artifact.get("partialModuleCatalogue")
    if catalogue_raw is None:
        catalogue_raw = rebuild_catalogue_from_search_modules(
            artifact,
            expected_input_hash=expected_input_hash,
            matrix_hash=matrix_hash,
            witness_summary=witness_summary,
            store=store,
        )
        if catalogue_raw is None:
            result["witnessCatalogue"] = witness_summary
            return result
    if not isinstance(catalogue_raw, Mapping):
        raise StaleArtifactError("partialModuleCatalogue must be an object.")
    expected_hashes = {
        "sourceSha256": expected_input_hash,
        "matrixSha256": matrix_hash,
        "witnessSha256": witness_summary["witnessSha256"],
    }
    try:
        catalogue = module_catalogue.validate_catalogue(
            catalogue_raw,
            expected_hashes=expected_hashes,
            require_complete=False,
            max_unique_packed_bytes=store.maximum_bytes,
        )
    except module_catalogue.CatalogueError as exc:
        raise StaleArtifactError(f"Invalid partial module catalogue: {exc}") from exc
    storage_root_value = artifact.get("partialModuleCatalogueStorageRoot")
    storage_root = (
        Path(storage_root_value)
        if isinstance(storage_root_value, str) and storage_root_value
        else store.module_root
    )
    finite_by_hash = {item["sha256"]: item for item in catalogue["finiteImages"]}
    module_summaries: list[dict[str, Any]] = []
    for module in catalogue["modules"]:
        descriptor = module["packedPermutationRows"]
        try:
            packed_source = module_catalogue.verify_packed_rows_file(
                descriptor, storage_root
            )
        except module_catalogue.CatalogueError as exc:
            raise StaleArtifactError(f"Invalid packed module rows: {exc}") from exc
        _digest, packed_destination = store.put_packed(packed_source, descriptor)
        per_generator_hashes = generator_row_hashes(packed_destination, descriptor)
        coverage_indexes = module_catalogue.coverage_indexes(
            module["fixedPointCoverage"], witness_summary["witnessSha256"]
        )
        witness_ids = witness_summary["witnessIds"]
        raw = raw_modules.get(str(module["subgroupFingerprint"]), {})
        image = finite_by_hash[module["inputHashes"]["finiteImageSha256"]]
        attempt = attempts_by_id.get(str(image["id"]), {})
        origin = copy.deepcopy(module["origin"])
        candidate_origin = (
            origin.get("candidateOrigin", {}) if isinstance(origin, Mapping) else {}
        )
        stabilizer = _metadata_if_present(
            raw,
            "stabilizerMetadata",
            "subgroupGeneratorWords",
        )
        if stabilizer is None and isinstance(candidate_origin, Mapping):
            stabilizer = _metadata_if_present(
                candidate_origin,
                "stabilizerMetadata",
                "stabilizer",
                "subgroupGeneratorWords",
            )
        double_coset = _metadata_if_present(raw, "doubleCosetMetadata")
        if double_coset is None and isinstance(candidate_origin, Mapping):
            double_coset = _metadata_if_present(
                candidate_origin, "doubleCosetMetadata", "doubleCoset"
            )
        module_summaries.append(
            {
                "id": module["id"],
                "moduleSha256": module["moduleSha256"],
                "status": module["status"],
                "degree": module["degree"],
                "finiteImageId": image["id"],
                "finiteImageSha256": image["sha256"],
                "sourceImage": copy.deepcopy(image),
                "sourceResidue": _attempt_summary(attempt),
                "origin": origin,
                "subgroupFingerprint": module["subgroupFingerprint"],
                "stabilizerMetadata": stabilizer,
                "doubleCosetMetadata": double_coset,
                "generatorPermutationHashes": {
                    "aggregateSha256": descriptor["sha256"],
                    "perGenerator": per_generator_hashes,
                },
                "packedPermutationRows": {
                    **copy.deepcopy(descriptor),
                    "portfolioPath": relative_posix(
                        packed_destination, store.module_root
                    ),
                },
                "exactWitnessCoverage": {
                    **copy.deepcopy(module["fixedPointCoverage"]),
                    "coveredWitnessIds": [
                        witness_ids[index] for index in coverage_indexes
                    ],
                },
                "sphericalChecks": copy.deepcopy(
                    raw.get(
                        "sphericalOrbitChecks",
                        attempt.get("sphericalRestrictionChecks", []),
                    )
                ),
                "recognitionStatus": attempt.get("structuralRecognition", {}).get(
                    "status", "unknown"
                )
                if isinstance(attempt, Mapping)
                else "unknown",
                "exactChecks": copy.deepcopy(module["exactChecks"]),
                "completeness": {
                    "moduleChecksComplete": True,
                    "witnessCatalogueComplete": witness_summary["complete"],
                    "componentCatalogueComplete": catalogue["complete"],
                    "subgroupSearchComplete": bool(
                        artifact.get("search", {}).get("complete")
                    ),
                },
            }
        )
    result.update(
        {
            "catalogueSha256": catalogue["catalogueSha256"],
            "catalogueComplete": catalogue["complete"],
            "witnessCatalogue": witness_summary,
            "modules": module_summaries,
            "finiteImages": copy.deepcopy(catalogue["finiteImages"]),
            "sourceGeneratorCount": catalogue["sourceGeneratorCount"],
            "catalogue": copy.deepcopy(catalogue),
        }
    )
    return result


def _witness_catalogue_summary(artifact: Mapping[str, Any]) -> dict[str, Any]:
    spherical = artifact.get("sphericalCatalogue")
    witnesses = artifact.get("torsionWitnesses")
    if not isinstance(spherical, Mapping) or not isinstance(witnesses, list):
        return {
            "complete": False,
            "witnessSha256": None,
            "witnessCount": 0,
            "witnessIds": [],
            "witnesses": [],
            "lowerBound": None,
        }
    witness_hash = require_sha256(spherical.get("witnessDigest"), "witnessDigest")
    count = int(spherical.get("witnessCount", -1))
    ids = [str(item.get("id")) for item in witnesses if isinstance(item, Mapping)]
    complete = (
        count > 0
        and len(ids) == count
        and all(identifier for identifier in ids)
        and sha256_json(witnesses) == witness_hash
    )
    return {
        "complete": complete,
        "witnessSha256": witness_hash,
        "witnessCount": count,
        "witnessIds": ids,
        "witnesses": copy.deepcopy(witnesses),
        "lowerBound": spherical.get("indexDivisibilityLowerBound"),
    }


def _load_ingestion_object(
    path: Path, expected_run_key: str, expected_sha256: str
) -> dict[str, Any]:
    if sha256_file(path) != require_sha256(
        expected_sha256, "checkpoint ingestionSha256"
    ):
        raise StaleCheckpointError("A completed ingestion object changed on disk.")
    value = read_json_object(path)
    if value.get("runKey") != expected_run_key or not isinstance(
        value.get("ingestion"), Mapping
    ):
        raise StaleCheckpointError("A completed ingestion object is stale.")
    return dict(value["ingestion"])


def _compatibility_reference(ingestions: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    catalogued = [item for item in ingestions if item.get("catalogueSha256")]
    if not catalogued:
        raise PortfolioError("No exact partial modules were emitted by the portfolio.")
    first = catalogued[0]
    witness = first["witnessCatalogue"]
    reference = {
        "sourceSha256": first["inputSha256"],
        "matrixSha256": first["matrixSha256"],
        "witnessSha256": witness["witnessSha256"],
        "witnessCount": witness["witnessCount"],
        "sourceGeneratorCount": first["sourceGeneratorCount"],
    }
    for item in catalogued[1:]:
        current_witness = item["witnessCatalogue"]
        current = {
            "sourceSha256": item["inputSha256"],
            "matrixSha256": item["matrixSha256"],
            "witnessSha256": current_witness["witnessSha256"],
            "witnessCount": current_witness["witnessCount"],
            "sourceGeneratorCount": item["sourceGeneratorCount"],
        }
        mismatches = [key for key, value in reference.items() if current[key] != value]
        if mismatches:
            raise StaleArtifactError(
                "Refusing incompatible module catalogues; mismatched "
                + ", ".join(mismatches)
            )
    if not witness["complete"]:
        raise StaleArtifactError(
            "The spherical torsion-witness catalogue is incomplete."
        )
    return reference


def require_composite_characteristics(
    ingestions: Sequence[Mapping[str, Any]],
) -> None:
    """Require mod-2 rows and a conclusive mod-3 contribution.

    A degree ledger is not a module catalogue: it has no generator rows for the
    packed solver. Characteristic three is different: a complete recognized
    index/factor obstruction is itself the useful result for the current degree
    range, so no artificial permutation rows should be constructed.
    """

    characteristics = {
        int(module["sourceImage"]["characteristic"])
        for ingestion in ingestions
        for module in ingestion.get("modules", [])
        if isinstance(module, Mapping)
        and isinstance(module.get("sourceImage"), Mapping)
        and module["sourceImage"].get("characteristic") is not None
    }
    mod3_obstructions = [
        obstruction
        for ingestion in ingestions
        for obstruction in ingestion.get("degreeCompatibilityObstructions", [])
        if isinstance(obstruction, Mapping)
        and obstruction.get("characteristic") == 3
        and obstruction.get("complete") is True
    ]
    if 2 in characteristics and (3 in characteristics or mod3_obstructions):
        return
    details: list[str] = []
    if 2 not in characteristics:
        details.append(
            "characteristic 2 needs a generated finite-image worker artifact "
            "containing partialModuleCatalogue and packed permutation rows; "
            "the checked degree ledger alone is not a module seed"
        )
    if 3 not in characteristics and not mod3_obstructions:
        details.append(
            "characteristic 3 needs either an exact packed partial action or a "
            "hash-bound complete recognized-index/factor obstruction for the "
            "current target range"
        )
    raise MissingRequiredModuleError(
        "Cannot start the mod-2/mod-3 composite portfolio: " + "; ".join(details)
    )


def summarize_worker_portfolio_completeness(
    ingestions: Sequence[Mapping[str, Any]],
    *,
    expected_bindings: Mapping[int, Mapping[str, Any]],
) -> dict[str, Any]:
    """Decide whether every scheduled residue search ended conclusively.

    A successful process exit is not a mathematical completion statement.  In
    particular, an odd-prime worker may emit useful partial modules before a
    timeout.  Such modules remain in the portfolio, but they cannot support a
    `complete-no-survivor` result.
    """

    rows: list[dict[str, Any]] = []
    all_complete = True
    for prime in SCHEDULED_PRIMES:
        records = [item for item in ingestions if item.get("scheduledPrime") == prime]
        reasons: list[str] = []
        complete = len(records) == 1
        if len(records) != 1:
            reasons.append(
                f"expected one scheduled characteristic-{prime} artifact; found {len(records)}"
            )
        if records:
            record = records[0]
            derived = record.get("derivedResidueCompletion")
            execution = record.get("scheduledExecution")
            expected_execution = expected_bindings.get(prime)
            if record.get("ok") is not True:
                complete = False
                reasons.append("worker artifact did not pass its exact checks")
            if not isinstance(derived, Mapping) or derived.get("complete") is not True:
                complete = False
                reasons.append("derived residue search is incomplete")
                if isinstance(derived, Mapping):
                    reasons.extend(str(value) for value in derived.get("reasons", []))
            elif derived.get("declaredRationalPrimes") != [prime]:
                complete = False
                reasons.append("declared residue catalogue targets another prime")
            if (
                not isinstance(execution, Mapping)
                or not isinstance(expected_execution, Mapping)
                or execution != expected_execution
            ):
                complete = False
                reasons.append("worker execution/implementation binding is stale")
            elif (
                execution.get("returnCode") != 0
                or execution.get("timedOut") is not False
                or execution.get("cancelled") is not False
            ):
                complete = False
                reasons.append("worker process did not terminate successfully")
            declared_implementation = (
                derived.get("artifactDeclaredImplementationSha256")
                if isinstance(derived, Mapping)
                else None
            )
            if (
                not isinstance(declared_implementation, str)
                or not isinstance(expected_execution, Mapping)
                or declared_implementation
                != expected_execution.get("workerImplementationSha256")
            ):
                complete = False
                reasons.append("artifact and invoked worker source hashes disagree")
            if record.get("modules") and record.get("catalogueComplete") is not True:
                complete = False
                reasons.append("emitted module catalogue is partial")
        rows.append(
            {
                "characteristic": prime,
                "complete": complete,
                "artifactCount": len(records),
                "reasons": reasons,
            }
        )
        all_complete = all_complete and complete
    return {
        "complete": all_complete,
        "requiredCharacteristics": list(SCHEDULED_PRIMES),
        "characteristics": rows,
    }


def expected_scheduled_worker_bindings(
    *,
    plan: Mapping[str, Any],
    checkpoint: Mapping[str, Any],
) -> dict[int, dict[str, Any]]:
    worker_hash = plan["scientificConfig"]["implementation"]["finiteImageWorkerSha256"]
    bindings: dict[int, dict[str, Any]] = {}
    for job in plan["jobs"]:
        record = checkpoint["jobs"][job.id]
        bindings[job.prime] = {
            "runKey": plan["runKey"],
            "jobId": job.id,
            "jobSha256": job.job_sha256,
            "workerImplementationSha256": worker_hash,
            "returnCode": int(record.get("returnCode", -1)),
            "timedOut": bool(record.get("timedOut", False)),
            "cancelled": bool(record.get("cancelled", False)),
        }
    return bindings


def merge_ingestions(
    ingestions: Sequence[Mapping[str, Any]],
    *,
    store: ContentAddressedStore,
    maximum_bytes: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Merge compatible exact records without claiming enumeration completeness."""

    reference = _compatibility_reference(ingestions)
    degree_obstructions = sorted(
        [
            copy.deepcopy(obstruction)
            for item in ingestions
            for obstruction in item.get("degreeCompatibilityObstructions", [])
            if isinstance(obstruction, Mapping)
        ],
        key=lambda item: str(item.get("obstructionSha256")),
    )
    for obstruction in degree_obstructions:
        if (
            obstruction.get("inputSha256") != reference["sourceSha256"]
            or obstruction.get("matrixSha256") != reference["matrixSha256"]
            or obstruction.get("witnessSha256") != reference["witnessSha256"]
        ):
            raise StaleArtifactError(
                "A degree-compatibility obstruction is incompatible with the "
                "merged module catalogue."
            )
    catalogued = [item for item in ingestions if item.get("catalogueSha256")]
    finite_images = [
        image
        for item in catalogued
        for image in item.get("catalogue", {}).get("finiteImages", [])
    ]
    modules = [
        module
        for item in catalogued
        for module in item.get("catalogue", {}).get("modules", [])
    ]
    complete = all(bool(item.get("catalogueComplete")) for item in catalogued)
    merged = module_catalogue.build_catalogue(
        source_sha256=reference["sourceSha256"],
        matrix_sha256=reference["matrixSha256"],
        witness_sha256=reference["witnessSha256"],
        witness_count=reference["witnessCount"],
        source_generator_count=reference["sourceGeneratorCount"],
        finite_images=finite_images,
        modules=modules,
        scope={
            "kind": "residue-module-portfolio",
            "componentCatalogues": sorted(
                str(item["catalogueSha256"]) for item in catalogued
            ),
            "rationalPrimes": list(REQUIRED_PRIMES),
            "requiredMod2ModuleSeed": True,
        },
        complete=complete,
        max_unique_packed_bytes=maximum_bytes,
    )
    catalogue_path = store.module_root / "catalogue.json"
    atomic_write_json(catalogue_path, merged)
    rich_by_hash: dict[str, list[dict[str, Any]]] = {}
    for item in catalogued:
        for module in item.get("modules", []):
            rich_by_hash.setdefault(str(module["moduleSha256"]), []).append(
                copy.deepcopy(module)
            )
    module_index: list[dict[str, Any]] = []
    for module in merged["modules"]:
        records = rich_by_hash.get(str(module["moduleSha256"]), [])
        if not records:
            raise StaleArtifactError(
                f"Merged module {module['id']} lost its portfolio metadata."
            )
        records.sort(
            key=lambda item: (
                str(item["finiteImageSha256"]),
                str(item["subgroupFingerprint"]),
            )
        )
        primary = records[0]
        primary["provenanceRecords"] = [
            {
                "finiteImageId": item["finiteImageId"],
                "finiteImageSha256": item["finiteImageSha256"],
                "sourceResidue": item["sourceResidue"],
                "origin": item["origin"],
                "subgroupFingerprint": item["subgroupFingerprint"],
                "recognitionStatus": item["recognitionStatus"],
            }
            for item in records
        ]
        primary["catalogueProvenance"] = copy.deepcopy(module["provenance"])
        module_index.append(primary)
    return merged, {
        "reference": reference,
        "complete": complete,
        "catalogueSha256": merged["catalogueSha256"],
        "cataloguePath": relative_posix(catalogue_path, store.module_root.parent),
        "componentCatalogueSha256": sorted(
            str(item["catalogueSha256"]) for item in catalogued
        ),
        "degreeCompatibilityObstructions": degree_obstructions,
        "modules": sorted(
            module_index,
            key=lambda item: (int(item["degree"]), str(item["moduleSha256"])),
        ),
    }


def build_solver_problem(
    merged: Mapping[str, Any],
    merged_summary: Mapping[str, Any],
    ingestions: Sequence[Mapping[str, Any]],
    *,
    problem_path: Path,
    module_root: Path,
    run_key: str,
    solver_source_sha256: str,
    solver_bounds: Mapping[str, int],
) -> dict[str, Any]:
    reference_ingestion = next(
        item for item in ingestions if item.get("catalogueSha256")
    )
    witness = reference_ingestion["witnessCatalogue"]
    source_artifact_path = module_root.parent / str(
        reference_ingestion["artifactObject"]
    )
    if sha256_file(source_artifact_path) != reference_ingestion["artifactSha256"]:
        raise StaleArtifactError("A content-addressed worker artifact changed on disk.")
    source_artifact = read_json_object(source_artifact_path)
    matrix = source_artifact.get("sourceSystem", {}).get("coxeterMatrix")
    if not isinstance(matrix, list):
        raise StaleArtifactError("The source Coxeter matrix is missing.")
    modules: list[dict[str, Any]] = []
    for module in merged["modules"]:
        descriptor = module["packedPermutationRows"]
        packed_path = module_root.joinpath(
            *PurePosixPath(descriptor["storageKey"]).parts
        )
        if not packed_path.is_file():
            raise StaleArtifactError(
                f"Merged module spool is missing: {descriptor['storageKey']}"
            )
        modules.append(
            {
                "id": module["id"],
                "degree": module["degree"],
                "actions": {
                    "path": relative_posix(packed_path, problem_path.parent),
                    "encoding": descriptor["encoding"],
                    "degree": descriptor["degree"],
                    "generatorCount": descriptor["generatorCount"],
                    "sha256": descriptor["sha256"],
                },
                "moduleSha256": module["moduleSha256"],
                "fixedPointCoverage": copy.deepcopy(module["fixedPointCoverage"]),
            }
        )
    modules.sort(key=lambda item: (int(item["degree"]), str(item["id"])))
    return {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": "packed-composite-portfolio-problem",
        "catalogueSha256": merged_summary["catalogueSha256"],
        "hashes": copy.deepcopy(merged_summary["reference"]),
        "witnessCatalogue": {
            "complete": True,
            "sha256": witness["witnessSha256"],
            "witnesses": copy.deepcopy(witness["witnesses"]),
        },
        "lowerBound": int(witness["lowerBound"]),
        "coxeterMatrix": copy.deepcopy(matrix),
        "modules": modules,
        "scope": {
            "allBoundedDiagonalOrbits": True,
            "twoFactorDecomposition": "all-double-coset-orbits",
            "factorPolicy": "nondecreasing-module-multisets-with-repetition",
            "moduleCatalogueComplete": merged_summary["complete"],
        },
        "executionBinding": {
            "runKey": run_key,
            "solver": {
                "id": SOLVER_ID,
                "version": SOLVER_VERSION,
                "sourceSha256": require_sha256(
                    solver_source_sha256, "solver sourceSha256"
                ),
            },
            "bounds": dict(solver_bounds),
        },
    }


def solver_bound_record(config: PortfolioConfig) -> dict[str, int]:
    return {
        "maxBytes": config.solver_max_bytes,
        "maxMappedBytes": config.solver_max_mapped_bytes,
        "maxCombinations": config.solver_max_combinations,
        "maxFactors": config.solver_max_factors,
        "maxDegree": config.solver_max_degree,
        "maxCartesianPoints": config.solver_max_cartesian_points,
        "checkpointInterval": config.solver_checkpoint_interval,
    }


def solver_command(
    config: PortfolioConfig,
    input_path: Path,
    output_path: Path,
    checkpoint_path: Path,
    materialize_action_path: Path | None = None,
) -> tuple[str, ...]:
    bounds = solver_bound_record(config)
    command = [
        str(config.solver_python),
        str(config.solver_script),
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--checkpoint",
        str(checkpoint_path),
        "--max-bytes",
        str(bounds["maxBytes"]),
        "--max-mapped-bytes",
        str(bounds["maxMappedBytes"]),
        "--max-combinations",
        str(bounds["maxCombinations"]),
        "--max-factors",
        str(bounds["maxFactors"]),
        "--max-degree",
        str(bounds["maxDegree"]),
        "--max-cartesian-points",
        str(bounds["maxCartesianPoints"]),
        "--checkpoint-interval",
        str(bounds["checkpointInterval"]),
    ]
    if config.resume and checkpoint_path.is_file():
        command.append("--resume")
    if materialize_action_path is not None:
        command.extend(("--materialize-action", str(materialize_action_path)))
    return tuple(command)


def validate_solver_result(
    summary: Mapping[str, Any],
    *,
    execution: WorkerExecution,
    problem: Mapping[str, Any],
    problem_path: Path,
    result_path: Path,
    materialized_action_path: Path | None,
    config: PortfolioConfig,
    run_key: str,
    phase: str,
) -> bool:
    """Validate every terminal solver result, including no-survivor results."""

    if execution.timed_out or execution.cancelled:
        raise StaleArtifactError(
            "A timed-out or cancelled composite run cannot supply a result."
        )
    solver_hash = sha256_file(config.solver_script)
    if summary.get("schemaVersion") != 2:
        raise StaleArtifactError("Composite result schema is stale.")
    if summary.get("solver") != {
        "id": SOLVER_ID,
        "version": SOLVER_VERSION,
    }:
        raise StaleArtifactError("Composite result came from an unexpected solver.")
    sealed = copy.deepcopy(dict(summary))
    result_hash = require_sha256(sealed.pop("resultSha256", None), "resultSha256")
    if sha256_json(sealed) != result_hash:
        raise StaleArtifactError("Composite result seal does not match its contents.")
    require_sha256(summary.get("problemSha256"), "solver problemSha256")

    candidate = summary.get("candidate")
    search_complete = summary.get("searchComplete")
    status = summary.get("status")
    valid_terminal = {
        "candidate-found": (True, True, 0),
        "candidate-found-incomplete": (True, False, 0),
        "exhausted-within-bounds": (False, True, 2),
        "incomplete": (False, False, 2),
    }
    if status not in valid_terminal:
        raise StaleArtifactError("Composite result has an unknown terminal status.")
    has_candidate, expected_complete, expected_code = valid_terminal[str(status)]
    expected_binding = {
        "runKey": run_key,
        "phase": phase,
        "problemArtifactSha256": sha256_json(problem),
        "problemPath": str(problem_path.resolve()),
        "resultPath": str(result_path.resolve()),
        "materializedActionPath": (
            str(materialized_action_path.resolve())
            if materialized_action_path is not None
            else None
        ),
        "solver": {
            "id": SOLVER_ID,
            "version": SOLVER_VERSION,
            "sourceSha256": solver_hash,
        },
        "bounds": solver_bound_record(config),
        "terminalStatus": status,
        "searchComplete": expected_complete,
        "hasCandidate": has_candidate,
        "expectedReturnCode": expected_code,
    }
    if summary.get("executionBinding") != expected_binding:
        raise StaleArtifactError("Composite result execution binding is stale.")
    if (
        search_complete is not expected_complete
        or execution.return_code != expected_code
    ):
        raise StaleArtifactError(
            "Composite status, completeness flag, and return code disagree."
        )
    if has_candidate != isinstance(candidate, Mapping):
        raise StaleArtifactError("Composite status and candidate payload disagree.")
    if not has_candidate:
        if candidate is not None:
            raise StaleArtifactError("A no-survivor result retained a candidate.")
        return False

    assert isinstance(candidate, Mapping)
    modules = problem.get("modules")
    if not isinstance(modules, list):
        raise StaleArtifactError("Composite problem has no module list.")
    indices = candidate.get("moduleIndices")
    ids = candidate.get("moduleIds")
    if (
        not isinstance(indices, list)
        or not indices
        or indices != sorted(indices)
        or not isinstance(ids, list)
        or len(ids) != len(indices)
        or any(
            isinstance(index, bool)
            or not isinstance(index, int)
            or index < 0
            or index >= len(modules)
            for index in indices
        )
        or ids != [str(modules[index]["id"]) for index in indices]
        or int(candidate.get("degree", 0)) <= 0
        or candidate.get("actionMaterialized") is not False
    ):
        raise StaleArtifactError("Composite candidate failed the survivor gate.")
    representative = candidate.get("representativeTuple")
    if not isinstance(representative, list) or len(representative) != len(indices):
        raise StaleArtifactError("Composite candidate representative is malformed.")
    cartesian = math.prod(int(modules[index]["degree"]) for index in indices)
    if int(str(candidate.get("cartesianDegree", 0))) != cartesian:
        raise StaleArtifactError("Composite candidate Cartesian degree is stale.")
    return True


def validate_solver_survivor(summary: Mapping[str, Any], module_ids: set[str]) -> bool:
    """Legacy candidate-only check retained for external callers.

    Portfolio execution uses :func:`validate_solver_result`, which also binds
    no-survivor results to the exact run.  This helper intentionally cannot
    support a completeness claim.
    """

    candidate = summary.get("candidate")
    if not isinstance(candidate, Mapping):
        return False
    ids = candidate.get("moduleIds")
    if not isinstance(ids, list) or any(str(value) not in module_ids for value in ids):
        raise StaleArtifactError("Composite candidate refers to an unknown module.")
    return True


def build_materialization_request(
    *,
    run_key: str,
    solver_summary: Mapping[str, Any],
    solver_artifact_sha256: str,
    merged_summary: Mapping[str, Any],
) -> dict[str, Any]:
    candidate = solver_summary["candidate"]
    request: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": MATERIALIZATION_REQUEST_TYPE,
        "status": "requested",
        "runKey": run_key,
        "catalogueSha256": merged_summary["catalogueSha256"],
        "matrixSha256": merged_summary["reference"]["matrixSha256"],
        "witnessSha256": merged_summary["reference"]["witnessSha256"],
        "solverArtifactSha256": solver_artifact_sha256,
        "problemSha256": solver_summary["problemSha256"],
        "candidate": copy.deepcopy(candidate),
        "gate": {
            "witnessFreeDiagonalOrbit": True,
            "allTorsionWitnessesChecked": True,
            "fullActionNotYetMaterialized": True,
        },
        "requiredNextChecks": [
            "stream complete generator permutations",
            "independently recheck Coxeter relations",
            "independently recheck fixed-point freeness",
            "independently certify regular spherical orbits",
        ],
        "claims": ["witness-free composite orbit candidate"],
        "nonClaims": [
            "materialized torsion-free action",
            "Davis quotient",
            "virtual algebraic fibering",
        ],
    }
    request["requestSha256"] = sha256_json(request)
    return request


def complete_materialization_request(
    request: Mapping[str, Any], materialized: Mapping[str, Any]
) -> dict[str, Any]:
    """Seal the survivor request with the independently verified action."""

    completed = copy.deepcopy(dict(request))
    completed.pop("requestSha256", None)
    completed["status"] = "fulfilled"
    completed["gate"] = {
        "witnessFreeDiagonalOrbit": True,
        "allTorsionWitnessesChecked": True,
        "fullActionMaterialized": True,
        "completeRowsIndependentlyVerified": True,
    }
    completed["materializedAction"] = {
        key: copy.deepcopy(materialized[key])
        for key in (
            "artifactSha256",
            "actionSha256",
            "candidateId",
            "degree",
            "generatorCount",
            "logicalPackedBytes",
        )
    }
    completed["requiredNextChecks"] = [
        "independently certify regular spherical orbits for promotion",
        "construct the full Davis quotient only after that promotion gate",
    ]
    completed["claims"] = [
        "witness-free composite orbit candidate",
        "materialized complete permutation rows",
        "independently verified Coxeter relations and witness freeness",
    ]
    completed["nonClaims"] = [
        "independent spherical-freeness promotion",
        "Davis quotient",
        "virtual algebraic fibering",
    ]
    completed["requestSha256"] = sha256_json(completed)
    return completed


def integer_width(bound: int) -> int:
    if bound <= 0xFFFF:
        return 2
    if bound <= 0xFFFFFFFF:
        return 4
    return 8


def materialized_action_byte_estimate(
    candidate: Mapping[str, Any], generator_count: int
) -> int:
    degree = int(candidate["degree"])
    cartesian_degree = int(str(candidate["cartesianDegree"]))
    return degree * generator_count * integer_width(
        degree - 1
    ) + degree * integer_width(cartesian_degree - 1)


def _array_little_endian_bytes(values: array) -> bytes:
    if sys.byteorder == "little" or values.itemsize == 1:
        return values.tobytes()
    copied = array(values.typecode, values)
    copied.byteswap()
    return copied.tobytes()


def _apply_word(rows: Sequence[Sequence[int]], word: Sequence[int], point: int) -> int:
    for generator in word:
        point = rows[generator][point]
    return point


def validate_materialized_action(
    path: Path,
    *,
    solver_summary: Mapping[str, Any],
    problem: Mapping[str, Any],
    max_action_bytes: int,
) -> dict[str, Any]:
    """Independently verify the solver's complete composite permutation rows."""

    artifact = read_json_object(path)
    if artifact.get("solver", {}).get("id") != SOLVER_ID:
        raise StaleArtifactError("Materialized action came from an unexpected solver.")
    if artifact.get("problemSha256") != solver_summary.get("problemSha256"):
        raise StaleArtifactError("Materialized action has a stale problem hash.")
    expected_candidate = solver_summary.get("candidate")
    candidate = artifact.get("candidate")
    if not isinstance(expected_candidate, Mapping) or not isinstance(
        candidate, Mapping
    ):
        raise StaleArtifactError("Materialized action is missing its candidate.")
    for field in (
        "id",
        "moduleIndices",
        "moduleIds",
        "representativeCode",
        "representativeTuple",
        "orbitIndex",
        "degree",
        "cartesianDegree",
        "decompositionKind",
    ):
        if candidate.get(field) != expected_candidate.get(field):
            raise StaleArtifactError(
                f"Materialized action candidate has a stale {field}."
            )
    if candidate.get("actionMaterialized") is not True:
        raise StaleArtifactError(
            "Solver did not mark the complete action materialized."
        )
    degree = int(candidate["degree"])
    matrix = problem.get("coxeterMatrix")
    rows = artifact.get("generatorActions")
    if not isinstance(matrix, list) or not isinstance(rows, list) or not rows:
        raise StaleArtifactError("Materialized action lacks matrix or generator rows.")
    rank = len(matrix)
    if len(rows) != rank:
        raise StaleArtifactError("Materialized action has the wrong generator count.")
    estimated_bytes = materialized_action_byte_estimate(candidate, rank)
    if estimated_bytes > max_action_bytes:
        raise PortfolioBudgetExceeded(
            f"Materialized action needs {estimated_bytes} packed bytes, above the "
            f"{max_action_bytes}-byte action cap."
        )
    typecode = "H" if degree - 1 <= 0xFFFF else "I" if degree - 1 <= 0xFFFFFFFF else "Q"
    normalized_rows: list[array] = []
    row_hashes: list[str] = []
    for generator, raw_row in enumerate(rows):
        if (
            not isinstance(raw_row, list)
            or len(raw_row) != degree
            or any(
                isinstance(value, bool) or not isinstance(value, int)
                for value in raw_row
            )
        ):
            raise StaleArtifactError(
                f"Materialized generator row {generator} is incomplete."
            )
        seen = bytearray(degree)
        for image in raw_row:
            if image < 0 or image >= degree or seen[image]:
                raise StaleArtifactError(
                    f"Materialized generator row {generator} is not a permutation."
                )
            seen[image] = 1
        if any(raw_row[raw_row[point]] != point for point in range(degree)):
            raise StaleArtifactError(
                f"Materialized generator row {generator} is not an involution."
            )
        row = array(typecode, raw_row)
        encoded = _array_little_endian_bytes(row)
        row_hashes.append(sha256_bytes(encoded))
        normalized_rows.append(row)
    if len(matrix) != rank or any(
        not isinstance(row, list) or len(row) != rank for row in matrix
    ):
        raise StaleArtifactError("Coxeter matrix rank is inconsistent.")
    for left in range(rank):
        for right in range(left + 1, rank):
            value = matrix[left][right]
            if value in (None, 0, "inf", "infinity", "Infinity"):
                continue
            exponent = int(value)
            for point in range(degree):
                image = point
                for _ in range(exponent):
                    image = normalized_rows[left][image]
                    image = normalized_rows[right][image]
                if image != point:
                    raise StaleArtifactError(
                        f"Materialized action fails relation ({left},{right})^{exponent}."
                    )
    witness_records = candidate.get("witnessChecks")
    expected_witnesses = problem.get("witnessCatalogue", {}).get("witnesses")
    if not isinstance(witness_records, list) or not isinstance(
        expected_witnesses, list
    ):
        raise StaleArtifactError("Materialized action lacks witness checks.")
    if [item.get("witnessId") for item in witness_records] != [
        item.get("id") for item in expected_witnesses
    ] or any(
        item.get("passed") is not True or int(item.get("fixedPointCount", -1)) != 0
        for item in witness_records
    ):
        raise StaleArtifactError(
            "Materialized action does not certify every torsion witness fixed-point-free."
        )
    for witness in expected_witnesses:
        word = witness.get("word")
        if not isinstance(word, list):
            raise StaleArtifactError("A torsion witness has no word.")
        if any(
            _apply_word(normalized_rows, word, point) == point
            for point in range(degree)
        ):
            raise StaleArtifactError(
                f"Independent witness check failed for {witness.get('id')}."
            )
    orbit_codes = artifact.get("orbitPointCodes")
    if (
        not isinstance(orbit_codes, list)
        or len(orbit_codes) != degree
        or any(
            isinstance(value, bool) or not isinstance(value, int) or value < 0
            for value in orbit_codes
        )
        or len(set(orbit_codes)) != degree
    ):
        raise StaleArtifactError("Materialized action has invalid orbit point codes.")
    cartesian_degree = int(str(candidate["cartesianDegree"]))
    if any(value >= cartesian_degree for value in orbit_codes):
        raise StaleArtifactError("An orbit point code leaves the Cartesian product.")
    digest = hashlib.sha256()
    digest.update(b"coxeter-materialized-composite-v1\0")
    digest.update(degree.to_bytes(8, "little"))
    digest.update(rank.to_bytes(4, "little"))
    for row in normalized_rows:
        digest.update(_array_little_endian_bytes(row))
    action_hash = digest.hexdigest()
    if candidate.get("actionSha256") != action_hash:
        raise StaleArtifactError("Materialized complete-row action hash is stale.")
    return {
        "artifactType": MATERIALIZED_ACTION_TYPE,
        "status": "verified",
        "problemSha256": artifact["problemSha256"],
        "candidateId": candidate["id"],
        "degree": degree,
        "generatorCount": rank,
        "logicalPackedBytes": estimated_bytes,
        "actionSha256": action_hash,
        "generatorPermutationSha256": row_hashes,
        "witnessCount": len(witness_records),
        "coxeterRelationsVerified": True,
        "fixedPointFreenessVerified": True,
        "completeRowsVerified": True,
    }


def assert_same_survivor(
    search_summary: Mapping[str, Any], materialization_summary: Mapping[str, Any]
) -> None:
    """Reject a materialization pass that resumed to a different candidate."""

    left = search_summary.get("candidate")
    right = materialization_summary.get("candidate")
    if not isinstance(left, Mapping) or not isinstance(right, Mapping):
        raise StaleArtifactError("Materialization lost the selected survivor.")
    fields = (
        "id",
        "moduleIndices",
        "moduleIds",
        "representativeCode",
        "representativeTuple",
        "orbitIndex",
        "degree",
        "cartesianDegree",
        "decompositionKind",
    )
    if any(left.get(field) != right.get(field) for field in fields):
        raise StaleArtifactError(
            "Materialization resumed to a different composite survivor."
        )


def resolve_fibering_runtime(config: PortfolioConfig) -> tuple[str, ...] | None:
    """Find a local TypeScript runtime without downloading anything.

    Long portfolio searches commonly run inside WSL or a research container.
    We therefore require an already installed Node runtime. A missing runtime
    leaves the promotion stage incomplete while preserving the verified action.
    """

    if config.fibering_runtime:
        return config.fibering_runtime
    if os.name == "nt":
        if shutil.which("corepack"):
            return ("cmd.exe", "/d", "/s", "/c", "corepack", "pnpm", "exec", "tsx")
        if shutil.which("pnpm"):
            return ("cmd.exe", "/d", "/s", "/c", "pnpm", "exec", "tsx")
        return None
    if shutil.which("node") is None:
        return None
    if shutil.which("corepack"):
        return ("corepack", "pnpm", "exec", "tsx")
    if shutil.which("pnpm"):
        return ("pnpm", "exec", "tsx")
    return None


def fibering_command(
    config: PortfolioConfig,
    *,
    materialized_action_path: Path,
    output_path: Path,
) -> tuple[str, ...] | None:
    runtime = resolve_fibering_runtime(config)
    if runtime is None:
        return None
    return (
        *runtime,
        str(config.fibering_script),
        "--system",
        str(config.input_path),
        "--action",
        str(materialized_action_path),
        "--output",
        str(output_path),
        "--max-input-bytes",
        str(config.fibering_max_input_bytes),
        "--max-action-degree",
        str(config.solver_max_degree),
        "--max-packed-action-bytes",
        str(config.max_action_bytes),
        "--exact-wall-limit",
        str(config.fibering_exact_wall_limit),
        "--max-candidates",
        str(config.fibering_max_candidates),
        "--time-budget-ms",
        str(config.fibering_time_budget_ms),
    )


def validate_fibering_promotion_artifact(
    path: Path,
    *,
    expected_source_system_sha256: str,
    materialized_action_path: Path,
    materialized_summary: Mapping[str, Any],
) -> dict[str, Any]:
    """Replay the promotion artifact's bindings before it enters the portfolio."""

    artifact = read_json_object(path)
    if (
        artifact.get("schemaVersion") != 2
        or artifact.get("kind") != FIBERING_PROMOTION_TYPE
    ):
        raise InvalidPromotionArtifactError(
            "The downstream result is not a materialized-action promotion artifact."
        )
    status = artifact.get("status")
    if status not in {"passed", "incomplete", "failed"}:
        raise InvalidPromotionArtifactError(
            f"The downstream promotion has an invalid status {status!r}."
        )
    hashes = artifact.get("hashes")
    source = artifact.get("source")
    stages = artifact.get("stages")
    implementation = artifact.get("implementation")
    if not isinstance(hashes, Mapping) or not isinstance(source, Mapping):
        raise InvalidPromotionArtifactError(
            "The downstream promotion is missing source/hash bindings."
        )
    if not isinstance(stages, list) or len(stages) != 6:
        raise InvalidPromotionArtifactError(
            "The downstream promotion does not report every scientific stage."
        )
    required_implementation_hashes = {
        "runner",
        "materializedActionPipeline",
        "fullDavisSearch",
        "fullDavisCertificate",
        "fullDavisMorse",
    }
    implementation_hashes = (
        implementation.get("hashes") if isinstance(implementation, Mapping) else None
    )
    implementation_manifest = (
        implementation.get("manifest") if isinstance(implementation, Mapping) else None
    )
    if (
        not isinstance(implementation, Mapping)
        or implementation.get("profile")
        != "materialized-action-two-track-promotion-v3"
        or not isinstance(implementation_hashes, Mapping)
        or set(implementation_hashes) != required_implementation_hashes
        or not isinstance(implementation_manifest, Mapping)
    ):
        raise InvalidPromotionArtifactError(
            "The downstream promotion omits its exact implementation manifest."
        )
    for name, digest in implementation_hashes.items():
        require_sha256(digest, f"promotion implementation hash {name}")
    manifest_without_hash = copy.deepcopy(dict(implementation_manifest))
    declared_manifest_hash = require_sha256(
        manifest_without_hash.pop("manifestSha256", None),
        "promotion implementation manifestSha256",
    )
    files = implementation_manifest.get("files")
    if (
        implementation_manifest.get("schemaVersion") != 1
        or implementation_manifest.get("kind")
        != "materialized-action-implementation-manifest"
        or implementation_manifest.get("hashAlgorithm") != "sha256"
        or not isinstance(files, list)
        or not files
    ):
        raise InvalidPromotionArtifactError(
            "The downstream implementation manifest header is invalid."
        )
    paths: list[str] = []
    file_hashes: dict[str, str] = {}
    for entry in files:
        if not isinstance(entry, Mapping) or not isinstance(entry.get("path"), str):
            raise InvalidPromotionArtifactError(
                "The implementation manifest contains a malformed file record."
            )
        path_name = str(entry["path"])
        if (
            not path_name
            or "\\" in path_name
            or path_name.startswith("/")
            or ".." in path_name.split("/")
        ):
            raise InvalidPromotionArtifactError(
                "The implementation manifest contains a noncanonical path."
            )
        file_hashes[path_name] = require_sha256(
            entry.get("sha256"), f"implementation file {path_name}"
        )
        paths.append(path_name)
    if paths != sorted(set(paths)):
        raise InvalidPromotionArtifactError(
            "Implementation manifest paths are duplicated or unsorted."
        )
    missing_paths = sorted(REQUIRED_PROMOTION_IMPLEMENTATION_PATHS - set(paths))
    if missing_paths:
        raise InvalidPromotionArtifactError(
            "The implementation manifest omits theorem-facing modules: "
            + ", ".join(missing_paths)
        )
    if implementation_manifest.get("sourceTreeMerkleSha256") != sha256_json(files):
        raise InvalidPromotionArtifactError(
            "The implementation source-tree Merkle hash is stale."
        )
    if declared_manifest_hash != sha256_json(manifest_without_hash):
        raise InvalidPromotionArtifactError(
            "The implementation manifest hash is stale."
        )
    legacy_paths = {
        "runner": "scripts/run_materialized_fibering.ts",
        "materializedActionPipeline": "src/fibering/materializedActionPipeline.ts",
        "fullDavisSearch": "src/fibering/fullDavisSearch.ts",
        "fullDavisCertificate": "src/fibering/fullDavisCertificate.ts",
        "fullDavisMorse": "src/fibering/fullDavisMorse.ts",
    }
    if any(
        implementation_hashes[name] != file_hashes.get(path_name)
        for name, path_name in legacy_paths.items()
    ):
        raise InvalidPromotionArtifactError(
            "The legacy implementation hashes disagree with the source-tree manifest."
        )
    declared_artifact_hash = require_sha256(
        hashes.get("artifactSha256"), "promotion artifactSha256"
    )
    unhashed = copy.deepcopy(artifact)
    unhashed_hashes = unhashed.get("hashes")
    if not isinstance(unhashed_hashes, dict):
        raise InvalidPromotionArtifactError("Promotion hashes are not mutable JSON.")
    unhashed_hashes.pop("artifactSha256", None)
    if sha256_json(unhashed) != declared_artifact_hash:
        raise InvalidPromotionArtifactError(
            "The downstream promotion artifact hash does not replay."
        )
    if hashes.get("sourceSystemArtifactSha256") != require_sha256(
        expected_source_system_sha256, "portfolio inputSha256"
    ):
        raise InvalidPromotionArtifactError(
            "The downstream promotion is bound to different source-system bytes."
        )
    if hashes.get("sourceActionArtifactSha256") != sha256_file(
        materialized_action_path
    ):
        raise InvalidPromotionArtifactError(
            "The downstream promotion is bound to different materialized-action bytes."
        )
    if hashes.get("materializedActionSha256") != materialized_summary.get(
        "actionSha256"
    ):
        raise InvalidPromotionArtifactError(
            "The downstream promotion replayed a different permutation action."
        )
    if source.get("candidateId") != materialized_summary.get("candidateId") or int(
        source.get("actionDegree", 0)
    ) != int(materialized_summary.get("degree", -1)):
        raise InvalidPromotionArtifactError(
            "The downstream promotion identifies a different survivor."
        )
    stage_statuses = {
        str(stage.get("id")): stage.get("status")
        for stage in stages
        if isinstance(stage, Mapping)
    }
    required_stages = {
        "materialized-action",
        "spherical-plan",
        "spherical-freeness",
        "quotient-2-skeleton",
        "lawful-subcomplex",
        "full-davis-fallback",
    }
    if set(stage_statuses) != required_stages or any(
        value not in {"passed", "incomplete", "failed", "not-run"}
        for value in stage_statuses.values()
    ):
        raise InvalidPromotionArtifactError(
            "The downstream promotion has missing, duplicate, or invalid stages."
        )
    claims = artifact.get("claims")
    if not isinstance(claims, list) or any(
        not isinstance(value, str) for value in claims
    ):
        raise InvalidPromotionArtifactError("Promotion claims must be a string list.")
    fibering_result = (
        artifact.get("fiberingCertificate", {})
        .get("result", {})
        .get("virtualAlgebraicFibration")
        if isinstance(artifact.get("fiberingCertificate"), Mapping)
        else None
    )
    full_cell_extension = (
        artifact.get("fiberingCertificate", {})
        .get("result", {})
        .get("wallCocycleExtendsAcrossEveryCoxeterCell")
        if isinstance(artifact.get("fiberingCertificate"), Mapping)
        else None
    )
    lawful_result = (
        artifact.get("lawfulCertificate", {})
        .get("lawful", {})
        .get("conclusion", {})
        .get("virtualAlgebraicFibrationCertified")
        if isinstance(artifact.get("lawfulCertificate"), Mapping)
        else None
    )
    if status != "passed" and (
        fibering_result is True
        or lawful_result is True
        or any("virtual algebraic fibration" in value.lower() for value in claims)
    ):
        raise InvalidPromotionArtifactError(
            "A non-passing promotion may not carry a virtual-fibering claim."
        )
    if status == "passed":
        common_stages = {
            "materialized-action",
            "spherical-plan",
            "spherical-freeness",
            "quotient-2-skeleton",
        }
        if any(stage_statuses[identifier] != "passed" for identifier in common_stages):
            raise InvalidPromotionArtifactError(
                "A passed promotion lacks a common action, torsion, or quotient stage."
            )
        torsion_certificate = artifact.get("torsionFreeCertificate")
        if (
            not isinstance(torsion_certificate, Mapping)
            or torsion_certificate.get("status") != "passed"
        ):
            raise InvalidPromotionArtifactError(
                "A passed promotion lacks a passed spherical-freeness certificate."
            )
        selected_track = artifact.get("selectedTrack")
        if artifact.get("promotionOutcome") != "certified":
            raise InvalidPromotionArtifactError(
                "A passed promotion is not recorded as certified."
            )
        if selected_track == "lawful-subcomplex":
            certificate = artifact.get("lawfulCertificate")
            replay = artifact.get("lawfulCertificateReplay")
            if (
                stage_statuses["lawful-subcomplex"] != "passed"
                or not isinstance(certificate, Mapping)
                or certificate.get("status") != "passed"
                or lawful_result is not True
                or not isinstance(replay, Mapping)
                or replay.get("valid") is not True
                or replay.get("mandatoryChecksPassed") is not True
                or replay.get("replayHash")
                != hashes.get("lawfulCertificateReplaySha256")
            ):
                raise InvalidPromotionArtifactError(
                    "A passed lawful promotion lacks its action-rooted certificate and replay."
                )
        elif selected_track == "full-davis":
            replay = artifact.get("fiberingCertificateReplay")
            if (
                stage_statuses["full-davis-fallback"] != "passed"
                or fibering_result is not True
                or full_cell_extension is not True
                or not isinstance(replay, Mapping)
                or replay.get("valid") is not True
                or replay.get("mandatoryStagesPassed") is not True
                or replay.get("replayHash")
                != hashes.get("fiberingCertificateReplaySha256")
            ):
                raise InvalidPromotionArtifactError(
                    "A passed full-Davis promotion lacks its complete certificate and replay."
                )
        else:
            raise InvalidPromotionArtifactError(
                "A passed promotion does not identify its successful certification track."
            )
    return artifact


def fibering_verifier_command(
    config: PortfolioConfig,
    *,
    artifact_path: Path,
    output_path: Path,
) -> tuple[str, ...] | None:
    """Build the independent verifier-only invocation for a promotion artifact."""

    runtime = resolve_fibering_runtime(config)
    if runtime is None:
        return None
    return (
        *runtime,
        str(config.fibering_script),
        "--verify-artifact",
        str(artifact_path),
        "--output",
        str(output_path),
        "--max-input-bytes",
        str(config.fibering_max_input_bytes),
    )


def validate_fibering_replay_report(
    report_path: Path,
    *,
    promotion_artifact: Mapping[str, Any],
) -> dict[str, Any]:
    """Validate the fresh verifier-only report rather than trusting nested JSON."""

    report = read_json_object(report_path)
    if (
        report.get("schemaVersion") != 2
        or report.get("kind") != "materialized-action-promotion-replay"
        or report.get("replayHashAlgorithm") != "sha256"
    ):
        raise InvalidPromotionArtifactError(
            "The verifier-only process returned an unsupported replay report."
        )
    declared_hash = require_sha256(report.get("replayHash"), "promotion replayHash")
    payload = copy.deepcopy(report)
    payload.pop("replayHash", None)
    if declared_hash != sha256_json(payload):
        raise InvalidPromotionArtifactError(
            "The verifier-only report hash does not replay."
        )
    if (
        report.get("valid") is not True
        or report.get("implementationManifestMatches") is not True
        or report.get("errors") != []
    ):
        raise InvalidPromotionArtifactError(
            "Independent verifier-only replay rejected the promotion artifact."
        )
    checked = report.get("checkedHashes")
    required = {"implementation-manifest", "implementation-files", "promotion-artifact"}
    if promotion_artifact.get("status") == "passed":
        if promotion_artifact.get("selectedTrack") == "lawful-subcomplex":
            required.update({"lawful-certificate", "lawful-replay"})
            if report.get("lawfulReplay") != promotion_artifact.get(
                "lawfulCertificateReplay"
            ):
                raise InvalidPromotionArtifactError(
                    "The fresh lawful replay differs from the stored replay report."
                )
        elif promotion_artifact.get("selectedTrack") == "full-davis":
            required.update({"fibering-certificate", "fibering-replay"})
            if report.get("fiberingReplay") != promotion_artifact.get(
                "fiberingCertificateReplay"
            ):
                raise InvalidPromotionArtifactError(
                    "The fresh full-Davis replay differs from the stored replay report."
                )
        else:
            raise InvalidPromotionArtifactError(
                "The passing promotion replay does not identify a selected track."
            )
    if not isinstance(checked, list) or not required.issubset(set(checked)):
        raise InvalidPromotionArtifactError(
            "The verifier-only report omits required replayed hashes."
        )
    return report


def run_fibering_promotion(
    config: PortfolioConfig,
    *,
    runner: JobRunner,
    cancel_event: threading.Event,
    materialized_action_path: Path,
    materialized_summary: Mapping[str, Any],
    store: ContentAddressedStore,
    run_key: str,
) -> tuple[dict[str, Any], WorkerExecution | None, Path | None]:
    """Promote one survivor, or record why the exact replay could not run."""

    promotion_dir = config.output_dir / "promotion"
    promotion_dir.mkdir(parents=True, exist_ok=True)
    output_path = promotion_dir / (
        f"full-davis-{materialized_summary['artifactSha256']}.json"
    )
    command = fibering_command(
        config,
        materialized_action_path=materialized_action_path,
        output_path=output_path,
    )
    if command is None:
        return (
            {
                "status": "incomplete-runner-unavailable",
                "invoked": False,
                "reason": (
                    "No installed Node/pnpm runtime can run the full-Davis promotion. "
                    "The materialized action remains available for replay in the "
                    "research container."
                ),
                "claims": [],
                "nonClaims": [
                    "independent spherical-freeness promotion",
                    "Davis quotient",
                    "virtual algebraic fibering",
                ],
            },
            None,
            None,
        )
    job = WorkerJob(
        id=f"full-davis-{materialized_summary['artifactSha256'][:12]}",
        prime=0,
        resource_class="materialized-action-two-track-promotion",
        output_path=output_path,
        command=command,
        job_sha256=sha256_json(
            {
                "runKey": run_key,
                "actionArtifactSha256": materialized_summary["artifactSha256"],
                "actionSha256": materialized_summary["actionSha256"],
                "command": list(command),
            }
        ),
    )
    execution = runner.run(
        job,
        timeout_seconds=config.fibering_timeout,
        cancel_event=cancel_event,
    )
    if not output_path.is_file():
        return (
            {
                "status": "incomplete-no-artifact",
                "invoked": True,
                "reason": (
                    "The full-Davis process ended without a result artifact; this "
                    "is an execution failure, not a mathematical rejection."
                ),
                "returnCode": execution.return_code,
                "timedOut": execution.timed_out,
                "cancelled": execution.cancelled,
                "claims": [],
                "nonClaims": [
                    "independent spherical-freeness promotion",
                    "Davis quotient",
                    "virtual algebraic fibering",
                ],
            },
            execution,
            None,
        )
    artifact = validate_fibering_promotion_artifact(
        output_path,
        expected_source_system_sha256=sha256_file(config.input_path),
        materialized_action_path=materialized_action_path,
        materialized_summary=materialized_summary,
    )
    expected_return_code = {"passed": 0, "failed": 1, "incomplete": 2}[
        artifact["status"]
    ]
    if execution.return_code != expected_return_code:
        raise InvalidPromotionArtifactError(
            "The promotion process return code disagrees with its result status."
        )
    replay_output_path = promotion_dir / (
        f"full-davis-{materialized_summary['artifactSha256']}.replay.json"
    )
    verifier_command = fibering_verifier_command(
        config,
        artifact_path=output_path,
        output_path=replay_output_path,
    )
    if verifier_command is None:
        raise InvalidPromotionArtifactError(
            "The promotion ran, but no runtime is available for independent replay."
        )
    verifier_job = WorkerJob(
        id=f"verify-full-davis-{materialized_summary['artifactSha256'][:12]}",
        prime=0,
        resource_class="materialized-action-full-davis-verifier",
        output_path=replay_output_path,
        command=verifier_command,
        job_sha256=sha256_json(
            {
                "runKey": run_key,
                "promotionArtifactSha256": sha256_file(output_path),
                "command": list(verifier_command),
            }
        ),
    )
    verifier_execution = runner.run(
        verifier_job,
        timeout_seconds=config.fibering_timeout,
        cancel_event=cancel_event,
    )
    if (
        verifier_execution.return_code != 0
        or verifier_execution.timed_out
        or verifier_execution.cancelled
        or not replay_output_path.is_file()
    ):
        raise InvalidPromotionArtifactError(
            "Independent verifier-only replay did not terminate successfully."
        )
    replay_report = validate_fibering_replay_report(
        replay_output_path,
        promotion_artifact=artifact,
    )
    byte_hash, stored_path = store.put_artifact(output_path)
    replay_byte_hash, replay_stored_path = store.put_artifact(replay_output_path)
    summary = {
        "status": artifact["status"],
        "invoked": True,
        "artifactSha256": byte_hash,
        "certificateSha256": artifact["hashes"]["artifactSha256"],
        "artifactObject": relative_posix(stored_path, config.output_dir),
        "returnCode": execution.return_code,
        "timedOut": execution.timed_out,
        "cancelled": execution.cancelled,
        "independentReplay": {
            "status": "passed",
            "artifactSha256": replay_byte_hash,
            "replaySha256": replay_report["replayHash"],
            "artifactObject": relative_posix(replay_stored_path, config.output_dir),
            "returnCode": verifier_execution.return_code,
        },
        "stages": copy.deepcopy(artifact["stages"]),
        "claims": copy.deepcopy(artifact.get("claims", [])),
        "nonClaims": copy.deepcopy(artifact.get("nonClaims", [])),
        "errors": copy.deepcopy(artifact.get("errors", [])),
        "warnings": copy.deepcopy(artifact.get("warnings", [])),
        "implementation": copy.deepcopy(artifact["implementation"]),
    }
    return summary, execution, stored_path


def _seed_key(path: Path, input_hash: str) -> str:
    return sha256_json(
        {
            "kind": "seed-finite-image-artifact",
            "inputSha256": input_hash,
            "sha256": sha256_file(path),
        }
    )


def _run_solver(
    config: PortfolioConfig,
    runner: JobRunner,
    cancel_event: threading.Event,
    problem_path: Path,
    checkpoint: dict[str, Any],
    *,
    materialize_action_path: Path | None = None,
) -> tuple[dict[str, Any], WorkerExecution, Path]:
    solver_dir = config.output_dir / "solver"
    solver_dir.mkdir(parents=True, exist_ok=True)
    problem = read_json_object(problem_path)
    problem_hash = sha256_json(problem)
    phase = "materialize" if materialize_action_path is not None else "search"
    execution_key = sha256_json(
        {
            "runKey": checkpoint["runKey"],
            "problemArtifactSha256": problem_hash,
            "solverSourceSha256": sha256_file(config.solver_script),
            "solverVersion": SOLVER_VERSION,
            "phase": phase,
            "bounds": solver_bound_record(config),
        }
    )
    output_path = solver_dir / f"{phase}-result-{execution_key}.json"
    checkpoint_path = solver_dir / f"checkpoint-{execution_key}.json"
    # A terminal result is never reused implicitly.  Checkpoints may resume,
    # but the current child must write a fresh, run-bound result seal.
    output_path.unlink(missing_ok=True)
    if materialize_action_path is not None:
        materialize_action_path.unlink(missing_ok=True)
    command = solver_command(
        config,
        problem_path,
        output_path,
        checkpoint_path,
        materialize_action_path,
    )
    job = WorkerJob(
        id=f"composite-{phase}-{problem_hash[:12]}",
        prime=0,
        resource_class="memory-heavy-composite-search",
        output_path=output_path,
        command=command,
        job_sha256=sha256_json(
            {
                "runKey": checkpoint["runKey"],
                "problem": problem_hash,
                "phase": phase,
            }
        ),
    )
    execution = runner.run(
        job,
        timeout_seconds=config.solver_timeout,
        cancel_event=cancel_event,
    )
    if not output_path.is_file():
        raise WorkerExecutionError("Packed composite solver produced no result JSON.")
    summary = read_json_object(output_path)
    validate_solver_result(
        summary,
        execution=execution,
        problem=problem,
        problem_path=problem_path,
        result_path=output_path,
        materialized_action_path=materialize_action_path,
        config=config,
        run_key=str(checkpoint["runKey"]),
        phase=phase,
    )
    return summary, execution, output_path


def run_portfolio(
    config: PortfolioConfig,
    *,
    worker_runner: JobRunner | None = None,
    solver_runner: JobRunner | None = None,
    promotion_runner: JobRunner | None = None,
) -> dict[str, Any]:
    """Run or resume the portfolio and return its sealed public manifest."""

    plan = build_plan(config)
    jobs: list[WorkerJob] = plan["jobs"]
    if config.dry_run:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "status": "dry-run",
            "runKey": plan["runKey"],
            "resourcePolicy": {
                "lightWorkers": config.light_workers,
                "heavyRecognitionWorkers": 1,
                "maxObjectBytes": config.max_object_bytes,
            },
            "jobs": [
                {
                    "id": job.id,
                    "prime": job.prime,
                    "resourceClass": job.resource_class,
                    "jobSha256": job.job_sha256,
                    "command": list(job.command),
                }
                for job in jobs
            ],
            "prerequisites": {
                "mod2PackedModuleSeed": "generated by the characteristic-2 job",
                "mod3Contribution": (
                    "validated packed modules or a complete hash-bound "
                    "recognized-index/factor obstruction"
                ),
                "degreeLedgerAcceptedAsModuleSeed": False,
                "fullDavisPromotion": (
                    "automatic after a materialized survivor"
                    if config.run_fibering_pipeline
                    else "explicitly disabled"
                ),
            },
            "seedArtifacts": [str(path) for path in config.seed_artifacts],
        }
    config.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = config.output_dir / "portfolio.checkpoint.json"
    checkpoint = load_checkpoint(checkpoint_path, plan, config.resume)
    atomic_write_json(checkpoint_path, checkpoint)
    store = ContentAddressedStore(
        config.output_dir / "objects" / "sha256",
        config.output_dir / "module-store",
        config.max_object_bytes,
    )
    worker_runner = worker_runner or SubprocessJobRunner(config.output_dir / "logs")
    solver_runner = solver_runner or SubprocessJobRunner(config.output_dir / "logs")
    promotion_runner = promotion_runner or SubprocessJobRunner(
        config.output_dir / "logs"
    )
    cancel_event = threading.Event()
    previous_handlers: dict[int, Any] = {}

    def request_cancel(_signum: int, _frame: Any) -> None:
        cancel_event.set()

    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous_handlers[signum] = signal.getsignal(signum)
            signal.signal(signum, request_cancel)

    ingestions: list[dict[str, Any]] = []
    ingestion_futures: dict[
        concurrent.futures.Future[dict[str, Any]], tuple[str, int | None, int | None]
    ] = {}
    light_executor = concurrent.futures.ThreadPoolExecutor(
        max_workers=config.light_workers,
        thread_name_prefix="portfolio-check",
    )
    try:
        for seed_path in sorted(config.seed_artifacts, key=lambda path: str(path)):
            key = _seed_key(seed_path, plan["inputSha256"])
            record = checkpoint["seedArtifacts"].get(key)
            if record and record.get("status") == "completed":
                object_path = config.output_dir / str(record["ingestionObject"])
                ingestions.append(
                    _load_ingestion_object(
                        object_path,
                        plan["runKey"],
                        str(record["ingestionSha256"]),
                    )
                )
                continue
            future = light_executor.submit(
                ingest_artifact,
                seed_path,
                expected_input_hash=plan["inputSha256"],
                expected_max_index=config.max_index,
                store=store,
            )
            ingestion_futures[future] = (f"seed:{key}", None, None)
            checkpoint["seedArtifacts"][key] = {
                "sourceSha256": sha256_file(seed_path),
                "status": "checking",
            }
            atomic_write_json(checkpoint_path, checkpoint)

        for job in jobs:
            record = checkpoint["jobs"][job.id]
            if record.get("status") == "completed":
                object_path = config.output_dir / str(record["ingestionObject"])
                ingestion = _load_ingestion_object(
                    object_path,
                    plan["runKey"],
                    str(record["ingestionSha256"]),
                )
                ingestion["scheduledPrime"] = job.prime
                ingestions.append(ingestion)
                continue
            if record.get("status") == "worker-completed" and job.output_path.is_file():
                execution_code = int(record.get("returnCode", 0))
            else:
                if cancel_event.is_set():
                    raise KeyboardInterrupt
                job.output_path.parent.mkdir(parents=True, exist_ok=True)
                record["status"] = "running"
                atomic_write_json(checkpoint_path, checkpoint)
                execution = worker_runner.run(
                    job,
                    timeout_seconds=config.worker_timeout,
                    cancel_event=cancel_event,
                )
                execution_code = execution.return_code
                record.update(
                    {
                        "status": "worker-completed",
                        "returnCode": execution.return_code,
                        "cancelled": execution.cancelled,
                        "timedOut": execution.timed_out,
                    }
                )
                atomic_write_json(checkpoint_path, checkpoint)
            if not job.output_path.is_file():
                record["status"] = "failed"
                record["error"] = "worker-produced-no-artifact"
                atomic_write_json(checkpoint_path, checkpoint)
                continue
            future = light_executor.submit(
                ingest_artifact,
                job.output_path,
                expected_input_hash=plan["inputSha256"],
                expected_max_index=config.max_index,
                store=store,
            )
            ingestion_futures[future] = (job.id, execution_code, job.prime)

        for future in concurrent.futures.as_completed(ingestion_futures):
            record_id, return_code, scheduled_prime = ingestion_futures[future]
            ingestion = future.result()
            if scheduled_prime is not None:
                ingestion["scheduledPrime"] = scheduled_prime
                job_record = checkpoint["jobs"][record_id]
                ingestion["scheduledExecution"] = {
                    "runKey": plan["runKey"],
                    "jobId": record_id,
                    "jobSha256": job_record["jobSha256"],
                    "workerImplementationSha256": plan["scientificConfig"][
                        "implementation"
                    ]["finiteImageWorkerSha256"],
                    "returnCode": int(return_code if return_code is not None else -1),
                    "timedOut": bool(job_record.get("timedOut", False)),
                    "cancelled": bool(job_record.get("cancelled", False)),
                }
            wrapper = {"runKey": plan["runKey"], "ingestion": ingestion}
            digest, path = store.put_json(wrapper)
            ingestions.append(ingestion)
            if record_id.startswith("seed:"):
                key = record_id.removeprefix("seed:")
                checkpoint["seedArtifacts"][key].update(
                    {
                        "status": "completed",
                        "ingestionSha256": digest,
                        "ingestionObject": relative_posix(path, config.output_dir),
                    }
                )
            else:
                job_record = checkpoint["jobs"][record_id]
                job_record.update(
                    {
                        "status": "completed",
                        "ingestionSha256": digest,
                        "ingestionObject": relative_posix(path, config.output_dir),
                        "workerOk": (
                            ingestion["ok"]
                            and return_code == 0
                            and not job_record.get("timedOut", False)
                            and not job_record.get("cancelled", False)
                        ),
                    }
                )
            atomic_write_json(checkpoint_path, checkpoint)
    finally:
        light_executor.shutdown(wait=True, cancel_futures=cancel_event.is_set())
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)

    ingestions.sort(
        key=lambda item: (str(item.get("artifactSha256")), str(item.get("status")))
    )
    require_composite_characteristics(ingestions)
    merged, merged_summary = merge_ingestions(
        ingestions,
        store=store,
        maximum_bytes=config.module_cache_bytes,
    )
    solver_dir = config.output_dir / "solver"
    solver_dir.mkdir(parents=True, exist_ok=True)
    provisional_problem_path = solver_dir / "problem.json"
    problem = build_solver_problem(
        merged,
        merged_summary,
        ingestions,
        problem_path=provisional_problem_path,
        module_root=store.module_root,
        run_key=plan["runKey"],
        solver_source_sha256=plan["scientificConfig"]["implementation"][
            "packedSolverSha256"
        ],
        solver_bounds=solver_bound_record(config),
    )
    problem_digest = sha256_json(problem)
    problem_path = solver_dir / f"problem-{problem_digest}.json"
    # Relative spool paths are the same because both files have the same parent.
    atomic_write_json(problem_path, problem)
    solver_summary, solver_execution, solver_output = _run_solver(
        config,
        solver_runner,
        cancel_event,
        problem_path,
        checkpoint,
    )
    solver_artifact_sha, solver_object = store.put_artifact(solver_output)
    module_ids = {str(module["id"]) for module in merged["modules"]}
    survivor = validate_solver_survivor(solver_summary, module_ids)
    request_summary: dict[str, Any] | None = None
    materialized_summary: dict[str, Any] | None = None
    materialization_execution: WorkerExecution | None = None
    materialization_solver_sha: str | None = None
    materialization_solver_object: Path | None = None
    promotion_summary: dict[str, Any] | None = None
    promotion_execution: WorkerExecution | None = None
    promotion_object: Path | None = None
    if survivor:
        candidate = solver_summary["candidate"]
        generator_count = len(problem["coxeterMatrix"])
        estimated_action_bytes = materialized_action_byte_estimate(
            candidate, generator_count
        )
        if estimated_action_bytes > config.max_action_bytes:
            raise PortfolioBudgetExceeded(
                "The witness-free survivor needs "
                f"{estimated_action_bytes} packed bytes, above the "
                f"{config.max_action_bytes}-byte action cap."
            )
        materialized_dir = config.output_dir / "materialized-actions"
        candidate_key = sha256_json(
            {
                "problemSha256": solver_summary["problemSha256"],
                "candidateId": candidate["id"],
                "moduleIds": candidate["moduleIds"],
                "representativeCode": candidate["representativeCode"],
            }
        )
        materialized_path = materialized_dir / f"action-{candidate_key}.json"
        (
            materialization_solver_summary,
            materialization_execution,
            materialization_solver_output,
        ) = _run_solver(
            config,
            solver_runner,
            cancel_event,
            problem_path,
            checkpoint,
            materialize_action_path=materialized_path,
        )
        if materialization_execution.return_code != 0:
            raise WorkerExecutionError(
                "Packed solver failed while materializing the survivor."
            )
        if not validate_solver_survivor(materialization_solver_summary, module_ids):
            raise StaleArtifactError(
                "The materialization pass no longer reports a witness-free survivor."
            )
        assert_same_survivor(solver_summary, materialization_solver_summary)
        if not materialized_path.is_file():
            raise WorkerExecutionError(
                "Packed solver reported success without writing the complete action."
            )
        verified_action = validate_materialized_action(
            materialized_path,
            solver_summary=solver_summary,
            problem=problem,
            max_action_bytes=config.max_action_bytes,
        )
        action_artifact_sha, action_object = store.put_artifact(materialized_path)
        materialization_solver_sha, materialization_solver_object = store.put_artifact(
            materialization_solver_output
        )
        materialized_summary = {
            **verified_action,
            "artifactSha256": action_artifact_sha,
            "artifactObject": relative_posix(action_object, config.output_dir),
            "materializationSolverArtifactSha256": materialization_solver_sha,
            "materializationSolverObject": relative_posix(
                materialization_solver_object, config.output_dir
            ),
            "materializationReturnCode": materialization_execution.return_code,
        }
        request = build_materialization_request(
            run_key=plan["runKey"],
            solver_summary=solver_summary,
            solver_artifact_sha256=solver_artifact_sha,
            merged_summary=merged_summary,
        )
        request = complete_materialization_request(request, materialized_summary)
        request_dir = config.output_dir / "requests"
        request_path = request_dir / f"materialize-{request['requestSha256']}.json"
        atomic_write_json(request_path, request)
        request_summary = {
            "requestSha256": request["requestSha256"],
            "path": relative_posix(request_path, config.output_dir),
            "candidateDegree": request["candidate"]["degree"],
            "status": request["status"],
            "materializedActionSha256": materialized_summary["artifactSha256"],
        }
        if config.run_fibering_pipeline:
            (
                promotion_summary,
                promotion_execution,
                promotion_object,
            ) = run_fibering_promotion(
                config,
                runner=promotion_runner,
                cancel_event=cancel_event,
                materialized_action_path=materialized_path,
                materialized_summary=materialized_summary,
                store=store,
                run_key=plan["runKey"],
            )
        else:
            promotion_summary = {
                "status": "not-requested",
                "invoked": False,
                "reason": "The caller explicitly disabled automatic promotion.",
                "claims": [],
                "nonClaims": [
                    "independent spherical-freeness promotion",
                    "Davis quotient",
                    "virtual algebraic fibering",
                ],
            }
    checkpoint["solver"] = {
        "status": "survivor-materialized" if survivor else "no-survivor",
        "returnCode": solver_execution.return_code,
        "timedOut": solver_execution.timed_out,
        "cancelled": solver_execution.cancelled,
        "problemSha256": sha256_file(problem_path),
        "resultSha256": solver_artifact_sha,
        "materialization": (
            {
                "status": "verified",
                "returnCode": materialization_execution.return_code,
                "resultSha256": materialization_solver_sha,
                "actionArtifactSha256": materialized_summary["artifactSha256"],
                "actionSha256": materialized_summary["actionSha256"],
            }
            if materialized_summary is not None
            and materialization_execution is not None
            else None
        ),
        "promotion": copy.deepcopy(promotion_summary),
    }
    atomic_write_json(checkpoint_path, checkpoint)
    workers_complete = all(
        bool(record.get("workerOk")) for record in checkpoint["jobs"].values()
    )
    scientific_worker_completion = summarize_worker_portfolio_completeness(
        ingestions,
        expected_bindings=expected_scheduled_worker_bindings(
            plan=plan, checkpoint=checkpoint
        ),
    )
    promotion_status = promotion_summary.get("status") if promotion_summary else None
    status = (
        "virtual-fibering-certified"
        if promotion_status == "passed"
        else "materialized-candidate-promotion-failed"
        if promotion_status == "failed"
        else "materialized-witness-free-survivor"
        if survivor
        else "complete-no-survivor"
        if workers_complete
        and scientific_worker_completion["complete"]
        and merged_summary["complete"]
        and solver_summary.get("searchComplete")
        else "incomplete-no-survivor"
    )
    referenced_paths = [
        config.output_dir / str(item["artifactObject"]) for item in ingestions
    ]
    referenced_paths.extend(
        store.module_root / str(module["packedPermutationRows"]["portfolioPath"])
        for module in merged_summary["modules"]
    )
    referenced_paths.extend((store.module_root / "catalogue.json", solver_object))
    if materialized_summary is not None and materialization_solver_object is not None:
        referenced_paths.extend(
            (
                config.output_dir / str(materialized_summary["artifactObject"]),
                materialization_solver_object,
            )
        )
    if request_summary is not None:
        referenced_paths.append(config.output_dir / str(request_summary["path"]))
    if promotion_object is not None:
        referenced_paths.append(promotion_object)
    promotion_claims = (
        [str(value) for value in promotion_summary.get("claims", [])]
        if promotion_summary
        else []
    )
    promotion_nonclaims = (
        [str(value) for value in promotion_summary.get("nonClaims", [])]
        if promotion_summary
        else [
            "independent spherical-freeness promotion",
            "Davis quotient",
            "virtual algebraic fibering",
        ]
    )
    manifest: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "orchestratorVersion": ORCHESTRATOR_VERSION,
        "status": status,
        "runKey": plan["runKey"],
        "inputSha256": plan["inputSha256"],
        "scope": {
            "rationalPrimes": list(REQUIRED_PRIMES),
            "requiredMod2ModuleSeed": {
                "characteristic": 2,
                "generatedByPortfolio": True,
                "degreeLedgerAcceptedAsModuleSeed": False,
            },
            "primeIdealPolicy": "all eligible prime ideals and extension residue fields emitted by the existing Sage backend",
            "mod3StructuralCertificate": copy.deepcopy(
                plan["scientificConfig"]["mod3StructuralCertificate"]
            ),
            "seedArtifactCount": len(config.seed_artifacts),
        },
        "resourcePolicy": {
            "lightWorkers": config.light_workers,
            "heavyRecognitionWorkers": 1,
            "maxObjectBytes": config.max_object_bytes,
            "referencedObjectBytes": unique_file_bytes(referenced_paths),
            "maxActionBytesPerWorker": config.max_action_bytes,
            "moduleCacheBytes": config.module_cache_bytes,
            "processGroupCancellation": True,
        },
        "workerArtifacts": [
            {
                **{
                    key: copy.deepcopy(item[key])
                    for key in (
                        "artifactSha256",
                        "workerArtifactHash",
                        "artifactObject",
                        "status",
                        "ok",
                        "residueAttempts",
                        "searchCompleteness",
                        "derivedResidueCompletion",
                        "scheduledExecution",
                        "catalogueSha256",
                        "catalogueComplete",
                    )
                    if key in item
                },
                "degreeCompatibilityObstructionSha256": [
                    obstruction["obstructionSha256"]
                    for obstruction in item.get("degreeCompatibilityObstructions", [])
                ],
            }
            for item in ingestions
        ],
        "workerPortfolioCompleteness": scientific_worker_completion,
        "modulePortfolio": {
            **{
                key: copy.deepcopy(value)
                for key, value in merged_summary.items()
                if key != "modules"
            },
            "moduleCount": len(merged_summary["modules"]),
            "modules": copy.deepcopy(merged_summary["modules"]),
        },
        "compositeSearch": {
            "solverArtifactSha256": solver_artifact_sha,
            "solverObject": relative_posix(solver_object, config.output_dir),
            "returnCode": solver_execution.return_code,
            "summary": copy.deepcopy(solver_summary),
            "allBoundedDiagonalOrbits": True,
            "allBoundedTwoFactorDoubleCosets": True,
        },
        "materializationRequest": request_summary,
        "materializedAction": copy.deepcopy(materialized_summary),
        # Keep the old field for schema-v1 readers; new consumers should use
        # fiberingPromotion because the selected certificate may be lawful.
        "fullDavisPromotion": copy.deepcopy(promotion_summary),
        "fiberingPromotion": copy.deepcopy(promotion_summary),
        "promotionGate": {
            "materializationRequestedOnlyForWitnessFreeSurvivor": True,
            "materializationInvokedOnlyForWitnessFreeSurvivor": True,
            "completeRowsIndependentlyVerified": materialized_summary is not None,
            "fiberingPipelineInvoked": bool(
                promotion_summary and promotion_summary.get("invoked")
            ),
            "sphericalFreenessPassed": bool(
                promotion_summary
                and any(
                    stage.get("id") == "spherical-freeness"
                    and stage.get("status") == "passed"
                    for stage in promotion_summary.get("stages", [])
                    if isinstance(stage, Mapping)
                )
            ),
            "virtualFiberingCertified": promotion_status == "passed",
            "selectedTrack": (
                promotion_summary.get("selectedTrack")
                if promotion_summary
                else None
            ),
        },
        "claims": [
            "exact persisted finite-image modules",
            "bounded packed diagonal-orbit search",
        ]
        + (
            [
                "witness-free composite orbit candidate",
                "materialized and independently verified complete permutation rows",
            ]
            if survivor
            else []
        )
        + promotion_claims,
        "nonClaims": [
            "complete subgroup classification outside each component scope",
            "minimal index",
        ]
        + promotion_nonclaims,
    }
    manifest["portfolioSha256"] = sha256_json(manifest)
    atomic_write_json(config.output_dir / "portfolio.json", manifest)
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--worker-python", type=Path, default=Path(sys.executable))
    parser.add_argument("--solver-python", type=Path, default=Path(sys.executable))
    parser.add_argument(
        "--worker-script",
        type=Path,
        default=SCRIPT_DIR / "torsion_free_finite_image.py",
    )
    parser.add_argument(
        "--solver-script", type=Path, default=SCRIPT_DIR / "packed_composite_solver.py"
    )
    parser.add_argument("--seed-artifact", type=Path, action="append", default=[])
    parser.add_argument("--light-workers", type=int, choices=(4, 5, 6), default=4)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path.home() / ".cache" / "coxeter-viewer" / "portfolio",
    )
    parser.add_argument("--max-object-bytes", type=int, default=8 * 1024 * 1024 * 1024)
    parser.add_argument("--max-action-bytes", type=int, default=512 * 1024 * 1024)
    parser.add_argument(
        "--module-cache-bytes", type=int, default=4 * 1024 * 1024 * 1024
    )
    parser.add_argument("--max-index", type=int, default=576_000)
    parser.add_argument("--max-modules", type=int, default=4096)
    parser.add_argument("--max-subgroups", type=int, default=65_536)
    parser.add_argument("--worker-timeout", type=int, default=7200)
    parser.add_argument("--recognition-timeout", type=int, default=3600)
    parser.add_argument("--solver-timeout", type=int, default=7200)
    parser.add_argument("--solver-max-bytes", type=int, default=2 * 1024 * 1024 * 1024)
    parser.add_argument(
        "--solver-max-mapped-bytes", type=int, default=32 * 1024 * 1024 * 1024
    )
    parser.add_argument("--solver-max-combinations", type=int, default=250_000)
    parser.add_argument("--solver-max-factors", type=int, default=8)
    parser.add_argument("--solver-max-degree", type=int, default=2_000_000)
    parser.add_argument("--solver-max-cartesian-points", type=int, default=16_000_000)
    parser.add_argument("--solver-checkpoint-interval", type=int, default=250)
    parser.add_argument(
        "--run-fibering-pipeline",
        action=argparse.BooleanOptionalAction,
        default=True,
        help=(
            "Automatically replay spherical freeness and the full Davis fibering "
            "pipeline after a materialized survivor."
        ),
    )
    parser.add_argument(
        "--fibering-runtime",
        action="append",
        default=[],
        help=(
            "One runtime command token; repeat to override the automatic "
            "corepack/pnpm/tsx command."
        ),
    )
    parser.add_argument("--fibering-script", type=Path, default=DEFAULT_FIBERING_SCRIPT)
    parser.add_argument("--fibering-timeout", type=int, default=7200)
    parser.add_argument(
        "--fibering-max-input-bytes", type=int, default=512 * 1024 * 1024
    )
    parser.add_argument("--fibering-exact-wall-limit", type=int, default=24)
    parser.add_argument("--fibering-max-candidates", type=int, default=1_000_000)
    parser.add_argument("--fibering-time-budget-ms", type=int, default=3_600_000)
    parser.add_argument("--research-gap", type=Path)
    parser.add_argument("--research-gap-manifest", type=Path)
    parser.add_argument(
        "--mod3-structural-certificate",
        type=Path,
        default=DEFAULT_MOD3_STRUCTURAL_CERTIFICATE,
        help=(
            "Optional hash-bound GF(3) recognition certificate. It is passed "
            "only to the characteristic-3 worker when the file exists."
        ),
    )
    for prime in (5, 7, 11):
        parser.add_argument(
            f"--mod{prime}-structural-certificate",
            type=Path,
            default=DEFAULT_ODD_PRIME_STRUCTURAL_CERTIFICATES[prime],
            help=(
                f"Optional hash-bound GF({prime}) direct orthogonal certificate. "
                f"It is passed only to the characteristic-{prime} worker when "
                "the file exists."
            ),
        )
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def config_from_args(args: argparse.Namespace) -> PortfolioConfig:
    return PortfolioConfig(
        input_path=args.input,
        output_dir=args.output_dir,
        worker_python=args.worker_python,
        solver_python=args.solver_python,
        worker_script=args.worker_script,
        solver_script=args.solver_script,
        seed_artifacts=tuple(args.seed_artifact),
        light_workers=args.light_workers,
        cache_dir=args.cache_dir,
        max_object_bytes=args.max_object_bytes,
        max_action_bytes=args.max_action_bytes,
        module_cache_bytes=args.module_cache_bytes,
        max_index=args.max_index,
        max_modules=args.max_modules,
        max_subgroups=args.max_subgroups,
        worker_timeout=args.worker_timeout,
        recognition_timeout=args.recognition_timeout,
        solver_timeout=args.solver_timeout,
        solver_max_bytes=args.solver_max_bytes,
        solver_max_mapped_bytes=args.solver_max_mapped_bytes,
        solver_max_combinations=args.solver_max_combinations,
        solver_max_factors=args.solver_max_factors,
        solver_max_degree=args.solver_max_degree,
        solver_max_cartesian_points=args.solver_max_cartesian_points,
        solver_checkpoint_interval=args.solver_checkpoint_interval,
        run_fibering_pipeline=args.run_fibering_pipeline,
        fibering_runtime=tuple(args.fibering_runtime),
        fibering_script=args.fibering_script,
        fibering_timeout=args.fibering_timeout,
        fibering_max_input_bytes=args.fibering_max_input_bytes,
        fibering_exact_wall_limit=args.fibering_exact_wall_limit,
        fibering_max_candidates=args.fibering_max_candidates,
        fibering_time_budget_ms=args.fibering_time_budget_ms,
        research_gap=args.research_gap,
        research_gap_manifest=args.research_gap_manifest,
        mod3_structural_certificate=args.mod3_structural_certificate,
        mod5_structural_certificate=args.mod5_structural_certificate,
        mod7_structural_certificate=args.mod7_structural_certificate,
        mod11_structural_certificate=args.mod11_structural_certificate,
        resume=args.resume,
        dry_run=args.dry_run,
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        manifest = run_portfolio(config_from_args(args))
    except PortfolioError as exc:
        sys.stderr.write(f"portfolio error: {exc}\n")
        return 1
    sys.stdout.write(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    if manifest["status"] in {
        "dry-run",
        "virtual-fibering-certified",
        "materialized-witness-free-survivor",
        "complete-no-survivor",
    }:
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
