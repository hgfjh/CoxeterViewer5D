"""Tests for the degree-5,760 spherical block-amalgam search.

The ``R0`` tests exercise the original canonical scope. ``R1``/``R2`` cover
all 210 local ``C/P`` port orbits and every one-chord overlap twist over the
``A3 x A1`` residue. ``R3`` covers exactly two changed fundamental chords
sharing one new ``C``-block. ``R4`` uses root-residue witnesses to close every
non-tree chord map and nonuniform new-residue port choice in the fixed-tree map
slice with canonical existing-side ports. ``R5`` extends the same slice through
every existing-side skeleton at transposition distance one. None is called the
full second-gluing quotient.

``build_overlap_gluing_problem(...)``
    Freeze the current partial action, local groups, and the ``K_(8,15)``
    incidence graph into an immutable problem with a deterministic hash.

``enumerate_equivariant_orbit_maps(...)``
    Return every equivariant bijection between two regular overlap orbits.

``enumerate_port_assignment_orbits(problem)``
    Return all 210 local port representatives modulo the effective C-action
    on C/P.

``enumerate_overlap_holonomy_orbits(problem, port_representative)``
    Return zero plus the 4,606 single-cycle noncanonical overlap probes.

``audit_overlap_gluing_orbits(problem, port_representatives, holonomy_by_port)``
    Prove that the representatives are disjoint and cover the raw search set.

``realize_overlap_gluing(problem, port_representative, holonomy_representative)``
    Build the new generator row before Coxeter-relation pruning.

Missing APIs skip by default. Set ``COXETER_REQUIRE_R1_API=1`` to turn those
skips into hard failures; this prevents a release from silently shipping only
``R0``.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import sys
import tempfile
from typing import Any, Callable, TypeVar
import unittest

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import block_amalgam_cover_search as search  # noqa: E402
import orbifold_cover_search as orbifold  # noqa: E402


COMPACT_CUBE = REPO_ROOT / "public/examples/compact_5_cube_gamma1.json"

R1_API_NAMES = (
    "build_overlap_gluing_problem",
    "enumerate_equivariant_orbit_maps",
    "enumerate_port_assignment_orbits",
    "enumerate_overlap_holonomy_orbits",
    "enumerate_two_chord_same_block_supports",
    "enumerate_two_chord_holonomies",
    "audit_overlap_gluing_orbits",
    "realize_overlap_gluing",
    "realize_new_residue_block_row",
    "root_port_transpositions",
    "root_witness_frontier_counts",
    "root_configuration_relation_witnesses",
)

F = TypeVar("F", bound=Callable[..., Any])


def requires_r1_api(test: F) -> F:
    """Skip the future-facing contract unless its complete API is available."""

    missing = tuple(name for name in R1_API_NAMES if not hasattr(search, name))
    if not missing:
        return test

    reason = "R1 block-amalgam API is not implemented: " + ", ".join(missing)
    if os.environ.get("COXETER_REQUIRE_R1_API") == "1":

        def fail_missing_api(self: unittest.TestCase) -> None:
            self.fail(reason)

        return fail_missing_api  # type: ignore[return-value]
    return unittest.skip(reason)(test)  # type: ignore[return-value]


def field(value: Any, name: str) -> Any:
    """Read a contract field from either a dataclass-like value or a mapping."""

    if isinstance(value, dict):
        return value[name]
    return getattr(value, name)


class IncidenceGraphTests(unittest.TestCase):
    def test_declared_graph_catalogues_have_exact_counts_and_degrees(self) -> None:
        complement = search.incidence_graphs("complement-two-regular", 8, 8)
        two_regular = search.incidence_graphs("two-regular", 15, 15)
        complete = search.incidence_graphs("complete-bipartite", 8, 15)

        self.assertEqual(len(complement), 7)
        self.assertEqual(len(two_regular), 41)
        self.assertEqual(len(complete), 1)
        for graph in complement:
            self.assertEqual([left for left, _ in graph].count(0), 6)
            self.assertEqual([right for _, right in graph].count(0), 6)
        for graph in two_regular:
            self.assertEqual([left for left, _ in graph].count(0), 2)
            self.assertEqual([right for _, right in graph].count(0), 2)
        self.assertEqual(len(complete[0]), 120)


class LocalGroupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _, cls.matrix, _ = orbifold.load_source(COMPACT_CUBE)

    def test_integral_reflection_enumeration_recovers_local_orders(self) -> None:
        expected = {
            (0, 2, 3, 5, 6): 720,
            (0, 2, 4, 5, 6): 384,
            (0, 2, 3, 6): 120,
            (0, 2, 5, 6): 48,
            (1, 3, 6, 7): 192,
        }
        for subset, order in expected.items():
            with self.subTest(subset=subset):
                group = search.build_local_group(self.matrix, subset)
                self.assertEqual(group.order, order)
                for row in group.rows.values():
                    self.assertTrue(
                        np.array_equal(row[row], np.arange(order, dtype=row.dtype))
                    )

    def test_first_r0_extension_preserves_exact_local_actions(self) -> None:
        state, groups = search.initial_anchor_state(self.matrix, 10, 5_760)
        stage = search.STAGES[0]
        graph = search.incidence_graphs(
            stage.graph_kind,
            5_760 // groups[stage.existing_subset].order,
            5_760 // groups[stage.new_subset].order,
        )[0]
        extended = search.extend_over_local_group(
            state, stage, graph, self.matrix, 5_760, groups
        )

        self.assertIsNotNone(extended)
        assert extended is not None
        self.assertTrue(search.finite_pair_relations_pass(extended.rows, self.matrix))
        self.assertTrue(
            search.subgroup_action_is_regular(
                extended.rows,
                stage.new_subset,
                groups[stage.new_subset].order,
                5_760,
            )
        )

    def test_integral_local_enumerator_fails_closed_above_simply_laced(self) -> None:
        with self.assertRaises(search.BlockAmalgamError):
            search.local_cartan(((1, 4), (4, 1)), (0, 1))


class SecondGluingContractTests(unittest.TestCase):
    """Exact tests required before the all-port/all-holonomy scope is complete."""

    @classmethod
    def setUpClass(cls) -> None:
        _, cls.matrix, _ = orbifold.load_source(COMPACT_CUBE)
        cls.anchor, cls.groups = search.initial_anchor_state(cls.matrix, 10, 5_760)
        cls.first_stage = search.STAGES[0]
        cls.second_stage = search.STAGES[1]
        cls.first_graphs = search.incidence_graphs(
            cls.first_stage.graph_kind,
            5_760 // cls.groups[cls.first_stage.existing_subset].order,
            5_760 // cls.groups[cls.first_stage.new_subset].order,
        )
        cls.second_graph = search.incidence_graphs(
            cls.second_stage.graph_kind,
            5_760 // cls.groups[cls.second_stage.existing_subset].order,
            5_760 // cls.groups[cls.second_stage.new_subset].order,
        )[0]
        cls.first_states: list[search.SearchState] = []
        for graph_index, graph in enumerate(cls.first_graphs):
            state = search.extend_over_local_group(
                cls.anchor,
                cls.first_stage,
                graph,
                cls.matrix,
                5_760,
                cls.groups,
            )
            if state is None:
                raise AssertionError(
                    f"The known R0 first-stage representative {graph_index} was rejected."
                )
            cls.first_states.append(search.SearchState(state.rows, (graph_index,)))

    def build_problem(self, first_state_index: int = 0) -> Any:
        return search.build_overlap_gluing_problem(
            self.first_states[first_state_index],
            self.second_stage,
            self.second_graph,
            self.matrix,
            5_760,
            self.groups,
        )

    @requires_r1_api
    def test_regular_overlap_orbits_have_every_equivariant_twist(self) -> None:
        """A regular P-torsor has exactly |P| equivariant identifications."""

        problem = self.build_problem()
        overlap = self.groups[self.second_stage.overlap_subset]
        standard_orbit = field(problem, "standard_ports")[0]
        current_orbit = field(problem, "current_ports")[0][0]
        maps = list(
            search.enumerate_equivariant_orbit_maps(
                self.groups[self.second_stage.new_subset].rows,
                self.first_states[0].rows,
                self.second_stage.overlap_subset,
                standard_orbit,
                current_orbit,
            )
        )

        self.assertEqual(len(maps), overlap.order)
        self.assertEqual(
            len({tuple(sorted(mapping.items())) for mapping in maps}),
            overlap.order,
        )
        standard_points = set(map(int, standard_orbit))
        current_points = set(map(int, current_orbit))
        for mapping in maps:
            self.assertEqual(set(mapping), standard_points)
            self.assertEqual(set(mapping.values()), current_points)
            for generator in self.second_stage.overlap_subset:
                standard_row = self.groups[self.second_stage.new_subset].rows[generator]
                current_row = self.first_states[0].rows[generator]
                assert current_row is not None
                for point in standard_points:
                    self.assertEqual(
                        mapping[int(standard_row[point])],
                        int(current_row[mapping[point]]),
                    )

    @requires_r1_api
    def test_port_orbits_are_deterministic_unique_and_complete(self) -> None:
        """The local C/P quotient must cover all 8! labeled bijections."""

        for first_state_index in range(len(self.first_states)):
            with self.subTest(firstStage=first_state_index):
                problem = self.build_problem(first_state_index)
                first = list(search.enumerate_port_assignment_orbits(problem))
                second = list(search.enumerate_port_assignment_orbits(problem))
                first_keys = [field(item, "canonical_key") for item in first]
                second_keys = [field(item, "canonical_key") for item in second]

                self.assertTrue(first_keys)
                self.assertEqual(first_keys, second_keys)
                self.assertEqual(len(first_keys), len(set(first_keys)))
                self.assertEqual(
                    [
                        field(item, "standard_port_to_existing_block")
                        for item in first[1:]
                    ],
                    sorted(
                        field(item, "standard_port_to_existing_block")
                        for item in first[1:]
                    ),
                )

                audit = search.audit_overlap_gluing_orbits(
                    problem,
                    first,
                    {},
                    audit_level="ports-only",
                )
                self.assertFalse(audit["complete"])
                self.assertFalse(audit["globalSecondGluingComplete"])
                self.assertTrue(audit["localPortCatalogueComplete"])
                self.assertEqual(audit["duplicateLocalPortOrbits"], 0)
                self.assertEqual(audit["missingLocalRawAssignments"], 0)
                self.assertEqual(audit["coveredLocalRawAssignments"], 40_320)
                self.assertEqual(len(first), 210)

    @requires_r1_api
    def test_single_chord_catalogue_includes_every_noncanonical_map(self) -> None:
        """R2 covers 98 chord positions and 47 noncanonical P-maps."""

        problem = self.build_problem()
        self.assertEqual(field(problem, "incidence_cycle_rank"), 98)
        port_representatives = list(search.enumerate_port_assignment_orbits(problem))
        r0_ports = [
            item
            for item in port_representatives
            if field(item, "contains_r0_canonical_assignment")
        ]
        self.assertEqual(len(r0_ports), 1)
        port_representative = r0_ports[0]
        first = list(
            search.enumerate_overlap_holonomy_orbits(problem, port_representative)
        )
        second = list(
            search.enumerate_overlap_holonomy_orbits(problem, port_representative)
        )
        keys = [field(item, "canonical_key") for item in first]

        self.assertEqual(keys, [field(item, "canonical_key") for item in second])
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(first), 1 + 98 * 47)
        self.assertEqual(
            sum(bool(field(item, "is_zero_holonomy")) for item in first), 1
        )
        self.assertTrue(
            any(not field(item, "is_zero_holonomy") for item in first),
            "K_(8,15) has cycles, so a complete search cannot stop at zero twist.",
        )

        audit = search.audit_overlap_gluing_orbits(
            problem,
            [port_representative],
            {field(port_representative, "canonical_key"): first},
            audit_level="holonomy-for-fixed-port",
        )
        self.assertFalse(audit["complete"])
        self.assertTrue(audit["singleChordProbeCatalogueComplete"])
        self.assertEqual(audit["duplicateHolonomyProbes"], 0)
        self.assertEqual(audit["missingHolonomyProbes"], 0)
        self.assertEqual(audit["expectedSingleChordProbesPerPortOrbit"], 1 + 98 * 47)

    @requires_r1_api
    def test_exact_full_space_count_and_residual_centralizers(self) -> None:
        problem = self.build_problem()
        counts = search.second_gluing_space_counts(problem)

        self.assertEqual(counts["effectiveNewResiduePortGroupOrder"], 192)
        self.assertEqual(counts["incidenceCycleRank"], 98)
        self.assertEqual(counts["distinctGeneratorRowDecimalDigits"], 317)
        self.assertEqual(
            int(counts["portSkeletonCountBeforeResidualCentralizer"]),
            math.factorial(15) ** 7 * 210**15,
        )
        centralizer_orders = [
            len(search.transitive_centralizer_records(state, self.build_problem(index)))
            for index, state in enumerate(self.first_states)
        ]
        self.assertEqual(centralizer_orders, [2, 1, 1, 1, 1, 1, 1])

    @requires_r1_api
    def test_realization_preserves_local_action_before_relation_pruning(self) -> None:
        """Port and twist choices may fail globally but must realize one exact block."""

        problem = self.build_problem()
        port_representatives = list(search.enumerate_port_assignment_orbits(problem))
        for port_representative in (
            port_representatives[0],
            port_representatives[-1],
        ):
            holonomies = list(
                search.enumerate_overlap_holonomy_orbits(problem, port_representative)
            )
            selected = [
                next(item for item in holonomies if field(item, "is_zero_holonomy"))
            ]
            selected.extend(
                item for item in holonomies if not field(item, "is_zero_holonomy")
            )
            for holonomy in selected[:2]:
                realized = search.realize_overlap_gluing(
                    problem, port_representative, holonomy
                )
                row = realized.rows[self.second_stage.new_generator]
                assert row is not None
                identity = np.arange(5_760, dtype=row.dtype)
                self.assertEqual(len(np.unique(row)), 5_760)
                self.assertTrue(np.array_equal(row[row], identity))
                self.assertTrue(
                    search.subgroup_action_is_regular(
                        realized.rows,
                        self.second_stage.new_subset,
                        self.groups[self.second_stage.new_subset].order,
                        5_760,
                    )
                )
                for generator, old_row in enumerate(self.first_states[0].rows):
                    if generator == self.second_stage.new_generator:
                        continue
                    if old_row is not None:
                        self.assertTrue(
                            np.array_equal(realized.rows[generator], old_row)
                        )

    @requires_r1_api
    def test_declared_catalogues_never_claim_the_full_double_quotient(self) -> None:
        """Finite probes must not be promoted to full second-gluing exhaustion."""

        problem = self.build_problem()
        ports = list(search.enumerate_port_assignment_orbits(problem))
        self.assertTrue(ports)
        complete_local = search.audit_overlap_gluing_orbits(problem, ports, {})
        missing = search.audit_overlap_gluing_orbits(problem, ports[:-1], {})
        duplicate = search.audit_overlap_gluing_orbits(problem, [*ports, ports[0]], {})

        self.assertTrue(complete_local["localPortCatalogueComplete"])
        self.assertFalse(complete_local["globalSecondGluingComplete"])
        self.assertFalse(missing["localPortCatalogueComplete"])
        self.assertGreater(missing["missingLocalRawAssignments"], 0)
        self.assertFalse(duplicate["localPortCatalogueComplete"])
        self.assertGreater(duplicate["duplicateLocalPortOrbits"], 0)

    @requires_r1_api
    def test_r3_support_catalogue_is_exact_deterministic_and_bounded(self) -> None:
        """R3 has 294 supports and 47^2 maps per support, no more and no less."""

        problem = self.build_problem()
        first = list(search.enumerate_two_chord_same_block_supports(problem))
        second = list(search.enumerate_two_chord_same_block_supports(problem))

        self.assertEqual(
            [support.canonical_key for support in first],
            [support.canonical_key for support in second],
        )
        self.assertEqual(len(first), 14 * math.comb(7, 2))
        self.assertEqual(len({support.canonical_key for support in first}), len(first))
        self.assertEqual(
            sum(support.nonidentity_twist_count for support in first),
            294 * 47**2,
        )
        for support in first:
            self.assertEqual(len(support.edges), 2)
            self.assertEqual({edge[0] for edge in support.edges}, {support.right_block})
            self.assertNotEqual(support.edges[0][1], support.edges[1][1])
            self.assertGreater(support.right_block, 0)
            self.assertTrue(all(edge[1] > 0 for edge in support.edges))

        probes = list(search.enumerate_two_chord_holonomies(problem, first[0]))
        self.assertEqual(len(probes), 47**2)
        self.assertEqual(len({probe.canonical_key for probe in probes}), 47**2)
        self.assertTrue(
            all(
                len(probe.assignments) == 2
                and all(twist > 0 for _, twist in probe.assignments)
                for probe in probes
            )
        )

    @requires_r1_api
    def test_r3_probe_is_a_real_two_chord_gluing(self) -> None:
        """A sampled R3 row changes one C-block and retains its exact local action."""

        problem = self.build_problem()
        canonical_port = next(
            port
            for port in search.enumerate_port_assignment_orbits(problem)
            if port.contains_r0_canonical_assignment
        )
        zero = next(search.enumerate_overlap_holonomy_orbits(problem, canonical_port))
        support = next(search.enumerate_two_chord_same_block_supports(problem))
        probe = next(search.enumerate_two_chord_holonomies(problem, support))
        baseline = search.realize_overlap_gluing(problem, canonical_port, zero)
        realized = search.realize_overlap_gluing(problem, canonical_port, probe)
        baseline_row = baseline.rows[self.second_stage.new_generator]
        realized_row = realized.rows[self.second_stage.new_generator]
        assert baseline_row is not None and realized_row is not None

        changed = set(map(int, np.flatnonzero(baseline_row != realized_row)))
        mutable_block = set(
            map(int, search.new_residue_block_points(problem, support.right_block))
        )
        self.assertTrue(changed)
        self.assertTrue(changed <= mutable_block)
        self.assertTrue(
            search.subgroup_action_is_regular(
                realized.rows,
                self.second_stage.new_subset,
                self.groups[self.second_stage.new_subset].order,
                5_760,
            )
        )

    @requires_r1_api
    def test_r3_relation_witnesses_prune_every_twist_pair_exactly(self) -> None:
        """Each branch has a failed relation walk outside every mutable C-block."""

        problem = self.build_problem()
        canonical_port = next(
            port
            for port in search.enumerate_port_assignment_orbits(problem)
            if port.contains_r0_canonical_assignment
        )
        zero = next(search.enumerate_overlap_holonomy_orbits(problem, canonical_port))
        baseline = search.realize_overlap_gluing(problem, canonical_port, zero)
        row4 = baseline.rows[self.second_stage.new_generator]
        assert row4 is not None
        for branch_index, state in enumerate(self.first_states):
            row7 = state.rows[self.first_stage.new_generator]
            assert row7 is not None
            for right_block in range(1, 15):
                region = search.new_residue_block_points(problem, right_block)
                witness = search.relation_failure_witness_avoiding_region(
                    row4, row7, 3, region
                )
                with self.subTest(branch=branch_index, right=right_block):
                    self.assertIsNotNone(witness)
                    assert witness is not None
                    self.assertNotEqual(witness.start, witness.final)
                    self.assertTrue(
                        set(witness.mutable_row_inputs).isdisjoint(map(int, region))
                    )

    @requires_r1_api
    def test_r3_residual_conjugacy_reduction_respects_the_fixed_gauge(self) -> None:
        """The only residual symmetry preserving the R3 tree gauge is identity."""

        for branch_index, state in enumerate(self.first_states):
            problem = self.build_problem(branch_index)
            records = search.transitive_centralizer_records(state, problem)
            audit = search.residual_fixed_gauge_audit(problem, records)
            with self.subTest(branch=branch_index):
                self.assertEqual(
                    audit["residualCentralizerOrder"], 2 if branch_index == 0 else 1
                )
                self.assertEqual(audit["fixedGaugeStabilizerOrder"], 1)
                self.assertTrue(audit["conjugacyReductionApplied"])

    @requires_r1_api
    def test_r4_accounting_includes_different_blocks_and_all_larger_supports(
        self,
    ) -> None:
        """The R4 count partitions all 48^98 holonomy assignments exactly."""

        problem = self.build_problem()
        counts = search.root_witness_frontier_counts(problem, 210)
        chord_count = 98
        nonidentity = 47
        all_two_supports = math.comb(chord_count, 2)
        same_block_supports = 14 * math.comb(7, 2)

        self.assertEqual(counts["fundamentalChordCount"], chord_count)
        self.assertEqual(
            counts["differentBlockTwoChordSupportCount"],
            all_two_supports - same_block_supports,
        )
        self.assertEqual(
            int(counts["differentBlockTwoChordAssignmentCount"]),
            (all_two_supports - same_block_supports) * nonidentity**2,
        )
        self.assertEqual(
            1
            + int(counts["oneChordAssignmentCount"])
            + int(counts["allTwoChordAssignmentCount"])
            + int(counts["threeOrMoreChordAssignmentCount"]),
            48**98,
        )
        self.assertEqual(
            int(counts["canonicalExistingSideParameterConfigurations"]),
            210**15 * 48**98,
        )

    @requires_r1_api
    def test_r4_every_root_local_class_has_an_immutable_relation_failure(
        self,
    ) -> None:
        """All 210 root C/P classes fail in every first-stage branch."""

        problem = self.build_problem()
        zero_indices = (0,) * len(problem.current_ports)
        root_points = set(map(int, search.new_residue_block_points(problem, 0)))
        for port_index, port in enumerate(
            search.enumerate_port_assignment_orbits(problem)
        ):
            selected, witnesses = search.root_configuration_relation_witnesses(
                problem, self.first_states, port, zero_indices
            )
            with self.subTest(portOrbit=port_index):
                self.assertEqual(set(map(int, selected)), root_points)
                self.assertTrue(all(witness is not None for witness in witnesses))
                for witness in witnesses:
                    assert witness is not None
                    self.assertTrue(set(witness.mutable_row_inputs) <= root_points)

    @requires_r1_api
    def test_r5_catalogues_every_distance_one_existing_port_skeleton(self) -> None:
        """Seven unfixed A-blocks each have C(15,2) transpositions."""

        problem = self.build_problem()
        transpositions = search.root_port_transpositions(problem)
        self.assertEqual(len(transpositions), 7 * math.comb(15, 2))
        self.assertEqual(
            sum(item.changes_root_residue for item in transpositions), 7 * 14
        )
        self.assertEqual(
            sum(not item.changes_root_residue for item in transpositions),
            7 * math.comb(14, 2),
        )
        self.assertEqual(
            len(
                {
                    (item.existing_block, item.first_port, item.second_port)
                    for item in transpositions
                }
            ),
            len(transpositions),
        )

    @requires_r1_api
    def test_r5_changed_root_port_is_realized_and_locally_pruned(self) -> None:
        """A root-changing skeleton uses the selected physical P-port exactly."""

        problem = self.build_problem()
        ports = list(search.enumerate_port_assignment_orbits(problem))
        indices = [0] * len(problem.current_ports)
        indices[3] = 11
        expected = set(map(int, problem.current_ports[3][11]))
        excluded = set(map(int, problem.current_ports[3][0]))
        for port in (ports[0], ports[-1]):
            row, selected = search.realize_new_residue_block_row(problem, port, indices)
            selected_set = set(map(int, selected))
            self.assertEqual(len(selected_set), 384)
            self.assertTrue(expected <= selected_set)
            self.assertTrue(excluded.isdisjoint(selected_set))
            self.assertTrue(np.array_equal(row[row[selected]], selected))
            _, witnesses = search.root_configuration_relation_witnesses(
                problem, self.first_states, port, indices
            )
            self.assertTrue(all(witness is not None for witness in witnesses))

        counts = search.root_witness_frontier_counts(problem, len(ports))
        self.assertEqual(
            int(counts["oneTranspositionParameterConfigurations"]),
            7 * math.comb(15, 2) * 210**15 * 48**98,
        )

    def test_second_gluing_checkpoint_is_hash_and_campaign_bound(self) -> None:
        payload = search.second_gluing_checkpoint_payload(
            "campaign-a", 17, {"probeRowsExamined": 42}, []
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "checkpoint.json"
            path.write_text(search.canonical_json(payload), encoding="utf8")
            loaded = search.load_second_gluing_checkpoint(path, "campaign-a")
            self.assertEqual(loaded["nextWorkUnit"], 17)
            with self.assertRaises(search.BlockAmalgamError):
                search.load_second_gluing_checkpoint(path, "campaign-b")

            tampered = dict(payload)
            tampered["nextWorkUnit"] = 18
            path.write_text(search.canonical_json(tampered), encoding="utf8")
            with self.assertRaises(search.BlockAmalgamError):
                search.load_second_gluing_checkpoint(path, "campaign-a")

    def test_root_witness_checkpoint_is_hash_and_campaign_bound(self) -> None:
        payload = search.root_witness_checkpoint_payload(
            "campaign-a",
            3,
            {"branchWitnessChecks": 21},
            ["a", "b", "c"],
            [{"sample": 1}],
            [],
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "checkpoint.json"
            path.write_text(search.canonical_json(payload), encoding="utf8")
            loaded = search.load_root_witness_checkpoint(path, "campaign-a")
            self.assertEqual(loaded["nextWorkUnit"], 3)
            self.assertEqual(loaded["unitDigests"], ["a", "b", "c"])
            with self.assertRaises(search.BlockAmalgamError):
                search.load_root_witness_checkpoint(path, "campaign-b")

            tampered = dict(payload)
            tampered["nextWorkUnit"] = 4
            path.write_text(search.canonical_json(tampered), encoding="utf8")
            with self.assertRaises(search.BlockAmalgamError):
                search.load_root_witness_checkpoint(path, "campaign-a")

    def test_root_witness_frontier_artifacts_are_current_and_sealed(self) -> None:
        expected = {
            "compact_5_cube_block_amalgam_r4_full_holonomy_new_ports_5760.json": {
                "scope": search.R4_SCOPE_ID,
                "witnessUnits": 210,
                "branchChecks": 1_470,
            },
            "compact_5_cube_block_amalgam_r5_one_existing_transposition_5760.json": {
                "scope": search.R5_SCOPE_ID,
                "witnessUnits": 20_790,
                "branchChecks": 145_530,
            },
        }
        implementation_hash = search.sha256_file(
            SCRIPT_DIR / "block_amalgam_cover_search.py"
        )
        for filename, contract in expected.items():
            with self.subTest(artifact=filename):
                path = SCRIPT_DIR / "certificates" / "torsion-free" / filename
                artifact = json.loads(path.read_text(encoding="utf8"))
                self.assertEqual(
                    search.seal(dict(artifact))["artifactHash"],
                    artifact["artifactHash"],
                )
                self.assertEqual(artifact["status"], "exhausted")
                self.assertTrue(artifact["complete"])
                self.assertTrue(artifact["scopeExcluded"])
                self.assertFalse(artifact["globalSecondGluingComplete"])
                self.assertEqual(
                    artifact["scope"]["certificateScopeId"], contract["scope"]
                )
                self.assertEqual(
                    artifact["proof"]["witnessUnitCount"],
                    contract["witnessUnits"],
                )
                self.assertEqual(
                    artifact["proof"]["branchWitnessCheckCount"],
                    contract["branchChecks"],
                )
                self.assertEqual(artifact["proof"]["unresolvedCount"], 0)
                self.assertEqual(
                    artifact["provenance"]["implementationHashes"]["pythonSha256"],
                    implementation_hash,
                )


if __name__ == "__main__":
    unittest.main()
