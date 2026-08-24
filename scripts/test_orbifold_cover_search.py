"""Tests for the geometry-informed Coxeter cube cover-search track."""

from __future__ import annotations

import itertools
import json
from pathlib import Path
import tempfile
import unittest

import orbifold_cover_search as cover_search


REPO_ROOT = Path(__file__).resolve().parents[1]
COMPACT_5_CUBE = REPO_ROOT / "public/examples/compact_5_cube_gamma1.json"
IDEAL_3_CUBE = REPO_ROOT / "public/examples/ideal_hyperbolic_3_cube_m3.json"


def compose(left: tuple[int, ...], right: tuple[int, ...]) -> tuple[int, ...]:
    return tuple(left[right[index]] for index in range(len(left)))


def transposition(left: int, right: int) -> tuple[int, ...]:
    result = list(range(4))
    result[left], result[right] = result[right], result[left]
    return tuple(result)


def ideal_cube_regular_s4_action() -> dict[str, object]:
    elements = sorted(itertools.permutations(range(4)))
    point_by_element = {element: index for index, element in enumerate(elements)}
    pairs = ((0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3))
    rows = []
    for left, right in pairs:
        generator = transposition(left, right)
        rows.append(
            [point_by_element[compose(element, generator)] for element in elements]
        )
    return {"degree": 24, "generatorImages": rows}


def ideal_cube_s4_target_assignment() -> list[tuple[int, ...]]:
    pairs = ((0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3))
    return [transposition(left, right) for left, right in pairs]


class CubeIncidenceTests(unittest.TestCase):
    def test_compact_cube_has_exact_vertex_catalogue_and_lower_divisor(self) -> None:
        source, matrix, _ = cover_search.load_source(COMPACT_5_CUBE)
        maximal, catalogue = cover_search.spherical_catalogue(matrix)
        cube = cover_search.cube_incidence_catalogue(matrix, maximal)

        self.assertEqual(source["rank"], 10)
        self.assertEqual(
            cube["oppositeFacetPairs"],
            [[0, 1], [2, 8], [3, 4], [5, 7], [6, 9]],
        )
        self.assertEqual(cube["dimension"], 5)
        self.assertEqual(cube["vertexCount"], 32)
        self.assertEqual(cube["sphericalVertexCount"], 32)
        self.assertEqual(cube["finiteVertexCount"], 32)
        self.assertEqual(cube["idealAffineVertexCount"], 0)
        self.assertEqual(cube["hyperidealVertexCount"], 0)
        self.assertTrue(cube["allVertexChoicesSpherical"])
        self.assertEqual(len(maximal), 32)
        self.assertEqual(catalogue["lowerBoundDivisor"], 5_760)
        self.assertTrue(all(vertex["maximalSpherical"] for vertex in cube["vertices"]))

    def test_ideal_cube_retains_ideal_vertices_and_finite_local_constraints(
        self,
    ) -> None:
        _, matrix, _ = cover_search.load_source(IDEAL_3_CUBE)
        maximal, catalogue = cover_search.spherical_catalogue(matrix)
        cube = cover_search.cube_incidence_catalogue(matrix, maximal)

        self.assertEqual(cube["oppositeFacetPairs"], [[0, 5], [1, 4], [2, 3]])
        self.assertEqual(cube["dimension"], 3)
        self.assertEqual(cube["vertexCount"], 8)
        self.assertEqual(cube["sphericalVertexCount"], 0)
        self.assertEqual(cube["finiteVertexCount"], 0)
        self.assertEqual(cube["idealAffineVertexCount"], 8)
        self.assertEqual(cube["hyperidealVertexCount"], 0)
        self.assertTrue(
            all(
                vertex["localKind"] == "ideal-affine"
                and vertex["affineType"] == "A~2"
                and vertex["finiteOrder"] is None
                and "sphericalOrder" not in vertex
                for vertex in cube["vertices"]
            )
        )
        self.assertFalse(cube["compactVertexConditionPassed"])
        self.assertEqual(len(maximal), 12)
        self.assertTrue(all(entry.type_name == "I2(3)" for entry in maximal))
        self.assertEqual(catalogue["lowerBoundDivisor"], 6)

    def test_rational_indefinite_vertex_choices_are_hyperideal(self) -> None:
        rank = 8
        pairs = {(0, 1), (2, 3), (4, 5), (6, 7)}
        matrix = [
            [
                1
                if left == right
                else 0
                if tuple(sorted((left, right))) in pairs
                else 3
                for right in range(rank)
            ]
            for left in range(rank)
        ]
        maximal, _ = cover_search.spherical_catalogue(matrix)
        cube = cover_search.cube_incidence_catalogue(matrix, maximal)

        self.assertEqual(cube["vertexCount"], 16)
        self.assertEqual(cube["finiteVertexCount"], 0)
        self.assertEqual(cube["idealAffineVertexCount"], 0)
        self.assertEqual(cube["hyperidealVertexCount"], 16)
        self.assertTrue(
            all(vertex["localKind"] == "hyperideal" for vertex in cube["vertices"])
        )


class DiagramAutomorphismTests(unittest.TestCase):
    def test_compact_cube_automorphisms_are_exact_and_preserve_labels(self) -> None:
        _, matrix, _ = cover_search.load_source(COMPACT_5_CUBE)
        maximal, _ = cover_search.spherical_catalogue(matrix)
        cube = cover_search.cube_incidence_catalogue(matrix, maximal)
        result = cover_search.diagram_automorphisms(matrix)
        compressed = cover_search.compress_cube_vertices(cube, result)

        self.assertTrue(result.complete)
        self.assertGreaterEqual(len(result.permutations), 1)
        self.assertTrue(
            all(
                cover_search.verify_automorphism(matrix, permutation)
                for permutation in result.permutations
            )
        )
        self.assertTrue(compressed["exact"])
        self.assertEqual(
            sum(orbit["size"] for orbit in compressed["orbits"]),
            32,
        )

    def test_ideal_cube_automorphism_search_is_not_factorial_enumeration(self) -> None:
        _, matrix, _ = cover_search.load_source(IDEAL_3_CUBE)
        result = cover_search.diagram_automorphisms(matrix)

        self.assertTrue(result.complete)
        self.assertEqual(len(result.permutations), 48)
        self.assertLess(result.nodes_visited, math_factorial(6))


def math_factorial(value: int) -> int:
    result = 1
    for factor in range(2, value + 1):
        result *= factor
    return result


class ActionValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        _, self.matrix, _ = cover_search.load_source(IDEAL_3_CUBE)
        self.maximal, catalogue = cover_search.spherical_catalogue(self.matrix)
        self.lower_bound = catalogue["lowerBoundDivisor"]
        self.cube = cover_search.cube_incidence_catalogue(self.matrix, self.maximal)

    def test_regular_s4_action_passes_all_exact_local_checks(self) -> None:
        result = cover_search.validate_action_candidate(
            ideal_cube_regular_s4_action(),
            self.matrix,
            self.maximal,
            self.cube,
            self.lower_bound,
        )

        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["degree"], 24)
        self.assertTrue(result["transitive"])
        self.assertTrue(result["torsionFreePointStabilizerCertified"])
        self.assertEqual(len(result["maximalSphericalOrbitChecks"]), 12)
        self.assertTrue(
            all(
                check["orbitSizeDistribution"] == {"6": 4}
                for check in result["maximalSphericalOrbitChecks"]
            )
        )
        self.assertTrue(
            all(not check["applicable"] for check in result["cubeVertexLocalChecks"])
        )

    def test_trivial_action_is_rejected_by_spherical_freeness(self) -> None:
        result = cover_search.validate_action_candidate(
            {"generatorImages": [[0] for _ in range(6)]},
            self.matrix,
            self.maximal,
            self.cube,
            self.lower_bound,
        )

        self.assertEqual(result["status"], "rejected")
        self.assertFalse(result["torsionFreePointStabilizerCertified"])
        self.assertIn("not divisible", " ".join(result["errors"]))

    def test_bad_compact_action_returns_unevaluated_finite_vertex_checks(self) -> None:
        _, matrix, _ = cover_search.load_source(COMPACT_5_CUBE)
        maximal, catalogue = cover_search.spherical_catalogue(matrix)
        cube = cover_search.cube_incidence_catalogue(matrix, maximal)
        result = cover_search.validate_action_candidate(
            {"degree": 1, "generatorImages": [[0] for _ in range(10)]},
            matrix,
            maximal,
            cube,
            catalogue["lowerBoundDivisor"],
        )

        self.assertEqual(result["status"], "rejected")
        self.assertEqual(len(result["cubeVertexLocalChecks"]), 32)
        self.assertTrue(
            all(
                check["applicable"] and not check["evaluated"] and not check["passed"]
                for check in result["cubeVertexLocalChecks"]
            )
        )


class DirectCoverSearchTests(unittest.TestCase):
    def setUp(self) -> None:
        _, self.matrix, self.input_hash = cover_search.load_source(IDEAL_3_CUBE)
        self.maximal, catalogue = cover_search.spherical_catalogue(self.matrix)
        self.lower_bound = catalogue["lowerBoundDivisor"]
        self.cube = cover_search.cube_incidence_catalogue(self.matrix, self.maximal)
        self.automorphisms = cover_search.diagram_automorphisms(self.matrix)
        self.vertex_orbits = cover_search.compress_cube_vertices(
            self.cube, self.automorphisms
        )

    def test_direct_s3_scope_exhaustively_finds_degree_six_cover(self) -> None:
        artifact = cover_search.build_search_artifact(
            IDEAL_3_CUBE,
            search_mode="direct",
            max_degree=24,
            direct_max_target_degree=3,
            direct_max_search_nodes=10_000,
            direct_max_target_group_order=24,
            direct_max_subgroups=100,
            direct_max_candidates=20,
        )
        result = artifact["evidence"]["directSearch"]

        self.assertEqual(artifact["status"], "candidate-found")
        self.assertEqual(
            artifact["evidence"]["detailStatus"],
            "candidate-found-direct-bounded",
        )
        self.assertTrue(artifact["complete"])
        self.assertTrue(result["scopeComplete"])
        self.assertFalse(result["globalNonexistenceClaim"])
        self.assertEqual(result["stopReason"], None)
        self.assertEqual(result["candidateCount"], 1)
        self.assertEqual(result["candidates"][0]["degree"], 6)
        self.assertTrue(
            result["candidates"][0]["validation"]["torsionFreePointStabilizerCertified"]
        )

    def test_s4_target_enumerates_nonnormal_point_stabilizers(self) -> None:
        result = cover_search.cover_actions_from_target_assignment(
            ideal_cube_s4_target_assignment(),
            self.matrix,
            self.maximal,
            self.cube,
            self.lower_bound,
            max_degree=24,
            max_target_group_order=24,
            max_subgroups=100,
        )

        self.assertTrue(result["complete"])
        self.assertEqual(result["targetGroupOrder"], 24)
        self.assertTrue(
            any(
                candidate["nonnormalCover"] and candidate["degree"] == 12
                for candidate in result["candidates"]
            )
        )
        self.assertTrue(
            all(
                candidate["validation"]["torsionFreePointStabilizerCertified"]
                for candidate in result["candidates"]
            )
        )

    def test_exhausted_tiny_scope_never_claims_global_nonexistence(self) -> None:
        artifact = cover_search.build_search_artifact(
            IDEAL_3_CUBE,
            search_mode="direct",
            max_degree=24,
            direct_max_target_degree=2,
            direct_max_search_nodes=100,
            direct_max_target_group_order=24,
            direct_max_subgroups=100,
            direct_max_candidates=20,
        )
        result = artifact["evidence"]["directSearch"]

        self.assertEqual(artifact["status"], "exhausted")
        self.assertEqual(
            artifact["evidence"]["detailStatus"],
            "bounded-scope-exhausted-no-candidate",
        )
        self.assertTrue(artifact["complete"])
        self.assertTrue(result["scopeComplete"])
        self.assertEqual(
            result["boundedOutcome"], "no-candidate-in-declared-bounded-scope"
        )
        self.assertFalse(result["globalNonexistenceClaim"])
        self.assertIn("S_k", result["scopeStatement"])

    def test_direct_frontier_checkpoint_resumes_without_restarting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "direct.checkpoint.json"
            first = cover_search.build_search_artifact(
                IDEAL_3_CUBE,
                search_mode="direct",
                max_degree=24,
                direct_max_target_degree=3,
                direct_max_search_nodes=1,
                direct_max_target_group_order=24,
                direct_max_subgroups=100,
                direct_max_candidates=20,
                checkpoint_path=checkpoint,
                checkpoint_every=1,
            )
            second = cover_search.build_search_artifact(
                IDEAL_3_CUBE,
                search_mode="direct",
                max_degree=24,
                direct_max_target_degree=3,
                direct_max_search_nodes=1,
                direct_max_target_group_order=24,
                direct_max_subgroups=100,
                direct_max_candidates=20,
                checkpoint_path=checkpoint,
                resume=True,
                checkpoint_every=1,
            )

        first_search = first["evidence"]["directSearch"]
        second_search = second["evidence"]["directSearch"]
        self.assertEqual(first_search["nodesVisitedTotal"], 1)
        self.assertEqual(second_search["nodesVisitedTotal"], 2)
        self.assertTrue(second_search["checkpoint"]["loaded"])
        self.assertTrue(second_search["checkpoint"]["resumable"])

    def test_direct_frontier_checkpoint_rejects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "direct.checkpoint.json"
            cover_search.build_search_artifact(
                IDEAL_3_CUBE,
                search_mode="direct",
                max_degree=24,
                direct_max_target_degree=3,
                direct_max_search_nodes=1,
                direct_max_target_group_order=24,
                direct_max_subgroups=100,
                direct_max_candidates=20,
                checkpoint_path=checkpoint,
                checkpoint_every=1,
            )
            payload = json.loads(checkpoint.read_text(encoding="utf8"))
            payload["nodesVisitedTotal"] = 0
            checkpoint.write_text(json.dumps(payload), encoding="utf8")

            with self.assertRaisesRegex(
                cover_search.OrbifoldCoverInputError, "artifact-hash"
            ):
                cover_search.build_search_artifact(
                    IDEAL_3_CUBE,
                    search_mode="direct",
                    max_degree=24,
                    direct_max_target_degree=3,
                    direct_max_search_nodes=1,
                    direct_max_target_group_order=24,
                    direct_max_subgroups=100,
                    direct_max_candidates=20,
                    checkpoint_path=checkpoint,
                    resume=True,
                    checkpoint_every=1,
                )


class ArtifactAndCliTests(unittest.TestCase):
    def test_dry_run_emits_required_deterministic_incomplete_contract(self) -> None:
        first = cover_search.build_search_artifact(
            COMPACT_5_CUBE,
            dry_run=True,
            max_degree=11_520,
            max_candidate_degrees=2,
        )
        second = cover_search.build_search_artifact(
            COMPACT_5_CUBE,
            dry_run=True,
            max_degree=11_520,
            max_candidate_degrees=2,
        )

        self.assertEqual(first, second)
        self.assertEqual(first["artifactType"], "coxeter-cover-search-track")
        self.assertEqual(first["track"], "geometric-orbifold-cover")
        self.assertEqual(first["status"], "planned")
        self.assertFalse(first["complete"])
        self.assertEqual(first["lowerBoundDivisor"], 5_760)
        self.assertEqual(first["candidates"], [])
        self.assertEqual(
            [
                candidate["degree"]
                for candidate in first["evidence"]["admissibleDegreePlan"]["degrees"]
            ],
            [5_760, 11_520],
        )
        self.assertEqual(len(first["inputHash"]), 64)
        self.assertEqual(len(first["artifactHash"]), 64)
        self.assertEqual(
            cover_search.with_artifact_hash(first)["artifactHash"],
            first["artifactHash"],
        )
        self.assertFalse(
            first["searchSeed"]["searchSemantics"]["incidenceConstructsAnAction"]
        )

    def test_cli_validates_an_optional_action_and_writes_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            action_path = root / "action.json"
            output_path = root / "artifact.json"
            action_path.write_text(
                json.dumps(ideal_cube_regular_s4_action()), encoding="utf8"
            )
            exit_code = cover_search.main(
                [
                    "--input",
                    str(IDEAL_3_CUBE),
                    "--output",
                    str(output_path),
                    "--action",
                    str(action_path),
                    "--max-degree",
                    "24",
                ]
            )
            artifact = json.loads(output_path.read_text(encoding="utf8"))

        self.assertEqual(exit_code, 0)
        self.assertEqual(artifact["status"], "candidate-found")
        self.assertTrue(artifact["complete"])
        self.assertTrue(
            artifact["evidence"]["actionValidation"][
                "torsionFreePointStabilizerCertified"
            ]
        )
        for key in (
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
            self.assertIn(key, artifact)

    def test_rejected_supplied_action_is_not_a_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            action_path = Path(directory) / "bad-action.json"
            action_path.write_text(
                json.dumps({"generatorImages": [[0] for _ in range(6)]}),
                encoding="utf8",
            )
            artifact = cover_search.build_search_artifact(
                IDEAL_3_CUBE,
                action_path=action_path,
                max_degree=24,
            )

        self.assertEqual(artifact["status"], "exhausted")
        self.assertEqual(
            artifact["evidence"]["detailStatus"], "supplied-action-rejected"
        )
        self.assertEqual(artifact["candidates"], [])

    def test_compact_auto_mode_is_a_fail_closed_external_handoff(self) -> None:
        artifact = cover_search.build_search_artifact(
            COMPACT_5_CUBE,
            search_mode="auto",
            max_degree=11_520,
        )
        handoff = artifact["evidence"]["externalEngineHandoff"]

        self.assertEqual(artifact["status"], "incomplete")
        self.assertEqual(
            artifact["evidence"]["detailStatus"],
            "external-engine-handoff-required",
        )
        self.assertFalse(artifact["complete"])
        self.assertEqual(artifact["bounds"]["effectiveSearchMode"], "external")
        self.assertEqual(handoff["status"], "not-executed")
        self.assertFalse(handoff["complete"])
        self.assertTrue(handoff["failClosed"])
        self.assertEqual(handoff["request"]["admissibleDegrees"], [5_760, 11_520])
        self.assertEqual(
            handoff["acceptanceContract"]["sourceInputHash"],
            artifact["inputHash"],
        )
        self.assertIsNone(artifact["evidence"]["directSearch"])


if __name__ == "__main__":
    unittest.main()
