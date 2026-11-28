import { describe, expect, it } from "vitest";

import p0Input from "../src/examples/compact_5_prism_makarov.json";
import { parseCoxeterSystemInput } from "../src/coxeter";
import { replayCompactResearchPortfolio } from "../src/fibering/compactResearchPortfolio";
import {
  buildCompactResearchPortfolioFromJob,
  COMPACT_RESEARCH_PORTFOLIO_DEFAULT_MAX_INPUT_BYTES,
  COMPACT_RESEARCH_PORTFOLIO_DEFAULT_OUTPUT,
  parseCompactResearchPortfolioArguments,
  parseCompactResearchPortfolioJobManifest,
  type CompactResearchPortfolioJobManifest,
} from "../src/fibering/compactResearchPortfolioCli";
import { torsionFreeActionFingerprint } from "../src/torsionFree";

const MISMATCHED_SYSTEM = {
  schemaVersion: 1,
  name: "mismatched job fixture",
  rank: 1,
  generators: [{ id: "s0", label: "s0" }],
  coxeterMatrix: [[1]],
  dataStatus: "toy",
} as const;

function uncheckedDirectJob(
  targetId: string,
  system: unknown,
  degree = 1,
): CompactResearchPortfolioJobManifest {
  const rank =
    typeof system === "object" && system !== null && "rank" in system
      ? Number(system.rank)
      : 0;
  return {
    schemaVersion: 1,
    kind: "compact-h5-research-portfolio-job",
    proofRuns: [
      {
        targetId,
        actionId: "preflight-fixture",
        branch: "direct-rank-one",
        input: {
          system,
          accepted: {
            candidate: {
              id: "preflight-action",
              index: degree,
              generatorImages: Array.from({ length: rank }, () =>
                Array.from({ length: degree }, (_, point) => point),
              ),
            },
            certificate: {},
          },
          source: { id: "preflight-source", wallSigns: {} },
        },
      },
    ],
  } as unknown as CompactResearchPortfolioJobManifest;
}

describe("compact research portfolio runner", () => {
  it("parses bounded name/value arguments", () => {
    expect(parseCompactResearchPortfolioArguments([])).toEqual({
      output: COMPACT_RESEARCH_PORTFOLIO_DEFAULT_OUTPUT,
      verifyOnly: false,
      maxInputBytes: COMPACT_RESEARCH_PORTFOLIO_DEFAULT_MAX_INPUT_BYTES,
    });
    expect(
      parseCompactResearchPortfolioArguments([
        "--",
        "--output",
        "result.json",
        "--job",
        "job.json",
        "--verify-only",
        "true",
        "--max-input-bytes",
        "4096",
      ]),
    ).toEqual({
      output: "result.json",
      job: "job.json",
      verifyOnly: true,
      maxInputBytes: 4096,
    });
    expect(
      parseCompactResearchPortfolioArguments([
        "--verify-only",
        "true",
        "--",
        "--output",
        "result.json",
      ]),
    ).toMatchObject({ output: "result.json", verifyOnly: true });
    expect(() =>
      parseCompactResearchPortfolioArguments(["--unknown", "x"]),
    ).toThrow(/Unknown argument/iu);
    expect(() =>
      parseCompactResearchPortfolioArguments(["--verify-only", "yes"]),
    ).toThrow(/true or false/iu);
  });

  it("accepts only the callback-free job envelope", () => {
    expect(
      parseCompactResearchPortfolioJobManifest({
        schemaVersion: 1,
        kind: "compact-h5-research-portfolio-job",
        proofRuns: [],
      }),
    ).toEqual({
      schemaVersion: 1,
      kind: "compact-h5-research-portfolio-job",
      proofRuns: [],
    });
    expect(() =>
      parseCompactResearchPortfolioJobManifest({
        schemaVersion: 1,
        kind: "compact-h5-research-portfolio-job",
        proofRuns: [],
        callbacks: ["not allowed"],
      }),
    ).toThrow(/unsupported keys/iu);
    expect(() =>
      parseCompactResearchPortfolioJobManifest({
        schemaVersion: 1,
        kind: "compact-h5-research-portfolio-job",
        proofRuns: [
          {
            targetId: "not-a-registered-target",
            actionId: "unknown-target",
            branch: "direct-rank-one",
            input: {},
          },
        ],
      }),
    ).toThrow(/unknown compact research target/iu);
  });

  it("rejects cheap job mismatches before invoking a proof engine", () => {
    const jobs = [
      {
        job: uncheckedDirectJob("not-a-registered-target", MISMATCHED_SYSTEM),
        error: /unknown compact research target/iu,
      },
      {
        job: uncheckedDirectJob("makarov-p2", p0Input),
        error: /not active for finite-action proof jobs/iu,
      },
      {
        job: uncheckedDirectJob("makarov-p0", MISMATCHED_SYSTEM),
        error: /does not use makarov-p0's canonical system/iu,
      },
      {
        job: uncheckedDirectJob("makarov-p0", p0Input, 1),
        error: /outside the active capacity-audited tiers/iu,
      },
    ];

    for (const { job, error } of jobs) {
      let proofEngineCalls = 0;
      expect(() =>
        buildCompactResearchPortfolioFromJob(job, {
          buildProofBranch: () => {
            proofEngineCalls += 1;
            throw new Error("The proof engine must not run.");
          },
        }),
      ).toThrow(error);
      expect(proofEngineCalls).toBe(0);
    }
  });

  it("rejects inconsistent grouped action bindings before proof construction", () => {
    const system = parseCoxeterSystemInput(p0Input);
    const degree = 28_800;
    const generatorImages = Array.from({ length: system.rank }, () =>
      Array.from({ length: degree }, (_, point) => point),
    );
    const runs = ["first-action", "second-action"].map((id) => {
      const candidate = { id, index: degree, generatorImages };
      return {
        targetId: "makarov-p0",
        actionId: "same-portfolio-action",
        branch: "direct-rank-one",
        input: {
          system,
          accepted: {
            candidate,
            certificate: {
              status: "passed",
              method: "tits-spherical-special-subgroup-action",
              candidateId: id,
              candidateIndex: degree,
              actionFingerprint: torsionFreeActionFingerprint(
                system,
                candidate,
              ),
            },
          },
          source: { id: `${id}-source`, wallSigns: {} },
        },
      };
    });
    const job = {
      schemaVersion: 1,
      kind: "compact-h5-research-portfolio-job",
      proofRuns: runs,
    } as unknown as CompactResearchPortfolioJobManifest;
    let proofEngineCalls = 0;

    expect(() =>
      buildCompactResearchPortfolioFromJob(job, {
        buildProofBranch: () => {
          proofEngineCalls += 1;
          throw new Error("The proof engine must not run.");
        },
      }),
    ).toThrow(/mixes inconsistent finite-action bindings/iu);
    expect(proofEngineCalls).toBe(0);
  });

  it("builds and replays the registry plus P2 manifest", () => {
    const stored = buildCompactResearchPortfolioFromJob({
      schemaVersion: 1,
      kind: "compact-h5-research-portfolio-job",
      proofRuns: [],
    });

    expect(replayCompactResearchPortfolio(stored).status).toBe("passed");
    expect(stored.targets.every(({ actions }) => actions.length === 0)).toBe(
      true,
    );
    expect(stored.p2Plan.status).toBe("bundled-fixed-character-screened");
    expect(stored.p2Plan.conclusions).toMatchObject({
      importedDataValidated: true,
      positiveIntegralH1Gate: true,
      nonzeroIntegralCharacterExists: true,
      primitiveIntegralCharacterExists: true,
      explicitPrimitiveCharacterMaterialized: true,
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
      positiveTrackBCertificate: false,
      directCocycleTrackAOpen: true,
      conditionalMorseSearchComplete: false,
    });
  });

  it("binds P2 imports without promoting validation to topology claims", () => {
    const stored = buildCompactResearchPortfolioFromJob(
      parseCompactResearchPortfolioJobManifest({
        schemaVersion: 1,
        kind: "compact-h5-research-portfolio-job",
        proofRuns: [],
        p2SourceBindings: [
          {
            role: "p2-coxeter-input",
            locator: "public/examples/compact_5_prism_makarov_p2.json",
            bytesSha256: "1".repeat(64),
            format: "coxeter-system-json",
          },
        ],
      }),
    );

    expect(stored.p2Plan.sourceBindings).toHaveLength(1);
    expect(stored.p2Plan.importGate.runnable).toBe(false);
    expect(stored.p2Plan.conclusions).toEqual({
      importedDataValidated: false,
      positiveIntegralH1Gate: false,
      nonzeroIntegralCharacterExists: false,
      primitiveIntegralCharacterExists: false,
      registeredPrimitiveClassCount: 0,
      qIndependentPrimitiveClassCount: 0,
      secondPrimitiveClassCheapScreenCompleted: false,
      secondPrimitiveClassObstructedForRecordedModel: false,
      secondPrimitiveClassGlobalTrackBOpen: false,
      section5ColoredB1Known: false,
      explicitPrimitiveCharacterMaterialized: false,
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
      type6R2ProductScreenCompleted: false,
      type6R2QuickGateSurvivorCount: 0,
      type6R2ProductSurvivorCount: 0,
      type6R2MaximalType5ScreenCompleted: false,
      type6R2ProductObstructed: false,
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
    expect(replayCompactResearchPortfolio(stored).status).toBe("passed");
  });
});
