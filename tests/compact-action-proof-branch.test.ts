import { describe, expect, it } from "vitest";

import {
  buildCompactActionProofBranch,
  computeCompactActionProofBranchDigest,
  prepareCompactDirectRankOneSource,
  replayCompactActionProofBranch,
  type CompactActionProofBranchCertificate,
  type CompactActionProofBranchInput,
} from "../src/fibering/compactActionProofBranch";
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
  sealScalableFullH1TrackBJsonInput,
  type ScalableFullH1TrackBJsonInput,
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
  name: "D_infinity x A1 proof-branch fixture",
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
  id: "d-infinity-times-a1-index-four-proof-branch",
  index: 4,
  generatorImages: [
    [1, 0, 3, 2],
    [1, 0, 3, 2],
    [2, 3, 0, 1],
  ],
};

const I2_INFINITY_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "I2(infinity) direct Track-B outcome fixture",
  rank: 2,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
  ],
  coxeterMatrix: [
    [1, "inf"],
    ["inf", 1],
  ],
  dataStatus: "toy",
};

const I2_INFINITY_ACTION: TorsionFreeActionCandidate = {
  id: "i2-infinity-degree-six-direct-track-b",
  index: 6,
  generatorImages: [
    [1, 0, 3, 2, 5, 4],
    [5, 2, 1, 4, 3, 0],
  ],
};

function accepted(): TorsionFreeCandidateResult {
  const certificate = certifyTorsionFreeAction(
    SYSTEM,
    ACTION,
    planSphericalSpecialSubgroups(SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  return { candidate: ACTION, certificate };
}

function i2DirectInput(
  mask: number,
  linkScan: "exhaustive" | "stop-on-first-failure" = "exhaustive",
): CompactActionProofBranchInput {
  const certificate = certifyTorsionFreeAction(
    I2_INFINITY_SYSTEM,
    I2_INFINITY_ACTION,
    planSphericalSpecialSubgroups(I2_INFINITY_SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  const oracle = buildStreamedLawfulDavisOracle({
    system: I2_INFINITY_SYSTEM,
    generatorImages: I2_INFINITY_ACTION.generatorImages,
  });
  return {
    branch: "direct-rank-one",
    system: I2_INFINITY_SYSTEM,
    accepted: { candidate: I2_INFINITY_ACTION, certificate },
    source: {
      id: `i2-mask-${mask}`,
      wallSigns: Object.fromEntries(
        oracle.walls.walls.map((wall, index) => [
          wall.id,
          (mask & (2 ** index) ? -1 : 1) as 1 | -1,
        ]),
      ),
    },
    trackB: { linkScan },
  };
}

function directInput(): CompactActionProofBranchInput {
  const acceptedAction = accepted();
  const oracle = buildStreamedLawfulDavisOracle({
    system: SYSTEM,
    generatorImages: ACTION.generatorImages,
  });
  const wallSigns = Object.fromEntries(
    oracle.walls.walls.map((wall) => [wall.id, 1 as 1 | -1]),
  );
  // The stabilizer contains the loop s0 s1 because the two permutations agree.
  // Opposite coorientations on those walls give that loop nonzero period.
  wallSigns[oracle.wallIdForEdge(0, 1)] = -1;
  return {
    branch: "direct-rank-one",
    system: SYSTEM,
    accepted: acceptedAction,
    source: {
      id: "opposite-s0-s1-wall-character",
      wallSigns,
    },
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

function scalableJsonInput(): ScalableFullH1TrackBJsonInput {
  const runtime = scalableInput();
  return sealScalableFullH1TrackBJsonInput({
    schemaVersion: 1,
    kind: "scalable-full-h1-track-b-json-input",
    system: SYSTEM,
    actionCandidate: ACTION,
    modularRankCertificate: runtime.modularRankCertificate,
    integralKernelWitness: runtime.integralKernelWitness,
    runCheapScreen: false,
    options: {},
  });
}

describe("compact-action proof-branch adapter", () => {
  it("certifies and replays a direct rank-one wall character", () => {
    const input = directInput();
    if (input.branch !== "direct-rank-one") throw new Error("Bad fixture.");
    const prepared = prepareCompactDirectRankOneSource(input);

    expect(prepared.certificate).toMatchObject({
      branch: "direct-rank-one",
      status: "passed",
      outcome: "direct-rank-one-finite-generation-certified",
      checks: {
        exactActionBound: true,
        proofSourceReplayed: true,
        proofSourcePassed: true,
      },
      direct: {
        cocycleSection: {
          status: "passed",
          checks: {
            directedEdgesAntisymmetric: true,
            everyRankTwoBoundaryClosed: true,
          },
        },
        schreierCharacter: {
          status: "passed",
          primitiveImage: true,
          checks: { normalizedImageIsZ: true },
        },
        checks: {
          positivePeriodGcd: true,
          normalizedBezoutIdentityVerified: true,
          allSourceChecksPassed: true,
        },
        generalizedCompression: { certificate: { status: "passed" } },
        trackB: {
          outcome: "finite-generation-certified",
          polarities: {
            "-1": { certificate: { status: "passed" } },
            "1": { certificate: { status: "passed" } },
          },
        },
      },
    });
    expect(prepared.cocycleBasis.coordinateIds).toHaveLength(1);
    const serialized = JSON.parse(
      JSON.stringify(prepared.certificate),
    ) as CompactActionProofBranchCertificate;
    expect(replayCompactActionProofBranch(input, serialized).status).toBe(
      "passed",
    );
  });

  it("rejects a resealed edit to direct Schreier provenance", () => {
    const input = directInput();
    const forged = structuredClone(
      buildCompactActionProofBranch(input),
    ) as CompactActionProofBranchCertificate;
    if (!forged.direct) throw new Error("Missing direct proof.");
    forged.direct.schreierCharacter.normalizationDivisor = 17;
    forged.certificateDigest = computeCompactActionProofBranchDigest(forged);

    expect(replayCompactActionProofBranch(input, forged)).toMatchObject({
      status: "failed",
      checks: {
        storedCertificateDigestValid: true,
        exactActionRootedRebuildMatches: false,
      },
    });
  });

  it("wraps and replays the proof-carrying scalable full-H1 Track-B branch", () => {
    const input: CompactActionProofBranchInput = {
      branch: "scalable-full-h1",
      options: { h1Input: scalableInput(), runCheapScreen: false },
    };
    const certificate = buildCompactActionProofBranch(input);

    expect(certificate).toMatchObject({
      branch: "scalable-full-h1",
      status: "passed",
      outcome: "virtual-algebraic-fibering-certified",
      scalableFullH1: {
        pipeline: {
          status: "passed",
          promotion: { status: "certified" },
        },
      },
      checks: {
        exactActionBound: true,
        proofSourceReplayed: true,
        proofSourcePassed: true,
      },
    });
    const serialized = JSON.parse(
      JSON.stringify(certificate),
    ) as CompactActionProofBranchCertificate;
    expect(replayCompactActionProofBranch(input, serialized).status).toBe(
      "passed",
    );
  });

  it("replays the callback-free JSON scalable branch without runtime callbacks", () => {
    const input: CompactActionProofBranchInput = {
      branch: "scalable-full-h1",
      jsonInput: JSON.parse(
        JSON.stringify(scalableJsonInput()),
      ) as ScalableFullH1TrackBJsonInput,
    };
    const certificate = buildCompactActionProofBranch(input);

    expect(certificate).toMatchObject({
      branch: "scalable-full-h1",
      status: "passed",
      scalableFullH1: {
        jsonAdapter: {
          status: "passed",
          checks: { noCallerCallbacksRequired: true },
        },
      },
    });
    const serialized = JSON.parse(
      JSON.stringify(certificate),
    ) as CompactActionProofBranchCertificate;
    expect(replayCompactActionProofBranch(input, serialized)).toMatchObject({
      status: "passed",
      checks: {
        nestedProofChecked: true,
        exactActionRootedRebuildMatches: true,
      },
    });
  });

  it("requires exactly one scalable proof input form", () => {
    const runtimeOptions = {
      h1Input: scalableInput(),
      runCheapScreen: false,
    };
    const jsonInput = scalableJsonInput();
    expect(() =>
      buildCompactActionProofBranch({
        branch: "scalable-full-h1",
        options: runtimeOptions,
        jsonInput,
      } as unknown as CompactActionProofBranchInput),
    ).toThrow(/exactly one/iu);
    expect(() =>
      buildCompactActionProofBranch({
        branch: "scalable-full-h1",
      } as CompactActionProofBranchInput),
    ).toThrow(/exactly one/iu);
  });

  it("diagnoses a fixed-character obstruction only after both exhaustive polarities", () => {
    const input = i2DirectInput(0);
    const certificate = buildCompactActionProofBranch(input);

    expect(certificate).toMatchObject({
      status: "not-found",
      outcome: "direct-rank-one-fixed-canonical-model-obstructed",
      direct: {
        checks: { allSourceChecksPassed: true },
        generalizedCompression: { certificate: { status: "passed" } },
        trackB: {
          requestedLinkScan: "exhaustive",
          passingPolarities: [],
          exhaustiveObstructedPolarities: [-1, 1],
          outcome: "fixed-canonical-model-obstructed",
          polarities: {
            "-1": {
              certificate: {
                conclusion: "morse-link-condition-failed",
                directedLinks: {
                  scanMode: "exhaustive",
                  checks: { everyQuotientVertexChecked: true },
                },
              },
            },
            "1": {
              certificate: {
                conclusion: "morse-link-condition-failed",
                directedLinks: {
                  scanMode: "exhaustive",
                  checks: { everyQuotientVertexChecked: true },
                },
              },
            },
          },
        },
      },
    });
    expect(replayCompactActionProofBranch(input, certificate).status).toBe(
      "passed",
    );
  });

  it("keeps a nonexhaustive two-polarity failure incomplete", () => {
    const input = i2DirectInput(0, "stop-on-first-failure");
    const certificate = buildCompactActionProofBranch(input);

    expect(certificate).toMatchObject({
      status: "incomplete",
      outcome: "direct-rank-one-track-b-not-established",
      direct: {
        checks: { allSourceChecksPassed: true },
        trackB: {
          requestedLinkScan: "stop-on-first-failure",
          passingPolarities: [],
          exhaustiveObstructedPolarities: [],
          outcome: "not-established",
        },
      },
    });
    expect(certificate.claims.join(" ")).not.toMatch(
      /both offset polarities exhaustively fail/iu,
    );
    expect(replayCompactActionProofBranch(input, certificate).status).toBe(
      "passed",
    );
  });
});
