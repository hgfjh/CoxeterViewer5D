import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  replayOperationalFirstSurvivorHit,
  replayObstructionPrunedConeCover,
  searchFirstSurvivorOrBuildObstructionPrunedConeCoverAsync,
  type AsyncExactConeFeasibilityOracle,
  type ObstructionPrunedConeCover,
  type OperationalFirstSurvivorHit,
  type ObstructionPrunedConeTraversalStrategy,
} from "./scalableHeightCone";
import {
  createScalableStreamedHeightConeEvaluator,
  type StreamedHeightConeTemplateSource,
  type StreamedHeightLinkFailurePrune,
  type StreamedHeightPrimitiveWitnessEvaluation,
  type StreamedHeightProvisionalWitnessLeaf,
} from "./streamedHeightConeSearch";
import type {
  StreamedTrackBLinearLinkTemplate,
  StreamedTrackBLinkFailureKind,
} from "./streamedTrackB";

type AdaptiveCover = ObstructionPrunedConeCover<
  StreamedHeightLinkFailurePrune,
  StreamedHeightProvisionalWitnessLeaf
>;

export interface AdaptiveStreamedHeightTemplateSource extends Omit<
  StreamedHeightConeTemplateSource,
  "pointCount" | "pointIds" | "templateAt"
> {
  ambientPointCount: number;
  templateAt(point: number): StreamedTrackBLinearLinkTemplate;
  /** Prepare a selected point set in one source-bound batch when available. */
  preparePoints?(pointIds: readonly number[]): void;
  /** Stream one fixed witness point-major without retaining point templates. */
  scanPrimitiveWitness?(
    primitiveWitness: readonly string[],
    sigma: -1 | 1,
    onPoint?: (completed: number, total: number, point: number) => void,
  ): StreamedHeightPrimitiveWitnessEvaluation;
}

export interface AdaptiveStreamedHeightIteration {
  iteration: number;
  testedPointIds: number[];
  exploration:
    | {
        kind: "complete-obstruction-cover";
        coverHash: string;
        nodeCount: number;
        oracleQueryCount: number;
        splitNodeCount: number;
        pruneLeafCount: number;
        zeroCharacterLeafCount: number;
        infeasibleBranchCount: number;
        replayPassed: true;
      }
    | {
        kind: "operational-first-survivor-hit";
        proofStatus: "operational-only-not-an-exhaustive-cover";
        hitHash: string;
        valueDigest: string;
        depth: number;
        visitedFeasibleNodeCount: number;
        oracleQueryCount: number;
        openedSplitNodeCount: number;
        completedPruneLeafCount: number;
        completedZeroCharacterLeafCount: number;
        infeasibleBranchCount: number;
        immediateReplayPassed: true;
      };
  provisionalWitnessHash: string | null;
  separator: {
    point: number;
    failures: StreamedTrackBLinkFailureKind[];
    templateDigest: string;
    linkDigest: string;
  } | null;
  iterationDigest: string;
}

export interface AdaptiveStreamedHeightSearchResult {
  schemaVersion: 2;
  kind: "adaptive-streamed-height-obstruction-point-search";
  status:
    | "invariant-obstruction-cover"
    | "global-passing-witness"
    | "iteration-limit";
  method: "first-survivor-depth-first-point-separation-and-exhaustive-terminal-cover";
  sourceHash: string;
  sigma: -1 | 1;
  rank: number;
  ambientPointCount: number;
  initialPointIds: number[];
  selectedPointIds: number[];
  iterations: AdaptiveStreamedHeightIteration[];
  /** Present exactly for the exhaustive invariant-obstruction terminal case. */
  finalCover: AdaptiveCover | null;
  globalPassingWitness: {
    primitiveWitness: string[];
    checkedPointCount: number;
    pointResultDigest: string;
    witnessHash: string;
  } | null;
  resultDigest: string;
}

export interface AdaptiveStreamedHeightSearchOptions {
  source: AdaptiveStreamedHeightTemplateSource;
  exactConeOracle: AsyncExactConeFeasibilityOracle;
  sigma: -1 | 1;
  initialPointIds?: readonly number[];
  maxIterations?: number;
  maxConeNodes?: number;
  maxOracleQueries?: number;
  /** Operational DFS order; canonical maximizes reuse of older exact caches. */
  traversalStrategy?: ObstructionPrunedConeTraversalStrategy;
  onProgress?: (event: {
    stage: "iteration-search" | "witness-scan";
    iteration: number;
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

function validatePointIds(
  ambientPointCount: number,
  supplied?: readonly number[],
): number[] {
  const points = supplied ? [...supplied] : [0];
  points.sort((left, right) => left - right);
  if (
    points.length === 0 ||
    points.some(
      (point, index) =>
        !Number.isInteger(point) ||
        point < 0 ||
        point >= ambientPointCount ||
        (index > 0 && point === points[index - 1]),
    )
  ) {
    throw new Error(
      "Adaptive obstruction points must be distinct quotient-point ids in range.",
    );
  }
  return points;
}

function operationalExploration(
  hit: OperationalFirstSurvivorHit<StreamedHeightProvisionalWitnessLeaf>,
): AdaptiveStreamedHeightIteration["exploration"] {
  return {
    kind: hit.kind,
    proofStatus: hit.proofStatus,
    hitHash: hit.hitHash,
    valueDigest: hit.valueDigest,
    depth: hit.depth,
    visitedFeasibleNodeCount: hit.visitedFeasibleNodeCount,
    oracleQueryCount: hit.oracleQueryCount,
    openedSplitNodeCount: hit.openedSplitNodeCount,
    completedPruneLeafCount: hit.completedPruneLeafCount,
    completedZeroCharacterLeafCount: hit.completedZeroCharacterLeafCount,
    infeasibleBranchCount: hit.infeasibleBranchCount,
    immediateReplayPassed: true,
  };
}

function completeExploration(
  cover: AdaptiveCover,
): AdaptiveStreamedHeightIteration["exploration"] {
  return {
    kind: "complete-obstruction-cover",
    coverHash: cover.coverHash,
    nodeCount: cover.nodeCount,
    oracleQueryCount: cover.oracleQueryCount,
    splitNodeCount: cover.splitNodeCount,
    pruneLeafCount: cover.pruneLeafCount,
    zeroCharacterLeafCount: cover.zeroCharacterLeafCount,
    infeasibleBranchCount: cover.infeasibleBranchCount,
    replayPassed: true,
  };
}

/**
 * Cutting-plane search for a small obstruction-point set.
 *
 * The exploratory DFS stops at its first provisional survivor. That hit is
 * operational: it is replayed immediately, then used only to choose the next
 * quotient point. The function stores a complete cone cover only when an
 * exhaustive DFS finds no survivor. Conversely, `global-passing-witness`
 * means the stored primitive witness was checked at every quotient point.
 */
export async function runAdaptiveStreamedHeightSearch(
  options: AdaptiveStreamedHeightSearchOptions,
): Promise<AdaptiveStreamedHeightSearchResult> {
  const ambientPointCount = options.source.ambientPointCount;
  if (
    !Number.isInteger(ambientPointCount) ||
    ambientPointCount < 1 ||
    !Number.isInteger(options.source.coordinateCount) ||
    options.source.coordinateCount < 1
  ) {
    throw new Error("The adaptive height source has invalid dimensions.");
  }
  const initialPointIds = validatePointIds(
    ambientPointCount,
    options.initialPointIds,
  );
  const selected = new Set(initialPointIds);
  const maxIterations = options.maxIterations ?? ambientPointCount + 1;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error("The adaptive height iteration cap must be positive.");
  }
  const evaluatorForPoint = (point: number) => {
    return createScalableStreamedHeightConeEvaluator({
      source: {
        ...options.source,
        pointCount: 1,
        pointIds: [point],
        ambientPointCount,
        templateAt: options.source.templateAt,
      },
      sigma: options.sigma,
      // A witness scan visits every quotient point with a fresh one-point
      // evaluator. Retaining that evaluator's prepared template until the
      // next GC cycle can otherwise make a full 34,560-point scan look like
      // an unbounded cache.
      cacheTemplates: false,
    });
  };
  const iterations: AdaptiveStreamedHeightIteration[] = [];
  let finalCover: AdaptiveCover | null = null;
  let globalPassingWitness: AdaptiveStreamedHeightSearchResult["globalPassingWitness"] =
    null;
  let status: AdaptiveStreamedHeightSearchResult["status"] = "iteration-limit";

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const testedPointIds = [...selected].sort((left, right) => left - right);
    options.source.preparePoints?.(testedPointIds);
    options.onProgress?.({
      stage: "iteration-search",
      iteration,
      completed: 0,
      total: 1,
    });
    const evaluator = createScalableStreamedHeightConeEvaluator({
      source: {
        ...options.source,
        pointCount: testedPointIds.length,
        pointIds: testedPointIds,
        ambientPointCount,
        templateAt: options.source.templateAt,
      },
      sigma: options.sigma,
      cacheTemplates: true,
    });
    const exploration =
      await searchFirstSurvivorOrBuildObstructionPrunedConeCoverAsync({
        sourceHash: options.source.sourceHash,
        rank: options.source.coordinateCount,
        oracle: options.exactConeOracle,
        decide: evaluator.decideProvisional,
        verifySurvivor: evaluator.verifyProvisional,
        ...(options.maxConeNodes === undefined
          ? {}
          : { maxNodes: options.maxConeNodes }),
        ...(options.maxOracleQueries === undefined
          ? {}
          : { maxOracleQueries: options.maxOracleQueries }),
        ...(options.traversalStrategy === undefined
          ? {}
          : { traversalStrategy: options.traversalStrategy }),
      });
    options.onProgress?.({
      stage: "iteration-search",
      iteration,
      completed: 1,
      total: 1,
    });

    if (exploration.kind === "oracle-backed-obstruction-pruned-cone-cover") {
      const replay = replayObstructionPrunedConeCover(exploration, {
        verifyPrune: evaluator.verifyPrune,
        verifySurvivor: evaluator.verifyProvisional,
      });
      if (replay.status !== "passed" || exploration.survivorLeafCount !== 0) {
        throw new Error(
          `The adaptive terminal cover failed replay: ${replay.errors.join(" ")}`,
        );
      }
      finalCover = exploration;
      const withoutDigest = {
        iteration,
        testedPointIds,
        exploration: completeExploration(exploration),
        provisionalWitnessHash: null,
        separator: null,
        iterationDigest: "",
      };
      iterations.push({
        ...withoutDigest,
        iterationDigest: canonicalSha256(withoutDigest),
      });
      status = "invariant-obstruction-cover";
      options.onIteration?.({
        iteration: iterations.at(-1)!,
        selectedPointIds: testedPointIds,
        status,
      });
      break;
    }

    const hitReplay = replayOperationalFirstSurvivorHit(exploration, {
      verifySurvivor: evaluator.verifyProvisional,
    });
    if (hitReplay.status !== "passed") {
      throw new Error(
        `The adaptive first-survivor hit failed immediate replay: ${hitReplay.errors.join(" ")}`,
      );
    }
    const provisional = exploration.value;

    let scanRecords: Array<[number, string, string]> = [];
    let separator: AdaptiveStreamedHeightIteration["separator"] = null;
    if (options.source.scanPrimitiveWitness) {
      const evaluation = options.source.scanPrimitiveWitness(
        provisional.primitiveWitness,
        options.sigma,
        (completed, total, point) => {
          options.onProgress?.({
            stage: "witness-scan",
            iteration,
            completed,
            total,
            point,
          });
        },
      );
      scanRecords = evaluation.pointResultRecords;
      separator = evaluation.firstFailure
        ? {
            point: evaluation.firstFailure.point,
            failures: [...evaluation.firstFailure.failures],
            templateDigest: evaluation.firstFailure.templateDigest,
            linkDigest: evaluation.firstFailure.linkDigest,
          }
        : null;
      if (
        evaluation.checkedPointCount !== scanRecords.length ||
        evaluation.checkedPointCount < 1 ||
        evaluation.checkedPointCount > ambientPointCount ||
        evaluation.pointResultDigest !== canonicalSha256(scanRecords) ||
        scanRecords.some((record, point) => record[0] !== point) ||
        (evaluation.firstFailure !== null &&
          (evaluation.firstFailure.point !== scanRecords.length - 1 ||
            evaluation.firstFailure.failures.length === 0 ||
            scanRecords.at(-1)?.[1] !==
              evaluation.firstFailure.templateDigest ||
            scanRecords.at(-1)?.[2] !== evaluation.firstFailure.linkDigest)) ||
        (separator === null
          ? !evaluation.everyPointPasses ||
            scanRecords.length !== ambientPointCount
          : evaluation.everyPointPasses)
      ) {
        throw new Error("The batched adaptive witness scan is inconsistent.");
      }
    } else {
      for (let point = 0; point < ambientPointCount; point += 1) {
        options.onProgress?.({
          stage: "witness-scan",
          iteration,
          completed: point,
          total: ambientPointCount,
          point,
        });
        const evaluation = evaluatorForPoint(point).evaluatePrimitiveWitness(
          provisional.primitiveWitness,
        );
        if (evaluation.checkedPointCount !== 1) {
          throw new Error(
            "A one-point adaptive witness scan checked extra points.",
          );
        }
        const firstFailure = evaluation.firstFailure;
        const pointRecord = evaluation.pointResultRecords[0];
        if (!pointRecord || pointRecord[0] !== point) {
          throw new Error(
            "A one-point adaptive scan returned the wrong record.",
          );
        }
        scanRecords.push(pointRecord);
        if (firstFailure) {
          separator = {
            point,
            failures: [...firstFailure.failures],
            templateDigest: firstFailure.templateDigest,
            linkDigest: firstFailure.linkDigest,
          };
          break;
        }
      }
    }
    options.onProgress?.({
      stage: "witness-scan",
      iteration,
      completed: separator ? separator.point + 1 : ambientPointCount,
      total: ambientPointCount,
      ...(separator ? { point: separator.point } : {}),
    });

    const iterationWithoutDigest = {
      iteration,
      testedPointIds,
      exploration: operationalExploration(exploration),
      provisionalWitnessHash: canonicalSha256(provisional),
      separator,
      iterationDigest: "",
    };
    iterations.push({
      ...iterationWithoutDigest,
      iterationDigest: canonicalSha256(iterationWithoutDigest),
    });
    if (!separator) {
      globalPassingWitness = {
        primitiveWitness: [...provisional.primitiveWitness],
        checkedPointCount: ambientPointCount,
        pointResultDigest: canonicalSha256(scanRecords),
        witnessHash: canonicalSha256({
          sigma: options.sigma,
          primitiveWitness: provisional.primitiveWitness,
          scanRecords,
        }),
      };
      status = "global-passing-witness";
      options.onIteration?.({
        iteration: iterations.at(-1)!,
        selectedPointIds: testedPointIds,
        status,
      });
      break;
    }
    if (selected.has(separator.point)) {
      throw new Error(
        "An adaptive provisional witness failed at an already-tested point.",
      );
    }
    selected.add(separator.point);
    options.onIteration?.({
      iteration: iterations.at(-1)!,
      selectedPointIds: [...selected].sort((left, right) => left - right),
      status: "continuing",
    });
  }

  if (iterations.length === 0) {
    throw new Error("The adaptive height search produced no iteration.");
  }
  if (
    (status === "invariant-obstruction-cover") !== (finalCover !== null) ||
    (status === "global-passing-witness") !== (globalPassingWitness !== null)
  ) {
    throw new Error("The adaptive terminal object disagrees with its status.");
  }
  const withoutDigest = {
    schemaVersion: 2 as const,
    kind: "adaptive-streamed-height-obstruction-point-search" as const,
    status,
    method:
      "first-survivor-depth-first-point-separation-and-exhaustive-terminal-cover" as const,
    sourceHash: options.source.sourceHash,
    sigma: options.sigma,
    rank: options.source.coordinateCount,
    ambientPointCount,
    initialPointIds,
    selectedPointIds: [...selected].sort((left, right) => left - right),
    iterations,
    finalCover,
    globalPassingWitness,
    resultDigest: "",
  };
  return { ...withoutDigest, resultDigest: canonicalSha256(withoutDigest) };
}
