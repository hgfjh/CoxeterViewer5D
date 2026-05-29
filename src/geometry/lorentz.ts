import {
  type Matrix,
  type Vector,
  assertSquareMatrix,
  identityMatrix,
  matMul,
  maxAbsMatrixDifference,
  transpose,
} from "./linearAlgebra";

export const DEFAULT_GEOMETRY_TOLERANCE = 1e-9;

export function lorentzDot(left: Vector, right: Vector): number {
  if (left.length !== right.length) {
    throw new Error(
      `Lorentz dot needs equal lengths, got ${left.length} and ${right.length}.`,
    );
  }
  if (left.length === 0) {
    throw new Error("Lorentz dot needs at least one coordinate.");
  }

  // Convention: J = diag(-1, 1, ..., 1), so the first coordinate is time-like.
  let total = -left[0] * right[0];
  for (let index = 1; index < left.length; index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

export function lorentzNormalizeTimelike(vector: Vector): Vector {
  const normSquared = lorentzDot(vector, vector);
  if (normSquared >= 0) {
    throw new Error(
      `Expected a timelike vector with negative Lorentz norm, got ${normSquared}.`,
    );
  }

  const scale = 1 / Math.sqrt(-normSquared);
  const normalized = vector.map((coordinate) => coordinate * scale);

  // We use the upper sheet of the hyperboloid model: <x,x>_J = -1 and x0 > 0.
  return normalized[0] >= 0
    ? normalized
    : normalized.map((coordinate) => -coordinate);
}

export function reflectInSpacelikeNormal(
  point: Vector,
  normal: Vector,
): Vector {
  if (point.length !== normal.length) {
    throw new Error(
      `Reflection needs point and normal of the same length, got ${point.length} and ${normal.length}.`,
    );
  }

  const normalNorm = lorentzDot(normal, normal);
  if (normalNorm <= 0) {
    throw new Error(
      `Expected a spacelike normal with positive Lorentz norm, got ${normalNorm}.`,
    );
  }

  // Coxeter normals are usually unit spacelike. Dividing by <n,n> also handles
  // scaled input normals without changing the reflected point.
  const factor = (2 * lorentzDot(point, normal)) / normalNorm;
  return point.map((coordinate, index) => coordinate - factor * normal[index]);
}

export function reflectionMatrixFromNormal(normal: Vector): Matrix {
  const normalNorm = lorentzDot(normal, normal);
  if (normalNorm <= 0) {
    throw new Error(
      `Expected a spacelike normal with positive Lorentz norm, got ${normalNorm}.`,
    );
  }

  const size = normal.length;
  const jNormal = normal.map((coordinate, index) =>
    index === 0 ? -coordinate : coordinate,
  );

  // R = I - 2 n (J n)^T / <n,n>_J, for column vectors.
  return identityMatrix(size).map((rowValues, row) =>
    rowValues.map(
      (entry, column) =>
        entry - (2 * normal[row] * jNormal[column]) / normalNorm,
    ),
  );
}

export function lorentzFormMatrix(size: number): Matrix {
  const form = identityMatrix(size);
  if (size > 0) {
    form[0][0] = -1;
  }
  return form;
}

export function preservesLorentzForm(
  matrix: Matrix,
  tolerance = DEFAULT_GEOMETRY_TOLERANCE,
): boolean {
  assertSquareMatrix(matrix, "Lorentz transformation");

  const form = lorentzFormMatrix(matrix.length);
  const pulledBackForm = matMul(matMul(transpose(matrix), form), matrix);
  return maxAbsMatrixDifference(pulledBackForm, form) <= tolerance;
}
