from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import finite_image_module_catalogue as module_catalogue  # noqa: E402
import order5_partial_module_campaign as campaign  # noqa: E402


SOURCE_HASH = "1" * 64
MATRIX_HASH = "2" * 64
WITNESS_HASH = "3" * 64


def matrix() -> list[list[int]]:
    # Two odd components: {0,1} is I2(5), and {2,3} is I2(3).
    return [
        [1, 5, 2, 2],
        [5, 1, 2, 2],
        [2, 2, 1, 3],
        [2, 2, 3, 1],
    ]


def witnesses() -> list[dict]:
    return [
        {
            "id": "tw0",
            "primeOrder": 2,
            "word": [0],
            "subset": [0, 1],
            "sphericalType": "I2(5)",
        },
        {
            "id": "tw1",
            "primeOrder": 2,
            "word": [2],
            "subset": [2, 3],
            "sphericalType": "I2(3)",
        },
        {
            "id": "tw2",
            "primeOrder": 2,
            "word": [0, 2],
            "subset": [0, 2],
            "sphericalType": "A1 x A1",
        },
        {
            "id": "tw3",
            "primeOrder": 5,
            "word": [0, 1],
            "subset": [0, 1],
            "sphericalType": "I2(5)",
        },
        {
            "id": "tw4",
            "primeOrder": 5,
            "word": [1, 0],
            "subset": [0, 1],
            "sphericalType": "I2(5)",
        },
    ]


def witness_catalogue() -> dict:
    values = witnesses()
    return {
        "schemaVersion": 1,
        "artifactType": "coxeter-spherical-witness-cache",
        "matrixDigest": campaign.sha256_json({"coxeterMatrix": matrix()}),
        "witnessCount": len(values),
        "witnessDigest": campaign.sha256_json(values),
        "witnesses": values,
    }


def module_record(module_id: str, degree: int, covered: tuple[int, ...]) -> dict:
    coverage = module_catalogue.build_fixed_point_coverage(
        covered, len(witnesses()), WITNESS_HASH
    )
    core = {
        "id": module_id,
        "kind": "test",
        "degree": degree,
        "origin": {"kind": "test"},
        "actionSha256": (module_id[-1] * 64)[:64],
        "fixedPointCoverage": coverage,
        "exactChecks": {
            "transitive": True,
            "coxeterRelations": True,
            "fixedPointCoverage": True,
        },
        "status": "partial",
    }
    core["moduleSha256"] = campaign.sha256_json(core)
    return core


class OddAbelianizationTests(unittest.TestCase):
    def test_odd_label_components(self) -> None:
        self.assertEqual(campaign.odd_label_components(matrix()), ((0, 1), (2, 3)))

    def test_all_three_nontrivial_degree_two_modules_are_exact(self) -> None:
        modules = campaign.build_degree_two_modules(
            matrix(), witnesses(), WITNESS_HASH, SOURCE_HASH, MATRIX_HASH
        )

        self.assertEqual(len(modules), 3)
        self.assertTrue(all(module["degree"] == 2 for module in modules))
        self.assertTrue(all(module["exactChecks"]["transitive"] for module in modules))
        self.assertTrue(all(module["relationReplay"]["passed"] for module in modules))
        masks = {module["origin"]["componentMask"] for module in modules}
        self.assertEqual(masks, {1, 2, 3})

    def test_exact_fixed_point_coverage_uses_word_parity(self) -> None:
        modules = campaign.build_degree_two_modules(
            matrix(), witnesses(), WITNESS_HASH, SOURCE_HASH, MATRIX_HASH
        )
        by_mask = {
            module["origin"]["componentMask"]: set(
                module_catalogue.coverage_indexes(
                    module["fixedPointCoverage"], WITNESS_HASH
                )
            )
            for module in modules
        }

        self.assertEqual(by_mask[1], {0, 2})
        self.assertEqual(by_mask[2], {1, 2})
        self.assertEqual(by_mask[3], {0, 1})
        self.assertTrue(all(3 not in coverage for coverage in by_mask.values()))
        self.assertTrue(all(4 not in coverage for coverage in by_mask.values()))


class CampaignLogicTests(unittest.TestCase):
    def test_order_five_witnesses_are_prioritized_with_a5_first(self) -> None:
        values = witnesses()
        values[3]["sphericalType"] = "A4 x A1"
        values[4]["sphericalType"] = "A5"
        prioritized = campaign.prioritized_order_five_witnesses(values, {0, 1})

        self.assertEqual([item["id"] for item in prioritized], ["tw4", "tw3"])
        self.assertTrue(all(item["catalogueIndex"] >= 3 for item in prioritized))

    def test_pareto_pruning_uses_degree_and_coverage(self) -> None:
        low = module_record("module-a", 2, (0, 1))
        dominated = module_record("module-b", 3, (0,))
        complementary = module_record("module-c", 3, (2, 3))
        duplicate = deepcopy(low)
        duplicate["id"] = "module-z"

        retained = campaign.pareto_optimal_modules(
            [dominated, complementary, duplicate, low], WITNESS_HASH
        )

        self.assertEqual([item["id"] for item in retained], ["module-a", "module-c"])

    def test_real_report_is_deterministic_and_honest_about_scope(self) -> None:
        source = {
            "schemaVersion": 1,
            "name": "test",
            "rank": 4,
            "coxeterMatrix": matrix(),
        }
        first = campaign.build_real_report(
            source=source,
            matrix=matrix(),
            witness_catalogue=witness_catalogue(),
            existing_catalogue=None,
            artifact_paths=[],
            config_paths=[],
            max_structured_results=8,
            max_nodes_per_anchor=1,
            max_solutions_per_anchor=1,
        )
        second = campaign.build_real_report(
            source=source,
            matrix=matrix(),
            witness_catalogue=witness_catalogue(),
            existing_catalogue=None,
            artifact_paths=[],
            config_paths=[],
            max_structured_results=8,
            max_nodes_per_anchor=1,
            max_solutions_per_anchor=1,
        )

        self.assertEqual(first, second)
        self.assertEqual(first["status"], "blocked-order-5-witness-coverage")
        self.assertFalse(first["gate"]["readyForCompositeSearch"])
        self.assertEqual(first["orderFivePriority"]["uncoveredCount"], 2)
        self.assertFalse(
            first["structuredTargetMining"]["partialHomomorphismEnumerationComplete"]
        )
        self.assertIn(
            "homomorphisms outside the declared faithful S5/S6 anchor classes",
            first["scope"]["notComplete"],
        )
        self.assertIn("does not prove", first["gate"]["obstruction"]["nonClaim"])

    def test_s5_natural_action_makes_a_five_cycle_fixed_point_free(self) -> None:
        five_cycle = (1, 2, 3, 4, 0)

        self.assertTrue(all(five_cycle[point] != point for point in range(5)))
        pairs = campaign.induced_subset_action((five_cycle,), 2)[0]
        self.assertTrue(all(pairs[point] != point for point in range(len(pairs))))

    def test_outer_s6_anchor_is_a_faithful_a5_tuple(self) -> None:
        rows = campaign.outer_s6_a5_anchor()

        self.assertEqual(len(rows), 5)
        self.assertTrue(all(sum(row[i] != i for i in range(6)) == 6 for row in rows))
        self.assertEqual(campaign.generated_group_order(rows, 720), 720)

    def test_structured_replay_records_conjugacy_scope_without_overclaim(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "target.json"
            path.write_text(
                json.dumps(
                    {
                        "track": "finite-target-synthesis",
                        "matrixHash": campaign.sha256_json(matrix()),
                        "complete": True,
                        "evidence": {
                            "boundedSearchResults": [
                                {
                                    "targetId": "S6-test",
                                    "complete": True,
                                    "verifiedSolutions": [],
                                    "containmentGate": {
                                        "anchor": {
                                            "type": "A5",
                                            "catalogueMethod": "conjugacy-classes",
                                        }
                                    },
                                }
                            ]
                        },
                    },
                    sort_keys=True,
                ),
                encoding="utf8",
            )

            result = campaign.replay_structured_artifacts(
                [path], matrix_hash=campaign.sha256_json(matrix()), max_results=4
            )

        self.assertEqual(result["targetResultCount"], 1)
        self.assertEqual(result["retainedSolutionCount"], 0)
        self.assertTrue(result["scopeComplete"])
        self.assertFalse(result["partialHomomorphismEnumerationComplete"])
        self.assertEqual(
            result["artifacts"][0]["conjugacyReductionMethods"],
            ["conjugacy-classes"],
        )

    def test_dry_run_cli_does_not_require_external_catalogues(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_path = root / "source.json"
            source_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "name": "test",
                        "rank": 4,
                        "coxeterMatrix": matrix(),
                    }
                ),
                encoding="utf8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_DIR / "order5_partial_module_campaign.py"),
                    "--dry-run",
                    "--json",
                    "--source",
                    str(source_path),
                    "--artifact-dir",
                    str(root / "artifacts"),
                    "--config-dir",
                    str(root / "configs"),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)
        self.assertEqual(report["status"], "planned-not-executed")
        self.assertEqual(report["plan"]["degreeTwoCharacters"], 3)
        self.assertFalse(report["plan"]["externalSearchesWillRun"])


if __name__ == "__main__":
    unittest.main()
