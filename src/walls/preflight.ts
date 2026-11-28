import type { BarXCompressedComplex } from "../compression/types";
import type { GeneralizedCompressionCertificate } from "../davis/generalizedCompression";
import { canonicalSha256 } from "../utils/canonicalSha256";

export type TrackAOrientationSign = 1 | -1;

export interface TrackAWallPreflightVertex {
  id: string;
}

export interface TrackAWallPreflightEdge {
  id: string;
  sourceVertexId: string;
  targetVertexId: string;
  generator?: number;
}

export interface TrackAWallBoundaryOccurrence {
  edgeId: string;
  traversal: TrackAOrientationSign;
}

/**
 * One dual segment through a rank-two polygon. Boundary occurrences, rather
 * than edge ids, are paired because a quotient edge can occur more than once.
 */
export interface TrackAWallSegmentInput {
  id?: string;
  boundaryIndices: [number, number];
}

export interface TrackARankTwoCellInput {
  id: string;
  boundary: TrackAWallBoundaryOccurrence[];
  /** Defaults to antipodal pairs in an even Coxeter polygon. */
  wallSegments?: TrackAWallSegmentInput[];
  /**
   * Pairs of segment indices whose interiors cross. Defaults to every pair,
   * as for the antipodal dual segments in a Coxeter polygon.
   */
  crossingSegmentPairs?: Array<[number, number]>;
}

export type TrackAWallPreflightSourceKind =
  | "quotient-rank-two-skeleton"
  | "bar-x-compression"
  | "generalized-compression-rank-two-bridge"
  | "abstract-rank-two-complex";

export interface TrackAWallPreflightInput {
  schemaVersion: 1;
  kind: "track-a-wall-preflight-input";
  name: string;
  source: {
    kind: TrackAWallPreflightSourceKind;
    name: string;
    archiveHash?: string;
    notes?: string[];
  };
  vertices: TrackAWallPreflightVertex[];
  edges: TrackAWallPreflightEdge[];
  rankTwoCells: TrackARankTwoCellInput[];
}

export interface TrackAWallParityConflict {
  wallId: string;
  segmentId: string;
  firstEdgeId: string;
  secondEdgeId: string;
  expectedParity: TrackAOrientationSign;
  existingParity: TrackAOrientationSign;
}

export interface TrackARepeatedWallGermWitness {
  wallId: string;
  vertexId: string;
  germIds: string[];
}

export interface TrackASelfIntersectionWitness {
  kind: "crossing-segments-have-same-wall" | "segment-reuses-edge";
  wallId: string;
  cellId: string;
  segmentIds: string[];
  edgeIds: string[];
}

export interface TrackASelfOsculationWitness {
  classification: "direct" | "indirect" | "unorientable";
  wallId: string;
  vertexId: string;
  germIds: [string, string];
  reason: string;
}

export interface TrackAWallPairOsculationWitness {
  vertexId: string;
  germIds: [string, string];
}

export interface TrackAWallPairInteraction {
  wallIds: [string, string];
  crossingCellIds: string[];
  osculations: TrackAWallPairOsculationWitness[];
  crosses: boolean;
  osculates: boolean;
  interOsculates: boolean;
}

export interface TrackANormalizedPathologyCount {
  count: number;
  universe: number;
  unit:
    | "wall"
    | "dual-segment"
    | "vertex-wall-site"
    | "declared-local-intersection-site"
    | "same-wall-germ-pair"
    | "unordered-wall-pair";
}

export interface TrackAWallPathologyCounts {
  oneSidedWalls: TrackANormalizedPathologyCount;
  parityConflictSegments: TrackANormalizedPathologyCount;
  repeatedWallGermSites: TrackANormalizedPathologyCount;
  selfIntersectionSites: TrackANormalizedPathologyCount;
  directSelfOsculatingGermPairs: TrackANormalizedPathologyCount;
  indirectSelfOsculatingGermPairs: TrackANormalizedPathologyCount;
  unorientableSelfOsculatingGermPairs: TrackANormalizedPathologyCount;
  crossingWallPairs: TrackANormalizedPathologyCount;
  osculatingWallPairs: TrackANormalizedPathologyCount;
  interOsculatingWallPairs: TrackANormalizedPathologyCount;
}

export interface TrackAWallCleanlinessReport {
  wallCount: number;
  segmentCount: number;
  germCount: number;
  twoSided: boolean;
  twoSidedWallCount: number;
  oneSidedWallIds: string[];
  parityConflicts: TrackAWallParityConflict[];
  repeatedWallGermFree: boolean;
  repeatedWallGerms: TrackARepeatedWallGermWitness[];
  selfIntersectionFree: boolean;
  selfIntersections: TrackASelfIntersectionWitness[];
  selfOsculationFree: boolean;
  directSelfOsculations: TrackASelfOsculationWitness[];
  indirectSelfOsculations: TrackASelfOsculationWitness[];
  unclassifiedSelfOsculations: TrackASelfOsculationWitness[];
  interOsculationFree: boolean;
  wallPairInteractions: TrackAWallPairInteraction[];
  /** Counts with explicit combinatorial universes; these are not probabilities. */
  pathologyCounts: TrackAWallPathologyCounts;
}

export interface TrackADirectedLinkSummary {
  vertexId: string;
  ascendingVertexCount: number;
  ascendingEdgeCount: number;
  ascendingComponentCount: number;
  descendingVertexCount: number;
  descendingEdgeCount: number;
  descendingComponentCount: number;
  ascendingNonemptyConnected: boolean;
  descendingNonemptyConnected: boolean;
}

export interface TrackALocalMorseWitness {
  wallSigns: Record<string, TrackAOrientationSign>;
  retainedRankTwoCellIds: string[];
  discardedRankTwoCellIds: string[];
  vertexLinks: TrackADirectedLinkSummary[];
}

export type TrackALocalMorseFeasibilityStatus =
  | "feasible"
  | "infeasible"
  | "not-run-variable-limit"
  | "not-run-assignment-cap";

export interface TrackALocalMorseFeasibility {
  status: TrackALocalMorseFeasibilityStatus;
  method: "exact-global-reversal-reduced-enumeration";
  exact: boolean;
  wallVariableCount: number;
  freeVariableCount: number;
  exactVariableLimit: number;
  assignmentCap: number;
  globalReversalFixedWallId?: string;
  assignmentSpaceSize: number | null;
  assignmentsTested: number;
  terminationReason:
    | "witness-found"
    | "assignment-space-exhausted"
    | "one-sided-wall-gate"
    | "variable-limit"
    | "assignment-cap";
  witness?: TrackALocalMorseWitness;
  firstFailure?: {
    wallSigns: Record<string, TrackAOrientationSign>;
    vertexId: string;
    failures: string[];
  };
  failureCensus: Record<string, number>;
}

export interface TrackAPerVertexMorseFeasibilityRecord {
  vertexId: string;
  status: TrackALocalMorseFeasibilityStatus;
  exact: boolean;
  relevantWallIds: string[];
  wallVariableCount: number;
  freeVariableCount: number;
  assignmentSpaceSize: number | null;
  assignmentsTested: number;
  terminationReason: TrackALocalMorseFeasibility["terminationReason"];
  witness?: {
    relevantWallSigns: Record<string, TrackAOrientationSign>;
    retainedIncidentRankTwoCellIds: string[];
    link: TrackADirectedLinkSummary;
  };
  firstFailure?: {
    relevantWallSigns: Record<string, TrackAOrientationSign>;
    failures: string[];
  };
}

export interface TrackAPerVertexNecessaryFeasibility {
  method: "exact-projected-wall-enumeration-per-vertex";
  interpretation: "necessary-not-sufficient-for-one-global-coorientation";
  exactWallLimit: number;
  assignmentCapPerVertex: number;
  vertexCount: number;
  feasibleVertexCount: number;
  infeasibleVertexCount: number;
  incompleteVertexCount: number;
  everyVertexIndividuallyFeasible: boolean | null;
  records: TrackAPerVertexMorseFeasibilityRecord[];
}

export interface TrackAPreflightTriageEntry {
  order: number;
  gate:
    | "two-sidedness"
    | "projected-per-vertex-morse"
    | "global-coorientation-morse"
    | "wall-cleanliness-diagnostics";
  disposition:
    | "pass"
    | "hard-stop"
    | "exact-obstruction"
    | "survivor"
    | "incomplete"
    | "diagnostic-only";
  detail: string;
}

export interface TrackAWallPreflightCertificate {
  schemaVersion: 1;
  kind: "track-a-wall-cleanliness-and-local-morse-preflight";
  status: "rank-two-feasible" | "rank-two-infeasible" | "preflight-incomplete";
  method: "exact-rank-two-wall-germ-preflight";
  source: TrackAWallPreflightInput["source"] & {
    inputName: string;
    inputCanonicalSha256: string;
  };
  definitions: {
    wall: string;
    wallGerm: string;
    twoSided: string;
    repeatedWallGerm: string;
    selfIntersectionAnalogue: string;
    selfOsculation: string;
    directSelfOsculation: string;
    indirectSelfOsculation: string;
    crossing: string;
    interOsculation: string;
    retainedRankTwoCell: string;
    directedLink: string;
  };
  counts: {
    vertices: number;
    edges: number;
    rankTwoCells: number;
  };
  cleanliness: TrackAWallCleanlinessReport;
  perVertexNecessaryFeasibility: TrackAPerVertexNecessaryFeasibility;
  globalMorseFeasibility: TrackALocalMorseFeasibility;
  triage: TrackAPreflightTriageEntry[];
  checks: {
    inputValid: true;
    wallEquivalenceComplete: true;
    everySuppliedEdgeAndSegmentBoundToOneWholeWallComponent: true;
    parityConstraintsExact: true;
    everyEdgeEndGermRecorded: true;
    everyRankTwoCornerRecorded: true;
    localEnumerationExactWhenCompleted: boolean;
  };
  conclusion: string;
  nonClaims: string[];
  artifactDigest: string;
}

export interface TrackAWallPreflightUnavailableCertificate {
  schemaVersion: 1;
  kind: "track-a-wall-preflight-unavailable";
  status: "hard-stop-one-sided" | "not-runnable-unmaterialized";
  method: "bound-source-evidence-gate";
  source: {
    name: string;
    artifactPath: string;
    artifactCanonicalSha256: string;
    storedDigest?: string;
  };
  gate: {
    twoSidedness:
      | "failed-by-bound-source-certificate"
      | "not-recomputed-without-materialized-rank-two-complex";
    rankTwoComplexMaterialized: boolean;
    evidence: Record<string, boolean | number | string>;
  };
  conclusion: string;
  nonClaims: string[];
  artifactDigest: string;
}

export interface TrackAWallPreflightReplay {
  valid: boolean;
  storedArtifactDigest?: string;
  rebuiltArtifactDigest?: string;
  errors: string[];
}

export interface TrackAWallPreflightOptions {
  exactWallLimit?: number;
  perVertexExactWallLimit?: number;
  assignmentCap?: number;
}

interface NormalizedOccurrence extends TrackAWallBoundaryOccurrence {
  boundaryIndex: number;
  sourceVertexId: string;
  targetVertexId: string;
  sourceGermId: string;
  targetGermId: string;
}

interface NormalizedSegment {
  id: string;
  cellId: string;
  segmentIndex: number;
  first: NormalizedOccurrence;
  second: NormalizedOccurrence;
  orientationParity: TrackAOrientationSign;
  wallId: string;
}

interface NormalizedCell {
  id: string;
  boundary: NormalizedOccurrence[];
  segments: NormalizedSegment[];
  crossingSegmentPairs: Array<[number, number]>;
}

interface WallRecord {
  id: string;
  edgeIds: string[];
  segmentIds: string[];
  twoSided: boolean;
  edgeParity: Record<string, TrackAOrientationSign>;
}

interface EdgeGerm {
  id: string;
  edgeId: string;
  vertexId: string;
  end: "source" | "target";
  wallId: string;
}

interface NormalizedPreflight {
  input: TrackAWallPreflightInput;
  edgeById: Map<string, TrackAWallPreflightEdge>;
  walls: WallRecord[];
  edgeToWallId: Record<string, string>;
  cells: NormalizedCell[];
  germs: EdgeGerm[];
  parityConflicts: TrackAWallParityConflict[];
}

interface LocalEvaluation {
  passed: boolean;
  retainedRankTwoCellIds: string[];
  discardedRankTwoCellIds: string[];
  vertexLinks: TrackADirectedLinkSummary[];
}

interface VertexLocalEvaluation {
  retainedIncidentRankTwoCellIds: string[];
  link: TrackADirectedLinkSummary;
}

const DEFAULT_EXACT_WALL_LIMIT = 24;
const DEFAULT_PER_VERTEX_EXACT_WALL_LIMIT = 24;
const DEFAULT_ASSIGNMENT_CAP = 100_000;
const MAX_EXACT_WALL_LIMIT = 30;
const MAX_ASSIGNMENT_CAP = 10_000_000;

export class TrackAWallPreflightError extends Error {
  readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(`${message}:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "TrackAWallPreflightError";
    this.errors = errors;
  }
}

class StringDisjointSet {
  private readonly parent = new Map<string, string>();

  constructor(values: readonly string[]) {
    for (const value of values) this.parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.parent.get(value);
    if (parent === undefined)
      throw new Error(`Unknown disjoint-set value ${value}.`);
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a === b) return;
    const [first, second] = a < b ? [a, b] : [b, a];
    this.parent.set(second, first);
  }
}

function sign(value: number): TrackAOrientationSign {
  return value === 1 ? 1 : -1;
}

function multiply(
  left: TrackAOrientationSign,
  right: TrackAOrientationSign,
): TrackAOrientationSign {
  return sign(left * right);
}

function negate(value: TrackAOrientationSign): TrackAOrientationSign {
  return value === 1 ? -1 : 1;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function parsePairKey(value: string): [string, string] {
  const index = value.indexOf("\u0000");
  return [value.slice(0, index), value.slice(index + 1)];
}

function germId(edgeId: string, end: "source" | "target"): string {
  return `germ:${edgeId}:${end}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(
  value: unknown,
  label: string,
  errors: string[],
): string {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${label} must be a nonempty string.`);
    return "";
  }
  return value;
}

/** Parse the public JSON schema without accepting omitted or invented cells. */
export function parseTrackAWallPreflightInput(
  value: unknown,
): TrackAWallPreflightInput {
  const errors: string[] = [];
  if (!isRecord(value)) {
    throw new TrackAWallPreflightError("Invalid Track A preflight input", [
      "The root value must be an object.",
    ]);
  }
  if (value.schemaVersion !== 1) errors.push("schemaVersion must equal 1.");
  if (value.kind !== "track-a-wall-preflight-input") {
    errors.push("kind must be track-a-wall-preflight-input.");
  }
  const name = requireString(value.name, "name", errors);
  const sourceValue = value.source;
  const sourceKinds: TrackAWallPreflightSourceKind[] = [
    "quotient-rank-two-skeleton",
    "bar-x-compression",
    "generalized-compression-rank-two-bridge",
    "abstract-rank-two-complex",
  ];
  let source: TrackAWallPreflightInput["source"] = {
    kind: "abstract-rank-two-complex",
    name: "invalid",
  };
  if (!isRecord(sourceValue)) {
    errors.push("source must be an object.");
  } else {
    const kind = sourceValue.kind;
    if (!sourceKinds.includes(kind as TrackAWallPreflightSourceKind)) {
      errors.push(`source.kind is not recognized: ${String(kind)}.`);
    }
    source = {
      kind: sourceKinds.includes(kind as TrackAWallPreflightSourceKind)
        ? (kind as TrackAWallPreflightSourceKind)
        : "abstract-rank-two-complex",
      name: requireString(sourceValue.name, "source.name", errors),
      ...(typeof sourceValue.archiveHash === "string"
        ? { archiveHash: sourceValue.archiveHash }
        : {}),
      ...(Array.isArray(sourceValue.notes) &&
      sourceValue.notes.every((note) => typeof note === "string")
        ? { notes: [...sourceValue.notes] as string[] }
        : {}),
    };
  }

  const vertices: TrackAWallPreflightVertex[] = [];
  if (!Array.isArray(value.vertices)) {
    errors.push("vertices must be an array.");
  } else {
    value.vertices.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`vertices[${index}] must be an object.`);
        return;
      }
      vertices.push({
        id: requireString(entry.id, `vertices[${index}].id`, errors),
      });
    });
  }
  const vertexIds = new Set(vertices.map((vertex) => vertex.id));
  if (vertexIds.size !== vertices.length)
    errors.push("Vertex ids must be unique.");

  const edges: TrackAWallPreflightEdge[] = [];
  if (!Array.isArray(value.edges)) {
    errors.push("edges must be an array.");
  } else {
    value.edges.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`edges[${index}] must be an object.`);
        return;
      }
      const edge: TrackAWallPreflightEdge = {
        id: requireString(entry.id, `edges[${index}].id`, errors),
        sourceVertexId: requireString(
          entry.sourceVertexId,
          `edges[${index}].sourceVertexId`,
          errors,
        ),
        targetVertexId: requireString(
          entry.targetVertexId,
          `edges[${index}].targetVertexId`,
          errors,
        ),
        ...(Number.isSafeInteger(entry.generator)
          ? { generator: entry.generator as number }
          : {}),
      };
      if (
        !vertexIds.has(edge.sourceVertexId) ||
        !vertexIds.has(edge.targetVertexId)
      ) {
        errors.push(`Edge ${edge.id} refers to a missing endpoint vertex.`);
      }
      edges.push(edge);
    });
  }
  const edgeIds = new Set(edges.map((edge) => edge.id));
  if (edgeIds.size !== edges.length) errors.push("Edge ids must be unique.");

  const rankTwoCells: TrackARankTwoCellInput[] = [];
  if (!Array.isArray(value.rankTwoCells)) {
    errors.push("rankTwoCells must be an array.");
  } else {
    value.rankTwoCells.forEach((entry, cellIndex) => {
      if (!isRecord(entry)) {
        errors.push(`rankTwoCells[${cellIndex}] must be an object.`);
        return;
      }
      const id = requireString(
        entry.id,
        `rankTwoCells[${cellIndex}].id`,
        errors,
      );
      const boundary: TrackAWallBoundaryOccurrence[] = [];
      if (!Array.isArray(entry.boundary)) {
        errors.push(`Cell ${id} boundary must be an array.`);
      } else {
        entry.boundary.forEach((occurrence, boundaryIndex) => {
          if (!isRecord(occurrence)) {
            errors.push(
              `Cell ${id} boundary[${boundaryIndex}] must be an object.`,
            );
            return;
          }
          const edgeId = requireString(
            occurrence.edgeId,
            `Cell ${id} boundary[${boundaryIndex}].edgeId`,
            errors,
          );
          if (!edgeIds.has(edgeId))
            errors.push(`Cell ${id} uses missing edge ${edgeId}.`);
          if (occurrence.traversal !== 1 && occurrence.traversal !== -1) {
            errors.push(
              `Cell ${id} boundary[${boundaryIndex}] traversal must be 1 or -1.`,
            );
          }
          boundary.push({
            edgeId,
            traversal: occurrence.traversal === -1 ? -1 : 1,
          });
        });
      }
      if (boundary.length < 4 || boundary.length % 2 !== 0) {
        errors.push(
          `Cell ${id} must have an even boundary length of at least four.`,
        );
      }

      let wallSegments: TrackAWallSegmentInput[] | undefined;
      if (entry.wallSegments !== undefined) {
        if (!Array.isArray(entry.wallSegments)) {
          errors.push(`Cell ${id} wallSegments must be an array.`);
        } else {
          wallSegments = [];
          entry.wallSegments.forEach((segment, segmentIndex) => {
            if (
              !isRecord(segment) ||
              !Array.isArray(segment.boundaryIndices) ||
              segment.boundaryIndices.length !== 2 ||
              !segment.boundaryIndices.every(Number.isSafeInteger)
            ) {
              errors.push(
                `Cell ${id} wallSegments[${segmentIndex}] is invalid.`,
              );
              return;
            }
            wallSegments?.push({
              ...(typeof segment.id === "string" ? { id: segment.id } : {}),
              boundaryIndices: [
                segment.boundaryIndices[0] as number,
                segment.boundaryIndices[1] as number,
              ],
            });
          });
        }
      }

      let crossingSegmentPairs: Array<[number, number]> | undefined;
      if (entry.crossingSegmentPairs !== undefined) {
        if (!Array.isArray(entry.crossingSegmentPairs)) {
          errors.push(`Cell ${id} crossingSegmentPairs must be an array.`);
        } else {
          crossingSegmentPairs = [];
          entry.crossingSegmentPairs.forEach((pair, pairIndex) => {
            if (
              !Array.isArray(pair) ||
              pair.length !== 2 ||
              !pair.every(Number.isSafeInteger)
            ) {
              errors.push(
                `Cell ${id} crossingSegmentPairs[${pairIndex}] is invalid.`,
              );
              return;
            }
            crossingSegmentPairs?.push([pair[0] as number, pair[1] as number]);
          });
        }
      }
      rankTwoCells.push({
        id,
        boundary,
        ...(wallSegments ? { wallSegments } : {}),
        ...(crossingSegmentPairs ? { crossingSegmentPairs } : {}),
      });
    });
  }
  if (
    new Set(rankTwoCells.map((cell) => cell.id)).size !== rankTwoCells.length
  ) {
    errors.push("Rank-two cell ids must be unique.");
  }

  if (errors.length > 0) {
    throw new TrackAWallPreflightError(
      "Invalid Track A preflight input",
      errors,
    );
  }
  return JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      kind: "track-a-wall-preflight-input",
      name,
      source,
      vertices,
      edges,
      rankTwoCells,
    }),
  ) as TrackAWallPreflightInput;
}

function defaultSegments(
  cell: TrackARankTwoCellInput,
): TrackAWallSegmentInput[] {
  if (cell.wallSegments) return cell.wallSegments;
  const half = cell.boundary.length / 2;
  return Array.from({ length: half }, (_unused, index) => ({
    boundaryIndices: [index, index + half],
  }));
}

function normalizeInput(inputValue: unknown): NormalizedPreflight {
  const input = parseTrackAWallPreflightInput(inputValue);
  const edgeById = new Map(input.edges.map((edge) => [edge.id, edge] as const));
  const errors: string[] = [];
  const occurrenceByCell = new Map<string, NormalizedOccurrence[]>();
  const segmentInputs: Array<{
    id: string;
    cellId: string;
    segmentIndex: number;
    first: NormalizedOccurrence;
    second: NormalizedOccurrence;
    orientationParity: TrackAOrientationSign;
  }> = [];
  const crossingByCell = new Map<string, Array<[number, number]>>();

  for (const cell of input.rankTwoCells) {
    const boundary = cell.boundary.map<NormalizedOccurrence>(
      (occurrence, index) => {
        const edge = edgeById.get(occurrence.edgeId)!;
        const forward = occurrence.traversal === 1;
        return {
          ...occurrence,
          boundaryIndex: index,
          sourceVertexId: forward ? edge.sourceVertexId : edge.targetVertexId,
          targetVertexId: forward ? edge.targetVertexId : edge.sourceVertexId,
          sourceGermId: germId(edge.id, forward ? "source" : "target"),
          targetGermId: germId(edge.id, forward ? "target" : "source"),
        };
      },
    );
    for (let index = 0; index < boundary.length; index += 1) {
      if (
        boundary[index].targetVertexId !==
        boundary[(index + 1) % boundary.length].sourceVertexId
      ) {
        errors.push(
          `Cell ${cell.id} boundary does not close at index ${index}.`,
        );
      }
    }
    occurrenceByCell.set(cell.id, boundary);
    const segments = defaultSegments(cell);
    if (segments.length * 2 !== boundary.length) {
      errors.push(
        `Cell ${cell.id} wall segments do not pair every boundary occurrence.`,
      );
    }
    const used = new Set<number>();
    segments.forEach((segment, segmentIndex) => {
      const [firstIndex, secondIndex] = segment.boundaryIndices;
      if (
        firstIndex < 0 ||
        firstIndex >= boundary.length ||
        secondIndex < 0 ||
        secondIndex >= boundary.length ||
        firstIndex === secondIndex
      ) {
        errors.push(
          `Cell ${cell.id} segment ${segmentIndex} has invalid boundary indices.`,
        );
        return;
      }
      if (used.has(firstIndex) || used.has(secondIndex)) {
        errors.push(
          `Cell ${cell.id} pairs a boundary occurrence more than once.`,
        );
      }
      used.add(firstIndex);
      used.add(secondIndex);
      const first = boundary[firstIndex];
      const second = boundary[secondIndex];
      segmentInputs.push({
        id: segment.id ?? `segment:${cell.id}:${segmentIndex}`,
        cellId: cell.id,
        segmentIndex,
        first,
        second,
        orientationParity: negate(multiply(first.traversal, second.traversal)),
      });
    });
    if (used.size !== boundary.length) {
      errors.push(
        `Cell ${cell.id} wall segments do not form a perfect occurrence pairing.`,
      );
    }
    const crossings =
      cell.crossingSegmentPairs ??
      Array.from({ length: segments.length }, (_unused, left) =>
        Array.from(
          { length: segments.length - left - 1 },
          (_unused2, offset) => [left, left + offset + 1] as [number, number],
        ),
      ).flat();
    const crossingKeys = new Set<string>();
    for (const [left, right] of crossings) {
      if (
        left < 0 ||
        right < 0 ||
        left >= segments.length ||
        right >= segments.length ||
        left === right
      ) {
        errors.push(
          `Cell ${cell.id} has an invalid crossing segment pair ${left},${right}.`,
        );
        continue;
      }
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      if (crossingKeys.has(key))
        errors.push(`Cell ${cell.id} repeats crossing pair ${key}.`);
      crossingKeys.add(key);
    }
    crossingByCell.set(
      cell.id,
      [...crossingKeys]
        .sort()
        .map((key) => key.split(":").map(Number) as [number, number]),
    );
  }
  if (
    new Set(segmentInputs.map((segment) => segment.id)).size !==
    segmentInputs.length
  ) {
    errors.push("Wall segment ids must be globally unique.");
  }
  if (errors.length > 0) {
    throw new TrackAWallPreflightError("Invalid rank-two wall data", errors);
  }

  const dsu = new StringDisjointSet(input.edges.map((edge) => edge.id));
  for (const segment of segmentInputs)
    dsu.union(segment.first.edgeId, segment.second.edgeId);
  const groups = new Map<string, string[]>();
  for (const edge of input.edges) {
    const root = dsu.find(edge.id);
    const group = groups.get(root) ?? [];
    group.push(edge.id);
    groups.set(root, group);
  }
  const edgeToWallId: Record<string, string> = {};
  const walls: WallRecord[] = [...groups.values()]
    .map((edgeIds) => {
      edgeIds.sort();
      const id = `wall:${edgeIds[0]}`;
      edgeIds.forEach((edgeId) => (edgeToWallId[edgeId] = id));
      return { id, edgeIds, segmentIds: [], twoSided: true, edgeParity: {} };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const segments: NormalizedSegment[] = segmentInputs.map((segment) => ({
    ...segment,
    wallId: edgeToWallId[segment.first.edgeId],
  }));
  const wallById = new Map(walls.map((wall) => [wall.id, wall] as const));
  for (const segment of segments)
    wallById.get(segment.wallId)?.segmentIds.push(segment.id);

  const parityConflicts: TrackAWallParityConflict[] = [];
  const parityConflictKeys = new Set<string>();
  for (const wall of walls) {
    const incident = new Map<string, NormalizedSegment[]>();
    wall.edgeIds.forEach((edgeId) => incident.set(edgeId, []));
    for (const segment of segments.filter(
      (entry) => entry.wallId === wall.id,
    )) {
      incident.get(segment.first.edgeId)?.push(segment);
      incident.get(segment.second.edgeId)?.push(segment);
    }
    for (const root of wall.edgeIds) {
      if (wall.edgeParity[root] !== undefined) continue;
      wall.edgeParity[root] = 1;
      const queue = [root];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const edgeId = queue[cursor];
        for (const segment of incident.get(edgeId) ?? []) {
          const other =
            segment.first.edgeId === edgeId
              ? segment.second.edgeId
              : segment.first.edgeId;
          const expected = multiply(
            wall.edgeParity[edgeId],
            segment.orientationParity,
          );
          const existing = wall.edgeParity[other];
          if (existing === undefined) {
            wall.edgeParity[other] = expected;
            queue.push(other);
          } else if (existing !== expected) {
            // Traversing the same contradictory segment from its two ends is
            // one obstruction, not two pathologies in the census.
            const conflictKey = `${wall.id}\u0000${segment.id}`;
            if (!parityConflictKeys.has(conflictKey)) {
              parityConflictKeys.add(conflictKey);
              parityConflicts.push({
                wallId: wall.id,
                segmentId: segment.id,
                firstEdgeId: edgeId,
                secondEdgeId: other,
                expectedParity: expected,
                existingParity: existing,
              });
            }
          }
        }
      }
    }
    wall.twoSided = !parityConflicts.some(
      (conflict) => conflict.wallId === wall.id,
    );
  }

  const cells: NormalizedCell[] = input.rankTwoCells.map((cell) => ({
    id: cell.id,
    boundary: occurrenceByCell.get(cell.id)!,
    segments: segments
      .filter((segment) => segment.cellId === cell.id)
      .sort((left, right) => left.segmentIndex - right.segmentIndex),
    crossingSegmentPairs: crossingByCell.get(cell.id)!,
  }));
  const germs: EdgeGerm[] = input.edges.flatMap((edge) => {
    const wallId = edgeToWallId[edge.id];
    return [
      {
        id: germId(edge.id, "source"),
        edgeId: edge.id,
        vertexId: edge.sourceVertexId,
        end: "source" as const,
        wallId,
      },
      {
        id: germId(edge.id, "target"),
        edgeId: edge.id,
        vertexId: edge.targetVertexId,
        end: "target" as const,
        wallId,
      },
    ];
  });
  return {
    input,
    edgeById,
    walls,
    edgeToWallId,
    cells,
    germs,
    parityConflicts,
  };
}

function cornerSupportKeys(data: NormalizedPreflight): Set<string> {
  const result = new Set<string>();
  for (const cell of data.cells) {
    for (let corner = 0; corner < cell.boundary.length; corner += 1) {
      const incoming =
        cell.boundary[
          (corner - 1 + cell.boundary.length) % cell.boundary.length
        ];
      const outgoing = cell.boundary[corner];
      result.add(pairKey(incoming.targetGermId, outgoing.sourceGermId));
    }
  }
  return result;
}

function germAwaySign(germ: EdgeGerm, wall: WallRecord): TrackAOrientationSign {
  const edgeDirection = wall.edgeParity[germ.edgeId];
  return germ.end === "source" ? edgeDirection : negate(edgeDirection);
}

function diagnoseCleanliness(
  data: NormalizedPreflight,
): TrackAWallCleanlinessReport {
  const support = cornerSupportKeys(data);
  const wallById = new Map(data.walls.map((wall) => [wall.id, wall] as const));
  const germsByVertexWall = new Map<string, EdgeGerm[]>();
  const germsByVertex = new Map<string, EdgeGerm[]>();
  for (const germ of data.germs) {
    const wallKey = `${germ.vertexId}\u0000${germ.wallId}`;
    const wallList = germsByVertexWall.get(wallKey) ?? [];
    wallList.push(germ);
    germsByVertexWall.set(wallKey, wallList);
    const vertexList = germsByVertex.get(germ.vertexId) ?? [];
    vertexList.push(germ);
    germsByVertex.set(germ.vertexId, vertexList);
  }
  const repeatedWallGerms = [...germsByVertexWall.values()]
    .filter((germs) => germs.length > 1)
    .map<TrackARepeatedWallGermWitness>((germs) => ({
      wallId: germs[0].wallId,
      vertexId: germs[0].vertexId,
      germIds: germs.map((germ) => germ.id).sort(),
    }))
    .sort(
      (left, right) =>
        left.wallId.localeCompare(right.wallId) ||
        left.vertexId.localeCompare(right.vertexId),
    );

  const selfIntersections: TrackASelfIntersectionWitness[] = [];
  const crossingCellsByPair = new Map<string, Set<string>>();
  for (const cell of data.cells) {
    for (const segment of cell.segments) {
      if (segment.first.edgeId === segment.second.edgeId) {
        selfIntersections.push({
          kind: "segment-reuses-edge",
          wallId: segment.wallId,
          cellId: cell.id,
          segmentIds: [segment.id],
          edgeIds: [segment.first.edgeId],
        });
      }
    }
    for (const [leftIndex, rightIndex] of cell.crossingSegmentPairs) {
      const left = cell.segments[leftIndex];
      const right = cell.segments[rightIndex];
      if (left.wallId === right.wallId) {
        selfIntersections.push({
          kind: "crossing-segments-have-same-wall",
          wallId: left.wallId,
          cellId: cell.id,
          segmentIds: [left.id, right.id].sort(),
          edgeIds: sortedUnique([
            left.first.edgeId,
            left.second.edgeId,
            right.first.edgeId,
            right.second.edgeId,
          ]),
        });
      } else {
        const key = pairKey(left.wallId, right.wallId);
        const cells = crossingCellsByPair.get(key) ?? new Set<string>();
        cells.add(cell.id);
        crossingCellsByPair.set(key, cells);
      }
    }
  }

  const directSelfOsculations: TrackASelfOsculationWitness[] = [];
  const indirectSelfOsculations: TrackASelfOsculationWitness[] = [];
  const unclassifiedSelfOsculations: TrackASelfOsculationWitness[] = [];
  for (const repeated of repeatedWallGerms) {
    const germs = repeated.germIds.map(
      (id) => data.germs.find((germ) => germ.id === id)!,
    );
    for (let left = 0; left < germs.length; left += 1) {
      for (let right = left + 1; right < germs.length; right += 1) {
        if (support.has(pairKey(germs[left].id, germs[right].id))) continue;
        const wall = wallById.get(repeated.wallId)!;
        let witness: TrackASelfOsculationWitness;
        if (!wall.twoSided) {
          witness = {
            classification: "unorientable",
            wallId: wall.id,
            vertexId: repeated.vertexId,
            germIds: [germs[left].id, germs[right].id],
            reason:
              "The wall has no coherent coorientation, so direct/indirect is undefined.",
          };
          unclassifiedSelfOsculations.push(witness);
        } else {
          const sameDirection =
            germAwaySign(germs[left], wall) ===
            germAwaySign(germs[right], wall);
          witness = {
            classification: sameDirection ? "direct" : "indirect",
            wallId: wall.id,
            vertexId: repeated.vertexId,
            germIds: [germs[left].id, germs[right].id],
            reason: sameDirection
              ? "For either global wall reversal, both coherently oriented germs point into the vertex or both point out."
              : "For either global wall reversal, one coherently oriented germ points in and the other points out.",
          };
          (sameDirection
            ? directSelfOsculations
            : indirectSelfOsculations
          ).push(witness);
        }
      }
    }
  }

  const osculationsByPair = new Map<
    string,
    TrackAWallPairOsculationWitness[]
  >();
  for (const [vertexId, germs] of germsByVertex) {
    for (let left = 0; left < germs.length; left += 1) {
      for (let right = left + 1; right < germs.length; right += 1) {
        if (germs[left].wallId === germs[right].wallId) continue;
        if (support.has(pairKey(germs[left].id, germs[right].id))) continue;
        const key = pairKey(germs[left].wallId, germs[right].wallId);
        const witnesses = osculationsByPair.get(key) ?? [];
        witnesses.push({
          vertexId,
          germIds: [germs[left].id, germs[right].id].sort() as [string, string],
        });
        osculationsByPair.set(key, witnesses);
      }
    }
  }
  const interactionKeys = sortedUnique([
    ...crossingCellsByPair.keys(),
    ...osculationsByPair.keys(),
  ]);
  const wallPairInteractions = interactionKeys.map<TrackAWallPairInteraction>(
    (key) => {
      const crossingCellIds = [...(crossingCellsByPair.get(key) ?? [])].sort();
      const osculations = (osculationsByPair.get(key) ?? []).sort(
        (left, right) =>
          left.vertexId.localeCompare(right.vertexId) ||
          left.germIds[0].localeCompare(right.germIds[0]),
      );
      return {
        wallIds: parsePairKey(key),
        crossingCellIds,
        osculations,
        crosses: crossingCellIds.length > 0,
        osculates: osculations.length > 0,
        interOsculates: crossingCellIds.length > 0 && osculations.length > 0,
      };
    },
  );
  const segmentCount = data.cells.reduce(
    (sum, cell) => sum + cell.segments.length,
    0,
  );
  const sameWallGermPairCount = [...germsByVertexWall.values()].reduce(
    (sum, germs) => sum + (germs.length * (germs.length - 1)) / 2,
    0,
  );
  const declaredLocalIntersectionSiteCount = data.cells.reduce(
    (sum, cell) =>
      sum + cell.segments.length + cell.crossingSegmentPairs.length,
    0,
  );
  const unorderedWallPairCount =
    (data.walls.length * (data.walls.length - 1)) / 2;
  const pathologyCounts: TrackAWallPathologyCounts = {
    oneSidedWalls: {
      count: data.walls.filter((wall) => !wall.twoSided).length,
      universe: data.walls.length,
      unit: "wall",
    },
    parityConflictSegments: {
      count: data.parityConflicts.length,
      universe: segmentCount,
      unit: "dual-segment",
    },
    repeatedWallGermSites: {
      count: repeatedWallGerms.length,
      universe: germsByVertexWall.size,
      unit: "vertex-wall-site",
    },
    selfIntersectionSites: {
      count: selfIntersections.length,
      universe: declaredLocalIntersectionSiteCount,
      unit: "declared-local-intersection-site",
    },
    directSelfOsculatingGermPairs: {
      count: directSelfOsculations.length,
      universe: sameWallGermPairCount,
      unit: "same-wall-germ-pair",
    },
    indirectSelfOsculatingGermPairs: {
      count: indirectSelfOsculations.length,
      universe: sameWallGermPairCount,
      unit: "same-wall-germ-pair",
    },
    unorientableSelfOsculatingGermPairs: {
      count: unclassifiedSelfOsculations.length,
      universe: sameWallGermPairCount,
      unit: "same-wall-germ-pair",
    },
    crossingWallPairs: {
      count: wallPairInteractions.filter((pair) => pair.crosses).length,
      universe: unorderedWallPairCount,
      unit: "unordered-wall-pair",
    },
    osculatingWallPairs: {
      count: wallPairInteractions.filter((pair) => pair.osculates).length,
      universe: unorderedWallPairCount,
      unit: "unordered-wall-pair",
    },
    interOsculatingWallPairs: {
      count: wallPairInteractions.filter((pair) => pair.interOsculates).length,
      universe: unorderedWallPairCount,
      unit: "unordered-wall-pair",
    },
  };
  return {
    wallCount: data.walls.length,
    segmentCount,
    germCount: data.germs.length,
    twoSided: data.walls.every((wall) => wall.twoSided),
    twoSidedWallCount: data.walls.filter((wall) => wall.twoSided).length,
    oneSidedWallIds: data.walls
      .filter((wall) => !wall.twoSided)
      .map((wall) => wall.id),
    parityConflicts: data.parityConflicts,
    repeatedWallGermFree: repeatedWallGerms.length === 0,
    repeatedWallGerms,
    selfIntersectionFree: selfIntersections.length === 0,
    selfIntersections,
    selfOsculationFree:
      directSelfOsculations.length +
        indirectSelfOsculations.length +
        unclassifiedSelfOsculations.length ===
      0,
    directSelfOsculations,
    indirectSelfOsculations,
    unclassifiedSelfOsculations,
    interOsculationFree: wallPairInteractions.every(
      (pair) => !pair.interOsculates,
    ),
    wallPairInteractions,
    pathologyCounts,
  };
}

function cyclicTransitions(signs: readonly TrackAOrientationSign[]): number {
  return signs.reduce(
    (count, value, index) =>
      count + (value === signs[(index + 1) % signs.length] ? 0 : 1),
    0,
  );
}

function segmentPointsAwayFromCorner(
  cell: NormalizedCell,
  segment: NormalizedSegment,
  cornerIndex: number,
  edgeDirections: Record<string, TrackAOrientationSign>,
): boolean {
  const firstIndex = segment.first.boundaryIndex;
  const secondIndex = segment.second.boundaryIndex;
  const length = cell.boundary.length;
  const forwardLength = (secondIndex - firstIndex + length) % length;
  const cornerDistance = (cornerIndex - firstIndex + length) % length;
  const cornerInForwardArc =
    cornerDistance >= 1 && cornerDistance <= forwardLength;
  const signAlongFirstBoundary = multiply(
    edgeDirections[segment.first.edgeId],
    segment.first.traversal,
  );
  return cornerInForwardArc
    ? signAlongFirstBoundary === -1
    : signAlongFirstBoundary === 1;
}

function componentCount(
  vertices: readonly string[],
  edges: readonly [string, string][],
): number {
  if (vertices.length === 0) return 0;
  const adjacency = new Map(
    vertices.map((vertex) => [vertex, new Set<string>()]),
  );
  for (const [left, right] of edges) {
    if (!adjacency.has(left) || !adjacency.has(right)) continue;
    adjacency.get(left)?.add(right);
    adjacency.get(right)?.add(left);
  }
  let components = 0;
  const seen = new Set<string>();
  for (const start of [...vertices].sort()) {
    if (seen.has(start)) continue;
    components += 1;
    const queue = [start];
    seen.add(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const target of adjacency.get(queue[cursor]) ?? []) {
        if (seen.has(target)) continue;
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return components;
}

function evaluateLocalMorse(
  data: NormalizedPreflight,
  wallSigns: Record<string, TrackAOrientationSign>,
): LocalEvaluation {
  const wallById = new Map(data.walls.map((wall) => [wall.id, wall] as const));
  const edgeDirections: Record<string, TrackAOrientationSign> = {};
  for (const edge of data.input.edges) {
    const wall = wallById.get(data.edgeToWallId[edge.id])!;
    edgeDirections[edge.id] = multiply(
      wall.edgeParity[edge.id],
      wallSigns[wall.id],
    );
  }
  const retained = new Set<string>();
  for (const cell of data.cells) {
    const signs = cell.boundary.map((occurrence) =>
      multiply(edgeDirections[occurrence.edgeId], occurrence.traversal),
    );
    if (cyclicTransitions(signs) === 2) retained.add(cell.id);
  }

  const ascendingVertices = new Map<string, string[]>();
  const descendingVertices = new Map<string, string[]>();
  const ascendingEdges = new Map<string, Array<[string, string]>>();
  const descendingEdges = new Map<string, Array<[string, string]>>();
  for (const vertex of data.input.vertices) {
    ascendingVertices.set(vertex.id, []);
    descendingVertices.set(vertex.id, []);
    ascendingEdges.set(vertex.id, []);
    descendingEdges.set(vertex.id, []);
  }
  for (const germ of data.germs) {
    const away =
      germ.end === "source"
        ? edgeDirections[germ.edgeId] === 1
        : edgeDirections[germ.edgeId] === -1;
    (away ? ascendingVertices : descendingVertices)
      .get(germ.vertexId)
      ?.push(germ.id);
  }
  for (const cell of data.cells) {
    if (!retained.has(cell.id)) continue;
    for (
      let cornerIndex = 0;
      cornerIndex < cell.boundary.length;
      cornerIndex += 1
    ) {
      const incoming =
        cell.boundary[
          (cornerIndex - 1 + cell.boundary.length) % cell.boundary.length
        ];
      const outgoing = cell.boundary[cornerIndex];
      const away = cell.segments.map((segment) =>
        segmentPointsAwayFromCorner(cell, segment, cornerIndex, edgeDirections),
      );
      const edge: [string, string] = [
        incoming.targetGermId,
        outgoing.sourceGermId,
      ];
      if (away.every(Boolean))
        ascendingEdges.get(outgoing.sourceVertexId)?.push(edge);
      if (away.every((value) => !value))
        descendingEdges.get(outgoing.sourceVertexId)?.push(edge);
    }
  }
  const vertexLinks = data.input.vertices
    .map<TrackADirectedLinkSummary>((vertex) => {
      const ascVertices = ascendingVertices.get(vertex.id) ?? [];
      const descVertices = descendingVertices.get(vertex.id) ?? [];
      const ascEdges = ascendingEdges.get(vertex.id) ?? [];
      const descEdges = descendingEdges.get(vertex.id) ?? [];
      const ascComponents = componentCount(ascVertices, ascEdges);
      const descComponents = componentCount(descVertices, descEdges);
      return {
        vertexId: vertex.id,
        ascendingVertexCount: ascVertices.length,
        ascendingEdgeCount: ascEdges.length,
        ascendingComponentCount: ascComponents,
        descendingVertexCount: descVertices.length,
        descendingEdgeCount: descEdges.length,
        descendingComponentCount: descComponents,
        ascendingNonemptyConnected:
          ascVertices.length > 0 && ascComponents === 1,
        descendingNonemptyConnected:
          descVertices.length > 0 && descComponents === 1,
      };
    })
    .sort((left, right) => left.vertexId.localeCompare(right.vertexId));
  return {
    passed: vertexLinks.every(
      (link) =>
        link.ascendingNonemptyConnected && link.descendingNonemptyConnected,
    ),
    retainedRankTwoCellIds: [...retained].sort(),
    discardedRankTwoCellIds: data.cells
      .map((cell) => cell.id)
      .filter((cellId) => !retained.has(cellId))
      .sort(),
    vertexLinks,
  };
}

/**
 * Evaluate one projected vertex problem without scanning unrelated quotient
 * cells. Every boundary edge of an incident cell lies in one of that cell's
 * declared wall segments, so the projected sign assignment is complete here.
 */
function evaluateVertexMorse(
  data: NormalizedPreflight,
  vertexId: string,
  vertexGerms: readonly EdgeGerm[],
  incidentCells: readonly NormalizedCell[],
  wallSigns: Record<string, TrackAOrientationSign>,
): VertexLocalEvaluation {
  const wallById = new Map(data.walls.map((wall) => [wall.id, wall] as const));
  const edgeDirections: Record<string, TrackAOrientationSign> = {};
  const requiredEdgeIds = sortedUnique([
    ...vertexGerms.map((germ) => germ.edgeId),
    ...incidentCells.flatMap((cell) =>
      cell.boundary.map((occurrence) => occurrence.edgeId),
    ),
  ]);
  for (const edgeId of requiredEdgeIds) {
    const wall = wallById.get(data.edgeToWallId[edgeId])!;
    const wallSign = wallSigns[wall.id];
    if (wallSign === undefined) {
      throw new TrackAWallPreflightError(
        "Incomplete projected wall assignment",
        [`Vertex ${vertexId} requires a sign for ${wall.id}.`],
      );
    }
    edgeDirections[edgeId] = multiply(wall.edgeParity[edgeId], wallSign);
  }

  const retained = new Set<string>();
  for (const cell of incidentCells) {
    const signs = cell.boundary.map((occurrence) =>
      multiply(edgeDirections[occurrence.edgeId], occurrence.traversal),
    );
    if (cyclicTransitions(signs) === 2) retained.add(cell.id);
  }

  const ascendingVertices: string[] = [];
  const descendingVertices: string[] = [];
  for (const germ of vertexGerms) {
    const away =
      germ.end === "source"
        ? edgeDirections[germ.edgeId] === 1
        : edgeDirections[germ.edgeId] === -1;
    (away ? ascendingVertices : descendingVertices).push(germ.id);
  }
  const ascendingEdges: Array<[string, string]> = [];
  const descendingEdges: Array<[string, string]> = [];
  for (const cell of incidentCells) {
    if (!retained.has(cell.id)) continue;
    for (
      let cornerIndex = 0;
      cornerIndex < cell.boundary.length;
      cornerIndex += 1
    ) {
      const outgoing = cell.boundary[cornerIndex];
      if (outgoing.sourceVertexId !== vertexId) continue;
      const incoming =
        cell.boundary[
          (cornerIndex - 1 + cell.boundary.length) % cell.boundary.length
        ];
      const away = cell.segments.map((segment) =>
        segmentPointsAwayFromCorner(cell, segment, cornerIndex, edgeDirections),
      );
      const edge: [string, string] = [
        incoming.targetGermId,
        outgoing.sourceGermId,
      ];
      if (away.every(Boolean)) ascendingEdges.push(edge);
      if (away.every((value) => !value)) descendingEdges.push(edge);
    }
  }
  const ascendingComponentCount = componentCount(
    ascendingVertices,
    ascendingEdges,
  );
  const descendingComponentCount = componentCount(
    descendingVertices,
    descendingEdges,
  );
  return {
    retainedIncidentRankTwoCellIds: [...retained].sort(),
    link: {
      vertexId,
      ascendingVertexCount: ascendingVertices.length,
      ascendingEdgeCount: ascendingEdges.length,
      ascendingComponentCount,
      descendingVertexCount: descendingVertices.length,
      descendingEdgeCount: descendingEdges.length,
      descendingComponentCount,
      ascendingNonemptyConnected:
        ascendingVertices.length > 0 && ascendingComponentCount === 1,
      descendingNonemptyConnected:
        descendingVertices.length > 0 && descendingComponentCount === 1,
    },
  };
}

function globalMorseFeasibility(
  data: NormalizedPreflight,
  exactWallLimit: number,
  assignmentCap: number,
): TrackALocalMorseFeasibility {
  const base = {
    method: "exact-global-reversal-reduced-enumeration" as const,
    wallVariableCount: data.walls.length,
    freeVariableCount: Math.max(0, data.walls.length - 1),
    exactVariableLimit: exactWallLimit,
    assignmentCap,
  };
  if (data.walls.some((wall) => !wall.twoSided)) {
    return {
      ...base,
      status: "infeasible",
      exact: true,
      assignmentSpaceSize: 0,
      assignmentsTested: 0,
      terminationReason: "one-sided-wall-gate",
      failureCensus: { "one-sided-wall-gate": 1 },
    };
  }
  if (data.walls.length > exactWallLimit) {
    return {
      ...base,
      status: "not-run-variable-limit",
      exact: false,
      assignmentSpaceSize: null,
      assignmentsTested: 0,
      terminationReason: "variable-limit",
      failureCensus: {},
    };
  }
  const fixedWallId = data.walls[0]?.id;
  const freeWalls = fixedWallId ? data.walls.slice(1) : [];
  const assignmentSpaceSize = 2 ** freeWalls.length;
  const assignmentsToTest = Math.min(assignmentSpaceSize, assignmentCap);
  const failureCensus: Record<string, number> = {};
  let firstFailure: TrackALocalMorseFeasibility["firstFailure"];
  for (let mask = 0; mask < assignmentsToTest; mask += 1) {
    const wallSigns: Record<string, TrackAOrientationSign> = {};
    if (fixedWallId) wallSigns[fixedWallId] = 1;
    freeWalls.forEach((wall, index) => {
      wallSigns[wall.id] = (mask & (2 ** index)) === 0 ? -1 : 1;
    });
    const evaluation = evaluateLocalMorse(data, wallSigns);
    if (evaluation.passed) {
      return {
        ...base,
        status: "feasible",
        exact: true,
        ...(fixedWallId ? { globalReversalFixedWallId: fixedWallId } : {}),
        assignmentSpaceSize,
        assignmentsTested: mask + 1,
        terminationReason: "witness-found",
        witness: { wallSigns, ...evaluation },
        failureCensus,
      };
    }
    const failedLink = evaluation.vertexLinks.find(
      (link) =>
        !link.ascendingNonemptyConnected || !link.descendingNonemptyConnected,
    )!;
    const failures: string[] = [];
    if (failedLink.ascendingVertexCount === 0) failures.push("ascending-empty");
    else if (failedLink.ascendingComponentCount !== 1)
      failures.push("ascending-disconnected");
    if (failedLink.descendingVertexCount === 0)
      failures.push("descending-empty");
    else if (failedLink.descendingComponentCount !== 1)
      failures.push("descending-disconnected");
    failures.forEach(
      (failure) => (failureCensus[failure] = (failureCensus[failure] ?? 0) + 1),
    );
    firstFailure ??= { wallSigns, vertexId: failedLink.vertexId, failures };
  }
  if (assignmentsToTest < assignmentSpaceSize) {
    return {
      ...base,
      status: "not-run-assignment-cap",
      exact: false,
      ...(fixedWallId ? { globalReversalFixedWallId: fixedWallId } : {}),
      assignmentSpaceSize,
      assignmentsTested: assignmentsToTest,
      terminationReason: "assignment-cap",
      ...(firstFailure ? { firstFailure } : {}),
      failureCensus,
    };
  }
  return {
    ...base,
    status: "infeasible",
    exact: true,
    ...(fixedWallId ? { globalReversalFixedWallId: fixedWallId } : {}),
    assignmentSpaceSize,
    assignmentsTested: assignmentSpaceSize,
    terminationReason: "assignment-space-exhausted",
    ...(firstFailure ? { firstFailure } : {}),
    failureCensus,
  };
}

function directedLinkFailures(link: TrackADirectedLinkSummary): string[] {
  const failures: string[] = [];
  if (link.ascendingVertexCount === 0) failures.push("ascending-empty");
  else if (link.ascendingComponentCount !== 1)
    failures.push("ascending-disconnected");
  if (link.descendingVertexCount === 0) failures.push("descending-empty");
  else if (link.descendingComponentCount !== 1)
    failures.push("descending-disconnected");
  return failures;
}

function perVertexNecessaryFeasibility(
  data: NormalizedPreflight,
  exactWallLimit: number,
  assignmentCap: number,
): TrackAPerVertexNecessaryFeasibility {
  // These indices make the cost of one projected mask proportional to one
  // vertex star, even when the quotient has millions of unrelated cells.
  const germsByVertex = new Map(
    data.input.vertices.map((vertex) => [vertex.id, [] as EdgeGerm[]]),
  );
  for (const germ of data.germs) germsByVertex.get(germ.vertexId)?.push(germ);
  const cellsByVertex = new Map(
    data.input.vertices.map((vertex) => [vertex.id, [] as NormalizedCell[]]),
  );
  for (const cell of data.cells) {
    for (const vertexId of sortedUnique(
      cell.boundary.map((occurrence) => occurrence.sourceVertexId),
    )) {
      cellsByVertex.get(vertexId)?.push(cell);
    }
  }
  const records = data.input.vertices
    .map<TrackAPerVertexMorseFeasibilityRecord>((vertex) => {
      const vertexGerms = germsByVertex.get(vertex.id) ?? [];
      const incidentCells = cellsByVertex.get(vertex.id) ?? [];
      const relevantWallIds = sortedUnique([
        ...vertexGerms.map((germ) => germ.wallId),
        ...incidentCells.flatMap((cell) =>
          cell.segments.map((segment) => segment.wallId),
        ),
      ]);
      const relevantWalls = relevantWallIds.map(
        (wallId) => data.walls.find((wall) => wall.id === wallId)!,
      );
      const base = {
        vertexId: vertex.id,
        relevantWallIds,
        wallVariableCount: relevantWalls.length,
        freeVariableCount: Math.max(0, relevantWalls.length - 1),
      };
      if (relevantWalls.some((wall) => !wall.twoSided)) {
        return {
          ...base,
          status: "infeasible",
          exact: true,
          assignmentSpaceSize: 0,
          assignmentsTested: 0,
          terminationReason: "one-sided-wall-gate",
        };
      }
      if (relevantWalls.length > exactWallLimit) {
        return {
          ...base,
          status: "not-run-variable-limit",
          exact: false,
          assignmentSpaceSize: null,
          assignmentsTested: 0,
          terminationReason: "variable-limit",
        };
      }
      const fixed = relevantWalls[0];
      const free = fixed ? relevantWalls.slice(1) : [];
      const assignmentSpaceSize = 2 ** free.length;
      const assignmentsToTest = Math.min(assignmentSpaceSize, assignmentCap);
      let firstFailure: TrackAPerVertexMorseFeasibilityRecord["firstFailure"];
      for (let mask = 0; mask < assignmentsToTest; mask += 1) {
        const relevantWallSigns: Record<string, TrackAOrientationSign> = {};
        if (fixed) {
          relevantWallSigns[fixed.id] = 1;
        }
        free.forEach((wall, index) => {
          const value: TrackAOrientationSign =
            (mask & (2 ** index)) === 0 ? -1 : 1;
          relevantWallSigns[wall.id] = value;
        });
        const evaluation = evaluateVertexMorse(
          data,
          vertex.id,
          vertexGerms,
          incidentCells,
          relevantWallSigns,
        );
        const link = evaluation.link;
        const failures = directedLinkFailures(link);
        if (failures.length === 0) {
          return {
            ...base,
            status: "feasible",
            exact: true,
            assignmentSpaceSize,
            assignmentsTested: mask + 1,
            terminationReason: "witness-found",
            witness: {
              relevantWallSigns,
              retainedIncidentRankTwoCellIds:
                evaluation.retainedIncidentRankTwoCellIds,
              link,
            },
          };
        }
        firstFailure ??= { relevantWallSigns, failures };
      }
      if (assignmentsToTest < assignmentSpaceSize) {
        return {
          ...base,
          status: "not-run-assignment-cap",
          exact: false,
          assignmentSpaceSize,
          assignmentsTested: assignmentsToTest,
          terminationReason: "assignment-cap",
          ...(firstFailure ? { firstFailure } : {}),
        };
      }
      return {
        ...base,
        status: "infeasible",
        exact: true,
        assignmentSpaceSize,
        assignmentsTested: assignmentSpaceSize,
        terminationReason: "assignment-space-exhausted",
        ...(firstFailure ? { firstFailure } : {}),
      };
    })
    .sort((left, right) => left.vertexId.localeCompare(right.vertexId));
  const feasibleVertexCount = records.filter(
    (record) => record.status === "feasible",
  ).length;
  const infeasibleVertexCount = records.filter(
    (record) => record.status === "infeasible",
  ).length;
  const incompleteVertexCount =
    records.length - feasibleVertexCount - infeasibleVertexCount;
  return {
    method: "exact-projected-wall-enumeration-per-vertex",
    interpretation: "necessary-not-sufficient-for-one-global-coorientation",
    exactWallLimit,
    assignmentCapPerVertex: assignmentCap,
    vertexCount: records.length,
    feasibleVertexCount,
    infeasibleVertexCount,
    incompleteVertexCount,
    everyVertexIndividuallyFeasible:
      infeasibleVertexCount > 0
        ? false
        : incompleteVertexCount > 0
          ? null
          : true,
    records,
  };
}

function definitions(): TrackAWallPreflightCertificate["definitions"] {
  return {
    wall: "A whole equivalence component of supplied geometric edges under every declared dual segment through every supplied rank-two cell; the computation does not sample representative edges.",
    wallGerm:
      "One endpoint of one geometric edge at a quotient vertex; the two ends of a loop are distinct germs.",
    twoSided:
      "The signed edge-direction constraints across every dual segment admit a coherent {+1,-1} assignment on the wall.",
    repeatedWallGerm:
      "A wall has at least two distinct edge-end germs at the same quotient vertex; this is reported before deciding whether a rank-two corner supports the pair.",
    selfIntersectionAnalogue:
      "Two declared crossing dual segments in one rank-two cell belong to the same wall, or one dual segment pairs two occurrences of the same quotient edge.",
    selfOsculation:
      "Two germs of the same wall meet at a vertex and that exact germ pair is not the corner of any supplied rank-two cell.",
    directSelfOsculation:
      "For a two-sided wall, the two unsupported germs have the same in/out direction; global wall reversal preserves this classification.",
    indirectSelfOsculation:
      "For a two-sided wall, the two unsupported germs have opposite in/out directions; global wall reversal preserves this classification.",
    crossing:
      "Two distinct walls cross when declared crossing dual segments representing them occur in one rank-two cell.",
    interOsculation:
      "The same pair of distinct walls crosses in at least one rank-two cell and has an unsupported pair of germs at some vertex.",
    retainedRankTwoCell:
      "For a coorientation, a rank-two cell is retained exactly when its cyclic signed boundary has two sign transitions, equivalently one source and one sink.",
    directedLink:
      "At a vertex, directed link vertices are edge germs pointing out or in; a retained rank-two corner is directed when every dual segment points away from or toward that corner. Feasibility requires both induced graphs to be nonempty and connected.",
  };
}

function buildTriage(
  cleanliness: TrackAWallCleanlinessReport,
  perVertex: TrackAPerVertexNecessaryFeasibility,
  global: TrackALocalMorseFeasibility,
): TrackAPreflightTriageEntry[] {
  const oneSided = cleanliness.pathologyCounts.oneSidedWalls.count;
  const pathologies = cleanliness.pathologyCounts;
  const result: TrackAPreflightTriageEntry[] = [
    {
      order: 1,
      gate: "two-sidedness",
      disposition: oneSided === 0 ? "pass" : "hard-stop",
      detail:
        oneSided === 0
          ? `All ${cleanliness.wallCount} whole wall components admit coherent coorientations.`
          : `${oneSided} of ${cleanliness.wallCount} whole wall components fail the exact parity gate.`,
    },
  ];
  result.push({
    order: 2,
    gate: "projected-per-vertex-morse",
    disposition:
      oneSided > 0
        ? "incomplete"
        : perVertex.everyVertexIndividuallyFeasible === false
          ? "exact-obstruction"
          : perVertex.everyVertexIndividuallyFeasible === true
            ? "pass"
            : "incomplete",
    detail:
      oneSided > 0
        ? "The strict wall-origin Track A branch stops at two-sidedness; projected records are retained only as diagnostics."
        : perVertex.everyVertexIndividuallyFeasible === false
          ? `${perVertex.infeasibleVertexCount} vertex problem(s) exhaust their projected sign spaces without a legal directed link.`
          : perVertex.everyVertexIndividuallyFeasible === true
            ? `All ${perVertex.vertexCount} vertices have exact projected witnesses; these witnesses need not be mutually compatible.`
            : `${perVertex.incompleteVertexCount} projected vertex problem(s) reached a declared variable or assignment cap.`,
  });
  result.push({
    order: 3,
    gate: "global-coorientation-morse",
    disposition:
      oneSided > 0
        ? "incomplete"
        : global.status === "feasible"
          ? "survivor"
          : global.status === "infeasible"
            ? "exact-obstruction"
            : "incomplete",
    detail:
      oneSided > 0
        ? "No global sign enumeration is interpreted after the two-sidedness hard stop."
        : global.status === "feasible"
          ? `A single coorientation passes every supplied rank-two vertex link after ${global.assignmentsTested} assignment(s).`
          : global.status === "infeasible"
            ? `The complete reversal-reduced space of ${global.assignmentSpaceSize ?? 0} global assignments has no witness.`
            : `The global search stopped by ${global.terminationReason} after ${global.assignmentsTested} assignment(s); this is not an obstruction.`,
  });
  result.push({
    order: 4,
    gate: "wall-cleanliness-diagnostics",
    disposition: "diagnostic-only",
    detail:
      `${pathologies.repeatedWallGermSites.count}/${pathologies.repeatedWallGermSites.universe} vertex-wall sites repeat germs; ` +
      `${pathologies.selfIntersectionSites.count}/${pathologies.selfIntersectionSites.universe} declared local-intersection sites self-intersect; ` +
      `${pathologies.directSelfOsculatingGermPairs.count} direct, ${pathologies.indirectSelfOsculatingGermPairs.count} indirect, and ${pathologies.unorientableSelfOsculatingGermPairs.count} unorientable self-osculating germ pairs; ` +
      `${pathologies.interOsculatingWallPairs.count}/${pathologies.interOsculatingWallPairs.universe} unordered wall pairs inter-osculate. These counts do not veto rank-two Morse feasibility.`,
  });
  return result;
}

/** Exact wall-cleanliness diagnostics followed by bounded exact enumeration. */
export function buildTrackAWallPreflightCertificate(
  inputValue: unknown,
  options: TrackAWallPreflightOptions = {},
): TrackAWallPreflightCertificate {
  const exactWallLimit = options.exactWallLimit ?? DEFAULT_EXACT_WALL_LIMIT;
  const perVertexExactWallLimit =
    options.perVertexExactWallLimit ?? DEFAULT_PER_VERTEX_EXACT_WALL_LIMIT;
  const assignmentCap = options.assignmentCap ?? DEFAULT_ASSIGNMENT_CAP;
  if (
    !Number.isSafeInteger(exactWallLimit) ||
    exactWallLimit < 0 ||
    exactWallLimit > MAX_EXACT_WALL_LIMIT ||
    !Number.isSafeInteger(perVertexExactWallLimit) ||
    perVertexExactWallLimit < 0 ||
    perVertexExactWallLimit > MAX_EXACT_WALL_LIMIT
  ) {
    throw new TrackAWallPreflightError("Invalid exact wall limit", [
      `exactWallLimit and perVertexExactWallLimit must be integers in 0..${MAX_EXACT_WALL_LIMIT}.`,
    ]);
  }
  if (
    !Number.isSafeInteger(assignmentCap) ||
    assignmentCap < 1 ||
    assignmentCap > MAX_ASSIGNMENT_CAP
  ) {
    throw new TrackAWallPreflightError("Invalid assignment cap", [
      `assignmentCap must be an integer in 1..${MAX_ASSIGNMENT_CAP}.`,
    ]);
  }
  const data = normalizeInput(inputValue);
  const cleanliness = diagnoseCleanliness(data);
  const perVertex = perVertexNecessaryFeasibility(
    data,
    perVertexExactWallLimit,
    assignmentCap,
  );
  const global = globalMorseFeasibility(data, exactWallLimit, assignmentCap);
  const triage = buildTriage(cleanliness, perVertex, global);
  if (data.germs.length !== 2 * data.input.edges.length) {
    throw new TrackAWallPreflightError("Incomplete wall-germ catalogue", [
      "Every geometric edge must contribute exactly two endpoint germs.",
    ]);
  }
  if (
    data.cells.reduce((sum, cell) => sum + cell.boundary.length, 0) !==
    data.input.rankTwoCells.reduce((sum, cell) => sum + cell.boundary.length, 0)
  ) {
    throw new TrackAWallPreflightError("Incomplete rank-two corner catalogue", [
      "Every supplied rank-two boundary corner must be retained by normalization.",
    ]);
  }
  const status: TrackAWallPreflightCertificate["status"] =
    global.status === "feasible"
      ? "rank-two-feasible"
      : global.status === "infeasible" ||
          perVertex.everyVertexIndividuallyFeasible === false
        ? "rank-two-infeasible"
        : "preflight-incomplete";
  const body: Omit<TrackAWallPreflightCertificate, "artifactDigest"> = {
    schemaVersion: 1,
    kind: "track-a-wall-cleanliness-and-local-morse-preflight",
    status,
    method: "exact-rank-two-wall-germ-preflight",
    source: {
      ...data.input.source,
      inputName: data.input.name,
      inputCanonicalSha256: canonicalSha256(data.input),
    },
    definitions: definitions(),
    counts: {
      vertices: data.input.vertices.length,
      edges: data.input.edges.length,
      rankTwoCells: data.input.rankTwoCells.length,
    },
    cleanliness,
    perVertexNecessaryFeasibility: perVertex,
    globalMorseFeasibility: global,
    triage,
    checks: {
      inputValid: true,
      wallEquivalenceComplete: true,
      everySuppliedEdgeAndSegmentBoundToOneWholeWallComponent: true,
      parityConstraintsExact: true,
      everyEdgeEndGermRecorded: true,
      everyRankTwoCornerRecorded: true,
      localEnumerationExactWhenCompleted:
        global.exact ||
        global.status === "not-run-variable-limit" ||
        global.status === "not-run-assignment-cap",
    },
    conclusion: !cleanliness.twoSided
      ? "The strict wall-origin Track A branch stops at the exact two-sidedness gate; no rank-two Morse survivor is claimed."
      : global.status === "feasible"
        ? "One global wall coorientation gives nonempty connected ascending and descending retained rank-two links at every supplied vertex."
        : perVertex.everyVertexIndividuallyFeasible === false
          ? "At least one vertex has an exact projected-wall obstruction, so no global wall coorientation can pass the supplied rank-two gate."
          : global.status === "infeasible"
            ? "The complete global assignment space is exhausted with no coorientation passing every supplied vertex."
            : "Every completed projected-vertex gate is recorded, but the stronger global coorientation search reached a declared variable or assignment cap.",
    nonClaims: [
      "This preflight checks only the supplied rank-two skeleton.",
      "It does not construct the coface-closed higher-cell lawful complex or a compatible subdivision.",
      "It does not check links at retained higher-cell barycenters or other new subdivision vertices.",
      "Local feasibility is not a finite-height-band, pi1-surjection, or fibering certificate.",
      "Crossing and osculation use the explicit dual-segment and crossing data; no cubical carrier geometry is inferred.",
      "Separate per-vertex witnesses need not agree on one global wall coorientation; they are necessary feasibility evidence only.",
      "A capped global search with no witness is incomplete, not an obstruction.",
      "Apart from two-sidedness, cleanliness pathologies are diagnostic and do not by themselves veto the retained rank-two Morse search.",
      "The normalized pathology counts are combinatorial counts over stated universes, not probabilities or success scores.",
    ],
  };
  return { ...body, artifactDigest: canonicalSha256(body) };
}

/** Seal an explicit reason why the generic rank-two preflight cannot run. */
export function buildTrackAWallPreflightUnavailableCertificate(
  input: Omit<
    TrackAWallPreflightUnavailableCertificate,
    "schemaVersion" | "kind" | "method" | "artifactDigest"
  >,
): TrackAWallPreflightUnavailableCertificate {
  if (
    input.status === "hard-stop-one-sided" &&
    input.gate.twoSidedness !== "failed-by-bound-source-certificate"
  ) {
    throw new TrackAWallPreflightError("Invalid unavailable preflight record", [
      "A hard-stop-one-sided record must bind a failed two-sidedness certificate.",
    ]);
  }
  if (
    input.status === "not-runnable-unmaterialized" &&
    input.gate.rankTwoComplexMaterialized
  ) {
    throw new TrackAWallPreflightError("Invalid unavailable preflight record", [
      "An unmaterialized record cannot claim a materialized rank-two complex.",
    ]);
  }
  const body: Omit<
    TrackAWallPreflightUnavailableCertificate,
    "artifactDigest"
  > = {
    schemaVersion: 1,
    kind: "track-a-wall-preflight-unavailable",
    method: "bound-source-evidence-gate",
    ...input,
  };
  return { ...body, artifactDigest: canonicalSha256(body) };
}

export function replayTrackAWallPreflightUnavailableCertificate(
  storedValue: unknown,
  rebuilt: TrackAWallPreflightUnavailableCertificate,
): TrackAWallPreflightReplay {
  const errors: string[] = [];
  if (!isRecord(storedValue)) {
    return { valid: false, errors: ["Stored certificate must be an object."] };
  }
  const storedDigest = storedValue.artifactDigest;
  if (typeof storedDigest !== "string") {
    errors.push("Stored artifactDigest is missing.");
  } else {
    const storedBody = { ...storedValue };
    delete storedBody.artifactDigest;
    if (canonicalSha256(storedBody) !== storedDigest) {
      errors.push("Stored artifactDigest is stale.");
    }
  }
  if (canonicalSha256(storedValue) !== canonicalSha256(rebuilt)) {
    errors.push(
      "Fresh source-bound reconstruction differs from the stored record.",
    );
  }
  return {
    valid: errors.length === 0,
    ...(typeof storedDigest === "string"
      ? { storedArtifactDigest: storedDigest }
      : {}),
    rebuiltArtifactDigest: rebuilt.artifactDigest,
    errors,
  };
}

export function replayTrackAWallPreflightCertificate(
  storedValue: unknown,
  inputValue: unknown,
  options: TrackAWallPreflightOptions = {},
): TrackAWallPreflightReplay {
  const errors: string[] = [];
  if (!isRecord(storedValue)) {
    return { valid: false, errors: ["Stored certificate must be an object."] };
  }
  const storedDigest = storedValue.artifactDigest;
  if (typeof storedDigest !== "string")
    errors.push("Stored artifactDigest is missing.");
  const storedBody = { ...storedValue };
  delete storedBody.artifactDigest;
  if (
    typeof storedDigest === "string" &&
    canonicalSha256(storedBody) !== storedDigest
  ) {
    errors.push("Stored artifactDigest is stale.");
  }
  let rebuilt: TrackAWallPreflightCertificate | undefined;
  try {
    rebuilt = buildTrackAWallPreflightCertificate(inputValue, options);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (rebuilt && canonicalSha256(storedValue) !== canonicalSha256(rebuilt)) {
    errors.push("Fresh reconstruction differs from the stored certificate.");
  }
  return {
    valid: errors.length === 0,
    ...(typeof storedDigest === "string"
      ? { storedArtifactDigest: storedDigest }
      : {}),
    ...(rebuilt ? { rebuiltArtifactDigest: rebuilt.artifactDigest } : {}),
    errors,
  };
}

/** Adapt the exact materialized rank-two compression already used by Track A. */
export function trackAWallPreflightInputFromBarX(
  barX: BarXCompressedComplex,
  source: Partial<TrackAWallPreflightInput["source"]> = {},
): TrackAWallPreflightInput {
  return parseTrackAWallPreflightInput({
    schemaVersion: 1,
    kind: "track-a-wall-preflight-input",
    name: `${barX.name} Track A wall preflight`,
    source: {
      kind: source.kind ?? "bar-x-compression",
      name: source.name ?? barX.name,
      archiveHash:
        source.archiveHash ??
        canonicalSha256(JSON.parse(JSON.stringify(barX)) as unknown),
      notes: source.notes ?? [],
    },
    vertices: barX.vertices.map((vertex) => ({ id: vertex.id })),
    edges: barX.geometricEdges.map((edge) => ({
      id: edge.id,
      sourceVertexId: edge.sourceVertexId,
      targetVertexId: edge.targetVertexId,
      generator: edge.generator,
    })),
    rankTwoCells: barX.relationCells.map((cell) => ({
      id: cell.id,
      boundary: [...cell.boundaryOccurrences]
        .sort((left, right) => left.boundaryIndex - right.boundaryIndex)
        .map((occurrence) => ({
          edgeId: occurrence.edgeId,
          traversal: occurrence.traversal,
        })),
    })),
  });
}

/**
 * Bind a materialized rank-two skeleton to a passed generalized-compression
 * certificate. The certificate itself stores hashes, so the actual boundary
 * data still comes from its required materialized bar-X bridge.
 */
export function trackAWallPreflightInputFromGeneralizedCompression(
  barX: BarXCompressedComplex,
  certificate: GeneralizedCompressionCertificate,
): TrackAWallPreflightInput {
  const agreement = certificate.rankAtMostTwoAgreement;
  const errors: string[] = [];
  if (certificate.status !== "passed")
    errors.push("Generalized compression is not passed.");
  if (agreement.scope !== "materialized-artifact") {
    errors.push("Generalized compression has no materialized rank-two bridge.");
  }
  if (agreement.checks.materializedCompressionSupplied !== true) {
    errors.push(
      "Generalized compression did not certify a supplied materialized compression.",
    );
  }
  if (agreement.counts.vertices !== barX.vertices.length)
    errors.push("Vertex counts disagree.");
  if (agreement.counts.geometricEdges !== barX.geometricEdges.length)
    errors.push("Edge counts disagree.");
  if (agreement.counts.rankTwoCells !== barX.relationCells.length)
    errors.push("Rank-two cell counts disagree.");
  if (errors.length > 0) {
    throw new TrackAWallPreflightError(
      "Cannot bind generalized compression",
      errors,
    );
  }
  return trackAWallPreflightInputFromBarX(barX, {
    kind: "generalized-compression-rank-two-bridge",
    name: barX.name,
    archiveHash: certificate.archiveHash,
    notes: [
      "Rank-two data is the materialized bridge certified by the generalized compression.",
    ],
  });
}
