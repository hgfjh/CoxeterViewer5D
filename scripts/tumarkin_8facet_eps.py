#!/usr/bin/env python3
"""Parse Tumarkin Table 4.10 from the arXiv EPS source.

The published PDF draws the eight-facet diagrams as artwork.  The arXiv source
keeps the same table in ``pic/5/5_n.eps``.  That file is not a Coxeter matrix,
but it is structured enough to audit: nodes are circles, finite Coxeter edges
are solid polylines, and dotted edges are dashed polylines.  The hidden PSfrag
labels ``d11`` ... ``d153`` mark the dotted-edge weight positions for the
fifteen ``G11411`` diagrams; ``d161`` marks the separate ``G12221`` diagram.

This parser deliberately stops at source transcription.  Dotted-edge algebraic
weights are computed by a separate exact checker, because the EPS does not print
those weights.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


LABEL_RE = re.compile(r"\((d\d+)\)")
MOVE_RE = re.compile(r"(-?\d+)\s+(-?\d+)\s+(?:m|l)\b")
ELLIPSE_RE = re.compile(
    r"n\s+(-?\d+)\s+(-?\d+)\s+67\s+67\s+0\s+360\s+DrawEllipse"
)


@dataclass
class EpsNode:
    id: str
    x: int
    y: int


@dataclass
class EpsPolyline:
    dashed: bool
    points: list[tuple[int, int]]


@dataclass
class EpsLabel:
    raw: str
    diagram_index: int
    slot: int
    x: int
    y: int


@dataclass
class EpsDiagram:
    diagram_index: int | None = None
    nodes: list[EpsNode] = field(default_factory=list)
    polylines: list[EpsPolyline] = field(default_factory=list)
    labels: list[EpsLabel] = field(default_factory=list)


def parse_label(raw: str, x: int, y: int) -> EpsLabel:
    slot = int(raw[-1])
    diagram_index = int(raw[1:-1])
    return EpsLabel(raw=raw, diagram_index=diagram_index, slot=slot, x=x, y=y)


def parse_eps(path: Path) -> list[EpsDiagram]:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    diagrams: list[EpsDiagram] = []
    current = EpsDiagram()
    dashed = False
    pending_text_position: tuple[int, int] | None = None
    pending_transform: tuple[int, int] | None = None
    node_counter = 0
    i = 0

    def flush_if_labelled() -> None:
        nonlocal current
        if current.labels:
            current.diagram_index = current.labels[0].diagram_index
            diagrams.append(current)
            current = EpsDiagram()

    while i < len(lines):
        line = lines[i]

        if "[60] 0 sd" in line:
            dashed = True
        if "[] 0 sd" in line and "n " not in line:
            dashed = False

        transform = re.search(r"(-?\d+)\s+(-?\d+)\s+tr\s*$", line.strip())
        if transform:
            pending_transform = tuple(map(int, transform.groups()))

        ellipse = ELLIPSE_RE.search(line)
        if ellipse:
            flush_if_labelled()
            x, y = map(int, ellipse.groups())
            if (x, y) == (0, 0) and pending_transform is not None:
                x, y = pending_transform
            pending_transform = None
            current.nodes.append(EpsNode(id=f"v{node_counter}", x=x, y=y))
            node_counter += 1
            i += 1
            continue

        if re.search(r"\bn\s+-?\d+\s+-?\d+\s+m\b", line):
            flush_if_labelled()
            polyline_lines = [line]
            while i + 1 < len(lines) and "gs col0 s gr" not in lines[i]:
                i += 1
                polyline_lines.append(lines[i])
            text = " ".join(polyline_lines)
            points = [(int(x), int(y)) for x, y in MOVE_RE.findall(text)]
            if len(points) >= 2:
                current.polylines.append(EpsPolyline(dashed=dashed, points=points))
            if "[] 0 sd" in text:
                dashed = False
            i += 1
            continue

        text_pos = re.search(r"(-?\d+)\s+(-?\d+)\s+m\s*$", line.strip())
        if text_pos:
            pending_text_position = tuple(map(int, text_pos.groups()))

        label = LABEL_RE.search(line)
        if label and pending_text_position is not None:
            raw = label.group(1)
            current.labels.append(parse_label(raw, *pending_text_position))

        i += 1

    if current.nodes or current.polylines or current.labels:
        flush_if_labelled()
        if current.nodes or current.polylines or current.labels:
            diagrams.append(current)

    return sorted(diagrams, key=lambda diagram: diagram.diagram_index or 999)


def nearest_node(nodes: list[EpsNode], point: tuple[int, int]) -> str:
    px, py = point
    return min(
        nodes,
        key=lambda node: (node.x - px) * (node.x - px) + (node.y - py) * (node.y - py),
    ).id


def diagram_to_transcription(diagram: EpsDiagram) -> dict[str, Any]:
    if diagram.diagram_index is None:
        raise ValueError("diagram without hidden PSfrag labels")

    local_ids = {node.id: f"v{index}" for index, node in enumerate(diagram.nodes)}
    nodes = [
        {"id": local_ids[node.id], "sourcePosition": [node.x, node.y]}
        for node in diagram.nodes
    ]
    raw_edges: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"solidCount": 0, "dotted": False}
    )
    for polyline in diagram.polylines:
        a = nearest_node(diagram.nodes, polyline.points[0])
        b = nearest_node(diagram.nodes, polyline.points[-1])
        if a == b:
            continue
        key = tuple(sorted((local_ids[a], local_ids[b])))
        if polyline.dashed:
            raw_edges[key]["dotted"] = True
        else:
            raw_edges[key]["solidCount"] += 1

    edges = []
    for (source, target), edge in sorted(raw_edges.items()):
        solid_count = edge["solidCount"]
        if edge["dotted"]:
            edges.append({"source": source, "target": target, "kind": "dotted"})
        if solid_count:
            edges.append(
                {
                    "source": source,
                    "target": target,
                    "kind": "finite",
                    "m": solid_count + 2,
                    "sourceLineCount": solid_count,
                }
            )

    labels = [
        {
            "raw": label.raw,
            "slot": label.slot,
            "sourcePosition": [label.x, label.y],
        }
        for label in sorted(diagram.labels, key=lambda item: item.slot)
    ]
    return {
        "diagramIndex": diagram.diagram_index,
        "nodeCount": len(nodes),
        "nodes": nodes,
        "edges": edges,
        "hiddenDottedLabels": labels,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--eps",
        type=Path,
        default=Path(".tmp_sources/arxiv/pic/5/5_n.eps"),
        help="Path to Tumarkin arXiv source file pic/5/5_n.eps.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON.")
    args = parser.parse_args()

    diagrams = [diagram_to_transcription(diagram) for diagram in parse_eps(args.eps)]
    if args.json:
        print(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "source": str(args.eps),
                    "diagramCount": len(diagrams),
                    "diagrams": diagrams,
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0

    for diagram in diagrams:
        finite = [edge for edge in diagram["edges"] if edge["kind"] == "finite"]
        dotted = [edge for edge in diagram["edges"] if edge["kind"] == "dotted"]
        print(
            f"#{diagram['diagramIndex']:02d}: "
            f"nodes={diagram['nodeCount']} finite={len(finite)} dotted={len(dotted)} "
            f"m={[edge['m'] for edge in finite]}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
