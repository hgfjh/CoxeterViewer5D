"""Tests for the compact evidence retained by the discovery launcher."""

from __future__ import annotations

import unittest

import torsion_free_discovery as discovery


class FiniteImageEvidenceReportTests(unittest.TestCase):
    def test_degree_outcomes_and_prime_ideal_metadata_are_preserved(self) -> None:
        artifacts = [
            {
                "artifactHash": "a" * 64,
                "residueAttempts": [
                    {
                        "candidateId": "p5-ideal0-q25",
                        "rationalPrime": 5,
                        "primeIdeal": "(5, zeta + 2)",
                        "primeIdealNorm": 25,
                        "residueDegree": 2,
                        "residueFieldOrder": 25,
                        "status": "accepted",
                        "imageOrderStatus": "unknown",
                        "kernelCertificateLevel": "finite-index-kernel",
                        "kernelCover": {
                            "status": "passed",
                            "certificateLevel": "finite-index-kernel",
                            "indexEvidence": {
                                "divisibilityLowerBoundDecimal": "5760",
                                "finiteUpperBoundDecimal": "999999999",
                            },
                            "certificateSha256": "c" * 64,
                        },
                        "subgroupSearch": {
                            "reason": "bounded search incomplete",
                            "targetIndexDecisions": [
                                {
                                    "target": 5_760,
                                    "decision": "unknown",
                                    "reason": "recognition incomplete",
                                }
                            ],
                        },
                    }
                ],
            },
            {
                "artifactHash": "b" * 64,
                "residueAttempts": [
                    {
                        "candidateId": "GF(2)",
                        "rationalPrime": 2,
                        "status": "accepted",
                        "structuralRecognition": {
                            "mod2Certificate": {
                                "finiteIndexClassification": {
                                    "classificationCeiling": 576_000,
                                    "completeNecessaryIndexSieve": True,
                                    "completeSubgroupFamilyClassification": False,
                                    "requestedCeiling576000Covered": True,
                                    "report": [
                                        {
                                            "target": 5_760,
                                            "classification": "impossible",
                                            "complete": True,
                                            "reason": "absent from the exact index spectrum",
                                        },
                                        {
                                            "target": 97_920,
                                            "classification": "unresolved-family-coverage",
                                            "complete": False,
                                            "reason": "outer lifts remain",
                                            "familyReport": [
                                                {
                                                    "family": "outer-lifts",
                                                    "status": "incomplete",
                                                    "complete": False,
                                                }
                                            ],
                                        },
                                    ],
                                }
                            }
                        },
                    }
                ],
            },
        ]

        reports = discovery.finite_image_evidence_reports(artifacts)
        self.assertEqual(
            [report["residueSource"]["candidateId"] for report in reports],
            ["GF(2)", "p5-ideal0-q25"],
        )
        mod2 = reports[0]
        self.assertFalse(mod2["boundedComplete"])
        self.assertEqual(mod2["degreeLedger"][0]["outcome"], "impossible")
        self.assertEqual(
            mod2["degreeLedger"][1]["outcome"],
            "unresolved-family-coverage",
        )
        self.assertTrue(
            mod2["classificationScope"]["requestedCeiling576000Covered"]
        )
        odd = reports[1]
        self.assertEqual(odd["residueSource"]["residueFieldOrder"], 25)
        self.assertEqual(odd["degreeLedger"][0]["outcome"], "unknown")
        self.assertEqual(
            odd["kernelCertification"],
            {
                "certificateLevel": "finite-index-kernel",
                "indexStatus": "unknown",
                "exactIndexDecimal": None,
                "divisibilityLowerBoundDecimal": "5760",
                "finiteUpperBoundDecimal": "999999999",
                "certificateSha256": "c" * 64,
            },
        )
        self.assertTrue(odd["kernelCertificationIndependentOfDegreeLedger"])

    def test_subgroup_frontier_statuses_do_not_skip_action_certification(self) -> None:
        reports = discovery.finite_image_evidence_reports(
            [
                {
                    "artifactHash": "b" * 64,
                    "residueAttempts": [
                        {
                            "candidateId": "GF(2)",
                            "rationalPrime": 2,
                            "structuralRecognition": {
                                "mod2Certificate": {
                                    "finiteIndexClassification": {
                                        "report": [
                                            {
                                                "target": 97_920,
                                                "classification": "witness-free-candidate-found",
                                                "complete": True,
                                                "reason": "exact subgroup avoids all witnesses",
                                            },
                                            {
                                                "target": 103_680,
                                                "classification": "unresolved-resumable-frontier",
                                                "complete": False,
                                                "reason": "normalizer quotient timed out",
                                            },
                                        ]
                                    }
                                }
                            },
                        }
                    ],
                }
            ]
        )

        self.assertEqual(
            [item["outcome"] for item in reports[0]["degreeLedger"]],
            ["admissible", "unresolved-family-coverage"],
        )
        self.assertFalse(reports[0]["boundedComplete"])


if __name__ == "__main__":
    unittest.main()
