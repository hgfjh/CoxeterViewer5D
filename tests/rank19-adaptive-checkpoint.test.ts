import { describe, expect, it } from "vitest";

import {
  replayRank19AdaptiveCheckpoint,
  sealRank19AdaptiveCheckpoint,
  type Rank19AdaptiveCheckpointBinding,
} from "../src/fibering/node/rank19AdaptiveCheckpoint";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const binding: Rank19AdaptiveCheckpointBinding = {
  oracleStructureHash: "1".repeat(64),
  actionRowsCanonicalSha256: "2".repeat(64),
  generalizedCompressionArchiveHash: "3".repeat(64),
  h1CertificateDigest: "4".repeat(64),
  latticeBasisDigest: "5".repeat(64),
  cocycleSectionDigest: "6".repeat(64),
  degree: 34_560,
};

function iteration() {
  const withoutDigest = {
    iteration: 0,
    testedPointIds: [0, 1, 2, 3, 4, 5, 6, 7],
    exploration: {
      kind: "operational-first-survivor-hit" as const,
      proofStatus: "operational-only-not-an-exhaustive-cover" as const,
      hitHash: "7".repeat(64),
      valueDigest: "8".repeat(64),
      depth: 2,
      visitedFeasibleNodeCount: 3,
      oracleQueryCount: 4,
      openedSplitNodeCount: 2,
      completedPruneLeafCount: 0,
      completedZeroCharacterLeafCount: 0,
      infeasibleBranchCount: 1,
      immediateReplayPassed: true as const,
    },
    provisionalWitnessHash: "8".repeat(64),
    separator: {
      point: 96,
      failures: ["descending-disconnected" as const],
      templateDigest: "9".repeat(64),
      linkDigest: "a".repeat(64),
    },
    iterationDigest: "",
  };
  return {
    ...withoutDigest,
    iterationDigest: canonicalSha256(withoutDigest),
  };
}

describe("rank-19 adaptive checkpoint replay", () => {
  it("binds selected points and the last completed iteration", () => {
    const checkpoint = sealRank19AdaptiveCheckpoint({
      schemaVersion: 2,
      kind: "compact-5-cube-rank19-adaptive-checkpoint",
      status: "running",
      binding,
      initialPointIds: [0, 1, 2, 3, 4, 5, 6, 7],
      selectedPointIds: [0, 1, 2, 3, 4, 5, 6, 7, 96],
      completedIterationCount: 1,
      lastIteration: iteration(),
      oracleCachePath: ".tmp/adaptive.oracle-cache.jsonl",
    });
    expect(replayRank19AdaptiveCheckpoint(checkpoint, binding)).toEqual({
      passed: true,
      errors: [],
      checkpoint,
    });

    const tampered = {
      ...checkpoint,
      selectedPointIds: [...checkpoint.selectedPointIds, 97],
    };
    expect(replayRank19AdaptiveCheckpoint(tampered, binding)).toMatchObject({
      passed: false,
    });
    expect(
      replayRank19AdaptiveCheckpoint(checkpoint, {
        ...binding,
        h1CertificateDigest: "b".repeat(64),
      }),
    ).toMatchObject({ passed: false });

    const legacy = {
      ...checkpoint,
      schemaVersion: 1,
      checkpointDigest: "",
    };
    legacy.checkpointDigest = canonicalSha256(legacy);
    expect(replayRank19AdaptiveCheckpoint(legacy, binding)).toMatchObject({
      passed: false,
    });

    const badCensus = structuredClone(checkpoint);
    if (
      badCensus.lastIteration.exploration.kind !==
      "operational-first-survivor-hit"
    ) {
      throw new Error("The checkpoint fixture lacks its operational hit.");
    }
    badCensus.lastIteration.exploration.oracleQueryCount += 1;
    badCensus.lastIteration.iterationDigest = canonicalSha256({
      ...badCensus.lastIteration,
      iterationDigest: "",
    });
    badCensus.checkpointDigest = canonicalSha256({
      ...badCensus,
      checkpointDigest: "",
    });
    expect(replayRank19AdaptiveCheckpoint(badCensus, binding)).toMatchObject({
      passed: false,
    });
  });
});
