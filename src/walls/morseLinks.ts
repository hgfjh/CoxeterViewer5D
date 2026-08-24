import type {
  BarXCompressedComplex,
  BoundaryOccurrence,
} from "../compression/types";
import {
  compareIds,
  multiplySigns,
  normalizeBoundary,
  validateBarXReferences,
} from "./internal";
import { evaluateLawfulSubcomplex } from "./lawfulness";
import type {
  DirectedMorseLink,
  LawfulSubcomplexEvaluation,
  MorseLinkCorner,
  MorseLinkVertex,
  MorseLinksResult,
  OrientationSign,
  WallCoorientation,
} from "./types";

/**
 * Derive the paper's ascending and descending links in bar X.
 *
 * A link vertex is classified by its incident edge. A link edge (a polygon
 * corner) is ascending only when every wall crossing that polygon is oriented
 * away from the corner; this is stronger than checking its two endpoint
 * arrows. The lawful subcomplex is formed only after these links are checked.
 */
export function deriveMorseLinks(
  barX: BarXCompressedComplex,
  coorientation: WallCoorientation,
  lawfulSubcomplex: LawfulSubcomplexEvaluation = evaluateLawfulSubcomplex(
    barX,
    coorientation,
  ),
): MorseLinksResult {
  validateBarXReferences(barX);
  const errors = [...lawfulSubcomplex.errors];
  const edgeById = new Map(
    barX.geometricEdges.map((edge) => [edge.id, edge] as const),
  );
  const ascendingByVertex = new Map<string, MorseLinkVertex[]>();
  const descendingByVertex = new Map<string, MorseLinkVertex[]>();
  for (const vertex of barX.vertices) {
    ascendingByVertex.set(vertex.id, []);
    descendingByVertex.set(vertex.id, []);
  }

  for (const edge of barX.geometricEdges) {
    const direction = coorientation.edgeDirections[edge.id];
    if (direction === undefined) {
      errors.push(`Edge ${edge.id} has no coorientation.`);
      continue;
    }
    const sourceFeature = makeLinkVertex(
      edge.id,
      edge.generator,
      edge.sourceVertexId,
      "source",
    );
    const targetFeature = makeLinkVertex(
      edge.id,
      edge.generator,
      edge.targetVertexId,
      "target",
    );
    addClassifiedVertex(
      sourceFeature,
      direction === 1,
      ascendingByVertex,
      descendingByVertex,
    );
    addClassifiedVertex(
      targetFeature,
      direction === -1,
      ascendingByVertex,
      descendingByVertex,
    );
  }

  const ascendingCorners = new Map<string, MorseLinkCorner[]>();
  const descendingCorners = new Map<string, MorseLinkCorner[]>();
  for (const vertex of barX.vertices) {
    ascendingCorners.set(vertex.id, []);
    descendingCorners.set(vertex.id, []);
  }

  const retainedCellIds = new Set(lawfulSubcomplex.retainedCellIds);
  for (const cell of barX.relationCells) {
    // Bestvina--Brady is applied to the lawful subcomplex. A discarded cell
    // cannot contribute a corner that connects one of its directed links.
    if (!retainedCellIds.has(cell.id)) continue;
    const boundary = normalizeBoundary(cell);
    const half = boundary.length / 2;
    for (let cornerIndex = 0; cornerIndex < boundary.length; cornerIndex += 1) {
      const outgoing = boundary[cornerIndex];
      const incoming =
        boundary[(cornerIndex - 1 + boundary.length) % boundary.length];
      const vertexId = outgoing.sourceVertexId;
      const incomingEdge = edgeById.get(incoming.edgeId);
      const outgoingEdge = edgeById.get(outgoing.edgeId);
      if (!incomingEdge || !outgoingEdge) continue;
      const firstId = linkVertexId(
        incoming.edgeId,
        boundaryTargetEnd(incoming),
      );
      const secondId = linkVertexId(
        outgoing.edgeId,
        boundarySourceEnd(outgoing),
      );
      const corner: MorseLinkCorner = {
        id: `link-corner:${cell.id}:${cornerIndex}`,
        vertexId,
        cellId: cell.id,
        cornerIndex,
        firstLinkVertexId: firstId,
        secondLinkVertexId: secondId,
      };
      const wallDirections = Array.from({ length: half }, (_unused, index) =>
        wallPointsAwayFromCorner(
          boundary,
          coorientation.edgeDirections,
          index,
          cornerIndex,
        ),
      );
      if (wallDirections.every(Boolean)) {
        ascendingCorners.get(vertexId)?.push(corner);
      }
      if (wallDirections.every((away) => !away)) {
        descendingCorners.get(vertexId)?.push(corner);
      }
    }
  }

  const vertices = barX.vertices
    .map((vertex) => ({
      vertexId: vertex.id,
      ascending: buildDirectedLink(
        "ascending",
        ascendingByVertex.get(vertex.id) ?? [],
        ascendingCorners.get(vertex.id) ?? [],
      ),
      descending: buildDirectedLink(
        "descending",
        descendingByVertex.get(vertex.id) ?? [],
        descendingCorners.get(vertex.id) ?? [],
      ),
    }))
    .sort((left, right) => compareIds(left.vertexId, right.vertexId));

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    vertices,
    allAscendingNonempty: vertices.every((vertex) => vertex.ascending.nonempty),
    allDescendingNonempty: vertices.every(
      (vertex) => vertex.descending.nonempty,
    ),
    allAscendingConnected: vertices.every(
      (vertex) => vertex.ascending.connected,
    ),
    allDescendingConnected: vertices.every(
      (vertex) => vertex.descending.connected,
    ),
  };
}

function wallPointsAwayFromCorner(
  boundary: BoundaryOccurrence[],
  edgeDirections: Record<string, OrientationSign>,
  firstBoundaryIndex: number,
  cornerIndex: number,
): boolean {
  const first = boundary[firstBoundaryIndex];
  const direction = edgeDirections[first.edgeId];
  if (direction === undefined) return false;
  const signAlongBoundary = multiplySigns(direction, first.traversal);
  const half = boundary.length / 2;
  const cyclicDistance =
    (cornerIndex - firstBoundaryIndex + boundary.length) % boundary.length;
  const cornerIsInForwardHalf = cyclicDistance >= 1 && cyclicDistance <= half;

  // If the first dual edge points with the boundary, the forward half is the
  // destination side of the wall. The wall points away precisely at corners
  // on the opposite side. Reversing the wall swaps those two half-polygons.
  return cornerIsInForwardHalf
    ? signAlongBoundary === -1
    : signAlongBoundary === 1;
}

function makeLinkVertex(
  edgeId: string,
  generator: number,
  vertexId: string,
  edgeEnd: "source" | "target",
): MorseLinkVertex {
  return {
    id: linkVertexId(edgeId, edgeEnd),
    vertexId,
    edgeId,
    edgeEnd,
    generator,
  };
}

function linkVertexId(edgeId: string, edgeEnd: "source" | "target"): string {
  return `link-vertex:${edgeId}:${edgeEnd}`;
}

function addClassifiedVertex(
  vertex: MorseLinkVertex,
  ascending: boolean,
  ascendingByVertex: Map<string, MorseLinkVertex[]>,
  descendingByVertex: Map<string, MorseLinkVertex[]>,
): void {
  const target = ascending ? ascendingByVertex : descendingByVertex;
  target.get(vertex.vertexId)?.push(vertex);
}

function boundarySourceEnd(
  occurrence: BoundaryOccurrence,
): "source" | "target" {
  return occurrence.traversal === 1 ? "source" : "target";
}

function boundaryTargetEnd(
  occurrence: BoundaryOccurrence,
): "source" | "target" {
  return occurrence.traversal === 1 ? "target" : "source";
}

function buildDirectedLink(
  kind: "ascending" | "descending",
  vertices: MorseLinkVertex[],
  corners: MorseLinkCorner[],
): DirectedMorseLink {
  const sortedVertices = [...vertices].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const sortedCorners = [...corners].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const components = connectedComponents(sortedVertices, sortedCorners);
  return {
    kind,
    vertices: sortedVertices,
    corners: sortedCorners,
    components,
    nonempty: sortedVertices.length > 0,
    connected: sortedVertices.length > 0 && components.length === 1,
  };
}

function connectedComponents(
  vertices: MorseLinkVertex[],
  corners: MorseLinkCorner[],
): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const vertex of vertices) adjacency.set(vertex.id, new Set());
  for (const corner of corners) {
    if (
      !adjacency.has(corner.firstLinkVertexId) ||
      !adjacency.has(corner.secondLinkVertexId)
    ) {
      continue;
    }
    adjacency.get(corner.firstLinkVertexId)?.add(corner.secondLinkVertexId);
    adjacency.get(corner.secondLinkVertexId)?.add(corner.firstLinkVertexId);
  }

  const components: string[][] = [];
  const visited = new Set<string>();
  for (const start of [...adjacency.keys()].sort(compareIds)) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    visited.add(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      for (const neighbor of [...(adjacency.get(current) ?? [])].sort(
        compareIds,
      )) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component.sort(compareIds));
  }
  return components;
}

export function satisfiesMorseLinkConstraint(
  links: MorseLinksResult,
  constraint:
    | {
        requireAscendingNonempty?: boolean;
        requireDescendingNonempty?: boolean;
        requireAscendingConnected?: boolean;
        requireDescendingConnected?: boolean;
      }
    | undefined,
): boolean {
  if (!constraint) return true;
  if (constraint.requireAscendingNonempty && !links.allAscendingNonempty) {
    return false;
  }
  if (constraint.requireDescendingNonempty && !links.allDescendingNonempty) {
    return false;
  }
  if (constraint.requireAscendingConnected && !links.allAscendingConnected) {
    return false;
  }
  if (constraint.requireDescendingConnected && !links.allDescendingConnected) {
    return false;
  }
  return true;
}

export function directionAwayFromVertex(
  direction: OrientationSign,
  edgeEnd: "source" | "target",
): boolean {
  return edgeEnd === "source" ? direction === 1 : direction === -1;
}
