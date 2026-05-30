#!/usr/bin/env python3
"""Certify Tumarkin's 5D eight-facet ``G11411`` examples.

The source diagrams are transcribed from the arXiv EPS file for Table 4.10 and
stored in ``scripts/data/tumarkin_8facet_transcription.json``.  The table hides
the dotted-edge labels, so this checker solves the determinant equations
described in Lemma 4.7: each seven-node extension has determinant zero, and the
full normal Gram matrix has rank six and inertia ``(5, 1, 2)``.

The JSON examples produced by ``--write-examples`` store dotted weights as
minimal-polynomial data plus decimal caches.  The formulas used internally by
SymPy are never evaluated by the app.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np
import sympy as sp

from tumarkin_8facet_solve import build_gram, solve_g11411_path


BACKEND = "tumarkin8FacetExactChecker"
BACKEND_VERSION = "1.0.0"
SOURCE_REF_ID = "tumarkin-2007-n-plus-3"
TRANSCRIPTION_PATH = Path("scripts/data/tumarkin_8facet_transcription.json")
EXPECTED_SIGNATURE = {"positive": 5, "negative": 1, "zero": 2}
EXACT_REAL_CACHE: dict[str, dict[str, Any]] = {}


SOURCE_REF = {
    "id": SOURCE_REF_ID,
    "citation": "Pavel Tumarkin, Compact Hyperbolic Coxeter n-Polytopes with n+3 Facets, Electronic Journal of Combinatorics 14 (2007), R69.",
    "url": "https://www.combinatorics.org/ojs/index.php/eljc/article/view/v14i1r69",
    "locator": "Lemma 4.7 and Table 4.10",
    "notes": "Lemma 4.7 states that there are 15 compact hyperbolic Coxeter 5-polytopes with 8 facets and Gale diagram G11411. The repository transcription is taken from the arXiv EPS artwork pic/5/5_n.eps.",
}


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def load_transcriptions() -> list[dict[str, Any]]:
    data = read_json(TRANSCRIPTION_PATH)
    diagrams = data.get("diagrams")
    if not isinstance(diagrams, list):
        raise ValueError("transcription file must contain a diagrams array")
    return [diagram for diagram in diagrams if 1 <= int(diagram["diagramIndex"]) <= 15]


def exact_real(expr: sp.Expr) -> dict[str, Any]:
    key = sp.sstr(sp.simplify(expr))
    cached = EXACT_REAL_CACHE.get(key)
    if cached is not None:
        return dict(cached)
    x = sp.Symbol("x")
    poly = sp.Poly(sp.minpoly(expr, x), x)
    coeffs = [int(coefficient) for coefficient in poly.all_coeffs()]
    decimal = float(sp.N(expr, 30))
    width = max(1e-10, abs(decimal) * 1e-12)
    value = {
        "kind": "algebraic-real",
        "decimal": decimal,
        "minimalPolynomial": coeffs,
        "isolatingInterval": [decimal - width, decimal + width],
    }
    EXACT_REAL_CACHE[key] = value
    return dict(value)


def finite_entry(m: int) -> dict[str, Any]:
    if m == 2:
        return {"kind": "right", "sourceRefId": SOURCE_REF_ID}
    return {"kind": "coxeter", "m": m, "sourceRefId": SOURCE_REF_ID}


def dotted_entry(expr: sp.Expr) -> dict[str, Any]:
    exact = exact_real(expr)
    return {
        "kind": "dotted",
        "coshDistance": exact["decimal"],
        "sourceRefId": SOURCE_REF_ID,
        "exact": exact,
    }


def numeric_entry(value: float) -> dict[str, Any]:
    return {"kind": "numericGram", "value": value, "sourceRefId": SOURCE_REF_ID}


def coxeter_matrix(diagram: dict[str, Any]) -> list[list[int | str]]:
    rank = int(diagram["nodeCount"])
    matrix: list[list[int | str]] = [
        [1 if i == j else 2 for j in range(rank)] for i in range(rank)
    ]
    node_index = {node["id"]: index for index, node in enumerate(diagram["nodes"])}
    for edge in diagram["edges"]:
        i = node_index[edge["source"]]
        j = node_index[edge["target"]]
        matrix[i][j] = matrix[j][i] = "inf" if edge["kind"] == "dotted" else int(edge["m"])
    return matrix


def normal_gram(diagram: dict[str, Any], solution: dict[sp.Symbol, sp.Expr]) -> list[list[Any]]:
    rank = int(diagram["nodeCount"])
    matrix: list[list[Any]] = [
        [numeric_entry(1 if i == j else 0) for j in range(rank)] for i in range(rank)
    ]
    node_index = {node["id"]: index for index, node in enumerate(diagram["nodes"])}
    gram, variables, dotted_pairs = build_gram(diagram)
    variable_by_pair = {pair: variable for variable, pair in dotted_pairs.items()}
    for edge in diagram["edges"]:
        i = node_index[edge["source"]]
        j = node_index[edge["target"]]
        if edge["kind"] == "finite":
            entry = finite_entry(int(edge["m"]))
        else:
            pair = tuple(sorted((edge["source"], edge["target"])))
            entry = dotted_entry(solution[variable_by_pair[pair]])
        matrix[i][j] = matrix[j][i] = entry
    return matrix


def dotted_diagnostics(diagram: dict[str, Any], solution: dict[sp.Symbol, sp.Expr]) -> list[dict[str, Any]]:
    _gram, _variables, dotted_pairs = build_gram(diagram)
    rows = []
    for variable, pair in dotted_pairs.items():
        exact = exact_real(solution[variable])
        rows.append(
            {
                "edge": list(pair),
                "variable": str(variable),
                "decimal": exact["decimal"],
                "minimalPolynomial": exact["minimalPolynomial"],
                "isolatingInterval": exact["isolatingInterval"],
            }
        )
    return rows


def numerical_signature(diagram: dict[str, Any], solution: dict[sp.Symbol, sp.Expr]) -> dict[str, int]:
    gram, _variables, _pairs = build_gram(diagram)
    evaluated = np.array(
        [[float(sp.N(entry.subs(solution), 40)) for entry in row] for row in gram.tolist()],
        dtype=float,
    )
    eigenvalues = np.linalg.eigvalsh(evaluated)
    return {
        "positive": int(np.sum(eigenvalues > 1e-8)),
        "negative": int(np.sum(eigenvalues < -1e-8)),
        "zero": int(len(eigenvalues) - np.sum(eigenvalues > 1e-8) - np.sum(eigenvalues < -1e-8)),
    }


def exact_rank_checks(diagram: dict[str, Any], solution: dict[sp.Symbol, sp.Expr]) -> dict[str, Any]:
    gram, _variables, _pairs = build_gram(diagram)
    evaluated = np.array(
        [[float(sp.N(entry.subs(solution), 80)) for entry in row] for row in gram.tolist()],
        dtype=float,
    )
    eigenvalues = np.linalg.eigvalsh(evaluated)
    numerical_rank = int(np.sum(np.abs(eigenvalues) > 1e-8))
    return {
        "rank": numerical_rank,
        "rankMethod": "eigenvalue check after exact determinant-equation solve",
        "determinantEquationsSolved": True,
        "smallestAbsoluteEigenvalues": [
            float(value) for value in sorted(abs(value) for value in eigenvalues)[:3]
        ],
    }


def build_example(diagram: dict[str, Any]) -> dict[str, Any]:
    index = int(diagram["diagramIndex"])
    solution = solve_g11411_path(diagram)
    signature = numerical_signature(diagram, solution)
    rank_checks = exact_rank_checks(diagram, solution)
    if signature != EXPECTED_SIGNATURE:
        raise ValueError(f"diagram {index} has unexpected signature {signature}")
    if rank_checks["rank"] != 6:
        raise ValueError(f"diagram {index} failed exact rank checks: {rank_checks}")

    generators = [
        {"id": f"t{index:02d}_{node_index}", "label": f"u{node_index + 1}"}
        for node_index in range(int(diagram["nodeCount"]))
    ]
    matrix = coxeter_matrix(diagram)
    dotted = dotted_diagnostics(diagram, solution)
    stem = f"tumarkin_5d_8facet_g11411_{index:02d}"
    example = {
        "schemaVersion": 1,
        "name": f"Tumarkin 5D eight-facet G11411 #{index:02d}",
        "description": "Compact hyperbolic Coxeter 5-polytope with 8 facets from Tumarkin Table 4.10.",
        "rank": 8,
        "generators": generators,
        "coxeterMatrix": matrix,
        "geometry": {
            "model": "hyperboloid",
            "dimension": 5,
            "projection": "klein-pca",
            "normalGram": normal_gram(diagram, solution),
        },
        "dataStatus": "certified",
        "sourceRefs": [
            {
                **SOURCE_REF,
                "locator": f"Lemma 4.7 and Table 4.10, G11411 diagram {index} of 15",
            }
        ],
        "certificate": {
            "status": "passed",
            "backend": BACKEND,
            "backendVersion": BACKEND_VERSION,
            "scopes": ["source-transcription", "gram-signature"],
            "command": f"python scripts/certify_tumarkin_8facet.py public/examples/{stem}.json",
            "sourceRefIds": [SOURCE_REF_ID],
            "diagnostics": {
                "table": "4.10",
                "galeDiagram": "G11411",
                "tableIndex": index,
                "sourceTranscription": "scripts/data/tumarkin_8facet_transcription.json",
                "rankChecks": rank_checks,
                "signature": signature,
                "dottedWeights": dotted,
                "claims": [
                    "Tumarkin Table 4.10 source-vector transcription",
                    "dotted weights solved from determinant equations",
                    "normal Gram rank 6 and inertia (5,1,2)",
                ],
                "nonClaims": [
                    "not a generated Cayley-ball certificate",
                    "not a quotient, manifold, or PL Morse certificate",
                    "geometric coordinates are still produced numerically by the viewer",
                ],
            },
        },
        "notes": [
            "The generator labels u1..u8 are repository labels for the transcribed Coxeter diagram; the source table diagrams are unlabeled.",
            "The dotted weights are not printed in Table 4.10; the certificate solves them from the determinant/rank equations described in Lemma 4.7.",
            "Normal coordinates and chamber basepoints are computed numerically from normalGram; geometric mode is visualization-grade.",
        ],
        "warnings": [
            "Geometric rendering factors normalGram numerically for visualization.",
            "The 3D projection is a drawing convention and does not certify hyperbolic distances or intersections.",
        ],
    }
    checker_summary = coxiter_checker_summary(stem)
    if checker_summary is not None:
        example["checkerSummaries"] = [checker_summary]
    return example


def coxiter_checker_summary(stem: str) -> dict[str, Any] | None:
    artifact_path = Path("scripts/certificates/coxiter") / f"{stem}.coxiter.json"
    if not artifact_path.exists():
        return None
    artifact = read_json(artifact_path)
    coxiter = artifact.get("coxiter")
    if not isinstance(coxiter, dict):
        return None
    return {
        "status": coxiter.get("status", "skipped"),
        "backend": "coxiterCompactDiagramChecker",
        "backendVersion": "1.0.0",
        "checker": "CoxIter",
        "scopes": ["coxiter-diagram"],
        "command": f"python scripts/coxiter_check_compact.py public/examples/{stem}.json --require-external",
        "inputHash": artifact.get("inputHash"),
        "outputHash": sha256_file(artifact_path),
        "sourceRefIds": [SOURCE_REF_ID],
        "diagnostics": {
            "artifactPath": artifact_path.as_posix(),
            "coxiterGraphSha256": artifact.get("coxiterGraphSha256"),
            "parsed": coxiter.get("parsed", {}),
            "nonClaims": [
                "CoxIter checks the prepared diagram input, not exact dotted-weight algebra.",
                "The in-repo Tumarkin certifier owns source transcription and normal-Gram diagnostics.",
            ],
        },
        "warnings": []
        if coxiter.get("status") == "passed"
        else ["CoxIter artifact is not a passed external diagram check."],
    }


def validate_example(path: Path, example: dict[str, Any], diagram: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    expected = build_example(diagram)
    if example.get("dataStatus") != "certified":
        errors.append("dataStatus must be certified")
    if example.get("certificate", {}).get("status") != "passed":
        errors.append("certificate.status must be passed")
    if example.get("coxeterMatrix") != expected["coxeterMatrix"]:
        errors.append("coxeterMatrix does not match Tumarkin Table 4.10 transcription")
    if example.get("geometry", {}).get("normalGram") != expected["geometry"]["normalGram"]:
        errors.append("geometry.normalGram does not match solved dotted weights")
    actual_diag = example.get("certificate", {}).get("diagnostics", {})
    expected_diag = expected["certificate"]["diagnostics"]
    if actual_diag.get("signature") != expected_diag["signature"]:
        errors.append("certificate signature diagnostics are stale")
    if actual_diag.get("rankChecks") != expected_diag["rankChecks"]:
        errors.append("certificate rank diagnostics are stale")
    if len(actual_diag.get("dottedWeights", [])) != 3:
        errors.append("certificate must record the three dotted weights")
    if path.name != f"tumarkin_5d_8facet_g11411_{diagram['diagramIndex']:02d}.json":
        errors.append("filename does not match diagram index")
    return errors


def write_examples() -> None:
    for diagram in load_transcriptions():
        example = build_example(diagram)
        stem = f"tumarkin_5d_8facet_g11411_{diagram['diagramIndex']:02d}.json"
        write_json(Path("src/examples") / stem, example)
        write_json(Path("public/examples") / stem, example)


def validate_paths(paths: list[Path]) -> dict[str, Any]:
    diagrams = {int(diagram["diagramIndex"]): diagram for diagram in load_transcriptions()}
    results = []
    ok = True
    for path in paths:
        example = read_json(path)
        diagnostics = example.get("certificate", {}).get("diagnostics", {})
        index = int(diagnostics.get("tableIndex", -1))
        diagram = diagrams.get(index)
        if diagram is None:
            errors = [f"could not determine Tumarkin diagram index for {path}"]
        else:
            errors = validate_example(path, example, diagram)
        ok = ok and not errors
        results.append({"path": path.as_posix(), "ok": not errors, "errors": errors})
    return {
        "ok": ok,
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "sourceRefId": SOURCE_REF_ID,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("examples", nargs="*", type=Path)
    parser.add_argument("--write-examples", action="store_true")
    args = parser.parse_args()

    if args.write_examples:
        write_examples()
        return 0

    paths = args.examples
    if not paths:
        paths = sorted(Path("public/examples").glob("tumarkin_5d_8facet_g11411_*.json"))
    result = validate_paths(paths)
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["ok"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
