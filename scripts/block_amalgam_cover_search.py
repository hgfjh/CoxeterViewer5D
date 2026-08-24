#!/usr/bin/env python3
"""Search a finite, exact residue-gluing scope at cover degree 5,760.

The anchor ``<g0,g2,g3,g5,g6>`` is the finite Coxeter group ``A5 = S6``.
In a torsion-free degree-5,760 action it has eight regular orbits.  This script
fixes that action up to conjugacy, then adjoins the other five generators by
gluing regular spherical actions over their common parabolic subgroups.

R0 uses simple block incidence, one sorted-label embedding of each abstract
incidence type, and minimum-root overlap maps. R1--R3 enlarge bounded local
port and holonomy strata. R4 closes every non-tree chord map and new-residue
local-port choice in the fixed standard-tree map slice by proving a relation
failure inside one root residue. R5 extends that local obstruction through every
existing-side port skeleton one transposition from canonical. Each artifact states its exact
scope; none is a classification of all degree-5,760 actions. Every survivor is
independently replayed by the general orbifold action certifier.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import sys
import time
from typing import Any, Iterable, Mapping, Sequence

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import orbifold_cover_search as orbifold  # noqa: E402
import torsion_free_discovery as shared  # noqa: E402


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "coxeter-block-amalgam-cover-search"
BACKEND_VERSION = "1.1.0"
SCOPE_ID = "R0-sorted-incidence-zero-overlap-twist"
SECOND_GLUING_BACKEND_VERSION = "3.0.0"
ROOT_WITNESS_BACKEND_VERSION = "1.1.0"
R1_SCOPE_ID = "R1-all-local-C-over-P-port-orbits-zero-twist"
R2_SCOPE_ID = "R2-canonical-port-single-chord-noncanonical-overlap-map"
R3_SCOPE_ID = "R3-canonical-port-two-chords-one-C-block"
R4_SCOPE_ID = "R4-canonical-existing-ports-fixed-tree-map-slice"
R5_SCOPE_ID = "R5-one-existing-port-transposition-fixed-tree-map-slice"
DEFAULT_DEGREE = 5_760
UINT_DTYPE = np.uint16


class BlockAmalgamError(ValueError):
    """Raised when a source or residue gluing violates the declared scope."""


@dataclass(frozen=True)
class LocalCoxeterGroup:
    subset: tuple[int, ...]
    order: int
    rows: dict[int, np.ndarray]


@dataclass(frozen=True)
class SearchState:
    rows: tuple[np.ndarray | None, ...]
    choices: tuple[int, ...]


@dataclass(frozen=True)
class ExtensionStage:
    name: str
    new_generator: int
    existing_subset: tuple[int, ...]
    new_subset: tuple[int, ...]
    overlap_subset: tuple[int, ...]
    graph_kind: str
    expected_graph_count: int


@dataclass(frozen=True)
class OverlapGluingProblem:
    """Exact local data for adjoining one spherical residue.

    ``standard_ports`` are the P-orbits in one regular copy of the new local
    group. ``current_ports[u]`` are the P-orbits in existing block ``u``.
    The arrays retain point ids because a torsor twist is an equivariant map,
    not merely a permutation of the block-incidence graph.
    """

    state: SearchState
    stage: ExtensionStage
    matrix: tuple[tuple[int, ...], ...]
    degree: int
    local_groups: Mapping[tuple[int, ...], LocalCoxeterGroup]
    standard_ports: tuple[np.ndarray, ...]
    current_ports: tuple[tuple[np.ndarray, ...], ...]
    incidence_cycle_rank: int
    problem_hash: str


@dataclass(frozen=True)
class LocalPortOrbit:
    """One orbit of bijections C/P -> the eight labeled existing blocks."""

    canonical_key: str
    standard_port_to_existing_block: tuple[int, ...]
    orbit_size: int
    contains_r0_canonical_assignment: bool
    claim_scope: str = "one-new-C-block-local-port-action"


@dataclass(frozen=True)
class OverlapHolonomyProbe:
    """One single-chord overlap-map probe.

    The zero probe changes no overlap map. A nonzero probe changes one chord
    outside a fixed spanning tree of K_(8,15). The existing-side gauge is not
    an independent P at every block, so this must not be advertised as a full
    Hom(F_98,P)/P holonomy classification.
    """

    canonical_key: str
    edge: tuple[int, int] | None
    twist_index: int
    is_zero_holonomy: bool
    claim_scope: str = "single-chord-noncanonical-overlap-map"


@dataclass(frozen=True)
class TwoChordSupport:
    """An unordered pair of fundamental chords in one new C-block."""

    canonical_key: str
    right_block: int
    edges: tuple[tuple[int, int], tuple[int, int]]
    nonidentity_twist_count: int
    claim_scope: str = "two-fundamental-chords-sharing-one-new-C-block"


@dataclass(frozen=True)
class MultiChordHolonomyProbe:
    """Nonidentity overlap maps on every chord in a bounded support."""

    canonical_key: str
    assignments: tuple[tuple[tuple[int, int], int], ...]
    claim_scope: str = "two-chord-noncanonical-overlap-maps"


@dataclass(frozen=True)
class RelationAvoidanceWitness:
    """A failed relation walk that never reads the mutable part of a row."""

    start: int
    final: int
    mutable_row_inputs: tuple[int, ...]


@dataclass(frozen=True)
class RootPortTransposition:
    """One distance-one change of the existing-side port skeleton.

    The first existing A-block is fixed by the gauge.  A transposition in one
    of the other seven blocks exchanges two of its fifteen incident C-blocks.
    """

    existing_block: int
    first_port: int
    second_port: int

    @property
    def changes_root_residue(self) -> bool:
        return self.first_port == 0 or self.second_port == 0


STAGES = (
    ExtensionStage(
        "g7-over-A4",
        7,
        (0, 2, 3, 5, 6),
        (0, 2, 3, 6, 7),
        (0, 2, 3, 6),
        "complement-two-regular",
        7,
    ),
    ExtensionStage(
        "g4-over-A3xA1",
        4,
        (0, 2, 3, 5, 6),
        (0, 2, 4, 5, 6),
        (0, 2, 5, 6),
        "complete-bipartite",
        1,
    ),
    ExtensionStage(
        "g1-over-A4",
        1,
        (0, 2, 4, 6, 7),
        (1, 2, 4, 6, 7),
        (2, 4, 6, 7),
        "complement-two-regular",
        7,
    ),
    ExtensionStage(
        "g8-over-D4",
        8,
        (1, 2, 3, 6, 7),
        (1, 3, 6, 7, 8),
        (1, 3, 6, 7),
        "two-regular",
        41,
    ),
    ExtensionStage(
        "g9-over-D4",
        9,
        (0, 2, 4, 5, 6),
        (0, 2, 4, 5, 9),
        (0, 2, 4, 5),
        "two-regular",
        41,
    ),
)


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def seal(value: dict[str, Any]) -> dict[str, Any]:
    value.pop("artifactHash", None)
    value["artifactHash"] = sha256_json(value)
    return value


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf8",
    )
    os.replace(temporary, path)


def integer_partitions_minimum(total: int, minimum: int = 2) -> list[tuple[int, ...]]:
    """Return unordered partitions with all parts at least ``minimum``."""

    result: list[tuple[int, ...]] = []

    def visit(remaining: int, lower: int, prefix: tuple[int, ...]) -> None:
        if remaining == 0:
            result.append(prefix)
            return
        for part in range(lower, remaining + 1):
            if remaining - part == 0 or remaining - part >= part:
                visit(remaining - part, part, (*prefix, part))

    visit(total, minimum, ())
    return result


def two_regular_bipartite_edges(partition: Sequence[int]) -> list[tuple[int, int]]:
    """Build one labeled bipartite cycle union for a partition of each shore."""

    edges: list[tuple[int, int]] = []
    offset = 0
    for size in partition:
        for index in range(size):
            left = offset + index
            edges.append((left, left))
            edges.append((left, offset + (index + 1) % size))
        offset += size
    return sorted(edges)


def incidence_graphs(
    kind: str, left_count: int, right_count: int
) -> list[list[tuple[int, int]]]:
    if kind == "complete-bipartite":
        return [
            [
                (left, right)
                for left in range(left_count)
                for right in range(right_count)
            ]
        ]
    if left_count != right_count:
        raise BlockAmalgamError(f"{kind} needs equal block counts.")
    partitions = integer_partitions_minimum(left_count)
    if kind == "two-regular":
        return [two_regular_bipartite_edges(partition) for partition in partitions]
    if kind == "complement-two-regular":
        complete = {
            (left, right) for left in range(left_count) for right in range(right_count)
        }
        return [
            sorted(complete - set(two_regular_bipartite_edges(partition)))
            for partition in partitions
        ]
    raise BlockAmalgamError(f"Unknown incidence graph kind {kind!r}.")


def local_cartan(
    matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> tuple[tuple[int, ...], ...]:
    unsupported = sorted(
        {
            int(matrix[left][right])
            for left in subset
            for right in subset
            if left != right and int(matrix[left][right]) not in {2, 3}
        }
    )
    if unsupported:
        raise BlockAmalgamError(
            "The integral local-group enumerator currently supports only "
            f"simply-laced spherical residues; found labels {unsupported}."
        )
    return tuple(
        tuple(
            2 if left == right else -1 if matrix[left][right] == 3 else 0
            for right in subset
        )
        for left in subset
    )


def matrix_product(
    left: tuple[int, ...], right: tuple[int, ...], rank: int
) -> tuple[int, ...]:
    return tuple(
        sum(
            left[row * rank + inner] * right[inner * rank + column]
            for inner in range(rank)
        )
        for row in range(rank)
        for column in range(rank)
    )


def reflection_matrices(cartan: Sequence[Sequence[int]]) -> list[tuple[int, ...]]:
    rank = len(cartan)
    result: list[tuple[int, ...]] = []
    for reflection in range(rank):
        matrix = [
            1 if row == column else 0 for row in range(rank) for column in range(rank)
        ]
        for column in range(rank):
            matrix[reflection * rank + column] -= cartan[column][reflection]
        result.append(tuple(matrix))
    return result


def build_local_group(
    matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> LocalCoxeterGroup:
    ordered = tuple(subset)
    classified = shared.classify_spherical_subset(matrix, ordered)
    if classified is None:
        raise BlockAmalgamError(f"Subset {ordered} is not spherical.")
    rank = len(ordered)
    identity = tuple(
        1 if row == column else 0 for row in range(rank) for column in range(rank)
    )
    reflections = reflection_matrices(local_cartan(matrix, ordered))
    elements = [identity]
    index_by_element = {identity: 0}
    cursor = 0
    transition_rows = [[0] for _ in ordered]
    while cursor < len(elements):
        element = elements[cursor]
        for local_index, reflection in enumerate(reflections):
            product = matrix_product(element, reflection, rank)
            target = index_by_element.get(product)
            if target is None:
                if len(elements) >= classified.expected_order:
                    raise BlockAmalgamError(
                        f"Integral reflection enumeration exceeded |W_{ordered}|={classified.expected_order}."
                    )
                target = len(elements)
                index_by_element[product] = target
                elements.append(product)
                for row in transition_rows:
                    row.append(0)
            transition_rows[local_index][cursor] = target
        cursor += 1
    if len(elements) != classified.expected_order:
        raise BlockAmalgamError(
            f"Integral reflection enumeration found {len(elements)} elements for {ordered}; "
            f"expected {classified.expected_order}."
        )
    return LocalCoxeterGroup(
        subset=ordered,
        order=classified.expected_order,
        rows={
            generator: np.asarray(transition_rows[index], dtype=UINT_DTYPE)
            for index, generator in enumerate(ordered)
        },
    )


def action_orbits(
    rows: Sequence[np.ndarray | None], generators: Sequence[int], degree: int
) -> list[np.ndarray]:
    seen = np.zeros(degree, dtype=np.bool_)
    result: list[np.ndarray] = []
    for root in range(degree):
        if seen[root]:
            continue
        seen[root] = True
        queue = [root]
        cursor = 0
        while cursor < len(queue):
            point = queue[cursor]
            cursor += 1
            for generator in generators:
                row = rows[generator]
                if row is None:
                    raise BlockAmalgamError(f"Generator {generator} is not assigned.")
                target = int(row[point])
                if not seen[target]:
                    seen[target] = True
                    queue.append(target)
        result.append(np.asarray(sorted(queue), dtype=UINT_DTYPE))
    return sorted(result, key=lambda orbit: int(orbit[0]))


def orbit_partition_within(
    rows: Sequence[np.ndarray | None],
    generators: Sequence[int],
    parent_orbit: np.ndarray,
) -> list[np.ndarray]:
    allowed = np.zeros(
        len(rows[0]) if rows[0] is not None else int(parent_orbit[-1]) + 1,
        dtype=np.bool_,
    )
    allowed[parent_orbit] = True
    seen: set[int] = set()
    result: list[np.ndarray] = []
    for raw_root in parent_orbit:
        root = int(raw_root)
        if root in seen:
            continue
        seen.add(root)
        queue = [root]
        cursor = 0
        while cursor < len(queue):
            point = queue[cursor]
            cursor += 1
            for generator in generators:
                row = rows[generator]
                if row is None:
                    raise BlockAmalgamError(f"Generator {generator} is not assigned.")
                target = int(row[point])
                if not allowed[target]:
                    raise BlockAmalgamError(
                        "An overlap orbit left its parent local orbit."
                    )
                if target not in seen:
                    seen.add(target)
                    queue.append(target)
        result.append(np.asarray(sorted(queue), dtype=UINT_DTYPE))
    return sorted(result, key=lambda orbit: int(orbit[0]))


def equivariant_orbit_map(
    standard_rows: Mapping[int, np.ndarray],
    current_rows: Sequence[np.ndarray | None],
    generators: Sequence[int],
    standard_orbit: np.ndarray,
    current_orbit: np.ndarray,
) -> dict[int, int]:
    standard_root = int(standard_orbit[0])
    current_root = int(current_orbit[0])
    mapping = {standard_root: current_root}
    queue = deque([standard_root])
    while queue:
        standard_point = queue.popleft()
        current_point = mapping[standard_point]
        for generator in generators:
            standard_target = int(standard_rows[generator][standard_point])
            row = current_rows[generator]
            if row is None:
                raise BlockAmalgamError(f"Generator {generator} is not assigned.")
            current_target = int(row[current_point])
            previous = mapping.get(standard_target)
            if previous is None:
                mapping[standard_target] = current_target
                queue.append(standard_target)
            elif previous != current_target:
                raise BlockAmalgamError("The canonical overlap map is not equivariant.")
    if len(mapping) != len(standard_orbit) or set(mapping.values()) != set(
        map(int, current_orbit)
    ):
        raise BlockAmalgamError("The overlap map did not cover both regular P-orbits.")
    return mapping


def equivariant_orbit_map_from_roots(
    standard_rows: Mapping[int, np.ndarray],
    current_rows: Sequence[np.ndarray | None],
    generators: Sequence[int],
    standard_orbit: np.ndarray,
    current_orbit: np.ndarray,
    current_root: int,
) -> dict[int, int]:
    """Return the unique P-map taking the standard root to ``current_root``.

    Both orbits are regular P-torsors.  Consequently every target point gives
    one equivariant bijection, and these are all the possible overlap twists.
    """

    current_points = set(map(int, current_orbit))
    if current_root not in current_points:
        raise BlockAmalgamError("The requested overlap root is outside its P-orbit.")
    standard_root = int(standard_orbit[0])
    mapping = {standard_root: current_root}
    queue = deque([standard_root])
    while queue:
        standard_point = queue.popleft()
        current_point = mapping[standard_point]
        for generator in generators:
            standard_target = int(standard_rows[generator][standard_point])
            row = current_rows[generator]
            if row is None:
                raise BlockAmalgamError(f"Generator {generator} is not assigned.")
            current_target = int(row[current_point])
            previous = mapping.get(standard_target)
            if previous is None:
                mapping[standard_target] = current_target
                queue.append(standard_target)
            elif previous != current_target:
                raise BlockAmalgamError("An overlap-root map is not P-equivariant.")
    if len(mapping) != len(standard_orbit) or set(mapping.values()) != current_points:
        raise BlockAmalgamError("An overlap-root map did not cover both P-torsors.")
    return mapping


def enumerate_equivariant_orbit_maps(
    standard_rows: Mapping[int, np.ndarray],
    current_rows: Sequence[np.ndarray | None],
    generators: Sequence[int],
    standard_orbit: np.ndarray,
    current_orbit: np.ndarray,
) -> Iterable[dict[int, int]]:
    """Enumerate all equivariant maps between two regular P-orbits."""

    for current_root in sorted(map(int, current_orbit)):
        yield equivariant_orbit_map_from_roots(
            standard_rows,
            current_rows,
            generators,
            standard_orbit,
            current_orbit,
            current_root,
        )


def build_overlap_gluing_problem(
    state: SearchState,
    stage: ExtensionStage,
    graph: Sequence[tuple[int, int]],
    matrix: Sequence[Sequence[int]],
    degree: int,
    local_groups: Mapping[tuple[int, ...], LocalCoxeterGroup],
) -> OverlapGluingProblem:
    """Freeze the exact second-stage K_(8,15) overlap data.

    This builder validates the block degrees instead of assuming that sorted
    point ids happen to describe the intended residue incidence.
    """

    existing = local_groups[stage.existing_subset]
    new = local_groups[stage.new_subset]
    overlap = local_groups[stage.overlap_subset]
    existing_blocks = action_orbits(state.rows, stage.existing_subset, degree)
    current_ports = tuple(
        tuple(orbit_partition_within(state.rows, stage.overlap_subset, block))
        for block in existing_blocks
    )
    standard_rows: tuple[np.ndarray | None, ...] = tuple(
        new.rows.get(index) for index in range(len(state.rows))
    )
    standard_ports = tuple(
        orbit_partition_within(
            standard_rows,
            stage.overlap_subset,
            np.arange(new.order, dtype=UINT_DTYPE),
        )
    )
    expected_edges = degree // overlap.order
    if len(graph) != expected_edges or len(set(graph)) != expected_edges:
        raise BlockAmalgamError("The overlap graph does not have one edge per P-orbit.")
    if len(existing_blocks) != degree // existing.order:
        raise BlockAmalgamError("The existing residue does not act in regular blocks.")
    if any(len(ports) != existing.order // overlap.order for ports in current_ports):
        raise BlockAmalgamError("An existing block has the wrong number of P-ports.")
    if len(standard_ports) != new.order // overlap.order:
        raise BlockAmalgamError("The new residue has the wrong number of P-ports.")
    left_vertices = degree // existing.order
    right_vertices = degree // new.order
    cycle_rank = len(graph) - left_vertices - right_vertices + 1
    if cycle_rank < 0:
        raise BlockAmalgamError("The overlap incidence graph is disconnected.")
    problem_hash = sha256_json(
        {
            "backendVersion": SECOND_GLUING_BACKEND_VERSION,
            "stage": stage.__dict__,
            "degree": degree,
            "matrix": matrix,
            "choices": state.choices,
            "graph": sorted(tuple(map(int, edge)) for edge in graph),
            "assignedRows": [
                hashlib.sha256(row.tobytes()).hexdigest() if row is not None else None
                for row in state.rows
            ],
        }
    )
    return OverlapGluingProblem(
        state=state,
        stage=stage,
        matrix=tuple(tuple(map(int, row)) for row in matrix),
        degree=degree,
        local_groups=local_groups,
        standard_ports=standard_ports,
        current_ports=current_ports,
        incidence_cycle_rank=cycle_rank,
        problem_hash=problem_hash,
    )


def induced_new_residue_port_group(
    problem: OverlapGluingProblem,
) -> tuple[tuple[int, ...], ...]:
    """Return the effective C-action on C/P.

    The kernel is the core of P in C.  For the compact-cube second gluing it is
    the central A1, so the order is 384/2 = 192.
    """

    new = problem.local_groups[problem.stage.new_subset]
    full = np.arange(new.order, dtype=UINT_DTYPE)
    rows: tuple[np.ndarray | None, ...] = tuple(
        new.rows.get(index) for index in range(len(problem.state.rows))
    )
    port_by_point = np.empty(new.order, dtype=np.int16)
    for port_index, port in enumerate(problem.standard_ports):
        port_by_point[port] = port_index
    induced: set[tuple[int, ...]] = set()
    for root in range(new.order):
        mapping = equivariant_orbit_map_from_roots(
            new.rows,
            rows,
            problem.stage.new_subset,
            full,
            full,
            root,
        )
        permutation = tuple(
            int(port_by_point[mapping[int(port[0])]]) for port in problem.standard_ports
        )
        induced.add(permutation)
    return tuple(sorted(induced))


def enumerate_port_assignment_orbits(
    problem: OverlapGluingProblem,
) -> Iterable[LocalPortOrbit]:
    """Enumerate the 210 local C/P port orbits exactly.

    This is deliberately a *local* quotient: the eight existing A-blocks are
    labeled by the already fixed first-stage action.  A full second-gluing
    skeleton chooses compatible local data at all fifteen C-blocks and all
    eight A-blocks; its exact count is recorded separately and is far too large
    to materialize before relation propagation.
    """

    port_count = len(problem.standard_ports)
    if port_count != len(problem.current_ports):
        raise BlockAmalgamError(
            "Local port-orbit enumeration expects K_(n,m) incidence."
        )
    frame_group = induced_new_residue_port_group(problem)
    identity = tuple(range(port_count))
    remaining = set(itertools.permutations(range(port_count)))
    representatives: list[LocalPortOrbit] = []
    while remaining:
        seed = min(remaining)
        orbit = {
            tuple(seed[frame[port]] for port in range(port_count))
            for frame in frame_group
        }
        remaining.difference_update(orbit)
        contains_identity = identity in orbit
        representative = identity if contains_identity else min(orbit)
        representatives.append(
            LocalPortOrbit(
                canonical_key=sha256_json(
                    {
                        "scope": "local-C-over-P-port-orbit",
                        "problemHash": problem.problem_hash,
                        "representative": representative,
                    }
                ),
                standard_port_to_existing_block=representative,
                orbit_size=len(orbit),
                contains_r0_canonical_assignment=contains_identity,
            )
        )
    representatives.sort(
        key=lambda item: (
            not item.contains_r0_canonical_assignment,
            item.standard_port_to_existing_block,
        )
    )
    yield from representatives


def fundamental_overlap_chords(
    problem: OverlapGluingProblem,
) -> tuple[tuple[int, int], ...]:
    """Return the 98 chords outside a standard spanning tree of K_(8,15)."""

    left_count = len(problem.current_ports)
    right_count = problem.degree // problem.local_groups[problem.stage.new_subset].order
    return tuple(
        (right, left)
        for right in range(1, right_count)
        for left in range(1, left_count)
    )


def enumerate_overlap_holonomy_orbits(
    problem: OverlapGluingProblem,
    port_representative: LocalPortOrbit,
) -> Iterable[OverlapHolonomyProbe]:
    """Enumerate zero plus every one-chord noncanonical P-map in R2.

    The name is retained for the public search API, but each result carries its
    narrower claim scope.  Multi-chord assignments are not collapsed into a
    fictitious Hom(F_98,P)/P quotient because the existing-side gauge is the
    residual centralizer of the first-stage action, not an independent P at
    every A-block.
    """

    del port_representative
    overlap_order = problem.local_groups[problem.stage.overlap_subset].order
    yield OverlapHolonomyProbe(
        canonical_key=sha256_json(
            {"problemHash": problem.problem_hash, "edge": None, "twist": 0}
        ),
        edge=None,
        twist_index=0,
        is_zero_holonomy=True,
    )
    for edge in fundamental_overlap_chords(problem):
        for twist_index in range(1, overlap_order):
            yield OverlapHolonomyProbe(
                canonical_key=sha256_json(
                    {
                        "problemHash": problem.problem_hash,
                        "edge": edge,
                        "twist": twist_index,
                    }
                ),
                edge=edge,
                twist_index=twist_index,
                is_zero_holonomy=False,
            )


def enumerate_two_chord_same_block_supports(
    problem: OverlapGluingProblem,
) -> Iterable[TwoChordSupport]:
    """Enumerate R3's 294 unordered two-chord supports.

    The standard spanning-tree gauge leaves chords ``(right, left)`` with
    ``right > 0`` and ``left > 0``. R3 chooses exactly two such chords with a
    common right endpoint. This is a complete catalogue for that support
    condition, not for arbitrary pairs among the 98 fundamental chords.
    """

    overlap_order = problem.local_groups[problem.stage.overlap_subset].order
    by_right: dict[int, list[tuple[int, int]]] = {}
    for edge in fundamental_overlap_chords(problem):
        by_right.setdefault(edge[0], []).append(edge)
    for right_block in sorted(by_right):
        for edges in itertools.combinations(sorted(by_right[right_block]), 2):
            yield TwoChordSupport(
                canonical_key=sha256_json(
                    {
                        "scope": R3_SCOPE_ID,
                        "problemHash": problem.problem_hash,
                        "edges": edges,
                    }
                ),
                right_block=right_block,
                edges=edges,
                nonidentity_twist_count=(overlap_order - 1) ** 2,
            )


def enumerate_two_chord_holonomies(
    problem: OverlapGluingProblem,
    support: TwoChordSupport,
) -> Iterable[MultiChordHolonomyProbe]:
    """Enumerate all ordered nonidentity P-maps on an R3 support."""

    overlap_order = problem.local_groups[problem.stage.overlap_subset].order
    for first_twist in range(1, overlap_order):
        for second_twist in range(1, overlap_order):
            assignments = (
                (support.edges[0], first_twist),
                (support.edges[1], second_twist),
            )
            yield MultiChordHolonomyProbe(
                canonical_key=sha256_json(
                    {
                        "scope": R3_SCOPE_ID,
                        "problemHash": problem.problem_hash,
                        "assignments": assignments,
                    }
                ),
                assignments=assignments,
            )


def standard_overlap_tree(problem: OverlapGluingProblem) -> frozenset[tuple[int, int]]:
    """Return the overlap edges fixed to canonical maps by the R2/R3 gauge."""

    left_count = len(problem.current_ports)
    right_count = problem.degree // problem.local_groups[problem.stage.new_subset].order
    return frozenset(
        (right, left)
        for right in range(right_count)
        for left in range(left_count)
        if right == 0 or left == 0
    )


def residual_fixed_gauge_audit(
    problem: OverlapGluingProblem,
    centralizer_records: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Measure the residual conjugacy group that preserves the chosen gauge.

    A first-stage centralizer element is usable for R3 conjugacy reduction only
    when it preserves the standard overlap tree and its canonical root maps.
    For the compact-cube branch with a centralizer of order two, the nontrivial
    element exchanges the gauge root with the opposite corner and is therefore
    not in the fixed-gauge stabilizer. The other six branches already have
    trivial residual centralizer. Recording this calculation prevents an
    unjustified division by two.
    """

    right_count = problem.degree // problem.local_groups[problem.stage.new_subset].order
    tree = standard_overlap_tree(problem)
    stabilizer_keys: list[str] = []
    for record in centralizer_records:
        port_permutation = tuple(map(int, record["overlapPortPermutation"]))
        root_coordinates = tuple(map(int, record["overlapRootCoordinates"]))
        image_tree = {
            (
                port_permutation[left * right_count + right] % right_count,
                port_permutation[left * right_count + right] // right_count,
            )
            for right, left in tree
        }
        canonical_roots_preserved = all(
            root_coordinates[left * right_count + right] == 0 for right, left in tree
        )
        if image_tree == tree and canonical_roots_preserved:
            stabilizer_keys.append(str(record["pointPermutationSha256"]))
    if not stabilizer_keys:
        raise BlockAmalgamError(
            "The identity is missing from the fixed-gauge stabilizer."
        )
    return {
        "residualCentralizerOrder": len(centralizer_records),
        "fixedGaugeStabilizerOrder": len(stabilizer_keys),
        "fixedGaugeStabilizerPermutationHashes": sorted(stabilizer_keys),
        "conjugacyReductionApplied": True,
        "claim": (
            "R3 is quotiented by the residual first-stage centralizer elements "
            "that preserve the standard overlap tree and all canonical tree maps."
        ),
    }


def new_residue_block_points(
    problem: OverlapGluingProblem, right_block: int
) -> np.ndarray:
    """Return the 384 points of one new C-block in the canonical gluing."""

    right_count = problem.degree // problem.local_groups[problem.stage.new_subset].order
    if right_block < 0 or right_block >= right_count:
        raise BlockAmalgamError("A new-residue block index is outside the gluing.")
    return np.asarray(
        sorted(
            int(point)
            for existing_ports in problem.current_ports
            for point in existing_ports[right_block]
        ),
        dtype=UINT_DTYPE,
    )


def realize_new_residue_block_row(
    problem: OverlapGluingProblem,
    port_representative: LocalPortOrbit,
    existing_port_indices: Sequence[int],
) -> tuple[np.ndarray, np.ndarray]:
    """Realize one C-block without constructing the rest of the gluing.

    ``existing_port_indices[b]`` chooses the P-port in existing A-block ``b``
    that meets this C-block.  The returned row is exact on the resulting
    384-point residue and is identity filler elsewhere.  Callers may use it
    only with a witness whose mutable-row inputs remain in the selected
    residue; the filler is not asserted to be a global generator action.
    """

    stage = problem.stage
    new = problem.local_groups[stage.new_subset]
    if len(existing_port_indices) != len(problem.current_ports):
        raise BlockAmalgamError(
            "A local C-block needs one existing-side port index per A-block."
        )
    if sorted(port_representative.standard_port_to_existing_block) != list(
        range(len(problem.current_ports))
    ):
        raise BlockAmalgamError("A local port representative is not a bijection.")

    standard_to_current: dict[int, int] = {}
    selected_points: set[int] = set()
    for standard_port_index, existing_block in enumerate(
        port_representative.standard_port_to_existing_block
    ):
        port_index = int(existing_port_indices[existing_block])
        ports = problem.current_ports[existing_block]
        if port_index < 0 or port_index >= len(ports):
            raise BlockAmalgamError(
                "An existing-side port index is outside its A-block."
            )
        standard_port = problem.standard_ports[standard_port_index]
        current_port = ports[port_index]
        selected_points.update(map(int, current_port))
        current_root = int(sorted(map(int, current_port))[0])
        standard_to_current.update(
            equivariant_orbit_map_from_roots(
                new.rows,
                problem.state.rows,
                stage.overlap_subset,
                standard_port,
                current_port,
                current_root,
            )
        )

    if len(standard_to_current) != new.order or len(selected_points) != new.order:
        raise BlockAmalgamError("The selected ports do not form one regular C-block.")
    inverse = {current: standard for standard, current in standard_to_current.items()}
    if len(inverse) != new.order:
        raise BlockAmalgamError("The local C-block identification is not bijective.")

    selected = np.asarray(sorted(selected_points), dtype=UINT_DTYPE)
    partial_row = np.arange(problem.degree, dtype=UINT_DTYPE)
    local_new_row = new.rows[stage.new_generator]
    for current, standard in inverse.items():
        partial_row[current] = standard_to_current[int(local_new_row[standard])]
    if not np.array_equal(partial_row[partial_row[selected]], selected):
        raise BlockAmalgamError("The local C-block generator is not an involution.")
    if set(map(int, partial_row[selected])) != selected_points:
        raise BlockAmalgamError("The local C-block generator leaves its residue.")
    return partial_row, selected


def root_port_transpositions(
    problem: OverlapGluingProblem,
) -> tuple[RootPortTransposition, ...]:
    """Return all 735 distance-one existing-side skeletons in the fixed gauge."""

    right_count = problem.degree // problem.local_groups[problem.stage.new_subset].order
    return tuple(
        RootPortTransposition(existing_block, first, second)
        for existing_block in range(1, len(problem.current_ports))
        for first, second in itertools.combinations(range(right_count), 2)
    )


def root_witness_frontier_counts(
    problem: OverlapGluingProblem,
    local_port_orbit_count: int,
) -> dict[str, Any]:
    """Count the exact R4/R5 parameter families without materializing rows."""

    chord_count = problem.incidence_cycle_rank
    overlap_order = problem.local_groups[problem.stage.overlap_subset].order
    nonidentity = overlap_order - 1
    right_count = problem.degree // problem.local_groups[problem.stage.new_subset].order
    same_block_supports = sum(
        1 for _ in enumerate_two_chord_same_block_supports(problem)
    )
    all_two_supports = math.comb(chord_count, 2)
    different_block_supports = all_two_supports - same_block_supports
    all_holonomy = overlap_order**chord_count
    one_chord = chord_count * nonidentity
    all_two_rows = all_two_supports * nonidentity**2
    three_or_more = all_holonomy - 1 - one_chord - all_two_rows
    new_residue_port_assignments = local_port_orbit_count**right_count
    canonical_existing_family = new_residue_port_assignments * all_holonomy
    transpositions = root_port_transpositions(problem)
    root_changing = sum(item.changes_root_residue for item in transpositions)
    root_preserving = len(transpositions) - root_changing
    return {
        "fundamentalChordCount": chord_count,
        "overlapMapChoicesPerChord": overlap_order,
        "nonidentityMapChoicesPerChangedChord": nonidentity,
        "allHolonomyAssignments": str(all_holonomy),
        "zeroSupportAssignmentCount": "1",
        "oneChordAssignmentCount": str(one_chord),
        "sameBlockTwoChordSupportCount": same_block_supports,
        "differentBlockTwoChordSupportCount": different_block_supports,
        "differentBlockTwoChordAssignmentCount": str(
            different_block_supports * nonidentity**2
        ),
        "allTwoChordAssignmentCount": str(all_two_rows),
        "threeOrMoreChordAssignmentCount": str(three_or_more),
        "newResidueBlockCount": right_count,
        "localPortOrbitChoicesPerNewResidue": local_port_orbit_count,
        "independentNewResiduePortAssignments": str(new_residue_port_assignments),
        "canonicalExistingSideParameterConfigurations": str(canonical_existing_family),
        "existingSideOneTranspositionSkeletonCount": len(transpositions),
        "rootChangingOneTranspositionSkeletonCount": root_changing,
        "rootPreservingOneTranspositionSkeletonCount": root_preserving,
        "oneTranspositionParameterConfigurations": str(
            len(transpositions) * canonical_existing_family
        ),
        "allExistingSideSkeletonCount": str(math.factorial(right_count) ** 7),
    }


def relation_failure_witness_avoiding_region(
    mutable_row: np.ndarray,
    fixed_row: np.ndarray,
    order: int,
    mutable_region: np.ndarray,
) -> RelationAvoidanceWitness | None:
    """Find a failed ``(mutable_row * fixed_row)^order`` walk outside a region.

    If a candidate row differs from ``mutable_row`` only on ``mutable_region``,
    such a walk is unchanged for every candidate. It therefore rejects an
    entire weighted family of overlap twists before a 5,760-point row is built.
    """

    degree = len(mutable_row)
    in_region = np.zeros(degree, dtype=np.bool_)
    in_region[mutable_region] = True
    points = np.arange(degree, dtype=UINT_DTYPE)
    current = points.copy()
    untouched = np.ones(degree, dtype=np.bool_)
    for _ in range(order):
        untouched &= ~in_region[current]
        current = fixed_row[mutable_row[current]]
    candidates = np.flatnonzero(untouched & (current != points))
    if not len(candidates):
        return None
    start = int(candidates[0])
    walk_inputs: list[int] = []
    point = start
    for _ in range(order):
        walk_inputs.append(point)
        point = int(fixed_row[int(mutable_row[point])])
    return RelationAvoidanceWitness(start, point, tuple(walk_inputs))


def second_gluing_space_counts(problem: OverlapGluingProblem) -> dict[str, Any]:
    """Return exact pre-centralizer counts for the K_(8,15) gluing space."""

    left_count = len(problem.current_ports)
    right_count = problem.degree // problem.local_groups[problem.stage.new_subset].order
    overlap_order = problem.local_groups[problem.stage.overlap_subset].order
    new_order = problem.local_groups[problem.stage.new_subset].order
    raw = (
        math.factorial(right_count) ** left_count
        * math.factorial(left_count) ** right_count
        * overlap_order ** (left_count * right_count)
    )
    internal_gauge = new_order**right_count * math.factorial(right_count)
    distinct_rows = raw // internal_gauge
    effective_port_group_order = len(induced_new_residue_port_group(problem))
    port_skeletons = (
        math.factorial(right_count) ** (left_count - 1)
        * (math.factorial(left_count) // effective_port_group_order) ** right_count
    )
    torsor_assignments = distinct_rows // port_skeletons
    return {
        "leftBlockCount": left_count,
        "rightBlockCount": right_count,
        "overlapOrbitCount": left_count * right_count,
        "incidenceCycleRank": problem.incidence_cycle_rank,
        "effectiveNewResiduePortGroupOrder": effective_port_group_order,
        "rawLabeledGluingCount": str(raw),
        "newResidueInternalGaugeOrder": str(internal_gauge),
        "distinctGeneratorRowsBeforeResidualCentralizer": str(distinct_rows),
        "portSkeletonCountBeforeResidualCentralizer": str(port_skeletons),
        "torsorAssignmentCountAfterPortSeparation": str(torsor_assignments),
        "distinctGeneratorRowDecimalDigits": len(str(distinct_rows)),
    }


def audit_overlap_gluing_orbits(
    problem: OverlapGluingProblem,
    port_representatives: Sequence[LocalPortOrbit],
    holonomy_by_port: Mapping[str, Sequence[OverlapHolonomyProbe]],
    *,
    audit_level: str = "declared-probe-scopes",
) -> dict[str, Any]:
    """Audit only the explicitly declared finite local/probe catalogues.

    Returning a global-completeness flag here would be mathematically false:
    port skeletons and torsors have to be reduced jointly by the residual
    first-stage centralizer.  The result therefore distinguishes local scope
    completeness from the unsearched global double quotient.
    """

    expected_local_raw = math.factorial(len(problem.standard_ports))
    port_keys = [item.canonical_key for item in port_representatives]
    duplicate_ports = len(port_keys) - len(set(port_keys))
    covered_local_raw = sum(item.orbit_size for item in port_representatives)
    result: dict[str, Any] = {
        "auditLevel": audit_level,
        "complete": False,
        "globalSecondGluingComplete": False,
        "localPortCatalogueComplete": (
            duplicate_ports == 0 and covered_local_raw == expected_local_raw
        ),
        "localRawAssignmentCount": expected_local_raw,
        "coveredLocalRawAssignments": covered_local_raw,
        "duplicateLocalPortOrbits": duplicate_ports,
        "missingLocalRawAssignments": max(0, expected_local_raw - covered_local_raw),
    }
    if holonomy_by_port:
        expected_probe_count = 1 + problem.incidence_cycle_rank * (
            problem.local_groups[problem.stage.overlap_subset].order - 1
        )
        duplicate_holonomies = 0
        missing_holonomies = 0
        for port in port_representatives:
            probes = holonomy_by_port.get(port.canonical_key, ())
            keys = [probe.canonical_key for probe in probes]
            duplicate_holonomies += len(keys) - len(set(keys))
            missing_holonomies += max(0, expected_probe_count - len(set(keys)))
        result.update(
            {
                "singleChordProbeCatalogueComplete": (
                    duplicate_holonomies == 0 and missing_holonomies == 0
                ),
                "expectedSingleChordProbesPerPortOrbit": expected_probe_count,
                "duplicateHolonomyProbes": duplicate_holonomies,
                "missingHolonomyProbes": missing_holonomies,
            }
        )
    return result


def realize_overlap_gluing(
    problem: OverlapGluingProblem,
    port_representative: LocalPortOrbit,
    holonomy_representative: OverlapHolonomyProbe | MultiChordHolonomyProbe,
) -> SearchState:
    """Realize one exact bounded holonomy probe as the new generator row."""

    stage = problem.stage
    new = problem.local_groups[stage.new_subset]
    overlap = problem.local_groups[stage.overlap_subset]
    right_count = problem.degree // new.order
    port_to_block = port_representative.standard_port_to_existing_block
    if sorted(port_to_block) != list(range(len(problem.current_ports))):
        raise BlockAmalgamError("A local port representative is not a bijection.")
    if isinstance(holonomy_representative, MultiChordHolonomyProbe):
        twists = dict(holonomy_representative.assignments)
        if len(twists) != len(holonomy_representative.assignments):
            raise BlockAmalgamError("A multi-chord probe repeats an overlap edge.")
    else:
        twists = (
            {holonomy_representative.edge: holonomy_representative.twist_index}
            if holonomy_representative.edge is not None
            else {}
        )
    new_row = np.empty(problem.degree, dtype=UINT_DTYPE)
    assigned = np.zeros(problem.degree, dtype=np.bool_)
    for right in range(right_count):
        standard_to_current: dict[int, int] = {}
        for standard_port_index, existing_block in enumerate(port_to_block):
            standard_port = problem.standard_ports[standard_port_index]
            current_port = problem.current_ports[existing_block][right]
            twist_index = twists.get((right, existing_block), 0)
            if twist_index < 0 or twist_index >= overlap.order:
                raise BlockAmalgamError("An overlap twist index is outside P.")
            current_root = int(sorted(map(int, current_port))[twist_index])
            standard_to_current.update(
                equivariant_orbit_map_from_roots(
                    new.rows,
                    problem.state.rows,
                    stage.overlap_subset,
                    standard_port,
                    current_port,
                    current_root,
                )
            )
        if len(standard_to_current) != new.order:
            raise BlockAmalgamError("A probed C-block was not fully glued.")
        inverse = {
            current: standard for standard, current in standard_to_current.items()
        }
        local_new_row = new.rows[stage.new_generator]
        for current, standard in inverse.items():
            new_row[current] = standard_to_current[int(local_new_row[standard])]
            assigned[current] = True
    if not bool(np.all(assigned)) or len(np.unique(new_row)) != problem.degree:
        raise BlockAmalgamError("A port/holonomy probe did not produce a permutation.")
    identity = np.arange(problem.degree, dtype=UINT_DTYPE)
    if not np.array_equal(new_row[new_row], identity):
        raise BlockAmalgamError("The realized generator is not an involution.")
    updated = list(problem.state.rows)
    updated[stage.new_generator] = new_row
    return SearchState(tuple(updated), problem.state.choices)


def transitive_centralizer_records(
    state: SearchState,
    problem: OverlapGluingProblem,
) -> list[dict[str, Any]]:
    """Compute the residual centralizer from images of one transitive basepoint."""

    generators = tuple(index for index, row in enumerate(state.rows) if row is not None)
    if not generators:
        raise BlockAmalgamError("A residual centralizer needs assigned generators.")
    degree = problem.degree
    parent = np.full(degree, -1, dtype=np.int32)
    parent_generator = np.full(degree, -1, dtype=np.int16)
    order = [0]
    parent[0] = 0
    cursor = 0
    while cursor < len(order):
        point = order[cursor]
        cursor += 1
        for generator in generators:
            row = state.rows[generator]
            assert row is not None
            target = int(row[point])
            if parent[target] < 0:
                parent[target] = point
                parent_generator[target] = generator
                order.append(target)
    if len(order) != degree:
        raise BlockAmalgamError("The first-stage action is not transitive.")

    existing_blocks = action_orbits(state.rows, problem.stage.existing_subset, degree)
    block_by_point = np.empty(degree, dtype=np.int16)
    for block_index, block in enumerate(existing_blocks):
        block_by_point[block] = block_index
    flat_ports = [port for ports in problem.current_ports for port in ports]
    port_by_point = np.empty(degree, dtype=np.int16)
    coordinate_by_point = np.empty(degree, dtype=np.int16)
    for port_index, port in enumerate(flat_ports):
        for coordinate, point in enumerate(sorted(map(int, port))):
            port_by_point[point] = port_index
            coordinate_by_point[point] = coordinate

    records: list[dict[str, Any]] = []
    for base_image in range(degree):
        mapping = np.empty(degree, dtype=UINT_DTYPE)
        mapping[0] = base_image
        seen = np.zeros(degree, dtype=np.bool_)
        seen[base_image] = True
        valid = True
        for point in order[1:]:
            generator = int(parent_generator[point])
            row = state.rows[generator]
            assert row is not None
            image = int(row[int(mapping[int(parent[point])])])
            if seen[image]:
                valid = False
                break
            mapping[point] = image
            seen[image] = True
        if not valid:
            continue
        for generator in generators:
            row = state.rows[generator]
            assert row is not None
            if not np.array_equal(row[mapping], mapping[row]):
                valid = False
                break
        if not valid:
            continue
        records.append(
            {
                "baseImage": base_image,
                "pointPermutationSha256": hashlib.sha256(mapping.tobytes()).hexdigest(),
                "existingBlockPermutation": [
                    int(block_by_point[int(mapping[int(block[0])])])
                    for block in existing_blocks
                ],
                "overlapPortPermutation": [
                    int(port_by_point[int(mapping[int(port[0])])])
                    for port in flat_ports
                ],
                "overlapRootCoordinates": [
                    int(coordinate_by_point[int(mapping[int(port[0])])])
                    for port in flat_ports
                ],
            }
        )
    return records


def pair_relation_pass(left: np.ndarray, right: np.ndarray, order: int) -> bool:
    identity = np.arange(len(left), dtype=UINT_DTYPE)
    product = right[left]
    power = identity
    for _ in range(order):
        power = product[power]
    return bool(
        np.array_equal(power, identity) and not np.array_equal(product, identity)
    )


def second_gluing_checkpoint_payload(
    problem_hash: str,
    next_work_unit: int,
    counters: Mapping[str, Any],
    survivors: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    return seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": "coxeter-second-gluing-probe-checkpoint",
            "backendVersion": SECOND_GLUING_BACKEND_VERSION,
            "problemHash": problem_hash,
            "nextWorkUnit": next_work_unit,
            "counters": dict(counters),
            "survivors": list(survivors),
        }
    )


def load_second_gluing_checkpoint(
    path: Path | None, campaign_hash: str
) -> dict[str, Any] | None:
    """Load a sealed checkpoint bound to this code, source, and R3 catalogue."""

    if path is None or not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf8"))
    supplied = raw.get("artifactHash")
    if not isinstance(supplied, str) or seal(dict(raw))["artifactHash"] != supplied:
        raise BlockAmalgamError("The second-gluing checkpoint hash is invalid.")
    if (
        raw.get("backendVersion") != SECOND_GLUING_BACKEND_VERSION
        or raw.get("problemHash") != campaign_hash
    ):
        raise BlockAmalgamError("The second-gluing checkpoint is stale.")
    return raw


def root_witness_checkpoint_payload(
    campaign_hash: str,
    next_work_unit: int,
    counters: Mapping[str, Any],
    unit_digests: Sequence[str],
    samples: Sequence[Mapping[str, Any]],
    unresolved: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Seal resumable state for the root-residue witness frontiers."""

    return seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": "coxeter-root-residue-witness-checkpoint",
            "backendVersion": ROOT_WITNESS_BACKEND_VERSION,
            "campaignHash": campaign_hash,
            "nextWorkUnit": next_work_unit,
            "counters": dict(counters),
            "unitDigests": list(unit_digests),
            "samples": list(samples),
            "unresolved": list(unresolved),
        }
    )


def load_root_witness_checkpoint(
    path: Path | None, campaign_hash: str
) -> dict[str, Any] | None:
    """Load a witness checkpoint only when its code-bound campaign matches."""

    if path is None or not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf8"))
    supplied = raw.get("artifactHash")
    if not isinstance(supplied, str) or seal(dict(raw))["artifactHash"] != supplied:
        raise BlockAmalgamError("The root-witness checkpoint hash is invalid.")
    if (
        raw.get("artifactType") != "coxeter-root-residue-witness-checkpoint"
        or raw.get("backendVersion") != ROOT_WITNESS_BACKEND_VERSION
        or raw.get("campaignHash") != campaign_hash
    ):
        raise BlockAmalgamError("The root-witness checkpoint is stale.")
    return raw


def root_configuration_relation_witnesses(
    problem: OverlapGluingProblem,
    first_states: Sequence[SearchState],
    port_representative: LocalPortOrbit,
    existing_port_indices: Sequence[int],
) -> tuple[np.ndarray, tuple[RelationAvoidanceWitness | None, ...]]:
    """Check every first-stage branch using only one selected C-residue.

    A non-``None`` witness is a failed alternating ``g4,g7`` hexagon whose
    three ``g4`` inputs stay in the selected residue.  It survives every
    change to the generator row outside that residue.
    """

    local_row, selected = realize_new_residue_block_row(
        problem, port_representative, existing_port_indices
    )
    outside = np.ones(problem.degree, dtype=np.bool_)
    outside[selected] = False
    mutable_region = np.flatnonzero(outside).astype(UINT_DTYPE, copy=False)
    witnesses: list[RelationAvoidanceWitness | None] = []
    for state in first_states:
        fixed_row = state.rows[STAGES[0].new_generator]
        if fixed_row is None:
            raise BlockAmalgamError("The first-stage g7 row is missing.")
        witnesses.append(
            relation_failure_witness_avoiding_region(
                local_row, fixed_row, 3, mutable_region
            )
        )
    return selected, tuple(witnesses)


def _root_witness_unit_record(
    descriptor: Mapping[str, Any],
    port: LocalPortOrbit,
    selected: np.ndarray,
    witnesses: Sequence[RelationAvoidanceWitness | None],
) -> dict[str, Any]:
    return {
        "configuration": dict(descriptor),
        "localPortOrbitKey": port.canonical_key,
        "selectedResiduePointCount": len(selected),
        "selectedResidueSha256": hashlib.sha256(selected.tobytes()).hexdigest(),
        "branchWitnesses": [
            None
            if witness is None
            else {
                "firstStageBranch": branch,
                "start": witness.start,
                "final": witness.final,
                "mutableRowInputs": list(witness.mutable_row_inputs),
            }
            for branch, witness in enumerate(witnesses)
        ],
    }


def _append_witness_sample(
    samples: list[dict[str, Any]], record: Mapping[str, Any]
) -> None:
    """Keep small deterministic head/tail evidence without bloating artifacts."""

    compact = dict(record)
    if len(samples) < 2:
        samples.append(compact)
        return
    if len(samples) < 4:
        samples.append(compact)
    else:
        samples[-2:] = [samples[-1], compact]


def _prepare_root_witness_campaign(
    args: argparse.Namespace,
) -> tuple[
    Mapping[str, Any],
    tuple[tuple[int, ...], ...],
    str,
    tuple[SearchState, ...],
    tuple[OverlapGluingProblem, ...],
    tuple[LocalPortOrbit, ...],
]:
    """Build the exact first-stage branches shared by R4 and R5."""

    source, matrix, source_hash = orbifold.load_source(args.input)
    rank = len(matrix)
    if rank != 10 or args.degree != DEFAULT_DEGREE:
        raise BlockAmalgamError(
            "The root-witness campaign is scoped to the compact rank-10 cube at degree 5,760."
        )
    _, catalogue = orbifold.spherical_catalogue(matrix)
    if catalogue["lowerBoundDivisor"] != DEFAULT_DEGREE:
        raise BlockAmalgamError("The source does not have lower divisor 5,760.")
    anchor, local_groups = initial_anchor_state(matrix, rank, args.degree)
    first_stage = STAGES[0]
    second_stage = STAGES[1]
    first_graphs = incidence_graphs(
        first_stage.graph_kind,
        args.degree // local_groups[first_stage.existing_subset].order,
        args.degree // local_groups[first_stage.new_subset].order,
    )
    second_graph = incidence_graphs(
        second_stage.graph_kind,
        args.degree // local_groups[second_stage.existing_subset].order,
        args.degree // local_groups[second_stage.new_subset].order,
    )[0]
    first_states: list[SearchState] = []
    for graph_index, graph in enumerate(first_graphs):
        extended = extend_over_local_group(
            anchor, first_stage, graph, matrix, args.degree, local_groups
        )
        if extended is None:
            raise BlockAmalgamError(
                f"First-stage incidence representative {graph_index} no longer realizes."
            )
        first_states.append(SearchState(extended.rows, (graph_index,)))
    problems = tuple(
        build_overlap_gluing_problem(
            state,
            second_stage,
            second_graph,
            matrix,
            args.degree,
            local_groups,
        )
        for state in first_states
    )
    ports = tuple(enumerate_port_assignment_orbits(problems[0]))
    if len(ports) != 210 or sum(item.orbit_size for item in ports) != math.factorial(8):
        raise BlockAmalgamError("The 210-class local C/P catalogue is incomplete.")
    return (
        source,
        tuple(tuple(map(int, row)) for row in matrix),
        source_hash,
        tuple(first_states),
        problems,
        ports,
    )


def run_root_witness_frontier(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    """Close complete holonomy/new-port R4 and distance-one port R5."""

    started = time.monotonic()
    source, matrix, source_hash, first_states, problems, port_orbits = (
        _prepare_root_witness_campaign(args)
    )
    base_problem = problems[0]
    accounting = root_witness_frontier_counts(base_problem, len(port_orbits))
    implementation_hashes = {
        "pythonSha256": sha256_file(Path(__file__)),
        "orbifoldValidatorSha256": sha256_file(SCRIPT_DIR / "orbifold_cover_search.py"),
        "sharedClassifierSha256": sha256_file(SCRIPT_DIR / "torsion_free_discovery.py"),
    }
    campaign_hash = sha256_json(
        {
            "backendVersion": ROOT_WITNESS_BACKEND_VERSION,
            "sourceHash": source_hash,
            "scope": args.scope,
            "degree": args.degree,
            "matrix": matrix,
            "problemHashes": [problem.problem_hash for problem in problems],
            "localPortCatalogueHash": sha256_json(
                [port.canonical_key for port in port_orbits]
            ),
            "accounting": accounting,
            "implementationHashes": implementation_hashes,
        }
    )

    zero_indices = (0,) * len(base_problem.current_ports)

    def evaluate(
        descriptor: Mapping[str, Any],
        port: LocalPortOrbit,
        indices: Sequence[int],
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        selected, witnesses = root_configuration_relation_witnesses(
            base_problem, first_states, port, indices
        )
        record = _root_witness_unit_record(descriptor, port, selected, witnesses)
        missing = [
            {
                "configuration": dict(descriptor),
                "localPortOrbitKey": port.canonical_key,
                "firstStageBranch": branch,
            }
            for branch, witness in enumerate(witnesses)
            if witness is None
        ]
        return record, missing

    canonical_digests: list[str] = []
    canonical_samples: list[dict[str, Any]] = []
    canonical_unresolved: list[dict[str, Any]] = []
    canonical_checks = 0
    if args.scope == "r5-one-existing-transposition":
        for port in port_orbits:
            record, missing = evaluate(
                {"existingSidePortSkeleton": "canonical"}, port, zero_indices
            )
            canonical_digests.append(sha256_json(record))
            _append_witness_sample(canonical_samples, record)
            canonical_unresolved.extend(missing)
            canonical_checks += len(first_states)

    if args.scope == "r4-full-holonomy-new-ports":
        work_units: list[tuple[dict[str, Any], LocalPortOrbit, tuple[int, ...]]] = [
            (
                {"existingSidePortSkeleton": "canonical"},
                port,
                zero_indices,
            )
            for port in port_orbits
        ]
        root_preserving_skeletons = 0
        root_changing_skeletons = 0
    else:
        transpositions = root_port_transpositions(base_problem)
        root_preserving_skeletons = sum(
            not item.changes_root_residue for item in transpositions
        )
        root_changing = tuple(
            item for item in transpositions if item.changes_root_residue
        )
        root_changing_skeletons = len(root_changing)
        work_units = []
        for transposition in root_changing:
            changed_port = max(transposition.first_port, transposition.second_port)
            indices = list(zero_indices)
            indices[transposition.existing_block] = changed_port
            descriptor = {
                "existingBlock": transposition.existing_block,
                "transposedPorts": [
                    transposition.first_port,
                    transposition.second_port,
                ],
                "rootPortAfterTransposition": changed_port,
            }
            work_units.extend(
                (descriptor, port, tuple(indices)) for port in port_orbits
            )

    loaded = (
        load_root_witness_checkpoint(args.checkpoint, campaign_hash)
        if args.resume
        else None
    )
    next_work_unit = int(loaded.get("nextWorkUnit", 0)) if loaded else 0
    counters: dict[str, int] = {
        "workUnitsExamined": 0,
        "rootConfigurationsExamined": 0,
        "branchWitnessChecks": 0,
        "missingWitnesses": 0,
    }
    if loaded:
        counters.update(
            {key: int(value) for key, value in loaded.get("counters", {}).items()}
        )
    unit_digests = list(loaded.get("unitDigests", [])) if loaded else []
    samples = list(loaded.get("samples", [])) if loaded else []
    unresolved = list(loaded.get("unresolved", [])) if loaded else []
    if len(unit_digests) != next_work_unit:
        raise BlockAmalgamError("The root-witness checkpoint has a broken work index.")

    timeout_reached = False
    for work_index in range(next_work_unit, len(work_units)):
        if time.monotonic() - started >= args.timeout_seconds:
            timeout_reached = True
            next_work_unit = work_index
            break
        descriptor, port, indices = work_units[work_index]
        record, missing = evaluate(descriptor, port, indices)
        unit_digests.append(sha256_json(record))
        _append_witness_sample(samples, record)
        unresolved.extend(missing)
        counters["workUnitsExamined"] += 1
        counters["rootConfigurationsExamined"] += 1
        counters["branchWitnessChecks"] += len(first_states)
        counters["missingWitnesses"] += len(missing)
        next_work_unit = work_index + 1
        if args.checkpoint is not None and (
            counters["workUnitsExamined"] % args.checkpoint_every == 0
        ):
            atomic_write_json(
                args.checkpoint,
                root_witness_checkpoint_payload(
                    campaign_hash,
                    next_work_unit,
                    counters,
                    unit_digests,
                    samples,
                    unresolved,
                ),
            )
    else:
        next_work_unit = len(work_units)

    search_complete = not timeout_reached and next_work_unit == len(work_units)
    if args.checkpoint is not None:
        atomic_write_json(
            args.checkpoint,
            root_witness_checkpoint_payload(
                campaign_hash,
                next_work_unit,
                counters,
                unit_digests,
                samples,
                unresolved,
            ),
        )
    all_witnesses_found = not canonical_unresolved and not unresolved
    scope_excluded = search_complete and all_witnesses_found
    branch_count = len(first_states)
    if args.scope == "r4-full-holonomy-new-ports":
        scope_id = R4_SCOPE_ID
        claim = (
            "For the canonical existing-side port skeleton, all 210^15 independent "
            "new-residue local port-class assignments and all 48^98 non-tree chord-map "
            "assignments in the fixed standard-tree map slice fail (g4 g7)^3. This includes every different-block "
            "two-chord assignment and every support of size at least three."
        )
        parameter_count = int(
            accounting["canonicalExistingSideParameterConfigurations"]
        )
        proof_digests = unit_digests
        proof_samples = samples
        proof_checks = counters["branchWitnessChecks"]
        proof_unresolved = unresolved
    else:
        scope_id = R5_SCOPE_ID
        claim = (
            "Every existing-side port skeleton at transposition distance one from "
            "the canonical gauge fails (g4 g7)^3, for arbitrary independent "
            "new-residue local port classes and arbitrary non-tree chord maps in the fixed standard-tree map slice."
        )
        parameter_count = int(accounting["oneTranspositionParameterConfigurations"])
        proof_digests = [*canonical_digests, *unit_digests]
        proof_samples = [*canonical_samples[:2], *samples[-2:]]
        proof_checks = canonical_checks + counters["branchWitnessChecks"]
        proof_unresolved = [*canonical_unresolved, *unresolved]

    artifact = seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": "coxeter-root-residue-witness-frontier",
            "backendVersion": ROOT_WITNESS_BACKEND_VERSION,
            "status": (
                "exhausted"
                if scope_excluded
                else "unresolved-configurations"
                if search_complete
                else "incomplete"
            ),
            "complete": search_complete,
            "scopeExcluded": scope_excluded,
            "globalSecondGluingComplete": False,
            "sourceSystem": source,
            "inputHash": source_hash,
            "degree": args.degree,
            "scope": {
                "id": args.scope,
                "certificateScopeId": scope_id,
                "claim": claim,
                "firstStageBranchCount": branch_count,
                "rootNewResidueBlock": 0,
                "newResiduePortAssignmentsComplete": True,
                "nonTreeChordMapAssignmentsComplete": True,
                "fixedStandardTreeMapsComplete": False,
                "existingSidePortScope": (
                    "canonical only"
                    if args.scope == "r4-full-holonomy-new-ports"
                    else "all skeletons exactly one transposition from canonical"
                ),
                "rootPreservingOneTranspositionSkeletonCount": root_preserving_skeletons,
                "rootChangingOneTranspositionSkeletonCount": root_changing_skeletons,
                "parameterConfigurationsExcluded": str(parameter_count)
                if scope_excluded
                else "0",
                "accounting": accounting,
            },
            "proof": {
                "failedRelation": "(g4 g7)^3 = 1",
                "relationOrder": 3,
                "mutableGenerator": 4,
                "fixedGenerator": 7,
                "method": (
                    "For each possible local C/P class on the selected root C-residue, "
                    "find a failed alternating hexagon whose three g4 inputs remain in "
                    "that residue. Changes to every other C-residue and every non-tree "
                    "overlap map cannot alter the witness."
                ),
                "witnessUnitCount": len(proof_digests),
                "branchWitnessCheckCount": proof_checks,
                "witnessCatalogueSha256": sha256_json(proof_digests),
                "samples": proof_samples,
                "unresolvedCount": len(proof_unresolved),
                "unresolved": proof_unresolved[: args.max_candidates],
            },
            "search": {
                "scopeComplete": search_complete,
                "checkpointLoaded": loaded is not None,
                "nextWorkUnit": next_work_unit,
                "workUnitCount": len(work_units),
                "timeoutReached": timeout_reached,
                "elapsedSeconds": round(time.monotonic() - started, 6),
                "counters": counters,
            },
            "promotionCriterion": (
                "These are negative stage-two exclusion certificates, not cover "
                "candidates. A surviving unrestricted gluing would still require all "
                "later residues and independent spherical-freeness certification."
            ),
            "warnings": [
                "This does not exhaust the full second-gluing double quotient.",
                "The full local torsor factor is 24^15 * 48^105; the 48^98 count covers only non-tree chord maps after fixing the standard-tree maps.",
                (
                    "R4 fixes the existing-side port skeleton; R5 reaches exactly one "
                    "existing-side transposition. Skeletons requiring two or more "
                    "transpositions remain open."
                ),
                "No negative stage-two result is a torsion-free cover certificate.",
            ],
            "provenance": {
                "campaignHash": campaign_hash,
                "problemHashes": [problem.problem_hash for problem in problems],
                "implementationHashes": implementation_hashes,
            },
        }
    )
    return artifact, 0 if search_complete else 2


def run_second_gluing_search(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    """Run the requested exact R1, R2, and bounded R3 strata."""

    started = time.monotonic()
    source, matrix, source_hash = orbifold.load_source(args.input)
    rank = len(matrix)
    if rank != 10 or args.degree != DEFAULT_DEGREE:
        raise BlockAmalgamError(
            "The second-gluing campaign is scoped to the compact rank-10 cube at degree 5,760."
        )
    maximal, catalogue = orbifold.spherical_catalogue(matrix)
    if catalogue["lowerBoundDivisor"] != DEFAULT_DEGREE:
        raise BlockAmalgamError("The source does not have lower divisor 5,760.")
    all_spherical = [
        classified
        for mask in range(1, 1 << rank)
        if (
            classified := shared.classify_spherical_subset(
                matrix, tuple(index for index in range(rank) if mask & (1 << index))
            )
        )
        is not None
    ]
    anchor, local_groups = initial_anchor_state(matrix, rank, args.degree)
    first_stage = STAGES[0]
    second_stage = STAGES[1]
    first_graphs = incidence_graphs(
        first_stage.graph_kind,
        args.degree // local_groups[first_stage.existing_subset].order,
        args.degree // local_groups[first_stage.new_subset].order,
    )
    second_graph = incidence_graphs(
        second_stage.graph_kind,
        args.degree // local_groups[second_stage.existing_subset].order,
        args.degree // local_groups[second_stage.new_subset].order,
    )[0]
    first_states: list[SearchState] = []
    for graph_index, graph in enumerate(first_graphs):
        extended = extend_over_local_group(
            anchor, first_stage, graph, matrix, args.degree, local_groups
        )
        if extended is None:
            raise BlockAmalgamError(
                f"First-stage incidence representative {graph_index} no longer realizes."
            )
        first_states.append(SearchState(extended.rows, (graph_index,)))
    problems = [
        build_overlap_gluing_problem(
            state,
            second_stage,
            second_graph,
            matrix,
            args.degree,
            local_groups,
        )
        for state in first_states
    ]
    base_problem = problems[0]
    port_orbits = list(enumerate_port_assignment_orbits(base_problem))
    if len(port_orbits) != 210 or sum(
        item.orbit_size for item in port_orbits
    ) != math.factorial(8):
        raise BlockAmalgamError(
            "The effective C/P action did not produce 210 local port orbits."
        )
    canonical_port = next(
        item for item in port_orbits if item.contains_r0_canonical_assignment
    )
    zero_probe = next(enumerate_overlap_holonomy_orbits(base_problem, canonical_port))
    nontrivial_probes = [
        item
        for item in enumerate_overlap_holonomy_orbits(base_problem, canonical_port)
        if not item.is_zero_holonomy
    ]
    expected_nontrivial = base_problem.incidence_cycle_rank * (
        local_groups[second_stage.overlap_subset].order - 1
    )
    if len(nontrivial_probes) != expected_nontrivial:
        raise BlockAmalgamError("The R2 one-cycle holonomy catalogue is incomplete.")

    r3_supports = list(enumerate_two_chord_same_block_supports(base_problem))
    overlap_order = local_groups[second_stage.overlap_subset].order
    r3_twists_per_support = (overlap_order - 1) ** 2
    expected_r3_supports = (
        args.degree // local_groups[second_stage.new_subset].order - 1
    ) * math.comb(len(base_problem.current_ports) - 1, 2)
    if len(r3_supports) != expected_r3_supports or any(
        support.nonidentity_twist_count != r3_twists_per_support
        for support in r3_supports
    ):
        raise BlockAmalgamError("The R3 two-chord support catalogue is incomplete.")

    requested_scopes = {
        "r1-local-ports": (True, False, False),
        "r2-single-chord": (False, True, False),
        "r3-two-chord-same-block": (False, False, True),
        "r1-r2": (True, True, False),
        "r2-r3": (False, True, True),
        "r1-r2-r3": (True, True, True),
    }
    include_r1, include_r2, include_r3 = requested_scopes[args.scope]
    specifications: list[tuple[str, LocalPortOrbit, OverlapHolonomyProbe]] = []
    if include_r1:
        specifications.extend(("R1", port, zero_probe) for port in port_orbits)
    if include_r2:
        specifications.extend(
            ("R2", canonical_port, probe) for probe in nontrivial_probes
        )

    baseline = realize_overlap_gluing(base_problem, canonical_port, zero_probe)
    baseline_row4 = baseline.rows[second_stage.new_generator]
    assert baseline_row4 is not None
    centralizer_records_by_branch: list[list[dict[str, Any]]] = []
    residual_gauge_audits: list[dict[str, Any]] = []
    if include_r3:
        for branch_index, problem in enumerate(problems):
            records = transitive_centralizer_records(
                first_states[branch_index], problem
            )
            audit = residual_fixed_gauge_audit(problem, records)
            if audit["fixedGaugeStabilizerOrder"] != 1:
                raise BlockAmalgamError(
                    "R3 requires an explicit twist-coordinate action when the fixed-gauge "
                    "residual centralizer is nontrivial."
                )
            centralizer_records_by_branch.append(records)
            residual_gauge_audits.append({"firstStageBranch": branch_index, **audit})

    relation_witnesses: dict[tuple[int, int], RelationAvoidanceWitness | None] = {}
    if include_r3:
        for branch_index, first_state in enumerate(first_states):
            row7 = first_state.rows[first_stage.new_generator]
            assert row7 is not None
            for right_block in sorted({support.right_block for support in r3_supports}):
                relation_witnesses[(branch_index, right_block)] = (
                    relation_failure_witness_avoiding_region(
                        baseline_row4,
                        row7,
                        3,
                        new_residue_block_points(base_problem, right_block),
                    )
                )

    implementation_hashes = {
        "pythonSha256": sha256_file(Path(__file__)),
        "orbifoldValidatorSha256": sha256_file(SCRIPT_DIR / "orbifold_cover_search.py"),
        "sharedClassifierSha256": sha256_file(SCRIPT_DIR / "torsion_free_discovery.py"),
    }
    campaign_hash = sha256_json(
        {
            "backendVersion": SECOND_GLUING_BACKEND_VERSION,
            "sourceHash": source_hash,
            "scope": args.scope,
            "degree": args.degree,
            "problemHashes": [problem.problem_hash for problem in problems],
            "r3SupportCatalogueHash": sha256_json(
                [support.canonical_key for support in r3_supports]
            ),
            "residualGaugeAudits": residual_gauge_audits,
            "implementationHashes": implementation_hashes,
        }
    )
    loaded = (
        load_second_gluing_checkpoint(args.checkpoint, campaign_hash)
        if args.resume
        else None
    )
    next_work_unit = int(loaded.get("nextWorkUnit", 0)) if loaded else 0
    counters: dict[str, int] = {
        "workUnitsExamined": 0,
        "probeRowsExamined": 0,
        "candidateRowsAccounted": 0,
        "materializedRows": 0,
        "branchTests": 0,
        "pairRelationPasses": 0,
        "sphericalPasses": 0,
        "r3SupportClassesExamined": 0,
        "relationWitnessPrunedRows": 0,
        "relationWitnessPrunedBranchConfigurations": 0,
    }
    if loaded:
        counters.update(
            {key: int(value) for key, value in loaded.get("counters", {}).items()}
        )
    survivors: list[dict[str, Any]] = (
        list(loaded.get("survivors", [])) if loaded else []
    )
    active_r3_supports = r3_supports if include_r3 else []
    work_unit_count = len(specifications) + len(active_r3_supports)
    candidate_row_count = len(specifications) + sum(
        support.nonidentity_twist_count for support in active_r3_supports
    )
    timeout_reached = False
    for work_index in range(next_work_unit, work_unit_count):
        if time.monotonic() - started >= args.timeout_seconds:
            timeout_reached = True
            next_work_unit = work_index
            break
        if work_index < len(specifications):
            scope_name, port, holonomy = specifications[work_index]
            realized = realize_overlap_gluing(base_problem, port, holonomy)
            row4 = realized.rows[second_stage.new_generator]
            assert row4 is not None
            counters["probeRowsExamined"] += 1
            counters["candidateRowsAccounted"] += 1
            counters["materializedRows"] += 1
            branch_indices = range(len(first_states))
            holonomy_fields: dict[str, Any] = {
                "holonomyProbeKey": holonomy.canonical_key,
                "holonomyEdge": list(holonomy.edge) if holonomy.edge else None,
                "twistIndex": holonomy.twist_index,
            }
            candidates_to_test = [(row4, holonomy_fields, branch_indices)]
        else:
            support = active_r3_supports[work_index - len(specifications)]
            weight = support.nonidentity_twist_count
            counters["r3SupportClassesExamined"] += 1
            counters["probeRowsExamined"] += weight
            counters["candidateRowsAccounted"] += weight
            unpruned_branches: list[int] = []
            for branch_index in range(len(first_states)):
                witness = relation_witnesses[(branch_index, support.right_block)]
                if witness is None:
                    unpruned_branches.append(branch_index)
                else:
                    counters["branchTests"] += weight
                    counters["relationWitnessPrunedBranchConfigurations"] += weight
            if not unpruned_branches:
                counters["relationWitnessPrunedRows"] += weight
                candidates_to_test = []
            else:
                candidates_to_test = []
                for holonomy in enumerate_two_chord_holonomies(base_problem, support):
                    realized = realize_overlap_gluing(
                        base_problem, canonical_port, holonomy
                    )
                    row4 = realized.rows[second_stage.new_generator]
                    assert row4 is not None
                    counters["materializedRows"] += 1
                    candidates_to_test.append(
                        (
                            row4,
                            {
                                "holonomyProbeKey": holonomy.canonical_key,
                                "holonomyAssignments": [
                                    {"edge": list(edge), "twistIndex": twist}
                                    for edge, twist in holonomy.assignments
                                ],
                                "supportKey": support.canonical_key,
                            },
                            tuple(unpruned_branches),
                        )
                    )
            scope_name = "R3"
            port = canonical_port

        for row4, holonomy_fields, branch_indices in candidates_to_test:
            for branch_index in branch_indices:
                first_state = first_states[branch_index]
                counters["branchTests"] += 1
                row7 = first_state.rows[first_stage.new_generator]
                assert row7 is not None
                if not pair_relation_pass(row4, row7, 3):
                    continue
                counters["pairRelationPasses"] += 1
                updated = list(first_state.rows)
                updated[second_stage.new_generator] = row4
                candidate = SearchState(tuple(updated), (branch_index, work_index))
                if not finite_pair_relations_pass(candidate.rows, matrix):
                    raise BlockAmalgamError(
                        "The focused relation check disagreed with full replay."
                    )
                if not newly_completed_spherical_checks(
                    candidate,
                    second_stage.new_generator,
                    all_spherical,
                    args.degree,
                ):
                    continue
                counters["sphericalPasses"] += 1
                partial = materialize_candidate(candidate)
                survivor = {
                    "scope": scope_name,
                    "firstStageBranch": branch_index,
                    "portOrbitKey": port.canonical_key,
                    "portRepresentative": list(port.standard_port_to_existing_block),
                    **holonomy_fields,
                    "partialActionHash": sha256_json(partial),
                }
                if len(survivors) < args.max_candidates:
                    survivor["partialAction"] = partial
                survivors.append(survivor)
        counters["workUnitsExamined"] += 1
        next_work_unit = work_index + 1
        if args.checkpoint is not None and (
            counters["workUnitsExamined"] % args.checkpoint_every == 0
        ):
            atomic_write_json(
                args.checkpoint,
                second_gluing_checkpoint_payload(
                    campaign_hash, next_work_unit, counters, survivors
                ),
            )
    else:
        next_work_unit = work_unit_count
    scope_complete = not timeout_reached and next_work_unit >= work_unit_count
    if args.checkpoint is not None:
        atomic_write_json(
            args.checkpoint,
            second_gluing_checkpoint_payload(
                campaign_hash, next_work_unit, counters, survivors
            ),
        )

    centralizers = []
    if scope_complete or args.compute_centralizers:
        for branch_index, problem in enumerate(problems):
            records = (
                centralizer_records_by_branch[branch_index]
                if centralizer_records_by_branch
                else transitive_centralizer_records(first_states[branch_index], problem)
            )
            centralizers.append(
                {
                    "firstStageBranch": branch_index,
                    "order": len(records),
                    "records": records,
                }
            )

    space_counts = second_gluing_space_counts(base_problem)
    local_audit = audit_overlap_gluing_orbits(base_problem, port_orbits, {})
    scope_claims: list[str] = []
    if include_r1:
        scope_claims.append(
            "R1 exhausts all 210 uniform local C/P port orbits with zero overlap twist."
        )
    if include_r2:
        scope_claims.append(
            "R2 exhausts all 98 single fundamental chords and all 47 nonidentity P-maps."
        )
    if include_r3:
        scope_claims.append(
            "R3 exhausts exactly two distinct fundamental chords sharing one non-root "
            "new C-block, with either chord assigned any of the 47 nonidentity P-maps."
        )
    artifact = seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": "coxeter-second-gluing-port-holonomy-search",
            "backendVersion": SECOND_GLUING_BACKEND_VERSION,
            "status": "survivor-found"
            if survivors
            else "exhausted"
            if scope_complete
            else "incomplete",
            "complete": scope_complete,
            "globalSecondGluingComplete": False,
            "sourceSystem": source,
            "inputHash": source_hash,
            "degree": args.degree,
            "scope": {
                "id": args.scope,
                "r1Id": R1_SCOPE_ID,
                "r2Id": R2_SCOPE_ID,
                "r3Id": R3_SCOPE_ID,
                "claim": " ".join(scope_claims),
                "fullDoubleQuotientClaim": False,
                "firstStageBranchCount": len(first_states),
                "localPortOrbitCount": len(port_orbits),
                "noncanonicalLocalPortOrbitCount": sum(
                    not item.contains_r0_canonical_assignment for item in port_orbits
                ),
                "singleCycleNontrivialProbeCount": len(nontrivial_probes),
                "twoChordSameBlockSupportCount": len(r3_supports),
                "twoChordTwistsPerSupport": r3_twists_per_support,
                "twoChordSameBlockRowCount": len(r3_supports) * r3_twists_per_support,
                "twoChordSupportCompleteness": (
                    "All unordered pairs of fundamental chords with a common non-root "
                    "new C-block; no pairs in different C-blocks and no supports of size >= 3."
                ),
                "residualGaugeAudits": residual_gauge_audits,
                "spaceCounts": space_counts,
            },
            "search": {
                "scopeComplete": scope_complete,
                "checkpointLoaded": loaded is not None,
                "nextWorkUnit": next_work_unit,
                "workUnitCount": work_unit_count,
                "probeRowCount": candidate_row_count,
                "timeoutReached": timeout_reached,
                "elapsedSeconds": round(time.monotonic() - started, 6),
                "counters": counters,
            },
            "localCatalogueAudit": local_audit,
            "residualCentralizers": centralizers,
            "survivorCount": len(survivors),
            "survivors": survivors,
            "promotionCriterion": (
                "A stage-two survivor is only a partial action. It must pass all later gluings "
                "and the independent maximal-spherical regularity validator before certification."
            ),
            "warnings": [
                "This is not an exhaustive enumeration of the full second-gluing double quotient.",
                "R3 does not include two-chord supports in different new C-blocks, three or more changed chords, or nonuniform port skeletons.",
                "No stage-two survivor is a torsion-free cover certificate.",
            ],
            "provenance": {
                "campaignHash": campaign_hash,
                "problemHashes": [problem.problem_hash for problem in problems],
                "implementationHashes": implementation_hashes,
            },
        }
    )
    return artifact, 0 if scope_complete or survivors else 2


def subgroup_action_is_regular(
    rows: Sequence[np.ndarray | None],
    generators: Sequence[int],
    expected_order: int,
    degree: int,
) -> bool:
    if degree % expected_order:
        return False
    return all(
        len(orbit) == expected_order
        for orbit in action_orbits(rows, generators, degree)
    )


def finite_pair_relations_pass(
    rows: Sequence[np.ndarray | None], matrix: Sequence[Sequence[int]]
) -> bool:
    assigned = [index for index, row in enumerate(rows) if row is not None]
    if not assigned:
        return True
    identity = np.arange(len(rows[assigned[0]]), dtype=UINT_DTYPE)
    for offset, left in enumerate(assigned):
        left_row = rows[left]
        assert left_row is not None
        if not np.array_equal(left_row[left_row], identity):
            return False
        for right in assigned[offset + 1 :]:
            relation = matrix[left][right]
            if relation == 0:
                continue
            right_row = rows[right]
            assert right_row is not None
            product = right_row[left_row]
            power = identity
            for _ in range(relation):
                power = product[power]
            if not np.array_equal(power, identity):
                return False
            if np.array_equal(product, identity):
                return False
    return True


def extend_over_local_group(
    state: SearchState,
    stage: ExtensionStage,
    graph: Sequence[tuple[int, int]],
    matrix: Sequence[Sequence[int]],
    degree: int,
    local_groups: Mapping[tuple[int, ...], LocalCoxeterGroup],
) -> SearchState | None:
    rows = state.rows
    existing = local_groups[stage.existing_subset]
    new = local_groups[stage.new_subset]
    overlap = local_groups[stage.overlap_subset]
    existing_blocks = action_orbits(rows, stage.existing_subset, degree)
    if any(len(block) != existing.order for block in existing_blocks):
        return None
    overlap_by_existing = [
        orbit_partition_within(rows, stage.overlap_subset, block)
        for block in existing_blocks
    ]
    expected_left_degree = existing.order // overlap.order
    if any(len(orbits) != expected_left_degree for orbits in overlap_by_existing):
        return None

    standard_rows: tuple[np.ndarray | None, ...] = tuple(
        new.rows.get(index) for index in range(len(rows))
    )
    standard_full = np.arange(new.order, dtype=UINT_DTYPE)
    standard_ports = orbit_partition_within(
        standard_rows, stage.overlap_subset, standard_full
    )
    right_count = degree // new.order
    expected_right_degree = new.order // overlap.order
    left_incidence = [[] for _ in existing_blocks]
    right_incidence = [[] for _ in range(right_count)]
    for edge_index, (left, right) in enumerate(graph):
        if (
            left < 0
            or left >= len(existing_blocks)
            or right < 0
            or right >= right_count
        ):
            raise BlockAmalgamError("An incidence graph endpoint is outside its shore.")
        left_incidence[left].append((right, edge_index))
        right_incidence[right].append((left, edge_index))
    if any(len(edges) != expected_left_degree for edges in left_incidence):
        raise BlockAmalgamError("An incidence graph has the wrong left degree.")
    if any(len(edges) != expected_right_degree for edges in right_incidence):
        raise BlockAmalgamError("An incidence graph has the wrong right degree.")

    current_orbit_by_edge: dict[int, np.ndarray] = {}
    for left, incident in enumerate(left_incidence):
        for port, (_, edge_index) in enumerate(sorted(incident)):
            current_orbit_by_edge[edge_index] = overlap_by_existing[left][port]

    new_row = np.empty(degree, dtype=UINT_DTYPE)
    assigned_points = np.zeros(degree, dtype=np.bool_)
    for right, incident in enumerate(right_incidence):
        standard_to_current: dict[int, int] = {}
        for port, (_, edge_index) in enumerate(sorted(incident)):
            standard_to_current.update(
                equivariant_orbit_map(
                    new.rows,
                    rows,
                    stage.overlap_subset,
                    standard_ports[port],
                    current_orbit_by_edge[edge_index],
                )
            )
        if len(standard_to_current) != new.order:
            raise BlockAmalgamError("A regular local block was not fully glued.")
        inverse = {
            current: standard for standard, current in standard_to_current.items()
        }
        new_generator_row = new.rows[stage.new_generator]
        for current_point, standard_point in inverse.items():
            target = standard_to_current[int(new_generator_row[standard_point])]
            new_row[current_point] = target
            assigned_points[current_point] = True
    if not bool(np.all(assigned_points)) or len(np.unique(new_row)) != degree:
        raise BlockAmalgamError("The local gluing did not produce one permutation row.")

    updated = list(rows)
    updated[stage.new_generator] = new_row
    candidate = SearchState(tuple(updated), (*state.choices, 0))
    if not finite_pair_relations_pass(candidate.rows, matrix):
        return None
    if not subgroup_action_is_regular(
        candidate.rows, stage.new_subset, new.order, degree
    ):
        return None
    return candidate


def initial_anchor_state(
    matrix: Sequence[Sequence[int]], rank: int, degree: int
) -> tuple[SearchState, dict[tuple[int, ...], LocalCoxeterGroup]]:
    anchor = STAGES[0].existing_subset
    needed = (
        {stage.existing_subset for stage in STAGES}
        | {stage.new_subset for stage in STAGES}
        | {stage.overlap_subset for stage in STAGES}
    )
    local_groups = {
        subset: build_local_group(matrix, subset) for subset in sorted(needed)
    }
    anchor_group = local_groups[anchor]
    if degree % anchor_group.order:
        raise BlockAmalgamError(
            f"Degree {degree} is not divisible by |A5|={anchor_group.order}."
        )
    rows: list[np.ndarray | None] = [None] * rank
    copies = degree // anchor_group.order
    for generator in anchor:
        local_row = anchor_group.rows[generator]
        rows[generator] = np.concatenate(
            [local_row + block * anchor_group.order for block in range(copies)]
        ).astype(UINT_DTYPE, copy=False)
    state = SearchState(tuple(rows), ())
    if not finite_pair_relations_pass(state.rows, matrix):
        raise BlockAmalgamError("The canonical regular A5 anchor failed its relations.")
    return state, local_groups


def newly_completed_spherical_checks(
    state: SearchState,
    new_generator: int,
    spherical: Sequence[shared.SphericalSubset],
    degree: int,
) -> bool:
    assigned = {index for index, row in enumerate(state.rows) if row is not None}
    for item in spherical:
        if new_generator not in item.subset or not set(item.subset) <= assigned:
            continue
        if not subgroup_action_is_regular(
            state.rows, item.subset, item.expected_order, degree
        ):
            return False
    return True


def materialize_candidate(state: SearchState) -> dict[str, Any]:
    return {
        "degree": len(next(row for row in state.rows if row is not None)),
        "generatorImages": [
            row.astype(np.uint32).tolist() if row is not None else None
            for row in state.rows
        ],
    }


def checkpoint_payload(
    problem_hash: str,
    next_combination: int,
    counters: Mapping[str, Any],
    candidate_count: int,
) -> dict[str, Any]:
    return seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": "coxeter-block-amalgam-checkpoint",
            "backendVersion": BACKEND_VERSION,
            "problemHash": problem_hash,
            "nextCombination": next_combination,
            "counters": dict(counters),
            "candidateCount": candidate_count,
        }
    )


def load_checkpoint(path: Path | None, problem_hash: str) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf8"))
    supplied = raw.get("artifactHash")
    if not isinstance(supplied, str) or seal(dict(raw))["artifactHash"] != supplied:
        raise BlockAmalgamError("Checkpoint artifact hash is invalid.")
    if (
        raw.get("backendVersion") != BACKEND_VERSION
        or raw.get("problemHash") != problem_hash
    ):
        raise BlockAmalgamError("Checkpoint is stale for this R0 search problem.")
    return raw


def run_search(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    started = time.monotonic()
    source, matrix, source_hash = orbifold.load_source(args.input)
    rank = len(matrix)
    if rank != 10 or args.degree != DEFAULT_DEGREE:
        raise BlockAmalgamError(
            "The R0 implementation is intentionally scoped to the compact rank-10 cube at degree 5,760."
        )
    maximal, catalogue = orbifold.spherical_catalogue(matrix)
    all_spherical = [
        classified
        for mask in range(1, 1 << rank)
        if (
            classified := shared.classify_spherical_subset(
                matrix, tuple(index for index in range(rank) if mask & (1 << index))
            )
        )
        is not None
    ]
    if catalogue["lowerBoundDivisor"] != DEFAULT_DEGREE:
        raise BlockAmalgamError("The source does not have lower divisor 5,760.")

    anchor, local_groups = initial_anchor_state(matrix, rank, args.degree)
    graphs = [
        incidence_graphs(
            stage.graph_kind,
            args.degree // local_groups[stage.existing_subset].order,
            args.degree // local_groups[stage.new_subset].order,
        )
        for stage in STAGES
    ]
    graph_counts = [len(options) for options in graphs]
    if graph_counts != [stage.expected_graph_count for stage in STAGES]:
        raise BlockAmalgamError(f"Unexpected R0 graph counts {graph_counts}.")
    total_combinations = int(np.prod(graph_counts))
    implementation_hashes = {
        "pythonSha256": sha256_file(Path(__file__)),
        "orbifoldValidatorSha256": sha256_file(SCRIPT_DIR / "orbifold_cover_search.py"),
        "sharedClassifierSha256": sha256_file(SCRIPT_DIR / "torsion_free_discovery.py"),
    }
    problem_hash = sha256_json(
        {
            "sourceHash": source_hash,
            "matrix": matrix,
            "degree": args.degree,
            "scope": SCOPE_ID,
            "graphCounts": graph_counts,
            "implementations": implementation_hashes,
        }
    )
    loaded = load_checkpoint(args.checkpoint, problem_hash) if args.resume else None
    resume_from = int(loaded.get("nextCombination", 0)) if loaded else 0

    stage_states: list[list[SearchState]] = [[anchor]]
    stage_counters: list[dict[str, int]] = []
    for stage_index, stage in enumerate(STAGES[:-1]):
        next_states: list[SearchState] = []
        attempted = 0
        relation_or_local_rejections = 0
        spherical_rejections = 0
        for state in stage_states[-1]:
            for graph_index, graph in enumerate(graphs[stage_index]):
                attempted += 1
                candidate = extend_over_local_group(
                    state, stage, graph, matrix, args.degree, local_groups
                )
                if candidate is None:
                    relation_or_local_rejections += 1
                    continue
                candidate = SearchState(candidate.rows, (*state.choices, graph_index))
                if not newly_completed_spherical_checks(
                    candidate, stage.new_generator, all_spherical, args.degree
                ):
                    spherical_rejections += 1
                    continue
                next_states.append(candidate)
        stage_counters.append(
            {
                "attempted": attempted,
                "relationOrLocalRejections": relation_or_local_rejections,
                "sphericalRejections": spherical_rejections,
                "survivors": len(next_states),
            }
        )
        stage_states.append(next_states)
        if not next_states:
            break

    candidates: list[dict[str, Any]] = []
    combinations_examined = 0
    relation_or_local_rejections = 0
    spherical_rejections = 0
    timeout_reached = False
    final_stage = STAGES[-1]
    prefix_stride = graph_counts[-1]
    for prefix_index, state in enumerate(
        stage_states[-1] if len(stage_states) == len(STAGES) else []
    ):
        for graph_index, graph in enumerate(graphs[-1]):
            combination_index = prefix_index * prefix_stride + graph_index
            if combination_index < resume_from:
                continue
            if time.monotonic() - started >= args.timeout_seconds:
                timeout_reached = True
                break
            combinations_examined += 1
            candidate = extend_over_local_group(
                state, final_stage, graph, matrix, args.degree, local_groups
            )
            if candidate is None:
                relation_or_local_rejections += 1
            else:
                candidate = SearchState(candidate.rows, (*state.choices, graph_index))
                if not newly_completed_spherical_checks(
                    candidate,
                    final_stage.new_generator,
                    all_spherical,
                    args.degree,
                ):
                    spherical_rejections += 1
                else:
                    raw_action = materialize_candidate(candidate)
                    validation = orbifold.validate_action_candidate(
                        raw_action,
                        matrix,
                        maximal,
                        orbifold.cube_incidence_catalogue(matrix, maximal),
                        catalogue["lowerBoundDivisor"],
                    )
                    if validation.get("torsionFreePointStabilizerCertified"):
                        candidates.append(
                            {
                                "choices": list(candidate.choices),
                                "action": raw_action,
                                "validation": validation,
                            }
                        )
            if args.checkpoint is not None and (
                combinations_examined % args.checkpoint_every == 0
            ):
                atomic_write_json(
                    args.checkpoint,
                    checkpoint_payload(
                        problem_hash,
                        combination_index + 1,
                        {
                            "examinedThisRun": combinations_examined,
                            "relationOrLocalRejections": relation_or_local_rejections,
                            "sphericalRejections": spherical_rejections,
                        },
                        len(candidates),
                    ),
                )
            if len(candidates) >= args.max_candidates:
                break
        if timeout_reached or len(candidates) >= args.max_candidates:
            break

    early_exhausted = len(stage_states) < len(STAGES)
    final_prefixes = stage_states[-1] if len(stage_states) == len(STAGES) else []
    final_work_count = len(final_prefixes) * graph_counts[-1]
    prefix_complete = len(stage_states) == len(STAGES) or early_exhausted
    next_combination = (
        resume_from + combinations_examined
        if timeout_reached
        else final_work_count
        if prefix_complete and len(candidates) < args.max_candidates
        else resume_from + combinations_examined
    )
    scope_complete = (
        prefix_complete
        and not timeout_reached
        and len(candidates) < args.max_candidates
        and next_combination >= final_work_count
    )
    if args.checkpoint is not None:
        atomic_write_json(
            args.checkpoint,
            checkpoint_payload(
                problem_hash,
                next_combination,
                {
                    "examinedThisRun": combinations_examined,
                    "relationOrLocalRejections": relation_or_local_rejections,
                    "sphericalRejections": spherical_rejections,
                },
                len(candidates),
            ),
        )

    artifact = seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "backendVersion": BACKEND_VERSION,
            "status": (
                "candidate-found"
                if candidates
                else "exhausted"
                if scope_complete
                else "incomplete"
            ),
            "complete": scope_complete,
            "sourceSystem": source,
            "inputHash": source_hash,
            "degree": args.degree,
            "lowerBoundDivisor": catalogue["lowerBoundDivisor"],
            "scope": {
                "id": SCOPE_ID,
                "claim": (
                    "complete only for the listed extension chain, one sorted-label "
                    "embedding of each abstract incidence type, minimum-root port "
                    "maps, and zero overlap twist"
                ),
                "globalNonexistenceClaim": False,
                "normalCoverClaim": False,
                "extensionChain": [stage.__dict__ for stage in STAGES],
                "graphCounts": graph_counts,
                "totalTopologyCombinations": total_combinations,
            },
            "search": {
                "scopeComplete": scope_complete,
                "checkpointLoaded": loaded is not None,
                "resumeFrom": resume_from,
                "nextCombination": next_combination,
                "finalWorkCountAfterExactPrefixPruning": final_work_count,
                "timeoutReached": timeout_reached,
                "elapsedSeconds": round(time.monotonic() - started, 6),
                "stageCounters": stage_counters,
                "finalStage": {
                    "examinedThisRun": combinations_examined,
                    "relationOrLocalRejections": relation_or_local_rejections,
                    "sphericalRejections": spherical_rejections,
                },
            },
            "candidateCount": len(candidates),
            "candidates": candidates,
            "promotionCriterion": (
                "independent replay of all Coxeter relations and regular orbits "
                "for every maximal spherical subgroup"
            ),
            "warnings": [
                "R0 is a finite representative ansatz, not all degree-5,760 actions.",
                "An abstract incidence type can have further inequivalent embeddings after an earlier gluing breaks block symmetry.",
                "A negative result does not rule out noncanonical ports, nontrivial overlap holonomy, repeated incidence, or another extension chain.",
            ],
            "provenance": {
                "problemHash": problem_hash,
                "implementationHashes": implementation_hashes,
            },
        }
    )
    return artifact, 0 if scope_complete or candidates else 2


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Search finite declared strata of the compact-cube block amalgam."
    )
    result.add_argument("--input", required=True, type=Path)
    result.add_argument("--output", required=True, type=Path)
    result.add_argument("--degree", type=int, default=DEFAULT_DEGREE)
    result.add_argument("--checkpoint", type=Path)
    result.add_argument("--resume", action="store_true")
    result.add_argument("--checkpoint-every", type=int, default=100)
    result.add_argument("--timeout-seconds", type=int, default=21_600)
    result.add_argument("--max-candidates", type=int, default=8)
    result.add_argument(
        "--scope",
        choices=(
            "r0",
            "r1-local-ports",
            "r2-single-chord",
            "r3-two-chord-same-block",
            "r4-full-holonomy-new-ports",
            "r5-one-existing-transposition",
            "r1-r2",
            "r2-r3",
            "r1-r2-r3",
        ),
        default="r0",
        help=(
            "r0 runs the original canonical gluing; r1/r2/r3 enumerate exact "
            "bounded local-port and chord strata; r4 closes all non-tree chord maps and "
            "new-residue port choices in the fixed-tree map slice for canonical existing ports; r5 closes "
            "the complete distance-one existing-port frontier."
        ),
    )
    result.add_argument(
        "--compute-centralizers",
        action="store_true",
        help="Compute residual first-stage centralizers even for an interrupted run.",
    )
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.scope == "r0":
            artifact, code = run_search(args)
        elif args.scope in {
            "r4-full-holonomy-new-ports",
            "r5-one-existing-transposition",
        }:
            artifact, code = run_root_witness_frontier(args)
        else:
            artifact, code = run_second_gluing_search(args)
    except Exception as exc:  # fail closed with a reviewable artifact
        artifact = seal(
            {
                "schemaVersion": SCHEMA_VERSION,
                "artifactType": ARTIFACT_TYPE,
                "backendVersion": BACKEND_VERSION,
                "status": "failed",
                "complete": False,
                "errors": [f"{type(exc).__name__}: {exc}"],
            }
        )
        code = 1
    atomic_write_json(args.output, artifact)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
