import { canonicalSha256 } from "../../utils/canonicalSha256";
import type { AdaptiveStreamedHeightIteration } from "../adaptiveStreamedHeightSearch";

export interface Rank19AdaptiveCheckpointBinding {
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  generalizedCompressionArchiveHash: string;
  h1CertificateDigest: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  degree: number;
}

export interface Rank19AdaptiveCheckpoint {
  schemaVersion: 2;
  kind: "compact-5-cube-rank19-adaptive-checkpoint";
  status: "running" | "invariant-obstruction-cover" | "global-passing-witness";
  binding: Rank19AdaptiveCheckpointBinding;
  initialPointIds: number[];
  selectedPointIds: number[];
  completedIterationCount: number;
  lastIteration: AdaptiveStreamedHeightIteration;
  oracleCachePath: string;
  checkpointDigest: string;
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function canonicalPointIds(value: unknown, degree: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (point, index) =>
        Number.isInteger(point) &&
        point >= 0 &&
        point < degree &&
        (index === 0 || point > value[index - 1]),
    )
  );
}

function validIteration(
  iteration: AdaptiveStreamedHeightIteration,
  degree: number,
): boolean {
  if (
    typeof iteration !== "object" ||
    iteration === null ||
    !Number.isSafeInteger(iteration.iteration) ||
    iteration.iteration < 0 ||
    !canonicalPointIds(iteration.testedPointIds, degree) ||
    !validDigest(iteration.iterationDigest) ||
    iteration.iterationDigest !==
      canonicalSha256({ ...iteration, iterationDigest: "" })
  ) {
    return false;
  }
  const exploration = iteration.exploration;
  if (typeof exploration !== "object" || exploration === null) return false;
  if (exploration.kind === "complete-obstruction-cover") {
    return (
      validDigest(exploration.coverHash) &&
      exploration.replayPassed === true &&
      iteration.provisionalWitnessHash === null &&
      iteration.separator === null &&
      [
        exploration.nodeCount,
        exploration.oracleQueryCount,
        exploration.splitNodeCount,
        exploration.pruneLeafCount,
        exploration.zeroCharacterLeafCount,
        exploration.infeasibleBranchCount,
      ].every((entry) => Number.isSafeInteger(entry) && entry >= 0)
    );
  }
  return (
    exploration.kind === "operational-first-survivor-hit" &&
    exploration.proofStatus === "operational-only-not-an-exhaustive-cover" &&
    exploration.immediateReplayPassed === true &&
    validDigest(exploration.hitHash) &&
    validDigest(exploration.valueDigest) &&
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
    exploration.depth <= exploration.openedSplitNodeCount &&
    (iteration.separator === null ||
      (typeof iteration.separator === "object" &&
        Number.isInteger(iteration.separator.point) &&
        iteration.separator.point >= 0 &&
        iteration.separator.point < degree &&
        Array.isArray(iteration.separator.failures) &&
        iteration.separator.failures.length > 0 &&
        validDigest(iteration.separator.templateDigest) &&
        validDigest(iteration.separator.linkDigest)))
  );
}

export function sealRank19AdaptiveCheckpoint(
  checkpoint: Omit<Rank19AdaptiveCheckpoint, "checkpointDigest">,
): Rank19AdaptiveCheckpoint {
  const withoutDigest = {
    ...structuredClone(checkpoint),
    checkpointDigest: "",
  };
  return {
    ...checkpoint,
    checkpointDigest: canonicalSha256(withoutDigest),
  };
}

export function replayRank19AdaptiveCheckpoint(
  value: unknown,
  expectedBinding?: Rank19AdaptiveCheckpointBinding,
): {
  passed: boolean;
  errors: string[];
  checkpoint?: Rank19AdaptiveCheckpoint;
} {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return {
      passed: false,
      errors: ["The adaptive checkpoint is not an object."],
    };
  }
  const checkpoint = value as Rank19AdaptiveCheckpoint;
  if (
    checkpoint.schemaVersion !== 2 ||
    checkpoint.kind !== "compact-5-cube-rank19-adaptive-checkpoint"
  ) {
    errors.push("The adaptive checkpoint has the wrong schema or kind.");
  }
  if (
    checkpoint.status !== "running" &&
    checkpoint.status !== "invariant-obstruction-cover" &&
    checkpoint.status !== "global-passing-witness"
  ) {
    errors.push("The adaptive checkpoint has an invalid status.");
  }
  const binding = checkpoint.binding;
  if (
    typeof binding !== "object" ||
    binding === null ||
    !validDigest(binding.oracleStructureHash) ||
    !validDigest(binding.actionRowsCanonicalSha256) ||
    !validDigest(binding.generalizedCompressionArchiveHash) ||
    !validDigest(binding.h1CertificateDigest) ||
    !validDigest(binding.latticeBasisDigest) ||
    !validDigest(binding.cocycleSectionDigest) ||
    !Number.isInteger(binding.degree) ||
    binding.degree < 1
  ) {
    errors.push("The adaptive checkpoint has an invalid source binding.");
  } else {
    if (!canonicalPointIds(checkpoint.initialPointIds, binding.degree)) {
      errors.push("The adaptive checkpoint initial points are invalid.");
    }
    if (!canonicalPointIds(checkpoint.selectedPointIds, binding.degree)) {
      errors.push("The adaptive checkpoint selected points are invalid.");
    } else if (
      checkpoint.initialPointIds?.some(
        (point) => !checkpoint.selectedPointIds.includes(point),
      )
    ) {
      errors.push("The adaptive checkpoint dropped an initial point.");
    }
  }
  if (
    !Number.isSafeInteger(checkpoint.completedIterationCount) ||
    checkpoint.completedIterationCount < 1
  ) {
    errors.push("The adaptive checkpoint iteration count is invalid.");
  }
  let lastIterationValid = false;
  try {
    lastIterationValid =
      typeof checkpoint.lastIteration === "object" &&
      checkpoint.lastIteration !== null &&
      Boolean(binding) &&
      Number.isInteger(binding.degree) &&
      validIteration(checkpoint.lastIteration, binding.degree);
  } catch {
    lastIterationValid = false;
  }
  if (!lastIterationValid) {
    errors.push(
      "The adaptive checkpoint last iteration has an invalid digest.",
    );
  }
  if (
    binding &&
    Number.isInteger(binding.degree) &&
    canonicalPointIds(checkpoint.selectedPointIds, binding.degree) &&
    checkpoint.lastIteration &&
    lastIterationValid
  ) {
    const last = checkpoint.lastIteration;
    const expectedSelected = last.separator
      ? [...last.testedPointIds, last.separator.point].sort(
          (left, right) => left - right,
        )
      : last.testedPointIds;
    const statusShapeValid =
      canonicalSha256(expectedSelected) ===
        canonicalSha256(checkpoint.selectedPointIds) &&
      (checkpoint.status === "running"
        ? last.exploration.kind === "operational-first-survivor-hit" &&
          last.separator !== null
        : checkpoint.status === "global-passing-witness"
          ? last.exploration.kind === "operational-first-survivor-hit" &&
            last.separator === null
          : last.exploration.kind === "complete-obstruction-cover" &&
            last.separator === null);
    if (!statusShapeValid) {
      errors.push(
        "The adaptive checkpoint status disagrees with its iteration.",
      );
    }
  }
  if (typeof checkpoint.oracleCachePath !== "string") {
    errors.push("The adaptive checkpoint oracle-cache path is invalid.");
  }
  if (
    !validDigest(checkpoint.checkpointDigest) ||
    checkpoint.checkpointDigest !==
      canonicalSha256({ ...checkpoint, checkpointDigest: "" })
  ) {
    errors.push("The adaptive checkpoint digest is invalid.");
  }
  if (
    expectedBinding &&
    canonicalSha256(binding) !== canonicalSha256(expectedBinding)
  ) {
    errors.push("The adaptive checkpoint belongs to another exact source.");
  }
  return errors.length === 0
    ? { passed: true, errors: [], checkpoint }
    : { passed: false, errors: [...new Set(errors)].sort() };
}
