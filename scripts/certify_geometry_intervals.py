#!/usr/bin/env python3
"""Numerical interval certificate for compact hyperbolic geometry data.

This checker deliberately has a narrower scope than an exact coordinate proof.
It factors the bundled normal Gram matrix numerically, solves a chamber
basepoint numerically, and records interval-style bounds for the quantities the
viewer depends on: Gram reconstruction, Lorentz preservation, reflection
involutions, chamber inequalities, and ball-model projection bounds.

The certificate never claims exact normal coordinates.  Exact source
transcription and exact Gram signatures remain the responsibility of the
compact-example checkers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any


BACKEND = "geometryIntervalNumericalChecker"
BACKEND_VERSION = "1.0.0"
DEFAULT_TOLERANCE = 1e-8
INTERVAL_RADIUS = 5e-10
SUPPORTED_EXAMPLES = {
    "compact_5_cube_gamma1.json": {
        "sourceRefIds": ["jacquemet-tschantz-2018-cube"],
        "expectedRank": 10,
        "expectedDimension": 5,
        "expectedSignature": {"positive": 5, "negative": 1, "zero": 4},
    },
    "compact_5_prism_makarov.json": {
        "sourceRefIds": ["bredon-kellerhals-2022-prism"],
        "expectedRank": 7,
        "expectedDimension": 5,
        "expectedSignature": {"positive": 5, "negative": 1, "zero": 1},
    },
}

Vector = list[float]
Matrix = list[list[float]]


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def checked_payload(example: dict[str, Any]) -> dict[str, Any]:
    geometry = example.get("geometry", {})
    return {
        "schemaVersion": example.get("schemaVersion"),
        "name": example.get("name"),
        "rank": example.get("rank"),
        "coxeterMatrix": example.get("coxeterMatrix"),
        "geometry": {
            "model": geometry.get("model"),
            "dimension": geometry.get("dimension"),
            "normalGram": geometry.get("normalGram"),
            "projection": geometry.get("projection"),
            "source": geometry.get("source"),
        },
        "sourceRefs": example.get("sourceRefs"),
    }


def gram_entry_value(entry: Any) -> float:
    if not isinstance(entry, dict):
        raise ValueError("normalGram entries must be objects")

    kind = entry.get("kind")
    exact = entry.get("exact")
    if isinstance(exact, dict) and isinstance(exact.get("decimal"), (int, float)):
        decimal = float(exact["decimal"])
    else:
        decimal = None

    if kind == "coxeter":
        m = entry.get("m")
        if not isinstance(m, int) or m < 2:
            raise ValueError(f"invalid coxeter Gram entry m={m!r}")
        return 0.0 if m == 2 else -math.cos(math.pi / m)
    if kind == "right":
        return 0.0
    if kind == "dotted":
        value = decimal if decimal is not None else entry.get("coshDistance")
        if not isinstance(value, (int, float)):
            raise ValueError("dotted Gram entry needs coshDistance or exact.decimal")
        return -float(value)
    if kind == "numericGram":
        value = decimal if decimal is not None else entry.get("value")
        if not isinstance(value, (int, float)):
            raise ValueError("numericGram entry needs value or exact.decimal")
        return float(value)

    raise ValueError(f"unsupported Gram entry kind {kind!r}")


def normal_gram_matrix(example: dict[str, Any]) -> Matrix:
    geometry = example.get("geometry")
    if not isinstance(geometry, dict):
        raise ValueError("geometry block is required")
    normal_gram = geometry.get("normalGram")
    if not isinstance(normal_gram, list):
        raise ValueError("geometry.normalGram is required")
    return [[gram_entry_value(entry) for entry in row] for row in normal_gram]


def validate_numeric_normal_gram(gram_matrix: Matrix, tolerance: float) -> None:
    rank = len(gram_matrix)
    for row_index, row in enumerate(gram_matrix):
        if len(row) != rank:
            raise ValueError("geometry.normalGram must be square")
        for column_index, value in enumerate(row):
            if not math.isfinite(value):
                raise ValueError(
                    f"geometry.normalGram[{row_index}][{column_index}] is not finite"
                )
            if row_index == column_index and abs(value - 1.0) > tolerance:
                raise ValueError(
                    f"geometry.normalGram[{row_index}][{column_index}] must be 1"
                )
            if abs(value - gram_matrix[column_index][row_index]) > tolerance:
                raise ValueError(
                    "geometry.normalGram must be symmetric: "
                    f"[{row_index}][{column_index}] differs from "
                    f"[{column_index}][{row_index}]"
                )


def identity_matrix(size: int) -> Matrix:
    return [[1.0 if row == column else 0.0 for column in range(size)] for row in range(size)]


def transpose(matrix: Matrix) -> Matrix:
    return [list(column) for column in zip(*matrix, strict=True)]


def mat_mul(left: Matrix, right: Matrix) -> Matrix:
    rows = len(left)
    columns = len(right[0])
    inner = len(right)
    return [
        [
            sum(left[row][index] * right[index][column] for index in range(inner))
            for column in range(columns)
        ]
        for row in range(rows)
    ]


def mat_vec(matrix: Matrix, vector: Vector) -> Vector:
    return [sum(entry * vector[index] for index, entry in enumerate(row)) for row in matrix]


def max_abs_matrix_difference(left: Matrix, right: Matrix) -> float:
    maximum = 0.0
    for row in range(len(left)):
        for column in range(len(left[row])):
            maximum = max(maximum, abs(left[row][column] - right[row][column]))
    return maximum


def max_abs_vector_difference(left: Vector, right: Vector) -> float:
    return max((abs(value - right[index]) for index, value in enumerate(left)), default=0.0)


def lorentz_dot(left: Vector, right: Vector) -> float:
    total = -left[0] * right[0]
    for index in range(1, len(left)):
        total += left[index] * right[index]
    return total


def lorentz_form(size: int) -> Matrix:
    form = identity_matrix(size)
    form[0][0] = -1.0
    return form


def normalize_timelike(vector: Vector) -> Vector | None:
    norm = lorentz_dot(vector, vector)
    if norm >= 0:
        return None
    scale = 1.0 / math.sqrt(-norm)
    normalized = [coordinate * scale for coordinate in vector]
    return normalized if normalized[0] >= 0 else [-coordinate for coordinate in normalized]


def jacobi_eigen_decomposition(matrix: Matrix, tolerance: float) -> list[dict[str, Any]]:
    work = [row[:] for row in matrix]
    size = len(work)
    eigenvectors = identity_matrix(size)
    max_iterations = max(1, 80 * size * size)

    for _ in range(max_iterations):
        pivot_row = 0
        pivot_column = 1 if size > 1 else 0
        pivot_value = 0.0
        for row in range(size):
            for column in range(row + 1, size):
                value = abs(work[row][column])
                if value > pivot_value:
                    pivot_row = row
                    pivot_column = column
                    pivot_value = value
        if pivot_value <= tolerance:
            break
        rotate_symmetric_matrix(work, eigenvectors, pivot_row, pivot_column)

    pairs = []
    for column in range(size):
        vector = stable_signed_vector([eigenvectors[row][column] for row in range(size)])
        pairs.append({"value": work[column][column], "vector": vector})
    pairs.sort(key=lambda pair: (-pair["value"], pair["vector"]))
    return pairs


def rotate_symmetric_matrix(matrix: Matrix, eigenvectors: Matrix, row: int, column: int) -> None:
    entry = matrix[row][column]
    if entry == 0:
        return

    diagonal_difference = matrix[column][column] - matrix[row][row]
    tau = diagonal_difference / (2 * entry)
    tangent = 1.0 if diagonal_difference == 0 else math.copysign(1.0, tau) / (
        abs(tau) + math.sqrt(1 + tau * tau)
    )
    cosine = 1.0 / math.sqrt(1 + tangent * tangent)
    sine = tangent * cosine

    row_row = matrix[row][row]
    column_column = matrix[column][column]
    row_column = matrix[row][column]

    matrix[row][row] = cosine * cosine * row_row - 2 * sine * cosine * row_column + sine * sine * column_column
    matrix[column][column] = sine * sine * row_row + 2 * sine * cosine * row_column + cosine * cosine * column_column
    matrix[row][column] = 0.0
    matrix[column][row] = 0.0

    for index in range(len(matrix)):
        if index != row and index != column:
            index_row = matrix[index][row]
            index_column = matrix[index][column]
            matrix[index][row] = cosine * index_row - sine * index_column
            matrix[row][index] = matrix[index][row]
            matrix[index][column] = sine * index_row + cosine * index_column
            matrix[column][index] = matrix[index][column]

        vector_row = eigenvectors[index][row]
        vector_column = eigenvectors[index][column]
        eigenvectors[index][row] = cosine * vector_row - sine * vector_column
        eigenvectors[index][column] = sine * vector_row + cosine * vector_column


def stable_signed_vector(vector: Vector) -> Vector:
    pivot_index = max(range(len(vector)), key=lambda index: abs(vector[index]))
    return vector if vector[pivot_index] >= 0 else [-coordinate for coordinate in vector]


def factor_lorentzian_normal_gram(
    gram_matrix: Matrix,
    dimension: int,
    tolerance: float,
) -> tuple[bool, Matrix, dict[str, Any], list[str]]:
    eigenpairs = jacobi_eigen_decomposition(gram_matrix, tolerance / 100)
    positive = [pair for pair in eigenpairs if pair["value"] > tolerance]
    negative = [pair for pair in eigenpairs if pair["value"] < -tolerance]
    zero = [pair for pair in eigenpairs if abs(pair["value"]) <= tolerance]
    coordinate_count = dimension + 1
    normals: Matrix = [[0.0 for _ in range(coordinate_count)] for _ in range(len(gram_matrix))]
    warnings = [
        "Normal coordinates were factored numerically from normalGram; the certificate validates residual intervals, not exact coordinates."
    ]

    signature = {
        "positive": len(positive),
        "negative": len(negative),
        "zero": len(zero),
    }
    if len(negative) != 1 or len(positive) > dimension:
        diagnostics = {
            "signature": signature,
            "eigenvalues": [pair["value"] for pair in eigenpairs],
            "residual": math.inf,
            "tolerance": tolerance,
        }
        return False, normals, diagnostics, warnings

    if len(positive) < dimension:
        warnings.append(
            f"normalGram has {len(positive)} positive directions for H^{dimension}; unused spatial coordinates were padded with zeros."
        )

    negative_pair = negative[0]
    for row in range(len(gram_matrix)):
        normals[row][0] = math.sqrt(-negative_pair["value"]) * negative_pair["vector"][row]

    for spatial_index, pair in enumerate(positive[:dimension]):
        for row in range(len(gram_matrix)):
            normals[row][spatial_index + 1] = math.sqrt(pair["value"]) * pair["vector"][row]

    reconstructed = reconstruct_lorentz_gram(normals)
    residual = max_abs_matrix_difference(reconstructed, gram_matrix)
    diagnostics = {
        "signature": signature,
        "eigenvalues": [pair["value"] for pair in eigenpairs],
        "residual": residual,
        "tolerance": tolerance,
    }
    return residual <= tolerance * 20, normals, diagnostics, warnings


def reconstruct_lorentz_gram(normals: Matrix) -> Matrix:
    return [[lorentz_dot(left, right) for right in normals] for left in normals]


def solve_basepoint(normals: Matrix, supplied: Vector | None, tolerance: float) -> tuple[bool, Vector, Matrix, dict[str, Any], list[str]]:
    for oriented in [False, True]:
        oriented_normals = [[-value for value in normal] for normal in normals] if oriented else [normal[:] for normal in normals]
        for method, candidate in basepoint_candidates(oriented_normals, supplied):
            point = normalize_timelike(candidate)
            if point is None:
                continue
            inequalities = [lorentz_dot(point, normal) for normal in oriented_normals]
            max_facet_value = max(inequalities)
            if max_facet_value <= tolerance:
                warnings: list[str] = []
                if oriented:
                    warnings.append(
                        "Normals were globally reoriented so the chamber basepoint satisfies <x,n_i> <= 0."
                    )
                if method != "supplied":
                    warnings.append(f"Basepoint was solved numerically by {method}.")
                diagnostics = {
                    "method": method,
                    "orientedByGlobalSign": oriented,
                    "maxFacetValue": max_facet_value,
                    "inequalities": inequalities,
                    "lorentzNorm": lorentz_dot(point, point),
                    "tolerance": tolerance,
                }
                return True, point, oriented_normals, diagnostics, warnings

    return (
        False,
        [],
        [normal[:] for normal in normals],
        {"method": "failed", "tolerance": tolerance},
        ["Could not find a timelike chamber basepoint satisfying <x,n_i> <= 0."],
    )


def basepoint_candidates(normals: Matrix, supplied: Vector | None) -> list[tuple[str, Vector]]:
    candidates: list[tuple[str, Vector]] = []
    if supplied is not None:
        candidates.append(("supplied", supplied[:]))

    summed = [sum(normal[index] for normal in normals) for index in range(len(normals[0]))]
    candidates.append(("normal-sum", summed))
    candidates.append(("normal-sum", [-coordinate for coordinate in summed]))

    least_squares = solve_least_squares_basepoint(normals)
    if least_squares is not None:
        candidates.append(("least-squares", least_squares))

    searched = coordinate_search_basepoint(normals, least_squares if least_squares is not None else summed)
    if searched is not None:
        candidates.append(("coordinate-search", searched))
    return candidates


def solve_least_squares_basepoint(normals: Matrix) -> Vector | None:
    coordinate_count = len(normals[0])
    covectors = [
        [-coordinate if index == 0 else coordinate for index, coordinate in enumerate(normal)]
        for normal in normals
    ]
    normal_matrix = [[0.0 for _ in range(coordinate_count)] for _ in range(coordinate_count)]
    rhs = [0.0 for _ in range(coordinate_count)]
    for row in covectors:
        for i in range(coordinate_count):
            rhs[i] -= row[i]
            for j in range(coordinate_count):
                normal_matrix[i][j] += row[i] * row[j]
    for index in range(coordinate_count):
        normal_matrix[index][index] += 1e-9
    return solve_linear_system(normal_matrix, rhs)


def coordinate_search_basepoint(normals: Matrix, seed: Vector) -> Vector | None:
    dimension = len(normals[0]) - 1
    if dimension < 1:
        return None

    spatial = seed[1:] if len(seed) == dimension + 1 else [0.0 for _ in range(dimension)]
    step = max(0.25, vector_length(spatial) or 1.0)
    best = point_from_spatial(spatial)
    best_score = violation_score(best, normals)

    for _ in range(80):
        improved = False
        for axis in range(dimension):
            for sign in [-1.0, 1.0]:
                next_spatial = spatial[:]
                next_spatial[axis] += sign * step
                point = point_from_spatial(next_spatial)
                score = violation_score(point, normals)
                if score < best_score:
                    spatial = next_spatial
                    best = point
                    best_score = score
                    improved = True
        if not improved:
            step *= 0.5
            if step < 1e-8:
                break
    return best


def point_from_spatial(spatial: Vector) -> Vector:
    squared = sum(coordinate * coordinate for coordinate in spatial)
    return [math.sqrt(1 + squared), *spatial]


def violation_score(point: Vector, normals: Matrix) -> float:
    return sum(max(0.0, lorentz_dot(point, normal)) ** 2 for normal in normals)


def vector_length(vector: Vector) -> float:
    return math.sqrt(sum(coordinate * coordinate for coordinate in vector))


def solve_linear_system(matrix: Matrix, rhs: Vector) -> Vector | None:
    size = len(matrix)
    augmented = [row[:] + [rhs[index]] for index, row in enumerate(matrix)]
    for pivot in range(size):
        pivot_row = max(range(pivot, size), key=lambda row: abs(augmented[row][pivot]))
        if abs(augmented[pivot_row][pivot]) < 1e-12:
            return None
        if pivot_row != pivot:
            augmented[pivot], augmented[pivot_row] = augmented[pivot_row], augmented[pivot]

        scale = augmented[pivot][pivot]
        for column in range(pivot, size + 1):
            augmented[pivot][column] /= scale

        for row in range(size):
            if row == pivot:
                continue
            factor = augmented[row][pivot]
            for column in range(pivot, size + 1):
                augmented[row][column] -= factor * augmented[pivot][column]
    return [row[size] for row in augmented]


def reflection_matrix_from_normal(normal: Vector) -> Matrix:
    normal_norm = lorentz_dot(normal, normal)
    size = len(normal)
    j_normal = [-normal[0], *normal[1:]]
    matrix = identity_matrix(size)
    for row in range(size):
        for column in range(size):
            matrix[row][column] -= 2 * normal[row] * j_normal[column] / normal_norm
    return matrix


def reflection_diagnostics(reflections: list[Matrix]) -> dict[str, Any]:
    size = len(reflections[0]) if reflections else 0
    form = lorentz_form(size)
    identity = identity_matrix(size)
    lorentz_residuals = []
    involution_residuals = []
    for reflection in reflections:
        pulled_back = mat_mul(mat_mul(transpose(reflection), form), reflection)
        lorentz_residuals.append(max_abs_matrix_difference(pulled_back, form))
        involution_residuals.append(max_abs_matrix_difference(mat_mul(reflection, reflection), identity))
    return {
        "lorentzPreservationResiduals": lorentz_residuals,
        "reflectionInvolutionResiduals": involution_residuals,
        "maxLorentzPreservationResidual": max(lorentz_residuals, default=math.inf),
        "maxReflectionInvolutionResidual": max(involution_residuals, default=math.inf),
    }


def reflected_neighbor_points(basepoint: Vector, reflections: list[Matrix]) -> list[Vector]:
    return [basepoint, *[mat_vec(reflection, basepoint) for reflection in reflections]]


def projection_bounds(points: list[Vector], model: str) -> dict[str, Any]:
    projected = []
    denominator_min = math.inf
    for point in points:
        denominator = point[0] if model == "klein" else point[0] + 1
        denominator_min = min(denominator_min, denominator)
        projected.append([coordinate / denominator for coordinate in point[1:]])

    axes = [0, 1, 2]
    coordinate_bounds = []
    for axis in axes:
        values = [row[axis] for row in projected if axis < len(row)]
        coordinate_bounds.append(interval(min(values), max(values)) if values else interval(0.0, 0.0))
    radial_squared = [sum(coordinate * coordinate for coordinate in row) for row in projected]
    return {
        "model": model,
        "axes": axes,
        "pointCount": len(points),
        "minimumDenominator": denominator_min,
        "coordinateBounds": coordinate_bounds,
        "radialSquaredBound": interval(min(radial_squared), max(radial_squared)),
    }


def interval(lower: float, upper: float, decimal: float | None = None, radius: float = 0.0) -> dict[str, Any]:
    actual_lower = lower - radius
    actual_upper = upper + radius
    midpoint = decimal if decimal is not None else (lower + upper) / 2
    return {
        "kind": "interval-real",
        "lower": round_float(actual_lower),
        "upper": round_float(actual_upper),
        "decimal": round_float(midpoint),
    }


def scalar_interval(value: float, radius: float = INTERVAL_RADIUS) -> dict[str, Any]:
    return interval(value, value, value, radius)


def residual_interval(value: float, radius: float = INTERVAL_RADIUS) -> dict[str, Any]:
    return {
        "kind": "interval-real",
        "lower": 0.0,
        "upper": round_float(max(0.0, value) + radius),
        "decimal": round_float(max(0.0, value)),
    }


def vector_intervals(vector: Vector, radius: float = INTERVAL_RADIUS) -> list[dict[str, Any]]:
    return [scalar_interval(value, radius) for value in vector]


def matrix_intervals(matrix: Matrix, radius: float = INTERVAL_RADIUS) -> list[list[dict[str, Any]]]:
    return [vector_intervals(row, radius) for row in matrix]


def round_float(value: float) -> float:
    if not math.isfinite(value):
        return value
    rounded = round(value, 15)
    return 0.0 if rounded == 0 else rounded


def build_certificate(path: Path, example: dict[str, Any], tolerance: float) -> dict[str, Any]:
    spec = SUPPORTED_EXAMPLES.get(path.name)
    if spec is None:
        raise ValueError(f"{path.name} is not a supported compact geometry fixture")

    if example.get("rank") != spec["expectedRank"]:
        raise ValueError(f"rank must be {spec['expectedRank']}")
    geometry = example.get("geometry")
    if not isinstance(geometry, dict) or geometry.get("dimension") != spec["expectedDimension"]:
        raise ValueError(f"geometry.dimension must be {spec['expectedDimension']}")

    gram = normal_gram_matrix(example)
    validate_numeric_normal_gram(gram, tolerance)
    ok_factor, normals, factor_diagnostics, factor_warnings = factor_lorentzian_normal_gram(
        gram,
        int(spec["expectedDimension"]),
        tolerance,
    )
    signature = factor_diagnostics["signature"]
    expected_signature = spec["expectedSignature"]

    supplied_basepoint = geometry.get("basepoint")
    if supplied_basepoint is not None and not all(isinstance(value, (int, float)) for value in supplied_basepoint):
        raise ValueError("geometry.basepoint must contain only finite numbers when supplied")

    ok_basepoint, basepoint, oriented_normals, basepoint_diagnostics, basepoint_warnings = solve_basepoint(
        normals,
        [float(value) for value in supplied_basepoint] if isinstance(supplied_basepoint, list) else None,
        tolerance,
    )
    reflections = [reflection_matrix_from_normal(normal) for normal in oriented_normals] if ok_basepoint else []
    reflection_report = reflection_diagnostics(reflections) if reflections else {
        "lorentzPreservationResiduals": [],
        "reflectionInvolutionResiduals": [],
        "maxLorentzPreservationResidual": math.inf,
        "maxReflectionInvolutionResidual": math.inf,
    }
    points = reflected_neighbor_points(basepoint, reflections) if ok_basepoint else []
    projection_report = [
        projection_bounds(points, "klein"),
        projection_bounds(points, "poincare"),
    ] if points else []

    basepoint_norm_residual = abs(basepoint_diagnostics.get("lorentzNorm", math.inf) + 1)
    max_facet_value = basepoint_diagnostics.get("maxFacetValue", math.inf)
    max_projection_radius = max(
        (bounds["radialSquaredBound"]["upper"] for bounds in projection_report),
        default=math.inf,
    )

    pass_conditions = {
        "factorizationSucceeded": ok_factor,
        "signatureMatchesExactGramCertificate": signature == expected_signature,
        "gramResidualWithinTolerance": factor_diagnostics["residual"] <= tolerance * 20,
        "basepointSucceeded": ok_basepoint,
        "basepointNormWithinTolerance": basepoint_norm_residual <= tolerance * 20,
        "chamberInequalitiesWithinTolerance": max_facet_value <= tolerance * 20,
        "lorentzPreservationWithinTolerance": reflection_report["maxLorentzPreservationResidual"] <= tolerance * 20,
        "reflectionInvolutionWithinTolerance": reflection_report["maxReflectionInvolutionResidual"] <= tolerance * 20,
        "axisProjectionInsideUnitBall": max_projection_radius <= 1 + tolerance * 20,
    }
    status = "passed" if all(pass_conditions.values()) else "failed"

    payload_hash = sha256_json(checked_payload(example))
    command = f"python scripts/certify_geometry_intervals.py {path.as_posix()}"
    diagnostics = {
        "certifiedClaims": [
            "floating-point normal coordinates are enclosed by stated coordinate intervals",
            "normal Gram reconstruction residual is bounded numerically",
            "chamber basepoint inequalities are bounded numerically",
            "reflection matrices preserve the Lorentz form within stated residual bounds",
            "Klein and Poincare axis-projection sample points stay inside the unit ball within tolerance",
        ],
        "nonClaims": [
            "not an exact algebraic coordinate certificate",
            "not a proof that PCA projection preserves geometry",
            "not an independent Coxeter-polytope checker result",
        ],
        "tolerance": tolerance,
        "coordinateIntervalRadius": INTERVAL_RADIUS,
        "factorization": {
            **factor_diagnostics,
            "residualInterval": residual_interval(factor_diagnostics["residual"]),
        },
        "basepoint": {
            **basepoint_diagnostics,
            "lorentzNormResidualInterval": residual_interval(basepoint_norm_residual),
            "maxFacetValueInterval": scalar_interval(max_facet_value),
        },
        "reflection": {
            **reflection_report,
            "maxLorentzPreservationResidualInterval": residual_interval(reflection_report["maxLorentzPreservationResidual"]),
            "maxReflectionInvolutionResidualInterval": residual_interval(reflection_report["maxReflectionInvolutionResidual"]),
        },
        "projectionBounds": projection_report,
        "passConditions": pass_conditions,
        "checkedWordRadius": 1,
    }
    certificate = {
        "status": status,
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "scopes": [
            "geometry-intervals",
            "geometry-interval-coordinates",
            "geometry-interval-reflections",
            "projection-bounds",
        ],
        "command": command,
        "inputHash": payload_hash,
        "sourceRefIds": spec["sourceRefIds"],
        "diagnostics": diagnostics,
        "warnings": [
            *factor_warnings,
            *basepoint_warnings,
            "Intervals are floating-point enclosures for visualization artifacts; exact coordinates are not certified.",
        ],
    }
    certified_model = {
        "status": status,
        "coordinateSystem": "hyperboloid",
        "coordinateType": "interval-certified-numeric",
        "normalCoordinates": matrix_intervals(oriented_normals if ok_basepoint else normals),
        "basepoint": vector_intervals(basepoint) if ok_basepoint else None,
        "reflectionMatrices": [matrix_intervals(reflection) for reflection in reflections],
        "lorentzPreservationResidual": residual_interval(reflection_report["maxLorentzPreservationResidual"]),
        "reflectionInvolutionResidual": residual_interval(reflection_report["maxReflectionInvolutionResidual"]),
        "chamberInequalityBounds": [
            scalar_interval(value) for value in basepoint_diagnostics.get("inequalities", [])
        ],
        "projectionBounds": projection_report,
        "certificate": certificate,
        "warnings": certificate["warnings"],
    }
    return {
        "ok": status == "passed",
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "schemaVersion": 1,
        "file": str(path),
        "inputHash": payload_hash,
        "certificate": certificate,
        "certifiedModel": certified_model,
    }


def load_example(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid JSON: {error}") from error
    if not isinstance(value, dict):
        raise ValueError("top-level JSON value must be an object")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate numerical interval geometry for compact examples."
    )
    parser.add_argument(
        "example",
        type=Path,
        help="Path to compact_5_cube_gamma1.json or compact_5_prism_makarov.json.",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=DEFAULT_TOLERANCE,
        help="Numerical tolerance used for residual pass/fail checks.",
    )
    args = parser.parse_args(argv)

    warnings: list[str] = []
    try:
        example = load_example(args.example)
        report = build_certificate(args.example, example, args.tolerance)
    except Exception as error:  # noqa: BLE001 - CLI should report validation failures as JSON.
        report = {
            "ok": False,
            "backend": BACKEND,
            "backendVersion": BACKEND_VERSION,
            "schemaVersion": 1,
            "file": str(args.example),
            "errors": [str(error)],
            "warnings": warnings,
        }

    print(json.dumps(report, indent=2, sort_keys=True))
    print()
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
