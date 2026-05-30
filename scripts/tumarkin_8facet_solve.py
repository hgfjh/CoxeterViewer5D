#!/usr/bin/env python3
"""Solve dotted weights for Tumarkin Table 4.10 transcriptions.

This helper is intentionally separated from the EPS parser.  The parser records
what the source artwork says; this solver checks whether the transcribed finite
edges admit dotted weights whose normal Gram matrix has the expected hyperbolic
rank.  The exact certificate generator reuses the same determinant equations.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from itertools import combinations
from pathlib import Path
from typing import Any

import sympy as sp

from tumarkin_8facet_eps import diagram_to_transcription, parse_eps


def finite_value(m: int) -> sp.Expr:
    if m == 2:
        return sp.Integer(0)
    if m == 3:
        return sp.Rational(1, 2)
    if m == 4:
        return sp.sqrt(2) / 2
    if m == 5:
        return (1 + sp.sqrt(5)) / 4
    if m == 6:
        return sp.sqrt(3) / 2
    if m == 10:
        return sp.sqrt(10 + 2 * sp.sqrt(5)) / 4
    return sp.cos(sp.pi / m)


def build_gram(
    diagram: dict[str, Any],
) -> tuple[sp.Matrix, list[sp.Symbol], dict[sp.Symbol, tuple[str, str]]]:
    node_ids = [node["id"] for node in diagram["nodes"]]
    index = {node_id: i for i, node_id in enumerate(node_ids)}
    matrix = sp.eye(len(node_ids))
    variables: list[sp.Symbol] = []
    dotted_pairs: dict[sp.Symbol, tuple[str, str]] = {}
    dotted_seen = 0
    for edge in diagram["edges"]:
        i = index[edge["source"]]
        j = index[edge["target"]]
        if edge["kind"] == "finite":
            value = -finite_value(int(edge["m"]))
        elif edge["kind"] == "dotted":
            dotted_seen += 1
            variable = sp.symbols(f"d{diagram['diagramIndex']}_{dotted_seen}", real=True)
            variables.append(variable)
            dotted_pairs[variable] = tuple(sorted((edge["source"], edge["target"])))
            value = -variable
        else:
            raise ValueError(edge)
        matrix[i, j] = value
        matrix[j, i] = value
    return matrix, variables, dotted_pairs


def rank_equations(matrix: sp.Matrix) -> list[sp.Expr]:
    size = matrix.rows
    equations: list[sp.Expr] = []
    for omitted in range(size):
        rows = [i for i in range(size) if i != omitted]
        minor = determinant_expr(matrix.extract(rows, rows))
        if minor != 0:
            equations.append(minor)
    return equations


def determinant_expr(matrix: sp.Matrix) -> sp.Expr:
    """Return the polynomial numerator of a symbolic principal determinant."""

    determinant = matrix.det(method="berkowitz")
    numerator, denominator = sp.together(determinant).as_numer_denom()
    if denominator == 0:
        raise ZeroDivisionError("invalid determinant denominator")
    return sp.factor(numerator)


def determinant_without(matrix: sp.Matrix, node_ids: list[str], omitted: str) -> sp.Expr:
    omitted_index = node_ids.index(omitted)
    rows = [i for i in range(matrix.rows) if i != omitted_index]
    return determinant_expr(matrix.extract(rows, rows))


def solve_real_greater_than_one(equation: sp.Expr, variable: sp.Symbol) -> sp.Expr:
    candidates = sp.solve(sp.factor(equation), variable)
    good: list[sp.Expr] = []
    for candidate in candidates:
        value = complex(sp.N(candidate, 50))
        if abs(value.imag) < 1e-30 and value.real > 1:
            good.append(sp.factor(candidate))
    if len(good) != 1:
        raise ValueError(
            f"expected one real solution > 1 for {variable}, got {candidates}"
        )
    return good[0]


def solve_g11411_path(diagram: dict[str, Any]) -> dict[sp.Symbol, sp.Expr]:
    matrix, variables, dotted_pairs = build_gram(diagram)
    if len(variables) != 3:
        raise ValueError("G11411 diagrams should have three dotted edges")

    node_ids = [node["id"] for node in diagram["nodes"]]
    degree: dict[str, int] = defaultdict(int)
    for source, target in dotted_pairs.values():
        degree[source] += 1
        degree[target] += 1
    middle_nodes = sorted(node for node, value in degree.items() if value == 2)
    if len(middle_nodes) != 2:
        raise ValueError(f"dotted graph is not a path: {degree}")

    middle_edge = next(
        variable
        for variable, pair in dotted_pairs.items()
        if set(pair) == set(middle_nodes)
    )
    side_edges = [variable for variable in variables if variable != middle_edge]
    solution: dict[sp.Symbol, sp.Expr] = {}

    for variable in side_edges:
        source, target = dotted_pairs[variable]
        middle = source if source in middle_nodes else target
        other_middle = next(node for node in middle_nodes if node != middle)
        equation = determinant_without(matrix, node_ids, other_middle).subs(solution)
        solution[variable] = solve_real_greater_than_one(equation, variable)

    substituted = matrix.subs(solution)
    middle_equation = None
    for omitted in node_ids:
        equation = determinant_without(substituted, node_ids, omitted)
        if middle_edge in equation.free_symbols:
            middle_equation = equation
            break
    if middle_equation is None:
        raise ValueError("no rank equation contains the middle dotted edge")
    solution[middle_edge] = solve_real_greater_than_one(middle_equation, middle_edge)
    return solution


def symmetric_eigenvalues(matrix: list[list[float]], tolerance: float = 1e-12) -> list[float]:
    """Return eigenvalues for the small symmetric Gram matrices in this script.

    This is a Jacobi sweep rather than a proof engine.  It is used only for the
    exploratory signature summary printed by this source-transcription helper;
    exact determinant equations still carry the certification work.
    """

    values = [row[:] for row in matrix]
    size = len(values)
    if size == 0:
        return []

    for _sweep in range(80 * size * size):
        pivot_i = 0
        pivot_j = 1 if size > 1 else 0
        largest = 0.0
        for i in range(size):
            for j in range(i + 1, size):
                entry = abs(values[i][j])
                if entry > largest:
                    largest = entry
                    pivot_i = i
                    pivot_j = j

        if largest < tolerance:
            break

        app = values[pivot_i][pivot_i]
        aqq = values[pivot_j][pivot_j]
        apq = values[pivot_i][pivot_j]
        angle = 0.5 * math.atan2(2.0 * apq, aqq - app)
        cosine = math.cos(angle)
        sine = math.sin(angle)

        for k in range(size):
            if k == pivot_i or k == pivot_j:
                continue
            aik = values[k][pivot_i]
            akq = values[k][pivot_j]
            next_i = cosine * aik - sine * akq
            next_j = sine * aik + cosine * akq
            values[k][pivot_i] = values[pivot_i][k] = next_i
            values[k][pivot_j] = values[pivot_j][k] = next_j

        values[pivot_i][pivot_i] = cosine * cosine * app - 2.0 * sine * cosine * apq + sine * sine * aqq
        values[pivot_j][pivot_j] = sine * sine * app + 2.0 * sine * cosine * apq + cosine * cosine * aqq
        values[pivot_i][pivot_j] = values[pivot_j][pivot_i] = 0.0

    return sorted(values[index][index] for index in range(size))


def solve_diagram(diagram: dict[str, Any]) -> dict[str, Any]:
    matrix, variables, _dotted_pairs = build_gram(diagram)
    if not variables:
        return {"diagramIndex": diagram["diagramIndex"], "solutions": []}
    equations: list[sp.Expr] = []
    if len(variables) == 3:
        solution_candidates = [solve_g11411_path(diagram)]
    else:
        equations = rank_equations(matrix)
        solution_candidates = sp.solve(equations, variables, dict=True)
    real_solutions = []
    for solution in solution_candidates:
        values = [sp.N(solution[var], 40) for var in variables]
        if all(abs(sp.im(value)) < sp.Rational(1, 10) ** 25 for value in values):
            decimals = [float(sp.re(value)) for value in values]
            if all(value > 1 for value in decimals):
                evaluated = [
                    [float(sp.N(entry.subs(solution), 30)) for entry in row]
                    for row in matrix.tolist()
                ]
                eigen = symmetric_eigenvalues(evaluated)
                positive = sum(1 for value in eigen if value > 1e-8)
                negative = sum(1 for value in eigen if value < -1e-8)
                zero = int(len(eigen) - positive - negative)
                real_solutions.append(
                    {
                        "values": [sp.sstr(sp.factor(solution[var])) for var in variables],
                        "decimals": decimals,
                        "signature": {
                            "positive": positive,
                            "negative": negative,
                            "zero": zero,
                        },
                    }
                )
    return {
        "diagramIndex": diagram["diagramIndex"],
        "variableCount": len(variables),
        "equationCount": len(equations),
        "solutions": real_solutions,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--eps",
        type=Path,
        default=Path(".tmp_sources/arxiv/pic/5/5_n.eps"),
        help="Path to Tumarkin arXiv source file pic/5/5_n.eps.",
    )
    parser.add_argument("--diagram", type=int, help="Solve one diagram index.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    diagrams = [diagram_to_transcription(diagram) for diagram in parse_eps(args.eps)]
    if args.diagram is not None:
        diagrams = [diagram for diagram in diagrams if diagram["diagramIndex"] == args.diagram]
    results = [solve_diagram(diagram) for diagram in diagrams]
    if args.json:
        print(json.dumps({"results": results}, indent=2, sort_keys=True))
    else:
        for result in results:
            print(
                f"#{result['diagramIndex']:02d}: "
                f"vars={result.get('variableCount', 0)} "
                f"solutions={len(result['solutions'])}"
            )
            for solution in result["solutions"]:
                print(
                    "  ",
                    solution["values"],
                    [round(value, 12) for value in solution["decimals"]],
                    solution["signature"],
                )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
