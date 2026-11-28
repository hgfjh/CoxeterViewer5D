import type {
  BoundaryOccurrence,
  CoverCompressionResult,
} from "../compression/types";
import type {
  LawfulSubcomplexEvaluation,
  OrientationSign,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import {
  barXRelationFamilyId,
  type BarXFiniteRelationFamilyId,
} from "./barXRelationFamilies";

/*
 * The cell atlas draws every relation cell of hat X or bar X as its own
 * regular 2m-gon, read straight off the cell's attaching word. Nothing here is
 * a layout of the complex: shared vertices and edges are not drawn glued, they
 * are recorded in `vertexCellIds` / `edgeCellIds` so the view can highlight
 * every cell that contains a hovered vertex or edge.
 *
 * Why a separate view: in the ideal 3-cube cover, each 6-vertex S3 coset
 * carries three hexagons, the three Hamiltonian 6-cycles of K_{3,3} for the
 * three generator pairs of that S3. No placement of the six vertices makes
 * all three hexagons convex at once, so the 3D picture must distort some of
 * them. The atlas shows every cell undistorted, at the price of not gluing.
 */

export type CellAtlasComplex = "hat-x" | "bar-x";

export interface CellAtlasCorner {
  vertexId: string;
  label: string;
}

export interface CellAtlasSide {
  edgeId: string;
  generator: number;
  generatorLabel: string;
  /** Index of the side in the stored attaching word, before rotation. */
  boundaryIndex: number;
  /**
   * Arrow of the wall coorientation read along the drawn boundary direction:
   * 1 points from corner k to corner k+1. Absent without a coorientation.
   */
  directionAlongBoundary?: OrientationSign;
  /** True when this edge is dual to the selected wall. */
  inSelectedWall: boolean;
}

/** A selected-wall arc through the cell, joining two side midpoints. */
export interface CellAtlasWallCrossing {
  segmentId: string;
  wallId: string;
  fromSide: number;
  toSide: number;
}

export interface CellAtlasStatus {
  lawful: boolean;
  transitionCount: number;
  /** Corner indices, present only for lawful cells. */
  sourceCorner?: number;
  sinkCorner?: number;
  /** Dropped by the lawful subcomplex for the current coorientation. */
  discarded: boolean;
}

export interface CellAtlasCell {
  /** Identical to the 3D scene cell id, so selection is shared. */
  id: string;
  familyId: BarXFiniteRelationFamilyId;
  generatorPair: [number, number];
  m: number;
  /**
   * Corner k is the start of side k. The cycle is rotated to begin at the
   * vertex with the smallest label and keeps the stored boundary direction,
   * so two cells of one family read in the same way.
   */
  corners: CellAtlasCorner[];
  sides: CellAtlasSide[];
  /** Generator labels along the rotated boundary, starting at corners[0]. */
  boundaryWord: string[];
  status?: CellAtlasStatus;
  wallCrossings: CellAtlasWallCrossing[];
}

export interface CellAtlasFamily {
  id: BarXFiniteRelationFamilyId;
  generatorPair: [number, number];
  generatorLabels: [string, string];
  m: number;
  title: string;
  cells: CellAtlasCell[];
}

export interface CellAtlasModel {
  complex: CellAtlasComplex;
  families: CellAtlasFamily[];
  cellCount: number;
  /** Relation cells containing each vertex; the cells are glued along these. */
  vertexCellIds: Map<string, string[]>;
  /** Relation cells containing each edge, counted once per cell. */
  edgeCellIds: Map<string, string[]>;
  vertexLabels: Map<string, string>;
  /** hat X generator bigons, which the atlas does not draw. */
  omittedBigonCount: number;
  /** Longest corner label, so the view can reserve room without clipping. */
  maxCornerLabelLength: number;
  hasLawfulStatus: boolean;
  discardedCellCount: number;
}

export interface CellAtlasInput {
  cover: CoverCompressionResult;
  complex: CellAtlasComplex;
  /** bar X only; ignored for hat X, which has no walls. */
  wallSystem?: WallSystem;
  coorientation?: WallCoorientation;
  lawfulSubcomplex?: LawfulSubcomplexEvaluation;
  selectedWallId?: string;
}

interface RawCell {
  id: string;
  generatorPair: [number, number];
  m: number;
  boundaryOccurrences: BoundaryOccurrence[];
}

/** Build the atlas data for the current cover. Pure; no drawing coordinates. */
export function buildCellAtlas(input: CellAtlasInput): CellAtlasModel {
  const { cover, complex } = input;
  const generators = cover.barX.sourceSystem.generators;
  const generatorLabel = (index: number) =>
    generators[index]?.label ?? `s${index}`;

  const vertexLabels = new Map<string, string>();
  const rawCells: RawCell[] = [];
  if (complex === "hat-x") {
    cover.hatX.vertices.forEach((vertex, index) =>
      vertexLabels.set(vertex.id, vertex.label ?? `v${index}`),
    );
    rawCells.push(...cover.hatX.liftedRelationCells);
  } else {
    cover.barX.vertices.forEach((vertex) =>
      vertexLabels.set(vertex.id, vertex.label ?? vertex.id),
    );
    rawCells.push(...cover.barX.relationCells);
  }

  const barStatus = complex === "bar-x";
  const lawfulById = new Map(
    barStatus && input.lawfulSubcomplex
      ? input.lawfulSubcomplex.cells.map((cell) => [cell.cellId, cell])
      : [],
  );
  const discarded = new Set(
    barStatus ? (input.lawfulSubcomplex?.discardedCellIds ?? []) : [],
  );
  const edgeDirections = barStatus
    ? input.coorientation?.edgeDirections
    : undefined;
  const selectedWall = barStatus
    ? input.wallSystem?.walls.find((wall) => wall.id === input.selectedWallId)
    : undefined;
  const selectedWallEdges = new Set(selectedWall?.edgeIds ?? []);
  const crossingsByCell = new Map<
    string,
    NonNullable<WallSystem["crossingSegments"]>
  >();
  if (selectedWall && input.wallSystem) {
    for (const segment of input.wallSystem.crossingSegments) {
      if (segment.wallId !== selectedWall.id) continue;
      const list = crossingsByCell.get(segment.cellId) ?? [];
      list.push(segment);
      crossingsByCell.set(segment.cellId, list);
    }
  }

  const vertexCellIds = new Map<string, string[]>();
  const edgeCellIds = new Map<string, string[]>();
  const families = new Map<BarXFiniteRelationFamilyId, CellAtlasFamily>();
  let maxCornerLabelLength = 0;

  for (const raw of rawCells) {
    const boundary = [...raw.boundaryOccurrences].sort(
      (left, right) => left.boundaryIndex - right.boundaryIndex,
    );
    const start = smallestLabelIndex(boundary, vertexLabels);
    const rotated = [...boundary.slice(start), ...boundary.slice(0, start)];
    const corners = rotated.map((occurrence) => {
      const label =
        vertexLabels.get(occurrence.sourceVertexId) ??
        occurrence.sourceVertexId;
      maxCornerLabelLength = Math.max(maxCornerLabelLength, label.length);
      return { vertexId: occurrence.sourceVertexId, label };
    });
    const sideByBoundaryIndex = new Map<number, number>();
    const sides = rotated.map((occurrence, sideIndex) => {
      sideByBoundaryIndex.set(occurrence.boundaryIndex, sideIndex);
      const edgeSign = edgeDirections?.[occurrence.edgeId];
      return {
        edgeId: occurrence.edgeId,
        generator: occurrence.generator,
        generatorLabel: generatorLabel(occurrence.generator),
        boundaryIndex: occurrence.boundaryIndex,
        // Same product as the lawfulness check: the stored edge arrow times
        // the direction in which this boundary traverses the edge.
        directionAlongBoundary:
          edgeSign === undefined
            ? undefined
            : ((edgeSign * occurrence.traversal) as OrientationSign),
        inSelectedWall: selectedWallEdges.has(occurrence.edgeId),
      } satisfies CellAtlasSide;
    });

    const lawful = lawfulById.get(raw.id);
    const cornerOf = (vertexId?: string) => {
      if (vertexId === undefined) return undefined;
      const index = corners.findIndex((corner) => corner.vertexId === vertexId);
      return index >= 0 ? index : undefined;
    };
    const status: CellAtlasStatus | undefined = lawful
      ? {
          lawful: lawful.lawful,
          transitionCount: lawful.transitionCount,
          sourceCorner: lawful.lawful
            ? cornerOf(lawful.sourceVertexId)
            : undefined,
          sinkCorner: lawful.lawful ? cornerOf(lawful.sinkVertexId) : undefined,
          discarded: discarded.has(raw.id),
        }
      : undefined;

    const wallCrossings: CellAtlasWallCrossing[] = (
      crossingsByCell.get(raw.id) ?? []
    ).flatMap((segment) => {
      const fromSide = sideByBoundaryIndex.get(segment.first.boundaryIndex);
      const toSide = sideByBoundaryIndex.get(segment.second.boundaryIndex);
      return fromSide === undefined || toSide === undefined
        ? []
        : [{ segmentId: segment.id, wallId: segment.wallId, fromSide, toSide }];
    });

    const familyId = barXRelationFamilyId(raw.generatorPair);
    const cell: CellAtlasCell = {
      id: raw.id,
      familyId,
      generatorPair: raw.generatorPair,
      m: raw.m,
      corners,
      sides,
      boundaryWord: sides.map((side) => side.generatorLabel),
      status,
      wallCrossings,
    };

    // A vertex or edge can in principle appear twice on one boundary; it is
    // still one cell containing it, so count each cell once.
    for (const vertexId of new Set(corners.map((corner) => corner.vertexId))) {
      pushTo(vertexCellIds, vertexId, raw.id);
    }
    for (const edgeId of new Set(sides.map((side) => side.edgeId))) {
      pushTo(edgeCellIds, edgeId, raw.id);
    }

    let family = families.get(familyId);
    if (!family) {
      const pair: [number, number] =
        raw.generatorPair[0] < raw.generatorPair[1]
          ? [raw.generatorPair[0], raw.generatorPair[1]]
          : [raw.generatorPair[1], raw.generatorPair[0]];
      family = {
        id: familyId,
        generatorPair: pair,
        generatorLabels: [generatorLabel(pair[0]), generatorLabel(pair[1])],
        m: raw.m,
        title: "",
        cells: [],
      };
      families.set(familyId, family);
    }
    family.cells.push(cell);
  }

  const orderedFamilies = [...families.values()].sort(
    (left, right) =>
      left.generatorPair[0] - right.generatorPair[0] ||
      left.generatorPair[1] - right.generatorPair[1],
  );
  for (const family of orderedFamilies) {
    family.cells.sort(compareCells);
    family.title = familyTitle(family);
  }

  return {
    complex,
    families: orderedFamilies,
    cellCount: rawCells.length,
    vertexCellIds,
    edgeCellIds,
    vertexLabels,
    omittedBigonCount:
      complex === "hat-x" ? cover.hatX.generatorBigonCells.length : 0,
    maxCornerLabelLength,
    hasLawfulStatus: lawfulById.size > 0,
    discardedCellCount: rawCells.filter((cell) => discarded.has(cell.id))
      .length,
  };
}

/** "t12–t13, m = 3 · 4 cells" */
export function familyTitle(
  family: Pick<CellAtlasFamily, "generatorLabels" | "m" | "cells">,
): string {
  const count = family.cells.length;
  return `${family.generatorLabels[0]}–${family.generatorLabels[1]}, m = ${family.m} · ${count} ${count === 1 ? "cell" : "cells"}`;
}

/** Full attaching word read from the first corner, e.g. "t12 t13 t12 t13 from e". */
export function cellBoundaryText(cell: CellAtlasCell): string {
  return `${cell.boundaryWord.join(" ")} from ${cell.corners[0]?.label ?? "?"}`;
}

/**
 * Cells to highlight while hovering a vertex or an edge: every relation cell
 * whose boundary contains it. This is how the atlas shows gluing without
 * drawing the cells glued.
 */
export function cellsContaining(
  model: Pick<CellAtlasModel, "vertexCellIds" | "edgeCellIds">,
  hover: CellAtlasHover | undefined,
): Set<string> {
  if (!hover) return new Set();
  const ids =
    hover.kind === "vertex"
      ? model.vertexCellIds.get(hover.id)
      : model.edgeCellIds.get(hover.id);
  return new Set(ids ?? []);
}

export type CellAtlasHover =
  | { kind: "vertex"; id: string }
  | { kind: "edge"; id: string };

export interface CellAtlasFilter {
  familyId: "all" | BarXFiniteRelationFamilyId;
  /** Case-insensitive substring of a corner label or the cell id. */
  text: string;
}

/** Apply the family and vertex-label filters; families left empty are dropped. */
export function filterCellAtlas(
  model: CellAtlasModel,
  filter: CellAtlasFilter,
): CellAtlasFamily[] {
  const needle = filter.text.trim().toLowerCase();
  return model.families
    .filter(
      (family) => filter.familyId === "all" || family.id === filter.familyId,
    )
    .map((family) => ({
      ...family,
      cells: needle
        ? family.cells.filter(
            (cell) =>
              cell.id.toLowerCase().includes(needle) ||
              cell.corners.some((corner) =>
                corner.label.toLowerCase().includes(needle),
              ),
          )
        : family.cells,
    }))
    .filter((family) => family.cells.length > 0);
}

export interface AtlasPolygonGeometry {
  corners: Array<{
    x: number;
    y: number;
    labelX: number;
    labelY: number;
    anchor: "start" | "middle" | "end";
  }>;
  sides: Array<{
    /** Midpoint on the boundary; wall arcs and arrows sit here. */
    midX: number;
    midY: number;
    /** Generator label point, pulled toward the centre off the edge. */
    labelX: number;
    labelY: number;
    /** Unit tangent from corner k to corner k+1. */
    tangentX: number;
    tangentY: number;
  }>;
}

/**
 * Drawing convention for one atlas cell: a regular n-gon of circumradius
 * `radius` centred at the origin, SVG coordinates (y down). Corner 0 is the
 * upper-left end of a horizontal top side and the boundary runs clockwise on
 * screen. Corner labels go outside the polygon and generator labels inside,
 * so the two kinds of label never compete for the same space.
 */
export function atlasPolygonGeometry(
  sideCount: number,
  radius: number,
): AtlasPolygonGeometry {
  const step = (2 * Math.PI) / sideCount;
  const start = -Math.PI / 2 - step / 2;
  const points = Array.from({ length: sideCount }, (_, index) => {
    const angle = start + index * step;
    return { cos: Math.cos(angle), sin: Math.sin(angle) };
  });
  const corners = points.map(({ cos, sin }) => {
    const anchor: "start" | "middle" | "end" =
      cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
    return {
      x: radius * cos,
      y: radius * sin,
      labelX: (radius + 7) * cos,
      // Text is vertically centred on labelY; push top and bottom labels a
      // little further out so they clear the corner dot.
      labelY: (radius + 7) * sin + (sin < -0.3 ? -3 : sin > 0.3 ? 3 : 0),
      anchor,
    };
  });
  const inset = Math.min(17, radius * 0.3);
  const sides = corners.map((corner, index) => {
    const next = corners[(index + 1) % sideCount];
    const midX = (corner.x + next.x) / 2;
    const midY = (corner.y + next.y) / 2;
    const length = Math.hypot(next.x - corner.x, next.y - corner.y);
    const midLength = Math.hypot(midX, midY);
    return {
      midX,
      midY,
      labelX: midX - (inset * midX) / midLength,
      labelY: midY - (inset * midY) / midLength,
      tangentX: (next.x - corner.x) / length,
      tangentY: (next.y - corner.y) / length,
    };
  });
  return { corners, sides };
}

function smallestLabelIndex(
  boundary: readonly BoundaryOccurrence[],
  labels: ReadonlyMap<string, string>,
): number {
  let best = 0;
  for (let index = 1; index < boundary.length; index += 1) {
    if (
      compareVertex(
        boundary[index].sourceVertexId,
        boundary[best].sourceVertexId,
        labels,
      ) < 0
    ) {
      best = index;
    }
  }
  return best;
}

// Code-point order, not locale order, so the rotation does not depend on the
// browser's locale.
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVertex(
  left: string,
  right: string,
  labels: ReadonlyMap<string, string>,
): number {
  return (
    compareText(labels.get(left) ?? left, labels.get(right) ?? right) ||
    compareText(left, right)
  );
}

// Cells sharing a start vertex sit next to each other; in hat X this puts
// the parallel lifts of one bar-X cell side by side.
function compareCells(left: CellAtlasCell, right: CellAtlasCell): number {
  const length = Math.min(left.corners.length, right.corners.length);
  for (let index = 0; index < length; index += 1) {
    const order = compareText(
      left.corners[index].label,
      right.corners[index].label,
    );
    if (order !== 0) return order;
  }
  return compareText(left.id, right.id);
}

function pushTo(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
