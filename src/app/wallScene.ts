import type { BarXCompressedComplex } from "../compression/types";
import type { SceneCell, SceneGenerator, SceneNode } from "../render/SceneView";
import type {
  LawfulSubcomplexEvaluation,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import {
  buildBarXScene,
  type CompressedComplexScene,
  type SceneLineStyle,
  type StyledSceneEdge,
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

/**
 * Nine wall hues, each with at least 3:1 contrast against both the light
 * (#f6f7f9) and dark (#0d1117) canvas backgrounds. Nine hues cannot keep 42
 * walls apart, so each wall gets a (hue, line style) pair instead of a hue
 * cycled modulo the palette; see `wallStyle`.
 */
const wallPalette = [
  "#0284c7",
  "#dc2626",
  "#16a34a",
  "#a16207",
  "#9333ea",
  "#ea580c",
  "#0d9488",
  "#db2777",
  "#64748b",
] as const;

const wallLineStyles: readonly SceneLineStyle[] = [
  "solid",
  "dashed",
  "dotted",
  "dash-dot",
  "long-dash",
];

/** Number of walls that receive pairwise distinct (hue, line style) cues. */
export const WALL_STYLE_CAPACITY = wallPalette.length * wallLineStyles.length;

export interface WallStyle {
  color: string;
  lineStyle: SceneLineStyle;
  /** False once the wall index exceeds WALL_STYLE_CAPACITY and cues repeat. */
  unique: boolean;
}

/**
 * Style cue for the wall with this index.
 *
 * The hue cycles through the palette; the line style advances once per full
 * hue cycle and is also shifted by the hue index. The shift matters for
 * colour-blind readers: the hue pairs that collapse under protanopia or
 * deuteranopia (red/brown, red/orange, green/teal, sky/teal) sit 2, 4 or 6
 * places apart in the palette, so within one cycle they never share a line
 * style. Indices below WALL_STYLE_CAPACITY give distinct pairs.
 */
export function wallStyle(index: number): WallStyle {
  const safeIndex = Math.max(0, index);
  const hue = safeIndex % wallPalette.length;
  const cycle = Math.floor(safeIndex / wallPalette.length);
  return {
    color: wallPalette[hue],
    lineStyle: wallLineStyles[(cycle + hue) % wallLineStyles.length],
    unique: safeIndex < WALL_STYLE_CAPACITY,
  };
}

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
    wallDualEdgeIds: selectedWallEdgeSet,
    ghostCellIds:
      options.showDiscardedCells === false ? discardedCells : undefined,
  });
  applyLinkLens(base, options.selectedVertexId, options.linkLens ?? "none");
  if (
    options.colorEdgesByWall !== false &&
    wallSystem.walls.length > WALL_STYLE_CAPACITY
  ) {
    base.warnings.push(
      `${wallSystem.walls.length} walls exceed the ${WALL_STYLE_CAPACITY} distinct colour and line-style pairs; walls W${WALL_STYLE_CAPACITY + 1} onward repeat a pair. Use Selected wall to isolate one wall.`,
    );
  }
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
        const style = wallStyle(wallIndex);
        edge.colorHint = style.color;
        edge.lineStyle = style.lineStyle;
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
      colorHint: wallStyle(wallIndex).color,
      nodeScale: focused ? 0.34 : 0.16,
      drawingOnly: true,
      ghost: linkLensActive || (!focused && selectedWall !== undefined),
    });
  }

  const wallGenerators: SceneGenerator[] = wallSystem.walls.map(
    (wall, index) => ({
      label: `W${index + 1}`,
      colorHint: wallStyle(index).color,
    }),
  );
  const segmentEdges: StyledSceneEdge[] = [];
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
      colorHint: wallStyle(wallIndex).color,
      lineStyle: wallStyle(wallIndex).lineStyle,
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
  return wallStyle(index >= 0 ? index : 0).color;
}

/** Line style paired with `wallColor`; swatches should show both cues. */
export function wallLineStyle(
  wallSystem: WallSystem,
  wallId: string,
): SceneLineStyle {
  const index = wallSystem.walls.findIndex((wall) => wall.id === wallId);
  return wallStyle(index >= 0 ? index : 0).lineStyle;
}
