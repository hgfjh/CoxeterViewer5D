#!/usr/bin/env python3
"""Solve one rational height-cone query and emit an exact certificate.

Run this file inside SageMath, for example::

    sage -python scripts/sage_exact_height_cone.py request.json certificate.json

The input is the JSON request produced by ``buildExactConeOracleRequest``.
For a feasible cone the backend returns a primitive integral point.  For an
infeasible cone it returns rational Farkas multipliers.  TypeScript replay in
``src/fibering/scalableHeightCone.ts`` checks every dot product and multiplier;
the PPL answer is never accepted merely because the backend says yes or no.
"""

from __future__ import annotations

import argparse
from collections import OrderedDict
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Sequence

try:
    from sage.all import (
        MixedIntegerLinearProgram,
        Polyhedron,
        QQ,
        identity_matrix,
        matrix,
        vector,
    )
    from sage.version import version as sage_version
except ImportError as exc:  # pragma: no cover - requires an external Sage runtime
    raise SystemExit(
        "This exact backend must run inside SageMath, for example with "
        "`sage -python scripts/sage_exact_height_cone.py ...`."
    ) from exc


BACKEND_ID = "sage-ppl-height-cone"
BACKEND_VERSION = "1.1.0"
LEGACY_ALGORITHM = "ppl-primal-and-normalized-farkas-dual"
REDUCED_ALGORITHM = (
    "exact-kernel-reduction-positive-ray-dedup-"
    "float-hint-exact-verification-ppl-exact-lp-farkas"
)
MAX_RANK = 256

try:  # A floating solve proposes witnesses; it never certifies them.
    import numpy as np
    from scipy.optimize import linprog
except ImportError:  # pragma: no cover - Sage distributions normally ship SciPy
    np = None
    linprog = None


class InputError(ValueError):
    """Raised when the request is not in the canonical bridge schema."""


def canonical_json(value: Any) -> str:
    """Match the repository's sorted compact canonical-JSON convention."""

    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def canonical_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def require_record(value: Any, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise InputError(f"{context} must be a JSON object.")
    return value


def require_sha256(value: Any, context: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise InputError(f"{context} must be a lowercase SHA-256 digest.")
    return value


def parse_canonical_integer(value: Any, context: str) -> int:
    if not isinstance(value, str):
        raise InputError(f"{context} must be a canonical decimal string.")
    if value == "0":
        return 0
    digits = value[1:] if value.startswith("-") else value
    if not digits or digits[0] == "0" or not digits.isdecimal():
        raise InputError(f"{context} is not a canonical decimal integer.")
    return int(value)


def primitive_positive_normal(values: Sequence[int]) -> list[int]:
    divisor = 0
    for value in values:
        divisor = math.gcd(divisor, value)
    if divisor == 0:
        raise InputError("A cone normal cannot vanish.")
    result = [value // divisor for value in values]
    first = next(value for value in result if value != 0)
    return [-value for value in result] if first < 0 else result


def validate_request(raw: Any) -> dict[str, Any]:
    request = require_record(raw, "request")
    if request.get("schemaVersion") != 1:
        raise InputError("The request has an unsupported schema version.")
    if request.get("kind") != "exact-height-cone-oracle-request":
        raise InputError("The request has the wrong kind.")
    require_sha256(request.get("sourceHash"), "sourceHash")
    rank = request.get("rank")
    if isinstance(rank, bool) or not isinstance(rank, int) or not 1 <= rank <= MAX_RANK:
        raise InputError(f"rank must lie in 1..{MAX_RANK}.")
    assignments = request.get("assignments")
    if not isinstance(assignments, list):
        raise InputError("assignments must be an array.")
    seen: set[str] = set()
    for index, raw_assignment in enumerate(assignments):
        assignment = require_record(raw_assignment, f"assignments[{index}]")
        raw_normal = assignment.get("normal")
        if not isinstance(raw_normal, list) or len(raw_normal) != rank:
            raise InputError(f"assignments[{index}].normal has the wrong rank.")
        normal = [
            parse_canonical_integer(value, f"assignments[{index}].normal[{column}]")
            for column, value in enumerate(raw_normal)
        ]
        primitive = primitive_positive_normal(normal)
        serialized = [str(value) for value in primitive]
        key = ",".join(serialized)
        if serialized != raw_normal or assignment.get("normalKey") != key:
            raise InputError(f"assignments[{index}] has a noncanonical normal.")
        if key in seen:
            raise InputError(f"assignments[{index}] repeats a normal.")
        seen.add(key)
        sign = assignment.get("sign")
        if isinstance(sign, bool) or sign not in (-1, 0, 1):
            raise InputError(f"assignments[{index}].sign is not ternary.")

    expected_constraint_digest = canonical_sha256(assignments)
    if request.get("constraintDigest") != expected_constraint_digest:
        raise InputError("The request constraint digest is invalid.")
    request_without_hash = dict(request)
    request_without_hash["requestHash"] = ""
    expected_request_hash = canonical_sha256(request_without_hash)
    if request.get("requestHash") != expected_request_hash:
        raise InputError("The request hash is invalid.")
    return request


def rational_string(value: Any) -> str:
    value = QQ(value)
    numerator = int(value.numerator())
    denominator = int(value.denominator())
    return str(numerator) if denominator == 1 else f"{numerator}/{denominator}"


def primitive_integral_point(point: Sequence[Any]) -> list[str]:
    denominators = [int(QQ(value).denominator()) for value in point]
    common_denominator = 1
    for denominator in denominators:
        common_denominator = math.lcm(common_denominator, denominator)
    integers = [int(QQ(value) * common_denominator) for value in point]
    divisor = 0
    for value in integers:
        divisor = math.gcd(divisor, value)
    if divisor == 0:
        raise RuntimeError("A positive-dimensional cone yielded only the zero point.")
    return [str(value // divisor) for value in integers]


def rows_from_request(
    request: dict[str, Any],
) -> tuple[list[list[int]], list[list[int]], list[int], list[int]]:
    strict_rows: list[list[int]] = []
    equality_rows: list[list[int]] = []
    strict_indices: list[int] = []
    equality_indices: list[int] = []
    for index, assignment in enumerate(request["assignments"]):
        normal = [int(value) for value in assignment["normal"]]
        sign = assignment["sign"]
        if sign == 0:
            equality_rows.append(normal)
            equality_indices.append(index)
        else:
            strict_rows.append([sign * value for value in normal])
            strict_indices.append(index)
    return strict_rows, equality_rows, strict_indices, equality_indices


def equality_kernel(
    rank: int, equality_rows: Sequence[Sequence[int]]
) -> tuple[Any, Any, int]:
    """Return E, a row basis K for ker(E), and rank(E), all over QQ."""

    equalities = matrix(QQ, equality_rows, ncols=rank)
    equality_rank = equalities.rank()
    if equality_rank == 0:
        kernel = identity_matrix(QQ, rank)
    else:
        kernel = equalities.right_kernel_matrix()
    if kernel.nrows() != rank - equality_rank or kernel.ncols() != rank:
        raise RuntimeError("The exact equality-kernel basis has the wrong shape.")
    return equalities, kernel, equality_rank


def project_strict_rows(
    strict_rows: Sequence[Sequence[int]], kernel: Any
) -> list[list[Any]]:
    transpose = kernel.transpose()
    return [list(vector(QQ, row) * transpose) for row in strict_rows]


def primitive_oriented_rational_row(
    row: Sequence[Any],
) -> tuple[tuple[int, ...], Any] | None:
    """Remove a positive rational scale without reversing the halfspace."""

    rationals = [QQ(value) for value in row]
    common_denominator = 1
    for value in rationals:
        common_denominator = math.lcm(
            common_denominator, int(value.denominator())
        )
    integers = [int(value * common_denominator) for value in rationals]
    divisor = 0
    for value in integers:
        divisor = math.gcd(divisor, value)
    if divisor == 0:
        return None
    primitive = tuple(value // divisor for value in integers)
    return primitive, QQ(divisor) / QQ(common_denominator)


def deduplicate_projected_rows(
    projected_rows: Sequence[Sequence[Any]],
) -> tuple[list[list[int]], list[int], list[Any], int | None]:
    """Keep one representative of each positively proportional strict row."""

    unique_rows: list[list[int]] = []
    representative_positions: list[int] = []
    representative_factors: list[Any] = []
    seen: set[tuple[int, ...]] = set()
    zero_position: int | None = None
    for position, row in enumerate(projected_rows):
        normalized = primitive_oriented_rational_row(row)
        if normalized is None:
            zero_position = position
            break
        primitive, factor = normalized
        if primitive in seen:
            continue
        seen.add(primitive)
        unique_rows.append(list(primitive))
        representative_positions.append(position)
        representative_factors.append(factor)
    return (
        unique_rows,
        representative_positions,
        representative_factors,
        zero_position,
    )


def exact_witness_valid(
    point: Sequence[Any],
    strict_rows: Sequence[Sequence[int]],
    equality_rows: Sequence[Sequence[int]],
) -> bool:
    rational_point = [QQ(value) for value in point]
    return all(
        sum(QQ(left) * right for left, right in zip(row, rational_point)) > 0
        for row in strict_rows
    ) and all(
        sum(QQ(left) * right for left, right in zip(row, rational_point)) == 0
        for row in equality_rows
    )


def lift_kernel_point(kernel: Any, reduced_point: Sequence[Any]) -> list[Any]:
    return list(vector(QQ, reduced_point) * kernel)


def floating_guided_witness(
    kernel: Any,
    reduced_rows: Sequence[Sequence[int]],
    strict_rows: Sequence[Sequence[int]],
    equality_rows: Sequence[Sequence[int]],
) -> list[str] | None:
    """Use HiGHS only to propose a point, then verify it over QQ."""

    if linprog is None or np is None or not reduced_rows:
        return None
    reduced_dimension = kernel.nrows()
    if reduced_dimension == 0:
        return None
    normalized_rows: list[list[float]] = []
    for row in reduced_rows:
        floating = [float(value) for value in row]
        scale = max(abs(value) for value in floating)
        if not math.isfinite(scale) or scale == 0:
            return None
        normalized_rows.append([value / scale for value in floating])
    # Maximize a common margin t in the bounded box |y_i|<=1.
    objective = np.zeros(reduced_dimension + 1)
    objective[-1] = -1.0
    inequalities = np.array(
        [[-value for value in row] + [1.0] for row in normalized_rows],
        dtype=float,
    )
    result = linprog(
        objective,
        A_ub=inequalities,
        b_ub=np.zeros(len(normalized_rows)),
        bounds=[(-1.0, 1.0)] * reduced_dimension + [(None, None)],
        method="highs",
    )
    if not result.success or result.x is None or result.x[-1] <= 1e-10:
        return None
    proposed = result.x[:-1]
    # Bounded decimal rounding keeps witnesses compact. Every candidate is
    # lifted through the exact kernel and checked against the original rows.
    for scale in (10**3, 10**6, 10**9, 10**12, 10**15):
        rounded = [int(round(float(value) * scale)) for value in proposed]
        if all(value == 0 for value in rounded):
            continue
        lifted = lift_kernel_point(kernel, rounded)
        if exact_witness_valid(lifted, strict_rows, equality_rows):
            return primitive_integral_point(lifted)
    decimal = [QQ(str(float(value))) for value in proposed]
    lifted = lift_kernel_point(kernel, decimal)
    if exact_witness_valid(lifted, strict_rows, equality_rows):
        return primitive_integral_point(lifted)
    return None


def recover_original_farkas(
    rank: int,
    strict_rows: Sequence[Sequence[int]],
    equality_rows: Sequence[Sequence[int]],
    strict_indices: Sequence[int],
    equality_indices: Sequence[int],
    representative_positions: Sequence[int],
    representative_factors: Sequence[Any],
    reduced_lambdas: Sequence[Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    lambdas: list[tuple[int, Any]] = []
    combined = vector(QQ, [0] * rank)
    for reduced_index, alpha in enumerate(reduced_lambdas):
        if alpha == 0:
            continue
        position = representative_positions[reduced_index]
        multiplier = QQ(alpha) / QQ(representative_factors[reduced_index])
        if multiplier < 0:
            raise RuntimeError("A reduced Farkas multiplier is negative.")
        lambdas.append((position, multiplier))
        combined += multiplier * vector(QQ, strict_rows[position])
    if not lambdas:
        raise RuntimeError("A reduced Farkas certificate has no positive mass.")

    equality_multipliers: list[tuple[int, Any]] = []
    if equality_rows:
        equalities = matrix(QQ, equality_rows, ncols=rank)
        solution = equalities.transpose().solve_right(-combined)
        equality_multipliers = [
            (position, value)
            for position, value in enumerate(solution)
            if value != 0
        ]
    elif any(value != 0 for value in combined):
        raise RuntimeError("A reduced Farkas combination did not lift to zero.")

    inequalities = [
        {
            "assignmentIndex": strict_indices[position],
            "value": rational_string(value),
        }
        for position, value in lambdas
        if value != 0
    ]
    equalities = [
        {
            "assignmentIndex": equality_indices[position],
            "value": rational_string(value),
        }
        for position, value in equality_multipliers
        if value != 0
    ]
    return inequalities, equalities


def solve_reduced_farkas(
    rank: int,
    reduced_rows: Sequence[Sequence[int]],
    strict_rows: Sequence[Sequence[int]],
    equality_rows: Sequence[Sequence[int]],
    strict_indices: Sequence[int],
    equality_indices: Sequence[int],
    representative_positions: Sequence[int],
    representative_factors: Sequence[Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    strict_count = len(reduced_rows)
    if strict_count == 0:
        raise RuntimeError("A reduced strict cone has no nonzero row.")
    reduced_dimension = len(reduced_rows[0])
    dual = MixedIntegerLinearProgram(maximization=False, solver="PPL")
    eta = dual.new_variable(real=True, nonnegative=True)
    dual.add_constraint(
        sum(eta[index] for index in range(strict_count)), min=1, max=1
    )
    for coordinate in range(reduced_dimension):
        expression = sum(
            reduced_rows[index][coordinate] * eta[index]
            for index in range(strict_count)
        )
        dual.add_constraint(expression, min=0, max=0)
    dual.set_objective(0)
    try:
        dual.solve()
    except Exception as exc:
        raise RuntimeError("The reduced exact Farkas dual is empty.") from exc
    values = dual.get_values(eta)
    point = [QQ(values[index]) for index in range(strict_count)]
    if any(value < 0 for value in point) or sum(point) != 1:
        raise RuntimeError("PPL returned an invalid reduced Farkas point.")
    return recover_original_farkas(
        rank,
        strict_rows,
        equality_rows,
        strict_indices,
        equality_indices,
        representative_positions,
        representative_factors,
        point,
    )


def solve_reduced(
    rank: int,
    strict_rows: Sequence[Sequence[int]],
    equality_rows: Sequence[Sequence[int]],
    strict_indices: Sequence[int],
    equality_indices: Sequence[int],
) -> tuple[bool, list[str] | None, int, list[dict[str, Any]], list[dict[str, Any]]]:
    _, kernel, equality_rank = equality_kernel(rank, equality_rows)
    dimension = rank - equality_rank
    if not strict_rows:
        if dimension == 0:
            return True, None, equality_rank, [], []
        return (
            True,
            primitive_integral_point(kernel.row(0)),
            equality_rank,
            [],
            [],
        )

    projected = project_strict_rows(strict_rows, kernel)
    (
        reduced_rows,
        representative_positions,
        representative_factors,
        zero_position,
    ) = deduplicate_projected_rows(projected)
    if zero_position is not None:
        inequalities, equalities = recover_original_farkas(
            rank,
            strict_rows,
            equality_rows,
            strict_indices,
            equality_indices,
            [zero_position],
            [QQ(1)],
            [QQ(1)],
        )
        return False, None, equality_rank, inequalities, equalities

    try:
        witness = floating_guided_witness(
            kernel, reduced_rows, strict_rows, equality_rows
        )
    except Exception:
        # The floating path is discovery only. Any numerical/import failure
        # falls through to the exact PPL primal and explicit Farkas dual.
        witness = None
    if witness is not None:
        return True, witness, equality_rank, [], []

    primal = MixedIntegerLinearProgram(maximization=False, solver="PPL")
    reduced_variables = primal.new_variable(real=True, nonnegative=False)
    for row in reduced_rows:
        primal.add_constraint(
            sum(
                row[coordinate] * reduced_variables[coordinate]
                for coordinate in range(dimension)
            ),
            min=1,
        )
    primal.set_objective(0)
    reduced_point: list[Any] | None = None
    try:
        primal.solve()
        values = primal.get_values(reduced_variables)
        reduced_point = [QQ(values[index]) for index in range(dimension)]
    except Exception:
        # An exception is not an infeasibility certificate. The explicit exact
        # dual below must still produce and lift a Farkas point.
        reduced_point = None
    if reduced_point is not None:
        lifted = lift_kernel_point(kernel, reduced_point)
        if not exact_witness_valid(lifted, strict_rows, equality_rows):
            raise RuntimeError("Reduced PPL returned an invalid lifted witness.")
        return (
            True,
            primitive_integral_point(lifted),
            equality_rank,
            [],
            [],
        )
    inequalities, equalities = solve_reduced_farkas(
        rank,
        reduced_rows,
        strict_rows,
        equality_rows,
        strict_indices,
        equality_indices,
        representative_positions,
        representative_factors,
    )
    return False, None, equality_rank, inequalities, equalities


def solve_feasible(
    rank: int,
    strict_rows: Sequence[Sequence[int]],
    equality_rows: Sequence[Sequence[int]],
) -> tuple[bool, list[str] | None, int]:
    equality_rank = matrix(QQ, equality_rows, ncols=rank).rank()
    dimension = rank - equality_rank
    if not strict_rows:
        if dimension == 0:
            return True, None, equality_rank
        kernel_basis = matrix(QQ, equality_rows, ncols=rank).right_kernel().basis()
        return True, primitive_integral_point(kernel_basis[0]), equality_rank

    # A homogeneous finite family b_i*x>0 has a point exactly when its common
    # positive margin can be rescaled to b_i*x>=1.
    primal = Polyhedron(
        ieqs=[[-1, *row] for row in strict_rows],
        eqns=[[0, *row] for row in equality_rows],
        base_ring=QQ,
        backend="ppl",
    )
    if primal.is_empty():
        return False, None, equality_rank
    point = list(primal.representative_point())
    for row in strict_rows:
        if sum(QQ(left) * QQ(right) for left, right in zip(row, point)) < 1:
            raise RuntimeError("PPL returned a point outside a primal inequality.")
    for row in equality_rows:
        if sum(QQ(left) * QQ(right) for left, right in zip(row, point)) != 0:
            raise RuntimeError("PPL returned a point outside the equality space.")
    return True, primitive_integral_point(point), equality_rank


def solve_farkas(
    rank: int,
    strict_rows: Sequence[Sequence[int]],
    equality_rows: Sequence[Sequence[int]],
    strict_indices: Sequence[int],
    equality_indices: Sequence[int],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    strict_count = len(strict_rows)
    equality_count = len(equality_rows)
    variable_count = strict_count + equality_count
    if strict_count == 0:
        raise RuntimeError("An equality-only homogeneous cone cannot be infeasible.")

    # Farkas alternative for B*x>=1 and E*x=0:
    # lambda>=0, sum(lambda)=1, lambda*B + mu*E = 0.
    dual_equalities = []
    for coordinate in range(rank):
        dual_equalities.append(
            [
                0,
                *[row[coordinate] for row in strict_rows],
                *[row[coordinate] for row in equality_rows],
            ]
        )
    dual_equalities.append([-1, *([1] * strict_count), *([0] * equality_count)])
    dual_inequalities = []
    for index in range(strict_count):
        coefficients = [0] * variable_count
        coefficients[index] = 1
        dual_inequalities.append([0, *coefficients])
    dual = Polyhedron(
        ieqs=dual_inequalities,
        eqns=dual_equalities,
        base_ring=QQ,
        backend="ppl",
    )
    if dual.is_empty():
        raise RuntimeError("Both sides of the exact Farkas alternative are empty.")
    point = list(dual.representative_point())
    lambdas = point[:strict_count]
    mus = point[strict_count:]
    if any(value < 0 for value in lambdas) or sum(lambdas) != 1:
        raise RuntimeError("PPL returned an invalid normalized Farkas point.")

    inequality_multipliers = [
        {"assignmentIndex": assignment_index, "value": rational_string(value)}
        for assignment_index, value in zip(strict_indices, lambdas)
        if value != 0
    ]
    equality_multipliers = [
        {"assignmentIndex": assignment_index, "value": rational_string(value)}
        for assignment_index, value in zip(equality_indices, mus)
        if value != 0
    ]
    return inequality_multipliers, equality_multipliers


def solve(
    request: dict[str, Any],
    solver: str = "reduced-auto",
    witness_hints: Sequence[Sequence[str]] = (),
) -> dict[str, Any]:
    rank = request["rank"]
    strict_rows, equality_rows, strict_indices, equality_indices = rows_from_request(
        request
    )
    hinted_witness = next(
        (
            list(hint)
            for hint in witness_hints
            if len(hint) == rank
            and exact_witness_valid(hint, strict_rows, equality_rows)
        ),
        None,
    )
    if hinted_witness is not None:
        algorithm = REDUCED_ALGORITHM
        feasible = True
        witness = primitive_integral_point(hinted_witness)
        equality_rank = matrix(QQ, equality_rows, ncols=rank).rank()
        inequalities = []
        equalities = []
    elif solver == "legacy-ppl":
        algorithm = LEGACY_ALGORITHM
        feasible, witness, equality_rank = solve_feasible(
            rank, strict_rows, equality_rows
        )
        inequalities: list[dict[str, Any]] = []
        equalities: list[dict[str, Any]] = []
        if not feasible:
            inequalities, equalities = solve_farkas(
                rank,
                strict_rows,
                equality_rows,
                strict_indices,
                equality_indices,
            )
    elif solver == "reduced-auto":
        algorithm = REDUCED_ALGORITHM
        (
            feasible,
            witness,
            equality_rank,
            inequalities,
            equalities,
        ) = solve_reduced(
            rank,
            strict_rows,
            equality_rows,
            strict_indices,
            equality_indices,
        )
    else:
        raise InputError(f"Unknown exact cone solver {solver!r}.")

    if feasible:
        result: dict[str, Any] = {
            "kind": "feasible",
            "equalityRank": equality_rank,
            "dimension": rank - equality_rank,
            "primitiveWitness": witness,
        }
    else:
        result = {
            "kind": "infeasible",
            "inequalityMultipliers": inequalities,
            "equalityMultipliers": equalities,
        }

    transcript = {
        "algorithm": algorithm,
        "requestHash": request["requestHash"],
        "result": result,
        "sageVersion": str(sage_version),
    }
    certificate = {
        "schemaVersion": 1,
        "kind": "external-exact-height-cone-certificate",
        "requestHash": request["requestHash"],
        "backend": {
            "id": BACKEND_ID,
            "version": BACKEND_VERSION,
            "algorithm": algorithm,
            "transcriptSha256": canonical_sha256(transcript),
        },
        "result": result,
        "certificateHash": "",
    }
    certificate["certificateHash"] = canonical_sha256(certificate)
    return certificate


def write_new_json(path: Path, value: Any, force: bool) -> None:
    if path.exists() and not force:
        raise FileExistsError(f"Refusing to replace existing output: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def serve_json_lines(max_cache_entries: int, solver: str) -> int:
    """Keep Sage/PPL resident while a TypeScript runner submits queries."""

    cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
    witness_hints: OrderedDict[tuple[str, ...], None] = OrderedDict()
    for line_number, line in enumerate(sys.stdin, start=1):
        if not line.strip():
            continue
        try:
            request = validate_request(json.loads(line))
            request_hash = request["requestHash"]
            certificate = cache.get(request_hash)
            if certificate is None:
                certificate = solve(
                    request,
                    solver,
                    tuple(reversed(witness_hints.keys())),
                )
                cache[request_hash] = certificate
                if len(cache) > max_cache_entries:
                    cache.popitem(last=False)
                if certificate["result"]["kind"] == "feasible":
                    witness = certificate["result"]["primitiveWitness"]
                    if witness is not None:
                        key = tuple(witness)
                        witness_hints[key] = None
                        witness_hints.move_to_end(key)
                        if len(witness_hints) > 64:
                            witness_hints.popitem(last=False)
            else:
                cache.move_to_end(request_hash)
            response: dict[str, Any] = {
                "ok": True,
                "requestHash": request_hash,
                "certificate": certificate,
                "cacheSize": len(cache),
            }
        except Exception as exc:  # The caller receives a bounded protocol error.
            response = {
                "ok": False,
                "line": line_number,
                "errorType": type(exc).__name__,
                "error": str(exc),
            }
        sys.stdout.write(canonical_json(response) + "\n")
        sys.stdout.flush()
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path, nargs="?", help="Cone-request JSON")
    parser.add_argument(
        "certificate", type=Path, nargs="?", help="New certificate JSON"
    )
    parser.add_argument(
        "--force", action="store_true", help="Replace an existing certificate path"
    )
    parser.add_argument(
        "--server",
        action="store_true",
        help="Read requests and write response envelopes as JSON Lines",
    )
    parser.add_argument(
        "--server-cache-size",
        type=int,
        default=None,
        help="Bound the resident request/certificate LRU (default: 4096)",
    )
    parser.add_argument(
        "--solver",
        choices=("reduced-auto", "legacy-ppl"),
        default="reduced-auto",
        help="Exact solver pipeline (default: reduced-auto)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.server:
        if args.request is not None or args.certificate is not None or args.force:
            raise SystemExit("--server does not accept file paths or --force")
        cache_size = (
            args.server_cache_size if args.server_cache_size is not None else 4096
        )
        if not 1 <= cache_size <= 1_000_000:
            raise SystemExit("--server-cache-size must lie in 1..1000000")
        return serve_json_lines(cache_size, args.solver)
    if args.server_cache_size is not None:
        raise SystemExit("--server-cache-size requires --server")
    if args.request is None or args.certificate is None:
        raise SystemExit("one-shot mode requires request and certificate paths")
    request = validate_request(json.loads(args.request.read_text(encoding="utf-8")))
    write_new_json(args.certificate, solve(request, args.solver), args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
