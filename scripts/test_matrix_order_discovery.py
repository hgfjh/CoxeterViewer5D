"""Pure-Python checks for the verified matrix-order bridge."""

from __future__ import annotations

import unittest

import finite_image_recognition as recognition


class MatrixOrderDiscoveryBridgeTests(unittest.TestCase):
    def test_matrix_only_payload_can_defer_the_full_image_order(self) -> None:
        payload, action_hash = recognition.build_action_transfer(
            candidate_id="GF(5)",
            characteristic=5,
            finite_image_order=None,
            coxeter_matrix=[[1, 3], [3, 1]],
            lower_bound=6,
            max_index=120,
            manifest_hash="a" * 64,
            matrix_generator_rows=[
                [[4, 1], [0, 1]],
                [[1, 0], [1, 4]],
            ],
            residue_field_order=5,
        )

        self.assertEqual(payload["orderMode"], "discover-recog")
        self.assertFalse(payload["orderDiscoveryOnly"])
        self.assertNotIn("expectedOrder", payload)
        self.assertEqual(payload["actionSha256"], action_hash)

    def test_discovered_order_requires_verified_tree_and_membership(self) -> None:
        action_hash = "b" * 64
        manifest_hash = "c" * 64
        certificate = {
            "schemaVersion": 1,
            "actionHash": action_hash,
            "manifestHash": manifest_hash,
            "discoveredFiniteImageOrder": 60,
            "orderDiscovery": {
                "status": "passed",
                "finiteImageOrder": 60,
                "recognitionTreeVerified": True,
                "inputGeneratorMembershipVerified": True,
                "inputRelationsVerifiedSeparately": True,
            },
            "matrixValidation": {
                "status": "passed",
                "orderedGeneratorCount": 2,
                "generatorChecks": [
                    {"involution": True},
                    {"involution": True},
                ],
                "finiteRelations": [{"passed": True}],
            },
        }
        self.assertEqual(
            recognition.validate_order_discovery_certificate(
                certificate, action_hash, manifest_hash
            ),
            60,
        )
        certificate["orderDiscovery"]["inputGeneratorMembershipVerified"] = False
        with self.assertRaisesRegex(ValueError, "membership"):
            recognition.validate_order_discovery_certificate(
                certificate, action_hash, manifest_hash
            )

    def test_witness_catalogue_is_part_of_the_transfer_hash(self) -> None:
        common = {
            "candidate_id": "GF(2)",
            "characteristic": 2,
            "finite_image_order": 6,
            "coxeter_matrix": [[1, 3], [3, 1]],
            "lower_bound": 6,
            "max_index": 120,
            "manifest_hash": "d" * 64,
            "degree": 3,
            "generator_rows": [[2, 1, 3], [1, 3, 2]],
        }
        first, first_hash = recognition.build_action_transfer(
            **common,
            torsion_witnesses=[{"id": "tw0", "word": [0], "primeOrder": 2}],
            torsion_witness_catalogue_complete=True,
        )
        second, second_hash = recognition.build_action_transfer(
            **common,
            torsion_witnesses=[{"id": "tw0", "word": [1], "primeOrder": 2}],
            torsion_witness_catalogue_complete=True,
        )

        self.assertNotEqual(first_hash, second_hash)
        self.assertTrue(first["torsionWitnessCatalogueComplete"])
        self.assertEqual(first["torsionWitnesses"][0]["word"], [0])


if __name__ == "__main__":
    unittest.main()
