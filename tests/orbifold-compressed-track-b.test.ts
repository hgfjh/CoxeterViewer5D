import { describe, expect, it } from "vitest";

import { screenPromotedOrbifoldCharacterOnCompressedTrackB } from "../src/fibering/orbifoldCompressedTrackB";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "Universal rank-three promoted Track B fixture",
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

function promotion() {
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
  };
}

describe("orbifold character to compressed Track B bridge", () => {
  it("scans rooted links only after exact torsion-free intersection promotion", () => {
    const runtime = screenPromotedOrbifoldCharacterOnCompressedTrackB({
      promotion: promotion(),
      points: [0, 1],
      maxPoints: 2,
    });
    expect(runtime.promotion.acceptedIntersection.certificate.status).toBe(
      "passed",
    );
    expect(runtime.certificate.target.quotientCellComplex).toBe(
      "(K-intersection-H)\\Sigma",
    );
    expect(runtime.certificate.target.foldedOrbifoldQuotientLinksUsed).toBe(
      false,
    );
    expect(runtime.certificate.scan.scope).toBe("selected-anchor-vertices");
    expect(runtime.certificate.scan.requestedPoints).toEqual([0, 1]);
    expect(runtime.certificate.checks.directedEdgeCocycleReplayed).toBe(true);
    expect(runtime.certificate.nonClaims.join(" ")).toMatch(
      /local evidence only/u,
    );
  });

  it("rejects folded quotient-link evidence before building a Track B source", () => {
    const input = promotion();
    expect(() =>
      screenPromotedOrbifoldCharacterOnCompressedTrackB({
        promotion: {
          ...input,
          developmentLinks: {
            sourceCertificateDigest: canonicalSha256({ fixture: "folded" }),
            characterCocycleDigest: canonicalSha256({ fixture: "cocycle" }),
            localModel: "folded-quotient-links",
            completeVertexOrbitCensus: true,
            stabilizerResolved: true,
            incidencesComputedBeforeQuotientFolding: true,
            allAscendingNonempty: true,
            allDescendingNonempty: true,
            allAscendingConnected: true,
            allDescendingConnected: true,
            finiteHeightBandPi1Surjection: true,
          },
        },
        points: [0],
      }),
    ).toThrow(/Folded orbifold quotient links/u);
  });

  it("enforces a canonical bounded anchor list", () => {
    expect(() =>
      screenPromotedOrbifoldCharacterOnCompressedTrackB({
        promotion: promotion(),
        points: [1, 0],
        maxPoints: 2,
      }),
    ).toThrow(/strictly increasing/u);
  });

  it("rejects an oversized diagonal action before materialization", () => {
    expect(() =>
      screenPromotedOrbifoldCharacterOnCompressedTrackB({
        promotion: promotion(),
        points: [0],
        maxDiagonalProduct: 15,
      }),
    ).toThrow(/product bound 16/u);
  });

  it("does not label an early-stopped full request as a completed census", () => {
    const runtime = screenPromotedOrbifoldCharacterOnCompressedTrackB({
      promotion: promotion(),
      points: Array.from({ length: 16 }, (_unused, point) => point),
      maxPoints: 16,
    });
    expect(runtime.certificate.scan.scope).toBe(
      runtime.certificate.scan.checkedPointTemplateCount === 16
        ? "full-quotient-vertex-census"
        : "counterexample-terminated-prefix-of-full-census",
    );
  });
});
