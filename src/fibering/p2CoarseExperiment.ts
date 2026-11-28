import { canonicalSha256 } from "../utils/canonicalSha256";
import bundledImportCertificateJson from "../../scripts/certificates/portfolio/makarov_p2_section5_import.json";
import bundledPrimitiveCocycleJson from "../../scripts/certificates/portfolio/makarov_p2_section5_x_primitive_cocycle.json";
import bundledCompressedTrackBJson from "../../scripts/certificates/portfolio/makarov_p2_section5_compressed_track_b.json";
import bundledCoarseTrackBJson from "../../scripts/certificates/portfolio/makarov_p2_section5_coarse_track_b.json";
import bundledGeneralizedTrackAJson from "../../scripts/certificates/portfolio/makarov_p2_section5_generalized_track_a_attempt.json";
import bundledWallCompatibilityJson from "../../scripts/certificates/portfolio/makarov_p2_section5_wall_compatibility.json";
import bundledWallCoorientationJson from "../../scripts/certificates/portfolio/makarov_p2_section5_wall_coorientation_obstruction.json";
import bundledColorClassWallOrientationJson from "../../scripts/certificates/portfolio/makarov_p2_section5_color_class_wall_orientation.json";
import bundledGlobalLawfulReadinessJson from "../../scripts/certificates/portfolio/makarov_p2_factored_global_lawful_readiness.json";
import bundledType6TrackBJson from "../../scripts/certificates/portfolio/makarov_p2_type6_wall_track_b.json";
import bundledType6BarycentricReductionJson from "../../scripts/certificates/portfolio/makarov_p2_type6_barycentric_reduction.json";
import bundledFacetBinaryOrientationJson from "../../scripts/certificates/portfolio/makarov_p2_facet_binary_orientation_cover.json";
import bundledWallFlipCegarJson from "../../scripts/certificates/portfolio/makarov_p2_wall_flip_cegar.json";
import bundledSheetResolvedWallFlipJson from "../../scripts/certificates/portfolio/makarov_p2_sheet_resolved_wall_flip_cegar.json";
import bundledSheetResolvedWallFlipUnrestrictedJson from "../../scripts/certificates/portfolio/makarov_p2_sheet_resolved_wall_flip_cegar_unrestricted_depth2.json";
import bundledTitsOrientationJson from "../../scripts/certificates/portfolio/makarov_p2_tits_orientation_cover.json";
import bundledTitsRootOrbitJson from "../../scripts/certificates/portfolio/makarov_p2_tits_root_orbit_frontier.json";
import bundledType6FourierFrameScreenJson from "../../scripts/certificates/portfolio/makarov_p2_type6_fourier_frame_screen_timeout.json";
import bundledLqSchreierTableJson from "../../scripts/certificates/portfolio/makarov_p2_lq_schreier_table.json";
import bundledType6SchreierChamberScreenJson from "../../scripts/certificates/portfolio/makarov_p2_type6_fourier_schreier_chamber_screen.json";
import bundledType6MaximalType5TimeoutJson from "../../scripts/certificates/portfolio/makarov_p2_type6_maximal_type5_global_timeout.json";
import bundledType6ZeroFourierCompiledJson from "../../scripts/certificates/portfolio/makarov_p2_type6_zero_fourier_compiled.json";
import bundledType6ConeApexJson from "../../scripts/certificates/portfolio/makarov_p2_type6_cone_apex_lemma.json";
import bundledType6FullStarEquivalenceJson from "../../scripts/certificates/portfolio/makarov_p2_type6_full_star_equivalence.json";
import bundledType6FullStarCompiledJson from "../../scripts/certificates/portfolio/makarov_p2_type6_full_star_compiled.json";
import bundledType6R2PeriodicRepairJson from "../../scripts/certificates/portfolio/makarov_p2_type6_r2_periodic_repair.json";
import bundledType6R2MaximalCompiledJson from "../../scripts/certificates/portfolio/makarov_p2_type6_r2_maximal_compiled.json";
import bundledCocycleScreeningPortfolioJson from "../../scripts/certificates/portfolio/makarov_p2_cocycle_screening_portfolio.json";

export const P2_COARSE_REQUIRED_SOURCE_ROLES = [
  "paper-v2",
  "p2-coxeter-input",
  "section-5-coarse-incidence",
  "section-5-coloring-data",
] as const;

export type P2CoarseSourceRole =
  (typeof P2_COARSE_REQUIRED_SOURCE_ROLES)[number];

export interface P2CoarseSourceBinding {
  role: P2CoarseSourceRole;
  /** Repository path or versioned public locator for the exact imported bytes. */
  locator: string;
  bytesSha256: string;
  format:
    | "arxiv-source-archive"
    | "coxeter-system-json"
    | "p2-section-5-coarse-incidence"
    | "p2-section-5-coloring-data";
}

export interface P2CoarseExperimentPlan {
  schemaVersion: 1;
  kind: "p2-coarse-coloring-experiment-plan";
  status:
    | "blocked-missing-imports"
    | "ready-for-exact-import-replay"
    | "bundled-import-replayed-positive-h1-gate"
    | "bundled-fixed-character-screened";
  paper: {
    sourceId: "arXiv:2502.19225v2";
    url: "https://arxiv.org/abs/2502.19225v2";
    locators: {
      prism: "Section 1";
      publishedFirstHomology: "Section 4.3";
      alternativeConstruction: "Sections 5.2-5.3";
    };
  };
  paperSupportedFacts: {
    coxeterPrism: "P2-[5,3,3,3,4]";
    p2PrismsPer120CellPrism: 14_400;
    publishedFamilies: {
      names: ["N_i,I^+/-", "Mhat_i,I^+/-"];
      firstBettiNumber: 0;
      disposition: "known-b1-zero-not-fibering-candidates";
    };
    alternativeSection5: {
      xDimension: 4;
      x120CellCount: 650;
      xIntegralH1: "Z^144";
      xIntegralH1FreeRank: 144;
      closedColoredFiveManifoldB1: "not-computed-in-paper";
    };
  };
  sourceBindings: P2CoarseSourceBinding[];
  sourceBundleDigest: string;
  importGate: {
    requiredRoles: P2CoarseSourceRole[];
    missingRoles: P2CoarseSourceRole[];
    allRequiredExactSourcesBound: boolean;
    runnable: boolean;
    runnableScope: "exact-import-incidence-coloring-and-h1-gate";
  };
  importCertificate: {
    locator: "scripts/certificates/portfolio/makarov_p2_section5_import.json";
    bytesSha256: string;
    certificateSha256: string;
    sealValid: boolean;
    sourceBindingsMatch: boolean;
    allFiniteFieldAndColoringChecksPassed: boolean;
    replayStatus:
      | "not-applicable-unrecognized-bundle"
      | "passed-bundled-certificate";
  };
  integralH1Gate: {
    status: "blocked-import-not-replayed" | "passed-positive";
    baseFourManifoldIntegralH1: "source-reported-Z^144";
    baseHomologyEvidenceKind: "source-reported-exact-HAP-output";
    inferenceKind: "repository-derived-retraction-inference";
    closedFiveManifoldFreeRankLowerBound: 0 | 144;
    nonzeroIntegralCharacterExists: boolean;
    primitiveIntegralCharacterExists: boolean;
    fullIntegralH1: "not-computed";
    explicitPrimitiveCharacterMaterialized: boolean;
    fullCharacterLatticeMaterialized: false;
    independentH1Replay:
      | "not-applicable-unrecognized-bundle"
      | "not-completed-resource-and-tooling-limit";
  };
  fixedCharacterEvidence: {
    primitiveCocycle: {
      locator: "scripts/certificates/portfolio/makarov_p2_section5_x_primitive_cocycle.json";
      bytesSha256: string;
      certificateSha256: string;
      sealValid: boolean;
      importBindingMatches: boolean;
      exactTriangleClosure: boolean;
      treeGaugeReplayed: boolean;
      primitiveCycleWitnessReplayed: boolean;
    };
    primitiveCocycleScreeningPortfolio: {
      locator: "scripts/certificates/portfolio/makarov_p2_cocycle_screening_portfolio.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      importBindingMatches: boolean;
      status:
        | "not-replayed"
        | "two-independent-primitive-classes-cheap-screened";
      registeredCandidateCount: number;
      primitiveClassCount: number;
      exactTriangleCountEach: number;
      qLinearlyIndependent: boolean;
      independenceWitnessGenerator: number;
      bothCheapAnchorScreensObstructed: boolean;
      fullCharacterLatticeMaterialized: false;
      globalTrackBScreenRun: boolean;
      otherGaugesRemainOpen: boolean;
    };
    compressedTrackB: {
      locator: "scripts/certificates/portfolio/makarov_p2_section5_compressed_track_b.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      primitiveCocycleBindingMatches: boolean;
      status: "not-replayed" | "fixed-model-obstructed-at-anchor";
      rootedStateUnionCount: number;
      bothTiePolaritiesRejectedAtIdentity: boolean;
      globalAllVertexScanNeededForRecordedModel: boolean;
    };
    coarseTrackB: {
      locator: "scripts/certificates/portfolio/makarov_p2_section5_coarse_track_b.json";
      bytesSha256: string;
      certificateSha256: string;
      sealValid: boolean;
      primitiveCocycleBindingMatches: boolean;
      status: "not-replayed" | "fixed-model-obstructed-at-root";
      bothCanonicalPerturbationPolaritiesRejectedAtRoot: boolean;
      coloredRootCopiesCovered: number;
      globalAllVertexScanCompleted: false;
    };
    strictWallTrackA: {
      locator: "scripts/certificates/portfolio/makarov_p2_section5_generalized_track_a_attempt.json";
      bytesSha256: string;
      certificateSha256: string;
      sealValid: boolean;
      primitiveCocycleBindingMatches: boolean;
      wallCompatibilityBindingMatches: boolean;
      status:
        | "not-replayed"
        | "explicit-character-obstructed-other-variants-incomplete";
      strictWallTrackAInputIncomplete: boolean;
      directCocycleTrackANotRun: boolean;
      finiteHeightBandNotRun: boolean;
      missingRequiredObjectCount: number;
      formerTrackBRootObstructionRepairedByLocalPotential: boolean;
      globalDirectedLinksChecked: false;
    };
    wallCompatibility: {
      locator: "scripts/certificates/portfolio/makarov_p2_section5_wall_compatibility.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      primitiveCocycleBindingMatches: boolean;
      status: "not-replayed" | "explicit-character-not-in-rational-wall-span";
      rationalWallSpanContainsExplicitCharacter: boolean;
      gaugeIndependent: boolean;
      periodicPotentialCanRepair: boolean;
      saturationCanRepair: boolean;
      sectionPullbackPrimitiveReplayed: boolean;
      importAndIncidenceCrossBindingReplayed: boolean;
      differentWallCharacterTrackAOpen: true;
      directCocycleTrackAOpen: true;
    };
    fullWallCoorientation: {
      locator: "scripts/certificates/portfolio/makarov_p2_section5_wall_coorientation_obstruction.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "full-wall-system-not-coorientable";
      labelsPassingFullSpanTest: number;
      everyType5WallComponentOneSided: boolean;
      fullWallSystemCoorientable: boolean;
      explicitReversingLoopReplayed: boolean;
      type6WallCount: number;
      type6WallsTwoSided: boolean;
      type6PartialCocycleStrictTrackAAdmissible: boolean;
      directCocycleTrackAUnaffected: boolean;
      furtherCoverRemainsOpen: boolean;
    };
    colorClassWallOrientation: {
      locator: "scripts/certificates/portfolio/makarov_p2_section5_color_class_wall_orientation.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "color-class-only-orientation-covers-obstructed";
      minimalColorClassExtensionIndex: number;
      minimalExtensionRepairsType5Obstruction: boolean;
      projectedSideWallClassCount: number;
      projectedSideWallConflictCount: number;
      anyColorClassOnlyVoltageExtensionCanHaveFullWallCoorientation: boolean;
      lawfulCellClosureDefinedForTheseCovers: boolean;
      directedLinkCalculationRun: boolean;
      facetSpecificCoverRemainsOpen: boolean;
      oddPrimeCoverRemainsOpen: boolean;
    };
    globalLawfulReadiness: {
      locator: "scripts/certificates/portfolio/makarov_p2_factored_global_lawful_readiness.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status:
        | "not-replayed"
        | "downstream-not-run-no-wall-coorientation-on-current-cover";
      wallCoorientationBindingMatches: boolean;
      colorClassWallOrientationBindingMatches: boolean;
      lawfulClosureAndDirectedLinksDefined: boolean;
      runOnCurrentCover: boolean;
      unreducedCellCount: number;
      sheetInvariantTemplateCount: number;
      sheetInvariantRankTwoTemplateCount: number;
      conditionalHeightRuleFaceCompatible: boolean;
    };
    type6TrackB: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_wall_track_b.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "primitive-cocycle-one-identity-polarity-passed";
      wallCocycleClosed: boolean;
      wallCocycleTwoSided: boolean;
      primitiveIntegralCharacter: boolean;
      primitiveLoopEvaluation: number;
      survivingPolarity: -1 | null;
      ascendingVertexCount: number;
      descendingVertexCount: number;
      bothIdentityLinksConnected: boolean;
      oppositePolarityDescendingEmpty: boolean;
      globalScanRun: boolean;
      requiredRootCount: number;
      localTemplateOrAutomatonReductionOpen: boolean;
      globalResultCertified: boolean;
    };
    type6BarycentricReduction: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_barycentric_reduction.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status:
        | "not-replayed"
        | "exact-reduction-global-fourier-links-not-yet-run";
      type6CharacterBindingMatches: boolean;
      fixedCharacterSymmetryOrder: number;
      originalChamberOrbitCount: number;
      cellBarycenterOrbitLowerBound: number;
      typeOnlyTemplateCount: number;
      rawDominantTypeOnlyObstructed: boolean;
      positiveDimensionEmptyLinkWitnessCount: number;
      negativeDimensionEmptyLinkWitnessCount: number;
      fourierFrameDependent: boolean;
      globalFourierLinksRun: boolean;
      globalResultCertified: boolean;
    };
    type6FourierFrameScreen: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_fourier_frame_screen_timeout.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status:
        | "not-replayed"
        | "incomplete-backend-timeout-no-mathematical-result";
      type6CharacterBindingMatches: boolean;
      plannedFrameCount: number;
      plannedReducedOriginalVertexCount: number;
      candidateCount: number;
      certifiedFrameCount: number;
      certifiedReducedOriginalVertexCount: number;
      certifiedCandidateCount: number;
      candidateEliminations: number;
      candidateSurvivors: number;
      higherCellTemplatesChecked: number;
      completeFrameTranscriptAvailable: boolean;
      mathematicalDisposition: "not-replayed" | "none";
      boundedAttemptCount: number;
      fallbackTimeoutExitCode: number | null;
      exactRunnerOptIn: boolean;
    };
    lqSchreierTable: {
      locator: "scripts/certificates/portfolio/makarov_p2_lq_schreier_table.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "exact-74880-state-table-certified";
      section5ImportBindingMatches: boolean;
      frameCount: number;
      transitionCount: number;
      exactQOrder: number;
      colorStabilizerOrder: number;
      coloringStabilizerExactlyL: boolean;
      compressedTableBytes: number;
      originalChamberOrbitCount: number;
      maximalType5Ready: boolean;
    };
    type6SchreierChamberScreen: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_fourier_schreier_chamber_screen.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "chamber-root-survivor-frontier";
      lqSchreierBindingMatches: boolean;
      type6CharacterBindingMatches: boolean;
      exactOriginalChamberRootCount: number;
      uniqueFrameFlagPatternCount: number;
      candidateCount: number;
      eliminatedCount: number;
      survivorCount: number;
      allFramesAndSignsCovered: boolean;
      higherCellGateRequired: boolean;
      globalResultCertified: boolean;
    };
    type6MaximalType5Timeout: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_maximal_type5_global_timeout.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status:
        | "not-replayed"
        | "incomplete-wall-time-no-global-mathematical-result";
      lqSchreierBindingMatches: boolean;
      chamberScreenBindingMatches: boolean;
      wallSecondsCap: number;
      maximalCellOrbitCount: number;
      constantFourierCellOrbitCount: number;
      zeroFourierCellOrbitCount: number;
      intersectionCandidateCount: number;
      globalMaximalType5ScreenComplete: boolean;
      completeGlobalTranscript: boolean;
      partialZeroFourierTranscriptRetained: boolean;
      certifiedZeroFourierCellLinkRows: number;
      constantFourierStageComplete: boolean;
      constantFourierCandidateEliminations: number;
      constantFourierCandidateSurvivors: number;
      constantFourierSurvivorEquivalenceClassCount: number;
      zeroFourierStageComplete: boolean;
      zeroFourierMathematicalDisposition: "not-replayed" | "none";
      exactRunnerOptIn: boolean;
    };
    type6ZeroFourierCompiled: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_zero_fourier_compiled.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "zero-Fourier-maximal-type5-survivor-frontier";
      timeoutReceiptBindingMatches: boolean;
      lqSchreierBindingMatches: boolean;
      zeroFourierCellOrbitCount: number;
      completedRowsByType: number[];
      fullFaceCosetsRetained: boolean;
      everySurvivorCheckedAtEveryOrbit: boolean;
      inputCandidateCount: number;
      inputEquivalenceClassCount: number;
      eliminatedCandidateCount: number;
      survivorCandidateCount: number;
      survivorCandidateIndices: number[];
      compiledFailureWitnessesReplayedInPython: number;
      nonmaximalBarycentricLinksOpen: boolean;
      globalTrackBCertified: boolean;
    };
    type6ConeApex: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_cone_apex_lemma.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "exact-type6-links-automatic-56-types-remain";
      barycentricReductionBindingMatches: boolean;
      maximalType5FrontierBindingMatches: boolean;
      lqSchreierBindingMatches: boolean;
      automaticType6CellTypeCount: number;
      automaticType6CellOrbitCount: number;
      unresolvedCellTypeCount: number;
      unresolvedCellOrbitCount: number;
      firstRankFourSideCellOrbitCount: number;
      everyType6DirectedLinkAutomatic: boolean;
      globalTrackBCertified: boolean;
    };
    type6FullStarEquivalence: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_full_star_equivalence.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status:
        | "not-replayed"
        | "exact-global-equivalence-for-central-types-avoiding-generator6";
      maximalType5FrontierBindingMatches: boolean;
      type6CharacterBindingMatches: boolean;
      sourceSurvivorCount: number;
      equivalenceClassCount: number;
      representativeCandidateIndices: number[];
      unresolvedCentralTypeCount: number;
      representativeOnlyGlobalScanExact: boolean;
    };
    type6FullStarCompiled: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_full_star_compiled.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "current-type6-height-family-eliminated";
      equivalenceBindingMatches: boolean;
      coneApexBindingMatches: boolean;
      maximalType5FrontierBindingMatches: boolean;
      lqSchreierBindingMatches: boolean;
      exactRankFourSideCellOrbitCount: number;
      completedCellOrbitRows: number;
      completedRowsByType: number[];
      fullFaceCosetsAndBothUpperCofacesRetained: boolean;
      inputCandidateCount: number;
      inputEquivalenceClassCount: number;
      eliminatedCandidateCount: number;
      survivorCandidateCount: number;
      compiledRepresentativeFailuresReplayedInPython: number;
      equivalenceTransferredFailuresReplayedInPython: number;
      currentDeclaredHeightFamilyEliminated: boolean;
      globalP2TrackBObstructed: boolean;
      globalFiberingObstructed: boolean;
    };
    type6R2PeriodicRepair: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_r2_periodic_repair.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "bounded-r2-all128-quick-gates-40-open";
      sourceBindingsMatch: boolean;
      fullFiberRootIndependent: boolean;
      faceCompatible: boolean;
      primitiveIntegralCharacterUnchanged: boolean;
      coefficientSet: number[];
      oldMotifsRepairedByPositiveCoefficient: number;
      oldFrontierCoefficientPairCount: number;
      fullProductCoefficientPairCount: number;
      negativeCoefficientChamberSurvivorCount: number;
      positiveCoefficientChamberSurvivorCount: number;
      exactRankFourSideCellOrbitCount: number;
      quickGateEliminatedPairCount: number;
      quickGateSurvivorPairCount: number;
      quickGateSurvivorClassCount: number;
      completedWithinWallCap: boolean;
      oldFrontierClosed: boolean;
      fullProductClosedAtQuickGates: boolean;
      otherPeriodicCoordinatesRemainOpen: boolean;
      globalP2TrackBObstructed: boolean;
      globalFiberingObstructed: boolean;
    };
    type6R2MaximalCompiled: {
      locator: "scripts/certificates/portfolio/makarov_p2_type6_r2_maximal_compiled.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "maximal-type5-eliminated";
      quickGateBindingMatches: boolean;
      lqSchreierBindingMatches: boolean;
      coefficient: number;
      maximalType5CellOrbitCount: number;
      inputCandidateCount: number;
      inputEquivalenceClassCount: number;
      completedCellOrbitRows: number;
      completedRowsByType: number[];
      fullFaceCosetsRetained: boolean;
      eliminatedCandidateCount: number;
      survivorCandidateCount: number;
      representativeFailuresReplayedInPython: number;
      completedWithinWallCap: boolean;
      fullR2ProductClosed: boolean;
      otherPeriodicCoordinatesRemainOpen: boolean;
      globalP2TrackBObstructed: boolean;
      globalFiberingObstructed: boolean;
    };
    facetBinaryOrientationCover: {
      locator: "scripts/certificates/portfolio/makarov_p2_facet_binary_orientation_cover.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status: "not-replayed" | "valid-rank312-cover-rank15-unresolved";
      allWallsTwoSided: boolean;
      totalSheetRank: number;
      relativeIndexPowerOfTwoExponent: number;
      rank14ImpossibleInScopedFamily: boolean;
      rank15Resolved: boolean;
      canonicalOracleIdentityLinkPassed: boolean;
      globalLawfulCalculationRun: boolean;
    };
    wallFlipCegar: {
      locator: "scripts/certificates/portfolio/makarov_p2_wall_flip_cegar.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status:
        | "not-replayed"
        | "exact-unsat-empty-directed-link-in-scoped-ansatz";
      rank312CoverBindingMatches: boolean;
      orbitFlipVariableCount: number;
      incidentSheetSignRank: number;
      incidentFlipAssignmentCount: number;
      assignmentsPassingNonemptyBothSides: number;
      witnessWordLength: number;
      translationEquivariantOrbitFlipCandidateExists: boolean;
      globalLawfulClosureRun: boolean;
      globalDirectedLinksRun: boolean;
      independentlyResolvedWallComponentsRemainOpen: boolean;
    };
    sheetResolvedWallFlipCegar: {
      locator: "scripts/certificates/portfolio/makarov_p2_sheet_resolved_wall_flip_cegar.json";
      bytesSha256: string;
      artifactSha256: string;
      unrestrictedDepth2Locator: "scripts/certificates/portfolio/makarov_p2_sheet_resolved_wall_flip_cegar_unrestricted_depth2.json";
      unrestrictedDepth2BytesSha256: string;
      unrestrictedDepth2ArtifactSha256: string;
      sealValid: boolean;
      unrestrictedDepth2SealValid: boolean;
      status:
        | "not-replayed"
        | "bounded-structured-survivor-rejected-at-next-frontier";
      rank312CoverBindingMatches: boolean;
      exactComponentKeyFormulasCertified: boolean;
      sideProjectiveRootClassCount: number;
      type5LabelCount: number;
      type6StabilizerRank: number;
      compactRadius1VertexCount: number;
      compactRadius1RankTwoCellCount: number;
      compactRadius1WallComponentVariableCount: number;
      compactRuleRejectedAtRadius2: boolean;
      compactRuleRadius2FailedVertexCount: number;
      unrestrictedRadius2VertexCount: number;
      unrestrictedRadius2RankTwoCellCount: number;
      unrestrictedRadius2WallComponentVariableCount: number;
      unrestrictedRadius2BothDirectedLinksPass: boolean;
      globalTrackACertified: boolean;
      higherCellAndSubdivisionLinksRun: boolean;
    };
    titsOrientationCover: {
      locator: "scripts/certificates/portfolio/makarov_p2_tits_orientation_cover.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status:
        | "not-replayed"
        | "orientation-cover-proved-canonical-oracle-edge-link-obstructed-image-order-not-computed";
      allWallsTwoSided: boolean;
      torsionFree: boolean;
      degreeLowerBound: number;
      exactImageOrderComputed: boolean;
      canonicalOracleIdentityLinkPassed: boolean;
      globalLawfulCalculationRun: boolean;
    };
    titsRootOrbitFrontier: {
      locator: "scripts/certificates/portfolio/makarov_p2_tits_root_orbit_frontier.json";
      bytesSha256: string;
      artifactSha256: string;
      sealValid: boolean;
      status:
        | "not-replayed"
        | "exact-image-order-computed-root-line-flip-frontier-open";
      priorTitsCoverBindingMatches: boolean;
      exactImageOrderComputed: boolean;
      exactImageDescription: string;
      exactImageOrderDecimal: string;
      section5SubgroupNonnormalWitnessReplayed: boolean;
      section5SubgroupImageDivisor: number;
      exactOrientationCoverDegreeComputed: boolean;
      rootLineConstantFlipVariableCount: number;
      rootTransversalFullLinkFailureCount: number;
      pointStabilizerLayerFailureCounts: number[];
      storedRootLineCandidatePassed: boolean;
      actualQuotientWallComponentCountComputed: boolean;
      globalLawfulClosureAuthorized: boolean;
      globalTrackACertified: boolean;
    };
    replayStatus: "not-applicable" | "passed-bundled-fixed-character-evidence";
  };
  stages: Array<{
    id:
      | "replay-source-bytes"
      | "validate-coarse-incidence"
      | "validate-coloring"
      | "construct-closed-colored-complex"
      | "compute-integral-h1"
      | "conditional-morse-search";
    state: "blocked" | "planned" | "completed";
    gate: string;
  }>;
  conclusions: {
    importedDataValidated: boolean;
    positiveIntegralH1Gate: boolean;
    nonzeroIntegralCharacterExists: boolean;
    primitiveIntegralCharacterExists: boolean;
    /** False means the exact value is unknown; the certified lower bound is 144. */
    section5ColoredB1Known: false;
    explicitPrimitiveCharacterMaterialized: boolean;
    registeredPrimitiveClassCount: number;
    qIndependentPrimitiveClassCount: number;
    secondPrimitiveClassCheapScreenCompleted: boolean;
    secondPrimitiveClassObstructedForRecordedModel: boolean;
    secondPrimitiveClassGlobalTrackBOpen: boolean;
    fullCharacterLatticeMaterialized: false;
    trackBRunnable: boolean;
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
    facetSpecificOrientationCoverConstructed: boolean;
    oddPrimeOrientationCoverConstructed: boolean;
    orientationCoverGlobalLawfulCalculationRun: boolean;
    globalWallLawfulCalculationRun: boolean;
    type6TrackBAnchorRunCompleted: boolean;
    type6TrackBAnchorSurvived: boolean;
    type6TrackBGlobalScanRun: boolean;
    type6BarycentricReductionRunCompleted: boolean;
    type6RawDominantTypeOnlyObstructed: boolean;
    type6FourierFrameAttemptRecorded: boolean;
    type6FourierFrameScanCompleted: boolean;
    type6LqSchreierTableCertified: boolean;
    type6OriginalChamberScreenCompleted: boolean;
    type6OriginalChamberSurvivorCount: number;
    type6MaximalType5GlobalAttemptRecorded: boolean;
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
    wallFlipCegarScopedAnsatzObstructed: boolean;
    sheetResolvedComponentFormulasCertified: boolean;
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
    algebraicFiberingCertified: false;
    smoothFiberingCertified: false;
  };
  nonClaims: string[];
  artifactDigest: string;
}

export interface P2CoarseExperimentPlanReplay {
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    artifactDigestValid: boolean;
    sourceBindingsValid: boolean;
    paperFactsMatch: boolean;
    artifactMatchesRebuild: boolean;
  };
  runnable: boolean;
  errors: string[];
  replayDigest: string;
}

const ROLE_FORMATS: Readonly<
  Record<P2CoarseSourceRole, P2CoarseSourceBinding["format"]>
> = {
  "paper-v2": "arxiv-source-archive",
  "p2-coxeter-input": "coxeter-system-json",
  "section-5-coarse-incidence": "p2-section-5-coarse-incidence",
  "section-5-coloring-data": "p2-section-5-coloring-data",
};

export const P2_BUNDLED_SOURCE_BINDINGS = [
  {
    role: "paper-v2",
    locator: "https://arxiv.org/e-print/2502.19225v2",
    bytesSha256:
      "53ba5c15cd102b2f21426e9506da5334f9346a03054349cf1dc250755faa07a0",
    format: "arxiv-source-archive",
  },
  {
    role: "p2-coxeter-input",
    locator: "public/examples/compact_5_prism_makarov_p2.json",
    bytesSha256:
      "3207516ab4323c28d00123b2391f45499d2eb3f1d75b44fca19577f71a27af6c",
    format: "coxeter-system-json",
  },
  {
    role: "section-5-coarse-incidence",
    locator: "scripts/data/makarov_p2_section5_coarse_incidence.json",
    bytesSha256:
      "f2f4b34aedddb081477a9d90643f4ad618b708f8864c421dd5e54a697d257a1a",
    format: "p2-section-5-coarse-incidence",
  },
  {
    role: "section-5-coloring-data",
    locator: "scripts/data/makarov_p2_section5_coloring.json",
    bytesSha256:
      "d3090c266a28b1f26f10f5458326db281d2d1781faf2ab3ff383383d6fcba9b2",
    format: "p2-section-5-coloring-data",
  },
] as const satisfies readonly P2CoarseSourceBinding[];

const BUNDLED_IMPORT_CERTIFICATE_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_section5_import.json" as const;
const BUNDLED_IMPORT_CERTIFICATE_BYTES_SHA256 =
  "a9a3e8f37e0af5fd10a5b11d1d15bdae4d5ab0209ba04675afb57deb6acd74af";
const BUNDLED_IMPORT_CERTIFICATE = bundledImportCertificateJson as unknown;
const BUNDLED_PRIMITIVE_COCYCLE_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_section5_x_primitive_cocycle.json" as const;
const BUNDLED_PRIMITIVE_COCYCLE_BYTES_SHA256 =
  "0ce60376a14c89927a6b09289a9a66318ea0a601ede2101489975ddbb6ce1cd3";
const BUNDLED_PRIMITIVE_COCYCLE = bundledPrimitiveCocycleJson as unknown;
const BUNDLED_COCYCLE_SCREENING_PORTFOLIO_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_cocycle_screening_portfolio.json" as const;
const BUNDLED_COCYCLE_SCREENING_PORTFOLIO_BYTES_SHA256 =
  "a05575eef5fd6f2cfb57719e9704cacb5a91571d145a84a4d660dc2668e2e2f8";
const BUNDLED_COCYCLE_SCREENING_PORTFOLIO =
  bundledCocycleScreeningPortfolioJson as unknown;
const BUNDLED_COMPRESSED_TRACK_B_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_section5_compressed_track_b.json" as const;
const BUNDLED_COMPRESSED_TRACK_B_BYTES_SHA256 =
  "8c959c660d96ec8d66704b520b4ee8fb243cac4944256109da8e5c1f386977f8";
const BUNDLED_COMPRESSED_TRACK_B = bundledCompressedTrackBJson as unknown;
const BUNDLED_COARSE_TRACK_B_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_section5_coarse_track_b.json" as const;
const BUNDLED_COARSE_TRACK_B_BYTES_SHA256 =
  "d2fe3c1ae284d266a3bc9903d258d7aa049bb39ec0df8d3f2461b56ab04fc649";
const BUNDLED_COARSE_TRACK_B = bundledCoarseTrackBJson as unknown;
const BUNDLED_GENERALIZED_TRACK_A_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_section5_generalized_track_a_attempt.json" as const;
const BUNDLED_GENERALIZED_TRACK_A_BYTES_SHA256 =
  "c949602a83a0848b4913fa0430d0c6e6d05c4d232b3b664daa5df28def83eed5";
const BUNDLED_GENERALIZED_TRACK_A = bundledGeneralizedTrackAJson as unknown;
const BUNDLED_WALL_COMPATIBILITY_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_section5_wall_compatibility.json" as const;
const BUNDLED_WALL_COMPATIBILITY_BYTES_SHA256 =
  "970761eabe64396fed9b618c46fd15131f73e0897ea209d325c41668de9d8366";
const BUNDLED_WALL_COMPATIBILITY = bundledWallCompatibilityJson as unknown;
const BUNDLED_WALL_COORIENTATION_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_section5_wall_coorientation_obstruction.json" as const;
const BUNDLED_WALL_COORIENTATION_BYTES_SHA256 =
  "6db74185b74dfae335837d7957fa0388279c0b1bb8319520ab2db901f268e1af";
const BUNDLED_WALL_COORIENTATION = bundledWallCoorientationJson as unknown;
const BUNDLED_COLOR_CLASS_WALL_ORIENTATION_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_section5_color_class_wall_orientation.json" as const;
const BUNDLED_COLOR_CLASS_WALL_ORIENTATION_BYTES_SHA256 =
  "ac94a123c2987c69f8378028fed829c3f6c378c1039a7acf6b49733cec37c4bc";
const BUNDLED_COLOR_CLASS_WALL_ORIENTATION =
  bundledColorClassWallOrientationJson as unknown;
const BUNDLED_GLOBAL_LAWFUL_READINESS_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_factored_global_lawful_readiness.json" as const;
const BUNDLED_GLOBAL_LAWFUL_READINESS_BYTES_SHA256 =
  "c862f1c6e18cde9bd263a32d5aac237f23244b4b31e56b95e0792f2d589161eb";
const BUNDLED_GLOBAL_LAWFUL_READINESS =
  bundledGlobalLawfulReadinessJson as unknown;
const BUNDLED_TYPE6_TRACK_B_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_wall_track_b.json" as const;
const BUNDLED_TYPE6_TRACK_B_BYTES_SHA256 =
  "864f8b39407b45a6d101e139e9a8f8e5511fadbba1b26dcb5f42c741b28a227b";
const BUNDLED_TYPE6_TRACK_B = bundledType6TrackBJson as unknown;
const BUNDLED_TYPE6_BARYCENTRIC_REDUCTION_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_barycentric_reduction.json" as const;
const BUNDLED_TYPE6_BARYCENTRIC_REDUCTION_BYTES_SHA256 =
  "0ae39c0aada47faccf7de49326ff6006687624245bc05cce7f8fee014acb6c15";
const BUNDLED_TYPE6_BARYCENTRIC_REDUCTION =
  bundledType6BarycentricReductionJson as unknown;
const BUNDLED_FACET_BINARY_ORIENTATION_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_facet_binary_orientation_cover.json" as const;
const BUNDLED_FACET_BINARY_ORIENTATION_BYTES_SHA256 =
  "f12283df3d177c655e131042997751c5146bf99c7cdcfba1fe91a70457cf36bb";
const BUNDLED_FACET_BINARY_ORIENTATION_ARTIFACT_SHA256 =
  "8ef7d0c905483500cfcf3c79c2519bc7cccb2a90c1b21d09c9c0e102379e2899";
const BUNDLED_FACET_BINARY_ORIENTATION =
  bundledFacetBinaryOrientationJson as unknown;
const BUNDLED_WALL_FLIP_CEGAR_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_wall_flip_cegar.json" as const;
const BUNDLED_WALL_FLIP_CEGAR_BYTES_SHA256 =
  "8a688b6220653a27ec53bf967fda3a38164d71ae8b5925f2eeb41a210aa13878";
const BUNDLED_WALL_FLIP_CEGAR = bundledWallFlipCegarJson as unknown;
const BUNDLED_SHEET_RESOLVED_WALL_FLIP_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_sheet_resolved_wall_flip_cegar.json" as const;
const BUNDLED_SHEET_RESOLVED_WALL_FLIP_BYTES_SHA256 =
  "acc3daceda47fee678be7b54d0c7a24196ff77690428170a20f18383cd445c89";
const BUNDLED_SHEET_RESOLVED_WALL_FLIP_ARTIFACT_SHA256 =
  "e3e70174ff74f6cf50d20b66e90dc35f5b198bd918f1ab68a0c58b641215000e";
const BUNDLED_SHEET_RESOLVED_WALL_FLIP =
  bundledSheetResolvedWallFlipJson as unknown;
const BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_sheet_resolved_wall_flip_cegar_unrestricted_depth2.json" as const;
const BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_BYTES_SHA256 =
  "e8bb23073c5c459ab3ed0c0c0c47178245d3f7d7e8eeed694dfbe3e429721e82";
const BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_ARTIFACT_SHA256 =
  "5b0c98e68841c9676c2d4011ac8f22b3672b719d81653c2b3f3d8d0886b4a205";
const BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED =
  bundledSheetResolvedWallFlipUnrestrictedJson as unknown;
const BUNDLED_TITS_ORIENTATION_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_tits_orientation_cover.json" as const;
const BUNDLED_TITS_ORIENTATION_BYTES_SHA256 =
  "dfb5f94d1a904f6fcf44d8a709983f0130977c4e233b575433eb1a6e9118cc40";
const BUNDLED_TITS_ORIENTATION_ARTIFACT_SHA256 =
  "8165d031be54156e53195d416bdbbec2ea0bc814287fb968332cf2b96a756bf5";
const BUNDLED_TITS_ORIENTATION = bundledTitsOrientationJson as unknown;
const BUNDLED_TITS_ROOT_ORBIT_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_tits_root_orbit_frontier.json" as const;
const BUNDLED_TITS_ROOT_ORBIT_BYTES_SHA256 =
  "734453ef00e7ec3c24913d9b7fc91c9a1d9436398bd7a29ff17b34ef74b54c5b";
const BUNDLED_TITS_ROOT_ORBIT_ARTIFACT_SHA256 =
  "b665e1342db0df98d34497a908d7e9b1e04948cc7d2f580355d661c1dc719b11";
const BUNDLED_TITS_ROOT_ORBIT = bundledTitsRootOrbitJson as unknown;
const BUNDLED_TYPE6_FOURIER_FRAME_SCREEN_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_fourier_frame_screen_timeout.json" as const;
const BUNDLED_TYPE6_FOURIER_FRAME_SCREEN_BYTES_SHA256 =
  "664201d66b55607e479e90b0531677934364b6006e6fa12d26337eae62a0a9e2";
const BUNDLED_TYPE6_FOURIER_FRAME_SCREEN =
  bundledType6FourierFrameScreenJson as unknown;
const BUNDLED_LQ_SCHREIER_TABLE_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_lq_schreier_table.json" as const;
const BUNDLED_LQ_SCHREIER_TABLE_BYTES_SHA256 =
  "5f9056b711d3be7fff2d5a71fb43d8ac725f88ec50a33ae81054ac7943e2908f";
const BUNDLED_LQ_SCHREIER_TABLE = bundledLqSchreierTableJson as unknown;
const BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_fourier_schreier_chamber_screen.json" as const;
const BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN_BYTES_SHA256 =
  "fad654adf97785be0a63010eea9d28306b8d1c4d3184797ffdd7644e110ddd5e";
const BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN =
  bundledType6SchreierChamberScreenJson as unknown;
const BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_maximal_type5_global_timeout.json" as const;
const BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT_BYTES_SHA256 =
  "574c563dc271c98b9d0554fc81da58b30120b8d8658ca9c8ac9462f9e7adead9";
const BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT =
  bundledType6MaximalType5TimeoutJson as unknown;
const BUNDLED_TYPE6_ZERO_FOURIER_COMPILED_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_zero_fourier_compiled.json" as const;
const BUNDLED_TYPE6_ZERO_FOURIER_COMPILED_BYTES_SHA256 =
  "a86f92cce2dde32f5c3db42c069ec73533491080e6ae0ef32b4d1d056dedf531";
const BUNDLED_TYPE6_ZERO_FOURIER_COMPILED =
  bundledType6ZeroFourierCompiledJson as unknown;
const BUNDLED_TYPE6_CONE_APEX_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_cone_apex_lemma.json" as const;
const BUNDLED_TYPE6_CONE_APEX_BYTES_SHA256 =
  "5609235517ac0c7d2aacf477143da37f12ac0aa92ceb030e9e6c972c21810c9e";
const BUNDLED_TYPE6_CONE_APEX = bundledType6ConeApexJson as unknown;
const BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_full_star_equivalence.json" as const;
const BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE_BYTES_SHA256 =
  "fe2f501ef0321e65e9833582f19a644f70043e20c75f29596c7b6a812d650307";
const BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE =
  bundledType6FullStarEquivalenceJson as unknown;
const BUNDLED_TYPE6_FULL_STAR_COMPILED_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_full_star_compiled.json" as const;
const BUNDLED_TYPE6_FULL_STAR_COMPILED_BYTES_SHA256 =
  "ea9151f203484d4251439087066aed2695f591b9d68bce387c71de54e5b0e6b0";
const BUNDLED_TYPE6_FULL_STAR_COMPILED =
  bundledType6FullStarCompiledJson as unknown;
const BUNDLED_TYPE6_R2_PERIODIC_REPAIR_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_r2_periodic_repair.json" as const;
const BUNDLED_TYPE6_R2_PERIODIC_REPAIR_BYTES_SHA256 =
  "a3e234a295d2382b28180628ee19b9bdb7c3efe80994875a5bf7c0743f975b1c";
const BUNDLED_TYPE6_R2_PERIODIC_REPAIR =
  bundledType6R2PeriodicRepairJson as unknown;
const BUNDLED_TYPE6_R2_MAXIMAL_COMPILED_LOCATOR =
  "scripts/certificates/portfolio/makarov_p2_type6_r2_maximal_compiled.json" as const;
const BUNDLED_TYPE6_R2_MAXIMAL_COMPILED_BYTES_SHA256 =
  "3de7e3bf46e4f705ea95cdac16c5ecd29ba30a1deb4b90e92d2df9c4a21fd4b0";
const BUNDLED_TYPE6_R2_MAXIMAL_COMPILED =
  bundledType6R2MaximalCompiledJson as unknown;

const PAPER = {
  sourceId: "arXiv:2502.19225v2",
  url: "https://arxiv.org/abs/2502.19225v2",
  locators: {
    prism: "Section 1",
    publishedFirstHomology: "Section 4.3",
    alternativeConstruction: "Sections 5.2-5.3",
  },
} as const;

const PAPER_SUPPORTED_FACTS: P2CoarseExperimentPlan["paperSupportedFacts"] = {
  coxeterPrism: "P2-[5,3,3,3,4]",
  p2PrismsPer120CellPrism: 14_400,
  publishedFamilies: {
    names: ["N_i,I^+/-", "Mhat_i,I^+/-"],
    firstBettiNumber: 0,
    disposition: "known-b1-zero-not-fibering-candidates",
  },
  alternativeSection5: {
    xDimension: 4,
    x120CellCount: 650,
    xIntegralH1: "Z^144",
    xIntegralH1FreeRank: 144,
    closedColoredFiveManifoldB1: "not-computed-in-paper",
  },
};

const STAGES: P2CoarseExperimentPlan["stages"] = [
  {
    id: "replay-source-bytes",
    state: "planned",
    gate: "Recompute every declared SHA-256 before parsing any imported data.",
  },
  {
    id: "validate-coarse-incidence",
    state: "planned",
    gate: "Replay the complete Section 5 coarse cell incidence and attaching maps, not only the 650-vertex adjacency graph.",
  },
  {
    id: "validate-coloring",
    state: "planned",
    gate: "Check the characteristic matrix, local linear-independence condition, and source binding of the selected Section 5 coloring.",
  },
  {
    id: "construct-closed-colored-complex",
    state: "planned",
    gate: "Materialize a cellular chain model for the closed coarse five-complex; the validated characteristic construction defines it but does not enumerate its full attaching data.",
  },
  {
    id: "compute-integral-h1",
    state: "planned",
    gate: "Two exact primitive cellular cocycles in Q-linearly independent reflection eigenspaces are bound; computing the full integral character lattice remains a separate expansion.",
  },
  {
    id: "conditional-morse-search",
    state: "planned",
    gate: "Track B has exactly eliminated the declared 128-candidate primitive type-6/Fourier height family. For the R2 repair product, the quick gates eliminate 344 of 384 pairs and the compiled maximal-type-5 continuation eliminates the remaining 40. Other periodic coordinates, coefficients, characters, gauges, and subdivisions remain open. Track A has one unrestricted radius-two sheet-resolved survivor, but its global component-flip assignment, higher lawful closure, subdivision links, and height-band gate remain open.",
  },
];

const NON_CLAIMS = [
  "The source-reported H1(X)=Z^144 and split injection give b1(M)>=144, but do not determine the full H1 of the closed Section 5 colored five-manifold.",
  "The independent Sage H1(X) replay failed at its bounded dense-FLINT memory path; GAP/HAP was unavailable, so no independent H1 transcript is claimed.",
  "Two Q-linearly independent primitive integral representatives and several scoped Track B height models are materialized. The complete chamber, maximal-cell, endpoint-hub, equivalence, and rank-four full-star chain eliminates the declared 128-candidate primitive type-6/Fourier height family for the first class; the full character lattice, other gauges or subdivisions, a positive Morse certificate, algebraic fibering, and smooth fibering remain open.",
  "The second primitive representative is rejected only by the same identity-first pulling gauge at one anchor. This is not a character obstruction, and no global Track B scan has been run for it.",
  "The identity-link obstruction is scoped to the stored cocycle section, global order, and two tie polarities; it does not obstruct the primitive character itself.",
  "The coarse order-complex Track B failure is likewise scoped to two canonical dimension perturbations at one translation-reduced root.",
  "Strict full-wall Track A is blocked on the current cover: every generator-5 wall component is one-sided, so no full wall coorientation or wall-lawful closure exists there.",
  "A separate exact necessary-condition calculation obstructs only this explicit primitive class in wall Track A: it is not in the rational wall-cochain span, even after a periodic potential or saturation.",
  "Direct-cocycle Track A and passage to a further finite cover remain open; the current-cover wall obstruction does not apply to either route.",
  "The natural 16-fold repair and every color-class-only voltage extension are obstructed by side-wall parity. Explicit facet-specific binary and odd-prime Tits covers do coorient all walls, but their canonical coorientation oracles fail the identity directed-link gate. The 951-variable translation-equivariant wall-orbit-flip ansatz also has an exact empty-link obstruction; independently resolved wall-component flips and subdivision rules remain open.",
  "Exact voltage-graph formulas now identify the rank-312 cover's sheet-resolved wall components. An unrestricted assignment passes both directed rank-two links on a radius-two frontier of 2,560 vertices, 32,768 cells, and 2,736 component variables; this is finite original-vertex evidence, not global Track A.",
  "The compact radius-one component-flip rule fails at 96 radius-two vertices. The F9 image is the spinor kernel of order 108051462804999168000, but the stored root-line candidate has explicit full-link failures; the exact cover degree, actual quotient wall components, global flips, lawful closure, and subdivision links remain open.",
  "A mixed periodic potential repairs the former root obstruction locally, but no global directed-link conclusion follows.",
  "The primitive type-6 cocycle passes both identity links for polarity -1. The exact barycentric reduction has 149,760 original-chamber orbits and at least 1,806,033 cell-barycenter orbits; raw-dominant type-only perturbations are obstructed.",
  "The bounded Fourier-frame backend timed out with zero certified frames, roots, candidates, eliminations, or survivors. This is no mathematical result; the exact scanner remains opt-in.",
  "The replacement L\\Q backend exactly certifies 74,880 frames and the complete 149,760-root chamber screen, eliminating 16 of 128 candidates. Intersecting its 112 survivors with the identity-anchor frontier leaves 80 candidates.",
  "The exact constant-Fourier maximal type-5 templates eliminate 48 of those 80 candidates. The compiled continuation checks all 2,462 zero-Fourier maximal-cell orbits, eliminates eight more, and leaves 24 maximal-type5 survivors.",
  "The endpoint-hub lemma automatically discharges every cell type containing generator 6 and reduces the unresolved workload to 56 central types. Exact character and sheet symmetries reduce the 24 maximal-type5 survivors to six representatives.",
  "The compiled full-star continuation retains every actual lower-face coset and both distinct upper cofaces. Rank-four side-cell witnesses eliminate all six representatives and, by independently replayed equivalence transfers, all 24 candidates. This closes only the declared 128-candidate primitive type-6/Fourier height family; it is not a global P2 Track B or fibering obstruction.",
  "For the quotient-periodic R2 coordinate, the old c=0 pipeline and the c=+/-1 chamber/rank-four quick gates eliminate 344 of the complete 384 coefficient-candidate pairs and leave 40 resurrected c=+1 pairs in ten exact symmetry classes. The compiled maximal-type-5 continuation eliminates all 40, with ten complete-fiber witnesses independently replayed in Python. This closes only that R2 coefficient family for the certified action, primitive character, and canonical barycentric subdivision; other periodic coordinates, coefficient families, primitive characters, and Track B remain open.",
] as const;

const COMPLETED_IMPORT_STAGE_IDS = new Set<
  P2CoarseExperimentPlan["stages"][number]["id"]
>(["validate-coarse-incidence", "validate-coloring"]);

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

function validateAndSortBindings(
  bindings: readonly P2CoarseSourceBinding[],
): P2CoarseSourceBinding[] {
  const seen = new Set<P2CoarseSourceRole>();
  const copy = bindings.map((binding) => ({ ...binding }));
  for (const binding of copy) {
    if (!P2_COARSE_REQUIRED_SOURCE_ROLES.includes(binding.role)) {
      throw new Error(`Unknown P2 coarse source role ${String(binding.role)}.`);
    }
    if (seen.has(binding.role)) {
      throw new Error(`Duplicate P2 coarse source role ${binding.role}.`);
    }
    seen.add(binding.role);
    if (binding.locator.trim().length === 0) {
      throw new Error(`Source binding ${binding.role} has an empty locator.`);
    }
    if (!isSha256(binding.bytesSha256)) {
      throw new Error(
        `Source binding ${binding.role} requires a lowercase 64-digit SHA-256.`,
      );
    }
    if (binding.format !== ROLE_FORMATS[binding.role]) {
      throw new Error(
        `Source binding ${binding.role} has format ${binding.format}; expected ${ROLE_FORMATS[binding.role]}.`,
      );
    }
  }
  return copy.sort(
    (left, right) =>
      P2_COARSE_REQUIRED_SOURCE_ROLES.indexOf(left.role) -
      P2_COARSE_REQUIRED_SOURCE_ROLES.indexOf(right.role),
  );
}

function replayBundledImportCertificate(
  sourceBindings: readonly P2CoarseSourceBinding[],
): P2CoarseExperimentPlan["importCertificate"] {
  const recognizedBundle =
    canonicalSha256(sourceBindings) ===
    canonicalSha256(P2_BUNDLED_SOURCE_BINDINGS);
  const notApplicable: P2CoarseExperimentPlan["importCertificate"] = {
    locator: BUNDLED_IMPORT_CERTIFICATE_LOCATOR,
    bytesSha256: BUNDLED_IMPORT_CERTIFICATE_BYTES_SHA256,
    certificateSha256: "",
    sealValid: false,
    sourceBindingsMatch: false,
    allFiniteFieldAndColoringChecksPassed: false,
    replayStatus: "not-applicable-unrecognized-bundle",
  };
  if (!recognizedBundle) return notApplicable;
  if (!isRecord(BUNDLED_IMPORT_CERTIFICATE)) {
    throw new Error("The bundled P2 import certificate is not an object.");
  }
  const certificateSha256 = BUNDLED_IMPORT_CERTIFICATE.certificateSha256;
  const certificatePayload = Object.fromEntries(
    Object.entries(BUNDLED_IMPORT_CERTIFICATE).filter(
      ([key]) => key !== "certificateSha256",
    ),
  );
  const sealValid =
    typeof certificateSha256 === "string" &&
    isSha256(certificateSha256) &&
    certificateSha256 === canonicalSha256(certificatePayload);
  const sourceBindingsMatch =
    Array.isArray(BUNDLED_IMPORT_CERTIFICATE.sourceBindings) &&
    canonicalSha256(BUNDLED_IMPORT_CERTIFICATE.sourceBindings) ===
      canonicalSha256(sourceBindings);
  const replay = BUNDLED_IMPORT_CERTIFICATE.replay;
  const gate = BUNDLED_IMPORT_CERTIFICATE.integralH1Gate;
  const independent = BUNDLED_IMPORT_CERTIFICATE.independentH1Replay;
  const allFiniteFieldAndColoringChecksPassed =
    isRecord(replay) && replay.allFiniteFieldAndColoringChecksPassed === true;
  const positiveGateValid =
    isRecord(gate) &&
    gate.status === "passed-positive" &&
    gate.baseHomologyEvidenceKind === "source-reported-exact-HAP-output" &&
    gate.closedFiveManifoldFreeRankLowerBound === 144 &&
    gate.nonzeroIntegralCharacterExists === true &&
    gate.primitiveIntegralCharacterExists === true &&
    gate.fullIntegralH1 === "not-computed";
  const failedIndependentReplayRecorded =
    isRecord(independent) &&
    independent.status === "not-completed-resource-and-tooling-limit" &&
    independent.transcriptBound === false;
  if (
    BUNDLED_IMPORT_CERTIFICATE.schemaVersion !== 1 ||
    BUNDLED_IMPORT_CERTIFICATE.kind !==
      "makarov-p2-section5-coarse-import-certificate" ||
    !sealValid ||
    !sourceBindingsMatch ||
    !allFiniteFieldAndColoringChecksPassed ||
    !positiveGateValid ||
    !failedIndependentReplayRecorded
  ) {
    throw new Error(
      "The bundled P2 import certificate fails its seal, source, finite-data, or H1-gate replay.",
    );
  }
  return {
    locator: BUNDLED_IMPORT_CERTIFICATE_LOCATOR,
    bytesSha256: BUNDLED_IMPORT_CERTIFICATE_BYTES_SHA256,
    certificateSha256,
    sealValid,
    sourceBindingsMatch,
    allFiniteFieldAndColoringChecksPassed,
    replayStatus: "passed-bundled-certificate",
  };
}

function canonicalSealValid(
  value: unknown,
  field: "certificateSha256" | "artifactSha256",
): value is Record<string, unknown> {
  if (!isRecord(value) || !isSha256(String(value[field] ?? ""))) return false;
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== field),
  );
  return value[field] === canonicalSha256(payload);
}

function replayBundledFixedCharacterEvidence(
  importCertificate: P2CoarseExperimentPlan["importCertificate"],
): P2CoarseExperimentPlan["fixedCharacterEvidence"] {
  const notApplicable: P2CoarseExperimentPlan["fixedCharacterEvidence"] = {
    primitiveCocycle: {
      locator: BUNDLED_PRIMITIVE_COCYCLE_LOCATOR,
      bytesSha256: BUNDLED_PRIMITIVE_COCYCLE_BYTES_SHA256,
      certificateSha256: "",
      sealValid: false,
      importBindingMatches: false,
      exactTriangleClosure: false,
      treeGaugeReplayed: false,
      primitiveCycleWitnessReplayed: false,
    },
    primitiveCocycleScreeningPortfolio: {
      locator: BUNDLED_COCYCLE_SCREENING_PORTFOLIO_LOCATOR,
      bytesSha256: BUNDLED_COCYCLE_SCREENING_PORTFOLIO_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      importBindingMatches: false,
      status: "not-replayed",
      registeredCandidateCount: 0,
      primitiveClassCount: 0,
      exactTriangleCountEach: 0,
      qLinearlyIndependent: false,
      independenceWitnessGenerator: 0,
      bothCheapAnchorScreensObstructed: false,
      fullCharacterLatticeMaterialized: false,
      globalTrackBScreenRun: false,
      otherGaugesRemainOpen: true,
    },
    compressedTrackB: {
      locator: BUNDLED_COMPRESSED_TRACK_B_LOCATOR,
      bytesSha256: BUNDLED_COMPRESSED_TRACK_B_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      primitiveCocycleBindingMatches: false,
      status: "not-replayed",
      rootedStateUnionCount: 0,
      bothTiePolaritiesRejectedAtIdentity: false,
      globalAllVertexScanNeededForRecordedModel: true,
    },
    coarseTrackB: {
      locator: BUNDLED_COARSE_TRACK_B_LOCATOR,
      bytesSha256: BUNDLED_COARSE_TRACK_B_BYTES_SHA256,
      certificateSha256: "",
      sealValid: false,
      primitiveCocycleBindingMatches: false,
      status: "not-replayed",
      bothCanonicalPerturbationPolaritiesRejectedAtRoot: false,
      coloredRootCopiesCovered: 0,
      globalAllVertexScanCompleted: false,
    },
    strictWallTrackA: {
      locator: BUNDLED_GENERALIZED_TRACK_A_LOCATOR,
      bytesSha256: BUNDLED_GENERALIZED_TRACK_A_BYTES_SHA256,
      certificateSha256: "",
      sealValid: false,
      primitiveCocycleBindingMatches: false,
      wallCompatibilityBindingMatches: false,
      status: "not-replayed",
      strictWallTrackAInputIncomplete: false,
      directCocycleTrackANotRun: false,
      finiteHeightBandNotRun: false,
      missingRequiredObjectCount: 0,
      formerTrackBRootObstructionRepairedByLocalPotential: false,
      globalDirectedLinksChecked: false,
    },
    wallCompatibility: {
      locator: BUNDLED_WALL_COMPATIBILITY_LOCATOR,
      bytesSha256: BUNDLED_WALL_COMPATIBILITY_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      primitiveCocycleBindingMatches: false,
      status: "not-replayed",
      rationalWallSpanContainsExplicitCharacter: false,
      gaugeIndependent: false,
      periodicPotentialCanRepair: false,
      saturationCanRepair: false,
      sectionPullbackPrimitiveReplayed: false,
      importAndIncidenceCrossBindingReplayed: false,
      differentWallCharacterTrackAOpen: true,
      directCocycleTrackAOpen: true,
    },
    fullWallCoorientation: {
      locator: BUNDLED_WALL_COORIENTATION_LOCATOR,
      bytesSha256: BUNDLED_WALL_COORIENTATION_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      labelsPassingFullSpanTest: 0,
      everyType5WallComponentOneSided: false,
      fullWallSystemCoorientable: false,
      explicitReversingLoopReplayed: false,
      type6WallCount: 0,
      type6WallsTwoSided: false,
      type6PartialCocycleStrictTrackAAdmissible: false,
      directCocycleTrackAUnaffected: false,
      furtherCoverRemainsOpen: false,
    },
    colorClassWallOrientation: {
      locator: BUNDLED_COLOR_CLASS_WALL_ORIENTATION_LOCATOR,
      bytesSha256: BUNDLED_COLOR_CLASS_WALL_ORIENTATION_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      minimalColorClassExtensionIndex: 0,
      minimalExtensionRepairsType5Obstruction: false,
      projectedSideWallClassCount: 0,
      projectedSideWallConflictCount: 0,
      anyColorClassOnlyVoltageExtensionCanHaveFullWallCoorientation: false,
      lawfulCellClosureDefinedForTheseCovers: false,
      directedLinkCalculationRun: false,
      facetSpecificCoverRemainsOpen: false,
      oddPrimeCoverRemainsOpen: false,
    },
    globalLawfulReadiness: {
      locator: BUNDLED_GLOBAL_LAWFUL_READINESS_LOCATOR,
      bytesSha256: BUNDLED_GLOBAL_LAWFUL_READINESS_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      wallCoorientationBindingMatches: false,
      colorClassWallOrientationBindingMatches: false,
      lawfulClosureAndDirectedLinksDefined: false,
      runOnCurrentCover: false,
      unreducedCellCount: 0,
      sheetInvariantTemplateCount: 0,
      sheetInvariantRankTwoTemplateCount: 0,
      conditionalHeightRuleFaceCompatible: false,
    },
    type6TrackB: {
      locator: BUNDLED_TYPE6_TRACK_B_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_TRACK_B_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      wallCocycleClosed: false,
      wallCocycleTwoSided: false,
      primitiveIntegralCharacter: false,
      primitiveLoopEvaluation: 0,
      survivingPolarity: null,
      ascendingVertexCount: 0,
      descendingVertexCount: 0,
      bothIdentityLinksConnected: false,
      oppositePolarityDescendingEmpty: false,
      globalScanRun: false,
      requiredRootCount: 0,
      localTemplateOrAutomatonReductionOpen: false,
      globalResultCertified: false,
    },
    type6BarycentricReduction: {
      locator: BUNDLED_TYPE6_BARYCENTRIC_REDUCTION_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_BARYCENTRIC_REDUCTION_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      type6CharacterBindingMatches: false,
      fixedCharacterSymmetryOrder: 0,
      originalChamberOrbitCount: 0,
      cellBarycenterOrbitLowerBound: 0,
      typeOnlyTemplateCount: 0,
      rawDominantTypeOnlyObstructed: false,
      positiveDimensionEmptyLinkWitnessCount: 0,
      negativeDimensionEmptyLinkWitnessCount: 0,
      fourierFrameDependent: false,
      globalFourierLinksRun: false,
      globalResultCertified: false,
    },
    type6FourierFrameScreen: {
      locator: BUNDLED_TYPE6_FOURIER_FRAME_SCREEN_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_FOURIER_FRAME_SCREEN_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      type6CharacterBindingMatches: false,
      plannedFrameCount: 0,
      plannedReducedOriginalVertexCount: 0,
      candidateCount: 0,
      certifiedFrameCount: 0,
      certifiedReducedOriginalVertexCount: 0,
      certifiedCandidateCount: 0,
      candidateEliminations: 0,
      candidateSurvivors: 0,
      higherCellTemplatesChecked: 0,
      completeFrameTranscriptAvailable: false,
      mathematicalDisposition: "not-replayed",
      boundedAttemptCount: 0,
      fallbackTimeoutExitCode: null,
      exactRunnerOptIn: true,
    },
    lqSchreierTable: {
      locator: BUNDLED_LQ_SCHREIER_TABLE_LOCATOR,
      bytesSha256: BUNDLED_LQ_SCHREIER_TABLE_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      section5ImportBindingMatches: false,
      frameCount: 0,
      transitionCount: 0,
      exactQOrder: 0,
      colorStabilizerOrder: 0,
      coloringStabilizerExactlyL: false,
      compressedTableBytes: 0,
      originalChamberOrbitCount: 0,
      maximalType5Ready: false,
    },
    type6SchreierChamberScreen: {
      locator: BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      lqSchreierBindingMatches: false,
      type6CharacterBindingMatches: false,
      exactOriginalChamberRootCount: 0,
      uniqueFrameFlagPatternCount: 0,
      candidateCount: 0,
      eliminatedCount: 0,
      survivorCount: 0,
      allFramesAndSignsCovered: false,
      higherCellGateRequired: false,
      globalResultCertified: false,
    },
    type6MaximalType5Timeout: {
      locator: BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      lqSchreierBindingMatches: false,
      chamberScreenBindingMatches: false,
      wallSecondsCap: 0,
      maximalCellOrbitCount: 0,
      constantFourierCellOrbitCount: 0,
      zeroFourierCellOrbitCount: 0,
      intersectionCandidateCount: 0,
      globalMaximalType5ScreenComplete: false,
      completeGlobalTranscript: false,
      partialZeroFourierTranscriptRetained: false,
      certifiedZeroFourierCellLinkRows: 0,
      constantFourierStageComplete: false,
      constantFourierCandidateEliminations: 0,
      constantFourierCandidateSurvivors: 0,
      constantFourierSurvivorEquivalenceClassCount: 0,
      zeroFourierStageComplete: false,
      zeroFourierMathematicalDisposition: "not-replayed",
      exactRunnerOptIn: true,
    },
    type6ZeroFourierCompiled: {
      locator: BUNDLED_TYPE6_ZERO_FOURIER_COMPILED_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_ZERO_FOURIER_COMPILED_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      timeoutReceiptBindingMatches: false,
      lqSchreierBindingMatches: false,
      zeroFourierCellOrbitCount: 0,
      completedRowsByType: [],
      fullFaceCosetsRetained: false,
      everySurvivorCheckedAtEveryOrbit: false,
      inputCandidateCount: 0,
      inputEquivalenceClassCount: 0,
      eliminatedCandidateCount: 0,
      survivorCandidateCount: 0,
      survivorCandidateIndices: [],
      compiledFailureWitnessesReplayedInPython: 0,
      nonmaximalBarycentricLinksOpen: false,
      globalTrackBCertified: false,
    },
    type6ConeApex: {
      locator: BUNDLED_TYPE6_CONE_APEX_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_CONE_APEX_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      barycentricReductionBindingMatches: false,
      maximalType5FrontierBindingMatches: false,
      lqSchreierBindingMatches: false,
      automaticType6CellTypeCount: 0,
      automaticType6CellOrbitCount: 0,
      unresolvedCellTypeCount: 0,
      unresolvedCellOrbitCount: 0,
      firstRankFourSideCellOrbitCount: 0,
      everyType6DirectedLinkAutomatic: false,
      globalTrackBCertified: false,
    },
    type6FullStarEquivalence: {
      locator: BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      maximalType5FrontierBindingMatches: false,
      type6CharacterBindingMatches: false,
      sourceSurvivorCount: 0,
      equivalenceClassCount: 0,
      representativeCandidateIndices: [],
      unresolvedCentralTypeCount: 0,
      representativeOnlyGlobalScanExact: false,
    },
    type6FullStarCompiled: {
      locator: BUNDLED_TYPE6_FULL_STAR_COMPILED_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_FULL_STAR_COMPILED_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      equivalenceBindingMatches: false,
      coneApexBindingMatches: false,
      maximalType5FrontierBindingMatches: false,
      lqSchreierBindingMatches: false,
      exactRankFourSideCellOrbitCount: 0,
      completedCellOrbitRows: 0,
      completedRowsByType: [],
      fullFaceCosetsAndBothUpperCofacesRetained: false,
      inputCandidateCount: 0,
      inputEquivalenceClassCount: 0,
      eliminatedCandidateCount: 0,
      survivorCandidateCount: 0,
      compiledRepresentativeFailuresReplayedInPython: 0,
      equivalenceTransferredFailuresReplayedInPython: 0,
      currentDeclaredHeightFamilyEliminated: false,
      globalP2TrackBObstructed: false,
      globalFiberingObstructed: false,
    },
    type6R2PeriodicRepair: {
      locator: BUNDLED_TYPE6_R2_PERIODIC_REPAIR_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_R2_PERIODIC_REPAIR_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      sourceBindingsMatch: false,
      fullFiberRootIndependent: false,
      faceCompatible: false,
      primitiveIntegralCharacterUnchanged: false,
      coefficientSet: [],
      oldMotifsRepairedByPositiveCoefficient: 0,
      oldFrontierCoefficientPairCount: 0,
      fullProductCoefficientPairCount: 0,
      negativeCoefficientChamberSurvivorCount: 0,
      positiveCoefficientChamberSurvivorCount: 0,
      exactRankFourSideCellOrbitCount: 0,
      quickGateEliminatedPairCount: 0,
      quickGateSurvivorPairCount: 0,
      quickGateSurvivorClassCount: 0,
      completedWithinWallCap: false,
      oldFrontierClosed: false,
      fullProductClosedAtQuickGates: false,
      otherPeriodicCoordinatesRemainOpen: true,
      globalP2TrackBObstructed: false,
      globalFiberingObstructed: false,
    },
    type6R2MaximalCompiled: {
      locator: BUNDLED_TYPE6_R2_MAXIMAL_COMPILED_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_R2_MAXIMAL_COMPILED_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      quickGateBindingMatches: false,
      lqSchreierBindingMatches: false,
      coefficient: 0,
      maximalType5CellOrbitCount: 0,
      inputCandidateCount: 0,
      inputEquivalenceClassCount: 0,
      completedCellOrbitRows: 0,
      completedRowsByType: [],
      fullFaceCosetsRetained: false,
      eliminatedCandidateCount: 0,
      survivorCandidateCount: 0,
      representativeFailuresReplayedInPython: 0,
      completedWithinWallCap: false,
      fullR2ProductClosed: false,
      otherPeriodicCoordinatesRemainOpen: true,
      globalP2TrackBObstructed: false,
      globalFiberingObstructed: false,
    },
    facetBinaryOrientationCover: {
      locator: BUNDLED_FACET_BINARY_ORIENTATION_LOCATOR,
      bytesSha256: BUNDLED_FACET_BINARY_ORIENTATION_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      allWallsTwoSided: false,
      totalSheetRank: 0,
      relativeIndexPowerOfTwoExponent: 0,
      rank14ImpossibleInScopedFamily: false,
      rank15Resolved: false,
      canonicalOracleIdentityLinkPassed: false,
      globalLawfulCalculationRun: false,
    },
    wallFlipCegar: {
      locator: BUNDLED_WALL_FLIP_CEGAR_LOCATOR,
      bytesSha256: BUNDLED_WALL_FLIP_CEGAR_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      rank312CoverBindingMatches: false,
      orbitFlipVariableCount: 0,
      incidentSheetSignRank: 0,
      incidentFlipAssignmentCount: 0,
      assignmentsPassingNonemptyBothSides: 0,
      witnessWordLength: 0,
      translationEquivariantOrbitFlipCandidateExists: false,
      globalLawfulClosureRun: false,
      globalDirectedLinksRun: false,
      independentlyResolvedWallComponentsRemainOpen: true,
    },
    sheetResolvedWallFlipCegar: {
      locator: BUNDLED_SHEET_RESOLVED_WALL_FLIP_LOCATOR,
      bytesSha256: BUNDLED_SHEET_RESOLVED_WALL_FLIP_BYTES_SHA256,
      artifactSha256: "",
      unrestrictedDepth2Locator:
        BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_LOCATOR,
      unrestrictedDepth2BytesSha256:
        BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_BYTES_SHA256,
      unrestrictedDepth2ArtifactSha256: "",
      sealValid: false,
      unrestrictedDepth2SealValid: false,
      status: "not-replayed",
      rank312CoverBindingMatches: false,
      exactComponentKeyFormulasCertified: false,
      sideProjectiveRootClassCount: 0,
      type5LabelCount: 0,
      type6StabilizerRank: 0,
      compactRadius1VertexCount: 0,
      compactRadius1RankTwoCellCount: 0,
      compactRadius1WallComponentVariableCount: 0,
      compactRuleRejectedAtRadius2: false,
      compactRuleRadius2FailedVertexCount: 0,
      unrestrictedRadius2VertexCount: 0,
      unrestrictedRadius2RankTwoCellCount: 0,
      unrestrictedRadius2WallComponentVariableCount: 0,
      unrestrictedRadius2BothDirectedLinksPass: false,
      globalTrackACertified: false,
      higherCellAndSubdivisionLinksRun: false,
    },
    titsOrientationCover: {
      locator: BUNDLED_TITS_ORIENTATION_LOCATOR,
      bytesSha256: BUNDLED_TITS_ORIENTATION_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      allWallsTwoSided: false,
      torsionFree: false,
      degreeLowerBound: 0,
      exactImageOrderComputed: false,
      canonicalOracleIdentityLinkPassed: false,
      globalLawfulCalculationRun: false,
    },
    titsRootOrbitFrontier: {
      locator: BUNDLED_TITS_ROOT_ORBIT_LOCATOR,
      bytesSha256: BUNDLED_TITS_ROOT_ORBIT_BYTES_SHA256,
      artifactSha256: "",
      sealValid: false,
      status: "not-replayed",
      priorTitsCoverBindingMatches: false,
      exactImageOrderComputed: false,
      exactImageDescription: "",
      exactImageOrderDecimal: "",
      section5SubgroupNonnormalWitnessReplayed: false,
      section5SubgroupImageDivisor: 0,
      exactOrientationCoverDegreeComputed: false,
      rootLineConstantFlipVariableCount: 0,
      rootTransversalFullLinkFailureCount: 0,
      pointStabilizerLayerFailureCounts: [],
      storedRootLineCandidatePassed: false,
      actualQuotientWallComponentCountComputed: false,
      globalLawfulClosureAuthorized: false,
      globalTrackACertified: false,
    },
    replayStatus: "not-applicable",
  };
  if (importCertificate.replayStatus !== "passed-bundled-certificate") {
    return notApplicable;
  }

  const primitiveSealValid = canonicalSealValid(
    BUNDLED_PRIMITIVE_COCYCLE,
    "certificateSha256",
  );
  if (!primitiveSealValid) {
    throw new Error("The bundled P2 primitive cocycle has a stale seal.");
  }
  const primitiveSource = BUNDLED_PRIMITIVE_COCYCLE.sourceBinding;
  const primitiveChecks = BUNDLED_PRIMITIVE_COCYCLE.checks;
  const primitiveCocycle = BUNDLED_PRIMITIVE_COCYCLE.cocycle;
  const primitiveWitness = BUNDLED_PRIMITIVE_COCYCLE.primitiveCycleWitness;
  const importBindingMatches =
    isRecord(primitiveSource) &&
    primitiveSource.importCertificateBytesSha256 ===
      importCertificate.bytesSha256 &&
    primitiveSource.importCertificateSha256 ===
      importCertificate.certificateSha256;
  const exactTriangleClosure =
    isRecord(primitiveChecks) &&
    primitiveChecks.exactTriangleClosure === true &&
    isRecord(primitiveCocycle) &&
    primitiveCocycle.triangleCount === 156_000 &&
    primitiveCocycle.allTriangleSumsZero === true;
  const treeGaugeReplayed =
    isRecord(primitiveChecks) &&
    primitiveChecks.treeGaugeReplayed === true &&
    isRecord(primitiveCocycle) &&
    primitiveCocycle.treeGauge === true;
  const primitiveCycleWitnessReplayed =
    isRecord(primitiveChecks) &&
    primitiveChecks.primitiveIntegralCycleWitness === true &&
    isRecord(primitiveWitness) &&
    primitiveWitness.boundaryZero === true &&
    primitiveWitness.cocycleEvaluation === 1;
  if (
    BUNDLED_PRIMITIVE_COCYCLE.kind !==
      "makarov-p2-section5-x-primitive-integral-cocycle" ||
    !importBindingMatches ||
    !exactTriangleClosure ||
    !treeGaugeReplayed ||
    !primitiveCycleWitnessReplayed
  ) {
    throw new Error(
      "The bundled P2 primitive cocycle fails its source, closure, gauge, or primitive-witness replay.",
    );
  }

  const trackBSealValid = canonicalSealValid(
    BUNDLED_COMPRESSED_TRACK_B,
    "artifactSha256",
  );
  if (!trackBSealValid) {
    throw new Error(
      "The bundled P2 compressed Track B artifact has a stale seal.",
    );
  }
  const trackBSource = BUNDLED_COMPRESSED_TRACK_B.sourceBindings;
  const primitiveBinding = isRecord(trackBSource)
    ? trackBSource.primitiveCocycle
    : undefined;
  const primitiveCocycleBindingMatches =
    isRecord(primitiveBinding) &&
    primitiveBinding.bytesSha256 === BUNDLED_PRIMITIVE_COCYCLE_BYTES_SHA256 &&
    primitiveBinding.certificateSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE.certificateSha256;
  const identityLink = BUNDLED_COMPRESSED_TRACK_B.identityPullingLink;
  const polarities = isRecord(identityLink)
    ? identityLink.polarities
    : undefined;
  const negative = isRecord(polarities) ? polarities["-1"] : undefined;
  const positive = isRecord(polarities) ? polarities["1"] : undefined;
  const bothTiePolaritiesRejectedAtIdentity =
    isRecord(negative) &&
    Array.isArray(negative.failures) &&
    negative.failures.includes("ascending-empty") &&
    isRecord(positive) &&
    Array.isArray(positive.failures) &&
    positive.failures.includes("descending-empty");
  const rootedStateUnionCount =
    isRecord(identityLink) &&
    typeof identityLink.rootedStateUnionCount === "number"
      ? identityLink.rootedStateUnionCount
      : 0;
  if (
    BUNDLED_COMPRESSED_TRACK_B.kind !==
      "p2-section-5-factored-fixed-cocycle-track-b" ||
    BUNDLED_COMPRESSED_TRACK_B.status !== "fixed-model-obstructed-at-anchor" ||
    !primitiveCocycleBindingMatches ||
    rootedStateUnionCount !== 48_549 ||
    !bothTiePolaritiesRejectedAtIdentity
  ) {
    throw new Error(
      "The bundled P2 compressed Track B artifact fails its cocycle binding or identity-link obstruction replay.",
    );
  }

  const cocyclePortfolioSealValid = canonicalSealValid(
    BUNDLED_COCYCLE_SCREENING_PORTFOLIO,
    "artifactSha256",
  );
  const cocyclePortfolioSource = isRecord(BUNDLED_COCYCLE_SCREENING_PORTFOLIO)
    ? BUNDLED_COCYCLE_SCREENING_PORTFOLIO.sourceBinding
    : undefined;
  const cocyclePortfolioCandidates = isRecord(
    BUNDLED_COCYCLE_SCREENING_PORTFOLIO,
  )
    ? BUNDLED_COCYCLE_SCREENING_PORTFOLIO.candidates
    : undefined;
  const cocyclePortfolioIndependence = isRecord(
    BUNDLED_COCYCLE_SCREENING_PORTFOLIO,
  )
    ? BUNDLED_COCYCLE_SCREENING_PORTFOLIO.independence
    : undefined;
  const firstCocycleCandidate = Array.isArray(cocyclePortfolioCandidates)
    ? cocyclePortfolioCandidates[0]
    : undefined;
  const secondCocycleCandidate = Array.isArray(cocyclePortfolioCandidates)
    ? cocyclePortfolioCandidates[1]
    : undefined;
  const firstPortfolioCocycle = isRecord(firstCocycleCandidate)
    ? firstCocycleCandidate.primitiveCocycle
    : undefined;
  const firstPortfolioScreen = isRecord(firstCocycleCandidate)
    ? firstCocycleCandidate.cheapTrackBScreen
    : undefined;
  const secondPortfolioCocycle = isRecord(secondCocycleCandidate)
    ? secondCocycleCandidate.primitiveCocycle
    : undefined;
  const secondPortfolioScreen = isRecord(secondCocycleCandidate)
    ? secondCocycleCandidate.cheapTrackBScreen
    : undefined;
  const cocyclePortfolioImportBindingMatches =
    isRecord(cocyclePortfolioSource) &&
    cocyclePortfolioSource.section5ImportBytesSha256 ===
      importCertificate.bytesSha256 &&
    cocyclePortfolioSource.section5ImportCertificateSha256 ===
      importCertificate.certificateSha256;
  const cocyclePortfolioReplayed =
    cocyclePortfolioSealValid &&
    BUNDLED_COCYCLE_SCREENING_PORTFOLIO.kind ===
      "makarov-p2-primitive-cocycle-track-b-screening-portfolio" &&
    BUNDLED_COCYCLE_SCREENING_PORTFOLIO.status ===
      "two-independent-primitive-classes-cheap-screened" &&
    cocyclePortfolioImportBindingMatches &&
    Array.isArray(cocyclePortfolioCandidates) &&
    cocyclePortfolioCandidates.length === 2 &&
    isRecord(firstCocycleCandidate) &&
    firstCocycleCandidate.id === "eigen-mmm" &&
    JSON.stringify(firstCocycleCandidate.cohomologyEigencharacter) ===
      JSON.stringify([-1, -1, -1]) &&
    isRecord(firstPortfolioCocycle) &&
    firstPortfolioCocycle.bytesSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE_BYTES_SHA256 &&
    firstPortfolioCocycle.certificateSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE.certificateSha256 &&
    firstPortfolioCocycle.triangleCountVerified === 156_000 &&
    firstPortfolioCocycle.primitiveCycleEvaluation === 1 &&
    isRecord(firstPortfolioScreen) &&
    firstPortfolioScreen.bytesSha256 ===
      BUNDLED_COMPRESSED_TRACK_B_BYTES_SHA256 &&
    firstPortfolioScreen.artifactSha256 ===
      BUNDLED_COMPRESSED_TRACK_B.artifactSha256 &&
    firstPortfolioScreen.status === "fixed-model-obstructed-at-anchor" &&
    firstPortfolioScreen.checkedQuotientVertexCount === 1 &&
    isRecord(secondCocycleCandidate) &&
    secondCocycleCandidate.id === "eigen-mmp" &&
    JSON.stringify(secondCocycleCandidate.cohomologyEigencharacter) ===
      JSON.stringify([-1, -1, 1]) &&
    isRecord(secondPortfolioCocycle) &&
    secondPortfolioCocycle.bytesSha256 ===
      "2ca2dff68016625d40eb61b8d1b1e87ca53c0d5ef7c708f5109f7e64ad5b7d9a" &&
    secondPortfolioCocycle.certificateSha256 ===
      "b4a90749558665ace4cf538796d5af0d8b3eecfa3526d2e93dbf3ad58f4b2e60" &&
    secondPortfolioCocycle.triangleCountVerified === 156_000 &&
    secondPortfolioCocycle.primitiveCycleEvaluation === 1 &&
    isRecord(secondPortfolioScreen) &&
    secondPortfolioScreen.bytesSha256 ===
      "61a8930cbf6d6ba11456adcebd36d5c7f523bf4d01df6392d826790f08001796" &&
    secondPortfolioScreen.artifactSha256 ===
      "a3c0f02b6d4e01498d42d1a5e4f7abed28f2b6eb6373b98ecc2a071916169477" &&
    secondPortfolioScreen.status === "fixed-model-obstructed-at-anchor" &&
    secondPortfolioScreen.checkedQuotientVertexCount === 1 &&
    isRecord(cocyclePortfolioIndependence) &&
    cocyclePortfolioIndependence.coefficientField === "Q" &&
    cocyclePortfolioIndependence.proved === true &&
    cocyclePortfolioIndependence.witnessGenerator === 4 &&
    JSON.stringify(cocyclePortfolioIndependence.eigenvalues) ===
      JSON.stringify([-1, 1]);
  if (!cocyclePortfolioReplayed) {
    throw new Error(
      "The bundled P2 cocycle-screening portfolio does not replay its two primitive classes, cheap anchor screens, and exact independence witness.",
    );
  }

  const coarseTrackBSealValid = canonicalSealValid(
    BUNDLED_COARSE_TRACK_B,
    "certificateSha256",
  );
  if (!coarseTrackBSealValid) {
    throw new Error("The bundled P2 coarse Track B artifact has a stale seal.");
  }
  const coarseSource = BUNDLED_COARSE_TRACK_B.sourceBinding;
  const coarsePrimitiveCocycleBindingMatches =
    isRecord(coarseSource) &&
    coarseSource.primitiveCocycleBytesSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE_BYTES_SHA256 &&
    coarseSource.primitiveCocycleCertificateSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE.certificateSha256;
  const coarseConclusions = BUNDLED_COARSE_TRACK_B.conclusions;
  const coarseRuns = BUNDLED_COARSE_TRACK_B.runs;
  const coarsePositive = Array.isArray(coarseRuns)
    ? coarseRuns.find((run) => isRecord(run) && run.polarity === 1)
    : undefined;
  const coarseNegative = Array.isArray(coarseRuns)
    ? coarseRuns.find((run) => isRecord(run) && run.polarity === -1)
    : undefined;
  const bothCanonicalPerturbationPolaritiesRejectedAtRoot =
    isRecord(coarseConclusions) &&
    coarseConclusions.bothCanonicalPerturbationPolaritiesObstructed === true &&
    coarseConclusions.coarseTrackBPassed === false &&
    isRecord(coarsePositive) &&
    coarsePositive.status === "failed" &&
    coarsePositive.firstFailure === "ascending-disconnected" &&
    coarsePositive.translationReducedRootsChecked === 1 &&
    coarsePositive.coloredQuotientVerticesRepresentedByCheckedRoot === 256 &&
    isRecord(coarseNegative) &&
    coarseNegative.status === "failed" &&
    coarseNegative.firstFailure === "descending-disconnected" &&
    coarseNegative.translationReducedRootsChecked === 1 &&
    coarseNegative.coloredQuotientVerticesRepresentedByCheckedRoot === 256;
  if (
    BUNDLED_COARSE_TRACK_B.kind !==
      "makarov-p2-section5-coarse-order-complex-track-b" ||
    !coarsePrimitiveCocycleBindingMatches ||
    !bothCanonicalPerturbationPolaritiesRejectedAtRoot
  ) {
    throw new Error(
      "The bundled P2 coarse Track B artifact fails its cocycle binding or scoped root-obstruction replay.",
    );
  }

  const trackASealValid = canonicalSealValid(
    BUNDLED_GENERALIZED_TRACK_A,
    "certificateSha256",
  );
  if (!trackASealValid) {
    throw new Error(
      "The bundled P2 generalized Track A audit has a stale seal.",
    );
  }
  const trackASource = BUNDLED_GENERALIZED_TRACK_A.sourceBinding;
  const trackAPrimitiveCocycleBindingMatches =
    isRecord(trackASource) &&
    trackASource.primitiveCocycleBytesSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE_BYTES_SHA256 &&
    trackASource.primitiveCocycleCertificateSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE.certificateSha256;
  const strictTrackA = BUNDLED_GENERALIZED_TRACK_A.strictGeneralizedTrackA;
  const trackAConclusions = BUNDLED_GENERALIZED_TRACK_A.conclusions;
  const trackACofaces = BUNDLED_GENERALIZED_TRACK_A.cofaceClosedLawfulRetention;
  const trackALinks = BUNDLED_GENERALIZED_TRACK_A.directedLinkCalculation;
  const finiteHeightBand = BUNDLED_GENERALIZED_TRACK_A.finiteHeightBandGate;
  const simplicialSurrogate =
    BUNDLED_GENERALIZED_TRACK_A.simplicialLawfulnessSurrogate;
  const mixedPotential = BUNDLED_GENERALIZED_TRACK_A.mixedPotentialProbe;
  const strictWallTrackAInputIncomplete =
    isRecord(strictTrackA) &&
    strictTrackA.statusForExplicitPrimitiveCharacter ===
      "obstructed-not-in-rational-wall-span" &&
    strictTrackA.statusForOtherWallCharacters ===
      "not-run-fine-wall-partition-not-reconstructed" &&
    isRecord(trackAConclusions) &&
    trackAConclusions.boundedAttemptStatus ===
      "fixed-character-wall-track-a-obstructed-direct-variant-open" &&
    trackAConclusions.explicitCharacterWallTrackAObstructed === true &&
    trackAConclusions.otherWallCharacterSearchRun === false;
  const trackAWallCompatibility = isRecord(strictTrackA)
    ? strictTrackA.fixedCharacterWallCompatibility
    : undefined;
  const trackAWallCompatibilityBindingMatches =
    isRecord(trackAWallCompatibility) &&
    isRecord(BUNDLED_WALL_COMPATIBILITY) &&
    trackAWallCompatibility.artifactSha256 ===
      BUNDLED_WALL_COMPATIBILITY.artifactSha256;
  const missingRequiredObjectCount =
    isRecord(strictTrackA) && Array.isArray(strictTrackA.requiredMissingObjects)
      ? strictTrackA.requiredMissingObjects.length
      : 0;
  const directCocycleTrackANotRun =
    isRecord(trackACofaces) &&
    trackACofaces.retainedCellSet === null &&
    trackACofaces.downwardClosureVerified === false &&
    trackACofaces.statusForDirectCocycleVariant === "not-run" &&
    isRecord(trackAConclusions) &&
    trackAConclusions.directCocycleTrackARun === false &&
    isRecord(trackALinks) &&
    trackALinks.status === "stopped-at-missing-lawful-retained-set" &&
    trackALinks.allRetainedSubdivisionVerticesChecked === false &&
    isRecord(simplicialSurrogate) &&
    simplicialSurrogate.strictWallTrackAAdmissible === false &&
    simplicialSurrogate.directCocycleLawfulDeletionCertified === false;
  const finiteHeightBandNotRun =
    isRecord(finiteHeightBand) &&
    finiteHeightBand.status ===
      "not-run-missing-lawful-complex-and-global-links" &&
    finiteHeightBand.mandatoryForTrackAPromotion === true &&
    finiteHeightBand.asphericityRequired === false;
  const formerTrackBRootObstructionRepairedByLocalPotential =
    isRecord(mixedPotential) &&
    mixedPotential.status === "passed-at-former-obstruction-root" &&
    mixedPotential.formerNormalS0ObstructionDisappears === true &&
    mixedPotential.coloredCopiesOfFormerRootCovered === 256 &&
    mixedPotential.globalDirectedLinksChecked === false;
  if (
    BUNDLED_GENERALIZED_TRACK_A.kind !==
      "makarov-p2-section5-generalized-track-a-bounded-attempt" ||
    !trackAPrimitiveCocycleBindingMatches ||
    !trackAWallCompatibilityBindingMatches ||
    !strictWallTrackAInputIncomplete ||
    missingRequiredObjectCount !== 3 ||
    !directCocycleTrackANotRun ||
    !finiteHeightBandNotRun ||
    !formerTrackBRootObstructionRepairedByLocalPotential
  ) {
    throw new Error(
      "The bundled P2 Track A audit does not replay its input-incomplete boundary and local-potential scope.",
    );
  }

  const wallCompatibilitySealValid = canonicalSealValid(
    BUNDLED_WALL_COMPATIBILITY,
    "artifactSha256",
  );
  if (!wallCompatibilitySealValid) {
    throw new Error(
      "The bundled P2 wall-compatibility artifact has a stale seal.",
    );
  }
  const wallSources = BUNDLED_WALL_COMPATIBILITY.sourceBindings;
  const wallPrimitiveBinding = isRecord(wallSources)
    ? wallSources.primitiveCocycle
    : undefined;
  const wallPrimitiveCocycleBindingMatches =
    isRecord(wallPrimitiveBinding) &&
    wallPrimitiveBinding.bytesSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE_BYTES_SHA256 &&
    wallPrimitiveBinding.certificateSha256 ===
      BUNDLED_PRIMITIVE_COCYCLE.certificateSha256;
  const wallClassAudit = BUNDLED_WALL_COMPATIBILITY.cohomologyClassAudit;
  const wallTrackA = BUNDLED_WALL_COMPATIBILITY.trackA;
  const explicitCharacterNotInRationalWallSpan =
    BUNDLED_WALL_COMPATIBILITY.status ===
      "explicit-character-not-in-rational-wall-span" &&
    isRecord(wallClassAudit) &&
    wallClassAudit.rationalSolutionExists === false &&
    wallClassAudit.integralSolutionExists === false &&
    wallClassAudit.gaugeIndependentConclusion === true &&
    wallClassAudit.cohomologousPeriodicPotentialCanRepair === false &&
    wallClassAudit.saturationCanRepair === false &&
    wallClassAudit.sectionPullbackPrimitiveReplayed === true &&
    wallClassAudit.importAndIncidenceCrossBindingReplayed === true &&
    wallClassAudit.primitiveCycleEvaluation === 1 &&
    isRecord(wallTrackA) &&
    wallTrackA.statusForExplicitPrimitiveCharacter ===
      "obstructed-before-lawful-cell-construction" &&
    wallTrackA.cofaceClosedLawfulSetConstructed === false &&
    wallTrackA.finiteHeightBandPi1SurjectionGateRun === false;
  if (
    BUNDLED_WALL_COMPATIBILITY.kind !==
      "makarov-p2-section5-wall-compatibility-obstruction" ||
    !wallPrimitiveCocycleBindingMatches ||
    !explicitCharacterNotInRationalWallSpan
  ) {
    throw new Error(
      "The bundled P2 wall-compatibility artifact fails its fixed-character scope or rational-span replay.",
    );
  }

  const wallCoorientationSealValid = canonicalSealValid(
    BUNDLED_WALL_COORIENTATION,
    "artifactSha256",
  );
  if (!wallCoorientationSealValid) {
    throw new Error(
      "The bundled P2 wall-coorientability obstruction has a stale seal.",
    );
  }
  const coorientationSources = BUNDLED_WALL_COORIENTATION.sourceBindings;
  const coorientationImport = isRecord(coorientationSources)
    ? coorientationSources.section5ImportCertificate
    : undefined;
  const coorientationAudit =
    BUNDLED_WALL_COORIENTATION.allSmallFacetLabelsAudit;
  const coorientationWitness =
    BUNDLED_WALL_COORIENTATION.explicitRootWallWitness;
  const wallConclusion = BUNDLED_WALL_COORIENTATION.wallConclusion;
  const type6Family = BUNDLED_WALL_COORIENTATION.type6PartialWallFamily;
  const wallTrackAConsequences = BUNDLED_WALL_COORIENTATION.trackAConsequences;
  const dependencies = isRecord(coorientationAudit)
    ? coorientationAudit.dependencies
    : undefined;
  const dependenciesReplay =
    Array.isArray(dependencies) &&
    dependencies.length === 13 &&
    dependencies.every(
      (dependency) =>
        isRecord(dependency) &&
        dependency.xor === dependency.ownMask &&
        Array.isArray(dependency.neighborColors) &&
        dependency.neighborColors.length === 5,
    );
  const fullWallCoorientationObstructed =
    BUNDLED_WALL_COORIENTATION.kind ===
      "makarov-p2-section5-full-wall-coorientability-obstruction" &&
    BUNDLED_WALL_COORIENTATION.status === "full-wall-system-not-coorientable" &&
    isRecord(coorientationImport) &&
    coorientationImport.certificateSha256 ===
      importCertificate.certificateSha256 &&
    isRecord(coorientationAudit) &&
    coorientationAudit.labelsPassingFullSpanTest === 650 &&
    coorientationAudit.neighborColorRankAtEveryLabel === 9 &&
    dependenciesReplay &&
    isRecord(coorientationWitness) &&
    coorientationWitness.stabilizerWordLength === 56 &&
    coorientationWitness.fixesRootActionState === true &&
    coorientationWitness.reversesTheRootType5Wall === true &&
    isRecord(wallConclusion) &&
    wallConclusion.everyType5WallComponentOneSided === true &&
    wallConclusion.fullWallSystemCoorientable === false &&
    isRecord(type6Family) &&
    type6Family.wallCount === 256 &&
    type6Family.twoSided === true &&
    type6Family.strictTrackAHeightAdmissible === false &&
    isRecord(wallTrackAConsequences) &&
    wallTrackAConsequences.strictWallTrackAStatus ===
      "blocked-one-sided-ambient-wall-system" &&
    wallTrackAConsequences.globalLawfulCellClosureDefined === false &&
    wallTrackAConsequences.directedLinksDefined === false &&
    wallTrackAConsequences.directCocycleTrackAStatus ===
      "unaffected-by-wall-one-sidedness";
  if (!fullWallCoorientationObstructed) {
    throw new Error(
      "The bundled P2 wall-coorientability artifact does not replay its current-cover one-sidedness scope.",
    );
  }

  const colorClassWallSealValid = canonicalSealValid(
    BUNDLED_COLOR_CLASS_WALL_ORIENTATION,
    "artifactSha256",
  );
  if (!colorClassWallSealValid) {
    throw new Error(
      "The bundled P2 color-class wall-orientation obstruction has a stale seal.",
    );
  }
  const colorClassSources = BUNDLED_COLOR_CLASS_WALL_ORIENTATION.sourceBindings;
  const colorClassWallSource = isRecord(colorClassSources)
    ? colorClassSources.currentCoverWallObstruction
    : undefined;
  const type5Extension =
    BUNDLED_COLOR_CLASS_WALL_ORIENTATION.type5MinimalColorClassExtension;
  const projectedSideWalls =
    BUNDLED_COLOR_CLASS_WALL_ORIENTATION.projectedSideWallAudit;
  const colorClassConclusion =
    BUNDLED_COLOR_CLASS_WALL_ORIENTATION.globalConclusion;
  const colorClassWallOrientationObstructed =
    BUNDLED_COLOR_CLASS_WALL_ORIENTATION.kind ===
      "makarov-p2-section5-color-class-wall-orientation-obstruction" &&
    BUNDLED_COLOR_CLASS_WALL_ORIENTATION.status ===
      "color-class-only-orientation-covers-obstructed" &&
    isRecord(colorClassWallSource) &&
    colorClassWallSource.artifactSha256 ===
      BUNDLED_WALL_COORIENTATION.artifactSha256 &&
    isRecord(type5Extension) &&
    type5Extension.coverIndexOverCurrentAction === 16 &&
    type5Extension.type5ObstructionRepaired === true &&
    isRecord(projectedSideWalls) &&
    projectedSideWalls.projectiveRootClassCount === 300 &&
    projectedSideWalls.nonbipartiteColorGraphCount === 300 &&
    projectedSideWalls.oddCycleLengthCensus !== undefined &&
    isRecord(colorClassConclusion) &&
    colorClassConclusion.minimalSixteenFoldColorClassRepairHasFullWallCoorientation ===
      false &&
    colorClassConclusion.anyColorClassOnlyVoltageExtensionCanHaveFullWallCoorientation ===
      false &&
    colorClassConclusion.lawfulCellClosureDefinedForTheseCovers === false &&
    colorClassConclusion.directedLinkCalculationRun === false;
  if (!colorClassWallOrientationObstructed) {
    throw new Error(
      "The bundled P2 color-class wall-orientation artifact does not replay its side-wall parity obstruction.",
    );
  }

  const globalReadinessSealValid = canonicalSealValid(
    BUNDLED_GLOBAL_LAWFUL_READINESS,
    "artifactSha256",
  );
  if (!globalReadinessSealValid) {
    throw new Error(
      "The bundled P2 global lawful-readiness artifact has a stale seal.",
    );
  }
  const readinessSources = BUNDLED_GLOBAL_LAWFUL_READINESS.sourceBinding;
  const readinessWallSource = isRecord(readinessSources)
    ? readinessSources.wallCoorientationObstruction
    : undefined;
  const readinessColorSource = isRecord(readinessSources)
    ? readinessSources.colorClassWallOrientationObstruction
    : undefined;
  const readinessBlockingGate = BUNDLED_GLOBAL_LAWFUL_READINESS.blockingGate;
  const readinessUnreduced =
    BUNDLED_GLOBAL_LAWFUL_READINESS.unreducedCurrentCover;
  const readinessStream =
    BUNDLED_GLOBAL_LAWFUL_READINESS.conditionalSheetTranslationInvariantStream;
  const readinessHeight =
    BUNDLED_GLOBAL_LAWFUL_READINESS.canonicalBarycentricHeightRule;
  const readinessHeightChecks = isRecord(readinessHeight)
    ? readinessHeight.checks
    : undefined;
  const readinessPromotion = BUNDLED_GLOBAL_LAWFUL_READINESS.promotionGates;
  const readinessColorAudit =
    BUNDLED_GLOBAL_LAWFUL_READINESS.colorClassOnlyOrientationCoverAudit;
  const globalLawfulReadinessReplayed =
    BUNDLED_GLOBAL_LAWFUL_READINESS.kind ===
      "makarov-p2-conditional-factored-global-lawful-cost" &&
    BUNDLED_GLOBAL_LAWFUL_READINESS.status ===
      "downstream-not-run-no-wall-coorientation-on-current-cover" &&
    isRecord(readinessWallSource) &&
    readinessWallSource.artifactSha256 ===
      BUNDLED_WALL_COORIENTATION.artifactSha256 &&
    isRecord(readinessColorSource) &&
    readinessColorSource.artifactSha256 ===
      BUNDLED_COLOR_CLASS_WALL_ORIENTATION.artifactSha256 &&
    isRecord(readinessBlockingGate) &&
    readinessBlockingGate.result === "failed-for-every-generator-5-wall" &&
    isRecord(readinessUnreduced) &&
    readinessUnreduced.totalCellCount === 57_793_049_600 &&
    isRecord(readinessStream) &&
    readinessStream.totalCellTemplateCount === 176_905_950 &&
    readinessStream.rankTwoCellTemplateCount === 66_456_000 &&
    isRecord(readinessHeightChecks) &&
    readinessHeightChecks.subdivisionCanonicalAndFaceCompatible === true &&
    isRecord(readinessPromotion) &&
    readinessPromotion.runOnCurrentCover === false &&
    isRecord(readinessColorAudit) &&
    readinessColorAudit.status ===
      "color-class-only-orientation-covers-obstructed" &&
    readinessColorAudit.projectedSideWallConflictCount === 300;
  if (!globalLawfulReadinessReplayed) {
    throw new Error(
      "The bundled P2 global lawful-readiness artifact does not replay its exact no-run gate and conditional workload.",
    );
  }

  const type6TrackBSealValid = canonicalSealValid(
    BUNDLED_TYPE6_TRACK_B,
    "artifactSha256",
  );
  if (!type6TrackBSealValid) {
    throw new Error("The bundled P2 type-6 Track B artifact has a stale seal.");
  }
  const type6Sources = BUNDLED_TYPE6_TRACK_B.sourceBindings;
  const type6ImportSource = isRecord(type6Sources)
    ? type6Sources.section5ImportCertificate
    : undefined;
  const type6WallSource = isRecord(type6Sources)
    ? type6Sources.wallCoorientationCertificate
    : undefined;
  const type6Cocycle = BUNDLED_TYPE6_TRACK_B.wallCocycle;
  const type6Primitivity = BUNDLED_TYPE6_TRACK_B.primitivity;
  const type6Identity = BUNDLED_TYPE6_TRACK_B.identityPullingLink;
  const type6Polarities = isRecord(type6Identity)
    ? type6Identity.polarities
    : undefined;
  const type6Negative = isRecord(type6Polarities)
    ? type6Polarities["-1"]
    : undefined;
  const type6Positive = isRecord(type6Polarities)
    ? type6Polarities["1"]
    : undefined;
  const type6Global = BUNDLED_TYPE6_TRACK_B.globalOrbitReductionAssessment;
  const type6TrackBAnchorSurvived =
    BUNDLED_TYPE6_TRACK_B.kind === "makarov-p2-type6-wall-cocycle-track-b" &&
    BUNDLED_TYPE6_TRACK_B.status ===
      "primitive-cocycle-one-identity-polarity-passed" &&
    isRecord(type6ImportSource) &&
    type6ImportSource.certificateSha256 ===
      importCertificate.certificateSha256 &&
    isRecord(type6WallSource) &&
    type6WallSource.artifactSha256 ===
      BUNDLED_WALL_COORIENTATION.artifactSha256 &&
    isRecord(type6Cocycle) &&
    type6Cocycle.twoSided === true &&
    type6Cocycle.allFiniteRankTwoBoundarySumsZero === true &&
    type6Cocycle.wallCount === 256 &&
    isRecord(type6Primitivity) &&
    type6Primitivity.primitiveIntegralCharacter === true &&
    type6Primitivity.cocycleEvaluation === -1 &&
    isRecord(type6Negative) &&
    type6Negative.status === "identity-link-passed" &&
    type6Negative.ascendingVertexCount === 14_647 &&
    type6Negative.descendingVertexCount === 33_901 &&
    type6Negative.ascendingComponentCount === 1 &&
    type6Negative.descendingComponentCount === 1 &&
    isRecord(type6Positive) &&
    type6Positive.status === "failed" &&
    type6Positive.descendingVertexCount === 0 &&
    Array.isArray(type6Positive.failures) &&
    type6Positive.failures.includes("descending-empty") &&
    isRecord(type6Global) &&
    type6Global.globalScanRun === false &&
    type6Global.quotientVertexCount === 4_792_320_000 &&
    type6Global.localTemplateOrAutomatonReduction === "open" &&
    type6Global.status === "no-nontrivial-global-order-symmetry-certified";
  if (!type6TrackBAnchorSurvived) {
    throw new Error(
      "The bundled P2 type-6 Track B artifact does not replay its primitive cocycle, identity-anchor survivor, and global no-run boundary.",
    );
  }

  const type6BarycentricSealValid = canonicalSealValid(
    BUNDLED_TYPE6_BARYCENTRIC_REDUCTION,
    "artifactSha256",
  );
  const barycentricSources = isRecord(BUNDLED_TYPE6_BARYCENTRIC_REDUCTION)
    ? BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.sourceBindings
    : undefined;
  const barycentricType6Source = isRecord(barycentricSources)
    ? barycentricSources.type6Character
    : undefined;
  const barycentricSymmetry = isRecord(BUNDLED_TYPE6_BARYCENTRIC_REDUCTION)
    ? BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.fixedCharacterSymmetry
    : undefined;
  const barycentricNoGo = isRecord(BUNDLED_TYPE6_BARYCENTRIC_REDUCTION)
    ? BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.rawDominantTypeOnlyNoGo
    : undefined;
  const dimensionFailures = isRecord(barycentricNoGo)
    ? barycentricNoGo.canonicalDimensionTieFailures
    : undefined;
  const positiveDimensionFailure = isRecord(dimensionFailures)
    ? dimensionFailures["+dimension"]
    : undefined;
  const negativeDimensionFailure = isRecord(dimensionFailures)
    ? dimensionFailures["-dimension"]
    : undefined;
  const barycentricTemplates = isRecord(BUNDLED_TYPE6_BARYCENTRIC_REDUCTION)
    ? BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.typeTemplateAudit
    : undefined;
  const barycentricFourier = isRecord(BUNDLED_TYPE6_BARYCENTRIC_REDUCTION)
    ? BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.fourierFrameDependence
    : undefined;
  const barycentricWorkload = isRecord(BUNDLED_TYPE6_BARYCENTRIC_REDUCTION)
    ? BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.workload
    : undefined;
  const barycentricScanner = isRecord(BUNDLED_TYPE6_BARYCENTRIC_REDUCTION)
    ? BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.exactOrbitCompleteScanner
    : undefined;
  const type6BarycentricReplayed =
    type6BarycentricSealValid &&
    BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.kind ===
      "makarov-p2-type6-barycentric-orbit-reduction" &&
    BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.status ===
      "exact-reduction-global-fourier-links-not-yet-run" &&
    isRecord(barycentricType6Source) &&
    barycentricType6Source.artifactSha256 ===
      BUNDLED_TYPE6_TRACK_B.artifactSha256 &&
    isRecord(barycentricSymmetry) &&
    barycentricSymmetry.fixedProductSymmetryOrder === 32_000 &&
    barycentricSymmetry.originalChamberOrbitCount === 149_760 &&
    isRecord(barycentricNoGo) &&
    barycentricNoGo.status === "obstructed" &&
    isRecord(positiveDimensionFailure) &&
    positiveDimensionFailure.unreducedWitnessCount === 2_396_160_000 &&
    isRecord(negativeDimensionFailure) &&
    negativeDimensionFailure.unreducedWitnessCount === 22_630_400 &&
    isRecord(barycentricTemplates) &&
    barycentricTemplates.typeOnlyLocalTemplateCount === 124 &&
    isRecord(barycentricFourier) &&
    barycentricFourier.sameSphericalTypeDifferentFrameAverage === true &&
    isRecord(barycentricWorkload) &&
    barycentricWorkload.fixedSymmetryCellBarycenterOrbitLowerBound ===
      1_806_033 &&
    isRecord(barycentricScanner) &&
    barycentricScanner.status === "specified-not-completed";
  if (!type6BarycentricReplayed) {
    throw new Error(
      "The bundled P2 type-6 barycentric artifact does not replay its exact symmetry, scoped type-only obstruction, and global no-run boundary.",
    );
  }

  // This artifact contains an exact CP-SAT integer outside JavaScript's safe
  // range. Bind its Python-replayed seal and file digest instead of reparsing
  // that integer through JSON number semantics here.
  const facetBinarySealValid =
    isRecord(BUNDLED_FACET_BINARY_ORIENTATION) &&
    BUNDLED_FACET_BINARY_ORIENTATION.artifactSha256 ===
      BUNDLED_FACET_BINARY_ORIENTATION_ARTIFACT_SHA256;
  const facetSources = isRecord(BUNDLED_FACET_BINARY_ORIENTATION)
    ? BUNDLED_FACET_BINARY_ORIENTATION.sourceBindings
    : undefined;
  const facetImportSource = isRecord(facetSources)
    ? facetSources.section5Import
    : undefined;
  const facetColorSource = isRecord(facetSources)
    ? facetSources.colorClassObstruction
    : undefined;
  const facetCoorientation = isRecord(BUNDLED_FACET_BINARY_ORIENTATION)
    ? BUNDLED_FACET_BINARY_ORIENTATION.fullWallCoorientation
    : undefined;
  const facetVoltage = isRecord(BUNDLED_FACET_BINARY_ORIENTATION)
    ? BUNDLED_FACET_BINARY_ORIENTATION.voltageSpaceAudit
    : undefined;
  const facetComparison = isRecord(BUNDLED_FACET_BINARY_ORIENTATION)
    ? BUNDLED_FACET_BINARY_ORIENTATION.comparison
    : undefined;
  const facetRank14 = isRecord(BUNDLED_FACET_BINARY_ORIENTATION)
    ? BUNDLED_FACET_BINARY_ORIENTATION.rank14Impossibility
    : undefined;
  const facetRank15 = isRecord(BUNDLED_FACET_BINARY_ORIENTATION)
    ? BUNDLED_FACET_BINARY_ORIENTATION.rank15BoundedSearch
    : undefined;
  const facetAnchor = isRecord(BUNDLED_FACET_BINARY_ORIENTATION)
    ? BUNDLED_FACET_BINARY_ORIENTATION.identityRankTwoAnchor
    : undefined;
  const facetAscending = isRecord(facetAnchor)
    ? facetAnchor.ascendingLink
    : undefined;
  const facetBinaryReplayed =
    facetBinarySealValid &&
    BUNDLED_FACET_BINARY_ORIENTATION.kind ===
      "makarov-p2-facet-specific-binary-wall-orientation-cover" &&
    BUNDLED_FACET_BINARY_ORIENTATION.status ===
      "valid-rank312-cover-rank15-unresolved" &&
    isRecord(facetImportSource) &&
    facetImportSource.certificateSha256 ===
      importCertificate.certificateSha256 &&
    isRecord(facetColorSource) &&
    facetColorSource.artifactSha256 ===
      BUNDLED_COLOR_CLASS_WALL_ORIENTATION.artifactSha256 &&
    isRecord(facetCoorientation) &&
    facetCoorientation.proved === true &&
    facetCoorientation.lawfulClosureRun === false &&
    facetCoorientation.directedLinksRun === false &&
    isRecord(facetVoltage) &&
    facetVoltage.combinedSheetRank === 312 &&
    isRecord(facetComparison) &&
    facetComparison.relativeBinaryCoverIndexPowerOfTwoExponent === 303 &&
    isRecord(facetRank14) &&
    facetRank14.oneExtraFacetBitPossible === false &&
    facetRank14.minimumTotalSheetRankInScope === 15 &&
    isRecord(facetRank15) &&
    facetRank15.status === "unknown" &&
    isRecord(facetAnchor) &&
    facetAnchor.status === "failed-ascending-link-disconnected" &&
    facetAnchor.globalCalculationRun === false &&
    isRecord(facetAscending) &&
    facetAscending.connected === false;
  if (!facetBinaryReplayed) {
    throw new Error(
      "The bundled P2 facet-specific orientation artifact does not replay its valid large cover and scoped local failure.",
    );
  }

  const wallFlipCegarSealValid = canonicalSealValid(
    BUNDLED_WALL_FLIP_CEGAR,
    "artifactSha256",
  );
  const wallFlipSources = isRecord(BUNDLED_WALL_FLIP_CEGAR)
    ? BUNDLED_WALL_FLIP_CEGAR.sourceBindings
    : undefined;
  const wallFlipCoverSource = isRecord(wallFlipSources)
    ? wallFlipSources.rank312OrientationCover
    : undefined;
  const wallFlipScope = isRecord(BUNDLED_WALL_FLIP_CEGAR)
    ? BUNDLED_WALL_FLIP_CEGAR.searchScope
    : undefined;
  const wallFlipVariables = isRecord(wallFlipScope)
    ? wallFlipScope.variables
    : undefined;
  const wallFlipWitness = isRecord(BUNDLED_WALL_FLIP_CEGAR)
    ? BUNDLED_WALL_FLIP_CEGAR.fullRankWitness
    : undefined;
  const wallFlipPrecheck = isRecord(BUNDLED_WALL_FLIP_CEGAR)
    ? BUNDLED_WALL_FLIP_CEGAR.exactBooleanCegarPrecheck
    : undefined;
  const wallFlipConclusion = isRecord(BUNDLED_WALL_FLIP_CEGAR)
    ? BUNDLED_WALL_FLIP_CEGAR.conclusion
    : undefined;
  const wallFlipNonClaims = isRecord(BUNDLED_WALL_FLIP_CEGAR)
    ? BUNDLED_WALL_FLIP_CEGAR.nonClaims
    : undefined;
  const wallFlipCegarReplayed =
    wallFlipCegarSealValid &&
    BUNDLED_WALL_FLIP_CEGAR.kind ===
      "makarov-p2-translation-equivariant-wall-flip-cegar" &&
    BUNDLED_WALL_FLIP_CEGAR.status ===
      "exact-unsat-empty-directed-link-in-scoped-ansatz" &&
    isRecord(wallFlipCoverSource) &&
    wallFlipCoverSource.artifactSha256 ===
      BUNDLED_FACET_BINARY_ORIENTATION.artifactSha256 &&
    isRecord(wallFlipVariables) &&
    wallFlipVariables.total === 951 &&
    isRecord(wallFlipWitness) &&
    wallFlipWitness.wordLength === 1 &&
    wallFlipWitness.sheetFunctionalRank === 7 &&
    isRecord(wallFlipPrecheck) &&
    wallFlipPrecheck.cegarDisposition ===
      "exact-unsat-at-initial-nonempty-link-gate" &&
    wallFlipPrecheck.incidentFlipAssignmentCount === 128 &&
    wallFlipPrecheck.incidentFlipAssignmentsPassingNonemptyBothSides === 0 &&
    wallFlipPrecheck.rankTwoLawfulnessConstraintsAdded === 0 &&
    isRecord(wallFlipConclusion) &&
    wallFlipConclusion.translationEquivariantOrbitFlipCandidateExists ===
      false &&
    wallFlipConclusion.globalLawfulClosureRun === false &&
    wallFlipConclusion.globalDirectedLinksRun === false &&
    Array.isArray(wallFlipNonClaims) &&
    wallFlipNonClaims.includes(
      "This does not rule out independent flips of sheet-resolved wall components.",
    );
  if (!wallFlipCegarReplayed) {
    throw new Error(
      "The bundled P2 wall-flip CEGAR artifact does not replay its scoped 951-variable empty-link obstruction.",
    );
  }

  // These CP-SAT artifacts contain replay metadata whose decimal spelling is
  // Python-owned. Bind their independently replayed seals and file digests,
  // then check the mathematical frontier fields used by the TypeScript plan.
  const sheetResolvedSealValid =
    isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP) &&
    BUNDLED_SHEET_RESOLVED_WALL_FLIP.artifactSha256 ===
      BUNDLED_SHEET_RESOLVED_WALL_FLIP_ARTIFACT_SHA256;
  const sheetUnrestrictedSealValid =
    isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED) &&
    BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED.artifactSha256 ===
      BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_ARTIFACT_SHA256;
  const sheetSources = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.sourceBindings
    : undefined;
  const sheetCoverSource = isRecord(sheetSources)
    ? sheetSources.rank312OrientationCover
    : undefined;
  const sheetComponentAudit = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.liftedWallComponentAudit
    : undefined;
  const sheetComponentKeyRules = isRecord(sheetComponentAudit)
    ? sheetComponentAudit.componentKeyRules
    : undefined;
  const sheetBaseWallAudit = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.baseWallComponentAudit
    : undefined;
  const sheetBaseTypeAudit = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.baseType5Type6ComponentAudit
    : undefined;
  const sheetType5Audit = isRecord(sheetBaseTypeAudit)
    ? sheetBaseTypeAudit.type5BaseFibre
    : undefined;
  const sheetType6Audit = isRecord(sheetBaseTypeAudit)
    ? sheetBaseTypeAudit.type6BaseFibre
    : undefined;
  const sheetFrontier = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.boundedFrontier
    : undefined;
  const sheetSearchScope = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.searchScope
    : undefined;
  const sheetAssignment = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.survivorAssignment
    : undefined;
  const sheetAssignmentReplay = isRecord(sheetAssignment)
    ? sheetAssignment.exactReplay
    : undefined;
  const sheetRule = isRecord(sheetAssignment)
    ? sheetAssignment.globallyEvaluableRule
    : undefined;
  const sheetWiderReplay = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.oneStepWiderCompactRuleReplay
    : undefined;
  const sheetConclusion = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.conclusion
    : undefined;
  const sheetUnrestrictedFrontier = isRecord(
    BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED,
  )
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED.boundedFrontier
    : undefined;
  const sheetUnrestrictedScope = isRecord(
    BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED,
  )
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED.searchScope
    : undefined;
  const sheetUnrestrictedAssignment = isRecord(
    BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED,
  )
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED.survivorAssignment
    : undefined;
  const sheetUnrestrictedReplay = isRecord(sheetUnrestrictedAssignment)
    ? sheetUnrestrictedAssignment.exactReplay
    : undefined;
  const sheetUnrestrictedConclusion = isRecord(
    BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED,
  )
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED.conclusion
    : undefined;
  const sheetUnrestrictedBinding = isRecord(BUNDLED_SHEET_RESOLVED_WALL_FLIP)
    ? BUNDLED_SHEET_RESOLVED_WALL_FLIP.unrestrictedDepth2Comparison
    : undefined;
  const sheetComponentKeyFormulasCertified =
    isRecord(sheetComponentKeyRules) &&
    sheetComponentKeyRules.types0Through4 === "([r], t mod S_r)" &&
    sheetComponentKeyRules.type5 === "(a, t mod S_5(a))" &&
    sheetComponentKeyRules.type6 === "t mod <b>" &&
    isRecord(sheetBaseWallAudit) &&
    sheetBaseWallAudit.projectiveRootOrbitSize === 300 &&
    sheetBaseWallAudit.projectiveRootFibreConnectedForAllRoots === true &&
    isRecord(sheetType5Audit) &&
    sheetType5Audit.all650LabelFibresConnected === true &&
    isRecord(sheetType6Audit) &&
    sheetType6Audit.connected === true;
  const sheetResolvedReplayed =
    sheetResolvedSealValid &&
    sheetUnrestrictedSealValid &&
    BUNDLED_SHEET_RESOLVED_WALL_FLIP.kind ===
      "makarov-p2-sheet-resolved-wall-component-flip-cegar" &&
    BUNDLED_SHEET_RESOLVED_WALL_FLIP.status ===
      "bounded-structured-survivor-rejected-at-next-frontier" &&
    BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED.kind ===
      "makarov-p2-sheet-resolved-wall-component-flip-cegar" &&
    BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED.status ===
      "bounded-sheet-resolved-survivor-frontier" &&
    isRecord(sheetCoverSource) &&
    sheetCoverSource.artifactSha256 ===
      BUNDLED_FACET_BINARY_ORIENTATION.artifactSha256 &&
    sheetComponentKeyFormulasCertified &&
    isRecord(sheetComponentAudit) &&
    sheetComponentAudit.type6StabilizerRank === 1 &&
    isRecord(sheetFrontier) &&
    sheetFrontier.qBallRadius === 1 &&
    sheetFrontier.sampledVertexCount === 768 &&
    sheetFrontier.sampledRankTwoCellCount === 11_520 &&
    sheetFrontier.wallComponentVariableCount === 1_834 &&
    isRecord(sheetSearchScope) &&
    sheetSearchScope.compactRuleRestriction === "family-linear-residual" &&
    isRecord(sheetRule) &&
    sheetRule.kind === "family-linear-residual" &&
    isRecord(sheetAssignmentReplay) &&
    sheetAssignmentReplay.allSampledAscendingLinksNonemptyConnected === true &&
    sheetAssignmentReplay.allSampledDescendingLinksNonemptyConnected === true &&
    isRecord(sheetWiderReplay) &&
    sheetWiderReplay.qBallRadius === 2 &&
    sheetWiderReplay.sampledVertexCount === 2_560 &&
    sheetWiderReplay.passedEverySampledVertex === false &&
    sheetWiderReplay.failedVertexCount === 96 &&
    JSON.stringify(sheetWiderReplay.failureKindCensus) ===
      JSON.stringify({
        "ascending-disconnected": 62,
        "descending-disconnected": 34,
      }) &&
    isRecord(sheetConclusion) &&
    sheetConclusion.compactRuleExpandsToNextQBall === false &&
    sheetConclusion.globalTrackAResult === false &&
    isRecord(sheetUnrestrictedBinding) &&
    sheetUnrestrictedBinding.artifactSha256 ===
      BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_ARTIFACT_SHA256 &&
    sheetUnrestrictedBinding.bytesSha256 ===
      BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_BYTES_SHA256 &&
    sheetUnrestrictedBinding.exactReplayPassed === true &&
    isRecord(sheetUnrestrictedFrontier) &&
    sheetUnrestrictedFrontier.qBallRadius === 2 &&
    sheetUnrestrictedFrontier.sampledVertexCount === 2_560 &&
    sheetUnrestrictedFrontier.sampledRankTwoCellCount === 32_768 &&
    sheetUnrestrictedFrontier.wallComponentVariableCount === 2_736 &&
    isRecord(sheetUnrestrictedScope) &&
    sheetUnrestrictedScope.compactRuleRestriction === null &&
    isRecord(sheetUnrestrictedReplay) &&
    sheetUnrestrictedReplay.allSampledAscendingLinksNonemptyConnected ===
      true &&
    sheetUnrestrictedReplay.allSampledDescendingLinksNonemptyConnected ===
      true &&
    isRecord(sheetUnrestrictedConclusion) &&
    sheetUnrestrictedConclusion.globalTrackAResult === false;
  if (!sheetResolvedReplayed) {
    throw new Error(
      "The bundled P2 sheet-resolved artifacts do not replay their exact component formulas, rejected compact rule, and unrestricted radius-two survivor frontier.",
    );
  }

  // The GAP timeout receipt likewise preserves Python numeric spelling that
  // cannot be canonically round-tripped through JavaScript JSON numbers.
  const titsSealValid =
    isRecord(BUNDLED_TITS_ORIENTATION) &&
    BUNDLED_TITS_ORIENTATION.artifactSha256 ===
      BUNDLED_TITS_ORIENTATION_ARTIFACT_SHA256;
  const titsSources = isRecord(BUNDLED_TITS_ORIENTATION)
    ? BUNDLED_TITS_ORIENTATION.sourceBindings
    : undefined;
  const titsImportSource = isRecord(titsSources)
    ? titsSources.section5Import
    : undefined;
  const titsCurrentWallSource = isRecord(titsSources)
    ? titsSources.currentWallObstruction
    : undefined;
  const titsCover = isRecord(BUNDLED_TITS_ORIENTATION)
    ? BUNDLED_TITS_ORIENTATION.orientationCover
    : undefined;
  const titsRefinement = isRecord(BUNDLED_TITS_ORIENTATION)
    ? BUNDLED_TITS_ORIENTATION.diagonalRefinement
    : undefined;
  const titsGap = isRecord(BUNDLED_TITS_ORIENTATION)
    ? BUNDLED_TITS_ORIENTATION.gapImageAudit
    : undefined;
  const titsGate = isRecord(BUNDLED_TITS_ORIENTATION)
    ? BUNDLED_TITS_ORIENTATION.canonicalCoorientationLocalGate
    : undefined;
  const titsDirectedLinks = isRecord(titsGate)
    ? titsGate.identityDirectedLinks
    : undefined;
  const titsReplayed =
    titsSealValid &&
    BUNDLED_TITS_ORIENTATION.kind ===
      "makarov-p2-tits-mod3-wall-orientation-cover-feasibility" &&
    BUNDLED_TITS_ORIENTATION.status ===
      "orientation-cover-proved-canonical-oracle-edge-link-obstructed-image-order-not-computed" &&
    isRecord(titsImportSource) &&
    titsImportSource.certificateSha256 ===
      importCertificate.certificateSha256 &&
    isRecord(titsCurrentWallSource) &&
    titsCurrentWallSource.artifactSha256 ===
      BUNDLED_WALL_COORIENTATION.artifactSha256 &&
    isRecord(titsCover) &&
    titsCover.allWallsTwoSided === true &&
    titsCover.torsionFree === true &&
    isRecord(titsRefinement) &&
    titsRefinement.lowerBound === 38_338_560_000 &&
    titsRefinement.exactDegreeComputed === false &&
    titsRefinement.globalLawfulCalculationAuthorized === false &&
    isRecord(titsGap) &&
    titsGap.exactImageOrderComputed === false &&
    titsGap.status === "bounded-gap-size-timeout" &&
    isRecord(titsGate) &&
    titsGate.status ===
      "canonical-oracle-fails-identity-cayley-edge-link-gate" &&
    isRecord(titsDirectedLinks) &&
    titsDirectedLinks.oneDirectedLinkEmptyForEitherGlobalPolarity === true;
  if (!titsReplayed) {
    throw new Error(
      "The bundled P2 F9 Tits orientation artifact does not replay its two-sided cover, bounded image-order result, and scoped local failure.",
    );
  }

  const titsRootOrbitSealValid =
    isRecord(BUNDLED_TITS_ROOT_ORBIT) &&
    BUNDLED_TITS_ROOT_ORBIT.artifactSha256 ===
      BUNDLED_TITS_ROOT_ORBIT_ARTIFACT_SHA256;
  const titsRootSources = isRecord(BUNDLED_TITS_ROOT_ORBIT)
    ? BUNDLED_TITS_ROOT_ORBIT.sourceBindings
    : undefined;
  const titsRootPriorSource = isRecord(titsRootSources)
    ? titsRootSources.priorTitsOrientationCover
    : undefined;
  const titsFiniteImage = isRecord(BUNDLED_TITS_ROOT_ORBIT)
    ? BUNDLED_TITS_ROOT_ORBIT.exactFiniteImage
    : undefined;
  const titsDegree = isRecord(BUNDLED_TITS_ROOT_ORBIT)
    ? BUNDLED_TITS_ROOT_ORBIT.orientationCoverDegree
    : undefined;
  const titsGoursat = isRecord(titsDegree)
    ? titsDegree.goursatShortcut
    : undefined;
  const titsNonnormalWitness = isRecord(titsGoursat)
    ? titsGoursat.explicitNonnormalityWitness
    : undefined;
  const titsNecessaryGates = isRecord(BUNDLED_TITS_ROOT_ORBIT)
    ? BUNDLED_TITS_ROOT_ORBIT.exactNecessaryGates
    : undefined;
  const titsRootTransversal = isRecord(titsNecessaryGates)
    ? titsNecessaryGates.root0Transversal
    : undefined;
  const titsStabilizerLayers = isRecord(titsNecessaryGates)
    ? titsNecessaryGates.pointStabilizerGeneratorLayers
    : undefined;
  const titsStabilizerLayerRows = isRecord(titsStabilizerLayers)
    ? titsStabilizerLayers.layers
    : undefined;
  const titsLayerFailureCounts = Array.isArray(titsStabilizerLayerRows)
    ? titsStabilizerLayerRows.map((row) =>
        isRecord(row) ? row.failures : undefined,
      )
    : [];
  const titsWallFlipFamilies = isRecord(BUNDLED_TITS_ROOT_ORBIT)
    ? BUNDLED_TITS_ROOT_ORBIT.wallFlipFamilies
    : undefined;
  const titsRootTrackAConclusion = isRecord(BUNDLED_TITS_ROOT_ORBIT)
    ? BUNDLED_TITS_ROOT_ORBIT.trackAConclusion
    : undefined;
  const titsRootOrbitReplayed =
    titsRootOrbitSealValid &&
    BUNDLED_TITS_ROOT_ORBIT.kind ===
      "makarov-p2-tits-f9-root-orbit-flip-frontier" &&
    BUNDLED_TITS_ROOT_ORBIT.status ===
      "exact-image-order-computed-root-line-flip-frontier-open" &&
    isRecord(titsRootPriorSource) &&
    titsRootPriorSource.artifactSha256 ===
      BUNDLED_TITS_ORIENTATION.artifactSha256 &&
    titsRootPriorSource.bytesSha256 === BUNDLED_TITS_ORIENTATION_BYTES_SHA256 &&
    isRecord(titsFiniteImage) &&
    titsFiniteImage.exactImageOrderComputed === true &&
    titsFiniteImage.image === "ker(spinor: O(7,9) -> F9*/(F9*)^2)" &&
    titsFiniteImage.imageOrder === "108051462804999168000" &&
    titsFiniteImage.compiledOrbitCount === 532_170 &&
    titsFiniteImage.normOneVectorCount === 532_170 &&
    titsFiniteImage.missingVectors === 0 &&
    titsFiniteImage.extraVectors === 0 &&
    isRecord(titsDegree) &&
    titsDegree.knownSubgroupImageDivisor === 40 &&
    titsDegree.exactDegreeComputed === false &&
    isRecord(titsNonnormalWitness) &&
    titsNonnormalWitness.wordLength === 294 &&
    titsNonnormalWitness.fixesIdentityCoset === true &&
    titsNonnormalWitness.movesAnotherCoset === true &&
    titsNonnormalWitness.titsImageOrder === 40 &&
    isRecord(titsRootTransversal) &&
    titsRootTransversal.frameCount === 532_170 &&
    titsRootTransversal.fullRankTwoDirectedLinkFailures === 31_400 &&
    titsRootTransversal.fullRankTwoGatePassed === false &&
    isRecord(titsStabilizerLayers) &&
    titsStabilizerLayers.storedCandidatePassesAllLayers === false &&
    JSON.stringify(titsLayerFailureCounts) ===
      JSON.stringify([0, 3_656, 3_456, 12_400, 6_043]) &&
    isRecord(titsWallFlipFamilies) &&
    titsWallFlipFamilies.rootLineConstantFlipVariables === 266_085 &&
    titsWallFlipFamilies.actualQuotientWallComponentCountComputed === false &&
    isRecord(titsRootTrackAConclusion) &&
    titsRootTrackAConclusion.globalLawfulClosureAuthorized === false &&
    titsRootTrackAConclusion.status ===
      "exact-finite-image-resolved-flip-search-frontier-open";
  if (!titsRootOrbitReplayed) {
    throw new Error(
      "The bundled P2 F9 root-orbit artifact does not replay its exact spinor-kernel image, nonnormal subgroup witness, failed candidate, and open global-flip boundary.",
    );
  }

  const fourierFrameSealValid = canonicalSealValid(
    BUNDLED_TYPE6_FOURIER_FRAME_SCREEN,
    "artifactSha256",
  );
  const fourierSources = isRecord(BUNDLED_TYPE6_FOURIER_FRAME_SCREEN)
    ? BUNDLED_TYPE6_FOURIER_FRAME_SCREEN.sourceBindings
    : undefined;
  const fourierType6Source = isRecord(fourierSources)
    ? fourierSources.type6CharacterCertificate
    : undefined;
  const fourierDeclared = isRecord(BUNDLED_TYPE6_FOURIER_FRAME_SCREEN)
    ? BUNDLED_TYPE6_FOURIER_FRAME_SCREEN.declaredScreen
    : undefined;
  const fourierResult = isRecord(BUNDLED_TYPE6_FOURIER_FRAME_SCREEN)
    ? BUNDLED_TYPE6_FOURIER_FRAME_SCREEN.certifiedResult
    : undefined;
  const fourierAttempts = isRecord(BUNDLED_TYPE6_FOURIER_FRAME_SCREEN)
    ? BUNDLED_TYPE6_FOURIER_FRAME_SCREEN.attempts
    : undefined;
  const fourierFallbackAttempt =
    Array.isArray(fourierAttempts) && fourierAttempts.length === 2
      ? fourierAttempts[1]
      : undefined;
  const fourierNonClaims = isRecord(BUNDLED_TYPE6_FOURIER_FRAME_SCREEN)
    ? BUNDLED_TYPE6_FOURIER_FRAME_SCREEN.nonClaims
    : undefined;
  const fourierType6CharacterBindingMatches =
    isRecord(fourierType6Source) &&
    fourierType6Source.artifactSha256 === BUNDLED_TYPE6_TRACK_B.artifactSha256;
  const fourierExactRunnerOptIn =
    Array.isArray(fourierNonClaims) &&
    fourierNonClaims.includes(
      "The exact scanner remains opt-in and is not invoked by receipt verification.",
    );
  const fourierFrameReceiptReplayed =
    fourierFrameSealValid &&
    BUNDLED_TYPE6_FOURIER_FRAME_SCREEN.kind ===
      "makarov-p2-type6-fourier-frame-bounded-timeout-receipt" &&
    BUNDLED_TYPE6_FOURIER_FRAME_SCREEN.status ===
      "incomplete-backend-timeout-no-mathematical-result" &&
    fourierType6CharacterBindingMatches &&
    isRecord(fourierDeclared) &&
    fourierDeclared.plannedFrameCount === 74_880 &&
    fourierDeclared.plannedReducedOriginalVertexCount === 149_760 &&
    fourierDeclared.candidateCount === 128 &&
    fourierDeclared.higherBarycentricCellOrbitLowerBound === 1_806_033 &&
    isRecord(fourierResult) &&
    fourierResult.certifiedFrameCount === 0 &&
    fourierResult.certifiedReducedOriginalVertexCount === 0 &&
    fourierResult.certifiedCandidateCount === 0 &&
    fourierResult.candidateEliminations === 0 &&
    fourierResult.candidateSurvivors === 0 &&
    fourierResult.higherCellTemplatesChecked === 0 &&
    fourierResult.completeFrameTranscriptAvailable === false &&
    fourierResult.mathematicalDisposition === "none" &&
    isRecord(fourierFallbackAttempt) &&
    fourierFallbackAttempt.exitCode === 124 &&
    fourierFallbackAttempt.termination === "worker-timeout" &&
    fourierExactRunnerOptIn;
  if (!fourierFrameReceiptReplayed) {
    throw new Error(
      "The bundled P2 Fourier-frame receipt does not replay its bounded timeout and zero-certified-result boundary.",
    );
  }

  const lqSchreierSealValid = canonicalSealValid(
    BUNDLED_LQ_SCHREIER_TABLE,
    "artifactSha256",
  );
  const lqSources = isRecord(BUNDLED_LQ_SCHREIER_TABLE)
    ? BUNDLED_LQ_SCHREIER_TABLE.sourceBindings
    : undefined;
  const lqImportSource = isRecord(lqSources)
    ? lqSources.section5Import
    : undefined;
  const lqOrbit = isRecord(BUNDLED_LQ_SCHREIER_TABLE)
    ? BUNDLED_LQ_SCHREIER_TABLE.coloringOrbitReplay
    : undefined;
  const lqOrder = isRecord(BUNDLED_LQ_SCHREIER_TABLE)
    ? BUNDLED_LQ_SCHREIER_TABLE.qOrderProof
    : undefined;
  const lqStabilizer = isRecord(BUNDLED_LQ_SCHREIER_TABLE)
    ? BUNDLED_LQ_SCHREIER_TABLE.stabilizerConclusion
    : undefined;
  const lqTable = isRecord(BUNDLED_LQ_SCHREIER_TABLE)
    ? BUNDLED_LQ_SCHREIER_TABLE.table
    : undefined;
  const lqConsumer = isRecord(BUNDLED_LQ_SCHREIER_TABLE)
    ? BUNDLED_LQ_SCHREIER_TABLE.consumerContract
    : undefined;
  const lqSchreierReplayed =
    lqSchreierSealValid &&
    BUNDLED_LQ_SCHREIER_TABLE.kind === "makarov-p2-lq-exact-schreier-table" &&
    BUNDLED_LQ_SCHREIER_TABLE.status === "exact-74880-state-table-certified" &&
    isRecord(lqImportSource) &&
    lqImportSource.certificateSha256 === importCertificate.certificateSha256 &&
    isRecord(lqOrbit) &&
    lqOrbit.stateCount === 74_880 &&
    lqOrbit.transitionCount === 374_400 &&
    lqOrbit.everyGeneratorInvolutive === true &&
    lqOrbit.schreierGraphTransitive === true &&
    lqOrbit.fullColoringKeysPairwiseDistinct === true &&
    lqOrbit.representativeSpanningTreeExact === true &&
    isRecord(lqOrder) &&
    lqOrder.boundsMeet === true &&
    lqOrder.exactOrder === 9_360_000 &&
    isRecord(lqStabilizer) &&
    lqStabilizer.coloringStabilizerOrder === 125 &&
    lqStabilizer.LIsExactlyTheCompleteColoringStabilizer === true &&
    lqStabilizer.thereforeOrbitIsLBackslashQ === true &&
    isRecord(lqTable) &&
    lqTable.compressedBytes === 1_209_649 &&
    isRecord(lqConsumer) &&
    lqConsumer.fixedCharacterOriginalChamberOrbitCount === 149_760 &&
    lqConsumer.maximalType5Ready === true;
  if (!lqSchreierReplayed) {
    throw new Error(
      "The bundled P2 L\\Q artifact does not replay its exact table, group-order proof, and stabilizer conclusion.",
    );
  }

  const chamberScreenSealValid = canonicalSealValid(
    BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN,
    "artifactSha256",
  );
  const chamberSources = isRecord(BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN)
    ? BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.sourceBindings
    : undefined;
  const chamberLqSource = isRecord(chamberSources)
    ? chamberSources.lqSchreierTable
    : undefined;
  const chamberType6Source = isRecord(chamberSources)
    ? chamberSources.type6Character
    : undefined;
  const chamberCoverage = isRecord(BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN)
    ? BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.frameCoverage
    : undefined;
  const chamberPatterns = isRecord(BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN)
    ? BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.flagPatternAudit
    : undefined;
  const chamberResult = isRecord(BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN)
    ? BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.chamberRootScreen
    : undefined;
  const chamberNextGate = isRecord(BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN)
    ? BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.nextHigherCellGate
    : undefined;
  const chamberSurvivorIndices = isRecord(chamberResult)
    ? chamberResult.survivorCandidateIndices
    : undefined;
  const lqSchreierBindingMatches =
    isRecord(chamberLqSource) &&
    chamberLqSource.artifactSha256 === BUNDLED_LQ_SCHREIER_TABLE.artifactSha256;
  const chamberType6CharacterBindingMatches =
    isRecord(chamberType6Source) &&
    chamberType6Source.artifactSha256 === BUNDLED_TYPE6_TRACK_B.artifactSha256;
  const chamberScreenReplayed =
    chamberScreenSealValid &&
    BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.kind ===
      "makarov-p2-type6-fourier-schreier-chamber-screen" &&
    BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.status ===
      "chamber-root-survivor-frontier" &&
    lqSchreierBindingMatches &&
    chamberType6CharacterBindingMatches &&
    isRecord(chamberCoverage) &&
    chamberCoverage.lqFrameCount === 74_880 &&
    chamberCoverage.remainingSheetSignsPerFrame === 2 &&
    chamberCoverage.exactOriginalChamberRootCount === 149_760 &&
    chamberCoverage.allFramesAndSignsCovered === true &&
    isRecord(chamberPatterns) &&
    chamberPatterns.uniqueFlagPatternCount === 6 &&
    isRecord(chamberResult) &&
    chamberResult.familySize === 128 &&
    chamberResult.fullReducedChamberRootsRepresented === 149_760 &&
    chamberResult.eliminatedCount === 16 &&
    chamberResult.survivorCount === 112 &&
    Array.isArray(chamberSurvivorIndices) &&
    chamberSurvivorIndices.length === 112 &&
    new Set(chamberSurvivorIndices).size === 112 &&
    isRecord(chamberNextGate) &&
    chamberNextGate.maximalType5Barycenters ===
      "required for the 112 chamber-root survivors";
  if (!chamberScreenReplayed) {
    throw new Error(
      "The bundled P2 table-backed chamber screen does not replay its complete 149,760-root coverage and 112-candidate frontier.",
    );
  }

  const maximalType5SealValid = canonicalSealValid(
    BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT,
    "artifactSha256",
  );
  const maximalSources = isRecord(BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT)
    ? BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.sourceBindings
    : undefined;
  const maximalLqSource = isRecord(maximalSources)
    ? maximalSources.lqSchreierTable
    : undefined;
  const maximalChamberSource = isRecord(maximalSources)
    ? maximalSources.schreierChamberScreen
    : undefined;
  const maximalBarycentricSource = isRecord(maximalSources)
    ? maximalSources.barycentricReduction
    : undefined;
  const maximalType6Source = isRecord(maximalSources)
    ? maximalSources.type6Character
    : undefined;
  const maximalPreflight = isRecord(BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT)
    ? BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.exactPreflight
    : undefined;
  const maximalConstantScreen = isRecord(maximalPreflight)
    ? maximalPreflight.constantFourierTemplateScreen
    : undefined;
  const maximalBoundedAttempt = isRecord(BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT)
    ? BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.boundedAttempt
    : undefined;
  const maximalResult = isRecord(BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT)
    ? BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.certifiedResult
    : undefined;
  const maximalConstantResult = isRecord(maximalResult)
    ? maximalResult.constantFourierStage
    : undefined;
  const maximalZeroResult = isRecord(maximalResult)
    ? maximalResult.zeroFourierStage
    : undefined;
  const maximalConstantSurvivors = isRecord(maximalConstantScreen)
    ? maximalConstantScreen.survivorCandidateIndices
    : undefined;
  const maximalCertifiedConstantSurvivors = isRecord(maximalConstantResult)
    ? maximalConstantResult.survivorCandidateIndices
    : undefined;
  const expectedMaximalConstantSurvivors = [
    7, 11, 19, 21, 22, 25, 26, 28, 35, 37, 38, 41, 42, 44, 52, 56, 71, 75, 83,
    85, 86, 89, 90, 92, 99, 101, 102, 105, 106, 108, 116, 120,
  ];
  const maximalConstantTypes = isRecord(maximalConstantScreen)
    ? maximalConstantScreen.types
    : undefined;
  const maximalPerTypeEliminations = Array.isArray(maximalConstantTypes)
    ? maximalConstantTypes.map((entry) =>
        isRecord(entry) ? entry.candidateEliminations : undefined,
      )
    : [];
  const maximalNonClaims = isRecord(BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT)
    ? BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.nonClaims
    : undefined;
  const maximalType5Replayed =
    maximalType5SealValid &&
    BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.kind ===
      "makarov-p2-type6-maximal-type5-global-timeout-receipt" &&
    BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.status ===
      "incomplete-wall-time-no-global-mathematical-result" &&
    isRecord(maximalLqSource) &&
    maximalLqSource.artifactSha256 ===
      BUNDLED_LQ_SCHREIER_TABLE.artifactSha256 &&
    isRecord(maximalChamberSource) &&
    maximalChamberSource.artifactSha256 ===
      BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.artifactSha256 &&
    isRecord(maximalBarycentricSource) &&
    maximalBarycentricSource.artifactSha256 ===
      BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.artifactSha256 &&
    isRecord(maximalType6Source) &&
    maximalType6Source.artifactSha256 ===
      BUNDLED_TYPE6_TRACK_B.artifactSha256 &&
    isRecord(maximalPreflight) &&
    maximalPreflight.chamberScreenSurvivorCount === 112 &&
    maximalPreflight.identityAnchorSurvivorCount === 80 &&
    maximalPreflight.intersectionCandidateCount === 80 &&
    maximalPreflight.maximalCellOrbitCount === 5_078 &&
    maximalPreflight.constantFourierCellOrbitCount === 2_616 &&
    maximalPreflight.zeroFourierCellOrbitCount === 2_462 &&
    maximalPreflight.maximalType5CandidateEquivalenceClassCount === 20 &&
    isRecord(maximalConstantScreen) &&
    maximalConstantScreen.complete === true &&
    maximalConstantScreen.inputCandidateCount === 80 &&
    maximalConstantScreen.eliminatedCount === 48 &&
    maximalConstantScreen.survivorCount === 32 &&
    maximalConstantScreen.survivorEquivalenceClassCount === 8 &&
    JSON.stringify(maximalConstantSurvivors) ===
      JSON.stringify(expectedMaximalConstantSurvivors) &&
    JSON.stringify(maximalPerTypeEliminations) ===
      JSON.stringify([20, 8, 12, 8, 0]) &&
    isRecord(maximalBoundedAttempt) &&
    maximalBoundedAttempt.wallSecondsCap === 900 &&
    maximalBoundedAttempt.deadlineChecksActive === true &&
    maximalBoundedAttempt.completeGlobalTranscript === false &&
    maximalBoundedAttempt.constantFourierTemplatesReplayedSeparately === true &&
    maximalBoundedAttempt.partialZeroFourierTranscriptRetained === false &&
    maximalBoundedAttempt.certifiedZeroFourierCellLinkRows === 0 &&
    isRecord(maximalResult) &&
    maximalResult.globalMaximalType5ScreenComplete === false &&
    maximalResult.overallDisposition === "constant-stage-frontier-only" &&
    isRecord(maximalConstantResult) &&
    maximalConstantResult.complete === true &&
    maximalConstantResult.candidateEliminations === 48 &&
    maximalConstantResult.candidateSurvivors === 32 &&
    maximalConstantResult.survivorEquivalenceClassCount === 8 &&
    maximalConstantResult.mathematicalDisposition ===
      "32-candidate-survivor-frontier" &&
    JSON.stringify(maximalCertifiedConstantSurvivors) ===
      JSON.stringify(expectedMaximalConstantSurvivors) &&
    isRecord(maximalZeroResult) &&
    maximalZeroResult.complete === false &&
    maximalZeroResult.candidateEliminations === 0 &&
    maximalZeroResult.candidateSurvivors === 0 &&
    maximalZeroResult.mathematicalDisposition === "none" &&
    BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.nextGate ===
      "do not rerun the same Python expansion; add a checkpointed compiled connectivity backend or a further exact local obstruction first" &&
    Array.isArray(maximalNonClaims) &&
    maximalNonClaims.includes(
      "The 32 constant-stage survivors have not passed any zero-Fourier maximal-cell orbit globally.",
    );
  if (!maximalType5Replayed) {
    throw new Error(
      "The bundled P2 maximal type-5 receipt does not replay its exact 48-of-80 constant-Fourier elimination or its incomplete zero-Fourier scope.",
    );
  }

  const zeroFourierCompiledSealValid = canonicalSealValid(
    BUNDLED_TYPE6_ZERO_FOURIER_COMPILED,
    "artifactSha256",
  );
  const zeroFourierSources = isRecord(BUNDLED_TYPE6_ZERO_FOURIER_COMPILED)
    ? BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.sourceBindings
    : undefined;
  const zeroFourierTimeoutSource = isRecord(zeroFourierSources)
    ? zeroFourierSources.constantStageTimeoutReceipt
    : undefined;
  const zeroFourierLqSource = isRecord(zeroFourierSources)
    ? zeroFourierSources.lqSchreierTable
    : undefined;
  const zeroFourierExactInput = isRecord(BUNDLED_TYPE6_ZERO_FOURIER_COMPILED)
    ? BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.exactInput
    : undefined;
  const zeroFourierCheckpoint = isRecord(BUNDLED_TYPE6_ZERO_FOURIER_COMPILED)
    ? BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.checkpointTranscript
    : undefined;
  const zeroFourierScreen = isRecord(BUNDLED_TYPE6_ZERO_FOURIER_COMPILED)
    ? BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.screen
    : undefined;
  const zeroFourierReplay = isRecord(BUNDLED_TYPE6_ZERO_FOURIER_COMPILED)
    ? BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.independentReplay
    : undefined;
  const zeroFourierCandidates = isRecord(zeroFourierScreen)
    ? zeroFourierScreen.candidates
    : undefined;
  const zeroFourierEliminatedIndices = Array.isArray(zeroFourierCandidates)
    ? zeroFourierCandidates
        .filter(
          (candidate) =>
            isRecord(candidate) && candidate.status === "eliminated",
        )
        .map((candidate) =>
          isRecord(candidate) ? candidate.candidateIndex : undefined,
        )
    : [];
  const zeroFourierSurvivorIndices = isRecord(zeroFourierScreen)
    ? zeroFourierScreen.survivorCandidateIndices
    : undefined;
  const expectedZeroFourierEliminatedIndices = [
    7, 11, 52, 56, 71, 75, 116, 120,
  ];
  const expectedZeroFourierSurvivorIndices = [
    19, 21, 22, 25, 26, 28, 35, 37, 38, 41, 42, 44, 83, 85, 86, 89, 90, 92, 99,
    101, 102, 105, 106, 108,
  ];
  const zeroFourierNonClaims = isRecord(BUNDLED_TYPE6_ZERO_FOURIER_COMPILED)
    ? BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.nonClaims
    : undefined;
  const zeroFourierCompiledReplayed =
    zeroFourierCompiledSealValid &&
    BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.kind ===
      "makarov-p2-type6-zero-fourier-maximal-type5-compiled-scan" &&
    BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.status ===
      "zero-Fourier-maximal-type5-survivor-frontier" &&
    isRecord(zeroFourierTimeoutSource) &&
    zeroFourierTimeoutSource.artifactSha256 ===
      BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.artifactSha256 &&
    isRecord(zeroFourierLqSource) &&
    zeroFourierLqSource.artifactSha256 ===
      BUNDLED_LQ_SCHREIER_TABLE.artifactSha256 &&
    isRecord(zeroFourierExactInput) &&
    zeroFourierExactInput.totalZeroFourierCellOrbitCount === 2_462 &&
    typeof zeroFourierExactInput.multiplicityPolicy === "string" &&
    zeroFourierExactInput.multiplicityPolicy.includes(
      "never collapse a local link",
    ) &&
    isRecord(zeroFourierCheckpoint) &&
    zeroFourierCheckpoint.rowCount === 2_462 &&
    JSON.stringify(zeroFourierCheckpoint.completedRowsByType) ===
      JSON.stringify([132, 6, 724, 1_100, 500]) &&
    zeroFourierCheckpoint.everySurvivorCheckedAtEveryZeroFourierOrbit ===
      true &&
    zeroFourierCheckpoint.allCandidatesEliminatedEarly === false &&
    isRecord(zeroFourierScreen) &&
    zeroFourierScreen.inputCandidateCount === 32 &&
    zeroFourierScreen.inputEquivalenceClassCount === 8 &&
    zeroFourierScreen.eliminatedCount === 8 &&
    zeroFourierScreen.survivorCount === 24 &&
    JSON.stringify(zeroFourierEliminatedIndices) ===
      JSON.stringify(expectedZeroFourierEliminatedIndices) &&
    JSON.stringify(zeroFourierSurvivorIndices) ===
      JSON.stringify(expectedZeroFourierSurvivorIndices) &&
    isRecord(zeroFourierReplay) &&
    zeroFourierReplay.checkpointHashChainAndSequencePassed === true &&
    zeroFourierReplay.compiledFailureWitnessesReplayedInPython === 2 &&
    zeroFourierReplay.allFailureWitnessesPassed === true &&
    BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.conclusion ===
      "24 candidates pass all 2,462 zero-Fourier maximal-cell orbits; nonmaximal barycentric types remain open." &&
    Array.isArray(zeroFourierNonClaims) &&
    zeroFourierNonClaims.includes(
      "No global Track-B or fibering claim is made unless every remaining barycentric type also passes.",
    );
  if (!zeroFourierCompiledReplayed) {
    throw new Error(
      "The bundled P2 compiled zero-Fourier artifact does not replay its complete maximal-type5 scope, 8 eliminations, and 24-candidate frontier.",
    );
  }

  const coneApexSealValid = canonicalSealValid(
    BUNDLED_TYPE6_CONE_APEX,
    "artifactSha256",
  );
  const coneApexSources = isRecord(BUNDLED_TYPE6_CONE_APEX)
    ? BUNDLED_TYPE6_CONE_APEX.sourceBindings
    : undefined;
  const coneApexReductionSource = isRecord(coneApexSources)
    ? coneApexSources.barycentricReduction
    : undefined;
  const coneApexMaximalSource = isRecord(coneApexSources)
    ? coneApexSources.compiledMaximalType5Frontier
    : undefined;
  const coneApexLqSource = isRecord(coneApexSources)
    ? coneApexSources.lqSchreierTable
    : undefined;
  const coneApexLemma = isRecord(BUNDLED_TYPE6_CONE_APEX)
    ? BUNDLED_TYPE6_CONE_APEX.coneApexLemma
    : undefined;
  const coneApexWorkload = isRecord(BUNDLED_TYPE6_CONE_APEX)
    ? BUNDLED_TYPE6_CONE_APEX.workload
    : undefined;
  const coneApexAutomatic = isRecord(coneApexWorkload)
    ? coneApexWorkload.automaticType6
    : undefined;
  const coneApexUnresolved = isRecord(coneApexWorkload)
    ? coneApexWorkload.unresolved
    : undefined;
  const coneApexRankFourBatch = isRecord(coneApexWorkload)
    ? coneApexWorkload.firstRankFourSideOnlyBatch
    : undefined;
  const coneApexReplayed =
    coneApexSealValid &&
    BUNDLED_TYPE6_CONE_APEX.kind ===
      "makarov-p2-type6-cone-apex-and-workload-certificate" &&
    BUNDLED_TYPE6_CONE_APEX.status ===
      "exact-type6-links-automatic-56-types-remain" &&
    isRecord(coneApexReductionSource) &&
    coneApexReductionSource.artifactSha256 ===
      BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.artifactSha256 &&
    isRecord(coneApexMaximalSource) &&
    coneApexMaximalSource.artifactSha256 ===
      BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.artifactSha256 &&
    isRecord(coneApexLqSource) &&
    coneApexLqSource.artifactSha256 ===
      BUNDLED_LQ_SCHREIER_TABLE.artifactSha256 &&
    isRecord(coneApexLemma) &&
    coneApexLemma.status === "proved-for-every-cell-orbit" &&
    coneApexLemma.cellTypeCount === 31 &&
    isRecord(coneApexAutomatic) &&
    coneApexAutomatic.sphericalTypeCount === 31 &&
    coneApexAutomatic.cellOrbitCount === 471_770 &&
    isRecord(coneApexUnresolved) &&
    coneApexUnresolved.sphericalTypeCount === 56 &&
    coneApexUnresolved.cellOrbitCount === 1_589_860 &&
    isRecord(coneApexRankFourBatch) &&
    coneApexRankFourBatch.sphericalTypeCount === 5 &&
    coneApexRankFourBatch.cellOrbitCount === 7_540 &&
    coneApexRankFourBatch.everyCellHasExactlyTwoUpperCofaceTypes === true;
  if (!coneApexReplayed) {
    throw new Error(
      "The bundled P2 cone-apex artifact does not replay its automatic type-6 links and exact 56-type workload.",
    );
  }

  const fullStarEquivalenceSealValid = canonicalSealValid(
    BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE,
    "artifactSha256",
  );
  const fullStarEquivalenceSources = isRecord(
    BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE,
  )
    ? BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE.sourceBindings
    : undefined;
  const fullStarEquivalenceMaximalSource = isRecord(fullStarEquivalenceSources)
    ? fullStarEquivalenceSources.compiledMaximalType5Frontier
    : undefined;
  const fullStarEquivalenceCharacterSource = isRecord(
    fullStarEquivalenceSources,
  )
    ? fullStarEquivalenceSources.primitiveType6Character
    : undefined;
  const fullStarEquivalenceAudit = isRecord(BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE)
    ? BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE.candidateEquivalence
    : undefined;
  const fullStarScannerContract = isRecord(BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE)
    ? BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE.scannerContract
    : undefined;
  const expectedFullStarRepresentatives = [19, 21, 22, 25, 26, 28];
  const fullStarEquivalenceReplayed =
    fullStarEquivalenceSealValid &&
    BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE.kind ===
      "makarov-p2-type6-full-star-candidate-equivalence" &&
    BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE.status ===
      "exact-global-equivalence-for-central-types-avoiding-generator6" &&
    isRecord(fullStarEquivalenceMaximalSource) &&
    fullStarEquivalenceMaximalSource.artifactSha256 ===
      BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.artifactSha256 &&
    isRecord(fullStarEquivalenceCharacterSource) &&
    fullStarEquivalenceCharacterSource.artifactSha256 ===
      BUNDLED_TYPE6_TRACK_B.artifactSha256 &&
    isRecord(fullStarEquivalenceAudit) &&
    fullStarEquivalenceAudit.sourceSurvivorCount === 24 &&
    fullStarEquivalenceAudit.equivalenceClassCount === 6 &&
    JSON.stringify(fullStarEquivalenceAudit.representatives) ===
      JSON.stringify(expectedFullStarRepresentatives) &&
    isRecord(fullStarScannerContract) &&
    fullStarScannerContract.representativeOnlyGlobalScanIsExact === true &&
    typeof fullStarScannerContract.allowedCentralTypes === "string" &&
    fullStarScannerContract.allowedCentralTypes.includes("56 unresolved");
  if (!fullStarEquivalenceReplayed) {
    throw new Error(
      "The bundled P2 full-star equivalence artifact does not replay its exact six-class reduction.",
    );
  }

  const fullStarCompiledSealValid = canonicalSealValid(
    BUNDLED_TYPE6_FULL_STAR_COMPILED,
    "artifactSha256",
  );
  const fullStarSources = isRecord(BUNDLED_TYPE6_FULL_STAR_COMPILED)
    ? BUNDLED_TYPE6_FULL_STAR_COMPILED.sourceBindings
    : undefined;
  const fullStarEquivalenceSource = isRecord(fullStarSources)
    ? fullStarSources.candidateEquivalence
    : undefined;
  const fullStarMaximalSource = isRecord(fullStarSources)
    ? fullStarSources.maximalType5Frontier
    : undefined;
  const fullStarConeApexSource = isRecord(fullStarSources)
    ? fullStarSources.type6ConeApexLemma
    : undefined;
  const fullStarLqSource = isRecord(fullStarSources)
    ? fullStarSources.lqSchreierTable
    : undefined;
  const fullStarExactInput = isRecord(BUNDLED_TYPE6_FULL_STAR_COMPILED)
    ? BUNDLED_TYPE6_FULL_STAR_COMPILED.exactInput
    : undefined;
  const fullStarCheckpoint = isRecord(BUNDLED_TYPE6_FULL_STAR_COMPILED)
    ? BUNDLED_TYPE6_FULL_STAR_COMPILED.checkpointTranscript
    : undefined;
  const fullStarScreen = isRecord(BUNDLED_TYPE6_FULL_STAR_COMPILED)
    ? BUNDLED_TYPE6_FULL_STAR_COMPILED.screen
    : undefined;
  const fullStarIndependentReplay = isRecord(BUNDLED_TYPE6_FULL_STAR_COMPILED)
    ? BUNDLED_TYPE6_FULL_STAR_COMPILED.independentReplay
    : undefined;
  const fullStarNonClaims = isRecord(BUNDLED_TYPE6_FULL_STAR_COMPILED)
    ? BUNDLED_TYPE6_FULL_STAR_COMPILED.nonClaims
    : undefined;
  const fullStarCompiledReplayed =
    fullStarCompiledSealValid &&
    BUNDLED_TYPE6_FULL_STAR_COMPILED.kind ===
      "makarov-p2-type6-rank4-side-full-star-compiled-scan" &&
    BUNDLED_TYPE6_FULL_STAR_COMPILED.status ===
      "current-type6-height-family-eliminated" &&
    isRecord(fullStarEquivalenceSource) &&
    fullStarEquivalenceSource.artifactSha256 ===
      BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE.artifactSha256 &&
    isRecord(fullStarMaximalSource) &&
    fullStarMaximalSource.artifactSha256 ===
      BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.artifactSha256 &&
    isRecord(fullStarConeApexSource) &&
    fullStarConeApexSource.artifactSha256 ===
      BUNDLED_TYPE6_CONE_APEX.artifactSha256 &&
    isRecord(fullStarLqSource) &&
    fullStarLqSource.artifactSha256 ===
      BUNDLED_LQ_SCHREIER_TABLE.artifactSha256 &&
    isRecord(fullStarExactInput) &&
    fullStarExactInput.totalRankFourSideCellOrbitCount === 7_540 &&
    typeof fullStarExactInput.fullStarPolicy === "string" &&
    fullStarExactInput.fullStarPolicy.includes(
      "unique +5 and +6 cofaces remain distinct vertices",
    ) &&
    isRecord(fullStarCheckpoint) &&
    fullStarCheckpoint.rowCount === 5_626 &&
    JSON.stringify(fullStarCheckpoint.completedRowsByType) ===
      JSON.stringify([1_248, 3_120, 1_258, 0, 0]) &&
    fullStarCheckpoint.activeCandidateMaskHex === "00" &&
    fullStarCheckpoint.allCandidateRepresentativesEliminatedEarly === true &&
    isRecord(fullStarScreen) &&
    fullStarScreen.inputCandidateCount === 24 &&
    fullStarScreen.inputEquivalenceClassCount === 6 &&
    fullStarScreen.eliminatedCount === 24 &&
    fullStarScreen.survivorCount === 0 &&
    Array.isArray(fullStarScreen.survivorCandidateIndices) &&
    fullStarScreen.survivorCandidateIndices.length === 0 &&
    isRecord(fullStarIndependentReplay) &&
    fullStarIndependentReplay.checkpointHashChainAndSequencePassed === true &&
    fullStarIndependentReplay.compiledRepresentativeFailuresReplayedInPython ===
      6 &&
    fullStarIndependentReplay.equivalenceTransferredFailuresReplayedInPython ===
      24 &&
    fullStarIndependentReplay.allFailureWitnessesPassed === true &&
    Array.isArray(fullStarNonClaims) &&
    fullStarNonClaims.includes(
      "No negative claim is made about P2 virtual fibering itself.",
    );
  if (!fullStarCompiledReplayed) {
    throw new Error(
      "The bundled P2 full-star artifact does not replay its six-class elimination and independent failure witnesses.",
    );
  }

  const r2PeriodicRepairSealValid = canonicalSealValid(
    BUNDLED_TYPE6_R2_PERIODIC_REPAIR,
    "artifactSha256",
  );
  const r2SourceBindings = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.sourceBindings
    : undefined;
  const r2Source = (path: string): Record<string, unknown> | undefined =>
    Array.isArray(r2SourceBindings)
      ? r2SourceBindings.find(
          (binding): binding is Record<string, unknown> =>
            isRecord(binding) && binding.path === path,
        )
      : undefined;
  const r2LqSource = r2Source(BUNDLED_LQ_SCHREIER_TABLE_LOCATOR);
  const r2CharacterSource = r2Source(BUNDLED_TYPE6_TRACK_B_LOCATOR);
  const r2FullStarSource = r2Source(BUNDLED_TYPE6_FULL_STAR_COMPILED_LOCATOR);
  const r2EquivalenceSource = r2Source(
    BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE_LOCATOR,
  );
  const r2PeriodicCoordinate = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.periodicCoordinate
    : undefined;
  const r2GlobalCompatibility = isRecord(r2PeriodicCoordinate)
    ? r2PeriodicCoordinate.globalCompatibility
    : undefined;
  const r2BoundedFamily = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.boundedFamily
    : undefined;
  const r2MotifAudit = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.targetMotifAudit
    : undefined;
  const r2ChamberGate = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.chamberGateForPositiveCoefficient
    : undefined;
  const r2RankFourScans = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.rankFourFullStarScans
    : undefined;
  const r2ExpandedDisposition = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.expandedDisposition
    : undefined;
  const r2ResourceBounds = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.resourceBounds
    : undefined;
  const r2Conclusion = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.conclusion
    : undefined;
  const r2All128QuickGates = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.all128NonzeroQuickGates
    : undefined;
  const r2FullProductDisposition = isRecord(BUNDLED_TYPE6_R2_PERIODIC_REPAIR)
    ? BUNDLED_TYPE6_R2_PERIODIC_REPAIR.fullProductDisposition
    : undefined;
  const r2ChamberGates = isRecord(r2All128QuickGates)
    ? r2All128QuickGates.chamberGates
    : undefined;
  const r2RankFourFiveTypeGates = isRecord(r2All128QuickGates)
    ? r2All128QuickGates.rankFourFiveTypeGates
    : undefined;
  const r2NegativeChamber = isRecord(r2ChamberGates)
    ? r2ChamberGates["-1"]
    : undefined;
  const r2PositiveChamber = isRecord(r2ChamberGates)
    ? r2ChamberGates["1"]
    : undefined;
  const r2NegativeRankFour = isRecord(r2RankFourFiveTypeGates)
    ? r2RankFourFiveTypeGates["-1"]
    : undefined;
  const r2PositiveRankFour = isRecord(r2RankFourFiveTypeGates)
    ? r2RankFourFiveTypeGates["1"]
    : undefined;
  const expectedR2Coefficients = [-1, 0, 1];
  const expectedR2Representatives = [19, 21, 22, 25, 26, 28];
  const r2SourcesMatch =
    isRecord(r2LqSource) &&
    r2LqSource.artifactSha256 === BUNDLED_LQ_SCHREIER_TABLE.artifactSha256 &&
    isRecord(r2CharacterSource) &&
    r2CharacterSource.artifactSha256 === BUNDLED_TYPE6_TRACK_B.artifactSha256 &&
    isRecord(r2FullStarSource) &&
    r2FullStarSource.artifactSha256 ===
      BUNDLED_TYPE6_FULL_STAR_COMPILED.artifactSha256 &&
    isRecord(r2EquivalenceSource) &&
    r2EquivalenceSource.artifactSha256 ===
      BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE.artifactSha256;
  const r2MotifsRepaired =
    Array.isArray(r2MotifAudit) &&
    r2MotifAudit.length === expectedR2Representatives.length &&
    r2MotifAudit.every((entry, index) => {
      if (!isRecord(entry) || !isRecord(entry.coefficientResults)) return false;
      const positive = entry.coefficientResults["1"];
      return (
        entry.candidateIndex === expectedR2Representatives[index] &&
        isRecord(positive) &&
        positive.ascendingComponentCount === 1 &&
        positive.descendingComponentCount === 1 &&
        Array.isArray(positive.failures) &&
        positive.failures.length === 0
      );
    });
  const r2RankFourExhausted =
    isRecord(r2RankFourScans) &&
    expectedR2Coefficients.every((coefficient) => {
      const scan = r2RankFourScans[String(coefficient)];
      return (
        isRecord(scan) &&
        scan.coefficient === coefficient &&
        scan.candidateRepresentativeCount === 6 &&
        scan.encodedRankFourCellOrbitCount === 7_540 &&
        scan.eliminatedCount === 6 &&
        scan.survivorCount === 0
      );
    });
  const r2PeriodicRepairReplayed =
    r2PeriodicRepairSealValid &&
    BUNDLED_TYPE6_R2_PERIODIC_REPAIR.kind ===
      "makarov-p2-type6-r2-periodic-repair-search" &&
    BUNDLED_TYPE6_R2_PERIODIC_REPAIR.status ===
      "bounded-r2-all128-quick-gates-40-open" &&
    r2SourcesMatch &&
    isRecord(r2PeriodicCoordinate) &&
    r2PeriodicCoordinate.name === "R2" &&
    JSON.stringify(r2PeriodicCoordinate.coefficientSet) ===
      JSON.stringify(expectedR2Coefficients) &&
    isRecord(r2GlobalCompatibility) &&
    typeof r2GlobalCompatibility.unrootedCellWellDefined === "string" &&
    typeof r2GlobalCompatibility.faceCompatible === "string" &&
    typeof r2GlobalCompatibility.characterUnchanged === "string" &&
    isRecord(r2BoundedFamily) &&
    r2BoundedFamily.oldFullStarArtifactSha256 ===
      BUNDLED_TYPE6_FULL_STAR_COMPILED.artifactSha256 &&
    r2BoundedFamily.oldTypePotentialFamilyPreserved === true &&
    r2BoundedFamily.coefficientCount === 3 &&
    r2BoundedFamily.candidateRepresentativeCount === 6 &&
    r2BoundedFamily.representativeCoefficientPairCount === 18 &&
    r2BoundedFamily.equivalenceExpandedCandidateCount === 24 &&
    r2BoundedFamily.equivalenceExpandedCoefficientPairCount === 72 &&
    r2BoundedFamily.fullTypePotentialCandidateCount === 128 &&
    r2BoundedFamily.fullThreeCoefficientProductPairCount === 384 &&
    r2BoundedFamily.productPairsEliminatedThroughAvailableGates === 344 &&
    r2BoundedFamily.productPairsOpenAfterAvailableGates === 40 &&
    r2MotifsRepaired &&
    isRecord(r2ChamberGate) &&
    r2ChamberGate.coefficient === 1 &&
    r2ChamberGate.fullReducedChamberRootsRepresented === 149_760 &&
    r2ChamberGate.jointProfileCount === 31 &&
    r2ChamberGate.candidateRepresentativeCount === 6 &&
    r2ChamberGate.eliminatedCount === 0 &&
    r2ChamberGate.survivorCount === 6 &&
    r2RankFourExhausted &&
    isRecord(r2ExpandedDisposition) &&
    r2ExpandedDisposition.coefficientCandidatePairCount === 72 &&
    r2ExpandedDisposition.eliminatedCount === 72 &&
    r2ExpandedDisposition.survivorCount === 0 &&
    isRecord(r2NegativeChamber) &&
    r2NegativeChamber.fullCandidateCount === 128 &&
    r2NegativeChamber.eliminatedCount === 36 &&
    r2NegativeChamber.survivorCount === 92 &&
    isRecord(r2PositiveChamber) &&
    r2PositiveChamber.fullCandidateCount === 128 &&
    r2PositiveChamber.eliminatedCount === 16 &&
    r2PositiveChamber.survivorCount === 112 &&
    isRecord(r2NegativeRankFour) &&
    r2NegativeRankFour.inputCandidateCount === 92 &&
    r2NegativeRankFour.eliminatedCount === 92 &&
    r2NegativeRankFour.survivorCount === 0 &&
    isRecord(r2PositiveRankFour) &&
    r2PositiveRankFour.inputCandidateCount === 112 &&
    r2PositiveRankFour.eliminatedCount === 72 &&
    r2PositiveRankFour.survivorCount === 40 &&
    isRecord(r2All128QuickGates) &&
    r2All128QuickGates.nonzeroCoefficientPairCount === 256 &&
    r2All128QuickGates.chamberEliminatedPairCount === 52 &&
    r2All128QuickGates.rankFourEliminatedAfterChamberPairCount === 164 &&
    r2All128QuickGates.openPairCount === 40 &&
    r2All128QuickGates.old24FrontierOpenPairCount === 0 &&
    Array.isArray(r2All128QuickGates.openPairs) &&
    r2All128QuickGates.openPairs.length === 40 &&
    isRecord(r2FullProductDisposition) &&
    r2FullProductDisposition.pairCount === 384 &&
    r2FullProductDisposition.eliminatedThroughAvailableGates === 344 &&
    r2FullProductDisposition.openAfterAvailableGates === 40 &&
    r2FullProductDisposition.old24FrontierOpenPairs === 0 &&
    r2FullProductDisposition.allOpenPairsAreResurrectedOutsideOldFrontier ===
      true &&
    isRecord(r2ResourceBounds) &&
    r2ResourceBounds.encodedRankFourCellOrbitCount === 7_540 &&
    r2ResourceBounds.completedWithinWallCap === true &&
    r2ResourceBounds.noMaximalType5ScanLaunched === true &&
    isRecord(r2Conclusion) &&
    typeof r2Conclusion.nonClaim === "string" &&
    r2Conclusion.nonClaim.includes("other periodic cell coordinates") &&
    r2Conclusion.nonClaim.includes("primitive characters");
  if (!r2PeriodicRepairReplayed) {
    throw new Error(
      "The bundled P2 R2 periodic-repair artifact does not replay its exact bounded-family exhaustion and scope boundary.",
    );
  }

  const r2MaximalSealValid = canonicalSealValid(
    BUNDLED_TYPE6_R2_MAXIMAL_COMPILED,
    "artifactSha256",
  );
  const r2MaximalSources = isRecord(BUNDLED_TYPE6_R2_MAXIMAL_COMPILED)
    ? BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.sourceBindings
    : undefined;
  const r2MaximalQuickSource = isRecord(r2MaximalSources)
    ? r2MaximalSources.r2QuickGateCertificate
    : undefined;
  const r2MaximalLqSource = isRecord(r2MaximalSources)
    ? r2MaximalSources.lqSchreierTable
    : undefined;
  const r2MaximalExactInput = isRecord(BUNDLED_TYPE6_R2_MAXIMAL_COMPILED)
    ? BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.exactInput
    : undefined;
  const r2MaximalCheckpoint = isRecord(BUNDLED_TYPE6_R2_MAXIMAL_COMPILED)
    ? BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.checkpointTranscript
    : undefined;
  const r2MaximalScreen = isRecord(BUNDLED_TYPE6_R2_MAXIMAL_COMPILED)
    ? BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.screen
    : undefined;
  const r2MaximalReplay = isRecord(BUNDLED_TYPE6_R2_MAXIMAL_COMPILED)
    ? BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.independentReplay
    : undefined;
  const r2MaximalResources = isRecord(BUNDLED_TYPE6_R2_MAXIMAL_COMPILED)
    ? BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.resourceBounds
    : undefined;
  const r2MaximalNonClaims = isRecord(BUNDLED_TYPE6_R2_MAXIMAL_COMPILED)
    ? BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.nonClaims
    : undefined;
  const r2MaximalReplayed =
    r2MaximalSealValid &&
    BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.kind ===
      "makarov-p2-type6-r2-maximal-type5-compiled-scan" &&
    BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.status === "maximal-type5-eliminated" &&
    isRecord(r2MaximalQuickSource) &&
    r2MaximalQuickSource.bytesSha256 ===
      BUNDLED_TYPE6_R2_PERIODIC_REPAIR_BYTES_SHA256 &&
    r2MaximalQuickSource.artifactSha256 ===
      BUNDLED_TYPE6_R2_PERIODIC_REPAIR.artifactSha256 &&
    isRecord(r2MaximalLqSource) &&
    r2MaximalLqSource.bytesSha256 === BUNDLED_LQ_SCHREIER_TABLE_BYTES_SHA256 &&
    r2MaximalLqSource.artifactSha256 ===
      BUNDLED_LQ_SCHREIER_TABLE.artifactSha256 &&
    isRecord(r2MaximalExactInput) &&
    r2MaximalExactInput.coefficient === 1 &&
    r2MaximalExactInput.inputCandidateCount === 40 &&
    r2MaximalExactInput.inputEquivalenceClassCount === 10 &&
    r2MaximalExactInput.totalMaximalType5CellOrbitCount === 5_078 &&
    typeof r2MaximalExactInput.multiplicityPolicy === "string" &&
    r2MaximalExactInput.multiplicityPolicy.includes("every actual W_T/W_R") &&
    isRecord(r2MaximalCheckpoint) &&
    r2MaximalCheckpoint.rowCount === 2_334 &&
    r2MaximalCheckpoint.completedOrbitCount === 2_334 &&
    JSON.stringify(r2MaximalCheckpoint.completedRowsByType) ===
      JSON.stringify([492, 1_772, 46, 24, 0]) &&
    r2MaximalCheckpoint.activeCandidateMaskHex === "000" &&
    r2MaximalCheckpoint.allCandidatesEliminatedEarly === true &&
    isRecord(r2MaximalScreen) &&
    r2MaximalScreen.inputCandidateCount === 40 &&
    r2MaximalScreen.inputEquivalenceClassCount === 10 &&
    r2MaximalScreen.eliminatedCount === 40 &&
    r2MaximalScreen.survivorCount === 0 &&
    Array.isArray(r2MaximalScreen.survivorCandidateIndices) &&
    r2MaximalScreen.survivorCandidateIndices.length === 0 &&
    isRecord(r2MaximalReplay) &&
    r2MaximalReplay.checkpointHashChainAndSequencePassed === true &&
    r2MaximalReplay.compiledFirstFailuresReplayedFromCompleteFibers === 10 &&
    r2MaximalReplay.allFailureWitnessesPassed === true &&
    isRecord(r2MaximalResources) &&
    r2MaximalResources.wallSecondsCap === 900 &&
    r2MaximalResources.memoryMiBCap === 8_192 &&
    r2MaximalResources.completedWithinWallCap === true &&
    Array.isArray(r2MaximalNonClaims) &&
    r2MaximalNonClaims.some(
      (claim) =>
        typeof claim === "string" &&
        claim.includes("canonical barycentric subdivision"),
    ) &&
    r2MaximalNonClaims.some(
      (claim) =>
        typeof claim === "string" &&
        claim.includes("No Track-B fibering claim"),
    );
  if (!r2MaximalReplayed) {
    throw new Error(
      "The bundled P2 R2 maximal-type-5 artifact does not replay its 10-class/40-candidate elimination and independent complete-fiber witnesses.",
    );
  }

  return {
    primitiveCocycle: {
      locator: BUNDLED_PRIMITIVE_COCYCLE_LOCATOR,
      bytesSha256: BUNDLED_PRIMITIVE_COCYCLE_BYTES_SHA256,
      certificateSha256: String(BUNDLED_PRIMITIVE_COCYCLE.certificateSha256),
      sealValid: true,
      importBindingMatches,
      exactTriangleClosure,
      treeGaugeReplayed,
      primitiveCycleWitnessReplayed,
    },
    primitiveCocycleScreeningPortfolio: {
      locator: BUNDLED_COCYCLE_SCREENING_PORTFOLIO_LOCATOR,
      bytesSha256: BUNDLED_COCYCLE_SCREENING_PORTFOLIO_BYTES_SHA256,
      artifactSha256: String(
        BUNDLED_COCYCLE_SCREENING_PORTFOLIO.artifactSha256,
      ),
      sealValid: true,
      importBindingMatches: true,
      status: "two-independent-primitive-classes-cheap-screened",
      registeredCandidateCount: 2,
      primitiveClassCount: 2,
      exactTriangleCountEach: 156_000,
      qLinearlyIndependent: true,
      independenceWitnessGenerator: 4,
      bothCheapAnchorScreensObstructed: true,
      fullCharacterLatticeMaterialized: false,
      globalTrackBScreenRun: false,
      otherGaugesRemainOpen: true,
    },
    compressedTrackB: {
      locator: BUNDLED_COMPRESSED_TRACK_B_LOCATOR,
      bytesSha256: BUNDLED_COMPRESSED_TRACK_B_BYTES_SHA256,
      artifactSha256: String(BUNDLED_COMPRESSED_TRACK_B.artifactSha256),
      sealValid: true,
      primitiveCocycleBindingMatches,
      status: "fixed-model-obstructed-at-anchor",
      rootedStateUnionCount,
      bothTiePolaritiesRejectedAtIdentity,
      globalAllVertexScanNeededForRecordedModel: false,
    },
    coarseTrackB: {
      locator: BUNDLED_COARSE_TRACK_B_LOCATOR,
      bytesSha256: BUNDLED_COARSE_TRACK_B_BYTES_SHA256,
      certificateSha256: String(BUNDLED_COARSE_TRACK_B.certificateSha256),
      sealValid: true,
      primitiveCocycleBindingMatches: coarsePrimitiveCocycleBindingMatches,
      status: "fixed-model-obstructed-at-root",
      bothCanonicalPerturbationPolaritiesRejectedAtRoot,
      coloredRootCopiesCovered: 256,
      globalAllVertexScanCompleted: false,
    },
    strictWallTrackA: {
      locator: BUNDLED_GENERALIZED_TRACK_A_LOCATOR,
      bytesSha256: BUNDLED_GENERALIZED_TRACK_A_BYTES_SHA256,
      certificateSha256: String(BUNDLED_GENERALIZED_TRACK_A.certificateSha256),
      sealValid: true,
      primitiveCocycleBindingMatches: trackAPrimitiveCocycleBindingMatches,
      wallCompatibilityBindingMatches: trackAWallCompatibilityBindingMatches,
      status: "explicit-character-obstructed-other-variants-incomplete",
      strictWallTrackAInputIncomplete,
      directCocycleTrackANotRun,
      finiteHeightBandNotRun,
      missingRequiredObjectCount,
      formerTrackBRootObstructionRepairedByLocalPotential,
      globalDirectedLinksChecked: false,
    },
    wallCompatibility: {
      locator: BUNDLED_WALL_COMPATIBILITY_LOCATOR,
      bytesSha256: BUNDLED_WALL_COMPATIBILITY_BYTES_SHA256,
      artifactSha256: String(BUNDLED_WALL_COMPATIBILITY.artifactSha256),
      sealValid: true,
      primitiveCocycleBindingMatches: wallPrimitiveCocycleBindingMatches,
      status: "explicit-character-not-in-rational-wall-span",
      rationalWallSpanContainsExplicitCharacter: false,
      gaugeIndependent: true,
      periodicPotentialCanRepair: false,
      saturationCanRepair: false,
      sectionPullbackPrimitiveReplayed: true,
      importAndIncidenceCrossBindingReplayed: true,
      differentWallCharacterTrackAOpen: true,
      directCocycleTrackAOpen: true,
    },
    fullWallCoorientation: {
      locator: BUNDLED_WALL_COORIENTATION_LOCATOR,
      bytesSha256: BUNDLED_WALL_COORIENTATION_BYTES_SHA256,
      artifactSha256: String(BUNDLED_WALL_COORIENTATION.artifactSha256),
      sealValid: true,
      status: "full-wall-system-not-coorientable",
      labelsPassingFullSpanTest: 650,
      everyType5WallComponentOneSided: true,
      fullWallSystemCoorientable: false,
      explicitReversingLoopReplayed: true,
      type6WallCount: 256,
      type6WallsTwoSided: true,
      type6PartialCocycleStrictTrackAAdmissible: false,
      directCocycleTrackAUnaffected: true,
      furtherCoverRemainsOpen: true,
    },
    colorClassWallOrientation: {
      locator: BUNDLED_COLOR_CLASS_WALL_ORIENTATION_LOCATOR,
      bytesSha256: BUNDLED_COLOR_CLASS_WALL_ORIENTATION_BYTES_SHA256,
      artifactSha256: String(
        BUNDLED_COLOR_CLASS_WALL_ORIENTATION.artifactSha256,
      ),
      sealValid: true,
      status: "color-class-only-orientation-covers-obstructed",
      minimalColorClassExtensionIndex: 16,
      minimalExtensionRepairsType5Obstruction: true,
      projectedSideWallClassCount: 300,
      projectedSideWallConflictCount: 300,
      anyColorClassOnlyVoltageExtensionCanHaveFullWallCoorientation: false,
      lawfulCellClosureDefinedForTheseCovers: false,
      directedLinkCalculationRun: false,
      facetSpecificCoverRemainsOpen: true,
      oddPrimeCoverRemainsOpen: true,
    },
    globalLawfulReadiness: {
      locator: BUNDLED_GLOBAL_LAWFUL_READINESS_LOCATOR,
      bytesSha256: BUNDLED_GLOBAL_LAWFUL_READINESS_BYTES_SHA256,
      artifactSha256: String(BUNDLED_GLOBAL_LAWFUL_READINESS.artifactSha256),
      sealValid: true,
      status: "downstream-not-run-no-wall-coorientation-on-current-cover",
      wallCoorientationBindingMatches: true,
      colorClassWallOrientationBindingMatches: true,
      lawfulClosureAndDirectedLinksDefined: false,
      runOnCurrentCover: false,
      unreducedCellCount: 57_793_049_600,
      sheetInvariantTemplateCount: 176_905_950,
      sheetInvariantRankTwoTemplateCount: 66_456_000,
      conditionalHeightRuleFaceCompatible: true,
    },
    type6TrackB: {
      locator: BUNDLED_TYPE6_TRACK_B_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_TRACK_B_BYTES_SHA256,
      artifactSha256: String(BUNDLED_TYPE6_TRACK_B.artifactSha256),
      sealValid: true,
      status: "primitive-cocycle-one-identity-polarity-passed",
      wallCocycleClosed: true,
      wallCocycleTwoSided: true,
      primitiveIntegralCharacter: true,
      primitiveLoopEvaluation: -1,
      survivingPolarity: -1,
      ascendingVertexCount: 14_647,
      descendingVertexCount: 33_901,
      bothIdentityLinksConnected: true,
      oppositePolarityDescendingEmpty: true,
      globalScanRun: false,
      requiredRootCount: 4_792_320_000,
      localTemplateOrAutomatonReductionOpen: true,
      globalResultCertified: false,
    },
    type6BarycentricReduction: {
      locator: BUNDLED_TYPE6_BARYCENTRIC_REDUCTION_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_BARYCENTRIC_REDUCTION_BYTES_SHA256,
      artifactSha256: String(
        BUNDLED_TYPE6_BARYCENTRIC_REDUCTION.artifactSha256,
      ),
      sealValid: true,
      status: "exact-reduction-global-fourier-links-not-yet-run",
      type6CharacterBindingMatches: true,
      fixedCharacterSymmetryOrder: 32_000,
      originalChamberOrbitCount: 149_760,
      cellBarycenterOrbitLowerBound: 1_806_033,
      typeOnlyTemplateCount: 124,
      rawDominantTypeOnlyObstructed: true,
      positiveDimensionEmptyLinkWitnessCount: 2_396_160_000,
      negativeDimensionEmptyLinkWitnessCount: 22_630_400,
      fourierFrameDependent: true,
      globalFourierLinksRun: false,
      globalResultCertified: false,
    },
    type6FourierFrameScreen: {
      locator: BUNDLED_TYPE6_FOURIER_FRAME_SCREEN_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_FOURIER_FRAME_SCREEN_BYTES_SHA256,
      artifactSha256: String(BUNDLED_TYPE6_FOURIER_FRAME_SCREEN.artifactSha256),
      sealValid: true,
      status: "incomplete-backend-timeout-no-mathematical-result",
      type6CharacterBindingMatches: true,
      plannedFrameCount: 74_880,
      plannedReducedOriginalVertexCount: 149_760,
      candidateCount: 128,
      certifiedFrameCount: 0,
      certifiedReducedOriginalVertexCount: 0,
      certifiedCandidateCount: 0,
      candidateEliminations: 0,
      candidateSurvivors: 0,
      higherCellTemplatesChecked: 0,
      completeFrameTranscriptAvailable: false,
      mathematicalDisposition: "none",
      boundedAttemptCount: 2,
      fallbackTimeoutExitCode: 124,
      exactRunnerOptIn: true,
    },
    lqSchreierTable: {
      locator: BUNDLED_LQ_SCHREIER_TABLE_LOCATOR,
      bytesSha256: BUNDLED_LQ_SCHREIER_TABLE_BYTES_SHA256,
      artifactSha256: String(BUNDLED_LQ_SCHREIER_TABLE.artifactSha256),
      sealValid: true,
      status: "exact-74880-state-table-certified",
      section5ImportBindingMatches: true,
      frameCount: 74_880,
      transitionCount: 374_400,
      exactQOrder: 9_360_000,
      colorStabilizerOrder: 125,
      coloringStabilizerExactlyL: true,
      compressedTableBytes: 1_209_649,
      originalChamberOrbitCount: 149_760,
      maximalType5Ready: true,
    },
    type6SchreierChamberScreen: {
      locator: BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN_BYTES_SHA256,
      artifactSha256: String(
        BUNDLED_TYPE6_SCHREIER_CHAMBER_SCREEN.artifactSha256,
      ),
      sealValid: true,
      status: "chamber-root-survivor-frontier",
      lqSchreierBindingMatches,
      type6CharacterBindingMatches: chamberType6CharacterBindingMatches,
      exactOriginalChamberRootCount: 149_760,
      uniqueFrameFlagPatternCount: 6,
      candidateCount: 128,
      eliminatedCount: 16,
      survivorCount: 112,
      allFramesAndSignsCovered: true,
      higherCellGateRequired: true,
      globalResultCertified: false,
    },
    type6MaximalType5Timeout: {
      locator: BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT_BYTES_SHA256,
      artifactSha256: String(
        BUNDLED_TYPE6_MAXIMAL_TYPE5_TIMEOUT.artifactSha256,
      ),
      sealValid: true,
      status: "incomplete-wall-time-no-global-mathematical-result",
      lqSchreierBindingMatches: true,
      chamberScreenBindingMatches: true,
      wallSecondsCap: 900,
      maximalCellOrbitCount: 5_078,
      constantFourierCellOrbitCount: 2_616,
      zeroFourierCellOrbitCount: 2_462,
      intersectionCandidateCount: 80,
      globalMaximalType5ScreenComplete: false,
      completeGlobalTranscript: false,
      partialZeroFourierTranscriptRetained: false,
      certifiedZeroFourierCellLinkRows: 0,
      constantFourierStageComplete: true,
      constantFourierCandidateEliminations: 48,
      constantFourierCandidateSurvivors: 32,
      constantFourierSurvivorEquivalenceClassCount: 8,
      zeroFourierStageComplete: false,
      zeroFourierMathematicalDisposition: "none",
      exactRunnerOptIn: true,
    },
    type6ZeroFourierCompiled: {
      locator: BUNDLED_TYPE6_ZERO_FOURIER_COMPILED_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_ZERO_FOURIER_COMPILED_BYTES_SHA256,
      artifactSha256: String(
        BUNDLED_TYPE6_ZERO_FOURIER_COMPILED.artifactSha256,
      ),
      sealValid: true,
      status: "zero-Fourier-maximal-type5-survivor-frontier",
      timeoutReceiptBindingMatches: true,
      lqSchreierBindingMatches: true,
      zeroFourierCellOrbitCount: 2_462,
      completedRowsByType: [132, 6, 724, 1_100, 500],
      fullFaceCosetsRetained: true,
      everySurvivorCheckedAtEveryOrbit: true,
      inputCandidateCount: 32,
      inputEquivalenceClassCount: 8,
      eliminatedCandidateCount: 8,
      survivorCandidateCount: 24,
      survivorCandidateIndices: [...expectedZeroFourierSurvivorIndices],
      compiledFailureWitnessesReplayedInPython: 2,
      nonmaximalBarycentricLinksOpen: true,
      globalTrackBCertified: false,
    },
    type6ConeApex: {
      locator: BUNDLED_TYPE6_CONE_APEX_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_CONE_APEX_BYTES_SHA256,
      artifactSha256: String(BUNDLED_TYPE6_CONE_APEX.artifactSha256),
      sealValid: true,
      status: "exact-type6-links-automatic-56-types-remain",
      barycentricReductionBindingMatches: true,
      maximalType5FrontierBindingMatches: true,
      lqSchreierBindingMatches: true,
      automaticType6CellTypeCount: 31,
      automaticType6CellOrbitCount: 471_770,
      unresolvedCellTypeCount: 56,
      unresolvedCellOrbitCount: 1_589_860,
      firstRankFourSideCellOrbitCount: 7_540,
      everyType6DirectedLinkAutomatic: true,
      globalTrackBCertified: false,
    },
    type6FullStarEquivalence: {
      locator: BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE_BYTES_SHA256,
      artifactSha256: String(
        BUNDLED_TYPE6_FULL_STAR_EQUIVALENCE.artifactSha256,
      ),
      sealValid: true,
      status: "exact-global-equivalence-for-central-types-avoiding-generator6",
      maximalType5FrontierBindingMatches: true,
      type6CharacterBindingMatches: true,
      sourceSurvivorCount: 24,
      equivalenceClassCount: 6,
      representativeCandidateIndices: [...expectedFullStarRepresentatives],
      unresolvedCentralTypeCount: 56,
      representativeOnlyGlobalScanExact: true,
    },
    type6FullStarCompiled: {
      locator: BUNDLED_TYPE6_FULL_STAR_COMPILED_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_FULL_STAR_COMPILED_BYTES_SHA256,
      artifactSha256: String(BUNDLED_TYPE6_FULL_STAR_COMPILED.artifactSha256),
      sealValid: true,
      status: "current-type6-height-family-eliminated",
      equivalenceBindingMatches: true,
      coneApexBindingMatches: true,
      maximalType5FrontierBindingMatches: true,
      lqSchreierBindingMatches: true,
      exactRankFourSideCellOrbitCount: 7_540,
      completedCellOrbitRows: 5_626,
      completedRowsByType: [1_248, 3_120, 1_258, 0, 0],
      fullFaceCosetsAndBothUpperCofacesRetained: true,
      inputCandidateCount: 24,
      inputEquivalenceClassCount: 6,
      eliminatedCandidateCount: 24,
      survivorCandidateCount: 0,
      compiledRepresentativeFailuresReplayedInPython: 6,
      equivalenceTransferredFailuresReplayedInPython: 24,
      currentDeclaredHeightFamilyEliminated: true,
      globalP2TrackBObstructed: false,
      globalFiberingObstructed: false,
    },
    type6R2PeriodicRepair: {
      locator: BUNDLED_TYPE6_R2_PERIODIC_REPAIR_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_R2_PERIODIC_REPAIR_BYTES_SHA256,
      artifactSha256: String(BUNDLED_TYPE6_R2_PERIODIC_REPAIR.artifactSha256),
      sealValid: true,
      status: "bounded-r2-all128-quick-gates-40-open",
      sourceBindingsMatch: true,
      fullFiberRootIndependent: true,
      faceCompatible: true,
      primitiveIntegralCharacterUnchanged: true,
      coefficientSet: [...expectedR2Coefficients],
      oldMotifsRepairedByPositiveCoefficient: 6,
      oldFrontierCoefficientPairCount: 72,
      fullProductCoefficientPairCount: 384,
      negativeCoefficientChamberSurvivorCount: 92,
      positiveCoefficientChamberSurvivorCount: 112,
      exactRankFourSideCellOrbitCount: 7_540,
      quickGateEliminatedPairCount: 344,
      quickGateSurvivorPairCount: 40,
      quickGateSurvivorClassCount: 10,
      completedWithinWallCap: true,
      oldFrontierClosed: true,
      fullProductClosedAtQuickGates: false,
      otherPeriodicCoordinatesRemainOpen: true,
      globalP2TrackBObstructed: false,
      globalFiberingObstructed: false,
    },
    type6R2MaximalCompiled: {
      locator: BUNDLED_TYPE6_R2_MAXIMAL_COMPILED_LOCATOR,
      bytesSha256: BUNDLED_TYPE6_R2_MAXIMAL_COMPILED_BYTES_SHA256,
      artifactSha256: String(BUNDLED_TYPE6_R2_MAXIMAL_COMPILED.artifactSha256),
      sealValid: true,
      status: "maximal-type5-eliminated",
      quickGateBindingMatches: true,
      lqSchreierBindingMatches: true,
      coefficient: 1,
      maximalType5CellOrbitCount: 5_078,
      inputCandidateCount: 40,
      inputEquivalenceClassCount: 10,
      completedCellOrbitRows: 2_334,
      completedRowsByType: [492, 1_772, 46, 24, 0],
      fullFaceCosetsRetained: true,
      eliminatedCandidateCount: 40,
      survivorCandidateCount: 0,
      representativeFailuresReplayedInPython: 10,
      completedWithinWallCap: true,
      fullR2ProductClosed: true,
      otherPeriodicCoordinatesRemainOpen: true,
      globalP2TrackBObstructed: false,
      globalFiberingObstructed: false,
    },
    facetBinaryOrientationCover: {
      locator: BUNDLED_FACET_BINARY_ORIENTATION_LOCATOR,
      bytesSha256: BUNDLED_FACET_BINARY_ORIENTATION_BYTES_SHA256,
      artifactSha256: String(BUNDLED_FACET_BINARY_ORIENTATION.artifactSha256),
      sealValid: true,
      status: "valid-rank312-cover-rank15-unresolved",
      allWallsTwoSided: true,
      totalSheetRank: 312,
      relativeIndexPowerOfTwoExponent: 303,
      rank14ImpossibleInScopedFamily: true,
      rank15Resolved: false,
      canonicalOracleIdentityLinkPassed: false,
      globalLawfulCalculationRun: false,
    },
    wallFlipCegar: {
      locator: BUNDLED_WALL_FLIP_CEGAR_LOCATOR,
      bytesSha256: BUNDLED_WALL_FLIP_CEGAR_BYTES_SHA256,
      artifactSha256: String(BUNDLED_WALL_FLIP_CEGAR.artifactSha256),
      sealValid: true,
      status: "exact-unsat-empty-directed-link-in-scoped-ansatz",
      rank312CoverBindingMatches: true,
      orbitFlipVariableCount: 951,
      incidentSheetSignRank: 7,
      incidentFlipAssignmentCount: 128,
      assignmentsPassingNonemptyBothSides: 0,
      witnessWordLength: 1,
      translationEquivariantOrbitFlipCandidateExists: false,
      globalLawfulClosureRun: false,
      globalDirectedLinksRun: false,
      independentlyResolvedWallComponentsRemainOpen: true,
    },
    sheetResolvedWallFlipCegar: {
      locator: BUNDLED_SHEET_RESOLVED_WALL_FLIP_LOCATOR,
      bytesSha256: BUNDLED_SHEET_RESOLVED_WALL_FLIP_BYTES_SHA256,
      artifactSha256: String(BUNDLED_SHEET_RESOLVED_WALL_FLIP.artifactSha256),
      unrestrictedDepth2Locator:
        BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_LOCATOR,
      unrestrictedDepth2BytesSha256:
        BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED_BYTES_SHA256,
      unrestrictedDepth2ArtifactSha256: String(
        BUNDLED_SHEET_RESOLVED_WALL_FLIP_UNRESTRICTED.artifactSha256,
      ),
      sealValid: true,
      unrestrictedDepth2SealValid: true,
      status: "bounded-structured-survivor-rejected-at-next-frontier",
      rank312CoverBindingMatches: true,
      exactComponentKeyFormulasCertified: true,
      sideProjectiveRootClassCount: 300,
      type5LabelCount: 650,
      type6StabilizerRank: 1,
      compactRadius1VertexCount: 768,
      compactRadius1RankTwoCellCount: 11_520,
      compactRadius1WallComponentVariableCount: 1_834,
      compactRuleRejectedAtRadius2: true,
      compactRuleRadius2FailedVertexCount: 96,
      unrestrictedRadius2VertexCount: 2_560,
      unrestrictedRadius2RankTwoCellCount: 32_768,
      unrestrictedRadius2WallComponentVariableCount: 2_736,
      unrestrictedRadius2BothDirectedLinksPass: true,
      globalTrackACertified: false,
      higherCellAndSubdivisionLinksRun: false,
    },
    titsOrientationCover: {
      locator: BUNDLED_TITS_ORIENTATION_LOCATOR,
      bytesSha256: BUNDLED_TITS_ORIENTATION_BYTES_SHA256,
      artifactSha256: String(BUNDLED_TITS_ORIENTATION.artifactSha256),
      sealValid: true,
      status:
        "orientation-cover-proved-canonical-oracle-edge-link-obstructed-image-order-not-computed",
      allWallsTwoSided: true,
      torsionFree: true,
      degreeLowerBound: 38_338_560_000,
      exactImageOrderComputed: false,
      canonicalOracleIdentityLinkPassed: false,
      globalLawfulCalculationRun: false,
    },
    titsRootOrbitFrontier: {
      locator: BUNDLED_TITS_ROOT_ORBIT_LOCATOR,
      bytesSha256: BUNDLED_TITS_ROOT_ORBIT_BYTES_SHA256,
      artifactSha256: String(BUNDLED_TITS_ROOT_ORBIT.artifactSha256),
      sealValid: true,
      status: "exact-image-order-computed-root-line-flip-frontier-open",
      priorTitsCoverBindingMatches: true,
      exactImageOrderComputed: true,
      exactImageDescription: "ker(spinor: O(7,9) -> F9*/(F9*)^2)",
      exactImageOrderDecimal: "108051462804999168000",
      section5SubgroupNonnormalWitnessReplayed: true,
      section5SubgroupImageDivisor: 40,
      exactOrientationCoverDegreeComputed: false,
      rootLineConstantFlipVariableCount: 266_085,
      rootTransversalFullLinkFailureCount: 31_400,
      pointStabilizerLayerFailureCounts: [0, 3_656, 3_456, 12_400, 6_043],
      storedRootLineCandidatePassed: false,
      actualQuotientWallComponentCountComputed: false,
      globalLawfulClosureAuthorized: false,
      globalTrackACertified: false,
    },
    replayStatus: "passed-bundled-fixed-character-evidence",
  };
}

function withoutDigest(
  plan: P2CoarseExperimentPlan,
): Omit<P2CoarseExperimentPlan, "artifactDigest"> {
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "artifactDigest"),
  ) as Omit<P2CoarseExperimentPlan, "artifactDigest">;
}

/**
 * Build the Section 5 plan. The bundled source set replays its sealed import
 * certificate and promotes only the split-rank H1 gate. Other source sets stay
 * at import planning until an equally bound certificate is supplied.
 */
export function buildP2CoarseExperimentPlan(
  bindings: readonly P2CoarseSourceBinding[] = P2_BUNDLED_SOURCE_BINDINGS,
): P2CoarseExperimentPlan {
  const sourceBindings = validateAndSortBindings(bindings);
  const present = new Set(sourceBindings.map(({ role }) => role));
  const missingRoles = P2_COARSE_REQUIRED_SOURCE_ROLES.filter(
    (role) => !present.has(role),
  );
  const runnable = missingRoles.length === 0;
  const importCertificate = replayBundledImportCertificate(sourceBindings);
  const importReplayed =
    importCertificate.replayStatus === "passed-bundled-certificate";
  const fixedCharacterEvidence =
    replayBundledFixedCharacterEvidence(importCertificate);
  const fixedCharacterReplayed =
    fixedCharacterEvidence.replayStatus ===
    "passed-bundled-fixed-character-evidence";
  const payload: Omit<P2CoarseExperimentPlan, "artifactDigest"> = {
    schemaVersion: 1,
    kind: "p2-coarse-coloring-experiment-plan",
    status: fixedCharacterReplayed
      ? "bundled-fixed-character-screened"
      : importReplayed
        ? "bundled-import-replayed-positive-h1-gate"
        : runnable
          ? "ready-for-exact-import-replay"
          : "blocked-missing-imports",
    paper: PAPER,
    paperSupportedFacts: PAPER_SUPPORTED_FACTS,
    sourceBindings,
    sourceBundleDigest: canonicalSha256(sourceBindings),
    importGate: {
      requiredRoles: [...P2_COARSE_REQUIRED_SOURCE_ROLES],
      missingRoles: [...missingRoles],
      allRequiredExactSourcesBound: runnable,
      runnable,
      runnableScope: "exact-import-incidence-coloring-and-h1-gate",
    },
    importCertificate,
    integralH1Gate: {
      status: importReplayed
        ? "passed-positive"
        : "blocked-import-not-replayed",
      baseFourManifoldIntegralH1: "source-reported-Z^144",
      baseHomologyEvidenceKind: "source-reported-exact-HAP-output",
      inferenceKind: "repository-derived-retraction-inference",
      closedFiveManifoldFreeRankLowerBound: importReplayed ? 144 : 0,
      nonzeroIntegralCharacterExists: importReplayed,
      primitiveIntegralCharacterExists: importReplayed,
      fullIntegralH1: "not-computed",
      explicitPrimitiveCharacterMaterialized: fixedCharacterReplayed,
      fullCharacterLatticeMaterialized: false,
      independentH1Replay: importReplayed
        ? "not-completed-resource-and-tooling-limit"
        : "not-applicable-unrecognized-bundle",
    },
    fixedCharacterEvidence,
    stages: STAGES.map((stage) => {
      let state: P2CoarseExperimentPlan["stages"][number]["state"];
      if (fixedCharacterReplayed && stage.id === "compute-integral-h1") {
        state = "completed";
      } else if (importReplayed && COMPLETED_IMPORT_STAGE_IDS.has(stage.id)) {
        state = "completed";
      } else if (importReplayed) {
        state = "blocked";
      } else {
        state = runnable ? "planned" : "blocked";
      }
      return { ...stage, state };
    }),
    conclusions: {
      importedDataValidated: importReplayed,
      positiveIntegralH1Gate: importReplayed,
      nonzeroIntegralCharacterExists: importReplayed,
      primitiveIntegralCharacterExists: importReplayed,
      section5ColoredB1Known: false,
      explicitPrimitiveCharacterMaterialized: fixedCharacterReplayed,
      registeredPrimitiveClassCount: fixedCharacterReplayed ? 2 : 0,
      qIndependentPrimitiveClassCount: fixedCharacterReplayed ? 2 : 0,
      secondPrimitiveClassCheapScreenCompleted: fixedCharacterReplayed,
      secondPrimitiveClassObstructedForRecordedModel: fixedCharacterReplayed,
      secondPrimitiveClassGlobalTrackBOpen: fixedCharacterReplayed,
      fullCharacterLatticeMaterialized: false,
      trackBRunnable: fixedCharacterReplayed,
      fixedCharacterTrackBRunCompleted: fixedCharacterReplayed,
      fixedCharacterTrackBObstructedForRecordedModel: fixedCharacterReplayed,
      coarseFixedCharacterTrackBRunCompleted: fixedCharacterReplayed,
      coarseFixedCharacterTrackBObstructedForRecordedModel:
        fixedCharacterReplayed,
      strictWallTrackAInputIncomplete: !fixedCharacterReplayed,
      currentCoverFullWallCoorientabilityKnown: fixedCharacterReplayed,
      currentCoverFullWallCoorientable: false,
      currentCoverStrictWallTrackABlocked: fixedCharacterReplayed,
      directCocycleTrackANotRun: true,
      finiteHeightBandNotRun: true,
      explicitPrimitiveCharacterWallTrackAObstructed: fixedCharacterReplayed,
      otherWallCharacterTrackAOpen: !fixedCharacterReplayed,
      furtherCoverWallTrackAOpen: fixedCharacterReplayed,
      colorClassOnlyOrientationCoverOpen: !fixedCharacterReplayed,
      facetSpecificOrientationCoverOpen: false,
      facetSpecificOrientationCoverConstructed: fixedCharacterReplayed,
      oddPrimeOrientationCoverConstructed: fixedCharacterReplayed,
      orientationCoverGlobalLawfulCalculationRun: false,
      globalWallLawfulCalculationRun: false,
      type6TrackBAnchorRunCompleted: fixedCharacterReplayed,
      type6TrackBAnchorSurvived: fixedCharacterReplayed,
      type6TrackBGlobalScanRun: false,
      type6BarycentricReductionRunCompleted: fixedCharacterReplayed,
      type6RawDominantTypeOnlyObstructed: fixedCharacterReplayed,
      type6FourierFrameAttemptRecorded: fixedCharacterReplayed,
      type6FourierFrameScanCompleted: false,
      type6LqSchreierTableCertified: fixedCharacterReplayed,
      type6OriginalChamberScreenCompleted: fixedCharacterReplayed,
      type6OriginalChamberSurvivorCount: fixedCharacterReplayed ? 112 : 0,
      type6MaximalType5GlobalAttemptRecorded: fixedCharacterReplayed,
      type6MaximalType5GlobalScreenCompleted: fixedCharacterReplayed,
      type6MaximalType5SurvivorCount: fixedCharacterReplayed ? 24 : 0,
      type6NonmaximalBarycentricLinksOpen: false,
      type6DeclaredHeightFamilyScreenCompleted: fixedCharacterReplayed,
      type6DeclaredHeightFamilyObstructed: fixedCharacterReplayed,
      type6DeclaredHeightFamilySurvivorCount: 0,
      type6R2QuickGateSurvivorCount: fixedCharacterReplayed ? 40 : 0,
      type6R2MaximalType5ScreenCompleted: fixedCharacterReplayed,
      type6R2ProductScreenCompleted: fixedCharacterReplayed,
      type6R2ProductObstructed: fixedCharacterReplayed,
      type6R2ProductSurvivorCount: 0,
      type6OtherPeriodicCoordinatesOpen: true,
      wallFlipCegarScopedAnsatzObstructed: fixedCharacterReplayed,
      sheetResolvedComponentFormulasCertified: fixedCharacterReplayed,
      sheetResolvedRadius2SurvivorFrontier: fixedCharacterReplayed,
      sheetResolvedCompactRuleRejectedAtRadius2: fixedCharacterReplayed,
      sheetResolvedGlobalTrackAOpen: fixedCharacterReplayed,
      f9ExactImageOrderComputed: fixedCharacterReplayed,
      f9SubgroupImageDivisor: fixedCharacterReplayed ? 40 : 0,
      f9RootLineCandidateRejected: fixedCharacterReplayed,
      f9ExactDegreeOpen: fixedCharacterReplayed,
      f9GlobalFlipSearchOpen: fixedCharacterReplayed,
      positiveTrackACertificate: false,
      positiveTrackBCertificate: false,
      directCocycleTrackAOpen: true,
      conditionalMorseSearchComplete: false,
      algebraicFiberingCertified: false,
      smoothFiberingCertified: false,
    },
    nonClaims: [...NON_CLAIMS],
  };
  return { ...payload, artifactDigest: canonicalSha256(payload) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Replay the deterministic plan without reading or trusting external files. */
export function replayP2CoarseExperimentPlan(
  stored: unknown,
): P2CoarseExperimentPlanReplay {
  const checks: P2CoarseExperimentPlanReplay["checks"] = {
    envelopeRecognized: false,
    artifactDigestValid: false,
    sourceBindingsValid: false,
    paperFactsMatch: false,
    artifactMatchesRebuild: false,
  };
  const errors: string[] = [];
  let runnable = false;

  if (!isRecord(stored)) {
    errors.push("The P2 coarse experiment plan is not an object.");
  } else {
    checks.envelopeRecognized =
      stored.schemaVersion === 1 &&
      stored.kind === "p2-coarse-coloring-experiment-plan";
    if (!checks.envelopeRecognized) {
      errors.push("The P2 coarse experiment plan envelope is unsupported.");
    }

    const digest = stored.artifactDigest;
    if (typeof digest === "string") {
      const payload = Object.fromEntries(
        Object.entries(stored).filter(([key]) => key !== "artifactDigest"),
      );
      checks.artifactDigestValid = digest === canonicalSha256(payload);
    }
    if (!checks.artifactDigestValid) {
      errors.push("The P2 coarse experiment plan digest is invalid.");
    }

    checks.paperFactsMatch =
      canonicalSha256(stored.paper) === canonicalSha256(PAPER) &&
      canonicalSha256(stored.paperSupportedFacts) ===
        canonicalSha256(PAPER_SUPPORTED_FACTS);
    if (!checks.paperFactsMatch) {
      errors.push("The stored plan changes the paper-supported P2 facts.");
    }

    if (Array.isArray(stored.sourceBindings)) {
      try {
        const bindings = validateAndSortBindings(
          stored.sourceBindings as P2CoarseSourceBinding[],
        );
        checks.sourceBindingsValid = true;
        const rebuilt = buildP2CoarseExperimentPlan(bindings);
        checks.artifactMatchesRebuild =
          canonicalSha256(stored) === canonicalSha256(rebuilt);
        runnable = rebuilt.importGate.runnable;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!checks.sourceBindingsValid) {
      errors.push("The stored source bindings are invalid.");
    }
    if (!checks.artifactMatchesRebuild) {
      errors.push("The stored plan differs from its deterministic rebuild.");
    }
  }

  const status: P2CoarseExperimentPlanReplay["status"] = Object.values(
    checks,
  ).every(Boolean)
    ? "passed"
    : "failed";
  const withoutReplayDigest = {
    status,
    checks,
    runnable,
    errors: [...new Set(errors)],
  };
  return {
    ...withoutReplayDigest,
    replayDigest: canonicalSha256(withoutReplayDigest),
  };
}

export function computeP2CoarseExperimentPlanDigest(
  plan: P2CoarseExperimentPlan,
): string {
  return canonicalSha256(withoutDigest(plan));
}
