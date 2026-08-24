import type {
  StreamedDavisCell,
  StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBIntegralCoordinate,
} from "./streamedTrackB";
import { canonicalSha256 } from "../utils/canonicalSha256";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/u;
const HASH_CHUNK_SIZE = 4096;

export type ExactCheapScreenSubdivisionFamily =
  | "pulling"
  | "maximal-simplex-stellar";

/**
 * Binding to an upstream exact action certificate.  This screen checks the
 * binding fields, not torsion-freeness itself; that remains an explicit input
 * from the first stage of the compact-action pipeline.
 */
export interface ExactCheapScreenActionBinding {
  schemaVersion: 1;
  kind: "exact-finite-coxeter-permutation-action-binding";
  status: "passed";
  upstreamCertificateKind: string;
  upstreamCertificateDigest: string;
  degree: number;
  generatorCount: number;
  actionRowsCanonicalSha256: string;
  checks: {
    exactPermutationActionVerified: true;
    coxeterRelationsVerified: true;
    torsionFreeVerified: true;
  };
  bindingDigest: string;
}

export interface ExactCheapScreenPullingOrder {
  schemaVersion: 1;
  kind: "exact-compatible-affine-pulling-order";
  id: string;
  degree: number;
  specification: {
    method: "affine-permutation-mod-degree";
    multiplier: number;
    shift: number;
  };
  rankChunkDigests: string[];
  orderDigest: string;
}

export type ExactCheapScreenPotentialSpecification =
  | { method: "zero" }
  | {
      method: "affine-centered-doubled";
      multiplier: number;
      shift: number;
      amplitude: number;
    };

export interface ExactCheapScreenPeriodicPotential {
  schemaVersion: 1;
  kind: "declared-quotient-periodic-integral-potential";
  id: string;
  degree: number;
  specification: ExactCheapScreenPotentialSpecification;
  valueChunkDigests: string[];
  potentialDigest: string;
}

export interface ExactCheapScreenCharacter {
  id: string;
  /** Coordinates in the certified integral H^1 basis. */
  coordinates: string[];
}

export interface ExactCompactActionCheapScreenBounds {
  maxSamplePoints: number;
  maxCharacters: number;
  maxOrders: number;
  maxPotentials: number;
  maxSubdivisionFamilies: number;
  maxTrials: number;
  maxSourceCellsPerPoint: number;
  maxPullingSimplicesPerSourceCell: number;
  maxOriginalLinkVerticesPerPoint: number;
  maxIntroducedCentersPerTrial: number;
}

export type ExactCheapScreenLinkFailure =
  | "ascending-empty"
  | "descending-empty"
  | "ascending-disconnected"
  | "descending-disconnected";

export interface ExactCheapScreenDirectedComplex {
  vertexIds: string[];
  maximalSimplices: string[][];
  components: string[][];
  nonempty: boolean;
  connected: boolean;
  complexDigest: string;
}

export interface ExactCheapScreenLinkVertexHeight {
  vertexId: string;
  sourceKind: "pulling-germ" | "maximal-simplex-stellar" | "source-vertex";
  mainNumerator: string;
  tertiaryTie: -1 | 0 | 1;
  sign: -1 | 1;
}

export interface ExactCheapScreenDirectedLink {
  vertexId: string;
  vertexKind: "quotient-vertex" | "maximal-simplex-stellar-center";
  sourcePoint?: number;
  sourceSimplexId?: string;
  sourceSimplexPointIds?: number[];
  fullMaximalSimplices: string[][];
  heights: ExactCheapScreenLinkVertexHeight[];
  ascending: ExactCheapScreenDirectedComplex;
  descending: ExactCheapScreenDirectedComplex;
  failures: ExactCheapScreenLinkFailure[];
  linkDigest: string;
}

export interface ExactCheapScreenTrial {
  trialId: string;
  characterId: string;
  orderId: string;
  potentialId: string;
  tiePolarity: -1 | 1;
  subdivisionFamily: ExactCheapScreenSubdivisionFamily;
  status: "evaluated" | "stopped-within-bounds";
  originalVertexLinks: ExactCheapScreenDirectedLink[];
  subdivisionVertexLinks: ExactCheapScreenDirectedLink[];
  checkedOriginalVertexCount: number;
  checkedSubdivisionVertexCount: number;
  allCheckedLinksPass: boolean;
  stopReason?: string;
  trialDigest: string;
}

export interface ExactCompactActionCheapScreenReport {
  schemaVersion: 1;
  kind: "exact-compact-action-cheap-link-screen";
  status: "completed" | "stopped-within-bounds";
  outcome:
    | "sample-pass-found"
    | "no-sample-pass-in-declared-portfolio"
    | "inconclusive-within-bounds";
  source: {
    oracleStructureHash: string;
    actionRowsCanonicalSha256: string;
    actionBindingDigest: string;
    upstreamActionCertificateDigest: string;
    degree: number;
    generatorCount: number;
    sphericalTypeCount: number;
    integralH1Rank: number;
    latticeBasisDigest: string;
    cocycleSectionDigest: string;
    cocycleVerificationDigest: string;
    heightRule: {
      method: "integral-primary-global-pulling-rank-tie";
      maximumSourceSimplexCardinality: number;
      integralScale: string;
      stellarCenterTie: "global-simplex-id-infinitesimal";
    };
  };
  declaredPortfolio: {
    characters: Array<ExactCheapScreenCharacter & { characterDigest: string }>;
    pullingOrders: ExactCheapScreenPullingOrder[];
    periodicPotentials: ExactCheapScreenPeriodicPotential[];
    requestedPointIds: number[];
    processedPointIds: number[];
    requestedCharacterIds: string[];
    processedCharacterIds: string[];
    requestedOrderIds: string[];
    processedOrderIds: string[];
    requestedPotentialIds: string[];
    processedPotentialIds: string[];
    requestedSubdivisionFamilies: ExactCheapScreenSubdivisionFamily[];
    processedSubdivisionFamilies: ExactCheapScreenSubdivisionFamily[];
    requestedTiePolarities: Array<-1 | 1>;
    requestedTrialCount: string;
    scheduledTrialCount: number;
  };
  bounds: ExactCompactActionCheapScreenBounds;
  stopReasons: string[];
  trials: ExactCheapScreenTrial[];
  passingTrialIds: string[];
  checks: {
    actionCertificateBoundToOracle: boolean;
    cocycleSectionDigestMatches: boolean;
    cocycleSectionMaterializedOnce: true;
    directedEdgesAntisymmetric: boolean;
    everyRankTwoBoundaryClosed: boolean;
    allArithmeticIntegral: true;
    pullingTriangulationsUseOneGlobalOrder: true;
    facetTriangulationsAreSharedByGlobalCellId: true;
    stellarCentersUseGlobalSimplexIds: true;
    tiePolaritiesAreExplicitAndUnique: true;
    everyEvaluatedOriginalLinkIsFullAtItsSampledVertex: boolean;
    everyEvaluatedSubdivisionLinkIsFull: boolean;
    noGlobalConclusionFromSampling: true;
  };
  nonClaims: string[];
  reportDigest: string;
}

export interface ExactCompactActionCheapScreenOptions {
  oracle: StreamedLawfulDavisOracle;
  actionBinding: ExactCheapScreenActionBinding;
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
  characters: readonly ExactCheapScreenCharacter[];
  pullingOrders: readonly ExactCheapScreenPullingOrder[];
  periodicPotentials: readonly ExactCheapScreenPeriodicPotential[];
  subdivisionFamilies: readonly ExactCheapScreenSubdivisionFamily[];
  tiePolarities: readonly (-1 | 1)[];
  /** Omit for the canonical prefix q0,... determined by maxSamplePoints. */
  samplePoints?: readonly number[];
  bounds: ExactCompactActionCheapScreenBounds;
}

export interface ExactCompactActionCheapScreenReplay {
  status: "passed" | "failed";
  checks: {
    storedReportDigestValid: boolean;
    rebuiltReportDigestMatches: boolean;
    exactReportMatches: boolean;
  };
  rebuiltReportDigest: string;
  replayDigest: string;
}

interface ExactSparseForm {
  characterPairs: Array<[number, string]>;
  potentialPairs: Array<[number, string]>;
  tieNumerator: number;
  microTie: -1 | 0 | 1;
}

interface LocalLinkVertex extends ExactSparseForm {
  id: string;
  sourceKind: "pulling-germ" | "maximal-simplex-stellar";
}

interface IntegratedSourcePoint extends ExactSparseForm {
  point: number;
}

interface LocalSourceSimplex {
  id: string;
  sourcePointIds: number[];
  germIds: string[];
  sourcePoints: IntegratedSourcePoint[];
}

interface LocalTopology {
  point: number;
  vertices: LocalLinkVertex[];
  maximalSimplices: string[][];
  sourceSimplices: LocalSourceSimplex[];
  topologyDigest: string;
}

interface PullingSimplex {
  id: string;
  vertices: number[];
}

interface TopologyCounters {
  touchedCellIds: Set<string>;
}

class CheapScreenBoundStop extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CheapScreenBoundStop";
  }
}

function requireDigest(value: string, context: string): void {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new Error(`${context} is not a lowercase SHA-256 digest.`);
  }
}

function requireSafeInteger(value: number, context: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${context} is not a safe integer.`);
  }
}

function exactCoordinate(
  value: StreamedTrackBIntegralCoordinate,
  context: string,
): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${context} is not an exact integer.`);
    }
    return BigInt(value);
  }
  if (!INTEGER_PATTERN.test(value)) {
    throw new Error(`${context} is not a canonical decimal integer.`);
  }
  return BigInt(value);
}

function gcdBigInt(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function positiveMod(value: bigint, modulus: number): number {
  const reduced = value % BigInt(modulus);
  return Number(reduced < 0n ? reduced + BigInt(modulus) : reduced);
}

function affineValue(
  point: number,
  degree: number,
  multiplier: number,
  shift: number,
): number {
  return positiveMod(
    BigInt(multiplier) * BigInt(point) + BigInt(shift),
    degree,
  );
}

function chunkDigests<T>(
  length: number,
  record: (index: number) => T,
): string[] {
  const result: string[] = [];
  for (let start = 0; start < length; start += HASH_CHUNK_SIZE) {
    const records: T[] = [];
    for (
      let index = start;
      index < Math.min(length, start + HASH_CHUNK_SIZE);
      index += 1
    ) {
      records.push(record(index));
    }
    result.push(
      canonicalSha256({
        chunkIndex: result.length,
        start,
        records,
      }),
    );
  }
  return result;
}

export function computeExactCheapScreenActionBindingDigest(
  binding: ExactCheapScreenActionBinding,
): string {
  return canonicalSha256({ ...binding, bindingDigest: "" });
}

export function validateExactCheapScreenActionBinding(
  oracle: StreamedLawfulDavisOracle,
  binding: ExactCheapScreenActionBinding,
): void {
  requireDigest(binding.upstreamCertificateDigest, "upstream certificate");
  requireDigest(binding.actionRowsCanonicalSha256, "action-row binding");
  requireDigest(binding.bindingDigest, "action binding");
  const checkNames = Object.keys(binding.checks ?? {}).sort();
  if (
    binding.schemaVersion !== 1 ||
    binding.kind !== "exact-finite-coxeter-permutation-action-binding" ||
    binding.status !== "passed" ||
    typeof binding.upstreamCertificateKind !== "string" ||
    binding.upstreamCertificateKind.length === 0 ||
    binding.degree !== oracle.degree ||
    binding.generatorCount !== oracle.generatorCount ||
    binding.actionRowsCanonicalSha256 !== oracle.actionRowsCanonicalSha256 ||
    binding.checks?.exactPermutationActionVerified !== true ||
    binding.checks?.coxeterRelationsVerified !== true ||
    binding.checks?.torsionFreeVerified !== true ||
    checkNames.join("\u0000") !==
      [
        "coxeterRelationsVerified",
        "exactPermutationActionVerified",
        "torsionFreeVerified",
      ].join("\u0000") ||
    computeExactCheapScreenActionBindingDigest(binding) !==
      binding.bindingDigest
  ) {
    throw new Error(
      "The exact action certificate is stale, incomplete, or not bound to this oracle.",
    );
  }
}

export function buildExactCheapScreenPullingOrder(
  degree: number,
  options: { id: string; multiplier: number; shift?: number },
): ExactCheapScreenPullingOrder {
  requireSafeInteger(degree, "pulling-order degree");
  requireSafeInteger(options.multiplier, "pulling-order multiplier");
  requireSafeInteger(options.shift ?? 0, "pulling-order shift");
  if (degree < 2 || typeof options.id !== "string" || options.id.length === 0) {
    throw new Error(
      "A pulling order needs a nonempty id and degree at least two.",
    );
  }
  if (gcdBigInt(BigInt(options.multiplier), BigInt(degree)) !== 1n) {
    throw new Error(
      "The affine pulling multiplier is not invertible modulo the degree.",
    );
  }
  const specification = {
    method: "affine-permutation-mod-degree" as const,
    multiplier: options.multiplier,
    shift: options.shift ?? 0,
  };
  const rankChunkDigests = chunkDigests(degree, (point) => [
    point,
    affineValue(point, degree, specification.multiplier, specification.shift),
  ]);
  const payload = {
    schemaVersion: 1 as const,
    kind: "exact-compatible-affine-pulling-order" as const,
    id: options.id,
    degree,
    specification,
    rankChunkDigests,
  };
  return { ...payload, orderDigest: canonicalSha256(payload) };
}

function pullingRank(
  order: ExactCheapScreenPullingOrder,
  point: number,
): number {
  return affineValue(
    point,
    order.degree,
    order.specification.multiplier,
    order.specification.shift,
  );
}

function validatePullingOrder(
  order: ExactCheapScreenPullingOrder,
  degree: number,
): void {
  const rebuilt = buildExactCheapScreenPullingOrder(degree, {
    id: order.id,
    multiplier: order.specification.multiplier,
    shift: order.specification.shift,
  });
  if (canonicalSha256(rebuilt) !== canonicalSha256(order)) {
    throw new Error(
      `${order.id} is not its declared deterministic pulling order.`,
    );
  }
}

export function buildExactCheapScreenPeriodicPotential(
  degree: number,
  options: {
    id: string;
    specification: ExactCheapScreenPotentialSpecification;
  },
): ExactCheapScreenPeriodicPotential {
  requireSafeInteger(degree, "periodic-potential degree");
  if (degree < 2 || typeof options.id !== "string" || options.id.length === 0) {
    throw new Error(
      "A periodic potential needs a nonempty id and degree at least two.",
    );
  }
  if (options.specification.method === "affine-centered-doubled") {
    for (const [name, value] of Object.entries(options.specification)) {
      if (name !== "method")
        requireSafeInteger(value as number, `potential ${name}`);
    }
  }
  const potentialAt = (point: number): bigint => {
    const specification = options.specification;
    if (specification.method === "zero") return 0n;
    const residue = affineValue(
      point,
      degree,
      specification.multiplier,
      specification.shift,
    );
    return (
      BigInt(specification.amplitude) *
      (2n * BigInt(residue) - BigInt(degree - 1))
    );
  };
  const valueChunkDigests = chunkDigests(degree, (point) => [
    point,
    potentialAt(point).toString(),
  ]);
  const payload = {
    schemaVersion: 1 as const,
    kind: "declared-quotient-periodic-integral-potential" as const,
    id: options.id,
    degree,
    specification: { ...options.specification },
    valueChunkDigests,
  };
  return { ...payload, potentialDigest: canonicalSha256(payload) };
}

function periodicPotentialValue(
  potential: ExactCheapScreenPeriodicPotential,
  point: number,
): bigint {
  const specification = potential.specification;
  if (specification.method === "zero") return 0n;
  const residue = affineValue(
    point,
    potential.degree,
    specification.multiplier,
    specification.shift,
  );
  return (
    BigInt(specification.amplitude) *
    (2n * BigInt(residue) - BigInt(potential.degree - 1))
  );
}

function validatePeriodicPotential(
  potential: ExactCheapScreenPeriodicPotential,
  degree: number,
): void {
  const rebuilt = buildExactCheapScreenPeriodicPotential(degree, {
    id: potential.id,
    specification: potential.specification,
  });
  if (canonicalSha256(rebuilt) !== canonicalSha256(potential)) {
    throw new Error(
      `${potential.id} is not its declared deterministic potential.`,
    );
  }
}

function canonicalPairs(
  supplied: readonly (readonly [number, StreamedTrackBIntegralCoordinate])[],
  rank: number,
  context: string,
): Array<[number, bigint]> {
  const result: Array<[number, bigint]> = [];
  let previous = -1;
  for (const [coordinate, value] of supplied) {
    if (
      !Number.isSafeInteger(coordinate) ||
      coordinate <= previous ||
      coordinate < 0 ||
      coordinate >= rank
    ) {
      throw new Error(`${context} has noncanonical coordinate indices.`);
    }
    const exact = exactCoordinate(value, `${context} coordinate ${coordinate}`);
    if (exact === 0n) throw new Error(`${context} contains an explicit zero.`);
    result.push([coordinate, exact]);
    previous = coordinate;
  }
  return result;
}

function denseEdge(
  basis: StreamedTrackBIntegralCocycleBasis,
  point: number,
  generator: number,
): bigint[] {
  const result = Array.from({ length: basis.coordinateIds.length }, () => 0n);
  for (const [coordinate, value] of canonicalPairs(
    basis.edgeCoordinatePairs(point, generator),
    result.length,
    `q${point}s${generator}`,
  )) {
    result[coordinate] = value;
  }
  return result;
}

function materializeIntegralCocycleBasis(
  oracle: StreamedLawfulDavisOracle,
  basis: StreamedTrackBIntegralCocycleBasis,
): StreamedTrackBIntegralCocycleBasis {
  const coordinateIds = [...basis.coordinateIds];
  const latticeBasisDigest = basis.latticeBasisDigest;
  const expectedCocycleSectionDigest = basis.expectedCocycleSectionDigest;
  const edgeCoordinatePairs = basis.edgeCoordinatePairs.bind(basis);
  const rank = coordinateIds.length;
  const directedEdges = Array.from(
    { length: oracle.degree * oracle.generatorCount },
    () => [] as Array<readonly [number, StreamedTrackBIntegralCoordinate]>,
  );
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const index = point * oracle.generatorCount + generator;
      directedEdges[index] = canonicalPairs(
        edgeCoordinatePairs(point, generator),
        rank,
        `q${point}s${generator}`,
      ).map(([coordinate, value]) => [coordinate, value.toString()] as const);
    }
  }
  return {
    coordinateIds,
    latticeBasisDigest,
    expectedCocycleSectionDigest,
    edgeCoordinatePairs: (point, generator) =>
      directedEdges[point * oracle.generatorCount + generator].map(
        ([coordinate, value]) => [coordinate, value] as const,
      ),
  };
}

function verifyIntegralCocycleBasis(options: {
  oracle: StreamedLawfulDavisOracle;
  basis: StreamedTrackBIntegralCocycleBasis;
}): {
  cocycleSectionDigest: string;
  directedEdgesAntisymmetric: boolean;
  everyRankTwoBoundaryClosed: boolean;
  verificationDigest: string;
  materializedBasis: StreamedTrackBIntegralCocycleBasis;
} {
  const { oracle } = options;
  const suppliedBasis = options.basis;
  if (
    suppliedBasis.coordinateIds.length === 0 ||
    suppliedBasis.coordinateIds.some(
      (id) => typeof id !== "string" || id.length === 0,
    ) ||
    new Set(suppliedBasis.coordinateIds).size !==
      suppliedBasis.coordinateIds.length
  ) {
    throw new Error(
      "The cheap screen requires a nonempty named integral H1 basis.",
    );
  }
  requireDigest(suppliedBasis.latticeBasisDigest, "integral H1 lattice basis");
  requireDigest(suppliedBasis.expectedCocycleSectionDigest, "cocycle section");
  const basis = materializeIntegralCocycleBasis(oracle, suppliedBasis);
  const cocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(oracle, basis);
  if (cocycleSectionDigest !== basis.expectedCocycleSectionDigest) {
    throw new Error(
      "The integral cocycle section does not match its certified digest.",
    );
  }
  let directedEdgesAntisymmetric = true;
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const target = oracle.neighbor(point, generator);
      const forward = denseEdge(basis, point, generator);
      const reverse = denseEdge(basis, target, generator);
      if (forward.some((value, index) => value !== -reverse[index])) {
        directedEdgesAntisymmetric = false;
      }
    }
  }
  let everyRankTwoBoundaryClosed = true;
  let checkedRankTwoCellCount = 0;
  oracle.forEachRankTwoCell((cell) => {
    checkedRankTwoCellCount += 1;
    const sums = Array.from({ length: basis.coordinateIds.length }, () => 0n);
    for (const occurrence of cell.boundary) {
      const edge = denseEdge(
        basis,
        occurrence.sourcePoint,
        occurrence.generator,
      );
      for (let coordinate = 0; coordinate < sums.length; coordinate += 1) {
        sums[coordinate] += edge[coordinate];
      }
    }
    if (sums.some((sum) => sum !== 0n)) everyRankTwoBoundaryClosed = false;
  });
  if (!directedEdgesAntisymmetric || !everyRankTwoBoundaryClosed) {
    throw new Error(
      "The supplied integral section is not a closed antisymmetric cocycle.",
    );
  }
  const verificationDigest = canonicalSha256({
    schemaVersion: 1,
    method:
      "exact-bigint-once-materialized-directed-edge-and-rank-two-cocycle-replay",
    oracleStructureHash: oracle.structureHash,
    coordinateIds: [...basis.coordinateIds],
    latticeBasisDigest: basis.latticeBasisDigest,
    cocycleSectionDigest,
    directedEdgeCount: oracle.degree * oracle.generatorCount,
    checkedRankTwoCellCount,
    directedEdgesAntisymmetric,
    everyRankTwoBoundaryClosed,
  });
  return {
    cocycleSectionDigest,
    directedEdgesAntisymmetric,
    everyRankTwoBoundaryClosed,
    verificationDigest,
    materializedBasis: basis,
  };
}

function densePairs(values: readonly bigint[]): Array<[number, string]> {
  const result: Array<[number, string]> = [];
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== 0n) result.push([index, values[index].toString()]);
  }
  return result;
}

function mapPairs(
  values: ReadonlyMap<number, bigint>,
): Array<[number, string]> {
  return [...values.entries()]
    .filter(([, value]) => value !== 0n)
    .sort(([left], [right]) => left - right)
    .map(([point, value]) => [point, value.toString()]);
}

function subset(left: readonly number[], right: ReadonlySet<number>): boolean {
  return left.every((value) => right.has(value));
}

function stellarCenterId(globalSimplexId: string): string {
  return `exact-cheap-screen:stellar-center:${globalSimplexId}`;
}

function stellarMicroTie(id: string): -1 | 1 {
  return Number.parseInt(canonicalSha256(id).slice(0, 2), 16) % 2 === 0
    ? -1
    : 1;
}

function createTopologyBuilder(options: {
  oracle: StreamedLawfulDavisOracle;
  basis: StreamedTrackBIntegralCocycleBasis;
  order: ExactCheapScreenPullingOrder;
  bounds: ExactCompactActionCheapScreenBounds;
}): (
  point: number,
  family: ExactCheapScreenSubdivisionFamily,
) => LocalTopology {
  const { oracle, basis, order, bounds } = options;
  const rank = basis.coordinateIds.length;
  const maximalTypeIndices = oracle.sphericalTypes
    .filter((type) => type.dimension > 0)
    .filter(
      (type) =>
        !oracle.sphericalTypes.some(
          (other) =>
            other.dimension > type.dimension &&
            subset(type.generators, new Set(other.generators)),
        ),
    )
    .map((type) => type.typeIndex)
    .sort((left, right) => left - right);
  if (maximalTypeIndices.length === 0) {
    throw new Error(
      "The action has no positive-dimensional spherical source cells.",
    );
  }
  const verticesByCell = new Map<string, number[]>();
  const facetsByCell = new Map<string, StreamedDavisCell[]>();
  const triangulationByCell = new Map<string, PullingSimplex[]>();
  const topologyCache = new Map<string, LocalTopology>();

  const comparePoints = (left: number, right: number): number =>
    pullingRank(order, left) - pullingRank(order, right) || left - right;
  const touch = (
    cell: StreamedDavisCell,
    counters: TopologyCounters,
  ): string => {
    const id = oracle.cellId(cell);
    counters.touchedCellIds.add(id);
    if (counters.touchedCellIds.size > bounds.maxSourceCellsPerPoint) {
      throw new CheapScreenBoundStop("maxSourceCellsPerPoint");
    }
    return id;
  };
  const cellVertices = (
    cell: StreamedDavisCell,
    counters: TopologyCounters,
  ): number[] => {
    const id = touch(cell, counters);
    let result = verticesByCell.get(id);
    if (!result) {
      result = Array.from(oracle.cellVertices(cell)).sort(comparePoints);
      verticesByCell.set(id, result);
    }
    return result;
  };
  const facets = (
    cell: StreamedDavisCell,
    counters: TopologyCounters,
  ): StreamedDavisCell[] => {
    const id = touch(cell, counters);
    let result = facetsByCell.get(id);
    if (!result) {
      result = [];
      oracle.forEachFacet(cell, (facet) => result!.push(facet));
      result.sort((left, right) =>
        oracle.cellId(left).localeCompare(oracle.cellId(right)),
      );
      facetsByCell.set(id, result);
    }
    for (const facet of result) touch(facet, counters);
    return result;
  };
  const pullingSimplices = (
    cell: StreamedDavisCell,
    counters: TopologyCounters,
  ): PullingSimplex[] => {
    const id = touch(cell, counters);
    const cached = triangulationByCell.get(id);
    if (cached) {
      if (cached.length > bounds.maxPullingSimplicesPerSourceCell) {
        throw new CheapScreenBoundStop("maxPullingSimplicesPerSourceCell");
      }
      return cached;
    }
    const vertices = cellVertices(cell, counters);
    const byId = new Map<string, PullingSimplex>();
    if (cell.dimension === 0) {
      const simplex = {
        id: `exact-cheap-screen:pulling-simplex0:${id}:${vertices[0]}`,
        vertices: [vertices[0]],
      };
      byId.set(simplex.id, simplex);
    } else {
      const apex = vertices[0];
      for (const facet of facets(cell, counters)) {
        if (cellVertices(facet, counters).includes(apex)) continue;
        for (const faceSimplex of pullingSimplices(facet, counters)) {
          const simplexVertices = [...faceSimplex.vertices, apex].sort(
            (left, right) => left - right,
          );
          const simplex = {
            id: `exact-cheap-screen:pulling-simplex${cell.dimension}:${id}:${simplexVertices.join(",")}`,
            vertices: simplexVertices,
          };
          byId.set(simplex.id, simplex);
          if (byId.size > bounds.maxPullingSimplicesPerSourceCell) {
            throw new CheapScreenBoundStop("maxPullingSimplicesPerSourceCell");
          }
        }
      }
    }
    const result = [...byId.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    triangulationByCell.set(id, result);
    return result;
  };

  const build = (
    point: number,
    family: ExactCheapScreenSubdivisionFamily,
  ): LocalTopology => {
    const cacheKey = `${point}:${family}`;
    const cached = topologyCache.get(cacheKey);
    if (cached) return cached;
    const counters: TopologyCounters = { touchedCellIds: new Set() };
    const starCache = new Map<string, PullingSimplex[]>();
    const pullingStar = (cell: StreamedDavisCell): PullingSimplex[] => {
      const id = touch(cell, counters);
      const hit = starCache.get(id);
      if (hit) return hit;
      const vertices = cellVertices(cell, counters);
      if (!vertices.includes(point)) {
        throw new Error(`${id} does not contain sampled q${point}.`);
      }
      if (cell.dimension === 0) {
        const result = pullingSimplices(cell, counters);
        starCache.set(id, result);
        return result;
      }
      const apex = vertices[0];
      const byId = new Map<string, PullingSimplex>();
      for (const facet of facets(cell, counters)) {
        const faceVertices = cellVertices(facet, counters);
        if (faceVertices.includes(apex)) continue;
        const source =
          point === apex
            ? pullingSimplices(facet, counters)
            : faceVertices.includes(point)
              ? pullingStar(facet)
              : [];
        for (const faceSimplex of source) {
          const simplexVertices = [...faceSimplex.vertices, apex].sort(
            (left, right) => left - right,
          );
          const simplex = {
            id: `exact-cheap-screen:pulling-simplex${cell.dimension}:${id}:${simplexVertices.join(",")}`,
            vertices: simplexVertices,
          };
          byId.set(simplex.id, simplex);
          if (byId.size > bounds.maxPullingSimplicesPerSourceCell) {
            throw new CheapScreenBoundStop("maxPullingSimplicesPerSourceCell");
          }
        }
      }
      const result = [...byId.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      starCache.set(id, result);
      return result;
    };

    const coefficientCache = new Map<string, Map<number, bigint[]>>();
    const coefficients = (cell: StreamedDavisCell): Map<number, bigint[]> => {
      const id = touch(cell, counters);
      const key = `${id}\u0000q${point}`;
      const hit = coefficientCache.get(key);
      if (hit) return hit;
      const allowed = new Set(cellVertices(cell, counters));
      const result = new Map<number, bigint[]>([
        [point, Array.from({ length: rank }, () => 0n)],
      ]);
      const queue = [point];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        const currentVector = result.get(current)!;
        for (const generator of cell.generators) {
          const target = oracle.neighbor(current, generator);
          if (!allowed.has(target)) {
            throw new Error(`${id} is not closed under spherical generators.`);
          }
          const next = [...currentVector];
          for (const [coordinate, value] of canonicalPairs(
            basis.edgeCoordinatePairs(current, generator),
            rank,
            `q${current}s${generator}`,
          )) {
            next[coordinate] += value;
          }
          const existing = result.get(target);
          if (!existing) {
            result.set(target, next);
            queue.push(target);
          } else if (existing.some((value, index) => value !== next[index])) {
            throw new Error(
              `${id} has path-dependent exact cocycle integration.`,
            );
          }
        }
      }
      if (result.size !== allowed.size) {
        throw new Error(`${id} cocycle integration missed source vertices.`);
      }
      coefficientCache.set(key, result);
      return result;
    };

    const supportCache = new Map<string, StreamedDavisCell>();
    const minimalSupport = (
      ambient: StreamedDavisCell,
      otherPoint: number,
    ): StreamedDavisCell => {
      const key = `${oracle.cellId(ambient)}\u0000q${point}\u0000q${otherPoint}`;
      const hit = supportCache.get(key);
      if (hit) return hit;
      const ambientGenerators = new Set(ambient.generators);
      for (let dimension = 1; dimension <= ambient.dimension; dimension += 1) {
        const matches = new Map<string, StreamedDavisCell>();
        for (const type of oracle.sphericalTypes) {
          if (
            type.dimension !== dimension ||
            !subset(type.generators, ambientGenerators)
          ) {
            continue;
          }
          const face = oracle.cellContaining(type.typeIndex, point);
          if (cellVertices(face, counters).includes(otherPoint)) {
            matches.set(oracle.cellId(face), face);
          }
        }
        if (matches.size === 1) {
          const support = [...matches.values()][0];
          supportCache.set(key, support);
          return support;
        }
        if (matches.size > 1) {
          throw new Error(
            "A pulling edge has ambiguous minimal Coxeter-cell support.",
          );
        }
      }
      throw new Error("A pulling edge has no spherical support.");
    };

    const vertices = new Map<string, LocalLinkVertex>();
    const sourceSimplices = new Map<string, LocalSourceSimplex>();
    const maximalIds = new Set<string>();
    for (const typeIndex of maximalTypeIndices) {
      const ambient = oracle.cellContaining(typeIndex, point);
      const ambientId = oracle.cellId(ambient);
      if (maximalIds.has(ambientId)) continue;
      maximalIds.add(ambientId);
      const integrated = coefficients(ambient);
      for (const simplex of pullingStar(ambient)) {
        const sourcePointIds = [...simplex.vertices].sort(
          (left, right) => left - right,
        );
        const germIds: string[] = [];
        for (const otherPoint of sourcePointIds) {
          if (otherPoint === point) continue;
          const support = minimalSupport(ambient, otherPoint);
          const supportId = oracle.cellId(support);
          const id = `exact-cheap-screen:germ:${supportId}:q${point}:q${otherPoint}`;
          const vector = coefficients(support).get(otherPoint);
          if (!vector) throw new Error(`${id} has no integrated height form.`);
          const vertex: LocalLinkVertex = {
            id,
            sourceKind: "pulling-germ",
            characterPairs: densePairs(vector),
            potentialPairs: [
              [point, "-1"],
              [otherPoint, "1"],
            ].sort(([left], [right]) => Number(left) - Number(right)) as Array<
              [number, string]
            >,
            tieNumerator:
              pullingRank(order, otherPoint) - pullingRank(order, point),
            microTie: 0,
          };
          const existing = vertices.get(id);
          if (
            existing &&
            canonicalSha256(existing) !== canonicalSha256(vertex)
          ) {
            throw new Error(`${id} changes between incident source simplices.`);
          }
          vertices.set(id, existing ?? vertex);
          germIds.push(id);
        }
        const sourcePoints = sourcePointIds.map((sourcePoint) => {
          const vector = integrated.get(sourcePoint);
          if (!vector) throw new Error(`${simplex.id} misses q${sourcePoint}.`);
          return {
            point: sourcePoint,
            characterPairs: densePairs(vector),
            potentialPairs:
              sourcePoint === point
                ? []
                : ([
                    [point, "-1"],
                    [sourcePoint, "1"],
                  ].sort(
                    ([left], [right]) => Number(left) - Number(right),
                  ) as Array<[number, string]>),
            tieNumerator:
              pullingRank(order, sourcePoint) - pullingRank(order, point),
            microTie: 0 as const,
          };
        });
        const record: LocalSourceSimplex = {
          id: simplex.id,
          sourcePointIds,
          germIds: germIds.sort(),
          sourcePoints,
        };
        const existing = sourceSimplices.get(record.id);
        if (existing && canonicalSha256(existing) !== canonicalSha256(record)) {
          throw new Error(`${record.id} changes in the sampled star.`);
        }
        sourceSimplices.set(record.id, existing ?? record);
      }
    }
    if (vertices.size > bounds.maxOriginalLinkVerticesPerPoint) {
      throw new CheapScreenBoundStop("maxOriginalLinkVerticesPerPoint");
    }
    const localVertices = [...vertices.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const localSourceSimplices = [...sourceSimplices.values()].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    let maximalSimplices = localSourceSimplices.map((simplex) => [
      ...simplex.germIds,
    ]);
    if (family === "maximal-simplex-stellar") {
      for (const simplex of localSourceSimplices) {
        if (simplex.germIds.length === 0) {
          throw new Error(`${simplex.id} has zero-dimensional local support.`);
        }
        const character = Array.from({ length: rank }, () => 0n);
        const potential = new Map<number, bigint>();
        let tieNumerator = 0;
        for (const sourcePoint of simplex.sourcePoints) {
          for (const [coordinate, value] of sourcePoint.characterPairs) {
            character[coordinate] += BigInt(value);
          }
          for (const [potentialPoint, value] of sourcePoint.potentialPairs) {
            potential.set(
              potentialPoint,
              (potential.get(potentialPoint) ?? 0n) + BigInt(value),
            );
          }
          tieNumerator += sourcePoint.tieNumerator;
          if (!Number.isSafeInteger(tieNumerator)) {
            throw new Error(
              `${simplex.id} stellar tie numerator exceeds exact Number range.`,
            );
          }
        }
        const id = stellarCenterId(simplex.id);
        localVertices.push({
          id,
          sourceKind: "maximal-simplex-stellar",
          characterPairs: densePairs(character),
          potentialPairs: mapPairs(potential),
          tieNumerator,
          microTie: stellarMicroTie(id),
        });
      }
      const subdivided: string[][] = [];
      for (const simplex of localSourceSimplices) {
        const center = stellarCenterId(simplex.id);
        for (let omitted = 0; omitted < simplex.germIds.length; omitted += 1) {
          subdivided.push(
            [
              center,
              ...simplex.germIds.filter((_id, index) => index !== omitted),
            ].sort(),
          );
        }
      }
      maximalSimplices = subdivided;
    }
    localVertices.sort((left, right) => left.id.localeCompare(right.id));
    maximalSimplices = canonicalMaximalSimplices(maximalSimplices);
    const payload = {
      point,
      orderDigest: order.orderDigest,
      family,
      vertices: localVertices,
      maximalSimplices,
      sourceSimplices: localSourceSimplices,
      touchedSourceCellCount: counters.touchedCellIds.size,
    };
    const topology: LocalTopology = {
      point,
      vertices: localVertices,
      maximalSimplices,
      sourceSimplices: localSourceSimplices,
      topologyDigest: canonicalSha256(payload),
    };
    topologyCache.set(cacheKey, topology);
    return topology;
  };
  return build;
}

function dotSparse(
  pairs: readonly [number, string][],
  character: readonly bigint[],
): bigint {
  let total = 0n;
  for (const [coordinate, value] of pairs) {
    total += BigInt(value) * character[coordinate];
  }
  return total;
}

function potentialSparse(
  pairs: readonly [number, string][],
  potential: ExactCheapScreenPeriodicPotential,
): bigint {
  let total = 0n;
  for (const [point, value] of pairs) {
    total += BigInt(value) * periodicPotentialValue(potential, point);
  }
  return total;
}

function signOf(main: bigint, tertiaryTie: -1 | 0 | 1): -1 | 1 {
  if (main !== 0n) return main > 0n ? 1 : -1;
  if (tertiaryTie === 0) {
    throw new Error(
      "A declared exact height remains tied after all tie rules.",
    );
  }
  return tertiaryTie;
}

function canonicalMaximalSimplices(simplices: readonly string[][]): string[][] {
  const unique = new Map<string, string[]>();
  for (const simplex of simplices) {
    const sorted = [...new Set(simplex)].sort();
    if (sorted.length > 0) unique.set(sorted.join("\u0000"), sorted);
  }
  const values = [...unique.values()];
  return values
    .filter(
      (simplex) =>
        !values.some(
          (other) =>
            other.length > simplex.length &&
            simplex.every((vertex) => other.includes(vertex)),
        ),
    )
    .sort((left, right) =>
      left.join("\u0000").localeCompare(right.join("\u0000")),
    );
}

function componentsOf(
  vertices: readonly string[],
  maximalSimplices: readonly string[][],
): string[][] {
  const adjacency = new Map(
    vertices.map((vertex) => [vertex, new Set<string>()]),
  );
  for (const simplex of maximalSimplices) {
    for (let left = 0; left < simplex.length; left += 1) {
      for (let right = left + 1; right < simplex.length; right += 1) {
        adjacency.get(simplex[left])?.add(simplex[right]);
        adjacency.get(simplex[right])?.add(simplex[left]);
      }
    }
  }
  const unseen = new Set(vertices);
  const components: string[][] = [];
  for (const root of vertices) {
    if (!unseen.delete(root)) continue;
    const component = [root];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of adjacency.get(component[cursor]) ?? []) {
        if (unseen.delete(neighbor)) component.push(neighbor);
      }
    }
    component.sort();
    components.push(component);
  }
  return components;
}

function directedComplex(
  fullMaximalSimplices: readonly string[][],
  heights: readonly ExactCheapScreenLinkVertexHeight[],
  sign: -1 | 1,
): ExactCheapScreenDirectedComplex {
  const selected = new Set(
    heights
      .filter((height) => height.sign === sign)
      .map((height) => height.vertexId),
  );
  const maximalSimplices = canonicalMaximalSimplices(
    fullMaximalSimplices.map((simplex) =>
      simplex.filter((vertex) => selected.has(vertex)),
    ),
  );
  const vertexIds = [...selected].sort();
  const components = componentsOf(vertexIds, maximalSimplices);
  const payload = {
    vertexIds,
    maximalSimplices,
    components,
    nonempty: vertexIds.length > 0,
    connected: components.length === 1,
  };
  return { ...payload, complexDigest: canonicalSha256(payload) };
}

function finishLink(options: {
  vertexId: string;
  vertexKind: ExactCheapScreenDirectedLink["vertexKind"];
  sourcePoint?: number;
  sourceSimplexId?: string;
  sourceSimplexPointIds?: number[];
  fullMaximalSimplices: string[][];
  heights: ExactCheapScreenLinkVertexHeight[];
}): ExactCheapScreenDirectedLink {
  const fullMaximalSimplices = canonicalMaximalSimplices(
    options.fullMaximalSimplices,
  );
  const heights = [...options.heights].sort((left, right) =>
    left.vertexId.localeCompare(right.vertexId),
  );
  const ascending = directedComplex(fullMaximalSimplices, heights, 1);
  const descending = directedComplex(fullMaximalSimplices, heights, -1);
  const failures: ExactCheapScreenLinkFailure[] = [];
  if (!ascending.nonempty) failures.push("ascending-empty");
  else if (!ascending.connected) failures.push("ascending-disconnected");
  if (!descending.nonempty) failures.push("descending-empty");
  else if (!descending.connected) failures.push("descending-disconnected");
  const payload = {
    vertexId: options.vertexId,
    vertexKind: options.vertexKind,
    ...(options.sourcePoint === undefined
      ? {}
      : { sourcePoint: options.sourcePoint }),
    ...(options.sourceSimplexId === undefined
      ? {}
      : { sourceSimplexId: options.sourceSimplexId }),
    ...(options.sourceSimplexPointIds === undefined
      ? {}
      : { sourceSimplexPointIds: [...options.sourceSimplexPointIds] }),
    fullMaximalSimplices,
    heights,
    ascending,
    descending,
    failures,
  };
  return { ...payload, linkDigest: canonicalSha256(payload) };
}

function evaluateOriginalLink(options: {
  topology: LocalTopology;
  character: readonly bigint[];
  potential: ExactCheapScreenPeriodicPotential;
  integralScale: bigint;
  tiePolarity: -1 | 1;
}): ExactCheapScreenDirectedLink {
  const heights = options.topology.vertices.map((vertex) => {
    const integral =
      dotSparse(vertex.characterPairs, options.character) +
      potentialSparse(vertex.potentialPairs, options.potential);
    const main =
      options.integralScale * integral +
      BigInt(options.tiePolarity) * BigInt(vertex.tieNumerator);
    return {
      vertexId: vertex.id,
      sourceKind: vertex.sourceKind,
      mainNumerator: main.toString(),
      tertiaryTie: vertex.microTie,
      sign: signOf(main, vertex.microTie),
    };
  });
  return finishLink({
    vertexId: `q${options.topology.point}`,
    vertexKind: "quotient-vertex",
    sourcePoint: options.topology.point,
    fullMaximalSimplices: options.topology.maximalSimplices,
    heights,
  });
}

function evaluateCenterLink(options: {
  simplex: LocalSourceSimplex;
  character: readonly bigint[];
  potential: ExactCheapScreenPeriodicPotential;
  integralScale: bigint;
  tiePolarity: -1 | 1;
}): ExactCheapScreenDirectedLink {
  const sourceHeights = options.simplex.sourcePoints.map((sourcePoint) => {
    const integral =
      dotSparse(sourcePoint.characterPairs, options.character) +
      potentialSparse(sourcePoint.potentialPairs, options.potential);
    return (
      options.integralScale * integral +
      BigInt(options.tiePolarity) * BigInt(sourcePoint.tieNumerator)
    );
  });
  const sum = sourceHeights.reduce((total, value) => total + value, 0n);
  const center = stellarCenterId(options.simplex.id);
  const microTie = stellarMicroTie(center);
  const cardinality = BigInt(sourceHeights.length);
  const heights = options.simplex.sourcePoints.map((sourcePoint, index) => {
    const main = cardinality * sourceHeights[index] - sum;
    const tertiaryTie = -microTie as -1 | 1;
    return {
      vertexId: `q${sourcePoint.point}`,
      sourceKind: "source-vertex" as const,
      mainNumerator: main.toString(),
      tertiaryTie,
      sign: signOf(main, tertiaryTie),
    };
  });
  const sourceVertexIds = options.simplex.sourcePointIds.map(
    (point) => `q${point}`,
  );
  const fullMaximalSimplices = sourceVertexIds.map((_vertex, omitted) =>
    sourceVertexIds.filter((_candidate, index) => index !== omitted),
  );
  return finishLink({
    vertexId: center,
    vertexKind: "maximal-simplex-stellar-center",
    sourceSimplexId: options.simplex.id,
    sourceSimplexPointIds: options.simplex.sourcePointIds,
    fullMaximalSimplices,
    heights,
  });
}

function validateCharacter(
  character: ExactCheapScreenCharacter,
  rank: number,
): bigint[] {
  if (
    typeof character.id !== "string" ||
    character.id.length === 0 ||
    !Array.isArray(character.coordinates) ||
    character.coordinates.length !== rank
  ) {
    throw new Error(
      "Every cheap-screen character needs a unique id and full H1 coordinates.",
    );
  }
  const values = character.coordinates.map((value, index) =>
    exactCoordinate(value, `${character.id} coordinate ${index}`),
  );
  let divisor = 0n;
  for (const value of values) divisor = gcdBigInt(divisor, value);
  if (divisor !== 1n) {
    throw new Error(
      `${character.id} is not a primitive nonzero integral character.`,
    );
  }
  return values;
}

function uniqueById<T extends { id: string }>(
  values: readonly T[],
  context: string,
): T[] {
  const sorted = [...values].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  if (new Set(sorted.map((value) => value.id)).size !== sorted.length) {
    throw new Error(`${context} ids are not pairwise distinct.`);
  }
  return sorted;
}

function validateBounds(bounds: ExactCompactActionCheapScreenBounds): void {
  const expectedNames = [
    "maxCharacters",
    "maxIntroducedCentersPerTrial",
    "maxOrders",
    "maxOriginalLinkVerticesPerPoint",
    "maxPotentials",
    "maxPullingSimplicesPerSourceCell",
    "maxSamplePoints",
    "maxSourceCellsPerPoint",
    "maxSubdivisionFamilies",
    "maxTrials",
  ];
  if (
    Object.keys(bounds).sort().join("\u0000") !== expectedNames.join("\u0000")
  ) {
    throw new Error(
      "The cheap-screen bound keys are incomplete or unsupported.",
    );
  }
  for (const [name, value] of Object.entries(bounds)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
  }
}

function sealTrial(
  value: Omit<ExactCheapScreenTrial, "trialDigest">,
): ExactCheapScreenTrial {
  return { ...value, trialDigest: canonicalSha256(value) };
}

/**
 * Run a deterministic exact sampled screen.  A pass is deliberately only a
 * prioritization signal: unless every quotient vertex is requested, no global
 * directed-link claim is made, and no finite portfolio exhausts all gauges or
 * subdivisions.
 */
export function runExactCompactActionCheapScreen(
  options: ExactCompactActionCheapScreenOptions,
): ExactCompactActionCheapScreenReport {
  const { oracle, bounds } = options;
  validateBounds(bounds);
  validateExactCheapScreenActionBinding(oracle, options.actionBinding);
  const cocycle = verifyIntegralCocycleBasis({
    oracle,
    basis: options.cocycleBasis,
  });
  const cocycleBasis = cocycle.materializedBasis;
  const sourceSimplexCardinalities = oracle.sphericalTypes
    .filter((type) => type.dimension > 0)
    .map((type) => type.dimension + 1);
  if (sourceSimplexCardinalities.length === 0) {
    throw new Error(
      "The action has no positive-dimensional spherical source cells.",
    );
  }
  const maximumSourceSimplexCardinality = Math.max(
    ...sourceSimplexCardinalities,
  );
  // A stellar-center comparison can sum one rank difference per source
  // vertex.  This one global scale keeps every nonzero integral height term
  // primary throughout both the original and introduced-vertex links.
  const integralScale =
    BigInt(maximumSourceSimplexCardinality) * BigInt(oracle.degree - 1) + 1n;
  const requestedPoints = options.samplePoints
    ? [...options.samplePoints]
    : Array.from(
        { length: Math.min(oracle.degree, bounds.maxSamplePoints) },
        (_unused, point) => point,
      );
  requestedPoints.sort((left, right) => left - right);
  if (
    requestedPoints.length === 0 ||
    requestedPoints.some(
      (point, index) =>
        !Number.isSafeInteger(point) ||
        point < 0 ||
        point >= oracle.degree ||
        (index > 0 && requestedPoints[index - 1] === point),
    )
  ) {
    throw new Error(
      "Sample points must be distinct in-range quotient vertices.",
    );
  }
  const characters = uniqueById(options.characters, "character");
  const orders = uniqueById(options.pullingOrders, "pulling-order");
  const potentials = uniqueById(
    options.periodicPotentials,
    "periodic-potential",
  );
  if (
    characters.length === 0 ||
    orders.length === 0 ||
    potentials.length === 0
  ) {
    throw new Error(
      "The cheap screen needs a character, pulling order, and potential.",
    );
  }
  const characterCoordinates = new Map(
    characters.map((character) => [
      character.id,
      validateCharacter(character, cocycleBasis.coordinateIds.length),
    ]),
  );
  for (const order of orders) validatePullingOrder(order, oracle.degree);
  for (const potential of potentials)
    validatePeriodicPotential(potential, oracle.degree);
  const requestedFamilies = [...options.subdivisionFamilies].sort();
  if (
    requestedFamilies.length === 0 ||
    new Set(requestedFamilies).size !== requestedFamilies.length ||
    requestedFamilies.some(
      (family) => family !== "pulling" && family !== "maximal-simplex-stellar",
    )
  ) {
    throw new Error(
      "Subdivision families must be a nonempty unique supported list.",
    );
  }
  const requestedTiePolarities = [...options.tiePolarities].sort(
    (left, right) => left - right,
  );
  if (
    requestedTiePolarities.length === 0 ||
    new Set(requestedTiePolarities).size !== requestedTiePolarities.length ||
    requestedTiePolarities.some((polarity) => polarity !== -1 && polarity !== 1)
  ) {
    throw new Error(
      "Tie polarities must be a nonempty unique list of -1 and/or +1.",
    );
  }
  const stopReasons = new Set<string>();
  const truncate = <T>(
    values: readonly T[],
    maximum: number,
    code: string,
  ): T[] => {
    if (values.length > maximum) stopReasons.add(code);
    return values.slice(0, maximum);
  };
  const processedPoints = truncate(
    requestedPoints,
    bounds.maxSamplePoints,
    "maxSamplePoints",
  );
  const processedCharacters = truncate(
    characters,
    bounds.maxCharacters,
    "maxCharacters",
  );
  const processedOrders = truncate(orders, bounds.maxOrders, "maxOrders");
  const processedPotentials = truncate(
    potentials,
    bounds.maxPotentials,
    "maxPotentials",
  );
  const processedFamilies = truncate(
    requestedFamilies,
    bounds.maxSubdivisionFamilies,
    "maxSubdivisionFamilies",
  );
  const requestedTrialCount =
    BigInt(characters.length) *
    BigInt(orders.length) *
    BigInt(potentials.length) *
    BigInt(requestedFamilies.length) *
    BigInt(requestedTiePolarities.length);
  const scheduled =
    BigInt(processedCharacters.length) *
    BigInt(processedOrders.length) *
    BigInt(processedPotentials.length) *
    BigInt(processedFamilies.length) *
    BigInt(requestedTiePolarities.length);
  if (scheduled > BigInt(bounds.maxTrials)) stopReasons.add("maxTrials");
  const topologyBuilders = new Map<
    string,
    ReturnType<typeof createTopologyBuilder>
  >();
  const trials: ExactCheapScreenTrial[] = [];
  trialLoop: for (const character of processedCharacters) {
    for (const order of processedOrders) {
      let topologyBuilder = topologyBuilders.get(order.id);
      if (!topologyBuilder) {
        topologyBuilder = createTopologyBuilder({
          oracle,
          basis: cocycleBasis,
          order,
          bounds,
        });
        topologyBuilders.set(order.id, topologyBuilder);
      }
      for (const potential of processedPotentials) {
        for (const family of processedFamilies) {
          for (const tiePolarity of requestedTiePolarities) {
            if (trials.length >= bounds.maxTrials) break trialLoop;
            const trialIdentity = {
              characterId: character.id,
              characterCoordinates: character.coordinates,
              orderId: order.id,
              orderDigest: order.orderDigest,
              potentialId: potential.id,
              potentialDigest: potential.potentialDigest,
              tiePolarity,
              subdivisionFamily: family,
              sampledPoints: processedPoints,
              integralScale: integralScale.toString(),
            };
            const trialId = canonicalSha256(trialIdentity);
            const originalVertexLinks: ExactCheapScreenDirectedLink[] = [];
            const centers = new Map<string, ExactCheapScreenDirectedLink>();
            let stopReason: string | undefined;
            try {
              for (const point of processedPoints) {
                const topology = topologyBuilder(point, family);
                originalVertexLinks.push(
                  evaluateOriginalLink({
                    topology,
                    character: characterCoordinates.get(character.id)!,
                    potential,
                    integralScale,
                    tiePolarity,
                  }),
                );
                if (family === "maximal-simplex-stellar") {
                  for (const simplex of topology.sourceSimplices) {
                    const link = evaluateCenterLink({
                      simplex,
                      character: characterCoordinates.get(character.id)!,
                      potential,
                      integralScale,
                      tiePolarity,
                    });
                    const existing = centers.get(link.vertexId);
                    if (existing && existing.linkDigest !== link.linkDigest) {
                      throw new Error(
                        `${link.vertexId} has anchor-dependent exact center-link data.`,
                      );
                    }
                    if (
                      !existing &&
                      centers.size >= bounds.maxIntroducedCentersPerTrial
                    ) {
                      throw new CheapScreenBoundStop(
                        "maxIntroducedCentersPerTrial",
                      );
                    }
                    centers.set(link.vertexId, existing ?? link);
                  }
                }
              }
            } catch (error) {
              if (!(error instanceof CheapScreenBoundStop)) throw error;
              stopReason = error.code;
              stopReasons.add(error.code);
              // A stopped recursive triangulation can have populated only part
              // of its memo tables.  Discard the closure so later portfolio
              // trials cannot finish by accumulating work that previously lay
              // beyond the declared bound.
              topologyBuilder = createTopologyBuilder({
                oracle,
                basis: cocycleBasis,
                order,
                bounds,
              });
              topologyBuilders.set(order.id, topologyBuilder);
            }
            const subdivisionVertexLinks = [...centers.values()].sort(
              (left, right) => left.vertexId.localeCompare(right.vertexId),
            );
            const evaluatedLinks = [
              ...originalVertexLinks,
              ...subdivisionVertexLinks,
            ];
            trials.push(
              sealTrial({
                trialId,
                characterId: character.id,
                orderId: order.id,
                potentialId: potential.id,
                tiePolarity,
                subdivisionFamily: family,
                status: stopReason ? "stopped-within-bounds" : "evaluated",
                originalVertexLinks,
                subdivisionVertexLinks,
                checkedOriginalVertexCount: originalVertexLinks.length,
                checkedSubdivisionVertexCount: subdivisionVertexLinks.length,
                allCheckedLinksPass:
                  !stopReason &&
                  evaluatedLinks.every((link) => link.failures.length === 0),
                ...(stopReason ? { stopReason } : {}),
              }),
            );
          }
        }
      }
    }
  }
  const passingTrialIds = trials
    .filter(
      (trial) => trial.status === "evaluated" && trial.allCheckedLinksPass,
    )
    .map((trial) => trial.trialId);
  const stopped =
    stopReasons.size > 0 ||
    trials.some((trial) => trial.status !== "evaluated");
  const status: ExactCompactActionCheapScreenReport["status"] = stopped
    ? "stopped-within-bounds"
    : "completed";
  const outcome: ExactCompactActionCheapScreenReport["outcome"] =
    passingTrialIds.length > 0
      ? "sample-pass-found"
      : stopped
        ? "inconclusive-within-bounds"
        : "no-sample-pass-in-declared-portfolio";
  const payload = {
    schemaVersion: 1 as const,
    kind: "exact-compact-action-cheap-link-screen" as const,
    status,
    outcome,
    source: {
      oracleStructureHash: oracle.structureHash,
      actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
      actionBindingDigest: options.actionBinding.bindingDigest,
      upstreamActionCertificateDigest:
        options.actionBinding.upstreamCertificateDigest,
      degree: oracle.degree,
      generatorCount: oracle.generatorCount,
      sphericalTypeCount: oracle.sphericalTypes.length,
      integralH1Rank: cocycleBasis.coordinateIds.length,
      latticeBasisDigest: cocycleBasis.latticeBasisDigest,
      cocycleSectionDigest: cocycle.cocycleSectionDigest,
      cocycleVerificationDigest: cocycle.verificationDigest,
      heightRule: {
        method: "integral-primary-global-pulling-rank-tie" as const,
        maximumSourceSimplexCardinality,
        integralScale: integralScale.toString(),
        stellarCenterTie: "global-simplex-id-infinitesimal" as const,
      },
    },
    declaredPortfolio: {
      characters: characters.map((character) => ({
        ...character,
        characterDigest: canonicalSha256({
          method: "primitive-integral-H1-coordinate-vector",
          latticeBasisDigest: cocycleBasis.latticeBasisDigest,
          character,
        }),
      })),
      pullingOrders: orders.map((order) => ({ ...order })),
      periodicPotentials: potentials.map((potential) => ({ ...potential })),
      requestedPointIds: requestedPoints,
      processedPointIds: processedPoints,
      requestedCharacterIds: characters.map((character) => character.id),
      processedCharacterIds: processedCharacters.map(
        (character) => character.id,
      ),
      requestedOrderIds: orders.map((order) => order.id),
      processedOrderIds: processedOrders.map((order) => order.id),
      requestedPotentialIds: potentials.map((potential) => potential.id),
      processedPotentialIds: processedPotentials.map(
        (potential) => potential.id,
      ),
      requestedSubdivisionFamilies: requestedFamilies,
      processedSubdivisionFamilies: processedFamilies,
      requestedTiePolarities,
      requestedTrialCount: requestedTrialCount.toString(),
      scheduledTrialCount: Number(
        scheduled < BigInt(bounds.maxTrials)
          ? scheduled
          : BigInt(bounds.maxTrials),
      ),
    },
    bounds: { ...bounds },
    stopReasons: [...stopReasons].sort(),
    trials,
    passingTrialIds,
    checks: {
      actionCertificateBoundToOracle: true,
      cocycleSectionDigestMatches: true,
      cocycleSectionMaterializedOnce: true as const,
      directedEdgesAntisymmetric: cocycle.directedEdgesAntisymmetric,
      everyRankTwoBoundaryClosed: cocycle.everyRankTwoBoundaryClosed,
      allArithmeticIntegral: true as const,
      pullingTriangulationsUseOneGlobalOrder: true as const,
      facetTriangulationsAreSharedByGlobalCellId: true as const,
      stellarCentersUseGlobalSimplexIds: true as const,
      tiePolaritiesAreExplicitAndUnique: true as const,
      everyEvaluatedOriginalLinkIsFullAtItsSampledVertex: true,
      everyEvaluatedSubdivisionLinkIsFull: true,
      noGlobalConclusionFromSampling: true as const,
    },
    nonClaims: [
      "This screen trusts the bound upstream torsion-free certificate; it does not recompute torsion-freeness.",
      "This screen binds a supplied integral H1 lattice basis and exactly replays its edge antisymmetry and rank-two closure; it does not recompute H1 or wall-lattice saturation.",
      "A sampled pass is only a prioritization signal. It is not an exhaustive quotient-link, asphericity, contractibility, or fibering certificate.",
      "A stopped result exhausts only the explicitly recorded bounds and must not be read as a negative theorem.",
      "The implemented subdivision portfolio is exactly regular pulling and stellar subdivision at every maximal global pulling simplex; no other regular or stellar subdivisions are claimed.",
      "Subdivision-center links are computed as full simplex-boundary links with exact affine-average heights and a recorded infinitesimal tertiary tie.",
      "The sampled topology is reconstructed directly from spherical cells of the certified action oracle; this stage does not claim or require a full generalized-compression certificate.",
    ],
  };
  return { ...payload, reportDigest: canonicalSha256(payload) };
}

/** Rebuild the complete bounded computation and compare its canonical record. */
export function replayExactCompactActionCheapScreen(
  options: ExactCompactActionCheapScreenOptions,
  stored: ExactCompactActionCheapScreenReport,
): ExactCompactActionCheapScreenReplay {
  const { reportDigest: storedDigest, ...storedPayload } = stored;
  const storedReportDigestValid =
    typeof storedDigest === "string" &&
    DIGEST_PATTERN.test(storedDigest) &&
    canonicalSha256(storedPayload) === storedDigest;
  const rebuilt = runExactCompactActionCheapScreen(options);
  const rebuiltReportDigestMatches = rebuilt.reportDigest === storedDigest;
  const exactReportMatches =
    canonicalSha256(rebuilt) === canonicalSha256(stored);
  const checks = {
    storedReportDigestValid,
    rebuiltReportDigestMatches,
    exactReportMatches,
  };
  const payload = {
    schemaVersion: 1,
    method: "full-deterministic-exact-cheap-screen-rebuild",
    storedReportDigest: storedDigest,
    rebuiltReportDigest: rebuilt.reportDigest,
    checks,
  };
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks,
    rebuiltReportDigest: rebuilt.reportDigest,
    replayDigest: canonicalSha256(payload),
  };
}
