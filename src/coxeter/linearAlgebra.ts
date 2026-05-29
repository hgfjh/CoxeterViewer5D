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
