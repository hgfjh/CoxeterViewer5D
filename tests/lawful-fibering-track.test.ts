import { describe, expect, it } from "vitest";

import { buildCoverCompression } from "../src/compression";
import A3 from "../src/examples/A3.json";
import I2_5_IDENTITY_QUOTIENT from "../src/examples/I2_5_identity_quotient.json";
import { buildFullDavisQuotientCellPoset } from "../src/davis/fullQuotient";
import {
  buildFullDavisLawfulClosure,
  buildLawfulSubcomplexFiberingCertificate,
  type LawfulSubcomplexFiberingCertificate,
  type LawfulTrackApplicabilityEvidence,
} from "../src/fibering/lawfulTrack";
import {
  searchLawfulSubcomplexCoorientations,
  verifyLawfulSubcomplexActionCertificate,
} from "../src/fibering/lawfulSearch";
import type { QuotientComplex } from "../src/quotient";
import {
  acceptedActionToQuotientComplex,
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import {
  createWallCoorientation,
  evaluateLawfulSubcomplex,
  findWallSystem,
  type WallCoorientation,
  type WallSystem,
} from "../src/walls";

const A3_SYSTEM = A3 as CoxeterSystemInput;
const I2_QUOTIENT = I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex;

describe("lawful-subcomplex-first fibering certificate", () => {
  it("searches for a fibering witness and replays it from the finite action", () => {
    const search = searchLawfulSubcomplexCoorientations({
      quotient: infiniteDihedralIndexTwoCover(),
      options: {
        exactWallLimit: 8,
        maxCandidates: 16,
        deterministicCandidateBudgetOnly: true,
      },
    });

    expect(search.status, search.errors.join("\n")).toBe("found");
    expect(search.bestScore).toMatchObject({
      passed: true,
      primitiveEpimorphism: true,
      npcAsphericity: true,
      morseDataPassed: true,
    });
    expect(search.certificate?.status).toBe("passed");
    expect(search.certificateReplay).toMatchObject({
      valid: true,
      mandatoryChecksPassed: true,
    });
    expect(
      verifyLawfulSubcomplexActionCertificate(search.certificate!),
    ).toMatchObject({ valid: true, mandatoryChecksPassed: true });
  });

  it("rejects a lawful artifact whose stored incidence was altered", () => {
    const search = searchLawfulSubcomplexCoorientations({
      quotient: infiniteDihedralIndexTwoCover(),
      options: { exactWallLimit: 8, maxCandidates: 16 },
    });
    const altered = structuredClone(search.certificate!);
    altered.lawful.morse.checks.everyAscendingLinkNonemptyAndConnected = false;

    const replay = verifyLawfulSubcomplexActionCertificate(altered);
    expect(replay.valid).toBe(false);
    expect(replay.errors.join(" ")).toContain("action-rooted reconstruction");
  });

  it("certifies finite-generation transfer only after every explicit gate passes", () => {
    const quotient = infiniteDihedralIndexTwoCover();
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const generatorOneEdge = cover.barX.geometricEdges.find(
      (edge) => edge.generator === 1,
    );
    expect(generatorOneEdge).toBeDefined();
    const coorientation = createWallCoorientation(wallSystem, {
      [wallSystem.edgeToWallId[generatorOneEdge!.id]]: -1,
    });
    const preliminary = buildLawfulSubcomplexFiberingCertificate({
      quotient,
      cover,
      wallSystem,
      coorientation,
    });
    const certificate = buildLawfulSubcomplexFiberingCertificate({
      quotient,
      cover,
      wallSystem,
      coorientation,
      applicability: applicabilityFor(preliminary),
    });

    expect(certificate.status).toBe("passed");
    expect(certificate.cells).toEqual([]);
    expect(certificate.presentationSurjection).toMatchObject({
      status: "passed",
      checks: {
        fullOneSkeletonRetained: true,
        identityOnPresentationGenerators: true,
        retainedRelatorsAreTargetRelators: true,
        targetRelatorsMatchSchreierPresentation: true,
        inclusionInducesSurjectionToH: true,
      },
    });
    expect(certificate.presentationSurjection.generatorMap).toEqual([
      { domainGeneratorId: "h0", targetGeneratorId: "h0" },
    ]);
    expect(certificate.morse.status).toBe("passed");
    expect(certificate.applicability.status).toBe("passed");
    expect(certificate.kernelTransfer).toMatchObject({
      status: "passed",
      checks: {
        primitiveEpimorphismHToZ: true,
        lawfulMorseKernelFinitelyGenerated: true,
        presentationSurjectionPi1YToH: true,
        charactersCommuteOnPresentationGenerators: true,
        restrictedKernelMapSurjective: true,
        finiteGenerationPassesToTargetKernel: true,
      },
    });
    expect(certificate.conclusion).toMatchObject({
      explicitEpimorphismToZ: true,
      lawfulKernelFinitelyGenerated: true,
      targetKernelFinitelyGenerated: true,
      virtualAlgebraicFibrationCertified: true,
    });
  });

  it("uses an exact metric-link check rather than ambient Davis asphericity", () => {
    const quotient = infiniteDihedralIndexTwoCover();
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const generatorOneEdge = cover.barX.geometricEdges.find(
      (edge) => edge.generator === 1,
    )!;
    const certificate = buildLawfulSubcomplexFiberingCertificate({
      quotient,
      cover,
      wallSystem,
      coorientation: createWallCoorientation(wallSystem, {
        [wallSystem.edgeToWallId[generatorOneEdge.id]]: -1,
      }),
    });

    expect(certificate.status).toBe("passed");
    expect(certificate.applicability).toMatchObject({
      status: "passed",
      basis: "exact-metric-link-certificate",
      asphericityEstablished: true,
      morseTheoremApplicabilityEstablished: true,
    });
    expect(certificate.npcAsphericity.status).toBe("passed");
    expect(certificate.kernelTransfer.status).toBe("passed");
    expect(certificate.conclusion.lawfulKernelFinitelyGenerated).toBe(true);
    expect(certificate.conclusion.targetKernelFinitelyGenerated).toBe(true);
    expect(certificate.nonClaims).toContain(
      "The ambient Davis complex does not by itself establish that the retained lawful subcomplex Y is aspherical.",
    );
  });

  it("rejects applicability evidence scoped to another retained-cell set", () => {
    const quotient = infiniteDihedralIndexTwoCover();
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const generatorOneEdge = cover.barX.geometricEdges.find(
      (edge) => edge.generator === 1,
    )!;
    const input = {
      quotient,
      cover,
      wallSystem,
      coorientation: createWallCoorientation(wallSystem, {
        [wallSystem.edgeToWallId[generatorOneEdge.id]]: -1 as const,
      }),
    };
    const preliminary = buildLawfulSubcomplexFiberingCertificate(input);
    const stale = applicabilityFor(preliminary);
    stale.scope.retainedCellIds = ["cell-from-another-run"];
    const certificate = buildLawfulSubcomplexFiberingCertificate({
      ...input,
      applicability: stale,
    });

    expect(certificate.status).toBe("failed");
    expect(certificate.applicability.scopeMatches).toBe(false);
    expect(
      certificate.kernelTransfer.checks.finiteGenerationPassesToTargetKernel,
    ).toBe(false);
    expect(certificate.applicability.errors.join(" ")).toContain(
      "different complex or retained-cell set",
    );
  });

  it("partitions every existing I2(5) relation cell and records the presentation quotient", () => {
    const cover = buildCoverCompression(I2_QUOTIENT);
    const wallSystem = findWallSystem(cover.barX);
    const coorientation = findCoorientation(
      wallSystem,
      (candidate) =>
        evaluateLawfulSubcomplex(cover.barX, candidate).discardedCellIds
          .length > 0,
    );
    const certificate = buildLawfulSubcomplexFiberingCertificate({
      quotient: I2_QUOTIENT,
      cover,
      wallSystem,
      coorientation,
    });

    expect(certificate.cells).toHaveLength(cover.barX.relationCells.length);
    expect(
      [...certificate.retainedCellIds, ...certificate.discardedCellIds].sort(),
    ).toEqual(cover.barX.relationCells.map((cell) => cell.id).sort());
    expect(certificate.discardedCellIds).toHaveLength(1);
    expect(certificate.cells[0]).toMatchObject({
      disposition: "discarded-unlawful",
      reason: "boundary-sign-word-does-not-have-two-transitions",
    });
    expect(certificate.presentationSurjection.status).toBe("passed");
    expect(
      certificate.presentationSurjection.discardedTargetRelatorIds,
    ).toEqual(certificate.discardedCellIds);
    expect(certificate.conclusion.virtualAlgebraicFibrationCertified).toBe(
      false,
    );
  });
});

describe("lawful closure in the full Davis cell poset", () => {
  it("removes each unlawful 2-cell and every higher coface while retaining K^1", () => {
    const accepted = certifyA3RegularAction();
    const quotient = acceptedActionToQuotientComplex(A3_SYSTEM, accepted);
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const coorientation = findCoorientation(wallSystem, (candidate) => {
      const lawful = evaluateLawfulSubcomplex(cover.barX, candidate);
      return (
        lawful.retainedCellIds.length > 0 && lawful.discardedCellIds.length > 0
      );
    });
    const lawful = evaluateLawfulSubcomplex(cover.barX, coorientation);
    const poset = buildFullDavisQuotientCellPoset(A3_SYSTEM, accepted, {
      sourceQuotientVertexIds: quotient.vertices.map((vertex) => vertex.id),
    });
    const closure = buildFullDavisLawfulClosure(poset, cover, lawful);

    expect(closure.status).toBe("passed");
    expect(closure.sourceDimension).toBe(3);
    expect(closure.higherCellMorseStatus).toBe("not-established");
    expect(
      closure.cells
        .filter((cell) => cell.dimension <= 1)
        .every((cell) => cell.disposition === "retained"),
    ).toBe(true);
    expect(closure.checks).toEqual({
      sourcePosetCertified: true,
      rankZeroAndOneCellsRetained: true,
      rankTwoCorrespondenceComplete: true,
      rankTwoRetentionMatchesLawfulness: true,
      higherCellsFollowTwoFaceRule: true,
      retainedCellsAreDownwardClosed: true,
    });
    const topCell = closure.cells.find((cell) => cell.dimension === 3);
    expect(topCell).toBeDefined();
    expect(topCell?.disposition).toBe("discarded");
    expect(topCell?.unlawfulRankTwoFaceCellIds.length).toBeGreaterThan(0);
    for (const unlawfulTwoCellId of closure.discardedCellIdsByDimension["2"]) {
      const sourceCell = poset.cells.find(
        (cell) => cell.id === unlawfulTwoCellId,
      )!;
      for (const cofaceId of sourceCell.properCofaceCellIds) {
        expect(closure.discardedCellIds).toContain(cofaceId);
      }
    }
    expect(closure.nonClaims.join(" ")).toContain(
      "do not establish asphericity",
    );
    expect(closure.nonClaims.join(" ")).toContain(
      "compatible affine Morse extension",
    );
  });

  it("requires separate higher-cell Morse and full-link evidence", () => {
    const accepted = certifyA3RegularAction();
    const quotient = acceptedActionToQuotientComplex(A3_SYSTEM, accepted);
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const poset = buildFullDavisQuotientCellPoset(A3_SYSTEM, accepted, {
      sourceQuotientVertexIds: quotient.vertices.map((vertex) => vertex.id),
    });
    const coorientation = findCoorientation(wallSystem, (candidate) => {
      const lawful = evaluateLawfulSubcomplex(cover.barX, candidate);
      const closure = buildFullDavisLawfulClosure(poset, cover, lawful);
      return (closure.retainedCellIdsByDimension["3"]?.length ?? 0) > 0;
    });
    const preliminary = buildLawfulSubcomplexFiberingCertificate({
      quotient,
      cover,
      wallSystem,
      coorientation,
      fullCellPoset: poset,
      certificationComplex: "coface-closed-full",
    });
    const evidence = applicabilityFor(preliminary, true);
    delete evidence.higherCellMorseExtension;
    delete evidence.fullDirectedLinks;
    const certificate = buildLawfulSubcomplexFiberingCertificate({
      quotient,
      cover,
      wallSystem,
      coorientation,
      fullCellPoset: poset,
      certificationComplex: "coface-closed-full",
      applicability: evidence,
    });

    expect(certificate.fullDavisClosure.status).toBe("passed");
    expect(certificate.applicability.higherCellMorseExtensionEstablished).toBe(
      false,
    );
    expect(certificate.applicability.fullDirectedLinksEstablished).toBe(false);
    expect(certificate.applicability.errors.join(" ")).toContain(
      "higher-cell affine Morse-extension evidence",
    );
    expect(certificate.applicability.errors.join(" ")).toContain(
      "full-dimensional ascending/descending-link evidence",
    );
    expect(certificate.conclusion.virtualAlgebraicFibrationCertified).toBe(
      false,
    );
  });
});

function applicabilityFor(
  certificate: LawfulSubcomplexFiberingCertificate,
  includeFullDavisEvidence = false,
): LawfulTrackApplicabilityEvidence {
  const claim = (statement: string) => ({
    status: "passed" as const,
    statement,
    source: "Exact test theorem/certificate fixture",
    evidence: ["scope-bound test witness"],
  });
  return {
    schemaVersion: 1,
    kind: "lawful-subcomplex-applicability-evidence",
    scope: {
      sourceComplexName: certificate.source.compressedComplexName,
      retainedCellIds: [...certificate.retainedCellIds],
      ...(includeFullDavisEvidence
        ? {
            fullCellPosetArchiveHash:
              certificate.fullDavisClosure.sourcePosetArchiveHash,
            retainedFullCellIds: [
              ...certificate.fullDavisClosure.retainedCellIds,
            ],
          }
        : {}),
    },
    method: "external-proof-artifact",
    asphericity: claim("The scoped lawful complex is aspherical."),
    morseTheoremApplicability: claim(
      "The cited PL Morse finite-generation theorem applies to this scoped complex.",
    ),
    ...(includeFullDavisEvidence
      ? {
          higherCellMorseExtension: claim(
            "The height extends affinely and nonconstantly over every retained higher cell.",
          ),
          fullDirectedLinks: claim(
            "Full ascending and descending links are nonempty and connected.",
          ),
        }
      : {}),
    limitations: ["Test-only applicability witness."],
  };
}

function findCoorientation(
  wallSystem: WallSystem,
  predicate: (candidate: WallCoorientation) => boolean,
): WallCoorientation {
  const wallIds = wallSystem.walls.map((wall) => wall.id).sort();
  const candidates: Array<Record<string, 1 | -1>> = [{}];
  for (const wallId of wallIds) candidates.push({ [wallId]: -1 });
  for (let left = 0; left < wallIds.length; left += 1) {
    for (let right = left + 1; right < wallIds.length; right += 1) {
      candidates.push({ [wallIds[left]]: -1, [wallIds[right]]: -1 });
    }
  }
  if (wallIds.length <= 20) {
    for (let mask = 0; mask < 2 ** wallIds.length; mask += 1) {
      candidates.push(
        Object.fromEntries(
          wallIds.map((wallId, index) => [
            wallId,
            (mask & (2 ** index)) === 0 ? 1 : -1,
          ]),
        ) as Record<string, 1 | -1>,
      );
    }
  }
  for (const signs of candidates) {
    const candidate = createWallCoorientation(wallSystem, signs);
    if (predicate(candidate)) return candidate;
  }
  throw new Error("The bounded test coorientation portfolio found no match.");
}

function certifyA3RegularAction(): TorsionFreeCandidateResult {
  const candidate = a3RegularAction();
  const certificate = certifyTorsionFreeAction(
    A3_SYSTEM,
    candidate,
    planSphericalSpecialSubgroups(A3_SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
}

function a3RegularAction(): TorsionFreeActionCandidate {
  const elements = permutations([0, 1, 2, 3]);
  const indexByKey = new Map(
    elements.map((element, index) => [element.join(","), index]),
  );
  const generators = [
    [1, 0, 2, 3],
    [0, 2, 1, 3],
    [0, 1, 3, 2],
  ];
  return {
    id: "a3-regular-lawful-track-test",
    index: elements.length,
    generatorImages: generators.map((generator) =>
      elements.map((element) => {
        const image = indexByKey.get(
          generator.map((point) => element[point]).join(","),
        );
        if (image === undefined) throw new Error("Incomplete A3 fixture.");
        return image;
      }),
    ),
    backend: "test-exact",
  };
}

function permutations(values: number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_entry, entryIndex) => entryIndex !== index),
    ).map((tail) => [value, ...tail]),
  );
}

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
