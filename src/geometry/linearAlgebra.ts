export type Vector = number[];
export type Matrix = number[][];

export function identityMatrix(size: number): Matrix {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error(`Matrix size must be a non-negative integer, got ${size}.`);
  }

  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)),
  );
}

export function matMul(left: Matrix, right: Matrix): Matrix {
  const [leftRows, leftColumns] = matrixShape(left, "left");
  const [rightRows, rightColumns] = matrixShape(right, "right");

  if (leftColumns !== rightRows) {
    throw new Error(
      `Cannot multiply ${leftRows}x${leftColumns} by ${rightRows}x${rightColumns} matrices.`,
    );
  }

  return Array.from({ length: leftRows }, (_, row) =>
    Array.from({ length: rightColumns }, (_, column) => {
      let total = 0;
      for (let index = 0; index < leftColumns; index += 1) {
        total += left[row][index] * right[index][column];
      }
      return total;
    }),
  );
}

export function matVec(matrix: Matrix, vector: Vector): Vector {
  const [rows, columns] = matrixShape(matrix, "matrix");

  if (columns !== vector.length) {
    throw new Error(
      `Cannot multiply a ${rows}x${columns} matrix by a vector of length ${vector.length}.`,
    );
  }

  return Array.from({ length: rows }, (_, row) => {
    let total = 0;
    for (let column = 0; column < columns; column += 1) {
      total += matrix[row][column] * vector[column];
    }
    return total;
  });
}

export function transpose(matrix: Matrix): Matrix {
  const [rows, columns] = matrixShape(matrix, "matrix");

  return Array.from({ length: columns }, (_, column) =>
    Array.from({ length: rows }, (_, row) => matrix[row][column]),
  );
}

export function maxAbsMatrixDifference(left: Matrix, right: Matrix): number {
  const [leftRows, leftColumns] = matrixShape(left, "left");
  const [rightRows, rightColumns] = matrixShape(right, "right");

  if (leftRows !== rightRows || leftColumns !== rightColumns) {
    throw new Error(
      `Cannot compare ${leftRows}x${leftColumns} and ${rightRows}x${rightColumns} matrices.`,
    );
  }

  let maximum = 0;
  for (let row = 0; row < leftRows; row += 1) {
    for (let column = 0; column < leftColumns; column += 1) {
      maximum = Math.max(
        maximum,
        Math.abs(left[row][column] - right[row][column]),
      );
    }
  }

  return maximum;
}

export function maxAbsVectorDifference(left: Vector, right: Vector): number {
  if (left.length !== right.length) {
    throw new Error(
      `Cannot compare vectors of lengths ${left.length} and ${right.length}.`,
    );
  }

  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
  }
  return maximum;
}

export function matrixShape(
  matrix: Matrix,
  name = "matrix",
): [rows: number, columns: number] {
  if (matrix.length === 0) {
    return [0, 0];
  }

  const columns = matrix[0].length;
  for (let row = 1; row < matrix.length; row += 1) {
    if (matrix[row].length !== columns) {
      throw new Error(`${name} is not rectangular.`);
    }
  }

  return [matrix.length, columns];
}

export function assertSquareMatrix(matrix: Matrix, name = "matrix"): void {
  const [rows, columns] = matrixShape(matrix, name);
  if (rows !== columns) {
    throw new Error(`${name} must be square, got ${rows}x${columns}.`);
  }
}
