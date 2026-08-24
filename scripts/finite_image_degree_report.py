#!/usr/bin/env python3
"""Extract a deterministic bounded-degree report from a finite-image artifact.

The full discovery artifact contains cache paths, timings, and detailed GAP
subgroup records.  This report keeps the mathematical decision for every
requested degree and the hashes needed to identify its source data.  It does
not turn a finite-image obstruction into a statement about the Coxeter group.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "finite-image-bounded-degree-classification"
REPORT_VERSION = "1.0.0"
FINAL_OUTCOMES = frozenset(
    {
        "impossible",
        "materialized-and-rejected",
        "certified-torsion-free",
    }
)


class DegreeReportError(ValueError):
    """The source artifact does not contain a complete bounded classification."""


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def _require_hash(value: Any, field: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise DegreeReportError(f"{field} must be a lowercase SHA-256 hash.")
    return value


def _mod2_attempt(source: dict[str, Any]) -> dict[str, Any]:
    for attempt in source.get("residueAttempts", []):
        if not isinstance(attempt, dict):
            continue
        if attempt.get("rationalPrime") != 2:
            continue
        recognition = attempt.get("structuralRecognition")
        if not isinstance(recognition, dict):
            continue
        mod2 = recognition.get("mod2Certificate")
        if isinstance(mod2, dict) and isinstance(
            mod2.get("finiteIndexClassification"), dict
        ):
            return attempt
    raise DegreeReportError("No exact mod-2 degree classification was found.")


def build_degree_report(source: dict[str, Any]) -> dict[str, Any]:
    """Return a hash-bound report only when every requested row is final."""

    attempt = _mod2_attempt(source)
    recognition = attempt["structuralRecognition"]
    classification = recognition["mod2Certificate"]["finiteIndexClassification"]
    raw_rows = classification.get("report")
    if not isinstance(raw_rows, list) or not raw_rows:
        raise DegreeReportError("The finite-index classification has no rows.")
    expected_count = classification.get("admissibleIndexCount")
    if expected_count != len(raw_rows):
        raise DegreeReportError("The admissible-index count does not match its rows.")
    if classification.get("completeNecessaryIndexSieve") is not True:
        raise DegreeReportError("The necessary index sieve is incomplete.")
    if classification.get("completeSubgroupFamilyClassification") is not True:
        raise DegreeReportError("The subgroup-family classification is incomplete.")

    rows: list[dict[str, Any]] = []
    previous = 0
    for raw in sorted(raw_rows, key=lambda item: int(item.get("target", 0))):
        if not isinstance(raw, dict):
            raise DegreeReportError("A degree row is not an object.")
        degree = raw.get("target")
        outcome = raw.get("classification")
        if (
            isinstance(degree, bool)
            or not isinstance(degree, int)
            or degree <= previous
        ):
            raise DegreeReportError(
                "Degree rows must have distinct increasing targets."
            )
        if outcome not in FINAL_OUTCOMES or raw.get("complete") is not True:
            raise DegreeReportError(
                f"Degree {degree} is not a complete final classification."
            )
        row: dict[str, Any] = {
            "degree": degree,
            "outcome": outcome,
            "exactSubgroupClassCount": int(raw.get("exactCandidateCount", 0)),
            "materializedAndRejectedCount": int(
                raw.get("materializedAndRejectedCount", 0)
            ),
            "witnessFreeCandidateCount": int(raw.get("witnessFreeCandidateCount", 0)),
            "reason": str(raw.get("reason", "")),
        }
        audit = raw.get("independentIndex97920Audit")
        if isinstance(audit, dict):
            row["independentAudit"] = {
                "passed": audit.get("passed") is True,
                "expectedClassCount": int(
                    audit.get("expectedCandidateConjugacyClassCount", 0)
                ),
                "observedClassCount": int(audit.get("candidateConjugacyClassCount", 0)),
                "source": str(audit.get("source", "")),
            }
        rows.append(row)
        previous = degree

    counts: dict[str, int] = {}
    for row in rows:
        counts[row["outcome"]] = counts.get(row["outcome"], 0) + 1
    input_hash = _require_hash(source.get("inputHash"), "inputHash")
    matrix_digest = _require_hash(source.get("matrixDigest"), "matrixDigest")
    report: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "reportVersion": REPORT_VERSION,
        "inputHash": input_hash,
        "matrixDigest": matrix_digest,
        "source": {
            "inputSha256": input_hash,
            "coxeterMatrixSha256": matrix_digest,
            "witnessCatalogueSha256": _require_hash(
                source.get("sphericalCatalogue", {}).get("witnessDigest"),
                "sphericalCatalogue.witnessDigest",
            ),
            "recognitionActionSha256": _require_hash(
                recognition.get("actionHash"), "structuralRecognition.actionHash"
            ),
            "candidateId": str(attempt.get("candidateId", "GF(2)")),
            "finiteImageOrder": str(attempt.get("imageOrder", "")),
        },
        "scope": {
            "lowerBound": int(classification.get("targetLowerBound", 0)),
            "ceiling": int(classification.get("classificationCeiling", 0)),
            "degreeCount": len(rows),
            "completeNecessaryIndexSieve": True,
            "completeSubgroupFamilyClassification": True,
        },
        "summary": {
            "degreeOutcomes": dict(sorted(counts.items())),
            "exactSubgroupClassCount": sum(
                row["exactSubgroupClassCount"] for row in rows
            ),
            "materializedAndRejectedCount": sum(
                row["materializedAndRejectedCount"] for row in rows
            ),
            "witnessFreeCandidateCount": sum(
                row["witnessFreeCandidateCount"] for row in rows
            ),
        },
        "degreeLedger": rows,
        "claims": ["complete classification for this finite image and degree range"],
        "nonClaims": [
            "nonexistence in the Coxeter group",
            "classification for another finite image",
            "minimal torsion-free index",
            "virtual algebraic fibering",
        ],
    }
    report["reportSha256"] = sha256_json(report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = json.loads(args.input.read_text(encoding="utf8"))
    if not isinstance(source, dict):
        raise DegreeReportError("The source artifact must be a JSON object.")
    report = build_degree_report(source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
