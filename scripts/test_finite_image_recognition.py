"""Contract tests for finite-image recognition and index screening.

The recognition backend is intentionally tested in ordinary CPython.  GAP
produces the certificate, while these helpers decide whether that certificate
is internally consistent and strong enough to rule out a requested action
degree.
"""

from __future__ import annotations

import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

import finite_image_recognition as recognition


ACTION_HASH = "a" * 64
MANIFEST_HASH = "b" * 64
MOD_2_ORDER = 2_368_880_640


def complete_certificate() -> dict[str, object]:
    """Return a minimal complete certificate for the mod-2 index obstruction."""

    return {
        "schemaVersion": 1,
        "actionHash": ACTION_HASH,
        "manifestHash": MANIFEST_HASH,
        "recognition": {
            "complete": True,
            "finiteImageOrder": MOD_2_ORDER,
            "structure": "S3 x (O8-(2):2)",
        },
        "catalogue": {
            "complete": True,
            "finiteImageOrder": MOD_2_ORDER,
            "source": "TomLib:O8-(2)",
            "subgroupClassCount": 5_351,
        },
        "screening": {
            "complete": True,
            "finiteImageOrder": MOD_2_ORDER,
            "possibleIndices": [1, 2, 3, 4, 6, 12],
            "reason": "complete subgroup catalogue plus Goursat accounting",
        },
    }


class FiniteImageRecognitionTests(unittest.TestCase):
    def test_admissible_targets_are_exact_lower_bound_multiples(self) -> None:
        self.assertEqual(
            recognition.admissible_target_indices(5_760, 23_040),
            [5_760, 11_520, 17_280, 23_040],
        )
        self.assertEqual(recognition.admissible_target_indices(7, 6), [])
        with self.assertRaises((TypeError, ValueError)):
            recognition.admissible_target_indices(0, 23_040)
        with self.assertRaises((TypeError, ValueError)):
            recognition.admissible_target_indices(5_760.0, 23_040)

    def test_compact_cube_classification_range_has_every_admissible_index(self) -> None:
        targets = recognition.admissible_target_indices(5_760, 576_000)

        self.assertEqual(len(targets), 100)
        self.assertEqual(targets[0], 5_760)
        self.assertEqual(targets[-1], 576_000)
        self.assertEqual(targets[16], 97_920)
        self.assertTrue(all(target % 5_760 == 0 for target in targets))

    def test_gap_sidecar_declares_exact_cached_range_enumeration(self) -> None:
        source = (Path(__file__).parent / "gap_finite_image_recognition.g").read_text(
            encoding="utf-8"
        )

        required_contract = (
            "CVMod2ExactFamilyLedger",
            "CVBuildB0Catalogue",
            "CVOuterLiftsFromNormalizerQuotient",
            "RepresentativeAction(",
            "SubdirectProducts",
            "CVSkippedSubdirectPairFrontier",
            "CVExactWitnessTestForSubgroup",
            "CVCompactSubgroupMaterialization",
            "subgroupGeneratorRowsSha256",
            'classification := "witness-free-candidate-found"',
            'classification := "materialized-and-rejected"',
            'classification := "unresolved-resumable-frontier"',
            "expectedCandidateConjugacyClassCount := 10",
            "expectedGoursatRows",
            "requestedCeiling576000Covered",
            "reusePolicy",
            "resumeStage",
        )
        for marker in required_contract:
            with self.subTest(marker=marker):
                self.assertIn(marker, source)

        generic_start = source.index("CVMod2ExactFamilyLedger := function")
        generic_end = source.index("CVCertifyMod2StructureAndIndices := function")
        generic_source = source[generic_start:generic_end]

        # A GAP-side witness intersection is only a candidate screen.  Final
        # torsion-free promotion belongs to the independent Q/H orbit check.
        self.assertNotIn('classification := "certified-torsion-free"', generic_source)
        self.assertNotIn("torsionFreeSubgroupFound", source)

        # Every failed left quotient or skipped A0/B0 pair must be represented
        # in the target frontier rather than silently omitted.
        self.assertIn("and ForAll(relevantLeftEntries, left -> left.complete)", source)
        self.assertIn("resumable-skipped-subdirect-pair", source)
        self.assertIn('status := "gap-exact-api-raised-error"', source)

    def test_gap_sidecar_declares_verified_matrix_order_discovery_contract(
        self,
    ) -> None:
        source = (Path(__file__).parent / "gap_finite_image_recognition.g").read_text(
            encoding="utf-8"
        )

        for marker in (
            'orderMode = "discover-recog"',
            "RecogniseMatrixGroup",
            "CALL_WITH_CATCH(IsCorrect, [node])",
            "discoveredFiniteImageOrder",
            "inputGeneratorMembershipVerified",
            "recognitionTreeVerified",
            "verificationFailureKind",
            'verificationStage := "presentation-based-IsCorrect"',
            'status := "passed-order-discovery"',
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, source)

        # The verified recognition-node order is intentionally distinct from
        # Size(matrixImage.group), which is the operation that stalls on the
        # large characteristic-five image.
        discovery_start = source.index("CVResolveMatrixImageOrder := function")
        discovery_end = source.index("CVInvariantFormDiagnosticsUnsafe := function")
        discovery_source = source[discovery_start:discovery_end]
        self.assertIn("Size, [node]", discovery_source)
        self.assertNotIn("Size(matrixImage.group)", discovery_source)

        odd_start = source.index("CVOddPrimeOrthogonalMatrixDiagnostics := function")
        odd_end = source.index("CVCharacteristic3MatrixDiagnostics := function")
        odd_source = source[odd_start:odd_end]
        self.assertIn("CVVerifiedRecogOrder(derived", odd_source)
        self.assertNotIn("derivedOrder := Size(derived)", odd_source)
        self.assertNotIn("derivedIndex := Index(matrixImage.group, derived)", odd_source)
        self.assertNotIn("IsPerfectGroup(derived)", odd_source)

    def test_goursat_indices_retain_the_shared_c2_fiber(self) -> None:
        # A subgroup A0 contributes both its index in S3 and the orders of its
        # possible quotients.  The C2 quotients of S3 and O8-(2):2 may be
        # identified across a Goursat fiber; treating every subgroup as a
        # direct product would incorrectly discard those index-2 fibers.
        left_cases = [
            {"index": 1, "quotientOrders": [1, 2]},
            {"index": 2, "quotientOrders": [1]},
            {"index": 3, "quotientOrders": [1, 2]},
            {"index": 6, "quotientOrders": [1]},
        ]
        right_cases = [
            {"projectionIndex": 1, "quotientOrders": [1, 2]},
            {"projectionIndex": 2, "quotientOrders": [1]},
        ]

        self.assertEqual(
            recognition.possible_goursat_indices(left_cases, right_cases),
            [1, 2, 3, 4, 6, 12],
        )
        self.assertIn(
            2,
            recognition.possible_goursat_indices(
                [{"index": 1, "quotientOrders": [1, 2]}],
                [{"projectionIndex": 1, "quotientOrders": [1, 2]}],
            ),
        )

    def test_index_two_orthogonal_extension_rules_out_requested_degrees(self) -> None:
        # N = Omega+(10,3) is normal of index two in the mod-3 image.  For a
        # subgroup H of Q, a maximal index in N must divide [Q:H] when H maps
        # onto Q/N, or divide [Q:H]/2 when H is contained in N.
        maximal_indices = [
            9_801,
            9_922,
            91_840,
            2_778_160,
            15_877_620,
            27_781_600,
            5_858_841_780,
            137_096_897_652,
            184_553_516_070,
            374_508_598_464,
            479_839_141_782,
            5_384_169_071_424,
        ]
        for target in (5_760, 11_520, 17_280, 23_040):
            with self.subTest(target=target):
                self.assertEqual(
                    recognition.screen_index_two_extension_target(
                        target, maximal_indices
                    ),
                    "ruled-out",
                )

        self.assertEqual(
            recognition.screen_index_two_extension_target(9_801, maximal_indices),
            "unknown",
        )

    def test_complete_certificate_validates_and_screens_targets(self) -> None:
        certificate = complete_certificate()
        self.assertTrue(
            recognition.validate_screening_certificate(
                certificate,
                expected_action_hash=ACTION_HASH,
                expected_manifest_hash=MANIFEST_HASH,
            )
        )
        self.assertEqual(
            recognition.screening_decision(certificate, 5_760), "ruled-out"
        )
        self.assertEqual(recognition.screening_decision(certificate, 6), "admissible")

    def test_incomplete_catalogue_fails_closed(self) -> None:
        certificate = complete_certificate()
        certificate["catalogue"]["complete"] = False  # type: ignore[index]
        certificate["screening"]["complete"] = False  # type: ignore[index]

        self.assertTrue(
            recognition.validate_screening_certificate(
                certificate,
                expected_action_hash=ACTION_HASH,
                expected_manifest_hash=MANIFEST_HASH,
            )
        )
        self.assertEqual(recognition.screening_decision(certificate, 5_760), "unknown")

    def test_partial_per_target_proof_remains_fail_closed(self) -> None:
        certificate = complete_certificate()
        screening = certificate["screening"]
        assert isinstance(screening, dict)
        screening.update(
            {
                "complete": False,
                "partialTargetDecisions": [
                    {
                        "target": 5_760,
                        "decision": "ruled-out",
                        "reason": "complete necessary index sieve",
                    },
                    {
                        "target": 97_920,
                        "decision": "unknown",
                        "reason": "unresolved outer and Goursat families",
                    },
                ],
                "targetDecisions": [
                    {
                        "target": 5_760,
                        "decision": "unknown",
                        "reason": "requested screening is incomplete as a whole",
                    },
                    {
                        "target": 97_920,
                        "decision": "unknown",
                        "reason": "requested screening is incomplete as a whole",
                    },
                ],
            }
        )

        self.assertTrue(
            recognition.validate_screening_certificate(
                certificate,
                expected_action_hash=ACTION_HASH,
                expected_manifest_hash=MANIFEST_HASH,
            )
        )
        self.assertEqual(recognition.screening_decision(certificate, 5_760), "unknown")
        self.assertEqual(recognition.screening_decision(certificate, 97_920), "unknown")

    def test_claimed_complete_screening_rejects_an_incomplete_catalogue(self) -> None:
        certificate = complete_certificate()
        certificate["catalogue"]["complete"] = False  # type: ignore[index]

        with self.assertRaisesRegex(ValueError, "complete|catalogue"):
            recognition.validate_screening_certificate(
                certificate,
                expected_action_hash=ACTION_HASH,
                expected_manifest_hash=MANIFEST_HASH,
            )

    def test_certificate_rejects_tampered_hashes(self) -> None:
        for field, expected in (
            ("actionHash", ACTION_HASH),
            ("manifestHash", MANIFEST_HASH),
        ):
            with self.subTest(field=field):
                certificate = complete_certificate()
                certificate[field] = "f" * 64
                with self.assertRaisesRegex(ValueError, "hash|Hash"):
                    recognition.validate_screening_certificate(
                        certificate,
                        expected_action_hash=ACTION_HASH,
                        expected_manifest_hash=MANIFEST_HASH,
                    )
                self.assertNotEqual(certificate[field], expected)

    def test_certificate_rejects_inconsistent_group_orders(self) -> None:
        for section in ("recognition", "catalogue", "screening"):
            with self.subTest(section=section):
                certificate = complete_certificate()
                certificate[section]["finiteImageOrder"] = MOD_2_ORDER // 2  # type: ignore[index]
                with self.assertRaisesRegex(ValueError, "order|Order"):
                    recognition.validate_screening_certificate(
                        certificate,
                        expected_action_hash=ACTION_HASH,
                        expected_manifest_hash=MANIFEST_HASH,
                    )

    def test_cache_key_is_deterministic_and_binds_both_inputs(self) -> None:
        first = recognition.build_recognition_cache_key(ACTION_HASH, MANIFEST_HASH)
        second = recognition.build_recognition_cache_key(ACTION_HASH, MANIFEST_HASH)

        self.assertEqual(first, second)
        self.assertNotEqual(
            first,
            recognition.build_recognition_cache_key("c" * 64, MANIFEST_HASH),
        )
        self.assertNotEqual(
            first,
            recognition.build_recognition_cache_key(ACTION_HASH, "d" * 64),
        )

    def test_action_transfer_binds_ordered_generators_and_matrix_rows(self) -> None:
        common = {
            "candidate_id": "GF(2)",
            "characteristic": 2,
            "finite_image_order": 6,
            "degree": 3,
            "coxeter_matrix": [[1, 3], [3, 1]],
            "matrix_generator_rows": [
                [[1, 0], [1, 1]],
                [[1, 1], [0, 1]],
            ],
            "residue_field_order": 2,
            "lower_bound": 6,
            "max_index": 12,
            "manifest_hash": MANIFEST_HASH,
        }
        payload, action_hash = recognition.build_action_transfer(
            generator_rows=[[2, 1, 3], [1, 3, 2]], **common
        )
        swapped, swapped_hash = recognition.build_action_transfer(
            generator_rows=[[1, 3, 2], [2, 1, 3]], **common
        )
        self.assertEqual(payload["actionSha256"], action_hash)
        self.assertNotEqual(action_hash, swapped_hash)
        self.assertNotEqual(payload["generatorRows"], swapped["generatorRows"])

    def test_matrix_only_transfer_omits_permutation_payload(self) -> None:
        payload, action_hash = recognition.build_action_transfer(
            candidate_id="GF(5)",
            characteristic=5,
            finite_image_order=120,
            coxeter_matrix=[[1, 3], [3, 1]],
            matrix_generator_rows=[
                [[4, 0], [1, 1]],
                [[1, 1], [0, 4]],
            ],
            residue_field_order=5,
            lower_bound=6,
            max_index=60,
            manifest_hash=MANIFEST_HASH,
        )
        self.assertEqual(payload["actionMode"], "matrix-only")
        self.assertNotIn("degree", payload)
        self.assertNotIn("generatorRows", payload)
        self.assertEqual(payload["actionSha256"], action_hash)

    def test_complete_minimum_degree_excludes_composite_factors(self) -> None:
        certificate = complete_certificate()
        certificate["screening"]["minimumNontrivialTransitiveDegree"] = 9_801  # type: ignore[index]
        certificate["screening"]["transitiveFactorScreen"] = {  # type: ignore[index]
            "complete": True,
            "compatibleDegrees": [],
        }
        self.assertTrue(
            recognition.validate_screening_certificate(
                certificate,
                expected_action_hash=ACTION_HASH,
                expected_manifest_hash=MANIFEST_HASH,
            )
        )
        self.assertEqual(
            recognition.minimum_nontrivial_transitive_degree(certificate), 9_801
        )
        self.assertTrue(
            recognition.no_compatible_transitive_factor(certificate, [5_760, 11_520])
        )

    def test_missing_research_gap_runtime_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            missing = home / "missing" / "gap"
            self.assertIsNone(recognition.find_research_gap(home=home))
            self.assertIsNone(
                recognition.find_research_gap(explicit=missing, home=home)
            )

    def test_screening_does_not_mutate_the_certificate(self) -> None:
        certificate = complete_certificate()
        original = deepcopy(certificate)
        recognition.screening_decision(certificate, 5_760)
        self.assertEqual(certificate, original)


if __name__ == "__main__":
    unittest.main()
