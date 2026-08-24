import { describe, expect, it } from "vitest";

import {
  certifyTorsionFreeAction,
  composePermutationModules,
  computePrimeWitnessCoverage,
  planSphericalSpecialSubgroups,
  type FiniteTransitivePermutationModule,
  type PrimeOrderWitnessCatalogue,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const COMMUTING_PAIR: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "A1 x A1",
  rank: 2,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
  ],
  coxeterMatrix: [
    [1, 2],
    [2, 1],
  ],
};

const COMMUTING_PAIR_WITNESSES: PrimeOrderWitnessCatalogue = {
  complete: true,
  method: "complete conjugacy classes of prime-order torsion in A1 x A1",
  witnesses: [
    { id: "a", word: [0], primeOrder: 2, sphericalSubsetId: "T:0" },
    { id: "b", word: [1], primeOrder: 2, sphericalSubsetId: "T:1" },
    {
      id: "ab",
      word: [0, 1],
      primeOrder: 2,
      sphericalSubsetId: "T:0,1",
    },
  ],
};

const FIRST_FACTOR: FiniteTransitivePermutationModule = {
  id: "first-factor",
  index: 2,
  generatorImages: [
    [1, 0],
    [0, 1],
  ],
};

const SECOND_FACTOR: FiniteTransitivePermutationModule = {
  id: "second-factor",
  index: 2,
  generatorImages: [
    [0, 1],
    [1, 0],
  ],
};

describe("prime-witness permutation-module coverage", () => {
  it("records fixed-point-free coverage without confusing a partial module for a torsion-free action", () => {
    const first = computePrimeWitnessCoverage(
      FIRST_FACTOR,
      COMMUTING_PAIR_WITNESSES,
    );
    const second = computePrimeWitnessCoverage(
      SECOND_FACTOR,
      COMMUTING_PAIR_WITNESSES,
    );

    expect(first).toMatchObject({
      valid: true,
      transitive: true,
      coveredWitnessIds: ["a", "ab"],
      uncoveredWitnessIds: ["b"],
    });
    expect(second).toMatchObject({
      valid: true,
      transitive: true,
      coveredWitnessIds: ["ab", "b"],
      uncoveredWitnessIds: ["a"],
    });
    expect(
      first.witnessChecks.find((check) => check.witnessId === "b"),
    ).toMatchObject({
      imageOrder: 1,
      fixedPointCount: 2,
      fixedPointFree: false,
      orderDividesWitnessOrder: true,
    });
  });

  it("rejects a module when a claimed prime witness has an incompatible image order", () => {
    const s3Action: FiniteTransitivePermutationModule = {
      id: "s3-natural",
      index: 3,
      generatorImages: [
        [1, 0, 2],
        [0, 2, 1],
      ],
    };
    const coverage = computePrimeWitnessCoverage(s3Action, {
      complete: true,
      witnesses: [{ id: "bad-order", word: [0, 1], primeOrder: 2 }],
    });

    expect(coverage.valid).toBe(false);
    expect(coverage.errors.join(" ")).toContain("does not divide 2");
  });
});

describe("deterministic diagonal-product composition", () => {
  it("combines two partial modules into the exact regular torsion-free action", () => {
    const plan = planSphericalSpecialSubgroups(COMMUTING_PAIR);
    const firstCertificate = certifyTorsionFreeAction(
      COMMUTING_PAIR,
      FIRST_FACTOR,
      plan,
    );
    const secondCertificate = certifyTorsionFreeAction(
      COMMUTING_PAIR,
      SECOND_FACTOR,
      plan,
    );
    const result = composePermutationModules(
      [SECOND_FACTOR, FIRST_FACTOR],
      COMMUTING_PAIR_WITNESSES,
    );

    expect(firstCertificate.status).toBe("failed");
    expect(secondCertificate.status).toBe("failed");
    expect(result.status).toBe("composed");
    expect(result.selection).toEqual({
      moduleIds: ["first-factor", "second-factor"],
      basePoints: [0, 0],
      minimumModuleCount: 2,
      productDegreeUpperBound: "4",
      orbitDegree: 4,
      orbitPointTuples: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
    });
    expect(result.candidate?.generatorImages).toEqual([
      [1, 0, 3, 2],
      [2, 3, 0, 1],
    ]);
    expect(result.diagnostics).toMatchObject({
      searchComplete: true,
      minimumProved: true,
      coveringCandidateSets: 1,
      uncoveredWitnessIds: [],
    });

    const compositeCertificate = certifyTorsionFreeAction(
      COMMUTING_PAIR,
      result.candidate!,
      plan,
    );
    expect(compositeCertificate.status).toBe("passed");
  });

  it("prefers a one-module witness cover before considering composites", () => {
    const regular: FiniteTransitivePermutationModule = {
      id: "regular",
      index: 4,
      generatorImages: [
        [1, 0, 3, 2],
        [2, 3, 0, 1],
      ],
    };
    const result = composePermutationModules(
      [SECOND_FACTOR, regular, FIRST_FACTOR],
      COMMUTING_PAIR_WITNESSES,
    );

    expect(result.status).toBe("composed");
    expect(result.selection).toMatchObject({
      moduleIds: ["regular"],
      minimumModuleCount: 1,
      orbitDegree: 4,
    });
  });

  it("fails closed for incomplete witness catalogues and one-based permutations", () => {
    const incomplete = composePermutationModules(
      [FIRST_FACTOR, SECOND_FACTOR],
      { ...COMMUTING_PAIR_WITNESSES, complete: false },
    );
    const oneBased = composePermutationModules(
      [
        {
          id: "one-based",
          index: 2,
          generatorImages: [
            [2, 1],
            [1, 2],
          ],
        },
      ],
      COMMUTING_PAIR_WITNESSES,
    );

    expect(incomplete.status).toBe("invalid-input");
    expect(incomplete.candidate).toBeUndefined();
    expect(incomplete.errors.join(" ")).toContain("catalogue is incomplete");
    expect(oneBased.status).toBe("invalid-input");
    expect(oneBased.candidate).toBeUndefined();
    expect(oneBased.coverage[0]).toMatchObject({ valid: false });
    expect(oneBased.coverage[0].errors.join(" ")).toContain("invalid point 2");
  });

  it("does not emit a best-effort action when a search or orbit bound is hit", () => {
    const searchCapped = composePermutationModules(
      [FIRST_FACTOR, SECOND_FACTOR],
      COMMUTING_PAIR_WITNESSES,
      { maxCandidateSets: 1 },
    );
    const orbitCapped = composePermutationModules(
      [FIRST_FACTOR, SECOND_FACTOR],
      COMMUTING_PAIR_WITNESSES,
      { maxOrbitSize: 3 },
    );

    expect(searchCapped.status).toBe("incomplete");
    expect(searchCapped.candidate).toBeUndefined();
    expect(searchCapped.diagnostics.searchComplete).toBe(false);
    expect(orbitCapped.status).toBe("incomplete");
    expect(orbitCapped.candidate).toBeUndefined();
    expect(orbitCapped.diagnostics).toMatchObject({
      searchComplete: true,
      minimumProved: true,
      orbitBuildsCapped: 1,
    });
  });
});
