import { describe, expect, it } from "vitest";

import {
  defaultSuperincreasingOrbifoldBarycentricPotentials,
  extractShortPrimitiveOrbifoldCharacters,
  screenOrbifoldBarycentricChamberLinks,
} from "../src/fibering/orbifoldBarycentricLinkScreen";
import {
  buildOrbifoldSchreierCocycleFamily,
  prepareOrbifoldSchreierH1,
  type OrbifoldSchreierIntegralKernelVector,
} from "../src/fibering/orbifoldSchreierH1";
import type { TorsionFreeActionCandidate } from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const system: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "Universal rank-three orbifold screen fixture",
  rank: 3,
  generators: [0, 1, 2].map((generator) => ({
    id: `s${generator}`,
    label: `s${generator}`,
  })),
  coxeterMatrix: [
    [1, "inf", "inf"],
    ["inf", 1, "inf"],
    ["inf", "inf", 1],
  ],
};

// s0 fixes both points, while s1 and s2 are the same transposition. The point
// stabilizer has torsion, and the difference between the s1 and s2 edges gives
// one primitive integral character.
const action: TorsionFreeActionCandidate = {
  id: "universal-rank3-degree2-orbifold",
  index: 2,
  generatorImages: [
    [0, 1],
    [1, 0],
    [1, 0],
  ],
};

describe("orbifold barycentric chamber-link screen", () => {
  it("extracts a replayed primitive character in a bounded raw basis", () => {
    const preparation = prepareOrbifoldSchreierH1(system, action);
    const extraction = extractShortPrimitiveOrbifoldCharacters({
      system,
      preparation,
      saturatedKernelBasisDigest: "a".repeat(64),
      basisVectors: [{ id: "free-edge", entries: [[1, "1"]] }],
      coefficientBound: 3,
      retainCount: 1,
    });

    expect(extraction.certificate.enumeration).toMatchObject({
      primitiveVectorCountBeforeSignQuotient: 2,
      globalSignOrbitCount: 1,
      retainedCharacterCount: 1,
    });
    expect(extraction.certificate.symmetry).toMatchObject({
      coxeterDiagramAutomorphismCount: 6,
      diagramAutomorphismReductionApplied: false,
      finiteActionNormalizerNotComputed: true,
    });
    expect(extraction.characters[0]).toMatchObject({
      basisCoordinates: ["1"],
      supportSize: 1,
      squaredL2Norm: "1",
      ambientCoordinateGcd: "1",
      primitive: true,
      kernelVector: { entries: [[1, "1"]] },
    });
  });

  it("keeps abstract source germs separate from coincident action endpoints", () => {
    const preparation = prepareOrbifoldSchreierH1(system, action);
    const basisVectors: OrbifoldSchreierIntegralKernelVector[] = [
      { id: "free-edge", entries: [[1, "1"]] },
    ];
    const basisCocycleFamily = buildOrbifoldSchreierCocycleFamily(
      preparation,
      basisVectors,
    );
    const extraction = extractShortPrimitiveOrbifoldCharacters({
      system,
      preparation,
      saturatedKernelBasisDigest: "b".repeat(64),
      basisVectors,
      coefficientBound: 1,
      retainCount: 1,
    });
    const screen = screenOrbifoldBarycentricChamberLinks({
      system,
      action,
      preparation,
      basisCocycleFamily,
      shortCharacters: extraction.characters,
      shortCharacterCertificate: extraction.certificate,
      potentialRules: defaultSuperincreasingOrbifoldBarycentricPotentials(3),
    });

    expect(screen.cellulation).toMatchObject({
      sphericalTypeCount: 3,
      rootedGermsAreStabilizerResolved: true,
      quotientFoldingUsed: false,
      sourceCellMeanCompression:
        "uniform-W_T-to-action-orbit-fibers-with-zero-stabilizer-period",
    });
    const fixedType = screen.cellulation.sphericalTypes.find(
      (type) => type.generators.join(",") === "0",
    );
    expect(fixedType).toMatchObject({
      expectedSourceVertexCount: "2",
      actionOrbitCount: 2,
      orbitSizeCensus: [
        { actionOrbitSize: 1, orbitCount: 2, stabilizerMultiplicity: "2" },
      ],
      sourceMeanEqualsActionOrbitMean: true,
    });
    const movingTypes = screen.cellulation.sphericalTypes.filter(
      (type) => type.generators[0] === 1 || type.generators[0] === 2,
    );
    expect(movingTypes).toHaveLength(2);
    expect(movingTypes.every((type) => type.actionOrbitCount === 1)).toBe(true);

    const positive = screen.results.find(
      (result) => result.potentialId === "dimension-positive",
    );
    expect(positive?.firstFailure).toMatchObject({
      point: 0,
      direction: "ascending",
      componentCount: 3,
      componentSizes: [1, 1, 1],
    });
    expect(positive?.firstFailure?.sampledComponentTypeIds).toHaveLength(3);
    expect(screen.survivorCharacterIds).toEqual([]);
  });

  it("rejects a potential that ties nested spherical types", () => {
    const finitePair: CoxeterSystemInput = {
      schemaVersion: 1,
      name: "A2 plus one unrestricted generator",
      rank: 3,
      generators: [0, 1, 2].map((generator) => ({
        id: `s${generator}`,
        label: `s${generator}`,
      })),
      coxeterMatrix: [
        [1, 3, "inf"],
        [3, 1, "inf"],
        ["inf", "inf", 1],
      ],
    };
    const regular: TorsionFreeActionCandidate = {
      id: "a2-regular-with-duplicate-unrestricted-generator",
      index: 6,
      generatorImages: [
        [1, 0, 3, 2, 5, 4],
        [5, 2, 1, 4, 3, 0],
        [1, 0, 3, 2, 5, 4],
      ],
    };
    const preparation = prepareOrbifoldSchreierH1(finitePair, regular);
    const basisVectors: OrbifoldSchreierIntegralKernelVector[] = [
      { id: "duplicate-generator-cycle", entries: [[0, "1"]] },
    ];
    const basis = buildOrbifoldSchreierCocycleFamily(preparation, basisVectors);
    const extraction = extractShortPrimitiveOrbifoldCharacters({
      system: finitePair,
      preparation,
      saturatedKernelBasisDigest: "d".repeat(64),
      basisVectors,
      coefficientBound: 1,
      retainCount: 1,
    });
    expect(() =>
      screenOrbifoldBarycentricChamberLinks({
        system: finitePair,
        action: regular,
        preparation,
        basisCocycleFamily: basis,
        shortCharacters: extraction.characters,
        shortCharacterCertificate: extraction.certificate,
        potentialRules: [{ id: "tied", generatorWeights: ["1", "-1", "2"] }],
      }),
    ).toThrow("ties");
  });

  it("rejects mutated characters under a stale portfolio certificate", () => {
    const preparation = prepareOrbifoldSchreierH1(system, action);
    const basisVectors: OrbifoldSchreierIntegralKernelVector[] = [
      { id: "free-edge", entries: [[1, "1"]] },
    ];
    const basis = buildOrbifoldSchreierCocycleFamily(preparation, basisVectors);
    const extraction = extractShortPrimitiveOrbifoldCharacters({
      system,
      preparation,
      saturatedKernelBasisDigest: "f".repeat(64),
      basisVectors,
      coefficientBound: 1,
      retainCount: 1,
    });
    const mutated = structuredClone(extraction.characters);
    mutated[0].basisCoordinates = ["-1"];
    expect(() =>
      screenOrbifoldBarycentricChamberLinks({
        system,
        action,
        preparation,
        basisCocycleFamily: basis,
        shortCharacters: mutated,
        shortCharacterCertificate: extraction.certificate,
        potentialRules: defaultSuperincreasingOrbifoldBarycentricPotentials(3),
      }),
    ).toThrow("does not replay");
  });
});
