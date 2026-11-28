import { describe, expect, it } from "vitest";

import {
  buildCompactActionProofBranch,
  computeCompactActionProofBranchDigest,
  type CompactActionProofBranchCertificate,
  type CompactActionProofBranchInput,
} from "../src/fibering/compactActionProofBranch";
import {
  buildCompactResearchPortfolio,
  computeCompactResearchPortfolioDigest,
  replayCompactResearchPortfolio,
  type CompactResearchPortfolioArtifact,
} from "../src/fibering/compactResearchPortfolio";
import { getCompactResearchTarget } from "../src/fibering/compactResearchTargets";
import { buildGenericActionH1Certificate } from "../src/fibering/genericActionH1";
import { computeGenericCompactExpensiveStageDigest } from "../src/fibering/genericCompactExpensiveStage";
import {
  buildGenericSparseModularRankWorkerRequest,
  certifyGenericSparseModularRank,
  type GenericSparseIntegerMatrix,
} from "../src/fibering/genericSparseModularRank";
import { prepareGenericStreamedH1 } from "../src/fibering/genericStreamedH1Preparation";
import { computeGeneralizedCompressionArchiveHash } from "../src/davis/generalizedCompression";
import { computeExactCheapScreenActionBindingDigest } from "../src/fibering/exactCompactActionCheapScreen";
import {
  scalableGenericActionH1SourceBindings,
  computeScalableGenericActionH1CertificateDigest,
  sealScalableGenericActionH1IntegralKernelWitness,
  type ScalableGenericActionH1BuildInput,
} from "../src/fibering/scalableGenericActionH1";
import { computeScalableFullH1TrackBPipelineDigest } from "../src/fibering/scalableFullH1TrackBPipeline";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import { computeStreamedTrackBArtifactHash } from "../src/fibering/streamedTrackB";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "D_infinity x A1 compact research manifest fixture",
  rank: 3,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
    { id: "s2", label: "s2" },
  ],
  coxeterMatrix: [
    [1, "inf", 2],
    ["inf", 1, 2],
    [2, 2, 1],
  ],
  dataStatus: "toy",
};

const ACTION: TorsionFreeActionCandidate = {
  id: "compact-research-manifest-index-four",
  index: 4,
  generatorImages: [
    [1, 0, 3, 2],
    [1, 0, 3, 2],
    [2, 3, 0, 1],
  ],
};

function withoutKey(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([entryKey]) => entryKey !== key),
  );
}

function accepted(): TorsionFreeCandidateResult {
  const certificate = certifyTorsionFreeAction(
    SYSTEM,
    ACTION,
    planSphericalSpecialSubgroups(SYSTEM),
  );
  if (certificate.status !== "passed") throw new Error("Bad action fixture.");
  return { candidate: ACTION, certificate };
}

function directInput(): CompactActionProofBranchInput {
  const oracle = buildStreamedLawfulDavisOracle({
    system: SYSTEM,
    generatorImages: ACTION.generatorImages,
  });
  const wallSigns = Object.fromEntries(
    oracle.walls.walls.map((wall) => [wall.id, 1 as 1 | -1]),
  );
  wallSigns[oracle.wallIdForEdge(0, 1)] = -1;
  return {
    branch: "direct-rank-one",
    system: SYSTEM,
    accepted: accepted(),
    source: { id: "manifest-direct-character", wallSigns },
  };
}

function materializedBoundary(
  preparation: ReturnType<typeof prepareGenericStreamedH1>,
): GenericSparseIntegerMatrix {
  const rows: GenericSparseIntegerMatrix["rows"] = [];
  preparation.forEachBoundaryRow((row) => {
    rows.push({ row: row.row, entries: row.entries });
  });
  return {
    schemaVersion: 1,
    rowCount: preparation.certificate.boundary.rowCount,
    columnCount: preparation.certificate.boundary.columnCount,
    rows,
  };
}

function scalableInput(): ScalableGenericActionH1BuildInput {
  const acceptedAction = accepted();
  const oracle = buildStreamedLawfulDavisOracle({
    system: SYSTEM,
    generatorImages: ACTION.generatorImages,
  });
  const preparation = prepareGenericStreamedH1(oracle);
  const modularRankCertificate = certifyGenericSparseModularRank(
    buildGenericSparseModularRankWorkerRequest({
      matrix: materializedBoundary(preparation),
      sourceBindings: scalableGenericActionH1SourceBindings(
        preparation,
        acceptedAction,
      ),
      modulusPrime: 65_521,
    }),
  );
  const dense = buildGenericActionH1Certificate(SYSTEM, acceptedAction);
  if (!dense.certificate.h1) throw new Error("The fixture has no H1 basis.");
  return {
    oracle,
    accepted: acceptedAction,
    preparation,
    modularRankCertificate,
    integralKernelWitness: sealScalableGenericActionH1IntegralKernelWitness({
      preparation,
      modularRankCertificate,
      basis: dense.certificate.h1.basis,
      integralLeftInverseRows: dense.certificate.h1.leftInverseRows,
    }),
  };
}

/**
 * Portfolio replay is intentionally an envelope replay, so this fixture
 * replaces only target-binding hashes and reseals every affected envelope.
 * It is not presented as a mathematical P0 certificate.
 */
function bindCertificateToP0(
  source: CompactActionProofBranchCertificate,
  degree = 28_800,
): CompactActionProofBranchCertificate {
  const certificate = structuredClone(source);
  const targetDigest =
    getCompactResearchTarget("makarov-p0").canonicalSystemSha256;
  if (!targetDigest) throw new Error("P0 has no system digest.");
  certificate.source.systemCanonicalSha256 = targetDigest;
  certificate.source.degree = degree;
  if (certificate.direct) {
    certificate.direct.actionBinding.degree = degree;
    certificate.direct.actionBinding.bindingDigest =
      computeExactCheapScreenActionBindingDigest(
        certificate.direct.actionBinding,
      );
    certificate.direct.cocycleSection.source.degree = degree;
    certificate.direct.cocycleSection.checkedDirectedEdgeCount =
      degree * certificate.source.generatorCount;
    certificate.direct.cocycleSection.certificateDigest = canonicalSha256(
      withoutKey(certificate.direct.cocycleSection, "certificateDigest"),
    );
    const compression = certificate.direct.generalizedCompression;
    compression.certificate.source.systemCanonicalSha256 = targetDigest;
    compression.certificate.source.actionRowsCanonicalSha256 =
      certificate.source.actionRowsCanonicalSha256;
    compression.certificate.source.candidateId = certificate.source.candidateId;
    compression.certificate.source.degree = certificate.source.degree;
    compression.certificate.archiveHash =
      computeGeneralizedCompressionArchiveHash(compression.certificate);
    for (const polarity of ["-1", "1"] as const) {
      const entry = certificate.direct.trackB.polarities[polarity];
      entry.certificate.source.systemCanonicalSha256 = targetDigest;
      entry.certificate.source.generalizedCompressionArchiveHash =
        compression.certificate.archiveHash;
      entry.certificate.artifactHash = computeStreamedTrackBArtifactHash(
        entry.certificate,
      );
    }
    certificate.direct.trackB.trackBDigest = canonicalSha256(
      withoutKey(certificate.direct.trackB, "trackBDigest"),
    );
  }
  if (certificate.scalableFullH1) {
    const pipeline = certificate.scalableFullH1.pipeline;
    pipeline.source.systemCanonicalSha256 = targetDigest;
    pipeline.source.degree = degree;
    pipeline.h1.certificate.source.systemCanonicalSha256 = targetDigest;
    pipeline.h1.certificate.certificateDigest =
      computeScalableGenericActionH1CertificateDigest(pipeline.h1.certificate);
    if (pipeline.trackB) {
      pipeline.trackB.certificate.source.systemCanonicalSha256 = targetDigest;
      pipeline.trackB.certificate.source.degree = degree;
      pipeline.trackB.certificate.source.h1CertificateDigest =
        pipeline.h1.certificate.certificateDigest;
      pipeline.trackB.certificate.certificateDigest =
        computeGenericCompactExpensiveStageDigest(pipeline.trackB.certificate);
    }
    pipeline.certificateDigest =
      computeScalableFullH1TrackBPipelineDigest(pipeline);
  }
  certificate.certificateDigest =
    computeCompactActionProofBranchDigest(certificate);
  return certificate;
}

let cachedBranches: CompactActionProofBranchCertificate[] | undefined;

function proofBranches(): CompactActionProofBranchCertificate[] {
  if (!cachedBranches) {
    const direct = buildCompactActionProofBranch(directInput());
    const scalable = buildCompactActionProofBranch({
      branch: "scalable-full-h1",
      options: {
        h1Input: scalableInput(),
        runCheapScreen: false,
        expensiveStageBounds: { maxTemplates: 1 },
      },
    });
    cachedBranches = [
      bindCertificateToP0(direct),
      bindCertificateToP0(scalable),
    ];
  }
  return structuredClone(cachedBranches);
}

function resealOuterArtifact(artifact: CompactResearchPortfolioArtifact): void {
  const target = artifact.targets.find(
    ({ definition }) => definition.id === "makarov-p0",
  );
  if (!target) throw new Error("Missing P0 target.");
  const action = target.actions[0];
  const run = action.branches.directRankOne[0];
  run.runDigest = canonicalSha256(withoutKey(run, "runDigest"));
  action.actionEvidenceDigest = canonicalSha256(
    withoutKey(action, "actionEvidenceDigest"),
  );
  target.targetRecordDigest = canonicalSha256(
    withoutKey(target, "targetRecordDigest"),
  );
  artifact.artifactDigest = computeCompactResearchPortfolioDigest(artifact);
}

describe("compact research portfolio v2", () => {
  it("records all seven targets and the replayable P2 plan deterministically", () => {
    const first = buildCompactResearchPortfolio();
    const second = buildCompactResearchPortfolio();

    expect(first).toMatchObject({
      schemaVersion: 2,
      kind: "compact-h5-research-portfolio",
      status: "research-manifest-recorded",
      policy: {
        proofBranchesRunIndependently: true,
        directRankOneGatesScalableFullH1: false,
        scalableFullH1GatesDirectRankOne: false,
      },
      p2Plan: { kind: "p2-coarse-coloring-experiment-plan" },
    });
    expect(first.targets).toHaveLength(7);
    expect(first.artifactDigest).toBe(second.artifactDigest);
    expect(first.replayLimitations.join(" ")).toMatch(
      /exactly rebuilds callback-free scalable branches/iu,
    );
    expect(replayCompactResearchPortfolio(first).status).toBe("passed");
  });

  it("records direct and scalable runs independently on one action", () => {
    const artifact = buildCompactResearchPortfolio({
      actions: [
        {
          targetId: "makarov-p0",
          actionId: "two-independent-proof-runs",
          proofBranches: proofBranches(),
        },
      ],
    });
    const action = artifact.targets[0].actions[0];

    expect(action.registeredDegreeTier).toBe(true);
    expect(action.branches.directRankOne).toHaveLength(1);
    expect(action.branches.scalableFullH1).toHaveLength(1);
    expect(action.summary).toMatchObject({
      directRankOneRunCount: 1,
      directRankOneFiberingCertificateCount: 1,
      scalableFullH1RunCount: 1,
      scalableFullH1PassedCount: 0,
    });
    expect(action.branches.scalableFullH1[0].status).toBe("incomplete");
    expect(replayCompactResearchPortfolio(artifact).status).toBe("passed");
  });

  it("rejects a stale nested Track-B digest even when outer hashes are resealed", () => {
    const artifact = structuredClone(
      buildCompactResearchPortfolio({
        actions: [
          {
            targetId: "makarov-p0",
            actionId: "tamper-target",
            proofBranches: proofBranches(),
          },
        ],
      }),
    );
    const run = artifact.targets[0].actions[0].branches.directRankOne[0];
    if (!run.certificate.direct) throw new Error("Missing direct run.");
    run.certificate.direct.trackB.polarities["1"].certificate.artifactHash =
      "0".repeat(64);
    resealOuterArtifact(artifact);

    expect(replayCompactResearchPortfolio(artifact)).toMatchObject({
      status: "failed",
      checks: {
        artifactDigestValid: true,
        branchCertificateDigestsValid: false,
      },
    });
  });

  it("keeps deferred and coarse campaigns closed to action evidence", () => {
    const direct = proofBranches()[0];
    expect(() =>
      buildCompactResearchPortfolio({
        actions: [
          {
            targetId: "tumarkin-g12221",
            actionId: "not-activated",
            proofBranches: [direct],
          },
        ],
      }),
    ).toThrow(/not registered for finite-action proof runs/iu);
  });

  it("rejects action evidence outside an active target's allowed degree tiers", () => {
    const offTier = bindCertificateToP0(
      buildCompactActionProofBranch(directInput()),
      28_801,
    );

    expect(() =>
      buildCompactResearchPortfolio({
        actions: [
          {
            targetId: "makarov-p0",
            actionId: "off-capacity-tier",
            proofBranches: [offTier],
          },
        ],
      }),
    ).toThrow(/degree 28801, outside the active capacity-audited tiers/iu);
  });
});
