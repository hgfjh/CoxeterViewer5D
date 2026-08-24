#!/usr/bin/env -S pnpm exec tsx

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeStreamedRank19GlobalNormalCheckpointDigest,
  replayStreamedRank19GlobalNormalCatalogue,
  type StreamedRank19GlobalNormalCheckpoint,
} from "../src/fibering/node/streamedRank19GlobalNormalCatalogue";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SCOPE =
  "dot(form,w)=0 sign faces for primitive integral character vectors w" as const;
const NONCLAIM =
  "This catalogue exhausts raw coefficient-form hyperplanes dot(form,w)=0 only after all points are covered; it does not catalogue translated affine equations 4d*dot(form,w)+sigma*pointDifference=0, compute adjacency, or certify ascending/descending link connectivity." as const;

function argument(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = process.argv[index + 1];
  if (index < 0 || value === undefined || value.startsWith("--")) {
    throw new Error(`Missing ${flag}.`);
  }
  return resolve(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function atomicJson(path: string, value: unknown): void {
  if (existsSync(path)) throw new Error(`Refusing to replace ${path}.`);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, "utf8");
  renameSync(temporary, path);
}

function main(): void {
  const inputPath = argument("--input");
  const outputPath = argument("--output");
  const reportPath = argument("--report");
  if (new Set([inputPath, outputPath, reportPath]).size !== 3) {
    throw new Error("Input, output, and report paths must be distinct.");
  }

  const inputBytes = readFileSync(inputPath);
  if (inputBytes.length > 64 * 1024 * 1024) {
    throw new Error("The legacy checkpoint exceeds the migration size bound.");
  }
  const parsed = JSON.parse(inputBytes.toString("utf8")) as unknown;
  const before = replayStreamedRank19GlobalNormalCatalogue(parsed);
  const expectedLegacyError =
    "The adjacency/link non-claims are missing or altered.";
  if (
    before.status !== "failed" ||
    before.errors.length !== 1 ||
    before.errors[0] !== expectedLegacyError ||
    before.checks.adjacencyAndLinkNonClaimsExplicit ||
    Object.entries(before.checks).some(
      ([name, passed]) =>
        name !== "adjacencyAndLinkNonClaimsExplicit" && !passed,
    )
  ) {
    throw new Error(
      `Legacy checkpoint has failures beyond the missing scope label: ${before.errors.join(" ")}`,
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { kind?: unknown }).kind !==
      "streamed-rank-19-global-normal-catalogue-checkpoint"
  ) {
    throw new Error("Input is not the expected rank-19 catalogue checkpoint.");
  }
  const checkpoint = structuredClone(
    parsed,
  ) as StreamedRank19GlobalNormalCheckpoint;
  const legacyCoverage = checkpoint.coverage as unknown as Record<
    string,
    unknown
  >;
  const expectedLegacyCoverage = {
    pointCoverage: "contiguous-prefix",
    linearGermNormalCoverageClaimed: true,
    rawIntegralCoefficientFormHyperplaneCoverageClaimed: false,
    translatedAffineHyperplaneCoverageClaimed: false,
    adjacencyIncluded: false,
    adjacencyCoverageClaimed: false,
    ascendingDescendingLinkCoverageClaimed: false,
    nonClaim: NONCLAIM,
  };
  if (
    canonicalSha256(legacyCoverage) !== canonicalSha256(expectedLegacyCoverage)
  ) {
    throw new Error(
      "The legacy coverage envelope is not the audited prefix form.",
    );
  }

  checkpoint.coverage = {
    ...expectedLegacyCoverage,
    rawIntegralCoefficientFormHyperplaneScope: SCOPE,
  };
  checkpoint.checkpointDigest = "";
  checkpoint.checkpointDigest =
    computeStreamedRank19GlobalNormalCheckpointDigest(checkpoint);
  const after = replayStreamedRank19GlobalNormalCatalogue(checkpoint);
  if (after.status !== "passed") {
    throw new Error(
      `Migrated checkpoint failed complete replay: ${after.errors.join(" ")}`,
    );
  }

  atomicJson(outputPath, checkpoint);
  const outputBytes = readFileSync(outputPath);
  const reportWithoutDigest = {
    schemaVersion: 1 as const,
    kind: "rank19-global-normal-checkpoint-scope-migration" as const,
    method: "add-audited-integral-raw-hyperplane-scope-label" as const,
    input: {
      path: inputPath,
      sha256: sha256(inputBytes),
      checkpointDigest: (parsed as { checkpointDigest: string })
        .checkpointDigest,
      replay: before,
    },
    mutation: {
      addedField: "coverage.rawIntegralCoefficientFormHyperplaneScope",
      addedValue: SCOPE,
      allOtherCanonicalContentPreserved:
        canonicalSha256({
          ...(parsed as Record<string, unknown>),
          coverage: expectedLegacyCoverage,
          checkpointDigest: "",
        }) ===
        canonicalSha256({
          ...checkpoint,
          coverage: expectedLegacyCoverage,
          checkpointDigest: "",
        }),
    },
    output: {
      path: outputPath,
      sha256: sha256(outputBytes),
      checkpointDigest: checkpoint.checkpointDigest,
      replay: after,
    },
    migrationDigest: "",
  };
  if (!reportWithoutDigest.mutation.allOtherCanonicalContentPreserved) {
    throw new Error("The migration changed content beyond the scope label.");
  }
  atomicJson(reportPath, {
    ...reportWithoutDigest,
    migrationDigest: canonicalSha256(reportWithoutDigest),
  });
}

main();
