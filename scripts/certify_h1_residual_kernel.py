#!/usr/bin/env python3
"""Certify an exact saturated integer kernel of a sparse H1 residual matrix.

The input matrix uses LinBox's sparse-row format.  The modular-kernel input is
the sparse output of the companion exact LinBox elimination: its first line is

    column_count nullity prime rank

and each following line is ``basis_index nnz column value ...``.  The checker
replays every row both modulo the stated prime and over the integers.  It then
saturates the lifted lattice by exact p-adic descent.  Primitivity is certified
from the determinantal divisor: for every prime dividing one selected nonzero
maximal minor, the final coordinate matrix must have full rank modulo that
prime.

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
BACKEND_VERSION = "1.1.0"


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
            if (
                not tokens
                or tokens[0] != len(entries)
                or len(tokens) != 1 + 2 * len(entries)
            ):
                raise CertificateError(f"Malformed sparse row {row_index}.")
            if any(column < 0 or column >= column_count for column, _ in entries):
                raise CertificateError(
                    f"Out-of-range column in sparse row {row_index}."
                )
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
                raise CertificateError(
                    f"Duplicate coordinate in modular vector {expected_basis}."
                )
            if any(column < 0 or column >= column_count for column in vector):
                raise CertificateError(
                    f"Out-of-range coordinate in modular vector {expected_basis}."
                )
            vectors.append(vector)
    if len(vectors) != nullity:
        raise CertificateError(
            f"Expected {nullity} modular vectors; found {len(vectors)}."
        )
    if not is_prime(prime):
        raise CertificateError(f"The stated modulus {prime} is not prime.")
    if reported_rank + nullity != column_count:
        raise CertificateError(
            "Reported rank and nullity do not sum to the column count."
        )
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
            residual = sum(
                coefficient * vector.get(column, 0) for column, coefficient in row
            )
            if modulus is not None:
                residual %= modulus
            maxima[basis] = max(maxima[basis], abs(residual))
            if residual:
                failures[basis] += 1
    return failures, maxima


def coordinate_mask(vectors: list[dict[int, int]], column: int) -> int:
    return sum(
        (1 << basis)
        for basis, vector in enumerate(vectors)
        if vector.get(column, 0) & 1
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


def modp_row_basis(
    vectors: list[dict[int, int]], column_count: int, prime: int
) -> dict[int, tuple[list[int], int]]:
    """Return a row-echelon basis for the coordinate rows modulo ``prime``.

    The input vectors are the columns of an ambient-coordinate matrix.  A
    rank drop here is exactly a mod-p dependence among the lattice basis
    vectors, hence an index-p enlargement of their integral span.
    """

    echelon: dict[int, tuple[list[int], int]] = {}
    rank = len(vectors)
    for column in range(column_count):
        row = [vector.get(column, 0) % prime for vector in vectors]
        for pivot in sorted(echelon):
            coefficient = row[pivot]
            if coefficient:
                pivot_row = echelon[pivot][0]
                row = [
                    (value - coefficient * pivot_value) % prime
                    for value, pivot_value in zip(row, pivot_row)
                ]
        pivot = next((index for index, value in enumerate(row) if value), None)
        if pivot is None:
            continue
        inverse = pow(row[pivot], prime - 2, prime)
        row = [(value * inverse) % prime for value in row]
        echelon[pivot] = (row, column)
        if len(echelon) == rank:
            break
    return echelon


def modp_dependency(
    echelon: dict[int, tuple[list[int], int]], rank: int, prime: int
) -> list[int]:
    """Find one nonzero right-kernel vector for a deficient echelon form."""

    free = next((index for index in range(rank) if index not in echelon), None)
    if free is None:
        return []
    dependency = [0] * rank
    dependency[free] = 1
    for pivot in sorted(echelon, reverse=True):
        row = echelon[pivot][0]
        dependency[pivot] = (
            -sum(row[column] * dependency[column] for column in range(pivot + 1, rank))
            % prime
        )
    return dependency


def prime_factors(value: int) -> list[int]:
    """Return the distinct prime factors of a positive integer."""

    factors: list[int] = []
    divisor = 2
    while divisor * divisor <= value:
        if value % divisor == 0:
            factors.append(divisor)
            while value % divisor == 0:
                value //= divisor
        divisor = 3 if divisor == 2 else divisor + 2
    if value > 1:
        factors.append(value)
    return factors


def enlarge_lattice_at_prime(
    vectors: list[dict[int, int]], relation: list[int], prime: int
) -> tuple[int, list[int]]:
    """Adjoin a p-division witness and return the replaced basis index.

    We normalize the replaced coefficient to one modulo p.  Consequently the
    old lattice is contained in the new one with exact index p, rather than
    merely producing another rational basis of the same kernel.
    """

    replacement = max(
        index for index, coefficient in enumerate(relation) if coefficient
    )
    scale = pow(relation[replacement], prime - 2, prime)
    normalized = [(coefficient * scale) % prime for coefficient in relation]
    normalized = [
        coefficient - prime if coefficient > prime // 2 else coefficient
        for coefficient in normalized
    ]
    if normalized[replacement] != 1:
        # The centered representative of 1 is always 1, including p=2.
        raise CertificateError("Could not normalize a p-descent relation.")
    support = set().union(
        *(vectors[basis] for basis, coefficient in enumerate(normalized) if coefficient)
    )
    new_vector: dict[int, int] = {}
    for column in support:
        numerator = sum(
            coefficient * vectors[basis].get(column, 0)
            for basis, coefficient in enumerate(normalized)
        )
        if numerator % prime:
            raise CertificateError(
                "A mod-p dependence was not coordinatewise divisible."
            )
        value = numerator // prime
        if value:
            new_vector[column] = value
    vectors[replacement] = new_vector
    return replacement, normalized


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
                numerator = (
                    work[row][column] * pivot
                    - work[row][pivot_index] * work[pivot_index][column]
                )
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
        raise CertificateError(
            f"Centered integer lift failed replay: {integer_failures}."
        )

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
    independence_echelon = modp_row_basis(vectors, matrix.column_count, modular.prime)
    if len(independence_echelon) != rank:
        raise CertificateError(
            "The lifted vectors are not independent modulo the rank prime."
        )
    independence_columns = [
        independence_echelon[pivot][1] for pivot in sorted(independence_echelon)
    ]
    independence_minor = [
        [vectors[basis].get(column, 0) for basis in range(rank)]
        for column in independence_columns
    ]
    independence_determinant = bareiss_determinant(independence_minor)
    if independence_determinant == 0:
        raise CertificateError("The lifted independence minor is singular over Z.")

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
                "prime": 2,
                "mod2RankBefore": len(row_basis),
                "selectedBasisIndices": selected,
                "replacedBasisIndex": replacement,
                "verifiedCoordinatewiseEvenNumerator": True,
            }
        )
        vectors[replacement] = new_vector

    final_rows = mod2_row_basis(vectors, matrix.column_count)
    minor_columns = [column for _mask, column in final_rows]
    prime_rank_witnesses: list[dict[str, Any]] = []
    primitive_prime_checks: list[dict[str, Any]] = []
    while True:
        minor = [
            [vectors[basis].get(column, 0) for basis in range(rank)]
            for column in minor_columns
        ]
        determinant = bareiss_determinant(minor)
        if determinant == 0:
            raise CertificateError("The selected saturation minor became singular.")
        if abs(determinant) == 1:
            primitive_prime_checks = []
            break

        descended = False
        for prime in prime_factors(abs(determinant)):
            echelon = modp_row_basis(vectors, matrix.column_count, prime)
            prime_rank_witnesses.append(
                {
                    "prime": prime,
                    "rank": len(echelon),
                    "pivotColumns": [echelon[pivot][1] for pivot in sorted(echelon)],
                }
            )
            if len(echelon) == rank:
                continue
            relation = modp_dependency(echelon, rank, prime)
            if not relation:
                raise CertificateError("Could not find a deficient-prime dependence.")
            replacement, normalized = enlarge_lattice_at_prime(vectors, relation, prime)
            steps.append(
                {
                    "step": len(steps),
                    "prime": prime,
                    "rankBefore": len(echelon),
                    "relationCoefficients": normalized,
                    "selectedBasisIndices": [
                        basis
                        for basis, coefficient in enumerate(normalized)
                        if coefficient
                    ],
                    "replacedBasisIndex": replacement,
                    "verifiedCoordinatewiseDivisibleNumerator": True,
                }
            )
            descended = True
            break
        if not descended:
            # Every prime that could divide the determinantal divisor divides
            # this selected nonzero maximal minor.  Full coordinate rank at
            # each such prime proves that none divides every maximal minor.
            primitive_prime_checks = [
                witness
                for witness in prime_rank_witnesses[
                    -len(prime_factors(abs(determinant))) :
                ]
            ]
            if any(witness["rank"] != rank for witness in primitive_prime_checks):
                raise CertificateError("The determinantal-divisor proof is incomplete.")
            break
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
            "independenceMinorColumns": independence_columns,
            "independenceMinorDeterminant": independence_determinant,
            "singletonMinorColumns": singleton_columns,
            "singletonMinorDiagonal": singleton_values,
        },
        "saturation": {
            "primes": sorted({step["prime"] for step in steps}),
            "steps": steps,
            "finalMod2Rank": len(final_rows),
            "primeRankWitnesses": prime_rank_witnesses,
            "unimodularMinorColumns": minor_columns if abs(determinant) == 1 else None,
            "unimodularMinorDeterminant": determinant
            if abs(determinant) == 1
            else None,
            "determinantalDivisorProof": {
                "selectedMinorColumns": minor_columns,
                "selectedMinorDeterminant": determinant,
                "primeDivisors": prime_factors(abs(determinant)),
                "fullCoordinateRankWitnesses": primitive_prime_checks,
            },
            "argument": (
                "Every p-descent step adjoins a coordinatewise p-divisible integer-kernel combination and enlarges the lattice by index p. "
                "Every prime that could divide the final determinantal divisor divides the selected nonzero maximal minor; full coordinate rank modulo each such prime proves that none divides every maximal minor. "
                "The final lattice is therefore primitive in Z^n and is the full integer kernel because the exact modular rank bounds the Q-nullity by the same rank."
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
    certificate_output.write_text(
        json.dumps(certificate, indent=2) + "\n", encoding="utf8"
    )
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
