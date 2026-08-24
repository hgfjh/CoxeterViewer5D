import { canonicalSha256, sha256Hex } from "../utils/canonicalSha256";
import {
  COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS,
  type StreamedH1IntegralCoreBasis,
} from "./streamedH1Completion";
import {
  type StreamedH1ExactModularCoreRankWitness,
  type StreamedH1LatticePreparation,
} from "./streamedH1Lattice";

const CORE_KERNEL_RANK = 15;
const HASH_CHUNK_SIZE = 4_096;
const MAX_TRANSCRIPT_LENGTH = 64 * 1024 * 1024;
const MAX_MODULUS = 1_000_000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export interface ParseStreamedH1ModularCoreTranscriptOptions {
  sourceArtifactSha256: string;
  modulusPrime: number;
  preparation: StreamedH1LatticePreparation;
  integralCoreBasis: StreamedH1IntegralCoreBasis;
  backend: string;
  backendVersion: string;
  algorithm: string;
}

export interface StreamedH1ParsedModularCoreTranscript {
  readonly witness: StreamedH1ExactModularCoreRankWitness;
  readonly rawBasisNonzeroCount: number;
  readonly normalizedComparisonEntryCount: number;
}

function parseSafeInteger(token: string, path: string): number {
  if (!/^(0|-?[1-9][0-9]*)$/u.test(token)) {
    throw new Error(`${path} is not a canonical decimal integer.`);
  }
  const value = Number(token);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${path} is outside the safe-integer range.`);
  }
  return value;
}

function isPrime(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 2) return false;
  if (value % 2 === 0) return value === 2;
  for (let divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function residue(value: number, prime: number): number {
  const reduced = value % prime;
  return reduced < 0 ? reduced + prime : reduced;
}

function modularInverse(value: number, prime: number): number {
  let oldR = prime;
  let currentR = residue(value, prime);
  let oldT = 0;
  let currentT = 1;
  while (currentR !== 0) {
    const quotient = Math.floor(oldR / currentR);
    [oldR, currentR] = [currentR, oldR - quotient * currentR];
    [oldT, currentT] = [currentT, oldT - quotient * currentT];
  }
  if (oldR !== 1) throw new Error("The modular chart matrix is singular.");
  return residue(oldT, prime);
}

function invertMatrix(matrix: readonly number[][], prime: number): number[][] {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [
    ...row.map((value) => residue(value, prime)),
    ...Array.from({ length: size }, (_unused, column) =>
      rowIndex === column ? 1 : 0,
    ),
  ]);
  for (let column = 0; column < size; column += 1) {
    const pivot = augmented.findIndex(
      (row, rowIndex) => rowIndex >= column && row[column] !== 0,
    );
    if (pivot < 0) throw new Error("The modular identity chart is singular.");
    [augmented[column], augmented[pivot]] = [
      augmented[pivot],
      augmented[column],
    ];
    const inverse = modularInverse(augmented[column][column], prime);
    for (let cursor = 0; cursor < 2 * size; cursor += 1) {
      augmented[column][cursor] = residue(
        augmented[column][cursor] * inverse,
        prime,
      );
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor === 0) continue;
      for (let cursor = 0; cursor < 2 * size; cursor += 1) {
        augmented[row][cursor] = residue(
          augmented[row][cursor] - factor * augmented[column][cursor],
          prime,
        );
      }
    }
  }
  return augmented.map((row) => row.slice(size));
}

/**
 * Parse an exact LinBox nullspace transcript and put its basis into the same
 * 15-coordinate chart as the integral core frame.  Equality after this change
 * of basis binds the rank transcript to the cocycles used by Track B.
 */
export function parseStreamedH1ModularCoreTranscript(
  text: string,
  options: ParseStreamedH1ModularCoreTranscriptOptions,
): StreamedH1ParsedModularCoreTranscript {
  if (text.length === 0 || text.length > MAX_TRANSCRIPT_LENGTH) {
    throw new Error("Modular transcript text must contain 1..64 MiB.");
  }
  const expectedSha256 = options.sourceArtifactSha256.toLowerCase();
  if (!SHA256_PATTERN.test(expectedSha256)) {
    throw new Error("sourceArtifactSha256 must be a lowercase SHA-256 digest.");
  }
  const actualSha256 = sha256Hex(text);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Modular transcript SHA-256 mismatch: expected ${expectedSha256}, received ${actualSha256}.`,
    );
  }
  const prime = options.modulusPrime;
  if (!isPrime(prime) || prime > MAX_MODULUS || prime === 2) {
    throw new Error(
      `The transcript modulus must be an odd prime at most ${MAX_MODULUS}.`,
    );
  }
  const peel = options.preparation.certificate.peel;
  if (
    options.integralCoreBasis.certificate.coreColumnCount !==
      peel.unresolvedColumnCount ||
    options.integralCoreBasis.certificate.coreRowCount !== peel.nonpivotRowCount
  ) {
    throw new Error("The integral core frame does not match the preparation.");
  }
  const lines = text.trim().split(/\r?\n/u);
  const headerTokens = lines[0]?.split(" ") ?? [];
  if (headerTokens.length !== 4) {
    throw new Error(
      "Modular transcript header must be `columns nullity p rank`.",
    );
  }
  const header = headerTokens.map((token, index) =>
    parseSafeInteger(token, `header[${index}]`),
  );
  const expectedRank = peel.unresolvedColumnCount - CORE_KERNEL_RANK;
  if (
    header[0] !== peel.unresolvedColumnCount ||
    header[1] !== CORE_KERNEL_RANK ||
    header[2] !== prime ||
    header[3] !== expectedRank ||
    lines.length !== CORE_KERNEL_RANK + 1
  ) {
    throw new Error(
      "Modular transcript dimensions, modulus, or rank disagree.",
    );
  }

  // Columns are contiguous in memory because normalization reads all fifteen
  // raw basis values for one core edge at a time.
  const rawValues = new Int32Array(
    peel.unresolvedColumnCount * CORE_KERNEL_RANK,
  );
  let rawBasisNonzeroCount = 0;
  const symmetricBound = Math.floor(prime / 2);
  for (let basis = 0; basis < CORE_KERNEL_RANK; basis += 1) {
    const tokens = lines[basis + 1].split(" ");
    if (tokens.length < 2)
      throw new Error(`Missing modular basis row ${basis}.`);
    const suppliedBasis = parseSafeInteger(
      tokens[0],
      `basis[${basis}].coordinate`,
    );
    const nonzeroCount = parseSafeInteger(
      tokens[1],
      `basis[${basis}].nonzeroCount`,
    );
    if (
      suppliedBasis !== basis ||
      nonzeroCount < 0 ||
      tokens.length !== 2 + 2 * nonzeroCount
    ) {
      throw new Error(`Modular basis row ${basis} is not canonical.`);
    }
    let previousColumn = -1;
    for (let cursor = 2; cursor < tokens.length; cursor += 2) {
      const entry = (cursor - 2) / 2;
      const coreColumn = parseSafeInteger(
        tokens[cursor],
        `basis[${basis}].entries[${entry}].column`,
      );
      const value = parseSafeInteger(
        tokens[cursor + 1],
        `basis[${basis}].entries[${entry}].value`,
      );
      if (
        coreColumn <= previousColumn ||
        coreColumn >= peel.unresolvedColumnCount ||
        value === 0 ||
        Math.abs(value) > symmetricBound
      ) {
        throw new Error(`Modular basis row ${basis} is not canonical.`);
      }
      previousColumn = coreColumn;
      rawValues[coreColumn * CORE_KERNEL_RANK + basis] = residue(value, prime);
    }
    rawBasisNonzeroCount += nonzeroCount;
  }

  const chart = COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS.map((coreColumn) =>
    Array.from(
      { length: CORE_KERNEL_RANK },
      (_unused, basis) => rawValues[coreColumn * CORE_KERNEL_RANK + basis],
    ),
  );
  const inverseChart = invertMatrix(chart, prime);
  const normalizedChunks: string[] = [];
  let normalizedRecords: Array<[number, number[]]> = [];
  let normalizedComparisonEntryCount = 0;
  for (
    let coreColumn = 0;
    coreColumn < peel.unresolvedColumnCount;
    coreColumn += 1
  ) {
    const normalized = Array<number>(CORE_KERNEL_RANK).fill(0);
    for (let coordinate = 0; coordinate < CORE_KERNEL_RANK; coordinate += 1) {
      let value = 0;
      for (let basis = 0; basis < CORE_KERNEL_RANK; basis += 1) {
        value = residue(
          value +
            rawValues[coreColumn * CORE_KERNEL_RANK + basis] *
              inverseChart[basis][coordinate],
          prime,
        );
      }
      const expected = residue(
        options.integralCoreBasis.value(coreColumn, coordinate),
        prime,
      );
      if (value !== expected) {
        throw new Error(
          `Normalized modular frame differs from the integral frame at core column ${coreColumn}, coordinate ${coordinate}.`,
        );
      }
      normalized[coordinate] = value;
      normalizedComparisonEntryCount += 1;
    }
    normalizedRecords.push([coreColumn, normalized]);
    if (normalizedRecords.length === HASH_CHUNK_SIZE) {
      normalizedChunks.push(
        canonicalSha256({
          chunkIndex: normalizedChunks.length,
          records: normalizedRecords,
        }),
      );
      normalizedRecords = [];
    }
  }
  if (normalizedRecords.length > 0) {
    normalizedChunks.push(
      canonicalSha256({
        chunkIndex: normalizedChunks.length,
        records: normalizedRecords,
      }),
    );
  }
  const normalizedKernelBasisSha256 = canonicalSha256({
    schemaVersion: 1,
    method: "identity-chart-normalized-modular-core-frame",
    modulusPrime: prime,
    coreColumnCount: peel.unresolvedColumnCount,
    coordinateIds: [...options.integralCoreBasis.coordinateIds],
    identityChartColumns: [...COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS],
    chunks: normalizedChunks,
  });
  const witness: StreamedH1ExactModularCoreRankWitness = {
    schemaVersion: 1,
    kind: "streamed-h1-exact-modular-core-rank-witness",
    status: "passed",
    preparationDigest: options.preparation.certificate.preparationDigest,
    coreMatrixDigest: peel.coreMatrixDigest,
    ledgerDigest: peel.ledgerDigest,
    modulusPrime: prime,
    rowCount: peel.nonpivotRowCount,
    columnCount: peel.unresolvedColumnCount,
    rank: expectedRank,
    exactFieldArithmetic: true,
    backend: options.backend,
    backendVersion: options.backendVersion,
    algorithm: options.algorithm,
    transcriptSha256: expectedSha256,
    normalizedKernelBasisSha256,
    identityChartColumns: [...COMPACT_5_CUBE_H1_CORE_IDENTITY_COLUMNS],
    identityChartInvertible: true,
    normalizedBasisMatchesIntegralCoreBasis: true,
  };
  return Object.freeze({
    witness,
    rawBasisNonzeroCount,
    normalizedComparisonEntryCount,
  });
}
