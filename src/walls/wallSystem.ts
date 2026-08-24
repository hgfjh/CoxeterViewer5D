import type {
  BarXCompressedComplex,
  BoundaryOccurrence,
} from "../compression/types";
import {
  compareIds,
  DisjointSet,
  multiplySigns,
  negateSign,
  normalizeBoundary,
  validateBarXReferences,
} from "./internal";
import type {
  OrientationSign,
  Wall,
  WallAdjacencyFeature,
  WallCrossingSegment,
  WallEmbeddednessWitness,
  WallLinkEdgeFeature,
  WallParityConstraintWitness,
  WallSelfOsculationWitness,
  WallSystem,
  WallSystemDiagnostics,
  WallTwoSidednessWitness,
} from "./types";

interface PendingSegment {
  id: string;
  cellId: string;
  first: BoundaryOccurrence;
  second: BoundaryOccurrence;
  orientationParity: OrientationSign;
}

interface ParentConstraint {
  parentEdgeId: string;
  segment: WallCrossingSegment;
}

interface TreePathStep extends ParentConstraint {
  childEdgeId: string;
}

/**
 * Build the walls of bar X from the transitive closure of opposite sides.
 * This is the abstract-wall construction in Section 2.2; no geometry or
 * drawing coordinates enter the equivalence relation.
 */
export function findWallSystem(barX: BarXCompressedComplex): WallSystem {
  validateBarXReferences(barX);
  const edgeIds = barX.geometricEdges.map((edge) => edge.id).sort(compareIds);
  const disjointSet = new DisjointSet(edgeIds);
  const pendingSegments: PendingSegment[] = [];

  for (const cell of [...barX.relationCells].sort((left, right) =>
    compareIds(left.id, right.id),
  )) {
    const boundary = normalizeBoundary(cell);
    const half = boundary.length / 2;
    for (let index = 0; index < half; index += 1) {
      const first = boundary[index];
      const second = boundary[index + half];
      disjointSet.union(first.edgeId, second.edgeId);
      pendingSegments.push({
        id: `wall-segment:${cell.id}:${index}`,
        cellId: cell.id,
        first,
        second,
        // Opposite boundary traversals point in opposite directions around
        // the polygon. This signed relation is what detects one-sided walls.
        orientationParity: negateSign(
          multiplySigns(first.traversal, second.traversal),
        ),
      });
    }
  }

  const edgeGroups = new Map<string, string[]>();
  for (const edgeId of edgeIds) {
    const root = disjointSet.find(edgeId);
    const group = edgeGroups.get(root) ?? [];
    group.push(edgeId);
    edgeGroups.set(root, group);
  }

  const canonicalToWallId = new Map<string, string>();
  for (const edgeGroup of edgeGroups.values()) {
    edgeGroup.sort(compareIds);
    canonicalToWallId.set(edgeGroup[0], `wall:${edgeGroup[0]}`);
  }

  const edgeToWallId: Record<string, string> = {};
  for (const edgeGroup of edgeGroups.values()) {
    const wallId = canonicalToWallId.get(edgeGroup[0]);
    if (!wallId) throw new Error("Internal wall canonicalization failure.");
    for (const edgeId of edgeGroup) edgeToWallId[edgeId] = wallId;
  }

  const crossingSegments: WallCrossingSegment[] = pendingSegments
    .map((segment) => ({
      ...segment,
      wallId: edgeToWallId[segment.first.edgeId],
      first: endpointFromOccurrence(segment.first),
      second: endpointFromOccurrence(segment.second),
    }))
    .sort((left, right) => compareIds(left.id, right.id));

  const walls: Wall[] = [...edgeGroups.values()]
    .map((edgeGroup) => {
      const canonicalEdgeId = edgeGroup[0];
      const id = canonicalToWallId.get(canonicalEdgeId);
      if (!id) throw new Error("Internal wall id failure.");
      const segments = crossingSegments.filter(
        (segment) => segment.wallId === id,
      );
      return {
        id,
        canonicalEdgeId,
        edgeIds: [...edgeGroup],
        crossingSegmentIds: segments.map((segment) => segment.id),
        cellIds: [...new Set(segments.map((segment) => segment.cellId))].sort(
          compareIds,
        ),
        twoSided: true,
        edgeOrientationParity: {},
      };
    })
    .sort((left, right) => compareIds(left.id, right.id));

  const twoSidednessWitnesses: WallTwoSidednessWitness[] = [];
  for (const wall of walls) {
    const result = solveWallOrientationParity(wall, crossingSegments);
    wall.edgeOrientationParity = result.edgeParity;
    wall.twoSided = result.witnesses.length === 0;
    twoSidednessWitnesses.push(...result.witnesses);
  }

  const embeddednessWitnesses = diagnoseEmbeddedness(crossingSegments);
  const selfOsculationWitnesses = diagnoseSelfOsculation(
    barX,
    walls,
    crossingSegments,
  );
  const diagnostics: WallSystemDiagnostics = {
    embedded: embeddednessWitnesses.length === 0,
    twoSided: twoSidednessWitnesses.length === 0,
    selfOsculationFree: selfOsculationWitnesses.length === 0,
    embeddednessWitnesses,
    twoSidednessWitnesses,
    selfOsculationWitnesses,
  };

  return {
    sourceComplexName: barX.name,
    walls,
    crossingSegments,
    edgeToWallId,
    diagnostics,
  };
}

export function diagnoseWallSystem(
  barX: BarXCompressedComplex,
  wallSystem: WallSystem = findWallSystem(barX),
): WallSystemDiagnostics {
  const embeddednessWitnesses = diagnoseEmbeddedness(
    wallSystem.crossingSegments,
  );
  const twoSidednessWitnesses = wallSystem.walls.flatMap(
    (wall) =>
      solveWallOrientationParity(wall, wallSystem.crossingSegments).witnesses,
  );
  const selfOsculationWitnesses = diagnoseSelfOsculation(
    barX,
    wallSystem.walls,
    wallSystem.crossingSegments,
  );
  return {
    embedded: embeddednessWitnesses.length === 0,
    twoSided: twoSidednessWitnesses.length === 0,
    selfOsculationFree: selfOsculationWitnesses.length === 0,
    embeddednessWitnesses,
    twoSidednessWitnesses,
    selfOsculationWitnesses,
  };
}

function endpointFromOccurrence(occurrence: BoundaryOccurrence) {
  return {
    edgeId: occurrence.edgeId,
    boundaryIndex: occurrence.boundaryIndex,
    traversal: occurrence.traversal,
    sourceVertexId: occurrence.sourceVertexId,
    targetVertexId: occurrence.targetVertexId,
    generator: occurrence.generator,
  };
}

function diagnoseEmbeddedness(
  segments: WallCrossingSegment[],
): WallEmbeddednessWitness[] {
  const witnesses: WallEmbeddednessWitness[] = [];
  const byWallCell = new Map<string, WallCrossingSegment[]>();

  for (const segment of segments) {
    const key = `${segment.wallId}\u0000${segment.cellId}`;
    const group = byWallCell.get(key) ?? [];
    group.push(segment);
    byWallCell.set(key, group);

    if (segment.first.edgeId === segment.second.edgeId) {
      witnesses.push({
        kind: "opposite-occurrence-reuses-edge",
        wallId: segment.wallId,
        cellId: segment.cellId,
        segmentIds: [segment.id],
        edgePairs: [[segment.first.edgeId, segment.second.edgeId]],
      });
    }
  }

  for (const group of byWallCell.values()) {
    if (group.length <= 1) continue;
    group.sort((left, right) => compareIds(left.id, right.id));
    witnesses.push({
      kind: "multiple-crossings-in-cell",
      wallId: group[0].wallId,
      cellId: group[0].cellId,
      segmentIds: group.map((segment) => segment.id),
      edgePairs: group.map((segment) => [
        segment.first.edgeId,
        segment.second.edgeId,
      ]),
    });
  }

  return witnesses.sort(compareEmbeddednessWitnesses);
}

function solveWallOrientationParity(
  wall: Wall,
  allSegments: WallCrossingSegment[],
): {
  edgeParity: Record<string, OrientationSign>;
  witnesses: WallTwoSidednessWitness[];
} {
  const wallEdges = new Set(wall.edgeIds);
  const segments = allSegments
    .filter((segment) => segment.wallId === wall.id)
    .sort((left, right) => compareIds(left.id, right.id));
  const incident = new Map<string, WallCrossingSegment[]>();
  for (const edgeId of wall.edgeIds) incident.set(edgeId, []);
  for (const segment of segments) {
    incident.get(segment.first.edgeId)?.push(segment);
    if (segment.second.edgeId !== segment.first.edgeId) {
      incident.get(segment.second.edgeId)?.push(segment);
    }
  }
  for (const list of incident.values()) {
    list.sort((left, right) => compareIds(left.id, right.id));
  }

  const edgeParity: Record<string, OrientationSign> = {};
  const parent = new Map<string, ParentConstraint>();
  const witnesses: WallTwoSidednessWitness[] = [];
  const witnessedSegments = new Set<string>();

  for (const root of wall.edgeIds) {
    if (edgeParity[root] !== undefined) continue;
    edgeParity[root] = 1;
    const queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const edgeId = queue[cursor];
      for (const segment of incident.get(edgeId) ?? []) {
        const otherEdgeId =
          segment.first.edgeId === edgeId
            ? segment.second.edgeId
            : segment.first.edgeId;
        if (!wallEdges.has(otherEdgeId)) continue;
        const expected = multiplySigns(
          edgeParity[edgeId],
          segment.orientationParity,
        );
        if (edgeParity[otherEdgeId] === undefined) {
          edgeParity[otherEdgeId] = expected;
          parent.set(otherEdgeId, { parentEdgeId: edgeId, segment });
          queue.push(otherEdgeId);
          continue;
        }
        if (
          edgeParity[otherEdgeId] !== expected &&
          !witnessedSegments.has(segment.id)
        ) {
          witnessedSegments.add(segment.id);
          witnesses.push({
            kind: "orientation-parity-conflict",
            wallId: wall.id,
            conflictSegmentId: segment.id,
            firstEdgeId: edgeId,
            secondEdgeId: otherEdgeId,
            expectedSecondParity: expected,
            existingSecondParity: edgeParity[otherEdgeId],
            constraintCycle: buildConstraintCycle(
              edgeId,
              otherEdgeId,
              segment,
              parent,
            ),
          });
        }
      }
    }
  }

  return { edgeParity, witnesses };
}

function buildConstraintCycle(
  firstEdgeId: string,
  secondEdgeId: string,
  conflict: WallCrossingSegment,
  parent: Map<string, ParentConstraint>,
): WallParityConstraintWitness[] {
  const firstPath = pathToRoot(firstEdgeId, parent);
  const secondPath = pathToRoot(secondEdgeId, parent);
  const secondAncestors = new Set([
    secondEdgeId,
    ...secondPath.map((step) => step.parentEdgeId),
  ]);
  const firstAncestors = [
    firstEdgeId,
    ...firstPath.map((step) => step.parentEdgeId),
  ];
  const commonAncestor =
    firstAncestors.find((edgeId) => secondAncestors.has(edgeId)) ??
    firstAncestors[firstAncestors.length - 1];
  const firstBranchEnd = firstPath.findIndex(
    (step) => step.parentEdgeId === commonAncestor,
  );
  const firstSteps =
    firstEdgeId === commonAncestor
      ? []
      : firstBranchEnd < 0
        ? firstPath
        : firstPath.slice(0, firstBranchEnd + 1);
  const secondBranchEnd = secondPath.findIndex(
    (step) => step.parentEdgeId === commonAncestor,
  );
  const secondSteps =
    secondEdgeId === commonAncestor
      ? []
      : secondBranchEnd < 0
        ? secondPath
        : secondPath.slice(0, secondBranchEnd + 1);

  return [
    ...firstSteps.map(({ segment }) => constraintWitness(segment)),
    ...secondSteps
      .slice()
      .reverse()
      .map(({ segment }) => constraintWitness(segment)),
    constraintWitness(conflict),
  ];
}

function pathToRoot(
  edgeId: string,
  parent: Map<string, ParentConstraint>,
): TreePathStep[] {
  const path: TreePathStep[] = [];
  const visited = new Set<string>();
  let current = edgeId;
  while (parent.has(current) && !visited.has(current)) {
    visited.add(current);
    const relation = parent.get(current);
    if (!relation) break;
    path.push({ childEdgeId: current, ...relation });
    current = relation.parentEdgeId;
  }
  return path;
}

function constraintWitness(
  segment: WallCrossingSegment,
): WallParityConstraintWitness {
  return {
    segmentId: segment.id,
    cellId: segment.cellId,
    firstEdgeId: segment.first.edgeId,
    secondEdgeId: segment.second.edgeId,
    parity: segment.orientationParity,
  };
}

function diagnoseSelfOsculation(
  barX: BarXCompressedComplex,
  walls: Wall[],
  segments: WallCrossingSegment[],
): WallSelfOsculationWitness[] {
  const features = new Map<string, WallAdjacencyFeature[]>();
  const edgeToWallId = new Map<string, string>();
  for (const wall of walls) {
    for (const edgeId of wall.edgeIds) edgeToWallId.set(edgeId, wall.id);
  }

  const addFeature = (
    wallId: string,
    vertexId: string,
    feature: WallAdjacencyFeature,
  ): void => {
    const key = `${wallId}\u0000${vertexId}`;
    const list = features.get(key) ?? [];
    if (!list.some((existing) => existing.id === feature.id)) {
      list.push(feature);
      features.set(key, list);
    }
  };

  for (const edge of barX.geometricEdges) {
    const wallId = edgeToWallId.get(edge.id);
    if (!wallId) continue;
    addFeature(wallId, edge.sourceVertexId, {
      kind: "link-vertex",
      id: `link-vertex:${edge.id}:source`,
      vertexId: edge.sourceVertexId,
      edgeId: edge.id,
      edgeEnd: "source",
    });
    addFeature(wallId, edge.targetVertexId, {
      kind: "link-vertex",
      id: `link-vertex:${edge.id}:target`,
      vertexId: edge.targetVertexId,
      edgeId: edge.id,
      edgeEnd: "target",
    });
  }

  const segmentsByCell = new Map<string, WallCrossingSegment[]>();
  for (const segment of segments) {
    const list = segmentsByCell.get(segment.cellId) ?? [];
    list.push(segment);
    segmentsByCell.set(segment.cellId, list);
  }

  for (const cell of barX.relationCells) {
    const boundary = normalizeBoundary(cell);
    const cellSegments = segmentsByCell.get(cell.id) ?? [];
    for (let cornerIndex = 0; cornerIndex < boundary.length; cornerIndex += 1) {
      const outgoing = boundary[cornerIndex];
      const incoming =
        boundary[(cornerIndex - 1 + boundary.length) % boundary.length];
      const vertexId = outgoing.sourceVertexId;
      const byWall = new Map<string, WallCrossingSegment[]>();
      for (const segment of cellSegments) {
        if (
          segment.first.edgeId === incoming.edgeId ||
          segment.second.edgeId === incoming.edgeId ||
          segment.first.edgeId === outgoing.edgeId ||
          segment.second.edgeId === outgoing.edgeId
        ) {
          continue;
        }
        const group = byWall.get(segment.wallId) ?? [];
        group.push(segment);
        byWall.set(segment.wallId, group);
      }
      for (const [wallId, group] of byWall) {
        const feature: WallLinkEdgeFeature = {
          kind: "link-edge",
          id: `link-edge:${cell.id}:${cornerIndex}:${wallId}`,
          vertexId,
          cellId: cell.id,
          cornerIndex,
          incomingEdgeId: incoming.edgeId,
          outgoingEdgeId: outgoing.edgeId,
          segmentIds: group.map((segment) => segment.id).sort(compareIds),
        };
        addFeature(wallId, vertexId, feature);
      }
    }
  }

  const witnesses: WallSelfOsculationWitness[] = [];
  for (const [key, adjacencyFeatures] of features) {
    if (adjacencyFeatures.length <= 1) continue;
    const separator = key.indexOf("\u0000");
    witnesses.push({
      kind: "multiple-link-adjacencies",
      wallId: key.slice(0, separator),
      vertexId: key.slice(separator + 1),
      features: adjacencyFeatures.sort((left, right) =>
        compareIds(left.id, right.id),
      ),
    });
  }
  return witnesses.sort(
    (left, right) =>
      compareIds(left.wallId, right.wallId) ||
      compareIds(left.vertexId, right.vertexId),
  );
}

function compareEmbeddednessWitnesses(
  left: WallEmbeddednessWitness,
  right: WallEmbeddednessWitness,
): number {
  return (
    compareIds(left.wallId, right.wallId) ||
    compareIds(left.cellId, right.cellId) ||
    compareIds(left.kind, right.kind)
  );
}
