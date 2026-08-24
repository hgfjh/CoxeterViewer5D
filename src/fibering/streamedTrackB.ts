import type {
  GeneralizedCompressionBuildOptions,
  GeneralizedCompressionCertificate,
} from "../davis/generalizedCompression";
import {
  computeGeneralizedCompressionArchiveHash,
  verifyGeneralizedCompressionCertificate,
} from "../davis/generalizedCompression";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedDavisCell,
  StreamedLawfulDavisOracle,
  type StreamedOrientationSign,
  StreamedWallSignCandidate,
} from "./streamedLawfulDavis";

export interface StreamedTrackBOptions {
  oracle: StreamedLawfulDavisOracle;
  candidate: StreamedWallSignCandidate;
  generalizedCompression: GeneralizedCompressionCertificate;
  generalizedCompressionReplayOptions?: Pick<
    GeneralizedCompressionBuildOptions,
    "sourceQuotientVertexIds" | "coverCompression"
  >;
  /** The two canonical generic perturbations relative to the anchor wall. */
  offsetPolarity?: 1 | -1;
  linkScan?: "exhaustive" | "stop-on-first-failure";
  maxLinkWitnesses?: number;
}

export interface StreamedTrackBSource {
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  wallStructureHash: string;
  generalizedCompressionArchiveHash: string;
  systemCanonicalSha256: string;
  coorientationHash: string;
  wallSignVectorHash: string;
  offsetPolarity: 1 | -1;
}

export interface StreamedTrackBCharacterCertificate {
  status: "passed" | "failed";
  method: "spanning-tree-period-gcd-and-bezout";
  anchorWallId: string;
  anchorSign: 1 | -1;
  normalizationDivisor: number;
  quotientTreeEdgeCount: number;
  nonTreePeriodCount: number;
  nonzeroPeriodCount: number;
  treePotentialDigest: string;
  periodDigest: string;
  bezoutTrace: Array<{
    edgeId: string;
    period: number;
    previousGcd: number;
    nextGcd: number;
    previousCoefficient: number;
    periodCoefficient: number;
  }>;
  checks: {
    wallBasisClosedOnEveryRankTwoCell: boolean;
    everyGeneratorEdgeNonzero: boolean;
    quotientGraphConnected: boolean;
    characterNontrivial: boolean;
    primitiveAfterNormalization: boolean;
    bezoutTraceValid: boolean;
  };
  characterDigest: string;
  errors: string[];
}

export interface StreamedTrackBPullingCertificate {
  method: "global-action-point-order-recursive-pulling";
  vertexOrder: "q0<q1<...<q(degree-1)";
  introducedVertexIds: [];
  fullCellCount: number;
  fullCellCountByDimension: Record<string, number>;
  maximalCellCount: number;
  immediateFaceIncidenceCount: number;
  fullCellSetDigest: string;
  compatibilityDigest: string;
  checks: {
    everyGeneralizedCompressionCellRetained: boolean;
    globalVertexOrderStrict: boolean;
    allFaceMapsReplayed: boolean;
    restrictionsAgreeOnSharedFaces: boolean;
    noSubdivisionVerticesIntroduced: true;
  };
  pullingDigest: string;
}

export interface StreamedTrackBHeightCertificate {
  status: "passed" | "failed";
  method: "cell-local-integral-height-with-candidate-odd-periodic-offset";
  normalizationDivisor: number;
  offsetDenominator: number;
  anchorWallId: string;
  anchorSign: 1 | -1;
  offsetPolarity: 1 | -1;
  formula: "F_c(q)=raw_c(q)+polarity*sign_c(anchor)*q/(4*degree)";
  checks: {
    everyCellHasPathIndependentIntegralHeight: boolean;
    overlapDifferencesConstant: boolean;
    everyOriginalEdgeSignPreserved: boolean;
    everyPullingSimplexHasDistinctVertexHeights: boolean;
    quotientOffsetsPeriodic: boolean;
    globalReversalNegatesHeight: boolean;
  };
  heightDigest: string;
  errors: string[];
}

export type StreamedTrackBLinkFailureKind =
  | "ascending-empty"
  | "descending-empty"
  | "ascending-disconnected"
  | "descending-disconnected";

export interface StreamedTrackBLinkSummary {
  point: number;
  maximalCellCount: number;
  germCount: number;
  linkEdgeCount: number;
  ascendingVertexCount: number;
  ascendingComponentCount: number;
  descendingVertexCount: number;
  descendingComponentCount: number;
  ascendingNonempty: boolean;
  ascendingConnected: boolean;
  descendingNonempty: boolean;
  descendingConnected: boolean;
  topologyDigest: string;
  linkDigest: string;
}

export interface StreamedTrackBLinkWitness {
  point: number;
  kind: StreamedTrackBLinkFailureKind;
  components: string[][];
}

export interface StreamedTrackBLinksCertificate {
  status: "passed" | "failed";
  method: "full-k-pulling-link-one-skeleton";
  scanMode: "exhaustive" | "stop-on-first-failure";
  scanOutcome: "exhaustive" | "counterexample-found" | "incomplete";
  checkedVertexCount: number;
  vertexSummaries: StreamedTrackBLinkSummary[];
  witnesses: StreamedTrackBLinkWitness[];
  failureCounts: Record<StreamedTrackBLinkFailureKind, number>;
  checks: {
    sourcePullingAndHeightPassed: boolean;
    everyQuotientVertexChecked: boolean;
    allAscendingNonempty: boolean;
    allDescendingNonempty: boolean;
    allAscendingConnected: boolean;
    allDescendingConnected: boolean;
  };
  linksDigest: string;
  errors: string[];
}

export interface StreamedTrackBCertificate {
  schemaVersion: 1;
  kind: "streamed-full-k-track-b-certificate";
  method: "action-rooted-global-pulling-and-exact-directed-links";
  status: "passed" | "failed";
  candidateId: string;
  sourceHash: string;
  source: StreamedTrackBSource;
  fullK: {
    quotient: "H\\Sigma";
    allCellsRetained: true;
    universalCover: "Davis complex Sigma";
    universalCoverContractible: boolean;
    quotientAspherical: boolean;
    checks: {
      torsionFreeActionReplayed: boolean;
      generalizedCompressionReplayed: boolean;
      completeSphericalCellSet: boolean;
    };
  };
  character: StreamedTrackBCharacterCertificate;
  pulling: StreamedTrackBPullingCertificate;
  height: StreamedTrackBHeightCertificate;
  globalSignReversal: {
    anchorWallId: string;
    canonicalRepresentativeSign: 1;
    identity: "F_{-c}=-F_c";
    ascendingDescendingLinksSwap: true;
    exhaustiveSearchMayFixAnchorPositive: boolean;
    symmetryDigest: string;
  };
  directedLinks: StreamedTrackBLinksCertificate;
  conclusion:
    | "finite-generation-certified"
    | "morse-link-condition-failed"
    | "not-established";
  artifactHashAlgorithm: "sha256";
  artifactHash: string;
  errors: string[];
  nonClaims: string[];
}

export interface StreamedTrackBReplay {
  schemaVersion: 1;
  kind: "streamed-full-k-track-b-replay";
  status: "passed" | "failed";
  checks: {
    storedArtifactHashValid: boolean;
    sourceHashesMatch: boolean;
    actionRootedReconstructionMatches: boolean;
  };
  rebuiltArtifactHash: string;
  errors: string[];
}

export interface StreamedTrackBPointResult {
  schemaVersion: 1;
  kind: "streamed-full-k-track-b-point-link";
  candidateId: string;
  sourceHash: string;
  point: number;
  summary: StreamedTrackBLinkSummary;
  ascendingComponents: string[][];
  descendingComponents: string[][];
  resultHash: string;
}

export type StreamedTrackBIntegralCoordinate = number | string | bigint;

/**
 * A concrete integral cocycle section for an ordered basis of H^1.
 *
 * The provider returns the nonzero coordinates of the increment on the
 * directed edge q --generator--> q.generator. Coordinate indices must be
 * strictly increasing. The bridge independently checks edge reversal and all
 * rank-two boundary sums before exposing any pulling-link forms.
 */
export interface StreamedTrackBIntegralCocycleBasis {
  coordinateIds: readonly string[];
  /** Hash of the theorem-facing lattice-basis certificate. */
  latticeBasisDigest: string;
  /** Independently stored digest of the concrete cocycle section. */
  expectedCocycleSectionDigest: string;
  edgeCoordinatePairs(
    point: number,
    generator: number,
  ): readonly (readonly [number, StreamedTrackBIntegralCoordinate])[];
}

export interface StreamedTrackBLinearLinkGerm {
  id: string;
  otherPoint: number;
  pointDifference: number;
  supportCellId: string;
  /** Sparse coefficients in the declared integral H^1 basis. */
  coefficientPairs: Array<[number, string]>;
}

/**
 * One ephemeral point template. Consumers should process it in the visitor
 * rather than retaining every quotient link in memory.
 */
export interface StreamedTrackBLinearLinkTemplate {
  point: number;
  maximalCellCount: number;
  germs: StreamedTrackBLinearLinkGerm[];
  adjacencyIncluded: boolean;
  edges: Array<[string, string]>;
  /** Empty when adjacencyIncluded is false. */
  adjacency: readonly Uint32Array[];
  topologyDigest: string;
  templateDigest: string;
}

export interface StreamedTrackBLinearTemplateStreamOptions {
  oracle: StreamedLawfulDavisOracle;
  generalizedCompression: GeneralizedCompressionCertificate;
  generalizedCompressionReplayOptions?: StreamedTrackBOptions["generalizedCompressionReplayOptions"];
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
  /** Omit for the exhaustive canonical order q0,...,q(degree-1). */
  points?: readonly number[];
  /** False is the fast first pass for collecting only arrangement normals. */
  includeAdjacency?: boolean;
}

export type StreamedTrackBLinearTemplatePreparationOptions = Omit<
  StreamedTrackBLinearTemplateStreamOptions,
  "points" | "includeAdjacency"
>;

export interface StreamedTrackBLinearTemplateStreamRequest {
  /** Omit for the exhaustive canonical order q0,...,q(degree-1). */
  points?: readonly number[];
  includeAdjacency?: boolean;
}

/**
 * Reusable exact source/cocycle preparation. Each call streams ephemeral
 * point templates without rebuilding the full directed-edge H^1 section.
 */
export interface StreamedTrackBPreparedLinearTemplateStreamer {
  stream(
    request: StreamedTrackBLinearTemplateStreamRequest,
    visitor: StreamedTrackBLinearLinkTemplateVisitor,
  ): StreamedTrackBLinearTemplateStreamResult;
  statistics(): {
    preparationCount: 1;
    streamInvocationCount: number;
    streamedPointCount: number;
  };
}

export interface StreamedTrackBLinearTemplateStreamResult {
  schemaVersion: 1;
  kind: "streamed-full-k-track-b-linear-link-template-stream";
  status: "completed" | "failed";
  scanOutcome: "exhaustive-request" | "visitor-stopped" | "failed";
  sourceHash: string;
  oracleStructureHash: string;
  generalizedCompressionArchiveHash: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  cocycleClosureDigest: string;
  coordinateIds: string[];
  coordinateCount: number;
  requestedPointCount: number;
  checkedPointCount: number;
  exhaustiveAllPoints: boolean;
  adjacencyIncluded: boolean;
  maximumAbsoluteEdgeCoordinate: string;
  maximumAbsoluteIntegratedCoordinateBound: string;
  heightRule: {
    method: "integral-character-plus-fixed-global-point-order-offset";
    offsetDenominator: number;
    offsetPolarities: [-1, 1];
    clearedDifferenceFormula: "4*degree*dot(coefficientForm,weight)+sigma*pointDifference";
    antipodalEquivalence: "(weight,sigma)~(-weight,-sigma)";
    heightRuleDigest: string;
  };
  templateSetDigest: string;
  checks: {
    sourceReplayed: boolean;
    coordinateIdsValid: boolean;
    expectedCocycleSectionDigestMatches: boolean;
    directedEdgesAntisymmetric: boolean;
    rankTwoBoundariesClosed: boolean;
    exactNumberPackingBoundProved: boolean;
    everyRequestedPointStreamed: boolean;
    everyQuotientPointStreamed: boolean;
  };
  errors: string[];
  reportHashAlgorithm: "sha256";
  reportHash: string;
}

export type StreamedTrackBLinearLinkTemplateVisitor = (
  template: StreamedTrackBLinearLinkTemplate,
) => void | "stop";

export interface StreamedTrackBBatchScanOptions {
  oracle: StreamedLawfulDavisOracle;
  candidates: readonly StreamedWallSignCandidate[];
  generalizedCompression: GeneralizedCompressionCertificate;
  generalizedCompressionReplayOptions?: StreamedTrackBOptions["generalizedCompressionReplayOptions"];
  offsetPolarities?: readonly (1 | -1)[];
  maxWitnesses?: number;
  /** Operational progress only; it is deliberately absent from all hashes. */
  onProgress?: (event: StreamedTrackBProgressEvent) => void;
}

export type StreamedTrackBProgressEvent =
  | { stage: "source-replay-complete" }
  | { stage: "candidate-binding-complete"; classCount: number }
  | {
      stage: "point-template-complete";
      point: number;
      activeClassCount: number;
    };

export interface StreamedTrackBBatchCandidateSummary {
  candidateId: string;
  wallSignVectorHash: string;
  offsetPolarity: 1 | -1;
  passed: boolean;
  checkedVertexCount: number;
  firstFailure?: {
    point: number;
    kind: StreamedTrackBLinkFailureKind;
    componentCount: number;
    componentSizes: number[];
    sampledComponents: string[][];
    linkDigest: string;
    failureDigest: string;
  };
  resultDigest: string;
}

export interface StreamedTrackBBatchScanResult {
  schemaVersion: 1;
  kind: "streamed-full-k-track-b-batch-link-scan";
  status: "completed" | "failed";
  method: "point-major-symbolic-pulling-link-evaluation";
  oracleStructureHash: string;
  generalizedCompressionArchiveHash: string;
  anchorWallId: string;
  candidateCount: number;
  polarityCount: number;
  classCount: number;
  checkedPointTemplateCount: number;
  firstFailureCountByPoint: number[];
  failureCensusDigest: string;
  summaries: StreamedTrackBBatchCandidateSummary[];
  survivorIndices: Array<{ candidateIndex: number; offsetPolarity: 1 | -1 }>;
  checks: {
    candidatesCompleteAndCanonical: boolean;
    exhaustiveAnchorPositiveSignVectors: boolean;
    pointMajorTemplatesReused: boolean;
    everyClassResolved: boolean;
    globalReversalQuotientSound: boolean;
  };
  reportHash: string;
  errors: string[];
}

export interface StreamedTrackBBatchReplay {
  schemaVersion: 1;
  kind: "streamed-full-k-track-b-batch-replay";
  status: "passed" | "failed";
  checks: {
    storedReportHashValid: boolean;
    sourceHashesMatch: boolean;
    actionRootedReconstructionMatches: boolean;
  };
  rebuiltReportHash: string;
  errors: string[];
}

/** Recompute the content hash without trusting the stored digest. */
export function computeStreamedTrackBArtifactHash(
  certificate: StreamedTrackBCertificate,
): string {
  return canonicalSha256({ ...certificate, artifactHash: "" });
}

/** Recompute the streamed linear-template manifest hash. */
export function computeStreamedTrackBLinearTemplateStreamHash(
  result: StreamedTrackBLinearTemplateStreamResult,
): string {
  return canonicalSha256({ ...result, reportHash: "" });
}

/** Recompute the ordered template-set Merkle digest used by a stream result. */
export function computeStreamedTrackBLinearTemplateSetDigest(options: {
  sourceHash: string;
  requestedPoints: readonly number[];
  checkedRecords: readonly (readonly [number, string])[];
}): string {
  const chunkHashes: string[] = [];
  for (
    let start = 0;
    start < options.checkedRecords.length;
    start += HASH_CHUNK_SIZE
  ) {
    chunkHashes.push(
      canonicalSha256({
        chunkIndex: chunkHashes.length,
        records: options.checkedRecords.slice(start, start + HASH_CHUNK_SIZE),
      }),
    );
  }
  return canonicalSha256({
    schemaVersion: 1,
    method: "streamed-integral-pulling-link-template-chunk-tree",
    sourceHash: options.sourceHash,
    requestedPoints: options.requestedPoints,
    checkedPointCount: options.checkedRecords.length,
    chunkSize: HASH_CHUNK_SIZE,
    chunkHashes,
  });
}

// Implementations are below the public schema so the runner can depend on a
// stable API while the streamed combinatorics remain private to this module.

interface StaticEdgeData {
  neighbor: Uint32Array;
  wallIndex: Uint16Array;
  coefficient: Int8Array;
}

interface StaticTrackBData {
  wallIds: string[];
  edgeData: StaticEdgeData;
  fullCellSetDigest: string;
  fullCellCount: number;
  maximalTypeIndices: number[];
  maximalCellCount: number;
  rankTwoCellCount: number;
  rankTwoBoundaryOccurrenceCount: number;
  wallBasisClosureDigest: string;
  wallBasisClosed: boolean;
  topologyCache: Map<number, PullingLinkTopology>;
}

interface PreparedTrackBSource {
  oracle: StreamedLawfulDavisOracle;
  candidate: StreamedWallSignCandidate;
  wallSigns: Int8Array;
  generalizedCompression: GeneralizedCompressionCertificate;
  generatorImages: number[][];
  staticData: StaticTrackBData;
  source: StreamedTrackBSource;
  sourceHash: string;
  compressionReplayPassed: boolean;
  offsetPolarity: 1 | -1;
  errors: string[];
}

interface PullingStar {
  neighbors: Set<number>;
  edges: Set<string>;
}

interface PullingLinkGerm {
  id: string;
  otherPoint: number;
  supportCellId: string;
  coefficientPairs: Array<[number, number]>;
}

interface PullingLinkTopology {
  point: number;
  maximalCellCount: number;
  germs: PullingLinkGerm[];
  edges: Array<[string, string]>;
  /** Derived numeric adjacency. It is excluded from the certificate digest. */
  adjacency: Uint32Array[];
  topologyDigest: string;
}

interface PackedIntegralCocycleBasis {
  coordinateIds: string[];
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  cocycleClosureDigest: string;
  /** Edge-major dense coordinates, used only after the exact packing bound. */
  values: Float64Array;
  maximumAbsoluteEdgeCoordinate: bigint;
  maximumAbsoluteIntegratedCoordinateBound: bigint;
  checks: {
    coordinateIdsValid: boolean;
    expectedCocycleSectionDigestMatches: boolean;
    directedEdgesAntisymmetric: boolean;
    rankTwoBoundariesClosed: boolean;
    exactNumberPackingBoundProved: boolean;
  };
  errors: string[];
}

interface EvaluatedPointLink {
  summary: StreamedTrackBLinkSummary;
  ascendingComponents: string[][];
  descendingComponents: string[][];
  failures: StreamedTrackBLinkFailureKind[];
}

const STATIC_CACHE = new WeakMap<StreamedLawfulDavisOracle, StaticTrackBData>();
const CANONICAL_ORACLE_CACHE = new WeakMap<
  StreamedLawfulDavisOracle,
  Map<string, StreamedLawfulDavisOracle>
>();
const GENERATOR_IMAGES_CACHE = new WeakMap<
  StreamedLawfulDavisOracle,
  number[][]
>();
const COMPRESSION_REPLAY_CACHE = new WeakMap<
  GeneralizedCompressionCertificate,
  Map<string, string[]>
>();
const COMPRESSION_HASH_CACHE = new WeakMap<
  GeneralizedCompressionCertificate,
  boolean
>();
const HASH_CHUNK_SIZE = 4_096;
const MAX_TOPOLOGY_CACHE_ENTRIES = 64;
const MAX_EXACT_NUMBER_DEGREE = 10_000_000;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareIds);
}

function edgePairKey(left: number, right: number): string {
  return left < right ? `${left},${right}` : `${right},${left}`;
}

function germEdgeKey(left: string, right: string): string {
  return compareIds(left, right) < 0
    ? `${left}\u0000${right}`
    : `${right}\u0000${left}`;
}

function generatorsSubset(
  subset: readonly number[],
  superset: ReadonlySet<number>,
): boolean {
  return subset.every((generator) => superset.has(generator));
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function extendedGcd(
  left: number,
  right: number,
): { gcd: number; leftCoefficient: number; rightCoefficient: number } {
  let oldR = Math.abs(left);
  let r = Math.abs(right);
  let oldS = 1;
  let s = 0;
  let oldT = 0;
  let t = 1;
  while (r !== 0) {
    const quotient = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
    [oldT, t] = [t, oldT - quotient * t];
  }
  return {
    gcd: oldR,
    leftCoefficient: oldS * (left < 0 ? -1 : 1),
    rightCoefficient: oldT * (right < 0 ? -1 : 1),
  };
}

function hashCanonicalActionRows(generatorImages: readonly number[][]): string {
  return canonicalSha256({
    schemaVersion: 1,
    index: generatorImages[0]?.length ?? 0,
    generatorImages,
  });
}

function normalizeCandidate(
  candidate: StreamedWallSignCandidate,
  wallIds: readonly string[],
): StreamedWallSignCandidate {
  const suppliedIds = Object.keys(candidate.wallSigns).sort(compareIds);
  const expectedIds = [...wallIds].sort(compareIds);
  if (
    suppliedIds.length !== expectedIds.length ||
    suppliedIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new Error(
      "A Track B coorientation must assign every canonical wall exactly once.",
    );
  }
  const wallSigns: Record<string, StreamedOrientationSign> = {};
  for (const wallId of wallIds) {
    const sign = candidate.wallSigns[wallId];
    if (sign !== 1 && sign !== -1) {
      throw new Error(`Wall ${wallId} has invalid sign ${String(sign)}.`);
    }
    wallSigns[wallId] = sign;
  }
  return Object.freeze({
    id: candidate.id,
    wallSigns: Object.freeze(wallSigns),
  });
}

function candidateCoorientationHash(
  oracleStructureHash: string,
  candidate: StreamedWallSignCandidate,
  wallIds: readonly string[],
): string {
  return canonicalSha256({
    oracleStructureHash,
    candidateId: candidate.id,
    wallSigns: wallIds.map((wallId) => [wallId, candidate.wallSigns[wallId]]),
  });
}

function candidateSignVectorHash(
  candidate: StreamedWallSignCandidate,
  wallIds: readonly string[],
): string {
  return canonicalSha256(
    wallIds.map((wallId) => [wallId, candidate.wallSigns[wallId]]),
  );
}

function canonicalIntegralCoordinate(
  value: StreamedTrackBIntegralCoordinate,
  context: string,
): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${context} must be a safe integer or decimal string.`);
    }
    return BigInt(value);
  }
  if (!/^-?(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${context} is not a canonical decimal integer.`);
  }
  return BigInt(value);
}

function absoluteBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * Compute the canonical directed-edge section digest before constructing a
 * lattice certificate. Closure and lattice-basis claims are checked later by
 * the streamed bridge; this helper only binds the concrete sparse edge data.
 */
export function computeStreamedTrackBIntegralCocycleSectionDigest(
  oracle: StreamedLawfulDavisOracle,
  basis: Pick<
    StreamedTrackBIntegralCocycleBasis,
    "coordinateIds" | "edgeCoordinatePairs"
  >,
): string {
  const coordinateIds = [...basis.coordinateIds];
  if (
    coordinateIds.length === 0 ||
    coordinateIds.some((id) => id.length === 0) ||
    new Set(coordinateIds).size !== coordinateIds.length
  ) {
    throw new Error(
      "Integral cocycle coordinate ids must be nonempty and pairwise distinct.",
    );
  }
  const sectionChunkHashes: string[] = [];
  let sectionRecords: Array<{
    point: number;
    generator: number;
    pairs: Array<[number, string]>;
  }> = [];
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const pairs: Array<[number, string]> = [];
      let previousIndex = -1;
      for (const [coordinateIndex, suppliedValue] of basis.edgeCoordinatePairs(
        point,
        generator,
      )) {
        if (
          !Number.isInteger(coordinateIndex) ||
          coordinateIndex <= previousIndex ||
          coordinateIndex < 0 ||
          coordinateIndex >= coordinateIds.length
        ) {
          throw new Error(
            `Cocycle coordinates on q${point}s${generator} must have strictly increasing in-range indices.`,
          );
        }
        previousIndex = coordinateIndex;
        const exact = canonicalIntegralCoordinate(
          suppliedValue,
          `Cocycle coordinate ${coordinateIndex} on q${point}s${generator}`,
        );
        if (exact === 0n) {
          throw new Error(
            `Sparse cocycle coordinate ${coordinateIndex} on q${point}s${generator} is zero.`,
          );
        }
        pairs.push([coordinateIndex, exact.toString()]);
      }
      sectionRecords.push({ point, generator, pairs });
      if (sectionRecords.length === HASH_CHUNK_SIZE) {
        sectionChunkHashes.push(
          canonicalSha256({
            chunkIndex: sectionChunkHashes.length,
            records: sectionRecords,
          }),
        );
        sectionRecords = [];
      }
    }
  }
  if (sectionRecords.length > 0) {
    sectionChunkHashes.push(
      canonicalSha256({
        chunkIndex: sectionChunkHashes.length,
        records: sectionRecords,
      }),
    );
  }
  return canonicalSha256({
    schemaVersion: 1,
    method: "canonical-directed-edge-integral-cocycle-section",
    oracleStructureHash: oracle.structureHash,
    coordinateIds,
    directedEdgeCount: oracle.degree * oracle.generatorCount,
    chunkSize: HASH_CHUNK_SIZE,
    chunkHashes: sectionChunkHashes,
  });
}

function packIntegralCocycleBasis(
  oracle: StreamedLawfulDavisOracle,
  basis: StreamedTrackBIntegralCocycleBasis,
): PackedIntegralCocycleBasis {
  const coordinateIds = [...basis.coordinateIds];
  const coordinateIdsValid =
    coordinateIds.length > 0 &&
    coordinateIds.every((id) => id.length > 0) &&
    new Set(coordinateIds).size === coordinateIds.length;
  if (!coordinateIdsValid) {
    throw new Error(
      "Integral cocycle coordinate ids must be nonempty and pairwise distinct.",
    );
  }
  if (!/^[0-9a-f]{64}$/.test(basis.latticeBasisDigest)) {
    throw new Error(
      "The lattice-basis digest must be a lowercase SHA-256 hash.",
    );
  }
  if (!/^[0-9a-f]{64}$/.test(basis.expectedCocycleSectionDigest)) {
    throw new Error(
      "The expected cocycle-section digest must be a lowercase SHA-256 hash.",
    );
  }

  const coordinateCount = coordinateIds.length;
  const directedEdgeCount = oracle.degree * oracle.generatorCount;
  const packedLength = directedEdgeCount * coordinateCount;
  if (!Number.isSafeInteger(packedLength) || packedLength > 0xffff_ffff) {
    throw new Error(
      `The dense cocycle section needs ${packedLength} entries, beyond the streamed bridge bound.`,
    );
  }
  const values = new Float64Array(packedLength);
  const sectionChunkHashes: string[] = [];
  let sectionRecords: Array<{
    point: number;
    generator: number;
    pairs: Array<[number, string]>;
  }> = [];
  let maximumAbsoluteEdgeCoordinate = 0n;
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const supplied = basis.edgeCoordinatePairs(point, generator);
      const pairs: Array<[number, string]> = [];
      let previousIndex = -1;
      for (const [coordinateIndex, suppliedValue] of supplied) {
        if (
          !Number.isInteger(coordinateIndex) ||
          coordinateIndex <= previousIndex ||
          coordinateIndex < 0 ||
          coordinateIndex >= coordinateCount
        ) {
          throw new Error(
            `Cocycle coordinates on q${point}s${generator} must have strictly increasing in-range indices.`,
          );
        }
        previousIndex = coordinateIndex;
        const exact = canonicalIntegralCoordinate(
          suppliedValue,
          `Cocycle coordinate ${coordinateIndex} on q${point}s${generator}`,
        );
        if (exact === 0n) {
          throw new Error(
            `Sparse cocycle coordinate ${coordinateIndex} on q${point}s${generator} is zero.`,
          );
        }
        const absolute = absoluteBigInt(exact);
        if (absolute > maximumAbsoluteEdgeCoordinate) {
          maximumAbsoluteEdgeCoordinate = absolute;
        }
        if (absolute > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error(
            `Cocycle coordinate ${coordinateIndex} on q${point}s${generator} exceeds the exact Number packing bound.`,
          );
        }
        values[
          (point * oracle.generatorCount + generator) * coordinateCount +
            coordinateIndex
        ] = Number(exact);
        pairs.push([coordinateIndex, exact.toString()]);
      }
      sectionRecords.push({ point, generator, pairs });
      if (sectionRecords.length === HASH_CHUNK_SIZE) {
        sectionChunkHashes.push(
          canonicalSha256({
            chunkIndex: sectionChunkHashes.length,
            records: sectionRecords,
          }),
        );
        sectionRecords = [];
      }
    }
  }
  if (sectionRecords.length > 0) {
    sectionChunkHashes.push(
      canonicalSha256({
        chunkIndex: sectionChunkHashes.length,
        records: sectionRecords,
      }),
    );
  }
  const cocycleSectionDigest = canonicalSha256({
    schemaVersion: 1,
    method: "canonical-directed-edge-integral-cocycle-section",
    oracleStructureHash: oracle.structureHash,
    coordinateIds,
    directedEdgeCount,
    chunkSize: HASH_CHUNK_SIZE,
    chunkHashes: sectionChunkHashes,
  });
  const expectedCocycleSectionDigestMatches =
    basis.expectedCocycleSectionDigest === cocycleSectionDigest;

  let directedEdgesAntisymmetric = true;
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const target = oracle.neighbor(point, generator);
      const forwardOffset =
        (point * oracle.generatorCount + generator) * coordinateCount;
      const reverseOffset =
        (target * oracle.generatorCount + generator) * coordinateCount;
      for (
        let coordinateIndex = 0;
        coordinateIndex < coordinateCount;
        coordinateIndex += 1
      ) {
        if (
          values[forwardOffset + coordinateIndex] !==
          -values[reverseOffset + coordinateIndex]
        ) {
          directedEdgesAntisymmetric = false;
        }
      }
    }
  }

  // A simple support path uses at most |W_T|-1 edges. We use |W_T| here so
  // the same bound also certifies exact summation around a full rank-two cell.
  const maximumSupportPathLength = Math.max(
    0,
    ...oracle.sphericalTypes.map((type) => type.subgroupOrder),
  );
  const maximumAbsoluteIntegratedCoordinateBound =
    maximumAbsoluteEdgeCoordinate * BigInt(maximumSupportPathLength);
  const exactNumberPackingBoundProved =
    maximumAbsoluteIntegratedCoordinateBound <= BigInt(Number.MAX_SAFE_INTEGER);

  let rankTwoBoundariesClosed = exactNumberPackingBoundProved;
  const closureChunkHashes: string[] = [];
  let closureRecords: Array<{
    cellId: string;
    sums: Array<[number, string]>;
  }> = [];
  if (exactNumberPackingBoundProved) {
    oracle.forEachRankTwoCell((rankTwoCell) => {
      const sums = new Float64Array(coordinateCount);
      for (const occurrence of rankTwoCell.boundary) {
        const offset =
          (occurrence.sourcePoint * oracle.generatorCount +
            occurrence.generator) *
          coordinateCount;
        for (
          let coordinateIndex = 0;
          coordinateIndex < coordinateCount;
          coordinateIndex += 1
        ) {
          sums[coordinateIndex] += values[offset + coordinateIndex];
        }
      }
      const nonzeroSums: Array<[number, string]> = [];
      for (
        let coordinateIndex = 0;
        coordinateIndex < coordinateCount;
        coordinateIndex += 1
      ) {
        if (sums[coordinateIndex] !== 0) {
          rankTwoBoundariesClosed = false;
          nonzeroSums.push([coordinateIndex, sums[coordinateIndex].toString()]);
        }
      }
      closureRecords.push({
        cellId: oracle.cellId(rankTwoCell.cell),
        sums: nonzeroSums,
      });
      if (closureRecords.length === HASH_CHUNK_SIZE) {
        closureChunkHashes.push(
          canonicalSha256({
            chunkIndex: closureChunkHashes.length,
            records: closureRecords,
          }),
        );
        closureRecords = [];
      }
    });
  }
  if (closureRecords.length > 0) {
    closureChunkHashes.push(
      canonicalSha256({
        chunkIndex: closureChunkHashes.length,
        records: closureRecords,
      }),
    );
  }
  const cocycleClosureDigest = canonicalSha256({
    schemaVersion: 1,
    method: "all-rank-two-boundary-integral-cocycle-closure",
    oracleStructureHash: oracle.structureHash,
    cocycleSectionDigest,
    rankTwoCellCount: oracle.rankTwoCellCount,
    chunkSize: HASH_CHUNK_SIZE,
    chunkHashes: closureChunkHashes,
  });
  const errors: string[] = [];
  if (!expectedCocycleSectionDigestMatches) {
    errors.push(
      "The concrete cocycle-section digest does not match its certificate.",
    );
  }
  if (!directedEdgesAntisymmetric) {
    errors.push(
      "The integral cocycle section is not antisymmetric on edge reversal.",
    );
  }
  if (!exactNumberPackingBoundProved) {
    errors.push(
      "The support-path bound does not prove exact Float64 integer integration.",
    );
  }
  if (!rankTwoBoundariesClosed) {
    errors.push(
      "An integral cocycle-basis coordinate has nonzero rank-two boundary sum.",
    );
  }
  return {
    coordinateIds,
    latticeBasisDigest: basis.latticeBasisDigest,
    cocycleSectionDigest,
    cocycleClosureDigest,
    values,
    maximumAbsoluteEdgeCoordinate,
    maximumAbsoluteIntegratedCoordinateBound,
    checks: {
      coordinateIdsValid,
      expectedCocycleSectionDigestMatches,
      directedEdgesAntisymmetric,
      rankTwoBoundariesClosed,
      exactNumberPackingBoundProved,
    },
    errors: uniqueSortedStrings(errors),
  };
}

function buildStaticTrackBData(
  oracle: StreamedLawfulDavisOracle,
): StaticTrackBData {
  const cached = STATIC_CACHE.get(oracle);
  if (cached) return cached;
  if (oracle.degree > MAX_EXACT_NUMBER_DEGREE) {
    throw new Error(
      `The streamed Track B exact-Number bound is degree ${MAX_EXACT_NUMBER_DEGREE}; received ${oracle.degree}.`,
    );
  }

  const wallIds = oracle.walls.walls.map((wall) => wall.id);
  if (!oracle.walls.twoSided) {
    throw new Error("Track B requires every quotient wall to be two-sided.");
  }
  const wallIndexById = new Map(
    wallIds.map((wallId, wallIndex) => [wallId, wallIndex]),
  );
  if (wallIds.length > 0xffff) {
    throw new Error("The streamed Track B wall index exceeds Uint16 capacity.");
  }

  const directedEdgeCount = oracle.degree * oracle.generatorCount;
  const neighbor = new Uint32Array(directedEdgeCount);
  const wallIndex = new Uint16Array(directedEdgeCount);
  const coefficient = new Int8Array(directedEdgeCount);
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const index = point * oracle.generatorCount + generator;
      const target = oracle.neighbor(point, generator);
      const geometric = oracle.geometricEdge(point, generator);
      const binding = oracle.wallBinding(point, generator);
      const canonicalWallIndex = wallIndexById.get(binding.wallId);
      if (canonicalWallIndex === undefined) {
        throw new Error(
          `Unknown wall ${binding.wallId} on q${point}s${generator}.`,
        );
      }
      const traversal = geometric.sourcePoint === point ? 1 : -1;
      neighbor[index] = target;
      wallIndex[index] = canonicalWallIndex;
      coefficient[index] = binding.edgeParity * traversal;
    }
  }

  const cellTypeRoots: Array<{
    typeIndex: number;
    cellCount: number;
    chunkHashes: string[];
  }> = [];
  let fullCellCount = 0;
  for (const type of oracle.sphericalTypes) {
    const chunks: string[] = [];
    let records: Array<[string, number]> = [];
    oracle.forEachCell(type.typeIndex, (cell) => {
      records.push([oracle.cellId(cell), cell.representativePoint]);
      fullCellCount += 1;
      if (records.length === HASH_CHUNK_SIZE) {
        chunks.push(
          canonicalSha256({
            typeIndex: type.typeIndex,
            chunkIndex: chunks.length,
            records,
          }),
        );
        records = [];
      }
    });
    if (records.length > 0) {
      chunks.push(
        canonicalSha256({
          typeIndex: type.typeIndex,
          chunkIndex: chunks.length,
          records,
        }),
      );
    }
    cellTypeRoots.push({
      typeIndex: type.typeIndex,
      cellCount: type.cellCount,
      chunkHashes: chunks,
    });
  }
  const fullCellSetDigest = canonicalSha256({
    schemaVersion: 1,
    method: "streamed-full-spherical-cell-id-chunk-tree",
    oracleStructureHash: oracle.structureHash,
    chunkSize: HASH_CHUNK_SIZE,
    cellTypeRoots,
  });

  let rankTwoCellCount = 0;
  let rankTwoBoundaryOccurrenceCount = 0;
  let wallBasisClosed = true;
  const closureChunkHashes: string[] = [];
  let closureRecords: Array<{
    cellId: string;
    boundaryLength: number;
    wallSums: Array<[number, number]>;
  }> = [];
  oracle.forEachRankTwoCell((rankTwoCell) => {
    rankTwoCellCount += 1;
    rankTwoBoundaryOccurrenceCount += rankTwoCell.boundary.length;
    const sums = new Map<number, number>();
    for (const occurrence of rankTwoCell.boundary) {
      const wall = oracle.wallForGeometricEdge(occurrence.edgeIndex);
      const currentWallIndex = wallIndexById.get(wall.id);
      if (currentWallIndex === undefined) {
        throw new Error(`Rank-two boundary uses unknown wall ${wall.id}.`);
      }
      const parity = oracle.wallBinding(
        occurrence.sourcePoint,
        occurrence.generator,
      ).edgeParity;
      sums.set(
        currentWallIndex,
        (sums.get(currentWallIndex) ?? 0) + parity * occurrence.traversal,
      );
    }
    const wallSums = [...sums.entries()]
      .filter(([, sum]) => sum !== 0)
      .sort((left, right) => left[0] - right[0]);
    if (wallSums.length > 0) wallBasisClosed = false;
    closureRecords.push({
      cellId: oracle.cellId(rankTwoCell.cell),
      boundaryLength: rankTwoCell.boundary.length,
      wallSums,
    });
    if (closureRecords.length === HASH_CHUNK_SIZE) {
      closureChunkHashes.push(
        canonicalSha256({
          chunkIndex: closureChunkHashes.length,
          records: closureRecords,
        }),
      );
      closureRecords = [];
    }
  });
  if (closureRecords.length > 0) {
    closureChunkHashes.push(
      canonicalSha256({
        chunkIndex: closureChunkHashes.length,
        records: closureRecords,
      }),
    );
  }
  const wallBasisClosureDigest = canonicalSha256({
    schemaVersion: 1,
    method: "rank-two-boundary-wall-basis-closure",
    oracleStructureHash: oracle.structureHash,
    rankTwoCellCount,
    rankTwoBoundaryOccurrenceCount,
    chunkSize: HASH_CHUNK_SIZE,
    chunkHashes: closureChunkHashes,
  });

  const maximalTypeIndices = oracle.sphericalTypes
    .filter(
      (type) =>
        !oracle.sphericalTypes.some(
          (other) =>
            other.dimension > type.dimension &&
            generatorsSubset(type.generators, new Set(other.generators)),
        ),
    )
    .map((type) => type.typeIndex)
    .sort(compareNumbers);
  const maximalCellCount = maximalTypeIndices.reduce(
    (sum, typeIndex) =>
      sum + (oracle.sphericalTypes[typeIndex]?.cellCount ?? 0),
    0,
  );
  const result: StaticTrackBData = {
    wallIds,
    edgeData: { neighbor, wallIndex, coefficient },
    fullCellSetDigest,
    fullCellCount,
    maximalTypeIndices,
    maximalCellCount,
    rankTwoCellCount,
    rankTwoBoundaryOccurrenceCount,
    wallBasisClosureDigest,
    wallBasisClosed,
    topologyCache: new Map(),
  };
  STATIC_CACHE.set(oracle, result);
  return result;
}

function replayGeneralizedCompression(
  options: StreamedTrackBOptions,
  oracle: StreamedLawfulDavisOracle,
  generatorImages: number[][],
): string[] {
  const replayOptions = options.generalizedCompressionReplayOptions ?? {};
  const cacheKey =
    options.generalizedCompressionReplayOptions === undefined
      ? `${oracle.structureHash}:${options.generalizedCompression.archiveHash}:default`
      : canonicalSha256({
          oracleStructureHash: oracle.structureHash,
          archiveHash: options.generalizedCompression.archiveHash,
          replayOptions: {
            sourceQuotientVertexIds:
              replayOptions.sourceQuotientVertexIds ?? null,
            coverCompressionArchiveHash: replayOptions.coverCompression
              ? canonicalSha256(replayOptions.coverCompression.certificate)
              : null,
          },
        });
  const cached = COMPRESSION_REPLAY_CACHE.get(
    options.generalizedCompression,
  )?.get(cacheKey);
  if (cached) return [...cached];

  const candidate: TorsionFreeActionCandidate = {
    id: options.generalizedCompression.source.candidateId,
    index: oracle.degree,
    generatorImages,
    backend: "streamed-track-b-action-rooted-replay",
  };
  const torsionFreeCertificate = certifyTorsionFreeAction(
    oracle.system,
    candidate,
    planSphericalSpecialSubgroups(oracle.system),
  );
  const accepted: TorsionFreeCandidateResult = {
    candidate,
    certificate: torsionFreeCertificate,
  };
  const replay = verifyGeneralizedCompressionCertificate(
    oracle.system,
    accepted,
    options.generalizedCompression,
    replayOptions,
  );
  const errors = replay.valid
    ? []
    : replay.errors.map(
        (error) => `Generalized-compression action-rooted replay: ${error}`,
      );
  const byCertificate =
    COMPRESSION_REPLAY_CACHE.get(options.generalizedCompression) ?? new Map();
  byCertificate.set(cacheKey, [...errors]);
  COMPRESSION_REPLAY_CACHE.set(options.generalizedCompression, byCertificate);
  return errors;
}

function prepareTrackBSource(
  options: StreamedTrackBOptions,
): PreparedTrackBSource {
  const suppliedOracle = options.oracle;
  let generatorImages = GENERATOR_IMAGES_CACHE.get(suppliedOracle);
  if (!generatorImages) {
    generatorImages = Array.from(
      { length: suppliedOracle.generatorCount },
      (_unused, generator) =>
        Array.from({ length: suppliedOracle.degree }, (_entry, point) =>
          suppliedOracle.neighbor(point, generator),
        ),
    );
    GENERATOR_IMAGES_CACHE.set(suppliedOracle, generatorImages);
  }
  const replayKey = canonicalSha256({
    system: suppliedOracle.system,
    generatorImages,
  });
  const cachedByKey = CANONICAL_ORACLE_CACHE.get(suppliedOracle);
  let oracle = cachedByKey?.get(replayKey);
  if (!oracle) {
    oracle = buildStreamedLawfulDavisOracle({
      system: suppliedOracle.system,
      generatorImages,
    });
    const updated = cachedByKey ?? new Map();
    updated.set(replayKey, oracle);
    CANONICAL_ORACLE_CACHE.set(suppliedOracle, updated);
  }
  const staticData = buildStaticTrackBData(oracle);
  const candidate = normalizeCandidate(options.candidate, staticData.wallIds);
  const wallSigns = Int8Array.from(
    staticData.wallIds.map((wallId) => candidate.wallSigns[wallId]),
  );
  const offsetPolarity = options.offsetPolarity ?? 1;
  if (offsetPolarity !== 1 && offsetPolarity !== -1) {
    throw new Error("Track B offsetPolarity must be +1 or -1.");
  }
  const generalizedCompression = options.generalizedCompression;
  const errors: string[] = [];
  if (oracle.structureHash !== suppliedOracle.structureHash) {
    errors.push(
      "The supplied oracle callbacks do not replay its structure hash.",
    );
  }
  if (
    oracle.actionRowsCanonicalSha256 !==
    suppliedOracle.actionRowsCanonicalSha256
  ) {
    errors.push("The supplied oracle callbacks do not replay its action hash.");
  }
  if (oracle.walls.structureHash !== suppliedOracle.walls.structureHash) {
    errors.push("The supplied oracle callbacks do not replay its wall hash.");
  }

  let compressionArchiveHashValid = false;
  const cachedCompressionHashValid = COMPRESSION_HASH_CACHE.get(
    generalizedCompression,
  );
  if (cachedCompressionHashValid !== undefined) {
    compressionArchiveHashValid = cachedCompressionHashValid;
  } else {
    try {
      compressionArchiveHashValid =
        generalizedCompression.archiveHash ===
        computeGeneralizedCompressionArchiveHash(generalizedCompression);
      COMPRESSION_HASH_CACHE.set(
        generalizedCompression,
        compressionArchiveHashValid,
      );
    } catch (error) {
      errors.push(
        `The generalized compression is not canonical: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (!compressionArchiveHashValid) {
    errors.push("The generalized-compression archive hash is stale.");
  }
  const systemCanonicalSha256 = canonicalSha256(oracle.system);
  if (
    generalizedCompression.source.systemCanonicalSha256 !==
    systemCanonicalSha256
  ) {
    errors.push("The generalized compression uses a different Coxeter system.");
  }
  if (generalizedCompression.source.degree !== oracle.degree) {
    errors.push("The generalized compression uses a different action degree.");
  }
  if (
    generalizedCompression.source.actionRowsCanonicalSha256 !==
    hashCanonicalActionRows(generatorImages)
  ) {
    errors.push("The generalized compression uses different action rows.");
  }
  if (
    canonicalSha256(generalizedCompression.cellCountByDimension) !==
    canonicalSha256(oracle.cellCountByDimension)
  ) {
    errors.push("The generalized compression and oracle cell counts disagree.");
  }
  if (generalizedCompression.compressedCellCount !== staticData.fullCellCount) {
    errors.push(
      "The generalized compression does not contain every streamed cell.",
    );
  }
  const requiredCompressionChecks = [
    generalizedCompression.checks.sourceTorsionFreeCertificateReplayed,
    generalizedCompression.checks.completeSphericalCatalogue,
    generalizedCompression.checks.everyRootedCellRecorded,
    generalizedCompression.checks.allFiberCardinalitiesEqualSphericalOrders,
    generalizedCompression.checks.everyProperSphericalFaceTypeChecked,
    generalizedCompression.checks.allFaceMapsCompatible,
    generalizedCompression.checks.rankAtMostTwoDefinitionAgreementPassed,
  ];
  if (
    generalizedCompression.status !== "passed" ||
    !requiredCompressionChecks.every(Boolean)
  ) {
    errors.push("The generalized compression has an unpassed source check.");
  }
  let compressionReplayErrors: string[] = [];
  let compressionReplayPassed = false;
  try {
    compressionReplayErrors = replayGeneralizedCompression(
      options,
      oracle,
      generatorImages,
    );
    errors.push(...compressionReplayErrors);
    compressionReplayPassed = compressionReplayErrors.length === 0;
  } catch (error) {
    errors.push(
      `Generalized-compression replay failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const coorientationHash = candidateCoorientationHash(
    oracle.structureHash,
    candidate,
    staticData.wallIds,
  );
  const wallSignVectorHash = candidateSignVectorHash(
    candidate,
    staticData.wallIds,
  );
  const source: StreamedTrackBSource = {
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    wallStructureHash: oracle.walls.structureHash,
    generalizedCompressionArchiveHash: generalizedCompression.archiveHash,
    systemCanonicalSha256,
    coorientationHash,
    wallSignVectorHash,
    offsetPolarity,
  };
  const sourceHash = canonicalSha256({
    schemaVersion: 1,
    kind: "streamed-full-k-track-b-source",
    candidateId: candidate.id,
    source,
    fullCellSetDigest: staticData.fullCellSetDigest,
    wallBasisClosureDigest: staticData.wallBasisClosureDigest,
  });
  return {
    oracle,
    candidate,
    wallSigns,
    generalizedCompression,
    generatorImages,
    staticData,
    source,
    sourceHash,
    compressionReplayPassed,
    offsetPolarity,
    errors: uniqueSortedStrings(errors),
  };
}

/**
 * Rebind a sign vector to an already replayed action/compression source.
 * Batch search must not re-hash the 34560-by-rank action for every mask.
 */
function rebindPreparedTrackBSource(
  base: PreparedTrackBSource,
  candidateInput: StreamedWallSignCandidate,
  offsetPolarity: 1 | -1,
): PreparedTrackBSource {
  const candidate = normalizeCandidate(candidateInput, base.staticData.wallIds);
  const wallSigns = Int8Array.from(
    base.staticData.wallIds.map((wallId) => candidate.wallSigns[wallId]),
  );
  const coorientationHash = candidateCoorientationHash(
    base.oracle.structureHash,
    candidate,
    base.staticData.wallIds,
  );
  const wallSignVectorHash = candidateSignVectorHash(
    candidate,
    base.staticData.wallIds,
  );
  const source: StreamedTrackBSource = {
    ...base.source,
    coorientationHash,
    wallSignVectorHash,
    offsetPolarity,
  };
  const sourceHash = canonicalSha256({
    schemaVersion: 1,
    kind: "streamed-full-k-track-b-source",
    candidateId: candidate.id,
    source,
    fullCellSetDigest: base.staticData.fullCellSetDigest,
    wallBasisClosureDigest: base.staticData.wallBasisClosureDigest,
  });
  return {
    ...base,
    candidate,
    wallSigns,
    source,
    sourceHash,
    offsetPolarity,
    errors: [...base.errors],
  };
}

function edgeIncrement(
  source: PreparedTrackBSource,
  point: number,
  generator: number,
): StreamedOrientationSign {
  const index = point * source.oracle.generatorCount + generator;
  const wallIndex = source.staticData.edgeData.wallIndex[index];
  return (source.staticData.edgeData.coefficient[index] *
    source.wallSigns[wallIndex]) as StreamedOrientationSign;
}

function buildPullingCertificate(
  source: PreparedTrackBSource,
): StreamedTrackBPullingCertificate {
  const compression = source.generalizedCompression;
  const compatibilityDigest = canonicalSha256({
    schemaVersion: 1,
    method: "global-order-pulling-restricted-through-certified-face-maps",
    globalOrder: "numeric-action-point-order",
    generalizedCompressionArchiveHash: compression.archiveHash,
    faceCompatibility: compression.faceCompatibility.map((entry) => ({
      faceTypeIndex: entry.faceTypeIndex,
      cofaceTypeIndex: entry.cofaceTypeIndex,
      transcriptHash: entry.transcriptHash,
      immediate: entry.immediate,
    })),
  });
  const checks = {
    everyGeneralizedCompressionCellRetained:
      compression.compressedCellCount === source.staticData.fullCellCount &&
      canonicalSha256(compression.cellCountByDimension) ===
        canonicalSha256(source.oracle.cellCountByDimension),
    globalVertexOrderStrict: source.oracle.degree > 0,
    allFaceMapsReplayed:
      source.compressionReplayPassed &&
      compression.checks.allFaceMapsCompatible,
    // Pulling a point configuration by one global order restricts to the
    // pulling triangulation of every face. The replayed face maps establish
    // that every quotient face is one of those restrictions.
    restrictionsAgreeOnSharedFaces:
      source.compressionReplayPassed &&
      compression.checks.everyProperSphericalFaceTypeChecked &&
      compression.checks.allFaceMapsCompatible,
    noSubdivisionVerticesIntroduced: true as const,
  };
  const withoutDigest = {
    method: "global-action-point-order-recursive-pulling" as const,
    vertexOrder: "q0<q1<...<q(degree-1)" as const,
    introducedVertexIds: [] as [],
    fullCellCount: source.staticData.fullCellCount,
    fullCellCountByDimension: { ...source.oracle.cellCountByDimension },
    maximalCellCount: source.staticData.maximalCellCount,
    immediateFaceIncidenceCount: compression.immediateFaceIncidenceCount,
    fullCellSetDigest: source.staticData.fullCellSetDigest,
    compatibilityDigest,
    checks,
  };
  return {
    ...withoutDigest,
    pullingDigest: canonicalSha256(withoutDigest),
  };
}

function buildCharacterCertificate(
  source: PreparedTrackBSource,
): StreamedTrackBCharacterCertificate {
  const { oracle, staticData } = source;
  const errors: string[] = [];
  const anchorWallId = staticData.wallIds[0] ?? "";
  const anchorSign = (source.candidate.wallSigns[anchorWallId] ?? 1) as 1 | -1;
  if (anchorWallId === "")
    errors.push("The quotient has no coorientable wall.");

  const unseen = 0xffff_ffff;
  const parent = new Uint32Array(oracle.degree);
  parent.fill(unseen);
  const parentGenerator = new Int16Array(oracle.degree);
  parentGenerator.fill(-1);
  // A spanning-tree potential can grow linearly with the action degree. A
  // Float64Array remains exact here because the packed degree is Uint32-sized,
  // whereas Int32 would wrap for otherwise valid large actions.
  const potentials = new Float64Array(oracle.degree);
  const queue = new Uint32Array(oracle.degree);
  parent[0] = 0;
  queue[0] = 0;
  let head = 0;
  let tail = 1;
  let quotientTreeEdgeCount = 0;
  while (head < tail) {
    const point = queue[head++];
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const index = point * oracle.generatorCount + generator;
      const target = staticData.edgeData.neighbor[index];
      if (parent[target] !== unseen) continue;
      parent[target] = point;
      parentGenerator[target] = generator;
      potentials[target] =
        potentials[point] + edgeIncrement(source, point, generator);
      queue[tail++] = target;
      quotientTreeEdgeCount += 1;
    }
  }
  const quotientGraphConnected = tail === oracle.degree;
  if (!quotientGraphConnected) {
    errors.push(`The quotient graph reaches ${tail}/${oracle.degree} points.`);
  }

  const treeChunkHashes: string[] = [];
  for (let start = 0; start < oracle.degree; start += HASH_CHUNK_SIZE) {
    const end = Math.min(oracle.degree, start + HASH_CHUNK_SIZE);
    treeChunkHashes.push(
      canonicalSha256({
        start,
        records: Array.from({ length: end - start }, (_unused, offset) => {
          const point = start + offset;
          return [
            point,
            parent[point] === unseen ? null : parent[point],
            parentGenerator[point],
            potentials[point],
          ];
        }),
      }),
    );
  }
  const treePotentialDigest = canonicalSha256({
    schemaVersion: 1,
    method: "canonical-generator-order-bfs-tree-potentials",
    degree: oracle.degree,
    chunkSize: HASH_CHUNK_SIZE,
    chunkHashes: treeChunkHashes,
  });

  const bezoutTrace: StreamedTrackBCharacterCertificate["bezoutTrace"] = [];
  const periodChunkHashes: string[] = [];
  let periodRecords: Array<[string, number]> = [];
  let currentGcd = 0;
  let nonzeroPeriodCount = 0;
  let geometricEdgeCount = 0;
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const geometric = oracle.geometricEdge(point, generator);
      if (geometric.sourcePoint !== point) continue;
      geometricEdgeCount += 1;
      const target = geometric.targetPoint;
      const period =
        potentials[point] +
        edgeIncrement(source, point, generator) -
        potentials[target];
      periodRecords.push([geometric.id, period]);
      if (period !== 0) {
        nonzeroPeriodCount += 1;
        const previousGcd = currentGcd;
        const extended = extendedGcd(previousGcd, period);
        const nextGcd = extended.gcd;
        if (nextGcd !== previousGcd || bezoutTrace.length === 0) {
          bezoutTrace.push({
            edgeId: geometric.id,
            period,
            previousGcd,
            nextGcd,
            previousCoefficient: extended.leftCoefficient,
            periodCoefficient: extended.rightCoefficient,
          });
        }
        currentGcd = nextGcd;
      }
      if (periodRecords.length === HASH_CHUNK_SIZE) {
        periodChunkHashes.push(
          canonicalSha256({
            chunkIndex: periodChunkHashes.length,
            records: periodRecords,
          }),
        );
        periodRecords = [];
      }
    }
  }
  if (periodRecords.length > 0) {
    periodChunkHashes.push(
      canonicalSha256({
        chunkIndex: periodChunkHashes.length,
        records: periodRecords,
      }),
    );
  }
  const periodDigest = canonicalSha256({
    schemaVersion: 1,
    method: "spanning-tree-cotree-periods",
    geometricEdgeCount,
    quotientTreeEdgeCount,
    chunkSize: HASH_CHUNK_SIZE,
    chunkHashes: periodChunkHashes,
  });
  const bezoutTraceValid = bezoutTrace.every(
    (entry) =>
      entry.previousCoefficient * entry.previousGcd +
        entry.periodCoefficient * entry.period ===
        entry.nextGcd && entry.nextGcd === gcd(entry.previousGcd, entry.period),
  );
  if (!staticData.wallBasisClosed) {
    errors.push("A wall-basis cochain has nonzero rank-two boundary sum.");
  }
  if (currentGcd === 0) errors.push("The selected wall character is trivial.");
  if (!bezoutTraceValid) errors.push("The period-gcd Bezout trace is invalid.");
  const checks = {
    wallBasisClosedOnEveryRankTwoCell: staticData.wallBasisClosed,
    everyGeneratorEdgeNonzero: true,
    quotientGraphConnected,
    characterNontrivial: currentGcd > 0,
    primitiveAfterNormalization: currentGcd > 0 && bezoutTraceValid,
    bezoutTraceValid,
  };
  const withoutDigest = {
    status: (errors.length === 0 && Object.values(checks).every(Boolean)
      ? "passed"
      : "failed") as "passed" | "failed",
    method: "spanning-tree-period-gcd-and-bezout" as const,
    anchorWallId,
    anchorSign,
    normalizationDivisor: currentGcd,
    quotientTreeEdgeCount,
    nonTreePeriodCount: Math.max(0, geometricEdgeCount - quotientTreeEdgeCount),
    nonzeroPeriodCount,
    treePotentialDigest,
    periodDigest,
    bezoutTrace,
    checks,
    errors: uniqueSortedStrings(errors),
  };
  return {
    ...withoutDigest,
    characterDigest: canonicalSha256({
      ...withoutDigest,
      wallBasisClosureDigest: staticData.wallBasisClosureDigest,
    }),
  };
}

function buildHeightCertificate(
  source: PreparedTrackBSource,
  character: StreamedTrackBCharacterCertificate,
  pulling: StreamedTrackBPullingCertificate,
): StreamedTrackBHeightCertificate {
  const errors: string[] = [];
  let everyOriginalEdgeSignPreserved = true;
  const signedPolarity = source.offsetPolarity * character.anchorSign;
  for (let point = 0; point < source.oracle.degree; point += 1) {
    for (
      let generator = 0;
      generator < source.oracle.generatorCount;
      generator += 1
    ) {
      const geometric = source.oracle.geometricEdge(point, generator);
      if (geometric.sourcePoint !== point) continue;
      const increment = edgeIncrement(source, point, generator);
      // Multiplication by degree clears the periodic offset denominator.
      const numerator =
        4 * source.oracle.degree * increment +
        signedPolarity * (geometric.targetPoint - geometric.sourcePoint);
      if (Math.sign(numerator) !== Math.sign(increment)) {
        everyOriginalEdgeSignPreserved = false;
        errors.push(`The tie breaker reverses ${geometric.id}.`);
      }
    }
  }
  const checks = {
    everyCellHasPathIndependentIntegralHeight:
      source.staticData.wallBasisClosed,
    overlapDifferencesConstant:
      source.staticData.wallBasisClosed && pulling.checks.allFaceMapsReplayed,
    everyOriginalEdgeSignPreserved,
    // Raw differences are integral. If they vanish, the signed global point
    // order separates the vertices; otherwise its absolute difference is
    // strictly below one and cannot cancel the integral difference.
    everyPullingSimplexHasDistinctVertexHeights:
      source.oracle.degree > 0 && everyOriginalEdgeSignPreserved,
    quotientOffsetsPeriodic: true,
    globalReversalNegatesHeight: true,
  };
  if (character.status !== "passed") {
    errors.push("The raw character did not pass the period-gcd stage.");
  }
  if (!Object.values(checks).every(Boolean)) {
    errors.push("At least one exact Track B height check failed.");
  }
  const withoutDigest = {
    status: (character.status === "passed" &&
    errors.length === 0 &&
    Object.values(checks).every(Boolean)
      ? "passed"
      : "failed") as "passed" | "failed",
    method:
      "cell-local-integral-height-with-candidate-odd-periodic-offset" as const,
    normalizationDivisor: character.normalizationDivisor,
    offsetDenominator: 4 * source.oracle.degree,
    anchorWallId: character.anchorWallId,
    anchorSign: character.anchorSign,
    offsetPolarity: source.offsetPolarity,
    formula: "F_c(q)=raw_c(q)+polarity*sign_c(anchor)*q/(4*degree)" as const,
    checks,
    errors: uniqueSortedStrings(errors),
  };
  return {
    ...withoutDigest,
    heightDigest: canonicalSha256({
      ...withoutDigest,
      sourceHash: source.sourceHash,
      characterDigest: character.characterDigest,
      pullingDigest: pulling.pullingDigest,
    }),
  };
}

function buildPullingLinkTopology(
  source: PreparedTrackBSource,
  point: number,
  cocycleBasis?: PackedIntegralCocycleBasis,
  includeAdjacency = true,
): PullingLinkTopology {
  const { oracle, staticData } = source;
  if (!Number.isInteger(point) || point < 0 || point >= oracle.degree) {
    throw new RangeError(`Track B point q${point} is outside the quotient.`);
  }
  // The legacy wall-coordinate topology is cached for the existing Track B
  // batch scan. Arbitrary H^1 sections are streamed and deliberately released.
  const cached =
    cocycleBasis || !includeAdjacency
      ? undefined
      : staticData.topologyCache.get(point);
  if (cached) return cached;

  const verticesByCellId = new Map<string, number[]>();
  const facetsByCellId = new Map<string, StreamedDavisCell[]>();
  const oneSkeletonByCellId = new Map<string, Set<string>>();
  const starByCellId = new Map<string, PullingStar>();
  const supportByAmbientPair = new Map<string, StreamedDavisCell>();
  const pathCoefficientsBySupport = new Map<
    string,
    Map<number, Int16Array | Float64Array>
  >();

  const cellVertices = (cell: StreamedDavisCell): number[] => {
    const id = oracle.cellId(cell);
    let vertices = verticesByCellId.get(id);
    if (!vertices) {
      vertices = Array.from(oracle.cellVertices(cell)).sort(compareNumbers);
      verticesByCellId.set(id, vertices);
    }
    return vertices;
  };
  const cellFacets = (cell: StreamedDavisCell): StreamedDavisCell[] => {
    const id = oracle.cellId(cell);
    let facets = facetsByCellId.get(id);
    if (!facets) {
      facets = [];
      oracle.forEachFacet(cell, (facet) => facets!.push(facet));
      facets.sort((left, right) =>
        compareIds(oracle.cellId(left), oracle.cellId(right)),
      );
      facetsByCellId.set(id, facets);
    }
    return facets;
  };
  const oneSkeleton = (cell: StreamedDavisCell): Set<string> => {
    const id = oracle.cellId(cell);
    const cachedSkeleton = oneSkeletonByCellId.get(id);
    if (cachedSkeleton) return cachedSkeleton;
    const edges = new Set<string>();
    if (cell.dimension > 0) {
      const vertices = cellVertices(cell);
      const apex = vertices[0];
      for (const facet of cellFacets(cell)) {
        const facetVertices = cellVertices(facet);
        if (facetVertices.includes(apex)) continue;
        for (const edge of oneSkeleton(facet)) edges.add(edge);
        for (const other of facetVertices) edges.add(edgePairKey(apex, other));
      }
    }
    oneSkeletonByCellId.set(id, edges);
    return edges;
  };
  const pullingStar = (cell: StreamedDavisCell): PullingStar => {
    const id = oracle.cellId(cell);
    const cachedStar = starByCellId.get(id);
    if (cachedStar) return cachedStar;
    const result: PullingStar = {
      neighbors: new Set<number>(),
      edges: new Set<string>(),
    };
    const vertices = cellVertices(cell);
    if (!vertices.includes(point)) {
      throw new Error(`${id} does not contain the requested point q${point}.`);
    }
    if (cell.dimension > 0) {
      const apex = vertices[0];
      for (const facet of cellFacets(cell)) {
        const facetVertices = cellVertices(facet);
        if (facetVertices.includes(apex)) continue;
        if (point === apex) {
          for (const other of facetVertices) result.neighbors.add(other);
          if (includeAdjacency) {
            for (const edge of oneSkeleton(facet)) result.edges.add(edge);
          }
        } else if (facetVertices.includes(point)) {
          const facetStar = pullingStar(facet);
          result.neighbors.add(apex);
          for (const other of facetStar.neighbors) {
            result.neighbors.add(other);
            if (includeAdjacency) {
              result.edges.add(edgePairKey(apex, other));
            }
          }
          if (includeAdjacency) {
            for (const edge of facetStar.edges) result.edges.add(edge);
          }
        }
      }
    }
    starByCellId.set(id, result);
    return result;
  };

  const minimalSupport = (
    ambient: StreamedDavisCell,
    otherPoint: number,
  ): StreamedDavisCell => {
    const key = `${oracle.cellId(ambient)}\u0000${point}\u0000${otherPoint}`;
    const cachedSupport = supportByAmbientPair.get(key);
    if (cachedSupport) return cachedSupport;
    const ambientGenerators = new Set(ambient.generators);
    for (let dimension = 1; dimension <= ambient.dimension; dimension += 1) {
      const matches = new Map<string, StreamedDavisCell>();
      for (const type of oracle.sphericalTypes) {
        if (
          type.dimension !== dimension ||
          !generatorsSubset(type.generators, ambientGenerators)
        ) {
          continue;
        }
        const face = oracle.cellContaining(type.typeIndex, point);
        if (!cellVertices(face).includes(otherPoint)) continue;
        matches.set(oracle.cellId(face), face);
      }
      if (matches.size === 1) {
        const support = [...matches.values()][0];
        supportByAmbientPair.set(key, support);
        return support;
      }
      if (matches.size > 1) {
        throw new Error(
          `The pulling edge q${point}-q${otherPoint} has ${matches.size} minimal supports inside ${oracle.cellId(ambient)}.`,
        );
      }
    }
    throw new Error(
      `No face supports pulling edge q${point}-q${otherPoint} in ${oracle.cellId(ambient)}.`,
    );
  };

  const coefficientMap = (
    support: StreamedDavisCell,
  ): Map<number, Int16Array | Float64Array> => {
    const cacheKey = `${oracle.cellId(support)}\u0000q${point}`;
    const cachedCoefficients = pathCoefficientsBySupport.get(cacheKey);
    if (cachedCoefficients) return cachedCoefficients;
    const allowed = new Set(cellVertices(support));
    const coordinateCount =
      cocycleBasis?.coordinateIds.length ?? staticData.wallIds.length;
    const zero = cocycleBasis
      ? new Float64Array(coordinateCount)
      : new Int16Array(coordinateCount);
    const coefficients = new Map<number, Int16Array | Float64Array>([
      [point, zero],
    ]);
    const queue = [point];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const currentCoefficients = coefficients.get(current)!;
      for (const generator of support.generators) {
        const edgeIndex = current * oracle.generatorCount + generator;
        const target = staticData.edgeData.neighbor[edgeIndex];
        if (!allowed.has(target)) {
          throw new Error(
            `Generator ${generator} leaves ${oracle.cellId(support)} at q${current}.`,
          );
        }
        const next = cocycleBasis
          ? new Float64Array(currentCoefficients)
          : new Int16Array(currentCoefficients);
        if (cocycleBasis) {
          const offset = edgeIndex * coordinateCount;
          for (
            let coordinateIndex = 0;
            coordinateIndex < coordinateCount;
            coordinateIndex += 1
          ) {
            next[coordinateIndex] +=
              cocycleBasis.values[offset + coordinateIndex];
            if (!Number.isSafeInteger(next[coordinateIndex])) {
              throw new Error(
                `Integral cocycle coordinate ${coordinateIndex} exceeds the proved packing bound in ${oracle.cellId(support)}.`,
              );
            }
          }
        } else {
          next[staticData.edgeData.wallIndex[edgeIndex]] +=
            staticData.edgeData.coefficient[edgeIndex];
        }
        const existing = coefficients.get(target);
        if (!existing) {
          coefficients.set(target, next);
          queue.push(target);
        } else if (existing.some((value, index) => value !== next[index])) {
          throw new Error(
            `${cocycleBasis ? "Integral-cocycle" : "Wall-basis"} integration is path-dependent in ${oracle.cellId(support)}.`,
          );
        }
      }
    }
    if (coefficients.size !== allowed.size) {
      throw new Error(
        `${cocycleBasis ? "Integral-cocycle" : "Wall-basis"} integration reached ${coefficients.size}/${allowed.size} vertices of ${oracle.cellId(support)}.`,
      );
    }
    pathCoefficientsBySupport.set(cacheKey, coefficients);
    return coefficients;
  };

  const germById = new Map<string, PullingLinkGerm>();
  const topologyEdges = new Set<string>();
  const germFor = (
    ambient: StreamedDavisCell,
    otherPoint: number,
  ): PullingLinkGerm => {
    const support = minimalSupport(ambient, otherPoint);
    const supportCellId = oracle.cellId(support);
    const id = `track-b:germ:${supportCellId}:q${point}:q${otherPoint}`;
    const coefficients = coefficientMap(support).get(otherPoint);
    if (!coefficients) {
      throw new Error(
        `${id} has no integrated ${cocycleBasis ? "integral-cocycle" : "wall-basis"} path.`,
      );
    }
    const coefficientPairs = Array.from(coefficients.entries())
      .filter(([, value]) => value !== 0)
      .map(([index, value]) => [index, value] as [number, number]);
    const germ: PullingLinkGerm = {
      id,
      otherPoint,
      supportCellId,
      coefficientPairs,
    };
    const existing = germById.get(id);
    if (existing && canonicalSha256(existing) !== canonicalSha256(germ)) {
      throw new Error(`${id} has inconsistent path data across maximal cells.`);
    }
    if (!existing) germById.set(id, germ);
    return existing ?? germ;
  };

  const maximalCellIds = new Set<string>();
  for (const typeIndex of staticData.maximalTypeIndices) {
    const ambient = oracle.cellContaining(typeIndex, point);
    maximalCellIds.add(oracle.cellId(ambient));
    const star = pullingStar(ambient);
    const germByOther = new Map<number, PullingLinkGerm>();
    for (const otherPoint of star.neighbors) {
      germByOther.set(otherPoint, germFor(ambient, otherPoint));
    }
    if (includeAdjacency) {
      for (const pair of star.edges) {
        const [leftPoint, rightPoint] = pair.split(",").map(Number);
        const left = germByOther.get(leftPoint) ?? germFor(ambient, leftPoint);
        const right =
          germByOther.get(rightPoint) ?? germFor(ambient, rightPoint);
        if (left.id !== right.id)
          topologyEdges.add(germEdgeKey(left.id, right.id));
      }
    }
  }
  const germs = [...germById.values()].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const edges = [...topologyEdges]
    .sort(compareIds)
    .map((key) => key.split("\u0000") as [string, string]);
  const germIndexById = new Map(
    germs.map((germ, germIndex) => [germ.id, germIndex]),
  );
  const numericAdjacency = includeAdjacency
    ? Array.from({ length: germs.length }, () => [] as number[])
    : [];
  for (const [leftId, rightId] of edges) {
    const left = germIndexById.get(leftId);
    const right = germIndexById.get(rightId);
    if (left === undefined || right === undefined) {
      throw new Error("A pulling-link edge references an unknown germ.");
    }
    numericAdjacency[left].push(right);
    numericAdjacency[right].push(left);
  }
  const adjacency = includeAdjacency
    ? numericAdjacency.map((row) => Uint32Array.from(row.sort(compareNumbers)))
    : [];
  const topologyWithoutDigest = {
    point,
    maximalCellCount: maximalCellIds.size,
    germs,
    edges,
  };
  const topology: PullingLinkTopology = {
    ...topologyWithoutDigest,
    adjacency,
    topologyDigest: cocycleBasis
      ? canonicalSha256({
          schemaVersion: 1,
          method:
            "recursive-pulling-star-one-skeleton-in-integral-cocycle-basis",
          oracleStructureHash: oracle.structureHash,
          latticeBasisDigest: cocycleBasis.latticeBasisDigest,
          cocycleSectionDigest: cocycleBasis.cocycleSectionDigest,
          includeAdjacency,
          ...topologyWithoutDigest,
        })
      : canonicalSha256({
          schemaVersion: 1,
          method: "recursive-pulling-star-one-skeleton",
          oracleStructureHash: oracle.structureHash,
          ...topologyWithoutDigest,
        }),
  };
  if (
    !cocycleBasis &&
    includeAdjacency &&
    staticData.topologyCache.size >= MAX_TOPOLOGY_CACHE_ENTRIES
  ) {
    const oldest = staticData.topologyCache.keys().next().value as
      | number
      | undefined;
    if (oldest !== undefined) staticData.topologyCache.delete(oldest);
  }
  if (!cocycleBasis && includeAdjacency) {
    staticData.topologyCache.set(point, topology);
  }
  return topology;
}

interface NumericPointEvaluation {
  ascendingIndices: number[];
  descendingIndices: number[];
  ascendingComponents: number[][];
  descendingComponents: number[][];
  failures: StreamedTrackBLinkFailureKind[];
}

function selectedNumericComponents(
  selectedIndices: readonly number[],
  adjacency: readonly Uint32Array[],
): number[][] {
  const unseen = new Uint8Array(adjacency.length);
  for (const index of selectedIndices) unseen[index] = 1;
  const components: number[][] = [];
  for (const root of selectedIndices) {
    if (unseen[root] === 0) continue;
    unseen[root] = 0;
    const component = [root];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of adjacency[component[cursor]]) {
        if (unseen[neighbor] === 0) continue;
        unseen[neighbor] = 0;
        component.push(neighbor);
      }
    }
    component.sort(compareNumbers);
    components.push(component);
  }
  // selectedIndices follows the globally sorted germ order, so each root is
  // the least index in its component and the component order is canonical.
  return components;
}

function evaluatePointTopologyNumerically(
  source: PreparedTrackBSource,
  topology: PullingLinkTopology,
): NumericPointEvaluation {
  const sigma = source.offsetPolarity * source.wallSigns[0];
  const ascendingIndices: number[] = [];
  const descendingIndices: number[] = [];
  for (let germIndex = 0; germIndex < topology.germs.length; germIndex += 1) {
    const germ = topology.germs[germIndex];
    let rawDifference = 0;
    for (const [wallIndex, coefficient] of germ.coefficientPairs) {
      rawDifference += coefficient * source.wallSigns[wallIndex];
    }
    const clearedDifference =
      4 * source.oracle.degree * rawDifference +
      sigma * (germ.otherPoint - topology.point);
    if (clearedDifference > 0) ascendingIndices.push(germIndex);
    else if (clearedDifference < 0) descendingIndices.push(germIndex);
    else {
      throw new Error(`The generic Track B height ties on ${germ.id}.`);
    }
  }
  const ascendingComponents = selectedNumericComponents(
    ascendingIndices,
    topology.adjacency,
  );
  const descendingComponents = selectedNumericComponents(
    descendingIndices,
    topology.adjacency,
  );
  const failures: StreamedTrackBLinkFailureKind[] = [];
  if (ascendingIndices.length === 0) failures.push("ascending-empty");
  if (descendingIndices.length === 0) failures.push("descending-empty");
  if (ascendingIndices.length > 0 && ascendingComponents.length !== 1) {
    failures.push("ascending-disconnected");
  }
  if (descendingIndices.length > 0 && descendingComponents.length !== 1) {
    failures.push("descending-disconnected");
  }
  return {
    ascendingIndices,
    descendingIndices,
    ascendingComponents,
    descendingComponents,
    failures,
  };
}

function materializePointEvaluation(
  topology: PullingLinkTopology,
  numeric: NumericPointEvaluation,
): EvaluatedPointLink {
  const ids = topology.germs.map((germ) => germ.id);
  const ascending = numeric.ascendingIndices.map((index) => ids[index]);
  const descending = numeric.descendingIndices.map((index) => ids[index]);
  const ascendingComponents = numeric.ascendingComponents.map((component) =>
    component.map((index) => ids[index]),
  );
  const descendingComponents = numeric.descendingComponents.map((component) =>
    component.map((index) => ids[index]),
  );
  const summaryWithoutDigest = {
    point: topology.point,
    maximalCellCount: topology.maximalCellCount,
    germCount: topology.germs.length,
    linkEdgeCount: topology.edges.length,
    ascendingVertexCount: numeric.ascendingIndices.length,
    ascendingComponentCount: ascendingComponents.length,
    descendingVertexCount: numeric.descendingIndices.length,
    descendingComponentCount: descendingComponents.length,
    ascendingNonempty: numeric.ascendingIndices.length > 0,
    ascendingConnected: ascendingComponents.length === 1,
    descendingNonempty: numeric.descendingIndices.length > 0,
    descendingConnected: descendingComponents.length === 1,
    topologyDigest: topology.topologyDigest,
  };
  return {
    summary: {
      ...summaryWithoutDigest,
      linkDigest: canonicalSha256({
        ...summaryWithoutDigest,
        ascending,
        descending,
        ascendingComponents,
        descendingComponents,
      }),
    },
    ascendingComponents,
    descendingComponents,
    failures: numeric.failures,
  };
}

function evaluatePointTopology(
  source: PreparedTrackBSource,
  topology: PullingLinkTopology,
): EvaluatedPointLink {
  return materializePointEvaluation(
    topology,
    evaluatePointTopologyNumerically(source, topology),
  );
}

function buildLinksCertificate(
  source: PreparedTrackBSource,
  pulling: StreamedTrackBPullingCertificate,
  height: StreamedTrackBHeightCertificate,
  scanMode: "exhaustive" | "stop-on-first-failure",
  maxWitnesses: number,
): StreamedTrackBLinksCertificate {
  const vertexSummaries: StreamedTrackBLinkSummary[] = [];
  const witnesses: StreamedTrackBLinkWitness[] = [];
  const failureCounts: Record<StreamedTrackBLinkFailureKind, number> = {
    "ascending-empty": 0,
    "descending-empty": 0,
    "ascending-disconnected": 0,
    "descending-disconnected": 0,
  };
  const errors: string[] = [];
  let counterexampleFound = false;
  for (let point = 0; point < source.oracle.degree; point += 1) {
    let evaluated: EvaluatedPointLink;
    try {
      evaluated = evaluatePointTopology(
        source,
        buildPullingLinkTopology(source, point),
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      break;
    }
    vertexSummaries.push(evaluated.summary);
    for (const kind of evaluated.failures) {
      failureCounts[kind] += 1;
      counterexampleFound = true;
      if (witnesses.length < maxWitnesses) {
        witnesses.push({
          point,
          kind,
          components: kind.startsWith("ascending")
            ? evaluated.ascendingComponents
            : evaluated.descendingComponents,
        });
      }
    }
    if (counterexampleFound && scanMode === "stop-on-first-failure") break;
  }
  const everyQuotientVertexChecked =
    vertexSummaries.length === source.oracle.degree;
  const sourcePullingAndHeightPassed =
    source.errors.length === 0 &&
    height.status === "passed" &&
    Object.values(pulling.checks).every(Boolean);
  const checks = {
    sourcePullingAndHeightPassed,
    everyQuotientVertexChecked,
    allAscendingNonempty: failureCounts["ascending-empty"] === 0,
    allDescendingNonempty: failureCounts["descending-empty"] === 0,
    allAscendingConnected: failureCounts["ascending-disconnected"] === 0,
    allDescendingConnected: failureCounts["descending-disconnected"] === 0,
  };
  if (!sourcePullingAndHeightPassed) {
    errors.push("The full-K pulling or height source did not pass.");
  }
  if (counterexampleFound) {
    errors.push("At least one full-K directed link fails the Morse condition.");
  } else if (!everyQuotientVertexChecked) {
    errors.push("The directed-link scan ended before every quotient vertex.");
  }
  const scanOutcome = counterexampleFound
    ? "counterexample-found"
    : everyQuotientVertexChecked
      ? "exhaustive"
      : "incomplete";
  const withoutDigest = {
    status: (sourcePullingAndHeightPassed &&
    everyQuotientVertexChecked &&
    Object.values(checks).every(Boolean)
      ? "passed"
      : "failed") as "passed" | "failed",
    method: "full-k-pulling-link-one-skeleton" as const,
    scanMode,
    scanOutcome: scanOutcome as StreamedTrackBLinksCertificate["scanOutcome"],
    checkedVertexCount: vertexSummaries.length,
    vertexSummaries,
    witnesses,
    failureCounts,
    checks,
    errors: uniqueSortedStrings(errors),
  };
  return {
    ...withoutDigest,
    linksDigest: canonicalSha256({
      ...withoutDigest,
      sourceHash: source.sourceHash,
      pullingDigest: pulling.pullingDigest,
      heightDigest: height.heightDigest,
    }),
  };
}

/** Build one exact action-rooted full-K Track B certificate. */
export function buildStreamedTrackBCertificate(
  options: StreamedTrackBOptions,
): StreamedTrackBCertificate {
  const scanMode = options.linkScan ?? "exhaustive";
  const maxLinkWitnesses = options.maxLinkWitnesses ?? 16;
  if (!Number.isInteger(maxLinkWitnesses) || maxLinkWitnesses < 0) {
    throw new RangeError("maxLinkWitnesses must be a nonnegative integer.");
  }
  const source = prepareTrackBSource(options);
  const pulling = buildPullingCertificate(source);
  const character = buildCharacterCertificate(source);
  const height = buildHeightCertificate(source, character, pulling);
  const directedLinks = buildLinksCertificate(
    source,
    pulling,
    height,
    scanMode,
    maxLinkWitnesses,
  );
  const generalizedChecks = source.generalizedCompression.checks;
  const fullKChecks = {
    torsionFreeActionReplayed:
      generalizedChecks.sourceTorsionFreeCertificateReplayed &&
      source.compressionReplayPassed,
    generalizedCompressionReplayed: source.compressionReplayPassed,
    completeSphericalCellSet:
      generalizedChecks.completeSphericalCatalogue &&
      generalizedChecks.everyRootedCellRecorded &&
      source.generalizedCompression.compressedCellCount ===
        source.staticData.fullCellCount,
  };
  const fullK: StreamedTrackBCertificate["fullK"] = {
    quotient: "H\\Sigma",
    allCellsRetained: true,
    universalCover: "Davis complex Sigma",
    universalCoverContractible: Object.values(fullKChecks).every(Boolean),
    quotientAspherical: Object.values(fullKChecks).every(Boolean),
    checks: fullKChecks,
  };
  const symmetryWithoutDigest = {
    anchorWallId: character.anchorWallId,
    canonicalRepresentativeSign: 1 as const,
    identity: "F_{-c}=-F_c" as const,
    ascendingDescendingLinksSwap: true as const,
    exhaustiveSearchMayFixAnchorPositive:
      height.checks.globalReversalNegatesHeight,
  };
  const globalSignReversal: StreamedTrackBCertificate["globalSignReversal"] = {
    ...symmetryWithoutDigest,
    symmetryDigest: canonicalSha256({
      ...symmetryWithoutDigest,
      offsetPolarity: source.offsetPolarity,
      wallSignVectorHash: source.source.wallSignVectorHash,
    }),
  };
  const errors = uniqueSortedStrings([
    ...source.errors,
    ...character.errors,
    ...height.errors,
    ...directedLinks.errors,
  ]);
  const passed =
    errors.length === 0 &&
    Object.values(fullKChecks).every(Boolean) &&
    character.status === "passed" &&
    height.status === "passed" &&
    directedLinks.status === "passed";
  const certificate: StreamedTrackBCertificate = {
    schemaVersion: 1,
    kind: "streamed-full-k-track-b-certificate",
    method: "action-rooted-global-pulling-and-exact-directed-links",
    status: passed ? "passed" : "failed",
    candidateId: source.candidate.id,
    sourceHash: source.sourceHash,
    source: source.source,
    fullK,
    character,
    pulling,
    height,
    globalSignReversal,
    directedLinks,
    conclusion: passed
      ? "finite-generation-certified"
      : directedLinks.scanOutcome === "counterexample-found" &&
          source.errors.length === 0 &&
          character.status === "passed" &&
          height.status === "passed"
        ? "morse-link-condition-failed"
        : "not-established",
    artifactHashAlgorithm: "sha256",
    artifactHash: "",
    errors,
    nonClaims: [
      "This certificate establishes finite generation only when every promotion gate passes; it does not by itself prove finite presentation or a topological bundle.",
      "The primitive period normalization is recorded algebraically, but the PL height represents the raw character. The two characters have the same kernel.",
      "Pulling introduces no vertices. Its new diagonal edges and higher simplices are included in the exact directed-link calculation.",
      "A definition-level generalized compression is sufficient; a materialized rank-at-most-two bridge is optional.",
    ],
  };
  certificate.artifactHash = computeStreamedTrackBArtifactHash(certificate);
  return certificate;
}

/** Rebuild every field from the action rows and reject rehashed tampering. */
export function replayStreamedTrackBCertificate(
  options: StreamedTrackBOptions,
  stored: StreamedTrackBCertificate,
): StreamedTrackBReplay {
  const errors: string[] = [];
  let storedArtifactHashValid = false;
  try {
    storedArtifactHashValid =
      stored.artifactHash === computeStreamedTrackBArtifactHash(stored);
  } catch (error) {
    errors.push(
      `The stored Track B artifact is not canonical: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!storedArtifactHashValid)
    errors.push("The stored artifact hash is stale.");
  let rebuilt: StreamedTrackBCertificate;
  try {
    rebuilt = buildStreamedTrackBCertificate(options);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      schemaVersion: 1,
      kind: "streamed-full-k-track-b-replay",
      status: "failed",
      checks: {
        storedArtifactHashValid,
        sourceHashesMatch: false,
        actionRootedReconstructionMatches: false,
      },
      rebuiltArtifactHash: "",
      errors: uniqueSortedStrings(errors),
    };
  }
  const sourceHashesMatch =
    stored.sourceHash === rebuilt.sourceHash &&
    canonicalSha256(stored.source) === canonicalSha256(rebuilt.source);
  const actionRootedReconstructionMatches =
    canonicalSha256(stored) === canonicalSha256(rebuilt);
  if (!sourceHashesMatch) errors.push("The stored source envelope is stale.");
  if (!actionRootedReconstructionMatches) {
    errors.push("The stored artifact differs from action-rooted replay.");
  }
  const checks = {
    storedArtifactHashValid,
    sourceHashesMatch,
    actionRootedReconstructionMatches,
  };
  return {
    schemaVersion: 1,
    kind: "streamed-full-k-track-b-replay",
    status:
      errors.length === 0 && Object.values(checks).every(Boolean)
        ? "passed"
        : "failed",
    checks,
    rebuiltArtifactHash: rebuilt.artifactHash,
    errors: uniqueSortedStrings(errors),
  };
}

/** Recompute one full pulling-link one-skeleton for audit and visualization. */
export function computeStreamedTrackBLinkAtPoint(
  options: StreamedTrackBOptions,
  point: number,
): StreamedTrackBPointResult {
  const source = prepareTrackBSource(options);
  const evaluated = evaluatePointTopology(
    source,
    buildPullingLinkTopology(source, point),
  );
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "streamed-full-k-track-b-point-link" as const,
    candidateId: source.candidate.id,
    sourceHash: source.sourceHash,
    point,
    summary: evaluated.summary,
    ascendingComponents: evaluated.ascendingComponents,
    descendingComponents: evaluated.descendingComponents,
  };
  return {
    ...withoutHash,
    resultHash: canonicalSha256(withoutHash),
  };
}

/**
 * Stream the exact pulling-link linear forms in a certified integral cocycle
 * basis. This is the bridge used by a hyperplane-arrangement search: topology
 * is built once per requested point, passed to the visitor, and then released.
 */
export function prepareStreamedTrackBLinearLinkTemplateStreamer(
  options: StreamedTrackBLinearTemplatePreparationOptions,
): StreamedTrackBPreparedLinearTemplateStreamer {
  const wallSigns = Object.fromEntries(
    options.oracle.walls.walls.map((wall) => [wall.id, 1 as const]),
  );
  const source = prepareTrackBSource({
    oracle: options.oracle,
    candidate: {
      id: "track-b-linear-template-source",
      wallSigns,
    },
    generalizedCompression: options.generalizedCompression,
    ...(options.generalizedCompressionReplayOptions
      ? {
          generalizedCompressionReplayOptions:
            options.generalizedCompressionReplayOptions,
        }
      : {}),
    offsetPolarity: 1,
    linkScan: "stop-on-first-failure",
    maxLinkWitnesses: 0,
  });
  const cocycleBasis = packIntegralCocycleBasis(
    source.oracle,
    options.cocycleBasis,
  );
  let streamInvocationCount = 0;
  let streamedPointCount = 0;
  const stream = (
    request: StreamedTrackBLinearTemplateStreamRequest,
    visitor: StreamedTrackBLinearLinkTemplateVisitor,
  ): StreamedTrackBLinearTemplateStreamResult => {
    streamInvocationCount += 1;
    const points = request.points
      ? [...request.points]
      : Array.from({ length: source.oracle.degree }, (_unused, point) => point);
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (
        !Number.isInteger(point) ||
        point < 0 ||
        point >= source.oracle.degree ||
        (index > 0 && point <= points[index - 1])
      ) {
        throw new Error(
          "Requested Track B template points must be strictly increasing in-range integers.",
        );
      }
    }
    const exhaustiveAllPoints =
      points.length === source.oracle.degree &&
      points.every((point, index) => point === index);
    const includeAdjacency = request.includeAdjacency ?? true;
    const heightRuleWithoutDigest = {
      method:
        "integral-character-plus-fixed-global-point-order-offset" as const,
      offsetDenominator: 4 * source.oracle.degree,
      offsetPolarities: [-1, 1] as [-1, 1],
      clearedDifferenceFormula:
        "4*degree*dot(coefficientForm,weight)+sigma*pointDifference" as const,
      antipodalEquivalence: "(weight,sigma)~(-weight,-sigma)" as const,
    };
    const heightRule: StreamedTrackBLinearTemplateStreamResult["heightRule"] = {
      ...heightRuleWithoutDigest,
      heightRuleDigest: canonicalSha256(heightRuleWithoutDigest),
    };
    const sourceHash = canonicalSha256({
      schemaVersion: 1,
      kind: "streamed-full-k-track-b-linear-link-source",
      oracleStructureHash: source.oracle.structureHash,
      actionRowsCanonicalSha256: source.oracle.actionRowsCanonicalSha256,
      generalizedCompressionArchiveHash:
        source.source.generalizedCompressionArchiveHash,
      fullCellSetDigest: source.staticData.fullCellSetDigest,
      latticeBasisDigest: cocycleBasis.latticeBasisDigest,
      cocycleSectionDigest: cocycleBasis.cocycleSectionDigest,
      cocycleClosureDigest: cocycleBasis.cocycleClosureDigest,
      coordinateIds: cocycleBasis.coordinateIds,
      heightRuleDigest: heightRule.heightRuleDigest,
    });
    const errors = uniqueSortedStrings([
      ...source.errors,
      ...cocycleBasis.errors,
    ]);
    const templateChunkHashes: string[] = [];
    let templateRecords: Array<[number, string]> = [];
    let checkedPointCount = 0;
    let visitorStopped = false;
    if (errors.length === 0) {
      for (const point of points) {
        try {
          const topology = buildPullingLinkTopology(
            source,
            point,
            cocycleBasis,
            includeAdjacency,
          );
          const germs: StreamedTrackBLinearLinkGerm[] = topology.germs.map(
            (germ) => ({
              id: germ.id,
              otherPoint: germ.otherPoint,
              pointDifference: germ.otherPoint - topology.point,
              supportCellId: germ.supportCellId,
              coefficientPairs: germ.coefficientPairs.map(
                ([coordinateIndex, coefficient]) => {
                  if (!Number.isSafeInteger(coefficient)) {
                    throw new Error(
                      `${germ.id} has a coefficient beyond the proved exact packing bound.`,
                    );
                  }
                  return [coordinateIndex, coefficient.toString()];
                },
              ),
            }),
          );
          const templateWithoutDigest = {
            point: topology.point,
            maximalCellCount: topology.maximalCellCount,
            germs,
            adjacencyIncluded: includeAdjacency,
            edges: topology.edges,
            topologyDigest: topology.topologyDigest,
          };
          const templateDigest = canonicalSha256({
            schemaVersion: 1,
            method: "exact-integral-pulling-link-linear-template",
            sourceHash,
            ...templateWithoutDigest,
          });
          const template: StreamedTrackBLinearLinkTemplate = {
            ...templateWithoutDigest,
            adjacency: topology.adjacency,
            templateDigest,
          };
          const visitorDecision = visitor(template);
          checkedPointCount += 1;
          templateRecords.push([point, templateDigest]);
          if (templateRecords.length === HASH_CHUNK_SIZE) {
            templateChunkHashes.push(
              canonicalSha256({
                chunkIndex: templateChunkHashes.length,
                records: templateRecords,
              }),
            );
            templateRecords = [];
          }
          if (visitorDecision === "stop") {
            visitorStopped = true;
            break;
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
          break;
        }
      }
    }
    if (templateRecords.length > 0) {
      templateChunkHashes.push(
        canonicalSha256({
          chunkIndex: templateChunkHashes.length,
          records: templateRecords,
        }),
      );
    }
    const templateSetDigest = canonicalSha256({
      schemaVersion: 1,
      method: "streamed-integral-pulling-link-template-chunk-tree",
      sourceHash,
      requestedPoints: points,
      checkedPointCount,
      chunkSize: HASH_CHUNK_SIZE,
      chunkHashes: templateChunkHashes,
    });
    const sourceReplayed = source.errors.length === 0;
    const everyRequestedPointStreamed = checkedPointCount === points.length;
    const everyQuotientPointStreamed =
      exhaustiveAllPoints && everyRequestedPointStreamed;
    const scanOutcome =
      errors.length > 0
        ? "failed"
        : visitorStopped
          ? "visitor-stopped"
          : "exhaustive-request";
    const checks = {
      sourceReplayed,
      ...cocycleBasis.checks,
      everyRequestedPointStreamed,
      everyQuotientPointStreamed,
    };
    const result: StreamedTrackBLinearTemplateStreamResult = {
      schemaVersion: 1,
      kind: "streamed-full-k-track-b-linear-link-template-stream",
      status:
        errors.length === 0 &&
        sourceReplayed &&
        cocycleBasis.errors.length === 0 &&
        (everyRequestedPointStreamed || visitorStopped)
          ? "completed"
          : "failed",
      scanOutcome,
      sourceHash,
      oracleStructureHash: source.oracle.structureHash,
      generalizedCompressionArchiveHash:
        source.source.generalizedCompressionArchiveHash,
      latticeBasisDigest: cocycleBasis.latticeBasisDigest,
      cocycleSectionDigest: cocycleBasis.cocycleSectionDigest,
      cocycleClosureDigest: cocycleBasis.cocycleClosureDigest,
      coordinateIds: [...cocycleBasis.coordinateIds],
      coordinateCount: cocycleBasis.coordinateIds.length,
      requestedPointCount: points.length,
      checkedPointCount,
      exhaustiveAllPoints,
      adjacencyIncluded: includeAdjacency,
      maximumAbsoluteEdgeCoordinate:
        cocycleBasis.maximumAbsoluteEdgeCoordinate.toString(),
      maximumAbsoluteIntegratedCoordinateBound:
        cocycleBasis.maximumAbsoluteIntegratedCoordinateBound.toString(),
      heightRule,
      templateSetDigest,
      checks,
      errors: uniqueSortedStrings(errors),
      reportHashAlgorithm: "sha256",
      reportHash: "",
    };
    result.reportHash = computeStreamedTrackBLinearTemplateStreamHash(result);
    streamedPointCount += checkedPointCount;
    return result;
  };
  return {
    stream,
    statistics: () => ({
      preparationCount: 1,
      streamInvocationCount,
      streamedPointCount,
    }),
  };
}

export function streamStreamedTrackBLinearLinkTemplates(
  options: StreamedTrackBLinearTemplateStreamOptions,
  visitor: StreamedTrackBLinearLinkTemplateVisitor,
): StreamedTrackBLinearTemplateStreamResult {
  const streamer = prepareStreamedTrackBLinearLinkTemplateStreamer({
    oracle: options.oracle,
    generalizedCompression: options.generalizedCompression,
    ...(options.generalizedCompressionReplayOptions
      ? {
          generalizedCompressionReplayOptions:
            options.generalizedCompressionReplayOptions,
        }
      : {}),
    cocycleBasis: options.cocycleBasis,
  });
  return streamer.stream(
    {
      ...(options.points ? { points: options.points } : {}),
      ...(options.includeAdjacency === undefined
        ? {}
        : { includeAdjacency: options.includeAdjacency }),
    },
    visitor,
  );
}

/**
 * Screen many coorientations point-major. Each symbolic pulling topology is
 * built once and evaluated against every still-active sign/polarity class.
 */
export function scanStreamedTrackBCandidatesPointMajor(
  options: StreamedTrackBBatchScanOptions,
): StreamedTrackBBatchScanResult {
  const errors: string[] = [];
  if (options.candidates.length === 0) {
    throw new Error("A Track B batch scan needs at least one candidate.");
  }
  const sampleLimit = options.maxWitnesses ?? 2;
  if (!Number.isInteger(sampleLimit) || sampleLimit < 0) {
    throw new RangeError("Track B batch maxWitnesses must be nonnegative.");
  }
  const polarities = [
    ...new Set(options.offsetPolarities ?? ([1, -1] as const)),
  ].sort(compareNumbers) as Array<1 | -1>;
  if (
    polarities.length === 0 ||
    polarities.some((polarity) => polarity !== 1 && polarity !== -1)
  ) {
    throw new Error(
      "Track B batch polarities must be a nonempty subset of +/-1.",
    );
  }
  const prepared: Array<{
    candidateIndex: number;
    source: PreparedTrackBSource;
    checkedVertexCount: number;
    firstFailure?: StreamedTrackBBatchCandidateSummary["firstFailure"];
    active: boolean;
  }> = [];
  let baseSource: PreparedTrackBSource | undefined;
  try {
    baseSource = prepareTrackBSource({
      oracle: options.oracle,
      candidate: options.candidates[0],
      generalizedCompression: options.generalizedCompression,
      ...(options.generalizedCompressionReplayOptions
        ? {
            generalizedCompressionReplayOptions:
              options.generalizedCompressionReplayOptions,
          }
        : {}),
      offsetPolarity: polarities[0],
      linkScan: "stop-on-first-failure",
      maxLinkWitnesses: 1,
    });
    errors.push(...baseSource.errors);
    options.onProgress?.({ stage: "source-replay-complete" });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (baseSource) {
    for (
      let candidateIndex = 0;
      candidateIndex < options.candidates.length;
      candidateIndex += 1
    ) {
      for (const offsetPolarity of polarities) {
        try {
          const source = rebindPreparedTrackBSource(
            baseSource,
            options.candidates[candidateIndex],
            offsetPolarity,
          );
          prepared.push({
            candidateIndex,
            source,
            checkedVertexCount: 0,
            active: source.errors.length === 0,
          });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
  }
  options.onProgress?.({
    stage: "candidate-binding-complete",
    classCount: prepared.length,
  });
  let checkedPointTemplateCount = 0;
  const topologySource = prepared[0]?.source;
  if (topologySource) {
    for (let point = 0; point < topologySource.oracle.degree; point += 1) {
      if (!prepared.some((entry) => entry.active)) break;
      let topology: PullingLinkTopology;
      try {
        topology = buildPullingLinkTopology(topologySource, point);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        break;
      }
      checkedPointTemplateCount += 1;
      for (const entry of prepared) {
        if (!entry.active) continue;
        const numeric = evaluatePointTopologyNumerically(
          entry.source,
          topology,
        );
        entry.checkedVertexCount += 1;
        if (numeric.failures.length === 0) continue;
        // Compact batch reports retain an exact digest and bounded witness only
        // for the first obstruction. Passing intermediate links stay numeric.
        const evaluated = materializePointEvaluation(topology, numeric);
        const kind = evaluated.failures[0];
        const components = kind.startsWith("ascending")
          ? evaluated.ascendingComponents
          : evaluated.descendingComponents;
        entry.firstFailure = {
          point,
          kind,
          componentCount: components.length,
          componentSizes: components.map((component) => component.length),
          sampledComponents: components
            .slice(0, sampleLimit)
            .map((component) => component.slice(0, 4)),
          linkDigest: evaluated.summary.linkDigest,
          failureDigest: canonicalSha256({
            point,
            kind,
            components,
            linkDigest: evaluated.summary.linkDigest,
          }),
        };
        entry.active = false;
      }
      options.onProgress?.({
        stage: "point-template-complete",
        point,
        activeClassCount: prepared.filter((entry) => entry.active).length,
      });
    }
  }
  const summaries: StreamedTrackBBatchCandidateSummary[] = prepared.map(
    (entry) => {
      const passed =
        entry.active &&
        entry.checkedVertexCount === entry.source.oracle.degree &&
        entry.source.errors.length === 0;
      const withoutDigest = {
        candidateId: entry.source.candidate.id,
        wallSignVectorHash: entry.source.source.wallSignVectorHash,
        offsetPolarity: entry.source.offsetPolarity,
        passed,
        checkedVertexCount: entry.checkedVertexCount,
        ...(entry.firstFailure ? { firstFailure: entry.firstFailure } : {}),
      };
      return {
        ...withoutDigest,
        resultDigest: canonicalSha256({
          ...withoutDigest,
          sourceHash: entry.source.sourceHash,
        }),
      };
    },
  );
  const survivorIndices = prepared
    .map((entry, index) => ({ entry, summary: summaries[index] }))
    .filter(({ summary }) => summary.passed)
    .map(({ entry }) => ({
      candidateIndex: entry.candidateIndex,
      offsetPolarity: entry.source.offsetPolarity,
    }));
  const wallIds = topologySource?.staticData.wallIds ?? [];
  const anchorWallId = wallIds[0] ?? "";
  const signKeys = new Set(
    prepared
      .filter((entry) => entry.source.offsetPolarity === polarities[0])
      .map((entry) =>
        wallIds
          .map((wallId) => entry.source.candidate.wallSigns[wallId])
          .join(","),
      ),
  );
  const candidatesCompleteAndCanonical =
    prepared.length === options.candidates.length * polarities.length &&
    signKeys.size === options.candidates.length &&
    new Set(options.candidates.map((candidate) => candidate.id)).size ===
      options.candidates.length &&
    options.candidates.every((candidate) =>
      wallIds.every(
        (wallId) =>
          candidate.wallSigns[wallId] === 1 ||
          candidate.wallSigns[wallId] === -1,
      ),
    );
  const expectedAnchorPositiveCount =
    wallIds.length >= 1 && wallIds.length <= 30
      ? 2 ** (wallIds.length - 1)
      : -1;
  const exhaustiveAnchorPositiveSignVectors =
    expectedAnchorPositiveCount === options.candidates.length &&
    signKeys.size === expectedAnchorPositiveCount &&
    prepared
      .filter((entry) => entry.source.offsetPolarity === polarities[0])
      .every((entry) => entry.source.candidate.wallSigns[anchorWallId] === 1);
  const everyClassResolved = summaries.every(
    (summary) => summary.passed || summary.firstFailure !== undefined,
  );
  const firstFailureCountByPoint = Array.from(
    { length: checkedPointTemplateCount },
    () => 0,
  );
  for (const summary of summaries) {
    if (summary.firstFailure) {
      firstFailureCountByPoint[summary.firstFailure.point] += 1;
    }
  }
  const failureCensusDigest = canonicalSha256({
    schemaVersion: 1,
    method: "track-b-first-failure-census",
    firstFailureCountByPoint,
    failures: summaries.map((summary) => ({
      candidateId: summary.candidateId,
      wallSignVectorHash: summary.wallSignVectorHash,
      offsetPolarity: summary.offsetPolarity,
      passed: summary.passed,
      firstFailure: summary.firstFailure
        ? {
            point: summary.firstFailure.point,
            kind: summary.firstFailure.kind,
            componentSizes: summary.firstFailure.componentSizes,
            linkDigest: summary.firstFailure.linkDigest,
            failureDigest: summary.firstFailure.failureDigest,
          }
        : null,
    })),
  });
  const checks = {
    candidatesCompleteAndCanonical,
    exhaustiveAnchorPositiveSignVectors,
    pointMajorTemplatesReused: true,
    everyClassResolved,
    globalReversalQuotientSound:
      exhaustiveAnchorPositiveSignVectors &&
      polarities.length === 2 &&
      polarities.includes(1) &&
      polarities.includes(-1),
  };
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "streamed-full-k-track-b-batch-link-scan" as const,
    status: (errors.length === 0 && everyClassResolved
      ? "completed"
      : "failed") as "completed" | "failed",
    method: "point-major-symbolic-pulling-link-evaluation" as const,
    oracleStructureHash: topologySource?.oracle.structureHash ?? "",
    generalizedCompressionArchiveHash:
      options.generalizedCompression.archiveHash,
    anchorWallId,
    candidateCount: options.candidates.length,
    polarityCount: polarities.length,
    classCount: prepared.length,
    checkedPointTemplateCount,
    firstFailureCountByPoint,
    failureCensusDigest,
    summaries,
    survivorIndices,
    checks,
    errors: uniqueSortedStrings(errors),
  };
  return {
    ...withoutHash,
    reportHash: canonicalSha256(withoutHash),
  };
}

/** Recompute a batch report's canonical content hash. */
export function computeStreamedTrackBBatchReportHash(
  report: StreamedTrackBBatchScanResult,
): string {
  const withoutHash = { ...report } as Partial<StreamedTrackBBatchScanResult>;
  delete withoutHash.reportHash;
  return canonicalSha256(withoutHash);
}

/** Action-rooted replay of an all-class point-major link scan. */
export function replayStreamedTrackBBatchScan(
  options: StreamedTrackBBatchScanOptions,
  stored: StreamedTrackBBatchScanResult,
): StreamedTrackBBatchReplay {
  const errors: string[] = [];
  let storedReportHashValid = false;
  try {
    storedReportHashValid =
      stored.reportHash === computeStreamedTrackBBatchReportHash(stored);
  } catch (error) {
    errors.push(
      `The stored batch report is not canonical: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!storedReportHashValid)
    errors.push("The stored batch report hash is stale.");
  let rebuilt: StreamedTrackBBatchScanResult;
  try {
    rebuilt = scanStreamedTrackBCandidatesPointMajor(options);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      schemaVersion: 1,
      kind: "streamed-full-k-track-b-batch-replay",
      status: "failed",
      checks: {
        storedReportHashValid,
        sourceHashesMatch: false,
        actionRootedReconstructionMatches: false,
      },
      rebuiltReportHash: "",
      errors: uniqueSortedStrings(errors),
    };
  }
  const sourceHashesMatch =
    stored.oracleStructureHash === rebuilt.oracleStructureHash &&
    stored.generalizedCompressionArchiveHash ===
      rebuilt.generalizedCompressionArchiveHash &&
    stored.anchorWallId === rebuilt.anchorWallId;
  const actionRootedReconstructionMatches =
    canonicalSha256(stored) === canonicalSha256(rebuilt);
  if (!sourceHashesMatch) errors.push("The batch source envelope is stale.");
  if (!actionRootedReconstructionMatches) {
    errors.push("The batch report differs from action-rooted replay.");
  }
  const checks = {
    storedReportHashValid,
    sourceHashesMatch,
    actionRootedReconstructionMatches,
  };
  return {
    schemaVersion: 1,
    kind: "streamed-full-k-track-b-batch-replay",
    status:
      errors.length === 0 && Object.values(checks).every(Boolean)
        ? "passed"
        : "failed",
    checks,
    rebuiltReportHash: rebuilt.reportHash,
    errors: uniqueSortedStrings(errors),
  };
}
