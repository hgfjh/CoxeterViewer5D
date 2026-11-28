import { describe, expect, it } from "vitest";

import { buildGenericActionH1Certificate } from "../src/fibering/genericActionH1";
import {
  buildGenericSparseModularRankWorkerRequest,
  certifyGenericSparseModularRank,
  type GenericSparseIntegerMatrix,
} from "../src/fibering/genericSparseModularRank";
import { prepareGenericStreamedH1 } from "../src/fibering/genericStreamedH1Preparation";
import {
  scalableGenericActionH1SourceBindings,
  sealScalableGenericActionH1IntegralKernelWitness,
  type ScalableGenericActionH1BuildInput,
} from "../src/fibering/scalableGenericActionH1";
import {
  buildScalableFullH1TrackBPipeline,
  computeScalableFullH1TrackBPipelineDigest,
  replayScalableFullH1TrackBPipeline,
  type ScalableFullH1TrackBPipelineCertificate,
} from "../src/fibering/scalableFullH1TrackBPipeline";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";
import { parseScalableFullH1TrackBArguments } from "../src/fibering/scalableFullH1TrackBCli";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "D_infinity x A1 scalable Track-B fixture",
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

const PASSING_ACTION: TorsionFreeActionCandidate = {
  id: "d-infinity-times-a1-index-four",
  index: 4,
  generatorImages: [
    [1, 0, 3, 2],
    [1, 0, 3, 2],
    [2, 3, 0, 1],
  ],
};

const OBSTRUCTED_ONE_SIDED_ACTION: TorsionFreeActionCandidate = {
  id: "d-infinity-times-a1-alternative-index-four",
  index: 4,
  generatorImages: [
    [1, 0, 3, 2],
    [3, 2, 1, 0],
    [2, 3, 0, 1],
  ],
};

function accepted(
  candidate: TorsionFreeActionCandidate,
): TorsionFreeCandidateResult {
  const certificate = certifyTorsionFreeAction(
    SYSTEM,
    candidate,
    planSphericalSpecialSubgroups(SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
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

function scalableInput(
  candidate: TorsionFreeActionCandidate,
): ScalableGenericActionH1BuildInput {
  const acceptedAction = accepted(candidate);
  const oracle = buildStreamedLawfulDavisOracle({
    system: SYSTEM,
    generatorImages: candidate.generatorImages,
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
  const denseH1 = dense.certificate.h1;
  if (!denseH1) throw new Error("The fixture omitted its integral H1 basis.");
  return {
    oracle,
    accepted: acceptedAction,
    preparation,
    modularRankCertificate,
    integralKernelWitness: sealScalableGenericActionH1IntegralKernelWitness({
      preparation,
      modularRankCertificate,
      basis: denseH1.basis,
      integralLeftInverseRows: denseH1.leftInverseRows,
    }),
  };
}

describe("scalable full-H1 to Track B pipeline", () => {
  it("parses one-shot build and replay CLI contracts fail-closed", () => {
    expect(
      parseScalableFullH1TrackBArguments([
        "--example",
        "I2_5",
        "--action",
        "action.json",
        "--rank-certificate",
        "rank.json",
        "--kernel-witness",
        "witness.json",
        "--output",
        "result.json",
      ]),
    ).toMatchObject({
      example: "I2_5",
      action: "action.json",
      runCheapScreen: true,
    });
    expect(() =>
      parseScalableFullH1TrackBArguments([
        "--system",
        "system.json",
        "--example",
        "I2_5",
      ]),
    ).toThrow(/exactly one/iu);
  });

  it("promotes one concrete primitive full-H1 face after every full-K gate", () => {
    const h1Input = scalableInput(PASSING_ACTION);
    const options = { h1Input };
    const certificate = buildScalableFullH1TrackBPipeline(options);

    expect(certificate).toMatchObject({
      status: "passed",
      outcome: "virtual-algebraic-fibering-certified",
      h1: { certificate: { status: "passed", h1: { rank: 1 } } },
      cheapScreen: {
        logicalRole: "diagnostic-only-not-a-track-b-gate",
      },
      trackB: {
        certificate: {
          status: "completed",
          outcome: "exact-arrangement-complete",
          source: { h1Backend: "proof-carrying-scalable" },
          upstream: { h1Verification: "built-in-same-run" },
        },
      },
      promotion: {
        status: "certified",
        conclusion: "finite-generation-certified",
        sigma: -1,
        character: {
          primitiveCoordinates: ["1"],
          coordinateGcd: "1",
          primitiveEpimorphismToZ: true,
        },
        directedLinks: {
          checkedPointCount: 4,
          allAscendingNonempty: true,
          allDescendingNonempty: true,
          allAscendingConnected: true,
          allDescendingConnected: true,
        },
        checks: { allPromotionGatesPassed: true },
      },
    });
    expect(certificate.promotion.selectedFaceDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(certificate.promotion.directedLinks?.evaluationDigest).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(
      replayScalableFullH1TrackBPipeline(options, certificate).status,
    ).toBe("passed");
  });

  it("searches intrinsic H1 across a one-sided wall and records exact obstruction", () => {
    const h1Input = scalableInput(OBSTRUCTED_ONE_SIDED_ACTION);
    expect(h1Input.oracle.walls.twoSided).toBe(false);
    const certificate = buildScalableFullH1TrackBPipeline({
      h1Input,
      runCheapScreen: false,
    });

    expect(certificate).toMatchObject({
      status: "not-found",
      outcome: "fixed-track-b-model-obstructed",
      trackB: {
        certificate: {
          status: "completed",
          outcome: "exact-arrangement-complete",
          checks: { allClaimedChecksPassed: true },
          arrangement: {
            templateCount: 4,
            census: {
              passingFaceCountByPolarity: { "-1": 0, "1": 0 },
            },
          },
        },
      },
      promotion: {
        status: "not-established",
        conclusion: "morse-link-condition-failed",
        checks: {
          exactAllCharacterArrangementBuilt: true,
          primitiveNonzeroCharacterSelected: false,
          allPromotionGatesPassed: false,
        },
      },
    });
    expect(certificate.errors).toEqual([]);
  });

  it("keeps exact resource stops incomplete", () => {
    const certificate = buildScalableFullH1TrackBPipeline({
      h1Input: scalableInput(PASSING_ACTION),
      runCheapScreen: false,
      expensiveStageBounds: { maxTemplates: 1 },
    });
    expect(certificate.status).toBe("incomplete");
    expect(certificate.outcome).toBe("resource-bound-incomplete");
    expect(certificate.promotion.status).toBe("not-established");
    expect(certificate.nonClaims.join(" ")).toMatch(
      /resource-bound.*incomplete/i,
    );
  });

  it("rejects a self-resealed promotion forgery on replay", () => {
    const options = {
      h1Input: scalableInput(PASSING_ACTION),
      runCheapScreen: false,
    };
    const forged = structuredClone(
      buildScalableFullH1TrackBPipeline(options),
    ) as ScalableFullH1TrackBPipelineCertificate;
    if (!forged.promotion.character)
      throw new Error("Missing promotion fixture.");
    forged.promotion.character.primitiveCoordinates = ["-1"];
    const { promotionDigest: _oldPromotionDigest, ...promotionPayload } =
      forged.promotion;
    void _oldPromotionDigest;
    forged.promotion.promotionDigest = canonicalSha256(promotionPayload);
    forged.certificateDigest =
      computeScalableFullH1TrackBPipelineDigest(forged);

    const replay = replayScalableFullH1TrackBPipeline(options, forged);
    expect(replay.status).toBe("failed");
    expect(replay.checks.storedCertificateDigestValid).toBe(true);
    expect(replay.checks.exactActionRootedRebuildMatches).toBe(false);
  });
});
