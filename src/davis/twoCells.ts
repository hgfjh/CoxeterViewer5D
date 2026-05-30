import type {
  CayleyEdge,
  CoxeterSystemInput,
  DavisTwoCell,
  GeneratedCayleyBall,
} from "../types";
import { parseCoxeterSystemInput } from "../coxeter";

export interface RankTwoDavisCellResult {
  cells: DavisTwoCell[];
  warnings: string[];
}

function edgeAdjacency(edges: CayleyEdge[]): Map<string, Map<number, string>> {
  const adjacency = new Map<string, Map<number, string>>();

  function add(source: string, target: string, generator: number) {
    const byGenerator = adjacency.get(source) ?? new Map<number, string>();
    byGenerator.set(generator, target);
    adjacency.set(source, byGenerator);
  }

  for (const edge of edges) {
    add(edge.source, edge.target, edge.generator);
    add(edge.target, edge.source, edge.generator);
  }

  return adjacency;
}

function finiteRankTwoPairs(
  system: CoxeterSystemInput,
): Array<[number, number, number]> {
  const pairs: Array<[number, number, number]> = [];

  for (let i = 0; i < system.rank; i += 1) {
    for (let j = i + 1; j < system.rank; j += 1) {
      const entry = system.coxeterMatrix[i][j];
      if (typeof entry === "number") {
        pairs.push([i, j, entry]);
      }
    }
  }

  return pairs;
}

function rotateToSmallest(boundary: string[]): string[] {
  let smallestIndex = 0;

  for (let i = 1; i < boundary.length; i += 1) {
    if (boundary[i] < boundary[smallestIndex]) {
      smallestIndex = i;
    }
  }

  return [
    ...boundary.slice(smallestIndex),
    ...boundary.slice(0, smallestIndex),
  ];
}

function compareBoundaries(left: string[], right: string[]): number {
  for (let i = 0; i < left.length; i += 1) {
    const comparison = left[i].localeCompare(right[i]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function canonicalBoundary(boundary: string[]): string[] {
  const forward = rotateToSmallest(boundary);
  const reverse = rotateToSmallest([...boundary].reverse());
  return compareBoundaries(forward, reverse) <= 0 ? forward : reverse;
}

function cellKey(pair: [number, number], boundary: string[]): string {
  // The same 2m-gon is found from each boundary vertex. Sorting the boundary
  // gives a coset key without treating a different starting point as new data.
  const sortedBoundary = [...boundary].sort();
  return `${pair[0]}-${pair[1]}:${sortedBoundary.join("|")}`;
}

function traceBoundary(
  start: string,
  pair: [number, number],
  m: number,
  adjacency: Map<string, Map<number, string>>,
): string[] | undefined {
  const boundary = [start];
  let current = start;

  for (let step = 0; step < 2 * m; step += 1) {
    const generator = step % 2 === 0 ? pair[0] : pair[1];
    const next = adjacency.get(current)?.get(generator);

    if (next === undefined) {
      return undefined;
    }

    if (step === 2 * m - 1) {
      return next === start ? boundary : undefined;
    }

    boundary.push(next);
    current = next;
  }

  return undefined;
}

/**
 * Finds complete rank-two Davis cells in the visible finite ball.
 *
 * A finite pair with Coxeter entry m contributes a 2m-gon for each visible
 * coset of <s_i, s_j>. If the radius cutoff clips the boundary, the function
 * reports that fact and leaves the cell unfilled; filling a clipped polygon
 * would invent incidence that is not present in the ball.
 */
export function computeRankTwoDavisCells(
  ball: GeneratedCayleyBall,
  input: unknown,
): RankTwoDavisCellResult {
  const system = parseCoxeterSystemInput(input);
  const adjacency = edgeAdjacency(ball.edges);
  const nodeIds = ball.nodes.map((node) => node.id).sort();
  const cells = new Map<string, DavisTwoCell>();
  const clippedPairs = new Set<string>();

  for (const [i, j, m] of finiteRankTwoPairs(system)) {
    const pair: [number, number] = [i, j];

    for (const nodeId of nodeIds) {
      const boundary = traceBoundary(nodeId, pair, m, adjacency);

      if (boundary === undefined) {
        clippedPairs.add(`${i}-${j}`);
        continue;
      }

      const canonical = canonicalBoundary(boundary);
      const key = cellKey(pair, canonical);

      if (!cells.has(key)) {
        const anchor = canonical[0];
        cells.set(key, {
          id: `cell:${i}-${j}:${anchor}`,
          generatorPair: pair,
          m,
          boundaryNodeIds: canonical,
        });
      }
    }
  }

  const warnings = [...clippedPairs].map((pair) => {
    const [i, j] = pair.split("-");
    return `Some rank-two Davis cells for generator pair (${i}, ${j}) are clipped by the current ball or graph caps and were not filled.`;
  });

  return {
    cells: [...cells.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    warnings,
  };
}
