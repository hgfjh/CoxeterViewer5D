import type {
  CompactActionPortfolioArtifact,
  CompactActionPortfolioReplay,
  CompactPortfolioStageId,
} from "./compactActionPortfolio";
import {
  CUBE_RESCUE_CERTIFIED_LOCAL_POINTS,
  CUBE_RESCUE_PRODUCTION_ORDER_KINDS,
  CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES,
  computeCompactCubeBoundedRescueCertificateDigest,
  type CompactCubeBoundedRescueCertificate,
  type CompactCubeBoundedRescueReplay,
} from "./cubeRescueCertificate";
import {
  computeJnwCubePositiveControlArtifactDigest,
  type JnwCubePositiveControlCertificate,
  type JnwCubePositiveControlReplay,
} from "./jnwCubePositiveControl";
import { canonicalSha256 } from "../utils/canonicalSha256";

export interface ResearchPortfolioFileBinding {
  path: string;
  bytesSha256: string;
}

export interface CompactCubeRescuePortfolioComponent {
  certificate: CompactCubeBoundedRescueCertificate;
  replay: CompactCubeBoundedRescueReplay;
  runner: { noGlobalNormalCatalogueLoaded: true };
  artifactDigest: string;
}

export interface FiberingResearchPortfolioArtifact {
  schemaVersion: 1;
  kind: "fibering-research-portfolio";
  status: "passed";
  policy: {
    cubeRescueIsBounded: true;
    compactPromotionOrder: CompactPortfolioStageId[];
    compactB1ZeroAction: "deprioritize";
    expensiveCompactStagesRequireCheapSurvivor: true;
    globalNormalCatalogueRerunForbidden: true;
  };
  cubeRescue: ResearchPortfolioFileBinding & {
    runnerArtifactDigest: string;
    certificateDigest: string;
    replayDigest: string;
    status: CompactCubeBoundedRescueCertificate["status"];
    extractedMotifCount: number;
    selectedMotifCount: number;
    trialCount: number;
    localConnectorCount: number;
    originalVertexPassCount: number;
    noGlobalNormalCatalogueLoaded: true;
    decision:
      | "archive-current-action-as-benchmark"
      | "archive-current-action-as-benchmark-with-local-connectors"
      | "advance-global-survivor-to-track-b-topology-check"
      | "reject-nonproduction-rescue-artifact";
  };
  compactActions: ResearchPortfolioFileBinding & {
    artifactHash: string;
    replayDigest: string;
    orderedTargetIds: string[];
    dispositions: Array<{ id: string; disposition: string }>;
    exactP0P1Index: 2;
    excludedTarget: "tumarkin-g12221";
  };
  jnwPositiveControl: ResearchPortfolioFileBinding & {
    artifactDigest: string;
    replayDigest: string;
    subgroupIndex: 4;
    h1IsomorphicTo: "Z^6";
    directedLinkCount: 8;
    universalCoverContractible: true;
    virtualAlgebraicFibration: true;
  };
  conclusions: string[];
  nonClaims: string[];
  artifactHash: string;
}

export interface FiberingResearchPortfolioReplay {
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    artifactHashValid: boolean;
    componentBindingsMatch: boolean;
    policyMatches: boolean;
    artifactMatchesRebuild: boolean;
  };
  errors: string[];
  replayDigest: string;
}

const COMPACT_PROMOTION_ORDER: readonly CompactPortfolioStageId[] = [
  "source-certification",
  "spherical-planning",
  "torsion-free-action",
  "integral-h1-wall-saturation",
  "cheap-link-screen",
  "generalized-compression",
  "exact-chamber-arrangement",
] as const;

const COMPACT_TARGET_ORDER = [
  "makarov-p0",
  "makarov-p1",
  "tumarkin-g11411-15",
  "tumarkin-g11411-04",
] as const;

function withoutKey<T extends Record<string, unknown>>(
  value: T,
  key: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== key),
  );
}

function digestFieldValid(
  value: Record<string, unknown>,
  field: string,
): boolean {
  return (
    typeof value[field] === "string" &&
    value[field] === canonicalSha256(withoutKey(value, field))
  );
}

function replayDigestValid(value: { replayDigest: string }): boolean {
  return digestFieldValid(
    value as unknown as Record<string, unknown>,
    "replayDigest",
  );
}

function fileBindingValid(binding: ResearchPortfolioFileBinding): boolean {
  return (
    binding.path.length > 0 &&
    !binding.path.includes("\\") &&
    /^[0-9a-f]{64}$/u.test(binding.bytesSha256)
  );
}

function cubeTrialKey(
  motifId: string,
  orderKind: string,
  subdivisionFamily: string,
): string {
  return canonicalSha256([motifId, orderKind, subdivisionFamily]);
}

function cubePortfolioComplete(
  certificate: CompactCubeBoundedRescueCertificate,
): boolean {
  const { motifExtraction, portfolio, selectedMotifIds, trials } = certificate;
  const expectedCensus = [
    { point: 2, count: 13 },
    { point: 4, count: 5 },
    { point: 27, count: 20 },
  ];
  if (
    motifExtraction.terminalPruneCount !== 38 ||
    motifExtraction.motifs.length !== 38 ||
    selectedMotifIds.length !== 38 ||
    new Set(selectedMotifIds).size !== 38 ||
    canonicalSha256(motifExtraction.pointCensus) !==
      canonicalSha256(expectedCensus) ||
    canonicalSha256(portfolio.orderKinds) !==
      canonicalSha256(CUBE_RESCUE_PRODUCTION_ORDER_KINDS) ||
    canonicalSha256(portfolio.subdivisionFamilies) !==
      canonicalSha256(CUBE_RESCUE_PRODUCTION_SUBDIVISION_FAMILIES) ||
    canonicalSha256(portfolio.localPointIds) !==
      canonicalSha256(CUBE_RESCUE_CERTIFIED_LOCAL_POINTS) ||
    certificate.checks.allSeparatorLeavesExtracted !== true ||
    certificate.checks.allSeparatorMotifsSelected !== true ||
    certificate.checks.productionCartesianPortfolioComplete !== true ||
    certificate.checks.onlyThreeCertifiedMotifPointsUsed !== true ||
    certificate.checks.noGlobalNormalCatalogueRecomputed !== true
  ) {
    return false;
  }
  const expected = new Set<string>();
  for (const motifId of selectedMotifIds) {
    for (const orderKind of portfolio.orderKinds) {
      for (const subdivisionFamily of portfolio.subdivisionFamilies) {
        expected.add(cubeTrialKey(motifId, orderKind, subdivisionFamily));
      }
    }
  }
  const recorded = new Set(
    trials.map((trial) =>
      cubeTrialKey(
        trial.sourceMotifId,
        trial.orderKind,
        trial.subdivisionFamily,
      ),
    ),
  );
  return (
    portfolio.trialCount === trials.length &&
    trials.length === expected.size &&
    recorded.size === trials.length &&
    canonicalSha256([...recorded].sort()) ===
      canonicalSha256([...expected].sort())
  );
}

function cubeDecision(
  status: CompactCubeBoundedRescueCertificate["status"],
): FiberingResearchPortfolioArtifact["cubeRescue"]["decision"] {
  if (status === "benchmark-archive") {
    return "archive-current-action-as-benchmark";
  }
  if (status === "local-connectors-only") {
    return "archive-current-action-as-benchmark-with-local-connectors";
  }
  if (status === "all-subdivision-vertices-pass") {
    return "advance-global-survivor-to-track-b-topology-check";
  }
  return "reject-nonproduction-rescue-artifact";
}

export function buildFiberingResearchPortfolio(options: {
  cube: CompactCubeRescuePortfolioComponent;
  cubeFile: ResearchPortfolioFileBinding;
  compact: CompactActionPortfolioArtifact;
  compactFile: ResearchPortfolioFileBinding;
  compactReplay: CompactActionPortfolioReplay;
  jnw: JnwCubePositiveControlCertificate;
  jnwFile: ResearchPortfolioFileBinding;
  jnwReplay: JnwCubePositiveControlReplay;
}): FiberingResearchPortfolioArtifact {
  const { cube, compact, jnw } = options;
  if (
    cube.replay.status !== "passed" ||
    !replayDigestValid(cube.replay) ||
    cube.runner.noGlobalNormalCatalogueLoaded !== true ||
    compact.status !== "passed" ||
    options.compactReplay.status !== "passed" ||
    !replayDigestValid(options.compactReplay) ||
    jnw.status !== "passed" ||
    !options.jnwReplay.valid ||
    !replayDigestValid(options.jnwReplay) ||
    !jnw.checks.theoremInferencePassed ||
    !cubePortfolioComplete(cube.certificate) ||
    !fileBindingValid(options.cubeFile) ||
    !fileBindingValid(options.compactFile) ||
    !fileBindingValid(options.jnwFile)
  ) {
    throw new Error(
      "A component portfolio artifact did not pass its exact replay gate.",
    );
  }
  if (
    cube.artifactDigest !== canonicalSha256({ ...cube, artifactDigest: "" }) ||
    cube.certificate.certificateDigest !==
      computeCompactCubeBoundedRescueCertificateDigest(cube.certificate) ||
    compact.artifactHash !==
      canonicalSha256(
        withoutKey(
          compact as unknown as Record<string, unknown>,
          "artifactHash",
        ),
      ) ||
    jnw.artifactDigest !== computeJnwCubePositiveControlArtifactDigest(jnw)
  ) {
    throw new Error(
      "A component portfolio artifact has a stale canonical digest.",
    );
  }
  const directedLinkCount = jnw.npcAndDirectedLinks.vertexLinks.length * 2;
  if (
    jnw.theorem.result.subgroupIndex !== 4 ||
    jnw.theorem.result.h1IsomorphicTo !== "Z^6" ||
    directedLinkCount !== 8 ||
    !jnw.npcAndDirectedLinks.checks.universalCoverContractible ||
    !jnw.theorem.result.virtualAlgebraicFibration ||
    compact.p0P1Double.kernelIndex !== 2 ||
    compact.policy.b1ZeroAction !== "deprioritize" ||
    compact.policy.excludedTarget !== "tumarkin-g12221" ||
    canonicalSha256(compact.policy.order) !==
      canonicalSha256(COMPACT_PROMOTION_ORDER) ||
    canonicalSha256(compact.targets.map(({ id }) => id)) !==
      canonicalSha256(COMPACT_TARGET_ORDER)
  ) {
    throw new Error(
      "A component result no longer has the reviewed portfolio invariants.",
    );
  }
  const materializedCompactTargets = compact.targets.filter(
    (target) => target.evidence?.torsionFree?.status === "passed",
  );
  const compactActionConclusion =
    materializedCompactTargets.length === 0
      ? "P0, P1, Tumarkin G11411 #15, and G11411 #04 are source-bound and ordered for action discovery; no new compact action has yet been materialized for the registered bounded post-action stages."
      : `Materialized torsion-free compact action evidence is present for ${materializedCompactTargets.map((target) => target.id).join(", ")}; each target's recorded post-action disposition is bound into this aggregate.`;
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "fibering-research-portfolio" as const,
    status: "passed" as const,
    policy: {
      cubeRescueIsBounded: true as const,
      compactPromotionOrder: [...compact.policy.order],
      compactB1ZeroAction: compact.policy.b1ZeroAction,
      expensiveCompactStagesRequireCheapSurvivor: true as const,
      globalNormalCatalogueRerunForbidden: true as const,
    },
    cubeRescue: {
      ...options.cubeFile,
      runnerArtifactDigest: cube.artifactDigest,
      certificateDigest: cube.certificate.certificateDigest,
      replayDigest: cube.replay.replayDigest,
      status: cube.certificate.status,
      extractedMotifCount: cube.certificate.motifExtraction.terminalPruneCount,
      selectedMotifCount: cube.certificate.selectedMotifIds.length,
      trialCount: cube.certificate.portfolio.trialCount,
      localConnectorCount: cube.certificate.portfolio.localConnectorCount,
      originalVertexPassCount:
        cube.certificate.portfolio.originalVertexPassCount,
      noGlobalNormalCatalogueLoaded: true as const,
      decision: cubeDecision(cube.certificate.status),
    },
    compactActions: {
      ...options.compactFile,
      artifactHash: compact.artifactHash,
      replayDigest: options.compactReplay.replayDigest,
      orderedTargetIds: compact.targets.map(({ id }) => id),
      dispositions: compact.targets.map(({ id, disposition }) => ({
        id,
        disposition,
      })),
      exactP0P1Index: 2 as const,
      excludedTarget: compact.policy.excludedTarget,
    },
    jnwPositiveControl: {
      ...options.jnwFile,
      artifactDigest: jnw.artifactDigest,
      replayDigest: options.jnwReplay.replayDigest,
      subgroupIndex: 4 as const,
      h1IsomorphicTo: "Z^6" as const,
      directedLinkCount: 8 as const,
      universalCoverContractible: true as const,
      virtualAlgebraicFibration: true as const,
    },
    conclusions: [
      `The existing cube action ended its single bounded rescue with status ${cube.certificate.status}.`,
      compactActionConclusion,
      "The JNW rank-8 degree-four control passes the complete torsion-free, integral-H1, NPC/asphericity, directed-link, and PL-Morse pipeline.",
    ],
    nonClaims: [
      "A bounded cube-rescue failure is not a BNS or non-fibering theorem.",
      "The compact-target preflight does not assert that a torsion-free action at the necessary degree divisor exists.",
      "The JNW control is a two-dimensional RACG Davis-complex example, not a compact hyperbolic 5-polytope.",
    ],
  };
  return { ...withoutHash, artifactHash: canonicalSha256(withoutHash) };
}

export function replayFiberingResearchPortfolio(
  storedInput: unknown,
  rebuilt: FiberingResearchPortfolioArtifact,
): FiberingResearchPortfolioReplay {
  const checks: FiberingResearchPortfolioReplay["checks"] = {
    envelopeRecognized: false,
    artifactHashValid: false,
    componentBindingsMatch: false,
    policyMatches: false,
    artifactMatchesRebuild: false,
  };
  const replayErrors: string[] = [];
  try {
    if (typeof storedInput !== "object" || storedInput === null) {
      throw new Error("The aggregate portfolio is not an object.");
    }
    const stored = storedInput as FiberingResearchPortfolioArtifact;
    checks.envelopeRecognized =
      stored.schemaVersion === 1 &&
      stored.kind === "fibering-research-portfolio" &&
      stored.status === "passed";
    checks.artifactHashValid =
      typeof stored.artifactHash === "string" &&
      stored.artifactHash ===
        canonicalSha256(
          withoutKey(
            stored as unknown as Record<string, unknown>,
            "artifactHash",
          ),
        );
    checks.componentBindingsMatch =
      canonicalSha256({
        cubeRescue: stored.cubeRescue,
        compactActions: stored.compactActions,
        jnwPositiveControl: stored.jnwPositiveControl,
      }) ===
      canonicalSha256({
        cubeRescue: rebuilt.cubeRescue,
        compactActions: rebuilt.compactActions,
        jnwPositiveControl: rebuilt.jnwPositiveControl,
      });
    checks.policyMatches =
      canonicalSha256({
        policy: stored.policy,
        conclusions: stored.conclusions,
        nonClaims: stored.nonClaims,
      }) ===
      canonicalSha256({
        policy: rebuilt.policy,
        conclusions: rebuilt.conclusions,
        nonClaims: rebuilt.nonClaims,
      });
    checks.artifactMatchesRebuild =
      canonicalSha256(
        withoutKey(
          stored as unknown as Record<string, unknown>,
          "artifactHash",
        ),
      ) ===
      canonicalSha256(
        withoutKey(
          rebuilt as unknown as Record<string, unknown>,
          "artifactHash",
        ),
      );
  } catch (error) {
    replayErrors.push(error instanceof Error ? error.message : String(error));
  }
  const errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => `${name} failed.`)
    .concat(replayErrors);
  const status = errors.length === 0 ? "passed" : "failed";
  const withoutDigest = {
    status: status as "passed" | "failed",
    checks,
    errors,
  };
  return { ...withoutDigest, replayDigest: canonicalSha256(withoutDigest) };
}
