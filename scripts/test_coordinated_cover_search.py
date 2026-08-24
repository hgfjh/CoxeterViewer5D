"""Contract tests for the three-track cover-search coordinator."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import coordinated_cover_search as coordinator


ROOT = Path(__file__).resolve().parents[1]


class CoordinatedCoverSearchTests(unittest.TestCase):
    def test_compact_cube_plan_has_exact_degree_divisor(self) -> None:
        source, divisor, maximal = coordinator.source_plan(
            ROOT / "public/examples/compact_5_cube_gamma1.json"
        )

        self.assertEqual(source["rank"], 10)
        self.assertEqual(divisor, 5_760)
        self.assertEqual(len(maximal), 32)
        by_type = {(item["type"], item["order"]) for item in maximal}
        self.assertIn(("A5", 720), by_type)
        self.assertIn(("D4 x A1", 384), by_type)
        certificate = coordinator.divisibility_certificate(maximal, divisor)
        self.assertEqual(
            certificate["primeFactorization"],
            [
                {"prime": 2, "exponent": 7},
                {"prime": 3, "exponent": 2},
                {"prime": 5, "exponent": 1},
            ],
        )
        two_power_witnesses = certificate["primePowerWitnesses"][0][
            "witnessSubgroupIds"
        ]
        self.assertTrue(
            all(
                next(item for item in maximal if item["id"] == subgroup_id)["type"]
                == "D4 x A1"
                for subgroup_id in two_power_witnesses
            )
        )

    def test_track_artifact_is_bound_to_input_and_divisor(self) -> None:
        input_path = ROOT / "public/examples/compact_5_cube_gamma1.json"
        input_hash = coordinator.sha256_file(input_path)
        artifact = {
            "schemaVersion": 1,
            "artifactType": "coxeter-cover-search-track",
            "track": "finite-target-synthesis",
            "status": "incomplete",
            "complete": False,
            "inputHash": input_hash,
            "lowerBoundDivisor": 5_760,
        }
        artifact["artifactHash"] = coordinator.sha256_text(
            coordinator.canonical_json(artifact)
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "track.json"
            path.write_text(json.dumps(artifact), encoding="utf-8")
            checked = coordinator.validate_track_artifact(
                path,
                track="finite-target-synthesis",
                input_hash=input_hash,
                lower_bound=5_760,
            )
            self.assertEqual(checked, artifact)
            artifact["lowerBoundDivisor"] = 24
            path.write_text(json.dumps(artifact), encoding="utf-8")
            with self.assertRaisesRegex(coordinator.CoordinatorError, "divisor"):
                coordinator.validate_track_artifact(
                    path,
                    track="finite-target-synthesis",
                    input_hash=input_hash,
                    lower_bound=5_760,
                )

    def test_track_artifact_tampering_is_rejected(self) -> None:
        artifact = {
            "schemaVersion": 1,
            "artifactType": "coxeter-cover-search-track",
            "track": "everitt-composite-modules",
            "status": "planned",
            "complete": False,
            "inputHash": "a" * 64,
            "lowerBoundDivisor": 6,
            "warnings": [],
        }
        artifact["artifactHash"] = coordinator.sha256_text(
            coordinator.canonical_json(artifact)
        )
        artifact["warnings"].append("edited after sealing")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "track.json"
            path.write_text(json.dumps(artifact), encoding="utf-8")
            with self.assertRaisesRegex(coordinator.CoordinatorError, "hash"):
                coordinator.validate_track_artifact(
                    path,
                    track="everitt-composite-modules",
                    input_hash="a" * 64,
                    lower_bound=6,
                )

    def test_candidate_count_does_not_promote_an_absent_candidate(self) -> None:
        self.assertEqual(coordinator._candidate_count({"candidates": []}), 0)
        self.assertEqual(coordinator._candidate_count({"candidate": None}), 0)
        self.assertEqual(coordinator._candidate_count({"candidate": {"id": "x"}}), 1)

    def test_real_track_commands_use_stable_checkpoints(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "everitt-composite-modules.json"
            checkpoint = root / "everitt-composite-modules.checkpoint.json"
            command = coordinator._track_command(
                track="everitt-composite-modules",
                script=ROOT / "scripts/everitt_composite_portfolio.py",
                input_path=ROOT / "public/examples/compact_5_cube_gamma1.json",
                output_path=output,
                dry_run=False,
                catalogues=(),
                witness_catalogue=None,
            )
            self.assertEqual(command[-2:], ["--checkpoint", str(checkpoint)])

            checkpoint.write_text("{}", encoding="utf-8")
            resumed = coordinator._track_command(
                track="everitt-composite-modules",
                script=ROOT / "scripts/everitt_composite_portfolio.py",
                input_path=ROOT / "public/examples/compact_5_cube_gamma1.json",
                output_path=output,
                dry_run=False,
                catalogues=(),
                witness_catalogue=None,
            )
            self.assertEqual(resumed[-1], "--resume")

    def test_dry_run_does_not_touch_checkpoint_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "geometric-orbifold-cover.json"
            command = coordinator._track_command(
                track="geometric-orbifold-cover",
                script=ROOT / "scripts/orbifold_cover_search.py",
                input_path=ROOT / "public/examples/compact_5_cube_gamma1.json",
                output_path=output,
                dry_run=True,
                catalogues=(),
                witness_catalogue=None,
            )
            self.assertIn("--dry-run", command)
            self.assertNotIn("--checkpoint", command)
            self.assertNotIn("--resume", command)


if __name__ == "__main__":
    unittest.main()
