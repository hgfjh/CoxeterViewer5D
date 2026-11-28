import { describe, expect, it } from "vitest";

import {
  buildP2CoarseExperimentPlan,
  computeP2CoarseExperimentPlanDigest,
  replayP2CoarseExperimentPlan,
  type P2CoarseSourceBinding,
} from "../src/fibering/p2CoarseExperiment";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const bindings: P2CoarseSourceBinding[] = [
  {
    role: "paper-v2",
    locator: "imports/arxiv-2502.19225v2.tar",
    bytesSha256: "1".repeat(64),
    format: "arxiv-source-archive",
  },
  {
    role: "p2-coxeter-input",
    locator: "public/examples/compact_5_prism_makarov_p2.json",
    bytesSha256: "2".repeat(64),
    format: "coxeter-system-json",
  },
  {
    role: "section-5-coarse-incidence",
    locator: "imports/p2-section-5-incidence.json",
    bytesSha256: "3".repeat(64),
    format: "p2-section-5-coarse-incidence",
  },
  {
    role: "section-5-coloring-data",
    locator: "imports/p2-section-5-coloring.json",
    bytesSha256: "4".repeat(64),
    format: "p2-section-5-coloring-data",
  },
];

describe("P2 coarse coloring experiment planner", () => {
  it("replays the bundled primitive character across both tracks", () => {
    const plan = buildP2CoarseExperimentPlan();

    expect(plan.status).toBe("bundled-fixed-character-screened");
    expect(plan.importGate).toMatchObject({
      runnable: true,
      allRequiredExactSourcesBound: true,
      missingRoles: [],
    });
    expect(plan.importCertificate).toMatchObject({
      bytesSha256:
        "a9a3e8f37e0af5fd10a5b11d1d15bdae4d5ab0209ba04675afb57deb6acd74af",
      certificateSha256:
        "96b055aee2b60e185269384d28cd47453bab91490f3f2789206a87981b2a97e8",
      sealValid: true,
      sourceBindingsMatch: true,
      allFiniteFieldAndColoringChecksPassed: true,
      replayStatus: "passed-bundled-certificate",
    });
    expect(plan.integralH1Gate).toMatchObject({
      status: "passed-positive",
      baseFourManifoldIntegralH1: "source-reported-Z^144",
      closedFiveManifoldFreeRankLowerBound: 144,
      nonzeroIntegralCharacterExists: true,
      primitiveIntegralCharacterExists: true,
      fullIntegralH1: "not-computed",
      explicitPrimitiveCharacterMaterialized: true,
      fullCharacterLatticeMaterialized: false,
      independentH1Replay: "not-completed-resource-and-tooling-limit",
    });
    expect(plan.conclusions).toEqual({
      importedDataValidated: true,
      positiveIntegralH1Gate: true,
      nonzeroIntegralCharacterExists: true,
      primitiveIntegralCharacterExists: true,
      section5ColoredB1Known: false,
      explicitPrimitiveCharacterMaterialized: true,
      registeredPrimitiveClassCount: 2,
      qIndependentPrimitiveClassCount: 2,
      secondPrimitiveClassCheapScreenCompleted: true,
      secondPrimitiveClassObstructedForRecordedModel: true,
      secondPrimitiveClassGlobalTrackBOpen: true,
      fullCharacterLatticeMaterialized: false,
      trackBRunnable: true,
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
      facetSpecificOrientationCoverConstructed: true,
      oddPrimeOrientationCoverConstructed: true,
      orientationCoverGlobalLawfulCalculationRun: false,
      globalWallLawfulCalculationRun: false,
      type6TrackBAnchorRunCompleted: true,
      type6TrackBAnchorSurvived: true,
      type6TrackBGlobalScanRun: false,
      type6BarycentricReductionRunCompleted: true,
      type6RawDominantTypeOnlyObstructed: true,
      type6FourierFrameAttemptRecorded: true,
      type6FourierFrameScanCompleted: false,
      type6LqSchreierTableCertified: true,
      type6OriginalChamberScreenCompleted: true,
      type6OriginalChamberSurvivorCount: 112,
      type6MaximalType5GlobalAttemptRecorded: true,
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
      wallFlipCegarScopedAnsatzObstructed: true,
      sheetResolvedComponentFormulasCertified: true,
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
      algebraicFiberingCertified: false,
      smoothFiberingCertified: false,
    });
    expect(plan.fixedCharacterEvidence).toMatchObject({
      primitiveCocycle: {
        certificateSha256:
          "aeb2591986d77a5d60e595920eaf1af5e9bfca805314ed6c0acccef13e03acd7",
        sealValid: true,
        importBindingMatches: true,
        exactTriangleClosure: true,
        primitiveCycleWitnessReplayed: true,
      },
      primitiveCocycleScreeningPortfolio: {
        bytesSha256:
          "a05575eef5fd6f2cfb57719e9704cacb5a91571d145a84a4d660dc2668e2e2f8",
        artifactSha256:
          "f50a61abe654c8a08f65d0004929a55c9b477a0caacb2cd20b9014e6eea3f804",
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
        artifactSha256:
          "7bbf2806f85f39b9e91e3e666eef7b972ca4e7fa7d1a73113ea1a231c6357ea0",
        sealValid: true,
        primitiveCocycleBindingMatches: true,
        status: "fixed-model-obstructed-at-anchor",
        rootedStateUnionCount: 48_549,
        bothTiePolaritiesRejectedAtIdentity: true,
        globalAllVertexScanNeededForRecordedModel: false,
      },
      coarseTrackB: {
        bytesSha256:
          "d2fe3c1ae284d266a3bc9903d258d7aa049bb39ec0df8d3f2461b56ab04fc649",
        certificateSha256:
          "ee447ec91aed2ac4d84d68e35386942043c6ed3fb450b1ec55d35adb83c2526a",
        sealValid: true,
        primitiveCocycleBindingMatches: true,
        status: "fixed-model-obstructed-at-root",
        bothCanonicalPerturbationPolaritiesRejectedAtRoot: true,
        coloredRootCopiesCovered: 256,
        globalAllVertexScanCompleted: false,
      },
      strictWallTrackA: {
        bytesSha256:
          "c949602a83a0848b4913fa0430d0c6e6d05c4d232b3b664daa5df28def83eed5",
        certificateSha256:
          "bf7818d52afcf65e9d34080cfb7260ae3088e091a21b1bbf40a86b86000f938a",
        sealValid: true,
        primitiveCocycleBindingMatches: true,
        wallCompatibilityBindingMatches: true,
        status: "explicit-character-obstructed-other-variants-incomplete",
        strictWallTrackAInputIncomplete: true,
        directCocycleTrackANotRun: true,
        finiteHeightBandNotRun: true,
        missingRequiredObjectCount: 3,
        formerTrackBRootObstructionRepairedByLocalPotential: true,
        globalDirectedLinksChecked: false,
      },
      wallCompatibility: {
        bytesSha256:
          "970761eabe64396fed9b618c46fd15131f73e0897ea209d325c41668de9d8366",
        artifactSha256:
          "f8c0bbbaec0f2896239c362c44801e9c985bfd8bfed0ceea849253ca1164f423",
        sealValid: true,
        primitiveCocycleBindingMatches: true,
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
        bytesSha256:
          "6db74185b74dfae335837d7957fa0388279c0b1bb8319520ab2db901f268e1af",
        artifactSha256:
          "1adb8e9449e0b2cba37aa4d502877f07b7961092e8cec51e6b6369d20f1f5bfe",
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
        bytesSha256:
          "ac94a123c2987c69f8378028fed829c3f6c378c1039a7acf6b49733cec37c4bc",
        artifactSha256:
          "5445d8a09e27c15cc16e52abb27d80649a1ab4f00f9f204d0f92b601fd995c42",
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
        bytesSha256:
          "c862f1c6e18cde9bd263a32d5aac237f23244b4b31e56b95e0792f2d589161eb",
        artifactSha256:
          "0e7c158f6e5d5a1c25452152319adca6a7330acd95b8cfeb979f29c0ad83515d",
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
        bytesSha256:
          "864f8b39407b45a6d101e139e9a8f8e5511fadbba1b26dcb5f42c741b28a227b",
        artifactSha256:
          "501125fa7150a4d0c208cd4b40cd6a5132f7e04424820e71fd5f3219b165a16d",
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
        bytesSha256:
          "0ae39c0aada47faccf7de49326ff6006687624245bc05cce7f8fee014acb6c15",
        artifactSha256:
          "2aecf892261082a4ade2db0b23f2a66a50be5c6fa27296e3138c02f41400d6ac",
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
        bytesSha256:
          "664201d66b55607e479e90b0531677934364b6006e6fa12d26337eae62a0a9e2",
        artifactSha256:
          "adc2ec577553cf28b2ff47f63519bce92c901c8103c713689d8785b213ccc651",
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
        bytesSha256:
          "5f9056b711d3be7fff2d5a71fb43d8ac725f88ec50a33ae81054ac7943e2908f",
        artifactSha256:
          "40fe34044f718a50908318098309590697d4acdef10a4e47bdcc1c804fb81d97",
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
        bytesSha256:
          "fad654adf97785be0a63010eea9d28306b8d1c4d3184797ffdd7644e110ddd5e",
        artifactSha256:
          "482b93bd67c6ddfd040447f1307ac55c491ec98009d3911058d1ff6a2a99fea7",
        sealValid: true,
        status: "chamber-root-survivor-frontier",
        lqSchreierBindingMatches: true,
        type6CharacterBindingMatches: true,
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
        bytesSha256:
          "574c563dc271c98b9d0554fc81da58b30120b8d8658ca9c8ac9462f9e7adead9",
        artifactSha256:
          "9d0e5d475e12f88fc3a35735ac7e55da327272ece4a1e997e5af53514c1dc752",
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
        bytesSha256:
          "a86f92cce2dde32f5c3db42c069ec73533491080e6ae0ef32b4d1d056dedf531",
        artifactSha256:
          "d3a45ffaca348ac8285387a71f15cbb4f2616516e12a03975c8a83c4e8388886",
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
        survivorCandidateIndices: [
          19, 21, 22, 25, 26, 28, 35, 37, 38, 41, 42, 44, 83, 85, 86, 89, 90,
          92, 99, 101, 102, 105, 106, 108,
        ],
        compiledFailureWitnessesReplayedInPython: 2,
        nonmaximalBarycentricLinksOpen: true,
        globalTrackBCertified: false,
      },
      type6ConeApex: {
        bytesSha256:
          "5609235517ac0c7d2aacf477143da37f12ac0aa92ceb030e9e6c972c21810c9e",
        artifactSha256:
          "ae1421401348e90b977f96760bb268c48d92fda22eb96fa80bcdc7d1bedfd252",
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
        bytesSha256:
          "fe2f501ef0321e65e9833582f19a644f70043e20c75f29596c7b6a812d650307",
        artifactSha256:
          "95d83a53c83009ac148af9b7b878baa2a46316d74f0d1742401ab46caafe3107",
        sealValid: true,
        status:
          "exact-global-equivalence-for-central-types-avoiding-generator6",
        maximalType5FrontierBindingMatches: true,
        type6CharacterBindingMatches: true,
        sourceSurvivorCount: 24,
        equivalenceClassCount: 6,
        representativeCandidateIndices: [19, 21, 22, 25, 26, 28],
        unresolvedCentralTypeCount: 56,
        representativeOnlyGlobalScanExact: true,
      },
      type6FullStarCompiled: {
        bytesSha256:
          "ea9151f203484d4251439087066aed2695f591b9d68bce387c71de54e5b0e6b0",
        artifactSha256:
          "f776505a5c9d0ec92e002a0c5108ba0998c21982192d66d853f5366076e93d02",
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
        bytesSha256:
          "a3e234a295d2382b28180628ee19b9bdb7c3efe80994875a5bf7c0743f975b1c",
        artifactSha256:
          "7b535ff40e6ad1ff7e09a0df7109995242af38f190d401cc324e0c3e4e8f7630",
        sealValid: true,
        status: "bounded-r2-all128-quick-gates-40-open",
        sourceBindingsMatch: true,
        fullFiberRootIndependent: true,
        faceCompatible: true,
        primitiveIntegralCharacterUnchanged: true,
        coefficientSet: [-1, 0, 1],
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
        bytesSha256:
          "3de7e3bf46e4f705ea95cdac16c5ecd29ba30a1deb4b90e92d2df9c4a21fd4b0",
        artifactSha256:
          "774468b8b6cc397651260e3151953d402766276503831e87b380f22dbcb3bcee",
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
        bytesSha256:
          "f12283df3d177c655e131042997751c5146bf99c7cdcfba1fe91a70457cf36bb",
        artifactSha256:
          "8ef7d0c905483500cfcf3c79c2519bc7cccb2a90c1b21d09c9c0e102379e2899",
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
        bytesSha256:
          "8a688b6220653a27ec53bf967fda3a38164d71ae8b5925f2eeb41a210aa13878",
        artifactSha256:
          "a7117f6da599d0ebb67c70872bf7001438fb57b3462d966458ec7cea539a4861",
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
        bytesSha256:
          "acc3daceda47fee678be7b54d0c7a24196ff77690428170a20f18383cd445c89",
        artifactSha256:
          "e3e70174ff74f6cf50d20b66e90dc35f5b198bd918f1ab68a0c58b641215000e",
        unrestrictedDepth2BytesSha256:
          "e8bb23073c5c459ab3ed0c0c0c47178245d3f7d7e8eeed694dfbe3e429721e82",
        unrestrictedDepth2ArtifactSha256:
          "5b0c98e68841c9676c2d4011ac8f22b3672b719d81653c2b3f3d8d0886b4a205",
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
        bytesSha256:
          "dfb5f94d1a904f6fcf44d8a709983f0130977c4e233b575433eb1a6e9118cc40",
        artifactSha256:
          "8165d031be54156e53195d416bdbbec2ea0bc814287fb968332cf2b96a756bf5",
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
        bytesSha256:
          "734453ef00e7ec3c24913d9b7fc91c9a1d9436398bd7a29ff17b34ef74b54c5b",
        artifactSha256:
          "b665e1342db0df98d34497a908d7e9b1e04948cc7d2f580355d661c1dc719b11",
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
    });
    expect(plan.stages[0].state).toBe("blocked");
    expect(
      plan.stages.slice(1, 3).every(({ state }) => state === "completed"),
    ).toBe(true);
    expect(plan.stages[3].state).toBe("blocked");
    expect(plan.stages[4].state).toBe("completed");
    expect(plan.stages[5].state).toBe("blocked");
    expect(replayP2CoarseExperimentPlan(plan)).toMatchObject({
      status: "passed",
      runnable: true,
    });
  });

  it("records the paper facts while blocking an explicitly empty source set", () => {
    const plan = buildP2CoarseExperimentPlan([]);

    expect(plan.status).toBe("blocked-missing-imports");
    expect(plan.importGate).toMatchObject({
      runnable: false,
      allRequiredExactSourcesBound: false,
      missingRoles: [
        "paper-v2",
        "p2-coxeter-input",
        "section-5-coarse-incidence",
        "section-5-coloring-data",
      ],
    });
    expect(plan.paperSupportedFacts).toMatchObject({
      p2PrismsPer120CellPrism: 14_400,
      publishedFamilies: { firstBettiNumber: 0 },
      alternativeSection5: {
        x120CellCount: 650,
        xIntegralH1: "Z^144",
        closedColoredFiveManifoldB1: "not-computed-in-paper",
      },
    });
    expect(plan.conclusions).toEqual({
      importedDataValidated: false,
      positiveIntegralH1Gate: false,
      nonzeroIntegralCharacterExists: false,
      primitiveIntegralCharacterExists: false,
      section5ColoredB1Known: false,
      explicitPrimitiveCharacterMaterialized: false,
      registeredPrimitiveClassCount: 0,
      qIndependentPrimitiveClassCount: 0,
      secondPrimitiveClassCheapScreenCompleted: false,
      secondPrimitiveClassObstructedForRecordedModel: false,
      secondPrimitiveClassGlobalTrackBOpen: false,
      fullCharacterLatticeMaterialized: false,
      trackBRunnable: false,
      fixedCharacterTrackBRunCompleted: false,
      fixedCharacterTrackBObstructedForRecordedModel: false,
      coarseFixedCharacterTrackBRunCompleted: false,
      coarseFixedCharacterTrackBObstructedForRecordedModel: false,
      strictWallTrackAInputIncomplete: true,
      currentCoverFullWallCoorientabilityKnown: false,
      currentCoverFullWallCoorientable: false,
      currentCoverStrictWallTrackABlocked: false,
      directCocycleTrackANotRun: true,
      finiteHeightBandNotRun: true,
      explicitPrimitiveCharacterWallTrackAObstructed: false,
      otherWallCharacterTrackAOpen: true,
      furtherCoverWallTrackAOpen: false,
      colorClassOnlyOrientationCoverOpen: true,
      facetSpecificOrientationCoverOpen: false,
      facetSpecificOrientationCoverConstructed: false,
      oddPrimeOrientationCoverConstructed: false,
      orientationCoverGlobalLawfulCalculationRun: false,
      globalWallLawfulCalculationRun: false,
      type6TrackBAnchorRunCompleted: false,
      type6TrackBAnchorSurvived: false,
      type6TrackBGlobalScanRun: false,
      type6BarycentricReductionRunCompleted: false,
      type6RawDominantTypeOnlyObstructed: false,
      type6FourierFrameAttemptRecorded: false,
      type6FourierFrameScanCompleted: false,
      type6LqSchreierTableCertified: false,
      type6OriginalChamberScreenCompleted: false,
      type6OriginalChamberSurvivorCount: 0,
      type6MaximalType5GlobalAttemptRecorded: false,
      type6MaximalType5GlobalScreenCompleted: false,
      type6MaximalType5SurvivorCount: 0,
      type6NonmaximalBarycentricLinksOpen: false,
      type6DeclaredHeightFamilyScreenCompleted: false,
      type6DeclaredHeightFamilyObstructed: false,
      type6DeclaredHeightFamilySurvivorCount: 0,
      type6R2QuickGateSurvivorCount: 0,
      type6R2MaximalType5ScreenCompleted: false,
      type6R2ProductScreenCompleted: false,
      type6R2ProductObstructed: false,
      type6R2ProductSurvivorCount: 0,
      type6OtherPeriodicCoordinatesOpen: true,
      wallFlipCegarScopedAnsatzObstructed: false,
      sheetResolvedComponentFormulasCertified: false,
      sheetResolvedRadius2SurvivorFrontier: false,
      sheetResolvedCompactRuleRejectedAtRadius2: false,
      sheetResolvedGlobalTrackAOpen: false,
      f9ExactImageOrderComputed: false,
      f9SubgroupImageDivisor: 0,
      f9RootLineCandidateRejected: false,
      f9ExactDegreeOpen: false,
      f9GlobalFlipSearchOpen: false,
      positiveTrackACertificate: false,
      positiveTrackBCertificate: false,
      directCocycleTrackAOpen: true,
      conditionalMorseSearchComplete: false,
      algebraicFiberingCertified: false,
      smoothFiberingCertified: false,
    });
    expect(replayP2CoarseExperimentPlan(plan)).toMatchObject({
      status: "passed",
      runnable: false,
    });
  });

  it("becomes runnable only for exact bindings and is order-independent", () => {
    const forward = buildP2CoarseExperimentPlan(bindings);
    const reverse = buildP2CoarseExperimentPlan([...bindings].reverse());

    expect(forward).toEqual(reverse);
    expect(forward.status).toBe("ready-for-exact-import-replay");
    expect(forward.importGate).toMatchObject({
      missingRoles: [],
      allRequiredExactSourcesBound: true,
      runnable: true,
      runnableScope: "exact-import-incidence-coloring-and-h1-gate",
    });
    expect(forward.stages.every(({ state }) => state === "planned")).toBe(true);
    expect(computeP2CoarseExperimentPlanDigest(forward)).toBe(
      forward.artifactDigest,
    );
    expect(replayP2CoarseExperimentPlan(forward)).toMatchObject({
      status: "passed",
      runnable: true,
      checks: {
        envelopeRecognized: true,
        artifactDigestValid: true,
        sourceBindingsValid: true,
        paperFactsMatch: true,
        artifactMatchesRebuild: true,
      },
    });
  });

  it("rejects malformed bindings and detects resealed factual changes", () => {
    expect(() =>
      buildP2CoarseExperimentPlan([
        { ...bindings[0], bytesSha256: "not-a-digest" },
      ]),
    ).toThrow(/requires a lowercase 64-digit SHA-256/u);
    expect(() =>
      buildP2CoarseExperimentPlan([bindings[0], bindings[0]]),
    ).toThrow(/Duplicate P2 coarse source role/u);

    const altered = structuredClone(buildP2CoarseExperimentPlan(bindings));
    Reflect.set(
      altered.paperSupportedFacts.alternativeSection5,
      "xIntegralH1FreeRank",
      145,
    );
    const payload = Object.fromEntries(
      Object.entries(altered).filter(([key]) => key !== "artifactDigest"),
    );
    altered.artifactDigest = canonicalSha256(payload);

    expect(replayP2CoarseExperimentPlan(altered)).toMatchObject({
      status: "failed",
      checks: {
        artifactDigestValid: true,
        paperFactsMatch: false,
        artifactMatchesRebuild: false,
      },
    });
  });
});
