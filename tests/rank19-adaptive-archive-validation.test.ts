import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  replayStreamedRank19AdaptiveTerminalEnvelope,
  STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES,
  STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES,
} from "../src/fibering/node/streamedRank19AdaptiveArchive";
import { adaptiveGlobalWitnessCountIsExhaustive } from "../src/fibering/streamedRank19Adaptive";
import {
  canonicalizeJson,
  canonicalSha256,
} from "../src/utils/canonicalSha256";

const DIGEST = canonicalSha256("rank-19 adaptive archive fixture");

type TerminalStatus = "invariant-obstruction-cover" | "global-passing-witness";

function allPointWitness(degree: number, sigma: -1 | 1) {
  return {
    schemaVersion: 1,
    kind: "streamed-rank19-all-point-witness-certificate",
    sigma,
    sourceHash: DIGEST,
    latticeBasisDigest: DIGEST,
    cocycleSectionDigest: DIGEST,
    heightRuleDigest: DIGEST,
    degree,
    primitiveWitness: ["1", ...Array<string>(18).fill("0")],
    checkedPointCount: degree,
    pointResultDigest: DIGEST,
    witnessEvaluationDigest: DIGEST,
    certificateDigest: DIGEST,
  };
}

function terminalArtifact(
  status: TerminalStatus = "invariant-obstruction-cover",
) {
  const degree = 12;
  const searchWithoutDigest = {
    schemaVersion: 2,
    kind: "adaptive-streamed-height-obstruction-point-search",
    status,
    method:
      "first-survivor-depth-first-point-separation-and-exhaustive-terminal-cover",
    sourceHash: DIGEST,
    sigma: -1,
    rank: 19,
    ambientPointCount: degree,
    initialPointIds: [0],
    selectedPointIds: [0],
    iterations: [{ iteration: 0 }],
    finalCover:
      status === "invariant-obstruction-cover" ? { coverHash: DIGEST } : null,
    globalPassingWitness:
      status === "global-passing-witness"
        ? {
            primitiveWitness: ["1", ...Array<string>(18).fill("0")],
            checkedPointCount: degree,
            pointResultDigest: DIGEST,
            witnessHash: DIGEST,
          }
        : null,
    resultDigest: "",
  };
  const search = {
    ...searchWithoutDigest,
    resultDigest: canonicalSha256(searchWithoutDigest),
  };
  const polarityCertification =
    status === "invariant-obstruction-cover"
      ? {
          kind: "explicit-antipodal-obstruction-cover",
          negativeReplay: {},
          positiveCover: {},
          positiveReplay: {},
          transportDigest: DIGEST,
        }
      : {
          kind: "explicit-all-point-antipodal-witnesses",
          negativeWitness: allPointWitness(degree, -1),
          positiveWitness: allPointWitness(degree, 1),
          transportDigest: DIGEST,
        };
  const reportWithoutDigest = {
    schemaVersion: 3,
    kind: "compact-5-cube-rank19-adaptive-obstruction-point-search",
    status,
    method: "exact-provisional-witness-separation-with-source-bound-templates",
    source: {
      oracleStructureHash: DIGEST,
      actionRowsCanonicalSha256: DIGEST,
      generalizedCompressionArchiveHash: DIGEST,
      degree,
      sourceHash: DIGEST,
      latticeBasisDigest: DIGEST,
      cocycleSectionDigest: DIGEST,
      heightRuleDigest: DIGEST,
    },
    h1CertificateDigest: DIGEST,
    templateRecords: [
      {
        point: 0,
        templateDigest: DIGEST,
        topologyDigest: DIGEST,
        germCount: 1,
        linkEdgeCount: 0,
      },
    ],
    templateRecordDigest: DIGEST,
    templateStreaming: {
      method: "one-reusable-source-preparation-with-ephemeral-point-batches",
      preparationCount: 1,
      streamInvocationCount: 1,
      streamedPointCount: 1,
      batches: [
        {
          batchIndex: 0,
          purpose: "selected-point-preload",
          requestedPointIds: [0],
          checkedPointIdsDigest: DIGEST,
          stream: {},
          batchDigest: DIGEST,
        },
      ],
      batchDigest: DIGEST,
    },
    search,
    polarityCertification,
    checks: {
      negativeFinalObjectReplayed: true,
      positiveAntipodeReplayed: true,
      explicitPolarityTransportBound: true,
    },
    claims: ["Synthetic terminal fixture."],
    nonClaims: ["No mathematical claim."],
    reportDigest: "",
  };
  const report = {
    ...reportWithoutDigest,
    reportDigest: canonicalSha256(reportWithoutDigest),
  };
  const artifactWithoutDigest = {
    schemaVersion: 1,
    kind: "compact-5-cube-rank19-adaptive-runner-artifact",
    report,
    runner: { fixture: "rank19-adaptive-archive" },
    artifactDigest: "",
  };
  return {
    ...artifactWithoutDigest,
    artifactDigest: canonicalSha256(artifactWithoutDigest),
  };
}

function resealArtifact(artifact: ReturnType<typeof terminalArtifact>) {
  artifact.report.search.resultDigest = canonicalSha256({
    ...artifact.report.search,
    resultDigest: "",
  });
  artifact.report.reportDigest = canonicalSha256({
    ...artifact.report,
    reportDigest: "",
  });
  artifact.artifactDigest = canonicalSha256({
    ...artifact,
    artifactDigest: "",
  });
}

function runArchive(arguments_: readonly string[]) {
  return spawnSync(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve("scripts/archive_rank19_adaptive_track_b.ts"),
      ...arguments_,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
}

function requireSuccess(result: ReturnType<typeof runArchive>): void {
  if (result.status !== 0) {
    throw new Error(
      `archive command failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
}

describe("rank-19 adaptive terminal archive", () => {
  it("writes deterministic canonical gzip and exactly replays its manifest", () => {
    const directory = mkdtempSync(join(tmpdir(), "rank19-adaptive-archive-"));
    try {
      const artifact = terminalArtifact();
      const inputA = join(directory, "input-a.json");
      const inputB = join(directory, "input-b.json");
      const archiveA = join(directory, "artifact-a.json.gz");
      const archiveB = join(directory, "artifact-b.json.gz");
      const manifestA = join(directory, "artifact-a.archive.json");
      const manifestB = join(directory, "artifact-b.archive.json");
      writeFileSync(inputA, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      writeFileSync(
        inputB,
        `${JSON.stringify({
          runner: artifact.runner,
          artifactDigest: artifact.artifactDigest,
          report: artifact.report,
          kind: artifact.kind,
          schemaVersion: artifact.schemaVersion,
        })}\n`,
        "utf8",
      );

      requireSuccess(
        runArchive([
          "--input",
          inputA,
          "--archive",
          archiveA,
          "--manifest",
          manifestA,
        ]),
      );
      requireSuccess(
        runArchive([
          "--",
          "--input",
          inputB,
          "--archive",
          archiveB,
          "--manifest",
          manifestB,
        ]),
      );

      const bytesA = readFileSync(archiveA);
      const bytesB = readFileSync(archiveB);
      expect(bytesA.equals(bytesB)).toBe(true);
      expect([...bytesA.subarray(0, 10)]).toEqual([
        0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff,
      ]);
      expect(gunzipSync(bytesA).toString("utf8")).toBe(
        `${canonicalizeJson(artifact)}\n`,
      );

      const manifest = JSON.parse(readFileSync(manifestA, "utf8")) as {
        replayBounds: {
          maximumArchiveByteLength: number;
          maximumDecodedByteLength: number;
        };
      };
      expect(manifest.replayBounds).toEqual({
        maximumArchiveByteLength: STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES,
        maximumDecodedByteLength: STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES,
      });
      requireSuccess(
        runArchive([
          "--archive",
          archiveA,
          "--manifest",
          manifestA,
          "--verify-only",
          "true",
        ]),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a raw JSON container and a resealed manifest with extra fields", () => {
    const directory = mkdtempSync(join(tmpdir(), "rank19-adaptive-schema-"));
    try {
      const input = join(directory, "input.json");
      const archive = join(directory, "artifact.json.gz");
      const manifest = join(directory, "artifact.archive.json");
      writeFileSync(input, `${JSON.stringify(terminalArtifact())}\n`, "utf8");
      requireSuccess(
        runArchive([
          "--input",
          input,
          "--archive",
          archive,
          "--manifest",
          manifest,
        ]),
      );

      const stored = JSON.parse(readFileSync(manifest, "utf8")) as Record<
        string,
        unknown
      >;
      stored.unexpected = "resealed but outside the schema";
      stored.manifestDigest = canonicalSha256({
        ...stored,
        manifestDigest: "",
      });
      writeFileSync(manifest, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
      const extraField = runArchive([
        "--archive",
        archive,
        "--manifest",
        manifest,
        "--verify-only",
        "true",
      ]);
      expect(extraField.status).not.toBe(0);
      expect(`${extraField.stdout}\n${extraField.stderr}`).toContain(
        "differs from the exact replayed manifest",
      );

      writeFileSync(archive, `${JSON.stringify(terminalArtifact())}\n`, "utf8");
      const rawJson = runArchive([
        "--archive",
        archive,
        "--manifest",
        manifest,
        "--verify-only",
        "true",
      ]);
      expect(rawJson.status).not.toBe(0);
      expect(`${rawJson.stdout}\n${rawJson.stderr}`).toContain(
        "is not a gzip archive",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses to archive a nonterminal iteration-limit artifact", () => {
    const directory = mkdtempSync(join(tmpdir(), "rank19-adaptive-partial-"));
    try {
      const artifact = terminalArtifact();
      artifact.report.status = "iteration-limit" as TerminalStatus;
      artifact.report.search.status = "iteration-limit" as TerminalStatus;
      resealArtifact(artifact);
      const input = join(directory, "partial.json");
      writeFileSync(input, `${JSON.stringify(artifact)}\n`, "utf8");
      const result = runArchive([
        "--input",
        input,
        "--archive",
        join(directory, "partial.json.gz"),
        "--manifest",
        join(directory, "partial.archive.json"),
      ]);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("not terminal");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a resealed global witness whose scan count is not the degree", () => {
    const artifact = terminalArtifact("global-passing-witness");
    expect(
      adaptiveGlobalWitnessCountIsExhaustive({
        status: artifact.report.status,
        degree: artifact.report.source.degree,
        globalPassingWitness: artifact.report.search.globalPassingWitness,
      }),
    ).toBe(true);
    expect(
      replayStreamedRank19AdaptiveTerminalEnvelope(artifact),
    ).toMatchObject({
      status: "passed",
      checks: { terminalObjectShapeValid: true },
    });
    const witness = artifact.report.search.globalPassingWitness;
    if (witness === null) throw new Error("The fixture has no global witness.");
    witness.checkedPointCount -= 1;
    resealArtifact(artifact);
    expect(
      adaptiveGlobalWitnessCountIsExhaustive({
        status: artifact.report.status,
        degree: artifact.report.source.degree,
        globalPassingWitness: artifact.report.search.globalPassingWitness,
      }),
    ).toBe(false);

    expect(
      replayStreamedRank19AdaptiveTerminalEnvelope(artifact),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedArtifactDigestValid: true,
        storedReportDigestValid: true,
        terminalObjectShapeValid: false,
      },
    });
  });
});
