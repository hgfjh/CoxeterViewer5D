#!/usr/bin/env python3
"""Exact checker for the remaining Emery--Kellerhals compact 5D examples.

This script covers the two source-transcribed files that were previously
``verified-source`` only:

* ``compact_5_polytope_p1_double_makarov.json``: the double ``P1 = D P0``.
* ``compact_5_prism_makarov_p2.json``: Makarov's second simplicial 5-prism.

The source supplies the Coxeter diagrams and symbols.  The script checks the
repository transcription and then verifies the exact normal Gram rank/signature
over a small square-root tower.  The dotted value for ``P1`` is
``(3 + sqrt(5)) / 4``; for ``P2`` it is ``sqrt((3 + sqrt(5)) / 4)``.  These are
the algebraic values stored in the JSON and checked here.
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


BACKEND = "compact5PrismFamilyExactChecker"
BACKEND_VERSION = "1.0.0"
SOURCE_REF_ID = "emery-kellerhals-2013-smallest-5-orbifolds"
EXPECTED_RANK = 7
EXPECTED_DIMENSION = 5
EXPECTED_SIGNATURE = {"positive": 5, "negative": 1, "zero": 1}

P1_MATRIX: list[list[int | str]] = [
    [1, 5, 2, 2, 2, 2, 2],
    [5, 1, 3, 2, 2, 2, 2],
    [2, 3, 1, 3, 2, 2, 2],
    [2, 2, 3, 1, 3, 2, 2],
    [2, 2, 2, 3, 1, 3, 3],
    [2, 2, 2, 2, 3, 1, "inf"],
    [2, 2, 2, 2, 3, "inf", 1],
]

P2_MATRIX: list[list[int | str]] = [
    [1, 5, 2, 2, 2, 2, 2],
    [5, 1, 3, 2, 2, 2, 2],
    [2, 3, 1, 3, 2, 2, 2],
    [2, 2, 3, 1, 3, 2, 2],
    [2, 2, 2, 3, 1, 4, 2],
    [2, 2, 2, 2, 4, 1, "inf"],
    [2, 2, 2, 2, 2, "inf", 1],
]

SUPPORTED_EXAMPLES = {
    "compact_5_polytope_p1_double_makarov.json": {
        "label": "P1 double of P0",
        "generatorPrefix": "d",
        "coxeterMatrix": P1_MATRIX,
        "coxeterSymbol": "[5,3,3,3,3^{1,1}]",
        "sourceLocator": "Emery-Kellerhals diagram (1-4), Table 2, and Table 3",
        "dottedPair": (5, 6),
        "dottedKind": "p1",
        "dottedValue": "(3 + sqrt(5)) / 4",
        "dottedField": "Q(sqrt(5))",
        "minimalPolynomial": [4, -6, 1],
        "isolatingInterval": [1.309, 1.31],
        "claims": [
            "Emery-Kellerhals P1 = D P0 source graph",
            "derived algebraic dotted value cosh(l)=(3+sqrt(5))/4",
            "exact normal Gram rank and signature",
        ],
    },
    "compact_5_prism_makarov_p2.json": {
        "label": "P2 Makarov 5-prism",
        "generatorPrefix": "p",
        "coxeterMatrix": P2_MATRIX,
        "coxeterSymbol": "[5,3,3,3,4]",
        "sourceLocator": "Emery-Kellerhals diagram (1-3), Table 2, and Table 3",
        "dottedPair": (5, 6),
        "dottedKind": "p2",
        "dottedValue": "sqrt((3 + sqrt(5)) / 4)",
        "dottedField": "Q(sqrt(5), sqrt(2), sqrt((3 + sqrt(5)) / 4))",
        "minimalPolynomial": [4, 0, -6, 0, 1],
        "isolatingInterval": [1.1441, 1.1442],
        "claims": [
            "Emery-Kellerhals P2 source graph",
            "derived algebraic dotted value cosh(l)=sqrt((3+sqrt(5))/4)",
            "exact normal Gram rank and signature",
        ],
    },
}


BasisKey = tuple[int, int, int]
BASIS: list[BasisKey] = [
    (r, t, s) for r in (0, 1) for t in (0, 1) for s in (0, 1)
]


@dataclass(frozen=True)
class AlgebraicTower:
    """Element of Q(r,t,s), r^2=5, t^2=2, s^2=(3+r)/4.

    ``P1`` only uses the subfield Q(r).  ``P2`` needs ``t`` for the m=4 edge
    and ``s`` for its dotted edge.  Keeping one field avoids two nearly
    identical exact-linear-algebra implementations.
    """

    coeffs: tuple[Fraction, ...] = (Fraction(0),) * len(BASIS)

    @staticmethod
    def rational(value: int | Fraction) -> "AlgebraicTower":
        return AlgebraicTower((Fraction(value),) + (Fraction(0),) * 7)

    @staticmethod
    def monomial(key: BasisKey, coefficient: Fraction = Fraction(1)) -> "AlgebraicTower":
        values = [Fraction(0)] * len(BASIS)
        values[BASIS.index(key)] = coefficient
        return AlgebraicTower(tuple(values))

    def __add__(self, other: object) -> "AlgebraicTower":
        rhs = coerce(other)
        return AlgebraicTower(tuple(a + b for a, b in zip(self.coeffs, rhs.coeffs)))

    __radd__ = __add__

    def __neg__(self) -> "AlgebraicTower":
        return AlgebraicTower(tuple(-value for value in self.coeffs))

    def __sub__(self, other: object) -> "AlgebraicTower":
        return self + (-coerce(other))

    def __rsub__(self, other: object) -> "AlgebraicTower":
        return coerce(other) + (-self)

    def __mul__(self, other: object) -> "AlgebraicTower":
        rhs = coerce(other)
        out: dict[BasisKey, Fraction] = {}
        for left_key, left_coeff in zip(BASIS, self.coeffs):
            if left_coeff == 0:
                continue
            for right_key, right_coeff in zip(BASIS, rhs.coeffs):
                if right_coeff == 0:
                    continue
                product_key = tuple(a + b for a, b in zip(left_key, right_key))
                for key, coeff in reduce_monomial(product_key, left_coeff * right_coeff).items():
                    out[key] = out.get(key, Fraction(0)) + coeff
        return AlgebraicTower(tuple(out.get(key, Fraction(0)) for key in BASIS))

    __rmul__ = __mul__

    def __truediv__(self, other: object) -> "AlgebraicTower":
        return self * coerce(other).inverse()

    def is_zero(self) -> bool:
        return all(value == 0 for value in self.coeffs)

    def inverse(self) -> "AlgebraicTower":
        if self.is_zero():
            raise ZeroDivisionError("cannot invert zero in AlgebraicTower")

        columns: list[list[Fraction]] = []
        for key in BASIS:
            columns.append(list((self * AlgebraicTower.monomial(key)).coeffs))

        size = len(BASIS)
        augmented = [
            [columns[column][row] for column in range(size)]
            + [Fraction(1 if row == 0 else 0)]
            for row in range(size)
        ]

        for pivot_column in range(size):
            pivot_row = next(
                row
                for row in range(pivot_column, size)
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

            for row in range(size):
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

        return AlgebraicTower(tuple(augmented[row][size] for row in range(size)))

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

    def embedding_interval(self, bits: int) -> tuple[Fraction, Fraction]:
        r_low, r_high = sqrt_fraction_interval(Fraction(5), bits)
        t_low, t_high = sqrt_fraction_interval(Fraction(2), bits)
        s_low, _ = sqrt_fraction_interval((3 + r_low) / 4, bits)
        _, s_high = sqrt_fraction_interval((3 + r_high) / 4, bits)

        lower = Fraction(0)
        upper = Fraction(0)
        for (r_exp, t_exp, s_exp), coefficient in zip(BASIS, self.coeffs):
            if coefficient == 0:
                continue
            term_low = Fraction(1)
            term_high = Fraction(1)
            if r_exp:
                term_low *= r_low
                term_high *= r_high
            if t_exp:
                term_low *= t_low
                term_high *= t_high
            if s_exp:
                term_low *= s_low
                term_high *= s_high
            if coefficient >= 0:
                lower += coefficient * term_low
                upper += coefficient * term_high
            else:
                lower += coefficient * term_high
                upper += coefficient * term_low
        return lower, upper

    def to_float(self) -> float:
        r = math.sqrt(5)
        t = math.sqrt(2)
        s = math.sqrt((3 + r) / 4)
        total = 0.0
        for (r_exp, t_exp, s_exp), coefficient in zip(BASIS, self.coeffs):
            total += float(coefficient) * (r**r_exp) * (t**t_exp) * (s**s_exp)
        return total


def coerce(value: object) -> AlgebraicTower:
    if isinstance(value, AlgebraicTower):
        return value
    if isinstance(value, (Fraction, int)):
        return AlgebraicTower.rational(value)
    raise TypeError(f"cannot coerce {value!r} to AlgebraicTower")


def add_term(
    terms: dict[tuple[int, int, int], Fraction],
    key: tuple[int, int, int],
    coefficient: Fraction,
) -> None:
    terms[key] = terms.get(key, Fraction(0)) + coefficient


def reduce_monomial(
    key: tuple[int, int, int],
    coefficient: Fraction,
) -> dict[BasisKey, Fraction]:
    terms: dict[tuple[int, int, int], Fraction] = {key: coefficient}
    changed = True
    while changed:
        changed = False
        next_terms: dict[tuple[int, int, int], Fraction] = {}
        for (r_exp, t_exp, s_exp), coeff in terms.items():
            if s_exp >= 2:
                changed = True
                add_term(next_terms, (r_exp, t_exp, s_exp - 2), coeff * Fraction(3, 4))
                add_term(next_terms, (r_exp + 1, t_exp, s_exp - 2), coeff * Fraction(1, 4))
            elif t_exp >= 2:
                changed = True
                add_term(next_terms, (r_exp, t_exp - 2, s_exp), coeff * 2)
            elif r_exp >= 2:
                changed = True
                add_term(next_terms, (r_exp - 2, t_exp, s_exp), coeff * 5)
            else:
                add_term(next_terms, (r_exp, t_exp, s_exp), coeff)
        terms = next_terms
    return {key: value for key, value in terms.items() if value != 0}


ZERO = AlgebraicTower.rational(0)
ONE = AlgebraicTower.rational(1)
R = AlgebraicTower.monomial((1, 0, 0))
T = AlgebraicTower.monomial((0, 1, 0))
S = AlgebraicTower.monomial((0, 0, 1))
M3 = AlgebraicTower.rational(Fraction(-1, 2))
M4 = -T / 2
M5 = -(ONE + R) / 4
DOTTED_P1 = -(AlgebraicTower.rational(3) + R) / 4
DOTTED_P2 = -S


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


def finite_gram_value(m: int) -> AlgebraicTower:
    if m == 2:
        return ZERO
    if m == 3:
        return M3
    if m == 4:
        return M4
    if m == 5:
        return M5
    raise ValueError(f"unsupported finite Coxeter label m={m}")


def exact_gram_matrix(spec: dict[str, Any]) -> list[list[AlgebraicTower]]:
    matrix = spec["coxeterMatrix"]
    dotted_pair = tuple(spec["dottedPair"])
    dotted_value = DOTTED_P1 if spec["dottedKind"] == "p1" else DOTTED_P2
    gram: list[list[AlgebraicTower]] = []
    for i in range(EXPECTED_RANK):
        row: list[AlgebraicTower] = []
        for j in range(EXPECTED_RANK):
            entry = matrix[i][j]
            if i == j:
                row.append(ONE)
            elif isinstance(entry, int):
                row.append(finite_gram_value(entry))
            elif entry == "inf" and tuple(sorted((i, j))) == dotted_pair:
                row.append(dotted_value)
            else:
                raise ValueError(f"unsupported matrix entry at ({i}, {j}): {entry!r}")
        gram.append(row)
    return gram


def rank_signature(matrix: list[list[AlgebraicTower]]) -> dict[str, int]:
    working = [[entry for entry in row] for row in matrix]
    positive = 0
    negative = 0
    size = len(working)

    while working:
        pivot_index = next(
            (index for index, row in enumerate(working) if not row[index].is_zero()),
            None,
        )
        if pivot_index is None:
            offdiag: tuple[int, int] | None = None
            for i in range(len(working)):
                for j in range(i + 1, len(working)):
                    if not working[i][j].is_zero():
                        offdiag = (i, j)
                        break
                if offdiag is not None:
                    break
            if offdiag is None:
                break
            i, j = offdiag
            for k in range(len(working)):
                working[i][k] = working[i][k] + working[j][k]
            for k in range(len(working)):
                working[k][i] = working[k][i] + working[k][j]
            pivot_index = i

        if pivot_index != 0:
            working[0], working[pivot_index] = working[pivot_index], working[0]
            for row in working:
                row[0], row[pivot_index] = row[pivot_index], row[0]

        pivot = working[0][0]
        sign = pivot.sign()
        if sign > 0:
            positive += 1
        elif sign < 0:
            negative += 1
        else:  # pragma: no cover - pivot selection should prevent this.
            raise AssertionError("zero pivot selected")

        remaining = len(working) - 1
        next_matrix = [[ZERO for _ in range(remaining)] for _ in range(remaining)]
        for i in range(remaining):
            for j in range(remaining):
                next_matrix[i][j] = (
                    working[i + 1][j + 1]
                    - working[i + 1][0] * working[0][j + 1] / pivot
                )
        working = next_matrix

    rank = positive + negative
    return {
        "positive": positive,
        "negative": negative,
        "zero": size - rank,
        "rank": rank,
    }


def evaluate_polynomial(coefficients: list[int], value: float) -> float:
    total = 0.0
    for coefficient in coefficients:
        total = total * value + coefficient
    return total


def add_error(errors: list[str], path: str, message: str) -> None:
    errors.append(f"{path}: {message}")


def load_example(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid JSON: {error}") from error
    if not isinstance(value, dict):
        raise ValueError("top-level JSON value must be an object")
    return value


def validate_example(path: Path, example: dict[str, Any], spec: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    expected_ids = [f"{spec['generatorPrefix']}{index}" for index in range(EXPECTED_RANK)]

    if example.get("rank") != EXPECTED_RANK:
        add_error(errors, "rank", f"must be {EXPECTED_RANK}")
    if example.get("coxeterMatrix") != spec["coxeterMatrix"]:
        add_error(errors, "coxeterMatrix", "does not match the expected source diagram transcription")
    generators = example.get("generators")
    actual_ids = [generator.get("id") for generator in generators] if isinstance(generators, list) else []
    if actual_ids != expected_ids:
        add_error(errors, "generators", f"ids must be {expected_ids}")

    geometry = example.get("geometry")
    if not isinstance(geometry, dict):
        add_error(errors, "geometry", "block is required")
        return errors
    if geometry.get("model") != "hyperboloid":
        add_error(errors, "geometry.model", "must be hyperboloid")
    if geometry.get("dimension") != EXPECTED_DIMENSION:
        add_error(errors, "geometry.dimension", f"must be {EXPECTED_DIMENSION}")

    source_ids = {
        ref.get("id")
        for ref in example.get("sourceRefs", [])
        if isinstance(ref, dict)
    }
    if SOURCE_REF_ID not in source_ids:
        add_error(errors, "sourceRefs", f"must include {SOURCE_REF_ID}")

    normal_gram = geometry.get("normalGram")
    dotted_pair = tuple(spec["dottedPair"])
    if not isinstance(normal_gram, list) or len(normal_gram) != EXPECTED_RANK:
        add_error(errors, "geometry.normalGram", f"must contain {EXPECTED_RANK} rows")
    else:
        dotted = normal_gram[dotted_pair[0]][dotted_pair[1]]
        exact = dotted.get("exact") if isinstance(dotted, dict) else None
        if not isinstance(dotted, dict) or dotted.get("kind") != "dotted":
            add_error(errors, "geometry.normalGram", "dotted pair must be stored as a dotted entry")
        elif not isinstance(exact, dict):
            add_error(errors, "geometry.normalGram", "dotted pair must include exact algebraic metadata")
        else:
            if exact.get("minimalPolynomial") != spec["minimalPolynomial"]:
                add_error(errors, "geometry.normalGram.exact", "minimal polynomial does not match")
            if exact.get("isolatingInterval") != spec["isolatingInterval"]:
                add_error(errors, "geometry.normalGram.exact", "isolating interval does not match")
            decimal = exact.get("decimal")
            if not isinstance(decimal, (int, float)):
                add_error(errors, "geometry.normalGram.exact.decimal", "must be numeric")
            else:
                residual = abs(evaluate_polynomial(spec["minimalPolynomial"], float(decimal)))
                if residual > 1e-8:
                    add_error(errors, "geometry.normalGram.exact.decimal", f"polynomial residual {residual}")

    if example.get("dataStatus") not in {"verified-source", "certified"}:
        add_error(errors, "dataStatus", "must be verified-source or certified")

    return errors


def build_report(path: Path) -> dict[str, Any]:
    spec = SUPPORTED_EXAMPLES.get(path.name)
    if spec is None:
        raise ValueError(f"{path.name} is not supported by this checker")

    example = load_example(path)
    errors = validate_example(path, example, spec)
    payload_hash = sha256_json(checked_payload(example))

    signature = rank_signature(exact_gram_matrix(spec))
    if signature != {**EXPECTED_SIGNATURE, "rank": 6}:
        add_error(errors, "geometry.normalGram", f"unexpected signature {signature}")

    status = "passed" if not errors else "failed"
    diagnostics = {
        "certifiedClaims": spec["claims"],
        "sourceTranscription": {
            "rank": EXPECTED_RANK,
            "sourceRefId": SOURCE_REF_ID,
            "sourceLocator": spec["sourceLocator"],
            "coxeterSymbol": spec["coxeterSymbol"],
            "dottedPair": list(spec["dottedPair"]),
        },
        "dottedValue": {
            "field": spec["dottedField"],
            "value": spec["dottedValue"],
            "minimalPolynomial": spec["minimalPolynomial"],
            "isolatingInterval": spec["isolatingInterval"],
        },
        "gram": {
            "field": spec["dottedField"],
            "rank": signature["rank"],
            "signature": {
                "positive": signature["positive"],
                "negative": signature["negative"],
                "zero": signature["zero"],
            },
            "expectedForFacetNormalsInH5": {
                **EXPECTED_SIGNATURE,
                "rank": 6,
            },
        },
        "nonClaims": [
            "not an exact coordinate embedding",
            "not a generated Cayley-ball certificate",
            "not a quotient, manifold, or PL Morse certificate",
        ],
    }
    certificate = {
        "status": status,
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "scopes": ["source-transcription", "gram-signature"],
        "command": f"python scripts/certify_compact_5_prism_family.py {path.as_posix()}",
        "inputHash": payload_hash,
        "sourceRefIds": [SOURCE_REF_ID],
        "diagnostics": diagnostics,
    }

    if example.get("dataStatus") == "certified":
        embedded = example.get("certificate")
        if not isinstance(embedded, dict) or embedded.get("status") != "passed":
            add_error(errors, "certificate", "certified examples must embed a passed certificate")
        elif (
            embedded.get("backend") != BACKEND
            or embedded.get("inputHash") != payload_hash
            or embedded.get("diagnostics", {}).get("gram") != diagnostics["gram"]
        ):
            add_error(errors, "certificate", "embedded certificate does not match current checker output")

    return {
        "ok": not errors,
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "schemaVersion": 1,
        "file": str(path),
        "inputHash": payload_hash,
        "certificate": certificate,
        "diagnostics": diagnostics,
        "errors": errors,
        "warnings": [],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate exact source/signature certificates for Emery-Kellerhals P1/P2."
    )
    parser.add_argument("examples", type=Path, nargs="+")
    args = parser.parse_args(argv)

    reports: list[dict[str, Any]] = []
    for path in args.examples:
        try:
            reports.append(build_report(path))
        except Exception as error:  # noqa: BLE001 - CLI reports failures as JSON.
            reports.append(
                {
                    "ok": False,
                    "backend": BACKEND,
                    "backendVersion": BACKEND_VERSION,
                    "schemaVersion": 1,
                    "file": str(path),
                    "errors": [str(error)],
                }
            )

    output = reports[0] if len(reports) == 1 else {"ok": all(report.get("ok") for report in reports), "reports": reports}
    print(json.dumps(output, indent=2, sort_keys=True))
    print()
    return 0 if output.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
