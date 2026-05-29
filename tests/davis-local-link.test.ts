import { describe, expect, it } from "vitest";

import A3 from "../public/examples/A3.json";
import I2_5 from "../public/examples/I2_5.json";
import universalRank3 from "../public/examples/universal_rank3.json";
import {
  checkPositiveDefinite,
  checkSphericalSubset,
  computeLocalLink,
  deriveDavisIncidencePoset,
  enumerateSphericalSubsets,
  localLinkHomology,
} from "../src/davis";
import { generateViewerBall } from "../src/app/generationPipeline";
import type { CoxeterSystemInput } from "../src/types";

const createdAt = "2026-01-01T00:00:00.000Z";

function subsetKeys(subsets: Array<{ generators: number[] }>): string[] {
  return subsets.map((subset) => subset.generators.join(","));
}

describe("spherical subset enumeration", () => {
  it("finds the rank-three spherical subset in A3", () => {
    const result = enumerateSphericalSubsets(A3);

    expect(result.warnings).toEqual([]);
    expect(result.exhaustive).toBe(true);
    expect(subsetKeys(result.subsets)).toEqual([
      "0",
      "1",
      "2",
      "0,1",
      "0,2",
      "1,2",
      "0,1,2",
    ]);
    expect(
      result.subsets.find((subset) => subset.generators.join(",") === "0,1,2")
        ?.subgroupOrder,
    ).toBe(24);
  });

  it("keeps only singleton spherical subsets for universal rank three", () => {
    const result = enumerateSphericalSubsets(universalRank3);

    expect(subsetKeys(result.subsets)).toEqual(["0", "1", "2"]);
    expect(result.subsets.filter((subset) => subset.rank === 2)).toHaveLength(
      0,
    );
  });

  it("finds singleton subsets and the finite pair in I2(5)", () => {
    const result = enumerateSphericalSubsets(I2_5);

    expect(subsetKeys(result.subsets)).toEqual(["0", "1", "0,1"]);
    expect(
      result.subsets.find((subset) => subset.rank === 2)?.gramMatrix,
    ).toEqual(definedFinitePairGram());
  });

  it("rejects a subset containing an infinite Coxeter entry", () => {
    const check = checkSphericalSubset(universalRank3, [0, 1]);

    expect(check.spherical).toBe(false);
    expect(check.gramMatrix).toBeUndefined();
    expect(check.reason).toContain("infinite Coxeter entry");
  });

  it("names a non-positive Cholesky pivot in direct matrix checks", () => {
    const check = checkPositiveDefinite([
      [1, -1],
      [-1, 1],
    ]);

    expect(check.positiveDefinite).toBe(false);
    expect(check.reason).toContain("pivot");
  });
});

describe("higher Davis cells", () => {
  it("records coset, incidence, and subgroup-size metadata for visible A3 cells", () => {
    const { ball } = generateViewerBall(A3 as CoxeterSystemInput, {
      radius: 6,
      createdAt,
    });

    expect(ball.higherCells).toHaveLength(1);
    expect(ball.higherCells?.[0]).toMatchObject({
      sphericalSubsetId: "T:0,1,2",
      complete: true,
      coset: {
        nodeCount: 24,
        expectedSubgroupOrder: 24,
        subgroupSizeStatus: "matches",
      },
      rendering: {
        proxy: true,
      },
    });
    expect(
      ball.higherCells?.[0].incidence?.rankTwoCellIds.length,
    ).toBeGreaterThan(0);
  });

  it("derives exact Davis incidence records and local-link homology summaries", () => {
    const { ball } = generateViewerBall(A3 as CoxeterSystemInput, {
      radius: 6,
      createdAt,
    });
    const link = computeLocalLink(A3, "e");
    const incidence = deriveDavisIncidencePoset(ball, link.sphericalSubsets, {
      localLinks: [link],
    });

    expect(incidence.status).toBe("complete-in-ball");
    expect(incidence.records.length).toBeGreaterThan(ball.twoCells.length);
    expect(
      incidence.records.some(
        (record) =>
          record.rank === 3 &&
          record.renderingStatus === "exact-incidence" &&
          record.expectedSubgroupOrder === 24,
      ),
    ).toBe(true);
    expect(incidence.localLinks?.[0].bettiNumbers).toMatchObject({
      "0": 1,
      "1": 0,
    });
  });
});

describe("local links", () => {
  it("builds generator vertices and spherical-subset simplices", () => {
    const link = computeLocalLink(A3, "e");

    expect(link.nodeId).toBe("e");
    expect(link.vertices.map((vertex) => vertex.generator)).toEqual([0, 1, 2]);
    expect(link.simplices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generators: [0],
          dimension: 0,
        }),
        expect.objectContaining({
          generators: [0, 1, 2],
          dimension: 2,
        }),
      ]),
    );
  });

  it("summarizes local-link homology over F2", () => {
    const link = computeLocalLink(I2_5, "e");
    const homology = localLinkHomology(link);

    expect(homology.simplexCountByDimension).toEqual({
      "0": 2,
      "1": 1,
    });
    expect(homology.bettiNumbers).toEqual({
      "0": 1,
      "1": 0,
    });
  });
});

function definedFinitePairGram(): number[][] {
  return [
    [1, -Math.cos(Math.PI / 5)],
    [-Math.cos(Math.PI / 5), 1],
  ];
}
