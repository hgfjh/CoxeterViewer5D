import type {
  CayleyEdge,
  DavisHigherCell,
  DavisHigherCellSubgroupSizeStatus,
  GeneratedCayleyBall,
} from "../types";
import type { SphericalSubset } from "./sphericalSubsets";

export interface HigherCellDerivationResult {
  higherCells: DavisHigherCell[];
  warnings: string[];
}

/**
 * Derives higher Davis cell incidence from complete visible spherical cosets.
 *
 * The test is combinatorial: every generator in the spherical subset must keep
 * the restricted component inside the current ball, and the component size must
 * match the known finite special-subgroup order when that order is available.
 * The record can be exact-in-ball even when the renderer later draws only a
 * proxy hull.
 */
export function deriveVisibleHigherDavisCells(
  ball: GeneratedCayleyBall,
  sphericalSubsets: SphericalSubset[],
): HigherCellDerivationResult {
  const adjacency = edgeAdjacency(ball.edges);
  const higherCells = new Map<string, DavisHigherCell>();
  const warnings: string[] = [];

  const higherRankSubsets = sphericalSubsets.filter((entry) => entry.rank >= 3);
  const nodeById = new Map(ball.nodes.map((node) => [node.id, node]));

  for (const subset of higherRankSubsets) {
    const allowed = new Set(subset.generators);
    const visitedComponentNodes = new Set<string>();
    for (const node of ball.nodes) {
      if (visitedComponentNodes.has(node.id)) {
        continue;
      }
      const component = restrictedComponent(node.id, allowed, adjacency);
      for (const nodeId of component) {
        visitedComponentNodes.add(nodeId);
      }
      if (component.length <= subset.rank) {
        continue;
      }
      if (!componentIsClosed(component, allowed, adjacency)) {
        continue;
      }

      const key = `${subset.id}:${component.join("|")}`;
      const sizeStatus = subgroupSizeStatus(component.length, subset);
      if (sizeStatus === "mismatch") {
        const subgroupLabel = subset.generators.join(", ");
        warnings.push(
          `Visible coset ${key} has ${component.length} nodes, but <${subgroupLabel}> has expected order ${subset.subgroupOrder}.`,
        );
        continue;
      }

      if (!higherCells.has(key)) {
        const representative = nodeById.get(component[0]);
        higherCells.set(key, {
          id: `higher:${subset.id}:${component[0]}`,
          sphericalSubsetId: subset.id,
          generators: subset.generators,
          rank: subset.rank,
          nodeIds: component,
          complete: true,
          source: "derived-visible-coset",
          coset: {
            key,
            representativeNodeId: component[0],
            representativeWord: representative?.word,
            minNodeId: component[0],
            nodeCount: component.length,
            expectedSubgroupOrder: subset.subgroupOrder,
            subgroupSizeStatus: sizeStatus,
          },
          incidence: {
            vertexNodeIds: component,
            edgeIds: restrictedEdgeIds(component, allowed, ball.edges),
            rankTwoCellIds: incidentRankTwoCellIds(
              component,
              allowed,
              ball.twoCells,
            ),
          },
          rendering: {
            kind: "exact-incidence",
            proxy: true,
            note: "The coset incidence is recorded exactly for the visible ball; the 3D filled shape is only a visual proxy.",
          },
        });
      }
    }
  }

  if (higherRankSubsets.length > 0 && higherCells.size === 0) {
    warnings.push(
      "No complete higher-rank spherical cosets are fully visible in this ball.",
    );
  }

  return { higherCells: [...higherCells.values()], warnings };
}

function subgroupSizeStatus(
  componentSize: number,
  subset: SphericalSubset,
): DavisHigherCellSubgroupSizeStatus {
  if (subset.subgroupOrder === undefined) {
    return "unknown";
  }

  return componentSize === subset.subgroupOrder ? "matches" : "mismatch";
}

function restrictedEdgeIds(
  component: string[],
  allowed: Set<number>,
  edges: CayleyEdge[],
): string[] {
  const componentSet = new Set(component);
  return edges
    .filter(
      (edge) =>
        allowed.has(edge.generator) &&
        componentSet.has(edge.source) &&
        componentSet.has(edge.target),
    )
    .map((edge) => edge.id)
    .sort();
}

function incidentRankTwoCellIds(
  component: string[],
  allowed: Set<number>,
  twoCells: GeneratedCayleyBall["twoCells"],
): string[] {
  const componentSet = new Set(component);
  return twoCells
    .filter(
      (cell) =>
        allowed.has(cell.generatorPair[0]) &&
        allowed.has(cell.generatorPair[1]) &&
        cell.boundaryNodeIds.every((nodeId) => componentSet.has(nodeId)),
    )
    .map((cell) => cell.id)
    .sort();
}

function edgeAdjacency(edges: CayleyEdge[]): Map<string, Map<number, string>> {
  const adjacency = new Map<string, Map<number, string>>();
  const add = (source: string, target: string, generator: number) => {
    const byGenerator = adjacency.get(source) ?? new Map<number, string>();
    byGenerator.set(generator, target);
    adjacency.set(source, byGenerator);
  };

  for (const edge of edges) {
    add(edge.source, edge.target, edge.generator);
    add(edge.target, edge.source, edge.generator);
  }

  return adjacency;
}

function restrictedComponent(
  start: string,
  allowed: Set<number>,
  adjacency: Map<string, Map<number, string>>,
): string[] {
  const seen = new Set([start]);
  const queue = [start];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const generator of allowed) {
      const next = adjacency.get(current)?.get(generator);
      if (next !== undefined && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return [...seen].sort();
}

function componentIsClosed(
  component: string[],
  allowed: Set<number>,
  adjacency: Map<string, Map<number, string>>,
): boolean {
  const componentSet = new Set(component);
  for (const nodeId of component) {
    for (const generator of allowed) {
      const next = adjacency.get(nodeId)?.get(generator);
      if (next === undefined || !componentSet.has(next)) {
        return false;
      }
    }
  }
  return true;
}
