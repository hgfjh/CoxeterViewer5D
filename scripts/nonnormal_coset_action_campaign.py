#!/usr/bin/env python3
"""Aggregate exact mod-2/mod-3 nonnormal coset-action searches.

This campaign is deliberately narrower than the general finite-image portfolio.
It closes only the supplied characteristic-2 and characteristic-3 finite images,
and only through ``maxIndex``.  A bounded negative result here is not a claim
about every nonnormal action of the Coxeter group.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "coxeter-nonnormal-finite-image-campaign"
CAMPAIGN_VERSION = "1.0.0"
CHILD_ARTIFACT_TYPE = "coxeter-finite-image-search"
REQUIRED_PRIMES = (2, 3)
DEFAULT_MAX_INDEX = 576_000


class CampaignError(RuntimeError):
    """A supplied artifact cannot support the requested exact conclusion."""


@dataclass(frozen=True)
class ValidatedChild:
    prime: int
    path: Path
    artifact: dict[str, Any]
    outcome: str
    bounded_complete: bool
    candidate: dict[str, Any] | None
    module_reference: dict[str, Any] | None


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def source_input_hash(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def seal_artifact(value: Mapping[str, Any]) -> dict[str, Any]:
    sealed = json.loads(canonical_json(value))
    sealed.pop("artifactHash", None)
    sealed["artifactHash"] = sha256_json(sealed)
    return sealed


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def read_json_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CampaignError(f"Cannot read child artifact {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise CampaignError(f"Child artifact {path} must contain a JSON object")
    return value


def require_sha256(value: Any, field: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise CampaignError(f"{field} must be a lowercase SHA-256 digest")
    return value


def verify_internal_seal(artifact: Mapping[str, Any], path: Path) -> str:
    body = json.loads(canonical_json(artifact))
    supplied = require_sha256(body.pop("artifactHash", None), "artifactHash")
    computed = sha256_json(body)
    if supplied != computed:
        raise CampaignError(
            f"Child artifact {path} has a stale artifactHash: "
            f"expected {supplied}, computed {computed}"
        )
    return supplied


def validate_spherical_catalogue(
    artifact: Mapping[str, Any], path: Path
) -> dict[str, Any]:
    matrix_digest = require_sha256(artifact.get("matrixDigest"), "matrixDigest")
    catalogue = artifact.get("sphericalCatalogue")
    witnesses = artifact.get("torsionWitnesses")
    if not isinstance(catalogue, dict) or not isinstance(witnesses, list):
        raise CampaignError(f"{path} omits its exact spherical/witness catalogue")
    restrictions = catalogue.get("maximalSphericalSubgroups")
    if not isinstance(restrictions, list) or len(restrictions) != 32:
        raise CampaignError(
            f"{path} must bind exactly 32 maximal spherical restrictions"
        )
    spherical_digest = require_sha256(
        catalogue.get("sphericalDigest"), "sphericalCatalogue.sphericalDigest"
    )
    if sha256_json(restrictions) != spherical_digest:
        raise CampaignError(f"{path} has a stale spherical restriction digest")
    witness_digest = require_sha256(
        catalogue.get("witnessDigest"), "sphericalCatalogue.witnessDigest"
    )
    witness_count = catalogue.get("witnessCount")
    if (
        isinstance(witness_count, bool)
        or not isinstance(witness_count, int)
        or witness_count <= 0
        or witness_count != len(witnesses)
    ):
        raise CampaignError(f"{path} has an inconsistent torsion witness count")
    if sha256_json(witnesses) != witness_digest:
        raise CampaignError(f"{path} has a stale torsion witness digest")
    return {
        "matrixDigest": matrix_digest,
        "maximalSphericalRestrictionCount": 32,
        "sphericalDigest": spherical_digest,
        "witnessCount": witness_count,
        "witnessDigest": witness_digest,
    }


def residue_scope_is_complete(artifact: Mapping[str, Any]) -> bool:
    attempts = artifact.get("residueAttempts")
    if not isinstance(attempts, list) or not attempts:
        return False
    for attempt in attempts:
        if not isinstance(attempt, dict):
            return False
        if attempt.get("status") == "rejected":
            continue
        search = attempt.get("subgroupSearch")
        if not isinstance(search, dict):
            return False
        if not (
            search.get("complete") is True
            or search.get("indexScreeningComplete") is True
        ):
            return False
    return True


def validate_partial_module_catalogue(
    catalogue: Any,
    *,
    input_hash: str,
    matrix_digest: str,
    witness_digest: str,
    witness_count: int,
    path: Path,
    prime: int,
) -> dict[str, Any] | None:
    if catalogue is None:
        return None
    if not isinstance(catalogue, dict):
        raise CampaignError(f"{path} has a malformed partialModuleCatalogue")
    if (
        catalogue.get("schemaVersion") != 1
        or catalogue.get("artifactType") != "finite-image-partial-module-catalogue"
        or not isinstance(catalogue.get("complete"), bool)
        or catalogue.get("witnessCount") != witness_count
    ):
        raise CampaignError(f"{path} has an incompatible partial-module catalogue")
    body = json.loads(canonical_json(catalogue))
    supplied = require_sha256(
        body.pop("catalogueSha256", None), "partialModuleCatalogue.catalogueSha256"
    )
    if sha256_json(body) != supplied:
        raise CampaignError(f"{path} has a stale partial-module catalogue seal")
    hashes = catalogue.get("hashes")
    if not isinstance(hashes, dict) or hashes != {
        "sourceSha256": input_hash,
        "matrixSha256": matrix_digest,
        "witnessSha256": witness_digest,
    }:
        raise CampaignError(
            f"{path} partial modules are not bound to this source catalogue"
        )
    modules = catalogue.get("modules")
    if not isinstance(modules, list):
        raise CampaignError(f"{path} partial-module catalogue has no module list")
    finite_images = catalogue.get("finiteImages")
    if not isinstance(finite_images, list) or not any(
        isinstance(image, dict) and image.get("characteristic") == prime
        for image in finite_images
    ):
        raise CampaignError(
            f"{path} partial-module catalogue contains no characteristic-{prime} image"
        )
    return {
        "prime": prime,
        "catalogueSha256": supplied,
        "complete": catalogue.get("complete") is True,
        "moduleCount": len(modules),
        "finiteImageCount": len(finite_images),
        "hashes": dict(hashes),
    }


def validate_passing_action(
    artifact: Mapping[str, Any], *, max_index: int, path: Path
) -> dict[str, Any]:
    outcome = artifact.get("coverOutcome")
    action = artifact.get("passingAction")
    if (
        not isinstance(outcome, dict)
        or outcome.get("manageableCoverMaterialized") is not True
        or outcome.get("status") != "materialized-cover-found"
        or not isinstance(action, dict)
    ):
        raise CampaignError(f"{path} claims success without a materialized cover")
    degree = action.get("degree")
    generators = action.get("generatorCount")
    if (
        isinstance(degree, bool)
        or not isinstance(degree, int)
        or degree <= 0
        or degree > max_index
        or isinstance(generators, bool)
        or not isinstance(generators, int)
        or generators <= 0
    ):
        raise CampaignError(f"{path} has an invalid or unmanageable action degree")
    packed = action.get("packedPermutationRows")
    if not isinstance(packed, dict):
        raise CampaignError(f"{path} does not expose packed materialized action rows")
    if (
        packed.get("degree") != degree
        or packed.get("generatorCount") != generators
        or not isinstance(packed.get("byteLength"), int)
        or packed["byteLength"] <= 0
    ):
        raise CampaignError(f"{path} has inconsistent packed action metadata")
    packed_digest = require_sha256(
        packed.get("sha256"), "passingAction.packedPermutationRows.sha256"
    )
    certificate = action.get("certificate")
    if (
        not isinstance(certificate, dict)
        or certificate.get("status") != "passed"
        or certificate.get("criterion")
        != "prime-order-fixed-points+spherical-regular-orbits"
    ):
        raise CampaignError(f"{path} lacks the independent torsion-freeness checks")
    require_sha256(
        certificate.get("fixedPointCountsDigest"),
        "passingAction.certificate.fixedPointCountsDigest",
    )
    checks = certificate.get("sphericalOrbitChecks")
    if (
        not isinstance(checks, list)
        or len(checks) != 32
        or any(
            not isinstance(check, dict) or check.get("free") is not True
            for check in checks
        )
    ):
        raise CampaignError(f"{path} did not pass all 32 spherical-freeness checks")
    return {
        "degree": degree,
        "generatorCount": generators,
        "packedPermutationRowsSha256": packed_digest,
        "certificateCriterion": certificate["criterion"],
        "sphericalOrbitChecksPassed": 32,
    }


def validate_child_artifact(
    path: Path, *, input_hash: str, max_index: int
) -> ValidatedChild:
    artifact = read_json_object(path)
    verify_internal_seal(artifact, path)
    if artifact.get("schemaVersion") != 1:
        raise CampaignError(f"{path} has an unsupported schemaVersion")
    if artifact.get("artifactType") != CHILD_ARTIFACT_TYPE:
        raise CampaignError(f"{path} is not a {CHILD_ARTIFACT_TYPE} artifact")
    if artifact.get("inputHash") != input_hash:
        raise CampaignError(f"{path} belongs to a different source input")
    bounds = artifact.get("bounds")
    if not isinstance(bounds, dict) or bounds.get("maxIndex") != max_index:
        raise CampaignError(f"{path} was run with a different maxIndex")
    primes = bounds.get("primes")
    if (
        not isinstance(primes, list)
        or len(primes) != 1
        or isinstance(primes[0], bool)
        or primes[0] not in REQUIRED_PRIMES
    ):
        raise CampaignError(f"{path} must contain exactly one prime, 2 or 3")
    prime = int(primes[0])
    errors = artifact.get("errors")
    if errors != [] or artifact.get("ok") is not True:
        raise CampaignError(f"{path} reports backend errors and cannot be trusted")

    catalogue = validate_spherical_catalogue(artifact, path)
    module_reference = validate_partial_module_catalogue(
        artifact.get("partialModuleCatalogue"),
        input_hash=input_hash,
        matrix_digest=catalogue["matrixDigest"],
        witness_digest=catalogue["witnessDigest"],
        witness_count=catalogue["witnessCount"],
        path=path,
        prime=prime,
    )
    completeness = artifact.get("searchCompleteness")
    if not isinstance(completeness, dict):
        raise CampaignError(f"{path} omits searchCompleteness")
    status = artifact.get("status")
    candidate: dict[str, Any] | None = None
    bounded_complete = False
    outcome = "incomplete"
    if status == "passed":
        if completeness.get("status") != "certified-candidate-found":
            raise CampaignError(f"{path} has inconsistent candidate completeness")
        candidate = validate_passing_action(artifact, max_index=max_index, path=path)
        outcome = "candidate-found"
    elif status == "exhausted":
        accepted_statuses = {
            "exhausted-within-recorded-bounds",
            "index-obstruction-within-recorded-bounds",
        }
        bounded_complete = (
            completeness.get("boundedComplete") is True
            and completeness.get("status") in accepted_statuses
            and residue_scope_is_complete(artifact)
            and artifact.get("passingAction") is None
        )
        outcome = "exhausted" if bounded_complete else "incomplete"

    return ValidatedChild(
        prime=prime,
        path=path,
        artifact=artifact,
        outcome=outcome,
        bounded_complete=bounded_complete,
        candidate=candidate,
        module_reference=module_reference,
    )


def worker_output_path(output: Path, prime: int) -> Path:
    return output.parent / f"{output.stem}.p{prime}.json"


def worker_checkpoint_path(output: Path) -> Path:
    return output.parent / f"{output.stem}.checkpoint.json"


def plan_worker_command(
    *,
    worker_python: str,
    worker_script: Path,
    input_path: Path,
    output_path: Path,
    prime: int,
    max_index: int,
) -> list[str]:
    if prime not in REQUIRED_PRIMES:
        raise CampaignError("The focused worker stage supports only primes 2 and 3")
    return [
        worker_python,
        str(worker_script),
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--checkpoint",
        str(worker_checkpoint_path(output_path)),
        "--prime",
        str(prime),
        "--max-index",
        str(max_index),
        "--materialization",
        "packed",
        "--resume",
    ]


def compare_catalogues(children: Sequence[ValidatedChild]) -> dict[str, Any] | None:
    if not children:
        return None
    records = [
        validate_spherical_catalogue(child.artifact, child.path) for child in children
    ]
    first = records[0]
    for record in records[1:]:
        if record != first:
            raise CampaignError(
                "Characteristic-2 and characteristic-3 artifacts use different "
                "matrix, spherical, or torsion-witness catalogues"
            )
    return {
        "status": "cross-prime-matched" if len(children) == 2 else "single-prime-only",
        "kind": "geometry-local-development-pruning-certificate",
        **first,
        "primeOrderWitnessesChecked": first["witnessCount"],
        "meaning": (
            "The 32 maximal spherical restrictions and their prime-order torsion "
            "witnesses are the exact local-development sieve for these finite images."
        ),
    }


def aggregate_campaign(
    *, input_path: Path, artifact_paths: Sequence[Path], max_index: int
) -> dict[str, Any]:
    if max_index <= 0:
        raise CampaignError("maxIndex must be positive")
    input_hash = source_input_hash(input_path)
    children_by_prime: dict[int, ValidatedChild] = {}
    for path in artifact_paths:
        child = validate_child_artifact(
            path, input_hash=input_hash, max_index=max_index
        )
        if child.prime in children_by_prime:
            raise CampaignError(
                f"More than one artifact was supplied for prime {child.prime}"
            )
        children_by_prime[child.prime] = child
    children = [
        children_by_prime[prime]
        for prime in REQUIRED_PRIMES
        if prime in children_by_prime
    ]
    catalogue_certificate = compare_catalogues(children)

    candidates = [child for child in children if child.candidate is not None]
    both_complete = all(
        prime in children_by_prime and children_by_prime[prime].bounded_complete
        for prime in REQUIRED_PRIMES
    )
    status = (
        "candidate-found"
        if candidates
        else "exhausted"
        if both_complete
        else "incomplete"
    )
    child_records = []
    for child in children:
        child_records.append(
            {
                "prime": child.prime,
                "fileName": child.path.name,
                "fileSha256": sha256_file(child.path),
                "artifactHash": child.artifact["artifactHash"],
                "status": child.artifact.get("status"),
                "outcome": child.outcome,
                "boundedComplete": child.bounded_complete,
                "searchCompleteness": child.artifact.get("searchCompleteness"),
            }
        )
    module_references = [
        child.module_reference
        for child in children
        if child.module_reference is not None
    ]
    result: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "campaignVersion": CAMPAIGN_VERSION,
        "status": status,
        "complete": status in {"candidate-found", "exhausted"},
        "inputHash": input_hash,
        "bounds": {"primes": list(REQUIRED_PRIMES), "maxIndex": max_index},
        "geometryPruningCertificate": catalogue_certificate,
        "children": child_records,
        "missingPrimes": [
            prime for prime in REQUIRED_PRIMES if prime not in children_by_prime
        ],
        "partialModuleCatalogueReferences": module_references,
        "claims": (
            ["manageable torsion-free coset action in a supplied finite image"]
            if status == "candidate-found"
            else ["bounded p2/p3 finite-image scopes exhausted"]
            if status == "exhausted"
            else []
        ),
        "nonClaims": [
            "all nonnormal actions",
            "minimal torsion-free index",
            "finite images outside the supplied characteristic-2 and characteristic-3 artifacts",
            f"actions of degree greater than {max_index}",
            "virtual algebraic fibering",
        ],
        "scope": (
            "Exhaustion is relative only to the supplied finite images and "
            f"transitive coset actions of degree at most {max_index}."
        ),
        "errors": [],
        "provenance": {
            "implementationSha256": sha256_file(Path(__file__).resolve()),
        },
    }
    if candidates:
        selected = min(candidates, key=lambda child: int(child.candidate["degree"]))
        result["candidate"] = {
            "prime": selected.prime,
            "childArtifactHash": selected.artifact["artifactHash"],
            **selected.candidate,
        }
    return seal_artifact(result)


def collect_or_run_artifacts(args: argparse.Namespace) -> list[Path]:
    paths = list(args.artifact)
    supplied_primes: set[int] = set()
    input_hash = source_input_hash(args.input)
    for path in paths:
        child = validate_child_artifact(
            path, input_hash=input_hash, max_index=args.max_index
        )
        if child.prime in supplied_primes:
            raise CampaignError(
                f"More than one artifact was supplied for prime {child.prime}"
            )
        supplied_primes.add(child.prime)
    if (args.worker_python is None) != (args.worker_script is None):
        raise CampaignError(
            "--worker-python and --worker-script must be supplied together"
        )
    if args.worker_python is None:
        return paths
    for prime in REQUIRED_PRIMES:
        if prime in supplied_primes:
            continue
        output_path = worker_output_path(args.output, prime)
        existing: ValidatedChild | None = None
        if output_path.is_file():
            existing = validate_child_artifact(
                output_path, input_hash=input_hash, max_index=args.max_index
            )
        if existing is None or existing.outcome == "incomplete":
            command = plan_worker_command(
                worker_python=args.worker_python,
                worker_script=args.worker_script,
                input_path=args.input,
                output_path=output_path,
                prime=prime,
                max_index=args.max_index,
            )
            completed = subprocess.run(command, check=False)
            if completed.returncode != 0:
                raise CampaignError(
                    f"Finite-image worker for prime {prime} exited with "
                    f"status {completed.returncode}"
                )
            child = validate_child_artifact(
                output_path, input_hash=input_hash, max_index=args.max_index
            )
        else:
            child = existing
        supplied_primes.add(child.prime)
        paths.append(output_path)
        if child.candidate is not None:
            break
    return paths


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Aggregate exact bounded nonnormal coset-action searches in the "
            "characteristic-2 and characteristic-3 finite images."
        )
    )
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--artifact", type=Path, action="append", default=[])
    parser.add_argument("--max-index", type=int, default=DEFAULT_MAX_INDEX)
    parser.add_argument("--worker-python")
    parser.add_argument("--worker-script", type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        paths = collect_or_run_artifacts(args)
        artifact = aggregate_campaign(
            input_path=args.input, artifact_paths=paths, max_index=args.max_index
        )
        atomic_write_json(args.output, artifact)
        sys.stdout.write(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
        return 0 if artifact["status"] != "incomplete" else 2
    except CampaignError as exc:
        sys.stderr.write(f"nonnormal finite-image campaign: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
