#!/usr/bin/env python3
"""Lift a LinBox modular nullspace only after exact certificate replay.

LinBox may return a different basis at each prime.  We first put every basis
in the same graph-chart: the lexicographically first independent coordinate
rows of the first basis are changed to the identity.  The normalized entries
can then be combined by CRT and reconstructed.  A proposed lift is accepted
only when the original integer matrix annihilates it over ``Z``.

The sparse formats used here are deliberately simple and streamable.

Matrix (LinBox sparse-row format)::

    ROWS COLS S
    NNZ COLUMN VALUE ...

Modular basis (written by ``streamed_h1_core_nullspace.cpp``)::

    COLS NULLITY PRIME RANK
    BASIS_INDEX NNZ COORDINATE VALUE ...

Lifted integral kernel frame::

    COLS DIMENSION Z
    VECTOR_INDEX NNZ COORDINATE VALUE ...

The emitted frame is saturated in its reconstructed rational span.  Calling it
the full integer kernel additionally requires a separate exact proof that the
matrix has rational nullity equal to the frame dimension (for example, a
matching modular rank lower bound).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Iterable, Iterator, Sequence


SCHEMA = "coxeter-viewer.modular-kernel-lift-certificate.v2"


@dataclass(frozen=True)
class SparseMatrixHeader:
    rows: int
    columns: int


@dataclass
class ModularBasis:
    path: Path
    columns: int
    nullity: int
    prime: int
    rank: int
    vectors: list[list[int]]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def is_prime(value: int) -> bool:
    if value < 2:
        return False
    if value % 2 == 0:
        return value == 2
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


def read_matrix_header(path: Path) -> SparseMatrixHeader:
    with path.open("r", encoding="ascii") as stream:
        words = stream.readline().split()
    if len(words) != 3 or words[2] != "S":
        raise ValueError(f"{path}: expected 'ROWS COLS S' header")
    rows, columns = map(int, words[:2])
    if rows < 0 or columns < 0:
        raise ValueError(f"{path}: negative matrix dimension")
    return SparseMatrixHeader(rows, columns)


def iter_sparse_matrix(
    path: Path, expected: SparseMatrixHeader | None = None
) -> Iterator[list[tuple[int, int]]]:
    with path.open("r", encoding="ascii") as stream:
        words = stream.readline().split()
        if len(words) != 3 or words[2] != "S":
            raise ValueError(f"{path}: expected 'ROWS COLS S' header")
        header = SparseMatrixHeader(int(words[0]), int(words[1]))
        if expected is not None and header != expected:
            raise ValueError(f"{path}: matrix header changed during replay")
        row_count = 0
        for row_count, line in enumerate(stream, start=1):
            words = line.split()
            if not words:
                raise ValueError(f"{path}: blank sparse row {row_count - 1}")
            count = int(words[0])
            if len(words) != 1 + 2 * count:
                raise ValueError(f"{path}: malformed sparse row {row_count - 1}")
            row: list[tuple[int, int]] = []
            seen: set[int] = set()
            for offset in range(count):
                column = int(words[1 + 2 * offset])
                value = int(words[2 + 2 * offset])
                if not 0 <= column < header.columns:
                    raise ValueError(
                        f"{path}: column {column} outside row {row_count - 1}"
                    )
                if column in seen:
                    raise ValueError(
                        f"{path}: duplicate column {column} in row {row_count - 1}"
                    )
                seen.add(column)
                if value:
                    row.append((column, value))
            yield row
        if row_count != header.rows:
            raise ValueError(
                f"{path}: header promises {header.rows} rows, found {row_count}"
            )


def read_modular_basis(path: Path) -> ModularBasis:
    with path.open("r", encoding="ascii") as stream:
        words = stream.readline().split()
        if len(words) != 4:
            raise ValueError(f"{path}: expected 'COLS NULLITY PRIME RANK' header")
        columns, nullity, prime, rank = map(int, words)
        if columns - rank != nullity:
            raise ValueError(f"{path}: nullity does not equal columns - rank")
        if not is_prime(prime):
            raise ValueError(f"{path}: modulus {prime} is not prime")
        vectors = [[0] * columns for _ in range(nullity)]
        seen_basis: set[int] = set()
        for line_number, line in enumerate(stream, start=2):
            words = line.split()
            if len(words) < 2:
                raise ValueError(f"{path}:{line_number}: malformed basis line")
            basis_index, count = map(int, words[:2])
            if not 0 <= basis_index < nullity or basis_index in seen_basis:
                raise ValueError(f"{path}:{line_number}: invalid/duplicate basis index")
            if len(words) != 2 + 2 * count:
                raise ValueError(f"{path}:{line_number}: wrong sparse entry count")
            seen_basis.add(basis_index)
            seen_coordinates: set[int] = set()
            vector = vectors[basis_index]
            for offset in range(count):
                coordinate = int(words[2 + 2 * offset])
                value = int(words[3 + 2 * offset]) % prime
                if not 0 <= coordinate < columns or coordinate in seen_coordinates:
                    raise ValueError(
                        f"{path}:{line_number}: invalid/duplicate coordinate"
                    )
                seen_coordinates.add(coordinate)
                vector[coordinate] = value
        if len(seen_basis) != nullity:
            raise ValueError(f"{path}: expected {nullity} basis vectors")
    return ModularBasis(path, columns, nullity, prime, rank, vectors)


def invert_matrix_mod(matrix: Sequence[Sequence[int]], modulus: int) -> list[list[int]]:
    size = len(matrix)
    augmented = [
        [value % modulus for value in row]
        + [int(row_index == column) for column in range(size)]
        for row_index, row in enumerate(matrix)
    ]
    if any(len(row) != 2 * size for row in augmented):
        raise ValueError("matrix must be square")
    for column in range(size):
        pivot = next(
            (row for row in range(column, size) if augmented[row][column] % modulus),
            None,
        )
        if pivot is None:
            raise ValueError(f"pivot-row minor is singular modulo {modulus}")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        inverse = pow(augmented[column][column], -1, modulus)
        augmented[column] = [(value * inverse) % modulus for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column] % modulus
            if factor:
                augmented[row] = [
                    (left - factor * right) % modulus
                    for left, right in zip(augmented[row], augmented[column])
                ]
    return [row[size:] for row in augmented]


def first_independent_coordinate_rows(basis: ModularBasis) -> list[int]:
    """Return the lexicographically first full-rank coordinate-row minor."""

    modulus = basis.prime
    dimension = basis.nullity
    echelon: list[tuple[int, list[int]]] = []
    selected: list[int] = []
    for coordinate in range(basis.columns):
        row = [vector[coordinate] % modulus for vector in basis.vectors]
        for pivot, pivot_row in echelon:
            factor = row[pivot]
            if factor:
                row = [
                    (left - factor * right) % modulus
                    for left, right in zip(row, pivot_row)
                ]
        pivot = next((index for index, value in enumerate(row) if value), None)
        if pivot is None:
            continue
        inverse = pow(row[pivot], -1, modulus)
        row = [(value * inverse) % modulus for value in row]
        echelon.append((pivot, row))
        echelon.sort(key=lambda item: item[0])
        selected.append(coordinate)
        if len(selected) == dimension:
            return selected
    raise ValueError("modular vectors are not linearly independent")


def normalize_basis(
    basis: ModularBasis, pivot_rows: Sequence[int]
) -> tuple[list[list[int]], list[list[int]]]:
    """Change basis so ``normalized[j][pivot_rows[i]] = delta(i,j)``."""

    if len(pivot_rows) != basis.nullity or len(set(pivot_rows)) != len(pivot_rows):
        raise ValueError("pivot row list must contain one distinct row per basis vector")
    if any(not 0 <= row < basis.columns for row in pivot_rows):
        raise ValueError("pivot row lies outside the ambient coordinates")
    minor = [
        [basis.vectors[column][row] for column in range(basis.nullity)]
        for row in pivot_rows
    ]
    transform = invert_matrix_mod(minor, basis.prime)
    normalized = [[0] * basis.columns for _ in range(basis.nullity)]
    for coordinate in range(basis.columns):
        old_row = [vector[coordinate] for vector in basis.vectors]
        for new_column in range(basis.nullity):
            normalized[new_column][coordinate] = sum(
                old_row[old_column] * transform[old_column][new_column]
                for old_column in range(basis.nullity)
            ) % basis.prime
    for row_index, coordinate in enumerate(pivot_rows):
        actual = [vector[coordinate] for vector in normalized]
        expected = [int(row_index == column) for column in range(basis.nullity)]
        if actual != expected:
            raise AssertionError("internal error: graph-chart normalization failed")
    return normalized, transform


def verify_modular_kernel(
    matrix_path: Path,
    header: SparseMatrixHeader,
    vectors: Sequence[Sequence[int]],
    modulus: int,
) -> dict[str, object]:
    failures: list[dict[str, int]] = []
    nonzero_count = 0
    for row_index, row in enumerate(iter_sparse_matrix(matrix_path, header)):
        for vector_index, vector in enumerate(vectors):
            residual = sum(value * vector[column] for column, value in row) % modulus
            if residual:
                nonzero_count += 1
                if len(failures) < 8:
                    failures.append(
                        {
                            "row": row_index,
                            "basisVector": vector_index,
                            "residual": residual,
                        }
                    )
    return {
        "passed": nonzero_count == 0,
        "nonzeroResidualCount": nonzero_count,
        "firstFailures": failures,
    }


def combine_crt(
    normalized: Sequence[tuple[int, Sequence[Sequence[int]]]]
) -> tuple[int, list[list[int]]]:
    if not normalized:
        raise ValueError("at least one modular basis is required")
    modulus, combined_source = normalized[0]
    combined = [list(vector) for vector in combined_source]
    for prime, vectors in normalized[1:]:
        if math.gcd(modulus, prime) != 1:
            raise ValueError(f"moduli {modulus} and {prime} are not coprime")
        if len(vectors) != len(combined) or any(
            len(vector) != len(combined[index]) for index, vector in enumerate(vectors)
        ):
            raise ValueError("normalized basis dimensions disagree")
        inverse = pow(modulus, -1, prime)
        for vector_index, vector in enumerate(vectors):
            target = combined[vector_index]
            for coordinate, residue in enumerate(vector):
                correction = ((residue - target[coordinate]) % prime) * inverse % prime
                target[coordinate] += modulus * correction
        modulus *= prime
    return modulus, combined


def symmetric_residue(value: int, modulus: int) -> int:
    value %= modulus
    return value - modulus if value > modulus // 2 else value


def rational_reconstruct(
    residue: int, modulus: int, numerator_bound: int, denominator_bound: int
) -> Fraction | None:
    """Reconstruct n/d with |n|<=N, 0<d<=D and n == residue*d mod m."""

    residue %= modulus
    if residue == 0:
        return Fraction(0)
    old_r, new_r = modulus, residue
    old_t, new_t = 0, 1
    while abs(new_r) > numerator_bound:
        if new_r == 0:
            return None
        quotient = old_r // new_r
        old_r, new_r = new_r, old_r - quotient * new_r
        old_t, new_t = new_t, old_t - quotient * new_t
    numerator, denominator = new_r, new_t
    if denominator == 0:
        return None
    if denominator < 0:
        numerator, denominator = -numerator, -denominator
    common = math.gcd(numerator, denominator)
    numerator //= common
    denominator //= common
    if abs(numerator) > numerator_bound or denominator > denominator_bound:
        return None
    if (residue * denominator - numerator) % modulus:
        return None
    return Fraction(numerator, denominator)


def symmetric_candidate(residues: Sequence[Sequence[int]], modulus: int) -> list[list[int]]:
    return [
        [symmetric_residue(value, modulus) for value in vector]
        for vector in residues
    ]


def rational_candidate(
    residues: Sequence[Sequence[int]],
    modulus: int,
    numerator_bound: int,
    denominator_bound: int,
) -> list[list[Fraction]] | None:
    result: list[list[Fraction]] = []
    for vector in residues:
        fractions: list[Fraction] = []
        for residue in vector:
            value = rational_reconstruct(
                residue, modulus, numerator_bound, denominator_bound
            )
            if value is None:
                return None
            fractions.append(value)
        result.append(fractions)
    return result


def verify_rational_kernel(
    matrix_path: Path,
    header: SparseMatrixHeader,
    vectors: Sequence[Sequence[Fraction]],
) -> dict[str, object]:
    failures: list[dict[str, object]] = []
    nonzero_count = 0
    for row_index, row in enumerate(iter_sparse_matrix(matrix_path, header)):
        for vector_index, vector in enumerate(vectors):
            residual = sum(
                (Fraction(value) * vector[column] for column, value in row),
                Fraction(0),
            )
            if residual:
                nonzero_count += 1
                if len(failures) < 8:
                    failures.append(
                        {
                            "row": row_index,
                            "basisVector": vector_index,
                            "residual": str(residual),
                        }
                    )
    return {
        "passed": nonzero_count == 0,
        "nonzeroResidualCount": nonzero_count,
        "firstFailures": failures,
    }


def extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    """Return nonnegative g and x,y with x*left + y*right = g."""

    old_r, new_r = left, right
    old_s, new_s = 1, 0
    old_t, new_t = 0, 1
    while new_r:
        quotient = old_r // new_r
        old_r, new_r = new_r, old_r - quotient * new_r
        old_s, new_s = new_s, old_s - quotient * new_s
        old_t, new_t = new_t, old_t - quotient * new_t
    if old_r < 0:
        return -old_r, -old_s, -old_t
    return old_r, old_s, old_t


def multiply_square(left: Sequence[Sequence[int]], right: Sequence[Sequence[int]]) -> list[list[int]]:
    size = len(left)
    return [
        [sum(left[row][inner] * right[inner][column] for inner in range(size)) for column in range(size)]
        for row in range(size)
    ]


def congruence_kernel_basis(values: Sequence[int], modulus: int) -> list[list[int]]:
    """Give columns spanning {z in Z^k: values dot z == 0 mod modulus}."""

    size = len(values)
    transform = [[int(row == column) for column in range(size)] for row in range(size)]
    reduced = list(values)
    for column in range(1, size):
        left, right = reduced[0], reduced[column]
        gcd_value, x_coefficient, y_coefficient = extended_gcd(left, right)
        if gcd_value == 0:
            continue
        left_column = [transform[row][0] for row in range(size)]
        right_column = [transform[row][column] for row in range(size)]
        for row in range(size):
            transform[row][0] = x_coefficient * left_column[row] + y_coefficient * right_column[row]
            transform[row][column] = (
                -(right // gcd_value) * left_column[row]
                + (left // gcd_value) * right_column[row]
            )
        reduced[0], reduced[column] = gcd_value, 0
    image_gcd = math.gcd(abs(reduced[0]) if reduced else 0, modulus)
    index = modulus // image_gcd
    if size and index != 1:
        for row in range(size):
            transform[row][0] *= index
    return transform


def saturate_rational_graph_basis(
    vectors: Sequence[Sequence[Fraction]], pivot_rows: Sequence[int]
) -> tuple[list[list[int]], list[list[int]], dict[str, object]]:
    """Compute ``span_Q(vectors) intersect Z^n`` from an identity graph chart.

    If R is the n-by-k matrix of normalized rational columns, every vector in
    its rational span has a unique parameter z given by the pivot coordinates.
    Integral vectors are therefore exactly the z in Z^k satisfying one modular
    denominator congruence for every coordinate row of R.  The running square
    matrix below is a basis for that parameter lattice.
    """

    dimension = len(vectors)
    columns = len(vectors[0]) if vectors else 0
    expected_pivots = [
        [Fraction(int(row_index == column)) for column in range(dimension)]
        for row_index in range(dimension)
    ]
    actual_pivots = [
        [vectors[column][coordinate] for column in range(dimension)]
        for coordinate in pivot_rows
    ]
    if actual_pivots != expected_pivots:
        raise ValueError("rational reconstruction lost the identity graph chart")

    parameter_basis = [
        [int(row == column) for column in range(dimension)]
        for row in range(dimension)
    ]
    effective_constraints = 0
    for coordinate in range(columns):
        row = [vectors[column][coordinate] for column in range(dimension)]
        denominator = 1
        for value in row:
            denominator = math.lcm(denominator, value.denominator)
        if denominator == 1:
            continue
        numerators = [value.numerator * (denominator // value.denominator) for value in row]
        transformed = [
            sum(numerators[inner] * parameter_basis[inner][column] for inner in range(dimension))
            for column in range(dimension)
        ]
        if all(value % denominator == 0 for value in transformed):
            continue
        step = congruence_kernel_basis(transformed, denominator)
        parameter_basis = multiply_square(parameter_basis, step)
        effective_constraints += 1

    integral_vectors = [[0] * columns for _ in range(dimension)]
    for coordinate in range(columns):
        row = [vectors[column][coordinate] for column in range(dimension)]
        for new_column in range(dimension):
            value = sum(
                row[old_column] * parameter_basis[old_column][new_column]
                for old_column in range(dimension)
            )
            if value.denominator != 1:
                raise AssertionError("internal error: saturation left a nonintegral coordinate")
            integral_vectors[new_column][coordinate] = value.numerator
    return (
        integral_vectors,
        parameter_basis,
        {
            "method": "exact-coordinate-denominator-congruence-intersection",
            "effectiveConstraintCount": effective_constraints,
            "parameterLatticeIndex": str(abs(determinant_bareiss(parameter_basis))),
        },
    )


def determinant_bareiss(matrix: Sequence[Sequence[int]]) -> int:
    values = [list(row) for row in matrix]
    size = len(values)
    if size == 0:
        return 1
    sign = 1
    denominator = 1
    for column in range(size - 1):
        pivot = next((row for row in range(column, size) if values[row][column]), None)
        if pivot is None:
            return 0
        if pivot != column:
            values[column], values[pivot] = values[pivot], values[column]
            sign = -sign
        pivot_value = values[column][column]
        for row in range(column + 1, size):
            for target in range(column + 1, size):
                numerator = (
                    values[row][target] * pivot_value
                    - values[row][column] * values[column][target]
                )
                if numerator % denominator:
                    raise AssertionError("Bareiss division was not exact")
                values[row][target] = numerator // denominator
            values[row][column] = 0
        denominator = pivot_value
    return sign * values[-1][-1]


def invert_rational_matrix(matrix: Sequence[Sequence[int]]) -> list[list[Fraction]]:
    size = len(matrix)
    augmented = [
        [Fraction(value) for value in row]
        + [Fraction(int(row_index == column)) for column in range(size)]
        for row_index, row in enumerate(matrix)
    ]
    for column in range(size):
        pivot = next((row for row in range(column, size) if augmented[row][column]), None)
        if pivot is None:
            raise ValueError("parameter lattice basis is singular")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        pivot_value = augmented[column][column]
        augmented[column] = [value / pivot_value for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            if factor:
                augmented[row] = [
                    left - factor * right
                    for left, right in zip(augmented[row], augmented[column])
                ]
    return [row[size:] for row in augmented]


def recover_rational_graph_basis(
    integral_vectors: Sequence[Sequence[int]], parameter_basis: Sequence[Sequence[int]]
) -> list[list[Fraction]]:
    inverse = invert_rational_matrix(parameter_basis)
    dimension = len(integral_vectors)
    columns = len(integral_vectors[0]) if integral_vectors else 0
    rational = [[Fraction(0)] * columns for _ in range(dimension)]
    for coordinate in range(columns):
        integral_row = [integral_vectors[column][coordinate] for column in range(dimension)]
        for new_column in range(dimension):
            rational[new_column][coordinate] = sum(
                Fraction(integral_row[old_column]) * inverse[old_column][new_column]
                for old_column in range(dimension)
            )
    return rational


def verify_integer_kernel(
    matrix_path: Path,
    header: SparseMatrixHeader,
    vectors: Sequence[Sequence[int]],
) -> dict[str, object]:
    failures: list[dict[str, object]] = []
    nonzero_count = 0
    max_abs_residual = 0
    for row_index, row in enumerate(iter_sparse_matrix(matrix_path, header)):
        for vector_index, vector in enumerate(vectors):
            residual = sum(value * vector[column] for column, value in row)
            if residual:
                nonzero_count += 1
                max_abs_residual = max(max_abs_residual, abs(residual))
                if len(failures) < 8:
                    failures.append(
                        {
                            "row": row_index,
                            "basisVector": vector_index,
                            "residual": str(residual),
                        }
                    )
    return {
        "passed": nonzero_count == 0,
        "nonzeroResidualCount": nonzero_count,
        "maxAbsResidual": str(max_abs_residual),
        "firstFailures": failures,
    }


def residue_digest(vectors: Sequence[Sequence[int]], modulus: int) -> str:
    digest = hashlib.sha256()
    digest.update(f"{len(vectors)} {len(vectors[0]) if vectors else 0} {modulus}\n".encode())
    for index, vector in enumerate(vectors):
        digest.update(f"{index}".encode())
        for coordinate, value in enumerate(vector):
            if value % modulus:
                digest.update(f" {coordinate}:{value % modulus}".encode())
        digest.update(b"\n")
    return digest.hexdigest()


def write_integral_basis(path: Path, vectors: Sequence[Sequence[int]]) -> None:
    columns = len(vectors[0]) if vectors else 0
    with path.open("w", encoding="ascii", newline="\n") as stream:
        stream.write(f"{columns} {len(vectors)} Z\n")
        for index, vector in enumerate(vectors):
            entries = [(coordinate, value) for coordinate, value in enumerate(vector) if value]
            stream.write(f"{index} {len(entries)}")
            for coordinate, value in entries:
                stream.write(f" {coordinate} {value}")
            stream.write("\n")


def read_integral_basis(path: Path) -> list[list[int]]:
    with path.open("r", encoding="ascii") as stream:
        words = stream.readline().split()
        if len(words) != 3 or words[2] != "Z":
            raise ValueError(f"{path}: expected 'COLS NULLITY Z' header")
        columns, nullity = map(int, words[:2])
        vectors = [[0] * columns for _ in range(nullity)]
        seen: set[int] = set()
        for line_number, line in enumerate(stream, start=2):
            words = line.split()
            index, count = map(int, words[:2])
            if index in seen or not 0 <= index < nullity or len(words) != 2 + 2 * count:
                raise ValueError(f"{path}:{line_number}: malformed basis vector")
            seen.add(index)
            seen_coordinates: set[int] = set()
            for offset in range(count):
                coordinate = int(words[2 + 2 * offset])
                value = int(words[3 + 2 * offset])
                if not 0 <= coordinate < columns or coordinate in seen_coordinates:
                    raise ValueError(f"{path}:{line_number}: invalid coordinate")
                seen_coordinates.add(coordinate)
                vectors[index][coordinate] = value
        if len(seen) != nullity:
            raise ValueError(f"{path}: missing basis vectors")
    return vectors


def vector_statistics(vectors: Sequence[Sequence[int]]) -> list[dict[str, object]]:
    result = []
    for index, vector in enumerate(vectors):
        nonzero = [value for value in vector if value]
        result.append(
            {
                "basisVector": index,
                "nonzeroCount": len(nonzero),
                "maxAbsEntry": str(max(map(abs, nonzero), default=0)),
            }
        )
    return result


def run_lift(args: argparse.Namespace) -> int:
    matrix_path = Path(args.matrix)
    basis_paths = [Path(path) for path in args.basis]
    output_path = Path(args.output)
    certificate_path = Path(args.certificate)
    header = read_matrix_header(matrix_path)
    bases = [read_modular_basis(path) for path in basis_paths]
    if any(basis.columns != header.columns for basis in bases):
        raise ValueError("matrix and modular basis column counts disagree")
    first = bases[0]
    if any(basis.nullity != first.nullity for basis in bases):
        raise ValueError("modular nullities disagree across primes")
    if len({basis.prime for basis in bases}) != len(bases):
        raise ValueError("duplicate modular prime")

    pivot_rows = first_independent_coordinate_rows(first)
    normalized_inputs: list[tuple[int, list[list[int]]]] = []
    input_records: list[dict[str, object]] = []
    for basis in bases:
        modular_replay = verify_modular_kernel(
            matrix_path, header, basis.vectors, basis.prime
        )
        normalized, transform = normalize_basis(basis, pivot_rows)
        normalized_inputs.append((basis.prime, normalized))
        input_records.append(
            {
                "path": display_path(basis.path),
                "sha256": sha256_file(basis.path),
                "prime": basis.prime,
                "rank": basis.rank,
                "nullity": basis.nullity,
                "modularKernelReplay": modular_replay,
                "graphChartTransform": transform,
                "normalizedResidueSha256": residue_digest(normalized, basis.prime),
            }
        )
    if not all(record["modularKernelReplay"]["passed"] for record in input_records):  # type: ignore[index]
        raise ValueError("at least one input is not a modular kernel basis")

    modulus, residues = combine_crt(normalized_inputs)
    default_bound = math.isqrt((modulus - 1) // 2)
    numerator_bound = args.numerator_bound or default_bound
    denominator_bound = args.denominator_bound or default_bound
    attempts: list[dict[str, object]] = []
    selected_method: str | None = None
    selected_vectors: list[list[int]] | None = None
    parameter_basis: list[list[int]] | None = None
    saturation_record: dict[str, object] | None = None

    symmetric = symmetric_candidate(residues, modulus)
    symmetric_replay = verify_integer_kernel(matrix_path, header, symmetric)
    attempts.append({"method": "symmetric-residue", "exactReplay": symmetric_replay})
    if symmetric_replay["passed"]:
        rational_symmetric = [
            [Fraction(value) for value in vector] for vector in symmetric
        ]
        selected_vectors, parameter_basis, saturation_record = saturate_rational_graph_basis(
            rational_symmetric, pivot_rows
        )
        selected_method = "symmetric-residue"
    else:
        rational = rational_candidate(
            residues, modulus, numerator_bound, denominator_bound
        )
        if rational is None:
            attempts.append(
                {
                    "method": "rational-reconstruction",
                    "bounds": {
                        "numerator": str(numerator_bound),
                        "denominator": str(denominator_bound),
                    },
                    "reconstructed": False,
                }
            )
        else:
            rational_replay = verify_rational_kernel(matrix_path, header, rational)
            attempts.append(
                {
                    "method": "rational-reconstruction",
                    "bounds": {
                        "numerator": str(numerator_bound),
                        "denominator": str(denominator_bound),
                    },
                    "reconstructed": True,
                    "exactReplay": rational_replay,
                }
            )
            if rational_replay["passed"]:
                selected_vectors, parameter_basis, saturation_record = saturate_rational_graph_basis(
                    rational, pivot_rows
                )
                selected_method = "rational-reconstruction"

    certificate: dict[str, object] = {
        "schema": SCHEMA,
        "status": (
            "verified-saturated-frame-in-reconstructed-rational-subspace"
            if selected_vectors is not None
            else "insufficient-modulus"
        ),
        "matrix": {
            "path": display_path(matrix_path),
            "sha256": sha256_file(matrix_path),
            "rows": header.rows,
            "columns": header.columns,
        },
        "modularInputs": input_records,
        "normalization": {
            "kind": "lexicographically-first-coordinate-minor-to-identity",
            "pivotRows": pivot_rows,
        },
        "combinedModulus": str(modulus),
        "combinedResidueSha256": residue_digest(residues, modulus),
        "reconstructionAttempts": attempts,
        "selectedMethod": selected_method,
        "ambientRationalKernelCompleteness": {
            "certifiedHere": False,
            "reason": (
                "Kernel replay and saturation certify the integral lattice inside the "
                "reconstructed rational span. Equality with the full rational kernel "
                "requires a separate rational-nullity upper bound (equivalently, "
                "a rational-rank lower bound)."
            ),
        },
    }
    if args.preparation_digest or args.core_matrix_digest or args.ledger_digest:
        if not (args.preparation_digest and args.core_matrix_digest and args.ledger_digest):
            raise ValueError("all three source-binding digests must be supplied together")
        certificate["sourceBinding"] = {
            "preparationDigest": args.preparation_digest,
            "coreMatrixDigest": args.core_matrix_digest,
            "ledgerDigest": args.ledger_digest,
        }
    if selected_vectors is not None:
        assert parameter_basis is not None and saturation_record is not None
        output_path.parent.mkdir(parents=True, exist_ok=True)
        write_integral_basis(output_path, selected_vectors)
        certificate["integralKernelFrame"] = {
            "path": display_path(output_path),
            "sha256": sha256_file(output_path),
            "statistics": vector_statistics(selected_vectors),
            "exactKernelReplay": verify_integer_kernel(
                matrix_path, header, selected_vectors
            ),
            "rationalGraphChartParameterBasis": parameter_basis,
            "saturation": saturation_record,
        }
    certificate_path.parent.mkdir(parents=True, exist_ok=True)
    with certificate_path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(certificate, stream, indent=2, sort_keys=True)
        stream.write("\n")
    print(json.dumps({"status": certificate["status"], "certificate": display_path(certificate_path)}))
    return 0 if selected_vectors is not None else 3


def resolve_recorded_path(recorded: str, certificate_path: Path) -> Path:
    path = Path(recorded)
    if path.is_absolute():
        return path
    cwd_candidate = Path.cwd() / path
    if cwd_candidate.exists():
        return cwd_candidate
    return certificate_path.parent / path


def run_replay(args: argparse.Namespace) -> int:
    certificate_path = Path(args.certificate)
    certificate = json.loads(certificate_path.read_text(encoding="utf-8"))
    if (
        certificate.get("schema") != SCHEMA
        or certificate.get("status")
        != "verified-saturated-frame-in-reconstructed-rational-subspace"
    ):
        raise ValueError("certificate is not a verified modular-kernel frame")
    matrix_record = certificate["matrix"]
    basis_record = certificate["integralKernelFrame"]
    matrix_path = resolve_recorded_path(matrix_record["path"], certificate_path)
    basis_path = resolve_recorded_path(basis_record["path"], certificate_path)
    if sha256_file(matrix_path) != matrix_record["sha256"]:
        raise ValueError("matrix SHA-256 mismatch")
    if sha256_file(basis_path) != basis_record["sha256"]:
        raise ValueError("integral-basis SHA-256 mismatch")
    header = read_matrix_header(matrix_path)
    vectors = read_integral_basis(basis_path)
    if any(len(vector) != header.columns for vector in vectors):
        raise ValueError("integral frame and matrix ambient dimensions disagree")
    if len(vectors) != len(certificate["normalization"]["pivotRows"]):
        raise ValueError("integral basis dimension does not match certificate")
    replay = verify_integer_kernel(matrix_path, header, vectors)
    if not replay["passed"]:
        raise ValueError(f"exact integral replay failed: {replay}")
    parameter_basis = basis_record["rationalGraphChartParameterBasis"]
    rational = recover_rational_graph_basis(vectors, parameter_basis)
    rational_replay = verify_rational_kernel(matrix_path, header, rational)
    if not rational_replay["passed"]:
        raise ValueError(f"recovered rational graph basis replay failed: {rational_replay}")
    saturated_vectors, replay_parameter_basis, replay_saturation = saturate_rational_graph_basis(
        rational, certificate["normalization"]["pivotRows"]
    )
    if replay_parameter_basis != parameter_basis or saturated_vectors != vectors:
        raise ValueError("saturation replay does not reproduce the recorded frame")
    print(
        json.dumps(
            {
                "status": "verified-saturated-frame-in-reconstructed-rational-subspace",
                "matrixSha256": matrix_record["sha256"],
                "integralKernelFrameSha256": basis_record["sha256"],
                "exactKernelReplay": replay,
                "exactRationalGraphReplay": rational_replay,
                "saturationReplay": replay_saturation,
            },
            sort_keys=True,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    lift = subparsers.add_parser("lift", help="normalize, CRT, reconstruct, and replay")
    lift.add_argument("--matrix", required=True)
    lift.add_argument("--basis", action="append", required=True)
    lift.add_argument("--output", required=True)
    lift.add_argument("--certificate", required=True)
    lift.add_argument("--numerator-bound", type=int)
    lift.add_argument("--denominator-bound", type=int)
    lift.add_argument("--preparation-digest")
    lift.add_argument("--core-matrix-digest")
    lift.add_argument("--ledger-digest")
    lift.set_defaults(run=run_lift)
    replay = subparsers.add_parser("replay", help="hash-check and replay a verified lift")
    replay.add_argument("--certificate", required=True)
    replay.set_defaults(run=run_replay)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.run(args)
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
