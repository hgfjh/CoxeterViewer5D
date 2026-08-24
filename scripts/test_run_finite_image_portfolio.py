"""Contract tests for the finite-image residue/module portfolio coordinator."""

from __future__ import annotations

import json
import hashlib
import sys
import threading
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import finite_image_module_catalogue as catalogue  # noqa: E402
import run_finite_image_portfolio as portfolio  # noqa: E402


def write_packed_rows(root: Path, rows: list[list[int]]) -> dict[str, Any]:
    degree = len(rows[0])
    payload = b"".join(
        int(value).to_bytes(2, "little") for row in rows for value in row
    )
    digest = portfolio.sha256_bytes(payload)
    descriptor = catalogue.build_packed_row_descriptor(
        degree=degree,
        generator_count=len(rows),
        packed_sha256=digest,
        byte_length=len(payload),
    )
    path = root.joinpath(*Path(descriptor["storageKey"]).parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return descriptor


def fake_worker_artifact(
    *,
    root: Path,
    input_hash: str,
    prime: int,
    include_module: bool,
    complete_mod3_obstruction: bool = False,
) -> dict[str, Any]:
    witnesses = [
        {"id": "w:s0", "word": [0], "primeOrder": 2},
        {"id": "w:s1", "word": [1], "primeOrder": 2},
    ]
    witness_hash = portfolio.sha256_json(witnesses)
    matrix_hash = portfolio.sha256_json([[1, 2], [2, 1]])
    image_hash = portfolio.sha256_json({"finiteImage": prime})
    image_id = f"GF({prime})"
    finite_image = catalogue.build_finite_image_record(
        image_id=image_id,
        characteristic=prime,
        finite_image_sha256=image_hash,
        order=6 * prime,
        origin={
            "kind": "exact-congruence-image",
            "sourceHash": portfolio.sha256_json({"primeIdeal": prime}),
            "residueFieldOrder": prime,
        },
    )
    modules: list[dict[str, Any]] = []
    search_modules: list[dict[str, Any]] = []
    if include_module:
        if prime == 2:
            rows = [[1, 0], [0, 1]]
            covered = [0]
        else:
            rows = [[0, 1], [1, 0]]
            covered = [1]
        descriptor = write_packed_rows(root, rows)
        packed_path = root.joinpath(*Path(descriptor["storageKey"]).parts)
        coverage = catalogue.build_fixed_point_coverage(
            covered, len(witnesses), witness_hash
        )
        subgroup_hash = portfolio.sha256_json({"subgroup": prime})
        module = catalogue.build_module_record(
            source_sha256=input_hash,
            matrix_sha256=matrix_hash,
            witness_sha256=witness_hash,
            finite_image_sha256=image_hash,
            finite_image_id=image_id,
            characteristic=prime,
            degree=2,
            origin={
                "kind": "exact-coset-action",
                "candidateOrigin": {
                    "kind": "table-of-marks",
                    "stabilizerMetadata": {"class": prime},
                    "doubleCosetMetadata": {"available": True},
                },
            },
            subgroup_fingerprint=subgroup_hash,
            packed_rows=descriptor,
            fixed_point_coverage=coverage,
            status="partial",
        )
        modules.append(module)
        search_modules.append(
            {
                "id": f"raw-{prime}",
                "degree": 2,
                "packedPermutationRows": {
                    **descriptor,
                    "path": str(packed_path),
                },
                "subgroupFingerprint": subgroup_hash,
                "subgroupGeneratorWords": [[0, 1]],
                "transitive": True,
                "relationChecks": [{"passed": True}],
                "coveredWitnessIds": [witnesses[index]["id"] for index in covered],
                "sphericalOrbitChecks": [{"subset": [covered[0]], "free": True}],
                "status": "partial",
            }
        )
    component = catalogue.build_catalogue(
        source_sha256=input_hash,
        matrix_sha256=matrix_hash,
        witness_sha256=witness_hash,
        witness_count=len(witnesses),
        source_generator_count=2,
        finite_images=[finite_image],
        modules=modules,
        scope={
            "kind": "fake-worker-bounded-search",
            "rationalPrime": prime,
        },
        complete=True,
    )
    attempt: dict[str, Any] = {
        "candidateId": image_id,
        "rationalPrime": prime,
        "coefficientModel": "integral-standard-tits",
        "sourceKind": "prime-ideal-residue",
        "sourceHash": finite_image["origin"]["sourceHash"],
        "primeIdealNorm": prime,
        "residueDegree": 1,
        "residueFieldOrder": prime,
        "status": "accepted",
        "reason": "exact-relations-and-spherical-restrictions-passed",
        "relationChecks": [{"passed": True}],
        "sphericalRestrictionChecks": [{"injective": True}],
        "structuralRecognition": {
            "status": "recognized-and-verified",
            "isCorrect": True,
        },
        "recognitionBridge": {"actionHash": image_hash},
    }
    search: dict[str, Any] = {
        "candidateId": image_id,
        "complete": True,
        "terminal": True,
        "frontierExhausted": True,
        "finiteImageOrder": finite_image["order"],
        "modules": search_modules,
        "reason": "bounded-subgroup-search-exhausted",
    }
    lower_bound = 2
    bounds: dict[str, Any] = {"maxIndex": 576_000, "lowerBoundDivisor": 2}
    if complete_mod3_obstruction:
        if prime != 3 or include_module:
            raise ValueError("A complete mod-3 obstruction replaces packed rows.")
        lower_bound = 5_760
        bounds = {"maxIndex": 576_000, "lowerBoundDivisor": lower_bound}
        targets = list(range(lower_bound, bounds["maxIndex"] + 1, lower_bound))
        target_decisions = [
            {"target": target, "decision": "ruled-out"} for target in targets
        ]
        manifest_hash = portfolio.sha256_json({"toolchain": "fake-gap"})
        structural = {
            "schemaVersion": 1,
            "actionHash": image_hash,
            "manifestHash": manifest_hash,
            "recognition": {
                "complete": True,
                "finiteImageOrder": 999_999,
            },
            "catalogue": {
                "complete": True,
                "finiteImageOrder": 999_999,
            },
            "screening": {
                "complete": True,
                "finiteImageOrder": 999_999,
                "possibleIndices": [],
                "targetDecisions": target_decisions,
                "minimumNontrivialTransitiveDegree": 9801,
                "transitiveFactorScreen": {
                    "complete": True,
                    "compatibleDegrees": [],
                },
            },
        }
        attempt["structuralRecognition"] = structural
        attempt["recognitionBridge"] = {
            "actionHash": image_hash,
            "manifestHash": manifest_hash,
        }
        search.update(
            {
                "reason": "recognized-index-obstruction",
                "terminal": True,
                "indexScreeningComplete": True,
                "targetIndexDecisions": target_decisions,
                "partialModuleDegreeScreen": {
                    "complete": True,
                    "naturalOrbitDegrees": [9801],
                    "compatibleDegrees": [],
                },
            }
        )
    artifact: dict[str, Any] = {
        "schemaVersion": 1,
        "artifactType": "coxeter-finite-image-search",
        "status": "exhausted",
        "ok": True,
        "sourceSystem": {
            "name": "portfolio-test",
            "rank": 2,
            "generators": [{"id": "s0"}, {"id": "s1"}],
            "coxeterMatrix": [[1, 2], [2, 1]],
        },
        "inputHash": input_hash,
        "matrixDigest": matrix_hash,
        "residueAttempts": [attempt],
        "bounds": bounds,
        "sphericalCatalogue": {
            "witnessCount": len(witnesses),
            "witnessDigest": witness_hash,
            "indexDivisibilityLowerBound": lower_bound,
            "implementationSha256": portfolio.sha256_file(
                portfolio.SCRIPT_DIR / "torsion_free_finite_image.py"
            ),
        },
        "torsionWitnesses": witnesses,
        "search": search,
        "searchCompleteness": {
            "status": "exhausted-within-recorded-bounds",
            "boundedComplete": True,
            "residueCandidatesExamined": 1,
        },
        "errors": [],
        "warnings": [],
    }
    if not complete_mod3_obstruction:
        artifact["partialModuleCatalogue"] = component
        artifact["partialModuleCatalogueStorageRoot"] = str(root)
    artifact["artifactHash"] = portfolio.sha256_json(artifact)
    return artifact


class FakeWorkerRunner:
    def __init__(
        self,
        input_hash: str,
        storage_root: Path,
        *,
        omit_mod2: bool = False,
        omit_mod3: bool = False,
        p3_obstruction: bool = False,
        incomplete_prime: int | None = None,
    ) -> None:
        self.input_hash = input_hash
        self.storage_root = storage_root
        self.calls: list[int] = []
        self.active_heavy = 0
        self.maximum_active_heavy = 0
        self.omit_mod2 = omit_mod2
        self.omit_mod3 = omit_mod3
        self.p3_obstruction = p3_obstruction
        self.incomplete_prime = incomplete_prime
        self._lock = threading.Lock()

    def run(
        self,
        job: portfolio.WorkerJob,
        *,
        timeout_seconds: int,
        cancel_event: threading.Event,
    ) -> portfolio.WorkerExecution:
        del timeout_seconds
        self.assert_not_cancelled(cancel_event)
        with self._lock:
            self.active_heavy += 1
            self.maximum_active_heavy = max(
                self.maximum_active_heavy, self.active_heavy
            )
        try:
            self.calls.append(job.prime)
            time.sleep(0.005)
            root = self.storage_root / f"p{job.prime}"
            artifact = fake_worker_artifact(
                root=root,
                input_hash=self.input_hash,
                prime=job.prime,
                include_module=(
                    job.prime in (2, 3)
                    and not (self.omit_mod2 and job.prime == 2)
                    and not (self.omit_mod3 and job.prime == 3)
                    and not (self.p3_obstruction and job.prime == 3)
                ),
                complete_mod3_obstruction=(self.p3_obstruction and job.prime == 3),
            )
            if job.prime == self.incomplete_prime:
                artifact["searchCompleteness"] = {
                    "status": "incomplete",
                    "boundedComplete": False,
                    "residueCandidatesExamined": 1,
                }
                artifact["search"].update(
                    {
                        "complete": False,
                        "terminal": False,
                        "frontierExhausted": False,
                        "reason": "test-interruption",
                    }
                )
                artifact.pop("artifactHash")
                artifact["artifactHash"] = portfolio.sha256_json(artifact)
            portfolio.atomic_write_json(job.output_path, artifact)
            return portfolio.WorkerExecution(return_code=0)
        finally:
            with self._lock:
                self.active_heavy -= 1

    @staticmethod
    def assert_not_cancelled(cancel_event: threading.Event) -> None:
        if cancel_event.is_set():
            raise AssertionError("Fake worker was launched after cancellation")


class NoCallRunner:
    def run(self, *_args: Any, **_kwargs: Any) -> portfolio.WorkerExecution:
        raise AssertionError("A completed checkpoint should not relaunch workers")


class FakeSolverRunner:
    def __init__(
        self,
        candidate: bool,
        *,
        unknown: bool = False,
        fault: str | None = None,
    ) -> None:
        self.candidate = candidate
        self.unknown = unknown
        self.fault = fault
        self.calls = 0
        self.search_calls = 0
        self.materialization_calls = 0

    @staticmethod
    def argument(command: tuple[str, ...], name: str) -> Path:
        return Path(command[command.index(name) + 1])

    def run(
        self,
        job: portfolio.WorkerJob,
        *,
        timeout_seconds: int,
        cancel_event: threading.Event,
    ) -> portfolio.WorkerExecution:
        del timeout_seconds
        if cancel_event.is_set():
            raise AssertionError("Solver started after cancellation")
        self.calls += 1
        materialize = "--materialize-action" in job.command
        if materialize:
            self.materialization_calls += 1
        else:
            self.search_calls += 1
        problem_path = self.argument(job.command, "--input")
        output_path = self.argument(job.command, "--output")
        problem = json.loads(problem_path.read_text(encoding="utf-8"))
        module_ids = [module["id"] for module in problem["modules"]]
        candidate = (
            {
                "id": "orbit:test",
                "moduleIndices": list(range(len(module_ids))),
                "moduleIds": module_ids,
                "representativeCode": "0",
                "representativeTuple": [0 for _ in module_ids],
                "orbitIndex": 0,
                "degree": 4,
                "cartesianDegree": "4",
                "decompositionKind": "double-coset-diagonal-orbits",
                "actionMaterialized": False,
            }
            if self.candidate
            else None
        )
        summary = {
            "schemaVersion": 2,
            "solver": {
                "id": portfolio.SOLVER_ID,
                "version": portfolio.SOLVER_VERSION,
            },
            "status": (
                "candidate-found"
                if self.candidate
                else "incomplete"
                if self.unknown
                else "exhausted-within-bounds"
            ),
            "candidate": candidate,
            "searchComplete": not self.unknown,
            "minimumWithinBoundedOrbitScope": self.candidate,
            "minimumProved": self.candidate,
            "problemSha256": portfolio.sha256_json(problem),
            "diagnostics": {
                "double_coset_decompositions": 1,
                "diagonal_orbits_enumerated": 2,
            },
            "limitations": ["bounded fake-worker test"],
            "executionBinding": {
                "runKey": problem["executionBinding"]["runKey"],
                "phase": "materialize" if materialize else "search",
                "problemArtifactSha256": portfolio.sha256_json(problem),
                "problemPath": str(problem_path.resolve()),
                "resultPath": str(output_path.resolve()),
                "materializedActionPath": (
                    str(self.argument(job.command, "--materialize-action").resolve())
                    if materialize
                    else None
                ),
                "solver": problem["executionBinding"]["solver"],
                "bounds": problem["executionBinding"]["bounds"],
                "terminalStatus": (
                    "candidate-found"
                    if self.candidate
                    else "incomplete"
                    if self.unknown
                    else "exhausted-within-bounds"
                ),
                "searchComplete": not self.unknown,
                "hasCandidate": self.candidate,
                "expectedReturnCode": 0 if self.candidate else 2,
            },
        }
        summary["resultSha256"] = portfolio.sha256_json(summary)
        if self.fault == "stale-binding":
            summary["executionBinding"]["runKey"] = "f" * 64
            summary["resultSha256"] = portfolio.sha256_json(
                {key: value for key, value in summary.items() if key != "resultSha256"}
            )
        elif self.fault == "wrong-output-path":
            summary["executionBinding"]["resultPath"] = str(
                output_path.with_name("another-result.json").resolve()
            )
            summary["resultSha256"] = portfolio.sha256_json(
                {key: value for key, value in summary.items() if key != "resultSha256"}
            )
        elif self.fault == "inconsistent-no-survivor":
            summary["searchComplete"] = False
            summary["resultSha256"] = portfolio.sha256_json(
                {key: value for key, value in summary.items() if key != "resultSha256"}
            )
        if materialize:
            if not self.candidate or candidate is None:
                raise AssertionError("Materialization was invoked without a survivor")
            materialized_path = self.argument(job.command, "--materialize-action")
            rows = [[1, 0, 3, 2], [2, 3, 0, 1]]
            digest = hashlib.sha256()
            digest.update(b"coxeter-materialized-composite-v1\0")
            digest.update((4).to_bytes(8, "little"))
            digest.update((2).to_bytes(4, "little"))
            for row in rows:
                digest.update(b"".join(value.to_bytes(2, "little") for value in row))
            materialized_candidate = {
                **candidate,
                "actionMaterialized": True,
                "actionSha256": digest.hexdigest(),
                "witnessChecks": [
                    {
                        "witnessId": witness["id"],
                        "fixedPointCount": 0,
                        "passed": True,
                    }
                    for witness in problem["witnessCatalogue"]["witnesses"]
                ],
            }
            portfolio.atomic_write_json(
                materialized_path,
                {
                    "schemaVersion": 1,
                    "solver": {
                        "id": portfolio.SOLVER_ID,
                        "version": portfolio.SOLVER_VERSION,
                    },
                    "problemSha256": portfolio.sha256_json(problem),
                    "candidate": materialized_candidate,
                    "generatorActions": rows,
                    "orbitPointCodes": [0, 1, 2, 3],
                },
            )
        if self.fault != "no-write":
            portfolio.atomic_write_json(output_path, summary)
        return portfolio.WorkerExecution(
            return_code=0 if self.candidate else 2,
            timed_out=self.fault == "timed-out",
            cancelled=self.fault == "cancelled",
        )


class FakePromotionRunner:
    def __init__(
        self,
        *,
        tamper_hash: bool = False,
        tamper_source_system: bool = False,
        reject_verifier: bool = False,
    ) -> None:
        self.calls = 0
        self.tamper_hash = tamper_hash
        self.tamper_source_system = tamper_source_system
        self.reject_verifier = reject_verifier

    @staticmethod
    def argument(command: tuple[str, ...], flag: str) -> Path:
        return Path(command[command.index(flag) + 1])

    def run(
        self,
        job: portfolio.WorkerJob,
        *,
        timeout_seconds: int,
        cancel_event: threading.Event,
    ) -> portfolio.WorkerExecution:
        del timeout_seconds, cancel_event
        self.calls += 1
        if "--verify-artifact" in job.command:
            artifact_path = self.argument(job.command, "--verify-artifact")
            output_path = self.argument(job.command, "--output")
            artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
            payload: dict[str, Any] = {
                "schemaVersion": 2,
                "kind": "materialized-action-promotion-replay",
                "valid": not self.reject_verifier,
                "errors": ["test verifier rejection"] if self.reject_verifier else [],
                "implementationManifestMatches": not self.reject_verifier,
                "checkedHashes": (
                    []
                    if self.reject_verifier
                    else [
                        "implementation-files",
                        "implementation-manifest",
                        "promotion-artifact",
                    ]
                ),
                "replayHashAlgorithm": "sha256",
            }
            payload["replayHash"] = portfolio.sha256_json(payload)
            portfolio.atomic_write_json(output_path, payload)
            return portfolio.WorkerExecution(
                return_code=1 if self.reject_verifier else 0
            )
        action_path = self.argument(job.command, "--action")
        system_path = self.argument(job.command, "--system")
        output_path = self.argument(job.command, "--output")
        action = json.loads(action_path.read_text(encoding="utf-8"))
        candidate = action["candidate"]
        legacy_hashes = {
            "scripts/run_materialized_fibering.ts": "1" * 64,
            "src/fibering/materializedActionPipeline.ts": "2" * 64,
            "src/fibering/fullDavisSearch.ts": "3" * 64,
            "src/fibering/fullDavisCertificate.ts": "4" * 64,
            "src/fibering/fullDavisMorse.ts": "5" * 64,
        }
        implementation_files = [
            {
                "path": path,
                "sha256": legacy_hashes.get(path, "6" * 64),
            }
            for path in sorted(portfolio.REQUIRED_PROMOTION_IMPLEMENTATION_PATHS)
        ]
        implementation_manifest: dict[str, Any] = {
            "schemaVersion": 1,
            "kind": "materialized-action-implementation-manifest",
            "hashAlgorithm": "sha256",
            "files": implementation_files,
            "sourceTreeMerkleSha256": portfolio.sha256_json(implementation_files),
            "toolchain": {
                "node": "test",
                "packageManager": "test",
                "typescript": "test",
                "vite": "test",
                "viteNode": "test",
            },
        }
        implementation_manifest["manifestSha256"] = portfolio.sha256_json(
            implementation_manifest
        )
        artifact: dict[str, Any] = {
            "schemaVersion": 2,
            "kind": portfolio.FIBERING_PROMOTION_TYPE,
            "status": "incomplete",
            "promotionOutcome": "inconclusive",
            "selectedTrack": None,
            "implementation": {
                "profile": "materialized-action-two-track-promotion-v3",
                "hashes": {
                    "runner": "1" * 64,
                    "materializedActionPipeline": "2" * 64,
                    "fullDavisSearch": "3" * 64,
                    "fullDavisCertificate": "4" * 64,
                    "fullDavisMorse": "5" * 64,
                },
                "manifest": implementation_manifest,
            },
            "source": {
                "systemName": "portfolio-test",
                "candidateId": candidate["id"],
                "actionDegree": candidate["degree"],
                "solverId": action["solver"]["id"],
                "solverVersion": action["solver"]["version"],
                "problemSha256": action["problemSha256"],
            },
            "stages": [
                {
                    "id": "materialized-action",
                    "status": "passed",
                    "detail": "rows replayed",
                },
                {
                    "id": "spherical-plan",
                    "status": "incomplete",
                    "detail": "test budget",
                },
                {
                    "id": "spherical-freeness",
                    "status": "not-run",
                    "detail": "not run",
                },
                {
                    "id": "quotient-2-skeleton",
                    "status": "not-run",
                    "detail": "not run",
                },
                {
                    "id": "lawful-subcomplex",
                    "status": "not-run",
                    "detail": "not run",
                },
                {
                    "id": "full-davis-fallback",
                    "status": "not-run",
                    "detail": "not run",
                },
            ],
            "budgets": {},
            "metrics": {},
            "hashes": {
                "sourceSystemSha256": "a" * 64,
                "sourceSystemArtifactSha256": (
                    "e" * 64
                    if self.tamper_source_system
                    else portfolio.sha256_file(system_path)
                ),
                "sourceActionArtifactSha256": portfolio.sha256_file(action_path),
                "materializedActionSha256": candidate["actionSha256"],
            },
            "claims": ["complete materialized permutation rows independently rehashed"],
            "nonClaims": [
                "independent spherical-freeness promotion",
                "Davis quotient",
                "virtual algebraic fibering",
            ],
            "errors": [],
            "warnings": ["test budget stopped promotion"],
        }
        artifact["hashes"]["artifactSha256"] = portfolio.sha256_json(artifact)
        if self.tamper_hash:
            artifact["hashes"]["artifactSha256"] = "f" * 64
        portfolio.atomic_write_json(output_path, artifact)
        return portfolio.WorkerExecution(return_code=2)


class PortfolioOrchestratorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.input_path = self.root / "input.json"
        self.input_path.write_text(
            json.dumps({"name": "portfolio-test"}, sort_keys=True),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def config(self, name: str = "run", **updates: Any) -> portfolio.PortfolioConfig:
        values: dict[str, Any] = {
            "input_path": self.input_path,
            "output_dir": self.root / name,
            "cache_dir": self.root / "cache",
            "max_object_bytes": 32 * 1024 * 1024,
            "module_cache_bytes": 16 * 1024 * 1024,
            "worker_timeout": 10,
            "solver_timeout": 10,
            "mod3_structural_certificate": None,
            "mod5_structural_certificate": None,
            "mod7_structural_certificate": None,
            "mod11_structural_certificate": None,
            "run_fibering_pipeline": False,
        }
        values.update(updates)
        return portfolio.PortfolioConfig(**values)

    def runners(
        self, candidate: bool = False
    ) -> tuple[FakeWorkerRunner, FakeSolverRunner]:
        input_hash = portfolio.build_plan(self.config())["inputSha256"]
        return (
            FakeWorkerRunner(input_hash, self.root / "fake-module-storage"),
            FakeSolverRunner(candidate),
        )

    def test_dry_run_schedules_exact_residue_primes_without_launching(self) -> None:
        config = self.config(dry_run=True, light_workers=6)
        result = portfolio.run_portfolio(
            config,
            worker_runner=NoCallRunner(),
            solver_runner=NoCallRunner(),
        )
        self.assertEqual(result["status"], "dry-run")
        self.assertEqual([job["prime"] for job in result["jobs"]], [2, 3, 5, 7, 11])
        self.assertTrue(result["jobs"][0]["id"].startswith("residue-p2-"))
        self.assertEqual(result["resourcePolicy"]["lightWorkers"], 6)
        self.assertTrue(
            all(
                job["resourceClass"] == "memory-heavy-recognition"
                for job in result["jobs"]
            )
        )
        self.assertFalse(result["prerequisites"]["degreeLedgerAcceptedAsModuleSeed"])

    def test_one_heavy_worker_and_partial_modules_are_persisted(self) -> None:
        worker, solver = self.runners(candidate=False)
        result = portfolio.run_portfolio(
            self.config(), worker_runner=worker, solver_runner=solver
        )
        self.assertEqual(worker.calls, [2, 3, 5, 7, 11])
        self.assertEqual(worker.maximum_active_heavy, 1)
        modules = result["modulePortfolio"]["modules"]
        self.assertEqual(len(modules), 2)
        self.assertTrue(all(module["status"] == "partial" for module in modules))
        self.assertEqual(
            {
                tuple(module["exactWitnessCoverage"]["coveredWitnessIds"])
                for module in modules
            },
            {("w:s0",), ("w:s1",)},
        )
        self.assertTrue(
            all(
                len(module["generatorPermutationHashes"]["perGenerator"]) == 2
                for module in modules
            )
        )
        self.assertIsNone(result["materializationRequest"])
        self.assertIsNone(result["materializedAction"])
        self.assertEqual(solver.materialization_calls, 0)
        self.assertFalse(result["promotionGate"]["fiberingPipelineInvoked"])
        self.assertTrue(result["workerPortfolioCompleteness"]["complete"])
        self.assertEqual(result["status"], "complete-no-survivor")

    def test_one_incomplete_odd_prime_forces_incomplete_no_survivor(self) -> None:
        expected_bindings = {
            prime: {
                "runKey": "a" * 64,
                "jobId": f"p{prime}",
                "jobSha256": f"{prime:x}".rjust(64, "0"),
                "workerImplementationSha256": "b" * 64,
                "returnCode": 0,
                "timedOut": False,
                "cancelled": False,
            }
            for prime in portfolio.SCHEDULED_PRIMES
        }
        records = [
            {
                "scheduledPrime": prime,
                "ok": True,
                # A naked boundedComplete value is deliberately irrelevant.
                "searchCompleteness": {"boundedComplete": True},
                "derivedResidueCompletion": {
                    "complete": prime != 7,
                    "declaredRationalPrimes": [prime],
                    "artifactDeclaredImplementationSha256": "b" * 64,
                    "reasons": (
                        ["one or more declared residue searches are nonterminal"]
                        if prime == 7
                        else []
                    ),
                },
                "scheduledExecution": expected_bindings[prime],
                "modules": [],
                "catalogueComplete": False,
            }
            for prime in portfolio.SCHEDULED_PRIMES
        ]
        summary = portfolio.summarize_worker_portfolio_completeness(
            records, expected_bindings=expected_bindings
        )
        self.assertFalse(summary["complete"])
        p7 = next(
            row for row in summary["characteristics"] if row["characteristic"] == 7
        )
        self.assertFalse(p7["complete"])
        self.assertIn("derived residue search is incomplete", p7["reasons"])

        config = self.config("incomplete-p7")
        input_hash = portfolio.build_plan(config)["inputSha256"]
        worker = FakeWorkerRunner(
            input_hash,
            self.root / "incomplete-p7-storage",
            incomplete_prime=7,
        )
        result = portfolio.run_portfolio(
            config,
            worker_runner=worker,
            solver_runner=FakeSolverRunner(candidate=False),
        )
        self.assertEqual(result["status"], "incomplete-no-survivor")
        self.assertFalse(result["workerPortfolioCompleteness"]["complete"])

    def test_derived_residue_completion_rejects_duplicate_catalogue_entries(
        self,
    ) -> None:
        artifact = fake_worker_artifact(
            root=self.root / "duplicate-residue-storage",
            input_hash=portfolio.build_plan(self.config())["inputSha256"],
            prime=5,
            include_module=False,
        )
        artifact["residueAttempts"].append(dict(artifact["residueAttempts"][0]))
        artifact["searchCompleteness"]["boundedComplete"] = True
        artifact["searchCompleteness"]["residueCandidatesExamined"] = 2
        derived = portfolio.derive_residue_search_completion(
            artifact, expected_max_index=576_000
        )
        self.assertFalse(derived["complete"])
        self.assertTrue(
            any(
                "duplicated" in reason
                for row in derived["terminalRecords"]
                for reason in row["reasons"]
            )
        )

    def test_worker_source_hash_mismatch_blocks_completion(self) -> None:
        expected_bindings: dict[int, dict[str, Any]] = {}
        records: list[dict[str, Any]] = []
        for prime in portfolio.SCHEDULED_PRIMES:
            binding = {
                "runKey": "a" * 64,
                "jobId": f"p{prime}",
                "jobSha256": f"{prime:x}".rjust(64, "0"),
                "workerImplementationSha256": "b" * 64,
                "returnCode": 0,
                "timedOut": False,
                "cancelled": False,
            }
            expected_bindings[prime] = binding
            records.append(
                {
                    "scheduledPrime": prime,
                    "ok": True,
                    "derivedResidueCompletion": {
                        "complete": True,
                        "declaredRationalPrimes": [prime],
                        "artifactDeclaredImplementationSha256": (
                            "c" * 64 if prime == 5 else "b" * 64
                        ),
                        "reasons": [],
                    },
                    "scheduledExecution": binding,
                    "modules": [],
                    "catalogueComplete": False,
                }
            )
        summary = portfolio.summarize_worker_portfolio_completeness(
            records, expected_bindings=expected_bindings
        )
        self.assertFalse(summary["complete"])
        p5 = next(
            row for row in summary["characteristics"] if row["characteristic"] == 5
        )
        self.assertIn(
            "artifact and invoked worker source hashes disagree", p5["reasons"]
        )

    def test_missing_worker_source_hash_blocks_derived_completion(self) -> None:
        artifact = fake_worker_artifact(
            root=self.root / "missing-worker-hash-storage",
            input_hash=portfolio.build_plan(self.config())["inputSha256"],
            prime=5,
            include_module=False,
        )
        del artifact["sphericalCatalogue"]["implementationSha256"]
        derived = portfolio.derive_residue_search_completion(
            artifact, expected_max_index=576_000
        )
        self.assertFalse(derived["complete"])
        self.assertIn(
            "worker artifact omits its implementation hash", derived["reasons"]
        )

    def test_nonzero_worker_exit_blocks_portfolio_completion(self) -> None:
        expected_bindings: dict[int, dict[str, Any]] = {}
        records: list[dict[str, Any]] = []
        for prime in portfolio.SCHEDULED_PRIMES:
            binding = {
                "runKey": "a" * 64,
                "jobId": f"p{prime}",
                "jobSha256": f"{prime:x}".rjust(64, "0"),
                "workerImplementationSha256": "b" * 64,
                "returnCode": 1 if prime == 7 else 0,
                "timedOut": False,
                "cancelled": False,
            }
            expected_bindings[prime] = binding
            records.append(
                {
                    "scheduledPrime": prime,
                    "ok": True,
                    "derivedResidueCompletion": {
                        "complete": True,
                        "declaredRationalPrimes": [prime],
                        "artifactDeclaredImplementationSha256": "b" * 64,
                        "reasons": [],
                    },
                    "scheduledExecution": binding,
                    "modules": [],
                    "catalogueComplete": False,
                }
            )
        summary = portfolio.summarize_worker_portfolio_completeness(
            records, expected_bindings=expected_bindings
        )
        p7 = next(
            row for row in summary["characteristics"] if row["characteristic"] == 7
        )
        self.assertFalse(summary["complete"])
        self.assertIn("worker process did not terminate successfully", p7["reasons"])

    def test_missing_mod2_packed_seed_fails_before_composite_search(self) -> None:
        input_hash = portfolio.build_plan(self.config())["inputSha256"]
        worker = FakeWorkerRunner(
            input_hash,
            self.root / "missing-mod2-storage",
            omit_mod2=True,
        )
        solver = FakeSolverRunner(candidate=False)
        with self.assertRaisesRegex(
            portfolio.MissingRequiredModuleError,
            "degree ledger alone is not a module seed",
        ):
            portfolio.run_portfolio(
                self.config("missing-mod2"),
                worker_runner=worker,
                solver_runner=solver,
            )
        self.assertEqual(solver.calls, 0)

    def test_zero_mod3_modules_without_complete_obstruction_fails(self) -> None:
        config = self.config("missing-mod3")
        input_hash = portfolio.build_plan(config)["inputSha256"]
        worker = FakeWorkerRunner(
            input_hash,
            self.root / "missing-mod3-storage",
            omit_mod3=True,
        )
        solver = FakeSolverRunner(candidate=False)
        with self.assertRaisesRegex(
            portfolio.MissingRequiredModuleError,
            "hash-bound complete recognized-index/factor obstruction",
        ):
            portfolio.run_portfolio(
                config,
                worker_runner=worker,
                solver_runner=solver,
            )
        self.assertEqual(solver.calls, 0)

    def test_resume_reuses_checked_content_addressed_artifacts(self) -> None:
        worker, solver = self.runners(candidate=False)
        first = portfolio.run_portfolio(
            self.config("resume"), worker_runner=worker, solver_runner=solver
        )
        second_solver = FakeSolverRunner(candidate=False)
        second = portfolio.run_portfolio(
            self.config("resume"),
            worker_runner=NoCallRunner(),
            solver_runner=second_solver,
        )
        self.assertEqual(first["inputSha256"], second["inputSha256"])
        self.assertEqual(
            first["modulePortfolio"]["catalogueSha256"],
            second["modulePortfolio"]["catalogueSha256"],
        )
        self.assertEqual(second_solver.calls, 1)

    def test_resume_rejects_a_stale_source_hash(self) -> None:
        worker, solver = self.runners(candidate=False)
        portfolio.run_portfolio(
            self.config("stale"), worker_runner=worker, solver_runner=solver
        )
        self.input_path.write_text('{"name":"changed"}', encoding="utf-8")
        with self.assertRaises(portfolio.StaleCheckpointError):
            portfolio.run_portfolio(
                self.config("stale"),
                worker_runner=NoCallRunner(),
                solver_runner=NoCallRunner(),
            )

    def test_resume_rejects_a_tampered_ingestion_object(self) -> None:
        worker, solver = self.runners(candidate=False)
        config = self.config("tampered-ingestion")
        portfolio.run_portfolio(config, worker_runner=worker, solver_runner=solver)
        checkpoint = json.loads(
            (config.output_dir / "portfolio.checkpoint.json").read_text(
                encoding="utf-8"
            )
        )
        record = next(iter(checkpoint["jobs"].values()))
        object_path = config.output_dir / record["ingestionObject"]
        object_path.write_text("{}\n", encoding="utf-8")
        with self.assertRaisesRegex(portfolio.StaleCheckpointError, "changed on disk"):
            portfolio.run_portfolio(
                config,
                worker_runner=NoCallRunner(),
                solver_runner=NoCallRunner(),
            )

    def test_worker_artifact_with_stale_input_hash_is_rejected(self) -> None:
        artifact_root = self.root / "artifact-storage"
        artifact = fake_worker_artifact(
            root=artifact_root,
            input_hash="a" * 64,
            prime=3,
            include_module=True,
        )
        artifact_path = self.root / "stale-artifact.json"
        portfolio.atomic_write_json(artifact_path, artifact)
        store = portfolio.ContentAddressedStore(
            self.root / "objects", self.root / "module-store", 10_000_000
        )
        with self.assertRaises(portfolio.StaleArtifactError):
            portfolio.ingest_artifact(
                artifact_path,
                expected_input_hash="b" * 64,
                expected_max_index=576_000,
                store=store,
            )

    def test_exact_search_rows_rebuild_an_interrupted_catalogue(self) -> None:
        input_hash = portfolio.build_plan(self.config())["inputSha256"]
        artifact = fake_worker_artifact(
            root=self.root / "recovery-source",
            input_hash=input_hash,
            prime=2,
            include_module=True,
        )
        artifact.pop("partialModuleCatalogue")
        artifact.pop("partialModuleCatalogueStorageRoot")
        artifact.pop("artifactHash")
        artifact["artifactHash"] = portfolio.sha256_json(artifact)
        artifact_path = self.root / "recover.json"
        portfolio.atomic_write_json(artifact_path, artifact)
        store = portfolio.ContentAddressedStore(
            self.root / "recovery-objects",
            self.root / "recovery-modules",
            10_000_000,
        )
        ingested = portfolio.ingest_artifact(
            artifact_path,
            expected_input_hash=input_hash,
            expected_max_index=576_000,
            store=store,
        )
        self.assertEqual(len(ingested["modules"]), 1)
        self.assertEqual(
            ingested["catalogue"]["scope"]["kind"],
            "recovered-bounded-finite-image-subgroup-search",
        )

    def test_survivor_gate_is_the_only_source_of_action_materialization(self) -> None:
        no_worker, no_solver = self.runners(candidate=False)
        no_result = portfolio.run_portfolio(
            self.config("no-survivor"),
            worker_runner=no_worker,
            solver_runner=no_solver,
        )
        self.assertIsNone(no_result["materializationRequest"])
        self.assertIsNone(no_result["materializedAction"])
        self.assertEqual(no_solver.search_calls, 1)
        self.assertEqual(no_solver.materialization_calls, 0)

        yes_worker, yes_solver = self.runners(candidate=True)
        yes_result = portfolio.run_portfolio(
            self.config("survivor"),
            worker_runner=yes_worker,
            solver_runner=yes_solver,
        )
        request_summary = yes_result["materializationRequest"]
        self.assertIsNotNone(request_summary)
        self.assertEqual(yes_solver.search_calls, 1)
        self.assertEqual(yes_solver.materialization_calls, 1)
        self.assertEqual(yes_solver.calls, 2)
        request = json.loads(
            (self.root / "survivor" / request_summary["path"]).read_text(
                encoding="utf-8"
            )
        )
        self.assertTrue(request["gate"]["witnessFreeDiagonalOrbit"])
        self.assertTrue(request["gate"]["fullActionMaterialized"])
        self.assertEqual(request["status"], "fulfilled")
        self.assertEqual(yes_result["materializedAction"]["status"], "verified")
        self.assertEqual(yes_result["materializedAction"]["degree"], 4)
        self.assertIn("virtual algebraic fibering", request["nonClaims"])
        self.assertFalse(yes_result["promotionGate"]["fiberingPipelineInvoked"])

    def test_survivor_alone_invokes_hash_bound_full_davis_promotion(self) -> None:
        no_worker, no_solver = self.runners(candidate=False)
        no_promotion = NoCallRunner()
        portfolio.run_portfolio(
            self.config(
                "no-survivor-promotion",
                run_fibering_pipeline=True,
                fibering_runtime=("fake-runtime",),
            ),
            worker_runner=no_worker,
            solver_runner=no_solver,
            promotion_runner=no_promotion,
        )

        yes_worker, yes_solver = self.runners(candidate=True)
        promotion = FakePromotionRunner()
        result = portfolio.run_portfolio(
            self.config(
                "survivor-promotion",
                run_fibering_pipeline=True,
                fibering_runtime=("fake-runtime",),
            ),
            worker_runner=yes_worker,
            solver_runner=yes_solver,
            promotion_runner=promotion,
        )

        self.assertEqual(promotion.calls, 2)
        self.assertTrue(result["promotionGate"]["fiberingPipelineInvoked"])
        self.assertFalse(result["promotionGate"]["sphericalFreenessPassed"])
        self.assertEqual(result["fullDavisPromotion"]["status"], "incomplete")
        self.assertEqual(result["status"], "materialized-witness-free-survivor")
        promotion_object = result["fullDavisPromotion"]["artifactObject"]
        self.assertTrue((self.root / "survivor-promotion" / promotion_object).is_file())
        self.assertIn("virtual algebraic fibering", result["nonClaims"])

    def test_tampered_promotion_artifact_fails_closed(self) -> None:
        worker, solver = self.runners(candidate=True)
        with self.assertRaises(portfolio.InvalidPromotionArtifactError):
            portfolio.run_portfolio(
                self.config(
                    "tampered-promotion",
                    run_fibering_pipeline=True,
                    fibering_runtime=("fake-runtime",),
                ),
                worker_runner=worker,
                solver_runner=solver,
                promotion_runner=FakePromotionRunner(tamper_hash=True),
            )

    def test_independent_promotion_verifier_is_mandatory(self) -> None:
        worker, solver = self.runners(candidate=True)
        with self.assertRaisesRegex(
            portfolio.InvalidPromotionArtifactError,
            "verifier-only replay did not terminate successfully",
        ):
            portfolio.run_portfolio(
                self.config(
                    "rejected-promotion-replay",
                    run_fibering_pipeline=True,
                    fibering_runtime=("fake-runtime",),
                ),
                worker_runner=worker,
                solver_runner=solver,
                promotion_runner=FakePromotionRunner(reject_verifier=True),
            )

    def test_promotion_bound_to_different_source_file_fails_closed(self) -> None:
        worker, solver = self.runners(candidate=True)
        with self.assertRaisesRegex(
            portfolio.InvalidPromotionArtifactError,
            "different source-system bytes",
        ):
            portfolio.run_portfolio(
                self.config(
                    "wrong-source-promotion",
                    run_fibering_pipeline=True,
                    fibering_runtime=("fake-runtime",),
                ),
                worker_runner=worker,
                solver_runner=solver,
                promotion_runner=FakePromotionRunner(tamper_source_system=True),
            )

    def test_real_typescript_promotion_replays_the_checked_fixture(self) -> None:
        fixture_root = (
            Path(__file__).resolve().parents[1]
            / "tests"
            / "fixtures"
            / "materialized-actions"
        )
        system_path = fixture_root / "product-system.json"
        action_path = fixture_root / "product-action.json"
        config = self.config(
            "real-typescript-promotion",
            input_path=system_path,
            run_fibering_pipeline=True,
            fibering_exact_wall_limit=8,
            fibering_max_candidates=16,
            fibering_timeout=60,
        )
        if portfolio.resolve_fibering_runtime(config) is None:
            self.skipTest("No installed Node/pnpm runtime for the integration replay")
        action = json.loads(action_path.read_text(encoding="utf-8"))
        candidate = action["candidate"]
        materialized_summary = {
            "artifactSha256": portfolio.sha256_file(action_path),
            "actionSha256": candidate["actionSha256"],
            "candidateId": candidate["id"],
            "degree": candidate["degree"],
        }
        store = portfolio.ContentAddressedStore(
            config.output_dir / "objects" / "sha256",
            config.output_dir / "module-store",
            config.max_object_bytes,
        )
        summary, execution, artifact_path = portfolio.run_fibering_promotion(
            config,
            runner=portfolio.SubprocessJobRunner(config.output_dir / "logs"),
            cancel_event=threading.Event(),
            materialized_action_path=action_path,
            materialized_summary=materialized_summary,
            store=store,
            run_key="integration-fixture",
        )
        self.assertIsNotNone(execution)
        self.assertIsNotNone(artifact_path)
        self.assertEqual(summary["status"], "passed")
        self.assertEqual(execution.return_code, 0)
        self.assertEqual(
            set(summary["implementation"]["hashes"]),
            {
                "runner",
                "materializedActionPipeline",
                "fullDavisSearch",
                "fullDavisCertificate",
                "fullDavisMorse",
            },
        )

    def test_unknown_composite_result_never_materializes(self) -> None:
        config = self.config("unknown-solver")
        input_hash = portfolio.build_plan(config)["inputSha256"]
        worker = FakeWorkerRunner(input_hash, self.root / "unknown-solver-storage")
        solver = FakeSolverRunner(candidate=False, unknown=True)
        result = portfolio.run_portfolio(
            config,
            worker_runner=worker,
            solver_runner=solver,
        )
        self.assertEqual(result["status"], "incomplete-no-survivor")
        self.assertEqual(solver.search_calls, 1)
        self.assertEqual(solver.materialization_calls, 0)
        self.assertIsNone(result["materializedAction"])

    def test_no_survivor_result_is_bound_to_run_problem_source_and_bounds(self) -> None:
        config = self.config("stale-solver-binding")
        input_hash = portfolio.build_plan(config)["inputSha256"]
        worker = FakeWorkerRunner(
            input_hash, self.root / "stale-solver-binding-storage"
        )
        with self.assertRaisesRegex(
            portfolio.StaleArtifactError, "execution binding is stale"
        ):
            portfolio.run_portfolio(
                config,
                worker_runner=worker,
                solver_runner=FakeSolverRunner(candidate=False, fault="stale-binding"),
            )

    def test_solver_result_bound_to_another_output_path_is_rejected(self) -> None:
        config = self.config("wrong-solver-output-path")
        input_hash = portfolio.build_plan(config)["inputSha256"]
        worker = FakeWorkerRunner(
            input_hash, self.root / "wrong-solver-output-path-storage"
        )
        with self.assertRaisesRegex(
            portfolio.StaleArtifactError, "execution binding is stale"
        ):
            portfolio.run_portfolio(
                config,
                worker_runner=worker,
                solver_runner=FakeSolverRunner(
                    candidate=False, fault="wrong-output-path"
                ),
            )

    def test_inconsistent_no_survivor_result_is_rejected(self) -> None:
        config = self.config("inconsistent-solver-result")
        input_hash = portfolio.build_plan(config)["inputSha256"]
        worker = FakeWorkerRunner(
            input_hash, self.root / "inconsistent-solver-result-storage"
        )
        with self.assertRaisesRegex(
            portfolio.StaleArtifactError, "status, completeness flag"
        ):
            portfolio.run_portfolio(
                config,
                worker_runner=worker,
                solver_runner=FakeSolverRunner(
                    candidate=False, fault="inconsistent-no-survivor"
                ),
            )

    def test_timed_out_or_cancelled_solver_result_is_rejected(self) -> None:
        for fault in ("timed-out", "cancelled"):
            with self.subTest(fault=fault):
                config = self.config(f"solver-{fault}")
                input_hash = portfolio.build_plan(config)["inputSha256"]
                worker = FakeWorkerRunner(
                    input_hash, self.root / f"solver-{fault}-storage"
                )
                with self.assertRaisesRegex(
                    portfolio.StaleArtifactError, "timed-out or cancelled"
                ):
                    portfolio.run_portfolio(
                        config,
                        worker_runner=worker,
                        solver_runner=FakeSolverRunner(candidate=False, fault=fault),
                    )

    def test_preexisting_solver_result_is_removed_before_execution(self) -> None:
        class NoWriteRunner(FakeSolverRunner):
            def run(self, job: Any, **kwargs: Any) -> portfolio.WorkerExecution:
                self.assert_output_was_cleared = not job.output_path.exists()
                return super().run(job, **kwargs)

        config = self.config("cleared-solver-result")
        input_hash = portfolio.build_plan(config)["inputSha256"]
        worker = FakeWorkerRunner(
            input_hash, self.root / "cleared-solver-result-storage"
        )
        portfolio.run_portfolio(
            config,
            worker_runner=worker,
            solver_runner=FakeSolverRunner(candidate=False),
        )
        solver = NoWriteRunner(candidate=False, fault="no-write")
        rerun = self.config("cleared-solver-result", resume=False)
        rerun_worker = FakeWorkerRunner(
            input_hash, self.root / "cleared-solver-result-storage-rerun"
        )
        with self.assertRaisesRegex(
            portfolio.WorkerExecutionError, "produced no result"
        ):
            portfolio.run_portfolio(
                rerun, worker_runner=rerun_worker, solver_runner=solver
            )
        self.assertTrue(solver.assert_output_was_cleared)

    def test_fake_residue_workers_feed_the_real_packed_solver(self) -> None:
        worker, _unused_solver = self.runners(candidate=False)
        config = self.config("real-packed-solver")
        result = portfolio.run_portfolio(
            config,
            worker_runner=worker,
            solver_runner=portfolio.SubprocessJobRunner(
                config.output_dir / "test-logs"
            ),
        )
        self.assertEqual(result["status"], "materialized-witness-free-survivor")
        self.assertEqual(
            result["compositeSearch"]["summary"]["candidate"]["decompositionKind"],
            "double-coset-diagonal-orbits",
        )
        self.assertIsNotNone(result["materializationRequest"])
        self.assertEqual(result["materializedAction"]["status"], "verified")
        action_object = (
            config.output_dir / result["materializedAction"]["artifactObject"]
        )
        self.assertTrue(action_object.is_file())
        self.assertEqual(
            portfolio.sha256_file(action_object),
            result["materializedAction"]["artifactSha256"],
        )

    def test_complete_mod3_zero_module_obstruction_allows_composite_search(
        self,
    ) -> None:
        config = self.config("mod3-obstruction")
        input_hash = portfolio.build_plan(config)["inputSha256"]
        worker = FakeWorkerRunner(
            input_hash,
            self.root / "mod3-obstruction-storage",
            p3_obstruction=True,
        )
        solver = FakeSolverRunner(candidate=False)
        result = portfolio.run_portfolio(
            config,
            worker_runner=worker,
            solver_runner=solver,
        )
        self.assertEqual(result["modulePortfolio"]["moduleCount"], 1)
        obstructions = result["modulePortfolio"]["degreeCompatibilityObstructions"]
        self.assertEqual(len(obstructions), 1)
        self.assertEqual(obstructions[0]["characteristic"], 3)
        self.assertTrue(obstructions[0]["complete"])
        self.assertEqual(
            obstructions[0]["partialModuleDegreeScreen"]["compatibleDegrees"],
            [],
        )
        self.assertEqual(solver.search_calls, 1)
        self.assertEqual(solver.materialization_calls, 0)

    def test_mod3_obstruction_rejects_stale_recognition_hash(self) -> None:
        input_hash = portfolio.build_plan(self.config())["inputSha256"]
        artifact = fake_worker_artifact(
            root=self.root / "stale-obstruction-storage",
            input_hash=input_hash,
            prime=3,
            include_module=False,
            complete_mod3_obstruction=True,
        )
        artifact["residueAttempts"][0]["recognitionBridge"]["actionHash"] = "f" * 64
        artifact.pop("artifactHash")
        artifact["artifactHash"] = portfolio.sha256_json(artifact)
        path = self.root / "stale-obstruction.json"
        portfolio.atomic_write_json(path, artifact)
        store = portfolio.ContentAddressedStore(
            self.root / "stale-obstruction-objects",
            self.root / "stale-obstruction-modules",
            10_000_000,
        )
        with self.assertRaisesRegex(portfolio.StaleArtifactError, "stale action hash"):
            portfolio.ingest_artifact(
                path,
                expected_input_hash=input_hash,
                expected_max_index=576_000,
                store=store,
            )

    def test_mod3_structural_certificate_is_hash_bound_and_p3_only(self) -> None:
        certificate = self.root / "mod3-certificate.json"
        certificate.write_text('{"certificate":"first"}\n', encoding="utf-8")
        first = portfolio.build_plan(
            self.config(
                "certificate-first",
                mod3_structural_certificate=certificate,
                dry_run=True,
            )
        )
        p3 = next(job for job in first["jobs"] if job.prime == 3)
        self.assertIn("--structural-certificate", p3.command)
        self.assertEqual(
            Path(p3.command[p3.command.index("--structural-certificate") + 1]),
            certificate,
        )
        self.assertTrue(
            all(
                "--structural-certificate" not in job.command
                for job in first["jobs"]
                if job.prime != 3
            )
        )
        first_hash = first["scientificConfig"]["mod3StructuralCertificate"]["sha256"]
        certificate.write_text('{"certificate":"second"}\n', encoding="utf-8")
        second = portfolio.build_plan(
            self.config(
                "certificate-second",
                mod3_structural_certificate=certificate,
                dry_run=True,
            )
        )
        self.assertNotEqual(
            first_hash,
            second["scientificConfig"]["mod3StructuralCertificate"]["sha256"],
        )
        self.assertNotEqual(first["runKey"], second["runKey"])

    def test_absent_mod3_certificate_passes_no_claim_to_worker(self) -> None:
        missing = self.root / "missing-mod3-certificate.json"
        plan = portfolio.build_plan(
            self.config(
                "certificate-absent",
                mod3_structural_certificate=missing,
                dry_run=True,
            )
        )
        self.assertEqual(
            plan["scientificConfig"]["mod3StructuralCertificate"],
            {"status": "absent", "sha256": None},
        )
        self.assertTrue(
            all("--structural-certificate" not in job.command for job in plan["jobs"])
        )

    def test_odd_prime_structural_certificates_are_hash_bound_and_routed(self) -> None:
        certificates = {}
        updates = {}
        for prime in (5, 7, 11):
            path = self.root / f"mod{prime}-certificate.json"
            path.write_text(json.dumps({"characteristic": prime}), encoding="utf-8")
            certificates[prime] = path
            updates[f"mod{prime}_structural_certificate"] = path
        plan = portfolio.build_plan(
            self.config("odd-certificates", dry_run=True, **updates)
        )
        for job in plan["jobs"]:
            if job.prime not in certificates:
                self.assertNotIn("--structural-certificate", job.command)
                continue
            option = job.command.index("--structural-certificate")
            self.assertEqual(Path(job.command[option + 1]), certificates[job.prime])
            record = plan["scientificConfig"][
                "structuralCertificatesByCharacteristic"
            ][str(job.prime)]
            self.assertEqual(record["status"], "available")
            self.assertEqual(record["sha256"], portfolio.sha256_file(certificates[job.prime]))

    def test_mod3_certificate_change_invalidates_checkpoint(self) -> None:
        certificate = self.root / "checkpoint-mod3-certificate.json"
        certificate.write_text('{"certificate":"first"}\n', encoding="utf-8")
        config = self.config(
            "certificate-checkpoint",
            mod3_structural_certificate=certificate,
        )
        input_hash = portfolio.build_plan(config)["inputSha256"]
        portfolio.run_portfolio(
            config,
            worker_runner=FakeWorkerRunner(
                input_hash, self.root / "certificate-checkpoint-storage"
            ),
            solver_runner=FakeSolverRunner(candidate=False),
        )
        certificate.write_text('{"certificate":"changed"}\n', encoding="utf-8")
        with self.assertRaises(portfolio.StaleCheckpointError):
            portfolio.run_portfolio(
                config,
                worker_runner=NoCallRunner(),
                solver_runner=NoCallRunner(),
            )

    def test_action_byte_cap_blocks_materialization_call(self) -> None:
        worker, solver = self.runners(candidate=True)
        with self.assertRaises(portfolio.PortfolioBudgetExceeded):
            portfolio.run_portfolio(
                self.config("action-cap", max_action_bytes=1),
                worker_runner=worker,
                solver_runner=solver,
            )
        self.assertEqual(solver.search_calls, 1)
        self.assertEqual(solver.materialization_calls, 0)

    def test_content_store_fails_instead_of_dropping_a_module(self) -> None:
        source = self.root / "oversized.bin"
        source.write_bytes(b"1234")
        store = portfolio.ContentAddressedStore(
            self.root / "small-objects",
            self.root / "small-modules",
            maximum_bytes=3,
        )
        descriptor = {
            "sha256": portfolio.sha256_file(source),
            "byteLength": 4,
        }
        with self.assertRaises(portfolio.PortfolioBudgetExceeded):
            store.put_packed(source, descriptor)

    def test_resource_policy_rejects_half_measures(self) -> None:
        with self.assertRaises(ValueError):
            self.config(light_workers=3)
        with self.assertRaises(ValueError):
            self.config(heavy_workers=2)

    def test_schema_example_is_valid_json_with_the_promotion_boundary(self) -> None:
        example_path = (
            Path(__file__).resolve().parent
            / "certificates"
            / "torsion-free"
            / "portfolio-schema.example.json"
        )
        example = json.loads(example_path.read_text(encoding="utf-8"))
        self.assertEqual(example["artifactType"], portfolio.ARTIFACT_TYPE)
        self.assertFalse(example["promotionGate"]["fiberingPipelineInvoked"])
        self.assertFalse(example["promotionGate"]["completeRowsIndependentlyVerified"])
        self.assertFalse(example["promotionGate"]["sphericalFreenessPassed"])
        self.assertFalse(example["promotionGate"]["virtualFiberingCertified"])
        self.assertIsNone(example["fullDavisPromotion"])
        self.assertIsNone(example["materializedAction"])
        self.assertEqual(
            example["modulePortfolio"]["degreeCompatibilityObstructions"][0][
                "characteristic"
            ],
            3,
        )
        self.assertIn("virtual algebraic fibering", example["nonClaims"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
