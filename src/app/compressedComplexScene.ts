import type {
  BarXCompressedComplex,
  HatXCoverComplex,
} from "../compression/types";
import type {
  SceneCell,
  SceneEdge,
  SceneGenerator,
  SceneNode,
} from "../render/SceneView";
import { relationCellMatchesFamily } from "./barXRelationFamilies";

type Vec3 = [number, number, number];

export interface ComplexSceneInventory {
  vertices: number;
  edges: number;
  twoCells: number;
  generatorBigons?: number;
  relationCellLifts?: number;
}

export interface CompressedComplexScene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  cells: SceneCell[];
  generators: SceneGenerator[];
  inventory: ComplexSceneInventory;
  warnings: string[];
}

export interface HatXSceneOptions {
  selectedVertexId?: string;
  selectedCellId?: string;
  showRelationCells?: boolean;
}

export interface BarXSceneOptions {
  selectedVertexId?: string;
  selectedCellId?: string;
  /** One exact finite pair to emphasize; omitted means all relation cells. */
  relationFamily?: [number, number];
  /** Spread the existing quotient cells in 3D without duplicating incidence. */
  spreadRelationCells?: boolean;
  showRelationCells?: boolean;
  cellRoles?: ReadonlyMap<string, SceneCell["readabilityRole"]>;
  edgeDirections?: ReadonlyMap<string, -1 | 0 | 1>;
  ghostEdgeIds?: ReadonlySet<string>;
  emphasizedEdgeIds?: ReadonlySet<string>;
  ghostCellIds?: ReadonlySet<string>;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FORCE_LAYOUT_LIMIT = 320;
const FORCE_ITERATIONS = 72;

/**
 * Adapts the finite presentation cover hat X to the generic Three.js scene.
 *
 * Each directed lift remains a separate scene edge. The two bigon lifts based
 * at opposite endpoints share the same exact two-edge boundary. We show that
 * boundary as paired rails rather than inventing a triangular third edge.
 * Relation lifts retain their exact attaching cycles.
 */
export function buildHatXScene(
  hatX: HatXCoverComplex,
  options: HatXSceneOptions = {},
): CompressedComplexScene {
  const positions = layoutComplexGraph(
    hatX.vertices.map((vertex) => vertex.id),
    hatX.directedLiftEdges.map((edge) => ({
      source: edge.sourceVertexId,
      target: edge.targetVertexId,
    })),
  );
  emphasizeRelationBoundaryLayout(
    positions,
    (
      hatX.liftedRelationCells.find(
        (cell) => cell.id === options.selectedCellId,
      ) ?? hatX.liftedRelationCells[0]
    )?.boundaryOccurrences.map((occurrence) => occurrence.sourceVertexId),
  );
  const offsets = parallelEdgeOffsets(
    hatX.directedLiftEdges.map((edge) => ({
      id: edge.id,
      source: edge.sourceVertexId,
      target: edge.targetVertexId,
      generator: edge.generator,
    })),
  );
  const nodes: SceneNode[] = hatX.vertices.map((vertex, index) => ({
    id: vertex.id,
    label: vertex.label ?? `v${index}`,
    compactLabel: vertex.label ?? `v${index}`,
    length: vertex.representativeWord?.length ?? 0,
    position: positions.get(vertex.id),
    alwaysLabel: vertex.id === options.selectedVertexId,
    labelPriority:
      vertex.id === options.selectedVertexId ? 100_000 : 100 - index,
    nodeScale: vertex.id === options.selectedVertexId ? 1.45 : 1,
  }));
  const edges: SceneEdge[] = hatX.directedLiftEdges.map((edge, index) => ({
    id: edge.id,
    source: edge.sourceVertexId,
    target: edge.targetVertexId,
    generator: edge.generator,
    compactLabel: hatX.sourceSystem.generators[edge.generator]?.label,
    directed: true,
    visualOffset: offsets.get(edge.id) ?? 0,
    alwaysLabel: true,
    labelPriority: 50_000 - index,
  }));
  const cells: SceneCell[] =
    (options.showRelationCells ?? true)
      ? hatX.liftedRelationCells.map((cell) => ({
          id: cell.id,
          generatorPair: cell.generatorPair,
          boundaryNodeIds: cell.boundaryOccurrences.map(
            (occurrence) => occurrence.sourceVertexId,
          ),
          sourceCellId: cell.id,
          readabilityRole:
            cell.id === options.selectedCellId ? "focus" : "context",
        }))
      : [];

  return {
    nodes,
    edges,
    cells,
    generators: sceneGenerators(hatX.sourceSystem),
    inventory: {
      vertices: hatX.vertices.length,
      edges: hatX.directedLiftEdges.length,
      twoCells:
        hatX.generatorBigonCells.length + hatX.liftedRelationCells.length,
      generatorBigons: hatX.generatorBigonCells.length,
      relationCellLifts: hatX.liftedRelationCells.length,
    },
    warnings: [
      ...hatX.warnings,
      "Each paired rail boundary is shared by two lifted generator bigons; no triangular proxy is drawn.",
      "Vertex positions and rail offsets are drawing conventions.",
    ],
  };
}

/**
 * Adapts the compressed complex bar X without changing its cellular incidence.
 * A coorientation may reverse the displayed direction of an edge, but the
 * stored bar-X edge and every signed boundary occurrence remain untouched.
 */
export function buildBarXScene(
  barX: BarXCompressedComplex,
  options: BarXSceneOptions = {},
): CompressedComplexScene {
  const visibleRelationCells = barX.relationCells
    .filter((cell) => relationCellMatchesFamily(cell, options.relationFamily))
    .sort((left, right) => left.id.localeCompare(right.id));
  const basePositions = layoutComplexGraph(
    barX.vertices.map((vertex) => vertex.id),
    barX.geometricEdges.map((edge) => ({
      source: edge.sourceVertexId,
      target: edge.targetVertexId,
    })),
  );
  const positions = options.spreadRelationCells
    ? options.relationFamily
      ? layoutFocusedRelationFamily(basePositions, visibleRelationCells)
      : layoutExpandedBarX(barX, basePositions)
    : basePositions;
  if (!options.spreadRelationCells) {
    emphasizeRelationBoundaryLayout(
      positions,
      (
        barX.relationCells.find((cell) => cell.id === options.selectedCellId) ??
        barX.relationCells[0]
      )?.boundaryOccurrences.map((occurrence) => occurrence.sourceVertexId),
    );
  }
  const focusedBoundaryEdgeIds = new Set(
    visibleRelationCells.flatMap((cell) =>
      cell.boundaryOccurrences.map((occurrence) => occurrence.edgeId),
    ),
  );
  const interiorSurfaces =
    options.spreadRelationCells && options.relationFamily === undefined
      ? expandedCellDrawingSurfaces(visibleRelationCells, positions)
      : new Map<string, ExpandedCellDrawingSurface>();
  const nodes: SceneNode[] = barX.vertices.map((vertex, index) => ({
    id: vertex.id,
    label: vertex.label ?? `v${index}`,
    compactLabel: vertex.label ?? `v${index}`,
    length: 0,
    position: positions.get(vertex.id),
    alwaysLabel: vertex.id === options.selectedVertexId,
    labelPriority:
      vertex.id === options.selectedVertexId ? 100_000 : 100 - index,
    nodeScale: vertex.id === options.selectedVertexId ? 1.5 : 1,
  }));
  const edges: SceneEdge[] = barX.geometricEdges.map((edge, index) => {
    const direction = options.edgeDirections?.get(edge.id) ?? 0;
    const reversed = direction === -1;
    const ghostedByRelationFocus =
      options.spreadRelationCells === true &&
      options.relationFamily !== undefined &&
      !focusedBoundaryEdgeIds.has(edge.id);
    return {
      id: edge.id,
      source: reversed ? edge.targetVertexId : edge.sourceVertexId,
      target: reversed ? edge.sourceVertexId : edge.targetVertexId,
      generator: edge.generator,
      compactLabel: barX.sourceSystem.generators[edge.generator]?.label,
      directed: direction !== 0,
      coorientationArrow: direction !== 0,
      colorHint: ghostedByRelationFocus ? "#94a3b8" : undefined,
      alwaysLabel: !ghostedByRelationFocus,
      labelPriority: ghostedByRelationFocus ? undefined : 50_000 - index,
      suppressSemanticLabel: ghostedByRelationFocus,
      ghost: options.ghostEdgeIds?.has(edge.id) || ghostedByRelationFocus,
      emphasis:
        options.emphasizedEdgeIds?.has(edge.id) ||
        (options.spreadRelationCells === true &&
          options.relationFamily !== undefined &&
          focusedBoundaryEdgeIds.has(edge.id))
          ? "readable-boundary"
          : undefined,
      // In a spread-cell drawing the sheets are secondary. Re-draw the exact
      // quotient rails above them so the common attaching skeleton never
      // disappears behind translucent collars.
      readabilityOverlay: options.spreadRelationCells === true,
    };
  });
  const cells: SceneCell[] =
    (options.showRelationCells ?? true)
      ? visibleRelationCells.map((cell) => ({
          id: cell.id,
          generatorPair: cell.generatorPair,
          boundaryNodeIds: cell.boundaryOccurrences.map(
            (occurrence) => occurrence.sourceVertexId,
          ),
          sourceCellId: cell.id,
          drawingInteriorPoint: interiorSurfaces.get(cell.id)?.center,
          drawingInteriorRing: interiorSurfaces.get(cell.id)?.ring,
          readabilityRole:
            options.cellRoles?.get(cell.id) ??
            (cell.id === options.selectedCellId
              ? "focus"
              : options.ghostCellIds?.has(cell.id)
                ? "context"
                : options.spreadRelationCells && !options.relationFamily
                  ? "context"
                  : "incident"),
        }))
      : [];

  return {
    nodes,
    edges,
    cells,
    generators: sceneGenerators(barX.sourceSystem),
    inventory: {
      vertices: barX.vertices.length,
      edges: barX.geometricEdges.length,
      twoCells: barX.relationCells.length,
    },
    warnings: [
      ...barX.warnings,
      "The compression, attaching cycles, and edge directions are combinatorial data; their 3D placement is a drawing.",
      ...(options.spreadRelationCells
        ? options.relationFamily
          ? [
              `${visibleRelationCells.length} exact relation cells are spread using their original quotient vertices and edges. The remaining generator edges stay as faint gluing context.`,
              "No boundary vertex or generator edge is duplicated in this relation-family view.",
            ]
          : [
              `All ${visibleRelationCells.length} exact relation disks remain attached to one shared quotient 1-skeleton.`,
              "The disk interiors are spread into relation-family lanes using drawing-only folds; every attaching cycle remains on the original quotient rails.",
            ]
        : []),
    ],
  };
}

/**
 * A finite-pair orbit partitions the quotient vertices. We place those exact
 * cycles on four tangent planes, then retain every other generator edge as the
 * gluing between them. No per-cell boundary copy is introduced.
 */
function layoutFocusedRelationFamily(
  fallback: Map<string, Vec3>,
  cells: ReadonlyArray<BarXCompressedComplex["relationCells"][number]>,
): Map<string, Vec3> {
  const positions = new Map(fallback);
  const claimed = new Set<string>();
  const viewNormal: Vec3 = normalize([0, -Math.sqrt(3) / 2, 0.5]);
  const viewU: Vec3 = [1, 0, 0];
  const viewV: Vec3 = normalize(cross(viewNormal, viewU));
  const grid = [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ] as const;

  cells.forEach((cell, cellIndex) => {
    const boundary = cell.boundaryOccurrences.map(
      (occurrence) => occurrence.sourceVertexId,
    );
    if (boundary.some((nodeId) => claimed.has(nodeId))) return;
    boundary.forEach((nodeId) => claimed.add(nodeId));
    const gridPoint = cells.length === 4 ? grid[cellIndex] : ([0, 0] as const);
    const normal =
      cells.length === 4
        ? normalize([
            viewNormal[0] +
              viewU[0] * gridPoint[0] * 0.12 +
              viewV[0] * gridPoint[1] * 0.1,
            viewNormal[1] +
              viewU[1] * gridPoint[0] * 0.12 +
              viewV[1] * gridPoint[1] * 0.1,
            viewNormal[2] +
              viewU[2] * gridPoint[0] * 0.12 +
              viewV[2] * gridPoint[1] * 0.1,
          ])
        : fibonacciDirections(cells.length)[cellIndex];
    const basisU = orthogonal(normal);
    const basisV = normalize(cross(normal, basisU));
    const center: Vec3 =
      cells.length === 4
        ? [
            viewU[0] * gridPoint[0] * 4.4 +
              viewV[0] * gridPoint[1] * 4.2 +
              viewNormal[0] * ((cellIndex % 2) * 0.5 - 0.25),
            viewU[1] * gridPoint[0] * 4.4 +
              viewV[1] * gridPoint[1] * 4.2 +
              viewNormal[1] * ((cellIndex % 2) * 0.5 - 0.25),
            viewU[2] * gridPoint[0] * 4.4 +
              viewV[2] * gridPoint[1] * 4.2 +
              viewNormal[2] * ((cellIndex % 2) * 0.5 - 0.25),
          ]
        : [normal[0] * 5.2, normal[1] * 5.2, normal[2] * 5.2];
    const radius = Math.max(2.8, Math.min(3.5, boundary.length * 0.52));
    boundary.forEach((nodeId, boundaryIndex) => {
      const angle =
        -Math.PI / 2 + (2 * Math.PI * boundaryIndex) / boundary.length;
      positions.set(nodeId, [
        center[0] +
          basisU[0] * Math.cos(angle) * radius +
          basisV[0] * Math.sin(angle) * radius,
        center[1] +
          basisU[1] * Math.cos(angle) * radius +
          basisV[1] * Math.sin(angle) * radius,
        center[2] +
          basisU[2] * Math.cos(angle) * radius +
          basisV[2] * Math.sin(angle) * radius,
      ]);
    });
  });
  return positions;
}

/** A symmetric S4 orbit drawing for the bundled ideal-cube cover. */
function layoutExpandedBarX(
  barX: BarXCompressedComplex,
  fallback: Map<string, Vec3>,
): Map<string, Vec3> {
  const expectedGenerators = ["t12", "t13", "t14", "t23", "t24", "t34"];
  const isIdealCubeS4 =
    barX.vertices.length === 24 &&
    barX.sourceSystem.generators.every(
      (generator, index) => generator.id === expectedGenerators[index],
    );
  if (!isIdealCubeS4) {
    return new Map(
      [...fallback].map(([id, point]) => [
        id,
        [point[0] * 1.45, point[1] * 1.45, point[2] * 1.45] as Vec3,
      ]),
    );
  }

  const permutations = permutationsOfFour();
  const basis: Vec3[] = [
    normalize([1, 1, 1]),
    normalize([1, -1, -1]),
    normalize([-1, 1, -1]),
    normalize([-1, -1, 1]),
  ];
  const chamberPoint = [-1.5, -0.5, 0.5, 1.5];
  const positions = new Map<string, Vec3>();
  for (const vertex of barX.vertices) {
    const match = /^q(\d+)$/.exec(vertex.sourceQuotientVertexId);
    const permutation = match ? permutations[Number(match[1])] : undefined;
    if (!permutation) {
      positions.set(vertex.id, fallback.get(vertex.id) ?? [0, 0, 0]);
      continue;
    }
    const inverse = [0, 0, 0, 0];
    permutation.forEach((image, index) => {
      inverse[image] = index;
    });
    const coordinates = inverse.map((index) => chamberPoint[index]);
    const point: Vec3 = [0, 0, 0];
    coordinates.forEach((coordinate, index) => {
      point[0] += basis[index][0] * coordinate * 2.2;
      point[1] += basis[index][1] * coordinate * 2.2;
      point[2] += basis[index][2] * coordinate * 2.2;
    });
    positions.set(vertex.id, point);
  }
  return positions;
}

/**
 * Spread disk interiors into shallow relation-family lanes while keeping every
 * exact boundary on the shared quotient graph. The lanes expose the four
 * cells belonging to each pair without turning them into detached polygons.
 * Their centers and fold rings subdivide only the drawing, not bar X.
 */
interface ExpandedCellDrawingSurface {
  center: Vec3;
  ring: Vec3[];
}

function expandedCellDrawingSurfaces(
  cells: ReadonlyArray<BarXCompressedComplex["relationCells"][number]>,
  positions: ReadonlyMap<string, Vec3>,
): Map<string, ExpandedCellDrawingSurface> {
  const result = new Map<string, ExpandedCellDrawingSurface>();
  const families = new Map<string, typeof cells>();
  for (const cell of cells) {
    const key = `${cell.generatorPair[0]}:${cell.generatorPair[1]}`;
    const family = families.get(key) ?? [];
    families.set(key, [...family, cell]);
  }
  const orderedFamilies = [...families.entries()].sort(([left], [right]) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  const columnCount = Math.max(
    1,
    Math.ceil(Math.sqrt((orderedFamilies.length * 4) / 3)),
  );
  const rowCount = Math.max(1, Math.ceil(orderedFamilies.length / columnCount));
  const viewNormal: Vec3 = normalize([0, -Math.sqrt(3) / 2, 0.5]);
  const viewU: Vec3 = [1, 0, 0];
  const viewV: Vec3 = normalize(cross(viewNormal, viewU));
  const cellGrid = [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ] as const;

  orderedFamilies.forEach(([, family], familyIndex) => {
    const column = familyIndex % columnCount;
    const row = Math.floor(familyIndex / columnCount);
    const familyX = (column - (columnCount - 1) / 2) * 6.6;
    const familyY = ((rowCount - 1) / 2 - row) * 6.2;
    const normalizedX =
      columnCount > 1 ? (2 * column) / (columnCount - 1) - 1 : 0;
    const normalizedY = rowCount > 1 ? 1 - (2 * row) / (rowCount - 1) : 0;
    const familyNormal = normalize([
      viewNormal[0] +
        viewU[0] * normalizedX * 0.12 +
        viewV[0] * normalizedY * 0.1,
      viewNormal[1] +
        viewU[1] * normalizedX * 0.12 +
        viewV[1] * normalizedY * 0.1,
      viewNormal[2] +
        viewU[2] * normalizedX * 0.12 +
        viewV[2] * normalizedY * 0.1,
    ]);
    const basisU = orthogonal(familyNormal);
    const basisV = normalize(cross(familyNormal, basisU));

    [...family]
      .sort((left, right) => left.id.localeCompare(right.id))
      .forEach((cell, cellIndex) => {
        const boundary = cell.boundaryOccurrences
          .map((occurrence) => positions.get(occurrence.sourceVertexId))
          .filter((point): point is Vec3 => point !== undefined);
        if (boundary.length !== cell.boundaryOccurrences.length) return;
        const gridPoint =
          family.length === 4
            ? cellGrid[cellIndex]
            : ([
                Math.cos((2 * Math.PI * cellIndex) / family.length),
                Math.sin((2 * Math.PI * cellIndex) / family.length),
              ] as const);
        const localX = gridPoint[0] * 1.48;
        const localY = gridPoint[1] * 1.42;
        // The shallow bow keeps the overview genuinely three-dimensional while
        // leaving all twelve four-cell families readable from the reset camera.
        const laneDepth =
          5.8 +
          0.055 * (familyX * familyX + familyY * familyY) +
          cellIndex * 0.08;
        const center: Vec3 = [
          viewU[0] * (familyX + localX) +
            viewV[0] * (familyY + localY) +
            viewNormal[0] * laneDepth,
          viewU[1] * (familyX + localX) +
            viewV[1] * (familyY + localY) +
            viewNormal[1] * laneDepth,
          viewU[2] * (familyX + localX) +
            viewV[2] * (familyY + localY) +
            viewNormal[2] * laneDepth,
        ];
        const ringRadius = Math.max(
          1.05,
          Math.min(1.32, cell.boundaryOccurrences.length * 0.19),
        );
        const ring = cell.boundaryOccurrences.map(
          (_occurrence, boundaryIndex) => {
            const angle =
              -Math.PI / 2 +
              (2 * Math.PI * boundaryIndex) / cell.boundaryOccurrences.length;
            return [
              center[0] +
                basisU[0] * Math.cos(angle) * ringRadius +
                basisV[0] * Math.sin(angle) * ringRadius,
              center[1] +
                basisU[1] * Math.cos(angle) * ringRadius +
                basisV[1] * Math.sin(angle) * ringRadius,
              center[2] +
                basisU[2] * Math.cos(angle) * ringRadius +
                basisV[2] * Math.sin(angle) * ringRadius,
            ] as Vec3;
          },
        );
        result.set(cell.id, { center, ring });
      });
  });
  return result;
}

function fibonacciDirections(count: number): Vec3[] {
  return Array.from({ length: count }, (_unused, index) => {
    const y = 1 - (2 * (index + 0.5)) / Math.max(1, count);
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * GOLDEN_ANGLE;
    return [Math.cos(angle) * radial, y, Math.sin(angle) * radial] as Vec3;
  });
}

function orthogonal(normal: Vec3): Vec3 {
  const axis: Vec3 = Math.abs(normal[2]) < 0.8 ? [0, 0, 1] : [0, 1, 0];
  return normalize(cross(normal, axis));
}

function permutationsOfFour(): number[][] {
  const visit = (prefix: number[], remaining: number[]): number[][] =>
    remaining.length === 0
      ? [prefix]
      : remaining.flatMap((value, index) =>
          visit(
            [...prefix, value],
            remaining.filter((_entry, entryIndex) => entryIndex !== index),
          ),
        );
  return visit([], [0, 1, 2, 3]);
}

function sceneGenerators(
  system: HatXCoverComplex["sourceSystem"],
): SceneGenerator[] {
  return system.generators.map((generator) => ({
    label: generator.label,
    colorHint: generator.colorHint,
  }));
}

interface LayoutEdge {
  source: string;
  target: string;
}

/**
 * Deterministic graph layout shared by hat X and bar X.
 *
 * Small covers get a bounded force relaxation so relation polygons can be
 * traced. Large covers use the linear-time seed layout directly; rendering a
 * large imported cover must not begin with a quadratic main-thread pause.
 */
export function layoutComplexGraph(
  vertexIds: readonly string[],
  edges: readonly LayoutEdge[],
): Map<string, Vec3> {
  const positions = seedPositions(vertexIds);
  if (vertexIds.length <= 2 || vertexIds.length > FORCE_LAYOUT_LIMIT) {
    return positions;
  }

  const indices = new Map(vertexIds.map((id, index) => [id, index]));
  const values = vertexIds.map(
    (id) => [...(positions.get(id) ?? [0, 0, 0])] as Vec3,
  );
  const forces = vertexIds.map(() => [0, 0, 0] as Vec3);
  const indexedEdges = edges
    .map((edge) => ({
      source: indices.get(edge.source),
      target: indices.get(edge.target),
    }))
    .filter(
      (edge): edge is { source: number; target: number } =>
        edge.source !== undefined &&
        edge.target !== undefined &&
        edge.source !== edge.target,
    );

  for (let iteration = 0; iteration < FORCE_ITERATIONS; iteration += 1) {
    for (const force of forces) {
      force[0] = 0;
      force[1] = 0;
      force[2] = 0;
    }

    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        const dx = values[left][0] - values[right][0];
        const dy = values[left][1] - values[right][1];
        const dz = values[left][2] - values[right][2];
        const distanceSquared = Math.max(0.08, dx * dx + dy * dy + dz * dz);
        const scale = 0.036 / distanceSquared;
        forces[left][0] += dx * scale;
        forces[left][1] += dy * scale;
        forces[left][2] += dz * scale;
        forces[right][0] -= dx * scale;
        forces[right][1] -= dy * scale;
        forces[right][2] -= dz * scale;
      }
    }

    for (const edge of indexedEdges) {
      const source = values[edge.source];
      const target = values[edge.target];
      const dx = target[0] - source[0];
      const dy = target[1] - source[1];
      const dz = target[2] - source[2];
      const distance = Math.max(0.001, Math.hypot(dx, dy, dz));
      const scale = (distance - 2.15) * 0.045;
      const fx = (dx / distance) * scale;
      const fy = (dy / distance) * scale;
      const fz = (dz / distance) * scale;
      forces[edge.source][0] += fx;
      forces[edge.source][1] += fy;
      forces[edge.source][2] += fz;
      forces[edge.target][0] -= fx;
      forces[edge.target][1] -= fy;
      forces[edge.target][2] -= fz;
    }

    const cooling = 0.34 * (1 - iteration / (FORCE_ITERATIONS + 12));
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      value[0] =
        (value[0] + clamp(forces[index][0], -0.8, 0.8) * cooling) * 0.998;
      value[1] =
        (value[1] + clamp(forces[index][1], -0.8, 0.8) * cooling) * 0.998;
      value[2] =
        (value[2] + clamp(forces[index][2], -0.8, 0.8) * cooling) * 0.998;
    }
  }

  const scale = layoutScale(values);
  return new Map(
    vertexIds.map((id, index) => [
      id,
      [
        values[index][0] * scale,
        values[index][1] * scale,
        values[index][2] * scale,
      ] as Vec3,
    ]),
  );
}

function seedPositions(vertexIds: readonly string[]): Map<string, Vec3> {
  if (vertexIds.length === 0) {
    return new Map();
  }
  if (vertexIds.length === 1) {
    return new Map([[vertexIds[0], [0, 0, 0]]]);
  }
  if (vertexIds.length === 2) {
    return new Map([
      [vertexIds[0], [-1.5, 0, 0]],
      [vertexIds[1], [1.5, 0, 0]],
    ]);
  }
  return new Map(
    vertexIds.map((id, index) => {
      const y = 1 - (2 * (index + 0.5)) / vertexIds.length;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = index * GOLDEN_ANGLE;
      return [
        id,
        [
          4.2 * Math.cos(theta) * radius,
          4.2 * y,
          4.2 * Math.sin(theta) * radius,
        ] as Vec3,
      ];
    }),
  );
}

function layoutScale(values: readonly Vec3[]): number {
  let maxRadius = 0;
  for (const value of values) {
    maxRadius = Math.max(maxRadius, Math.hypot(value[0], value[1], value[2]));
  }
  return maxRadius > 0 ? Math.min(2.2, 6.5 / maxRadius) : 1;
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length < 1e-9) return [1, 0, 0];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

interface ParallelSceneEdge {
  id: string;
  source: string;
  target: string;
  generator: number;
}

function parallelEdgeOffsets(
  edges: readonly ParallelSceneEdge[],
): Map<string, number> {
  const groups = new Map<string, ParallelSceneEdge[]>();
  for (const edge of edges) {
    const endpoints = [edge.source, edge.target].sort();
    const key = `${endpoints[0]}|${endpoints[1]}|${edge.generator}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const offsets = new Map<string, number>();
  for (const group of groups.values()) {
    group.sort((left, right) => left.id.localeCompare(right.id));
    const center = (group.length - 1) / 2;
    group.forEach((edge, index) => {
      offsets.set(edge.id, (index - center) * 0.18);
    });
  }
  return offsets;
}

/**
 * Give one selected relation cycle a readable tilted polygon without changing
 * its attaching map. Shared vertices stay shared; only scene coordinates move.
 */
function emphasizeRelationBoundaryLayout(
  positions: Map<string, Vec3>,
  boundaryNodeIds: readonly string[] | undefined,
): void {
  if (!boundaryNodeIds || boundaryNodeIds.length < 3) return;
  const unique = [...new Set(boundaryNodeIds)];
  if (unique.length !== boundaryNodeIds.length) return;
  const radius = Math.max(3.4, Math.min(7.2, boundaryNodeIds.length * 0.68));
  const u: Vec3 = [0.94, 0.2, 0.28];
  const v: Vec3 = [-0.08, 0.84, 0.54];
  boundaryNodeIds.forEach((nodeId, index) => {
    if (!positions.has(nodeId)) return;
    const angle = (2 * Math.PI * index) / boundaryNodeIds.length;
    const cosine = Math.cos(angle) * radius;
    const sine = Math.sin(angle) * radius;
    positions.set(nodeId, [
      u[0] * cosine + v[0] * sine,
      u[1] * cosine + v[1] * sine,
      u[2] * cosine + v[2] * sine,
    ]);
  });
}
