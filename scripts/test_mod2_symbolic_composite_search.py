from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("mod2_symbolic_composite_search.py")
SPEC = importlib.util.spec_from_file_location("mod2_symbolic_composite_search", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
search = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(search)


HASH_A = "a" * 64
HASH_B = "b" * 64
HASH_C = "c" * 64
ACTION_HASH = "d" * 64


def identity_row(size: int) -> list[int]:
    return list(range(1, size + 1))


def sealed_action() -> dict:
    action = {
        "degree": 122,
        "expectedOrder": 2_368_880_640,
        "generatorRows": [identity_row(122) for _ in range(10)],
        "coxeterMatrix": [
            [1 if left == right else 2 for right in range(10)] for left in range(10)
        ],
        "torsionWitnesses": [
            {"id": f"tw{index}", "primeOrder": 2, "word": [0]} for index in range(186)
        ],
    }
    action["actionSha256"] = search.sha256_json(action)
    return action


def exact_report() -> dict:
    action = sealed_action()
    action_hash = action["actionSha256"]
    rows = [identity_row(122)]
    fingerprint = search._rows_fingerprint(action_hash, rows)
    degrees = [97_920] * 10 + [195_840] * 9 + [293_760] * 14 + [391_680] * 12
    entries = []
    for index, degree in enumerate(degrees):
        # The union is complete, but no individual class is witness-free.
        counts = [1] * 186
        counts[index % 186] = 0
        counts[(index + 45) % 186] = 0
        covered = [position for position, count in enumerate(counts) if count == 0]
        entries.append(
            {
                "id": f"module-{index}",
                "kind": "exact-module",
                "degree": degree,
                "compositeSolverEligible": True,
                "coverage": {
                    "status": "exact",
                    "witnessCount": 186,
                    "witnessSha256": HASH_C,
                    "coveredWitnessIndexes": covered,
                    "coveredCount": len(covered),
                },
                "marksEvidence": {
                    "status": "exact",
                    "fixedPointCounts": counts,
                },
                "provenance": {
                    "classId": f"class-{index}",
                    "classOrdinalWithinDegree": degrees[: index + 1].count(degree),
                    "stabilizer": {
                        "stabilizerFingerprint": fingerprint,
                        "subgroupClass": {
                            "ambientActionDegree": 122,
                            "ambientActionSha256": action_hash,
                            "compactSubgroupGeneratorRows": rows,
                            "subgroupGeneratorCount": 1,
                            "subgroupIndex": degree,
                            "subgroupOrder": 2_368_880_640 // degree,
                        },
                    },
                },
            }
        )
    report = {
        "schemaVersion": 1,
        "artifactType": "mod2-symbolic-partial-module-catalogue",
        "source": {
            "hashes": {
                "witnessCatalogueSha256": HASH_C,
                "coxeterMatrixSha256": HASH_B,
                "inputSha256": HASH_A,
            }
        },
        "entries": entries,
    }
    report["artifactSha256"] = search.sha256_json(report)
    return report


def exact_response(request: dict, status: str = "exact-exhausted") -> dict:
    compact = []
    for item in request["classes"]:
        compact.append(
            {
                "classId": item["classId"],
                "degree": item["degree"],
                "fixedPointCounts": item["expectedFixedPointCounts"],
                "stabilizerFingerprint": item["expectedStabilizerFingerprint"],
                "compactAmbientSubgroupGeneratorRows": item[
                    "compactAmbientSubgroupGeneratorRows"
                ],
                "subgroupOrder": item["provenance"]["subgroupOrder"],
            }
        )
    return {
        "schemaVersion": 1,
        "artifactType": search.RESPONSE_TYPE,
        "requestSha256": request["requestSha256"],
        "targetDegrees": list(search.TARGET_DEGREES),
        "status": status,
        "compactSubgroups": compact,
        "coverageUnion": {
            "complete": True,
            "coveredCount": 186,
            "witnessCount": 186,
        },
        "search": {
            "completeWithinDeclaredTargets": status == "exact-exhausted",
            "pairTypesExamined": 1_035,
            "totalDoubleCosetsExamined": 123,
        },
        "survivor": None,
        "tool": {"id": "test-gap"},
    }


class Mod2SymbolicCompositeTests(unittest.TestCase):
    def test_current_report_schema_exposes_all_compact_rows(self) -> None:
        checked = search.validate_symbolic_report(exact_report())

        self.assertEqual(len(checked["entries"]), 45)
        self.assertTrue(
            all(
                item["compactAmbientSubgroupGeneratorRows"]
                for item in checked["entries"]
            )
        )

    def test_real_report_validates_when_available(self) -> None:
        if not search.DEFAULT_REPORT.is_file():
            self.skipTest("real symbolic report unavailable")
        report = json.loads(search.DEFAULT_REPORT.read_text(encoding="utf8"))
        checked = search.validate_symbolic_report(report)

        union: set[int] = set()
        for item in checked["entries"]:
            union.update(
                index
                for index, count in enumerate(item["expectedFixedPointCounts"])
                if count == 0
            )
        self.assertEqual(len(checked["entries"]), 45)
        self.assertEqual(len(union), 186)

    def test_tampered_rows_fail_the_stabilizer_digest(self) -> None:
        report = exact_report()
        rows = report["entries"][0]["provenance"]["stabilizer"]["subgroupClass"][
            "compactSubgroupGeneratorRows"
        ]
        rows[0][0], rows[0][1] = rows[0][1], rows[0][0]
        report.pop("artifactSha256")
        report["artifactSha256"] = search.sha256_json(report)

        with self.assertRaisesRegex(search.CompositeSearchError, "digest"):
            search.validate_symbolic_report(report)

    def test_degree_gate_requires_floor_pair_double_cosets(self) -> None:
        checked = search.validate_symbolic_report(exact_report())
        gate = search.symbolic_degree_gate(checked["entries"])

        self.assertEqual(gate["moduleDegreeFloor"], 97_920)
        self.assertEqual(gate["exactPairDegree"], 195_840)
        self.assertEqual(gate["exactFloorPairTypeCount"], 55)
        self.assertEqual(
            gate["conclusion"], "requires-complete-floor-pair-double-cosets"
        )

    def test_request_uses_all_1035_pair_types_and_local_rows(self) -> None:
        report = exact_report()
        action = sealed_action()
        request = search.build_request(report, action, report_file_sha256=HASH_A)

        self.assertEqual(request["bounds"]["maximumPairTypes"], 1_035)
        self.assertEqual(request["compactRows"]["providedClassCount"], 45)
        self.assertFalse(
            request["compactRows"]["reconstructMissingFromCertifiedRecognition"]
        )
        self.assertEqual(search.verify_request(request), request["requestSha256"])

    def test_incomplete_gap_run_never_claims_195840_exhaustion(self) -> None:
        request = search.build_request(
            exact_report(), sealed_action(), report_file_sha256=HASH_A
        )
        report = search.build_report(
            request,
            None,
            {
                "status": "incomplete-resource-bounded",
                "reason": "120-second cap",
            },
        )

        self.assertEqual(report["status"], "incomplete-resource-bounded")
        self.assertEqual(report["baseExactCertificate"]["maximumDegree"], 97_920)
        self.assertIn("exhaustion at degree 195840", report["nonClaims"])
        self.assertNotIn(
            "195840",
            " ".join(report["claims"]).replace("accounting at degree 195840", ""),
        )

    def test_complete_gap_response_can_claim_exact_pairwise_scope(self) -> None:
        request = search.build_request(
            exact_report(), sealed_action(), report_file_sha256=HASH_A
        )
        response = exact_response(request)
        report = search.build_report(
            request, response, {"status": "completed", "returnCode": 0}
        )

        self.assertEqual(report["status"], "exact-exhausted")
        self.assertTrue(report["search"]["completeWithinDeclaredTargets"])
        self.assertEqual(len(report["compactSubgroups"]), 45)

    def test_response_cannot_overclaim_after_partial_pair_search(self) -> None:
        request = search.build_request(
            exact_report(), sealed_action(), report_file_sha256=HASH_A
        )
        response = exact_response(request)
        response["search"]["completeWithinDeclaredTargets"] = False

        with self.assertRaisesRegex(search.CompositeSearchError, "scope completeness"):
            search.validate_gap_response(request, response)

    def test_independent_replay_accepts_a_small_exact_action(self) -> None:
        swap = [2, 1]
        candidate = {"degree": 2, "generatorRows": [swap for _ in range(10)]}
        action = {
            "coxeterMatrix": [
                [1 if left == right else 2 for right in range(10)] for left in range(10)
            ],
            "torsionWitnesses": [
                {"id": f"tw{index}", "primeOrder": 2, "word": [index % 10]}
                for index in range(186)
            ],
        }

        replay = search.independently_replay_materialized_action(candidate, action)

        self.assertTrue(replay["passed"])
        self.assertTrue(replay["witnessFree"])

    def test_local_action_is_preferred_and_wsl_remains_fallback(self) -> None:
        action = sealed_action()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "action.json"
            path.write_text(json.dumps(action), encoding="utf8")
            loaded, source = search.load_action(path, "unused")

        self.assertEqual(loaded, action)
        self.assertTrue(source.endswith("action.json"))

    def test_gap_source_uses_double_cosets_and_delayed_materialization(self) -> None:
        source = search.GAP_SCRIPT.read_text(encoding="utf8")

        self.assertIn("DoubleCosets(", source)
        self.assertIn("CVSCMaterializeSurvivor", source)
        self.assertIn("maximumExactDoubleCosets", source)
        self.assertIn("CVRequire(CVSCValidateTargets", source)
        self.assertNotIn("recognition := CVRunRecognition", source)


if __name__ == "__main__":
    unittest.main()
