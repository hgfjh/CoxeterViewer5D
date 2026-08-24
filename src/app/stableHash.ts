import type {
  CayleyGenerationOptions,
  CoxeterSystemInput,
  GeneratedCayleyBall,
} from "../types";
import type { SceneCell, SceneEdge, SceneNode } from "../render/SceneView";
import type { YGamma2SkeletonSceneOptions } from "./yGammaScene";

export interface SceneRevisionSet {
  topologyVersion: string;
  layoutVersion: string;
  cellGeometryVersion: string;
  appearanceVersion: string;
  labelVersion: string;
  pickingVersion: string;
  cameraVersion: string;
  structureVersion: string;
  renderAppearanceVersion: string;
}

export interface SceneRevisionInput {
  nodes: readonly SceneNode[];
  edges: readonly SceneEdge[];
  cells: readonly SceneCell[];
  cellGeometryParts?: readonly string[];
  appearanceParts?: readonly string[];
  labelParts?: readonly string[];
  pickingParts?: readonly string[];
  cameraParts?: readonly string[];
}

interface NodeRevisionComponents {
  topology: string;
  layout: string;
  appearance: string;
  labels: string;
}

interface EdgeRevisionComponents {
  topology: string;
  appearance: string;
  labels: string;
}

interface CellRevisionComponents {
  topology: string;
  geometry: string;
  appearance: string;
}

// Scene builders replace arrays when their contents change. These identity
// caches make a selection-only update hash a handful of revision strings
// instead of walking thousands of unchanged scene records again.
const nodeRevisionComponents = new WeakMap<
  readonly SceneNode[],
  NodeRevisionComponents
>();
const edgeRevisionComponents = new WeakMap<
  readonly SceneEdge[],
  EdgeRevisionComponents
>();
const cellRevisionComponents = new WeakMap<
  readonly SceneCell[],
  CellRevisionComponents
>();

/**
 * Small deterministic FNV-1a hash for cache keys and renderer versions.
 *
 * This is not a cryptographic hash. Use SHA-256 in scripts and certificates
 * when a stored artifact needs tamper-evident provenance.
 */
export function stableHashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function stableLongHashString(input: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  return seeds
    .map((seed, seedIndex) => {
      let hash = seed >>> 0;
      for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index) + seedIndex * 17;
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    })
    .join("");
}

/**
 * Stable JSON-like serialization for app state that needs repeatable keys.
 */
export function stableValueString(value: unknown): string {
  return stringifyStable(value, new WeakSet<object>());
}

export function stableValueHash(value: unknown): string {
  return stableHashString(stableValueString(value));
}

export function stableValueLongHash(value: unknown): string {
  return stableLongHashString(stableValueString(value));
}

/**
 * Hashes only the Coxeter data that changes generated Cayley-ball structure.
 */
export function hashCoxeterSystemForGeneration(
  system: CoxeterSystemInput,
): string {
  return stableValueLongHash({
    schemaVersion: system.schemaVersion,
    name: system.name,
    rank: system.rank,
    generators: system.generators.map((generator) => ({
      id: generator.id,
      label: generator.label,
      colorHint: generator.colorHint,
    })),
    coxeterMatrix: system.coxeterMatrix,
    geometry: system.geometry
      ? {
          model: system.geometry.model,
          dimension: system.geometry.dimension,
          normalGram: system.geometry.normalGram,
          normalCoordinates: system.geometry.normalCoordinates,
          basepoint: system.geometry.basepoint,
        }
      : undefined,
  });
}

/**
 * Cache key for generated balls. Radius/caps are included because truncation is
 * part of the mathematical object the viewer exports.
 */
export function generationCacheKey(input: {
  datasetId: string;
  system: CoxeterSystemInput;
  options: CayleyGenerationOptions;
}): string {
  return [
    "generated-ball",
    "pipeline-v2",
    input.datasetId,
    hashCoxeterSystemForGeneration(input.system),
    input.options.radius,
    input.options.maxRadius ?? "",
    input.options.maxNodes ?? "",
    input.options.maxEdges ?? "",
    input.options.matrixKeyPrecision ?? "",
  ].join(":");
}

/**
 * Lightweight identity for memoizing derived layouts from an already-built ball.
 */
export function generatedBallIdentity(ball: GeneratedCayleyBall): string {
  return stableValueLongHash({
    systemName: ball.systemName,
    rank: ball.rank,
    radius: ball.metadata.radius,
    requestedRadius: ball.metadata.requestedRadius,
    nodeCount: ball.nodes.length,
    edgeCount: ball.edges.length,
    twoCellCount: ball.twoCells.length,
    higherCellCount: ball.higherCells?.length ?? 0,
    sourceHash: ball.metadata.outputHash ?? ball.metadata.inputHash,
    fallbackTopology:
      ball.metadata.outputHash || ball.metadata.inputHash
        ? undefined
        : {
            nodes: ball.nodes.map((node) => [node.id, node.word, node.length]),
            edges: ball.edges.map((edge) => [
              edge.id,
              edge.source,
              edge.target,
              edge.generator,
            ]),
            cells: ball.twoCells.map((cell) => [
              cell.id,
              cell.generatorPair,
              cell.m,
              cell.boundaryNodeIds,
            ]),
          },
  });
}

/**
 * Layered scene revisions let the renderer avoid treating every React render as
 * a possible mesh rebuild. The layers are intentionally semantic: topology is
 * incidence, layout is coordinates, cell geometry is drawing-only deformation,
 * labels are text/sprite state, and appearance is material/highlight state.
 */
export function buildSceneRevisionSet(
  input: SceneRevisionInput,
): SceneRevisionSet {
  const nodeRevisions = revisionsForNodes(input.nodes);
  const edgeRevisions = revisionsForEdges(input.edges);
  const cellRevisions = revisionsForCells(input.cells);
  const topologyVersion = stableValueHash({
    nodes: nodeRevisions.topology,
    edges: edgeRevisions.topology,
    cells: cellRevisions.topology,
  });
  const layoutVersion = nodeRevisions.layout;
  const cellGeometryVersion = stableValueHash({
    topologyVersion,
    layoutVersion,
    cells: cellRevisions.geometry,
    parts: input.cellGeometryParts ?? [],
  });
  const appearanceVersion = stableValueHash({
    nodes: nodeRevisions.appearance,
    edges: edgeRevisions.appearance,
    cells: cellRevisions.appearance,
    parts: input.appearanceParts ?? [],
  });
  const labelVersion = stableValueHash({
    nodes: nodeRevisions.labels,
    edges: edgeRevisions.labels,
    parts: input.labelParts ?? [],
  });
  const pickingVersion = stableValueHash({
    topologyVersion,
    cellGeometryVersion,
    parts: input.pickingParts ?? [],
  });
  const cameraVersion = stableValueHash({
    layoutVersion,
    parts: input.cameraParts ?? [],
  });

  return {
    topologyVersion,
    layoutVersion,
    cellGeometryVersion,
    appearanceVersion,
    labelVersion,
    pickingVersion,
    cameraVersion,
    structureVersion: stableValueHash({
      topologyVersion,
      layoutVersion,
      cellGeometryVersion,
      pickingVersion,
    }),
    renderAppearanceVersion: stableValueHash({
      appearanceVersion,
      labelVersion,
      cameraVersion,
    }),
  };
}

/**
 * Renderer structure version: changes only when mesh topology or positions do.
 *
 * Selection, opacity, labels, and colors belong in sceneAppearanceVersion so the
 * Three.js runtime can update materials/sprites without rebuilding buffers.
 */
export function sceneStructureVersion(input: {
  nodes: readonly SceneNode[];
  edges: readonly SceneEdge[];
  cells: readonly SceneCell[];
}): string {
  return buildSceneRevisionSet(input).structureVersion;
}

/**
 * Renderer appearance version for cheap visual updates over fixed geometry.
 */
export function sceneAppearanceVersion(input: {
  selectedNodeId?: string;
  selectedCellId?: string;
  activeGeneratorPairKey?: string;
  showCells: boolean;
  showNodeLabels: boolean;
  showEdgeLabels: boolean;
  labelScope: string;
  cellOpacity: number;
  occlusionMode: string;
  topologyMode: boolean;
}): string {
  return stableValueHash(input);
}

export function yGammaSceneVersion(input: {
  atlasVersion: string;
  builderVersion: string;
  options: YGamma2SkeletonSceneOptions;
}): string {
  return stableValueHash({
    atlasVersion: input.atlasVersion,
    builderVersion: input.builderVersion,
    options: input.options,
  });
}

export function yGammaAtlasVersion(input: {
  systemName: string;
  generatorCount: number;
  generatorCells: readonly {
    id: string;
    generators: readonly number[];
    generatorLabels: readonly string[];
    label: string;
    attachingWord: readonly string[];
  }[];
  rankTwoCells: readonly {
    id: string;
    generators: readonly number[];
    generatorLabels: readonly string[];
    m?: number;
    boundaryLength?: number;
    attachingWord: readonly string[];
  }[];
  higherCells: readonly {
    id: string;
    generators: readonly number[];
    generatorLabels: readonly string[];
    rank: number;
    dimension: number;
    label: string;
    rankTwoFaceIds: readonly string[];
    subgroupOrder?: number;
  }[];
  warnings: readonly string[];
}): string {
  return stableValueLongHash(input);
}

function revisionsForNodes(
  nodes: readonly SceneNode[],
): NodeRevisionComponents {
  const cached = nodeRevisionComponents.get(nodes);
  if (cached) {
    return cached;
  }
  const revisions = {
    topology: stableValueHash(nodes.map((node) => [node.id, node.length])),
    layout: stableValueHash(
      nodes.map((node) => [
        node.id,
        node.position,
        node.hidden === true ? 1 : 0,
        node.localDistance,
        node.nodeScale,
        node.stateRole,
      ]),
    ),
    appearance: stableValueHash(
      nodes.map((node) => [
        node.id,
        node.ghost === true ? 1 : 0,
        node.isRelationBoundary === true ? 1 : 0,
        node.colorHint,
        node.stateRole,
      ]),
    ),
    labels: stableValueHash(
      nodes.map((node) => [
        node.id,
        node.label,
        node.compactLabel,
        node.isRelationBoundary === true ? 1 : 0,
        node.alwaysLabel === true ? 1 : 0,
        node.labelPriority,
        node.stateRole,
      ]),
    ),
  };
  nodeRevisionComponents.set(nodes, revisions);
  return revisions;
}

function revisionsForEdges(
  edges: readonly SceneEdge[],
): EdgeRevisionComponents {
  const cached = edgeRevisionComponents.get(edges);
  if (cached) {
    return cached;
  }
  const revisions = {
    topology: stableValueHash(
      edges.map((edge) => [
        edge.id,
        edge.source,
        edge.target,
        edge.generator,
        edge.directed === true ? 1 : 0,
        edge.ghost === true ? 1 : 0,
        edge.colorHint,
        edge.isRelationBoundary === true ? 1 : 0,
        edge.alwaysLabel === true ? 1 : 0,
        edge.labelPriority,
        edge.suppressSemanticLabel === true ? 1 : 0,
      ]),
    ),
    appearance: stableValueHash(
      edges.map((edge) => [
        edge.id,
        edge.ghost === true ? 1 : 0,
        edge.emphasis,
        edge.selectedHighlight,
        edge.colorHint,
      ]),
    ),
    labels: stableValueHash(
      edges.map((edge) => [
        edge.id,
        edge.compactLabel,
        edge.semanticLabelKind,
        edge.alwaysLabel === true ? 1 : 0,
        edge.labelAnchor,
        edge.labelPosition,
        edge.labelLeader === true ? 1 : 0,
        edge.labelPriority,
        edge.suppressSemanticLabel === true ? 1 : 0,
      ]),
    ),
  };
  edgeRevisionComponents.set(edges, revisions);
  return revisions;
}

function revisionsForCells(
  cells: readonly SceneCell[],
): CellRevisionComponents {
  const cached = cellRevisionComponents.get(cells);
  if (cached) {
    return cached;
  }
  const revisions = {
    topology: stableValueHash(
      cells.map((cell) => [
        cell.id,
        cell.generatorPair,
        cell.boundaryNodeIds,
        cell.dimension,
        cell.sourceCellId,
      ]),
    ),
    geometry: stableValueHash(
      cells.map((cell) => [
        cell.id,
        cell.localDistance,
        cell.readabilityRole,
        cell.isRelationBoundary === true ? 1 : 0,
        cell.drawingInteriorPoint,
        cell.drawingInteriorRing,
      ]),
    ),
    appearance: stableValueHash(
      cells.map((cell) => [cell.id, cell.readabilityRole]),
    ),
  };
  cellRevisionComponents.set(cells, revisions);
  return revisions;
}

function stringifyStable(value: unknown, seen: WeakSet<object>): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (seen.has(value)) {
    return '"[Circular]"';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stringifyStable(entry, seen)).join(",")}]`;
  }

  if (value instanceof Map) {
    const entries = [...value.entries()].sort(([left], [right]) =>
      String(left).localeCompare(String(right)),
    );
    return `{"$map":[${entries
      .map(
        ([key, entry]) =>
          `[${stringifyStable(key, seen)},${stringifyStable(entry, seen)}]`,
      )
      .join(",")}]}`;
  }

  if (value instanceof Set) {
    const entries = [...value.values()]
      .map((entry) => stringifyStable(entry, seen))
      .sort();
    return `{"$set":[${entries.join(",")}]}`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .filter((key) => record[key] !== undefined)
    .map(
      (key) => `${JSON.stringify(key)}:${stringifyStable(record[key], seen)}`,
    )
    .join(",")}}`;
}
