import { placeCayleyNodesInHyperbolicGeometry } from "../geometry";
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
  referenceBallRadius?: number;
}

export interface SourceComplexSceneOptions {
  selectedNodeId?: string;
  selectedCellId?: string;
  geometric?: boolean;
  projection?: HyperbolicProjection;
}

const GEOMETRIC_DISPLAY_SCALE = 12;

export function buildSourceComplexScene(
  system: CoxeterSystemInput,
  ball: GeneratedCayleyBall,
  options: SourceComplexSceneOptions = {},
): SourceComplexScene {
  let nodes = ball.nodes;
  let warnings = [...ball.metadata.warnings];
  let projectionOk: boolean | undefined;
  if (options.geometric) {
    const placement = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: options.projection ?? preferredProjection(system),
      displayScale: GEOMETRIC_DISPLAY_SCALE,
    });
    nodes = placement.nodes;
    warnings = [...warnings, ...placement.warnings];
    projectionOk = placement.ok;
  }

  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      label: wordLabel(node.word, system),
      compactLabel: wordLabel(node.word, system),
      length: node.length,
      position: node.position,
      alwaysLabel: node.id === options.selectedNodeId,
      labelPriority:
        node.id === options.selectedNodeId ? 100_000 : 100 - node.length,
      nodeScale: node.id === options.selectedNodeId ? 1.45 : 1,
    })),
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
      readabilityRole:
        cell.id === options.selectedCellId ? "focus" : "incident",
    })),
    generators: system.generators.map((generator) => ({
      label: generator.label,
      colorHint: generator.colorHint,
    })),
    warnings: [...new Set(warnings)],
    projectionOk,
    referenceBallRadius: options.geometric
      ? GEOMETRIC_DISPLAY_SCALE
      : undefined,
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

function preferredProjection(system: CoxeterSystemInput): HyperbolicProjection {
  return (system.geometry?.dimension ?? 0) <= 3
    ? "poincare-axes"
    : "poincare-pca";
}
