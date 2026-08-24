#!/usr/bin/env python3
"""Mine symbolic partial modules from a sealed mod-2 degree ledger.

The bounded mod-2 ledger may retain only aggregate class counts.  Such counts
prove that subgroup classes were examined, but they do not determine which
torsion witnesses act without fixed points.  This module therefore emits one
auditable placeholder per declared class and reserves ``exact-module`` for a
class carrying a complete fixed-point-count or table-of-marks vector.

No permutation rows are constructed.  Exact symbolic modules can guide a
later table-of-marks or double-coset search; they cannot by themselves replace
the independent verification of a materialized survivor.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "mod2-symbolic-partial-module-catalogue"
BUILDER_VERSION = "1.0.0"
DEFAULT_LEDGER = (
    Path(__file__).resolve().parent
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_mod2_through_576000.json"
)
DEFAULT_P2_ARTIFACT = (
    Path(__file__).resolve().parents[1] / ".cover-search" / "live-portfolio" / "p2.json"
)
GAP_MARKS_SCRIPT = Path(__file__).resolve().with_name("gap_mod2_partial_module_marks.g")
RECOGNIZER_SCRIPT = Path(__file__).resolve().with_name("gap_finite_image_recognition.g")
DEFAULT_WSL_ACTION = (
    "~/.cache/coxeter-viewer/portfolio-cache/recognition/"
    "ec2220d4164c79b92c2b6ab390b32e73171e42fcbf00fecaa9a52e01cda5ccf7/"
    "action.json"
)

EXACT_MODULE = "exact-module"
METADATA_ONLY = "metadata-only-candidate"
UNUSABLE = "unusable-entry"
ENTRY_KINDS = frozenset({EXACT_MODULE, METADATA_ONLY, UNUSABLE})


class SymbolicModuleError(ValueError):
    """The ledger is stale, malformed, or makes an unsupported evidence claim."""


def canonical_json(value: Any) -> str:
    """Serialize certificate data deterministically and reject nonfinite numbers."""

    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise SymbolicModuleError(f"Value is not canonical JSON: {exc}") from exc


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_copy(value: Any) -> Any:
    return json.loads(canonical_json(value))


def _require_hash(value: Any, field: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise SymbolicModuleError(f"{field} must be a lowercase SHA-256 hash.")
    return value


def _require_nonnegative_integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise SymbolicModuleError(f"{field} must be a nonnegative integer.")
    return value


def _require_positive_integer(value: Any, field: str) -> int:
    result = _require_nonnegative_integer(value, field)
    if result == 0:
        raise SymbolicModuleError(f"{field} must be positive.")
    return result


def verify_ledger_seal(ledger: Mapping[str, Any]) -> str:
    """Verify the report seal used by ``finite_image_degree_report.py``."""

    if ledger.get("artifactType") != "finite-image-bounded-degree-classification":
        raise SymbolicModuleError("Input is not a bounded finite-image ledger.")
    stored = _require_hash(ledger.get("reportSha256"), "reportSha256")
    core = _canonical_copy(ledger)
    core.pop("reportSha256", None)
    computed = sha256_json(core)
    if computed != stored:
        raise SymbolicModuleError("The mod-2 ledger seal is stale or corrupt.")
    return stored


def verify_artifact_seal(
    artifact: Mapping[str, Any], field: str = "artifactHash"
) -> str:
    """Verify the canonical seal used by the full finite-image artifact."""

    stored = _require_hash(artifact.get(field), field)
    core = _canonical_copy(artifact)
    core.pop(field, None)
    if sha256_json(core) != stored:
        raise SymbolicModuleError(f"The {field} seal is stale or corrupt.")
    return stored


def build_coverage(
    fixed_point_counts: Sequence[int], witness_sha256: str
) -> dict[str, Any]:
    """Encode witnesses having zero fixed points as an lsb0 bitset and list."""

    witness_hash = _require_hash(witness_sha256, "witnessCatalogueSha256")
    if not isinstance(fixed_point_counts, (list, tuple)) or not fixed_point_counts:
        raise SymbolicModuleError("A fixed-point vector must be a nonempty array.")
    counts = [
        _require_nonnegative_integer(value, f"fixedPointCounts[{index}]")
        for index, value in enumerate(fixed_point_counts)
    ]
    covered = [index for index, value in enumerate(counts) if value == 0]
    bits = bytearray((len(counts) + 7) // 8)
    for index in covered:
        bits[index // 8] |= 1 << (index % 8)
    core = {
        "encoding": "lsb0-hex",
        "witnessSha256": witness_hash,
        "witnessCount": len(counts),
        "bitsetHex": bytes(bits).hex(),
        "coveredCount": len(covered),
        "coveredWitnessIndexes": covered,
    }
    return {**core, "sha256": sha256_json(core)}


def missing_coverage(reason: str) -> dict[str, Any]:
    """Represent absent evidence without turning absence into an empty bitset."""

    return {
        "status": "missing",
        "reason": reason,
        "encoding": None,
        "witnessCount": None,
        "bitsetHex": None,
        "coveredCount": None,
        "coveredWitnessIndexes": None,
        "sha256": None,
    }


def _fixed_point_vector(
    class_record: Mapping[str, Any],
) -> tuple[str, list[int], dict[str, Any]] | None:
    """Read only explicit count vectors whose zero entries have exact meaning.

    Supported records use one of three unambiguous fields.  Boolean pass/fail
    summaries and aggregate rejected counts are deliberately not accepted.
    """

    candidates: list[tuple[str, Any, Mapping[str, Any] | None]] = [
        ("fixedPointCounts", class_record.get("fixedPointCounts"), None),
        (
            "witnessFixedPointCounts",
            class_record.get("witnessFixedPointCounts"),
            None,
        ),
    ]
    marks = class_record.get("marksEvidence")
    if isinstance(marks, Mapping):
        candidates.extend(
            [
                (
                    "marksEvidence.fixedPointCounts",
                    marks.get("fixedPointCounts"),
                    marks,
                ),
                (
                    "marksEvidence.fixedPointMarks",
                    marks.get("fixedPointMarks"),
                    marks,
                ),
            ]
        )
    present = [
        (path, value, metadata)
        for path, value, metadata in candidates
        if value is not None
    ]
    if not present:
        return None
    if len(present) != 1:
        raise SymbolicModuleError(
            "A subgroup class supplies multiple fixed-point evidence vectors."
        )
    path, raw, metadata = present[0]
    if not isinstance(raw, list) or not raw:
        raise SymbolicModuleError(f"{path} must be a nonempty integer array.")
    vector = [
        _require_nonnegative_integer(value, f"{path}[{index}]")
        for index, value in enumerate(raw)
    ]
    details = {
        "sourceField": path,
        "fixedPointCounts": vector,
        "fixedPointCountsSha256": sha256_json(vector),
    }
    if metadata is not None:
        details["sourceMetadata"] = _canonical_copy(metadata)
    return path, vector, details


def _class_records(row: Mapping[str, Any]) -> list[Any] | None:
    records = row.get("subgroupClasses")
    if records is None:
        return None
    if not isinstance(records, list):
        raise SymbolicModuleError("degreeLedger.subgroupClasses must be an array.")
    return records


def _class_provenance(
    row: Mapping[str, Any], class_record: Mapping[str, Any] | None, ordinal: int
) -> dict[str, Any]:
    provenance: dict[str, Any] = {
        "degree": row["degree"],
        "classOrdinalWithinDegree": ordinal,
        "degreeOutcome": row["outcome"],
        "declaredExactSubgroupClassCount": row["exactSubgroupClassCount"],
    }
    if class_record is None:
        provenance.update(
            {
                "classId": None,
                "stabilizer": None,
                "status": "aggregate-ledger-only",
            }
        )
        return provenance
    class_id = class_record.get("classId")
    provenance["classId"] = str(class_id) if class_id is not None else None
    stabilizer: dict[str, Any] = {}
    for key in (
        "stabilizerFingerprint",
        "subgroupFingerprint",
        "stabilizer",
        "subgroupClass",
    ):
        if key in class_record:
            stabilizer[key] = _canonical_copy(class_record[key])
    provenance["stabilizer"] = stabilizer or None
    provenance["status"] = (
        "per-class-provenance"
        if provenance["classId"] or stabilizer
        else "ordinal-only"
    )
    return provenance


def _build_entry(
    *,
    row: Mapping[str, Any],
    class_record: Any,
    ordinal: int,
    source_hashes: Mapping[str, Any],
) -> dict[str, Any]:
    record = class_record if isinstance(class_record, Mapping) else None
    provenance = _class_provenance(row, record, ordinal)
    kind = METADATA_ONLY
    marks_evidence: dict[str, Any] = {
        "status": "missing",
        "reason": "The sealed ledger contains no witness-level marks for this class.",
    }
    coverage = missing_coverage(
        "Witness coverage cannot be recovered from an aggregate rejected-class count."
    )
    diagnostic: str | None = None

    if class_record is not None and record is None:
        kind = UNUSABLE
        diagnostic = "The per-class record is not an object."
        marks_evidence = {"status": "invalid", "reason": diagnostic}
        coverage = missing_coverage(diagnostic)
    elif record is not None:
        try:
            evidence = _fixed_point_vector(record)
            if evidence is None:
                marks_evidence = {
                    "status": "missing",
                    "reason": "The per-class record has no complete fixed-point vector.",
                }
                coverage = missing_coverage(marks_evidence["reason"])
            else:
                _path, vector, details = evidence
                marks_evidence = {"status": "exact", **details}
                coverage = {
                    "status": "exact",
                    **build_coverage(vector, source_hashes["witnessCatalogueSha256"]),
                }
                kind = EXACT_MODULE
        except SymbolicModuleError as exc:
            kind = UNUSABLE
            diagnostic = str(exc)
            marks_evidence = {"status": "invalid", "reason": diagnostic}
            coverage = missing_coverage(diagnostic)

    core: dict[str, Any] = {
        "kind": kind,
        "degree": row["degree"],
        "classOrdinalWithinDegree": ordinal,
        "provenance": provenance,
        "coverage": coverage,
        "marksEvidence": marks_evidence,
        "sourceHashes": dict(source_hashes),
        "symbolicOnly": True,
        "permutationRowsMaterialized": False,
        "compositeSolverEligible": kind == EXACT_MODULE,
        "diagnostic": diagnostic,
    }
    entry_hash = sha256_json(core)
    return {
        **core,
        "entrySha256": entry_hash,
        "id": f"mod2-symbolic-{entry_hash[:20]}",
    }


def _coverage_set(entry: Mapping[str, Any]) -> frozenset[int]:
    if entry.get("kind") != EXACT_MODULE:
        raise SymbolicModuleError("Pareto pruning accepts exact modules only.")
    coverage = entry.get("coverage")
    if not isinstance(coverage, Mapping) or coverage.get("status") != "exact":
        raise SymbolicModuleError("An exact module has no exact coverage record.")
    indexes = coverage.get("coveredWitnessIndexes")
    if not isinstance(indexes, list):
        raise SymbolicModuleError("An exact coverage list is missing.")
    return frozenset(int(value) for value in indexes)


def pareto_prune(entries: Iterable[Mapping[str, Any]]) -> tuple[str, ...]:
    """Keep modules not dominated by lower degree and superset coverage.

    Equivalent modules are tied by their deterministic id.  All source entries
    remain in the report; this function selects the useful frontier only.
    """

    exact = sorted(
        (entry for entry in entries if entry.get("kind") == EXACT_MODULE),
        key=lambda entry: (int(entry["degree"]), str(entry["id"])),
    )
    coverage = {str(entry["id"]): _coverage_set(entry) for entry in exact}
    kept: list[str] = []
    for candidate in exact:
        candidate_id = str(candidate["id"])
        candidate_degree = int(candidate["degree"])
        candidate_coverage = coverage[candidate_id]
        dominated = False
        for other in exact:
            other_id = str(other["id"])
            if other_id == candidate_id:
                continue
            other_degree = int(other["degree"])
            other_coverage = coverage[other_id]
            no_worse = other_degree <= candidate_degree and other_coverage.issuperset(
                candidate_coverage
            )
            strictly_better = (
                other_degree < candidate_degree
                or other_coverage > candidate_coverage
                or (
                    other_degree == candidate_degree
                    and other_coverage == candidate_coverage
                    and other_id < candidate_id
                )
            )
            if no_worse and strictly_better:
                dominated = True
                break
        if not dominated:
            kept.append(candidate_id)
    return tuple(kept)


def _mod2_classification(p2_artifact: Mapping[str, Any]) -> Mapping[str, Any]:
    attempts = p2_artifact.get("residueAttempts")
    if not isinstance(attempts, list):
        raise SymbolicModuleError("The p2 artifact has no residue attempts.")
    for attempt in attempts:
        if not isinstance(attempt, Mapping) or attempt.get("rationalPrime") != 2:
            continue
        recognition = attempt.get("structuralRecognition")
        if not isinstance(recognition, Mapping):
            continue
        certificate = recognition.get("mod2Certificate")
        if not isinstance(certificate, Mapping):
            continue
        classification = certificate.get("finiteIndexClassification")
        if isinstance(classification, Mapping):
            return classification
    raise SymbolicModuleError("The p2 artifact has no exact mod-2 classification.")


def _candidate_provenance(candidate: Mapping[str, Any]) -> dict[str, Any]:
    fields = (
        "b0Family",
        "b0Index",
        "b0SourceRecords",
        "b0Structure",
        "commonQuotientOrder",
        "s3ClassPosition",
        "s3Order",
        "s3ProjectionIndex",
        "sourceMultiplicity",
        "sourceRows",
        "subgroupIndex",
        "subgroupOrder",
        "tomPosition",
    )
    missing = [field for field in fields if field not in candidate]
    if missing:
        raise SymbolicModuleError(
            "An exact p2 candidate lacks provenance fields: " + ", ".join(missing)
        )
    return {field: _canonical_copy(candidate[field]) for field in fields}


def _recognizer_library_prefix() -> str:
    """Return definitions from the recognizer without its command-line entrypoint."""

    source = RECOGNIZER_SCRIPT.read_text(encoding="utf8")
    marker = "\nif not IsBound(COXETER_INPUT) then\n"
    if marker not in source:
        raise SymbolicModuleError("The recognizer entrypoint marker changed.")
    return source.split(marker, 1)[0] + "\n"


def build_marks_request(
    ledger: Mapping[str, Any],
    p2_artifact: Mapping[str, Any],
    *,
    ledger_file_sha256: str,
    p2_file_sha256: str,
) -> dict[str, Any]:
    """Bind the 45 rich p2 class records to one deterministic GAP rerun."""

    ledger_hash = verify_ledger_seal(ledger)
    p2_hash = verify_artifact_seal(p2_artifact)
    source = ledger.get("source")
    if not isinstance(source, Mapping):
        raise SymbolicModuleError("The sealed ledger has no source record.")
    for p2_field, ledger_field in (
        ("inputHash", "inputSha256"),
        ("matrixDigest", "coxeterMatrixSha256"),
    ):
        if p2_artifact.get(p2_field) != source.get(ledger_field):
            raise SymbolicModuleError(
                f"The p2 artifact and sealed ledger disagree on {p2_field}."
            )
    witnesses = p2_artifact.get("torsionWitnesses")
    catalogue = p2_artifact.get("sphericalCatalogue")
    if not isinstance(witnesses, list) or not isinstance(catalogue, Mapping):
        raise SymbolicModuleError("The p2 artifact omits its witness catalogue.")
    witness_hash = _require_hash(
        catalogue.get("witnessDigest"), "sphericalCatalogue.witnessDigest"
    )
    if sha256_json(witnesses) != witness_hash:
        raise SymbolicModuleError("The p2 witness catalogue digest is stale.")
    if witness_hash != source.get("witnessCatalogueSha256"):
        raise SymbolicModuleError(
            "The p2 artifact and sealed ledger use different witness catalogues."
        )
    reduced_witnesses = [
        {
            "id": str(witness.get("id")),
            "word": _canonical_copy(witness.get("word")),
            "primeOrder": witness.get("primeOrder"),
        }
        for witness in witnesses
        if isinstance(witness, Mapping)
    ]
    if len(reduced_witnesses) != len(witnesses):
        raise SymbolicModuleError("A p2 witness record is not an object.")

    classification = _mod2_classification(p2_artifact)
    rich_rows = classification.get("report")
    sealed_rows = ledger.get("degreeLedger")
    if not isinstance(rich_rows, list) or not isinstance(sealed_rows, list):
        raise SymbolicModuleError("A degree classification has no report rows.")
    sealed_by_degree = {
        int(row["degree"]): row
        for row in sealed_rows
        if isinstance(row, Mapping) and int(row.get("exactSubgroupClassCount", 0)) > 0
    }
    classes: list[dict[str, Any]] = []
    for rich_row in rich_rows:
        if not isinstance(rich_row, Mapping):
            raise SymbolicModuleError("A rich p2 degree row is not an object.")
        candidates = rich_row.get("exactCandidates")
        count = int(rich_row.get("exactCandidateCount", 0))
        if count == 0:
            continue
        degree = _require_positive_integer(rich_row.get("target"), "p2 target")
        sealed_row = sealed_by_degree.get(degree)
        if (
            sealed_row is None
            or sealed_row.get("outcome") != rich_row.get("classification")
            or sealed_row.get("exactSubgroupClassCount") != count
            or sealed_row.get("materializedAndRejectedCount")
            != rich_row.get("materializedAndRejectedCount")
        ):
            raise SymbolicModuleError(
                f"The rich p2 row at degree {degree} does not replay the sealed ledger."
            )
        if not isinstance(candidates, list) or len(candidates) != count:
            raise SymbolicModuleError(
                f"The rich p2 row at degree {degree} omits exact candidates."
            )
        for ordinal, candidate in enumerate(candidates, start=1):
            if not isinstance(candidate, Mapping):
                raise SymbolicModuleError("An exact p2 candidate is not an object.")
            provenance = _candidate_provenance(candidate)
            class_core = {
                "degree": degree,
                "classOrdinalWithinDegree": ordinal,
                "provenance": provenance,
            }
            class_hash = sha256_json(class_core)
            classes.append(
                {
                    **class_core,
                    "classId": f"mod2-class-{class_hash[:20]}",
                    "classProvenanceSha256": class_hash,
                }
            )
    if len(classes) != ledger.get("summary", {}).get("exactSubgroupClassCount"):
        raise SymbolicModuleError(
            "The rich p2 artifact does not account for all sealed subgroup classes."
        )

    p2_attempt = next(
        attempt
        for attempt in p2_artifact["residueAttempts"]
        if isinstance(attempt, Mapping) and attempt.get("rationalPrime") == 2
    )
    bridge = p2_attempt.get("recognitionBridge")
    if not isinstance(bridge, Mapping):
        raise SymbolicModuleError("The p2 artifact has no recognition transfer.")
    action_hash = _require_hash(bridge.get("actionHash"), "recognition actionHash")
    prefix = _recognizer_library_prefix()
    source_hashes = {
        "ledgerReportSha256": ledger_hash,
        "ledgerFileSha256": _require_hash(ledger_file_sha256, "ledgerFileSha256"),
        "p2ArtifactSha256": p2_hash,
        "p2FileSha256": _require_hash(p2_file_sha256, "p2FileSha256"),
        "recognitionActionSha256": action_hash,
        "sealedLedgerRecognitionActionSha256": _require_hash(
            source.get("recognitionActionSha256"),
            "ledger recognitionActionSha256",
        ),
        "gapMarksScriptSha256": sha256_file(GAP_MARKS_SCRIPT),
        "recognizerScriptSha256": sha256_file(RECOGNIZER_SCRIPT),
        "recognizerLibraryPrefixSha256": hashlib.sha256(
            prefix.encode("utf8")
        ).hexdigest(),
    }
    request: dict[str, Any] = {
        "schemaVersion": 1,
        "artifactType": "mod2-partial-module-marks-request",
        "builderVersion": BUILDER_VERSION,
        "sourceHashes": source_hashes,
        "witnessCatalogueSha256": witness_hash,
        "transferWitnessSha256": sha256_json(reduced_witnesses),
        "witnessCount": len(witnesses),
        "classes": classes,
        "scope": {
            "degreeCount": len(sealed_by_degree),
            "classCount": len(classes),
            "maximumDegree": max(item["degree"] for item in classes),
            "largeCosetRowsMaterialized": False,
        },
        "claims": [
            "request for exact fixed-point vectors of the 45 p2 subgroup classes"
        ],
        "nonClaims": [
            "identity of transfer envelopes whose hashes differ",
            "a torsion-free subgroup",
            "completeness beyond the sealed finite-image ledger",
        ],
    }
    request["requestSha256"] = sha256_json(request)
    return request


def verify_marks_request(request: Mapping[str, Any]) -> str:
    if request.get("artifactType") != "mod2-partial-module-marks-request":
        raise SymbolicModuleError("The marks request has the wrong artifact type.")
    stored = _require_hash(request.get("requestSha256"), "requestSha256")
    core = _canonical_copy(request)
    core.pop("requestSha256", None)
    if sha256_json(core) != stored:
        raise SymbolicModuleError("The marks request seal is stale or corrupt.")
    return stored


def validate_action_transfer(
    action: Mapping[str, Any], request: Mapping[str, Any]
) -> dict[str, Any]:
    """Validate the cached 122-point transfer before GAP sees its rows."""

    request_hash = verify_marks_request(request)
    del request_hash
    stored = _require_hash(action.get("actionSha256"), "actionSha256")
    core = _canonical_copy(action)
    core.pop("actionSha256", None)
    if sha256_json(core) != stored:
        raise SymbolicModuleError("The cached action transfer seal is stale.")
    if stored != request["sourceHashes"]["recognitionActionSha256"]:
        raise SymbolicModuleError("The cached action belongs to another request.")
    if action.get("degree") != 122 or action.get("expectedOrder") != 2_368_880_640:
        raise SymbolicModuleError("The cached action is not the certified mod-2 image.")
    rows = action.get("generatorRows")
    if not isinstance(rows, list) or len(rows) != 10:
        raise SymbolicModuleError("The cached action lacks ten generator rows.")
    expected_points = list(range(1, 123))
    for index, row in enumerate(rows):
        if not isinstance(row, list) or sorted(row) != expected_points:
            raise SymbolicModuleError(
                f"generatorRows[{index}] is not a permutation of 1..122."
            )
    witnesses = action.get("torsionWitnesses")
    if (
        not isinstance(witnesses, list)
        or len(witnesses) != request["witnessCount"]
        or sha256_json(witnesses) != request["transferWitnessSha256"]
    ):
        raise SymbolicModuleError("The cached action has another witness ordering.")
    return _canonical_copy(action)


def _gap_literal(value: Any) -> str:
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "fail"
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=True)
    if isinstance(value, list):
        return "[" + ",".join(_gap_literal(item) for item in value) + "]"
    if isinstance(value, Mapping):
        fields: list[str] = []
        for key in sorted(value):
            if not isinstance(key, str) or not key.replace("_", "a").isalnum():
                raise SymbolicModuleError(f"Unsupported GAP component {key!r}.")
            fields.append(f"{key}:={_gap_literal(value[key])}")
        return "rec(" + ",".join(fields) + ")"
    raise SymbolicModuleError(f"Cannot encode {type(value).__name__} for GAP.")


def _wsl_path(path: Path) -> str:
    # PowerShell consumes backslashes in a native-command argument before
    # wslpath sees them.  Forward-slash Windows paths round-trip unchanged.
    windows_path = path.resolve().as_posix()
    process = subprocess.run(
        ["wsl", "wslpath", "-a", windows_path],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if process.returncode != 0:
        raise SymbolicModuleError(
            "Could not translate a Windows path for WSL: "
            + (process.stderr or process.stdout).strip()
        )
    return process.stdout.strip()


def read_wsl_json(path: str) -> dict[str, Any]:
    command = (
        [
            "wsl",
            "sh",
            "-lc",
            'cat -- "$HOME/$1"',
            "coxeter-read-json",
            path[2:],
        ]
        if path.startswith("~/")
        else ["wsl", "cat", "--", path]
    )
    process = subprocess.run(
        command,
        check=False,
        capture_output=True,
        timeout=60,
    )
    if process.returncode != 0:
        raise SymbolicModuleError(
            f"Could not read WSL action transfer {path}: "
            + process.stderr.decode("utf8", errors="replace").strip()
        )
    value = json.loads(process.stdout.decode("utf8"))
    if not isinstance(value, dict):
        raise SymbolicModuleError("The WSL action transfer is not an object.")
    return value


def run_gap_marks(
    request: Mapping[str, Any],
    action: Mapping[str, Any],
    *,
    wsl_gap: str,
    timeout_seconds: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run GAP with compact stabilizers and a hard process timeout."""

    checked_action = validate_action_transfer(action, request)
    prefix = _recognizer_library_prefix()
    if (
        hashlib.sha256(prefix.encode("utf8")).hexdigest()
        != request["sourceHashes"]["recognizerLibraryPrefixSha256"]
    ):
        raise SymbolicModuleError("The recognizer library prefix changed.")
    with tempfile.TemporaryDirectory(prefix="coxeter-mod2-marks-") as directory:
        root = Path(directory)
        library_path = root / "recognizer-library.g"
        driver_path = root / "driver.g"
        response_path = root / "response.json"
        library_path.write_text(prefix, encoding="utf8")
        driver_path.write_text(
            f"COXETER_INPUT := {_gap_literal(checked_action)};;\n"
            f"COXETER_REQUEST := {_gap_literal(request)};;\n"
            f'COXETER_OUTPUT := "{_wsl_path(response_path)}";;\n'
            f'Read("{_wsl_path(library_path)}");;\n'
            f'Read("{_wsl_path(GAP_MARKS_SCRIPT)}");;\n',
            encoding="utf8",
        )
        command = [
            "wsl",
            wsl_gap,
            "-r",
            "-q",
            "--quitonbreak",
            "--nointeract",
            _wsl_path(driver_path),
        ]
        try:
            process = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=max(1, timeout_seconds),
            )
        except subprocess.TimeoutExpired as exc:
            raise SymbolicModuleError(
                f"The bounded GAP marks run exceeded {timeout_seconds} seconds."
            ) from exc
        if process.returncode != 0 or not response_path.is_file():
            detail = (process.stderr or process.stdout or "GAP wrote no response")[
                -4000:
            ]
            raise SymbolicModuleError(
                f"The GAP marks run failed with code {process.returncode}: {detail}"
            )
        response = json.loads(response_path.read_text(encoding="utf8"))
        if not isinstance(response, dict):
            raise SymbolicModuleError("The GAP marks response is not an object.")
        metadata = {
            "command": command,
            "returnCode": process.returncode,
            "stdoutTail": (process.stdout or "")[-2000:],
            "stderrTail": (process.stderr or "")[-2000:],
        }
    return response, metadata


def validate_marks_response(
    request: Mapping[str, Any], response: Mapping[str, Any]
) -> dict[str, Any]:
    """Validate every returned class and reject partial or reordered vectors."""

    request_hash = verify_marks_request(request)
    if (
        response.get("artifactType") != "mod2-partial-module-marks-response"
        or response.get("status") != "passed"
        or response.get("requestSha256") != request_hash
        or response.get("witnessCatalogueSha256")
        != request.get("witnessCatalogueSha256")
        or response.get("witnessCount") != request.get("witnessCount")
    ):
        raise SymbolicModuleError("The GAP marks response is stale or incomplete.")
    records = response.get("classRecords")
    expected = request.get("classes")
    if (
        not isinstance(records, list)
        or not isinstance(expected, list)
        or len(records) != len(expected)
        or response.get("classCount") != len(expected)
    ):
        raise SymbolicModuleError("The GAP marks response has the wrong class count.")
    normalized: list[dict[str, Any]] = []
    for position, (record, expected_class) in enumerate(
        zip(records, expected, strict=True)
    ):
        if not isinstance(record, Mapping) or not isinstance(expected_class, Mapping):
            raise SymbolicModuleError("A GAP marks class record is malformed.")
        if (
            record.get("classId") != expected_class.get("classId")
            or record.get("degree") != expected_class.get("degree")
            or record.get("classOrdinalWithinDegree")
            != expected_class.get("classOrdinalWithinDegree")
        ):
            raise SymbolicModuleError(
                f"GAP marks class {position} does not match the request ordering."
            )
        fingerprint = _require_hash(
            record.get("stabilizerFingerprint"),
            f"classRecords[{position}].stabilizerFingerprint",
        )
        subgroup_rows = record.get("compactSubgroupGeneratorRows")
        if not isinstance(subgroup_rows, list) or not subgroup_rows:
            raise SymbolicModuleError(
                f"GAP marks class {position} has no compact stabilizer generators."
            )
        expected_points = list(range(1, 123))
        checked_rows: list[list[int]] = []
        for row_index, row in enumerate(subgroup_rows):
            if not isinstance(row, list) or sorted(row) != expected_points:
                raise SymbolicModuleError(
                    "compactSubgroupGeneratorRows"
                    f"[{row_index}] is not a permutation of 1..122."
                )
            checked_rows.append(list(row))
        counts = record.get("fixedPointCounts")
        if not isinstance(counts, list) or len(counts) != request["witnessCount"]:
            raise SymbolicModuleError(
                f"GAP marks class {position} has an incomplete fixed-point vector."
            )
        checked_counts = [
            _require_nonnegative_integer(
                value, f"classRecords[{position}].fixedPointCounts[{index}]"
            )
            for index, value in enumerate(counts)
        ]
        if any(value > int(record["degree"]) for value in checked_counts):
            raise SymbolicModuleError("A fixed-point count exceeds its action degree.")
        evidence = record.get("marksEvidence")
        stabilizer_provenance = record.get("stabilizerProvenance")
        if (
            not isinstance(evidence, Mapping)
            or evidence.get("exact") is not True
            or evidence.get("permutationRowsMaterialized") is not False
            or evidence.get("witnessCount") != request["witnessCount"]
        ):
            raise SymbolicModuleError(
                "A class lacks exact nonmaterialized marks evidence."
            )
        if not isinstance(stabilizer_provenance, Mapping):
            raise SymbolicModuleError("A class lacks compact stabilizer provenance.")
        normalized.append(
            {
                "classId": record["classId"],
                "degree": record["degree"],
                "classOrdinalWithinDegree": record["classOrdinalWithinDegree"],
                "stabilizerFingerprint": fingerprint,
                "subgroupClass": {
                    **_canonical_copy(stabilizer_provenance),
                    "compactSubgroupGeneratorRows": checked_rows,
                },
                "marksEvidence": {
                    **_canonical_copy(evidence),
                    "fixedPointCounts": checked_counts,
                },
            }
        )
    response_core = _canonical_copy(response)
    response_hash = sha256_json(response_core)
    return {
        "schemaVersion": 1,
        "artifactType": "validated-mod2-partial-module-marks-response",
        "requestSha256": request_hash,
        "gapResponseSha256": response_hash,
        "classRecords": normalized,
        "classCount": len(normalized),
        "sourceHashes": _canonical_copy(request["sourceHashes"]),
    }


def exact_catalogue_from_response(
    ledger: Mapping[str, Any],
    request: Mapping[str, Any],
    validated_response: Mapping[str, Any],
    *,
    ledger_file_sha256: str,
) -> dict[str, Any]:
    by_degree: dict[int, list[dict[str, Any]]] = {}
    for record in validated_response["classRecords"]:
        by_degree.setdefault(int(record["degree"]), []).append(record)
    for records in by_degree.values():
        records.sort(key=lambda item: int(item["classOrdinalWithinDegree"]))
    return build_symbolic_catalogue(
        ledger,
        ledger_file_sha256=ledger_file_sha256,
        external_class_records=by_degree,
        additional_source_hashes={
            "marksRequestSha256": request["requestSha256"],
            "gapResponseSha256": validated_response["gapResponseSha256"],
            "p2ArtifactSha256": request["sourceHashes"]["p2ArtifactSha256"],
            "p2FileSha256": request["sourceHashes"]["p2FileSha256"],
            "gapMarksScriptSha256": request["sourceHashes"]["gapMarksScriptSha256"],
        },
    )


def build_symbolic_catalogue(
    ledger: Mapping[str, Any],
    *,
    ledger_file_sha256: str | None = None,
    external_class_records: Mapping[int, Sequence[Any]] | None = None,
    additional_source_hashes: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Expand every declared rejected class and mine exact evidence when present."""

    report_hash = verify_ledger_seal(ledger)
    source = ledger.get("source")
    if not isinstance(source, Mapping):
        raise SymbolicModuleError("The ledger has no source hash record.")
    source_hashes: dict[str, Any] = {
        "ledgerReportSha256": report_hash,
        "ledgerDocumentSha256": sha256_json(ledger),
        "ledgerFileSha256": (
            _require_hash(ledger_file_sha256, "ledgerFileSha256")
            if ledger_file_sha256 is not None
            else None
        ),
        "inputSha256": _require_hash(source.get("inputSha256"), "source.inputSha256"),
        "coxeterMatrixSha256": _require_hash(
            source.get("coxeterMatrixSha256"), "source.coxeterMatrixSha256"
        ),
        "witnessCatalogueSha256": _require_hash(
            source.get("witnessCatalogueSha256"),
            "source.witnessCatalogueSha256",
        ),
        "recognitionActionSha256": _require_hash(
            source.get("recognitionActionSha256"),
            "source.recognitionActionSha256",
        ),
    }
    if additional_source_hashes is not None:
        for key, value in sorted(additional_source_hashes.items()):
            if key in source_hashes:
                raise SymbolicModuleError(f"Duplicate source hash field: {key}.")
            source_hashes[str(key)] = _require_hash(value, str(key))
    rows = ledger.get("degreeLedger")
    if not isinstance(rows, list) or not rows:
        raise SymbolicModuleError("The ledger has no degree rows.")

    entries: list[dict[str, Any]] = []
    declared_total = 0
    for row_index, raw_row in enumerate(rows):
        if not isinstance(raw_row, Mapping):
            raise SymbolicModuleError(f"degreeLedger[{row_index}] is not an object.")
        outcome = raw_row.get("outcome")
        declared = _require_nonnegative_integer(
            raw_row.get("exactSubgroupClassCount", 0),
            f"degreeLedger[{row_index}].exactSubgroupClassCount",
        )
        rejected = _require_nonnegative_integer(
            raw_row.get("materializedAndRejectedCount", 0),
            f"degreeLedger[{row_index}].materializedAndRejectedCount",
        )
        if outcome != "materialized-and-rejected":
            if declared or rejected:
                raise SymbolicModuleError(
                    f"Degree {raw_row.get('degree')} declares classes under outcome {outcome!r}."
                )
            continue
        if declared != rejected:
            raise SymbolicModuleError(
                f"Degree {raw_row.get('degree')} has inconsistent declared/rejected counts."
            )
        degree = _require_positive_integer(
            raw_row.get("degree"), f"degreeLedger[{row_index}].degree"
        )
        row = {
            "degree": degree,
            "outcome": outcome,
            "exactSubgroupClassCount": declared,
        }
        records = (
            list(external_class_records[degree])
            if external_class_records is not None and degree in external_class_records
            else _class_records(raw_row)
        )
        if records is not None and len(records) > declared:
            raise SymbolicModuleError(
                f"Degree {degree} stores more class records than it declares."
            )
        declared_total += declared
        for offset in range(declared):
            class_record = (
                records[offset]
                if records is not None and offset < len(records)
                else None
            )
            entries.append(
                _build_entry(
                    row=row,
                    class_record=class_record,
                    ordinal=offset + 1,
                    source_hashes=source_hashes,
                )
            )

    expected_total = ledger.get("summary", {}).get("exactSubgroupClassCount")
    if expected_total != declared_total:
        raise SymbolicModuleError(
            "Expanded class count does not match the sealed ledger summary."
        )
    counts = {kind: 0 for kind in sorted(ENTRY_KINDS)}
    for entry in entries:
        counts[entry["kind"]] += 1
    pareto_ids = list(pareto_prune(entries))
    report: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "builderVersion": BUILDER_VERSION,
        "source": {
            "candidateId": source.get("candidateId"),
            "finiteImageOrder": source.get("finiteImageOrder"),
            "hashes": source_hashes,
        },
        "scope": {
            "degreeCeiling": ledger.get("scope", {}).get("ceiling"),
            "declaredRejectedClassCount": declared_total,
            "permutationRowsMaterialized": False,
        },
        "summary": {
            "entryCount": len(entries),
            "entryKinds": counts,
            "paretoExactModuleCount": len(pareto_ids),
            "missingCoverageCount": sum(
                entry["coverage"]["status"] == "missing" for entry in entries
            ),
        },
        "entries": entries,
        "paretoExactModuleIds": pareto_ids,
        "claims": [
            "complete accounting of subgroup classes declared rejected by this sealed mod-2 ledger",
            "exact witness coverage only for entries carrying a complete stored fixed-point vector",
        ],
        "nonClaims": [
            "witness coverage for aggregate-only class records",
            "a materialized permutation action",
            "a torsion-free Coxeter subgroup",
            "completeness outside this finite image and degree ledger",
        ],
    }
    report["artifactSha256"] = sha256_json(report)
    return report


def concise_summary(report: Mapping[str, Any]) -> str:
    summary = report["summary"]
    kinds = summary["entryKinds"]
    return (
        "mod-2 symbolic modules: "
        f"{summary['entryCount']} declared classes; "
        f"{kinds[EXACT_MODULE]} exact, "
        f"{kinds[METADATA_ONLY]} metadata-only, "
        f"{kinds[UNUSABLE]} unusable; "
        f"{summary['paretoExactModuleCount']} on exact Pareto frontier"
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_LEDGER)
    parser.add_argument("--p2-artifact", type=Path, default=DEFAULT_P2_ARTIFACT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--request-output", type=Path)
    parser.add_argument(
        "--action-output",
        type=Path,
        help="Write the validated compact 122-point ambient action for replay.",
    )
    parser.add_argument("--response", type=Path)
    parser.add_argument("--run-gap", action="store_true")
    parser.add_argument("--wsl-action", default=DEFAULT_WSL_ACTION)
    parser.add_argument(
        "--wsl-gap",
        default="gap",
    )
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the full catalogue to stdout instead of the concise summary.",
    )
    args = parser.parse_args(argv)
    ledger = json.loads(args.input.read_text(encoding="utf8"))
    if not isinstance(ledger, dict):
        raise SymbolicModuleError("The ledger root must be an object.")
    ledger_file_hash = sha256_file(args.input)
    report: dict[str, Any]
    if (
        args.request_output is not None
        or args.action_output is not None
        or args.response is not None
        or args.run_gap
    ):
        if not args.p2_artifact.is_file():
            raise SymbolicModuleError(
                "The rich p2 artifact is required for marks regeneration: "
                f"{args.p2_artifact}"
            )
        p2 = json.loads(args.p2_artifact.read_text(encoding="utf8"))
        if not isinstance(p2, dict):
            raise SymbolicModuleError("The rich p2 artifact root must be an object.")
        request = build_marks_request(
            ledger,
            p2,
            ledger_file_sha256=ledger_file_hash,
            p2_file_sha256=sha256_file(args.p2_artifact),
        )
        if args.request_output is not None:
            args.request_output.parent.mkdir(parents=True, exist_ok=True)
            args.request_output.write_text(
                json.dumps(request, indent=2, sort_keys=True) + "\n",
                encoding="utf8",
            )
        checked_action: dict[str, Any] | None = None
        if args.action_output is not None:
            checked_action = validate_action_transfer(
                read_wsl_json(args.wsl_action), request
            )
            args.action_output.parent.mkdir(parents=True, exist_ok=True)
            args.action_output.write_text(
                json.dumps(checked_action, indent=2, sort_keys=True) + "\n",
                encoding="utf8",
            )
        if args.run_gap:
            if checked_action is None:
                checked_action = validate_action_transfer(
                    read_wsl_json(args.wsl_action), request
                )
            raw_response, execution = run_gap_marks(
                request,
                checked_action,
                wsl_gap=args.wsl_gap,
                timeout_seconds=args.timeout_seconds,
            )
            validated = validate_marks_response(request, raw_response)
            validated["execution"] = execution
            report = exact_catalogue_from_response(
                ledger,
                request,
                validated,
                ledger_file_sha256=ledger_file_hash,
            )
        elif args.response is not None:
            raw_response = json.loads(args.response.read_text(encoding="utf8"))
            if not isinstance(raw_response, dict):
                raise SymbolicModuleError("The GAP response root must be an object.")
            validated = validate_marks_response(request, raw_response)
            report = exact_catalogue_from_response(
                ledger,
                request,
                validated,
                ledger_file_sha256=ledger_file_hash,
            )
        else:
            report = build_symbolic_catalogue(
                ledger, ledger_file_sha256=ledger_file_hash
            )
            if args.request_output is not None:
                print(
                    "request written; execute: python "
                    "scripts/mod2_symbolic_partial_modules.py --run-gap "
                    f"--p2-artifact {args.p2_artifact} --output <catalogue.json>"
                )
    else:
        report = build_symbolic_catalogue(ledger, ledger_file_sha256=ledger_file_hash)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf8"
        )
    print(json.dumps(report, sort_keys=True) if args.json else concise_summary(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
