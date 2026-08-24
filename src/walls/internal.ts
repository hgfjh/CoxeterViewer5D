import type {
  BarXCompressedComplex,
  BarXRelationCell,
  BoundaryOccurrence,
} from "../compression/types";
import type { OrientationSign } from "./types";

export function compareIds(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

export function multiplySigns(
  left: OrientationSign,
  right: OrientationSign,
): OrientationSign {
  return (left * right) as OrientationSign;
}

export function negateSign(sign: OrientationSign): OrientationSign {
  return (sign === 1 ? -1 : 1) as OrientationSign;
}

export function normalizeBoundary(
  cell: BarXRelationCell,
): BoundaryOccurrence[] {
  const boundary = [...cell.boundaryOccurrences].sort(
    (left, right) => left.boundaryIndex - right.boundaryIndex,
  );
  const expectedLength = 2 * cell.m;

  if (!Number.isInteger(cell.m) || cell.m < 1) {
    throw new Error(`Cell ${cell.id} has invalid relation order m=${cell.m}.`);
  }
  if (boundary.length !== expectedLength) {
    throw new Error(
      `Cell ${cell.id} has ${boundary.length} boundary occurrences; expected ${expectedLength}.`,
    );
  }

  for (let index = 0; index < boundary.length; index += 1) {
    const occurrence = boundary[index];
    if (occurrence.boundaryIndex !== index) {
      throw new Error(
        `Cell ${cell.id} boundary indices must be exactly 0..${boundary.length - 1}.`,
      );
    }
    const next = boundary[(index + 1) % boundary.length];
    if (occurrence.targetVertexId !== next.sourceVertexId) {
      throw new Error(
        `Cell ${cell.id} boundary is not closed between indices ${index} and ${next.boundaryIndex}.`,
      );
    }
  }

  return boundary;
}

export function validateBarXReferences(barX: BarXCompressedComplex): void {
  const vertexIds = new Set(barX.vertices.map((vertex) => vertex.id));
  const edgeIds = new Set<string>();

  for (const edge of barX.geometricEdges) {
    if (edgeIds.has(edge.id)) {
      throw new Error(`bar X contains duplicate edge id ${edge.id}.`);
    }
    edgeIds.add(edge.id);
    if (!vertexIds.has(edge.sourceVertexId)) {
      throw new Error(
        `Edge ${edge.id} refers to unknown source vertex ${edge.sourceVertexId}.`,
      );
    }
    if (!vertexIds.has(edge.targetVertexId)) {
      throw new Error(
        `Edge ${edge.id} refers to unknown target vertex ${edge.targetVertexId}.`,
      );
    }
  }

  const cellIds = new Set<string>();
  for (const cell of barX.relationCells) {
    if (cellIds.has(cell.id)) {
      throw new Error(`bar X contains duplicate cell id ${cell.id}.`);
    }
    cellIds.add(cell.id);
    const boundary = normalizeBoundary(cell);
    for (const occurrence of boundary) {
      if (!edgeIds.has(occurrence.edgeId)) {
        throw new Error(
          `Cell ${cell.id} refers to unknown edge ${occurrence.edgeId}.`,
        );
      }
      if (
        !vertexIds.has(occurrence.sourceVertexId) ||
        !vertexIds.has(occurrence.targetVertexId)
      ) {
        throw new Error(
          `Cell ${cell.id} occurrence ${occurrence.boundaryIndex} refers to an unknown vertex.`,
        );
      }
    }
  }
}

export class DisjointSet {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();

  constructor(ids: Iterable<string>) {
    for (const id of ids) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (parent === undefined) {
      throw new Error(`Unknown disjoint-set element ${id}.`);
    }
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(left: string, right: string): void {
    let leftRoot = this.find(left);
    let rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;

    const leftRank = this.rank.get(leftRoot) ?? 0;
    const rightRank = this.rank.get(rightRoot) ?? 0;
    if (
      leftRank < rightRank ||
      (leftRank === rightRank && compareIds(leftRoot, rightRoot) > 0)
    ) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    this.parent.set(rightRoot, leftRoot);
    if (leftRank === rightRank) this.rank.set(leftRoot, leftRank + 1);
  }
}

export function finiteNonnegativeWeight(
  cellId: string,
  weights: Record<string, number> | undefined,
): number {
  const weight = weights?.[cellId] ?? 1;
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error(
      `Cell weight for ${cellId} must be a finite nonnegative number.`,
    );
  }
  return weight;
}
