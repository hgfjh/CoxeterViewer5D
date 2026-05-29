import { describe, expect, it } from "vitest";

import A2 from "../public/examples/A2.json";
import compact5CubeGamma1 from "../public/examples/compact_5_cube_gamma1.json";
import hyperbolicToyRank2 from "../public/examples/hyperbolic_toy_rank2.json";
import { generateCayleyBall } from "../src/cayley";
import { parseCoxeterSystemInput } from "../src/coxeter";
import {
  buildHyperbolicReflectionData,
  hyperbolicPointForWord,
  identityMatrix,
  lorentzDot,
  matMul,
  matVec,
  maxAbsVectorDifference,
  placeCayleyNodesInHyperbolicGeometry,
  preservesLorentzForm,
} from "../src/geometry";
import type { CoxeterSystemInput } from "../src/types";

const createdAt = "2026-01-01T00:00:00.000Z";

function toySystem(): CoxeterSystemInput {
  return parseCoxeterSystemInput(hyperbolicToyRank2);
}

function euclideanNorm(vector: number[]): number {
  return Math.sqrt(
    vector.reduce((total, coordinate) => total + coordinate * coordinate, 0),
  );
}

describe("Geometric mode reflection data", () => {
  it("accepts the toy fixture and builds Lorentz reflection matrices", () => {
    const result = buildHyperbolicReflectionData(toySystem());
    const data = result.data;

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(data).toBeDefined();
    if (data === undefined) {
      throw new Error("Expected hyperbolic reflection data.");
    }
    expect(data.normals).toHaveLength(2);
    expect(data.reflectionMatrices).toHaveLength(2);
    expect(lorentzDot(data.normals[0], data.normals[1])).toBeCloseTo(-1.25, 12);
    expect(lorentzDot(data.basepoint, data.basepoint)).toBeCloseTo(-1, 12);

    for (const reflection of data.reflectionMatrices) {
      expect(preservesLorentzForm(reflection, 1e-12)).toBe(true);
    }
  });

  it("normalizes a scaled timelike basepoint with a warning", () => {
    const system = toySystem();
    const scaled: CoxeterSystemInput = {
      ...system,
      geometry: {
        ...system.geometry!,
        basepoint: system.geometry!.basepoint!.map(
          (coordinate) => 2 * coordinate,
        ),
      },
    };

    const result = buildHyperbolicReflectionData(scaled);

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("basepoint was normalized");
    expect(
      lorentzDot(result.data!.basepoint, result.data!.basepoint),
    ).toBeCloseTo(-1, 12);
    expect(result.data!.basepoint[0]).toBeGreaterThan(0);
  });

  it("reports missing geometry as a warning-bearing result", () => {
    const system = parseCoxeterSystemInput(A2);
    const result = placeCayleyNodesInHyperbolicGeometry(system, [
      { id: "e", word: [], length: 0 },
    ]);

    expect(result.ok).toBe(false);
    expect(result.placements).toEqual([]);
    expect(result.warnings.join(" ")).toContain("geometry block");
  });

  it("builds numerical Lorentz data for the compact 5-cube normal Gram matrix", () => {
    const system = parseCoxeterSystemInput(compact5CubeGamma1);
    const result = buildHyperbolicReflectionData(system, { tolerance: 1e-7 });

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("numerically factored");
    expect(result.warnings.join(" ")).toContain("solved numerically");
    expect(result.data?.normals).toHaveLength(system.rank);
    expect(
      lorentzDot(result.data!.basepoint, result.data!.basepoint),
    ).toBeCloseTo(-1, 8);
    expect(
      Math.max(
        ...result.data!.normals.map((normal) =>
          lorentzDot(result.data!.basepoint, normal),
        ),
      ),
    ).toBeLessThanOrEqual(1e-7);

    for (const reflection of result.data!.reflectionMatrices) {
      expect(preservesLorentzForm(reflection, 1e-7)).toBe(true);
    }
  });
});

describe("Hyperbolic chamber barycenter placement", () => {
  it("computes hyperboloid points and Klein-axis positions for Cayley nodes", () => {
    const system = toySystem();
    const ball = generateCayleyBall(system, { radius: 3, createdAt });
    const result = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: "klein-axes",
    });

    expect(result.ok).toBe(true);
    expect(result.placements).toHaveLength(ball.nodes.length);
    expect(result.nodes.every((node) => node.hyperbolicPoint)).toBe(true);
    expect(result.nodes.every((node) => node.position?.length === 3)).toBe(
      true,
    );

    for (const placement of result.placements) {
      expect(
        lorentzDot(placement.hyperbolicPoint, placement.hyperbolicPoint),
      ).toBeCloseTo(-1, 10);
      expect(placement.hyperbolicPoint[0]).toBeGreaterThan(0);
      expect(euclideanNorm(placement.modelPoint)).toBeLessThan(1);
    }
  });

  it("can scale geometric drawing coordinates without changing model points", () => {
    const system = toySystem();
    const ball = generateCayleyBall(system, { radius: 2, createdAt });
    const unit = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: "poincare-axes",
      displayScale: 1,
    });
    const displayScale = 12;
    const scaled = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: "poincare-axes",
      displayScale,
    });

    expect(scaled.ok).toBe(true);
    expect(scaled.placements.map((placement) => placement.modelPoint)).toEqual(
      unit.placements.map((placement) => placement.modelPoint),
    );
    scaled.placements.forEach((placement, index) => {
      expect(euclideanNorm(placement.position)).toBeCloseTo(
        euclideanNorm(unit.placements[index].position) * displayScale,
        10,
      );
    });
  });

  it("keeps scaled Poincare-axis toy positions inside the scaled reference ball", () => {
    const system = toySystem();
    const ball = generateCayleyBall(system, { radius: 5, createdAt });
    const displayScale = 12;
    const result = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: "poincare-axes",
      displayScale,
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).not.toContain("outside the unit ball");
    for (const placement of result.placements) {
      expect(euclideanNorm(placement.modelPoint)).toBeLessThan(1);
      expect(euclideanNorm(placement.position)).toBeLessThan(displayScale);
    }
  });

  it("uses the right-multiplication matrix convention for node words", () => {
    const reflectionData = buildHyperbolicReflectionData(toySystem()).data!;
    const word = [0, 1];
    const point = hyperbolicPointForWord(
      word,
      reflectionData.basepoint,
      reflectionData.reflectionMatrices,
    );

    let product = identityMatrix(reflectionData.basepoint.length);
    for (const generator of word) {
      product = matMul(product, reflectionData.reflectionMatrices[generator]);
    }

    const productPoint = matVec(product, reflectionData.basepoint);
    expect(maxAbsVectorDifference(point, productPoint)).toBeLessThan(1e-12);

    const leftFoldedPoint = word.reduce(
      (currentPoint, generator) =>
        matVec(reflectionData.reflectionMatrices[generator], currentPoint),
      reflectionData.basepoint,
    );
    expect(maxAbsVectorDifference(point, leftFoldedPoint)).toBeGreaterThan(
      1e-3,
    );
  });

  it("projects with Poincare-PCA deterministically to 3D", () => {
    const system = toySystem();
    const ball = generateCayleyBall(system, { radius: 3, createdAt });
    const first = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: "poincare-pca",
    });
    const second = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: "poincare-pca",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.placements.map((placement) => placement.position)).toEqual(
      second.placements.map((placement) => placement.position),
    );
    expect(
      first.placements.every((placement) => placement.position.length === 3),
    ).toBe(true);
    expect(
      first.placements.every(
        (placement) => euclideanNorm(placement.modelPoint) < 1,
      ),
    ).toBe(true);
  });

  it("can fit PCA to a local neighborhood and center the selected chamber", () => {
    const system = toySystem();
    const ball = generateCayleyBall(system, { radius: 3, createdAt });
    const centerNodeId = "w:0";
    const localFitNodeIds = new Set(["e", "w:0", "w:0.1"]);
    const result = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: "poincare-pca",
      displayScale: 12,
      pcaCenterNodeId: centerNodeId,
      pcaFitNodeIds: localFitNodeIds,
    });
    const centeredPlacement = result.placements.find(
      (placement) => placement.nodeId === centerNodeId,
    );

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("fitted to 3 local chamber");
    expect(centeredPlacement?.position).toEqual([0, 0, 0]);
  });

  it("places compact 5-cube chamber barycenters inside the projected ball", () => {
    const system = parseCoxeterSystemInput(compact5CubeGamma1);
    const ball = generateCayleyBall(system, { radius: 1, createdAt });
    const result = placeCayleyNodesInHyperbolicGeometry(system, ball.nodes, {
      projection: "klein-pca",
      tolerance: 1e-7,
    });

    expect(result.ok).toBe(true);
    expect(result.placements).toHaveLength(ball.nodes.length);
    expect(
      result.placements.every(
        (placement) => euclideanNorm(placement.modelPoint) < 1,
      ),
    ).toBe(true);
  });
});
