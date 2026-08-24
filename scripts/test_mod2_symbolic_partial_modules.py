from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import mod2_symbolic_partial_modules as symbolic


HASH_A = "a" * 64
HASH_B = "b" * 64
HASH_C = "c" * 64
HASH_D = "d" * 64
HASH_E = "e" * 64


def seal(ledger: dict) -> dict:
    result = copy.deepcopy(ledger)
    result["reportSha256"] = symbolic.sha256_json(result)
    return result


def fixture(rows: list[dict], total: int) -> dict:
    return seal(
        {
            "schemaVersion": 1,
            "artifactType": "finite-image-bounded-degree-classification",
            "reportVersion": "1.0.0",
            "inputHash": HASH_A,
            "matrixDigest": HASH_B,
            "source": {
                "inputSha256": HASH_A,
                "coxeterMatrixSha256": HASH_B,
                "witnessCatalogueSha256": HASH_C,
                "recognitionActionSha256": HASH_D,
                "candidateId": "GF(2)",
                "finiteImageOrder": "120",
            },
            "scope": {"ceiling": max(row["degree"] for row in rows)},
            "summary": {"exactSubgroupClassCount": total},
            "degreeLedger": rows,
            "claims": [],
            "nonClaims": [],
        }
    )


def rejected_row(degree: int, classes: list[dict] | None, count: int) -> dict:
    row = {
        "degree": degree,
        "outcome": "materialized-and-rejected",
        "exactSubgroupClassCount": count,
        "materializedAndRejectedCount": count,
        "witnessFreeCandidateCount": 0,
        "reason": "Every class contains torsion.",
    }
    if classes is not None:
        row["subgroupClasses"] = classes
    return row


def rich_candidate(degree: int) -> dict:
    return {
        "b0Family": "contained-in-normal-factor",
        "b0Index": degree,
        "b0SourceRecords": [{"family": "contained-in-normal-factor"}],
        "b0Structure": "test subgroup",
        "commonQuotientOrder": 1,
        "s3ClassPosition": 1,
        "s3Order": 1,
        "s3ProjectionIndex": 6,
        "sourceMultiplicity": 1,
        "sourceRows": [
            {
                "b0ClassTomPosition": 7,
                "b0Index": degree,
                "commonQuotientOrder": 1,
                "s3ClassPosition": 1,
                "s3Order": 1,
                "subdirectClassPosition": 1,
            }
        ],
        "subgroupIndex": degree,
        "subgroupOrder": 120,
        "tomPosition": 7,
        "witnessCheck": {"complete": True, "outcome": "witness-contaminated"},
    }


def regeneration_fixture() -> tuple[dict, dict]:
    witnesses = [
        {"id": "tw0", "word": [0], "primeOrder": 2},
        {"id": "tw1", "word": [0, 1], "primeOrder": 3},
        {"id": "tw2", "word": [0, 1, 0, 1], "primeOrder": 5},
    ]
    witness_hash = symbolic.sha256_json(witnesses)
    row = rejected_row(100, None, 1)
    ledger = fixture([row], 1)
    ledger["source"]["witnessCatalogueSha256"] = witness_hash
    ledger.pop("reportSha256")
    ledger = seal(ledger)
    rich_row = {
        "target": 100,
        "classification": "materialized-and-rejected",
        "exactCandidateCount": 1,
        "materializedAndRejectedCount": 1,
        "exactCandidates": [rich_candidate(100)],
    }
    p2 = {
        "schemaVersion": 1,
        "artifactType": "coxeter-finite-image-search",
        "inputHash": HASH_A,
        "matrixDigest": HASH_B,
        "sphericalCatalogue": {
            "witnessDigest": witness_hash,
            "witnessCount": len(witnesses),
        },
        "torsionWitnesses": witnesses,
        "residueAttempts": [
            {
                "rationalPrime": 2,
                "recognitionBridge": {"actionHash": HASH_E},
                "structuralRecognition": {
                    "mod2Certificate": {
                        "finiteIndexClassification": {"report": [rich_row]}
                    }
                },
            }
        ],
    }
    p2["artifactHash"] = symbolic.sha256_json(p2)
    return ledger, p2


def marks_response(request: dict) -> dict:
    requested = request["classes"][0]
    return {
        "schemaVersion": 1,
        "artifactType": "mod2-partial-module-marks-response",
        "status": "passed",
        "requestSha256": request["requestSha256"],
        "witnessCatalogueSha256": request["witnessCatalogueSha256"],
        "witnessCount": request["witnessCount"],
        "classCount": 1,
        "classRecords": [
            {
                "classId": requested["classId"],
                "degree": requested["degree"],
                "classOrdinalWithinDegree": requested["classOrdinalWithinDegree"],
                "stabilizerFingerprint": HASH_D,
                "compactSubgroupGeneratorRows": [list(range(1, 123))],
                "stabilizerProvenance": {
                    "subgroupIndex": 100,
                    "subgroupOrder": 120,
                },
                "fixedPointCounts": [0, 4, 0],
                "marksEvidence": {
                    "exact": True,
                    "method": "compact-stabilizer conjugacy-class intersection",
                    "permutationRowsMaterialized": False,
                    "testedAmbientConjugacyClassCount": 3,
                    "witnessCount": 3,
                },
            }
        ],
    }


class SymbolicModuleTests(unittest.TestCase):
    def test_real_sealed_ledger_accounts_for_all_45_classes(self) -> None:
        path = symbolic.DEFAULT_LEDGER
        ledger = json.loads(path.read_text(encoding="utf8"))
        report = symbolic.build_symbolic_catalogue(
            ledger, ledger_file_sha256=symbolic.sha256_file(path)
        )

        self.assertEqual(report["summary"]["entryCount"], 45)
        self.assertEqual(
            report["summary"]["entryKinds"],
            {
                symbolic.EXACT_MODULE: 0,
                symbolic.METADATA_ONLY: 45,
                symbolic.UNUSABLE: 0,
            },
        )
        by_degree: dict[int, int] = {}
        for entry in report["entries"]:
            by_degree[entry["degree"]] = by_degree.get(entry["degree"], 0) + 1
        self.assertEqual(
            by_degree,
            {97_920: 10, 195_840: 9, 293_760: 14, 391_680: 12},
        )

    def test_aggregate_rows_never_claim_false_coverage(self) -> None:
        ledger = fixture([rejected_row(100, None, 2)], 2)
        report = symbolic.build_symbolic_catalogue(ledger)

        self.assertEqual(report["paretoExactModuleIds"], [])
        for entry in report["entries"]:
            self.assertEqual(entry["kind"], symbolic.METADATA_ONLY)
            self.assertFalse(entry["compositeSolverEligible"])
            self.assertIsNone(entry["coverage"]["bitsetHex"])
            self.assertIsNone(entry["coverage"]["coveredWitnessIndexes"])
            self.assertEqual(entry["marksEvidence"]["status"], "missing")

    def test_exact_marks_reconstruct_coverage_and_pareto_frontier(self) -> None:
        classes_100 = [
            {
                "classId": "A",
                "stabilizerFingerprint": HASH_A,
                "marksEvidence": {"fixedPointMarks": [0, 0, 2]},
            },
            {
                "classId": "B",
                "stabilizerFingerprint": HASH_B,
                "fixedPointCounts": [0, 2, 3],
            },
        ]
        classes_200 = [
            {
                "classId": "C",
                "stabilizerFingerprint": HASH_C,
                "witnessFixedPointCounts": [0, 0, 0],
            },
            {
                "classId": "D",
                "stabilizerFingerprint": HASH_D,
                "marksEvidence": {"fixedPointCounts": [2, 3, 0]},
            },
        ]
        ledger = fixture(
            [
                rejected_row(100, classes_100, 2),
                rejected_row(200, classes_200, 2),
            ],
            4,
        )
        report = symbolic.build_symbolic_catalogue(ledger)
        entries = {entry["provenance"]["classId"]: entry for entry in report["entries"]}

        self.assertEqual(entries["A"]["coverage"]["coveredWitnessIndexes"], [0, 1])
        self.assertEqual(entries["A"]["coverage"]["bitsetHex"], "03")
        self.assertEqual(entries["C"]["coverage"]["coveredWitnessIndexes"], [0, 1, 2])
        self.assertEqual(entries["D"]["coverage"]["coveredWitnessIndexes"], [2])
        self.assertEqual(
            set(report["paretoExactModuleIds"]),
            {entries["A"]["id"], entries["C"]["id"]},
        )
        self.assertNotIn(entries["B"]["id"], report["paretoExactModuleIds"])
        self.assertNotIn(entries["D"]["id"], report["paretoExactModuleIds"])

    def test_invalid_evidence_is_unusable_not_coverage(self) -> None:
        ledger = fixture(
            [
                rejected_row(
                    100,
                    [
                        {
                            "classId": "bad",
                            "marksEvidence": {"fixedPointMarks": [0, -1, 2]},
                        }
                    ],
                    1,
                )
            ],
            1,
        )
        entry = symbolic.build_symbolic_catalogue(ledger)["entries"][0]

        self.assertEqual(entry["kind"], symbolic.UNUSABLE)
        self.assertEqual(entry["marksEvidence"]["status"], "invalid")
        self.assertIsNone(entry["coverage"]["coveredWitnessIndexes"])
        self.assertFalse(entry["compositeSolverEligible"])

    def test_output_and_hashes_are_deterministic(self) -> None:
        ledger = fixture([rejected_row(100, None, 2)], 2)
        first = symbolic.build_symbolic_catalogue(ledger, ledger_file_sha256=HASH_D)
        second = symbolic.build_symbolic_catalogue(
            copy.deepcopy(ledger), ledger_file_sha256=HASH_D
        )

        self.assertEqual(first, second)
        digest = first.pop("artifactSha256")
        self.assertEqual(digest, symbolic.sha256_json(first))
        for entry in first["entries"]:
            core = dict(entry)
            core.pop("id")
            entry_digest = core.pop("entrySha256")
            self.assertEqual(entry_digest, symbolic.sha256_json(core))

    def test_tampered_ledger_fails_closed(self) -> None:
        ledger = fixture([rejected_row(100, None, 1)], 1)
        ledger["degreeLedger"][0]["degree"] = 200
        with self.assertRaisesRegex(symbolic.SymbolicModuleError, "seal"):
            symbolic.build_symbolic_catalogue(ledger)

    def test_cli_writes_report_and_prints_concise_summary(self) -> None:
        ledger = fixture([rejected_row(100, None, 1)], 1)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "ledger.json"
            output_path = root / "modules.json"
            input_path.write_text(json.dumps(ledger), encoding="utf8")
            exit_code = symbolic.main(
                ["--input", str(input_path), "--output", str(output_path)]
            )
            written = json.loads(output_path.read_text(encoding="utf8"))

        self.assertEqual(exit_code, 0)
        self.assertEqual(written["summary"]["entryCount"], 1)

    def test_marks_request_is_deterministic_and_binds_rich_classes(self) -> None:
        ledger, p2 = regeneration_fixture()
        first = symbolic.build_marks_request(
            ledger,
            p2,
            ledger_file_sha256=HASH_C,
            p2_file_sha256=HASH_D,
        )
        second = symbolic.build_marks_request(
            copy.deepcopy(ledger),
            copy.deepcopy(p2),
            ledger_file_sha256=HASH_C,
            p2_file_sha256=HASH_D,
        )

        self.assertEqual(first, second)
        self.assertEqual(first["scope"]["classCount"], 1)
        self.assertFalse(first["scope"]["largeCosetRowsMaterialized"])
        self.assertEqual(first["classes"][0]["provenance"]["subgroupIndex"], 100)
        self.assertEqual(symbolic.verify_marks_request(first), first["requestSha256"])

    def test_marks_response_promotes_only_complete_exact_vectors(self) -> None:
        ledger, p2 = regeneration_fixture()
        request = symbolic.build_marks_request(
            ledger,
            p2,
            ledger_file_sha256=HASH_C,
            p2_file_sha256=HASH_D,
        )
        validated = symbolic.validate_marks_response(request, marks_response(request))
        report = symbolic.exact_catalogue_from_response(
            ledger,
            request,
            validated,
            ledger_file_sha256=HASH_C,
        )

        self.assertEqual(report["summary"]["entryKinds"][symbolic.EXACT_MODULE], 1)
        entry = report["entries"][0]
        self.assertEqual(entry["coverage"]["coveredWitnessIndexes"], [0, 2])
        self.assertTrue(entry["compositeSolverEligible"])
        self.assertNotIn("generatorRows", symbolic.canonical_json(validated))

    def test_marks_response_rejects_partial_or_reordered_data(self) -> None:
        ledger, p2 = regeneration_fixture()
        request = symbolic.build_marks_request(
            ledger,
            p2,
            ledger_file_sha256=HASH_C,
            p2_file_sha256=HASH_D,
        )
        response = marks_response(request)
        response["classRecords"][0]["fixedPointCounts"] = [0, 1]
        with self.assertRaisesRegex(
            symbolic.SymbolicModuleError, "incomplete fixed-point vector"
        ):
            symbolic.validate_marks_response(request, response)

        response = marks_response(request)
        response["classRecords"][0]["classId"] = "wrong"
        with self.assertRaisesRegex(symbolic.SymbolicModuleError, "ordering"):
            symbolic.validate_marks_response(request, response)

    def test_wsl_path_uses_forward_slashes(self) -> None:
        completed = __import__("subprocess").CompletedProcess(
            args=[], returncode=0, stdout="/mnt/c/tmp/file.json\n", stderr=""
        )
        with patch.object(symbolic.subprocess, "run", return_value=completed) as run:
            translated = symbolic._wsl_path(Path("C:/tmp/file.json"))

        self.assertEqual(translated, "/mnt/c/tmp/file.json")
        self.assertNotIn("\\", run.call_args.args[0][-1])

    @unittest.skipUnless(
        symbolic.DEFAULT_P2_ARTIFACT.is_file(), "rich local p2 artifact unavailable"
    )
    def test_real_p2_request_accounts_for_all_45_classes(self) -> None:
        ledger = json.loads(symbolic.DEFAULT_LEDGER.read_text(encoding="utf8"))
        p2 = json.loads(symbolic.DEFAULT_P2_ARTIFACT.read_text(encoding="utf8"))
        request = symbolic.build_marks_request(
            ledger,
            p2,
            ledger_file_sha256=symbolic.sha256_file(symbolic.DEFAULT_LEDGER),
            p2_file_sha256=symbolic.sha256_file(symbolic.DEFAULT_P2_ARTIFACT),
        )

        self.assertEqual(request["scope"]["classCount"], 45)
        self.assertEqual(
            {item["degree"] for item in request["classes"]},
            {97_920, 195_840, 293_760, 391_680},
        )
        self.assertEqual(len({item["classId"] for item in request["classes"]}), 45)


if __name__ == "__main__":
    unittest.main()
