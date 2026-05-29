import { describe, expect, it } from "vitest";

import {
  identityMatrix,
  kleinProject,
  lorentzDot,
  lorentzNormalizeTimelike,
  matMul,
  matVec,
  maxAbsMatrixDifference,
  maxAbsVectorDifference,
  pcaProject,
  poincareProject,
  preservesLorentzForm,
  reflectInSpacelikeNormal,
  reflectionMatrixFromNormal,
} from "../src/geometry";

function euclideanNorm(vector: number[]): number {
  return Math.sqrt(
    vector.reduce((total, coordinate) => total + coordinate * coordinate, 0),
  );
}

describe("Lorentzian hyperboloid utilities", () => {
  it("uses the J = diag(-1, 1, ..., 1) Lorentz convention", () => {
    expect(lorentzDot([2, 3, 4], [5, 7, 11])).toBe(-10 + 21 + 44);
  });

  it("normalizes timelike vectors to the upper unit hyperboloid", () => {
    const point = lorentzNormalizeTimelike([4, 1, 2]);

    expect(lorentzDot(point, point)).toBeCloseTo(-1, 12);
    expect(point[0]).toBeGreaterThan(0);
  });

  it("reflects in a spacelike normal by an involution", () => {
    const normal = [0, 1, 0];
    const point = [2, 0.5, 1.5];

    const reflected = reflectInSpacelikeNormal(point, normal);
    const reflectedTwice = reflectInSpacelikeNormal(reflected, normal);

    expect(reflected).toEqual([2, -0.5, 1.5]);
    expect(maxAbsVectorDifference(reflectedTwice, point)).toBeLessThan(1e-12);
    expect(lorentzDot(reflected, reflected)).toBeCloseTo(
      lorentzDot(point, point),
      12,
    );
  });

  it("builds reflection matrices that square to the identity", () => {
    const normal = [1, Math.sqrt(2), 0];
    const reflection = reflectionMatrixFromNormal(normal);
    const squared = matMul(reflection, reflection);

    expect(maxAbsMatrixDifference(squared, identityMatrix(3))).toBeLessThan(
      1e-12,
    );
    expect(preservesLorentzForm(reflection, 1e-12)).toBe(true);
  });

  it("matches matrix and vector reflection formulas", () => {
    const normal = [0, 2, 0];
    const point = [3, 1, -2];
    const reflection = reflectionMatrixFromNormal(normal);

    expect(
      maxAbsVectorDifference(
        matVec(reflection, point),
        reflectInSpacelikeNormal(point, normal),
      ),
    ).toBeLessThan(1e-12);
  });
});

describe("Hyperboloid ball projections", () => {
  it("projects normalized hyperboloid points inside the Klein and Poincare balls", () => {
    const point = lorentzNormalizeTimelike([3, 1, 1, 0.5]);
    const klein = kleinProject(point);
    const poincare = poincareProject(point);

    expect(euclideanNorm(klein)).toBeLessThan(1);
    expect(euclideanNorm(poincare)).toBeLessThan(1);
    expect(klein.length).toBe(3);
    expect(poincare.length).toBe(3);
  });
});

describe("Deterministic PCA projection", () => {
  it("orders components by variance and returns stable 3D coordinates", () => {
    const points = [
      [-2, 0, 0],
      [-1, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ];

    const first = pcaProject(points, 3);
    const second = pcaProject(points, 3);

    expect(first.points).toEqual(second.points);
    expect(first.components).toEqual(second.components);
    expect(first.variances[0]).toBeGreaterThan(first.variances[1]);
    expect(first.components[0]).toEqual([1, 0, 0]);
    expect(first.points.map((point) => point[0])).toEqual([-2, -1, 1, 2]);
    expect(first.points.every((point) => point.length === 3)).toBe(true);
  });

  it("uses deterministic lexicographic ordering for equal-variance axes", () => {
    const points = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    const projection = pcaProject(points, 3);

    expect(projection.components[0]).toEqual([1, 0]);
    expect(projection.components[1]).toEqual([0, 1]);
    expect(projection.components[2]).toEqual([0, 0]);
    expect(projection.points.every((point) => point.length === 3)).toBe(true);
  });

  it("finds a stable principal direction for correlated data", () => {
    const projection = pcaProject(
      [
        [1, 1],
        [-1, -1],
        [2, 2],
        [-2, -2],
      ],
      3,
    );

    expect(projection.components[0][0]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(projection.components[0][1]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(projection.variances[0]).toBeGreaterThan(projection.variances[1]);
  });
});
