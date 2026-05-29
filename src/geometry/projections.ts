import { type Vector } from "./linearAlgebra";

export function kleinProject(point: Vector): Vector {
  assertUpperHyperboloidPoint(point, "Klein");

  // The Klein model sends x in H^d to spatial(x) / x0. It keeps geodesics
  // straight in the ball, but it is not a distance-preserving projection.
  return point.slice(1).map((coordinate) => coordinate / point[0]);
}

export function poincareProject(point: Vector): Vector {
  assertUpperHyperboloidPoint(point, "Poincare");

  // Stereographic projection from (-1, 0, ..., 0) to the unit ball.
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
