from __future__ import annotations

import argparse
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import block_amalgam_candidate_globalizer as globalizer  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = (
    ROOT
    / ".cover-search"
    / ("compact-5-cube-block-amalgam-r6-full-frame-d5-p100-v1_1.checkpoint.json")
)
CERTIFICATE = (
    ROOT
    / "scripts/certificates/torsion-free"
    / ("compact_5_cube_block_amalgam_r6_full_frame_d5_p100_window_5760.json")
)
SOURCE = ROOT / "public/examples/compact_5_cube_gamma1.json"


class ReasonedTriangleStateTests(unittest.TestCase):
    def test_forced_closure_reports_cross_residue_reason(self) -> None:
        fixed = np.asarray([1, 0, 3, 2, 5, 4], dtype=np.uint16)
        residues = np.asarray([0, 0, 0, 0, 1, 1], dtype=np.int16)
        relation = globalizer.ReasonedTriangleState(fixed, residues)

        self.assertTrue(relation.add_edge(0, 2, support={"left"}))
        self.assertFalse(relation.add_edge(3, 4, support={"right"}))
        conflict = relation.last_conflict
        self.assertIsNotNone(conflict)
        assert conflict is not None
        self.assertEqual(conflict.kind, "forced-edge-crosses-residues")
        self.assertEqual(conflict.edge, (1, 5))
        self.assertEqual(conflict.support, frozenset(("left", "right")))

    def test_rollback_removes_reasons_and_edges(self) -> None:
        fixed = np.asarray([1, 0, 3, 2, 5, 4], dtype=np.uint16)
        residues = np.zeros(6, dtype=np.int16)
        relation = globalizer.ReasonedTriangleState(fixed, residues)
        checkpoint = relation.checkpoint()
        self.assertTrue(relation.add_edge(0, 2, support={"left"}))
        self.assertTrue(relation.add_edge(3, 4, support={"right"}))
        self.assertEqual(len(relation.edge_log), 3)
        relation.rollback(checkpoint)
        self.assertEqual(len(relation.edge_log), 0)
        self.assertTrue(np.all(relation.partner < 0))
        self.assertEqual(relation.edge_support, {})
        self.assertEqual(relation.point_support, {})

    def test_learned_clause_rechecks_partition(self) -> None:
        clause = globalizer.LearnedBoundaryConflict((1, 5), ("left", "right"), "seed")
        tokens = frozenset(("left", "right", "unused"))
        self.assertTrue(
            globalizer.learned_conflict_applies(
                clause, tokens, np.asarray([0, 0, 0, 0, 1, 1])
            )
        )
        self.assertFalse(
            globalizer.learned_conflict_applies(
                clause, tokens, np.zeros(6, dtype=np.int16)
            )
        )


@unittest.skipUnless(CHECKPOINT.is_file(), "local R6 checkpoint is unavailable")
class CompactCubeSeedTests(unittest.TestCase):
    def test_seed_export_is_hash_bound_and_complete(self) -> None:
        catalogue = globalizer.build_seed_catalogue(CHECKPOINT, CERTIFICATE, SOURCE)
        self.assertEqual(catalogue["seedCount"], 93)
        self.assertEqual(len(catalogue["seeds"]), 93)
        self.assertEqual({item["firstStageBranch"] for item in catalogue["seeds"]}, {6})

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "seeds.json"
            globalizer.atomic_write_json(path, catalogue)
            _, seeds = globalizer.load_seeds(path, catalogue["inputHash"])
            self.assertEqual(len(seeds), 93)

    def test_tampered_checkpoint_is_rejected(self) -> None:
        raw = json.loads(CHECKPOINT.read_text(encoding="utf8"))
        raw["counters"]["survivingFrameCases"] = 92
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            path.write_text(json.dumps(raw), encoding="utf8")
            with self.assertRaises(globalizer.GlobalizerError):
                globalizer.build_seed_catalogue(path, CERTIFICATE, SOURCE)

    def test_campaign_learns_reusable_family_conflict(self) -> None:
        catalogue = globalizer.build_seed_catalogue(CHECKPOINT, CERTIFICATE, SOURCE)
        with tempfile.TemporaryDirectory() as directory:
            seeds_path = Path(directory) / "seeds.json"
            globalizer.atomic_write_json(seeds_path, catalogue)
            artifact, code = globalizer.run_globalizer(
                argparse.Namespace(
                    input=SOURCE,
                    seeds=seeds_path,
                    degree=5760,
                    timeout_seconds=60.0,
                    memory_mb=2048,
                    max_nodes=100_000,
                    max_local_nodes=10_000,
                    max_frames_per_domain=4,
                    restarts=1,
                    random_seed=20260813,
                )
            )
        self.assertEqual(code, 0)
        self.assertEqual(
            artifact["status"], "seed-family-excluded-by-reusable-conflicts"
        )
        self.assertEqual(artifact["learnedConflicts"]["coveredSeedCount"], 93)
        self.assertGreater(artifact["search"]["learnedConflictPrunes"], 0)
        self.assertFalse(artifact["candidateFound"])
        self.assertFalse(artifact["complete"])


if __name__ == "__main__":
    unittest.main()
