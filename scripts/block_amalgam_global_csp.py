#!/usr/bin/env python3
"""Global degree-5,760 CSP for the compact-cube second gluing.

Unlike the R6/R8 campaigns, this solver does not take a window of local frames
as its search space.  Its ownership variables describe all fifteen prospective
``C = <g0,g2,g4,g5,g6>`` residues from the beginning.  After ownership is fixed,
the frame variables choose the exact equivariant port maps in every residue and
the existing triangle propagator enforces ``(g4 g7)^3`` globally.

The complete domain is enormous.  Resource-limited runs are discovery runs and
are reported as such.  ``complete`` can become true only when one traversal has
exhausted every first-stage branch and every declared ownership/frame value.
The optional R6 seed catalogue affects value order only; it never restricts the
domain.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import sys
from typing import Any, Iterable, Mapping, Sequence

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import block_amalgam_candidate_globalizer as globalizer  # noqa: E402
import block_amalgam_canonical_augmentation as augmentation  # noqa: E402
import block_amalgam_cover_search as block  # noqa: E402


SCHEMA_VERSION = 1
BACKEND_VERSION = "1.0.0"
ARTIFACT_TYPE = "coxeter-block-amalgam-global-csp"
CHECKPOINT_TYPE = "coxeter-block-amalgam-global-csp-checkpoint"
DEFAULT_SOURCE = Path("public/examples/compact_5_cube_gamma1.json")
DEFAULT_R8 = Path(
    "scripts/certificates/torsion-free/compact_5_cube_r8_candidate_globalizer_5760.json"
)
TOKEN_PATTERN = re.compile(
    r"^R(?P<residue>\d+):P(?P<standard>\d+)="
    r"B(?P<block>\d+):Q(?P<port>\d+):X(?P<root>\d+)$"
)


class GlobalCspError(ValueError):
    """Raised when a campaign input or exact CSP invariant is invalid."""


class RestartCutoff(RuntimeError):
    """Stop one deterministic restart without claiming domain exhaustion."""


@dataclass(frozen=True)
class AssignmentLiteral:
    variable: str
    value: int

    @property
    def token(self) -> str:
        return f"{self.variable}={self.value}"


@dataclass(frozen=True)
class ExactConflictClause:
    """An exact nogood, optionally conditional on a residue-boundary edge."""

    branch: int
    support: tuple[str, ...]
    kind: str
    edge: tuple[int, int] | None = None
    origin: str = "learned"

    @property
    def key(self) -> tuple[int, str, tuple[int, int] | None, tuple[str, ...]]:
        return self.branch, self.kind, self.edge, self.support

    def applies(
        self,
        branch: int,
        tokens: set[str] | frozenset[str],
        residue_by_point: np.ndarray | None,
    ) -> bool:
        if branch != self.branch or not set(self.support).issubset(tokens):
            return False
        if self.kind != "forced-edge-crosses-residues":
            return True
        if self.edge is None or residue_by_point is None:
            return False
        left, right = self.edge
        return int(residue_by_point[left]) != int(residue_by_point[right])

    def to_json(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "support": list(self.support),
            "kind": self.kind,
            "edge": list(self.edge) if self.edge is not None else None,
            "origin": self.origin,
        }

    @classmethod
    def from_json(cls, value: Mapping[str, Any]) -> "ExactConflictClause":
        edge = value.get("edge")
        return cls(
            int(value["branch"]),
            tuple(sorted(map(str, value["support"]))),
            str(value["kind"]),
            tuple(sorted(map(int, edge))) if edge is not None else None,
            str(value.get("origin", "checkpoint")),
        )


class ExactClauseDatabase:
    """Deduplicated exact clauses shared by all deterministic restarts."""

    def __init__(self, clauses: Iterable[ExactConflictClause] = ()) -> None:
        self._clauses = {clause.key: clause for clause in clauses}
        self.prunes = 0

    def add(self, clause: ExactConflictClause) -> bool:
        if not clause.support:
            raise GlobalCspError("A learned conflict has no supporting decisions.")
        if clause.key in self._clauses:
            return False
        self._clauses[clause.key] = clause
        return True

    def first_match(
        self,
        branch: int,
        tokens: set[str] | frozenset[str],
        residue_by_point: np.ndarray | None,
    ) -> ExactConflictClause | None:
        for clause in self.clauses:
            if clause.applies(branch, tokens, residue_by_point):
                self.prunes += 1
                return clause
        return None

    @property
    def clauses(self) -> tuple[ExactConflictClause, ...]:
        return tuple(sorted(self._clauses.values(), key=lambda item: item.key))


class AllDifferentState:
    """Rollback all-different ownership rows used by the global CSP."""

    def __init__(self, rows: int, columns: int) -> None:
        self.values = [[-1] * columns for _ in range(rows)]
        self.used = [set() for _ in range(rows)]
        self.log: list[tuple[int, int, int]] = []

    def checkpoint(self) -> int:
        return len(self.log)

    def assign(self, row: int, column: int, value: int) -> bool:
        existing = self.values[row][column]
        if existing >= 0:
            return existing == value
        if value in self.used[row]:
            return False
        self.values[row][column] = value
        self.used[row].add(value)
        self.log.append((row, column, value))
        return True

    def rollback(self, checkpoint: int) -> None:
        while len(self.log) > checkpoint:
            row, column, value = self.log.pop()
            self.values[row][column] = -1
            self.used[row].remove(value)


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


def canonical_assignment_key(
    assignment: Mapping[str, int],
    symmetry_images: Sequence[Mapping[str, str]],
) -> tuple[tuple[str, int], ...]:
    """Return the lexicographically least image under a verified symmetry group."""

    images: list[tuple[tuple[str, int], ...]] = []
    identity = {variable: variable for variable in assignment}
    for symmetry in (identity, *symmetry_images):
        images.append(
            tuple(
                sorted(
                    (symmetry.get(variable, variable), value)
                    for variable, value in assignment.items()
                )
            )
        )
    return min(images)


def is_canonical_assignment(
    assignment: Mapping[str, int],
    symmetry_images: Sequence[Mapping[str, str]],
) -> bool:
    return tuple(sorted(assignment.items())) == canonical_assignment_key(
        assignment, symmetry_images
    )


def propagate_implications(
    assignment: dict[str, int],
    implications: Mapping[AssignmentLiteral, Sequence[AssignmentLiteral]],
) -> tuple[bool, tuple[AssignmentLiteral, ...]]:
    """Close a finite implication system, detecting contradictory forced values."""

    queue = [
        AssignmentLiteral(variable, value) for variable, value in assignment.items()
    ]
    forced: list[AssignmentLiteral] = []
    seen: set[AssignmentLiteral] = set()
    while queue:
        literal = queue.pop()
        if literal in seen:
            continue
        seen.add(literal)
        for target in implications.get(literal, ()):
            previous = assignment.get(target.variable)
            if previous is not None and previous != target.value:
                return False, tuple(forced)
            if previous is None:
                assignment[target.variable] = target.value
                forced.append(target)
                queue.append(target)
    return True, tuple(forced)


def parse_assignment_token(token: str) -> tuple[int, int, int, int, int]:
    match = TOKEN_PATTERN.fullmatch(token)
    if match is None:
        raise GlobalCspError(f"Malformed frame-assignment token: {token}")
    return tuple(
        int(match.group(name))
        for name in ("residue", "standard", "block", "port", "root")
    )


def supported_edges_for_new_assignment(
    catalogue: augmentation.RootFrameCatalogue,
    residue: int,
    assignments: Mapping[int, tuple[int, int, int]],
    new_standard_port: int,
) -> tuple[globalizer.SupportedEdge, ...]:
    """Materialize interactions completed by one local-frame assignment."""

    block_index, port_index, root_coordinate = assignments[new_standard_port]
    current = catalogue.point_map(
        new_standard_port, block_index, port_index, root_coordinate
    )
    new_token = globalizer.assignment_token(
        residue, new_standard_port, assignments[new_standard_port]
    )
    result: list[globalizer.SupportedEdge] = []
    for other_standard, other_assignment in assignments.items():
        if other_standard == new_standard_port:
            continue
        interaction = catalogue.interactions.get(
            tuple(sorted((new_standard_port, other_standard)))
        )
        if interaction is None:
            continue
        other = catalogue.point_map(other_standard, *other_assignment)
        other_token = globalizer.assignment_token(
            residue, other_standard, other_assignment
        )
        left_map, right_map = (
            (current, other) if new_standard_port < other_standard else (other, current)
        )
        for left_coordinate, right_coordinate in interaction:
            point = int(left_map[left_coordinate])
            target = int(right_map[right_coordinate])
            if point > target:
                point, target = target, point
            result.append(
                globalizer.SupportedEdge(
                    point,
                    target,
                    frozenset((new_token, other_token)),
                )
            )
    return tuple(sorted(result, key=lambda edge: (edge.point, edge.target)))


def _r8_clause_is_forced(
    catalogue: augmentation.RootFrameCatalogue,
    fixed_row: np.ndarray,
    support: Sequence[str],
    expected_edge: tuple[int, int],
) -> bool:
    assignments: dict[int, tuple[int, int, int]] = {}
    residue = -1
    for token in support:
        item_residue, standard, block_index, port_index, root = parse_assignment_token(
            token
        )
        if residue < 0:
            residue = item_residue
        if item_residue != residue or standard in assignments:
            return False
        assignments[standard] = (block_index, port_index, root)
    relation = globalizer.ReasonedTriangleState(
        fixed_row, np.zeros(len(fixed_row), dtype=np.int16)
    )
    inserted: set[tuple[int, int]] = set()
    for standard in sorted(assignments):
        edges = supported_edges_for_new_assignment(
            catalogue, residue, assignments, standard
        )
        fresh = [edge for edge in edges if (edge.point, edge.target) not in inserted]
        inserted.update((edge.point, edge.target) for edge in fresh)
        if not globalizer.add_supported_edges(relation, fresh):
            return False
    expected = tuple(sorted(expected_edge))
    return any(
        tuple(sorted((point, target))) == expected
        and forced
        and set(reason).issubset(support)
        for point, target, _, _, forced, reason in relation.edge_log
    )


def load_and_verify_r8_clauses(
    path: Path,
    source_hash: str,
    first_states: Sequence[block.SearchState],
    problems: Sequence[block.OverlapGluingProblem],
) -> tuple[dict[str, Any], tuple[ExactConflictClause, ...], dict[str, Any]]:
    """Verify each R8 clause by replaying its claimed forced boundary edge."""

    raw = globalizer.load_sealed_json(path, globalizer.RESULT_ARTIFACT_TYPE)
    if raw.get("inputHash") != source_hash or raw.get("degree") != block.DEFAULT_DEGREE:
        raise GlobalCspError("The R8 conflict artifact is stale for this campaign.")
    records = raw.get("learnedConflicts", {}).get("clauses")
    if not isinstance(records, list) or not records:
        raise GlobalCspError("The R8 artifact contains no learned clauses.")
    replayed: list[tuple[tuple[int, int], tuple[str, ...], str, list[int]]] = []
    for record in records:
        edge = tuple(sorted(map(int, record["edge"])))
        support = tuple(sorted(map(str, record["support"])))
        matching_branches: list[int] = []
        for branch, problem in enumerate(problems):
            fixed = first_states[branch].rows[block.STAGES[0].new_generator]
            assert fixed is not None
            if _r8_clause_is_forced(
                augmentation.RootFrameCatalogue(problem), fixed, support, edge
            ):
                matching_branches.append(branch)
        if not matching_branches:
            raise GlobalCspError(
                "An R8 clause was not forced in any first-stage branch: "
                f"edge={edge}, branches={matching_branches}."
            )
        replayed.append((edge, support, str(record["kind"]), matching_branches))
    common_branches = set(range(len(problems)))
    for _, _, _, matching_branches in replayed:
        common_branches.intersection_update(matching_branches)
    if len(common_branches) != 1:
        raise GlobalCspError(
            "The complete R8 clause family did not bind to exactly one first-stage "
            f"branch: {sorted(common_branches)}."
        )
    bound_branch = next(iter(common_branches))
    clauses: list[ExactConflictClause] = []
    verification: list[dict[str, Any]] = []
    for edge, support, kind, matching_branches in replayed:
        clause = ExactConflictClause(
            bound_branch,
            support,
            kind,
            edge,
            "R8-verified-replay",
        )
        clauses.append(clause)
        verification.append(
            {
                "edge": list(edge),
                "branch": clause.branch,
                "replayBranches": matching_branches,
                "supportSha256": sha256_json(list(support)),
                "forcedEdgeReplayPassed": True,
            }
        )
    return (
        raw,
        tuple(clauses),
        {
            "artifactHash": raw["artifactHash"],
            "clauseCount": len(clauses),
            "allForcedEdgesReplayed": True,
            "clausesSha256": sha256_json(verification),
        },
    )


def domain_declaration(branch_count: int) -> dict[str, Any]:
    ownership_permutations = math.factorial(15) ** 7
    local_frames_per_residue = math.factorial(7) * (48**7)
    return {
        "kind": "global-port-ownership-and-local-equivariant-frame-domain",
        "firstStageBranches": branch_count,
        "ownership": {
            "residueCount": 15,
            "existingBlockCount": 8,
            "block0Gauge": "identity fixes all residue names",
            "remainingVariables": 105,
            "constraint": "each existing block uses every P-port exactly once",
            "assignmentsPerBranch": str(ownership_permutations),
        },
        "frames": {
            "variablesPerResidue": 14,
            "standardPort0Gauge": "B0 with root coordinate 0",
            "remainingBlockAssignments": 7,
            "remainingRootAssignments": 7,
            "rootDomainSize": 48,
            "framesPerResidue": str(local_frames_per_residue),
        },
        "totalAssignments": str(
            branch_count * ownership_permutations * local_frames_per_residue**15
        ),
        "seedRestrictsDomain": False,
    }


def campaign_hash_for(
    source_hash: str,
    matrix: Sequence[Sequence[int]],
    problems: Sequence[block.OverlapGluingProblem],
    r8_hash: str,
    random_seed: int,
) -> str:
    return sha256_json(
        {
            "backendVersion": BACKEND_VERSION,
            "sourceHash": source_hash,
            "matrix": matrix,
            "degree": block.DEFAULT_DEGREE,
            "problemHashes": [problem.problem_hash for problem in problems],
            "domain": domain_declaration(len(problems)),
            "r8ArtifactHash": r8_hash,
            "randomSeed": random_seed,
            "dependencyHashes": {
                "cover": sha256_file(SCRIPT_DIR / "block_amalgam_cover_search.py"),
                "augmentation": sha256_file(
                    SCRIPT_DIR / "block_amalgam_canonical_augmentation.py"
                ),
                "globalizer": sha256_file(
                    SCRIPT_DIR / "block_amalgam_candidate_globalizer.py"
                ),
            },
        }
    )


def checkpoint_payload(
    campaign_hash: str,
    next_restart: int,
    exhausted_branches: Iterable[int],
    clauses: Iterable[ExactConflictClause],
    counters: Mapping[str, Any],
    *,
    mid_restart_replay_required: bool,
) -> dict[str, Any]:
    return seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": CHECKPOINT_TYPE,
            "backendVersion": BACKEND_VERSION,
            "campaignHash": campaign_hash,
            "nextRestart": next_restart,
            "exhaustedBranches": sorted(set(map(int, exhausted_branches))),
            "learnedClauses": [item.to_json() for item in clauses],
            "counters": dict(counters),
            "midRestartReplayRequired": mid_restart_replay_required,
        }
    )


def load_checkpoint(path: Path | None, campaign_hash: str) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf8"))
    supplied = raw.get("artifactHash")
    if not isinstance(supplied, str) or seal(dict(raw))["artifactHash"] != supplied:
        raise GlobalCspError("The global-CSP checkpoint hash is invalid.")
    if (
        raw.get("artifactType") != CHECKPOINT_TYPE
        or raw.get("backendVersion") != BACKEND_VERSION
        or raw.get("campaignHash") != campaign_hash
    ):
        raise GlobalCspError("The global-CSP checkpoint is stale for this domain.")
    return raw


def completeness_report(
    *,
    candidate_found: bool,
    exhausted_branches: Iterable[int],
    branch_count: int,
    interrupted: bool,
) -> dict[str, Any]:
    exhausted = sorted(set(map(int, exhausted_branches)))
    domain_exhausted = (
        not candidate_found and not interrupted and len(exhausted) == branch_count
    )
    return {
        "declaredFiniteDomainExhausted": domain_exhausted,
        "exhaustedFirstStageBranches": exhausted,
        "firstStageBranchCount": branch_count,
        "degreeNonexistenceClaim": False,
        "claim": (
            "A complete second-gluing row was independently replayed."
            if candidate_found
            else (
                "The declared global second-gluing domain was exhausted. This is not a degree-5,760 nonexistence claim for the complete Coxeter action."
                if domain_exhausted
                else "The declared finite domain was not exhausted; no nonexistence conclusion follows."
            )
        ),
    }


def compact_symmetry_audit(
    matrix: Sequence[Sequence[int]],
    first_states: Sequence[block.SearchState],
    problems: Sequence[block.OverlapGluingProblem],
) -> dict[str, Any]:
    """Compress the verified staged symmetry data without repeating its prose."""

    full = [
        globalizer.stage_symmetry_audit(matrix, state, problem)
        for state, problem in zip(first_states, problems, strict=True)
    ]
    first = full[0]
    return {
        "auditSha256": sha256_json(full),
        "diagramAutomorphismCount": first["diagramAutomorphismCount"],
        "diagramEnumerationComplete": first["diagramEnumerationComplete"],
        "stageChainStabilizerCount": first["stageChainStabilizerCount"],
        "branches": [
            {
                "branch": branch,
                "firstStageCentralizerOrder": item["firstStageCentralizerOrder"],
                "fixedGaugeStabilizerOrder": item["fixedGaugeStabilizerOrder"],
            }
            for branch, item in enumerate(full)
        ],
    }


def _stable_order(
    values: Iterable[int],
    *,
    random_seed: int,
    restart: int,
    variable: str,
    path_tokens: Iterable[str],
    preferred: int | None = None,
) -> list[int]:
    result = sorted(set(map(int, values)))
    digest = hashlib.sha256(
        canonical_json(
            {
                "seed": random_seed,
                "restart": restart,
                "variable": variable,
                "path": sorted(path_tokens),
            }
        ).encode("utf8")
    ).digest()
    random.Random(int.from_bytes(digest[:8], "big")).shuffle(result)
    if preferred in result:
        result.remove(preferred)
        result.insert(0, preferred)
    return result


class GlobalSecondGluingSearch:
    """One exact traversal of the global ownership/frame CSP."""

    def __init__(
        self,
        *,
        branch: int,
        problem: block.OverlapGluingProblem,
        first_state: block.SearchState,
        matrix: Sequence[Sequence[int]],
        clauses: ExactClauseDatabase,
        budget: globalizer.SearchBudget,
        restart: int,
        random_seed: int,
        restart_node_limit: int,
        ownership_hint: Sequence[int] | None = None,
        frame_hint: Sequence[tuple[int, int, int]] | None = None,
    ) -> None:
        self.branch = branch
        self.problem = problem
        self.first_state = first_state
        self.matrix = matrix
        self.clauses = clauses
        self.budget = budget
        self.restart = restart
        self.random_seed = random_seed
        self.restart_node_limit = restart_node_limit
        self.restart_nodes = 0
        self.ownership = AllDifferentState(8, 15)
        for residue in range(15):
            if not self.ownership.assign(0, residue, residue):
                raise GlobalCspError("The block-zero ownership gauge is inconsistent.")
        self.ownership.log.clear()
        self.ownership_hint = tuple(ownership_hint) if ownership_hint else None
        self.frame_hint = tuple(frame_hint) if frame_hint else None
        self.catalogue = augmentation.RootFrameCatalogue(problem)
        fixed = first_state.rows[block.STAGES[0].new_generator]
        if fixed is None:
            raise GlobalCspError("The first-stage fixed row is absent.")
        self.fixed_row = fixed
        self.tokens: set[str] = set()
        self.learned_count = 0
        self.relation_rejections = 0
        self.clause_prunes = 0
        self.candidate_row: np.ndarray | None = None
        self.candidate_replay: dict[str, Any] | None = None

    def _step(self) -> None:
        self.budget.step()
        self.restart_nodes += 1
        if self.restart_node_limit > 0 and self.restart_nodes > self.restart_node_limit:
            raise RestartCutoff

    def _learn_relation_conflict(
        self,
        relation: globalizer.ReasonedTriangleState,
    ) -> None:
        conflict = relation.last_conflict
        if conflict is None or not conflict.support:
            return
        clause = ExactConflictClause(
            self.branch,
            tuple(sorted(conflict.support)),
            conflict.kind,
            conflict.edge if conflict.kind == "forced-edge-crosses-residues" else None,
            "global-CSP-exact-propagation",
        )
        if self.clauses.add(clause):
            self.learned_count += 1

    def _ownership_signatures(self) -> tuple[tuple[int, ...], ...]:
        return tuple(
            tuple(
                self.ownership.values[block_index][residue] for block_index in range(8)
            )
            for residue in range(15)
        )

    def search(self) -> str:
        found = self._search_ownership(0)
        if found:
            return "candidate"
        return "exhausted"

    def _search_ownership(self, offset: int) -> bool:
        # Variables are global even though DFS assigns them incrementally.  The
        # residue-major order completes ownership columns early and is stable
        # across restarts; all-different propagation acts on all seven rows.
        if offset == 105:
            signatures = self._ownership_signatures()
            residue_by_point = augmentation.build_residue_by_point(
                self.problem, signatures
            )
            relation = globalizer.ReasonedTriangleState(
                self.fixed_row, residue_by_point
            )
            return self._search_residue_frame(0, signatures, residue_by_point, relation)
        residue = offset // 7
        block_index = 1 + offset % 7
        variable = f"O:B{block_index}:R{residue}"
        preferred = None
        if residue == 0 and self.ownership_hint is not None:
            preferred = int(self.ownership_hint[block_index])
        choices = _stable_order(
            (
                value
                for value in range(15)
                if value not in self.ownership.used[block_index]
            ),
            random_seed=self.random_seed,
            restart=self.restart,
            variable=variable,
            path_tokens=self.tokens,
            preferred=preferred,
        )
        for value in choices:
            self._step()
            checkpoint = self.ownership.checkpoint()
            if self.ownership.assign(block_index, residue, value):
                self.tokens.add(f"{variable}={value}")
                if self._search_ownership(offset + 1):
                    return True
                self.tokens.remove(f"{variable}={value}")
            self.ownership.rollback(checkpoint)
        return False

    def _search_residue_frame(
        self,
        residue: int,
        signatures: Sequence[Sequence[int]],
        residue_by_point: np.ndarray,
        relation: globalizer.ReasonedTriangleState,
    ) -> bool:
        if residue == len(signatures):
            row = relation.partner.astype(block.UINT_DTYPE)
            if np.any(relation.partner < 0):
                raise GlobalCspError("A complete frame assignment missed g4 edges.")
            # independent_row_replay indexes the supplied state tuple by the
            # original first-stage branch number.
            padded = tuple(self.first_state for _ in range(self.branch + 1))
            replay = globalizer.independent_row_replay(
                row, self.branch, padded, self.problem, self.matrix
            )
            if not replay["passed"]:
                raise GlobalCspError("A complete row failed independent replay.")
            self.candidate_row = row
            self.candidate_replay = replay
            return True

        signature = signatures[residue]
        assignments = {0: (0, int(signature[0]), 0)}
        anchor_token = globalizer.assignment_token(residue, 0, assignments[0])
        self.tokens.add(anchor_token)
        matched = self._search_frame_port(
            residue,
            1,
            signatures,
            residue_by_point,
            relation,
            assignments,
            {0},
        )
        self.tokens.remove(anchor_token)
        return matched

    def _search_frame_port(
        self,
        residue: int,
        standard_port: int,
        signatures: Sequence[Sequence[int]],
        residue_by_point: np.ndarray,
        relation: globalizer.ReasonedTriangleState,
        assignments: dict[int, tuple[int, int, int]],
        used_blocks: set[int],
    ) -> bool:
        if standard_port == 8:
            return self._search_residue_frame(
                residue + 1, signatures, residue_by_point, relation
            )
        hint = None
        if residue == 0 and self.frame_hint is not None:
            hint = self.frame_hint[standard_port]
        block_values = _stable_order(
            (value for value in range(8) if value not in used_blocks),
            random_seed=self.random_seed,
            restart=self.restart,
            variable=f"F:R{residue}:P{standard_port}:block",
            path_tokens=self.tokens,
            preferred=hint[0] if hint is not None else None,
        )
        for block_index in block_values:
            root_values = _stable_order(
                range(48),
                random_seed=self.random_seed,
                restart=self.restart,
                variable=f"F:R{residue}:P{standard_port}:B{block_index}:root",
                path_tokens=self.tokens,
                preferred=(
                    hint[2] if hint is not None and hint[0] == block_index else None
                ),
            )
            for root in root_values:
                self._step()
                assignment = (block_index, int(signatures[residue][block_index]), root)
                token = globalizer.assignment_token(residue, standard_port, assignment)
                assignments[standard_port] = assignment
                used_blocks.add(block_index)
                self.tokens.add(token)
                checkpoint = relation.checkpoint()
                clause = self.clauses.first_match(
                    self.branch, self.tokens, residue_by_point
                )
                passed = clause is None
                if clause is not None:
                    self.clause_prunes += 1
                if passed:
                    edges = supported_edges_for_new_assignment(
                        self.catalogue, residue, assignments, standard_port
                    )
                    passed = globalizer.add_supported_edges(relation, edges)
                    if not passed:
                        self.relation_rejections += 1
                        self._learn_relation_conflict(relation)
                if passed and self._search_frame_port(
                    residue,
                    standard_port + 1,
                    signatures,
                    residue_by_point,
                    relation,
                    assignments,
                    used_blocks,
                ):
                    return True
                relation.rollback(checkpoint)
                self.tokens.remove(token)
                used_blocks.remove(block_index)
                assignments.pop(standard_port)
        return False


def _seed_hints(
    path: Path | None,
    source_hash: str,
) -> tuple[
    str | None, dict[int, tuple[tuple[int, ...], tuple[tuple[int, int, int], ...]]]
]:
    if path is None:
        return None, {}
    raw, seeds = globalizer.load_seeds(path, source_hash)
    result: dict[int, tuple[tuple[int, ...], tuple[tuple[int, int, int], ...]]] = {}
    for seed in seeds:
        result.setdefault(seed.branch, (seed.root_signature, seed.frame))
    return str(raw["artifactHash"]), result


def run_campaign(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    source, matrix, source_hash, first_states, problems, _ = (
        block._prepare_root_witness_campaign(
            argparse.Namespace(input=args.input, degree=args.degree)
        )
    )
    if args.degree != block.DEFAULT_DEGREE:
        raise GlobalCspError("This global CSP is scoped to degree 5,760.")
    r8, preloaded, r8_verification = load_and_verify_r8_clauses(
        args.r8_conflicts, source_hash, first_states, problems
    )
    seed_hash, hints = _seed_hints(args.seed_artifact, source_hash)
    campaign_hash = campaign_hash_for(
        source_hash, matrix, problems, r8["artifactHash"], args.random_seed
    )
    checkpoint = load_checkpoint(args.checkpoint, campaign_hash)
    clauses = ExactClauseDatabase(preloaded)
    exhausted_branches: set[int] = set()
    next_restart = 0
    prior_counters: dict[str, int] = {}
    if checkpoint is not None:
        for item in checkpoint.get("learnedClauses", []):
            clauses.add(ExactConflictClause.from_json(item))
        exhausted_branches.update(map(int, checkpoint.get("exhaustedBranches", [])))
        next_restart = int(checkpoint.get("nextRestart", 0))
        prior_counters = {
            key: int(value)
            for key, value in checkpoint.get("counters", {}).items()
            if isinstance(value, int)
        }

    budget = globalizer.SearchBudget(
        args.timeout_seconds, args.max_nodes, args.memory_mb
    )
    candidate: dict[str, Any] | None = None
    interrupted = False
    interrupt_reason: str | None = None
    traces: list[dict[str, Any]] = []
    learned_this_run = 0
    relation_rejections = 0
    clause_prunes = 0
    restarts_completed = 0

    for restart in range(next_restart, args.restarts):
        branch_order = _stable_order(
            (
                branch
                for branch in range(len(problems))
                if branch not in exhausted_branches
            ),
            random_seed=args.random_seed,
            restart=restart,
            variable="first-stage-branch",
            path_tokens=(),
        )
        trace = {
            "restart": restart,
            "branchOrder": branch_order,
            "branchOrderSha256": sha256_json(branch_order),
            "outcomes": [],
        }
        restart_cut = False
        try:
            for branch in branch_order:
                hint = hints.get(branch)
                search = GlobalSecondGluingSearch(
                    branch=branch,
                    problem=problems[branch],
                    first_state=first_states[branch],
                    matrix=matrix,
                    clauses=clauses,
                    budget=budget,
                    restart=restart,
                    random_seed=args.random_seed,
                    restart_node_limit=args.max_nodes_per_restart,
                    ownership_hint=hint[0] if hint else None,
                    frame_hint=hint[1] if hint else None,
                )
                outcome = search.search()
                learned_this_run += search.learned_count
                relation_rejections += search.relation_rejections
                clause_prunes += search.clause_prunes
                trace["outcomes"].append(
                    {
                        "branch": branch,
                        "status": outcome,
                        "nodes": search.restart_nodes,
                        "learned": search.learned_count,
                    }
                )
                if outcome == "candidate":
                    assert search.candidate_row is not None
                    candidate = {
                        "branch": branch,
                        "g4Permutation": search.candidate_row.astype(
                            np.uint32
                        ).tolist(),
                        "g4PermutationSha256": hashlib.sha256(
                            search.candidate_row.tobytes()
                        ).hexdigest(),
                        "independentReplay": search.candidate_replay,
                    }
                    break
                exhausted_branches.add(branch)
        except RestartCutoff:
            restart_cut = True
            interrupt_reason = "per-restart-node-budget"
        except globalizer.BudgetReached:
            interrupted = True
            interrupt_reason = budget.reason
        trace["restartCutoff"] = restart_cut
        traces.append(trace)
        restarts_completed += 1
        next_restart = restart + 1 if restart_cut else restart
        if (
            candidate is not None
            or interrupted
            or len(exhausted_branches) == len(problems)
        ):
            break

    if candidate is None and len(exhausted_branches) < len(problems):
        interrupted = True
        interrupt_reason = interrupt_reason or "restart-budget"

    completeness = completeness_report(
        candidate_found=candidate is not None,
        exhausted_branches=exhausted_branches,
        branch_count=len(problems),
        interrupted=interrupted,
    )
    counters = {
        "invocations": prior_counters.get("invocations", 0) + 1,
        "nodes": prior_counters.get("nodes", 0) + budget.nodes,
        "learnedClauses": len(clauses.clauses),
        "learnedThisRun": learned_this_run,
        "relationRejections": prior_counters.get("relationRejections", 0)
        + relation_rejections,
        "clausePrunes": prior_counters.get("clausePrunes", 0) + clause_prunes,
    }
    if args.checkpoint is not None:
        atomic_write_json(
            args.checkpoint,
            checkpoint_payload(
                campaign_hash,
                next_restart,
                exhausted_branches,
                clauses.clauses,
                counters,
                mid_restart_replay_required=interrupted
                and interrupt_reason != "per-restart-node-budget",
            ),
        )

    status = (
        "candidate-found"
        if candidate is not None
        else (
            "declared-domain-exhausted"
            if completeness["declaredFiniteDomainExhausted"]
            else "incomplete-resource-bounded-search"
        )
    )
    artifact = seal(
        {
            "schemaVersion": SCHEMA_VERSION,
            "artifactType": ARTIFACT_TYPE,
            "backendVersion": BACKEND_VERSION,
            "status": status,
            "complete": bool(completeness["declaredFiniteDomainExhausted"]),
            "candidateFound": candidate is not None,
            "sourceSystem": source["name"],
            "inputHash": source_hash,
            "degree": args.degree,
            "campaignHash": campaign_hash,
            "domain": domain_declaration(len(problems)),
            "symmetryReduction": {
                "residueRelabeling": "fixed canonically by block-0 ownership identity",
                "localRegularCoordinate": "standard port 0 maps to B0/root 0",
                "diagramAndStageAudit": compact_symmetry_audit(
                    matrix, first_states, problems
                ),
                "seedWindowUsedAsDomain": False,
            },
            "propagation": {
                "localCResidues": "exact equivariant A3xA1 port maps",
                "crossRelation": "rollback propagation of (g4 g7)^3 triangles",
                "candidateGate": "all finite pair relations and newly completed spherical restrictions are independently replayed",
            },
            "preloadedR8Conflicts": r8_verification,
            "optionalSeedOrdering": {
                "used": seed_hash is not None,
                "artifactHash": seed_hash,
                "restrictsDomain": False,
            },
            "search": {
                "randomSeed": args.random_seed,
                "deterministicRandomizedRestarts": True,
                "restartsRequested": args.restarts,
                "restartsCompletedThisRun": restarts_completed,
                "timeoutSeconds": args.timeout_seconds,
                "nodeBudget": args.max_nodes,
                "nodeBudgetPerRestart": args.max_nodes_per_restart,
                "memoryBudgetMb": args.memory_mb,
                "nodesThisRun": budget.nodes,
                "interrupted": interrupted,
                "interruptReason": interrupt_reason,
                "counters": counters,
                "traces": traces,
            },
            "learnedConflicts": {
                "count": len(clauses.clauses),
                "preloadedCount": len(preloaded),
                "learnedThisRun": learned_this_run,
                "clausesSha256": sha256_json(
                    [item.to_json() for item in clauses.clauses]
                ),
            },
            "completeness": completeness,
            "candidate": candidate,
            "claims": ["complete-second-gluing-row"] if candidate else [],
            "nonClaims": [
                "degree-5,760 nonexistence",
                "torsion-free cover",
                "minimal index",
                "complete Coxeter generator action",
            ],
            "warnings": [
                "A resource-bounded run is a discovery run, not an exhaustion proof.",
                "R8 clauses are applied only after their forced edges are independently replayed and their boundary predicate is rechecked.",
                "A second-gluing row must still pass later generator stages and full spherical-freeness certification.",
            ],
            "provenance": {
                "implementationSha256": sha256_file(Path(__file__)),
                "blockBackendSha256": sha256_file(
                    SCRIPT_DIR / "block_amalgam_cover_search.py"
                ),
                "augmentationBackendSha256": sha256_file(
                    SCRIPT_DIR / "block_amalgam_canonical_augmentation.py"
                ),
                "globalizerBackendSha256": sha256_file(
                    SCRIPT_DIR / "block_amalgam_candidate_globalizer.py"
                ),
            },
        }
    )
    return artifact, 0 if candidate is not None else (3 if artifact["complete"] else 2)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Search the global compact-cube second-gluing CSP."
    )
    result.add_argument("--input", type=Path, default=DEFAULT_SOURCE)
    result.add_argument("--r8-conflicts", type=Path, default=DEFAULT_R8)
    result.add_argument("--seed-artifact", type=Path)
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--checkpoint", type=Path)
    result.add_argument("--degree", type=int, default=block.DEFAULT_DEGREE)
    result.add_argument("--timeout-seconds", type=float, default=30.0)
    result.add_argument("--memory-mb", type=int, default=2048)
    result.add_argument("--max-nodes", type=int, default=50_000)
    result.add_argument("--max-nodes-per-restart", type=int, default=10_000)
    result.add_argument("--restarts", type=int, default=4)
    result.add_argument("--random-seed", type=int, default=20260813)
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        artifact, code = run_campaign(args)
        atomic_write_json(args.output, artifact)
        return code
    except (
        GlobalCspError,
        globalizer.GlobalizerError,
        augmentation.CanonicalAugmentationError,
        block.BlockAmalgamError,
        OSError,
        ValueError,
    ) as exc:
        print(f"global block-amalgam CSP failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
