import { parseCoxeterSystemInput } from "../coxeter";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedGeometricEdge,
  type StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  type StreamedTrackBIntegralCocycleBasis,
} from "./streamedTrackB";

const ALGORITHM_VERSION =
  "tree-gauge-bigint-smith-left-inverse-modular-rank-v1";
const ACTION_HASH_CHUNK_SIZE = 4_096;

export interface GenericActionH1Budgets {
  maxCoxeterRank?: number;
  maxDegree?: number;
  maxGeneratorEntries?: number;
  maxSphericalSubsets?: number;
  maxSphericalOrbitEntries?: number;
  maxSphericalSubgroupElements?: number;
  maxGeometricEdges?: number;
  maxRankTwoCells?: number;
  maxCotreeEdges?: number;
  maxBoundaryNonzeros?: number;
  maxDenseEntries?: number;
  maxWalls?: number;
  maxWallPotentialEntries?: number;
  maxSmithOperations?: number;
  maxIntermediateBitLength?: number;
  maxModularPrimeAttempts?: number;
}

export type GenericActionH1StageId =
  | "source-action-replay"
  | "quotient-two-skeleton"
  | "tree-gauged-boundary"
  | "integral-kernel"
  | "wall-saturation";

export interface GenericActionH1Stage {
  id: GenericActionH1StageId;
  status: "passed" | "incomplete" | "failed" | "not-run";
  detail: string;
}

export interface GenericActionH1SparseVector {
  id: string;
  entries: Array<[number, string]>;
}

export interface GenericActionH1Certificate {
  schemaVersion: 1;
  kind: "generic-certified-action-integral-h1-wall-lattice";
  status: "passed" | "incomplete" | "failed";
  method: "tree-gauge-exact-integer-kernel-and-wall-smith";
  algorithmVersion: typeof ALGORITHM_VERSION;
  source: {
    systemCanonicalSha256: string;
    actionRowsSha256: string;
    suppliedTorsionFreeCertificateSha256: string;
    replayedTorsionFreeCertificateSha256?: string;
    candidateId: string;
    degree: number;
    generatorCount: number;
    oracleStructureHash?: string;
    oracleActionRowsCanonicalSha256?: string;
  };
  budgets: Required<GenericActionH1Budgets>;
  stages: GenericActionH1Stage[];
  graph?: {
    vertexCount: number;
    geometricEdgeCount: number;
    treeEdgeCount: number;
    cotreeEdgeCount: number;
    rootPoint: 0;
    treeDigest: string;
    cotreeEdges: Array<{
      column: number;
      edgeIndex: number;
      edgeId: string;
    }>;
    cotreeDigest: string;
  };
  boundary?: {
    rowCount: number;
    columnCount: number;
    nonzeroCount: number;
    maximumAbsoluteCoefficient: string;
    sparseBoundaryDigest: string;
    checks: {
      everyRankTwoCellStreamed: boolean;
      everySignedBoundaryClosesInC0: boolean;
    };
  };
  h1?: {
    rank: number;
    isomorphicTo: string;
    relationRank: number;
    smithDiagonal: string[];
    smithOperationCount: number;
    smithColumnTransformDigest: string;
    smithColumnInverseDigest: string;
    modularRankWitness: {
      prime: number;
      rank: number;
      attempt: number;
      matrixDigest: string;
    };
    basis: GenericActionH1SparseVector[];
    leftInverseRows: GenericActionH1SparseVector[];
    latticeBasisDigest: string;
    cocycleSectionDigest: string | null;
    checks: {
      smithDiagonalCanonical: boolean;
      columnTransformsInverse: boolean;
      basisClosed: boolean;
      basisHasIntegralLeftInverse: boolean;
      exactModularRankMatchesCodimension: boolean;
      fullIntegralKernelCertified: boolean;
    };
  };
  walls?: {
    wallCount: number;
    twoSidedWallCount: number;
    oneSidedWallIds: string[];
    wallClasses: Array<{
      wallId: string;
      cotreeVectorDigest: string;
      coordinatePairs: Array<[number, string]>;
    }>;
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
    wallCoordinateDigest: string;
    smithLeftTransformDigest: string;
    smithRightTransformDigest: string;
    checks: {
      everyRecordedWallTwoSided: boolean;
      everyWallCocycleClosed: boolean;
      wallCoordinatesReconstructCocycles: boolean;
      smithTransformsReplay: boolean;
      smithTransformsUnimodular: boolean;
      invariantFactorsDivideSuccessors: boolean;
      wallSaturationCertified: boolean;
    };
  };
  checks: {
    suppliedCertificateBoundToAction: boolean;
    independentTorsionFreeReplayPassed: boolean;
    quotientGraphConnected: boolean;
    allClaimedChecksPassed: boolean;
  };
  stopReason?: string;
  errors: string[];
  warnings: string[];
  nonClaims: string[];
  certificateDigest: string;
}

export interface GenericActionH1BuildResult {
  certificate: GenericActionH1Certificate;
  /** Null exactly when the calculation did not pass or b1=0. */
  integralCocycleBasis: StreamedTrackBIntegralCocycleBasis | null;
}

export interface GenericActionH1Replay {
  schemaVersion: 1;
  kind: "generic-certified-action-integral-h1-wall-lattice-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    storedCertificateDigestValid: boolean;
    actionRootedReconstructionMatches: boolean;
  };
  rebuiltCertificateDigest?: string;
  errors: string[];
  replayDigest: string;
}

const DEFAULT_BUDGETS: Required<GenericActionH1Budgets> = {
  maxCoxeterRank: 12,
  maxDegree: 4_096,
  maxGeneratorEntries: 32_768,
  maxSphericalSubsets: 4_096,
  maxSphericalOrbitEntries: 262_144,
  maxSphericalSubgroupElements: 100_000,
  maxGeometricEdges: 8_192,
  maxRankTwoCells: 8_192,
  maxCotreeEdges: 128,
  maxBoundaryNonzeros: 65_536,
  maxDenseEntries: 65_536,
  maxWalls: 128,
  maxWallPotentialEntries: 262_144,
  maxSmithOperations: 2_000_000,
  maxIntermediateBitLength: 4_096,
  maxModularPrimeAttempts: 16,
};

class ResourceBoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceBoundError";
  }
}

interface SparseBoundaryRow {
  cellId: string;
  entries: Array<[number, bigint]>;
}

interface TreeGauge {
  parent: Int32Array;
  parentGenerator: Int16Array;
  treeEdge: Uint8Array;
  reachedPointCount: number;
  treeDigest: string;
}

interface SmithTracker {
  operations: number;
  maximumBitLength: number;
  budgets: Required<GenericActionH1Budgets>;
}

type ColumnOperation =
  | { kind: "swap"; left: number; right: number }
  | { kind: "add"; source: number; target: number; multiple: bigint }
  | {
      kind: "combine";
      left: number;
      right: number;
      a: bigint;
      b: bigint;
      c: bigint;
      d: bigint;
    };

interface SmithResult {
  diagonalMatrix: bigint[][];
  diagonal: bigint[];
  rank: number;
  leftTransform: bigint[][] | null;
  rightTransform: bigint[][];
  rightInverse: bigint[][];
  columnOperations: ColumnOperation[];
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveBudgets(
  supplied: GenericActionH1Budgets | undefined,
): Required<GenericActionH1Budgets> {
  const expectedKeys = Object.keys(DEFAULT_BUDGETS).sort();
  const unknownKeys = Object.keys(supplied ?? {})
    .filter((key) => !expectedKeys.includes(key))
    .sort();
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown generic H1 budget keys: ${unknownKeys.join(", ")}.`,
    );
  }
  const result = { ...DEFAULT_BUDGETS, ...supplied };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
  }
  return result;
}

function stageList(): GenericActionH1Stage[] {
  return [
    "source-action-replay",
    "quotient-two-skeleton",
    "tree-gauged-boundary",
    "integral-kernel",
    "wall-saturation",
  ].map((id) => ({
    id: id as GenericActionH1StageId,
    status: "not-run" as const,
    detail: "Not reached.",
  }));
}

function setStage(
  stages: GenericActionH1Stage[],
  id: GenericActionH1StageId,
  status: GenericActionH1Stage["status"],
  detail: string,
): void {
  const target = stages.find((candidate) => candidate.id === id);
  if (!target) throw new Error(`Unknown H1 stage ${id}.`);
  target.status = status;
  target.detail = detail;
}

function actionRowsSha256(accepted: TorsionFreeCandidateResult): string {
  const candidate = accepted.candidate;
  const rowDigests = candidate.generatorImages.map((row, generator) => {
    const chunks: string[] = [];
    for (let start = 0; start < row.length; start += ACTION_HASH_CHUNK_SIZE) {
      chunks.push(
        canonicalSha256({
          chunkIndex: chunks.length,
          start,
          images: row.slice(start, start + ACTION_HASH_CHUNK_SIZE),
        }),
      );
    }
    return canonicalSha256({ generator, length: row.length, chunks });
  });
  return canonicalSha256({
    schemaVersion: 1,
    method: "fixed-permutation-row-chunk-tree",
    degree: candidate.index,
    rowDigests,
  });
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
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

function bitLength(value: bigint): number {
  const magnitude = abs(value);
  return magnitude === 0n ? 0 : magnitude.toString(2).length;
}

function touch(tracker: SmithTracker, values: readonly bigint[]): void {
  tracker.operations += 1;
  if (tracker.operations > tracker.budgets.maxSmithOperations) {
    throw new ResourceBoundError(
      `Exact integer reduction exceeded ${tracker.budgets.maxSmithOperations} operations.`,
    );
  }
  for (const value of values) {
    const bits = bitLength(value);
    tracker.maximumBitLength = Math.max(tracker.maximumBitLength, bits);
    if (bits > tracker.budgets.maxIntermediateBitLength) {
      throw new ResourceBoundError(
        `An exact intermediate reached ${bits} bits; the bound is ${tracker.budgets.maxIntermediateBitLength}.`,
      );
    }
  }
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

function matrixDigest(
  matrix: readonly (readonly bigint[])[],
  columnCount = matrix[0]?.length ?? 0,
): string {
  if (matrix.some((row) => row.length !== columnCount)) {
    throw new Error("Cannot digest a nonrectangular integer matrix.");
  }
  return canonicalSha256({
    rowCount: matrix.length,
    columnCount,
    rows: matrix.map((row) => row.map((value) => value.toString())),
  });
}

function sparseVector(
  id: string,
  values: readonly bigint[],
): GenericActionH1SparseVector {
  return {
    id,
    entries: values.flatMap((value, index) =>
      value === 0n
        ? []
        : ([[index, value.toString()]] as Array<[number, string]>),
    ),
  };
}

function denseFromSparse(
  rows: readonly SparseBoundaryRow[],
  columnCount: number,
): bigint[][] {
  return rows.map((row) => {
    const dense = Array<bigint>(columnCount).fill(0n);
    for (const [column, coefficient] of row.entries)
      dense[column] = coefficient;
    return dense;
  });
}

function multiplyMatrices(
  left: readonly (readonly bigint[])[],
  right: readonly (readonly bigint[])[],
): bigint[][] {
  const leftRows = left.length;
  const shared = left[0]?.length ?? 0;
  const rightRows = right.length;
  const rightColumns = right[0]?.length ?? 0;
  if (shared !== rightRows) {
    if (shared === 0 && rightRows === 0) {
      return Array.from({ length: leftRows }, () =>
        Array<bigint>(rightColumns).fill(0n),
      );
    }
    throw new Error(
      `Matrix dimensions ${leftRows}x${shared} and ${rightRows}x${rightColumns} do not multiply.`,
    );
  }
  return Array.from({ length: leftRows }, (_unused, row) =>
    Array.from({ length: rightColumns }, (_unusedColumn, column) => {
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

function isIdentity(matrix: readonly (readonly bigint[])[]): boolean {
  return matrix.every((row, rowIndex) =>
    row.every((value, column) => value === (rowIndex === column ? 1n : 0n)),
  );
}

function swapRows(
  matrix: bigint[][],
  left: number,
  right: number,
  tracker: SmithTracker,
): void {
  if (left === right) return;
  [matrix[left], matrix[right]] = [matrix[right], matrix[left]];
  touch(tracker, []);
}

function addRowMultiple(
  matrix: bigint[][],
  source: number,
  target: number,
  multiple: bigint,
  tracker: SmithTracker,
): void {
  if (multiple === 0n) return;
  const updated = matrix[target].map(
    (value, column) => value + multiple * matrix[source][column],
  );
  touch(tracker, updated);
  matrix[target] = updated;
}

function combineRows(
  matrix: bigint[][],
  left: number,
  right: number,
  coefficients: readonly [bigint, bigint, bigint, bigint],
  tracker: SmithTracker,
): void {
  const [a, b, c, d] = coefficients;
  const oldLeft = matrix[left];
  const oldRight = matrix[right];
  const newLeft = oldLeft.map(
    (value, column) => a * value + b * oldRight[column],
  );
  const newRight = oldLeft.map(
    (value, column) => c * value + d * oldRight[column],
  );
  touch(tracker, [...newLeft, ...newRight]);
  matrix[left] = newLeft;
  matrix[right] = newRight;
}

function negateRow(
  matrix: bigint[][],
  row: number,
  tracker: SmithTracker,
): void {
  const updated = matrix[row].map((value) => -value);
  touch(tracker, updated);
  matrix[row] = updated;
}

function swapColumnsInPlace(
  matrix: bigint[][],
  left: number,
  right: number,
): void {
  if (left === right) return;
  for (const row of matrix) [row[left], row[right]] = [row[right], row[left]];
}

function addColumnMultipleInPlace(
  matrix: bigint[][],
  source: number,
  target: number,
  multiple: bigint,
): bigint[] {
  const changed: bigint[] = [];
  for (const row of matrix) {
    row[target] += multiple * row[source];
    changed.push(row[target]);
  }
  return changed;
}

function combineColumnsInPlace(
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

function applyColumnSwap(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  left: number,
  right: number,
  operations: ColumnOperation[],
  tracker: SmithTracker,
): void {
  if (left === right) return;
  swapColumnsInPlace(matrix, left, right);
  swapColumnsInPlace(transform, left, right);
  [inverse[left], inverse[right]] = [inverse[right], inverse[left]];
  operations.push({ kind: "swap", left, right });
  touch(tracker, []);
}

function applyColumnAddition(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  source: number,
  target: number,
  multiple: bigint,
  operations: ColumnOperation[],
  tracker: SmithTracker,
): void {
  if (multiple === 0n) return;
  const changed = [
    ...addColumnMultipleInPlace(matrix, source, target, multiple),
    ...addColumnMultipleInPlace(transform, source, target, multiple),
  ];
  // V' = V(I+qE_source,target), hence V'^-1 updates row source.
  const inverseSource = inverse[source].map(
    (value, column) => value - multiple * inverse[target][column],
  );
  inverse[source] = inverseSource;
  changed.push(...inverseSource);
  operations.push({ kind: "add", source, target, multiple });
  touch(tracker, changed);
}

function applyColumnCombination(
  matrix: bigint[][],
  transform: bigint[][],
  inverse: bigint[][],
  left: number,
  right: number,
  coefficients: readonly [bigint, bigint, bigint, bigint],
  operations: ColumnOperation[],
  tracker: SmithTracker,
): void {
  const [a, b, c, d] = coefficients;
  const determinant = a * d - b * c;
  if (determinant !== 1n && determinant !== -1n) {
    throw new Error("A Smith column combination is not unimodular.");
  }
  const changed = [
    ...combineColumnsInPlace(matrix, left, right, coefficients),
    ...combineColumnsInPlace(transform, left, right, coefficients),
  ];
  const oldLeft = inverse[left];
  const oldRight = inverse[right];
  const newLeft = oldLeft.map(
    (value, column) => determinant * (d * value - c * oldRight[column]),
  );
  const newRight = oldLeft.map(
    (value, column) => determinant * (-b * value + a * oldRight[column]),
  );
  inverse[left] = newLeft;
  inverse[right] = newRight;
  changed.push(...newLeft, ...newRight);
  operations.push({ kind: "combine", left, right, a, b, c, d });
  touch(tracker, changed);
}

function smithNormalForm(
  input: readonly (readonly bigint[])[],
  columnCount: number,
  tracker: SmithTracker,
  trackLeftTransform: boolean,
): SmithResult {
  const rowCount = input.length;
  if (input.some((row) => row.length !== columnCount)) {
    throw new Error("The Smith input is not rectangular.");
  }
  const matrix = cloneMatrix(input);
  const leftTransform = trackLeftTransform ? identity(rowCount) : null;
  const rightTransform = identity(columnCount);
  const rightInverse = identity(columnCount);
  const columnOperations: ColumnOperation[] = [];
  const limit = Math.min(rowCount, columnCount);

  for (let pivotIndex = 0; pivotIndex < limit; pivotIndex += 1) {
    let selectedRow = -1;
    let selectedColumn = -1;
    for (let row = pivotIndex; row < rowCount && selectedRow < 0; row += 1) {
      for (let column = pivotIndex; column < columnCount; column += 1) {
        if (matrix[row][column] !== 0n) {
          selectedRow = row;
          selectedColumn = column;
          break;
        }
      }
    }
    if (selectedRow < 0) break;
    if (selectedRow !== pivotIndex) {
      swapRows(matrix, pivotIndex, selectedRow, tracker);
      if (leftTransform)
        swapRows(leftTransform, pivotIndex, selectedRow, tracker);
    }
    applyColumnSwap(
      matrix,
      rightTransform,
      rightInverse,
      pivotIndex,
      selectedColumn,
      columnOperations,
      tracker,
    );

    while (true) {
      for (let row = pivotIndex + 1; row < rowCount; row += 1) {
        const pivot = matrix[pivotIndex][pivotIndex];
        const value = matrix[row][pivotIndex];
        if (value === 0n) continue;
        if (pivot !== 0n && value % pivot === 0n) {
          const multiple = -(value / pivot);
          addRowMultiple(matrix, pivotIndex, row, multiple, tracker);
          if (leftTransform)
            addRowMultiple(leftTransform, pivotIndex, row, multiple, tracker);
        } else {
          const bezout = extendedGcd(pivot, value);
          const coefficients: [bigint, bigint, bigint, bigint] = [
            bezout.leftCoefficient,
            bezout.rightCoefficient,
            -(value / bezout.gcd),
            pivot / bezout.gcd,
          ];
          combineRows(matrix, pivotIndex, row, coefficients, tracker);
          if (leftTransform)
            combineRows(leftTransform, pivotIndex, row, coefficients, tracker);
        }
      }

      for (let column = pivotIndex + 1; column < columnCount; column += 1) {
        const pivot = matrix[pivotIndex][pivotIndex];
        const value = matrix[pivotIndex][column];
        if (value === 0n) continue;
        if (pivot !== 0n && value % pivot === 0n) {
          applyColumnAddition(
            matrix,
            rightTransform,
            rightInverse,
            pivotIndex,
            column,
            -(value / pivot),
            columnOperations,
            tracker,
          );
        } else {
          const bezout = extendedGcd(pivot, value);
          applyColumnCombination(
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
            columnOperations,
            tracker,
          );
        }
      }

      const rowAndColumnClear =
        Array.from(
          { length: rowCount - pivotIndex - 1 },
          (_unused, offset) => matrix[pivotIndex + 1 + offset][pivotIndex],
        ).every((value) => value === 0n) &&
        matrix[pivotIndex].slice(pivotIndex + 1).every((value) => value === 0n);
      if (!rowAndColumnClear) continue;

      const pivot = matrix[pivotIndex][pivotIndex];
      let badRow = -1;
      for (let row = pivotIndex + 1; row < rowCount && badRow < 0; row += 1) {
        for (let column = pivotIndex + 1; column < columnCount; column += 1) {
          if (pivot === 0n || matrix[row][column] % pivot !== 0n) {
            badRow = row;
            break;
          }
        }
      }
      if (badRow < 0) break;
      addRowMultiple(matrix, badRow, pivotIndex, 1n, tracker);
      if (leftTransform)
        addRowMultiple(leftTransform, badRow, pivotIndex, 1n, tracker);
    }

    if (matrix[pivotIndex][pivotIndex] < 0n) {
      negateRow(matrix, pivotIndex, tracker);
      if (leftTransform) negateRow(leftTransform, pivotIndex, tracker);
    }
  }

  const diagonal = Array.from(
    { length: limit },
    (_unused, index) => matrix[index][index],
  ).filter((value) => value !== 0n);
  const diagonalShape = matrix.every((row, rowIndex) =>
    row.every((value, column) => rowIndex === column || value === 0n),
  );
  const divides = diagonal.every(
    (value, index) =>
      index === diagonal.length - 1 || diagonal[index + 1] % value === 0n,
  );
  if (!diagonalShape || !divides || diagonal.some((value) => value <= 0n)) {
    throw new Error(
      "Exact Smith reduction did not reach canonical diagonal form.",
    );
  }
  if (
    !isIdentity(multiplyMatrices(rightInverse, rightTransform)) ||
    !isIdentity(multiplyMatrices(rightTransform, rightInverse))
  ) {
    throw new Error("The Smith column transform inverse failed exact replay.");
  }
  return {
    diagonalMatrix: matrix,
    diagonal,
    rank: diagonal.length,
    leftTransform,
    rightTransform,
    rightInverse,
    columnOperations,
  };
}

function modularInverse(value: bigint, prime: bigint): bigint {
  const normalized = ((value % prime) + prime) % prime;
  const result = extendedGcd(normalized, prime);
  if (result.gcd !== 1n)
    throw new Error("A nonzero field element is not invertible.");
  return ((result.leftCoefficient % prime) + prime) % prime;
}

function rankModuloPrime(
  input: readonly (readonly bigint[])[],
  columnCount: number,
  prime: number,
  tracker: SmithTracker,
): number {
  const modulus = BigInt(prime);
  const matrix = input.map((row) =>
    row.map((value) => ((value % modulus) + modulus) % modulus),
  );
  let pivotRow = 0;
  for (
    let column = 0;
    column < columnCount && pivotRow < matrix.length;
    column += 1
  ) {
    let selected = pivotRow;
    while (selected < matrix.length && matrix[selected][column] === 0n)
      selected += 1;
    if (selected === matrix.length) continue;
    if (selected !== pivotRow)
      [matrix[selected], matrix[pivotRow]] = [
        matrix[pivotRow],
        matrix[selected],
      ];
    const inverse = modularInverse(matrix[pivotRow][column], modulus);
    matrix[pivotRow] = matrix[pivotRow].map(
      (value) => (value * inverse) % modulus,
    );
    touch(tracker, matrix[pivotRow]);
    for (let row = pivotRow + 1; row < matrix.length; row += 1) {
      const coefficient = matrix[row][column];
      if (coefficient === 0n) continue;
      matrix[row] = matrix[row].map(
        (value, index) =>
          (((value - coefficient * matrix[pivotRow][index]) % modulus) +
            modulus) %
          modulus,
      );
      touch(tracker, matrix[row]);
    }
    pivotRow += 1;
  }
  return pivotRow;
}

function isPrime(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 2) return false;
  if (value % 2 === 0) return value === 2;
  for (let divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function findModularRankWitness(
  matrix: readonly (readonly bigint[])[],
  columnCount: number,
  expectedRank: number,
  budgets: Required<GenericActionH1Budgets>,
  tracker: SmithTracker,
): { prime: number; rank: number; attempt: number; matrixDigest: string } {
  let candidate = 1_000_003;
  for (
    let attempt = 1;
    attempt <= budgets.maxModularPrimeAttempts;
    attempt += 1
  ) {
    while (!isPrime(candidate)) candidate += 2;
    const rank = rankModuloPrime(matrix, columnCount, candidate, tracker);
    if (rank === expectedRank) {
      return {
        prime: candidate,
        rank,
        attempt,
        matrixDigest: canonicalSha256({
          sparseMatrixDigest: matrixDigest(matrix, columnCount),
          columnCount,
          prime: candidate,
          rank,
        }),
      };
    }
    candidate += 2;
  }
  throw new ResourceBoundError(
    `No exact modular rank witness matched rank ${expectedRank} in ${budgets.maxModularPrimeAttempts} prime attempts.`,
  );
}

function determinantBareiss(matrix: readonly (readonly bigint[])[]): bigint {
  const size = matrix.length;
  if (matrix.some((row) => row.length !== size)) {
    throw new Error("Bareiss determinant requires a square matrix.");
  }
  if (size === 0) return 1n;
  if (size === 1) return matrix[0][0];
  const work = cloneMatrix(matrix);
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
          throw new Error("Bareiss division was not exact.");
        }
        work[row][column] = numerator / previousPivot;
      }
      work[row][pivotIndex] = 0n;
    }
    previousPivot = pivot;
  }
  return sign * work[size - 1][size - 1];
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

function collectGeometricEdges(
  oracle: StreamedLawfulDavisOracle,
): StreamedGeometricEdge[] {
  const edges = Array<StreamedGeometricEdge | undefined>(
    oracle.geometricEdgeCount,
  );
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const edge = oracle.geometricEdge(point, generator);
      const previous = edges[edge.edgeIndex];
      if (previous && canonicalSha256(previous) !== canonicalSha256(edge)) {
        throw new Error(`Geometric edge ${edge.edgeIndex} is not stable.`);
      }
      edges[edge.edgeIndex] = edge;
    }
  }
  if (edges.some((edge) => edge === undefined)) {
    throw new Error("The quotient edge enumeration has a gap.");
  }
  return edges as StreamedGeometricEdge[];
}

function buildTreeGauge(oracle: StreamedLawfulDavisOracle): TreeGauge {
  const parent = new Int32Array(oracle.degree);
  parent.fill(-1);
  const parentGenerator = new Int16Array(oracle.degree);
  parentGenerator.fill(-1);
  const treeEdge = new Uint8Array(oracle.geometricEdgeCount);
  const queue = new Uint32Array(oracle.degree);
  parent[0] = 0;
  queue[0] = 0;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const point = queue[head++];
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const target = oracle.neighbor(point, generator);
      if (parent[target] >= 0) continue;
      parent[target] = point;
      parentGenerator[target] = generator;
      treeEdge[oracle.geometricEdge(point, generator).edgeIndex] = 1;
      queue[tail++] = target;
    }
  }
  const records = Array.from({ length: oracle.degree }, (_unused, point) => ({
    point,
    parent: parent[point],
    parentGenerator: parentGenerator[point],
  }));
  return {
    parent,
    parentGenerator,
    treeEdge,
    reachedPointCount: tail,
    treeDigest: canonicalSha256({
      schemaVersion: 1,
      method: "canonical-generator-order-bfs-tree",
      oracleStructureHash: oracle.structureHash,
      rootPoint: 0,
      records,
    }),
  };
}

function buildBoundaryRows(
  oracle: StreamedLawfulDavisOracle,
  cotreeColumnByEdge: Int32Array,
  budgets: Required<GenericActionH1Budgets>,
): {
  rows: SparseBoundaryRow[];
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
  everySignedBoundaryClosesInC0: boolean;
  digest: string;
} {
  const rows: SparseBoundaryRow[] = [];
  let nonzeroCount = 0;
  let maximumAbsoluteCoefficient = 0n;
  let everySignedBoundaryClosesInC0 = true;
  oracle.forEachRankTwoCell((relationCell) => {
    const vertexBoundary = new Map<number, bigint>();
    const coefficients = new Map<number, bigint>();
    for (const occurrence of relationCell.boundary) {
      vertexBoundary.set(
        occurrence.sourcePoint,
        (vertexBoundary.get(occurrence.sourcePoint) ?? 0n) - 1n,
      );
      vertexBoundary.set(
        occurrence.targetPoint,
        (vertexBoundary.get(occurrence.targetPoint) ?? 0n) + 1n,
      );
      const column = cotreeColumnByEdge[occurrence.edgeIndex];
      if (column < 0) continue;
      coefficients.set(
        column,
        (coefficients.get(column) ?? 0n) + BigInt(occurrence.traversal),
      );
    }
    everySignedBoundaryClosesInC0 &&= [...vertexBoundary.values()].every(
      (value) => value === 0n,
    );
    const entries = [...coefficients.entries()]
      .filter(([, value]) => value !== 0n)
      .sort(([left], [right]) => left - right);
    nonzeroCount += entries.length;
    if (nonzeroCount > budgets.maxBoundaryNonzeros) {
      throw new ResourceBoundError(
        `The tree-gauged boundary exceeded ${budgets.maxBoundaryNonzeros} nonzeros.`,
      );
    }
    for (const [, value] of entries) {
      maximumAbsoluteCoefficient =
        abs(value) > maximumAbsoluteCoefficient
          ? abs(value)
          : maximumAbsoluteCoefficient;
    }
    rows.push({ cellId: oracle.cellId(relationCell.cell), entries });
  });
  if (rows.length !== oracle.rankTwoCellCount) {
    throw new Error(
      `The oracle advertised ${oracle.rankTwoCellCount} rank-two cells but streamed ${rows.length}.`,
    );
  }
  return {
    rows,
    nonzeroCount,
    maximumAbsoluteCoefficient,
    everySignedBoundaryClosesInC0,
    digest: canonicalSha256({
      schemaVersion: 1,
      method: "canonical-tree-gauged-rank-two-boundary",
      oracleStructureHash: oracle.structureHash,
      rows: rows.map((row) => ({
        cellId: row.cellId,
        entries: row.entries.map(([column, value]) => [
          column,
          value.toString(),
        ]),
      })),
    }),
  };
}

function wallCoefficient(
  oracle: StreamedLawfulDavisOracle,
  point: number,
  generator: number,
): { wallId: string; coefficient: bigint } {
  const geometric = oracle.geometricEdge(point, generator);
  const traversal = geometric.sourcePoint === point ? 1n : -1n;
  const binding = oracle.wallBinding(point, generator);
  return {
    wallId: binding.wallId,
    coefficient: BigInt(binding.edgeParity) * traversal,
  };
}

function buildWallCotreeVectors(input: {
  oracle: StreamedLawfulDavisOracle;
  tree: TreeGauge;
  cotreeEdges: readonly StreamedGeometricEdge[];
  budgets: Required<GenericActionH1Budgets>;
}): {
  wallIds: string[];
  oneSidedWallIds: string[];
  vectors: bigint[][];
} {
  const { oracle, tree, cotreeEdges, budgets } = input;
  const wallIds = oracle.walls.walls
    .filter((wall) => wall.twoSided)
    .map((wall) => wall.id)
    .sort(compareStrings);
  const oneSidedWallIds = oracle.walls.walls
    .filter((wall) => !wall.twoSided)
    .map((wall) => wall.id)
    .sort(compareStrings);
  if (oracle.walls.wallCount > budgets.maxWalls) {
    throw new ResourceBoundError(
      `The quotient has ${oracle.walls.wallCount} walls; the bound is ${budgets.maxWalls}.`,
    );
  }
  if (wallIds.length * oracle.degree > budgets.maxWallPotentialEntries) {
    throw new ResourceBoundError(
      `Wall tree gauge needs ${wallIds.length * oracle.degree} potential entries; the bound is ${budgets.maxWallPotentialEntries}.`,
    );
  }
  const wallIndex = new Map(wallIds.map((wallId, index) => [wallId, index]));
  const potentials = Array.from({ length: wallIds.length }, () =>
    Array<bigint>(oracle.degree).fill(0n),
  );
  const depths = new Int32Array(oracle.degree);
  const points = Array.from(
    { length: oracle.degree - 1 },
    (_unused, offset) => offset + 1,
  );
  for (const point of points) {
    let cursor = point;
    let depth = 0;
    while (tree.parent[cursor] !== cursor && tree.parent[cursor] >= 0) {
      cursor = tree.parent[cursor];
      depth += 1;
    }
    depths[point] = depth;
  }
  // The BFS parent always precedes its child, but retaining this explicit
  // order makes the potential construction independent of point labels.
  points.sort((left, right) => depths[left] - depths[right] || left - right);
  for (const point of points) {
    const parent = tree.parent[point];
    const generator = tree.parentGenerator[point];
    if (parent < 0 || generator < 0)
      throw new Error(`Missing tree parent for q${point}.`);
    for (let wall = 0; wall < wallIds.length; wall += 1) {
      potentials[wall][point] = potentials[wall][parent];
    }
    const crossing = wallCoefficient(oracle, parent, generator);
    const index = wallIndex.get(crossing.wallId);
    if (index !== undefined) potentials[index][point] += crossing.coefficient;
  }

  const vectors = wallIds.map((_wallId, wall) =>
    cotreeEdges.map((edge) => {
      const crossing = wallCoefficient(
        oracle,
        edge.sourcePoint,
        edge.generator,
      );
      return (
        potentials[wall][edge.sourcePoint] -
        potentials[wall][edge.targetPoint] +
        (wallIndex.get(crossing.wallId) === wall ? crossing.coefficient : 0n)
      );
    }),
  );
  return { wallIds, oneSidedWallIds, vectors };
}

function everyZero(matrix: readonly (readonly bigint[])[]): boolean {
  return matrix.every((row) => row.every((value) => value === 0n));
}

function certificatePayload(
  certificate: GenericActionH1Certificate,
): Omit<GenericActionH1Certificate, "certificateDigest"> {
  const { certificateDigest, ...payload } = certificate;
  void certificateDigest;
  return payload;
}

export function computeGenericActionH1CertificateDigest(
  certificate: GenericActionH1Certificate,
): string {
  return canonicalSha256(certificatePayload(certificate));
}

function sparseBoundaryVectorClosed(
  rows: readonly SparseBoundaryRow[],
  vector: readonly bigint[],
): boolean {
  return rows.every((row) => {
    let sum = 0n;
    for (const [column, coefficient] of row.entries) {
      sum += coefficient * vector[column];
    }
    return sum === 0n;
  });
}

function makeCocycleBasis(input: {
  oracle: StreamedLawfulDavisOracle;
  cotreeColumnByEdge: Int32Array;
  kernelMatrix: readonly (readonly bigint[])[];
  latticeBasisDigest: string;
}): StreamedTrackBIntegralCocycleBasis {
  const coordinateCount = input.kernelMatrix[0]?.length ?? 0;
  const coordinateIds = Array.from(
    { length: coordinateCount },
    (_unused, coordinate) => `eta${coordinate}`,
  );
  const edgeCoordinatePairs = (point: number, generator: number) => {
    const geometric = input.oracle.geometricEdge(point, generator);
    const column = input.cotreeColumnByEdge[geometric.edgeIndex];
    if (column < 0) return [];
    const traversal = geometric.sourcePoint === point ? 1n : -1n;
    return input.kernelMatrix[column].flatMap((value, coordinate) =>
      value === 0n
        ? []
        : ([[coordinate, (traversal * value).toString()]] as Array<
            readonly [number, string]
          >),
    );
  };
  const provisional = { coordinateIds, edgeCoordinatePairs };
  const expectedCocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(
      input.oracle,
      provisional,
    );
  return {
    ...provisional,
    latticeBasisDigest: input.latticeBasisDigest,
    expectedCocycleSectionDigest,
  };
}

/**
 * Compute H^1 of the quotient from its exact 2-skeleton. The spanning-tree
 * gauge is integral, so the result is the integer kernel of the rank-two
 * boundary matrix rather than merely a rational nullspace.
 */
export function buildGenericActionH1Certificate(
  systemInput: unknown,
  accepted: TorsionFreeCandidateResult,
  options: { budgets?: GenericActionH1Budgets } = {},
): GenericActionH1BuildResult {
  const system = parseCoxeterSystemInput(systemInput);
  const budgets = resolveBudgets(options.budgets);
  const stages = stageList();
  const candidate = accepted.candidate;
  const source: GenericActionH1Certificate["source"] = {
    systemCanonicalSha256: canonicalSha256(system),
    actionRowsSha256: actionRowsSha256(accepted),
    suppliedTorsionFreeCertificateSha256: canonicalSha256(accepted.certificate),
    candidateId: candidate.id,
    degree: candidate.index,
    generatorCount: system.rank,
  };
  const checks: GenericActionH1Certificate["checks"] = {
    suppliedCertificateBoundToAction: false,
    independentTorsionFreeReplayPassed: false,
    quotientGraphConnected: false,
    allClaimedChecksPassed: false,
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const nonClaims = [
    "The bounded dense exact backend is not a scalability claim for large compact-H5 actions.",
    "No fibering, Morse-link, or kernel-finite-generation conclusion follows from H1 alone.",
    "One-sided quotient walls are recorded but do not contribute integral cooriented wall classes.",
  ];
  let status: GenericActionH1Certificate["status"] = "incomplete";
  let currentStage: GenericActionH1StageId = "source-action-replay";
  let stopReason: string | undefined;
  let graph: GenericActionH1Certificate["graph"];
  let boundary: GenericActionH1Certificate["boundary"];
  let h1: GenericActionH1Certificate["h1"];
  let walls: GenericActionH1Certificate["walls"];
  let runtimeBasis: StreamedTrackBIntegralCocycleBasis | null = null;

  const finish = (): GenericActionH1BuildResult => {
    checks.allClaimedChecksPassed =
      status === "passed" &&
      checks.suppliedCertificateBoundToAction &&
      checks.independentTorsionFreeReplayPassed &&
      checks.quotientGraphConnected &&
      boundary !== undefined &&
      Object.values(boundary.checks).every(Boolean) &&
      h1 !== undefined &&
      Object.values(h1.checks).every(Boolean) &&
      walls !== undefined &&
      Object.values(walls.checks).every(Boolean);
    if (status === "passed" && !checks.allClaimedChecksPassed) {
      status = "failed";
      errors.push("A passed H1 result contains a failed mandatory check.");
      runtimeBasis = null;
    }
    const withoutDigest: Omit<GenericActionH1Certificate, "certificateDigest"> =
      {
        schemaVersion: 1,
        kind: "generic-certified-action-integral-h1-wall-lattice",
        status,
        method: "tree-gauge-exact-integer-kernel-and-wall-smith",
        algorithmVersion: ALGORITHM_VERSION,
        source,
        budgets,
        stages,
        ...(graph ? { graph } : {}),
        ...(boundary ? { boundary } : {}),
        ...(h1 ? { h1 } : {}),
        ...(walls ? { walls } : {}),
        checks,
        ...(stopReason ? { stopReason } : {}),
        errors: [...new Set(errors)].sort(compareStrings),
        warnings: [...new Set(warnings)].sort(compareStrings),
        nonClaims,
      };
    return {
      certificate: {
        ...withoutDigest,
        certificateDigest: canonicalSha256(withoutDigest),
      },
      integralCocycleBasis:
        status === "passed" && (h1?.rank ?? 0) > 0 ? runtimeBasis : null,
    };
  };

  try {
    if (system.rank > budgets.maxCoxeterRank) {
      throw new ResourceBoundError(
        `Coxeter rank ${system.rank} exceeds the bound ${budgets.maxCoxeterRank}.`,
      );
    }
    if (!Number.isSafeInteger(candidate.index) || candidate.index < 1) {
      throw new Error("The action degree is not a positive safe integer.");
    }
    if (candidate.index > budgets.maxDegree) {
      throw new ResourceBoundError(
        `Action degree ${candidate.index} exceeds the bound ${budgets.maxDegree}.`,
      );
    }
    const generatorEntries = candidate.generatorImages.reduce(
      (sum, row) => sum + row.length,
      0,
    );
    if (generatorEntries > budgets.maxGeneratorEntries) {
      throw new ResourceBoundError(
        `The action supplies ${generatorEntries} generator entries; the bound is ${budgets.maxGeneratorEntries}.`,
      );
    }
    const candidateSubsetCount = 2 ** system.rank - 1;
    if (candidateSubsetCount > budgets.maxSphericalSubsets) {
      throw new ResourceBoundError(
        `Complete spherical planning needs ${candidateSubsetCount} subsets; the bound is ${budgets.maxSphericalSubsets}.`,
      );
    }
    const plan = planSphericalSpecialSubgroups(system, {
      maxRankForExhaustiveEnumeration: system.rank,
      maxSubsetsToCheck: budgets.maxSphericalSubsets,
    });
    if (plan.status !== "complete") {
      throw new ResourceBoundError(
        plan.warnings.join(" ") || "Spherical planning was incomplete.",
      );
    }
    if (
      (plan.sphericalSubgroups.length + 1) * candidate.index >
      budgets.maxSphericalOrbitEntries
    ) {
      throw new ResourceBoundError(
        `The spherical orbit tables need ${(plan.sphericalSubgroups.length + 1) * candidate.index} entries; the bound is ${budgets.maxSphericalOrbitEntries}.`,
      );
    }
    const replayedCertificate = certifyTorsionFreeAction(
      system,
      candidate,
      plan,
      {
        maxSphericalSubgroupElements: budgets.maxSphericalSubgroupElements,
        maxWitnesses: 8_192,
      },
    );
    source.replayedTorsionFreeCertificateSha256 =
      canonicalSha256(replayedCertificate);
    checks.suppliedCertificateBoundToAction =
      accepted.certificate.status === "passed" &&
      canonicalSha256(accepted.certificate) ===
        canonicalSha256(replayedCertificate);
    checks.independentTorsionFreeReplayPassed =
      replayedCertificate.status === "passed" &&
      Object.values(replayedCertificate.checks).every(Boolean);
    if (!checks.suppliedCertificateBoundToAction) {
      throw new Error(
        "The supplied torsion-free certificate is not a passed certificate for these action rows.",
      );
    }
    if (!checks.independentTorsionFreeReplayPassed) {
      if (replayedCertificate.status === "incomplete") {
        throw new ResourceBoundError(
          replayedCertificate.errors.join(" ") ||
            "Independent torsion-free replay was incomplete.",
        );
      }
      throw new Error(
        replayedCertificate.errors.join(" ") ||
          "Independent torsion-free replay failed.",
      );
    }
    const predictedEdges = (candidate.index * system.rank) / 2;
    const predictedRankTwoCells = plan.sphericalSubgroups
      .filter((subgroup) => subgroup.rank === 2)
      .reduce(
        (sum, subgroup) =>
          sum + candidate.index / Number(subgroup.order.decimal),
        0,
      );
    if (
      !Number.isSafeInteger(predictedEdges) ||
      predictedEdges > budgets.maxGeometricEdges
    ) {
      throw new ResourceBoundError(
        `The exact quotient needs ${predictedEdges} geometric edges; the bound is ${budgets.maxGeometricEdges}.`,
      );
    }
    if (
      !Number.isSafeInteger(predictedRankTwoCells) ||
      predictedRankTwoCells > budgets.maxRankTwoCells
    ) {
      throw new ResourceBoundError(
        `The exact quotient needs ${predictedRankTwoCells} rank-two cells; the bound is ${budgets.maxRankTwoCells}.`,
      );
    }
    setStage(
      stages,
      "source-action-replay",
      "passed",
      "The complete action and every spherical special subgroup replayed exactly.",
    );

    currentStage = "quotient-two-skeleton";
    const oracle = buildStreamedLawfulDavisOracle({
      system,
      generatorImages: candidate.generatorImages,
    });
    source.oracleStructureHash = oracle.structureHash;
    source.oracleActionRowsCanonicalSha256 = oracle.actionRowsCanonicalSha256;
    if (
      oracle.geometricEdgeCount !== predictedEdges ||
      oracle.rankTwoCellCount !== predictedRankTwoCells
    ) {
      throw new Error(
        "The action-rooted quotient counts differ from the spherical plan.",
      );
    }
    const edges = collectGeometricEdges(oracle);
    const tree = buildTreeGauge(oracle);
    checks.quotientGraphConnected = tree.reachedPointCount === oracle.degree;
    if (!checks.quotientGraphConnected) {
      throw new Error(
        `The quotient graph reaches ${tree.reachedPointCount}/${oracle.degree} vertices.`,
      );
    }
    const cotreeColumnByEdge = new Int32Array(oracle.geometricEdgeCount);
    cotreeColumnByEdge.fill(-1);
    const cotreeEdges: StreamedGeometricEdge[] = [];
    for (const edge of edges) {
      if (tree.treeEdge[edge.edgeIndex]) continue;
      cotreeColumnByEdge[edge.edgeIndex] = cotreeEdges.length;
      cotreeEdges.push(edge);
    }
    if (cotreeEdges.length > budgets.maxCotreeEdges) {
      throw new ResourceBoundError(
        `The tree gauge has ${cotreeEdges.length} cotree variables; the dense exact bound is ${budgets.maxCotreeEdges}.`,
      );
    }
    graph = {
      vertexCount: oracle.degree,
      geometricEdgeCount: oracle.geometricEdgeCount,
      treeEdgeCount: oracle.degree - 1,
      cotreeEdgeCount: cotreeEdges.length,
      rootPoint: 0,
      treeDigest: tree.treeDigest,
      cotreeEdges: cotreeEdges.map((edge, column) => ({
        column,
        edgeIndex: edge.edgeIndex,
        edgeId: edge.id,
      })),
      cotreeDigest: canonicalSha256(
        cotreeEdges.map((edge, column) => ({
          column,
          edgeIndex: edge.edgeIndex,
          edgeId: edge.id,
        })),
      ),
    };
    setStage(
      stages,
      "quotient-two-skeleton",
      "passed",
      `Built the exact connected ${oracle.degree}-vertex quotient 2-skeleton.`,
    );

    currentStage = "tree-gauged-boundary";
    if (
      oracle.rankTwoCellCount * cotreeEdges.length >
      budgets.maxDenseEntries
    ) {
      throw new ResourceBoundError(
        `The dense boundary needs ${oracle.rankTwoCellCount * cotreeEdges.length} entries; the bound is ${budgets.maxDenseEntries}.`,
      );
    }
    const sparseBoundary = buildBoundaryRows(
      oracle,
      cotreeColumnByEdge,
      budgets,
    );
    const relationMatrix = denseFromSparse(
      sparseBoundary.rows,
      cotreeEdges.length,
    );
    boundary = {
      rowCount: sparseBoundary.rows.length,
      columnCount: cotreeEdges.length,
      nonzeroCount: sparseBoundary.nonzeroCount,
      maximumAbsoluteCoefficient:
        sparseBoundary.maximumAbsoluteCoefficient.toString(),
      sparseBoundaryDigest: sparseBoundary.digest,
      checks: {
        everyRankTwoCellStreamed:
          sparseBoundary.rows.length === oracle.rankTwoCellCount,
        everySignedBoundaryClosesInC0:
          sparseBoundary.everySignedBoundaryClosesInC0,
      },
    };
    if (!Object.values(boundary.checks).every(Boolean)) {
      throw new Error("A signed rank-two boundary does not close in C0.");
    }
    setStage(
      stages,
      "tree-gauged-boundary",
      "passed",
      `Recorded ${boundary.rowCount} exact boundary rows with ${boundary.nonzeroCount} nonzeros.`,
    );

    currentStage = "integral-kernel";
    const tracker: SmithTracker = {
      operations: 0,
      maximumBitLength: 0,
      budgets,
    };
    const relationSmith = smithNormalForm(
      relationMatrix,
      cotreeEdges.length,
      tracker,
      false,
    );
    const relationRank = relationSmith.rank;
    const h1Rank = cotreeEdges.length - relationRank;
    const kernelMatrix = relationSmith.rightTransform.map((row) =>
      row.slice(relationRank),
    );
    const leftInverse = relationSmith.rightInverse.slice(relationRank);
    const basisClosed =
      h1Rank === 0 ||
      relationMatrix.length === 0 ||
      everyZero(multiplyMatrices(relationMatrix, kernelMatrix));
    const basisHasIntegralLeftInverse =
      h1Rank === 0 || isIdentity(multiplyMatrices(leftInverse, kernelMatrix));
    const columnTransformsInverse =
      isIdentity(
        multiplyMatrices(
          relationSmith.rightInverse,
          relationSmith.rightTransform,
        ),
      ) &&
      isIdentity(
        multiplyMatrices(
          relationSmith.rightTransform,
          relationSmith.rightInverse,
        ),
      );
    const modularRankWitness = findModularRankWitness(
      relationMatrix,
      cotreeEdges.length,
      relationRank,
      budgets,
      tracker,
    );
    const smithDiagonalCanonical = relationSmith.diagonal.every(
      (value, index) =>
        value > 0n &&
        (index === relationSmith.diagonal.length - 1 ||
          relationSmith.diagonal[index + 1] % value === 0n),
    );
    const exactModularRankMatchesCodimension =
      modularRankWitness.rank === cotreeEdges.length - h1Rank;
    const fullIntegralKernelCertified =
      basisClosed &&
      basisHasIntegralLeftInverse &&
      exactModularRankMatchesCodimension;
    if (
      !smithDiagonalCanonical ||
      !columnTransformsInverse ||
      !fullIntegralKernelCertified
    ) {
      throw new Error(
        "The exact integral-kernel certificate failed an independent check.",
      );
    }
    const basis = Array.from({ length: h1Rank }, (_unused, coordinate) =>
      sparseVector(
        `eta${coordinate}`,
        kernelMatrix.map((row) => row[coordinate]),
      ),
    );
    const leftInverseRows = leftInverse.map((row, coordinate) =>
      sparseVector(`lambda${coordinate}`, row),
    );
    const latticeBasisDigest = canonicalSha256({
      schemaVersion: 1,
      method: "exact-integral-kernel-with-left-inverse",
      oracleStructureHash: oracle.structureHash,
      cotreeDigest: graph.cotreeDigest,
      sparseBoundaryDigest: boundary.sparseBoundaryDigest,
      basis,
      leftInverseRows,
    });
    if (h1Rank > 0) {
      runtimeBasis = makeCocycleBasis({
        oracle,
        cotreeColumnByEdge,
        kernelMatrix,
        latticeBasisDigest,
      });
    }
    h1 = {
      rank: h1Rank,
      isomorphicTo: formatFreeAbelianGroup(h1Rank),
      relationRank,
      smithDiagonal: relationSmith.diagonal.map((value) => value.toString()),
      smithOperationCount: tracker.operations,
      smithColumnTransformDigest: matrixDigest(relationSmith.rightTransform),
      smithColumnInverseDigest: matrixDigest(relationSmith.rightInverse),
      modularRankWitness,
      basis,
      leftInverseRows,
      latticeBasisDigest,
      cocycleSectionDigest: runtimeBasis?.expectedCocycleSectionDigest ?? null,
      checks: {
        smithDiagonalCanonical,
        columnTransformsInverse,
        basisClosed,
        basisHasIntegralLeftInverse,
        exactModularRankMatchesCodimension,
        fullIntegralKernelCertified,
      },
    };
    setStage(
      stages,
      "integral-kernel",
      "passed",
      `Certified H^1 as ${h1.isomorphicTo} by an integral kernel, left inverse, and exact modular rank witness.`,
    );

    currentStage = "wall-saturation";
    const wallData = buildWallCotreeVectors({
      oracle,
      tree,
      cotreeEdges,
      budgets,
    });
    const everyWallCocycleClosed = wallData.vectors.every((vector) =>
      sparseBoundaryVectorClosed(sparseBoundary.rows, vector),
    );
    const wallCoordinates = wallData.vectors.map((vector) =>
      leftInverse.map((row) =>
        row.reduce(
          (sum, coefficient, column) => sum + coefficient * vector[column],
          0n,
        ),
      ),
    );
    const wallCoordinateMatrix = Array.from(
      { length: h1Rank },
      (_unused, coordinate) => wallCoordinates.map((wall) => wall[coordinate]),
    );
    const wallVectorMatrix = Array.from(
      { length: cotreeEdges.length },
      (_unused, column) => wallData.vectors.map((vector) => vector[column]),
    );
    const wallCoordinatesReconstructCocycles =
      h1Rank === 0
        ? wallData.vectors.every((vector) =>
            vector.every((value) => value === 0n),
          )
        : matricesEqual(
            multiplyMatrices(kernelMatrix, wallCoordinateMatrix),
            wallVectorMatrix,
          );
    const wallSmith = smithNormalForm(
      wallCoordinateMatrix,
      wallData.wallIds.length,
      tracker,
      true,
    );
    const wallRank = wallSmith.rank;
    const invariantFactors = wallSmith.diagonal.map((value) =>
      value.toString(),
    );
    const wallIndexInSaturation = wallSmith.diagonal
      .reduce((product, value) => product * value, 1n)
      .toString();
    const torsionInvariantFactors = wallSmith.diagonal
      .filter((value) => value > 1n)
      .map((value) => value.toString());
    const quotientFreeRank = h1Rank - wallRank;
    const smithTransformsReplay =
      h1Rank === 0
        ? true
        : matricesEqual(
            multiplyMatrices(
              multiplyMatrices(
                wallSmith.leftTransform as bigint[][],
                wallCoordinateMatrix,
              ),
              wallSmith.rightTransform,
            ),
            wallSmith.diagonalMatrix,
          );
    const smithTransformsUnimodular =
      abs(determinantBareiss(wallSmith.leftTransform ?? [])) === 1n &&
      abs(determinantBareiss(wallSmith.rightTransform)) === 1n;
    const invariantFactorsDivideSuccessors = wallSmith.diagonal.every(
      (value, index) =>
        index === wallSmith.diagonal.length - 1 ||
        wallSmith.diagonal[index + 1] % value === 0n,
    );
    const wallSaturationCertified =
      everyWallCocycleClosed &&
      wallCoordinatesReconstructCocycles &&
      smithTransformsReplay &&
      smithTransformsUnimodular &&
      invariantFactorsDivideSuccessors;
    if (!wallSaturationCertified) {
      throw new Error(
        "The wall lattice failed exact coordinate or Smith replay.",
      );
    }
    const wallClasses = wallData.wallIds.map((wallId, wall) => ({
      wallId,
      cotreeVectorDigest: canonicalSha256(
        wallData.vectors[wall].map((value) => value.toString()),
      ),
      coordinatePairs: wallCoordinates[wall].flatMap((value, coordinate) =>
        value === 0n
          ? []
          : ([[coordinate, value.toString()]] as Array<[number, string]>),
      ),
    }));
    walls = {
      wallCount: oracle.walls.wallCount,
      twoSidedWallCount: wallData.wallIds.length,
      oneSidedWallIds: wallData.oneSidedWallIds,
      wallClasses,
      wallRank,
      smithInvariantFactors: invariantFactors,
      wallIndexInSaturation,
      saturationRank: wallRank,
      saturationEqualsFullH1: wallRank === h1Rank,
      quotientByWallLattice: {
        freeRank: quotientFreeRank,
        torsionInvariantFactors,
        presentation: formatQuotient(quotientFreeRank, torsionInvariantFactors),
      },
      wallCoordinateDigest: canonicalSha256(wallClasses),
      smithLeftTransformDigest: matrixDigest(wallSmith.leftTransform ?? []),
      smithRightTransformDigest: matrixDigest(wallSmith.rightTransform),
      checks: {
        everyRecordedWallTwoSided:
          wallData.wallIds.length + wallData.oneSidedWallIds.length ===
            oracle.walls.wallCount &&
          wallData.wallIds.every(
            (wallId) =>
              oracle.walls.walls.find((wall) => wall.id === wallId)
                ?.twoSided === true,
          ),
        everyWallCocycleClosed,
        wallCoordinatesReconstructCocycles,
        smithTransformsReplay,
        smithTransformsUnimodular,
        invariantFactorsDivideSuccessors,
        wallSaturationCertified,
      },
    };
    if (wallData.oneSidedWallIds.length > 0) {
      warnings.push(
        `${wallData.oneSidedWallIds.length} one-sided quotient wall(s) were excluded from the integral wall sublattice.`,
      );
    }
    setStage(
      stages,
      "wall-saturation",
      "passed",
      `The ${wallData.wallIds.length} integral wall classes have rank ${wallRank} and index ${wallIndexInSaturation} in their saturation.`,
    );
    status = "passed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stopReason = message;
    if (error instanceof ResourceBoundError) {
      status = "incomplete";
      setStage(stages, currentStage, "incomplete", message);
      warnings.push(
        "A configured exact resource bound stopped the calculation; no H1 rank or wall-saturation conclusion follows.",
      );
    } else {
      status = "failed";
      setStage(stages, currentStage, "failed", message);
      errors.push(message);
    }
    runtimeBasis = null;
  }
  return finish();
}

export function replayGenericActionH1Certificate(
  systemInput: unknown,
  accepted: TorsionFreeCandidateResult,
  storedInput: unknown,
): GenericActionH1Replay {
  const checks: GenericActionH1Replay["checks"] = {
    envelopeRecognized: false,
    storedCertificateDigestValid: false,
    actionRootedReconstructionMatches: false,
  };
  const errors: string[] = [];
  let rebuiltCertificateDigest: string | undefined;
  try {
    if (
      storedInput === null ||
      typeof storedInput !== "object" ||
      Array.isArray(storedInput)
    ) {
      throw new Error("The stored H1 certificate must be an object.");
    }
    const stored = storedInput as GenericActionH1Certificate;
    checks.envelopeRecognized =
      stored.schemaVersion === 1 &&
      stored.kind === "generic-certified-action-integral-h1-wall-lattice" &&
      stored.method === "tree-gauge-exact-integer-kernel-and-wall-smith" &&
      stored.algorithmVersion === ALGORITHM_VERSION &&
      ["passed", "incomplete", "failed"].includes(stored.status);
    if (!checks.envelopeRecognized) {
      errors.push(
        "The generic action H1 certificate envelope is not recognized.",
      );
    }
    checks.storedCertificateDigestValid =
      typeof stored.certificateDigest === "string" &&
      stored.certificateDigest ===
        computeGenericActionH1CertificateDigest(stored);
    if (!checks.storedCertificateDigestValid) {
      errors.push("The stored H1 certificate digest is stale.");
    }
    const rebuilt = buildGenericActionH1Certificate(systemInput, accepted, {
      budgets: stored.budgets,
    }).certificate;
    rebuiltCertificateDigest = rebuilt.certificateDigest;
    checks.actionRootedReconstructionMatches =
      canonicalSha256(stored) === canonicalSha256(rebuilt);
    if (!checks.actionRootedReconstructionMatches) {
      errors.push(
        "The H1 certificate differs from exact action-rooted replay.",
      );
    }
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
    kind: "generic-certified-action-integral-h1-wall-lattice-replay" as const,
    status: status as "passed" | "failed",
    checks,
    ...(rebuiltCertificateDigest ? { rebuiltCertificateDigest } : {}),
    errors: uniqueErrors,
  };
  return {
    ...withoutDigest,
    replayDigest: canonicalSha256(withoutDigest),
  };
}
