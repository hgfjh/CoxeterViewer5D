#!/usr/bin/env python3
"""Certify the regular ideal Coxeter 3-cube and its S4 quotient map.

The six facet normals are checked from the exact radical construction

    n_(axis,+/-) = (1/sqrt(2), +/-sqrt(3/2) e_axis).

Their Gram matrix has entries 1, -1/2, and -2.  The checker also verifies
that the six transposition labels generate S4 and that every spherical A1 or
A2 subgroup embeds in that finite image.  The latter is the finite check used
to certify the kernel as torsion-free; it is separate from the geometry claim.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import sys
from fractions import Fraction
from pathlib import Path
from typing import Any, Iterable


BACKEND = "idealHyperbolic3CubeExactChecker"
BACKEND_VERSION = "1.0.0"
GENERATOR_PAIRS = ((1, 2), (1, 3), (1, 4), (2, 3), (2, 4), (3, 4))
OPPOSITE_PAIRS = ((0, 5), (1, 4), (2, 3))


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def checked_payload(example: dict[str, Any]) -> dict[str, Any]:
    geometry = example.get("geometry", {})
    return {
        "schemaVersion": example.get("schemaVersion"),
        "name": example.get("name"),
        "rank": example.get("rank"),
        "generators": example.get("generators"),
        "coxeterMatrix": example.get("coxeterMatrix"),
        "geometry": {
            "model": geometry.get("model"),
            "dimension": geometry.get("dimension"),
            "normalGram": geometry.get("normalGram"),
            "normalCoordinates": geometry.get("normalCoordinates"),
            "basepoint": geometry.get("basepoint"),
        },
    }


def share_one_letter(left: tuple[int, int], right: tuple[int, int]) -> bool:
    return len(set(left).intersection(right)) == 1


def expected_coxeter_matrix() -> list[list[int | str]]:
    matrix: list[list[int | str]] = []
    for row, left in enumerate(GENERATOR_PAIRS):
        matrix.append(
            [
                1
                if row == column
                else 3
                if share_one_letter(left, right)
                else "inf"
                for column, right in enumerate(GENERATOR_PAIRS)
            ]
        )
    return matrix


def exact_gram() -> list[list[Fraction]]:
    matrix = expected_coxeter_matrix()
    return [
        [
            Fraction(1)
            if row == column
            else Fraction(-1, 2)
            if matrix[row][column] == 3
            else Fraction(-2)
            for column in range(6)
        ]
        for row in range(6)
    ]


def matrix_vector(
    matrix: list[list[Fraction]], vector: list[Fraction]
) -> list[Fraction]:
    return [
        sum((entry * vector[column] for column, entry in enumerate(row)), Fraction())
        for row in matrix
    ]


def rational_rank(rows: list[list[Fraction]]) -> int:
    work = [row[:] for row in rows]
    rank = 0
    column = 0
    while rank < len(work) and column < len(work[0]):
        pivot = next(
            (row for row in range(rank, len(work)) if work[row][column] != 0),
            None,
        )
        if pivot is None:
            column += 1
            continue
        work[rank], work[pivot] = work[pivot], work[rank]
        scale = work[rank][column]
        work[rank] = [value / scale for value in work[rank]]
        for row in range(len(work)):
            if row == rank or work[row][column] == 0:
                continue
            factor = work[row][column]
            work[row] = [
                value - factor * work[rank][index]
                for index, value in enumerate(work[row])
            ]
        rank += 1
        column += 1
    return rank


def verify_exact_inertia(errors: list[str]) -> None:
    gram = exact_gram()
    eigenvectors = [
        ([1, 0, 0, 0, 0, -1], 3),
        ([0, 1, 0, 0, -1, 0], 3),
        ([0, 0, 1, -1, 0, 0], 3),
        ([1, 1, 1, 1, 1, 1], -3),
        ([1, -1, 0, 0, -1, 1], 0),
        ([1, 1, -2, -2, 1, 1], 0),
    ]
    rational_vectors = [
        [Fraction(value) for value in vector] for vector, _eigenvalue in eigenvectors
    ]
    if rational_rank(rational_vectors) != 6:
        errors.append("the stated exact Gram eigenbasis is not independent")
        return
    for (vector, eigenvalue), rational_vector in zip(
        eigenvectors, rational_vectors, strict=True
    ):
        actual = matrix_vector(gram, rational_vector)
        expected = [Fraction(eigenvalue * value) for value in vector]
        if actual != expected:
            errors.append(
                f"exact Gram eigenvector check failed for eigenvalue {eigenvalue}"
            )


def gram_entry_value(entry: Any) -> float:
    if not isinstance(entry, dict):
        raise ValueError("normalGram entries must be objects")
    kind = entry.get("kind")
    if kind == "numericGram":
        return float(entry.get("value"))
    if kind == "coxeter" and entry.get("m") == 3:
        return -0.5
    if kind == "dotted":
        return -float(entry.get("coshDistance"))
    raise ValueError(f"unexpected Gram entry {entry!r}")


def lorentz_dot(left: Iterable[float], right: Iterable[float]) -> float:
    left_values = list(left)
    right_values = list(right)
    return -left_values[0] * right_values[0] + sum(
        left_values[index] * right_values[index]
        for index in range(1, len(left_values))
    )


def verify_coordinates(example: dict[str, Any], errors: list[str]) -> None:
    geometry = example.get("geometry")
    if not isinstance(geometry, dict):
        errors.append("geometry block is missing")
        return
    if geometry.get("model") != "hyperboloid" or geometry.get("dimension") != 3:
        errors.append("geometry must be the H3 hyperboloid model")
    normals = geometry.get("normalCoordinates")
    if not isinstance(normals, list) or len(normals) != 6:
        errors.append("geometry.normalCoordinates must contain six normals")
        return
    expected_numeric_gram = [
        [float(value) for value in row] for row in exact_gram()
    ]
    for row in range(6):
        if not isinstance(normals[row], list) or len(normals[row]) != 4:
            errors.append(f"normal {row} must have four coordinates")
            continue
        for column in range(6):
            residual = abs(
                lorentz_dot(normals[row], normals[column])
                - expected_numeric_gram[row][column]
            )
            if residual > 1e-12:
                errors.append(
                    f"normal Gram residual at ({row},{column}) is {residual}"
                )
    basepoint = geometry.get("basepoint")
    if basepoint != [1, 0, 0, 0]:
        errors.append("the exact chamber basepoint must be (1,0,0,0)")
    elif any(lorentz_dot(basepoint, normal) >= 0 for normal in normals):
        errors.append("the basepoint does not satisfy every chamber inequality")

    normal_gram = geometry.get("normalGram")
    if not isinstance(normal_gram, list) or len(normal_gram) != 6:
        errors.append("geometry.normalGram must be 6 by 6")
    else:
        for row in range(6):
            if not isinstance(normal_gram[row], list) or len(normal_gram[row]) != 6:
                errors.append(f"geometry.normalGram[{row}] must have length 6")
                continue
            for column in range(6):
                try:
                    actual = gram_entry_value(normal_gram[row][column])
                except (TypeError, ValueError) as error:
                    errors.append(str(error))
                    continue
                if abs(actual - expected_numeric_gram[row][column]) > 1e-12:
                    errors.append(f"normalGram entry ({row},{column}) is incorrect")

    # In Klein coordinates the six halfspaces are |x_i| <= 1/sqrt(3).
    # Every choice of signs gives a corner of Euclidean norm exactly one.
    for signs in itertools.product((-1, 1), repeat=3):
        radial_squared = sum(Fraction(sign * sign, 3) for sign in signs)
        if radial_squared != 1:
            errors.append("a purported ideal cube vertex is not on the Klein sphere")


Permutation = tuple[int, int, int, int]


def transposition(left: int, right: int) -> Permutation:
    values = list(range(4))
    values[left - 1], values[right - 1] = values[right - 1], values[left - 1]
    return tuple(values)  # type: ignore[return-value]


def compose(left: Permutation, right: Permutation) -> Permutation:
    """Return left after right, matching the viewer's right-action convention."""

    return tuple(left[right[index]] for index in range(4))  # type: ignore[return-value]


def generated_group(generators: Iterable[Permutation]) -> set[Permutation]:
    identity: Permutation = (0, 1, 2, 3)
    result = {identity}
    queue = [identity]
    generator_list = list(generators)
    while queue:
        current = queue.pop(0)
        for generator in generator_list:
            image = compose(current, generator)
            if image not in result:
                result.add(image)
                queue.append(image)
    return result


def verify_s4_map(example: dict[str, Any], errors: list[str]) -> None:
    labels = [generator.get("id") for generator in example.get("generators", [])]
    expected_labels = [f"t{left}{right}" for left, right in GENERATOR_PAIRS]
    if labels != expected_labels:
        errors.append("generator ids must follow the six S4 transpositions")
    generators = [transposition(left, right) for left, right in GENERATOR_PAIRS]
    image = generated_group(generators)
    if len(image) != 24:
        errors.append(f"the six transpositions generate an image of order {len(image)}, not 24")
    matrix = expected_coxeter_matrix()
    spherical_a2 = 0
    for left in range(6):
        if compose(generators[left], generators[left]) != (0, 1, 2, 3):
            errors.append(f"generator {left} is not an involution")
        for right in range(left + 1, 6):
            if matrix[left][right] != 3:
                continue
            spherical_a2 += 1
            subgroup = generated_group((generators[left], generators[right]))
            if len(subgroup) != 6:
                errors.append(
                    f"spherical pair ({left},{right}) has image order {len(subgroup)}, not 6"
                )
    if spherical_a2 != 12:
        errors.append(f"expected 12 spherical A2 pairs, found {spherical_a2}")


def expected_diagnostics() -> dict[str, Any]:
    return {
        "gram": {
            "rank": 4,
            "signature": {"positive": 3, "negative": 1, "zero": 2},
            "eigenvalues": {"3": 3, "0": 2, "-3": 1},
        },
        "polyhedron": {
            "combinatorics": "3-cube",
            "finiteVolume": True,
            "compact": False,
            "idealVertexCount": 8,
            "vertexLinkType": "affine A~2",
            "oppositeFacetCoshDistance": 2,
        },
        "exactNormals": {
            "timeCoordinateSquared": "1/2",
            "spatialCoordinateSquared": "3/2",
            "basepoint": [1, 0, 0, 0],
        },
    }


def build_report(path: Path, example: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if example.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if example.get("rank") != 6:
        errors.append("rank must be 6")
    if example.get("coxeterMatrix") != expected_coxeter_matrix():
        errors.append("coxeterMatrix is not the octahedral all-m=3 cube matrix")

    verify_exact_inertia(errors)
    verify_coordinates(example, errors)
    verify_s4_map(example, errors)

    stored_certificate = example.get("certificate")
    diagnostics = expected_diagnostics()
    if not isinstance(stored_certificate, dict):
        errors.append("stored certificate is missing")
    else:
        if stored_certificate.get("backend") != BACKEND:
            errors.append("stored certificate backend is stale")
        if stored_certificate.get("diagnostics") != diagnostics:
            errors.append("stored certificate diagnostics are stale")

    input_hash = hashlib.sha256(
        canonical_json_bytes(checked_payload(example))
    ).hexdigest()
    certificate = {
        "status": "passed" if not errors else "failed",
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "scopes": ["gram-signature", "geometry", "quotient-action", "torsion-free"],
        "command": f"python scripts/certify_ideal_hyperbolic_3_cube.py {path.as_posix()}",
        "inputHash": input_hash,
        "diagnostics": {
            **diagnostics,
            "finiteAction": {
                "image": "S4",
                "imageOrder": 24,
                "kernelIndex": 24,
                "sphericalSubgroups": {"A1": 6, "A2": 12},
                "sphericalRestrictionsFaithful": not errors,
                "kernelTorsionFree": not errors,
            },
        },
        "warnings": [
            "The polyhedron is ideal and finite-volume; the word compact must not be used for this example.",
            "The TypeScript cover builder independently rechecks the supplied regular action before constructing hat X.",
        ],
    }
    return {
        "ok": not errors,
        "schemaVersion": 1,
        "file": str(path),
        "certificate": certificate,
        "errors": errors,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Certify the regular ideal all-m=3 hyperbolic 3-cube."
    )
    parser.add_argument("example", type=Path)
    args = parser.parse_args(argv)
    try:
        example = json.loads(args.example.read_text(encoding="utf-8"))
        if not isinstance(example, dict):
            raise ValueError("example must be a JSON object")
        report = build_report(args.example, example)
    except Exception as error:  # noqa: BLE001 - CLI reports malformed files as JSON.
        report = {
            "ok": False,
            "schemaVersion": 1,
            "file": str(args.example),
            "errors": [str(error)],
        }
    print(json.dumps(report, indent=2, sort_keys=True))
    print()
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
