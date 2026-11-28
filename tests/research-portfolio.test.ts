import { describe, expect, it } from "vitest";

import {
  buildCompactResearchPortfolio,
  computeCompactResearchPortfolioDigest,
  replayCompactResearchPortfolio,
} from "../src/fibering/compactResearchPortfolio";
import {
  compactResearchCampaigns,
  compactResearchTargets,
} from "../src/fibering/compactResearchTargets";
import {
  CUBE_RESCUE_CERTIFIED_LOCAL_POINTS,
  CUBE_RESCUE_PRODUCTION_ORDER_KINDS,
  CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES,
  computeCompactCubeBoundedRescueCertificateDigest,
  type CompactCubeBoundedRescueCertificate,
  type CompactCubeBoundedRescueReplay,
} from "../src/fibering/cubeRescueCertificate";
import {
  computeJnwCubePositiveControlArtifactDigest,
  type JnwCubePositiveControlCertificate,
  type JnwCubePositiveControlReplay,
} from "../src/fibering/jnwCubePositiveControl";
import {
  buildFiberingResearchPortfolio,
  replayFiberingResearchPortfolio,
  summarizeCompactResearchProofBranches,
  type CompactCubeRescuePortfolioComponent,
  type FiberingResearchPortfolioArtifact,
} from "../src/fibering/researchPortfolio";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

function sealReplay<T extends Record<string, unknown>>(
  value: T,
): T & { replayDigest: string } {
  return { ...value, replayDigest: canonicalSha256(value) };
}

function withoutArtifactHash(
  artifact: FiberingResearchPortfolioArtifact,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(artifact).filter(([key]) => key !== "artifactHash"),
  );
}

function testComponents(): Parameters<
  typeof buildFiberingResearchPortfolio
>[0] {
  const motifIds = Array.from({ length: 38 }, (_, index) => `motif-${index}`);
  const orderKinds = [...CUBE_RESCUE_PRODUCTION_ORDER_KINDS];
  const subdivisionFamilies = [...CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES];
  const trials = motifIds.flatMap((sourceMotifId) =>
    orderKinds.flatMap((orderKind) =>
      subdivisionFamilies.map((subdivisionFamily) => ({
        sourceMotifId,
        orderKind,
        subdivisionFamily,
      })),
    ),
  );
  const cubeCertificate = {
    status: "benchmark-archive",
    motifExtraction: {
      terminalPruneCount: 38,
      pointCensus: [
        { point: 2, count: 13 },
        { point: 4, count: 5 },
        { point: 27, count: 20 },
      ],
      motifs: motifIds.map((motifId) => ({ motifId })),
    },
    selectedMotifIds: motifIds,
    portfolio: {
      orderKinds,
      subdivisionFamilies,
      localPointIds: [...CUBE_RESCUE_CERTIFIED_LOCAL_POINTS],
      trialCount: trials.length,
      localConnectorCount: 0,
      originalVertexPassCount: 0,
    },
    trials,
    checks: {
      allSeparatorLeavesExtracted: true,
      allSeparatorMotifsSelected: true,
      productionCartesianPortfolioComplete: true,
      onlyThreeCertifiedMotifPointsUsed: true,
      noGlobalNormalCatalogueRecomputed: true,
    },
    certificateDigest: "",
  } as unknown as CompactCubeBoundedRescueCertificate;
  cubeCertificate.certificateDigest =
    computeCompactCubeBoundedRescueCertificateDigest(cubeCertificate);
  const cubeReplay = sealReplay({
    status: "passed" as const,
    checks: {},
    errors: [],
  }) as unknown as CompactCubeBoundedRescueReplay;
  const cube = {
    certificate: cubeCertificate,
    replay: cubeReplay,
    runner: { noGlobalNormalCatalogueLoaded: true as const },
    artifactDigest: "",
  } satisfies CompactCubeRescuePortfolioComponent;
  cube.artifactDigest = canonicalSha256({ ...cube, artifactDigest: "" });

  const compact = buildCompactResearchPortfolio();
  const compactReplay = replayCompactResearchPortfolio(compact);

  const jnw = {
    schemaVersion: 1,
    kind: "jnw-cube-graph-positive-control-certificate",
    status: "passed",
    checks: { theoremInferencePassed: true },
    theorem: {
      result: {
        subgroupIndex: 4,
        h1IsomorphicTo: "Z^6",
        virtualAlgebraicFibration: true,
      },
    },
    npcAndDirectedLinks: {
      vertexLinks: Array.from({ length: 4 }, (_, vertex) => ({ vertex })),
      checks: { universalCoverContractible: true },
    },
    artifactDigest: "",
  } as unknown as JnwCubePositiveControlCertificate;
  jnw.artifactDigest = computeJnwCubePositiveControlArtifactDigest(jnw);
  const jnwReplay = sealReplay({
    schemaVersion: 1 as const,
    kind: "jnw-cube-graph-positive-control-replay" as const,
    valid: true,
    checks: {},
    errors: [],
  }) as unknown as JnwCubePositiveControlReplay;

  return {
    cube,
    cubeFile: { path: "cube.json", bytesSha256: "a".repeat(64) },
    compact,
    compactFile: { path: "compact.json", bytesSha256: "b".repeat(64) },
    compactReplay,
    jnw,
    jnwFile: { path: "jnw.json", bytesSha256: "c".repeat(64) },
    jnwReplay,
  };
}

describe("aggregate fibering research portfolio", () => {
  it("binds the reviewed components and counts eight directed JNW links", () => {
    const artifact = buildFiberingResearchPortfolio(testComponents());
    expect(artifact.schemaVersion).toBe(2);
    expect(artifact.jnwPositiveControl.directedLinkCount).toBe(8);
    expect(artifact.compactResearch.orderedCampaignIds).toEqual(
      compactResearchCampaigns.map(({ id }) => id),
    );
    expect(artifact.compactResearch.orderedTargetIds).toEqual(
      compactResearchTargets.map(({ id }) => id),
    );
    expect(artifact.compactResearch).not.toHaveProperty("excludedTarget");
    expect(artifact.compactResearch.proofBranches).toMatchObject({
      execution: "independent",
      directRankOne: { runCount: 0, passedCount: 0 },
      scalableFullH1: { runCount: 0, passedCount: 0 },
    });
    expect(artifact.compactResearch.p2Plan).toMatchObject({
      status: "bundled-fixed-character-screened",
      runnable: true,
      missingSourceRoles: [],
      explicitPrimitiveCharacterMaterialized: true,
      registeredPrimitiveClassCount: 2,
      qIndependentPrimitiveClassCount: 2,
      secondPrimitiveClassCheapScreenCompleted: true,
      secondPrimitiveClassObstructedForRecordedModel: true,
      secondPrimitiveClassGlobalTrackBOpen: true,
      fixedCharacterTrackBRunCompleted: true,
      fixedCharacterTrackBObstructedForRecordedModel: true,
      coarseFixedCharacterTrackBRunCompleted: true,
      coarseFixedCharacterTrackBObstructedForRecordedModel: true,
      strictWallTrackAInputIncomplete: false,
      currentCoverFullWallCoorientabilityKnown: true,
      currentCoverFullWallCoorientable: false,
      currentCoverStrictWallTrackABlocked: true,
      directCocycleTrackANotRun: true,
      finiteHeightBandNotRun: true,
      explicitPrimitiveCharacterWallTrackAObstructed: true,
      otherWallCharacterTrackAOpen: false,
      furtherCoverWallTrackAOpen: true,
      colorClassOnlyOrientationCoverOpen: false,
      facetSpecificOrientationCoverOpen: false,
      globalWallLawfulCalculationRun: false,
      type6TrackBAnchorRunCompleted: true,
      type6TrackBAnchorSurvived: true,
      type6TrackBGlobalScanRun: false,
      type6MaximalType5GlobalScreenCompleted: true,
      type6MaximalType5SurvivorCount: 24,
      type6NonmaximalBarycentricLinksOpen: false,
      type6DeclaredHeightFamilyScreenCompleted: true,
      type6DeclaredHeightFamilyObstructed: true,
      type6DeclaredHeightFamilySurvivorCount: 0,
      type6R2QuickGateSurvivorCount: 40,
      type6R2MaximalType5ScreenCompleted: true,
      type6R2ProductScreenCompleted: true,
      type6R2ProductObstructed: true,
      type6R2ProductSurvivorCount: 0,
      type6OtherPeriodicCoordinatesOpen: true,
      sheetResolvedRadius2SurvivorFrontier: true,
      sheetResolvedCompactRuleRejectedAtRadius2: true,
      sheetResolvedGlobalTrackAOpen: true,
      f9ExactImageOrderComputed: true,
      f9SubgroupImageDivisor: 40,
      f9RootLineCandidateRejected: true,
      f9ExactDegreeOpen: true,
      f9GlobalFlipSearchOpen: true,
      positiveTrackACertificate: false,
      positiveTrackBCertificate: false,
      directCocycleTrackAOpen: true,
      conditionalMorseSearchComplete: false,
      primitiveCocycleCertificateSha256:
        "aeb2591986d77a5d60e595920eaf1af5e9bfca805314ed6c0acccef13e03acd7",
      primitiveCocycleScreeningPortfolioArtifactSha256:
        "f50a61abe654c8a08f65d0004929a55c9b477a0caacb2cd20b9014e6eea3f804",
      compressedTrackBArtifactSha256:
        "7bbf2806f85f39b9e91e3e666eef7b972ca4e7fa7d1a73113ea1a231c6357ea0",
      coarseTrackBCertificateSha256:
        "ee447ec91aed2ac4d84d68e35386942043c6ed3fb450b1ec55d35adb83c2526a",
      strictWallTrackACertificateSha256:
        "bf7818d52afcf65e9d34080cfb7260ae3088e091a21b1bbf40a86b86000f938a",
      wallCompatibilityArtifactSha256:
        "f8c0bbbaec0f2896239c362c44801e9c985bfd8bfed0ceea849253ca1164f423",
      wallCoorientationArtifactSha256:
        "1adb8e9449e0b2cba37aa4d502877f07b7961092e8cec51e6b6369d20f1f5bfe",
      colorClassWallOrientationArtifactSha256:
        "5445d8a09e27c15cc16e52abb27d80649a1ab4f00f9f204d0f92b601fd995c42",
      globalLawfulReadinessArtifactSha256:
        "0e7c158f6e5d5a1c25452152319adca6a7330acd95b8cfeb979f29c0ad83515d",
      type6TrackBArtifactSha256:
        "501125fa7150a4d0c208cd4b40cd6a5132f7e04424820e71fd5f3219b165a16d",
      type6ZeroFourierCompiledArtifactSha256:
        "d3a45ffaca348ac8285387a71f15cbb4f2616516e12a03975c8a83c4e8388886",
      type6ConeApexArtifactSha256:
        "ae1421401348e90b977f96760bb268c48d92fda22eb96fa80bcdc7d1bedfd252",
      type6FullStarEquivalenceArtifactSha256:
        "95d83a53c83009ac148af9b7b878baa2a46316d74f0d1742401ab46caafe3107",
      type6FullStarCompiledArtifactSha256:
        "f776505a5c9d0ec92e002a0c5108ba0998c21982192d66d853f5366076e93d02",
      type6R2PeriodicRepairArtifactSha256:
        "7b535ff40e6ad1ff7e09a0df7109995242af38f190d401cc324e0c3e4e8f7630",
      type6R2MaximalCompiledArtifactSha256:
        "774468b8b6cc397651260e3151953d402766276503831e87b380f22dbcb3bcee",
      sheetResolvedWallFlipArtifactSha256:
        "e3e70174ff74f6cf50d20b66e90dc35f5b198bd918f1ab68a0c58b641215000e",
      sheetResolvedUnrestrictedArtifactSha256:
        "5b0c98e68841c9676c2d4011ac8f22b3672b719d81653c2b3f3d8d0886b4a205",
      titsRootOrbitArtifactSha256:
        "b665e1342db0df98d34497a908d7e9b1e04948cc7d2f580355d661c1dc719b11",
    });
    expect(artifact.conclusions.join(" ")).toContain(
      "no finite-action proof branch is recorded yet",
    );
    expect(replayFiberingResearchPortfolio(artifact, artifact)).toMatchObject({
      status: "passed",
      checks: {
        envelopeRecognized: true,
        artifactHashValid: true,
        componentBindingsMatch: true,
        policyMatches: true,
        artifactMatchesRebuild: true,
      },
    });
  });

  it("counts direct and scalable compact proof branches independently", () => {
    const components = testComponents();
    components.compact.targets[0].actions.push({
      summary: {
        directRankOneRunCount: 2,
        directRankOnePassedCount: 1,
        directRankOneFiberingCertificateCount: 1,
        scalableFullH1RunCount: 3,
        scalableFullH1PassedCount: 2,
        scalableFullH1FiberingCertificateCount: 1,
      },
    } as never);
    components.compact.artifactDigest = computeCompactResearchPortfolioDigest(
      components.compact,
    );
    expect(summarizeCompactResearchProofBranches(components.compact)).toEqual({
      execution: "independent",
      directRankOne: {
        runCount: 2,
        passedCount: 1,
        fiberingCertificateCount: 1,
      },
      scalableFullH1: {
        runCount: 3,
        passedCount: 2,
        fiberingCertificateCount: 1,
      },
    });
    expect(() => buildFiberingResearchPortfolio(components)).toThrow(
      /exact replay gate/,
    );
  });

  it("rejects a self-resealed component-binding substitution", () => {
    const rebuilt = buildFiberingResearchPortfolio(testComponents());
    const stored = structuredClone(rebuilt);
    stored.compactResearch.bytesSha256 = "d".repeat(64);
    stored.artifactHash = canonicalSha256(withoutArtifactHash(stored));

    const replay = replayFiberingResearchPortfolio(stored, rebuilt);
    expect(replay.status).toBe("failed");
    expect(replay.checks.artifactHashValid).toBe(true);
    expect(replay.checks.componentBindingsMatch).toBe(false);
    expect(replay.checks.artifactMatchesRebuild).toBe(false);
  });

  it("rejects a self-resealed envelope change and malformed input", () => {
    const rebuilt = buildFiberingResearchPortfolio(testComponents());
    const stored = structuredClone(rebuilt) as unknown as Record<
      string,
      unknown
    >;
    stored.status = "draft";
    stored.artifactHash = canonicalSha256(
      withoutArtifactHash(
        stored as unknown as FiberingResearchPortfolioArtifact,
      ),
    );

    expect(replayFiberingResearchPortfolio(stored, rebuilt)).toMatchObject({
      status: "failed",
      checks: { envelopeRecognized: false, artifactHashValid: true },
    });
    expect(replayFiberingResearchPortfolio({}, rebuilt).status).toBe("failed");
  });

  it("rejects stale replay digests and the former sixteen-link invariant", () => {
    const staleReplay = testComponents();
    staleReplay.compactReplay.replayDigest = "stale";
    expect(() => buildFiberingResearchPortfolio(staleReplay)).toThrow(
      /exact replay gate/,
    );

    const sixteenLinks = testComponents();
    sixteenLinks.jnw.npcAndDirectedLinks.vertexLinks = Array.from(
      { length: 8 },
      (_, vertex) => ({ vertex }),
    ) as never;
    sixteenLinks.jnw.artifactDigest =
      computeJnwCubePositiveControlArtifactDigest(sixteenLinks.jnw);
    expect(() => buildFiberingResearchPortfolio(sixteenLinks)).toThrow(
      /reviewed portfolio invariants/,
    );
  });

  it("rejects an incomplete cube motif-order-subdivision product", () => {
    const incomplete = testComponents();
    incomplete.cube.certificate.trials.pop();
    incomplete.cube.certificate.portfolio.trialCount -= 1;
    incomplete.cube.certificate.certificateDigest =
      computeCompactCubeBoundedRescueCertificateDigest(
        incomplete.cube.certificate,
      );
    incomplete.cube.artifactDigest = canonicalSha256({
      ...incomplete.cube,
      artifactDigest: "",
    });

    expect(() => buildFiberingResearchPortfolio(incomplete)).toThrow(
      /exact replay gate/,
    );
  });

  it("advances an all-subdivision-vertices survivor to topology checking", () => {
    const survivor = testComponents();
    survivor.cube.certificate.status = "all-subdivision-vertices-pass";
    survivor.cube.certificate.certificateDigest =
      computeCompactCubeBoundedRescueCertificateDigest(
        survivor.cube.certificate,
      );
    survivor.cube.artifactDigest = canonicalSha256({
      ...survivor.cube,
      artifactDigest: "",
    });

    expect(buildFiberingResearchPortfolio(survivor).cubeRescue.decision).toBe(
      "advance-global-survivor-to-track-b-topology-check",
    );
  });
});
