#!/usr/bin/env python3
"""Canonically augment the compact-cube second gluing by port distance.

The second gluing has seven independent existing-side permutations after the
first A-block fixes the labels of the fifteen new C-residues.  This program
enumerates a transposition-distance layer without enumerating different words
for the same permutation.  It then applies an exact root-residue sieve using
the full anchored local frame ``S_7 x P^7``.

The relation test contracts the fixed ``g7`` edges.  A free action of
``<g4,g7> = S3`` is equivalent to the contracted ``g4`` graph being a disjoint
union of triangles.  Partial local frames are added edge by edge; paths on
three contracted vertices force their closing edge.  This is an exact
necessary test.  A surviving root frame is deliberately reported as an open
frontier, not as a cover candidate: the other fourteen C-residues still have
to be glued and checked.
"""

from __future__ import annotations

import argparse
from collections import Counter
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
from numba import njit


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import block_amalgam_cover_search as block  # noqa: E402


SCHEMA_VERSION = 1
BACKEND_VERSION = "1.1.0"
ARTIFACT_TYPE = "coxeter-block-amalgam-canonical-augmentation"
SCOPE_ID = "R6-distance-two-existing-side-root-frame-sieve"
MINIMUM_ROOT_SCOPE_ID = "R6-distance-two-existing-side-fixed-tree-map-slice"
GLOBAL_MINIMUM_ROOT_SCOPE_ID = (
    "R7-distance-two-existing-side-global-minimum-root-map-slice"
)
UINT_DTYPE = np.uint16


class CanonicalAugmentationError(ValueError):
    """Raised when a campaign input or an exact-search invariant fails."""


class SearchInterrupted(RuntimeError):
    """Internal signal used to seal a deterministic incomplete campaign."""


@dataclass(frozen=True)
class FrameSearchResult:
    status: str
    nodes: int
    relation_rejections: int
    forced_edges: int
    frame: tuple[tuple[int, int, int], ...] | None
    boundary_forced_edge_count: int
    depth_nodes: tuple[int, ...]


@dataclass(frozen=True)
class GlobalSliceResult:
    status: str
    nodes: int
    forced_domain_reductions: int
    relation_rejections: int
    class_assignment: tuple[int, ...] | None


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


def transposition_distance(permutation: Sequence[int]) -> int:
    """Return the minimum number of arbitrary transpositions in a permutation."""

    seen = [False] * len(permutation)
    cycles = 0
    for root in range(len(permutation)):
        if seen[root]:
            continue
        cycles += 1
        point = root
        while not seen[point]:
            seen[point] = True
            point = int(permutation[point])
    return len(permutation) - cycles


def permutations_at_distance_two(size: int) -> Iterable[tuple[int, ...]]:
    """Generate every permutation of transposition distance two exactly once.

    Such a permutation is either one 3-cycle or two disjoint transpositions.
    Choosing a canonical support and cycle orientation avoids duplicate
    transposition words.
    """

    identity = tuple(range(size))
    for support in itertools.combinations(range(size), 3):
        first, second, third = support
        for cycle in ((first, second, third), (first, third, second)):
            result = list(identity)
            result[cycle[0]] = cycle[1]
            result[cycle[1]] = cycle[2]
            result[cycle[2]] = cycle[0]
            yield tuple(result)
    for support in itertools.combinations(range(size), 4):
        first, second, third, fourth = support
        for pairs in (
            ((first, second), (third, fourth)),
            ((first, third), (second, fourth)),
            ((first, fourth), (second, third)),
        ):
            result = list(identity)
            for left, right in pairs:
                result[left], result[right] = result[right], result[left]
            yield tuple(result)


def transpositions(size: int) -> Iterable[tuple[int, ...]]:
    identity = tuple(range(size))
    for left, right in itertools.combinations(range(size), 2):
        result = list(identity)
        result[left], result[right] = result[right], result[left]
        yield tuple(result)


def distance_two_root_signature_counts(
    *, port_count: int = 15, permutation_count: int = 7
) -> Counter[tuple[int, ...]]:
    """Count the distance-two skeletons represented by each root-port tuple.

    The first A-block fixes the C-residue labels.  The remaining seven rows are
    permutations of its fifteen ports.  At total distance two, either one row
    has distance two or two rows are transpositions.
    """

    result: Counter[tuple[int, ...]] = Counter()
    distance_two = tuple(permutations_at_distance_two(port_count))
    distance_one = tuple(transpositions(port_count))
    for row in range(permutation_count):
        for permutation in distance_two:
            signature = [0] * (permutation_count + 1)
            signature[row + 1] = permutation[0]
            result[tuple(signature)] += 1
    for first_row, second_row in itertools.combinations(range(permutation_count), 2):
        for first in distance_one:
            for second in distance_one:
                signature = [0] * (permutation_count + 1)
                signature[first_row + 1] = first[0]
                signature[second_row + 1] = second[0]
                result[tuple(signature)] += 1
    return result


def distance_two_skeleton_columns(
    root_signature: Sequence[int], *, port_count: int = 15
) -> tuple[tuple[int, ...], ...]:
    """Recover the unique distance-two skeleton represented by a support-two root.

    Every unresolved R6 root has two nonzero coordinates. Its multiplicity is
    one: two distinct existing-side rows each swap port zero with the recorded
    port. The resulting columns describe all fifteen new C-residues.
    """

    if len(root_signature) != 8 or root_signature[0] != 0:
        raise CanonicalAugmentationError(
            "A distance-two root signature has eight entries."
        )
    changed = [index for index in range(1, 8) if int(root_signature[index]) != 0]
    if len(changed) != 2:
        raise CanonicalAugmentationError(
            "Only support-two, multiplicity-one distance-two skeletons can be reconstructed."
        )
    permutations = [list(range(port_count)) for _ in range(8)]
    for existing_block in changed:
        target = int(root_signature[existing_block])
        if target <= 0 or target >= port_count:
            raise CanonicalAugmentationError("A root port is outside the skeleton.")
        permutations[existing_block][0], permutations[existing_block][target] = (
            permutations[existing_block][target],
            permutations[existing_block][0],
        )
    return tuple(
        tuple(permutations[existing_block][right] for existing_block in range(8))
        for right in range(port_count)
    )


class TriangleRelationState:
    """Rollback state for the exact ``(g4 g7)^3`` relation.

    Contracting the fixed-point-free ``g7`` matching turns every alternating
    hexagon into a triangle.  A partial ``g4`` matching is extendable only when
    this contracted graph has no loop, parallel edge, degree above two, or
    component with more than three vertices.  A three-vertex path forces the
    edge joining its two unused endpoints.
    """

    def __init__(
        self,
        fixed_row: np.ndarray,
        *,
        selected_points: frozenset[int],
    ) -> None:
        degree = len(fixed_row)
        self.partner = np.full(degree, -1, dtype=np.int32)
        self.pair_by_point = np.full(degree, -1, dtype=np.int32)
        pair_points: list[tuple[int, int]] = []
        for point in range(degree):
            target = int(fixed_row[point])
            if target == point or int(fixed_row[target]) != point:
                raise CanonicalAugmentationError(
                    "The fixed generator is not a free involution."
                )
            if point < target:
                pair_index = len(pair_points)
                pair_points.append((point, target))
                self.pair_by_point[point] = pair_index
                self.pair_by_point[target] = pair_index
        if np.any(self.pair_by_point < 0):
            raise CanonicalAugmentationError(
                "The fixed matching did not cover every point."
            )
        self.pair_points = tuple(pair_points)
        self.neighbors: list[list[int]] = [[] for _ in pair_points]
        self.edge_log: list[tuple[int, int, int, int, bool]] = []
        self.selected_points = selected_points
        self.forced_edge_count = 0

    def checkpoint(self) -> tuple[int, int]:
        return len(self.edge_log), self.forced_edge_count

    def rollback(self, checkpoint: tuple[int, int]) -> None:
        edge_count, forced_count = checkpoint
        while len(self.edge_log) > edge_count:
            point, target, left_pair, right_pair, _ = self.edge_log.pop()
            self.neighbors[left_pair].remove(right_pair)
            self.neighbors[right_pair].remove(left_pair)
            self.partner[point] = -1
            self.partner[target] = -1
        self.forced_edge_count = forced_count

    def _component(self, root: int) -> tuple[list[int], int]:
        vertices: list[int] = []
        seen = {root}
        queue = [root]
        edge_twice = 0
        while queue:
            point = queue.pop()
            vertices.append(point)
            if len(vertices) > 3:
                return vertices, 0
            edge_twice += len(self.neighbors[point])
            for target in self.neighbors[point]:
                if target not in seen:
                    seen.add(target)
                    queue.append(target)
        return vertices, edge_twice // 2

    def _free_endpoint(self, pair: int) -> int | None:
        first, second = self.pair_points[pair]
        if self.partner[first] < 0:
            return first
        if self.partner[second] < 0:
            return second
        return None

    def add_edge(self, point: int, target: int, *, forced: bool = False) -> bool:
        existing = int(self.partner[point])
        if existing >= 0:
            return existing == target and int(self.partner[target]) == point
        if int(self.partner[target]) >= 0:
            return False
        left_pair = int(self.pair_by_point[point])
        right_pair = int(self.pair_by_point[target])
        if left_pair == right_pair or right_pair in self.neighbors[left_pair]:
            return False
        if len(self.neighbors[left_pair]) >= 2 or len(self.neighbors[right_pair]) >= 2:
            return False
        if forced and (
            (point in self.selected_points) != (target in self.selected_points)
        ):
            return False

        self.partner[point] = target
        self.partner[target] = point
        self.neighbors[left_pair].append(right_pair)
        self.neighbors[right_pair].append(left_pair)
        self.edge_log.append((point, target, left_pair, right_pair, forced))
        if forced:
            self.forced_edge_count += 1

        component, edge_count = self._component(left_pair)
        if len(component) > 3:
            return False
        if edge_count >= len(component) and not (
            len(component) == 3 and edge_count == 3
        ):
            return False
        if len(component) == 3 and edge_count == 2:
            endpoints = [
                vertex for vertex in component if len(self.neighbors[vertex]) == 1
            ]
            if len(endpoints) != 2:
                return False
            left_free = self._free_endpoint(endpoints[0])
            right_free = self._free_endpoint(endpoints[1])
            if left_free is None or right_free is None:
                return False
            return self.add_edge(left_free, right_free, forced=True)
        return True


class RootFrameCatalogue:
    """Lazy exact maps for anchored local frames of one C-residue."""

    def __init__(self, problem: block.OverlapGluingProblem) -> None:
        self.problem = problem
        stage = problem.stage
        new = problem.local_groups[stage.new_subset]
        self.standard_points = tuple(
            np.asarray(sorted(map(int, port)), dtype=UINT_DTYPE)
            for port in problem.standard_ports
        )
        port_by_standard = np.empty(new.order, dtype=np.int16)
        coordinate_by_standard = np.empty(new.order, dtype=np.int16)
        for port_index, points in enumerate(self.standard_points):
            port_by_standard[points] = port_index
            coordinate_by_standard[points] = np.arange(len(points), dtype=np.int16)
        interactions: dict[tuple[int, int], list[tuple[int, int]]] = {}
        new_row = new.rows[stage.new_generator]
        for point in range(new.order):
            target = int(new_row[point])
            if point >= target:
                continue
            left_port = int(port_by_standard[point])
            right_port = int(port_by_standard[target])
            if left_port == right_port:
                raise CanonicalAugmentationError(
                    "A local g4 edge stayed in one P-port."
                )
            if left_port < right_port:
                key = (left_port, right_port)
                pair = (
                    int(coordinate_by_standard[point]),
                    int(coordinate_by_standard[target]),
                )
            else:
                key = (right_port, left_port)
                pair = (
                    int(coordinate_by_standard[target]),
                    int(coordinate_by_standard[point]),
                )
            interactions.setdefault(key, []).append(pair)
        if sum(len(edges) for edges in interactions.values()) != new.order // 2:
            raise CanonicalAugmentationError(
                "The local g4 edge catalogue is incomplete."
            )
        self.interactions = {
            key: tuple(sorted(edges)) for key, edges in interactions.items()
        }
        self.standard_port_by_point = port_by_standard
        self.standard_coordinate_by_point = coordinate_by_standard
        self.local_new_row = new_row
        self.map_cache: dict[tuple[int, int, int, int], np.ndarray] = {}

    def point_map(
        self,
        standard_port: int,
        existing_block: int,
        port_index: int,
        root_coordinate: int,
    ) -> np.ndarray:
        key = (standard_port, existing_block, port_index, root_coordinate)
        cached = self.map_cache.get(key)
        if cached is not None:
            return cached
        current_port = self.problem.current_ports[existing_block][port_index]
        current_points = sorted(map(int, current_port))
        if root_coordinate < 0 or root_coordinate >= len(current_points):
            raise CanonicalAugmentationError(
                "A P-torsor coordinate is outside its port."
            )
        mapping = block.equivariant_orbit_map_from_roots(
            self.problem.local_groups[self.problem.stage.new_subset].rows,
            self.problem.state.rows,
            self.problem.stage.overlap_subset,
            self.problem.standard_ports[standard_port],
            current_port,
            current_points[root_coordinate],
        )
        result = np.asarray(
            [mapping[int(point)] for point in self.standard_points[standard_port]],
            dtype=UINT_DTYPE,
        )
        self.map_cache[key] = result
        return result


def packed_frame_tables(
    catalogue: RootFrameCatalogue,
    root_signature: Sequence[int],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Pack local maps and g4 edges for the compiled exact-frame kernel."""

    maps = np.empty((8, 8, 48, 48), dtype=UINT_DTYPE)
    maps.fill(np.iinfo(UINT_DTYPE).max)
    for standard_port in range(8):
        for existing_block in range(8):
            if standard_port == 0 or existing_block == 0:
                if standard_port != existing_block:
                    continue
            port_index = int(root_signature[existing_block])
            for root_coordinate in range(48):
                maps[standard_port, existing_block, root_coordinate] = (
                    catalogue.point_map(
                        standard_port,
                        existing_block,
                        port_index,
                        root_coordinate,
                    )
                )
    edge_standard_left: list[int] = []
    edge_standard_right: list[int] = []
    edge_coordinates: list[tuple[int, int]] = []
    for (left, right), edges in sorted(catalogue.interactions.items()):
        for left_coordinate, right_coordinate in edges:
            edge_standard_left.append(left)
            edge_standard_right.append(right)
            edge_coordinates.append((left_coordinate, right_coordinate))
    return (
        maps,
        np.asarray(edge_standard_left, dtype=np.int8),
        np.asarray(edge_standard_right, dtype=np.int8),
        np.asarray(edge_coordinates, dtype=np.int8),
    )


def packed_minimum_root_tables(
    catalogue: RootFrameCatalogue,
    port_orbits: Sequence[block.LocalPortOrbit],
) -> tuple[np.ndarray, np.ndarray]:
    """Pack all minimum-root P-maps and the 210 local port classes."""

    maps = np.empty((8, 8, 15, 48), dtype=UINT_DTYPE)
    for standard_port in range(8):
        for existing_block in range(8):
            for port_index in range(15):
                maps[standard_port, existing_block, port_index] = catalogue.point_map(
                    standard_port, existing_block, port_index, 0
                )
    assignments = np.asarray(
        [item.standard_port_to_existing_block for item in port_orbits],
        dtype=np.int8,
    )
    return maps, assignments


@njit(cache=True)
def _minimum_root_survivor_counts(
    root_signatures: np.ndarray,
    port_assignments: np.ndarray,
    maps: np.ndarray,
    standard_port_by_point: np.ndarray,
    standard_coordinate_by_point: np.ndarray,
    local_new_row: np.ndarray,
    fixed_rows: np.ndarray,
) -> tuple[np.ndarray, int]:
    """Count fixed-tree local classes with no contained relation failure."""

    signature_count = len(root_signatures)
    branch_count = len(fixed_rows)
    class_count = len(port_assignments)
    counts = np.zeros((signature_count, branch_count), dtype=np.int16)
    inverse = np.full(len(fixed_rows[0]), -1, dtype=np.int32)
    standard_to_current = np.empty(len(local_new_row), dtype=UINT_DTYPE)
    evaluations = 0
    for signature_index in range(signature_count):
        signature = root_signatures[signature_index]
        for class_index in range(class_count):
            assignment = port_assignments[class_index]
            for standard_point in range(len(local_new_row)):
                standard_port = int(standard_port_by_point[standard_point])
                existing_block = int(assignment[standard_port])
                port_index = int(signature[existing_block])
                coordinate = int(standard_coordinate_by_point[standard_point])
                current = int(
                    maps[
                        standard_port,
                        existing_block,
                        port_index,
                        coordinate,
                    ]
                )
                standard_to_current[standard_point] = current
                inverse[current] = standard_point
            for branch in range(branch_count):
                evaluations += 1
                fixed = fixed_rows[branch]
                failed = False
                for start_standard in range(len(local_new_row)):
                    start_current = int(standard_to_current[start_standard])
                    current_standard = start_standard
                    completed = True
                    final_current = start_current
                    for step in range(3):
                        after_mutable = int(
                            standard_to_current[int(local_new_row[current_standard])]
                        )
                        final_current = int(fixed[after_mutable])
                        if step < 2:
                            current_standard = int(inverse[final_current])
                            if current_standard < 0:
                                completed = False
                                break
                    if completed and final_current != start_current:
                        failed = True
                        break
                if not failed:
                    counts[signature_index, branch] += 1
            for standard_point in range(len(local_new_row)):
                inverse[int(standard_to_current[standard_point])] = -1
    return counts, evaluations


@njit(cache=True)
def _packed_residue_class_edges(
    residue_signatures: np.ndarray,
    port_assignments: np.ndarray,
    maps: np.ndarray,
    edge_left: np.ndarray,
    edge_right: np.ndarray,
    edge_coordinates: np.ndarray,
) -> np.ndarray:
    """Materialize the 192 local g4 edges for every residue/class pair."""

    residue_count = len(residue_signatures)
    class_count = len(port_assignments)
    edge_count = len(edge_left)
    result = np.empty((residue_count, class_count, edge_count, 2), dtype=UINT_DTYPE)
    for residue in range(residue_count):
        signature = residue_signatures[residue]
        for class_index in range(class_count):
            assignment = port_assignments[class_index]
            for edge_index in range(edge_count):
                left_standard = int(edge_left[edge_index])
                right_standard = int(edge_right[edge_index])
                left_block = int(assignment[left_standard])
                right_block = int(assignment[right_standard])
                left_port = int(signature[left_block])
                right_port = int(signature[right_block])
                left_coordinate = int(edge_coordinates[edge_index, 0])
                right_coordinate = int(edge_coordinates[edge_index, 1])
                left_point = int(
                    maps[
                        left_standard,
                        left_block,
                        left_port,
                        left_coordinate,
                    ]
                )
                right_point = int(
                    maps[
                        right_standard,
                        right_block,
                        right_port,
                        right_coordinate,
                    ]
                )
                if left_point < right_point:
                    result[residue, class_index, edge_index, 0] = left_point
                    result[residue, class_index, edge_index, 1] = right_point
                else:
                    result[residue, class_index, edge_index, 0] = right_point
                    result[residue, class_index, edge_index, 1] = left_point
    return result


class MinimumRootGlobalSolver:
    """Propagate exact relation triangles across all fifteen C-residues."""

    def __init__(
        self,
        problem: block.OverlapGluingProblem,
        fixed_row: np.ndarray,
        residue_signatures: Sequence[Sequence[int]],
        class_edges: np.ndarray,
        *,
        edge_masks: Sequence[Mapping[int, int]] | None = None,
        residue_by_point: np.ndarray | None = None,
    ) -> None:
        self.problem = problem
        self.fixed_row = fixed_row
        self.residue_signatures = tuple(
            tuple(map(int, row)) for row in residue_signatures
        )
        self.class_edges = class_edges
        self.residue_count = len(residue_signatures)
        self.class_count = class_edges.shape[1]
        self.full_domain = (1 << self.class_count) - 1
        self.domains = [self.full_domain] * self.residue_count
        self.assignments = [-1] * self.residue_count
        self.domain_log: list[tuple[int, int, int]] = []
        self.relation = TriangleRelationState(
            fixed_row, selected_points=frozenset(range(problem.degree))
        )
        if residue_by_point is None:
            self.residue_by_point = build_residue_by_point(
                problem, self.residue_signatures
            )
        else:
            self.residue_by_point = residue_by_point
        self.edge_masks = (
            [dict(item) for item in edge_masks]
            if edge_masks is not None
            else build_edge_masks(problem.degree, class_edges)
        )
        self.nodes = 0
        self.forced_domain_reductions = 0
        self.relation_rejections = 0

    def checkpoint(self) -> tuple[tuple[int, int], int]:
        return self.relation.checkpoint(), len(self.domain_log)

    def rollback(self, checkpoint: tuple[tuple[int, int], int]) -> None:
        relation_checkpoint, domain_count = checkpoint
        while len(self.domain_log) > domain_count:
            residue, domain, assignment = self.domain_log.pop()
            self.domains[residue] = domain
            self.assignments[residue] = assignment
        self.relation.rollback(relation_checkpoint)

    def _restrict_domain(self, residue: int, domain: int) -> bool:
        reduced = self.domains[residue] & domain
        if reduced == 0:
            return False
        if reduced == self.domains[residue]:
            return True
        self.domain_log.append(
            (residue, self.domains[residue], self.assignments[residue])
        )
        self.domains[residue] = reduced
        self.forced_domain_reductions += 1
        assignment = self.assignments[residue]
        return assignment < 0 or bool(reduced & (1 << assignment))

    def assign_with_propagation(self, residue: int, class_index: int) -> bool:
        queue: list[tuple[int, int]] = [(residue, class_index)]
        forced_cursor = len(self.relation.edge_log)
        while queue:
            current_residue, current_class = queue.pop()
            existing = self.assignments[current_residue]
            if existing >= 0:
                if existing != current_class:
                    return False
                continue
            if not (self.domains[current_residue] & (1 << current_class)):
                return False
            self.domain_log.append(
                (
                    current_residue,
                    self.domains[current_residue],
                    self.assignments[current_residue],
                )
            )
            self.domains[current_residue] = 1 << current_class
            self.assignments[current_residue] = current_class
            for point, target in self.class_edges[current_residue, current_class]:
                if not self.relation.add_edge(int(point), int(target)):
                    self.relation_rejections += 1
                    return False

            while forced_cursor < len(self.relation.edge_log):
                point, target, _, _, forced = self.relation.edge_log[forced_cursor]
                forced_cursor += 1
                if not forced:
                    continue
                left_residue = int(self.residue_by_point[point])
                right_residue = int(self.residue_by_point[target])
                if left_residue != right_residue:
                    self.relation_rejections += 1
                    return False
                if point > target:
                    point, target = target, point
                key = point * self.problem.degree + target
                mask = self.edge_masks[left_residue].get(key, 0)
                if mask == 0 or not self._restrict_domain(left_residue, mask):
                    self.relation_rejections += 1
                    return False
                if (
                    self.assignments[left_residue] < 0
                    and self.domains[left_residue].bit_count() == 1
                ):
                    queue.append(
                        (left_residue, self.domains[left_residue].bit_length() - 1)
                    )
        return True

    def search(
        self,
        *,
        max_nodes: int,
        deadline: float | None,
    ) -> GlobalSliceResult:
        """Return one full row, exact exhaustion, or a sealed resource frontier."""

        def visit() -> tuple[int, ...] | None:
            if deadline is not None and time.monotonic() >= deadline:
                raise SearchInterrupted
            if self.nodes >= max_nodes:
                raise SearchInterrupted
            unassigned = [
                residue
                for residue in range(self.residue_count)
                if self.assignments[residue] < 0
            ]
            if not unassigned:
                return tuple(self.assignments)
            residue = min(
                unassigned,
                key=lambda item: (self.domains[item].bit_count(), item),
            )
            domain = self.domains[residue]
            while domain:
                bit = domain & -domain
                domain ^= bit
                class_index = bit.bit_length() - 1
                self.nodes += 1
                checkpoint = self.checkpoint()
                if self.assign_with_propagation(residue, class_index):
                    result = visit()
                    if result is not None:
                        return result
                self.rollback(checkpoint)
            return None

        try:
            assignment = visit()
        except SearchInterrupted:
            return GlobalSliceResult(
                "incomplete",
                self.nodes,
                self.forced_domain_reductions,
                self.relation_rejections,
                None,
            )
        return GlobalSliceResult(
            "row-survives" if assignment is not None else "global-slice-exhausted",
            self.nodes,
            self.forced_domain_reductions,
            self.relation_rejections,
            assignment,
        )

    def materialize_row(self, assignment: Sequence[int]) -> np.ndarray:
        row = np.full(self.problem.degree, np.iinfo(UINT_DTYPE).max, dtype=UINT_DTYPE)
        for residue, class_index in enumerate(assignment):
            for point, target in self.class_edges[residue, int(class_index)]:
                row[int(point)] = int(target)
                row[int(target)] = int(point)
        if np.any(row == np.iinfo(UINT_DTYPE).max):
            raise CanonicalAugmentationError("A global class assignment missed points.")
        return row


def build_residue_by_point(
    problem: block.OverlapGluingProblem,
    residue_signatures: Sequence[Sequence[int]],
) -> np.ndarray:
    result = np.full(problem.degree, -1, dtype=np.int16)
    for residue, signature in enumerate(residue_signatures):
        for existing_block, port_index in enumerate(signature):
            points = problem.current_ports[existing_block][int(port_index)]
            if np.any(result[points] >= 0):
                raise CanonicalAugmentationError(
                    "A skeleton assigns one point to multiple C-residues."
                )
            result[points] = residue
    if np.any(result < 0):
        raise CanonicalAugmentationError("A skeleton does not cover all points.")
    return result


def build_edge_masks(
    degree: int, class_edges: np.ndarray
) -> tuple[dict[int, int], ...]:
    result: list[dict[int, int]] = []
    for residue in range(class_edges.shape[0]):
        masks: dict[int, int] = {}
        for class_index in range(class_edges.shape[1]):
            bit = 1 << class_index
            for point, target in class_edges[residue, class_index]:
                key = int(point) * degree + int(target)
                masks[key] = masks.get(key, 0) | bit
        result.append(masks)
    return tuple(result)


@njit(cache=True)
def _compiled_partial_relation_pass(
    depth: int,
    block_for_standard: np.ndarray,
    root_for_standard: np.ndarray,
    maps: np.ndarray,
    edge_left: np.ndarray,
    edge_right: np.ndarray,
    edge_coordinates: np.ndarray,
    pair_by_point: np.ndarray,
    pair_count: int,
) -> bool:
    first_neighbor = np.full(pair_count, -1, dtype=np.int32)
    second_neighbor = np.full(pair_count, -1, dtype=np.int32)
    for edge_index in range(len(edge_left)):
        left_standard = int(edge_left[edge_index])
        right_standard = int(edge_right[edge_index])
        if left_standard >= depth or right_standard >= depth:
            continue
        left_block = int(block_for_standard[left_standard])
        right_block = int(block_for_standard[right_standard])
        left_root = int(root_for_standard[left_standard])
        right_root = int(root_for_standard[right_standard])
        left_coordinate = int(edge_coordinates[edge_index, 0])
        right_coordinate = int(edge_coordinates[edge_index, 1])
        left_point = int(maps[left_standard, left_block, left_root, left_coordinate])
        right_point = int(
            maps[right_standard, right_block, right_root, right_coordinate]
        )
        left_pair = int(pair_by_point[left_point])
        right_pair = int(pair_by_point[right_point])
        if left_pair == right_pair:
            return False
        if (
            first_neighbor[left_pair] == right_pair
            or second_neighbor[left_pair] == right_pair
        ):
            return False
        if second_neighbor[left_pair] >= 0 or second_neighbor[right_pair] >= 0:
            return False
        if first_neighbor[left_pair] < 0:
            first_neighbor[left_pair] = right_pair
        else:
            second_neighbor[left_pair] = right_pair
        if first_neighbor[right_pair] < 0:
            first_neighbor[right_pair] = left_pair
        else:
            second_neighbor[right_pair] = left_pair

    seen = np.zeros(pair_count, dtype=np.uint8)
    queue = np.empty(4, dtype=np.int32)
    for root in range(pair_count):
        if seen[root] or first_neighbor[root] < 0:
            continue
        queue[0] = root
        seen[root] = 1
        cursor = 0
        size = 1
        edge_twice = 0
        while cursor < size:
            vertex = int(queue[cursor])
            cursor += 1
            for neighbor in (first_neighbor[vertex], second_neighbor[vertex]):
                if neighbor < 0:
                    continue
                edge_twice += 1
                if not seen[neighbor]:
                    if size >= 3:
                        return False
                    seen[neighbor] = 1
                    queue[size] = neighbor
                    size += 1
        edge_count = edge_twice // 2
        if edge_count >= size and not (size == 3 and edge_count == 3):
            return False
    return True


@njit(cache=True)
def _compiled_frame_search_from_prefix(
    depth: int,
    block_for_standard: np.ndarray,
    root_for_standard: np.ndarray,
    used_blocks: np.ndarray,
    maps: np.ndarray,
    edge_left: np.ndarray,
    edge_right: np.ndarray,
    edge_coordinates: np.ndarray,
    pair_by_point: np.ndarray,
    pair_count: int,
    max_nodes: int,
) -> tuple[int, int, int, np.ndarray, np.ndarray, np.ndarray]:
    """Iterative depth-first S7 x P7 search below an assigned prefix."""

    depth_nodes = np.zeros(9, dtype=np.int64)
    nodes = 0
    rejections = 0
    start_depth = depth
    next_value = np.zeros(8, dtype=np.int16)
    while depth >= start_depth:
        value = int(next_value[depth])
        advanced = False
        while value < 7 * 48:
            next_value[depth] = value + 1
            existing_block = value // 48 + 1
            root_coordinate = value % 48
            value += 1
            if used_blocks[existing_block]:
                continue
            nodes += 1
            depth_nodes[depth] += 1
            if nodes > max_nodes:
                return (
                    2,
                    nodes,
                    rejections,
                    block_for_standard,
                    root_for_standard,
                    depth_nodes,
                )
            block_for_standard[depth] = existing_block
            root_for_standard[depth] = root_coordinate
            if not _compiled_partial_relation_pass(
                depth + 1,
                block_for_standard,
                root_for_standard,
                maps,
                edge_left,
                edge_right,
                edge_coordinates,
                pair_by_point,
                pair_count,
            ):
                rejections += 1
                continue
            used_blocks[existing_block] = 1
            if depth == 7:
                return (
                    1,
                    nodes,
                    rejections,
                    block_for_standard,
                    root_for_standard,
                    depth_nodes,
                )
            depth += 1
            next_value[depth] = 0
            advanced = True
            break
        if advanced:
            continue
        next_value[depth] = 0
        block_for_standard[depth] = -1
        root_for_standard[depth] = -1
        depth -= 1
        if depth >= start_depth:
            used_blocks[int(block_for_standard[depth])] = 0
    return 0, nodes, rejections, block_for_standard, root_for_standard, depth_nodes


def search_root_frame_compiled(
    catalogue: RootFrameCatalogue,
    fixed_row: np.ndarray,
    root_signature: Sequence[int],
    *,
    max_nodes: int,
    prefix_depth: int = 3,
    prefix_start: int = 0,
    prefix_limit: int = 0,
) -> FrameSearchResult:
    maps, edge_left, edge_right, edge_coordinates = packed_frame_tables(
        catalogue, root_signature
    )
    pair_by_point = np.full(len(fixed_row), -1, dtype=np.int32)
    pair_count = 0
    for point in range(len(fixed_row)):
        if pair_by_point[point] >= 0:
            continue
        target = int(fixed_row[point])
        if target == point or int(fixed_row[target]) != point:
            raise CanonicalAugmentationError(
                "The fixed generator is not a free involution."
            )
        pair_by_point[point] = pair_count
        pair_by_point[target] = pair_count
        pair_count += 1
    if prefix_depth < 1 or prefix_depth > 7:
        raise CanonicalAugmentationError("Compiled prefix depth must lie in [1, 7].")
    nodes = 0
    rejections = 0
    depth_nodes = np.zeros(9, dtype=np.int64)
    status = 0
    blocks = np.full(8, -1, dtype=np.int8)
    roots = np.full(8, -1, dtype=np.int8)
    used = np.zeros(8, dtype=np.uint8)
    prefix_index = 0
    prefix_examined = 0
    for block_prefix in itertools.permutations(range(1, 8), prefix_depth):
        for root_prefix in itertools.product(range(48), repeat=prefix_depth):
            if prefix_index < prefix_start:
                prefix_index += 1
                continue
            if prefix_limit > 0 and prefix_examined >= prefix_limit:
                status = 3
                break
            prefix_examined += 1
            prefix_index += 1
            blocks = np.full(8, -1, dtype=np.int8)
            roots = np.full(8, -1, dtype=np.int8)
            used = np.zeros(8, dtype=np.uint8)
            blocks[0] = 0
            roots[0] = 0
            used[0] = 1
            valid = True
            for offset, (existing_block, root_coordinate) in enumerate(
                zip(block_prefix, root_prefix, strict=True), start=1
            ):
                blocks[offset] = existing_block
                roots[offset] = root_coordinate
                used[existing_block] = 1
                nodes += 1
                depth_nodes[offset] += 1
                if not _compiled_partial_relation_pass(
                    offset + 1,
                    blocks,
                    roots,
                    maps,
                    edge_left,
                    edge_right,
                    edge_coordinates,
                    pair_by_point,
                    pair_count,
                ):
                    rejections += 1
                    valid = False
                    break
            if not valid:
                continue
            remaining_budget = max_nodes - nodes
            if remaining_budget <= 0:
                status = 2
                break
            (
                child_status,
                child_nodes,
                child_rejections,
                blocks,
                roots,
                child_depth_nodes,
            ) = _compiled_frame_search_from_prefix(
                prefix_depth + 1,
                blocks,
                roots,
                used,
                maps,
                edge_left,
                edge_right,
                edge_coordinates,
                pair_by_point,
                pair_count,
                remaining_budget,
            )
            nodes += int(child_nodes)
            rejections += int(child_rejections)
            depth_nodes += child_depth_nodes
            if child_status != 0:
                status = int(child_status)
                break
        if status != 0:
            break
    frame = None
    if status == 1:
        frame = tuple(
            (
                int(blocks[standard]),
                int(root_signature[int(blocks[standard])]),
                int(roots[standard]),
            )
            for standard in range(8)
        )
    return FrameSearchResult(
        "root-frame-exhausted"
        if status == 0
        else "frame-survives"
        if status == 1
        else "prefix-window-complete"
        if status == 3
        else "incomplete",
        int(nodes),
        int(rejections),
        0,
        frame,
        0,
        tuple(map(int, depth_nodes)),
    )


def replay_complete_frame(
    catalogue: RootFrameCatalogue,
    fixed_row: np.ndarray,
    frame: Sequence[tuple[int, int, int]],
) -> bool:
    """Independently replay a compiled survivor on the full 5,760-point row."""

    local_row = np.arange(len(fixed_row), dtype=UINT_DTYPE)
    selected: set[int] = set()
    standard_to_current: dict[int, int] = {}
    for standard_port, (existing_block, port_index, root_coordinate) in enumerate(
        frame
    ):
        standard_points = catalogue.standard_points[standard_port]
        current_points = catalogue.point_map(
            standard_port, existing_block, port_index, root_coordinate
        )
        selected.update(map(int, current_points))
        standard_to_current.update(
            {
                int(standard): int(current)
                for standard, current in zip(
                    standard_points, current_points, strict=True
                )
            }
        )
    inverse = {current: standard for standard, current in standard_to_current.items()}
    if len(inverse) != 384 or len(selected) != 384:
        raise CanonicalAugmentationError(
            "A compiled frame did not identify one C-residue."
        )
    for current, standard in inverse.items():
        local_row[current] = standard_to_current[int(catalogue.local_new_row[standard])]
    mutable_region = np.asarray(
        sorted(set(range(len(fixed_row))) - selected), dtype=UINT_DTYPE
    )
    return (
        block.relation_failure_witness_avoiding_region(
            local_row, fixed_row, 3, mutable_region
        )
        is None
    )


def search_root_frame(
    catalogue: RootFrameCatalogue,
    fixed_row: np.ndarray,
    root_signature: Sequence[int],
    *,
    deadline: float | None,
    max_nodes: int,
) -> FrameSearchResult:
    """Find or exhaust full anchored ``S7 x P^7`` frames for one root residue."""

    problem = catalogue.problem
    if len(root_signature) != len(problem.current_ports) or root_signature[0] != 0:
        raise CanonicalAugmentationError(
            "A root signature must contain eight ports and start at zero."
        )
    selected = frozenset(
        int(point)
        for existing_block, port_index in enumerate(root_signature)
        for point in problem.current_ports[existing_block][int(port_index)]
    )
    if len(selected) != problem.local_groups[problem.stage.new_subset].order:
        raise CanonicalAugmentationError(
            "A root signature does not select one C-residue worth of points."
        )

    relation = TriangleRelationState(fixed_row, selected_points=selected)
    point_maps: list[np.ndarray | None] = [None] * len(catalogue.standard_points)
    assignments: list[tuple[int, int, int] | None] = [None] * len(point_maps)
    assigned_ports: set[int] = set()
    assigned_blocks: set[int] = set()
    block_to_standard = np.full(len(problem.current_ports), -1, dtype=np.int16)
    current_to_standard = np.full(problem.degree, -1, dtype=np.int16)
    assignment_log: list[int] = []
    selected_block_by_point = np.full(problem.degree, -1, dtype=np.int16)
    for existing_block, port_index in enumerate(root_signature):
        selected_block_by_point[
            problem.current_ports[existing_block][int(port_index)]
        ] = existing_block
    counters = {"nodes": 0, "relationRejections": 0}
    depth_nodes = [0] * (len(point_maps) + 1)
    best_forced = 0

    def rollback_assignments(checkpoint: int) -> None:
        while len(assignment_log) > checkpoint:
            standard_port = assignment_log.pop()
            assignment = assignments[standard_port]
            assert assignment is not None
            existing_block = assignment[0]
            current_map = point_maps[standard_port]
            assert current_map is not None
            current_to_standard[current_map] = -1
            block_to_standard[existing_block] = -1
            assigned_ports.remove(standard_port)
            assigned_blocks.remove(existing_block)
            assignments[standard_port] = None
            point_maps[standard_port] = None

    def forced_assignment_from_edge(
        point: int, target: int
    ) -> tuple[int, int, int] | None | bool:
        """Translate a forced g4 edge into a local-frame assignment.

        ``False`` means contradiction, ``None`` means the edge has no assigned
        endpoint yet, and a triple gives the unique assignment forced at the
        other endpoint.
        """

        left_block = int(selected_block_by_point[point])
        right_block = int(selected_block_by_point[target])
        if left_block < 0 or right_block < 0 or left_block == right_block:
            return False
        left_standard = int(block_to_standard[left_block])
        right_standard = int(block_to_standard[right_block])
        if left_standard < 0 and right_standard < 0:
            return None
        if left_standard >= 0 and right_standard >= 0:
            left_point = int(current_to_standard[point])
            right_point = int(current_to_standard[target])
            return (
                None
                if left_point >= 0
                and right_point >= 0
                and int(catalogue.local_new_row[left_point]) == right_point
                else False
            )
        if left_standard < 0:
            point, target = target, point
            left_block, right_block = right_block, left_block
            left_standard, right_standard = right_standard, left_standard
        standard_point = int(current_to_standard[point])
        if standard_point < 0:
            return False
        required_point = int(catalogue.local_new_row[standard_point])
        required_standard_port = int(catalogue.standard_port_by_point[required_point])
        if required_standard_port in assigned_ports or right_block in assigned_blocks:
            return False
        required_coordinate = int(
            catalogue.standard_coordinate_by_point[required_point]
        )
        port_index = int(root_signature[right_block])
        for root_coordinate in range(
            len(problem.current_ports[right_block][port_index])
        ):
            candidate_map = catalogue.point_map(
                required_standard_port,
                right_block,
                port_index,
                root_coordinate,
            )
            if int(candidate_map[required_coordinate]) == target:
                return required_standard_port, right_block, root_coordinate
        return False

    def assign_with_propagation(initial: tuple[int, int, int]) -> bool:
        queue = [initial]
        forced_cursor = len(relation.edge_log)
        while queue:
            standard_port, existing_block, root_coordinate = queue.pop()
            previous = assignments[standard_port]
            if previous is not None:
                if previous != (
                    existing_block,
                    int(root_signature[existing_block]),
                    root_coordinate,
                ):
                    return False
                continue
            if existing_block in assigned_blocks:
                return False
            port_index = int(root_signature[existing_block])
            current_map = catalogue.point_map(
                standard_port,
                existing_block,
                port_index,
                root_coordinate,
            )
            assignments[standard_port] = (
                existing_block,
                port_index,
                root_coordinate,
            )
            point_maps[standard_port] = current_map
            assigned_ports.add(standard_port)
            assigned_blocks.add(existing_block)
            assignment_log.append(standard_port)
            block_to_standard[existing_block] = standard_port
            standard_points = catalogue.standard_points[standard_port]
            current_to_standard[current_map] = standard_points

            for other in sorted(assigned_ports - {standard_port}):
                key = tuple(sorted((standard_port, other)))
                edges = catalogue.interactions.get(key)
                if edges is None:
                    continue
                other_map = point_maps[other]
                assert other_map is not None
                if standard_port < other:
                    left_map, right_map = current_map, other_map
                else:
                    left_map, right_map = other_map, current_map
                for left_coordinate, right_coordinate in edges:
                    if not relation.add_edge(
                        int(left_map[left_coordinate]),
                        int(right_map[right_coordinate]),
                    ):
                        return False

            while forced_cursor < len(relation.edge_log):
                point, target, _, _, forced = relation.edge_log[forced_cursor]
                forced_cursor += 1
                if not forced:
                    continue
                implication = forced_assignment_from_edge(point, target)
                if implication is False:
                    return False
                if implication is not None:
                    queue.append(implication)
        return True

    if not assign_with_propagation((0, 0, 0)):
        raise CanonicalAugmentationError("The canonical root anchor is inconsistent.")

    def choose_standard_port() -> int:
        unassigned = [
            index for index in range(1, len(point_maps)) if index not in assigned_ports
        ]
        return max(
            unassigned,
            key=lambda candidate: (
                sum(
                    1
                    for other in assigned_ports
                    if tuple(sorted((candidate, other))) in catalogue.interactions
                ),
                -candidate,
            ),
        )

    def visit() -> tuple[tuple[int, int, int], ...] | None:
        nonlocal best_forced
        if deadline is not None and time.monotonic() >= deadline:
            raise SearchInterrupted
        if counters["nodes"] >= max_nodes:
            raise SearchInterrupted
        if len(assigned_ports) == len(point_maps):
            if any(relation.partner[point] < 0 for point in selected):
                raise CanonicalAugmentationError(
                    "A complete local frame missed selected points."
                )
            return tuple(item for item in assignments if item is not None)

        standard_port = choose_standard_port()
        for existing_block in range(1, len(problem.current_ports)):
            if existing_block in assigned_blocks:
                continue
            port_index = int(root_signature[existing_block])
            for root_coordinate in range(
                len(problem.current_ports[existing_block][port_index])
            ):
                counters["nodes"] += 1
                depth_nodes[len(assigned_ports)] += 1
                checkpoint = relation.checkpoint()
                assignment_checkpoint = len(assignment_log)
                valid = assign_with_propagation(
                    (standard_port, existing_block, root_coordinate)
                )
                if valid:
                    frame = visit()
                    if frame is not None:
                        return frame
                else:
                    counters["relationRejections"] += 1
                best_forced = max(best_forced, relation.forced_edge_count)
                rollback_assignments(assignment_checkpoint)
                relation.rollback(checkpoint)
        return None

    try:
        frame = visit()
    except SearchInterrupted:
        return FrameSearchResult(
            "incomplete",
            counters["nodes"],
            counters["relationRejections"],
            best_forced,
            None,
            0,
            tuple(depth_nodes),
        )
    return FrameSearchResult(
        "frame-survives" if frame is not None else "root-frame-exhausted",
        counters["nodes"],
        counters["relationRejections"],
        best_forced,
        frame,
        sum(
            1
            for point, target, _, _, _ in relation.edge_log
            if point not in selected and target not in selected
        )
        if frame is not None
        else 0,
        tuple(depth_nodes),
    )


def checkpoint_payload(
    campaign_hash: str,
    next_case: int,
    counters: Mapping[str, Any],
    outcomes: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    return seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": "coxeter-canonical-augmentation-checkpoint",
            "backendVersion": BACKEND_VERSION,
            "campaignHash": campaign_hash,
            "nextCase": next_case,
            "counters": dict(counters),
            "outcomes": list(outcomes),
        }
    )


def load_checkpoint(path: Path | None, campaign_hash: str) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf8"))
    supplied = raw.get("artifactHash")
    if not isinstance(supplied, str) or seal(dict(raw))["artifactHash"] != supplied:
        raise CanonicalAugmentationError(
            "The canonical-augmentation checkpoint hash is invalid."
        )
    if (
        raw.get("artifactType") != "coxeter-canonical-augmentation-checkpoint"
        or raw.get("backendVersion") != BACKEND_VERSION
        or raw.get("campaignHash") != campaign_hash
    ):
        raise CanonicalAugmentationError(
            "The canonical-augmentation checkpoint is stale."
        )
    return raw


def run_minimum_root_sieve(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    """Exhaust distance-two skeletons in the fixed-tree minimum-root map slice."""

    started = time.monotonic()
    prep_args = argparse.Namespace(input=args.input, degree=args.degree)
    source, matrix, source_hash, first_states, problems, port_orbits = (
        block._prepare_root_witness_campaign(prep_args)
    )
    problem = problems[0]
    signature_counts = distance_two_root_signature_counts()
    signatures = tuple(sorted(signature_counts))
    expected_skeletons = 266_560
    if sum(signature_counts.values()) != expected_skeletons:
        raise CanonicalAugmentationError(
            "The distance-two skeleton count is incorrect."
        )
    implementation_hashes = {
        "pythonSha256": sha256_file(Path(__file__)),
        "blockBackendSha256": sha256_file(SCRIPT_DIR / "block_amalgam_cover_search.py"),
    }
    campaign_hash = sha256_json(
        {
            "backendVersion": BACKEND_VERSION,
            "sourceHash": source_hash,
            "scope": MINIMUM_ROOT_SCOPE_ID,
            "degree": args.degree,
            "problemHashes": [item.problem_hash for item in problems],
            "signatureMultiplicityHash": sha256_json(
                [
                    [list(signature), count]
                    for signature, count in sorted(signature_counts.items())
                ]
            ),
            "localPortCatalogueHash": sha256_json(
                [item.canonical_key for item in port_orbits]
            ),
            "implementationHashes": implementation_hashes,
        }
    )
    loaded = load_checkpoint(args.checkpoint, campaign_hash) if args.resume else None
    next_signature = int(loaded.get("nextCase", 0)) if loaded else 0
    outcomes = list(loaded.get("outcomes", [])) if loaded else []
    counters = {
        "signaturesExamined": 0,
        "localClassBranchEvaluations": 0,
        "excludedRootSignatures": 0,
        "survivingRootSignatures": 0,
    }
    if loaded:
        counters.update({key: int(value) for key, value in loaded["counters"].items()})
    if len(outcomes) != next_signature:
        raise CanonicalAugmentationError(
            "The minimum-root checkpoint index is inconsistent."
        )

    catalogue = RootFrameCatalogue(problem)
    maps, port_assignments = packed_minimum_root_tables(catalogue, port_orbits)
    fixed_rows = np.asarray(
        [state.rows[block.STAGES[0].new_generator] for state in first_states],
        dtype=UINT_DTYPE,
    )
    deadline = started + args.timeout_seconds if args.timeout_seconds > 0 else None
    timeout_reached = False
    while next_signature < len(signatures):
        if deadline is not None and time.monotonic() >= deadline:
            timeout_reached = True
            break
        end = min(len(signatures), next_signature + args.signature_chunk_size)
        batch = np.asarray(signatures[next_signature:end], dtype=np.int8)
        counts, evaluations = _minimum_root_survivor_counts(
            batch,
            port_assignments,
            maps,
            catalogue.standard_port_by_point,
            catalogue.standard_coordinate_by_point,
            catalogue.local_new_row,
            fixed_rows,
        )
        for offset, signature in enumerate(signatures[next_signature:end]):
            branch_counts = list(map(int, counts[offset]))
            excluded = not any(branch_counts)
            outcomes.append(
                {
                    "rootSignature": list(signature),
                    "skeletonMultiplicity": signature_counts[signature],
                    "survivingMinimumRootClassesByBranch": branch_counts,
                    "status": "root-slice-excluded"
                    if excluded
                    else "root-slice-survives",
                }
            )
            counters["signaturesExamined"] += 1
            counters[
                "excludedRootSignatures" if excluded else "survivingRootSignatures"
            ] += 1
        counters["localClassBranchEvaluations"] += int(evaluations)
        next_signature = end
        if args.checkpoint is not None:
            atomic_write_json(
                args.checkpoint,
                checkpoint_payload(campaign_hash, next_signature, counters, outcomes),
            )

    scope_complete = not timeout_reached and next_signature == len(signatures)
    excluded_skeletons = (
        sum(
            int(outcome["skeletonMultiplicity"])
            for outcome in outcomes
            if outcome["status"] == "root-slice-excluded"
        )
        if scope_complete
        else None
    )
    surviving_skeletons = (
        expected_skeletons - int(excluded_skeletons)
        if excluded_skeletons is not None
        else None
    )
    if args.checkpoint is not None:
        atomic_write_json(
            args.checkpoint,
            checkpoint_payload(campaign_hash, next_signature, counters, outcomes),
        )
    artifact = seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "backendVersion": BACKEND_VERSION,
            "status": "complete" if scope_complete else "incomplete",
            "complete": scope_complete,
            "scopeExcluded": scope_complete and surviving_skeletons == 0,
            "globalSecondGluingComplete": False,
            "sourceSystem": source,
            "inputHash": source_hash,
            "degree": args.degree,
            "scope": {
                "id": MINIMUM_ROOT_SCOPE_ID,
                "claim": (
                    "Every one of the 266,560 existing-side skeletons at total "
                    "transposition distance two is canonically generated once and "
                    "tested on its exact root signature against all 210 local C/P "
                    "classes and all seven first-stage branches, with minimum-root "
                    "equivariant maps on the fixed standard tree."
                ),
                "existingSideSkeletonCount": expected_skeletons,
                "rootSignatureCount": len(signatures),
                "excludedSkeletonCount": excluded_skeletons,
                "unresolvedSkeletonCount": surviving_skeletons,
                "localPortClassCount": len(port_orbits),
                "firstStageBranchCount": len(first_states),
            },
            "proof": {
                "relation": "(g4 g7)^3 = 1",
                "method": (
                    "For each root signature and local C/P class, construct the exact "
                    "384-point local g4 row and search every alternating relation walk "
                    "whose three g4 inputs remain in that residue."
                ),
                "outcomeCatalogueSha256": sha256_json(outcomes),
                "outcomes": outcomes,
            },
            "search": {
                "scopeComplete": scope_complete,
                "checkpointLoaded": loaded is not None,
                "nextSignature": next_signature,
                "timeoutReached": timeout_reached,
                "elapsedSeconds": round(time.monotonic() - started, 6),
                "counters": counters,
            },
            "warnings": [
                "This is complete only for the fixed-tree minimum-root map slice.",
                "The full local torsor factor is 24^15 * 48^105; it is not reduced to 48^98 by the known residual first-stage centralizer.",
                "A surviving root slice is not a second-gluing row or a cover candidate.",
            ],
            "provenance": {
                "campaignHash": campaign_hash,
                "problemHashes": [item.problem_hash for item in problems],
                "implementationHashes": implementation_hashes,
            },
        }
    )
    return artifact, 0 if scope_complete else 2


def load_bound_slice_artifact(path: Path, source_hash: str) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf8"))
    supplied = raw.get("artifactHash")
    if not isinstance(supplied, str) or seal(dict(raw))["artifactHash"] != supplied:
        raise CanonicalAugmentationError("The R6 slice artifact hash is invalid.")
    if (
        raw.get("artifactType") != ARTIFACT_TYPE
        or raw.get("scope", {}).get("id") != MINIMUM_ROOT_SCOPE_ID
        or not raw.get("complete")
        or raw.get("inputHash") != source_hash
    ):
        raise CanonicalAugmentationError(
            "The R6 slice artifact is stale or incomplete."
        )
    return raw


def run_global_minimum_root_slice(
    args: argparse.Namespace,
) -> tuple[dict[str, Any], int]:
    """Propagate R6's minimum-root local classes across all fifteen residues."""

    started = time.monotonic()
    prep_args = argparse.Namespace(input=args.input, degree=args.degree)
    source, matrix, source_hash, first_states, problems, port_orbits = (
        block._prepare_root_witness_campaign(prep_args)
    )
    problem = problems[0]
    slice_artifact = load_bound_slice_artifact(args.slice_artifact, source_hash)
    cases: list[tuple[tuple[int, ...], int]] = []
    for outcome in slice_artifact["proof"]["outcomes"]:
        if outcome["status"] != "root-slice-survives":
            continue
        signature = tuple(map(int, outcome["rootSignature"]))
        if int(outcome["skeletonMultiplicity"]) != 1:
            raise CanonicalAugmentationError(
                "A global R7 case is not a unique support-two skeleton."
            )
        for branch, count in enumerate(outcome["survivingMinimumRootClassesByBranch"]):
            if int(count) > 0:
                cases.append((signature, branch))
    implementation_hashes = {
        "pythonSha256": sha256_file(Path(__file__)),
        "blockBackendSha256": sha256_file(SCRIPT_DIR / "block_amalgam_cover_search.py"),
    }
    campaign_hash = sha256_json(
        {
            "backendVersion": BACKEND_VERSION,
            "sourceHash": source_hash,
            "scope": GLOBAL_MINIMUM_ROOT_SCOPE_ID,
            "degree": args.degree,
            "sliceArtifactHash": slice_artifact["artifactHash"],
            "problemHashes": [item.problem_hash for item in problems],
            "cases": [[list(signature), branch] for signature, branch in cases],
            "maxGlobalNodesPerCase": args.max_global_nodes_per_case,
            "implementationHashes": implementation_hashes,
        }
    )
    loaded = load_checkpoint(args.checkpoint, campaign_hash) if args.resume else None
    next_case = int(loaded.get("nextCase", 0)) if loaded else 0
    outcomes = list(loaded.get("outcomes", [])) if loaded else []
    counters = {
        "casesExamined": 0,
        "globalSearchNodes": 0,
        "forcedDomainReductions": 0,
        "relationRejections": 0,
        "exhaustedCases": 0,
        "survivingRows": 0,
        "incompleteCases": 0,
    }
    if loaded:
        counters.update({key: int(value) for key, value in loaded["counters"].items()})
    if len(outcomes) != next_case:
        raise CanonicalAugmentationError(
            "The R7 checkpoint case index is inconsistent."
        )

    catalogue = RootFrameCatalogue(problem)
    maps, port_assignments = packed_minimum_root_tables(catalogue, port_orbits)
    _, edge_left, edge_right, edge_coordinates = packed_frame_tables(
        catalogue, (0,) * 8
    )
    all_spherical = [
        classified
        for mask in range(1, 1 << len(matrix))
        if (
            classified := block.shared.classify_spherical_subset(
                matrix,
                tuple(index for index in range(len(matrix)) if mask & (1 << index)),
            )
        )
        is not None
    ]
    deadline = started + args.timeout_seconds if args.timeout_seconds > 0 else None
    cached_signature: tuple[int, ...] | None = None
    cached_columns: tuple[tuple[int, ...], ...] | None = None
    cached_edges: np.ndarray | None = None
    cached_masks: tuple[dict[int, int], ...] | None = None
    cached_residue_by_point: np.ndarray | None = None
    timeout_reached = False
    for case_index in range(next_case, len(cases)):
        if deadline is not None and time.monotonic() >= deadline:
            timeout_reached = True
            next_case = case_index
            break
        signature, branch = cases[case_index]
        if signature != cached_signature:
            cached_signature = signature
            cached_columns = distance_two_skeleton_columns(signature)
            cached_edges = _packed_residue_class_edges(
                np.asarray(cached_columns, dtype=np.int8),
                port_assignments,
                maps,
                edge_left,
                edge_right,
                edge_coordinates,
            )
            cached_masks = build_edge_masks(args.degree, cached_edges)
            cached_residue_by_point = build_residue_by_point(problem, cached_columns)
        assert cached_columns is not None
        assert cached_edges is not None
        assert cached_masks is not None
        assert cached_residue_by_point is not None
        fixed_row = first_states[branch].rows[block.STAGES[0].new_generator]
        assert fixed_row is not None
        solver = MinimumRootGlobalSolver(
            problem,
            fixed_row,
            cached_columns,
            cached_edges,
            edge_masks=cached_masks,
            residue_by_point=cached_residue_by_point,
        )
        result = solver.search(
            max_nodes=args.max_global_nodes_per_case,
            deadline=deadline,
        )
        row_hash = None
        if result.class_assignment is not None:
            row = solver.materialize_row(result.class_assignment)
            updated_rows = list(first_states[branch].rows)
            updated_rows[problem.stage.new_generator] = row
            candidate = block.SearchState(tuple(updated_rows), (branch,))
            if (
                not block.pair_relation_pass(row, fixed_row, 3)
                or not block.finite_pair_relations_pass(candidate.rows, matrix)
                or not block.subgroup_action_is_regular(
                    candidate.rows,
                    problem.stage.new_subset,
                    problem.local_groups[problem.stage.new_subset].order,
                    args.degree,
                )
                or not block.newly_completed_spherical_checks(
                    candidate,
                    problem.stage.new_generator,
                    all_spherical,
                    args.degree,
                )
            ):
                raise CanonicalAugmentationError(
                    "A propagated R7 row failed independent relation or spherical replay."
                )
            row_hash = hashlib.sha256(row.tobytes()).hexdigest()
        outcome = {
            "rootSignature": list(signature),
            "firstStageBranch": branch,
            "status": result.status,
            "nodes": result.nodes,
            "forcedDomainReductions": result.forced_domain_reductions,
            "relationRejections": result.relation_rejections,
            "classAssignment": list(result.class_assignment)
            if result.class_assignment is not None
            else None,
            "g4RowSha256": row_hash,
        }
        outcomes.append(outcome)
        counters["casesExamined"] += 1
        counters["globalSearchNodes"] += result.nodes
        counters["forcedDomainReductions"] += result.forced_domain_reductions
        counters["relationRejections"] += result.relation_rejections
        if result.status == "global-slice-exhausted":
            counters["exhaustedCases"] += 1
        elif result.status == "row-survives":
            counters["survivingRows"] += 1
        else:
            counters["incompleteCases"] += 1
            timeout_reached = True
        next_case = case_index + 1
        if args.checkpoint is not None and (
            counters["casesExamined"] % args.checkpoint_every == 0
            or result.status == "incomplete"
        ):
            atomic_write_json(
                args.checkpoint,
                checkpoint_payload(campaign_hash, next_case, counters, outcomes),
            )
        if result.status == "incomplete":
            break
    else:
        next_case = len(cases)

    scope_complete = next_case == len(cases) and counters["incompleteCases"] == 0
    survivors = [item for item in outcomes if item["status"] == "row-survives"]
    if args.checkpoint is not None:
        atomic_write_json(
            args.checkpoint,
            checkpoint_payload(campaign_hash, next_case, counters, outcomes),
        )
    artifact = seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "backendVersion": BACKEND_VERSION,
            "status": (
                "candidate-found"
                if survivors
                else "exhausted"
                if scope_complete
                else "incomplete"
            ),
            "complete": scope_complete,
            "scopeExcluded": scope_complete and not survivors,
            "globalSecondGluingComplete": False,
            "sourceSystem": source,
            "inputHash": source_hash,
            "degree": args.degree,
            "scope": {
                "id": GLOBAL_MINIMUM_ROOT_SCOPE_ID,
                "claim": (
                    "Every locally viable distance-two skeleton/branch case in the "
                    "fixed-tree minimum-root slice is propagated across all fifteen "
                    "C-residues using exact 210-bit local-class domains and forced "
                    "alternating-relation triangle edges."
                ),
                "inputR6ArtifactHash": slice_artifact["artifactHash"],
                "rootSignatureCount": slice_artifact["scope"][
                    "unresolvedSkeletonCount"
                ],
                "caseCount": len(cases),
            },
            "proof": {
                "relation": "(g4 g7)^3 = 1",
                "method": (
                    "Assign one exact minimum-root C/P class per C-residue. Every "
                    "three-vertex path in the g7-contracted g4 graph forces its closing "
                    "edge, which intersects the 210-bit domain of the owning residue."
                ),
                "outcomeCatalogueSha256": sha256_json(outcomes),
                "outcomes": outcomes,
                "survivingRows": survivors,
            },
            "search": {
                "scopeComplete": scope_complete,
                "checkpointLoaded": loaded is not None,
                "nextCase": next_case,
                "timeoutReached": timeout_reached,
                "elapsedSeconds": round(time.monotonic() - started, 6),
                "counters": counters,
            },
            "promotionCriterion": (
                "An R7 survivor is a complete second-gluing g4 row only. Later "
                "generators and the independent full-action spherical-freeness "
                "certificate remain mandatory."
            ),
            "warnings": [
                "This is complete only for distance two and the fixed-tree minimum-root map slice.",
                "No negative R7 result is a torsion-free cover certificate.",
            ],
            "provenance": {
                "campaignHash": campaign_hash,
                "problemHashes": [item.problem_hash for item in problems],
                "implementationHashes": implementation_hashes,
            },
        }
    )
    return artifact, 0 if scope_complete or survivors else 2


def run(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    started = time.monotonic()
    prep_args = argparse.Namespace(input=args.input, degree=args.degree)
    source, matrix, source_hash, first_states, problems, _ = (
        block._prepare_root_witness_campaign(prep_args)
    )
    problem = problems[0]
    signature_counts = distance_two_root_signature_counts()
    expected_skeletons = 266_560
    if sum(signature_counts.values()) != expected_skeletons:
        raise CanonicalAugmentationError(
            "The distance-two skeleton count is incorrect."
        )
    cases = [
        (signature, branch)
        for signature in sorted(signature_counts)
        for branch in range(len(first_states))
    ]
    if args.case_limit > 0:
        cases = cases[args.case_start : args.case_start + args.case_limit]
    elif args.case_start > 0:
        cases = cases[args.case_start :]
    implementation_hashes = {
        "pythonSha256": sha256_file(Path(__file__)),
        "blockBackendSha256": sha256_file(SCRIPT_DIR / "block_amalgam_cover_search.py"),
    }
    campaign_hash = sha256_json(
        {
            "backendVersion": BACKEND_VERSION,
            "sourceHash": source_hash,
            "scope": SCOPE_ID,
            "degree": args.degree,
            "problemHashes": [item.problem_hash for item in problems],
            "signatureMultiplicityHash": sha256_json(
                [
                    [list(signature), count]
                    for signature, count in sorted(signature_counts.items())
                ]
            ),
            "maxFrameNodesPerCase": args.max_frame_nodes_per_case,
            "caseStart": args.case_start,
            "caseLimit": args.case_limit,
            "prefixDepth": args.prefix_depth,
            "prefixStart": args.prefix_start,
            "prefixLimit": args.prefix_limit,
            "implementationHashes": implementation_hashes,
        }
    )
    loaded = load_checkpoint(args.checkpoint, campaign_hash) if args.resume else None
    next_case = int(loaded.get("nextCase", 0)) if loaded else 0
    counters = {
        "casesExamined": 0,
        "rootFrameNodes": 0,
        "relationRejections": 0,
        "rootFrameExhaustedCases": 0,
        "survivingFrameCases": 0,
        "incompleteCases": 0,
    }
    if loaded:
        counters.update({key: int(value) for key, value in loaded["counters"].items()})
    outcomes = list(loaded.get("outcomes", [])) if loaded else []
    if len(outcomes) != next_case:
        raise CanonicalAugmentationError("The checkpoint case index is inconsistent.")

    catalogue = RootFrameCatalogue(problem)
    deadline = started + args.timeout_seconds if args.timeout_seconds > 0 else None
    timeout_reached = False
    for case_index in range(next_case, len(cases)):
        if deadline is not None and time.monotonic() >= deadline:
            timeout_reached = True
            next_case = case_index
            break
        signature, branch = cases[case_index]
        fixed_row = first_states[branch].rows[block.STAGES[0].new_generator]
        assert fixed_row is not None
        result = search_root_frame_compiled(
            catalogue,
            fixed_row,
            signature,
            max_nodes=args.max_frame_nodes_per_case,
            prefix_depth=args.prefix_depth,
            prefix_start=args.prefix_start,
            prefix_limit=args.prefix_limit,
        )
        if result.frame is not None and not replay_complete_frame(
            catalogue, fixed_row, result.frame
        ):
            raise CanonicalAugmentationError(
                "The compiled frame solver disagreed with the full relation replay."
            )
        outcome = {
            "rootSignature": list(signature),
            "skeletonMultiplicity": signature_counts[signature],
            "firstStageBranch": branch,
            "status": result.status,
            "nodes": result.nodes,
            "relationRejections": result.relation_rejections,
            "maxForcedEdges": result.forced_edges,
            "boundaryForcedEdgeCount": result.boundary_forced_edge_count,
            "depthNodes": list(result.depth_nodes),
            "survivingFrame": [list(item) for item in result.frame]
            if result.frame is not None
            else None,
        }
        outcomes.append(outcome)
        counters["casesExamined"] += 1
        counters["rootFrameNodes"] += result.nodes
        counters["relationRejections"] += result.relation_rejections
        if result.status == "root-frame-exhausted":
            counters["rootFrameExhaustedCases"] += 1
        elif result.status == "frame-survives":
            counters["survivingFrameCases"] += 1
        elif result.status == "incomplete":
            counters["incompleteCases"] += 1
            timeout_reached = True
        next_case = case_index + 1
        if args.checkpoint is not None and (
            counters["casesExamined"] % args.checkpoint_every == 0
            or result.status == "incomplete"
        ):
            atomic_write_json(
                args.checkpoint,
                checkpoint_payload(campaign_hash, next_case, counters, outcomes),
            )
        if result.status == "incomplete":
            break
    else:
        next_case = len(cases)

    window_complete = next_case == len(cases) and counters["incompleteCases"] == 0
    full_case_scope = args.case_start == 0 and args.case_limit == 0
    full_prefix_scope = args.prefix_start == 0 and args.prefix_limit == 0
    scope_complete = window_complete and full_case_scope and full_prefix_scope
    branch_status: dict[tuple[int, ...], set[int]] = {}
    for outcome in outcomes:
        if outcome["status"] == "frame-survives":
            branch_status.setdefault(tuple(outcome["rootSignature"]), set()).add(
                int(outcome["firstStageBranch"])
            )
    unresolved_skeletons = sum(
        signature_counts[signature] for signature in branch_status
    )
    excluded_skeletons = (
        expected_skeletons - unresolved_skeletons if scope_complete else 0
    )
    compact_outcomes = {
        "catalogueSha256": sha256_json(outcomes),
        "sample": [*outcomes[:2], *outcomes[-2:]] if outcomes else [],
        "survivingRootSignatureCount": len(branch_status),
        "survivingRootSignatures": [
            {
                "rootSignature": list(signature),
                "skeletonMultiplicity": signature_counts[signature],
                "survivingBranches": sorted(branches),
            }
            for signature, branches in sorted(branch_status.items())[: args.max_samples]
        ],
    }
    if args.checkpoint is not None:
        atomic_write_json(
            args.checkpoint,
            checkpoint_payload(campaign_hash, next_case, counters, outcomes),
        )
    artifact = seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "backendVersion": BACKEND_VERSION,
            "status": "complete"
            if scope_complete
            else "window-complete"
            if window_complete
            else "incomplete",
            "complete": scope_complete,
            "scopeExcluded": scope_complete and unresolved_skeletons == 0,
            "globalSecondGluingComplete": False,
            "sourceSystem": source,
            "inputHash": source_hash,
            "degree": args.degree,
            "scope": {
                "id": SCOPE_ID,
                "claim": (
                    "Canonical enumeration of every existing-side skeleton at total "
                    "transposition distance two, compressed by its exact root-port "
                    "signature multiplicity, followed by the full anchored S7 x P^7 "
                    "root-frame relation sieve."
                ),
                "existingSideSkeletonCount": expected_skeletons,
                "rootSignatureCount": len(signature_counts),
                "caseCount": len(cases),
                "caseStart": args.case_start,
                "caseLimit": args.case_limit,
                "prefixDepth": args.prefix_depth,
                "prefixStart": args.prefix_start,
                "prefixLimit": args.prefix_limit,
                "excludedSkeletonCount": excluded_skeletons,
                "unresolvedSkeletonCount": unresolved_skeletons
                if scope_complete
                else None,
                "fullLocalFrameCountPerSignature": str(math.factorial(7) * 48**7),
            },
            "proof": {
                "relation": "(g4 g7)^3 = 1",
                "method": (
                    "Anchor one standard P-port and point, enumerate S7 x P^7 "
                    "without frame duplication, contract fixed g7 edges, and enforce "
                    "that the partial g4 graph extends to disjoint triangles."
                ),
                "freeS3ActionRequired": True,
                "outcomes": compact_outcomes,
            },
            "search": {
                "scopeComplete": scope_complete,
                "windowComplete": window_complete,
                "checkpointLoaded": loaded is not None,
                "nextCase": next_case,
                "timeoutReached": timeout_reached,
                "elapsedSeconds": round(time.monotonic() - started, 6),
                "counters": counters,
            },
            "warnings": [
                "A surviving root frame is not a second-gluing row or a cover candidate.",
                "The other fourteen C-residues, their propagated forced edges, later generators, and independent spherical-freeness checks remain open.",
                "This R6 artifact supersedes the broader all-holonomy wording formerly attached to fixed-tree R4/R5 root witnesses.",
            ],
            "provenance": {
                "campaignHash": campaign_hash,
                "problemHashes": [item.problem_hash for item in problems],
                "implementationHashes": implementation_hashes,
            },
        }
    )
    return artifact, 0 if window_complete else 2


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Run exact canonical augmentation on the distance-two compact-cube port frontier."
    )
    result.add_argument("--input", required=True, type=Path)
    result.add_argument("--output", required=True, type=Path)
    result.add_argument(
        "--mode",
        choices=(
            "minimum-root-sieve",
            "minimum-root-global",
            "full-frame-prefix",
        ),
        default="minimum-root-sieve",
    )
    result.add_argument("--degree", type=int, default=block.DEFAULT_DEGREE)
    result.add_argument("--checkpoint", type=Path)
    result.add_argument("--resume", action="store_true")
    result.add_argument("--checkpoint-every", type=int, default=25)
    result.add_argument("--timeout-seconds", type=int, default=21_600)
    result.add_argument("--max-frame-nodes-per-case", type=int, default=2_000_000)
    result.add_argument("--max-global-nodes-per-case", type=int, default=2_000_000)
    result.add_argument(
        "--slice-artifact",
        type=Path,
        default=(
            SCRIPT_DIR
            / "certificates"
            / "torsion-free"
            / "compact_5_cube_block_amalgam_r6_distance_two_5760.json"
        ),
    )
    result.add_argument("--case-start", type=int, default=0)
    result.add_argument("--case-limit", type=int, default=0)
    result.add_argument("--prefix-depth", type=int, default=3)
    result.add_argument("--prefix-start", type=int, default=0)
    result.add_argument("--prefix-limit", type=int, default=0)
    result.add_argument("--max-samples", type=int, default=64)
    result.add_argument("--signature-chunk-size", type=int, default=64)
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.mode == "minimum-root-sieve":
            artifact, code = run_minimum_root_sieve(args)
        elif args.mode == "minimum-root-global":
            artifact, code = run_global_minimum_root_slice(args)
        else:
            artifact, code = run(args)
    except Exception as exc:  # fail closed with a hashable diagnostic
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
