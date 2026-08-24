import { describe, expect, it } from "vitest";

import {
  buildExactCheapScreenPeriodicPotential,
  buildExactCheapScreenPullingOrder,
  computeExactCheapScreenActionBindingDigest,
  replayExactCompactActionCheapScreen,
  runExactCompactActionCheapScreen,
  type ExactCheapScreenActionBinding,
  type ExactCompactActionCheapScreenBounds,
} from "../src/fibering/exactCompactActionCheapScreen";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  type StreamedTrackBIntegralCocycleBasis,
} from "../src/fibering/streamedTrackB";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "(Z/2 x Z/2) * Z/2 exact cheap-screen fixture",
  rank: 3,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
    { id: "s2", label: "s2" },
  ],
  coxeterMatrix: [
    [1, 2, "inf"],
    [2, 1, "inf"],
    ["inf", "inf", 1],
  ],
};

const ROWS = Array.from({ length: 3 }, (_unused, generator) =>
  Array.from({ length: 8 }, (_entry, point) => point ^ (1 << generator)),
);

const ACTION: TorsionFreeActionCandidate = {
  id: "rank3-regular-abelianization-action",
  index: 8,
  generatorImages: ROWS,
  backend: "exact-unit-test-permutations",
};

const BOUNDS: ExactCompactActionCheapScreenBounds = {
  maxSamplePoints: 8,
  maxCharacters: 4,
  maxOrders: 4,
  maxPotentials: 4,
  maxSubdivisionFamilies: 2,
  maxTrials: 64,
  maxSourceCellsPerPoint: 128,
  maxPullingSimplicesPerSourceCell: 128,
  maxOriginalLinkVerticesPerPoint: 128,
  maxIntroducedCentersPerTrial: 1024,
};

function fixture() {
  const torsionFree = certifyTorsionFreeAction(
    SYSTEM,
    ACTION,
    planSphericalSpecialSubgroups(SYSTEM),
  );
  expect(torsionFree.status).toBe("passed");
  const oracle = buildStreamedLawfulDavisOracle({
    system: SYSTEM,
    generatorImages: ROWS,
  });
  const edgeCoordinatePairs = (point: number, generator: number) => {
    if (generator !== 2) return [] as const;
    // No spherical rank-two type contains s2. Varying the s2 orientation with
    // the s0 bit gives a genuine quotient cycle while preserving reversal.
    const transverse = (point & 1) === 0 ? 1 : -1;
    const traversal = (point & 4) === 0 ? 1 : -1;
    return [[0, transverse * traversal]] as const;
  };
  const coordinateIds = ["free-cycle-coordinate"];
  const expectedCocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(oracle, {
      coordinateIds,
      edgeCoordinatePairs,
    });
  const cocycleBasis: StreamedTrackBIntegralCocycleBasis = {
    coordinateIds,
    latticeBasisDigest: canonicalSha256({
      fixture: "rank3-free-cycle-integral-lattice",
    }),
    expectedCocycleSectionDigest,
    edgeCoordinatePairs,
  };
  const bindingWithoutDigest: Omit<
    ExactCheapScreenActionBinding,
    "bindingDigest"
  > = {
    schemaVersion: 1,
    kind: "exact-finite-coxeter-permutation-action-binding",
    status: "passed",
    upstreamCertificateKind: "tits-spherical-special-subgroup-action",
    upstreamCertificateDigest: canonicalSha256(torsionFree),
    degree: oracle.degree,
    generatorCount: oracle.generatorCount,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    checks: {
      exactPermutationActionVerified: true,
      coxeterRelationsVerified: true,
      torsionFreeVerified: true,
    },
  };
  const binding = {
    ...bindingWithoutDigest,
    bindingDigest: "",
  } as ExactCheapScreenActionBinding;
  binding.bindingDigest = computeExactCheapScreenActionBindingDigest(binding);
  return {
    oracle,
    cocycleBasis,
    binding,
    orders: [
      buildExactCheapScreenPullingOrder(oracle.degree, {
        id: "numeric",
        multiplier: 1,
      }),
      buildExactCheapScreenPullingOrder(oracle.degree, {
        id: "reverse",
        multiplier: -1,
        shift: oracle.degree - 1,
      }),
    ],
    potentials: [
      buildExactCheapScreenPeriodicPotential(oracle.degree, {
        id: "zero",
        specification: { method: "zero" },
      }),
      buildExactCheapScreenPeriodicPotential(oracle.degree, {
        id: "affine-wave",
        specification: {
          method: "affine-centered-doubled",
          multiplier: 3,
          shift: 1,
          amplitude: 1,
        },
      }),
    ],
  };
}

describe("generic exact compact-action cheap screen", () => {
  it("computes deterministic exact pulling and stellar links, including every encountered center", () => {
    const data = fixture();
    const options = {
      oracle: data.oracle,
      actionBinding: data.binding,
      cocycleBasis: data.cocycleBasis,
      characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
      pullingOrders: data.orders,
      periodicPotentials: data.potentials,
      subdivisionFamilies: [
        "pulling" as const,
        "maximal-simplex-stellar" as const,
      ],
      tiePolarities: [-1 as const, 1 as const],
      samplePoints: [0, 1],
      bounds: BOUNDS,
    };
    const first = runExactCompactActionCheapScreen(options);
    const second = runExactCompactActionCheapScreen(options);

    expect(second).toEqual(first);
    expect(replayExactCompactActionCheapScreen(options, first)).toMatchObject({
      status: "passed",
      checks: {
        storedReportDigestValid: true,
        rebuiltReportDigestMatches: true,
        exactReportMatches: true,
      },
    });
    expect(first).toMatchObject({
      status: "completed",
      source: {
        degree: 8,
        generatorCount: 3,
        integralH1Rank: 1,
      },
      declaredPortfolio: {
        requestedTiePolarities: [-1, 1],
        requestedTrialCount: "16",
        scheduledTrialCount: 16,
      },
      checks: {
        actionCertificateBoundToOracle: true,
        cocycleSectionDigestMatches: true,
        directedEdgesAntisymmetric: true,
        everyRankTwoBoundaryClosed: true,
        allArithmeticIntegral: true,
      },
    });
    expect(first.trials).toHaveLength(16);
    expect(new Set(first.trials.map((trial) => trial.tiePolarity))).toEqual(
      new Set([-1, 1]),
    );
    expect(first.reportDigest).toMatch(/^[0-9a-f]{64}$/u);
    const stellar = first.trials.filter(
      (trial) => trial.subdivisionFamily === "maximal-simplex-stellar",
    );
    expect(stellar).toHaveLength(8);
    expect(
      stellar.every(
        (trial) =>
          trial.status === "evaluated" &&
          trial.originalVertexLinks.length === 2 &&
          trial.subdivisionVertexLinks.length > 0,
      ),
    ).toBe(true);
    expect(
      stellar
        .flatMap((trial) => trial.subdivisionVertexLinks)
        .every(
          (link) =>
            link.vertexKind === "maximal-simplex-stellar-center" &&
            link.sourceSimplexPointIds !== undefined &&
            link.sourceSimplexPointIds.length >= 2 &&
            link.ascending.nonempty &&
            link.ascending.connected &&
            link.descending.nonempty &&
            link.descending.connected &&
            link.failures.length === 0,
        ),
    ).toBe(true);
    expect(
      stellar
        .flatMap((trial) => trial.originalVertexLinks)
        .some((link) =>
          link.heights.some(
            (height) => height.sourceKind === "maximal-simplex-stellar",
          ),
        ),
    ).toBe(true);

    const tampered = structuredClone(first);
    tampered.trials[0].allCheckedLinksPass =
      !tampered.trials[0].allCheckedLinksPass;
    expect(
      replayExactCompactActionCheapScreen(options, tampered),
    ).toMatchObject({
      status: "failed",
      checks: { storedReportDigestValid: false, exactReportMatches: false },
    });

    const selfResealed = structuredClone(first);
    selfResealed.trials[0].allCheckedLinksPass =
      !selfResealed.trials[0].allCheckedLinksPass;
    const { reportDigest: _oldDigest, ...selfResealedPayload } = selfResealed;
    void _oldDigest;
    selfResealed.reportDigest = canonicalSha256(selfResealedPayload);
    expect(
      replayExactCompactActionCheapScreen(options, selfResealed),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedReportDigestValid: true,
        rebuiltReportDigestMatches: false,
        exactReportMatches: false,
      },
    });
  });

  it("keeps integral heights primary in stellar-center comparisons", () => {
    const data = fixture();
    const gauge = [0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n];
    const edgeCoordinatePairs = (point: number, generator: number) => {
      const target = data.oracle.neighbor(point, generator);
      let value = gauge[target] - gauge[point];
      for (const [
        coordinate,
        coefficient,
      ] of data.cocycleBasis.edgeCoordinatePairs(point, generator)) {
        expect(coordinate).toBe(0);
        value += BigInt(coefficient);
      }
      return value === 0n ? [] : ([[0, value.toString()]] as const);
    };
    const expectedCocycleSectionDigest =
      computeStreamedTrackBIntegralCocycleSectionDigest(data.oracle, {
        coordinateIds: data.cocycleBasis.coordinateIds,
        edgeCoordinatePairs,
      });
    const cocycleBasis: StreamedTrackBIntegralCocycleBasis = {
      ...data.cocycleBasis,
      latticeBasisDigest: canonicalSha256({
        fixture: "gauge-shifted-rank3-free-cycle-integral-lattice",
      }),
      expectedCocycleSectionDigest,
      edgeCoordinatePairs,
    };
    const report = runExactCompactActionCheapScreen({
      oracle: data.oracle,
      actionBinding: data.binding,
      cocycleBasis,
      characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
      pullingOrders: [
        buildExactCheapScreenPullingOrder(data.oracle.degree, {
          id: "times-three",
          multiplier: 3,
        }),
      ],
      periodicPotentials: [data.potentials[0]],
      subdivisionFamilies: ["maximal-simplex-stellar"],
      tiePolarities: [-1, 1],
      samplePoints: [2],
      bounds: BOUNDS,
    });

    expect(report.source.heightRule).toEqual({
      method: "integral-primary-global-pulling-rank-tie",
      maximumSourceSimplexCardinality: 3,
      integralScale: "22",
      stellarCenterTie: "global-simplex-id-infinitesimal",
    });
    // The raw integral center difference is +1, while the pulling-rank sum
    // is -11.  Scaling by degree 8 would reverse it; the global scale 22 does not.
    for (const [tiePolarity, mainNumerator] of [
      [-1, "33"],
      [1, "11"],
    ] as const) {
      const trial = report.trials.find(
        (candidate) => candidate.tiePolarity === tiePolarity,
      );
      const centerLink = trial?.subdivisionVertexLinks.find(
        (link) => link.sourceSimplexPointIds?.join(",") === "0,2,3",
      );
      expect(centerLink).toBeDefined();
      const centerHeight = trial?.originalVertexLinks[0].heights.find(
        (height) => height.vertexId === centerLink?.vertexId,
      );
      expect(centerHeight).toMatchObject({ mainNumerator, sign: 1 });
    }
  });

  it("materializes a stateful cocycle provider once before hashing and integration", () => {
    const data = fixture();
    const directedEdgeCount = data.oracle.degree * data.oracle.generatorCount;
    let calls = 0;
    const edgeCoordinatePairs = (point: number, generator: number) => {
      calls += 1;
      const pairs = data.cocycleBasis.edgeCoordinatePairs(point, generator);
      if (calls <= directedEdgeCount) return pairs;
      return pairs.map(
        ([coordinate, value]) =>
          [coordinate, (-BigInt(value)).toString()] as const,
      );
    };
    const statefulBasis: StreamedTrackBIntegralCocycleBasis = {
      ...data.cocycleBasis,
      edgeCoordinatePairs,
    };
    const common = {
      oracle: data.oracle,
      actionBinding: data.binding,
      characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
      pullingOrders: [data.orders[0]],
      periodicPotentials: [data.potentials[0]],
      subdivisionFamilies: ["pulling" as const],
      tiePolarities: [1 as const],
      samplePoints: [0],
      bounds: BOUNDS,
    };
    const stateful = runExactCompactActionCheapScreen({
      ...common,
      cocycleBasis: statefulBasis,
    });
    const pure = runExactCompactActionCheapScreen({
      ...common,
      cocycleBasis: data.cocycleBasis,
    });

    expect(calls).toBe(directedEdgeCount);
    expect(stateful).toEqual(pure);
    calls = 0;
    expect(
      replayExactCompactActionCheapScreen(
        { ...common, cocycleBasis: statefulBasis },
        stateful,
      ).status,
    ).toBe("passed");
    expect(calls).toBe(directedEdgeCount);
  });

  it("records a bounded incomplete exit without promoting partial links", () => {
    const data = fixture();
    const report = runExactCompactActionCheapScreen({
      oracle: data.oracle,
      actionBinding: data.binding,
      cocycleBasis: data.cocycleBasis,
      characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
      pullingOrders: [data.orders[0]],
      periodicPotentials: [data.potentials[0]],
      subdivisionFamilies: ["pulling"],
      tiePolarities: [1],
      samplePoints: [0],
      bounds: { ...BOUNDS, maxPullingSimplicesPerSourceCell: 1 },
    });

    expect(report).toMatchObject({
      status: "stopped-within-bounds",
      outcome: "inconclusive-within-bounds",
      stopReasons: ["maxPullingSimplicesPerSourceCell"],
    });
    expect(report.trials).toHaveLength(1);
    expect(report.trials[0]).toMatchObject({
      status: "stopped-within-bounds",
      allCheckedLinksPass: false,
      stopReason: "maxPullingSimplicesPerSourceCell",
    });
  });

  it("does not let a stopped topology warm the same bounded later trial", () => {
    const data = fixture();
    const secondZero = buildExactCheapScreenPeriodicPotential(
      data.oracle.degree,
      { id: "second-zero", specification: { method: "zero" } },
    );
    for (let maximum = 1; maximum <= 16; maximum += 1) {
      const report = runExactCompactActionCheapScreen({
        oracle: data.oracle,
        actionBinding: data.binding,
        cocycleBasis: data.cocycleBasis,
        characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
        pullingOrders: [data.orders[0]],
        periodicPotentials: [data.potentials[0], secondZero],
        subdivisionFamilies: ["pulling"],
        tiePolarities: [1],
        samplePoints: [0],
        bounds: { ...BOUNDS, maxSourceCellsPerPoint: maximum },
      });
      expect(report.trials[1].status).toBe(report.trials[0].status);
      expect(report.trials[1].stopReason).toBe(report.trials[0].stopReason);
    }
  });

  it("makes portfolio truncation and trial limits explicit", () => {
    const data = fixture();
    const report = runExactCompactActionCheapScreen({
      oracle: data.oracle,
      actionBinding: data.binding,
      cocycleBasis: data.cocycleBasis,
      characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
      pullingOrders: data.orders,
      periodicPotentials: data.potentials,
      subdivisionFamilies: ["pulling", "maximal-simplex-stellar"],
      tiePolarities: [-1, 1],
      samplePoints: [0, 1, 2],
      bounds: {
        ...BOUNDS,
        maxSamplePoints: 1,
        maxOrders: 1,
        maxPotentials: 1,
        maxSubdivisionFamilies: 1,
        maxTrials: 1,
      },
    });

    expect(report.status).toBe("stopped-within-bounds");
    expect(report.declaredPortfolio).toMatchObject({
      requestedPointIds: [0, 1, 2],
      processedPointIds: [0],
      requestedTiePolarities: [-1, 1],
      requestedTrialCount: "16",
      scheduledTrialCount: 1,
    });
    expect(report.stopReasons).toEqual([
      "maxOrders",
      "maxPotentials",
      "maxSamplePoints",
      "maxSubdivisionFamilies",
      "maxTrials",
    ]);
  });

  it("rejects stale action and cocycle bindings before screening", () => {
    const data = fixture();
    const staleAction = structuredClone(data.binding);
    staleAction.actionRowsCanonicalSha256 = "f".repeat(64);
    expect(() =>
      runExactCompactActionCheapScreen({
        oracle: data.oracle,
        actionBinding: staleAction,
        cocycleBasis: data.cocycleBasis,
        characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
        pullingOrders: [data.orders[0]],
        periodicPotentials: [data.potentials[0]],
        subdivisionFamilies: ["pulling"],
        tiePolarities: [1],
        samplePoints: [0],
        bounds: BOUNDS,
      }),
    ).toThrow(/not bound to this oracle/u);

    const missingChecks = structuredClone(data.binding) as unknown as {
      checks: Record<string, never>;
      bindingDigest: string;
    };
    missingChecks.checks = {};
    missingChecks.bindingDigest = computeExactCheapScreenActionBindingDigest(
      missingChecks as unknown as ExactCheapScreenActionBinding,
    );
    expect(() =>
      runExactCompactActionCheapScreen({
        oracle: data.oracle,
        actionBinding:
          missingChecks as unknown as ExactCheapScreenActionBinding,
        cocycleBasis: data.cocycleBasis,
        characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
        pullingOrders: [data.orders[0]],
        periodicPotentials: [data.potentials[0]],
        subdivisionFamilies: ["pulling"],
        tiePolarities: [1],
        samplePoints: [0],
        bounds: BOUNDS,
      }),
    ).toThrow(/stale, incomplete, or not bound/u);

    const staleBasis = {
      ...data.cocycleBasis,
      expectedCocycleSectionDigest: "e".repeat(64),
    };
    expect(() =>
      runExactCompactActionCheapScreen({
        oracle: data.oracle,
        actionBinding: data.binding,
        cocycleBasis: staleBasis,
        characters: [{ id: "primitive-free-cycle", coordinates: ["1"] }],
        pullingOrders: [data.orders[0]],
        periodicPotentials: [data.potentials[0]],
        subdivisionFamilies: ["pulling"],
        tiePolarities: [1],
        samplePoints: [0],
        bounds: BOUNDS,
      }),
    ).toThrow(/does not match its certified digest/u);
  });
});
