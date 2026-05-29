import type { CayleyEdge } from "../types";

export interface GraphNeighborhoodOptions {
  depth: number;
}

/**
 * Returns the undirected graph-neighborhood around a Cayley vertex.
 * The Cayley edges keep generator orientation data, but for local viewing a
 * chamber is adjacent to both endpoints of every incident generator edge.
 */
export function collectGraphNeighborhood(
  edges: CayleyEdge[],
  centerId: string,
  options: GraphNeighborhoodOptions,
): Set<string> {
  const depth = Math.max(0, Math.trunc(options.depth));
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    addNeighbor(adjacency, edge.source, edge.target);
    addNeighbor(adjacency, edge.target, edge.source);
  }

  const seen = new Set([centerId]);
  const queue: Array<{ nodeId: string; distance: number }> = [
    { nodeId: centerId, distance: 0 },
  ];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.distance >= depth) {
      continue;
    }

    for (const neighbor of adjacency.get(current.nodeId) ?? []) {
      if (seen.has(neighbor)) {
        continue;
      }
      seen.add(neighbor);
      queue.push({ nodeId: neighbor, distance: current.distance + 1 });
    }
  }

  return seen;
}

function addNeighbor(
  adjacency: Map<string, Set<string>>,
  source: string,
  target: string,
) {
  const neighbors = adjacency.get(source) ?? new Set<string>();
  neighbors.add(target);
  adjacency.set(source, neighbors);
}
