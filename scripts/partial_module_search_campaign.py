#!/usr/bin/env python3
"""Integrate partial-module evidence and enforce the composition gate.

The Everitt-style search has two logically separate stages.  First, exact
actions must collectively make every prime-order torsion witness fixed-point
free somewhere.  Only after that set-cover condition holds is it meaningful
to enumerate diagonal orbits and double cosets.  This coordinator records that
decision and, when the gate is closed, can run the independent global
degree-5,760 CSP as a bounded fallback.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any, Iterable, Mapping, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import finite_image_module_catalogue as module_catalogue  # noqa: E402


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "partial-module-search-campaign"
CAMPAIGN_VERSION = "1.0.0"
DEFAULT_SOURCE = REPO_ROOT / "public" / "examples" / "compact_5_cube_gamma1.json"
DEFAULT_ORDER5 = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_order5_partial_modules.json"
)
DEFAULT_MOD2 = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_mod2_symbolic_partial_modules.json"
)
DEFAULT_COMPOSITE = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_mod2_symbolic_composite_195840.json"
)
DEFAULT_P2 = REPO_ROOT / ".cover-search" / "live-portfolio" / "p2.json"
DEFAULT_FALLBACK = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_global_csp_fallback_5760.json"
)
DEFAULT_OUTPUT = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_partial_module_campaign.json"
)
TARGET_DEGREES = (5_760, 11_520, 17_280, 23_040, 46_080, 97_920)


class CampaignIntegrationError(ValueError):
    """A subcampaign report is malformed, stale, or mathematically incompatible."""


def canonical_json(value: Any) -> str:
    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise CampaignIntegrationError(f"Value is not canonical JSON: {exc}") from exc


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CampaignIntegrationError(f"Cannot read JSON {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise CampaignIntegrationError(f"{path} must contain one JSON object.")
    return value


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf8",
    )
    os.replace(temporary, path)


def _portable_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def _require_hash(value: Any, field: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise CampaignIntegrationError(f"{field} must be a lowercase SHA-256 hash.")
    return value


def _verify_seal(report: Mapping[str, Any], field: str) -> str:
    stored = _require_hash(report.get(field), field)
    body = json.loads(canonical_json(report))
    body.pop(field, None)
    if sha256_json(body) != stored:
        raise CampaignIntegrationError(f"The {field} seal is stale or corrupt.")
    return stored


def _extract_witnesses(raw: Mapping[str, Any]) -> tuple[list[dict[str, Any]], str]:
    candidates = raw.get("torsionWitnesses", raw.get("witnesses"))
    if not isinstance(candidates, list) or not candidates:
        raise CampaignIntegrationError("The witness source has no witness array.")
    witnesses: list[dict[str, Any]] = []
    identifiers: set[str] = set()
    for index, value in enumerate(candidates):
        if not isinstance(value, Mapping):
            raise CampaignIntegrationError(f"Witness {index} is not an object.")
        identifier = value.get("id")
        order = value.get("primeOrder")
        if (
            not isinstance(identifier, str)
            or not identifier
            or identifier in identifiers
        ):
            raise CampaignIntegrationError("Witness ids must be distinct strings.")
        if isinstance(order, bool) or not isinstance(order, int) or order < 2:
            raise CampaignIntegrationError(f"Witness {identifier} has no prime order.")
        witnesses.append(json.loads(canonical_json(value)))
        identifiers.add(identifier)
    digest = sha256_json(witnesses)
    declared = raw.get("witnessDigest", raw.get("witnessSha256"))
    spherical = raw.get("sphericalCatalogue")
    if declared is None and isinstance(spherical, Mapping):
        declared = spherical.get("witnessDigest")
    if declared is not None and declared != digest:
        raise CampaignIntegrationError("The witness source digest is stale.")
    return witnesses, digest


def _coverage_from_standard_record(
    record: Mapping[str, Any], witness_sha256: str, witness_count: int
) -> frozenset[int]:
    coverage = record.get("fixedPointCoverage")
    if not isinstance(coverage, Mapping):
        raise CampaignIntegrationError("An exact module has no fixed-point coverage.")
    try:
        indexes = module_catalogue.coverage_indexes(coverage, witness_sha256)
    except module_catalogue.CatalogueError as exc:
        raise CampaignIntegrationError(f"Invalid module coverage: {exc}") from exc
    if coverage.get("witnessCount") != witness_count:
        raise CampaignIntegrationError("An exact module has a stale witness count.")
    return frozenset(indexes)


def validate_order5_report(
    report: Mapping[str, Any], witness_sha256: str, witness_count: int
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    if report.get("artifactType") != "order5-first-partial-module-campaign":
        raise CampaignIntegrationError(
            "The primary report has the wrong artifact type."
        )
    if report.get("mode") != "real":
        raise CampaignIntegrationError("The order-5 campaign was not executed.")
    report_hash = _verify_seal(report, "reportSha256")
    source = report.get("source")
    if not isinstance(source, Mapping):
        raise CampaignIntegrationError("The order-5 report has no source binding.")
    if source.get("witnessSha256") != witness_sha256:
        raise CampaignIntegrationError("The order-5 report uses another witness set.")
    if source.get("witnessCount") != witness_count:
        raise CampaignIntegrationError("The order-5 witness count is stale.")
    portfolio = report.get("paretoPortfolio")
    if not isinstance(portfolio, Mapping) or not isinstance(
        portfolio.get("modules"), list
    ):
        raise CampaignIntegrationError("The order-5 report has no exact portfolio.")
    modules: list[dict[str, Any]] = []
    for raw in portfolio["modules"]:
        if not isinstance(raw, Mapping):
            raise CampaignIntegrationError("An order-5 module is not an object.")
        coverage = _coverage_from_standard_record(raw, witness_sha256, witness_count)
        modules.append(
            {
                "id": str(raw["id"]),
                "degree": int(raw["degree"]),
                "coverage": coverage,
                "source": "order-5-primary",
                "materialization": (
                    "inline-generator-rows"
                    if isinstance(raw.get("generatorRows"), list)
                    else "content-addressed-packed-action"
                ),
            }
        )
    observed = (
        set().union(*(module["coverage"] for module in modules)) if modules else set()
    )
    summary = report.get("unionCoverage")
    if not isinstance(summary, Mapping) or summary.get("coveredCount") != len(observed):
        raise CampaignIntegrationError("The order-5 union coverage is inconsistent.")
    return modules, {
        "reportSha256": report_hash,
        "matrixSha256": _require_hash(source.get("matrixSha256"), "matrixSha256"),
        "sourceSha256": _require_hash(
            source.get("moduleSourceSha256"), "moduleSourceSha256"
        ),
    }


def validate_mod2_report(
    report: Mapping[str, Any], witness_sha256: str, witness_count: int
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    if report.get("artifactType") != "mod2-symbolic-partial-module-catalogue":
        raise CampaignIntegrationError("The mod-2 report has the wrong artifact type.")
    report_hash = _verify_seal(report, "artifactSha256")
    source = report.get("source")
    hashes = source.get("hashes") if isinstance(source, Mapping) else None
    if not isinstance(hashes, Mapping):
        raise CampaignIntegrationError("The mod-2 report has no source hashes.")
    if hashes.get("witnessCatalogueSha256") != witness_sha256:
        raise CampaignIntegrationError("The mod-2 report uses another witness set.")
    entries = report.get("entries")
    if not isinstance(entries, list):
        raise CampaignIntegrationError("The mod-2 report has no class entries.")
    modules: list[dict[str, Any]] = []
    for raw in entries:
        if not isinstance(raw, Mapping) or raw.get("kind") != "exact-module":
            continue
        coverage = raw.get("coverage")
        if not isinstance(coverage, Mapping) or coverage.get("status") != "exact":
            raise CampaignIntegrationError("A mod-2 exact module lacks exact marks.")
        if coverage.get("witnessCount") != witness_count:
            raise CampaignIntegrationError("A mod-2 marks vector has a stale length.")
        if coverage.get("witnessSha256") != witness_sha256:
            raise CampaignIntegrationError("A mod-2 marks vector has a stale digest.")
        indexes = coverage.get("coveredWitnessIndexes")
        if (
            not isinstance(indexes, list)
            or any(
                isinstance(index, bool)
                or not isinstance(index, int)
                or index < 0
                or index >= witness_count
                for index in indexes
            )
            or indexes != sorted(set(indexes))
        ):
            raise CampaignIntegrationError("A mod-2 coverage index list is invalid.")
        bits = bytearray((witness_count + 7) // 8)
        for index in indexes:
            bits[index // 8] |= 1 << (index % 8)
        coverage_core = {
            "encoding": "lsb0-hex",
            "witnessSha256": witness_sha256,
            "witnessCount": witness_count,
            "bitsetHex": bytes(bits).hex(),
            "coveredCount": len(indexes),
            "coveredWitnessIndexes": indexes,
        }
        if any(coverage.get(key) != value for key, value in coverage_core.items()):
            raise CampaignIntegrationError("A mod-2 coverage bitset is inconsistent.")
        if coverage.get("sha256") != sha256_json(coverage_core):
            raise CampaignIntegrationError("A mod-2 coverage seal is stale.")
        modules.append(
            {
                "id": str(raw["id"]),
                "degree": int(raw["degree"]),
                "coverage": frozenset(indexes),
                "source": "mod-2-symbolic-marks",
                "materialization": "compact-stabilizer-symbolic-coset-action",
            }
        )
    return modules, {
        "artifactSha256": report_hash,
        "matrixSha256": _require_hash(
            hashes.get("coxeterMatrixSha256"), "coxeterMatrixSha256"
        ),
    }


def validate_composite_report(
    report: Mapping[str, Any],
    *,
    mod2_artifact_sha256: str,
    mod2_file_sha256: str,
    witness_sha256: str,
    matrix_sha256: str,
) -> dict[str, Any]:
    """Validate the exact base exclusion and bounded double-coset frontier."""

    if report.get("artifactType") != "mod2-symbolic-composite-search":
        raise CampaignIntegrationError(
            "The symbolic-composite report has the wrong artifact type."
        )
    artifact_hash = _verify_seal(report, "artifactSha256")
    source_hashes = report.get("sourceHashes")
    if not isinstance(source_hashes, Mapping):
        raise CampaignIntegrationError(
            "The symbolic-composite report has no source hashes."
        )
    expected = {
        "symbolicReportSha256": mod2_artifact_sha256,
        "symbolicReportFileSha256": mod2_file_sha256,
        "witnessCatalogueSha256": witness_sha256,
        "coxeterMatrixSha256": matrix_sha256,
    }
    for field, value in expected.items():
        if source_hashes.get(field) != value:
            raise CampaignIntegrationError(
                f"The symbolic-composite {field} binding is stale."
            )

    base = report.get("baseExactCertificate")
    if (
        not isinstance(base, Mapping)
        or base.get("status") != "exact-exhausted"
        or base.get("maximumDegree") != 97_920
    ):
        raise CampaignIntegrationError(
            "The symbolic-composite report does not certify the base range."
        )
    status = report.get("status")
    allowed = {
        "incomplete-resource-bounded",
        "exact-exhausted",
        "certified-candidate",
    }
    if status not in allowed:
        raise CampaignIntegrationError(
            f"The symbolic-composite status is unsupported: {status!r}."
        )
    search = report.get("search")
    if not isinstance(search, Mapping):
        raise CampaignIntegrationError(
            "The symbolic-composite report has no search accounting."
        )
    complete = search.get("completeWithinDeclaredTargets") is True
    if status == "exact-exhausted" and not complete:
        raise CampaignIntegrationError(
            "An exact-exhausted composite report has incomplete accounting."
        )
    if status == "incomplete-resource-bounded" and complete:
        raise CampaignIntegrationError(
            "An incomplete composite report claims complete accounting."
        )
    independently_certified = False
    survivor_degree: int | None = None
    if status == "certified-candidate":
        replay = report.get("independentReplay")
        survivor = report.get("survivor")
        if (
            not isinstance(replay, Mapping)
            or replay.get("passed") is not True
            or replay.get("witnessFree") is not True
            or not isinstance(survivor, Mapping)
            or isinstance(survivor.get("degree"), bool)
            or not isinstance(survivor.get("degree"), int)
        ):
            raise CampaignIntegrationError(
                "A composite survivor lacks an independent exact replay."
            )
        independently_certified = True
        survivor_degree = int(survivor["degree"])

    return {
        "artifactSha256": artifact_hash,
        "status": status,
        "baseExactThroughDegree": 97_920,
        "nextFrontierDegree": 195_840,
        "completeAtNextFrontier": complete,
        "independentlyCertifiedCandidate": independently_certified,
        "survivorDegree": survivor_degree,
        "reason": search.get("reason"),
    }


def pareto_module_ids(modules: Sequence[Mapping[str, Any]]) -> list[str]:
    """Find degree/coverage nondominated modules without discarding evidence."""

    kept: list[str] = []
    ordered = sorted(modules, key=lambda item: (int(item["degree"]), str(item["id"])))
    for candidate in ordered:
        candidate_coverage = set(candidate["coverage"])
        dominated = False
        for other in ordered:
            if other["id"] == candidate["id"]:
                continue
            other_coverage = set(other["coverage"])
            no_worse = int(other["degree"]) <= int(
                candidate["degree"]
            ) and other_coverage.issuperset(candidate_coverage)
            strict = (
                int(other["degree"]) < int(candidate["degree"])
                or other_coverage > candidate_coverage
                or (
                    int(other["degree"]) == int(candidate["degree"])
                    and other_coverage == candidate_coverage
                    and str(other["id"]) < str(candidate["id"])
                )
            )
            if no_worse and strict:
                dominated = True
                break
        if not dominated:
            kept.append(str(candidate["id"]))
    return kept


def _coverage_counts(
    witnesses: Sequence[Mapping[str, Any]], covered: Iterable[int]
) -> dict[str, Any]:
    covered_set = set(covered)
    by_order: dict[str, dict[str, int]] = {}
    for index, witness in enumerate(witnesses):
        key = str(witness["primeOrder"])
        record = by_order.setdefault(key, {"total": 0, "covered": 0, "remaining": 0})
        record["total"] += 1
        if index in covered_set:
            record["covered"] += 1
    for record in by_order.values():
        record["remaining"] = record["total"] - record["covered"]
    return {
        "witnessCount": len(witnesses),
        "coveredCount": len(covered_set),
        "uncoveredCount": len(witnesses) - len(covered_set),
        "coveredWitnessIndexes": sorted(covered_set),
        "uncoveredWitnessIndexes": sorted(set(range(len(witnesses))) - covered_set),
        "byPrimeOrder": dict(sorted(by_order.items(), key=lambda item: int(item[0]))),
    }


def screen_target_degrees(
    modules: Sequence[Mapping[str, Any]], witness_count: int
) -> list[dict[str, Any]]:
    """Apply the diagonal-orbit projection divisor before double-coset work.

    A diagonal orbit projecting to a transitive action of degree ``d`` has
    degree divisible by ``d``.  If both degrees are equal, the projection is a
    bijection, so the added factor cannot remove a witness that fixed a point
    in the degree-``d`` action.  Consequently a new target-degree survivor
    must either be a complete module already or obtain complete union coverage
    from factors of strictly smaller degree.
    """

    rows: list[dict[str, Any]] = []
    universe = set(range(witness_count))
    for target in TARGET_DEGREES:
        eligible = [module for module in modules if target % int(module["degree"]) == 0]
        smaller = [module for module in eligible if int(module["degree"]) < target]
        complete_single = [
            str(module["id"])
            for module in eligible
            if set(module["coverage"]) == universe
        ]
        smaller_union = (
            set().union(*(set(module["coverage"]) for module in smaller))
            if smaller
            else set()
        )
        if complete_single:
            status = "complete-single-module"
            reason = "An exact module already covers every witness."
        elif smaller_union == universe:
            status = "double-coset-search-required"
            reason = (
                "Strictly smaller compatible factors have complete union coverage; "
                "diagonal orbit stabilizers must be enumerated."
            )
        else:
            status = "impossible-by-coverage-and-index"
            reason = (
                "Strictly smaller compatible factors do not cover every witness, "
                "and a target-degree factor cannot gain coverage without increasing "
                "the diagonal-orbit degree."
            )
        rows.append(
            {
                "degree": target,
                "status": status,
                "reason": reason,
                "eligibleModuleCount": len(eligible),
                "strictlySmallerModuleCount": len(smaller),
                "strictlySmallerUnionCoverage": len(smaller_union),
                "completeSingleModuleIds": complete_single,
            }
        )
    return rows


def _fallback_summary(path: Path, return_code: int | None) -> dict[str, Any]:
    if not path.is_file():
        raise CampaignIntegrationError("The global CSP returned without an artifact.")
    artifact = read_json(path)
    if artifact.get("artifactType") != "coxeter-block-amalgam-global-csp":
        raise CampaignIntegrationError("The fallback wrote an unexpected artifact.")
    artifact_hash = _verify_seal(artifact, "artifactHash")
    search = artifact.get("search", {})
    conflicts = artifact.get("learnedConflicts", {})
    return {
        "executed": True,
        "returnCode": return_code,
        "artifact": _portable_path(path),
        "artifactSha256": artifact_hash,
        "status": artifact.get("status"),
        "complete": artifact.get("complete") is True,
        "candidateFound": artifact.get("candidateFound") is True,
        "nodes": search.get("nodesThisRun"),
        "interruptReason": search.get("interruptReason"),
        "learnedConflictCount": conflicts.get("count"),
    }


def run_global_fallback(
    *,
    output: Path,
    checkpoint: Path,
    timeout_seconds: float,
    max_nodes: int,
    max_nodes_per_restart: int,
    restarts: int,
    memory_mb: int,
) -> dict[str, Any]:
    command = [
        sys.executable,
        str(SCRIPT_DIR / "block_amalgam_global_csp.py"),
        "--input",
        str(DEFAULT_SOURCE),
        "--output",
        str(output),
        "--checkpoint",
        str(checkpoint),
        "--timeout-seconds",
        str(timeout_seconds),
        "--max-nodes",
        str(max_nodes),
        "--max-nodes-per-restart",
        str(max_nodes_per_restart),
        "--restarts",
        str(restarts),
        "--memory-mb",
        str(memory_mb),
    ]
    completed = subprocess.run(command, check=False, cwd=REPO_ROOT)
    if completed.returncode not in {0, 2, 3}:
        raise CampaignIntegrationError(
            f"The global CSP failed with exit code {completed.returncode}."
        )
    return _fallback_summary(output, completed.returncode)


def run_symbolic_composite(
    *,
    mod2_report: Path,
    output: Path,
    timeout_seconds: int,
    maximum_pair_types: int,
    maximum_exact_double_cosets: int,
    maximum_larger_intersection_classes: int,
) -> int:
    """Run GAP's bounded double-coset search and preserve a partial artifact."""

    command = [
        sys.executable,
        str(SCRIPT_DIR / "mod2_symbolic_composite_search.py"),
        "--input",
        str(mod2_report),
        "--output",
        str(output),
        "--timeout-seconds",
        str(timeout_seconds),
        "--maximum-pair-types",
        str(maximum_pair_types),
        "--maximum-exact-double-cosets",
        str(maximum_exact_double_cosets),
        "--maximum-larger-intersection-classes",
        str(maximum_larger_intersection_classes),
    ]
    completed = subprocess.run(command, check=False, cwd=REPO_ROOT)
    # Exit 2 means the declared wall-clock bound was reached. The child still
    # writes a sealed artifact whose non-claims record the unfinished scope.
    if completed.returncode not in {0, 2}:
        raise CampaignIntegrationError(
            f"The symbolic-composite search failed with exit code {completed.returncode}."
        )
    if not output.is_file():
        raise CampaignIntegrationError(
            "The symbolic-composite search returned without an artifact."
        )
    return completed.returncode


def build_campaign_report(
    *,
    source_path: Path,
    source: Mapping[str, Any],
    witnesses: Sequence[Mapping[str, Any]],
    witness_sha256: str,
    order5_report: Mapping[str, Any],
    mod2_report: Mapping[str, Any],
    order5_file_sha256: str,
    mod2_file_sha256: str,
    fallback: Mapping[str, Any] | None = None,
    composite_report: Mapping[str, Any] | None = None,
    composite_file_sha256: str | None = None,
) -> dict[str, Any]:
    order5_modules, order5_hashes = validate_order5_report(
        order5_report, witness_sha256, len(witnesses)
    )
    mod2_modules, mod2_hashes = validate_mod2_report(
        mod2_report, witness_sha256, len(witnesses)
    )
    if order5_hashes["matrixSha256"] != mod2_hashes["matrixSha256"]:
        raise CampaignIntegrationError("The subcampaign Coxeter matrices differ.")
    composite = None
    if composite_report is not None:
        if composite_file_sha256 is None:
            raise CampaignIntegrationError(
                "The symbolic-composite report is missing its file hash."
            )
        composite = validate_composite_report(
            composite_report,
            mod2_artifact_sha256=mod2_hashes["artifactSha256"],
            mod2_file_sha256=mod2_file_sha256,
            witness_sha256=witness_sha256,
            matrix_sha256=mod2_hashes["matrixSha256"],
        )
    modules = [*order5_modules, *mod2_modules]
    covered = (
        set().union(*(module["coverage"] for module in modules)) if modules else set()
    )
    coverage = _coverage_counts(witnesses, covered)
    ready = coverage["coveredCount"] == len(witnesses)
    target_screen = screen_target_degrees(modules, len(witnesses))
    requested_targets_exhausted = all(
        row["status"] == "impossible-by-coverage-and-index" for row in target_screen
    )
    module_rows = [
        {
            "id": module["id"],
            "degree": module["degree"],
            "coveredCount": len(module["coverage"]),
            "source": module["source"],
            "materialization": module["materialization"],
        }
        for module in sorted(modules, key=lambda item: (item["degree"], item["id"]))
    ]
    gate_status = (
        "ready-for-diagonal-orbit-search"
        if ready
        else "blocked-incomplete-witness-union"
    )
    if composite is not None and composite["independentlyCertifiedCandidate"]:
        campaign_status = "certified-composite-candidate"
    elif composite is not None and composite["status"] == "exact-exhausted":
        campaign_status = "mod2-composite-exhausted-through-195840"
    elif composite is not None and requested_targets_exhausted:
        campaign_status = "requested-target-range-eliminated-next-frontier-incomplete"
    elif ready and requested_targets_exhausted:
        campaign_status = "requested-target-range-eliminated"
    else:
        campaign_status = gate_status
    report: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "campaignVersion": CAMPAIGN_VERSION,
        "status": campaign_status,
        "source": {
            "name": source.get("name"),
            "path": _portable_path(source_path),
            "sourceFileSha256": sha256_file(source_path),
            "matrixSha256": order5_hashes["matrixSha256"],
            "witnessSha256": witness_sha256,
        },
        "subcampaigns": {
            "order5Primary": {
                "fileSha256": order5_file_sha256,
                "reportSha256": order5_hashes["reportSha256"],
                "moduleCount": len(order5_modules),
            },
            "mod2Symbolic": {
                "fileSha256": mod2_file_sha256,
                "artifactSha256": mod2_hashes["artifactSha256"],
                "exactModuleCount": len(mod2_modules),
            },
            **(
                {
                    "mod2SymbolicComposite": {
                        "fileSha256": composite_file_sha256,
                        **composite,
                    }
                }
                if composite is not None
                else {}
            ),
        },
        "portfolio": {
            "moduleCount": len(modules),
            "paretoModuleIds": pareto_module_ids(modules),
            "modules": module_rows,
            "coverage": coverage,
        },
        "compositionGate": {
            "status": gate_status,
            "ready": ready,
            "requiredCoverage": len(witnesses),
            "observedCoverage": coverage["coveredCount"],
            "targetDegrees": list(TARGET_DEGREES),
            "targetScreen": target_screen,
            "requestedTargetRangeExhausted": requested_targets_exhausted,
            "nextArithmeticFrontier": 195_840 if requested_targets_exhausted else None,
            "policy": (
                "Enumerate every compatible diagonal orbit and double coset only "
                "after exact union coverage reaches every torsion witness."
            ),
        },
        "globalCspFallback": (
            dict(fallback)
            if fallback is not None
            else {
                "executed": False,
                "reason": (
                    "composition gate passed"
                    if ready
                    else "bounded fallback was not requested"
                ),
            }
        ),
        "symbolicComposite": (
            dict(composite)
            if composite is not None
            else {
                "executed": False,
                "reason": "the bounded double-coset search was not requested",
            }
        ),
        "claims": [
            "hash-bound union of exact fixed-point coverage",
            "hard coverage gate before composite enumeration",
        ],
        "nonClaims": [
            "complete partial-module enumeration",
            "torsion-free subgroup",
            "minimal cover degree",
            "virtual fibering",
        ],
    }
    report["reportSha256"] = sha256_json(report)
    return report


def concise_summary(report: Mapping[str, Any]) -> str:
    coverage = report["portfolio"]["coverage"]
    fallback = report["globalCspFallback"]
    composite = report["symbolicComposite"]
    return (
        "partial-module campaign: "
        f"{coverage['coveredCount']}/{coverage['witnessCount']} witnesses covered; "
        f"gate={report['compositionGate']['status']}; "
        f"targets={report['status']}; "
        f"composite={composite.get('status', 'not-run')}; "
        f"fallback={fallback.get('status', 'not-run')}"
    )


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    value.add_argument("--order5-report", type=Path, default=DEFAULT_ORDER5)
    value.add_argument("--mod2-report", type=Path, default=DEFAULT_MOD2)
    value.add_argument("--composite-report", type=Path, default=DEFAULT_COMPOSITE)
    value.add_argument("--witness-source", type=Path, default=DEFAULT_P2)
    value.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    value.add_argument("--run-fallback", action="store_true")
    value.add_argument("--run-composite", action="store_true")
    value.add_argument(
        "--reuse-composite",
        action="store_true",
        help="Reuse and verify the existing symbolic-composite artifact.",
    )
    value.add_argument("--composite-timeout-seconds", type=int, default=1_200)
    value.add_argument("--composite-maximum-pair-types", type=int, default=1_035)
    value.add_argument(
        "--composite-maximum-exact-double-cosets", type=int, default=1_000_000
    )
    value.add_argument(
        "--composite-maximum-larger-intersection-classes",
        type=int,
        default=2_000,
    )
    value.add_argument(
        "--reuse-fallback",
        action="store_true",
        help="Reuse and verify the existing fallback artifact without rerunning it.",
    )
    value.add_argument("--fallback-output", type=Path, default=DEFAULT_FALLBACK)
    value.add_argument(
        "--fallback-checkpoint",
        type=Path,
        default=REPO_ROOT / ".cover-search" / "global-csp-fallback.checkpoint.json",
    )
    value.add_argument("--fallback-timeout-seconds", type=float, default=60.0)
    value.add_argument("--fallback-max-nodes", type=int, default=100_000)
    value.add_argument("--fallback-max-nodes-per-restart", type=int, default=25_000)
    value.add_argument("--fallback-restarts", type=int, default=4)
    value.add_argument("--fallback-memory-mb", type=int, default=2048)
    value.add_argument("--json", action="store_true")
    return value


def run_cli(argv: Sequence[str] | None = None) -> dict[str, Any]:
    args = parser().parse_args(argv)
    if args.run_fallback and args.reuse_fallback:
        raise CampaignIntegrationError(
            "Choose either --run-fallback or --reuse-fallback, not both."
        )
    if args.run_composite and args.reuse_composite:
        raise CampaignIntegrationError(
            "Choose either --run-composite or --reuse-composite, not both."
        )
    source = read_json(args.source)
    witness_source = read_json(args.witness_source)
    witnesses, witness_sha256 = _extract_witnesses(witness_source)
    order5 = read_json(args.order5_report)
    mod2 = read_json(args.mod2_report)
    # Validate the evidence before spending time on the fallback.
    preliminary = build_campaign_report(
        source_path=args.source.resolve(),
        source=source,
        witnesses=witnesses,
        witness_sha256=witness_sha256,
        order5_report=order5,
        mod2_report=mod2,
        order5_file_sha256=sha256_file(args.order5_report),
        mod2_file_sha256=sha256_file(args.mod2_report),
        fallback=None,
    )
    composite: Mapping[str, Any] | None = None
    composite_file_sha256: str | None = None
    if args.run_composite:
        run_symbolic_composite(
            mod2_report=args.mod2_report,
            output=args.composite_report,
            timeout_seconds=args.composite_timeout_seconds,
            maximum_pair_types=args.composite_maximum_pair_types,
            maximum_exact_double_cosets=args.composite_maximum_exact_double_cosets,
            maximum_larger_intersection_classes=(
                args.composite_maximum_larger_intersection_classes
            ),
        )
        composite = read_json(args.composite_report)
        composite_file_sha256 = sha256_file(args.composite_report)
    elif args.reuse_composite:
        composite = read_json(args.composite_report)
        composite_file_sha256 = sha256_file(args.composite_report)
    if composite is not None:
        # Verify the expensive stage before deciding whether the independent
        # degree-5,760 fallback is still needed.
        preliminary = build_campaign_report(
            source_path=args.source.resolve(),
            source=source,
            witnesses=witnesses,
            witness_sha256=witness_sha256,
            order5_report=order5,
            mod2_report=mod2,
            order5_file_sha256=sha256_file(args.order5_report),
            mod2_file_sha256=sha256_file(args.mod2_report),
            composite_report=composite,
            composite_file_sha256=composite_file_sha256,
        )
    fallback: Mapping[str, Any] | None = None
    fallback_needed = preliminary["status"] != "certified-composite-candidate" and (
        not preliminary["compositionGate"]["ready"]
        or preliminary["compositionGate"]["requestedTargetRangeExhausted"]
    )
    if args.reuse_fallback and fallback_needed:
        fallback = _fallback_summary(args.fallback_output, None)
    elif args.run_fallback and fallback_needed:
        fallback = run_global_fallback(
            output=args.fallback_output,
            checkpoint=args.fallback_checkpoint,
            timeout_seconds=args.fallback_timeout_seconds,
            max_nodes=args.fallback_max_nodes,
            max_nodes_per_restart=args.fallback_max_nodes_per_restart,
            restarts=args.fallback_restarts,
            memory_mb=args.fallback_memory_mb,
        )
    report = build_campaign_report(
        source_path=args.source.resolve(),
        source=source,
        witnesses=witnesses,
        witness_sha256=witness_sha256,
        order5_report=order5,
        mod2_report=mod2,
        order5_file_sha256=sha256_file(args.order5_report),
        mod2_file_sha256=sha256_file(args.mod2_report),
        fallback=fallback,
        composite_report=composite,
        composite_file_sha256=composite_file_sha256,
    )
    atomic_write_json(args.output, report)
    return report


def main(argv: Sequence[str] | None = None) -> int:
    try:
        report = run_cli(argv)
    except CampaignIntegrationError as exc:
        print(f"partial-module campaign error: {exc}", file=sys.stderr)
        return 2
    show_json = parser().parse_args(argv).json
    print(
        json.dumps(report, indent=2, sort_keys=True)
        if show_json
        else concise_summary(report)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
