#!/usr/bin/env -S pnpm exec tsx

import { pathToFileURL } from "node:url";

import {
  prepareGenericH1ExternalJob,
  type GenericH1ExternalJobLimits,
} from "../src/fibering/node/genericH1ExternalJob";

const USAGE = [
  "Usage:",
  "  pnpm exec tsx scripts/prepare_generic_h1_external_job.ts \\",
  "    --system SYSTEM.json --action ACTION.json --output-dir NEW_DIRECTORY \\",
  "    [--max-system-input-bytes N] [--max-action-input-bytes N] \\",
  "    [--max-matrix-output-bytes N] [--matrix-write-batch-bytes N] \\",
  "    [--max-exhaustive-rank N] [--max-subsets N] \\",
  "    [--max-spherical-elements N] [--max-witnesses N]",
].join("\n");

interface Arguments {
  systemPath: string;
  actionPath: string;
  outputDirectory: string;
  limits: GenericH1ExternalJobLimits;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive safe integer.`);
  }
  return parsed;
}

export function parseGenericH1ExternalJobArguments(
  argv: readonly string[],
): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (normalized.includes("--help")) throw new Error(USAGE);
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(USAGE);
    }
    if (values.has(flag)) throw new Error(`Duplicate flag ${flag}.\n${USAGE}`);
    values.set(flag, value);
  }
  const allowed = new Set([
    "--system",
    "--action",
    "--output-dir",
    "--max-system-input-bytes",
    "--max-action-input-bytes",
    "--max-matrix-output-bytes",
    "--matrix-write-batch-bytes",
    "--max-exhaustive-rank",
    "--max-subsets",
    "--max-spherical-elements",
    "--max-witnesses",
  ]);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) throw new Error(`Unknown flag ${flag}.\n${USAGE}`);
  }
  const required = (flag: string): string => {
    const value = values.get(flag);
    if (value === undefined) throw new Error(`Missing ${flag}.\n${USAGE}`);
    return value;
  };
  const optional = (flag: string): number | undefined => {
    const value = values.get(flag);
    return value === undefined ? undefined : positiveInteger(value, flag);
  };
  return {
    systemPath: required("--system"),
    actionPath: required("--action"),
    outputDirectory: required("--output-dir"),
    limits: {
      maxSystemInputBytes: optional("--max-system-input-bytes"),
      maxActionInputBytes: optional("--max-action-input-bytes"),
      maxMatrixOutputBytes: optional("--max-matrix-output-bytes"),
      matrixWriteBatchBytes: optional("--matrix-write-batch-bytes"),
      maxRankForExhaustiveEnumeration: optional("--max-exhaustive-rank"),
      maxSubsetsToCheck: optional("--max-subsets"),
      maxSphericalSubgroupElements: optional("--max-spherical-elements"),
      maxWitnesses: optional("--max-witnesses"),
    },
  };
}

export function runGenericH1ExternalJobCli(argv: readonly string[]): number {
  const result = prepareGenericH1ExternalJob(
    parseGenericH1ExternalJobArguments(argv),
  );
  console.log(
    JSON.stringify({
      status: result.manifest.status,
      outputDirectory: result.outputDirectory,
      manifestDigest: result.manifest.manifestDigest,
      rows: result.manifest.boundary.rowCount,
      columns: result.manifest.boundary.columnCount,
      nonzeroCount: result.manifest.boundary.nonzeroCount,
    }),
  );
  return 0;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  try {
    process.exitCode = runGenericH1ExternalJobCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
