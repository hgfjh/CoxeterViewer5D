from __future__ import annotations

import copy
import unittest

import finite_image_degree_report as report


HASH_A = "a" * 64
HASH_B = "b" * 64
HASH_C = "c" * 64
HASH_D = "d" * 64


def fixture() -> dict:
    return {
        "inputHash": HASH_A,
        "matrixDigest": HASH_B,
        "sphericalCatalogue": {"witnessDigest": HASH_C},
        "residueAttempts": [
            {
                "candidateId": "GF(2)",
                "rationalPrime": 2,
                "imageOrder": 120,
                "structuralRecognition": {
                    "actionHash": HASH_D,
                    "mod2Certificate": {
                        "finiteIndexClassification": {
                            "admissibleIndexCount": 2,
                            "classificationCeiling": 20,
                            "targetLowerBound": 10,
                            "completeNecessaryIndexSieve": True,
                            "completeSubgroupFamilyClassification": True,
                            "report": [
                                {
                                    "target": 10,
                                    "classification": "impossible",
                                    "complete": True,
                                    "exactCandidateCount": 0,
                                    "reason": "No exact subgroup class.",
                                },
                                {
                                    "target": 20,
                                    "classification": "materialized-and-rejected",
                                    "complete": True,
                                    "exactCandidateCount": 2,
                                    "materializedAndRejectedCount": 2,
                                    "witnessFreeCandidateCount": 0,
                                    "reason": "Both classes contain torsion.",
                                },
                            ],
                        }
                    },
                },
            }
        ],
    }


class DegreeReportTests(unittest.TestCase):
    def test_complete_report_is_deterministic(self) -> None:
        first = report.build_degree_report(fixture())
        second = report.build_degree_report(copy.deepcopy(fixture()))
        self.assertEqual(first, second)
        self.assertEqual(first["summary"]["exactSubgroupClassCount"], 2)
        self.assertEqual(first["scope"]["degreeCount"], 2)
        digest = first.pop("reportSha256")
        self.assertEqual(digest, report.sha256_json(first))

    def test_incomplete_row_fails_closed(self) -> None:
        source = fixture()
        source["residueAttempts"][0]["structuralRecognition"]["mod2Certificate"][
            "finiteIndexClassification"
        ]["report"][1]["classification"] = "unresolved-resumable-frontier"
        with self.assertRaises(report.DegreeReportError):
            report.build_degree_report(source)


if __name__ == "__main__":
    unittest.main()
