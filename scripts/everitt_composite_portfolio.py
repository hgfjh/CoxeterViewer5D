#!/usr/bin/env python3
"""Coordinate exact Everitt-style composite permutation-module searches.

The finite-image workers write sealed module catalogues and content-addressed
permutation rows.  This coordinator is the narrow consumer of those artifacts:
it checks every hash, merges compatible catalogues, screens impossible factor
degrees, and delegates bounded diagonal-orbit enumeration to
``packed_composite_solver``.

Fixed-point coverage stored in a catalogue is useful evidence and a search
hint.  It is never accepted as the final proof.  The packed solver replays the
source generators, Coxeter relations, and every prime-order witness on every
degree-eligible diagonal orbit; only the selected best orbit is materialized.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from array import array
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence

import finite_image_module_catalogue as module_catalogue
import packed_composite_solver as packed_solver
import torsion_free_discovery as discovery


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "coxeter-cover-search-track"
TRACK = "everitt-composite-modules"
COORDINATOR_VERSION = "1.0.0"
COORDINATOR_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


class CoordinatorError(RuntimeError):
    """An input artifact cannot safely enter an exact composite search."""


@dataclass(frozen=True, slots=True)
class SearchBounds:
    """Finite search domain passed unchanged to the packed solver."""

    max_factors: int = 8
    max_degree: int = 1_000_000
    max_cartesian_points: int = 8_000_000
    max_combinations: int = 100_000
    max_bytes: int = 512 * 1024 * 1024
    max_mapped_bytes: int = 64 * 1024 * 1024 * 1024
    checkpoint_interval: int = 250

    def validate(self) -> None:
        for name, value in asdict(self).items():
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise CoordinatorError(f"{name} must be a positive integer")

    def as_json(self) -> dict[str, int]:
        return {
            "maxFactors": self.max_factors,
            "maxDegree": self.max_degree,
            "maxCartesianPoints": self.max_cartesian_points,
            "maxCombinations": self.max_combinations,
            "maxBytes": self.max_bytes,
            "maxMappedBytes": self.max_mapped_bytes,
            "checkpointInterval": self.checkpoint_interval,
        }

    def solver_limits(self) -> packed_solver.SolverLimits:
        return packed_solver.SolverLimits(
            max_bytes=self.max_bytes,
            max_mapped_bytes=self.max_mapped_bytes,
            max_combinations=self.max_combinations,
            max_factors=self.max_factors,
            max_degree=self.max_degree,
            max_cartesian_points=self.max_cartesian_points,
            checkpoint_interval=self.checkpoint_interval,
        )


@dataclass(frozen=True, slots=True)
class SourceContext:
    path: Path
    raw: dict[str, Any]
    source: dict[str, Any]
    matrix: list[list[int]]
    input_hash: str
    matrix_hash: str
    lower_bound: int
    maximal_spherical: tuple[dict[str, Any], ...]


@dataclass(frozen=True, slots=True)
class LoadedCatalogue:
    path: Path
    value: dict[str, Any]
    file_sha256: str
    verified_blobs: Mapping[str, Path]


@dataclass(frozen=True, slots=True)
class WitnessCatalogue:
    witnesses: tuple[dict[str, Any], ...]
    digest: str
    source_sha256: str
    kind: str


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CoordinatorError(f"Cannot read {label} {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise CoordinatorError(f"{label} must contain a JSON object: {path}")
    return value


def _load_source(path: Path) -> SourceContext:
    resolved = path.expanduser().resolve()
    try:
        source_bytes = resolved.read_bytes()
        raw = json.loads(source_bytes.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CoordinatorError(f"Cannot read Coxeter source {resolved}: {exc}") from exc
    if not isinstance(raw, dict):
        raise CoordinatorError("The Coxeter source must be a JSON object")
    try:
        source, matrix = discovery.validate_source(raw.get("sourceSystem", raw))
        spherical = discovery.maximal_spherical_subsets(
            matrix, dict(discovery.DEFAULT_BOUNDS)
        )
    except (discovery.InputError, discovery.CatalogueLimit) as exc:
        raise CoordinatorError(f"Invalid Coxeter source: {exc}") from exc
    lower_bound = math.lcm(*(item.expected_order for item in spherical))
    matrix_hash = module_catalogue.sha256_json({"coxeterMatrix": matrix})
    records = tuple(
        {
            "id": "T:" + ",".join(map(str, item.subset)),
            "subset": list(item.subset),
            "type": item.type_name,
            "order": item.expected_order,
        }
        for item in spherical
    )
    return SourceContext(
        path=resolved,
        raw=raw,
        source=source,
        matrix=matrix,
        input_hash=sha256_bytes(source_bytes),
        matrix_hash=matrix_hash,
        lower_bound=lower_bound,
        maximal_spherical=records,
    )


def _target_degree_screen(lower_bound: int, maximum: int) -> dict[str, int]:
    if maximum < lower_bound:
        raise CoordinatorError(
            f"maxDegree={maximum} is below the exact lower divisor {lower_bound}"
        )
    count = maximum // lower_bound
    return {
        "first": lower_bound,
        "last": count * lower_bound,
        "step": lower_bound,
        "count": count,
    }


def _artifact_hash(artifact: Mapping[str, Any]) -> str:
    body = dict(artifact)
    body.pop("artifactHash", None)
    return module_catalogue.sha256_json(body)


def _seal_artifact(artifact: dict[str, Any]) -> dict[str, Any]:
    artifact.pop("artifactHash", None)
    artifact["artifactHash"] = _artifact_hash(artifact)
    return artifact


def _portable_solver_result(result: packed_solver.SolverResult) -> dict[str, Any]:
    """Remove machine-local paths from an otherwise deterministic summary."""

    value = result.to_json()
    diagnostics = value.get("diagnostics", {})
    sources = diagnostics.get("mappedActionSources", [])
    for source in sources:
        if isinstance(source, dict):
            source.pop("path", None)
    if diagnostics.get("checkpoint_last_error") is not None:
        diagnostics["checkpoint_last_error"] = "checkpoint-write-failed"
    return value


def _write_json_atomic(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    os.replace(temporary, path)


def _checkpoint_seal_path(path: Path) -> Path:
    return path.with_name(path.name + ".integrity.json")


def _checkpoint_seal_body(
    checkpoint_path: Path,
    payload: Mapping[str, Any],
    portfolio_binding_sha256: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "artifactType": "everitt-composite-checkpoint-integrity",
        "coordinatorVersion": COORDINATOR_VERSION,
        "coordinatorSha256": COORDINATOR_SHA256,
        "portfolioBindingSha256": portfolio_binding_sha256,
        "checkpointSha256": sha256_file(checkpoint_path),
        "checkpointPayloadSha256": module_catalogue.sha256_json(payload),
        "problemSha256": payload.get("problemSha256"),
        "solverVersion": payload.get("solverVersion"),
        "solverSourceSha256": payload.get("solverSourceSha256"),
        "searchDomain": payload.get("searchDomain"),
        "complete": payload.get("complete") is True,
    }


def _write_checkpoint_seal(
    checkpoint_path: Path,
    payload: Mapping[str, Any],
    portfolio_binding_sha256: str,
) -> dict[str, Any]:
    value = _checkpoint_seal_body(checkpoint_path, payload, portfolio_binding_sha256)
    value["sealSha256"] = module_catalogue.sha256_json(value)
    _write_json_atomic(_checkpoint_seal_path(checkpoint_path), value)
    return value


def _verify_checkpoint_seal(
    checkpoint_path: Path,
    problem: packed_solver.PackedProblem,
    portfolio_binding_sha256: str,
) -> dict[str, Any]:
    seal_path = _checkpoint_seal_path(checkpoint_path)
    if not checkpoint_path.is_file() or not seal_path.is_file():
        raise CoordinatorError(
            "Resume requires both the packed checkpoint and its integrity seal"
        )
    payload = _read_json_object(checkpoint_path, "packed checkpoint")
    seal = _read_json_object(seal_path, "checkpoint integrity seal")
    supplied_seal_hash = seal.pop("sealSha256", None)
    if supplied_seal_hash != module_catalogue.sha256_json(seal):
        raise CoordinatorError("Checkpoint integrity seal is stale or corrupt")
    expected = _checkpoint_seal_body(checkpoint_path, payload, portfolio_binding_sha256)
    if seal != expected:
        raise CoordinatorError("Checkpoint bytes or integrity metadata changed")
    if seal.get("problemSha256") != problem.problem_sha256:
        raise CoordinatorError("Checkpoint belongs to a different composite problem")
    if (
        seal.get("solverVersion") != packed_solver.SOLVER_VERSION
        or seal.get("solverSourceSha256") != packed_solver.SOLVER_SOURCE_SHA256
    ):
        raise CoordinatorError("Checkpoint belongs to a different packed solver")
    return {**seal, "sealSha256": supplied_seal_hash}


@contextmanager
def _sealed_checkpoint_writes(portfolio_binding_sha256: str) -> Iterator[None]:
    """Seal every atomic solver checkpoint without changing the solver module."""

    original = packed_solver._write_checkpoint

    def write_and_seal(path: Path, payload: Mapping[str, Any]) -> None:
        original(path, payload)
        _write_checkpoint_seal(path, payload, portfolio_binding_sha256)

    packed_solver._write_checkpoint = write_and_seal
    try:
        yield
    finally:
        packed_solver._write_checkpoint = original


def _solve_with_checkpoint_integrity(
    solver: packed_solver.PackedCompositeSolver,
    problem: packed_solver.PackedProblem,
    portfolio_binding_sha256: str,
    checkpoint_path: Path | None,
    resume: bool,
) -> tuple[packed_solver.SolverResult, dict[str, Any] | None]:
    if checkpoint_path is not None:
        if resume:
            _verify_checkpoint_seal(checkpoint_path, problem, portfolio_binding_sha256)
        else:
            checkpoint_path.unlink(missing_ok=True)
            _checkpoint_seal_path(checkpoint_path).unlink(missing_ok=True)
    with _sealed_checkpoint_writes(portfolio_binding_sha256):
        result = solver.solve(checkpoint_path=checkpoint_path, resume=resume)
    evidence = (
        _verify_checkpoint_seal(checkpoint_path, problem, portfolio_binding_sha256)
        if checkpoint_path is not None and checkpoint_path.is_file()
        else None
    )
    return result, evidence


def _load_catalogues(
    paths: Sequence[Path], source: SourceContext
) -> tuple[list[LoadedCatalogue], str]:
    if not paths:
        raise CoordinatorError("At least one --catalogue is required outside dry-run")
    loaded: list[LoadedCatalogue] = []
    witness_hash: str | None = None
    for raw_path in sorted({path.expanduser().resolve() for path in paths}, key=str):
        raw = _read_json_object(raw_path, "module catalogue")
        try:
            checked = module_catalogue.validate_catalogue(
                raw,
                expected_hashes={
                    "sourceSha256": source.input_hash,
                    "matrixSha256": source.matrix_hash,
                },
                require_complete=False,
            )
        except module_catalogue.CatalogueError as exc:
            raise CoordinatorError(
                f"Rejected module catalogue {raw_path}: {exc}"
            ) from exc
        current_witness_hash = str(checked["hashes"]["witnessSha256"])
        if witness_hash is None:
            witness_hash = current_witness_hash
        elif witness_hash != current_witness_hash:
            raise CoordinatorError(
                "Module catalogues use different torsion-witness hashes"
            )
        blobs: dict[str, Path] = {}
        for module in checked["modules"]:
            descriptor = module["packedPermutationRows"]
            try:
                blob = module_catalogue.verify_packed_rows_file(
                    descriptor, raw_path.parent
                )
            except module_catalogue.CatalogueError as exc:
                raise CoordinatorError(
                    f"Rejected packed rows for {module['id']}: {exc}"
                ) from exc
            digest = str(descriptor["sha256"])
            prior = blobs.get(digest)
            if prior is not None and prior != blob:
                raise CoordinatorError("One packed-row digest resolved ambiguously")
            blobs[digest] = blob
        loaded.append(
            LoadedCatalogue(
                path=raw_path,
                value=checked,
                file_sha256=sha256_file(raw_path),
                verified_blobs=blobs,
            )
        )
    assert witness_hash is not None
    return loaded, witness_hash


def _extract_witnesses(
    raw: Mapping[str, Any], *, expected_digest: str, source_sha256: str, kind: str
) -> WitnessCatalogue:
    if isinstance(raw.get("witnesses"), list):
        witnesses = raw["witnesses"]
        supplied_digest = raw.get("witnessDigest", raw.get("witnessSha256"))
        complete = raw.get("complete") is True or (
            "complete-prime-order-class-origin-coverage" in raw.get("claims", [])
        )
    elif isinstance(raw.get("torsionWitnesses"), list):
        witnesses = raw["torsionWitnesses"]
        spherical = raw.get("sphericalCatalogue", {})
        supplied_digest = (
            spherical.get("witnessDigest") if isinstance(spherical, Mapping) else None
        )
        complete = isinstance(spherical, Mapping) and spherical.get("complete") is True
    else:
        raise CoordinatorError("Witness artifact has no witness list")
    if not complete:
        raise CoordinatorError(
            "The witness artifact does not claim complete prime-order coverage"
        )
    normalized = tuple(dict(item) for item in witnesses if isinstance(item, Mapping))
    if len(normalized) != len(witnesses) or not normalized:
        raise CoordinatorError("Witness records must be a nonempty object array")
    digest = module_catalogue.sha256_json(list(normalized))
    if supplied_digest is not None and supplied_digest != digest:
        raise CoordinatorError("Witness artifact digest is stale or corrupt")
    if digest != expected_digest:
        raise CoordinatorError(
            "Witness artifact belongs to a different module catalogue"
        )
    declared_count = raw.get("witnessCount")
    if declared_count is not None and int(declared_count) != len(normalized):
        raise CoordinatorError("Witness artifact count is stale")
    identifiers = [str(item.get("id", "")) for item in normalized]
    if any(not identifier for identifier in identifiers) or len(
        set(identifiers)
    ) != len(identifiers):
        raise CoordinatorError("Witness ids must be nonempty and unique")
    return WitnessCatalogue(normalized, digest, source_sha256, kind)


def _load_witness_catalogue(
    source: SourceContext,
    loaded_catalogues: Sequence[LoadedCatalogue],
    expected_digest: str,
    explicit_path: Path | None,
) -> WitnessCatalogue:
    candidates: list[tuple[str, str, Mapping[str, Any]]] = []
    if explicit_path is not None:
        path = explicit_path.expanduser().resolve()
        raw = _read_json_object(path, "witness catalogue")
        candidates.append((sha256_file(path), "explicit-witness-catalogue", raw))
    if "torsionWitnesses" in source.raw or "witnesses" in source.raw:
        candidates.append(
            (source.input_hash, "witnesses-embedded-in-input", source.raw)
        )
    if explicit_path is None:
        seen: set[Path] = set()
        for catalogue in loaded_catalogues:
            for pattern in ("spherical-witnesses-*.json", "witness-catalogue.json"):
                for path in sorted(catalogue.path.parent.glob(pattern)):
                    resolved = path.resolve()
                    if resolved in seen:
                        continue
                    seen.add(resolved)
                    candidates.append(
                        (
                            sha256_file(resolved),
                            "catalogue-adjacent-witness-catalogue",
                            _read_json_object(resolved, "witness catalogue"),
                        )
                    )
    errors: list[str] = []
    for source_hash, kind, raw in candidates:
        try:
            return _extract_witnesses(
                raw,
                expected_digest=expected_digest,
                source_sha256=source_hash,
                kind=kind,
            )
        except CoordinatorError as exc:
            errors.append(str(exc))
    detail = f" ({'; '.join(errors)})" if errors else ""
    raise CoordinatorError(
        "A complete witness catalogue is required. Supply --witness-catalogue "
        "or place the matching spherical-witnesses-*.json beside a module "
        f"catalogue{detail}"
    )


def _merge_catalogues(
    catalogues: Sequence[LoadedCatalogue], source: SourceContext
) -> tuple[dict[str, Any], dict[str, Path]]:
    reference = catalogues[0].value
    for catalogue in catalogues[1:]:
        for field in ("sourceSha256", "matrixSha256", "witnessSha256"):
            if catalogue.value["hashes"][field] != reference["hashes"][field]:
                raise CoordinatorError(f"Catalogue compatibility failed at {field}")
        for field in ("witnessCount", "sourceGeneratorCount"):
            if catalogue.value[field] != reference[field]:
                raise CoordinatorError(f"Catalogue compatibility failed at {field}")
    merged = module_catalogue.build_catalogue(
        source_sha256=source.input_hash,
        matrix_sha256=source.matrix_hash,
        witness_sha256=reference["hashes"]["witnessSha256"],
        witness_count=reference["witnessCount"],
        source_generator_count=reference["sourceGeneratorCount"],
        finite_images=[
            image
            for catalogue in catalogues
            for image in catalogue.value["finiteImages"]
        ],
        modules=[
            module for catalogue in catalogues for module in catalogue.value["modules"]
        ],
        scope={
            "kind": "everitt-composite-compatible-union",
            "componentCatalogueSha256": sorted(
                catalogue.value["catalogueSha256"] for catalogue in catalogues
            ),
        },
        complete=all(catalogue.value["complete"] for catalogue in catalogues),
    )
    blobs: dict[str, Path] = {}
    for catalogue in catalogues:
        for digest, path in catalogue.verified_blobs.items():
            prior = blobs.get(digest)
            if prior is not None and sha256_file(prior) != sha256_file(path):
                raise CoordinatorError(
                    "Equal packed-row digests resolved to unequal bytes"
                )
            blobs[digest] = path
    return merged, blobs


def _screen_modules(
    merged: Mapping[str, Any],
    blobs: Mapping[str, Path],
    bounds: SearchBounds,
    lower: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    eligible: list[dict[str, Any]] = []
    admitted: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for module in merged["modules"]:
        degree = int(module["degree"])
        first_target = math.lcm(degree, lower)
        summary = {
            "moduleId": module["id"],
            "moduleSha256": module["moduleSha256"],
            "degree": degree,
            "status": module["status"],
            "firstCompatibleTarget": first_target,
        }
        if first_target > bounds.max_degree:
            excluded.append(summary)
            continue
        descriptor = dict(module["packedPermutationRows"])
        blob = blobs.get(str(descriptor["sha256"]))
        if blob is None:
            raise CoordinatorError(f"No verified packed rows remain for {module['id']}")
        descriptor["path"] = str(blob)
        eligible.append(
            {
                "id": module["id"],
                "degree": degree,
                "packedActions": descriptor,
            }
        )
        admitted.append(summary)
    return eligible, {
        "criterion": "factor-degree-divides-diagonal-orbit-degree",
        "necessaryOnly": True,
        "targetDegrees": _target_degree_screen(lower, bounds.max_degree),
        "admittedModules": admitted,
        "excludedModules": excluded,
    }


def _audit_recomputed_coverage(
    problem: packed_solver.PackedProblem,
    merged: Mapping[str, Any],
    original_witnesses: Sequence[Mapping[str, Any]],
) -> None:
    by_id = {str(module["id"]): module for module in merged["modules"]}
    original_ids = [str(witness["id"]) for witness in original_witnesses]
    for packed in problem.modules:
        source_module = by_id[packed.id]
        expected_indexes = module_catalogue.coverage_indexes(
            source_module["fixedPointCoverage"],
            merged["hashes"]["witnessSha256"],
        )
        expected_ids = {original_ids[index] for index in expected_indexes}
        actual_ids = {
            witness.id
            for index, witness in enumerate(problem.witnesses)
            if packed.free_mask & (1 << index)
        }
        if expected_ids != actual_ids:
            raise CoordinatorError(
                f"Recomputed witness coverage disagrees for module {packed.id}"
            )


def _portfolio_checkpoint_binding(
    source: SourceContext,
    catalogues: Sequence[LoadedCatalogue],
    merged: Mapping[str, Any],
    witnesses: WitnessCatalogue,
    problem: packed_solver.PackedProblem,
) -> str:
    """Bind resumable search state to its exact inputs and coordinator."""

    return module_catalogue.sha256_json(
        {
            "coordinatorVersion": COORDINATOR_VERSION,
            "coordinatorSha256": COORDINATOR_SHA256,
            "sourceSha256": source.input_hash,
            "matrixSha256": source.matrix_hash,
            "witnessSha256": witnesses.digest,
            "witnessArtifactSha256": witnesses.source_sha256,
            "componentCatalogues": sorted(
                [
                    {
                        "catalogueSha256": item.value["catalogueSha256"],
                        "fileSha256": item.file_sha256,
                    }
                    for item in catalogues
                ],
                key=lambda item: (item["catalogueSha256"], item["fileSha256"]),
            ),
            "mergedCatalogueSha256": merged["catalogueSha256"],
            "problemSha256": problem.problem_sha256,
        }
    )


def _apply_word(rows: Sequence[Sequence[int]], word: Sequence[int], point: int) -> int:
    for generator in word:
        point = int(rows[generator][point])
    return point


def _restricted_orbit_sizes(
    rows: Sequence[Sequence[int]], subset: Sequence[int]
) -> list[int]:
    degree = len(rows[0])
    seen = bytearray(degree)
    queue = array("I", [0]) * degree
    sizes: list[int] = []
    for seed in range(degree):
        if seen[seed]:
            continue
        seen[seed] = 1
        queue[0] = seed
        head = 0
        tail = 1
        while head < tail:
            point = int(queue[head])
            head += 1
            for generator in subset:
                image = int(rows[generator][point])
                if not seen[image]:
                    seen[image] = 1
                    queue[tail] = image
                    tail += 1
        sizes.append(tail)
    return sizes


def _certify_materialized_action(
    source: SourceContext,
    witnesses: Sequence[Mapping[str, Any]],
    action: packed_solver.MaterializedAction,
) -> dict[str, Any]:
    """Replay the final action independently of factorwise coverage metadata."""

    rows = action.generator_actions
    degree = action.candidate.degree
    if len(rows) != len(source.matrix) or any(len(row) != degree for row in rows):
        raise CoordinatorError("Materialized action has stale rank or degree")

    relation_checks: list[dict[str, Any]] = []
    relations_passed = True
    for generator, row in enumerate(rows):
        passed = all(int(row[int(row[point])]) == point for point in range(degree))
        relation_checks.append(
            {
                "kind": "involution",
                "generators": [generator],
                "passed": passed,
            }
        )
        relations_passed = relations_passed and passed
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            m = source.matrix[left][right]
            if m == 0:
                continue
            passed = True
            for point in range(degree):
                image = point
                for _ in range(m):
                    image = int(rows[left][image])
                    image = int(rows[right][image])
                if image != point:
                    passed = False
                    break
            relation_checks.append(
                {
                    "kind": "coxeter-relation",
                    "generators": [left, right],
                    "m": m,
                    "passed": passed,
                }
            )
            relations_passed = relations_passed and passed

    visited = bytearray(degree)
    queue = array("I", [0]) * degree
    visited[0] = 1
    head = 0
    tail = 1
    while head < tail:
        point = int(queue[head])
        head += 1
        for row in rows:
            image = int(row[point])
            if not visited[image]:
                visited[image] = 1
                queue[tail] = image
                tail += 1
    transitive = tail == degree

    witness_checks: list[dict[str, Any]] = []
    witnesses_passed = True
    for witness in witnesses:
        word = [int(value) for value in witness["word"]]
        fixed = sum(_apply_word(rows, word, point) == point for point in range(degree))
        passed = fixed == 0
        witness_checks.append(
            {
                "witnessId": str(witness["id"]),
                "primeOrder": int(witness["primeOrder"]),
                "fixedPointCount": fixed,
                "passed": passed,
            }
        )
        witnesses_passed = witnesses_passed and passed

    spherical_checks: list[dict[str, Any]] = []
    spherical_passed = True
    for subgroup in source.maximal_spherical:
        expected = int(subgroup["order"])
        sizes = _restricted_orbit_sizes(rows, subgroup["subset"])
        histogram: dict[str, int] = {}
        for size in sizes:
            key = str(size)
            histogram[key] = histogram.get(key, 0) + 1
        passed = degree % expected == 0 and all(size == expected for size in sizes)
        spherical_checks.append(
            {
                "subgroupId": subgroup["id"],
                "subset": list(subgroup["subset"]),
                "type": subgroup["type"],
                "expectedOrder": expected,
                "orbitCount": len(sizes),
                "expectedOrbitCount": degree // expected
                if degree % expected == 0
                else None,
                "orbitSizeHistogram": dict(
                    sorted(histogram.items(), key=lambda item: int(item[0]))
                ),
                "passed": passed,
            }
        )
        spherical_passed = spherical_passed and passed

    passed = transitive and relations_passed and witnesses_passed and spherical_passed
    return {
        "status": "passed" if passed else "failed",
        "passed": passed,
        "degree": degree,
        "transitive": transitive,
        "coxeterRelationsPassed": relations_passed,
        "witnessDiagnosticsPassed": witnesses_passed,
        "maximalSphericalRegularOrbitChecksPassed": spherical_passed,
        "relationChecks": relation_checks,
        "witnessChecks": witness_checks,
        "sphericalOrbitChecks": spherical_checks,
        "criterion": "maximal-spherical-restrictions-are-regular",
        "theoremBasis": [
            "every finite subgroup of a Coxeter group is conjugate into a spherical special subgroup",
            "a point stabilizer is torsion-free when every maximal spherical subgroup acts freely",
            "a finite group action is free exactly when every orbit has the group order",
        ],
    }


def _decode_product_point(code: int, degrees: Sequence[int]) -> list[int]:
    coordinates: list[int] = []
    for degree in degrees:
        coordinates.append(code % degree)
        code //= degree
    return coordinates


def _diagonal_image(
    code: int,
    modules: Sequence[packed_solver.PackedModule],
    generator: int,
) -> int:
    result = 0
    multiplier = 1
    for module in modules:
        coordinate = code % module.degree
        code //= module.degree
        result += int(module.actions[generator][coordinate]) * multiplier
        multiplier *= module.degree
    return result


def _audit_selected_product_partition(
    problem: packed_solver.PackedProblem,
    candidate: packed_solver.OrbitCandidate,
) -> dict[str, Any]:
    """Repartition the winning product and hash every double-coset orbit record."""

    modules = tuple(problem.modules[index] for index in candidate.module_indices)
    degrees = [module.degree for module in modules]
    cartesian_degree = math.prod(degrees)
    if cartesian_degree != candidate.cartesian_degree:
        raise CoordinatorError("Candidate Cartesian product metadata is stale")
    visited = bytearray(cartesian_degree)
    queue = array("I", [0]) * cartesian_degree
    digest = hashlib.sha256()
    histogram: dict[str, int] = {}
    orbit_count = 0
    degree_sum = 0
    selected: dict[str, Any] | None = None
    for seed in range(cartesian_degree):
        if visited[seed]:
            continue
        visited[seed] = 1
        queue[0] = seed
        head = 0
        tail = 1
        while head < tail:
            point = int(queue[head])
            head += 1
            for generator in range(problem.rank):
                image = _diagonal_image(point, modules, generator)
                if not visited[image]:
                    visited[image] = 1
                    queue[tail] = image
                    tail += 1
        record = {
            "orbitIndex": orbit_count,
            "representativeCode": str(seed),
            "representativeTuple": _decode_product_point(seed, degrees),
            "degree": tail,
        }
        digest.update(canonical_json(record).encode("utf-8"))
        digest.update(b"\n")
        histogram[str(tail)] = histogram.get(str(tail), 0) + 1
        degree_sum += tail
        if seed == candidate.representative_code:
            selected = record
        orbit_count += 1
    if degree_sum != cartesian_degree:
        raise CoordinatorError("Selected product orbits do not partition the product")
    if selected is None or selected["orbitIndex"] != candidate.orbit_index:
        raise CoordinatorError("Selected orbit record disagrees with solver candidacy")
    if selected["degree"] != candidate.degree:
        raise CoordinatorError("Selected orbit degree changed during replay")
    return {
        "decompositionKind": candidate.decomposition_kind,
        "interpretation": (
            "complete double-coset partition of the selected two-factor product"
            if len(modules) == 2
            else "complete diagonal-orbit partition of the selected factor product"
        ),
        "factorModuleIds": list(candidate.module_ids),
        "factorDegrees": degrees,
        "repeatedFactorPositions": [
            [left, right]
            for left in range(len(candidate.module_ids))
            for right in range(left + 1, len(candidate.module_ids))
            if candidate.module_ids[left] == candidate.module_ids[right]
        ],
        "cartesianDegree": str(cartesian_degree),
        "orbitCount": orbit_count,
        "orbitDegreeSum": str(degree_sum),
        "orbitDegreeHistogram": dict(
            sorted(histogram.items(), key=lambda item: int(item[0]))
        ),
        "orbitRecordsSha256": digest.hexdigest(),
        "allProductOrbitsEnumerated": True,
        "selectedOrbit": selected,
    }


def _base_artifact(source: SourceContext, bounds: SearchBounds) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "track": TRACK,
        "status": "planned",
        "complete": False,
        "completeScope": "none",
        "inputHash": source.input_hash,
        "lowerBoundDivisor": source.lower_bound,
        "bounds": bounds.as_json(),
        "candidates": [],
        "evidence": {
            "source": {
                "matrixSha256": source.matrix_hash,
                "rank": len(source.matrix),
                "maximalSphericalSubgroups": list(source.maximal_spherical),
                "lowerBoundDerivation": "lcm-of-maximal-spherical-subgroup-orders",
            },
            "implementation": {
                "coordinatorVersion": COORDINATOR_VERSION,
                "coordinatorSha256": COORDINATOR_SHA256,
                "packedSolverId": packed_solver.SOLVER_ID,
                "packedSolverVersion": packed_solver.SOLVER_VERSION,
                "packedSolverSha256": packed_solver.SOLVER_SOURCE_SHA256,
            },
        },
        "warnings": [],
        "errors": [],
        "claims": [],
        "nonClaims": [
            "global completeness outside recorded catalogue and solver bounds",
            "virtual fibering",
        ],
    }


def build_dry_run(
    input_path: Path,
    catalogue_paths: Sequence[Path],
    bounds: SearchBounds,
) -> dict[str, Any]:
    bounds.validate()
    source = _load_source(input_path)
    artifact = _base_artifact(source, bounds)
    catalogue_evidence: list[dict[str, Any]] = []
    if catalogue_paths:
        loaded, witness_hash = _load_catalogues(catalogue_paths, source)
        catalogue_evidence = [
            {
                "catalogueSha256": item.value["catalogueSha256"],
                "fileSha256": item.file_sha256,
                "complete": item.value["complete"],
                "moduleCount": len(item.value["modules"]),
            }
            for item in loaded
        ]
        artifact["evidence"]["expectedWitnessSha256"] = witness_hash
    artifact.update(status="planned", complete=False)
    artifact["evidence"].update(
        {
            "catalogues": catalogue_evidence,
            "targetDegreeScreen": _target_degree_screen(
                source.lower_bound, bounds.max_degree
            ),
            "plannedRequirements": {
                "catalogue": {
                    "schemaVersion": module_catalogue.SCHEMA_VERSION,
                    "artifactType": module_catalogue.ARTIFACT_TYPE,
                    "compatibilityHashes": [
                        "sourceSha256",
                        "matrixSha256",
                        "witnessSha256",
                    ],
                },
                "packedRows": "content-addressed blobs beside each catalogue",
                "witnesses": (
                    "complete hash-matching witness catalogue supplied explicitly, "
                    "embedded in input, or adjacent to a module catalogue"
                ),
                "search": (
                    "all bounded factor multisets with repetition and every "
                    "transitive diagonal orbit"
                ),
            },
        }
    )
    if not catalogue_paths:
        artifact["warnings"].append(
            "No module catalogues were supplied; this dry run only records requirements."
        )
    artifact["warnings"].append(
        "Factorwise witness coverage is an ordering diagnostic, never a proof."
    )
    return _seal_artifact(artifact)


def run_portfolio(
    *,
    input_path: Path,
    catalogue_paths: Sequence[Path],
    witness_catalogue_path: Path | None,
    bounds: SearchBounds,
    checkpoint_path: Path | None,
    resume: bool,
    materialized_action_path: Path,
) -> dict[str, Any]:
    """Run one deterministic, bounded composite-module portfolio."""

    bounds.validate()
    source = _load_source(input_path)
    _target_degree_screen(source.lower_bound, bounds.max_degree)
    loaded, witness_hash = _load_catalogues(catalogue_paths, source)
    witnesses = _load_witness_catalogue(
        source, loaded, witness_hash, witness_catalogue_path
    )
    if len(witnesses.witnesses) != loaded[0].value["witnessCount"]:
        raise CoordinatorError("Witness count disagrees with the module catalogues")
    merged, blobs = _merge_catalogues(loaded, source)
    raw_modules, degree_screen = _screen_modules(
        merged, blobs, bounds, source.lower_bound
    )
    artifact = _base_artifact(source, bounds)
    artifact["warnings"].append(
        "Factorwise witness coverage was not used as a proof; every admitted "
        "orbit received an exact point-level witness replay."
    )
    artifact["evidence"].update(
        {
            "catalogues": [
                {
                    "catalogueSha256": item.value["catalogueSha256"],
                    "fileSha256": item.file_sha256,
                    "complete": item.value["complete"],
                    "scope": item.value["scope"],
                    "moduleCount": len(item.value["modules"]),
                    "packedBytes": item.value["storage"]["uniquePackedBytes"],
                }
                for item in loaded
            ],
            "mergedCatalogue": {
                "catalogueSha256": merged["catalogueSha256"],
                "complete": merged["complete"],
                "moduleCount": len(merged["modules"]),
                "finiteImageCount": len(merged["finiteImages"]),
                "partialModuleCount": sum(
                    module["status"] == "partial" for module in merged["modules"]
                ),
            },
            "witnessCatalogue": {
                "sha256": witnesses.digest,
                "artifactSha256": witnesses.source_sha256,
                "kind": witnesses.kind,
                "count": len(witnesses.witnesses),
                "complete": True,
            },
            "targetDegreeScreen": degree_screen,
        }
    )
    if not raw_modules:
        artifact.update(
            status="exhausted",
            complete=bool(merged["complete"]),
            completeScope=(
                "bounded-supplied-catalogue-objective" if merged["complete"] else "none"
            ),
        )
        artifact["warnings"].append(
            "No module degree can divide a permitted target degree; this says "
            "nothing about modules outside the supplied catalogues."
        )
        artifact["evidence"]["completeness"] = {
            "catalogueScopesComplete": bool(merged["complete"]),
            "boundedSearchObjectiveComplete": True,
            "solverBoundedScopeComplete": True,
            "allBoundedFactorMultisetsAndOrbitsEnumerated": True,
            "minimumWithinBoundedScopeProved": False,
            "terminatedAtExactLowerBound": False,
            "candidateCertificateComplete": False,
            "boundedExhaustionProved": True,
            "globalModuleUniverseComplete": False,
        }
        return _seal_artifact(artifact)

    problem = packed_solver.prepare_problem(
        raw_modules,
        list(witnesses.witnesses),
        witness_catalogue_complete=True,
        lower_bound=source.lower_bound,
        coxeter_matrix=source.matrix,
    )
    try:
        _audit_recomputed_coverage(problem, merged, witnesses.witnesses)
        solver = packed_solver.PackedCompositeSolver(problem, bounds.solver_limits())
        checkpoint_binding = _portfolio_checkpoint_binding(
            source, loaded, merged, witnesses, problem
        )
        result, checkpoint_evidence = _solve_with_checkpoint_integrity(
            solver, problem, checkpoint_binding, checkpoint_path, resume
        )
        result_json = _portable_solver_result(result)
        artifact["evidence"]["solver"] = result_json
        if checkpoint_evidence is not None:
            artifact["evidence"]["checkpoint"] = checkpoint_evidence
        artifact["evidence"]["diagonalOrbitDiagnostics"] = {
            key: result.diagnostics[key]
            for key in (
                "factor_multisets_evaluated",
                "diagonal_orbits_enumerated",
                "double_coset_decompositions",
                "iterated_orbit_decompositions",
                "witness_tested_orbits",
                "witness_rejected_orbits",
                "exceptional_witness_free_orbits",
                "cartesian_points_partitioned",
            )
        }
        artifact["evidence"]["orbitEnumerationContract"] = {
            "factorPolicy": "nondecreasing module multisets with repetition",
            "conjugateStabilizerPolicy": (
                "all Cartesian seeds are partitioned, so off-base diagonal "
                "orbits represent conjugate point-stabilizer intersections"
            ),
            "twoFactorInterpretation": (
                "every diagonal orbit is one double coset of the two point stabilizers"
            ),
            "allOrbitsEnumeratedForEveryEvaluatedFactorMultiset": True,
            "diagnosticRetention": {
                "allEvaluatedProducts": (
                    "exact aggregate partition and rejection counts"
                ),
                "selectedProduct": (
                    "complete orbit-count/degree partition with a canonical "
                    "orbit-record digest"
                ),
                "rejectedOrbitPointLists": (
                    "discarded after exact testing to keep the portfolio bounded"
                ),
            },
            "factorMultisetScope": {
                "maxFactors": bounds.max_factors,
                "maxCartesianPoints": bounds.max_cartesian_points,
                "maxDegree": bounds.max_degree,
                "maxCombinations": bounds.max_combinations,
            },
        }
        bounded_complete = bool(result.search_complete)
        catalogue_complete = bool(merged["complete"])
        lower_bound_termination = bool(
            result.candidate is not None
            and result.candidate.degree == source.lower_bound
            and result.minimum_proved
        )
        orbit_enumeration_complete = bounded_complete and not lower_bound_termination
        artifact["complete"] = bounded_complete and catalogue_complete
        artifact["completeScope"] = (
            "bounded-supplied-catalogue-objective" if artifact["complete"] else "none"
        )
        artifact["evidence"]["completeness"] = {
            "catalogueScopesComplete": catalogue_complete,
            "boundedSearchObjectiveComplete": bounded_complete,
            "solverBoundedScopeComplete": bounded_complete,
            "allBoundedFactorMultisetsAndOrbitsEnumerated": orbit_enumeration_complete,
            "minimumWithinBoundedScopeProved": bool(result.minimum_proved),
            "terminatedAtExactLowerBound": lower_bound_termination,
            "candidateCertificateComplete": False,
            "boundedExhaustionProved": bool(
                bounded_complete and result.candidate is None
            ),
            "globalModuleUniverseComplete": False,
            "limits": list(result.limitations),
        }
        if not catalogue_complete:
            artifact["warnings"].append(
                "At least one catalogue has incomplete enumeration bounds; its "
                "verified partial modules were retained, but exhaustion is inconclusive."
            )
        if not bounded_complete:
            artifact["warnings"].append(
                "The packed search reached a recorded resource bound and is incomplete."
            )
        if lower_bound_termination:
            artifact["warnings"].append(
                "Search stopped after finding the exact spherical lower-bound degree. "
                "This proves degree optimality, but it does not enumerate remaining "
                "equal-or-larger in-scope orbits."
            )
            artifact["nonClaims"].append(
                "an exhaustive list of equal-degree or larger in-scope survivors"
            )
        if result.candidate is None:
            artifact["status"] = "exhausted" if bounded_complete else "incomplete"
            artifact["warnings"].append(
                "No survivor in this bounded portfolio is not evidence that no "
                "torsion-free finite-index subgroup exists."
            )
            return _seal_artifact(artifact)

        action = solver.materialize_candidate(result.candidate)
        independent = _certify_materialized_action(source, witnesses.witnesses, action)
        if not independent["passed"]:
            raise CoordinatorError(
                "The selected orbit failed independent Coxeter/spherical certification"
            )
        product_partition = _audit_selected_product_partition(problem, result.candidate)
        packed_solver.write_materialized_action_json(
            materialized_action_path, problem, action
        )
        action_file_hash = sha256_file(materialized_action_path)
        candidate_json = result_json["candidate"]
        module_by_id = {str(module["id"]): module for module in merged["modules"]}
        factors = [
            {
                "moduleId": module_id,
                "moduleSha256": module_by_id[module_id]["moduleSha256"],
                "degree": module_by_id[module_id]["degree"],
                "status": module_by_id[module_id]["status"],
                "provenance": module_by_id[module_id]["provenance"],
            }
            for module_id in result.candidate.module_ids
        ]
        candidate_record = {
            **candidate_json,
            "factors": factors,
            "materializedAction": {
                "actionSha256": action.action_sha256,
                "artifactSha256": action_file_hash,
                "degree": result.candidate.degree,
                "generatorCount": problem.rank,
                "witnessFixedPointCounts": list(action.witness_fixed_point_counts),
            },
            "selectedProductOrbitPartition": product_partition,
            "certificate": {
                "status": "passed",
                "transitiveOrbitMaterialized": True,
                "coxeterRelationsReplayed": independent["coxeterRelationsPassed"],
                "completeWitnessCatalogue": True,
                "allWitnessFixedPointCountsZero": not any(
                    action.witness_fixed_point_counts
                ),
                "maximalSphericalRestrictionsRegular": independent[
                    "maximalSphericalRegularOrbitChecksPassed"
                ],
                "criterion": "maximal-spherical-regular-orbits",
                "independentPointLevelCertificate": independent,
            },
        }
        artifact["evidence"]["completeness"]["candidateCertificateComplete"] = True
        artifact["candidates"] = [candidate_record]
        artifact["status"] = "candidate-found"
        artifact["claims"] = [
            "a transitive finite Coxeter action passed the complete prime-order witness test",
            "every maximal spherical subgroup has only regular orbits on the materialized action",
            "the materialized point stabilizer is torsion-free by the spherical-subgroup criterion",
        ]
        if result.candidate.degree == source.lower_bound:
            artifact["claims"].append(
                "the subgroup index attains the spherical divisibility lower bound"
            )
        else:
            artifact["nonClaims"].append("globally minimal torsion-free index")
        return _seal_artifact(artifact)
    finally:
        problem.close()


def _failed_artifact(args: argparse.Namespace, error: Exception) -> dict[str, Any]:
    bounds = _bounds_from_args(args)
    try:
        source = _load_source(args.input)
        artifact = _base_artifact(source, bounds)
    except Exception:  # The failure artifact must survive malformed source JSON.
        input_hash = sha256_file(args.input) if args.input.is_file() else ""
        artifact = {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "track": TRACK,
            "status": "failed",
            "complete": False,
            "completeScope": "none",
            "inputHash": input_hash,
            "lowerBoundDivisor": None,
            "bounds": bounds.as_json(),
            "candidates": [],
            "evidence": {},
            "warnings": [],
            "errors": [],
            "claims": [],
            "nonClaims": ["any subgroup or cover result"],
        }
    artifact.update(status="failed", complete=False)
    artifact["errors"] = [str(error)]
    return _seal_artifact(artifact)


def _bounds_from_args(args: argparse.Namespace) -> SearchBounds:
    return SearchBounds(
        max_factors=args.max_factors,
        max_degree=args.max_degree,
        max_cartesian_points=args.max_cartesian_points,
        max_combinations=args.max_combinations,
        max_bytes=args.max_bytes,
        max_mapped_bytes=args.max_mapped_bytes,
        checkpoint_interval=args.checkpoint_interval,
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Coxeter source JSON")
    parser.add_argument(
        "--catalogue",
        type=Path,
        action="append",
        default=[],
        help="Sealed finite_image_module_catalogue v1 JSON; repeat as needed",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--witness-catalogue", type=Path)
    parser.add_argument("--materialized-action", type=Path)
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--max-factors", type=int, default=8)
    parser.add_argument("--max-degree", type=int, default=1_000_000)
    parser.add_argument("--max-cartesian-points", type=int, default=8_000_000)
    parser.add_argument("--max-combinations", type=int, default=100_000)
    parser.add_argument("--max-bytes", type=int, default=512 * 1024 * 1024)
    parser.add_argument("--max-mapped-bytes", type=int, default=64 * 1024 * 1024 * 1024)
    parser.add_argument("--checkpoint-interval", type=int, default=250)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    bounds = _bounds_from_args(args)
    try:
        if args.dry_run:
            artifact = build_dry_run(args.input, args.catalogue, bounds)
        else:
            checkpoint = args.checkpoint or args.output.with_name(
                args.output.stem + ".checkpoint.json"
            )
            materialized = args.materialized_action or args.output.with_name(
                args.output.stem + ".materialized-action.json"
            )
            artifact = run_portfolio(
                input_path=args.input,
                catalogue_paths=args.catalogue,
                witness_catalogue_path=args.witness_catalogue,
                bounds=bounds,
                checkpoint_path=checkpoint,
                resume=args.resume,
                materialized_action_path=materialized,
            )
        _write_json_atomic(args.output, artifact)
        return 0 if artifact["status"] in {"planned", "candidate-found"} else 2
    except Exception as exc:  # CLI boundary: always leave a deterministic artifact.
        artifact = _failed_artifact(args, exc)
        _write_json_atomic(args.output, artifact)
        sys.stderr.write(str(exc) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
