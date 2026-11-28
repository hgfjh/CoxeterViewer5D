import type {
  CompactResearchPortfolioArtifact,
  CompactResearchPortfolioReplay,
} from "./compactResearchPortfolio";
import {
  computeCompactResearchPortfolioDigest,
  replayCompactResearchPortfolio,
} from "./compactResearchPortfolio";
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
  schemaVersion: 2;
  kind: "fibering-research-portfolio";
  status: "passed";
  policy: {
    cubeRescueIsBounded: true;
    compactProofBranchesRunIndependently: true;
    compactDirectRankOneGatesScalableFullH1: false;
    compactScalableFullH1GatesDirectRankOne: false;
    compactP2UsesSeparateCoarsePlan: true;
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
  compactResearch: ResearchPortfolioFileBinding & {
    artifactDigest: string;
    replayDigest: string;
    orderedCampaignIds: string[];
    orderedTargetIds: string[];
    targetStatuses: Array<{ id: string; status: string }>;
    recordedActionCount: number;
    proofBranches: {
      execution: "independent";
      directRankOne: {
        runCount: number;
        passedCount: number;
        fiberingCertificateCount: number;
      };
      scalableFullH1: {
        runCount: number;
        passedCount: number;
        fiberingCertificateCount: number;
      };
    };
    p2Plan: {
      status: CompactResearchPortfolioArtifact["p2Plan"]["status"];
      runnable: boolean;
      missingSourceRoles: string[];
      explicitPrimitiveCharacterMaterialized: boolean;
      registeredPrimitiveClassCount: number;
      qIndependentPrimitiveClassCount: number;
      secondPrimitiveClassCheapScreenCompleted: boolean;
      secondPrimitiveClassObstructedForRecordedModel: boolean;
      secondPrimitiveClassGlobalTrackBOpen: boolean;
      fixedCharacterTrackBRunCompleted: boolean;
      fixedCharacterTrackBObstructedForRecordedModel: boolean;
      coarseFixedCharacterTrackBRunCompleted: boolean;
      coarseFixedCharacterTrackBObstructedForRecordedModel: boolean;
      strictWallTrackAInputIncomplete: boolean;
      currentCoverFullWallCoorientabilityKnown: boolean;
      currentCoverFullWallCoorientable: boolean;
      currentCoverStrictWallTrackABlocked: boolean;
      directCocycleTrackANotRun: boolean;
      finiteHeightBandNotRun: boolean;
      explicitPrimitiveCharacterWallTrackAObstructed: boolean;
      otherWallCharacterTrackAOpen: boolean;
      furtherCoverWallTrackAOpen: boolean;
      colorClassOnlyOrientationCoverOpen: boolean;
      facetSpecificOrientationCoverOpen: boolean;
      globalWallLawfulCalculationRun: boolean;
      type6TrackBAnchorRunCompleted: boolean;
      type6TrackBAnchorSurvived: boolean;
      type6TrackBGlobalScanRun: boolean;
      type6MaximalType5GlobalScreenCompleted: boolean;
      type6MaximalType5SurvivorCount: number;
      type6NonmaximalBarycentricLinksOpen: boolean;
      type6DeclaredHeightFamilyScreenCompleted: boolean;
      type6DeclaredHeightFamilyObstructed: boolean;
      type6DeclaredHeightFamilySurvivorCount: number;
      type6R2QuickGateSurvivorCount: number;
      type6R2MaximalType5ScreenCompleted: boolean;
      type6R2ProductScreenCompleted: boolean;
      type6R2ProductObstructed: boolean;
      type6R2ProductSurvivorCount: number;
      type6OtherPeriodicCoordinatesOpen: boolean;
      sheetResolvedRadius2SurvivorFrontier: boolean;
      sheetResolvedCompactRuleRejectedAtRadius2: boolean;
      sheetResolvedGlobalTrackAOpen: boolean;
      f9ExactImageOrderComputed: boolean;
      f9SubgroupImageDivisor: number;
      f9RootLineCandidateRejected: boolean;
      f9ExactDegreeOpen: boolean;
      f9GlobalFlipSearchOpen: boolean;
      positiveTrackACertificate: false;
      positiveTrackBCertificate: false;
      directCocycleTrackAOpen: boolean;
      conditionalMorseSearchComplete: false;
      primitiveCocycleCertificateSha256: string;
      primitiveCocycleScreeningPortfolioArtifactSha256: string;
      compressedTrackBArtifactSha256: string;
      coarseTrackBCertificateSha256: string;
      strictWallTrackACertificateSha256: string;
      wallCompatibilityArtifactSha256: string;
      wallCoorientationArtifactSha256: string;
      colorClassWallOrientationArtifactSha256: string;
      globalLawfulReadinessArtifactSha256: string;
      type6TrackBArtifactSha256: string;
      type6ZeroFourierCompiledArtifactSha256: string;
      type6ConeApexArtifactSha256: string;
      type6FullStarEquivalenceArtifactSha256: string;
      type6FullStarCompiledArtifactSha256: string;
      type6R2PeriodicRepairArtifactSha256: string;
      type6R2MaximalCompiledArtifactSha256: string;
      sheetResolvedWallFlipArtifactSha256: string;
      sheetResolvedUnrestrictedArtifactSha256: string;
      titsRootOrbitArtifactSha256: string;
      artifactDigest: string;
    };
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

export type CompactResearchProofBranchCounts =
  FiberingResearchPortfolioArtifact["compactResearch"]["proofBranches"];

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

/** Aggregate the two proof branches separately; neither count gates the other. */
export function summarizeCompactResearchProofBranches(
  compact: Pick<CompactResearchPortfolioArtifact, "targets">,
): CompactResearchProofBranchCounts {
  const actions = compact.targets.flatMap((target) => target.actions);
  const sum = (
    field:
      | "directRankOneRunCount"
      | "directRankOnePassedCount"
      | "directRankOneFiberingCertificateCount"
      | "scalableFullH1RunCount"
      | "scalableFullH1PassedCount"
      | "scalableFullH1FiberingCertificateCount",
  ): number =>
    actions.reduce((total, action) => total + action.summary[field], 0);
  return {
    execution: "independent",
    directRankOne: {
      runCount: sum("directRankOneRunCount"),
      passedCount: sum("directRankOnePassedCount"),
      fiberingCertificateCount: sum("directRankOneFiberingCertificateCount"),
    },
    scalableFullH1: {
      runCount: sum("scalableFullH1RunCount"),
      passedCount: sum("scalableFullH1PassedCount"),
      fiberingCertificateCount: sum("scalableFullH1FiberingCertificateCount"),
    },
  };
}

export function buildFiberingResearchPortfolio(options: {
  cube: CompactCubeRescuePortfolioComponent;
  cubeFile: ResearchPortfolioFileBinding;
  compact: CompactResearchPortfolioArtifact;
  compactFile: ResearchPortfolioFileBinding;
  compactReplay: CompactResearchPortfolioReplay;
  jnw: JnwCubePositiveControlCertificate;
  jnwFile: ResearchPortfolioFileBinding;
  jnwReplay: JnwCubePositiveControlReplay;
}): FiberingResearchPortfolioArtifact {
  const { cube, compact, jnw } = options;
  const rebuiltCompactReplay = replayCompactResearchPortfolio(compact);
  if (
    cube.replay.status !== "passed" ||
    !replayDigestValid(cube.replay) ||
    cube.runner.noGlobalNormalCatalogueLoaded !== true ||
    compact.status !== "research-manifest-recorded" ||
    options.compactReplay.status !== "passed" ||
    !replayDigestValid(options.compactReplay) ||
    rebuiltCompactReplay.status !== "passed" ||
    canonicalSha256(rebuiltCompactReplay) !==
      canonicalSha256(options.compactReplay) ||
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
    compact.artifactDigest !== computeCompactResearchPortfolioDigest(compact) ||
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
    compact.policy.proofBranchesRunIndependently !== true ||
    compact.policy.directRankOneGatesScalableFullH1 !== false ||
    compact.policy.scalableFullH1GatesDirectRankOne !== false ||
    compact.policy.p2UsesSeparateCoarsePlan !== true
  ) {
    throw new Error(
      "A component result no longer has the reviewed portfolio invariants.",
    );
  }
  const compactActions = compact.targets.flatMap((target) => target.actions);
  const proofBranches = summarizeCompactResearchProofBranches(compact);
  const { directRankOne, scalableFullH1 } = proofBranches;
  const compactActionConclusion =
    compactActions.length === 0
      ? `The compact registry records ${compact.registry.campaigns.length} campaigns and ${compact.targets.length} targets in registry order; no finite-action proof branch is recorded yet.`
      : `The compact registry records ${compactActions.length} finite actions with ${directRankOne.runCount} direct-rank-one and ${scalableFullH1.runCount} scalable-full-H1 runs, kept as independent proof branches.`;
  const withoutHash = {
    schemaVersion: 2 as const,
    kind: "fibering-research-portfolio" as const,
    status: "passed" as const,
    policy: {
      cubeRescueIsBounded: true as const,
      compactProofBranchesRunIndependently: true as const,
      compactDirectRankOneGatesScalableFullH1: false as const,
      compactScalableFullH1GatesDirectRankOne: false as const,
      compactP2UsesSeparateCoarsePlan: true as const,
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
    compactResearch: {
      ...options.compactFile,
      artifactDigest: compact.artifactDigest,
      replayDigest: options.compactReplay.replayDigest,
      orderedCampaignIds: compact.registry.campaigns.map(({ id }) => id),
      orderedTargetIds: compact.targets.map(({ definition }) => definition.id),
      targetStatuses: compact.targets.map(({ definition }) => ({
        id: definition.id,
        status: definition.status,
      })),
      recordedActionCount: compactActions.length,
      proofBranches,
      p2Plan: {
        status: compact.p2Plan.status,
        runnable: compact.p2Plan.importGate.runnable,
        missingSourceRoles: [...compact.p2Plan.importGate.missingRoles],
        explicitPrimitiveCharacterMaterialized:
          compact.p2Plan.conclusions.explicitPrimitiveCharacterMaterialized,
        registeredPrimitiveClassCount:
          compact.p2Plan.conclusions.registeredPrimitiveClassCount,
        qIndependentPrimitiveClassCount:
          compact.p2Plan.conclusions.qIndependentPrimitiveClassCount,
        secondPrimitiveClassCheapScreenCompleted:
          compact.p2Plan.conclusions.secondPrimitiveClassCheapScreenCompleted,
        secondPrimitiveClassObstructedForRecordedModel:
          compact.p2Plan.conclusions
            .secondPrimitiveClassObstructedForRecordedModel,
        secondPrimitiveClassGlobalTrackBOpen:
          compact.p2Plan.conclusions.secondPrimitiveClassGlobalTrackBOpen,
        fixedCharacterTrackBRunCompleted:
          compact.p2Plan.conclusions.fixedCharacterTrackBRunCompleted,
        fixedCharacterTrackBObstructedForRecordedModel:
          compact.p2Plan.conclusions
            .fixedCharacterTrackBObstructedForRecordedModel,
        coarseFixedCharacterTrackBRunCompleted:
          compact.p2Plan.conclusions.coarseFixedCharacterTrackBRunCompleted,
        coarseFixedCharacterTrackBObstructedForRecordedModel:
          compact.p2Plan.conclusions
            .coarseFixedCharacterTrackBObstructedForRecordedModel,
        strictWallTrackAInputIncomplete:
          compact.p2Plan.conclusions.strictWallTrackAInputIncomplete,
        currentCoverFullWallCoorientabilityKnown:
          compact.p2Plan.conclusions.currentCoverFullWallCoorientabilityKnown,
        currentCoverFullWallCoorientable:
          compact.p2Plan.conclusions.currentCoverFullWallCoorientable,
        currentCoverStrictWallTrackABlocked:
          compact.p2Plan.conclusions.currentCoverStrictWallTrackABlocked,
        directCocycleTrackANotRun:
          compact.p2Plan.conclusions.directCocycleTrackANotRun,
        finiteHeightBandNotRun:
          compact.p2Plan.conclusions.finiteHeightBandNotRun,
        explicitPrimitiveCharacterWallTrackAObstructed:
          compact.p2Plan.conclusions
            .explicitPrimitiveCharacterWallTrackAObstructed,
        otherWallCharacterTrackAOpen:
          compact.p2Plan.conclusions.otherWallCharacterTrackAOpen,
        furtherCoverWallTrackAOpen:
          compact.p2Plan.conclusions.furtherCoverWallTrackAOpen,
        colorClassOnlyOrientationCoverOpen:
          compact.p2Plan.conclusions.colorClassOnlyOrientationCoverOpen,
        facetSpecificOrientationCoverOpen:
          compact.p2Plan.conclusions.facetSpecificOrientationCoverOpen,
        globalWallLawfulCalculationRun:
          compact.p2Plan.conclusions.globalWallLawfulCalculationRun,
        type6TrackBAnchorRunCompleted:
          compact.p2Plan.conclusions.type6TrackBAnchorRunCompleted,
        type6TrackBAnchorSurvived:
          compact.p2Plan.conclusions.type6TrackBAnchorSurvived,
        type6TrackBGlobalScanRun:
          compact.p2Plan.conclusions.type6TrackBGlobalScanRun,
        type6MaximalType5GlobalScreenCompleted:
          compact.p2Plan.conclusions.type6MaximalType5GlobalScreenCompleted,
        type6MaximalType5SurvivorCount:
          compact.p2Plan.conclusions.type6MaximalType5SurvivorCount,
        type6NonmaximalBarycentricLinksOpen:
          compact.p2Plan.conclusions.type6NonmaximalBarycentricLinksOpen,
        type6DeclaredHeightFamilyScreenCompleted:
          compact.p2Plan.conclusions.type6DeclaredHeightFamilyScreenCompleted,
        type6DeclaredHeightFamilyObstructed:
          compact.p2Plan.conclusions.type6DeclaredHeightFamilyObstructed,
        type6DeclaredHeightFamilySurvivorCount:
          compact.p2Plan.conclusions.type6DeclaredHeightFamilySurvivorCount,
        type6R2QuickGateSurvivorCount:
          compact.p2Plan.conclusions.type6R2QuickGateSurvivorCount,
        type6R2MaximalType5ScreenCompleted:
          compact.p2Plan.conclusions.type6R2MaximalType5ScreenCompleted,
        type6R2ProductScreenCompleted:
          compact.p2Plan.conclusions.type6R2ProductScreenCompleted,
        type6R2ProductObstructed:
          compact.p2Plan.conclusions.type6R2ProductObstructed,
        type6R2ProductSurvivorCount:
          compact.p2Plan.conclusions.type6R2ProductSurvivorCount,
        type6OtherPeriodicCoordinatesOpen:
          compact.p2Plan.conclusions.type6OtherPeriodicCoordinatesOpen,
        sheetResolvedRadius2SurvivorFrontier:
          compact.p2Plan.conclusions.sheetResolvedRadius2SurvivorFrontier,
        sheetResolvedCompactRuleRejectedAtRadius2:
          compact.p2Plan.conclusions.sheetResolvedCompactRuleRejectedAtRadius2,
        sheetResolvedGlobalTrackAOpen:
          compact.p2Plan.conclusions.sheetResolvedGlobalTrackAOpen,
        f9ExactImageOrderComputed:
          compact.p2Plan.conclusions.f9ExactImageOrderComputed,
        f9SubgroupImageDivisor:
          compact.p2Plan.conclusions.f9SubgroupImageDivisor,
        f9RootLineCandidateRejected:
          compact.p2Plan.conclusions.f9RootLineCandidateRejected,
        f9ExactDegreeOpen: compact.p2Plan.conclusions.f9ExactDegreeOpen,
        f9GlobalFlipSearchOpen:
          compact.p2Plan.conclusions.f9GlobalFlipSearchOpen,
        positiveTrackACertificate:
          compact.p2Plan.conclusions.positiveTrackACertificate,
        positiveTrackBCertificate:
          compact.p2Plan.conclusions.positiveTrackBCertificate,
        directCocycleTrackAOpen:
          compact.p2Plan.conclusions.directCocycleTrackAOpen,
        conditionalMorseSearchComplete:
          compact.p2Plan.conclusions.conditionalMorseSearchComplete,
        primitiveCocycleCertificateSha256:
          compact.p2Plan.fixedCharacterEvidence.primitiveCocycle
            .certificateSha256,
        primitiveCocycleScreeningPortfolioArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence
            .primitiveCocycleScreeningPortfolio.artifactSha256,
        compressedTrackBArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.compressedTrackB.artifactSha256,
        coarseTrackBCertificateSha256:
          compact.p2Plan.fixedCharacterEvidence.coarseTrackB.certificateSha256,
        strictWallTrackACertificateSha256:
          compact.p2Plan.fixedCharacterEvidence.strictWallTrackA
            .certificateSha256,
        wallCompatibilityArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.wallCompatibility
            .artifactSha256,
        wallCoorientationArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.fullWallCoorientation
            .artifactSha256,
        colorClassWallOrientationArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.colorClassWallOrientation
            .artifactSha256,
        globalLawfulReadinessArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.globalLawfulReadiness
            .artifactSha256,
        type6TrackBArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.type6TrackB.artifactSha256,
        type6ZeroFourierCompiledArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.type6ZeroFourierCompiled
            .artifactSha256,
        type6ConeApexArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.type6ConeApex.artifactSha256,
        type6FullStarEquivalenceArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.type6FullStarEquivalence
            .artifactSha256,
        type6FullStarCompiledArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.type6FullStarCompiled
            .artifactSha256,
        type6R2PeriodicRepairArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.type6R2PeriodicRepair
            .artifactSha256,
        type6R2MaximalCompiledArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.type6R2MaximalCompiled
            .artifactSha256,
        sheetResolvedWallFlipArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.sheetResolvedWallFlipCegar
            .artifactSha256,
        sheetResolvedUnrestrictedArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.sheetResolvedWallFlipCegar
            .unrestrictedDepth2ArtifactSha256,
        titsRootOrbitArtifactSha256:
          compact.p2Plan.fixedCharacterEvidence.titsRootOrbitFrontier
            .artifactSha256,
        artifactDigest: compact.p2Plan.artifactDigest,
      },
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
      `The separate P2 coarse-coloring plan is ${compact.p2Plan.status}. Two Q-linearly independent primitive classes are registered, and the same cheap identity-first gauge rejects both only at its anchor. For the first class, exact full-star witnesses eliminate all 24 survivors and close the declared 128-candidate primitive type-6/Fourier height family. In the R2 product, the quick gates eliminate 344 of 384 pairs and leave 40 resurrected c=+1 pairs; the compiled maximal-type-5 continuation eliminates all 40. Strict wall Track A is unavailable on the current cover because its type-5 walls are one-sided. On the rank-312 orientation cover, exact sheet-component formulas support one unrestricted radius-two frontier survivor, but the compact seed fails at 96 vertices and the global branch remains open. None of these scoped calculations is a global P2 fibering obstruction.`,
      "The JNW rank-8 degree-four control passes the complete torsion-free, integral-H1, NPC/asphericity, directed-link, and PL-Morse pipeline.",
    ],
    nonClaims: [
      "A bounded cube-rescue failure is not a BNS or non-fibering theorem.",
      "The compact registry and capacity audits do not assert that a torsion-free action at a listed degree exists.",
      "The P2 fixed-model failure does not obstruct its primitive character, other gauges, orders, subdivisions, classes, or covers, and is not evidence against algebraic or smooth fibering.",
      "The P2 full-star obstruction is scoped to one primitive character, its declared 128 signed-power type-potential family, and the canonical barycentric subdivision; other characters, gauges, and subdivisions remain open.",
      "The P2 R2 chain closes the full 128-by-3 product only for one quotient-periodic coordinate, the certified action and primitive character, and the canonical barycentric subdivision. Other periodic coordinates, coefficient families, characters, gauges, subdivisions, and Track B remain open.",
      "The second exact primitive class fails only the same cheap identity-first anchor gauge; it has not undergone a global Track B scan, and the two registered classes are not a full integral H1 basis.",
      "P2 has only a source-bound Track A availability record: existing exact evidence fails the current cover at two-sidedness, no rank-two complex is manufactured, and the rank-312 result is only a finite original-vertex/rank-two frontier.",
      "The P2 sheet-resolved assignment passes only a finite original-vertex/rank-two frontier. It has not passed global compatibility, higher lawful closure, subdivision-vertex links, or the finite-height-band gate.",
      "The exact P2 F9 image order does not determine the orientation-cover degree: only a divisor 40 of the Section-5 subgroup image is known. The recorded root-line candidate fails, and actual quotient wall components and global flips remain open.",
      "The P2 wall-span obstruction applies only to the explicit primitive character; it is not a general Track A obstruction. Direct-cocycle Track A and the finite-height-band gate were not run.",
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
      stored.schemaVersion === 2 &&
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
        compactResearch: stored.compactResearch,
        jnwPositiveControl: stored.jnwPositiveControl,
      }) ===
      canonicalSha256({
        cubeRescue: rebuilt.cubeRescue,
        compactResearch: rebuilt.compactResearch,
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
