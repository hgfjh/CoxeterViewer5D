import { type Vector } from "./linearAlgebra";

/**
 * Klein projection from the upper hyperboloid to the unit ball.
 *
 * Geodesics become straight chords, which makes chamber adjacency easier to
 * trace. Hyperbolic distances and angles are not preserved.
 */
export function kleinProject(point: Vector): Vector {
  assertUpperHyperboloidPoint(point, "Klein");

  return point.slice(1).map((coordinate) => coordinate / point[0]);
}

/**
 * Poincare projection from the upper hyperboloid to the unit ball.
 *
 * This projection is conformal in the full model, but the app may still show a
 * 3D axis/PCA slice of a higher-dimensional point cloud.
 */
export function poincareProject(point: Vector): Vector {
  assertUpperHyperboloidPoint(point, "Poincare");

  const denominator = point[0] + 1;
  return point.slice(1).map((coordinate) => coordinate / denominator);
}

function assertUpperHyperboloidPoint(
  point: Vector,
  projectionName: string,
): void {
  if (point.length < 2) {
    throw new Error(
      `${projectionName} projection needs at least two hyperboloid coordinates.`,
    );
  }
  if (point[0] <= 0) {
    throw new Error(
      `${projectionName} projection expects the upper hyperboloid sheet with x0 > 0.`,
    );
  }
}
