import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBIntegralCoordinate,
} from "./streamedTrackB";
import type {
  StreamedLawfulDavisOracle,
  StreamedOrientationSign,
  StreamedRankTwoCell,
} from "./streamedLawfulDavis";

const HASH_CHUNK_SIZE = 4_096;
const UINT32_SENTINEL = 0xffff_ffff;
const TARGET_WALL_COUNT = 10;
const TARGET_BASIS_RANK = 4;

/**
 * The four cotree edges used as a unimodular coordinate minor and as the
 * initially free columns in the unit-peel rank certificate. Their meaning is
 * bound to the oracle, BFS tree, and period vectors below; an id match alone
 * is never accepted.
 */
export const COMPACT_5_CUBE_H1_SEED_EDGE_IDS = [
  "bar:e:g6:q7:q78",
  "bar:e:g7:q19:q33120",
  "bar:e:g5:q19:q30690",
  "bar:e:g0:q211:q66",
] as const;

/** Coordinates of the ten wall classes in the ordered beta basis. */
export const COMPACT_5_CUBE_WALL_COORDINATES = [
  [-1, -1, 0, 0, 0, -1, 1, 0, 0, 0],
  [-1, 0, 1, 1, 0, 0, 1, 0, 0, 0],
  [1, -1, 0, 1, -1, 0, 0, 0, 0, 0],
  [0, -2, 2, 4, 0, 0, 2, 0, 0, 0],
] as const;

const BETA_DEFINITIONS = [
  {
    id: "beta0",
    numeratorWeights: [0, 0, 0, 0, 0, -1, 0, 0, 0, 0],
    divisor: 1,
    formula: "-omega5",
  },
  {
    id: "beta1",
    numeratorWeights: [0, 0, 0, -1, -1, 2, 2, 0, 0, 0],
    divisor: 1,
    formula: "-omega3-omega4+2*omega5+2*omega6",
  },
  {
    id: "beta2",
    numeratorWeights: [0, 0, 0, 0, -1, 0, 0, 0, 0, 0],
    divisor: 1,
    formula: "-omega4",
  },
  {
    id: "beta3",
    numeratorWeights: [0, 0, 0, 1, 1, -1, -1, 0, 0, 0],
    divisor: 2,
    formula: "(omega3+omega4-omega5-omega6)/2 after tree gauge",
  },
] as const;

export interface StreamedH1PeriodHistogramEntry {
  vector: number[];
  count: number;
  firstEdgeId: string;
}

export interface StreamedH1SeedColumn {
  edgeId: string;
  edgeIndex: number;
  cotreeColumn: number;
  rawWallPeriods: number[];
  betaPeriods: number[];
}

export interface StreamedH1DeterminantalDivisorProof {
  matrixShape: [number, number];
  determinantalDivisors: string[];
  smithInvariantFactors: string[];
  expectedSmithInvariantFactors: readonly ["1", "1", "1", "2"];
  verified: boolean;
}

export interface StreamedH1LatticePreparationCertificate {
  schemaVersion: 1;
  kind: "streamed-h1-lattice-preparation";
  status: "prepared";
  method: "tree-gauge-wall-saturation-and-unit-peel-core";
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  degree: number;
  wallIds: string[];
  coordinateIds: string[];
  betaDefinitions: Array<{
    id: string;
    numeratorWeights: number[];
    divisor: number;
    formula: string;
  }>;
  wallCoordinates: number[][];
  graph: {
    vertexCount: number;
    geometricEdgeCount: number;
    treeEdgeCount: number;
    cotreeEdgeCount: number;
    treeDigest: string;
    cotreeDigest: string;
  };
  periods: {
    nonzeroCotreePeriodCount: number;
    uniqueVectorCount: number;
    histogram: StreamedH1PeriodHistogramEntry[];
    histogramDigest: string;
  };
  saturation: {
    seedColumns: StreamedH1SeedColumn[];
    seedBetaDeterminant: string;
    seedDigest: string;
    rawWallRank: number;
    saturationRank: number;
    wallIndexInSaturation: string;
    quotientInvariantFactors: string[];
    determinantProof: StreamedH1DeterminantalDivisorProof;
  };
  boundary: {
    rowCount: number;
    columnCount: number;
    nonzeroCount: number;
    duplicateBoundaryEdgeCount: number;
    boundaryDigest: string;
  };
  peel: {
    seedColumnCount: number;
    pivotCount: number;
    unresolvedColumnCount: number;
    nonpivotRowCount: number;
    coreNonzeroCount: number;
    ledgerDigest: string;
    coreMatrixDigest: string;
    lowerBoundIfCoreHasFullColumnRank: number;
  };
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  preparationDigest: string;
  checks: {
    targetWallCount: boolean;
    quotientGraphConnected: boolean;
    bfsTreeHasExpectedSize: boolean;
    betaCoordinatesIntegral: boolean;
    rawWallCoordinatesVerified: boolean;
    betaCocyclesClosed: boolean;
    seedColumnsFound: boolean;
    seedMinorUnimodular: boolean;
    determinantDivisorsVerified: boolean;
    wallSaturationCertified: boolean;
    boundaryFlattenedExactly: boolean;
    peelUsesUnitPivots: boolean;
    peelPartitionComplete: boolean;
    coreBlockLowerBoundValid: boolean;
  };
  claims: string[];
  nonClaims: string[];
}

export interface StreamedH1CoreRow {
  /** Row number in the canonical all-rank-two-cell stream. */
  sourceRowIndex: number;
  /** Sparse coefficients in the canonical unresolved-core column order. */
  entries: Array<[number, StreamedOrientationSign]>;
}

export interface StreamedH1PeelPivot {
  step: number;
  sourceRowIndex: number;
  cotreeColumn: number;
  coefficient: StreamedOrientationSign;
}

export interface StreamedH1CoreColumn {
  /** Column number in the raw unresolved core consumed by rank backends. */
  coreColumn: number;
  /** Column number in the complete cotree-gauged boundary matrix. */
  cotreeColumn: number;
  /** Canonical geometric-edge index represented by the cotree column. */
  edgeIndex: number;
}

export interface StreamedH1ExactModularCoreRankWitness {
  schemaVersion: 1;
  kind: "streamed-h1-exact-modular-core-rank-witness";
  status: "passed" | "failed";
  preparationDigest: string;
  coreMatrixDigest: string;
  ledgerDigest: string;
  modulusPrime: number;
  rowCount: number;
  columnCount: number;
  rank: number;
  exactFieldArithmetic: boolean;
  backend: string;
  backendVersion: string;
  algorithm: string;
  transcriptSha256: string;
  normalizedKernelBasisSha256: string;
  identityChartColumns: number[];
  identityChartInvertible: boolean;
  normalizedBasisMatchesIntegralCoreBasis: boolean;
}

export interface StreamedH1LatticeCertificate {
  schemaVersion: 1;
  kind: "streamed-h1-lattice-certificate";
  status: "passed" | "failed";
  method: "unit-peel-block-minor-plus-exact-modular-core-rank";
  preparationDigest: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  modularRankWitness: StreamedH1ExactModularCoreRankWitness;
  checks: {
    sourceBindingMatches: boolean;
    coreBindingMatches: boolean;
    ledgerBindingMatches: boolean;
    modulusIsPrime: boolean;
    exactFieldArithmetic: boolean;
    witnessDimensionsMatch: boolean;
    coreHasFullColumnRank: boolean;
    rationalBoundaryRankHitsUpperBound: boolean;
  };
  result: {
    h1Rank: number | null;
    h1IsomorphicTo: "Z^4" | "not-certified";
    integralBasisIds: string[];
    wallCoordinates: number[][];
    wallSublatticeRank: number;
    wallSublatticeIndex: number | null;
    wallSaturationEqualsFullH1: boolean;
  };
  errors: string[];
  claims: string[];
  nonClaims: string[];
  certificateDigest: string;
}

export interface StreamedH1LatticePreparation {
  readonly certificate: StreamedH1LatticePreparationCertificate;
  /** Integral section for the saturated wall lattice; it is a full H^1 basis only after rank certification. */
  readonly wallSaturationCocycleBasis: StreamedTrackBIntegralCocycleBasis;
  forEachCoreRow(visitor: (row: StreamedH1CoreRow) => void): void;
  forEachCoreColumn(visitor: (column: StreamedH1CoreColumn) => void): void;
  forEachPeelPivot(visitor: (pivot: StreamedH1PeelPivot) => void): void;
}

interface DirectedEdgeData {
  neighbor: Uint32Array;
  edgeIndex: Uint32Array;
  canonicalTraversal: Int8Array;
  wallIndex: Uint16Array;
  wallCoefficient: Int8Array;
}

interface TreeGaugeData {
  parent: Uint32Array;
  parentGenerator: Int16Array;
  treeEdges: Uint8Array;
  rawWallPotentials: Float64Array;
  treeDigest: string;
  reachedPointCount: number;
}

interface PeriodData {
  cotreeColumnByEdge: Int32Array;
  edgeIndexByCotreeColumn: Uint32Array;
  betaByEdge: Float64Array;
  rawPeriodsByCotreeColumn: Float64Array;
  histogram: StreamedH1PeriodHistogramEntry[];
  histogramDigest: string;
  cotreeDigest: string;
  nonzeroPeriodCount: number;
  betaCoordinatesIntegral: boolean;
  rawWallCoordinatesVerified: boolean;
  seedColumns: StreamedH1SeedColumn[];
}

interface FlattenedBoundary {
  rowOffsets: Uint32Array;
  columns: Uint32Array;
  coefficients: Int8Array;
  rowCount: number;
  nonzeroCount: number;
  duplicateBoundaryEdgeCount: number;
  betaCocyclesClosed: boolean;
  boundaryDigest: string;
}

interface PeelData {
  pivotRows: Uint32Array;
  pivotColumns: Uint32Array;
  pivotCoefficients: Int8Array;
  pivotRowFlags: Uint8Array;
  coreSourceRows: Uint32Array;
  coreCotreeColumns: Uint32Array;
  coreRowOffsets: Uint32Array;
  coreColumns: Uint32Array;
  coreCoefficients: Int8Array;
  ledgerDigest: string;
  coreMatrixDigest: string;
  pivotsAreUnits: boolean;
  partitionComplete: boolean;
  blockLowerBoundValid: boolean;
}

function compareVectors(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function absoluteBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcdBigInt(left: bigint, right: bigint): bigint {
  let a = absoluteBigInt(left);
  let b = absoluteBigInt(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function determinantBigInt(matrix: readonly (readonly number[])[]): bigint {
  const size = matrix.length;
  if (size === 0) return 1n;
  if (matrix.some((row) => row.length !== size)) {
    throw new Error("A determinant requires a square matrix.");
  }
  const work = matrix.map((row) => row.map((value) => BigInt(value)));
  let sign = 1n;
  let previousPivot = 1n;
  for (let pivotIndex = 0; pivotIndex < size - 1; pivotIndex += 1) {
    let selected = pivotIndex;
    while (selected < size && work[selected][pivotIndex] === 0n) selected += 1;
    if (selected === size) return 0n;
    if (selected !== pivotIndex) {
      [work[selected], work[pivotIndex]] = [work[pivotIndex], work[selected]];
      sign = -sign;
    }
    const pivot = work[pivotIndex][pivotIndex];
    for (let row = pivotIndex + 1; row < size; row += 1) {
      for (let column = pivotIndex + 1; column < size; column += 1) {
        const numerator =
          work[row][column] * pivot -
          work[row][pivotIndex] * work[pivotIndex][column];
        if (numerator % previousPivot !== 0n) {
          throw new Error("Bareiss determinant division was not exact.");
        }
        work[row][column] = numerator / previousPivot;
      }
      work[row][pivotIndex] = 0n;
    }
    previousPivot = pivot;
  }
  return sign * work[size - 1][size - 1];
}

function combinations(size: number, count: number): number[][] {
  const result: number[][] = [];
  const current: number[] = [];
  const visit = (start: number): void => {
    if (current.length === count) {
      result.push([...current]);
      return;
    }
    const remaining = count - current.length;
    for (let value = start; value <= size - remaining; value += 1) {
      current.push(value);
      visit(value + 1);
      current.pop();
    }
  };
  visit(0);
  return result;
}

function determinantalDivisorProof(
  matrix: readonly (readonly number[])[],
): StreamedH1DeterminantalDivisorProof {
  const rowCount = matrix.length;
  const columnCount = matrix[0]?.length ?? 0;
  const rankBound = Math.min(rowCount, columnCount);
  const divisors: bigint[] = [];
  for (let size = 1; size <= rankBound; size += 1) {
    let divisor = 0n;
    for (const rows of combinations(rowCount, size)) {
      for (const columns of combinations(columnCount, size)) {
        const minor = rows.map((row) =>
          columns.map((column) => matrix[row][column]),
        );
        divisor = gcdBigInt(divisor, determinantBigInt(minor));
      }
    }
    divisors.push(divisor);
  }
  const invariantFactors = divisors.map((divisor, index) =>
    (index === 0 ? divisor : divisor / divisors[index - 1]).toString(),
  );
  const expected = ["1", "1", "1", "2"] as const;
  return {
    matrixShape: [rowCount, columnCount],
    determinantalDivisors: divisors.map(String),
    smithInvariantFactors: invariantFactors,
    expectedSmithInvariantFactors: expected,
    verified:
      invariantFactors.length === expected.length &&
      invariantFactors.every((value, index) => value === expected[index]),
  };
}

function packDirectedEdges(
  oracle: StreamedLawfulDavisOracle,
  wallIds: readonly string[],
): DirectedEdgeData {
  const wallIndexById = new Map(
    wallIds.map((wallId, wallIndex) => [wallId, wallIndex]),
  );
  const directedCount = oracle.degree * oracle.generatorCount;
  const neighbor = new Uint32Array(directedCount);
  const edgeIndex = new Uint32Array(directedCount);
  const canonicalTraversal = new Int8Array(directedCount);
  const wallIndex = new Uint16Array(directedCount);
  const wallCoefficient = new Int8Array(directedCount);
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const directedIndex = point * oracle.generatorCount + generator;
      const geometric = oracle.geometricEdge(point, generator);
      const binding = oracle.wallBinding(point, generator);
      const currentWallIndex = wallIndexById.get(binding.wallId);
      if (currentWallIndex === undefined) {
        throw new Error(
          `Unknown wall ${binding.wallId} on q${point}s${generator}.`,
        );
      }
      const traversal = geometric.sourcePoint === point ? 1 : -1;
      neighbor[directedIndex] = oracle.neighbor(point, generator);
      edgeIndex[directedIndex] = geometric.edgeIndex;
      canonicalTraversal[directedIndex] = traversal;
      wallIndex[directedIndex] = currentWallIndex;
      wallCoefficient[directedIndex] = binding.edgeParity * traversal;
    }
  }
  return {
    neighbor,
    edgeIndex,
    canonicalTraversal,
    wallIndex,
    wallCoefficient,
  };
}

function buildTreeGauge(
  oracle: StreamedLawfulDavisOracle,
  directed: DirectedEdgeData,
): TreeGaugeData {
  const parent = new Uint32Array(oracle.degree);
  parent.fill(UINT32_SENTINEL);
  const parentGenerator = new Int16Array(oracle.degree);
  parentGenerator.fill(-1);
  const treeEdges = new Uint8Array(oracle.geometricEdgeCount);
  const rawWallPotentials = new Float64Array(oracle.degree * TARGET_WALL_COUNT);
  const queue = new Uint32Array(oracle.degree);
  parent[0] = 0;
  queue[0] = 0;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const point = queue[head++];
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const directedIndex = point * oracle.generatorCount + generator;
      const target = directed.neighbor[directedIndex];
      if (parent[target] !== UINT32_SENTINEL) continue;
      parent[target] = point;
      parentGenerator[target] = generator;
      treeEdges[directed.edgeIndex[directedIndex]] = 1;
      const sourceOffset = point * TARGET_WALL_COUNT;
      const targetOffset = target * TARGET_WALL_COUNT;
      for (let wall = 0; wall < TARGET_WALL_COUNT; wall += 1) {
        rawWallPotentials[targetOffset + wall] =
          rawWallPotentials[sourceOffset + wall];
      }
      rawWallPotentials[targetOffset + directed.wallIndex[directedIndex]] +=
        directed.wallCoefficient[directedIndex];
      queue[tail++] = target;
    }
  }
  const chunks: string[] = [];
  for (let start = 0; start < oracle.degree; start += HASH_CHUNK_SIZE) {
    const end = Math.min(oracle.degree, start + HASH_CHUNK_SIZE);
    chunks.push(
      canonicalSha256({
        chunkIndex: chunks.length,
        records: Array.from({ length: end - start }, (_unused, offset) => {
          const point = start + offset;
          return [point, parent[point], parentGenerator[point]];
        }),
      }),
    );
  }
  return {
    parent,
    parentGenerator,
    treeEdges,
    rawWallPotentials,
    reachedPointCount: tail,
    treeDigest: canonicalSha256({
      schemaVersion: 1,
      method: "canonical-generator-order-bfs-tree",
      oracleStructureHash: oracle.structureHash,
      rootPoint: 0,
      chunkSize: HASH_CHUNK_SIZE,
      chunks,
    }),
  };
}

function betaVector(raw: readonly number[]): {
  values: number[];
  integral: boolean;
} {
  const values: number[] = [];
  let integral = true;
  for (const definition of BETA_DEFINITIONS) {
    const numerator = definition.numeratorWeights.reduce<number>(
      (sum, weight, wall) => sum + weight * raw[wall],
      0,
    );
    if (
      !Number.isSafeInteger(numerator) ||
      numerator % definition.divisor !== 0
    ) {
      integral = false;
    }
    values.push(numerator / definition.divisor);
  }
  return { values, integral };
}

function rawCoordinatesFromBeta(beta: readonly number[]): number[] {
  return Array.from({ length: TARGET_WALL_COUNT }, (_unused, wall) =>
    COMPACT_5_CUBE_WALL_COORDINATES.reduce<number>(
      (sum, row, coordinate) => sum + beta[coordinate] * row[wall],
      0,
    ),
  );
}

function buildPeriods(
  oracle: StreamedLawfulDavisOracle,
  directed: DirectedEdgeData,
  tree: TreeGaugeData,
): PeriodData {
  const cotreeColumnByEdge = new Int32Array(oracle.geometricEdgeCount);
  cotreeColumnByEdge.fill(-1);
  let cotreeCount = 0;
  for (let edge = 0; edge < oracle.geometricEdgeCount; edge += 1) {
    if (tree.treeEdges[edge] === 0) cotreeColumnByEdge[edge] = cotreeCount++;
  }
  const edgeIndexByCotreeColumn = new Uint32Array(cotreeCount);
  const betaByEdge = new Float64Array(
    oracle.geometricEdgeCount * TARGET_BASIS_RANK,
  );
  const rawPeriodsByCotreeColumn = new Float64Array(
    cotreeCount * TARGET_WALL_COUNT,
  );
  const histogram = new Map<
    string,
    { vector: number[]; count: number; firstEdgeId: string }
  >();
  const seedById = new Map<string, StreamedH1SeedColumn | undefined>(
    COMPACT_5_CUBE_H1_SEED_EDGE_IDS.map((edgeId) => [edgeId, undefined]),
  );
  let betaCoordinatesIntegral = true;
  let rawWallCoordinatesVerified = true;
  let nonzeroPeriodCount = 0;
  const cotreeRecords: Array<{
    cotreeColumn: number;
    edgeIndex: number;
    edgeId: string;
    raw: number[];
    beta: number[];
  }> = [];
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const directedIndex = point * oracle.generatorCount + generator;
      if (directed.canonicalTraversal[directedIndex] !== 1) continue;
      const edge = directed.edgeIndex[directedIndex];
      const cotreeColumn = cotreeColumnByEdge[edge];
      if (cotreeColumn < 0) continue;
      const geometric = oracle.geometricEdge(point, generator);
      edgeIndexByCotreeColumn[cotreeColumn] = edge;
      const raw = Array.from(
        { length: TARGET_WALL_COUNT },
        (_unused, wall) =>
          tree.rawWallPotentials[point * TARGET_WALL_COUNT + wall] -
          tree.rawWallPotentials[
            geometric.targetPoint * TARGET_WALL_COUNT + wall
          ],
      );
      raw[directed.wallIndex[directedIndex]] +=
        directed.wallCoefficient[directedIndex];
      const beta = betaVector(raw);
      betaCoordinatesIntegral &&= beta.integral;
      rawWallCoordinatesVerified &&=
        compareVectors(raw, rawCoordinatesFromBeta(beta.values)) === 0;
      for (let wall = 0; wall < TARGET_WALL_COUNT; wall += 1) {
        rawPeriodsByCotreeColumn[cotreeColumn * TARGET_WALL_COUNT + wall] =
          raw[wall];
      }
      for (
        let coordinate = 0;
        coordinate < TARGET_BASIS_RANK;
        coordinate += 1
      ) {
        betaByEdge[edge * TARGET_BASIS_RANK + coordinate] =
          beta.values[coordinate];
      }
      if (raw.some((value) => value !== 0)) nonzeroPeriodCount += 1;
      const key = raw.join(",");
      const previous = histogram.get(key);
      if (previous) previous.count += 1;
      else
        histogram.set(key, {
          vector: raw,
          count: 1,
          firstEdgeId: geometric.id,
        });
      const seedId =
        geometric.id as (typeof COMPACT_5_CUBE_H1_SEED_EDGE_IDS)[number];
      if (seedById.has(seedId)) {
        seedById.set(seedId, {
          edgeId: geometric.id,
          edgeIndex: edge,
          cotreeColumn,
          rawWallPeriods: raw,
          betaPeriods: beta.values,
        });
      }
      cotreeRecords.push({
        cotreeColumn,
        edgeIndex: edge,
        edgeId: geometric.id,
        raw,
        beta: beta.values,
      });
    }
  }
  const publicHistogram = [...histogram.values()].sort((left, right) =>
    compareVectors(left.vector, right.vector),
  );
  const seedColumns = COMPACT_5_CUBE_H1_SEED_EDGE_IDS.map((edgeId) =>
    seedById.get(edgeId),
  ).filter((value): value is StreamedH1SeedColumn => value !== undefined);
  const cotreeChunks: string[] = [];
  for (let start = 0; start < cotreeRecords.length; start += HASH_CHUNK_SIZE) {
    cotreeChunks.push(
      canonicalSha256({
        chunkIndex: cotreeChunks.length,
        records: cotreeRecords.slice(start, start + HASH_CHUNK_SIZE),
      }),
    );
  }
  return {
    cotreeColumnByEdge,
    edgeIndexByCotreeColumn,
    betaByEdge,
    rawPeriodsByCotreeColumn,
    histogram: publicHistogram,
    histogramDigest: canonicalSha256({
      schemaVersion: 1,
      method: "tree-gauged-wall-period-histogram",
      oracleStructureHash: oracle.structureHash,
      cotreeCount,
      histogram: publicHistogram,
    }),
    cotreeDigest: canonicalSha256({
      schemaVersion: 1,
      method: "canonical-cotree-period-stream",
      oracleStructureHash: oracle.structureHash,
      treeDigest: tree.treeDigest,
      chunkSize: HASH_CHUNK_SIZE,
      chunks: cotreeChunks,
    }),
    nonzeroPeriodCount,
    betaCoordinatesIntegral,
    rawWallCoordinatesVerified,
    seedColumns,
  };
}

function canonicalBoundaryEntries(
  cell: StreamedRankTwoCell,
  cotreeColumnByEdge: Int32Array,
): Array<[number, number]> {
  const sums = new Map<number, number>();
  for (const occurrence of cell.boundary) {
    const column = cotreeColumnByEdge[occurrence.edgeIndex];
    if (column < 0) continue;
    sums.set(column, (sums.get(column) ?? 0) + occurrence.traversal);
  }
  return [...sums.entries()]
    .filter(([, coefficient]) => coefficient !== 0)
    .sort((left, right) => left[0] - right[0]);
}

function flattenBoundary(
  oracle: StreamedLawfulDavisOracle,
  periods: PeriodData,
): FlattenedBoundary {
  const rowOffsets = new Uint32Array(oracle.rankTwoCellCount + 1);
  let row = 0;
  let nonzeroCount = 0;
  let duplicateBoundaryEdgeCount = 0;
  oracle.forEachRankTwoCell((cell) => {
    const entries = canonicalBoundaryEntries(cell, periods.cotreeColumnByEdge);
    if (
      new Set(cell.boundary.map((entry) => entry.edgeIndex)).size !==
      cell.boundary.length
    ) {
      duplicateBoundaryEdgeCount += 1;
    }
    nonzeroCount += entries.length;
    rowOffsets[++row] = nonzeroCount;
  });
  if (row !== oracle.rankTwoCellCount) {
    throw new Error(
      `Streamed ${row} rank-two cells; expected ${oracle.rankTwoCellCount}.`,
    );
  }
  const columns = new Uint32Array(nonzeroCount);
  const coefficients = new Int8Array(nonzeroCount);
  const chunkHashes: string[] = [];
  let records: Array<{
    row: number;
    cellId: string;
    entries: Array<[number, number]>;
  }> = [];
  let betaCocyclesClosed = true;
  row = 0;
  oracle.forEachRankTwoCell((cell) => {
    const entries = canonicalBoundaryEntries(cell, periods.cotreeColumnByEdge);
    let cursor = rowOffsets[row];
    const betaSums = new Float64Array(TARGET_BASIS_RANK);
    for (const [column, coefficient] of entries) {
      if (coefficient !== 1 && coefficient !== -1) {
        throw new Error(
          `Rank-two row ${row} has non-unit coefficient ${coefficient}.`,
        );
      }
      columns[cursor] = column;
      coefficients[cursor] = coefficient;
      const edge = periods.edgeIndexByCotreeColumn[column];
      for (
        let coordinate = 0;
        coordinate < TARGET_BASIS_RANK;
        coordinate += 1
      ) {
        betaSums[coordinate] +=
          coefficient *
          periods.betaByEdge[edge * TARGET_BASIS_RANK + coordinate];
      }
      cursor += 1;
    }
    betaCocyclesClosed &&= [...betaSums].every((value) => value === 0);
    records.push({ row, cellId: oracle.cellId(cell.cell), entries });
    if (records.length === HASH_CHUNK_SIZE) {
      chunkHashes.push(
        canonicalSha256({ chunkIndex: chunkHashes.length, records }),
      );
      records = [];
    }
    row += 1;
  });
  if (records.length > 0) {
    chunkHashes.push(
      canonicalSha256({ chunkIndex: chunkHashes.length, records }),
    );
  }
  return {
    rowOffsets,
    columns,
    coefficients,
    rowCount: row,
    nonzeroCount,
    duplicateBoundaryEdgeCount,
    betaCocyclesClosed,
    boundaryDigest: canonicalSha256({
      schemaVersion: 1,
      method: "tree-gauged-rank-two-boundary-csr",
      oracleStructureHash: oracle.structureHash,
      rowCount: row,
      columnCount: periods.edgeIndexByCotreeColumn.length,
      nonzeroCount,
      chunkSize: HASH_CHUNK_SIZE,
      chunks: chunkHashes,
    }),
  };
}

function buildPeel(
  oracle: StreamedLawfulDavisOracle,
  boundary: FlattenedBoundary,
  periods: PeriodData,
): PeelData {
  const columnCount = periods.edgeIndexByCotreeColumn.length;
  const seedFlags = new Uint8Array(columnCount);
  for (const seed of periods.seedColumns) seedFlags[seed.cotreeColumn] = 1;
  const unknownCounts = new Uint16Array(boundary.rowCount);
  const incidenceCounts = new Uint32Array(columnCount);
  for (let row = 0; row < boundary.rowCount; row += 1) {
    let unknown = 0;
    for (
      let cursor = boundary.rowOffsets[row];
      cursor < boundary.rowOffsets[row + 1];
      cursor += 1
    ) {
      const column = boundary.columns[cursor];
      if (seedFlags[column] !== 0) continue;
      unknown += 1;
      incidenceCounts[column] += 1;
    }
    unknownCounts[row] = unknown;
  }
  const incidenceOffsets = new Uint32Array(columnCount + 1);
  for (let column = 0; column < columnCount; column += 1) {
    incidenceOffsets[column + 1] =
      incidenceOffsets[column] + incidenceCounts[column];
  }
  const incidenceRows = new Uint32Array(incidenceOffsets[columnCount]);
  const incidenceCursor = incidenceOffsets.slice(0, columnCount);
  for (let row = 0; row < boundary.rowCount; row += 1) {
    for (
      let cursor = boundary.rowOffsets[row];
      cursor < boundary.rowOffsets[row + 1];
      cursor += 1
    ) {
      const column = boundary.columns[cursor];
      if (seedFlags[column] !== 0) continue;
      incidenceRows[incidenceCursor[column]++] = row;
    }
  }
  const known = seedFlags.slice();
  const queue = new Uint32Array(boundary.rowCount);
  let queueHead = 0;
  let queueTail = 0;
  for (let row = 0; row < boundary.rowCount; row += 1) {
    if (unknownCounts[row] === 1) queue[queueTail++] = row;
  }
  const pivotRowsBuffer = new Uint32Array(columnCount);
  const pivotColumnsBuffer = new Uint32Array(columnCount);
  const pivotCoefficientsBuffer = new Int8Array(columnCount);
  const pivotRowFlags = new Uint8Array(boundary.rowCount);
  let pivotCount = 0;
  let pivotsAreUnits = true;
  while (queueHead < queueTail) {
    const row = queue[queueHead++];
    if (unknownCounts[row] !== 1) continue;
    let pivotColumn = -1;
    let pivotCoefficient = 0;
    for (
      let cursor = boundary.rowOffsets[row];
      cursor < boundary.rowOffsets[row + 1];
      cursor += 1
    ) {
      const column = boundary.columns[cursor];
      if (known[column] !== 0) continue;
      pivotColumn = column;
      pivotCoefficient = boundary.coefficients[cursor];
      break;
    }
    if (pivotColumn < 0) {
      throw new Error(`Peel row ${row} has no unresolved pivot column.`);
    }
    pivotsAreUnits &&= pivotCoefficient === 1 || pivotCoefficient === -1;
    known[pivotColumn] = 1;
    pivotRowFlags[row] = 1;
    pivotRowsBuffer[pivotCount] = row;
    pivotColumnsBuffer[pivotCount] = pivotColumn;
    pivotCoefficientsBuffer[pivotCount] = pivotCoefficient;
    pivotCount += 1;
    for (
      let cursor = incidenceOffsets[pivotColumn];
      cursor < incidenceOffsets[pivotColumn + 1];
      cursor += 1
    ) {
      const incidentRow = incidenceRows[cursor];
      if (unknownCounts[incidentRow] === 0) continue;
      unknownCounts[incidentRow] -= 1;
      if (unknownCounts[incidentRow] === 1) queue[queueTail++] = incidentRow;
    }
  }
  const pivotRows = pivotRowsBuffer.slice(0, pivotCount);
  const pivotColumns = pivotColumnsBuffer.slice(0, pivotCount);
  const pivotCoefficients = pivotCoefficientsBuffer.slice(0, pivotCount);
  const coreCotreeColumnList: number[] = [];
  const coreColumnByCotree = new Int32Array(columnCount);
  coreColumnByCotree.fill(-1);
  for (let column = 0; column < columnCount; column += 1) {
    if (known[column] !== 0) continue;
    coreColumnByCotree[column] = coreCotreeColumnList.length;
    coreCotreeColumnList.push(column);
  }
  const coreSourceRowList: number[] = [];
  for (let row = 0; row < boundary.rowCount; row += 1) {
    if (pivotRowFlags[row] === 0) coreSourceRowList.push(row);
  }
  const coreSourceRows = Uint32Array.from(coreSourceRowList);
  const coreCotreeColumns = Uint32Array.from(coreCotreeColumnList);
  const coreRowOffsets = new Uint32Array(coreSourceRows.length + 1);
  let coreNonzeroCount = 0;
  for (let coreRow = 0; coreRow < coreSourceRows.length; coreRow += 1) {
    const sourceRow = coreSourceRows[coreRow];
    for (
      let cursor = boundary.rowOffsets[sourceRow];
      cursor < boundary.rowOffsets[sourceRow + 1];
      cursor += 1
    ) {
      if (coreColumnByCotree[boundary.columns[cursor]] >= 0) {
        coreNonzeroCount += 1;
      }
    }
    coreRowOffsets[coreRow + 1] = coreNonzeroCount;
  }
  const coreColumns = new Uint32Array(coreNonzeroCount);
  const coreCoefficients = new Int8Array(coreNonzeroCount);
  let coreCursor = 0;
  const coreChunkHashes: string[] = [];
  let coreRecords: Array<{
    sourceRow: number;
    entries: Array<[number, number]>;
  }> = [];
  for (let coreRow = 0; coreRow < coreSourceRows.length; coreRow += 1) {
    const sourceRow = coreSourceRows[coreRow];
    const entries: Array<[number, number]> = [];
    for (
      let cursor = boundary.rowOffsets[sourceRow];
      cursor < boundary.rowOffsets[sourceRow + 1];
      cursor += 1
    ) {
      const coreColumn = coreColumnByCotree[boundary.columns[cursor]];
      if (coreColumn < 0) continue;
      const coefficient = boundary.coefficients[cursor];
      coreColumns[coreCursor] = coreColumn;
      coreCoefficients[coreCursor] = coefficient;
      coreCursor += 1;
      entries.push([coreColumn, coefficient]);
    }
    coreRecords.push({ sourceRow, entries });
    if (coreRecords.length === HASH_CHUNK_SIZE) {
      coreChunkHashes.push(
        canonicalSha256({
          chunkIndex: coreChunkHashes.length,
          records: coreRecords,
        }),
      );
      coreRecords = [];
    }
  }
  if (coreRecords.length > 0) {
    coreChunkHashes.push(
      canonicalSha256({
        chunkIndex: coreChunkHashes.length,
        records: coreRecords,
      }),
    );
  }
  const ledgerChunkHashes: string[] = [];
  for (let start = 0; start < pivotCount; start += HASH_CHUNK_SIZE) {
    const end = Math.min(pivotCount, start + HASH_CHUNK_SIZE);
    ledgerChunkHashes.push(
      canonicalSha256({
        chunkIndex: ledgerChunkHashes.length,
        records: Array.from({ length: end - start }, (_unused, offset) => {
          const step = start + offset;
          return [
            step,
            pivotRows[step],
            pivotColumns[step],
            pivotCoefficients[step],
          ];
        }),
      }),
    );
  }
  const ledgerDigest = canonicalSha256({
    schemaVersion: 1,
    method: "chronological-unit-peel-lower-triangular-block",
    oracleStructureHash: oracle.structureHash,
    boundaryDigest: boundary.boundaryDigest,
    seedCotreeColumns: periods.seedColumns.map((seed) => seed.cotreeColumn),
    pivotCount,
    chunkSize: HASH_CHUNK_SIZE,
    chunks: ledgerChunkHashes,
  });
  const coreMatrixDigest = canonicalSha256({
    schemaVersion: 1,
    method: "raw-nonpivot-row-final-unresolved-column-core",
    oracleStructureHash: oracle.structureHash,
    boundaryDigest: boundary.boundaryDigest,
    ledgerDigest,
    rowCount: coreSourceRows.length,
    columnCount: coreCotreeColumns.length,
    nonzeroCount: coreNonzeroCount,
    chunkSize: HASH_CHUNK_SIZE,
    chunks: coreChunkHashes,
  });
  const partitionComplete =
    pivotCount + periods.seedColumns.length + coreCotreeColumns.length ===
      columnCount && pivotCount + coreSourceRows.length === boundary.rowCount;
  // This is not a Schur complement. Pivot rows are zero on every final core
  // column, so a nonsingular core minor combines with the triangular ledger
  // block to give a larger block-triangular minor of the original boundary.
  const blockLowerBoundValid = pivotsAreUnits && partitionComplete;
  return {
    pivotRows,
    pivotColumns,
    pivotCoefficients,
    pivotRowFlags,
    coreSourceRows,
    coreCotreeColumns,
    coreRowOffsets,
    coreColumns,
    coreCoefficients,
    ledgerDigest,
    coreMatrixDigest,
    pivotsAreUnits,
    partitionComplete,
    blockLowerBoundValid,
  };
}

function isPrime(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 2) return false;
  if (value % 2 === 0) return value === 2;
  for (let divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Prepare the exact integral cohomology calculation without invoking an
 * external rank backend. The returned core stream is the raw block used only
 * for a lower-bound minor; it is deliberately not described as a Schur
 * complement or a rank-preserving reduction.
 */
export function prepareStreamedH1Lattice(
  oracle: StreamedLawfulDavisOracle,
): StreamedH1LatticePreparation {
  const wallIds = oracle.walls.walls.map((wall) => wall.id);
  if (wallIds.length !== TARGET_WALL_COUNT) {
    throw new Error(
      `The compact-5-cube H^1 calculation requires ${TARGET_WALL_COUNT} canonical walls; received ${wallIds.length}.`,
    );
  }
  const directed = packDirectedEdges(oracle, wallIds);
  const tree = buildTreeGauge(oracle, directed);
  if (tree.reachedPointCount !== oracle.degree) {
    throw new Error(
      `The canonical BFS reaches ${tree.reachedPointCount}/${oracle.degree} quotient points.`,
    );
  }
  const periods = buildPeriods(oracle, directed, tree);
  const seedColumnsFound =
    periods.seedColumns.length === COMPACT_5_CUBE_H1_SEED_EDGE_IDS.length;
  if (!seedColumnsFound) {
    throw new Error(
      `Found ${periods.seedColumns.length}/${COMPACT_5_CUBE_H1_SEED_EDGE_IDS.length} canonical H^1 seed edges.`,
    );
  }
  const seedBetaDeterminant = determinantBigInt(
    periods.seedColumns.map((seed) => seed.betaPeriods),
  );
  const seedMinorUnimodular = absoluteBigInt(seedBetaDeterminant) === 1n;
  const determinantProof = determinantalDivisorProof(
    COMPACT_5_CUBE_WALL_COORDINATES,
  );
  const boundary = flattenBoundary(oracle, periods);
  const peel = buildPeel(oracle, boundary, periods);
  const treeEdgeCount = tree.treeEdges.reduce((sum, value) => sum + value, 0);
  const betaDefinitions = BETA_DEFINITIONS.map((definition) => ({
    id: definition.id,
    numeratorWeights: [...definition.numeratorWeights],
    divisor: definition.divisor,
    formula: definition.formula,
  }));
  const wallCoordinates = COMPACT_5_CUBE_WALL_COORDINATES.map((row) => [
    ...row,
  ]);
  const seedDigest = canonicalSha256({
    schemaVersion: 1,
    method: "unimodular-beta-period-seed-minor",
    oracleStructureHash: oracle.structureHash,
    seedColumns: periods.seedColumns,
    determinant: seedBetaDeterminant.toString(),
  });
  const latticeBasisDigest = canonicalSha256({
    schemaVersion: 1,
    method: "primitive-saturation-of-tree-gauged-wall-period-lattice",
    oracleStructureHash: oracle.structureHash,
    wallIds,
    coordinateIds: betaDefinitions.map((definition) => definition.id),
    betaDefinitions,
    wallCoordinates,
    treeDigest: tree.treeDigest,
    cotreeDigest: periods.cotreeDigest,
    histogramDigest: periods.histogramDigest,
    seedDigest,
    determinantProof,
    boundaryDigest: boundary.boundaryDigest,
    ledgerDigest: peel.ledgerDigest,
    coreMatrixDigest: peel.coreMatrixDigest,
  });
  const edgeCoordinatePairs = (
    point: number,
    generator: number,
  ): readonly (readonly [number, StreamedTrackBIntegralCoordinate])[] => {
    if (!Number.isInteger(point) || point < 0 || point >= oracle.degree) {
      throw new RangeError(`Cocycle point ${point} is outside the quotient.`);
    }
    if (
      !Number.isInteger(generator) ||
      generator < 0 ||
      generator >= oracle.generatorCount
    ) {
      throw new RangeError(`Cocycle generator ${generator} is out of range.`);
    }
    const directedIndex = point * oracle.generatorCount + generator;
    const edge = directed.edgeIndex[directedIndex];
    const traversal = directed.canonicalTraversal[directedIndex];
    const pairs: Array<[number, number]> = [];
    for (let coordinate = 0; coordinate < TARGET_BASIS_RANK; coordinate += 1) {
      const value =
        traversal * periods.betaByEdge[edge * TARGET_BASIS_RANK + coordinate];
      if (value !== 0) pairs.push([coordinate, value]);
    }
    return pairs;
  };
  const coordinateIds = betaDefinitions.map((definition) => definition.id);
  const cocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(oracle, {
      coordinateIds,
      edgeCoordinatePairs,
    });
  const wallSaturationCocycleBasis: StreamedTrackBIntegralCocycleBasis = {
    coordinateIds,
    latticeBasisDigest,
    expectedCocycleSectionDigest: cocycleSectionDigest,
    edgeCoordinatePairs,
  };
  const checks = {
    targetWallCount: wallIds.length === TARGET_WALL_COUNT,
    quotientGraphConnected: tree.reachedPointCount === oracle.degree,
    bfsTreeHasExpectedSize: treeEdgeCount === Math.max(0, oracle.degree - 1),
    betaCoordinatesIntegral: periods.betaCoordinatesIntegral,
    rawWallCoordinatesVerified: periods.rawWallCoordinatesVerified,
    betaCocyclesClosed: boundary.betaCocyclesClosed,
    seedColumnsFound,
    seedMinorUnimodular,
    determinantDivisorsVerified: determinantProof.verified,
    wallSaturationCertified:
      periods.betaCoordinatesIntegral &&
      periods.rawWallCoordinatesVerified &&
      boundary.betaCocyclesClosed &&
      seedMinorUnimodular &&
      determinantProof.verified,
    boundaryFlattenedExactly:
      boundary.rowCount === oracle.rankTwoCellCount &&
      boundary.rowOffsets[boundary.rowCount] === boundary.nonzeroCount,
    peelUsesUnitPivots: peel.pivotsAreUnits,
    peelPartitionComplete: peel.partitionComplete,
    coreBlockLowerBoundValid: peel.blockLowerBoundValid,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedChecks.length > 0) {
    throw new Error(
      `The streamed H^1 preparation failed: ${failedChecks.join(", ")}.`,
    );
  }
  const preparationWithoutDigest = {
    schemaVersion: 1 as const,
    kind: "streamed-h1-lattice-preparation" as const,
    status: "prepared" as const,
    method: "tree-gauge-wall-saturation-and-unit-peel-core" as const,
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    degree: oracle.degree,
    wallIds,
    coordinateIds,
    betaDefinitions,
    wallCoordinates,
    graph: {
      vertexCount: oracle.degree,
      geometricEdgeCount: oracle.geometricEdgeCount,
      treeEdgeCount,
      cotreeEdgeCount: periods.edgeIndexByCotreeColumn.length,
      treeDigest: tree.treeDigest,
      cotreeDigest: periods.cotreeDigest,
    },
    periods: {
      nonzeroCotreePeriodCount: periods.nonzeroPeriodCount,
      uniqueVectorCount: periods.histogram.length,
      histogram: periods.histogram,
      histogramDigest: periods.histogramDigest,
    },
    saturation: {
      seedColumns: periods.seedColumns,
      seedBetaDeterminant: seedBetaDeterminant.toString(),
      seedDigest,
      rawWallRank: TARGET_BASIS_RANK,
      saturationRank: TARGET_BASIS_RANK,
      wallIndexInSaturation: "2",
      quotientInvariantFactors: ["2"],
      determinantProof,
    },
    boundary: {
      rowCount: boundary.rowCount,
      columnCount: periods.edgeIndexByCotreeColumn.length,
      nonzeroCount: boundary.nonzeroCount,
      duplicateBoundaryEdgeCount: boundary.duplicateBoundaryEdgeCount,
      boundaryDigest: boundary.boundaryDigest,
    },
    peel: {
      seedColumnCount: periods.seedColumns.length,
      pivotCount: peel.pivotRows.length,
      unresolvedColumnCount: peel.coreCotreeColumns.length,
      nonpivotRowCount: peel.coreSourceRows.length,
      coreNonzeroCount: peel.coreColumns.length,
      ledgerDigest: peel.ledgerDigest,
      coreMatrixDigest: peel.coreMatrixDigest,
      lowerBoundIfCoreHasFullColumnRank:
        peel.pivotRows.length + peel.coreCotreeColumns.length,
    },
    latticeBasisDigest,
    cocycleSectionDigest,
    checks,
    claims: [
      "Tree gauge identifies integral H^1 with the integer kernel of the displayed cotree boundary matrix.",
      "The beta cocycles are an integral basis for the saturation of the ten wall classes.",
      "The ten wall classes have rank four and index two in their saturation.",
      "The complete calculation must supply the unresolved core's exact rank and saturated integral kernel frame.",
    ],
    nonClaims: [
      "Preparation alone does not certify the rank or integral kernel of the unresolved core.",
      "The raw core is a lower-bound block-minor device, not a Schur complement or a rank-preserving reduction.",
      "No Morse-link, fibering, or kernel-finiteness conclusion follows from H^1 alone.",
    ],
  };
  const preparationDigest = canonicalSha256(preparationWithoutDigest);
  const certificate: StreamedH1LatticePreparationCertificate = {
    ...preparationWithoutDigest,
    preparationDigest,
  };
  return Object.freeze({
    certificate,
    wallSaturationCocycleBasis,
    forEachCoreRow: (visitor: (row: StreamedH1CoreRow) => void): void => {
      for (
        let coreRow = 0;
        coreRow < peel.coreSourceRows.length;
        coreRow += 1
      ) {
        const entries: Array<[number, StreamedOrientationSign]> = [];
        for (
          let cursor = peel.coreRowOffsets[coreRow];
          cursor < peel.coreRowOffsets[coreRow + 1];
          cursor += 1
        ) {
          entries.push([
            peel.coreColumns[cursor],
            peel.coreCoefficients[cursor] as StreamedOrientationSign,
          ]);
        }
        visitor({ sourceRowIndex: peel.coreSourceRows[coreRow], entries });
      }
    },
    forEachCoreColumn: (
      visitor: (column: StreamedH1CoreColumn) => void,
    ): void => {
      for (
        let coreColumn = 0;
        coreColumn < peel.coreCotreeColumns.length;
        coreColumn += 1
      ) {
        const cotreeColumn = peel.coreCotreeColumns[coreColumn];
        visitor({
          coreColumn,
          cotreeColumn,
          edgeIndex: periods.edgeIndexByCotreeColumn[cotreeColumn],
        });
      }
    },
    forEachPeelPivot: (visitor: (pivot: StreamedH1PeelPivot) => void): void => {
      for (let step = 0; step < peel.pivotRows.length; step += 1) {
        visitor({
          step,
          sourceRowIndex: peel.pivotRows[step],
          cotreeColumn: peel.pivotColumns[step],
          coefficient: peel.pivotCoefficients[step] as StreamedOrientationSign,
        });
      }
    },
  });
}

/**
 * Retained only to reject legacy rank-four artifacts deterministically.
 * The residual core has exact nullity fifteen; callers must use
 * `completeStreamedH1Lattice` with its integral core frame instead.
 */
export function certifyStreamedH1Lattice(
  preparation: StreamedH1LatticePreparation,
  witness: StreamedH1ExactModularCoreRankWitness,
): StreamedH1LatticeCertificate {
  const sourceBindingMatches =
    witness.preparationDigest === preparation.certificate.preparationDigest;
  const coreBindingMatches =
    witness.coreMatrixDigest === preparation.certificate.peel.coreMatrixDigest;
  const ledgerBindingMatches =
    witness.ledgerDigest === preparation.certificate.peel.ledgerDigest;
  const modulusIsPrime = isPrime(witness.modulusPrime);
  const witnessDimensionsMatch =
    witness.rowCount === preparation.certificate.peel.nonpivotRowCount &&
    witness.columnCount === preparation.certificate.peel.unresolvedColumnCount;
  const coreHasFullColumnRank =
    witness.status === "passed" &&
    witness.rank === witness.columnCount &&
    witness.rowCount >= witness.columnCount;
  const rationalBoundaryRankHitsUpperBound =
    preparation.certificate.peel.pivotCount + witness.rank ===
    preparation.certificate.boundary.columnCount - TARGET_BASIS_RANK;
  const checks = {
    sourceBindingMatches,
    coreBindingMatches,
    ledgerBindingMatches,
    modulusIsPrime,
    exactFieldArithmetic: witness.exactFieldArithmetic,
    witnessDimensionsMatch,
    coreHasFullColumnRank,
    rationalBoundaryRankHitsUpperBound,
  };
  const errors: string[] = [];
  errors.push(
    "The former rank-four completion path is retired: the exact core has nullity fifteen. Use completeStreamedH1Lattice with the integral core frame.",
  );
  if (!/^[0-9a-f]{64}$/.test(witness.transcriptSha256)) {
    errors.push(
      "The modular-rank transcript digest is not a lowercase SHA-256 hash.",
    );
  }
  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) errors.push(`H^1 certification check failed: ${name}.`);
  }
  const passed = errors.length === 0;
  const result = {
    h1Rank: passed ? TARGET_BASIS_RANK : null,
    h1IsomorphicTo: (passed ? "Z^4" : "not-certified") as
      | "Z^4"
      | "not-certified",
    integralBasisIds: passed ? [...preparation.certificate.coordinateIds] : [],
    wallCoordinates: preparation.certificate.wallCoordinates.map((row) => [
      ...row,
    ]),
    wallSublatticeRank: TARGET_BASIS_RANK,
    wallSublatticeIndex: passed ? 2 : null,
    wallSaturationEqualsFullH1: passed,
  };
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "streamed-h1-lattice-certificate" as const,
    status: (passed ? "passed" : "failed") as "passed" | "failed",
    method: "unit-peel-block-minor-plus-exact-modular-core-rank" as const,
    preparationDigest: preparation.certificate.preparationDigest,
    latticeBasisDigest: preparation.certificate.latticeBasisDigest,
    cocycleSectionDigest: preparation.certificate.cocycleSectionDigest,
    modularRankWitness: { ...witness },
    checks,
    result,
    errors: uniqueSorted(errors),
    claims: passed
      ? [
          "H^1(G;Z) is free of rank four with the displayed beta basis.",
          "The ten wall classes span an index-two sublattice of H^1(G;Z).",
          "Their saturation is the full integral character lattice.",
        ]
      : [
          "The wall classes have a certified rank-four index-two saturation, but equality with full H^1 is not certified.",
        ],
    nonClaims: [
      "The certificate does not compute torsion in H_1(G;Z); H^1 is torsion-free independently by the universal coefficient theorem.",
      "No PL Morse or virtual-fibering conclusion follows from this lattice calculation alone.",
    ],
  };
  return {
    ...withoutDigest,
    certificateDigest: canonicalSha256(withoutDigest),
  };
}
