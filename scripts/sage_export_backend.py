#!/usr/bin/env python3
"""Exact Sage exporter for Coxeter Viewer 5D.

Inspection commands such as ``--contract`` and ``--check-runtime`` can run with
ordinary Python. Exact enumeration must run in a Python process where
``sage.all`` is importable. With the Sage CLI available in this workspace, one
portable invocation is:

    sage -c "import runpy, sys; sys.argv=['scripts/sage_export_backend.py',
    '--input','public/examples/I2_5.json','--radius','5',
    '--output','generated/I2_5_r5.json'];
    runpy.run_path('scripts/sage_export_backend.py', run_name='__main__')"

The exporter uses Sage algebraic real matrices as dictionary keys. The JSON
``matrixKey`` values are diagnostic hashes; exact deduplication happens before
serialization.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


BACKEND_ID = "sageExportBackend"
BACKEND_VERSION = "1.0.0"
DEDUPLICATION = "external-sage"
REQUIRED_RUNTIME = "SageMath"
CONTRACT_PATH = Path(__file__).with_name("exact_export_contract.json")
DEFAULT_MAX_RADIUS = 8
DEFAULT_MAX_NODES = 50_000
DEFAULT_MAX_EDGES = 200_000


@dataclass
class ExportNode:
    id: str
    word: list[int]
    length: int
    matrix: Any
    matrix_key: str


def nonnegative_int(raw: str) -> int:
    try:
        value = int(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("value must be an integer") from exc
    if value < 0:
        raise argparse.ArgumentTypeError("value must be nonnegative")
    return value


def positive_int(raw: str) -> int:
    value = nonnegative_int(raw)
    if value == 0:
        raise argparse.ArgumentTypeError("value must be positive")
    return value


def load_contract() -> dict[str, Any]:
    with CONTRACT_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def print_json(value: dict[str, Any], *, stream=sys.stdout) -> None:
    print(json.dumps(value, indent=2, sort_keys=True), file=stream)


def sage_runtime_status() -> dict[str, Any]:
    try:
        # Sage exposes this module only when the process is running with Sage.
        import sage.all  # type: ignore  # noqa: F401
    except Exception as exc:  # pragma: no cover - depends on local Sage install
        return {
            "ok": False,
            "code": "missing-runtime",
            "backend": BACKEND_ID,
            "requiredRuntime": REQUIRED_RUNTIME,
            "message": (
                "SageMath is not available in this Python runtime. Run this "
                "export with Sage, for example through `sage -c` or "
                "`sage -python` if your Sage build provides it."
            ),
            "detail": str(exc),
        }

    return {
        "ok": True,
        "backend": BACKEND_ID,
        "requiredRuntime": REQUIRED_RUNTIME,
        "message": "SageMath runtime is importable.",
    }


def fail(status: dict[str, Any], exit_code: int) -> int:
    print_json(status, stream=sys.stderr)
    return exit_code


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise ValueError(f"input file does not exist: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"input file is not valid JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError("input JSON must be an object")
    return data


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_path_label(path: Path) -> str:
    return str(path).replace("\\", "/")


def command_metadata(argv: list[str]) -> dict[str, Any]:
    # The outer executable may be `sage`, `sage -python`, or a local wrapper.
    # sys.argv is the deterministic part that affects exporter semantics.
    return {
        "argv": [item.replace("\\", "/") for item in argv],
        "note": "Captured from sys.argv inside the exporter process.",
    }


def validate_coxeter_input(data: dict[str, Any]) -> dict[str, Any]:
    name = data.get("name")
    rank = data.get("rank")
    generators = data.get("generators")
    matrix = data.get("coxeterMatrix")

    if data.get("schemaVersion") != 1:
        raise ValueError("input.schemaVersion must be 1")
    if not isinstance(name, str) or not name:
        raise ValueError("input.name must be a non-empty string")
    if not isinstance(rank, int) or rank < 1:
        raise ValueError("input.rank must be a positive integer")
    if not isinstance(generators, list) or len(generators) != rank:
        raise ValueError("input.generators must have exactly rank entries")
    if not isinstance(matrix, list) or len(matrix) != rank:
        raise ValueError("input.coxeterMatrix must be a rank-by-rank array")

    for i, row in enumerate(matrix):
        if not isinstance(row, list) or len(row) != rank:
            raise ValueError(f"coxeterMatrix[{i}] must have {rank} entries")

        for j, entry in enumerate(row):
            if i == j:
                if entry != 1:
                    raise ValueError(f"coxeterMatrix[{i}][{j}] must be 1")
                continue

            if entry != "inf" and (
                not isinstance(entry, int) or isinstance(entry, bool) or entry < 2
            ):
                raise ValueError(
                    f"coxeterMatrix[{i}][{j}] must be an integer >= 2 or 'inf'"
                )

            if matrix[j][i] != entry:
                raise ValueError(
                    f"coxeterMatrix must be symmetric at ({i}, {j})"
                )

    return data


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def node_id_from_word(word: list[int]) -> str:
    return "e" if not word else f"w:{'.'.join(str(item) for item in word)}"


def edge_key(source: str, target: str, generator: int) -> str:
    left, right = sorted([source, target])
    return f"e:{left}:{right}:s{generator}"


def finite_rank_two_pairs(matrix: list[list[Any]]) -> list[tuple[int, int, int]]:
    pairs: list[tuple[int, int, int]] = []
    for i in range(len(matrix)):
        for j in range(i + 1, len(matrix)):
            entry = matrix[i][j]
            if isinstance(entry, int):
                pairs.append((i, j, entry))
    return pairs


def rotate_to_smallest(boundary: list[str]) -> list[str]:
    smallest = min(range(len(boundary)), key=lambda index: boundary[index])
    return boundary[smallest:] + boundary[:smallest]


def canonical_boundary(boundary: list[str]) -> list[str]:
    forward = rotate_to_smallest(boundary)
    reverse = rotate_to_smallest(list(reversed(boundary)))
    return forward if forward <= reverse else reverse


def trace_boundary(
    start: str,
    pair: tuple[int, int],
    m: int,
    adjacency: dict[str, dict[int, str]],
) -> list[str] | None:
    boundary = [start]
    current = start

    for step in range(2 * m):
        generator = pair[step % 2]
        next_node = adjacency.get(current, {}).get(generator)
        if next_node is None:
            return None
        if step == 2 * m - 1:
            return boundary if next_node == start else None

        boundary.append(next_node)
        current = next_node

    return None


def compute_rank_two_cells(
    system: dict[str, Any],
    edges: list[dict[str, Any]],
    node_ids: Iterable[str],
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    adjacency: dict[str, dict[int, str]] = {}

    def add(source: str, target: str, generator: int) -> None:
        adjacency.setdefault(source, {})[generator] = target

    for edge in edges:
        add(edge["source"], edge["target"], edge["generator"])
        add(edge["target"], edge["source"], edge["generator"])

    cells: dict[str, dict[str, Any]] = {}
    clipped_pairs: set[str] = set()

    for i, j, m in finite_rank_two_pairs(system["coxeterMatrix"]):
        pair = (i, j)
        for node_id in sorted(node_ids):
            boundary = trace_boundary(node_id, pair, m, adjacency)
            if boundary is None:
                clipped_pairs.add(f"{i}-{j}")
                continue

            canonical = canonical_boundary(boundary)
            key = f"{i}-{j}:{'|'.join(sorted(canonical))}"
            if key not in cells:
                cells[key] = {
                    "id": f"cell:{i}-{j}:{canonical[0]}",
                    "generatorPair": [i, j],
                    "m": m,
                    "boundaryNodeIds": canonical,
                }

    warnings = []
    for pair in sorted(clipped_pairs):
        i, j = pair.split("-")
        warnings.append(
            "Some rank-two Davis cells for generator pair "
            f"({i}, {j}) are clipped by the current ball or graph caps and "
            "were not filled."
        )

    return sorted(cells.values(), key=lambda cell: cell["id"]), warnings, sorted(clipped_pairs)


def length_multiset(nodes: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[int, int] = {}
    for node in nodes:
        length = node.get("length")
        if isinstance(length, int):
            counts[length] = counts.get(length, 0) + 1
    return {str(length): counts[length] for length in sorted(counts)}


def compute_normal_form_records(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize the preferred words chosen by the exact exporter.

    The record is deliberately modest: it says these are backend-produced
    preferred reduced words, not a portable proof object for every Coxeter
    relation in the presentation.
    """

    sorted_nodes = sorted(nodes, key=lambda node: node["id"])
    return {
        "status": "derived-from-exact-export",
        "convention": "right-multiplication preferred reduced words",
        "nodeCount": len(sorted_nodes),
        "maxLength": max((node["length"] for node in sorted_nodes), default=0),
        "lengthMultiset": length_multiset(sorted_nodes),
        "records": [
            {
                "nodeId": node["id"],
                "word": node["word"],
                "length": node["length"],
                "reducedByBackend": True,
            }
            for node in sorted_nodes
        ],
    }


def compute_relation_proof_summaries(
    system: dict[str, Any],
    two_cells: list[dict[str, Any]],
    clipped_cell_pairs: list[str],
) -> dict[str, Any]:
    """Summarize visible rank-two relation witnesses.

    A finite rank-two special subgroup contributes 2m-gons. Complete exported
    cells witness the alternating relation in the visible ball; clipped pairs
    remain explicitly marked instead of being promoted to a complete proof.
    """

    cells_by_pair: dict[str, list[dict[str, Any]]] = {}
    for cell in two_cells:
        pair = cell.get("generatorPair")
        if isinstance(pair, list) and len(pair) == 2:
            cells_by_pair.setdefault(f"{pair[0]}-{pair[1]}", []).append(cell)

    clipped = set(clipped_cell_pairs)
    summaries = []
    for i, j, m in finite_rank_two_pairs(system["coxeterMatrix"]):
        pair_key = f"{i}-{j}"
        cells = sorted(cells_by_pair.get(pair_key, []), key=lambda cell: cell["id"])
        summaries.append(
            {
                "generatorPair": [i, j],
                "m": m,
                "relationWord": [generator for _ in range(m) for generator in (i, j)],
                "expectedBoundaryLength": 2 * m,
                "completeTwoCellCount": len(cells),
                "sampleCellIds": [cell["id"] for cell in cells[:3]],
                "clipped": pair_key in clipped,
                "status": (
                    "complete-visible-witnesses"
                    if pair_key not in clipped
                    else "clipped-by-radius-or-caps"
                ),
            }
        )

    return {
        "status": "derived-from-visible-rank-two-cells",
        "finitePairCount": len(summaries),
        "summaries": summaries,
        "limitations": [
            "These summaries certify exported visible rank-two boundaries only.",
            "They are not a standalone proof of the full Coxeter presentation.",
        ],
    }


def duplicate_ids(values: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        item_id = value.get("id")
        if not isinstance(item_id, str):
            continue
        if item_id in seen:
            duplicates.add(item_id)
        seen.add(item_id)
    return sorted(duplicates)


def certify_generated_ball(ball: dict[str, Any]) -> dict[str, Any]:
    """Return deterministic structural diagnostics for generated graph JSON."""
    errors: list[str] = []
    nodes = ball.get("nodes")
    edges = ball.get("edges")
    two_cells = ball.get("twoCells")
    metadata = ball.get("metadata")

    if not isinstance(nodes, list):
        errors.append("nodes must be an array")
        nodes = []
    if not isinstance(edges, list):
        errors.append("edges must be an array")
        edges = []
    if not isinstance(two_cells, list):
        errors.append("twoCells must be an array")
        two_cells = []
    if not isinstance(metadata, dict):
        errors.append("metadata must be an object")
        metadata = {}

    node_ids = {
        node.get("id")
        for node in nodes
        if isinstance(node, dict) and isinstance(node.get("id"), str)
    }
    duplicate_node_ids = duplicate_ids([node for node in nodes if isinstance(node, dict)])
    duplicate_edge_ids = duplicate_ids([edge for edge in edges if isinstance(edge, dict)])
    duplicate_cell_ids = duplicate_ids(
        [cell for cell in two_cells if isinstance(cell, dict)]
    )

    if duplicate_node_ids:
        errors.append(f"duplicate node ids: {', '.join(duplicate_node_ids)}")
    if duplicate_edge_ids:
        errors.append(f"duplicate edge ids: {', '.join(duplicate_edge_ids)}")
    if duplicate_cell_ids:
        errors.append(f"duplicate two-cell ids: {', '.join(duplicate_cell_ids)}")

    bad_length_nodes = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        word = node.get("word")
        length = node.get("length")
        if isinstance(word, list) and isinstance(length, int) and len(word) != length:
            bad_length_nodes.append(str(node.get("id")))
    if bad_length_nodes:
        errors.append(f"node length does not match word length: {', '.join(bad_length_nodes)}")

    missing_edge_refs = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source")
        target = edge.get("target")
        if source not in node_ids or target not in node_ids:
            missing_edge_refs.append(str(edge.get("id")))
    if missing_edge_refs:
        errors.append(f"edges reference missing nodes: {', '.join(missing_edge_refs)}")

    bad_cell_boundaries = []
    for cell in two_cells:
        if not isinstance(cell, dict):
            continue
        boundary = cell.get("boundaryNodeIds")
        m_value = cell.get("m")
        if not isinstance(boundary, list) or not isinstance(m_value, int):
            bad_cell_boundaries.append(str(cell.get("id")))
            continue
        if len(boundary) != 2 * m_value or any(node_id not in node_ids for node_id in boundary):
            bad_cell_boundaries.append(str(cell.get("id")))
    if bad_cell_boundaries:
        errors.append(f"two-cell boundaries are invalid: {', '.join(bad_cell_boundaries)}")

    diagnostics = {
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "twoCellCount": len(two_cells),
        "uniqueNodeIds": not duplicate_node_ids,
        "uniqueEdgeIds": not duplicate_edge_ids,
        "uniqueTwoCellIds": not duplicate_cell_ids,
        "edgeReferencesPresentNodes": not missing_edge_refs,
        "nodeLengthsMatchWords": not bad_length_nodes,
        "twoCellBoundariesClosed": not bad_cell_boundaries,
        "metadataHasBackend": isinstance(metadata.get("backend"), dict),
        "metadataHasCompleteness": isinstance(metadata.get("completeness"), dict),
        "metadataHasCapStatus": isinstance(metadata.get("capStatus"), dict),
        "metadataHasNormalFormRecords": isinstance(
            metadata.get("normalFormRecords"), dict
        ),
        "metadataHasRelationProofSummaries": isinstance(
            metadata.get("relationProofSummaries"), dict
        ),
    }

    return {
        "status": "passed" if not errors else "failed",
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "diagnostics": diagnostics,
        "errors": errors,
    }


def sage_imports() -> dict[str, Any]:
    from sage.all import AA, cos, identity_matrix, matrix, pi  # type: ignore

    return {
        "AA": AA,
        "cos": cos,
        "identity_matrix": identity_matrix,
        "matrix": matrix,
        "pi": pi,
    }


def exact_gram_value(entry: int | str, sage: dict[str, Any]) -> Any:
    aa = sage["AA"]
    if entry == "inf":
        return aa(-1)
    if entry == 2:
        return aa(0)
    return -aa(sage["cos"](sage["pi"] / entry))


def build_reflection_matrices(system: dict[str, Any], sage: dict[str, Any]) -> list[Any]:
    rank = system["rank"]
    aa = sage["AA"]
    matrix = sage["matrix"]
    identity_matrix = sage["identity_matrix"]
    gram = [
        [
            aa(1) if i == j else exact_gram_value(system["coxeterMatrix"][i][j], sage)
            for j in range(rank)
        ]
        for i in range(rank)
    ]

    reflections = []
    for generator in range(rank):
        reflection = identity_matrix(aa, rank)
        # Column j is s_i(alpha_j) = alpha_j - 2 B(alpha_j, alpha_i) alpha_i.
        for column in range(rank):
            reflection[generator, column] -= 2 * gram[column][generator]
        reflections.append(matrix(aa, reflection))

    return reflections


def matrix_tuple_key(matrix_value: Any) -> tuple[Any, ...]:
    return tuple(matrix_value.list())


def algebraic_entry_label(entry: Any) -> str:
    return str(entry).replace(" ", "")


def matrix_diagnostic_key(matrix_value: Any) -> str:
    labels = [algebraic_entry_label(entry) for entry in matrix_value.list()]
    digest = hashlib.sha256("|".join(labels).encode("utf-8")).hexdigest()
    return f"sage-aa:{digest[:24]}"


def generate_exact_cayley_ball(
    system: dict[str, Any],
    *,
    radius: int,
    max_radius: int,
    max_nodes: int,
    max_edges: int,
    created_at: str,
    input_path: Path | None = None,
    input_sha256: str | None = None,
    command: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sage = sage_imports()
    requested_radius = radius
    effective_radius = min(requested_radius, max_radius)
    warnings: list[str] = [
        "Exact Sage backend: nodes are deduplicated by Sage algebraic real reflection matrices."
    ]

    if requested_radius > max_radius:
        warnings.append(
            f"Requested radius {requested_radius} was capped at {max_radius}."
        )

    if any(entry == "inf" for row in system["coxeterMatrix"] for entry in row):
        warnings.append(
            "Infinite Coxeter entries use the standard exact Tits value -1 in the reflection representation."
        )

    reflections = build_reflection_matrices(system, sage)
    identity = sage["identity_matrix"](sage["AA"], system["rank"])
    identity_key = matrix_tuple_key(identity)
    identity_matrix_key = matrix_diagnostic_key(identity)
    nodes = [
        ExportNode(
            id="e",
            word=[],
            length=0,
            matrix=identity,
            matrix_key=identity_matrix_key,
        )
    ]
    key_to_node_id: dict[tuple[Any, ...], str] = {identity_key: "e"}
    node_by_id: dict[str, ExportNode] = {"e": nodes[0]}
    edges: dict[str, dict[str, Any]] = {}
    node_cap_hit = False
    edge_cap_hit = False

    cursor = 0
    while cursor < len(nodes):
        node = nodes[cursor]
        cursor += 1

        for generator, reflection in enumerate(reflections):
            next_matrix = node.matrix * reflection
            next_key = matrix_tuple_key(next_matrix)
            target_id = key_to_node_id.get(next_key)

            if target_id is None:
                if node.length >= effective_radius:
                    continue

                if len(nodes) >= max_nodes:
                    node_cap_hit = True
                    continue

                word = [*node.word, generator]
                target_id = node_id_from_word(word)
                next_node = ExportNode(
                    id=target_id,
                    word=word,
                    length=node.length + 1,
                    matrix=next_matrix,
                    matrix_key=matrix_diagnostic_key(next_matrix),
                )
                nodes.append(next_node)
                key_to_node_id[next_key] = target_id
                node_by_id[target_id] = next_node

            if target_id not in node_by_id:
                continue

            key = edge_key(node.id, target_id, generator)
            if key not in edges:
                if len(edges) >= max_edges:
                    edge_cap_hit = True
                    continue
                edges[key] = {
                    "id": key,
                    "source": node.id,
                    "target": target_id,
                    "generator": generator,
                }

    if node_cap_hit:
        warnings.append(
            f"Node cap {max_nodes} was reached before the radius-{effective_radius} ball completed."
        )

    if edge_cap_hit:
        warnings.append(
            f"Edge cap {max_edges} was reached before all visible edges were recorded."
        )

    serialized_edges = sorted(edges.values(), key=lambda edge: edge["id"])
    two_cells, cell_warnings, clipped_cell_pairs = compute_rank_two_cells(
        system, serialized_edges, [node.id for node in nodes]
    )
    warnings.extend(cell_warnings)

    radius_capped = requested_radius > effective_radius
    cap_status = {
        "radiusCapped": radius_capped,
        "nodeCapHit": node_cap_hit,
        "edgeCapHit": edge_cap_hit,
        "truncated": radius_capped or node_cap_hit or edge_cap_hit,
    }
    blocking_reasons = []
    if radius_capped:
        blocking_reasons.append("radius-capped")
    if node_cap_hit:
        blocking_reasons.append("node-cap-hit")
    if edge_cap_hit:
        blocking_reasons.append("edge-cap-hit")

    ball = {
        "systemName": system["name"],
        "rank": system["rank"],
        "nodes": [
            {
                "id": node.id,
                "word": node.word,
                "length": node.length,
                "matrixKey": node.matrix_key,
            }
            for node in nodes
        ],
        "edges": serialized_edges,
        "twoCells": two_cells,
        "metadata": {
            "radius": effective_radius,
            "requestedRadius": requested_radius,
            "generatorConvention": "right-multiplication",
            "deduplication": DEDUPLICATION,
            "backend": {
                "id": BACKEND_ID,
                "version": BACKEND_VERSION,
                "requiredRuntime": REQUIRED_RUNTIME,
                "command": command or command_metadata(sys.argv),
                "input": {
                    "path": stable_path_label(input_path) if input_path else None,
                    "sha256": input_sha256,
                },
            },
            "caps": {
                "maxRadius": max_radius,
                "maxNodes": max_nodes,
                "maxEdges": max_edges,
            },
            "capStatus": cap_status,
            "completeness": {
                "requestedBallComplete": not cap_status["truncated"],
                "effectiveRadiusBallComplete": not node_cap_hit and not edge_cap_hit,
                "blockingReasons": blocking_reasons,
                "rankTwoCells": {
                    "allFinitePairBoundariesComplete": not clipped_cell_pairs,
                    "clippedGeneratorPairs": clipped_cell_pairs,
                },
            },
            "createdAt": created_at,
            "warnings": warnings,
        },
    }
    ball["metadata"]["normalFormRecords"] = compute_normal_form_records(ball["nodes"])
    ball["metadata"]["relationProofSummaries"] = compute_relation_proof_summaries(
        system, two_cells, clipped_cell_pairs
    )
    ball["metadata"]["certification"] = certify_generated_ball(ball)
    return ball


def write_output(path: Path, ball: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(ball, handle, indent=2, sort_keys=True)
        handle.write("\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="SageMath exact exporter for Coxeter Viewer generated Cayley-ball JSON."
    )
    parser.add_argument("--input", type=Path, help="CoxeterSystemInput JSON file.")
    parser.add_argument("--radius", type=nonnegative_int, help="Requested ball radius.")
    parser.add_argument("--output", type=Path, help="GeneratedCayleyBall JSON output path.")
    parser.add_argument("--max-radius", type=positive_int, default=DEFAULT_MAX_RADIUS)
    parser.add_argument("--max-nodes", type=positive_int, default=DEFAULT_MAX_NODES)
    parser.add_argument("--max-edges", type=positive_int, default=DEFAULT_MAX_EDGES)
    parser.add_argument(
        "--created-at",
        default=None,
        help="Override metadata.createdAt for reproducible fixtures.",
    )
    parser.add_argument(
        "--contract",
        action="store_true",
        help="Print the exporter JSON contract and exit.",
    )
    parser.add_argument(
        "--check-runtime",
        action="store_true",
        help="Report whether this process is running with SageMath available.",
    )
    parser.add_argument(
        "--certify-output",
        type=Path,
        nargs="+",
        help="Validate generated Cayley-ball JSON files without importing Sage.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.contract:
        print_json(load_contract())
        return 0

    if args.check_runtime:
        print_json(sage_runtime_status())
        return 0

    if args.certify_output:
        try:
            results = []
            for path in args.certify_output:
                ball = load_json(path)
                certification = certify_generated_ball(ball)
                results.append(
                    {
                        "path": stable_path_label(path),
                        "sha256": sha256_file(path),
                        **certification,
                    }
                )
        except ValueError as exc:
            return fail(
                {
                    "ok": False,
                    "code": "invalid-certification-input",
                    "backend": BACKEND_ID,
                    "message": str(exc),
                },
                4,
            )

        ok = all(result["status"] == "passed" for result in results)
        print_json(
            {
                "ok": ok,
                "backend": BACKEND_ID,
                "backendVersion": BACKEND_VERSION,
                "results": results,
            }
        )
        return 0 if ok else 4

    if args.input is None or args.radius is None or args.output is None:
        parser.error("--input, --radius, and --output are required for export")

    runtime = sage_runtime_status()
    if not runtime["ok"]:
        return fail(runtime, 2)

    try:
        raw_input = load_json(args.input)
        input_sha256 = sha256_file(args.input)
        system = validate_coxeter_input(raw_input)
        ball = generate_exact_cayley_ball(
            system,
            radius=args.radius,
            max_radius=args.max_radius,
            max_nodes=args.max_nodes,
            max_edges=args.max_edges,
            created_at=args.created_at or utc_now(),
            input_path=args.input,
            input_sha256=input_sha256,
            command=command_metadata(sys.argv),
        )
        write_output(args.output, ball)
    except ValueError as exc:
        return fail(
            {
                "ok": False,
                "code": "invalid-export-input",
                "backend": BACKEND_ID,
                "message": str(exc),
            },
            4,
        )

    print_json(
        {
            "ok": True,
            "backend": BACKEND_ID,
            "backendVersion": BACKEND_VERSION,
            "deduplication": DEDUPLICATION,
            "output": str(args.output),
            "systemName": ball["systemName"],
            "radius": ball["metadata"]["radius"],
            "nodes": len(ball["nodes"]),
            "edges": len(ball["edges"]),
            "twoCells": len(ball["twoCells"]),
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
