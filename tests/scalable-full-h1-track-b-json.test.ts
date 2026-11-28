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
} from "../src/fibering/scalableGenericActionH1";
import {
  buildScalableFullH1TrackBJsonCertificate,
  computeScalableFullH1TrackBJsonCertificateDigest,
  computeScalableFullH1TrackBJsonInputDigest,
  replayScalableFullH1TrackBJsonCertificate,
  replayScalableFullH1TrackBJsonInput,
  sealScalableFullH1TrackBJsonInput,
  type ScalableFullH1TrackBJsonCertificate,
  type ScalableFullH1TrackBJsonInput,
  type ScalableFullH1TrackBJsonOptions,
} from "../src/fibering/scalableFullH1TrackBJson";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "D_infinity x A1 callback-free Track-B fixture",
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
  id: "d-infinity-times-a1-index-four-json",
  index: 4,
  generatorImages: [
    [1, 0, 3, 2],
    [1, 0, 3, 2],
    [2, 3, 0, 1],
  ],
};

function accepted(): TorsionFreeCandidateResult {
  const certificate = certifyTorsionFreeAction(
    SYSTEM,
    PASSING_ACTION,
    planSphericalSpecialSubgroups(SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  return { candidate: PASSING_ACTION, certificate };
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

function jsonInput(
  options: ScalableFullH1TrackBJsonOptions = {},
): ScalableFullH1TrackBJsonInput {
  const acceptedAction = accepted();
  const oracle = buildStreamedLawfulDavisOracle({
    system: SYSTEM,
    generatorImages: PASSING_ACTION.generatorImages,
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
  const integralKernelWitness =
    sealScalableGenericActionH1IntegralKernelWitness({
      preparation,
      modularRankCertificate,
      basis: denseH1.basis,
      integralLeftInverseRows: denseH1.leftInverseRows,
    });

  return sealScalableFullH1TrackBJsonInput({
    schemaVersion: 1,
    kind: "scalable-full-h1-track-b-json-input",
    system: SYSTEM,
    actionCandidate: PASSING_ACTION,
    modularRankCertificate,
    integralKernelWitness,
    runCheapScreen: false,
    options,
  });
}

describe("callback-free scalable full-H1 Track-B JSON adapter", () => {
  it("builds and replays the full pipeline after an exact JSON round trip", () => {
    const storedInput = JSON.parse(JSON.stringify(jsonInput())) as unknown;
    const inputReplay = replayScalableFullH1TrackBJsonInput(storedInput);
    expect(inputReplay).toMatchObject({
      status: "passed",
      checks: {
        exactJsonValue: true,
        inputDigestValid: true,
        torsionFreeActionIndependentlyCertified: true,
        oracleReconstructed: true,
        preparationReconstructed: true,
      },
    });

    const certificate = buildScalableFullH1TrackBJsonCertificate(storedInput);
    expect(certificate).toMatchObject({
      status: "passed",
      pipeline: {
        outcome: "virtual-algebraic-fibering-certified",
      },
      checks: {
        noCallerCallbacksRequired: true,
        allClaimedChecksPassed: true,
      },
    });

    const storedCertificate = JSON.parse(
      JSON.stringify(certificate),
    ) as unknown;
    expect(
      replayScalableFullH1TrackBJsonCertificate(storedCertificate),
    ).toMatchObject({
      status: "passed",
      checks: {
        storedCertificateDigestValid: true,
        embeddedInputReplayPassed: true,
        exactCallbackFreeRebuildMatches: true,
      },
    });
  });

  it("keeps supported JSON resource bounds exact and replayable", () => {
    const input = jsonInput({ expensiveStageBounds: { maxTemplates: 1 } });
    const certificate = buildScalableFullH1TrackBJsonCertificate(input);
    expect(certificate.pipeline).toMatchObject({
      status: "incomplete",
      outcome: "resource-bound-incomplete",
    });
    expect(replayScalableFullH1TrackBJsonCertificate(certificate).status).toBe(
      "passed",
    );
  });

  it("rejects a resealed input whose raw action cannot be certified", () => {
    const forged = structuredClone(jsonInput());
    forged.actionCandidate.generatorImages[0]![0] = 0;
    forged.inputDigest = computeScalableFullH1TrackBJsonInputDigest(forged);

    const replay = replayScalableFullH1TrackBJsonInput(forged);
    expect(replay.status).toBe("failed");
    expect(replay.checks.torsionFreeActionIndependentlyCertified).toBe(false);
    expect(() => buildScalableFullH1TrackBJsonCertificate(forged)).toThrow(
      /torsion-free certification failed/iu,
    );
  });

  it("detects a self-resealed stored result that differs from a raw-input rebuild", () => {
    const forged = structuredClone(
      buildScalableFullH1TrackBJsonCertificate(jsonInput()),
    ) as ScalableFullH1TrackBJsonCertificate;
    forged.nonClaims.push("forged replay-neutral prose");
    forged.certificateDigest =
      computeScalableFullH1TrackBJsonCertificateDigest(forged);

    const replay = replayScalableFullH1TrackBJsonCertificate(forged);
    expect(replay.checks.storedCertificateDigestValid).toBe(true);
    expect(replay.checks.exactCallbackFreeRebuildMatches).toBe(false);
    expect(replay.status).toBe("failed");
  });

  it("refuses non-JSON values before sealing", () => {
    const payload = {
      ...jsonInput(),
      inputDigest: undefined,
      options: { rankReplayBudgets: { callback: () => undefined } },
    };
    const { inputDigest: _digest, ...unsealed } = payload;
    void _digest;
    expect(() =>
      sealScalableFullH1TrackBJsonInput(
        unsealed as unknown as Parameters<
          typeof sealScalableFullH1TrackBJsonInput
        >[0],
      ),
    ).toThrow(/non-JSON value type function/iu);
  });
});
