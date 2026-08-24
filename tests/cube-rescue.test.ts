import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  computeCubeRescueLocalTemplateDigest,
  cubeRescueTemplateHeightScale,
  evaluateCubeRescueLocalTemplate,
  extractCubeRescueSeparatorMotifs,
  readCubeRescueTemplateDerivedCacheMetrics,
  resetCubeRescueTemplateDerivedCacheMetrics,
  searchCubeRescuePeriodicPotential,
  searchCubeRescuePeriodicPotentialMaterializedProvisionalReference,
  searchCubeRescuePeriodicPotentialUnpreparedReference,
  type CubeRescueAffineLinkVertex,
  type CubeRescueLocalTemplate,
} from "../src/fibering/cubeRescue";
import {
  auditCubeRescueCompressionBinding,
  buildCubeRescueVertexOrder,
  cubeRescueMaximalSimplexCenterId,
  cubeRescueSubdivisionVertexLinksAreCertified,
  type CubeRescueSubdivisionVertexLinkCertificate,
} from "../src/fibering/cubeRescueTopology";
import { runCubeRescueOriginalVertexCegar } from "../src/fibering/cubeRescueCegar";
import {
  CUBE_RESCUE_ALGORITHM_REVISION,
  auditCubeRescuePortfolioStructure,
  commitCubeRescuePotentialSearch,
  computeCubeRescueTrialId,
  cubeRescueTrialDigestIsValid,
  parseCubeRescueGenerationCheckpoint,
  replayCompactCubeBoundedRescueCertificate,
  sealCompactCubeBoundedRescueCertificate,
  sealCubeRescueGenerationCheckpoint,
  sealCubeRescueTrialRecord,
  selectBestCubeRescueTrialId,
  type CubeRescueTrialRecord,
} from "../src/fibering/cubeRescueCertificate";
import type { GeneralizedCompressionCertificate } from "../src/davis/generalizedCompression";
import { loadCubeRescueAdaptiveArchive } from "../src/fibering/node/cubeRescueArchive";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const DIGEST = canonicalSha256("cube-rescue-test");

function subdivisionLinkCertificate(options: {
  family: "pulling" | "maximal-simplex-stellar";
  orderId?: string;
  orderDigest?: string;
  sourceDigest?: string;
}): CubeRescueSubdivisionVertexLinkCertificate {
  const stellar = options.family === "maximal-simplex-stellar";
  const payload = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-subdivision-vertex-link-certificate" as const,
    status: stellar
      ? ("certified" as const)
      : ("not-applicable-no-introduced-vertices" as const),
    subdivisionFamily: options.family,
    orderId: options.orderId ?? "test-order",
    orderDigest: options.orderDigest ?? DIGEST,
    sourceDigest: options.sourceDigest ?? DIGEST,
    construction: stellar
      ? ("stellar-centers-of-global-maximal-pulling-simplices" as const)
      : ("global-regular-pulling-with-no-new-vertices" as const),
    maximalSourceCellTypeCount: 1,
    maximalSourceCellDimensionMinimum: 5,
    maximalSourceCellDimensionMaximum: 5,
    checks: {
      orderRanksAreDistinct: true,
      maximalSourceCellsHaveDimensionAtLeastTwo: true,
      centerIdsDependOnlyOnGlobalSimplexIds: true,
      centerAffineNumeratorIsSourceVertexSum: true,
      centerTieNumeratorIsSourceRankDifferenceSum: true,
      centerMicroTieIsNonzeroTertiary: true,
      centerLinkIsSourceSimplexBoundary: true,
      centerHeightIsStrictlyBetweenSourceExtrema: true,
      ascendingAndDescendingCenterLinksAreNonemptyContractibleFaces: true,
    },
    conclusion: stellar
      ? ("Every introduced center has nonempty contractible ascending and descending links." as const)
      : ("The pulling family introduces no subdivision vertices." as const),
  };
  return { ...payload, certificateDigest: canonicalSha256(payload) };
}

function template(options: {
  degree?: number;
  point?: number;
  vertices: CubeRescueAffineLinkVertex[];
  edges: Array<[number, number]>;
}): CubeRescueLocalTemplate {
  const value: CubeRescueLocalTemplate = {
    schemaVersion: 1,
    kind: "compact-5-cube-rescue-local-link-template",
    point: options.point ?? 0,
    rank: 1,
    degree: options.degree ?? 6,
    orderId: "test-order",
    orderDigest: DIGEST,
    subdivisionFamily: "pulling",
    vertices: options.vertices,
    edges: options.edges,
    introducedVertexCount: options.vertices.filter(
      ({ sourceKind }) => sourceKind !== "pulling-germ",
    ).length,
    sourceTopologyDigest: DIGEST,
    templateDigest: "",
  };
  value.templateDigest = computeCubeRescueLocalTemplateDigest(value);
  return value;
}

function vertex(
  id: string,
  character: string,
  options: Partial<CubeRescueAffineLinkVertex> = {},
): CubeRescueAffineLinkVertex {
  return {
    id,
    sourceKind: "pulling-germ",
    characterNumeratorPairs: character === "0" ? [] : [[0, character]],
    potentialNumeratorPairs: [],
    tieNumerator: 0,
    microTie: 0,
    ...options,
  };
}

describe("bounded compact-cube rescue", () => {
  it("uses a common scale strictly larger than every stellar tie", () => {
    const local = template({
      degree: 34_560,
      vertices: [
        vertex("large-negative-tie", "1", {
          sourceKind: "maximal-simplex-stellar",
          tieNumerator: -200_000,
        }),
        vertex("large-positive-tie", "-1", {
          sourceKind: "maximal-simplex-stellar",
          tieNumerator: 200_000,
        }),
      ],
      edges: [[0, 1]],
    });
    expect(cubeRescueTemplateHeightScale(local)).toBe(200_001n);
    const result = evaluateCubeRescueLocalTemplate({
      template: local,
      primitiveWitness: ["1"],
      potential: new Map(),
      sigma: 1,
    });
    expect(result.ascendingComponents).toEqual([["large-negative-tie"]]);
    expect(result.descendingComponents).toEqual([["large-positive-tie"]]);
    expect(result.failures).toEqual([]);
  });

  it("binds cached adjacency and height scale to the current template digest", () => {
    resetCubeRescueTemplateDerivedCacheMetrics();
    const local = template({
      vertices: [vertex("a", "1"), vertex("b", "1"), vertex("negative", "-1")],
      edges: [
        [0, 2],
        [1, 2],
      ],
    });
    const options = {
      template: local,
      primitiveWitness: ["1"],
      potential: new Map<number, bigint>(),
      sigma: 1 as const,
    };
    const cold = evaluateCubeRescueLocalTemplate(options);
    const warm = evaluateCubeRescueLocalTemplate(options);
    expect(warm).toEqual(cold);
    expect(readCubeRescueTemplateDerivedCacheMetrics()).toMatchObject({
      adjacencyHits: 1,
      adjacencyMisses: 1,
      heightScaleHits: 1,
      heightScaleMisses: 1,
      digestInvalidations: 0,
    });
    expect(cold.failures).toContain("ascending-disconnected");
    expect(cubeRescueTemplateHeightScale(local)).toBe(1n);

    local.edges = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    local.vertices[0].tieNumerator = 500;
    expect(() => evaluateCubeRescueLocalTemplate(options)).toThrow(
      /template digest is stale/u,
    );

    local.templateDigest = computeCubeRescueLocalTemplateDigest(local);
    const resealed = evaluateCubeRescueLocalTemplate(options);
    expect(resealed.failures).toEqual([]);
    expect(resealed.evaluationDigest).not.toBe(cold.evaluationDigest);
    expect(cubeRescueTemplateHeightScale(local)).toBe(501n);
    expect(evaluateCubeRescueLocalTemplate(options)).toEqual(resealed);
    expect(readCubeRescueTemplateDerivedCacheMetrics()).toMatchObject({
      adjacencyHits: 2,
      adjacencyMisses: 2,
      heightScaleHits: 4,
      heightScaleMisses: 2,
      digestInvalidations: 1,
    });
  });

  it("finds an exact periodic-potential connector in a synthetic separator motif", () => {
    const local = template({
      vertices: [
        vertex("a", "1"),
        vertex("b", "1"),
        vertex("connector", "-1", {
          potentialNumeratorPairs: [
            [0, "-1"],
            [3, "1"],
          ],
          tieNumerator: 1,
        }),
        vertex("negative-anchor", "-2"),
      ],
      edges: [
        [0, 2],
        [1, 2],
        [2, 3],
      ],
    });
    const initial = evaluateCubeRescueLocalTemplate({
      template: local,
      primitiveWitness: ["1"],
      potential: new Map(),
      sigma: 1,
    });
    expect(initial.failures).toContain("ascending-disconnected");
    const searchOptions = {
      templates: [local],
      primitiveWitness: ["1"],
      sigma: 1 as const,
      bounds: {
        maxIterations: 3,
        beamWidth: 3,
        maxStates: 64,
        maxVariablesPerFailure: 4,
        maxCandidateValuesPerVariable: 7,
        maxAbsolutePotential: 8,
      },
    };
    const result = searchCubeRescuePeriodicPotential(searchOptions);
    const unprepared =
      searchCubeRescuePeriodicPotentialUnpreparedReference(searchOptions);
    const materializedProvisional =
      searchCubeRescuePeriodicPotentialMaterializedProvisionalReference(
        searchOptions,
      );
    expect(result).toEqual(unprepared);
    expect(result).toEqual(materializedProvisional);
    expect(result).toMatchObject({
      schemaVersion: 2,
      method:
        "separator-path-threshold-beam-search-v2-potential-digest-tiebreak",
    });
    const materializedScore = [
      result.evaluations.reduce(
        (total, evaluation) => total + evaluation.failures.length,
        0,
      ),
      result.evaluations.reduce(
        (total, evaluation) =>
          total +
          evaluation.failures.filter((failure) => failure.endsWith("empty"))
            .length,
        0,
      ),
      result.evaluations.reduce(
        (total, evaluation) =>
          total +
          Math.max(0, evaluation.ascendingComponentCount - 1) +
          Math.max(0, evaluation.descendingComponentCount - 1),
        0,
      ),
    ];
    expect(result.bestScore).toEqual(materializedScore);
    expect(result.status).toBe("connector-found");
    expect(result.iterationCount).toBe(1);
    expect(result.evaluations[0].failures).toEqual([]);
    const commitment = commitCubeRescuePotentialSearch(result);
    expect(commitment).toMatchObject({
      schemaVersion: 1,
      kind: "bounded-exact-periodic-potential-search-commitment",
      status: "connector-found",
      fullResultDigest: result.searchDigest,
      evaluationDigests: [result.evaluations[0].evaluationDigest],
    });
    expect(JSON.stringify(commitment).length).toBeLessThan(
      JSON.stringify(result).length,
    );
  });

  it("constructs compatible total-order permutations, including literal reverse", () => {
    const numeric = buildCubeRescueVertexOrder(12, "numeric");
    const reverse = buildCubeRescueVertexOrder(12, "reverse");
    const affine = buildCubeRescueVertexOrder(12, "affine-7");
    expect(Array.from(numeric.rankByPoint)).toEqual(
      Array.from({ length: 12 }, (_unused, point) => point),
    );
    expect(Array.from(reverse.rankByPoint)).toEqual(
      Array.from({ length: 12 }, (_unused, point) => 11 - point),
    );
    expect(new Set(affine.rankByPoint).size).toBe(12);
    expect(() =>
      buildCubeRescueVertexOrder(12, "unsupported" as "numeric"),
    ).toThrow(/Unsupported rescue pulling order/u);
  });

  it("uses global maximal-simplex center identities and certifies their new links", () => {
    const source = "cube-rescue:pulling-simplex5:ambient-17:1,4,9,12,20,31";
    expect(cubeRescueMaximalSimplexCenterId(source)).toBe(
      cubeRescueMaximalSimplexCenterId(source),
    );
    expect(cubeRescueMaximalSimplexCenterId(source)).not.toContain(":at-q");
    expect(cubeRescueMaximalSimplexCenterId(`${source},32`)).not.toBe(
      cubeRescueMaximalSimplexCenterId(source),
    );
    const lemma = subdivisionLinkCertificate({
      family: "maximal-simplex-stellar",
    });
    expect(cubeRescueSubdivisionVertexLinksAreCertified(lemma)).toBe(true);
    const tampered = structuredClone(lemma);
    tampered.checks.centerHeightIsStrictlyBetweenSourceExtrema = false;
    expect(cubeRescueSubdivisionVertexLinksAreCertified(tampered)).toBe(false);
  });

  it("runs active-constraint CEGAR through an exhaustive original-vertex scan", () => {
    const passing = (point: number) =>
      template({
        degree: 4,
        point,
        vertices: [
          vertex(`positive-${point}`, "1"),
          vertex(`negative-${point}`, "-1"),
        ],
        edges: [[0, 1]],
      });
    const failingThenRepairable = template({
      degree: 4,
      point: 1,
      vertices: [
        vertex("a", "1"),
        vertex("b", "1"),
        vertex("connector", "-1", {
          potentialNumeratorPairs: [
            [0, "-1"],
            [3, "1"],
          ],
          tieNumerator: 1,
        }),
        vertex("negative-anchor", "-2"),
      ],
      edges: [
        [0, 2],
        [1, 2],
        [2, 3],
      ],
    });
    const order = {
      ...buildCubeRescueVertexOrder(4, "numeric"),
      id: "test-order",
      orderDigest: DIGEST,
    };
    const result = runCubeRescueOriginalVertexCegar({
      builder: {
        order,
        sourceDigest: DIGEST,
        subdivisionVertexLinks: {
          pulling: subdivisionLinkCertificate({ family: "pulling" }),
          "maximal-simplex-stellar": subdivisionLinkCertificate({
            family: "maximal-simplex-stellar",
          }),
        },
        build(point) {
          return point === 1 ? failingThenRepairable : passing(point);
        },
      },
      subdivisionFamily: "pulling",
      primitiveWitness: ["1"],
      sigma: 1,
      initialPointIds: [0],
      initialPotential: {
        values: [],
        potentialDigest: canonicalSha256({
          method: "quotient-periodic-integral-zero-cochain",
          values: [],
        }),
      },
      bounds: {
        maxRounds: 2,
        maxCounterexamplesPerRound: 1,
        constraintSearchBounds: {
          maxIterations: 3,
          beamWidth: 3,
          maxStates: 64,
          maxVariablesPerFailure: 4,
          maxCandidateValuesPerVariable: 7,
          maxAbsolutePotential: 8,
        },
      },
    });
    expect(result.rounds[0].scan).toMatchObject({
      status: "counterexample-found",
      checkedPointCount: 2,
      counterexamplePointIds: [1],
    });
    expect(result.status).toBe("all-original-vertices-pass");
    expect(result.rounds[1].scan).toMatchObject({
      status: "all-original-vertices-pass",
      checkedPointCount: 4,
    });
  });

  it("extracts every separator leaf from the tracked sealed adaptive archive", () => {
    const loaded = loadCubeRescueAdaptiveArchive({
      archive:
        "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.json.gz",
      manifest:
        "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.archive.json",
    });
    const extraction = extractCubeRescueSeparatorMotifs(loaded.artifact);
    expect(extraction.terminalPruneCount).toBe(38);
    expect(extraction.pointCensus).toEqual([
      { point: 2, count: 13 },
      { point: 4, count: 5 },
      { point: 27, count: 20 },
    ]);
    expect(
      new Set(extraction.motifs.map(({ coneDimension }) => coneDimension)),
    ).toEqual(
      new Set(Array.from({ length: 19 }, (_unused, index) => index + 1)),
    );
  });

  it("rebuilds omitted link payloads and rejects a re-sealed false commitment", () => {
    const loaded = loadCubeRescueAdaptiveArchive({
      archive:
        "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.json.gz",
      manifest:
        "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.archive.json",
    });
    const extraction = extractCubeRescueSeparatorMotifs(loaded.artifact);
    const motif = extraction.motifs[0];
    const witnessIndex = motif.primitiveWitness.findIndex(
      (value) => value !== "0",
    );
    expect(witnessIndex).toBeGreaterThanOrEqual(0);
    const order = buildCubeRescueVertexOrder(34_560, "numeric");
    const localPointIds = [2, 4, 27];
    const templates = new Map(
      localPointIds.map((point) => {
        const local = template({
          degree: 34_560,
          point,
          vertices: [
            vertex(`positive-a-${point}`, "0", {
              characterNumeratorPairs: [[witnessIndex, "1"]],
            }),
            vertex(`positive-b-${point}`, "0", {
              characterNumeratorPairs: [[witnessIndex, "1"]],
            }),
            vertex(`negative-${point}`, "0", {
              characterNumeratorPairs: [[witnessIndex, "-1"]],
            }),
          ],
          edges: [
            [0, 2],
            [1, 2],
          ],
        });
        local.rank = 19;
        local.orderId = order.id;
        local.orderDigest = order.orderDigest;
        local.templateDigest = computeCubeRescueLocalTemplateDigest(local);
        return [point, local] as const;
      }),
    );
    const builder = {
      order,
      sourceDigest: DIGEST,
      subdivisionVertexLinks: {
        pulling: subdivisionLinkCertificate({
          family: "pulling",
          orderId: order.id,
          orderDigest: order.orderDigest,
        }),
        "maximal-simplex-stellar": subdivisionLinkCertificate({
          family: "maximal-simplex-stellar",
          orderId: order.id,
          orderDigest: order.orderDigest,
        }),
      },
      build(point: number, family: "pulling" | "maximal-simplex-stellar") {
        if (family !== "pulling" || !templates.has(point)) {
          throw new Error("Unexpected synthetic replay template.");
        }
        return templates.get(point)!;
      },
    };
    const localBounds = {
      maxIterations: 1,
      beamWidth: 1,
      maxStates: 2,
      maxVariablesPerFailure: 1,
      maxCandidateValuesPerVariable: 1,
      maxAbsolutePotential: 1,
    };
    const globalCegarBounds = {
      maxRounds: 1,
      maxCounterexamplesPerRound: 1,
      constraintSearchBounds: localBounds,
    };
    const replayedSearch = searchCubeRescuePeriodicPotential({
      templates: localPointIds.map((point) => templates.get(point)!),
      primitiveWitness: motif.primitiveWitness,
      sigma: motif.sigma,
      bounds: localBounds,
    });
    expect(replayedSearch.status).toBe("not-found-within-bounds");
    const trial = sealCubeRescueTrialRecord({
      trialId: computeCubeRescueTrialId({
        sourceMotifId: motif.motifId,
        orderDigest: order.orderDigest,
        subdivisionFamily: "pulling",
        localPointIds,
        localBounds,
        globalCegarBounds,
      }),
      sourceMotifId: motif.motifId,
      primitiveWitness: [...motif.primitiveWitness],
      sigma: motif.sigma,
      orderKind: "numeric",
      orderId: order.id,
      orderDigest: order.orderDigest,
      subdivisionFamily: "pulling",
      localPointIds,
      localTemplateDigests: localPointIds.map(
        (point) => templates.get(point)!.templateDigest,
      ),
      localSearch: commitCubeRescuePotentialSearch(replayedSearch),
      globalExpansion: { status: "not-run" },
    });
    const source = {
      adaptiveArchivePath: "synthetic",
      adaptiveArchiveSha256: DIGEST,
      adaptiveManifestDigest: DIGEST,
      adaptiveArtifactDigest: DIGEST,
      adaptiveReportDigest: DIGEST,
      adaptiveSourceHash: DIGEST,
      generalizedCompressionArchiveHash: DIGEST,
      h1CertificateDigest: DIGEST,
      latticeBasisDigest: DIGEST,
      cocycleSectionDigest: DIGEST,
      oracleStructureHash: DIGEST,
      actionRowsCanonicalSha256: DIGEST,
      degree: 34_560 as const,
      rank: 19 as const,
    };
    const certificateInput = {
      schemaVersion: 1 as const,
      kind: "compact-5-cube-index34560-bounded-track-b-rescue" as const,
      method:
        "sealed-separator-motifs-periodic-potentials-and-compatible-subdivision-portfolio" as const,
      source,
      motifExtraction: extraction,
      selectedMotifIds: [motif.motifId],
      portfolio: {
        algorithmRevision: CUBE_RESCUE_ALGORITHM_REVISION,
        orderKinds: ["numeric" as const],
        subdivisionFamilies: ["pulling" as const],
        localPointIds,
        localBounds,
        globalCegarBounds,
      },
      trials: [trial],
      bestTrialId: trial.trialId,
      checks: {
        adaptiveArchiveAndManifestReplayed: true,
        adaptiveSemanticReplayPassed: true,
        sourceBindingsAgree: true,
        allSeparatorLeavesExtracted: true,
        allSeparatorMotifsSelected: false,
        productionCartesianPortfolioComplete: false,
        onlyThreeCertifiedMotifPointsUsed: true,
        noGlobalNormalCatalogueRecomputed: true as const,
        everyTrialDigestValid: true,
        everyLocalConnectorExactlyReplayed: true,
        boundedGlobalStatusHonest: true,
        everyOriginalVertexPassCoversSubdivisionVertices: true,
      },
      claims: [],
      nonClaims: [],
    };
    const certificate =
      sealCompactCubeBoundedRescueCertificate(certificateInput);
    const context = {
      adaptiveArtifact: loaded.artifact,
      degree: 34_560,
      source,
      adaptiveArchiveAndManifestReplayed: true,
      adaptiveSemanticReplayPassed: true,
      builder() {
        return builder;
      },
    };
    expect(
      replayCompactCubeBoundedRescueCertificate(certificate, context).status,
    ).toBe("passed");

    const forgedInput = structuredClone(certificateInput);
    forgedInput.trials[0].localSearch.fullResultDigest = canonicalSha256(
      "forged-search-result",
    );
    forgedInput.trials[0] = sealCubeRescueTrialRecord(forgedInput.trials[0]);
    const forged = sealCompactCubeBoundedRescueCertificate(forgedInput);
    const rejected = replayCompactCubeBoundedRescueCertificate(forged, context);
    expect(rejected.status).toBe("failed");
    expect(rejected.checks.everyPotentialSearchReplayed).toBe(false);
  });

  it("rejects incomplete and field-mutated declared portfolio products", () => {
    const loaded = loadCubeRescueAdaptiveArchive({
      archive:
        "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.json.gz",
      manifest:
        "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.archive.json",
    });
    const extraction = extractCubeRescueSeparatorMotifs(loaded.artifact);
    const motif = extraction.motifs[0];
    const order = buildCubeRescueVertexOrder(34_560, "numeric");
    const localBounds = {
      maxIterations: 1,
      beamWidth: 1,
      maxStates: 2,
      maxVariablesPerFailure: 1,
      maxCandidateValuesPerVariable: 1,
      maxAbsolutePotential: 1,
    };
    const globalCegarBounds = {
      maxRounds: 1,
      maxCounterexamplesPerRound: 1,
      constraintSearchBounds: localBounds,
    };
    const trial: CubeRescueTrialRecord = {
      trialId: computeCubeRescueTrialId({
        sourceMotifId: motif.motifId,
        orderDigest: order.orderDigest,
        subdivisionFamily: "pulling",
        localPointIds: [2, 4, 27],
        localBounds,
        globalCegarBounds,
      }),
      sourceMotifId: motif.motifId,
      primitiveWitness: [...motif.primitiveWitness],
      sigma: motif.sigma,
      orderKind: "numeric",
      orderId: order.id,
      orderDigest: order.orderDigest,
      subdivisionFamily: "pulling",
      localPointIds: [2, 4, 27],
      localTemplateDigests: [DIGEST, DIGEST, DIGEST],
      localSearch: {
        schemaVersion: 1,
        kind: "bounded-exact-periodic-potential-search-commitment",
        status: "not-found-within-bounds",
        sigma: motif.sigma,
        primitiveWitness: [...motif.primitiveWitness],
        bounds: localBounds,
        exploredStateCount: 1,
        iterationCount: 1,
        initialScore: [1],
        bestScore: [1],
        potential: {
          values: [],
          potentialDigest: canonicalSha256({
            method: "quotient-periodic-integral-zero-cochain",
            values: [],
          }),
        },
        evaluationDigests: [DIGEST, DIGEST, DIGEST],
        fullResultDigest: DIGEST,
      },
      globalExpansion: { status: "not-run" },
      trialDigest: "",
    };
    const portfolio = {
      algorithmRevision: CUBE_RESCUE_ALGORITHM_REVISION,
      orderKinds: ["numeric" as const],
      subdivisionFamilies: ["pulling" as const],
      localPointIds: [2, 4, 27],
      localBounds,
      globalCegarBounds,
      trialCount: 1,
      localConnectorCount: 0,
      originalVertexPassCount: 0,
    };
    const certificateShape = {
      selectedMotifIds: [motif.motifId],
      portfolio,
      trials: [trial],
      bestTrialId: selectBestCubeRescueTrialId([trial]),
    };
    expect(
      auditCubeRescuePortfolioStructure(certificateShape, extraction),
    ).toMatchObject({
      structureValid: true,
      productionComplete: false,
      bestTrialValid: true,
    });
    const missingCartesianTrial = {
      ...structuredClone(certificateShape),
      portfolio: {
        ...structuredClone(certificateShape.portfolio),
        subdivisionFamilies: [
          "pulling" as const,
          "maximal-simplex-stellar" as const,
        ],
      },
    };
    expect(
      auditCubeRescuePortfolioStructure(missingCartesianTrial, extraction)
        .structureValid,
    ).toBe(false);
    const changedSigma = structuredClone(certificateShape);
    changedSigma.trials[0].sigma = motif.sigma === 1 ? -1 : 1;
    expect(
      auditCubeRescuePortfolioStructure(changedSigma, extraction)
        .structureValid,
    ).toBe(false);
    const changedTrialId = structuredClone(certificateShape);
    changedTrialId.trials[0].trialId = DIGEST;
    expect(
      auditCubeRescuePortfolioStructure(changedTrialId, extraction)
        .structureValid,
    ).toBe(false);
    const invalidRuntimeFamily = structuredClone(certificateShape);
    (
      invalidRuntimeFamily.trials[0] as unknown as {
        subdivisionFamily: string;
      }
    ).subdivisionFamily = "canonical-edge-stellar";
    expect(
      auditCubeRescuePortfolioStructure(invalidRuntimeFamily, extraction)
        .structureValid,
    ).toBe(false);
    const legacySearchSchema = structuredClone(certificateShape);
    (
      legacySearchSchema.trials[0].localSearch as unknown as {
        schemaVersion: number;
      }
    ).schemaVersion = 2;
    expect(
      auditCubeRescuePortfolioStructure(legacySearchSchema, extraction)
        .structureValid,
    ).toBe(false);

    const sealedTrial = sealCubeRescueTrialRecord(trial);
    expect(cubeRescueTrialDigestIsValid(sealedTrial)).toBe(true);
    const changedCommitment = structuredClone(sealedTrial);
    changedCommitment.localSearch.fullResultDigest = canonicalSha256(
      "changed-full-result",
    );
    expect(cubeRescueTrialDigestIsValid(changedCommitment)).toBe(false);

    const runBindingDigest = canonicalSha256("checkpoint-run-binding");
    const checkpoint = sealCubeRescueGenerationCheckpoint({
      runBindingDigest,
      trials: [sealedTrial],
    });
    expect(
      parseCubeRescueGenerationCheckpoint(checkpoint, runBindingDigest, [
        sealedTrial.trialId,
      ]),
    ).toEqual(checkpoint);
    expect(() =>
      parseCubeRescueGenerationCheckpoint(
        checkpoint,
        canonicalSha256("different-run"),
        [sealedTrial.trialId],
      ),
    ).toThrow(/stale or invalid/u);
    const duplicateCheckpoint = sealCubeRescueGenerationCheckpoint({
      runBindingDigest,
      trials: [sealedTrial, sealedTrial],
    });
    expect(() =>
      parseCubeRescueGenerationCheckpoint(
        duplicateCheckpoint,
        runBindingDigest,
        [sealedTrial.trialId, sealedTrial.trialId],
      ),
    ).toThrow(/stale or invalid/u);
    const corruptedCheckpoint = structuredClone(checkpoint);
    corruptedCheckpoint.trials[0].localSearch.status = "connector-found";
    expect(() =>
      parseCubeRescueGenerationCheckpoint(
        corruptedCheckpoint,
        runBindingDigest,
        [sealedTrial.trialId],
      ),
    ).toThrow(/stale or invalid/u);
    expect(() =>
      parseCubeRescueGenerationCheckpoint(checkpoint, runBindingDigest, [
        DIGEST,
        sealedTrial.trialId,
      ]),
    ).toThrow(/stale or invalid/u);
  });

  it("binds the production 243-type compression metadata across its declared hash namespaces", () => {
    const compression = JSON.parse(
      readFileSync(
        "scripts/certificates/torsion-free/compact_5_cube_index34560_generalized_compression.json",
        "utf8",
      ),
    ) as GeneralizedCompressionCertificate;
    const lawful = JSON.parse(
      readFileSync(
        "scripts/certificates/torsion-free/compact_5_cube_index34560_generalized_lawful.json",
        "utf8",
      ),
    ) as {
      oracle: { degree: number; actionRowsCanonicalSha256: string };
    };
    const oracleMetadata = {
      ...lawful.oracle,
      sphericalTypes: compression.sphericalTypes.map((type) => ({
        typeIndex: type.typeIndex,
        id: type.sphericalSubsetId,
        generators: type.generators,
        generatorMask: 0,
        dimension: type.dimension,
        subgroupOrder: type.subgroupOrder,
        cellCount: type.compressedCellCount,
      })),
    };
    expect(compression.sphericalTypes).toHaveLength(243);
    expect(compression.source.actionRowsCanonicalSha256).not.toBe(
      lawful.oracle.actionRowsCanonicalSha256,
    );
    const audit = auditCubeRescueCompressionBinding({
      generalizedCompression: compression,
      oracle: oracleMetadata,
    });
    expect(audit.valid).toBe(true);
    expect(audit.hashNamespaces.directlyComparable).toBe(false);
    const altered = structuredClone(oracleMetadata);
    altered.sphericalTypes[1].cellCount += 1;
    expect(
      auditCubeRescueCompressionBinding({
        generalizedCompression: compression,
        oracle: altered,
      }),
    ).toMatchObject({
      valid: false,
      errors: ["everySphericalTypeCommitmentMatches"],
    });
  });
});
