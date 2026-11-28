import { describe, expect, it } from "vitest";

import {
  compactResearchCampaigns,
  compactResearchTargets,
  getCompactResearchCampaign,
  getCompactResearchTarget,
} from "../src/fibering/compactResearchTargets";

describe("compact research target registry", () => {
  it("keeps the campaigns in explicit execution order", () => {
    expect(compactResearchCampaigns.map((campaign) => campaign.id)).toEqual([
      "makarov-p0-p1-primary",
      "tumarkin-06-15-comparison",
      "makarov-p2-coarse-experiment",
      "tumarkin-g12221-deferred",
      "h5-p7-22-source-import",
    ]);
    expect(compactResearchCampaigns.map((campaign) => campaign.order)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(
      new Set(compactResearchTargets.map((target) => target.id)).size,
    ).toBe(compactResearchTargets.length);
    expect(
      compactResearchCampaigns.flatMap((campaign) => campaign.targetIds),
    ).toEqual(compactResearchTargets.map((target) => target.id));
  });

  it("groups P0/P1 as one primary campaign and #06/#15 as peers", () => {
    expect(getCompactResearchCampaign("makarov-p0-p1-primary")).toMatchObject({
      status: "active",
      mode: "paired-finite-action",
      targetIds: ["makarov-p0", "makarov-p1"],
    });
    expect(
      getCompactResearchCampaign("tumarkin-06-15-comparison"),
    ).toMatchObject({
      status: "bounded",
      mode: "paired-finite-action-comparison",
      targetIds: ["tumarkin-g11411-06", "tumarkin-g11411-15"],
    });
    expect(getCompactResearchTarget("tumarkin-g11411-06").role).toBe(
      "comparison-peer",
    );
    expect(getCompactResearchTarget("tumarkin-g11411-15").role).toBe(
      "comparison-peer",
    );
    expect(getCompactResearchTarget("makarov-p0").actionDegreeTiers).toEqual([
      28_800, 57_600, 86_400, 115_200,
    ]);
    expect(getCompactResearchTarget("makarov-p1").actionDegreeTiers).toEqual([
      28_800, 57_600, 86_400, 115_200,
    ]);
    expect(
      getCompactResearchTarget("tumarkin-g11411-06").actionDegreeTiers,
    ).toEqual([28_800, 57_600]);
    expect(
      getCompactResearchTarget("tumarkin-g11411-15").actionDegreeTiers,
    ).toEqual([28_800, 57_600]);
    for (const id of ["tumarkin-g11411-06", "tumarkin-g11411-15"] as const) {
      const target = getCompactResearchTarget(id);
      expect(target.acquisitionScreens).toHaveLength(1);
      expect(target.acquisitionScreens[0]).toMatchObject({
        id: "tumarkin-06-15-shallow-split-target",
        status: "closed-within-modeled-classes",
        disposition: "custom-lane-closed-imported-actions-open",
        artifactBytesSha256:
          "bc1f85bfa236b884441fb32e5a98f4f10f16c576d0722448ad793ee5f46081c7",
        certificateSha256:
          "fc49bbfc0e42d65376f6a5a33958be8d9ffc8f60741fd6e7fcc1d78b1da77d8f",
        sourceCanonicalSystemSha256: target.canonicalSystemSha256,
        targetFamily: "W(H4) x C2",
        modeledAnchorRecordCount: 32,
        eliminatedAnchorRecordCount: 32,
        acceptsImportedFiniteActionEvidence: true,
      });
      expect(target.executionPolicy.acceptsFiniteActionEvidence).toBe(true);
    }
    for (const id of ["makarov-p0", "makarov-p1"] as const) {
      const target = getCompactResearchTarget(id);
      expect(target.acquisitionScreens).toHaveLength(1);
      expect(target.acquisitionScreens[0]).toMatchObject({
        id: "makarov-h4-projection-obstruction",
        status: "closed-within-modeled-classes",
        disposition: "custom-lane-closed-imported-actions-open",
        artifactBytesSha256:
          "c71da1799234078b8be01efcd5f917d6622ffd0a21772a288e4e37e9468c7025",
        certificateSha256:
          "1aa9561ed47767e7bd152f4899fa6716112ad98b2d810dc019f347fbebb61508",
        sourceCanonicalSystemSha256: target.canonicalSystemSha256,
        targetFamily: "W(H4) x SmallGroup(q,id)",
        canonicalFirstProjection: true,
        cofactorOrders: [2, 4, 6, 8],
        eliminatedTargetCount: 10,
        acceptsImportedFiniteActionEvidence: true,
      });
      expect(target.executionPolicy.acceptsFiniteActionEvidence).toBe(true);
    }
  });

  it("derives the reviewed preflight facts from bundled certified systems", () => {
    expect(getCompactResearchTarget("makarov-p0").facts).toMatchObject({
      canonicalSystemSha256:
        "c1e89cfd943dbb7eda7c55a761ca80f612e95bdc44d118b9429f38bcf77914d0",
      nonemptySphericalTypeCount: 92,
      torsionFreeDegreeDivisor: "28800",
      conditionalDavisCellCountAtDivisor: "352484",
      nonzeroAmbientMod2CharacterCount: "3",
    });
    expect(getCompactResearchTarget("makarov-p1").facts).toMatchObject({
      canonicalSystemSha256:
        "d88862776eb9945135d42f16b2fe7ed35f813d5f6bd388a0ae6c03398148daec",
      nonemptySphericalTypeCount: 92,
      torsionFreeDegreeDivisor: "28800",
      conditionalDavisCellCountAtDivisor: "342084",
      nonzeroAmbientMod2CharacterCount: "1",
    });
    expect(getCompactResearchTarget("tumarkin-g11411-06").facts).toMatchObject({
      canonicalSystemSha256:
        "42da09e1ceef6e9f07a0e76bd9f4cd88505d735d993025fa89bbc551e3b15068",
      nonemptySphericalTypeCount: 122,
      torsionFreeDegreeDivisor: "28800",
      conditionalDavisCellCountAtDivisor: "434984",
      nonzeroAmbientMod2CharacterCount: "7",
    });
    expect(getCompactResearchTarget("tumarkin-g11411-15").facts).toMatchObject({
      canonicalSystemSha256:
        "16e88a6577484de52a0a9eb45724dfbd6faf3951e70e45ebccd7b053e06e3219",
      nonemptySphericalTypeCount: 122,
      torsionFreeDegreeDivisor: "28800",
      conditionalDavisCellCountAtDivisor: "443348",
      nonzeroAmbientMod2CharacterCount: "7",
    });
  });

  it("keeps P2 in a separate coarse branch without a raw-action queue", () => {
    const p2 = getCompactResearchTarget("makarov-p2");
    expect(p2).toMatchObject({
      status: "experimental-coarse-import",
      role: "coarse-structural-experiment",
      sourceStatus: "bundled-certified",
      executionPolicy: {
        mode: "coarse-only",
        acceptsFiniteActionEvidence: false,
        queueStatus: "not-applicable",
        allowedDegreeTiers: [],
        capacityRule: "coarse-cellulation-only",
      },
      actionDegreeTiers: [],
      degreeCapacityAudits: [],
    });
    expect(p2.facts).toMatchObject({
      torsionFreeDegreeDivisor: "57600",
      conditionalDavisCellCountAtDivisor: "694628",
    });
    expect(p2.notes.join(" ")).toContain(
      "primitive type-6 cocycle survives one identity-link polarity",
    );
    expect(p2.notes.join(" ")).toContain(
      "current cover has one-sided type-5 walls",
    );
    expect(p2.notes.join(" ")).toContain("344 of the full 384-pair product");
    expect(p2.notes.join(" ")).toContain("eliminates all ten classes");
    expect(p2.notes.join(" ")).toContain(
      "all 239 scheduled records and all 286 branches",
    );
    expect(p2.notes.join(" ")).toContain(
      "bounded-inconclusive result deprioritizes those affine ansatzes",
    );
    expect(p2.notes.join(" ")).toContain(
      "Other characters, potentials, subdivisions, P2 Track B families",
    );
    expect(
      getCompactResearchCampaign("makarov-p2-coarse-experiment").notes.join(
        " ",
      ),
    ).toContain("Broader component rules remain open");
  });

  it("makes H5-P7-22 an import placeholder with no asserted facts or queue", () => {
    expect(getCompactResearchTarget("h5-p7-22")).toMatchObject({
      status: "import-required",
      role: "unverified-placeholder",
      sourceStatus: "import-required",
      canonicalSystemSha256: null,
      executionPolicy: {
        mode: "source-import-gated",
        acceptsFiniteActionEvidence: false,
        queueStatus: "blocked-on-source",
        allowedDegreeTiers: [],
        capacityRule: "source-replay-required",
      },
      facts: null,
      actionDegreeTiers: [],
      degreeCapacityAudits: [],
    });
  });

  it("queues only the capacity-compatible G12221 tier", () => {
    const target = getCompactResearchTarget("tumarkin-g12221");
    expect(target).toMatchObject({
      status: "deferred",
      sourceStatus: "bundled-certified",
      executionPolicy: {
        mode: "registered-deferred",
        acceptsFiniteActionEvidence: true,
        queueStatus: "deferred",
        allowedDegreeTiers: [57_600],
        capacityRule: "current-static-expensive-stage-preflight",
      },
      actionDegreeTiers: [57_600],
    });
    expect(target.facts).toMatchObject({
      nonemptySphericalTypeCount: 146,
      torsionFreeDegreeDivisor: "57600",
      conditionalDavisCellCountAtDivisor: "915172",
      nonzeroAmbientMod2CharacterCount: "15",
    });
    expect(target.degreeCapacityAudits).toHaveLength(2);
    expect(target.degreeCapacityAudits[0]).toMatchObject({
      degree: 57_600,
      status: "passes-current-static-preflight",
      failedBounds: [],
    });
    expect(target.degreeCapacityAudits[1]).toMatchObject({
      degree: 115_200,
      status: "exceeds-current-static-preflight",
      failedBounds: ["maxRootedSourceCells", "maxRootedFaceRecords"],
    });
  });

  it("does not place a failed capacity audit in any action queue", () => {
    for (const target of compactResearchTargets) {
      const passingDegrees = target.degreeCapacityAudits
        .filter((audit) => audit.status === "passes-current-static-preflight")
        .map((audit) => audit.degree);
      expect(target.actionDegreeTiers).toEqual(passingDegrees);
    }
  });

  it("binds finite-action execution to a certified system hash and active policy", () => {
    const activeTargets = compactResearchTargets.filter(
      (target) => target.executionPolicy.mode === "active-finite-action-queue",
    );
    expect(activeTargets.map((target) => target.id)).toEqual([
      "makarov-p0",
      "makarov-p1",
      "tumarkin-g11411-06",
      "tumarkin-g11411-15",
    ]);
    for (const target of activeTargets) {
      expect(target.canonicalSystemSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(target.canonicalSystemSha256).toBe(
        target.facts?.canonicalSystemSha256,
      );
      expect(target.executionPolicy).toMatchObject({
        acceptsFiniteActionEvidence: true,
        queueStatus: "active",
        allowedDegreeTiers: target.actionDegreeTiers,
        capacityRule: "current-static-expensive-stage-preflight",
      });
    }
  });
});
