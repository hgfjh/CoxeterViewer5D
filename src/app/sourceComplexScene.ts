import {
  buildHyperbolicReflectionData,
  computeOrbitLayout,
  type OrbitLayoutKind,
  placeCayleyNodesInHyperbolicGeometry,
} from "../geometry";
import type {
  SceneCell,
  SceneEdge,
  SceneGenerator,
  SceneNode,
} from "../render/SceneView";
import type {
  CoxeterSystemInput,
  GeneratedCayleyBall,
  HyperbolicProjection,
} from "../types";

export interface SourceComplexScene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  cells: SceneCell[];
  generators: SceneGenerator[];
  warnings: string[];
  projectionOk?: boolean;
  /**
   * Set when the Projection model cannot be shown for this system (no
   * geometry block, or the reflection data failed validation). The Projection
   * button should be disabled with this text; no reference ball is returned.
   */
  projectionUnavailableReason?: string;
  /** Present only for an exact-axes ball-model projection (not for PCA). */
  referenceBallRadius?: number;
  /** How the Davis view placed vertices (undefined in the Projection model). */
  layoutKind?: OrbitLayoutKind;
  /** One-sentence description of what the vertex positions mean. */
  layoutCaveat?: string;
}

export interface SourceComplexSceneOptions {
  selectedNodeId?: string;
  selectedCellId?: string;
  geometric?: boolean;
  projection?: HyperbolicProjection;
}

const GEOMETRIC_DISPLAY_SCALE = 12;

/**
 * Extra scale for the selected vertex, applied by the renderer
 * (SceneView `selectedNodeScale`) so selection never rebuilds node arrays.
 */
export const SOURCE_SELECTED_NODE_SCALE = 1.45;

export function buildSourceComplexScene(
  system: CoxeterSystemInput,
  ball: GeneratedCayleyBall,
  options: SourceComplexSceneOptions = {},
): SourceComplexScene {
  return withSourceSelection(
    buildSourceComplexBase(system, ball, options),
    options.selectedCellId,
  );
}

/**
 * Selection-free part of the Davis/projection scene: placement, labels and
 * topology.  It depends only on (system, ball, geometric, projection), so a
 * click never recomputes hyperbolic placement or relabels thousands of nodes.
 */
export function buildSourceComplexBase(
  system: CoxeterSystemInput,
  ball: GeneratedCayleyBall,
  options: Pick<SourceComplexSceneOptions, "geometric" | "projection"> = {},
): SourceComplexScene {
  let nodes = ball.nodes;
  let warnings = [...ball.metadata.warnings];
  let projectionOk: boolean | undefined;
  let projectionUnavailableReason: string | undefined;
  let referenceBallRadius: number | undefined;
  let layoutKind: OrbitLayoutKind | undefined;
  let layoutCaveat: string | undefined;

  if (options.geometric) {
    const projection = resolveSceneProjection(system, options.projection);
    const placement = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection,
      displayScale: GEOMETRIC_DISPLAY_SCALE,
    });
    projectionOk = placement.ok;
    if (placement.ok) {
      nodes = placement.nodes;
      warnings = [...warnings, ...placement.warnings];
      // The unit sphere is the ideal boundary only for coordinate axes of
      // the ball model; a PCA view is recentred and is not a model map.
      referenceBallRadius = projection.endsWith("-axes")
        ? GEOMETRIC_DISPLAY_SCALE
        : undefined;
      layoutCaveat = projectionCaveat(system, projection);
    } else {
      projectionUnavailableReason = unavailableReason(placement.warnings);
    }
  }

  if (!options.geometric || !projectionOk) {
    const layout = computeOrbitLayout(system, ball.nodes, ball.edges);
    if (layout.positions !== undefined) {
      const positions = layout.positions;
      nodes = ball.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? node.position,
      }));
    }
    layoutKind = layout.kind;
    layoutCaveat = layout.caveat;
    warnings = [...warnings, ...layout.warnings];
    if (!options.geometric && system.geometry === undefined) {
      projectionUnavailableReason = NO_GEOMETRY_REASON;
    } else if (!options.geometric && layout.kind === "shell-fallback") {
      projectionUnavailableReason = unavailableReason(layout.warnings);
    }
  }

  return {
    nodes: nodes.map((node) => {
      const label = wordLabel(node.word, system);
      return {
        id: node.id,
        label,
        compactLabel: label,
        length: node.length,
        position: node.position,
        labelPriority: 100 - node.length,
      };
    }),
    edges: ball.edges.map((edge, index) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      generator: edge.generator,
      compactLabel: system.generators[edge.generator]?.label,
      labelPriority: 10_000 - index,
    })),
    cells: ball.twoCells.map((cell) => ({
      id: cell.id,
      generatorPair: cell.generatorPair,
      boundaryNodeIds: cell.boundaryNodeIds,
      sourceCellId: cell.id,
      readabilityRole: "incident",
    })),
    generators: system.generators.map((generator) => ({
      label: generator.label,
      colorHint: generator.colorHint,
    })),
    warnings: [...new Set(warnings)],
    projectionOk,
    projectionUnavailableReason,
    referenceBallRadius,
    layoutKind,
    layoutCaveat,
  };
}

/**
 * Overlay the selected cell's focus role.  Node and edge arrays are shared
 * with the base scene, so the renderer sees an appearance-only change.
 */
export function withSourceSelection(
  base: SourceComplexScene,
  selectedCellId: string | undefined,
): SourceComplexScene {
  if (
    !selectedCellId ||
    !base.cells.some((cell) => cell.id === selectedCellId)
  ) {
    return base;
  }
  return {
    ...base,
    cells: base.cells.map((cell) =>
      cell.id === selectedCellId ? { ...cell, readabilityRole: "focus" } : cell,
    ),
  };
}

function wordLabel(
  word: readonly number[],
  system: CoxeterSystemInput,
): string {
  if (word.length === 0) return "e";
  return word
    .map((generator) => system.generators[generator]?.label ?? `s${generator}`)
    .join(" ");
}

const NO_GEOMETRY_REASON =
  "Projection needs hyperbolic reflection data (a geometry block with facet normals); this system has none, so only the Davis view is available.";

/**
 * Whether the Projection model can be shown, independent of the current
 * model. Cheap enough to memoise per system (it validates the reflection
 * data once and does not touch the Cayley ball).
 */
export function projectionAvailability(system: CoxeterSystemInput): {
  ok: boolean;
  reason?: string;
} {
  if (system.geometry === undefined) {
    return { ok: false, reason: NO_GEOMETRY_REASON };
  }
  const data = buildHyperbolicReflectionData(system);
  return data.ok
    ? { ok: true }
    : { ok: false, reason: unavailableReason(data.warnings) };
}

function unavailableReason(warnings: string[]): string {
  return `Projection is unavailable: the hyperbolic reflection data did not validate (${warnings.join(" ") || "no details"}).`;
}

/**
 * Klein is the default model. For d <= 3 a PCA request is replaced by exact
 * coordinate axes: PCA of a 3D cloud is only a rotation and recentring, and
 * the axes keep the unit sphere meaningful as the ideal boundary.
 */
export function resolveSceneProjection(
  system: CoxeterSystemInput,
  requested: HyperbolicProjection | undefined,
): HyperbolicProjection {
  const dimension = system.geometry?.dimension ?? 0;
  const projection = requested ?? (dimension <= 3 ? "klein-axes" : "klein-pca");
  if (dimension <= 3 && projection.endsWith("-pca")) {
    return projection.startsWith("poincare") ? "poincare-axes" : "klein-axes";
  }
  return projection;
}

function projectionCaveat(
  system: CoxeterSystemInput,
  projection: HyperbolicProjection,
): string {
  const model = projection.startsWith("poincare") ? "Poincare" : "Klein";
  const dimension = system.geometry?.dimension ?? 0;
  const map = projection.endsWith("-pca")
    ? `projected from R^${dimension} to 3D by PCA (no reference ball: PCA is not a model map)`
    : dimension <= 3
      ? "exact coordinate axes"
      : `the first three of ${dimension} coordinate axes`;
  return `Projection: hyperbolic chamber barycenters w x0 in the ${model} ball, ${map}.`;
}
