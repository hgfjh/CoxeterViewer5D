import { describe, expect, it } from "vitest";

import {
  buildStreamedLawfulDavisOracle,
  StreamedLawfulDavisError,
  type StreamedDavisCell,
  type StreamedOrientationSign,
  type StreamedWallSignCandidate,
} from "../src/fibering/streamedLawfulDavis";
import type { CoxeterSystemInput } from "../src/types";

function dihedralSystem(m: number): CoxeterSystemInput {
  return {
    schemaVersion: 1,
    name: `I2(${m}) streamed fixture`,
    rank: 2,
    generators: [
      { id: "s0", label: "s0" },
      { id: "s1", label: "s1" },
    ],
    coxeterMatrix: [
      [1, m],
      [m, 1],
    ],
  };
}

/** Regular right action of I2(m), with states encoded as r^k s^e. */
function dihedralRows(m: number): number[][] {
  const degree = 2 * m;
  return [
    Array.from({ length: degree }, (_unused, point) => point ^ 1),
    Array.from({ length: degree }, (_unused, point) => {
      const rotation = Math.floor(point / 2);
      const reflected = point % 2;
      return reflected === 0
        ? 2 * ((rotation - 1 + m) % m) + 1
        : 2 * ((rotation + 1) % m);
    }),
  ];
}

const A3_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "A3 streamed fixture",
  rank: 3,
  generators: [0, 1, 2].map((generator) => ({
    id: `s${generator}`,
    label: `s${generator}`,
  })),
  coxeterMatrix: [
    [1, 3, 2],
    [3, 1, 3],
    [2, 3, 1],
  ],
};

function permutations(values: readonly number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_entry, other) => other !== index)).map(
      (tail) => [value, ...tail],
    ),
  );
}

function a3Rows(): number[][] {
  const points = permutations([0, 1, 2, 3]);
  const indexByPermutation = new Map(
    points.map((permutation, index) => [permutation.join(","), index]),
  );
  return [0, 1, 2].map((generator) =>
    points.map((permutation) => {
      const image = [...permutation];
      [image[generator], image[generator + 1]] = [
        image[generator + 1],
        image[generator],
      ];
      return indexByPermutation.get(image.join(","))!;
    }),
  );
}

function allSignCandidates(
  wallIds: readonly string[],
): StreamedWallSignCandidate[] {
  return Array.from({ length: 2 ** wallIds.length }, (_unused, mask) => ({
    id: `mask-${mask}`,
    wallSigns: Object.fromEntries(
      wallIds.map((wallId, wallIndex) => [
        wallId,
        (mask & (1 << wallIndex) ? -1 : 1) as StreamedOrientationSign,
      ]),
    ),
  }));
}

describe("streamed lawful Davis oracle", () => {
  it("reconstructs rank-two cells and weighted walls without a face poset", () => {
    const oracle = buildStreamedLawfulDavisOracle({
      system: dihedralSystem(3),
      generatorImages: dihedralRows(3),
    });

    expect(oracle.degree).toBe(6);
    expect(oracle.cellCountByDimension).toEqual({ "0": 6, "1": 6, "2": 1 });
    expect(oracle.cellCount).toBe(13);
    expect(oracle.geometricEdgeCount).toBe(6);
    expect(oracle.rankTwoCellCount).toBe(1);
    expect(oracle.walls.twoSided).toBe(true);
    expect(oracle.walls.crossingSegmentCount).toBe(3);
    expect(oracle.walls.walls).toHaveLength(3);
    expect(
      oracle.walls.walls.every(
        (wall) =>
          wall.edgeCount === 2 &&
          wall.crossingSegmentCount === 1 &&
          wall.parityConflictCount === 0,
      ),
    ).toBe(true);
    for (const wall of oracle.walls.walls) {
      const canonical = oracle.wallForGeometricEdge(wall.canonicalEdgeIndex);
      expect(canonical.id).toBe(wall.id);
    }

    const cells: Array<{ vertexCount: number; boundaryLength: number }> = [];
    oracle.forEachRankTwoCell((cell) => {
      cells.push({
        vertexCount: oracle.cellVertices(cell.cell).length,
        boundaryLength: cell.boundary.length,
      });
      expect(cell.boundary.map((entry) => entry.boundaryIndex)).toEqual([
        0, 1, 2, 3, 4, 5,
      ]);
      expect(
        cell.boundary.every(
          (entry) => entry.traversal === 1 || entry.traversal === -1,
        ),
      ).toBe(true);
    });
    expect(cells).toEqual([{ vertexCount: 6, boundaryLength: 6 }]);
    expect(oracle.actionRowsCanonicalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(oracle.structureHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("binds signs to wall ids, evaluates lawfulness, and hashes retention", () => {
    const oracle = buildStreamedLawfulDavisOracle({
      system: dihedralSystem(3),
      generatorImages: dihedralRows(3),
    });
    const candidates = allSignCandidates(
      oracle.walls.walls.map((wall) => wall.id),
    );
    const evaluation = oracle.bindCoorientations(candidates);

    expect(evaluation.oracleStructureHash).toBe(oracle.structureHash);
    expect(evaluation.closure.status).toBe("passed");
    expect(evaluation.closure.immediateIncidenceCount).toBe(18);
    expect(evaluation.closure.downwardClosureViolationCount).toBe(0);
    expect(evaluation.closure.retentionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(evaluation.closure.closureHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      evaluation.closure.candidateSummaries.every(
        (summary) =>
          /^[0-9a-f]{64}$/.test(summary.retentionHash) &&
          /^[0-9a-f]{64}$/.test(summary.closureHash) &&
          summary.immediateIncidenceCount === 18 &&
          summary.downwardClosureViolationCount === 0,
      ),
    ).toBe(true);
    expect(
      evaluation.closure.candidateSummaries.map(
        (summary) => summary.retainedCellCountByDimension["2"],
      ),
    ).toEqual([0, 1, 1, 1, 1, 1, 1, 0]);

    const edge = oracle.geometricEdge(0, 0);
    const wallBinding = oracle.wallBinding(0, 0);
    const forward = evaluation.edgeIncrement(0, 0, 1);
    const reverse = evaluation.edgeIncrement(oracle.neighbor(0, 0), 0, 1);
    expect(edge.id).toBe("bar:e:g0:q0:q1");
    expect(wallBinding.wallId).toBe(oracle.wallIdForEdge(0, 0));
    expect(wallBinding.edgeId).toBe(edge.id);
    expect(reverse).toBe(-forward);

    expect(() =>
      oracle.bindCoorientations([
        { id: "unbound-mask", wallSigns: { [oracle.walls.walls[0].id]: 1 } },
      ]),
    ).toThrowError(StreamedLawfulDavisError);

    const prefilter = oracle.enumerateNativeVertexLinkPrefilter();
    expect(prefilter.status).toBe("completed");
    expect(prefilter.oracleStructureHash).toBe(oracle.structureHash);
    expect(prefilter.orderedWallIds).toEqual(
      oracle.walls.walls.map((wall) => wall.id),
    );
    expect(prefilter.maskConvention).toMatchObject({
      bitNumbering: "least-significant-bit-is-ordered-wall-index",
      zeroBitSign: 1,
      oneBitSign: -1,
      maskMinimum: 0,
      maskMaximum: 7,
      globalSignComplementXorMask: 7,
    });
    expect(prefilter.candidateCount).toBe(8);
    expect(
      prefilter.maskSummaries.map((summary) => summary.lawfulRankTwoCellCount),
    ).toEqual([0, 1, 1, 1, 1, 1, 1, 0]);
    // A cyclic rank-two quotient necessarily has a source and a sink. The
    // lawful masks still have exactly two transitions, but none can satisfy
    // the stronger no-empty-link prefilter at every quotient vertex.
    expect(prefilter.survivorMasks).toEqual([]);
    expect(prefilter.maskSummaries[0]).toMatchObject({
      passed: false,
      failingPointCount: 6,
      firstFailure: { point: 0 },
    });
    expect(prefilter.maskSummaries[1]).toMatchObject({
      passed: false,
      failingPointCount: 2,
      failureCounts: {
        "ascending-empty": 1,
        "descending-empty": 1,
        "ascending-disconnected": 0,
        "descending-disconnected": 0,
      },
    });
    expect(prefilter.maskSummaries[1].wallSigns).toEqual(
      candidates[1].wallSigns,
    );
    for (
      let candidateIndex = 0;
      candidateIndex < candidates.length;
      candidateIndex += 1
    ) {
      let directFailureCount = 0;
      for (let point = 0; point < oracle.degree; point += 1) {
        const increments = [0, 1].map((generator) =>
          evaluation.edgeIncrement(point, generator, candidateIndex),
        );
        if (!increments.includes(1) || !increments.includes(-1)) {
          directFailureCount += 1;
        }
      }
      expect(prefilter.maskSummaries[candidateIndex].failingPointCount).toBe(
        directFailureCount,
      );
    }
    expect(prefilter.reportHash).toMatch(/^[0-9a-f]{64}$/);

    const selected = candidates[3];
    const single = oracle.bindCoorientations([selected]);
    const reversed = oracle.bindCoorientations([...candidates].reverse());
    const summaryIn = (current: typeof evaluation, candidateId: string) =>
      current.closure.candidateSummaries.find(
        (summary) => summary.candidateId === candidateId,
      )!;
    const batchSummary = summaryIn(evaluation, selected.id);
    const singleSummary = summaryIn(single, selected.id);
    const reversedSummary = summaryIn(reversed, selected.id);
    expect(singleSummary.retentionHash).toBe(batchSummary.retentionHash);
    expect(reversedSummary.retentionHash).toBe(batchSummary.retentionHash);
    expect(singleSummary.closureHash).toBe(batchSummary.closureHash);
    expect(reversedSummary.closureHash).toBe(batchSummary.closureHash);
    expect(singleSummary.checks).toEqual(batchSummary.checks);
    expect(single.closure.retentionHash).not.toBe(
      evaluation.closure.retentionHash,
    );
    expect(reversed.closure.closureHash).not.toBe(
      evaluation.closure.closureHash,
    );

    const batchRetentionHash = evaluation.closure.retentionHash;
    const candidateRetentionHash = batchSummary.retentionHash;
    expect(Object.isFrozen(evaluation)).toBe(true);
    expect(Object.isFrozen(evaluation.candidates)).toBe(true);
    expect(Object.isFrozen(evaluation.candidates[0].wallSigns)).toBe(true);
    expect(Object.isFrozen(evaluation.closure)).toBe(true);
    expect(Object.isFrozen(evaluation.closure.candidateSummaries)).toBe(true);
    expect(() => {
      const mutableSigns = evaluation.candidates[0].wallSigns as Record<
        string,
        StreamedOrientationSign
      >;
      mutableSigns[oracle.walls.walls[0].id] = -1;
    }).toThrow(TypeError);
    expect(() => evaluation.closure.candidateSummaries.reverse()).toThrow(
      TypeError,
    );
    expect(() => {
      batchSummary.retentionHash = "0".repeat(64);
    }).toThrow(TypeError);
    expect(evaluation.closure.retentionHash).toBe(batchRetentionHash);
    expect(batchSummary.retentionHash).toBe(candidateRetentionHash);
  });

  it("streams higher spherical faces and gives explanatory metric-flag failures", () => {
    const oracle = buildStreamedLawfulDavisOracle({
      system: A3_SYSTEM,
      generatorImages: a3Rows(),
    });
    expect(oracle.cellCountByDimension).toEqual({
      "0": 24,
      "1": 36,
      "2": 14,
      "3": 1,
    });
    const topType = oracle.sphericalTypes.find((type) => type.dimension === 3)!;
    const topCell = oracle.cellContaining(topType.typeIndex, 0);
    let facetCount = 0;
    let rankTwoFaceCount = 0;
    oracle.forEachFacet(topCell, () => {
      facetCount += 1;
    });
    oracle.forEachRankTwoFace(topCell, () => {
      rankTwoFaceCount += 1;
    });
    expect(oracle.cellVertices(topCell)).toHaveLength(24);
    expect(facetCount).toBe(14);
    expect(rankTwoFaceCount).toBe(14);

    const plusSigns: StreamedWallSignCandidate = {
      id: "all-plus",
      wallSigns: Object.fromEntries(
        oracle.walls.walls.map((wall) => [wall.id, 1 as const]),
      ),
    };
    const evaluation = oracle.bindCoorientations([plusSigns]);
    expect(evaluation.closure.status).toBe("passed");
    expect(evaluation.isRetained(topCell, 0)).toBe(false);
    expect(evaluation.isMaximalRetained(topCell, 0)).toBe(false);

    const metricFlag = evaluation.checkMoussongMetricFlag(0, 2);
    expect(metricFlag.status).toBe("not-established");
    expect(metricFlag.violationCount).toBeGreaterThan(0);
    expect(metricFlag.witnesses).toHaveLength(2);
    expect(metricFlag.witnesses[0].pairCellIds).toHaveLength(3);
    expect(metricFlag.witnesses[0].unlawfulRankTwoFaceCellId).toMatch(
      /^sld:cell:T/,
    );
    expect(metricFlag.nonClaims.join(" ")).toContain("does not prove");

    for (const type of oracle.sphericalTypes) {
      oracle.forEachCell(type.typeIndex, (cell) => {
        if (!evaluation.isRetained(cell, 0)) return;
        oracle.forEachFacet(cell, (facet) => {
          expect(evaluation.isRetained(facet, 0)).toBe(true);
        });
      });
    }

    const vertexCell = oracle.cellContaining(0, 0);
    const forgedCells: StreamedDavisCell[] = [
      { ...topCell, dimension: topCell.dimension - 1 },
      { ...topCell, generatorMask: 0 },
      { ...topCell, generators: [0, 2] },
      { ...topCell, representativePoint: 1 },
      { ...vertexCell, representativePoint: 0.5 },
      { ...vertexCell, representativePoint: oracle.degree },
    ];
    for (const forged of forgedCells) {
      expect(() => oracle.cellId(forged)).toThrow(StreamedLawfulDavisError);
      expect(() => oracle.cellVertices(forged)).toThrow(
        StreamedLawfulDavisError,
      );
      expect(() => oracle.forEachFacet(forged, () => undefined)).toThrow(
        StreamedLawfulDavisError,
      );
      expect(() => oracle.forEachCofacet(forged, () => undefined)).toThrow(
        StreamedLawfulDavisError,
      );
      expect(() => oracle.forEachRankTwoFace(forged, () => undefined)).toThrow(
        StreamedLawfulDavisError,
      );
      expect(() => evaluation.retentionBits(forged)).toThrow(
        StreamedLawfulDavisError,
      );
      expect(() => evaluation.isRetained(forged, 0)).toThrow(
        StreamedLawfulDavisError,
      );
      expect(() => evaluation.isMaximalRetained(forged, 0)).toThrow(
        StreamedLawfulDavisError,
      );
    }
  });

  it("binds the oracle hash to the exact packed generator rows", () => {
    const rows = dihedralRows(3);
    const relabel = [1, 0, 2, 3, 4, 5];
    const inverse = new Map(relabel.map((point, image) => [image, point]));
    const conjugated = rows.map((row) =>
      relabel.map((oldPoint) => inverse.get(row[oldPoint])!),
    );
    const first = buildStreamedLawfulDavisOracle({
      system: dihedralSystem(3),
      generatorImages: rows,
    });
    const second = buildStreamedLawfulDavisOracle({
      system: dihedralSystem(3),
      generatorImages: conjugated,
    });

    expect(second.cellCountByDimension).toEqual(first.cellCountByDimension);
    expect(second.actionRowsCanonicalSha256).not.toBe(
      first.actionRowsCanonicalSha256,
    );
    expect(second.structureHash).not.toBe(first.structureHash);
  });

  it("isolates immutable public snapshots from the packed calculation", () => {
    const sourceSystem = dihedralSystem(3);
    const sourceRows = dihedralRows(3);
    const oracle = buildStreamedLawfulDavisOracle({
      system: sourceSystem,
      generatorImages: sourceRows,
    });
    const structureHash = oracle.structureHash;
    const initialReportHash =
      oracle.enumerateNativeVertexLinkPrefilter().reportHash;
    const initialWallIds = oracle.walls.walls.map((wall) => wall.id);

    expect(oracle.system).not.toBe(sourceSystem);
    expect(Object.isFrozen(oracle)).toBe(true);
    expect(Object.isFrozen(oracle.system)).toBe(true);
    expect(Object.isFrozen(oracle.system.coxeterMatrix)).toBe(true);
    expect(Object.isFrozen(oracle.system.coxeterMatrix[0])).toBe(true);
    expect(Object.isFrozen(oracle.walls)).toBe(true);
    expect(Object.isFrozen(oracle.walls.walls)).toBe(true);
    expect(Object.isFrozen(oracle.walls.walls[0])).toBe(true);

    expect(() => {
      oracle.system.coxeterMatrix[0][1] = 2;
    }).toThrow(TypeError);
    expect(() => oracle.walls.walls.reverse()).toThrow(TypeError);
    expect(() => {
      oracle.wallForGeometricEdge(0).edgeCount = 0;
    }).toThrow(TypeError);

    // The source objects are still caller-owned, but no longer alias either
    // the public snapshot or the private packed action.
    sourceSystem.coxeterMatrix[0][1] = 2;
    sourceSystem.coxeterMatrix[1][0] = 2;
    sourceRows[0].reverse();
    expect(oracle.system.coxeterMatrix[0][1]).toBe(3);
    expect(oracle.neighbor(0, 0)).toBe(1);

    const secondReport = oracle.enumerateNativeVertexLinkPrefilter();
    expect(oracle.structureHash).toBe(structureHash);
    expect(oracle.walls.walls.map((wall) => wall.id)).toEqual(initialWallIds);
    expect(secondReport.reportHash).toBe(initialReportHash);
    expect(
      secondReport.maskSummaries.map(
        (summary) => summary.lawfulRankTwoCellCount,
      ),
    ).toEqual([0, 1, 1, 1, 1, 1, 1, 0]);
  });
});
