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
import { jacobiEigenDecomposition } from "../geometry/symmetricEigen";
import { relationCellMatchesFamily } from "./barXRelationFamilies";

type Vec3 = [number, number, number];

/**
 * Line styles a scene may request per edge. Hue alone cannot separate 42
 * walls or five Coxeter orders, so these views pair colour with a dash cue.
 */
export type SceneLineStyle =
  | "solid"
  | "dashed"
  | "dotted"
  | "dash-dot"
  | "long-dash";

/**
 * Per-edge drawing requests beyond the base `SceneEdge` contract. They are
 * drawing conventions only; none of them changes the edge's incidence.
 */
export interface SceneEdgeStyleRequest {
  /**
   * Why an edge is emphasised. "relation-boundary" marks an edge on a shown
   * relation cell's attaching cycle; "wall-dual" marks an edge crossed by the
   * selected wall. The renderer should style them differently.
   */
  emphasisRole?: "relation-boundary" | "wall-dual";
  lineStyle?: SceneLineStyle;
  /**
   * Quadratic Bezier control point. When present the edge is drawn as a
   * curve from source through this control point's pull to target.
   */
  drawingControlPoint?: Vec3;
}

export type StyledSceneEdge = SceneEdge & SceneEdgeStyleRequest;

export interface ComplexSceneInventory {
  vertices: number;
  edges: number;
  twoCells: number;
  generatorBigons?: number;
  relationCellLifts?: number;
}

export interface CompressedComplexScene {
  nodes: SceneNode[];
  edges: StyledSceneEdge[];
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
  /** Edges crossed by the selected wall; styled apart from relation boundaries. */
  wallDualEdgeIds?: ReadonlySet<string>;
  ghostCellIds?: ReadonlySet<string>;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FORCE_LAYOUT_LIMIT = 320;
const FORCE_ITERATIONS = 72;
/** Side length of the regular polygons in the relation-family grid. */
const FAMILY_SIDE_LENGTH = 2.4;
const FAMILY_SLOT_GAP = 1.8;
/** Rest length of an edge in the all-families polygon relaxation. */
// Larger than the family grid's side: labels have a fixed world size, so a
// small all-families drawing would be buried under its own labels.
const POLYGON_SIDE_LENGTH = 4.4;
const POLYGON_ITERATIONS = 260;
/** Pull of each vertex toward the best-fit plane of every cycle through it. */
const POLYGON_PLANARITY = 0.5;
/** O(n^2) per iteration; above this the seed layout is kept. */
const POLYGON_LAYOUT_LIMIT = 700;
/** Limits for the reflection-orbit search: 2^free sign patterns are tried. */
const REFLECTION_LAYOUT_MAX_RANK = 8;
const REFLECTION_LAYOUT_MAX_ORDER = 12;
const REFLECTION_LAYOUT_MAX_FREE_SIGNS = 14;
const CHAMBER_POINT_CANDIDATES = 400;
/** Chord bend height as a fraction of chord length. */
const CHORD_LIFT = 0.35;

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
 *
 * Every relation fill is drawn inside its own attaching cycle: the renderer
 * receives only `boundaryNodeIds`, never a detached copy of the polygon. The
 * spread views separate cells by moving the shared vertices, not the cells.
 */
export function buildBarXScene(
  barX: BarXCompressedComplex,
  options: BarXSceneOptions = {},
): CompressedComplexScene {
  const visibleRelationCells = barX.relationCells
    .filter((cell) => relationCellMatchesFamily(cell, options.relationFamily))
    .sort((left, right) => left.id.localeCompare(right.id));
  const layoutEdges = barX.geometricEdges.map((edge) => ({
    source: edge.sourceVertexId,
    target: edge.targetVertexId,
  }));
  const basePositions = layoutComplexGraph(
    barX.vertices.map((vertex) => vertex.id),
    layoutEdges,
  );
  const familyLayout =
    options.spreadRelationCells && options.relationFamily
      ? layoutFocusedRelationFamily(basePositions, visibleRelationCells)
      : undefined;
  const polygonLayout =
    options.spreadRelationCells && !options.relationFamily
      ? layoutAllRelationCells(
          barX,
          barX.vertices.map((vertex) => vertex.id),
          layoutEdges,
          visibleRelationCells,
          basePositions,
        )
      : undefined;
  const positions =
    familyLayout?.positions ?? polygonLayout?.positions ?? basePositions;
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
  const showCells = options.showRelationCells ?? true;
  const chordControlPoints =
    options.spreadRelationCells && showCells
      ? liftedChordControlPoints(barX, visibleRelationCells, positions)
      : new Map<string, Vec3>();
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
  const edges: StyledSceneEdge[] = barX.geometricEdges.map((edge, index) => {
    const direction = options.edgeDirections?.get(edge.id) ?? 0;
    const reversed = direction === -1;
    const ghostedByRelationFocus =
      options.spreadRelationCells === true &&
      options.relationFamily !== undefined &&
      !focusedBoundaryEdgeIds.has(edge.id);
    const relationBoundaryEmphasis =
      options.spreadRelationCells === true &&
      options.relationFamily !== undefined &&
      focusedBoundaryEdgeIds.has(edge.id);
    const wallDual = options.wallDualEdgeIds?.has(edge.id) === true;
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
      // Relation boundaries and the selected wall's dual edges are different
      // statements, so they carry different emphasis roles. Only relation
      // boundaries use the black "readable-boundary" stroke.
      emphasis:
        options.emphasizedEdgeIds?.has(edge.id) || relationBoundaryEmphasis
          ? "readable-boundary"
          : undefined,
      emphasisRole: wallDual
        ? "wall-dual"
        : relationBoundaryEmphasis
          ? "relation-boundary"
          : undefined,
      drawingControlPoint: chordControlPoints.get(edge.id),
      // In a spread-cell drawing the sheets are secondary. Re-draw the exact
      // quotient rails above them so the common attaching skeleton never
      // disappears behind translucent fills.
      readabilityOverlay: options.spreadRelationCells === true,
    };
  });
  const cells: SceneCell[] = showCells
    ? visibleRelationCells.map((cell) => ({
        id: cell.id,
        generatorPair: cell.generatorPair,
        boundaryNodeIds: cell.boundaryOccurrences.map(
          (occurrence) => occurrence.sourceVertexId,
        ),
        sourceCellId: cell.id,
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
      ...(familyLayout
        ? [
            `${visibleRelationCells.length} exact relation cells are laid out side by side using their original quotient vertices and edges. The remaining generator edges stay as faint gluing context.`,
            "No boundary vertex or generator edge is duplicated in this relation-family view.",
            ...(familyLayout.sharedCellCount > 0
              ? [
                  `${familyLayout.sharedCellCount} cell${familyLayout.sharedCellCount === 1 ? " shares" : "s share"} boundary vertices with an earlier cell of this family; ${familyLayout.sharedCellCount === 1 ? "it is" : "they are"} drawn through those shared vertices and may look distorted.`,
                ]
              : []),
          ]
        : polygonLayout
          ? [
              `All ${visibleRelationCells.length} exact relation disks remain attached to one shared quotient 1-skeleton; each fill is bounded by its own attaching cycle.`,
              polygonLayout.method === "reflection-orbit"
                ? `The finite action is realized by reflections of R^3, so vertices are placed as one chamber orbit (as in the Davis view) and every attaching cycle is flat. ${polygonLayout.convexCycles ?? 0} of ${visibleRelationCells.length} cycles are convex; the others belong to generator pairs whose mirrors do not bound the chosen chamber and wind twice, as star polygons. The orbit is a drawing choice; bar X itself has no metric.`
                : polygonLayout.method === "relaxation"
                  ? "Vertex positions come from a drawing-only relaxation that pulls every attaching cycle toward a flat polygon. Cells sharing vertices can still overlap."
                  : "This cover is too large for the polygon relaxation; vertices keep the seed layout.",
            ]
          : []),
      ...(chordControlPoints.size > 0
        ? [
            `${chordControlPoints.size} generator edge${chordControlPoints.size === 1 ? " joins" : "s join"} two non-consecutive vertices of a drawn cell. Such chords are bent off the cell plane: they are edges of bar X, not part of the disk.`,
          ]
        : []),
    ],
  };
}

interface RelationFamilyLayout {
  positions: Map<string, Vec3>;
  /** Cells whose boundary reused a vertex already placed by an earlier cell. */
  sharedCellCount: number;
}

/**
 * Lays out one finite-pair family as a grid of regular polygons.
 *
 * In a torsion-free cover the dihedral group <s_i, s_j> acts freely on the
 * vertices, so the family's 2m-gons partition the vertex set and each cell
 * can own a grid slot. The grid sits on a shallow dome facing the reset
 * camera, so the drawing stays three-dimensional without hiding any slot.
 * If an imported cover repeats a vertex, the later cell keeps that vertex at
 * its first position; the fill still follows the true boundary.
 */
function layoutFocusedRelationFamily(
  fallback: Map<string, Vec3>,
  cells: ReadonlyArray<BarXCompressedComplex["relationCells"][number]>,
): RelationFamilyLayout {
  const positions = new Map(fallback);
  const claimed = new Set<string>();
  const { normal: viewNormal, u: viewU, v: viewV } = resetViewFrame();
  const maxBoundary = Math.max(
    3,
    ...cells.map((cell) => cell.boundaryOccurrences.length),
  );
  const radiusFor = (sides: number) =>
    FAMILY_SIDE_LENGTH / (2 * Math.sin(Math.PI / Math.max(3, sides)));
  const pitch = 2 * radiusFor(maxBoundary) + FAMILY_SLOT_GAP;
  const columns = Math.max(1, Math.ceil(Math.sqrt(cells.length)));
  const rows = Math.max(1, Math.ceil(cells.length / columns));
  // Curvature chosen so the outermost slot sits about one polygon radius
  // behind the centre; deeper domes turn the corner cells edge-on.
  const halfSpan = Math.max(1, (Math.max(columns, rows) - 1) / 2) * pitch;
  const curvature = radiusFor(maxBoundary) / (halfSpan * halfSpan);
  let sharedCellCount = 0;

  cells.forEach((cell, cellIndex) => {
    const boundary = cell.boundaryOccurrences.map(
      (occurrence) => occurrence.sourceVertexId,
    );
    const column = cellIndex % columns;
    const row = Math.floor(cellIndex / columns);
    const x = (column - (columns - 1) / 2) * pitch;
    const y = ((rows - 1) / 2 - row) * pitch;
    const depth = -curvature * (x * x + y * y) + (cellIndex % 2) * 0.35;
    const center = combine([viewU, x], [viewV, y], [viewNormal, depth]);
    // Tilt each polygon a third of the way toward the dome normal: enough to
    // read as 3D when orbiting, little enough to stay face-on at reset.
    const normal = normalize(
      combine(
        [viewNormal, 1],
        [viewU, (2 / 3) * curvature * x],
        [viewV, (2 / 3) * curvature * y],
      ),
    );
    const basisU = normalize(cross(viewV, normal));
    const basisV = normalize(cross(normal, basisU));
    const radius = radiusFor(boundary.length);
    const reused = boundary.some(
      (nodeId, index) =>
        claimed.has(nodeId) || boundary.indexOf(nodeId) !== index,
    );
    if (reused) sharedCellCount += 1;
    boundary.forEach((nodeId, boundaryIndex) => {
      if (claimed.has(nodeId)) return;
      claimed.add(nodeId);
      const angle =
        Math.PI / 2 - (2 * Math.PI * boundaryIndex) / boundary.length;
      positions.set(
        nodeId,
        combine(
          [center, 1],
          [basisU, Math.cos(angle) * radius],
          [basisV, Math.sin(angle) * radius],
        ),
      );
    });
  });

  // Vertices outside every family cell occur only for non-free actions. Keep
  // them as a small cloud behind the grid so they cannot sit inside a fill.
  for (const [nodeId, point] of fallback) {
    if (claimed.has(nodeId)) continue;
    positions.set(
      nodeId,
      combine(
        [point, 0.5],
        [viewNormal, -(radiusFor(maxBoundary) + halfSpan * 0.25 + 3)],
      ),
    );
  }
  return { positions, sharedCellCount };
}

interface RelationPolygonLayout {
  positions: Map<string, Vec3>;
  method: "reflection-orbit" | "relaxation" | "seed";
  /** Reflection orbit only: attaching cycles drawn as simple convex polygons. */
  convexCycles?: number;
}

/**
 * Drawing-only relaxation for the all-families view.
 *
 * Every vertex lies on one cell of each finite family, so the cells cannot be
 * pulled apart without detaching them. Instead the shared vertices are moved:
 * each attaching cycle of length k gets springs between all its vertex pairs
 * with the chord lengths of a regular k-gon, every edge gets the side length
 * as its rest length, and all vertex pairs repel. Where these targets are
 * compatible the cycles become flat convex polygons; where they are not, the
 * result is a compromise. This is a drawing convention, not a geometric
 * realization of bar X.
 */
function layoutAllRelationCells(
  barX: BarXCompressedComplex,
  vertexIds: readonly string[],
  edges: readonly LayoutEdge[],
  cells: ReadonlyArray<BarXCompressedComplex["relationCells"][number]>,
  seed: ReadonlyMap<string, Vec3>,
): RelationPolygonLayout {
  const orbit = reflectionOrbitLayout(barX);
  return orbit
    ? {
        positions: orbit.positions,
        method: "reflection-orbit",
        convexCycles: orbit.convexCycles,
      }
    : layoutRelationPolygons(vertexIds, edges, cells, seed);
}

function layoutRelationPolygons(
  vertexIds: readonly string[],
  edges: readonly LayoutEdge[],
  cells: ReadonlyArray<BarXCompressedComplex["relationCells"][number]>,
  seed: ReadonlyMap<string, Vec3>,
): RelationPolygonLayout {
  if (vertexIds.length > POLYGON_LAYOUT_LIMIT) {
    return {
      positions: new Map(
        [...seed].map(([id, point]) => [id, scale(point, 1.45)] as const),
      ),
      method: "seed",
    };
  }
  const indices = new Map(vertexIds.map((id, index) => [id, index]));
  const values = vertexIds.map(
    (id) => [...(seed.get(id) ?? [0, 0, 0])] as Vec3,
  );
  const springs: Array<{ a: number; b: number; rest: number; weight: number }> =
    [];
  const springKeys = new Map<string, number>();
  const addSpring = (a: number, b: number, rest: number, weight: number) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const existing = springKeys.get(key);
    if (existing !== undefined) {
      // A pair constrained by several cycles averages their targets.
      const spring = springs[existing];
      spring.rest =
        (spring.rest * spring.weight + rest * weight) /
        (spring.weight + weight);
      spring.weight += weight;
      return;
    }
    springKeys.set(key, springs.length);
    springs.push({ a, b, rest, weight });
  };
  for (const edge of edges) {
    const a = indices.get(edge.source);
    const b = indices.get(edge.target);
    if (a !== undefined && b !== undefined) {
      addSpring(a, b, POLYGON_SIDE_LENGTH, 1);
    }
  }
  const planarCycles: number[][] = [];
  for (const cell of cells) {
    const cycle = cell.boundaryOccurrences
      .map((occurrence) => indices.get(occurrence.sourceVertexId))
      .filter((index): index is number => index !== undefined);
    const k = cycle.length;
    if (k < 3 || new Set(cycle).size !== k) continue;
    // Opposite corners get the diameter of the regular k-gon; this keeps a
    // cycle from folding shut. Other chords are left free, because cycles
    // sharing vertices rarely admit regular shapes simultaneously.
    for (let i = 0; i < k; i += 1) {
      addSpring(cycle[i], cycle[(i + 1) % k], POLYGON_SIDE_LENGTH, 1);
      if (k % 2 === 0 && i < k / 2) {
        addSpring(
          cycle[i],
          cycle[i + k / 2],
          POLYGON_SIDE_LENGTH / Math.sin(Math.PI / k),
          0.3,
        );
      }
    }
    planarCycles.push(cycle);
  }

  const forces = values.map(() => [0, 0, 0] as Vec3);
  const repulsion = POLYGON_SIDE_LENGTH * POLYGON_SIDE_LENGTH * 0.5;
  for (let iteration = 0; iteration < POLYGON_ITERATIONS; iteration += 1) {
    for (const force of forces) force.fill(0);
    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        const dx = values[left][0] - values[right][0];
        const dy = values[left][1] - values[right][1];
        const dz = values[left][2] - values[right][2];
        const distanceSquared = Math.max(0.05, dx * dx + dy * dy + dz * dz);
        const factor =
          repulsion / (distanceSquared * Math.sqrt(distanceSquared));
        forces[left][0] += dx * factor;
        forces[left][1] += dy * factor;
        forces[left][2] += dz * factor;
        forces[right][0] -= dx * factor;
        forces[right][1] -= dy * factor;
        forces[right][2] -= dz * factor;
      }
    }
    for (const spring of springs) {
      const source = values[spring.a];
      const target = values[spring.b];
      const dx = target[0] - source[0];
      const dy = target[1] - source[1];
      const dz = target[2] - source[2];
      const distance = Math.max(0.001, Math.hypot(dx, dy, dz));
      const factor =
        (spring.weight * (distance - spring.rest)) / (distance * spring.rest);
      forces[spring.a][0] += dx * factor;
      forces[spring.a][1] += dy * factor;
      forces[spring.a][2] += dz * factor;
      forces[spring.b][0] -= dx * factor;
      forces[spring.b][1] -= dy * factor;
      forces[spring.b][2] -= dz * factor;
    }
    for (const cycle of planarCycles) {
      const points = cycle.map((index) => values[index]);
      const centre = averagePoint(points);
      const normal = newellNormal(points);
      for (const index of cycle) {
        const offset =
          POLYGON_PLANARITY * dot(subtract(values[index], centre), normal);
        forces[index][0] -= offset * normal[0];
        forces[index][1] -= offset * normal[1];
        forces[index][2] -= offset * normal[2];
      }
    }
    const step = 0.5 * (1 - iteration / (POLYGON_ITERATIONS + 20));
    for (let index = 0; index < values.length; index += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        values[index][axis] += clamp(forces[index][axis], -1, 1) * step;
      }
    }
  }

  const centroid = values.reduce<Vec3>(
    (sum, value) => [
      sum[0] + value[0] / values.length,
      sum[1] + value[1] / values.length,
      sum[2] + value[2] / values.length,
    ],
    [0, 0, 0],
  );
  return {
    positions: new Map(
      vertexIds.map((id, index) => [
        id,
        [
          values[index][0] - centroid[0],
          values[index][1] - centroid[1],
          values[index][2] - centroid[2],
        ] as Vec3,
      ]),
    ),
    method: "relaxation",
  };
}

/**
 * Places bar X as a chamber orbit when the finite action is a reflection
 * group of rank at most three.
 *
 * Let m'_ij be the order of s_i s_j in the finite action (it can be smaller
 * than the Coxeter m_ij, e.g. 2 for an infinite pair). We look for unit roots
 * alpha_i in R^3 with <alpha_i, alpha_j> = +-cos(pi/m'_ij); a Gram matrix of
 * this form that is positive semidefinite of rank <= 3 gives such roots.
 * With R_i the reflection in alpha_i^perp, a vertex reached from the base
 * vertex by the word s_a s_b ... is placed at R_a R_b ... p, the same
 * right-multiplication orbit convention as the Davis view. Each 2m-gon is
 * then the orbit of one chamber point around a codimension-two face: a flat
 * convex polygon. The result is used only after checking that every edge of
 * bar X is consistent with it and that no two vertices coincide; otherwise
 * the caller falls back to the relaxation.
 *
 * Example: the ideal-cube S4 cover, whose six generators act as the six
 * transpositions, i.e. as the reflections of the A3 root system.
 */
function reflectionOrbitLayout(
  barX: BarXCompressedComplex,
): { positions: Map<string, Vec3>; convexCycles: number } | undefined {
  const rank = barX.sourceSystem.generators.length;
  const vertexCount = barX.vertices.length;
  if (rank < 2 || rank > REFLECTION_LAYOUT_MAX_RANK || vertexCount < 2) {
    return undefined;
  }
  const vertexIndex = new Map(
    barX.vertices.map((vertex, index) => [vertex.id, index]),
  );
  // neighbour[i][x] is the vertex reached from x along generator i.
  const neighbour = Array.from({ length: rank }, () =>
    new Array<number>(vertexCount).fill(-1),
  );
  for (const edge of barX.geometricEdges) {
    const source = vertexIndex.get(edge.sourceVertexId);
    const target = vertexIndex.get(edge.targetVertexId);
    if (source === undefined || target === undefined) return undefined;
    neighbour[edge.generator][source] = target;
    neighbour[edge.generator][target] = source;
  }
  if (neighbour.some((row) => row.some((target) => target < 0))) {
    return undefined;
  }

  const imageOrder = (left: number, right: number): number => {
    let order = 1;
    for (let start = 0; start < vertexCount; start += 1) {
      let current = start;
      let steps = 0;
      do {
        current = neighbour[right][neighbour[left][current]];
        steps += 1;
      } while (current !== start && steps <= REFLECTION_LAYOUT_MAX_ORDER);
      if (current !== start) return Number.POSITIVE_INFINITY;
      order = (order * steps) / gcd(order, steps);
      if (order > REFLECTION_LAYOUT_MAX_ORDER) return Number.POSITIVE_INFINITY;
    }
    return order;
  };
  const signedPairs: Array<[number, number, number]> = [];
  const gram: number[][] = Array.from({ length: rank }, (_unused, row) =>
    Array.from({ length: rank }, (_unused2, column) =>
      row === column ? 1 : 0,
    ),
  );
  for (let left = 0; left < rank; left += 1) {
    for (let right = left + 1; right < rank; right += 1) {
      const order = imageOrder(left, right);
      if (!Number.isFinite(order) || order === 1) return undefined;
      if (order >= 3) {
        signedPairs.push([left, right, Math.cos(Math.PI / order)]);
      }
    }
  }
  // Flipping the sign of alpha_i flips every product with alpha_i, so the
  // signs on a spanning forest of the pair graph can be fixed to "-".
  const forestParent = Array.from({ length: rank }, (_unused, index) => index);
  const findRoot = (index: number): number =>
    forestParent[index] === index
      ? index
      : (forestParent[index] = findRoot(forestParent[index]));
  const freePairs: number[] = [];
  signedPairs.forEach(([left, right, cosine], pairIndex) => {
    gram[left][right] = -cosine;
    gram[right][left] = -cosine;
    const leftRoot = findRoot(left);
    const rightRoot = findRoot(right);
    if (leftRoot !== rightRoot) {
      forestParent[leftRoot] = rightRoot;
    } else {
      freePairs.push(pairIndex);
    }
  });
  if (freePairs.length > REFLECTION_LAYOUT_MAX_FREE_SIGNS) return undefined;

  for (let mask = 0; mask < 2 ** freePairs.length; mask += 1) {
    freePairs.forEach((pairIndex, bit) => {
      const [left, right, cosine] = signedPairs[pairIndex];
      const value = (mask >> bit) & 1 ? cosine : -cosine;
      gram[left][right] = value;
      gram[right][left] = value;
    });
    const roots = rootsFromGram(gram);
    if (!roots) continue;
    const orbit = bestChamberOrbit(barX, roots, neighbour, vertexIndex);
    if (!orbit) continue;
    const positions = orbit.positions;
    const edgeLengths = barX.geometricEdges.map((edge) =>
      Math.hypot(
        ...subtract(
          positions[vertexIndex.get(edge.sourceVertexId)!],
          positions[vertexIndex.get(edge.targetVertexId)!],
        ),
      ),
    );
    const meanLength =
      edgeLengths.reduce((sum, value) => sum + value, 0) / edgeLengths.length;
    const factor = POLYGON_SIDE_LENGTH / Math.max(meanLength, 1e-9);
    return {
      positions: new Map(
        barX.vertices.map((vertex, index) => [
          vertex.id,
          scale(positions[index], factor),
        ]),
      ),
      convexCycles: orbit.score,
    };
  }
  return undefined;
}

/**
 * Chooses the chamber point. With more than three generators in R^3 not all
 * generator pairs can be walls of one chamber, and a pair (a, b) whose
 * mirrors do not bound the chamber of p yields a star-shaped orbit polygon
 * (the cycle winds twice). The point is therefore picked from a fixed
 * Fibonacci set of directions to maximize the number of simple convex
 * attaching cycles; ties keep the earliest direction, so the drawing is
 * deterministic.
 */
function bestChamberOrbit(
  barX: BarXCompressedComplex,
  roots: readonly Vec3[],
  neighbour: readonly number[][],
  vertexIndex: ReadonlyMap<string, number>,
): { positions: Vec3[]; score: number } | undefined {
  const cycles = barX.relationCells.map((cell) =>
    cell.boundaryOccurrences.map(
      (occurrence) => vertexIndex.get(occurrence.sourceVertexId)!,
    ),
  );
  let best: { positions: Vec3[]; score: number } | undefined;
  for (const direction of fibonacciSphere(CHAMBER_POINT_CANDIDATES)) {
    const positions = chamberOrbit(
      roots,
      neighbour,
      barX.vertices.length,
      direction,
    );
    if (!positions) continue;
    const score = cycles.filter((cycle) =>
      isSimpleConvexCycle(cycle.map((index) => positions[index])),
    ).length;
    if (!best || score > best.score) best = { positions, score };
    if (score === cycles.length) break;
  }
  return best;
}

/** True when a closed cycle turns the same way at every corner, once around. */
function isSimpleConvexCycle(points: readonly Vec3[]): boolean {
  if (points.length < 3) return false;
  const normal = newellNormal(points);
  let turning = 0;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const incoming = subtract(current, previous);
    const outgoing = subtract(next, current);
    const sine = dot(cross(incoming, outgoing), normal);
    if (sine <= 1e-9) return false;
    turning += Math.atan2(sine, dot(incoming, outgoing));
  }
  return Math.abs(turning - 2 * Math.PI) < 1e-3;
}

function fibonacciSphere(count: number): Vec3[] {
  return Array.from({ length: count }, (_unused, index) => {
    const z = 1 - (2 * (index + 0.5)) / count;
    const radial = Math.sqrt(Math.max(0, 1 - z * z));
    const angle = index * GOLDEN_ANGLE + 0.3;
    return [Math.cos(angle) * radial, Math.sin(angle) * radial, z] as Vec3;
  });
}

/** Unit roots in R^3 realizing a PSD Gram matrix of rank <= 3, if any. */
function rootsFromGram(gram: number[][]): Vec3[] | undefined {
  const pairs = jacobiEigenDecomposition(gram).sort(
    (left, right) => right.value - left.value,
  );
  if (pairs.some((pair) => pair.value < -1e-9)) return undefined;
  const kept = pairs.filter((pair) => pair.value > 1e-9);
  if (kept.length < 2 || kept.length > 3) return undefined;
  return gram.map((_row, index) => {
    const root: Vec3 = [0, 0, 0];
    kept.forEach((pair, axis) => {
      root[axis] = pair.vector[index] * Math.sqrt(pair.value);
    });
    return root;
  });
}

/**
 * Breadth-first placement M_x p with M_{x s_i} = M_x R_i. Returns undefined
 * if two paths disagree (the action does not factor through these
 * reflections) or if two vertices land on the same point.
 */
function chamberOrbit(
  roots: readonly Vec3[],
  neighbour: readonly number[][],
  vertexCount: number,
  point: Vec3,
): Vec3[] | undefined {
  const reflect = (vector: Vec3, root: Vec3): Vec3 =>
    combine([vector, 1], [root, -2 * dot(vector, root)]);
  // Store the frame M_x as the images of the three coordinate axes.
  const frames: Array<[Vec3, Vec3, Vec3] | undefined> = new Array(vertexCount);
  const positions: Vec3[] = new Array(vertexCount);
  const apply = (frame: [Vec3, Vec3, Vec3], vector: Vec3): Vec3 =>
    combine(
      [frame[0], vector[0]],
      [frame[1], vector[1]],
      [frame[2], vector[2]],
    );
  frames[0] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  positions[0] = point;
  const queue = [0];
  for (let head = 0; head < queue.length; head += 1) {
    const vertex = queue[head];
    const frame = frames[vertex]!;
    for (let generator = 0; generator < roots.length; generator += 1) {
      const next = neighbour[generator][vertex];
      const placed = apply(frame, reflect(point, roots[generator]));
      if (frames[next]) {
        const known = positions[next];
        if (Math.hypot(...subtract(known, placed)) > 1e-6) return undefined;
        continue;
      }
      // M_x R_i has columns M_x R_i e_k.
      frames[next] = [
        apply(frame, reflect([1, 0, 0], roots[generator])),
        apply(frame, reflect([0, 1, 0], roots[generator])),
        apply(frame, reflect([0, 0, 1], roots[generator])),
      ];
      positions[next] = placed;
      queue.push(next);
    }
  }
  if (queue.length !== vertexCount) return undefined;
  const keys = new Set(
    positions.map((position) =>
      position.map((value) => Math.round(value * 1e4) + 0).join(","),
    ),
  );
  return keys.size === vertexCount ? positions : undefined;
}

function gcd(left: number, right: number): number {
  return right === 0 ? left : gcd(right, left % right);
}

/**
 * Edges of bar X can join two non-consecutive vertices of a drawn cell; in
 * the ideal cube, t23 joins opposite corners of each <t12, t13> hexagon. A
 * straight segment would run across the fill and read as part of the disk.
 * These chords get a quadratic control point lifted off the cell's best-fit
 * plane, on the side away from the layout centre. The control point is a
 * drawing aid only.
 */
function liftedChordControlPoints(
  barX: BarXCompressedComplex,
  cells: ReadonlyArray<BarXCompressedComplex["relationCells"][number]>,
  positions: ReadonlyMap<string, Vec3>,
): Map<string, Vec3> {
  const cellsByVertex = new Map<string, number[]>();
  const sides = new Set<string>();
  const boundaries = cells.map((cell) =>
    cell.boundaryOccurrences.map((occurrence) => occurrence.sourceVertexId),
  );
  boundaries.forEach((boundary, cellIndex) => {
    boundary.forEach((nodeId, index) => {
      const list = cellsByVertex.get(nodeId) ?? [];
      if (!list.includes(cellIndex)) list.push(cellIndex);
      cellsByVertex.set(nodeId, list);
      sides.add(unorderedKey(nodeId, boundary[(index + 1) % boundary.length]));
    });
  });
  const layoutCentre = averagePoint([...positions.values()]);
  const result = new Map<string, Vec3>();
  for (const edge of barX.geometricEdges) {
    if (sides.has(unorderedKey(edge.sourceVertexId, edge.targetVertexId))) {
      continue;
    }
    const sourceCells = cellsByVertex.get(edge.sourceVertexId) ?? [];
    const targetCells = new Set(cellsByVertex.get(edge.targetVertexId) ?? []);
    const sharedCell = sourceCells.find((cellIndex) =>
      targetCells.has(cellIndex),
    );
    if (sharedCell === undefined) continue;
    const source = positions.get(edge.sourceVertexId);
    const target = positions.get(edge.targetVertexId);
    const points = boundaries[sharedCell]
      .map((nodeId) => positions.get(nodeId))
      .filter((point): point is Vec3 => point !== undefined);
    if (!source || !target || points.length < 3) continue;
    const centre = averagePoint(points);
    let normal = newellNormal(points);
    const outward = subtract(centre, layoutCentre);
    if (dot(normal, outward) < 0) normal = scale(normal, -1);
    const chordLength = Math.hypot(...subtract(target, source));
    result.set(
      edge.id,
      combine(
        [source, 0.5],
        [target, 0.5],
        [normal, Math.max(0.6, chordLength * CHORD_LIFT)],
      ),
    );
  }
  return result;
}

/**
 * The reset camera looks roughly along -viewNormal; spread layouts face it so
 * their polygons open toward the reader.
 */
function resetViewFrame(): { normal: Vec3; u: Vec3; v: Vec3 } {
  const normal = normalize([0, -Math.sqrt(3) / 2, 0.5]);
  const u: Vec3 = [1, 0, 0];
  return { normal, u, v: normalize(cross(normal, u)) };
}

function combine(...terms: Array<[Vec3, number]>): Vec3 {
  const result: Vec3 = [0, 0, 0];
  for (const [vector, factor] of terms) {
    result[0] += vector[0] * factor;
    result[1] += vector[1] * factor;
    result[2] += vector[2] * factor;
  }
  return result;
}

function scale(vector: Vec3, factor: number): Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function averagePoint(points: readonly Vec3[]): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  return combine(
    ...points.map((point) => [point, 1 / points.length] as [Vec3, number]),
  );
}

/** Newell's normal: well defined for a non-planar cycle as well. */
function newellNormal(points: readonly Vec3[]): Vec3 {
  const normal: Vec3 = [0, 0, 0];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    normal[0] += (point[1] - next[1]) * (point[2] + next[2]);
    normal[1] += (point[2] - next[2]) * (point[0] + next[0]);
    normal[2] += (point[0] - next[0]) * (point[1] + next[1]);
  });
  return normalize(normal);
}

function unorderedKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
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
