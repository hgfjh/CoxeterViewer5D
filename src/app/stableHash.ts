import type {
  CayleyGenerationOptions,
  CoxeterSystemInput,
  GeneratedCayleyBall,
} from "../types";
import type { SceneCell, SceneEdge, SceneNode } from "../render/SceneView";
import type { YGamma2SkeletonSceneOptions } from "./yGammaScene";

export function stableHashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function stableValueString(value: unknown): string {
  return stringifyStable(value, new WeakSet<object>());
}

export function stableValueHash(value: unknown): string {
  return stableHashString(stableValueString(value));
}

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
  options: YGamma2SkeletonSceneOptions;
}): string {
  return stableValueHash({
    atlasVersion: input.atlasVersion,
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
