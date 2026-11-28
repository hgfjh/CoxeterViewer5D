import { describe, expect, it } from "vitest";

import {
  buildDiagonalIntersectionAction,
  buildOrbifoldIntersectionPromotionCertificate,
  buildOrbifoldIntersectionPromotionRuntime,
  type OrbifoldDevelopmentLinkEvidence,
} from "../src/fibering/orbifoldIntersectionPromotion";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "Universal rank-three orbifold promotion fixture",
  rank: 3,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
    { id: "s2", label: "s2" },
  ],
  coxeterMatrix: [
    [1, "inf", "inf"],
    ["inf", 1, "inf"],
    ["inf", "inf", 1],
  ],
  dataStatus: "toy",
};

// The stabilizer contains conjugates of s2, but s0s1 gives it an infinite
// cyclic quotient. Thus this is a useful torsionful positive-b1 fixture.
const ORBIFOLD_ACTION: TorsionFreeActionCandidate = {
  id: "torsionful-index-two",
  index: 2,
  generatorImages: [
    [1, 0],
    [1, 0],
    [0, 1],
  ],
};

const TORSION_FREE_ACTION: TorsionFreeActionCandidate = {
  // Regular D8 action with s0=t, s1=rt, s2=t. Restricted to K, the free
  // generator s1s0 maps to r while both reflector generators map to t. The
  // kernel therefore sees exactly the even values of the K -> Z character.
  id: "torsion-free-d8-kernel",
  index: 8,
  generatorImages: [
    [1, 0, 3, 2, 5, 4, 7, 6],
    [3, 6, 5, 0, 7, 2, 1, 4],
    [1, 0, 3, 2, 5, 4, 7, 6],
  ],
};

const CHARACTER = {
  id: "s0s1-period",
  edgeIncrements: [
    ["1", "-1"],
    ["0", "0"],
    ["0", "0"],
  ],
  sourceCertificateDigest: canonicalSha256({ fixture: "source-character" }),
};

function sourceCocycleDigest(): string {
  return canonicalSha256({
    actionRowsDigest: canonicalSha256({
      index: ORBIFOLD_ACTION.index,
      generatorImages: ORBIFOLD_ACTION.generatorImages,
    }),
    edgeIncrements: CHARACTER.edgeIncrements,
  });
}

function linkEvidence(
  localModel: OrbifoldDevelopmentLinkEvidence["localModel"],
): OrbifoldDevelopmentLinkEvidence {
  return {
    sourceCertificateDigest: canonicalSha256({ fixture: "rooted-links" }),
    characterCocycleDigest: sourceCocycleDigest(),
    localModel,
    completeVertexOrbitCensus: true,
    stabilizerResolved: true,
    incidencesComputedBeforeQuotientFolding: true,
    allAscendingNonempty: true,
    allDescendingNonempty: true,
    allAscendingConnected: true,
    allDescendingConnected: true,
    finiteHeightBandPi1Surjection: true,
  };
}

function input(
  developmentLinks?: OrbifoldDevelopmentLinkEvidence,
): Parameters<typeof buildOrbifoldIntersectionPromotionCertificate>[0] {
  return {
    system: SYSTEM,
    orbifoldAction: ORBIFOLD_ACTION,
    character: CHARACTER,
    torsionFreeCoverAction: TORSION_FREE_ACTION,
    torsionFreeCoverCertificate: certifyTorsionFreeAction(
      SYSTEM,
      TORSION_FREE_ACTION,
      planSphericalSpecialSubgroups(SYSTEM),
    ),
    ...(developmentLinks ? { developmentLinks } : {}),
  };
}

describe("orbifold intersection promotion", () => {
  it("constructs W/(K intersection H) and normalizes the restricted character", () => {
    const diagonal = buildDiagonalIntersectionAction(
      SYSTEM,
      ORBIFOLD_ACTION,
      TORSION_FREE_ACTION,
    );
    expect(diagonal.candidate.index).toBe(16);
    expect(diagonal.degreeOverOrbifoldSubgroup).toBe(8);
    expect(diagonal.degreeOverTorsionFreeCoverSubgroup).toBe(2);

    const certificate = buildOrbifoldIntersectionPromotionCertificate(
      input(linkEvidence("rooted-development-stars")),
    );
    expect(certificate.status).toBe("passed");
    expect(certificate.intersection?.indexInAmbientCoxeterGroup).toBe(16);
    expect(certificate.character.sourceImageDivisor).toBe("1");
    expect(certificate.character.restrictedImageDivisor).toBe("2");
    expect(certificate.character.normalizationMethod).toBe(
      "integral-vertex-coboundary-then-divide",
    );
    expect(certificate.character.normalizationPotentialDigest).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(certificate.character.adjustedLiftedCocycleDigest).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(certificate.character.normalizedLiftedCocycleDigest).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(
      certificate.checks.intersectionTorsionFreeIndependentlyReplayed,
    ).toBe(true);
    expect(certificate.promotion.normalizedRestrictedCharacterPrimitive).toBe(
      true,
    );
    expect(certificate.promotion.status).toBe(
      "eligible-for-torsion-free-track-replay",
    );
  });

  it("reconstructs the certified torsion-free action and normalized runtime cocycle", () => {
    const runtime = buildOrbifoldIntersectionPromotionRuntime(input());
    expect(runtime.diagonal.candidate.index).toBe(16);
    expect(runtime.acceptedIntersection.certificate.status).toBe("passed");
    expect(runtime.certificate.character.restrictedImageDivisor).toBe("2");
    expect(runtime.normalizedCharacter.edgeIncrements.flat()).toContain("1");
    expect(runtime.normalizedCharacter.edgeIncrements.flat()).toContain("-1");
    expect(runtime.normalizedCharacter.sourceCertificateDigest).toBe(
      runtime.certificate.character.normalizedLiftedCocycleDigest,
    );
  });

  it("never promotes folded quotient links, even when their graph tests pass", () => {
    const certificate = buildOrbifoldIntersectionPromotionCertificate(
      input(linkEvidence("folded-quotient-links")),
    );
    expect(certificate.status).toBe("not-established");
    expect(certificate.developmentLinks.accepted).toBe(false);
    expect(certificate.checks.rootedDevelopmentLinksAccepted).toBe(false);
    expect(certificate.checks.quotientLinksNotUsed).toBe(false);
    expect(certificate.promotion.status).toBe("not-established");
    expect(certificate.developmentLinks.rejectionReasons.join(" ")).toMatch(
      /do not determine links in the local development/u,
    );
  });

  it("keeps exact arithmetic evidence without inventing missing Morse evidence", () => {
    const certificate = buildOrbifoldIntersectionPromotionCertificate(input());
    expect(certificate.status).toBe("not-established");
    expect(certificate.intersection).toBeDefined();
    expect(certificate.developmentLinks.supplied).toBe(false);
    expect(certificate.claims).toContain("K intersection H is torsion-free.");
    expect(certificate.promotion.status).toBe("not-established");
  });

  it("rejects a non-closed source cocycle before intersection promotion", () => {
    const tampered = input(linkEvidence("rooted-development-stars"));
    tampered.character = {
      ...CHARACTER,
      edgeIncrements: [
        ["1", "1"],
        ["0", "0"],
        ["0", "0"],
      ],
    };
    const certificate = buildOrbifoldIntersectionPromotionCertificate(tampered);
    expect(certificate.status).toBe("failed");
    expect(certificate.checks.sourceCocycleIntegralAntisymmetricAndClosed).toBe(
      false,
    );
    expect(certificate.claims).toEqual([]);
  });
});
