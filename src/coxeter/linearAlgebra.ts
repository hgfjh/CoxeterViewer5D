export type Matrix = number[][];

export function identityMatrix(size: number): Matrix {
  return Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_unused, j) => (i === j ? 1 : 0)),
  );
}

export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  const rows = left.length;
  const shared = right.length;
  const columns = right[0]?.length ?? 0;

  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: columns }, (_unused, j) => {
      let value = 0;
      for (let k = 0; k < shared; k += 1) {
        value += left[i][k] * right[k][j];
      }
      return value;
    }),
  );
}

export function matrixPower(matrix: Matrix, exponent: number): Matrix {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new Error(
      `Matrix exponent must be a non-negative integer; got ${exponent}.`,
    );
  }

  let result = identityMatrix(matrix.length);

  for (let i = 0; i < exponent; i += 1) {
    result = multiplyMatrices(result, matrix);
  }

  return result;
}

export function maxMatrixDifference(left: Matrix, right: Matrix): number {
  let maxDifference = 0;

  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < left[i].length; j += 1) {
      maxDifference = Math.max(
        maxDifference,
        Math.abs(left[i][j] - right[i][j]),
      );
    }
  }

  return maxDifference;
}

export function roundedMatrixKey(matrix: Matrix, precision: number): string {
  const scale = 10 ** precision;

  return matrix
    .flat()
    .map((entry) => {
      const rounded = Math.round(entry * scale) / scale;
      return Object.is(rounded, -0) ? 0 : rounded;
    })
    .join(",");
}

// Packed (row-major Float64Array) matrices for enumeration hot loops.
// Products keep multiplyMatrices' summation order so results are
// bit-identical, and deduplication works on rounded integer entries instead
// of formatting decimal key strings for every probe.

// Rounded entries above this magnitude could collide after division by
// 10^precision, so such matrices fall back to the decimal string key.
export const MAX_EXACT_ROUNDED = 2 ** 52;

/**
 * Row-major product with the same summation order as multiplyMatrices
 * (value = 0; value += left[i][k] * right[k][j] for k ascending), so the
 * floating-point results, and therefore deduplication, are bit-identical.
 */
export function multiplyPackedMatrices(
  left: Float64Array,
  right: Float64Array,
  size: number,
): Float64Array {
  const out = new Float64Array(size * size);
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      let value = 0;
      for (let k = 0; k < size; k += 1) {
        value += left[i * size + k] * right[k * size + j];
      }
      out[i * size + j] = value;
    }
  }
  return out;
}

/**
 * Rounded integer entries plus a 32-bit hash.  Two matrices get the same
 * roundedMatrixKey string exactly when these integers agree (for magnitudes
 * below 2^52), so the integers can stand in for the string while probing.
 */
export function roundPackedMatrix(
  matrix: Float64Array,
  scale: number,
): { rounded: Float64Array; hash: number; exact: boolean } {
  const rounded = new Float64Array(matrix.length);
  let hash = 0x811c9dc5;
  let exact = true;
  for (let index = 0; index < matrix.length; index += 1) {
    let value = Math.round(matrix[index] * scale);
    if (value === 0) value = 0; // fold -0
    if (Math.abs(value) >= MAX_EXACT_ROUNDED) exact = false;
    rounded[index] = value;
    // Mix both 32-bit halves of the integer into an FNV-style hash.
    const low = value % 0x1_0000_0000;
    const high = (value - low) / 0x1_0000_0000;
    hash = Math.imul(hash ^ (low | 0), 0x01000193);
    hash = Math.imul(hash ^ (high | 0), 0x01000193);
  }
  return { rounded, hash: hash >>> 0, exact };
}

export function sameRoundedEntries(
  left: Float64Array,
  right: Float64Array,
): boolean {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function unpackMatrix(matrix: Float64Array, size: number): number[][] {
  return Array.from({ length: size }, (_, i) =>
    Array.from(matrix.subarray(i * size, (i + 1) * size)),
  );
}

export function packMatrix(matrix: Matrix): Float64Array {
  return Float64Array.from(matrix.flat());
}

/**
 * Set of matrices up to rounding at a fixed precision, with the same
 * equality as comparing roundedMatrixKey strings.
 */
export class RoundedMatrixSet {
  private readonly scale: number;
  private readonly byHash = new Map<number, Float64Array[]>();
  private readonly byKey = new Set<string>();
  size = 0;

  constructor(
    private readonly dimension: number,
    private readonly precision: number,
  ) {
    this.scale = 10 ** precision;
  }

  has(matrix: Float64Array): boolean {
    const probe = roundPackedMatrix(matrix, this.scale);
    if (!probe.exact) {
      return this.byKey.has(
        roundedMatrixKey(unpackMatrix(matrix, this.dimension), this.precision),
      );
    }
    return (
      this.byHash
        .get(probe.hash)
        ?.some((entry) => sameRoundedEntries(entry, probe.rounded)) ?? false
    );
  }

  /** Adds `matrix`; returns false when an equal (rounded) matrix is present. */
  add(matrix: Float64Array): boolean {
    const probe = roundPackedMatrix(matrix, this.scale);
    if (!probe.exact) {
      const key = roundedMatrixKey(
        unpackMatrix(matrix, this.dimension),
        this.precision,
      );
      if (this.byKey.has(key)) return false;
      this.byKey.add(key);
      this.size += 1;
      return true;
    }
    const bucket = this.byHash.get(probe.hash);
    if (bucket?.some((entry) => sameRoundedEntries(entry, probe.rounded))) {
      return false;
    }
    if (bucket) bucket.push(probe.rounded);
    else this.byHash.set(probe.hash, [probe.rounded]);
    this.size += 1;
    return true;
  }
}
