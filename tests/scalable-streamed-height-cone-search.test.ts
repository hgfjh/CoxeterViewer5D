import { describe, expect, it } from "vitest";

import {
  buildObstructionPrunedConeCoverAsync,
  deriveAntipodalObstructionPrunedConeCover,
  replayObstructionPrunedConeCover,
  sealExactConeOracleCertificate,
  type AsyncExactConeFeasibilityOracle,
  type ExactConeOracleCertificate,
  type ExactConeOracleRequest,
} from "../src/fibering/scalableHeightCone";
import { createScalableStreamedHeightConeEvaluator } from "../src/fibering/streamedHeightConeSearch";
import type {
  StreamedTrackBLinearLinkGerm,
  StreamedTrackBLinearLinkTemplate,
} from "../src/fibering/streamedTrackB";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const RANK = 19;
const SOURCE_HASH = canonicalSha256("rank-19-streamed-height-fixture");
const TRANSCRIPT_HASH = canonicalSha256("coordinate-oracle");

function germ(
  id: string,
  otherPoint: number,
  coefficient: number,
): StreamedTrackBLinearLinkGerm {
  return {
    id,
    otherPoint,
    pointDifference: otherPoint === 0 ? -1 : 1,
    supportCellId: `cell:${id}`,
    coefficientPairs: [[0, String(coefficient)]],
  };
}

function template(
  point: number,
  germs: StreamedTrackBLinearLinkGerm[],
): StreamedTrackBLinearLinkTemplate {
  const topologyDigest = canonicalSha256({ point, germs, edges: [] });
  const withoutDigest = {
    point,
    maximalCellCount: germs.length,
    germs,
    adjacencyIncluded: true,
    edges: [] as Array<[string, string]>,
    topologyDigest,
  };
  return {
    ...withoutDigest,
    adjacency: germs.map(() => new Uint32Array()),
    templateDigest: canonicalSha256({
      schemaVersion: 1,
      method: "exact-integral-pulling-link-linear-template",
      sourceHash: SOURCE_HASH,
      ...withoutDigest,
    }),
  };
}

function exactCertificate(
  request: ExactConeOracleRequest,
  witness: number[] | null,
  equalityRank: number,
): ExactConeOracleCertificate {
  return sealExactConeOracleCertificate({
    schemaVersion: 1,
    kind: "external-exact-height-cone-certificate",
    requestHash: request.requestHash,
    backend: {
      id: "independent-coordinate-fixture",
      version: "1",
      algorithm: "coordinate-signs",
      transcriptSha256: TRANSCRIPT_HASH,
    },
    result: {
      kind: "feasible",
      equalityRank,
      dimension: RANK - equalityRank,
      primitiveWitness: witness?.map(String) ?? null,
    },
    certificateHash: "",
  });
}

function coordinateOracle(): AsyncExactConeFeasibilityOracle {
  return {
    async solve(request) {
      const witness = Array<number>(RANK).fill(0);
      const assigned = new Set<number>();
      let equalityRank = 0;
      for (const assignment of request.assignments) {
        const coordinate = assignment.normal.findIndex(
          (value) => value !== "0",
        );
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(assignment.normal[coordinate]).toBe("1");
        assigned.add(coordinate);
        if (assignment.sign === 0) equalityRank += 1;
        else witness[coordinate] = assignment.sign;
      }
      if (equalityRank === RANK) {
        return exactCertificate(request, null, equalityRank);
      }
      const witnessIsZero = (values: readonly number[]): boolean =>
        values.every((value) => value === 0);
      if (witnessIsZero(witness)) {
        const free = Array.from(
          { length: RANK },
          (_unused, index) => index,
        ).find((index) => !assigned.has(index));
        if (free === undefined) throw new Error("No free coordinate.");
        witness[free] = 1;
      }
      return exactCertificate(request, witness, equalityRank);
    },
  };
}

describe("scalable streamed Track-B link evaluator", () => {
  it("emits a replayable provisional witness on a sparse point set", async () => {
    const sparseTemplate = template(5, [
      { ...germ("a", 9, 1), otherPoint: 9, pointDifference: 4 },
      { ...germ("b", 9, -1), otherPoint: 9, pointDifference: 4 },
    ]);
    const evaluator = createScalableStreamedHeightConeEvaluator({
      source: {
        coordinateCount: RANK,
        pointCount: 1,
        pointIds: [5],
        ambientPointCount: 10,
        sourceHash: SOURCE_HASH,
        latticeBasisDigest: canonicalSha256("basis"),
        cocycleSectionDigest: canonicalSha256("section"),
        heightRuleDigest: canonicalSha256({
          method: "integral-character-plus-fixed-global-point-order-offset",
          offsetDenominator: 40,
          offsetPolarities: [-1, 1],
          clearedDifferenceFormula:
            "4*degree*dot(coefficientForm,weight)+sigma*pointDifference",
          antipodalEquivalence: "(weight,sigma)~(-weight,-sigma)",
        }),
        templateAt: (point) => {
          expect(point).toBe(5);
          return sparseTemplate;
        },
      },
      sigma: 1,
      cacheTemplates: true,
    });
    const cover = await buildObstructionPrunedConeCoverAsync({
      sourceHash: SOURCE_HASH,
      rank: RANK,
      oracle: coordinateOracle(),
      decide: evaluator.decideProvisional,
    });
    expect(cover).toMatchObject({
      nodeCount: 1,
      splitNodeCount: 0,
      pruneLeafCount: 0,
      survivorLeafCount: 1,
      zeroCharacterLeafCount: 0,
      root: {
        decision: {
          kind: "survivor",
          value: {
            kind: "streamed-track-b-provisional-passing-witness",
            checkedPointIds: [5],
            normalCount: 1,
            assignedNormalCount: 0,
            unresolvedNormalCount: 1,
          },
        },
      },
    });
    expect(
      replayObstructionPrunedConeCover(cover, {
        verifyPrune: evaluator.verifyPrune,
        verifySurvivor: evaluator.verifyProvisional,
      }),
    ).toMatchObject({ status: "passed", errors: [] });
  });

  it("covers rank 19, all zero faces, and both tie polarities exactly", async () => {
    const templates = [
      template(0, [
        { ...germ("a", 1, 1), otherPoint: 9, pointDifference: 9 },
        { ...germ("b", 1, -1), otherPoint: 9, pointDifference: 9 },
      ]),
    ];
    const heightRuleDigest = canonicalSha256({
      method: "integral-character-plus-fixed-global-point-order-offset",
      offsetDenominator: 40,
      offsetPolarities: [-1, 1],
      clearedDifferenceFormula:
        "4*degree*dot(coefficientForm,weight)+sigma*pointDifference",
      antipodalEquivalence: "(weight,sigma)~(-weight,-sigma)",
    });

    const createEvaluator = (sigma: -1 | 1) =>
      createScalableStreamedHeightConeEvaluator({
        source: {
          coordinateCount: RANK,
          pointCount: 1,
          ambientPointCount: 10,
          sourceHash: SOURCE_HASH,
          latticeBasisDigest: canonicalSha256("basis"),
          cocycleSectionDigest: canonicalSha256("section"),
          heightRuleDigest,
          templateAt: (point) => templates[point],
        },
        sigma,
        cacheTemplates: true,
      });

    const negativeEvaluator = createEvaluator(-1);
    const negativeCover = await buildObstructionPrunedConeCoverAsync({
      sourceHash: SOURCE_HASH,
      rank: RANK,
      oracle: coordinateOracle(),
      decide: negativeEvaluator.decide,
    });
    const positiveEvaluator = createEvaluator(1);
    const independentlyBuiltPositiveCover =
      await buildObstructionPrunedConeCoverAsync({
        sourceHash: SOURCE_HASH,
        rank: RANK,
        oracle: coordinateOracle(),
        decide: positiveEvaluator.decide,
      });
    const derivedPositiveEvaluator = createEvaluator(1);
    const derivedPositiveCover = deriveAntipodalObstructionPrunedConeCover({
      source: negativeCover,
      decide: derivedPositiveEvaluator.decide,
    });

    for (const [cover, evaluator] of [
      [negativeCover, negativeEvaluator],
      [independentlyBuiltPositiveCover, positiveEvaluator],
      [derivedPositiveCover, derivedPositiveEvaluator],
    ] as const) {
      expect(cover).toMatchObject({
        rank: 19,
        splitNodeCount: 19,
        pruneLeafCount: 36,
        survivorLeafCount: 2,
        zeroCharacterLeafCount: 1,
      });
      expect(
        replayObstructionPrunedConeCover(cover, {
          verifyPrune: evaluator.verifyPrune,
          verifySurvivor: evaluator.verifySurvivor,
        }),
      ).toMatchObject({ status: "passed", errors: [] });
    }
    expect(derivedPositiveCover).toMatchObject({
      nodeCount: independentlyBuiltPositiveCover.nodeCount,
      splitNodeCount: independentlyBuiltPositiveCover.splitNodeCount,
      pruneLeafCount: independentlyBuiltPositiveCover.pruneLeafCount,
      survivorLeafCount: independentlyBuiltPositiveCover.survivorLeafCount,
      zeroCharacterLeafCount:
        independentlyBuiltPositiveCover.zeroCharacterLeafCount,
      infeasibleBranchCount:
        independentlyBuiltPositiveCover.infeasibleBranchCount,
    });
  });
});
