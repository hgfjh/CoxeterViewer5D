import type { CayleyEdge, GeneratedCayleyBall } from "../types";
import type { SphericalSubset } from "./sphericalSubsets";

export interface DavisCellProxy {
  id: string;
  sourceCellId?: string;
  sphericalSubsetId: string;
  generators: number[];
  rank: number;
  nodeIds: string[];
  centroidNodeId: string;
  cosetKey?: string;
  expectedSubgroupOrder?: number;
  exactIncidenceAvailable: boolean;
  warning: string;
}

export interface DavisCellProxyResult {
  proxies: DavisCellProxy[];
  warnings: string[];
}

export interface DavisCellProxyOptions {
  maxProxies?: number;
}

/**
 * Builds renderer-facing proxies for higher-rank Davis cells.
 *
 * Prefer imported or derived exact incidence records when present. If no such
 * records exist, the fallback searches for complete restricted components in
 * the visible ball. In both cases the filled 3D shape remains a readability
 * proxy; exactness refers only to the node/edge/cell incidence data.
 */
export function computeSphericalCellProxies(
  ball: GeneratedCayleyBall,
  sphericalSubsets: SphericalSubset[],
  options: DavisCellProxyOptions = {},
): DavisCellProxyResult {
  const maxProxies = options.maxProxies ?? 80;
  const proxies = new Map<string, DavisCellProxy>();
  const warnings: string[] = [];
  const higherRankSubsetIds = new Set(
    sphericalSubsets
      .filter((entry) => entry.rank >= 3)
      .map((subset) => subset.id),
  );

  for (const cell of ball.higherCells ?? []) {
    if (!higherRankSubsetIds.has(cell.sphericalSubsetId)) {
      continue;
    }

    if (proxies.size >= maxProxies) {
      warnings.push(
        `Higher-rank Davis cell proxy rendering stopped at ${maxProxies} proxies.`,
      );
      return { proxies: [...proxies.values()], warnings };
    }

    proxies.set(cell.id, {
      id: `proxy:${cell.id}`,
      sourceCellId: cell.id,
      sphericalSubsetId: cell.sphericalSubsetId,
      generators: cell.generators,
      rank: cell.rank,
      nodeIds: cell.nodeIds,
      centroidNodeId: cell.coset?.representativeNodeId ?? cell.nodeIds[0],
      cosetKey: cell.coset?.key,
      expectedSubgroupOrder: cell.coset?.expectedSubgroupOrder,
      exactIncidenceAvailable: true,
      warning:
        cell.rendering?.note ??
        "Exact higher-cell incidence is available; the filled shape is a visual proxy.",
    });
  }

  if (proxies.size > 0) {
    warnings.push(
      "Higher-rank Davis cells use exact visible incidence records, but their filled shapes are visual proxies.",
    );
    return { proxies: [...proxies.values()], warnings };
  }

  const adjacency = edgeAdjacency(ball.edges);
  for (const subset of sphericalSubsets.filter((entry) => entry.rank >= 3)) {
    const allowed = new Set(subset.generators);
    const visitedComponentNodes = new Set<string>();
    for (const node of ball.nodes) {
      if (visitedComponentNodes.has(node.id)) {
        continue;
      }
      if (proxies.size >= maxProxies) {
        warnings.push(
          `Higher-rank Davis cell proxy rendering stopped at ${maxProxies} proxies.`,
        );
        return { proxies: [...proxies.values()], warnings };
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
      if (!proxies.has(key)) {
        proxies.set(key, {
          id: `proxy:${subset.id}:${component[0]}`,
          sphericalSubsetId: subset.id,
          generators: subset.generators,
          rank: subset.rank,
          nodeIds: component,
          centroidNodeId: component[0],
          expectedSubgroupOrder: subset.subgroupOrder,
          exactIncidenceAvailable: false,
          warning:
            "Visual proxy for a higher-rank Davis cell; not an exact embedded cell.",
        });
      }
    }
  }

  if (proxies.size > 0) {
    warnings.push(
      "Higher-rank Davis cells are shown as visual proxies, not exact embedded cells.",
    );
  }

  return { proxies: [...proxies.values()], warnings };
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
