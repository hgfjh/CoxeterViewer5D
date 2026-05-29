import {
  identityMatrix,
  matrixShape,
  type Matrix,
  type Vector,
} from "./linearAlgebra";

export interface SymmetricEigenpair {
  value: number;
  vector: Vector;
}

const defaultTolerance = 1e-12;

/**
 * Jacobi eigensolver for small real symmetric matrices. It is deliberately
 * simple: the viewer only needs ranks around 2--12 for Gram/PCA diagnostics.
 */
export function jacobiEigenDecomposition(
  symmetricMatrix: Matrix,
  tolerance = defaultTolerance,
): SymmetricEigenpair[] {
  const [rows, columns] = matrixShape(symmetricMatrix, "symmetric matrix");
  if (rows !== columns) {
    throw new Error(`Symmetric matrix must be square, got ${rows}x${columns}.`);
  }

  const matrix = symmetricMatrix.map((row) => [...row]);
  const eigenvectors = identityMatrix(rows);
  const maxIterations = Math.max(1, 80 * rows * rows);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const pivot = largestOffDiagonalEntry(matrix);
    if (pivot.value <= tolerance) {
      break;
    }

    rotateSymmetricMatrix(matrix, eigenvectors, pivot.row, pivot.column);
  }

  return Array.from({ length: rows }, (_, column) => ({
    value: matrix[column][column],
    vector: stableSignedVector(eigenvectors.map((row) => row[column])),
  })).sort(compareEigenpairs);
}

function largestOffDiagonalEntry(matrix: Matrix): {
  row: number;
  column: number;
  value: number;
} {
  let best = { row: 0, column: 1, value: 0 };

  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) {
      const value = Math.abs(matrix[row][column]);
      if (value > best.value) {
        best = { row, column, value };
      }
    }
  }

  return best;
}

function rotateSymmetricMatrix(
  matrix: Matrix,
  eigenvectors: Matrix,
  row: number,
  column: number,
): void {
  const entry = matrix[row][column];
  if (entry === 0) {
    return;
  }

  const diagonalDifference = matrix[column][column] - matrix[row][row];
  const tau = diagonalDifference / (2 * entry);
  const tangent =
    diagonalDifference === 0
      ? 1
      : Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
  const cosine = 1 / Math.sqrt(1 + tangent * tangent);
  const sine = tangent * cosine;

  const rowRow = matrix[row][row];
  const columnColumn = matrix[column][column];
  const rowColumn = matrix[row][column];

  matrix[row][row] =
    cosine * cosine * rowRow -
    2 * sine * cosine * rowColumn +
    sine * sine * columnColumn;
  matrix[column][column] =
    sine * sine * rowRow +
    2 * sine * cosine * rowColumn +
    cosine * cosine * columnColumn;
  matrix[row][column] = 0;
  matrix[column][row] = 0;

  for (let index = 0; index < matrix.length; index += 1) {
    if (index !== row && index !== column) {
      const indexRow = matrix[index][row];
      const indexColumn = matrix[index][column];
      matrix[index][row] = cosine * indexRow - sine * indexColumn;
      matrix[row][index] = matrix[index][row];
      matrix[index][column] = sine * indexRow + cosine * indexColumn;
      matrix[column][index] = matrix[index][column];
    }

    const vectorRow = eigenvectors[index][row];
    const vectorColumn = eigenvectors[index][column];
    eigenvectors[index][row] = cosine * vectorRow - sine * vectorColumn;
    eigenvectors[index][column] = sine * vectorRow + cosine * vectorColumn;
  }
}

function stableSignedVector(vector: Vector): Vector {
  let pivotIndex = 0;
  for (let index = 1; index < vector.length; index += 1) {
    if (Math.abs(vector[index]) > Math.abs(vector[pivotIndex])) {
      pivotIndex = index;
    }
  }

  return vector[pivotIndex] >= 0
    ? vector
    : vector.map((coordinate) => -coordinate);
}

function compareEigenpairs(
  left: SymmetricEigenpair,
  right: SymmetricEigenpair,
): number {
  const eigenvalueDifference = right.value - left.value;
  if (Math.abs(eigenvalueDifference) > defaultTolerance) {
    return eigenvalueDifference;
  }

  return compareVectorsLexicographicDescending(left.vector, right.vector);
}

function compareVectorsLexicographicDescending(
  left: Vector,
  right: Vector,
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    if (Math.abs(difference) > defaultTolerance) {
      return difference > 0 ? -1 : 1;
    }
  }

  return 0;
}
