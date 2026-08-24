"""Tests for the distance-two canonical augmentation backend."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import sys
import unittest

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import block_amalgam_canonical_augmentation as augmentation  # noqa: E402
import block_amalgam_cover_search as block  # noqa: E402


COMPACT_CUBE = REPO_ROOT / "public/examples/compact_5_cube_gamma1.json"


class CanonicalPermutationTests(unittest.TestCase):
    def test_distance_two_generator_is_exact_and_duplicate_free(self) -> None:
        permutations = tuple(augmentation.permutations_at_distance_two(15))
        self.assertEqual(len(permutations), 5_005)
        self.assertEqual(len(set(permutations)), len(permutations))
        self.assertTrue(
            all(augmentation.transposition_distance(item) == 2 for item in permutations)
        )

    def test_root_signature_multiplicities_cover_every_skeleton(self) -> None:
        counts = augmentation.distance_two_root_signature_counts()
        self.assertEqual(len(counts), 4_215)
        self.assertEqual(sum(counts.values()), 266_560)
        self.assertEqual(
            Counter(counts.values()), Counter({1: 4_116, 637: 98, 200_018: 1})
        )


class TrianglePropagationTests(unittest.TestCase):
    def test_three_vertex_path_forces_closing_edge(self) -> None:
        fixed = np.asarray([1, 0, 3, 2, 5, 4], dtype=np.uint16)
        relation = augmentation.TriangleRelationState(
            fixed, selected_points=frozenset(range(6))
        )
        self.assertTrue(relation.add_edge(0, 2))
        self.assertTrue(relation.add_edge(3, 4))
        self.assertEqual(int(relation.partner[1]), 5)
        self.assertEqual(int(relation.partner[5]), 1)
        self.assertEqual(relation.forced_edge_count, 1)

    def test_rollback_removes_forced_edges(self) -> None:
        fixed = np.asarray([1, 0, 3, 2, 5, 4], dtype=np.uint16)
        relation = augmentation.TriangleRelationState(
            fixed, selected_points=frozenset(range(6))
        )
        checkpoint = relation.checkpoint()
        self.assertTrue(relation.add_edge(0, 2))
        self.assertTrue(relation.add_edge(3, 4))
        relation.rollback(checkpoint)
        self.assertTrue(np.all(relation.partner < 0))
        self.assertEqual(relation.forced_edge_count, 0)


class ExactLocalSieveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        args = argparse.Namespace(input=COMPACT_CUBE, degree=5_760)
        (
            _,
            _,
            _,
            cls.first_states,
            cls.problems,
            cls.port_orbits,
        ) = block._prepare_root_witness_campaign(args)
        cls.catalogue = augmentation.RootFrameCatalogue(cls.problems[0])
        cls.maps, cls.port_assignments = augmentation.packed_minimum_root_tables(
            cls.catalogue, cls.port_orbits
        )
        cls.fixed_rows = np.asarray(
            [state.rows[7] for state in cls.first_states], dtype=np.uint16
        )

    def compiled_counts(self, signature: tuple[int, ...]) -> list[int]:
        counts, _ = augmentation._minimum_root_survivor_counts(
            np.asarray([signature], dtype=np.int8),
            self.port_assignments,
            self.maps,
            self.catalogue.standard_port_by_point,
            self.catalogue.standard_coordinate_by_point,
            self.catalogue.local_new_row,
            self.fixed_rows,
        )
        return list(map(int, counts[0]))

    def reference_counts(self, signature: tuple[int, ...]) -> list[int]:
        result: list[int] = []
        for branch in range(len(self.first_states)):
            survivors = 0
            for port in self.port_orbits:
                _, witnesses = block.root_configuration_relation_witnesses(
                    self.problems[0],
                    (self.first_states[branch],),
                    port,
                    signature,
                )
                survivors += witnesses[0] is None
            result.append(survivors)
        return result

    def test_compiled_sieve_matches_full_row_reference(self) -> None:
        for signature in (
            (0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 3, 0, 0, 0, 0, 0),
            (0, 7, 6, 0, 0, 0, 0, 0),
        ):
            self.assertEqual(
                self.compiled_counts(signature), self.reference_counts(signature)
            )

    def test_packed_frame_contains_all_local_g4_edges(self) -> None:
        _, edge_left, edge_right, coordinates = augmentation.packed_frame_tables(
            self.catalogue, (0,) * 8
        )
        self.assertEqual(len(edge_left), 192)
        self.assertEqual(len(edge_right), 192)
        self.assertEqual(coordinates.shape, (192, 2))

    def test_global_propagation_exhausts_a_known_local_survivor(self) -> None:
        signature = (0, 3, 4, 0, 0, 0, 0, 0)
        columns = augmentation.distance_two_skeleton_columns(signature)
        _, edge_left, edge_right, coordinates = augmentation.packed_frame_tables(
            self.catalogue, (0,) * 8
        )
        class_edges = augmentation._packed_residue_class_edges(
            np.asarray(columns, dtype=np.int8),
            self.port_assignments,
            self.maps,
            edge_left,
            edge_right,
            coordinates,
        )
        solver = augmentation.MinimumRootGlobalSolver(
            self.problems[0],
            self.fixed_rows[6],
            columns,
            class_edges,
        )
        result = solver.search(max_nodes=100_000, deadline=None)
        self.assertEqual(result.status, "global-slice-exhausted")
        self.assertEqual(result.nodes, 210)
        self.assertIsNone(result.class_assignment)

    def test_distance_two_artifact_is_current_and_sealed(self) -> None:
        path = (
            SCRIPT_DIR
            / "certificates"
            / "torsion-free"
            / "compact_5_cube_block_amalgam_r6_distance_two_5760.json"
        )
        artifact = json.loads(path.read_text(encoding="utf8"))
        self.assertEqual(
            augmentation.seal(dict(artifact))["artifactHash"],
            artifact["artifactHash"],
        )
        self.assertEqual(artifact["status"], "complete")
        self.assertTrue(artifact["complete"])
        self.assertFalse(artifact["globalSecondGluingComplete"])
        self.assertEqual(artifact["scope"]["existingSideSkeletonCount"], 266_560)
        self.assertEqual(artifact["scope"]["excludedSkeletonCount"], 265_662)
        self.assertEqual(artifact["scope"]["unresolvedSkeletonCount"], 898)
        self.assertEqual(
            artifact["provenance"]["implementationHashes"]["pythonSha256"],
            augmentation.sha256_file(
                SCRIPT_DIR / "block_amalgam_canonical_augmentation.py"
            ),
        )

    def test_full_frame_window_is_current_and_not_overclaimed(self) -> None:
        path = (
            SCRIPT_DIR
            / "certificates"
            / "torsion-free"
            / "compact_5_cube_block_amalgam_r6_full_frame_d5_p100_window_5760.json"
        )
        artifact = json.loads(path.read_text(encoding="utf8"))
        self.assertEqual(
            augmentation.seal(dict(artifact))["artifactHash"],
            artifact["artifactHash"],
        )
        self.assertEqual(artifact["status"], "window-complete")
        self.assertFalse(artifact["complete"])
        self.assertTrue(artifact["search"]["windowComplete"])
        self.assertEqual(artifact["search"]["nextCase"], 29_505)
        self.assertEqual(artifact["search"]["counters"]["rootFrameNodes"], 132_817_959)
        self.assertEqual(artifact["search"]["counters"]["survivingFrameCases"], 93)
        self.assertFalse(artifact["globalSecondGluingComplete"])

    def test_global_distance_two_artifact_is_complete_and_sealed(self) -> None:
        path = (
            SCRIPT_DIR
            / "certificates"
            / "torsion-free"
            / "compact_5_cube_block_amalgam_r7_global_distance_two_5760.json"
        )
        artifact = json.loads(path.read_text(encoding="utf8"))
        self.assertEqual(
            augmentation.seal(dict(artifact))["artifactHash"],
            artifact["artifactHash"],
        )
        self.assertEqual(artifact["status"], "exhausted")
        self.assertTrue(artifact["complete"])
        self.assertTrue(artifact["scopeExcluded"])
        self.assertFalse(artifact["globalSecondGluingComplete"])
        self.assertEqual(artifact["scope"]["rootSignatureCount"], 898)
        self.assertEqual(artifact["scope"]["caseCount"], 3_001)
        self.assertEqual(artifact["search"]["counters"]["globalSearchNodes"], 630_210)
        self.assertEqual(artifact["search"]["counters"]["exhaustedCases"], 3_001)
        self.assertEqual(artifact["search"]["counters"]["survivingRows"], 0)
        self.assertEqual(artifact["search"]["counters"]["incompleteCases"], 0)
        self.assertEqual(
            artifact["provenance"]["implementationHashes"]["pythonSha256"],
            augmentation.sha256_file(
                SCRIPT_DIR / "block_amalgam_canonical_augmentation.py"
            ),
        )


if __name__ == "__main__":
    unittest.main()
