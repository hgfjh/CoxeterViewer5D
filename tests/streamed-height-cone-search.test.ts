import { describe, expect, it } from "vitest";

import {
  buildExactTernaryHeightConeCover,
  canonicalizeHeightNormal,
  certifyHeightCone,
  replayExactTernaryHeightConeCover,
  type HeightConeAssignment,
  type HeightConeContext,
} from "../src/fibering/streamedHeightArrangement";
import {
  createStreamedHeightConeEvaluator,
  type StreamedHeightConeTemplateSource,
} from "../src/fibering/streamedHeightConeSearch";
import type {
  StreamedTrackBLinearLinkGerm,
  StreamedTrackBLinearLinkTemplate,
} from "../src/fibering/streamedTrackB";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

function assignment(normal: number[], sign: -1 | 0 | 1): HeightConeAssignment {
  const canonical = canonicalizeHeightNormal(normal);
  if (canonical.zero)
    throw new Error("A test assignment normal cannot vanish.");
  return {
    normal: canonical.primitive,
    normalKey: canonical.key,
    sign,
  };
}

function context(
  rank: number,
  assignments: HeightConeAssignment[],
): HeightConeContext {
  const feasibility = certifyHeightCone(rank, assignments);
  if (
    feasibility.kind !== "feasible" ||
    feasibility.primitiveWitness === null
  ) {
    throw new Error("The test cone needs a nonzero primitive witness.");
  }
  return {
    rank,
    assignments,
    feasibility,
    depth: assignments.length,
    constraintDigest: canonicalSha256(
      assignments.map((entry) => ({
        normal: entry.normal,
        normalKey: entry.normalKey,
        sign: entry.sign,
      })),
    ),
  };
}

function germ(
  id: string,
  point: number,
  otherPoint: number,
  coefficientPairs: Array<[number, string]>,
): StreamedTrackBLinearLinkGerm {
  return {
    id,
    otherPoint,
    pointDifference: otherPoint - point,
    supportCellId: `support:${id}`,
    coefficientPairs,
  };
}

function template(
  sourceHash: string,
  point: number,
  germs: StreamedTrackBLinearLinkGerm[],
  edgeIndices: Array<[number, number]>,
): StreamedTrackBLinearLinkTemplate {
  const adjacency = Array.from({ length: germs.length }, () => [] as number[]);
  const edges = edgeIndices.map(([left, right]) => {
    adjacency[left].push(right);
    adjacency[right].push(left);
    return [germs[left].id, germs[right].id] as [string, string];
  });
  for (const row of adjacency) row.sort((left, right) => left - right);
  const topologyDigest = canonicalSha256({ point, germs, edges });
  const withoutDigest = {
    point,
    maximalCellCount: 1,
    germs,
    adjacencyIncluded: true,
    edges,
    topologyDigest,
  };
  return {
    ...withoutDigest,
    adjacency: adjacency.map((row) => Uint32Array.from(row)),
    templateDigest: canonicalSha256({
      schemaVersion: 1,
      method: "exact-integral-pulling-link-linear-template",
      sourceHash,
      ...withoutDigest,
    }),
  };
}

function source(
  coordinateCount: number,
  templates: StreamedTrackBLinearLinkTemplate[],
): StreamedHeightConeTemplateSource {
  const pointCount = templates.length;
  return {
    coordinateCount,
    pointCount,
    sourceHash: templates.length === 0 ? canonicalSha256("empty") : "",
    latticeBasisDigest: canonicalSha256({ basis: coordinateCount }),
    cocycleSectionDigest: canonicalSha256({ section: coordinateCount }),
    heightRuleDigest: canonicalSha256({
      method: "integral-character-plus-fixed-global-point-order-offset",
      offsetDenominator: 4 * pointCount,
      offsetPolarities: [-1, 1],
      clearedDifferenceFormula:
        "4*degree*dot(coefficientForm,weight)+sigma*pointDifference",
      antipodalEquivalence: "(weight,sigma)~(-weight,-sigma)",
    }),
    templateAt(point) {
      const result = templates[point];
      if (!result) throw new Error(`Missing fixture template q${point}.`);
      return result;
    },
  };
}

function fixtureSource(
  coordinateCount: number,
  builders: Array<
    (sourceHash: string, point: number) => StreamedTrackBLinearLinkTemplate
  >,
): StreamedHeightConeTemplateSource {
  const sourceHash = canonicalSha256({
    fixture: builders.length,
    coordinateCount,
  });
  const templates = builders.map((build, point) => build(sourceHash, point));
  const result = source(coordinateCount, templates);
  result.sourceHash = sourceHash;
  return result;
}

describe("streamed Track-B cone decisions", () => {
  it("uses sigma times point order exactly when a germ form vanishes", () => {
    const fixture = fixtureSource(1, [
      (sourceHash, point) =>
        template(
          sourceHash,
          point,
          [germ("a", point, 1, []), germ("b", point, 1, [[0, "1"]])],
          [],
        ),
      (sourceHash, point) =>
        template(
          sourceHash,
          point,
          [germ("c", point, 0, []), germ("d", point, 0, [[0, "-1"]])],
          [],
        ),
    ]);
    const xNegative = context(1, [assignment([1], -1)]);
    const positiveSigma = createStreamedHeightConeEvaluator({
      source: fixture,
      sigma: 1,
    });
    const negativeSigma = createStreamedHeightConeEvaluator({
      source: fixture,
      sigma: -1,
    });

    const passing = positiveSigma.decide(xNegative);
    expect(passing.kind).toBe("leaf");
    if (passing.kind === "leaf") {
      expect(positiveSigma.verifyLeaf(xNegative, passing.value)).toBe(true);
    }
    const failing = negativeSigma.decide(xNegative);
    expect(failing.kind).toBe("prune");
    if (failing.kind === "prune") {
      expect(failing.proof).toMatchObject({
        point: 0,
        failureKind: "ascending-empty",
        obstructionMethod: "no-possible-link-vertices",
        possibleGermCount: 0,
        possibleGermDigest: canonicalSha256([]),
      });
      expect(negativeSigma.verifyPrune(xNegative, failing.proof)).toBe(true);
    }
  });

  it("certifies a disconnected link before every point normal is assigned", () => {
    const fixture = fixtureSource(2, [
      (sourceHash, point) =>
        template(
          sourceHash,
          point,
          [
            germ("a", point, 1, [[0, "1"]]),
            germ("b", point, 1, [[1, "1"]]),
            germ("c", point, 1, [[0, "2"]]),
          ],
          [[0, 1]],
        ),
      (sourceHash, point) =>
        template(
          sourceHash,
          point,
          [germ("d", point, 0, [[0, "1"]]), germ("e", point, 0, [[0, "-1"]])],
          [],
        ),
    ]);
    const evaluator = createStreamedHeightConeEvaluator({
      source: fixture,
      sigma: 1,
    });
    const xPositive = context(2, [assignment([1, 0], 1)]);
    const decision = evaluator.decide(xPositive);

    expect(decision.kind).toBe("prune");
    if (decision.kind !== "prune") return;
    expect(decision.proof).toMatchObject({
      point: 0,
      failureKind: "ascending-disconnected",
      obstructionMethod: "forced-vertices-separated-in-possible-link",
      forcedGermCount: 2,
      forcedGermDigest: canonicalSha256(["a", "c"]),
      possibleGermCount: 3,
      possibleGermDigest: canonicalSha256(["a", "b", "c"]),
      possibleComponentCount: 2,
      possibleComponentsDigest: canonicalSha256([["a", "b"], ["c"]]),
      forcedComponentWitnessCount: 2,
      forcedComponentWitnessDigest: canonicalSha256(["a", "c"]),
      forcedComponentWitnessExcerpt: ["a", "c"],
    });
    expect(decision.proof.assignedPointNormalCount).toBe(1);
    expect(decision.proof.pointNormalCount).toBe(2);
    expect(evaluator.verifyPrune(xPositive, decision.proof)).toBe(true);
    const tampered = {
      ...decision.proof,
      forcedComponentWitnessExcerpt: ["a", "b"],
    };
    const rehashedTamper = {
      ...tampered,
      proofHash: canonicalSha256({ ...tampered, proofHash: "" }),
    };
    expect(evaluator.verifyPrune(xPositive, rehashedTamper)).toBe(false);

    const cover = buildExactTernaryHeightConeCover({
      rank: 2,
      decide: evaluator.decide,
    });
    expect(cover).toMatchObject({
      splitNodeCount: 2,
      pruneLeafCount: 4,
      ordinaryLeafCount: 0,
      zeroCharacterLeafCount: 1,
    });
    expect(
      replayExactTernaryHeightConeCover(cover, {
        verifyPrune: evaluator.verifyPrune,
        verifyLeaf: evaluator.verifyLeaf,
      }),
    ).toMatchObject({ status: "passed" });
  });

  it("keeps one invariant obstruction across an omitted normal's -/0/+ refinements", () => {
    const fixture = fixtureSource(2, [
      (sourceHash, point) =>
        template(
          sourceHash,
          point,
          [
            germ("a", point, 1, [[0, "1"]]),
            germ("b", point, 1, [[1, "1"]]),
            germ("c", point, 1, [[0, "2"]]),
            germ("z", point, 1, [[0, "-1"]]),
          ],
          [[0, 1]],
        ),
      (sourceHash, point) =>
        template(
          sourceHash,
          point,
          [germ("d", point, 0, [[0, "1"]]), germ("e", point, 0, [[0, "-1"]])],
          [],
        ),
    ]);
    const evaluator = createStreamedHeightConeEvaluator({
      source: fixture,
      sigma: 1,
    });
    const coarseContext = context(2, [assignment([1, 0], 1)]);
    const coarseDecision = evaluator.decide(coarseContext);

    expect(coarseDecision.kind).toBe("prune");
    if (coarseDecision.kind !== "prune") return;
    expect(coarseDecision.proof).toMatchObject({
      point: 0,
      failureKind: "ascending-disconnected",
      obstructionMethod: "forced-vertices-separated-in-possible-link",
      assignedPointNormalCount: 1,
      pointNormalCount: 2,
      forcedGermDigest: canonicalSha256(["a", "c"]),
      possibleGermDigest: canonicalSha256(["a", "b", "c"]),
    });
    expect(evaluator.verifyPrune(coarseContext, coarseDecision.proof)).toBe(
      true,
    );

    const refinements = (
      [
        [-1, ["1", "-1"]],
        [0, ["1", "0"]],
        [1, ["1", "1"]],
      ] as const
    ).map(([sign, expectedWitness]) => {
      const refinedContext = context(2, [
        assignment([1, 0], 1),
        assignment([0, 1], sign),
      ]);
      expect(refinedContext.feasibility.primitiveWitness).toEqual(
        expectedWitness,
      );
      const decision = evaluator.decide(refinedContext);
      expect(decision.kind).toBe("prune");
      if (decision.kind !== "prune") {
        throw new Error(`The y-sign ${sign} refinement was not obstructed.`);
      }
      expect(decision.proof).toMatchObject({
        point: 0,
        failureKind: "ascending-disconnected",
        obstructionMethod: "forced-vertices-separated-in-possible-link",
        assignedPointNormalCount: 2,
        pointNormalCount: 2,
      });
      expect(evaluator.verifyPrune(refinedContext, decision.proof)).toBe(true);
      return decision.proof;
    });

    // On the y=0 face, sigma=+1 and q1-q0>0 send germ b upward. Its
    // directed link therefore agrees with y>0, while y<0 sends b downward.
    expect(refinements[1].linkDigest).toBe(refinements[2].linkDigest);
    expect(refinements[1].linkDigest).not.toBe(refinements[0].linkDigest);
  });

  it("builds and replays a complete passing cover with a separate zero leaf", () => {
    const fixture = fixtureSource(1, [
      (sourceHash, point) =>
        template(
          sourceHash,
          point,
          [germ("a", point, 1, [[0, "1"]]), germ("b", point, 1, [[0, "-1"]])],
          [],
        ),
      (sourceHash, point) =>
        template(
          sourceHash,
          point,
          [germ("c", point, 0, [[0, "1"]]), germ("d", point, 0, [[0, "-1"]])],
          [],
        ),
    ]);
    const evaluator = createStreamedHeightConeEvaluator({
      source: fixture,
      sigma: 1,
      cacheTemplates: true,
    });
    const cover = buildExactTernaryHeightConeCover({
      rank: 1,
      decide: evaluator.decide,
    });

    expect(cover).toMatchObject({
      ordinaryLeafCount: 2,
      pruneLeafCount: 0,
      zeroCharacterLeafCount: 1,
    });
    expect(
      replayExactTernaryHeightConeCover(cover, {
        verifyPrune: evaluator.verifyPrune,
        verifyLeaf: evaluator.verifyLeaf,
      }),
    ).toMatchObject({ status: "passed" });
    expect(evaluator.statistics()).toMatchObject({
      cachedPointCount: 2,
      passingLeafCount: 2,
    });
  });
});
