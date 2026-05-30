import type {
  CayleyGenerationOptions,
  CoxeterSystemInput,
  GeneratedCayleyBall,
} from "../types";
import type { SceneCell, SceneEdge, SceneNode } from "../render/SceneView";
import type { YGamma2SkeletonSceneOptions } from "./yGammaScene";

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

/**
 * Stable JSON-like serialization for app state that needs repeatable keys.
 */
export function stableValueString(value: unknown): string {
  return stringifyStable(value, new WeakSet<object>());
}

export function stableValueHash(value: unknown): string {
  return stableHashString(stableValueString(value));
}

/**
 * Hashes only the Coxeter data that changes generated Cayley-ball structure.
 */
export function hashCoxeterSystemForGeneration(
  system: CoxeterSystemInput,
): string {
  return stableValueHash({
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
  return [
    ball.systemName,
    ball.rank,
    ball.metadata.radius,
    ball.metadata.requestedRadius,
    ball.nodes.length,
    ball.edges.length,
    ball.twoCells.length,
    ball.higherCells?.length ?? 0,
    ball.metadata.outputHash ?? ball.metadata.inputHash ?? "",
  ].join(":");
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
  return stableValueHash({
    nodes: input.nodes.map((node) => [
      node.id,
      node.position,
      node.hidden === true ? 1 : 0,
    ]),
    edges: input.edges.map((edge) => [
      edge.id,
      edge.source,
      edge.target,
      edge.generator,
      edge.directed === true ? 1 : 0,
    ]),
    cells: input.cells.map((cell) => [
      cell.id,
      cell.generatorPair,
      cell.boundaryNodeIds,
      cell.dimension,
      cell.sourceCellId,
    ]),
  });
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
  rankTwoCellIds: readonly string[];
  higherCellIds: readonly string[];
  warnings: readonly string[];
}): string {
  return stableValueHash(input);
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
