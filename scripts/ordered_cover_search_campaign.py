#!/usr/bin/env python3
"""Run the compact-5-cube cover search in a strict scientific order.

This program coordinates existing command-line tools.  It does not duplicate
their group theory, and it does not infer that a timeout or a bounded partial
search is an exhaustion result.  Each stage must leave a replayable, hash-bound
artifact before the next stage can start.

The ordered stages are:

1. exact finite-target synthesis in W(D6), W(B6), then W(E6);
2. bounded nonnormal coset-action searches in the exact mod-2/mod-3 images; and
3. the residue-image portfolio for characteristics 5, 7, and 11 together with
   its packed composite solver (the existing portfolio also reuses its mod-2
   and characteristic-3 evidence).

The nonnormal stage binds the 32 maximal spherical restrictions and complete
prime-order witness catalogue used to prune and certify those actions. Its
negative conclusion is restricted to the named finite images and degree bound.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = SCRIPT_DIR.parent

SCHEMA_VERSION = 1
ARTIFACT_TYPE = "coxeter-ordered-cover-search-campaign"
CAMPAIGN_ID = "compact-5-cube-manageable-torsion-free-cover"
ORCHESTRATOR_VERSION = "1.1.0"
EXPECTED_INDEX_DIVISOR = 5_760

DEFAULT_FINITE_SCRIPT = SCRIPT_DIR / "finite_target_synthesis.py"
DEFAULT_NONNORMAL_SCRIPT = SCRIPT_DIR / "nonnormal_coset_action_campaign.py"
DEFAULT_FINITE_IMAGE_WORKER = SCRIPT_DIR / "torsion_free_finite_image.py"
DEFAULT_PORTFOLIO_SCRIPT = SCRIPT_DIR / "run_finite_image_portfolio.py"

FINITE_TARGETS: tuple[tuple[str, str, int], ...] = (
    ("finite-weyl-d6", "D6", 23_040),
    ("finite-weyl-b6", "B6", 46_080),
    ("finite-weyl-e6", "E6", 51_840),
)

# These bounds turn the old quick catalogue sweep into a dedicated target run.
# They are still finite bounds, so reaching one must be reported as incomplete.
FINITE_SEARCH_BOUNDS: dict[str, int] = {
    "maxSubsets": 65_536,
    "maxSphericalOrder": 1_000_000,
    "maxTargetOrderForEnumeration": 100_000,
    "maxInvolutions": 100_000,
    "maxInvolutionClasses": 10_000,
    "maxPrecheckNodesPerType": 50_000_000,
    "maxAnchorSearchNodes": 150_000_000,
    "maxAnchorClasses": 65_536,
    "maxSearchNodes": 100_000_000,
    "maxSolutionsPerTarget": 8,
    "maxPermutationDegree": 100_000,
    "maxVerifyImageOrder": 1_000_000,
    "timeoutSecondsPerPrecheck": 3_600,
    "timeoutSecondsPerAnchor": 43_200,
    "timeoutSecondsPerTarget": 86_400,
}

TERMINAL_CANDIDATE = "candidate-found"
TERMINAL_EXHAUSTED = "exhausted"
NONTERMINAL = "incomplete"


class CampaignError(RuntimeError):
    """The campaign cannot proceed without weakening its evidence contract."""


class ArtifactError(CampaignError):
    """A child artifact is stale, malformed, or scientifically ambiguous."""


@dataclass(frozen=True)
class StageSpec:
    id: str
    order: int
    kind: str
    depends_on: tuple[str, ...]
    artifact_path: Path
    request: dict[str, Any]
    binding_sha256: str
    target_type: str | None = None
    target_order: int | None = None


@dataclass(frozen=True)
class ProcessResult:
    returncode: int | None
    timed_out: bool
    cancelled: bool


@dataclass(frozen=True)
class ArtifactOutcome:
    outcome: str
    child_status: str
    complete: bool
    candidate_count: int
    warnings: tuple[str, ...]
    errors: tuple[str, ...]


def canonical_json(value: Any) -> str:
    """Encode the exact byte representation used by every campaign hash."""

    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise CampaignError(f"Cannot encode canonical JSON: {exc}") from exc


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def read_json_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ArtifactError(f"Cannot read JSON object {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ArtifactError(f"{path} must contain one JSON object")
    return value


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def seal(value: Mapping[str, Any], hash_field: str = "artifactHash") -> dict[str, Any]:
    result = dict(value)
    result.pop(hash_field, None)
    result[hash_field] = sha256_json(result)
    return result


def verify_seal(value: Mapping[str, Any], hash_field: str) -> None:
    supplied = value.get(hash_field)
    payload = {key: item for key, item in value.items() if key != hash_field}
    if not isinstance(supplied, str) or supplied != sha256_json(payload):
        raise ArtifactError(f"Artifact {hash_field} does not replay")


def string_list(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(str(item) for item in value)


def relative_output_path(path: Path, output_dir: Path) -> str:
    try:
        return path.resolve().relative_to(output_dir.resolve()).as_posix()
    except ValueError as exc:
        raise CampaignError(
            f"Stage output escapes the campaign directory: {path}"
        ) from exc


def validate_source(path: Path) -> tuple[dict[str, Any], str]:
    if not path.is_file():
        raise CampaignError(f"Coxeter source file is missing: {path}")
    raw = read_json_object(path)
    source = raw.get("sourceSystem", raw)
    if not isinstance(source, dict):
        raise CampaignError("Coxeter sourceSystem must be an object")
    name = source.get("name")
    rank = source.get("rank")
    matrix = source.get("coxeterMatrix")
    if not isinstance(name, str) or not name.strip():
        raise CampaignError("Coxeter source needs a nonempty name")
    if isinstance(rank, bool) or not isinstance(rank, int) or rank < 1:
        raise CampaignError("Coxeter source rank must be a positive integer")
    if not isinstance(matrix, list) or len(matrix) != rank:
        raise CampaignError("Coxeter source matrix does not match its rank")
    return {"fileName": path.name, "name": name, "rank": rank}, sha256_file(path)


def require_script(path: Path, label: str) -> str:
    if not path.is_file():
        raise CampaignError(f"{label} CLI is missing: {path}")
    return sha256_file(path)


def finite_target_config(target_type: str) -> dict[str, Any]:
    """Isolate one Weyl target while retaining exact bounded-search semantics."""

    return {
        "symmetricDegrees": [],
        "weylTypes": [target_type],
        "classicalTargets": [],
        "bounds": dict(FINITE_SEARCH_BOUNDS),
    }


def stage_request_hash(
    *,
    stage_id: str,
    source_sha256: str,
    script_sha256: str,
    request: Mapping[str, Any],
    supplemental_hashes: Mapping[str, str],
) -> str:
    return sha256_json(
        {
            "stageId": stage_id,
            "sourceSha256": source_sha256,
            "scriptSha256": script_sha256,
            "request": dict(request),
            "supplementalInputHashes": dict(sorted(supplemental_hashes.items())),
        }
    )


def build_stage_specs(
    args: argparse.Namespace,
    *,
    output_dir: Path,
    source_sha256: str,
    implementation_hashes: Mapping[str, str],
) -> tuple[StageSpec, ...]:
    stages: list[StageSpec] = []
    previous: tuple[str, ...] = ()

    for order, (stage_id, target_type, target_order) in enumerate(FINITE_TARGETS):
        artifact = output_dir / "stages" / stage_id / "artifact.json"
        config = finite_target_config(target_type)
        request = {
            "cli": "finite_target_synthesis.py",
            "argv": [
                "$PYTHON",
                "$FINITE_TARGET_CLI",
                "--input",
                "$SOURCE",
                "--output",
                "$STAGE_ARTIFACT",
                "--target-config",
                "$TARGET_CONFIG",
                "--checkpoint",
                "$STAGE_CHECKPOINT",
            ],
            "target": {
                "type": target_type,
                "order": target_order,
                "expectedKernelIndexIfSurjective": target_order,
            },
            "searchSemantics": {
                "conjugacyReduction": (
                    "complete labeled A5 subgroup catalogue, followed by "
                    "pointwise-centralizer canonical augmentation"
                ),
                "localEmbeddingGate": (
                    "every completed spherical subset has its exact classified order"
                ),
                "globalAcceptance": "all Coxeter relations and every maximal spherical image order",
                "boundedResultPolicy": "a reached node or time bound is incomplete",
            },
            "targetConfig": config,
        }
        binding = stage_request_hash(
            stage_id=stage_id,
            source_sha256=source_sha256,
            script_sha256=implementation_hashes["finiteTargetCliSha256"],
            request=request,
            supplemental_hashes={},
        )
        stages.append(
            StageSpec(
                id=stage_id,
                order=order,
                kind="finite-weyl-target",
                depends_on=previous,
                artifact_path=artifact,
                request=request,
                binding_sha256=binding,
                target_type=target_type,
                target_order=target_order,
            )
        )
        previous = (stage_id,)

    nonnormal_stage_id = "finite-image-nonnormal-p2-p3"
    nonnormal_artifact = output_dir / "stages" / nonnormal_stage_id / "artifact.json"
    nonnormal_supplemental: dict[str, str] = {}
    for index, child_value in enumerate(args.nonnormal_artifact):
        child = Path(child_value).resolve()
        if not child.is_file():
            raise CampaignError(f"Nonnormal finite-image artifact is missing: {child}")
        nonnormal_supplemental[f"childArtifact{index}Sha256"] = sha256_file(child)
    nonnormal_request = {
        "cli": "nonnormal_coset_action_campaign.py",
        "implementationSha256": implementation_hashes["nonnormalCliSha256"],
        "argv": [
            "$PYTHON",
            "$NONNORMAL_CLI",
            "--input",
            "$SOURCE",
            "--output",
            "$STAGE_ARTIFACT",
            "--max-index",
            str(args.max_degree),
            "--worker-python",
            "$FINITE_IMAGE_WORKER_PYTHON",
            "--worker-script",
            "$FINITE_IMAGE_WORKER_CLI",
        ]
        + [
            token for _ in args.nonnormal_artifact for token in ("--artifact", "$CHILD")
        ],
        "scope": {
            "finiteImageCharacteristics": [2, 3],
            "coverModel": "transitive-coset-action-nonnormal-allowed",
            "localDevelopmentCertificate": "32 maximal spherical restrictions plus prime-order witnesses",
            "maxDegree": args.max_degree,
        },
        "completionPolicy": "both bounded finite-image scopes must be complete",
    }
    nonnormal_binding = stage_request_hash(
        stage_id=nonnormal_stage_id,
        source_sha256=source_sha256,
        script_sha256=implementation_hashes["nonnormalCliSha256"],
        request=nonnormal_request,
        supplemental_hashes=nonnormal_supplemental,
    )
    stages.append(
        StageSpec(
            id=nonnormal_stage_id,
            order=len(stages),
            kind="finite-image-nonnormal",
            depends_on=previous,
            artifact_path=nonnormal_artifact,
            request=nonnormal_request,
            binding_sha256=nonnormal_binding,
        )
    )
    previous = (nonnormal_stage_id,)

    seed_hashes: dict[str, str] = {}
    portfolio_seeds = [*args.nonnormal_artifact, *args.seed_artifact]
    for index, seed_value in enumerate(portfolio_seeds):
        seed = Path(seed_value).resolve()
        if not seed.is_file():
            raise CampaignError(f"Portfolio seed artifact is missing: {seed}")
        seed_hashes[f"seedArtifact{index}Sha256"] = sha256_file(seed)
    portfolio_stage_id = "odd-prime-composite"
    portfolio_artifact = (
        output_dir / "stages" / portfolio_stage_id / "portfolio" / "portfolio.json"
    )
    portfolio_request = {
        "cli": "run_finite_image_portfolio.py",
        "argv": [
            "$PORTFOLIO_PYTHON",
            "$PORTFOLIO_CLI",
            "--input",
            "$SOURCE",
            "--output-dir",
            "$PORTFOLIO_OUTPUT_DIR",
            "--resume",
            "--max-index",
            str(args.max_degree),
            "--light-workers",
            str(args.light_workers),
        ]
        + [token for _ in portfolio_seeds for token in ("--seed-artifact", "$SEED")],
        "scope": {
            "requiredOddCharacteristics": [5, 7, 11],
            "reusedEvidence": [2, 3],
            "packedCompositeSolver": True,
            "maxDegree": args.max_degree,
        },
    }
    portfolio_binding = stage_request_hash(
        stage_id=portfolio_stage_id,
        source_sha256=source_sha256,
        script_sha256=implementation_hashes["portfolioCliSha256"],
        request=portfolio_request,
        supplemental_hashes=seed_hashes,
    )
    stages.append(
        StageSpec(
            id=portfolio_stage_id,
            order=len(stages),
            kind="odd-prime-composite",
            depends_on=previous,
            artifact_path=portfolio_artifact,
            request=portfolio_request,
            binding_sha256=portfolio_binding,
        )
    )
    return tuple(stages)


def initial_stage_record(spec: StageSpec, output_dir: Path) -> dict[str, Any]:
    record: dict[str, Any] = {
        "id": spec.id,
        "order": spec.order,
        "kind": spec.kind,
        "dependsOn": list(spec.depends_on),
        "status": "planned",
        "outcome": "planned",
        "complete": False,
        "bindingSha256": spec.binding_sha256,
        "request": spec.request,
        "artifact": None,
        "process": None,
        "warnings": [],
        "errors": [],
    }
    if spec.target_type is not None:
        record["target"] = {
            "type": spec.target_type,
            "order": spec.target_order,
        }
    record["artifactPath"] = relative_output_path(spec.artifact_path, output_dir)
    return record


def campaign_binding(
    *,
    source_sha256: str,
    implementation_hashes: Mapping[str, str],
    stages: Sequence[StageSpec],
) -> str:
    return sha256_json(
        {
            "campaignId": CAMPAIGN_ID,
            "orchestratorVersion": ORCHESTRATOR_VERSION,
            "sourceSha256": source_sha256,
            "expectedIndexDivisor": EXPECTED_INDEX_DIVISOR,
            "implementationHashes": dict(sorted(implementation_hashes.items())),
            "stageBindings": [stage.binding_sha256 for stage in stages],
        }
    )


def new_manifest(
    *,
    source: Mapping[str, Any],
    source_sha256: str,
    implementation_hashes: Mapping[str, str],
    stages: Sequence[StageSpec],
    output_dir: Path,
    dry_run: bool,
) -> dict[str, Any]:
    binding = campaign_binding(
        source_sha256=source_sha256,
        implementation_hashes=implementation_hashes,
        stages=stages,
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "campaignId": CAMPAIGN_ID,
        "orchestratorVersion": ORCHESTRATOR_VERSION,
        "status": "planned",
        "complete": False,
        "objectiveSatisfied": False,
        "dryRun": dry_run,
        "source": {**dict(source), "sha256": source_sha256},
        "expectedIndexDivisor": EXPECTED_INDEX_DIVISOR,
        "campaignBindingSha256": binding,
        "implementationHashes": dict(sorted(implementation_hashes.items())),
        "orderingPolicy": {
            "stagesRunSequentially": True,
            "advanceOnlyAfterConclusiveExhaustion": True,
            "candidateStopsCampaign": True,
            "timeoutMeansIncomplete": True,
            "boundedEvidenceRequiredBeforeAdvance": True,
        },
        "stages": [initial_stage_record(stage, output_dir) for stage in stages],
        "currentStage": stages[0].id if stages else None,
        "candidateStage": None,
        "warnings": [],
        "errors": [],
    }


def write_manifest(path: Path, manifest: Mapping[str, Any]) -> dict[str, Any]:
    sealed = seal(manifest)
    atomic_write_json(path, sealed)
    return sealed


def load_resume_manifest(
    path: Path,
    *,
    expected_binding: str,
    stage_specs: Sequence[StageSpec],
) -> dict[str, Any]:
    manifest = read_json_object(path)
    verify_seal(manifest, "artifactHash")
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise CampaignError("Campaign manifest has an unsupported schemaVersion")
    if manifest.get("artifactType") != ARTIFACT_TYPE:
        raise CampaignError("Campaign manifest has the wrong artifactType")
    if manifest.get("campaignBindingSha256") != expected_binding:
        raise CampaignError(
            "Campaign inputs, bounds, or implementations changed; refusing stale resume"
        )
    records = manifest.get("stages")
    if not isinstance(records, list) or [item.get("id") for item in records] != [
        stage.id for stage in stage_specs
    ]:
        raise CampaignError("Campaign stage order changed; refusing stale resume")
    for record, spec in zip(records, stage_specs, strict=True):
        if record.get("bindingSha256") != spec.binding_sha256:
            raise CampaignError(f"Stage binding changed for {spec.id}")
    manifest.pop("artifactHash", None)
    manifest["dryRun"] = False
    return manifest


def finite_outcome(
    artifact: Mapping[str, Any], spec: StageSpec, source_sha256: str
) -> ArtifactOutcome:
    verify_seal(artifact, "artifactHash")
    if artifact.get("schemaVersion") != 1:
        raise ArtifactError("Finite-target artifact has unsupported schemaVersion")
    if artifact.get("artifactType") != "coxeter-cover-search-track":
        raise ArtifactError("Finite-target artifact has the wrong artifactType")
    if artifact.get("track") != "finite-target-synthesis":
        raise ArtifactError("Finite-target artifact has the wrong track")
    if artifact.get("inputHash") != source_sha256:
        raise ArtifactError("Finite-target artifact belongs to another source file")
    if artifact.get("lowerBoundDivisor") != EXPECTED_INDEX_DIVISOR:
        raise ArtifactError("Finite-target artifact has the wrong index divisor")
    if not isinstance(artifact.get("complete"), bool):
        raise ArtifactError("Finite-target artifact does not declare completeness")
    if artifact.get("bounds") != FINITE_SEARCH_BOUNDS:
        raise ArtifactError("Finite-target artifact uses different search bounds")

    evidence = artifact.get("evidence")
    if not isinstance(evidence, dict):
        raise ArtifactError("Finite-target artifact has no evidence object")
    plans = evidence.get("targetPlans")
    results = evidence.get("boundedSearchResults")
    expected_id = f"weyl-{spec.target_type}"
    if not isinstance(plans, list) or [item.get("id") for item in plans] != [
        expected_id
    ]:
        raise ArtifactError(
            "Finite-target artifact does not isolate the requested target"
        )
    if not isinstance(results, list) or [item.get("targetId") for item in results] != [
        expected_id
    ]:
        raise ArtifactError(
            "Finite-target evidence does not match the requested target"
        )

    status = str(artifact.get("status", "incomplete"))
    warnings = string_list(artifact.get("warnings"))
    errors = string_list(artifact.get("errors"))
    candidates = artifact.get("candidates")
    if not isinstance(candidates, list):
        raise ArtifactError("Finite-target candidates must be an array")
    accepted = [item for item in candidates if item.get("accepted") is True]
    if status == "candidate-found" and accepted:
        return ArtifactOutcome(
            TERMINAL_CANDIDATE,
            status,
            bool(artifact["complete"]),
            len(accepted),
            warnings,
            errors,
        )
    scope = artifact.get("scope")
    bounded_complete = (
        isinstance(scope, dict)
        and scope.get("boundedHomomorphismSearchComplete") is True
    )
    result_complete = results[0].get("complete") is True
    if (
        status == "exhausted"
        and artifact["complete"] is True
        and bounded_complete
        and result_complete
        and not candidates
        and not errors
    ):
        return ArtifactOutcome(TERMINAL_EXHAUSTED, status, True, 0, warnings, errors)
    return ArtifactOutcome(NONTERMINAL, status, False, len(accepted), warnings, errors)


def nonnormal_outcome(
    artifact: Mapping[str, Any], spec: StageSpec, source_sha256: str
) -> ArtifactOutcome:
    verify_seal(artifact, "artifactHash")
    if artifact.get("schemaVersion") != 1:
        raise ArtifactError("Nonnormal campaign has unsupported schemaVersion")
    if artifact.get("artifactType") != "coxeter-nonnormal-finite-image-campaign":
        raise ArtifactError("Nonnormal campaign has the wrong artifactType")
    provenance = artifact.get("provenance")
    if (
        artifact.get("campaignVersion") != "1.0.0"
        or not isinstance(provenance, dict)
        or provenance.get("implementationSha256")
        != spec.request["implementationSha256"]
    ):
        raise ArtifactError("Nonnormal campaign has stale implementation provenance")
    if artifact.get("inputHash") != source_sha256:
        raise ArtifactError("Nonnormal campaign belongs to another source file")
    if not isinstance(artifact.get("complete"), bool):
        raise ArtifactError("Nonnormal campaign does not declare completeness")
    bounds = artifact.get("bounds")
    requested_scope = spec.request["scope"]
    if (
        not isinstance(bounds, dict)
        or bounds.get("maxIndex") != requested_scope["maxDegree"]
        or bounds.get("primes") != [2, 3]
    ):
        raise ArtifactError("Nonnormal campaign uses a different bounded scope")

    pruning = artifact.get("geometryPruningCertificate")
    if (
        not isinstance(pruning, dict)
        or pruning.get("status") != "cross-prime-matched"
        or pruning.get("maximalSphericalRestrictionCount") != 32
        or not isinstance(pruning.get("primeOrderWitnessesChecked"), int)
        or pruning["primeOrderWitnessesChecked"] < 1
    ):
        raise ArtifactError(
            "Nonnormal campaign lacks the matched 32-subgroup torsion sieve"
        )

    status = str(artifact.get("status", "incomplete"))
    warnings = string_list(artifact.get("warnings"))
    errors = string_list(artifact.get("errors"))
    children = artifact.get("children")
    if not isinstance(children, list):
        raise ArtifactError("Nonnormal campaign omits its child evidence")
    child_primes = {
        child.get("prime")
        for child in children
        if isinstance(child, dict)
        and child.get("boundedComplete") is True
        and child.get("outcome") in {"candidate-found", "exhausted"}
    }
    candidate = artifact.get("candidate")
    candidate_degree = candidate.get("degree") if isinstance(candidate, dict) else None
    if (
        status == "candidate-found"
        and artifact["complete"] is True
        and isinstance(candidate, dict)
        and isinstance(candidate_degree, int)
        and not isinstance(candidate_degree, bool)
        and 0 < candidate_degree <= requested_scope["maxDegree"]
        and not errors
    ):
        return ArtifactOutcome(
            TERMINAL_CANDIDATE,
            status,
            True,
            1,
            warnings,
            errors,
        )
    if (
        status == "exhausted"
        and artifact["complete"] is True
        and artifact.get("missingPrimes") == []
        and child_primes == {2, 3}
        and candidate is None
        and not errors
    ):
        return ArtifactOutcome(TERMINAL_EXHAUSTED, status, True, 0, warnings, errors)
    return ArtifactOutcome(NONTERMINAL, status, False, 0, warnings, errors)


def portfolio_outcome(
    artifact: Mapping[str, Any], source_sha256: str
) -> ArtifactOutcome:
    verify_seal(artifact, "portfolioSha256")
    if artifact.get("schemaVersion") != 1:
        raise ArtifactError("Portfolio artifact has unsupported schemaVersion")
    if artifact.get("artifactType") != "finite-image-residue-module-portfolio":
        raise ArtifactError("Portfolio artifact has the wrong artifactType")
    if artifact.get("inputSha256") != source_sha256:
        raise ArtifactError("Portfolio artifact belongs to another source file")
    scope = artifact.get("scope")
    primes = scope.get("rationalPrimes") if isinstance(scope, dict) else None
    if not isinstance(primes, list) or not {5, 7, 11}.issubset(set(primes)):
        raise ArtifactError("Portfolio artifact omits a required odd characteristic")
    composite = artifact.get("compositeSearch")
    if (
        not isinstance(composite, dict)
        or composite.get("allBoundedDiagonalOrbits") is not True
    ):
        raise ArtifactError("Portfolio artifact lacks the packed composite search")

    status = str(artifact.get("status", "incomplete-no-survivor"))
    warnings = string_list(artifact.get("warnings"))
    errors = string_list(artifact.get("errors"))
    materialized = artifact.get("materializedAction")
    gate = artifact.get("promotionGate")
    independently_verified = (
        isinstance(gate, dict) and gate.get("completeRowsIndependentlyVerified") is True
    )
    candidate_statuses = {
        "virtual-fibering-certified",
        "materialized-witness-free-survivor",
        "materialized-candidate-promotion-failed",
    }
    if (
        status in candidate_statuses
        and isinstance(materialized, dict)
        and independently_verified
        and not errors
    ):
        return ArtifactOutcome(TERMINAL_CANDIDATE, status, False, 1, warnings, errors)

    worker_completion = artifact.get("workerPortfolioCompleteness")
    module_portfolio = artifact.get("modulePortfolio")
    solver_summary = composite.get("summary")
    complete_no_survivor = (
        status == "complete-no-survivor"
        and isinstance(worker_completion, dict)
        and worker_completion.get("complete") is True
        and isinstance(module_portfolio, dict)
        and module_portfolio.get("complete") is True
        and isinstance(solver_summary, dict)
        and solver_summary.get("searchComplete") is True
        and materialized is None
        and not errors
    )
    if complete_no_survivor:
        return ArtifactOutcome(TERMINAL_EXHAUSTED, status, True, 0, warnings, errors)
    return ArtifactOutcome(NONTERMINAL, status, False, 0, warnings, errors)


def classify_artifact(
    artifact: Mapping[str, Any], spec: StageSpec, source_sha256: str
) -> ArtifactOutcome:
    if spec.kind == "finite-weyl-target":
        return finite_outcome(artifact, spec, source_sha256)
    if spec.kind == "finite-image-nonnormal":
        return nonnormal_outcome(artifact, spec, source_sha256)
    if spec.kind == "odd-prime-composite":
        return portfolio_outcome(artifact, source_sha256)
    raise CampaignError(f"Unknown stage kind {spec.kind}")


def artifact_reference(
    path: Path,
    output_dir: Path,
    artifact: Mapping[str, Any],
    spec: StageSpec,
) -> dict[str, Any]:
    internal_hash_field = (
        "portfolioSha256" if spec.kind == "odd-prime-composite" else "artifactHash"
    )
    return {
        "path": relative_output_path(path, output_dir),
        "sha256": sha256_file(path),
        "internalHashField": internal_hash_field,
        "internalHash": artifact.get(internal_hash_field),
    }


def child_command(
    args: argparse.Namespace,
    spec: StageSpec,
    *,
    input_path: Path,
    output_dir: Path,
) -> list[str]:
    stage_dir = spec.artifact_path.parent
    if spec.kind == "finite-weyl-target":
        config_path = stage_dir / "target-config.json"
        checkpoint_path = stage_dir / "checkpoint.json"
        atomic_write_json(config_path, finite_target_config(str(spec.target_type)))
        command = [
            str(Path(args.python).resolve()),
            str(Path(args.finite_script).resolve()),
            "--input",
            str(input_path),
            "--output",
            str(spec.artifact_path),
            "--target-config",
            str(config_path),
            "--checkpoint",
            str(checkpoint_path),
        ]
        if args.gap is not None:
            command.extend(["--gap", args.gap])
        return command
    if spec.kind == "finite-image-nonnormal":
        command = [
            str(Path(args.python).resolve()),
            str(Path(args.nonnormal_script).resolve()),
            "--input",
            str(input_path),
            "--output",
            str(spec.artifact_path),
            "--max-index",
            str(args.max_degree),
            "--worker-python",
            str(Path(args.finite_image_worker_python).resolve()),
            "--worker-script",
            str(Path(args.finite_image_worker_script).resolve()),
        ]
        for artifact in args.nonnormal_artifact:
            command.extend(["--artifact", str(Path(artifact).resolve())])
        return command
    if spec.kind == "odd-prime-composite":
        portfolio_dir = spec.artifact_path.parent
        command = [
            str(Path(args.portfolio_python).resolve()),
            str(Path(args.portfolio_script).resolve()),
            "--input",
            str(input_path),
            "--output-dir",
            str(portfolio_dir),
            "--resume",
            "--max-index",
            str(args.max_degree),
            "--light-workers",
            str(args.light_workers),
        ]
        for seed in [*args.nonnormal_artifact, *args.seed_artifact]:
            command.extend(["--seed-artifact", str(Path(seed).resolve())])
        return command
    raise CampaignError(f"Unknown stage kind {spec.kind}")


def terminate_process_tree(process: subprocess.Popen[Any]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=2)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def run_process(
    command: Sequence[str],
    *,
    cwd: Path,
    stdout_path: Path,
    stderr_path: Path,
    timeout_seconds: float,
) -> ProcessResult:
    stdout_path.parent.mkdir(parents=True, exist_ok=True)
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    with (
        stdout_path.open("w", encoding="utf-8") as stdout,
        stderr_path.open("w", encoding="utf-8") as stderr,
    ):
        process = subprocess.Popen(
            list(command),
            cwd=cwd,
            stdout=stdout,
            stderr=stderr,
            text=True,
            shell=False,
            start_new_session=os.name != "nt",
            creationflags=creationflags,
        )
        try:
            returncode = process.wait(timeout=timeout_seconds)
            return ProcessResult(returncode, False, False)
        except subprocess.TimeoutExpired:
            terminate_process_tree(process)
            return ProcessResult(process.returncode, True, True)


def timeout_for_stage(args: argparse.Namespace, spec: StageSpec) -> float:
    if spec.kind == "finite-weyl-target":
        return args.finite_timeout_seconds
    if spec.kind == "finite-image-nonnormal":
        return args.nonnormal_timeout_seconds
    return args.portfolio_timeout_seconds


def validate_reusable_terminal(
    record: Mapping[str, Any],
    spec: StageSpec,
    *,
    source_sha256: str,
    output_dir: Path,
) -> ArtifactOutcome | None:
    if record.get("outcome") not in {TERMINAL_CANDIDATE, TERMINAL_EXHAUSTED}:
        return None
    reference = record.get("artifact")
    if not isinstance(reference, dict):
        raise CampaignError(f"Terminal stage {spec.id} has no artifact reference")
    path = spec.artifact_path
    if not path.is_file():
        raise CampaignError(f"Terminal stage artifact disappeared: {path}")
    if reference.get("path") != relative_output_path(path, output_dir):
        raise CampaignError(f"Terminal stage path changed for {spec.id}")
    if reference.get("sha256") != sha256_file(path):
        raise CampaignError(f"Terminal stage artifact changed for {spec.id}")
    artifact = read_json_object(path)
    outcome = classify_artifact(artifact, spec, source_sha256)
    if outcome.outcome != record.get("outcome"):
        raise CampaignError(f"Terminal stage outcome no longer replays for {spec.id}")
    return outcome


def execute_stage(
    args: argparse.Namespace,
    spec: StageSpec,
    *,
    input_path: Path,
    output_dir: Path,
    source_sha256: str,
) -> dict[str, Any]:
    stage_dir = spec.artifact_path.parent
    stage_dir.mkdir(parents=True, exist_ok=True)
    command = child_command(args, spec, input_path=input_path, output_dir=output_dir)
    result = run_process(
        command,
        cwd=REPOSITORY_ROOT,
        stdout_path=stage_dir / "stdout.log",
        stderr_path=stage_dir / "stderr.log",
        timeout_seconds=timeout_for_stage(args, spec),
    )
    base = initial_stage_record(spec, output_dir)
    base["process"] = {
        "returnCode": result.returncode,
        "timedOut": result.timed_out,
        "cancelled": result.cancelled,
        "stdout": relative_output_path(stage_dir / "stdout.log", output_dir),
        "stderr": relative_output_path(stage_dir / "stderr.log", output_dir),
    }
    if not spec.artifact_path.is_file():
        base["status"] = "timed-out" if result.timed_out else "failed"
        base["outcome"] = NONTERMINAL
        base["errors"] = [
            "Child process timed out before producing an artifact."
            if result.timed_out
            else "Child process produced no artifact."
        ]
        return base

    try:
        artifact = read_json_object(spec.artifact_path)
        outcome = classify_artifact(artifact, spec, source_sha256)
        base["artifact"] = artifact_reference(
            spec.artifact_path, output_dir, artifact, spec
        )
    except ArtifactError as exc:
        base["status"] = "failed"
        base["outcome"] = NONTERMINAL
        base["errors"] = [str(exc)]
        return base

    base["warnings"] = list(outcome.warnings)
    base["errors"] = list(outcome.errors)
    base["childStatus"] = outcome.child_status
    base["candidateCount"] = outcome.candidate_count
    if result.timed_out:
        # An artifact written just before process cancellation may look final.
        # It is not accepted because the process never completed its protocol.
        base["status"] = "timed-out"
        base["outcome"] = NONTERMINAL
        base["complete"] = False
        base["errors"].append("Timed-out execution cannot certify exhaustion.")
    elif result.returncode != 0:
        base["status"] = "failed" if outcome.errors else "incomplete"
        base["outcome"] = NONTERMINAL
        base["complete"] = False
        base["errors"].append(
            f"Child process exited with status {result.returncode}; terminal claims were not accepted."
        )
    else:
        base["status"] = outcome.child_status
        base["outcome"] = outcome.outcome
        base["complete"] = outcome.complete
    return base


def mark_later_stages(
    manifest: dict[str, Any], start: int, *, status: str, reason: str
) -> None:
    for record in manifest["stages"][start:]:
        record["status"] = status
        record["outcome"] = status
        record["complete"] = False
        record["blockedBy"] = reason


def run_campaign(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    source, source_sha256 = validate_source(input_path)
    implementation_hashes = {
        "orchestratorSha256": sha256_file(Path(__file__).resolve()),
        "finiteTargetCliSha256": require_script(
            Path(args.finite_script).resolve(), "finite-target"
        ),
        "nonnormalCliSha256": require_script(
            Path(args.nonnormal_script).resolve(), "nonnormal finite-image"
        ),
        "finiteImageWorkerSha256": require_script(
            Path(args.finite_image_worker_script).resolve(), "finite-image worker"
        ),
        "portfolioCliSha256": require_script(
            Path(args.portfolio_script).resolve(), "portfolio"
        ),
    }
    stages = build_stage_specs(
        args,
        output_dir=output_dir,
        source_sha256=source_sha256,
        implementation_hashes=implementation_hashes,
    )
    binding = campaign_binding(
        source_sha256=source_sha256,
        implementation_hashes=implementation_hashes,
        stages=stages,
    )
    manifest_path = output_dir / "campaign.json"

    if manifest_path.exists() and not args.resume and not args.dry_run:
        raise CampaignError(
            f"Campaign already exists at {manifest_path}; use --resume to continue"
        )
    if args.resume and manifest_path.exists() and not args.dry_run:
        manifest = load_resume_manifest(
            manifest_path,
            expected_binding=binding,
            stage_specs=stages,
        )
    else:
        manifest = new_manifest(
            source=source,
            source_sha256=source_sha256,
            implementation_hashes=implementation_hashes,
            stages=stages,
            output_dir=output_dir,
            dry_run=args.dry_run,
        )

    # Target configs are part of the readable plan as well as the executable
    # request.  Writing them during dry-run makes the exact target scope easy to
    # inspect without starting GAP.
    for spec in stages:
        if spec.kind == "finite-weyl-target":
            atomic_write_json(
                spec.artifact_path.parent / "target-config.json",
                finite_target_config(str(spec.target_type)),
            )

    if args.dry_run:
        manifest["status"] = "planned"
        manifest["currentStage"] = stages[0].id
        manifest = write_manifest(manifest_path, manifest)
        return manifest, 0

    records_by_id = {record["id"]: record for record in manifest["stages"]}
    for index, spec in enumerate(stages):
        prior = records_by_id[spec.id]
        reusable = validate_reusable_terminal(
            prior,
            spec,
            source_sha256=source_sha256,
            output_dir=output_dir,
        )
        if reusable is None and args.resume and spec.artifact_path.is_file():
            # A resumed worker may replace an incomplete aggregate. It still
            # has to pass the same hash, source, and completeness checks.
            try:
                external = read_json_object(spec.artifact_path)
                possible = classify_artifact(external, spec, source_sha256)
                if possible.outcome in {TERMINAL_CANDIDATE, TERMINAL_EXHAUSTED}:
                    prior = initial_stage_record(spec, output_dir)
                    prior.update(
                        {
                            "status": possible.child_status,
                            "outcome": possible.outcome,
                            "complete": possible.complete,
                            "candidateCount": possible.candidate_count,
                            "artifact": artifact_reference(
                                spec.artifact_path, output_dir, external, spec
                            ),
                            "process": {"reusedExternalArtifact": True},
                            "warnings": list(possible.warnings),
                            "errors": list(possible.errors),
                        }
                    )
                    manifest["stages"][index] = prior
                    records_by_id[spec.id] = prior
                    reusable = possible
            except ArtifactError as exc:
                manifest["status"] = "blocked"
                manifest["currentStage"] = spec.id
                manifest["errors"] = [
                    f"Existing artifact for {spec.id} failed validation: {exc}"
                ]
                mark_later_stages(
                    manifest,
                    index + 1,
                    status="blocked",
                    reason=spec.id,
                )
                manifest = write_manifest(manifest_path, manifest)
                return manifest, 2

        if reusable is None:
            manifest["currentStage"] = spec.id
            running = initial_stage_record(spec, output_dir)
            running["status"] = "running"
            running["outcome"] = "running"
            manifest["stages"][index] = running
            records_by_id[spec.id] = running
            manifest = write_manifest(manifest_path, manifest)
            record = execute_stage(
                args,
                spec,
                input_path=input_path,
                output_dir=output_dir,
                source_sha256=source_sha256,
            )
            manifest.pop("artifactHash", None)
            manifest["stages"][index] = record
            records_by_id[spec.id] = record
            outcome_name = record["outcome"]
        else:
            outcome_name = reusable.outcome

        if outcome_name == TERMINAL_CANDIDATE:
            manifest["status"] = "candidate-found"
            manifest["complete"] = False
            manifest["objectiveSatisfied"] = True
            manifest["candidateStage"] = spec.id
            manifest["currentStage"] = None
            mark_later_stages(
                manifest,
                index + 1,
                status="not-needed",
                reason=spec.id,
            )
            manifest = write_manifest(manifest_path, manifest)
            return manifest, 0
        if outcome_name != TERMINAL_EXHAUSTED:
            manifest["status"] = "blocked"
            manifest["complete"] = False
            manifest["objectiveSatisfied"] = False
            manifest["currentStage"] = spec.id
            mark_later_stages(
                manifest,
                index + 1,
                status="blocked",
                reason=spec.id,
            )
            manifest = write_manifest(manifest_path, manifest)
            return manifest, 2

    manifest["status"] = "exhausted"
    manifest["complete"] = True
    manifest["objectiveSatisfied"] = False
    manifest["currentStage"] = None
    manifest = write_manifest(manifest_path, manifest)
    return manifest, 0


def positive_number(value: str) -> float:
    try:
        result = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a number") from exc
    if result <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return result


def positive_integer(value: str) -> int:
    try:
        result = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if result < 1:
        raise argparse.ArgumentTypeError("must be positive")
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--portfolio-python", default=sys.executable)
    parser.add_argument("--finite-script", type=Path, default=DEFAULT_FINITE_SCRIPT)
    parser.add_argument(
        "--nonnormal-script", type=Path, default=DEFAULT_NONNORMAL_SCRIPT
    )
    parser.add_argument(
        "--finite-image-worker-script",
        type=Path,
        default=DEFAULT_FINITE_IMAGE_WORKER,
    )
    parser.add_argument(
        "--portfolio-script", type=Path, default=DEFAULT_PORTFOLIO_SCRIPT
    )
    parser.add_argument("--gap")
    parser.add_argument("--finite-image-worker-python", default=sys.executable)
    parser.add_argument("--nonnormal-artifact", type=Path, action="append", default=[])
    parser.add_argument("--seed-artifact", type=Path, action="append", default=[])
    parser.add_argument("--max-degree", type=positive_integer, default=576_000)
    parser.add_argument("--light-workers", type=int, choices=(4, 5, 6), default=4)
    parser.add_argument(
        "--finite-timeout-seconds", type=positive_number, default=172_800
    )
    parser.add_argument(
        "--nonnormal-timeout-seconds", type=positive_number, default=172_800
    )
    parser.add_argument(
        "--portfolio-timeout-seconds", type=positive_number, default=604_800
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        manifest, returncode = run_campaign(args)
    except CampaignError as exc:
        sys.stderr.write(f"ordered cover-search campaign error: {exc}\n")
        return 2
    sys.stdout.write(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return returncode


if __name__ == "__main__":
    raise SystemExit(main())
