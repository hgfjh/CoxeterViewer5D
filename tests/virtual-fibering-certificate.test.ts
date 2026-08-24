import { describe, expect, it } from "vitest";
import { buildCoverCompression } from "../src/compression";
import I2_5_IDENTITY_QUOTIENT from "../src/examples/I2_5_identity_quotient.json";
import {
  buildVirtualAlgebraicFiberingCertificate,
  checkDimensionAtMostTwo,
  validateVirtualAlgebraicFiberingCertificate,
} from "../src/fibering";
import type { QuotientComplex } from "../src/quotient";
import {
  createWallCoorientation,
  deriveMorseLinks,
  evaluateLawfulSubcomplex,
  findWallSystem,
} from "../src/walls";

describe("virtual algebraic fibering certificate", () => {
  it("certifies the index-two cyclic subgroup of the infinite dihedral group", () => {
    const quotient = infiniteDihedralIndexTwoCover();
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const secondWallId =
      wallSystem.edgeToWallId[
        cover.barX.geometricEdges.find((edge) => edge.generator === 1)!.id
      ];
    const coorientation = createWallCoorientation(wallSystem, {
      [secondWallId]: -1,
    });
    const lawfulSubcomplex = evaluateLawfulSubcomplex(
      cover.barX,
      coorientation,
    );
    const morseLinks = deriveMorseLinks(
      cover.barX,
      coorientation,
      lawfulSubcomplex,
    );
    const certificate = buildVirtualAlgebraicFiberingCertificate({
      quotient,
      cover,
      wallSystem,
      coorientation,
      lawfulSubcomplex,
      morseLinks,
    });

    expect(certificate.status).toBe("passed");
    expect(certificate.result).toEqual({
      explicitEpimorphismToZ: true,
      finitelyGeneratedKernel: true,
      virtualAlgebraicFibration: true,
      statement: expect.stringContaining("finitely generated kernel"),
    });
    expect(certificate.wallHomomorphism.cocycle.relationChecks).toEqual([]);
    expect(certificate.primitiveHomomorphism.rawImage).toBe("2Z");
    expect(certificate.primitiveHomomorphism.normalizationDivisor).toBe(2);
    expect(certificate.primitiveHomomorphism.generatorValues).toHaveLength(1);
    expect(
      Math.abs(
        certificate.primitiveHomomorphism.generatorValues[0].primitiveValue,
      ),
    ).toBe(1);
    expect(
      certificate.primitiveHomomorphism.normalizedBezoutIdentity,
    ).toMatchObject({ gcd: 1, evaluatedSum: 1, verified: true });
    expect(
      certificate.primitiveHomomorphism.relatorChecks.every(
        (check) => check.passed,
      ),
    ).toBe(true);
    expect(certificate.plMorse.failedCheckIds).toEqual([]);
    expect(certificate.plMorse.missingEvidenceCheckIds).toEqual([]);
    expect(certificate.plMorse.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        "aspherical-npc-setting",
        "circle-valued-map",
        "affine-morse-cells",
        "discrete-lifted-heights",
        "lawful-to-subgroup-surjection",
      ]),
    );
    expect(
      certificate.plMorse.linkCertificates.every(
        (entry) =>
          entry.ascending.spanningTreeVerified &&
          entry.descending.spanningTreeVerified,
      ),
    ).toBe(true);
    expect(validateVirtualAlgebraicFiberingCertificate(certificate)).toEqual({
      valid: true,
      checks: {
        structure: true,
        cellularBoundarySums: true,
        schreierRelators: true,
        primitiveImage: true,
        linkConnectivityWitnesses: true,
        conclusionConsistency: true,
      },
      errors: [],
    });

    const altered = structuredClone(certificate);
    altered.primitiveHomomorphism.generatorValues[0].primitiveValue *= 2;
    const alteredValidation =
      validateVirtualAlgebraicFiberingCertificate(altered);
    expect(alteredValidation.valid).toBe(false);
    expect(alteredValidation.checks.primitiveImage).toBe(false);
    expect(alteredValidation.errors).toContain(
      "Generator values do not certify the recorded primitive normalization.",
    );
  });

  it("reports the rank-three obstruction in the two-dimensional hypothesis", () => {
    const check = checkDimensionAtMostTwo({
      schemaVersion: 1,
      name: "A3",
      rank: 3,
      generators: [0, 1, 2].map((generator) => ({
        id: `s${generator}`,
        label: `s${generator}`,
      })),
      coxeterMatrix: [
        [1, 3, 2],
        [3, 1, 3],
        [2, 3, 1],
      ],
    });

    expect(check.passed).toBe(false);
    expect(check.failedTriples).toEqual([
      expect.objectContaining({ generators: [0, 1, 2], passed: false }),
    ]);
    expect(check.failedTriples[0].reciprocalSum).toBeCloseTo(7 / 6, 12);
  });

  it("does not use embeddedness or self-osculation as deterministic Morse gates", () => {
    const quotient = infiniteDihedralIndexTwoCover();
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const diagnosticWallSystem = {
      ...wallSystem,
      diagnostics: {
        ...wallSystem.diagnostics,
        embedded: false,
        selfOsculationFree: false,
      },
    };
    const secondWallId =
      wallSystem.edgeToWallId[
        cover.barX.geometricEdges.find((edge) => edge.generator === 1)!.id
      ];
    const coorientation = createWallCoorientation(diagnosticWallSystem, {
      [secondWallId]: -1,
    });
    const lawfulSubcomplex = evaluateLawfulSubcomplex(
      cover.barX,
      coorientation,
    );
    const morseLinks = deriveMorseLinks(
      cover.barX,
      coorientation,
      lawfulSubcomplex,
    );
    const certificate = buildVirtualAlgebraicFiberingCertificate({
      quotient,
      cover,
      wallSystem: diagnosticWallSystem,
      coorientation,
      lawfulSubcomplex,
      morseLinks,
    });

    expect(certificate.status).toBe("passed");
    expect(certificate.plMorse.failedCheckIds).toEqual([]);
    expect(certificate.plMorse.checks.map((check) => check.id)).toContain(
      "two-sided-walls",
    );
    expect(certificate.plMorse.auxiliaryDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "embedded-walls", passed: false }),
        expect.objectContaining({
          id: "self-osculation-free",
          passed: false,
        }),
      ]),
    );
  });

  it("validates a well-formed failed artifact without promoting its zero map", () => {
    const quotient = I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex;
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const coorientation = createWallCoorientation(wallSystem);
    const lawfulSubcomplex = evaluateLawfulSubcomplex(
      cover.barX,
      coorientation,
    );
    const morseLinks = deriveMorseLinks(
      cover.barX,
      coorientation,
      lawfulSubcomplex,
    );
    const certificate = buildVirtualAlgebraicFiberingCertificate({
      quotient,
      cover,
      wallSystem,
      coorientation,
      lawfulSubcomplex,
      morseLinks,
    });

    expect(certificate.result.virtualAlgebraicFibration).toBe(false);
    expect(certificate.primitiveHomomorphism.rawImage).toBe("0");
    expect(validateVirtualAlgebraicFiberingCertificate(certificate).valid).toBe(
      true,
    );
  });
});

function infiniteDihedralIndexTwoCover(): QuotientComplex {
  const sourceSystem = {
    schemaVersion: 1 as const,
    name: "Infinite dihedral group",
    rank: 2,
    generators: [
      { id: "s0", label: "s0" },
      { id: "s1", label: "s1" },
    ],
    coxeterMatrix: [
      [1, "inf"],
      ["inf", 1],
    ] as Array<Array<number | "inf">>,
  };
  return {
    schemaVersion: 1,
    name: "Index-two action of infinite dihedral group",
    sourceSystem,
    generatorRank: 2,
    vertices: [
      { id: "q0", representativeWord: [] },
      { id: "q1", representativeWord: [0] },
    ],
    permutationAction: [0, 1].map((generator) => ({
      generator,
      images: { q0: "q1", q1: "q0" },
    })),
    edges: [0, 1].flatMap((generator) => [
      {
        id: `e:q0:g${generator}`,
        source: "q0",
        target: "q1",
        generator,
        inverseEdgeId: `e:q1:g${generator}`,
      },
      {
        id: `e:q1:g${generator}`,
        source: "q1",
        target: "q0",
        generator,
        inverseEdgeId: `e:q0:g${generator}`,
      },
    ]),
    twoCells: [],
    subgroup: {
      name: "H = <s0 s1>",
      index: 2,
      torsionFreeVerification: {
        verified: true,
        method: "published-reference",
        source: "Normal-form computation for C2 * C2",
      },
    },
    torsionFreeCertificate: {
      status: "passed",
      method: "visible-spherical-stabilizer",
      checkedSphericalSubsets: [
        { id: "spherical:0", generators: [0], enumeratedElements: 2 },
        { id: "spherical:1", generators: [1], enumeratedElements: 2 },
      ],
      witnesses: [],
      limitations: [],
      errors: [],
      warnings: [],
    },
  };
}
