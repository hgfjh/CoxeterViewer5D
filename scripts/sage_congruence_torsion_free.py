#!/usr/bin/env python3
"""Find bounded torsion-free Coxeter kernels by exact congruence reduction.

Use ``scripts/torsion_free_discovery.py --backend sage`` in normal operation.
The launcher locates a native or WSL Sage runtime and keeps the artifact
contract identical to the GAP and composite rungs.

Conda Sage installations can use their environment's ``python`` executable
directly.  The WSL research environment in this repository uses that form.

The backend uses the standard Tits reflection representation over a cyclotomic
number field.  It reduces the integral reflection matrices modulo prime ideals,
including residue fields of degree greater than one.  A candidate is accepted
only when every maximal spherical special subgroup has the classified full
order after reduction.  The congruence kernel then meets every spherical
subgroup trivially, so Tits' torsion theorem makes the kernel torsion-free.

All expensive enumerations are capped.  A large finite image can therefore
produce a certified, non-materialized kernel cover: the finite target and the
spherical injectivity checks certify finite index and torsion-freeness without
allocating its regular permutation action.  Quotient and Schreier data are
emitted only when the exact image order lies within the action-degree bound.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "torsion-free-discovery"
sys.path.insert(0, str(SCRIPT_DIR))

# The launcher already owns validation and finite Coxeter classification.  We
# import those exact conventions rather than maintaining a second schema here.
import torsion_free_discovery as shared  # noqa: E402

try:
    from sage.all import CyclotomicField, identity_matrix, matrix, next_prime
    from sage.version import version as sage_version
except ImportError as exc:  # pragma: no cover - exercised only outside Sage
    raise SystemExit(
        "This backend must run inside SageMath: "
        "sage scripts/sage_congruence_torsion_free.py ..."
    ) from exc


BACKEND_ID = "sage-congruence-torsion-free"
BACKEND_VERSION = "1.1.0"
ARTIFACT_TYPE = "coxeter-torsion-free-discovery"
DEFAULT_MAX_CONGRUENCE_PRIME = 97
DEFAULT_MAX_RESIDUE_DEGREE = 16


class SearchDeadline(RuntimeError):
    """Raised between exact operations when the configured deadline expires."""


class ExactInvariantError(RuntimeError):
    """Raised when exact matrices contradict a Coxeter/source invariant."""


@dataclass
class Deadline:
    seconds: int

    def __post_init__(self) -> None:
        self.started = time.monotonic()

    def check(self, operation: str) -> None:
        if time.monotonic() - self.started > self.seconds:
            raise SearchDeadline(
                f"Sage congruence search exceeded {self.seconds} seconds "
                f"while {operation}."
            )


@dataclass
class MatrixGroupEnumeration:
    """An exact finite closure, or a proof that the closure exceeds ``cap``."""

    complete: bool
    elements: list[Any]
    words: list[tuple[int, ...]]
    transitions: list[list[int]]
    key_to_index: dict[tuple[Any, ...], int]
    cap: int

    @property
    def order(self) -> int | None:
        return len(self.elements) if self.complete else None


@dataclass
class PrimeIdealCandidate:
    rational_prime: int
    ideal: Any
    residue_field: Any
    reduction_map: Any
    source_descriptor: dict[str, Any]
    source_hash: str
    source_ordinal: int = -1


@dataclass
class AcceptedCandidate:
    prime: PrimeIdealCandidate
    reduced_generators: list[Any]
    full_image: MatrixGroupEnumeration
    spherical_checks: list[dict[str, Any]]
    spherical_images: list[tuple[Any, MatrixGroupEnumeration, list[Any]]]
    relation_checks: list[dict[str, Any]]
    full_image_enumerated: bool


def positive_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise shared.InputError(f"{name} must be a positive integer")
    return value


def exact_scalar_token(value: Any) -> str:
    """Serialize an exact scalar without a floating-point round trip."""

    numerator = getattr(value, "numerator", None)
    denominator = getattr(value, "denominator", None)
    if callable(numerator) and callable(denominator):
        top = int(numerator())
        bottom = int(denominator())
        return str(top) if bottom == 1 else f"{top}/{bottom}"
    return str(value)


def number_field_element_token(value: Any) -> list[str]:
    """Return power-basis coefficients for an exact number-field element."""

    coefficients = value.list() if hasattr(value, "list") else [value]
    return [exact_scalar_token(coefficient) for coefficient in coefficients]


def normalize_finite_field_coefficients(
    coefficients: Sequence[Any], characteristic: int, width: int
) -> list[int]:
    """Encode coefficients low-degree first in the standard prime subfield."""

    if characteristic < 2 or width < 1:
        raise ValueError("A finite-field encoding needs p >= 2 and positive width")
    normalized = [int(coefficient) % characteristic for coefficient in coefficients]
    if len(normalized) > width:
        raise ExactInvariantError(
            f"Finite-field coefficient vector has length {len(normalized)}, "
            f"expected at most {width}."
        )
    return [*normalized, *([0] * (width - len(normalized)))]


def finite_field_encoding_descriptor(
    residue_field: Any, characteristic: int, degree: int
) -> dict[str, Any]:
    """Describe GF(p^f) in a deterministic polynomial basis.

    Coefficients are stored low-degree first.  This format is intentionally
    embedded in the Sage artifact; the isolated GAP bridge still accepts only
    prime-field integer matrices.
    """

    if degree == 1:
        modulus_coefficients = [0, 1]
    else:
        modulus_method = getattr(residue_field, "modulus", None)
        if not callable(modulus_method):
            raise ExactInvariantError(
                "Cannot encode an extension residue field without its modulus."
            )
        modulus = modulus_method()
        raw_coefficients = modulus.list() if hasattr(modulus, "list") else None
        if raw_coefficients is None:
            raise ExactInvariantError(
                "The extension-field modulus has no exact coefficient list."
            )
        modulus_coefficients = normalize_finite_field_coefficients(
            raw_coefficients, characteristic, degree + 1
        )
        if modulus_coefficients[-1] != 1:
            raise ExactInvariantError(
                "The finite-field defining polynomial is not monic."
            )
    return {
        "format": "finite-field-polynomial-basis-v1",
        "characteristic": characteristic,
        "degree": degree,
        "order": characteristic**degree,
        "basis": ["1", *[f"u^{power}" for power in range(1, degree)]],
        "definingPolynomialCoefficients": modulus_coefficients,
        "coefficientOrder": "low-degree-first",
    }


def finite_field_element_encoding(
    value: Any, characteristic: int, degree: int
) -> list[int]:
    """Encode one residue-field element in the source's polynomial basis."""

    if degree == 1:
        coefficients = [value]
    else:
        polynomial_method = getattr(value, "polynomial", None)
        if callable(polynomial_method):
            polynomial = polynomial_method()
            coefficients = polynomial.list() if hasattr(polynomial, "list") else None
        else:
            coefficients = value.list() if hasattr(value, "list") else None
        if coefficients is None:
            raise ExactInvariantError(
                "Cannot encode an extension-field element in polynomial basis."
            )
    return normalize_finite_field_coefficients(coefficients, characteristic, degree)


def encoded_residue_generators(
    generators: Sequence[Any], candidate: "PrimeIdealCandidate"
) -> dict[str, Any]:
    """Serialize exact residue matrices without creating a GAP bridge file."""

    degree = int(candidate.ideal.residue_class_degree())
    characteristic = candidate.rational_prime
    return {
        "schemaVersion": 1,
        "format": "finite-field-polynomial-basis-matrices-v1",
        "field": candidate.source_descriptor["finiteFieldEncoding"],
        "gapPrimeFieldBridgeCompatible": degree == 1,
        "generators": [
            [
                [
                    finite_field_element_encoding(
                        generator[row, column], characteristic, degree
                    )
                    for column in range(generator.ncols())
                ]
                for row in range(generator.nrows())
            ]
            for generator in generators
        ],
    }


def congruence_source_descriptor(
    *,
    conductor: int,
    defining_polynomial: str,
    rational_prime: int,
    ideal_basis: Sequence[Sequence[str]],
    ideal_norm: int,
    residue_degree: int,
    residue_field_order: int,
    ramification_index: int | None,
    finite_field_encoding: dict[str, Any],
) -> dict[str, Any]:
    """Describe one exact reduction source independently of Sage object ids.

    The ideal basis distinguishes conjugate primes above the same rational
    prime.  Hashing this record is stable across process restarts and does not
    depend on Sage's display name for a finite-field generator.
    """

    return {
        "schemaVersion": 1,
        "kind": (
            "prime-field-residue" if residue_degree == 1 else "extension-field-residue"
        ),
        "coefficientModel": "cyclotomic-standard-tits-integral",
        "coefficientField": {
            "kind": "cyclotomic",
            "conductor": conductor,
            "definingPolynomial": defining_polynomial,
        },
        "rationalPrime": rational_prime,
        "primeIdeal": {
            "basis": [list(row) for row in ideal_basis],
            "norm": ideal_norm,
            "ramificationIndex": ramification_index,
        },
        "residueField": {
            "characteristic": rational_prime,
            "degree": residue_degree,
            "order": residue_field_order,
        },
        "finiteFieldEncoding": finite_field_encoding,
        "gapMatrixBridge": {
            "compatible": residue_degree == 1,
            "boundary": "isolated-gap-bridge-prime-fields-only",
        },
    }


def congruence_source_hash(descriptor: dict[str, Any]) -> str:
    """Hash the exact coefficient field, prime ideal, and residue field."""

    return shared.sha256_text(shared.canonical_json(descriptor))


def source_record_sort_key(record: dict[str, Any]) -> tuple[int, int, int, str]:
    """Order congruence sources independently of Sage's ideal iteration order."""

    residue = record["descriptor"]["residueField"]
    return (
        int(record["descriptor"]["rationalPrime"]),
        int(residue["order"]),
        int(residue["degree"]),
        str(record["sourceHash"]),
    )


def should_materialize_action(image_order: int | None, action_degree_cap: int) -> bool:
    """Return whether allocating the regular permutation action is permitted."""

    return image_order is not None and image_order <= action_degree_cap


def general_linear_group_order(dimension: int, field_order: int) -> int:
    """Return the exact order of GL(dimension, field_order)."""

    if dimension < 1 or field_order < 2:
        raise ValueError("GL(n,q) requires n >= 1 and q >= 2")
    return math.prod(
        field_order**dimension - field_order**column for column in range(dimension)
    )


def read_request(
    path: Path, args: argparse.Namespace
) -> tuple[str, str, dict[str, Any], list[list[int]], dict[str, int], list[Any]]:
    text = path.read_text(encoding="utf8")
    cli_bounds = {
        "maxIndex": args.max_index,
        "maxCandidates": args.max_candidates,
        "maxWitnesses": args.max_witnesses,
        "maxSphericalOrder": args.max_spherical_order,
        "maxSubsets": args.max_subsets,
        "timeoutSeconds": args.timeout,
    }
    source, coxeter_matrix, bounds, request = shared.parse_request(text, cli_bounds)
    search = request.get("search", {}) if isinstance(request, dict) else {}
    requested_max_prime = (
        args.max_prime
        if args.max_prime is not None
        else search.get("maxCongruencePrime", DEFAULT_MAX_CONGRUENCE_PRIME)
    )
    bounds["maxCongruencePrime"] = positive_int(
        requested_max_prime, "search.maxCongruencePrime"
    )
    requested_image_order = (
        args.max_image_order
        if args.max_image_order is not None
        else search.get(
            "maxCongruenceImageOrder",
            bounds.get("maxCongruenceImageOrder", bounds["maxIndex"]),
        )
    )
    bounds["maxCongruenceImageOrder"] = positive_int(
        requested_image_order, "search.maxCongruenceImageOrder"
    )
    requested_residue_degree = (
        args.max_residue_degree
        if args.max_residue_degree is not None
        else search.get("maxCongruenceResidueDegree", DEFAULT_MAX_RESIDUE_DEGREE)
    )
    bounds["maxCongruenceResidueDegree"] = positive_int(
        requested_residue_degree, "search.maxCongruenceResidueDegree"
    )
    requested_action_degree = (
        args.max_action_degree
        if args.max_action_degree is not None
        else search.get("maxCongruenceActionDegree", bounds["maxIndex"])
    )
    bounds["maxCongruenceActionDegree"] = positive_int(
        requested_action_degree, "search.maxCongruenceActionDegree"
    )
    spherical = shared.maximal_spherical_subsets(coxeter_matrix, bounds)
    return (
        text,
        shared.sha256_text(text),
        source,
        coxeter_matrix,
        bounds,
        spherical,
    )


def cyclotomic_conductor(coxeter_matrix: Sequence[Sequence[int]]) -> int:
    labels = [
        2 * coxeter_matrix[i][j]
        for i in range(len(coxeter_matrix))
        for j in range(i + 1, len(coxeter_matrix))
        if coxeter_matrix[i][j] >= 3
    ]
    # CyclotomicField(1) is QQ in Sage and has no primes_above API.  Q(i) is
    # harmless when every coefficient is rational, so conductor 4 is the
    # bounded fallback for right-angled/universal systems.
    return math.lcm(*labels) if labels else 4


def tits_coefficient(field: Any, zeta: Any, conductor: int, m: int) -> Any:
    if m == 0:
        # The standard geometric representation takes B_ij=-1 when m_ij=inf.
        return field(2)
    if m == 2:
        return field(0)
    divisor = 2 * m
    if conductor % divisor != 0:
        raise ExactInvariantError(
            f"Cyclotomic conductor {conductor} is not divisible by 2m={divisor}."
        )
    exponent = conductor // divisor
    return zeta**exponent + zeta ** (-exponent)


def build_tits_generators(
    coxeter_matrix: Sequence[Sequence[int]],
) -> tuple[Any, int, list[Any]]:
    """Build the integral standard reflection matrices exactly.

    Matrix columns are images of the simple-root basis.  Thus generator i is
    the identity except in row i, where the diagonal is -1 and column j is
    2*cos(pi/m_ij), or 2 for an infinite Coxeter entry.
    """

    rank = len(coxeter_matrix)
    conductor = cyclotomic_conductor(coxeter_matrix)
    field = CyclotomicField(conductor)
    zeta = field.gen()
    generators: list[Any] = []
    for i in range(rank):
        rows = [
            [field(1 if row == column else 0) for column in range(rank)]
            for row in range(rank)
        ]
        rows[i][i] = field(-1)
        for j in range(rank):
            if i != j:
                rows[i][j] = tits_coefficient(
                    field, zeta, conductor, coxeter_matrix[i][j]
                )
        generators.append(matrix(field, rows))

    integers = field.ring_of_integers()
    for generator in generators:
        for entry in generator.list():
            try:
                integers(entry)
            except (TypeError, ValueError) as exc:
                raise ExactInvariantError(
                    f"A Tits matrix entry is not integral: {entry}."
                ) from exc
    check_coxeter_relations(generators, coxeter_matrix, "number-field")
    return field, conductor, generators


def matrix_key(value: Any) -> tuple[Any, ...]:
    return tuple(value.list())


def matrix_power(value: Any, exponent: int) -> Any:
    result = identity_matrix(value.base_ring(), value.nrows())
    factor = value
    power = exponent
    while power:
        if power & 1:
            result = result * factor
        factor = factor * factor
        power >>= 1
    return result


def check_coxeter_relations(
    generators: Sequence[Any],
    coxeter_matrix: Sequence[Sequence[int]],
    phase: str,
    *,
    raise_on_failure: bool = True,
) -> list[dict[str, Any]]:
    identity = identity_matrix(generators[0].base_ring(), len(generators))
    checks: list[dict[str, Any]] = []
    for i, generator in enumerate(generators):
        passed = generator * generator == identity
        checks.append(
            {
                "kind": "involution",
                "generators": [i, i],
                "exponent": 2,
                "passed": passed,
                "phase": phase,
            }
        )
        if not passed and raise_on_failure:
            raise ExactInvariantError(
                f"Tits generator {i} is not an involution during {phase}."
            )
    for i in range(len(generators)):
        for j in range(i + 1, len(generators)):
            m = coxeter_matrix[i][j]
            if m == 0:
                continue
            passed = matrix_power(generators[i] * generators[j], m) == identity
            checks.append(
                {
                    "kind": "coxeter",
                    "generators": [i, j],
                    "exponent": m,
                    "passed": passed,
                    "phase": phase,
                }
            )
            if not passed and raise_on_failure:
                raise ExactInvariantError(
                    f"Coxeter relation ({i},{j})^{m} failed during {phase}."
                )
    return checks


def enumerate_matrix_group(
    generators: Sequence[Any],
    generator_labels: Sequence[int],
    cap: int,
    deadline: Deadline,
    operation: str,
) -> MatrixGroupEnumeration:
    if not generators:
        raise ExactInvariantError("A matrix image needs at least one generator.")
    identity = identity_matrix(generators[0].base_ring(), generators[0].nrows())
    elements = [identity]
    words: list[tuple[int, ...]] = [()]
    key_to_index = {matrix_key(identity): 0}
    transitions: list[list[int]] = [[] for _ in generators]
    cursor = 0
    while cursor < len(elements):
        deadline.check(operation)
        current = elements[cursor]
        for local_generator, generator in enumerate(generators):
            product = current * generator
            key = matrix_key(product)
            target = key_to_index.get(key)
            if target is None:
                if len(elements) >= cap:
                    return MatrixGroupEnumeration(
                        complete=False,
                        elements=elements,
                        words=words,
                        transitions=transitions,
                        key_to_index=key_to_index,
                        cap=cap,
                    )
                target = len(elements)
                key_to_index[key] = target
                elements.append(product)
                words.append((*words[cursor], generator_labels[local_generator]))
            transitions[local_generator].append(target)
        cursor += 1
    return MatrixGroupEnumeration(
        complete=True,
        elements=elements,
        words=words,
        transitions=transitions,
        key_to_index=key_to_index,
        cap=cap,
    )


def rational_primes(limit: int) -> Iterable[int]:
    prime = 1
    while True:
        prime = int(next_prime(prime))
        if prime > limit:
            return
        yield prime


def prime_ideal_candidates(
    field: Any,
    conductor: int,
    max_prime: int,
    deadline: Deadline,
) -> Iterable[PrimeIdealCandidate]:
    """Enumerate every prime ideal above every rational prime in the bound."""

    records: list[dict[str, Any]] = []
    defining_polynomial = str(field.polynomial())
    for rational_prime in rational_primes(max_prime):
        deadline.check("factoring rational primes in the cyclotomic field")
        ideals = list(field.primes_above(rational_prime))
        for ideal in ideals:
            residue_degree = int(ideal.residue_class_degree())
            residue_field = ideal.residue_field()
            ramification_method = getattr(ideal, "ramification_index", None)
            ramification_index = (
                int(ramification_method()) if callable(ramification_method) else None
            )
            ideal_basis = [
                number_field_element_token(element) for element in ideal.basis()
            ]
            descriptor = congruence_source_descriptor(
                conductor=conductor,
                defining_polynomial=defining_polynomial,
                rational_prime=rational_prime,
                ideal_basis=ideal_basis,
                ideal_norm=int(ideal.norm()),
                residue_degree=residue_degree,
                residue_field_order=int(residue_field.order()),
                ramification_index=ramification_index,
                finite_field_encoding=finite_field_encoding_descriptor(
                    residue_field, rational_prime, residue_degree
                ),
            )
            records.append(
                {
                    "descriptor": descriptor,
                    "sourceHash": congruence_source_hash(descriptor),
                    "ideal": ideal,
                    "residueField": residue_field,
                }
            )

    records.sort(key=source_record_sort_key)
    for source_ordinal, record in enumerate(records):
        descriptor = record["descriptor"]
        residue_field = record["residueField"]
        yield PrimeIdealCandidate(
            rational_prime=int(descriptor["rationalPrime"]),
            ideal=record["ideal"],
            residue_field=residue_field,
            reduction_map=residue_field.reduction_map(),
            source_descriptor=descriptor,
            source_hash=str(record["sourceHash"]),
            source_ordinal=source_ordinal,
        )


def reduce_generators(
    generators: Sequence[Any], candidate: PrimeIdealCandidate
) -> list[Any]:
    reduced = []
    for generator in generators:
        rows = [
            [
                candidate.reduction_map(generator[row, column])
                for column in range(generator.ncols())
            ]
            for row in range(generator.nrows())
        ]
        reduced.append(matrix(candidate.residue_field, rows))
    return reduced


def inspect_prime_ideal(
    candidate: PrimeIdealCandidate,
    number_field_generators: Sequence[Any],
    coxeter_matrix: Sequence[Sequence[int]],
    spherical: Sequence[Any],
    bounds: dict[str, int],
    deadline: Deadline,
    *,
    enumerate_full_image: bool,
) -> tuple[AcceptedCandidate | None, dict[str, Any]]:
    attempt: dict[str, Any] = {
        "candidateId": f"congruence:{candidate.source_hash[:16]}",
        "sourceOrdinal": candidate.source_ordinal,
        "sourceKind": candidate.source_descriptor["kind"],
        "sourceHash": candidate.source_hash,
        "source": candidate.source_descriptor,
        "rationalPrime": candidate.rational_prime,
        "primeIdeal": str(candidate.ideal),
        "primeIdealNorm": int(candidate.ideal.norm()),
        "residueDegree": int(candidate.ideal.residue_class_degree()),
        "residueFieldOrder": int(candidate.residue_field.order()),
    }
    reduced = reduce_generators(number_field_generators, candidate)
    attempt["matrixEncoding"] = encoded_residue_generators(reduced, candidate)
    relation_checks = check_coxeter_relations(
        reduced,
        coxeter_matrix,
        "residue-field",
        raise_on_failure=False,
    )
    relation_status = (
        "passed" if all(check["passed"] for check in relation_checks) else "failed"
    )
    attempt["exactRelationChecks"] = relation_checks
    attempt["exactRelationStatus"] = relation_status
    if relation_status == "failed":
        attempt.update(
            {
                "status": "rejected",
                "reason": "exact-coxeter-relation-failed-after-reduction",
                "sphericalRestrictionStatus": "not-run",
                "sphericalRestrictionChecks": [],
            }
        )
        return None, attempt

    spherical_checks: list[dict[str, Any]] = []
    spherical_images: list[tuple[Any, MatrixGroupEnumeration, list[Any]]] = []
    for subgroup in spherical:
        deadline.check(f"checking spherical subgroup {list(subgroup.subset)}")
        subset = list(subgroup.subset)
        subset_generators = [reduced[index] for index in subset]
        image = enumerate_matrix_group(
            subset_generators,
            subset,
            subgroup.expected_order,
            deadline,
            f"enumerating spherical image {list(subgroup.subset)}",
        )
        image_order = image.order
        if not image.complete:
            raise ExactInvariantError(
                "A reduced spherical image exceeded its classified source order "
                f"for subset {subset}."
            )
        faithful = image_order == subgroup.expected_order
        spherical_checks.append(
            {
                "subset": subset,
                "type": subgroup.type_name,
                "expectedOrder": subgroup.expected_order,
                "imageOrder": image_order,
                "injective": faithful,
            }
        )
        spherical_images.append((subgroup, image, subset_generators))
        if not faithful:
            attempt.update(
                {
                    "status": "rejected",
                    "reason": "spherical-restriction-not-injective",
                    "sphericalRestrictionStatus": "failed",
                    "sphericalRestrictionChecks": spherical_checks,
                }
            )
            return None, attempt

    if not enumerate_full_image:
        attempt.update(
            {
                "status": "accepted-kernel-source-not-enumerated",
                "reason": "exact-relations-and-spherical-injectivity-pass",
                "fullImageEnumerationStatus": "not-run-bounded-portfolio",
                "sphericalRestrictionStatus": "passed",
                "sphericalRestrictionChecks": spherical_checks,
            }
        )
        return (
            AcceptedCandidate(
                prime=candidate,
                reduced_generators=reduced,
                full_image=MatrixGroupEnumeration(
                    complete=False,
                    elements=[],
                    words=[],
                    transitions=[],
                    key_to_index={},
                    cap=0,
                ),
                spherical_checks=spherical_checks,
                spherical_images=spherical_images,
                relation_checks=relation_checks,
                full_image_enumerated=False,
            ),
            attempt,
        )

    full_image = enumerate_matrix_group(
        reduced,
        list(range(len(reduced))),
        bounds["maxCongruenceImageOrder"],
        deadline,
        "enumerating the full congruence image",
    )
    if not full_image.complete:
        attempt.update(
            {
                "status": "certified-kernel-unmaterialized",
                "reason": "image-order-exceeds-enumeration-cap",
                "imageOrderLowerBound": bounds["maxCongruenceImageOrder"] + 1,
                "imageEnumerationCap": bounds["maxCongruenceImageOrder"],
                "actionDegreeCap": bounds["maxCongruenceActionDegree"],
                "sphericalRestrictionStatus": "passed",
                "sphericalRestrictionChecks": spherical_checks,
            }
        )
        return (
            AcceptedCandidate(
                prime=candidate,
                reduced_generators=reduced,
                full_image=full_image,
                spherical_checks=spherical_checks,
                spherical_images=spherical_images,
                relation_checks=relation_checks,
                full_image_enumerated=True,
            ),
            attempt,
        )

    materializable = should_materialize_action(
        full_image.order, bounds["maxCongruenceActionDegree"]
    )
    attempt.update(
        {
            "status": (
                "accepted-materializable"
                if materializable
                else "certified-kernel-unmaterialized"
            ),
            "reason": (
                "faithful-spherical-kernel-and-bounded-regular-action"
                if materializable
                else "faithful-spherical-kernel-action-exceeds-materialization-cap"
            ),
            "imageOrder": full_image.order,
            "actionDegreeCap": bounds["maxCongruenceActionDegree"],
            "sphericalRestrictionStatus": "passed",
            "sphericalRestrictionChecks": spherical_checks,
        }
    )
    return (
        AcceptedCandidate(
            prime=candidate,
            reduced_generators=reduced,
            full_image=full_image,
            spherical_checks=spherical_checks,
            spherical_images=spherical_images,
            relation_checks=relation_checks,
            full_image_enumerated=True,
        ),
        attempt,
    )


def prime_ideal_report(
    candidates: Sequence[PrimeIdealCandidate],
    attempts: Sequence[dict[str, Any]],
    bounds: dict[str, int],
) -> dict[str, Any]:
    """Group every enumerated prime ideal and attach its exact check status."""

    attempt_by_hash = {
        str(attempt["sourceHash"]): attempt
        for attempt in attempts
        if isinstance(attempt.get("sourceHash"), str)
    }
    eligible = [
        candidate
        for candidate in candidates
        if int(candidate.ideal.residue_class_degree())
        <= bounds["maxCongruenceResidueDegree"]
    ]
    candidate_bound_hashes = {
        candidate.source_hash for candidate in eligible[: bounds["maxCandidates"]]
    }
    grouped: dict[int, list[dict[str, Any]]] = {}
    for candidate in candidates:
        residue_degree = int(candidate.ideal.residue_class_degree())
        attempt = attempt_by_hash.get(candidate.source_hash)
        if attempt is not None:
            accepted = attempt.get("status") in {
                "accepted-materializable",
                "accepted-kernel-source-not-enumerated",
                "certified-kernel-unmaterialized",
            }
            decision = "accepted" if accepted else "rejected"
            exact_relation_status = str(attempt.get("exactRelationStatus", "not-run"))
            spherical_status = str(attempt.get("sphericalRestrictionStatus", "not-run"))
            reason = str(attempt.get("reason", "checked"))
        elif residue_degree > bounds["maxCongruenceResidueDegree"]:
            decision = "not-inspected"
            exact_relation_status = "not-run"
            spherical_status = "not-run"
            reason = "residue-degree-bound"
        elif candidate.source_hash not in candidate_bound_hashes:
            decision = "not-inspected"
            exact_relation_status = "not-run"
            spherical_status = "not-run"
            reason = "candidate-count-bound"
        else:
            decision = "not-inspected"
            exact_relation_status = "not-run"
            spherical_status = "not-run"
            reason = "search-stopped-after-materializable-source"
        grouped.setdefault(candidate.rational_prime, []).append(
            {
                "sourceOrdinal": candidate.source_ordinal,
                "sourceHash": candidate.source_hash,
                "sourceKind": candidate.source_descriptor["kind"],
                "ideal": str(candidate.ideal),
                "idealBasis": candidate.source_descriptor["primeIdeal"]["basis"],
                "norm": int(candidate.ideal.norm()),
                "residueDegree": residue_degree,
                "q": int(candidate.residue_field.order()),
                "decision": decision,
                "exactRelationStatus": exact_relation_status,
                "sphericalRestrictionStatus": spherical_status,
                "reason": reason,
                "gapPrimeFieldBridgeCompatible": residue_degree == 1,
            }
        )
    prime_records = [
        {
            "rationalPrime": rational_prime,
            "ideals": sorted(records, key=lambda record: int(record["sourceOrdinal"])),
        }
        for rational_prime, records in sorted(grouped.items())
    ]
    complete_inspection = all(
        ideal["decision"] in {"accepted", "rejected"}
        for prime in prime_records
        for ideal in prime["ideals"]
    )
    return {
        "completeIdealEnumerationWithinPrimeBound": True,
        "completeExactInspection": complete_inspection,
        "maxRationalPrime": bounds["maxCongruencePrime"],
        "maxInspectedResidueDegree": bounds["maxCongruenceResidueDegree"],
        "maxInspectedCandidates": bounds["maxCandidates"],
        "sourceCatalogueHash": shared.sha256_text(
            shared.canonical_json(
                [
                    {
                        "sourceHash": candidate.source_hash,
                        "source": candidate.source_descriptor,
                    }
                    for candidate in candidates
                ]
            )
        ),
        "gapMatrixBridge": {
            "status": "prime-fields-only",
            "supportedResidueDegrees": [1],
            "extensionFieldPolicy": (
                "GF(p^f) matrices remain in deterministic Sage polynomial-basis "
                "encoding and are not written to the isolated GAP recognizer file."
            ),
        },
        "rationalPrimes": prime_records,
    }


def element_order(element: Any, group_order: int) -> int:
    identity = identity_matrix(element.base_ring(), element.nrows())
    product = identity
    for order in range(1, group_order + 1):
        product = product * element
        if product == identity:
            return order
    raise ExactInvariantError(
        "A finite spherical image element order did not divide its group order."
    )


def is_prime_integer(value: int) -> bool:
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


def conjugacy_class_indices(
    enumeration: MatrixGroupEnumeration,
    generators: Sequence[Any],
    seed: int,
    deadline: Deadline,
) -> set[int]:
    orbit = {seed}
    queue = [seed]
    cursor = 0
    while cursor < len(queue):
        deadline.check("enumerating spherical conjugacy classes")
        element = enumeration.elements[queue[cursor]]
        cursor += 1
        # Coxeter generators are involutions, so g*x*g is conjugation by g.
        for generator in generators:
            conjugate = generator * element * generator
            target = enumeration.key_to_index.get(matrix_key(conjugate))
            if target is None:
                raise ExactInvariantError(
                    "A spherical image was not closed under conjugation."
                )
            if target not in orbit:
                orbit.add(target)
                queue.append(target)
    return orbit


def enumerate_prime_order_witnesses(
    spherical_images: Sequence[tuple[Any, MatrixGroupEnumeration, list[Any]]],
    max_witnesses: int,
    deadline: Deadline,
) -> list[dict[str, Any]]:
    witnesses: list[dict[str, Any]] = []
    for subgroup, image, generators in spherical_images:
        if not image.complete or image.order != subgroup.expected_order:
            raise ExactInvariantError(
                "Witness enumeration requires an injective spherical image."
            )
        visited = {0}
        for seed in range(1, len(image.elements)):
            if seed in visited:
                continue
            conjugacy_class = conjugacy_class_indices(image, generators, seed, deadline)
            visited.update(conjugacy_class)
            order = element_order(image.elements[seed], subgroup.expected_order)
            if not is_prime_integer(order):
                continue
            representative = min(
                conjugacy_class,
                key=lambda index: (len(image.words[index]), image.words[index]),
            )
            witnesses.append(
                {
                    "subset": list(subgroup.subset),
                    "sphericalType": subgroup.type_name,
                    "sphericalOrder": subgroup.expected_order,
                    "primeOrder": order,
                    "classSize": len(conjugacy_class),
                    "word": list(image.words[representative]),
                }
            )
            if len(witnesses) > max_witnesses:
                raise shared.CatalogueLimit(
                    "Exact spherical prime-order class enumeration exceeds "
                    f"maxWitnesses={max_witnesses}."
                )
    witnesses.sort(
        key=lambda item: (
            item["subset"],
            item["primeOrder"],
            len(item["word"]),
            item["word"],
        )
    )
    for index, witness in enumerate(witnesses):
        witness["id"] = f"tw{index}"
    if not witnesses:
        raise ExactInvariantError(
            "A nonempty Coxeter system produced no torsion witnesses."
        )
    return witnesses


def freely_reduce_involutions(word: Sequence[int]) -> list[int]:
    reduced: list[int] = []
    for letter in word:
        if reduced and reduced[-1] == letter:
            reduced.pop()
        else:
            reduced.append(letter)
    return reduced


def evaluate_word_matrix(word: Sequence[int], generators: Sequence[Any]) -> Any:
    result = identity_matrix(generators[0].base_ring(), generators[0].nrows())
    for letter in word:
        result = result * generators[letter]
    return result


def subgroup_generators_from_regular_action(
    image: MatrixGroupEnumeration,
    faithful_generators: Sequence[Any],
) -> list[list[int]]:
    """Return Schreier generators for the kernel of the regular image action."""

    words: set[tuple[int, ...]] = set()
    for point, representative in enumerate(image.words):
        for generator, targets in enumerate(image.transitions):
            target = targets[point]
            schreier_word = freely_reduce_involutions(
                [*representative, generator, *reversed(image.words[target])]
            )
            if schreier_word:
                words.add(tuple(schreier_word))
    identity = identity_matrix(
        faithful_generators[0].base_ring(), faithful_generators[0].nrows()
    )
    # Schreier's construction works with presentation words.  Removing words
    # that are already the identity in the faithful Tits representation keeps
    # the exported subgroup generating set honest (and empty for a trivial
    # kernel such as the finite I2(5) and A3 self-test cases).
    nonidentity_words = [
        word
        for word in words
        if evaluate_word_matrix(word, faithful_generators) != identity
    ]
    return [
        list(word)
        for word in sorted(nonidentity_words, key=lambda item: (len(item), item))
    ]


def apply_word_to_point(
    point: int, word: Sequence[int], transitions: Sequence[Sequence[int]]
) -> int:
    current = point
    for generator in word:
        current = transitions[generator][current]
    return current


def build_finite_action(
    source: dict[str, Any],
    image: MatrixGroupEnumeration,
    faithful_generators: Sequence[Any],
) -> dict[str, Any]:
    if not image.complete or image.order is None:
        raise ExactInvariantError("A regular action requires a complete finite image.")
    degree = image.order
    vertices = [
        {"id": f"q{index}", "representativeWord": list(image.words[index])}
        for index in range(degree)
    ]
    generator_actions = []
    edges = []
    for generator, targets in enumerate(image.transitions):
        images = [f"q{target}" for target in targets]
        generator_actions.append({"generator": generator, "images": images})
        label = source["generators"][generator].get("label", f"s{generator}")
        for point, target in enumerate(targets):
            source_id = f"q{point}"
            target_id = f"q{target}"
            edges.append(
                {
                    "id": f"qe:{source_id}:g{generator}:{target_id}",
                    "source": source_id,
                    "target": target_id,
                    "generator": generator,
                    "label": label,
                }
            )
    return {
        "degree": degree,
        "vertices": vertices,
        "generatorActions": generator_actions,
        "edges": edges,
        "subgroupGenerators": subgroup_generators_from_regular_action(
            image, faithful_generators
        ),
        "cosetConvention": (
            "Regular right action of the finite congruence image; q0 is the "
            "congruence-kernel base coset"
        ),
    }


def no_fixed_point_checks(
    witnesses: Sequence[dict[str, Any]], image: MatrixGroupEnumeration
) -> list[dict[str, Any]]:
    if image.order is None:
        raise ExactInvariantError(
            "Fixed-point checks require a complete finite action."
        )
    checks = []
    for witness in witnesses:
        fixed = [
            f"q{point}"
            for point in range(image.order)
            if apply_word_to_point(point, witness["word"], image.transitions) == point
        ]
        checks.append(
            {
                "witnessId": witness["id"],
                "word": witness["word"],
                "primeOrder": witness["primeOrder"],
                "fixedVertexIds": fixed,
                "passed": not fixed,
            }
        )
    return checks


def catalogue_json(
    spherical: Sequence[Any],
    checks: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    check_by_subset = {tuple(check["subset"]): check for check in (checks or [])}
    records = []
    for subgroup in spherical:
        record = {
            "subset": list(subgroup.subset),
            "type": subgroup.type_name,
            "order": subgroup.expected_order,
        }
        check = check_by_subset.get(tuple(subgroup.subset))
        if check:
            record.update(
                {
                    "congruenceImageOrder": check["imageOrder"],
                    "congruenceRestrictionInjective": check["injective"],
                }
            )
        records.append(record)
    return {
        "complete": True,
        "method": "complete-finite-coxeter-classification+exact-congruence-restrictions",
        "maximalSubgroups": records,
    }


def base_artifact(
    source: dict[str, Any],
    input_hash: str,
    bounds: dict[str, int],
    status: str,
    ok: bool,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "artifactType": ARTIFACT_TYPE,
        "status": status,
        "ok": ok,
        "sourceSystem": source,
        "inputHash": input_hash,
        "bounds": bounds,
        "warnings": [],
        "errors": [],
    }


def provenance(
    input_hash: str,
    field: Any | None = None,
    conductor: int | None = None,
    candidate: PrimeIdealCandidate | None = None,
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "sageVersion": str(sage_version),
        "runtime": "sage",
        "command": "sage scripts/sage_congruence_torsion_free.py --input <request>",
        "inputHash": input_hash,
    }
    if field is not None:
        value["coefficientField"] = str(field)
        value["cyclotomicConductor"] = conductor
    if candidate is not None:
        value["congruenceSourceHash"] = candidate.source_hash
        value["congruenceSource"] = candidate.source_descriptor
        value["rationalPrime"] = candidate.rational_prime
        value["primeIdeal"] = str(candidate.ideal)
        value["primeIdealNorm"] = int(candidate.ideal.norm())
        value["residueFieldOrder"] = int(candidate.residue_field.order())
    return value


def finalize_artifact(artifact: dict[str, Any]) -> dict[str, Any]:
    return shared.add_artifact_hash(artifact)


def failed_artifact(
    source: dict[str, Any],
    input_hash: str,
    bounds: dict[str, int],
    error: str,
    status: str = "failed",
) -> dict[str, Any]:
    artifact = base_artifact(source, input_hash, bounds, status, False)
    artifact["errors"].append(error)
    artifact["provenance"] = provenance(input_hash)
    return finalize_artifact(artifact)


def discover_path(
    args: argparse.Namespace, input_path: Path
) -> tuple[dict[str, Any], int]:
    input_hash = shared.sha256_text(input_path.read_text(encoding="utf8"))
    source: dict[str, Any] = {
        "name": "invalid input",
        "rank": 0,
        "generators": [],
        "coxeterMatrix": [],
    }
    bounds = {
        **shared.DEFAULT_BOUNDS,
        "maxCongruencePrime": DEFAULT_MAX_CONGRUENCE_PRIME,
    }
    try:
        _, input_hash, source, coxeter_matrix, bounds, spherical = read_request(
            input_path, args
        )
    except shared.CatalogueLimit as exc:
        artifact = base_artifact(source, input_hash, bounds, "skipped", True)
        artifact["warnings"].append(str(exc))
        artifact["provenance"] = provenance(input_hash)
        return finalize_artifact(artifact), 0
    except Exception as exc:  # noqa: BLE001 - stable external artifact boundary
        return failed_artifact(source, input_hash, bounds, str(exc)), 1

    deadline = Deadline(bounds["timeoutSeconds"])
    try:
        field, conductor, number_field_generators = build_tits_generators(
            coxeter_matrix
        )
        attempts: list[dict[str, Any]] = []
        accepted: AcceptedCandidate | None = None
        all_candidates = list(
            prime_ideal_candidates(
                field,
                conductor,
                bounds["maxCongruencePrime"],
                deadline,
            )
        )
        full_image_candidates = [
            candidate
            for candidate in all_candidates
            if int(candidate.ideal.residue_class_degree())
            <= bounds["maxCongruenceResidueDegree"]
        ][: bounds["maxCandidates"]]
        full_image_hashes = {
            candidate.source_hash for candidate in full_image_candidates
        }
        materializable_found = False
        for candidate in all_candidates:
            certified, attempt = inspect_prime_ideal(
                candidate,
                number_field_generators,
                coxeter_matrix,
                spherical,
                bounds,
                deadline,
                enumerate_full_image=(
                    candidate.source_hash in full_image_hashes
                    and not materializable_found
                ),
            )
            attempts.append(attempt)
            if certified is None:
                continue
            candidate_materializable = should_materialize_action(
                certified.full_image.order,
                bounds["maxCongruenceActionDegree"],
            )
            accepted_materializable = (
                accepted is not None
                and should_materialize_action(
                    accepted.full_image.order,
                    bounds["maxCongruenceActionDegree"],
                )
            )
            if accepted is None or (
                candidate_materializable and not accepted_materializable
            ):
                accepted = certified
            materializable_found = materializable_found or candidate_materializable
        ideal_report = prime_ideal_report(all_candidates, attempts, bounds)
    except SearchDeadline as exc:
        artifact = failed_artifact(source, input_hash, bounds, str(exc), "timeout")
        return artifact, 2
    except Exception as exc:  # noqa: BLE001 - exact backend boundary
        artifact = failed_artifact(source, input_hash, bounds, str(exc))
        return artifact, 1

    if accepted is None:
        artifact = base_artifact(source, input_hash, bounds, "exhausted", True)
        artifact["sphericalCatalogue"] = catalogue_json(spherical)
        artifact["primeIdealReport"] = ideal_report
        artifact["search"] = {
            "method": "exact-cyclotomic-tits-congruence",
            "selectedStrategy": "sage-congruence-kernel",
            "candidatesChecked": len(attempts),
            "maxCandidates": bounds["maxCandidates"],
            "maxRationalPrime": bounds["maxCongruencePrime"],
            "maxResidueDegree": bounds["maxCongruenceResidueDegree"],
            "imageEnumerationCap": bounds["maxCongruenceImageOrder"],
            "actionDegreeCap": bounds["maxCongruenceActionDegree"],
            "sourceCatalogueHash": ideal_report["sourceCatalogueHash"],
            "attempts": attempts,
            "reason": "bounded-congruence-search-exhausted",
        }
        artifact["warnings"].append(
            "No congruence image within the configured prime-ideal and action-degree "
            "bounds was faithful on every maximal spherical subgroup."
        )
        artifact["provenance"] = provenance(input_hash, field, conductor)
        return finalize_artifact(artifact), 0

    try:
        witnesses = enumerate_prime_order_witnesses(
            accepted.spherical_images, bounds["maxWitnesses"], deadline
        )
        action_materialized = should_materialize_action(
            accepted.full_image.order,
            bounds["maxCongruenceActionDegree"],
        )
        fixed_checks = (
            no_fixed_point_checks(witnesses, accepted.full_image)
            if action_materialized
            else []
        )
        all_fixed_point_free = all(check["passed"] for check in fixed_checks)
        all_spherical_injective = all(
            check["injective"] for check in accepted.spherical_checks
        )
        all_relations_pass = all(check["passed"] for check in accepted.relation_checks)
        certificate_passed = (
            bool(witnesses)
            and all_spherical_injective
            and all_relations_pass
            and (not action_materialized or all_fixed_point_free)
        )
        finite_action = (
            build_finite_action(source, accepted.full_image, number_field_generators)
            if action_materialized
            else None
        )
    except SearchDeadline as exc:
        return failed_artifact(source, input_hash, bounds, str(exc), "timeout"), 2
    except Exception as exc:  # noqa: BLE001 - certificate construction boundary
        return failed_artifact(source, input_hash, bounds, str(exc)), 1

    artifact = base_artifact(
        source,
        input_hash,
        bounds,
        "passed" if certificate_passed else "failed",
        certificate_passed,
    )
    artifact["sphericalCatalogue"] = catalogue_json(
        spherical, accepted.spherical_checks
    )
    artifact["primeIdealReport"] = ideal_report
    artifact["torsionWitnesses"] = witnesses
    artifact["search"] = {
        "method": "exact-cyclotomic-tits-congruence",
        "selectedStrategy": "sage-congruence-kernel",
        "candidatesChecked": len(attempts),
        "maxCandidates": bounds["maxCandidates"],
        "maxRationalPrime": bounds["maxCongruencePrime"],
        "maxResidueDegree": bounds["maxCongruenceResidueDegree"],
        "imageEnumerationCap": bounds["maxCongruenceImageOrder"],
        "actionDegreeCap": bounds["maxCongruenceActionDegree"],
        "sourceCatalogueHash": ideal_report["sourceCatalogueHash"],
        "attempts": attempts,
        "reason": (
            "faithful-spherical-congruence-kernel-and-action-found"
            if action_materialized
            else "faithful-spherical-congruence-kernel-found-action-unmaterialized"
        ),
    }
    if certificate_passed and finite_action is not None:
        artifact["finiteAction"] = finite_action
    elif certificate_passed:
        artifact["warnings"].append(
            "A torsion-free congruence kernel is certified, but its regular "
            "permutation action was not materialized within the configured bound."
        )
    else:
        artifact["errors"].append(
            "The congruence image was constructed, but its independent fixed-point "
            "and spherical-restriction certificate did not pass."
        )
    if int(accepted.prime.ideal.residue_class_degree()) > 1:
        artifact["warnings"].append(
            "The selected GF(p^f) source is encoded exactly in this Sage artifact. "
            "The current isolated GAP matrix bridge accepts prime fields only, so "
            "this matrix source is not exported to that recognizer."
        )
    artifact["certificate"] = {
        "status": "passed" if certificate_passed else "failed",
        "criterion": "tits-spherical-injectivity",
        "theoremBasis": [
            "faithful standard Tits reflection representation",
            "injective reduction on every maximal spherical special subgroup",
            "Tits torsion theorem for Coxeter groups",
            (
                "regular action of the exact finite congruence image"
                if action_materialized
                else "finite residue-field target without permutation materialization"
            ),
        ],
        "completeTorsionWitnessCatalogue": True,
        "completeSphericalRestrictionChecks": True,
        "regularActionMaterialized": action_materialized,
        "transitive": action_materialized,
        "fixedPointCheckStatus": (
            "passed" if action_materialized else "not-run-action-unmaterialized"
        ),
        "noFixedPointChecks": fixed_checks,
        "coxeterRelationChecks": accepted.relation_checks,
        "sphericalRestrictionChecks": accepted.spherical_checks,
        "claims": ["finite-index", "torsion-free"] if certificate_passed else [],
        "nonClaims": [
            "minimal index",
            "manifold",
            "virtual algebraic fibering",
        ],
        "explanation": (
            "Exact reduction is injective on every maximal spherical special "
            "subgroup. The kernel therefore contains no nonidentity spherical "
            "element; Tits' torsion theorem makes it torsion-free."
            + (
                " Prime-order class representatives were also checked in the "
                "materialized regular action."
                if action_materialized
                else " No regular permutation action was allocated."
            )
        ),
    }
    artifact["congruence"] = {
        "cyclotomicOrder": conductor,
        "sourceKind": accepted.prime.source_descriptor["kind"],
        "sourceHash": accepted.prime.source_hash,
        "source": accepted.prime.source_descriptor,
        "rationalPrime": accepted.prime.rational_prime,
        "primeIdeal": str(accepted.prime.ideal),
        "residueFieldOrder": int(accepted.prime.residue_field.order()),
        "imageOrder": accepted.full_image.order,
        "imageOrderExact": accepted.full_image.complete,
        "imageEnumerationStatus": (
            "complete"
            if accepted.full_image.complete
            else (
                "bounded-cap-exceeded"
                if accepted.full_image_enumerated
                else "not-run-bounded-portfolio"
            )
        ),
        "imageOrderLowerBound": (
            None
            if accepted.full_image.complete
            else (
                bounds["maxCongruenceImageOrder"] + 1
                if accepted.full_image_enumerated
                else 1
            )
        ),
        "imageOrderUpperBound": general_linear_group_order(
            len(coxeter_matrix), int(accepted.prime.residue_field.order())
        ),
        "regularActionMaterialized": action_materialized,
        "sphericalImageChecks": [
            {
                "subset": check["subset"],
                "expectedOrder": check["expectedOrder"],
                "imageOrder": check["imageOrder"],
                "passed": check["injective"],
            }
            for check in accepted.spherical_checks
        ],
    }
    artifact["coverOutcome"] = {
        "torsionFreeCoverCertified": certificate_passed,
        "manageableCoverMaterialized": bool(
            certificate_passed and finite_action is not None
        ),
        "status": (
            "materialized-cover-found"
            if certificate_passed and finite_action is not None
            else "kernel-certified-action-unmaterialized"
        ),
    }
    artifact["provenance"] = provenance(
        input_hash,
        field,
        conductor,
        accepted.prime,
    )
    return finalize_artifact(artifact), 0 if certificate_passed else 1


def runtime_status() -> tuple[dict[str, Any], int]:
    return {
        "ok": True,
        "status": "available",
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "sageVersion": str(sage_version),
        "message": "Exact cyclotomic Tits congruence reduction is available.",
    }, 0


def self_test(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    cases = [
        ("I2(5)", FIXTURE_DIR / "i2_5.discovery.json", 10),
        ("A3", FIXTURE_DIR / "a3.discovery.json", 24),
    ]
    results = []
    failed = False
    for name, path, expected_degree in cases:
        artifact, code = discover_path(args, path)
        passed = (
            code == 0
            and artifact.get("status") == "passed"
            and artifact.get("certificate", {}).get("status") == "passed"
            and artifact.get("finiteAction", {}).get("degree") == expected_degree
            and all(
                check.get("injective")
                for check in artifact.get("certificate", {}).get(
                    "sphericalRestrictionChecks", []
                )
            )
            and all(
                not check.get("fixedVertexIds")
                for check in artifact.get("certificate", {}).get(
                    "noFixedPointChecks", []
                )
            )
        )
        failed = failed or not passed
        results.append(
            {
                "name": name,
                "fixture": str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
                "expectedDegree": expected_degree,
                "actualDegree": artifact.get("finiteAction", {}).get("degree"),
                "status": artifact.get("status"),
                "passed": passed,
                "prime": artifact.get("provenance", {}).get("rationalPrime"),
                "residueFieldOrder": artifact.get("provenance", {}).get(
                    "residueFieldOrder"
                ),
                "errors": artifact.get("errors", []),
                "warnings": artifact.get("warnings", []),
            }
        )
    return {
        "ok": not failed,
        "status": "passed" if not failed else "failed",
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "sageVersion": str(sage_version),
        "cases": results,
    }, 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Find a bounded torsion-free Coxeter congruence kernel using exact "
            "Sage number fields and finite matrix images."
        )
    )
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-index", type=int)
    parser.add_argument("--max-candidates", type=int)
    parser.add_argument("--max-witnesses", type=int)
    parser.add_argument("--max-spherical-order", type=int)
    parser.add_argument("--max-subsets", type=int)
    parser.add_argument("--timeout", type=int)
    parser.add_argument("--max-prime", type=int)
    parser.add_argument("--max-image-order", type=int)
    parser.add_argument("--max-residue-degree", type=int)
    parser.add_argument("--max-action-degree", type=int)
    parser.add_argument("--check-runtime", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser


def write_result(value: dict[str, Any], output: Path | None) -> None:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if output is None:
        sys.stdout.write(text)
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text, encoding="utf8")


def main() -> int:
    args = build_parser().parse_args()
    if args.check_runtime:
        artifact, code = runtime_status()
    elif args.self_test:
        artifact, code = self_test(args)
    elif args.input is None:
        artifact = {
            "schemaVersion": 1,
            "artifactType": ARTIFACT_TYPE,
            "status": "skipped",
            "ok": True,
            "warnings": ["Pass --input with a Coxeter discovery request."],
            "errors": [],
            "provenance": {
                "backend": BACKEND_ID,
                "backendVersion": BACKEND_VERSION,
                "sageVersion": str(sage_version),
            },
        }
        code = 0
    else:
        artifact, code = discover_path(args, args.input)
    write_result(artifact, args.output)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
