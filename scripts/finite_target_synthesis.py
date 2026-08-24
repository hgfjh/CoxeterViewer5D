#!/usr/bin/env python3
"""Search bounded finite targets for locally faithful Coxeter images.

The mathematical promotion test is deliberately stricter than merely checking
the Coxeter relators.  A tuple of target involutions is accepted only when the
image of every maximal spherical special subgroup has its classified order.
Tits' torsion theorem then implies that the kernel of the homomorphism is
torsion-free.

GAP is used as a bounded candidate generator.  Python independently replays
the emitted permutations, checks every finite Coxeter product order, and
enumerates each maximal spherical image.  Dry runs perform the complete order
screen for the declared target list without requiring GAP.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

# Input validation and finite Coxeter classification have one owner in this
# repository.  Reusing them prevents two discovery tracks from disagreeing
# about which spherical subgroups must inject.
import torsion_free_discovery as shared  # noqa: E402


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "coxeter-cover-search-track"
TRACK_ID = "finite-target-synthesis"
BACKEND_VERSION = "2.5.0"
CHECKPOINT_TYPE = "coxeter-finite-target-synthesis-checkpoint"
GAP_SCRIPT = SCRIPT_DIR / "gap_finite_target_synthesis.g"
REPOSITORY_ROOT = SCRIPT_DIR.parent


def portable_diagnostic_tail(value: str, maximum: int = 2_000) -> str:
    """Remove checkout-specific prefixes from captured tool diagnostics."""

    normalized = value.replace("\\\n", "")
    roots = {
        str(REPOSITORY_ROOT.resolve()),
        REPOSITORY_ROOT.resolve().as_posix(),
    }
    drive = REPOSITORY_ROOT.resolve().drive.rstrip(":").lower()
    if drive:
        suffix = REPOSITORY_ROOT.resolve().as_posix()[2:]
        roots.add(f"/mnt/{drive}{suffix}")
    for root in sorted(roots, key=len, reverse=True):
        normalized = normalized.replace(root + "/", "<repository>/")
        normalized = normalized.replace(root + "\\", "<repository>/")
    return normalized[-maximum:]

DEFAULT_BOUNDS: dict[str, int] = {
    "maxSubsets": 65_536,
    "maxSphericalOrder": 100_000,
    "maxTargetOrderForEnumeration": 100_000,
    "maxInvolutions": 20_000,
    "maxInvolutionClasses": 2_000,
    "maxPrecheckNodesPerType": 500_000,
    "maxAnchorSearchNodes": 5_000_000,
    "maxAnchorClasses": 4_096,
    "maxSearchNodes": 2_000_000,
    "maxSolutionsPerTarget": 8,
    "maxPermutationDegree": 20_000,
    "maxVerifyImageOrder": 200_000,
    "timeoutSecondsPerPrecheck": 30,
    "timeoutSecondsPerAnchor": 300,
    "timeoutSecondsPerTarget": 120,
}

STRUCTURAL_ANCHOR_TARGETS = frozenset({"D6", "B6", "E6"})

DEFAULT_SYMMETRIC_DEGREES = tuple(range(4, 11))
DEFAULT_WEYL_TYPES = (
    "A3",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "B3",
    "B4",
    "B5",
    "B6",
    "D4",
    "D5",
    "D6",
    "D7",
    "D8",
    "F4",
    "E6",
    "E7",
    "E8",
)
DEFAULT_CLASSICAL_TARGETS = (
    {
        "id": "classical-Sp4-3",
        "family": "Sp",
        "dimension": 4,
        "fieldOrder": 3,
        "order": 51_840,
        "orderFormula": "3^4*(3^2-1)*(3^4-1)",
    },
)

CLASSICAL_FAMILIES = frozenset(
    {"GL", "SL", "PGL", "PSL", "Sp", "GO+", "GO-", "SO+", "SO-"}
)

# For a centerless normal S6, an extension by a 2-group R is determined by
# the induced map R -> Out(S6) = C2.  Nontrivial maps are classified by their
# index-two kernels modulo Aut(R).  These counts are generated independently
# by GAP and replayed by the target constructor; they make the degree-5,760
# and degree-11,520 block-extension scope finite and explicit.
S6_BLOCK_EXTENSION_KERNEL_ORBITS: dict[int, tuple[int, ...]] = {
    8: (1, 2, 2, 1, 1),
    16: (1, 1, 2, 2, 2, 2, 2, 3, 2, 2, 3, 2, 3, 1),
}

# The other nontrivial core of an S6 point stabilizer is A6.  The quotient by
# that core is a transitive block group of degree 8/order 16 or degree
# 16/order 32 with point stabilizer C2.  Each number below is the exact orbit
# count of maps R -> Out(A6)=C2^2 that send that stabilizer to the S6 outer
# class, modulo automorphisms of R preserving the stabilizer. GAP reconstructs
# and checks the same catalogue before building a target.
A6_CORE_OUTER_MAP_ORBITS: dict[int, dict[int, int]] = {
    8: {6: 4, 7: 2, 8: 4, 9: 10, 10: 2, 11: 10},
    16: {
        15: 6,
        16: 8,
        17: 6,
        18: 19,
        19: 16,
        20: 8,
        21: 6,
        22: 2,
        23: 12,
        24: 2,
        25: 11,
        26: 4,
        27: 6,
        28: 4,
        29: 10,
        30: 10,
        31: 10,
        32: 10,
        34: 16,
        35: 8,
        37: 10,
        38: 16,
        39: 8,
        41: 2,
        43: 10,
        44: 16,
        45: 10,
        46: 5,
        47: 10,
        48: 10,
        50: 8,
        51: 5,
        52: 2,
        54: 8,
        55: 4,
        56: 4,
    },
}
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.+-]*$")


class SynthesisError(ValueError):
    """Raised when an input or external result cannot support exact claims."""


@dataclass(frozen=True)
class GapRuntime:
    label: str
    kind: str
    command_prefix: tuple[str, ...]


def canonical_json(value: Any) -> str:
    """Return deterministic JSON and reject NaN or other non-JSON numbers."""

    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise SynthesisError(f"Value is not canonical JSON: {exc}") from exc


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf8",
    )
    os.replace(temporary, path)


def read_json_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SynthesisError(f"Cannot read JSON from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise SynthesisError(f"{path} must contain one JSON object.")
    return value


def positive_integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise SynthesisError(f"{field} must be a positive integer.")
    return value


def parse_weyl_type(value: str) -> tuple[str, int]:
    match = re.fullmatch(r"([ABDEF])(\d+)", value.strip())
    if match is None:
        raise SynthesisError(f"Unsupported finite Weyl type {value!r}.")
    family, rank_text = match.groups()
    rank = int(rank_text)
    valid = (
        (family == "A" and rank >= 1)
        or (family == "B" and rank >= 2)
        or (family == "D" and rank >= 4)
        or (family == "E" and rank in {6, 7, 8})
        or (family == "F" and rank == 4)
    )
    if not valid:
        raise SynthesisError(f"{value!r} is not a supported finite Weyl type.")
    return family, rank


def weyl_group_order(family: str, rank: int) -> int:
    """Return the exact order of an irreducible crystallographic Weyl group."""

    if family == "A":
        return math.factorial(rank + 1)
    if family == "B":
        return (2**rank) * math.factorial(rank)
    if family == "D":
        return (2 ** (rank - 1)) * math.factorial(rank)
    exceptional = {
        ("E", 6): 51_840,
        ("E", 7): 2_903_040,
        ("E", 8): 696_729_600,
        ("F", 4): 1_152,
    }
    try:
        return exceptional[(family, rank)]
    except KeyError as exc:  # pragma: no cover - guarded by parse_weyl_type
        raise SynthesisError(f"No order formula for {family}{rank}.") from exc


def weyl_natural_degree(family: str, rank: int) -> int | None:
    if family == "A":
        return rank + 1
    if family in {"B", "D"}:
        return 2 * rank
    # GAP chooses a faithful permutation model for exceptional types.  Its
    # degree is reported after construction rather than guessed here.
    return None


def symmetric_target(degree: int) -> dict[str, Any]:
    n = positive_integer(degree, "symmetric degree")
    if n < 2:
        raise SynthesisError("A symmetric target degree must be at least 2.")
    return {
        "id": f"symmetric-S{n}",
        "kind": "symmetric",
        "degree": n,
        "order": math.factorial(n),
        "orderSource": "exact-factorial-formula",
        "declaredPermutationDegree": n,
    }


def weyl_target(type_name: str) -> dict[str, Any]:
    family, rank = parse_weyl_type(type_name)
    return {
        "id": f"weyl-{family}{rank}",
        "kind": "weyl",
        "family": family,
        "rank": rank,
        "type": f"{family}{rank}",
        "order": weyl_group_order(family, rank),
        "orderSource": "exact-Weyl-order-formula",
        "declaredPermutationDegree": weyl_natural_degree(family, rank),
    }


def classical_target(record: Mapping[str, Any]) -> dict[str, Any]:
    """Validate an explicit classical target without inferring its order.

    Finite classical notation has parity, center, and projectivization choices
    that materially change the group.  The planner therefore accepts no
    automatically generated classical target list and requires the caller to
    state every parameter and the exact expected order.
    """

    identifier = record.get("id")
    family = record.get("family")
    if not isinstance(identifier, str) or SAFE_ID.fullmatch(identifier) is None:
        raise SynthesisError(
            "Each classical target needs a filesystem-safe nonempty id."
        )
    if family not in CLASSICAL_FAMILIES:
        raise SynthesisError(
            f"Classical target {identifier!r} has unsupported family {family!r}."
        )
    dimension = positive_integer(record.get("dimension"), f"{identifier}.dimension")
    field_order = positive_integer(record.get("fieldOrder"), f"{identifier}.fieldOrder")
    order = positive_integer(record.get("order"), f"{identifier}.order")
    result = {
        "id": identifier,
        "kind": "classical",
        "family": family,
        "dimension": dimension,
        "fieldOrder": field_order,
        "order": order,
        "orderSource": "explicit-user-record",
        "declaredPermutationDegree": None,
    }
    formula = record.get("orderFormula")
    if formula is not None:
        if not isinstance(formula, str) or not formula.strip():
            raise SynthesisError(
                f"{identifier}.orderFormula must be a nonempty string."
            )
        result["orderFormula"] = formula
    return result


def symplectic_group_order(dimension: int, field_order: int) -> int:
    """Return ``|Sp(dimension, field_order)|`` for even ``dimension``.

    Affine targets use the natural symplectic module. Computing the order here
    keeps the initial target sieve independent of GAP; GAP reconstructs the
    group and checks this declaration before it searches.
    """

    if dimension <= 0 or dimension % 2 != 0:
        raise SynthesisError("A symplectic dimension must be positive and even.")
    if field_order < 2:
        raise SynthesisError("A symplectic field order must be at least 2.")
    half = dimension // 2
    return field_order ** (half * half) * math.prod(
        field_order ** (2 * index) - 1 for index in range(1, half + 1)
    )


def affine_classical_target(record: Mapping[str, Any]) -> dict[str, Any]:
    """Validate a split natural-module target ``V : Sp(V)``.

    This first structural family is deliberately narrow. Its natural affine
    action is exact and small, and for ``Sp(4,2) = S6`` the compact 5-cube's
    ``A5`` vertex group gives a complete anchor catalogue. Other modules need
    explicit constructors rather than being inferred from notation.
    """

    identifier = record.get("id")
    family = record.get("family")
    if not isinstance(identifier, str) or SAFE_ID.fullmatch(identifier) is None:
        raise SynthesisError(
            "Each affine classical target needs a filesystem-safe nonempty id."
        )
    if family != "Sp":
        raise SynthesisError(
            f"Affine target {identifier!r} has unsupported family {family!r}."
        )
    dimension = positive_integer(record.get("dimension"), f"{identifier}.dimension")
    field_order = positive_integer(record.get("fieldOrder"), f"{identifier}.fieldOrder")
    module_copies = positive_integer(
        record.get("moduleCopies", 1), f"{identifier}.moduleCopies"
    )
    if field_order != 2:
        raise SynthesisError(
            "The exact affine search currently supports only the natural GF(2) module."
        )
    linear_order = symplectic_group_order(dimension, field_order)
    module_dimension = dimension * module_copies
    module_order = field_order**module_dimension
    order = module_order * linear_order
    declared_order = record.get("order")
    if declared_order is not None and positive_integer(
        declared_order, f"{identifier}.order"
    ) != order:
        raise SynthesisError(
            f"Affine target {identifier!r} has order {order}, not {declared_order}."
        )
    result: dict[str, Any] = {
        "id": identifier,
        "kind": "affine-classical",
        "family": family,
        "dimension": dimension,
        "fieldOrder": field_order,
        "moduleCopies": module_copies,
        "moduleDimension": module_dimension,
        "moduleOrder": module_order,
        "linearOrder": linear_order,
        "order": order,
        "orderSource": "exact-natural-affine-symplectic-formula",
        "declaredPermutationDegree": module_order,
        "type": (
            f"2^{module_dimension}:Sp{dimension}(2)"
            + (f"[natural^{module_copies}]" if module_copies > 1 else "")
        ),
    }
    if dimension == 4:
        result["structuralAnchorType"] = "A5"
    return result


def s6_block_extension_target(
    quotient_order: int, quotient_id: int, outer_kernel_orbit: int
) -> dict[str, Any]:
    """Describe one exact ``S6``-by-block-group extension target.

    ``outer_kernel_orbit=0`` is the direct product.  A positive value selects
    an Aut(R)-orbit of index-two kernels and hence a nontrivial map
    ``R -> Out(S6)``.  GAP reconstructs that orbit and checks the target order
    before any Coxeter generators are searched.
    """

    order = positive_integer(quotient_order, "S6 block quotient order")
    group_id = positive_integer(quotient_id, "S6 block quotient id")
    if isinstance(outer_kernel_orbit, bool) or not isinstance(
        outer_kernel_orbit, int
    ):
        raise SynthesisError("S6 outer-kernel orbit must be a nonnegative integer.")
    orbit_counts = S6_BLOCK_EXTENSION_KERNEL_ORBITS.get(order)
    if orbit_counts is None:
        raise SynthesisError(
            "The exact S6 block-extension catalogue supports quotient orders 8 and 16."
        )
    if group_id > len(orbit_counts):
        raise SynthesisError(
            f"SmallGroup({order},{group_id}) is outside the sealed catalogue."
        )
    maximum_orbit = orbit_counts[group_id - 1]
    if outer_kernel_orbit < 0 or outer_kernel_orbit > maximum_orbit:
        raise SynthesisError(
            f"SmallGroup({order},{group_id}) has outer-kernel orbit range "
            f"0..{maximum_orbit}, not {outer_kernel_orbit}."
        )
    action_name = (
        "trivial" if outer_kernel_orbit == 0 else f"outer-k{outer_kernel_orbit}"
    )
    return {
        "id": f"s6-block-q{order}-g{group_id}-{action_name}",
        "kind": "s6-block-extension",
        "quotientOrder": order,
        "quotientId": group_id,
        "outerKernelOrbit": outer_kernel_orbit,
        "expectedOuterKernelOrbitCount": maximum_orbit,
        "order": 720 * order,
        "orderSource": "centerless-S6-extension-order",
        "declaredPermutationDegree": None,
        "type": f"S6.by.SmallGroup({order},{group_id})[{action_name}]",
        "structuralAnchorType": "A5",
        "scope": (
            "one centerless S6 extension determined by the named block group "
            "and outer-action kernel orbit"
        ),
    }


def s6_block_extension_targets(orders: Any) -> list[dict[str, Any]]:
    requested = normalize_integer_list(
        orders, "finiteTargetSynthesis.s6BlockExtensionQuotientOrders"
    )
    unsupported = sorted(set(requested) - set(S6_BLOCK_EXTENSION_KERNEL_ORBITS))
    if unsupported:
        raise SynthesisError(
            "Unsupported S6 block quotient orders: "
            + ", ".join(map(str, unsupported))
        )
    result: list[dict[str, Any]] = []
    for order in requested:
        for group_id, orbit_count in enumerate(
            S6_BLOCK_EXTENSION_KERNEL_ORBITS[order], start=1
        ):
            for kernel_orbit in range(orbit_count + 1):
                result.append(
                    s6_block_extension_target(order, group_id, kernel_orbit)
                )
    return result


def a6_core_extension_target(
    block_degree: int, transitive_id: int, outer_map_orbit: int
) -> dict[str, Any]:
    """Describe one pullback through ``Aut(A6) -> Out(A6)``.

    The named transitive block group has point stabilizer C2.  Requiring its
    image in ``Out(A6)`` to be the S6 outer class makes the preimage of that
    stabilizer an actual S6 anchor, as required by the compact-cube vertex.
    """

    degree = positive_integer(block_degree, "A6-core block degree")
    identifier = positive_integer(transitive_id, "A6-core transitive id")
    orbit = positive_integer(outer_map_orbit, "A6-core outer-map orbit")
    catalogue = A6_CORE_OUTER_MAP_ORBITS.get(degree)
    if catalogue is None:
        raise SynthesisError("The exact A6-core catalogue supports degrees 8 and 16.")
    maximum = catalogue.get(identifier)
    if maximum is None:
        raise SynthesisError(
            f"TransitiveGroup({degree},{identifier}) has no admissible S6 anchor map."
        )
    if orbit > maximum:
        raise SynthesisError(
            f"TransitiveGroup({degree},{identifier}) has outer-map orbit range "
            f"1..{maximum}, not {orbit}."
        )
    quotient_order = 2 * degree
    return {
        "id": f"a6-core-d{degree}-t{identifier}-outer-{orbit}",
        "kind": "a6-core-extension",
        "blockDegree": degree,
        "transitiveId": identifier,
        "outerMapOrbit": orbit,
        "expectedOuterMapOrbitCount": maximum,
        "blockGroupOrder": quotient_order,
        "order": 360 * quotient_order,
        "orderSource": "centerless-A6-pullback-order",
        "declaredPermutationDegree": None,
        "type": f"A6.pullback({degree}T{identifier})[outer-{orbit}]",
        "structuralAnchorType": "A5",
        "scope": (
            "one A6-core pullback with a transitive block group and an exact "
            "stabilizer-preserving outer-map orbit"
        ),
    }


def a6_core_extension_targets(degrees: Any) -> list[dict[str, Any]]:
    requested = normalize_integer_list(
        degrees, "finiteTargetSynthesis.a6CoreExtensionBlockDegrees"
    )
    unsupported = sorted(set(requested) - set(A6_CORE_OUTER_MAP_ORBITS))
    if unsupported:
        raise SynthesisError(
            "Unsupported A6-core block degrees: "
            + ", ".join(map(str, unsupported))
        )
    return [
        a6_core_extension_target(degree, transitive_id, orbit)
        for degree in requested
        for transitive_id, orbit_count in A6_CORE_OUTER_MAP_ORBITS[degree].items()
        for orbit in range(1, orbit_count + 1)
    ]


def normalize_integer_list(value: Any, field: str) -> list[int]:
    if not isinstance(value, list):
        raise SynthesisError(f"{field} must be an array of integers.")
    return sorted({positive_integer(item, field) for item in value})


def normalize_string_list(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise SynthesisError(f"{field} must be an array of strings.")
    return sorted(set(value))


def build_target_specs(config: Mapping[str, Any]) -> list[dict[str, Any]]:
    symmetric_degrees = config.get("symmetricDegrees", list(DEFAULT_SYMMETRIC_DEGREES))
    weyl_types = config.get("weylTypes", list(DEFAULT_WEYL_TYPES))
    classical_records = config.get(
        "classicalTargets", [dict(record) for record in DEFAULT_CLASSICAL_TARGETS]
    )
    affine_records = config.get("affineClassicalTargets", [])
    s6_extension_orders = config.get("s6BlockExtensionQuotientOrders", [])
    a6_extension_degrees = config.get("a6CoreExtensionBlockDegrees", [])
    if not isinstance(classical_records, list):
        raise SynthesisError("classicalTargets must be an array.")
    if not isinstance(affine_records, list):
        raise SynthesisError("affineClassicalTargets must be an array.")

    targets = [
        symmetric_target(degree)
        for degree in normalize_integer_list(
            symmetric_degrees, "finiteTargetSynthesis.symmetricDegrees"
        )
    ]
    targets.extend(
        weyl_target(type_name)
        for type_name in normalize_string_list(
            weyl_types, "finiteTargetSynthesis.weylTypes"
        )
    )
    targets.extend(classical_target(record) for record in classical_records)
    targets.extend(affine_classical_target(record) for record in affine_records)
    targets.extend(s6_block_extension_targets(s6_extension_orders))
    targets.extend(a6_core_extension_targets(a6_extension_degrees))

    by_id: dict[str, dict[str, Any]] = {}
    for target in targets:
        existing = by_id.get(target["id"])
        if existing is not None and existing != target:
            raise SynthesisError(f"Conflicting target records use id {target['id']!r}.")
        by_id[target["id"]] = target
    return sorted(by_id.values(), key=lambda item: (item["kind"], item["id"]))


def parse_source_and_config(
    raw: Mapping[str, Any], external_config: Mapping[str, Any] | None = None
) -> tuple[dict[str, Any], list[list[int]], dict[str, Any]]:
    source_value = raw.get("sourceSystem", raw)
    source, matrix = shared.validate_source(dict(source_value))
    embedded = raw.get("finiteTargetSynthesis", {})
    if not isinstance(embedded, dict):
        raise SynthesisError("finiteTargetSynthesis must be an object.")
    config = dict(embedded)
    if external_config is not None:
        config.update(external_config)
    return source, matrix, config


def resolve_bounds(
    config: Mapping[str, Any], cli_overrides: Mapping[str, int | None]
) -> dict[str, int]:
    raw_bounds = config.get("bounds", {})
    if not isinstance(raw_bounds, dict):
        raise SynthesisError("finiteTargetSynthesis.bounds must be an object.")
    unknown = sorted(set(raw_bounds) - set(DEFAULT_BOUNDS))
    if unknown:
        raise SynthesisError("Unknown synthesis bounds: " + ", ".join(unknown))
    result: dict[str, int] = {}
    for key, default in DEFAULT_BOUNDS.items():
        value = cli_overrides.get(key)
        if value is None:
            value = raw_bounds.get(key, default)
        result[key] = positive_integer(value, f"bounds.{key}")
    return result


def enumerate_spherical(
    matrix: Sequence[Sequence[int]], bounds: Mapping[str, int]
) -> list[shared.SphericalSubset]:
    classifier_bounds = {
        "maxSubsets": bounds["maxSubsets"],
        "maxSphericalOrder": bounds["maxSphericalOrder"],
    }
    return shared.maximal_spherical_subsets(matrix, classifier_bounds)


def enumerate_all_spherical(
    matrix: Sequence[Sequence[int]], bounds: Mapping[str, int]
) -> list[shared.SphericalSubset]:
    """Enumerate every finite special subgroup used for early DFS pruning.

    The maximal catalogue is the torsion-free promotion criterion.  Proper
    spherical subsets are redundant for the final proof, but checking them as
    soon as their generators are assigned rejects bad partial tuples much
    earlier than waiting for a rank-five vertex group to be complete.
    """

    rank = len(matrix)
    subset_count = (1 << rank) - 1
    if subset_count > bounds["maxSubsets"]:
        raise SynthesisError(
            "Complete spherical pruning needs "
            f"{subset_count} subsets, above maxSubsets={bounds['maxSubsets']}."
        )
    result: list[shared.SphericalSubset] = []
    for mask in range(1, 1 << rank):
        subset = tuple(index for index in range(rank) if mask & (1 << index))
        classified = shared.classify_spherical_subset(matrix, subset)
        if classified is not None:
            result.append(classified)
    result.sort(key=lambda item: (len(item.subset), item.subset, item.type_name))
    return result


def lower_bound_divisor(
    spherical: Sequence[shared.SphericalSubset],
) -> int:
    """LCM of local finite stabilizer orders in any free transitive action."""

    return math.lcm(*(item.expected_order for item in spherical))


def spherical_records(
    spherical: Sequence[shared.SphericalSubset],
) -> list[dict[str, Any]]:
    return [
        {
            "id": "T:" + ",".join(map(str, item.subset)),
            "subset": list(item.subset),
            "type": item.type_name,
            "order": item.expected_order,
        }
        for item in spherical
    ]


def distinct_spherical_type_records(
    matrix: Sequence[Sequence[int]],
    spherical: Sequence[shared.SphericalSubset],
) -> list[dict[str, Any]]:
    """Choose one labeled Coxeter matrix for each distinct local group type.

    The shared classifier's type name and exact order identify the abstract
    finite Coxeter type.  The smallest source subset supplies a deterministic
    simple-reflection matrix for the containment search.
    """

    representatives: dict[tuple[str, int], shared.SphericalSubset] = {}
    for item in spherical:
        key = (item.type_name, item.expected_order)
        current = representatives.get(key)
        if current is None or item.subset < current.subset:
            representatives[key] = item
    result: list[dict[str, Any]] = []
    for index, ((type_name, order), item) in enumerate(
        sorted(representatives.items(), key=lambda entry: (entry[0], entry[1].subset))
    ):
        subset = list(item.subset)
        result.append(
            {
                "id": f"local-type-{index}",
                "type": type_name,
                "order": order,
                "sourceSubset": subset,
                "coxeterMatrix": [
                    [matrix[left][right] for right in subset] for left in subset
                ],
            }
        )
    return result


def structural_anchor_plan(
    matrix: Sequence[Sequence[int]],
    spherical: Sequence[shared.SphericalSubset],
    target: Mapping[str, Any],
) -> dict[str, Any] | None:
    """Choose a fixed local group whose embeddings seed the global search.

    For the compact 5-cube, an ``A5`` vertex group occurs as a standard
    parabolic subgroup of each fallback target ``W(D6)``, ``W(B6)``, and
    ``W(E6)``.  Enumerating its labeled embeddings up to target conjugacy is
    exhaustive: every global generator tuple restricts to one such embedding.
    The remaining generators can then be reduced by the pointwise centralizer
    of that anchored tuple.
    """

    is_weyl_anchor = target.get("kind") == "weyl" and target.get(
        "type"
    ) in STRUCTURAL_ANCHOR_TARGETS
    is_affine_anchor = (
        target.get("kind") == "affine-classical"
        and target.get("structuralAnchorType") == "A5"
    )
    is_symmetric_anchor = (
        target.get("kind") == "symmetric" and target.get("degree") in {8, 9}
    )
    is_s6_block_anchor = (
        target.get("kind") == "s6-block-extension"
        and target.get("structuralAnchorType") == "A5"
    )
    is_a6_core_anchor = (
        target.get("kind") == "a6-core-extension"
        and target.get("structuralAnchorType") == "A5"
    )
    if not (
        is_weyl_anchor
        or is_affine_anchor
        or is_symmetric_anchor
        or is_s6_block_anchor
        or is_a6_core_anchor
    ):
        return None
    candidates = sorted(
        (item for item in spherical if item.type_name == "A5"),
        key=lambda item: item.subset,
    )
    if not candidates:
        return None
    anchor = candidates[0]
    subset = list(anchor.subset)
    return {
        "strategy": "a5-subgroup-catalogue-centralizer-extension",
        "type": anchor.type_name,
        "expectedOrder": anchor.expected_order,
        "sourceSubset": subset,
        "coxeterMatrix": [[matrix[left][right] for right in subset] for left in subset],
        "targetType": target.get("type", f"S{target.get('degree')}"),
        "completenessCriterion": (
            "all labeled anchor tuples modulo simultaneous target conjugacy, "
            "followed by all extensions modulo the pointwise centralizer"
        ),
    }


def screen_target(
    target: Mapping[str, Any],
    spherical: Sequence[shared.SphericalSubset],
    divisor: int,
    bounds: Mapping[str, int],
) -> dict[str, Any]:
    order = int(target["order"])
    local_checks = [
        {
            "subset": list(item.subset),
            "type": item.type_name,
            "order": item.expected_order,
            "dividesTargetOrder": order % item.expected_order == 0,
        }
        for item in spherical
    ]
    order_eligible = order % divisor == 0 and all(
        check["dividesTargetOrder"] for check in local_checks
    )
    reasons: list[str] = []
    if not order_eligible:
        reasons.append(
            f"target order {order} is not divisible by the local-order lcm {divisor}"
        )
    enumerably_bounded = order <= bounds["maxTargetOrderForEnumeration"]
    if order_eligible and not enumerably_bounded:
        reasons.append(
            "target passes the exact order screen but exceeds the declared "
            "element-enumeration bound"
        )
    return {
        **dict(target),
        "screen": {
            "status": "eligible" if order_eligible else "rejected",
            "complete": True,
            "targetOrderDivisibleByLowerBound": order % divisor == 0,
            "localSphericalOrderChecks": local_checks,
            "localEmbeddingsProved": False,
            "localContainmentPrecheck": (
                "required" if order_eligible else "not-needed-after-order-rejection"
            ),
            "reasons": reasons,
        },
        "boundedSearch": {
            "eligible": order_eligible and enumerably_bounded,
            "reason": (
                "within exact element-enumeration bound"
                if order_eligible and enumerably_bounded
                else reasons[-1]
                if reasons
                else "rejected by exact order screen"
            ),
        },
        "degreeSemantics": {
            "ambientPermutationDegree": target.get("declaredPermutationDegree"),
            "kernelIndexIfSurjective": str(order),
            "transitiveCosetCoverDegree": None,
            "note": (
                "The target permutation degree encodes a finite quotient. It is "
                "not the index of the kernel unless it equals the quotient order."
            ),
        },
    }


Permutation = tuple[int, ...]


def validate_permutation(values: Sequence[int], degree: int, field: str) -> Permutation:
    if len(values) != degree or sorted(values) != list(range(degree)):
        raise SynthesisError(f"{field} is not a permutation of 0..{degree - 1}.")
    return tuple(values)


def compose(left: Permutation, right: Permutation) -> Permutation:
    """Match GAP's right action: point^(left*right)=(point^left)^right."""

    return tuple(right[left[point]] for point in range(len(left)))


def permutation_order(permutation: Permutation) -> int:
    visited = [False] * len(permutation)
    result = 1
    for root in range(len(permutation)):
        if visited[root]:
            continue
        length = 0
        current = root
        while not visited[current]:
            visited[current] = True
            current = permutation[current]
            length += 1
        if length:
            result = math.lcm(result, length)
    return result


def generated_group_order(
    generators: Sequence[Permutation], maximum: int
) -> tuple[int | None, bool]:
    """Enumerate a small permutation subgroup, stopping before a false claim."""

    if not generators:
        return 1, True
    degree = len(generators[0])
    identity = tuple(range(degree))
    known = {identity}
    queue = [identity]
    cursor = 0
    while cursor < len(queue):
        current = queue[cursor]
        cursor += 1
        for generator in generators:
            product = compose(current, generator)
            if product in known:
                continue
            known.add(product)
            if len(known) > maximum:
                return None, False
            queue.append(product)
    return len(known), True


def verify_containment_precheck(
    raw: Mapping[str, Any],
    expected: Mapping[str, Any],
    bounds: Mapping[str, int],
) -> dict[str, Any]:
    """Validate one bounded GAP local-type containment conclusion.

    A positive result carries full permutation rows and is replayed here.  A
    negative result is meaningful only when GAP marked its conjugacy-reduced
    enumeration complete.  A bounded result remains inconclusive.
    """

    if raw.get("typeId") != expected["id"]:
        raise SynthesisError("A containment precheck references the wrong type id.")
    if (
        raw.get("type") != expected["type"]
        or raw.get("expectedOrder") != expected["order"]
    ):
        raise SynthesisError(
            "A containment precheck disagrees with the spherical type."
        )
    status = raw.get("status")
    complete = raw.get("complete") is True
    if status not in {"proved-contained", "proved-absent", "incomplete-on-bound"}:
        raise SynthesisError(f"Unsupported containment-precheck status {status!r}.")
    if status in {"proved-contained", "proved-absent"} and not complete:
        raise SynthesisError(
            f"Containment status {status!r} requires complete evidence."
        )
    if status == "incomplete-on-bound" and complete:
        raise SynthesisError("An incomplete containment precheck cannot be complete.")

    base = {
        "typeId": expected["id"],
        "type": expected["type"],
        "expectedOrder": expected["order"],
        "status": status,
        "complete": complete,
        "searchNodes": raw.get("searchNodes"),
        "reason": raw.get("reason"),
        "sourceSubset": expected["sourceSubset"],
        "coxeterMatrix": expected["coxeterMatrix"],
    }
    if status == "proved-absent":
        if raw.get("generators"):
            raise SynthesisError(
                "A proved-absent precheck cannot carry a witness tuple."
            )
        return {**base, "verified": True, "faithfulTuple": None}
    if status == "incomplete-on-bound":
        return {**base, "verified": False, "faithfulTuple": None}

    degree = positive_integer(raw.get("permutationDegree"), "precheck degree")
    if degree > bounds["maxPermutationDegree"]:
        raise SynthesisError("A precheck witness exceeds maxPermutationDegree.")
    raw_generators = raw.get("generators")
    rank = len(expected["coxeterMatrix"])
    if not isinstance(raw_generators, dict):
        raise SynthesisError(
            "A proved-contained precheck is missing its witness tuple."
        )
    generators: list[Permutation] = []
    for index in range(rank):
        row = raw_generators.get(index)
        if not isinstance(row, list) or any(
            isinstance(value, bool) or not isinstance(value, int) for value in row
        ):
            raise SynthesisError(
                f"Containment witness is missing simple reflection {index}."
            )
        generators.append(
            validate_permutation(row, degree, f"precheck generator {index}")
        )

    involutions = [permutation_order(generator) == 2 for generator in generators]
    relation_checks: list[dict[str, Any]] = []
    local_matrix = expected["coxeterMatrix"]
    for left in range(rank):
        for right in range(left + 1, rank):
            expected_order = local_matrix[left][right]
            actual_order = permutation_order(
                compose(generators[left], generators[right])
            )
            relation_checks.append(
                {
                    "generators": [left, right],
                    "expectedProductOrder": expected_order,
                    "actualProductOrder": actual_order,
                    "passed": actual_order == expected_order,
                }
            )
    actual_order, enumeration_complete = generated_group_order(
        generators, int(expected["order"])
    )
    verified = (
        all(involutions)
        and all(check["passed"] for check in relation_checks)
        and enumeration_complete
        and actual_order == expected["order"]
    )
    if not verified:
        raise SynthesisError(
            f"GAP's claimed containment witness for {expected['type']} failed replay."
        )
    return {
        **base,
        "verified": True,
        "faithfulTuple": {
            "permutationDegree": degree,
            "generatorPermutations": [list(row) for row in generators],
            "involutionChecks": involutions,
            "relationChecks": relation_checks,
            "generatedOrder": actual_order,
        },
    }


def containment_gate(
    raw_prechecks: Sequence[Mapping[str, Any]],
    expected_types: Sequence[Mapping[str, Any]],
    bounds: Mapping[str, int],
) -> dict[str, Any]:
    """Summarize the fail-closed gate before full source-tuple search."""

    by_id: dict[str, Mapping[str, Any]] = {}
    for raw in raw_prechecks:
        type_id = raw.get("typeId")
        if not isinstance(type_id, str) or type_id in by_id:
            raise SynthesisError(
                "Containment prechecks have a missing or duplicate type id."
            )
        by_id[type_id] = raw
    expected_ids = {record["id"] for record in expected_types}
    if set(by_id) != expected_ids:
        raise SynthesisError(
            "Containment prechecks do not cover every distinct spherical type."
        )
    checks = [
        verify_containment_precheck(by_id[record["id"]], record, bounds)
        for record in expected_types
    ]
    absent = [check for check in checks if check["status"] == "proved-absent"]
    incomplete = [check for check in checks if check["status"] == "incomplete-on-bound"]
    if absent:
        status = "rejected-proved-absent"
        passed = False
        complete = True
    elif incomplete:
        status = "incomplete-on-bound"
        passed = False
        complete = False
    else:
        status = "passed"
        passed = True
        complete = True
    return {
        "status": status,
        "passed": passed,
        "complete": complete,
        "distinctTypeCount": len(expected_types),
        "checks": checks,
    }


def structural_anchor_gate(
    raw: Mapping[str, Any] | None,
    expected: Mapping[str, Any],
) -> dict[str, Any]:
    """Validate the declared scope of an anchor-seeded global search.

    Unlike the old local sieve, this gate does not claim that every abstract
    local type embeds in the target.  It admits the search because each global
    tuple is checked directly on every maximal spherical subgroup.  A negative
    result is complete only when GAP exhausts all anchor conjugacy classes and
    every centralizer-reduced extension branch.
    """

    if raw is None:
        return {
            "status": "missing-structural-anchor-evidence",
            "passed": False,
            "complete": False,
            "reason": "GAP did not emit the required structural-anchor record.",
            "checks": [],
        }
    for field, expected_value in (
        ("strategy", expected["strategy"]),
        ("type", expected["type"]),
        ("expectedOrder", expected["expectedOrder"]),
        ("sourceSubset", expected["sourceSubset"]),
    ):
        if raw.get(field) != expected_value:
            raise SynthesisError(
                f"Structural-anchor {field} disagrees with the search plan."
            )
    status = raw.get("status")
    complete = raw.get("complete") is True
    if status not in {"complete", "candidate-found", "incomplete-on-bound"}:
        raise SynthesisError(f"Unsupported structural-anchor status {status!r}.")
    if status == "complete" and not complete:
        raise SynthesisError("A complete structural-anchor search needs complete=true.")
    return {
        "status": "exact-global-anchor-search",
        "passed": True,
        "complete": complete,
        "precheckSuperseded": True,
        "localPromotionCriterion": (
            "every maximal spherical image has its exact classified order"
        ),
        "anchor": dict(raw),
        "checks": [],
    }


def verify_solution(
    raw_solution: Mapping[str, Any],
    target: Mapping[str, Any],
    matrix: Sequence[Sequence[int]],
    spherical: Sequence[shared.SphericalSubset],
    bounds: Mapping[str, int],
) -> dict[str, Any]:
    """Independently certify a GAP tuple from its full permutation rows."""

    degree = positive_integer(raw_solution.get("permutationDegree"), "solution degree")
    raw_generators = raw_solution.get("generators")
    if not isinstance(raw_generators, dict):
        raise SynthesisError("A GAP solution is missing generator permutation rows.")
    if degree > bounds["maxPermutationDegree"]:
        raise SynthesisError(
            f"Permutation degree {degree} exceeds maxPermutationDegree."
        )
    generators: list[Permutation] = []
    for index in range(len(matrix)):
        row = raw_generators.get(index)
        if not isinstance(row, list) or any(
            isinstance(value, bool) or not isinstance(value, int) for value in row
        ):
            raise SynthesisError(
                f"Missing permutation row for source generator {index}."
            )
        generators.append(validate_permutation(row, degree, f"generator {index}"))

    involution_checks = [
        {
            "generator": index,
            "order": permutation_order(permutation),
            "passed": permutation_order(permutation) == 2,
        }
        for index, permutation in enumerate(generators)
    ]
    relation_checks: list[dict[str, Any]] = []
    for left in range(len(matrix)):
        for right in range(left + 1, len(matrix)):
            expected = matrix[left][right]
            if expected == 0:
                continue
            actual = permutation_order(compose(generators[left], generators[right]))
            relation_checks.append(
                {
                    "generators": [left, right],
                    "expectedProductOrder": expected,
                    "actualProductOrder": actual,
                    "passed": actual == expected,
                }
            )

    spherical_checks: list[dict[str, Any]] = []
    for item in spherical:
        actual, complete = generated_group_order(
            [generators[index] for index in item.subset], item.expected_order
        )
        spherical_checks.append(
            {
                "subset": list(item.subset),
                "type": item.type_name,
                "expectedOrder": item.expected_order,
                "actualOrder": actual,
                "enumerationComplete": complete,
                "passed": complete and actual == item.expected_order,
            }
        )

    reported_image_order = positive_integer(
        raw_solution.get("imageOrder"), "solution imageOrder"
    )
    image_replay: dict[str, Any]
    if reported_image_order <= bounds["maxVerifyImageOrder"]:
        actual_image_order, complete = generated_group_order(
            generators, bounds["maxVerifyImageOrder"]
        )
        image_replay = {
            "attempted": True,
            "complete": complete,
            "reportedOrder": reported_image_order,
            "actualOrder": actual_image_order,
            "passed": complete and actual_image_order == reported_image_order,
        }
    else:
        image_replay = {
            "attempted": False,
            "complete": False,
            "reportedOrder": reported_image_order,
            "actualOrder": None,
            "passed": None,
            "reason": "image order exceeds maxVerifyImageOrder",
        }

    local_passed = all(check["passed"] for check in spherical_checks)
    accepted = (
        all(check["passed"] for check in involution_checks)
        and all(check["passed"] for check in relation_checks)
        and local_passed
        and (image_replay["passed"] is not False)
    )
    surjective = reported_image_order == int(target["order"])
    return {
        "accepted": accepted,
        "criterion": "injective-on-every-maximal-spherical-special-subgroup",
        "permutationDegree": degree,
        "generatorPermutations": [list(row) for row in generators],
        "involutionChecks": involution_checks,
        "coxeterProductOrderChecks": relation_checks,
        "maximalSphericalImageChecks": spherical_checks,
        "fullImageReplay": image_replay,
        "finiteQuotient": {
            "ambientTargetId": target["id"],
            "ambientTargetOrder": str(target["order"]),
            "imageOrder": str(reported_image_order),
            "surjectiveOntoAmbientTarget": surjective,
            "kernelIndex": str(reported_image_order),
            "kernelTorsionFree": accepted,
        },
        "coverDegreeDistinction": {
            "normalKernelCoverDegree": str(reported_image_order),
            "ambientPermutationDegree": degree,
            "transitiveCosetCoverDegree": None,
            "explanation": (
                "This tuple defines a normal kernel cover of index equal to the "
                "finite image order. No smaller point-stabilizer cover is claimed."
            ),
        },
    }


def gap_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def gap_matrix(matrix: Sequence[Sequence[int]]) -> str:
    return "[" + ",".join("[" + ",".join(map(str, row)) + "]" for row in matrix) + "]"


def gap_target_record(target: Mapping[str, Any]) -> str:
    fields = [
        f"id:={gap_string(str(target['id']))}",
        f"kind:={gap_string(str(target['kind']))}",
        f"expectedOrder:={int(target['order'])}",
    ]
    if target["kind"] == "symmetric":
        fields.append(f"degree:={int(target['degree'])}")
    elif target["kind"] == "weyl":
        fields.extend(
            [
                f"family:={gap_string(str(target['family']))}",
                f"rank:={int(target['rank'])}",
            ]
        )
    elif target["kind"] == "classical":
        fields.extend(
            [
                f"family:={gap_string(str(target['family']))}",
                f"dimension:={int(target['dimension'])}",
                f"fieldOrder:={int(target['fieldOrder'])}",
            ]
        )
    elif target["kind"] == "affine-classical":
        fields.extend(
            [
                f"family:={gap_string(str(target['family']))}",
                f"dimension:={int(target['dimension'])}",
                f"fieldOrder:={int(target['fieldOrder'])}",
                f"moduleCopies:={int(target['moduleCopies'])}",
            ]
        )
    elif target["kind"] == "s6-block-extension":
        fields.extend(
            [
                f"quotientOrder:={int(target['quotientOrder'])}",
                f"quotientId:={int(target['quotientId'])}",
                f"outerKernelOrbit:={int(target['outerKernelOrbit'])}",
                f"expectedOuterKernelOrbitCount:={int(target['expectedOuterKernelOrbitCount'])}",
            ]
        )
    elif target["kind"] == "a6-core-extension":
        fields.extend(
            [
                f"blockDegree:={int(target['blockDegree'])}",
                f"transitiveId:={int(target['transitiveId'])}",
                f"outerMapOrbit:={int(target['outerMapOrbit'])}",
                f"expectedOuterMapOrbitCount:={int(target['expectedOuterMapOrbitCount'])}",
            ]
        )
    return "rec(" + ",".join(fields) + ")"


def gap_input(
    matrix: Sequence[Sequence[int]],
    spherical: Sequence[shared.SphericalSubset],
    target: Mapping[str, Any],
    bounds: Mapping[str, int],
) -> str:
    all_spherical = enumerate_all_spherical(matrix, bounds)
    spherical_gap = []
    for item in spherical:
        subset = ",".join(str(index + 1) for index in item.subset)
        spherical_gap.append(
            "rec(subset:=["
            + subset
            + "],typeName:="
            + gap_string(item.type_name)
            + ",expectedOrder:="
            + str(item.expected_order)
            + ")"
        )
    pruning_gap = []
    for item in all_spherical:
        subset = ",".join(str(index + 1) for index in item.subset)
        pruning_gap.append(
            "rec(subset:=["
            + subset
            + "],typeName:="
            + gap_string(item.type_name)
            + ",expectedOrder:="
            + str(item.expected_order)
            + ")"
        )
    precheck_gap = []
    for item in distinct_spherical_type_records(matrix, spherical):
        precheck_gap.append(
            "rec(id:="
            + gap_string(item["id"])
            + ",typeName:="
            + gap_string(item["type"])
            + ",expectedOrder:="
            + str(item["order"])
            + ",coxeterMatrix:="
            + gap_matrix(item["coxeterMatrix"])
            + ")"
        )
    bound_fields = ",".join(
        [
            f"maxTargetOrderForEnumeration:={bounds['maxTargetOrderForEnumeration']}",
            f"maxInvolutions:={bounds['maxInvolutions']}",
            f"maxInvolutionClasses:={bounds['maxInvolutionClasses']}",
            f"maxPrecheckNodesPerType:={bounds['maxPrecheckNodesPerType']}",
            f"maxAnchorSearchNodes:={bounds['maxAnchorSearchNodes']}",
            f"maxAnchorClasses:={bounds['maxAnchorClasses']}",
            f"maxSearchNodes:={bounds['maxSearchNodes']}",
            f"maxSolutions:={bounds['maxSolutionsPerTarget']}",
            f"maxPermutationDegree:={bounds['maxPermutationDegree']}",
            f"precheckTimeoutMilliseconds:={bounds['timeoutSecondsPerPrecheck'] * 1000}",
            f"anchorTimeoutMilliseconds:={bounds['timeoutSecondsPerAnchor'] * 1000}",
            f"timeoutMilliseconds:={bounds['timeoutSecondsPerTarget'] * 1000}",
        ]
    )
    anchor = structural_anchor_plan(matrix, spherical, target)
    anchor_gap = "fail"
    if anchor is not None:
        anchor_subset = ",".join(str(index + 1) for index in anchor["sourceSubset"])
        anchor_gap = (
            "rec(strategy:="
            + gap_string(anchor["strategy"])
            + ",typeName:="
            + gap_string(anchor["type"])
            + ",expectedOrder:="
            + str(anchor["expectedOrder"])
            + ",sourceSubset:=["
            + anchor_subset
            + "],coxeterMatrix:="
            + gap_matrix(anchor["coxeterMatrix"])
            + ")"
        )
    return (
        "COXETER_FINITE_TARGET_INPUT := rec(\n"
        "protocolVersion:=4,\n"
        f"rank:={len(matrix)},\n"
        f"coxeterMatrix:={gap_matrix(matrix)},\n"
        "sphericalSubgroups:=[" + ",".join(spherical_gap) + "],\n"
        "sphericalPruningSubgroups:=[" + ",".join(pruning_gap) + "],\n"
        "sphericalTypePrechecks:=[" + ",".join(precheck_gap) + "],\n"
        f"structuralAnchor:={anchor_gap},\n"
        f"target:={gap_target_record(target)},\n"
        f"bounds:=rec({bound_fields})\n"
        ");;\n"
    )


def gap_runtimes(explicit_gap: str | None) -> list[GapRuntime]:
    if explicit_gap:
        return [GapRuntime(explicit_gap, "native", (explicit_gap,))]
    candidates: list[GapRuntime] = []
    native = shutil.which("gap")
    if native:
        candidates.append(GapRuntime(native, "native", (native,)))
    if os.name == "nt" and shutil.which("wsl"):
        candidates.extend(
            [
                GapRuntime("wsl gap", "wsl", ("wsl", "gap")),
                GapRuntime(
                    "wsl Sage GAP",
                    "wsl",
                    ("wsl", shared.DEFAULT_WSL_GAP),
                ),
            ]
        )
    return candidates


def gap_command(runtime: GapRuntime, data_path: Path, raw_path: Path) -> list[str]:
    if runtime.kind == "wsl":
        script = shared.windows_path_to_wsl(GAP_SCRIPT)
        data = shared.windows_path_to_wsl(data_path)
        raw = shared.windows_path_to_wsl(raw_path)
    else:
        script, data, raw = str(GAP_SCRIPT), str(data_path), str(raw_path)
    startup = (
        "ARGV := ["
        + ",".join(gap_string(value) for value in ["--data", data, "--raw-output", raw])
        + "];; Read("
        + gap_string(script)
        + ");;"
    )
    return [*runtime.command_prefix, "-q", "-c", startup]


def parse_integer_csv(raw: str, one_based: bool = False) -> list[int]:
    if raw == "":
        return []
    values = [int(value) for value in raw.split(",")]
    return [value - 1 for value in values] if one_based else values


def parse_gap_output(
    path: Path,
    target_id: str,
    *,
    expected_target_order: int | None = None,
    expected_rank: int | None = None,
    expected_pruning_count: int | None = None,
    expected_anchor_order: int | None = None,
) -> dict[str, Any]:
    if not path.exists():
        raise SynthesisError("GAP did not create its bounded-search transcript.")
    target: dict[str, Any] | None = None
    header: dict[str, Any] | None = None
    solutions: dict[int, dict[str, Any]] = {}
    prechecks: dict[int, dict[str, Any]] = {}
    structural_anchor: dict[str, Any] | None = None
    search_statistics: dict[str, Any] | None = None
    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf8").splitlines(), start=1
    ):
        if not raw_line:
            continue
        fields = raw_line.split("|")
        tag = fields[0]
        try:
            if tag == "HEADER":
                if len(fields) != 9 or fields[1] != target_id or header is not None:
                    raise SynthesisError(
                        "GAP emitted a missing, duplicate, or mismatched header."
                    )
                header = {
                    "targetId": fields[1],
                    "protocolVersion": int(fields[2]),
                    "backendVersion": fields[3],
                    "expectedTargetOrder": int(fields[4]),
                    "sourceRank": int(fields[5]),
                    "sphericalPruningSubsetCount": int(fields[6]),
                    "anchorExpectedOrder": int(fields[7]),
                    "gapVersion": fields[8],
                }
            elif tag == "TARGET":
                if target is not None:
                    raise SynthesisError("GAP emitted a duplicate TARGET record.")
                if len(fields) != 11 or fields[1] != target_id:
                    raise SynthesisError(
                        "GAP target header does not match the request."
                    )
                target = {
                    "targetId": fields[1],
                    "status": fields[2],
                    "complete": fields[3] == "true",
                    "reason": fields[4],
                    "targetOrder": int(fields[5]),
                    "permutationDegree": int(fields[6]),
                    "searchNodes": int(fields[7]),
                    "involutionCount": int(fields[8]),
                    "involutionClassCount": int(fields[9]),
                    "solutionCount": int(fields[10]),
                }
            elif tag == "ANCHOR":
                if (
                    len(fields) != 14
                    or fields[1] != target_id
                    or structural_anchor is not None
                ):
                    raise SynthesisError(
                        "GAP structural-anchor record does not match the request."
                    )
                structural_anchor = {
                    "targetId": fields[1],
                    "strategy": fields[2],
                    "type": fields[3],
                    "expectedOrder": int(fields[4]),
                    "sourceSubset": parse_integer_csv(fields[5], one_based=True),
                    "status": fields[6],
                    "complete": fields[7] == "true",
                    "searchNodes": int(fields[8]),
                    "embeddingClassCount": int(fields[9]),
                    "structuralSeedCount": int(fields[10]),
                    "subgroupClassCount": int(fields[11]),
                    "catalogueMethod": fields[12],
                    "reason": fields[13],
                }
            elif tag == "SEARCH_STATS":
                if (
                    len(fields) != 9
                    or fields[1] != target_id
                    or search_statistics is not None
                ):
                    raise SynthesisError(
                        "GAP search-statistics record does not match the request."
                    )
                search_statistics = {
                    "compatibilityTests": int(fields[2]),
                    "centralizerCalls": int(fields[3]),
                    "candidateCountBeforeOrbitReduction": int(fields[4]),
                    "orbitRepresentativeCount": int(fields[5]),
                    "sphericalPrunes": int(fields[6]),
                    "anchorBranchesCompleted": int(fields[7]),
                    "anchorBranchesStarted": int(fields[8]),
                }
            elif tag == "PRECHECK":
                if len(fields) != 11 or fields[1] != target_id:
                    raise SynthesisError(
                        "GAP containment-precheck header does not match the request."
                    )
                index = int(fields[2])
                if index in prechecks:
                    raise SynthesisError(
                        "GAP emitted a duplicate containment precheck."
                    )
                prechecks[index] = {
                    "targetId": fields[1],
                    "precheckIndex": index,
                    "typeId": fields[3],
                    "type": fields[4],
                    "expectedOrder": int(fields[5]),
                    "status": fields[6],
                    "complete": fields[7] == "true",
                    "searchNodes": int(fields[8]),
                    "reason": fields[9],
                    "permutationDegree": int(fields[10]),
                    "generators": {},
                }
            elif tag == "PRECHECK_GENERATOR":
                if len(fields) != 5 or fields[1] != target_id:
                    raise SynthesisError(
                        "GAP precheck-generator record does not match the request."
                    )
                precheck = prechecks[int(fields[2])]
                generator_index = int(fields[3])
                if generator_index in precheck["generators"]:
                    raise SynthesisError(
                        "GAP emitted a duplicate precheck generator row."
                    )
                precheck["generators"][generator_index] = parse_integer_csv(
                    fields[4], one_based=True
                )
            elif tag == "SOLUTION":
                if len(fields) != 6 or fields[1] != target_id:
                    raise SynthesisError(
                        "GAP solution record does not match the request."
                    )
                index = int(fields[2])
                if index in solutions:
                    raise SynthesisError("GAP emitted a duplicate solution record.")
                solutions[index] = {
                    "targetId": fields[1],
                    "solutionIndex": index,
                    "imageOrder": int(fields[3]),
                    "surjective": fields[4] == "true",
                    "permutationDegree": int(fields[5]),
                    "generators": {},
                    "gapSphericalChecks": [],
                }
            elif tag == "GENERATOR":
                if len(fields) != 5 or fields[1] != target_id:
                    raise SynthesisError(
                        "GAP generator record does not match the request."
                    )
                solution = solutions[int(fields[2])]
                generator_index = int(fields[3])
                if generator_index in solution["generators"]:
                    raise SynthesisError("GAP emitted a duplicate generator row.")
                solution["generators"][generator_index] = parse_integer_csv(
                    fields[4], one_based=True
                )
            elif tag == "SPHERICAL":
                if len(fields) != 7 or fields[1] != target_id:
                    raise SynthesisError(
                        "GAP spherical-check record does not match the request."
                    )
                solution = solutions[int(fields[2])]
                solution["gapSphericalChecks"].append(
                    {
                        "subset": parse_integer_csv(fields[3], one_based=True),
                        "expectedOrder": int(fields[4]),
                        "actualOrder": int(fields[5]),
                        "passed": fields[6] == "true",
                    }
                )
            else:
                raise SynthesisError(f"Unknown GAP transcript tag {tag!r}.")
        except (IndexError, KeyError, ValueError) as exc:
            raise SynthesisError(
                f"Malformed GAP transcript at line {line_number}: {raw_line}"
            ) from exc
    if header is None:
        raise SynthesisError("GAP transcript is missing its HEADER record.")
    if header["protocolVersion"] != 4 or header["backendVersion"] != BACKEND_VERSION:
        raise SynthesisError("GAP transcript uses another protocol or backend version.")
    expected_header_fields = (
        ("expectedTargetOrder", expected_target_order),
        ("sourceRank", expected_rank),
        ("sphericalPruningSubsetCount", expected_pruning_count),
        ("anchorExpectedOrder", expected_anchor_order),
    )
    for field, expected_value in expected_header_fields:
        if expected_value is not None and header[field] != expected_value:
            raise SynthesisError(
                f"GAP transcript {field} does not match the submitted search problem."
            )
    if target is None:
        raise SynthesisError("GAP transcript is missing its TARGET record.")
    if (
        target["status"] not in {"construction-failed", "order-mismatch"}
        and header["expectedTargetOrder"] != target["targetOrder"]
    ):
        raise SynthesisError("GAP header and target record disagree on target order.")
    if structural_anchor is not None:
        if search_statistics is None:
            raise SynthesisError(
                "A structural-anchor search is missing its search statistics."
            )
        if header["anchorExpectedOrder"] != structural_anchor["expectedOrder"]:
            raise SynthesisError("GAP header and anchor record disagree on order.")
        if (
            structural_anchor["complete"]
            and search_statistics is not None
            and search_statistics["anchorBranchesCompleted"]
            != search_statistics["anchorBranchesStarted"]
        ):
            raise SynthesisError(
                "A complete anchor search has unfinished extension branches."
            )
        if target["complete"] and not structural_anchor["complete"]:
            raise SynthesisError(
                "A complete target result cannot have an incomplete anchor catalogue."
            )
    target["protocol"] = header
    target["containmentPrechecks"] = [prechecks[index] for index in sorted(prechecks)]
    target["structuralAnchor"] = structural_anchor
    target["searchStatistics"] = search_statistics
    ordered = [solutions[index] for index in sorted(solutions)]
    if len(ordered) != target["solutionCount"]:
        raise SynthesisError("GAP transcript solution count is inconsistent.")
    target["solutions"] = ordered
    target["transcriptSha256"] = sha256_file(path)
    return target


def run_gap_target(
    target: Mapping[str, Any],
    matrix: Sequence[Sequence[int]],
    spherical: Sequence[shared.SphericalSubset],
    bounds: Mapping[str, int],
    explicit_gap: str | None,
) -> dict[str, Any]:
    runtimes = gap_runtimes(explicit_gap)
    if not runtimes:
        return {
            "targetId": target["id"],
            "status": "runtime-unavailable",
            "complete": False,
            "reason": "No native or WSL GAP runtime was found.",
            "solutions": [],
        }
    attempts: list[dict[str, Any]] = []
    precheck_count = len(distinct_spherical_type_records(matrix, spherical))
    with tempfile.TemporaryDirectory(prefix="coxeter-finite-target-") as temporary:
        root = Path(temporary)
        data_path = root / "input.g"
        raw_path = root / "raw.txt"
        data_path.write_text(
            gap_input(matrix, spherical, target, bounds), encoding="utf8"
        )
        for runtime in runtimes:
            command = gap_command(runtime, data_path, raw_path)
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=(
                        bounds["timeoutSecondsPerTarget"]
                        + precheck_count * bounds["timeoutSecondsPerPrecheck"]
                        + bounds["timeoutSecondsPerAnchor"]
                        + 10
                    ),
                    check=False,
                )
            except subprocess.TimeoutExpired:
                attempts.append(
                    {"runtime": runtime.label, "status": "timeout", "returnCode": None}
                )
                continue
            attempts.append(
                {
                    "runtime": runtime.label,
                    "status": "completed" if completed.returncode == 0 else "failed",
                    "returnCode": completed.returncode,
                    "stdoutTail": portable_diagnostic_tail(completed.stdout),
                    "stderrTail": portable_diagnostic_tail(completed.stderr),
                }
            )
            if completed.returncode != 0:
                continue
            try:
                anchor = structural_anchor_plan(matrix, spherical, target)
                result = parse_gap_output(
                    raw_path,
                    str(target["id"]),
                    expected_target_order=int(target["order"]),
                    expected_rank=len(matrix),
                    expected_pruning_count=len(enumerate_all_spherical(matrix, bounds)),
                    expected_anchor_order=(
                        int(anchor["expectedOrder"]) if anchor is not None else 0
                    ),
                )
            except SynthesisError as exc:
                attempts[-1]["status"] = "invalid-transcript"
                attempts[-1]["error"] = str(exc)
                continue
            result["runtime"] = runtime.label
            result["attempts"] = attempts
            return result
    return {
        "targetId": target["id"],
        "status": "runtime-failed",
        "complete": False,
        "reason": "Every GAP runtime failed, timed out, or returned invalid output.",
        "solutions": [],
        "attempts": attempts,
    }


def implementation_hashes() -> dict[str, str]:
    return {
        "pythonSha256": sha256_file(Path(__file__)),
        "gapSha256": sha256_file(GAP_SCRIPT),
        "classifierSha256": sha256_file(SCRIPT_DIR / "torsion_free_discovery.py"),
    }


def load_checkpoint(
    path: Path | None, input_hash: str, hashes: Mapping[str, str]
) -> dict[str, Any]:
    if path is None or not path.exists():
        return {
            "schemaVersion": 1,
            "artifactType": CHECKPOINT_TYPE,
            "inputHash": input_hash,
            "implementationHashes": dict(hashes),
            "records": {},
        }
    value = read_json_object(path)
    if (
        value.get("schemaVersion") != 1
        or value.get("artifactType") != CHECKPOINT_TYPE
        or value.get("inputHash") != input_hash
        or value.get("implementationHashes") != dict(hashes)
        or not isinstance(value.get("records"), dict)
    ):
        raise SynthesisError(
            "The finite-target checkpoint is stale or malformed; refusing to resume."
        )
    return value


def save_checkpoint(path: Path | None, checkpoint: Mapping[str, Any]) -> None:
    if path is not None:
        atomic_write_json(path, checkpoint)


def seal_artifact(artifact: dict[str, Any]) -> dict[str, Any]:
    artifact.pop("artifactHash", None)
    artifact["artifactHash"] = sha256_json(artifact)
    return artifact


def build_artifact(
    source: dict[str, Any],
    matrix: list[list[int]],
    config: Mapping[str, Any],
    bounds: dict[str, int],
    dry_run: bool,
    explicit_gap: str | None,
    checkpoint_path: Path | None,
    source_input_hash: str | None = None,
) -> dict[str, Any]:
    spherical = enumerate_spherical(matrix, bounds)
    all_spherical = enumerate_all_spherical(matrix, bounds)
    distinct_types = distinct_spherical_type_records(matrix, spherical)
    divisor = lower_bound_divisor(spherical)
    targets = build_target_specs(config)
    screened = [screen_target(target, spherical, divisor, bounds) for target in targets]
    hashes = implementation_hashes()
    source_hash = sha256_json(source)
    matrix_hash = sha256_json(matrix)
    search_problem_hash = sha256_json(
        {
            "sourceSystem": source,
            "matrix": matrix,
            "targets": targets,
            "bounds": bounds,
        }
    )
    input_hash = source_input_hash or sha256_json(source)
    evidence: list[dict[str, Any]] = []
    warnings: list[str] = []
    errors: list[str] = []

    if dry_run:
        warnings.append(
            "Dry run completed exact target-order screening and planned the "
            "required structural-anchor catalogues or local-type containment "
            "prechecks; no homomorphism or torsion-free kernel was certified."
        )
    else:
        checkpoint = load_checkpoint(checkpoint_path, search_problem_hash, hashes)
        records: dict[str, Any] = checkpoint["records"]
        target_by_id = {target["id"]: target for target in targets}
        for candidate in screened:
            if candidate["screen"]["status"] == "rejected":
                evidence.append(
                    {
                        "targetId": candidate["id"],
                        "status": "screened-out",
                        "complete": True,
                        "reason": candidate["screen"]["reasons"][0],
                        "verifiedSolutions": [],
                    }
                )
                continue
            if not candidate["boundedSearch"]["eligible"]:
                evidence.append(
                    {
                        "targetId": candidate["id"],
                        "status": "bounded-out",
                        "complete": False,
                        "reason": candidate["boundedSearch"]["reason"],
                        "verifiedSolutions": [],
                    }
                )
                continue
            target_id = candidate["id"]
            raw_result = records.get(target_id)
            if (
                isinstance(raw_result, Mapping)
                and raw_result.get("status") == "runtime-failed"
            ):
                # A launcher outage is not search evidence. Caching it would
                # turn one unavailable GAP runtime into a permanent negative.
                raw_result = None
            if raw_result is None:
                raw_result = run_gap_target(
                    target_by_id[target_id],
                    matrix,
                    spherical,
                    bounds,
                    explicit_gap,
                )
                records[target_id] = raw_result
                save_checkpoint(checkpoint_path, checkpoint)
            anchor_plan = structural_anchor_plan(
                matrix, spherical, target_by_id[target_id]
            )
            if anchor_plan is not None:
                raw_anchor = raw_result.get("structuralAnchor")
                gate = structural_anchor_gate(
                    raw_anchor if isinstance(raw_anchor, Mapping) else None,
                    anchor_plan,
                )
                candidate["screen"]["localEmbeddingsProved"] = False
                candidate["screen"]["localContainmentPrecheck"] = (
                    "superseded-by-exact-global-spherical-checks"
                )
            else:
                raw_prechecks = raw_result.get("containmentPrechecks")
                if isinstance(raw_prechecks, list) and raw_prechecks:
                    gate = containment_gate(raw_prechecks, distinct_types, bounds)
                else:
                    gate = {
                        "status": "incomplete-on-bound",
                        "passed": False,
                        "complete": False,
                        "distinctTypeCount": len(distinct_types),
                        "checks": [],
                        "reason": (
                            "GAP did not complete the required local-type prechecks."
                        ),
                    }
                candidate["screen"]["localEmbeddingsProved"] = gate["passed"]
                candidate["screen"]["localContainmentPrecheck"] = gate["status"]
                if gate["status"] == "rejected-proved-absent":
                    candidate["screen"]["status"] = "rejected-local-type-absent"
                    candidate["boundedSearch"]["eligible"] = False
                    candidate["boundedSearch"]["reason"] = (
                        "a distinct maximal spherical type is proved absent"
                    )
                elif gate["status"] == "incomplete-on-bound":
                    candidate["boundedSearch"]["eligible"] = False
                    candidate["boundedSearch"]["reason"] = (
                        "local-type containment precheck is incomplete"
                    )
            if not gate["passed"] and raw_result.get("solutions"):
                raise SynthesisError(
                    "GAP emitted full source tuples without passing every local-type precheck."
                )
            verified: list[dict[str, Any]] = []
            for raw_solution in (
                raw_result.get("solutions", []) if gate["passed"] else []
            ):
                try:
                    verified.append(
                        verify_solution(
                            raw_solution,
                            target_by_id[target_id],
                            matrix,
                            spherical,
                            bounds,
                        )
                    )
                except SynthesisError as exc:
                    verified.append({"accepted": False, "verificationError": str(exc)})
            evidence.append(
                {
                    **raw_result,
                    "containmentGate": gate,
                    "verifiedSolutions": verified,
                }
            )

    accepted = [
        solution
        for item in evidence
        for solution in item.get("verifiedSolutions", [])
        if solution.get("accepted") is True
    ]
    if dry_run:
        status = "planned"
        complete = False
    else:
        complete = all(item.get("complete") is True for item in evidence)
        if accepted:
            status = "candidate-found"
        elif complete:
            status = "exhausted"
        else:
            status = "incomplete"
    search_eligible_count = sum(
        candidate["screen"]["status"] != "rejected"
        and int(candidate["order"]) <= bounds["maxTargetOrderForEnumeration"]
        for candidate in screened
    )
    if not dry_run and search_eligible_count == 0:
        warnings.append(
            "No declared target passed both the exact order screen and the "
            "element-enumeration resource bound."
        )
    artifact = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "track": TRACK_ID,
        "backendVersion": BACKEND_VERSION,
        "status": status,
        "complete": complete,
        "sourceSystem": source,
        "inputHash": input_hash,
        "sourceHash": source_hash,
        "matrixHash": matrix_hash,
        "lowerBoundDivisor": divisor,
        "lowerBoundExplanation": (
            "Every maximal spherical subgroup must act freely on a torsion-free "
            "transitive coset action. Its orbits therefore have size |W_T|, so "
            "the action degree is divisible by every |W_T| and hence by their lcm."
        ),
        "bounds": bounds,
        "scope": {
            "declaredTargetCount": len(targets),
            "orderScreenComplete": True,
            "containmentPrecheckComplete": (
                False
                if dry_run
                else all(
                    item.get("containmentGate", {}).get("complete") is True
                    for item in evidence
                    if item.get("status") != "screened-out"
                )
            ),
            "boundedHomomorphismSearchComplete": complete,
            "dryRun": dry_run,
            "claim": "complete only relative to the declared finite target list and bounds",
        },
        "sphericalCatalogue": {
            "complete": True,
            "method": "shared exact finite-Coxeter classifier",
            "maximalSubgroups": spherical_records(spherical),
            "distinctMaximalTypes": distinct_types,
            "pruningSubsetCount": len(all_spherical),
            "pruningCatalogueHash": sha256_json(spherical_records(all_spherical)),
        },
        "candidates": accepted,
        "evidence": {
            "targetPlans": screened,
            "structuralAnchorPlans": {
                target["id"]: plan
                for target in targets
                if (plan := structural_anchor_plan(matrix, spherical, target))
                is not None
            },
            "boundedSearchResults": evidence,
            "searchProblemHash": search_problem_hash,
        },
        "acceptedKernelCount": len(accepted),
        "warnings": warnings,
        "errors": errors,
        "provenance": {"implementationHashes": hashes},
    }
    return seal_artifact(artifact)


def write_artifact(path: Path | None, artifact: Mapping[str, Any]) -> None:
    text = json.dumps(artifact, indent=2, sort_keys=True, allow_nan=False) + "\n"
    if path is None:
        sys.stdout.write(text)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf8")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Plan or run bounded exact finite-target Coxeter synthesis."
    )
    result.add_argument("--input", required=True, type=Path)
    result.add_argument("--output", required=True, type=Path)
    result.add_argument("--dry-run", action="store_true")
    result.add_argument("--target-config", type=Path)
    result.add_argument("--checkpoint", type=Path)
    result.add_argument("--gap")
    for key in DEFAULT_BOUNDS:
        option = "--" + re.sub(r"(?<!^)(?=[A-Z])", "-", key).lower()
        result.add_argument(option, dest=key, type=int)
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    output: Path = args.output
    try:
        raw = read_json_object(args.input)
        external = read_json_object(args.target_config) if args.target_config else None
        source, matrix, config = parse_source_and_config(raw, external)
        overrides = {key: getattr(args, key) for key in DEFAULT_BOUNDS}
        bounds = resolve_bounds(config, overrides)
        checkpoint = args.checkpoint
        if checkpoint is None and not args.dry_run:
            checkpoint = output.with_suffix(output.suffix + ".checkpoint.json")
        artifact = build_artifact(
            source,
            matrix,
            config,
            bounds,
            args.dry_run,
            args.gap,
            checkpoint,
            sha256_file(args.input),
        )
        write_artifact(output, artifact)
        return (
            0
            if artifact["status"] in {"planned", "candidate-found", "exhausted"}
            else 2
        )
    except Exception as exc:  # noqa: BLE001 - CLI must still emit one artifact
        failure = seal_artifact(
            {
                "schemaVersion": SCHEMA_VERSION,
                "artifactType": ARTIFACT_TYPE,
                "track": TRACK_ID,
                "status": "failed",
                "complete": False,
                "sourceSystem": None,
                "inputHash": "0" * 64,
                "lowerBoundDivisor": None,
                "bounds": {},
                "candidates": [],
                "evidence": [],
                "warnings": [],
                "errors": [str(exc)],
            }
        )
        write_artifact(output, failure)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
