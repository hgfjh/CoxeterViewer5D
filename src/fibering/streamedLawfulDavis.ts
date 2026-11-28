import { parseCoxeterSystemInput } from "../coxeter";
import {
  pairCellUnions,
  type PairUnionTables,
  type PairUnionInput,
  type PairUnionResult,
} from "./wallUnionKernel";
import {
  runOrdered,
  sharedCopy,
  type KernelPool,
} from "../parallel/kernelPool";
import {
  indexMaximalCells,
  type MaximalCellIndexInput,
  type MaximalCellIndexResult,
} from "./orbitIndexKernel";
import { planSphericalSpecialSubgroups } from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import type { ActionRow } from "../torsionFree/types";
import {
  firstAlternatingRelationFailure,
  isInvolutionRow,
} from "../torsionFree/relationCheck";
import {
  canonicalJsonSha256,
  canonicalSha256,
  sha256Hex,
} from "../utils/canonicalSha256";

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
  /** Fresh copies of the packed generator rows (the oracle keeps its own). */
  copyActionRows(): Uint32Array[];
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
  /**
   * Allocation-free variant of forEachRankTwoCell for streaming passes over
   * every 2-cell.  Same cells, same order, same boundary walk; the visitor
   * receives one reused record whose arrays are valid only during the call.
   */
  forEachRankTwoCellPacked(visitor: (cell: PackedRankTwoCell) => void): void;
  /** Generator and stored endpoints of every geometric edge, by edge index. */
  packedEdgeTables(): PackedEdgeTables;
  /** Wall index and stored-orientation parity of every geometric edge. */
  packedWallTables(): PackedWallTables;
  /** Geometric edge index of the generator step at `point`. */
  edgeIndexAt(point: number, generator: number): number;
  /**
   * The oracle's own walk tables and the root bitset of every rank-two type,
   * in forEachRankTwoCellPacked order, for kernels that walk 2-cells off the
   * main thread.  Read-only views: writing to them corrupts the oracle.
   */
  rankTwoWalkTables(): RankTwoWalkTables;
  bindCoorientations(
    candidates: readonly StreamedWallSignCandidate[],
  ): StreamedLawfulEvaluation;
  /**
   * Exhaust every sign map in the oracle's canonical wall order and apply the
   * necessary ascending/descending native Davis-link connectivity test.
   */
  enumerateNativeVertexLinkPrefilter(): StreamedNativeVertexLinkPrefilterResult;
}

/** Reused per-cell record of forEachRankTwoCellPacked. */
export interface PackedRankTwoCell {
  typeIndex: number;
  representativePoint: number;
  /** Stable id, as oracle.cellId(cell) would return. */
  cellId: string;
  /** Boundary length 2m. */
  length: number;
  edgeIndex: Uint32Array;
  /** +1 when the walk runs along the stored edge orientation. */
  traversal: Int8Array;
  /** Walk vertex at each boundary step (the step's source point). */
  point: Uint32Array;
  /** Generator of each boundary step. */
  generator: Uint8Array;
}

export interface PackedEdgeTables {
  generator: Uint32Array;
  /** Stored source (label order), as in StreamedGeometricEdge. */
  source: Uint32Array;
  target: Uint32Array;
}

export interface PackedWallTables {
  edgeToWall: Uint32Array;
  edgeParity: Int8Array;
}

export interface RankTwoWalkTables {
  tables: PairUnionTables;
  types: Array<{
    typeIndex: number;
    typeId: string;
    /** Cell id prefix: the cell rooted at q has id `${idPrefix}${q}`. */
    idPrefix: string;
    left: number;
    right: number;
    relation: number;
    rootBits: Uint32Array;
    cellCount: number;
  }>;
}

export interface StreamedLawfulDavisInput {
  system: unknown;
  /**
   * `generatorImages[g][q]` is the endpoint of the right generator step.
   * Rows are copied, so later changes to the caller's arrays do not reach
   * the oracle.
   */
  generatorImages: readonly (ActionRow | readonly number[])[];
  /**
   * Spherical-cell index storage.  "eager" keeps one ordinal per point and
   * type (O(1) lookups, ~4 bytes x points x types); "lazy" keeps a bitset of
   * orbit minima plus a rank directory (~0.13 bytes x points x types) and
   * recomputes an orbit minimum per lookup.  "auto" (default) is eager while
   * the ordinal tables fit EAGER_ORDINAL_BUDGET_BYTES.  Both modes number
   * cells identically, so every hash and certificate is unchanged.
   */
  ordinalIndex?: "auto" | "eager" | "lazy";
  /** Called after each construction phase, e.g. for progress display. */
  onProgress?: (event: StreamedOracleBuildProgress) => void;
  /**
   * Reuse a live oracle built from the same system and rows (default true).
   * Benchmarks and equivalence tests turn it off to force a fresh build.
   */
  cache?: boolean;
}

export interface StreamedOracleBuildProgress {
  phase:
    | "validate-action"
    | "hash-action-rows"
    | "spherical-types"
    | "orbit-index"
    | "edges"
    | "walls"
    // Parallel builder only: kernels and walls run before construction,
    // whose own orbit-index and walls phases then take almost no time.
    | "parallel-kernels"
    | "parallel-walls";
  /** Milliseconds spent in this phase. */
  elapsedMs: number;
  ordinalIndex?: "eager" | "lazy";
}

interface PackedAction {
  degree: number;
  rows: Uint32Array[];
}

type PackedOrdinalArray = Uint16Array | Uint32Array;

/**
 * Orbit-minimum bitset with a rank directory.  Cells are numbered by their
 * minimum point, so ordinal(cell) = rank of its minimum among all minima.
 */
interface LazyOrbitIndex {
  minimumBits: Uint32Array;
  /** Number of minima strictly before each 16-word (512-point) block. */
  blockRank: Uint32Array;
  rows: Uint32Array[];
  /** Shared scratch for orbit walks larger than LINEAR_DEDUP_LIMIT. */
  scratch: OrbitScratch;
}

interface OrbitScratch {
  stamp?: Uint32Array;
  generation: number;
  queue: Uint32Array;
}

interface InternalSphericalType extends StreamedSphericalType {
  lazyIndex?: LazyOrbitIndex;
  ordinalByPoint?: PackedOrdinalArray;
  representatives?: Uint32Array;
  ordinalSentinel?: number;
  immediateFaceTypeIndices: number[];
  rankTwoFaceTypeIndices: number[];
  immediateCofaceTypeIndices: number[];
}

/**
 * Geometric edges without per-edge tables.  Edges are numbered generator by
 * generator, and within a generator in increasing order of their numerically
 * smaller endpoint, so
 *   edgeIndex(point, g) = offsets[g] + rank_g(min(point, point.s_g)),
 * where rank_g counts the points p < p.s_g below its argument.  One bit per
 * point and generator replaces 4 * rank + 10 bytes per edge.
 */
interface PackedEdges {
  count: number;
  degree: number;
  rows: Uint32Array[];
  /** offsets[g] = first edge index of generator g; offsets[rank] = count. */
  offsets: number[];
  minimumBits: Uint32Array[];
  /**
   * Bit p of sourceBits[g]: p is the stored source of its g-edge (the
   * smaller point label).  Precomputed because the label comparison spells
   * out decimal digits and every boundary walk needs it.
   */
  sourceBits: Uint32Array[];
  blockRank: Uint32Array[];
  /**
   * Set bits strictly before each word.  Edge lookups are the hottest rank
   * queries (every boundary step of every 2-cell), so they get an O(1)
   * per-word directory: 4 bytes per 32 points per generator.
   */
  wordRank: Uint32Array[];
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
const EAGER_ORDINAL_BUDGET_BYTES = 1024 * 1024 * 1024;
const LINEAR_DEDUP_LIMIT = 48;

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
  /**
   * Parity conflicts per root.  Only wall roots ever carry conflicts, so a
   * sparse map replaces a 4-byte-per-edge array.
   */
  private readonly conflicts = new Map<number, number>();
  /** Parity of the last `root()` argument relative to its root. */
  lastParity = 0;

  constructor(size: number) {
    this.parent = new Uint32Array(size);
    this.rank = new Uint8Array(size);
    this.parity = new Uint8Array(size);
    for (let index = 0; index < size; index += 1) this.parent[index] = index;
  }

  /**
   * Root of `item` with path compression; the parity of `item` relative to
   * the root is left in `lastParity`.  Hot loops call this instead of find()
   * so that no result object is allocated per lookup.
   */
  root(item: number): number {
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
    this.lastParity = parityToRoot;
    return root;
  }

  find(item: number): { root: number; parity: number } {
    const root = this.root(item);
    return { root, parity: this.lastParity };
  }

  /** Require parity(first) XOR parity(second) to equal `requiredXor`. */
  union(first: number, second: number, requiredXor: number): boolean {
    const leftRoot = this.root(first);
    const leftParity = this.lastParity;
    const rightRoot = this.root(second);
    const rightParity = this.lastParity;
    const required = requiredXor & 1;
    if (leftRoot === rightRoot) {
      const consistent = (leftParity ^ rightParity) === required;
      if (!consistent) {
        this.conflicts.set(leftRoot, (this.conflicts.get(leftRoot) ?? 0) + 1);
      }
      return consistent;
    }

    const relation = leftParity ^ rightParity ^ required;
    const [child, parent] =
      this.rank[leftRoot] < this.rank[rightRoot]
        ? [leftRoot, rightRoot]
        : [rightRoot, leftRoot];
    this.parent[child] = parent;
    this.parity[child] = relation;
    const moved = this.conflicts.get(child);
    if (moved !== undefined) {
      this.conflicts.delete(child);
      this.conflicts.set(parent, (this.conflicts.get(parent) ?? 0) + moved);
    }
    if (this.rank[leftRoot] === this.rank[rightRoot]) this.rank[parent] += 1;
    return true;
  }

  conflictCount(item: number): number {
    return this.conflicts.get(this.root(item)) ?? 0;
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

const POWERS_OF_TEN = Array.from({ length: 17 }, (_unused, k) => 10 ** k);

function decimalLength(value: number): number {
  let length = 1;
  while (length < 16 && value >= POWERS_OF_TEN[length]) length += 1;
  return length;
}

/**
 * Compare the decimal spellings of two nonnegative integers as JavaScript
 * compares strings, without building the strings.  When one spelling is a
 * proper prefix of the other, the result depends on what follows it: the end
 * of the string sorts first, while a ":" separator (0x3a) sorts after every
 * digit (0x30..0x39).
 */
function compareDecimalSpellings(
  left: number,
  right: number,
  followedBySeparator: boolean,
): number {
  if (left === right) return 0;
  const leftLength = decimalLength(left);
  const rightLength = decimalLength(right);
  const common = Math.min(leftLength, rightLength);
  for (let position = 0; position < common; position += 1) {
    const leftDigit =
      Math.floor(left / POWERS_OF_TEN[leftLength - 1 - position]) % 10;
    const rightDigit =
      Math.floor(right / POWERS_OF_TEN[rightLength - 1 - position]) % 10;
    if (leftDigit !== rightDigit) return leftDigit < rightDigit ? -1 : 1;
  }
  const shorterFirst = leftLength < rightLength ? -1 : 1;
  return followedBySeparator ? -shorterFirst : shorterFirst;
}

/** Same order as compareIds(pointLabel(left), pointLabel(right)). */
function comparePointLabels(left: number, right: number): number {
  return compareDecimalSpellings(left, right, false);
}

/**
 * Same order as compareIds on edgeStableId strings
 * "bar:e:g<g>:q<s>:q<t>", field by field.
 */
function compareEdgeStableIds(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return (
    compareDecimalSpellings(left[0], right[0], true) ||
    compareDecimalSpellings(left[1], right[1], true) ||
    compareDecimalSpellings(left[2], right[2], false)
  );
}

function storedEdgeEndpoints(first: number, second: number): [number, number] {
  return comparePointLabels(first, second) <= 0
    ? [first, second]
    : [second, first];
}

export function edgeStableId(
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
  sourceRows: readonly (ActionRow | readonly number[])[],
  precomputed?: PrecomputedOracleKernels,
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
    // Rows are always copied: the oracle (and the content-addressed oracle
    // cache) must not change if the caller later mutates its arrays.
    const packed = source instanceof Uint32Array;
    // Rows from the parallel builder are private copies already.
    const row = packed
      ? precomputed
        ? source
        : source.slice()
      : new Uint32Array(degree);
    const seen = new Uint8Array(degree);
    for (let point = 0; point < degree; point += 1) {
      const image = source[point];
      if (
        packed
          ? image >= degree
          : !Number.isInteger(image) || image < 0 || image >= degree
      ) {
        errors.push(
          `Generator ${generator} sends q${point} outside 0..${degree - 1}.`,
        );
        continue;
      }
      if (seen[image] !== 0) {
        errors.push(`Generator ${generator} repeats image q${image}.`);
      }
      seen[image] = 1;
      if (!packed) row[point] = image;
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
  const involutive = rows.map(isInvolutionRow);
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const m = system.coxeterMatrix[left][right];
      if (m === "inf") continue;
      const known = precomputed?.relationFailures.get(`${left},${right}`);
      const failure =
        known !== undefined
          ? (known ?? undefined)
          : firstAlternatingRelationFailure(
              rows[left],
              rows[right],
              m,
              degree,
              involutive[left] && involutive[right],
            );
      if (failure) {
        errors.push(
          `The (${left},${right}) Coxeter relation of order ${m} fails at q${failure.point}.`,
        );
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
 * Canonical action-row digest used by streamed proof certificates.
 *
 * Fixed chunk boundaries avoid one large JSON copy and make the digest
 * independently replayable. Ordinary arrays are accepted alongside packed
 * rows so intake code can bind an action before constructing the oracle.
 */
export function computeStreamedActionRowsCanonicalSha256(
  rows: readonly ArrayLike<number>[],
): string {
  const chunkSize = 4_096;
  const degree = rows[0]?.length ?? 0;
  const rowChunkHashes = rows.map((row, generator) => {
    const chunks: string[] = [];
    for (let start = 0; start < row.length; start += chunkSize) {
      const end = Math.min(row.length, start + chunkSize);
      // Literal canonical JSON of {generator, start, images}: keys sorted,
      // integers in plain decimal.  Spelling it out skips the generic
      // canonicalizer's per-element property checks, which dominated the
      // cost for actions with 10^8 entries.  Non-integers fall back to it.
      let images = "";
      let plain = true;
      for (let point = start; point < end; point += 1) {
        const image = row[point];
        if (!Number.isSafeInteger(image)) {
          plain = false;
          break;
        }
        images += point === start ? `${image}` : `,${image}`;
      }
      chunks.push(
        plain
          ? sha256Hex(
              `{"generator":${generator},"images":[${images}],"start":${start}}`,
            )
          : canonicalSha256({
              generator,
              start,
              images: Array.from(row).slice(start, end),
            }),
      );
    }
    return canonicalSha256({
      generator,
      degree,
      chunkSize,
      chunks,
    });
  });
  return canonicalSha256({
    schemaVersion: 1,
    method: "fixed-row-chunk-sha256-tree",
    degree,
    generatorCount: rows.length,
    chunkSize,
    rowChunkHashes,
  });
}

function hashPackedActionRows(action: PackedAction): string {
  return computeStreamedActionRowsCanonicalSha256(action.rows);
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

function popcount32(value: number): number {
  value -= (value >>> 1) & 0x5555_5555;
  value = (value & 0x3333_3333) + ((value >>> 2) & 0x3333_3333);
  return Math.imul((value + (value >>> 4)) & 0x0f0f_0f0f, 0x0101_0101) >>> 24;
}

function eagerOrdinalBytes(
  types: readonly InternalSphericalType[],
  degree: number,
): number {
  return types.reduce(
    (sum, type) =>
      type.dimension === 0
        ? sum
        : sum +
          degree * (type.cellCount < UINT16_SENTINEL ? 2 : 4) +
          4 * type.cellCount,
    0,
  );
}

/**
 * Lazy counterpart of buildOrbitIndex: the same freeness and cell-count
 * checks, but only orbit minima are recorded.  Roots are scanned in
 * increasing order, so an unvisited root is the minimum of its orbit.
 */
function buildLazyOrbitIndex(
  type: InternalSphericalType,
  action: PackedAction,
  visited: Uint32Array,
  scratch: OrbitScratch,
): void {
  if (type.dimension === 0) return;
  visited.fill(0);
  const words = Math.ceil(action.degree / 32);
  const minimumBits = new Uint32Array(words);
  const queue = new Uint32Array(type.subgroupOrder);
  let cells = 0;
  for (let root = 0; root < action.degree; root += 1) {
    if ((visited[root >>> 5] >>> (root & 31)) & 1) continue;
    minimumBits[root >>> 5] |= 1 << (root & 31);
    visited[root >>> 5] |= 1 << (root & 31);
    queue[0] = root;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const point = queue[head++];
      for (const generator of type.generators) {
        const image = action.rows[generator][point];
        if ((visited[image >>> 5] >>> (image & 31)) & 1) continue;
        if (tail >= queue.length) {
          throw new StreamedLawfulDavisError("Spherical action is not free", [
            `${type.id} has an orbit larger than ${type.subgroupOrder}.`,
          ]);
        }
        visited[image >>> 5] |= 1 << (image & 31);
        queue[tail++] = image;
      }
    }
    if (tail !== type.subgroupOrder) {
      throw new StreamedLawfulDavisError("Spherical action is not free", [
        `${type.id} has an orbit of size ${tail}; expected ${type.subgroupOrder}.`,
      ]);
    }
    cells += 1;
  }
  if (cells !== type.cellCount) {
    throw new StreamedLawfulDavisError("Spherical orbit count mismatch", [
      `${type.id} produced ${cells} cells; expected ${type.cellCount}.`,
    ]);
  }
  const blockRank = buildBlockRank(minimumBits);
  if (scratch.queue.length < type.subgroupOrder) {
    scratch.queue = new Uint32Array(type.subgroupOrder);
  }
  type.lazyIndex = { minimumBits, blockRank, rows: action.rows, scratch };
}

/**
 * Lazy indexes for every spherical type from one walk per maximal type.
 *
 * A maximal cell x W_V has |W_V| points (the action is free; the orbit walk
 * of buildLazyOrbitIndex checks that).  Its points are laid out once through
 * a universal BFS template of W_V, the same for every cell because the
 * action is free, and for each subtype T of V the T-cells inside it are the
 * cosets of W_T in W_V.  Their minima are found locally, so the action is
 * walked once per maximal type instead of once per spherical type.
 */
function buildLazyOrbitIndexesByMaximalCells(
  types: readonly InternalSphericalType[],
  action: PackedAction,
  scratch: OrbitScratch,
  /** Kernel results by host type index, computed off-thread on these rows. */
  precomputed?: ReadonlyMap<number, MaximalCellIndexResult>,
): void {
  const { maximal, assigned, unhosted } = maximalCellAssignment(types);
  const visited = new Uint32Array(Math.ceil(action.degree / 32));
  // Types inside no maximal type are indexed with their own orbit walk.
  for (const type of unhosted) {
    buildLazyOrbitIndex(type, action, visited, scratch);
  }
  for (const host of maximal) {
    const subtypes = assigned.get(host)!;
    const result =
      precomputed?.get(host.typeIndex) ??
      indexMaximalCells(maximalCellIndexInput(host, subtypes, action));
    if (!result.ok) {
      throw new StreamedLawfulDavisError(result.title, result.details);
    }
    if (result.cells !== host.cellCount) {
      throw new StreamedLawfulDavisError("Spherical orbit count mismatch", [
        `${host.id} produced ${result.cells} cells; expected ${host.cellCount}.`,
      ]);
    }
    if (scratch.queue.length < host.subgroupOrder) {
      scratch.queue = new Uint32Array(host.subgroupOrder);
    }
    host.lazyIndex = {
      minimumBits: result.hostBits,
      blockRank: buildBlockRank(result.hostBits),
      rows: action.rows,
      scratch,
    };
    subtypes.forEach((subtype, t) => {
      const bits = result.subtypeBits[t];
      const blockRank = buildBlockRank(bits);
      if (blockRank[blockRank.length - 1] !== subtype.cellCount) {
        throw new StreamedLawfulDavisError("Spherical orbit count mismatch", [
          `${subtype.id} produced ${blockRank[blockRank.length - 1]} cells; expected ${subtype.cellCount}.`,
        ]);
      }
      if (scratch.queue.length < subtype.subgroupOrder) {
        scratch.queue = new Uint32Array(subtype.subgroupOrder);
      }
      subtype.lazyIndex = {
        minimumBits: bits,
        blockRank,
        rows: action.rows,
        scratch,
      };
    });
  }
}

/** Maximal spherical types and the lower types each one indexes. */
function maximalCellAssignment(types: readonly InternalSphericalType[]): {
  maximal: InternalSphericalType[];
  assigned: Map<InternalSphericalType, InternalSphericalType[]>;
  unhosted: InternalSphericalType[];
} {
  const positive = types.filter((type) => type.dimension > 0);
  const maximal = positive.filter(
    (type) => type.immediateCofaceTypeIndices.length === 0,
  );
  const assigned = new Map<InternalSphericalType, InternalSphericalType[]>(
    maximal.map((type) => [type, []]),
  );
  const unhosted: InternalSphericalType[] = [];
  for (const type of positive) {
    if (assigned.has(type)) continue;
    const host = maximal.find((candidate) =>
      isSubsetMask(type.generatorMask, candidate.generatorMask),
    );
    if (host) assigned.get(host)!.push(type);
    else unhosted.push(type);
  }
  return { maximal, assigned, unhosted };
}

function maximalCellIndexInput(
  host: InternalSphericalType,
  subtypes: readonly InternalSphericalType[],
  action: PackedAction,
): MaximalCellIndexInput {
  return {
    rows: action.rows,
    degree: action.degree,
    hostId: host.id,
    hostGenerators: host.generators,
    size: host.subgroupOrder,
    subtypeGenerators: subtypes.map((subtype) => subtype.generators),
  };
}

/** Minimum point of the W_T-orbit of `point` (orbits have |W_T| points). */
function lazyOrbitMinimum(
  type: InternalSphericalType,
  index: LazyOrbitIndex,
  point: number,
): number {
  const { scratch } = index;
  const queue = scratch.queue;
  queue[0] = point;
  let tail = 1;
  let minimum = point;
  if (type.subgroupOrder <= LINEAR_DEDUP_LIMIT) {
    // Rank-two and other small cells: a linear scan of <= 48 entries is
    // cheaper than touching a point-sized stamp array.
    for (let head = 0; head < tail; head += 1) {
      const current = queue[head];
      for (const generator of type.generators) {
        const image = index.rows[generator][current];
        let seen = false;
        for (let k = 0; k < tail; k += 1) {
          if (queue[k] === image) {
            seen = true;
            break;
          }
        }
        if (seen) continue;
        queue[tail++] = image;
        if (image < minimum) minimum = image;
      }
    }
    return minimum;
  }
  if (!scratch.stamp) scratch.stamp = new Uint32Array(index.rows[0].length);
  const stamp = scratch.stamp;
  scratch.generation = (scratch.generation + 1) >>> 0;
  if (scratch.generation === 0) {
    stamp.fill(0);
    scratch.generation = 1;
  }
  const generation = scratch.generation;
  stamp[point] = generation;
  for (let head = 0; head < tail; head += 1) {
    const current = queue[head];
    for (const generator of type.generators) {
      const image = index.rows[generator][current];
      if (stamp[image] === generation) continue;
      stamp[image] = generation;
      queue[tail++] = image;
      if (image < minimum) minimum = image;
    }
  }
  return minimum;
}

/** Rank directory: set bits strictly before each 16-word (512-bit) block. */
function buildBlockRank(bits: Uint32Array): Uint32Array {
  const blockRank = new Uint32Array(Math.ceil(bits.length / 16) + 1);
  let running = 0;
  for (let word = 0; word < bits.length; word += 1) {
    if ((word & 15) === 0) blockRank[word >>> 4] = running;
    running += popcount32(bits[word]);
  }
  blockRank[blockRank.length - 1] = running;
  return blockRank;
}

/** Number of set bits strictly below `position`. */
function rankBits(
  bits: Uint32Array,
  blockRank: Uint32Array,
  position: number,
): number {
  const word = position >>> 5;
  let rank = blockRank[word >>> 4];
  for (let k = word & ~15; k < word; k += 1) rank += popcount32(bits[k]);
  const below = position & 31;
  if (below > 0) rank += popcount32((bits[word] & ((1 << below) - 1)) >>> 0);
  return rank;
}

/** Position of the set bit of rank `ordinal` (zero-based). */
function selectBits(
  bits: Uint32Array,
  blockRank: Uint32Array,
  ordinal: number,
): number {
  // Last block whose starting rank is <= ordinal, then scan its words.
  let low = 0;
  let high = blockRank.length - 2;
  while (low < high) {
    const middle = (low + high + 1) >>> 1;
    if (blockRank[middle] <= ordinal) low = middle;
    else high = middle - 1;
  }
  let remaining = ordinal - blockRank[low];
  for (let word = low * 16; word < bits.length; word += 1) {
    let value = bits[word];
    const count = popcount32(value);
    if (remaining >= count) {
      remaining -= count;
      continue;
    }
    while (remaining > 0) {
      value &= value - 1;
      remaining -= 1;
    }
    return word * 32 + (31 - Math.clz32(value & -value));
  }
  throw new RangeError(`Bit rank ${ordinal} is out of range.`);
}

function lazyRank(index: LazyOrbitIndex, minimum: number): number {
  return rankBits(index.minimumBits, index.blockRank, minimum);
}

function lazySelect(index: LazyOrbitIndex, ordinal: number): number {
  return selectBits(index.minimumBits, index.blockRank, ordinal);
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
  if (type.lazyIndex) {
    return lazyRank(
      type.lazyIndex,
      lazyOrbitMinimum(type, type.lazyIndex, point),
    );
  }
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
    type.dimension === 0
      ? ordinal
      : type.lazyIndex
        ? ordinal >= 0 && ordinal < type.cellCount
          ? lazySelect(type.lazyIndex, ordinal)
          : undefined
        : type.representatives?.[ordinal];
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
  const words = Math.ceil(action.degree / 32);
  const offsets = [0];
  const minimumBits: Uint32Array[] = [];
  const sourceBits: Uint32Array[] = [];
  const blockRank: Uint32Array[] = [];
  const wordRank: Uint32Array[] = [];
  for (let generator = 0; generator < rank; generator += 1) {
    const row = action.rows[generator];
    const bits = sharedUint32Array(words);
    const sources = sharedUint32Array(words);
    for (let point = 0; point < action.degree; point += 1) {
      const image = row[point];
      if (image === point) {
        throw new StreamedLawfulDavisError(
          "Cannot index a fixed generator edge",
          [`Generator ${generator} fixes q${point}.`],
        );
      }
      if (point < image) bits[point >>> 5] |= 1 << (point & 31);
      if (comparePointLabels(point, image) <= 0) {
        sources[point >>> 5] |= 1 << (point & 31);
      }
    }
    sourceBits.push(sources);
    const directory = buildBlockRank(bits);
    const perWord = sharedUint32Array(words);
    let running = 0;
    for (let word = 0; word < words; word += 1) {
      perWord[word] = running;
      running += popcount32(bits[word]);
    }
    minimumBits.push(bits);
    blockRank.push(directory);
    wordRank.push(perWord);
    offsets.push(offsets[generator] + directory[directory.length - 1]);
  }
  if (offsets[rank] !== expectedEdgeCount) {
    throw new StreamedLawfulDavisError("Geometric edge count mismatch", [
      `Indexed ${offsets[rank]} edges; expected ${expectedEdgeCount}.`,
    ]);
  }
  return {
    count: expectedEdgeCount,
    degree: action.degree,
    rows: action.rows,
    offsets,
    minimumBits,
    sourceBits,
    blockRank,
    wordRank,
  };
}

/**
 * Uint32Array in shared memory when the environment has it, so worker-thread
 * kernels can read the table in place; an ordinary one otherwise.
 */
function sharedUint32Array(length: number): Uint32Array {
  return typeof SharedArrayBuffer === "undefined"
    ? new Uint32Array(length)
    : new Uint32Array(new SharedArrayBuffer(length * 4));
}

function edgeGeneratorOf(edges: PackedEdges, edgeIndex: number): number {
  let generator = 0;
  while (edges.offsets[generator + 1] <= edgeIndex) generator += 1;
  return generator;
}

/** Stored endpoints (source first, in point-label order) of an edge. */
function edgeEndpoints(
  edges: PackedEdges,
  edgeIndex: number,
): [number, number, number] {
  const generator = edgeGeneratorOf(edges, edgeIndex);
  const minimum = selectBits(
    edges.minimumBits[generator],
    edges.blockRank[generator],
    edgeIndex - edges.offsets[generator],
  );
  const [source, target] = storedEdgeEndpoints(
    minimum,
    edges.rows[generator][minimum],
  );
  return [generator, source, target];
}

/** +1 when `point` is the stored source of its generator edge, else -1. */
function edgeTraversal(
  edges: PackedEdges,
  point: number,
  generator: number,
): 1 | -1 {
  return (edges.sourceBits[generator][point >>> 5] >>> (point & 31)) & 1
    ? 1
    : -1;
}

function edgeRecord(
  edges: PackedEdges,
  edgeIndex: number,
): StreamedGeometricEdge {
  if (
    !Number.isInteger(edgeIndex) ||
    edgeIndex < 0 ||
    edgeIndex >= edges.count
  ) {
    throw new RangeError(`Unknown geometric edge index ${edgeIndex}.`);
  }
  const [generator, sourcePoint, targetPoint] = edgeEndpoints(edges, edgeIndex);
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
  const row = edges.rows[generator];
  if (row === undefined || point < 0 || point >= degree) {
    throw new StreamedLawfulDavisError("Missing geometric edge", [
      `No edge is indexed at q${point} for generator ${generator}.`,
    ]);
  }
  const image = row[point];
  const minimum = point < image ? point : image;
  const word = minimum >>> 5;
  const below = minimum & 31;
  return (
    edges.offsets[generator] +
    edges.wordRank[generator][word] +
    (below === 0
      ? 0
      : popcount32(
          (edges.minimumBits[generator][word] & ((1 << below) - 1)) >>> 0,
        ))
  );
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

/** Reusable boundary buffers for one 2m-gon (m <= relation bound). */
interface PairBoundaryScratch {
  edgeIndex: Uint32Array;
  traversal: Int8Array;
  point: Uint32Array;
}

function createPairBoundaryScratch(
  system: CoxeterSystemInput,
): PairBoundaryScratch {
  let longest = 4;
  for (const row of system.coxeterMatrix) {
    for (const entry of row) {
      if (entry !== "inf") longest = Math.max(longest, 2 * entry);
    }
  }
  return {
    edgeIndex: new Uint32Array(longest),
    traversal: new Int8Array(longest),
    point: new Uint32Array(longest),
  };
}

/**
 * Visit the representative point (orbit minimum) of every cell of `type` in
 * ordinal order, reading the eager table or the lazy minimum bitset directly
 * so no per-cell select or object is needed.
 */
function forEachCellRoot(
  type: InternalSphericalType,
  visitor: (root: number, ordinal: number) => void,
): void {
  if (type.lazyIndex) {
    const bits = type.lazyIndex.minimumBits;
    let ordinal = 0;
    for (let word = 0; word < bits.length; word += 1) {
      let remaining = bits[word];
      while (remaining !== 0) {
        const lowest = remaining & -remaining;
        visitor(word * 32 + (31 - Math.clz32(lowest)), ordinal);
        ordinal += 1;
        remaining = (remaining ^ lowest) >>> 0;
      }
    }
    return;
  }
  const representatives = type.representatives!;
  for (let ordinal = 0; ordinal < type.cellCount; ordinal += 1) {
    visitor(representatives[ordinal], ordinal);
  }
}

/**
 * Fill `scratch` with the boundary of the 2m-gon rooted at `root` (edges
 * alternate left, right) and return its length 2m.  Same checks and the same
 * traversal convention as boundaryForPairCell, without allocation.
 */
function walkPairBoundary(
  root: number,
  type: InternalSphericalType,
  relation: number,
  action: PackedAction,
  edges: PackedEdges,
  scratch: PairBoundaryScratch,
): number {
  const [left, right] = type.generators;
  const length = 2 * relation;
  let current = root;
  for (let boundaryIndex = 0; boundaryIndex < length; boundaryIndex += 1) {
    for (let earlier = 0; earlier < boundaryIndex; earlier += 1) {
      if (scratch.point[earlier] === current) {
        throw new StreamedLawfulDavisError("Degenerate rank-two boundary", [
          `${type.id} cell at q${root} repeats q${current} before closing.`,
        ]);
      }
    }
    const generator = boundaryIndex % 2 === 0 ? left : right;
    const edgeIndex = edgeIndexAt(edges, action.degree, current, generator);
    scratch.point[boundaryIndex] = current;
    scratch.edgeIndex[boundaryIndex] = edgeIndex;
    scratch.traversal[boundaryIndex] = edgeTraversal(edges, current, generator);
    current = action.rows[generator][current];
  }
  if (current !== root) {
    throw new StreamedLawfulDavisError("Incomplete rank-two boundary", [
      `${type.id} cell at q${root} does not close as a ${length}-gon.`,
    ]);
  }
  return length;
}

function pairRelation(
  system: CoxeterSystemInput,
  type: InternalSphericalType,
): number {
  const [left, right] = type.generators;
  const relation = system.coxeterMatrix[left][right];
  if (type.dimension !== 2 || relation === "inf" || relation < 2) {
    throw new StreamedLawfulDavisError("Invalid finite-pair type", [
      `${type.id} does not have a finite rank-two relation.`,
    ]);
  }
  return relation;
}

function rankTwoCellIdPrefix(type: InternalSphericalType): string {
  return `sld:cell:T${type.generators.join("-")}:q`;
}

/** Cell roots per union kernel call: 2^14 bitset words = 2^19 points. */
const PAIR_UNION_CHUNK_WORDS = 1 << 14;

/** Union-find state of the wall pass, filled chunk by chunk in cell order. */
interface WallUnionState {
  disjointSet: ParityDisjointSet;
  /**
   * Crossing segments tallied on the segment's first edge and summed per
   * wall afterwards.  An edge lies on at most rank-1 rank-two cells, so a
   * byte holds its count.
   */
  segmentsByEdge: Uint8Array;
  crossingSegmentCount: number;
}

function createWallUnionState(edges: PackedEdges): WallUnionState {
  if (edges.count >= 2 ** 31) {
    throw new StreamedLawfulDavisError("Too many geometric edges", [
      `${edges.count} edges exceed the 2^31 limit of packed union records.`,
    ]);
  }
  return {
    disjointSet: new ParityDisjointSet(edges.count),
    segmentsByEdge: new Uint8Array(edges.count),
    crossingSegmentCount: 0,
  };
}

/** Orbit-minimum bitset of a type, from either index representation. */
function cellRootBits(
  type: InternalSphericalType,
  degree: number,
): Uint32Array {
  if (type.lazyIndex) return type.lazyIndex.minimumBits;
  const bits = new Uint32Array(Math.ceil(degree / 32));
  for (const root of type.representatives!)
    bits[root >>> 5] |= 1 << (root & 31);
  return bits;
}

/**
 * Union kernel inputs for every rank-two type, in the order the sequential
 * pass visits cells: type by type, roots increasing.
 */
function* pairUnionJobs(
  system: CoxeterSystemInput,
  action: PackedAction,
  edges: PackedEdges,
  types: readonly InternalSphericalType[],
  rootBitsOf: (type: InternalSphericalType) => Uint32Array,
): Generator<PairUnionInput> {
  for (const type of types.filter((candidate) => candidate.dimension === 2)) {
    const relation = pairRelation(system, type);
    const rootBits = rootBitsOf(type);
    for (
      let firstWord = 0;
      firstWord < rootBits.length;
      firstWord += PAIR_UNION_CHUNK_WORDS
    ) {
      yield {
        rows: action.rows,
        degree: action.degree,
        offsets: edges.offsets,
        minimumBits: edges.minimumBits,
        wordRank: edges.wordRank,
        sourceBits: edges.sourceBits,
        typeId: type.id,
        left: type.generators[0],
        right: type.generators[1],
        relation,
        rootBits: rootBits.slice(firstWord, firstWord + PAIR_UNION_CHUNK_WORDS),
        firstWord,
      };
    }
  }
}

function applyPairUnions(state: WallUnionState, result: PairUnionResult) {
  if (!result.ok) {
    throw new StreamedLawfulDavisError(result.title, result.details);
  }
  const { disjointSet, segmentsByEdge } = state;
  const unions = result.unions;
  for (let index = 0; index < 2 * result.count; index += 2) {
    const first = unions[index];
    const packed = unions[index + 1];
    disjointSet.union(first, packed & 0x7fff_ffff, packed >>> 31);
    segmentsByEdge[first] += 1;
  }
  state.crossingSegmentCount += result.count;
}

function buildWalls(
  system: CoxeterSystemInput,
  action: PackedAction,
  edges: PackedEdges,
  types: readonly InternalSphericalType[],
): InternalWalls {
  const state = createWallUnionState(edges);
  for (const job of pairUnionJobs(system, action, edges, types, (type) =>
    cellRootBits(type, action.degree),
  )) {
    applyPairUnions(state, pairCellUnions(job));
  }
  return finishWalls(action, edges, state);
}

/**
 * buildWalls with the cell walks on a kernel pool.  Results are applied in
 * job order through a bounded window, so the union sequence, and with it
 * every wall, conflict count and hash, is the sequential one.
 */
async function buildWallsParallel(
  system: CoxeterSystemInput,
  action: PackedAction,
  edges: PackedEdges,
  types: readonly InternalSphericalType[],
  rootBitsOf: (type: InternalSphericalType) => Uint32Array,
  pool: KernelPool,
): Promise<InternalWalls> {
  const state = createWallUnionState(edges);
  const jobs = pairUnionJobs(system, action, edges, types, rootBitsOf);
  await runOrdered(
    pool,
    jobs,
    (job) => pool.run("pairCellUnions", job),
    (result) => applyPairUnions(state, result),
  );
  return finishWalls(action, edges, state);
}

function finishWalls(
  action: PackedAction,
  edges: PackedEdges,
  state: WallUnionState,
): InternalWalls {
  const { disjointSet, segmentsByEdge, crossingSegmentCount } = state;
  // One slot per union-find root, i.e. per wall.  Walls are few even when
  // edges number in the hundreds of millions, so per-root data lives in small
  // slot arrays instead of four edge-sized tables.
  const slotByRoot = new Map<number, number>();
  const slotRoot: number[] = [];
  const slotCanonicalEdge: number[] = [];
  const slotCanonicalId: Array<[number, number, number]> = [];
  const slotEdgeCount: number[] = [];
  const slotSegmentCount: number[] = [];
  const rootSlot = (root: number): number => {
    let slot = slotByRoot.get(root);
    if (slot === undefined) {
      slot = slotRoot.length;
      slotByRoot.set(root, slot);
      slotRoot.push(root);
      slotCanonicalEdge.push(UINT32_SENTINEL);
      slotCanonicalId.push([0, 0, 0]);
      slotEdgeCount.push(0);
      slotSegmentCount.push(0);
    }
    return slot;
  };
  // Walk edges in index order (generator, then smaller endpoint) so each
  // edge's id fields are known without a select query.
  const candidateId: [number, number, number] = [0, 0, 0];
  let edgeIndex = 0;
  for (let generator = 0; generator < action.rows.length; generator += 1) {
    const row = action.rows[generator];
    for (let point = 0; point < action.degree; point += 1) {
      const image = row[point];
      if (point > image) continue;
      const slot = rootSlot(disjointSet.root(edgeIndex));
      slotEdgeCount[slot] += 1;
      slotSegmentCount[slot] += segmentsByEdge[edgeIndex];
      const [source, target] = storedEdgeEndpoints(point, image);
      candidateId[0] = generator;
      candidateId[1] = source;
      candidateId[2] = target;
      if (
        slotCanonicalEdge[slot] === UINT32_SENTINEL ||
        compareEdgeStableIds(candidateId, slotCanonicalId[slot]) < 0
      ) {
        slotCanonicalEdge[slot] = edgeIndex;
        slotCanonicalId[slot] = [generator, source, target];
      }
      edgeIndex += 1;
    }
  }
  const slotsInWallOrder = slotRoot
    .map((_root, slot) => slot)
    .sort((left, right) =>
      compareEdgeStableIds(slotCanonicalId[left], slotCanonicalId[right]),
    );
  const wallIndexBySlot = new Uint32Array(slotRoot.length);
  const walls: StreamedWall[] = slotsInWallOrder.map((slot, wallIndex) => {
    wallIndexBySlot[slot] = wallIndex;
    const canonicalEdgeIndex = slotCanonicalEdge[slot];
    const canonicalEdgeId = edgeRecord(edges, canonicalEdgeIndex).id;
    const parityConflictCount = disjointSet.conflictCount(slotRoot[slot]);
    return {
      wallIndex,
      id: `wall:${canonicalEdgeId}`,
      canonicalEdgeIndex,
      canonicalEdgeId,
      edgeCount: slotEdgeCount[slot],
      crossingSegmentCount: slotSegmentCount[slot],
      parityConflictCount,
      twoSided: parityConflictCount === 0,
    };
  });
  // Parity of each wall's canonical edge relative to its root.
  const slotCanonicalParity = slotCanonicalEdge.map((edgeIndex) => {
    disjointSet.root(edgeIndex);
    return disjointSet.lastParity;
  });
  const edgeToWall = new Uint32Array(edges.count);
  const edgeParity = new Int8Array(edges.count);
  for (let edgeIndex = 0; edgeIndex < edges.count; edgeIndex += 1) {
    const slot = slotByRoot.get(disjointSet.root(edgeIndex))!;
    const parity = disjointSet.lastParity;
    edgeToWall[edgeIndex] = wallIndexBySlot[slot];
    edgeParity[edgeIndex] = (parity ^ slotCanonicalParity[slot]) === 0 ? 1 : -1;
  }
  const summaryWithoutHash = {
    wallCount: walls.length,
    edgeCount: edges.count,
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
  const scratch = createPairBoundaryScratch(system);
  const termBuffer = new Float64Array(scratch.edgeIndex.length);
  for (const type of types.filter((candidate) => candidate.dimension === 2)) {
    const relation = pairRelation(system, type);
    forEachCellRoot(type, (root) => {
      const length = walkPairBoundary(
        root,
        type,
        relation,
        action,
        edges,
        scratch,
      );
      for (let index = 0; index < length; index += 1) {
        const currentEdge = scratch.edgeIndex[index];
        const nextIndex = (index + 1) % length;
        const nextEdge = scratch.edgeIndex[nextIndex];
        const currentWall = walls.edgeToWall[currentEdge];
        const nextWall = walls.edgeToWall[nextEdge];
        const leftWall = Math.min(currentWall, nextWall);
        const rightWall = Math.max(currentWall, nextWall);
        const currentFixedSign =
          walls.edgeParity[currentEdge] * scratch.traversal[index];
        const nextFixedSign =
          walls.edgeParity[nextEdge] * scratch.traversal[nextIndex];
        const fixedTransition = currentFixedSign === nextFixedSign ? 0 : 1;
        termBuffer[index] =
          2 * (leftWall * wallCount + rightWall) + fixedTransition;
      }
      const terms = termBuffer.subarray(0, length).sort();
      // Distinct patterns are few; the key string is the only per-cell allocation.
      const key = terms.join(",");
      const existing = patterns.get(key);
      if (existing) existing.frequency += 1;
      else patterns.set(key, { frequency: 1, terms: Array.from(terms) });
    });
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

  const wallGeneratorEffects = new Uint32Array(orderedWallIds.length);
  for (let point = 0; point < action.degree; point += 1) {
    let descendingGeneratorMask = 0;
    wallGeneratorEffects.fill(0);
    for (let generator = 0; generator < system.rank; generator += 1) {
      const edgeIndex = edgeIndexAt(edges, action.degree, point, generator);
      const traversal = edgeTraversal(edges, point, generator);
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

/**
 * Digest of {[valuesKey]: [...], start, typeIndex} written as literal
 * canonical JSON (keys already sorted: both value keys precede "start").
 * Equal to canonicalSha256 of that object, without building per-cell
 * arrays and walking them through the generic canonicalizer.
 */
function retentionChunkDigest(
  valuesKey: "retained" | "retentionBits",
  count: number,
  valueAt: (offset: number) => number,
  start: number,
  typeIndex: number,
): string {
  let values = "";
  for (let offset = 0; offset < count; offset += 1) {
    values += offset === 0 ? `${valueAt(offset)}` : `,${valueAt(offset)}`;
  }
  return sha256Hex(
    `{"${valuesKey}":[${values}],"start":${start},"typeIndex":${typeIndex}}`,
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
      const retention = input.retentionByType[type.typeIndex];
      chunkHashes.push(
        retentionChunkDigest(
          "retentionBits",
          end - start,
          type.dimension === 0
            ? () => input.allBits
            : (offset) => retention![start + offset],
          start,
          type.typeIndex,
        ),
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
      const retention = input.retentionByType[type.typeIndex];
      chunkHashes.push(
        retentionChunkDigest(
          "retained",
          end - start,
          type.dimension === 0
            ? () => 1
            : (offset) => ((retention![start + offset] & bit) !== 0 ? 1 : 0),
          start,
          type.typeIndex,
        ),
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
  // Bit c of negativeWallBits[w] is set when candidate c gives wall w the
  // sign -1.  The direction of edge e for candidate c is then
  // (bit ? -1 : 1) * edgeParity[e]: no candidates-by-edges table is needed.
  const negativeWallBits = new Uint32Array(walls.summary.wallCount);
  walls.summary.walls.forEach((wall, wallIndex) => {
    let bits = 0;
    candidates.forEach((candidate, candidateIndex) => {
      if (candidate.wallSigns[wall.id] === -1) {
        bits |= candidateBit(candidateIndex);
      }
    });
    negativeWallBits[wallIndex] = bits >>> 0;
  });

  const retentionByType: Array<Uint32Array | undefined> = Array(types.length);
  for (const type of types) {
    if (type.dimension === 0) continue;
    retentionByType[type.typeIndex] = new Uint32Array(type.cellCount);
    if (type.dimension === 1) retentionByType[type.typeIndex]?.fill(allBits);
  }

  const pairScratch = createPairBoundaryScratch(system);
  for (const type of types.filter((candidate) => candidate.dimension === 2)) {
    const retention = retentionByType[type.typeIndex]!;
    const relation = pairRelation(system, type);
    forEachCellRoot(type, (root, ordinal) => {
      const length = walkPairBoundary(
        root,
        type,
        relation,
        action,
        edges,
        pairScratch,
      );
      // A lawful 2m-gon has exactly two sign changes around its boundary.
      // Bit-sliced over all candidates: the change between consecutive
      // boundary steps is the fixed-parity flip XOR both walls' sign masks,
      // and a saturating 0/1/2/3+ counter is kept in three bit planes.
      let ones = 0;
      let twos = 0;
      let more = 0;
      for (let index = 0; index < length; index += 1) {
        const nextIndex = index + 1 === length ? 0 : index + 1;
        const edge = pairScratch.edgeIndex[index];
        const nextEdge = pairScratch.edgeIndex[nextIndex];
        const fixedFlip =
          walls.edgeParity[edge] * pairScratch.traversal[index] !==
          walls.edgeParity[nextEdge] * pairScratch.traversal[nextIndex];
        const change =
          ((fixedFlip ? allBits : 0) ^
            negativeWallBits[walls.edgeToWall[edge]] ^
            negativeWallBits[walls.edgeToWall[nextEdge]]) &
          allBits;
        more |= twos & change;
        const nextTwos = (twos & ~change) | (ones & change);
        ones = (ones & ~change) | (~ones & ~twos & ~more & change);
        twos = nextTwos & ~more;
      }
      retention[ordinal] = (twos & ~more & allBits) >>> 0;
    });
  }

  // A higher cell is retained for a candidate exactly when all of its
  // rank-two faces are; its faces are the pair cells through its points.
  const walker = createCellWalker(types, action.degree);
  for (const type of types.filter((candidate) => candidate.dimension >= 3)) {
    const retention = retentionByType[type.typeIndex]!;
    forEachCellRoot(type, (root, ordinal) => {
      const count = walkCellPoints(type, root, action, walker);
      let bits = allBits;
      for (const pairTypeIndex of type.rankTwoFaceTypeIndices) {
        const pairType = types[pairTypeIndex];
        const pairRetention = retentionByType[pairTypeIndex]!;
        for (let index = 0; index < count; index += 1) {
          bits &= pairRetention[ordinalAt(pairType, walker.points[index])];
          if (bits === 0) break;
        }
        if (bits === 0) break;
      }
      retention[ordinal] = bits >>> 0;
    });
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
  // Faces are visited per cell in increasing ordinal order, as before, so
  // counts and the first witnesses are unchanged; cell records are only
  // built for witnesses.
  const faceOrdinals: number[] = [];
  for (const type of types.filter((candidate) => candidate.dimension > 0)) {
    const cofaceRetention = retentionByType[type.typeIndex];
    forEachCellRoot(type, (root, ordinal) => {
      const cellBits = cofaceRetention![ordinal];
      const count = walkCellPoints(type, root, action, walker);
      for (const faceTypeIndex of type.immediateFaceTypeIndices) {
        const faceType = types[faceTypeIndex];
        for (const faceOrdinal of faceOrdinalsOfWalkedCell(
          faceType,
          walker,
          count,
          faceOrdinals,
        )) {
          immediateIncidenceCount += 1;
          const facetBits =
            faceType.dimension === 0
              ? allBits
              : retentionByType[faceTypeIndex]![faceOrdinal];
          const violations = (cellBits & ~facetBits) >>> 0;
          if (violations === 0) continue;
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
              faceCellId: cellStableId(cellFromOrdinal(faceType, faceOrdinal)),
              cofaceCellId: cellStableId(cellFromOrdinal(type, ordinal)),
              candidateIds: candidates
                .filter(
                  (_candidate, candidateIndex) =>
                    (violations & candidateBit(candidateIndex)) !== 0,
                )
                .map((candidate) => candidate.id),
            });
          }
        }
      }
    });
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
    const negative =
      (negativeWallBits[walls.edgeToWall[edgeIndex]] &
        candidateBit(candidateIndex)) !==
      0;
    const storedDirection = (negative ? -1 : 1) * walls.edgeParity[edgeIndex];
    const traversal = edgeTraversal(edges, point, generator);
    return (storedDirection * traversal) as StreamedOrientationSign;
  };

  const metricFlagTypes = types.filter((type) => type.dimension >= 3);
  let metricFlagCountCache:
    | { checkedPointTypePairs: number; violations: Uint32Array }
    | undefined;
  /**
   * Metric-flag violation counts for every candidate in a single pass.
   * Retention is a per-candidate bitmask, so AND-ing the rank-two face bits
   * at a (point, type) pair and clearing the spherical cell's own bits leaves
   * exactly the candidates for which that pair is a violation.
   */
  const metricFlagCounts = () => {
    if (metricFlagCountCache) return metricFlagCountCache;
    const violations = new Uint32Array(candidates.length);
    let checkedPointTypePairs = 0;
    for (const type of metricFlagTypes) {
      const typeRetention = retentionByType[type.typeIndex]!;
      for (let point = 0; point < action.degree; point += 1) {
        checkedPointTypePairs += 1;
        let bits = allBits;
        for (const pairTypeIndex of type.rankTwoFaceTypeIndices) {
          bits &=
            retentionByType[pairTypeIndex]![
              ordinalAt(types[pairTypeIndex], point)
            ];
          if (bits === 0) break;
        }
        if (bits === 0) continue;
        bits = (bits & ~typeRetention[ordinalAt(type, point)]) >>> 0;
        while (bits !== 0) {
          const lowest = (bits & -bits) >>> 0;
          violations[31 - Math.clz32(lowest)] += 1;
          bits = (bits ^ lowest) >>> 0;
        }
      }
    }
    metricFlagCountCache = { checkedPointTypePairs, violations };
    return metricFlagCountCache;
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
    const witnesses: StreamedMetricFlagWitness[] = [];
    // In the native Davis metric, the link edge for {i,j} has length
    // pi-pi/m_ij, hence at least pi/2. Moussong's metric-flag criterion says
    // that such a link is CAT(1) exactly when every metrically spherical
    // clique is filled. The exact spherical plan is the finite clique list.
    // Counts come from one pass over all candidates at once (cached);
    // only witness collection walks again, and stops at witnessLimit.
    const counts = metricFlagCounts();
    const checkedPointTypePairs = counts.checkedPointTypePairs;
    const violationCount = counts.violations[candidateIndex];
    witnessSearch: for (const type of metricFlagTypes) {
      if (witnesses.length >= witnessLimit) break;
      const typeRetention = retentionByType[type.typeIndex]!;
      for (let point = 0; point < action.degree; point += 1) {
        if (witnesses.length >= witnessLimit) break witnessSearch;
        // Only retention bits are needed to decide; cell records are built
        // below for the rare witnesses (millions of pairs per candidate).
        let allPairFacesRetained = true;
        for (const pairTypeIndex of type.rankTwoFaceTypeIndices) {
          const ordinal = ordinalAt(types[pairTypeIndex], point);
          if ((retentionByType[pairTypeIndex]![ordinal] & bit) === 0) {
            allPairFacesRetained = false;
            break;
          }
        }
        if (!allPairFacesRetained) continue;
        const sphericalOrdinal = ordinalAt(type, point);
        if ((typeRetention[sphericalOrdinal] & bit) !== 0) continue;
        {
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
            pairCellIds: type.rankTwoFaceTypeIndices
              .map((pairTypeIndex) => {
                const pairType = types[pairTypeIndex];
                return cellStableId(
                  cellFromOrdinal(pairType, ordinalAt(pairType, point)),
                );
              })
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

/**
 * Allocation-free walk of a cell's points (the W_T-orbit of its root) for hot
 * loops over every cell.  Orbits were checked to be free when the index was
 * built, so no per-image consistency check is repeated here.
 */
interface CellWalker {
  stamp: Uint32Array;
  generation: number;
  points: Uint32Array;
  /** Stamps over face ordinals, to deduplicate faces without sorting. */
  faceStamp: Uint32Array;
  faceGeneration: number;
}

function createCellWalker(
  types: readonly InternalSphericalType[],
  degree: number,
): CellWalker {
  const largest = types.reduce(
    (maximum, type) => Math.max(maximum, type.subgroupOrder),
    1,
  );
  const mostCells = types.reduce(
    (maximum, type) => Math.max(maximum, type.cellCount),
    1,
  );
  return {
    stamp: new Uint32Array(degree),
    generation: 0,
    points: new Uint32Array(largest),
    faceStamp: new Uint32Array(mostCells),
    faceGeneration: 0,
  };
}

/** Fills walker.points with the cell's points; returns how many. */
function walkCellPoints(
  type: InternalSphericalType,
  root: number,
  action: PackedAction,
  walker: CellWalker,
): number {
  walker.generation = (walker.generation + 1) >>> 0;
  if (walker.generation === 0) {
    walker.stamp.fill(0);
    walker.generation = 1;
  }
  const generation = walker.generation;
  const points = walker.points;
  points[0] = root;
  walker.stamp[root] = generation;
  let tail = 1;
  for (let head = 0; head < tail; head += 1) {
    const point = points[head];
    for (const generator of type.generators) {
      const image = action.rows[generator][point];
      if (walker.stamp[image] === generation) continue;
      walker.stamp[image] = generation;
      points[tail++] = image;
    }
  }
  return tail;
}

/** Sorted distinct ordinals of `faceType` cells through the walked points. */
function faceOrdinalsOfWalkedCell(
  faceType: InternalSphericalType,
  walker: CellWalker,
  count: number,
  out: number[],
): number[] {
  walker.faceGeneration = (walker.faceGeneration + 1) >>> 0;
  if (walker.faceGeneration === 0) {
    walker.faceStamp.fill(0);
    walker.faceGeneration = 1;
  }
  const generation = walker.faceGeneration;
  out.length = 0;
  for (let index = 0; index < count; index += 1) {
    const ordinal = ordinalAt(faceType, walker.points[index]);
    if (walker.faceStamp[ordinal] === generation) continue;
    walker.faceStamp[ordinal] = generation;
    out.push(ordinal);
  }
  // A cell has |W_T| / |W_F| faces of type F: few entries to sort.
  return out.sort(compareNumbers);
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
/**
 * Content-addressed reuse of oracles.  Construction is a deterministic
 * function of (system, action rows, ordinal index mode) and the result is
 * immutable, so an oracle for the same bytes is exactly what a rebuild would
 * produce.  Certification pipelines rebuild the oracle at every replay
 * boundary (26 times in one full-H1 + Track B run); each call still
 * presents its own bytes, which are re-hashed here, so replay semantics are
 * unchanged.  Entries are weak: a finished pipeline releases its oracle.
 */
const ORACLE_CACHE = new Map<string, WeakRef<StreamedLawfulDavisOracle>>();
const ORACLE_CACHE_CLEANUP =
  typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry<string>((key) => {
        const entry = ORACLE_CACHE.get(key);
        if (entry && entry.deref() === undefined) ORACLE_CACHE.delete(key);
      });

export function buildStreamedLawfulDavisOracle(
  input: StreamedLawfulDavisInput,
): StreamedLawfulDavisOracle {
  if (typeof WeakRef === "undefined" || input.cache === false)
    return constructStreamedLawfulDavisOracle(input);
  const rows = input.generatorImages as readonly ArrayLike<number>[];
  let key: string;
  let rowsDigest: string;
  try {
    rowsDigest = computeStreamedActionRowsCanonicalSha256(rows);
    key = [
      canonicalJsonSha256(input.system),
      rowsDigest,
      input.ordinalIndex ?? "auto",
    ].join(":");
  } catch {
    // Malformed input: let construction report the precise validation error.
    return constructStreamedLawfulDavisOracle(input);
  }
  const cached = ORACLE_CACHE.get(key)?.deref();
  if (cached) return cached;
  const oracle = constructStreamedLawfulDavisOracle(input, rowsDigest);
  ORACLE_CACHE.set(key, new WeakRef(oracle));
  ORACLE_CACHE_CLEANUP?.register(oracle, key);
  return oracle;
}

/**
 * Kernel results computed on worker threads for exactly the rows handed to
 * construction.  Module-private: only the parallel builder creates them, from
 * a row copy no caller can reach.
 */
interface PrecomputedOracleKernels {
  relationFailures: ReadonlyMap<
    string,
    { point: number; image: number } | null
  >;

  cellIndexByHostType: ReadonlyMap<number, MaximalCellIndexResult>;
  edges: PackedEdges;
  walls: InternalWalls;
}

/**
 * buildStreamedLawfulDavisOracle with its two linear-time scans, the Coxeter
 * relation checks and the per-maximal-type cell index, spread over a kernel
 * pool.  The oracle is identical to the sequential one (same structure hash);
 * only wall-clock time changes.
 */
export async function buildStreamedLawfulDavisOracleParallel(
  input: StreamedLawfulDavisInput,
  pool: KernelPool,
): Promise<StreamedLawfulDavisOracle> {
  const rows = input.generatorImages as readonly ArrayLike<number>[];
  if (
    pool.kind === "inline" ||
    typeof WeakRef === "undefined" ||
    input.ordinalIndex === "eager" ||
    rows.length === 0 ||
    rows.some(
      (row) => !(row instanceof Uint32Array) || row.length !== rows[0].length,
    )
  ) {
    return buildStreamedLawfulDavisOracle(input);
  }
  const system = cloneJsonData(parseCoxeterSystemInput(input.system));
  const degree = rows[0].length;
  const types = buildSphericalTypes(system, degree);
  if (
    input.ordinalIndex !== "lazy" &&
    eagerOrdinalBytes(types, degree) <= EAGER_ORDINAL_BUDGET_BYTES
  ) {
    // Small actions: the eager index has no per-type kernels to share out.
    return buildStreamedLawfulDavisOracle(input);
  }
  const rowsDigest = computeStreamedActionRowsCanonicalSha256(rows);
  const key = [
    canonicalJsonSha256(input.system),
    rowsDigest,
    input.ordinalIndex ?? "auto",
  ].join(":");
  const useCache = input.cache !== false;
  const cached = useCache ? ORACLE_CACHE.get(key)?.deref() : undefined;
  if (cached) return cached;

  // A private shared copy: workers read it in place, and the caller cannot
  // change it between the kernels and construction.
  const shared = rows.map((row) => {
    const copy = new Uint32Array(new SharedArrayBuffer(row.length * 4));
    copy.set(row);
    return copy;
  });
  const involutive = shared.map(isInvolutionRow);
  const relationJobs: Array<
    Promise<[string, { point: number; image: number } | null]>
  > = [];
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const m = system.coxeterMatrix[left][right];
      if (m === "inf") continue;
      relationJobs.push(
        pool
          .run("alternatingRelation", {
            left: shared[left],
            right: shared[right],
            m,
            degree,
            involutions: involutive[left] && involutive[right],
          })
          .then((failure) => [`${left},${right}`, failure]),
      );
    }
  }
  const { maximal, assigned } = maximalCellAssignment(types);
  const action: PackedAction = { degree, rows: shared };
  const cellJobs = maximal.map((host) =>
    pool
      .run(
        "maximalCellIndex",
        maximalCellIndexInput(host, assigned.get(host)!, action),
      )
      .then((result): [number, MaximalCellIndexResult] => [
        host.typeIndex,
        result,
      ]),
  );
  let phaseStart = performance.now();
  const report = (phase: StreamedOracleBuildProgress["phase"]) => {
    const now = performance.now();
    input.onProgress?.({ phase, elapsedMs: now - phaseStart });
    phaseStart = now;
  };
  const [relations, cells] = await Promise.all([
    Promise.all(relationJobs),
    Promise.all(cellJobs),
  ]);
  report("parallel-kernels");
  // Root bitsets of every hosted type, from the kernel results.  Failures
  // are reported by construction below, in the sequential order.
  const rootBits = new Map<number, Uint32Array>();
  for (const [hostIndex, result] of cells) {
    if (!result.ok) continue;
    rootBits.set(hostIndex, result.hostBits);
    const host = types[hostIndex];
    assigned.get(host)!.forEach((subtype, t) => {
      rootBits.set(subtype.typeIndex, result.subtypeBits[t]);
    });
  }
  const rankTwo = types.filter((type) => type.dimension === 2);
  let edges: PackedEdges | undefined;
  let walls: InternalWalls | undefined;
  const relationsHold = relations.every(([, failure]) => failure === null);
  if (relationsHold && rankTwo.every((type) => rootBits.has(type.typeIndex))) {
    try {
      edges = buildEdges(action, system.rank);
      walls = await buildWallsParallel(
        system,
        action,
        edges,
        types,
        (type) => rootBits.get(type.typeIndex)!,
        pool,
      );
    } catch {
      // Construction repeats the sequential checks and reports the error.
      edges = undefined;
      walls = undefined;
    }
  }
  report("parallel-walls");
  const again = useCache ? ORACLE_CACHE.get(key)?.deref() : undefined;
  if (again) return again;
  const oracle = constructStreamedLawfulDavisOracle(
    { ...input, generatorImages: shared },
    rowsDigest,
    edges && walls
      ? {
          relationFailures: new Map(relations),
          cellIndexByHostType: new Map(cells),
          edges,
          walls,
        }
      : undefined,
  );
  if (useCache) {
    ORACLE_CACHE.set(key, new WeakRef(oracle));
    ORACLE_CACHE_CLEANUP?.register(oracle, key);
  }
  return oracle;
}

function constructStreamedLawfulDavisOracle(
  input: StreamedLawfulDavisInput,
  /** Digest of exactly these rows, when the caller already computed it. */
  precomputedRowsDigest?: string,
  precomputed?: PrecomputedOracleKernels,
): StreamedLawfulDavisOracle {
  // Validation returns the caller's object. Clone it before constructing any
  // packed tables so later mutations of an imported JSON object cannot change
  // the meaning of an already-hashed oracle.
  let phaseStart = performance.now();
  const report = (phase: StreamedOracleBuildProgress["phase"], extra = {}) => {
    const now = performance.now();
    input.onProgress?.({ phase, elapsedMs: now - phaseStart, ...extra });
    phaseStart = now;
  };
  const system = cloneJsonData(parseCoxeterSystemInput(input.system));
  const action = packAction(system, input.generatorImages, precomputed);
  report("validate-action");
  const actionRowsCanonicalSha256 =
    precomputedRowsDigest ?? hashPackedActionRows(action);
  report("hash-action-rows");
  const types = buildSphericalTypes(system, action.degree);
  report("spherical-types");
  const ordinalMode =
    input.ordinalIndex === "eager" || input.ordinalIndex === "lazy"
      ? input.ordinalIndex
      : eagerOrdinalBytes(types, action.degree) <= EAGER_ORDINAL_BUDGET_BYTES
        ? "eager"
        : "lazy";
  if (ordinalMode === "eager") {
    for (const type of types) buildOrbitIndex(type, action);
  } else {
    const scratch: OrbitScratch = { generation: 0, queue: new Uint32Array(1) };
    buildLazyOrbitIndexesByMaximalCells(
      types,
      action,
      scratch,
      precomputed?.cellIndexByHostType,
    );
  }
  report("orbit-index", { ordinalIndex: ordinalMode });
  const edges = precomputed?.edges ?? buildEdges(action, system.rank);
  report("edges");
  const walls = precomputed?.walls ?? buildWalls(system, action, edges, types);
  report("walls");
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
    geometricEdgeCount: edges.count,
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
    geometricEdgeCount: edges.count,
    rankTwoCellCount,
    cellCount,
    cellCountByDimension: publicCellCountByDimension,
    sphericalTypes: publicTypes,
    walls: publicWalls,
    actionRowsCanonicalSha256,
    structureHash,
    copyActionRows: () => action.rows.map((row) => row.slice()),
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
    forEachRankTwoCellPacked: (visitor) => {
      const scratch = createPairBoundaryScratch(system);
      const record: PackedRankTwoCell = {
        typeIndex: 0,
        representativePoint: 0,
        cellId: "",
        length: 0,
        edgeIndex: scratch.edgeIndex,
        traversal: scratch.traversal,
        point: scratch.point,
        generator: new Uint8Array(scratch.edgeIndex.length),
      };
      for (const type of types.filter(
        (candidate) => candidate.dimension === 2,
      )) {
        const relation = pairRelation(system, type);
        const idPrefix = rankTwoCellIdPrefix(type);
        const [left, right] = type.generators;
        for (let step = 0; step < 2 * relation; step += 1) {
          record.generator[step] = step % 2 === 0 ? left : right;
        }
        record.typeIndex = type.typeIndex;
        forEachCellRoot(type, (root) => {
          record.length = walkPairBoundary(
            root,
            type,
            relation,
            action,
            edges,
            scratch,
          );
          record.representativePoint = root;
          record.cellId = `${idPrefix}${root}`;
          visitor(record);
        });
      }
    },
    packedEdgeTables: () => {
      const generator = new Uint32Array(edges.count);
      const source = new Uint32Array(edges.count);
      const target = new Uint32Array(edges.count);
      let edgeIndex = 0;
      for (let g = 0; g < action.rows.length; g += 1) {
        const row = action.rows[g];
        for (let point = 0; point < action.degree; point += 1) {
          const image = row[point];
          if (point > image) continue;
          const [stored, other] = storedEdgeEndpoints(point, image);
          generator[edgeIndex] = g;
          source[edgeIndex] = stored;
          target[edgeIndex] = other;
          edgeIndex += 1;
        }
      }
      return { generator, source, target };
    },
    rankTwoWalkTables: () => ({
      tables: {
        rows: action.rows,
        degree: action.degree,
        offsets: edges.offsets,
        minimumBits: edges.minimumBits,
        wordRank: edges.wordRank,
        sourceBits: edges.sourceBits,
      },
      types: types
        .filter((type) => type.dimension === 2)
        .map((type) => ({
          typeIndex: type.typeIndex,
          typeId: type.id,
          idPrefix: rankTwoCellIdPrefix(type),
          left: type.generators[0],
          right: type.generators[1],
          relation: pairRelation(system, type),
          rootBits: cellRootBits(type, action.degree),
          cellCount: type.cellCount,
        })),
    }),
    // Copies in shared memory, so worker kernels can read them in place.
    packedWallTables: () => ({
      edgeToWall: sharedCopy(walls.edgeToWall),
      edgeParity: sharedCopy(walls.edgeParity),
    }),
    edgeIndexAt: (point, generator) => {
      assertPoint(point, action.degree);
      assertGenerator(generator, system.rank);
      return edgeIndexAt(edges, action.degree, point, generator);
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
