import type {
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
  const higherCells = new Map<string, DavisHigherCell>();
  const warnings: string[] = [];
  const higherRankSubsets = sphericalSubsets.filter((entry) => entry.rank >= 3);
  const index = buildBallIndex(ball);
  const slots = index.nodeIds.length;
  // Generation stamps replace the per-component Sets.
  const inComponent = new Uint32Array(slots);
  const visited = new Uint32Array(slots);
  let stamp = 0;

  for (const subset of higherRankSubsets) {
    const allowed = [...new Set(subset.generators)];
    stamp += 1;
    const visitStamp = stamp;
    for (let start = 0; start < ball.nodes.length; start += 1) {
      if (visited[start] === visitStamp) continue;
      stamp += 1;
      const componentStamp = stamp;
      const members = restrictedComponent(
        start,
        allowed,
        index,
        inComponent,
        componentStamp,
      );
      for (const member of members) visited[member] = visitStamp;
      if (members.length <= subset.rank) continue;
      if (
        !componentIsClosed(members, allowed, index, inComponent, componentStamp)
      ) {
        continue;
      }

      // Node ids in default (UTF-16) string order, as before.
      const component = members.map((member) => index.nodeIds[member]).sort();
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
        const representative = index.nodeById.get(component[0]);
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
            edgeIds: restrictedEdgeIds(
              members,
              allowed,
              ball,
              index,
              inComponent,
              componentStamp,
            ),
            rankTwoCellIds: incidentRankTwoCellIds(
              members,
              allowed,
              ball,
              index,
              inComponent,
              componentStamp,
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

/**
 * Integer-indexed view of the ball: the neighbour of each node along each
 * generator, and the edges and rank-two cells incident to each node.
 * Per-coset incidence then touches only the coset's own nodes instead of
 * scanning every edge and cell of the ball once per coset.
 */
interface BallIndex {
  /** Ball nodes first, then any edge endpoint that is not a ball node. */
  nodeIds: string[];
  slotOf: Map<string, number>;
  nodeById: Map<string, GeneratedCayleyBall["nodes"][number]>;
  /** neighbor[slot * generatorSlots + generator], or -1. */
  neighbor: Int32Array;
  generatorSlots: number;
  incidentEdges: number[][];
  incidentCells: number[][];
}

function buildBallIndex(ball: GeneratedCayleyBall): BallIndex {
  const nodeIds = ball.nodes.map((node) => node.id);
  const slotOf = new Map<string, number>();
  nodeIds.forEach((id, slot) => {
    if (!slotOf.has(id)) slotOf.set(id, slot);
  });
  for (const edge of ball.edges) {
    for (const id of [edge.source, edge.target]) {
      if (!slotOf.has(id)) {
        slotOf.set(id, nodeIds.length);
        nodeIds.push(id);
      }
    }
  }
  let generatorSlots = 1;
  for (const edge of ball.edges) {
    generatorSlots = Math.max(generatorSlots, edge.generator + 1);
  }
  const neighbor = new Int32Array(nodeIds.length * generatorSlots).fill(-1);
  const incidentEdges: number[][] = nodeIds.map(() => []);
  ball.edges.forEach((edge, edgeIndex) => {
    const source = slotOf.get(edge.source)!;
    const target = slotOf.get(edge.target)!;
    // Later edges overwrite earlier ones, matching the former Map.set.
    neighbor[source * generatorSlots + edge.generator] = target;
    neighbor[target * generatorSlots + edge.generator] = source;
    incidentEdges[source].push(edgeIndex);
    if (target !== source) incidentEdges[target].push(edgeIndex);
  });
  const incidentCells: number[][] = nodeIds.map(() => []);
  ball.twoCells.forEach((cell, cellIndex) => {
    const seen = new Set<number>();
    for (const id of cell.boundaryNodeIds) {
      const slot = slotOf.get(id);
      if (slot !== undefined && !seen.has(slot)) {
        seen.add(slot);
        incidentCells[slot].push(cellIndex);
      }
    }
  });
  return {
    nodeIds,
    slotOf,
    nodeById: new Map(ball.nodes.map((node) => [node.id, node])),
    neighbor,
    generatorSlots,
    incidentEdges,
    incidentCells,
  };
}

function neighborOf(index: BallIndex, slot: number, generator: number): number {
  return generator >= 0 && generator < index.generatorSlots
    ? index.neighbor[slot * index.generatorSlots + generator]
    : -1;
}

function inCurrentComponent(
  index: BallIndex,
  inComponent: Uint32Array,
  stamp: number,
  id: string,
): boolean {
  const slot = index.slotOf.get(id);
  return slot !== undefined && inComponent[slot] === stamp;
}

function restrictedComponent(
  start: number,
  allowed: readonly number[],
  index: BallIndex,
  inComponent: Uint32Array,
  stamp: number,
): number[] {
  const queue = [start];
  inComponent[start] = stamp;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const generator of allowed) {
      const next = neighborOf(index, current, generator);
      if (next >= 0 && inComponent[next] !== stamp) {
        inComponent[next] = stamp;
        queue.push(next);
      }
    }
  }
  return queue;
}

function componentIsClosed(
  members: readonly number[],
  allowed: readonly number[],
  index: BallIndex,
  inComponent: Uint32Array,
  stamp: number,
): boolean {
  for (const member of members) {
    for (const generator of allowed) {
      const next = neighborOf(index, member, generator);
      if (next < 0 || inComponent[next] !== stamp) return false;
    }
  }
  return true;
}

function restrictedEdgeIds(
  members: readonly number[],
  allowed: readonly number[],
  ball: GeneratedCayleyBall,
  index: BallIndex,
  inComponent: Uint32Array,
  stamp: number,
): string[] {
  const allowedSet = new Set(allowed);
  const seen = new Set<number>();
  const ids: string[] = [];
  for (const member of members) {
    for (const edgeIndex of index.incidentEdges[member]) {
      if (seen.has(edgeIndex)) continue;
      seen.add(edgeIndex);
      const edge = ball.edges[edgeIndex];
      if (
        allowedSet.has(edge.generator) &&
        inCurrentComponent(index, inComponent, stamp, edge.source) &&
        inCurrentComponent(index, inComponent, stamp, edge.target)
      ) {
        ids.push(edge.id);
      }
    }
  }
  return ids.sort();
}

function incidentRankTwoCellIds(
  members: readonly number[],
  allowed: readonly number[],
  ball: GeneratedCayleyBall,
  index: BallIndex,
  inComponent: Uint32Array,
  stamp: number,
): string[] {
  const allowedSet = new Set(allowed);
  const seen = new Set<number>();
  const ids: string[] = [];
  for (const member of members) {
    for (const cellIndex of index.incidentCells[member]) {
      if (seen.has(cellIndex)) continue;
      seen.add(cellIndex);
      const cell = ball.twoCells[cellIndex];
      if (
        allowedSet.has(cell.generatorPair[0]) &&
        allowedSet.has(cell.generatorPair[1]) &&
        cell.boundaryNodeIds.every((id) =>
          inCurrentComponent(index, inComponent, stamp, id),
        )
      ) {
        ids.push(cell.id);
      }
    }
  }
  return ids.sort();
}
