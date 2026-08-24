#!/usr/bin/env python3
"""Build and check geometry-informed Coxeter orbifold-cover constraints.

This track uses the facet incidence of a Coxeter cube to organize a search for
a finite-sheeted torsion-free cover.  It does not infer generator permutations
from incidence data.  Instead it exports exact local constraints for GAP, Sage,
or another finite-group engine, and it independently checks any permutation
action returned by such an engine.

The mathematical test is local.  In a transitive action on ``W/H``, a maximal
spherical special subgroup ``W_T`` must act freely when ``H`` is torsion-free.
Consequently all of its orbits have size ``|W_T|``.  Conversely, freeness for
all maximal spherical special subgroups excludes every finite-order element
from every point stabilizer, by the Coxeter-group torsion theorem.
"""

from __future__ import annotations

import argparse
from collections import Counter, deque
from dataclasses import dataclass
from fractions import Fraction
import hashlib
import itertools
import json
import math
from pathlib import Path
import sys
from typing import Any, Iterable, Sequence

import torsion_free_discovery as discovery


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "coxeter-cover-search-track"
TRACK = "geometric-orbifold-cover"
SEED_FORMAT = "coxeter-orbifold-cover-constraint-seed"
ENGINE_ID = "geometry-informed-local-development-planner"
ENGINE_VERSION = "1.0.0"

DEFAULT_MAX_DEGREE = 576_000
DEFAULT_MAX_CANDIDATE_DEGREES = 100
DEFAULT_MAX_AUTOMORPHISMS = 100_000
DEFAULT_MAX_BACKTRACK_NODES = 2_000_000
DEFAULT_MAX_SUBSETS = 65_536
DEFAULT_MAX_SPHERICAL_ORDER = 100_000
DEFAULT_SEARCH_MODE = "auto"
DEFAULT_DIRECT_MAX_TARGET_DEGREE = 4
DEFAULT_DIRECT_MAX_SEARCH_NODES = 100_000
DEFAULT_DIRECT_MAX_TARGET_GROUP_ORDER = 256
DEFAULT_DIRECT_MAX_SUBGROUPS = 10_000
DEFAULT_DIRECT_MAX_CANDIDATES = 128
DEFAULT_CHECKPOINT_EVERY = 1_000
DEFAULT_EXTERNAL_DEGREE_THRESHOLD = 5_760
MAX_IN_PROCESS_TARGET_DEGREE = 7

Permutation = tuple[int, ...]


class OrbifoldCoverInputError(ValueError):
    """Raised when this track cannot interpret an input or action exactly."""


@dataclass(frozen=True)
class AutomorphismSearchResult:
    permutations: tuple[tuple[int, ...], ...]
    refined_colors: tuple[int, ...]
    nodes_visited: int
    complete: bool
    stop_reason: str | None


def canonical_json(value: Any) -> str:
    return discovery.canonical_json(value)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def with_artifact_hash(artifact: dict[str, Any]) -> dict[str, Any]:
    payload = {key: value for key, value in artifact.items() if key != "artifactHash"}
    return {**payload, "artifactHash": sha256_json(payload)}


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except OSError as exc:
        raise OrbifoldCoverInputError(f"Cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise OrbifoldCoverInputError(f"{path} is not valid JSON: {exc}") from exc


def load_source(path: Path) -> tuple[dict[str, Any], list[list[int]], str]:
    try:
        source_bytes = path.read_bytes()
        source_text = source_bytes.decode("utf8")
        raw = json.loads(source_text)
    except OSError as exc:
        raise OrbifoldCoverInputError(f"Cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise OrbifoldCoverInputError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise OrbifoldCoverInputError("Input must be a Coxeter-system JSON object")
    source_value = raw.get("sourceSystem", raw)
    try:
        source, matrix = discovery.validate_source(source_value)
    except discovery.InputError as exc:
        raise OrbifoldCoverInputError(str(exc)) from exc
    # Discovery artifacts elsewhere in the repository bind `inputHash` to the
    # exact file bytes. Keep that convention so formatting or provenance edits
    # cannot accidentally reuse an older search checkpoint.
    return source, matrix, hashlib.sha256(source_bytes).hexdigest()


def spherical_catalogue(
    matrix: Sequence[Sequence[int]],
    *,
    max_subsets: int = DEFAULT_MAX_SUBSETS,
    max_spherical_order: int = DEFAULT_MAX_SPHERICAL_ORDER,
) -> tuple[list[discovery.SphericalSubset], dict[str, Any]]:
    bounds = {
        "maxSubsets": max_subsets,
        "maxSphericalOrder": max_spherical_order,
    }
    try:
        maximal = discovery.maximal_spherical_subsets(matrix, bounds)
    except (discovery.InputError, discovery.CatalogueLimit) as exc:
        raise OrbifoldCoverInputError(str(exc)) from exc
    lower_bound = math.lcm(*(entry.expected_order for entry in maximal))
    records = [
        {
            "id": "T:" + ",".join(map(str, entry.subset)),
            "generators": list(entry.subset),
            "type": entry.type_name,
            "order": entry.expected_order,
        }
        for entry in maximal
    ]
    return maximal, {
        "classification": "exact-finite-coxeter-classification",
        "maximalSubgroups": records,
        "maximalSubgroupCount": len(records),
        "lowerBoundDivisor": lower_bound,
    }


def opposite_facet_pairs(matrix: Sequence[Sequence[int]]) -> list[tuple[int, int]]:
    """Return the perfect matching of ultraparallel cube facets.

    The normalized discovery matrix stores ``m = infinity`` as zero.  An
    n-cube has 2n facets, and each facet has exactly one opposite facet.  This
    function deliberately rejects diagrams with any other infinite-pair
    pattern instead of silently treating them as cubes.
    """

    rank = len(matrix)
    if rank % 2:
        raise OrbifoldCoverInputError(
            f"A Coxeter n-cube needs 2n facets; rank {rank} is odd"
        )
    opposite: list[int | None] = [None] * rank
    pairs: list[tuple[int, int]] = []
    for facet in range(rank):
        partners = [
            other
            for other in range(rank)
            if other != facet and matrix[facet][other] == 0
        ]
        if len(partners) != 1:
            raise OrbifoldCoverInputError(
                "The infinity entries do not form a cube opposite-facet "
                f"matching: facet {facet} has {len(partners)} opposite candidates"
            )
        opposite[facet] = partners[0]
    for facet, partner_value in enumerate(opposite):
        assert partner_value is not None
        partner = partner_value
        if opposite[partner] != facet:
            raise OrbifoldCoverInputError(
                f"Opposite-facet relation is not symmetric at {facet}, {partner}"
            )
        if facet < partner:
            pairs.append((facet, partner))
    dimension = rank // 2
    if len(pairs) != dimension:
        raise OrbifoldCoverInputError(
            f"Expected {dimension} opposite pairs, found {len(pairs)}"
        )
    return sorted(pairs)


def _fraction_determinant(matrix: Sequence[Sequence[Fraction]]) -> Fraction:
    size = len(matrix)
    work = [list(row) for row in matrix]
    determinant = Fraction(1)
    for column in range(size):
        pivot = next(
            (row for row in range(column, size) if work[row][column] != 0),
            None,
        )
        if pivot is None:
            return Fraction(0)
        if pivot != column:
            work[column], work[pivot] = work[pivot], work[column]
            determinant = -determinant
        pivot_value = work[column][column]
        determinant *= pivot_value
        for row in range(column + 1, size):
            factor = work[row][column] / pivot_value
            for entry in range(column + 1, size):
                work[row][entry] -= factor * work[column][entry]
    return determinant


def _fraction_rank(matrix: Sequence[Sequence[Fraction]]) -> int:
    if not matrix:
        return 0
    row_count = len(matrix)
    column_count = len(matrix[0])
    work = [list(row) for row in matrix]
    pivot_row = 0
    for column in range(column_count):
        pivot = next(
            (row for row in range(pivot_row, row_count) if work[row][column] != 0),
            None,
        )
        if pivot is None:
            continue
        work[pivot_row], work[pivot] = work[pivot], work[pivot_row]
        pivot_value = work[pivot_row][column]
        work[pivot_row] = [entry / pivot_value for entry in work[pivot_row]]
        for row in range(row_count):
            if row == pivot_row or work[row][column] == 0:
                continue
            factor = work[row][column]
            work[row] = [
                entry - factor * pivot_entry
                for entry, pivot_entry in zip(work[row], work[pivot_row])
            ]
        pivot_row += 1
        if pivot_row == row_count:
            break
    return pivot_row


def _all_principal_minors_nonnegative(
    matrix: Sequence[Sequence[Fraction]],
) -> bool:
    size = len(matrix)
    for subset_size in range(1, size + 1):
        for subset in itertools.combinations(range(size), subset_size):
            principal = [[matrix[row][column] for column in subset] for row in subset]
            if _fraction_determinant(principal) < 0:
                return False
    return True


def _rational_scaled_gram(
    matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> list[list[Fraction]] | None:
    """Return twice the Coxeter Gram matrix when all entries are rational.

    The compact and ideal cube fixtures use only m=2 and m=3 at a vertex.
    Scaling by two gives diagonal 2, commuting entry 0, and m=3 entry -1.
    """

    result: list[list[Fraction]] = []
    for left in subset:
        row: list[Fraction] = []
        for right in subset:
            if left == right:
                row.append(Fraction(2))
            elif matrix[left][right] == 2:
                row.append(Fraction(0))
            elif matrix[left][right] == 3:
                row.append(Fraction(-1))
            else:
                return None
        result.append(row)
    return result


def _sympy_gram_classification(
    matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> tuple[bool, int, str]:
    """Classify a non-rational local Gram matrix with exact algebraic entries."""

    try:
        import sympy  # type: ignore[import-not-found]
    except ImportError as exc:
        raise OrbifoldCoverInputError(
            "An exact affine/hyperideal decision with labels above 3 requires "
            "SymPy or an externally classified local Gram matrix"
        ) from exc
    gram = sympy.Matrix(
        [
            [
                sympy.Integer(1)
                if left == right
                else -sympy.cos(sympy.pi / matrix[left][right])
                for right in subset
            ]
            for left in subset
        ]
    )
    nonnegative = True
    for size in range(1, len(subset) + 1):
        for indices in itertools.combinations(range(len(subset)), size):
            determinant = sympy.simplify(gram.extract(indices, indices).det())
            if determinant.is_negative is True:
                nonnegative = False
                break
            if determinant.is_nonnegative is not True:
                raise OrbifoldCoverInputError(
                    "SymPy could not certify the sign of a local Gram principal minor"
                )
        if not nonnegative:
            break
    return nonnegative, int(gram.rank()), "exact-sympy-algebraic-gram"


def classify_cube_vertex_choice(
    matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> dict[str, Any]:
    """Classify a cube vertex as finite, ideal/affine, or hyperideal.

    Only the finite case supplies a local stabilizer order.  An affine vertex
    has a positive-semidefinite, singular Coxeter Gram matrix; an indefinite
    local Gram matrix is hyperideal.  This distinction prevents an ideal cube
    vertex from being fed to a finite regular-orbit check.
    """

    finite = discovery.classify_spherical_subset(matrix, subset)
    if finite is not None:
        return {
            "localKind": "finite",
            "spherical": True,
            "classificationMethod": "exact-finite-coxeter-classification",
            "sphericalType": finite.type_name,
            "sphericalOrder": finite.expected_order,
        }

    rational_gram = _rational_scaled_gram(matrix, subset)
    if rational_gram is not None:
        nonnegative = _all_principal_minors_nonnegative(rational_gram)
        rank = _fraction_rank(rational_gram)
        method = "exact-rational-coxeter-gram"
    else:
        nonnegative, rank, method = _sympy_gram_classification(matrix, subset)
    if nonnegative and rank < len(subset):
        affine_type = (
            "A~2"
            if len(subset) == 3
            and all(
                matrix[left][right] == 3
                for left, right in itertools.combinations(subset, 2)
            )
            else "affine"
        )
        return {
            "localKind": "ideal-affine",
            "spherical": False,
            "classificationMethod": method,
            "affineType": affine_type,
            "gramRank": rank,
            "finiteOrder": None,
        }
    if nonnegative:
        raise OrbifoldCoverInputError(
            "A positive-definite local Gram matrix was not recognized by the "
            "shared finite Coxeter classifier"
        )
    return {
        "localKind": "hyperideal",
        "spherical": False,
        "classificationMethod": method,
        "gramRank": rank,
        "finiteOrder": None,
    }


def cube_incidence_catalogue(
    matrix: Sequence[Sequence[int]],
    maximal: Sequence[discovery.SphericalSubset],
) -> dict[str, Any]:
    pairs = opposite_facet_pairs(matrix)
    dimension = len(pairs)
    maximal_by_subset = {entry.subset: entry for entry in maximal}
    vertices: list[dict[str, Any]] = []
    kind_counts: Counter[str] = Counter()
    for bits in itertools.product((0, 1), repeat=dimension):
        subset = tuple(sorted(pairs[index][side] for index, side in enumerate(bits)))
        classification = classify_cube_vertex_choice(matrix, subset)
        kind_counts[classification["localKind"]] += 1
        record: dict[str, Any] = {
            "id": "v:" + "".join(map(str, bits)),
            "choiceBits": list(bits),
            "facets": list(subset),
            **classification,
            "maximalSpherical": subset in maximal_by_subset,
        }
        vertices.append(record)
    expected = 1 << dimension
    if len(vertices) != expected:
        raise AssertionError("Cube vertex enumeration is incomplete")
    finite_count = kind_counts["finite"]
    ideal_count = kind_counts["ideal-affine"]
    hyperideal_count = kind_counts["hyperideal"]
    all_spherical = finite_count == expected
    return {
        "detected": True,
        "dimension": dimension,
        "facetCount": len(matrix),
        "oppositeFacetPairs": [list(pair) for pair in pairs],
        "expectedVertexCount": expected,
        "vertexCount": len(vertices),
        "vertices": vertices,
        "sphericalVertexCount": finite_count,
        "finiteVertexCount": finite_count,
        "idealAffineVertexCount": ideal_count,
        "hyperidealVertexCount": hyperideal_count,
        "localKindCounts": {
            "finite": finite_count,
            "ideal-affine": ideal_count,
            "hyperideal": hyperideal_count,
        },
        "allVertexChoicesSpherical": all_spherical,
        "compactVertexConditionPassed": all_spherical,
        "interpretation": (
            "Every cube vertex has a finite local Coxeter group."
            if all_spherical
            else "Ideal/affine and hyperideal rank-n facet choices have no finite "
            "local group order. Only spherical subsets enter regular-orbit "
            "torsion constraints."
        ),
    }


def _refine_vertex_colors(matrix: Sequence[Sequence[int]]) -> tuple[int, ...]:
    """Compute an equitable partition for the edge-labeled complete graph."""

    rank = len(matrix)
    colors = tuple(0 for _ in range(rank))
    while True:
        signatures = []
        for vertex in range(rank):
            counts = Counter(
                (matrix[vertex][other], colors[other])
                for other in range(rank)
                if other != vertex
            )
            signatures.append(
                (
                    colors[vertex],
                    tuple(
                        sorted(
                            (label, color, count)
                            for (label, color), count in counts.items()
                        )
                    ),
                )
            )
        palette = {
            signature: index for index, signature in enumerate(sorted(set(signatures)))
        }
        refined = tuple(palette[signature] for signature in signatures)
        if refined == colors:
            return refined
        colors = refined


def diagram_automorphisms(
    matrix: Sequence[Sequence[int]],
    *,
    max_automorphisms: int = DEFAULT_MAX_AUTOMORPHISMS,
    max_backtrack_nodes: int = DEFAULT_MAX_BACKTRACK_NODES,
) -> AutomorphismSearchResult:
    """Enumerate Coxeter-matrix automorphisms by refined backtracking.

    Static equitable colors cut the search into invariant cells.  At each node
    the next source vertex is chosen by the smallest compatible target set.
    This explores only partial isomorphisms; it never loops over all ``rank!``
    permutations and tests them afterward.
    """

    if max_automorphisms < 1 or max_backtrack_nodes < 1:
        raise OrbifoldCoverInputError("Automorphism search bounds must be positive")
    rank = len(matrix)
    colors = _refine_vertex_colors(matrix)
    color_cells: dict[int, tuple[int, ...]] = {
        color: tuple(index for index, item in enumerate(colors) if item == color)
        for color in sorted(set(colors))
    }
    mapping = [-1] * rank
    used = bytearray(rank)
    results: list[tuple[int, ...]] = []
    nodes_visited = 0
    stopped = False
    stop_reason: str | None = None

    def compatible(source_vertex: int, target_vertex: int) -> bool:
        if used[target_vertex] or colors[source_vertex] != colors[target_vertex]:
            return False
        return all(
            mapped_target < 0
            or matrix[source_vertex][other] == matrix[target_vertex][mapped_target]
            for other, mapped_target in enumerate(mapping)
        )

    def visit(depth: int) -> None:
        nonlocal nodes_visited, stopped, stop_reason
        if stopped:
            return
        nodes_visited += 1
        if nodes_visited > max_backtrack_nodes:
            stopped = True
            stop_reason = "max-backtrack-nodes"
            return
        if depth == rank:
            results.append(tuple(mapping))
            if len(results) >= max_automorphisms:
                stopped = True
                stop_reason = "max-automorphisms"
            return

        best_source = -1
        best_targets: list[int] | None = None
        for source_vertex in range(rank):
            if mapping[source_vertex] >= 0:
                continue
            targets = [
                target
                for target in color_cells[colors[source_vertex]]
                if compatible(source_vertex, target)
            ]
            if not targets:
                return
            if best_targets is None or len(targets) < len(best_targets):
                best_source = source_vertex
                best_targets = targets
                if len(targets) == 1:
                    break
        assert best_targets is not None and best_source >= 0
        for target in best_targets:
            mapping[best_source] = target
            used[target] = 1
            visit(depth + 1)
            used[target] = 0
            mapping[best_source] = -1
            if stopped:
                return

    visit(0)
    unique = tuple(sorted(set(results)))
    if not unique:
        raise AssertionError(
            "Every Coxeter diagram must have the identity automorphism"
        )
    return AutomorphismSearchResult(
        permutations=unique,
        refined_colors=colors,
        nodes_visited=min(nodes_visited, max_backtrack_nodes),
        complete=not stopped,
        stop_reason=stop_reason,
    )


def verify_automorphism(
    matrix: Sequence[Sequence[int]], permutation: Sequence[int]
) -> bool:
    rank = len(matrix)
    return sorted(permutation) == list(range(rank)) and all(
        matrix[left][right] == matrix[permutation[left]][permutation[right]]
        for left in range(rank)
        for right in range(rank)
    )


def compress_cube_vertices(
    cube: dict[str, Any], automorphisms: AutomorphismSearchResult
) -> dict[str, Any]:
    vertex_by_subset = {tuple(vertex["facets"]): vertex for vertex in cube["vertices"]}
    remaining = set(vertex_by_subset)
    orbits: list[dict[str, Any]] = []
    while remaining:
        representative = min(remaining)
        members = {
            tuple(sorted(permutation[facet] for facet in representative))
            for permutation in automorphisms.permutations
        }
        if not members.issubset(vertex_by_subset):
            raise AssertionError(
                "A diagram automorphism failed to preserve cube vertices"
            )
        remaining.difference_update(members)
        representative_record = vertex_by_subset[representative]
        orbits.append(
            {
                "id": f"vertex-orbit:{len(orbits)}",
                "representative": list(representative),
                "representativeVertexId": representative_record["id"],
                "members": [list(member) for member in sorted(members)],
                "size": len(members),
                "spherical": representative_record["spherical"],
                **(
                    {
                        "sphericalType": representative_record["sphericalType"],
                        "sphericalOrder": representative_record["sphericalOrder"],
                    }
                    if representative_record["spherical"]
                    else {}
                ),
            }
        )
    return {
        "exact": automorphisms.complete,
        "orbitCount": len(orbits),
        "orbits": orbits,
        "warning": (
            None
            if automorphisms.complete
            else "Automorphism bounds were reached; these are partial orbits and "
            "must not be used as a complete symmetry reduction."
        ),
    }


def automorphism_record(result: AutomorphismSearchResult) -> dict[str, Any]:
    return {
        "method": "equitable-partition-refined-backtracking",
        "complete": result.complete,
        "groupOrder": len(result.permutations) if result.complete else None,
        "automorphismsFound": len(result.permutations),
        "nodesVisited": result.nodes_visited,
        "stopReason": result.stop_reason,
        "refinedColorClasses": [
            [
                index
                for index, color in enumerate(result.refined_colors)
                if color == value
            ]
            for value in sorted(set(result.refined_colors))
        ],
        "permutations": [list(permutation) for permutation in result.permutations],
    }


def _normalize_action_rows(payload: Any, rank: int) -> tuple[list[list[int]], int]:
    if not isinstance(payload, dict):
        raise OrbifoldCoverInputError("Action JSON must be an object")
    if isinstance(payload.get("finiteAction"), dict):
        payload = payload["finiteAction"]
    rows: Any = payload.get("generatorImages")
    if rows is None:
        rows = payload.get("actions")
        if isinstance(rows, dict):
            try:
                rows = [
                    rows[str(index)] if str(index) in rows else rows[index]
                    for index in range(rank)
                ]
            except (KeyError, TypeError) as exc:
                raise OrbifoldCoverInputError(
                    "Action rows must contain every zero-based generator index"
                ) from exc
    if rows is None:
        rows = payload.get("generatorActions")
        if isinstance(rows, list) and rows and isinstance(rows[0], dict):
            by_generator = {int(row["generator"]): row.get("images") for row in rows}
            rows = [by_generator.get(index) for index in range(rank)]
    if not isinstance(rows, list) or len(rows) != rank:
        raise OrbifoldCoverInputError(
            f"Action must provide {rank} generator permutation rows"
        )
    if any(not isinstance(row, list) for row in rows):
        raise OrbifoldCoverInputError("Every generator action row must be a list")
    degree = len(rows[0])
    if degree < 1 or any(len(row) != degree for row in rows):
        raise OrbifoldCoverInputError("Generator action rows have inconsistent degrees")
    declared_degree = payload.get("degree")
    if declared_degree is not None and declared_degree != degree:
        raise OrbifoldCoverInputError(
            f"Action declares degree {declared_degree}, but its rows have degree {degree}"
        )

    point_ids: list[str] | None = None
    vertices = payload.get("vertices")
    if isinstance(vertices, list) and len(vertices) == degree:
        ids = [
            vertex.get("id") if isinstance(vertex, dict) else None
            for vertex in vertices
        ]
        if all(isinstance(point_id, str) for point_id in ids):
            point_ids = [str(point_id) for point_id in ids]
    point_index = {point_id: index for index, point_id in enumerate(point_ids or [])}

    normalized: list[list[int]] = []
    for generator, row in enumerate(rows):
        normalized_row: list[int] = []
        for image in row:
            if isinstance(image, bool):
                raise OrbifoldCoverInputError(
                    "Boolean values are not permutation points"
                )
            if isinstance(image, int):
                normalized_row.append(image)
            elif isinstance(image, str) and image in point_index:
                normalized_row.append(point_index[image])
            elif (
                isinstance(image, str) and image.startswith("q") and image[1:].isdigit()
            ):
                normalized_row.append(int(image[1:]))
            else:
                raise OrbifoldCoverInputError(
                    f"Generator {generator} contains unknown point label {image!r}"
                )
        normalized.append(normalized_row)
    return normalized, degree


def _apply_word(rows: Sequence[Sequence[int]], word: Iterable[int], point: int) -> int:
    for generator in word:
        point = rows[generator][point]
    return point


def _relation_checks(
    matrix: Sequence[Sequence[int]], rows: Sequence[Sequence[int]], degree: int
) -> list[dict[str, Any]]:
    expected = list(range(degree))
    checks: list[dict[str, Any]] = []
    for generator, row in enumerate(rows):
        permutation = sorted(row) == expected
        involution = permutation and all(row[row[point]] == point for point in expected)
        checks.append(
            {
                "kind": "involution",
                "generators": [generator],
                "passed": involution,
            }
        )
    if not all(check["passed"] for check in checks):
        return checks
    for left, right in itertools.combinations(range(len(matrix)), 2):
        exponent = matrix[left][right]
        if exponent == 0:
            continue
        word = tuple(
            itertools.chain.from_iterable((left, right) for _ in range(exponent))
        )
        passed = all(_apply_word(rows, word, point) == point for point in expected)
        checks.append(
            {
                "kind": "coxeter-relation",
                "generators": [left, right],
                "exponent": exponent,
                "passed": passed,
            }
        )
    return checks


def _is_transitive(rows: Sequence[Sequence[int]], degree: int) -> tuple[bool, int]:
    seen = bytearray(degree)
    queue: deque[int] = deque([0])
    seen[0] = 1
    count = 1
    while queue:
        point = queue.popleft()
        for row in rows:
            target = row[point]
            if not seen[target]:
                seen[target] = 1
                count += 1
                queue.append(target)
    return count == degree, count


def _subgroup_orbit_check(
    rows: Sequence[Sequence[int]],
    degree: int,
    subgroup: discovery.SphericalSubset,
) -> dict[str, Any]:
    seen = bytearray(degree)
    distribution: Counter[int] = Counter()
    first_bad_orbit: list[int] | None = None
    for root in range(degree):
        if seen[root]:
            continue
        seen[root] = 1
        orbit = [root]
        cursor = 0
        while cursor < len(orbit):
            point = orbit[cursor]
            cursor += 1
            for generator in subgroup.subset:
                target = rows[generator][point]
                if not seen[target]:
                    seen[target] = 1
                    orbit.append(target)
        distribution[len(orbit)] += 1
        if len(orbit) != subgroup.expected_order and first_bad_orbit is None:
            first_bad_orbit = orbit[: min(16, len(orbit))]
    passed = set(distribution) == {subgroup.expected_order}
    return {
        "id": "T:" + ",".join(map(str, subgroup.subset)),
        "generators": list(subgroup.subset),
        "type": subgroup.type_name,
        "order": subgroup.expected_order,
        "orbitSizeDistribution": {
            str(size): count for size, count in sorted(distribution.items())
        },
        "expectedOrbitCount": degree // subgroup.expected_order,
        "passed": passed,
        "firstBadOrbitSample": first_bad_orbit,
    }


def validate_action_candidate(
    payload: Any,
    matrix: Sequence[Sequence[int]],
    maximal: Sequence[discovery.SphericalSubset],
    cube: dict[str, Any],
    lower_bound_divisor: int,
) -> dict[str, Any]:
    rows, degree = _normalize_action_rows(payload, len(matrix))
    errors: list[str] = []
    relation_checks = _relation_checks(matrix, rows, degree)
    if not all(check["passed"] for check in relation_checks):
        errors.append("At least one generator permutation or Coxeter relation failed")
    transitive, reached = _is_transitive(rows, degree) if not errors else (False, 0)
    if not transitive:
        errors.append(
            f"The supplied action is not transitive from point 0 ({reached}/{degree})"
        )
    divisible = degree % lower_bound_divisor == 0
    if not divisible:
        errors.append(
            f"Action degree {degree} is not divisible by {lower_bound_divisor}"
        )

    spherical_checks: list[dict[str, Any]] = []
    if not errors:
        spherical_checks = [
            _subgroup_orbit_check(rows, degree, subgroup) for subgroup in maximal
        ]
        failed = [check["id"] for check in spherical_checks if not check["passed"]]
        if failed:
            errors.append(
                "Maximal spherical subgroups fail the free-orbit test: "
                + ", ".join(failed)
            )

    spherical_by_subset = {entry.subset: entry for entry in maximal}
    check_by_subset = {tuple(check["generators"]): check for check in spherical_checks}
    vertex_checks = []
    for vertex in cube["vertices"]:
        subset = tuple(vertex["facets"])
        subgroup = spherical_by_subset.get(subset)
        if subgroup is None:
            vertex_checks.append(
                {
                    "vertexId": vertex["id"],
                    "facets": list(subset),
                    "applicable": False,
                    "reason": "rank-n vertex group is not spherical",
                }
            )
            continue
        check = check_by_subset.get(subgroup.subset)
        vertex_checks.append(
            {
                "vertexId": vertex["id"],
                "facets": list(subset),
                "applicable": True,
                "sphericalType": subgroup.type_name,
                "sphericalOrder": subgroup.expected_order,
                "evaluated": check is not None,
                "passed": check["passed"] if check is not None else False,
                **(
                    {}
                    if check is not None
                    else {"reason": "global action checks failed before local freeness"}
                ),
            }
        )

    passed = not errors
    return {
        "status": "passed" if passed else "rejected",
        "validationComplete": True,
        "degree": degree,
        "actionHash": sha256_json({"generatorImages": rows}),
        "transitive": transitive,
        "reachablePointCount": reached,
        "lowerBoundDivisor": lower_bound_divisor,
        "degreeDivisibleByLowerBound": divisible,
        "coxeterRelationChecks": relation_checks,
        "maximalSphericalOrbitChecks": spherical_checks,
        "cubeVertexLocalChecks": vertex_checks,
        "torsionFreePointStabilizerCertified": passed,
        "criterion": "tits-maximal-spherical-free-orbits",
        "errors": errors,
    }


def all_spherical_subsets(
    matrix: Sequence[Sequence[int]], *, max_subsets: int = DEFAULT_MAX_SUBSETS
) -> list[discovery.SphericalSubset]:
    """Enumerate every finite special subgroup used for early search pruning."""

    rank = len(matrix)
    subset_count = (1 << rank) - 1
    if subset_count > max_subsets:
        raise OrbifoldCoverInputError(
            f"Complete spherical pruning needs {subset_count} subsets, above "
            f"maxSubsets={max_subsets}"
        )
    result = []
    for size in range(1, rank + 1):
        for subset in itertools.combinations(range(rank), size):
            classified = discovery.classify_spherical_subset(matrix, subset)
            if classified is not None:
                result.append(classified)
    return sorted(result, key=lambda item: (len(item.subset), item.subset))


def _perm_identity(degree: int) -> Permutation:
    return tuple(range(degree))


def _perm_compose(left: Permutation, right: Permutation) -> Permutation:
    """Compose permutations in action order: apply ``left``, then ``right``."""

    return tuple(right[left[point]] for point in range(len(left)))


def _perm_inverse(permutation: Permutation) -> Permutation:
    inverse = [0] * len(permutation)
    for point, image in enumerate(permutation):
        inverse[image] = point
    return tuple(inverse)


def _perm_conjugate(permutation: Permutation, by: Permutation) -> Permutation:
    return _perm_compose(
        _perm_compose(_perm_inverse(by), permutation),
        by,
    )


def _generated_permutation_group(
    generators: Iterable[Permutation],
    degree: int,
    *,
    order_cap: int | None = None,
) -> tuple[frozenset[Permutation], bool]:
    generator_list = tuple(sorted(set(generators)))
    identity = _perm_identity(degree)
    elements = {identity}
    queue: deque[Permutation] = deque([identity])
    while queue:
        current = queue.popleft()
        for generator in generator_list:
            image = _perm_compose(current, generator)
            if image in elements:
                continue
            elements.add(image)
            if order_cap is not None and len(elements) > order_cap:
                return frozenset(elements), True
            queue.append(image)
    return frozenset(elements), False


def _target_permutation_data(degree: int) -> dict[str, Any]:
    permutations = tuple(itertools.permutations(range(degree)))
    index_by_permutation = {
        permutation: index for index, permutation in enumerate(permutations)
    }
    identity = _perm_identity(degree)
    involution_indices = tuple(
        index
        for index, permutation in enumerate(permutations)
        if permutation != identity
        and _perm_compose(permutation, permutation) == identity
    )
    return {
        "degree": degree,
        "permutations": permutations,
        "indexByPermutation": index_by_permutation,
        "identity": identity,
        "involutionIndices": involution_indices,
    }


def _centralizer_candidate_representatives(
    assignment: Sequence[int], target: dict[str, Any]
) -> list[int]:
    permutations: tuple[Permutation, ...] = target["permutations"]
    index_by_permutation: dict[Permutation, int] = target["indexByPermutation"]
    assigned = [permutations[index] for index in assignment if index >= 0]
    centralizer = [
        conjugator
        for conjugator in permutations
        if all(
            _perm_conjugate(permutation, conjugator) == permutation
            for permutation in assigned
        )
    ]
    remaining = set(target["involutionIndices"])
    representatives = []
    while remaining:
        representative = min(remaining)
        orbit = {
            index_by_permutation[
                _perm_conjugate(permutations[representative], conjugator)
            ]
            for conjugator in centralizer
        }
        representatives.append(min(orbit))
        remaining.difference_update(orbit)
    return representatives


def _permutation_power_is_identity(
    left: Permutation, right: Permutation, exponent: int
) -> bool:
    product = _perm_compose(left, right)
    power = _perm_identity(len(left))
    for _ in range(exponent):
        power = _perm_compose(power, product)
    return power == _perm_identity(len(left))


def _partial_target_assignment_valid(
    assignment: Sequence[int],
    new_generator: int,
    matrix: Sequence[Sequence[int]],
    spherical: Sequence[discovery.SphericalSubset],
    target: dict[str, Any],
) -> bool:
    permutations: tuple[Permutation, ...] = target["permutations"]
    new_image = permutations[assignment[new_generator]]
    for other, image_index in enumerate(assignment):
        if other == new_generator or image_index < 0:
            continue
        exponent = matrix[new_generator][other]
        if exponent != 0 and not _permutation_power_is_identity(
            new_image, permutations[image_index], exponent
        ):
            return False

    assigned_set = {index for index, image in enumerate(assignment) if image >= 0}
    for subgroup in spherical:
        if new_generator not in subgroup.subset or not set(subgroup.subset).issubset(
            assigned_set
        ):
            continue
        image_group, exceeded = _generated_permutation_group(
            (permutations[assignment[index]] for index in subgroup.subset),
            target["degree"],
            order_cap=subgroup.expected_order,
        )
        if exceeded or len(image_group) != subgroup.expected_order:
            return False
    return True


def _assignment_variable_order(
    rank: int,
    spherical: Sequence[discovery.SphericalSubset],
    automorphisms: AutomorphismSearchResult,
    vertex_orbits: dict[str, Any],
) -> list[int]:
    color_sizes = Counter(automorphisms.refined_colors)
    representative_incidence = Counter(
        facet
        for orbit in vertex_orbits["orbits"]
        for facet in orbit["representative"]
        if orbit["spherical"]
    )
    spherical_incidence = Counter(
        generator for subgroup in spherical for generator in subgroup.subset
    )
    return sorted(
        range(rank),
        key=lambda generator: (
            -representative_incidence[generator],
            -spherical_incidence[generator],
            color_sizes[automorphisms.refined_colors[generator]],
            generator,
        ),
    )


def _canonical_assignment_key(
    assignment: Sequence[int], automorphisms: AutomorphismSearchResult
) -> tuple[int, ...]:
    keys = []
    for permutation in automorphisms.permutations:
        transformed = [-1] * len(assignment)
        for source, target in enumerate(permutation):
            transformed[target] = assignment[source]
        keys.append(tuple(transformed))
    return min(keys)


def _enumerate_subgroups(
    group: frozenset[Permutation],
    target_degree: int,
    *,
    max_subgroups: int,
) -> tuple[list[frozenset[Permutation]], bool]:
    identity = _perm_identity(target_degree)
    ordered_group = tuple(sorted(group))
    trivial = frozenset({identity})
    subgroups = [trivial]
    seen = {trivial}
    cursor = 0
    while cursor < len(subgroups):
        subgroup = subgroups[cursor]
        cursor += 1
        for element in ordered_group:
            if element in subgroup:
                continue
            generated, exceeded = _generated_permutation_group(
                (*subgroup, element), target_degree, order_cap=len(group)
            )
            if exceeded:
                raise AssertionError("A generated subgroup escaped its finite group")
            if not generated.issubset(group):
                raise AssertionError("Subgroup enumeration left the target image")
            if generated in seen:
                continue
            if len(subgroups) >= max_subgroups:
                return subgroups, False
            seen.add(generated)
            subgroups.append(generated)
    return sorted(subgroups, key=lambda item: (len(item), sorted(item))), True


def _subgroup_is_normal(
    group: frozenset[Permutation], subgroup: frozenset[Permutation]
) -> bool:
    return all(
        _perm_conjugate(element, conjugator) in subgroup
        for conjugator in group
        for element in subgroup
    )


def _coset_action_rows(
    group: frozenset[Permutation],
    subgroup: frozenset[Permutation],
    generator_images: Sequence[Permutation],
) -> list[list[int]]:
    remaining = set(group)
    cosets: list[frozenset[Permutation]] = []
    representatives: list[Permutation] = []
    while remaining:
        representative = min(remaining)
        coset = frozenset(
            _perm_compose(element, representative) for element in subgroup
        )
        cosets.append(coset)
        representatives.append(representative)
        remaining.difference_update(coset)
    point_by_element = {
        element: point for point, coset in enumerate(cosets) for element in coset
    }
    return [
        [
            point_by_element[_perm_compose(representative, generator)]
            for representative in representatives
        ]
        for generator in generator_images
    ]


def _canonicalize_transitive_action_rows(
    rows: Sequence[Sequence[int]],
) -> list[list[int]]:
    """Choose a deterministic point labeling for a generator-labeled action."""

    degree = len(rows[0])
    best_key: tuple[int, ...] | None = None
    best_rows: list[list[int]] | None = None
    for root in range(degree):
        order = [root]
        new_index = {root: 0}
        cursor = 0
        while cursor < len(order):
            point = order[cursor]
            cursor += 1
            for row in rows:
                image = row[point]
                if image not in new_index:
                    new_index[image] = len(order)
                    order.append(image)
        if len(order) != degree:
            raise OrbifoldCoverInputError(
                "Cannot canonicalize a nontransitive coset action"
            )
        relabeled = [[new_index[row[old_point]] for old_point in order] for row in rows]
        key = tuple(image for row in relabeled for image in row)
        if best_key is None or key < best_key:
            best_key = key
            best_rows = relabeled
    assert best_rows is not None
    return best_rows


def cover_actions_from_target_assignment(
    assignment: Sequence[Permutation],
    matrix: Sequence[Sequence[int]],
    maximal: Sequence[discovery.SphericalSubset],
    cube: dict[str, Any],
    lower_bound_divisor: int,
    *,
    max_degree: int,
    max_target_group_order: int,
    max_subgroups: int,
) -> dict[str, Any]:
    target_degree = len(assignment[0])
    group, exceeded = _generated_permutation_group(
        assignment,
        target_degree,
        order_cap=max_target_group_order,
    )
    if exceeded:
        return {
            "complete": True,
            "excluded": True,
            "reason": "generated image exceeds maxTargetGroupOrder",
            "targetGroupOrderLowerBound": len(group),
            "subgroupsEnumerated": 0,
            "candidates": [],
        }
    subgroups, subgroups_complete = _enumerate_subgroups(
        group,
        target_degree,
        max_subgroups=max_subgroups,
    )
    candidates: list[dict[str, Any]] = []
    actions_checked = 0
    for subgroup in subgroups:
        if len(group) % len(subgroup):
            raise AssertionError("Subgroup order does not divide target group order")
        degree = len(group) // len(subgroup)
        if degree > max_degree or degree % lower_bound_divisor:
            continue
        rows = _canonicalize_transitive_action_rows(
            _coset_action_rows(group, subgroup, assignment)
        )
        validation = validate_action_candidate(
            {"degree": degree, "generatorImages": rows},
            matrix,
            maximal,
            cube,
            lower_bound_divisor,
        )
        actions_checked += 1
        if validation["status"] != "passed":
            continue
        normal = _subgroup_is_normal(group, subgroup)
        action_hash = validation["actionHash"]
        candidates.append(
            {
                "id": f"direct-coset:{action_hash[:16]}",
                "kind": "direct-transitive-coset-action",
                "status": "passed",
                "complete": True,
                "degree": degree,
                "targetPermutationDegree": target_degree,
                "targetGroupOrder": len(group),
                "pointStabilizerOrder": len(subgroup),
                "pointStabilizerNormal": normal,
                "nonnormalCover": not normal,
                "actionHash": action_hash,
                "generatorImages": rows,
                "validation": validation,
            }
        )
    unique = {candidate["actionHash"]: candidate for candidate in candidates}
    return {
        "complete": subgroups_complete,
        "excluded": False,
        "targetGroupOrder": len(group),
        "subgroupsEnumerated": len(subgroups),
        "subgroupEnumerationComplete": subgroups_complete,
        "cosetActionsChecked": actions_checked,
        "candidates": sorted(
            unique.values(),
            key=lambda item: (
                item["degree"],
                item["pointStabilizerNormal"],
                item["actionHash"],
            ),
        ),
    }


def _direct_scope_hash(
    input_hash: str,
    seed_hash: str,
    bounds: dict[str, int],
) -> str:
    mathematical_bounds = {
        key: bounds[key]
        for key in (
            "maxTargetDegree",
            "maxDegree",
            "maxTargetGroupOrder",
            "maxSubgroups",
            "maxCandidates",
        )
    }
    return sha256_json(
        {
            "inputHash": input_hash,
            "seedHash": seed_hash,
            "bounds": mathematical_bounds,
            "engineVersion": ENGINE_VERSION,
        }
    )


def _write_checkpoint(path: Path, checkpoint: dict[str, Any]) -> None:
    write_artifact(path, with_artifact_hash(checkpoint))


def direct_bounded_cover_search(
    matrix: Sequence[Sequence[int]],
    maximal: Sequence[discovery.SphericalSubset],
    cube: dict[str, Any],
    automorphisms: AutomorphismSearchResult,
    vertex_orbits: dict[str, Any],
    *,
    input_hash: str,
    seed_hash: str,
    max_degree: int,
    max_target_degree: int,
    max_search_nodes: int,
    max_target_group_order: int,
    max_subgroups: int,
    max_candidates: int,
    max_subsets: int,
    checkpoint_path: Path | None = None,
    resume: bool = False,
    checkpoint_every: int = DEFAULT_CHECKPOINT_EVERY,
) -> dict[str, Any]:
    """Exhaust a bounded family of small symmetric targets and their subgroups.

    Completeness applies only to homomorphisms into ``S_k`` for the recorded
    target degrees, generated image-order cap, subgroup cap, and cover-degree
    cap.  It is never a nonexistence statement for Coxeter covers in general.
    """

    for value, name in (
        (max_degree, "maxDegree"),
        (max_target_degree, "maxTargetDegree"),
        (max_search_nodes, "maxSearchNodes"),
        (max_target_group_order, "maxTargetGroupOrder"),
        (max_subgroups, "maxSubgroups"),
        (max_candidates, "maxCandidates"),
        (checkpoint_every, "checkpointEvery"),
    ):
        if value < 1:
            raise OrbifoldCoverInputError(f"{name} must be positive")
    if max_target_degree > MAX_IN_PROCESS_TARGET_DEGREE:
        raise OrbifoldCoverInputError(
            f"The in-process engine is capped at S_{MAX_IN_PROCESS_TARGET_DEGREE}; "
            "use the external-engine handoff for larger symmetric targets"
        )
    lower_bound = math.lcm(*(item.expected_order for item in maximal))
    spherical = all_spherical_subsets(matrix, max_subsets=max_subsets)
    variable_order = _assignment_variable_order(
        len(matrix), spherical, automorphisms, vertex_orbits
    )
    bounds = {
        "maxTargetDegree": max_target_degree,
        "maxDegree": max_degree,
        "maxSearchNodes": max_search_nodes,
        "maxTargetGroupOrder": max_target_group_order,
        "maxSubgroups": max_subgroups,
        "maxCandidates": max_candidates,
        "checkpointEvery": checkpoint_every,
    }
    scope_hash = _direct_scope_hash(input_hash, seed_hash, bounds)
    target_scope = []
    eligible_targets = []
    maximal_orders = sorted({item.expected_order for item in maximal})
    for target_degree in range(2, max_target_degree + 1):
        symmetric_order = math.factorial(target_degree)
        capable = all(symmetric_order % order == 0 for order in maximal_orders)
        target_scope.append(
            {
                "target": f"S_{target_degree}",
                "targetPermutationDegree": target_degree,
                "symmetricGroupOrder": symmetric_order,
                "locallyCapableByLagrange": capable,
                "status": "pending" if capable else "excluded-exactly",
                "reason": (
                    "all maximal spherical orders divide |S_k|"
                    if capable
                    else "a maximal spherical subgroup order does not divide |S_k|"
                ),
            }
        )
        if capable:
            eligible_targets.append(target_degree)

    frontier: list[dict[str, Any]] = [
        {
            "targetDegree": target_degree,
            "assignment": [-1] * len(matrix),
            "depth": 0,
        }
        for target_degree in reversed(eligible_targets)
    ]
    candidates: list[dict[str, Any]] = []
    seen_assignment_keys: set[str] = set()
    nodes_total = 0
    subgroup_checks_total = 0
    checkpoint_loaded = False
    if resume:
        if checkpoint_path is None or not checkpoint_path.exists():
            raise OrbifoldCoverInputError("--resume requires an existing --checkpoint")
        checkpoint = read_json(checkpoint_path)
        if not isinstance(checkpoint, dict):
            raise OrbifoldCoverInputError("Direct-search checkpoint is not an object")
        supplied_hash = checkpoint.get("artifactHash")
        expected_hash = sha256_json(
            {key: value for key, value in checkpoint.items() if key != "artifactHash"}
        )
        if supplied_hash != expected_hash:
            raise OrbifoldCoverInputError(
                "Direct-search checkpoint failed its artifact-hash replay"
            )
        if checkpoint.get("scopeHash") != scope_hash:
            raise OrbifoldCoverInputError(
                "Checkpoint does not match this source, seed, or direct-search scope"
            )
        frontier = list(checkpoint.get("frontier", []))
        candidates = list(checkpoint.get("candidates", []))
        seen_assignment_keys = set(checkpoint.get("seenAssignmentKeys", []))
        nodes_total = int(checkpoint.get("nodesVisitedTotal", 0))
        subgroup_checks_total = int(checkpoint.get("subgroupChecksTotal", 0))
        checkpoint_loaded = True

    target_cache = {
        target_degree: _target_permutation_data(target_degree)
        for target_degree in eligible_targets
    }
    nodes_this_run = 0
    stop_reason: str | None = None
    incomplete_targets: set[int] = set()

    def checkpoint_payload() -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "artifactType": "coxeter-direct-cover-search-checkpoint",
            "track": TRACK,
            "scopeHash": scope_hash,
            "inputHash": input_hash,
            "frontier": frontier,
            "candidates": candidates,
            "seenAssignmentKeys": sorted(seen_assignment_keys),
            "nodesVisitedTotal": nodes_total,
            "subgroupChecksTotal": subgroup_checks_total,
            "complete": not frontier and stop_reason is None,
            "stopReason": stop_reason,
        }

    while frontier and nodes_this_run < max_search_nodes:
        state = frontier.pop()
        target_degree = int(state["targetDegree"])
        assignment = [int(value) for value in state["assignment"]]
        depth = int(state["depth"])
        target = target_cache[target_degree]
        nodes_this_run += 1
        nodes_total += 1

        if depth == len(variable_order):
            canonical = _canonical_assignment_key(assignment, automorphisms)
            assignment_key = f"S{target_degree}:" + ",".join(map(str, canonical))
            if assignment_key in seen_assignment_keys:
                continue
            seen_assignment_keys.add(assignment_key)
            images = [target["permutations"][index] for index in assignment]
            result = cover_actions_from_target_assignment(
                images,
                matrix,
                maximal,
                cube,
                lower_bound,
                max_degree=max_degree,
                max_target_group_order=max_target_group_order,
                max_subgroups=max_subgroups,
            )
            subgroup_checks_total += result["subgroupsEnumerated"]
            if not result["complete"]:
                stop_reason = "max-subgroups"
                incomplete_targets.add(target_degree)
                break
            for candidate in result["candidates"]:
                candidate["targetGeneratorImages"] = [list(image) for image in images]
                if all(
                    existing["actionHash"] != candidate["actionHash"]
                    for existing in candidates
                ):
                    candidates.append(candidate)
            candidates.sort(
                key=lambda item: (
                    item["degree"],
                    item["pointStabilizerNormal"],
                    item["actionHash"],
                )
            )
            if len(candidates) >= max_candidates:
                candidates = candidates[:max_candidates]
                stop_reason = "max-candidates"
                incomplete_targets.add(target_degree)
                break
        else:
            generator = variable_order[depth]
            representatives = _centralizer_candidate_representatives(assignment, target)
            children = []
            for image_index in representatives:
                child = list(assignment)
                child[generator] = image_index
                if _partial_target_assignment_valid(
                    child,
                    generator,
                    matrix,
                    spherical,
                    target,
                ):
                    children.append(
                        {
                            "targetDegree": target_degree,
                            "assignment": child,
                            "depth": depth + 1,
                        }
                    )
            frontier.extend(reversed(children))

        if checkpoint_path is not None and nodes_this_run % checkpoint_every == 0:
            _write_checkpoint(checkpoint_path, checkpoint_payload())

    if frontier and stop_reason is None:
        stop_reason = "max-search-nodes"
    scope_complete = not frontier and stop_reason is None
    remaining_targets = Counter(int(state["targetDegree"]) for state in frontier)
    for record in target_scope:
        if record["status"] == "excluded-exactly":
            record["complete"] = True
            continue
        target_degree = record["targetPermutationDegree"]
        target_incomplete = target_degree in incomplete_targets
        record["status"] = (
            "exhausted-bounded-scope"
            if not target_incomplete
            and (scope_complete or remaining_targets[target_degree] == 0)
            else "incomplete-frontier"
        )
        record["complete"] = not target_incomplete and (
            scope_complete or remaining_targets[target_degree] == 0
        )
        record["remainingFrontierStates"] = remaining_targets[target_degree]

    if checkpoint_path is not None:
        _write_checkpoint(checkpoint_path, checkpoint_payload())
    return {
        "engine": "in-process-finite-target-coset-search",
        "scopeHash": scope_hash,
        "scopeComplete": scope_complete,
        "globalNonexistenceClaim": False,
        "scopeStatement": (
            f"Assignments into S_k for 2 <= k <= {max_target_degree}, generated "
            f"image order <= {max_target_group_order}, at most {max_subgroups} "
            f"subgroups per image, and cover degree <= {max_degree}."
        ),
        "bounds": bounds,
        "targetScope": target_scope,
        "variableOrder": variable_order,
        "sphericalEarlyConstraintCount": len(spherical),
        "diagramSymmetry": {
            "automorphismsComplete": automorphisms.complete,
            "automorphismsUsed": len(automorphisms.permutations),
            "use": (
                "orders high-incidence generators and deduplicates complete "
                "assignments; no local constraint is omitted during certification"
            ),
        },
        "nodesVisitedThisRun": nodes_this_run,
        "nodesVisitedTotal": nodes_total,
        "subgroupChecksTotal": subgroup_checks_total,
        "frontierSize": len(frontier),
        "stopReason": stop_reason,
        "checkpoint": {
            "enabled": checkpoint_path is not None,
            "loaded": checkpoint_loaded,
            "resumable": (
                bool(frontier)
                and checkpoint_path is not None
                and stop_reason == "max-search-nodes"
            ),
            "path": str(checkpoint_path) if checkpoint_path is not None else None,
        },
        "candidateCount": len(candidates),
        "candidates": candidates,
        "boundedOutcome": (
            "candidate-found"
            if candidates
            else "no-candidate-in-declared-bounded-scope"
            if scope_complete
            else "incomplete"
        ),
    }


def external_engine_handoff(
    seed: dict[str, Any],
    *,
    input_hash: str,
    lower_bound: int,
    max_degree: int,
    engine: str,
) -> dict[str, Any]:
    if engine not in {"auto", "gap", "sage"}:
        raise OrbifoldCoverInputError("externalEngine must be auto, gap, or sage")
    degrees = list(range(lower_bound, max_degree + 1, lower_bound))
    request = {
        "schemaVersion": 1,
        "artifactType": "coxeter-external-orbifold-cover-search-request",
        "track": TRACK,
        "requestedEngine": engine,
        "sourceInputHash": input_hash,
        "searchSeedHash": sha256_json(seed),
        "coverModel": "transitive-coset-action-nonnormal-allowed",
        "admissibleDegrees": degrees,
        "constraints": seed,
        "requiredCompletenessDeclaration": {
            "targetFamilies": "explicit list required",
            "degrees": "explicit finite interval or list required",
            "subgroupClasses": "state whether complete up to conjugacy",
            "timeoutsAndCaps": "must be reported",
        },
    }
    return {
        "status": "not-executed",
        "complete": False,
        "failClosed": True,
        "requestHash": sha256_json(request),
        "request": request,
        "acceptanceContract": {
            "sourceInputHash": input_hash,
            "searchSeedHash": request["searchSeedHash"],
            "requiredOutput": [
                "zero-based generator permutation rows",
                "transitivity evidence",
                "declared target/subgroup search scope",
                "complete, incomplete, or interrupted status",
                "tool and version metadata",
            ],
            "independentAcceptance": (
                "Every returned action is rechecked in-process for Coxeter "
                "relations and regular maximal-spherical orbits."
            ),
        },
        "warning": (
            "No external engine was executed. This handoff is a request, not "
            "evidence that a cover exists or that the bounded scope was searched."
        ),
    }


def admissible_degree_plan(
    lower_bound: int, max_degree: int, max_candidate_degrees: int
) -> tuple[list[dict[str, Any]], bool]:
    if max_degree < 1 or max_candidate_degrees < 1:
        raise OrbifoldCoverInputError("Degree bounds must be positive")
    available_count = max_degree // lower_bound
    count = min(available_count, max_candidate_degrees)
    candidates = [
        {
            "degree": lower_bound * multiplier,
            "admissibleBySphericalDivisibility": True,
            "status": "unsearched",
            "complete": False,
            "reason": (
                "Necessary local divisibility passed. Generator permutations "
                "must still be constructed and checked."
            ),
        }
        for multiplier in range(1, count + 1)
    ]
    return candidates, count == available_count


def _constraint_seed(
    source: dict[str, Any],
    matrix: Sequence[Sequence[int]],
    input_hash: str,
    catalogue: dict[str, Any],
    cube: dict[str, Any],
    automorphisms: AutomorphismSearchResult,
    vertex_orbits: dict[str, Any],
    candidate_degrees: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    generators = source.get("generators", [])
    return {
        "schemaVersion": 1,
        "format": SEED_FORMAT,
        "sourceInputHash": input_hash,
        "rank": len(matrix),
        "generators": [
            {
                "index": index,
                "id": generator.get("id", f"s{index}"),
                "label": generator.get("label", f"s{index}"),
            }
            for index, generator in enumerate(generators)
        ],
        "coxeterMatrix": [list(row) for row in matrix],
        "infinityEncoding": 0,
        "oppositeFacetPairs": cube["oppositeFacetPairs"],
        "cubeVertices": [
            {
                "id": vertex["id"],
                "facets": vertex["facets"],
                "spherical": vertex["spherical"],
                "localKind": vertex["localKind"],
                "classificationMethod": vertex["classificationMethod"],
                **(
                    {
                        "sphericalType": vertex["sphericalType"],
                        "sphericalOrder": vertex["sphericalOrder"],
                    }
                    if vertex["spherical"]
                    else {
                        **(
                            {"affineType": vertex["affineType"]}
                            if vertex["localKind"] == "ideal-affine"
                            else {}
                        ),
                        "finiteOrder": None,
                    }
                ),
            }
            for vertex in cube["vertices"]
        ],
        "maximalSphericalSubgroups": catalogue["maximalSubgroups"],
        "lowerBoundDivisor": catalogue["lowerBoundDivisor"],
        "diagramAutomorphisms": [
            list(permutation) for permutation in automorphisms.permutations
        ],
        "diagramAutomorphismsComplete": automorphisms.complete,
        "symmetryReducedVertexConstraints": vertex_orbits["orbits"],
        "symmetryReductionExact": vertex_orbits["exact"],
        "admissibleDegrees": [candidate["degree"] for candidate in candidate_degrees],
        "requiredActionFormat": {
            "indexing": "zero-based",
            "shape": "generatorImages[generator][point] = imagePoint",
            "requirements": [
                "one permutation row per Coxeter generator",
                "transitive action",
                "each generator is an involution",
                "every finite Coxeter relation holds",
                "every maximal spherical subgroup has only regular orbits",
            ],
        },
        "searchSemantics": {
            "coverModel": "transitive-point-stabilizer-nonnormal-allowed",
            "localConstraintsAreNecessaryAndCertifyingForASuppliedAction": True,
            "incidenceConstructsAnAction": False,
            "finalValidationUsesEveryMaximalSphericalSubgroup": True,
            "vertexOrbitCompressionIsSearchSymmetryNotAValidationShortcut": True,
            "note": (
                "The seed constrains a finite permutation search. It does not "
                "claim that cube incidence determines generator permutations."
            ),
        },
    }


def build_search_artifact(
    input_path: Path,
    *,
    action_path: Path | None = None,
    dry_run: bool = False,
    search_mode: str = DEFAULT_SEARCH_MODE,
    max_degree: int = DEFAULT_MAX_DEGREE,
    max_candidate_degrees: int = DEFAULT_MAX_CANDIDATE_DEGREES,
    max_automorphisms: int = DEFAULT_MAX_AUTOMORPHISMS,
    max_backtrack_nodes: int = DEFAULT_MAX_BACKTRACK_NODES,
    max_subsets: int = DEFAULT_MAX_SUBSETS,
    max_spherical_order: int = DEFAULT_MAX_SPHERICAL_ORDER,
    direct_max_target_degree: int = DEFAULT_DIRECT_MAX_TARGET_DEGREE,
    direct_max_search_nodes: int = DEFAULT_DIRECT_MAX_SEARCH_NODES,
    direct_max_target_group_order: int = DEFAULT_DIRECT_MAX_TARGET_GROUP_ORDER,
    direct_max_subgroups: int = DEFAULT_DIRECT_MAX_SUBGROUPS,
    direct_max_candidates: int = DEFAULT_DIRECT_MAX_CANDIDATES,
    checkpoint_path: Path | None = None,
    resume: bool = False,
    checkpoint_every: int = DEFAULT_CHECKPOINT_EVERY,
    external_degree_threshold: int = DEFAULT_EXTERNAL_DEGREE_THRESHOLD,
    external_engine: str = "auto",
) -> dict[str, Any]:
    if search_mode not in {"auto", "plan", "direct", "external"}:
        raise OrbifoldCoverInputError(
            "searchMode must be auto, plan, direct, or external"
        )
    source, matrix, input_hash = load_source(input_path)
    maximal, catalogue = spherical_catalogue(
        matrix,
        max_subsets=max_subsets,
        max_spherical_order=max_spherical_order,
    )
    cube = cube_incidence_catalogue(matrix, maximal)
    automorphisms = diagram_automorphisms(
        matrix,
        max_automorphisms=max_automorphisms,
        max_backtrack_nodes=max_backtrack_nodes,
    )
    if any(
        not verify_automorphism(matrix, permutation)
        for permutation in automorphisms.permutations
    ):
        raise AssertionError("Automorphism search emitted a non-automorphism")
    vertex_orbits = compress_cube_vertices(cube, automorphisms)
    candidates, all_degree_multiples_listed = admissible_degree_plan(
        catalogue["lowerBoundDivisor"], max_degree, max_candidate_degrees
    )

    warnings = [
        "Cube incidence and local spherical data constrain a cover search; they do not construct a permutation action.",
        "Completeness is always relative to an explicitly recorded finite search scope; bounded failure is not nonexistence.",
    ]
    if not cube["allVertexChoicesSpherical"]:
        warnings.append(
            "Not every rank-n cube vertex group is spherical. Torsion checks use the exact maximal spherical catalogue instead."
        )
    if not automorphisms.complete:
        warnings.append(
            "Diagram automorphism enumeration reached a bound; symmetry reduction is partial."
        )
    if not all_degree_multiples_listed:
        warnings.append(
            "The candidate-degree list reached maxCandidateDegrees before maxDegree."
        )

    action_validation: dict[str, Any] | None = None
    errors: list[str] = []
    if action_path is not None and dry_run:
        warnings.append(
            "--dry-run was supplied, so --action was not loaded or validated."
        )
    elif action_path is not None:
        try:
            action_validation = validate_action_candidate(
                read_json(action_path),
                matrix,
                maximal,
                cube,
                catalogue["lowerBoundDivisor"],
            )
            errors.extend(action_validation["errors"])
        except OrbifoldCoverInputError as exc:
            errors.append(str(exc))
            action_validation = {
                "status": "rejected",
                "validationComplete": True,
                "errors": [str(exc)],
            }

    seed = _constraint_seed(
        source,
        matrix,
        input_hash,
        catalogue,
        cube,
        automorphisms,
        vertex_orbits,
        candidates,
    )
    direct_search: dict[str, Any] | None = None
    external_handoff: dict[str, Any] | None = None
    effective_mode = search_mode
    if dry_run:
        effective_mode = "plan"
    elif action_path is not None:
        effective_mode = "supplied-action"
    elif search_mode == "auto":
        effective_mode = (
            "external"
            if catalogue["lowerBoundDivisor"] >= external_degree_threshold
            else "direct"
        )

    result_candidates: list[dict[str, Any]] = []
    if action_validation is not None and action_validation.get("status") == "passed":
        result_candidates.append(
            {
                "kind": "supplied-permutation-action",
                "status": action_validation["status"],
                "complete": True,
                "degree": action_validation.get("degree"),
                "actionHash": action_validation.get("actionHash"),
            }
        )
    elif effective_mode == "direct":
        direct_search = direct_bounded_cover_search(
            matrix,
            maximal,
            cube,
            automorphisms,
            vertex_orbits,
            input_hash=input_hash,
            seed_hash=sha256_json(seed),
            max_degree=max_degree,
            max_target_degree=direct_max_target_degree,
            max_search_nodes=direct_max_search_nodes,
            max_target_group_order=direct_max_target_group_order,
            max_subgroups=direct_max_subgroups,
            max_candidates=direct_max_candidates,
            max_subsets=max_subsets,
            checkpoint_path=checkpoint_path,
            resume=resume,
            checkpoint_every=checkpoint_every,
        )
        result_candidates.extend(direct_search["candidates"])
        if direct_search["scopeComplete"] and not result_candidates:
            warnings.append(
                "The direct engine exhausted only its declared small symmetric-target scope. This is not a nonexistence result."
            )
    elif effective_mode == "external":
        external_handoff = external_engine_handoff(
            seed,
            input_hash=input_hash,
            lower_bound=catalogue["lowerBoundDivisor"],
            max_degree=max_degree,
            engine=external_engine,
        )
        warnings.append(external_handoff["warning"])

    if action_validation is not None and action_validation.get("status") == "passed":
        status = "candidate-found"
        detail_status = "supplied-action-passed"
        complete = bool(action_validation.get("validationComplete"))
    elif action_validation is not None:
        status = "exhausted"
        detail_status = "supplied-action-rejected"
        complete = bool(action_validation.get("validationComplete"))
    elif dry_run or effective_mode == "plan":
        status = "planned"
        detail_status = "plan-only"
        complete = False
    elif direct_search is not None and direct_search["candidates"]:
        status = "candidate-found"
        detail_status = "candidate-found-direct-bounded"
        complete = bool(direct_search["scopeComplete"])
    elif direct_search is not None and direct_search["scopeComplete"]:
        status = "exhausted"
        detail_status = "bounded-scope-exhausted-no-candidate"
        complete = True
    elif direct_search is not None:
        status = "incomplete"
        detail_status = "direct-search-incomplete"
        complete = False
    elif external_handoff is not None:
        status = "incomplete"
        detail_status = "external-engine-handoff-required"
        complete = False
    else:
        status = "incomplete"
        detail_status = "no-search-result"
        complete = False

    artifact = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "track": TRACK,
        "status": status,
        "complete": complete,
        "sourceSystem": source,
        "inputHash": input_hash,
        "lowerBoundDivisor": catalogue["lowerBoundDivisor"],
        "bounds": {
            "maxDegree": max_degree,
            "maxCandidateDegrees": max_candidate_degrees,
            "maxAutomorphisms": max_automorphisms,
            "maxBacktrackNodes": max_backtrack_nodes,
            "maxSubsets": max_subsets,
            "maxSphericalOrder": max_spherical_order,
            "dryRun": dry_run,
            "requestedSearchMode": search_mode,
            "effectiveSearchMode": effective_mode,
            "directMaxTargetDegree": direct_max_target_degree,
            "directMaxSearchNodes": direct_max_search_nodes,
            "directMaxTargetGroupOrder": direct_max_target_group_order,
            "directMaxSubgroups": direct_max_subgroups,
            "directMaxCandidates": direct_max_candidates,
            "checkpointEvery": checkpoint_every,
            "externalDegreeThreshold": external_degree_threshold,
            "externalEngine": external_engine,
        },
        "candidates": result_candidates,
        "evidence": {
            "engine": {"id": ENGINE_ID, "version": ENGINE_VERSION},
            "sphericalCatalogue": catalogue,
            "cubeIncidence": cube,
            "diagramAutomorphisms": automorphism_record(automorphisms),
            "vertexOrbitCompression": vertex_orbits,
            "actionValidation": action_validation,
            "directSearch": direct_search,
            "externalEngineHandoff": external_handoff,
            "detailStatus": detail_status,
            "degreeDivisibility": {
                "divisor": catalogue["lowerBoundDivisor"],
                "maximalSphericalOrders": sorted(
                    {entry.expected_order for entry in maximal}
                ),
                "proof": (
                    "In a torsion-free transitive W-set, each finite special "
                    "subgroup W_T acts freely. Every W_T-orbit therefore has "
                    "size |W_T|, so |W_T| divides the action degree. The least "
                    "common multiple of all maximal spherical orders divides "
                    "every torsion-free cover degree."
                ),
                "necessaryNotSufficient": True,
            },
            "admissibleDegreePlan": {
                "degrees": candidates,
                "completeThroughMaxDegree": all_degree_multiples_listed,
            },
        },
        "searchSeed": seed,
        "warnings": warnings,
        "errors": errors,
    }
    return with_artifact_hash(artifact)


def failure_artifact(input_path: Path, error: Exception) -> dict[str, Any]:
    artifact = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "track": TRACK,
        "status": "failed",
        "complete": False,
        "sourceSystem": None,
        "inputHash": None,
        "lowerBoundDivisor": None,
        "bounds": {},
        "candidates": [],
        "evidence": {"input": str(input_path)},
        "warnings": [],
        "errors": [str(error)],
    }
    return with_artifact_hash(artifact)


def write_artifact(path: Path, artifact: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf8"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Plan a geometry-informed Coxeter cube cover search and optionally "
            "validate a supplied transitive permutation action."
        )
    )
    parser.add_argument("--input", required=True, type=Path, help="Coxeter system JSON")
    parser.add_argument(
        "--output", required=True, type=Path, help="Output artifact JSON"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build exact constraints and a search plan without loading --action",
    )
    parser.add_argument(
        "--action",
        type=Path,
        help="Optional zero-based transitive generator permutation action JSON",
    )
    parser.add_argument(
        "--search-mode",
        choices=("auto", "plan", "direct", "external"),
        default=DEFAULT_SEARCH_MODE,
        help=(
            "auto uses the direct engine for small lower bounds and emits an "
            "external handoff for large ones"
        ),
    )
    parser.add_argument("--max-degree", type=int, default=DEFAULT_MAX_DEGREE)
    parser.add_argument(
        "--max-candidate-degrees", type=int, default=DEFAULT_MAX_CANDIDATE_DEGREES
    )
    parser.add_argument(
        "--max-automorphisms", type=int, default=DEFAULT_MAX_AUTOMORPHISMS
    )
    parser.add_argument(
        "--max-backtrack-nodes", type=int, default=DEFAULT_MAX_BACKTRACK_NODES
    )
    parser.add_argument("--max-subsets", type=int, default=DEFAULT_MAX_SUBSETS)
    parser.add_argument(
        "--max-spherical-order", type=int, default=DEFAULT_MAX_SPHERICAL_ORDER
    )
    parser.add_argument(
        "--direct-max-target-degree",
        type=int,
        default=DEFAULT_DIRECT_MAX_TARGET_DEGREE,
        help="Exhaust finite target assignments in S_k through this k",
    )
    parser.add_argument(
        "--direct-max-search-nodes",
        type=int,
        default=DEFAULT_DIRECT_MAX_SEARCH_NODES,
    )
    parser.add_argument(
        "--direct-max-target-group-order",
        type=int,
        default=DEFAULT_DIRECT_MAX_TARGET_GROUP_ORDER,
    )
    parser.add_argument(
        "--direct-max-subgroups",
        type=int,
        default=DEFAULT_DIRECT_MAX_SUBGROUPS,
    )
    parser.add_argument(
        "--direct-max-candidates",
        type=int,
        default=DEFAULT_DIRECT_MAX_CANDIDATES,
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        help="Write a resumable direct-search frontier checkpoint",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume the exact frontier stored by --checkpoint",
    )
    parser.add_argument(
        "--checkpoint-every", type=int, default=DEFAULT_CHECKPOINT_EVERY
    )
    parser.add_argument(
        "--external-degree-threshold",
        type=int,
        default=DEFAULT_EXTERNAL_DEGREE_THRESHOLD,
    )
    parser.add_argument(
        "--external-engine",
        choices=("auto", "gap", "sage"),
        default="auto",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        artifact = build_search_artifact(
            args.input,
            action_path=args.action,
            dry_run=args.dry_run,
            search_mode=args.search_mode,
            max_degree=args.max_degree,
            max_candidate_degrees=args.max_candidate_degrees,
            max_automorphisms=args.max_automorphisms,
            max_backtrack_nodes=args.max_backtrack_nodes,
            max_subsets=args.max_subsets,
            max_spherical_order=args.max_spherical_order,
            direct_max_target_degree=args.direct_max_target_degree,
            direct_max_search_nodes=args.direct_max_search_nodes,
            direct_max_target_group_order=args.direct_max_target_group_order,
            direct_max_subgroups=args.direct_max_subgroups,
            direct_max_candidates=args.direct_max_candidates,
            checkpoint_path=args.checkpoint,
            resume=args.resume,
            checkpoint_every=args.checkpoint_every,
            external_degree_threshold=args.external_degree_threshold,
            external_engine=args.external_engine,
        )
    except Exception as exc:  # noqa: BLE001 - CLI failures are retained as JSON.
        artifact = failure_artifact(args.input, exc)
    write_artifact(args.output, artifact)
    return 1 if artifact["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
