"""Pure Python tests for the bounded finite-target synthesis track."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import finite_target_synthesis as synthesis  # noqa: E402


IDEAL_CUBE = REPO_ROOT / "public" / "examples" / "ideal_hyperbolic_3_cube_m3.json"
COMPACT_CUBE = REPO_ROOT / "public" / "examples" / "compact_5_cube_gamma1.json"


def source(path: Path) -> tuple[dict, list[list[int]]]:
    raw = json.loads(path.read_text(encoding="utf8"))
    checked, matrix, _ = synthesis.parse_source_and_config(raw)
    return checked, matrix


def transposition(left: int, right: int, degree: int = 4) -> list[int]:
    result = list(range(degree))
    result[left], result[right] = result[right], result[left]
    return result


class FiniteTargetOrderTests(unittest.TestCase):
    def test_weyl_orders_are_exact(self) -> None:
        expected = {
            "A5": 720,
            "B5": 3_840,
            "D5": 1_920,
            "F4": 1_152,
            "E6": 51_840,
            "E7": 2_903_040,
            "E8": 696_729_600,
        }
        for type_name, order in expected.items():
            with self.subTest(type_name=type_name):
                self.assertEqual(synthesis.weyl_target(type_name)["order"], order)

    def test_classical_targets_must_be_explicit(self) -> None:
        with self.assertRaisesRegex(synthesis.SynthesisError, "order"):
            synthesis.classical_target(
                {"id": "psl-2-7", "family": "PSL", "dimension": 2, "fieldOrder": 7}
            )
        record = synthesis.classical_target(
            {
                "id": "psl-2-7",
                "family": "PSL",
                "dimension": 2,
                "fieldOrder": 7,
                "order": 168,
            }
        )
        self.assertEqual(record["orderSource"], "explicit-user-record")

    def test_default_plan_contains_explicit_sp4_3(self) -> None:
        targets = synthesis.build_target_specs({})
        sp4 = next(target for target in targets if target["id"] == "classical-Sp4-3")
        self.assertEqual(
            sp4,
            {
                "id": "classical-Sp4-3",
                "kind": "classical",
                "family": "Sp",
                "dimension": 4,
                "fieldOrder": 3,
                "order": 51_840,
                "orderSource": "explicit-user-record",
                "declaredPermutationDegree": None,
                "orderFormula": "3^4*(3^2-1)*(3^4-1)",
            },
        )

    def test_affine_sp4_2_target_has_exact_order_and_a5_anchor(self) -> None:
        target = synthesis.affine_classical_target(
            {
                "id": "affine-2pow4-Sp4-2",
                "family": "Sp",
                "dimension": 4,
                "fieldOrder": 2,
            }
        )
        self.assertEqual(target["linearOrder"], 720)
        self.assertEqual(target["moduleOrder"], 16)
        self.assertEqual(target["moduleCopies"], 1)
        self.assertEqual(target["moduleDimension"], 4)
        self.assertEqual(target["order"], 11_520)
        self.assertEqual(target["declaredPermutationDegree"], 16)
        self.assertEqual(target["structuralAnchorType"], "A5")

    def test_two_copy_affine_module_has_small_faithful_point_action(self) -> None:
        target = synthesis.affine_classical_target(
            {
                "id": "affine-2pow8-Sp4-2",
                "family": "Sp",
                "dimension": 4,
                "fieldOrder": 2,
                "moduleCopies": 2,
            }
        )
        self.assertEqual(target["linearOrder"], 720)
        self.assertEqual(target["moduleDimension"], 8)
        self.assertEqual(target["moduleOrder"], 256)
        self.assertEqual(target["order"], 184_320)
        self.assertEqual(target["declaredPermutationDegree"], 256)

    def test_affine_target_rejects_an_incorrect_declared_order(self) -> None:
        with self.assertRaisesRegex(synthesis.SynthesisError, "has order 11520"):
            synthesis.affine_classical_target(
                {
                    "id": "bad-affine",
                    "family": "Sp",
                    "dimension": 4,
                    "fieldOrder": 2,
                    "order": 5_760,
                }
            )

    def test_s6_block_extension_catalogues_have_exact_declared_scopes(self) -> None:
        degree_5760 = synthesis.s6_block_extension_targets([8])
        degree_11520 = synthesis.s6_block_extension_targets([16])

        self.assertEqual(len(degree_5760), 12)
        self.assertEqual(len(degree_11520), 42)
        self.assertTrue(all(target["order"] == 5_760 for target in degree_5760))
        self.assertTrue(
            all(target["order"] == 11_520 for target in degree_11520)
        )
        self.assertEqual(
            degree_5760[0]["id"], "s6-block-q8-g1-trivial"
        )
        self.assertIn(
            "s6-block-q8-g2-outer-k2",
            {target["id"] for target in degree_5760},
        )

    def test_s6_block_extension_rejects_unsealed_kernel_orbits(self) -> None:
        with self.assertRaisesRegex(synthesis.SynthesisError, "orbit range"):
            synthesis.s6_block_extension_target(8, 1, 2)
        with self.assertRaisesRegex(synthesis.SynthesisError, "orders 8 and 16"):
            synthesis.s6_block_extension_target(32, 1, 0)

    def test_a6_core_catalogues_have_exact_outer_map_orbit_counts(self) -> None:
        degree_5760 = synthesis.a6_core_extension_targets([8])
        degree_11520 = synthesis.a6_core_extension_targets([16])

        self.assertEqual(len(degree_5760), 32)
        self.assertEqual(len(degree_11520), 302)
        self.assertTrue(all(target["order"] == 5_760 for target in degree_5760))
        self.assertTrue(
            all(target["order"] == 11_520 for target in degree_11520)
        )
        self.assertEqual(
            degree_5760[0]["id"], "a6-core-d8-t6-outer-1"
        )

    def test_a6_core_catalogue_rejects_unknown_transitive_ids(self) -> None:
        with self.assertRaisesRegex(synthesis.SynthesisError, "no admissible"):
            synthesis.a6_core_extension_target(8, 5, 1)
        with self.assertRaisesRegex(synthesis.SynthesisError, "orbit range"):
            synthesis.a6_core_extension_target(8, 6, 5)


class SphericalScreenTests(unittest.TestCase):
    def setUp(self) -> None:
        self.bounds = dict(synthesis.DEFAULT_BOUNDS)

    def test_ideal_cube_s4_is_an_eligible_golden_plan(self) -> None:
        _, matrix = source(IDEAL_CUBE)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        divisor = synthesis.lower_bound_divisor(spherical)
        plan = synthesis.screen_target(
            synthesis.symmetric_target(4), spherical, divisor, self.bounds
        )

        self.assertEqual(divisor, 6)
        self.assertEqual({item.type_name for item in spherical}, {"I2(3)"})
        self.assertEqual(len(spherical), 12)
        self.assertEqual(plan["screen"]["status"], "eligible")
        self.assertTrue(plan["boundedSearch"]["eligible"])
        self.assertEqual(plan["degreeSemantics"]["ambientPermutationDegree"], 4)
        self.assertEqual(plan["degreeSemantics"]["kernelIndexIfSurjective"], "24")
        self.assertIsNone(plan["degreeSemantics"]["transitiveCosetCoverDegree"])

    def test_compact_cube_has_lower_divisor_5760(self) -> None:
        _, matrix = source(COMPACT_CUBE)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        divisor = synthesis.lower_bound_divisor(spherical)

        self.assertEqual(len(spherical), 32)
        self.assertEqual(divisor, 5_760)
        s4 = synthesis.screen_target(
            synthesis.symmetric_target(4), spherical, divisor, self.bounds
        )
        e6 = synthesis.screen_target(
            synthesis.weyl_target("E6"), spherical, divisor, self.bounds
        )
        self.assertEqual(s4["screen"]["status"], "rejected")
        self.assertEqual(e6["screen"]["status"], "eligible")
        self.assertTrue(
            all(
                check["dividesTargetOrder"]
                for check in e6["screen"]["localSphericalOrderChecks"]
            )
        )
        distinct = synthesis.distinct_spherical_type_records(matrix, spherical)
        self.assertEqual(len(distinct), 9)
        self.assertEqual(
            {(item["type"], item["order"]) for item in distinct},
            {
                ("A1 x A1 x A1 x A1 x A1", 32),
                ("A1 x A1 x A1 x I2(3)", 48),
                ("A3 x A1 x A1", 96),
                ("A1 x A3 x A1", 96),
                ("D4 x A1", 384),
                ("A1 x I2(3) x I2(3)", 72),
                ("A4 x A1", 240),
                ("A5", 720),
                ("I2(3) x A1 x I2(3)", 72),
            },
        )


class ContainmentPrecheckTests(unittest.TestCase):
    def setUp(self) -> None:
        _, matrix = source(IDEAL_CUBE)
        self.bounds = dict(synthesis.DEFAULT_BOUNDS)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        self.types = synthesis.distinct_spherical_type_records(matrix, spherical)
        self.assertEqual(len(self.types), 1)

    def raw_check(self, status: str, complete: bool) -> dict:
        return {
            "typeId": self.types[0]["id"],
            "type": self.types[0]["type"],
            "expectedOrder": self.types[0]["order"],
            "status": status,
            "complete": complete,
            "searchNodes": 12,
            "reason": "test",
            "permutationDegree": 4,
            "generators": {},
        }

    def test_contained_tuple_is_replayed_independently(self) -> None:
        raw = self.raw_check("proved-contained", True)
        raw["generators"] = {
            0: transposition(0, 1),
            1: transposition(0, 2),
        }
        gate = synthesis.containment_gate([raw], self.types, self.bounds)
        self.assertEqual(gate["status"], "passed")
        self.assertTrue(gate["passed"])
        self.assertEqual(gate["checks"][0]["faithfulTuple"]["generatedOrder"], 6)

    def test_exhaustive_absence_rejects_target(self) -> None:
        gate = synthesis.containment_gate(
            [self.raw_check("proved-absent", True)], self.types, self.bounds
        )
        self.assertEqual(gate["status"], "rejected-proved-absent")
        self.assertTrue(gate["complete"])
        self.assertFalse(gate["passed"])

    def test_bound_is_inconclusive_and_fails_closed(self) -> None:
        gate = synthesis.containment_gate(
            [self.raw_check("incomplete-on-bound", False)], self.types, self.bounds
        )
        self.assertEqual(gate["status"], "incomplete-on-bound")
        self.assertFalse(gate["complete"])
        self.assertFalse(gate["passed"])

    def test_unverified_negative_cannot_claim_absence(self) -> None:
        with self.assertRaisesRegex(synthesis.SynthesisError, "requires complete"):
            synthesis.containment_gate(
                [self.raw_check("proved-absent", False)], self.types, self.bounds
            )

    def test_line_protocol_preserves_containment_witness(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "gap.txt"
            path.write_text(
                "\n".join(
                    [
                        "HEADER|symmetric-S4|4|2.5.0|24|6|18|0|4.16.0",
                        "PRECHECK|symmetric-S4|0|local-type-0|I2(3)|6|proved-contained|true|12|faithful-simple-reflection-tuple-found|4",
                        "PRECHECK_GENERATOR|symmetric-S4|0|0|2,1,3,4",
                        "PRECHECK_GENERATOR|symmetric-S4|0|1|3,2,1,4",
                        "TARGET|symmetric-S4|exhausted|true|complete-enumeration|24|4|20|9|2|0",
                    ]
                )
                + "\n",
                encoding="utf8",
            )
            parsed = synthesis.parse_gap_output(path, "symmetric-S4")
            gate = synthesis.containment_gate(
                parsed["containmentPrechecks"], self.types, self.bounds
            )
            self.assertTrue(gate["passed"])

    def test_line_protocol_rejects_a_mismatched_search_problem(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "gap.txt"
            path.write_text(
                "\n".join(
                    [
                        "HEADER|symmetric-S4|4|2.5.0|24|6|18|0|4.16.0",
                        "TARGET|symmetric-S4|exhausted|true|complete-enumeration|24|4|20|9|2|0",
                    ]
                )
                + "\n",
                encoding="utf8",
            )
            with self.assertRaisesRegex(synthesis.SynthesisError, "sourceRank"):
                synthesis.parse_gap_output(
                    path,
                    "symmetric-S4",
                    expected_target_order=24,
                    expected_rank=10,
                    expected_pruning_count=18,
                    expected_anchor_order=0,
                )

    def test_compact_cube_structural_anchor_is_a5_and_uses_all_spherical_pruning(
        self,
    ) -> None:
        _, matrix = source(COMPACT_CUBE)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        all_spherical = synthesis.enumerate_all_spherical(matrix, self.bounds)
        plan = synthesis.structural_anchor_plan(
            matrix, spherical, synthesis.weyl_target("D6")
        )

        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(plan["type"], "A5")
        self.assertEqual(plan["expectedOrder"], 720)
        self.assertEqual(plan["sourceSubset"], [0, 2, 3, 5, 6])
        self.assertEqual(len(all_spherical), 242)
        gap_data = synthesis.gap_input(
            matrix, spherical, synthesis.weyl_target("D6"), self.bounds
        )
        self.assertIn("structuralAnchor:=rec(", gap_data)
        self.assertIn("sphericalPruningSubgroups:=", gap_data)
        self.assertIn("protocolVersion:=4", gap_data)

    def test_compact_cube_affine_sp4_2_uses_the_exact_a5_anchor(self) -> None:
        _, matrix = source(COMPACT_CUBE)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        target = synthesis.affine_classical_target(
            {
                "id": "affine-2pow4-Sp4-2",
                "family": "Sp",
                "dimension": 4,
                "fieldOrder": 2,
            }
        )
        plan = synthesis.structural_anchor_plan(matrix, spherical, target)
        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(plan["sourceSubset"], [0, 2, 3, 5, 6])
        self.assertEqual(plan["expectedOrder"], 720)
        gap_data = synthesis.gap_input(matrix, spherical, target, self.bounds)
        self.assertIn('kind:="affine-classical"', gap_data)
        self.assertIn("dimension:=4", gap_data)
        self.assertIn("fieldOrder:=2", gap_data)
        self.assertIn("moduleCopies:=1", gap_data)

    def test_compact_cube_s8_uses_the_exact_a5_anchor(self) -> None:
        _, matrix = source(COMPACT_CUBE)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        plan = synthesis.structural_anchor_plan(
            matrix, spherical, synthesis.symmetric_target(8)
        )
        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(plan["sourceSubset"], [0, 2, 3, 5, 6])
        self.assertEqual(plan["expectedOrder"], 720)
        self.assertEqual(plan["targetType"], "S8")

    def test_compact_cube_s6_block_extension_uses_exact_a5_anchor(self) -> None:
        _, matrix = source(COMPACT_CUBE)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        target = synthesis.s6_block_extension_target(8, 1, 0)
        plan = synthesis.structural_anchor_plan(matrix, spherical, target)

        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(plan["sourceSubset"], [0, 2, 3, 5, 6])
        gap_data = synthesis.gap_input(matrix, spherical, target, self.bounds)
        self.assertIn('kind:="s6-block-extension"', gap_data)
        self.assertIn("quotientOrder:=8", gap_data)
        self.assertIn("quotientId:=1", gap_data)
        self.assertIn("outerKernelOrbit:=0", gap_data)

    def test_compact_cube_a6_core_extension_uses_exact_a5_anchor(self) -> None:
        _, matrix = source(COMPACT_CUBE)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        target = synthesis.a6_core_extension_target(8, 6, 1)
        plan = synthesis.structural_anchor_plan(matrix, spherical, target)

        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(plan["sourceSubset"], [0, 2, 3, 5, 6])
        gap_data = synthesis.gap_input(matrix, spherical, target, self.bounds)
        self.assertIn('kind:="a6-core-extension"', gap_data)
        self.assertIn("blockDegree:=8", gap_data)
        self.assertIn("transitiveId:=6", gap_data)
        self.assertIn("outerMapOrbit:=1", gap_data)

    def test_gap_input_places_precheck_before_full_search(self) -> None:
        _, matrix = source(IDEAL_CUBE)
        spherical = synthesis.enumerate_spherical(matrix, self.bounds)
        text = synthesis.gap_input(
            matrix, spherical, synthesis.symmetric_target(4), self.bounds
        )
        self.assertIn("sphericalTypePrechecks", text)
        self.assertIn('typeName:="I2(3)"', text)
        self.assertIn("maxPrecheckNodesPerType", text)

    def test_artifact_does_not_search_after_incomplete_precheck(self) -> None:
        checked, matrix = source(IDEAL_CUBE)
        raw = self.raw_check("incomplete-on-bound", False)
        backend = {
            "targetId": "symmetric-S4",
            "status": "precheck-incomplete",
            "complete": False,
            "reason": "local-type-containment-precheck-hit-a-resource-bound",
            "solutions": [],
            "containmentPrechecks": [raw],
        }
        config = {
            "symmetricDegrees": [4],
            "weylTypes": [],
            "classicalTargets": [],
        }
        with patch.object(synthesis, "run_gap_target", return_value=backend):
            artifact = synthesis.build_artifact(
                checked,
                matrix,
                config,
                self.bounds,
                False,
                None,
                None,
            )
        self.assertEqual(artifact["status"], "incomplete")
        self.assertFalse(artifact["complete"])
        self.assertEqual(artifact["acceptedKernelCount"], 0)
        evidence = artifact["evidence"]["boundedSearchResults"][0]
        self.assertEqual(evidence["containmentGate"]["status"], "incomplete-on-bound")
        self.assertEqual(evidence["verifiedSolutions"], [])

    def test_artifact_rejects_only_proved_absence(self) -> None:
        checked, matrix = source(IDEAL_CUBE)
        backend = {
            "targetId": "symmetric-S4",
            "status": "precheck-rejected",
            "complete": True,
            "reason": "a-maximal-spherical-type-is-proved-absent",
            "solutions": [],
            "containmentPrechecks": [self.raw_check("proved-absent", True)],
        }
        config = {
            "symmetricDegrees": [4],
            "weylTypes": [],
            "classicalTargets": [],
        }
        with patch.object(synthesis, "run_gap_target", return_value=backend):
            artifact = synthesis.build_artifact(
                checked,
                matrix,
                config,
                self.bounds,
                False,
                None,
                None,
            )
        self.assertEqual(artifact["status"], "exhausted")
        self.assertTrue(artifact["complete"])
        plan = artifact["evidence"]["targetPlans"][0]
        self.assertEqual(plan["screen"]["status"], "rejected-local-type-absent")


class IndependentPermutationVerificationTests(unittest.TestCase):
    def setUp(self) -> None:
        _, self.matrix = source(IDEAL_CUBE)
        self.bounds = dict(synthesis.DEFAULT_BOUNDS)
        self.spherical = synthesis.enumerate_spherical(self.matrix, self.bounds)
        self.target = synthesis.symmetric_target(4)
        # Generator order follows t12,t13,t14,t23,t24,t34 in the source file.
        self.rows = [
            transposition(0, 1),
            transposition(0, 2),
            transposition(0, 3),
            transposition(1, 2),
            transposition(1, 3),
            transposition(2, 3),
        ]

    def test_s4_transpositions_pass_every_local_image_check(self) -> None:
        result = synthesis.verify_solution(
            {
                "permutationDegree": 4,
                "imageOrder": 24,
                "generators": {index: row for index, row in enumerate(self.rows)},
            },
            self.target,
            self.matrix,
            self.spherical,
            self.bounds,
        )

        self.assertTrue(result["accepted"])
        self.assertTrue(result["finiteQuotient"]["kernelTorsionFree"])
        self.assertEqual(result["finiteQuotient"]["kernelIndex"], "24")
        self.assertEqual(result["permutationDegree"], 4)
        self.assertTrue(
            all(item["passed"] for item in result["maximalSphericalImageChecks"])
        )

    def test_non_involution_fails_closed(self) -> None:
        bad = [row[:] for row in self.rows]
        bad[0] = [1, 2, 0, 3]
        result = synthesis.verify_solution(
            {
                "permutationDegree": 4,
                "imageOrder": 24,
                "generators": {index: row for index, row in enumerate(bad)},
            },
            self.target,
            self.matrix,
            self.spherical,
            self.bounds,
        )
        self.assertFalse(result["accepted"])
        self.assertFalse(result["involutionChecks"][0]["passed"])


class ArtifactTests(unittest.TestCase):
    def test_dry_run_is_hash_bound_and_explicitly_incomplete(self) -> None:
        checked, matrix = source(IDEAL_CUBE)
        config = {
            "symmetricDegrees": [4],
            "weylTypes": [],
            "classicalTargets": [],
        }
        first = synthesis.build_artifact(
            checked,
            matrix,
            config,
            dict(synthesis.DEFAULT_BOUNDS),
            True,
            None,
            None,
        )
        second = synthesis.build_artifact(
            checked,
            matrix,
            config,
            dict(synthesis.DEFAULT_BOUNDS),
            True,
            None,
            None,
        )
        self.assertEqual(first, second)
        self.assertEqual(first["artifactType"], "coxeter-cover-search-track")
        self.assertEqual(first["track"], "finite-target-synthesis")
        self.assertEqual(first["status"], "planned")
        self.assertFalse(first["complete"])
        self.assertEqual(len(first["artifactHash"]), 64)
        unsealed = dict(first)
        supplied = unsealed.pop("artifactHash")
        self.assertEqual(supplied, synthesis.sha256_json(unsealed))

    def test_cli_emits_one_json_object_with_required_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            request = root / "request.json"
            output = root / "result.json"
            value = json.loads(IDEAL_CUBE.read_text(encoding="utf8"))
            request.write_text(
                json.dumps(
                    {
                        "sourceSystem": value,
                        "finiteTargetSynthesis": {
                            "symmetricDegrees": [4],
                            "weylTypes": [],
                            "classicalTargets": [],
                        },
                    }
                ),
                encoding="utf8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_DIR / "finite_target_synthesis.py"),
                    "--input",
                    str(request),
                    "--output",
                    str(output),
                    "--dry-run",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            artifact = json.loads(output.read_text(encoding="utf8"))
            for field in (
                "schemaVersion",
                "artifactType",
                "track",
                "status",
                "complete",
                "sourceSystem",
                "inputHash",
                "lowerBoundDivisor",
                "bounds",
                "candidates",
                "evidence",
                "warnings",
                "errors",
                "artifactHash",
            ):
                self.assertIn(field, artifact)

    def test_stale_checkpoint_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "checkpoint.json"
            path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "artifactType": synthesis.CHECKPOINT_TYPE,
                        "inputHash": "a" * 64,
                        "implementationHashes": {},
                        "records": {},
                    }
                ),
                encoding="utf8",
            )
            with self.assertRaisesRegex(synthesis.SynthesisError, "stale"):
                synthesis.load_checkpoint(path, "b" * 64, {"pythonSha256": "c" * 64})

    def test_transient_runtime_failure_is_retried_on_resume(self) -> None:
        checked, matrix = source(IDEAL_CUBE)
        config = {
            "symmetricDegrees": [4],
            "weylTypes": [],
            "classicalTargets": [],
        }
        bounds = dict(synthesis.DEFAULT_BOUNDS)
        with tempfile.TemporaryDirectory() as temporary:
            checkpoint = Path(temporary) / "checkpoint.json"
            hashes = synthesis.implementation_hashes()
            problem_hash = synthesis.sha256_json(
                {
                    "sourceSystem": checked,
                    "matrix": matrix,
                    "targets": synthesis.build_target_specs(config),
                    "bounds": bounds,
                }
            )
            synthesis.save_checkpoint(
                checkpoint,
                {
                    "schemaVersion": 1,
                    "artifactType": synthesis.CHECKPOINT_TYPE,
                    "inputHash": problem_hash,
                    "implementationHashes": hashes,
                    "records": {
                        "symmetric-S4": {
                            "targetId": "symmetric-S4",
                            "status": "runtime-failed",
                            "complete": False,
                            "solutions": [],
                        }
                    },
                },
            )
            replacement = {
                "targetId": "symmetric-S4",
                "status": "runtime-failed",
                "complete": False,
                "solutions": [],
            }
            with patch.object(
                synthesis, "run_gap_target", return_value=replacement
            ) as run:
                synthesis.build_artifact(
                    checked,
                    matrix,
                    config,
                    bounds,
                    False,
                    None,
                    checkpoint,
                )
            run.assert_called_once()


if __name__ == "__main__":
    unittest.main()
