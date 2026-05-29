import {
  type Matrix,
  type Vector,
  identityMatrix,
  matVec,
  matrixShape,
} from "./linearAlgebra";

export interface PcaProjectionResult {
  points: Vector[];
  components: Matrix;
  mean: Vector;
  variances: Vector;
}

const JACOBI_TOLERANCE = 1e-12;

export function pcaProject(
  points: Vector[],
  targetDimension = 3,
): PcaProjectionResult {
  if (!Number.isInteger(targetDimension) || targetDimension < 1) {
    throw new Error(
      `PCA target dimension must be a positive integer, got ${targetDimension}.`,
    );
  }
  if (points.length === 0) {
    throw new Error("PCA projection needs at least one point.");
  }

  const dimension = points[0].length;
  for (const point of points) {
    if (point.length !== dimension) {
      throw new Error("PCA projection needs points with a common dimension.");
    }
  }

  const mean = computeMean(points, dimension);
  const centeredPoints = points.map((point) =>
    point.map((coordinate, index) => coordinate - mean[index]),
  );
  const covariance = computePopulationCovariance(centeredPoints, dimension);
  const eigenpairs = jacobiEigenDecomposition(covariance);
  const selectedPairs = eigenpairs.slice(
    0,
    Math.min(targetDimension, dimension),
  );

  const components: Matrix = selectedPairs.map((pair) => pair.vector);
  const variances = selectedPairs.map((pair) => Math.max(0, pair.value));

  while (components.length < targetDimension) {
    components.push(Array.from({ length: dimension }, () => 0));
    variances.push(0);
  }

  // PCA is a deterministic drawing convention here: the centered data is
  // expressed in sorted principal directions, then padded with zeros if d < 3.
  const projectedPoints = centeredPoints.map((point) =>
    matVec(components, point),
  );

  return {
    points: projectedPoints,
    components,
    mean,
    variances,
  };
}

interface Eigenpair {
  value: number;
  vector: Vector;
}

function computeMean(points: Vector[], dimension: number): Vector {
  const mean = Array.from({ length: dimension }, () => 0);
  for (const point of points) {
    for (let index = 0; index < dimension; index += 1) {
      mean[index] += point[index];
    }
  }
  return mean.map((coordinate) => coordinate / points.length);
}

function computePopulationCovariance(
  centeredPoints: Vector[],
  dimension: number,
): Matrix {
  const covariance = Array.from({ length: dimension }, () =>
    Array.from({ length: dimension }, () => 0),
  );

  for (const point of centeredPoints) {
    for (let row = 0; row < dimension; row += 1) {
      for (let column = row; column < dimension; column += 1) {
        covariance[row][column] += point[row] * point[column];
      }
    }
  }

  for (let row = 0; row < dimension; row += 1) {
    for (let column = row; column < dimension; column += 1) {
      const value = covariance[row][column] / centeredPoints.length;
      covariance[row][column] = value;
      covariance[column][row] = value;
    }
  }

  return covariance;
}

function jacobiEigenDecomposition(symmetricMatrix: Matrix): Eigenpair[] {
  const [rows, columns] = matrixShape(symmetricMatrix, "covariance matrix");
  if (rows !== columns) {
    throw new Error(
      `Covariance matrix must be square, got ${rows}x${columns}.`,
    );
  }

  const matrix = symmetricMatrix.map((row) => [...row]);
  const eigenvectors = identityMatrix(rows);
  const maxIterations = Math.max(1, 50 * rows * rows);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const pivot = largestOffDiagonalEntry(matrix);
    if (pivot.value <= JACOBI_TOLERANCE) {
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
  const diagonalDifference = matrix[column][column] - matrix[row][row];
  const tau = diagonalDifference / (2 * matrix[row][column]);
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

function compareEigenpairs(left: Eigenpair, right: Eigenpair): number {
  const eigenvalueDifference = right.value - left.value;
  if (Math.abs(eigenvalueDifference) > JACOBI_TOLERANCE) {
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
    if (Math.abs(difference) > JACOBI_TOLERANCE) {
      return difference > 0 ? -1 : 1;
    }
  }

  return 0;
}
