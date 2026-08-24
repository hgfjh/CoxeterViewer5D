import { canonicalSha256, canonicalizeJson } from "../utils/canonicalSha256";

const ALGORITHM_VERSION =
  "sparse-rref-pivot-minor-right-kernel-chart-v1" as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const INTEGER_PATTERN = /^(0|-?[1-9][0-9]*)$/u;
const MAX_EXACT_NUMBER_PRIME = 67_108_859;
const MATRIX_DIGEST_CHUNK_ROWS = 4_096;

export interface GenericSparseIntegerRow {
  row: number;
  entries: Array<[column: number, coefficient: string]>;
}

/**
 * Structural sparse-matrix format shared by the in-process executor and any
 * external exact backend. Rows are explicit, including empty rows, so the
 * digest cannot lose relation multiplicities.
 */
export interface GenericSparseIntegerMatrix {
  schemaVersion: 1;
  rowCount: number;
  columnCount: number;
  rows: GenericSparseIntegerRow[];
}

/**
 * Synchronous one-pass row source used by scalable replay. Implementations may
 * decode a file, regenerate a boundary, or read a database cursor; replay keeps
 * only one digest chunk, the selected pivot minor, and the kernel certificate.
 */
export interface GenericSparseIntegerMatrixReader {
  schemaVersion: 1;
  rowCount: number;
  columnCount: number;
  forEachRow(visitor: (row: GenericSparseIntegerRow) => void): void;
}

export interface GenericSparseMatrixSourceBinding {
  /** Caller-defined role such as `action`, `oracle`, or `preparation`. */
  id: string;
  sha256: string;
}

export interface GenericSparseModularRankWorkerRequest {
  schemaVersion: 1;
  kind: "generic-sparse-modular-rank-worker-request";
  algorithmVersion: typeof ALGORITHM_VERSION;
  modulusPrime: number;
  sourceBindings: GenericSparseMatrixSourceBinding[];
  matrix: GenericSparseIntegerMatrix;
  matrixDigest: string;
  bindingDigest: string;
  requestDigest: string;
}

export interface GenericSparseModularKernelVector {
  chartColumn: number;
  entries: Array<[column: number, residue: number]>;
}

export interface GenericSparseModularRankCertificate {
  schemaVersion: 1;
  kind: "generic-sparse-modular-rank-certificate";
  status: "passed";
  method: "nonzero-pivot-minor-plus-right-kernel-identity-chart";
  algorithmVersion: typeof ALGORITHM_VERSION;
  source: {
    sourceBindings: GenericSparseMatrixSourceBinding[];
    matrixDigest: string;
    bindingDigest: string;
    workerRequestDigest: string;
  };
  matrix: {
    rowCount: number;
    columnCount: number;
    nonzeroCount: number;
    maximumAbsoluteCoefficient: string;
  };
  modulusPrime: number;
  rank: number;
  nullity: number;
  lowerBound: {
    pivotRows: number[];
    pivotColumns: number[];
    minorDeterminantResidue: number;
    minorDigest: string;
  };
  upperBound: {
    freeColumns: number[];
    kernelBasis: GenericSparseModularKernelVector[];
    kernelBasisDigest: string;
  };
  backend: {
    name: string;
    version: string;
    algorithm: string;
    exactFieldArithmetic: true;
  };
  /** Producer diagnostics. Replay recomputes the proof and trusts none of these counters. */
  execution: {
    fieldOperations: number;
    pivotRowScans: number;
    maximumWorkingNonzeros: number;
    kernelNonzeroCount: number;
  };
  certificateDigest: string;
}

export interface GenericSparseModularRankBudgets {
  maxRows?: number;
  maxColumns?: number;
  maxCoefficientDigits?: number;
  maxInputNonzeros?: number;
  maxWorkingNonzeros?: number;
  maxFieldOperations?: number;
  maxPivotRowScans?: number;
  maxRank?: number;
  maxNullity?: number;
  maxKernelNonzeros?: number;
}

export interface GenericSparseModularRankReplay {
  schemaVersion: 1;
  kind: "generic-sparse-modular-rank-certificate-replay";
  status: "passed" | "incomplete" | "failed";
  budgets: Required<GenericSparseModularRankBudgets>;
  checks: {
    envelopeRecognized: boolean;
    matrixCanonical: boolean;
    matrixDigestMatches: boolean;
    sourceBindingsMatch: boolean;
    bindingDigestMatches: boolean;
    workerRequestDigestMatches: boolean;
    certificateDigestMatches: boolean;
    modulusIsPrime: boolean;
    dimensionsMatch: boolean;
    pivotMinorHasClaimedNonzeroDeterminant: boolean;
    everyKernelVectorIsClosed: boolean;
    kernelChartIsIdentity: boolean;
    lowerAndUpperBoundsMeet: boolean;
  };
  certifiedRank?: number;
  certifiedNullity?: number;
  stopReason?: string;
  errors: string[];
  replayDigest: string;
}

interface NormalizedMatrixData {
  matrix: GenericSparseIntegerMatrix;
  rows: Array<Map<number, bigint>>;
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
  digest: string;
}

interface StreamedMatrixSummary {
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
  digest: string;
}

interface MutableSparseRow {
  sourceRow: number;
  values: Map<number, bigint>;
}

interface OperationTracker {
  fieldOperations: number;
  pivotRowScans: number;
  workingNonzeros: number;
  maximumWorkingNonzeros: number;
  budgets: Required<GenericSparseModularRankBudgets>;
}

const DEFAULT_BUDGETS: Required<GenericSparseModularRankBudgets> = {
  maxRows: 50_000,
  maxColumns: 50_000,
  maxCoefficientDigits: 4_096,
  maxInputNonzeros: 2_000_000,
  maxWorkingNonzeros: 4_000_000,
  maxFieldOperations: 30_000_000,
  maxPivotRowScans: 50_000_000,
  maxRank: 20_000,
  maxNullity: 4_096,
  maxKernelNonzeros: 4_000_000,
};

/** A valid calculation stopped at an explicit caller-controlled resource cap. */
export class GenericSparseModularRankResourceBoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenericSparseModularRankResourceBoundError";
  }
}

function resolveBudgets(
  supplied: GenericSparseModularRankBudgets | undefined,
): Required<GenericSparseModularRankBudgets> {
  const expectedKeys = new Set(Object.keys(DEFAULT_BUDGETS));
  const unknownKeys = Object.keys(supplied ?? {}).filter(
    (key) => !expectedKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown generic sparse modular-rank budget keys: ${unknownKeys.sort().join(", ")}.`,
    );
  }
  const budgets = { ...DEFAULT_BUDGETS, ...supplied };
  for (const [name, value] of Object.entries(budgets)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a nonnegative safe integer.`);
    }
  }
  return budgets;
}

function requireSafeDimension(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${path} must be a nonnegative safe integer.`);
  }
  return value as number;
}

function parseInteger(
  value: unknown,
  path: string,
  maxCoefficientDigits: number,
): bigint {
  if (typeof value !== "string" || !INTEGER_PATTERN.test(value)) {
    throw new Error(`${path} must be a canonical decimal integer string.`);
  }
  const digitCount = value.length - (value.startsWith("-") ? 1 : 0);
  if (digitCount > maxCoefficientDigits) {
    throw new GenericSparseModularRankResourceBoundError(
      `${path} exceeds ${maxCoefficientDigits} coefficient digits.`,
    );
  }
  return BigInt(value);
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function normalizeSourceBindings(
  bindings: readonly GenericSparseMatrixSourceBinding[],
): GenericSparseMatrixSourceBinding[] {
  if (!Array.isArray(bindings) || bindings.length === 0) {
    throw new Error("At least one caller-supplied source binding is required.");
  }
  const normalized = bindings.map((binding, index) => {
    if (
      binding === null ||
      typeof binding !== "object" ||
      typeof binding.id !== "string" ||
      binding.id.length === 0
    ) {
      throw new Error(`sourceBindings[${index}].id must be nonempty.`);
    }
    if (
      typeof binding.sha256 !== "string" ||
      !SHA256_PATTERN.test(binding.sha256)
    ) {
      throw new Error(
        `sourceBindings[${index}].sha256 must be a lowercase SHA-256 digest.`,
      );
    }
    return { id: binding.id, sha256: binding.sha256 };
  });
  normalized.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].id === normalized[index].id) {
      throw new Error(`Duplicate source binding id ${normalized[index].id}.`);
    }
  }
  return normalized;
}

function sourceBindingsEqual(
  left: readonly GenericSparseMatrixSourceBinding[],
  right: readonly GenericSparseMatrixSourceBinding[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (binding, index) =>
        binding.id === right[index]?.id &&
        binding.sha256 === right[index]?.sha256,
    )
  );
}

function normalizeMatrix(
  input: GenericSparseIntegerMatrix,
  budgets: Required<GenericSparseModularRankBudgets> = DEFAULT_BUDGETS,
): NormalizedMatrixData {
  if (input === null || typeof input !== "object") {
    throw new Error("The sparse matrix must be an object.");
  }
  if (input.schemaVersion !== 1) {
    throw new Error("The sparse matrix schemaVersion must be 1.");
  }
  const rowCount = requireSafeDimension(input.rowCount, "matrix.rowCount");
  const columnCount = requireSafeDimension(
    input.columnCount,
    "matrix.columnCount",
  );
  if (rowCount > budgets.maxRows) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse matrix row count exceeds ${budgets.maxRows}.`,
    );
  }
  if (columnCount > budgets.maxColumns) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse matrix column count exceeds ${budgets.maxColumns}.`,
    );
  }
  if (!Array.isArray(input.rows) || input.rows.length !== rowCount) {
    throw new Error("The sparse matrix must explicitly contain every row.");
  }

  let nonzeroCount = 0;
  let maximumAbsoluteCoefficient = 0n;
  const rows: Array<Map<number, bigint>> = [];
  const canonicalRows: GenericSparseIntegerRow[] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const supplied = input.rows[rowIndex];
    if (
      supplied === null ||
      typeof supplied !== "object" ||
      supplied.row !== rowIndex ||
      !Array.isArray(supplied.entries)
    ) {
      throw new Error(
        `matrix.rows[${rowIndex}] is not the explicit row ${rowIndex}.`,
      );
    }
    const values = new Map<number, bigint>();
    const entries: Array<[number, string]> = [];
    let previousColumn = -1;
    for (
      let entryIndex = 0;
      entryIndex < supplied.entries.length;
      entryIndex += 1
    ) {
      const entry = supplied.entries[entryIndex];
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error(
          `matrix.rows[${rowIndex}].entries[${entryIndex}] must be a pair.`,
        );
      }
      const column = requireSafeDimension(
        entry[0],
        `matrix.rows[${rowIndex}].entries[${entryIndex}][0]`,
      );
      if (column >= columnCount || column <= previousColumn) {
        throw new Error(
          `matrix.rows[${rowIndex}] columns must be strictly increasing and in range.`,
        );
      }
      const coefficient = parseInteger(
        entry[1],
        `matrix.rows[${rowIndex}].entries[${entryIndex}][1]`,
        budgets.maxCoefficientDigits,
      );
      if (coefficient === 0n) {
        throw new Error("Sparse matrix entries must be nonzero.");
      }
      previousColumn = column;
      values.set(column, coefficient);
      entries.push([column, coefficient.toString()]);
      nonzeroCount += 1;
      if (nonzeroCount > budgets.maxInputNonzeros) {
        throw new GenericSparseModularRankResourceBoundError(
          `Sparse matrix nonzero count exceeds ${budgets.maxInputNonzeros}.`,
        );
      }
      maximumAbsoluteCoefficient =
        abs(coefficient) > maximumAbsoluteCoefficient
          ? abs(coefficient)
          : maximumAbsoluteCoefficient;
    }
    rows.push(values);
    canonicalRows.push({ row: rowIndex, entries });
  }
  const matrix: GenericSparseIntegerMatrix = {
    schemaVersion: 1,
    rowCount,
    columnCount,
    rows: canonicalRows,
  };
  const summary = summarizeCanonicalRows({
    rowCount,
    columnCount,
    rows: canonicalRows,
    nonzeroCount,
    maximumAbsoluteCoefficient,
  });
  return {
    matrix,
    rows,
    nonzeroCount,
    maximumAbsoluteCoefficient,
    digest: summary.digest,
  };
}

function matrixDigestFromChunks(input: {
  rowCount: number;
  columnCount: number;
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
  chunkDigests: readonly string[];
}): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "chunked-canonical-explicit-sparse-integer-matrix-v1",
    rowCount: input.rowCount,
    columnCount: input.columnCount,
    nonzeroCount: input.nonzeroCount,
    maximumAbsoluteCoefficient: input.maximumAbsoluteCoefficient.toString(),
    chunkRowCount: MATRIX_DIGEST_CHUNK_ROWS,
    chunkDigests: input.chunkDigests,
  });
}

function summarizeCanonicalRows(input: {
  rowCount: number;
  columnCount: number;
  rows: readonly GenericSparseIntegerRow[];
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
}): StreamedMatrixSummary {
  const chunkDigests: string[] = [];
  for (
    let firstRow = 0;
    firstRow < input.rows.length;
    firstRow += MATRIX_DIGEST_CHUNK_ROWS
  ) {
    chunkDigests.push(
      canonicalSha256({
        schemaVersion: 1,
        method: "canonical-explicit-sparse-integer-matrix-row-chunk",
        chunkIndex: chunkDigests.length,
        firstRow,
        rows: input.rows.slice(firstRow, firstRow + MATRIX_DIGEST_CHUNK_ROWS),
      }),
    );
  }
  return {
    nonzeroCount: input.nonzeroCount,
    maximumAbsoluteCoefficient: input.maximumAbsoluteCoefficient,
    digest: matrixDigestFromChunks({
      rowCount: input.rowCount,
      columnCount: input.columnCount,
      nonzeroCount: input.nonzeroCount,
      maximumAbsoluteCoefficient: input.maximumAbsoluteCoefficient,
      chunkDigests,
    }),
  };
}

/** Validate and return the canonical structural sparse-matrix representation. */
export function normalizeGenericSparseIntegerMatrix(
  input: GenericSparseIntegerMatrix,
  budgets?: GenericSparseModularRankBudgets,
): GenericSparseIntegerMatrix {
  const resolved = resolveBudgets(budgets);
  return normalizeMatrix(input, resolved).matrix;
}

export function computeGenericSparseIntegerMatrixDigest(
  input: GenericSparseIntegerMatrix,
  budgets?: GenericSparseModularRankBudgets,
): string {
  const resolved = resolveBudgets(budgets);
  return normalizeMatrix(input, resolved).digest;
}

function computeBindingDigest(
  sourceBindings: readonly GenericSparseMatrixSourceBinding[],
  matrixDigest: string,
): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "caller-sources-plus-canonical-sparse-matrix",
    sourceBindings,
    matrixDigest,
  });
}

function workerRequestPayload(
  request: GenericSparseModularRankWorkerRequest,
): object {
  // The canonical matrix digest already commits every row. Omitting the raw
  // matrix here lets a streaming verifier reproduce the request binding.
  return {
    schemaVersion: request.schemaVersion,
    kind: request.kind,
    algorithmVersion: request.algorithmVersion,
    modulusPrime: request.modulusPrime,
    sourceBindings: request.sourceBindings,
    matrix: {
      schemaVersion: request.matrix.schemaVersion,
      rowCount: request.matrix.rowCount,
      columnCount: request.matrix.columnCount,
    },
    matrixDigest: request.matrixDigest,
    bindingDigest: request.bindingDigest,
  };
}

export function computeGenericSparseModularRankRequestDigest(
  request: GenericSparseModularRankWorkerRequest,
): string {
  return canonicalSha256(workerRequestPayload(request));
}

function computeWorkerRequestDigestFromHeader(input: {
  modulusPrime: number;
  sourceBindings: readonly GenericSparseMatrixSourceBinding[];
  matrixDigest: string;
  bindingDigest: string;
  rowCount: number;
  columnCount: number;
}): string {
  return canonicalSha256({
    schemaVersion: 1,
    kind: "generic-sparse-modular-rank-worker-request",
    algorithmVersion: ALGORITHM_VERSION,
    modulusPrime: input.modulusPrime,
    sourceBindings: input.sourceBindings,
    matrix: {
      schemaVersion: 1,
      rowCount: input.rowCount,
      columnCount: input.columnCount,
    },
    matrixDigest: input.matrixDigest,
    bindingDigest: input.bindingDigest,
  });
}

export function buildGenericSparseModularRankWorkerRequest(input: {
  matrix: GenericSparseIntegerMatrix;
  sourceBindings: readonly GenericSparseMatrixSourceBinding[];
  modulusPrime?: number;
  budgets?: GenericSparseModularRankBudgets;
}): GenericSparseModularRankWorkerRequest {
  const budgets = resolveBudgets(input.budgets);
  const normalized = normalizeMatrix(input.matrix, budgets);
  const sourceBindings = normalizeSourceBindings(input.sourceBindings);
  const modulusPrime = input.modulusPrime ?? 1_000_003;
  if (!isPrime(modulusPrime)) {
    throw new Error(
      "modulusPrime must be a prime in the supported exact range.",
    );
  }
  const bindingDigest = computeBindingDigest(sourceBindings, normalized.digest);
  const request: GenericSparseModularRankWorkerRequest = {
    schemaVersion: 1,
    kind: "generic-sparse-modular-rank-worker-request",
    algorithmVersion: ALGORITHM_VERSION,
    modulusPrime,
    sourceBindings,
    matrix: normalized.matrix,
    matrixDigest: normalized.digest,
    bindingDigest,
    requestDigest: "",
  };
  request.requestDigest = computeGenericSparseModularRankRequestDigest(request);
  return request;
}

function residue(value: bigint, prime: bigint): bigint {
  const reduced = value % prime;
  return reduced < 0n ? reduced + prime : reduced;
}

function modularInverse(value: bigint, prime: bigint): bigint {
  let oldR = prime;
  let currentR = residue(value, prime);
  let oldT = 0n;
  let currentT = 1n;
  while (currentR !== 0n) {
    const quotient = oldR / currentR;
    [oldR, currentR] = [currentR, oldR - quotient * currentR];
    [oldT, currentT] = [currentT, oldT - quotient * currentT];
  }
  if (oldR !== 1n) throw new Error("A claimed field pivot is not invertible.");
  return residue(oldT, prime);
}

function isPrime(value: number): boolean {
  if (
    !Number.isSafeInteger(value) ||
    value < 2 ||
    value > MAX_EXACT_NUMBER_PRIME
  ) {
    return false;
  }
  if (value % 2 === 0) return value === 2;
  for (let divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function touchFieldOperation(tracker: OperationTracker): void {
  tracker.fieldOperations += 1;
  if (tracker.fieldOperations > tracker.budgets.maxFieldOperations) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse modular elimination exceeded ${tracker.budgets.maxFieldOperations} field operations.`,
    );
  }
}

function touchPivotScan(tracker: OperationTracker): void {
  tracker.pivotRowScans += 1;
  if (tracker.pivotRowScans > tracker.budgets.maxPivotRowScans) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse modular elimination exceeded ${tracker.budgets.maxPivotRowScans} pivot-row scans.`,
    );
  }
}

function setWorkingEntry(
  row: Map<number, bigint>,
  column: number,
  value: bigint,
  tracker: OperationTracker,
): void {
  const existed = row.has(column);
  if (value === 0n) {
    if (existed) {
      row.delete(column);
      tracker.workingNonzeros -= 1;
    }
    return;
  }
  row.set(column, value);
  if (!existed) {
    tracker.workingNonzeros += 1;
    tracker.maximumWorkingNonzeros = Math.max(
      tracker.maximumWorkingNonzeros,
      tracker.workingNonzeros,
    );
    if (tracker.workingNonzeros > tracker.budgets.maxWorkingNonzeros) {
      throw new GenericSparseModularRankResourceBoundError(
        `Sparse modular elimination exceeded ${tracker.budgets.maxWorkingNonzeros} working nonzeros.`,
      );
    }
  }
}

function sparseRref(input: {
  rows: readonly Map<number, bigint>[];
  columnCount: number;
  prime: bigint;
  tracker: OperationTracker;
}): {
  rows: MutableSparseRow[];
  pivotRows: number[];
  pivotColumns: number[];
} {
  const rows: MutableSparseRow[] = input.rows.map((values, sourceRow) => ({
    sourceRow,
    values: new Map(
      [...values.entries()].flatMap(([column, coefficient]) => {
        const reduced = residue(coefficient, input.prime);
        return reduced === 0n ? [] : [[column, reduced] as [number, bigint]];
      }),
    ),
  }));
  input.tracker.workingNonzeros = rows.reduce(
    (sum, row) => sum + row.values.size,
    0,
  );
  input.tracker.maximumWorkingNonzeros = input.tracker.workingNonzeros;
  if (
    input.tracker.workingNonzeros > input.tracker.budgets.maxWorkingNonzeros
  ) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse modular elimination starts above ${input.tracker.budgets.maxWorkingNonzeros} working nonzeros.`,
    );
  }

  const pivotRows: number[] = [];
  const pivotColumns: number[] = [];
  let pivotIndex = 0;
  for (
    let column = 0;
    column < input.columnCount && pivotIndex < rows.length;
    column += 1
  ) {
    let selected = pivotIndex;
    while (selected < rows.length) {
      touchPivotScan(input.tracker);
      if ((rows[selected].values.get(column) ?? 0n) !== 0n) break;
      selected += 1;
    }
    if (selected === rows.length) continue;
    [rows[pivotIndex], rows[selected]] = [rows[selected], rows[pivotIndex]];
    const pivotRow = rows[pivotIndex];
    const inverse = modularInverse(
      pivotRow.values.get(column) ?? 0n,
      input.prime,
    );
    for (const [entryColumn, value] of [...pivotRow.values.entries()]) {
      touchFieldOperation(input.tracker);
      setWorkingEntry(
        pivotRow.values,
        entryColumn,
        residue(value * inverse, input.prime),
        input.tracker,
      );
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      if (rowIndex === pivotIndex) continue;
      const target = rows[rowIndex];
      const factor = target.values.get(column) ?? 0n;
      if (factor === 0n) continue;
      for (const [entryColumn, pivotValue] of pivotRow.values) {
        touchFieldOperation(input.tracker);
        const updated = residue(
          (target.values.get(entryColumn) ?? 0n) - factor * pivotValue,
          input.prime,
        );
        setWorkingEntry(target.values, entryColumn, updated, input.tracker);
      }
    }
    pivotRows.push(pivotRow.sourceRow);
    pivotColumns.push(column);
    pivotIndex += 1;
    if (pivotIndex > input.tracker.budgets.maxRank) {
      throw new GenericSparseModularRankResourceBoundError(
        `Sparse modular rank exceeded ${input.tracker.budgets.maxRank}.`,
      );
    }
  }
  return { rows, pivotRows, pivotColumns };
}

function determinantOfMinor(input: {
  rows: readonly Map<number, bigint>[];
  pivotRows: readonly number[];
  pivotColumns: readonly number[];
  prime: bigint;
  tracker: OperationTracker;
}): bigint {
  const size = input.pivotRows.length;
  if (size !== input.pivotColumns.length) {
    throw new Error("The pivot minor is not square.");
  }
  if (size === 0) return 1n;
  const columnIndex = new Map(
    input.pivotColumns.map((column, index) => [column, index]),
  );
  const work = input.pivotRows.map((sourceRow) => {
    const result = new Map<number, bigint>();
    for (const [column, coefficient] of input.rows[sourceRow]) {
      const minorColumn = columnIndex.get(column);
      if (minorColumn === undefined) continue;
      const reduced = residue(coefficient, input.prime);
      if (reduced !== 0n) result.set(minorColumn, reduced);
    }
    return result;
  });
  let minorNonzeros = work.reduce((sum, row) => sum + row.size, 0);
  if (minorNonzeros > input.tracker.budgets.maxWorkingNonzeros) {
    throw new GenericSparseModularRankResourceBoundError(
      `The selected pivot minor exceeds ${input.tracker.budgets.maxWorkingNonzeros} working nonzeros.`,
    );
  }
  input.tracker.maximumWorkingNonzeros = Math.max(
    input.tracker.maximumWorkingNonzeros,
    minorNonzeros,
  );
  const setMinorEntry = (
    row: Map<number, bigint>,
    column: number,
    value: bigint,
  ) => {
    const existed = row.has(column);
    if (value === 0n) {
      if (existed) {
        row.delete(column);
        minorNonzeros -= 1;
      }
      return;
    }
    row.set(column, value);
    if (!existed) {
      minorNonzeros += 1;
      input.tracker.maximumWorkingNonzeros = Math.max(
        input.tracker.maximumWorkingNonzeros,
        minorNonzeros,
      );
      if (minorNonzeros > input.tracker.budgets.maxWorkingNonzeros) {
        throw new GenericSparseModularRankResourceBoundError(
          `The selected pivot minor exceeded ${input.tracker.budgets.maxWorkingNonzeros} working nonzeros.`,
        );
      }
    }
  };
  let determinant = 1n;
  let sign = 1n;
  for (let column = 0; column < size; column += 1) {
    let selected = column;
    while (selected < size) {
      touchPivotScan(input.tracker);
      if ((work[selected].get(column) ?? 0n) !== 0n) break;
      selected += 1;
    }
    if (selected === size) return 0n;
    if (selected !== column) {
      [work[column], work[selected]] = [work[selected], work[column]];
      sign = -sign;
    }
    const pivot = work[column].get(column) ?? 0n;
    determinant = residue(determinant * pivot, input.prime);
    const inverse = modularInverse(pivot, input.prime);
    for (let row = column + 1; row < size; row += 1) {
      const factor = work[row].get(column) ?? 0n;
      if (factor === 0n) continue;
      const multiplier = residue(factor * inverse, input.prime);
      for (const [entryColumn, pivotValue] of work[column]) {
        if (entryColumn < column) continue;
        touchFieldOperation(input.tracker);
        const updated = residue(
          (work[row].get(entryColumn) ?? 0n) - multiplier * pivotValue,
          input.prime,
        );
        setMinorEntry(work[row], entryColumn, updated);
      }
    }
  }
  return residue(sign * determinant, input.prime);
}

function minorDigest(input: {
  matrixDigest: string;
  prime: number;
  pivotRows: readonly number[];
  pivotColumns: readonly number[];
  determinantResidue: number;
}): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "selected-original-row-column-minor",
    ...input,
  });
}

function kernelBasisDigest(input: {
  matrixDigest: string;
  prime: number;
  freeColumns: readonly number[];
  kernelBasis: readonly GenericSparseModularKernelVector[];
}): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "right-kernel-free-column-identity-chart",
    ...input,
  });
}

function certificatePayload(
  certificate: GenericSparseModularRankCertificate,
): Omit<GenericSparseModularRankCertificate, "certificateDigest"> {
  const { certificateDigest, ...payload } = certificate;
  void certificateDigest;
  return payload;
}

export function computeGenericSparseModularRankCertificateDigest(
  certificate: GenericSparseModularRankCertificate,
): string {
  return canonicalSha256(certificatePayload(certificate));
}

/**
 * Bounded sparse executor. Large jobs may emit the same certificate schema
 * from an external backend; the verifier below never trusts its rank field.
 */
export function certifyGenericSparseModularRank(
  request: GenericSparseModularRankWorkerRequest,
  options: {
    budgets?: GenericSparseModularRankBudgets;
    backend?: { name: string; version: string; algorithm: string };
  } = {},
): GenericSparseModularRankCertificate {
  const budgets = resolveBudgets(options.budgets);
  const rebuiltRequest = buildGenericSparseModularRankWorkerRequest({
    matrix: request.matrix,
    sourceBindings: request.sourceBindings,
    modulusPrime: request.modulusPrime,
    budgets,
  });
  if (
    request.requestDigest !== rebuiltRequest.requestDigest ||
    request.matrixDigest !== rebuiltRequest.matrixDigest ||
    request.bindingDigest !== rebuiltRequest.bindingDigest
  ) {
    throw new Error("The modular-rank worker request has stale source hashes.");
  }
  const normalized = normalizeMatrix(rebuiltRequest.matrix, budgets);
  if (normalized.matrix.rowCount > budgets.maxRows) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse matrix row count exceeds ${budgets.maxRows}.`,
    );
  }
  if (normalized.matrix.columnCount > budgets.maxColumns) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse matrix column count exceeds ${budgets.maxColumns}.`,
    );
  }
  if (normalized.nonzeroCount > budgets.maxInputNonzeros) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse matrix nonzero count exceeds ${budgets.maxInputNonzeros}.`,
    );
  }
  const prime = BigInt(rebuiltRequest.modulusPrime);
  const tracker: OperationTracker = {
    fieldOperations: 0,
    pivotRowScans: 0,
    workingNonzeros: normalized.nonzeroCount,
    maximumWorkingNonzeros: normalized.nonzeroCount,
    budgets,
  };
  const reduction = sparseRref({
    rows: normalized.rows,
    columnCount: normalized.matrix.columnCount,
    prime,
    tracker,
  });
  const rank = reduction.pivotColumns.length;
  const selectedPivotRows = [...reduction.pivotRows].sort(
    (left, right) => left - right,
  );
  const pivotSet = new Set(reduction.pivotColumns);
  const freeColumns = Array.from(
    { length: normalized.matrix.columnCount },
    (_unused, column) => column,
  ).filter((column) => !pivotSet.has(column));
  if (freeColumns.length > budgets.maxNullity) {
    throw new GenericSparseModularRankResourceBoundError(
      `Sparse modular nullity exceeds ${budgets.maxNullity}.`,
    );
  }
  const kernelBasis: GenericSparseModularKernelVector[] = [];
  let kernelNonzeroCount = 0;
  for (const chartColumn of freeColumns) {
    const entries: Array<[number, number]> = [];
    for (let pivot = 0; pivot < rank; pivot += 1) {
      const coefficient = residue(
        -(reduction.rows[pivot].values.get(chartColumn) ?? 0n),
        prime,
      );
      if (coefficient !== 0n) {
        entries.push([reduction.pivotColumns[pivot], Number(coefficient)]);
      }
    }
    entries.push([chartColumn, 1]);
    entries.sort(([left], [right]) => left - right);
    kernelNonzeroCount += entries.length;
    if (kernelNonzeroCount > budgets.maxKernelNonzeros) {
      throw new GenericSparseModularRankResourceBoundError(
        `Sparse modular kernel exceeded ${budgets.maxKernelNonzeros} nonzeros.`,
      );
    }
    kernelBasis.push({ chartColumn, entries });
  }
  const determinant = determinantOfMinor({
    rows: normalized.rows,
    pivotRows: selectedPivotRows,
    pivotColumns: reduction.pivotColumns,
    prime,
    tracker,
  });
  if (determinant === 0n) {
    throw new Error("Internal error: the selected pivot minor is singular.");
  }
  const determinantResidue = Number(determinant);
  const backend = options.backend ?? {
    name: "typescript",
    version: ALGORITHM_VERSION,
    algorithm: "deterministic-sparse-rref",
  };
  for (const [path, value] of Object.entries(backend)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`backend.${path} must be nonempty.`);
    }
  }
  const certificate: GenericSparseModularRankCertificate = {
    schemaVersion: 1,
    kind: "generic-sparse-modular-rank-certificate",
    status: "passed",
    method: "nonzero-pivot-minor-plus-right-kernel-identity-chart",
    algorithmVersion: ALGORITHM_VERSION,
    source: {
      sourceBindings: rebuiltRequest.sourceBindings,
      matrixDigest: rebuiltRequest.matrixDigest,
      bindingDigest: rebuiltRequest.bindingDigest,
      workerRequestDigest: rebuiltRequest.requestDigest,
    },
    matrix: {
      rowCount: normalized.matrix.rowCount,
      columnCount: normalized.matrix.columnCount,
      nonzeroCount: normalized.nonzeroCount,
      maximumAbsoluteCoefficient:
        normalized.maximumAbsoluteCoefficient.toString(),
    },
    modulusPrime: rebuiltRequest.modulusPrime,
    rank,
    nullity: freeColumns.length,
    lowerBound: {
      pivotRows: selectedPivotRows,
      pivotColumns: reduction.pivotColumns,
      minorDeterminantResidue: determinantResidue,
      minorDigest: minorDigest({
        matrixDigest: rebuiltRequest.matrixDigest,
        prime: rebuiltRequest.modulusPrime,
        pivotRows: selectedPivotRows,
        pivotColumns: reduction.pivotColumns,
        determinantResidue,
      }),
    },
    upperBound: {
      freeColumns,
      kernelBasis,
      kernelBasisDigest: kernelBasisDigest({
        matrixDigest: rebuiltRequest.matrixDigest,
        prime: rebuiltRequest.modulusPrime,
        freeColumns,
        kernelBasis,
      }),
    },
    backend: {
      ...backend,
      exactFieldArithmetic: true,
    },
    execution: {
      fieldOperations: tracker.fieldOperations,
      pivotRowScans: tracker.pivotRowScans,
      maximumWorkingNonzeros: tracker.maximumWorkingNonzeros,
      kernelNonzeroCount,
    },
    certificateDigest: "",
  };
  certificate.certificateDigest =
    computeGenericSparseModularRankCertificateDigest(certificate);
  return certificate;
}

function canonicalSafeIndexList(
  value: unknown,
  upperBound: number,
  path: string,
): number[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  let previous = -1;
  return value.map((entry, index) => {
    const parsed = requireSafeDimension(entry, `${path}[${index}]`);
    if (parsed >= upperBound || parsed <= previous) {
      throw new Error(`${path} must be strictly increasing and in range.`);
    }
    previous = parsed;
    return parsed;
  });
}

function parseKernelBasis(input: {
  value: unknown;
  freeColumns: readonly number[];
  columnCount: number;
  prime: number;
}): Array<{ chartColumn: number; values: Map<number, bigint> }> {
  if (
    !Array.isArray(input.value) ||
    input.value.length !== input.freeColumns.length
  ) {
    throw new Error("The kernel basis must have one vector per free column.");
  }
  return input.value.map((candidate, vectorIndex) => {
    if (candidate === null || typeof candidate !== "object") {
      throw new Error(`kernelBasis[${vectorIndex}] must be an object.`);
    }
    const vector = candidate as Partial<GenericSparseModularKernelVector>;
    const chartColumn = requireSafeDimension(
      vector.chartColumn,
      `kernelBasis[${vectorIndex}].chartColumn`,
    );
    if (chartColumn !== input.freeColumns[vectorIndex]) {
      throw new Error("Kernel vectors are not in canonical chart order.");
    }
    if (!Array.isArray(vector.entries)) {
      throw new Error(`kernelBasis[${vectorIndex}].entries must be an array.`);
    }
    const values = new Map<number, bigint>();
    let previousColumn = -1;
    for (
      let entryIndex = 0;
      entryIndex < vector.entries.length;
      entryIndex += 1
    ) {
      const entry = vector.entries[entryIndex];
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error("Kernel entries must be pairs.");
      }
      const column = requireSafeDimension(
        entry[0],
        `kernelBasis[${vectorIndex}].entries[${entryIndex}][0]`,
      );
      const entryResidue = requireSafeDimension(
        entry[1],
        `kernelBasis[${vectorIndex}].entries[${entryIndex}][1]`,
      );
      if (
        column >= input.columnCount ||
        column <= previousColumn ||
        entryResidue <= 0 ||
        entryResidue >= input.prime
      ) {
        throw new Error("Kernel entries must be canonical nonzero residues.");
      }
      previousColumn = column;
      values.set(column, BigInt(entryResidue));
    }
    return { chartColumn, values };
  });
}

function replayPayload(
  replay: Omit<GenericSparseModularRankReplay, "replayDigest">,
): string {
  return canonicalSha256(replay);
}

function scanSparseMatrixReader(input: {
  reader: GenericSparseIntegerMatrixReader;
  basis: readonly { chartColumn: number; values: Map<number, bigint> }[];
  pivotRows: readonly number[];
  pivotColumns: readonly number[];
  prime: bigint;
  tracker: OperationTracker;
}): {
  summary: StreamedMatrixSummary;
  minorRows: Array<Map<number, bigint>>;
  everyKernelVectorIsClosed: boolean;
} {
  const { reader, tracker } = input;
  const pivotRowPosition = new Map(
    input.pivotRows.map((row, position) => [row, position]),
  );
  const pivotColumnPosition = new Map(
    input.pivotColumns.map((column, position) => [column, position]),
  );
  const kernelByColumn = new Map<number, Array<[number, bigint]>>();
  let kernelNonzeroCount = 0;
  input.basis.forEach((vector, vectorIndex) => {
    for (const [column, value] of vector.values) {
      const records = kernelByColumn.get(column) ?? [];
      records.push([vectorIndex, value]);
      kernelByColumn.set(column, records);
      kernelNonzeroCount += 1;
      if (kernelNonzeroCount > tracker.budgets.maxKernelNonzeros) {
        throw new GenericSparseModularRankResourceBoundError(
          "The kernel certificate exceeds its nonzero bound.",
        );
      }
    }
  });

  const minorRows = Array.from(
    { length: input.pivotRows.length },
    () => new Map<number, bigint>(),
  );
  const foundMinorRows = new Uint8Array(input.pivotRows.length);
  const chunkDigests: string[] = [];
  let chunkRows: GenericSparseIntegerRow[] = [];
  let chunkFirstRow = 0;
  let expectedRow = 0;
  let nonzeroCount = 0;
  let maximumAbsoluteCoefficient = 0n;
  let everyKernelVectorIsClosed = true;
  const flushChunk = () => {
    if (chunkRows.length === 0) return;
    chunkDigests.push(
      canonicalSha256({
        schemaVersion: 1,
        method: "canonical-explicit-sparse-integer-matrix-row-chunk",
        chunkIndex: chunkDigests.length,
        firstRow: chunkFirstRow,
        rows: chunkRows,
      }),
    );
    chunkRows = [];
  };

  reader.forEachRow((supplied) => {
    if (expectedRow >= reader.rowCount) {
      throw new Error("The sparse-matrix reader emitted too many rows.");
    }
    if (
      supplied === null ||
      typeof supplied !== "object" ||
      supplied.row !== expectedRow ||
      !Array.isArray(supplied.entries)
    ) {
      throw new Error(`The reader did not emit canonical row ${expectedRow}.`);
    }
    const canonicalEntries: Array<[number, string]> = [];
    const rowKernelSums = new Map<number, bigint>();
    const minorPosition = pivotRowPosition.get(expectedRow);
    let previousColumn = -1;
    for (
      let entryIndex = 0;
      entryIndex < supplied.entries.length;
      entryIndex += 1
    ) {
      const entry = supplied.entries[entryIndex];
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error(`Reader row ${expectedRow} has a non-pair entry.`);
      }
      const column = requireSafeDimension(
        entry[0],
        `reader.rows[${expectedRow}].entries[${entryIndex}][0]`,
      );
      if (column >= reader.columnCount || column <= previousColumn) {
        throw new Error(
          `Reader row ${expectedRow} columns are not strictly increasing and in range.`,
        );
      }
      const coefficient = parseInteger(
        entry[1],
        `reader.rows[${expectedRow}].entries[${entryIndex}][1]`,
        tracker.budgets.maxCoefficientDigits,
      );
      if (coefficient === 0n) {
        throw new Error("Sparse matrix entries must be nonzero.");
      }
      previousColumn = column;
      canonicalEntries.push([column, coefficient.toString()]);
      nonzeroCount += 1;
      if (nonzeroCount > tracker.budgets.maxInputNonzeros) {
        throw new GenericSparseModularRankResourceBoundError(
          `The sparse matrix exceeded ${tracker.budgets.maxInputNonzeros} input nonzeros.`,
        );
      }
      maximumAbsoluteCoefficient =
        abs(coefficient) > maximumAbsoluteCoefficient
          ? abs(coefficient)
          : maximumAbsoluteCoefficient;

      for (const [vectorIndex, vectorValue] of kernelByColumn.get(column) ??
        []) {
        touchFieldOperation(tracker);
        rowKernelSums.set(
          vectorIndex,
          residue(
            (rowKernelSums.get(vectorIndex) ?? 0n) + coefficient * vectorValue,
            input.prime,
          ),
        );
      }
      if (minorPosition !== undefined) {
        const selectedColumn = pivotColumnPosition.get(column);
        if (selectedColumn !== undefined) {
          const reduced = residue(coefficient, input.prime);
          if (reduced !== 0n) {
            minorRows[minorPosition].set(selectedColumn, reduced);
          }
        }
      }
    }
    everyKernelVectorIsClosed &&= [...rowKernelSums.values()].every(
      (sum) => sum === 0n,
    );
    if (minorPosition !== undefined) foundMinorRows[minorPosition] = 1;
    if (chunkRows.length === 0) chunkFirstRow = expectedRow;
    chunkRows.push({ row: expectedRow, entries: canonicalEntries });
    expectedRow += 1;
    if (chunkRows.length === MATRIX_DIGEST_CHUNK_ROWS) flushChunk();
  });
  flushChunk();
  if (expectedRow !== reader.rowCount) {
    throw new Error(
      `The sparse-matrix reader emitted ${expectedRow} of ${reader.rowCount} rows.`,
    );
  }
  if ([...foundMinorRows].some((found) => found !== 1)) {
    throw new Error("The sparse-matrix reader omitted a selected pivot row.");
  }
  return {
    summary: {
      nonzeroCount,
      maximumAbsoluteCoefficient,
      digest: matrixDigestFromChunks({
        rowCount: reader.rowCount,
        columnCount: reader.columnCount,
        nonzeroCount,
        maximumAbsoluteCoefficient,
        chunkDigests,
      }),
    },
    minorRows,
    everyKernelVectorIsClosed,
  };
}

/**
 * Scalable exact replay. The reader is consumed once; all complete matrix rows
 * are discarded after their digest, kernel products, and selected-minor entries
 * have been checked.
 */
export function replayGenericSparseModularRankCertificateFromReader(input: {
  matrixReader: GenericSparseIntegerMatrixReader;
  sourceBindings: readonly GenericSparseMatrixSourceBinding[];
  certificate: GenericSparseModularRankCertificate;
  budgets?: GenericSparseModularRankBudgets;
}): GenericSparseModularRankReplay {
  const checks: GenericSparseModularRankReplay["checks"] = {
    envelopeRecognized: false,
    matrixCanonical: false,
    matrixDigestMatches: false,
    sourceBindingsMatch: false,
    bindingDigestMatches: false,
    workerRequestDigestMatches: false,
    certificateDigestMatches: false,
    modulusIsPrime: false,
    dimensionsMatch: false,
    pivotMinorHasClaimedNonzeroDeterminant: false,
    everyKernelVectorIsClosed: false,
    kernelChartIsIdentity: false,
    lowerAndUpperBoundsMeet: false,
  };
  const errors: string[] = [];
  let stopReason: string | undefined;
  let certifiedRank: number | undefined;
  let certifiedNullity: number | undefined;
  let replayBudgets = { ...DEFAULT_BUDGETS };
  try {
    const certificate = input.certificate;
    checks.envelopeRecognized =
      certificate?.schemaVersion === 1 &&
      certificate.kind === "generic-sparse-modular-rank-certificate" &&
      certificate.status === "passed" &&
      certificate.method ===
        "nonzero-pivot-minor-plus-right-kernel-identity-chart" &&
      certificate.algorithmVersion === ALGORITHM_VERSION;
    if (!checks.envelopeRecognized) {
      throw new Error(
        "The modular-rank certificate envelope is not recognized.",
      );
    }
    const budgets = resolveBudgets(input.budgets);
    replayBudgets = budgets;
    const reader = input.matrixReader;
    if (
      reader === null ||
      typeof reader !== "object" ||
      reader.schemaVersion !== 1 ||
      typeof reader.forEachRow !== "function"
    ) {
      throw new Error("The sparse-matrix reader envelope is not recognized.");
    }
    const rowCount = requireSafeDimension(reader.rowCount, "reader.rowCount");
    const columnCount = requireSafeDimension(
      reader.columnCount,
      "reader.columnCount",
    );
    if (rowCount > budgets.maxRows || columnCount > budgets.maxColumns) {
      throw new GenericSparseModularRankResourceBoundError(
        "The sparse matrix exceeds the replay resource bounds.",
      );
    }
    const expectedBindings = normalizeSourceBindings(input.sourceBindings);
    const certificateBindings = normalizeSourceBindings(
      certificate.source.sourceBindings,
    );
    checks.sourceBindingsMatch =
      sourceBindingsEqual(expectedBindings, certificateBindings) &&
      sourceBindingsEqual(
        certificate.source.sourceBindings,
        certificateBindings,
      );
    if (!checks.sourceBindingsMatch) {
      throw new Error(
        "The certificate source bindings differ from the caller's.",
      );
    }
    checks.modulusIsPrime = isPrime(certificate.modulusPrime);
    if (!checks.modulusIsPrime) {
      throw new Error("The modular-rank certificate modulus is not prime.");
    }
    checks.certificateDigestMatches =
      certificate.certificateDigest ===
      computeGenericSparseModularRankCertificateDigest(certificate);
    if (!checks.certificateDigestMatches) {
      throw new Error("The modular-rank certificate digest is stale.");
    }
    const rank = requireSafeDimension(certificate.rank, "certificate.rank");
    const nullity = requireSafeDimension(
      certificate.nullity,
      "certificate.nullity",
    );
    checks.dimensionsMatch =
      certificate.matrix.rowCount === rowCount &&
      certificate.matrix.columnCount === columnCount &&
      rank <= Math.min(rowCount, columnCount) &&
      rank + nullity === columnCount;
    if (rank > budgets.maxRank || nullity > budgets.maxNullity) {
      throw new GenericSparseModularRankResourceBoundError(
        "The rank certificate exceeds the replay rank/nullity bounds.",
      );
    }
    const pivotRows = canonicalSafeIndexList(
      certificate.lowerBound.pivotRows,
      rowCount,
      "lowerBound.pivotRows",
    );
    const pivotColumns = canonicalSafeIndexList(
      certificate.lowerBound.pivotColumns,
      columnCount,
      "lowerBound.pivotColumns",
    );
    if (pivotRows.length !== rank || pivotColumns.length !== rank) {
      throw new Error("The pivot minor size differs from the claimed rank.");
    }
    const freeColumns = canonicalSafeIndexList(
      certificate.upperBound.freeColumns,
      columnCount,
      "upperBound.freeColumns",
    );
    if (
      freeColumns.length !== nullity ||
      [...pivotColumns, ...freeColumns]
        .sort((left, right) => left - right)
        .some((column, index) => column !== index)
    ) {
      throw new Error("Pivot and free columns do not partition all columns.");
    }
    const basis = parseKernelBasis({
      value: certificate.upperBound.kernelBasis,
      freeColumns,
      columnCount,
      prime: certificate.modulusPrime,
    });
    const freeSet = new Set(freeColumns);
    checks.kernelChartIsIdentity = basis.every((vector) => {
      if (vector.values.get(vector.chartColumn) !== 1n) return false;
      for (const column of freeSet) {
        if (
          column !== vector.chartColumn &&
          (vector.values.get(column) ?? 0n) !== 0n
        ) {
          return false;
        }
      }
      return true;
    });
    const prime = BigInt(certificate.modulusPrime);
    const tracker: OperationTracker = {
      fieldOperations: 0,
      pivotRowScans: 0,
      workingNonzeros: 0,
      maximumWorkingNonzeros: 0,
      budgets,
    };
    const scanned = scanSparseMatrixReader({
      reader,
      basis,
      pivotRows,
      pivotColumns,
      prime,
      tracker,
    });
    checks.matrixCanonical = true;
    checks.matrixDigestMatches =
      certificate.source.matrixDigest === scanned.summary.digest;
    const expectedBindingDigest = computeBindingDigest(
      expectedBindings,
      scanned.summary.digest,
    );
    checks.bindingDigestMatches =
      certificate.source.bindingDigest === expectedBindingDigest;
    checks.workerRequestDigestMatches =
      certificate.source.workerRequestDigest ===
      computeWorkerRequestDigestFromHeader({
        modulusPrime: certificate.modulusPrime,
        sourceBindings: expectedBindings,
        matrixDigest: scanned.summary.digest,
        bindingDigest: expectedBindingDigest,
        rowCount,
        columnCount,
      });
    checks.dimensionsMatch &&=
      certificate.matrix.nonzeroCount === scanned.summary.nonzeroCount &&
      certificate.matrix.maximumAbsoluteCoefficient ===
        scanned.summary.maximumAbsoluteCoefficient.toString();
    if (
      !checks.matrixDigestMatches ||
      !checks.bindingDigestMatches ||
      !checks.workerRequestDigestMatches ||
      !checks.dimensionsMatch
    ) {
      throw new Error(
        "The certificate is not bound to the streamed sparse matrix.",
      );
    }

    const minorIndices = Array.from(
      { length: rank },
      (_unused, index) => index,
    );
    const determinant = determinantOfMinor({
      rows: scanned.minorRows,
      pivotRows: minorIndices,
      pivotColumns: minorIndices,
      prime,
      tracker,
    });
    const determinantResidue = requireSafeDimension(
      certificate.lowerBound.minorDeterminantResidue,
      "lowerBound.minorDeterminantResidue",
    );
    checks.pivotMinorHasClaimedNonzeroDeterminant =
      determinant !== 0n &&
      determinantResidue < certificate.modulusPrime &&
      determinant === BigInt(determinantResidue) &&
      certificate.lowerBound.minorDigest ===
        minorDigest({
          matrixDigest: scanned.summary.digest,
          prime: certificate.modulusPrime,
          pivotRows,
          pivotColumns,
          determinantResidue,
        });
    checks.everyKernelVectorIsClosed =
      scanned.everyKernelVectorIsClosed &&
      certificate.upperBound.kernelBasisDigest ===
        kernelBasisDigest({
          matrixDigest: scanned.summary.digest,
          prime: certificate.modulusPrime,
          freeColumns,
          kernelBasis: certificate.upperBound.kernelBasis,
        });
    checks.lowerAndUpperBoundsMeet =
      checks.pivotMinorHasClaimedNonzeroDeterminant &&
      checks.everyKernelVectorIsClosed &&
      checks.kernelChartIsIdentity &&
      rank + basis.length === columnCount;
    if (
      !checks.kernelChartIsIdentity ||
      !checks.everyKernelVectorIsClosed ||
      !checks.lowerAndUpperBoundsMeet
    ) {
      throw new Error(
        "The right-kernel chart does not certify the upper bound.",
      );
    }
    certifiedRank = rank;
    certifiedNullity = nullity;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof GenericSparseModularRankResourceBoundError) {
      stopReason = message;
    } else {
      errors.push(message);
    }
  }
  const withoutDigest: Omit<GenericSparseModularRankReplay, "replayDigest"> = {
    schemaVersion: 1,
    kind: "generic-sparse-modular-rank-certificate-replay",
    status:
      stopReason !== undefined
        ? "incomplete"
        : errors.length === 0 && Object.values(checks).every(Boolean)
          ? "passed"
          : "failed",
    budgets: replayBudgets,
    checks,
    ...(certifiedRank === undefined ? {} : { certifiedRank }),
    ...(certifiedNullity === undefined ? {} : { certifiedNullity }),
    ...(stopReason === undefined ? {} : { stopReason }),
    errors,
  };
  return { ...withoutDigest, replayDigest: replayPayload(withoutDigest) };
}

/** Materialized convenience wrapper around the one-pass replay API. */
export function replayGenericSparseModularRankCertificate(input: {
  matrix: GenericSparseIntegerMatrix;
  sourceBindings: readonly GenericSparseMatrixSourceBinding[];
  certificate: GenericSparseModularRankCertificate;
  budgets?: GenericSparseModularRankBudgets;
}): GenericSparseModularRankReplay {
  return replayGenericSparseModularRankCertificateFromReader({
    matrixReader: {
      schemaVersion: input.matrix.schemaVersion,
      rowCount: input.matrix.rowCount,
      columnCount: input.matrix.columnCount,
      forEachRow(visitor) {
        for (const row of input.matrix.rows) visitor(row);
      },
    },
    sourceBindings: input.sourceBindings,
    certificate: input.certificate,
    budgets: input.budgets,
  });
}

/** Size helper for deciding when to hand a request to an external worker. */
export function genericSparseModularRankRequestCanonicalBytes(
  request: GenericSparseModularRankWorkerRequest,
): number {
  return new TextEncoder().encode(canonicalizeJson(request)).length;
}
