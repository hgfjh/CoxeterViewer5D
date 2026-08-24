import { canonicalSha256 } from "../utils/canonicalSha256";

const ALGORITHM_VERSION =
  "sparse-integral-kernel-pivot-minor-left-inverse-wall-smith-v1";
const BOUNDARY_ROW_DIGEST_CHUNK_SIZE = 4_096;

export type ScalableInteger = bigint | number | string;

export interface ScalableSparseIntegerVectorInput {
  id: string;
  entries: readonly (readonly [number, ScalableInteger])[];
}

export interface ScalableSparseIntegerMatrixInput {
  rowCount: number;
  columnCount: number;
  rows: readonly ScalableSparseIntegerVectorInput[];
}

export interface ScalableSparseIntegerMatrixReader {
  rowCount: number;
  columnCount: number;
  /** Must replay the same rows, in order, on every call. */
  forEachRow: (
    visitor: (row: ScalableSparseIntegerVectorInput, rowIndex: number) => void,
  ) => void;
}

export type ScalableSparseIntegerMatrixSource =
  | ScalableSparseIntegerMatrixInput
  | ScalableSparseIntegerMatrixReader;

export interface ScalableModularRankWitnessInput {
  prime: number;
  rank: number;
  pivotRows: readonly number[];
  pivotColumns: readonly number[];
}

export interface ScalableIntegralH1CompletionBudgets {
  maxBoundaryRows?: number;
  maxBoundaryColumns?: number;
  maxBoundaryNonzeros?: number;
  maxInputCoefficientDigits?: number;
  maxKernelNonzeros?: number;
  maxLeftInverseNonzeros?: number;
  maxWallNonzeros?: number;
  maxPivotMinorOrder?: number;
  maxModularOperations?: number;
  maxModularWorkingNonzeros?: number;
  maxWallDenseEntries?: number;
  maxSmithOperations?: number;
  maxIntermediateBitLength?: number;
  maxLeftInverseDerivationOperations?: number;
  maxLeftInverseDerivationNonzeros?: number;
}

export interface ScalableIntegralH1CompletionInput {
  schemaVersion: 1;
  source: {
    sourceDigest: string;
    preparationDigest: string;
    boundaryDigest: string;
  };
  boundary: ScalableSparseIntegerMatrixSource;
  kernelBasis: readonly ScalableSparseIntegerVectorInput[];
  integralLeftInverseRows?: readonly ScalableSparseIntegerVectorInput[];
  modularRankWitness: ScalableModularRankWitnessInput;
  walls: readonly ScalableSparseIntegerVectorInput[];
  budgets?: ScalableIntegralH1CompletionBudgets;
}

export interface ScalableSparseIntegerVector {
  id: string;
  entries: Array<[number, string]>;
}

export interface ScalableIntegralH1CompletionCertificate {
  schemaVersion: 1;
  kind: "scalable-generic-integral-h1-completion";
  status: "passed" | "incomplete" | "failed";
  method: "sparse-kernel-left-inverse-modular-minor-wall-smith";
  algorithmVersion: typeof ALGORITHM_VERSION;
  source: {
    sourceDigest: string;
    preparationDigest: string;
    expectedBoundaryDigest: string;
    computedBoundaryDigest?: string;
  };
  budgets: Required<ScalableIntegralH1CompletionBudgets>;
  boundary?: {
    rowCount: number;
    columnCount: number;
    nonzeroCount: number;
    maximumAbsoluteCoefficient: string;
  };
  h1?: {
    rank: number;
    relationRank: number;
    isomorphicTo: string;
    kernelBasisDigest: string;
    integralLeftInverseDigest: string;
    integralLeftInverseOrigin: "supplied" | "derived-row-lattice-reduction";
    leftInverseDerivation?: {
      operationCount: number;
      maximumBitLength: number;
      maximumTrackedNonzeros: number;
    };
    modularRankWitness: {
      prime: number;
      rank: number;
      pivotRows: number[];
      pivotColumns: number[];
      witnessDigest: string;
    };
    checks: {
      kernelClosed: boolean;
      integralLeftInverse: boolean;
      modularMinorNonsingular: boolean;
      modularRankMatchesKernelCodimension: boolean;
      fullRationalKernelCertified: boolean;
      primitiveIntegralKernelCertified: boolean;
      fullIntegralKernelCertified: boolean;
    };
  };
  walls?: {
    wallCount: number;
    wallRank: number;
    smithInvariantFactors: string[];
    wallIndexInSaturation: string;
    saturationRank: number;
    saturationEqualsFullH1: boolean;
    quotientByWallLattice: {
      freeRank: number;
      torsionInvariantFactors: string[];
      presentation: string;
    };
    wallClasses: Array<{
      wallId: string;
      coordinatePairs: Array<[number, string]>;
      saturationCoordinatePairs: Array<[number, string]>;
      cocycleDigest: string;
    }>;
    saturationBasis: Array<{
      id: string;
      coordinatePairs: Array<[number, string]>;
      cocycle: ScalableSparseIntegerVector;
    }>;
    wallCoordinateDigest: string;
    smithLeftTransformDigest: string;
    smithLeftInverseDigest: string;
    smithRightTransformDigest: string;
    smithRightInverseDigest: string;
    smithOperationCount: number;
    maximumSmithBitLength: number;
    checks: {
      everyWallClosed: boolean;
      wallCoordinatesReconstructCocycles: boolean;
      smithTransformsReplay: boolean;
      smithTransformsHaveIntegralInverses: boolean;
      invariantFactorsDivideSuccessors: boolean;
      saturationBasisReconstructs: boolean;
      wallSaturationCoordinatesReconstruct: boolean;
      wallSaturationCertified: boolean;
    };
  };
  checks: {
    sourceDigestsWellFormed: boolean;
    boundaryDigestMatches: boolean;
    allClaimedChecksPassed: boolean;
  };
  stopReason?: string;
  errors: string[];
  certificateDigest: string;
}

export interface ScalableIntegralH1CompletionReplay {
  schemaVersion: 1;
  kind: "scalable-generic-integral-h1-completion-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    storedDigestValid: boolean;
    exactRebuildMatches: boolean;
  };
  rebuiltCertificateDigest?: string;
  errors: string[];
  replayDigest: string;
}

interface NormalizedSparseVector {
  id: string;
  entries: Array<[number, bigint]>;
}

interface NormalizedSparseMatrix {
  rowCount: number;
  columnCount: number;
  forEachRow: (
    visitor: (row: NormalizedSparseVector, rowIndex: number) => void,
  ) => void;
}

interface SmithBudgets {
  maxSmithOperations: number;
  maxIntermediateBitLength: number;
}

interface SmithTracker {
  operations: number;
  maximumBitLength: number;
  budgets: SmithBudgets;
}

interface SmithResult {
  diagonalMatrix: bigint[][];
  diagonal: bigint[];
  rank: number;
  leftTransform: bigint[][];
  leftInverse: bigint[][];
  rightTransform: bigint[][];
  rightInverse: bigint[][];
}

const DEFAULT_BUDGETS: Required<ScalableIntegralH1CompletionBudgets> = {
  maxBoundaryRows: 5_000_000,
  maxBoundaryColumns: 2_000_000,
  maxBoundaryNonzeros: 20_000_000,
  maxInputCoefficientDigits: 5_000,
  maxKernelNonzeros: 5_000_000,
  maxLeftInverseNonzeros: 5_000_000,
  maxWallNonzeros: 5_000_000,
  maxPivotMinorOrder: 250_000,
  maxModularOperations: 100_000_000,
  maxModularWorkingNonzeros: 20_000_000,
  maxWallDenseEntries: 2_000_000,
  maxSmithOperations: 5_000_000,
  maxIntermediateBitLength: 16_384,
  maxLeftInverseDerivationOperations: 5_000_000,
  maxLeftInverseDerivationNonzeros: 20_000_000,
};

class ResourceBoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceBoundError";
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
}

function decimalDigitCount(value: string): number {
  return value.startsWith("-") ? value.length - 1 : value.length;
}

function assertCoefficientTokenWithinDigitBound(
  value: ScalableInteger,
  label: string,
  maxDecimalDigits: number,
): void {
  const encoded = typeof value === "string" ? value : value.toString();
  const digits = decimalDigitCount(encoded);
  if (digits > maxDecimalDigits) {
    throw new ResourceBoundError(
      `${label} has ${digits} decimal digits; the bound is ${maxDecimalDigits}.`,
    );
  }
}

function preflightVectorCoefficientTokens(
  vectors: readonly ScalableSparseIntegerVectorInput[],
  label: string,
  maxDecimalDigits: number,
): void {
  vectors.forEach((vector, vectorIndex) => {
    if (!Array.isArray(vector?.entries)) return;
    vector.entries.forEach((entry, entryIndex) => {
      if (!Array.isArray(entry) || entry.length !== 2) return;
      assertCoefficientTokenWithinDigitBound(
        entry[1],
        `${label} ${vectorIndex} entry ${entryIndex}`,
        maxDecimalDigits,
      );
    });
  });
}

function parseInteger(
  value: ScalableInteger,
  label: string,
  maxDecimalDigits: number,
): bigint {
  if (typeof value === "bigint") {
    assertCoefficientTokenWithinDigitBound(value, label, maxDecimalDigits);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} is not a safe integer.`);
    }
    assertCoefficientTokenWithinDigitBound(value, label, maxDecimalDigits);
    return BigInt(value);
  }
  // Check the token length before the BigInt constructor. Exact workers may
  // receive certificates from outside the browser process.
  assertCoefficientTokenWithinDigitBound(value, label, maxDecimalDigits);
  if (!/^-?(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} is not a canonical decimal integer.`);
  }
  return BigInt(value);
}

function normalizeVector(
  input: ScalableSparseIntegerVectorInput,
  dimension: number,
  label: string,
  maxDecimalDigits: number,
): NormalizedSparseVector {
  if (typeof input.id !== "string" || input.id.length === 0) {
    throw new Error(`${label} must have a nonempty id.`);
  }
  const accumulated = new Map<number, bigint>();
  for (let entry = 0; entry < input.entries.length; entry += 1) {
    const pair = input.entries[entry];
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`${label} entry ${entry} is not an index-value pair.`);
    }
    const index = pair[0];
    assertNonnegativeInteger(index, `${label} entry ${entry} index`);
    if (index >= dimension) {
      throw new Error(
        `${label} entry ${entry} index ${index} exceeds dimension ${dimension}.`,
      );
    }
    const value = parseInteger(
      pair[1],
      `${label} entry ${entry}`,
      maxDecimalDigits,
    );
    accumulated.set(index, (accumulated.get(index) ?? 0n) + value);
  }
  return {
    id: input.id,
    entries: [...accumulated.entries()]
      .filter((entry) => entry[1] !== 0n)
      .sort((left, right) => left[0] - right[0]),
  };
}

function normalizeMatrix(
  input: ScalableSparseIntegerMatrixSource,
  budgets: Pick<
    Required<ScalableIntegralH1CompletionBudgets>,
    "maxBoundaryRows" | "maxBoundaryColumns" | "maxInputCoefficientDigits"
  > = DEFAULT_BUDGETS,
): NormalizedSparseMatrix {
  assertNonnegativeInteger(input.rowCount, "Boundary row count");
  assertNonnegativeInteger(input.columnCount, "Boundary column count");
  if (input.rowCount > budgets.maxBoundaryRows) {
    throw new ResourceBoundError(
      `Boundary has ${input.rowCount} rows; the bound is ${budgets.maxBoundaryRows}.`,
    );
  }
  if (input.columnCount > budgets.maxBoundaryColumns) {
    throw new ResourceBoundError(
      `Boundary has ${input.columnCount} columns; the bound is ${budgets.maxBoundaryColumns}.`,
    );
  }
  let sourceForEach: (
    visitor: (row: ScalableSparseIntegerVectorInput, rowIndex: number) => void,
  ) => void;
  if ("rows" in input) {
    if (input.rows.length !== input.rowCount) {
      throw new Error(
        `Boundary declares ${input.rowCount} rows but supplies ${input.rows.length}.`,
      );
    }
    const inMemoryRows = input.rows;
    sourceForEach = (visitor): void => {
      inMemoryRows.forEach(visitor);
    };
  } else {
    const reader = input;
    sourceForEach = (visitor): void => {
      reader.forEachRow(visitor);
    };
  }
  let referenceChunkDigests: string[] | null = null;
  return {
    rowCount: input.rowCount,
    columnCount: input.columnCount,
    forEachRow: (visitor): void => {
      let visited = 0;
      const replayedChunkDigests: string[] = [];
      let chunkRowDigests: string[] = [];
      const finishChunk = (): void => {
        if (chunkRowDigests.length === 0) return;
        const chunkIndex = replayedChunkDigests.length;
        const chunkDigest = canonicalSha256({
          chunkIndex,
          start: chunkIndex * BOUNDARY_ROW_DIGEST_CHUNK_SIZE,
          rowDigests: chunkRowDigests,
        });
        replayedChunkDigests.push(chunkDigest);
        if (
          referenceChunkDigests !== null &&
          referenceChunkDigests[chunkIndex] !== chunkDigest
        ) {
          throw new Error(
            `Boundary reader changed row chunk ${chunkIndex} between exact replay passes.`,
          );
        }
        chunkRowDigests = [];
      };
      sourceForEach((row, rowIndex) => {
        if (rowIndex !== visited) {
          throw new Error(
            `Boundary reader emitted row index ${rowIndex}; expected ${visited}.`,
          );
        }
        const normalized = normalizeVector(
          row,
          input.columnCount,
          `Boundary row ${rowIndex}`,
          budgets.maxInputCoefficientDigits,
        );
        const rowDigest = canonicalSha256(serializableVector(normalized));
        chunkRowDigests.push(rowDigest);
        if (chunkRowDigests.length === BOUNDARY_ROW_DIGEST_CHUNK_SIZE) {
          finishChunk();
        }
        visitor(normalized, rowIndex);
        visited += 1;
      });
      if (visited !== input.rowCount) {
        throw new Error(
          `Boundary reader declared ${input.rowCount} rows but emitted ${visited}.`,
        );
      }
      finishChunk();
      if (referenceChunkDigests === null) {
        referenceChunkDigests = replayedChunkDigests;
      } else if (referenceChunkDigests.length !== replayedChunkDigests.length) {
        throw new Error(
          "Boundary reader changed its chunk count between replay passes.",
        );
      }
    },
  };
}

function serializableVector(
  vector: NormalizedSparseVector,
): ScalableSparseIntegerVector {
  return {
    id: vector.id,
    entries: vector.entries.map(([index, value]) => [index, value.toString()]),
  };
}

function matrixDigestAndStatistics(matrix: NormalizedSparseMatrix): {
  digest: string;
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
} {
  const chunkDigests: string[] = [];
  let chunkRowDigests: string[] = [];
  let nonzeroCount = 0;
  let maximumAbsoluteCoefficient = 0n;
  matrix.forEachRow((row) => {
    chunkRowDigests.push(canonicalSha256(serializableVector(row)));
    if (chunkRowDigests.length === BOUNDARY_ROW_DIGEST_CHUNK_SIZE) {
      const chunkIndex = chunkDigests.length;
      chunkDigests.push(
        canonicalSha256({
          chunkIndex,
          start: chunkIndex * BOUNDARY_ROW_DIGEST_CHUNK_SIZE,
          rowDigests: chunkRowDigests,
        }),
      );
      chunkRowDigests = [];
    }
    nonzeroCount += row.entries.length;
    for (const [, coefficient] of row.entries) {
      maximumAbsoluteCoefficient =
        abs(coefficient) > maximumAbsoluteCoefficient
          ? abs(coefficient)
          : maximumAbsoluteCoefficient;
    }
  });
  if (chunkRowDigests.length > 0) {
    const chunkIndex = chunkDigests.length;
    chunkDigests.push(
      canonicalSha256({
        chunkIndex,
        start: chunkIndex * BOUNDARY_ROW_DIGEST_CHUNK_SIZE,
        rowDigests: chunkRowDigests,
      }),
    );
  }
  return {
    digest: canonicalSha256({
      schemaVersion: 1,
      method: "normalized-sparse-row-chunk-tree-v1",
      chunkSize: BOUNDARY_ROW_DIGEST_CHUNK_SIZE,
      rowCount: matrix.rowCount,
      columnCount: matrix.columnCount,
      chunkDigests,
    }),
    nonzeroCount,
    maximumAbsoluteCoefficient,
  };
}

export function computeScalableSparseIntegerMatrixDigest(
  input: ScalableSparseIntegerMatrixSource,
  budgetsInput?: ScalableIntegralH1CompletionBudgets,
): string {
  const budgets = resolveBudgets(budgetsInput);
  return matrixDigestAndStatistics(normalizeMatrix(input, budgets)).digest;
}

function sparseVectorDigest(vector: NormalizedSparseVector): string {
  return canonicalSha256(serializableVector(vector));
}

function sparseVectorsDigest(
  vectors: readonly NormalizedSparseVector[],
): string {
  return canonicalSha256(vectors.map(serializableVector));
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function bitLength(value: bigint): number {
  const magnitude = abs(value);
  return magnitude === 0n ? 0 : magnitude.toString(2).length;
}

function extendedGcd(
  left: bigint,
  right: bigint,
): {
  gcd: bigint;
  leftCoefficient: bigint;
  rightCoefficient: bigint;
} {
  let oldR = left;
  let r = right;
  let oldS = 1n;
  let s = 0n;
  let oldT = 0n;
  let t = 1n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
    [oldT, t] = [t, oldT - quotient * t];
  }
  if (oldR < 0n) {
    oldR = -oldR;
    oldS = -oldS;
    oldT = -oldT;
  }
  return {
    gcd: oldR,
    leftCoefficient: oldS,
    rightCoefficient: oldT,
  };
}

function modularInverse(value: bigint, prime: bigint): bigint {
  const normalized = ((value % prime) + prime) % prime;
  const result = extendedGcd(normalized, prime);
  if (result.gcd !== 1n) {
    throw new Error(
      "A nonzero residue is not invertible modulo the witness prime.",
    );
  }
  return ((result.leftCoefficient % prime) + prime) % prime;
}

function modularPower(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let value = ((base % modulus) + modulus) % modulus;
  let power = exponent;
  let result = 1n;
  while (power > 0n) {
    if ((power & 1n) === 1n) result = (result * value) % modulus;
    value = (value * value) % modulus;
    power >>= 1n;
  }
  return result;
}

function isPrimeNumber(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 2) return false;
  const candidate = BigInt(value);
  for (const small of [
    2n,
    3n,
    5n,
    7n,
    11n,
    13n,
    17n,
    19n,
    23n,
    29n,
    31n,
    37n,
  ]) {
    if (candidate === small) return true;
    if (candidate % small === 0n) return false;
  }
  let oddPart = candidate - 1n;
  let powerOfTwo = 0;
  while ((oddPart & 1n) === 0n) {
    oddPart >>= 1n;
    powerOfTwo += 1;
  }
  // These bases are deterministic for every unsigned 64-bit integer.
  for (const base of [
    2n,
    325n,
    9_375n,
    28_178n,
    450_775n,
    9_780_504n,
    1_795_265_022n,
  ]) {
    if (base % candidate === 0n) continue;
    let residue = modularPower(base, oddPart, candidate);
    if (residue === 1n || residue === candidate - 1n) continue;
    let composite = true;
    for (let step = 1; step < powerOfTwo; step += 1) {
      residue = (residue * residue) % candidate;
      if (residue === candidate - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

function sparseDot(
  left: readonly [number, bigint][],
  right: ReadonlyMap<number, bigint>,
): bigint {
  let sum = 0n;
  for (const [index, value] of left) sum += value * (right.get(index) ?? 0n);
  return sum;
}

function sparseMap(
  vector: NormalizedSparseVector,
): ReadonlyMap<number, bigint> {
  return new Map(vector.entries);
}

function sparseLinearCombination(
  terms: readonly (readonly [bigint, ReadonlyMap<number, bigint>])[],
): Map<number, bigint> {
  const result = new Map<number, bigint>();
  for (const [coefficient, vector] of terms) {
    if (coefficient === 0n) continue;
    for (const [index, value] of vector) {
      const updated = (result.get(index) ?? 0n) + coefficient * value;
      if (updated === 0n) result.delete(index);
      else result.set(index, updated);
    }
  }
  return result;
}

function normalizedFromMap(
  id: string,
  vector: ReadonlyMap<number, bigint>,
): NormalizedSparseVector {
  return {
    id,
    entries: [...vector.entries()]
      .filter((entry) => entry[1] !== 0n)
      .sort((left, right) => left[0] - right[0]),
  };
}

function multiplyKernelByCoordinates(
  kernelBasis: readonly NormalizedSparseVector[],
  coordinates: readonly bigint[],
  id: string,
): NormalizedSparseVector {
  const terms = kernelBasis.map(
    (vector, index) => [coordinates[index] ?? 0n, sparseMap(vector)] as const,
  );
  return normalizedFromMap(id, sparseLinearCombination(terms));
}

function sparseVectorsEqual(
  left: NormalizedSparseVector,
  right: NormalizedSparseVector,
): boolean {
  return (
    left.entries.length === right.entries.length &&
    left.entries.every(
      ([index, value], entry) =>
        index === right.entries[entry]?.[0] &&
        value === right.entries[entry]?.[1],
    )
  );
}

function boundaryAnnihilatesVectors(
  boundary: NormalizedSparseMatrix,
  vectors: readonly NormalizedSparseVector[],
): boolean {
  const maps = vectors.map(sparseMap);
  let closed = true;
  boundary.forEachRow((row) => {
    if (!closed) return;
    for (const vector of maps) {
      if (sparseDot(row.entries, vector) !== 0n) {
        closed = false;
        break;
      }
    }
  });
  return closed;
}

function leftInverseReplays(
  leftInverseRows: readonly NormalizedSparseVector[],
  kernelBasis: readonly NormalizedSparseVector[],
): boolean {
  const kernelMaps = kernelBasis.map(sparseMap);
  return leftInverseRows.every((row, rowIndex) =>
    kernelMaps.every(
      (column, columnIndex) =>
        sparseDot(row.entries, column) === (rowIndex === columnIndex ? 1n : 0n),
    ),
  );
}

export interface ScalableIntegralLeftInverseDerivation {
  rows: ScalableSparseIntegerVector[];
  operationCount: number;
  maximumBitLength: number;
  maximumTrackedNonzeros: number;
}

interface TrackedRow {
  values: bigint[];
  coefficients: Map<number, bigint>;
}

/**
 * Finds L with L K = I using only the row lattice generated by K.
 * The tracked coefficient rows stay sparse in the usually large ambient rank;
 * only the H1-coordinate rows are dense.
 */
export function deriveScalableIntegralLeftInverse(
  kernelBasisInput: readonly ScalableSparseIntegerVectorInput[],
  ambientDimension: number,
  budgetsInput: Pick<
    ScalableIntegralH1CompletionBudgets,
    | "maxLeftInverseDerivationOperations"
    | "maxLeftInverseDerivationNonzeros"
    | "maxIntermediateBitLength"
    | "maxInputCoefficientDigits"
  > = {},
): ScalableIntegralLeftInverseDerivation {
  assertNonnegativeInteger(ambientDimension, "Ambient dimension");
  const budgets = {
    maxLeftInverseDerivationOperations:
      budgetsInput.maxLeftInverseDerivationOperations ??
      DEFAULT_BUDGETS.maxLeftInverseDerivationOperations,
    maxLeftInverseDerivationNonzeros:
      budgetsInput.maxLeftInverseDerivationNonzeros ??
      DEFAULT_BUDGETS.maxLeftInverseDerivationNonzeros,
    maxIntermediateBitLength:
      budgetsInput.maxIntermediateBitLength ??
      DEFAULT_BUDGETS.maxIntermediateBitLength,
    maxInputCoefficientDigits:
      budgetsInput.maxInputCoefficientDigits ??
      DEFAULT_BUDGETS.maxInputCoefficientDigits,
  };
  const kernel = kernelBasisInput.map((vector, index) =>
    normalizeVector(
      vector,
      ambientDimension,
      `Kernel basis vector ${index}`,
      budgets.maxInputCoefficientDigits,
    ),
  );
  const coordinateCount = kernel.length;
  if (coordinateCount === 0) {
    return {
      rows: [],
      operationCount: 0,
      maximumBitLength: 0,
      maximumTrackedNonzeros: 0,
    };
  }

  const sourceRows = new Map<number, Map<number, bigint>>();
  kernel.forEach((vector, coordinate) => {
    for (const [ambient, value] of vector.entries) {
      const row = sourceRows.get(ambient) ?? new Map<number, bigint>();
      row.set(coordinate, value);
      sourceRows.set(ambient, row);
    }
  });
  const active: Array<TrackedRow | null> = Array(coordinateCount).fill(null);
  let operationCount = 0;
  let maximumBitLength = 0;
  let maximumTrackedNonzeros = 0;

  const touch = (rows: readonly TrackedRow[]): void => {
    operationCount += 1;
    if (operationCount > budgets.maxLeftInverseDerivationOperations) {
      throw new ResourceBoundError(
        `Left-inverse derivation exceeded ${budgets.maxLeftInverseDerivationOperations} operations.`,
      );
    }
    const trackedRows = new Set<TrackedRow>([
      ...active.filter((row): row is TrackedRow => row !== null),
      ...rows,
    ]);
    const trackedNonzeros = [...trackedRows].reduce(
      (sum, row) => sum + row.coefficients.size,
      0,
    );
    maximumTrackedNonzeros = Math.max(maximumTrackedNonzeros, trackedNonzeros);
    if (trackedNonzeros > budgets.maxLeftInverseDerivationNonzeros) {
      throw new ResourceBoundError(
        `Left-inverse derivation tracked ${trackedNonzeros} nonzeros; the bound is ${budgets.maxLeftInverseDerivationNonzeros}.`,
      );
    }
    for (const row of rows) {
      for (const value of [...row.values, ...row.coefficients.values()]) {
        const bits = bitLength(value);
        maximumBitLength = Math.max(maximumBitLength, bits);
        if (bits > budgets.maxIntermediateBitLength) {
          throw new ResourceBoundError(
            `A left-inverse intermediate reached ${bits} bits; the bound is ${budgets.maxIntermediateBitLength}.`,
          );
        }
      }
    }
  };

  for (const [ambient, sparseValues] of [...sourceRows.entries()].sort(
    (left, right) => left[0] - right[0],
  )) {
    const values = Array<bigint>(coordinateCount).fill(0n);
    for (const [coordinate, value] of sparseValues) {
      values[coordinate] = value;
    }
    let current: TrackedRow = {
      values: [...values],
      coefficients: new Map([[ambient, 1n]]),
    };
    for (let pivot = 0; pivot < coordinateCount; pivot += 1) {
      const value = current.values[pivot];
      if (value === 0n) continue;
      const prior = active[pivot];
      if (prior === null) {
        if (value < 0n) {
          current.values = current.values.map((entry) => -entry);
          current.coefficients = sparseLinearCombination([
            [-1n, current.coefficients],
          ]);
        }
        active[pivot] = current;
        touch([current]);
        current = {
          values: Array<bigint>(coordinateCount).fill(0n),
          coefficients: new Map(),
        };
        break;
      }
      const oldPivot = prior.values[pivot];
      const bezout = extendedGcd(oldPivot, value);
      const nextPrior: TrackedRow = {
        values: prior.values.map(
          (entry, index) =>
            bezout.leftCoefficient * entry +
            bezout.rightCoefficient * current.values[index],
        ),
        coefficients: sparseLinearCombination([
          [bezout.leftCoefficient, prior.coefficients],
          [bezout.rightCoefficient, current.coefficients],
        ]),
      };
      const nextCurrent: TrackedRow = {
        values: prior.values.map(
          (entry, index) =>
            -(value / bezout.gcd) * entry +
            (oldPivot / bezout.gcd) * current.values[index],
        ),
        coefficients: sparseLinearCombination([
          [-(value / bezout.gcd), prior.coefficients],
          [oldPivot / bezout.gcd, current.coefficients],
        ]),
      };
      active[pivot] = nextPrior;
      current = nextCurrent;
      touch([nextPrior, nextCurrent]);
    }
    if (current.values.some((value) => value !== 0n)) {
      throw new Error(
        "Row-lattice reduction left a nonzero row without an available pivot.",
      );
    }
  }

  if (active.some((row) => row === null)) {
    throw new Error(
      "The proposed kernel columns are not linearly independent.",
    );
  }
  const echelon = active.map((row) => (row as TrackedRow).values);
  const diagonal = echelon.map((row, index) => row[index]);
  if (diagonal.some((value) => value !== 1n)) {
    throw new Error(
      "The kernel column lattice is not primitive: its row lattice is a proper sublattice of the coordinate lattice.",
    );
  }
  const inverse = identity(coordinateCount);
  for (let row = coordinateCount - 1; row >= 0; row -= 1) {
    for (let column = row + 1; column < coordinateCount; column += 1) {
      let sum = 0n;
      for (let index = row + 1; index <= column; index += 1) {
        sum += echelon[row][index] * inverse[index][column];
      }
      inverse[row][column] = -sum;
    }
  }
  if (
    !isIdentity(multiplyMatrices(echelon, inverse)) ||
    !isIdentity(multiplyMatrices(inverse, echelon))
  ) {
    throw new Error("The row-lattice basis inverse failed exact replay.");
  }
  const coefficientRows = active.map((row) => (row as TrackedRow).coefficients);
  const leftInverse = inverse.map((row, rowIndex) =>
    normalizedFromMap(
      `lambda${rowIndex}`,
      sparseLinearCombination(
        row.map(
          (coefficient, basisRow) =>
            [coefficient, coefficientRows[basisRow]] as const,
        ),
      ),
    ),
  );
  if (!leftInverseReplays(leftInverse, kernel)) {
    throw new Error("The derived integral left inverse failed L K = I.");
  }
  touch(
    leftInverse.map((row) => ({
      values: [],
      coefficients: new Map(row.entries),
    })),
  );
  return {
    rows: leftInverse.map(serializableVector),
    operationCount,
    maximumBitLength,
    maximumTrackedNonzeros,
  };
}

interface ModularEliminationResult {
  rank: number;
  pivotRows: number[];
  pivotColumns: number[];
  operations: number;
}

function eliminateSparseModuloPrime(
  rowsInput: readonly ReadonlyMap<number, bigint>[],
  columnCount: number,
  primeNumber: number,
  maxOperations: number,
  maxWorkingNonzeros: number,
): ModularEliminationResult {
  if (!isPrimeNumber(primeNumber)) {
    throw new Error(`${primeNumber} is not a prime modular witness modulus.`);
  }
  const prime = BigInt(primeNumber);
  const rows = rowsInput.map((row) => {
    const normalized = new Map<number, bigint>();
    for (const [column, value] of row) {
      const residue = ((value % prime) + prime) % prime;
      if (residue !== 0n) normalized.set(column, residue);
    }
    return normalized;
  });
  let workingNonzeros = rows.reduce((sum, row) => sum + row.size, 0);
  if (workingNonzeros > maxWorkingNonzeros) {
    throw new ResourceBoundError(
      `Modular elimination starts with ${workingNonzeros} working nonzeros; the bound is ${maxWorkingNonzeros}.`,
    );
  }
  const rowOrigins = Array.from({ length: rows.length }, (_unused, row) => row);
  const pivotRows: number[] = [];
  const pivotColumns: number[] = [];
  let operations = 0;
  let pivotRow = 0;
  const touch = (count = 1): void => {
    operations += count;
    if (operations > maxOperations) {
      throw new ResourceBoundError(
        `Modular elimination exceeded ${maxOperations} operations.`,
      );
    }
  };
  for (
    let column = 0;
    column < columnCount && pivotRow < rows.length;
    column += 1
  ) {
    let selected = pivotRow;
    while (selected < rows.length && !rows[selected].has(column)) selected += 1;
    if (selected === rows.length) continue;
    if (selected !== pivotRow) {
      [rows[selected], rows[pivotRow]] = [rows[pivotRow], rows[selected]];
      [rowOrigins[selected], rowOrigins[pivotRow]] = [
        rowOrigins[pivotRow],
        rowOrigins[selected],
      ];
      touch();
    }
    const inverse = modularInverse(rows[pivotRow].get(column) ?? 0n, prime);
    for (const [entryColumn, value] of rows[pivotRow]) {
      const normalized = (value * inverse) % prime;
      if (normalized === 0n) {
        rows[pivotRow].delete(entryColumn);
        workingNonzeros -= 1;
      } else rows[pivotRow].set(entryColumn, normalized);
      touch();
    }
    for (let row = pivotRow + 1; row < rows.length; row += 1) {
      const coefficient = rows[row].get(column) ?? 0n;
      if (coefficient === 0n) continue;
      for (const [entryColumn, pivotValue] of rows[pivotRow]) {
        const existed = rows[row].has(entryColumn);
        const updated =
          ((((rows[row].get(entryColumn) ?? 0n) - coefficient * pivotValue) %
            prime) +
            prime) %
          prime;
        if (updated === 0n) {
          if (existed) {
            rows[row].delete(entryColumn);
            workingNonzeros -= 1;
          }
        } else {
          rows[row].set(entryColumn, updated);
          if (!existed) {
            workingNonzeros += 1;
            if (workingNonzeros > maxWorkingNonzeros) {
              throw new ResourceBoundError(
                `Modular fill reached ${workingNonzeros} working nonzeros; the bound is ${maxWorkingNonzeros}.`,
              );
            }
          }
        }
        touch();
      }
    }
    pivotRows.push(rowOrigins[pivotRow]);
    pivotColumns.push(column);
    pivotRow += 1;
  }
  return { rank: pivotRow, pivotRows, pivotColumns, operations };
}

export function findScalableModularRankWitness(
  boundaryInput: ScalableSparseIntegerMatrixSource,
  prime: number,
  maxOperations = DEFAULT_BUDGETS.maxModularOperations,
  maxWorkingNonzeros = DEFAULT_BUDGETS.maxModularWorkingNonzeros,
): ScalableModularRankWitnessInput {
  const boundary = normalizeMatrix(boundaryInput);
  const rows: Array<ReadonlyMap<number, bigint>> = [];
  boundary.forEachRow((row) => rows.push(new Map(row.entries)));
  const result = eliminateSparseModuloPrime(
    rows,
    boundary.columnCount,
    prime,
    maxOperations,
    maxWorkingNonzeros,
  );
  return {
    prime,
    rank: result.rank,
    pivotRows: result.pivotRows,
    pivotColumns: result.pivotColumns,
  };
}

function verifyModularPivotMinor(
  boundary: NormalizedSparseMatrix,
  witness: ScalableModularRankWitnessInput,
  budgets: Required<ScalableIntegralH1CompletionBudgets>,
): boolean {
  assertNonnegativeInteger(witness.rank, "Modular witness rank");
  if (!isPrimeNumber(witness.prime)) {
    throw new Error(`${witness.prime} is not prime.`);
  }
  if (
    witness.pivotRows.length !== witness.rank ||
    witness.pivotColumns.length !== witness.rank
  ) {
    throw new Error(
      "The modular witness pivot lists do not have the claimed rank.",
    );
  }
  if (witness.rank > budgets.maxPivotMinorOrder) {
    throw new ResourceBoundError(
      `Pivot-minor order ${witness.rank} exceeds ${budgets.maxPivotMinorOrder}.`,
    );
  }
  const rowSet = new Set(witness.pivotRows);
  const columnSet = new Set(witness.pivotColumns);
  if (rowSet.size !== witness.rank || columnSet.size !== witness.rank) {
    throw new Error("The modular witness repeats a pivot row or column.");
  }
  witness.pivotRows.forEach((row, index) => {
    assertNonnegativeInteger(row, `Pivot row ${index}`);
    if (row >= boundary.rowCount)
      throw new Error(`Pivot row ${row} is out of range.`);
  });
  witness.pivotColumns.forEach((column, index) => {
    assertNonnegativeInteger(column, `Pivot column ${index}`);
    if (column >= boundary.columnCount) {
      throw new Error(`Pivot column ${column} is out of range.`);
    }
  });
  const localColumn = new Map(
    witness.pivotColumns.map((column, index) => [column, index]),
  );
  const wantedRows = new Map(
    witness.pivotRows.map((row, local) => [row, local]),
  );
  const minorRows = Array.from(
    { length: witness.rank },
    () => new Map<number, bigint>(),
  );
  boundary.forEachRow((row, rowIndex) => {
    const localRow = wantedRows.get(rowIndex);
    if (localRow === undefined) return;
    const result = new Map<number, bigint>();
    for (const [column, value] of row.entries) {
      const local = localColumn.get(column);
      if (local !== undefined) result.set(local, value);
    }
    minorRows[localRow] = result;
  });
  return (
    eliminateSparseModuloPrime(
      minorRows,
      witness.rank,
      witness.prime,
      budgets.maxModularOperations,
      budgets.maxModularWorkingNonzeros,
    ).rank === witness.rank
  );
}

function identity(size: number): bigint[][] {
  return Array.from({ length: size }, (_unused, row) =>
    Array.from({ length: size }, (_unusedColumn, column) =>
      row === column ? 1n : 0n,
    ),
  );
}

function cloneMatrix(matrix: readonly (readonly bigint[])[]): bigint[][] {
  return matrix.map((row) => [...row]);
}

function multiplyMatrices(
  left: readonly (readonly bigint[])[],
  right: readonly (readonly bigint[])[],
  rightColumnCount = right[0]?.length ?? 0,
): bigint[][] {
  const leftRows = left.length;
  const shared = left[0]?.length ?? 0;
  if (shared !== right.length) {
    throw new Error(
      `Matrix dimensions ${leftRows}x${shared} and ${right.length}x${rightColumnCount} do not multiply.`,
    );
  }
  return Array.from({ length: leftRows }, (_unused, row) =>
    Array.from({ length: rightColumnCount }, (_unusedColumn, column) => {
      let sum = 0n;
      for (let index = 0; index < shared; index += 1) {
        sum += left[row][index] * right[index][column];
      }
      return sum;
    }),
  );
}

function matricesEqual(
  left: readonly (readonly bigint[])[],
  right: readonly (readonly bigint[])[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (row, rowIndex) =>
        row.length === right[rowIndex]?.length &&
        row.every((value, column) => value === right[rowIndex][column]),
    )
  );
}

function multiplyMatrixVector(
  matrix: readonly (readonly bigint[])[],
  vector: readonly bigint[],
): bigint[] {
  if (matrix.some((row) => row.length !== vector.length)) {
    throw new Error("Matrix-vector dimensions do not match.");
  }
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0n),
  );
}

function isIdentity(matrix: readonly (readonly bigint[])[]): boolean {
  return (
    matrix.every((row) => row.length === matrix.length) &&
    matrix.every((row, rowIndex) =>
      row.every((value, column) => value === (rowIndex === column ? 1n : 0n)),
    )
  );
}

function matrixDigest(
  matrix: readonly (readonly bigint[])[],
  columnCount = matrix[0]?.length ?? 0,
): string {
  if (matrix.some((row) => row.length !== columnCount)) {
    throw new Error("Cannot digest a nonrectangular matrix.");
  }
  return canonicalSha256({
    rowCount: matrix.length,
    columnCount,
    rows: matrix.map((row) => row.map((value) => value.toString())),
  });
}

function touchSmith(tracker: SmithTracker, values: readonly bigint[]): void {
  tracker.operations += 1;
  if (tracker.operations > tracker.budgets.maxSmithOperations) {
    throw new ResourceBoundError(
      `Wall Smith reduction exceeded ${tracker.budgets.maxSmithOperations} operations.`,
    );
  }
  for (const value of values) {
    const bits = bitLength(value);
    tracker.maximumBitLength = Math.max(tracker.maximumBitLength, bits);
    if (bits > tracker.budgets.maxIntermediateBitLength) {
      throw new ResourceBoundError(
        `A wall Smith intermediate reached ${bits} bits; the bound is ${tracker.budgets.maxIntermediateBitLength}.`,
      );
    }
  }
}

function combineDenseRows(
  matrix: bigint[][],
  left: number,
  right: number,
  coefficients: readonly [bigint, bigint, bigint, bigint],
): bigint[] {
  const [a, b, c, d] = coefficients;
  const oldLeft = matrix[left];
  const oldRight = matrix[right];
  const newLeft = oldLeft.map(
    (value, column) => a * value + b * oldRight[column],
  );
  const newRight = oldLeft.map(
    (value, column) => c * value + d * oldRight[column],
  );
  matrix[left] = newLeft;
  matrix[right] = newRight;
  return [...newLeft, ...newRight];
}

function combineDenseColumns(
  matrix: bigint[][],
  left: number,
  right: number,
  coefficients: readonly [bigint, bigint, bigint, bigint],
): bigint[] {
  const [a, b, c, d] = coefficients;
  const changed: bigint[] = [];
  for (const row of matrix) {
    const oldLeft = row[left];
    const oldRight = row[right];
    row[left] = a * oldLeft + b * oldRight;
    row[right] = c * oldLeft + d * oldRight;
    changed.push(row[left], row[right]);
  }
  return changed;
}

function applySmithRowSwap(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  left: number,
  right: number,
  tracker: SmithTracker,
): void {
  if (left === right) return;
  [matrix[left], matrix[right]] = [matrix[right], matrix[left]];
  [transform[left], transform[right]] = [transform[right], transform[left]];
  for (const row of inverse) [row[left], row[right]] = [row[right], row[left]];
  touchSmith(tracker, []);
}

function applySmithRowAddition(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  source: number,
  target: number,
  multiple: bigint,
  tracker: SmithTracker,
): void {
  if (multiple === 0n) return;
  matrix[target] = matrix[target].map(
    (value, column) => value + multiple * matrix[source][column],
  );
  transform[target] = transform[target].map(
    (value, column) => value + multiple * transform[source][column],
  );
  for (const row of inverse) row[source] -= multiple * row[target];
  touchSmith(tracker, [
    ...matrix[target],
    ...transform[target],
    ...inverse.map((row) => row[source]),
  ]);
}

function applySmithRowCombination(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  left: number,
  right: number,
  coefficients: readonly [bigint, bigint, bigint, bigint],
  tracker: SmithTracker,
): void {
  const [a, b, c, d] = coefficients;
  const determinant = a * d - b * c;
  if (determinant !== 1n && determinant !== -1n) {
    throw new Error("A Smith row combination is not unimodular.");
  }
  const changed = [
    ...combineDenseRows(matrix, left, right, coefficients),
    ...combineDenseRows(transform, left, right, coefficients),
  ];
  for (const row of inverse) {
    const oldLeft = row[left];
    const oldRight = row[right];
    row[left] = determinant * (d * oldLeft - c * oldRight);
    row[right] = determinant * (-b * oldLeft + a * oldRight);
    changed.push(row[left], row[right]);
  }
  touchSmith(tracker, changed);
}

function applySmithRowNegation(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  rowIndex: number,
  tracker: SmithTracker,
): void {
  matrix[rowIndex] = matrix[rowIndex].map((value) => -value);
  transform[rowIndex] = transform[rowIndex].map((value) => -value);
  for (const row of inverse) row[rowIndex] = -row[rowIndex];
  touchSmith(tracker, [
    ...matrix[rowIndex],
    ...transform[rowIndex],
    ...inverse.map((row) => row[rowIndex]),
  ]);
}

function applySmithColumnSwap(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  left: number,
  right: number,
  tracker: SmithTracker,
): void {
  if (left === right) return;
  for (const row of matrix) [row[left], row[right]] = [row[right], row[left]];
  for (const row of transform)
    [row[left], row[right]] = [row[right], row[left]];
  [inverse[left], inverse[right]] = [inverse[right], inverse[left]];
  touchSmith(tracker, []);
}

function applySmithColumnAddition(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  source: number,
  target: number,
  multiple: bigint,
  tracker: SmithTracker,
): void {
  if (multiple === 0n) return;
  const changed: bigint[] = [];
  for (const row of matrix) {
    row[target] += multiple * row[source];
    changed.push(row[target]);
  }
  for (const row of transform) {
    row[target] += multiple * row[source];
    changed.push(row[target]);
  }
  inverse[source] = inverse[source].map(
    (value, column) => value - multiple * inverse[target][column],
  );
  changed.push(...inverse[source]);
  touchSmith(tracker, changed);
}

function applySmithColumnCombination(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  left: number,
  right: number,
  coefficients: readonly [bigint, bigint, bigint, bigint],
  tracker: SmithTracker,
): void {
  const [a, b, c, d] = coefficients;
  const determinant = a * d - b * c;
  if (determinant !== 1n && determinant !== -1n) {
    throw new Error("A Smith column combination is not unimodular.");
  }
  const changed = [
    ...combineDenseColumns(matrix, left, right, coefficients),
    ...combineDenseColumns(transform, left, right, coefficients),
  ];
  const oldLeft = inverse[left];
  const oldRight = inverse[right];
  inverse[left] = oldLeft.map(
    (value, column) => determinant * (d * value - c * oldRight[column]),
  );
  inverse[right] = oldLeft.map(
    (value, column) => determinant * (-b * value + a * oldRight[column]),
  );
  changed.push(...inverse[left], ...inverse[right]);
  touchSmith(tracker, changed);
}

function smithNormalForm(
  input: readonly (readonly bigint[])[],
  columnCount: number,
  budgets: SmithBudgets,
): { result: SmithResult; tracker: SmithTracker } {
  if (input.some((row) => row.length !== columnCount)) {
    throw new Error("The wall-coordinate matrix is not rectangular.");
  }
  const tracker: SmithTracker = {
    operations: 0,
    maximumBitLength: 0,
    budgets,
  };
  const matrix = cloneMatrix(input);
  const leftTransform = identity(input.length);
  const leftInverse = identity(input.length);
  const rightTransform = identity(columnCount);
  const rightInverse = identity(columnCount);
  const limit = Math.min(input.length, columnCount);

  for (let pivotIndex = 0; pivotIndex < limit; pivotIndex += 1) {
    let selectedRow = -1;
    let selectedColumn = -1;
    for (
      let row = pivotIndex;
      row < matrix.length && selectedRow < 0;
      row += 1
    ) {
      for (let column = pivotIndex; column < columnCount; column += 1) {
        if (matrix[row][column] !== 0n) {
          selectedRow = row;
          selectedColumn = column;
          break;
        }
      }
    }
    if (selectedRow < 0) break;
    applySmithRowSwap(
      matrix,
      leftTransform,
      leftInverse,
      pivotIndex,
      selectedRow,
      tracker,
    );
    applySmithColumnSwap(
      matrix,
      rightTransform,
      rightInverse,
      pivotIndex,
      selectedColumn,
      tracker,
    );

    while (true) {
      for (let row = pivotIndex + 1; row < matrix.length; row += 1) {
        const pivot = matrix[pivotIndex][pivotIndex];
        const value = matrix[row][pivotIndex];
        if (value === 0n) continue;
        if (pivot !== 0n && value % pivot === 0n) {
          applySmithRowAddition(
            matrix,
            leftTransform,
            leftInverse,
            pivotIndex,
            row,
            -(value / pivot),
            tracker,
          );
        } else {
          const bezout = extendedGcd(pivot, value);
          applySmithRowCombination(
            matrix,
            leftTransform,
            leftInverse,
            pivotIndex,
            row,
            [
              bezout.leftCoefficient,
              bezout.rightCoefficient,
              -(value / bezout.gcd),
              pivot / bezout.gcd,
            ],
            tracker,
          );
        }
      }

      for (let column = pivotIndex + 1; column < columnCount; column += 1) {
        const pivot = matrix[pivotIndex][pivotIndex];
        const value = matrix[pivotIndex][column];
        if (value === 0n) continue;
        if (pivot !== 0n && value % pivot === 0n) {
          applySmithColumnAddition(
            matrix,
            rightTransform,
            rightInverse,
            pivotIndex,
            column,
            -(value / pivot),
            tracker,
          );
        } else {
          const bezout = extendedGcd(pivot, value);
          applySmithColumnCombination(
            matrix,
            rightTransform,
            rightInverse,
            pivotIndex,
            column,
            [
              bezout.leftCoefficient,
              bezout.rightCoefficient,
              -(value / bezout.gcd),
              pivot / bezout.gcd,
            ],
            tracker,
          );
        }
      }

      const rowAndColumnClear =
        Array.from(
          { length: matrix.length - pivotIndex - 1 },
          (_unused, offset) => matrix[pivotIndex + 1 + offset][pivotIndex],
        ).every((value) => value === 0n) &&
        matrix[pivotIndex].slice(pivotIndex + 1).every((value) => value === 0n);
      if (!rowAndColumnClear) continue;
      const pivot = matrix[pivotIndex][pivotIndex];
      let badRow = -1;
      for (
        let row = pivotIndex + 1;
        row < matrix.length && badRow < 0;
        row += 1
      ) {
        for (let column = pivotIndex + 1; column < columnCount; column += 1) {
          if (pivot === 0n || matrix[row][column] % pivot !== 0n) {
            badRow = row;
            break;
          }
        }
      }
      if (badRow < 0) break;
      applySmithRowAddition(
        matrix,
        leftTransform,
        leftInverse,
        badRow,
        pivotIndex,
        1n,
        tracker,
      );
    }
    if (matrix[pivotIndex][pivotIndex] < 0n) {
      applySmithRowNegation(
        matrix,
        leftTransform,
        leftInverse,
        pivotIndex,
        tracker,
      );
    }
  }

  const diagonal = Array.from(
    { length: limit },
    (_unused, index) => matrix[index][index],
  ).filter((value) => value !== 0n);
  const diagonalShape = matrix.every((row, rowIndex) =>
    row.every((value, column) => rowIndex === column || value === 0n),
  );
  const canonical = diagonal.every(
    (value, index) =>
      value > 0n &&
      (index === diagonal.length - 1 || diagonal[index + 1] % value === 0n),
  );
  if (!diagonalShape || !canonical) {
    throw new Error(
      "Wall Smith reduction did not reach canonical diagonal form.",
    );
  }
  return {
    result: {
      diagonalMatrix: matrix,
      diagonal,
      rank: diagonal.length,
      leftTransform,
      leftInverse,
      rightTransform,
      rightInverse,
    },
    tracker,
  };
}

function resolveBudgets(
  input: ScalableIntegralH1CompletionBudgets | undefined,
): Required<ScalableIntegralH1CompletionBudgets> {
  const budgets = { ...DEFAULT_BUDGETS, ...(input ?? {}) };
  for (const [name, value] of Object.entries(budgets)) {
    assertNonnegativeInteger(value, `Budget ${name}`);
  }
  return budgets;
}

function requireUniqueIds(
  vectors: readonly NormalizedSparseVector[],
  label: string,
): void {
  if (new Set(vectors.map((vector) => vector.id)).size !== vectors.length) {
    throw new Error(`${label} ids are not unique.`);
  }
}

function countNonzeros(vectors: readonly NormalizedSparseVector[]): number {
  return vectors.reduce((sum, vector) => sum + vector.entries.length, 0);
}

function coordinatePairs(values: readonly bigint[]): Array<[number, string]> {
  return values.flatMap((value, index) =>
    value === 0n
      ? []
      : ([[index, value.toString()]] as Array<[number, string]>),
  );
}

function formatFreeAbelianGroup(rank: number): string {
  if (rank === 0) return "0";
  if (rank === 1) return "Z";
  return `Z^${rank}`;
}

function formatQuotient(
  freeRank: number,
  torsionInvariantFactors: readonly string[],
): string {
  const factors: string[] = [];
  if (freeRank === 1) factors.push("Z");
  else if (freeRank > 1) factors.push(`Z^${freeRank}`);
  for (const factor of torsionInvariantFactors) factors.push(`Z/${factor}`);
  return factors.length === 0 ? "0" : factors.join(" + ");
}

function certificatePayload(
  certificate: ScalableIntegralH1CompletionCertificate,
): Omit<ScalableIntegralH1CompletionCertificate, "certificateDigest"> {
  const { certificateDigest, ...payload } = certificate;
  void certificateDigest;
  return payload;
}

export function computeScalableIntegralH1CompletionCertificateDigest(
  certificate: ScalableIntegralH1CompletionCertificate,
): string {
  return canonicalSha256(certificatePayload(certificate));
}

function makeCertificate(
  payload: Omit<ScalableIntegralH1CompletionCertificate, "certificateDigest">,
): ScalableIntegralH1CompletionCertificate {
  const certificate = { ...payload, certificateDigest: "" };
  certificate.certificateDigest =
    computeScalableIntegralH1CompletionCertificateDigest(certificate);
  return certificate;
}

/**
 * Certifies ker_Z(B)=K Z^b without recomputing an integer Smith form of B.
 * BK=0 and LK=I give a primitive rank-b sublattice of the kernel. A nonzero
 * (n-b)-minor modulo p supplies the opposite rational-rank inequality, so the
 * primitive sublattice is the full integral kernel.
 */
export function certifyScalableIntegralH1Completion(
  input: ScalableIntegralH1CompletionInput,
): ScalableIntegralH1CompletionCertificate {
  const budgets = resolveBudgets(input.budgets);
  const errors: string[] = [];
  const checks: ScalableIntegralH1CompletionCertificate["checks"] = {
    sourceDigestsWellFormed: false,
    boundaryDigestMatches: false,
    allClaimedChecksPassed: false,
  };
  const source: ScalableIntegralH1CompletionCertificate["source"] = {
    sourceDigest: input.source.sourceDigest,
    preparationDigest: input.source.preparationDigest,
    expectedBoundaryDigest: input.source.boundaryDigest,
  };
  let boundarySummary: ScalableIntegralH1CompletionCertificate["boundary"];
  let h1: ScalableIntegralH1CompletionCertificate["h1"];
  let walls: ScalableIntegralH1CompletionCertificate["walls"];
  let stopReason: string | undefined;

  try {
    checks.sourceDigestsWellFormed = [
      input.source.sourceDigest,
      input.source.preparationDigest,
      input.source.boundaryDigest,
    ].every((digest) => /^[0-9a-f]{64}$/.test(digest));
    if (!checks.sourceDigestsWellFormed) {
      throw new Error(
        "Source, preparation, and boundary digests must be lowercase SHA-256 values.",
      );
    }

    // Resident witness arrays can be checked before the boundary reader makes
    // its first pass. Streamed boundary rows receive the same check immediately
    // before each coefficient is parsed as a BigInt.
    if ("rows" in input.boundary) {
      preflightVectorCoefficientTokens(
        input.boundary.rows,
        "Boundary row",
        budgets.maxInputCoefficientDigits,
      );
    }
    preflightVectorCoefficientTokens(
      input.kernelBasis,
      "Kernel basis vector",
      budgets.maxInputCoefficientDigits,
    );
    if (input.integralLeftInverseRows !== undefined) {
      preflightVectorCoefficientTokens(
        input.integralLeftInverseRows,
        "Integral left-inverse row",
        budgets.maxInputCoefficientDigits,
      );
    }
    preflightVectorCoefficientTokens(
      input.walls,
      "Wall cocycle",
      budgets.maxInputCoefficientDigits,
    );

    const boundary = normalizeMatrix(input.boundary, budgets);
    const statistics = matrixDigestAndStatistics(boundary);
    source.computedBoundaryDigest = statistics.digest;
    checks.boundaryDigestMatches =
      statistics.digest === input.source.boundaryDigest;
    boundarySummary = {
      rowCount: boundary.rowCount,
      columnCount: boundary.columnCount,
      nonzeroCount: statistics.nonzeroCount,
      maximumAbsoluteCoefficient:
        statistics.maximumAbsoluteCoefficient.toString(),
    };
    if (statistics.nonzeroCount > budgets.maxBoundaryNonzeros) {
      throw new ResourceBoundError(
        `Boundary has ${statistics.nonzeroCount} nonzeros; the bound is ${budgets.maxBoundaryNonzeros}.`,
      );
    }
    if (!checks.boundaryDigestMatches) {
      throw new Error(
        "The streamed boundary does not match its source-bound digest.",
      );
    }

    const kernelBasis = input.kernelBasis.map((vector, index) =>
      normalizeVector(
        vector,
        boundary.columnCount,
        `Kernel basis vector ${index}`,
        budgets.maxInputCoefficientDigits,
      ),
    );
    requireUniqueIds(kernelBasis, "Kernel basis");
    const kernelNonzeros = countNonzeros(kernelBasis);
    if (kernelNonzeros > budgets.maxKernelNonzeros) {
      throw new ResourceBoundError(
        `Kernel basis has ${kernelNonzeros} nonzeros; the bound is ${budgets.maxKernelNonzeros}.`,
      );
    }
    const h1Rank = kernelBasis.length;
    let leftInverseDerivation:
      | ScalableIntegralLeftInverseDerivation
      | undefined;
    const leftInverseInput =
      input.integralLeftInverseRows ??
      (leftInverseDerivation = deriveScalableIntegralLeftInverse(
        input.kernelBasis,
        boundary.columnCount,
        budgets,
      )).rows;
    const leftInverseRows = leftInverseInput.map((vector, index) =>
      normalizeVector(
        vector,
        boundary.columnCount,
        `Integral left-inverse row ${index}`,
        budgets.maxInputCoefficientDigits,
      ),
    );
    if (leftInverseRows.length !== h1Rank) {
      throw new Error(
        `The integral left inverse has ${leftInverseRows.length} rows; expected ${h1Rank}.`,
      );
    }
    requireUniqueIds(leftInverseRows, "Integral left-inverse row");
    const leftInverseNonzeros = countNonzeros(leftInverseRows);
    if (leftInverseNonzeros > budgets.maxLeftInverseNonzeros) {
      throw new ResourceBoundError(
        `Integral left inverse has ${leftInverseNonzeros} nonzeros; the bound is ${budgets.maxLeftInverseNonzeros}.`,
      );
    }
    const wallVectors = input.walls.map((vector, index) =>
      normalizeVector(
        vector,
        boundary.columnCount,
        `Wall cocycle ${index}`,
        budgets.maxInputCoefficientDigits,
      ),
    );
    requireUniqueIds(wallVectors, "Wall cocycle");
    const wallNonzeros = countNonzeros(wallVectors);
    if (wallNonzeros > budgets.maxWallNonzeros) {
      throw new ResourceBoundError(
        `Wall cocycles have ${wallNonzeros} nonzeros; the bound is ${budgets.maxWallNonzeros}.`,
      );
    }
    const wallDenseWorkingEntries =
      h1Rank * wallVectors.length +
      2 * h1Rank * h1Rank +
      2 * wallVectors.length * wallVectors.length;
    if (wallDenseWorkingEntries > budgets.maxWallDenseEntries) {
      throw new ResourceBoundError(
        `Wall Smith replay requires ${wallDenseWorkingEntries} dense working entries; the bound is ${budgets.maxWallDenseEntries}.`,
      );
    }

    const kernelClosed = boundaryAnnihilatesVectors(boundary, kernelBasis);
    const integralLeftInverse = leftInverseReplays(
      leftInverseRows,
      kernelBasis,
    );
    const modularMinorNonsingular = verifyModularPivotMinor(
      boundary,
      input.modularRankWitness,
      budgets,
    );
    const modularRankMatchesKernelCodimension =
      input.modularRankWitness.rank === boundary.columnCount - h1Rank;
    const fullRationalKernelCertified =
      kernelClosed &&
      integralLeftInverse &&
      modularMinorNonsingular &&
      modularRankMatchesKernelCodimension;
    const primitiveIntegralKernelCertified = integralLeftInverse;
    const fullIntegralKernelCertified =
      fullRationalKernelCertified && primitiveIntegralKernelCertified;
    if (!kernelClosed)
      errors.push("The proposed integral kernel basis is not closed under B.");
    if (!integralLeftInverse)
      errors.push("The proposed left inverse does not satisfy L K = I.");
    if (!modularMinorNonsingular)
      errors.push("The recorded modular pivot minor is singular.");
    if (!modularRankMatchesKernelCodimension) {
      errors.push(
        "The modular lower bound does not equal the codimension forced by the kernel basis.",
      );
    }
    if (!fullIntegralKernelCertified) {
      throw new Error("The witnesses do not certify the full integral kernel.");
    }
    h1 = {
      rank: h1Rank,
      relationRank: input.modularRankWitness.rank,
      isomorphicTo: formatFreeAbelianGroup(h1Rank),
      kernelBasisDigest: sparseVectorsDigest(kernelBasis),
      integralLeftInverseDigest: sparseVectorsDigest(leftInverseRows),
      integralLeftInverseOrigin:
        input.integralLeftInverseRows === undefined
          ? "derived-row-lattice-reduction"
          : "supplied",
      ...(leftInverseDerivation === undefined
        ? {}
        : {
            leftInverseDerivation: {
              operationCount: leftInverseDerivation.operationCount,
              maximumBitLength: leftInverseDerivation.maximumBitLength,
              maximumTrackedNonzeros:
                leftInverseDerivation.maximumTrackedNonzeros,
            },
          }),
      modularRankWitness: {
        prime: input.modularRankWitness.prime,
        rank: input.modularRankWitness.rank,
        pivotRows: [...input.modularRankWitness.pivotRows],
        pivotColumns: [...input.modularRankWitness.pivotColumns],
        witnessDigest: canonicalSha256({
          boundaryDigest: statistics.digest,
          prime: input.modularRankWitness.prime,
          rank: input.modularRankWitness.rank,
          pivotRows: input.modularRankWitness.pivotRows,
          pivotColumns: input.modularRankWitness.pivotColumns,
        }),
      },
      checks: {
        kernelClosed,
        integralLeftInverse,
        modularMinorNonsingular,
        modularRankMatchesKernelCodimension,
        fullRationalKernelCertified,
        primitiveIntegralKernelCertified,
        fullIntegralKernelCertified,
      },
    };

    const everyWallClosed = boundaryAnnihilatesVectors(boundary, wallVectors);
    const wallCoordinates = wallVectors.map((wall) => {
      const wallMap = sparseMap(wall);
      return leftInverseRows.map((row) => sparseDot(row.entries, wallMap));
    });
    const wallCoordinatesReconstructCocycles = wallVectors.every(
      (wall, index) =>
        sparseVectorsEqual(
          wall,
          multiplyKernelByCoordinates(
            kernelBasis,
            wallCoordinates[index],
            wall.id,
          ),
        ),
    );
    if (!everyWallClosed || !wallCoordinatesReconstructCocycles) {
      throw new Error(
        "A wall cocycle failed closure or exact H1-coordinate reconstruction.",
      );
    }
    const wallMatrix = Array.from({ length: h1Rank }, (_unused, coordinate) =>
      wallCoordinates.map((wall) => wall[coordinate]),
    );
    const smith = smithNormalForm(wallMatrix, wallVectors.length, budgets);
    const smithTransformsReplay =
      h1Rank === 0
        ? smith.result.diagonal.length === 0
        : matricesEqual(
            multiplyMatrices(
              multiplyMatrices(smith.result.leftTransform, wallMatrix),
              smith.result.rightTransform,
            ),
            smith.result.diagonalMatrix,
          );
    const smithTransformsHaveIntegralInverses =
      isIdentity(
        multiplyMatrices(smith.result.leftTransform, smith.result.leftInverse),
      ) &&
      isIdentity(
        multiplyMatrices(smith.result.leftInverse, smith.result.leftTransform),
      ) &&
      isIdentity(
        multiplyMatrices(
          smith.result.rightTransform,
          smith.result.rightInverse,
        ),
      ) &&
      isIdentity(
        multiplyMatrices(
          smith.result.rightInverse,
          smith.result.rightTransform,
        ),
      );
    const invariantFactorsDivideSuccessors = smith.result.diagonal.every(
      (value, index) =>
        index === smith.result.diagonal.length - 1 ||
        smith.result.diagonal[index + 1] % value === 0n,
    );
    const saturationCoordinates = Array.from(
      { length: smith.result.rank },
      (_unused, column) => smith.result.leftInverse.map((row) => row[column]),
    );
    const saturationCocycles = saturationCoordinates.map((coordinates, index) =>
      multiplyKernelByCoordinates(
        kernelBasis,
        coordinates,
        `wall-saturation-${index}`,
      ),
    );
    const everySaturationCocycleClosed = boundaryAnnihilatesVectors(
      boundary,
      saturationCocycles,
    );
    const saturationBasisReconstructs =
      everySaturationCocycleClosed &&
      saturationCocycles.every((cocycle, index) => {
        const cocycleMap = sparseMap(cocycle);
        return leftInverseRows.every(
          (row, coordinate) =>
            sparseDot(row.entries, cocycleMap) ===
            saturationCoordinates[index][coordinate],
        );
      });
    const wallSaturationCoordinates = wallCoordinates.map((coordinates) => {
      const transformed = multiplyMatrixVector(
        smith.result.leftTransform,
        coordinates,
      );
      if (
        transformed
          .slice(smith.result.rank)
          .some((coordinate) => coordinate !== 0n)
      ) {
        throw new Error(
          "A wall coordinate lies outside its claimed saturation.",
        );
      }
      return transformed.slice(0, smith.result.rank);
    });
    const wallSaturationCoordinatesReconstruct = wallVectors.every(
      (wall, index) =>
        sparseVectorsEqual(
          wall,
          multiplyKernelByCoordinates(
            saturationCocycles,
            wallSaturationCoordinates[index],
            wall.id,
          ),
        ),
    );
    const wallSaturationCertified =
      everyWallClosed &&
      wallCoordinatesReconstructCocycles &&
      smithTransformsReplay &&
      smithTransformsHaveIntegralInverses &&
      invariantFactorsDivideSuccessors &&
      saturationBasisReconstructs &&
      wallSaturationCoordinatesReconstruct;
    if (!wallSaturationCertified) {
      throw new Error(
        "The exact wall-lattice Smith or saturation replay failed.",
      );
    }
    const invariantFactors = smith.result.diagonal.map((value) =>
      value.toString(),
    );
    const torsionInvariantFactors = smith.result.diagonal
      .filter((value) => value > 1n)
      .map((value) => value.toString());
    const wallIndexInSaturation = smith.result.diagonal.reduce(
      (product, value) => product * value,
      1n,
    );
    const freeRank = h1Rank - smith.result.rank;
    walls = {
      wallCount: wallVectors.length,
      wallRank: smith.result.rank,
      smithInvariantFactors: invariantFactors,
      wallIndexInSaturation: wallIndexInSaturation.toString(),
      saturationRank: smith.result.rank,
      saturationEqualsFullH1: smith.result.rank === h1Rank,
      quotientByWallLattice: {
        freeRank,
        torsionInvariantFactors,
        presentation: formatQuotient(freeRank, torsionInvariantFactors),
      },
      wallClasses: wallVectors.map((wall, index) => ({
        wallId: wall.id,
        coordinatePairs: coordinatePairs(wallCoordinates[index]),
        saturationCoordinatePairs: coordinatePairs(
          wallSaturationCoordinates[index],
        ),
        cocycleDigest: sparseVectorDigest(wall),
      })),
      saturationBasis: saturationCocycles.map((cocycle, index) => ({
        id: cocycle.id,
        coordinatePairs: coordinatePairs(saturationCoordinates[index]),
        cocycle: serializableVector(cocycle),
      })),
      wallCoordinateDigest: matrixDigest(wallMatrix, wallVectors.length),
      smithLeftTransformDigest: matrixDigest(
        smith.result.leftTransform,
        h1Rank,
      ),
      smithLeftInverseDigest: matrixDigest(smith.result.leftInverse, h1Rank),
      smithRightTransformDigest: matrixDigest(
        smith.result.rightTransform,
        wallVectors.length,
      ),
      smithRightInverseDigest: matrixDigest(
        smith.result.rightInverse,
        wallVectors.length,
      ),
      smithOperationCount: smith.tracker.operations,
      maximumSmithBitLength: smith.tracker.maximumBitLength,
      checks: {
        everyWallClosed,
        wallCoordinatesReconstructCocycles,
        smithTransformsReplay,
        smithTransformsHaveIntegralInverses,
        invariantFactorsDivideSuccessors,
        saturationBasisReconstructs,
        wallSaturationCoordinatesReconstruct,
        wallSaturationCertified,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ResourceBoundError) stopReason = message;
    else errors.push(message);
  }

  const uniqueErrors = [...new Set(errors)].sort(compareStrings);
  checks.allClaimedChecksPassed =
    uniqueErrors.length === 0 &&
    checks.sourceDigestsWellFormed &&
    checks.boundaryDigestMatches &&
    h1 !== undefined &&
    Object.values(h1.checks).every(Boolean) &&
    walls !== undefined &&
    Object.values(walls.checks).every(Boolean);
  return makeCertificate({
    schemaVersion: 1,
    kind: "scalable-generic-integral-h1-completion",
    status: checks.allClaimedChecksPassed
      ? "passed"
      : stopReason === undefined
        ? "failed"
        : "incomplete",
    method: "sparse-kernel-left-inverse-modular-minor-wall-smith",
    algorithmVersion: ALGORITHM_VERSION,
    source,
    budgets,
    ...(boundarySummary === undefined ? {} : { boundary: boundarySummary }),
    ...(h1 === undefined ? {} : { h1 }),
    ...(walls === undefined ? {} : { walls }),
    checks,
    ...(stopReason === undefined ? {} : { stopReason }),
    errors: uniqueErrors,
  });
}

export function replayScalableIntegralH1Completion(
  input: ScalableIntegralH1CompletionInput,
  storedInput: unknown,
): ScalableIntegralH1CompletionReplay {
  const checks: ScalableIntegralH1CompletionReplay["checks"] = {
    envelopeRecognized: false,
    storedDigestValid: false,
    exactRebuildMatches: false,
  };
  const errors: string[] = [];
  let rebuiltCertificateDigest: string | undefined;
  try {
    if (
      storedInput === null ||
      typeof storedInput !== "object" ||
      Array.isArray(storedInput)
    ) {
      throw new Error(
        "The stored scalable H1 completion certificate must be an object.",
      );
    }
    const stored = storedInput as ScalableIntegralH1CompletionCertificate;
    checks.envelopeRecognized =
      stored.schemaVersion === 1 &&
      stored.kind === "scalable-generic-integral-h1-completion" &&
      stored.method === "sparse-kernel-left-inverse-modular-minor-wall-smith" &&
      stored.algorithmVersion === ALGORITHM_VERSION &&
      ["passed", "incomplete", "failed"].includes(stored.status);
    if (!checks.envelopeRecognized)
      errors.push("The stored certificate envelope is not recognized.");
    checks.storedDigestValid =
      typeof stored.certificateDigest === "string" &&
      stored.certificateDigest ===
        computeScalableIntegralH1CompletionCertificateDigest(stored);
    if (!checks.storedDigestValid)
      errors.push("The stored certificate digest is stale.");
    const rebuilt = certifyScalableIntegralH1Completion({
      ...input,
      budgets: stored.budgets,
    });
    rebuiltCertificateDigest = rebuilt.certificateDigest;
    checks.exactRebuildMatches =
      canonicalSha256(rebuilt) === canonicalSha256(stored);
    if (!checks.exactRebuildMatches)
      errors.push("Exact replay differs from the stored certificate.");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const uniqueErrors = [...new Set(errors)].sort(compareStrings);
  const status =
    uniqueErrors.length === 0 && Object.values(checks).every(Boolean)
      ? "passed"
      : "failed";
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "scalable-generic-integral-h1-completion-replay" as const,
    status: status as "passed" | "failed",
    checks,
    ...(rebuiltCertificateDigest === undefined
      ? {}
      : { rebuiltCertificateDigest }),
    errors: uniqueErrors,
  };
  return { ...withoutDigest, replayDigest: canonicalSha256(withoutDigest) };
}
