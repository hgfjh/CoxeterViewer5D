import { parseCoxeterSystemInput } from "../coxeter";
import { planSphericalSpecialSubgroups } from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";

export type StreamedOrientationSign = 1 | -1;

export interface StreamedWallSignCandidate {
  id: string;
  /**
   * Signs are keyed by the stable wall ids returned by the oracle. Requiring
   * the complete map prevents a bare bit mask from silently changing meaning
   * when the wall order changes.
   */
  wallSigns: Readonly<Record<string, StreamedOrientationSign>>;
}

export interface StreamedSphericalType {
  typeIndex: number;
  id: string;
  generators: number[];
  generatorMask: number;
  dimension: number;
  subgroupOrder: number;
  cellCount: number;
}

export interface StreamedDavisCell {
  typeIndex: number;
  generators: number[];
  generatorMask: number;
  representativePoint: number;
  dimension: number;
}

export interface StreamedGeometricEdge {
  edgeIndex: number;
  id: string;
  generator: number;
  sourcePoint: number;
  targetPoint: number;
}

export interface StreamedRankTwoBoundaryOccurrence {
  boundaryIndex: number;
  edgeIndex: number;
  edgeId: string;
  generator: number;
  sourcePoint: number;
  targetPoint: number;
  traversal: StreamedOrientationSign;
}

export interface StreamedRankTwoCell {
  cell: StreamedDavisCell;
  m: number;
  boundary: StreamedRankTwoBoundaryOccurrence[];
}

export interface StreamedWall {
  wallIndex: number;
  id: string;
  canonicalEdgeIndex: number;
  canonicalEdgeId: string;
  edgeCount: number;
  crossingSegmentCount: number;
  parityConflictCount: number;
  twoSided: boolean;
}

export interface StreamedWallSystemSummary {
  wallCount: number;
  edgeCount: number;
  crossingSegmentCount: number;
  twoSided: boolean;
  walls: StreamedWall[];
  structureHash: string;
}

export interface StreamedClosureCandidateSummary {
  candidateIndex: number;
  candidateId: string;
  coorientationHash: string;
  /** Hash of this candidate's one-bit retained-cell stream only. */
  retentionHash: string;
  /** Hash of this candidate's retained set and immediate closure audit. */
  closureHash: string;
  retainedCellCountByDimension: Record<string, number>;
  discardedCellCountByDimension: Record<string, number>;
  retainedCellCount: number;
  discardedCellCount: number;
  immediateIncidenceCount: number;
  downwardClosureViolationCount: number;
  checks: {
    allVerticesAndEdgesRetained: boolean;
    higherCellsUseEveryRankTwoFace: boolean;
    retainedCellsDownwardClosed: boolean;
  };
}

export interface StreamedClosureSummary {
  status: "passed" | "failed";
  method: "rank-two-lawfulness-and-coface-upset-complement";
  candidateSummaries: StreamedClosureCandidateSummary[];
  immediateIncidenceCount: number;
  downwardClosureViolationCount: number;
  downwardClosureViolationWitnesses: Array<{
    faceCellId: string;
    cofaceCellId: string;
    candidateIds: string[];
  }>;
  checks: {
    allVerticesAndEdgesRetained: boolean;
    higherCellsUseEveryRankTwoFace: boolean;
    retainedCellsDownwardClosed: boolean;
  };
  hashAlgorithm: "sha256-chunk-tree-v1";
  retentionHash: string;
  closureHash: string;
}

export interface StreamedMetricFlagWitness {
  point: number;
  sphericalTypeId: string;
  sphericalCellId: string;
  /** Every listed pair cell is retained although the higher cell is not. */
  pairCellIds: string[];
  /** The first canonical nonlocal two-face which caused the coface deletion. */
  unlawfulRankTwoFaceCellId: string;
  unlawfulRankTwoFaceRepresentativePoint: number;
}

export interface StreamedMetricFlagResult {
  status: "passed" | "not-established";
  candidateId: string;
  checkedPointTypePairs: number;
  violationCount: number;
  witnesses: StreamedMetricFlagWitness[];
  metricallyFlag: boolean;
  locallyCatZero: boolean;
  /**
   * A failed sufficient condition is inconclusive about asphericity; it is
   * not evidence that the universal cover is noncontractible.
   */
  universalCoverContractibleByMoussongMetric: boolean;
  nonClaims: string[];
}

export type StreamedNativeLinkFailureKind =
  | "ascending-empty"
  | "descending-empty"
  | "ascending-disconnected"
  | "descending-disconnected";

export interface StreamedNativeLinkFailureWitness {
  point: number;
  kind: StreamedNativeLinkFailureKind;
  ascendingGenerators: number[];
  descendingGenerators: number[];
  /** Connected components in the failing induced finite-pair graph. */
  disconnectedComponents?: number[][];
}

export interface StreamedNativeLinkMaskSummary {
  mask: number;
  candidateId: string;
  /** Explicitly binds the numeric mask to this oracle's canonical wall ids. */
  wallSigns: Readonly<Record<string, StreamedOrientationSign>>;
  lawfulRankTwoCellCount: number;
  passed: boolean;
  failingPointCount: number;
  failureCounts: Readonly<Record<StreamedNativeLinkFailureKind, number>>;
  firstFailure?: StreamedNativeLinkFailureWitness;
}

export interface StreamedNativeVertexLinkPrefilterResult {
  status: "completed";
  method: "native-full-davis-vertex-link-germ-connectivity";
  oracleStructureHash: string;
  orderedWallIds: string[];
  maskConvention: {
    bitNumbering: "least-significant-bit-is-ordered-wall-index";
    zeroBitSign: 1;
    oneBitSign: -1;
    maskMinimum: 0;
    maskMaximum: number;
    globalSignComplementXorMask: number;
  };
  finitePairGeneratorEdges: Array<[number, number]>;
  candidateCount: number;
  rankTwoCellCount: number;
  maskSummaries: StreamedNativeLinkMaskSummary[];
  survivorMasks: number[];
  survivorCandidates: StreamedWallSignCandidate[];
  checks: {
    exhaustiveCanonicalMasks: boolean;
    allWallsTwoSided: boolean;
    survivorsHaveBothDirectionsNonemptyAtEveryPoint: boolean;
    survivorsHaveConnectedFinitePairGraphsAtEveryPoint: boolean;
  };
  reportHash: string;
}

export interface StreamedLawfulEvaluation {
  readonly oracleStructureHash: string;
  readonly candidateCount: number;
  readonly candidates: readonly StreamedWallSignCandidate[];
  readonly closure: StreamedClosureSummary;
  retentionBits(cell: StreamedDavisCell): number;
  isRetained(cell: StreamedDavisCell, candidateIndex: number): boolean;
  edgeIncrement(
    point: number,
    generator: number,
    candidateIndex: number,
  ): StreamedOrientationSign;
  isMaximalRetained(cell: StreamedDavisCell, candidateIndex: number): boolean;
  checkMoussongMetricFlag(
    candidateIndex: number,
    witnessLimit?: number,
  ): StreamedMetricFlagResult;
}

export interface StreamedLawfulDavisOracle {
  readonly system: CoxeterSystemInput;
  readonly degree: number;
  readonly generatorCount: number;
  readonly geometricEdgeCount: number;
  readonly rankTwoCellCount: number;
  readonly cellCount: number;
  readonly cellCountByDimension: Readonly<Record<string, number>>;
  readonly sphericalTypes: readonly StreamedSphericalType[];
  readonly walls: StreamedWallSystemSummary;
  readonly actionRowsCanonicalSha256: string;
  readonly structureHash: string;
  neighbor(point: number, generator: number): number;
  geometricEdge(point: number, generator: number): StreamedGeometricEdge;
  wallForGeometricEdge(edgeIndex: number): StreamedWall;
  wallIdForEdge(point: number, generator: number): string;
  wallBinding(
    point: number,
    generator: number,
  ): {
    wallId: string;
    edgeIndex: number;
    edgeId: string;
    edgeParity: StreamedOrientationSign;
  };
  cellId(cell: StreamedDavisCell): string;
  cellContaining(typeIndex: number, point: number): StreamedDavisCell;
  cellVertices(cell: StreamedDavisCell): Uint32Array;
  forEachCell(
    typeIndex: number,
    visitor: (cell: StreamedDavisCell) => void,
  ): void;
  forEachFacet(
    cell: StreamedDavisCell,
    visitor: (facet: StreamedDavisCell) => void,
  ): void;
  forEachCofacet(
    cell: StreamedDavisCell,
    visitor: (cofacet: StreamedDavisCell) => void,
  ): void;
  forEachRankTwoFace(
    cell: StreamedDavisCell,
    visitor: (face: StreamedDavisCell) => void,
  ): void;
  forEachRankTwoCell(visitor: (cell: StreamedRankTwoCell) => void): void;
  bindCoorientations(
    candidates: readonly StreamedWallSignCandidate[],
  ): StreamedLawfulEvaluation;
  /**
   * Exhaust every sign map in the oracle's canonical wall order and apply the
   * necessary ascending/descending native Davis-link connectivity test.
   */
  enumerateNativeVertexLinkPrefilter(): StreamedNativeVertexLinkPrefilterResult;
}

export interface StreamedLawfulDavisInput {
  system: unknown;
  /** `generatorImages[g][q]` is the endpoint of the right generator step. */
  generatorImages: readonly (readonly number[])[];
}

interface PackedAction {
  degree: number;
  rows: Uint32Array[];
}

type PackedOrdinalArray = Uint16Array | Uint32Array;

interface InternalSphericalType extends StreamedSphericalType {
  ordinalByPoint?: PackedOrdinalArray;
  representatives?: Uint32Array;
  ordinalSentinel?: number;
  immediateFaceTypeIndices: number[];
  rankTwoFaceTypeIndices: number[];
  immediateCofaceTypeIndices: number[];
}

interface PackedEdges {
  byGeneratorPoint: Uint32Array;
  generator: Uint16Array;
  source: Uint32Array;
  target: Uint32Array;
}

interface InternalWalls {
  summary: StreamedWallSystemSummary;
  edgeToWall: Uint32Array;
  edgeParity: Int8Array;
}

const UINT16_SENTINEL = 0xffff;
const UINT32_SENTINEL = 0xffff_ffff;
const MAX_CANDIDATES = 32;
const MAX_CLOSURE_WITNESSES = 32;
const MAX_EXHAUSTIVE_PREFILTER_BITS = 16;

export class StreamedLawfulDavisError extends Error {
  readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(`${message}:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "StreamedLawfulDavisError";
    this.errors = errors;
  }
}

class ParityDisjointSet {
  readonly parent: Uint32Array;
  private readonly rank: Uint8Array;
  /** XOR from a node to its parent: zero means equal transverse signs. */
  private readonly parity: Uint8Array;
  private readonly conflicts: Uint32Array;

  constructor(size: number) {
    this.parent = new Uint32Array(size);
    this.rank = new Uint8Array(size);
    this.parity = new Uint8Array(size);
    this.conflicts = new Uint32Array(size);
    for (let index = 0; index < size; index += 1) this.parent[index] = index;
  }

  find(item: number): { root: number; parity: number } {
    let root = item;
    let parityToRoot = 0;
    while (this.parent[root] !== root) {
      parityToRoot ^= this.parity[root];
      root = this.parent[root];
    }

    let current = item;
    let accumulated = 0;
    while (this.parent[current] !== current) {
      const next = this.parent[current];
      const step = this.parity[current];
      this.parent[current] = root;
      this.parity[current] = parityToRoot ^ accumulated;
      accumulated ^= step;
      current = next;
    }
    return { root, parity: parityToRoot };
  }

  /** Require parity(first) XOR parity(second) to equal `requiredXor`. */
  union(first: number, second: number, requiredXor: number): boolean {
    const left = this.find(first);
    const right = this.find(second);
    const required = requiredXor & 1;
    if (left.root === right.root) {
      const consistent = (left.parity ^ right.parity) === required;
      if (!consistent) this.conflicts[left.root] += 1;
      return consistent;
    }

    const relation = left.parity ^ right.parity ^ required;
    if (this.rank[left.root] < this.rank[right.root]) {
      this.parent[left.root] = right.root;
      this.parity[left.root] = relation;
      this.conflicts[right.root] += this.conflicts[left.root];
    } else {
      this.parent[right.root] = left.root;
      this.parity[right.root] = relation;
      this.conflicts[left.root] += this.conflicts[right.root];
      if (this.rank[left.root] === this.rank[right.root]) {
        this.rank[left.root] += 1;
      }
    }
    return true;
  }

  conflictCount(item: number): number {
    return this.conflicts[this.find(item).root];
  }
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function compareNumberArrays(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length) return left.length - right.length;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneJsonData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreezePublicSnapshot<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  // Typed arrays are kept private by this oracle. Avoid pretending that
  // Object.freeze gives their indexed entries immutable semantics.
  if (ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) deepFreezePublicSnapshot(child);
  return Object.freeze(value);
}

function generatorMask(generators: readonly number[]): number {
  let mask = 0;
  for (const generator of generators) mask |= 1 << generator;
  return mask >>> 0;
}

function isSubsetMask(left: number, right: number): boolean {
  return (left & right) === left;
}

function safeSubgroupOrder(decimal: string, id: string): number {
  let exact: bigint;
  try {
    exact = BigInt(decimal);
  } catch {
    throw new StreamedLawfulDavisError("Invalid spherical subgroup order", [
      `${id} has non-integral order ${JSON.stringify(decimal)}.`,
    ]);
  }
  if (exact < 1n || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StreamedLawfulDavisError("Invalid spherical subgroup order", [
      `${id} has order ${decimal}, outside the safe packed-action range.`,
    ]);
  }
  return Number(exact);
}

function allCandidateBits(candidateCount: number): number {
  return candidateCount === 32
    ? UINT32_SENTINEL
    : (2 ** candidateCount - 1) >>> 0;
}

function candidateBit(candidateIndex: number): number {
  return (2 ** candidateIndex) >>> 0;
}

function assertCandidateIndex(index: number, count: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(
      `Candidate index ${index} is outside 0..${count - 1}.`,
    );
  }
}

function pointLabel(point: number): string {
  return `q${point}`;
}

function comparePointLabels(left: number, right: number): number {
  return compareIds(pointLabel(left), pointLabel(right));
}

function storedEdgeEndpoints(first: number, second: number): [number, number] {
  return comparePointLabels(first, second) <= 0
    ? [first, second]
    : [second, first];
}

function edgeStableId(
  generator: number,
  sourcePoint: number,
  targetPoint: number,
): string {
  return `bar:e:g${generator}:${pointLabel(sourcePoint)}:${pointLabel(targetPoint)}`;
}

function cellStableId(cell: StreamedDavisCell): string {
  if (cell.dimension === 0) return `sld:v:q${cell.representativePoint}`;
  return `sld:cell:T${cell.generators.join("-")}:q${cell.representativePoint}`;
}

function packAction(
  system: CoxeterSystemInput,
  sourceRows: readonly (readonly number[])[],
): PackedAction {
  const errors: string[] = [];
  if (sourceRows.length !== system.rank) {
    errors.push(
      `The action has ${sourceRows.length} generator rows; expected ${system.rank}.`,
    );
  }
  const degree = sourceRows[0]?.length ?? 0;
  if (!Number.isSafeInteger(degree) || degree < 1) {
    errors.push("The action degree must be a positive safe integer.");
  }
  const rows: Uint32Array[] = [];
  for (let generator = 0; generator < sourceRows.length; generator += 1) {
    const source = sourceRows[generator];
    if (source.length !== degree) {
      errors.push(
        `Generator ${generator} has degree ${source.length}; expected ${degree}.`,
      );
      continue;
    }
    const row = new Uint32Array(degree);
    const seen = new Uint8Array(degree);
    for (let point = 0; point < degree; point += 1) {
      const image = source[point];
      if (!Number.isInteger(image) || image < 0 || image >= degree) {
        errors.push(
          `Generator ${generator} sends q${point} outside 0..${degree - 1}.`,
        );
        continue;
      }
      if (seen[image] !== 0) {
        errors.push(`Generator ${generator} repeats image q${image}.`);
      }
      seen[image] = 1;
      row[point] = image;
    }
    rows.push(row);
  }
  if (errors.length > 0) {
    throw new StreamedLawfulDavisError(
      "Invalid packed permutation action",
      errors,
    );
  }

  for (let generator = 0; generator < system.rank; generator += 1) {
    const row = rows[generator];
    for (let point = 0; point < degree; point += 1) {
      const image = row[point];
      if (image === point) {
        errors.push(`Generator ${generator} fixes q${point}.`);
        break;
      }
      if (row[image] !== point) {
        errors.push(
          `Generator ${generator} is not an involution at q${point}.`,
        );
        break;
      }
    }
  }
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const m = system.coxeterMatrix[left][right];
      if (m === "inf") continue;
      for (let point = 0; point < degree; point += 1) {
        let current = point;
        for (let repetition = 0; repetition < m; repetition += 1) {
          current = rows[right][rows[left][current]];
        }
        if (current !== point) {
          errors.push(
            `The (${left},${right}) Coxeter relation of order ${m} fails at q${point}.`,
          );
          break;
        }
      }
    }
  }
  const visited = new Uint8Array(degree);
  const queue = new Uint32Array(degree);
  visited[0] = 1;
  queue[0] = 0;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const point = queue[head++];
    for (const row of rows) {
      const image = row[point];
      if (visited[image] !== 0) continue;
      visited[image] = 1;
      queue[tail++] = image;
    }
  }
  if (tail !== degree) {
    errors.push(`The action orbit of q0 has size ${tail}; expected ${degree}.`);
  }
  if (errors.length > 0) {
    throw new StreamedLawfulDavisError(
      "The packed action does not define the required transitive Coxeter action",
      errors,
    );
  }
  return { degree, rows };
}

/**
 * Hash large rows without first copying them into one JSON number matrix.
 * Fixed chunk boundaries make the digest independently replayable.
 */
function hashPackedActionRows(action: PackedAction): string {
  const chunkSize = 4_096;
  const rowChunkHashes = action.rows.map((row, generator) => {
    const chunks: string[] = [];
    for (let start = 0; start < row.length; start += chunkSize) {
      chunks.push(
        canonicalSha256({
          generator,
          start,
          images: Array.from(row.subarray(start, start + chunkSize)),
        }),
      );
    }
    return canonicalSha256({
      generator,
      degree: action.degree,
      chunkSize,
      chunks,
    });
  });
  return canonicalSha256({
    schemaVersion: 1,
    method: "fixed-row-chunk-sha256-tree",
    degree: action.degree,
    generatorCount: action.rows.length,
    chunkSize,
    rowChunkHashes,
  });
}

function buildSphericalTypes(
  system: CoxeterSystemInput,
  degree: number,
): InternalSphericalType[] {
  if (system.rank > 30) {
    throw new StreamedLawfulDavisError("Unsupported source rank", [
      "Packed generator masks currently support Coxeter rank at most 30.",
    ]);
  }
  const plan = planSphericalSpecialSubgroups(system);
  if (plan.status !== "complete") {
    throw new StreamedLawfulDavisError(
      "A complete spherical-subgroup plan is required",
      plan.warnings.length > 0 ? plan.warnings : ["The plan is incomplete."],
    );
  }
  const planned = [...plan.sphericalSubgroups].sort((left, right) =>
    compareNumberArrays(left.generators, right.generators),
  );
  const types: InternalSphericalType[] = [
    {
      typeIndex: 0,
      id: "T:empty",
      generators: [],
      generatorMask: 0,
      dimension: 0,
      subgroupOrder: 1,
      cellCount: degree,
      immediateFaceTypeIndices: [],
      rankTwoFaceTypeIndices: [],
      immediateCofaceTypeIndices: [],
    },
  ];
  for (const subgroup of planned) {
    const order = safeSubgroupOrder(subgroup.order.decimal, subgroup.id);
    if (degree % order !== 0) {
      throw new StreamedLawfulDavisError("Incompatible spherical orbit size", [
        `${subgroup.id} has order ${order}, which does not divide degree ${degree}.`,
      ]);
    }
    types.push({
      typeIndex: types.length,
      id: subgroup.id,
      generators: [...subgroup.generators],
      generatorMask: generatorMask(subgroup.generators),
      dimension: subgroup.rank,
      subgroupOrder: order,
      cellCount: degree / order,
      immediateFaceTypeIndices: [],
      rankTwoFaceTypeIndices: [],
      immediateCofaceTypeIndices: [],
    });
  }
  for (const type of types) {
    type.immediateFaceTypeIndices = types
      .filter(
        (candidate) =>
          candidate.dimension === type.dimension - 1 &&
          isSubsetMask(candidate.generatorMask, type.generatorMask),
      )
      .map((candidate) => candidate.typeIndex);
    type.rankTwoFaceTypeIndices = types
      .filter(
        (candidate) =>
          candidate.dimension === 2 &&
          isSubsetMask(candidate.generatorMask, type.generatorMask),
      )
      .map((candidate) => candidate.typeIndex);
    type.immediateCofaceTypeIndices = types
      .filter(
        (candidate) =>
          candidate.dimension === type.dimension + 1 &&
          isSubsetMask(type.generatorMask, candidate.generatorMask),
      )
      .map((candidate) => candidate.typeIndex);
  }
  return types;
}

function createOrdinalArray(
  cellCount: number,
  degree: number,
): {
  values: PackedOrdinalArray;
  sentinel: number;
} {
  if (cellCount < UINT16_SENTINEL) {
    const values = new Uint16Array(degree);
    values.fill(UINT16_SENTINEL);
    return { values, sentinel: UINT16_SENTINEL };
  }
  const values = new Uint32Array(degree);
  values.fill(UINT32_SENTINEL);
  return { values, sentinel: UINT32_SENTINEL };
}

function buildOrbitIndex(
  type: InternalSphericalType,
  action: PackedAction,
): void {
  if (type.dimension === 0) return;
  const { values, sentinel } = createOrdinalArray(
    type.cellCount,
    action.degree,
  );
  const representatives = new Uint32Array(type.cellCount);
  const queue = new Uint32Array(type.subgroupOrder);
  let ordinal = 0;
  for (let root = 0; root < action.degree; root += 1) {
    if (values[root] !== sentinel) continue;
    if (ordinal >= type.cellCount) {
      throw new StreamedLawfulDavisError("Spherical orbit count overflow", [
        `${type.id} produced more than ${type.cellCount} cells.`,
      ]);
    }
    representatives[ordinal] = root;
    values[root] = ordinal;
    queue[0] = root;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const point = queue[head++];
      for (const generator of type.generators) {
        const image = action.rows[generator][point];
        const existing = values[image];
        if (existing === sentinel) {
          if (tail >= queue.length) {
            throw new StreamedLawfulDavisError("Spherical action is not free", [
              `${type.id} has an orbit larger than ${type.subgroupOrder}.`,
            ]);
          }
          values[image] = ordinal;
          queue[tail++] = image;
        } else if (existing !== ordinal) {
          throw new StreamedLawfulDavisError(
            "Spherical orbit partition is inconsistent",
            [`${type.id} joins two previously distinct packed orbits.`],
          );
        }
      }
    }
    if (tail !== type.subgroupOrder) {
      throw new StreamedLawfulDavisError("Spherical action is not free", [
        `${type.id} has an orbit of size ${tail}; expected ${type.subgroupOrder}.`,
      ]);
    }
    ordinal += 1;
  }
  if (ordinal !== type.cellCount) {
    throw new StreamedLawfulDavisError("Spherical orbit count mismatch", [
      `${type.id} produced ${ordinal} cells; expected ${type.cellCount}.`,
    ]);
  }
  type.ordinalByPoint = values;
  type.ordinalSentinel = sentinel;
  type.representatives = representatives;
}

function typeOrThrow(
  types: readonly InternalSphericalType[],
  typeIndex: number,
): InternalSphericalType {
  const type = types[typeIndex];
  if (!type || type.typeIndex !== typeIndex) {
    throw new RangeError(`Unknown spherical type index ${typeIndex}.`);
  }
  return type;
}

function ordinalAt(type: InternalSphericalType, point: number): number {
  if (type.dimension === 0) return point;
  const ordinal = type.ordinalByPoint?.[point];
  if (ordinal === undefined || ordinal === type.ordinalSentinel) {
    throw new StreamedLawfulDavisError("Missing spherical orbit lookup", [
      `${type.id} has no cell at q${point}.`,
    ]);
  }
  return ordinal;
}

function cellFromOrdinal(
  type: InternalSphericalType,
  ordinal: number,
): StreamedDavisCell {
  const representativePoint =
    type.dimension === 0 ? ordinal : type.representatives?.[ordinal];
  if (
    representativePoint === undefined ||
    ordinal < 0 ||
    ordinal >= type.cellCount
  ) {
    throw new RangeError(`Cell ordinal ${ordinal} is invalid for ${type.id}.`);
  }
  return {
    typeIndex: type.typeIndex,
    generators: [...type.generators],
    generatorMask: type.generatorMask,
    representativePoint,
    dimension: type.dimension,
  };
}

function canonicalCellOrThrow(
  cell: StreamedDavisCell,
  types: readonly InternalSphericalType[],
  degree: number,
): StreamedDavisCell {
  const errors: string[] = [];
  if (!Number.isInteger(cell.typeIndex)) {
    errors.push("typeIndex must be an integer.");
  }
  const type = Number.isInteger(cell.typeIndex)
    ? types[cell.typeIndex]
    : undefined;
  if (!type || type.typeIndex !== cell.typeIndex) {
    errors.push(`Unknown spherical type index ${cell.typeIndex}.`);
  }
  if (
    !Number.isInteger(cell.representativePoint) ||
    cell.representativePoint < 0 ||
    cell.representativePoint >= degree
  ) {
    errors.push(`representativePoint must be an integer in 0..${degree - 1}.`);
  }
  if (type) {
    if (cell.dimension !== type.dimension) {
      errors.push(
        `dimension ${cell.dimension} does not match type ${type.id} dimension ${type.dimension}.`,
      );
    }
    if (cell.generatorMask !== type.generatorMask) {
      errors.push(
        `generatorMask ${cell.generatorMask} does not match type ${type.id} mask ${type.generatorMask}.`,
      );
    }
    if (
      !Array.isArray(cell.generators) ||
      cell.generators.length !== type.generators.length ||
      cell.generators.some(
        (generator, index) =>
          !Number.isInteger(generator) || generator !== type.generators[index],
      )
    ) {
      errors.push(`generators do not match type ${type.id}.`);
    }
  }
  if (errors.length > 0 || !type) {
    throw new StreamedLawfulDavisError("Invalid Davis cell descriptor", errors);
  }

  const ordinal = ordinalAt(type, cell.representativePoint);
  const canonical = cellFromOrdinal(type, ordinal);
  if (canonical.representativePoint !== cell.representativePoint) {
    throw new StreamedLawfulDavisError("Invalid Davis cell descriptor", [
      `q${cell.representativePoint} is not the canonical representative of its ${type.id} orbit.`,
    ]);
  }
  return canonical;
}

function assertPoint(point: number, degree: number): void {
  if (!Number.isInteger(point) || point < 0 || point >= degree) {
    throw new RangeError(`Point ${point} is outside 0..${degree - 1}.`);
  }
}

function assertGenerator(generator: number, rank: number): void {
  if (!Number.isInteger(generator) || generator < 0 || generator >= rank) {
    throw new RangeError(`Generator ${generator} is outside 0..${rank - 1}.`);
  }
}

function verticesOfCell(
  cell: StreamedDavisCell,
  types: readonly InternalSphericalType[],
  action: PackedAction,
): Uint32Array {
  const canonical = canonicalCellOrThrow(cell, types, action.degree);
  const type = typeOrThrow(types, canonical.typeIndex);
  const ordinal = ordinalAt(type, canonical.representativePoint);
  if (type.dimension === 0)
    return Uint32Array.of(canonical.representativePoint);
  const result = new Uint32Array(type.subgroupOrder);
  const seen = new Set<number>([canonical.representativePoint]);
  result[0] = canonical.representativePoint;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const point = result[head++];
    for (const generator of type.generators) {
      const image = action.rows[generator][point];
      if (ordinalAt(type, image) !== ordinal) {
        throw new StreamedLawfulDavisError("Cell orbit lookup changed", [
          `${type.id} sends ${cellStableId(canonical)} outside its indexed orbit.`,
        ]);
      }
      if (seen.has(image)) continue;
      seen.add(image);
      result[tail++] = image;
    }
  }
  if (tail !== result.length) {
    throw new StreamedLawfulDavisError("Cell orbit reconstruction failed", [
      `${cellStableId(canonical)} reached ${tail}/${result.length} vertices.`,
    ]);
  }
  result.sort();
  return result;
}

function buildEdges(action: PackedAction, rank: number): PackedEdges {
  const expectedEdgeCount = (action.degree * rank) / 2;
  if (!Number.isSafeInteger(expectedEdgeCount)) {
    throw new StreamedLawfulDavisError("Invalid geometric edge count", [
      `degree*rank/2 is ${expectedEdgeCount}.`,
    ]);
  }
  const byGeneratorPoint = new Uint32Array(action.degree * rank);
  byGeneratorPoint.fill(UINT32_SENTINEL);
  const generator = new Uint16Array(expectedEdgeCount);
  const source = new Uint32Array(expectedEdgeCount);
  const target = new Uint32Array(expectedEdgeCount);
  let edgeIndex = 0;
  for (
    let currentGenerator = 0;
    currentGenerator < rank;
    currentGenerator += 1
  ) {
    const row = action.rows[currentGenerator];
    const offset = currentGenerator * action.degree;
    for (let point = 0; point < action.degree; point += 1) {
      if (byGeneratorPoint[offset + point] !== UINT32_SENTINEL) continue;
      const image = row[point];
      if (image === point) {
        throw new StreamedLawfulDavisError(
          "Cannot index a fixed generator edge",
          [`Generator ${currentGenerator} fixes q${point}.`],
        );
      }
      if (edgeIndex >= expectedEdgeCount) {
        throw new StreamedLawfulDavisError("Geometric edge count overflow", [
          `Expected ${expectedEdgeCount} edges.`,
        ]);
      }
      const [storedSource, storedTarget] = storedEdgeEndpoints(point, image);
      generator[edgeIndex] = currentGenerator;
      source[edgeIndex] = storedSource;
      target[edgeIndex] = storedTarget;
      byGeneratorPoint[offset + point] = edgeIndex;
      byGeneratorPoint[offset + image] = edgeIndex;
      edgeIndex += 1;
    }
  }
  if (edgeIndex !== expectedEdgeCount) {
    throw new StreamedLawfulDavisError("Geometric edge count mismatch", [
      `Indexed ${edgeIndex} edges; expected ${expectedEdgeCount}.`,
    ]);
  }
  return { byGeneratorPoint, generator, source, target };
}

function edgeRecord(
  edges: PackedEdges,
  edgeIndex: number,
): StreamedGeometricEdge {
  if (
    !Number.isInteger(edgeIndex) ||
    edgeIndex < 0 ||
    edgeIndex >= edges.generator.length
  ) {
    throw new RangeError(`Unknown geometric edge index ${edgeIndex}.`);
  }
  const generator = edges.generator[edgeIndex];
  const sourcePoint = edges.source[edgeIndex];
  const targetPoint = edges.target[edgeIndex];
  return {
    edgeIndex,
    id: edgeStableId(generator, sourcePoint, targetPoint),
    generator,
    sourcePoint,
    targetPoint,
  };
}

function edgeIndexAt(
  edges: PackedEdges,
  degree: number,
  point: number,
  generator: number,
): number {
  const edgeIndex = edges.byGeneratorPoint[generator * degree + point];
  if (edgeIndex === UINT32_SENTINEL) {
    throw new StreamedLawfulDavisError("Missing geometric edge", [
      `No edge is indexed at q${point} for generator ${generator}.`,
    ]);
  }
  return edgeIndex;
}

function boundaryForPairCell(
  cell: StreamedDavisCell,
  type: InternalSphericalType,
  system: CoxeterSystemInput,
  action: PackedAction,
  edges: PackedEdges,
): StreamedRankTwoCell {
  if (type.dimension !== 2 || type.generators.length !== 2) {
    throw new StreamedLawfulDavisError("Not a rank-two Davis cell", [
      `${type.id} has rank ${type.dimension}.`,
    ]);
  }
  const [left, right] = type.generators;
  const relation = system.coxeterMatrix[left][right];
  if (relation === "inf" || relation < 2) {
    throw new StreamedLawfulDavisError("Invalid finite-pair type", [
      `${type.id} does not have a finite rank-two relation.`,
    ]);
  }
  const boundary: StreamedRankTwoBoundaryOccurrence[] = [];
  let current = cell.representativePoint;
  const seenVertices = new Set<number>();
  for (
    let boundaryIndex = 0;
    boundaryIndex < 2 * relation;
    boundaryIndex += 1
  ) {
    if (seenVertices.has(current)) {
      throw new StreamedLawfulDavisError("Degenerate rank-two boundary", [
        `${cellStableId(cell)} repeats q${current} before closing.`,
      ]);
    }
    seenVertices.add(current);
    const generator = boundaryIndex % 2 === 0 ? left : right;
    const next = action.rows[generator][current];
    const edgeIndex = edgeIndexAt(edges, action.degree, current, generator);
    const edge = edgeRecord(edges, edgeIndex);
    boundary.push({
      boundaryIndex,
      edgeIndex,
      edgeId: edge.id,
      generator,
      sourcePoint: current,
      targetPoint: next,
      traversal: edge.sourcePoint === current ? 1 : -1,
    });
    current = next;
  }
  if (
    current !== cell.representativePoint ||
    seenVertices.size !== 2 * relation
  ) {
    throw new StreamedLawfulDavisError("Incomplete rank-two boundary", [
      `${cellStableId(cell)} does not close as a ${2 * relation}-gon.`,
    ]);
  }
  return { cell, m: relation, boundary };
}

function buildWalls(
  system: CoxeterSystemInput,
  action: PackedAction,
  edges: PackedEdges,
  types: readonly InternalSphericalType[],
): InternalWalls {
  const disjointSet = new ParityDisjointSet(edges.generator.length);
  let crossingSegmentCount = 0;
  for (const type of types.filter((candidate) => candidate.dimension === 2)) {
    for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
      const cell = cellFromOrdinal(type, ordinal);
      const relationCell = boundaryForPairCell(
        cell,
        type,
        system,
        action,
        edges,
      );
      const half = relationCell.boundary.length / 2;
      for (let index = 0; index < half; index += 1) {
        const first = relationCell.boundary[index];
        const second = relationCell.boundary[index + half];
        const orientationParity = -first.traversal * second.traversal;
        disjointSet.union(
          first.edgeIndex,
          second.edgeIndex,
          orientationParity === 1 ? 0 : 1,
        );
        crossingSegmentCount += 1;
      }
    }
  }

  const canonicalByRoot = new Uint32Array(edges.generator.length);
  canonicalByRoot.fill(UINT32_SENTINEL);
  const edgeCountByRoot = new Uint32Array(edges.generator.length);
  for (let edgeIndex = 0; edgeIndex < edges.generator.length; edgeIndex += 1) {
    const root = disjointSet.find(edgeIndex).root;
    edgeCountByRoot[root] += 1;
    const existing = canonicalByRoot[root];
    if (
      existing === UINT32_SENTINEL ||
      compareIds(
        edgeRecord(edges, edgeIndex).id,
        edgeRecord(edges, existing).id,
      ) < 0
    ) {
      canonicalByRoot[root] = edgeIndex;
    }
  }
  const roots = [...canonicalByRoot.keys()]
    .filter((root) => canonicalByRoot[root] !== UINT32_SENTINEL)
    .sort((left, right) =>
      compareIds(
        edgeRecord(edges, canonicalByRoot[left]).id,
        edgeRecord(edges, canonicalByRoot[right]).id,
      ),
    );
  const wallIndexByRoot = new Uint32Array(edges.generator.length);
  wallIndexByRoot.fill(UINT32_SENTINEL);
  const segmentCountByRoot = new Uint32Array(edges.generator.length);
  // Count each opposite-edge constraint without retaining the constraint list.
  for (const type of types.filter((candidate) => candidate.dimension === 2)) {
    for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
      const relationCell = boundaryForPairCell(
        cellFromOrdinal(type, ordinal),
        type,
        system,
        action,
        edges,
      );
      const half = relationCell.boundary.length / 2;
      for (let index = 0; index < half; index += 1) {
        const root = disjointSet.find(
          relationCell.boundary[index].edgeIndex,
        ).root;
        segmentCountByRoot[root] += 1;
      }
    }
  }
  const walls: StreamedWall[] = roots.map((root, wallIndex) => {
    wallIndexByRoot[root] = wallIndex;
    const canonicalEdgeIndex = canonicalByRoot[root];
    const canonicalEdgeId = edgeRecord(edges, canonicalEdgeIndex).id;
    const parityConflictCount = disjointSet.conflictCount(root);
    return {
      wallIndex,
      id: `wall:${canonicalEdgeId}`,
      canonicalEdgeIndex,
      canonicalEdgeId,
      edgeCount: edgeCountByRoot[root],
      crossingSegmentCount: segmentCountByRoot[root],
      parityConflictCount,
      twoSided: parityConflictCount === 0,
    };
  });
  const edgeToWall = new Uint32Array(edges.generator.length);
  const edgeParity = new Int8Array(edges.generator.length);
  for (let edgeIndex = 0; edgeIndex < edges.generator.length; edgeIndex += 1) {
    const found = disjointSet.find(edgeIndex);
    const wallIndex = wallIndexByRoot[found.root];
    const canonical = canonicalByRoot[found.root];
    const canonicalParity = disjointSet.find(canonical).parity;
    edgeToWall[edgeIndex] = wallIndex;
    edgeParity[edgeIndex] = (found.parity ^ canonicalParity) === 0 ? 1 : -1;
  }
  const summaryWithoutHash = {
    wallCount: walls.length,
    edgeCount: edges.generator.length,
    crossingSegmentCount,
    twoSided: walls.every((wall) => wall.twoSided),
    walls,
  };
  return {
    summary: {
      ...summaryWithoutHash,
      structureHash: canonicalSha256(summaryWithoutHash),
    },
    edgeToWall,
    edgeParity,
  };
}

function countCyclicTransitions(signs: readonly number[]): number {
  if (signs.length === 0) return 0;
  let transitions = 0;
  for (let index = 0; index < signs.length; index += 1) {
    if (signs[index] !== signs[(index + 1) % signs.length]) transitions += 1;
  }
  return transitions;
}

function normalizeCandidate(
  candidate: StreamedWallSignCandidate,
  walls: StreamedWallSystemSummary,
): StreamedWallSignCandidate {
  if (candidate.id.trim().length === 0) {
    throw new StreamedLawfulDavisError("Invalid wall coorientation candidate", [
      "Every candidate needs a nonempty stable id.",
    ]);
  }
  const expected = walls.walls.map((wall) => wall.id).sort(compareIds);
  const supplied = Object.keys(candidate.wallSigns).sort(compareIds);
  const errors: string[] = [];
  if (
    expected.length !== supplied.length ||
    expected.some((wallId, index) => wallId !== supplied[index])
  ) {
    errors.push(
      `Candidate ${candidate.id} must bind exactly the ordered wall ids returned by this oracle.`,
    );
  }
  const wallSigns: Record<string, StreamedOrientationSign> = {};
  for (const wallId of expected) {
    const sign = candidate.wallSigns[wallId];
    if (sign !== 1 && sign !== -1) {
      errors.push(`Candidate ${candidate.id} has invalid sign for ${wallId}.`);
    } else {
      wallSigns[wallId] = sign;
    }
  }
  if (errors.length > 0) {
    throw new StreamedLawfulDavisError(
      "Invalid wall coorientation candidate",
      errors,
    );
  }
  return { id: candidate.id, wallSigns };
}

function canonicalMaskCandidate(
  mask: number,
  orderedWallIds: readonly string[],
): StreamedWallSignCandidate {
  const hexadecimalWidth = Math.max(1, Math.ceil(orderedWallIds.length / 4));
  return {
    id: `canonical-wall-mask-0x${mask
      .toString(16)
      .padStart(hexadecimalWidth, "0")}`,
    wallSigns: Object.fromEntries(
      orderedWallIds.map((wallId, wallIndex) => [
        wallId,
        ((mask & (2 ** wallIndex)) === 0 ? 1 : -1) as StreamedOrientationSign,
      ]),
    ),
  };
}

interface RankTwoTransitionPattern {
  frequency: number;
  /** Each term encodes wall_i XOR wall_j XOR the fixed edge-parity bit. */
  terms: number[];
}

function lawfulRankTwoCountsForCanonicalMasks(input: {
  system: CoxeterSystemInput;
  action: PackedAction;
  edges: PackedEdges;
  walls: InternalWalls;
  types: readonly InternalSphericalType[];
  maskCount: number;
}): number[] {
  const { system, action, edges, walls, types, maskCount } = input;
  const wallCount = walls.summary.wallCount;
  const patterns = new Map<string, RankTwoTransitionPattern>();
  for (const type of types.filter((candidate) => candidate.dimension === 2)) {
    for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
      const relationCell = boundaryForPairCell(
        cellFromOrdinal(type, ordinal),
        type,
        system,
        action,
        edges,
      );
      const terms: number[] = [];
      for (let index = 0; index < relationCell.boundary.length; index += 1) {
        const current = relationCell.boundary[index];
        const next =
          relationCell.boundary[(index + 1) % relationCell.boundary.length];
        const currentWall = walls.edgeToWall[current.edgeIndex];
        const nextWall = walls.edgeToWall[next.edgeIndex];
        const leftWall = Math.min(currentWall, nextWall);
        const rightWall = Math.max(currentWall, nextWall);
        const currentFixedSign =
          walls.edgeParity[current.edgeIndex] * current.traversal;
        const nextFixedSign = walls.edgeParity[next.edgeIndex] * next.traversal;
        const fixedTransition = currentFixedSign === nextFixedSign ? 0 : 1;
        terms.push(2 * (leftWall * wallCount + rightWall) + fixedTransition);
      }
      terms.sort(compareNumbers);
      const key = terms.join(",");
      const existing = patterns.get(key);
      if (existing) existing.frequency += 1;
      else patterns.set(key, { frequency: 1, terms });
    }
  }

  const counts = Array.from({ length: maskCount }, () => 0);
  for (const pattern of patterns.values()) {
    for (let mask = 0; mask < maskCount; mask += 1) {
      let transitionCount = 0;
      for (const encoded of pattern.terms) {
        const fixedTransition = encoded & 1;
        const pair = Math.floor(encoded / 2);
        const leftWall = Math.floor(pair / wallCount);
        const rightWall = pair % wallCount;
        transitionCount +=
          ((mask >>> leftWall) & 1) ^
          ((mask >>> rightWall) & 1) ^
          fixedTransition;
        if (transitionCount > 2) break;
      }
      if (transitionCount === 2) counts[mask] += pattern.frequency;
    }
  }
  return counts;
}

function generatorSubsetComponents(
  subset: number,
  finitePairAdjacency: Uint32Array,
): number[][] {
  const components: number[][] = [];
  let remaining = subset >>> 0;
  while (remaining !== 0) {
    const firstBit = remaining & -remaining;
    let frontier = firstBit >>> 0;
    let visited = firstBit >>> 0;
    while (frontier !== 0) {
      const bit = frontier & -frontier;
      frontier = (frontier ^ bit) >>> 0;
      const generator = 31 - Math.clz32(bit);
      const newNeighbors =
        (finitePairAdjacency[generator] & subset & ~visited) >>> 0;
      visited = (visited | newNeighbors) >>> 0;
      frontier = (frontier | newNeighbors) >>> 0;
    }
    const component: number[] = [];
    for (
      let generator = 0;
      generator < finitePairAdjacency.length;
      generator += 1
    ) {
      if ((visited & (2 ** generator)) !== 0) component.push(generator);
    }
    components.push(component);
    remaining = (remaining & ~visited) >>> 0;
  }
  return components;
}

function connectedGeneratorSubsets(
  generatorCount: number,
  finitePairAdjacency: Uint32Array,
): Uint8Array {
  const subsetCount = 2 ** generatorCount;
  const connected = new Uint8Array(subsetCount);
  for (let subset = 1; subset < subsetCount; subset += 1) {
    connected[subset] =
      generatorSubsetComponents(subset, finitePairAdjacency).length === 1
        ? 1
        : 0;
  }
  return connected;
}

function enumerateNativeVertexLinkPrefilter(input: {
  oracle: StreamedLawfulDavisOracle;
  system: CoxeterSystemInput;
  action: PackedAction;
  edges: PackedEdges;
  walls: InternalWalls;
  types: readonly InternalSphericalType[];
}): StreamedNativeVertexLinkPrefilterResult {
  const { oracle, system, action, edges, walls, types } = input;
  if (!walls.summary.twoSided) {
    throw new StreamedLawfulDavisError(
      "Cannot enumerate canonical coorientations",
      ["At least one streamed quotient wall is one-sided."],
    );
  }
  if (
    walls.summary.wallCount > MAX_EXHAUSTIVE_PREFILTER_BITS ||
    system.rank > MAX_EXHAUSTIVE_PREFILTER_BITS
  ) {
    throw new StreamedLawfulDavisError(
      "Native vertex-link prefilter is too large for exhaustive enumeration",
      [
        `This exact enumerator supports at most ${MAX_EXHAUSTIVE_PREFILTER_BITS} walls and generators; received ${walls.summary.wallCount} walls and rank ${system.rank}.`,
      ],
    );
  }

  const orderedWallIds = walls.summary.walls.map((wall) => wall.id);
  const maskCount = 2 ** orderedWallIds.length;
  const maximumMask = maskCount - 1;
  const candidates = Array.from({ length: maskCount }, (_unused, mask) =>
    canonicalMaskCandidate(mask, orderedWallIds),
  );
  const lawfulRankTwoCellCounts = lawfulRankTwoCountsForCanonicalMasks({
    system,
    action,
    edges,
    walls,
    types,
    maskCount,
  });

  const finitePairAdjacency = new Uint32Array(system.rank);
  const finitePairGeneratorEdges: Array<[number, number]> = [];
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      if (system.coxeterMatrix[left][right] === "inf") continue;
      finitePairAdjacency[left] |= 2 ** right;
      finitePairAdjacency[right] |= 2 ** left;
      finitePairGeneratorEdges.push([left, right]);
    }
  }
  const connectedSubsets = connectedGeneratorSubsets(
    system.rank,
    finitePairAdjacency,
  );
  const fullGeneratorMask = 2 ** system.rank - 1;
  const ascendingEmptyCounts = new Uint32Array(maskCount);
  const descendingEmptyCounts = new Uint32Array(maskCount);
  const ascendingDisconnectedCounts = new Uint32Array(maskCount);
  const descendingDisconnectedCounts = new Uint32Array(maskCount);
  const failingPointCounts = new Uint32Array(maskCount);
  const firstFailures: Array<StreamedNativeLinkFailureWitness | undefined> =
    Array(maskCount);

  for (let point = 0; point < action.degree; point += 1) {
    let descendingGeneratorMask = 0;
    const wallGeneratorEffects = new Uint32Array(orderedWallIds.length);
    for (let generator = 0; generator < system.rank; generator += 1) {
      const edgeIndex = edgeIndexAt(edges, action.degree, point, generator);
      const traversal = edges.source[edgeIndex] === point ? 1 : -1;
      if (walls.edgeParity[edgeIndex] * traversal === -1) {
        descendingGeneratorMask |= 2 ** generator;
      }
      wallGeneratorEffects[walls.edgeToWall[edgeIndex]] |= 2 ** generator;
    }

    let previousGrayMask = 0;
    for (let grayStep = 0; grayStep < maskCount; grayStep += 1) {
      const mask = grayStep ^ (grayStep >>> 1);
      if (grayStep > 0) {
        const changedBit = mask ^ previousGrayMask;
        const wallIndex = 31 - Math.clz32(changedBit);
        descendingGeneratorMask ^= wallGeneratorEffects[wallIndex];
      }
      previousGrayMask = mask;
      descendingGeneratorMask >>>= 0;
      const ascendingGeneratorMask =
        (fullGeneratorMask ^ descendingGeneratorMask) >>> 0;
      const ascendingEmpty = ascendingGeneratorMask === 0;
      const descendingEmpty = descendingGeneratorMask === 0;
      const ascendingDisconnected =
        !ascendingEmpty && connectedSubsets[ascendingGeneratorMask] === 0;
      const descendingDisconnected =
        !descendingEmpty && connectedSubsets[descendingGeneratorMask] === 0;
      if (ascendingEmpty) ascendingEmptyCounts[mask] += 1;
      if (descendingEmpty) descendingEmptyCounts[mask] += 1;
      if (ascendingDisconnected) ascendingDisconnectedCounts[mask] += 1;
      if (descendingDisconnected) descendingDisconnectedCounts[mask] += 1;
      if (
        !ascendingEmpty &&
        !descendingEmpty &&
        !ascendingDisconnected &&
        !descendingDisconnected
      ) {
        continue;
      }
      failingPointCounts[mask] += 1;
      if (firstFailures[mask]) continue;

      let kind: StreamedNativeLinkFailureKind;
      let disconnectedComponents: number[][] | undefined;
      if (ascendingEmpty) kind = "ascending-empty";
      else if (descendingEmpty) kind = "descending-empty";
      else if (ascendingDisconnected) {
        kind = "ascending-disconnected";
        disconnectedComponents = generatorSubsetComponents(
          ascendingGeneratorMask,
          finitePairAdjacency,
        );
      } else {
        kind = "descending-disconnected";
        disconnectedComponents = generatorSubsetComponents(
          descendingGeneratorMask,
          finitePairAdjacency,
        );
      }
      const ascendingGenerators: number[] = [];
      const descendingGenerators: number[] = [];
      for (let generator = 0; generator < system.rank; generator += 1) {
        if ((ascendingGeneratorMask & (2 ** generator)) !== 0) {
          ascendingGenerators.push(generator);
        } else {
          descendingGenerators.push(generator);
        }
      }
      firstFailures[mask] = {
        point,
        kind,
        ascendingGenerators,
        descendingGenerators,
        ...(disconnectedComponents ? { disconnectedComponents } : {}),
      };
    }
  }

  const maskSummaries: StreamedNativeLinkMaskSummary[] = candidates.map(
    (candidate, mask) => {
      const firstFailure = firstFailures[mask];
      return {
        mask,
        candidateId: candidate.id,
        wallSigns: candidate.wallSigns,
        lawfulRankTwoCellCount: lawfulRankTwoCellCounts[mask],
        passed: failingPointCounts[mask] === 0,
        failingPointCount: failingPointCounts[mask],
        failureCounts: {
          "ascending-empty": ascendingEmptyCounts[mask],
          "descending-empty": descendingEmptyCounts[mask],
          "ascending-disconnected": ascendingDisconnectedCounts[mask],
          "descending-disconnected": descendingDisconnectedCounts[mask],
        },
        ...(firstFailure ? { firstFailure } : {}),
      };
    },
  );
  const survivorMasks = maskSummaries
    .filter((summary) => summary.passed)
    .map((summary) => summary.mask);
  const survivorCandidates = survivorMasks.map((mask) => candidates[mask]);
  const reportWithoutHash = {
    status: "completed" as const,
    method: "native-full-davis-vertex-link-germ-connectivity" as const,
    oracleStructureHash: oracle.structureHash,
    orderedWallIds,
    maskConvention: {
      bitNumbering: "least-significant-bit-is-ordered-wall-index" as const,
      zeroBitSign: 1 as const,
      oneBitSign: -1 as const,
      maskMinimum: 0 as const,
      maskMaximum: maximumMask,
      globalSignComplementXorMask: maximumMask,
    },
    finitePairGeneratorEdges,
    candidateCount: maskCount,
    rankTwoCellCount: oracle.rankTwoCellCount,
    maskSummaries,
    survivorMasks,
    survivorCandidates,
    checks: {
      exhaustiveCanonicalMasks: maskSummaries.length === maskCount,
      allWallsTwoSided: walls.summary.twoSided,
      survivorsHaveBothDirectionsNonemptyAtEveryPoint: survivorMasks.every(
        (mask) =>
          ascendingEmptyCounts[mask] === 0 && descendingEmptyCounts[mask] === 0,
      ),
      survivorsHaveConnectedFinitePairGraphsAtEveryPoint: survivorMasks.every(
        (mask) =>
          ascendingDisconnectedCounts[mask] === 0 &&
          descendingDisconnectedCounts[mask] === 0,
      ),
    },
  };
  return deepFreezePublicSnapshot({
    ...reportWithoutHash,
    reportHash: canonicalSha256(reportWithoutHash),
  });
}

function groupedCounts(
  initialDimensions: readonly number[],
): Record<string, number> {
  return Object.fromEntries(
    [...new Set(initialDimensions)]
      .sort(compareNumbers)
      .map((dimension) => [String(dimension), 0]),
  );
}

function hashRetentionBits(input: {
  oracleStructureHash: string;
  types: readonly InternalSphericalType[];
  retentionByType: readonly (Uint32Array | undefined)[];
  candidates: readonly StreamedWallSignCandidate[];
  coorientationHashes: readonly string[];
  allBits: number;
}): string {
  const chunkSize = 4_096;
  const typeRoots: Array<{
    typeIndex: number;
    cellCount: number;
    chunkHashes: string[];
  }> = [];
  for (const type of input.types) {
    const chunkHashes: string[] = [];
    for (let start = 0; start < type.cellCount; start += chunkSize) {
      const end = Math.min(type.cellCount, start + chunkSize);
      const bits =
        type.dimension === 0
          ? Array.from({ length: end - start }, () => input.allBits)
          : Array.from(
              input.retentionByType[type.typeIndex]!.subarray(start, end),
            );
      chunkHashes.push(
        canonicalSha256({
          typeIndex: type.typeIndex,
          start,
          retentionBits: bits,
        }),
      );
    }
    typeRoots.push({
      typeIndex: type.typeIndex,
      cellCount: type.cellCount,
      chunkHashes,
    });
  }
  return canonicalSha256({
    schemaVersion: 1,
    method: "fixed-cell-chunk-sha256-tree",
    oracleStructureHash: input.oracleStructureHash,
    chunkSize,
    candidates: input.candidates.map((candidate, candidateIndex) => ({
      id: candidate.id,
      coorientationHash: input.coorientationHashes[candidateIndex],
    })),
    typeRoots,
  });
}

function hashCandidateRetentionBits(input: {
  oracleStructureHash: string;
  types: readonly InternalSphericalType[];
  retentionByType: readonly (Uint32Array | undefined)[];
  candidate: StreamedWallSignCandidate;
  candidateIndex: number;
  coorientationHash: string;
}): string {
  const chunkSize = 4_096;
  const bit = candidateBit(input.candidateIndex);
  const typeRoots: Array<{
    typeIndex: number;
    cellCount: number;
    chunkHashes: string[];
  }> = [];
  for (const type of input.types) {
    const chunkHashes: string[] = [];
    for (let start = 0; start < type.cellCount; start += chunkSize) {
      const end = Math.min(type.cellCount, start + chunkSize);
      const retained =
        type.dimension === 0
          ? Array.from({ length: end - start }, () => 1)
          : Array.from(
              input.retentionByType[type.typeIndex]!.subarray(start, end),
              (bits) => ((bits & bit) !== 0 ? 1 : 0),
            );
      chunkHashes.push(
        canonicalSha256({
          typeIndex: type.typeIndex,
          start,
          retained,
        }),
      );
    }
    typeRoots.push({
      typeIndex: type.typeIndex,
      cellCount: type.cellCount,
      chunkHashes,
    });
  }
  return canonicalSha256({
    schemaVersion: 1,
    method: "candidate-fixed-cell-chunk-sha256-tree",
    oracleStructureHash: input.oracleStructureHash,
    chunkSize,
    candidate: {
      id: input.candidate.id,
      coorientationHash: input.coorientationHash,
    },
    typeRoots,
  });
}

function buildLawfulEvaluation(input: {
  oracle: StreamedLawfulDavisOracle;
  system: CoxeterSystemInput;
  action: PackedAction;
  edges: PackedEdges;
  walls: InternalWalls;
  types: InternalSphericalType[];
  candidates: readonly StreamedWallSignCandidate[];
}): StreamedLawfulEvaluation {
  const { oracle, system, action, edges, walls, types } = input;
  if (input.candidates.length < 1 || input.candidates.length > MAX_CANDIDATES) {
    throw new StreamedLawfulDavisError("Unsupported candidate count", [
      `Expected 1..${MAX_CANDIDATES} coorientations, received ${input.candidates.length}.`,
    ]);
  }
  if (!walls.summary.twoSided) {
    throw new StreamedLawfulDavisError("Cannot bind wall coorientations", [
      "At least one streamed quotient wall is one-sided.",
    ]);
  }
  const candidates = input.candidates.map((candidate) =>
    normalizeCandidate(candidate, walls.summary),
  );
  if (
    new Set(candidates.map((candidate) => candidate.id)).size !==
    candidates.length
  ) {
    throw new StreamedLawfulDavisError("Duplicate coorientation candidate", [
      "Candidate ids must be unique.",
    ]);
  }
  const coorientationHashes = candidates.map((candidate) =>
    canonicalSha256({
      oracleStructureHash: oracle.structureHash,
      candidateId: candidate.id,
      wallSigns: walls.summary.walls.map((wall) => [
        wall.id,
        candidate.wallSigns[wall.id],
      ]),
    }),
  );
  const allBits = allCandidateBits(candidates.length);
  const edgeDirections = new Int8Array(
    candidates.length * edges.generator.length,
  );
  for (
    let candidateIndex = 0;
    candidateIndex < candidates.length;
    candidateIndex += 1
  ) {
    const candidate = candidates[candidateIndex];
    const offset = candidateIndex * edges.generator.length;
    for (
      let edgeIndex = 0;
      edgeIndex < edges.generator.length;
      edgeIndex += 1
    ) {
      const wall = walls.summary.walls[walls.edgeToWall[edgeIndex]];
      edgeDirections[offset + edgeIndex] =
        candidate.wallSigns[wall.id] * walls.edgeParity[edgeIndex];
    }
  }

  const retentionByType: Array<Uint32Array | undefined> = Array(types.length);
  for (const type of types) {
    if (type.dimension === 0) continue;
    retentionByType[type.typeIndex] = new Uint32Array(type.cellCount);
    if (type.dimension === 1) retentionByType[type.typeIndex]?.fill(allBits);
  }

  for (const type of types.filter((candidate) => candidate.dimension === 2)) {
    const retention = retentionByType[type.typeIndex]!;
    for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
      const relationCell = boundaryForPairCell(
        cellFromOrdinal(type, ordinal),
        type,
        system,
        action,
        edges,
      );
      let bits = 0;
      for (
        let candidateIndex = 0;
        candidateIndex < candidates.length;
        candidateIndex += 1
      ) {
        const offset = candidateIndex * edges.generator.length;
        const signs = relationCell.boundary.map(
          (occurrence) =>
            edgeDirections[offset + occurrence.edgeIndex] *
            occurrence.traversal,
        );
        if (countCyclicTransitions(signs) === 2)
          bits |= candidateBit(candidateIndex);
      }
      retention[ordinal] = bits >>> 0;
    }
  }

  for (const type of types.filter((candidate) => candidate.dimension >= 3)) {
    const retention = retentionByType[type.typeIndex]!;
    for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
      const cell = cellFromOrdinal(type, ordinal);
      const vertices = verticesOfCell(cell, types, action);
      let bits = allBits;
      for (const pairTypeIndex of type.rankTwoFaceTypeIndices) {
        const pairType = types[pairTypeIndex];
        const pairRetention = retentionByType[pairTypeIndex]!;
        for (const point of vertices) {
          bits &= pairRetention[ordinalAt(pairType, point)];
          if (bits === 0) break;
        }
        if (bits === 0) break;
      }
      retention[ordinal] = bits >>> 0;
    }
  }

  const dimensions = types.map((type) => type.dimension);
  const candidateRetentionHashes = candidates.map((candidate, candidateIndex) =>
    hashCandidateRetentionBits({
      oracleStructureHash: oracle.structureHash,
      types,
      retentionByType,
      candidate,
      candidateIndex,
      coorientationHash: coorientationHashes[candidateIndex],
    }),
  );
  const candidateSummaries: StreamedClosureCandidateSummary[] = candidates.map(
    (candidate, candidateIndex) => {
      const retainedCellCountByDimension = groupedCounts(dimensions);
      const discardedCellCountByDimension = groupedCounts(dimensions);
      const bit = candidateBit(candidateIndex);
      for (const type of types) {
        let retained: number;
        if (type.dimension === 0) {
          retained = type.cellCount;
        } else {
          retained = 0;
          for (const bits of retentionByType[type.typeIndex]!) {
            if ((bits & bit) !== 0) retained += 1;
          }
        }
        retainedCellCountByDimension[String(type.dimension)] += retained;
        discardedCellCountByDimension[String(type.dimension)] +=
          type.cellCount - retained;
      }
      return {
        candidateIndex,
        candidateId: candidate.id,
        coorientationHash: coorientationHashes[candidateIndex],
        retentionHash: candidateRetentionHashes[candidateIndex],
        closureHash: "",
        retainedCellCountByDimension,
        discardedCellCountByDimension,
        retainedCellCount: Object.values(retainedCellCountByDimension).reduce(
          (sum, value) => sum + value,
          0,
        ),
        discardedCellCount: Object.values(discardedCellCountByDimension).reduce(
          (sum, value) => sum + value,
          0,
        ),
        immediateIncidenceCount: 0,
        downwardClosureViolationCount: 0,
        checks: {
          allVerticesAndEdgesRetained:
            discardedCellCountByDimension["0"] === 0 &&
            discardedCellCountByDimension["1"] === 0,
          higherCellsUseEveryRankTwoFace: true,
          retainedCellsDownwardClosed: true,
        },
      };
    },
  );

  let immediateIncidenceCount = 0;
  let downwardClosureViolationCount = 0;
  const candidateDownwardClosureViolationCounts = new Uint32Array(
    candidates.length,
  );
  const downwardClosureViolationWitnesses: StreamedClosureSummary["downwardClosureViolationWitnesses"] =
    [];
  for (const type of types.filter((candidate) => candidate.dimension > 0)) {
    const cofaceRetention = retentionByType[type.typeIndex];
    for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
      const cell = cellFromOrdinal(type, ordinal);
      const cellBits =
        type.dimension === 0 ? allBits : cofaceRetention![ordinal];
      forEachFaceByTypeIndices(
        cell,
        type.immediateFaceTypeIndices,
        types,
        action,
        (facet) => {
          immediateIncidenceCount += 1;
          const facetType = types[facet.typeIndex];
          const facetBits =
            facet.dimension === 0
              ? allBits
              : retentionByType[facet.typeIndex]![
                  ordinalAt(facetType, facet.representativePoint)
                ];
          const violations = (cellBits & ~facetBits) >>> 0;
          if (violations === 0) return;
          downwardClosureViolationCount += 1;
          for (
            let candidateIndex = 0;
            candidateIndex < candidates.length;
            candidateIndex += 1
          ) {
            if ((violations & candidateBit(candidateIndex)) !== 0) {
              candidateDownwardClosureViolationCounts[candidateIndex] += 1;
            }
          }
          if (
            downwardClosureViolationWitnesses.length < MAX_CLOSURE_WITNESSES
          ) {
            downwardClosureViolationWitnesses.push({
              faceCellId: cellStableId(facet),
              cofaceCellId: cellStableId(cell),
              candidateIds: candidates
                .filter(
                  (_candidate, candidateIndex) =>
                    (violations & candidateBit(candidateIndex)) !== 0,
                )
                .map((candidate) => candidate.id),
            });
          }
        },
      );
    }
  }

  for (const summary of candidateSummaries) {
    summary.immediateIncidenceCount = immediateIncidenceCount;
    summary.downwardClosureViolationCount =
      candidateDownwardClosureViolationCounts[summary.candidateIndex];
    summary.checks.retainedCellsDownwardClosed =
      summary.downwardClosureViolationCount === 0;
    summary.closureHash = canonicalSha256({
      schemaVersion: 1,
      method: "candidate-immediate-closure-v1",
      oracleStructureHash: oracle.structureHash,
      candidate: {
        id: summary.candidateId,
        coorientationHash: summary.coorientationHash,
      },
      retentionHash: summary.retentionHash,
      retainedCellCountByDimension: summary.retainedCellCountByDimension,
      discardedCellCountByDimension: summary.discardedCellCountByDimension,
      retainedCellCount: summary.retainedCellCount,
      discardedCellCount: summary.discardedCellCount,
      immediateIncidenceCount: summary.immediateIncidenceCount,
      downwardClosureViolationCount: summary.downwardClosureViolationCount,
      checks: summary.checks,
    });
  }

  const closure: StreamedClosureSummary = {
    status: downwardClosureViolationCount === 0 ? "passed" : "failed",
    method: "rank-two-lawfulness-and-coface-upset-complement",
    candidateSummaries,
    immediateIncidenceCount,
    downwardClosureViolationCount,
    downwardClosureViolationWitnesses,
    checks: {
      allVerticesAndEdgesRetained: types
        .filter((type) => type.dimension <= 1)
        .every(
          (type) =>
            type.dimension === 0 ||
            [...retentionByType[type.typeIndex]!].every(
              (bits) => bits === allBits,
            ),
        ),
      higherCellsUseEveryRankTwoFace: true,
      retainedCellsDownwardClosed: downwardClosureViolationCount === 0,
    },
    hashAlgorithm: "sha256-chunk-tree-v1",
    retentionHash: "",
    closureHash: "",
  };
  closure.retentionHash = hashRetentionBits({
    oracleStructureHash: oracle.structureHash,
    types,
    retentionByType,
    candidates,
    coorientationHashes,
    allBits,
  });
  closure.closureHash = canonicalSha256({
    oracleStructureHash: oracle.structureHash,
    retentionHash: closure.retentionHash,
    candidateSummaries: closure.candidateSummaries,
    immediateIncidenceCount: closure.immediateIncidenceCount,
    downwardClosureViolationCount: closure.downwardClosureViolationCount,
    downwardClosureViolationWitnesses:
      closure.downwardClosureViolationWitnesses,
    checks: closure.checks,
  });

  const retentionBits = (cell: StreamedDavisCell): number => {
    const canonical = canonicalCellOrThrow(cell, types, action.degree);
    const type = typeOrThrow(types, canonical.typeIndex);
    if (type.dimension === 0) return allBits;
    const ordinal = ordinalAt(type, canonical.representativePoint);
    return retentionByType[type.typeIndex]![ordinal];
  };

  const edgeIncrement = (
    point: number,
    generator: number,
    candidateIndex: number,
  ): StreamedOrientationSign => {
    assertPoint(point, action.degree);
    assertGenerator(generator, system.rank);
    assertCandidateIndex(candidateIndex, candidates.length);
    const edgeIndex = edgeIndexAt(edges, action.degree, point, generator);
    const storedDirection =
      edgeDirections[candidateIndex * edges.generator.length + edgeIndex];
    const traversal = edges.source[edgeIndex] === point ? 1 : -1;
    return (storedDirection * traversal) as StreamedOrientationSign;
  };

  const checkMoussongMetricFlag = (
    candidateIndex: number,
    witnessLimit = 32,
  ): StreamedMetricFlagResult => {
    assertCandidateIndex(candidateIndex, candidates.length);
    if (!Number.isInteger(witnessLimit) || witnessLimit < 0) {
      throw new RangeError("witnessLimit must be a nonnegative integer.");
    }
    const bit = candidateBit(candidateIndex);
    let checkedPointTypePairs = 0;
    let violationCount = 0;
    const witnesses: StreamedMetricFlagWitness[] = [];
    // In the native Davis metric, the link edge for {i,j} has length
    // pi-pi/m_ij, hence at least pi/2. Moussong's metric-flag criterion says
    // that such a link is CAT(1) exactly when every metrically spherical
    // clique is filled. The exact spherical plan is the finite clique list.
    for (const type of types.filter((candidate) => candidate.dimension >= 3)) {
      const typeRetention = retentionByType[type.typeIndex]!;
      for (let point = 0; point < action.degree; point += 1) {
        checkedPointTypePairs += 1;
        const pairCells = type.rankTwoFaceTypeIndices.map((pairTypeIndex) => {
          const pairType = types[pairTypeIndex];
          const ordinal = ordinalAt(pairType, point);
          return {
            cell: cellFromOrdinal(pairType, ordinal),
            retained: (retentionByType[pairTypeIndex]![ordinal] & bit) !== 0,
          };
        });
        if (!pairCells.every((entry) => entry.retained)) continue;
        const sphericalOrdinal = ordinalAt(type, point);
        if ((typeRetention[sphericalOrdinal] & bit) !== 0) continue;
        violationCount += 1;
        if (witnesses.length < witnessLimit) {
          const sphericalCell = cellFromOrdinal(type, sphericalOrdinal);
          const sphericalVertices = verticesOfCell(
            sphericalCell,
            types,
            action,
          );
          let unlawfulRankTwoFace: StreamedDavisCell | undefined;
          for (const pairTypeIndex of type.rankTwoFaceTypeIndices) {
            const pairType = types[pairTypeIndex];
            const pairRetention = retentionByType[pairTypeIndex]!;
            const ordinals = new Set<number>();
            for (const cellPoint of sphericalVertices) {
              ordinals.add(ordinalAt(pairType, cellPoint));
            }
            for (const ordinal of [...ordinals].sort(compareNumbers)) {
              if ((pairRetention[ordinal] & bit) === 0) {
                unlawfulRankTwoFace = cellFromOrdinal(pairType, ordinal);
                break;
              }
            }
            if (unlawfulRankTwoFace) break;
          }
          if (!unlawfulRankTwoFace) {
            throw new StreamedLawfulDavisError(
              "Metric-flag witness reconstruction failed",
              [
                `${cellStableId(sphericalCell)} is discarded but has no discarded rank-two face.`,
              ],
            );
          }
          witnesses.push({
            point,
            sphericalTypeId: type.id,
            sphericalCellId: cellStableId(sphericalCell),
            pairCellIds: pairCells
              .map((entry) => cellStableId(entry.cell))
              .sort(compareIds),
            unlawfulRankTwoFaceCellId: cellStableId(unlawfulRankTwoFace),
            unlawfulRankTwoFaceRepresentativePoint:
              unlawfulRankTwoFace.representativePoint,
          });
        }
      }
    }
    const passed = violationCount === 0;
    return {
      status: passed ? "passed" : "not-established",
      candidateId: candidates[candidateIndex].id,
      checkedPointTypePairs,
      violationCount,
      witnesses,
      metricallyFlag: passed,
      locallyCatZero: passed,
      universalCoverContractibleByMoussongMetric: passed,
      nonClaims: passed
        ? []
        : [
            "Failure of the metric-flag sufficient condition does not prove that the lawful complex is nonaspherical or that its universal cover is noncontractible.",
          ],
    };
  };

  const isMaximalRetained = (
    cell: StreamedDavisCell,
    candidateIndex: number,
  ): boolean => {
    assertCandidateIndex(candidateIndex, candidates.length);
    const canonical = canonicalCellOrThrow(cell, types, action.degree);
    if ((retentionBits(canonical) & candidateBit(candidateIndex)) === 0)
      return false;
    const type = typeOrThrow(types, canonical.typeIndex);
    for (const cofacetTypeIndex of type.immediateCofaceTypeIndices) {
      const cofacetType = types[cofacetTypeIndex];
      const cofacet = cellFromOrdinal(
        cofacetType,
        ordinalAt(cofacetType, canonical.representativePoint),
      );
      if ((retentionBits(cofacet) & candidateBit(candidateIndex)) !== 0) {
        return false;
      }
    }
    return true;
  };

  const publicCandidates = deepFreezePublicSnapshot(cloneJsonData(candidates));
  const publicClosure = deepFreezePublicSnapshot(cloneJsonData(closure));
  const evaluation: StreamedLawfulEvaluation = {
    oracleStructureHash: oracle.structureHash,
    candidateCount: candidates.length,
    candidates: publicCandidates,
    closure: publicClosure,
    retentionBits,
    isRetained: (cell, candidateIndex) => {
      assertCandidateIndex(candidateIndex, candidates.length);
      return (retentionBits(cell) & candidateBit(candidateIndex)) !== 0;
    },
    edgeIncrement,
    isMaximalRetained,
    checkMoussongMetricFlag,
  };
  return Object.freeze(evaluation);
}

function forEachFaceByTypeIndices(
  cell: StreamedDavisCell,
  faceTypeIndices: readonly number[],
  types: readonly InternalSphericalType[],
  action: PackedAction,
  visitor: (face: StreamedDavisCell) => void,
): void {
  const vertices = verticesOfCell(cell, types, action);
  for (const faceTypeIndex of faceTypeIndices) {
    const faceType = typeOrThrow(types, faceTypeIndex);
    const ordinals = new Set<number>();
    for (const point of vertices) ordinals.add(ordinalAt(faceType, point));
    for (const ordinal of [...ordinals].sort(compareNumbers)) {
      visitor(cellFromOrdinal(faceType, ordinal));
    }
  }
}

/**
 * Build packed orbit tables and quotient-wall parity without materializing the
 * Davis face poset. A nonempty spherical type keeps one compact ordinal per
 * action point; a cell's vertices and faces are reconstructed only on demand.
 */
export function buildStreamedLawfulDavisOracle(
  input: StreamedLawfulDavisInput,
): StreamedLawfulDavisOracle {
  // Validation returns the caller's object. Clone it before constructing any
  // packed tables so later mutations of an imported JSON object cannot change
  // the meaning of an already-hashed oracle.
  const system = cloneJsonData(parseCoxeterSystemInput(input.system));
  const action = packAction(system, input.generatorImages);
  const actionRowsCanonicalSha256 = hashPackedActionRows(action);
  const types = buildSphericalTypes(system, action.degree);
  for (const type of types) buildOrbitIndex(type, action);
  const edges = buildEdges(action, system.rank);
  const walls = buildWalls(system, action, edges, types);
  const cellCountByDimension: Record<string, number> = {};
  for (const type of types) {
    const key = String(type.dimension);
    cellCountByDimension[key] =
      (cellCountByDimension[key] ?? 0) + type.cellCount;
  }
  const cellCount = Object.values(cellCountByDimension).reduce(
    (sum, value) => sum + value,
    0,
  );
  const rankTwoCellCount = types
    .filter((type) => type.dimension === 2)
    .reduce((sum, type) => sum + type.cellCount, 0);
  const publicTypes = deepFreezePublicSnapshot<StreamedSphericalType[]>(
    types.map((type) => ({
      typeIndex: type.typeIndex,
      id: type.id,
      generators: [...type.generators],
      generatorMask: type.generatorMask,
      dimension: type.dimension,
      subgroupOrder: type.subgroupOrder,
      cellCount: type.cellCount,
    })),
  );
  const structureHash = canonicalSha256({
    schemaVersion: 1,
    kind: "streamed-lawful-davis-oracle",
    system: {
      rank: system.rank,
      generators: system.generators.map((generator) => ({
        id: generator.id,
        label: generator.label,
      })),
      coxeterMatrix: system.coxeterMatrix,
    },
    degree: action.degree,
    actionRowsCanonicalSha256,
    sphericalTypes: publicTypes,
    cellCountByDimension,
    geometricEdgeCount: edges.generator.length,
    rankTwoCellCount,
    wallStructureHash: walls.summary.structureHash,
  });
  const publicSystem = deepFreezePublicSnapshot(cloneJsonData(system));
  const publicCellCountByDimension = deepFreezePublicSnapshot({
    ...cellCountByDimension,
  });
  const publicWalls = deepFreezePublicSnapshot<StreamedWallSystemSummary>({
    wallCount: walls.summary.wallCount,
    edgeCount: walls.summary.edgeCount,
    crossingSegmentCount: walls.summary.crossingSegmentCount,
    twoSided: walls.summary.twoSided,
    walls: walls.summary.walls.map((wall) => ({ ...wall })),
    structureHash: walls.summary.structureHash,
  });

  const oracle: StreamedLawfulDavisOracle = {
    system: publicSystem,
    degree: action.degree,
    generatorCount: system.rank,
    geometricEdgeCount: edges.generator.length,
    rankTwoCellCount,
    cellCount,
    cellCountByDimension: publicCellCountByDimension,
    sphericalTypes: publicTypes,
    walls: publicWalls,
    actionRowsCanonicalSha256,
    structureHash,
    neighbor: (point, generator) => {
      assertPoint(point, action.degree);
      assertGenerator(generator, system.rank);
      return action.rows[generator][point];
    },
    geometricEdge: (point, generator) => {
      assertPoint(point, action.degree);
      assertGenerator(generator, system.rank);
      return edgeRecord(
        edges,
        edgeIndexAt(edges, action.degree, point, generator),
      );
    },
    wallForGeometricEdge: (edgeIndex) => {
      edgeRecord(edges, edgeIndex);
      return publicWalls.walls[walls.edgeToWall[edgeIndex]];
    },
    wallIdForEdge: (point, generator) => {
      assertPoint(point, action.degree);
      assertGenerator(generator, system.rank);
      const edgeIndex = edgeIndexAt(edges, action.degree, point, generator);
      return walls.summary.walls[walls.edgeToWall[edgeIndex]].id;
    },
    wallBinding: (point, generator) => {
      assertPoint(point, action.degree);
      assertGenerator(generator, system.rank);
      const edgeIndex = edgeIndexAt(edges, action.degree, point, generator);
      return {
        wallId: walls.summary.walls[walls.edgeToWall[edgeIndex]].id,
        edgeIndex,
        edgeId: edgeRecord(edges, edgeIndex).id,
        edgeParity: walls.edgeParity[edgeIndex] as StreamedOrientationSign,
      };
    },
    cellId: (cell) =>
      cellStableId(canonicalCellOrThrow(cell, types, action.degree)),
    cellContaining: (typeIndex, point) => {
      assertPoint(point, action.degree);
      const type = typeOrThrow(types, typeIndex);
      return cellFromOrdinal(type, ordinalAt(type, point));
    },
    cellVertices: (cell) => verticesOfCell(cell, types, action),
    forEachCell: (typeIndex, visitor) => {
      const type = typeOrThrow(types, typeIndex);
      for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
        visitor(cellFromOrdinal(type, ordinal));
      }
    },
    forEachFacet: (cell, visitor) => {
      const canonical = canonicalCellOrThrow(cell, types, action.degree);
      const type = typeOrThrow(types, canonical.typeIndex);
      forEachFaceByTypeIndices(
        canonical,
        type.immediateFaceTypeIndices,
        types,
        action,
        visitor,
      );
    },
    forEachCofacet: (cell, visitor) => {
      const canonical = canonicalCellOrThrow(cell, types, action.degree);
      const type = typeOrThrow(types, canonical.typeIndex);
      for (const cofacetTypeIndex of type.immediateCofaceTypeIndices) {
        const cofacetType = types[cofacetTypeIndex];
        visitor(
          cellFromOrdinal(
            cofacetType,
            ordinalAt(cofacetType, canonical.representativePoint),
          ),
        );
      }
    },
    forEachRankTwoFace: (cell, visitor) => {
      const canonical = canonicalCellOrThrow(cell, types, action.degree);
      const type = typeOrThrow(types, canonical.typeIndex);
      if (type.dimension < 2) return;
      forEachFaceByTypeIndices(
        canonical,
        type.rankTwoFaceTypeIndices,
        types,
        action,
        visitor,
      );
    },
    forEachRankTwoCell: (visitor) => {
      for (const type of types.filter(
        (candidate) => candidate.dimension === 2,
      )) {
        for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
          visitor(
            boundaryForPairCell(
              cellFromOrdinal(type, ordinal),
              type,
              system,
              action,
              edges,
            ),
          );
        }
      }
    },
    bindCoorientations: (candidates) =>
      buildLawfulEvaluation({
        oracle,
        system,
        action,
        edges,
        walls,
        types,
        candidates,
      }),
    enumerateNativeVertexLinkPrefilter: () =>
      enumerateNativeVertexLinkPrefilter({
        oracle,
        system,
        action,
        edges,
        walls,
        types,
      }),
  };
  return Object.freeze(oracle);
}
