import type { GeneralizedCompressionCertificate } from "../davis/generalizedCompression";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  runAdaptiveStreamedHeightSearch,
  type AdaptiveStreamedHeightTemplateSource,
  type AdaptiveStreamedHeightIteration,
  type AdaptiveStreamedHeightSearchResult,
} from "./adaptiveStreamedHeightSearch";
import {
  deriveAntipodalObstructionPrunedConeCover,
  replayObstructionPrunedConeCover,
  type AsyncExactConeFeasibilityOracle,
  type ObstructionPrunedConeTraversalStrategy,
  type ObstructionPrunedConeCover,
  type ObstructionPrunedConeCoverReplay,
} from "./scalableHeightCone";
import {
  createScalableStreamedHeightConeEvaluator,
  type StreamedHeightLinkFailurePrune,
  type StreamedHeightPrimitiveWitnessEvaluation,
  type StreamedHeightProvisionalWitnessLeaf,
} from "./streamedHeightConeSearch";
import type { StreamedH1CompleteLatticeCertificate } from "./streamedH1Completion";
import type { StreamedLawfulDavisOracle } from "./streamedLawfulDavis";
import { bindStreamedFullH1Lattice } from "./streamedRank19TrackB";
import {
  computeStreamedTrackBLinearTemplateSetDigest,
  computeStreamedTrackBLinearTemplateStreamHash,
  prepareStreamedTrackBLinearLinkTemplateStreamer,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBLinearLinkTemplate,
  type StreamedTrackBLinearTemplateStreamResult,
} from "./streamedTrackB";

export interface StreamedRank19AdaptiveTemplateRecord {
  point: number;
  templateDigest: string;
  topologyDigest: string;
  germCount: number;
  linkEdgeCount: number;
}

export interface StreamedRank19AdaptiveTemplateBatch {
  batchIndex: number;
  purpose:
    | "selected-point-preload"
    | "separator-witness-scan"
    | "explicit-antipodal-global-witness-replay";
  /** Null denotes the canonical exhaustive request q0,...,q(degree-1). */
  requestedPointIds: number[] | null;
  checkedPointIdsDigest: string;
  stream: StreamedTrackBLinearTemplateStreamResult;
  batchDigest: string;
}

type Rank19AdaptiveCover = ObstructionPrunedConeCover<
  StreamedHeightLinkFailurePrune,
  StreamedHeightProvisionalWitnessLeaf
>;

export interface StreamedRank19AllPointWitnessCertificate {
  schemaVersion: 1;
  kind: "streamed-rank19-all-point-witness-certificate";
  sigma: -1 | 1;
  sourceHash: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  heightRuleDigest: string;
  degree: number;
  primitiveWitness: string[];
  checkedPointCount: number;
  pointResultDigest: string;
  witnessEvaluationDigest: string;
  certificateDigest: string;
}

export interface ReplayStreamedRank19AdaptivePointSearchOptions {
  oracle: StreamedLawfulDavisOracle;
  generalizedCompression: GeneralizedCompressionCertificate;
  h1Certificate: StreamedH1CompleteLatticeCertificate;
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
}

export interface StreamedRank19AdaptivePointSearchReplay {
  status: "passed" | "failed";
  checks: {
    reportDigestValid: boolean;
    h1AndSourceBound: boolean;
    searchEnvelopeValid: boolean;
    templateRecordsReplayed: boolean;
    negativeFinalObjectReplayed: boolean;
    positiveAntipodeReplayed: boolean;
    explicitPolarityTransportBound: boolean;
  };
  errors: string[];
}

export interface StreamedRank19AdaptiveRunnerArtifact<Runner = unknown> {
  schemaVersion: 1;
  kind: "compact-5-cube-rank19-adaptive-runner-artifact";
  report: StreamedRank19AdaptivePointSearchReport;
  runner: Runner;
  artifactDigest: string;
}

export interface StreamedRank19AdaptiveRunnerArtifactReplay {
  status: "passed" | "failed";
  storedArtifactDigestValid: boolean;
  reportReplay: StreamedRank19AdaptivePointSearchReplay;
  errors: string[];
}

export interface StreamedRank19AdaptivePointSearchReport {
  schemaVersion: 3;
  kind: "compact-5-cube-rank19-adaptive-obstruction-point-search";
  status: AdaptiveStreamedHeightSearchResult["status"];
  method: "exact-provisional-witness-separation-with-source-bound-templates";
  source: {
    oracleStructureHash: string;
    actionRowsCanonicalSha256: string;
    generalizedCompressionArchiveHash: string;
    degree: number;
    sourceHash: string;
    latticeBasisDigest: string;
    cocycleSectionDigest: string;
    heightRuleDigest: string;
  };
  h1CertificateDigest: string;
  templateRecords: StreamedRank19AdaptiveTemplateRecord[];
  templateRecordDigest: string;
  templateStreaming: {
    method: "one-reusable-source-preparation-with-ephemeral-point-batches";
    preparationCount: 1;
    streamInvocationCount: number;
    streamedPointCount: number;
    batches: StreamedRank19AdaptiveTemplateBatch[];
    batchDigest: string;
  };
  search: AdaptiveStreamedHeightSearchResult;
  polarityCertification:
    | {
        kind: "explicit-antipodal-obstruction-cover";
        negativeReplay: ObstructionPrunedConeCoverReplay;
        positiveCover: Rank19AdaptiveCover;
        positiveReplay: ObstructionPrunedConeCoverReplay;
        transportDigest: string;
      }
    | {
        kind: "explicit-all-point-antipodal-witnesses";
        negativeWitness: StreamedRank19AllPointWitnessCertificate;
        positiveWitness: StreamedRank19AllPointWitnessCertificate;
        transportDigest: string;
      }
    | { kind: "incomplete" };
  checks: {
    negativeFinalObjectReplayed: boolean;
    positiveAntipodeReplayed: boolean;
    explicitPolarityTransportBound: boolean;
  };
  claims: string[];
  nonClaims: string[];
  reportDigest: string;
}

/** A global witness is terminal only after its scan reaches every point. */
export function adaptiveGlobalWitnessCountIsExhaustive(input: {
  status: AdaptiveStreamedHeightSearchResult["status"];
  degree: number;
  globalPassingWitness: { checkedPointCount: number } | null;
}): boolean {
  return input.status === "global-passing-witness"
    ? input.globalPassingWitness?.checkedPointCount === input.degree
    : input.globalPassingWitness === null;
}

export interface BuildStreamedRank19AdaptivePointSearchOptions {
  oracle: StreamedLawfulDavisOracle;
  generalizedCompression: GeneralizedCompressionCertificate;
  h1Certificate: StreamedH1CompleteLatticeCertificate;
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
  exactConeOracle: AsyncExactConeFeasibilityOracle;
  initialPointIds?: readonly number[];
  maxIterations?: number;
  maxConeNodes?: number;
  maxOracleQueries?: number;
  traversalStrategy?: ObstructionPrunedConeTraversalStrategy;
  onProgress?: (event: {
    stage: "template" | "iteration-search" | "witness-scan";
    iteration?: number;
    completed: number;
    total: number;
    point?: number;
  }) => void;
  onIteration?: (event: {
    iteration: AdaptiveStreamedHeightIteration;
    selectedPointIds: number[];
    status:
      | "continuing"
      | "invariant-obstruction-cover"
      | "global-passing-witness";
  }) => void;
}

function antipodalWitness(primitiveWitness: readonly string[]): string[] {
  return primitiveWitness.map((coordinate) => (-BigInt(coordinate)).toString());
}

function witnessCertificateDigest(
  certificate: StreamedRank19AllPointWitnessCertificate,
): string {
  return canonicalSha256({ ...certificate, certificateDigest: "" });
}

function templateBatchDigest(
  batch: StreamedRank19AdaptiveTemplateBatch,
): string {
  return canonicalSha256({ ...batch, batchDigest: "" });
}

function templateStreamStaticEnvelopeDigest(
  stream: StreamedTrackBLinearTemplateStreamResult,
): string {
  const { heightRuleDigest, ...heightRuleBody } = stream.heightRule;
  return canonicalSha256({
    schemaVersion: stream.schemaVersion,
    kind: stream.kind,
    sourceHash: stream.sourceHash,
    oracleStructureHash: stream.oracleStructureHash,
    generalizedCompressionArchiveHash: stream.generalizedCompressionArchiveHash,
    latticeBasisDigest: stream.latticeBasisDigest,
    cocycleSectionDigest: stream.cocycleSectionDigest,
    cocycleClosureDigest: stream.cocycleClosureDigest,
    coordinateIds: stream.coordinateIds,
    coordinateCount: stream.coordinateCount,
    adjacencyIncluded: stream.adjacencyIncluded,
    maximumAbsoluteEdgeCoordinate: stream.maximumAbsoluteEdgeCoordinate,
    maximumAbsoluteIntegratedCoordinateBound:
      stream.maximumAbsoluteIntegratedCoordinateBound,
    heightRuleBody,
    heightRuleDigest,
    heightRuleDigestValid: heightRuleDigest === canonicalSha256(heightRuleBody),
  });
}

function sealAllPointWitnessCertificate(options: {
  source: AdaptiveStreamedHeightTemplateSource;
  sigma: -1 | 1;
  primitiveWitness: readonly string[];
  evaluation: StreamedHeightPrimitiveWitnessEvaluation;
}): StreamedRank19AllPointWitnessCertificate {
  const { evaluation } = options;
  if (
    !evaluation.everyPointPasses ||
    evaluation.firstFailure !== null ||
    evaluation.checkedPointCount !== options.source.ambientPointCount ||
    evaluation.pointResultRecords.length !== options.source.ambientPointCount
  ) {
    throw new Error(
      `The proposed sigma=${options.sigma} witness lacks an exhaustive passing scan.`,
    );
  }
  const primitiveWitness = [...options.primitiveWitness];
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "streamed-rank19-all-point-witness-certificate" as const,
    sigma: options.sigma,
    sourceHash: options.source.sourceHash,
    latticeBasisDigest: options.source.latticeBasisDigest,
    cocycleSectionDigest: options.source.cocycleSectionDigest,
    heightRuleDigest: options.source.heightRuleDigest,
    degree: options.source.ambientPointCount,
    primitiveWitness,
    checkedPointCount: evaluation.checkedPointCount,
    pointResultDigest: evaluation.pointResultDigest,
    witnessEvaluationDigest: canonicalSha256({
      sigma: options.sigma,
      primitiveWitness,
      scanRecords: evaluation.pointResultRecords,
    }),
    certificateDigest: "",
  };
  return {
    ...withoutDigest,
    certificateDigest: canonicalSha256(withoutDigest),
  };
}

function obstructionTransportDigest(options: {
  sourceHash: string;
  selectedPointIds: readonly number[];
  negativeCoverHash: string;
  positiveCoverHash: string;
}): string {
  return canonicalSha256({
    schemaVersion: 1,
    kind: "streamed-rank19-explicit-antipodal-cover-transport",
    method: "(weight,sigma)->(-weight,-sigma)",
    ...options,
  });
}

function witnessTransportDigest(options: {
  sourceHash: string;
  negativeCertificateDigest: string;
  positiveCertificateDigest: string;
}): string {
  return canonicalSha256({
    schemaVersion: 1,
    kind: "streamed-rank19-explicit-antipodal-witness-transport",
    method: "(weight,sigma)->(-weight,-sigma)",
    ...options,
  });
}

function reportClaims(
  status: AdaptiveStreamedHeightSearchResult["status"],
  checks: StreamedRank19AdaptivePointSearchReport["checks"],
): string[] {
  if (
    status === "invariant-obstruction-cover" &&
    checks.negativeFinalObjectReplayed &&
    checks.positiveAntipodeReplayed &&
    checks.explicitPolarityTransportBound
  ) {
    return [
      "The selected quotient points give explicit replayed invariant obstruction covers for every nonzero integral character in the certified Z^19 lattice at both tie polarities.",
      "The stored sigma=+1 cover is the exact antipodal transport of the stored sigma=-1 cover, with every target link proof regenerated and replayed.",
    ];
  }
  if (
    status === "global-passing-witness" &&
    checks.negativeFinalObjectReplayed &&
    checks.positiveAntipodeReplayed &&
    checks.explicitPolarityTransportBound
  ) {
    return [
      "The stored primitive rank-19 witness and its antipode passed explicit directed-link replays at every quotient point for sigma=-1 and sigma=+1 respectively.",
    ];
  }
  return [
    "No theorem-facing Track-B conclusion is claimed from this incomplete adaptive report.",
  ];
}

function reportNonClaims(): string[] {
  return [
    "A provisional witness leaf certifies only its stored primitive witness, never every character in that cone.",
    "The early-exit survivor hits, intermediate CEGAR separator history, and batch manifests are operational provenance, not partial covers or theorem objects; standalone replay certifies the final exhaustive cover or the final all-point witness pair.",
    "The adaptive point-selection history is not a literal enumeration of every height-arrangement face, and historical provisional witnesses are not retained as theorem certificates.",
    "The central raw-normal cover is not an arrangement claim for arbitrary real weights near the translated affine height walls; the integral nonvanishing lemma is essential.",
    "A theorem-facing negative pipeline result must also bind this sparse two-polarity obstruction certificate to the separately replayed exhaustive global normal catalogue.",
  ];
}

/**
 * Repository-bound adaptive point selector for the certified compact-cube
 * rank-19 lattice. It is exploratory until either the final cover has no
 * provisional leaves or one primitive witness has passed all quotient points.
 */
export async function buildStreamedRank19AdaptivePointSearch(
  options: BuildStreamedRank19AdaptivePointSearchOptions,
): Promise<StreamedRank19AdaptivePointSearchReport> {
  const h1 = bindStreamedFullH1Lattice(options.h1Certificate);
  if (
    h1.oracleStructureHash !== options.oracle.structureHash ||
    h1.actionRowsCanonicalSha256 !== options.oracle.actionRowsCanonicalSha256 ||
    h1.fullLatticeBasisDigest !== options.cocycleBasis.latticeBasisDigest ||
    h1.fullCocycleSectionDigest !==
      options.cocycleBasis.expectedCocycleSectionDigest ||
    canonicalSha256(h1.integralBasisIds) !==
      canonicalSha256(options.cocycleBasis.coordinateIds)
  ) {
    throw new Error(
      "The adaptive Track-B search requires the certified ordered Z^19 basis.",
    );
  }
  const initialPointIds = [...(options.initialPointIds ?? [0])].sort(
    (left, right) => left - right,
  );
  if (
    initialPointIds.length === 0 ||
    initialPointIds.some(
      (point, index) =>
        !Number.isInteger(point) ||
        point < 0 ||
        point >= options.oracle.degree ||
        (index > 0 && point === initialPointIds[index - 1]),
    )
  ) {
    throw new Error(
      "The adaptive rank-19 search needs distinct in-range initial points.",
    );
  }
  const pinnedPoints = new Set(initialPointIds);
  const generalizedCompressionArchiveHash =
    options.generalizedCompression.archiveHash;
  const templateCache = new Map<number, StreamedTrackBLinearLinkTemplate>();
  const recordByPoint = new Map<number, StreamedRank19AdaptiveTemplateRecord>();
  const templateBatches: StreamedRank19AdaptiveTemplateBatch[] = [];
  const templateStreamer = prepareStreamedTrackBLinearLinkTemplateStreamer({
    oracle: options.oracle,
    generalizedCompression: options.generalizedCompression,
    cocycleBasis: options.cocycleBasis,
  });
  let sourceBinding:
    | {
        sourceHash: string;
        heightRuleDigest: string;
        latticeBasisDigest: string;
        cocycleSectionDigest: string;
      }
    | undefined;

  const storeTemplate = (template: StreamedTrackBLinearLinkTemplate): void => {
    const record: StreamedRank19AdaptiveTemplateRecord = {
      point: template.point,
      templateDigest: template.templateDigest,
      topologyDigest: template.topologyDigest,
      germCount: template.germs.length,
      linkEdgeCount: template.edges.length,
    };
    const storedRecord = recordByPoint.get(template.point);
    if (
      storedRecord &&
      canonicalSha256(storedRecord) !== canonicalSha256(record)
    ) {
      throw new Error(
        `Adaptive template q${template.point} changed after regeneration.`,
      );
    }
    recordByPoint.set(template.point, record);
    templateCache.delete(template.point);
    templateCache.set(template.point, template);
    while (templateCache.size > pinnedPoints.size + 4) {
      const evict = [...templateCache.keys()].find(
        (candidate) =>
          !pinnedPoints.has(candidate) && candidate !== template.point,
      );
      if (evict === undefined) break;
      templateCache.delete(evict);
    }
    options.onProgress?.({
      stage: "template",
      completed: recordByPoint.size,
      total: options.oracle.degree,
      point: template.point,
    });
  };

  const runTemplateBatch = (input: {
    purpose: StreamedRank19AdaptiveTemplateBatch["purpose"];
    points?: readonly number[];
    visitor?: (template: StreamedTrackBLinearLinkTemplate) => void | "stop";
  }): StreamedTrackBLinearTemplateStreamResult => {
    const requestedPoints = input.points
      ? [...input.points]
      : Array.from(
          { length: options.oracle.degree },
          (_unused, point) => point,
        );
    const checkedPointIds: number[] = [];
    const stream = templateStreamer.stream(
      {
        ...(input.points ? { points: input.points } : {}),
        includeAdjacency: true,
      },
      (template) => {
        checkedPointIds.push(template.point);
        storeTemplate(template);
        return input.visitor?.(template);
      },
    );
    const binding = {
      sourceHash: stream.sourceHash,
      heightRuleDigest: stream.heightRule.heightRuleDigest,
      latticeBasisDigest: stream.latticeBasisDigest,
      cocycleSectionDigest: stream.cocycleSectionDigest,
    };
    const checkedRecords = checkedPointIds.map((point) => {
      const record = recordByPoint.get(point);
      if (!record)
        throw new Error(`Batch template q${point} has no stable record.`);
      return [point, record.templateDigest] as const;
    });
    const streamPassed =
      stream.status === "completed" &&
      stream.scanOutcome !== "failed" &&
      stream.errors.length === 0 &&
      stream.adjacencyIncluded &&
      stream.checkedPointCount === checkedPointIds.length &&
      checkedPointIds.every(
        (point, index) => point === requestedPoints[index],
      ) &&
      stream.oracleStructureHash === options.oracle.structureHash &&
      stream.generalizedCompressionArchiveHash ===
        generalizedCompressionArchiveHash &&
      stream.latticeBasisDigest === h1.fullLatticeBasisDigest &&
      stream.cocycleSectionDigest === h1.fullCocycleSectionDigest &&
      stream.checks.sourceReplayed &&
      stream.checks.coordinateIdsValid &&
      stream.checks.expectedCocycleSectionDigestMatches &&
      stream.checks.directedEdgesAntisymmetric &&
      stream.checks.rankTwoBoundariesClosed &&
      stream.checks.exactNumberPackingBoundProved &&
      stream.reportHash ===
        computeStreamedTrackBLinearTemplateStreamHash(stream) &&
      stream.templateSetDigest ===
        computeStreamedTrackBLinearTemplateSetDigest({
          sourceHash: stream.sourceHash,
          requestedPoints,
          checkedRecords,
        }) &&
      (stream.scanOutcome === "exhaustive-request"
        ? stream.checks.everyRequestedPointStreamed &&
          stream.checkedPointCount === requestedPoints.length
        : input.visitor !== undefined &&
          stream.scanOutcome === "visitor-stopped");
    if (!streamPassed) {
      throw new Error(
        `Adaptive ${input.purpose} template batch failed replay: ${stream.errors.join(" ")}`,
      );
    }
    if (
      sourceBinding &&
      canonicalSha256(sourceBinding) !== canonicalSha256(binding)
    ) {
      throw new Error("Adaptive template batches disagree on source binding.");
    }
    sourceBinding ??= binding;
    const batchWithoutDigest = {
      batchIndex: templateBatches.length,
      purpose: input.purpose,
      requestedPointIds: input.points ? [...input.points] : null,
      checkedPointIdsDigest: canonicalSha256(checkedPointIds),
      stream,
      batchDigest: "",
    };
    templateBatches.push({
      ...batchWithoutDigest,
      batchDigest: canonicalSha256(batchWithoutDigest),
    });
    return stream;
  };

  const preparePoints = (pointIds: readonly number[]): void => {
    const missing = [...pointIds]
      .filter((point) => !templateCache.has(point))
      .sort((left, right) => left - right);
    if (missing.length === 0) return;
    runTemplateBatch({ purpose: "selected-point-preload", points: missing });
  };

  preparePoints(initialPointIds);
  if (!sourceBinding) throw new Error("No adaptive source binding was built.");
  const templateAt = (point: number): StreamedTrackBLinearLinkTemplate => {
    const template = templateCache.get(point);
    if (!template) {
      throw new Error(
        `Template q${point} was not prepared by a reusable batch.`,
      );
    }
    return template;
  };
  const scanPrimitiveWitness = (
    primitiveWitness: readonly string[],
    sigma: -1 | 1,
    onPoint?: (completed: number, total: number, point: number) => void,
  ): StreamedHeightPrimitiveWitnessEvaluation => {
    const pointResultRecords: Array<[number, string, string]> = [];
    let firstFailure: StreamedHeightPrimitiveWitnessEvaluation["firstFailure"] =
      null;
    runTemplateBatch({
      purpose: "separator-witness-scan",
      visitor(template) {
        const evaluation = createScalableStreamedHeightConeEvaluator({
          source: {
            coordinateCount: 19,
            pointCount: 1,
            pointIds: [template.point],
            ambientPointCount: options.oracle.degree,
            ...sourceBinding!,
            templateAt(point: number) {
              if (point !== template.point)
                throw new Error("A batch evaluator requested another point.");
              return template;
            },
          },
          sigma,
          cacheTemplates: false,
        }).evaluatePrimitiveWitness(primitiveWitness);
        const record = evaluation.pointResultRecords[0];
        if (evaluation.checkedPointCount !== 1 || !record) {
          throw new Error("A batched witness point evaluation is malformed.");
        }
        pointResultRecords.push(record);
        onPoint?.(template.point + 1, options.oracle.degree, template.point);
        if (evaluation.firstFailure) {
          firstFailure = evaluation.firstFailure;
          return "stop";
        }
      },
    });
    return {
      checkedPointCount: pointResultRecords.length,
      everyPointPasses:
        firstFailure === null &&
        pointResultRecords.length === options.oracle.degree,
      pointResultRecords,
      firstFailure,
      pointResultDigest: canonicalSha256(pointResultRecords),
    };
  };
  const adaptiveSource: AdaptiveStreamedHeightTemplateSource = {
    coordinateCount: 19,
    ambientPointCount: options.oracle.degree,
    ...sourceBinding,
    templateAt,
    preparePoints,
    scanPrimitiveWitness,
  };
  const search = await runAdaptiveStreamedHeightSearch({
    source: adaptiveSource,
    exactConeOracle: options.exactConeOracle,
    sigma: -1,
    initialPointIds,
    ...(options.maxIterations === undefined
      ? {}
      : { maxIterations: options.maxIterations }),
    ...(options.maxConeNodes === undefined
      ? {}
      : { maxConeNodes: options.maxConeNodes }),
    ...(options.maxOracleQueries === undefined
      ? {}
      : { maxOracleQueries: options.maxOracleQueries }),
    ...(options.traversalStrategy === undefined
      ? {}
      : { traversalStrategy: options.traversalStrategy }),
    onProgress(event) {
      options.onProgress?.(event);
    },
    onIteration(event) {
      for (const point of event.selectedPointIds) pinnedPoints.add(point);
      options.onIteration?.(event);
    },
  });

  const finalTestedPointIds = search.iterations.at(-1)?.testedPointIds;
  if (!finalTestedPointIds || finalTestedPointIds.length === 0) {
    throw new Error("The adaptive search omitted its final tested point set.");
  }
  let polarityCertification: StreamedRank19AdaptivePointSearchReport["polarityCertification"];
  let checks: StreamedRank19AdaptivePointSearchReport["checks"];
  if (search.status === "invariant-obstruction-cover") {
    const finalCover = search.finalCover;
    if (!finalCover) {
      throw new Error("An invariant adaptive result omitted its final cover.");
    }
    const selectedSource = {
      ...adaptiveSource,
      pointCount: finalTestedPointIds.length,
      pointIds: finalTestedPointIds,
    };
    const negativeEvaluator = createScalableStreamedHeightConeEvaluator({
      source: selectedSource,
      sigma: -1,
      cacheTemplates: true,
    });
    const negativeReplay = replayObstructionPrunedConeCover(finalCover, {
      verifyPrune: negativeEvaluator.verifyPrune,
      verifySurvivor: negativeEvaluator.verifyProvisional,
    });
    if (negativeReplay.status !== "passed") {
      throw new Error(
        `The final adaptive sigma=-1 object failed replay: ${negativeReplay.errors.join(" ")}`,
      );
    }
    if (
      finalCover.survivorLeafCount !== 0 ||
      finalCover.pruneLeafCount === 0 ||
      finalCover.zeroCharacterLeafCount !== 1
    ) {
      throw new Error(
        "An invariant adaptive result has an incomplete terminal census.",
      );
    }
    const positiveEvaluator = createScalableStreamedHeightConeEvaluator({
      source: selectedSource,
      sigma: 1,
      cacheTemplates: true,
    });
    const positiveCover = deriveAntipodalObstructionPrunedConeCover({
      source: finalCover,
      decide: positiveEvaluator.decideProvisional,
    });
    const positiveReplay = replayObstructionPrunedConeCover(positiveCover, {
      verifyPrune: positiveEvaluator.verifyPrune,
      verifySurvivor: positiveEvaluator.verifyProvisional,
    });
    if (
      positiveReplay.status !== "passed" ||
      positiveCover.survivorLeafCount !== 0 ||
      positiveCover.pruneLeafCount === 0 ||
      positiveCover.zeroCharacterLeafCount !== 1
    ) {
      throw new Error(
        `The explicit adaptive sigma=+1 cover failed replay: ${positiveReplay.errors.join(" ")}`,
      );
    }
    const transportDigest = obstructionTransportDigest({
      sourceHash: adaptiveSource.sourceHash,
      selectedPointIds: finalTestedPointIds,
      negativeCoverHash: finalCover.coverHash,
      positiveCoverHash: positiveCover.coverHash,
    });
    polarityCertification = {
      kind: "explicit-antipodal-obstruction-cover",
      negativeReplay,
      positiveCover,
      positiveReplay,
      transportDigest,
    };
    checks = {
      negativeFinalObjectReplayed: true,
      positiveAntipodeReplayed: true,
      explicitPolarityTransportBound: true,
    };
  } else if (search.status === "global-passing-witness") {
    const storedWitness = search.globalPassingWitness;
    if (!storedWitness) {
      throw new Error("The global adaptive result omitted its witness.");
    }
    const negativeRecords: Array<[number, string, string]> = [];
    const positiveRecords: Array<[number, string, string]> = [];
    const positivePrimitiveWitness = antipodalWitness(
      storedWitness.primitiveWitness,
    );
    runTemplateBatch({
      purpose: "explicit-antipodal-global-witness-replay",
      visitor(template) {
        const onePointSource = {
          coordinateCount: 19,
          pointCount: 1,
          pointIds: [template.point],
          ambientPointCount: options.oracle.degree,
          ...sourceBinding!,
          templateAt(point: number): StreamedTrackBLinearLinkTemplate {
            if (point !== template.point)
              throw new Error("A global replay requested another point.");
            return template;
          },
        };
        for (const [sigma, witness, sink] of [
          [-1, storedWitness.primitiveWitness, negativeRecords],
          [1, positivePrimitiveWitness, positiveRecords],
        ] as const) {
          const evaluation = createScalableStreamedHeightConeEvaluator({
            source: onePointSource,
            sigma,
            cacheTemplates: false,
          }).evaluatePrimitiveWitness(witness);
          const record = evaluation.pointResultRecords[0];
          if (
            !evaluation.everyPointPasses ||
            evaluation.checkedPointCount !== 1 ||
            evaluation.firstFailure !== null ||
            !record
          ) {
            throw new Error(
              `The explicit sigma=${sigma} witness fails at q${template.point}.`,
            );
          }
          sink.push(record);
        }
        options.onProgress?.({
          stage: "witness-scan",
          iteration: search.iterations.length,
          completed: template.point + 1,
          total: options.oracle.degree,
          point: template.point,
        });
      },
    });
    const negativeEvaluation: StreamedHeightPrimitiveWitnessEvaluation = {
      checkedPointCount: negativeRecords.length,
      everyPointPasses: negativeRecords.length === options.oracle.degree,
      pointResultRecords: negativeRecords,
      firstFailure: null,
      pointResultDigest: canonicalSha256(negativeRecords),
    };
    const positiveEvaluation: StreamedHeightPrimitiveWitnessEvaluation = {
      checkedPointCount: positiveRecords.length,
      everyPointPasses: positiveRecords.length === options.oracle.degree,
      pointResultRecords: positiveRecords,
      firstFailure: null,
      pointResultDigest: canonicalSha256(positiveRecords),
    };
    const negativeWitness = sealAllPointWitnessCertificate({
      source: adaptiveSource,
      sigma: -1,
      primitiveWitness: storedWitness.primitiveWitness,
      evaluation: negativeEvaluation,
    });
    if (
      negativeWitness.checkedPointCount !== options.oracle.degree ||
      negativeWitness.pointResultDigest !== storedWitness.pointResultDigest ||
      negativeWitness.witnessEvaluationDigest !== storedWitness.witnessHash ||
      negativeWitness.certificateDigest !==
        witnessCertificateDigest(negativeWitness)
    ) {
      throw new Error(
        "The explicit all-point sigma=-1 witness replay disagrees with the adaptive search.",
      );
    }
    const positiveWitness = sealAllPointWitnessCertificate({
      source: adaptiveSource,
      sigma: 1,
      primitiveWitness: positivePrimitiveWitness,
      evaluation: positiveEvaluation,
    });
    const transportDigest = witnessTransportDigest({
      sourceHash: adaptiveSource.sourceHash,
      negativeCertificateDigest: negativeWitness.certificateDigest,
      positiveCertificateDigest: positiveWitness.certificateDigest,
    });
    polarityCertification = {
      kind: "explicit-all-point-antipodal-witnesses",
      negativeWitness,
      positiveWitness,
      transportDigest,
    };
    checks = {
      negativeFinalObjectReplayed: true,
      positiveAntipodeReplayed: true,
      explicitPolarityTransportBound: true,
    };
  } else {
    polarityCertification = { kind: "incomplete" };
    checks = {
      negativeFinalObjectReplayed: false,
      positiveAntipodeReplayed: false,
      explicitPolarityTransportBound: false,
    };
  }

  const templateRecords = [...recordByPoint.values()].sort(
    (left, right) => left.point - right.point,
  );
  const templateRecordDigest = canonicalSha256(templateRecords);
  const templateStreamStatistics = templateStreamer.statistics();
  const templateStreaming = {
    method:
      "one-reusable-source-preparation-with-ephemeral-point-batches" as const,
    ...templateStreamStatistics,
    batches: templateBatches,
    batchDigest: canonicalSha256(templateBatches),
  };
  const withoutDigest = {
    schemaVersion: 3 as const,
    kind: "compact-5-cube-rank19-adaptive-obstruction-point-search" as const,
    status: search.status,
    method:
      "exact-provisional-witness-separation-with-source-bound-templates" as const,
    source: {
      oracleStructureHash: options.oracle.structureHash,
      actionRowsCanonicalSha256: options.oracle.actionRowsCanonicalSha256,
      generalizedCompressionArchiveHash: generalizedCompressionArchiveHash,
      degree: options.oracle.degree,
      ...sourceBinding,
    },
    h1CertificateDigest: h1.certificateDigest,
    templateRecords,
    templateRecordDigest,
    templateStreaming,
    search,
    polarityCertification,
    checks,
    claims: reportClaims(search.status, checks),
    nonClaims: reportNonClaims(),
    reportDigest: "",
  };
  return {
    ...withoutDigest,
    reportDigest: canonicalSha256(withoutDigest),
  };
}

export function sealStreamedRank19AdaptiveRunnerArtifact<Runner>(
  report: StreamedRank19AdaptivePointSearchReport,
  runner: Runner,
): StreamedRank19AdaptiveRunnerArtifact<Runner> {
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-rank19-adaptive-runner-artifact" as const,
    report,
    runner,
    artifactDigest: "",
  };
  return {
    ...withoutDigest,
    artifactDigest: canonicalSha256(withoutDigest),
  };
}

/**
 * Standalone replay for the adaptive artifact. Exact cone certificates are
 * checked from the report itself; quotient templates are regenerated from the
 * certified action, generalized compression, and integral H^1 section.
 */
export function replayStreamedRank19AdaptivePointSearchReport(
  report: StreamedRank19AdaptivePointSearchReport,
  options: ReplayStreamedRank19AdaptivePointSearchOptions,
): StreamedRank19AdaptivePointSearchReplay {
  const errors: string[] = [];
  const reportDigestValid =
    report.reportDigest === canonicalSha256({ ...report, reportDigest: "" });
  if (!reportDigestValid) errors.push("The adaptive report digest is invalid.");

  let h1AndSourceBound = false;
  try {
    const h1 = bindStreamedFullH1Lattice(options.h1Certificate);
    h1AndSourceBound =
      report.h1CertificateDigest === h1.certificateDigest &&
      h1.oracleStructureHash === options.oracle.structureHash &&
      h1.actionRowsCanonicalSha256 ===
        options.oracle.actionRowsCanonicalSha256 &&
      report.source.oracleStructureHash === options.oracle.structureHash &&
      report.source.actionRowsCanonicalSha256 ===
        options.oracle.actionRowsCanonicalSha256 &&
      report.source.generalizedCompressionArchiveHash ===
        options.generalizedCompression.archiveHash &&
      report.source.degree === options.oracle.degree &&
      report.source.latticeBasisDigest === h1.fullLatticeBasisDigest &&
      report.source.latticeBasisDigest ===
        options.cocycleBasis.latticeBasisDigest &&
      report.source.cocycleSectionDigest === h1.fullCocycleSectionDigest &&
      report.source.cocycleSectionDigest ===
        options.cocycleBasis.expectedCocycleSectionDigest &&
      canonicalSha256(h1.integralBasisIds) ===
        canonicalSha256(options.cocycleBasis.coordinateIds);
  } catch (error) {
    errors.push(
      `The adaptive H^1 binding could not be replayed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!h1AndSourceBound)
    errors.push("The adaptive report is not bound to the supplied exact data.");

  const finalIteration = report.search.iterations.at(-1);
  const finalTestedPointIds = finalIteration?.testedPointIds ?? [];
  const selectedPointIds = finalTestedPointIds;
  const selectedPointSet = new Set(finalTestedPointIds);
  const finalPointIdsAreValid =
    finalTestedPointIds.length > 0 &&
    finalTestedPointIds.every(
      (point, index) =>
        Number.isInteger(point) &&
        point >= 0 &&
        point < report.source.degree &&
        (index === 0 || point > finalTestedPointIds[index - 1]),
    );
  const storedSelectedPointIdsAreValid =
    report.search.selectedPointIds.length > 0 &&
    report.search.selectedPointIds.every(
      (point, index) =>
        Number.isInteger(point) &&
        point >= 0 &&
        point < report.source.degree &&
        (index === 0 || point > report.search.selectedPointIds[index - 1]),
    );
  const iterationDigestsValid = report.search.iterations.every(
    (iteration) =>
      iteration.iterationDigest ===
      canonicalSha256({ ...iteration, iterationDigest: "" }),
  );
  const samePointIds = (
    left: readonly number[],
    right: readonly number[],
  ): boolean => canonicalSha256(left) === canonicalSha256(right);
  let expectedSelected = [...report.search.initialPointIds];
  let searchHistoryValid =
    report.search.iterations.length > 0 &&
    expectedSelected.length > 0 &&
    expectedSelected.every(
      (point, index) =>
        Number.isInteger(point) &&
        point >= 0 &&
        point < report.source.degree &&
        (index === 0 || point > expectedSelected[index - 1]),
    );
  for (const [index, iteration] of report.search.iterations.entries()) {
    const exploration = iteration.exploration;
    const isFinal = index === report.search.iterations.length - 1;
    const explorationValid =
      exploration.kind === "complete-obstruction-cover"
        ? isFinal &&
          report.status === "invariant-obstruction-cover" &&
          iteration.provisionalWitnessHash === null &&
          iteration.separator === null &&
          exploration.replayPassed === true &&
          [
            exploration.nodeCount,
            exploration.oracleQueryCount,
            exploration.splitNodeCount,
            exploration.pruneLeafCount,
            exploration.zeroCharacterLeafCount,
            exploration.infeasibleBranchCount,
          ].every((entry) => Number.isSafeInteger(entry) && entry >= 0)
        : exploration.kind === "operational-first-survivor-hit" &&
          exploration.proofStatus ===
            "operational-only-not-an-exhaustive-cover" &&
          exploration.immediateReplayPassed === true &&
          /^[0-9a-f]{64}$/.test(exploration.hitHash) &&
          /^[0-9a-f]{64}$/.test(exploration.valueDigest) &&
          iteration.provisionalWitnessHash === exploration.valueDigest &&
          [
            exploration.depth,
            exploration.visitedFeasibleNodeCount,
            exploration.oracleQueryCount,
            exploration.openedSplitNodeCount,
            exploration.completedPruneLeafCount,
            exploration.completedZeroCharacterLeafCount,
            exploration.infeasibleBranchCount,
          ].every((entry) => Number.isSafeInteger(entry) && entry >= 0) &&
          exploration.visitedFeasibleNodeCount >= 1 &&
          exploration.oracleQueryCount ===
            exploration.visitedFeasibleNodeCount +
              exploration.infeasibleBranchCount &&
          exploration.visitedFeasibleNodeCount ===
            exploration.openedSplitNodeCount +
              exploration.completedPruneLeafCount +
              exploration.completedZeroCharacterLeafCount +
              1 &&
          exploration.depth <= exploration.openedSplitNodeCount;
    searchHistoryValid &&=
      iteration.iteration === index &&
      samePointIds(iteration.testedPointIds, expectedSelected) &&
      explorationValid;
    if (iteration.separator) {
      searchHistoryValid &&=
        !expectedSelected.includes(iteration.separator.point) &&
        iteration.separator.point >= 0 &&
        iteration.separator.point < report.source.degree;
      expectedSelected = [...expectedSelected, iteration.separator.point].sort(
        (left, right) => left - right,
      );
    } else {
      searchHistoryValid &&= index === report.search.iterations.length - 1;
    }
  }
  const finalCover = report.search.finalCover;
  const finalExploration = finalIteration?.exploration;
  const finalObjectShapeValid =
    report.status === "invariant-obstruction-cover"
      ? finalCover !== null &&
        finalExploration?.kind === "complete-obstruction-cover" &&
        finalExploration.coverHash === finalCover.coverHash &&
        finalExploration.nodeCount === finalCover.nodeCount &&
        finalExploration.oracleQueryCount === finalCover.oracleQueryCount &&
        finalExploration.splitNodeCount === finalCover.splitNodeCount &&
        finalExploration.pruneLeafCount === finalCover.pruneLeafCount &&
        finalExploration.zeroCharacterLeafCount ===
          finalCover.zeroCharacterLeafCount &&
        finalExploration.infeasibleBranchCount ===
          finalCover.infeasibleBranchCount
      : finalCover === null &&
        finalExploration?.kind === "operational-first-survivor-hit";
  searchHistoryValid &&=
    samePointIds(report.search.selectedPointIds, expectedSelected) &&
    finalObjectShapeValid &&
    (report.status === "global-passing-witness"
      ? finalIteration?.separator === null
      : report.status === "iteration-limit"
        ? finalIteration?.separator !== null
        : finalIteration?.separator === null);
  const searchEnvelopeValid =
    report.schemaVersion === 3 &&
    report.kind === "compact-5-cube-rank19-adaptive-obstruction-point-search" &&
    report.method ===
      "exact-provisional-witness-separation-with-source-bound-templates" &&
    report.status === report.search.status &&
    report.search.schemaVersion === 2 &&
    report.search.kind ===
      "adaptive-streamed-height-obstruction-point-search" &&
    report.search.method ===
      "first-survivor-depth-first-point-separation-and-exhaustive-terminal-cover" &&
    report.search.sigma === -1 &&
    report.search.rank === 19 &&
    report.search.ambientPointCount === report.source.degree &&
    report.search.sourceHash === report.source.sourceHash &&
    (finalCover === null ||
      (finalCover.sourceHash === report.source.sourceHash &&
        finalCover.rank === 19)) &&
    report.search.resultDigest ===
      canonicalSha256({ ...report.search, resultDigest: "" }) &&
    finalPointIdsAreValid &&
    storedSelectedPointIdsAreValid &&
    iterationDigestsValid &&
    searchHistoryValid &&
    canonicalSha256(report.claims) ===
      canonicalSha256(reportClaims(report.status, report.checks)) &&
    canonicalSha256(report.nonClaims) === canonicalSha256(reportNonClaims()) &&
    adaptiveGlobalWitnessCountIsExhaustive({
      status: report.status,
      degree: report.source.degree,
      globalPassingWitness: report.search.globalPassingWitness,
    });
  if (!searchEnvelopeValid)
    errors.push(
      "The adaptive search envelope or iteration history is invalid.",
    );

  const recordsAreCanonical =
    report.templateRecords.length > 0 &&
    report.templateRecordDigest === canonicalSha256(report.templateRecords) &&
    report.templateRecords.every(
      (record, index) =>
        Number.isInteger(record.point) &&
        record.point >= 0 &&
        record.point < report.source.degree &&
        (index === 0 || record.point > report.templateRecords[index - 1].point),
    );
  let templateRecordsReplayed = recordsAreCanonical;
  if (!recordsAreCanonical)
    errors.push("The adaptive template-record catalogue is not canonical.");

  const storedRecordByPoint = new Map(
    report.templateRecords.map((record) => [record.point, record]),
  );
  let batchProvenanceValid =
    report.templateStreaming.method ===
      "one-reusable-source-preparation-with-ephemeral-point-batches" &&
    report.templateStreaming.preparationCount === 1 &&
    report.templateStreaming.batches.length > 0 &&
    report.templateStreaming.streamInvocationCount ===
      report.templateStreaming.batches.length &&
    report.templateStreaming.streamedPointCount ===
      report.templateStreaming.batches.reduce(
        (sum, batch) => sum + batch.stream.checkedPointCount,
        0,
      ) &&
    report.templateStreaming.batchDigest ===
      canonicalSha256(report.templateStreaming.batches);
  const provenancePoints = new Set<number>();
  for (const [
    batchIndex,
    batch,
  ] of report.templateStreaming.batches.entries()) {
    const requestedPoints =
      batch.requestedPointIds ??
      Array.from({ length: report.source.degree }, (_unused, point) => point);
    const checkedPointIds = requestedPoints.slice(
      0,
      batch.stream.checkedPointCount,
    );
    const checkedRecords = checkedPointIds.flatMap((point) => {
      const record = storedRecordByPoint.get(point);
      return record ? [[point, record.templateDigest] as const] : [];
    });
    for (const point of checkedPointIds) provenancePoints.add(point);
    const exhaustiveAllPoints =
      requestedPoints.length === report.source.degree &&
      requestedPoints.every((point, index) => point === index);
    const requestIsCanonical =
      requestedPoints.length > 0 &&
      requestedPoints.every(
        (point, index) =>
          Number.isInteger(point) &&
          point >= 0 &&
          point < report.source.degree &&
          (index === 0 || point > requestedPoints[index - 1]),
      );
    const outcomeMatchesPurpose =
      batch.purpose === "selected-point-preload"
        ? batch.requestedPointIds !== null &&
          batch.stream.scanOutcome === "exhaustive-request"
        : batch.purpose === "separator-witness-scan"
          ? batch.requestedPointIds === null &&
            (batch.stream.scanOutcome === "visitor-stopped" ||
              batch.stream.scanOutcome === "exhaustive-request")
          : batch.purpose === "explicit-antipodal-global-witness-replay" &&
            batch.requestedPointIds === null &&
            batch.stream.scanOutcome === "exhaustive-request";
    batchProvenanceValid &&=
      batch.batchIndex === batchIndex &&
      batch.batchDigest === templateBatchDigest(batch) &&
      requestIsCanonical &&
      batch.stream.schemaVersion === 1 &&
      batch.stream.kind ===
        "streamed-full-k-track-b-linear-link-template-stream" &&
      batch.stream.reportHashAlgorithm === "sha256" &&
      batch.stream.status === "completed" &&
      batch.stream.scanOutcome !== "failed" &&
      batch.stream.errors.length === 0 &&
      batch.stream.adjacencyIncluded &&
      batch.stream.sourceHash === report.source.sourceHash &&
      batch.stream.oracleStructureHash === report.source.oracleStructureHash &&
      batch.stream.generalizedCompressionArchiveHash ===
        report.source.generalizedCompressionArchiveHash &&
      batch.stream.latticeBasisDigest === report.source.latticeBasisDigest &&
      batch.stream.cocycleSectionDigest ===
        report.source.cocycleSectionDigest &&
      batch.stream.heightRule.heightRuleDigest ===
        report.source.heightRuleDigest &&
      batch.stream.requestedPointCount === requestedPoints.length &&
      batch.stream.exhaustiveAllPoints === exhaustiveAllPoints &&
      batch.stream.checkedPointCount > 0 &&
      batch.stream.checkedPointCount <= requestedPoints.length &&
      batch.stream.checkedPointCount === checkedRecords.length &&
      batch.stream.checks.sourceReplayed &&
      batch.stream.checks.coordinateIdsValid &&
      batch.stream.checks.expectedCocycleSectionDigestMatches &&
      batch.stream.checks.directedEdgesAntisymmetric &&
      batch.stream.checks.rankTwoBoundariesClosed &&
      batch.stream.checks.exactNumberPackingBoundProved &&
      batch.stream.checks.everyRequestedPointStreamed ===
        (batch.stream.checkedPointCount === requestedPoints.length) &&
      batch.stream.checks.everyQuotientPointStreamed ===
        (exhaustiveAllPoints &&
          batch.stream.checkedPointCount === requestedPoints.length) &&
      batch.checkedPointIdsDigest === canonicalSha256(checkedPointIds) &&
      batch.stream.templateSetDigest ===
        computeStreamedTrackBLinearTemplateSetDigest({
          sourceHash: report.source.sourceHash,
          requestedPoints,
          checkedRecords,
        }) &&
      batch.stream.reportHash ===
        computeStreamedTrackBLinearTemplateStreamHash(batch.stream) &&
      outcomeMatchesPurpose &&
      (batch.stream.scanOutcome === "exhaustive-request"
        ? batch.stream.checkedPointCount === requestedPoints.length &&
          batch.stream.checks.everyRequestedPointStreamed
        : batch.stream.scanOutcome === "visitor-stopped");
  }
  const separatorBatches = report.templateStreaming.batches.filter(
    (batch) => batch.purpose === "separator-witness-scan",
  );
  const scannedIterations = report.search.iterations.filter(
    (iteration) =>
      iteration.exploration.kind === "operational-first-survivor-hit",
  );
  const firstBatch = report.templateStreaming.batches[0];
  const explicitBatches = report.templateStreaming.batches.filter(
    (batch) => batch.purpose === "explicit-antipodal-global-witness-replay",
  );
  batchProvenanceValid &&=
    firstBatch?.purpose === "selected-point-preload" &&
    canonicalSha256(firstBatch.requestedPointIds) ===
      canonicalSha256(report.search.initialPointIds) &&
    report.templateStreaming.batches.filter(
      (batch) => batch.purpose === "selected-point-preload",
    ).length === 1 &&
    separatorBatches.length === scannedIterations.length &&
    separatorBatches.every((batch, index) => {
      const iteration = scannedIterations[index];
      if (!iteration || batch.requestedPointIds !== null) return false;
      if (iteration.separator) {
        return (
          batch.stream.scanOutcome === "visitor-stopped" &&
          batch.stream.checkedPointCount === iteration.separator.point + 1 &&
          storedRecordByPoint.get(iteration.separator.point)?.templateDigest ===
            iteration.separator.templateDigest
        );
      }
      return (
        report.status === "global-passing-witness" &&
        batch.stream.scanOutcome === "exhaustive-request" &&
        batch.stream.checkedPointCount === report.source.degree
      );
    }) &&
    explicitBatches.length ===
      (report.status === "global-passing-witness" ? 1 : 0) &&
    (report.status !== "global-passing-witness" ||
      report.templateStreaming.batches.at(-1)?.purpose ===
        "explicit-antipodal-global-witness-replay") &&
    provenancePoints.size === storedRecordByPoint.size &&
    [...storedRecordByPoint.keys()].every((point) =>
      provenancePoints.has(point),
    );
  if (!batchProvenanceValid) {
    templateRecordsReplayed = false;
    errors.push("The reusable template-batch provenance is invalid.");
  }

  const selectedTemplates = new Map<number, StreamedTrackBLinearLinkTemplate>();
  const negativePointRecords: Array<[number, string, string]> = [];
  const positivePointRecords: Array<[number, string, string]> = [];
  const witnessCertification =
    report.polarityCertification.kind ===
    "explicit-all-point-antipodal-witnesses"
      ? report.polarityCertification
      : null;
  try {
    const replayStreamer = prepareStreamedTrackBLinearLinkTemplateStreamer({
      oracle: options.oracle,
      generalizedCompression: options.generalizedCompression,
      cocycleBasis: options.cocycleBasis,
    });
    const requestedPoints = report.templateRecords.map(
      (record) => record.point,
    );
    const replayedTemplateRecords: StreamedRank19AdaptiveTemplateRecord[] = [];
    const stream = replayStreamer.stream(
      { points: requestedPoints, includeAdjacency: true },
      (template) => {
        const replayedRecord: StreamedRank19AdaptiveTemplateRecord = {
          point: template.point,
          templateDigest: template.templateDigest,
          topologyDigest: template.topologyDigest,
          germCount: template.germs.length,
          linkEdgeCount: template.edges.length,
        };
        replayedTemplateRecords.push(replayedRecord);
        const storedRecord = storedRecordByPoint.get(template.point);
        if (
          !storedRecord ||
          canonicalSha256(storedRecord) !== canonicalSha256(replayedRecord)
        ) {
          throw new Error(
            `The stored adaptive template q${template.point} changed.`,
          );
        }
        if (selectedPointSet.has(template.point)) {
          selectedTemplates.set(template.point, template);
        }
        if (witnessCertification) {
          const onePointSource = {
            coordinateCount: 19,
            pointCount: 1,
            pointIds: [template.point],
            ambientPointCount: report.source.degree,
            sourceHash: report.source.sourceHash,
            latticeBasisDigest: report.source.latticeBasisDigest,
            cocycleSectionDigest: report.source.cocycleSectionDigest,
            heightRuleDigest: report.source.heightRuleDigest,
            templateAt(point: number): StreamedTrackBLinearLinkTemplate {
              if (point !== template.point)
                throw new Error(
                  "The replay requested an unbound point template.",
                );
              return template;
            },
          };
          for (const [sigma, certificate, sink] of [
            [-1, witnessCertification.negativeWitness, negativePointRecords],
            [1, witnessCertification.positiveWitness, positivePointRecords],
          ] as const) {
            const evaluation = createScalableStreamedHeightConeEvaluator({
              source: onePointSource,
              sigma,
              cacheTemplates: false,
            }).evaluatePrimitiveWitness(certificate.primitiveWitness);
            const resultRecord = evaluation.pointResultRecords[0];
            if (
              !evaluation.everyPointPasses ||
              evaluation.checkedPointCount !== 1 ||
              evaluation.firstFailure !== null ||
              !resultRecord ||
              resultRecord[0] !== template.point
            ) {
              throw new Error(
                `The stored sigma=${sigma} witness failed at q${template.point}.`,
              );
            }
            sink.push(resultRecord);
          }
        }
      },
    );
    const freshStaticEnvelopeDigest =
      templateStreamStaticEnvelopeDigest(stream);
    const { heightRuleDigest, ...freshHeightRuleBody } = stream.heightRule;
    templateRecordsReplayed &&=
      stream.schemaVersion === 1 &&
      stream.kind === "streamed-full-k-track-b-linear-link-template-stream" &&
      stream.reportHashAlgorithm === "sha256" &&
      stream.status === "completed" &&
      stream.scanOutcome === "exhaustive-request" &&
      stream.errors.length === 0 &&
      stream.checks.everyRequestedPointStreamed &&
      stream.checks.sourceReplayed &&
      stream.checks.coordinateIdsValid &&
      stream.checks.expectedCocycleSectionDigestMatches &&
      stream.checks.directedEdgesAntisymmetric &&
      stream.checks.rankTwoBoundariesClosed &&
      stream.checks.exactNumberPackingBoundProved &&
      heightRuleDigest === canonicalSha256(freshHeightRuleBody) &&
      stream.checkedPointCount === report.templateRecords.length &&
      stream.adjacencyIncluded &&
      stream.sourceHash === report.source.sourceHash &&
      stream.oracleStructureHash === report.source.oracleStructureHash &&
      stream.generalizedCompressionArchiveHash ===
        report.source.generalizedCompressionArchiveHash &&
      stream.latticeBasisDigest === report.source.latticeBasisDigest &&
      stream.cocycleSectionDigest === report.source.cocycleSectionDigest &&
      stream.heightRule.heightRuleDigest === report.source.heightRuleDigest &&
      stream.reportHash ===
        computeStreamedTrackBLinearTemplateStreamHash(stream) &&
      stream.templateSetDigest ===
        computeStreamedTrackBLinearTemplateSetDigest({
          sourceHash: report.source.sourceHash,
          requestedPoints,
          checkedRecords: report.templateRecords.map((record) => [
            record.point,
            record.templateDigest,
          ]),
        }) &&
      canonicalSha256(replayedTemplateRecords) ===
        canonicalSha256(report.templateRecords) &&
      report.templateStreaming.batches.every(
        (batch) =>
          templateStreamStaticEnvelopeDigest(batch.stream) ===
          freshStaticEnvelopeDigest,
      ) &&
      replayStreamer.statistics().preparationCount === 1 &&
      replayStreamer.statistics().streamInvocationCount === 1;
  } catch (error) {
    templateRecordsReplayed = false;
    errors.push(
      `The batched template replay threw: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    selectedTemplates.size !== selectedPointSet.size ||
    [...selectedPointSet].some((point) => !selectedTemplates.has(point))
  ) {
    templateRecordsReplayed = false;
    errors.push("The template records omit a selected obstruction point.");
  }

  let negativeFinalObjectReplayed = false;
  let positiveAntipodeReplayed = false;
  let explicitPolarityTransportBound = false;
  if (
    templateRecordsReplayed &&
    selectedTemplates.size > 0 &&
    report.status === "invariant-obstruction-cover"
  ) {
    const selectedSource = {
      coordinateCount: 19,
      pointCount: selectedPointIds.length,
      pointIds: selectedPointIds,
      ambientPointCount: report.source.degree,
      sourceHash: report.source.sourceHash,
      latticeBasisDigest: report.source.latticeBasisDigest,
      cocycleSectionDigest: report.source.cocycleSectionDigest,
      heightRuleDigest: report.source.heightRuleDigest,
      templateAt(point: number): StreamedTrackBLinearLinkTemplate {
        const template = selectedTemplates.get(point);
        if (!template)
          throw new Error(`Missing selected replay template q${point}.`);
        return template;
      },
    };
    try {
      const finalCover = report.search.finalCover;
      if (
        !finalCover ||
        report.polarityCertification.kind !==
          "explicit-antipodal-obstruction-cover"
      ) {
        throw new Error(
          "The invariant adaptive report omitted its two-polarity cover object.",
        );
      }
      const negativeEvaluator = createScalableStreamedHeightConeEvaluator({
        source: selectedSource,
        sigma: -1,
        cacheTemplates: true,
      });
      const negativeReplay = replayObstructionPrunedConeCover(finalCover, {
        verifyPrune: negativeEvaluator.verifyPrune,
        verifySurvivor: negativeEvaluator.verifyProvisional,
      });
      const negativeCoverPassed = negativeReplay.status === "passed";
      negativeFinalObjectReplayed =
        negativeCoverPassed &&
        finalCover.survivorLeafCount === 0 &&
        finalCover.pruneLeafCount > 0 &&
        finalCover.zeroCharacterLeafCount === 1 &&
        canonicalSha256(negativeReplay) ===
          canonicalSha256(report.polarityCertification.negativeReplay);
      const positiveEvaluator = createScalableStreamedHeightConeEvaluator({
        source: selectedSource,
        sigma: 1,
        cacheTemplates: true,
      });
      const derivedPositive = deriveAntipodalObstructionPrunedConeCover({
        source: finalCover,
        decide: positiveEvaluator.decideProvisional,
      });
      const positiveReplay = replayObstructionPrunedConeCover(
        report.polarityCertification.positiveCover,
        {
          verifyPrune: positiveEvaluator.verifyPrune,
          verifySurvivor: positiveEvaluator.verifyProvisional,
        },
      );
      positiveAntipodeReplayed =
        positiveReplay.status === "passed" &&
        report.polarityCertification.positiveCover.survivorLeafCount === 0 &&
        report.polarityCertification.positiveCover.pruneLeafCount > 0 &&
        report.polarityCertification.positiveCover.zeroCharacterLeafCount ===
          1 &&
        canonicalSha256(derivedPositive) ===
          canonicalSha256(report.polarityCertification.positiveCover) &&
        canonicalSha256(positiveReplay) ===
          canonicalSha256(report.polarityCertification.positiveReplay);
      explicitPolarityTransportBound =
        report.polarityCertification.transportDigest ===
        obstructionTransportDigest({
          sourceHash: report.source.sourceHash,
          selectedPointIds,
          negativeCoverHash: finalCover.coverHash,
          positiveCoverHash:
            report.polarityCertification.positiveCover.coverHash,
        });
    } catch (error) {
      errors.push(
        `The final adaptive cone object did not replay: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (report.status === "global-passing-witness" && witnessCertification) {
    const negative = witnessCertification.negativeWitness;
    const positive = witnessCertification.positiveWitness;
    const allPointsPresent =
      report.templateRecords.length === report.source.degree &&
      report.templateRecords.every((record, point) => record.point === point) &&
      negativePointRecords.length === report.source.degree &&
      positivePointRecords.length === report.source.degree;
    const certificateBindingsMatch = (
      certificate: StreamedRank19AllPointWitnessCertificate,
      sigma: -1 | 1,
    ): boolean =>
      certificate.schemaVersion === 1 &&
      certificate.kind === "streamed-rank19-all-point-witness-certificate" &&
      certificate.sigma === sigma &&
      certificate.sourceHash === report.source.sourceHash &&
      certificate.latticeBasisDigest === report.source.latticeBasisDigest &&
      certificate.cocycleSectionDigest === report.source.cocycleSectionDigest &&
      certificate.heightRuleDigest === report.source.heightRuleDigest &&
      certificate.degree === report.source.degree &&
      certificate.checkedPointCount === report.source.degree &&
      certificate.certificateDigest === witnessCertificateDigest(certificate);
    const negativeEvaluationDigest = canonicalSha256({
      sigma: -1,
      primitiveWitness: negative.primitiveWitness,
      scanRecords: negativePointRecords,
    });
    const positiveEvaluationDigest = canonicalSha256({
      sigma: 1,
      primitiveWitness: positive.primitiveWitness,
      scanRecords: positivePointRecords,
    });
    const storedSearchWitness = report.search.globalPassingWitness;
    negativeFinalObjectReplayed =
      templateRecordsReplayed &&
      allPointsPresent &&
      certificateBindingsMatch(negative, -1) &&
      negative.pointResultDigest === canonicalSha256(negativePointRecords) &&
      negative.witnessEvaluationDigest === negativeEvaluationDigest &&
      storedSearchWitness !== null &&
      canonicalSha256(negative.primitiveWitness) ===
        canonicalSha256(storedSearchWitness.primitiveWitness) &&
      negative.pointResultDigest === storedSearchWitness.pointResultDigest &&
      negative.witnessEvaluationDigest === storedSearchWitness.witnessHash;
    positiveAntipodeReplayed =
      templateRecordsReplayed &&
      allPointsPresent &&
      certificateBindingsMatch(positive, 1) &&
      canonicalSha256(positive.primitiveWitness) ===
        canonicalSha256(antipodalWitness(negative.primitiveWitness)) &&
      positive.pointResultDigest === canonicalSha256(positivePointRecords) &&
      positive.witnessEvaluationDigest === positiveEvaluationDigest;
    explicitPolarityTransportBound =
      witnessCertification.transportDigest ===
      witnessTransportDigest({
        sourceHash: report.source.sourceHash,
        negativeCertificateDigest: negative.certificateDigest,
        positiveCertificateDigest: positive.certificateDigest,
      });
  }

  const actualChecks = {
    negativeFinalObjectReplayed,
    positiveAntipodeReplayed,
    explicitPolarityTransportBound,
  };
  if (canonicalSha256(actualChecks) !== canonicalSha256(report.checks)) {
    errors.push("The stored adaptive check flags disagree with replay.");
  }
  if (!templateRecordsReplayed)
    errors.push("Not every adaptive template record replayed.");
  if (report.status !== "iteration-limit" && !negativeFinalObjectReplayed)
    errors.push("The final sigma=-1 adaptive object did not replay.");
  if (
    report.status !== "iteration-limit" &&
    (!positiveAntipodeReplayed || !explicitPolarityTransportBound)
  ) {
    errors.push("The explicit opposite-polarity object did not replay.");
  }

  const checks = {
    reportDigestValid,
    h1AndSourceBound,
    searchEnvelopeValid,
    templateRecordsReplayed,
    negativeFinalObjectReplayed,
    positiveAntipodeReplayed,
    explicitPolarityTransportBound,
  };
  const requiredChecks =
    report.status === "iteration-limit"
      ? [
          checks.reportDigestValid,
          checks.h1AndSourceBound,
          checks.searchEnvelopeValid,
          checks.templateRecordsReplayed,
        ]
      : Object.values(checks);
  return {
    status:
      requiredChecks.every(Boolean) && errors.length === 0
        ? "passed"
        : "failed",
    checks,
    errors,
  };
}

export function replayStreamedRank19AdaptiveRunnerArtifact(
  artifact: StreamedRank19AdaptiveRunnerArtifact,
  options: ReplayStreamedRank19AdaptivePointSearchOptions,
): StreamedRank19AdaptiveRunnerArtifactReplay {
  const storedArtifactDigestValid =
    artifact.schemaVersion === 1 &&
    artifact.kind === "compact-5-cube-rank19-adaptive-runner-artifact" &&
    artifact.artifactDigest ===
      canonicalSha256({ ...artifact, artifactDigest: "" });
  const reportReplay = replayStreamedRank19AdaptivePointSearchReport(
    artifact.report,
    options,
  );
  const errors = [
    ...(storedArtifactDigestValid
      ? []
      : ["The adaptive runner-artifact digest is invalid."]),
    ...reportReplay.errors,
  ];
  return {
    status:
      storedArtifactDigestValid && reportReplay.status === "passed"
        ? "passed"
        : "failed",
    storedArtifactDigestValid,
    reportReplay,
    errors,
  };
}
