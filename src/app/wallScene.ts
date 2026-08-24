import type { BarXCompressedComplex } from "../compression/types";
import type {
  SceneCell,
  SceneEdge,
  SceneGenerator,
  SceneNode,
} from "../render/SceneView";
import type {
  LawfulSubcomplexEvaluation,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import {
  buildBarXScene,
  type CompressedComplexScene,
} from "./compressedComplexScene";
import { relationCellMatchesFamily } from "./barXRelationFamilies";

export interface WallSceneOptions {
  selectedWallId?: string;
  selectedCellId?: string;
  relationFamily?: [number, number];
  spreadRelationCells?: boolean;
  showWalls?: boolean;
  focusSelectedWall?: boolean;
  showInducedDirections?: boolean;
  colorEdgesByWall?: boolean;
  showRelationCells?: boolean;
  showDiscardedCells?: boolean;
  coorientation?: WallCoorientation;
  lawfulSubcomplex?: LawfulSubcomplexEvaluation;
  selectedVertexId?: string;
  linkLens?: "none" | "ascending" | "descending";
}

export interface WallScene extends CompressedComplexScene {
  wallSegmentCount: number;
  selectedWallEdgeIds: string[];
}

const wallPalette = [
  "#0ea5e9",
  "#ef4444",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#f97316",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
  "#84cc16",
];

/**
 * Adds the abstract wall graph and a chosen coorientation to a bar-X scene.
 *
 * Wall midpoint nodes and straight crossing segments are drawing aids. Their
 * ids point back to the exact edge equivalence classes and opposite-side
 * incidences in `WallSystem`; no new cell is introduced into bar X.
 */
export function buildWallScene(
  barX: BarXCompressedComplex,
  wallSystem: WallSystem,
  options: WallSceneOptions = {},
): WallScene {
  const visibleRelationCells = barX.relationCells.filter((cell) =>
    relationCellMatchesFamily(cell, options.relationFamily),
  );
  const visibleRelationCellIds = new Set(
    visibleRelationCells.map((cell) => cell.id),
  );
  const visibleRelationEdgeIds = new Set(
    visibleRelationCells.flatMap((cell) =>
      cell.boundaryOccurrences.map((occurrence) => occurrence.edgeId),
    ),
  );
  const selectedWall = options.selectedWallId
    ? wallSystem.walls.find((wall) => wall.id === options.selectedWallId)
    : undefined;
  const selectedWallEdgeIds = selectedWall?.edgeIds ?? [];
  const selectedWallEdgeSet = new Set(selectedWallEdgeIds);
  const retainedCells = new Set(
    options.lawfulSubcomplex?.retainedCellIds ??
      barX.relationCells.map((cell) => cell.id),
  );
  const discardedCells = new Set(
    options.lawfulSubcomplex?.discardedCellIds ?? [],
  );
  const cellRoles = new Map<string, SceneCell["readabilityRole"]>();
  const denseOverview =
    options.spreadRelationCells !== true &&
    options.relationFamily === undefined &&
    barX.relationCells.length > 24;
  for (const cell of barX.relationCells) {
    cellRoles.set(
      cell.id,
      cell.id === options.selectedCellId
        ? "focus"
        : retainedCells.has(cell.id)
          ? denseOverview
            ? "context"
            : "incident"
          : "context",
    );
  }
  const edgeDirections = options.coorientation
    ? new Map(
        Object.entries(options.coorientation.edgeDirections) as Array<
          [string, -1 | 1]
        >,
      )
    : undefined;
  const base = buildBarXScene(barX, {
    selectedVertexId: options.selectedVertexId,
    selectedCellId: options.selectedCellId,
    relationFamily: options.relationFamily,
    spreadRelationCells: options.spreadRelationCells,
    showRelationCells: options.showRelationCells ?? true,
    cellRoles,
    edgeDirections,
    emphasizedEdgeIds: selectedWallEdgeSet,
    ghostCellIds:
      options.showDiscardedCells === false ? discardedCells : undefined,
  });
  applyLinkLens(base, options.selectedVertexId, options.linkLens ?? "none");
  if (options.showInducedDirections === false) {
    for (const edge of base.edges) edge.directed = false;
  }

  const wallIndexById = new Map(
    wallSystem.walls.map((wall, index) => [wall.id, index]),
  );
  if (options.colorEdgesByWall !== false) {
    for (const edge of base.edges) {
      const wallId = wallSystem.edgeToWallId[edge.id];
      const wallIndex = wallIndexById.get(wallId);
      if (wallIndex !== undefined) {
        edge.colorHint = wallPalette[wallIndex % wallPalette.length];
      }
    }
  }
  if (options.focusSelectedWall === true && selectedWall) {
    const incidentCellIds = new Set(selectedWall.cellIds);
    for (const edge of base.edges) {
      if (!edge.drawingOnly && !selectedWallEdgeSet.has(edge.id)) {
        edge.ghost = true;
      }
    }
    for (const cell of base.cells) {
      if (!incidentCellIds.has(cell.id)) cell.readabilityRole = "context";
    }
  }

  if (options.spreadRelationCells) {
    return {
      ...base,
      cells:
        options.showDiscardedCells === false
          ? base.cells.filter((cell) => !discardedCells.has(cell.id))
          : base.cells,
      wallSegmentCount: 0,
      selectedWallEdgeIds,
      warnings: [
        ...base.warnings,
        "Wall arcs are hidden while relation disks are spread. Use Compact gluing to read walls on the undeformed cell drawing.",
      ],
    };
  }

  if (options.showWalls === false) {
    return {
      ...base,
      cells:
        options.showDiscardedCells === false
          ? base.cells.filter((cell) => !discardedCells.has(cell.id))
          : base.cells,
      wallSegmentCount: 0,
      selectedWallEdgeIds,
    };
  }

  const positions = new Map(
    base.nodes
      .filter((node) => node.position !== undefined)
      .map((node) => [node.id, node.position!] as const),
  );
  const midpointNodeIds = new Map<string, string>();
  const midpointNodes: SceneNode[] = [];
  const linkLensActive = (options.linkLens ?? "none") !== "none";

  for (const edge of barX.geometricEdges) {
    if (
      options.relationFamily !== undefined &&
      !visibleRelationEdgeIds.has(edge.id)
    ) {
      continue;
    }
    const source = positions.get(edge.sourceVertexId);
    const target = positions.get(edge.targetVertexId);
    if (!source || !target) {
      continue;
    }
    const nodeId = `drawing:wall-midpoint:${edge.id}`;
    midpointNodeIds.set(edge.id, nodeId);
    const wallId = wallSystem.edgeToWallId[edge.id];
    const wallIndex = wallIndexById.get(wallId) ?? 0;
    const focused =
      options.focusSelectedWall !== true ||
      !selectedWall ||
      selectedWall.id === wallId;
    midpointNodes.push({
      id: nodeId,
      length: 0,
      position: [
        (source[0] + target[0]) / 2,
        (source[1] + target[1]) / 2,
        (source[2] + target[2]) / 2,
      ],
      colorHint: wallPalette[wallIndex % wallPalette.length],
      nodeScale: focused ? 0.34 : 0.16,
      drawingOnly: true,
      ghost: linkLensActive || (!focused && selectedWall !== undefined),
    });
  }

  const wallGenerators: SceneGenerator[] = wallSystem.walls.map(
    (wall, index) => ({
      label: `W${index + 1}`,
      colorHint: wallPalette[index % wallPalette.length],
    }),
  );
  const segmentEdges: SceneEdge[] = [];
  for (const segment of wallSystem.crossingSegments) {
    if (
      options.relationFamily !== undefined &&
      !visibleRelationCellIds.has(segment.cellId)
    ) {
      continue;
    }
    const firstNodeId = midpointNodeIds.get(segment.first.edgeId);
    const secondNodeId = midpointNodeIds.get(segment.second.edgeId);
    if (!firstNodeId || !secondNodeId) {
      continue;
    }
    const wallIndex = wallIndexById.get(segment.wallId) ?? 0;
    const focused =
      options.focusSelectedWall !== true ||
      !selectedWall ||
      selectedWall.id === segment.wallId;
    const firstSegmentForWall =
      wallSystem.walls[wallIndex]?.crossingSegmentIds[0] === segment.id;
    segmentEdges.push({
      id: `drawing:${segment.id}`,
      source: firstNodeId,
      target: secondNodeId,
      generator: base.generators.length + wallIndex,
      compactLabel:
        selectedWall?.id === segment.wallId && firstSegmentForWall
          ? `W${wallIndex + 1}`
          : undefined,
      colorHint: wallPalette[wallIndex % wallPalette.length],
      alwaysLabel: selectedWall?.id === segment.wallId && firstSegmentForWall,
      labelPriority: focused ? 90_000 : 10,
      suppressSemanticLabel: !(
        selectedWall?.id === segment.wallId && firstSegmentForWall
      ),
      drawingOnly: true,
      readabilityOverlay: true,
      ghost: linkLensActive || (!focused && selectedWall !== undefined),
    });
  }

  return {
    ...base,
    nodes: [...base.nodes, ...midpointNodes],
    edges: [...base.edges, ...segmentEdges],
    cells:
      options.showDiscardedCells === false
        ? base.cells.filter((cell) => !discardedCells.has(cell.id))
        : base.cells,
    generators: [...base.generators, ...wallGenerators],
    wallSegmentCount: segmentEdges.length,
    selectedWallEdgeIds,
    warnings: [
      ...base.warnings,
      "Straight wall segments connect exact opposite-edge incidences, but their Euclidean shape is a drawing convention.",
      ...(options.showInducedDirections === false
        ? []
        : [
            "Arrowheads on dual bar-X edges show the induced wall coorientation; the wall arcs themselves are not directed.",
          ]),
    ],
  };
}

function applyLinkLens(
  scene: CompressedComplexScene,
  selectedVertexId: string | undefined,
  lens: "none" | "ascending" | "descending",
): void {
  if (!selectedVertexId || lens === "none") return;
  for (const edge of scene.edges) {
    if (edge.drawingOnly) continue;
    const matches =
      lens === "ascending"
        ? edge.directed && edge.source === selectedVertexId
        : edge.directed && edge.target === selectedVertexId;
    edge.ghost = !matches;
    if (matches) edge.emphasis = "readable-boundary";
  }
  for (const cell of scene.cells) {
    const incident = cell.boundaryNodeIds.includes(selectedVertexId);
    if (!incident) cell.readabilityRole = "context";
  }
}

export function wallLabel(wallSystem: WallSystem, wallId: string): string {
  const index = wallSystem.walls.findIndex((wall) => wall.id === wallId);
  return index >= 0 ? `W${index + 1}` : wallId;
}

export function wallColor(wallSystem: WallSystem, wallId: string): string {
  const index = wallSystem.walls.findIndex((wall) => wall.id === wallId);
  return wallPalette[(index >= 0 ? index : 0) % wallPalette.length];
}
