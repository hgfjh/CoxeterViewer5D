#!/usr/bin/env python3
"""GAP/KBMAG exact exporter launcher.

Inspection commands are safe on machines without GAP. Generation requires a GAP
runtime that can load KBMAG; the GAP script then enumerates finite spherical
Coxeter examples through an exact finite permutation image, and this wrapper
serializes the shared ``GeneratedCayleyBall`` JSON contract.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from sage_export_backend import (
    command_metadata,
    compute_normal_form_records,
    compute_rank_two_cells,
    compute_relation_proof_summaries,
    edge_key,
    fail,
    load_contract,
    load_json,
    node_id_from_word,
    nonnegative_int,
    positive_int,
    print_json,
    sha256_file,
    stable_path_label,
    utc_now,
    validate_coxeter_input,
    write_output,
)
from sage_export_backend import certify_generated_ball as structural_certify_generated_ball


BACKEND_ID = "gapKbmagExportBackend"
BACKEND_VERSION = "1.0.0"
DEDUPLICATION = "external-gap-kbmag"
REQUIRED_RUNTIME = "GAP with KBMAG"
SCRIPT_DIR = Path(__file__).resolve().parent
CONTRACT_PATH = SCRIPT_DIR / "exact_export_contract.json"
GAP_SCRIPT_PATH = SCRIPT_DIR / "gap_kbmag_export_backend.g"
DEFAULT_MAX_RADIUS = 8
DEFAULT_MAX_NODES = 50_000
DEFAULT_MAX_EDGES = 200_000
DEFAULT_GAP_TIMEOUT_SECONDS = 60


def resolve_gap(executable: str) -> str | None:
    if Path(executable).exists():
        return executable
    return shutil.which(executable)


def missing_gap_status(executable: str) -> dict[str, Any]:
    return {
        "ok": False,
        "code": "missing-runtime",
        "backend": BACKEND_ID,
        "requiredRuntime": REQUIRED_RUNTIME,
        "message": (
            f"GAP executable `{executable}` was not found. Install GAP with "
            "KBMAG, or pass --gap-executable."
        ),
    }


def gap_string_literal(value: str) -> str:
    escaped = (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )
    return f'"{escaped}"'


def gap_bootstrap_args(argv: list[str]) -> list[str]:
    gap_argv = ", ".join(gap_string_literal(argument) for argument in argv)
    script_path = gap_string_literal(str(GAP_SCRIPT_PATH))
    return [
        "-q",
        "--quitonbreak",
        "-x",
        "10000",
        "-c",
        f"ARGV := [{gap_argv}]; Read({script_path});",
    ]


def gap_runtime_status(executable: str, timeout_seconds: int) -> dict[str, Any]:
    gap = resolve_gap(executable)
    if gap is None:
        return missing_gap_status(executable)

    try:
        completed = subprocess.run(
            [gap, *gap_bootstrap_args(["--check-runtime"])],
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "code": "runtime-check-timeout",
            "backend": BACKEND_ID,
            "requiredRuntime": REQUIRED_RUNTIME,
            "message": f"GAP runtime check exceeded {timeout_seconds} seconds.",
        }

    payload = completed.stdout.strip().splitlines()[-1] if completed.stdout.strip() else ""
    try:
        status = json.loads(payload)
    except json.JSONDecodeError:
        return {
            "ok": False,
            "code": "runtime-check-unparseable",
            "backend": BACKEND_ID,
            "requiredRuntime": REQUIRED_RUNTIME,
            "message": "GAP runtime check did not return JSON.",
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }

    status.setdefault("gapExecutable", gap)
    return status


def coxeter_gram(system: dict[str, Any]) -> list[list[float]]:
    rank = system["rank"]
    matrix = system["coxeterMatrix"]
    gram: list[list[float]] = []
    for i in range(rank):
        row: list[float] = []
        for j in range(rank):
            if i == j:
                row.append(1.0)
                continue

            entry = matrix[i][j]
            if entry == "inf":
                row.append(-1.0)
            elif entry == 2:
                row.append(0.0)
            else:
                row.append(-math.cos(math.pi / entry))
        gram.append(row)
    return gram


def is_positive_definite(matrix: list[list[float]], *, tolerance: float = 1e-10) -> bool:
    """Cholesky test used only as a finite-type guard before GAP runs.

    GAP can spend a long time trying to enumerate an infinite finitely presented
    group. The exact export still comes from GAP; this floating-point check only
    rejects inputs that are visibly outside the finite spherical MVP.
    """

    size = len(matrix)
    lower = [[0.0 for _ in range(size)] for _ in range(size)]
    for i in range(size):
        for j in range(i + 1):
            value = matrix[i][j] - sum(lower[i][k] * lower[j][k] for k in range(j))
            if i == j:
                if value <= tolerance:
                    return False
                lower[i][j] = math.sqrt(value)
            else:
                lower[i][j] = value / lower[j][j]
    return True


def finite_spherical_preflight(system: dict[str, Any]) -> dict[str, Any]:
    if any(entry == "inf" for row in system["coxeterMatrix"] for entry in row):
        return {
            "ok": False,
            "code": "unsupported-coxeter-system",
            "backend": BACKEND_ID,
            "deduplication": DEDUPLICATION,
            "message": (
                "The GAP/KBMAG exporter currently supports finite spherical "
                "Coxeter inputs only. Infinite Coxeter entries are rejected "
                "before GAP enumeration to avoid a nonterminating word problem."
            ),
        }

    if not is_positive_definite(coxeter_gram(system)):
        return {
            "ok": False,
            "code": "unsupported-coxeter-system",
            "backend": BACKEND_ID,
            "deduplication": DEDUPLICATION,
            "message": (
                "The GAP/KBMAG exporter currently supports finite spherical "
                "Coxeter inputs only. The standard Coxeter Gram matrix did not "
                "pass the positive-definite preflight."
            ),
        }

    return {"ok": True}


def gap_matrix_literal(matrix: list[list[Any]]) -> str:
    rows = []
    for row in matrix:
        entries = ["0" if entry == "inf" else str(entry) for entry in row]
        rows.append(f"[{', '.join(entries)}]")
    return f"[{', '.join(rows)}]"


def write_gap_data(
    path: Path,
    *,
    system: dict[str, Any],
    radius: int,
    max_nodes: int,
    max_edges: int,
) -> None:
    # The temporary GAP file contains only validated integers and lists. We use
    # GAP syntax instead of JSON so the exporter does not depend on a JSON
    # package being installed in GAP.
    path.write_text(
        "\n".join(
            [
                "COXETER_VIEWER_INPUT := rec(",
                f"  rank := {system['rank']},",
                f"  radius := {radius},",
                f"  maxNodes := {max_nodes},",
                f"  maxEdges := {max_edges},",
                f"  coxeterMatrix := {gap_matrix_literal(system['coxeterMatrix'])}",
                ");",
                "",
            ]
        ),
        encoding="utf-8",
        newline="\n",
    )


def parse_bool(raw: str) -> bool:
    if raw == "true":
        return True
    if raw == "false":
        return False
    raise ValueError(f"invalid GAP boolean field: {raw}")


def parse_word(raw: str) -> list[int]:
    if raw == "":
        return []
    return [int(part) for part in raw.split(",")]


def parse_gap_raw_output(path: Path) -> dict[str, Any]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise ValueError("GAP did not write its raw Cayley-ball output") from exc

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    diagnostics: dict[str, Any] = {}
    node_cap_hit = False
    edge_cap_hit = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split("|")
        tag = parts[0]

        if tag == "STATUS":
            if parts[1] != "ok":
                raise ValueError(f"GAP raw export status was {parts[1]}")
        elif tag == "GAP_VERSION":
            diagnostics["gapVersion"] = parts[1]
        elif tag == "KBMAG_VERSION":
            diagnostics["kbmagVersion"] = parts[1]
        elif tag == "GROUP_ORDER":
            diagnostics["groupOrder"] = int(parts[1])
        elif tag == "NODE_CAP_HIT":
            node_cap_hit = parse_bool(parts[1])
        elif tag == "EDGE_CAP_HIT":
            edge_cap_hit = parse_bool(parts[1])
        elif tag == "NODE":
            if len(parts) != 4:
                raise ValueError(f"invalid GAP node line: {line}")
            nodes.append(
                {
                    "gapKey": parts[1],
                    "length": int(parts[2]),
                    "word": parse_word(parts[3]),
                }
            )
        elif tag == "EDGE":
            if len(parts) != 4:
                raise ValueError(f"invalid GAP edge line: {line}")
            edges.append(
                {
                    "sourceKey": parts[1],
                    "targetKey": parts[2],
                    "generator": int(parts[3]),
                }
            )
        else:
            raise ValueError(f"unknown GAP raw output tag: {tag}")

    if not nodes:
        raise ValueError("GAP raw export did not contain any nodes")

    return {
        "nodes": nodes,
        "edges": edges,
        "diagnostics": diagnostics,
        "nodeCapHit": node_cap_hit,
        "edgeCapHit": edge_cap_hit,
    }


def parse_gap_status(stdout: str, stderr: str) -> dict[str, Any] | None:
    for line in reversed([*stdout.splitlines(), *stderr.splitlines()]):
        stripped = line.strip()
        if not stripped.startswith("{") or not stripped.endswith("}"):
            continue
        try:
            status = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if isinstance(status, dict):
            return status
    return None


def gap_diagnostic_key(gap_key: str) -> str:
    digest = hashlib.sha256(gap_key.encode("utf-8")).hexdigest()
    return f"gap-perm:{digest[:24]}"


def certify_generated_ball(ball: dict[str, Any]) -> dict[str, Any]:
    certification = structural_certify_generated_ball(ball)
    certification["backend"] = BACKEND_ID
    certification["backendVersion"] = BACKEND_VERSION
    return certification


def build_generated_ball(
    *,
    system: dict[str, Any],
    raw: dict[str, Any],
    requested_radius: int,
    effective_radius: int,
    max_radius: int,
    max_nodes: int,
    max_edges: int,
    created_at: str,
    input_path: Path,
    input_sha256: str,
    command: dict[str, Any],
) -> dict[str, Any]:
    warnings: list[str] = [
        "Exact GAP/KBMAG backend: GAP loaded KBMAG and deduplicated nodes through a finite permutation image of the Coxeter presentation."
    ]

    if requested_radius > max_radius:
        warnings.append(f"Requested radius {requested_radius} was capped at {max_radius}.")

    nodes = []
    gap_key_to_node_id: dict[str, str] = {}
    for raw_node in raw["nodes"]:
        node_id = node_id_from_word(raw_node["word"])
        gap_key_to_node_id[raw_node["gapKey"]] = node_id
        nodes.append(
            {
                "id": node_id,
                "word": raw_node["word"],
                "length": raw_node["length"],
                "matrixKey": gap_diagnostic_key(raw_node["gapKey"]),
            }
        )

    edges: dict[str, dict[str, Any]] = {}
    for raw_edge in raw["edges"]:
        source = gap_key_to_node_id.get(raw_edge["sourceKey"])
        target = gap_key_to_node_id.get(raw_edge["targetKey"])
        if source is None or target is None:
            raise ValueError("GAP edge referenced a node key that was not exported")
        generator = raw_edge["generator"]
        key = edge_key(source, target, generator)
        edges[key] = {
            "id": key,
            "source": source,
            "target": target,
            "generator": generator,
        }

    serialized_edges = sorted(edges.values(), key=lambda edge: edge["id"])
    two_cells, cell_warnings, clipped_cell_pairs = compute_rank_two_cells(
        system, serialized_edges, [node["id"] for node in nodes]
    )
    warnings.extend(cell_warnings)

    radius_capped = requested_radius > effective_radius
    node_cap_hit = raw["nodeCapHit"]
    edge_cap_hit = raw["edgeCapHit"]
    if node_cap_hit:
        warnings.append(
            f"Node cap {max_nodes} was reached before the radius-{effective_radius} ball completed."
        )
    if edge_cap_hit:
        warnings.append(
            f"Edge cap {max_edges} was reached before all visible edges were recorded."
        )

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
        "nodes": nodes,
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
                "command": command,
                "input": {
                    "path": stable_path_label(input_path),
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
            "gapDiagnostics": raw["diagnostics"],
        },
    }
    ball["metadata"]["normalFormRecords"] = compute_normal_form_records(ball["nodes"])
    ball["metadata"]["relationProofSummaries"] = compute_relation_proof_summaries(
        system, two_cells, clipped_cell_pairs
    )
    ball["metadata"]["certification"] = certify_generated_ball(ball)
    return ball


def run_gap_export(
    *,
    gap: str,
    system: dict[str, Any],
    radius: int,
    max_nodes: int,
    max_edges: int,
    timeout_seconds: int,
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="coxeter-gap-") as directory:
        temp_dir = Path(directory)
        data_path = temp_dir / "input.g"
        raw_path = temp_dir / "raw-export.txt"
        write_gap_data(
            data_path,
            system=system,
            radius=radius,
            max_nodes=max_nodes,
            max_edges=max_edges,
        )

        try:
            completed = subprocess.run(
                [
                    gap,
                    *gap_bootstrap_args(
                        [
                            "--data",
                            str(data_path),
                            "--raw-output",
                            str(raw_path),
                        ]
                    ),
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError(
                f"GAP/KBMAG export exceeded {timeout_seconds} seconds."
            ) from exc

        if completed.returncode != 0:
            status = parse_gap_status(completed.stdout, completed.stderr)
            if status is None:
                status = {
                    "ok": False,
                    "code": "gap-export-failed",
                    "backend": BACKEND_ID,
                    "message": "GAP/KBMAG export failed without a parseable JSON status.",
                    "stdout": completed.stdout,
                    "stderr": completed.stderr,
                }
            raise RuntimeError(json.dumps(status, sort_keys=True))

        return parse_gap_raw_output(raw_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "GAP/KBMAG external exporter launcher for Coxeter Viewer generated "
            "Cayley-ball JSON."
        )
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
        "--gap-executable",
        default="gap",
        help="GAP executable path or command name. Defaults to `gap`.",
    )
    parser.add_argument(
        "--runtime-timeout",
        default=15,
        type=nonnegative_int,
        help="Seconds allowed for the GAP/KBMAG runtime check.",
    )
    parser.add_argument(
        "--gap-timeout",
        default=DEFAULT_GAP_TIMEOUT_SECONDS,
        type=positive_int,
        help="Seconds allowed for GAP finite-group enumeration.",
    )
    parser.add_argument(
        "--contract",
        action="store_true",
        help="Print the exporter JSON contract and exit.",
    )
    parser.add_argument(
        "--check-runtime",
        action="store_true",
        help="Report whether GAP and KBMAG are available.",
    )
    parser.add_argument(
        "--certify-output",
        type=Path,
        nargs="+",
        help="Validate generated Cayley-ball JSON files without running GAP.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.contract:
        print_json(load_contract())
        return 0

    if args.check_runtime:
        print_json(gap_runtime_status(args.gap_executable, args.runtime_timeout))
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

    runtime = gap_runtime_status(args.gap_executable, args.runtime_timeout)
    if not runtime.get("ok"):
        return fail(runtime, 2)

    try:
        raw_input = load_json(args.input)
        input_sha256 = sha256_file(args.input)
        system = validate_coxeter_input(raw_input)
        preflight = finite_spherical_preflight(system)
        if not preflight["ok"]:
            return fail(preflight, 4)

        requested_radius = args.radius
        effective_radius = min(requested_radius, args.max_radius)
        raw = run_gap_export(
            gap=runtime["gapExecutable"],
            system=system,
            radius=effective_radius,
            max_nodes=args.max_nodes,
            max_edges=args.max_edges,
            timeout_seconds=args.gap_timeout,
        )
        ball = build_generated_ball(
            system=system,
            raw=raw,
            requested_radius=requested_radius,
            effective_radius=effective_radius,
            max_radius=args.max_radius,
            max_nodes=args.max_nodes,
            max_edges=args.max_edges,
            created_at=args.created_at or utc_now(),
            input_path=args.input,
            input_sha256=input_sha256,
            command=command_metadata(sys.argv),
        )
        write_output(args.output, ball)
    except TimeoutError as exc:
        return fail(
            {
                "ok": False,
                "code": "gap-export-timeout",
                "backend": BACKEND_ID,
                "requiredRuntime": REQUIRED_RUNTIME,
                "message": str(exc),
            },
            3,
        )
    except RuntimeError as exc:
        try:
            status = json.loads(str(exc))
        except json.JSONDecodeError:
            status = {
                "ok": False,
                "code": "gap-export-failed",
                "backend": BACKEND_ID,
                "message": str(exc),
            }
        return fail(status, 3)
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
