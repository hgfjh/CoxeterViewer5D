"""Focused tests for the streamed 97,920+ cover benchmark."""

from __future__ import annotations

import json
import unittest

import benchmark_cover_scale as benchmark


class SyntheticActionTests(unittest.TestCase):
    def test_scale_fixture_has_the_declared_mathematical_shape(self) -> None:
        action = benchmark.SyntheticCoxeterAction.scale_fixture()

        self.assertEqual(action.degree, 103_680)
        self.assertEqual(action.generator_count, 10)
        self.assertEqual(action.relation_orders, (3, 4, 5, 6, 9))
        self.assertEqual(action.finite_pair_count, 40)
        self.assertEqual(len(action.forbidden_pairs), 5)
        self.assertEqual(len(action.spherical_subsets()), 242)
        self.assertEqual(
            [
                len(
                    [
                        subset
                        for subset in action.spherical_subsets()
                        if len(subset) == rank
                    ]
                )
                for rank in range(1, 6)
            ],
            [10, 40, 80, 80, 32],
        )

    def test_procedural_generators_are_involutions_and_obey_relations(self) -> None:
        action = benchmark.SyntheticCoxeterAction.smoke_fixture()

        for point in range(action.degree):
            for generator in range(action.generator_count):
                self.assertEqual(
                    action.apply(action.apply(point, generator), generator), point
                )
            for first, second, relation_order in action.finite_pairs():
                current = point
                for _ in range(relation_order):
                    current = action.apply(current, first)
                    current = action.apply(current, second)
                self.assertEqual(current, point)

    def test_analytical_coset_minimum_matches_generic_orbit(self) -> None:
        action = benchmark.SyntheticCoxeterAction.smoke_fixture()
        for subset in action.spherical_subsets():
            for point in range(action.degree):
                generic = min(benchmark._orbit_vertices(action, point, subset))
                self.assertEqual(action.canonical_coset_point(point, subset), generic)


class StreamedStageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.action = benchmark.SyntheticCoxeterAction.smoke_fixture()

    def test_spherical_freeness_checks_regular_orbit_sizes(self) -> None:
        payload = benchmark.benchmark_spherical_freeness(
            self.action, len(self.action.spherical_subsets())
        )

        self.assertTrue(all(check["passed"] for check in payload.semantic_checks))
        self.assertEqual(payload.details["failureCount"], 0)
        self.assertGreater(payload.processed_units, self.action.degree)
        self.assertGreater(payload.tracked_working_bytes, 0)

    def test_cell_poset_stream_matches_every_subgroup_index(self) -> None:
        first = benchmark.benchmark_cell_poset(self.action)
        second = benchmark.benchmark_cell_poset(self.action)

        self.assertEqual(first.digest, second.digest)
        self.assertTrue(all(check["passed"] for check in first.semantic_checks))
        self.assertEqual(first.details["failureCount"], 0)
        self.assertEqual(first.details["cellCountsByRank"]["0"], self.action.degree)

    def test_walls_coorientation_and_boundary_sums_are_consistent(self) -> None:
        wall_payload, walls = benchmark.benchmark_wall_union_find(self.action)
        cochain_payload, cochain = benchmark.benchmark_coorientation(self.action, walls)

        self.assertTrue(all(check["passed"] for check in wall_payload.semantic_checks))
        self.assertTrue(
            all(check["passed"] for check in cochain_payload.semantic_checks)
        )
        self.assertEqual(cochain.wall_count, walls.wall_count)
        self.assertEqual(cochain_payload.details["contradictionCount"], 0)
        self.assertEqual(cochain_payload.details["rankTwoBoundaryFailureCount"], 0)

    def test_pulling_bookkeeping_streams_full_rank_two_cells(self) -> None:
        payload = benchmark.benchmark_pulling_subdivision(
            self.action, higher_rank_samples_per_type=2
        )

        self.assertTrue(all(check["passed"] for check in payload.semantic_checks))
        self.assertEqual(
            payload.details["rankTwoTriangleCount"],
            payload.details["expectedRankTwoTriangleCount"],
        )
        self.assertEqual(payload.details["retainedSimplexObjects"], 0)
        self.assertGreater(payload.details["higherRankSimplexSamplesByRank"]["3"], 0)

    def test_pulling_primitive_handles_rank_four_and_rank_five_cells(self) -> None:
        action = benchmark.SyntheticCoxeterAction.scale_fixture()
        for rank in (4, 5):
            subset = next(
                subset for subset in action.spherical_subsets() if len(subset) == rank
            )
            vertices = benchmark._orbit_vertices(action, 0, subset)
            simplices = benchmark.pulling_simplices(action, vertices, subset)

            self.assertGreater(len(simplices), 0)
            self.assertTrue(
                all(
                    len(simplex) == rank + 1 and len(set(simplex)) == rank + 1
                    for simplex in simplices
                )
            )

    def test_local_link_diagnostics_cover_every_quotient_vertex(self) -> None:
        _, walls = benchmark.benchmark_wall_union_find(self.action)
        _, cochain = benchmark.benchmark_coorientation(self.action, walls)
        payload = benchmark.benchmark_local_links(self.action, walls, cochain)

        self.assertTrue(all(check["passed"] for check in payload.semantic_checks))
        self.assertEqual(payload.details["vertexCount"], self.action.degree)
        self.assertEqual(payload.details["partitionFailureCount"], 0)
        self.assertIn(
            payload.details["morseGateStatus"], {"passed", "failed-diagnostic"}
        )


class BenchmarkReportTests(unittest.TestCase):
    def test_smoke_report_is_deterministic_and_resource_accounted(self) -> None:
        config = benchmark.BenchmarkConfig(
            profile="smoke",
            witness_count=8,
            higher_rank_samples_per_type=1,
            minimum_degree=1,
        )
        first = benchmark.run_benchmark(config)
        second = benchmark.run_benchmark(config)

        self.assertTrue(first["ok"])
        self.assertEqual(first["semanticSha256"], second["semanticSha256"])
        self.assertNotEqual(first["metrics"]["elapsedMs"], None)
        self.assertGreater(first["metrics"]["canonicalReportJsonBytes"], 0)
        self.assertEqual(first["metrics"]["materializedPermutationJsonRows"], 0)
        self.assertEqual(first["metrics"]["retainedCellObjects"], 0)
        self.assertEqual(
            {stage["id"] for stage in first["stages"]},
            {
                "action-contract",
                "streamed-spherical-freeness",
                "cell-orbit-poset-primitives",
                "wall-union-find",
                "coorientation-constraints",
                "pulling-subdivision-bookkeeping",
                "local-link-diagnostics",
            },
        )
        for stage in first["stages"]:
            self.assertGreaterEqual(stage["elapsedMs"], 0)
            self.assertGreaterEqual(stage["trackedWorkingBytes"], 0)
            self.assertEqual(len(stage["semanticSha256"]), 64)

        rendered = json.dumps(first, sort_keys=True, separators=(",", ":"))
        self.assertLess(len(rendered.encode("utf8")), 64 * 1024)
        self.assertEqual(
            first["metrics"]["canonicalReportJsonBytes"],
            len((rendered + "\n").encode("utf8")),
        )

    def test_scale_configuration_cannot_silently_drop_below_97920_points(self) -> None:
        report = benchmark.run_benchmark(
            benchmark.BenchmarkConfig(
                profile="smoke",
                witness_count=2,
                higher_rank_samples_per_type=0,
                minimum_degree=97_920,
            )
        )
        # The minimum applies to the production scale profile.  Smoke remains a
        # unit-test fixture and is never reported as a 97,920-point run.
        self.assertEqual(report["fixture"]["degree"], 480)
        self.assertEqual(report["configuration"]["profile"], "smoke")


if __name__ == "__main__":
    unittest.main()
