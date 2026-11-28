import { describe, expect, it } from "vitest";

import { buildCoverCompression } from "../src/compression";
import {
  buildGeneralizedLawfulCertificateFromStreamed,
  type GeneralizedLawfulCertificate,
} from "../src/fibering/generalizedLawfulCertificate";
import { buildLawfulSubcomplexFiberingCertificate } from "../src/fibering/lawfulTrack";
import {
  certifyLawfulSubcomplexVirtualAlgebraicFibration,
  lawfulCoorientationSignKey,
  searchLawfulSubcomplexCoorientations,
  verifyLawfulSubcomplexActionCertificate,
} from "../src/fibering/lawfulSearch";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  acceptedActionToQuotientComplex,
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";
import { createWallCoorientation, findWallSystem } from "../src/walls";

const PRODUCT_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "C2 cubed times infinite dihedral",
  rank: 5,
  generators: Array.from({ length: 5 }, (_, generator) => ({
    id: `s${generator}`,
    label: `s${generator}`,
  })),
  coxeterMatrix: Array.from({ length: 5 }, (_, left) =>
    Array.from({ length: 5 }, (_, right) => {
      if (left === right) return 1;
      return (left === 3 && right === 4) || (left === 4 && right === 3)
        ? "inf"
        : 2;
    }),
  ),
};

const A3_DINFINITY_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "A3 times infinite dihedral",
  rank: 5,
  generators: Array.from({ length: 5 }, (_, generator) => ({
    id: `s${generator}`,
    label: `s${generator}`,
  })),
  coxeterMatrix: Array.from({ length: 5 }, (_, left) =>
    Array.from({ length: 5 }, (_, right) => {
      if (left === right) return 1;
      if ((left === 3 && right === 4) || (left === 4 && right === 3)) {
        return "inf";
      }
      if (left <= 2 && right <= 2 && Math.abs(left - right) === 1) return 3;
      return 2;
    }),
  ),
};

const UNIVERSAL_RANK_THREE_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "Universal rank-three Coxeter group",
  rank: 3,
  generators: Array.from({ length: 3 }, (_, generator) => ({
    id: `s${generator}`,
    label: `s${generator}`,
  })),
  coxeterMatrix: [
    [1, "inf", "inf"],
    ["inf", 1, "inf"],
    ["inf", "inf", 1],
  ],
};

function productAction(): TorsionFreeActionCandidate {
  const index = 16;
  return {
    id: "c2-cubed-times-dinf-regular-image",
    name: "Regular C2^4 image",
    index,
    generatorImages: [0, 1, 2, 3, 3].map((bit) =>
      Array.from({ length: index }, (_, point) => point ^ (1 << bit)),
    ),
    backend: "exact-test-action",
  };
}

function a3DinfinityAction(): TorsionFreeActionCandidate {
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
    id: "a3-times-dinfinity-regular-image",
    name: "Regular S4 times C2 image",
    index: 48,
    generatorImages: Array.from({ length: 5 }, (_, generator) =>
      Array.from({ length: 48 }, (_, point) => {
        const permutation = Math.floor(point / 2);
        const bit = point % 2;
        if (generator >= 3) return permutation * 2 + (bit ^ 1);
        const image = indexByKey.get(
          generators[generator]
            .map((entry) => elements[permutation][entry])
            .join(","),
        );
        if (image === undefined) throw new Error("Incomplete S4 fixture.");
        return image * 2 + bit;
      }),
    ),
    backend: "exact-test-action",
  };
}

function universalRankThreeParityAction(): TorsionFreeActionCandidate {
  return {
    id: "universal-rank-three-parity-action",
    name: "Index-two parity kernel",
    index: 2,
    generatorImages: Array.from({ length: 3 }, () => [1, 0]),
    backend: "exact-test-action",
  };
}

function fixture(opposedDihedralWalls = true): {
  coreInput: Parameters<typeof buildLawfulSubcomplexFiberingCertificate>[0];
  generalized: GeneralizedLawfulCertificate;
} {
  return actionFixture(PRODUCT_SYSTEM, productAction(), opposedDihedralWalls);
}

function a3DinfinityFixture(): ReturnType<typeof fixture> {
  return actionFixture(A3_DINFINITY_SYSTEM, a3DinfinityAction(), true);
}

function actionFixture(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
  opposedDihedralWalls: boolean,
): {
  coreInput: Parameters<typeof buildLawfulSubcomplexFiberingCertificate>[0];
  generalized: GeneralizedLawfulCertificate;
} {
  const torsionFree = certifyTorsionFreeAction(
    system,
    candidate,
    planSphericalSpecialSubgroups(system),
  );
  expect(torsionFree.status, torsionFree.errors.join("\n")).toBe("passed");
  const quotient = acceptedActionToQuotientComplex(system, {
    candidate,
    certificate: torsionFree,
  });
  const cover = buildCoverCompression(quotient);
  const wallSystem = findWallSystem(cover.barX);
  const wallSigns = Object.fromEntries(
    wallSystem.walls.map((wall) => {
      const edge = cover.barX.geometricEdges.find(
        (candidateEdge) => candidateEdge.id === wall.canonicalEdgeId,
      );
      if (!edge)
        throw new Error(`Missing canonical edge ${wall.canonicalEdgeId}.`);
      return [
        wall.id,
        opposedDihedralWalls && edge.generator === 4 ? -1 : 1,
      ] as const;
    }),
  );
  const coorientation = createWallCoorientation(wallSystem, wallSigns);
  const oracle = buildStreamedLawfulDavisOracle({
    system,
    generatorImages: candidate.generatorImages,
  });
  const streamedWallSigns = Object.fromEntries(
    oracle.walls.walls.map((wall) => {
      const sign = coorientation.wallSigns[wall.id];
      if (sign !== 1 && sign !== -1) {
        throw new Error(`Legacy and streamed wall ids disagree at ${wall.id}.`);
      }
      return [wall.id, sign] as const;
    }),
  );
  const evaluation = oracle.bindCoorientations([
    {
      id: opposedDihedralWalls
        ? "opposed-dihedral-walls"
        : "parallel-dihedral-walls",
      wallSigns: streamedWallSigns,
    },
  ]);
  const generalized = buildGeneralizedLawfulCertificateFromStreamed({
    oracle,
    evaluation,
    candidateIndex: 0,
  });
  return {
    coreInput: {
      quotient,
      cover,
      wallSystem,
      coorientation,
      generalizedSourceOracle: oracle,
      certificationComplex: "coface-closed-full",
    },
    generalized,
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

function rehash(
  certificate: GeneralizedLawfulCertificate,
): GeneralizedLawfulCertificate {
  certificate.artifactHash = canonicalSha256({
    ...certificate,
    artifactHash: "",
  });
  return certificate;
}

describe("generalized lawful Track A integration", () => {
  it("uses the actual full-cell links instead of the rank-two NPC diagnostic", () => {
    const { coreInput, generalized } = fixture();
    expect(generalized.directedLinks.morseCondition).toBe("passed");
    expect(generalized.asphericity.status).toBe("passed");

    const certificate = buildLawfulSubcomplexFiberingCertificate({
      ...coreInput,
      generalizedCertificate: generalized,
    });

    // The polygonal 2-skeleton has unfilled triangular link cycles. The
    // retained higher cells fill those flags in the actual Davis subcomplex.
    expect(certificate.npcAsphericity.status).toBe("failed");
    expect(certificate.morse.status).toBe("passed");
    expect(certificate.generalized.status).toBe("passed");
    expect(certificate.generalized.scopeMatches).toBe(true);
    expect(
      certificate.generalized.checks.finiteHeightBandPi1SurjectionPassed,
    ).toBe(true);
    expect(certificate.finiteHeightBand.status).toBe("passed");
    expect(certificate.status).toBe("passed");
    expect(certificate.conclusion.virtualAlgebraicFibrationCertified).toBe(
      true,
    );
  });

  it("does not require rank-two NPC/asphericity when the finite height-band checks pass", () => {
    const { coreInput } = fixture();
    const certificate = buildLawfulSubcomplexFiberingCertificate({
      ...coreInput,
      certificationComplex: "rank-two-lawful",
    });

    expect(certificate.npcAsphericity.status).toBe("failed");
    expect(certificate.morse.status).toBe("passed");
    expect(certificate.applicability.status).toBe("not-established");
    expect(certificate.finiteHeightBand.status).toBe("passed");
    expect(certificate.kernelTransfer.status).toBe("passed");
    expect(certificate.status).toBe("passed");
  });

  it("promotes a replay-valid generalized height/link certificate when asphericity is not established", () => {
    const { coreInput, generalized } = a3DinfinityFixture();
    expect(generalized.directedLinks.morseCondition).toBe("passed");
    expect(generalized.asphericity.status).toBe("not-established");

    const certificate = buildLawfulSubcomplexFiberingCertificate({
      ...coreInput,
      generalizedCertificate: generalized,
    });

    expect(certificate.generalized.checks.actionRootedReplayPassed).toBe(true);
    expect(certificate.generalized.checks.asphericityPassed).toBe(false);
    expect(
      certificate.generalized.checks.finiteHeightBandPi1SurjectionPassed,
    ).toBe(true);
    expect(certificate.generalized.status).toBe("passed");
    expect(certificate.finiteHeightBand.status).toBe("passed");
    expect(certificate.kernelTransfer.status).toBe("passed");
    expect(certificate.status).toBe("passed");
  });

  it("embeds and scope-rechecks the generalized artifact during action replay", () => {
    const { coreInput, generalized } = fixture();
    const actionCertificate = certifyLawfulSubcomplexVirtualAlgebraicFibration({
      quotient: coreInput.quotient,
      requestedWallSigns: coreInput.coorientation.wallSigns,
      certificationComplex: "coface-closed-full",
      generalizedCertificate: generalized,
    });

    expect(actionCertificate.schemaVersion).toBe(2);
    expect(actionCertificate.status).toBe("passed");
    expect(actionCertificate.lawful.generalizedCertificate?.artifactHash).toBe(
      generalized.artifactHash,
    );
    expect(
      verifyLawfulSubcomplexActionCertificate(actionCertificate),
    ).toMatchObject({
      schemaVersion: 2,
      valid: true,
      mandatoryChecksPassed: true,
    });

    const legacyOuter = structuredClone(actionCertificate) as unknown as {
      schemaVersion: number;
    };
    legacyOuter.schemaVersion = 1;
    expect(
      verifyLawfulSubcomplexActionCertificate(
        legacyOuter as unknown as typeof actionCertificate,
      ).errors,
    ).toContain("The lawful action-certificate header is unsupported.");
  });

  it("keeps a full-cell sign search inconclusive when certificates are absent", () => {
    const { coreInput } = fixture();
    const result = searchLawfulSubcomplexCoorientations({
      quotient: coreInput.quotient,
      options: {
        certificationComplex: "coface-closed-full",
        exactWallLimit: 8,
        maxCandidates: 64,
        deterministicCandidateBudgetOnly: true,
      },
    });

    expect(result.status).toBe("incomplete");
    expect(result.optimalityProven).toBe(false);
    expect(result.terminationReason).toBe("missing-generalized-certificates");
    expect(result.bestScore).toBeUndefined();
  });

  it("does not let passing rank-two diagnostics replace failed generalized directed links", () => {
    const { coreInput, generalized } = fixture();
    const altered = structuredClone(generalized);
    altered.directedLinks.morseCondition = "not-established";
    altered.directedLinks.checks.everyAscendingLinkConnected = false;
    rehash(altered);

    const certificate = buildLawfulSubcomplexFiberingCertificate({
      ...coreInput,
      generalizedCertificate: altered,
    });

    expect(certificate.morse.status).toBe("passed");
    expect(certificate.generalized.scopeMatches).toBe(true);
    expect(certificate.generalized.checks.actionRootedReplayPassed).toBe(false);
    expect(certificate.generalized.status).toBe("failed");
    expect(certificate.kernelTransfer.status).toBe("failed");
    expect(certificate.conclusion.virtualAlgebraicFibrationCertified).toBe(
      false,
    );
  });

  it("rejects tampering with the optional asphericity diagnostic as an artifact-integrity failure", () => {
    const { coreInput, generalized } = fixture();
    const altered = structuredClone(generalized);
    altered.asphericity.status = "not-established";
    altered.asphericity.checks.everyMetricSphericalCliqueFilled = false;
    rehash(altered);

    const certificate = buildLawfulSubcomplexFiberingCertificate({
      ...coreInput,
      generalizedCertificate: altered,
    });

    expect(certificate.generalized.checks.actionRootedReplayPassed).toBe(false);
    expect(certificate.generalized.status).toBe("failed");
    expect(certificate.finiteHeightBand.status).toBe("failed");
  });

  it("rejects a rehashed attempt to turn a failing full link into a pass", () => {
    const { coreInput, generalized } = fixture(false);
    expect(generalized.directedLinks.morseCondition).toBe("not-established");
    const altered = structuredClone(generalized);
    altered.status = "completed";
    altered.errors = [];
    altered.directedLinks.status = "passed";
    altered.directedLinks.morseCondition = "passed";
    altered.directedLinks.scanOutcome = "exhaustive";
    altered.directedLinks.checkedOriginalVertexCount =
      altered.directedLinks.declaredOriginalVertexCount;
    altered.directedLinks.checks = {
      sourceCertificatesPassed: true,
      everyDeclaredSubdivisionVertexChecked: true,
      everyAscendingLinkNonempty: true,
      everyDescendingLinkNonempty: true,
      everyAscendingLinkConnected: true,
      everyDescendingLinkConnected: true,
    };
    altered.directedLinks.errors = [];
    rehash(altered);

    const certificate = buildLawfulSubcomplexFiberingCertificate({
      ...coreInput,
      generalizedCertificate: altered,
    });

    expect(certificate.generalized.checks.storedArtifactHashValid).toBe(true);
    expect(certificate.generalized.scopeMatches).toBe(true);
    expect(certificate.generalized.checks.actionRootedReplayPassed).toBe(false);
    expect(certificate.generalized.status).toBe("failed");
    expect(certificate.conclusion.virtualAlgebraicFibrationCertified).toBe(
      false,
    );
  });

  it("does not rank or conclude from a rehashed same-scope invalid artifact", () => {
    const { coreInput, generalized } = fixture();
    const altered = structuredClone(generalized);
    altered.directedLinks.vertexSummaries[0].ascendingComponentCount += 1;
    rehash(altered);
    const wallIds = coreInput.wallSystem.walls.map((wall) => wall.id).sort();
    const generalizedCertificatesBySignKey: Record<
      string,
      GeneralizedLawfulCertificate
    > = {};
    for (let mask = 0; mask < 2 ** wallIds.length; mask += 1) {
      const signs = Object.fromEntries(
        wallIds.map((wallId, index) => [
          wallId,
          (mask & (2 ** index)) === 0 ? 1 : -1,
        ]),
      ) as Record<string, 1 | -1>;
      generalizedCertificatesBySignKey[
        lawfulCoorientationSignKey(wallIds, signs)
      ] = altered;
    }

    const result = searchLawfulSubcomplexCoorientations({
      quotient: coreInput.quotient,
      options: {
        certificationComplex: "coface-closed-full",
        generalizedCertificatesBySignKey,
        exactWallLimit: 8,
        maxCandidates: 64,
        deterministicCandidateBudgetOnly: true,
      },
    });

    expect(result.status).toBe("incomplete");
    expect(result.optimalityProven).toBe(false);
    expect(result.terminationReason).toBe("missing-generalized-certificates");
    expect(result.bestScore).toBeUndefined();
    expect(result.certificate).toBeUndefined();
  }, 10_000);

  it("treats replayed disconnected generalized links as complete negative evidence", () => {
    const candidate = universalRankThreeParityAction();
    const torsionFree = certifyTorsionFreeAction(
      UNIVERSAL_RANK_THREE_SYSTEM,
      candidate,
      planSphericalSpecialSubgroups(UNIVERSAL_RANK_THREE_SYSTEM),
    );
    expect(torsionFree.status, torsionFree.errors.join("\n")).toBe("passed");
    const quotient = acceptedActionToQuotientComplex(
      UNIVERSAL_RANK_THREE_SYSTEM,
      { candidate, certificate: torsionFree },
    );
    const cover = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(cover.barX);
    const oracle = buildStreamedLawfulDavisOracle({
      system: UNIVERSAL_RANK_THREE_SYSTEM,
      generatorImages: candidate.generatorImages,
    });
    const wallIds = wallSystem.walls.map(({ id }) => id).sort();
    const generalizedCertificatesBySignKey: Record<
      string,
      GeneralizedLawfulCertificate
    > = {};
    for (let mask = 0; mask < 2 ** wallIds.length; mask += 1) {
      const signs = Object.fromEntries(
        wallIds.map((wallId, index) => [
          wallId,
          (mask & (2 ** index)) === 0 ? 1 : -1,
        ]),
      ) as Record<string, 1 | -1>;
      const coorientation = createWallCoorientation(wallSystem, signs);
      const streamedWallSigns = Object.fromEntries(
        oracle.walls.walls.map(({ id }) => [id, coorientation.wallSigns[id]]),
      ) as Record<string, 1 | -1>;
      const evaluation = oracle.bindCoorientations([
        { id: `complete-negative-${mask}`, wallSigns: streamedWallSigns },
      ]);
      const generalized = buildGeneralizedLawfulCertificateFromStreamed({
        oracle,
        evaluation,
        candidateIndex: 0,
      });
      expect(generalized.status).toBe("completed");
      expect(generalized.directedLinks.status).toBe("passed");
      expect(generalized.directedLinks.morseCondition).toBe("not-established");
      generalizedCertificatesBySignKey[
        lawfulCoorientationSignKey(wallIds, signs)
      ] = generalized;
    }

    const result = searchLawfulSubcomplexCoorientations({
      quotient,
      options: {
        certificationComplex: "coface-closed-full",
        generalizedCertificatesBySignKey,
        exactWallLimit: 8,
        maxCandidates: 16,
        deterministicCandidateBudgetOnly: true,
      },
    });

    expect(result.status).toBe("not-found");
    expect(result.optimalityProven).toBe(true);
    expect(result.terminationReason).toBe("sign-space-exhausted");
    expect(result.bestScore?.morseDataPassed).toBe(false);
    expect(result.certificate).toBeUndefined();
  });
});
