#!/usr/bin/env python3
"""Globalize the concentrated compact-cube full-frame seeds.

The R6 prefix campaign found 93 exact frames for one 384-point ``C`` residue.
Those frames are local data: they do not yet define the 5,760-point ``g4``
permutation.  This backend starts with one such frame, propagates the
``(g4 g7)^3`` triangle closures, and instantiates another residue only when a
forced edge reaches it.

This is deliberately a bounded discovery search.  A negative result excludes
only the supplied seed family and the exact learned clauses reported in the
artifact.  A positive row is independently rebuilt and replayed against every
finite Coxeter relation and newly completed spherical subgroup before it is
reported.
"""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import block_amalgam_canonical_augmentation as augmentation  # noqa: E402
import block_amalgam_cover_search as block  # noqa: E402
import orbifold_cover_search as orbifold  # noqa: E402

SCHEMA_VERSION = 1
BACKEND_VERSION = "1.0.0"
SEED_ARTIFACT_TYPE = "coxeter-full-frame-seed-catalogue"
RESULT_ARTIFACT_TYPE = "coxeter-candidate-first-frame-globalization"
DEFAULT_SOURCE = Path("public/examples/compact_5_cube_gamma1.json")
DEFAULT_SEEDS = Path(
    "scripts/certificates/torsion-free/compact_5_cube_r6_candidate_frames_5760.json"
)
UINT_DTYPE = np.uint16


class GlobalizerError(ValueError):
    """Raised when a campaign input or exact search invariant is invalid."""


class BudgetReached(RuntimeError):
    """Internal signal for a bounded, resumable discovery frontier."""


@dataclass(frozen=True)
class SeedFrame:
    seed_id: str
    branch: int
    root_signature: tuple[int, ...]
    frame: tuple[tuple[int, int, int], ...]


@dataclass(frozen=True)
class SupportedEdge:
    point: int
    target: int
    support: frozenset[str]


@dataclass(frozen=True)
class LearnedBoundaryConflict:
    """A sound nogood for one forced edge crossing the residue partition.

    The edge endpoints are global point ids.  A seed is rejected by this
    clause only when it contains every listed local assignment *and* those two
    endpoints belong to distinct prospective C-residues in that seed's exact
    skeleton.  Rechecking the ownership predicate makes the clause reusable
    across different root signatures without assuming their partitions agree.
    """

    edge: tuple[int, int]
    support: tuple[str, ...]
    learned_from_seed: str

    @property
    def key(self) -> tuple[tuple[int, int], tuple[str, ...]]:
        return self.edge, self.support


@dataclass(frozen=True)
class RelationConflict:
    kind: str
    edge: tuple[int, int] | None
    support: frozenset[str]


@dataclass(frozen=True)
class FrameDomain:
    frames: tuple[tuple[tuple[int, int, int], ...], ...]
    complete: bool
    nodes: int


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


def load_sealed_json(path: Path, artifact_type: str | None = None) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf8"))
    if not isinstance(raw, dict):
        raise GlobalizerError(f"{path} does not contain a JSON object.")
    supplied = raw.get("artifactHash")
    if not isinstance(supplied, str) or seal(dict(raw))["artifactHash"] != supplied:
        raise GlobalizerError(f"{path} has an invalid artifact hash.")
    if artifact_type is not None and raw.get("artifactType") != artifact_type:
        raise GlobalizerError(f"{path} is not a {artifact_type} artifact.")
    return raw


def process_rss_bytes() -> int:
    """Return resident bytes without adding a runtime dependency."""

    if os.name == "nt":
        from ctypes import wintypes

        class Counter(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("page_faults", wintypes.DWORD),
                ("peak_working_set", ctypes.c_size_t),
                ("working_set", ctypes.c_size_t),
                ("quota_peak_paged", ctypes.c_size_t),
                ("quota_paged", ctypes.c_size_t),
                ("quota_peak_nonpaged", ctypes.c_size_t),
                ("quota_nonpaged", ctypes.c_size_t),
                ("pagefile", ctypes.c_size_t),
                ("peak_pagefile", ctypes.c_size_t),
            ]

        counters = Counter()
        counters.cb = ctypes.sizeof(counters)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        psapi.GetProcessMemoryInfo.argtypes = [
            wintypes.HANDLE,
            ctypes.POINTER(Counter),
            wintypes.DWORD,
        ]
        psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
        handle = kernel.GetCurrentProcess()
        ok = psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb)
        return int(counters.working_set) if ok else 0
    try:
        import resource

        value = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        return value if sys.platform == "darwin" else value * 1024
    except (ImportError, OSError):
        return 0


class SearchBudget:
    """Shared wall-clock, node, and resident-memory guard."""

    def __init__(self, seconds: float, nodes: int, memory_mb: int) -> None:
        self.started = time.monotonic()
        self.deadline = self.started + seconds if seconds > 0 else None
        self.node_limit = nodes
        self.memory_limit = memory_mb * 1024 * 1024 if memory_mb > 0 else None
        self.nodes = 0
        self.peak_rss = process_rss_bytes()
        self.reason: str | None = None

    def step(self, count: int = 1) -> None:
        self.nodes += count
        if self.node_limit > 0 and self.nodes > self.node_limit:
            self.reason = "node-budget"
            raise BudgetReached
        if self.nodes & 0x3FF:
            return
        if self.deadline is not None and time.monotonic() >= self.deadline:
            self.reason = "wall-clock-budget"
            raise BudgetReached
        rss = process_rss_bytes()
        self.peak_rss = max(self.peak_rss, rss)
        if self.memory_limit is not None and rss > self.memory_limit:
            self.reason = "resident-memory-budget"
            raise BudgetReached

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self.started


def build_seed_catalogue(
    checkpoint_path: Path,
    certificate_path: Path,
    source_path: Path,
) -> dict[str, Any]:
    """Extract the ignored 93-frame checkpoint into a compact tracked artifact."""

    checkpoint = load_sealed_json(
        checkpoint_path, "coxeter-canonical-augmentation-checkpoint"
    )
    certificate = load_sealed_json(certificate_path, augmentation.ARTIFACT_TYPE)
    source, _, source_hash = orbifold.load_source(source_path)
    outcomes = checkpoint.get("outcomes")
    if not isinstance(outcomes, list):
        raise GlobalizerError("The R6 checkpoint has no outcome catalogue.")
    expected_digest = (
        certificate.get("proof", {}).get("outcomes", {}).get("catalogueSha256")
    )
    if augmentation.sha256_json(outcomes) != expected_digest:
        raise GlobalizerError("The R6 checkpoint and public certificate disagree.")
    if checkpoint.get("counters", {}).get("survivingFrameCases") != 93:
        raise GlobalizerError("The expected 93-frame campaign is incomplete.")
    seeds: list[dict[str, Any]] = []
    for outcome in outcomes:
        frame = outcome.get("survivingFrame")
        if frame is None:
            continue
        record = {
            "firstStageBranch": int(outcome["firstStageBranch"]),
            "rootSignature": [int(value) for value in outcome["rootSignature"]],
            "frame": [[int(value) for value in item] for item in frame],
        }
        record["seedId"] = "frame-" + sha256_json(record)[:20]
        seeds.append(record)
    if len(seeds) != 93:
        raise GlobalizerError("The checkpoint did not yield exactly 93 frame seeds.")
    return seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": SEED_ARTIFACT_TYPE,
            "backendVersion": BACKEND_VERSION,
            "sourceSystem": source["name"],
            "inputHash": source_hash,
            "degree": block.DEFAULT_DEGREE,
            "seedCount": len(seeds),
            "seeds": seeds,
            "scope": {
                "kind": "R6-depth-5-prefix-window-local-frame-seeds",
                "complete": True,
                "claim": (
                    "This is the complete set of 93 local frames found in the "
                    "recorded first-100-prefix window. It is not a complete full-frame "
                    "catalogue."
                ),
            },
            "provenance": {
                "checkpointArtifactHash": checkpoint["artifactHash"],
                "checkpointCampaignHash": checkpoint["campaignHash"],
                "certificateArtifactHash": certificate["artifactHash"],
                "checkpointOutcomesSha256": expected_digest,
                "sourceSha256": sha256_file(source_path),
                "implementationSha256": sha256_file(Path(__file__)),
            },
            "nonClaims": [
                "complete full-frame enumeration",
                "complete second-gluing search",
                "torsion-free cover",
            ],
        }
    )


def load_seeds(
    path: Path, source_hash: str
) -> tuple[dict[str, Any], tuple[SeedFrame, ...]]:
    raw = load_sealed_json(path, SEED_ARTIFACT_TYPE)
    if raw.get("inputHash") != source_hash or raw.get("degree") != block.DEFAULT_DEGREE:
        raise GlobalizerError("The frame seeds are stale for this source or degree.")
    seeds = tuple(
        SeedFrame(
            str(item["seedId"]),
            int(item["firstStageBranch"]),
            tuple(map(int, item["rootSignature"])),
            tuple(tuple(map(int, part)) for part in item["frame"]),
        )
        for item in raw.get("seeds", [])
    )
    if len(seeds) != int(raw.get("seedCount", -1)) or not seeds:
        raise GlobalizerError("The frame seed catalogue is incomplete.")
    if len({seed.seed_id for seed in seeds}) != len(seeds):
        raise GlobalizerError("The frame seed catalogue contains duplicate ids.")
    return raw, seeds


def assignment_token(
    residue: int,
    standard_port: int,
    assignment: tuple[int, int, int],
) -> str:
    block_index, port_index, root_coordinate = assignment
    return (
        f"R{residue}:P{standard_port}=B{block_index}:Q{port_index}:X{root_coordinate}"
    )


def frame_tokens(residue: int, frame: Sequence[tuple[int, int, int]]) -> frozenset[str]:
    return frozenset(
        assignment_token(residue, standard_port, assignment)
        for standard_port, assignment in enumerate(frame)
    )


def frame_edges(
    catalogue: augmentation.RootFrameCatalogue,
    residue: int,
    frame: Sequence[tuple[int, int, int]],
) -> tuple[SupportedEdge, ...]:
    """Materialize one local frame as 192 supported, undirected edges."""

    if len(frame) != len(catalogue.standard_points):
        raise GlobalizerError("A local frame does not contain eight port assignments.")
    standard_to_current: dict[int, int] = {}
    token_by_standard: dict[int, str] = {}
    seen: set[int] = set()
    for standard_port, assignment in enumerate(frame):
        existing_block, port_index, root_coordinate = assignment
        current = catalogue.point_map(
            standard_port, existing_block, port_index, root_coordinate
        )
        standard = catalogue.standard_points[standard_port]
        token = assignment_token(residue, standard_port, assignment)
        for source, target in zip(standard, current, strict=True):
            source_int = int(source)
            target_int = int(target)
            standard_to_current[source_int] = target_int
            token_by_standard[source_int] = token
            if target_int in seen:
                raise GlobalizerError("A frame maps two standard points together.")
            seen.add(target_int)
    if len(standard_to_current) != 384 or len(seen) != 384:
        raise GlobalizerError("A frame does not identify one 384-point residue.")
    result: list[SupportedEdge] = []
    for source in range(len(catalogue.local_new_row)):
        target = int(catalogue.local_new_row[source])
        if source > target:
            continue
        point = standard_to_current[source]
        image = standard_to_current[target]
        if point > image:
            point, image = image, point
        result.append(
            SupportedEdge(
                point,
                image,
                frozenset((token_by_standard[source], token_by_standard[target])),
            )
        )
    if (
        len(result) != 192
        or len({edge.point for edge in result} | {edge.target for edge in result})
        != 384
    ):
        raise GlobalizerError("A local frame did not produce a perfect matching.")
    return tuple(sorted(result, key=lambda edge: (edge.point, edge.target)))


class ReasonedTriangleState:
    """Rollback triangle propagation with exact reasons for every forced edge."""

    def __init__(self, fixed_row: np.ndarray, residue_by_point: np.ndarray) -> None:
        degree = len(fixed_row)
        self.partner = np.full(degree, -1, dtype=np.int32)
        self.pair_by_point = np.full(degree, -1, dtype=np.int32)
        pairs: list[tuple[int, int]] = []
        for point in range(degree):
            target = int(fixed_row[point])
            if target == point or int(fixed_row[target]) != point:
                raise GlobalizerError("The fixed g7 row is not a free involution.")
            if point < target:
                pair = len(pairs)
                pairs.append((point, target))
                self.pair_by_point[point] = pair
                self.pair_by_point[target] = pair
        self.pair_points = tuple(pairs)
        self.neighbors: list[list[int]] = [[] for _ in pairs]
        self.edge_support: dict[tuple[int, int], frozenset[str]] = {}
        self.point_support: dict[int, frozenset[str]] = {}
        self.edge_log: list[tuple[int, int, int, int, bool, frozenset[str]]] = []
        self.residue_by_point = residue_by_point
        self.last_conflict: RelationConflict | None = None

    def checkpoint(self) -> int:
        return len(self.edge_log)

    def rollback(self, checkpoint: int) -> None:
        while len(self.edge_log) > checkpoint:
            point, target, left_pair, right_pair, _, _ = self.edge_log.pop()
            self.neighbors[left_pair].remove(right_pair)
            self.neighbors[right_pair].remove(left_pair)
            self.edge_support.pop(tuple(sorted((left_pair, right_pair))), None)
            self.point_support.pop(point, None)
            self.point_support.pop(target, None)
            self.partner[point] = -1
            self.partner[target] = -1
        self.last_conflict = None

    def _fail(
        self,
        kind: str,
        support: Iterable[str],
        edge: tuple[int, int] | None = None,
    ) -> bool:
        self.last_conflict = RelationConflict(
            kind,
            tuple(sorted(edge)) if edge is not None else None,
            frozenset(support),
        )
        return False

    def _component(self, root: int) -> tuple[list[int], int]:
        vertices: list[int] = []
        seen = {root}
        queue = [root]
        edges_twice = 0
        while queue:
            pair = queue.pop()
            vertices.append(pair)
            if len(vertices) > 3:
                return vertices, 0
            edges_twice += len(self.neighbors[pair])
            for target in self.neighbors[pair]:
                if target not in seen:
                    seen.add(target)
                    queue.append(target)
        return vertices, edges_twice // 2

    def _free_endpoint(self, pair: int) -> int | None:
        for point in self.pair_points[pair]:
            if self.partner[point] < 0:
                return point
        return None

    def add_edge(
        self,
        point: int,
        target: int,
        *,
        support: Iterable[str],
        forced: bool = False,
    ) -> bool:
        support_set = frozenset(support)
        existing = int(self.partner[point])
        if existing >= 0:
            if existing == target and int(self.partner[target]) == point:
                return True
            return self._fail(
                "point-already-matched",
                support_set | self.point_support.get(point, frozenset()),
                (point, target),
            )
        if int(self.partner[target]) >= 0:
            return self._fail(
                "point-already-matched",
                support_set | self.point_support.get(target, frozenset()),
                (point, target),
            )
        if forced and int(self.residue_by_point[point]) != int(
            self.residue_by_point[target]
        ):
            return self._fail(
                "forced-edge-crosses-residues", support_set, (point, target)
            )
        left_pair = int(self.pair_by_point[point])
        right_pair = int(self.pair_by_point[target])
        pair_key = tuple(sorted((left_pair, right_pair)))
        if left_pair == right_pair:
            return self._fail("loop-in-contracted-graph", support_set, (point, target))
        if right_pair in self.neighbors[left_pair]:
            return self._fail(
                "parallel-edge-in-contracted-graph",
                support_set | self.edge_support.get(pair_key, frozenset()),
                (point, target),
            )
        if len(self.neighbors[left_pair]) >= 2 or len(self.neighbors[right_pair]) >= 2:
            incident = set(support_set)
            for pair in (left_pair, right_pair):
                for neighbor in self.neighbors[pair]:
                    incident.update(self.edge_support[tuple(sorted((pair, neighbor)))])
            return self._fail("degree-above-two", incident, (point, target))

        self.partner[point] = target
        self.partner[target] = point
        self.point_support[point] = support_set
        self.point_support[target] = support_set
        self.neighbors[left_pair].append(right_pair)
        self.neighbors[right_pair].append(left_pair)
        self.edge_support[pair_key] = support_set
        self.edge_log.append(
            (point, target, left_pair, right_pair, forced, support_set)
        )

        component, edge_count = self._component(left_pair)
        if len(component) > 3:
            reasons = set(support_set)
            for pair in component[:3]:
                for neighbor in self.neighbors[pair]:
                    reasons.update(self.edge_support[tuple(sorted((pair, neighbor)))])
            return self._fail("component-above-three", reasons, (point, target))
        if edge_count >= len(component) and not (
            len(component) == 3 and edge_count == 3
        ):
            return self._fail("premature-cycle", support_set, (point, target))
        if len(component) == 3 and edge_count == 2:
            endpoints = [pair for pair in component if len(self.neighbors[pair]) == 1]
            if len(endpoints) != 2:
                return self._fail("malformed-three-path", support_set)
            left_free = self._free_endpoint(endpoints[0])
            right_free = self._free_endpoint(endpoints[1])
            if left_free is None or right_free is None:
                return self._fail("closed-endpoint-unavailable", support_set)
            path_support: set[str] = set()
            for pair in component:
                for neighbor in self.neighbors[pair]:
                    path_support.update(
                        self.edge_support[tuple(sorted((pair, neighbor)))]
                    )
            return self.add_edge(
                left_free,
                right_free,
                support=path_support,
                forced=True,
            )
        return True


def add_supported_edges(
    relation: ReasonedTriangleState, edges: Sequence[SupportedEdge]
) -> bool:
    for edge in edges:
        if not relation.add_edge(
            edge.point, edge.target, support=edge.support, forced=False
        ):
            return False
    return True


def learned_conflict_applies(
    conflict: LearnedBoundaryConflict,
    tokens: frozenset[str],
    residue_by_point: np.ndarray,
) -> bool:
    point, target = conflict.edge
    return set(conflict.support).issubset(tokens) and int(
        residue_by_point[point]
    ) != int(residue_by_point[target])


def stage_symmetry_audit(
    matrix: Sequence[Sequence[int]],
    state: block.SearchState,
    problem: block.OverlapGluingProblem,
) -> dict[str, Any]:
    diagram = orbifold.diagram_automorphisms(matrix)
    fixed_generators = tuple(
        sorted(
            set(block.STAGES[0].existing_subset)
            | {block.STAGES[0].new_generator, block.STAGES[1].new_generator}
        )
    )
    stage_stabilizer = [
        item
        for item in diagram.permutations
        if all(item[index] == index for index in fixed_generators)
    ]
    centralizer = block.transitive_centralizer_records(state, problem)
    fixed_gauge = block.residual_fixed_gauge_audit(problem, centralizer)
    return {
        "diagramAutomorphismCount": len(diagram.permutations),
        "diagramEnumerationComplete": diagram.complete,
        "fixedGeneratorIds": list(fixed_generators),
        "stageChainStabilizerCount": len(stage_stabilizer),
        "stageChainStabilizer": [list(item) for item in stage_stabilizer],
        "firstStageCentralizerOrder": len(centralizer),
        "fixedGaugeStabilizerOrder": fixed_gauge["fixedGaugeStabilizerOrder"],
        "reductionApplied": len(stage_stabilizer) > 1
        or fixed_gauge["fixedGaugeStabilizerOrder"] > 1,
        "claim": (
            "Only automorphisms preserving the ordered stage generators and the "
            "fixed overlap-map gauge may identify seeds."
        ),
    }


class LazyLocalFrameGenerator:
    """Bounded exact frame domains created only for forced residues.

    The standard port zero and its first point are anchored to remove the
    regular local-coordinate redundancy.  This is a discovery slice, not an
    exhaustive classification of every possible global holonomy.
    """

    def __init__(
        self,
        catalogue: augmentation.RootFrameCatalogue,
        fixed_row: np.ndarray,
        rng: random.Random,
        budget: SearchBudget,
        *,
        max_candidates: int,
        max_nodes: int,
    ) -> None:
        self.catalogue = catalogue
        self.fixed_row = fixed_row
        self.rng = rng
        self.budget = budget
        self.max_candidates = max_candidates
        self.max_nodes = max_nodes
        self.cache: dict[
            tuple[tuple[int, ...], tuple[tuple[int, int], ...]], FrameDomain
        ] = {}
        self.cache_hits = 0
        self.cache_misses = 0

    def generate(
        self,
        residue: int,
        signature: Sequence[int],
        required_edges: Sequence[tuple[int, int]],
    ) -> FrameDomain:
        key = (
            tuple(map(int, signature)),
            tuple(sorted(tuple(sorted(map(int, edge))) for edge in required_edges)),
        )
        cached = self.cache.get(key)
        if cached is not None and cached.complete:
            self.cache_hits += 1
            return cached
        self.cache_misses += 1
        required_partner: dict[int, int] = {}
        for point, target in key[1]:
            if point in required_partner and required_partner[point] != target:
                domain = FrameDomain((), True, 0)
                self.cache[key] = domain
                return domain
            required_partner[point] = target
            required_partner[target] = point

        assignments: list[tuple[int, int, int] | None] = [None] * 8
        maps: list[np.ndarray | None] = [None] * 8
        used_blocks: set[int] = set()
        candidates: list[tuple[tuple[int, int, int], ...]] = []
        nodes = 0
        interrupted = False

        def assign(standard_port: int, existing_block: int, root: int) -> bool:
            nonlocal nodes
            nodes += 1
            self.budget.step()
            if nodes > self.max_nodes:
                raise BudgetReached
            port = int(signature[existing_block])
            current = self.catalogue.point_map(
                standard_port, existing_block, port, root
            )
            # Any already mapped local interaction must agree with a boundary
            # edge that triangle propagation fixed earlier.
            for other, other_map in enumerate(maps):
                if other_map is None:
                    continue
                interactions = self.catalogue.interactions.get(
                    tuple(sorted((standard_port, other)))
                )
                if interactions is None:
                    continue
                left, right = (
                    (current, other_map)
                    if standard_port < other
                    else (other_map, current)
                )
                for left_coordinate, right_coordinate in interactions:
                    point = int(left[left_coordinate])
                    target = int(right[right_coordinate])
                    if point in required_partner and required_partner[point] != target:
                        return False
                    if target in required_partner and required_partner[target] != point:
                        return False
            assignments[standard_port] = (existing_block, port, root)
            maps[standard_port] = current
            used_blocks.add(existing_block)
            return True

        def unassign(standard_port: int) -> None:
            item = assignments[standard_port]
            if item is not None:
                used_blocks.remove(item[0])
            assignments[standard_port] = None
            maps[standard_port] = None

        def choose_port() -> int:
            unassigned = [
                index for index, value in enumerate(assignments) if value is None
            ]
            return max(
                unassigned,
                key=lambda candidate: (
                    sum(
                        1
                        for other, value in enumerate(assignments)
                        if value is not None
                        and tuple(sorted((candidate, other)))
                        in self.catalogue.interactions
                    ),
                    -candidate,
                ),
            )

        def visit() -> None:
            if len(candidates) >= self.max_candidates:
                raise BudgetReached
            if all(item is not None for item in assignments):
                frame = tuple(item for item in assignments if item is not None)
                edges = frame_edges(self.catalogue, residue, frame)
                edge_set = {(edge.point, edge.target) for edge in edges}
                if all(tuple(sorted(edge)) in edge_set for edge in key[1]):
                    candidates.append(frame)
                return
            standard_port = choose_port()
            choices = [
                (existing_block, root)
                for existing_block in range(8)
                if existing_block not in used_blocks
                for root in range(48)
            ]
            self.rng.shuffle(choices)
            for existing_block, root in choices:
                if not assign(standard_port, existing_block, root):
                    continue
                visit()
                unassign(standard_port)

        # The local regular-coordinate anchor removes duplicate descriptions of
        # the same induced matching. Required edges are still checked exactly.
        try:
            if assign(0, 0, 0):
                visit()
                unassign(0)
        except BudgetReached:
            interrupted = True
            for standard_port in range(8):
                if assignments[standard_port] is not None:
                    unassign(standard_port)
        domain = FrameDomain(tuple(candidates), not interrupted, nodes)
        if domain.complete:
            self.cache[key] = domain
        return domain


def independent_row_replay(
    row: np.ndarray,
    branch: int,
    first_states: Sequence[block.SearchState],
    problem: block.OverlapGluingProblem,
    matrix: Sequence[Sequence[int]],
) -> dict[str, Any]:
    identity = np.arange(problem.degree, dtype=UINT_DTYPE)
    fixed = first_states[branch].rows[block.STAGES[0].new_generator]
    assert fixed is not None
    updated = list(first_states[branch].rows)
    updated[problem.stage.new_generator] = row.copy()
    candidate = block.SearchState(tuple(updated), (branch,))
    spherical = [
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
    checks = {
        "completePermutation": bool(np.all(row < problem.degree)),
        "involution": bool(np.array_equal(row[row], identity)),
        "g4g7OrderThree": block.pair_relation_pass(row, fixed, 3),
        "allFinitePairRelations": block.finite_pair_relations_pass(
            candidate.rows, matrix
        ),
        "newCResiduesRegular": block.subgroup_action_is_regular(
            candidate.rows,
            problem.stage.new_subset,
            problem.local_groups[problem.stage.new_subset].order,
            problem.degree,
        ),
        "newSphericalRestrictionsRegular": block.newly_completed_spherical_checks(
            candidate, problem.stage.new_generator, spherical, problem.degree
        ),
    }
    checks["passed"] = all(checks.values())
    return checks


def run_globalizer(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    source, matrix, source_hash, first_states, problems, _ = (
        block._prepare_root_witness_campaign(
            argparse.Namespace(input=args.input, degree=args.degree)
        )
    )
    seed_artifact, seeds = load_seeds(args.seeds, source_hash)
    if any(seed.branch < 0 or seed.branch >= len(first_states) for seed in seeds):
        raise GlobalizerError("A seed refers to an unknown first-stage branch.")
    if len({seed.branch for seed in seeds}) != 1:
        raise GlobalizerError("The bounded campaign expects one concentrated branch.")
    branch = seeds[0].branch
    problem = problems[branch]
    catalogue = augmentation.RootFrameCatalogue(problem)
    fixed_row = first_states[branch].rows[block.STAGES[0].new_generator]
    assert fixed_row is not None
    symmetry = stage_symmetry_audit(matrix, first_states[branch], problem)
    # A nontrivial reduction is used only when both independently computed
    # stabilizers act in the fixed staged problem. For this campaign both are
    # trivial, so all 93 records remain representatives.
    representatives = seeds

    budget = SearchBudget(args.timeout_seconds, args.max_nodes, args.memory_mb)
    learned: dict[tuple[tuple[int, int], tuple[str, ...]], LearnedBoundaryConflict] = {}
    learned_hits = 0
    direct_seed_replays = 0
    root_relation_rejections = 0
    adjacent_domains_generated = 0
    domain_cache_hits = 0
    domain_cache_misses = 0
    complete_row: np.ndarray | None = None
    complete_seed: str | None = None
    replay_checks: dict[str, Any] | None = None
    interrupted = False
    traces: list[dict[str, Any]] = []

    for restart in range(args.restarts):
        rng = random.Random(args.random_seed + restart)
        order = list(representatives)
        rng.shuffle(order)
        restart_trace = {
            "restart": restart,
            "randomSeed": args.random_seed + restart,
            "seedOrderSha256": sha256_json([seed.seed_id for seed in order]),
            "directReplays": 0,
            "learnedPrunes": 0,
        }
        try:
            for seed in order:
                budget.step()
                columns = augmentation.distance_two_skeleton_columns(
                    seed.root_signature
                )
                residue_by_point = augmentation.build_residue_by_point(problem, columns)
                tokens = frame_tokens(0, seed.frame)
                if any(
                    learned_conflict_applies(conflict, tokens, residue_by_point)
                    for conflict in learned.values()
                ):
                    learned_hits += 1
                    restart_trace["learnedPrunes"] += 1
                    continue
                if not augmentation.replay_complete_frame(
                    catalogue, fixed_row, seed.frame
                ):
                    raise GlobalizerError(
                        f"Seed {seed.seed_id} failed its bound local replay."
                    )
                direct_seed_replays += 1
                restart_trace["directReplays"] += 1
                relation = ReasonedTriangleState(fixed_row, residue_by_point)
                edges = frame_edges(catalogue, 0, seed.frame)
                if not add_supported_edges(relation, edges):
                    root_relation_rejections += 1
                    conflict = relation.last_conflict
                    if (
                        conflict is not None
                        and conflict.kind == "forced-edge-crosses-residues"
                        and conflict.edge is not None
                    ):
                        learned_conflict = LearnedBoundaryConflict(
                            conflict.edge,
                            tuple(sorted(conflict.support)),
                            seed.seed_id,
                        )
                        learned.setdefault(learned_conflict.key, learned_conflict)
                    continue

                # This path is intentionally lazy. It is reached only when the
                # root frame survives all immediate boundary closures.
                generator = LazyLocalFrameGenerator(
                    catalogue,
                    fixed_row,
                    rng,
                    budget,
                    max_candidates=args.max_frames_per_domain,
                    max_nodes=args.max_local_nodes,
                )
                assigned = {0}
                frames_by_residue = {0: seed.frame}
                while len(assigned) < len(columns):
                    required_by_residue: dict[int, list[tuple[int, int]]] = {}
                    for point in range(problem.degree):
                        target = int(relation.partner[point])
                        if target < 0 or point > target:
                            continue
                        residue = int(residue_by_point[point])
                        if residue != int(residue_by_point[target]):
                            raise GlobalizerError(
                                "A cross-residue edge escaped relation propagation."
                            )
                        if residue not in assigned:
                            required_by_residue.setdefault(residue, []).append(
                                (point, target)
                            )
                    frontier = sorted(
                        required_by_residue,
                        key=lambda residue: (
                            -len(required_by_residue[residue]),
                            residue,
                        ),
                    )
                    if not frontier:
                        frontier = [
                            residue
                            for residue in range(len(columns))
                            if residue not in assigned
                        ][:1]
                    domains: list[tuple[int, FrameDomain]] = []
                    for residue in frontier:
                        domain = generator.generate(
                            residue,
                            columns[residue],
                            required_by_residue.get(residue, ()),
                        )
                        adjacent_domains_generated += 1
                        domains.append((residue, domain))
                    domain_cache_hits += generator.cache_hits
                    domain_cache_misses += generator.cache_misses
                    residue, domain = min(
                        domains,
                        key=lambda item: (
                            len(item[1].frames)
                            if item[1].complete
                            else len(item[1].frames) + args.max_frames_per_domain,
                            item[0],
                        ),
                    )
                    if not domain.frames:
                        if domain.complete:
                            root_relation_rejections += 1
                        else:
                            raise BudgetReached
                        break
                    frame = domain.frames[0]
                    checkpoint = relation.checkpoint()
                    if not add_supported_edges(
                        relation, frame_edges(catalogue, residue, frame)
                    ):
                        conflict = relation.last_conflict
                        relation.rollback(checkpoint)
                        if (
                            conflict is not None
                            and conflict.kind == "forced-edge-crosses-residues"
                            and conflict.edge is not None
                        ):
                            item = LearnedBoundaryConflict(
                                conflict.edge,
                                tuple(sorted(conflict.support)),
                                seed.seed_id,
                            )
                            learned.setdefault(item.key, item)
                        root_relation_rejections += 1
                        break
                    assigned.add(residue)
                    frames_by_residue[residue] = frame
                if len(assigned) != len(columns):
                    continue
                row = relation.partner.astype(UINT_DTYPE)
                checks = independent_row_replay(
                    row, branch, first_states, problem, matrix
                )
                if not checks["passed"]:
                    raise GlobalizerError(
                        "A global row failed independent Coxeter/spherical replay."
                    )
                complete_row = row
                complete_seed = seed.seed_id
                replay_checks = checks
                break
        except BudgetReached:
            interrupted = True
        traces.append(restart_trace)
        if complete_row is not None or interrupted:
            break

    coverage: list[dict[str, Any]] = []
    covered_seed_ids: set[str] = set()
    for conflict in sorted(learned.values(), key=lambda item: item.key):
        covered: list[str] = []
        for seed in representatives:
            columns = augmentation.distance_two_skeleton_columns(seed.root_signature)
            residue_by_point = augmentation.build_residue_by_point(problem, columns)
            if learned_conflict_applies(
                conflict, frame_tokens(0, seed.frame), residue_by_point
            ):
                covered.append(seed.seed_id)
                covered_seed_ids.add(seed.seed_id)
        coverage.append(
            {
                "kind": "forced-edge-crosses-residues",
                "edge": list(conflict.edge),
                "support": list(conflict.support),
                "learnedFromSeed": conflict.learned_from_seed,
                "coveredSeedCount": len(covered),
                "coveredSeedIdsSha256": sha256_json(covered),
            }
        )
    substantial_conflicts = len(covered_seed_ids) >= max(2, len(representatives) // 2)
    budget.peak_rss = max(budget.peak_rss, process_rss_bytes())
    status = (
        "candidate-found"
        if complete_row is not None
        else "seed-family-excluded-by-reusable-conflicts"
        if len(covered_seed_ids) == len(representatives) and learned
        else "useful-conflicts-learned"
        if substantial_conflicts
        else "incomplete"
    )
    row_record = None
    if complete_row is not None:
        row_record = {
            "seedId": complete_seed,
            "g4Row": [int(value) for value in complete_row],
            "g4RowSha256": hashlib.sha256(complete_row.tobytes()).hexdigest(),
            "independentReplay": replay_checks,
        }
    artifact = seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": RESULT_ARTIFACT_TYPE,
            "backendVersion": BACKEND_VERSION,
            "status": status,
            "complete": False,
            "candidateFound": complete_row is not None,
            "sourceSystem": source["name"],
            "inputHash": source_hash,
            "degree": args.degree,
            "scope": {
                "kind": "bounded-globalization-of-recorded-R6-frame-seeds",
                "seedCount": len(seeds),
                "representativeCount": len(representatives),
                "seedCatalogueHash": seed_artifact["artifactHash"],
                "fullFrameCatalogueComplete": False,
                "globalSecondGluingComplete": False,
            },
            "symmetryAudit": symmetry,
            "search": {
                "restartsRequested": args.restarts,
                "restartsCompleted": len(traces),
                "randomSeed": args.random_seed,
                "timeoutSeconds": args.timeout_seconds,
                "nodeBudget": args.max_nodes,
                "memoryBudgetMb": args.memory_mb,
                "elapsedSeconds": round(budget.elapsed, 6),
                "nodes": budget.nodes,
                "peakResidentBytes": budget.peak_rss,
                "interrupted": interrupted,
                "interruptReason": budget.reason,
                "directSeedReplays": direct_seed_replays,
                "learnedConflictPrunes": learned_hits,
                "rootRelationRejections": root_relation_rejections,
                "adjacentDomainsGenerated": adjacent_domains_generated,
                "boundaryCacheHits": domain_cache_hits,
                "boundaryCacheMisses": domain_cache_misses,
                "traces": traces,
            },
            "learnedConflicts": {
                "count": len(coverage),
                "coveredSeedCount": len(covered_seed_ids),
                "substantialFamilyExcluded": substantial_conflicts,
                "clauses": coverage,
            },
            "candidate": row_record,
            "promotionCriterion": (
                "Only a row whose independent replay passes may proceed to later "
                "generator gluings and full spherical-freeness certification."
            ),
            "claims": (
                ["complete-second-gluing-row"] if complete_row is not None else []
            ),
            "nonClaims": [
                "complete full-frame enumeration",
                "complete second-gluing classification",
                "torsion-free cover",
                "minimal index",
            ],
            "warnings": [
                "The 93 inputs are local seeds from a bounded prefix window.",
                "A learned boundary clause excludes only frames containing its exact assignments and satisfying its checked residue-ownership predicate.",
                "Failure in this discovery campaign is not a nonexistence proof for degree 5,760 actions.",
            ],
            "provenance": {
                "implementationSha256": sha256_file(Path(__file__)),
                "augmentationBackendSha256": sha256_file(
                    SCRIPT_DIR / "block_amalgam_canonical_augmentation.py"
                ),
                "blockBackendSha256": sha256_file(
                    SCRIPT_DIR / "block_amalgam_cover_search.py"
                ),
            },
        }
    )
    return artifact, 0 if complete_row is not None or substantial_conflicts else 2


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Globalize the concentrated compact-cube full-frame seeds."
    )
    subparsers = result.add_subparsers(dest="command", required=True)
    extract = subparsers.add_parser("extract-seeds")
    extract.add_argument("--checkpoint", type=Path, required=True)
    extract.add_argument("--certificate", type=Path, required=True)
    extract.add_argument("--input", type=Path, default=DEFAULT_SOURCE)
    extract.add_argument("--output", type=Path, required=True)

    search = subparsers.add_parser("search")
    search.add_argument("--input", type=Path, default=DEFAULT_SOURCE)
    search.add_argument("--seeds", type=Path, default=DEFAULT_SEEDS)
    search.add_argument("--output", type=Path, required=True)
    search.add_argument("--degree", type=int, default=block.DEFAULT_DEGREE)
    search.add_argument("--timeout-seconds", type=float, default=1800.0)
    search.add_argument("--memory-mb", type=int, default=6144)
    search.add_argument("--max-nodes", type=int, default=5_000_000)
    search.add_argument("--max-local-nodes", type=int, default=250_000)
    search.add_argument("--max-frames-per-domain", type=int, default=64)
    search.add_argument("--restarts", type=int, default=8)
    search.add_argument("--random-seed", type=int, default=20260813)
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "extract-seeds":
            artifact = build_seed_catalogue(
                args.checkpoint, args.certificate, args.input
            )
            atomic_write_json(args.output, artifact)
            return 0
        artifact, code = run_globalizer(args)
        atomic_write_json(args.output, artifact)
        return code
    except (GlobalizerError, block.BlockAmalgamError, OSError, ValueError) as exc:
        print(f"candidate globalizer failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
