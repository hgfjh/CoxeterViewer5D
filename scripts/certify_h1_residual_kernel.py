#!/usr/bin/env python3
"""Certify an exact saturated integer kernel of a sparse H1 residual matrix.

The input matrix uses LinBox's sparse-row format.  The modular-kernel input is
the sparse output of the companion exact LinBox elimination: its first line is

    column_count nullity prime rank

and each following line is ``basis_index nnz column value ...``.  The checker
replays every row both modulo the stated prime and over the integers.  It then
saturates the lifted lattice by exact mod-2 descent and requires a unimodular
coordinate minor.  The latter proves that the resulting lattice is primitive
in the ambient integer lattice.

The reported finite-field rank comes from exact LinBox Gaussian elimination,
not a floating-point or randomized rank estimate.  Combined with the replayed
independent integer kernel, it proves the characteristic-zero nullity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


BACKEND = "h1ResidualKernelExactChecker"
BACKEND_VERSION = "1.0.0"


class CertificateError(ValueError):
    """Raised when an exact witness fails replay."""


@dataclass(frozen=True)
class SparseMatrix:
    rows: tuple[tuple[tuple[int, int], ...], ...]
    column_count: int
    nonzero_count: int


@dataclass(frozen=True)
class ModularKernel:
    vectors: tuple[dict[int, int], ...]
    column_count: int
    prime: int
    reported_rank: int


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_prime(value: int) -> bool:
    if value < 2:
        return False
    divisor = 2
    while divisor * divisor <= value:
        if value % divisor == 0:
            return value == divisor
        divisor += 1 if divisor == 2 else 2
    return True


def read_sparse_matrix(path: Path) -> SparseMatrix:
    with path.open("r", encoding="ascii") as stream:
        header = stream.readline().split()
        if len(header) != 3 or header[2] != "S":
            raise CertificateError(f"Unexpected sparse-matrix header: {header!r}.")
        row_count, column_count = map(int, header[:2])
        rows: list[tuple[tuple[int, int], ...]] = []
        nonzero_count = 0
        for row_index, line in enumerate(stream):
            tokens = list(map(int, line.split()))
            entries = tuple(zip(tokens[1::2], tokens[2::2]))
            if not tokens or tokens[0] != len(entries) or len(tokens) != 1 + 2 * len(entries):
                raise CertificateError(f"Malformed sparse row {row_index}.")
            if any(column < 0 or column >= column_count for column, _ in entries):
                raise CertificateError(f"Out-of-range column in sparse row {row_index}.")
            rows.append(entries)
            nonzero_count += len(entries)
    if len(rows) != row_count:
        raise CertificateError(f"Expected {row_count} rows; found {len(rows)}.")
    return SparseMatrix(tuple(rows), column_count, nonzero_count)


def read_modular_kernel(path: Path) -> ModularKernel:
    with path.open("r", encoding="ascii") as stream:
        header = list(map(int, stream.readline().split()))
        if len(header) != 4:
            raise CertificateError("The modular-kernel header must have four integers.")
        column_count, nullity, prime, reported_rank = header
        vectors: list[dict[int, int]] = []
        for expected_basis, line in enumerate(stream):
            tokens = list(map(int, line.split()))
            if (
                len(tokens) < 2
                or tokens[0] != expected_basis
                or len(tokens) != 2 + 2 * tokens[1]
            ):
                raise CertificateError(f"Malformed modular vector {expected_basis}.")
            vector = dict(zip(tokens[2::2], tokens[3::2]))
            if len(vector) != tokens[1]:
                raise CertificateError(f"Duplicate coordinate in modular vector {expected_basis}.")
            if any(column < 0 or column >= column_count for column in vector):
                raise CertificateError(f"Out-of-range coordinate in modular vector {expected_basis}.")
            vectors.append(vector)
    if len(vectors) != nullity:
        raise CertificateError(f"Expected {nullity} modular vectors; found {len(vectors)}.")
    if not is_prime(prime):
        raise CertificateError(f"The stated modulus {prime} is not prime.")
    if reported_rank + nullity != column_count:
        raise CertificateError("Reported rank and nullity do not sum to the column count.")
    return ModularKernel(tuple(vectors), column_count, prime, reported_rank)


def centered_residue(value: int, prime: int) -> int:
    residue = value % prime
    return residue - prime if residue > prime // 2 else residue


def replay(
    matrix: SparseMatrix, vectors: Iterable[dict[int, int]], modulus: int | None = None
) -> tuple[list[int], list[int]]:
    materialized = tuple(vectors)
    failures = [0] * len(materialized)
    maxima = [0] * len(materialized)
    for row in matrix.rows:
        for basis, vector in enumerate(materialized):
            residual = sum(coefficient * vector.get(column, 0) for column, coefficient in row)
            if modulus is not None:
                residual %= modulus
            maxima[basis] = max(maxima[basis], abs(residual))
            if residual:
                failures[basis] += 1
    return failures, maxima


def coordinate_mask(vectors: list[dict[int, int]], column: int) -> int:
    return sum(
        (1 << basis) for basis, vector in enumerate(vectors) if vector.get(column, 0) & 1
    )


def mod2_row_basis(
    vectors: list[dict[int, int]], column_count: int
) -> list[tuple[int, int]]:
    echelon: dict[int, tuple[int, int]] = {}
    for column in range(column_count):
        reduced = coordinate_mask(vectors, column)
        while reduced:
            pivot = reduced.bit_length() - 1
            if pivot not in echelon:
                echelon[pivot] = (reduced, column)
                break
            reduced ^= echelon[pivot][0]
    return list(echelon.values())


def mod2_dependency(rows: list[tuple[int, int]], rank: int) -> int:
    for candidate in range(1, 1 << rank):
        if all((mask & candidate).bit_count() % 2 == 0 for mask, _ in rows):
            return candidate
    return 0


def bareiss_determinant(matrix: list[list[int]]) -> int:
    size = len(matrix)
    if any(len(row) != size for row in matrix):
        raise CertificateError("Determinant input is not square.")
    work = [row[:] for row in matrix]
    sign = 1
    previous = 1
    for pivot_index in range(size - 1):
        pivot_row = next(
            (row for row in range(pivot_index, size) if work[row][pivot_index]), None
        )
        if pivot_row is None:
            return 0
        if pivot_row != pivot_index:
            work[pivot_index], work[pivot_row] = work[pivot_row], work[pivot_index]
            sign *= -1
        pivot = work[pivot_index][pivot_index]
        for row in range(pivot_index + 1, size):
            for column in range(pivot_index + 1, size):
                numerator = work[row][column] * pivot - work[row][pivot_index] * work[pivot_index][column]
                if numerator % previous:
                    raise CertificateError("Bareiss division was not exact.")
                work[row][column] = numerator // previous
        previous = pivot
    return sign * work[-1][-1] if size else 1


def certify(
    matrix_path: Path,
    modular_path: Path,
    vectors_output: Path,
    certificate_output: Path,
    lift_factor: int = 2,
) -> dict[str, Any]:
    matrix = read_sparse_matrix(matrix_path)
    modular = read_modular_kernel(modular_path)
    if modular.column_count != matrix.column_count:
        raise CertificateError("Matrix and modular-kernel column counts differ.")
    modular_failures, _ = replay(matrix, modular.vectors, modular.prime)
    if any(modular_failures):
        raise CertificateError(f"Modular-kernel replay failed: {modular_failures}.")

    vectors = [
        {
            column: centered_residue(lift_factor * value, modular.prime)
            for column, value in vector.items()
        }
        for vector in modular.vectors
    ]
    integer_failures, integer_maxima = replay(matrix, vectors)
    if any(integer_failures):
        raise CertificateError(f"Centered integer lift failed replay: {integer_failures}.")

    rank = len(vectors)
    singleton_columns = [-1] * rank
    singleton_values = [0] * rank
    for column in range(matrix.column_count):
        support = [
            (basis, vector[column])
            for basis, vector in enumerate(vectors)
            if vector.get(column, 0)
        ]
        if len(support) == 1:
            basis, value = support[0]
            if abs(value) == lift_factor and singleton_columns[basis] < 0:
                singleton_columns[basis] = column
                singleton_values[basis] = value
    if any(column < 0 for column in singleton_columns):
        raise CertificateError("No diagonal independence minor was found for the lifted vectors.")

    steps: list[dict[str, Any]] = []
    while True:
        row_basis = mod2_row_basis(vectors, matrix.column_count)
        if len(row_basis) == rank:
            break
        relation = mod2_dependency(row_basis, rank)
        if not relation:
            raise CertificateError("Could not find a mod-2 dependency.")
        selected = [basis for basis in range(rank) if relation & (1 << basis)]
        replacement = selected[-1]
        support = set().union(*(vectors[basis] for basis in selected))
        new_vector: dict[int, int] = {}
        for column in support:
            numerator = sum(vectors[basis].get(column, 0) for basis in selected)
            if numerator & 1:
                raise CertificateError("A mod-2 dependence had an odd coordinate sum.")
            value = numerator // 2
            if value:
                new_vector[column] = value
        steps.append(
            {
                "step": len(steps),
                "mod2RankBefore": len(row_basis),
                "selectedBasisIndices": selected,
                "replacedBasisIndex": replacement,
                "verifiedCoordinatewiseEvenNumerator": True,
            }
        )
        vectors[replacement] = new_vector

    final_rows = mod2_row_basis(vectors, matrix.column_count)
    minor_columns = [column for _mask, column in final_rows]
    minor = [
        [vectors[basis].get(column, 0) for basis in range(rank)]
        for column in minor_columns
    ]
    determinant = bareiss_determinant(minor)
    if abs(determinant) != 1:
        raise CertificateError(f"The final coordinate minor is not unimodular: {determinant}.")
    saturated_failures, saturated_maxima = replay(matrix, vectors)
    if any(saturated_failures):
        raise CertificateError(f"Saturated-kernel replay failed: {saturated_failures}.")

    vectors_payload = {
        "schemaVersion": 1,
        "kind": "saturated-exact-integer-kernel-basis-for-h1-residual",
        "matrix": {"rows": len(matrix.rows), "columns": matrix.column_count},
        "vectors": [
            {"basisIndex": basis, "entries": sorted(vector.items())}
            for basis, vector in enumerate(vectors)
        ],
    }
    vectors_output.parent.mkdir(parents=True, exist_ok=True)
    vectors_output.write_text(
        json.dumps(vectors_payload, separators=(",", ":")) + "\n", encoding="utf8"
    )

    certificate: dict[str, Any] = {
        "schemaVersion": 1,
        "kind": "exact-saturated-h1-residual-kernel-certificate",
        "checker": {"backend": BACKEND, "version": BACKEND_VERSION},
        "claim": {
            "rankOverQ": modular.reported_rank,
            "nullityOverQ": rank,
            "integerKernelRank": rank,
            "integerKernelSaturated": True,
        },
        "matrix": {
            "path": matrix_path.as_posix(),
            "sha256": file_sha256(matrix_path),
            "rows": len(matrix.rows),
            "columns": matrix.column_count,
            "nonzeroCount": matrix.nonzero_count,
        },
        "modularRankWitness": {
            "path": modular_path.as_posix(),
            "sha256": file_sha256(modular_path),
            "method": "LinBox GaussDomain::InPlaceLinearPivoting over an exact prime field",
            "prime": modular.prime,
            "reportedRank": modular.reported_rank,
            "reportedNullity": rank,
            "primeValidated": True,
            "kernelReplayFailureRows": modular_failures,
        },
        "integerLift": {
            "liftFactor": lift_factor,
            "failureRows": integer_failures,
            "maximumAbsoluteResiduals": integer_maxima,
            "independenceMinorColumns": singleton_columns,
            "independenceMinorDiagonal": singleton_values,
        },
        "saturation": {
            "prime": 2,
            "steps": steps,
            "finalMod2Rank": len(final_rows),
            "unimodularMinorColumns": minor_columns,
            "unimodularMinorDeterminant": determinant,
            "argument": (
                "Every descent step adjoins half of a coordinatewise-even integer-kernel combination. "
                "The final basis has a coordinate minor of determinant +/-1, so its span is primitive in Z^n. "
                "It is therefore the full integer kernel because the exact modular rank bounds the Q-nullity by the same rank."
            ),
        },
        "saturatedBasis": {
            "path": vectors_output.as_posix(),
            "sha256": file_sha256(vectors_output),
            "supportSizes": [len(vector) for vector in vectors],
            "maximumAbsoluteCoefficients": [
                max(map(abs, vector.values()), default=0) for vector in vectors
            ],
            "failureRows": saturated_failures,
            "maximumAbsoluteResiduals": saturated_maxima,
        },
    }
    certificate_output.parent.mkdir(parents=True, exist_ok=True)
    certificate_output.write_text(json.dumps(certificate, indent=2) + "\n", encoding="utf8")
    return certificate


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("matrix", type=Path)
    parser.add_argument("modular_kernel", type=Path)
    parser.add_argument("vectors_output", type=Path)
    parser.add_argument("certificate_output", type=Path)
    parser.add_argument("--lift-factor", type=int, default=2)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        certificate = certify(
            args.matrix,
            args.modular_kernel,
            args.vectors_output,
            args.certificate_output,
            args.lift_factor,
        )
    except (CertificateError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1
    print(json.dumps({"ok": True, "claim": certificate["claim"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
