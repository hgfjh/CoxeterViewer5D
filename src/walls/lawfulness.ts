import type { BarXCompressedComplex } from "../compression/types";
import {
  compareIds,
  multiplySigns,
  normalizeBoundary,
  validateBarXReferences,
} from "./internal";
import type {
  LawfulBoundaryStep,
  LawfulCellEvaluation,
  LawfulSubcomplexEvaluation,
  OrientationSign,
  PositiveBoundaryPath,
  WallCoorientation,
} from "./types";

/**
 * Keep the full 1-skeleton and exactly those polygons whose directed boundary
 * is the union of two positive paths from one source to one sink. On a cyclic
 * sign word this is equivalent to having exactly two sign transitions.
 */
export function evaluateLawfulSubcomplex(
  barX: BarXCompressedComplex,
  coorientation: WallCoorientation,
): LawfulSubcomplexEvaluation {
  validateBarXReferences(barX);
  const errors = [...coorientation.errors];
  const cells: LawfulCellEvaluation[] = [];

  for (const cell of [...barX.relationCells].sort((left, right) =>
    compareIds(left.id, right.id),
  )) {
    const boundary = normalizeBoundary(cell);
    const missingEdges = boundary
      .map((occurrence) => occurrence.edgeId)
      .filter((edgeId) => coorientation.edgeDirections[edgeId] === undefined);
    if (missingEdges.length > 0) {
      errors.push(
        `Cell ${cell.id} has no coorientation for edges ${[
          ...new Set(missingEdges),
        ]
          .sort(compareIds)
          .join(", ")}.`,
      );
      cells.push({
        cellId: cell.id,
        lawful: false,
        transitionCount: 0,
        boundarySigns: [],
        positivePaths: [],
      });
      continue;
    }

    const signs = boundary.map((occurrence) =>
      multiplySigns(
        coorientation.edgeDirections[occurrence.edgeId],
        occurrence.traversal,
      ),
    );
    const transitionCount = countCyclicTransitions(signs);
    if (transitionCount !== 2) {
      cells.push({
        cellId: cell.id,
        lawful: false,
        transitionCount,
        boundarySigns: signs,
        positivePaths: [],
      });
      continue;
    }

    const sourceIndex = findTransition(signs, -1, 1);
    const sinkIndex = findTransition(signs, 1, -1);
    if (sourceIndex < 0 || sinkIndex < 0) {
      errors.push(`Cell ${cell.id} has inconsistent transition data.`);
      cells.push({
        cellId: cell.id,
        lawful: false,
        transitionCount,
        boundarySigns: signs,
        positivePaths: [],
      });
      continue;
    }

    const sourceVertexId = boundary[sourceIndex].sourceVertexId;
    const sinkVertexId = boundary[sinkIndex].sourceVertexId;
    const positivePaths = buildPositivePaths(
      boundary,
      signs,
      sourceIndex,
      sinkIndex,
      sourceVertexId,
      sinkVertexId,
    );
    cells.push({
      cellId: cell.id,
      lawful: true,
      transitionCount,
      boundarySigns: signs,
      sourceVertexId,
      sinkVertexId,
      positivePaths,
    });
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    cells,
    retainedCellIds: cells
      .filter((cell) => cell.lawful)
      .map((cell) => cell.cellId),
    discardedCellIds: cells
      .filter((cell) => !cell.lawful)
      .map((cell) => cell.cellId),
    retainedEdgeIds: barX.geometricEdges
      .map((edge) => edge.id)
      .sort(compareIds),
    retainedVertexIds: barX.vertices
      .map((vertex) => vertex.id)
      .sort(compareIds),
  };
}

export function countCyclicTransitions(
  signs: readonly OrientationSign[],
): number {
  if (signs.length === 0) return 0;
  let transitions = 0;
  for (let index = 0; index < signs.length; index += 1) {
    if (signs[index] !== signs[(index + 1) % signs.length]) transitions += 1;
  }
  return transitions;
}

function findTransition(
  signs: readonly OrientationSign[],
  previous: OrientationSign,
  current: OrientationSign,
): number {
  for (let index = 0; index < signs.length; index += 1) {
    const previousIndex = (index - 1 + signs.length) % signs.length;
    if (signs[previousIndex] === previous && signs[index] === current) {
      return index;
    }
  }
  return -1;
}

function buildPositivePaths(
  boundary: ReturnType<typeof normalizeBoundary>,
  signs: OrientationSign[],
  sourceIndex: number,
  sinkIndex: number,
  sourceVertexId: string,
  sinkVertexId: string,
): PositiveBoundaryPath[] {
  const clockwise: LawfulBoundaryStep[] = [];
  let index = sourceIndex;
  while (index !== sinkIndex) {
    const occurrence = boundary[index];
    if (signs[index] !== 1) break;
    clockwise.push({
      boundaryIndex: occurrence.boundaryIndex,
      edgeId: occurrence.edgeId,
      generator: occurrence.generator,
      fromVertexId: occurrence.sourceVertexId,
      toVertexId: occurrence.targetVertexId,
      traversal: occurrence.traversal,
      directionAlongBoundary: 1,
    });
    index = (index + 1) % boundary.length;
  }

  const counterclockwise: LawfulBoundaryStep[] = [];
  index = (sourceIndex - 1 + boundary.length) % boundary.length;
  while (index !== (sinkIndex - 1 + boundary.length) % boundary.length) {
    const occurrence = boundary[index];
    if (signs[index] !== -1) break;
    counterclockwise.push({
      boundaryIndex: occurrence.boundaryIndex,
      edgeId: occurrence.edgeId,
      generator: occurrence.generator,
      fromVertexId: occurrence.targetVertexId,
      toVertexId: occurrence.sourceVertexId,
      traversal: occurrence.traversal,
      directionAlongBoundary: -1,
    });
    index = (index - 1 + boundary.length) % boundary.length;
  }
  const finalOccurrence = boundary[index];
  if (signs[index] === -1) {
    counterclockwise.push({
      boundaryIndex: finalOccurrence.boundaryIndex,
      edgeId: finalOccurrence.edgeId,
      generator: finalOccurrence.generator,
      fromVertexId: finalOccurrence.targetVertexId,
      toVertexId: finalOccurrence.sourceVertexId,
      traversal: finalOccurrence.traversal,
      directionAlongBoundary: -1,
    });
  }

  return [
    {
      id: "clockwise",
      sourceVertexId,
      sinkVertexId,
      steps: clockwise,
    },
    {
      id: "counterclockwise",
      sourceVertexId,
      sinkVertexId,
      steps: counterclockwise,
    },
  ];
}
