import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildGeneralizedCompressionCertificate } from "../src/davis/generalizedCompression";
import {
  sealExactConeOracleCertificate,
  type AsyncExactConeFeasibilityOracle,
  type ExactConeOracleRequest,
} from "../src/fibering/scalableHeightCone";
import {
  buildStreamedRank19AdaptivePointSearch,
  replayStreamedRank19AdaptiveRunnerArtifact,
  replayStreamedRank19AdaptivePointSearchReport,
  sealStreamedRank19AdaptiveRunnerArtifact,
} from "../src/fibering/streamedRank19Adaptive";
import {
  computeStreamedRank19GlobalNormalArtifactDigest,
  computeStreamedRank19GlobalNormalChunkDigest,
  replayStreamedRank19GlobalNormalCatalogue,
  replayStreamedRank19GlobalNormalCatalogueAgainstExactInputs,
  runStreamedRank19GlobalNormalCatalogue,
  type RunStreamedRank19GlobalNormalCatalogueOptions,
  type StreamedRank19GlobalNormalArtifact,
} from "../src/fibering/node/streamedRank19GlobalNormalCatalogue";
import type { StreamedH1CompleteLatticeCertificate } from "../src/fibering/streamedH1Completion";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  prepareStreamedTrackBLinearLinkTemplateStreamer,
  streamStreamedTrackBLinearLinkTemplates,
  type StreamedTrackBIntegralCocycleBasis,
} from "../src/fibering/streamedTrackB";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const RANK = 19;
const ADAPTIVE_TRANSCRIPT_DIGEST = canonicalSha256(
  "rank-19-adaptive-coordinate-oracle",
);

function universalRankFiveSystem(): CoxeterSystemInput {
  const generatorCount = 5;
  return {
    schemaVersion: 1,
    name: "Universal rank-five global-normal fixture",
    rank: generatorCount,
    generators: Array.from({ length: generatorCount }, (_unused, index) => ({
      id: `s${index}`,
      label: `s${index}`,
    })),
    coxeterMatrix: Array.from({ length: generatorCount }, (_unused, row) =>
      Array.from({ length: generatorCount }, (_entry, column) =>
        row === column ? 1 : "inf",
      ),
    ),
  };
}

function fixedPointFreeMatching(
  degree: number,
  pairs: readonly (readonly [number, number])[],
): number[] {
  const row = Array<number>(degree).fill(-1);
  for (const [left, right] of pairs) {
    row[left] = right;
    row[right] = left;
  }
  expect(row.every((image) => image >= 0)).toBe(true);
  return row;
}

function fixtureH1Certificate(input: {
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  coordinateIds: string[];
}): StreamedH1CompleteLatticeCertificate {
  const certificate = {
    schemaVersion: 1 as const,
    kind: "streamed-h1-complete-integral-lattice-certificate" as const,
    status: "passed" as const,
    method:
      "tree-gauge-split-kernel-plus-integral-core-frame-and-modular-rank" as const,
    oracleStructureHash: input.oracleStructureHash,
    actionRowsCanonicalSha256: input.actionRowsCanonicalSha256,
    preparationDigest: canonicalSha256("rank-19-fixture-preparation"),
    coreBasisCertificate: {
      schemaVersion: 1 as const,
      kind: "streamed-h1-integral-core-basis" as const,
      status: "passed" as const,
      format: "linbox-sparse-row-integral-basis" as const,
      sourceArtifactSha256: canonicalSha256("rank-19-fixture-core-source"),
      coreRowCount: 0,
      coreColumnCount: 0,
      rank: 15 as const,
      coordinateIds: input.coordinateIds.slice(4),
      identityCoreColumns: [],
      identityRestrictionDeterminant: "1" as const,
      vectors: [],
      maximumAbsoluteValue: 0,
      sparseBasisDigest: canonicalSha256("rank-19-fixture-core-basis"),
      checks: {
        dimensionsMatch: true,
        basisRowsCanonical: true,
        entriesStrictlyIncreasing: true,
        entriesNonzeroSafeIntegers: true,
        identityRestriction: true,
      },
    },
    modularRankWitnesses: [],
    fullLatticeBasisDigest: input.latticeBasisDigest,
    fullCocycleSectionDigest: input.cocycleSectionDigest,
    wallCoordinates: [],
    checks: {
      oracleBindingMatches: true,
      coreDimensionsMatch: true,
      exactCoreBoundaryReplay: true,
      coreIdentityMinor: true,
      modularWitnessesPresent: true,
      modularWitnessBindingsMatch: true,
      modularWitnessPrimes: true,
      modularWitnessPrimesDistinct: true,
      modularWitnessesExact: true,
      modularKernelFramesMatch: true,
      modularCoreRankIs87935: true,
      rationalBoundaryRankIs138222: true,
      fullBasisHasNineteenCoordinates: true,
      fullCoordinateMinorUnimodular: true,
      directedEdgeReversal: true,
      everyRankTwoBoundaryCloses: true,
    },
    replay: {
      coreBoundaryRowCount: 0,
      coreBoundaryNonzeroResidualCount: 0,
      coreBoundaryMaximumAbsoluteResidual: 0,
      coreBoundaryReplayDigest: canonicalSha256("rank-19-fixture-core-replay"),
      directedEdgeCount: 60,
      reversalFailureCount: 0,
      rankTwoBoundaryCount: 0,
      rankTwoBoundaryNonzeroResidualCount: 0,
      rankTwoBoundaryMaximumAbsoluteResidual: 0,
      fullBoundaryReplayDigest: canonicalSha256("rank-19-fixture-full-replay"),
    },
    result: {
      h1Rank: 19 as const,
      h1IsomorphicTo: "Z^19" as const,
      integralBasisIds: input.coordinateIds,
      wallSublatticeRank: 4 as const,
      wallSublatticeIndexInSaturation: 2 as const,
      wallSublatticeIndexInFullH1: "infinite" as const,
      wallSaturationRank: 4 as const,
      wallSaturationEqualsFullH1: false as const,
      quotientByWallLattice: "Z^15 + Z/2" as const,
    },
    claims: ["Synthetic software fixture only."],
    nonClaims: ["This is not the compact-5-cube H1 calculation."],
    errors: [],
  };
  return {
    ...certificate,
    certificateDigest: canonicalSha256(certificate),
  };
}

function rank19Fixture(): Omit<
  RunStreamedRank19GlobalNormalCatalogueOptions,
  "checkpointPath" | "chunkSize" | "maxChunksThisRun" | "onCheckpoint"
> {
  const system = universalRankFiveSystem();
  const degree = 12;
  const evenPairs = Array.from(
    { length: degree / 2 },
    (_unused, index) => [2 * index, 2 * index + 1] as const,
  );
  const oddPairs = Array.from(
    { length: degree / 2 },
    (_unused, index) =>
      [(2 * index + 1) % degree, (2 * index + 2) % degree] as const,
  );
  const evenMatching = fixedPointFreeMatching(degree, evenPairs);
  const generatorImages = [
    evenMatching,
    fixedPointFreeMatching(degree, oddPairs),
    [...evenMatching],
    [...evenMatching],
    [...evenMatching],
  ];
  const candidate: TorsionFreeActionCandidate = {
    id: "universal-rank-five-degree-twelve",
    index: degree,
    generatorImages,
    backend: "test-exact",
  };
  const torsionFree = certifyTorsionFreeAction(
    system,
    candidate,
    planSphericalSpecialSubgroups(system),
  );
  expect(torsionFree.status).toBe("passed");
  const generalizedCompression = buildGeneralizedCompressionCertificate(
    system,
    { candidate, certificate: torsionFree },
  );
  const oracle = buildStreamedLawfulDavisOracle({
    system,
    generatorImages,
  });

  // Five fixed-point-free involutions give 30 geometric edges. A spanning
  // tree uses 11 of them, leaving the required 30 - 12 + 1 = 19 periods.
  const parent = new Int32Array(oracle.degree);
  parent.fill(-1);
  parent[0] = 0;
  const queue = [0];
  const treeEdgeIndices = new Set<number>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const target = oracle.neighbor(point, generator);
      if (parent[target] !== -1) continue;
      parent[target] = point;
      queue.push(target);
      treeEdgeIndices.add(oracle.geometricEdge(point, generator).edgeIndex);
    }
  }
  expect(queue).toHaveLength(degree);
  const cotreeEdgeIndices: number[] = [];
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const geometric = oracle.geometricEdge(point, generator);
      if (
        geometric.sourcePoint === point &&
        !treeEdgeIndices.has(geometric.edgeIndex)
      ) {
        cotreeEdgeIndices.push(geometric.edgeIndex);
      }
    }
  }
  cotreeEdgeIndices.sort((left, right) => left - right);
  expect(cotreeEdgeIndices).toHaveLength(RANK);
  const coordinateByEdge = new Map(
    cotreeEdgeIndices.map((edgeIndex, coordinate) => [edgeIndex, coordinate]),
  );
  const coordinateIds = Array.from(
    { length: RANK },
    (_unused, index) => `eta${index}`,
  );
  const edgeCoordinatePairs = (point: number, generator: number) => {
    const geometric = oracle.geometricEdge(point, generator);
    const coordinate = coordinateByEdge.get(geometric.edgeIndex);
    if (coordinate === undefined) return [];
    return [
      [coordinate, geometric.sourcePoint === point ? 1 : -1] as const,
    ] as const;
  };
  const latticeBasisDigest = canonicalSha256({
    schemaVersion: 1,
    method: "universal-rank-five-tree-gauge-h1-basis",
    oracleStructureHash: oracle.structureHash,
    treeEdgeIndices: [...treeEdgeIndices].sort((left, right) => left - right),
    cotreeEdgeIndices,
    coordinateIds,
  });
  const expectedCocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(oracle, {
      coordinateIds,
      edgeCoordinatePairs,
    });
  const cocycleBasis: StreamedTrackBIntegralCocycleBasis = {
    coordinateIds,
    latticeBasisDigest,
    expectedCocycleSectionDigest,
    edgeCoordinatePairs,
  };
  const h1Certificate = fixtureH1Certificate({
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    latticeBasisDigest,
    cocycleSectionDigest: expectedCocycleSectionDigest,
    coordinateIds,
  });
  return {
    oracle,
    generalizedCompression,
    cocycleBasis,
    h1Certificate,
  };
}

function coordinateIndex(request: ExactConeOracleRequest, normal: string[]) {
  const nonzero = normal
    .map((value, index) => (value === "0" ? -1 : index))
    .filter((index) => index >= 0);
  expect(nonzero).toHaveLength(1);
  const coordinate = nonzero[0];
  expect(normal[coordinate]).toBe("1");
  expect(normal).toHaveLength(request.rank);
  return coordinate;
}

function rank19CoordinateOracle(): AsyncExactConeFeasibilityOracle {
  return {
    async solve(request) {
      const witness: number[] = Array(request.rank).fill(0);
      const equalityCoordinates = new Set<number>();
      const assignedCoordinates = new Set<number>();
      for (const assignment of request.assignments) {
        const coordinate = coordinateIndex(request, assignment.normal);
        assignedCoordinates.add(coordinate);
        if (assignment.sign === 0) {
          equalityCoordinates.add(coordinate);
        } else {
          witness[coordinate] = assignment.sign;
        }
      }
      if (equalityCoordinates.size === request.rank) {
        return sealExactConeOracleCertificate({
          schemaVersion: 1,
          kind: "external-exact-height-cone-certificate",
          requestHash: request.requestHash,
          backend: {
            id: "rank-19-adaptive-coordinate-fixture",
            version: "1",
            algorithm: "independent-coordinate-signs",
            transcriptSha256: ADAPTIVE_TRANSCRIPT_DIGEST,
          },
          result: {
            kind: "feasible",
            equalityRank: request.rank,
            dimension: 0,
            primitiveWitness: null,
          },
          certificateHash: "",
        });
      }
      if (
        witness.reduce((sum, coordinate) => sum + Math.abs(coordinate), 0) === 0
      ) {
        const freeCoordinate = Array.from(
          { length: request.rank },
          (_unused, index) => index,
        ).find((index) => !assignedCoordinates.has(index));
        if (freeCoordinate === undefined) {
          throw new Error("The coordinate fixture has no free nonzero ray.");
        }
        witness[freeCoordinate] = 1;
      }
      return sealExactConeOracleCertificate({
        schemaVersion: 1,
        kind: "external-exact-height-cone-certificate",
        requestHash: request.requestHash,
        backend: {
          id: "rank-19-adaptive-coordinate-fixture",
          version: "1",
          algorithm: "independent-coordinate-signs",
          transcriptSha256: ADAPTIVE_TRANSCRIPT_DIGEST,
        },
        result: {
          kind: "feasible",
          equalityRank: equalityCoordinates.size,
          dimension: request.rank - equalityCoordinates.size,
          primitiveWitness: witness.map(String),
        },
        certificateHash: "",
      });
    },
  };
}

async function withTemporaryDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(
    join(tmpdir(), "coxeter-rank19-normal-catalogue-"),
  );
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function requireArtifact(
  result: ReturnType<typeof runStreamedRank19GlobalNormalCatalogue>,
): StreamedRank19GlobalNormalArtifact {
  expect(result.status).toBe("completed");
  if (result.status !== "completed") {
    throw new Error("The rank-19 fixture did not complete.");
  }
  return result.artifact;
}

describe("checkpointed rank-19 global-normal catalogue", () => {
  it("checkpoints one contiguous chunk, resumes, and replays the final catalogue", async () => {
    await withTemporaryDirectory(async (directory) => {
      const fixture = rank19Fixture();
      const checkpointPath = join(directory, "catalogue.checkpoint.json");
      const first = runStreamedRank19GlobalNormalCatalogue({
        ...fixture,
        checkpointPath,
        chunkSize: 4,
        allowSmallChunksForTesting: true,
        maxChunksThisRun: 1,
      });
      expect(first).toMatchObject({
        status: "checkpointed",
        checkpoint: {
          degree: 12,
          rank: 19,
          nextPoint: 4,
          coverage: {
            pointCoverage: "contiguous-prefix",
            adjacencyIncluded: false,
            adjacencyCoverageClaimed: false,
            ascendingDescendingLinkCoverageClaimed: false,
          },
        },
      });
      if (first.status !== "checkpointed") return;
      expect(first.checkpoint.chunks).toHaveLength(1);
      expect(
        replayStreamedRank19GlobalNormalCatalogue(first.checkpoint),
      ).toMatchObject({ status: "passed", errors: [] });
      const stored = JSON.parse(await readFile(checkpointPath, "utf8"));
      expect(replayStreamedRank19GlobalNormalCatalogue(stored).status).toBe(
        "passed",
      );

      const artifact = requireArtifact(
        runStreamedRank19GlobalNormalCatalogue({
          ...fixture,
          checkpointPath,
          chunkSize: 4,
          allowSmallChunksForTesting: true,
        }),
      );
      expect(artifact).toMatchObject({
        degree: 12,
        rank: 19,
        nextPoint: 12,
        normalCount: 19,
        identicallyZeroGermCount: 22,
        coverage: {
          pointCoverage: "all-quotient-points",
          adjacencyIncluded: false,
          adjacencyCoverageClaimed: false,
          ascendingDescendingLinkCoverageClaimed: false,
        },
      });
      expect(artifact.chunks).toHaveLength(3);
      expect(artifact.germOccurrenceCount).toBe(60);
      expect(
        artifact.normalCatalogue.every(
          (entry) =>
            entry.primitiveNormal.length === 19 && entry.occurrenceCount === 2,
        ),
      ).toBe(true);
      expect(replayStreamedRank19GlobalNormalCatalogue(artifact)).toMatchObject(
        { status: "passed", errors: [] },
      );
    });
  });

  it("refuses a checkpoint after any structural H1 binding changes", async () => {
    await withTemporaryDirectory(async (directory) => {
      const fixture = rank19Fixture();
      const checkpointPath = join(directory, "stale.checkpoint.json");
      runStreamedRank19GlobalNormalCatalogue({
        ...fixture,
        checkpointPath,
        chunkSize: 4,
        allowSmallChunksForTesting: true,
        maxChunksThisRun: 1,
      });
      const { certificateDigest: _oldDigest, ...changedCertificatePayload } =
        structuredClone(fixture.h1Certificate);
      expect(_oldDigest).toBe(fixture.h1Certificate.certificateDigest);
      changedCertificatePayload.claims = [
        ...changedCertificatePayload.claims,
        "A distinct, still internally sealed test certificate.",
      ];
      const changedCertificate = {
        ...changedCertificatePayload,
        certificateDigest: canonicalSha256(changedCertificatePayload),
      };
      expect(() =>
        runStreamedRank19GlobalNormalCatalogue({
          ...fixture,
          h1Certificate: changedCertificate,
          checkpointPath,
          chunkSize: 4,
          allowSmallChunksForTesting: true,
        }),
      ).toThrow(/another exact source\/H1 binding/u);
    });
  });

  it("pure replay rejects gaps, adjacency claims, and altered aggregates", async () => {
    await withTemporaryDirectory(async (directory) => {
      const fixture = rank19Fixture();
      const artifact = requireArtifact(
        runStreamedRank19GlobalNormalCatalogue({
          ...fixture,
          checkpointPath: join(directory, "complete.checkpoint.json"),
          chunkSize: 4,
          allowSmallChunksForTesting: true,
        }),
      );

      const gap = structuredClone(artifact);
      gap.chunks[1].firstPoint = 0;
      expect(replayStreamedRank19GlobalNormalCatalogue(gap)).toMatchObject({
        status: "failed",
        checks: { gapFreePointCoverage: false },
      });

      const adjacency = structuredClone(artifact);
      adjacency.chunks[0].streamReport.adjacencyIncluded = true;
      expect(
        replayStreamedRank19GlobalNormalCatalogue(adjacency),
      ).toMatchObject({
        status: "failed",
        checks: { everyChunkStreamReportValid: false },
      });

      const aggregate = structuredClone(artifact);
      aggregate.normalCatalogue[0].occurrenceCount += 1;
      expect(
        replayStreamedRank19GlobalNormalCatalogue(aggregate),
      ).toMatchObject({
        status: "failed",
        checks: { catalogueAndCountsRecomputed: false },
      });
    });
  });

  it("regenerates every chunk and rejects an internally resealed catalogue", async () => {
    await withTemporaryDirectory(async (directory) => {
      const fixture = rank19Fixture();
      const artifact = requireArtifact(
        runStreamedRank19GlobalNormalCatalogue({
          ...fixture,
          checkpointPath: join(directory, "exact-replay.checkpoint.json"),
          chunkSize: 4,
          allowSmallChunksForTesting: true,
        }),
      );
      expect(
        replayStreamedRank19GlobalNormalCatalogueAgainstExactInputs(
          artifact,
          fixture,
        ),
      ).toMatchObject({
        status: "passed",
        checks: {
          storedCatalogueReplayPassed: true,
          freshMathematicalBindingMatches: true,
          everyChunkRegenerated: true,
          everyRegeneratedChunkMatchesStored: true,
        },
        chunkCount: 3,
        regeneratedChunkCount: 3,
        errors: [],
      });

      const {
        certificateDigest: archivedCertificateDigest,
        ...currentCertificatePayload
      } = structuredClone(fixture.h1Certificate);
      currentCertificatePayload.claims = [
        ...currentCertificatePayload.claims,
        "A provenance-only certificate reseal must remain separate.",
      ];
      const currentCertificate = {
        ...currentCertificatePayload,
        certificateDigest: canonicalSha256(currentCertificatePayload),
      };
      const provenanceReplay =
        replayStreamedRank19GlobalNormalCatalogueAgainstExactInputs(artifact, {
          ...fixture,
          h1Certificate: currentCertificate,
        });
      expect(currentCertificate.certificateDigest).not.toBe(
        archivedCertificateDigest,
      );
      expect(provenanceReplay).toMatchObject({
        status: "passed",
        storedCompletionCertificateDigest: archivedCertificateDigest,
        freshCompletionCertificateDigest: currentCertificate.certificateDigest,
        checks: { freshMathematicalBindingMatches: true },
      });

      const changedPreparationPayload = {
        ...currentCertificatePayload,
        preparationDigest: canonicalSha256("different H1 preparation"),
      };
      const changedPreparation = {
        ...changedPreparationPayload,
        certificateDigest: canonicalSha256(changedPreparationPayload),
      };
      expect(
        replayStreamedRank19GlobalNormalCatalogueAgainstExactInputs(artifact, {
          ...fixture,
          h1Certificate: changedPreparation,
        }),
      ).toMatchObject({
        status: "failed",
        checks: { freshMathematicalBindingMatches: false },
        regeneratedChunkCount: 0,
      });

      // A self-digest proves internal consistency only. Reseal a plausible
      // first-occurrence label all the way through the aggregate artifact;
      // pure replay accepts it, while source regeneration must reject it.
      const forged = structuredClone(artifact);
      const forgedChunk = forged.chunks[0];
      const forgedEntry = forgedChunk.normalCatalogue[0];
      forgedEntry.firstOccurrence.germId = "forged-but-well-formed-germ-id";
      forgedChunk.normalCatalogueDigest = canonicalSha256(
        forgedChunk.normalCatalogue,
      );
      forgedChunk.chunkDigest =
        computeStreamedRank19GlobalNormalChunkDigest(forgedChunk);
      const globalEntry = forged.normalCatalogue.find(
        (entry) => entry.normalKey === forgedEntry.normalKey,
      );
      expect(globalEntry).toBeDefined();
      if (globalEntry === undefined) return;
      globalEntry.firstOccurrence = { ...forgedEntry.firstOccurrence };
      forged.normalCatalogueDigest = canonicalSha256(forged.normalCatalogue);
      forged.chunkManifestDigest = canonicalSha256({
        schemaVersion: 1,
        method: "gap-free-contiguous-no-adjacency-template-chunk-manifest",
        chunks: forged.chunks.map((chunk) => ({
          chunkIndex: chunk.chunkIndex,
          firstPoint: chunk.firstPoint,
          lastPointExclusive: chunk.lastPointExclusive,
          templateRecordDigest: chunk.templateRecordDigest,
          streamReportHash: chunk.streamReportHash,
          normalCatalogueDigest: chunk.normalCatalogueDigest,
          chunkDigest: chunk.chunkDigest,
        })),
      });
      forged.artifactDigest =
        computeStreamedRank19GlobalNormalArtifactDigest(forged);

      expect(replayStreamedRank19GlobalNormalCatalogue(forged)).toMatchObject({
        status: "passed",
        errors: [],
      });
      expect(
        replayStreamedRank19GlobalNormalCatalogueAgainstExactInputs(
          forged,
          fixture,
        ),
      ).toMatchObject({
        status: "failed",
        checks: {
          storedCatalogueReplayPassed: true,
          freshMathematicalBindingMatches: true,
          everyChunkRegenerated: false,
          everyRegeneratedChunkMatchesStored: false,
        },
        regeneratedChunkCount: 1,
      });
    });
  });
});

describe("standalone rank-19 adaptive report replay", () => {
  it("packs the integral section once across repeated template batches", () => {
    const fixture = rank19Fixture();
    let edgeCoordinateCallCount = 0;
    const originalPairs = fixture.cocycleBasis.edgeCoordinatePairs;
    const countingBasis: StreamedTrackBIntegralCocycleBasis = {
      ...fixture.cocycleBasis,
      edgeCoordinatePairs(point, generator) {
        edgeCoordinateCallCount += 1;
        return originalPairs(point, generator);
      },
    };
    const streamer = prepareStreamedTrackBLinearLinkTemplateStreamer({
      oracle: fixture.oracle,
      generalizedCompression: fixture.generalizedCompression,
      cocycleBasis: countingBasis,
    });
    const preparationCalls =
      fixture.oracle.degree * fixture.oracle.generatorCount;
    expect(edgeCoordinateCallCount).toBe(preparationCalls);

    const firstDigests: string[] = [];
    streamer.stream({ points: [0, 1], includeAdjacency: true }, (template) => {
      firstDigests.push(template.templateDigest);
    });
    const secondDigests: string[] = [];
    streamer.stream({ points: [2, 3], includeAdjacency: true }, (template) => {
      secondDigests.push(template.templateDigest);
    });
    expect(edgeCoordinateCallCount).toBe(preparationCalls);
    expect(streamer.statistics()).toMatchObject({
      preparationCount: 1,
      streamInvocationCount: 2,
      streamedPointCount: 4,
    });

    const legacyDigests: string[] = [];
    streamStreamedTrackBLinearLinkTemplates(
      {
        oracle: fixture.oracle,
        generalizedCompression: fixture.generalizedCompression,
        cocycleBasis: fixture.cocycleBasis,
        points: [0, 1],
        includeAdjacency: true,
      },
      (template) => {
        legacyDigests.push(template.templateDigest);
      },
    );
    expect(firstDigests).toEqual(legacyDigests);
    expect(secondDigests).toHaveLength(2);
  });

  it("replays both polarities and rejects digest and positive-cover tampering", async () => {
    const fixture = rank19Fixture();
    const report = await buildStreamedRank19AdaptivePointSearch({
      ...fixture,
      exactConeOracle: rank19CoordinateOracle(),
      initialPointIds: [0, 1, 2, 3],
    });

    expect(report).toMatchObject({
      schemaVersion: 3,
      status: "invariant-obstruction-cover",
      search: {
        schemaVersion: 2,
        iterations: [{ exploration: { kind: "complete-obstruction-cover" } }],
      },
      polarityCertification: {
        kind: "explicit-antipodal-obstruction-cover",
      },
      checks: {
        negativeFinalObjectReplayed: true,
        positiveAntipodeReplayed: true,
        explicitPolarityTransportBound: true,
      },
      templateStreaming: {
        preparationCount: 1,
        streamInvocationCount: 1,
        streamedPointCount: 4,
        batches: [
          {
            purpose: "selected-point-preload",
            requestedPointIds: [0, 1, 2, 3],
            stream: { checkedPointCount: 4 },
          },
        ],
      },
    });
    expect(
      replayStreamedRank19AdaptivePointSearchReport(report, fixture),
    ).toMatchObject({ status: "passed", errors: [] });

    const artifact = sealStreamedRank19AdaptiveRunnerArtifact(report, {
      fixture: "rank-19-adaptive-replay",
    });
    expect(
      replayStreamedRank19AdaptiveRunnerArtifact(artifact, fixture),
    ).toMatchObject({
      status: "passed",
      storedArtifactDigestValid: true,
      reportReplay: { status: "passed" },
    });
    const badArtifact = structuredClone(artifact);
    badArtifact.runner.fixture = "tampered-runner-provenance";
    expect(
      replayStreamedRank19AdaptiveRunnerArtifact(badArtifact, fixture),
    ).toMatchObject({
      status: "failed",
      storedArtifactDigestValid: false,
    });

    const wrongH1 = structuredClone(fixture.h1Certificate);
    wrongH1.oracleStructureHash = canonicalSha256("wrong-H1-oracle");
    const wrongH1Payload: Record<string, unknown> = { ...wrongH1 };
    Reflect.deleteProperty(wrongH1Payload, "certificateDigest");
    wrongH1.certificateDigest = canonicalSha256(wrongH1Payload);
    expect(
      replayStreamedRank19AdaptivePointSearchReport(report, {
        ...fixture,
        h1Certificate: wrongH1,
      }),
    ).toMatchObject({
      status: "failed",
      checks: { h1AndSourceBound: false },
    });

    const badDigest = structuredClone(report);
    badDigest.reportDigest = canonicalSha256("tampered-report-digest");
    expect(
      replayStreamedRank19AdaptivePointSearchReport(badDigest, fixture),
    ).toMatchObject({
      status: "failed",
      checks: { reportDigestValid: false },
    });

    const badPositiveCover = structuredClone(report);
    if (
      badPositiveCover.polarityCertification.kind !==
      "explicit-antipodal-obstruction-cover"
    ) {
      throw new Error("The fixture did not produce an antipodal cover.");
    }
    badPositiveCover.polarityCertification.positiveCover.coverHash =
      canonicalSha256("tampered-positive-cover");
    badPositiveCover.reportDigest = canonicalSha256({
      ...badPositiveCover,
      reportDigest: "",
    });
    expect(
      replayStreamedRank19AdaptivePointSearchReport(badPositiveCover, fixture),
    ).toMatchObject({
      status: "failed",
      checks: {
        reportDigestValid: true,
        positiveAntipodeReplayed: false,
      },
    });

    const missingFinalCover = structuredClone(report);
    missingFinalCover.search.finalCover = null;
    missingFinalCover.search.resultDigest = canonicalSha256({
      ...missingFinalCover.search,
      resultDigest: "",
    });
    missingFinalCover.reportDigest = canonicalSha256({
      ...missingFinalCover,
      reportDigest: "",
    });
    expect(
      replayStreamedRank19AdaptivePointSearchReport(missingFinalCover, fixture),
    ).toMatchObject({
      status: "failed",
      checks: { searchEnvelopeValid: false },
    });

    const emptyBatchHistory = structuredClone(report);
    emptyBatchHistory.templateStreaming.batches = [];
    emptyBatchHistory.templateStreaming.streamInvocationCount = 0;
    emptyBatchHistory.templateStreaming.streamedPointCount = 0;
    emptyBatchHistory.templateStreaming.batchDigest = canonicalSha256([]);
    emptyBatchHistory.reportDigest = canonicalSha256({
      ...emptyBatchHistory,
      reportDigest: "",
    });
    expect(
      replayStreamedRank19AdaptivePointSearchReport(emptyBatchHistory, fixture),
    ).toMatchObject({
      status: "failed",
      checks: { templateRecordsReplayed: false },
    });

    const falseSourceReplay = structuredClone(report);
    const forgedBatch = falseSourceReplay.templateStreaming.batches[0];
    forgedBatch.stream.checks.sourceReplayed = false;
    forgedBatch.stream.errors = ["forged source failure"];
    forgedBatch.stream.reportHash = canonicalSha256({
      ...forgedBatch.stream,
      reportHash: "",
    });
    forgedBatch.batchDigest = canonicalSha256({
      ...forgedBatch,
      batchDigest: "",
    });
    falseSourceReplay.templateStreaming.batchDigest = canonicalSha256(
      falseSourceReplay.templateStreaming.batches,
    );
    falseSourceReplay.reportDigest = canonicalSha256({
      ...falseSourceReplay,
      reportDigest: "",
    });
    expect(
      replayStreamedRank19AdaptivePointSearchReport(falseSourceReplay, fixture),
    ).toMatchObject({
      status: "failed",
      checks: { templateRecordsReplayed: false },
    });

    const forgedStaticEnvelope = structuredClone(report);
    const staticBatch = forgedStaticEnvelope.templateStreaming.batches[0];
    staticBatch.stream.cocycleClosureDigest = canonicalSha256(
      "forged closure digest",
    );
    staticBatch.stream.reportHash = canonicalSha256({
      ...staticBatch.stream,
      reportHash: "",
    });
    staticBatch.batchDigest = canonicalSha256({
      ...staticBatch,
      batchDigest: "",
    });
    forgedStaticEnvelope.templateStreaming.batchDigest = canonicalSha256(
      forgedStaticEnvelope.templateStreaming.batches,
    );
    forgedStaticEnvelope.reportDigest = canonicalSha256({
      ...forgedStaticEnvelope,
      reportDigest: "",
    });
    expect(
      replayStreamedRank19AdaptivePointSearchReport(
        forgedStaticEnvelope,
        fixture,
      ),
    ).toMatchObject({
      status: "failed",
      checks: { templateRecordsReplayed: false },
    });
  }, 30_000);
});
