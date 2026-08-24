#!/usr/bin/env python3
"""Benchmark the full-cover pipeline on a deterministic 103,680-point action.

The scale fixture is not random data.  Its finite image is

    I2(3) x I2(4) x I2(5) x I2(6) x I2(9),

acting regularly on itself.  Five cross-factor generator pairs are declared
infinite in the source Coxeter system.  The remaining spherical subsets form
the boundary of a five-dimensional cross-polytope.  Restriction to every
spherical subgroup is therefore free, while the full action still has the
size and cell density expected of a first manageable compact-example cover.

The benchmark deliberately does not build a quotient JSON document.  It
streams cells, wall constraints, pulling simplices, and local-link summaries
through counters and SHA-256 digests.  Packed arrays are retained only when a
later stage needs them.  This keeps the measurement about the algorithms rather
than Python dictionaries or decimal permutation rows.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import os
import struct
import sys
import time
from array import array
from collections import Counter, deque
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Any, Callable, Sequence


SCHEMA_VERSION = 1
BENCHMARK_ID = "synthetic-full-cover-scale-v1"
UINT32_BYTES = array("I").itemsize
UINT16_BYTES = array("H").itemsize
INT8_BYTES = array("b").itemsize


class BenchmarkInvariantError(RuntimeError):
    """The synthetic action or a streamed pipeline stage violated its contract."""


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def _pack_uints(*values: int) -> bytes:
    return struct.pack(f"<{len(values)}Q", *values)


def _semantic_check(name: str, passed: bool, detail: str) -> dict[str, Any]:
    return {"name": name, "passed": bool(passed), "detail": detail}


def _windows_memory_snapshot() -> tuple[int, int] | None:
    """Return current and peak working sets through the stable Win32 ABI."""

    if sys.platform != "win32":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        class ProcessMemoryCounters(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        get_current_process = ctypes.windll.kernel32.GetCurrentProcess
        get_current_process.argtypes = []
        get_current_process.restype = wintypes.HANDLE
        get_process_memory_info = ctypes.windll.psapi.GetProcessMemoryInfo
        get_process_memory_info.argtypes = [
            wintypes.HANDLE,
            ctypes.POINTER(ProcessMemoryCounters),
            wintypes.DWORD,
        ]
        get_process_memory_info.restype = wintypes.BOOL

        counters = ProcessMemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        ok = get_process_memory_info(
            get_current_process(), ctypes.byref(counters), counters.cb
        )
        if not ok:
            return None
        return int(counters.WorkingSetSize), int(counters.PeakWorkingSetSize)
    except (AttributeError, OSError, TypeError):
        return None


def current_rss_bytes() -> int | None:
    """Return the current resident set without adding a runtime dependency."""

    if sys.platform == "win32":
        snapshot = _windows_memory_snapshot()
        return snapshot[0] if snapshot else None

    statm = Path("/proc/self/statm")
    if statm.is_file():
        try:
            resident_pages = int(statm.read_text(encoding="ascii").split()[1])
            return resident_pages * int(os.sysconf("SC_PAGE_SIZE"))
        except (OSError, ValueError, IndexError):
            return None
    return None


def peak_rss_bytes() -> int | None:
    """Return the process peak RSS, normalized to bytes where available."""

    if sys.platform == "win32":
        snapshot = _windows_memory_snapshot()
        return snapshot[1] if snapshot else None

    try:
        import resource

        peak = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        # Linux reports KiB; macOS and the BSDs report bytes.
        return peak if sys.platform == "darwin" else peak * 1024
    except (ImportError, OSError, ValueError):
        return None


@dataclass(frozen=True)
class DihedralFactor:
    """One I2(m) factor, encoded by rotation exponent and reflection bit."""

    m: int
    first_generator: int
    second_generator: int
    stride: int

    @property
    def radix(self) -> int:
        return 2 * self.m


class SyntheticCoxeterAction:
    """Procedural regular action used by the benchmark.

    Elements of each ``I2(m)`` factor are encoded as ``r^k s^e`` by the digit
    ``2*k + e``.  Generator rows are evaluated arithmetically, so the scale run
    never allocates the roughly four-megabyte row for each generator.
    """

    def __init__(self, relation_orders: Sequence[int]) -> None:
        if len(relation_orders) < 2:
            raise ValueError("The synthetic action needs at least two factors.")
        if any(m < 2 for m in relation_orders):
            raise ValueError("Every dihedral relation order must be at least two.")

        factors: list[DihedralFactor] = []
        stride = 1
        for factor_index, relation_order in enumerate(relation_orders):
            factors.append(
                DihedralFactor(
                    m=int(relation_order),
                    first_generator=2 * factor_index,
                    second_generator=2 * factor_index + 1,
                    stride=stride,
                )
            )
            stride *= 2 * int(relation_order)
        self.factors = tuple(factors)
        self.degree = stride
        self.generator_count = 2 * len(factors)

        # Removing this perfect matching from the finite-relation graph makes
        # its flag complex the boundary of a cross-polytope.  None of these
        # pairs is a dihedral factor pair.
        half = len(factors)
        self.forbidden_pairs = frozenset(
            tuple(sorted((index, index + half))) for index in range(half)
        )
        if any(left // 2 == right // 2 for left, right in self.forbidden_pairs):
            raise ValueError("The infinite matching collided with a factor pair.")

    @classmethod
    def scale_fixture(cls) -> SyntheticCoxeterAction:
        return cls((3, 4, 5, 6, 9))

    @classmethod
    def smoke_fixture(cls) -> SyntheticCoxeterAction:
        # Three factors keep the test fixture small while still exercising
        # genuine rank-three Coxeter cells and recursive pulling.
        return cls((3, 4, 5))

    @property
    def relation_orders(self) -> tuple[int, ...]:
        return tuple(factor.m for factor in self.factors)

    @property
    def finite_pair_count(self) -> int:
        return math.comb(self.generator_count, 2) - len(self.forbidden_pairs)

    def relation_order(self, first: int, second: int) -> int | None:
        if first == second:
            return 1
        left, right = sorted((int(first), int(second)))
        if (left, right) in self.forbidden_pairs:
            return None
        if left // 2 == right // 2:
            return self.factors[left // 2].m
        return 2

    def finite_pairs(self) -> tuple[tuple[int, int, int], ...]:
        return tuple(
            (first, second, int(relation_order))
            for first in range(self.generator_count)
            for second in range(first + 1, self.generator_count)
            if (relation_order := self.relation_order(first, second)) is not None
        )

    def apply(self, point: int, generator: int) -> int:
        """Apply one source generator by right multiplication."""

        if not 0 <= point < self.degree:
            raise IndexError(f"Point {point} is outside degree {self.degree}.")
        if not 0 <= generator < self.generator_count:
            raise IndexError(f"Generator {generator} is outside the source rank.")
        factor = self.factors[generator // 2]
        digit = (point // factor.stride) % factor.radix
        rotation, reflected = divmod(digit, 2)
        if generator == factor.first_generator:
            new_digit = digit ^ 1
        elif reflected == 0:
            new_digit = 2 * ((rotation - 1) % factor.m) + 1
        else:
            new_digit = 2 * ((rotation + 1) % factor.m)
        return point + (new_digit - digit) * factor.stride

    def spherical(self, generators: Sequence[int]) -> bool:
        selected = set(generators)
        return not any(
            first in selected and second in selected
            for first, second in self.forbidden_pairs
        )

    def subgroup_order(self, generators: Sequence[int]) -> int:
        """Return the exact special-subgroup order for a spherical subset."""

        if not self.spherical(generators):
            raise ValueError("An infinite special subgroup has no finite order.")
        selected = set(generators)
        order = 1
        for factor in self.factors:
            count = int(factor.first_generator in selected) + int(
                factor.second_generator in selected
            )
            if count == 1:
                order *= 2
            elif count == 2:
                order *= factor.radix
        return order

    def spherical_subsets(
        self, max_rank: int | None = None
    ) -> tuple[tuple[int, ...], ...]:
        limit = (
            self.generator_count
            if max_rank is None
            else min(max_rank, self.generator_count)
        )
        return tuple(
            subset
            for size in range(1, limit + 1)
            for subset in combinations(range(self.generator_count), size)
            if self.spherical(subset)
        )

    def canonical_coset_point(self, point: int, generators: Sequence[int]) -> int:
        """Return the least point in the right special-subgroup orbit.

        The synthetic image is a direct product, so minimization separates by
        dihedral coordinate.  Production code cannot assume this shortcut; the
        benchmark uses it only to stream cell representatives without a global
        dictionary of millions of cell IDs.
        """

        return self.canonical_coset_point_mask(point, _mask(generators))

    def canonical_coset_point_mask(self, point: int, generator_mask: int) -> int:
        """Bitmask form of :meth:`canonical_coset_point` for hot cell scans."""

        canonical = point
        for factor in self.factors:
            first = bool(generator_mask & (1 << factor.first_generator))
            second = bool(generator_mask & (1 << factor.second_generator))
            if not first and not second:
                continue
            digit = (point // factor.stride) % factor.radix
            if first and second:
                replacement = 0
            else:
                active = factor.first_generator if first else factor.second_generator
                target = self.apply(point, active)
                target_digit = (target // factor.stride) % factor.radix
                replacement = min(digit, target_digit)
            canonical += (replacement - digit) * factor.stride
        return canonical

    def metadata(self) -> dict[str, Any]:
        return {
            "kind": "regular-product-of-dihedral-groups",
            "degree": self.degree,
            "generatorCount": self.generator_count,
            "factorRelationOrders": list(self.relation_orders),
            "forbiddenInfinitePairs": [
                list(pair) for pair in sorted(self.forbidden_pairs)
            ],
            "finitePairCount": self.finite_pair_count,
            "permutationStorage": "procedural-mixed-radix",
        }


@dataclass(frozen=True)
class BenchmarkConfig:
    profile: str = "scale"
    witness_count: int = 219
    higher_rank_samples_per_type: int = 4
    minimum_degree: int = 97_920

    def action(self) -> SyntheticCoxeterAction:
        return (
            SyntheticCoxeterAction.scale_fixture()
            if self.profile == "scale"
            else SyntheticCoxeterAction.smoke_fixture()
        )


@dataclass
class StagePayload:
    details: dict[str, Any]
    semantic_checks: list[dict[str, Any]]
    digest: str
    processed_units: int
    tracked_working_bytes: int


@dataclass
class EdgeIndex:
    degree: int
    generator_count: int
    edge_ids: array
    edge_count: int

    @property
    def byte_length(self) -> int:
        return len(self.edge_ids) * self.edge_ids.itemsize

    def edge_id(self, point: int, generator: int) -> int:
        return int(self.edge_ids[generator * self.degree + point])


@dataclass
class WallArtifact:
    edge_index: EdgeIndex
    wall_count: int


@dataclass
class CoorientationArtifact:
    edge_signs: array
    wall_count: int

    @property
    def byte_length(self) -> int:
        return len(self.edge_signs) * self.edge_signs.itemsize


class UnionFind:
    """Packed union-find used for edge-wall components."""

    def __init__(self, size: int) -> None:
        self.parent = array("I", range(size))
        self.rank = bytearray(size)
        self.components = size

    @property
    def byte_length(self) -> int:
        return len(self.parent) * self.parent.itemsize + len(self.rank)

    def find(self, item: int) -> int:
        parent = self.parent
        root = item
        while parent[root] != root:
            root = parent[root]
        while parent[item] != item:
            next_item = parent[item]
            parent[item] = root
            item = next_item
        return root

    def union(self, first: int, second: int) -> bool:
        left = self.find(first)
        right = self.find(second)
        if left == right:
            return False
        rank = self.rank
        if rank[left] < rank[right]:
            left, right = right, left
        self.parent[right] = left
        if rank[left] == rank[right]:
            rank[left] += 1
        self.components -= 1
        return True


class ParityUnionFind:
    """Union-find with an XOR relation between local edge coorientations."""

    def __init__(self, size: int) -> None:
        self.parent = array("I", range(size))
        self.rank = bytearray(size)
        self.parity = bytearray(size)
        self.components = size

    @property
    def byte_length(self) -> int:
        return (
            len(self.parent) * self.parent.itemsize + len(self.rank) + len(self.parity)
        )

    def find(self, item: int) -> tuple[int, int]:
        parent = self.parent
        parity = self.parity
        root = item
        root_parity = 0
        while parent[root] != root:
            root_parity ^= parity[root]
            root = parent[root]

        accumulated = 0
        current = item
        while parent[current] != current:
            next_item = parent[current]
            edge_parity = parity[current]
            parent[current] = root
            parity[current] = root_parity ^ accumulated
            accumulated ^= edge_parity
            current = next_item
        return root, root_parity

    def union(self, first: int, second: int, required_xor: int) -> bool:
        left, left_parity = self.find(first)
        right, right_parity = self.find(second)
        required = int(required_xor) & 1
        if left == right:
            return (left_parity ^ right_parity) == required

        rank = self.rank
        relation = left_parity ^ right_parity ^ required
        if rank[left] < rank[right]:
            self.parent[left] = right
            self.parity[left] = relation
        else:
            self.parent[right] = left
            self.parity[right] = relation
            if rank[left] == rank[right]:
                rank[left] += 1
        self.components -= 1
        return True


def _run_stage(stage_id: str, operation: Callable[[], StagePayload]) -> dict[str, Any]:
    gc.collect()
    rss_before = current_rss_bytes()
    peak_before = peak_rss_bytes()
    started = time.perf_counter_ns()
    payload = operation()
    elapsed_ns = time.perf_counter_ns() - started
    rss_after = current_rss_bytes()
    peak_after = peak_rss_bytes()
    elapsed_seconds = elapsed_ns / 1_000_000_000
    return {
        "id": stage_id,
        "ok": all(check["passed"] for check in payload.semantic_checks),
        "elapsedMs": round(elapsed_ns / 1_000_000, 3),
        "processedUnits": payload.processed_units,
        "throughputPerSecond": round(
            payload.processed_units / elapsed_seconds if elapsed_seconds else 0.0, 3
        ),
        "trackedWorkingBytes": payload.tracked_working_bytes,
        "rssBeforeBytes": rss_before,
        "rssAfterBytes": rss_after,
        "peakProcessRssBeforeBytes": peak_before,
        "peakProcessRssAfterBytes": peak_after,
        "semanticSha256": payload.digest,
        "semanticChecks": payload.semantic_checks,
        "details": payload.details,
    }


def _sample_points(degree: int, limit: int = 4096) -> tuple[int, ...]:
    if degree <= limit:
        return tuple(range(degree))
    # Multiplication by an odd number permutes residues modulo the even scale
    # fixture degree well enough for a deterministic contract sample.
    return tuple((index * 65_537) % degree for index in range(limit))


def benchmark_action_contract(action: SyntheticCoxeterAction) -> StagePayload:
    samples = _sample_points(action.degree)
    involution_failures = 0
    relation_failures = 0
    digest = hashlib.sha256()
    operations = 0

    for point in samples:
        for generator in range(action.generator_count):
            target = action.apply(point, generator)
            returned = action.apply(target, generator)
            operations += 2
            if returned != point:
                involution_failures += 1
            digest.update(_pack_uints(point, generator, target))

    for first, second, relation_order in action.finite_pairs():
        for point in samples:
            current = point
            for _ in range(relation_order):
                current = action.apply(current, first)
                current = action.apply(current, second)
                operations += 2
            if current != point:
                relation_failures += 1

    visited = bytearray(action.degree)
    queue = array("I", [0]) * action.degree
    head = 0
    tail = 1
    visited[0] = 1
    while head < tail:
        point = int(queue[head])
        head += 1
        for generator in range(action.generator_count):
            target = action.apply(point, generator)
            operations += 1
            if not visited[target]:
                visited[target] = 1
                queue[tail] = target
                tail += 1

    checks = [
        _semantic_check(
            "source generators are involutions",
            involution_failures == 0,
            f"{involution_failures} sampled involution failures",
        ),
        _semantic_check(
            "finite Coxeter relations hold",
            relation_failures == 0,
            f"{relation_failures} sampled relation failures",
        ),
        _semantic_check(
            "finite image action is transitive",
            tail == action.degree,
            f"orbit size {tail} of {action.degree}",
        ),
    ]
    semantic = {
        "sampleCount": len(samples),
        "involutionFailures": involution_failures,
        "relationFailures": relation_failures,
        "fullOrbitSize": tail,
        "actionDigest": digest.hexdigest(),
    }
    return StagePayload(
        details=semantic,
        semantic_checks=checks,
        digest=sha256_json(semantic),
        processed_units=operations,
        tracked_working_bytes=len(visited) + len(queue) * queue.itemsize,
    )


def benchmark_spherical_freeness(
    action: SyntheticCoxeterAction, witness_count: int
) -> StagePayload:
    all_spherical = action.spherical_subsets()
    witnesses = all_spherical[: min(witness_count, len(all_spherical))]
    expected_orders = [action.subgroup_order(subset) for subset in witnesses]
    max_order = max(expected_orders, default=1)
    if len(witnesses) >= 0xFFFF:
        raise ValueError(
            "The uint16 generation marks support at most 65,534 witnesses."
        )

    marks = array("H", [0]) * action.degree
    queue = array("I", [0]) * max_order
    digest = hashlib.sha256()
    failures: list[dict[str, Any]] = []
    total_orbits = 0
    transitions = 0

    for witness_index, (subset, expected_order) in enumerate(
        zip(witnesses, expected_orders, strict=True), start=1
    ):
        orbit_count = 0
        minimum_orbit = expected_order
        maximum_orbit = 0
        for root in range(action.degree):
            if marks[root] == witness_index:
                continue
            head = 0
            tail = 1
            queue[0] = root
            marks[root] = witness_index
            while head < tail:
                point = int(queue[head])
                head += 1
                for generator in subset:
                    target = action.apply(point, generator)
                    transitions += 1
                    if marks[target] != witness_index:
                        if tail >= max_order:
                            raise BenchmarkInvariantError(
                                "A spherical orbit exceeded its classified order."
                            )
                        marks[target] = witness_index
                        queue[tail] = target
                        tail += 1
            orbit_count += 1
            minimum_orbit = min(minimum_orbit, tail)
            maximum_orbit = max(maximum_orbit, tail)
            if tail != expected_order and len(failures) < 32:
                failures.append(
                    {
                        "subset": list(subset),
                        "root": root,
                        "expectedOrder": expected_order,
                        "actualOrbitSize": tail,
                    }
                )
        total_orbits += orbit_count
        digest.update(
            _pack_uints(
                sum(1 << generator for generator in subset),
                expected_order,
                orbit_count,
                minimum_orbit,
                maximum_orbit,
            )
        )

    semantic = {
        "availableSphericalSubsets": len(all_spherical),
        "witnessCount": len(witnesses),
        "regularOrbitCount": total_orbits,
        "failureCount": len(failures),
        "failures": failures,
        "orbitDigest": digest.hexdigest(),
    }
    checks = [
        _semantic_check(
            "requested witness catalogue was covered",
            len(witnesses) == min(witness_count, len(all_spherical)),
            f"checked {len(witnesses)} of {len(all_spherical)} spherical subsets",
        ),
        _semantic_check(
            "every spherical restriction is free",
            not failures,
            f"{len(failures)} nonregular spherical orbits",
        ),
    ]
    return StagePayload(
        details=semantic,
        semantic_checks=checks,
        digest=sha256_json(semantic),
        processed_units=transitions,
        tracked_working_bytes=(
            len(marks) * marks.itemsize + len(queue) * queue.itemsize
        ),
    )


def _mask(subset: Sequence[int]) -> int:
    return sum(1 << generator for generator in subset)


def benchmark_cell_poset(action: SyntheticCoxeterAction) -> StagePayload:
    subsets = action.spherical_subsets()
    subset_counts = Counter(len(subset) for subset in subsets)
    cell_counts = Counter({0: action.degree})
    incidence_counts = Counter()
    digest = hashlib.sha256()
    scanned = 0
    failures: list[str] = []

    for subset in subsets:
        order = action.subgroup_order(subset)
        expected_cells = action.degree // order
        cells = 0
        codimension_one_per_cell = sum(
            order
            // action.subgroup_order(
                tuple(value for value in subset if value != omitted)
            )
            for omitted in subset
        )
        subset_mask = _mask(subset)
        for point in range(action.degree):
            scanned += 1
            if action.canonical_coset_point_mask(point, subset_mask) != point:
                continue
            cells += 1
            digest.update(_pack_uints(len(subset), subset_mask, point))
        if cells != expected_cells:
            failures.append(
                f"subset {subset}: expected {expected_cells} cells, found {cells}"
            )
        cell_counts[len(subset)] += cells
        incidence_counts[len(subset)] += cells * codimension_one_per_cell

    factor_count = len(action.factors)
    expected_subset_counts = {
        rank: math.comb(factor_count, rank) * (2**rank)
        for rank in range(1, factor_count + 1)
    }
    checks = [
        _semantic_check(
            "spherical subset ranks match the cross-polytope nerve",
            all(
                subset_counts[rank] == count
                for rank, count in expected_subset_counts.items()
            ),
            f"observed {dict(sorted(subset_counts.items()))}",
        ),
        _semantic_check(
            "streamed cell orbit counts match subgroup indices",
            not failures,
            f"{len(failures)} cell-count mismatches",
        ),
        _semantic_check(
            "no quotient cell objects were retained",
            True,
            "only counts and a SHA-256 stream were retained",
        ),
    ]
    semantic = {
        "sphericalSubsetCountsByRank": {
            str(rank): count for rank, count in sorted(subset_counts.items())
        },
        "cellCountsByRank": {
            str(rank): count for rank, count in sorted(cell_counts.items())
        },
        "codimensionOneIncidencesByRank": {
            str(rank): count for rank, count in sorted(incidence_counts.items())
        },
        "failureCount": len(failures),
        "failureSample": failures[:16],
        "cellIdDigest": digest.hexdigest(),
    }
    return StagePayload(
        details=semantic,
        semantic_checks=checks,
        digest=sha256_json(semantic),
        processed_units=scanned,
        tracked_working_bytes=0,
    )


def build_edge_index(action: SyntheticCoxeterAction) -> EdgeIndex:
    edge_count = action.degree * action.generator_count // 2
    edge_ids = array("I", [0]) * (action.degree * action.generator_count)
    next_edge = 0
    for generator in range(action.generator_count):
        row_offset = generator * action.degree
        for point in range(action.degree):
            target = action.apply(point, generator)
            if point >= target:
                continue
            edge_ids[row_offset + point] = next_edge
            edge_ids[row_offset + target] = next_edge
            next_edge += 1
    if next_edge != edge_count:
        raise BenchmarkInvariantError(
            f"Expected {edge_count} involution edges, indexed {next_edge}."
        )
    return EdgeIndex(action.degree, action.generator_count, edge_ids, edge_count)


def _fill_relation_boundary(
    action: SyntheticCoxeterAction,
    edge_index: EdgeIndex,
    root: int,
    first: int,
    second: int,
    relation_order: int,
    vertices: list[int],
    edges: list[int],
    directions: list[int],
) -> bool:
    current = root
    for step in range(2 * relation_order):
        generator = first if step % 2 == 0 else second
        target = action.apply(current, generator)
        vertices[step] = current
        edges[step] = edge_index.edge_id(current, generator)
        directions[step] = 1 if current < target else -1
        current = target
    return current == root


def benchmark_wall_union_find(
    action: SyntheticCoxeterAction,
) -> tuple[StagePayload, WallArtifact]:
    edge_index = build_edge_index(action)
    union_find = UnionFind(edge_index.edge_count)
    relation_cells = 0
    union_attempts = 0
    closure_failures = 0
    digest = hashlib.sha256()
    max_relation = max(relation_order for _, _, relation_order in action.finite_pairs())
    vertices = [0] * (2 * max_relation)
    edges = [0] * (2 * max_relation)
    directions = [0] * (2 * max_relation)

    for first, second, relation_order in action.finite_pairs():
        subset = (first, second)
        subset_mask = _mask(subset)
        expected_cells = action.degree // (2 * relation_order)
        pair_cells = 0
        for root in range(action.degree):
            if action.canonical_coset_point_mask(root, subset_mask) != root:
                continue
            pair_cells += 1
            relation_cells += 1
            if not _fill_relation_boundary(
                action,
                edge_index,
                root,
                first,
                second,
                relation_order,
                vertices,
                edges,
                directions,
            ):
                closure_failures += 1
            for index in range(relation_order):
                union_find.union(edges[index], edges[index + relation_order])
                union_attempts += 1
        digest.update(_pack_uints(first, second, relation_order, pair_cells))
        if pair_cells != expected_cells:
            raise BenchmarkInvariantError(
                f"Relation pair {(first, second)} produced {pair_cells} cells, "
                f"expected {expected_cells}."
            )

    root_sizes: Counter[int] = Counter()
    component_digest = hashlib.sha256()
    for edge_id in range(edge_index.edge_count):
        root = union_find.find(edge_id)
        root_sizes[root] += 1
        component_digest.update(_pack_uints(edge_id, root))
    wall_count = len(root_sizes)
    expected_attempts = action.finite_pair_count * action.degree // 2
    semantic = {
        "edgeCount": edge_index.edge_count,
        "relationCellCount": relation_cells,
        "oppositeEdgeUnionAttempts": union_attempts,
        "wallCount": wall_count,
        "smallestWallEdgeCount": min(root_sizes.values(), default=0),
        "largestWallEdgeCount": max(root_sizes.values(), default=0),
        "boundaryClosureFailures": closure_failures,
        "relationDigest": digest.hexdigest(),
        "wallPartitionDigest": component_digest.hexdigest(),
    }
    checks = [
        _semantic_check(
            "every generator edge was indexed once",
            edge_index.edge_count == action.degree * action.generator_count // 2,
            f"indexed {edge_index.edge_count} undirected edges",
        ),
        _semantic_check(
            "every finite relation boundary closed",
            closure_failures == 0,
            f"{closure_failures} open relation boundaries",
        ),
        _semantic_check(
            "every relation contributes one opposite-edge constraint per half-boundary",
            union_attempts == expected_attempts,
            f"{union_attempts} constraints; expected {expected_attempts}",
        ),
        _semantic_check(
            "wall partition covers every edge",
            sum(root_sizes.values()) == edge_index.edge_count,
            f"partitioned {sum(root_sizes.values())} edges",
        ),
    ]
    payload = StagePayload(
        details=semantic,
        semantic_checks=checks,
        digest=sha256_json(semantic),
        processed_units=action.degree * action.generator_count + union_attempts,
        tracked_working_bytes=edge_index.byte_length + union_find.byte_length,
    )
    return payload, WallArtifact(edge_index=edge_index, wall_count=wall_count)


def _root_sign(root: int) -> int:
    # SplitMix64 supplies a stable, inexpensive sign without Python's salted hash.
    value = (root + 0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFFFFFF
    value = ((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9) & 0xFFFFFFFFFFFFFFFF
    value = ((value ^ (value >> 27)) * 0x94D049BB133111EB) & 0xFFFFFFFFFFFFFFFF
    value ^= value >> 31
    return 1 if value & 1 else -1


def benchmark_coorientation(
    action: SyntheticCoxeterAction, wall_artifact: WallArtifact
) -> tuple[StagePayload, CoorientationArtifact]:
    edge_index = wall_artifact.edge_index
    constraints = ParityUnionFind(edge_index.edge_count)
    max_relation = max(relation_order for _, _, relation_order in action.finite_pairs())
    vertices = [0] * (2 * max_relation)
    edges = [0] * (2 * max_relation)
    directions = [0] * (2 * max_relation)
    contradictions = 0
    constraint_count = 0

    for first, second, relation_order in action.finite_pairs():
        subset = (first, second)
        subset_mask = _mask(subset)
        for root in range(action.degree):
            if action.canonical_coset_point_mask(root, subset_mask) != root:
                continue
            _fill_relation_boundary(
                action,
                edge_index,
                root,
                first,
                second,
                relation_order,
                vertices,
                edges,
                directions,
            )
            for index in range(relation_order):
                opposite = index + relation_order
                # Opposite boundary contributions must cancel.  Variables are
                # stored against each edge's canonical endpoint order.
                required_xor = (
                    0 if -directions[index] * directions[opposite] == 1 else 1
                )
                if not constraints.union(edges[index], edges[opposite], required_xor):
                    contradictions += 1
                constraint_count += 1

    edge_signs = array("b", [0]) * edge_index.edge_count
    sign_digest = hashlib.sha256()
    roots: set[int] = set()
    for edge_id in range(edge_index.edge_count):
        root, parity = constraints.find(edge_id)
        roots.add(root)
        sign = _root_sign(root) * (-1 if parity else 1)
        edge_signs[edge_id] = sign
        sign_digest.update(struct.pack("<Ib", edge_id, sign))

    boundary_failures = 0
    boundary_count = 0
    largest_absolute_sum = 0
    for first, second, relation_order in action.finite_pairs():
        subset = (first, second)
        subset_mask = _mask(subset)
        for root in range(action.degree):
            if action.canonical_coset_point_mask(root, subset_mask) != root:
                continue
            _fill_relation_boundary(
                action,
                edge_index,
                root,
                first,
                second,
                relation_order,
                vertices,
                edges,
                directions,
            )
            boundary_sum = sum(
                directions[index] * int(edge_signs[edges[index]])
                for index in range(2 * relation_order)
            )
            largest_absolute_sum = max(largest_absolute_sum, abs(boundary_sum))
            boundary_failures += int(boundary_sum != 0)
            boundary_count += 1

    semantic = {
        "constraintCount": constraint_count,
        "contradictionCount": contradictions,
        "coorientedWallCount": len(roots),
        "rankTwoBoundaryCount": boundary_count,
        "rankTwoBoundaryFailureCount": boundary_failures,
        "largestAbsoluteBoundarySum": largest_absolute_sum,
        "edgeSignDigest": sign_digest.hexdigest(),
    }
    checks = [
        _semantic_check(
            "wall constraints are two-sided",
            contradictions == 0,
            f"{contradictions} parity contradictions",
        ),
        _semantic_check(
            "coorientation and wall partitions agree",
            len(roots) == wall_artifact.wall_count,
            f"{len(roots)} signed components versus {wall_artifact.wall_count} walls",
        ),
        _semantic_check(
            "every compressed rank-two boundary has cocycle sum zero",
            boundary_failures == 0,
            f"{boundary_failures} of {boundary_count} boundaries failed",
        ),
    ]
    payload = StagePayload(
        details=semantic,
        semantic_checks=checks,
        digest=sha256_json(semantic),
        processed_units=2 * constraint_count + boundary_count,
        tracked_working_bytes=(
            edge_index.byte_length + constraints.byte_length + len(edge_signs)
        ),
    )
    return payload, CoorientationArtifact(edge_signs=edge_signs, wall_count=len(roots))


def _orbit_vertices(
    action: SyntheticCoxeterAction, root: int, generators: Sequence[int]
) -> tuple[int, ...]:
    seen = {root}
    queue = deque([root])
    while queue:
        point = queue.popleft()
        for generator in generators:
            target = action.apply(point, generator)
            if target not in seen:
                seen.add(target)
                queue.append(target)
    return tuple(sorted(seen))


def _partition_vertices(
    action: SyntheticCoxeterAction,
    vertices: Sequence[int],
    generators: Sequence[int],
) -> tuple[tuple[int, ...], ...]:
    remaining = set(vertices)
    parts: list[tuple[int, ...]] = []
    while remaining:
        root = min(remaining)
        orbit = set(_orbit_vertices(action, root, generators)) & remaining
        parts.append(tuple(sorted(orbit)))
        remaining.difference_update(orbit)
    return tuple(parts)


def pulling_simplices(
    action: SyntheticCoxeterAction,
    vertices: Sequence[int],
    generators: Sequence[int],
) -> tuple[tuple[int, ...], ...]:
    """Construct the pulling triangulation from the Coxeter-cell face lattice."""

    ordered_vertices = tuple(sorted(vertices))
    ordered_generators = tuple(sorted(generators))
    if not ordered_generators:
        if len(ordered_vertices) != 1:
            raise BenchmarkInvariantError("A rank-zero cell must have one vertex.")
        return ((ordered_vertices[0],),)

    minimum = ordered_vertices[0]
    simplices: list[tuple[int, ...]] = []
    for omitted in ordered_generators:
        facet_generators = tuple(
            generator for generator in ordered_generators if generator != omitted
        )
        for facet_vertices in _partition_vertices(
            action, ordered_vertices, facet_generators
        ):
            if minimum in facet_vertices:
                continue
            for facet_simplex in pulling_simplices(
                action, facet_vertices, facet_generators
            ):
                simplices.append((minimum, *facet_simplex))
    return tuple(simplices)


def benchmark_pulling_subdivision(
    action: SyntheticCoxeterAction,
    higher_rank_samples_per_type: int,
    retained_edge_index: EdgeIndex | None = None,
) -> StagePayload:
    rank_two_triangles = 0
    rank_two_cells = 0
    higher_rank_cells_sampled: Counter[int] = Counter()
    higher_rank_simplices: Counter[int] = Counter()
    failures: list[str] = []
    digest = hashlib.sha256()

    max_relation = max(relation_order for _, _, relation_order in action.finite_pairs())
    # Pulling needs vertices but not edge IDs; a compact temporary index avoids
    # keeping a second scene representation.
    edge_index = retained_edge_index or build_edge_index(action)
    vertices = [0] * (2 * max_relation)
    edges = [0] * (2 * max_relation)
    directions = [0] * (2 * max_relation)

    for first, second, relation_order in action.finite_pairs():
        subset = (first, second)
        subset_mask = _mask(subset)
        for root in range(action.degree):
            if action.canonical_coset_point_mask(root, subset_mask) != root:
                continue
            rank_two_cells += 1
            _fill_relation_boundary(
                action,
                edge_index,
                root,
                first,
                second,
                relation_order,
                vertices,
                edges,
                directions,
            )
            boundary_length = 2 * relation_order
            if min(vertices[:boundary_length]) != root:
                failures.append(
                    f"relation cell {root}/{subset} did not use its least vertex"
                )
            for index in range(1, boundary_length - 1):
                triangle = (root, vertices[index], vertices[index + 1])
                if len(set(triangle)) != 3:
                    failures.append(f"degenerate pulling triangle {triangle}")
                digest.update(_pack_uints(2, *triangle))
                rank_two_triangles += 1

    if higher_rank_samples_per_type > 0:
        for subset in action.spherical_subsets():
            if len(subset) < 3:
                continue
            subset_mask = _mask(subset)
            sampled = 0
            for root in range(action.degree):
                if action.canonical_coset_point_mask(root, subset_mask) != root:
                    continue
                cell_vertices = _orbit_vertices(action, root, subset)
                simplices = pulling_simplices(action, cell_vertices, subset)
                expected_simplex_size = len(subset) + 1
                for simplex in simplices:
                    if (
                        len(simplex) != expected_simplex_size
                        or len(set(simplex)) != expected_simplex_size
                    ):
                        failures.append(
                            f"rank-{len(subset)} cell {root}/{subset} has invalid simplex {simplex}"
                        )
                    digest.update(_pack_uints(len(subset), *simplex))
                higher_rank_cells_sampled[len(subset)] += 1
                higher_rank_simplices[len(subset)] += len(simplices)
                sampled += 1
                if sampled >= higher_rank_samples_per_type:
                    break

    expected_rank_two_triangles = sum(
        (action.degree // (2 * relation_order)) * (2 * relation_order - 2)
        for _, _, relation_order in action.finite_pairs()
    )
    semantic = {
        "globalVertexOrder": "zero-based quotient vertex id",
        "rankTwoCellCount": rank_two_cells,
        "rankTwoTriangleCount": rank_two_triangles,
        "expectedRankTwoTriangleCount": expected_rank_two_triangles,
        "higherRankCellSamplesByRank": {
            str(rank): count
            for rank, count in sorted(higher_rank_cells_sampled.items())
        },
        "higherRankSimplexSamplesByRank": {
            str(rank): count for rank, count in sorted(higher_rank_simplices.items())
        },
        "failureCount": len(failures),
        "failureSample": failures[:16],
        "simplexDigest": digest.hexdigest(),
        "retainedSimplexObjects": 0,
    }
    checks = [
        _semantic_check(
            "every rank-two Coxeter cell has its full pulling fan",
            rank_two_triangles == expected_rank_two_triangles,
            f"streamed {rank_two_triangles} triangles",
        ),
        _semantic_check(
            "sampled higher-rank pulling simplices are nondegenerate",
            not failures,
            f"{len(failures)} subdivision failures",
        ),
        _semantic_check(
            "subdivision output was streamed",
            True,
            "simplices were hashed and discarded",
        ),
    ]
    return StagePayload(
        details=semantic,
        semantic_checks=checks,
        digest=sha256_json(semantic),
        processed_units=rank_two_triangles + sum(higher_rank_simplices.values()),
        tracked_working_bytes=edge_index.byte_length,
    )


def _induced_link_summary(
    action: SyntheticCoxeterAction,
    mask: int,
    spherical_subsets: Sequence[tuple[int, ...]],
) -> tuple[int, int, tuple[int, ...]]:
    vertices = [
        generator
        for generator in range(action.generator_count)
        if mask & (1 << generator)
    ]
    if not vertices:
        return 0, 0, ()
    neighbors = {vertex: set() for vertex in vertices}
    for first, second in combinations(vertices, 2):
        if action.relation_order(first, second) is not None:
            neighbors[first].add(second)
            neighbors[second].add(first)
    components = 0
    unseen = set(vertices)
    while unseen:
        components += 1
        queue = [unseen.pop()]
        while queue:
            current = queue.pop()
            adjacent = neighbors[current] & unseen
            unseen.difference_update(adjacent)
            queue.extend(adjacent)
    f_vector = Counter()
    for subset in spherical_subsets:
        subset_mask = _mask(subset)
        if subset_mask & mask == subset_mask:
            f_vector[len(subset) - 1] += 1
    return (
        len(vertices),
        components,
        tuple(
            f_vector[dimension] for dimension in range(max(f_vector, default=-1) + 1)
        ),
    )


def benchmark_local_links(
    action: SyntheticCoxeterAction,
    wall_artifact: WallArtifact,
    coorientation: CoorientationArtifact,
) -> StagePayload:
    edge_index = wall_artifact.edge_index
    all_spherical = action.spherical_subsets()
    summary_by_mask = {
        mask: _induced_link_summary(action, mask, all_spherical)
        for mask in range(1 << action.generator_count)
    }
    ascending_empty = 0
    descending_empty = 0
    ascending_disconnected = 0
    descending_disconnected = 0
    partition_failures = 0
    distribution: Counter[tuple[int, int]] = Counter()
    digest = hashlib.sha256()

    full_mask = (1 << action.generator_count) - 1
    for point in range(action.degree):
        ascending_mask = 0
        for generator in range(action.generator_count):
            target = action.apply(point, generator)
            reference_direction = 1 if point < target else -1
            edge_value_away = reference_direction * int(
                coorientation.edge_signs[edge_index.edge_id(point, generator)]
            )
            if edge_value_away > 0:
                ascending_mask |= 1 << generator
        descending_mask = full_mask ^ ascending_mask
        if (
            ascending_mask & descending_mask
            or (ascending_mask | descending_mask) != full_mask
        ):
            partition_failures += 1

        ascending_vertices, ascending_components, _ = summary_by_mask[ascending_mask]
        descending_vertices, descending_components, _ = summary_by_mask[descending_mask]
        ascending_empty += int(ascending_vertices == 0)
        descending_empty += int(descending_vertices == 0)
        ascending_disconnected += int(ascending_components > 1)
        descending_disconnected += int(descending_components > 1)
        distribution[(ascending_mask, descending_mask)] += 1
        digest.update(
            _pack_uints(
                point,
                ascending_mask,
                descending_mask,
                ascending_components,
                descending_components,
            )
        )

    semantic = {
        "vertexCount": action.degree,
        "maskTableEntries": len(summary_by_mask),
        "orientationPatternCount": len(distribution),
        "ascendingEmptyCount": ascending_empty,
        "descendingEmptyCount": descending_empty,
        "ascendingDisconnectedCount": ascending_disconnected,
        "descendingDisconnectedCount": descending_disconnected,
        "partitionFailureCount": partition_failures,
        "classificationDigest": digest.hexdigest(),
        "morseGateStatus": (
            "passed"
            if not (
                ascending_empty
                or descending_empty
                or ascending_disconnected
                or descending_disconnected
            )
            else "failed-diagnostic"
        ),
    }
    checks = [
        _semantic_check(
            "ascending and descending directions partition every vertex star",
            partition_failures == 0,
            f"{partition_failures} partition failures",
        ),
        _semantic_check(
            "every quotient vertex received a local-link diagnostic",
            sum(distribution.values()) == action.degree,
            f"classified {sum(distribution.values())} vertices",
        ),
        _semantic_check(
            "Morse failures remain diagnostics rather than benchmark corruption",
            True,
            (
                f"empty asc/desc {ascending_empty}/{descending_empty}; "
                f"disconnected asc/desc {ascending_disconnected}/{descending_disconnected}"
            ),
        ),
    ]
    estimated_table_bytes = len(summary_by_mask) * 32
    return StagePayload(
        details=semantic,
        semantic_checks=checks,
        digest=sha256_json(semantic),
        processed_units=action.degree * action.generator_count,
        tracked_working_bytes=(
            edge_index.byte_length + coorientation.byte_length + estimated_table_bytes
        ),
    )


def run_benchmark(config: BenchmarkConfig) -> dict[str, Any]:
    action = config.action()
    if config.profile not in {"scale", "smoke"}:
        raise ValueError("profile must be 'scale' or 'smoke'")
    if config.witness_count <= 0:
        raise ValueError("witness_count must be positive")
    if config.higher_rank_samples_per_type < 0:
        raise ValueError("higher_rank_samples_per_type cannot be negative")

    started = time.perf_counter_ns()
    top_checks = [
        _semantic_check(
            "scale fixture meets the requested action degree",
            config.profile != "scale" or action.degree >= config.minimum_degree,
            f"degree {action.degree}; minimum {config.minimum_degree}",
        ),
        _semantic_check(
            "scale fixture exposes 242 nonempty spherical subsets",
            config.profile != "scale" or len(action.spherical_subsets()) == 242,
            f"found {len(action.spherical_subsets())} spherical subsets",
        ),
    ]

    stages: list[dict[str, Any]] = []
    stages.append(
        _run_stage("action-contract", lambda: benchmark_action_contract(action))
    )
    stages.append(
        _run_stage(
            "streamed-spherical-freeness",
            lambda: benchmark_spherical_freeness(action, config.witness_count),
        )
    )
    stages.append(
        _run_stage("cell-orbit-poset-primitives", lambda: benchmark_cell_poset(action))
    )

    wall_holder: dict[str, WallArtifact] = {}

    def wall_operation() -> StagePayload:
        payload, artifact = benchmark_wall_union_find(action)
        wall_holder["value"] = artifact
        return payload

    stages.append(_run_stage("wall-union-find", wall_operation))
    wall_artifact = wall_holder["value"]

    coorientation_holder: dict[str, CoorientationArtifact] = {}

    def coorientation_operation() -> StagePayload:
        payload, artifact = benchmark_coorientation(action, wall_artifact)
        coorientation_holder["value"] = artifact
        return payload

    stages.append(_run_stage("coorientation-constraints", coorientation_operation))
    coorientation = coorientation_holder["value"]
    stages.append(
        _run_stage(
            "pulling-subdivision-bookkeeping",
            lambda: benchmark_pulling_subdivision(
                action,
                config.higher_rank_samples_per_type,
                wall_artifact.edge_index,
            ),
        )
    )
    stages.append(
        _run_stage(
            "local-link-diagnostics",
            lambda: benchmark_local_links(action, wall_artifact, coorientation),
        )
    )

    elapsed_ms = round((time.perf_counter_ns() - started) / 1_000_000, 3)
    packed_rows_avoided = action.degree * action.generator_count * UINT32_BYTES
    semantic_projection = {
        "benchmark": BENCHMARK_ID,
        "fixture": action.metadata(),
        "configuration": {
            "profile": config.profile,
            "witnessCount": config.witness_count,
            "higherRankSamplesPerType": config.higher_rank_samples_per_type,
            "minimumDegree": config.minimum_degree,
        },
        "checks": top_checks,
        "stages": [
            {
                "id": stage["id"],
                "ok": stage["ok"],
                "semanticSha256": stage["semanticSha256"],
                "semanticChecks": stage["semanticChecks"],
                "details": stage["details"],
            }
            for stage in stages
        ],
    }
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "reportKind": "synthetic-cover-scale-benchmark",
        "benchmark": BENCHMARK_ID,
        "ok": all(check["passed"] for check in top_checks)
        and all(stage["ok"] for stage in stages),
        "fixture": action.metadata(),
        "configuration": semantic_projection["configuration"],
        "semanticChecks": top_checks,
        "stages": stages,
        "metrics": {
            "elapsedMs": elapsed_ms,
            "finalRssBytes": current_rss_bytes(),
            "peakProcessRssBytes": peak_rss_bytes(),
            "proceduralPermutationBytesAvoided": packed_rows_avoided,
            "materializedPermutationJsonRows": 0,
            "retainedCellObjects": 0,
            "retainedSimplexObjects": 0,
        },
        "semanticSha256": sha256_json(semantic_projection),
        "notes": [
            "Times and RSS are observations; semanticSha256 excludes those unstable values.",
            "The fixture is a scale test, not evidence about the compact 5-cube subgroup search.",
            "A failed Morse gate is a valid diagnostic result and does not fail the benchmark.",
        ],
    }
    # The canonical byte count includes the metric itself. Iterate until its
    # decimal representation reaches a fixed point (normally two iterations).
    report["metrics"]["canonicalReportJsonBytes"] = 0
    while True:
        byte_length = len(
            (json.dumps(report, sort_keys=True, separators=(",", ":")) + "\n").encode(
                "utf8"
            )
        )
        if report["metrics"]["canonicalReportJsonBytes"] == byte_length:
            break
        report["metrics"]["canonicalReportJsonBytes"] = byte_length
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run a deterministic streamed benchmark of the 97,920+ point "
            "torsion-free-cover pipeline."
        )
    )
    parser.add_argument(
        "--profile",
        choices=("scale", "smoke"),
        default="scale",
        help="scale uses 103,680 points; smoke uses 480 points for development",
    )
    parser.add_argument("--witness-count", type=int, default=219)
    parser.add_argument("--higher-rank-samples-per-type", type=int, default=4)
    parser.add_argument("--minimum-degree", type=int, default=97_920)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--compact", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = run_benchmark(
            BenchmarkConfig(
                profile=args.profile,
                witness_count=args.witness_count,
                higher_rank_samples_per_type=args.higher_rank_samples_per_type,
                minimum_degree=args.minimum_degree,
            )
        )
        rendered = (
            json.dumps(report, sort_keys=True, separators=(",", ":"))
            if args.compact
            else json.dumps(report, indent=2, sort_keys=True)
        ) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered, encoding="utf8")
        else:
            sys.stdout.write(rendered)
        return 0 if report["ok"] else 1
    except (BenchmarkInvariantError, ValueError) as error:
        sys.stdout.write(
            json.dumps(
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "reportKind": "synthetic-cover-scale-benchmark",
                    "benchmark": BENCHMARK_ID,
                    "ok": False,
                    "error": str(error),
                },
                indent=2,
                sort_keys=True,
            )
            + "\n"
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
