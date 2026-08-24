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

function fixture(opposedDihedralWalls = true): {
  coreInput: Parameters<typeof buildLawfulSubcomplexFiberingCertificate>[0];
  generalized: GeneralizedLawfulCertificate;
} {
  const candidate = productAction();
  const torsionFree = certifyTorsionFreeAction(
    PRODUCT_SYSTEM,
    candidate,
    planSphericalSpecialSubgroups(PRODUCT_SYSTEM),
  );
  expect(torsionFree.status, torsionFree.errors.join("\n")).toBe("passed");
  const quotient = acceptedActionToQuotientComplex(PRODUCT_SYSTEM, {
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
    system: PRODUCT_SYSTEM,
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
  it("uses full-cell asphericity instead of the rank-two NPC diagnostic", () => {
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
    expect(certificate.status).toBe("passed");
    expect(certificate.conclusion.virtualAlgebraicFibrationCertified).toBe(
      true,
    );
  });

  it("embeds and scope-rechecks the generalized artifact during action replay", () => {
    const { coreInput, generalized } = fixture();
    const actionCertificate = certifyLawfulSubcomplexVirtualAlgebraicFibration({
      quotient: coreInput.quotient,
      requestedWallSigns: coreInput.coorientation.wallSigns,
      certificationComplex: "coface-closed-full",
      generalizedCertificate: generalized,
    });

    expect(actionCertificate.status).toBe("passed");
    expect(actionCertificate.lawful.generalizedCertificate?.artifactHash).toBe(
      generalized.artifactHash,
    );
    expect(
      verifyLawfulSubcomplexActionCertificate(actionCertificate),
    ).toMatchObject({ valid: true, mandatoryChecksPassed: true });
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

  it.each(["directed-links", "asphericity"] as const)(
    "does not let passing rank-two diagnostics replace failed generalized %s",
    (failure) => {
      const { coreInput, generalized } = fixture();
      const altered = structuredClone(generalized);
      if (failure === "directed-links") {
        altered.directedLinks.morseCondition = "not-established";
        altered.directedLinks.checks.everyAscendingLinkConnected = false;
      } else {
        altered.asphericity.status = "not-established";
        altered.asphericity.checks.everyMetricSphericalCliqueFilled = false;
      }
      rehash(altered);

      const certificate = buildLawfulSubcomplexFiberingCertificate({
        ...coreInput,
        generalizedCertificate: altered,
      });

      expect(certificate.morse.status).toBe("passed");
      expect(certificate.generalized.scopeMatches).toBe(true);
      expect(certificate.generalized.checks.actionRootedReplayPassed).toBe(
        false,
      );
      expect(certificate.generalized.status).toBe("failed");
      expect(certificate.kernelTransfer.status).toBe("failed");
      expect(certificate.conclusion.virtualAlgebraicFibrationCertified).toBe(
        false,
      );
    },
  );

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
});
