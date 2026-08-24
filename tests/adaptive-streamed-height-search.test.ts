import { describe, expect, it } from "vitest";

import { runAdaptiveStreamedHeightSearch } from "../src/fibering/adaptiveStreamedHeightSearch";
import {
  sealExactConeOracleCertificate,
  type AsyncExactConeFeasibilityOracle,
} from "../src/fibering/scalableHeightCone";
import type {
  StreamedTrackBLinearLinkGerm,
  StreamedTrackBLinearLinkTemplate,
} from "../src/fibering/streamedTrackB";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SOURCE_HASH = canonicalSha256("adaptive-height-fixture");
const BASIS_DIGEST = canonicalSha256("adaptive-basis");
const SECTION_DIGEST = canonicalSha256("adaptive-section");
const TRANSCRIPT_DIGEST = canonicalSha256("adaptive-coordinate-oracle");

function germ(
  id: string,
  otherPoint: number,
  coefficient: number,
): StreamedTrackBLinearLinkGerm {
  return {
    id,
    otherPoint,
    pointDifference: otherPoint,
    supportCellId: `cell:${id}`,
    coefficientPairs: [[0, String(coefficient)]],
  };
}

function template(
  point: number,
  germs: StreamedTrackBLinearLinkGerm[],
): StreamedTrackBLinearLinkTemplate {
  const normalizedGerms = germs.map((entry) => ({
    ...entry,
    pointDifference: entry.otherPoint - point,
  }));
  const topologyDigest = canonicalSha256({ point, normalizedGerms });
  const withoutDigest = {
    point,
    maximalCellCount: normalizedGerms.length,
    germs: normalizedGerms,
    adjacencyIncluded: true,
    edges: [] as Array<[string, string]>,
    topologyDigest,
  };
  return {
    ...withoutDigest,
    adjacency: normalizedGerms.map(() => new Uint32Array()),
    templateDigest: canonicalSha256({
      schemaVersion: 1,
      method: "exact-integral-pulling-link-linear-template",
      sourceHash: SOURCE_HASH,
      ...withoutDigest,
    }),
  };
}

function coordinateOracle(): AsyncExactConeFeasibilityOracle {
  return {
    async solve(request) {
      const assignment = request.assignments[0];
      const equality = assignment?.sign === 0;
      return sealExactConeOracleCertificate({
        schemaVersion: 1,
        kind: "external-exact-height-cone-certificate",
        requestHash: request.requestHash,
        backend: {
          id: "adaptive-coordinate-oracle",
          version: "1",
          algorithm: "rank-one-sign-cone",
          transcriptSha256: TRANSCRIPT_DIGEST,
        },
        result: {
          kind: "feasible",
          equalityRank: equality ? 1 : 0,
          dimension: equality ? 0 : 1,
          primitiveWitness: equality
            ? null
            : [String(assignment?.sign === -1 ? -1 : 1)],
        },
        certificateHash: "",
      });
    },
  };
}

function source(templates: StreamedTrackBLinearLinkTemplate[]) {
  const byPoint = new Map(templates.map((entry) => [entry.point, entry]));
  const degree = templates.length;
  return {
    coordinateCount: 1,
    ambientPointCount: degree,
    sourceHash: SOURCE_HASH,
    latticeBasisDigest: BASIS_DIGEST,
    cocycleSectionDigest: SECTION_DIGEST,
    heightRuleDigest: canonicalSha256({
      method: "integral-character-plus-fixed-global-point-order-offset",
      offsetDenominator: 4 * degree,
      offsetPolarities: [-1, 1],
      clearedDifferenceFormula:
        "4*degree*dot(coefficientForm,weight)+sigma*pointDifference",
      antipodalEquivalence: "(weight,sigma)~(-weight,-sigma)",
    }),
    templateAt(point: number) {
      const found = byPoint.get(point);
      if (!found) throw new Error(`Missing adaptive template q${point}.`);
      return found;
    },
  };
}

describe("adaptive streamed height obstruction-point search", () => {
  it("adds the first point that separates a provisional witness", async () => {
    const result = await runAdaptiveStreamedHeightSearch({
      source: source([
        template(0, [germ("a", 1, 1), germ("b", 1, -1)]),
        template(1, [germ("c", 0, 1)]),
      ]),
      exactConeOracle: coordinateOracle(),
      sigma: 1,
      initialPointIds: [0],
    });

    expect(result).toMatchObject({
      status: "invariant-obstruction-cover",
      initialPointIds: [0],
      selectedPointIds: [0, 1],
      globalPassingWitness: null,
      iterations: [
        {
          testedPointIds: [0],
          exploration: {
            kind: "operational-first-survivor-hit",
            proofStatus: "operational-only-not-an-exhaustive-cover",
            oracleQueryCount: 1,
            immediateReplayPassed: true,
          },
          separator: { point: 1, failures: ["descending-empty"] },
        },
        {
          testedPointIds: [0, 1],
          exploration: {
            kind: "complete-obstruction-cover",
            replayPassed: true,
          },
          separator: null,
        },
      ],
      finalCover: {
        pruneLeafCount: 2,
        survivorLeafCount: 0,
        zeroCharacterLeafCount: 1,
      },
    });
  });

  it("records a witness only after it passes every quotient point", async () => {
    const result = await runAdaptiveStreamedHeightSearch({
      source: source([
        template(0, [germ("a", 1, 1), germ("b", 1, -1)]),
        template(1, [germ("c", 0, 1), germ("d", 0, -1)]),
      ]),
      exactConeOracle: coordinateOracle(),
      sigma: 1,
      initialPointIds: [0],
    });

    expect(result).toMatchObject({
      status: "global-passing-witness",
      selectedPointIds: [0],
      finalCover: null,
      iterations: [
        {
          exploration: {
            kind: "operational-first-survivor-hit",
            immediateReplayPassed: true,
          },
        },
      ],
      globalPassingWitness: {
        primitiveWitness: ["1"],
        checkedPointCount: 2,
      },
    });
  });

  it("keeps the separator when the iteration cap stops before the restart", async () => {
    const result = await runAdaptiveStreamedHeightSearch({
      source: source([
        template(0, [germ("a", 1, 1), germ("b", 1, -1)]),
        template(1, [germ("c", 0, 1)]),
      ]),
      exactConeOracle: coordinateOracle(),
      sigma: 1,
      initialPointIds: [0],
      maxIterations: 1,
    });

    expect(result).toMatchObject({
      status: "iteration-limit",
      initialPointIds: [0],
      // q1 was selected by the separator, but the cap prevented the next
      // exhaustive attempt. An early survivor is operational, not a cover.
      selectedPointIds: [0, 1],
      finalCover: null,
      globalPassingWitness: null,
      iterations: [
        {
          testedPointIds: [0],
          exploration: {
            kind: "operational-first-survivor-hit",
            proofStatus: "operational-only-not-an-exhaustive-cover",
            immediateReplayPassed: true,
          },
          separator: { point: 1, failures: ["descending-empty"] },
        },
      ],
    });
  });

  it("rejects a non-prefix batched witness scan", async () => {
    const templates = [
      template(0, [germ("a", 1, 1), germ("b", 1, -1)]),
      template(1, [germ("c", 0, 1)]),
    ];
    const badRecords: Array<[number, string, string]> = [
      [1, templates[1].templateDigest, canonicalSha256("bad-link")],
    ];
    await expect(
      runAdaptiveStreamedHeightSearch({
        source: {
          ...source(templates),
          scanPrimitiveWitness() {
            return {
              checkedPointCount: 1,
              everyPointPasses: false,
              pointResultRecords: badRecords,
              firstFailure: {
                point: 1,
                failures: ["descending-empty"],
                templateDigest: badRecords[0][1],
                linkDigest: badRecords[0][2],
              },
              pointResultDigest: canonicalSha256(badRecords),
            };
          },
        },
        exactConeOracle: coordinateOracle(),
        sigma: 1,
        initialPointIds: [0],
      }),
    ).rejects.toThrow("batched adaptive witness scan is inconsistent");
  });

  it("rejects a short failure-free scan mislabeled as nonpassing", async () => {
    const templates = [
      template(0, [germ("a", 1, 1), germ("b", 1, -1)]),
      template(1, [germ("c", 0, 1), germ("d", 0, -1)]),
    ];
    const shortRecords: Array<[number, string, string]> = [
      [0, templates[0].templateDigest, canonicalSha256("short-link")],
    ];
    await expect(
      runAdaptiveStreamedHeightSearch({
        source: {
          ...source(templates),
          scanPrimitiveWitness() {
            return {
              checkedPointCount: 1,
              everyPointPasses: false,
              pointResultRecords: shortRecords,
              firstFailure: null,
              pointResultDigest: canonicalSha256(shortRecords),
            };
          },
        },
        exactConeOracle: coordinateOracle(),
        sigma: 1,
        initialPointIds: [0],
      }),
    ).rejects.toThrow("batched adaptive witness scan is inconsistent");
  });
});
