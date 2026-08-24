import { describe, expect, it } from "vitest";

import {
  buildGeneralizedCompressionCertificate,
  computeGeneralizedCompressionArchiveHash,
} from "../src/davis/generalizedCompression";
import {
  buildStreamedTrackBCertificate,
  computeStreamedTrackBArtifactHash,
  computeStreamedTrackBBatchReportHash,
  computeStreamedTrackBIntegralCocycleSectionDigest,
  computeStreamedTrackBLinearTemplateStreamHash,
  computeStreamedTrackBLinkAtPoint,
  replayStreamedTrackBBatchScan,
  replayStreamedTrackBCertificate,
  scanStreamedTrackBCandidatesPointMajor,
  streamStreamedTrackBLinearLinkTemplates,
} from "../src/fibering/streamedTrackB";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedOrientationSign,
  type StreamedWallSignCandidate,
} from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

function dihedralSystem(m: number | "inf"): CoxeterSystemInput {
  return {
    schemaVersion: 1,
    name: `I2(${m}) Track B fixture`,
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

/** Right action on r^k s^e; it is regular when the exponent is finite. */
function dihedralRows(rotationOrder: number): number[][] {
  const degree = 2 * rotationOrder;
  return [
    Array.from({ length: degree }, (_unused, point) => point ^ 1),
    Array.from({ length: degree }, (_unused, point) => {
      const rotation = Math.floor(point / 2);
      const reflected = point % 2;
      return reflected === 0
        ? 2 * ((rotation - 1 + rotationOrder) % rotationOrder) + 1
        : 2 * ((rotation + 1) % rotationOrder);
    }),
  ];
}

function fixture(m: number | "inf", rotationOrder = 3) {
  const system = dihedralSystem(m);
  const rows = dihedralRows(rotationOrder);
  const action: TorsionFreeActionCandidate = {
    id: `i2-${m}-track-b-action`,
    index: rows[0].length,
    generatorImages: rows,
    backend: "test-exact",
  };
  const torsionFree = certifyTorsionFreeAction(
    system,
    action,
    planSphericalSpecialSubgroups(system),
  );
  expect(torsionFree.status).toBe("passed");
  const generalizedCompression = buildGeneralizedCompressionCertificate(
    system,
    { candidate: action, certificate: torsionFree },
  );
  const oracle = buildStreamedLawfulDavisOracle({
    system,
    generatorImages: rows,
  });
  const wallIds = oracle.walls.walls.map((wall) => wall.id);
  const candidate = (mask: number, id = `mask-${mask}`) => ({
    id,
    wallSigns: Object.fromEntries(
      wallIds.map((wallId, wallIndex) => [
        wallId,
        (mask & (2 ** wallIndex) ? -1 : 1) as StreamedOrientationSign,
      ]),
    ),
  });
  return { system, rows, oracle, generalizedCompression, wallIds, candidate };
}

describe("streamed full-K Track B", () => {
  it("certifies a primitive-kernel height and full links on a circle quotient", () => {
    const data = fixture("inf");
    const certificate = buildStreamedTrackBCertificate({
      oracle: data.oracle,
      candidate: data.candidate(8),
      generalizedCompression: data.generalizedCompression,
      linkScan: "exhaustive",
    });

    expect(certificate.status).toBe("passed");
    expect(certificate.conclusion).toBe("finite-generation-certified");
    expect(certificate.character).toMatchObject({
      status: "passed",
      normalizationDivisor: 6,
      checks: {
        wallBasisClosedOnEveryRankTwoCell: true,
        characterNontrivial: true,
        primitiveAfterNormalization: true,
      },
    });
    expect(certificate.fullK).toMatchObject({
      allCellsRetained: true,
      universalCoverContractible: true,
      quotientAspherical: true,
    });
    expect(certificate.pulling.introducedVertexIds).toEqual([]);
    expect(certificate.height).toMatchObject({
      offsetDenominator: 24,
      formula: "F_c(q)=raw_c(q)+polarity*sign_c(anchor)*q/(4*degree)",
      checks: {
        everyOriginalEdgeSignPreserved: true,
        everyPullingSimplexHasDistinctVertexHeights: true,
        globalReversalNegatesHeight: true,
      },
    });
    expect(certificate.directedLinks).toMatchObject({
      status: "passed",
      checkedVertexCount: 6,
      scanOutcome: "exhaustive",
    });
    expect(
      replayStreamedTrackBCertificate(
        {
          oracle: data.oracle,
          candidate: data.candidate(8),
          generalizedCompression: data.generalizedCompression,
          linkScan: "exhaustive",
        },
        certificate,
      ),
    ).toMatchObject({
      status: "passed",
      checks: { actionRootedReconstructionMatches: true },
    });
  });

  it("constructs the diagonal germs in a pulled rank-two Coxeter cell", () => {
    const data = fixture(3);
    const point = computeStreamedTrackBLinkAtPoint(
      {
        oracle: data.oracle,
        candidate: data.candidate(0),
        generalizedCompression: data.generalizedCompression,
      },
      0,
    );

    // Pulling a hexagon from q0 gives a fan. Its link at the apex is the
    // five-vertex path, including three diagonal germs absent from the
    // original Cayley graph.
    expect(point.summary).toMatchObject({
      point: 0,
      maximalCellCount: 1,
      germCount: 5,
      linkEdgeCount: 4,
    });
    expect(point.resultHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("streams exact pulling forms in a supplied integral cocycle basis", () => {
    const data = fixture(3);
    const wallIndexById = new Map(
      data.wallIds.map((wallId, wallIndex) => [wallId, wallIndex]),
    );
    const coordinateIds = data.wallIds.map((_wallId, index) => `z${index}`);
    const edgeCoordinatePairs = (point: number, generator: number) => {
      const binding = data.oracle.wallBinding(point, generator);
      const wallIndex = wallIndexById.get(binding.wallId)!;
      const geometric = data.oracle.geometricEdge(point, generator);
      const traversal = geometric.sourcePoint === point ? 1 : -1;
      return [[wallIndex, binding.edgeParity * traversal]] as const;
    };
    const expectedCocycleSectionDigest =
      computeStreamedTrackBIntegralCocycleSectionDigest(data.oracle, {
        coordinateIds,
        edgeCoordinatePairs,
      });
    const basis = {
      coordinateIds,
      latticeBasisDigest: "0".repeat(64),
      expectedCocycleSectionDigest,
      edgeCoordinatePairs,
    };
    const templates: Array<{
      germCount: number;
      coefficientPairs: Array<Array<[number, string]>>;
    }> = [];
    const first = streamStreamedTrackBLinearLinkTemplates(
      {
        oracle: data.oracle,
        generalizedCompression: data.generalizedCompression,
        cocycleBasis: basis,
        points: [0],
      },
      (template) => {
        templates.push({
          germCount: template.germs.length,
          coefficientPairs: template.germs.map((germ) => germ.coefficientPairs),
        });
        expect(template.adjacency).toHaveLength(template.germs.length);
        expect(
          template.germs.every(
            (germ) => germ.pointDifference === germ.otherPoint - template.point,
          ),
        ).toBe(true);
        expect(template.templateDigest).toMatch(/^[0-9a-f]{64}$/);
      },
    );

    expect(first).toMatchObject({
      status: "completed",
      requestedPointCount: 1,
      checkedPointCount: 1,
      exhaustiveAllPoints: false,
      maximumAbsoluteEdgeCoordinate: "1",
      heightRule: {
        offsetDenominator: 24,
        offsetPolarities: [-1, 1],
        antipodalEquivalence: "(weight,sigma)~(-weight,-sigma)",
      },
      checks: {
        sourceReplayed: true,
        directedEdgesAntisymmetric: true,
        rankTwoBoundariesClosed: true,
        exactNumberPackingBoundProved: true,
        everyRequestedPointStreamed: true,
        everyQuotientPointStreamed: false,
      },
    });
    expect(first.cocycleSectionDigest).toBe(expectedCocycleSectionDigest);
    expect(first.reportHash).toBe(
      computeStreamedTrackBLinearTemplateStreamHash(first),
    );
    expect(templates).toHaveLength(1);
    expect(templates[0].germCount).toBe(5);
    expect(
      templates[0].coefficientPairs
        .flat()
        .every(([, value]) => /^-?(0|[1-9][0-9]*)$/.test(value)),
    ).toBe(true);

    const replay = streamStreamedTrackBLinearLinkTemplates(
      {
        oracle: data.oracle,
        generalizedCompression: data.generalizedCompression,
        cocycleBasis: basis,
        points: [0],
      },
      () => undefined,
    );
    expect(replay.cocycleSectionDigest).toBe(first.cocycleSectionDigest);
    expect(replay.templateSetDigest).toBe(first.templateSetDigest);
    expect(replay.checks.expectedCocycleSectionDigestMatches).toBe(true);

    let fastGerms: Array<Array<[number, string]>> = [];
    const fast = streamStreamedTrackBLinearLinkTemplates(
      {
        oracle: data.oracle,
        generalizedCompression: data.generalizedCompression,
        cocycleBasis: basis,
        points: [0],
        includeAdjacency: false,
      },
      (template) => {
        expect(template.adjacencyIncluded).toBe(false);
        expect(template.edges).toEqual([]);
        expect(template.adjacency).toEqual([]);
        fastGerms = template.germs.map((germ) => germ.coefficientPairs);
      },
    );
    expect(fast.status).toBe("completed");
    expect(fast.sourceHash).toBe(first.sourceHash);
    expect(fast.adjacencyIncluded).toBe(false);
    expect(fastGerms).toEqual(templates[0].coefficientPairs);

    const stopped = streamStreamedTrackBLinearLinkTemplates(
      {
        oracle: data.oracle,
        generalizedCompression: data.generalizedCompression,
        cocycleBasis: basis,
        points: [0, 1],
      },
      () => "stop",
    );
    expect(stopped).toMatchObject({
      status: "completed",
      scanOutcome: "visitor-stopped",
      requestedPointCount: 2,
      checkedPointCount: 1,
      checks: { everyRequestedPointStreamed: false },
    });
  });

  it("screens every anchor-positive sign vector and both odd polarities point-major", () => {
    const data = fixture("inf");
    const candidates: StreamedWallSignCandidate[] = [];
    for (let mask = 0; mask < 2 ** data.wallIds.length; mask += 1) {
      if ((mask & 1) === 0) candidates.push(data.candidate(mask));
    }
    const options = {
      oracle: data.oracle,
      candidates,
      generalizedCompression: data.generalizedCompression,
      offsetPolarities: [1, -1] as const,
    };
    const scan = scanStreamedTrackBCandidatesPointMajor(options);

    expect(scan.status).toBe("completed");
    expect(scan.candidateCount).toBe(32);
    expect(scan.classCount).toBe(64);
    expect(scan.checks).toEqual({
      candidatesCompleteAndCanonical: true,
      exhaustiveAnchorPositiveSignVectors: true,
      pointMajorTemplatesReused: true,
      everyClassResolved: true,
      globalReversalQuotientSound: true,
    });
    expect(
      scan.firstFailureCountByPoint.reduce((sum, count) => sum + count, 0) +
        scan.survivorIndices.length,
    ).toBe(64);
    expect(scan.failureCensusDigest).toMatch(/^[0-9a-f]{64}$/);
    const rejected = scan.summaries.find(
      (summary) => summary.firstFailure !== undefined,
    );
    expect(rejected?.firstFailure).toBeDefined();
    const rejectedCandidate = candidates.find(
      (candidate) => candidate.id === rejected?.candidateId,
    );
    expect(rejectedCandidate).toBeDefined();
    const replayedWitness = computeStreamedTrackBLinkAtPoint(
      {
        oracle: data.oracle,
        candidate: rejectedCandidate!,
        generalizedCompression: data.generalizedCompression,
        offsetPolarity: rejected!.offsetPolarity,
      },
      rejected!.firstFailure!.point,
    );
    expect(replayedWitness.summary.linkDigest).toBe(
      rejected!.firstFailure!.linkDigest,
    );
    expect(replayStreamedTrackBBatchScan(options, scan)).toMatchObject({
      status: "passed",
      checks: { actionRootedReconstructionMatches: true },
    });
  });

  it("binds polarity and rejects rehashed link and batch tampering", () => {
    const data = fixture("inf");
    const options = {
      oracle: data.oracle,
      candidate: data.candidate(8),
      generalizedCompression: data.generalizedCompression,
      linkScan: "exhaustive" as const,
      offsetPolarity: 1 as const,
    };
    const certificate = buildStreamedTrackBCertificate(options);
    const oppositePolarity = buildStreamedTrackBCertificate({
      ...options,
      offsetPolarity: -1,
    });
    expect(oppositePolarity.sourceHash).not.toBe(certificate.sourceHash);
    expect(oppositePolarity.height.heightDigest).not.toBe(
      certificate.height.heightDigest,
    );

    const changed = structuredClone(certificate);
    changed.directedLinks.vertexSummaries[0].ascendingVertexCount += 1;
    changed.artifactHash = computeStreamedTrackBArtifactHash(changed);
    expect(replayStreamedTrackBCertificate(options, changed)).toMatchObject({
      status: "failed",
      checks: {
        storedArtifactHashValid: true,
        actionRootedReconstructionMatches: false,
      },
    });

    const batchOptions = {
      oracle: data.oracle,
      candidates: [data.candidate(0), data.candidate(2)],
      generalizedCompression: data.generalizedCompression,
      offsetPolarities: [1, -1] as const,
    };
    const batch = scanStreamedTrackBCandidatesPointMajor(batchOptions);
    const changedBatch = structuredClone(batch);
    changedBatch.summaries[0].checkedVertexCount += 1;
    changedBatch.reportHash =
      computeStreamedTrackBBatchReportHash(changedBatch);
    expect(
      replayStreamedTrackBBatchScan(batchOptions, changedBatch),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedReportHashValid: true,
        actionRootedReconstructionMatches: false,
      },
    });
  });

  it("reports source tampering as not established rather than a link obstruction", () => {
    const data = fixture("inf");
    const tampered = structuredClone(data.generalizedCompression);
    tampered.cellCountByDimension["1"] += 1;
    tampered.archiveHash = computeGeneralizedCompressionArchiveHash(tampered);
    const certificate = buildStreamedTrackBCertificate({
      oracle: data.oracle,
      candidate: data.candidate(8),
      generalizedCompression: tampered,
      linkScan: "stop-on-first-failure",
    });
    expect(certificate.status).toBe("failed");
    expect(certificate.conclusion).toBe("not-established");
    expect(certificate.fullK.quotientAspherical).toBe(false);
    expect(certificate.errors.join(" ")).toContain("cell counts disagree");
  });
});
