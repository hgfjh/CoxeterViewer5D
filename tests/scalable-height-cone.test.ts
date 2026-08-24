import { describe, expect, it } from "vitest";

import { canonicalSha256 } from "../src/utils/canonicalSha256";
import {
  buildExactConeOracleRequest,
  buildObstructionPrunedConeCover,
  buildObstructionPrunedConeCoverAsync,
  computeOperationalFirstSurvivorHitHash,
  replayOperationalFirstSurvivorHit,
  searchFirstSurvivorOrBuildObstructionPrunedConeCoverAsync,
  transformExactConeOracleCertificateAntipodally,
  replayExactConeOracleCertificate,
  replayObstructionPrunedConeCover,
  sealExactConeOracleCertificate,
  type ExactConeFeasibilityOracle,
  type ExactConeOracleCertificate,
  type ExactConeOracleFeasibleResult,
  type ExactConeOracleInfeasibleResult,
  type ExactConeOracleRequest,
  type BuildObstructionPrunedConeCoverOptions,
  type ObstructionPrunedConeContext,
  type OperationalFirstSurvivorHit,
} from "../src/fibering/scalableHeightCone";

const SOURCE_HASH = "1".repeat(64);
const TRANSCRIPT_HASH = "2".repeat(64);

function coordinate(rank: number, index: number, value = 1): number[] {
  return Array.from({ length: rank }, (_, column) =>
    column === index ? value : 0,
  );
}

function certificate(
  request: ExactConeOracleRequest,
  result: ExactConeOracleFeasibleResult | ExactConeOracleInfeasibleResult,
): ExactConeOracleCertificate {
  return sealExactConeOracleCertificate({
    schemaVersion: 1,
    kind: "external-exact-height-cone-certificate",
    requestHash: request.requestHash,
    backend: {
      id: "test-exact-rational-oracle",
      version: "1",
      algorithm: "fixture",
      transcriptSha256: TRANSCRIPT_HASH,
    },
    result,
    certificateHash: "",
  });
}

describe("scalable exact height-cone certificates", () => {
  it("replays a higher-rank software fixture without asserting an H1 rank", () => {
    const rank = 19;
    const request = buildExactConeOracleRequest({
      sourceHash: SOURCE_HASH,
      rank,
      assignments: [
        // Canonicalization reverses both this normal and its open-half-space
        // label, preserving the inequality (-2 e_0).x > 0.
        { normal: coordinate(rank, 0, -2), sign: 1 },
        { normal: coordinate(rank, 1), sign: 0 },
      ],
    });
    expect(request.assignments[0]).toMatchObject({
      normal: coordinate(rank, 0).map(String),
      sign: -1,
    });
    const result: ExactConeOracleFeasibleResult = {
      kind: "feasible",
      equalityRank: 1,
      dimension: 18,
      primitiveWitness: coordinate(rank, 0, -1).map(String),
    };
    expect(
      replayExactConeOracleCertificate(request, certificate(request, result)),
    ).toEqual({ passed: true, errors: [] });
  });

  it("checks an exact Farkas obstruction in a higher-rank fixture", () => {
    const rank = 19;
    const sum = coordinate(rank, 0);
    sum[1] = 1;
    const request = buildExactConeOracleRequest({
      sourceHash: SOURCE_HASH,
      rank,
      assignments: [
        { normal: coordinate(rank, 0), sign: 1 },
        { normal: coordinate(rank, 1), sign: 1 },
        { normal: sum, sign: -1 },
      ],
    });
    const result: ExactConeOracleInfeasibleResult = {
      kind: "infeasible",
      inequalityMultipliers: [0, 1, 2].map((assignmentIndex) => ({
        assignmentIndex,
        value: "1",
      })),
      equalityMultipliers: [],
    };
    const sealed = certificate(request, result);
    expect(replayExactConeOracleCertificate(request, sealed)).toEqual({
      passed: true,
      errors: [],
    });

    const falseObstruction = certificate(request, {
      ...result,
      inequalityMultipliers: result.inequalityMultipliers.slice(0, 2),
    });
    expect(
      replayExactConeOracleCertificate(request, falseObstruction),
    ).toMatchObject({ passed: false });
  });

  it("transports primal and Farkas certificates through the antipodal map", () => {
    const rank = 2;
    const sum = [1, 1];
    const sourceRequest = buildExactConeOracleRequest({
      sourceHash: SOURCE_HASH,
      rank,
      assignments: [
        { normal: coordinate(rank, 0), sign: 1 },
        { normal: coordinate(rank, 1), sign: 0 },
        { normal: sum, sign: -1 },
      ],
    });
    const targetRequest = buildExactConeOracleRequest({
      sourceHash: SOURCE_HASH,
      rank,
      assignments: sourceRequest.assignments.map((assignment) => ({
        normal: assignment.normal,
        sign: (assignment.sign === 0 ? 0 : -assignment.sign) as -1 | 0 | 1,
      })),
    });
    const sourceCertificate = certificate(sourceRequest, {
      kind: "infeasible",
      inequalityMultipliers: [0, 2].map((assignmentIndex) => ({
        assignmentIndex,
        value: "1",
      })),
      equalityMultipliers: [{ assignmentIndex: 1, value: "1" }],
    });
    const targetCertificate = transformExactConeOracleCertificateAntipodally(
      sourceRequest,
      targetRequest,
      sourceCertificate,
    );
    expect(targetCertificate.result).toMatchObject({
      kind: "infeasible",
      equalityMultipliers: [{ assignmentIndex: 1, value: "-1" }],
    });
    expect(
      replayExactConeOracleCertificate(targetRequest, targetCertificate),
    ).toEqual({ passed: true, errors: [] });
  });
});

function coordinateOracle(): ExactConeFeasibilityOracle {
  return {
    solve(request): ExactConeOracleCertificate {
      const witness: number[] = [0, 0];
      const assignedCoordinates = new Set<number>();
      let equalityRank = 0;
      for (const assignment of request.assignments) {
        const coordinateIndex = assignment.normal[0] === "1" ? 0 : 1;
        assignedCoordinates.add(coordinateIndex);
        if (assignment.sign === 0) {
          equalityRank += 1;
        } else {
          witness[coordinateIndex] = assignment.sign;
        }
      }
      const dimension = request.rank - equalityRank;
      if (dimension > 0 && witness.some((value) => Boolean(value)) === false) {
        const freeCoordinate = [0, 1].find(
          (index) => !assignedCoordinates.has(index),
        );
        if (freeCoordinate === undefined) {
          throw new Error("The fixture failed to find a free coordinate.");
        }
        witness[freeCoordinate] = 1;
      }
      return certificate(request, {
        kind: "feasible",
        equalityRank,
        dimension,
        primitiveWitness: dimension === 0 ? null : witness.map(String),
      });
    },
  };
}

interface FixturePruneProof {
  normalKey: string;
  sign: -1 | 1;
  obstruction: "fixture-directed-link-failure";
}

describe("obstruction-pruned exact cone cover", () => {
  it("splits only requested normals and is identical with an async oracle", async () => {
    const first = coordinate(2, 0);
    const second = coordinate(2, 1);
    const decide: BuildObstructionPrunedConeCoverOptions<
      FixturePruneProof,
      never
    >["decide"] = (context) => {
      const firstAssignment = context.request.assignments.find(
        (entry) => entry.normalKey === "1,0",
      );
      if (firstAssignment === undefined)
        return { kind: "split", normal: first };
      if (firstAssignment.sign !== 0) {
        return {
          kind: "prune",
          proof: {
            normalKey: firstAssignment.normalKey,
            sign: firstAssignment.sign,
            obstruction: "fixture-directed-link-failure",
          },
        };
      }
      const secondAssignment = context.request.assignments.find(
        (entry) => entry.normalKey === "0,1",
      );
      if (secondAssignment === undefined) {
        return { kind: "split", normal: second };
      }
      if (secondAssignment.sign === 0) {
        throw new Error("The zero character must be handled before decide().");
      }
      return {
        kind: "prune",
        proof: {
          normalKey: secondAssignment.normalKey,
          sign: secondAssignment.sign,
          obstruction: "fixture-directed-link-failure",
        },
      };
    };
    const syncOracle = coordinateOracle();
    const cover = buildObstructionPrunedConeCover<FixturePruneProof, never>({
      sourceHash: SOURCE_HASH,
      rank: 2,
      oracle: syncOracle,
      decide,
    });

    const exhaustiveRequestHashes: string[] = [];
    const asyncCover = await buildObstructionPrunedConeCoverAsync<
      FixturePruneProof,
      never
    >({
      sourceHash: SOURCE_HASH,
      rank: 2,
      oracle: {
        solve: async (request) => {
          exhaustiveRequestHashes.push(request.requestHash);
          return syncOracle.solve(request);
        },
      },
      decide,
    });
    expect(asyncCover).toEqual(cover);
    const witnessLastCover = await buildObstructionPrunedConeCoverAsync<
      FixturePruneProof,
      never
    >({
      sourceHash: SOURCE_HASH,
      rank: 2,
      oracle: { solve: async (request) => syncOracle.solve(request) },
      decide,
      traversalStrategy: "witness-last",
    });
    expect(witnessLastCover).toEqual(asyncCover);
    expect(witnessLastCover.coverHash).toBe(asyncCover.coverHash);
    const fallbackRequestHashes: string[] = [];
    let survivorVerificationCount = 0;
    const earlyExitExhaustion =
      await searchFirstSurvivorOrBuildObstructionPrunedConeCoverAsync<
        FixturePruneProof,
        never
      >({
        sourceHash: SOURCE_HASH,
        rank: 2,
        oracle: {
          solve: async (request) => {
            fallbackRequestHashes.push(request.requestHash);
            return syncOracle.solve(request);
          },
        },
        decide,
        verifySurvivor: () => {
          survivorVerificationCount += 1;
          return false;
        },
      });
    expect(earlyExitExhaustion).toEqual(cover);
    expect(fallbackRequestHashes).toEqual(exhaustiveRequestHashes);
    expect(survivorVerificationCount).toBe(0);

    expect(cover).toMatchObject({
      nodeCount: 7,
      oracleQueryCount: 7,
      splitNodeCount: 2,
      pruneLeafCount: 4,
      survivorLeafCount: 0,
      zeroCharacterLeafCount: 1,
      infeasibleBranchCount: 0,
    });
    const replay = replayObstructionPrunedConeCover(cover, {
      verifyPrune(context, proof) {
        const assignment = context.request.assignments.find(
          (entry) => entry.normalKey === proof.normalKey,
        );
        return (
          proof.obstruction === "fixture-directed-link-failure" &&
          assignment?.sign === proof.sign
        );
      },
    });
    expect(replay).toMatchObject({ status: "passed", errors: [] });

    const badEnvelope = structuredClone(cover) as Omit<
      typeof cover,
      "schemaVersion"
    > & {
      schemaVersion: number;
    };
    badEnvelope.schemaVersion = 2;
    badEnvelope.coverHash = canonicalSha256({
      ...badEnvelope,
      coverHash: "",
    });
    expect(
      replayObstructionPrunedConeCover(badEnvelope as unknown as typeof cover, {
        verifyPrune: () => true,
      }),
    ).toMatchObject({
      status: "failed",
      checks: { storedCoverHashValid: true, geometryComplete: false },
    });

    const badDepth = structuredClone(cover);
    badDepth.root.depth = 1;
    badDepth.root.nodeHash = canonicalSha256({
      ...badDepth.root,
      nodeHash: "",
    });
    badDepth.coverHash = canonicalSha256({ ...badDepth, coverHash: "" });
    expect(
      replayObstructionPrunedConeCover(badDepth, {
        verifyPrune: () => true,
      }),
    ).toMatchObject({ status: "failed", checks: { geometryComplete: false } });

    const scaledSplit = structuredClone(cover);
    if (scaledSplit.root.decision.kind !== "split") {
      throw new Error("The fixture root is not a split.");
    }
    scaledSplit.root.decision.normal = scaledSplit.root.decision.normal.map(
      (value) => String(2n * BigInt(value)),
    );
    scaledSplit.root.nodeHash = canonicalSha256({
      ...scaledSplit.root,
      nodeHash: "",
    });
    scaledSplit.coverHash = canonicalSha256({
      ...scaledSplit,
      coverHash: "",
    });
    expect(
      replayObstructionPrunedConeCover(scaledSplit, {
        verifyPrune: () => true,
      }),
    ).toMatchObject({ status: "failed", checks: { geometryComplete: false } });
  });

  it("stops at the first caller-verified survivor and replays its operational hit", async () => {
    interface FixtureSurvivor {
      assignmentSign: -1;
      primitiveWitness: string[];
    }
    const first = coordinate(2, 0);
    const second = coordinate(2, 1);
    const verifySurvivor = (
      context: ObstructionPrunedConeContext,
      value: FixtureSurvivor,
    ) => {
      const firstAssignment = context.request.assignments.find(
        (entry) => entry.normalKey === "1,0",
      );
      return (
        firstAssignment?.sign === value.assignmentSign &&
        value.primitiveWitness.join(",") ===
          context.feasibility.primitiveWitness?.join(",")
      );
    };
    const decide: BuildObstructionPrunedConeCoverOptions<
      FixturePruneProof,
      FixtureSurvivor
    >["decide"] = (context) => {
      const firstAssignment = context.request.assignments.find(
        (entry) => entry.normalKey === "1,0",
      );
      if (!firstAssignment) return { kind: "split", normal: first };
      if (firstAssignment.sign === -1) {
        return {
          kind: "survivor",
          value: {
            assignmentSign: -1,
            primitiveWitness: [...context.feasibility.primitiveWitness!],
          },
        };
      }
      if (firstAssignment.sign === 1) {
        return {
          kind: "prune",
          proof: {
            normalKey: firstAssignment.normalKey,
            sign: 1,
            obstruction: "fixture-directed-link-failure",
          },
        };
      }
      const secondAssignment = context.request.assignments.find(
        (entry) => entry.normalKey === "0,1",
      );
      if (!secondAssignment) return { kind: "split", normal: second };
      if (secondAssignment.sign === 0) {
        throw new Error("The zero character must bypass decide().");
      }
      return {
        kind: "prune",
        proof: {
          normalKey: secondAssignment.normalKey,
          sign: secondAssignment.sign,
          obstruction: "fixture-directed-link-failure",
        },
      };
    };
    const earlyRequests: ExactConeOracleRequest[] = [];
    const hitOrCover =
      await searchFirstSurvivorOrBuildObstructionPrunedConeCoverAsync<
        FixturePruneProof,
        FixtureSurvivor
      >({
        sourceHash: SOURCE_HASH,
        rank: 2,
        oracle: {
          solve: async (request) => {
            earlyRequests.push(structuredClone(request));
            return coordinateOracle().solve(request);
          },
        },
        decide,
        verifySurvivor,
      });

    expect(hitOrCover.kind).toBe("operational-first-survivor-hit");
    const hit = hitOrCover as OperationalFirstSurvivorHit<FixtureSurvivor>;
    expect(hit).toMatchObject({
      proofStatus: "operational-only-not-an-exhaustive-cover",
      depth: 1,
      visitedFeasibleNodeCount: 2,
      oracleQueryCount: 2,
      openedSplitNodeCount: 1,
      completedPruneLeafCount: 0,
      completedZeroCharacterLeafCount: 0,
      infeasibleBranchCount: 0,
    });
    expect(
      earlyRequests.map((request) =>
        request.assignments.map(({ normalKey, sign }) => [normalKey, sign]),
      ),
    ).toEqual([[], [["1,0", -1]]]);

    const exhaustiveRequests: ExactConeOracleRequest[] = [];
    const exhaustiveCover = await buildObstructionPrunedConeCoverAsync({
      sourceHash: SOURCE_HASH,
      rank: 2,
      oracle: {
        solve: async (request) => {
          exhaustiveRequests.push(structuredClone(request));
          return coordinateOracle().solve(request);
        },
      },
      decide,
    });
    expect(exhaustiveCover).toMatchObject({
      nodeCount: 7,
      oracleQueryCount: 7,
      splitNodeCount: 2,
      pruneLeafCount: 3,
      survivorLeafCount: 1,
      zeroCharacterLeafCount: 1,
    });
    expect(exhaustiveRequests).toHaveLength(7);
    expect(
      exhaustiveRequests
        .slice(0, earlyRequests.length)
        .map((request) => request.requestHash),
    ).toEqual(earlyRequests.map((request) => request.requestHash));

    expect(
      replayOperationalFirstSurvivorHit(hit, { verifySurvivor }),
    ).toMatchObject({ status: "passed", errors: [] });

    const staleDigestTamper = structuredClone(hit);
    staleDigestTamper.value.primitiveWitness = ["1", "0"];
    expect(
      replayOperationalFirstSurvivorHit(staleDigestTamper, { verifySurvivor }),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedHitHashValid: false,
        survivorDigestValid: false,
      },
    });

    const tampered = structuredClone(hit);
    tampered.value.primitiveWitness = ["1", "0"];
    // Resealing the two public integrity digests cannot forge the caller's
    // mathematical survivor check.
    tampered.valueDigest = canonicalSha256(tampered.value);
    tampered.hitHash = computeOperationalFirstSurvivorHitHash(tampered);
    expect(
      replayOperationalFirstSurvivorHit(tampered, { verifySurvivor }),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedHitHashValid: true,
        survivorDigestValid: true,
        survivorVerified: false,
      },
    });

    const requestTamper = structuredClone(hit);
    requestTamper.request = buildExactConeOracleRequest({
      sourceHash: hit.sourceHash,
      rank: hit.rank,
      assignments: [{ normal: first, sign: 1 }],
    });
    requestTamper.hitHash =
      computeOperationalFirstSurvivorHitHash(requestTamper);
    expect(
      replayOperationalFirstSurvivorHit(requestTamper, { verifySurvivor }),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedHitHashValid: true,
        requestEnvelopeValid: true,
        oracleCertificateValid: false,
      },
    });
  });

  it("supports canonical early hits and optional witness-last traversal", async () => {
    const run = async (traversalStrategy: "canonical" | "witness-last") => {
      const visitedSigns: Array<-1 | 0 | 1> = [];
      const result =
        await searchFirstSurvivorOrBuildObstructionPrunedConeCoverAsync<
          FixturePruneProof,
          { sign: 0 }
        >({
          sourceHash: SOURCE_HASH,
          rank: 2,
          oracle: {
            solve: async (request) => coordinateOracle().solve(request),
          },
          decide(context) {
            const assignment = context.request.assignments.find(
              (entry) => entry.normalKey === "0,1",
            );
            if (!assignment) return { kind: "split", normal: coordinate(2, 1) };
            visitedSigns.push(assignment.sign);
            if (assignment.sign === 0) {
              return { kind: "survivor", value: { sign: 0 } };
            }
            return {
              kind: "prune",
              proof: {
                normalKey: assignment.normalKey,
                sign: assignment.sign,
                obstruction: "fixture-directed-link-failure",
              },
            };
          },
          traversalStrategy,
          verifySurvivor: (context, value) =>
            value.sign === 0 && context.request.assignments[0]?.sign === 0,
        });

      return { result, visitedSigns };
    };

    const canonical = await run("canonical");
    expect(canonical.result.kind).toBe("operational-first-survivor-hit");
    expect(canonical.visitedSigns).toEqual([-1, 0]);
    expect(canonical.result).toMatchObject({
      oracleQueryCount: 3,
      visitedFeasibleNodeCount: 3,
      openedSplitNodeCount: 1,
      completedPruneLeafCount: 1,
    });

    const witnessLast = await run("witness-last");
    expect(witnessLast.result.kind).toBe("operational-first-survivor-hit");
    expect(witnessLast.visitedSigns).toEqual([-1, 1, 0]);
    expect(witnessLast.result).toMatchObject({
      oracleQueryCount: 4,
      visitedFeasibleNodeCount: 4,
      openedSplitNodeCount: 1,
      completedPruneLeafCount: 2,
    });
  });
});
