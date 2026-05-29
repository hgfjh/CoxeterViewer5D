#!/usr/bin/env python3
"""Exact certificate checker for the Makarov compact Coxeter 5-prism.

The certificate scope is intentionally narrow.  It checks the bundled
``compact_5_prism_makarov.json`` transcription against Bredon--Kellerhals,
Example 8: the rank-seven prism based on [5,3,3,3,3] with one dotted edge whose
distance l satisfies

    cosh(l) = 1/2 * sqrt((7 + sqrt(5)) / 2).

It also computes the exact normal Gram rank/signature over
Q(sqrt(5), sqrt((7 + sqrt(5)) / 2)).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any


BACKEND = "compact5PrismMakarovExactChecker"
BACKEND_VERSION = "1.0.0"
SOURCE_REF_ID = "bredon-kellerhals-2022-prism"
CANONICAL_COMMAND = (
    "python scripts/certify_compact_5_prism.py "
    "public/examples/compact_5_prism_makarov.json"
)

EXPECTED_RANK = 7
EXPECTED_DIMENSION = 5
EXPECTED_GENERATOR_IDS = [f"p{i}" for i in range(EXPECTED_RANK)]
EXPECTED_COXETER_MATRIX: list[list[int | str]] = [
    [1, 5, 2, 2, 2, 2, 2],
    [5, 1, 3, 2, 2, 2, 2],
    [2, 3, 1, 3, 2, 2, 2],
    [2, 2, 3, 1, 3, 2, 2],
    [2, 2, 2, 3, 1, 3, 2],
    [2, 2, 2, 2, 3, 1, "inf"],
    [2, 2, 2, 2, 2, "inf", 1],
]

DOTTED_PAIR = (5, 6)
DOTTED_MIN_POLY = [16, 0, -28, 0, 11]
DOTTED_INTERVAL = [1.0744, 1.0745]


@dataclass(frozen=True)
class Algebraic4:
    """Element of Q(r, s), with r^2 = 5 and s^2 = (7 + r) / 2."""

    c0: Fraction = Fraction(0)
    c1: Fraction = Fraction(0)
    c2: Fraction = Fraction(0)
    c3: Fraction = Fraction(0)

    @staticmethod
    def rational(value: int | Fraction) -> "Algebraic4":
        return Algebraic4(Fraction(value))

    @property
    def coefficients(self) -> tuple[Fraction, Fraction, Fraction, Fraction]:
        return (self.c0, self.c1, self.c2, self.c3)

    def __add__(self, other: object) -> "Algebraic4":
        rhs = coerce_algebraic4(other)
        return Algebraic4(
            self.c0 + rhs.c0,
            self.c1 + rhs.c1,
            self.c2 + rhs.c2,
            self.c3 + rhs.c3,
        )

    __radd__ = __add__

    def __neg__(self) -> "Algebraic4":
        return Algebraic4(-self.c0, -self.c1, -self.c2, -self.c3)

    def __sub__(self, other: object) -> "Algebraic4":
        return self + (-coerce_algebraic4(other))

    def __rsub__(self, other: object) -> "Algebraic4":
        return coerce_algebraic4(other) + (-self)

    def __mul__(self, other: object) -> "Algebraic4":
        rhs = coerce_algebraic4(other)
        out = [Fraction(0), Fraction(0), Fraction(0), Fraction(0)]

        def add_product(i: int, j: int, coefficient: Fraction) -> None:
            left, right = sorted((i, j))
            if (left, right) == (0, 0):
                out[0] += coefficient
            elif (left, right) == (0, 1):
                out[1] += coefficient
            elif (left, right) == (0, 2):
                out[2] += coefficient
            elif (left, right) == (0, 3):
                out[3] += coefficient
            elif (left, right) == (1, 1):
                out[0] += 5 * coefficient
            elif (left, right) == (1, 2):
                out[3] += coefficient
            elif (left, right) == (1, 3):
                out[2] += 5 * coefficient
            elif (left, right) == (2, 2):
                out[0] += Fraction(7, 2) * coefficient
                out[1] += Fraction(1, 2) * coefficient
            elif (left, right) == (2, 3):
                out[0] += Fraction(5, 2) * coefficient
                out[1] += Fraction(7, 2) * coefficient
            elif (left, right) == (3, 3):
                out[0] += Fraction(35, 2) * coefficient
                out[1] += Fraction(5, 2) * coefficient
            else:  # pragma: no cover
                raise AssertionError((left, right))

        for i, left in enumerate(self.coefficients):
            if left == 0:
                continue
            for j, right in enumerate(rhs.coefficients):
                if right != 0:
                    add_product(i, j, left * right)

        return Algebraic4(*out)

    __rmul__ = __mul__

    def __truediv__(self, other: object) -> "Algebraic4":
        return self * coerce_algebraic4(other).inverse()

    def is_zero(self) -> bool:
        return all(coefficient == 0 for coefficient in self.coefficients)

    def inverse(self) -> "Algebraic4":
        if self.is_zero():
            raise ZeroDivisionError("cannot invert zero in Algebraic4")

        columns: list[list[Fraction]] = []
        for basis_index in range(4):
            basis = Algebraic4(
                *(Fraction(1 if basis_index == i else 0) for i in range(4))
            )
            columns.append(list((self * basis).coefficients))

        augmented = [
            [columns[column][row] for column in range(4)]
            + [Fraction(1 if row == 0 else 0)]
            for row in range(4)
        ]

        for pivot_column in range(4):
            pivot_row = next(
                row
                for row in range(pivot_column, 4)
                if augmented[row][pivot_column] != 0
            )
            if pivot_row != pivot_column:
                augmented[pivot_column], augmented[pivot_row] = (
                    augmented[pivot_row],
                    augmented[pivot_column],
                )

            pivot = augmented[pivot_column][pivot_column]
            augmented[pivot_column] = [
                value / pivot for value in augmented[pivot_column]
            ]

            for row in range(4):
                if row == pivot_column:
                    continue
                factor = augmented[row][pivot_column]
                if factor == 0:
                    continue
                augmented[row] = [
                    value - factor * pivot_value
                    for value, pivot_value in zip(
                        augmented[row], augmented[pivot_column]
                    )
                ]

        return Algebraic4(*(augmented[row][4] for row in range(4)))

    def embedding_interval(self, bits: int) -> tuple[Fraction, Fraction]:
        r_low, r_high = sqrt_fraction_interval(Fraction(5), bits)
        s_low, _ = sqrt_fraction_interval((7 + r_low) / 2, bits)
        _, s_high = sqrt_fraction_interval((7 + r_high) / 2, bits)
        rs_low = r_low * s_low
        rs_high = r_high * s_high

        lower = self.c0
        upper = self.c0
        for coefficient, term_low, term_high in [
            (self.c1, r_low, r_high),
            (self.c2, s_low, s_high),
            (self.c3, rs_low, rs_high),
        ]:
            if coefficient >= 0:
                lower += coefficient * term_low
                upper += coefficient * term_high
            else:
                lower += coefficient * term_high
                upper += coefficient * term_low

        return lower, upper

    def sign(self) -> int:
        if self.is_zero():
            return 0

        for bits in [16, 32, 64, 128, 256, 512, 1024, 2048]:
            lower, upper = self.embedding_interval(bits)
            if lower > 0:
                return 1
            if upper < 0:
                return -1

        raise ArithmeticError("could not isolate algebraic sign")


def coerce_algebraic4(value: object) -> Algebraic4:
    if isinstance(value, Algebraic4):
        return value
    if isinstance(value, (Fraction, int)):
        return Algebraic4.rational(value)
    raise TypeError(f"cannot coerce {value!r} to Algebraic4")


ZERO = Algebraic4.rational(0)
ONE = Algebraic4.rational(1)
R = Algebraic4(Fraction(0), Fraction(1))
S = Algebraic4(Fraction(0), Fraction(0), Fraction(1))
PHI_OVER_2 = (ONE + R) / 4
DOTTED_VALUE = S / 2


def sqrt_fraction_interval(value: Fraction, bits: int) -> tuple[Fraction, Fraction]:
    scale = 1 << bits
    numerator = value.numerator * scale * scale
    denominator = value.denominator
    root = math.isqrt(numerator // denominator)
    while (root + 1) * (root + 1) * denominator <= numerator:
        root += 1
    while root * root * denominator > numerator:
        root -= 1
    lower = Fraction(root, scale)
    if root * root * denominator == numerator:
        return lower, lower
    return lower, Fraction(root + 1, scale)


def polynomial_value(coefficients: list[int], value: float) -> float:
    total = 0.0
    for coefficient in coefficients:
        total = total * value + coefficient
    return total


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
        "rank": example.get("rank"),
        "generators": example.get("generators"),
        "coxeterMatrix": example.get("coxeterMatrix"),
        "geometry": {
            "model": geometry.get("model"),
            "dimension": geometry.get("dimension"),
            "normalGram": geometry.get("normalGram"),
            "source": geometry.get("source"),
        },
        "sourceRefs": example.get("sourceRefs"),
    }


def exact_gram_matrix() -> list[list[Algebraic4]]:
    values = {
        "one": ONE,
        "right": ZERO,
        "m3": Algebraic4.rational(Fraction(-1, 2)),
        "m5": -PHI_OVER_2,
        "dotted": -DOTTED_VALUE,
    }
    matrix: list[list[Algebraic4]] = []
    for i, row in enumerate(EXPECTED_COXETER_MATRIX):
        matrix_row: list[Algebraic4] = []
        for j, entry in enumerate(row):
            pair = tuple(sorted((i, j)))
            if i == j:
                matrix_row.append(values["one"])
            elif pair == DOTTED_PAIR:
                matrix_row.append(values["dotted"])
            elif entry == 5:
                matrix_row.append(values["m5"])
            elif entry == 3:
                matrix_row.append(values["m3"])
            elif entry == 2:
                matrix_row.append(values["right"])
            else:
                raise AssertionError(f"unexpected infinite pair: {pair}")
        matrix.append(matrix_row)
    return matrix


def inertia(matrix: list[list[Algebraic4]]) -> dict[str, int]:
    work = [[entry for entry in row] for row in matrix]
    positive = 0
    negative = 0
    zero = 0

    while work:
        size = len(work)
        pivot = next(
            (index for index in range(size) if not work[index][index].is_zero()),
            None,
        )

        if pivot is not None:
            if pivot != 0:
                work[0], work[pivot] = work[pivot], work[0]
                for row in work:
                    row[0], row[pivot] = row[pivot], row[0]

            pivot_value = work[0][0]
            pivot_sign = pivot_value.sign()
            if pivot_sign > 0:
                positive += 1
            elif pivot_sign < 0:
                negative += 1
            else:  # pragma: no cover
                raise ArithmeticError("nonzero pivot had zero sign")

            next_work: list[list[Algebraic4]] = []
            for row in range(1, size):
                next_row: list[Algebraic4] = []
                for column in range(1, size):
                    next_row.append(
                        work[row][column]
                        - (work[row][0] * work[0][column]) / pivot_value
                    )
                next_work.append(next_row)
            work = next_work
            continue

        pair = None
        for i in range(size):
            for j in range(i + 1, size):
                if not work[i][j].is_zero():
                    pair = (i, j)
                    break
            if pair is not None:
                break

        if pair is None:
            zero += size
            break

        i, j = pair
        order = [i, j] + [index for index in range(size) if index not in pair]
        work = [[work[row][column] for column in order] for row in order]
        off_diagonal = work[0][1]
        positive += 1
        negative += 1

        next_work = []
        for row in range(2, size):
            next_row = []
            for column in range(2, size):
                next_row.append(
                    work[row][column]
                    - (
                        work[row][0] * work[1][column]
                        + work[row][1] * work[0][column]
                    )
                    / off_diagonal
                )
            next_work.append(next_row)
        work = next_work

    return {
        "positive": positive,
        "negative": negative,
        "zero": zero,
        "rank": positive + negative,
    }


def add_error(errors: list[str], path: str, message: str) -> None:
    errors.append(f"{path}: {message}")


def validate_dotted_entry(errors: list[str], entry: Any, i: int, j: int) -> None:
    path = f"geometry.normalGram[{i}][{j}]"
    if not isinstance(entry, dict):
        add_error(errors, path, "must be an object")
        return
    if entry.get("kind") != "dotted":
        add_error(errors, path, "must be a dotted entry")
    if entry.get("sourceRefId") != SOURCE_REF_ID:
        add_error(errors, path, f"must cite {SOURCE_REF_ID}")
    if abs(float(entry.get("coshDistance", 0)) - 1.0744805708748175) > 1e-12:
        add_error(errors, path, "coshDistance does not match Example 8")
    exact = entry.get("exact")
    if not isinstance(exact, dict):
        add_error(errors, f"{path}.exact", "must be present")
        return
    if exact.get("minimalPolynomial") != DOTTED_MIN_POLY:
        add_error(errors, f"{path}.exact.minimalPolynomial", "is wrong")
    if exact.get("isolatingInterval") != DOTTED_INTERVAL:
        add_error(errors, f"{path}.exact.isolatingInterval", "is wrong")
    decimal = exact.get("decimal")
    if not isinstance(decimal, (int, float)):
        add_error(errors, f"{path}.exact.decimal", "must be numeric")
    elif abs(polynomial_value(DOTTED_MIN_POLY, float(decimal))) > 1e-8:
        add_error(errors, f"{path}.exact.decimal", "does not satisfy polynomial")


def validate_normal_gram(errors: list[str], normal_gram: Any) -> None:
    if not isinstance(normal_gram, list) or len(normal_gram) != EXPECTED_RANK:
        add_error(errors, "geometry.normalGram", "must be a 7 by 7 matrix")
        return

    for i, row in enumerate(normal_gram):
        if not isinstance(row, list) or len(row) != EXPECTED_RANK:
            add_error(errors, f"geometry.normalGram[{i}]", "must contain 7 entries")
            continue
        for j, entry in enumerate(row):
            expected = EXPECTED_COXETER_MATRIX[i][j]
            pair = tuple(sorted((i, j)))
            if i == j:
                if entry != {"kind": "numericGram", "value": 1}:
                    add_error(errors, f"geometry.normalGram[{i}][{j}]", "must be 1")
            elif pair == DOTTED_PAIR:
                validate_dotted_entry(errors, entry, i, j)
            elif expected == 2:
                if entry != {"kind": "right"}:
                    add_error(errors, f"geometry.normalGram[{i}][{j}]", "must be right")
            elif expected == 3:
                if entry != {"kind": "coxeter", "m": 3}:
                    add_error(errors, f"geometry.normalGram[{i}][{j}]", "must be m=3")
            elif expected == 5:
                if entry != {"kind": "coxeter", "m": 5}:
                    add_error(errors, f"geometry.normalGram[{i}][{j}]", "must be m=5")


def certify(example: dict[str, Any], file: Path) -> dict[str, Any]:
    errors: list[str] = []

    if example.get("rank") != EXPECTED_RANK:
        add_error(errors, "rank", "must be 7")
    if [generator.get("id") for generator in example.get("generators", [])] != EXPECTED_GENERATOR_IDS:
        add_error(errors, "generators", "must match expected prism generator ids")
    if example.get("coxeterMatrix") != EXPECTED_COXETER_MATRIX:
        add_error(errors, "coxeterMatrix", "does not match Example 8 graph")
    if example.get("dataStatus") != "certified":
        add_error(errors, "dataStatus", "must be certified")

    refs = example.get("sourceRefs")
    if not isinstance(refs, list) or not any(ref.get("id") == SOURCE_REF_ID for ref in refs if isinstance(ref, dict)):
        add_error(errors, "sourceRefs", f"must include {SOURCE_REF_ID}")

    geometry = example.get("geometry")
    if not isinstance(geometry, dict):
        add_error(errors, "geometry", "must be present")
    else:
        if geometry.get("model") != "hyperboloid":
            add_error(errors, "geometry.model", "must be hyperboloid")
        if geometry.get("dimension") != EXPECTED_DIMENSION:
            add_error(errors, "geometry.dimension", "must be 5")
        validate_normal_gram(errors, geometry.get("normalGram"))

    gram_inertia = inertia(exact_gram_matrix())
    expected_inertia = {"positive": 5, "negative": 1, "zero": 1, "rank": 6}
    if gram_inertia != expected_inertia:
        add_error(errors, "geometry.normalGram", f"exact inertia {gram_inertia} did not match {expected_inertia}")

    payload_hash = sha256_json(checked_payload(example))
    diagnostics = {
        "certifiedClaims": [
            "Bredon-Kellerhals Example 8 source graph for the Makarov prism",
            "algebraic dotted value cosh(l)=1/2*sqrt((7+sqrt(5))/2)",
            "exact normal Gram rank and signature",
        ],
        "sourceTranscription": {
            "rank": EXPECTED_RANK,
            "sourceRefId": SOURCE_REF_ID,
            "finiteChain": [5, 3, 3, 3, 3],
            "dottedPair": list(DOTTED_PAIR),
        },
        "dottedValue": {
            "field": "Q(sqrt(5), sqrt((7 + sqrt(5)) / 2))",
            "value": "1/2 * sqrt((7 + sqrt(5)) / 2)",
            "minimalPolynomial": DOTTED_MIN_POLY,
            "isolatingInterval": DOTTED_INTERVAL,
        },
        "gram": {
            "field": "Q(sqrt(5), sqrt((7 + sqrt(5)) / 2))",
            "rank": gram_inertia["rank"],
            "signature": {
                "positive": gram_inertia["positive"],
                "negative": gram_inertia["negative"],
                "zero": gram_inertia["zero"],
            },
            "expectedForFacetNormalsInH5": expected_inertia,
        },
    }
    certificate = {
        "status": "passed" if not errors else "failed",
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "command": CANONICAL_COMMAND,
        "inputHash": payload_hash,
        "sourceRefIds": [SOURCE_REF_ID],
        "diagnostics": diagnostics,
    }
    return {
        "ok": not errors,
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "file": str(file),
        "inputHash": payload_hash,
        "certificate": certificate,
        "diagnostics": diagnostics,
        "errors": errors,
        "warnings": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    args = parser.parse_args()

    try:
        example = json.loads(args.input.read_text(encoding="utf-8"))
        result = certify(example, args.input)
    except Exception as exc:  # pragma: no cover
        result = {
            "ok": False,
            "backend": BACKEND,
            "backendVersion": BACKEND_VERSION,
            "file": str(args.input),
            "errors": [str(exc)],
            "warnings": [],
        }

    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
