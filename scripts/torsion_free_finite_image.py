#!/usr/bin/env python3
"""Search exact finite Coxeter images without enumerating their elements.

This is the finite-image rung of torsion-free subgroup discovery.  It keeps the
scientific criterion separate from the search heuristic:

* the standard Tits matrices are reduced exactly over a finite field;
* every Coxeter relation is checked after reduction;
* every maximal spherical special subgroup must retain its classified order;
* a coset action passes only when every prime-order spherical witness is
  fixed-point-free; and
* a second certificate checks that every spherical subgroup has only regular
  orbits in the candidate action.

The full congruence image is represented by Sage/libGAP ``MatrixGroup`` and a
BSGS permutation representation.  It is never closed by a Python breadth-first
search.  Retained coset modules are compact records: subgroup generator words,
degree, fixed-point counts, and hashes.  Their source-generator permutation
rows are spooled to packed binary files so the composite solver can combine
partial actions without inflating the JSON checkpoint.  JSON rows and Schreier
data are emitted only for a passing action when explicitly requested.

The checkpoint is a search journal, not a certificate.  A resumed run rebuilds
the exact finite image and rechecks its digest before trusting frontier records.
Native GAP calls can still be expensive and are not preemptible from Python;
use an outer process timeout for a hard wall-clock limit.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import signal
import sys
import time
from array import array
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

# Reuse the launcher's input validation and finite Coxeter classification.  A
# second classifier here could silently disagree about which torsion must be
# excluded.
import torsion_free_discovery as shared  # noqa: E402
import finite_image_recognition as recognition  # noqa: E402
import finite_image_module_catalogue as module_catalogue  # noqa: E402
import mod3_structural_certificate as mod3_structural  # noqa: E402
import odd_prime_structural_certificate as odd_prime_structural  # noqa: E402


try:  # Import lazily enough that CPython can run the pure checkpoint tests.
    from sage.all import (  # type: ignore[import-not-found]
        CyclotomicField,
        GF,
        MatrixGroup,
        identity_matrix,
        matrix,
    )
    from sage.libs.gap.libgap import libgap  # type: ignore[import-not-found]
    from sage.version import version as sage_version  # type: ignore[import-not-found]

    SAGE_AVAILABLE = True
except ImportError:  # pragma: no cover - the normal backend runs under Sage
    CyclotomicField = GF = MatrixGroup = identity_matrix = matrix = None
    libgap = None
    sage_version = "unavailable"
    SAGE_AVAILABLE = False


BACKEND_ID = "sage-finite-image-torsion-free"
BACKEND_VERSION = "2.5.0"
IMPLEMENTATION_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
RESULT_TYPE = "coxeter-finite-image-search"
CHECKPOINT_TYPE = "coxeter-finite-image-checkpoint"
CATALOGUE_TYPE = "coxeter-spherical-witness-cache"
SCHEMA_VERSION = 1

KERNEL_CERTIFICATE_TYPE = "normal-congruence-kernel"
FINITE_INDEX_KERNEL_LEVEL = "finite-index-kernel"
EXACT_INDEX_KERNEL_LEVEL = "exact-index-kernel"
MATERIALIZED_COVER_LEVEL = "materialized-cover"
UNKNOWN_INDEX_STATUS = "unknown"
EXACT_INDEX_STATUS = "exact"

DEFAULT_PRIMES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31)
DEFAULT_MAX_TOM_ORDER = 1_000_000
DEFAULT_MAX_ACTION_BYTES = 256 * 1024 * 1024
DEFAULT_MODULE_CACHE_BYTES = 512 * 1024 * 1024
DEFAULT_MAX_GENERIC_MAXIMAL_ORDER = 5_000_000
NATURAL_ORBIT_SEED_KIND = "compact-bsgs-natural-orbit"
RECOGNITION_EXACT_SEED_KIND = "recognition-exact-subgroup-candidate"


def structural_certificate_characteristic(path_value: str | Path) -> int:
    """Return the characteristic claimed by a supported structural artifact.

    The certificate is inspected before the finite-image transfer is hashed so
    a p=5 artifact can never be attached accidentally to a p=7 matrix image.
    Full source, implementation, and replay checks remain the responsibility of
    the characteristic-specific verifier.
    """

    path = Path(path_value).resolve()
    if not path.is_file():
        raise shared.InputError(f"The structural certificate does not exist: {path}")
    try:
        artifact = json.loads(path.read_text(encoding="utf8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise shared.InputError(
            f"The structural certificate is not readable JSON: {path}"
        ) from exc
    kind = artifact.get("certificateKind")
    if kind == mod3_structural.CERTIFICATE_KIND:
        return 3
    characteristic = artifact.get("characteristic")
    if (
        isinstance(characteristic, int)
        and not isinstance(characteristic, bool)
        and characteristic in odd_prime_structural.SUPPORTED_CHARACTERISTICS
        and kind == odd_prime_structural.certificate_kind(characteristic)
    ):
        return odd_prime_structural.require_supported_characteristic(characteristic)
    raise shared.InputError(
        "The structural certificate is neither the sealed characteristic-3 "
        "artifact nor a supported characteristic-5/7/11 artifact."
    )
WITNESS_ENUMERATION_SEED = 9


class ExactInvariantError(RuntimeError):
    """An exact group computation contradicted a required invariant."""


class SearchLimit(RuntimeError):
    """A declared search limit was reached without a mathematical conclusion."""


class SearchInterrupted(RuntimeError):
    """The process received a termination signal between native operations."""


@dataclass
class Deadline:
    seconds: int

    def __post_init__(self) -> None:
        self.started = time.monotonic()
        self.interrupted = False

    def check(self, operation: str) -> None:
        if self.interrupted:
            raise SearchInterrupted(f"Search interrupted while {operation}.")
        elapsed = time.monotonic() - self.started
        if elapsed > self.seconds:
            raise SearchLimit(
                f"Finite-image search exceeded {self.seconds} seconds while "
                f"{operation}."
            )

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self.started


@dataclass
class ResidueCandidate:
    """One exact reduction of the integral Tits matrices."""

    candidate_id: str
    rational_prime: int
    field: Any
    generators: list[Any]
    metadata: dict[str, Any]


@dataclass
class FiniteImage:
    candidate: ResidueCandidate
    matrix_group: Any
    permutation_group: Any | None
    q_gap: Any | None
    q_generators: list[Any]
    order: int | None
    permutation_degree: int | None
    relation_checks: list[dict[str, Any]]
    spherical_checks: list[dict[str, Any]]

    @property
    def permutation_materialized(self) -> bool:
        return self.q_gap is not None and self.permutation_degree is not None


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    """Replace a JSON journal atomically so interruption cannot half-write it."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf8"
    )
    os.replace(temporary, path)


def read_json_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return value


def default_cache_root() -> Path:
    override = os.environ.get("COXETER_FINITE_IMAGE_CACHE")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".cache" / "coxeter-viewer" / "finite-image"


def slow_wsl_mount(path: Path) -> bool:
    try:
        resolved = path.expanduser().resolve()
    except OSError:
        resolved = path.expanduser().absolute()
    return sys.platform.startswith("linux") and str(resolved).startswith("/mnt/")


def degree_allowed(degree: int, lower_bound: int, maximum: int) -> bool:
    """A free finite-parabolic action has degree divisible by every |W_T|."""

    return lower_bound <= degree <= maximum and degree % lower_bound == 0


def module_degree_allowed(
    descriptor: dict[str, Any], degree: int, lower_bound: int, maximum: int
) -> bool:
    """Retain natural BSGS orbits even when they are only partial modules.

    The spherical-order lcm is a necessary divisibility condition for one
    torsion-free transitive action. It is not a valid filter on components of
    a composite action: a degree-3 natural orbit may eliminate witnesses that
    a second module misses. Resource ceilings still apply to every module.
    """

    if descriptor.get("seedKind") == NATURAL_ORBIT_SEED_KIND:
        return 1 <= degree <= maximum
    return degree_allowed(degree, lower_bound, maximum)


def partial_module_degree_can_reach_target(
    degree: int, target_indices: Sequence[int]
) -> bool:
    """Return whether a transitive factor can occur in a requested diagonal orbit.

    A diagonal orbit projects equivariantly and surjectively onto every
    transitive factor. Its fibers therefore have constant size, so each factor
    degree divides the diagonal-orbit degree. This is a necessary filter only;
    passing it does not assert that a compatible diagonal orbit exists.
    """

    module_degree = int(degree)
    return module_degree > 0 and any(
        int(target) % module_degree == 0 for target in target_indices
    )


def recognized_natural_orbit_degrees(
    certificate: dict[str, Any],
) -> list[int] | None:
    """Read independently checked natural-orbit sizes from a GAP certificate."""

    action = certificate.get("action")
    validation = certificate.get("actionValidation")
    if not isinstance(action, dict) or not isinstance(validation, dict):
        return None
    raw_sizes = validation.get("orbitSizes")
    degree = action.get("degree")
    if not isinstance(raw_sizes, list) or not isinstance(degree, int):
        return None
    if any(
        isinstance(value, bool) or not isinstance(value, int) or value <= 0
        for value in raw_sizes
    ):
        return None
    sizes = sorted(raw_sizes)
    return sizes if sum(sizes) == degree else None


def unrecognized_root_search_allowed(
    finite_image_order: int,
    source_kind: str,
    index_screening_complete: bool,
    safe_order_limit: int,
    explicit_override: bool,
) -> bool:
    """Guard the legacy generic maximal-subgroup search.

    A complete index certificate makes enumeration unnecessary.  Otherwise a
    full Table of Marks, a deliberately small group, or an explicit operator
    override is required before entering GAP's non-preemptible generic call.
    """

    if index_screening_complete:
        return False
    return (
        source_kind == "table-of-marks"
        or finite_image_order <= safe_order_limit
        or explicit_override
    )


def resolve_lower_bound(derived: int, requested: int | None) -> int:
    if requested is None:
        return derived
    if requested < 1 or derived % requested:
        raise shared.InputError(
            "--lower-bound-divisor must divide the exact spherical lcm "
            f"{derived}. A non-divisor could exclude a valid action."
        )
    return requested


def encode_coverage(covered_indexes: Iterable[int], witness_count: int) -> str:
    bits = 0
    for index in covered_indexes:
        if index < 0 or index >= witness_count:
            raise ValueError(f"Witness index {index} is out of range.")
        bits |= 1 << index
    width = max(1, (witness_count + 3) // 4)
    return f"{bits:0{width}x}"


def parse_primes(text: str) -> list[int]:
    values: list[int] = []
    for token in text.split(","):
        token = token.strip()
        if not token:
            continue
        value = int(token)
        if value < 2 or any(
            value % divisor == 0 for divisor in range(2, int(value**0.5) + 1)
        ):
            raise argparse.ArgumentTypeError(f"{value} is not prime.")
        values.append(value)
    if not values:
        raise argparse.ArgumentTypeError("At least one rational prime is required.")
    return sorted(set(values))


def parse_prime(text: str) -> int:
    values = parse_primes(text)
    if len(values) != 1:
        raise argparse.ArgumentTypeError("--prime accepts one rational prime.")
    return values[0]


def shard_primes(primes: Sequence[int], shard: str | None) -> list[int]:
    if shard is None:
        return list(primes)
    try:
        index_text, count_text = shard.split("/", 1)
        index, count = int(index_text), int(count_text)
    except (ValueError, AttributeError) as exc:
        raise argparse.ArgumentTypeError(
            "--prime-shard must have form INDEX/COUNT"
        ) from exc
    if count < 1 or index < 0 or index >= count:
        raise argparse.ArgumentTypeError("Prime shard needs 0 <= INDEX < COUNT.")
    return [prime for offset, prime in enumerate(primes) if offset % count == index]


def require_sage() -> None:
    if not SAGE_AVAILABLE:
        raise SystemExit(
            "This backend requires SageMath. Run `sage "
            "scripts/torsion_free_finite_image.py ...` or Sage's Python."
        )


def source_matrix_digest(coxeter_matrix: Sequence[Sequence[int]]) -> str:
    return digest_json({"coxeterMatrix": coxeter_matrix})


def general_linear_group_order(dimension: int, field_order: int) -> int:
    """Return the exact order of GL(dimension, field_order).

    A matrix image over a finite field is finite before its generated subgroup
    has been recognised.  The ambient GL order is therefore a safe upper bound
    for the unknown kernel index; it is not asserted to be the image order.
    """

    if dimension < 1 or field_order < 2:
        raise ExactInvariantError("A finite matrix ambient needs n >= 1 and q >= 2.")
    q_to_n = field_order**dimension
    return math.prod(q_to_n - field_order**power for power in range(dimension))


def finite_matrix_ambient(finite_image: FiniteImage) -> dict[str, Any]:
    """Describe the finite GL(n,q) containing the exact residue image."""

    metadata = finite_image.candidate.metadata
    dimension_value = metadata.get("matrixDimension")
    if dimension_value is None:
        generators = finite_image.candidate.generators
        if not generators:
            raise ExactInvariantError("The residue image has no matrix generators.")
        dimension_value = generators[0].nrows()
    dimension = int(dimension_value)
    field_order = int(finite_image.candidate.field.order())
    upper_bound = general_linear_group_order(dimension, field_order)
    value: dict[str, Any] = {
        "family": "general-linear",
        "notation": f"GL({dimension},{field_order})",
        "dimension": dimension,
        "fieldOrderDecimal": str(field_order),
        "orderUpperBoundDecimal": str(upper_bound),
        "orderFormula": "product_{i=0}^{n-1}(q^n-q^i)",
        "finitenessStatus": "exact-finite-ambient",
    }
    value["metadataSha256"] = digest_json(value)
    return value


def kernel_index_lower_bound(
    spherical_checks: Sequence[dict[str, Any]],
) -> int:
    """Return the exact divisor forced by injective spherical restrictions."""

    orders: list[int] = []
    identifiers: set[str] = set()
    for check in spherical_checks:
        identifier = str(check.get("id", "")).strip()
        expected_order = int(check.get("expectedOrder", 0))
        image_order = int(check.get("imageOrder", 0))
        if (
            not identifier
            or identifier in identifiers
            or expected_order < 1
            or image_order != expected_order
            or check.get("injective") is not True
        ):
            raise ExactInvariantError(
                "A congruence-kernel certificate needs a complete, duplicate-free "
                "catalogue of injective maximal-spherical restrictions."
            )
        identifiers.add(identifier)
        orders.append(expected_order)
    if not orders:
        raise ExactInvariantError(
            "A congruence-kernel certificate needs maximal-spherical restrictions."
        )
    return math.lcm(*orders)


def catalogue_header(
    matrix_digest: str,
    spherical: Sequence[shared.SphericalSubset],
) -> dict[str, Any]:
    records = [
        {
            "id": "T:" + ",".join(map(str, item.subset)),
            "subset": list(item.subset),
            "type": item.type_name,
            "order": item.expected_order,
        }
        for item in spherical
    ]
    lower_bound = math.lcm(*(item.expected_order for item in spherical))
    return {
        "implementationSha256": IMPLEMENTATION_SHA256,
        "matrixDigest": matrix_digest,
        "maximalSphericalSubgroups": records,
        "sphericalDigest": digest_json(records),
        "indexDivisibilityLowerBound": lower_bound,
        "witnessEnumerationSeed": WITNESS_ENUMERATION_SEED,
    }


def read_request(
    path: Path, args: argparse.Namespace
) -> tuple[
    str,
    str,
    dict[str, Any],
    list[list[int]],
    dict[str, int],
    list[shared.SphericalSubset],
]:
    text = path.read_text(encoding="utf8")
    cli_bounds = {
        "maxIndex": args.max_index,
        "maxCandidates": args.max_modules,
        "maxModuleCandidates": args.max_modules,
        "maxCompositeModules": 1,
        "maxCompositeCombinations": 1,
        "maxCongruencePrime": max(args.primes),
        "maxCongruenceImageOrder": 1,
        "maxWitnesses": args.max_witnesses,
        "maxSphericalOrder": args.max_spherical_order,
        "maxSubsets": args.max_subsets,
        "timeoutSeconds": args.timeout,
    }
    source, coxeter_matrix, bounds, _request = shared.parse_request(text, cli_bounds)
    spherical = shared.maximal_spherical_subsets(coxeter_matrix, bounds)
    return text, shared.sha256_text(text), source, coxeter_matrix, bounds, spherical


def integral_tits_coefficients(coxeter_matrix: Sequence[Sequence[int]]) -> bool:
    # 2*cos(pi/m) is rational integral exactly for m=2 and m=3.  Infinite
    # entries use the documented standard coefficient 2.
    return all(
        coxeter_matrix[i][j] in (0, 2, 3)
        for i in range(len(coxeter_matrix))
        for j in range(i + 1, len(coxeter_matrix))
    )


def integral_tits_rows(
    coxeter_matrix: Sequence[Sequence[int]], generator: int
) -> list[list[int]]:
    rank = len(coxeter_matrix)
    rows = [
        [1 if row == column else 0 for column in range(rank)] for row in range(rank)
    ]
    rows[generator][generator] = -1
    for column in range(rank):
        if column == generator:
            continue
        m = coxeter_matrix[generator][column]
        rows[generator][column] = 2 if m == 0 else 0 if m == 2 else 1
    return rows


def integral_tits_form(coxeter_matrix: Sequence[Sequence[int]], field: Any) -> Any:
    """Return the exact bilinear form preserved by the integral Tits matrices.

    In the simple-root basis, ``B_ii=1`` and the row coefficient in a simple
    reflection is ``-2 B_ij``.  This helper is used only away from
    characteristic two, where division by two is valid.
    """

    if int(field.characteristic()) == 2:
        raise ValueError(
            "The integral Tits form cannot be recovered by halving in GF(2)."
        )
    rank = len(coxeter_matrix)
    inverse_two = field(1) / field(2)
    rows: list[list[Any]] = []
    for left in range(rank):
        row: list[Any] = []
        for right in range(rank):
            if left == right:
                row.append(field(1))
                continue
            m = coxeter_matrix[left][right]
            coefficient = 2 if m == 0 else 0 if m == 2 else 1
            row.append(-field(coefficient) * inverse_two)
        rows.append(row)
    return matrix(field, rows)


def cyclotomic_conductor(coxeter_matrix: Sequence[Sequence[int]]) -> int:
    labels = [
        2 * coxeter_matrix[i][j]
        for i in range(len(coxeter_matrix))
        for j in range(i + 1, len(coxeter_matrix))
        if coxeter_matrix[i][j] >= 3
    ]
    return math.lcm(*labels) if labels else 4


def cyclotomic_tits_generators(
    coxeter_matrix: Sequence[Sequence[int]],
) -> tuple[Any, int, list[Any]]:
    conductor = cyclotomic_conductor(coxeter_matrix)
    field = CyclotomicField(conductor)
    zeta = field.gen()
    rank = len(coxeter_matrix)
    generators: list[Any] = []
    for generator in range(rank):
        rows = [
            [field(1 if row == column else 0) for column in range(rank)]
            for row in range(rank)
        ]
        rows[generator][generator] = field(-1)
        for column in range(rank):
            if column == generator:
                continue
            m = coxeter_matrix[generator][column]
            if m == 0:
                coefficient = field(2)
            elif m == 2:
                coefficient = field(0)
            else:
                divisor = 2 * m
                if conductor % divisor:
                    raise ExactInvariantError(
                        f"Cyclotomic conductor {conductor} misses 2m={divisor}."
                    )
                exponent = conductor // divisor
                coefficient = zeta**exponent + zeta ** (-exponent)
            rows[generator][column] = coefficient
        generators.append(matrix(field, rows))
    integers = field.ring_of_integers()
    for generator in generators:
        for entry in generator.list():
            try:
                integers(entry)
            except (TypeError, ValueError) as exc:
                raise ExactInvariantError(
                    f"Nonintegral Tits coefficient {entry}."
                ) from exc
    return field, conductor, generators


def exact_matrix_power(value: Any, exponent: int) -> Any:
    result = identity_matrix(value.base_ring(), value.nrows())
    factor = value
    power = exponent
    while power:
        if power & 1:
            result *= factor
        factor *= factor
        power >>= 1
    return result


def check_matrix_relations(
    generators: Sequence[Any],
    coxeter_matrix: Sequence[Sequence[int]],
    phase: str,
) -> list[dict[str, Any]]:
    identity = identity_matrix(generators[0].base_ring(), len(generators))
    checks: list[dict[str, Any]] = []
    for index, generator in enumerate(generators):
        passed = generator * generator == identity
        checks.append(
            {
                "kind": "involution",
                "generators": [index, index],
                "exponent": 2,
                "phase": phase,
                "passed": bool(passed),
            }
        )
        if not passed:
            raise ExactInvariantError(f"Generator {index} collapsed during {phase}.")
    for left in range(len(generators)):
        for right in range(left + 1, len(generators)):
            m = coxeter_matrix[left][right]
            if m == 0:
                continue
            passed = (
                exact_matrix_power(generators[left] * generators[right], m) == identity
            )
            checks.append(
                {
                    "kind": "coxeter",
                    "generators": [left, right],
                    "exponent": m,
                    "phase": phase,
                    "passed": bool(passed),
                }
            )
            if not passed:
                raise ExactInvariantError(
                    f"Relation ({left},{right})^{m} failed during {phase}."
                )
    return checks


def residue_candidates(
    coxeter_matrix: Sequence[Sequence[int]], primes: Sequence[int]
) -> Iterable[ResidueCandidate]:
    if integral_tits_coefficients(coxeter_matrix):
        for prime in primes:
            field = GF(prime)
            generators = [
                matrix(field, integral_tits_rows(coxeter_matrix, index))
                for index in range(len(coxeter_matrix))
            ]
            yield ResidueCandidate(
                candidate_id=f"GF({prime})",
                rational_prime=prime,
                field=field,
                generators=generators,
                metadata={
                    "coefficientModel": "integral-standard-tits",
                    "residueField": f"GF({prime})",
                    "residueFieldOrder": prime,
                    "ramificationPolicy": (
                        "Characteristic is accepted only after exact relations and all "
                        "maximal spherical restrictions pass."
                    ),
                },
            )
        return

    field, conductor, number_field_generators = cyclotomic_tits_generators(
        coxeter_matrix
    )
    for prime in primes:
        ideals = sorted(
            field.primes_above(prime), key=lambda ideal: (int(ideal.norm()), str(ideal))
        )
        for ideal_index, ideal in enumerate(ideals):
            residue_field = ideal.residue_field()
            reduction_map = residue_field.reduction_map()
            reduced = [
                matrix(
                    residue_field,
                    [
                        [
                            reduction_map(generator[row, column])
                            for column in range(generator.ncols())
                        ]
                        for row in range(generator.nrows())
                    ],
                )
                for generator in number_field_generators
            ]
            yield ResidueCandidate(
                candidate_id=f"p{prime}-ideal{ideal_index}-q{int(residue_field.order())}",
                rational_prime=prime,
                field=residue_field,
                generators=reduced,
                metadata={
                    "coefficientModel": "cyclotomic-standard-tits",
                    "cyclotomicConductor": conductor,
                    "coefficientField": str(field),
                    "primeIdeal": str(ideal),
                    "primeIdealNorm": int(ideal.norm()),
                    "residueDegree": int(ideal.residue_class_degree()),
                    "residueField": str(residue_field),
                    "residueFieldOrder": int(residue_field.order()),
                    "ramificationPolicy": (
                        "Ramified and small characteristics are not assumed good; "
                        "they survive only exact relation and spherical-injectivity checks."
                    ),
                },
            )


def materialize_permutation_image(
    finite_image: FiniteImage,
    deadline: Deadline,
    seed: int,
) -> list[dict[str, Any]]:
    """Build an exact compact permutation copy only after structural screening.

    Matrix order, Coxeter relations, and spherical injectivity are already
    certified when this function is called.  The permutation copy exists for
    subgroup/coset construction; it is not needed to certify the congruence
    kernel itself.
    """

    if finite_image.permutation_materialized:
        return []
    candidate = finite_image.candidate
    matrix_group = finite_image.matrix_group
    image_order = finite_image.order
    if image_order is None:
        raise ExactInvariantError(
            "A finite image must have a verified exact order before permutation materialization."
        )
    deadline.check(f"constructing BSGS representation of {candidate.candidate_id}")
    permutation_group = matrix_group.as_permutation_group(
        algorithm="smaller", seed=seed
    )
    permutation_order = int(permutation_group.order())
    if permutation_order != image_order:
        raise ExactInvariantError(
            f"Matrix/permutation image orders disagree: {image_order} != {permutation_order}."
        )

    # Rebuild Sage's seeded maps so redundant source generators retain their
    # original order across the matrix/permutation certificate boundary.
    libgap.set_seed(seed)
    matrix_gap = matrix_group.gap()
    matrix_to_permutation = libgap.IsomorphismPermGroup(matrix_gap)
    first_permutation_image = libgap.Image(matrix_to_permutation)
    smaller_isomorphism = libgap.SmallerDegreePermutationRepresentation(
        first_permutation_image
    )
    compact_gap = libgap.Image(smaller_isomorphism)
    compact_order = int(libgap.Size(compact_gap))
    compact_degree = int(libgap.LargestMovedPoint(compact_gap))
    if compact_order != image_order or compact_degree != int(
        permutation_group.degree()
    ):
        raise ExactInvariantError(
            "The explicit seeded libGAP isomorphism disagrees with "
            "MatrixGroup.as_permutation_group()."
        )

    mapping_checks: list[dict[str, Any]] = []
    q_generators: list[Any] = []
    for index, generator in enumerate(candidate.generators):
        try:
            source_gap = matrix_group(generator).gap()
            mapped = libgap.Image(
                smaller_isomorphism,
                libgap.Image(matrix_to_permutation, source_gap),
            )
            round_trip = libgap.PreImagesRepresentative(
                matrix_to_permutation,
                libgap.PreImagesRepresentative(smaller_isomorphism, mapped),
            )
        except Exception as exc:  # noqa: BLE001 - Sage/libGAP boundary
            raise ExactInvariantError(
                f"Could not transport source generator {index} through the "
                f"compact permutation isomorphism: {exc}"
            ) from exc
        round_trip_equal = bool(round_trip == source_gap)
        mapped_order = int(libgap.Order(mapped))
        q_generators.append(mapped)
        mapping_checks.append(
            {
                "sourceGenerator": index,
                "matrixPermutationRoundTripEqual": round_trip_equal,
                "mappedOrder": mapped_order,
                "passed": round_trip_equal and mapped_order == 2,
            }
        )
    if not all(check["passed"] for check in mapping_checks):
        raise ExactInvariantError(
            "The permutation isomorphism did not preserve the ordered source generators."
        )
    q_gap = libgap.GroupWithGenerators(q_generators)
    if int(libgap.Size(q_gap)) != image_order:
        raise ExactInvariantError(
            "The ordered source-generator images do not generate the full finite image."
        )
    finite_image.permutation_group = permutation_group
    finite_image.q_gap = q_gap
    finite_image.q_generators = q_generators
    finite_image.permutation_degree = compact_degree
    return mapping_checks


def inspect_residue(
    candidate: ResidueCandidate,
    coxeter_matrix: Sequence[Sequence[int]],
    spherical: Sequence[shared.SphericalSubset],
    deadline: Deadline,
    seed: int,
    probe_only: bool = False,
    materialize_permutation: bool = True,
    defer_image_order_to_recognition: bool = False,
) -> tuple[FiniteImage | None, dict[str, Any]]:
    attempt: dict[str, Any] = {
        "candidateId": candidate.candidate_id,
        "rationalPrime": candidate.rational_prime,
        **candidate.metadata,
    }
    try:
        relation_checks = check_matrix_relations(
            candidate.generators, coxeter_matrix, f"residue:{candidate.candidate_id}"
        )
    except ExactInvariantError as exc:
        attempt.update(
            {"status": "rejected", "reason": "relation-failure", "detail": str(exc)}
        )
        return None, attempt

    spherical_checks: list[dict[str, Any]] = []
    for subgroup in spherical:
        deadline.check(f"checking spherical restriction {list(subgroup.subset)}")
        restricted = MatrixGroup(
            [candidate.generators[index] for index in subgroup.subset]
        )
        image_order = int(restricted.order())
        injective = image_order == subgroup.expected_order
        spherical_checks.append(
            {
                "id": "T:" + ",".join(map(str, subgroup.subset)),
                "subset": list(subgroup.subset),
                "type": subgroup.type_name,
                "expectedOrder": subgroup.expected_order,
                "imageOrder": image_order,
                "injective": injective,
            }
        )
    all_spherical_injective = all(check["injective"] for check in spherical_checks)
    if not all_spherical_injective and not probe_only:
        attempt.update(
            {
                "status": "rejected",
                "reason": "spherical-restriction-not-injective",
                "relationChecks": relation_checks,
                "sphericalRestrictionChecks": spherical_checks,
            }
        )
        return None, attempt

    matrix_group = MatrixGroup(candidate.generators)
    image_order: int | None
    if defer_image_order_to_recognition:
        image_order = None
    else:
        deadline.check(f"computing exact order of {candidate.candidate_id}")
        image_order = int(matrix_group.order())
    finite_image = FiniteImage(
        candidate=candidate,
        matrix_group=matrix_group,
        permutation_group=None,
        q_gap=None,
        q_generators=[],
        order=image_order,
        permutation_degree=None,
        relation_checks=relation_checks,
        spherical_checks=spherical_checks,
    )
    generator_mapping_checks: list[dict[str, Any]] = []
    if materialize_permutation:
        if image_order is None:
            raise ExactInvariantError(
                "Permutation materialization cannot precede finite-image order discovery."
            )
        generator_mapping_checks = materialize_permutation_image(
            finite_image, deadline, seed
        )
    attempt.update(
        {
            "status": "accepted" if all_spherical_injective else "rejected",
            "reason": (
                "exact-relations-and-spherical-restrictions-passed"
                if all_spherical_injective
                else "spherical-restriction-not-injective"
            ),
            "imageOrder": image_order,
            "imageOrderDeferredToRecognition": image_order is None,
            "permutationMaterialized": finite_image.permutation_materialized,
            "permutationDegree": finite_image.permutation_degree,
            "relationChecks": relation_checks,
            "sourceGeneratorMappingChecks": generator_mapping_checks,
            "sphericalRestrictionChecks": spherical_checks,
        }
    )
    if not all_spherical_injective:
        return None, attempt
    return finite_image, attempt


def is_prime_integer(value: int) -> bool:
    if value < 2:
        return False
    return all(value % divisor for divisor in range(2, int(value**0.5) + 1))


def abstract_spherical_coxeter_group(
    coxeter_matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> Any:
    free_group = libgap.FreeGroup(len(subset), "t")
    generators = list(libgap.GeneratorsOfGroup(free_group))
    relators = [generator**2 for generator in generators]
    for local_left in range(len(subset)):
        for local_right in range(local_left + 1, len(subset)):
            m = coxeter_matrix[subset[local_left]][subset[local_right]]
            if m != 0:
                relators.append((generators[local_left] * generators[local_right]) ** m)
    return free_group / relators


def permutation_key(element: Any, degree: int) -> tuple[int, ...]:
    """Return the complete point-image tuple of a GAP permutation."""

    return tuple(int(value) for value in libgap.ListPerm(element, degree))


def recognize_and_screen_finite_image(
    finite_image: FiniteImage,
    coxeter_matrix: Sequence[Sequence[int]],
    args: argparse.Namespace,
    cache_dir: Path,
    catalogue: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Independently recognise an exact image before any large subgroup search.

    The isolated GAP runtime receives the ordered finite-field matrices and,
    when materialized, full point-image rows for the same generators.  The
    matrix-only path lets classical recognition reject an image before Sage
    constructs a potentially enormous natural permutation action.
    """

    manifest_path = recognition.find_toolchain_manifest(args.research_gap_manifest)
    manifest_hash = (
        recognition.sha256_bytes(manifest_path.read_bytes())
        if manifest_path is not None
        else recognition.sha256_json({"status": "toolchain-manifest-unavailable"})
    )
    rows: list[tuple[int, ...]] | None = None
    if finite_image.permutation_materialized:
        assert finite_image.permutation_degree is not None
        rows = [
            permutation_key(generator, finite_image.permutation_degree)
            for generator in finite_image.q_generators
        ]
    residue_field_order = int(finite_image.candidate.field.order())
    matrix_rows: list[list[list[int]]] | None = None
    invariant_form_rows: list[list[int]] | None = None
    if residue_field_order == finite_image.candidate.rational_prime:
        matrix_rows = [
            [
                [int(generator[row, column]) for column in range(generator.ncols())]
                for row in range(generator.nrows())
            ]
            for generator in finite_image.candidate.generators
        ]
        if finite_image.candidate.rational_prime != 2 and integral_tits_coefficients(
            coxeter_matrix
        ):
            invariant_form = integral_tits_form(
                coxeter_matrix, finite_image.candidate.field
            )
            for generator in finite_image.candidate.generators:
                if generator.transpose() * invariant_form * generator != invariant_form:
                    raise ExactInvariantError(
                        "An integral Tits generator did not preserve its exact form."
                    )
            invariant_form_rows = [
                [
                    int(invariant_form[row, column])
                    for column in range(invariant_form.ncols())
                ]
                for row in range(invariant_form.nrows())
            ]
    discovering_order = finite_image.order is None
    structural_certificate = getattr(args, "structural_certificate", None)
    structural_characteristic = (
        structural_certificate_characteristic(structural_certificate)
        if structural_certificate is not None
        else None
    )
    structural_certificate_hash = None
    if (
        finite_image.candidate.rational_prime == structural_characteristic
        and structural_certificate is not None
    ):
        structural_certificate_path = Path(structural_certificate).resolve()
        if not structural_certificate_path.is_file():
            raise shared.InputError(
                "The structural certificate does not exist: "
                f"{structural_certificate_path}"
            )
        structural_certificate_hash = recognition.sha256_bytes(
            structural_certificate_path.read_bytes()
        )
    payload, action_hash = recognition.build_action_transfer(
        candidate_id=finite_image.candidate.candidate_id,
        characteristic=finite_image.candidate.rational_prime,
        finite_image_order=finite_image.order,
        coxeter_matrix=coxeter_matrix,
        degree=finite_image.permutation_degree,
        generator_rows=rows,
        matrix_generator_rows=matrix_rows,
        invariant_form_rows=invariant_form_rows,
        residue_field_order=residue_field_order if matrix_rows is not None else None,
        lower_bound=args.effective_lower_bound,
        max_index=args.max_index,
        manifest_hash=manifest_hash,
        torsion_witnesses=(
            catalogue.get("witnesses") if catalogue is not None else None
        ),
        torsion_witness_catalogue_complete=catalogue is not None,
        structural_certificate_sha256=structural_certificate_hash,
    )
    bridge: dict[str, Any] = {
        "mode": args.recognition,
        "actionHash": action_hash,
        "manifestHash": manifest_hash,
        "manifestPath": str(manifest_path) if manifest_path is not None else None,
        "orderedGeneratorCount": len(finite_image.candidate.generators),
        "actionMode": "permutation+matrix" if rows is not None else "matrix-only",
        "permutationDegree": finite_image.permutation_degree,
        "orderMode": "discover-recog" if discovering_order else "verify-known",
    }
    if args.recognition == "off":
        return (
            (
                recognition.unknown_order_discovery_certificate(
                    action_hash, manifest_hash, "recognition-disabled"
                )
                if discovering_order
                else recognition.unknown_certificate(
                    action_hash,
                    manifest_hash,
                    finite_image.order,
                    "recognition-disabled",
                )
            ),
            bridge,
        )
    if structural_certificate is not None and (
        finite_image.candidate.rational_prime == structural_characteristic
    ):
        bridge["requestedStructuralCertificate"] = str(structural_certificate)
        if manifest_path is None:
            message = (
                "The supplied structural certificate cannot be checked without "
                "its pinned GAP toolchain manifest."
            )
            if args.recognition == "required":
                raise shared.InputError(message)
            return (
                recognition._structural_unknown_certificate(  # noqa: SLF001
                    payload,
                    manifest_hash,
                    {},
                    "structural-certificate-manifest-unavailable",
                ),
                {**bridge, "genericRecognitionRun": False, "error": message},
            )
        gap = recognition.find_research_gap(args.research_gap)
        if gap is None:
            message = (
                "The supplied structural certificate needs the pinned GAP "
                "runtime for its lightweight SLP replay."
            )
            if args.recognition == "required":
                raise shared.InputError(message)
            return (
                recognition._structural_unknown_certificate(  # noqa: SLF001
                    payload,
                    manifest_hash,
                    {},
                    "structural-certificate-replay-unavailable",
                ),
                {**bridge, "genericRecognitionRun": False, "error": message},
            )
        try:
            if structural_characteristic == 3:
                certificate, metrics = recognition.load_and_replay_mod3_structural_certificate(
                    payload,
                    certificate_path=Path(structural_certificate).resolve(),
                    source_path=Path(
                        args.structural_source or mod3_structural.DEFAULT_SOURCE
                    ).resolve(),
                    manifest_bytes=manifest_path.read_bytes(),
                    manifest_hash=manifest_hash,
                    gap_location=str(gap),
                    gap_script=Path(
                        args.structural_gap_script
                        or mod3_structural.DEFAULT_GAP_SCRIPT
                    ).resolve(),
                    orchestrator=Path(
                        args.structural_orchestrator
                        or Path(mod3_structural.__file__).resolve()
                    ).resolve(),
                    replay_script=Path(
                        args.structural_replay_gap_script
                        or mod3_structural.DEFAULT_REPLAY_GAP_SCRIPT
                    ).resolve(),
                    timeout_seconds=min(args.recognition_timeout, args.timeout),
                )
            else:
                certificate, metrics = recognition.load_and_replay_odd_prime_structural_certificate(
                    payload,
                    certificate_path=Path(structural_certificate).resolve(),
                    source_path=Path(
                        args.structural_source or odd_prime_structural.DEFAULT_SOURCE
                    ).resolve(),
                    manifest_bytes=manifest_path.read_bytes(),
                    manifest_hash=manifest_hash,
                    gap_location=str(gap),
                    gap_script=Path(
                        args.structural_gap_script
                        or odd_prime_structural.DEFAULT_GAP_SCRIPT
                    ).resolve(),
                    orchestrator=Path(
                        args.structural_orchestrator
                        or Path(odd_prime_structural.__file__).resolve()
                    ).resolve(),
                    replay_script=Path(
                        args.structural_replay_gap_script
                        or odd_prime_structural.DEFAULT_REPLAY_GAP_SCRIPT
                    ).resolve(),
                    timeout_seconds=min(args.recognition_timeout, args.timeout),
                )
        except (
            OSError,
            ValueError,
            mod3_structural.CertificateError,
            odd_prime_structural.CertificateError,
        ) as exc:
            message = f"Rejected the supplied structural certificate: {exc}"
            if args.recognition == "required":
                raise shared.InputError(message) from exc
            return (
                recognition._structural_unknown_certificate(  # noqa: SLF001
                    payload, manifest_hash, {}, "structural-certificate-rejected"
                ),
                {**bridge, "genericRecognitionRun": False, "error": message},
            )
        bridge.update(metrics)
        if discovering_order:
            discovered_order = recognition.validate_order_discovery_certificate(
                certificate, action_hash, manifest_hash
            )
            bridge["orderDiscovery"] = certificate.get("orderDiscovery")
            if discovered_order is not None:
                finite_image.order = discovered_order
        return certificate, bridge
    gap = recognition.find_research_gap(args.research_gap)
    if gap is None or manifest_path is None:
        if args.recognition == "required":
            raise shared.InputError(
                "Recognition was required, but the isolated GAP runtime or its "
                "toolchain manifest is unavailable. Run "
                "scripts/install_gap_research_toolchain.sh inside WSL."
            )
        return (
            (
                recognition.unknown_order_discovery_certificate(
                    action_hash, manifest_hash, "recognition-runtime-unavailable"
                )
                if discovering_order
                else recognition.unknown_certificate(
                    action_hash,
                    manifest_hash,
                    finite_image.order,
                    "recognition-runtime-unavailable",
                )
            ),
            bridge,
        )
    certificate, metrics = recognition.run_gap_recognition(
        payload,
        gap=gap,
        manifest_hash=manifest_hash,
        cache_root=cache_dir,
        timeout_seconds=min(args.recognition_timeout, args.timeout),
    )
    bridge.update({"gapPath": str(gap), **metrics})
    if discovering_order:
        discovered_order = recognition.validate_order_discovery_certificate(
            certificate, action_hash, manifest_hash
        )
        bridge["orderDiscovery"] = certificate.get("orderDiscovery")
        if discovered_order is None:
            return certificate, bridge
        finite_image.order = discovered_order
        recognition.validate_screening_certificate(
            certificate, action_hash, manifest_hash
        )
    return certificate, bridge


def kernel_cover_certificate(
    finite_image: FiniteImage,
    matrix_digest: str,
    spherical_digest: str,
    finite_image_digest: str,
    manageable_degree: int,
) -> dict[str, Any]:
    """Certify the normal congruence kernel without materializing its cover.

    Tits' finite-subgroup theorem puts every finite subgroup of a Coxeter group
    inside a conjugate of a spherical special subgroup.  Exact injectivity on
    every maximal spherical subgroup therefore makes the reduction kernel
    torsion-free.  This proves a cover exists even when its regular action is
    far too large to construct.
    """

    if (
        not finite_image.relation_checks
        or not all(
            isinstance(check, dict) and check.get("passed") is True
            for check in finite_image.relation_checks
        )
    ):
        raise ExactInvariantError(
            "A congruence-kernel certificate requires every exact Coxeter relation check to pass."
        )
    for label, value in (
        ("matrix digest", matrix_digest),
        ("spherical digest", spherical_digest),
        ("finite-image generator digest", finite_image_digest),
    ):
        if len(value) != 64 or any(
            character not in "0123456789abcdef" for character in value
        ):
            raise ExactInvariantError(f"The {label} is not a lowercase SHA-256 hash.")

    lower_bound = kernel_index_lower_bound(finite_image.spherical_checks)
    spherical_records = [
        {
            "id": check["id"],
            "subset": list(check["subset"]),
            "type": check["type"],
            "order": int(check["expectedOrder"]),
        }
        for check in finite_image.spherical_checks
    ]
    if digest_json(spherical_records) != spherical_digest:
        raise ExactInvariantError(
            "The maximal-spherical catalogue digest does not match its exact restrictions."
        )
    ambient = finite_matrix_ambient(finite_image)
    upper_bound = int(ambient["orderUpperBoundDecimal"])
    index = int(finite_image.order) if finite_image.order is not None else None
    if index is not None and (
        index < 1
        or index % lower_bound != 0
        or index > upper_bound
        or upper_bound % index != 0
    ):
        raise ExactInvariantError(
            "The verified finite-image order is incompatible with its spherical "
            "divisor or finite GL ambient."
        )

    exact_index = index is not None
    certificate_level = (
        EXACT_INDEX_KERNEL_LEVEL if exact_index else FINITE_INDEX_KERNEL_LEVEL
    )
    index_status = EXACT_INDEX_STATUS if exact_index else UNKNOWN_INDEX_STATUS
    manageable = bool(exact_index and index <= int(manageable_degree))
    relation_digest = digest_json(finite_image.relation_checks)
    restriction_digest = digest_json(finite_image.spherical_checks)
    index_evidence: dict[str, Any] = {
        "status": index_status,
        "divisibilityLowerBoundDecimal": str(lower_bound),
        "finiteUpperBoundDecimal": str(upper_bound),
        "upperBoundSource": "ambient-general-linear-group",
    }
    if exact_index:
        index_evidence["exactDecimal"] = str(index)

    value: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "status": "passed",
        "certificateType": KERNEL_CERTIFICATE_TYPE,
        "certificateLevel": certificate_level,
        "indexStatus": index_status,
        "subgroupKind": KERNEL_CERTIFICATE_TYPE,
        "normal": True,
        "torsionFree": True,
        "indexEvidence": index_evidence,
        "sourceFiniteImage": {
            "candidateId": finite_image.candidate.candidate_id,
            "characteristic": finite_image.candidate.rational_prime,
            "fieldOrder": int(finite_image.candidate.field.order()),
            "representationDimension": ambient["dimension"],
            "finiteTargetCertified": True,
            "imageOrderStatus": index_status,
            "matrixDigest": matrix_digest,
            "orderedGeneratorActionSha256": finite_image_digest,
            "ambientFiniteGroup": ambient,
        },
        "certificate": {
            "criterion": "tits-maximal-spherical-injective-kernel",
            "completeMaximalSphericalCatalogue": True,
            "completeSphericalRestrictionChecks": True,
            "sphericalDigest": spherical_digest,
            "sphericalRestrictionChecks": finite_image.spherical_checks,
            "relationChecks": finite_image.relation_checks,
            "proofHashes": {
                "sourceCoxeterMatrixSha256": matrix_digest,
                "orderedFiniteImageGeneratorsSha256": finite_image_digest,
                "relationChecksSha256": relation_digest,
                "maximalSphericalCatalogueSha256": spherical_digest,
                "sphericalRestrictionChecksSha256": restriction_digest,
                "ambientFiniteGroupSha256": ambient["metadataSha256"],
            },
            "theoremBasis": [
                "Every finite subgroup of a Coxeter group lies in a conjugate of a finite special subgroup.",
                "The reduction is injective on every maximal spherical special subgroup.",
                "The ordered generator matrices lie in an explicitly finite general linear group.",
            ],
        },
        "materialization": {
            "status": "not-materialized",
            "manageableUnderCurrentBound": manageable if exact_index else None,
            "currentDegreeBound": int(manageable_degree),
            "reason": (
                "The exact regular quotient degree fits the configured bound, but no permutation rows were written."
                if manageable
                else "The kernel is certified, but its exact index is not yet known, so its regular action cannot be materialized."
                if not exact_index
                else "The exact regular quotient degree exceeds the configured materialization bound."
            ),
        },
        "claims": ["finite-index", "normal", "torsion-free"],
        "nonClaims": [
            "smallest torsion-free index",
            "materialized quotient complex",
            "virtual algebraic fibering",
        ],
    }
    if exact_index:
        value["indexDecimal"] = str(index)
        value["indexSafeInteger"] = index if index <= 2**53 - 1 else None
        value["sourceFiniteImage"]["imageOrderDecimal"] = str(index)
        value["claims"].append("exact-index")
    else:
        value["nonClaims"].insert(0, "exact congruence-kernel index")
    value["certificateSha256"] = digest_json(value)
    return value


def spherical_shortlex_words(
    spherical_group: Any,
    permutation_map: Any,
    expected_order: int,
) -> tuple[dict[tuple[int, ...], tuple[int, ...]], int]:
    """Index a finite spherical group by canonical source-generator words.

    GAP may choose a different representative for the same conjugacy class
    after unrelated BSGS work.  A generator-ordered BFS gives every element its
    shortest lexicographically first word, making witness ids and cache hashes
    independent of that internal choice.  This closes only the finite
    spherical groups (order at most 720 for the compact 5-cube), never the much
    larger congruence image.
    """

    h_gap = libgap.Image(permutation_map)
    source_generators = list(libgap.GeneratorsOfGroup(spherical_group))
    image_generators = [
        libgap.Image(permutation_map, generator) for generator in source_generators
    ]
    degree = int(libgap.LargestMovedPoint(h_gap))
    degree = max(1, degree)
    identity = libgap.One(h_gap)
    identity_key = permutation_key(identity, degree)
    words: dict[tuple[int, ...], tuple[int, ...]] = {identity_key: ()}
    elements: deque[Any] = deque([identity])
    while elements:
        element = elements.popleft()
        prefix = words[permutation_key(element, degree)]
        for generator_index, generator in enumerate(image_generators):
            target = element * generator
            key = permutation_key(target, degree)
            if key in words:
                continue
            words[key] = (*prefix, generator_index)
            elements.append(target)
    if len(words) != expected_order:
        raise ExactInvariantError(
            "Shortlex spherical closure has "
            f"{len(words)} elements; expected {expected_order}."
        )
    return words, degree


def build_witness_catalogue(
    finite_image: FiniteImage,
    coxeter_matrix: Sequence[Sequence[int]],
    spherical: Sequence[shared.SphericalSubset],
    maximum: int,
    deadline: Deadline,
) -> list[dict[str, Any]]:
    # The seed stabilizes GAP's auxiliary choices.  Canonical shortlex words
    # below are the actual reproducibility boundary.
    libgap.set_seed(WITNESS_ENUMERATION_SEED)
    witnesses_by_word: dict[tuple[int, ...], dict[str, Any]] = {}
    for subgroup in spherical:
        deadline.check(f"enumerating prime-order classes in {subgroup.type_name}")
        spherical_group = abstract_spherical_coxeter_group(
            coxeter_matrix, subgroup.subset
        )
        permutation_map = libgap.IsomorphismPermGroup(spherical_group)
        if permutation_map == libgap.fail:
            raise ExactInvariantError(
                f"GAP could not construct {subgroup.type_name} as a permutation group."
            )
        h_gap = libgap.Image(permutation_map)
        if int(libgap.Size(h_gap)) != subgroup.expected_order:
            raise ExactInvariantError(
                f"Abstract spherical group {list(subgroup.subset)} has the wrong order."
            )
        shortlex_words, permutation_degree = spherical_shortlex_words(
            spherical_group, permutation_map, subgroup.expected_order
        )
        classes = list(libgap.ConjugacyClasses(h_gap))
        for conjugacy_class in classes:
            representative = libgap.Representative(conjugacy_class)
            order = int(libgap.Order(representative))
            if not is_prime_integer(order):
                continue
            local_word = min(
                shortlex_words[permutation_key(element, permutation_degree)]
                for element in libgap.AsList(conjugacy_class)
            )
            word = [int(subgroup.subset[index]) for index in local_word]
            word_key = tuple(word)
            origin = {
                "sphericalSubsetId": "T:" + ",".join(map(str, subgroup.subset)),
                "subset": list(subgroup.subset),
                "sphericalType": subgroup.type_name,
                "sphericalOrder": subgroup.expected_order,
                "primeOrder": order,
                "classSize": int(libgap.Size(conjugacy_class)),
                "canonicalWord": word,
            }
            existing = witnesses_by_word.get(word_key)
            if existing is not None:
                existing["classOrigins"].append(origin)
                continue
            image_element = evaluate_gap_word(
                finite_image.q_gap, finite_image.q_generators, word
            )
            if int(libgap.Order(image_element)) != order:
                raise ExactInvariantError(
                    "A spherical witness changed order in the exact finite image."
                )
            witnesses_by_word[word_key] = {
                "sphericalSubsetId": origin["sphericalSubsetId"],
                "subset": origin["subset"],
                "sphericalType": origin["sphericalType"],
                "sphericalOrder": origin["sphericalOrder"],
                "primeOrder": order,
                "classSize": origin["classSize"],
                "word": word,
                "classOrigins": [origin],
            }
            if len(witnesses_by_word) > maximum:
                raise SearchLimit(
                    f"Prime-order witness catalogue exceeds maxWitnesses={maximum}."
                )
    witnesses = list(witnesses_by_word.values())
    for witness in witnesses:
        witness["classOrigins"].sort(
            key=lambda origin: (
                origin["subset"],
                origin["primeOrder"],
                origin["classSize"],
                origin["canonicalWord"],
            )
        )
    witnesses.sort(
        key=lambda item: (
            item["subset"],
            item["primeOrder"],
            item["classSize"],
            len(item["word"]),
            item["word"],
        )
    )
    for index, witness in enumerate(witnesses):
        witness["id"] = f"tw{index}"
    if not witnesses:
        raise ExactInvariantError("No prime-order spherical witnesses were found.")
    return witnesses


def catalogue_cache_path(cache_dir: Path, matrix_digest: str) -> Path:
    return (
        cache_dir
        / matrix_digest
        / f"spherical-witnesses-seed{WITNESS_ENUMERATION_SEED}-{BACKEND_VERSION}.json"
    )


def load_cached_catalogue(path: Path, header: dict[str, Any]) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    value = read_json_object(path)
    expected = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": CATALOGUE_TYPE,
        "backendVersion": BACKEND_VERSION,
        "implementationSha256": header["implementationSha256"],
        "matrixDigest": header["matrixDigest"],
        "sphericalDigest": header["sphericalDigest"],
        "witnessEnumerationSeed": header["witnessEnumerationSeed"],
    }
    if any(
        value.get(key) != expected_value for key, expected_value in expected.items()
    ):
        return None
    witnesses = value.get("witnesses")
    if not isinstance(witnesses, list) or value.get("witnessDigest") != digest_json(
        witnesses
    ):
        return None
    origins = [
        origin for witness in witnesses for origin in witness.get("classOrigins", [])
    ]
    if value.get("classOriginCount") != len(origins) or value.get(
        "classOriginDigest"
    ) != digest_json(origins):
        return None
    return value


def write_catalogue_cache(
    path: Path,
    header: dict[str, Any],
    witnesses: list[dict[str, Any]],
    finite_image: FiniteImage,
) -> dict[str, Any]:
    origins = [
        origin for witness in witnesses for origin in witness.get("classOrigins", [])
    ]
    value = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": CATALOGUE_TYPE,
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        **header,
        "witnessCount": len(witnesses),
        "witnessDigest": digest_json(witnesses),
        "classOriginCount": len(origins),
        "classOriginDigest": digest_json(origins),
        "witnesses": witnesses,
        "constructedFrom": {
            "candidateId": finite_image.candidate.candidate_id,
            "imageOrder": finite_image.order,
            "exactRelationsPassed": True,
            "allMaximalSphericalRestrictionsInjective": True,
        },
        "claims": [
            "complete-maximal-spherical-catalogue",
            "complete-prime-order-class-origin-coverage",
            "deterministic-shortlex-witness-set",
        ],
        "nonClaims": ["minimal witness list", "torsion-free subgroup found"],
    }
    atomic_write_json(path, value)
    return value


def evaluate_gap_word(
    group: Any, generators: Sequence[Any], word: Sequence[int]
) -> Any:
    value = libgap.One(group)
    for generator in word:
        value *= generators[generator]
    return value


def factorization_pairs(group: Any, element: Any) -> list[list[int]]:
    extrep = list(libgap.ExtRepOfObj(libgap.Factorization(group, element)))
    if len(extrep) % 2:
        raise ExactInvariantError("A subgroup factorization has odd external length.")
    return [
        [int(extrep[index]) - 1, int(extrep[index + 1])]
        for index in range(0, len(extrep), 2)
    ]


def evaluate_factorization(
    group: Any, generators: Sequence[Any], word: Sequence[Sequence[int]]
) -> Any:
    value = libgap.One(group)
    for generator, exponent in word:
        value *= generators[int(generator)] ** int(exponent)
    return value


def subgroup_descriptor(
    q_gap: Any, subgroup: Any, q_generators: Sequence[Any], depth: int
) -> dict[str, Any]:
    order = int(libgap.Size(subgroup))
    words = [
        factorization_pairs(q_gap, generator)
        for generator in list(libgap.GeneratorsOfGroup(subgroup))
    ]
    words.sort(key=canonical_json)
    for word in words:
        reconstructed = evaluate_factorization(q_gap, q_generators, word)
        if reconstructed not in subgroup:
            raise ExactInvariantError("A checkpoint subgroup word left its subgroup.")
    fingerprint = digest_json({"order": order, "generatorWords": words})
    return {
        "fingerprint": fingerprint,
        "order": order,
        "depth": depth,
        "generatorWords": words,
    }


def reconstruct_subgroup(
    q_gap: Any, q_generators: Sequence[Any], descriptor: dict[str, Any]
) -> Any:
    words = descriptor.get("generatorWords", [])
    elements = [evaluate_factorization(q_gap, q_generators, word) for word in words]
    subgroup = libgap.Group(elements) if elements else libgap.TrivialSubgroup(q_gap)
    if int(libgap.Size(subgroup)) != int(descriptor["order"]):
        raise ExactInvariantError(
            "Checkpoint subgroup order changed on reconstruction."
        )
    return subgroup


def compact_subgroup_rows_hash(action_hash: str, rows: Sequence[Sequence[int]]) -> str:
    """Match the GAP certificate hash for compact subgroup generator rows."""

    if len(action_hash) != 64 or any(
        character not in "0123456789abcdef" for character in action_hash
    ):
        raise ExactInvariantError("Compact subgroup rows need a valid action hash.")
    canonical_rows = canonical_json([[int(point) for point in row] for row in rows])
    return hashlib.sha256(f"{action_hash}:{canonical_rows}".encode("utf8")).hexdigest()


def recognition_exact_candidate_descriptors(
    finite_image: FiniteImage,
    certificate: dict[str, Any],
) -> list[dict[str, Any]]:
    """Reconstruct exact GAP survivors in the compact finite-image action.

    GAP classifies subgroup conjugacy classes before any large coset action is
    built.  A survivor crosses this boundary only as generator rows in the
    already certified compact action.  The ordinary module evaluator then
    constructs Q/L and performs the independent spherical-orbit certificate.
    """

    if not finite_image.permutation_materialized:
        return []
    mod2 = certificate.get("mod2Certificate")
    if not isinstance(mod2, dict):
        return []
    classification = mod2.get("finiteIndexClassification")
    if not isinstance(classification, dict):
        return []
    report = classification.get("report")
    if not isinstance(report, list):
        return []
    action_hash = certificate.get("actionHash")
    if not isinstance(action_hash, str):
        raise ExactInvariantError("Recognition candidate rows lack an action hash.")
    degree = int(finite_image.permutation_degree or 0)
    descriptors: dict[str, dict[str, Any]] = {}
    for row in report:
        if not isinstance(row, dict) or row.get("classification") != (
            "witness-free-candidate-found"
        ):
            continue
        for ordinal, candidate in enumerate(row.get("exactCandidates", [])):
            if not isinstance(candidate, dict):
                continue
            materialization = candidate.get("compactSubgroupMaterialization")
            if not isinstance(materialization, dict):
                raise ExactInvariantError(
                    "A witness-free recognition candidate lacks compact generators."
                )
            if (
                materialization.get("ambientActionDegree") != degree
                or materialization.get("ambientActionSha256") != action_hash
            ):
                raise ExactInvariantError(
                    "Compact subgroup rows belong to another finite-image action."
                )
            rows = materialization.get("subgroupGeneratorRows")
            if not isinstance(rows, list) or any(
                not isinstance(generator_row, list)
                or len(generator_row) != degree
                or sorted(generator_row) != list(range(1, degree + 1))
                for generator_row in rows
            ):
                raise ExactInvariantError(
                    "Compact subgroup generator rows are not full permutations."
                )
            digest = compact_subgroup_rows_hash(action_hash, rows)
            if digest != materialization.get("subgroupGeneratorRowsSha256"):
                raise ExactInvariantError(
                    "Compact subgroup generator rows failed their certificate hash."
                )
            generators = [libgap.PermList(generator_row) for generator_row in rows]
            subgroup = (
                libgap.Group(generators)
                if generators
                else libgap.TrivialSubgroup(finite_image.q_gap)
            )
            if not bool(libgap.IsSubgroup(finite_image.q_gap, subgroup)):
                raise ExactInvariantError(
                    "A compact recognition candidate is not a subgroup of Q."
                )
            expected_order = int(materialization.get("subgroupOrder", 0))
            expected_index = int(materialization.get("subgroupIndex", 0))
            if (
                int(libgap.Size(subgroup)) != expected_order
                or int(libgap.Index(finite_image.q_gap, subgroup)) != expected_index
                or expected_index != int(row.get("target", 0))
            ):
                raise ExactInvariantError(
                    "A compact recognition candidate changed order or index."
                )
            descriptor = subgroup_descriptor(
                finite_image.q_gap, subgroup, finite_image.q_generators, 0
            )
            descriptor.update(
                {
                    "seedKind": RECOGNITION_EXACT_SEED_KIND,
                    "candidateFingerprint": digest,
                    "origin": {
                        "kind": RECOGNITION_EXACT_SEED_KIND,
                        "targetIndex": expected_index,
                        "candidateOrdinal": ordinal,
                        "compactRowsSha256": digest,
                        "recognitionActionSha256": action_hash,
                    },
                }
            )
            descriptors.setdefault(digest, descriptor)
    return sorted(descriptors.values(), key=descriptor_sort_key)


def natural_bsgs_orbit_descriptors(
    finite_image: FiniteImage,
) -> list[dict[str, Any]]:
    """Return point stabilizers for every orbit in the compact BSGS support.

    Sage's smaller permutation representation may be intransitive. Each of its
    natural orbits is already an exact transitive Q-set, hence a cheap partial
    module. For the compact 5-cube mod-2 image these are the familiar degree-3
    and degree-119 actions. We reconstruct each as Q/Stab(point) so it enters
    the same independently checked coset-action path as later candidates.
    """

    moved_points = libgap.MovedPoints(finite_image.q_gap)
    if int(libgap.Size(moved_points)) == 0:
        return []
    orbit_points = [
        sorted(int(point) for point in list(orbit))
        for orbit in list(libgap.OrbitsDomain(finite_image.q_gap, moved_points))
    ]
    orbit_points.sort(key=lambda points: (len(points), points[0], points))
    descriptors: list[dict[str, Any]] = []
    for ordinal, points in enumerate(orbit_points):
        representative = points[0]
        stabilizer = libgap.Stabilizer(
            finite_image.q_gap, representative, libgap.OnPoints
        )
        descriptor = subgroup_descriptor(
            finite_image.q_gap,
            stabilizer,
            finite_image.q_generators,
            0,
        )
        degree = finite_image.order // int(descriptor["order"])
        if degree != len(points):
            raise ExactInvariantError(
                "A compact BSGS orbit size disagrees with its point-stabilizer index."
            )
        origin = {
            "kind": NATURAL_ORBIT_SEED_KIND,
            "orbitOrdinal": ordinal,
            "orbitSize": len(points),
            "representativePoint": representative,
            "orbitPointsDigest": digest_json(points),
            "compactPermutationDegree": finite_image.permutation_degree,
        }
        descriptor.update(
            {
                "seedKind": NATURAL_ORBIT_SEED_KIND,
                "origin": origin,
                # Distinct natural orbits are retained even if their point
                # stabilizers happen to coincide and define equivalent Q-sets.
                "candidateFingerprint": digest_json(
                    {
                        "subgroupFingerprint": descriptor["fingerprint"],
                        "origin": origin,
                    }
                ),
            }
        )
        descriptors.append(descriptor)
    return descriptors


def checkpoint_header(
    input_hash: str,
    matrix_digest: str,
    catalogue: dict[str, Any],
    finite_image: FiniteImage,
    args: argparse.Namespace,
) -> dict[str, Any]:
    structural_path = getattr(args, "structural_certificate", None)
    structural_hash = (
        recognition.sha256_bytes(Path(structural_path).resolve().read_bytes())
        if structural_path is not None
        else None
    )
    replay_script_path = getattr(args, "structural_replay_gap_script", None)
    replay_script_hash = (
        recognition.sha256_bytes(Path(replay_script_path).resolve().read_bytes())
        if structural_path is not None and replay_script_path is not None
        else None
    )
    config = {
        "maxIndex": args.max_index,
        "maxModules": args.max_modules,
        "maxSubgroups": args.max_subgroups,
        "subgroupSource": args.subgroup_source,
        "maxTableOfMarksOrder": args.max_tom_order,
        "maxActionBytes": args.max_action_bytes,
        "moduleCacheBytes": args.module_cache_bytes,
        "lowerBoundDivisor": args.effective_lower_bound,
        "bsgsSeed": args.seed,
        "recognitionMode": args.recognition,
        "maxGenericMaximalOrder": args.max_generic_maximal_order,
        "allowUnrecognizedMaximalSearch": args.allow_unrecognized_maximal_search,
        "maxMaterializedImageOrder": args.max_materialized_image_order,
        "structuralCertificateFileSha256": structural_hash,
        "structuralReplayVerifierSha256": replay_script_hash,
    }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": CHECKPOINT_TYPE,
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "implementationSha256": IMPLEMENTATION_SHA256,
        "inputHash": input_hash,
        "matrixDigest": matrix_digest,
        "witnessDigest": catalogue["witnessDigest"],
        "classOriginDigest": catalogue["classOriginDigest"],
        "candidateId": finite_image.candidate.candidate_id,
        "finiteImageOrder": finite_image.order,
        "config": config,
        "configDigest": digest_json(config),
    }


def fresh_checkpoint(header: dict[str, Any]) -> dict[str, Any]:
    return {
        **header,
        "stage": "subgroup-search",
        "complete": False,
        "terminal": False,
        "frontierExhausted": False,
        "minimumProved": False,
        "indexScreeningComplete": False,
        "reason": None,
        "visitedFingerprints": [],
        "frontier": [],
        "pendingModules": [],
        "modules": [],
        "metrics": {
            "subgroupsExpanded": 0,
            "subgroupsDiscovered": 0,
            "degreeFiltered": 0,
            "modulesEvaluated": 0,
            "spooledBytes": 0,
        },
        "passingModuleId": None,
    }


def load_checkpoint(path: Path, header: dict[str, Any], resume: bool) -> dict[str, Any]:
    if not resume or not path.is_file():
        return fresh_checkpoint(header)
    value = read_json_object(path)
    keys = (
        "schemaVersion",
        "artifactType",
        "backendVersion",
        "implementationSha256",
        "inputHash",
        "matrixDigest",
        "witnessDigest",
        "classOriginDigest",
        "candidateId",
        "finiteImageOrder",
        "configDigest",
    )
    mismatches = [key for key in keys if value.get(key) != header.get(key)]
    if mismatches:
        raise ExactInvariantError(
            "Refusing stale finite-image checkpoint; mismatched "
            + ", ".join(mismatches)
        )
    return value


def action_byte_estimate(degree: int, rank: int) -> int:
    # GAP has additional object overhead.  This lower bound prevents obviously
    # oversized actions from entering the native coset constructor.
    return degree * rank * 8


def permutation_relation_checks(
    images: Sequence[Any], coxeter_matrix: Sequence[Sequence[int]]
) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    for index, generator in enumerate(images):
        passed = bool(libgap.IsOne(generator**2))
        checks.append(
            {
                "kind": "involution",
                "generators": [index, index],
                "exponent": 2,
                "passed": passed,
            }
        )
        if not passed:
            raise ExactInvariantError(
                f"Coset image generator {index} is not an involution."
            )
    for left in range(len(images)):
        for right in range(left + 1, len(images)):
            m = coxeter_matrix[left][right]
            if m == 0:
                continue
            passed = bool(libgap.IsOne((images[left] * images[right]) ** m))
            checks.append(
                {
                    "kind": "coxeter",
                    "generators": [left, right],
                    "exponent": m,
                    "passed": passed,
                }
            )
            if not passed:
                raise ExactInvariantError(
                    f"Coset action failed relation ({left},{right})^{m}."
                )
    return checks


def spherical_orbit_certificate(
    action_images: Sequence[Any],
    spherical: Sequence[shared.SphericalSubset],
    degree: int,
) -> list[dict[str, Any]]:
    domain = libgap(list(range(1, degree + 1)))
    checks: list[dict[str, Any]] = []
    for subgroup in spherical:
        restricted = libgap.Group([action_images[index] for index in subgroup.subset])
        orbits = list(libgap.OrbitsDomain(restricted, domain))
        orbit_sizes = sorted(int(libgap.Size(orbit)) for orbit in orbits)
        free = bool(orbit_sizes) and all(
            size == subgroup.expected_order for size in orbit_sizes
        )
        checks.append(
            {
                "sphericalSubsetId": "T:" + ",".join(map(str, subgroup.subset)),
                "expectedOrder": subgroup.expected_order,
                "orbitCount": len(orbit_sizes),
                "orbitSizes": orbit_sizes,
                "free": free,
            }
        )
    return checks


def optional_permutation_character(
    q_gap: Any, subgroup: Any, degree: int, enabled: bool
) -> dict[str, Any] | None:
    if not enabled:
        return None
    character = libgap.PermutationCharacter(q_gap, subgroup)
    values = [int(value) for value in list(character)]
    if not values or values[0] != degree:
        raise ExactInvariantError(
            "Permutation character degree disagrees with coset degree."
        )
    return {
        "degree": degree,
        "valueCount": len(values),
        "valuesDigest": digest_json(values),
    }


def evaluate_coset_module(
    finite_image: FiniteImage,
    subgroup: Any,
    descriptor: dict[str, Any],
    witnesses: Sequence[dict[str, Any]],
    witness_elements: Sequence[Any],
    spherical: Sequence[shared.SphericalSubset],
    coxeter_matrix: Sequence[Sequence[int]],
    args: argparse.Namespace,
    module_index: int,
    deadline: Deadline,
) -> tuple[dict[str, Any], list[Any]]:
    degree = finite_image.order // int(descriptor["order"])
    if action_byte_estimate(degree, len(coxeter_matrix)) > args.max_action_bytes:
        raise SearchLimit(
            f"Coset action degree {degree} exceeds maxActionBytes={args.max_action_bytes}."
        )
    deadline.check(f"constructing coset action of degree {degree}")
    cosets = libgap.RightCosets(finite_image.q_gap, subgroup)
    if int(libgap.Size(cosets)) != degree:
        raise ExactInvariantError(
            "Right-coset count disagrees with the subgroup index."
        )
    homomorphism = libgap.ActionHomomorphism(finite_image.q_gap, cosets, libgap.OnRight)
    action_images = [
        libgap.Image(homomorphism, generator) for generator in finite_image.q_generators
    ]
    relation_checks = permutation_relation_checks(action_images, coxeter_matrix)
    fixed_counts: list[int] = []
    covered_indexes: list[int] = []
    for index, witness in enumerate(witnesses):
        deadline.check(f"checking witness {witness['id']}")
        image = libgap.Image(homomorphism, witness_elements[index])
        fixed_count = degree - int(libgap.NrMovedPoints(image))
        fixed_counts.append(fixed_count)
        if fixed_count == 0:
            covered_indexes.append(index)
    all_witnesses_free = len(covered_indexes) == len(witnesses)
    covered_origin_count = sum(
        len(witnesses[index].get("classOrigins", [])) for index in covered_indexes
    )
    total_origin_count = sum(
        len(witness.get("classOrigins", [])) for witness in witnesses
    )
    spherical_checks: list[dict[str, Any]] = []
    if all_witnesses_free:
        spherical_checks = spherical_orbit_certificate(action_images, spherical, degree)
    spherical_free = bool(spherical_checks) and all(
        check["free"] for check in spherical_checks
    )
    passed = all_witnesses_free and spherical_free
    permutation_character = optional_permutation_character(
        finite_image.q_gap,
        subgroup,
        degree,
        args.permutation_characters and finite_image.order <= args.max_character_order,
    )
    record = {
        "id": f"fim-{finite_image.candidate.candidate_id}-{module_index}",
        "finiteImageCandidateId": finite_image.candidate.candidate_id,
        "candidateFingerprint": descriptor.get(
            "candidateFingerprint", descriptor["fingerprint"]
        ),
        "subgroupFingerprint": descriptor["fingerprint"],
        "subgroupOrder": int(descriptor["order"]),
        "subgroupGeneratorWords": descriptor["generatorWords"],
        "degree": degree,
        "transitive": True,
        "origin": descriptor.get("origin", {"kind": "subgroup-search"}),
        "coverageHex": encode_coverage(covered_indexes, len(witnesses)),
        "coveredWitnessIds": [witnesses[index]["id"] for index in covered_indexes],
        "coveredClassOriginCount": covered_origin_count,
        "totalClassOriginCount": total_origin_count,
        "uncoveredWitnessIds": [
            witness["id"]
            for index, witness in enumerate(witnesses)
            if index not in set(covered_indexes)
        ],
        "fixedPointCounts": fixed_counts,
        "fixedPointCountsDigest": digest_json(fixed_counts),
        "relationChecks": relation_checks,
        "sphericalOrbitChecks": spherical_checks,
        "permutationCharacter": permutation_character,
        "status": "passed" if passed else "partial",
        "certificateCriterion": "prime-order-fixed-points+spherical-regular-orbits",
        "claims": ["finite-index", "torsion-free"] if passed else [],
        "nonClaims": [
            "minimal index",
            "normal subgroup",
            "manifold",
            "virtual fibering",
        ],
    }
    return record, action_images


def packed_row_type(degree: int) -> tuple[str, str]:
    if degree <= 0xFFFF:
        return "H", "uint16-le"
    if degree <= 0xFFFFFFFF:
        return "I", "uint32-le"
    raise SearchLimit("Passing action degree exceeds uint32 storage.")


def packed_action_byte_length(degree: int, generator_count: int) -> int:
    typecode, _encoding = packed_row_type(degree)
    item_size = array(typecode).itemsize
    expected = 2 if typecode == "H" else 4
    if item_size != expected:
        raise ExactInvariantError(
            f"Platform array type {typecode} has {item_size} bytes, expected {expected}."
        )
    return degree * generator_count * item_size


def spool_action_rows(
    output_dir: Path,
    module: dict[str, Any],
    action_images: Sequence[Any],
) -> dict[str, Any]:
    """Write one row per source generator without building Python row lists."""

    output_dir.mkdir(parents=True, exist_ok=True)
    degree = int(module["degree"])
    typecode, encoding = packed_row_type(degree)
    packed_path = output_dir / f"{module['id']}.permutations.bin"
    temporary_path = packed_path.with_name(f".{packed_path.name}.{os.getpid()}.tmp")
    digest = hashlib.sha256()
    with temporary_path.open("wb") as stream:
        for permutation in action_images:
            row = array(
                typecode,
                (
                    int(libgap.OnPoints(point, permutation)) - 1
                    for point in range(1, degree + 1)
                ),
            )
            if sys.byteorder != "little":
                row.byteswap()
            chunk = row.tobytes()
            stream.write(chunk)
            digest.update(chunk)
    os.replace(temporary_path, packed_path)
    return {
        "path": str(packed_path),
        "encoding": encoding,
        "rowMajor": True,
        "zeroBasedPoints": True,
        "generatorCount": len(action_images),
        "sourceGeneratorOrder": list(range(len(action_images))),
        "degree": degree,
        "sha256": digest.hexdigest(),
        "byteLength": packed_path.stat().st_size,
    }


def _copy_content_addressed_rows(
    packed: dict[str, Any], storage_root: Path
) -> dict[str, Any]:
    """Verify and retain packed rows under their content digest.

    Checkpoint paths include a particular search configuration.  The catalogue
    instead points at a content-addressed blob, so the same exact action remains
    reusable when bounds or portfolio scheduling change.
    """

    source = Path(str(packed["path"]))
    if not source.is_file():
        raise ExactInvariantError(f"Packed permutation rows are missing: {source}")
    expected_hash = str(packed["sha256"])
    expected_bytes = int(packed["byteLength"])
    if source.stat().st_size != expected_bytes:
        raise ExactInvariantError("Packed permutation byte length changed on disk.")
    digest = hashlib.sha256()
    with source.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    if digest.hexdigest() != expected_hash:
        raise ExactInvariantError("Packed permutation digest changed on disk.")

    descriptor = module_catalogue.build_packed_row_descriptor(
        degree=int(packed["degree"]),
        generator_count=int(packed["generatorCount"]),
        packed_sha256=expected_hash,
        byte_length=expected_bytes,
        source_generator_order=packed["sourceGeneratorOrder"],
    )
    destination = storage_root.joinpath(*Path(descriptor["storageKey"]).parts)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.is_file():
        temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
        shutil.copyfile(source, temporary)
        os.replace(temporary, destination)
    module_catalogue.verify_packed_rows_file(descriptor, storage_root)
    return descriptor


def persist_partial_module_catalogue(
    *,
    source: dict[str, Any],
    input_hash: str,
    matrix_digest: str,
    witness_catalogue: dict[str, Any],
    attempts: Sequence[dict[str, Any]],
    checkpoint: dict[str, Any],
    cache_dir: Path,
    max_unique_packed_bytes: int,
) -> tuple[dict[str, Any], str]:
    """Seal exact partial actions and aggregate compatible prior runs.

    Completeness is always relative to the recorded bounded subgroup-search
    scope.  A sealed partial module proves only its own action and witness
    coverage; it does not prove that a composite action exists.
    """

    candidate_id = str(checkpoint["candidateId"])
    attempt = next(
        (
            item
            for item in attempts
            if str(item.get("candidateId")) == candidate_id
            and isinstance(item.get("recognitionBridge"), dict)
        ),
        None,
    )
    if attempt is None:
        raise ExactInvariantError(
            "Cannot bind reusable modules to their finite-image transfer hash."
        )
    image_hash = str(attempt["recognitionBridge"].get("actionHash", ""))
    if len(image_hash) != 64:
        raise ExactInvariantError("Finite-image recognition transfer hash is missing.")

    storage_root = cache_dir / matrix_digest / "partial-module-catalogues-v1"
    storage_root.mkdir(parents=True, exist_ok=True)
    finite_image_record = module_catalogue.build_finite_image_record(
        image_id=candidate_id,
        characteristic=int(attempt["rationalPrime"]),
        finite_image_sha256=image_hash,
        order=int(checkpoint["finiteImageOrder"]),
        origin={
            "kind": "exact-congruence-image",
            "recognitionActionSha256": image_hash,
            "structuralRecognitionStatus": attempt.get("structuralRecognition", {}).get(
                "status", "unknown"
            ),
        },
    )
    witness_ids = [str(item["id"]) for item in witness_catalogue["witnesses"]]
    witness_index = {identifier: index for index, identifier in enumerate(witness_ids)}
    modules: list[dict[str, Any]] = []
    for raw in checkpoint.get("modules", []):
        packed = raw.get("packedPermutationRows")
        if not isinstance(packed, dict):
            continue
        covered_indexes = [
            witness_index[identifier]
            for identifier in raw.get("coveredWitnessIds", [])
            if identifier in witness_index
        ]
        if len(covered_indexes) != len(raw.get("coveredWitnessIds", [])):
            raise ExactInvariantError(
                "A partial module refers to a stale torsion-witness catalogue."
            )
        descriptor = _copy_content_addressed_rows(packed, storage_root)
        coverage = module_catalogue.build_fixed_point_coverage(
            covered_indexes,
            len(witness_ids),
            witness_catalogue["witnessDigest"],
        )
        modules.append(
            module_catalogue.build_module_record(
                source_sha256=input_hash,
                matrix_sha256=matrix_digest,
                witness_sha256=witness_catalogue["witnessDigest"],
                finite_image_sha256=image_hash,
                finite_image_id=candidate_id,
                characteristic=int(attempt["rationalPrime"]),
                degree=int(raw["degree"]),
                origin={
                    "kind": "exact-coset-action",
                    "candidateOrigin": raw.get("origin", {"kind": "subgroup-search"}),
                },
                subgroup_fingerprint=str(raw["subgroupFingerprint"]),
                packed_rows=descriptor,
                fixed_point_coverage=coverage,
                status=("torsion-free" if raw.get("status") == "passed" else "partial"),
            )
        )

    current = module_catalogue.build_catalogue(
        source_sha256=input_hash,
        matrix_sha256=matrix_digest,
        witness_sha256=witness_catalogue["witnessDigest"],
        witness_count=len(witness_ids),
        source_generator_count=len(source["generators"]),
        finite_images=[finite_image_record],
        modules=modules,
        scope={
            "kind": "bounded-finite-image-subgroup-search",
            "candidateId": candidate_id,
            "maxIndex": checkpoint["config"]["maxIndex"],
            "maxModules": checkpoint["config"]["maxModules"],
            "maxSubgroups": checkpoint["config"]["maxSubgroups"],
            "terminalReason": checkpoint.get("reason"),
        },
        complete=bool(checkpoint.get("complete")),
        max_unique_packed_bytes=max_unique_packed_bytes,
    )
    image_path = storage_root / f"{image_hash}.json"
    atomic_write_json(image_path, current)

    compatible: list[dict[str, Any]] = []
    expected_hashes = {
        "sourceSha256": input_hash,
        "matrixSha256": matrix_digest,
        "witnessSha256": witness_catalogue["witnessDigest"],
    }
    for path in sorted(storage_root.glob("*.json")):
        if path.name == "aggregate.json":
            continue
        try:
            compatible.append(
                module_catalogue.validate_catalogue(
                    read_json_object(path),
                    expected_hashes=expected_hashes,
                    require_complete=False,
                )
            )
        except module_catalogue.CatalogueError:
            # Stale catalogues remain on disk for auditability but never enter
            # a search with different source or witness hashes.
            continue
    all_images = [item for value in compatible for item in value["finiteImages"]]
    all_modules = [item for value in compatible for item in value["modules"]]
    aggregate = module_catalogue.build_catalogue(
        source_sha256=input_hash,
        matrix_sha256=matrix_digest,
        witness_sha256=witness_catalogue["witnessDigest"],
        witness_count=len(witness_ids),
        source_generator_count=len(source["generators"]),
        finite_images=all_images,
        modules=all_modules,
        scope={
            "kind": "reusable-partial-module-union",
            "componentCatalogueSha256": sorted(
                value["catalogueSha256"] for value in compatible
            ),
        },
        complete=all(value["complete"] for value in compatible),
        max_unique_packed_bytes=max_unique_packed_bytes,
    )
    aggregate_path = storage_root / "aggregate.json"
    atomic_write_json(aggregate_path, aggregate)
    return aggregate, str(storage_root)


def passing_action_record(
    finite_image: FiniteImage,
    module: dict[str, Any],
    action_images: Sequence[Any],
    packed_rows: dict[str, Any],
    materialization: str,
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "degree": int(module["degree"]),
        "generatorCount": len(action_images),
        "materialization": materialization,
        "packedPermutationRows": packed_rows,
        "cosetConvention": "Right cosets of L in the exact finite image Q",
        "subgroupGeneratorWords": module["subgroupGeneratorWords"],
        "certificate": {
            "status": "passed",
            "certificateType": "torsion-free-coset-action",
            "certificateLevel": MATERIALIZED_COVER_LEVEL,
            "criterion": module["certificateCriterion"],
            "fixedPointCountsDigest": module["fixedPointCountsDigest"],
            "sphericalOrbitChecks": module["sphericalOrbitChecks"],
            "finiteImageOrder": finite_image.order,
        },
    }
    if materialization == "json":
        degree = int(module["degree"])
        value["generatorActions"] = [
            {
                "generator": generator,
                "images": [
                    int(libgap.OnPoints(point, permutation)) - 1
                    for point in range(1, degree + 1)
                ],
            }
            for generator, permutation in enumerate(action_images)
        ]
    return value


def table_of_marks_descriptors(
    finite_image: FiniteImage,
    lower_bound: int,
    maximum: int,
    deadline: Deadline,
) -> Iterable[dict[str, Any]]:
    deadline.check("constructing the table of marks")
    table = libgap.TableOfMarks(finite_image.q_gap)
    orders = [int(value) for value in list(libgap.OrdersTom(table))]
    for position, subgroup_order in enumerate(orders, start=1):
        degree = finite_image.order // subgroup_order
        if not degree_allowed(degree, lower_bound, maximum):
            continue
        deadline.check(f"recovering table-of-marks subgroup {position}")
        subgroup = libgap.RepresentativeTom(table, position)
        yield subgroup_descriptor(
            finite_image.q_gap, subgroup, finite_image.q_generators, 0
        )


def _gap_function(source: str) -> Any:
    """Compile a small GAP helper without exposing arbitrary user input."""

    return libgap.eval(source)


def mod2_product_table_of_marks_descriptors(
    finite_image: FiniteImage,
    witnesses: Sequence[dict[str, Any]],
    witness_elements: Sequence[Any],
    lower_bound: int,
    maximum: int,
    checkpoint: dict[str, Any],
    deadline: Deadline,
) -> Iterable[dict[str, Any]]:
    """Sieve canonical ``A x C`` subgroups by exact fixed-point marks.

    The certified mod-2 image is ``S3 x (O8-(2):2)``.  TomLib supplies every
    conjugacy class ``C <= O8-(2)``.  For each ``A <= S3`` we can read fixed
    points on ``(S3/A) x ((O8-(2):2)/C)`` from the table before constructing
    that coset action.  These are all canonical product lifts represented by
    the complete simple-factor table; outer and nonsplit Goursat subgroups are
    deliberately not claimed by this scope.
    """

    if finite_image.order != 2_368_880_640 or not finite_image.permutation_materialized:
        return
    deadline.check("preparing the mod-2 table-of-marks fixed-point sieve")
    group = finite_image.q_gap
    orbits = sorted(
        list(libgap.OrbitsDomain(group, libgap.MovedPoints(group))),
        key=lambda orbit: int(libgap.Size(orbit)),
    )
    orbit_sizes = [int(libgap.Size(orbit)) for orbit in orbits]
    if orbit_sizes != [3, 119]:
        raise ExactInvariantError(
            "The mod-2 marks sieve requires the certified 3+119 orbit model."
        )
    action3 = libgap.ActionHomomorphism(group, orbits[0], libgap.OnPoints)
    action119 = libgap.ActionHomomorphism(group, orbits[1], libgap.OnPoints)
    large_factor = libgap.Kernel(action3)
    small_factor = libgap.Kernel(action119)
    simple_factor = libgap.DerivedSubgroup(large_factor)
    if (
        int(libgap.Size(small_factor)) != 6
        or int(libgap.Size(simple_factor)) != 197_406_720
        or int(libgap.Index(large_factor, simple_factor)) != 2
    ):
        raise ExactInvariantError("The certified mod-2 direct factors changed.")

    if not bool(libgap.LoadPackage("TomLib", False)):
        raise ExactInvariantError("TomLib is required for the mod-2 marks sieve.")
    table = libgap.TableOfMarks("O8-(2)")
    if table == libgap.fail:
        raise ExactInvariantError("TomLib has no O8-(2) table of marks.")
    orders = [int(value) for value in list(libgap.OrdersTom(table))]
    underlying = libgap.UnderlyingGroup(table)
    simple_isomorphism = libgap.IsomorphismGroups(underlying, simple_factor)
    if simple_isomorphism == libgap.fail or not bool(
        libgap.IsBijective(simple_isomorphism)
    ):
        raise ExactInvariantError(
            "Could not identify the TomLib O8-(2) model with the finite image."
        )

    decompose_small = _gap_function(
        "function(small, action, element) "
        "return First(Elements(small), a -> Image(action,a)=Image(action,element)); "
        "end"
    )
    outside_element = _gap_function(
        "function(extension, normal) "
        "return First(GeneratorsOfGroup(extension), x -> not x in normal); end"
    )(large_factor, simple_factor)
    contains = _gap_function("function(group, element) return element in group; end")
    mark_vector = _gap_function(
        "function(tom,row,columns) local subs,marks; "
        "subs:=SubsTom(tom)[row]; marks:=MarksTom(tom)[row]; "
        "return List(columns,function(col) local p; p:=Position(subs,col); "
        "if p=fail then return 0; fi; return marks[p]; end); end"
    )
    needed_cyclic_orders = {1, *(int(item["primeOrder"]) for item in witnesses)}
    cyclic_representatives: dict[int, list[tuple[int, Any]]] = {}
    for cyclic_order in sorted(needed_cyclic_orders):
        cyclic_representatives[cyclic_order] = [
            (position, libgap.RepresentativeTom(table, position))
            for position, order in enumerate(orders, start=1)
            if order == cyclic_order
        ]

    def locate_cyclic_class(subgroup: Any) -> int:
        order = int(libgap.Size(subgroup))
        for position, representative in cyclic_representatives.get(order, []):
            if bool(libgap.IsConjugate(underlying, subgroup, representative)):
                return position
        raise ExactInvariantError(
            "A mod-2 witness cyclic subgroup is absent from the table of marks."
        )

    small_classes = list(libgap.ConjugacyClassesSubgroups(small_factor))
    small_representatives = [libgap.Representative(item) for item in small_classes]
    small_actions = [
        libgap.ActionHomomorphism(
            small_factor,
            libgap.RightCosets(small_factor, subgroup),
            libgap.OnRight,
        )
        for subgroup in small_representatives
    ]
    small_components: list[Any] = []
    large_class_pairs: list[tuple[int, int] | None] = []
    unique_large_positions: set[int] = set()
    for witness, element in zip(witnesses, witness_elements, strict=True):
        deadline.check(f"classifying mod-2 witness {witness['id']}")
        small = decompose_small(small_factor, action3, element)
        if small == libgap.fail:
            raise ExactInvariantError("A mod-2 witness did not split over S3.")
        large = small**-1 * element
        small_components.append(small)
        if not bool(contains(simple_factor, large)):
            # No conjugate of an element outside the normal simple factor can
            # lie in C <= O8-(2), so this component has no fixed B/C coset.
            large_class_pairs.append(None)
            continue
        preimage = libgap.PreImagesRepresentative(simple_isomorphism, large)
        conjugate = outside_element**-1 * large * outside_element
        conjugate_preimage = libgap.PreImagesRepresentative(
            simple_isomorphism, conjugate
        )
        pair = (
            locate_cyclic_class(libgap.Group([preimage])),
            locate_cyclic_class(libgap.Group([conjugate_preimage])),
        )
        large_class_pairs.append(pair)
        unique_large_positions.update(pair)

    small_fixed_counts: list[list[int]] = []
    for action in small_actions:
        counts: list[int] = []
        # The image order is not the action degree. Read the size of the coset
        # domain directly from the corresponding subgroup index.
        subgroup = small_representatives[len(small_fixed_counts)]
        degree = int(libgap.Index(small_factor, subgroup))
        for component in small_components:
            image = libgap.Image(action, component)
            counts.append(degree - int(libgap.NrMovedPoints(image)))
        small_fixed_counts.append(counts)

    simple_order = int(libgap.Size(simple_factor))
    positions = sorted(unique_large_positions)
    metrics = checkpoint["metrics"]
    metrics.setdefault("marksCandidates", 0)
    metrics.setdefault("marksRejected", 0)
    metrics.setdefault("marksSurvivors", 0)
    candidate_positions = 0
    for table_position, subgroup_order in enumerate(orders, start=1):
        simple_index = simple_order // subgroup_order
        mark_by_position: dict[int, int] | None = None
        for small_index, small_subgroup in enumerate(small_representatives):
            degree = int(libgap.Index(small_factor, small_subgroup)) * 2 * simple_index
            if not degree_allowed(degree, lower_bound, maximum):
                continue
            candidate_positions += 1
            metrics["marksCandidates"] += 1
            if mark_by_position is None:
                row_values = [
                    int(value)
                    for value in list(mark_vector(table, table_position, positions))
                ]
                mark_by_position = dict(zip(positions, row_values, strict=True))
            rejected_by: list[str] = []
            for witness_index, witness in enumerate(witnesses):
                fixed_small = small_fixed_counts[small_index][witness_index]
                if fixed_small == 0:
                    continue
                pair = large_class_pairs[witness_index]
                fixed_large = (
                    0
                    if pair is None
                    else mark_by_position[pair[0]] + mark_by_position[pair[1]]
                )
                if fixed_small * fixed_large > 0:
                    rejected_by.append(str(witness["id"]))
                    break
            if rejected_by:
                metrics["marksRejected"] += 1
                continue

            deadline.check(
                f"materializing surviving Tom class {table_position}, S3 class {small_index + 1}"
            )
            table_subgroup = libgap.RepresentativeTom(table, table_position)
            actual_simple_subgroup = libgap.Image(simple_isomorphism, table_subgroup)
            subgroup = libgap.ClosureGroup(small_subgroup, actual_simple_subgroup)
            expected_order = int(libgap.Size(small_subgroup)) * subgroup_order
            if int(libgap.Size(subgroup)) != expected_order:
                raise ExactInvariantError(
                    "A canonical mod-2 product lift has the wrong exact order."
                )
            descriptor = subgroup_descriptor(
                group, subgroup, finite_image.q_generators, 0
            )
            origin = {
                "kind": "mod2-table-of-marks-product-lift",
                "table": "O8-(2)",
                "tablePosition": table_position,
                "s3ClassPosition": small_index + 1,
                "fixedPointMarksChecked": len(witnesses),
                "fixedPointMarksPassed": True,
                "scope": "all A x C product lifts within configured degree bounds",
                "scopeComplete": True,
                "scopeNonClaims": [
                    "outer-factor subgroup classes",
                    "nonsplit Goursat fiber products",
                ],
            }
            descriptor.update(
                {
                    "origin": origin,
                    "candidateFingerprint": digest_json(
                        {
                            "kind": origin["kind"],
                            "tablePosition": table_position,
                            "s3ClassPosition": small_index + 1,
                        }
                    ),
                    "marksPrefilter": {
                        "status": "passed",
                        "criterion": "zero fixed-point mark for every prime-order torsion witness",
                        "witnessCount": len(witnesses),
                    },
                }
            )
            metrics["marksSurvivors"] += 1
            yield descriptor

    checkpoint["marksSweep"] = {
        "status": "complete",
        "scope": "canonical A x C product lifts from all O8-(2) Tom classes",
        "tableClassCount": len(orders),
        "degreeEligibleProductLifts": candidate_positions,
        "fixedPointMarksRejected": metrics["marksRejected"],
        "survivors": metrics["marksSurvivors"],
        "maximumDegree": maximum,
        "lowerBoundDivisor": lower_bound,
        "nonClaims": [
            "complete subgroup classes of O8-(2):2",
            "complete Goursat subgroup classes of S3 x (O8-(2):2)",
        ],
    }


def maximal_frontier_descriptors(
    finite_image: FiniteImage,
    checkpoint: dict[str, Any],
    checkpoint_path: Path,
    maximum: int,
    deadline: Deadline,
) -> Iterable[dict[str, Any]]:
    frontier = checkpoint["frontier"]
    if not frontier and not checkpoint["visitedFingerprints"]:
        frontier.append(
            subgroup_descriptor(
                finite_image.q_gap,
                finite_image.q_gap,
                finite_image.q_generators,
                0,
            )
        )
        atomic_write_json(checkpoint_path, checkpoint)
    visited = set(checkpoint["visitedFingerprints"])
    while frontier:
        deadline.check("expanding the maximal-subgroup frontier")
        parent_descriptor = frontier.pop(0)
        if parent_descriptor["fingerprint"] in visited:
            continue
        parent = reconstruct_subgroup(
            finite_image.q_gap, finite_image.q_generators, parent_descriptor
        )
        visited.add(parent_descriptor["fingerprint"])
        checkpoint["visitedFingerprints"] = sorted(visited)
        checkpoint["metrics"]["subgroupsExpanded"] += 1
        maximal_subgroups = list(libgap.MaximalSubgroupClassReps(parent))
        child_descriptors = [
            subgroup_descriptor(
                finite_image.q_gap,
                subgroup,
                finite_image.q_generators,
                int(parent_descriptor["depth"]) + 1,
            )
            for subgroup in maximal_subgroups
        ]
        queued = persist_frontier_expansion(
            checkpoint,
            child_descriptors,
            finite_image.order,
            maximum,
        )
        # Persist every sibling before yielding the first. A killed process can
        # then resume the untouched siblings instead of silently skipping them.
        atomic_write_json(checkpoint_path, checkpoint)
        for descriptor in queued:
            yield descriptor


def descriptor_candidate_fingerprint(descriptor: dict[str, Any]) -> str:
    return str(descriptor.get("candidateFingerprint", descriptor["fingerprint"]))


def descriptor_sort_key(descriptor: dict[str, Any]) -> tuple[Any, ...]:
    return (
        int(descriptor.get("depth", 0)),
        -int(descriptor["order"]),
        descriptor_candidate_fingerprint(descriptor),
    )


def ensure_pending_descriptor(
    checkpoint: dict[str, Any], descriptor: dict[str, Any]
) -> None:
    candidate = descriptor_candidate_fingerprint(descriptor)
    pending = checkpoint.setdefault("pendingModules", [])
    if all(descriptor_candidate_fingerprint(item) != candidate for item in pending):
        pending.append(descriptor)
        pending.sort(key=descriptor_sort_key)


def remove_pending_descriptor(
    checkpoint: dict[str, Any], descriptor: dict[str, Any]
) -> None:
    candidate = descriptor_candidate_fingerprint(descriptor)
    checkpoint["pendingModules"] = [
        item
        for item in checkpoint.get("pendingModules", [])
        if descriptor_candidate_fingerprint(item) != candidate
    ]


def persist_frontier_expansion(
    checkpoint: dict[str, Any],
    descriptors: Sequence[dict[str, Any]],
    finite_image_order: int,
    maximum: int,
) -> list[dict[str, Any]]:
    """Queue one complete maximal-subgroup expansion before evaluation.

    GAP returns sibling classes in one native operation. Keeping those siblings
    only in a Python generator made an interrupted run incomplete: the first
    yielded child was durable, but later siblings were not. This helper makes
    both the module queue and the recursive frontier durable as one transaction.
    """

    visited = set(checkpoint.get("visitedFingerprints", []))
    evaluated = {
        str(module.get("candidateFingerprint", module["subgroupFingerprint"]))
        for module in checkpoint.get("modules", [])
    }
    pending_candidates = {
        descriptor_candidate_fingerprint(item)
        for item in checkpoint.get("pendingModules", [])
    }
    frontier_fingerprints = {
        str(item["fingerprint"]) for item in checkpoint.get("frontier", [])
    }
    unique: dict[str, dict[str, Any]] = {}
    for descriptor in descriptors:
        fingerprint = str(descriptor["fingerprint"])
        if fingerprint in visited:
            continue
        unique.setdefault(fingerprint, descriptor)

    queued: list[dict[str, Any]] = []
    for descriptor in sorted(unique.values(), key=descriptor_sort_key):
        checkpoint["metrics"]["subgroupsDiscovered"] += 1
        degree = finite_image_order // int(descriptor["order"])
        if degree > maximum:
            checkpoint["metrics"]["degreeFiltered"] += 1
            continue
        candidate = descriptor_candidate_fingerprint(descriptor)
        if candidate not in evaluated and candidate not in pending_candidates:
            checkpoint["pendingModules"].append(descriptor)
            pending_candidates.add(candidate)
            queued.append(descriptor)
        if degree < maximum and descriptor["fingerprint"] not in frontier_fingerprints:
            checkpoint["frontier"].append(descriptor)
            frontier_fingerprints.add(descriptor["fingerprint"])

    checkpoint["pendingModules"].sort(key=descriptor_sort_key)
    checkpoint["frontier"].sort(key=descriptor_sort_key)
    return queued


def search_modules(
    finite_image: FiniteImage,
    source: dict[str, Any],
    coxeter_matrix: Sequence[Sequence[int]],
    spherical: Sequence[shared.SphericalSubset],
    catalogue: dict[str, Any],
    recognition_certificate: dict[str, Any],
    checkpoint_path: Path,
    checkpoint: dict[str, Any],
    args: argparse.Namespace,
    deadline: Deadline,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    if checkpoint.get("passingModuleId") is None and not checkpoint.get("complete"):
        # Limits and interrupts are resumable states, not permanent verdicts.
        checkpoint.update(
            {
                "terminal": False,
                "frontierExhausted": False,
                "minimumProved": False,
                "reason": None,
            }
        )
    lower_bound = int(args.effective_lower_bound)
    target_indices = recognition.admissible_target_indices(lower_bound, args.max_index)
    target_decisions = [
        {
            "target": target,
            "decision": recognition.screening_decision(recognition_certificate, target),
        }
        for target in target_indices
    ]
    index_screening_complete = bool(target_decisions) and all(
        item["decision"] == "ruled-out" for item in target_decisions
    )
    checkpoint["structuralRecognition"] = recognition_certificate
    checkpoint["targetIndexDecisions"] = target_decisions
    checkpoint["indexScreeningComplete"] = index_screening_complete
    certified_orbit_degrees = recognized_natural_orbit_degrees(recognition_certificate)
    compatible_orbit_degrees = (
        [
            degree
            for degree in certified_orbit_degrees
            if partial_module_degree_can_reach_target(degree, target_indices)
        ]
        if index_screening_complete and certified_orbit_degrees is not None
        else None
    )
    if compatible_orbit_degrees is not None:
        checkpoint["partialModuleDegreeScreen"] = {
            "complete": True,
            "naturalOrbitDegrees": certified_orbit_degrees,
            "compatibleDegrees": compatible_orbit_degrees,
            "reason": (
                "Every diagonal orbit projects onto each transitive factor, "
                "so each factor degree must divide its degree."
            ),
        }
    if (
        index_screening_complete
        and compatible_orbit_degrees is not None
        and not compatible_orbit_degrees
    ):
        # The individual image has no target-index subgroup, and none of its
        # natural transitive factors can divide a requested composite orbit.
        # Stop before materializing witness permutations in a large action.
        checkpoint.update(
            {
                "frontierExhausted": False,
                "complete": True,
                "terminal": True,
                "reason": "recognized-index-obstruction",
            }
        )
        atomic_write_json(checkpoint_path, checkpoint)
        return checkpoint, None

    witnesses = catalogue["witnesses"]
    witness_elements: list[Any] = []
    for witness in witnesses:
        element = evaluate_gap_word(
            finite_image.q_gap, finite_image.q_generators, witness["word"]
        )
        if int(libgap.Order(element)) != int(witness["primeOrder"]):
            raise ExactInvariantError(
                "A cached witness changed order in the selected finite image."
            )
        witness_elements.append(element)
    passing_action: dict[str, Any] | None = None
    passing_module_id = checkpoint.get("passingModuleId")
    if passing_module_id is not None:
        persisted = next(
            (
                module
                for module in checkpoint.get("modules", [])
                if module.get("id") == passing_module_id
            ),
            None,
        )
        if persisted is None:
            raise ExactInvariantError(
                "Checkpoint names a passing module that is not in its module journal."
            )
        descriptor = {
            "fingerprint": persisted["subgroupFingerprint"],
            "candidateFingerprint": persisted.get(
                "candidateFingerprint", persisted["subgroupFingerprint"]
            ),
            "order": persisted["subgroupOrder"],
            "depth": 0,
            "generatorWords": persisted["subgroupGeneratorWords"],
            "origin": persisted.get("origin", {"kind": "resumed-passing-module"}),
        }
        subgroup = reconstruct_subgroup(
            finite_image.q_gap, finite_image.q_generators, descriptor
        )
        rechecked, action_images = evaluate_coset_module(
            finite_image,
            subgroup,
            descriptor,
            witnesses,
            witness_elements,
            spherical,
            coxeter_matrix,
            args,
            len(checkpoint["modules"]),
            deadline,
        )
        if rechecked["status"] != "passed":
            raise ExactInvariantError(
                "A passing checkpoint module failed exact re-certification on resume."
            )
        packed_rows = spool_action_rows(
            checkpoint_path.parent / "modules", persisted, action_images
        )
        persisted["packedPermutationRows"] = packed_rows
        checkpoint.update(
            {
                "terminal": True,
                "minimumProved": int(persisted["degree"]) == lower_bound,
                "complete": bool(
                    checkpoint.get("frontierExhausted")
                    or int(persisted["degree"]) == lower_bound
                ),
                "reason": "certified-torsion-free-action-restored",
            }
        )
        atomic_write_json(checkpoint_path, checkpoint)
        return checkpoint, passing_action_record(
            finite_image,
            persisted,
            action_images,
            packed_rows,
            args.materialization,
        )
    source_kind = args.subgroup_source
    if source_kind == "auto":
        source_kind = (
            "table-of-marks" if finite_image.order <= args.max_tom_order else "maximal"
        )
    root_search_allowed = unrecognized_root_search_allowed(
        finite_image.order,
        source_kind,
        index_screening_complete,
        args.max_generic_maximal_order,
        args.allow_unrecognized_maximal_search,
    )

    regular_descriptor: dict[str, Any] | None = None
    if root_search_allowed and degree_allowed(
        finite_image.order, lower_bound, args.max_index
    ):
        regular_descriptor = subgroup_descriptor(
            finite_image.q_gap,
            libgap.TrivialSubgroup(finite_image.q_gap),
            finite_image.q_generators,
            0,
        )

    if not root_search_allowed:
        descriptors = ()
    elif source_kind == "table-of-marks":
        descriptors: Iterable[dict[str, Any]] = table_of_marks_descriptors(
            finite_image, lower_bound, args.max_index, deadline
        )
    else:
        descriptors = maximal_frontier_descriptors(
            finite_image, checkpoint, checkpoint_path, args.max_index, deadline
        )

    marks_descriptors: Iterable[dict[str, Any]] = ()
    if isinstance(recognition_certificate.get("mod2Certificate"), dict):
        marks_descriptors = mod2_product_table_of_marks_descriptors(
            finite_image,
            witnesses,
            witness_elements,
            lower_bound,
            args.max_index,
            checkpoint,
            deadline,
        )
    exact_recognition_descriptors = recognition_exact_candidate_descriptors(
        finite_image, recognition_certificate
    )

    if len(checkpoint["modules"]) >= args.max_modules:
        checkpoint.update(
            {"complete": False, "terminal": False, "reason": "module-cap-reached"}
        )
        atomic_write_json(checkpoint_path, checkpoint)
        return checkpoint, None
    resumable_pending = [
        descriptor
        for descriptor in checkpoint.get("pendingModules", [])
        if root_search_allowed
        or (
            descriptor.get("seedKind")
            in {NATURAL_ORBIT_SEED_KIND, RECOGNITION_EXACT_SEED_KIND}
            and (
                not index_screening_complete
                or partial_module_degree_can_reach_target(
                    finite_image.order // int(descriptor["order"]), target_indices
                )
            )
        )
    ]
    natural_descriptors = natural_bsgs_orbit_descriptors(finite_image)
    if index_screening_complete:
        natural_descriptors = [
            descriptor
            for descriptor in natural_descriptors
            if partial_module_degree_can_reach_target(
                finite_image.order // int(descriptor["order"]), target_indices
            )
        ]
    sequence = _chain_many(
        resumable_pending,
        _chain_many(
            exact_recognition_descriptors,
            _chain_many(
                natural_descriptors,
                _chain_many(
                    marks_descriptors,
                    _chain_optional(regular_descriptor, descriptors),
                ),
            ),
        ),
    )
    already_evaluated = {
        module.get("candidateFingerprint", module["subgroupFingerprint"])
        for module in checkpoint["modules"]
    }
    stopped_early = False
    for descriptor in sequence:
        deadline.check("selecting a degree-divisible coset module")
        candidate_fingerprint = descriptor.get(
            "candidateFingerprint", descriptor["fingerprint"]
        )
        if candidate_fingerprint in already_evaluated:
            remove_pending_descriptor(checkpoint, descriptor)
            atomic_write_json(checkpoint_path, checkpoint)
            continue
        degree = finite_image.order // int(descriptor["order"])
        if not module_degree_allowed(descriptor, degree, lower_bound, args.max_index):
            checkpoint["metrics"]["degreeFiltered"] += 1
            remove_pending_descriptor(checkpoint, descriptor)
            atomic_write_json(checkpoint_path, checkpoint)
            continue
        if checkpoint["metrics"]["subgroupsDiscovered"] > args.max_subgroups:
            ensure_pending_descriptor(checkpoint, descriptor)
            checkpoint.update(
                {
                    "complete": False,
                    "terminal": False,
                    "reason": "subgroup-cap-reached",
                }
            )
            atomic_write_json(checkpoint_path, checkpoint)
            stopped_early = True
            break
        if len(checkpoint["modules"]) >= args.max_modules:
            ensure_pending_descriptor(checkpoint, descriptor)
            checkpoint.update(
                {
                    "complete": False,
                    "terminal": False,
                    "reason": "module-cap-reached",
                }
            )
            atomic_write_json(checkpoint_path, checkpoint)
            stopped_early = True
            break
        packed_bytes = packed_action_byte_length(degree, len(coxeter_matrix))
        spooled_bytes = int(checkpoint["metrics"].get("spooledBytes", 0))
        if spooled_bytes + packed_bytes > args.module_cache_bytes:
            ensure_pending_descriptor(checkpoint, descriptor)
            checkpoint.update(
                {
                    "complete": False,
                    "terminal": False,
                    "reason": "module-cache-byte-budget-reached",
                }
            )
            atomic_write_json(checkpoint_path, checkpoint)
            stopped_early = True
            break
        ensure_pending_descriptor(checkpoint, descriptor)
        atomic_write_json(checkpoint_path, checkpoint)
        subgroup = reconstruct_subgroup(
            finite_image.q_gap, finite_image.q_generators, descriptor
        )
        module, action_images = evaluate_coset_module(
            finite_image,
            subgroup,
            descriptor,
            witnesses,
            witness_elements,
            spherical,
            coxeter_matrix,
            args,
            len(checkpoint["modules"]),
            deadline,
        )
        packed_rows = spool_action_rows(
            checkpoint_path.parent / "modules", module, action_images
        )
        if int(packed_rows["byteLength"]) != packed_bytes:
            raise ExactInvariantError(
                "Packed module byte length disagrees with its degree."
            )
        module["packedPermutationRows"] = packed_rows
        checkpoint["modules"].append(module)
        remove_pending_descriptor(checkpoint, descriptor)
        checkpoint["metrics"]["modulesEvaluated"] += 1
        checkpoint["metrics"]["spooledBytes"] = spooled_bytes + packed_bytes
        already_evaluated.add(candidate_fingerprint)
        atomic_write_json(checkpoint_path, checkpoint)
        if module["status"] == "passed":
            checkpoint["passingModuleId"] = module["id"]
            checkpoint["terminal"] = True
            checkpoint["minimumProved"] = degree == lower_bound
            checkpoint["complete"] = bool(
                checkpoint["minimumProved"]
                or checkpoint.get("frontierExhausted", False)
            )
            checkpoint["reason"] = "certified-torsion-free-action-found"
            passing_action = passing_action_record(
                finite_image,
                module,
                action_images,
                packed_rows,
                args.materialization,
            )
            atomic_write_json(checkpoint_path, checkpoint)
            stopped_early = True
            break
        if len(checkpoint["modules"]) >= args.max_modules:
            checkpoint.update(
                {
                    "complete": False,
                    "terminal": False,
                    "reason": "module-cap-reached",
                }
            )
            atomic_write_json(checkpoint_path, checkpoint)
            stopped_early = True
            break

    if checkpoint["passingModuleId"] is None and checkpoint["reason"] is None:
        if index_screening_complete:
            # This is a mathematical index obstruction, not an exhausted
            # maximal-subgroup traversal. Preserve that distinction in the
            # checkpoint and public artifact.
            checkpoint["frontierExhausted"] = False
            checkpoint["complete"] = True
            checkpoint["terminal"] = True
            checkpoint["reason"] = "recognized-index-obstruction"
        elif not root_search_allowed:
            checkpoint["frontierExhausted"] = False
            checkpoint["complete"] = False
            checkpoint["terminal"] = False
            if checkpoint.get("marksSweep", {}).get("status") == "complete":
                checkpoint["reason"] = (
                    "mod2-product-lift-marks-exhausted-other-families-unresolved"
                )
            else:
                checkpoint["reason"] = "recognition-inconclusive-no-safe-root-search"
        else:
            checkpoint["frontierExhausted"] = (
                not stopped_early
                and not checkpoint["frontier"]
                and not checkpoint["pendingModules"]
            )
            checkpoint["complete"] = checkpoint["frontierExhausted"]
            checkpoint["terminal"] = checkpoint["frontierExhausted"]
            checkpoint["reason"] = (
                "bounded-subgroup-search-exhausted"
                if checkpoint["complete"]
                else "bounded-subgroup-search-paused"
            )
        atomic_write_json(checkpoint_path, checkpoint)
    return checkpoint, passing_action


def _chain_optional(
    first: dict[str, Any] | None, rest: Iterable[dict[str, Any]]
) -> Iterable[dict[str, Any]]:
    if first is not None:
        yield first
    yield from rest


def _chain_many(
    first: Iterable[dict[str, Any]], second: Iterable[dict[str, Any]]
) -> Iterable[dict[str, Any]]:
    yield from first
    yield from second


def kernel_cover_sort_key(value: dict[str, Any]) -> tuple[int, int, str]:
    """Put stronger exact-index certificates before bounded-index records."""

    level = value.get("certificateLevel")
    exact = level == EXACT_INDEX_KERNEL_LEVEL or (
        level is None and value.get("indexDecimal") is not None
    )
    if exact:
        magnitude = int(value.get("indexDecimal", 0))
    else:
        magnitude = int(
            value.get("indexEvidence", {}).get("finiteUpperBoundDecimal", 0)
        )
    candidate_id = str(value.get("sourceFiniteImage", {}).get("candidateId", ""))
    return (0 if exact else 1, magnitude, candidate_id)


def result_artifact(
    source: dict[str, Any],
    input_hash: str,
    matrix_digest: str,
    catalogue: dict[str, Any] | None,
    attempts: list[dict[str, Any]],
    checkpoint: dict[str, Any] | None,
    passing_action: dict[str, Any] | None,
    args: argparse.Namespace,
    deadline: Deadline,
    warnings: list[str],
    errors: list[str],
) -> dict[str, Any]:
    passed = passing_action is not None
    kernel_covers = [
        attempt["kernelCover"]
        for attempt in attempts
        if isinstance(attempt.get("kernelCover"), dict)
        and attempt["kernelCover"].get("status") == "passed"
    ]
    kernel_covers.sort(key=kernel_cover_sort_key)
    exact_kernel_count = sum(
        cover.get("certificateLevel") == EXACT_INDEX_KERNEL_LEVEL
        or (
            cover.get("certificateLevel") is None
            and cover.get("indexDecimal") is not None
        )
        for cover in kernel_covers
    )
    finite_index_kernel_count = len(kernel_covers) - exact_kernel_count
    highest_certificate_level = (
        MATERIALIZED_COVER_LEVEL
        if passed
        else EXACT_INDEX_KERNEL_LEVEL
        if exact_kernel_count
        else FINITE_INDEX_KERNEL_LEVEL
        if finite_index_kernel_count
        else "none"
    )
    status = (
        "passed"
        if passed
        else "failed"
        if errors
        else "probed"
        if args.probe_only
        else "catalogued"
        if args.catalogue_only
        else "exhausted"
    )
    value: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": RESULT_TYPE,
        "status": status,
        "ok": not errors,
        "sourceSystem": source,
        "inputHash": input_hash,
        "matrixDigest": matrix_digest,
        "backend": {
            "id": BACKEND_ID,
            "version": BACKEND_VERSION,
            "sageVersion": str(sage_version),
            "finiteImagePolicy": (
                "exact-finite-matrix-ambient; image-order-and-BSGS-only-when-verified"
            ),
        },
        "bounds": {
            "maxIndex": args.max_index,
            "maxActionDegree": args.max_index,
            "lowerBoundDivisor": getattr(args, "effective_lower_bound", None),
            "maxModules": args.max_modules,
            "maxSubgroups": args.max_subgroups,
            "maxActionBytes": args.max_action_bytes,
            "moduleCacheBytes": args.module_cache_bytes,
            "timeoutSeconds": args.timeout,
            "primes": args.primes,
            "portfolioMode": args.portfolio_mode,
            "probeOnly": args.probe_only,
            "catalogueOnly": args.catalogue_only,
            "materialization": args.materialization,
            "recognition": args.recognition,
            "recognitionTimeoutSeconds": args.recognition_timeout,
            "maxGenericMaximalOrder": args.max_generic_maximal_order,
            "allowUnrecognizedMaximalSearch": args.allow_unrecognized_maximal_search,
            "maxMaterializedImageOrder": args.max_materialized_image_order,
        },
        "residueAttempts": attempts,
        "elapsedSeconds": round(deadline.elapsed, 6),
        "warnings": warnings,
        "errors": errors,
        "claims": (
            ["finite-index", "torsion-free"]
            if passed
            else ["finite-index", "normal", "torsion-free-kernel"]
            if kernel_covers
            else []
        ),
        "nonClaims": [
            "minimal index",
            "search completeness beyond recorded bounds",
            "manifold",
            "virtual algebraic fibering",
        ],
        "scientificBoundary": (
            "Search heuristics choose subgroups. Torsion-freeness is claimed only "
            "after exact Coxeter relations, injective maximal spherical reductions, "
            "prime-order fixed-point checks, and spherical regular-orbit checks pass."
        ),
    }
    value["coverOutcome"] = {
        "torsionFreeCoverCertified": bool(passed or kernel_covers),
        "manageableCoverMaterialized": passed,
        "certificateLevel": highest_certificate_level,
        "exactIndexKnown": bool(passed or exact_kernel_count),
        "status": (
            "materialized-cover-found"
            if passed
            else "exact-index-kernel-certified-not-materialized"
            if exact_kernel_count
            else "finite-index-kernel-certified-exact-index-unknown"
            if finite_index_kernel_count
            else "no-certified-cover"
        ),
    }
    if kernel_covers:
        value["kernelCovers"] = kernel_covers
        value["kernelCover"] = kernel_covers[0]
    accepted_attempts = [
        attempt for attempt in attempts if attempt.get("status") == "accepted"
    ]
    index_obstruction_complete = bool(accepted_attempts) and all(
        attempt.get("status") == "rejected"
        or bool(attempt.get("subgroupSearch", {}).get("indexScreeningComplete"))
        for attempt in attempts
    )
    bounded_complete = bool(attempts) and all(
        attempt.get("status") == "rejected"
        or args.probe_only
        or args.catalogue_only
        or bool(attempt.get("subgroupSearch", {}).get("frontierExhausted"))
        or bool(attempt.get("subgroupSearch", {}).get("minimumProved"))
        or bool(attempt.get("subgroupSearch", {}).get("indexScreeningComplete"))
        for attempt in attempts
    )
    value["searchCompleteness"] = {
        "status": (
            "certified-candidate-found"
            if passed
            else "probe-complete"
            if args.probe_only and bounded_complete and not errors
            else "catalogue-complete"
            if args.catalogue_only and bounded_complete and not errors
            else "index-obstruction-within-recorded-bounds"
            if index_obstruction_complete and bounded_complete and not errors
            else "exhausted-within-recorded-bounds"
            if bounded_complete and not errors
            else "incomplete"
        ),
        "boundedComplete": bounded_complete,
        "residueCandidatesExamined": len(attempts),
        "acceptedFiniteImages": len(accepted_attempts),
        "coverCertification": {
            "highestLevel": highest_certificate_level,
            "finiteIndexKernelCount": finite_index_kernel_count,
            "exactIndexKernelCount": exact_kernel_count,
            "materializedCoverCount": 1 if passed else 0,
            "independentOfBoundedSubgroupSearch": bool(kernel_covers),
        },
        "scope": (
            "Recognition certificates decide only their listed finite images and "
            "target degrees. Other residues and larger degrees remain open; this "
            "is not a global nonexistence or minimal-index proof. A certified "
            "congruence kernel establishes finite index independently of whether "
            "its exact index or a manageable coset action is known."
        ),
    }
    if catalogue is not None:
        value["sphericalCatalogue"] = {
            key: catalogue[key]
            for key in (
                "maximalSphericalSubgroups",
                "sphericalDigest",
                "indexDivisibilityLowerBound",
                "witnessEnumerationSeed",
                "witnessCount",
                "witnessDigest",
                "classOriginCount",
                "classOriginDigest",
                "implementationSha256",
            )
        }
    if checkpoint is not None:
        value["search"] = {
            "candidateId": checkpoint["candidateId"],
            "finiteImageOrder": checkpoint["finiteImageOrder"],
            "complete": checkpoint["complete"],
            "terminal": checkpoint.get("terminal", False),
            "frontierExhausted": checkpoint.get("frontierExhausted", False),
            "minimumProved": checkpoint.get("minimumProved", False),
            "indexScreeningComplete": checkpoint.get("indexScreeningComplete", False),
            "targetIndexDecisions": checkpoint.get("targetIndexDecisions", []),
            "structuralRecognition": checkpoint.get("structuralRecognition"),
            "marksSweep": checkpoint.get("marksSweep"),
            "reason": checkpoint["reason"],
            "metrics": checkpoint["metrics"],
            "modules": checkpoint["modules"],
            "passingModuleId": checkpoint["passingModuleId"],
        }
    if catalogue is not None:
        # Partial modules feed the composite-action solver even when one finite
        # image has a complete index obstruction. The witness list therefore
        # belongs to every complete catalogue artifact, not only passing ones.
        value["torsionWitnesses"] = catalogue["witnesses"]
    if passing_action is not None:
        value["passingAction"] = passing_action
    value["artifactHash"] = digest_json(value)
    return value


def run_search(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    require_sage()
    deadline = Deadline(args.timeout)
    previous_sigterm = signal.getsignal(signal.SIGTERM)
    signal.signal(
        signal.SIGTERM, lambda _signum, _frame: setattr(deadline, "interrupted", True)
    )
    warnings: list[str] = []
    errors: list[str] = []
    attempts: list[dict[str, Any]] = []
    checkpoint: dict[str, Any] | None = None
    checkpoint_path: Path | None = None
    catalogue: dict[str, Any] | None = None
    passing_action: dict[str, Any] | None = None
    source: dict[str, Any] = {
        "name": "invalid input",
        "rank": 0,
        "generators": [],
        "coxeterMatrix": [],
    }
    input_hash = "0" * 64
    matrix_digest = "0" * 64
    try:
        _, input_hash, source, coxeter_matrix, bounds, spherical = read_request(
            args.input, args
        )
        matrix_digest = source_matrix_digest(coxeter_matrix)
        header = catalogue_header(matrix_digest, spherical)
        derived_lower_bound = int(header["indexDivisibilityLowerBound"])
        args.effective_lower_bound = resolve_lower_bound(
            derived_lower_bound, args.lower_bound_divisor
        )
        cache_dir = args.cache_dir.expanduser()
        if slow_wsl_mount(cache_dir) and not args.allow_slow_cache:
            raise shared.InputError(
                f"Cache path {cache_dir} is under /mnt. Use WSL ext4 (for example "
                "~/.cache/coxeter-viewer) or pass --allow-slow-cache explicitly."
            )
        cache_path = catalogue_cache_path(cache_dir, matrix_digest)
        catalogue = load_cached_catalogue(cache_path, header)
        selected_primes = shard_primes(args.primes, args.prime_shard)
        if not selected_primes:
            raise shared.InputError("The selected prime shard contains no primes.")
        selected_image: FiniteImage | None = None
        for candidate in residue_candidates(coxeter_matrix, selected_primes):
            deadline.check(f"starting residue {candidate.candidate_id}")
            # Characteristic two uses a tiny 3+119 point model for its exact
            # direct-product certificate. Odd-prime images enter recognition
            # as matrices and pay for a permutation copy only if they survive.
            initial_permutation = (
                candidate.rational_prime == 2
                or int(candidate.field.order()) != candidate.rational_prime
            )
            gap_order_discovery_available = (
                args.recognition != "off"
                and (
                    recognition.find_research_gap(args.research_gap) is not None
                    or (
                        args.structural_certificate is not None
                        and candidate.rational_prime
                        == structural_certificate_characteristic(
                            args.structural_certificate
                        )
                    )
                )
                and recognition.find_toolchain_manifest(args.research_gap_manifest)
                is not None
            )
            defer_image_order = (
                candidate.rational_prime >= 3
                and int(candidate.field.order()) == candidate.rational_prime
                and gap_order_discovery_available
            )
            finite_image, attempt = inspect_residue(
                candidate,
                coxeter_matrix,
                spherical,
                deadline,
                args.seed,
                args.probe_only,
                materialize_permutation=initial_permutation,
                defer_image_order_to_recognition=defer_image_order,
            )
            attempts.append(attempt)
            if finite_image is None:
                continue
            selected_image = finite_image
            if catalogue is None and finite_image.permutation_materialized:
                # The mod-2 table-of-marks and exact Goursat screens need the
                # canonical source-word witness catalogue before recognition.
                # Binding it into the transfer hash prevents a stale class list
                # from deciding a newly generated finite image.
                witnesses = build_witness_catalogue(
                    finite_image,
                    coxeter_matrix,
                    spherical,
                    bounds["maxWitnesses"],
                    deadline,
                )
                catalogue = write_catalogue_cache(
                    cache_path, header, witnesses, finite_image
                )
            recognition_certificate, recognition_bridge = (
                recognize_and_screen_finite_image(
                    finite_image,
                    coxeter_matrix,
                    args,
                    cache_dir,
                    catalogue,
                )
            )
            attempt["structuralRecognition"] = recognition_certificate
            attempt["recognitionBridge"] = recognition_bridge
            attempt["imageOrderStatus"] = (
                EXACT_INDEX_STATUS
                if finite_image.order is not None
                else UNKNOWN_INDEX_STATUS
            )
            attempt["kernelCover"] = kernel_cover_certificate(
                finite_image,
                matrix_digest,
                header["sphericalDigest"],
                str(recognition_bridge["actionHash"]),
                args.max_index,
            )
            attempt["kernelCertificateLevel"] = attempt["kernelCover"][
                "certificateLevel"
            ]
            if finite_image.order is None:
                attempt["subgroupSearch"] = {
                    "complete": False,
                    "terminal": False,
                    "reason": "verified-finite-image-order-not-discovered",
                    "modulesEvaluated": 0,
                }
                warnings.append(
                    f"{candidate.candidate_id} passed exact relation and spherical "
                    "checks. Its finite-index torsion-free congruence kernel is "
                    "certified, but verified matrix recognition did not determine "
                    "the exact image order or kernel index within the recognition bound."
                )
                continue
            attempt["imageOrder"] = finite_image.order
            attempt["imageOrderDeferredToRecognition"] = defer_image_order
            if args.probe_only:
                attempt["subgroupSearch"] = {
                    "complete": True,
                    "reason": "probe-only",
                    "modulesEvaluated": 0,
                }
                continue
            target_indices = recognition.admissible_target_indices(
                args.effective_lower_bound, args.max_index
            )
            all_targets_ruled_out = bool(target_indices) and all(
                recognition.screening_decision(recognition_certificate, target)
                == "ruled-out"
                for target in target_indices
            )
            if all_targets_ruled_out and recognition.no_compatible_transitive_factor(
                recognition_certificate, target_indices
            ):
                attempt["subgroupSearch"] = {
                    "complete": True,
                    "terminal": True,
                    "frontierExhausted": False,
                    "minimumProved": False,
                    "indexScreeningComplete": True,
                    "targetIndexDecisions": [
                        {"target": target, "decision": "ruled-out"}
                        for target in target_indices
                    ],
                    "partialModuleDegreeScreen": {
                        "complete": True,
                        "compatibleDegrees": [],
                        "reason": "No nontrivial transitive factor can divide a requested target degree.",
                    },
                    "reason": "matrix-only-recognized-index-obstruction",
                    "modulesEvaluated": 0,
                }
                continue
            if not finite_image.permutation_materialized:
                if (
                    finite_image.order > args.max_materialized_image_order
                    and not args.force_permutation_materialization
                ):
                    attempt["subgroupSearch"] = {
                        "complete": False,
                        "terminal": False,
                        "indexScreeningComplete": all_targets_ruled_out,
                        "reason": "permutation-materialization-order-bound",
                        "modulesEvaluated": 0,
                        "finiteImageOrder": finite_image.order,
                        "maxMaterializedImageOrder": args.max_materialized_image_order,
                    }
                    warnings.append(
                        f"{candidate.candidate_id} survived structural screening, but "
                        "its permutation copy exceeds maxMaterializedImageOrder; "
                        "the certified kernel remains recorded."
                    )
                    continue
                mapping_checks = materialize_permutation_image(
                    finite_image, deadline, args.seed
                )
                attempt["permutationMaterialized"] = True
                attempt["permutationDegree"] = finite_image.permutation_degree
                attempt["sourceGeneratorMappingChecks"] = mapping_checks
            if catalogue is None:
                witnesses = build_witness_catalogue(
                    finite_image,
                    coxeter_matrix,
                    spherical,
                    bounds["maxWitnesses"],
                    deadline,
                )
                catalogue = write_catalogue_cache(
                    cache_path, header, witnesses, finite_image
                )
            if args.catalogue_only:
                attempt["subgroupSearch"] = {
                    "complete": True,
                    "reason": "catalogue-only",
                    "modulesEvaluated": 0,
                }
                continue
            checkpoint_path = (
                args.checkpoint
                if args.checkpoint is not None
                else cache_dir
                / matrix_digest
                / f"search-{candidate.candidate_id}-{BACKEND_VERSION}.json"
            )
            cp_header = checkpoint_header(
                input_hash, matrix_digest, catalogue, finite_image, args
            )
            checkpoint = load_checkpoint(checkpoint_path, cp_header, args.resume)
            checkpoint, passing_action = search_modules(
                finite_image,
                source,
                coxeter_matrix,
                spherical,
                catalogue,
                recognition_certificate,
                checkpoint_path,
                checkpoint,
                args,
                deadline,
            )
            attempt["subgroupSearch"] = {
                "complete": checkpoint["complete"],
                "terminal": checkpoint.get("terminal", False),
                "frontierExhausted": checkpoint.get("frontierExhausted", False),
                "minimumProved": checkpoint.get("minimumProved", False),
                "indexScreeningComplete": checkpoint.get(
                    "indexScreeningComplete", False
                ),
                "targetIndexDecisions": checkpoint.get("targetIndexDecisions", []),
                "partialModuleDegreeScreen": checkpoint.get(
                    "partialModuleDegreeScreen"
                ),
                "marksSweep": checkpoint.get("marksSweep"),
                "reason": checkpoint["reason"],
                "modulesEvaluated": checkpoint["metrics"]["modulesEvaluated"],
                "checkpoint": str(checkpoint_path),
            }
            if passing_action is not None:
                break
        if selected_image is None:
            warnings.append(
                "No requested residue characteristic preserved every maximal "
                "spherical subgroup exactly. No subgroup claim was made."
            )
        elif args.probe_only:
            warnings.append(
                "Probe-only mode stopped after exact finite-image construction; "
                "the congruence-kernel criterion was certified where applicable, "
                "but no manageable coset-action search was attempted."
            )
        elif args.catalogue_only:
            warnings.append(
                "Catalogue-only mode stopped after caching the complete spherical "
                "witness catalogue; kernel certificates remain valid, but no "
                "manageable coset-action search was attempted."
            )
        elif passing_action is None:
            if any(
                attempt.get("subgroupSearch", {}).get("indexScreeningComplete")
                for attempt in attempts
            ):
                warnings.append(
                    "A complete recognised-group index certificate ruled out every "
                    "requested action degree for at least one finite image. Any "
                    "natural partial module whose degree can divide a requested "
                    "diagonal orbit remains available to the composite solver."
                )
            else:
                warnings.append(
                    "The finite-image search found no certified torsion-free coset "
                    "action. Inconclusive recognition and bounded searches are not "
                    "nonexistence proofs."
                )
    except (SearchLimit, SearchInterrupted) as exc:
        warnings.append(str(exc))
        if checkpoint is not None:
            checkpoint.update(
                {
                    "complete": False,
                    "terminal": False,
                    "frontierExhausted": False,
                    "minimumProved": False,
                    "reason": "interrupted-or-limit",
                }
            )
            if checkpoint_path is not None:
                atomic_write_json(checkpoint_path, checkpoint)
    except Exception as exc:  # noqa: BLE001 - stable exact-backend boundary
        errors.append(f"{type(exc).__name__}: {exc}")
    finally:
        signal.signal(signal.SIGTERM, previous_sigterm)

    reusable_catalogue: dict[str, Any] | None = None
    reusable_catalogue_root: str | None = None
    if (
        catalogue is not None
        and checkpoint is not None
        and checkpoint.get("modules")
        and input_hash != "0" * 64
    ):
        try:
            reusable_catalogue, reusable_catalogue_root = (
                persist_partial_module_catalogue(
                    source=source,
                    input_hash=input_hash,
                    matrix_digest=matrix_digest,
                    witness_catalogue=catalogue,
                    attempts=attempts,
                    checkpoint=checkpoint,
                    cache_dir=args.cache_dir.expanduser(),
                    max_unique_packed_bytes=args.module_cache_bytes,
                )
            )
        except (module_catalogue.CatalogueError, ExactInvariantError, OSError) as exc:
            warnings.append(f"Reusable partial-module catalogue was not sealed: {exc}")

    artifact = result_artifact(
        source,
        input_hash,
        matrix_digest,
        catalogue,
        attempts,
        checkpoint,
        passing_action,
        args,
        deadline,
        warnings,
        errors,
    )
    if reusable_catalogue is not None and reusable_catalogue_root is not None:
        artifact["partialModuleCatalogue"] = reusable_catalogue
        artifact["partialModuleCatalogueStorageRoot"] = reusable_catalogue_root
        artifact.pop("artifactHash", None)
        artifact["artifactHash"] = digest_json(artifact)
    if args.output is not None:
        atomic_write_json(args.output, artifact)
    return artifact, 1 if errors else 0


def pure_self_test() -> dict[str, Any]:
    header = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": CHECKPOINT_TYPE,
        "backendVersion": BACKEND_VERSION,
        "inputHash": "a" * 64,
        "matrixDigest": "b" * 64,
        "witnessDigest": "c" * 64,
        "candidateId": "GF(2)",
        "finiteImageOrder": 24,
        "configDigest": "d" * 64,
    }
    checkpoint = fresh_checkpoint(header)
    checks = {
        "degreeFilter": degree_allowed(24, 24, 48) and not degree_allowed(25, 24, 48),
        "coverage": encode_coverage([0, 2, 7], 8) == "85",
        "checkpointCompact": "generatorActions" not in canonical_json(checkpoint),
        "digestStable": digest_json({"b": 2, "a": 1}) == digest_json({"a": 1, "b": 2}),
        "smallPrimes": parse_primes("2,3,5") == [2, 3, 5],
        "naturalPartialDegree": module_degree_allowed(
            {"seedKind": NATURAL_ORBIT_SEED_KIND}, 3, 5760, 23_040
        )
        and not module_degree_allowed({"seedKind": "subgroup-search"}, 3, 5760, 23_040),
        "goursatCommonC2": recognition.possible_goursat_indices(
            [{"index": 1, "quotientOrders": [1, 2]}],
            [{"projectionIndex": 1, "quotientOrders": [1, 2]}],
        )
        == [1, 2],
        "unsafeRootMaximalsBlocked": not unrecognized_root_search_allowed(
            2_368_880_640, "maximal", False, 5_000_000, False
        ),
    }
    return {"ok": all(checks.values()), "checks": checks}


def sage_self_test(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    require_sage()
    # A3 over GF(2) is deliberately small but exercises the same native
    # MatrixGroup/order/BSGS path as the compact examples.  The full A3 image is
    # spherical, so its regular degree-24 action must pass.
    fixture = (
        SCRIPT_DIR.parent
        / "tests"
        / "fixtures"
        / "torsion-free-discovery"
        / "a3.discovery.json"
    )
    original = args.input
    args.input = fixture
    args.primes = [2, 3]
    args.max_index = 24
    args.max_modules = max(args.max_modules, 1)
    args.max_subgroups = max(args.max_subgroups, 1)
    args.subgroup_source = "maximal"
    args.resume = False
    artifact, code = run_search(args)
    args.input = original
    natural_modules = [
        module
        for module in artifact.get("search", {}).get("modules", [])
        if module.get("origin", {}).get("kind") == NATURAL_ORBIT_SEED_KIND
    ]
    passed = (
        code == 0
        and artifact.get("status") == "passed"
        and artifact.get("passingAction", {}).get("degree") == 24
        and artifact.get("sphericalCatalogue", {}).get("witnessCount") == 3
        and bool(natural_modules)
        and int(natural_modules[0]["degree"]) % 24 != 0
        and all(
            check.get("passed")
            for attempt in artifact.get("residueAttempts", [])
            if attempt.get("status") == "accepted"
            for check in attempt.get("sourceGeneratorMappingChecks", [])
        )
    )
    return {
        "ok": passed,
        "pure": pure_self_test(),
        "sageVersion": str(sage_version),
        "a3": {
            "status": artifact.get("status"),
            "degree": artifact.get("passingAction", {}).get("degree"),
            "witnessCount": artifact.get("sphericalCatalogue", {}).get("witnessCount"),
            "naturalModuleDegrees": [
                int(module["degree"]) for module in natural_modules
            ],
            "errors": artifact.get("errors", []),
        },
    }, 0 if passed else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Build exact finite Coxeter images and search degree-divisible coset "
            "actions without enumerating the full image."
        )
    )
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--cache-dir", type=Path, default=default_cache_root())
    parser.add_argument("--allow-slow-cache", action="store_true")
    parser.add_argument(
        "--recognition",
        choices=("auto", "required", "off"),
        default="auto",
        help=(
            "Use the isolated GAP recognition bridge before subgroup search. "
            "'required' fails when the pinned runtime is unavailable; 'off' "
            "keeps screening explicitly unknown."
        ),
    )
    parser.add_argument("--research-gap", type=Path)
    parser.add_argument("--research-gap-manifest", type=Path)
    parser.add_argument("--recognition-timeout", type=int, default=900)
    parser.add_argument(
        "--structural-certificate",
        type=Path,
        help=(
            "Hash-bound structural certificate for GF(3), GF(5), GF(7), or "
            "GF(11). The worker verifies the artifact characteristic and replays "
            "its direct proof instead of rerunning generic recog."
        ),
    )
    parser.add_argument(
        "--structural-source",
        type=Path,
        default=None,
        help="Source JSON whose hash is bound by --structural-certificate.",
    )
    parser.add_argument(
        "--structural-gap-script",
        type=Path,
        default=None,
    )
    parser.add_argument(
        "--structural-replay-gap-script",
        type=Path,
        default=None,
    )
    parser.add_argument(
        "--structural-orchestrator",
        type=Path,
        default=None,
    )
    portfolio = parser.add_mutually_exclusive_group()
    portfolio.add_argument(
        "--prime",
        type=parse_prime,
        help="Run one rational prime, suitable for a process-level portfolio worker.",
    )
    portfolio.add_argument(
        "--auto",
        action="store_true",
        help="Try --primes in deterministic order (the default).",
    )
    parser.add_argument("--primes", type=parse_primes, default=list(DEFAULT_PRIMES))
    parser.add_argument("--prime-shard")
    execution = parser.add_mutually_exclusive_group()
    execution.add_argument(
        "--probe-only",
        action="store_true",
        help=(
            "Check relations, spherical image orders, full image order, and compact "
            "permutation degree, then stop before subgroup enumeration."
        ),
    )
    execution.add_argument(
        "--catalogue-only",
        action="store_true",
        help=(
            "Build/cache the complete prime-order spherical witness catalogue "
            "after an accepted exact probe, then stop before subgroup enumeration."
        ),
    )
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument(
        "--max-action-degree",
        "--max-index",
        dest="max_index",
        type=int,
        default=23_040,
    )
    parser.add_argument(
        "--lower-bound-divisor",
        type=int,
        help=(
            "Use a safe divisor of the exact spherical lcm. By default the full "
            "exact lower bound is used."
        ),
    )
    parser.add_argument("--max-modules", type=int, default=256)
    parser.add_argument("--max-subgroups", type=int, default=4096)
    parser.add_argument("--max-witnesses", type=int, default=8192)
    parser.add_argument("--max-spherical-order", type=int, default=1_000_000)
    parser.add_argument("--max-subsets", type=int, default=65_536)
    parser.add_argument(
        "--memory-bytes",
        "--max-action-bytes",
        dest="max_action_bytes",
        type=int,
        default=DEFAULT_MAX_ACTION_BYTES,
    )
    parser.add_argument(
        "--module-cache-bytes",
        type=int,
        default=DEFAULT_MODULE_CACHE_BYTES,
        help="Maximum cumulative bytes for retained packed partial modules.",
    )
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument(
        "--subgroup-source",
        choices=("auto", "maximal", "table-of-marks"),
        default="auto",
    )
    parser.add_argument("--max-tom-order", type=int, default=DEFAULT_MAX_TOM_ORDER)
    parser.add_argument(
        "--max-generic-maximal-order",
        type=int,
        default=DEFAULT_MAX_GENERIC_MAXIMAL_ORDER,
        help=(
            "Largest unrecognised image on which generic maximal-subgroup "
            "enumeration is allowed automatically."
        ),
    )
    parser.add_argument(
        "--max-materialized-image-order",
        type=int,
        default=5_000_000,
        help=(
            "Largest otherwise-unscreened matrix image for which Sage may build "
            "a compact permutation copy. The certified congruence kernel does "
            "not depend on this performance bound."
        ),
    )
    parser.add_argument(
        "--force-permutation-materialization",
        action="store_true",
        help="Override the image-order guard after matrix screening.",
    )
    parser.add_argument(
        "--allow-unrecognized-maximal-search",
        action="store_true",
        help=(
            "Explicitly permit the legacy generic maximal-subgroup frontier on "
            "larger unrecognised images. This can be extremely expensive."
        ),
    )
    parser.add_argument("--permutation-characters", action="store_true")
    parser.add_argument(
        "--max-character-order", type=int, default=DEFAULT_MAX_TOM_ORDER
    )
    parser.add_argument(
        "--materialization",
        choices=("deferred", "packed", "json"),
        default="deferred",
        help=(
            "Keep passing output compact (default), expose packed rows, or also "
            "materialize JSON permutation rows."
        ),
    )
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--pure-self-test", action="store_true")
    return parser


def normalize_portfolio_args(args: argparse.Namespace) -> argparse.Namespace:
    if args.prime is not None:
        args.primes = [args.prime]
        args.portfolio_mode = "single-prime"
    else:
        args.portfolio_mode = "auto"
    return args


def print_result(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, indent=2, sort_keys=True) + "\n")


def main() -> int:
    parser = build_parser()
    args = normalize_portfolio_args(parser.parse_args())
    if args.pure_self_test:
        result = pure_self_test()
        if args.output is None:
            print_result(result)
        else:
            atomic_write_json(args.output, result)
        return 0 if result["ok"] else 1
    if args.self_test:
        result, code = sage_self_test(args)
        if args.output is None:
            print_result(result)
        else:
            atomic_write_json(args.output, result)
        return code
    if args.input is None:
        parser.error("--input is required unless a self-test is selected")
    artifact, code = run_search(args)
    if args.output is None:
        print_result(artifact)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
