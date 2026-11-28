import type { Matrix, Vector } from "./linearAlgebra";

/**
 * Refines a linear projection R^d -> R^3 (rows of `start`, orthonormal) so
 * that chosen point pairs stay apart after projection.
 *
 * PCA maximises total variance, which for a symmetric orbit often aligns the
 * kept axes with symmetry directions and sends distinct chambers to the same
 * 3D point. This drawing heuristic instead maximises
 *
 *   softmin_pairs log |P (a - b)|^2  -  log mean_v |P v|^2,
 *
 * i.e. the worst projected pair length relative to the overall size, by
 * gradient ascent on P followed by re-orthonormalisation of its rows. The map
 * stays linear, so planar convex polygons stay planar and convex (or become
 * flat segments, never self-intersecting). It is deterministic for a fixed
 * input order. It is not a metric statement about the orbit.
 */
export function refineProjection(
  start: Matrix,
  points: Vector[],
  pairs: Array<[number, number]>,
  options: { iterations?: number; temperature?: number } = {},
): Matrix {
  const differences = pairs
    .map(([a, b]) => points[a].map((value, k) => value - points[b][k]))
    .filter((difference) => squaredLength(difference) > 1e-24)
    // Each pair is compared with its own unprojected length, so long and
    // short edges count alike.
    .map((difference) =>
      scaleVector(difference, 1 / Math.sqrt(squaredLength(difference))),
    );
  if (differences.length === 0 || points.length === 0) return start;

  const dimension = points[0].length;
  const secondMoment = Array.from({ length: dimension }, () =>
    Array<number>(dimension).fill(0),
  );
  for (const point of points) {
    for (let i = 0; i < dimension; i += 1) {
      for (let j = 0; j < dimension; j += 1) {
        secondMoment[i][j] += (point[i] * point[j]) / points.length;
      }
    }
  }

  const tau = options.temperature ?? 0.05;
  const objective = (projection: Matrix) => {
    const logs = differences.map((difference) =>
      Math.log(Math.max(1e-30, projectedSquaredLength(projection, difference))),
    );
    const minimum = Math.min(...logs);
    const weights = logs.map((value) => Math.exp(-(value - minimum) / tau));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const size = trace(projection, secondMoment);
    return {
      value: minimum - tau * Math.log(total) - Math.log(size),
      weights: weights.map((weight) => weight / total),
      size,
    };
  };

  let projection = orthonormalizeRows(start);
  let current = objective(projection);
  let step = 0.05;
  for (
    let iteration = 0;
    iteration < (options.iterations ?? 60);
    iteration += 1
  ) {
    const gradient = projection.map((row) => row.map(() => 0));
    differences.forEach((difference, index) => {
      const weight = current.weights[index];
      if (weight < 1e-12) return;
      const projected = projection.map((row) => dotProduct(row, difference));
      const length = projected.reduce((sum, value) => sum + value * value, 0);
      for (let r = 0; r < projection.length; r += 1) {
        for (let k = 0; k < dimension; k += 1) {
          gradient[r][k] +=
            (weight * 2 * projected[r] * difference[k]) / length;
        }
      }
    });
    for (let r = 0; r < projection.length; r += 1) {
      for (let k = 0; k < dimension; k += 1) {
        let moment = 0;
        for (let j = 0; j < dimension; j += 1) {
          moment += projection[r][j] * secondMoment[j][k];
        }
        gradient[r][k] -= (2 * moment) / current.size;
      }
    }
    const gradientNorm = Math.sqrt(
      gradient.reduce((sum, row) => sum + squaredLength(row), 0),
    );
    if (gradientNorm < 1e-12) break;

    let accepted = false;
    while (step > 1e-6) {
      const trial = orthonormalizeRows(
        projection.map((row, r) =>
          row.map((value, k) => value + (step * gradient[r][k]) / gradientNorm),
        ),
      );
      const trialObjective = objective(trial);
      if (trialObjective.value > current.value) {
        projection = trial;
        current = trialObjective;
        step *= 1.4;
        accepted = true;
        break;
      }
      step *= 0.5;
    }
    if (!accepted) break;
  }
  return projection;
}

function orthonormalizeRows(matrix: Matrix): Matrix {
  const rows: Matrix = [];
  for (const row of matrix) {
    let next = [...row];
    for (const previous of rows) {
      const projection = dotProduct(next, previous);
      next = next.map((value, k) => value - projection * previous[k]);
    }
    const length = Math.sqrt(squaredLength(next));
    rows.push(length > 1e-12 ? scaleVector(next, 1 / length) : next);
  }
  return rows;
}

function projectedSquaredLength(projection: Matrix, vector: Vector): number {
  let total = 0;
  for (const row of projection) {
    const value = dotProduct(row, vector);
    total += value * value;
  }
  return total;
}

/** trace(P M P^T) = mean_v |P v|^2 when M is the second-moment matrix. */
function trace(projection: Matrix, moment: Matrix): number {
  let total = 0;
  for (const row of projection) {
    for (let i = 0; i < row.length; i += 1) {
      for (let j = 0; j < row.length; j += 1) {
        total += row[i] * moment[i][j] * row[j];
      }
    }
  }
  return Math.max(total, 1e-30);
}

function dotProduct(left: Vector, right: Vector): number {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

function squaredLength(vector: Vector): number {
  return dotProduct(vector, vector);
}

function scaleVector(vector: Vector, scale: number): Vector {
  return vector.map((value) => value * scale);
}
