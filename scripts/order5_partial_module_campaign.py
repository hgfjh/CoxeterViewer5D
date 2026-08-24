#!/usr/bin/env python3
"""Run the order-5-first partial permutation-module campaign.

This campaign answers a deliberately narrower question than torsion-free
subgroup discovery: which exact transitive actions make which prime-order
torsion witnesses fixed-point-free?  Several partial actions may later be
combined by the Everitt portfolio solver.  A partial module is never promoted
to a torsion-free cover on its own.

The inexpensive first layer consists of every nonzero character
``W -> C2``.  Such a character is constant on each connected component of the
odd-labelled Coxeter graph, so these actions can be enumerated and certified
without GAP.  The structured-target layer first runs bounded,
conjugacy-reduced S5/S6 anchor searches, then replays candidates retained by
earlier finite-target artifacts.  Completeness claims are restricted to those
declared action families; a negative run is not a global partial-module
obstruction.
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import itertools
import json
import os
import subprocess
import sys
from collections import deque
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import finite_image_module_catalogue as module_catalogue  # noqa: E402


SCHEMA_VERSION = 1
ARTIFACT_TYPE = "order5-first-partial-module-campaign"
CAMPAIGN_VERSION = "1.0.0"
DEFAULT_SOURCE = REPO_ROOT / "public" / "examples" / "compact_5_cube_gamma1.json"
DEFAULT_ARTIFACT_DIR = SCRIPT_DIR / "certificates" / "torsion-free"
DEFAULT_CONFIG_DIR = SCRIPT_DIR / "search-configs"
DEFAULT_MAX_ARTIFACTS = 32
DEFAULT_MAX_STRUCTURED_RESULTS = 512
DEFAULT_MAX_NODES_PER_ANCHOR = 100_000
DEFAULT_MAX_SOLUTIONS_PER_ANCHOR = 16


class CampaignError(ValueError):
    """Input data cannot support the exact claims made by this campaign."""


def canonical_json(value: Any) -> str:
    """Serialize report data deterministically and reject non-JSON numbers."""

    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise CampaignError(f"Value is not canonical JSON: {exc}") from exc


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf8")).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _read_location_bytes(location: str | Path) -> bytes:
    """Read a Windows/local path or an explicit absolute WSL path.

    The finite-image caches intentionally live on WSL's ext4 filesystem.  We
    use ``wsl cat --`` rather than copying them into the OneDrive worktree.
    """

    text = str(location)
    path = Path(text)
    if path.is_file():
        return path.read_bytes()
    if text.startswith("~/"):
        completed = subprocess.run(
            [
                "wsl",
                "sh",
                "-lc",
                'cat -- "$HOME/$1"',
                "coxeter-read-json",
                text[2:],
            ],
            check=False,
            capture_output=True,
        )
        if completed.returncode == 0:
            return completed.stdout
        detail = completed.stderr.decode("utf8", errors="replace").strip()
        raise CampaignError(f"Cannot read WSL JSON {text}: {detail}")
    if text.startswith("/"):
        completed = subprocess.run(
            ["wsl", "cat", "--", text],
            check=False,
            capture_output=True,
        )
        if completed.returncode == 0:
            return completed.stdout
        detail = completed.stderr.decode("utf8", errors="replace").strip()
        raise CampaignError(f"Cannot read WSL JSON {text}: {detail}")
    raise CampaignError(f"JSON input does not exist: {text}")


def read_json_object(location: str | Path) -> dict[str, Any]:
    try:
        value = json.loads(_read_location_bytes(location).decode("utf8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CampaignError(f"Cannot decode JSON from {location}: {exc}") from exc
    if not isinstance(value, dict):
        raise CampaignError(f"{location} must contain one JSON object.")
    return value


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf8",
    )
    os.replace(temporary, path)


def normalize_coxeter_matrix(source: Mapping[str, Any]) -> list[list[int]]:
    """Validate a Coxeter matrix, encoding infinity as zero like the backends."""

    rank = source.get("rank")
    if isinstance(rank, bool) or not isinstance(rank, int) or rank < 1:
        raise CampaignError("source.rank must be a positive integer.")
    raw = source.get("coxeterMatrix")
    if not isinstance(raw, list) or len(raw) != rank:
        raise CampaignError("source.coxeterMatrix must have rank rows.")
    matrix: list[list[int]] = []
    for left, row in enumerate(raw):
        if not isinstance(row, list) or len(row) != rank:
            raise CampaignError(f"Coxeter row {left} must have rank entries.")
        checked: list[int] = []
        for right, entry in enumerate(row):
            value = 0 if entry == "inf" else entry
            if isinstance(value, bool) or not isinstance(value, int):
                raise CampaignError("Coxeter entries must be integers or 'inf'.")
            if left == right and value != 1:
                raise CampaignError("Coxeter diagonal entries must be one.")
            if left != right and value not in {0} and value < 2:
                raise CampaignError("Off-diagonal entries must be >= 2 or 'inf'.")
            checked.append(value)
        matrix.append(checked)
    if any(matrix[i][j] != matrix[j][i] for i in range(rank) for j in range(rank)):
        raise CampaignError("The Coxeter matrix must be symmetric.")
    return matrix


def odd_label_components(
    matrix: Sequence[Sequence[int]],
) -> tuple[tuple[int, ...], ...]:
    """Return components generated by finite odd Coxeter labels.

    In the abelianization every generator has order two.  The relation
    ``(s_i s_j)^m`` identifies ``s_i`` and ``s_j`` exactly when ``m`` is odd.
    Hence a character to ``C2`` is constant on these components.
    """

    rank = len(matrix)
    unseen = set(range(rank))
    components: list[tuple[int, ...]] = []
    while unseen:
        root = min(unseen)
        unseen.remove(root)
        queue = [root]
        component: list[int] = []
        while queue:
            current = queue.pop()
            component.append(current)
            adjacent = sorted(
                vertex
                for vertex in unseen
                if matrix[current][vertex] >= 3 and matrix[current][vertex] % 2 == 1
            )
            for vertex in reversed(adjacent):
                unseen.remove(vertex)
                queue.append(vertex)
        components.append(tuple(sorted(component)))
    return tuple(sorted(components))


Permutation = tuple[int, ...]


def identity_permutation(degree: int) -> Permutation:
    return tuple(range(degree))


def compose_permutations(left: Permutation, right: Permutation) -> Permutation:
    """Compose point actions in word-reading order: first left, then right."""

    if len(left) != len(right):
        raise CampaignError("Permutation degrees disagree.")
    return tuple(right[left[point]] for point in range(len(left)))


def permutation_power(value: Permutation, exponent: int) -> Permutation:
    result = identity_permutation(len(value))
    factor = value
    power = exponent
    while power:
        if power & 1:
            result = compose_permutations(result, factor)
        factor = compose_permutations(factor, factor)
        power >>= 1
    return result


def evaluate_word(rows: Sequence[Permutation], word: Sequence[int]) -> Permutation:
    if not rows:
        raise CampaignError("A permutation action needs generator rows.")
    result = identity_permutation(len(rows[0]))
    for generator in word:
        if isinstance(generator, bool) or not isinstance(generator, int):
            raise CampaignError("Witness words must contain generator indexes.")
        if generator < 0 or generator >= len(rows):
            raise CampaignError(f"Witness generator {generator} is out of range.")
        result = compose_permutations(result, rows[generator])
    return result


def action_is_transitive(rows: Sequence[Permutation]) -> bool:
    degree = len(rows[0])
    reached = {0}
    queue = deque([0])
    while queue:
        point = queue.popleft()
        for row in rows:
            target = row[point]
            if target not in reached:
                reached.add(target)
                queue.append(target)
    return len(reached) == degree


@functools.lru_cache(maxsize=None)
def all_involutions(degree: int) -> tuple[Permutation, ...]:
    """List the identity and every involution of a small symmetric target."""

    identity = identity_permutation(degree)
    return tuple(
        permutation
        for permutation in itertools.permutations(range(degree))
        if compose_permutations(permutation, permutation) == identity
    )


def transposition(degree: int, left: int, right: int) -> Permutation:
    value = list(range(degree))
    value[left], value[right] = value[right], value[left]
    return tuple(value)


def generated_group_order(rows: Sequence[Permutation], maximum: int) -> int:
    """Close a small permutation group, stopping above its declared order."""

    identity = identity_permutation(len(rows[0]))
    reached = {identity}
    queue = deque([identity])
    while queue:
        current = queue.popleft()
        for row in rows:
            target = compose_permutations(current, row)
            if target in reached:
                continue
            reached.add(target)
            if len(reached) > maximum:
                return len(reached)
            queue.append(target)
    return len(reached)


def coxeter_path_order(
    matrix: Sequence[Sequence[int]], component: Sequence[int]
) -> tuple[int, ...]:
    """Put an A-type odd component in its canonical path order."""

    vertices = tuple(sorted(component))
    adjacency = {
        vertex: sorted(
            other
            for other in vertices
            if other != vertex and matrix[vertex][other] == 3
        )
        for vertex in vertices
    }
    if any(len(neighbors) > 2 for neighbors in adjacency.values()):
        raise CampaignError("A structured A-type anchor is not a path.")
    endpoints = sorted(
        vertex for vertex, neighbors in adjacency.items() if len(neighbors) == 1
    )
    if len(vertices) == 1:
        return vertices
    if len(endpoints) != 2:
        raise CampaignError("A structured A-type anchor has no two endpoints.")
    result = [endpoints[0]]
    previous: int | None = None
    current = endpoints[0]
    while len(result) < len(vertices):
        candidates = [value for value in adjacency[current] if value != previous]
        if len(candidates) != 1:
            raise CampaignError("A structured A-type anchor is disconnected.")
        previous, current = current, candidates[0]
        result.append(current)
    forward = tuple(result)
    reverse = tuple(reversed(result))
    return min(forward, reverse)


def odd_components_on_subset(
    matrix: Sequence[Sequence[int]], subset: Sequence[int]
) -> tuple[tuple[int, ...], ...]:
    remaining = set(subset)
    components: list[tuple[int, ...]] = []
    while remaining:
        root = min(remaining)
        remaining.remove(root)
        stack = [root]
        component: list[int] = []
        while stack:
            current = stack.pop()
            component.append(current)
            neighbors = sorted(
                other
                for other in remaining
                if matrix[current][other] >= 3 and matrix[current][other] % 2 == 1
            )
            for other in reversed(neighbors):
                remaining.remove(other)
                stack.append(other)
        components.append(tuple(sorted(component)))
    return tuple(sorted(components, key=lambda item: (-len(item), item)))


@functools.lru_cache(maxsize=1)
def outer_s6_a5_anchor() -> tuple[Permutation, ...]:
    """Find one canonical outer A5 Coxeter tuple in S6.

    Inner automorphisms send adjacent transpositions to transpositions.  The
    exceptional outer automorphism of S6 sends them to triple transpositions.
    Fixing the lexicographically first first generator and then the first full
    tuple gives a deterministic representative of the second anchor class.
    """

    degree = 6
    identity = identity_permutation(degree)
    triple = tuple(
        value
        for value in all_involutions(degree)
        if value != identity
        and sum(value[point] != point for point in range(degree)) == 6
    )
    first = triple[0]

    def compatible(prefix: Sequence[Permutation], candidate: Permutation) -> bool:
        position = len(prefix)
        for other_position, other in enumerate(prefix):
            expected = 3 if other_position == position - 1 else 2
            if (
                permutation_power(compose_permutations(other, candidate), expected)
                != identity
            ):
                return False
        return True

    def search(prefix: tuple[Permutation, ...]) -> tuple[Permutation, ...] | None:
        if len(prefix) == 5:
            return prefix if generated_group_order(prefix, 720) == 720 else None
        for candidate in triple:
            if compatible(prefix, candidate):
                result = search((*prefix, candidate))
                if result is not None:
                    return result
        return None

    result = search((first,))
    if result is None:
        raise CampaignError("Could not construct the canonical outer S6 A5 anchor.")
    return result


def canonical_anchor_rows(
    matrix: Sequence[Sequence[int]],
    component: Sequence[int],
    target_degree: int,
    anchor_kind: str,
) -> dict[int, Permutation]:
    path = coxeter_path_order(matrix, component)
    if len(path) != target_degree - 1:
        raise CampaignError("A-type anchor rank and symmetric target disagree.")
    if anchor_kind == "adjacent-transpositions":
        images = tuple(
            transposition(target_degree, index, index + 1)
            for index in range(target_degree - 1)
        )
    elif anchor_kind == "outer-triple-transpositions" and target_degree == 6:
        images = outer_s6_a5_anchor()
    else:
        raise CampaignError(f"Unsupported structured anchor kind {anchor_kind!r}.")
    return {generator: images[index] for index, generator in enumerate(path)}


def relation_compatible(
    left: Permutation, right: Permutation, coxeter_order: int
) -> bool:
    return coxeter_order == 0 or permutation_power(
        compose_permutations(left, right), coxeter_order
    ) == identity_permutation(len(left))


def search_anchored_homomorphisms(
    matrix: Sequence[Sequence[int]],
    anchor: Mapping[int, Permutation],
    *,
    target_degree: int,
    max_nodes: int,
    max_solutions: int,
) -> tuple[list[tuple[Permutation, ...]], dict[str, Any]]:
    """Extend one canonical local anchor by MRV Coxeter propagation."""

    domain = all_involutions(target_degree)
    assigned = dict(anchor)
    solutions: list[tuple[Permutation, ...]] = []
    nodes = 0
    bounded = False

    def candidates(generator: int) -> tuple[Permutation, ...]:
        return tuple(
            value
            for value in domain
            if all(
                relation_compatible(value, other, matrix[generator][other_generator])
                for other_generator, other in assigned.items()
            )
        )

    def recurse() -> None:
        nonlocal nodes, bounded
        if len(solutions) >= max_solutions:
            bounded = True
            return
        if nodes >= max_nodes:
            bounded = True
            return
        remaining = [index for index in range(len(matrix)) if index not in assigned]
        if not remaining:
            solutions.append(tuple(assigned[index] for index in range(len(matrix))))
            return
        choices = [(candidates(index), index) for index in remaining]
        choices.sort(key=lambda item: (len(item[0]), item[1]))
        values, generator = choices[0]
        if not values:
            return
        for value in values:
            if nodes >= max_nodes or len(solutions) >= max_solutions:
                bounded = True
                return
            nodes += 1
            assigned[generator] = value
            # An empty future domain is a reusable local contradiction; detect
            # it before descending another level.
            if all(candidates(other) for other in remaining if other != generator):
                recurse()
            assigned.pop(generator)

    recurse()
    return solutions, {
        "searchNodes": nodes,
        "solutionCount": len(solutions),
        "bounded": bounded,
        "completeWithinDeclaredAnchor": not bounded,
        "targetInvolutionCount": len(domain),
    }


def induced_subset_action(
    rows: Sequence[Permutation], subset_size: int
) -> tuple[Permutation, ...]:
    """Induce a symmetric-target action on its k-element subsets."""

    target_degree = len(rows[0])
    subsets = tuple(itertools.combinations(range(target_degree), subset_size))
    index = {value: offset for offset, value in enumerate(subsets)}
    return tuple(
        tuple(
            index[tuple(sorted(row[point] for point in subset))] for subset in subsets
        )
        for row in rows
    )


def mine_structured_symmetric_modules(
    *,
    matrix: Sequence[Sequence[int]],
    witnesses: Sequence[Mapping[str, Any]],
    witness_sha256: str,
    source_sha256: str,
    matrix_sha256: str,
    prioritized_order_five: Sequence[Mapping[str, Any]],
    max_nodes_per_anchor: int,
    max_solutions_per_anchor: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Mine declared S5/S6 actions around faithful order-5 local anchors."""

    specs: list[dict[str, Any]] = []
    seen_subsets: set[tuple[int, ...]] = set()
    for witness in prioritized_order_five:
        subset = tuple(witness["subset"])
        if subset in seen_subsets:
            continue
        seen_subsets.add(subset)
        components = odd_components_on_subset(matrix, subset)
        if witness["sphericalType"] == "A5":
            component = components[0]
            specs.extend(
                {
                    "witnessId": witness["id"],
                    "sphericalType": "A5",
                    "subset": subset,
                    "anchorComponent": component,
                    "target": "S6",
                    "targetDegree": 6,
                    "anchorKind": anchor_kind,
                    "subsetActionSizes": (1, 2, 3),
                }
                for anchor_kind in (
                    "adjacent-transpositions",
                    "outer-triple-transpositions",
                )
            )
        elif witness["sphericalType"] == "A4 x A1":
            component = next((value for value in components if len(value) == 4), ())
            if not component:
                raise CampaignError("An A4 x A1 witness has no A4 anchor component.")
            specs.append(
                {
                    "witnessId": witness["id"],
                    "sphericalType": "A4 x A1",
                    "subset": subset,
                    "anchorComponent": component,
                    "target": "S5",
                    "targetDegree": 5,
                    "anchorKind": "adjacent-transpositions",
                    "subsetActionSizes": (1, 2),
                }
            )
    modules: list[dict[str, Any]] = []
    action_hashes: set[str] = set()
    searches: list[dict[str, Any]] = []
    for spec in specs:
        anchor = canonical_anchor_rows(
            matrix,
            spec["anchorComponent"],
            spec["targetDegree"],
            spec["anchorKind"],
        )
        solutions, metrics = search_anchored_homomorphisms(
            matrix,
            anchor,
            target_degree=spec["targetDegree"],
            max_nodes=max_nodes_per_anchor,
            max_solutions=max_solutions_per_anchor,
        )
        new_modules = 0
        for solution_ordinal, solution in enumerate(solutions):
            for subset_size in spec["subsetActionSizes"]:
                rows = induced_subset_action(solution, subset_size)
                action_hash = sha256_json(
                    {"generatorRows": [list(row) for row in rows]}
                )
                if action_hash in action_hashes:
                    continue
                action_hashes.add(action_hash)
                module = build_exact_inline_module(
                    module_kind="structured-symmetric-subset-action",
                    origin={
                        "method": "canonical-faithful-local-anchor-csp",
                        "target": spec["target"],
                        "targetNaturalDegree": spec["targetDegree"],
                        "inducedSubsetSize": subset_size,
                        "anchorKind": spec["anchorKind"],
                        "anchorSubset": list(spec["subset"]),
                        "anchorComponent": list(spec["anchorComponent"]),
                        "priorityWitnessId": spec["witnessId"],
                        "solutionOrdinal": solution_ordinal,
                    },
                    rows=rows,
                    matrix=matrix,
                    witnesses=witnesses,
                    witness_sha256=witness_sha256,
                    source_sha256=source_sha256,
                    matrix_sha256=matrix_sha256,
                )
                if module["fixedPointCoverage"]["coveredCount"]:
                    modules.append(module)
                    new_modules += 1
        searches.append(
            {
                "target": spec["target"],
                "anchorKind": spec["anchorKind"],
                "anchorSubset": list(spec["subset"]),
                "anchorComponent": list(spec["anchorComponent"]),
                "priorityWitnessId": spec["witnessId"],
                "inducedSubsetActionSizes": list(spec["subsetActionSizes"]),
                **metrics,
                "retainedModuleCount": new_modules,
            }
        )
    return modules, {
        "mode": "bounded-canonical-faithful-anchor-csp",
        "anchorSearchCount": len(searches),
        "searches": searches,
        "allDeclaredAnchorsComplete": all(
            item["completeWithinDeclaredAnchor"] for item in searches
        ),
        "rawRetainedModuleCount": len(modules),
        "conjugacyReduction": {
            "S5": "one adjacent-transposition A4 anchor modulo inner automorphisms",
            "S6": (
                "one adjacent-transposition and one triple-transposition A5 anchor, "
                "representing the inner and exceptional-outer classes"
            ),
        },
        "declaredActionFamilies": [
            "S5 on 1- and 2-subsets",
            "S6 on 1-, 2-, and 3-subsets",
        ],
        "externalSearchesRun": False,
    }


def certify_coxeter_relations(
    rows: Sequence[Permutation], matrix: Sequence[Sequence[int]]
) -> dict[str, Any]:
    """Replay every involution and finite Coxeter relation exactly."""

    rank = len(matrix)
    if len(rows) != rank:
        raise CampaignError("Permutation row count must equal Coxeter rank.")
    degree = len(rows[0])
    expected_points = tuple(range(degree))
    for row in rows:
        if len(row) != degree or tuple(sorted(row)) != expected_points:
            raise CampaignError("Each generator row must be a full permutation.")
    involutions = [
        permutation_power(row, 2) == identity_permutation(degree) for row in rows
    ]
    pair_checks: list[dict[str, Any]] = []
    for left in range(rank):
        for right in range(left + 1, rank):
            order = matrix[left][right]
            if order == 0:
                continue
            product = compose_permutations(rows[left], rows[right])
            pair_checks.append(
                {
                    "pair": [left, right],
                    "m": order,
                    "passed": permutation_power(product, order)
                    == identity_permutation(degree),
                }
            )
    passed = all(involutions) and all(item["passed"] for item in pair_checks)
    return {
        "passed": passed,
        "involutionCount": sum(involutions),
        "finitePairCount": len(pair_checks),
        "failedPairs": [item for item in pair_checks if not item["passed"]],
    }


def validate_witness_catalogue(
    catalogue: Mapping[str, Any], matrix_sha256: str
) -> tuple[list[dict[str, Any]], str]:
    if catalogue.get("artifactType") != "coxeter-spherical-witness-cache":
        raise CampaignError("Unexpected witness catalogue artifactType.")
    if catalogue.get("matrixDigest") != matrix_sha256:
        raise CampaignError("Witness catalogue belongs to another Coxeter matrix.")
    witnesses = catalogue.get("witnesses")
    if not isinstance(witnesses, list) or not witnesses:
        raise CampaignError("Witness catalogue must contain witnesses.")
    if catalogue.get("witnessCount") != len(witnesses):
        raise CampaignError("Witness catalogue count is inconsistent.")
    witness_sha256 = sha256_json(witnesses)
    if catalogue.get("witnessDigest") != witness_sha256:
        raise CampaignError("Witness catalogue digest is stale or corrupt.")
    ids: set[str] = set()
    checked: list[dict[str, Any]] = []
    for index, raw in enumerate(witnesses):
        if not isinstance(raw, dict):
            raise CampaignError("Each torsion witness must be an object.")
        witness_id = raw.get("id")
        word = raw.get("word")
        order = raw.get("primeOrder")
        if not isinstance(witness_id, str) or not witness_id or witness_id in ids:
            raise CampaignError("Witness ids must be distinct nonempty strings.")
        if not isinstance(word, list):
            raise CampaignError(f"Witness {witness_id} has no word.")
        if isinstance(order, bool) or not isinstance(order, int) or order < 2:
            raise CampaignError(f"Witness {witness_id} has invalid primeOrder.")
        item = json.loads(canonical_json(raw))
        item["catalogueIndex"] = index
        checked.append(item)
        ids.add(witness_id)
    return checked, witness_sha256


def fixed_point_free_indexes(
    rows: Sequence[Permutation], witnesses: Sequence[Mapping[str, Any]]
) -> tuple[int, ...]:
    covered: list[int] = []
    for index, witness in enumerate(witnesses):
        image = evaluate_word(rows, witness["word"])
        if all(image[point] != point for point in range(len(image))):
            covered.append(index)
    return tuple(covered)


def _module_core(module: Mapping[str, Any]) -> dict[str, Any]:
    value = json.loads(canonical_json(module))
    value.pop("id", None)
    value.pop("moduleSha256", None)
    return value


def build_exact_inline_module(
    *,
    module_kind: str,
    origin: Mapping[str, Any],
    rows: Sequence[Permutation],
    matrix: Sequence[Sequence[int]],
    witnesses: Sequence[Mapping[str, Any]],
    witness_sha256: str,
    source_sha256: str,
    matrix_sha256: str,
) -> dict[str, Any]:
    relation_check = certify_coxeter_relations(rows, matrix)
    transitive = action_is_transitive(rows)
    if not relation_check["passed"] or not transitive:
        raise CampaignError("A mined module failed exact action checks.")
    covered = fixed_point_free_indexes(rows, witnesses)
    coverage = module_catalogue.build_fixed_point_coverage(
        covered, len(witnesses), witness_sha256
    )
    row_value = [list(row) for row in rows]
    module: dict[str, Any] = {
        "kind": module_kind,
        "degree": len(rows[0]),
        "origin": json.loads(canonical_json(origin)),
        "inputHashes": {
            "sourceSha256": source_sha256,
            "matrixSha256": matrix_sha256,
            "witnessSha256": witness_sha256,
        },
        "generatorRows": row_value,
        "actionSha256": sha256_json({"generatorRows": row_value}),
        "fixedPointCoverage": coverage,
        "exactChecks": {
            "transitive": True,
            "coxeterRelations": True,
            "fixedPointCoverage": True,
        },
        "relationReplay": relation_check,
        "status": "partial" if len(covered) < len(witnesses) else "torsion-free",
    }
    digest = sha256_json(_module_core(module))
    module["moduleSha256"] = digest
    module["id"] = f"o5mod-{digest[:20]}"
    return module


def build_degree_two_modules(
    matrix: Sequence[Sequence[int]],
    witnesses: Sequence[Mapping[str, Any]],
    witness_sha256: str,
    source_sha256: str,
    matrix_sha256: str,
) -> list[dict[str, Any]]:
    """Enumerate all nontrivial abelianization characters as exact actions."""

    components = odd_label_components(matrix)
    modules: list[dict[str, Any]] = []
    for mask in range(1, 1 << len(components)):
        active = {
            generator
            for component_index, component in enumerate(components)
            if mask & (1 << component_index)
            for generator in component
        }
        rows = [
            (1, 0) if generator in active else (0, 1)
            for generator in range(len(matrix))
        ]
        modules.append(
            build_exact_inline_module(
                module_kind="odd-component-c2-character",
                origin={
                    "method": "complete-nonzero-character-enumeration",
                    "componentMask": mask,
                    "activeOddComponents": [
                        list(component)
                        for index, component in enumerate(components)
                        if mask & (1 << index)
                    ],
                },
                rows=rows,
                matrix=matrix,
                witnesses=witnesses,
                witness_sha256=witness_sha256,
                source_sha256=source_sha256,
                matrix_sha256=matrix_sha256,
            )
        )
    return sorted(modules, key=lambda module: module["id"])


def coverage_indexes(module: Mapping[str, Any], witness_sha256: str) -> frozenset[int]:
    return frozenset(
        module_catalogue.coverage_indexes(module["fixedPointCoverage"], witness_sha256)
    )


def pareto_optimal_modules(
    modules: Sequence[Mapping[str, Any]], witness_sha256: str
) -> list[dict[str, Any]]:
    """Keep modules not dominated by lower degree and superset coverage."""

    canonical = [json.loads(canonical_json(module)) for module in modules]
    canonical.sort(key=lambda module: (module["degree"], module["id"]))
    unique: list[dict[str, Any]] = []
    seen: set[tuple[int, frozenset[int]]] = set()
    for module in canonical:
        key = (int(module["degree"]), coverage_indexes(module, witness_sha256))
        if key not in seen:
            unique.append(module)
            seen.add(key)
    retained: list[dict[str, Any]] = []
    for candidate in unique:
        candidate_degree = int(candidate["degree"])
        candidate_coverage = coverage_indexes(candidate, witness_sha256)
        dominated = False
        for other in unique:
            if other is candidate:
                continue
            other_degree = int(other["degree"])
            other_coverage = coverage_indexes(other, witness_sha256)
            if (
                other_degree <= candidate_degree
                and other_coverage.issuperset(candidate_coverage)
                and (
                    other_degree < candidate_degree
                    or other_coverage != candidate_coverage
                )
            ):
                dominated = True
                break
        if not dominated and candidate_coverage:
            retained.append(candidate)
    return sorted(retained, key=lambda module: (module["degree"], module["id"]))


def _existing_module_summaries(
    catalogue: Mapping[str, Any],
    *,
    matrix_sha256: str,
    witness_sha256: str,
    witness_count: int,
    rank: int,
) -> tuple[list[dict[str, Any]], str]:
    checked = module_catalogue.validate_catalogue(
        catalogue,
        expected_hashes={
            "matrixSha256": matrix_sha256,
            "witnessSha256": witness_sha256,
        },
        require_complete=True,
    )
    if checked["witnessCount"] != witness_count:
        raise CampaignError("Existing module catalogue witness count is stale.")
    if checked["sourceGeneratorCount"] != rank:
        raise CampaignError("Existing module catalogue generator count is stale.")
    modules: list[dict[str, Any]] = []
    for record in checked["modules"]:
        modules.append(
            {
                "id": record["id"],
                "moduleSha256": record["moduleSha256"],
                "kind": "validated-existing-catalogue-module",
                "degree": record["degree"],
                "origin": record["origin"],
                "inputHashes": record["inputHashes"],
                "actionSha256": record["packedPermutationRows"]["sha256"],
                "fixedPointCoverage": record["fixedPointCoverage"],
                "exactChecks": record["exactChecks"],
                "status": record["status"],
            }
        )
    return modules, checked["hashes"]["sourceSha256"]


def prioritized_order_five_witnesses(
    witnesses: Sequence[Mapping[str, Any]], covered: Iterable[int]
) -> list[dict[str, Any]]:
    covered_set = set(covered)
    records = []
    for index, witness in enumerate(witnesses):
        if witness["primeOrder"] != 5 or index in covered_set:
            continue
        records.append(
            {
                "catalogueIndex": index,
                "id": witness["id"],
                "sphericalType": witness.get("sphericalType"),
                "subset": witness.get("subset"),
                "word": witness["word"],
            }
        )
    return sorted(
        records,
        key=lambda item: (
            0 if item["sphericalType"] == "A5" else 1,
            item["subset"],
            len(item["word"]),
            item["word"],
            item["id"],
        ),
    )


def _relative_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def discover_structured_inputs(
    artifact_dir: Path,
    config_dir: Path,
    *,
    max_artifacts: int,
) -> tuple[list[Path], list[Path]]:
    """Choose the existing finite targets with faithful A4/A5-style anchors."""

    config_patterns = ("*s6*.json", "*a6*.json", "*weyl*.json")
    configs = sorted(
        {path for pattern in config_patterns for path in config_dir.glob(pattern)}
    )
    artifacts: list[Path] = []
    if artifact_dir.is_dir():
        for path in sorted(artifact_dir.glob("*.json")):
            if len(artifacts) >= max_artifacts:
                break
            try:
                value = read_json_object(path)
            except CampaignError:
                continue
            if value.get("track") != "finite-target-synthesis":
                continue
            rows = value.get("evidence", {}).get("boundedSearchResults", [])
            if not isinstance(rows, list):
                continue
            anchor_types = {
                row.get("containmentGate", {}).get("anchor", {}).get("type")
                for row in rows
                if isinstance(row, dict)
            }
            if anchor_types.intersection({"A4", "A5", "A4 x A1"}):
                artifacts.append(path)
    return artifacts, configs


def replay_structured_artifacts(
    artifact_paths: Sequence[Path],
    *,
    matrix_hash: str,
    max_results: int,
) -> dict[str, Any]:
    """Summarize conjugacy-reduced retained candidates from prior searches.

    Existing finite-target reports contain verified global solutions, not all
    locally valid rejected tuples.  Consequently this replay can add retained
    actions but cannot certify that no partial action exists in a target.
    """

    summaries: list[dict[str, Any]] = []
    result_count = 0
    retained_solution_count = 0
    complete_result_count = 0
    truncated = False
    for path in artifact_paths:
        artifact = read_json_object(path)
        if artifact.get("matrixHash") != matrix_hash:
            continue
        rows = artifact.get("evidence", {}).get("boundedSearchResults", [])
        if not isinstance(rows, list):
            continue
        selected = rows[: max(0, max_results - result_count)]
        if len(selected) < len(rows):
            truncated = True
        target_ids: list[str] = []
        anchor_types: set[str] = set()
        methods: set[str] = set()
        artifact_solutions = 0
        artifact_complete = 0
        for row in selected:
            if not isinstance(row, dict):
                continue
            result_count += 1
            target_ids.append(str(row.get("targetId", "unknown")))
            if row.get("complete") is True:
                complete_result_count += 1
                artifact_complete += 1
            solutions = row.get("verifiedSolutions", row.get("solutions", []))
            if isinstance(solutions, list):
                retained_solution_count += len(solutions)
                artifact_solutions += len(solutions)
            anchor = row.get("containmentGate", {}).get("anchor", {})
            if isinstance(anchor, dict):
                if isinstance(anchor.get("type"), str):
                    anchor_types.add(anchor["type"])
                if isinstance(anchor.get("catalogueMethod"), str):
                    methods.add(anchor["catalogueMethod"])
        summaries.append(
            {
                "artifact": _relative_path(path),
                "artifactSha256": sha256_bytes(path.read_bytes()),
                "declaredComplete": artifact.get("complete") is True,
                "targetCount": len(target_ids),
                "completeTargetCount": artifact_complete,
                "retainedSolutionCount": artifact_solutions,
                "targetIdsSha256": sha256_json(sorted(target_ids)),
                "faithfulLocalAnchorTypes": sorted(anchor_types),
                "conjugacyReductionMethods": sorted(methods),
            }
        )
        if result_count >= max_results:
            truncated = truncated or any(
                other not in artifact_paths[: len(summaries)]
                for other in artifact_paths
            )
            break
    return {
        "mode": "retained-candidate-artifact-replay",
        "artifactCount": len(summaries),
        "targetResultCount": result_count,
        "completeTargetResultCount": complete_result_count,
        "retainedSolutionCount": retained_solution_count,
        "truncatedByBound": truncated,
        "artifacts": summaries,
        "scopeComplete": not truncated
        and all(item["declaredComplete"] for item in summaries),
        "partialHomomorphismEnumerationComplete": False,
        "reason": (
            "The source artifacts retain verified global solutions, not every "
            "rejected partial tuple. Replay is complete only for retained candidates."
        ),
    }


def summarize_config_inputs(config_paths: Sequence[Path]) -> list[dict[str, Any]]:
    return [
        {
            "path": _relative_path(path),
            "sha256": sha256_bytes(path.read_bytes()),
        }
        for path in sorted(config_paths)
    ]


def _coverage_summary(
    modules: Sequence[Mapping[str, Any]],
    witnesses: Sequence[Mapping[str, Any]],
    witness_sha256: str,
) -> tuple[set[int], dict[str, Any]]:
    union: set[int] = set()
    for module in modules:
        union.update(coverage_indexes(module, witness_sha256))
    orders = sorted({int(witness["primeOrder"]) for witness in witnesses})
    covered_by_order = {
        str(order): sum(
            1
            for index, witness in enumerate(witnesses)
            if witness["primeOrder"] == order and index in union
        )
        for order in orders
    }
    total_by_order = {
        str(order): sum(1 for witness in witnesses if witness["primeOrder"] == order)
        for order in orders
    }
    remaining_by_order = {
        key: total_by_order[key] - covered_by_order[key] for key in total_by_order
    }
    return union, {
        "coveredCount": len(union),
        "witnessCount": len(witnesses),
        "coveredByPrimeOrder": covered_by_order,
        "remainingByPrimeOrder": remaining_by_order,
        "uncoveredIndexes": sorted(set(range(len(witnesses))) - union),
    }


def _module_report(module: Mapping[str, Any], witness_sha256: str) -> dict[str, Any]:
    return {
        "id": module["id"],
        "kind": module["kind"],
        "degree": module["degree"],
        "moduleSha256": module["moduleSha256"],
        "coveredCount": len(coverage_indexes(module, witness_sha256)),
        "fixedPointCoverage": module["fixedPointCoverage"],
        "origin": module["origin"],
        "exactChecks": module["exactChecks"],
        **(
            {"generatorRows": module["generatorRows"]}
            if "generatorRows" in module
            else {"actionSha256": module["actionSha256"]}
        ),
    }


def build_dry_run_report(
    source: Mapping[str, Any],
    matrix: Sequence[Sequence[int]],
    artifact_paths: Sequence[Path],
    config_paths: Sequence[Path],
    *,
    max_nodes_per_anchor: int = DEFAULT_MAX_NODES_PER_ANCHOR,
    max_solutions_per_anchor: int = DEFAULT_MAX_SOLUTIONS_PER_ANCHOR,
) -> dict[str, Any]:
    matrix_sha256 = sha256_json({"coxeterMatrix": matrix})
    body: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "campaignVersion": CAMPAIGN_VERSION,
        "mode": "dry-run",
        "status": "planned-not-executed",
        "source": {
            "name": source.get("name", "unnamed Coxeter system"),
            "rank": len(matrix),
            "matrixSha256": matrix_sha256,
            "oddLabelComponents": [list(item) for item in odd_label_components(matrix)],
        },
        "plan": {
            "degreeTwoCharacters": (1 << len(odd_label_components(matrix))) - 1,
            "orderFiveFirst": True,
            "structuredArtifactCount": len(artifact_paths),
            "structuredSymmetricTargets": ["S5", "S6"],
            "maxNodesPerAnchor": max_nodes_per_anchor,
            "maxSolutionsPerAnchor": max_solutions_per_anchor,
            "configInputs": summarize_config_inputs(config_paths),
            "externalSearchesWillRun": False,
        },
        "gate": {
            "status": "not-evaluated-dry-run",
            "readyForCompositeSearch": False,
        },
        "claims": ["deterministic campaign plan"],
        "nonClaims": [
            "exact witness coverage",
            "partial-module obstruction",
            "torsion-free subgroup",
        ],
    }
    body["reportSha256"] = sha256_json(body)
    return body


def build_real_report(
    *,
    source: Mapping[str, Any],
    matrix: Sequence[Sequence[int]],
    witness_catalogue: Mapping[str, Any],
    existing_catalogue: Mapping[str, Any] | None,
    artifact_paths: Sequence[Path],
    config_paths: Sequence[Path],
    max_structured_results: int,
    max_nodes_per_anchor: int = DEFAULT_MAX_NODES_PER_ANCHOR,
    max_solutions_per_anchor: int = DEFAULT_MAX_SOLUTIONS_PER_ANCHOR,
) -> dict[str, Any]:
    matrix_sha256 = sha256_json({"coxeterMatrix": matrix})
    matrix_hash = sha256_json(matrix)
    witnesses, witness_sha256 = validate_witness_catalogue(
        witness_catalogue, matrix_sha256
    )
    source_object_sha256 = sha256_json(source)
    existing_modules: list[dict[str, Any]] = []
    source_sha256 = source_object_sha256
    existing_catalogue_sha256: str | None = None
    if existing_catalogue is not None:
        existing_modules, source_sha256 = _existing_module_summaries(
            existing_catalogue,
            matrix_sha256=matrix_sha256,
            witness_sha256=witness_sha256,
            witness_count=len(witnesses),
            rank=len(matrix),
        )
        existing_catalogue_sha256 = existing_catalogue["catalogueSha256"]
    degree_two = build_degree_two_modules(
        matrix,
        witnesses,
        witness_sha256,
        source_sha256,
        matrix_sha256,
    )
    baseline_modules = [*degree_two, *existing_modules]
    baseline_pareto = pareto_optimal_modules(baseline_modules, witness_sha256)
    baseline_union, baseline_coverage = _coverage_summary(
        baseline_pareto, witnesses, witness_sha256
    )
    baseline_order_five = prioritized_order_five_witnesses(witnesses, baseline_union)
    mined_modules, direct_mining = mine_structured_symmetric_modules(
        matrix=matrix,
        witnesses=witnesses,
        witness_sha256=witness_sha256,
        source_sha256=source_sha256,
        matrix_sha256=matrix_sha256,
        prioritized_order_five=baseline_order_five,
        max_nodes_per_anchor=max_nodes_per_anchor,
        max_solutions_per_anchor=max_solutions_per_anchor,
    )
    all_modules = [*baseline_modules, *mined_modules]
    pareto = pareto_optimal_modules(all_modules, witness_sha256)
    union, coverage = _coverage_summary(pareto, witnesses, witness_sha256)
    order_five = prioritized_order_five_witnesses(witnesses, union)
    structured = replay_structured_artifacts(
        artifact_paths,
        matrix_hash=matrix_hash,
        max_results=max_structured_results,
    )
    ready = coverage["coveredCount"] == len(witnesses)
    if ready:
        gate_status = "ready-for-composite-search"
        obstruction = None
    elif order_five:
        gate_status = "blocked-order-5-witness-coverage"
        obstruction = {
            "kind": "uncovered-order-5-witnesses-in-current-module-union",
            "count": len(order_five),
            "scope": (
                "exact C2 characters, supplied exact module catalogue, and "
                "retained candidates in the declared structured artifacts"
            ),
            "meaning": (
                "No composite of the currently available modules can remove "
                "all torsion because these order-5 witnesses occur in every factor."
            ),
            "nonClaim": (
                "This does not prove that no useful S5/S6 partial module exists; "
                "the replayed artifacts did not enumerate every partial tuple."
            ),
        }
    else:
        gate_status = "blocked-incomplete-witness-union"
        obstruction = {
            "kind": "uncovered-prime-order-witnesses",
            "count": len(witnesses) - coverage["coveredCount"],
            "scope": "current exact Pareto module portfolio",
            "meaning": "Composition is premature until every witness is covered somewhere.",
        }
    body: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "artifactType": ARTIFACT_TYPE,
        "campaignVersion": CAMPAIGN_VERSION,
        "mode": "real",
        "status": gate_status,
        "source": {
            "name": source.get("name", "unnamed Coxeter system"),
            "rank": len(matrix),
            "sourceObjectSha256": source_object_sha256,
            "moduleSourceSha256": source_sha256,
            "matrixSha256": matrix_sha256,
            "witnessSha256": witness_sha256,
            "witnessCount": len(witnesses),
            "oddLabelComponents": [list(item) for item in odd_label_components(matrix)],
        },
        "degreeTwoCharacters": {
            "enumerationComplete": True,
            "nontrivialCharacterCount": len(degree_two),
            "modules": [
                _module_report(module, witness_sha256) for module in degree_two
            ],
        },
        "baselineCatalogue": {
            "supplied": existing_catalogue is not None,
            "catalogueSha256": existing_catalogue_sha256,
            "moduleCount": len(existing_modules),
        },
        "orderFivePriority": {
            "totalOrderFiveWitnesses": sum(
                witness["primeOrder"] == 5 for witness in witnesses
            ),
            "initialUncoveredCount": len(baseline_order_five),
            "uncoveredCount": len(order_five),
            "uncoveredWitnesses": order_five,
        },
        "directStructuredMining": {
            **direct_mining,
            "initialCoverage": baseline_coverage,
            "minedModules": [
                _module_report(module, witness_sha256)
                for module in pareto_optimal_modules(mined_modules, witness_sha256)
            ],
        },
        "structuredTargetMining": {
            **structured,
            "configInputs": summarize_config_inputs(config_paths),
            "externalSearchesRun": False,
        },
        "paretoPortfolio": {
            "incomingModuleCount": len(all_modules),
            "retainedModuleCount": len(pareto),
            "modules": [_module_report(module, witness_sha256) for module in pareto],
        },
        "unionCoverage": coverage,
        "gate": {
            "status": gate_status,
            "readyForCompositeSearch": ready,
            "requiredCoverage": len(witnesses),
            "observedCoverage": coverage["coveredCount"],
            "obstruction": obstruction,
            "nextStep": (
                "run all diagonal orbits and double cosets"
                if ready
                else "mine exact partial modules covering the prioritized order-5 witnesses"
            ),
        },
        "scope": {
            "complete": {
                "nonzeroC2Characters": True,
                "suppliedCatalogueValidation": existing_catalogue is not None,
                "declaredS5S6AnchorSearches": direct_mining[
                    "allDeclaredAnchorsComplete"
                ],
                "retainedStructuredCandidateReplay": structured["scopeComplete"],
            },
            "notComplete": [
                "homomorphisms outside the declared faithful S5/S6 anchor classes",
                "all transitive partial actions",
                "S5/S6 coset actions outside the declared subset-action families",
                "larger structured targets not represented by retained artifact candidates",
            ],
        },
        "claims": [
            "exact C2 character actions and relation checks",
            "exact fixed-point coverage for every reported module",
            "Pareto optimality within the supplied module set",
        ],
        "nonClaims": [
            "global completeness outside the declared scopes",
            "nonexistence of an order-5-covering partial module",
            "torsion-free subgroup",
            "virtual fibering",
        ],
    }
    body["reportSha256"] = sha256_json(body)
    return body


def _default_wsl_witness(matrix_sha256: str) -> str:
    return (
        "~/.cache/coxeter-viewer/portfolio-cache/"
        f"{matrix_sha256}/spherical-witnesses-seed9-2.2.0.json"
    )


def _default_wsl_catalogue(matrix_sha256: str) -> str:
    return (
        "~/.cache/coxeter-viewer/portfolio-cache/"
        f"{matrix_sha256}/partial-module-catalogues-v1/aggregate.json"
    )


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    mode = value.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="print the bounded plan")
    mode.add_argument("--run", action="store_true", help="run exact in-process checks")
    value.add_argument("--source", default=str(DEFAULT_SOURCE))
    value.add_argument("--witness-catalogue")
    value.add_argument("--module-catalogue")
    value.add_argument("--artifact-dir", default=str(DEFAULT_ARTIFACT_DIR))
    value.add_argument("--config-dir", default=str(DEFAULT_CONFIG_DIR))
    value.add_argument("--max-artifacts", type=int, default=DEFAULT_MAX_ARTIFACTS)
    value.add_argument(
        "--max-structured-results",
        type=int,
        default=DEFAULT_MAX_STRUCTURED_RESULTS,
    )
    value.add_argument(
        "--max-nodes-per-anchor",
        type=int,
        default=DEFAULT_MAX_NODES_PER_ANCHOR,
    )
    value.add_argument(
        "--max-solutions-per-anchor",
        type=int,
        default=DEFAULT_MAX_SOLUTIONS_PER_ANCHOR,
    )
    value.add_argument("--output", type=Path)
    value.add_argument(
        "--json",
        action="store_true",
        help="Print the full report instead of the concise decision summary.",
    )
    return value


def concise_summary(report: Mapping[str, Any]) -> str:
    """Return the campaign decision without dumping certificate internals."""

    if report.get("mode") != "real":
        plan = report.get("plan", {})
        return (
            "order-5 partial modules: dry-run; "
            f"{plan.get('degreeTwoCharacters', 0)} degree-2 characters; "
            f"{plan.get('structuredArtifactCount', 0)} retained artifacts"
        )
    coverage = report.get("unionCoverage", {})
    priority = report.get("orderFivePriority", {})
    gate = report.get("gate", {})
    return (
        "order-5 partial modules: "
        f"{coverage.get('coveredCount', 0)}/{coverage.get('witnessCount', 0)} "
        "witnesses covered; "
        f"{priority.get('uncoveredCount', 0)} order-5 witnesses uncovered; "
        f"gate={gate.get('status', report.get('status', 'unknown'))}"
    )


def run_cli(arguments: Sequence[str] | None = None) -> dict[str, Any]:
    args = parser().parse_args(arguments)
    if (
        args.max_artifacts < 1
        or args.max_structured_results < 1
        or args.max_nodes_per_anchor < 1
        or args.max_solutions_per_anchor < 1
    ):
        raise CampaignError("Campaign bounds must be positive.")
    source = read_json_object(args.source)
    matrix = normalize_coxeter_matrix(source)
    artifacts, configs = discover_structured_inputs(
        Path(args.artifact_dir),
        Path(args.config_dir),
        max_artifacts=args.max_artifacts,
    )
    if not args.run:
        report = build_dry_run_report(
            source,
            matrix,
            artifacts,
            configs,
            max_nodes_per_anchor=args.max_nodes_per_anchor,
            max_solutions_per_anchor=args.max_solutions_per_anchor,
        )
    else:
        matrix_sha256 = sha256_json({"coxeterMatrix": matrix})
        witness_location = args.witness_catalogue or _default_wsl_witness(matrix_sha256)
        module_location = args.module_catalogue or _default_wsl_catalogue(matrix_sha256)
        witness_catalogue = read_json_object(witness_location)
        try:
            existing_catalogue = read_json_object(module_location)
        except CampaignError:
            if args.module_catalogue:
                raise
            existing_catalogue = None
        report = build_real_report(
            source=source,
            matrix=matrix,
            witness_catalogue=witness_catalogue,
            existing_catalogue=existing_catalogue,
            artifact_paths=artifacts,
            config_paths=configs,
            max_structured_results=args.max_structured_results,
            max_nodes_per_anchor=args.max_nodes_per_anchor,
            max_solutions_per_anchor=args.max_solutions_per_anchor,
        )
    if args.output is not None:
        atomic_write_json(args.output, report)
    return report


def main(arguments: Sequence[str] | None = None) -> int:
    try:
        report = run_cli(arguments)
    except CampaignError as exc:
        print(f"order5 campaign error: {exc}", file=sys.stderr)
        return 2
    show_json = parser().parse_args(arguments).json
    print(
        json.dumps(report, indent=2, sort_keys=True, allow_nan=False)
        if show_json
        else concise_summary(report)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
