import { describe, expect, it } from "vitest";

import type {
  CompactActionPortfolioArtifact,
  CompactActionPortfolioReplay,
} from "../src/fibering/compactActionPortfolio";
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

  const compact = {
    schemaVersion: 1,
    kind: "compact-h5-fibering-action-portfolio",
    generatedAt: "2026-08-22T00:00:00.000Z",
    status: "passed",
    policy: {
      order: [
        "source-certification",
        "spherical-planning",
        "torsion-free-action",
        "integral-h1-wall-saturation",
        "cheap-link-screen",
        "generalized-compression",
        "exact-chamber-arrangement",
      ],
      b1ZeroAction: "deprioritize",
      expensiveConstructionRule: "survivors only",
      excludedTarget: "tumarkin-g12221",
    },
    p0P1Double: { kernelIndex: 2 },
    targets: [
      "makarov-p0",
      "makarov-p1",
      "tumarkin-g11411-15",
      "tumarkin-g11411-04",
    ].map((id) => ({ id, disposition: "ready-for-torsion-free-search" })),
    artifactHash: "",
  } as unknown as CompactActionPortfolioArtifact;
  compact.artifactHash = canonicalSha256(
    Object.fromEntries(
      Object.entries(compact).filter(([key]) => key !== "artifactHash"),
    ),
  );
  const compactReplay = sealReplay({
    status: "passed" as const,
    checks: {},
    errors: [],
  }) as unknown as CompactActionPortfolioReplay;

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
    expect(artifact.jnwPositiveControl.directedLinkCount).toBe(8);
    expect(artifact.conclusions.join(" ")).toContain(
      "no new compact action has yet been materialized",
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

  it("updates the compact conclusion when a materialized action is present", () => {
    const components = testComponents();
    components.compact.targets[0].evidence = {
      torsionFree: { status: "passed" },
    };
    components.compact.artifactHash = canonicalSha256(
      Object.fromEntries(
        Object.entries(components.compact).filter(
          ([key]) => key !== "artifactHash",
        ),
      ),
    );
    const artifact = buildFiberingResearchPortfolio(components);
    expect(artifact.conclusions.join(" ")).toContain(
      "Materialized torsion-free compact action evidence is present for makarov-p0",
    );
    expect(artifact.conclusions.join(" ")).not.toContain(
      "no new compact action",
    );
  });

  it("rejects a self-resealed component-binding substitution", () => {
    const rebuilt = buildFiberingResearchPortfolio(testComponents());
    const stored = structuredClone(rebuilt);
    stored.cubeRescue.bytesSha256 = "d".repeat(64);
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
