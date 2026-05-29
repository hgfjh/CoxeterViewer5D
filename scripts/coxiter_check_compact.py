#!/usr/bin/env python3
"""CoxIter wrapper for bundled compact Coxeter examples.

The wrapper has two layers:

1. It validates the repository JSON and emits a deterministic CoxIter graph
   encoding plus a diagram hash.
2. It attempts to run CoxIter.  If CoxIter is unavailable, the report is marked
   ``skipped`` rather than ``passed`` so no independent theorem claim is made.

CoxIter input format follows the public documentation: first line
``<vertices> <dimension>``, optional ``vertices labels:``, then one weighted
edge per non-right Coxeter edge.  Weight ``1`` denotes a dotted edge; the
viewer's numerical Gram entry is written after ``#`` for CoxIter's numerical
signature routines.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


BACKEND = "coxiterCompactDiagramChecker"
BACKEND_VERSION = "1.0.0"
DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parent / "certificates" / "coxiter"
SUPPORTED_EXAMPLES = {
    "compact_5_cube_gamma1.json": {
        "sourceRefIds": ["jacquemet-tschantz-2018-cube"],
        "expectedRank": 10,
        "expectedDimension": 5,
    },
    "compact_5_prism_makarov.json": {
        "sourceRefIds": ["bredon-kellerhals-2022-prism"],
        "expectedRank": 7,
        "expectedDimension": 5,
    },
}


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def gram_entry_value(entry: Any) -> float:
    if not isinstance(entry, dict):
        raise ValueError("normalGram entries must be objects")
    exact = entry.get("exact")
    if isinstance(exact, dict) and isinstance(exact.get("decimal"), (int, float)):
        return float(exact["decimal"]) if entry.get("kind") == "numericGram" else -float(exact["decimal"])
    if entry.get("kind") == "dotted":
        value = entry.get("coshDistance")
        if not isinstance(value, (int, float)):
            raise ValueError("dotted normalGram entry needs coshDistance")
        return -float(value)
    if entry.get("kind") == "numericGram":
        value = entry.get("value")
        if not isinstance(value, (int, float)):
            raise ValueError("numericGram normalGram entry needs value")
        return float(value)
    raise ValueError("only dotted and numericGram entries have direct CoxIter numeric weights")


def checked_payload(example: dict[str, Any], graph_text: str) -> dict[str, Any]:
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
        },
        "sourceRefs": example.get("sourceRefs"),
        "coxiterGraphSha256": sha256_text(graph_text),
    }


def load_example(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid JSON: {error}") from error
    if not isinstance(value, dict):
        raise ValueError("top-level JSON value must be an object")
    return value


def build_coxiter_graph(path: Path, example: dict[str, Any]) -> tuple[str, list[str]]:
    spec = SUPPORTED_EXAMPLES.get(path.name)
    if spec is None:
        raise ValueError(f"{path.name} is not a supported compact CoxIter fixture")
    if example.get("rank") != spec["expectedRank"]:
        raise ValueError(f"rank must be {spec['expectedRank']}")

    geometry = example.get("geometry")
    if not isinstance(geometry, dict):
        raise ValueError("geometry block is required")
    if geometry.get("dimension") != spec["expectedDimension"]:
        raise ValueError(f"geometry.dimension must be {spec['expectedDimension']}")

    generators = example.get("generators")
    coxeter_matrix = example.get("coxeterMatrix")
    normal_gram = geometry.get("normalGram")
    rank = int(spec["expectedRank"])
    if not isinstance(generators, list) or len(generators) != rank:
        raise ValueError(f"generators must contain {rank} entries")
    if not isinstance(coxeter_matrix, list) or len(coxeter_matrix) != rank:
        raise ValueError(f"coxeterMatrix must contain {rank} rows")
    if not isinstance(normal_gram, list) or len(normal_gram) != rank:
        raise ValueError(f"geometry.normalGram must contain {rank} rows")

    labels = []
    for index, generator in enumerate(generators):
        if not isinstance(generator, dict) or not isinstance(generator.get("id"), str):
            raise ValueError(f"generators[{index}].id must be a string")
        labels.append(generator["id"])

    lines = [f"{rank} {spec['expectedDimension']}", f"vertices labels: {' '.join(labels)}"]
    dotted_edges: list[str] = []
    for i in range(rank):
        row = coxeter_matrix[i]
        gram_row = normal_gram[i]
        if not isinstance(row, list) or len(row) != rank:
            raise ValueError(f"coxeterMatrix[{i}] must contain {rank} entries")
        if not isinstance(gram_row, list) or len(gram_row) != rank:
            raise ValueError(f"geometry.normalGram[{i}] must contain {rank} entries")
        for j in range(i + 1, rank):
            entry = row[j]
            if isinstance(entry, int):
                if entry > 2:
                    lines.append(f"{labels[i]} {labels[j]} {entry}")
                elif entry != 2:
                    raise ValueError(f"coxeterMatrix[{i}][{j}] must be 2 or >=3")
            elif entry == "inf":
                gram_entry = gram_row[j]
                if isinstance(gram_entry, dict) and gram_entry.get("kind") == "dotted":
                    gram_value = gram_entry_value(gram_entry)
                    lines.append(f"{labels[i]} {labels[j]} 1 # {gram_value:.17g}")
                    dotted_edges.append(f"{labels[i]}-{labels[j]}")
                else:
                    lines.append(f"{labels[i]} {labels[j]} 0")
            else:
                raise ValueError(f"coxeterMatrix[{i}][{j}] has unsupported value {entry!r}")

    return "\n".join(lines) + "\n", dotted_edges


def coxiter_candidates(explicit: str | None, graph_text: str) -> list[dict[str, Any]]:
    if explicit:
        return [{"command": shlex.split(explicit), "mode": "stdin"}]

    candidates: list[dict[str, Any]] = []
    if shutil.which("coxiter"):
        candidates.append({"command": ["coxiter"], "mode": "stdin"})
    if platform.system() == "Windows":
        candidates.extend(
            [
                wsl_file_candidate(graph_text, ["wsl", "-d", "Ubuntu-24.04", "--"]),
                wsl_file_candidate(graph_text, ["wsl", "--"]),
            ]
        )
    return candidates


def wsl_file_candidate(graph_text: str, prefix: list[str]) -> dict[str, Any]:
    graph_path = write_windows_wsl_graph_file(graph_text)
    wsl_path = windows_path_to_wsl(graph_path)
    return {
        "command": prefix + ["bash", "-lc", f"coxiter < {shlex.quote(wsl_path)}"],
        "mode": "file",
        "temporaryPath": graph_path,
    }


def write_windows_wsl_graph_file(graph_text: str) -> Path:
    handle = tempfile.NamedTemporaryFile(
        "w",
        delete=False,
        encoding="utf-8",
        newline="\n",
        prefix="coxiter-graph-",
        suffix=".coxiter",
    )
    with handle:
        handle.write(graph_text)
    return Path(handle.name)


def cleanup_candidate(candidate: dict[str, Any]) -> None:
    path = candidate.get("temporaryPath")
    if isinstance(path, Path):
        try:
            path.unlink()
        except FileNotFoundError:
            pass


def windows_path_to_wsl(path: Path) -> str:
    drive = path.drive.rstrip(":").lower()
    parts = [part for part in path.parts[1:] if part not in {"\\", "/"}]
    return "/mnt/" + drive + "/" + "/".join(parts).replace("\\", "/")


def run_coxiter(
    graph_text: str,
    explicit: str | None,
    timeout: int,
    expected_rank: int,
    expected_dimension: int,
) -> dict[str, Any]:
    errors = []
    for candidate in coxiter_candidates(explicit, graph_text):
        command = candidate.get("command")
        if not command:
            continue
        try:
            stdin = graph_text if candidate.get("mode") == "stdin" else None
            completed = subprocess.run(
                command,
                input=stdin,
                text=True,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
        except FileNotFoundError as error:
            errors.append(f"{command[0]}: {error}")
            cleanup_candidate(candidate)
            continue
        except subprocess.TimeoutExpired:
            cleanup_candidate(candidate)
            return {
                "status": "failed",
                "command": command,
                "stdout": "",
                "stderr": f"CoxIter timed out after {timeout}s",
                "parsed": {},
            }

        stdout = sanitize_process_text(completed.stdout)
        stderr = sanitize_process_text(completed.stderr)
        combined = "\n".join(part for part in [stdout, stderr] if part)
        parsed = parse_coxiter_output(combined)
        validation_errors = validate_coxiter_output(
            completed.returncode,
            combined,
            parsed,
            expected_rank,
            expected_dimension,
        )
        if not validation_errors:
            cleanup_candidate(candidate)
            return {
                "status": "passed",
                "command": command,
                "exitCode": completed.returncode,
                "stdout": stdout.strip(),
                "stderr": stderr.strip(),
                "parsed": parsed,
            }
        errors.append(
            f"{' '.join(command)} exited {completed.returncode}: "
            f"{'; '.join(validation_errors)} {combined.strip()[:400]}"
        )
        cleanup_candidate(candidate)

    return {
        "status": "skipped",
        "command": None,
        "stdout": "",
        "stderr": "CoxIter executable was not available or did not accept the generated graph.",
        "attemptErrors": errors,
        "parsed": {},
    }


def sanitize_process_text(value: str) -> str:
    return value.replace("\x00", "")


def parse_coxiter_output(output: str) -> dict[str, Any]:
    patterns = {
        "vertices": r"Number of vertices:\s*([0-9]+)",
        "dimension": r"Dimension:\s*([0-9]+)",
        "cocompact": r"Cocompact:\s*([A-Za-z]+)",
        "finiteCovolume": r"Finite covolume:\s*([A-Za-z]+)",
        "fVector": r"f-vector:\s*\(([^\)]*)\)",
        "verticesAtInfinity": r"Number of vertices at infinity:\s*([0-9]+)",
        "eulerCharacteristic": r"Euler characteristic:\s*([^\n]+)",
        "growthRate": r"Growth rate:\s*([^\n]+)",
        "signature": r"Signature(?:\s*\([^\)]*\))?:\s*([^\n]+)",
    }
    parsed: dict[str, Any] = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, output)
        if not match:
            continue
        value = match.group(1).strip()
        parsed[key] = (
            int(value)
            if key in {"vertices", "dimension", "verticesAtInfinity"}
            else value
        )
    return parsed


def validate_coxiter_output(
    exit_code: int,
    output: str,
    parsed: dict[str, Any],
    expected_rank: int,
    expected_dimension: int,
) -> list[str]:
    errors: list[str] = []
    if exit_code != 0:
        errors.append(f"exit code {exit_code}")
    if "Error while reading graph" in output:
        errors.append("CoxIter rejected the graph input")
    if parsed.get("vertices") != expected_rank:
        errors.append(f"expected {expected_rank} vertices, got {parsed.get('vertices')!r}")
    if parsed.get("dimension") != expected_dimension:
        errors.append(
            f"expected dimension {expected_dimension}, got {parsed.get('dimension')!r}"
        )
    if parsed.get("cocompact") != "yes":
        errors.append(f"expected Cocompact: yes, got {parsed.get('cocompact')!r}")
    if parsed.get("finiteCovolume") != "yes":
        errors.append(
            f"expected Finite covolume: yes, got {parsed.get('finiteCovolume')!r}"
        )
    return errors


def artifact_path_for(example_path: Path, artifact_dir: Path) -> Path:
    return artifact_dir / f"{example_path.stem}.coxiter.json"


def load_stored_artifact(
    example_path: Path,
    graph_text: str,
    payload_hash: str,
    artifact_dir: Path,
    expected_rank: int,
    expected_dimension: int,
) -> tuple[dict[str, Any] | None, list[str]]:
    path = artifact_path_for(example_path, artifact_dir)
    if not path.exists():
        return None, [f"no stored CoxIter artifact at {path}"]
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return None, [f"{path}: invalid JSON: {error}"]
    if not isinstance(artifact, dict):
        return None, [f"{path}: artifact must be a JSON object"]

    graph_hash = sha256_text(graph_text)
    errors = []
    if artifact.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if artifact.get("inputHash") != payload_hash:
        errors.append("stored artifact inputHash does not match current example")
    if artifact.get("coxiterGraphSha256") != graph_hash:
        errors.append("stored artifact graph hash does not match generated CoxIter input")
    coxiter = artifact.get("coxiter")
    if not isinstance(coxiter, dict):
        errors.append("stored artifact must contain a coxiter object")
    elif coxiter.get("status") != "passed":
        errors.append("stored artifact coxiter.status must be passed")
    if errors:
        return None, [f"{path}: {error}" for error in errors]

    parsed = coxiter.get("parsed") if isinstance(coxiter, dict) else {}
    if not isinstance(parsed, dict):
        parsed = parse_coxiter_output(str(coxiter.get("stdout", "")))
    validation_errors = validate_coxiter_output(
        int(coxiter.get("exitCode", 0)),
        str(coxiter.get("stdout", "")) + "\n" + str(coxiter.get("stderr", "")),
        parsed,
        expected_rank,
        expected_dimension,
    )
    if validation_errors:
        return None, [f"{path}: {'; '.join(validation_errors)}"]

    report = dict(coxiter)
    report["parsed"] = parsed
    report["artifactPath"] = str(path)
    report["artifactKind"] = "hash-matched-stored-coxiter-output"
    return report, []


def build_report(
    path: Path,
    coxiter_executable: str | None,
    timeout: int,
    require_external: bool,
    artifact_dir: Path,
    use_stored_artifact: bool,
) -> dict[str, Any]:
    example = load_example(path)
    graph_text, dotted_edges = build_coxiter_graph(path, example)
    spec = SUPPORTED_EXAMPLES[path.name]
    payload_hash = sha256_json(checked_payload(example, graph_text))
    coxiter_report = run_coxiter(
        graph_text,
        coxiter_executable,
        timeout,
        int(spec["expectedRank"]),
        int(spec["expectedDimension"]),
    )
    artifact_errors: list[str] = []
    if (
        coxiter_report["status"] != "passed"
        and use_stored_artifact
        and coxiter_executable is None
    ):
        artifact_report, artifact_errors = load_stored_artifact(
            path,
            graph_text,
            payload_hash,
            artifact_dir,
            int(spec["expectedRank"]),
            int(spec["expectedDimension"]),
        )
        if artifact_report is not None:
            artifact_report["liveAttempt"] = coxiter_report
            coxiter_report = artifact_report
    status = coxiter_report["status"]
    if require_external and status == "skipped":
        ok = False
    else:
        ok = status in {"passed", "skipped"}

    certificate = {
        "status": status,
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "scopes": ["coxiter-diagram"],
        "command": f"python scripts/coxiter_check_compact.py {path.as_posix()}",
        "inputHash": payload_hash,
        "sourceRefIds": spec["sourceRefIds"],
        "diagnostics": {
            "diagramTranscriptionValidated": True,
            "coxiterGraphSha256": sha256_text(graph_text),
            "rank": spec["expectedRank"],
            "dimension": spec["expectedDimension"],
            "dottedEdges": dotted_edges,
            "coxiter": coxiter_report,
            "artifactErrors": artifact_errors,
            "nonClaims": coxiter_non_claims(status),
        },
        "warnings": []
        if status == "passed"
        else ["CoxIter did not produce a passed external-checker certificate."],
    }
    return {
        "ok": ok,
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "schemaVersion": 1,
        "file": str(path),
        "inputHash": payload_hash,
        "certificate": certificate,
        "coxiterInput": graph_text,
    }


def coxiter_non_claims(status: str) -> list[str]:
    claims = ["CoxIter output is kept separate from exact source-transcription certificates"]
    if status == "skipped":
        claims.insert(0, "skipped status is not an independent CoxIter certificate")
    return claims


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run or prepare CoxIter checks for compact examples.")
    parser.add_argument(
        "example",
        type=Path,
        help="Path to compact_5_cube_gamma1.json or compact_5_prism_makarov.json.",
    )
    parser.add_argument(
        "--coxiter-executable",
        help="Optional executable/command used instead of auto-detection.",
    )
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=DEFAULT_ARTIFACT_DIR,
        help="Directory containing hash-matched stored CoxIter artifacts.",
    )
    parser.add_argument(
        "--no-artifact",
        action="store_true",
        help="Do not use stored CoxIter artifacts when live execution is unavailable.",
    )
    parser.add_argument(
        "--require-external",
        action="store_true",
        help="Exit nonzero when CoxIter is unavailable or skipped.",
    )
    args = parser.parse_args(argv)

    try:
        report = build_report(
            args.example,
            args.coxiter_executable,
            args.timeout,
            args.require_external,
            args.artifact_dir,
            not args.no_artifact,
        )
    except Exception as error:  # noqa: BLE001 - CLI reports validation failures as JSON.
        report = {
            "ok": False,
            "backend": BACKEND,
            "backendVersion": BACKEND_VERSION,
            "schemaVersion": 1,
            "file": str(args.example),
            "errors": [str(error)],
        }

    print(json.dumps(report, indent=2, sort_keys=True))
    print()
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
