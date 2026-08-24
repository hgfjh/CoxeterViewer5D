import type {
  BarXCompressedComplex,
  BoundaryOccurrence,
} from "../compression/types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  compareIds,
  normalizeBoundary,
  validateBarXReferences,
} from "../walls/internal";
import type { LawfulSubcomplexEvaluation } from "../walls/types";
import {
  addRationals,
  compareRationals,
  exactRational,
  formatExactRational,
  type ExactRational,
} from "./exactRational";

export interface LawfulMetricLinkCorner {
  id: string;
  cellId: string;
  cornerIndex: number;
  firstLinkVertexId: string;
  secondLinkVertexId: string;
  /** Interior angle of the regular 2m-gon, measured in units of pi. */
  angleOverPi: ExactRational;
}

export interface LawfulMetricShortCircuit {
  kind: "loop" | "two-edge-cycle" | "triangle";
  linkVertexIds: string[];
  cornerIds: string[];
  lengthOverPi: ExactRational;
}

export interface LawfulMetricVertexLinkCertificate {
  vertexId: string;
  linkVertexIds: string[];
  corners: LawfulMetricLinkCorner[];
  shortCircuitCount: number;
  shortCircuitWitnesses: LawfulMetricShortCircuit[];
  catOne: boolean;
}

export interface LawfulNpcAsphericityCertificate {
  schemaVersion: 1;
  kind: "lawful-npc-asphericity-certificate";
  method: "regular-euclidean-polygons-exact-metric-links";
  status: "passed" | "failed";
  sourceComplexName: string;
  retainedCellIds: string[];
  vertexLinks: LawfulMetricVertexLinkCertificate[];
  checks: {
    lawfulEvaluationValid: boolean;
    finiteConnectedComplex: boolean;
    fullOneSkeletonRetained: boolean;
    completeRegularPolygonMetric: boolean;
    everyMetricLinkCatOne: boolean;
    locallyCatZero: boolean;
    universalCoverContractible: boolean;
    aspherical: boolean;
  };
  hashes: {
    sourceComplexSha256: string;
    retainedCellSetSha256: string;
    certificateSha256: string;
  };
  errors: string[];
  sources: string[];
  nonClaims: string[];
}

interface CornerLengthGroup {
  length: ExactRational;
  cornerIds: string[];
}

const TWO = exactRational(2);
const MAX_WITNESSES_PER_VERTEX = 24;

/**
 * Certify nonpositive curvature of the actual two-dimensional lawful complex.
 * A corner of a regular 2m-gon has angle `(m-1)/m * pi`. Every such angle is
 * at least `pi/2`, so a metric-link circuit shorter than `2*pi` must be a
 * loop, a two-edge circuit, or a triangle. Enumerating those cases is both
 * complete and much cheaper than a general weighted-cycle search.
 */
export function certifyLawfulNpcAsphericity(
  barX: BarXCompressedComplex,
  lawful: LawfulSubcomplexEvaluation,
): LawfulNpcAsphericityCertificate {
  const errors: string[] = [];
  try {
    validateBarXReferences(barX);
  } catch (error) {
    errors.push(errorMessage(error));
  }

  const retainedCellIds = [...lawful.retainedCellIds].sort(compareIds);
  const retainedSet = new Set(retainedCellIds);
  const knownCellIds = new Set(barX.relationCells.map((cell) => cell.id));
  const lawfulEvaluationValid =
    lawful.valid &&
    lawful.errors.length === 0 &&
    retainedCellIds.every((cellId) => knownCellIds.has(cellId));
  if (!lawfulEvaluationValid) {
    errors.push(
      "The lawful-cell evaluation is invalid or references an unknown cell.",
    );
  }

  const fullOneSkeletonRetained =
    sameIds(
      lawful.retainedVertexIds,
      barX.vertices.map((vertex) => vertex.id),
    ) &&
    sameIds(
      lawful.retainedEdgeIds,
      barX.geometricEdges.map((edge) => edge.id),
    );
  if (!fullOneSkeletonRetained) {
    errors.push("The lawful complex does not retain the complete 1-skeleton.");
  }
  const finiteConnectedComplex =
    barX.vertices.length > 0 && isOneSkeletonConnected(barX);
  if (!finiteConnectedComplex) {
    errors.push("The retained 1-skeleton is empty or disconnected.");
  }

  const linkVerticesByBase = buildLinkVertices(barX);
  const cornersByBase = new Map<string, LawfulMetricLinkCorner[]>();
  for (const vertex of barX.vertices) cornersByBase.set(vertex.id, []);
  let completeRegularPolygonMetric = true;

  for (const cell of barX.relationCells) {
    if (!retainedSet.has(cell.id)) continue;
    if (!Number.isSafeInteger(cell.m) || cell.m < 2) {
      completeRegularPolygonMetric = false;
      errors.push(
        `Retained cell ${cell.id} has invalid relation order m=${cell.m}.`,
      );
      continue;
    }
    let boundary: BoundaryOccurrence[];
    try {
      boundary = normalizeBoundary(cell);
    } catch (error) {
      completeRegularPolygonMetric = false;
      errors.push(errorMessage(error));
      continue;
    }
    const angleOverPi = exactRational(cell.m - 1, cell.m);
    for (let cornerIndex = 0; cornerIndex < boundary.length; cornerIndex += 1) {
      const outgoing = boundary[cornerIndex];
      const incoming =
        boundary[(cornerIndex - 1 + boundary.length) % boundary.length];
      const firstLinkVertexId = linkVertexId(
        incoming.edgeId,
        boundaryTargetEnd(incoming),
      );
      const secondLinkVertexId = linkVertexId(
        outgoing.edgeId,
        boundarySourceEnd(outgoing),
      );
      const available = linkVerticesByBase.get(outgoing.sourceVertexId);
      if (
        !available?.has(firstLinkVertexId) ||
        !available.has(secondLinkVertexId)
      ) {
        completeRegularPolygonMetric = false;
        errors.push(
          `Cell ${cell.id} corner ${cornerIndex} does not match the recorded edge germs at ${outgoing.sourceVertexId}.`,
        );
        continue;
      }
      cornersByBase.get(outgoing.sourceVertexId)?.push({
        id: `metric-link-corner:${cell.id}:${cornerIndex}`,
        cellId: cell.id,
        cornerIndex,
        firstLinkVertexId,
        secondLinkVertexId,
        angleOverPi,
      });
    }
  }

  const vertexLinks = barX.vertices
    .map((vertex) =>
      certifyMetricLink(
        vertex.id,
        [...(linkVerticesByBase.get(vertex.id) ?? [])].sort(compareIds),
        [...(cornersByBase.get(vertex.id) ?? [])].sort((left, right) =>
          compareIds(left.id, right.id),
        ),
      ),
    )
    .sort((left, right) => compareIds(left.vertexId, right.vertexId));
  const everyMetricLinkCatOne =
    completeRegularPolygonMetric && vertexLinks.every((link) => link.catOne);
  if (!everyMetricLinkCatOne) {
    for (const link of vertexLinks.filter((entry) => !entry.catOne)) {
      errors.push(
        `Metric link at ${link.vertexId} has ${link.shortCircuitCount} circuit(s) shorter than 2*pi.`,
      );
    }
  }
  const locallyCatZero =
    lawfulEvaluationValid &&
    finiteConnectedComplex &&
    fullOneSkeletonRetained &&
    completeRegularPolygonMetric &&
    everyMetricLinkCatOne;
  // A finite piecewise-Euclidean complex is complete. Cartan-Hadamard then
  // makes the universal cover CAT(0), hence contractible.
  const universalCoverContractible = locallyCatZero;
  const aspherical = universalCoverContractible;

  const withoutCertificateHash = {
    schemaVersion: 1 as const,
    kind: "lawful-npc-asphericity-certificate" as const,
    method: "regular-euclidean-polygons-exact-metric-links" as const,
    status: (aspherical ? "passed" : "failed") as "passed" | "failed",
    sourceComplexName: barX.name,
    retainedCellIds,
    vertexLinks,
    checks: {
      lawfulEvaluationValid,
      finiteConnectedComplex,
      fullOneSkeletonRetained,
      completeRegularPolygonMetric,
      everyMetricLinkCatOne,
      locallyCatZero,
      universalCoverContractible,
      aspherical,
    },
    hashes: {
      sourceComplexSha256: canonicalSha256(jsonData(barX)),
      retainedCellSetSha256: canonicalSha256(retainedCellIds),
    },
    errors: uniqueSorted(errors),
    sources: [
      "Jankiewicz-Wise, Incoherent Coxeter Groups, Sections 2.1 and 2.4-2.5 (arXiv:1503.03102).",
      "Gromov link condition and Cartan-Hadamard theorem for finite piecewise-Euclidean complexes.",
    ],
    nonClaims: [
      "This certificate applies to the retained two-dimensional polygonal complex, not automatically to a higher-dimensional coface closure.",
      "It does not certify collapsibility or a locally trivial topological fibration.",
    ],
  };
  return {
    ...withoutCertificateHash,
    hashes: {
      ...withoutCertificateHash.hashes,
      certificateSha256: canonicalSha256(withoutCertificateHash),
    },
  };
}

function certifyMetricLink(
  vertexId: string,
  linkVertexIds: string[],
  corners: LawfulMetricLinkCorner[],
): LawfulMetricVertexLinkCertificate {
  const witnesses: LawfulMetricShortCircuit[] = [];
  let shortCircuitCount = 0;
  const pairBuckets = new Map<string, LawfulMetricLinkCorner[]>();
  for (const corner of corners) {
    if (corner.firstLinkVertexId === corner.secondLinkVertexId) {
      if (compareRationals(corner.angleOverPi, TWO) < 0) {
        shortCircuitCount += 1;
        pushWitness(witnesses, {
          kind: "loop",
          linkVertexIds: [corner.firstLinkVertexId],
          cornerIds: [corner.id],
          lengthOverPi: corner.angleOverPi,
        });
      }
      continue;
    }
    const key = unorderedPairKey(
      corner.firstLinkVertexId,
      corner.secondLinkVertexId,
    );
    const bucket = pairBuckets.get(key) ?? [];
    bucket.push(corner);
    pairBuckets.set(key, bucket);
  }

  for (const bucket of pairBuckets.values()) {
    const groups = groupCornersByLength(bucket);
    for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex;
        rightIndex < groups.length;
        rightIndex += 1
      ) {
        const left = groups[leftIndex];
        const right = groups[rightIndex];
        const length = addRationals(left.length, right.length);
        if (compareRationals(length, TWO) >= 0) continue;
        const pairCount =
          leftIndex === rightIndex
            ? (left.cornerIds.length * (left.cornerIds.length - 1)) / 2
            : left.cornerIds.length * right.cornerIds.length;
        if (pairCount === 0) continue;
        shortCircuitCount += pairCount;
        const firstId = left.cornerIds[0];
        const secondId =
          leftIndex === rightIndex ? left.cornerIds[1] : right.cornerIds[0];
        const sample = bucket.find((entry) => entry.id === firstId)!;
        pushWitness(witnesses, {
          kind: "two-edge-cycle",
          linkVertexIds: [
            sample.firstLinkVertexId,
            sample.secondLinkVertexId,
          ].sort(compareIds),
          cornerIds: [firstId, secondId],
          lengthOverPi: length,
        });
      }
    }
  }

  const neighbors = new Map<string, Set<string>>();
  for (const key of pairBuckets.keys()) {
    const [left, right] = parsePairKey(key);
    (neighbors.get(left) ?? neighbors.set(left, new Set()).get(left)!).add(
      right,
    );
    (neighbors.get(right) ?? neighbors.set(right, new Set()).get(right)!).add(
      left,
    );
  }
  for (const first of [...neighbors.keys()].sort(compareIds)) {
    for (const second of [...(neighbors.get(first) ?? [])]
      .filter((value) => compareIds(first, value) < 0)
      .sort(compareIds)) {
      for (const third of [...(neighbors.get(second) ?? [])]
        .filter(
          (value) =>
            compareIds(second, value) < 0 && neighbors.get(first)?.has(value),
        )
        .sort(compareIds)) {
        const firstSecond = groupCornersByLength(
          pairBuckets.get(unorderedPairKey(first, second)) ?? [],
        );
        const secondThird = groupCornersByLength(
          pairBuckets.get(unorderedPairKey(second, third)) ?? [],
        );
        const firstThird = groupCornersByLength(
          pairBuckets.get(unorderedPairKey(first, third)) ?? [],
        );
        for (const a of firstSecond) {
          for (const b of secondThird) {
            for (const c of firstThird) {
              const length = addRationals(
                addRationals(a.length, b.length),
                c.length,
              );
              if (compareRationals(length, TWO) >= 0) continue;
              shortCircuitCount +=
                a.cornerIds.length * b.cornerIds.length * c.cornerIds.length;
              pushWitness(witnesses, {
                kind: "triangle",
                linkVertexIds: [first, second, third],
                cornerIds: [a.cornerIds[0], b.cornerIds[0], c.cornerIds[0]],
                lengthOverPi: length,
              });
            }
          }
        }
      }
    }
  }

  return {
    vertexId,
    linkVertexIds,
    corners,
    shortCircuitCount,
    shortCircuitWitnesses: witnesses,
    catOne: shortCircuitCount === 0,
  };
}

function groupCornersByLength(
  corners: LawfulMetricLinkCorner[],
): CornerLengthGroup[] {
  const groups = new Map<string, CornerLengthGroup>();
  for (const corner of corners) {
    const key = formatExactRational(corner.angleOverPi);
    const group = groups.get(key) ?? {
      length: corner.angleOverPi,
      cornerIds: [],
    };
    group.cornerIds.push(corner.id);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      cornerIds: group.cornerIds.sort(compareIds),
    }))
    .sort((left, right) => compareRationals(left.length, right.length));
}

function buildLinkVertices(
  barX: BarXCompressedComplex,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const vertex of barX.vertices) result.set(vertex.id, new Set());
  for (const edge of barX.geometricEdges) {
    result.get(edge.sourceVertexId)?.add(linkVertexId(edge.id, "source"));
    result.get(edge.targetVertexId)?.add(linkVertexId(edge.id, "target"));
  }
  return result;
}

function isOneSkeletonConnected(barX: BarXCompressedComplex): boolean {
  const start = barX.vertices[0]?.id;
  if (!start) return false;
  const adjacency = new Map<string, Set<string>>(
    barX.vertices.map((vertex) => [vertex.id, new Set<string>()]),
  );
  for (const edge of barX.geometricEdges) {
    adjacency.get(edge.sourceVertexId)?.add(edge.targetVertexId);
    adjacency.get(edge.targetVertexId)?.add(edge.sourceVertexId);
  }
  const seen = new Set([start]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of adjacency.get(queue[index]) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === barX.vertices.length;
}

function linkVertexId(edgeId: string, end: "source" | "target"): string {
  return `metric-link-vertex:${edgeId}:${end}`;
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

function unorderedPairKey(left: string, right: string): string {
  return compareIds(left, right) <= 0
    ? `${left.length}:${left}${right}`
    : `${right.length}:${right}${left}`;
}

function parsePairKey(key: string): [string, string] {
  const separator = key.indexOf(":");
  const leftLength = Number(key.slice(0, separator));
  const start = separator + 1;
  return [key.slice(start, start + leftLength), key.slice(start + leftLength)];
}

function pushWitness(
  witnesses: LawfulMetricShortCircuit[],
  witness: LawfulMetricShortCircuit,
): void {
  if (witnesses.length < MAX_WITNESSES_PER_VERTEX) witnesses.push(witness);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort(compareIds);
  const b = [...right].sort(compareIds);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareIds);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
