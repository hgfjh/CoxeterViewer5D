#!/usr/bin/env python3
"""Discover finite-index torsion-free Coxeter subgroups with an exact ladder.

The launcher owns input validation, finite-Coxeter classification, runtime
selection, bounds, and stable JSON. GAP owns finite spherical subgroup
enumeration and low-index permutation modules. Sage owns exact congruence
reductions of the integral Tits representation.

A passing artifact uses the following finite criterion. Tits' torsion theorem
places every finite-order element in a conjugate of a spherical special
subgroup. Every nontrivial finite cyclic group has a prime-order element, so it
is enough to exclude conjugates of representatives of all prime-order classes
in the maximal spherical special subgroups. GAP's coset action is then checked
again: every witness must act without a fixed point.
"""

from __future__ import annotations

import argparse
from concurrent.futures import as_completed
import hashlib
import itertools
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from discovery_runtime import (
    GIB,
    DiscoveryRuntimeSession,
    ResourcePlan,
    ResourcePortfolio,
    RuntimeCancelled,
    ScratchPolicy,
    sha256_file,
)
from packed_composite_solver import find_composite_action_packed
import finite_image_module_catalogue as module_catalogue


SCRIPT_DIR = Path(__file__).resolve().parent
GAP_SCRIPT = SCRIPT_DIR / "gap_torsion_free_discovery.g"
SAGE_SCRIPT = SCRIPT_DIR / "sage_congruence_torsion_free.py"
FINITE_IMAGE_SCRIPT = SCRIPT_DIR / "torsion_free_finite_image.py"
FINITE_IMAGE_RECOGNITION_SCRIPT = SCRIPT_DIR / "finite_image_recognition.py"
GAP_FINITE_IMAGE_RECOGNITION_SCRIPT = SCRIPT_DIR / "gap_finite_image_recognition.g"
MOD3_STRUCTURAL_SCRIPT = SCRIPT_DIR / "mod3_structural_certificate.py"
MOD3_STRUCTURAL_GAP_SCRIPT = SCRIPT_DIR / "gap_mod3_structural_certificate.g"
MOD3_STRUCTURAL_REPLAY_GAP_SCRIPT = SCRIPT_DIR / "gap_mod3_structural_replay.g"
DEFAULT_MOD3_STRUCTURAL_CERTIFICATE = (
    SCRIPT_DIR
    / "certificates"
    / "torsion-free"
    / "compact_5_cube_mod3_structural_certificate.json"
)
DEFAULT_MOD3_STRUCTURAL_SOURCE = (
    SCRIPT_DIR.parent / "public" / "examples" / "compact_5_cube_gamma1.json"
)
PACKED_SOLVER_SCRIPT = SCRIPT_DIR / "packed_composite_solver.py"
MODULE_CATALOGUE_SCRIPT = SCRIPT_DIR / "finite_image_module_catalogue.py"
FIXTURE_DIR = SCRIPT_DIR.parent / "tests" / "fixtures" / "torsion-free-discovery"
BACKEND_ID = "automatic-torsion-free-cover"
BACKEND_VERSION = "3.4.1"
GAP_BACKEND_ID = "gap-low-index-torsion-free"
SAGE_BACKEND_ID = "sage-congruence-torsion-free"
COMPOSITE_BACKEND_ID = "everitt-composite-permutation-action"
ARTIFACT_TYPE = "coxeter-torsion-free-discovery"
FINITE_INDEX_KERNEL_LEVEL = "finite-index-kernel"
EXACT_INDEX_KERNEL_LEVEL = "exact-index-kernel"
MATERIALIZED_COVER_LEVEL = "materialized-cover"
DEFAULT_WSL_GAP = "/opt/miniforge3/envs/sage/bin/gap"
DEFAULT_WSL_SAGE = "/opt/miniforge3/envs/sage/bin/sage"

DEFAULT_BOUNDS = {
    "maxIndex": 256,
    "maxCandidates": 32,
    "maxModuleCandidates": 96,
    "maxCompositeModules": 4,
    "maxCompositeCombinations": 20_000,
    "maxCongruencePrime": 31,
    "maxCongruenceImageOrder": 100_000,
    "maxLowIndexFallback": 512,
    "maxMemoryBytes": 12 * 1024 * 1024 * 1024,
    "lightWorkers": 4,
    "heavyWorkers": 1,
    "maxWitnesses": 4096,
    "maxSphericalOrder": 100_000,
    "maxSubsets": 65_536,
    "timeoutSeconds": 120,
}


class InputError(ValueError):
    """Raised when a discovery request cannot be interpreted safely."""


class CatalogueLimit(RuntimeError):
    """Raised when a complete spherical catalogue exceeds a configured bound."""


@dataclass(frozen=True)
class IrreducibleType:
    name: str
    order: int


@dataclass(frozen=True)
class SphericalSubset:
    subset: tuple[int, ...]
    type_name: str
    expected_order: int


@dataclass(frozen=True)
class RuntimeCandidate:
    label: str
    kind: str
    command_prefix: tuple[str, ...]


STRATEGY_GAP = "gap-low-index"
STRATEGY_SAGE = "sage-congruence-kernel"
STRATEGY_FINITE_IMAGE = "sage-finite-image-coset"
STRATEGY_COMPOSITE = "everitt-composite"


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf8")).hexdigest()


def portable_discovery_value(value: Any) -> Any:
    """Tag JSON values so Python and TypeScript hash the same semantics."""
    if value is None:
        return ["null"]
    if isinstance(value, bool):
        return ["boolean", value]
    if isinstance(value, str):
        return ["string", value]
    if isinstance(value, (int, float)):
        numeric = float(value)
        if not math.isfinite(numeric):
            raise ValueError("Discovery artifacts cannot contain non-finite numbers")
        if numeric.is_integer() and abs(numeric) <= 9_007_199_254_740_991:
            return ["number", f"safe-integer:{int(numeric)}"]
        return ["number", f"binary64:{struct.pack('>d', numeric).hex()}"]
    if isinstance(value, list):
        return ["array", [portable_discovery_value(entry) for entry in value]]
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise ValueError("Discovery artifact object keys must be strings")
        entries = [
            [key, portable_discovery_value(value[key])]
            for key in sorted(value, key=lambda item: item.encode("utf8"))
        ]
        return ["object", entries]
    raise ValueError(f"Unsupported discovery artifact value {type(value).__name__}")


def portable_discovery_hash(value: Any) -> str:
    normalized = portable_discovery_value(value)
    text = json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return sha256_text(text)


def print_or_write(value: dict[str, Any], output: Path | None) -> None:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if output is None:
        sys.stdout.write(text)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf8")


def normalize_matrix_entry(value: Any, diagonal: bool) -> int:
    if value == "inf":
        if diagonal:
            raise InputError("Coxeter matrix diagonal entries must be 1")
        return 0
    if isinstance(value, bool) or not isinstance(value, int):
        raise InputError("Coxeter matrix entries must be integers or 'inf'")
    if diagonal and value != 1:
        raise InputError("Coxeter matrix diagonal entries must be 1")
    if not diagonal and value < 2:
        raise InputError("Off-diagonal Coxeter entries must be at least 2 or 'inf'")
    return value


def validate_source(value: Any) -> tuple[dict[str, Any], list[list[int]]]:
    if not isinstance(value, dict):
        raise InputError("sourceSystem must be a JSON object")
    rank = value.get("rank")
    if isinstance(rank, bool) or not isinstance(rank, int) or rank < 1:
        raise InputError("sourceSystem.rank must be a positive integer")
    matrix = value.get("coxeterMatrix")
    if not isinstance(matrix, list) or len(matrix) != rank:
        raise InputError("coxeterMatrix must have rank rows")
    normalized: list[list[int]] = []
    for i, row in enumerate(matrix):
        if not isinstance(row, list) or len(row) != rank:
            raise InputError(f"coxeterMatrix row {i} must have rank entries")
        normalized.append(
            [normalize_matrix_entry(entry, i == j) for j, entry in enumerate(row)]
        )
    for i in range(rank):
        for j in range(rank):
            if normalized[i][j] != normalized[j][i]:
                raise InputError(f"coxeterMatrix is not symmetric at ({i}, {j})")

    generators = value.get("generators")
    if generators is None:
        value = {
            **value,
            "generators": [{"id": f"s{i}", "label": f"s{i}"} for i in range(rank)],
        }
    elif not isinstance(generators, list) or len(generators) != rank:
        raise InputError("sourceSystem.generators must have rank entries")
    return value, normalized


def positive_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise InputError(f"{name} must be a positive integer")
    return value


def parse_request(
    text: str, cli_bounds: dict[str, int | None]
) -> tuple[dict[str, Any], list[list[int]], dict[str, int], dict[str, Any]]:
    try:
        request = json.loads(text)
    except json.JSONDecodeError as exc:
        raise InputError(f"Input is not valid JSON: {exc}") from exc
    if not isinstance(request, dict):
        raise InputError("Discovery input must be a JSON object")
    source_value = request.get("sourceSystem", request)
    source, matrix = validate_source(source_value)
    request_search = request.get("search", {})
    if not isinstance(request_search, dict):
        raise InputError("search must be an object when supplied")
    backend = request_search.get("backend", "auto")
    if backend not in {"auto", "gap", "sage"}:
        raise InputError("search.backend must be 'auto', 'gap', or 'sage'")
    bounds: dict[str, int] = {}
    for key, default in DEFAULT_BOUNDS.items():
        raw = cli_bounds.get(key)
        if raw is None:
            raw = request_search.get(key, default)
        bounds[key] = positive_int(raw, f"search.{key}")
    request = {**request, "search": {**request_search, "backend": backend}}
    return source, matrix, bounds, request


def connected_components(
    matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> list[list[int]]:
    remaining = set(subset)
    components: list[list[int]] = []
    while remaining:
        root = min(remaining)
        stack = [root]
        remaining.remove(root)
        component: list[int] = []
        while stack:
            current = stack.pop()
            component.append(current)
            neighbors = sorted(
                vertex for vertex in remaining if matrix[current][vertex] != 2
            )
            for neighbor in reversed(neighbors):
                remaining.remove(neighbor)
                stack.append(neighbor)
        components.append(sorted(component))
    return components


def component_edges(
    matrix: Sequence[Sequence[int]], component: Sequence[int]
) -> list[tuple[int, int, int]]:
    return [
        (left, right, matrix[left][right])
        for left, right in itertools.combinations(component, 2)
        if matrix[left][right] != 2
    ]


def path_edge_labels(
    matrix: Sequence[Sequence[int]], component: Sequence[int]
) -> tuple[int, ...] | None:
    edges = component_edges(matrix, component)
    if len(edges) != len(component) - 1:
        return None
    adjacency: dict[int, list[tuple[int, int]]] = {vertex: [] for vertex in component}
    for left, right, label in edges:
        adjacency[left].append((right, label))
        adjacency[right].append((left, label))
    if any(len(neighbors) > 2 for neighbors in adjacency.values()):
        return None
    endpoints = sorted(
        vertex for vertex, neighbors in adjacency.items() if len(neighbors) == 1
    )
    if len(endpoints) != 2:
        return None
    current = endpoints[0]
    previous: int | None = None
    labels: list[int] = []
    while True:
        candidates = [item for item in adjacency[current] if item[0] != previous]
        if not candidates:
            break
        next_vertex, label = candidates[0]
        labels.append(label)
        previous, current = current, next_vertex
    if len(labels) != len(component) - 1:
        return None
    forward = tuple(labels)
    reverse = tuple(reversed(labels))
    return min(forward, reverse)


def branch_arm_lengths(
    matrix: Sequence[Sequence[int]], component: Sequence[int]
) -> tuple[int, int, int] | None:
    edges = component_edges(matrix, component)
    if len(edges) != len(component) - 1 or any(label != 3 for _, _, label in edges):
        return None
    adjacency: dict[int, list[int]] = {vertex: [] for vertex in component}
    for left, right, _ in edges:
        adjacency[left].append(right)
        adjacency[right].append(left)
    centers = [vertex for vertex, neighbors in adjacency.items() if len(neighbors) == 3]
    if len(centers) != 1 or any(len(neighbors) > 3 for neighbors in adjacency.values()):
        return None
    center = centers[0]
    lengths: list[int] = []
    for first in adjacency[center]:
        length = 1
        previous, current = center, first
        while len(adjacency[current]) == 2:
            next_vertex = next(
                vertex for vertex in adjacency[current] if vertex != previous
            )
            previous, current = current, next_vertex
            length += 1
        if len(adjacency[current]) != 1:
            return None
        lengths.append(length)
    return tuple(sorted(lengths))  # type: ignore[return-value]


def classify_irreducible(
    matrix: Sequence[Sequence[int]], component: Sequence[int]
) -> IrreducibleType | None:
    rank = len(component)
    if rank == 1:
        return IrreducibleType("A1", 2)
    edges = component_edges(matrix, component)
    if any(label == 0 for _, _, label in edges):
        return None
    if rank == 2:
        if len(edges) != 1 or edges[0][2] < 3:
            return None
        m = edges[0][2]
        return IrreducibleType(f"I2({m})", 2 * m)

    labels = path_edge_labels(matrix, component)
    if labels is not None:
        if all(label == 3 for label in labels):
            return IrreducibleType(f"A{rank}", math.factorial(rank + 1))
        if (
            labels.count(4) == 1
            and labels[-1] == 4
            and all(label == 3 for label in labels[:-1])
        ):
            return IrreducibleType(f"B{rank}", (2**rank) * math.factorial(rank))
        if rank == 4 and labels == (3, 4, 3):
            return IrreducibleType("F4", 1152)
        if rank == 3 and labels == (3, 5):
            return IrreducibleType("H3", 120)
        if rank == 4 and labels == (3, 3, 5):
            return IrreducibleType("H4", 14_400)
        return None

    arms = branch_arm_lengths(matrix, component)
    if arms is None:
        return None
    if arms == (1, 1, rank - 3) and rank >= 4:
        return IrreducibleType(f"D{rank}", (2 ** (rank - 1)) * math.factorial(rank))
    exceptional = {
        (1, 2, 2): IrreducibleType("E6", 51_840),
        (1, 2, 3): IrreducibleType("E7", 2_903_040),
        (1, 2, 4): IrreducibleType("E8", 696_729_600),
    }
    return exceptional.get(arms)


def classify_spherical_subset(
    matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> SphericalSubset | None:
    components = connected_components(matrix, subset)
    types: list[IrreducibleType] = []
    for component in components:
        result = classify_irreducible(matrix, component)
        if result is None:
            return None
        types.append(result)
    return SphericalSubset(
        tuple(subset),
        " x ".join(result.name for result in types),
        math.prod(result.order for result in types),
    )


def maximal_spherical_subsets(
    matrix: Sequence[Sequence[int]], bounds: dict[str, int]
) -> list[SphericalSubset]:
    rank = len(matrix)
    subset_count = (1 << rank) - 1
    if subset_count > bounds["maxSubsets"]:
        raise CatalogueLimit(
            f"Complete spherical enumeration needs {subset_count} subsets, "
            f"above maxSubsets={bounds['maxSubsets']}"
        )
    spherical: list[SphericalSubset] = []
    for size in range(1, rank + 1):
        for subset in itertools.combinations(range(rank), size):
            result = classify_spherical_subset(matrix, subset)
            if result is not None:
                spherical.append(result)
    maximal = [
        result
        for result in spherical
        if not any(set(result.subset) < set(other.subset) for other in spherical)
    ]
    maximal.sort(key=lambda item: (item.subset, item.type_name))
    if not maximal:
        raise InputError("No maximal spherical subsets were found")
    oversized = [
        item for item in maximal if item.expected_order > bounds["maxSphericalOrder"]
    ]
    if oversized:
        details = ", ".join(
            f"{list(item.subset)}:{item.type_name} order {item.expected_order}"
            for item in oversized
        )
        raise CatalogueLimit(
            f"Exact GAP witness enumeration exceeds maxSphericalOrder="
            f"{bounds['maxSphericalOrder']}: {details}"
        )
    return maximal


def gap_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def gap_matrix(matrix: Sequence[Sequence[int]]) -> str:
    return "[" + ",".join("[" + ",".join(map(str, row)) + "]" for row in matrix) + "]"


def gap_data(
    matrix: Sequence[Sequence[int]],
    spherical: Sequence[SphericalSubset],
    bounds: dict[str, int],
    enable_modules: bool = False,
) -> str:
    index_divisor = math.lcm(*(item.expected_order for item in spherical))
    fallback_index = min(bounds["maxIndex"], bounds["maxLowIndexFallback"])
    direct_enabled = index_divisor <= fallback_index
    records = []
    for item in spherical:
        subset = ",".join(str(index + 1) for index in item.subset)
        records.append(
            "rec(subset:=["
            + subset
            + "],typeName:="
            + gap_string(item.type_name)
            + ",expectedOrder:="
            + str(item.expected_order)
            + ")"
        )
    return (
        "COXETER_TORSION_FREE_INPUT := rec(\n"
        f"  rank := {len(matrix)},\n"
        f"  coxeterMatrix := {gap_matrix(matrix)},\n"
        f"  maxIndex := {fallback_index},\n"
        f"  requestedMaxIndex := {bounds['maxIndex']},\n"
        f"  indexDivisor := {index_divisor},\n"
        f"  directSearchEnabled := {'true' if direct_enabled else 'false'},\n"
        f"  maxCandidates := {bounds['maxCandidates']},\n"
        f"  maxWitnesses := {bounds['maxWitnesses']},\n"
        "  moduleCatalogue := rec(\n"
        f"    enabled := {'true' if enable_modules else 'false'},\n"
        f"    maxIndex := {fallback_index},\n"
        f"    maxCandidates := {bounds['maxModuleCandidates']},\n"
        f"    maxModules := {bounds['maxModuleCandidates']}\n"
        "  ),\n"
        "  sphericalSubgroups := [\n    " + ",\n    ".join(records) + "\n  ]\n);;\n"
    )


def windows_path_to_wsl(path: Path) -> str:
    resolved = str(path.resolve()).replace("\\", "/")
    if len(resolved) >= 3 and resolved[1:3] == ":/":
        return f"/mnt/{resolved[0].lower()}/{resolved[3:]}"
    return resolved


def runtime_candidates(explicit_gap: str | None) -> list[RuntimeCandidate]:
    if explicit_gap:
        return [RuntimeCandidate(explicit_gap, "native", (explicit_gap,))]
    candidates: list[RuntimeCandidate] = []
    native = shutil.which("gap")
    if native:
        candidates.append(RuntimeCandidate(native, "native", (native,)))
    if os.name == "nt" and shutil.which("wsl"):
        candidates.extend(
            [
                RuntimeCandidate("wsl gap", "wsl", ("wsl", "gap")),
                RuntimeCandidate(
                    "wsl sage-environment gap",
                    "wsl",
                    ("wsl", DEFAULT_WSL_GAP),
                ),
            ]
        )
    return candidates


def runtime_command(
    candidate: RuntimeCandidate, data_path: Path, raw_path: Path
) -> list[str]:
    if candidate.kind == "wsl":
        script = windows_path_to_wsl(GAP_SCRIPT)
        data = windows_path_to_wsl(data_path)
        raw = windows_path_to_wsl(raw_path)
    else:
        script, data, raw = str(GAP_SCRIPT), str(data_path), str(raw_path)
    # GAP treats bare trailing arguments as input files. Define ARGV inside a
    # short startup expression so this works with both native GAP launchers and
    # Sage's bundled GAP executable.
    startup = (
        "ARGV := ["
        + ",".join(gap_string(value) for value in ["--data", data, "--raw-output", raw])
        + "];; Read("
        + gap_string(script)
        + ");;"
    )
    return [
        *candidate.command_prefix,
        "-q",
        "-c",
        startup,
    ]


def stable_command_label(command: Sequence[str]) -> str:
    rendered: list[str] = []
    for value in command:
        if "torsion-free-discovery-" in value or "sage-congruence-discovery-" in value:
            rendered.append("<temporary-path>")
        else:
            rendered.append(value)
    return " ".join(rendered)


def parse_int_list(raw: str) -> list[int]:
    if not raw:
        return []
    return [int(value) for value in raw.split(",") if value]


def parse_bool(raw: str) -> bool:
    if raw == "true":
        return True
    if raw == "false":
        return False
    raise ValueError(f"Invalid GAP boolean {raw!r}")


def parse_raw(path: Path) -> dict[str, Any]:
    parsed: dict[str, Any] = {
        "spherical": [],
        "witnesses": [],
        "actions": {},
        "relationChecks": [],
        "witnessChecks": {},
        "subgroupGenerators": {},
        "modules": {},
    }
    for line_number, line in enumerate(path.read_text(encoding="utf8").splitlines(), 1):
        parts = line.split("|")
        tag = parts[0]
        try:
            if tag == "GAP_VERSION":
                parsed["gapVersion"] = parts[1]
            elif tag == "BACKEND_VERSION":
                parsed["backendVersion"] = parts[1]
            elif tag == "BOUNDS":
                parsed["gapBounds"] = {
                    "maxIndex": int(parts[1]),
                    "maxCandidates": int(parts[2]),
                    "maxWitnesses": int(parts[3]),
                }
            elif tag == "SPHERICAL":
                parsed["spherical"].append(
                    {
                        "subset": parse_int_list(parts[1]),
                        "type": parts[2],
                        "order": int(parts[3]),
                    }
                )
            elif tag == "WITNESS":
                parsed["witnesses"].append(
                    {
                        "id": f"tw{int(parts[1])}",
                        "subset": parse_int_list(parts[2]),
                        "sphericalType": parts[3],
                        "sphericalOrder": int(parts[4]),
                        "primeOrder": int(parts[5]),
                        "classSize": int(parts[6]),
                        "word": parse_int_list(parts[7]),
                    }
                )
            elif tag == "CANDIDATE":
                # Only the final candidate can receive a passing certificate.
                # Discard action details from an earlier rejected candidate.
                parsed["actions"] = {}
                parsed["relationChecks"] = []
                parsed["witnessChecks"] = {}
                parsed["subgroupGenerators"] = {}
                parsed["candidate"] = {
                    "number": int(parts[1]),
                    "degree": int(parts[2]),
                    "iteratorCompleteAtCandidate": parse_bool(parts[3]),
                    "transitive": parse_bool(parts[4]),
                }
            elif tag == "ACTION":
                parsed["actions"][int(parts[1])] = parse_int_list(parts[2])
            elif tag == "ACTION_POINT":
                parsed["actions"].setdefault(int(parts[1]), {})[int(parts[2])] = int(
                    parts[3]
                )
            elif tag == "RELATION_CHECK":
                parsed["relationChecks"].append(
                    {
                        "kind": parts[1],
                        "generators": [int(parts[2]), int(parts[3])],
                        "exponent": int(parts[4]),
                        "passed": parse_bool(parts[5]),
                    }
                )
            elif tag == "WITNESS_CHECK":
                parsed["witnessChecks"][f"tw{int(parts[1])}"] = parse_int_list(parts[2])
            elif tag == "SUBGROUP_GENERATOR":
                parsed["subgroupGenerators"][int(parts[1])] = {
                    "expectedLength": int(parts[2]),
                    "letters": {},
                }
            elif tag == "SUBGROUP_GENERATOR_LETTER":
                record = parsed["subgroupGenerators"].setdefault(
                    int(parts[1]), {"expectedLength": 0, "letters": {}}
                )
                record["letters"][int(parts[2])] = int(parts[3])
            elif tag == "MODULE_BOUNDS":
                parsed["moduleBounds"] = {
                    "maxIndex": int(parts[1]),
                    "maxCandidates": int(parts[2]),
                    "maxModules": int(parts[3]),
                }
            elif tag == "MODULE":
                module_index = int(parts[1])
                parsed["modules"][module_index] = {
                    "id": f"pm{module_index}",
                    "sourceCandidate": int(parts[2]),
                    "degree": int(parts[3]),
                    "coverage": [f"tw{index}" for index in parse_int_list(parts[4])],
                    "fingerprint": parts[5],
                    "actions": {},
                    "witnessChecks": {},
                }
            elif tag == "MODULE_ACTION_POINT":
                module = parsed["modules"].setdefault(
                    int(parts[1]), {"actions": {}, "witnessChecks": {}}
                )
                module["actions"].setdefault(int(parts[2]), {})[int(parts[3])] = int(
                    parts[4]
                )
            elif tag == "MODULE_ACTION":
                module = parsed["modules"].setdefault(
                    int(parts[1]), {"actions": {}, "witnessChecks": {}}
                )
                module["actions"][int(parts[2])] = parse_int_list(parts[3])
            elif tag == "MODULE_WITNESS_CHECK":
                module = parsed["modules"].setdefault(
                    int(parts[1]), {"actions": {}, "witnessChecks": {}}
                )
                module["witnessChecks"][f"tw{int(parts[2])}"] = {
                    "fixedPointFree": parse_bool(parts[3]),
                    "fixedPointCount": int(parts[4]),
                }
            elif tag == "MODULE_CATALOGUE":
                parsed["moduleCatalogue"] = {
                    "candidatesChecked": int(parts[1]),
                    "maxIndex": int(parts[2]),
                    "maxCandidates": int(parts[3]),
                    "maxModules": int(parts[4]),
                    "iteratorComplete": parse_bool(parts[5]),
                    "reason": parts[6],
                    "uniqueCount": int(parts[7]),
                    "emittedCount": int(parts[8]),
                }
            elif tag == "SEARCH":
                parsed["search"] = {
                    "candidatesChecked": int(parts[1]),
                    "maxIndex": int(parts[2]),
                    "maxCandidates": int(parts[3]),
                    "iteratorComplete": parse_bool(parts[4]),
                    "reason": parts[5],
                }
            elif tag == "STATUS":
                parsed["status"] = {
                    "value": parts[1],
                    "code": parts[2],
                    "message": parts[3] if len(parts) > 3 else "",
                }
            elif tag:
                raise ValueError(f"Unknown line tag {tag!r}")
        except (IndexError, ValueError) as exc:
            raise ValueError(
                f"Invalid GAP output line {line_number}: {line!r}"
            ) from exc
    if "status" not in parsed:
        raise ValueError("GAP output did not contain a STATUS record")
    for generator, images in list(parsed["actions"].items()):
        if isinstance(images, dict):
            parsed["actions"][generator] = [images[index] for index in sorted(images)]
    subgroup_words = []
    for index in sorted(parsed["subgroupGenerators"]):
        record = parsed["subgroupGenerators"][index]
        word = [record["letters"][position] for position in sorted(record["letters"])]
        if len(word) != record["expectedLength"]:
            raise ValueError(f"Incomplete subgroup generator word {index}")
        subgroup_words.append(word)
    parsed["subgroupGenerators"] = subgroup_words
    modules = []
    for module_index in sorted(parsed["modules"]):
        module = parsed["modules"][module_index]
        actions = module.get("actions", {})
        module["actions"] = {
            generator: (
                list(points)
                if isinstance(points, list)
                else [points[index] for index in sorted(points)]
            )
            for generator, points in sorted(actions.items())
        }
        modules.append(module)
    parsed["modules"] = modules
    return parsed


def bfs_action(
    degree: int, actions: dict[int, list[int]], rank: int
) -> tuple[list[int], dict[int, str], dict[int, list[int]]]:
    if sorted(actions) != list(range(rank)):
        raise ValueError("GAP action did not contain every Coxeter generator")
    if any(len(images) != degree for images in actions.values()):
        raise ValueError("GAP action has an incomplete generator image list")
    queue = [0]
    old_to_word: dict[int, list[int]] = {0: []}
    cursor = 0
    while cursor < len(queue):
        point = queue[cursor]
        cursor += 1
        for generator in range(rank):
            target = actions[generator][point]
            if target not in old_to_word:
                old_to_word[target] = [*old_to_word[point], generator]
                queue.append(target)
    if len(queue) != degree:
        raise ValueError("Certified coset action is not transitive from its base point")
    old_to_id = {point: f"q{index}" for index, point in enumerate(queue)}
    return queue, old_to_id, old_to_word


def build_finite_action(source: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    candidate = raw.get("candidate")
    if not candidate:
        raise ValueError("Passing GAP result did not include a candidate")
    degree = candidate["degree"]
    rank = source["rank"]
    actions: dict[int, list[int]] = raw["actions"]
    order, old_to_id, old_to_word = bfs_action(degree, actions, rank)
    vertices = [
        {
            "id": f"q{index}",
            "representativeWord": old_to_word[old_point],
        }
        for index, old_point in enumerate(order)
    ]
    generator_actions = []
    edges = []
    for generator in range(rank):
        images = [old_to_id[actions[generator][old_point]] for old_point in order]
        generator_actions.append({"generator": generator, "images": images})
        label = source["generators"][generator].get("label", f"s{generator}")
        for source_index, target in enumerate(images):
            source_id = f"q{source_index}"
            edges.append(
                {
                    "id": f"qe:{source_id}:g{generator}:{target}",
                    "source": source_id,
                    "target": target,
                    "generator": generator,
                    "label": label,
                }
            )
    subgroup_generators = sorted(
        {tuple(word) for word in raw["subgroupGenerators"]},
        key=lambda word: (len(word), word),
    )
    return {
        "degree": degree,
        "vertices": vertices,
        "generatorActions": generator_actions,
        "edges": edges,
        "subgroupGenerators": [list(word) for word in subgroup_generators],
        "cosetConvention": "GAP FactorCosetAction; q0 is the subgroup base coset",
    }


def apply_action_word(
    actions: dict[int, list[int]], word: Sequence[int], point: int
) -> int:
    for generator in word:
        point = actions[generator][point]
    return point


def validate_action_table(
    matrix: Sequence[Sequence[int]], actions: dict[int, list[int]], degree: int
) -> list[dict[str, Any]]:
    rank = len(matrix)
    if sorted(actions) != list(range(rank)):
        raise ValueError("Permutation module does not contain every generator")
    expected_points = list(range(degree))
    checks: list[dict[str, Any]] = []
    for generator in range(rank):
        images = actions[generator]
        if len(images) != degree or sorted(images) != expected_points:
            raise ValueError(
                f"Generator {generator} is not a permutation of the module"
            )
        passed = all(images[images[point]] == point for point in expected_points)
        checks.append(
            {
                "kind": "involution",
                "generators": [generator, generator],
                "exponent": 2,
                "passed": passed,
            }
        )
    for left in range(rank):
        for right in range(left + 1, rank):
            m = matrix[left][right]
            if m == 0:
                continue
            word = [entry for _ in range(m) for entry in (left, right)]
            passed = all(
                apply_action_word(actions, word, point) == point
                for point in expected_points
            )
            checks.append(
                {
                    "kind": "coxeter",
                    "generators": [left, right],
                    "exponent": m,
                    "passed": passed,
                }
            )
    return checks


def exact_module_coverage(
    module: dict[str, Any],
    witnesses: Sequence[dict[str, Any]],
    matrix: Sequence[Sequence[int]],
) -> tuple[dict[str, Any], set[str]]:
    degree = int(module["degree"])
    actions = {int(key): list(value) for key, value in module["actions"].items()}
    relation_checks = validate_action_table(matrix, actions, degree)
    if not all(check["passed"] for check in relation_checks):
        raise ValueError(f"Permutation module {module['id']} fails a Coxeter relation")
    coverage: set[str] = set()
    witness_checks: dict[str, dict[str, Any]] = {}
    for witness in witnesses:
        fixed = [
            point
            for point in range(degree)
            if apply_action_word(actions, witness["word"], point) == point
        ]
        fixed_point_free = not fixed
        if fixed_point_free:
            coverage.add(witness["id"])
        witness_checks[witness["id"]] = {
            "fixedPointFree": fixed_point_free,
            "fixedPointCount": len(fixed),
        }
    return (
        {
            **module,
            "actions": actions,
            "coverage": sorted(coverage),
            "witnessChecks": witness_checks,
            "relationChecks": relation_checks,
        },
        coverage,
    )


def diagonal_product_orbit(
    modules: Sequence[dict[str, Any]], rank: int, degree_cap: int
) -> tuple[dict[int, list[int]], list[tuple[int, ...]]] | None:
    base = tuple(0 for _ in modules)
    points = [base]
    index_by_point = {base: 0}
    generator_images = {generator: [] for generator in range(rank)}
    cursor = 0
    while cursor < len(points):
        point = points[cursor]
        for generator in range(rank):
            image = tuple(
                module["actions"][generator][point[module_index]]
                for module_index, module in enumerate(modules)
            )
            target = index_by_point.get(image)
            if target is None:
                if len(points) >= degree_cap:
                    return None
                target = len(points)
                index_by_point[image] = target
                points.append(image)
            generator_images[generator].append(target)
        cursor += 1
    return generator_images, points


def find_composite_action_legacy(
    modules: Sequence[dict[str, Any]],
    witnesses: Sequence[dict[str, Any]],
    matrix: Sequence[Sequence[int]],
    bounds: dict[str, int],
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    target = {witness["id"] for witness in witnesses}
    valid_modules: list[dict[str, Any]] = []
    rejected: list[str] = []
    for module in modules:
        try:
            checked, coverage = exact_module_coverage(module, witnesses, matrix)
        except Exception as exc:  # noqa: BLE001 - external action boundary
            rejected.append(f"{module.get('id', 'unknown')}: {exc}")
            continue
        if coverage:
            valid_modules.append(checked)
    valid_modules.sort(
        key=lambda item: (
            item["degree"],
            -len(item["coverage"]),
            item["id"],
        )
    )

    combinations_checked = 0
    candidates: list[dict[str, Any]] = []
    max_factors = min(bounds["maxCompositeModules"], len(valid_modules))
    for factor_count in range(2, max_factors + 1):
        for combination in itertools.combinations(valid_modules, factor_count):
            combinations_checked += 1
            if combinations_checked > bounds["maxCompositeCombinations"]:
                break
            covered = set().union(*(set(module["coverage"]) for module in combination))
            if not target.issubset(covered):
                continue
            product = diagonal_product_orbit(
                combination,
                len(matrix),
                bounds["maxCongruenceImageOrder"],
            )
            if product is None:
                continue
            actions, tuples = product
            relation_checks = validate_action_table(matrix, actions, len(tuples))
            witness_checks = []
            if not all(check["passed"] for check in relation_checks):
                continue
            for witness in witnesses:
                fixed = [
                    point
                    for point in range(len(tuples))
                    if apply_action_word(actions, witness["word"], point) == point
                ]
                witness_checks.append(
                    {
                        "witnessId": witness["id"],
                        "word": witness["word"],
                        "primeOrder": witness["primeOrder"],
                        "fixedPoints": fixed,
                        "passed": not fixed,
                    }
                )
            if not all(check["passed"] for check in witness_checks):
                continue
            candidates.append(
                {
                    "id": "composite:"
                    + "+".join(module["id"] for module in combination),
                    "degree": len(tuples),
                    "actions": actions,
                    "tuples": tuples,
                    "modules": list(combination),
                    "coverage": sorted(covered),
                    "relationChecks": relation_checks,
                    "witnessChecks": witness_checks,
                    "cartesianDegreeBound": math.prod(
                        int(module["degree"]) for module in combination
                    ),
                }
            )
        if combinations_checked > bounds["maxCompositeCombinations"]:
            break
    candidates.sort(key=lambda item: (item["degree"], item["id"]))
    return (
        candidates[0] if candidates else None,
        {
            "modulesConsidered": len(valid_modules),
            "combinationsChecked": min(
                combinations_checked, bounds["maxCompositeCombinations"]
            ),
            "combinationCapReached": combinations_checked
            > bounds["maxCompositeCombinations"],
            "rejectedModules": rejected,
        },
    )


def find_composite_action(
    modules: Sequence[dict[str, Any]],
    witnesses: Sequence[dict[str, Any]],
    matrix: Sequence[Sequence[int]],
    bounds: dict[str, int],
    *,
    checkpoint_path: Path | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Search every bounded diagonal orbit with packed exact action rows.

    The retained legacy implementation above documents the old artifact
    boundary. The packed solver preserves that boundary while replacing its
    all-zero-orbit and Python-set bottlenecks.
    """

    return find_composite_action_packed(
        modules,
        witnesses,
        matrix,
        bounds,
        checkpoint_path=checkpoint_path,
        resume=True,
    )


def finite_action_from_permutations(
    source: dict[str, Any],
    actions: dict[int, list[int]],
    convention: str,
) -> dict[str, Any]:
    degree = len(actions[0])
    order, old_to_id, old_to_word = bfs_action(degree, actions, source["rank"])
    vertices = [
        {"id": f"q{index}", "representativeWord": old_to_word[old_point]}
        for index, old_point in enumerate(order)
    ]
    generator_actions = []
    edges = []
    for generator in range(source["rank"]):
        images = [old_to_id[actions[generator][old_point]] for old_point in order]
        generator_actions.append({"generator": generator, "images": images})
        label = source["generators"][generator].get("label", f"s{generator}")
        for source_index, target in enumerate(images):
            source_id = f"q{source_index}"
            edges.append(
                {
                    "id": f"qe:{source_id}:g{generator}:{target}",
                    "source": source_id,
                    "target": target,
                    "generator": generator,
                    "label": label,
                }
            )
    return {
        "degree": degree,
        "vertices": vertices,
        "generatorActions": generator_actions,
        "edges": edges,
        "cosetConvention": convention,
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


def add_artifact_hash(artifact: dict[str, Any]) -> dict[str, Any]:
    provenance = artifact.setdefault("provenance", {})
    provenance.pop("artifactHash", None)
    provenance.pop("portableArtifactHash", None)
    provenance["artifactHash"] = sha256_text(canonical_json(artifact))
    provenance["portableArtifactHash"] = portable_discovery_hash(artifact)
    return artifact


def index_lower_bound_record(
    spherical: Sequence[SphericalSubset],
) -> dict[str, Any]:
    value = math.lcm(*(item.expected_order for item in spherical))
    return {
        "value": str(value),
        "contributingSubgroupIds": [
            "T:" + ",".join(map(str, item.subset)) for item in spherical
        ],
    }


def spherical_catalogue_record(
    spherical: Sequence[SphericalSubset], method: str
) -> dict[str, Any]:
    return {
        "complete": True,
        "method": method,
        "maximalSubgroups": [
            {
                "subset": list(item.subset),
                "type": item.type_name,
                "order": item.expected_order,
            }
            for item in spherical
        ],
    }


def build_composite_artifact(
    source: dict[str, Any],
    matrix: Sequence[Sequence[int]],
    input_hash: str,
    bounds: dict[str, int],
    spherical: Sequence[SphericalSubset],
    raw: dict[str, Any],
    runtime: RuntimeCandidate,
) -> dict[str, Any] | None:
    witnesses = sorted(
        raw.get("witnesses", []),
        key=lambda item: (
            item["subset"],
            item["primeOrder"],
            len(item["word"]),
            item["word"],
            item["id"],
        ),
    )
    if not witnesses or not raw.get("modules"):
        return None
    composite_bounds = {
        **bounds,
        "torsionFreeDegreeDivisor": math.lcm(
            *(item.expected_order for item in spherical)
        ),
        "maxPackedCompositeBytes": min(
            bounds["maxMemoryBytes"] // 3,
            2 * 1024 * 1024 * 1024,
        ),
    }
    checkpoint_key = sha256_text(
        canonical_json(
            {
                "solver": "packed-composite-v1",
                "bounds": {
                    key: composite_bounds[key]
                    for key in (
                        "torsionFreeDegreeDivisor",
                        "maxPackedCompositeBytes",
                        "maxCompositeCombinations",
                        "maxCompositeModules",
                        "maxCongruenceImageOrder",
                    )
                },
                "modules": [
                    {
                        "id": module.get("id"),
                        "degree": module.get("degree"),
                        "fingerprint": module.get("fingerprint"),
                    }
                    for module in raw["modules"]
                ],
                "witnessIds": [witness["id"] for witness in witnesses],
            }
        )
    )
    checkpoint_path = (
        Path(os.environ.get("COXETER_DISCOVERY_CACHE", Path.home() / ".cache"))
        / "coxeter-viewer-5d"
        / "torsion-free"
        / input_hash
        / f"packed-composite-{checkpoint_key}.json"
    )
    composite, diagnostics = find_composite_action(
        raw["modules"],
        witnesses,
        matrix,
        composite_bounds,
        checkpoint_path=checkpoint_path,
    )
    if composite is None:
        return None
    artifact = base_artifact(source, input_hash, bounds, "passed", True)
    artifact["sphericalCatalogue"] = spherical_catalogue_record(
        spherical,
        "complete-finite-coxeter-classification+gap-prime-order-classes",
    )
    artifact["indexLowerBound"] = index_lower_bound_record(spherical)
    artifact["torsionWitnesses"] = witnesses
    artifact["finiteAction"] = finite_action_from_permutations(
        source,
        composite["actions"],
        "Designated orbit of Everitt's diagonal product; q0 is the tuple of component base cosets",
    )
    artifact["search"] = {
        "method": "Everitt diagonal product of bounded GAP permutation modules",
        "selectedStrategy": STRATEGY_COMPOSITE,
        "candidatesChecked": diagnostics["combinationsChecked"],
        "maxIndex": bounds["maxIndex"],
        "maxCandidates": bounds["maxCompositeCombinations"],
        "iteratorComplete": not diagnostics["combinationCapReached"],
        "reason": "certified-composite-action",
    }
    artifact["composite"] = {
        "moduleIds": [module["id"] for module in composite["modules"]],
        "moduleDegrees": [module["degree"] for module in composite["modules"]],
        "cartesianDegreeBound": composite["cartesianDegreeBound"],
        "orbitDegree": composite["degree"],
        "coveredWitnessIds": composite["coverage"],
        **diagnostics,
    }
    artifact["certificate"] = {
        "status": "passed",
        "criterion": "tits-prime-order-fixed-point",
        "completeTorsionWitnessCatalogue": True,
        "transitive": True,
        "noFixedPointChecks": [
            {
                "witnessId": check["witnessId"],
                "word": check["word"],
                "primeOrder": check["primeOrder"],
                "fixedVertexIds": [f"q{point}" for point in check["fixedPoints"]],
                "passed": check["passed"],
            }
            for check in composite["witnessChecks"]
        ],
        "coxeterRelationChecks": composite["relationChecks"],
        "claims": ["finite-index", "torsion-free"],
        "nonClaims": [
            "normal subgroup",
            "minimal index",
            "manifold",
            "virtual algebraic fibering",
        ],
        "explanation": (
            "Each prime-order torsion class is fixed-point-free in at least one "
            "factor. The selected diagonal orbit was then checked directly for "
            "transitivity, Coxeter relations, and absence of every witness."
        ),
    }
    artifact["provenance"] = {
        "backend": COMPOSITE_BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "gapVersion": raw.get("gapVersion", "unknown"),
        "runtime": runtime.kind,
        "runtimeLabel": runtime.label,
        "command": stable_command_label(raw.get("executedCommand", [])),
        "inputHash": input_hash,
    }
    return add_artifact_hash(artifact)


def skipped_artifact(
    source: dict[str, Any],
    input_hash: str,
    bounds: dict[str, int],
    backend: str,
    reason: str,
) -> dict[str, Any]:
    artifact = base_artifact(source, input_hash, bounds, "skipped", True)
    artifact["warnings"].append(reason)
    artifact["provenance"] = {
        "backend": GAP_BACKEND_ID if backend == "gap" else SAGE_BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "runtime": "unavailable",
        "command": "python scripts/torsion_free_discovery.py",
        "inputHash": input_hash,
    }
    return add_artifact_hash(artifact)


def build_artifact(
    source: dict[str, Any],
    input_hash: str,
    bounds: dict[str, int],
    spherical: Sequence[SphericalSubset],
    raw: dict[str, Any],
    runtime: RuntimeCandidate,
    command: Sequence[str],
) -> dict[str, Any]:
    status = raw["status"]["value"]
    if status not in {"passed", "failed", "exhausted"}:
        raise ValueError(f"Unsupported GAP status {status!r}")
    artifact = base_artifact(source, input_hash, bounds, status, status != "failed")
    artifact["sphericalCatalogue"] = spherical_catalogue_record(
        spherical,
        "complete-finite-coxeter-classification+gap-prime-order-classes",
    )
    artifact["indexLowerBound"] = index_lower_bound_record(spherical)
    witnesses = sorted(
        raw["witnesses"],
        key=lambda item: (
            item["subset"],
            item["primeOrder"],
            len(item["word"]),
            item["word"],
            item["id"],
        ),
    )
    artifact["torsionWitnesses"] = witnesses
    artifact["search"] = {
        "method": "LowIndexSubgroupsFpGroupIterator",
        **raw.get(
            "search",
            {
                "candidatesChecked": 0,
                "maxIndex": bounds["maxIndex"],
                "maxCandidates": bounds["maxCandidates"],
                "iteratorComplete": False,
                "reason": raw["status"]["code"],
            },
        ),
    }
    artifact["search"]["selectedStrategy"] = STRATEGY_GAP
    artifact["provenance"] = {
        "backend": GAP_BACKEND_ID,
        "backendVersion": raw.get("backendVersion", BACKEND_VERSION),
        "gapVersion": raw.get("gapVersion", "unknown"),
        "runtime": runtime.kind,
        "runtimeLabel": runtime.label,
        "command": stable_command_label(command),
        "inputHash": input_hash,
    }

    if status == "passed":
        finite_action = build_finite_action(source, raw)
        _, remap, _ = bfs_action(
            finite_action["degree"], raw["actions"], source["rank"]
        )
        no_fixed_point_checks = []
        all_fixed_point_free = True
        for witness in witnesses:
            fixed = raw["witnessChecks"].get(witness["id"])
            if fixed is None:
                raise ValueError(f"Missing fixed-point check for {witness['id']}")
            fixed_ids = [remap.get(point, f"gap-point:{point}") for point in fixed]
            passed = len(fixed_ids) == 0
            all_fixed_point_free = all_fixed_point_free and passed
            no_fixed_point_checks.append(
                {
                    "witnessId": witness["id"],
                    "word": witness["word"],
                    "primeOrder": witness["primeOrder"],
                    "fixedVertexIds": fixed_ids,
                    "passed": passed,
                }
            )
        relation_checks = raw["relationChecks"]
        relations_passed = bool(relation_checks) and all(
            check["passed"] for check in relation_checks
        )
        transitive = bool(raw["candidate"]["transitive"])
        certificate_passed = (
            bool(witnesses) and all_fixed_point_free and relations_passed and transitive
        )
        if not certificate_passed:
            artifact["status"] = "failed"
            artifact["ok"] = False
            artifact["errors"].append(
                "GAP reported a candidate, but the independent action certificate did not pass"
            )
        else:
            artifact["finiteAction"] = finite_action
        artifact["certificate"] = {
            "status": "passed" if certificate_passed else "failed",
            "criterion": "tits-prime-order-fixed-point",
            "theoremBasis": [
                "Tits torsion theorem for Coxeter groups",
                "prime-order reduction in finite cyclic subgroups",
                "coset fixed point iff a conjugate lies in the stabilizer",
            ],
            "completeTorsionWitnessCatalogue": True,
            "transitive": transitive,
            "noFixedPointChecks": no_fixed_point_checks,
            "coxeterRelationChecks": relation_checks,
            "claims": ["finite-index", "torsion-free"] if certificate_passed else [],
            "nonClaims": [
                "normal subgroup",
                "minimal index",
                "manifold",
                "virtual algebraic fibering",
            ],
            "explanation": (
                "Every prime-order conjugacy-class witness from every maximal "
                "spherical special subgroup acts without a fixed coset. By Tits' "
                "torsion theorem, the point stabilizer is torsion-free."
            ),
        }
    elif status == "exhausted":
        artifact["warnings"].append(raw["status"]["message"])
    else:
        artifact["errors"].append(raw["status"]["message"])
    return add_artifact_hash(artifact)


def run_gap(
    data_text: str,
    timeout_seconds: int,
    explicit_gap: str | None,
) -> tuple[str, dict[str, Any] | None, RuntimeCandidate | None, list[str], list[str]]:
    attempts: list[str] = []
    errors: list[str] = []
    executed_runtime = False
    candidates = runtime_candidates(explicit_gap)
    if not candidates:
        return (
            "skipped",
            None,
            None,
            attempts,
            ["No native GAP or WSL runtime was found"],
        )
    with tempfile.TemporaryDirectory(prefix="torsion-free-discovery-") as directory:
        temp = Path(directory)
        data_path = temp / "input.g"
        raw_path = temp / "raw.txt"
        data_path.write_text(data_text, encoding="utf8")
        for candidate in candidates:
            raw_path.unlink(missing_ok=True)
            command = runtime_command(candidate, data_path, raw_path)
            attempts.append(stable_command_label(command))
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    check=False,
                )
            except FileNotFoundError:
                errors.append(f"Runtime not found: {candidate.label}")
                continue
            except subprocess.TimeoutExpired:
                return (
                    "timeout",
                    None,
                    candidate,
                    attempts,
                    [f"GAP search exceeded {timeout_seconds} seconds"],
                )
            if completed.returncode not in {127, 9009, 4_294_967_295}:
                executed_runtime = True
            if raw_path.exists():
                try:
                    raw = parse_raw(raw_path)
                except Exception as exc:  # noqa: BLE001 - external protocol boundary
                    errors.append(f"{candidate.label}: {exc}")
                else:
                    raw["executedCommand"] = command
                    if completed.returncode != 0 and raw["status"]["value"] not in {
                        "failed"
                    }:
                        errors.append(
                            f"{candidate.label} exited {completed.returncode}: "
                            f"{completed.stderr.strip() or completed.stdout.strip()}"
                        )
                        continue
                    return raw["status"]["value"], raw, candidate, attempts, errors
            detail = completed.stderr.strip() or completed.stdout.strip()
            errors.append(
                f"{candidate.label} exited {completed.returncode} without structured output"
                + (f": {detail}" if detail else "")
            )
    return ("failed" if executed_runtime else "skipped"), None, None, attempts, errors


def sage_runtime_candidates(explicit_sage: str | None) -> list[RuntimeCandidate]:
    if explicit_sage:
        return [RuntimeCandidate(explicit_sage, "native", (explicit_sage,))]
    candidates: list[RuntimeCandidate] = []
    native = shutil.which("sage")
    if native:
        candidates.append(RuntimeCandidate(native, "native", (native,)))
    if os.name == "nt" and shutil.which("wsl"):
        candidates.extend(
            [
                RuntimeCandidate("wsl sage", "wsl", ("wsl", "sage")),
                RuntimeCandidate(
                    "wsl Sage environment",
                    "wsl",
                    ("wsl", DEFAULT_WSL_SAGE),
                ),
            ]
        )
    return candidates


def sage_runtime_command(
    candidate: RuntimeCandidate,
    request_path: Path,
    output_path: Path,
    bounds: dict[str, int],
) -> list[str]:
    if candidate.kind == "wsl":
        script = windows_path_to_wsl(SAGE_SCRIPT)
        request = windows_path_to_wsl(request_path)
        output = windows_path_to_wsl(output_path)
    else:
        script, request, output = (
            str(SAGE_SCRIPT),
            str(request_path),
            str(output_path),
        )
    script_args = [
        script,
        "--input",
        request,
        "--output",
        output,
        "--max-candidates",
        str(bounds["maxCandidates"]),
        "--max-witnesses",
        str(bounds["maxWitnesses"]),
        "--max-spherical-order",
        str(bounds["maxSphericalOrder"]),
        "--max-subsets",
        str(bounds["maxSubsets"]),
        "--timeout",
        str(bounds["timeoutSeconds"]),
        "--max-prime",
        str(bounds["maxCongruencePrime"]),
        "--max-image-order",
        str(bounds["maxCongruenceImageOrder"]),
    ]
    startup = (
        "import runpy,sys; "
        f"sys.argv={json.dumps(script_args)}; "
        f"runpy.run_path({json.dumps(script)}, run_name='__main__')"
    )
    return [*candidate.command_prefix, "-c", startup]


def run_sage(
    request_text: str,
    bounds: dict[str, int],
    explicit_sage: str | None,
) -> tuple[str, dict[str, Any] | None, RuntimeCandidate | None, list[str], list[str]]:
    attempts: list[str] = []
    errors: list[str] = []
    executed_runtime = False
    candidates = sage_runtime_candidates(explicit_sage)
    if not candidates:
        return (
            "skipped",
            None,
            None,
            attempts,
            ["No native Sage or WSL runtime was found"],
        )
    with tempfile.TemporaryDirectory(prefix="sage-congruence-discovery-") as directory:
        temp = Path(directory)
        request_path = temp / "request.json"
        artifact_path = temp / "artifact.json"
        request_path.write_text(request_text, encoding="utf8")
        for candidate in candidates:
            artifact_path.unlink(missing_ok=True)
            command = sage_runtime_command(
                candidate, request_path, artifact_path, bounds
            )
            attempts.append(stable_command_label(command))
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=bounds["timeoutSeconds"],
                    check=False,
                )
            except FileNotFoundError:
                errors.append(f"Runtime not found: {candidate.label}")
                continue
            except subprocess.TimeoutExpired:
                return (
                    "timeout",
                    None,
                    candidate,
                    attempts,
                    [
                        f"Sage congruence search exceeded {bounds['timeoutSeconds']} seconds"
                    ],
                )
            if completed.returncode not in {127, 9009, 4_294_967_295}:
                executed_runtime = True
            if artifact_path.is_file():
                try:
                    artifact = json.loads(artifact_path.read_text(encoding="utf8"))
                except Exception as exc:  # noqa: BLE001 - external protocol boundary
                    errors.append(f"{candidate.label}: invalid Sage artifact: {exc}")
                    continue
                status = artifact.get("status")
                if status not in {
                    "passed",
                    "failed",
                    "exhausted",
                    "skipped",
                    "timeout",
                }:
                    errors.append(
                        f"{candidate.label}: unsupported Sage status {status!r}"
                    )
                    continue
                artifact.setdefault("provenance", {})["runtime"] = candidate.kind
                artifact["provenance"]["runtimeLabel"] = candidate.label
                artifact["provenance"]["command"] = stable_command_label(command)
                return status, artifact, candidate, attempts, errors
            detail = completed.stderr.strip() or completed.stdout.strip()
            errors.append(
                f"{candidate.label} exited {completed.returncode} without an artifact"
                + (f": {detail}" if detail else "")
            )
    return ("failed" if executed_runtime else "skipped"), None, None, attempts, errors


def primes_through(limit: int) -> list[int]:
    """Return the rational primes used as independent congruence probes."""

    primes: list[int] = []
    for value in range(2, limit + 1):
        if all(value % divisor for divisor in range(2, math.isqrt(value) + 1)):
            primes.append(value)
    return primes


def spherical_orbit_checks(
    actions: dict[int, list[int]],
    degree: int,
    spherical: Sequence[SphericalSubset],
) -> list[dict[str, Any]]:
    """Independently check that every finite parabolic acts freely.

    A restricted orbit for ``W_T`` has at most ``|W_T|`` points. It has exactly
    that size precisely when its point stabilizer in ``W_T`` is trivial. This
    avoids enumerating a permutation subgroup while retaining the exact
    spherical-freeness criterion used by the TypeScript verifier.
    """

    checks: list[dict[str, Any]] = []
    for item in spherical:
        unseen = set(range(degree))
        orbit_sizes: list[int] = []
        while unseen:
            root = min(unseen)
            queue = [root]
            unseen.remove(root)
            cursor = 0
            while cursor < len(queue):
                point = queue[cursor]
                cursor += 1
                for generator in item.subset:
                    target = actions[generator][point]
                    if target in unseen:
                        unseen.remove(target)
                        queue.append(target)
            orbit_sizes.append(len(queue))
        passed = bool(orbit_sizes) and all(
            size == item.expected_order for size in orbit_sizes
        )
        checks.append(
            {
                "subset": list(item.subset),
                "type": item.type_name,
                "expectedOrder": item.expected_order,
                "orbitCount": len(orbit_sizes),
                "minimumOrbitSize": min(orbit_sizes, default=0),
                "maximumOrbitSize": max(orbit_sizes, default=0),
                "passed": passed,
            }
        )
    return checks


def passing_action_rows(raw: dict[str, Any]) -> tuple[int, dict[int, list[int]]]:
    passing = raw.get("passingAction")
    if not isinstance(passing, dict):
        raise ValueError("Finite-image backend did not provide a passing action")
    degree = positive_int(passing.get("degree"), "passingAction.degree")
    rows = passing.get("generatorActions")
    if not isinstance(rows, list):
        raise ValueError(
            "Passing action was not materialized as JSON; certification cannot continue"
        )
    actions: dict[int, list[int]] = {}
    for index, row in enumerate(rows):
        if isinstance(row, dict):
            generator = positive_or_zero_int(
                row.get("generator"), f"generatorActions[{index}].generator"
            )
            images = row.get("images")
        else:
            generator = index
            images = row
        if not isinstance(images, list) or any(
            isinstance(value, bool) or not isinstance(value, int) for value in images
        ):
            raise ValueError(f"generatorActions[{index}] is not an integer row")
        actions[generator] = images
    return degree, actions


def positive_or_zero_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a nonnegative integer")
    return value


def independently_certify_action(
    matrix: Sequence[Sequence[int]],
    spherical: Sequence[SphericalSubset],
    witnesses: Sequence[dict[str, Any]],
    actions: dict[int, list[int]],
    degree: int,
) -> dict[str, Any]:
    """Recheck an external candidate without trusting backend pass flags."""

    relation_checks = validate_action_table(matrix, actions, degree)
    order, _, _ = bfs_action(degree, actions, len(matrix))
    transitive = len(order) == degree
    witness_checks: list[dict[str, Any]] = []
    for witness in witnesses:
        fixed = [
            point
            for point in range(degree)
            if apply_action_word(actions, witness["word"], point) == point
        ]
        witness_checks.append(
            {
                "witnessId": witness["id"],
                "word": witness["word"],
                "primeOrder": witness["primeOrder"],
                "fixedVertexIds": [f"q{point}" for point in fixed],
                "passed": not fixed,
            }
        )
    parabolic_checks = spherical_orbit_checks(actions, degree, spherical)
    witness_diagnostics_passed = bool(witnesses) and all(
        check["passed"] for check in witness_checks
    )
    # Freeness of every restricted maximal-spherical action is a complete Tits
    # criterion. Witnesses guide the search and provide a second audit, but an
    # externally generated witness catalogue is not the root certificate.
    passed = (
        transitive
        and all(check["passed"] for check in relation_checks)
        and bool(parabolic_checks)
        and all(check["passed"] for check in parabolic_checks)
    )
    return {
        "passed": passed,
        "witnessDiagnosticsPassed": witness_diagnostics_passed,
        "transitive": transitive,
        "coxeterRelationChecks": relation_checks,
        "noFixedPointChecks": witness_checks,
        "sphericalOrbitChecks": parabolic_checks,
    }


def independently_validate_kernel_cover(
    raw: dict[str, Any],
    spherical: Sequence[SphericalSubset],
    expected_matrix_digest: str | None = None,
) -> dict[str, Any]:
    """Validate a congruence-kernel certificate without constructing its action.

    This checks the certificate envelope and every maximal-spherical image order.
    It does not make the enormous regular Q-action available to the viewer.
    """

    if raw.get("status") != "passed" or raw.get("normal") is not True:
        raise ValueError("Kernel cover must be a passed normal-subgroup certificate")
    declared_level = raw.get("certificateLevel")
    legacy_exact = declared_level is None and raw.get("indexDecimal") is not None
    level = EXACT_INDEX_KERNEL_LEVEL if legacy_exact else declared_level
    if level not in {FINITE_INDEX_KERNEL_LEVEL, EXACT_INDEX_KERNEL_LEVEL}:
        raise ValueError("Kernel cover has an unsupported certificate level")
    expected_index_status = "exact" if level == EXACT_INDEX_KERNEL_LEVEL else "unknown"
    if not legacy_exact and raw.get("indexStatus") != expected_index_status:
        raise ValueError("Kernel cover level and index status disagree")
    if not legacy_exact and (
        raw.get("certificateType") != "normal-congruence-kernel"
        or raw.get("subgroupKind") != "normal-congruence-kernel"
        or raw.get("torsionFree") is not True
    ):
        raise ValueError("Kernel cover type metadata is incomplete")

    certificate = raw.get("certificate")
    if not isinstance(certificate, dict):
        raise ValueError("Kernel cover certificate is missing")
    if certificate.get("criterion") != "tits-maximal-spherical-injective-kernel":
        raise ValueError("Kernel cover uses an unsupported torsion criterion")
    checks = certificate.get("sphericalRestrictionChecks")
    if not isinstance(checks, list):
        raise ValueError("Kernel cover has no spherical restriction checks")
    expected = {
        "T:" + ",".join(map(str, item.subset)): item for item in spherical
    }
    observed: dict[str, int] = {}
    for check in checks:
        if not isinstance(check, dict) or check.get("injective") is not True:
            raise ValueError("Kernel cover contains a failed spherical restriction")
        identifier = str(check.get("id", ""))
        expected_item = expected.get(identifier)
        if expected_item is None:
            raise ValueError("Kernel cover contains an unknown spherical restriction")
        subset = check.get("subset")
        expected_order = int(check.get("expectedOrder", 0))
        image_order = int(check.get("imageOrder", 0))
        if identifier in observed:
            raise ValueError("Kernel cover repeats a spherical restriction")
        if (
            subset != list(expected_item.subset)
            or expected_order != expected_item.expected_order
            or image_order != expected_item.expected_order
        ):
            raise ValueError("Kernel cover spherical restriction data is inconsistent")
        observed[identifier] = image_order
    if set(observed) != set(expected):
        raise ValueError("Kernel cover spherical catalogue is incomplete or stale")
    relation_checks = certificate.get("relationChecks")
    if (
        not isinstance(relation_checks, list)
        or not relation_checks
        or any(
            not isinstance(check, dict) or check.get("passed") is not True
            for check in relation_checks
        )
    ):
        raise ValueError("Kernel cover Coxeter relation checks are incomplete")
    claimed_hash = raw.get("certificateSha256")
    unhashed = {key: value for key, value in raw.items() if key != "certificateSha256"}
    actual_hash = sha256_text(canonical_json(unhashed))
    if claimed_hash != actual_hash:
        raise ValueError("Kernel cover certificate hash is stale")
    finite_image = raw.get("sourceFiniteImage")
    if not isinstance(finite_image, dict):
        raise ValueError("Kernel cover finite-image metadata is missing")
    candidate_id = str(finite_image.get("candidateId", "")).strip()
    characteristic = int(finite_image.get("characteristic", 0))
    field_order = int(finite_image.get("fieldOrder", 0))
    if not candidate_id or characteristic < 2 or field_order < characteristic:
        raise ValueError("Kernel cover finite-image metadata is invalid")
    remainder = field_order
    while remainder > 1 and remainder % characteristic == 0:
        remainder //= characteristic
    if remainder != 1:
        raise ValueError("Kernel cover residue-field order is not a prime power")

    matrix_digest = str(finite_image.get("matrixDigest", ""))
    if expected_matrix_digest is not None and matrix_digest != expected_matrix_digest:
        raise ValueError("Kernel cover source Coxeter matrix hash is stale")

    ambient = finite_image.get("ambientFiniteGroup")
    representation_dimension: int | None = None
    upper_bound: int | None = None
    ambient_hash: str | None = None
    if isinstance(ambient, dict):
        if (
            ambient.get("family") != "general-linear"
            or ambient.get("finitenessStatus") != "exact-finite-ambient"
        ):
            raise ValueError("Kernel cover uses an unsupported finite matrix ambient")
        representation_dimension = int(ambient.get("dimension", 0))
        ambient_field_order = int(str(ambient.get("fieldOrderDecimal", "0")))
        if representation_dimension < 1 or ambient_field_order != field_order:
            raise ValueError("Kernel cover finite matrix ambient is inconsistent")
        q_to_n = field_order**representation_dimension
        expected_upper_bound = math.prod(
            q_to_n - field_order**power
            for power in range(representation_dimension)
        )
        upper_bound = int(str(ambient.get("orderUpperBoundDecimal", "0")))
        if upper_bound != expected_upper_bound:
            raise ValueError("Kernel cover finite ambient order bound is incorrect")
        ambient_hash = str(ambient.get("metadataSha256", ""))
        unhashed_ambient = {
            key: value for key, value in ambient.items() if key != "metadataSha256"
        }
        if ambient_hash != sha256_text(canonical_json(unhashed_ambient)):
            raise ValueError("Kernel cover finite ambient hash is stale")
    elif not legacy_exact:
        raise ValueError("Kernel cover finite matrix ambient is missing")

    lower_bound = math.lcm(*(item.expected_order for item in spherical))
    index_evidence = raw.get("indexEvidence")
    if isinstance(index_evidence, dict):
        if (
            index_evidence.get("status") != expected_index_status
            or int(str(index_evidence.get("divisibilityLowerBoundDecimal", "0")))
            != lower_bound
            or upper_bound is None
            or int(str(index_evidence.get("finiteUpperBoundDecimal", "0")))
            != upper_bound
            or index_evidence.get("upperBoundSource")
            != "ambient-general-linear-group"
        ):
            raise ValueError("Kernel cover index evidence is inconsistent")
    elif not legacy_exact:
        raise ValueError("Kernel cover index evidence is missing")

    proof_hashes = certificate.get("proofHashes")
    if isinstance(proof_hashes, dict):
        spherical_records = [
            {
                "id": "T:" + ",".join(map(str, item.subset)),
                "subset": list(item.subset),
                "type": item.type_name,
                "order": item.expected_order,
            }
            for item in spherical
        ]
        ordered_generator_hash = str(
            finite_image.get("orderedGeneratorActionSha256", "")
        )
        expected_hashes = {
            "sourceCoxeterMatrixSha256": matrix_digest,
            "orderedFiniteImageGeneratorsSha256": ordered_generator_hash,
            "relationChecksSha256": sha256_text(canonical_json(relation_checks)),
            "maximalSphericalCatalogueSha256": sha256_text(
                canonical_json(spherical_records)
            ),
            "sphericalRestrictionChecksSha256": sha256_text(
                canonical_json(checks)
            ),
            "ambientFiniteGroupSha256": ambient_hash,
        }
        if proof_hashes != expected_hashes:
            raise ValueError("Kernel cover proof hashes are stale")
        if certificate.get("sphericalDigest") != expected_hashes[
            "maximalSphericalCatalogueSha256"
        ]:
            raise ValueError("Kernel cover spherical catalogue hash is stale")
    elif not legacy_exact:
        raise ValueError("Kernel cover proof hashes are missing")

    index: int | None = None
    if level == EXACT_INDEX_KERNEL_LEVEL:
        index = int(str(raw.get("indexDecimal", "0")))
        image_order = int(
            str(
                finite_image.get(
                    "imageOrderDecimal", index if legacy_exact else "0"
                )
            )
        )
        if index < 1 or image_order != index:
            raise ValueError("Kernel cover exact index and image order disagree")
        if index % lower_bound != 0:
            raise ValueError("Kernel cover exact index violates the spherical divisor")
        if upper_bound is not None and (
            index > upper_bound or upper_bound % index != 0
        ):
            raise ValueError("Kernel cover exact index is incompatible with its ambient")
        if isinstance(index_evidence, dict) and int(
            str(index_evidence.get("exactDecimal", "0"))
        ) != index:
            raise ValueError("Kernel cover exact index evidence disagrees")
    elif raw.get("indexDecimal") is not None or finite_image.get(
        "imageOrderDecimal"
    ) is not None:
        raise ValueError("An unknown-index kernel certificate overclaims an exact index")

    materialization = raw.get("materialization")
    if not isinstance(materialization, dict):
        raise ValueError("Kernel cover materialization boundary is missing")
    degree_bound = int(materialization.get("currentDegreeBound", 0))
    reason = str(materialization.get("reason", "")).strip()
    if degree_bound < 1 or not reason:
        raise ValueError("Kernel cover materialization boundary is invalid")

    normalized_checks = [
        {
            "subset": list(check["subset"]),
            "expectedOrder": str(int(check["expectedOrder"])),
            "imageOrder": str(int(check["imageOrder"])),
            "passed": True,
        }
        for check in checks
    ]
    normalized: dict[str, Any] = {
        "status": "passed",
        "kind": "normal-congruence-kernel",
        "normal": True,
        "torsionFree": True,
        "certificateLevel": level,
        "indexStatus": expected_index_status,
        "finiteImage": {
            "candidateId": candidate_id,
            "characteristic": characteristic,
            "residueFieldOrder": str(field_order),
            "finiteTargetCertified": True,
            "orderStatus": expected_index_status,
        },
        "criterion": "tits-maximal-spherical-injective-reduction",
        "completeSphericalRestrictionChecks": True,
        "sphericalImageChecks": normalized_checks,
        "materialization": {
            "status": (
                "too-large"
                if index is not None and index > degree_bound
                else "not-materialized"
            ),
            "reason": reason,
            "maximumMaterializedDegree": degree_bound,
        },
        "claims": ["finite-index", "normal", "torsion-free"],
        "nonClaims": [
            "smallest torsion-free index",
            "materialized quotient complex",
            "virtual algebraic fibering",
        ],
        "sourceCertificateSha256": claimed_hash,
        "sourceCriterion": certificate["criterion"],
    }
    if upper_bound is not None:
        normalized["indexBounds"] = {
            "divisibilityLowerBound": str(lower_bound),
            "finiteUpperBound": str(upper_bound),
            "upperBoundSource": "ambient-general-linear-group",
        }
    if representation_dimension is not None:
        normalized["finiteImage"][
            "representationDimension"
        ] = representation_dimension
    if index is not None:
        normalized["index"] = str(index)
        normalized["finiteImage"]["order"] = str(index)
        normalized["claims"].append("exact-index")
    else:
        normalized["nonClaims"].insert(0, "exact torsion-free kernel index")
    normalized["certificateSha256"] = sha256_text(canonical_json(normalized))
    return normalized


def collect_kernel_covers(
    finite_artifacts: Sequence[dict[str, Any]],
    spherical: Sequence[SphericalSubset],
) -> list[dict[str, Any]]:
    """Collect deterministic, independently checked kernel certificates."""

    by_hash: dict[str, dict[str, Any]] = {}
    for artifact in finite_artifacts:
        raw_covers = artifact.get("kernelCovers")
        if not isinstance(raw_covers, list):
            single = artifact.get("kernelCover")
            raw_covers = [single] if isinstance(single, dict) else []
        for raw in raw_covers:
            if not isinstance(raw, dict):
                continue
            checked = independently_validate_kernel_cover(
                raw,
                spherical,
                expected_matrix_digest=(
                    str(artifact.get("matrixDigest"))
                    if artifact.get("matrixDigest") is not None
                    else None
                ),
            )
            by_hash[str(checked["certificateSha256"])] = checked
    return sorted(
        by_hash.values(),
        key=lambda item: (
            0 if item["certificateLevel"] == EXACT_INDEX_KERNEL_LEVEL else 1,
            int(
                item.get("index")
                or item.get("indexBounds", {}).get("finiteUpperBound", "0")
            ),
            str(item.get("finiteImage", {}).get("candidateId", "")),
        ),
    )


def finite_image_evidence_reports(
    finite_artifacts: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Retain bounded-search evidence without copying packed actions.

    A strategy-ladder artifact used to keep only the final attempt summaries.
    That discarded the distinction between an impossible degree, a class
    rejected by fixed-point marks, and a surviving but unenumerated subgroup
    family.  The compact ledger below is suitable for UI display and resume
    audits while permutation rows remain in their content-addressed store.
    """

    reports: list[dict[str, Any]] = []
    for artifact in finite_artifacts:
        artifact_hash = str(artifact.get("artifactHash", ""))
        for attempt in artifact.get("residueAttempts", []):
            if not isinstance(attempt, dict):
                continue
            recognition_record = attempt.get("structuralRecognition")
            recognition_record = (
                recognition_record if isinstance(recognition_record, dict) else {}
            )
            mod2 = recognition_record.get("mod2Certificate")
            mod2 = mod2 if isinstance(mod2, dict) else {}
            classification = mod2.get("finiteIndexClassification")
            classification = classification if isinstance(classification, dict) else {}
            subgroup_search = attempt.get("subgroupSearch")
            subgroup_search = (
                subgroup_search if isinstance(subgroup_search, dict) else {}
            )
            raw_kernel = attempt.get("kernelCover")
            kernel_summary: dict[str, Any] | None = None
            if isinstance(raw_kernel, dict) and raw_kernel.get("status") == "passed":
                level = raw_kernel.get("certificateLevel")
                if level is None and raw_kernel.get("indexDecimal") is not None:
                    level = EXACT_INDEX_KERNEL_LEVEL
                if level in {FINITE_INDEX_KERNEL_LEVEL, EXACT_INDEX_KERNEL_LEVEL}:
                    evidence = raw_kernel.get("indexEvidence")
                    evidence = evidence if isinstance(evidence, dict) else {}
                    kernel_summary = {
                        "certificateLevel": level,
                        "indexStatus": (
                            "exact"
                            if level == EXACT_INDEX_KERNEL_LEVEL
                            else "unknown"
                        ),
                        "exactIndexDecimal": (
                            str(raw_kernel.get("indexDecimal"))
                            if level == EXACT_INDEX_KERNEL_LEVEL
                            else None
                        ),
                        "divisibilityLowerBoundDecimal": evidence.get(
                            "divisibilityLowerBoundDecimal"
                        ),
                        "finiteUpperBoundDecimal": evidence.get(
                            "finiteUpperBoundDecimal"
                        ),
                        "certificateSha256": raw_kernel.get("certificateSha256"),
                    }
            degree_records = classification.get("report")
            if not isinstance(degree_records, list):
                degree_records = subgroup_search.get("targetIndexDecisions", [])
            compact_degrees: list[dict[str, Any]] = []
            for raw in degree_records:
                if not isinstance(raw, dict):
                    continue
                target = raw.get("target")
                if (
                    isinstance(target, bool)
                    or not isinstance(target, int)
                    or target < 1
                ):
                    continue
                outcome = raw.get("classification", raw.get("decision", "unknown"))
                if outcome == "unresolved-resumable-frontier":
                    outcome = "unresolved-family-coverage"
                elif outcome == "witness-free-candidate-found":
                    # Exact subgroup intersection is a strong candidate test.
                    # Final promotion still waits for the independently built
                    # coset action and every spherical regular-orbit check.
                    outcome = "admissible"
                if outcome not in {
                    "impossible",
                    "witness-contaminated",
                    "materialized-and-rejected",
                    "certified-torsion-free",
                    "unresolved-family-coverage",
                    "ruled-out",
                    "admissible",
                    "unknown",
                }:
                    outcome = "unknown"
                compact: dict[str, Any] = {
                    "degree": target,
                    "outcome": outcome,
                    "complete": bool(
                        raw.get("complete", outcome in {"impossible", "ruled-out"})
                    ),
                    "reason": str(raw.get("reason", "No reason was recorded.")),
                }
                canonical = raw.get("canonicalProduct")
                if isinstance(canonical, dict):
                    compact["canonicalProduct"] = {
                        key: canonical[key]
                        for key in (
                            "classification",
                            "complete",
                            "eligibleClassCount",
                            "rejectedClassCount",
                            "survivorCount",
                            "reason",
                        )
                        if key in canonical
                    }
                family = raw.get("familyReport")
                if isinstance(family, list):
                    compact["familyReport"] = [
                        {
                            key: item[key]
                            for key in (
                                "family",
                                "scope",
                                "status",
                                "complete",
                                "candidateCount",
                                "reason",
                            )
                            if key in item
                        }
                        for item in family
                        if isinstance(item, dict)
                    ]
                elif isinstance(family, dict):
                    compact["familyReport"] = {
                        key: value
                        for key, value in family.items()
                        if isinstance(value, (bool, int, str, list, dict))
                    }
                compact_degrees.append(compact)

            residue_source = {
                key: attempt[key]
                for key in (
                    "candidateId",
                    "rationalPrime",
                    "coefficientModel",
                    "primeIdeal",
                    "primeIdealNorm",
                    "residueDegree",
                    "residueField",
                    "residueFieldOrder",
                    "status",
                    "reason",
                    "imageOrder",
                    "imageOrderStatus",
                    "kernelCertificateLevel",
                    "permutationMaterialized",
                    "permutationDegree",
                )
                if key in attempt
            }
            report: dict[str, Any] = {
                "sourceArtifactHash": artifact_hash,
                "residueSource": residue_source,
                "degreeLedger": sorted(
                    compact_degrees, key=lambda item: item["degree"]
                ),
                "boundedComplete": bool(
                    compact_degrees
                    and all(item["complete"] for item in compact_degrees)
                ),
                "subgroupSearchReason": subgroup_search.get("reason"),
                "kernelCertification": kernel_summary,
                "kernelCertificationIndependentOfDegreeLedger": bool(
                    kernel_summary
                ),
            }
            if classification:
                report["classificationScope"] = {
                    key: classification[key]
                    for key in (
                        "classificationCeiling",
                        "completeNecessaryIndexSieve",
                        "completeSubgroupFamilyClassification",
                        "requestedCeiling576000Covered",
                        "statement",
                    )
                    if key in classification
                }
            reports.append(report)
    reports.sort(
        key=lambda item: (
            int(item.get("residueSource", {}).get("rationalPrime", sys.maxsize)),
            str(item.get("residueSource", {}).get("candidateId", "")),
        )
    )
    return reports


def build_finite_image_artifact(
    source: dict[str, Any],
    matrix: Sequence[Sequence[int]],
    input_hash: str,
    bounds: dict[str, int],
    spherical: Sequence[SphericalSubset],
    raw: dict[str, Any],
    runtime: DiscoveryRuntimeSession,
    *,
    selected_strategy: str = STRATEGY_FINITE_IMAGE,
    composite_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Normalize and independently certify a finite-image or composite winner."""

    degree, actions = passing_action_rows(raw)
    witnesses = raw.get("torsionWitnesses", [])
    if not isinstance(witnesses, list):
        raise ValueError("Finite-image witness catalogue is missing")
    catalogue = raw.get("sphericalCatalogue", {})
    expected_witness_count = catalogue.get("witnessCount")
    if expected_witness_count is not None and int(expected_witness_count) != len(
        witnesses
    ):
        raise ValueError("Finite-image witness count disagrees with its catalogue")
    witness_digest = sha256_text(canonical_json(witnesses))
    if catalogue.get("witnessDigest") != witness_digest:
        raise ValueError("Finite-image witness digest disagrees with its catalogue")
    class_origins = [
        origin for witness in witnesses for origin in witness.get("classOrigins", [])
    ]
    if not class_origins or any(
        not witness.get("classOrigins")
        or any(
            origin.get("canonicalWord") != witness.get("word")
            or origin.get("primeOrder") != witness.get("primeOrder")
            for origin in witness["classOrigins"]
        )
        for witness in witnesses
    ):
        raise ValueError(
            "Finite-image witnesses lack a complete canonical class-origin map"
        )
    class_origin_digest = sha256_text(canonical_json(class_origins))
    if (
        int(catalogue.get("classOriginCount", -1)) != len(class_origins)
        or catalogue.get("classOriginDigest") != class_origin_digest
    ):
        raise ValueError("Finite-image class-origin audit disagrees with its catalogue")
    lower_bound = int(index_lower_bound_record(spherical)["value"])
    if degree % lower_bound:
        raise ValueError(
            f"Candidate degree {degree} is not divisible by the exact lower bound {lower_bound}"
        )
    independent = independently_certify_action(
        matrix, spherical, witnesses, actions, degree
    )
    if not independent["passed"]:
        raise ValueError(
            "External finite-image candidate failed the independent action certificate"
        )

    convention = (
        "Diagonal orbit of exact finite-image coset modules"
        if selected_strategy == STRATEGY_COMPOSITE
        else "Right cosets Q/L in an exact congruence image; q0 is the base coset"
    )
    artifact = base_artifact(source, input_hash, bounds, "passed", True)
    artifact["sphericalCatalogue"] = spherical_catalogue_record(
        spherical,
        "complete-finite-coxeter-classification+sage-prime-order-classes",
    )
    artifact["sphericalCatalogue"].update(
        {
            "witnessCount": len(witnesses),
            "witnessDigest": witness_digest,
            "classOriginCount": len(class_origins),
            "classOriginDigest": class_origin_digest,
            "finiteImageImplementationSha256": catalogue.get("implementationSha256"),
        }
    )
    artifact["indexLowerBound"] = index_lower_bound_record(spherical)
    artifact["torsionWitnesses"] = witnesses
    artifact["finiteAction"] = finite_action_from_permutations(
        source, actions, convention
    )
    search = raw.get("search", {})
    artifact["search"] = {
        "method": (
            "Packed diagonal-orbit search over exact finite-image modules"
            if selected_strategy == STRATEGY_COMPOSITE
            else "Native Sage/libGAP finite-image subgroup and coset-action search"
        ),
        "selectedStrategy": selected_strategy,
        "candidatesChecked": int(search.get("metrics", {}).get("modulesEvaluated", 0)),
        "maxIndex": bounds["maxIndex"],
        "maxCandidates": bounds["maxCandidates"],
        "iteratorComplete": bool(
            raw.get("searchCompleteness", {}).get("boundedComplete", False)
        ),
        "reason": "independently-certified-finite-action",
    }
    if composite_summary is not None:
        artifact["composite"] = composite_summary
    artifact["certificate"] = {
        "status": "passed",
        "criterion": "tits-maximal-spherical-regular-orbits",
        "completeSphericalRestrictionChecks": True,
        "primeOrderClassOriginCount": len(class_origins),
        "classOriginCoveragePassed": True,
        "classOriginCatalogueRole": "search-diagnostic",
        "classOriginCatalogueDigestVerified": True,
        "witnessDiagnosticsPassed": independent["witnessDiagnosticsPassed"],
        "transitive": independent["transitive"],
        "noFixedPointChecks": independent["noFixedPointChecks"],
        "coxeterRelationChecks": independent["coxeterRelationChecks"],
        "sphericalOrbitChecks": independent["sphericalOrbitChecks"],
        "theoremBasis": [
            "Tits torsion theorem for Coxeter groups",
            "prime-order reduction in finite cyclic subgroups",
            "free restricted W_T orbits have size |W_T|",
        ],
        "claims": ["finite-index", "torsion-free"],
        "nonClaims": [
            "normal subgroup",
            "minimal index",
            "manifold",
            "virtual algebraic fibering",
        ],
        "explanation": (
            "The external search proposed an action. This launcher independently "
            "checked every Coxeter relation and verified that each maximal spherical "
            "special subgroup has only regular orbits. Prime-order witnesses are a "
            "separate search and cross-check diagnostic."
        ),
    }
    artifact["provenance"] = {
        "backend": (
            COMPOSITE_BACKEND_ID
            if selected_strategy == STRATEGY_COMPOSITE
            else "sage-finite-image-coset"
        ),
        "backendVersion": raw.get("backend", {}).get("version", BACKEND_VERSION),
        "sageVersion": raw.get("backend", {}).get("sageVersion"),
        "runtime": "wsl-ext4"
        if runtime.workspace and runtime.workspace.kind == "wsl-ext4"
        else "native",
        "scratchKind": runtime.workspace.kind if runtime.workspace else "unknown",
        "checkpointPath": raw.get("search", {}).get("checkpoint"),
        "sourceArtifactHash": raw.get("artifactHash"),
        "inputHash": input_hash,
    }
    return add_artifact_hash(artifact)


def resolve_mod3_structural_inputs(
    args: argparse.Namespace, matrix: Sequence[Sequence[int]]
) -> dict[str, Path] | None:
    """Select the bundled p=3 certificate only for its exact Coxeter matrix."""

    explicit = args.mod3_structural_certificate is not None
    certificate_path = (
        args.mod3_structural_certificate
        if explicit
        else DEFAULT_MOD3_STRUCTURAL_CERTIFICATE
    )
    certificate_path = Path(certificate_path).expanduser().resolve()
    if not certificate_path.is_file():
        if explicit:
            raise InputError(
                f"The requested p=3 structural certificate is missing: {certificate_path}"
            )
        return None
    try:
        artifact = json.loads(certificate_path.read_text(encoding="utf8"))
    except (OSError, json.JSONDecodeError) as exc:
        if explicit:
            raise InputError(f"Cannot read p=3 structural certificate: {exc}") from exc
        return None
    provenance = artifact.get("provenance")
    certificate_matrix_digest = (
        provenance.get("matrixDigest") if isinstance(provenance, dict) else None
    )
    current_matrix_digest = sha256_text(
        canonical_json({"coxeterMatrix": [list(row) for row in matrix]})
    )
    if certificate_matrix_digest != current_matrix_digest:
        if explicit:
            raise InputError(
                "The requested p=3 structural certificate belongs to another Coxeter matrix."
            )
        return None
    source_path = (
        Path(args.mod3_structural_source or DEFAULT_MOD3_STRUCTURAL_SOURCE)
        .expanduser()
        .resolve()
    )
    for path, description in (
        (source_path, "p=3 structural source"),
        (MOD3_STRUCTURAL_SCRIPT, "p=3 structural orchestrator"),
        (MOD3_STRUCTURAL_GAP_SCRIPT, "p=3 structural GAP generator"),
        (MOD3_STRUCTURAL_REPLAY_GAP_SCRIPT, "p=3 structural GAP replay verifier"),
    ):
        if not path.is_file():
            raise InputError(f"The {description} is missing: {path}")
    return {
        "certificate": certificate_path,
        "source": source_path,
        "orchestrator": MOD3_STRUCTURAL_SCRIPT,
        "gapScript": MOD3_STRUCTURAL_GAP_SCRIPT,
        "replayGapScript": MOD3_STRUCTURAL_REPLAY_GAP_SCRIPT,
    }


def stage_discovery_backend(
    runtime: DiscoveryRuntimeSession,
    mod3_inputs: dict[str, Path] | None = None,
) -> dict[str, Any]:
    """Stage executable backend sources into the selected scratch filesystem."""

    staged: dict[str, Any] = {}
    for source in (
        Path(__file__).resolve(),
        FINITE_IMAGE_SCRIPT,
        FINITE_IMAGE_RECOGNITION_SCRIPT,
        MODULE_CATALOGUE_SCRIPT,
        GAP_FINITE_IMAGE_RECOGNITION_SCRIPT,
        PACKED_SOLVER_SCRIPT,
        GAP_SCRIPT,
    ):
        staged[source.name] = runtime.stage_file(
            source, relative_path=f"backend/{source.name}"
        )
    if mod3_inputs is not None:
        for key, source in mod3_inputs.items():
            relative_path = (
                f"backend/{source.name}"
                if key in {"orchestrator", "gapScript", "replayGapScript"}
                else f"backend/mod3/{source.name}"
            )
            staged[f"mod3:{key}"] = runtime.stage_file(
                source, relative_path=relative_path
            )
    runtime_dir = SCRIPT_DIR / "discovery_runtime"
    for source in sorted(runtime_dir.glob("*.py")):
        runtime.stage_file(
            source, relative_path=f"backend/discovery_runtime/{source.name}"
        )
    return staged


def process_error_detail(result: Any) -> str:
    details: list[str] = []
    for value in (result.stderr_path, result.stdout_path):
        if not value:
            continue
        try:
            text = Path(value).read_text(encoding="utf8", errors="replace")
        except OSError:
            continue
        if text.strip():
            details.append(text.strip()[-4096:])
    return "\n".join(details)


def runtime_execution_mode(runtime: DiscoveryRuntimeSession) -> str:
    if runtime.workspace is not None and runtime.workspace.kind == "wsl-ext4":
        return "wsl"
    return "native"


def runtime_result_paths(
    runtime: DiscoveryRuntimeSession, file_name: str
) -> tuple[Path, str]:
    """Place compact result JSON where both Windows and WSL can see it.

    Search frontiers and permutation spools stay in ext4. Only small protocol
    results cross through ``/mnt/c``; relying on Windows metadata calls over
    ``\\wsl.localhost`` proved unreliable on some desktop configurations.
    """

    if runtime_execution_mode(runtime) == "wsl":
        directory = runtime.checkpoint_directory / ".backend-results"
        directory.mkdir(parents=True, exist_ok=True)
        host = directory / file_name
        return host, windows_path_to_wsl(host.resolve())
    assert runtime.workspace is not None
    relative = f"outputs/{file_name}"
    return (
        runtime.workspace.host_file(relative),
        runtime.workspace.execution_file(relative),
    )


def runtime_sage_executable(
    runtime: DiscoveryRuntimeSession, explicit_sage: str | None
) -> str:
    if runtime_execution_mode(runtime) == "wsl":
        if explicit_sage and explicit_sage.startswith("/"):
            return explicit_sage
        return DEFAULT_WSL_SAGE
    executable = explicit_sage or shutil.which("sage")
    if not executable:
        raise FileNotFoundError("No native Sage executable was found")
    return executable


def finite_image_command(
    runtime: DiscoveryRuntimeSession,
    staged_script: Any,
    executable: str,
    bounds: dict[str, int],
    lower_bound: int,
    prime: int,
    output_execution_path: str,
    checkpoint_execution_path: str,
    cache_execution_path: str,
    *,
    probe_only: bool,
    mod3_staged: dict[str, Any] | None = None,
) -> list[str]:
    script_args = [
        staged_script.execution_path,
        "--input",
        runtime.paths.input_execution_path,
        "--output",
        output_execution_path,
        "--checkpoint",
        checkpoint_execution_path,
        "--cache-dir",
        cache_execution_path,
        "--prime",
        str(prime),
        "--max-index",
        str(bounds["maxIndex"]),
        "--lower-bound-divisor",
        str(lower_bound),
        "--max-modules",
        str(bounds["maxModuleCandidates"]),
        "--max-subgroups",
        str(max(bounds["maxCandidates"], bounds["maxModuleCandidates"] * 16)),
        "--max-witnesses",
        str(bounds["maxWitnesses"]),
        "--max-spherical-order",
        str(bounds["maxSphericalOrder"]),
        "--max-subsets",
        str(bounds["maxSubsets"]),
        "--memory-bytes",
        str(min(bounds["maxMemoryBytes"], 2 * GIB)),
        "--module-cache-bytes",
        str(min(bounds["maxMemoryBytes"] // 2, 2 * GIB)),
        "--timeout",
        str(bounds["timeoutSeconds"]),
        "--max-materialized-image-order",
        str(bounds["maxCongruenceImageOrder"]),
        "--resume",
    ]
    if probe_only:
        script_args.append("--probe-only")
    else:
        script_args.extend(
            [
                "--subgroup-source",
                "auto",
                "--permutation-characters",
                "--materialization",
                "json",
            ]
        )
    if prime == 3 and mod3_staged is not None:
        script_args.extend(
            [
                "--structural-certificate",
                mod3_staged["mod3:certificate"].execution_path,
                "--structural-source",
                mod3_staged["mod3:source"].execution_path,
                "--structural-gap-script",
                mod3_staged["mod3:gapScript"].execution_path,
                "--structural-replay-gap-script",
                mod3_staged["mod3:replayGapScript"].execution_path,
                "--structural-orchestrator",
                mod3_staged["mod3:orchestrator"].execution_path,
            ]
        )
    startup = (
        "import runpy,sys; "
        f"sys.argv={json.dumps(script_args)}; "
        f"runpy.run_path({json.dumps(staged_script.execution_path)}, run_name='__main__')"
    )
    return [executable, "-c", startup]


def accepted_probe_key(artifact: dict[str, Any]) -> tuple[int, int, int]:
    accepted = [
        attempt
        for attempt in artifact.get("residueAttempts", [])
        if attempt.get("status") == "accepted"
    ]
    if not accepted:
        return (sys.maxsize, sys.maxsize, sys.maxsize)

    def integer_field(attempt: dict[str, Any], primary: str, legacy: str) -> int:
        """Read a finite-image metric across the v1 engine/launcher boundary."""

        value = attempt.get(primary, attempt.get(legacy))
        return int(value) if value is not None else sys.maxsize

    best = min(
        accepted,
        key=lambda attempt: (
            integer_field(attempt, "imageOrder", "finiteImageOrder"),
            integer_field(attempt, "permutationDegree", "compactPermutationDegree"),
            str(attempt.get("candidateId", "")),
        ),
    )
    return (
        integer_field(best, "imageOrder", "finiteImageOrder"),
        integer_field(best, "permutationDegree", "compactPermutationDegree"),
        len(accepted),
    )


def run_finite_image_portfolio(
    runtime: DiscoveryRuntimeSession,
    staged: dict[str, Any],
    bounds: dict[str, int],
    lower_bound: int,
    explicit_sage: str | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str], dict[str, Any]]:
    """Probe residues concurrently, then search accepted images under byte caps."""

    errors: list[str] = []
    attempts: list[dict[str, Any]] = []
    full_artifacts: list[dict[str, Any]] = []
    try:
        executable = runtime_sage_executable(runtime, explicit_sage)
    except FileNotFoundError as exc:
        return [], [], [str(exc)], {"status": "skipped"}

    primes = primes_through(bounds["maxCongruencePrime"])
    base_plan = ResourcePlan.for_host(
        light_workers=bounds["lightWorkers"],
        heavy_workers=bounds["heavyWorkers"],
    )
    # Sage needs a meaningful address-space allowance even for a small probe.
    # When free RAM is tight, the byte semaphore reduces concurrency instead
    # of launching several unusable 256 MiB Sage processes.
    safe_available_cap = max(
        512 * 1024 * 1024,
        base_plan.detected_available_bytes - 1024 * 1024 * 1024,
    )
    usable_floor = min(
        bounds["maxMemoryBytes"],
        safe_available_cap,
        max(768 * 1024 * 1024, int(base_plan.detected_available_bytes * 0.45)),
    )
    plan = ResourcePlan(
        light_workers=base_plan.light_workers,
        heavy_workers=base_plan.heavy_workers,
        memory_budget_bytes=max(
            min(bounds["maxMemoryBytes"], base_plan.memory_budget_bytes),
            usable_floor,
        ),
        detected_available_bytes=base_plan.detected_available_bytes,
        logical_cpus=base_plan.logical_cpus,
    )
    probe_memory = max(
        min(plan.memory_budget_bytes, 768 * 1024 * 1024),
        min(2 * GIB, plan.memory_budget_bytes // min(2, plan.light_workers)),
    )
    heavy_memory = min(8 * GIB, plan.memory_budget_bytes)
    _, cache_execution = runtime.cache_paths("finite-image", scope="root")
    journal = runtime.journal("finite-image-portfolio")
    mode = runtime_execution_mode(runtime)

    def execute(prime: int, probe_only: bool) -> dict[str, Any]:
        phase = "probe" if probe_only else "search"
        output_host, output_execution = runtime_result_paths(
            runtime, f"finite-{phase}-p{prime}.json"
        )
        output_host.unlink(missing_ok=True)
        _, checkpoint_execution = runtime.cache_paths(
            f"finite-image/checkpoints/p{prime}.json", scope="run"
        )
        command = finite_image_command(
            runtime,
            staged[FINITE_IMAGE_SCRIPT.name],
            executable,
            bounds,
            lower_bound,
            prime,
            output_execution,
            checkpoint_execution,
            cache_execution,
            probe_only=probe_only,
            mod3_staged=(staged if "mod3:certificate" in staged else None),
        )
        journal.append(
            stage=f"finite-image-{phase}",
            key=f"p{prime}",
            status="started",
            payload={"prime": prime, "command": stable_command_label(command)},
        )
        result = runtime.run_backend(
            f"finite-{phase}-p{prime}",
            command,
            mode=mode,
            timeout_seconds=bounds["timeoutSeconds"] + 60,
            # Sage/BLAS reserves large virtual ranges that are not resident.
            # RLIMIT_AS therefore kills valid small computations. The byte
            # semaphore, WSL cap, packed-spool cap, and action-byte cap remain
            # the enforceable memory boundaries.
            memory_limit_bytes=None,
        )
        if result.cancelled:
            raise RuntimeCancelled(f"Finite-image {phase} p={prime} was cancelled")
        if not output_host.is_file():
            detail = process_error_detail(result)
            raise RuntimeError(
                f"Finite-image {phase} p={prime} exited {result.returncode} without "
                f"an artifact{': ' + detail if detail else ''}"
            )
        artifact = json.loads(output_host.read_text(encoding="utf8"))
        journal.record_artifact(
            stage=f"finite-image-{phase}",
            key=f"p{prime}",
            artifact_path=output_host,
            metadata={"status": artifact.get("status")},
        )
        return artifact

    with ResourcePortfolio[dict[str, Any]](plan) as portfolio:
        future_primes = {
            portfolio.submit_light(
                f"probe-p{prime}",
                probe_memory,
                lambda _context, prime=prime: execute(prime, True),
            ): prime
            for prime in primes
        }
        probe_artifacts: list[tuple[int, dict[str, Any]]] = []
        for future in as_completed(future_primes):
            prime = future_primes[future]
            started = time.monotonic()
            try:
                artifact = future.result()
                probe_artifacts.append((prime, artifact))
                accepted = accepted_probe_key(artifact)[0] != sys.maxsize
                attempts.append(
                    {
                        "strategy": STRATEGY_FINITE_IMAGE,
                        "phase": "probe",
                        "prime": prime,
                        "status": "accepted"
                        if accepted
                        else artifact.get("status", "rejected"),
                        "message": (
                            "Exact relations and spherical injectivity passed."
                            if accepted
                            else (artifact.get("warnings") or ["Residue rejected."])[0]
                        ),
                        "elapsedMs": round((time.monotonic() - started) * 1000),
                    }
                )
            except RuntimeCancelled:
                raise
            except Exception as exc:  # noqa: BLE001 - worker/process boundary
                errors.append(f"finite-image probe p={prime}: {exc}")
                attempts.append(
                    {
                        "strategy": STRATEGY_FINITE_IMAGE,
                        "phase": "probe",
                        "prime": prime,
                        "status": "failed",
                        "message": str(exc),
                        "elapsedMs": round((time.monotonic() - started) * 1000),
                    }
                )

        accepted_probes = sorted(
            (
                (prime, artifact)
                for prime, artifact in probe_artifacts
                if accepted_probe_key(artifact)[0] != sys.maxsize
            ),
            key=lambda item: (*accepted_probe_key(item[1]), item[0]),
        )
        # One heavy process is the safe default. A user may admit two; batches
        # still stop after the first batch that yields a certified action.
        for offset in range(0, len(accepted_probes), plan.heavy_workers):
            batch = accepted_probes[offset : offset + plan.heavy_workers]
            futures = {
                portfolio.submit_heavy(
                    f"search-p{prime}",
                    heavy_memory,
                    lambda _context, prime=prime: execute(prime, False),
                ): prime
                for prime, _artifact in batch
            }
            batch_passed = False
            for future in as_completed(futures):
                prime = futures[future]
                started = time.monotonic()
                try:
                    artifact = future.result()
                    full_artifacts.append(artifact)
                    passed = artifact.get("status") == "passed"
                    batch_passed = batch_passed or passed
                    attempts.append(
                        {
                            "strategy": STRATEGY_FINITE_IMAGE,
                            "phase": "subgroup-search",
                            "prime": prime,
                            "status": artifact.get("status", "failed"),
                            "message": (
                                artifact.get("search", {}).get("reason")
                                or (
                                    artifact.get("warnings")
                                    or ["Finite-image search completed."]
                                )[0]
                            ),
                            "candidateDegree": artifact.get("passingAction", {}).get(
                                "degree"
                            ),
                            "elapsedMs": round((time.monotonic() - started) * 1000),
                        }
                    )
                except RuntimeCancelled:
                    raise
                except Exception as exc:  # noqa: BLE001 - worker/process boundary
                    errors.append(f"finite-image subgroup search p={prime}: {exc}")
                    attempts.append(
                        {
                            "strategy": STRATEGY_FINITE_IMAGE,
                            "phase": "subgroup-search",
                            "prime": prime,
                            "status": "failed",
                            "message": str(exc),
                            "elapsedMs": round((time.monotonic() - started) * 1000),
                        }
                    )
            if batch_passed:
                break

        stats = portfolio.stats()
        resource = portfolio.budget.snapshot()
    # Probe artifacts already contain independently checkable congruence-kernel
    # evidence. Keep them even when a smaller-prime search finds a materialized
    # action before the remaining primes reach their subgroup-search phase.
    evidence_by_hash = {
        str(
            artifact.get("artifactHash", sha256_text(canonical_json(artifact)))
        ): artifact
        for _prime, artifact in probe_artifacts
    }
    for artifact in full_artifacts:
        evidence_by_hash[
            str(artifact.get("artifactHash", sha256_text(canonical_json(artifact))))
        ] = artifact
    evidence_artifacts = list(evidence_by_hash.values())
    evidence_artifacts.sort(
        key=lambda artifact: (
            accepted_probe_key(artifact),
            str(artifact.get("artifactHash", "")),
        )
    )
    return (
        evidence_artifacts,
        attempts,
        errors,
        {
            "status": "completed",
            "runtimeMode": mode,
            "scratchKind": runtime.workspace.kind if runtime.workspace else "unknown",
            "primes": primes,
            "lightWorkers": plan.light_workers,
            "heavyWorkers": plan.heavy_workers,
            "memoryBudgetBytes": plan.memory_budget_bytes,
            "peakReservedBytes": resource.peak_reserved_bytes,
            "tasksSubmitted": stats.submitted,
            "tasksCompleted": stats.completed,
            "tasksFailed": stats.failed,
        },
    )


def run_finite_image_composite(
    runtime: DiscoveryRuntimeSession,
    staged: dict[str, Any],
    source: dict[str, Any],
    matrix: Sequence[Sequence[int]],
    input_hash: str,
    bounds: dict[str, int],
    spherical: Sequence[SphericalSubset],
    finite_artifacts: Sequence[dict[str, Any]],
) -> tuple[dict[str, Any] | None, dict[str, Any], list[str]]:
    """Combine packed partial modules and inspect every bounded diagonal orbit."""

    errors: list[str] = []
    catalogue_artifacts = [
        artifact
        for artifact in finite_artifacts
        if artifact.get("torsionWitnesses")
        and artifact.get("sphericalCatalogue", {}).get("witnessDigest")
    ]
    if not catalogue_artifacts:
        return None, {"status": "skipped", "reason": "no-complete-module-catalogue"}, []
    witness_digest = catalogue_artifacts[0]["sphericalCatalogue"]["witnessDigest"]
    compatible = [
        artifact
        for artifact in catalogue_artifacts
        if artifact["sphericalCatalogue"].get("witnessDigest") == witness_digest
    ]
    incompatible = len(catalogue_artifacts) - len(compatible)
    if incompatible:
        errors.append(
            f"Ignored {incompatible} finite-image module catalogues with a different witness digest."
        )

    modules: list[dict[str, Any]] = []
    seen_module_hashes: set[str] = set()
    for artifact in compatible:
        sealed = artifact.get("partialModuleCatalogue")
        storage_root = artifact.get("partialModuleCatalogueStorageRoot")
        if isinstance(sealed, dict) and isinstance(storage_root, str):
            try:
                checked = module_catalogue.validate_catalogue(
                    sealed,
                    expected_hashes={
                        "sourceSha256": input_hash,
                        "matrixSha256": str(artifact.get("matrixDigest")),
                        "witnessSha256": witness_digest,
                    },
                    require_complete=False,
                )
            except module_catalogue.CatalogueError as exc:
                errors.append(f"Ignored an invalid reusable module catalogue: {exc}")
            else:
                for module in checked["modules"]:
                    packed = dict(module["packedPermutationRows"])
                    packed["path"] = (
                        storage_root.rstrip("/\\") + "/" + str(packed["storageKey"])
                    )
                    digest = str(packed["sha256"])
                    if digest in seen_module_hashes:
                        continue
                    seen_module_hashes.add(digest)
                    modules.append(
                        {
                            "id": module["id"],
                            "packedActions": packed,
                            "finiteImageCandidateId": module["provenance"][0][
                                "finiteImageId"
                            ],
                            "subgroupFingerprint": module["subgroupFingerprint"],
                            "catalogueSha256": checked["catalogueSha256"],
                        }
                    )
        for module in artifact.get("search", {}).get("modules", []):
            packed = module.get("packedPermutationRows")
            if not isinstance(packed, dict):
                continue
            digest = str(packed.get("sha256", ""))
            if not digest or digest in seen_module_hashes:
                continue
            seen_module_hashes.add(digest)
            modules.append(
                {
                    "id": module.get("id", f"finite-module-{len(modules)}"),
                    "packedActions": packed,
                    "finiteImageCandidateId": module.get("finiteImageCandidateId"),
                    "subgroupFingerprint": module.get("subgroupFingerprint"),
                }
            )
    if not modules:
        return (
            None,
            {"status": "skipped", "reason": "no-packed-partial-modules"},
            errors,
        )

    witnesses = compatible[0]["torsionWitnesses"]
    lower_bound = int(index_lower_bound_record(spherical)["value"])
    problem = {
        "schemaVersion": 1,
        "witnessCatalogue": {
            "complete": True,
            "digest": witness_digest,
            "witnesses": witnesses,
        },
        "lowerBound": lower_bound,
        "coxeterMatrix": [list(row) for row in matrix],
        "modules": modules,
    }
    assert runtime.workspace is not None
    problem_relative = "inputs/finite-image-composite.json"
    problem_host = runtime.workspace.host_file(problem_relative)
    problem_host.parent.mkdir(parents=True, exist_ok=True)
    problem_host.write_text(
        json.dumps(problem, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf8",
    )
    summary_host, summary_execution = runtime_result_paths(
        runtime, "finite-image-composite-summary.json"
    )
    action_host, action_execution = runtime_result_paths(
        runtime, "finite-image-composite-action.json"
    )
    summary_host.unlink(missing_ok=True)
    action_host.unlink(missing_ok=True)
    checkpoint_host, checkpoint_execution = runtime.cache_paths(
        "packed-composite/frontier.json", scope="run"
    )
    mode = runtime_execution_mode(runtime)
    executable = "/usr/bin/python3" if mode == "wsl" else sys.executable
    command = [
        executable,
        staged[PACKED_SOLVER_SCRIPT.name].execution_path,
        "--input",
        runtime.workspace.execution_file(problem_relative),
        "--output",
        summary_execution,
        "--checkpoint",
        checkpoint_execution,
        "--materialize-action",
        action_execution,
        "--max-bytes",
        str(min(bounds["maxMemoryBytes"] // 2, 2 * GIB)),
        "--max-mapped-bytes",
        str(bounds["maxMemoryBytes"] * 2),
        "--max-combinations",
        str(bounds["maxCompositeCombinations"]),
        "--max-factors",
        str(bounds["maxCompositeModules"]),
        "--max-degree",
        str(bounds["maxIndex"]),
        "--max-cartesian-points",
        str(max(bounds["maxIndex"], bounds["maxCongruenceImageOrder"])),
    ]
    if checkpoint_host.is_file():
        command.append("--resume")
    journal = runtime.journal("packed-composite")
    journal.append(
        stage="packed-composite",
        key=witness_digest,
        status="started",
        payload={"moduleCount": len(modules), "command": stable_command_label(command)},
    )
    result = runtime.run_backend(
        "packed-composite",
        command,
        mode=mode,
        timeout_seconds=bounds["timeoutSeconds"] + 60,
        memory_limit_bytes=min(bounds["maxMemoryBytes"], 4 * GIB),
    )
    if result.cancelled:
        raise RuntimeCancelled("Packed composite search was cancelled")
    if not summary_host.is_file():
        detail = process_error_detail(result)
        return (
            None,
            {
                "status": "failed",
                "reason": detail or f"solver-exit-{result.returncode}",
                "moduleCount": len(modules),
            },
            errors,
        )
    summary = json.loads(summary_host.read_text(encoding="utf8"))
    journal.record_artifact(
        stage="packed-composite",
        key=witness_digest,
        artifact_path=summary_host,
        metadata={"status": summary.get("status"), "moduleCount": len(modules)},
    )
    if not action_host.is_file():
        return None, {**summary, "moduleCount": len(modules)}, errors
    materialized = json.loads(action_host.read_text(encoding="utf8"))
    candidate = materialized.get("candidate", {})
    rows = materialized.get("generatorActions", [])
    candidate_degree = int(candidate.get("degree", 0))
    lower_bound = int(index_lower_bound_record(spherical)["value"])
    global_minimum_proved = candidate_degree == lower_bound
    raw = {
        "status": "passed",
        "backend": {
            "id": COMPOSITE_BACKEND_ID,
            "version": materialized.get("solver", {}).get("version", BACKEND_VERSION),
        },
        "passingAction": {
            "degree": candidate.get("degree"),
            "generatorActions": [
                {"generator": generator, "images": row}
                for generator, row in enumerate(rows)
            ],
        },
        "torsionWitnesses": witnesses,
        "sphericalCatalogue": compatible[0]["sphericalCatalogue"],
        "search": {
            "reason": "packed-composite-candidate-found",
            "metrics": {
                "modulesEvaluated": len(modules),
                "combinationsChecked": summary.get("diagnostics", {}).get(
                    "combinationsChecked", 0
                ),
            },
        },
        "searchCompleteness": {
            "boundedComplete": global_minimum_proved,
            "minimumWithinFactorwiseCoveringScope": bool(
                summary.get(
                    "minimumWithinFactorwiseCoveringScope",
                    summary.get("minimumProved", False),
                )
            ),
            "globalMinimumProvedByIndexLowerBound": global_minimum_proved,
        },
        "artifactHash": materialized.get("problemSha256"),
    }
    artifact = build_finite_image_artifact(
        source,
        matrix,
        input_hash,
        bounds,
        spherical,
        raw,
        runtime,
        selected_strategy=STRATEGY_COMPOSITE,
        composite_summary={
            "moduleCount": len(modules),
            "moduleIds": candidate.get("moduleIds", []),
            "orbitDegree": candidate.get("degree"),
            "allOrbitsOfAdmittedFactorSetsSearched": True,
            "minimumWithinFactorwiseCoveringScope": bool(
                summary.get(
                    "minimumWithinFactorwiseCoveringScope",
                    summary.get("minimumProved", False),
                )
            ),
            "globalMinimumProvedByIndexLowerBound": global_minimum_proved,
            "solverCompletenessScope": (
                "bounded factorwise witness-covering composites; exceptional free "
                "orbits from non-covering factor sets are outside this claim"
            ),
            "summary": summary,
        },
    )
    return artifact, {**summary, "moduleCount": len(modules)}, errors


def run_gap_runtime(
    runtime: DiscoveryRuntimeSession,
    staged: dict[str, Any],
    data_text: str,
    timeout_seconds: int,
    explicit_gap: str | None,
) -> tuple[str, dict[str, Any] | None, RuntimeCandidate | None, list[str], list[str]]:
    """Run the bounded low-index fallback inside the managed scratch runtime."""

    assert runtime.workspace is not None
    mode = runtime_execution_mode(runtime)
    if mode == "wsl":
        executable = (
            explicit_gap
            if explicit_gap and explicit_gap.startswith("/")
            else DEFAULT_WSL_GAP
        )
    else:
        executable = explicit_gap or shutil.which("gap")
        if not executable:
            return "skipped", None, None, [], ["No native GAP executable was found"]
    data_relative = "inputs/gap-fallback-input.g"
    data_host = runtime.workspace.host_file(data_relative)
    raw_host, raw_execution = runtime_result_paths(runtime, "gap-fallback-raw.txt")
    raw_host.unlink(missing_ok=True)
    data_host.parent.mkdir(parents=True, exist_ok=True)
    data_host.write_text(data_text, encoding="utf8")
    data_execution = runtime.workspace.execution_file(data_relative)
    script_execution = staged[GAP_SCRIPT.name].execution_path
    startup = (
        "ARGV := ["
        + ",".join(
            gap_string(value)
            for value in ["--data", data_execution, "--raw-output", raw_execution]
        )
        + "];; Read("
        + gap_string(script_execution)
        + ");;"
    )
    command = [executable, "-q", "-c", startup]
    candidate = RuntimeCandidate(
        "managed WSL GAP" if mode == "wsl" else executable,
        mode,
        (executable,),
    )
    journal = runtime.journal("gap-low-index-fallback")
    journal.append(
        stage="gap-low-index-fallback",
        key="bounded",
        status="started",
        payload={"command": stable_command_label(command)},
    )
    result = runtime.run_backend(
        "gap-low-index-fallback",
        command,
        mode=mode,
        timeout_seconds=timeout_seconds + 30,
        memory_limit_bytes=min(
            2 * GIB, runtime.search_config["bounds"]["maxMemoryBytes"]
        ),
    )
    if result.cancelled:
        raise RuntimeCancelled("Bounded GAP fallback was cancelled")
    if not raw_host.is_file():
        detail = process_error_detail(result)
        return (
            "failed" if result.returncode != 127 else "skipped",
            None,
            candidate,
            [stable_command_label(command)],
            [detail or f"GAP exited {result.returncode} without structured output"],
        )
    raw = parse_raw(raw_host)
    raw["executedCommand"] = command
    journal.record_artifact(
        stage="gap-low-index-fallback",
        key="bounded",
        artifact_path=raw_host,
        metadata={"status": raw["status"]["value"]},
    )
    return (
        raw["status"]["value"],
        raw,
        candidate,
        [stable_command_label(command)],
        [],
    )


def failure_artifact(
    source: dict[str, Any],
    input_hash: str,
    bounds: dict[str, int],
    status: str,
    errors: Iterable[str],
    attempts: Sequence[str] = (),
) -> dict[str, Any]:
    artifact = base_artifact(source, input_hash, bounds, status, status == "skipped")
    target = artifact["warnings"] if status == "skipped" else artifact["errors"]
    target.extend(errors)
    artifact["provenance"] = {
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "runtime": "unavailable" if status == "skipped" else "external-process",
        "command": "python scripts/torsion_free_discovery.py",
        "attempts": list(attempts),
        "inputHash": input_hash,
    }
    return add_artifact_hash(artifact)


def discover(args: argparse.Namespace, input_path: Path) -> tuple[dict[str, Any], int]:
    input_text = input_path.read_text(encoding="utf8")
    input_hash = sha256_text(input_text)
    cli_bounds = {
        "maxIndex": args.max_index,
        "maxCandidates": args.max_candidates,
        "maxModuleCandidates": args.max_module_candidates,
        "maxCompositeModules": args.max_composite_modules,
        "maxCompositeCombinations": args.max_composite_combinations,
        "maxCongruencePrime": args.max_congruence_prime,
        "maxCongruenceImageOrder": args.max_congruence_image_order,
        "maxLowIndexFallback": args.max_low_index_fallback,
        "maxMemoryBytes": args.max_memory_bytes,
        "lightWorkers": args.light_workers,
        "heavyWorkers": args.heavy_workers,
        "maxWitnesses": args.max_witnesses,
        "maxSphericalOrder": args.max_spherical_order,
        "maxSubsets": args.max_subsets,
        "timeoutSeconds": args.timeout,
    }
    try:
        source, matrix, bounds, request = parse_request(input_text, cli_bounds)
    except Exception as exc:  # noqa: BLE001 - stable failure artifact
        source = {
            "name": "invalid input",
            "rank": 0,
            "generators": [],
            "coxeterMatrix": [],
        }
        artifact = failure_artifact(
            source, input_hash, DEFAULT_BOUNDS, "failed", [str(exc)]
        )
        return artifact, 1

    backend = args.backend or request.get("search", {}).get("backend", "auto")
    try:
        spherical = maximal_spherical_subsets(matrix, bounds)
    except CatalogueLimit as exc:
        return skipped_artifact(source, input_hash, bounds, "gap", str(exc)), 0
    except Exception as exc:  # noqa: BLE001 - stable failure artifact
        return failure_artifact(source, input_hash, bounds, "failed", [str(exc)]), 1
    try:
        mod3_inputs = resolve_mod3_structural_inputs(args, matrix)
    except InputError as exc:
        return failure_artifact(source, input_hash, bounds, "failed", [str(exc)]), 1

    strategy_attempts: list[dict[str, Any]] = []
    passing: list[dict[str, Any]] = []
    gap_raw: dict[str, Any] | None = None
    gap_runtime: RuntimeCandidate | None = None
    all_warnings: list[str] = []
    all_errors: list[str] = []
    runtime_metadata: dict[str, Any] = {}
    finite_artifacts: list[dict[str, Any]] = []
    kernel_covers: list[dict[str, Any]] = []
    checkpoint_directory = args.checkpoint_dir
    if checkpoint_directory is None:
        if args.output is not None:
            checkpoint_directory = args.output.parent / ".torsion-free-checkpoints"
        else:
            cache_root = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".cache"))
            checkpoint_directory = (
                cache_root / "CoxeterViewer5D" / "torsion-free" / input_hash[:16]
            )
    explicit_native = any(
        value and Path(value).is_file() for value in (args.sage, args.gap)
    )
    scratch_policy = ScratchPolicy(
        prefer_wsl=os.name == "nt" and not explicit_native,
        allow_local_fallback=True,
        keep=args.keep_scratch,
        keep_on_failure=False,
    )
    runtime_config = {
        "backendVersion": BACKEND_VERSION,
        "backend": backend,
        "bounds": bounds,
        "sphericalSubsets": [list(item.subset) for item in spherical],
        "implementationHashes": {
            "launcher": sha256_file(Path(__file__)),
            "finiteImage": sha256_file(FINITE_IMAGE_SCRIPT),
            "finiteImageRecognition": sha256_file(FINITE_IMAGE_RECOGNITION_SCRIPT),
            "finiteImageModuleCatalogue": sha256_file(MODULE_CATALOGUE_SCRIPT),
            "gapFiniteImageRecognition": sha256_file(
                GAP_FINITE_IMAGE_RECOGNITION_SCRIPT
            ),
            "packedComposite": sha256_file(PACKED_SOLVER_SCRIPT),
            "gapFallback": sha256_file(GAP_SCRIPT),
            "mod3Structural": (
                {key: sha256_file(path) for key, path in mod3_inputs.items()}
                if mod3_inputs is not None
                else None
            ),
        },
    }
    try:
        with DiscoveryRuntimeSession(
            input_path,
            runtime_config,
            checkpoint_directory,
            scratch_policy=scratch_policy,
            cancel_file=args.cancel_file,
        ) as runtime:
            staged = stage_discovery_backend(runtime, mod3_inputs)
            if backend in {"auto", "sage"}:
                lower_bound = int(index_lower_bound_record(spherical)["value"])
                (
                    finite_artifacts,
                    finite_attempts,
                    finite_errors,
                    runtime_metadata,
                ) = run_finite_image_portfolio(
                    runtime,
                    staged,
                    bounds,
                    lower_bound,
                    args.sage,
                )
                strategy_attempts.extend(finite_attempts)
                all_warnings.extend(finite_errors)
                for raw in finite_artifacts:
                    if raw.get("status") != "passed":
                        continue
                    try:
                        passing.append(
                            build_finite_image_artifact(
                                source,
                                matrix,
                                input_hash,
                                bounds,
                                spherical,
                                raw,
                                runtime,
                            )
                        )
                    except Exception as exc:  # noqa: BLE001 - independent certificate boundary
                        all_errors.append(str(exc))

                started = time.monotonic()
                best_finite_degree = min(
                    (
                        int(artifact["finiteAction"]["degree"])
                        for artifact in passing
                        if artifact.get("search", {}).get("selectedStrategy")
                        == STRATEGY_FINITE_IMAGE
                    ),
                    default=sys.maxsize,
                )
                if best_finite_degree == lower_bound:
                    composite_artifact = None
                    composite_summary = {
                        "status": "skipped",
                        "reason": "finite-image-action-attains-proven-index-lower-bound",
                    }
                    composite_errors: list[str] = []
                else:
                    composite_artifact, composite_summary, composite_errors = (
                        run_finite_image_composite(
                            runtime,
                            staged,
                            source,
                            matrix,
                            input_hash,
                            bounds,
                            spherical,
                            finite_artifacts,
                        )
                    )
                all_warnings.extend(composite_errors)
                strategy_attempts.append(
                    {
                        "strategy": STRATEGY_COMPOSITE,
                        "phase": "finite-image-modules",
                        "status": (
                            "passed"
                            if composite_artifact is not None
                            else composite_summary.get("status", "exhausted")
                        ),
                        "message": (
                            "A bounded diagonal orbit passed the independent certificate."
                            if composite_artifact is not None
                            else composite_summary.get(
                                "reason",
                                "No bounded factorwise witness-covering composite passed.",
                            )
                        ),
                        "candidateDegree": (
                            composite_artifact.get("finiteAction", {}).get("degree")
                            if composite_artifact is not None
                            else None
                        ),
                        "elapsedMs": round((time.monotonic() - started) * 1000),
                    }
                )
                if composite_artifact is not None:
                    passing.append(composite_artifact)

            # Generic low-index enumeration is deliberately last and capped.
            if backend == "gap" or (backend == "auto" and not passing):
                started = time.monotonic()
                gap_status, gap_raw, gap_runtime, _gap_commands, gap_errors = (
                    run_gap_runtime(
                        runtime,
                        staged,
                        gap_data(matrix, spherical, bounds, enable_modules=True),
                        bounds["timeoutSeconds"],
                        args.gap,
                    )
                )
                gap_artifact: dict[str, Any] | None = None
                if gap_raw is not None and gap_runtime is not None:
                    try:
                        gap_artifact = build_artifact(
                            source,
                            input_hash,
                            bounds,
                            spherical,
                            gap_raw,
                            gap_runtime,
                            gap_raw["executedCommand"],
                        )
                    except Exception as exc:  # noqa: BLE001 - protocol normalization
                        gap_status = "failed"
                        gap_errors.append(str(exc))
                strategy_attempts.append(
                    {
                        "strategy": STRATEGY_GAP,
                        "phase": "small-index-fallback",
                        "status": (
                            gap_artifact.get("status", gap_status)
                            if gap_artifact is not None
                            else gap_status
                        ),
                        "message": (
                            gap_artifact.get("search", {}).get("reason")
                            if gap_artifact is not None
                            else None
                        )
                        or (
                            gap_errors[0]
                            if gap_errors
                            else "Bounded GAP fallback completed."
                        ),
                        "candidateDegree": (
                            gap_artifact.get("finiteAction", {}).get("degree")
                            if gap_artifact is not None
                            else None
                        ),
                        "elapsedMs": round((time.monotonic() - started) * 1000),
                    }
                )
                all_warnings.extend(gap_errors)
                if gap_artifact is not None and gap_artifact.get("status") == "passed":
                    passing.append(gap_artifact)
                elif gap_artifact is not None:
                    all_warnings.extend(gap_artifact.get("warnings", []))

                if gap_raw is not None and gap_runtime is not None and not passing:
                    try:
                        legacy_composite = build_composite_artifact(
                            source,
                            matrix,
                            input_hash,
                            bounds,
                            spherical,
                            gap_raw,
                            gap_runtime,
                        )
                    except Exception as exc:  # noqa: BLE001 - fallback module boundary
                        all_warnings.append(str(exc))
                    else:
                        if legacy_composite is not None:
                            passing.append(legacy_composite)
    except RuntimeCancelled as exc:
        artifact = base_artifact(source, input_hash, bounds, "cancelled", True)
        artifact["sphericalCatalogue"] = spherical_catalogue_record(
            spherical, "complete-finite-coxeter-classification"
        )
        artifact["indexLowerBound"] = index_lower_bound_record(spherical)
        artifact["strategyAttempts"] = strategy_attempts
        artifact["warnings"].append(str(exc))
        artifact["provenance"] = {
            "backend": BACKEND_ID,
            "backendVersion": BACKEND_VERSION,
            "runtime": "managed-runtime-cancelled",
            "command": "python scripts/torsion_free_discovery.py --input <request>",
            "inputHash": input_hash,
        }
        return add_artifact_hash(artifact), 3
    except Exception as exc:  # noqa: BLE001 - managed-runtime boundary
        all_errors.append(f"Managed discovery runtime failed: {exc}")

    try:
        kernel_covers = collect_kernel_covers(finite_artifacts, spherical)
    except Exception as exc:  # noqa: BLE001 - independent certificate boundary
        all_errors.append(f"Rejected a finite-image kernel certificate: {exc}")
        kernel_covers = []
    finite_image_reports = finite_image_evidence_reports(finite_artifacts)

    if passing:
        strategy_priority = {
            STRATEGY_FINITE_IMAGE: 0,
            STRATEGY_COMPOSITE: 1,
            STRATEGY_GAP: 2,
            STRATEGY_SAGE: 3,
        }
        passing.sort(
            key=lambda artifact: (
                artifact["finiteAction"]["degree"],
                strategy_priority.get(
                    artifact.get("search", {}).get("selectedStrategy", ""), 99
                ),
            )
        )
        selected = passing[0]
        selected["strategyAttempts"] = strategy_attempts
        selected["runtimePortfolio"] = runtime_metadata
        if kernel_covers:
            selected["kernelCovers"] = kernel_covers
            selected["kernelCover"] = kernel_covers[0]
        if finite_image_reports:
            selected["finiteImageReports"] = finite_image_reports
        selected["coverOutcome"] = {
            "torsionFreeCoverCertified": True,
            "manageableCoverMaterialized": True,
            "certificateLevel": MATERIALIZED_COVER_LEVEL,
            "exactIndexKnown": True,
            "status": "materialized-cover-found",
        }
        # Failed probes and exhausted alternate rungs remain visible in the
        # structured attempt list. They are not warnings about the selected,
        # independently certified action.
        selected["warnings"] = list(dict.fromkeys(selected.get("warnings", [])))
        # Failed alternate rungs are diagnostics, not failures of the selected
        # independently certified finite action.
        selected["errors"] = []
        return add_artifact_hash(selected), 0

    attempted_statuses = {attempt["status"] for attempt in strategy_attempts}
    if "timeout" in attempted_statuses:
        final_status, code = "timeout", 2
    elif all_errors and not attempted_statuses:
        final_status, code = "failed", 1
    elif attempted_statuses and attempted_statuses <= {"skipped"}:
        final_status, code = "skipped", 0
    elif "failed" in attempted_statuses and attempted_statuses <= {"failed", "skipped"}:
        final_status, code = "failed", 1
    else:
        final_status, code = "exhausted", 0
    artifact = base_artifact(
        source,
        input_hash,
        bounds,
        final_status,
        final_status in {"skipped", "exhausted"},
    )
    artifact["sphericalCatalogue"] = spherical_catalogue_record(
        spherical, "complete-finite-coxeter-classification"
    )
    artifact["indexLowerBound"] = index_lower_bound_record(spherical)
    if gap_raw is not None:
        artifact["torsionWitnesses"] = gap_raw.get("witnesses", [])
    elif finite_artifacts:
        artifact["torsionWitnesses"] = next(
            (
                item.get("torsionWitnesses", [])
                for item in finite_artifacts
                if item.get("torsionWitnesses")
            ),
            [],
        )
    artifact["strategyAttempts"] = strategy_attempts
    artifact["search"] = {
        "method": "exact finite-image, packed-composite, bounded-GAP strategy ladder",
        "reason": "bounded-strategy-ladder-complete",
        "maxIndex": bounds["maxIndex"],
        "maxCandidates": bounds["maxCandidates"],
        "iteratorComplete": all(
            attempt["status"] in {"exhausted", "skipped"}
            for attempt in strategy_attempts
        ),
    }
    artifact["warnings"] = list(dict.fromkeys(all_warnings))
    artifact["errors"] = list(
        dict.fromkeys(all_errors if final_status == "failed" else [])
    )
    artifact["provenance"] = {
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "runtime": "strategy-ladder",
        "command": "python scripts/torsion_free_discovery.py --input <request>",
        "inputHash": input_hash,
    }
    artifact["runtimePortfolio"] = runtime_metadata
    if finite_image_reports:
        artifact["finiteImageReports"] = finite_image_reports
    if kernel_covers:
        strongest_kernel = kernel_covers[0]
        exact_index_known = (
            strongest_kernel.get("certificateLevel") == EXACT_INDEX_KERNEL_LEVEL
        )
        artifact["kernelCovers"] = kernel_covers
        artifact["kernelCover"] = strongest_kernel
        artifact["coverOutcome"] = {
            "torsionFreeCoverCertified": True,
            "manageableCoverMaterialized": False,
            "certificateLevel": strongest_kernel["certificateLevel"],
            "exactIndexKnown": exact_index_known,
            "status": (
                "exact-index-kernel-certified-not-materialized"
                if exact_index_known
                else "finite-index-kernel-certified-exact-index-unknown"
            ),
        }
        artifact["warnings"].insert(
            0,
            (
                "A normal torsion-free congruence kernel and its exact index are "
                "certified, but no cover within the configured materialization "
                "bounds was found."
                if exact_index_known
                else "A normal finite-index torsion-free congruence kernel is "
                "certified, but its exact index is not yet known and no cover "
                "has been materialized."
            ),
        )
    else:
        artifact["coverOutcome"] = {
            "torsionFreeCoverCertified": False,
            "manageableCoverMaterialized": False,
            "certificateLevel": "none",
            "exactIndexKnown": False,
            "status": "no-certified-cover",
        }
    return add_artifact_hash(artifact), code


def check_runtime(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    backend = args.backend or "auto"
    tools: list[dict[str, Any]] = []
    if backend in {"auto", "gap"}:
        gap_attempts = []
        for candidate in runtime_candidates(args.gap):
            command = [
                *candidate.command_prefix,
                "-q",
                "-c",
                'Print(GAPInfo.Version, "\\n");; QUIT_GAP(0);;',
            ]
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=15,
                    check=False,
                )
                version = completed.stdout.strip()
                available = completed.returncode == 0 and bool(version)
                gap_attempts.append(
                    {
                        "runtime": candidate.label,
                        "available": available,
                        "version": version if available else None,
                        "error": None
                        if available
                        else (completed.stderr.strip() or "GAP probe failed"),
                    }
                )
            except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
                gap_attempts.append(
                    {"runtime": candidate.label, "available": False, "error": str(exc)}
                )
        tools.append(
            {
                "tool": "gap",
                "available": any(item["available"] for item in gap_attempts),
                "attempts": gap_attempts,
            }
        )
    if backend in {"auto", "sage"}:
        sage_attempts = []
        for candidate in sage_runtime_candidates(args.sage):
            command = [*candidate.command_prefix, "--version"]
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=15,
                    check=False,
                )
                version = completed.stdout.strip() or completed.stderr.strip()
                available = completed.returncode == 0 and bool(version)
                sage_attempts.append(
                    {
                        "runtime": candidate.label,
                        "available": available,
                        "version": version if available else None,
                        "error": None if available else "Sage probe failed",
                    }
                )
            except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
                sage_attempts.append(
                    {"runtime": candidate.label, "available": False, "error": str(exc)}
                )
        tools.append(
            {
                "tool": "sage",
                "available": any(item["available"] for item in sage_attempts),
                "attempts": sage_attempts,
            }
        )
    available = any(tool["available"] for tool in tools)
    return {
        "ok": True,
        "status": "available" if available else "skipped",
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "tools": tools,
        "message": (
            "At least one exact cover-discovery runtime is callable."
            if available
            else "No requested GAP or Sage runtime was callable."
        ),
    }, 0


def self_test(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    cases = [
        ("I2(5)", FIXTURE_DIR / "i2_5.discovery.json", 10),
        ("A3", FIXTURE_DIR / "a3.discovery.json", 24),
    ]
    results = []
    failed = False
    for name, path, expected_degree in cases:
        artifact, code = discover(args, path)
        case_ok = (
            code == 0
            and artifact.get("status") == "passed"
            and artifact.get("certificate", {}).get("status") == "passed"
            and artifact.get("finiteAction", {}).get("degree") == expected_degree
            and all(
                not check["fixedVertexIds"]
                for check in artifact.get("certificate", {}).get(
                    "noFixedPointChecks", []
                )
            )
        )
        failed = failed or not case_ok
        results.append(
            {
                "name": name,
                "fixture": str(path.relative_to(SCRIPT_DIR.parent)).replace("\\", "/"),
                "expectedDegree": expected_degree,
                "actualDegree": artifact.get("finiteAction", {}).get("degree"),
                "status": artifact.get("status"),
                "passed": case_ok,
                "errors": artifact.get("errors", []),
                "warnings": artifact.get("warnings", []),
            }
        )

    if args.backend != "sage":
        # Force the direct GAP bound below the exact divisor 10. The only
        # successful GAP-side route is then the degree-2 x degree-5 diagonal
        # construction, which keeps the composition rung under live test.
        composite_args = argparse.Namespace(**vars(args))
        composite_args.backend = "gap"
        composite_args.max_index = 9
        composite_artifact, composite_code = discover(
            composite_args, FIXTURE_DIR / "i2_5.discovery.json"
        )
        composite_ok = (
            composite_code == 0
            and composite_artifact.get("status") == "passed"
            and composite_artifact.get("search", {}).get("selectedStrategy")
            == STRATEGY_COMPOSITE
            and composite_artifact.get("finiteAction", {}).get("degree") == 10
            and composite_artifact.get("composite", {}).get("moduleDegrees") == [2, 5]
        )
        failed = failed or not composite_ok
        results.append(
            {
                "name": "I2(5) composite modules",
                "fixture": "tests/fixtures/torsion-free-discovery/i2_5.discovery.json",
                "expectedDegree": 10,
                "actualDegree": composite_artifact.get("finiteAction", {}).get(
                    "degree"
                ),
                "status": composite_artifact.get("status"),
                "strategy": composite_artifact.get("search", {}).get(
                    "selectedStrategy"
                ),
                "passed": composite_ok,
                "errors": composite_artifact.get("errors", []),
                "warnings": composite_artifact.get("warnings", []),
            }
        )
    return {
        "ok": not failed,
        "status": "passed" if not failed else "failed",
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "cases": results,
    }, 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Find and certify bounded-index torsion-free Coxeter subgroups with "
            "the GAP, Sage, and composite-action ladder."
        )
    )
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--checkpoint-dir", type=Path)
    parser.add_argument(
        "--keep-scratch",
        action="store_true",
        help="Keep the managed scratch directory for backend debugging.",
    )
    parser.add_argument(
        "--cancel-file",
        type=Path,
        help="Cancel the managed native/WSL process group when this file appears.",
    )
    parser.add_argument("--backend", choices=("auto", "gap", "sage"))
    parser.add_argument("--gap", help="Explicit native GAP executable")
    parser.add_argument("--sage", help="Explicit native Sage executable")
    parser.add_argument(
        "--mod3-structural-certificate",
        type=Path,
        help=(
            "Override the bundled compact-cube GF(3) structural certificate. "
            "It is staged only when its exact Coxeter-matrix digest matches."
        ),
    )
    parser.add_argument(
        "--mod3-structural-source",
        type=Path,
        help="Override the source JSON whose hash the GF(3) certificate binds.",
    )
    parser.add_argument("--max-index", type=int)
    parser.add_argument("--max-candidates", type=int)
    parser.add_argument("--max-module-candidates", type=int)
    parser.add_argument("--max-composite-modules", type=int)
    parser.add_argument("--max-composite-combinations", type=int)
    parser.add_argument("--max-congruence-prime", type=int)
    parser.add_argument("--max-congruence-image-order", type=int)
    parser.add_argument("--max-low-index-fallback", type=int)
    parser.add_argument("--max-memory-bytes", type=int)
    parser.add_argument("--light-workers", type=int)
    parser.add_argument("--heavy-workers", type=int)
    parser.add_argument("--max-witnesses", type=int)
    parser.add_argument("--max-spherical-order", type=int)
    parser.add_argument("--max-subsets", type=int)
    parser.add_argument("--timeout", type=int)
    parser.add_argument("--check-runtime", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.check_runtime:
        artifact, code = check_runtime(args)
    elif args.self_test:
        artifact, code = self_test(args)
    elif args.input is None:
        artifact = {
            "schemaVersion": 1,
            "artifactType": ARTIFACT_TYPE,
            "status": "skipped",
            "ok": True,
            "warnings": ["Pass --input with a Coxeter system or discovery request."],
            "errors": [],
        }
        code = 0
    else:
        artifact, code = discover(args, args.input)
    print_or_write(artifact, args.output)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
