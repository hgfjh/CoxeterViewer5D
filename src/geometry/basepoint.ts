import type { Matrix, Vector } from "./linearAlgebra";
import { lorentzDot, lorentzNormalizeTimelike } from "./lorentz";

export interface ChamberBasepointDiagnostics {
  maxFacetValue: number;
  tolerance: number;
  method: "supplied" | "normal-sum" | "least-squares" | "coordinate-search";
  orientedByGlobalSign: boolean;
}

export interface ChamberBasepointResult {
  ok: boolean;
  basepoint?: Vector;
  normals: Vector[];
  diagnostics?: ChamberBasepointDiagnostics;
  warnings: string[];
}

interface Candidate {
  point: Vector;
  method: ChamberBasepointDiagnostics["method"];
}

/**
 * Finds a chamber barycenter on the upper hyperboloid for normals whose
 * chamber convention is <x,n_i>_J <= 0. A global normal sign is allowed because
 * a Gram matrix alone does not determine inward versus outward orientation.
 */
export function validateOrSolveChamberBasepoint(
  normals: Vector[],
  suppliedBasepoint?: Vector,
  tolerance = 1e-8,
): ChamberBasepointResult {
  const warnings: string[] = [];

  for (const orient of [false, true]) {
    const orientedNormals = orient
      ? normals.map((normal) => normal.map((coordinate) => -coordinate))
      : normals.map((normal) => [...normal]);
    const candidates = buildCandidates(orientedNormals, suppliedBasepoint);

    for (const candidate of candidates) {
      const point = tryNormalize(candidate.point);
      if (point === undefined) {
        continue;
      }

      const maxFacetValue = maxFacetInequality(point, orientedNormals);
      if (maxFacetValue <= tolerance) {
        const candidateWarnings: string[] = [];
        if (orient) {
          candidateWarnings.push(
            "Normals were globally reoriented so the chamber basepoint satisfies <x,n_i> <= 0.",
          );
        }
        if (candidate.method === "supplied") {
          const norm = lorentzDot(candidate.point, candidate.point);
          if (Math.abs(norm + 1) > tolerance) {
            candidateWarnings.push(
              `geometry.basepoint was normalized from Lorentz norm ${formatNumber(norm)}.`,
            );
          }
        }
        if (candidate.method !== "supplied") {
          candidateWarnings.push(
            `geometry.basepoint was solved numerically by ${candidate.method}.`,
          );
        }

        return {
          ok: true,
          basepoint: point,
          normals: orientedNormals,
          diagnostics: {
            maxFacetValue,
            tolerance,
            method: candidate.method,
            orientedByGlobalSign: orient,
          },
          warnings: [...warnings, ...candidateWarnings],
        };
      }
    }
  }

  return {
    ok: false,
    normals: normals.map((normal) => [...normal]),
    warnings: [
      ...warnings,
      "Could not find a timelike chamber basepoint satisfying <x,n_i> <= 0 for all facets.",
    ],
  };
}

export function maxFacetInequality(point: Vector, normals: Vector[]): number {
  return Math.max(...normals.map((normal) => lorentzDot(point, normal)));
}

function buildCandidates(
  normals: Vector[],
  suppliedBasepoint?: Vector,
): Candidate[] {
  const candidates: Candidate[] = [];

  if (suppliedBasepoint !== undefined) {
    candidates.push({ point: [...suppliedBasepoint], method: "supplied" });
  }

  const sum = vectorSum(normals);
  candidates.push({ point: sum, method: "normal-sum" });
  candidates.push({
    point: sum.map((coordinate) => -coordinate),
    method: "normal-sum",
  });

  const leastSquares = solveLeastSquaresBasepoint(normals);
  if (leastSquares !== undefined) {
    candidates.push({ point: leastSquares, method: "least-squares" });
  }

  const searched = coordinateSearchBasepoint(normals, leastSquares ?? sum);
  if (searched !== undefined) {
    candidates.push({ point: searched, method: "coordinate-search" });
  }

  return candidates;
}

function tryNormalize(point: Vector): Vector | undefined {
  try {
    return lorentzNormalizeTimelike(point);
  } catch {
    return undefined;
  }
}

function vectorSum(vectors: Vector[]): Vector {
  const result = Array.from({ length: vectors[0]?.length ?? 0 }, () => 0);
  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) {
      result[index] += vector[index];
    }
  }
  return result;
}

function solveLeastSquaresBasepoint(normals: Vector[]): Vector | undefined {
  if (normals.length === 0) {
    return undefined;
  }

  const coordinateCount = normals[0].length;
  const covectors = normals.map((normal) =>
    normal.map((coordinate, index) => (index === 0 ? -coordinate : coordinate)),
  );
  const normalMatrix: Matrix = Array.from({ length: coordinateCount }, () =>
    Array.from({ length: coordinateCount }, () => 0),
  );
  const rightHandSide = Array.from({ length: coordinateCount }, () => 0);
  const ridge = 1e-9;

  for (const row of covectors) {
    for (let i = 0; i < coordinateCount; i += 1) {
      rightHandSide[i] -= row[i];
      for (let j = 0; j < coordinateCount; j += 1) {
        normalMatrix[i][j] += row[i] * row[j];
      }
    }
  }

  for (let index = 0; index < coordinateCount; index += 1) {
    normalMatrix[index][index] += ridge;
  }

  return solveLinearSystem(normalMatrix, rightHandSide);
}

function coordinateSearchBasepoint(
  normals: Vector[],
  seed: Vector,
): Vector | undefined {
  const dimension = (normals[0]?.length ?? 1) - 1;
  if (dimension < 1) {
    return undefined;
  }

  let spatial = seed.slice(1);
  if (spatial.length !== dimension) {
    spatial = Array.from({ length: dimension }, () => 0);
  }

  let step = Math.max(0.25, vectorLength(spatial) || 1);
  let best = pointFromSpatial(spatial);
  let bestScore = violationScore(best, normals);

  for (let round = 0; round < 80; round += 1) {
    let improved = false;
    for (let axis = 0; axis < dimension; axis += 1) {
      for (const sign of [-1, 1]) {
        const nextSpatial = [...spatial];
        nextSpatial[axis] += sign * step;
        const point = pointFromSpatial(nextSpatial);
        const score = violationScore(point, normals);
        if (score < bestScore) {
          spatial = nextSpatial;
          best = point;
          bestScore = score;
          improved = true;
        }
      }
    }

    if (!improved) {
      step *= 0.5;
      if (step < 1e-8) {
        break;
      }
    }
  }

  return best;
}

function pointFromSpatial(spatial: Vector): Vector {
  const squared = spatial.reduce(
    (total, coordinate) => total + coordinate * coordinate,
    0,
  );
  return [Math.sqrt(1 + squared), ...spatial];
}

function violationScore(point: Vector, normals: Vector[]): number {
  return normals.reduce((total, normal) => {
    const violation = Math.max(0, lorentzDot(point, normal));
    return total + violation * violation;
  }, 0);
}

function vectorLength(vector: Vector): number {
  return Math.sqrt(
    vector.reduce((total, coordinate) => total + coordinate * coordinate, 0),
  );
}

function solveLinearSystem(
  matrix: Matrix,
  rightHandSide: Vector,
): Vector | undefined {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, rightHandSide[index]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row][pivot]) > Math.abs(augmented[pivotRow][pivot])
      ) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][pivot]) < 1e-12) {
      return undefined;
    }

    [augmented[pivot], augmented[pivotRow]] = [
      augmented[pivotRow],
      augmented[pivot],
    ];

    const scale = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] /= scale;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toPrecision(6) : String(value);
}
