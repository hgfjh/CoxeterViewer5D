from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import block_amalgam_global_csp as csp  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/examples/compact_5_cube_gamma1.json"
R8 = (
    ROOT
    / "scripts/certificates/torsion-free"
    / "compact_5_cube_r8_candidate_globalizer_5760.json"
)


class GlobalCspCoreTests(unittest.TestCase):
    def test_ownership_all_different_conflict_and_rollback(self) -> None:
        ownership = csp.AllDifferentState(2, 3)
        checkpoint = ownership.checkpoint()
        self.assertTrue(ownership.assign(1, 0, 2))
        self.assertFalse(ownership.assign(1, 1, 2))
        ownership.rollback(checkpoint)
        self.assertEqual(ownership.values[1], [-1, -1, -1])
        self.assertEqual(ownership.used[1], set())

    def test_implication_propagation_detects_forced_conflict(self) -> None:
        x1 = csp.AssignmentLiteral("x", 1)
        y0 = csp.AssignmentLiteral("y", 0)
        assignment = {"x": 1}
        passed, forced = csp.propagate_implications(assignment, {x1: (y0,)})
        self.assertTrue(passed)
        self.assertEqual(assignment, {"x": 1, "y": 0})
        self.assertEqual(forced, (y0,))

        assignment = {"x": 1, "y": 1}
        passed, _ = csp.propagate_implications(assignment, {x1: (y0,)})
        self.assertFalse(passed)

    def test_exact_learned_clause_prunes_only_its_bound_condition(self) -> None:
        clause = csp.ExactConflictClause(
            2,
            ("a=1", "b=0"),
            "forced-edge-crosses-residues",
            (1, 3),
        )
        database = csp.ExactClauseDatabase((clause,))
        split = np.asarray([0, 0, 0, 1], dtype=np.int16)
        joined = np.zeros(4, dtype=np.int16)
        self.assertIsNotNone(database.first_match(2, {"a=1", "b=0"}, split))
        self.assertIsNone(database.first_match(2, {"a=1", "b=0"}, joined))
        self.assertIsNone(database.first_match(1, {"a=1", "b=0"}, split))
        self.assertEqual(database.prunes, 1)

    def test_symmetry_canonicalization_uses_least_exact_image(self) -> None:
        swap = {"x0": "x1", "x1": "x0"}
        noncanonical = {"x0": 1, "x1": 0}
        canonical = {"x0": 0, "x1": 1}
        self.assertFalse(csp.is_canonical_assignment(noncanonical, (swap,)))
        self.assertTrue(csp.is_canonical_assignment(canonical, (swap,)))
        self.assertEqual(
            csp.canonical_assignment_key(noncanonical, (swap,)),
            tuple(sorted(canonical.items())),
        )

    def test_checkpoint_is_hash_bound_and_preserves_clauses(self) -> None:
        clause = csp.ExactConflictClause(0, ("x=1",), "synthetic")
        payload = csp.checkpoint_payload(
            "campaign-a",
            3,
            (1, 2),
            (clause,),
            {"nodes": 9},
            mid_restart_replay_required=True,
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "checkpoint.json"
            path.write_text(json.dumps(payload), encoding="utf8")
            loaded = csp.load_checkpoint(path, "campaign-a")
            self.assertIsNotNone(loaded)
            assert loaded is not None
            self.assertEqual(loaded["nextRestart"], 3)
            self.assertEqual(loaded["learnedClauses"][0]["support"], ["x=1"])
            with self.assertRaises(csp.GlobalCspError):
                csp.load_checkpoint(path, "campaign-b")

            tampered = dict(payload)
            tampered["nextRestart"] = 4
            path.write_text(json.dumps(tampered), encoding="utf8")
            with self.assertRaises(csp.GlobalCspError):
                csp.load_checkpoint(path, "campaign-a")

    def test_completeness_never_promotes_an_interrupted_prefix(self) -> None:
        incomplete = csp.completeness_report(
            candidate_found=False,
            exhausted_branches=(0, 1),
            branch_count=3,
            interrupted=True,
        )
        self.assertFalse(incomplete["declaredFiniteDomainExhausted"])
        self.assertFalse(incomplete["degreeNonexistenceClaim"])
        self.assertIn("no nonexistence", incomplete["claim"])

        exhausted = csp.completeness_report(
            candidate_found=False,
            exhausted_branches=(0, 1, 2),
            branch_count=3,
            interrupted=False,
        )
        self.assertTrue(exhausted["declaredFiniteDomainExhausted"])
        # Exhausting the second-gluing domain is still not promoted to a claim
        # about every generator row of a degree-5,760 Coxeter action.
        self.assertFalse(exhausted["degreeNonexistenceClaim"])

    def test_domain_is_global_and_seed_independent(self) -> None:
        declaration = csp.domain_declaration(7)
        self.assertEqual(declaration["ownership"]["remainingVariables"], 105)
        self.assertEqual(declaration["frames"]["variablesPerResidue"], 14)
        self.assertFalse(declaration["seedRestrictsDomain"])
        self.assertGreater(int(declaration["totalAssignments"]), 10**100)


@unittest.skipUnless(SOURCE.is_file() and R8.is_file(), "compact-cube artifacts absent")
class CompactCubeBindingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        (
            cls.source,
            cls.matrix,
            cls.source_hash,
            cls.first_states,
            cls.problems,
            _,
        ) = csp.block._prepare_root_witness_campaign(
            type("Args", (), {"input": SOURCE, "degree": 5760})()
        )

    def test_all_r8_clauses_are_independently_forced_and_branch_bound(self) -> None:
        artifact, clauses, verification = csp.load_and_verify_r8_clauses(
            R8,
            self.source_hash,
            self.first_states,
            self.problems,
        )
        self.assertEqual(
            artifact["artifactType"], "coxeter-candidate-first-frame-globalization"
        )
        self.assertEqual(len(clauses), 10)
        self.assertTrue(verification["allForcedEdgesReplayed"])
        self.assertEqual({clause.branch for clause in clauses}, {6})

    def test_tiny_real_campaign_stops_honestly_without_seed_window(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "global.checkpoint.json"
            artifact, code = csp.run_campaign(
                type(
                    "Args",
                    (),
                    {
                        "input": SOURCE,
                        "r8_conflicts": R8,
                        "seed_artifact": None,
                        "checkpoint": checkpoint,
                        "degree": 5760,
                        "timeout_seconds": 10.0,
                        "memory_mb": 2048,
                        "max_nodes": 250,
                        "max_nodes_per_restart": 125,
                        "restarts": 2,
                        "random_seed": 20260813,
                    },
                )()
            )
            self.assertEqual(code, 2)
            self.assertEqual(artifact["status"], "incomplete-resource-bounded-search")
            self.assertFalse(artifact["complete"])
            self.assertFalse(artifact["candidateFound"])
            self.assertFalse(artifact["completeness"]["declaredFiniteDomainExhausted"])
            self.assertFalse(artifact["optionalSeedOrdering"]["used"])
            self.assertTrue(checkpoint.is_file())


if __name__ == "__main__":
    unittest.main()
