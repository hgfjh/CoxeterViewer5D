#!/usr/bin/env python3
"""Exact certificate checker for the Jacquemet-Tschantz compact 5-cube.

This checker is deliberately narrow.  It certifies the bundled
``compact_5_cube_gamma1.json`` transcription against an independent source
table encoded below, checks the two algebraic dotted values, and computes the
normal Gram rank/signature over

    Q(sqrt(13), sqrt(10 + 2 sqrt(13))).

It does not certify numerical normal coordinates, chamber basepoints, Cayley
balls, quotient data, or any compact 5-prism placeholder.
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


BACKEND = "compact5CubeGamma1ExactChecker"
BACKEND_VERSION = "1.0.0"
SOURCE_REF_ID = "jacquemet-tschantz-2018-cube"
CANONICAL_COMMAND = (
    "python scripts/certify_compact_5_cube.py "
    "public/examples/compact_5_cube_gamma1.json"
)

EXPECTED_RANK = 10
EXPECTED_DIMENSION = 5
EXPECTED_GENERATOR_IDS = [f"g{i}" for i in range(EXPECTED_RANK)]
EXPECTED_COXETER_MATRIX: list[list[int | str]] = [
    [1, "inf", 3, 3, 2, 2, 2, 2, 2, 2],
    ["inf", 1, 2, 2, 2, 3, 3, 2, 2, 2],
    [3, 2, 1, 2, 3, 3, 2, 2, "inf", 2],
    [3, 2, 2, 1, "inf", 2, 3, 2, 2, 2],
    [2, 2, 3, "inf", 1, 2, 2, 3, 2, 2],
    [2, 3, 3, 2, 2, 1, 2, "inf", 2, 2],
    [2, 3, 2, 3, 2, 2, 1, 3, 2, "inf"],
    [2, 2, 2, 2, 3, "inf", 3, 1, 2, 2],
    [2, 2, "inf", 2, 2, 2, 2, 2, 1, 3],
    [2, 2, 2, 2, 2, 2, "inf", 2, 3, 1],
]

# Section 4.2.2 gives two dotted weights.  The names below follow the example
# notes: boundary dotted edges use e, and diagonal dotted edges use d.
BOUNDARY_DOTTED_PAIRS = [(0, 1), (3, 4), (5, 7)]
DIAGONAL_DOTTED_PAIRS = [(2, 8), (6, 9)]
BOUNDARY_MIN_POLY = [4, -2, -3]
DIAGONAL_MIN_POLY = [16, 0, -20, 0, 3]
BOUNDARY_INTERVAL = [1.1513, 1.1514]
DIAGONAL_INTERVAL = [1.0371, 1.0372]


@dataclass(frozen=True)
class Algebraic4:
    """Element of Q(r, s), with r^2 = 13 and s^2 = 10 + 2r."""

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
                out[0] += 13 * coefficient
            elif (left, right) == (1, 2):
                out[3] += coefficient
            elif (left, right) == (1, 3):
                out[2] += 13 * coefficient
            elif (left, right) == (2, 2):
                out[0] += 10 * coefficient
                out[1] += 2 * coefficient
            elif (left, right) == (2, 3):
                out[0] += 26 * coefficient
                out[1] += 10 * coefficient
            elif (left, right) == (3, 3):
                out[0] += 130 * coefficient
                out[1] += 26 * coefficient
            else:  # pragma: no cover - all basis products are covered above.
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
        """Invert by solving multiplication-by-self over Q."""

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
        """Interval in the embedding r > 0, s > 0."""

        r_low, r_high = sqrt_fraction_interval(Fraction(13), bits)
        s_low, _ = sqrt_fraction_interval(10 + 2 * r_low, bits)
        _, s_high = sqrt_fraction_interval(10 + 2 * r_high, bits)
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
        """Return the exact sign in the chosen real embedding."""

        if self.is_zero():
            return 0

        for bits in [16, 32, 64, 128, 256, 512, 1024, 2048, 4096]:
            lower, upper = self.embedding_interval(bits)
            if lower > 0:
                return 1
            if upper < 0:
                return -1

        raise ArithmeticError(f"could not isolate sign of {format_algebraic4(self)}")


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
BOUNDARY_VALUE = (ONE + R) / 4
DIAGONAL_VALUE = S / 4


def sqrt_fraction_interval(value: Fraction, bits: int) -> tuple[Fraction, Fraction]:
    if value < 0:
        raise ValueError("sqrt interval requires a nonnegative value")

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


def format_fraction(value: Fraction) -> str:
    if value.denominator == 1:
        return str(value.numerator)
    return f"{value.numerator}/{value.denominator}"


def format_algebraic4(value: Algebraic4) -> str:
    labels = ["1", "sqrt(13)", "sqrt(10 + 2 sqrt(13))", "product"]
    terms = [
        f"{format_fraction(coefficient)}*{label}"
        for coefficient, label in zip(value.coefficients, labels)
        if coefficient != 0
    ]
    return " + ".join(terms) if terms else "0"


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


def expected_gram_tags() -> list[list[str]]:
    tags: list[list[str]] = []
    boundary = {tuple(sorted(pair)) for pair in BOUNDARY_DOTTED_PAIRS}
    diagonal = {tuple(sorted(pair)) for pair in DIAGONAL_DOTTED_PAIRS}
    for i, row in enumerate(EXPECTED_COXETER_MATRIX):
        tag_row: list[str] = []
        for j, entry in enumerate(row):
            pair = tuple(sorted((i, j)))
            if i == j:
                tag_row.append("one")
            elif pair in boundary:
                tag_row.append("boundary-dotted")
            elif pair in diagonal:
                tag_row.append("diagonal-dotted")
            elif entry == 3:
                tag_row.append("m3")
            elif entry == 2:
                tag_row.append("right")
            else:
                raise AssertionError(f"unexpected infinite pair without dotted weight: {pair}")
        tags.append(tag_row)
    return tags


def exact_gram_matrix() -> list[list[Algebraic4]]:
    values = {
        "one": ONE,
        "right": ZERO,
        "m3": Algebraic4.rational(Fraction(-1, 2)),
        "boundary-dotted": -BOUNDARY_VALUE,
        "diagonal-dotted": -DIAGONAL_VALUE,
    }
    return [[values[tag] for tag in row] for row in expected_gram_tags()]


def inertia(matrix: list[list[Algebraic4]]) -> dict[str, int]:
    """Diagonalize a symmetric form by exact congruence operations."""

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
            else:  # pragma: no cover - nonzero pivot cannot have zero sign.
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

        # [[0, a], [a, 0]] contributes one positive and one negative square.
        positive += 1
        negative += 1

        next_work = []
        for row in range(2, size):
            next_row = []
            for column in range(2, size):
                next_row.append(
                    work[row][column]
                    - (work[row][0] * work[1][column]
                       + work[row][1] * work[0][column])
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


def dotted_expectation(i: int, j: int) -> dict[str, Any] | None:
    pair = tuple(sorted((i, j)))
    if pair in {tuple(sorted(pair)) for pair in BOUNDARY_DOTTED_PAIRS}:
        return {
            "label": "boundary",
            "minimalPolynomial": BOUNDARY_MIN_POLY,
            "isolatingInterval": BOUNDARY_INTERVAL,
            "exactValue": BOUNDARY_VALUE,
        }
    if pair in {tuple(sorted(pair)) for pair in DIAGONAL_DOTTED_PAIRS}:
        return {
            "label": "diagonal",
            "minimalPolynomial": DIAGONAL_MIN_POLY,
            "isolatingInterval": DIAGONAL_INTERVAL,
            "exactValue": DIAGONAL_VALUE,
        }
    return None


def validate_dotted_entry(
    errors: list[str],
    entry: Any,
    i: int,
    j: int,
    expectation: dict[str, Any],
) -> None:
    path = f"geometry.normalGram[{i}][{j}]"
    if not isinstance(entry, dict):
        add_error(errors, path, "must be an object")
        return
    if entry.get("kind") != "dotted":
        add_error(errors, path, 'must have kind "dotted"')
    if entry.get("sourceRefId") != SOURCE_REF_ID:
        add_error(errors, path, f"must cite {SOURCE_REF_ID}")

    exact = entry.get("exact")
    if not isinstance(exact, dict):
        add_error(errors, f"{path}.exact", "must record an algebraic real")
        return
    if exact.get("kind") != "algebraic-real":
        add_error(errors, f"{path}.exact.kind", 'must be "algebraic-real"')
    if exact.get("minimalPolynomial") != expectation["minimalPolynomial"]:
        add_error(
            errors,
            f"{path}.exact.minimalPolynomial",
            f"must be {expectation['minimalPolynomial']}",
        )
    if exact.get("isolatingInterval") != expectation["isolatingInterval"]:
        add_error(
            errors,
            f"{path}.exact.isolatingInterval",
            f"must be {expectation['isolatingInterval']}",
        )

    decimal = exact.get("decimal")
    cosh_distance = entry.get("coshDistance")
    if not isinstance(decimal, int | float) or not math.isfinite(decimal):
        add_error(errors, f"{path}.exact.decimal", "must be finite")
        return
    if not isinstance(cosh_distance, int | float) or not math.isfinite(cosh_distance):
        add_error(errors, f"{path}.coshDistance", "must be finite")
    elif abs(float(decimal) - float(cosh_distance)) > 1e-15:
        add_error(errors, path, "coshDistance must match exact.decimal")

    lower, upper = expectation["isolatingInterval"]
    if not (lower <= float(decimal) <= upper):
        add_error(errors, f"{path}.exact.decimal", "must lie in the isolating interval")

    residual = abs(polynomial_value(expectation["minimalPolynomial"], float(decimal)))
    if residual > 1e-12:
        add_error(
            errors,
            f"{path}.exact.decimal",
            f"polynomial residual {residual:.3g} exceeds 1e-12",
        )


def validate_normal_gram(errors: list[str], example: dict[str, Any]) -> None:
    normal_gram = example.get("geometry", {}).get("normalGram")
    if not isinstance(normal_gram, list) or len(normal_gram) != EXPECTED_RANK:
        add_error(errors, "geometry.normalGram", "must be a 10 by 10 matrix")
        return

    tags = expected_gram_tags()
    for i, expected_row in enumerate(tags):
        row = normal_gram[i]
        if not isinstance(row, list) or len(row) != EXPECTED_RANK:
            add_error(errors, f"geometry.normalGram[{i}]", "must have length 10")
            continue
        for j, expected_tag in enumerate(expected_row):
            entry = row[j]
            path = f"geometry.normalGram[{i}][{j}]"
            if not isinstance(entry, dict):
                add_error(errors, path, "must be an object")
                continue

            if expected_tag == "one":
                if entry.get("kind") != "numericGram" or entry.get("value") != 1:
                    add_error(errors, path, 'must be { "kind": "numericGram", "value": 1 }')
            elif expected_tag == "right":
                if entry.get("kind") != "right":
                    add_error(errors, path, 'must have kind "right"')
            elif expected_tag == "m3":
                if entry.get("kind") != "coxeter" or entry.get("m") != 3:
                    add_error(errors, path, 'must be { "kind": "coxeter", "m": 3 }')
            else:
                expectation = dotted_expectation(i, j)
                if expectation is None:
                    add_error(errors, path, "has no dotted source expectation")
                else:
                    validate_dotted_entry(errors, entry, i, j, expectation)


def validate_source_transcription(errors: list[str], example: dict[str, Any]) -> None:
    if example.get("schemaVersion") != 1:
        add_error(errors, "schemaVersion", "must be 1")
    if example.get("rank") != EXPECTED_RANK:
        add_error(errors, "rank", "must be 10")

    generator_ids = [
        generator.get("id")
        for generator in example.get("generators", [])
        if isinstance(generator, dict)
    ]
    if generator_ids != EXPECTED_GENERATOR_IDS:
        add_error(errors, "generators", f"ids must be {EXPECTED_GENERATOR_IDS}")

    if example.get("coxeterMatrix") != EXPECTED_COXETER_MATRIX:
        add_error(errors, "coxeterMatrix", "does not match the Gamma_1 source table")

    geometry = example.get("geometry")
    if not isinstance(geometry, dict):
        add_error(errors, "geometry", "must be present")
        return
    if geometry.get("model") != "hyperboloid":
        add_error(errors, "geometry.model", 'must be "hyperboloid"')
    if geometry.get("dimension") != EXPECTED_DIMENSION:
        add_error(errors, "geometry.dimension", "must be 5")

    source_ids = {
        source.get("id")
        for source in example.get("sourceRefs", [])
        if isinstance(source, dict)
    }
    if SOURCE_REF_ID not in source_ids:
        add_error(errors, "sourceRefs", f"must include {SOURCE_REF_ID}")


def certificate_summary(diagnostics: dict[str, Any], input_hash: str) -> dict[str, Any]:
    return {
        "status": "passed",
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "command": CANONICAL_COMMAND,
        "inputHash": input_hash,
        "sourceRefIds": [SOURCE_REF_ID],
        "diagnostics": diagnostics,
    }


def pair_arrays(pairs: list[tuple[int, int]]) -> list[list[int]]:
    return [[left, right] for left, right in pairs]


def compare_certificate(
    errors: list[str],
    example: dict[str, Any],
    expected_certificate: dict[str, Any],
) -> None:
    data_status = example.get("dataStatus")
    certificate = example.get("certificate")

    if data_status == "certified":
        if certificate != expected_certificate:
            add_error(
                errors,
                "certificate",
                "certified compact_5_cube_gamma1 must contain the current passed certificate",
            )
    elif certificate is not None and certificate != expected_certificate:
        add_error(
            errors,
            "certificate",
            "certificate is present but does not match the current checker output",
        )


def build_report(path: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        example = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return {
            "ok": False,
            "backend": BACKEND,
            "backendVersion": BACKEND_VERSION,
            "file": str(path),
            "errors": [f"invalid JSON: {error}"],
            "warnings": warnings,
        }

    if not isinstance(example, dict):
        return {
            "ok": False,
            "backend": BACKEND,
            "backendVersion": BACKEND_VERSION,
            "file": str(path),
            "errors": ["top-level JSON value must be an object"],
            "warnings": warnings,
        }

    validate_source_transcription(errors, example)
    validate_normal_gram(errors, example)

    gram_inertia = inertia(exact_gram_matrix())
    expected_inertia = {
        "positive": 5,
        "negative": 1,
        "zero": 4,
        "rank": 6,
    }
    if gram_inertia != expected_inertia:
        add_error(
            errors,
            "geometry.normalGram",
            f"exact inertia {gram_inertia} did not match {expected_inertia}",
        )

    diagnostics = {
        "certifiedClaims": [
            "Gamma_1 source transcription table",
            "algebraic dotted values e=(1+sqrt(13))/4 and d=sqrt(2(5+sqrt(13)))/4",
            "exact normal Gram rank and signature",
        ],
        "checkedFields": [
            "rank",
            "generators",
            "coxeterMatrix",
            "geometry.model",
            "geometry.dimension",
            "geometry.normalGram",
            "sourceRefs",
        ],
        "sourceTranscription": {
            "sourceRefId": SOURCE_REF_ID,
            "rank": EXPECTED_RANK,
            "generatorIds": EXPECTED_GENERATOR_IDS,
            "boundaryDottedPairs": pair_arrays(BOUNDARY_DOTTED_PAIRS),
            "diagonalDottedPairs": pair_arrays(DIAGONAL_DOTTED_PAIRS),
        },
        "dottedValues": {
            "field": "Q(sqrt(13), sqrt(10 + 2 sqrt(13)))",
            "boundary": {
                "symbol": "e",
                "value": "(1 + sqrt(13)) / 4",
                "minimalPolynomial": BOUNDARY_MIN_POLY,
                "isolatingInterval": BOUNDARY_INTERVAL,
            },
            "diagonal": {
                "symbol": "d",
                "value": "sqrt(2(5 + sqrt(13))) / 4",
                "minimalPolynomial": DIAGONAL_MIN_POLY,
                "isolatingInterval": DIAGONAL_INTERVAL,
            },
        },
        "gram": {
            "field": "Q(sqrt(13), sqrt(10 + 2 sqrt(13)))",
            "rank": gram_inertia["rank"],
            "signature": {
                "positive": gram_inertia["positive"],
                "negative": gram_inertia["negative"],
                "zero": gram_inertia["zero"],
            },
            "expectedForFacetNormalsInH5": expected_inertia,
        },
    }

    input_hash = sha256_json(checked_payload(example))
    computed_certificate = certificate_summary(diagnostics, input_hash)
    if not errors:
        compare_certificate(errors, example, computed_certificate)

    ok = not errors
    report = {
        "ok": ok,
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "file": str(path),
        "inputHash": input_hash,
        "diagnostics": diagnostics,
        "errors": errors,
        "warnings": warnings,
    }
    if ok:
        report["certificate"] = computed_certificate
    else:
        report["blockingCertificate"] = computed_certificate
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Certify the compact_5_cube_gamma1 example transcription."
    )
    parser.add_argument(
        "example",
        nargs="?",
        default="public/examples/compact_5_cube_gamma1.json",
        help="Path to compact_5_cube_gamma1.json.",
    )
    parser.add_argument(
        "--certificate-only",
        action="store_true",
        help="Print only the certificate object. Fails if checks do not pass.",
    )
    args = parser.parse_args(argv)

    report = build_report(Path(args.example))
    if args.certificate_only:
        if not report["ok"]:
            print(json.dumps(report, indent=2, sort_keys=True))
            return 1
        print(json.dumps(report["certificate"], indent=2, sort_keys=True))
        return 0

    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
