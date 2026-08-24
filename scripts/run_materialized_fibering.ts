#!/usr/bin/env -S pnpm exec vite-node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  promoteMaterializedActionToVirtualFibering,
  verifyMaterializedActionPromotionArtifact,
  type MaterializedActionImplementationManifest,
  type MaterializedActionPromotionArtifact,
  type MaterializedActionPipelineBudgets,
} from "../src/fibering/materializedActionPipeline";
import type { LawfulTrackApplicabilityEvidence } from "../src/fibering/lawfulTrack";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

interface PromotionCliArguments {
  mode: "promote";
  system?: string;
  example?: string;
  action: string;
  output: string;
  maxInputBytes: number;
  budgets: MaterializedActionPipelineBudgets;
  exactWallLimit?: number;
  maxCandidates?: number;
  timeBudgetMs?: number;
  lawfulComplex: "rank-two-lawful" | "coface-closed-full";
  includeFullLawfulClosure: boolean;
  alwaysRunFullDavis: boolean;
  lawfulApplicability?: string;
}

interface VerificationCliArguments {
  mode: "verify";
  artifact: string;
  output: string;
  maxInputBytes: number;
}

type CliArguments = PromotionCliArguments | VerificationCliArguments;

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive integer.`);
  }
  return parsed;
}

function booleanValue(value: string | undefined, flag: string): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${flag} requires true or false.`);
}

function parseArguments(argv: readonly string[]): CliArguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(
        "Usage: run_materialized_fibering.ts (--system SYSTEM.json | --example BUNDLED_ID) --action ACTION.json --output RESULT.json [budget flags]",
      );
    }
    values.set(flag, value);
  }
  const required = (flag: string): string => {
    const value = values.get(flag);
    if (!value) throw new Error(`Missing required ${flag}.`);
    return value;
  };
  const optionalInteger = (flag: string): number | undefined => {
    const value = values.get(flag);
    return value === undefined ? undefined : positiveInteger(value, flag);
  };
  if (values.has("--verify-artifact")) {
    return {
      mode: "verify",
      artifact: required("--verify-artifact"),
      output: required("--output"),
      maxInputBytes: optionalInteger("--max-input-bytes") ?? 256 * 1024 * 1024,
    };
  }
  const lawfulComplex = values.get("--lawful-complex") ?? "rank-two-lawful";
  if (
    lawfulComplex !== "rank-two-lawful" &&
    lawfulComplex !== "coface-closed-full"
  ) {
    throw new Error(
      "--lawful-complex requires rank-two-lawful or coface-closed-full.",
    );
  }
  const system = values.get("--system");
  const example = values.get("--example");
  if (Boolean(system) === Boolean(example)) {
    throw new Error("Supply exactly one of --system or --example.");
  }
  return {
    mode: "promote",
    ...(system ? { system } : {}),
    ...(example ? { example } : {}),
    action: required("--action"),
    output: required("--output"),
    maxInputBytes: optionalInteger("--max-input-bytes") ?? 256 * 1024 * 1024,
    budgets: {
      maxActionDegree: optionalInteger("--max-action-degree"),
      maxGeneratorEntries: optionalInteger("--max-generator-entries"),
      maxPackedActionBytes: optionalInteger("--max-packed-action-bytes"),
      maxQuotientEdges: optionalInteger("--max-quotient-edges"),
      maxQuotientTwoCells: optionalInteger("--max-quotient-two-cells"),
      maxFullDavisCells: optionalInteger("--max-full-davis-cells"),
    },
    exactWallLimit: optionalInteger("--exact-wall-limit"),
    maxCandidates: optionalInteger("--max-candidates"),
    timeBudgetMs: optionalInteger("--time-budget-ms"),
    lawfulComplex,
    includeFullLawfulClosure: booleanValue(
      values.get("--include-full-lawful-closure"),
      "--include-full-lawful-closure",
    ),
    alwaysRunFullDavis: booleanValue(
      values.get("--always-run-full-davis"),
      "--always-run-full-davis",
    ),
    lawfulApplicability: values.get("--lawful-applicability"),
  };
}

async function readBoundedJson(
  path: string,
  maxBytes: number,
): Promise<{
  raw: unknown;
  bytes: Uint8Array;
}> {
  const details = await stat(path);
  if (details.size > maxBytes) {
    throw new Error(
      `${path} is ${details.size} bytes; the input-file budget is ${maxBytes}.`,
    );
  }
  const bytes = await readFile(path);
  return { raw: JSON.parse(bytes.toString("utf8")) as unknown, bytes };
}

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const BUNDLED_EXAMPLE_DIRECTORY = join(REPOSITORY_ROOT, "public", "examples");
const IMPLEMENTATION_ROOTS = [
  "package.json",
  "pnpm-lock.yaml",
  "scripts/run_materialized_fibering.ts",
  "src/compression",
  "src/coxeter",
  "src/davis",
  "src/fibering",
  "src/quotient",
  "src/topology",
  "src/torsionFree",
  "src/types",
  "src/utils/canonicalSha256.ts",
  "src/walls",
] as const;

async function implementationFiles(path: string): Promise<string[]> {
  const details = await stat(path);
  if (details.isFile()) return [path];
  if (!details.isDirectory()) return [];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() || entry.name.endsWith(".ts"))
      .map((entry) => implementationFiles(join(path, entry.name))),
  );
  return nested.flat();
}

async function bundledExamplePath(id: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) {
    throw new Error(
      "--example must be a bundled example id containing only letters, digits, underscores, or hyphens.",
    );
  }
  const expectedName = `${id}.json`;
  const matches = (
    await readdir(BUNDLED_EXAMPLE_DIRECTORY, {
      withFileTypes: true,
    })
  ).filter((entry) => entry.isFile() && basename(entry.name) === expectedName);
  if (matches.length !== 1) {
    throw new Error(`Unknown bundled example id: ${id}.`);
  }
  return join(BUNDLED_EXAMPLE_DIRECTORY, expectedName);
}

function packageVersion(
  packageJson: Record<string, unknown>,
  name: string,
): string {
  for (const sectionName of ["dependencies", "devDependencies"]) {
    const section = packageJson[sectionName];
    if (section && typeof section === "object" && !Array.isArray(section)) {
      const value = (section as Record<string, unknown>)[name];
      if (typeof value === "string") return value;
    }
  }
  return "not-directly-pinned";
}

export async function buildMaterializedActionImplementationManifest(): Promise<MaterializedActionImplementationManifest> {
  const absoluteFiles = (
    await Promise.all(
      IMPLEMENTATION_ROOTS.map((path) =>
        implementationFiles(join(REPOSITORY_ROOT, path)),
      ),
    )
  )
    .flat()
    .sort((left, right) => left.localeCompare(right));
  const files = await Promise.all(
    absoluteFiles.map(async (path) => ({
      path: relative(REPOSITORY_ROOT, path).replaceAll("\\", "/"),
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    })),
  );
  const packageJson = JSON.parse(
    await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"),
  ) as Record<string, unknown>;
  const packageManager = packageJson.packageManager;
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "materialized-action-implementation-manifest" as const,
    hashAlgorithm: "sha256" as const,
    files,
    sourceTreeMerkleSha256: canonicalSha256(files),
    toolchain: {
      node: process.version,
      packageManager:
        typeof packageManager === "string" ? packageManager : "unrecorded",
      typescript: packageVersion(packageJson, "typescript"),
      vite: packageVersion(packageJson, "vite"),
      viteNode: packageVersion(packageJson, "vite-node"),
    },
  };
  return { ...withoutHash, manifestSha256: canonicalSha256(withoutHash) };
}

export async function runMaterializedFiberingCli(
  argv: readonly string[],
): Promise<number> {
  const args = parseArguments(argv);
  const implementationManifest =
    await buildMaterializedActionImplementationManifest();
  if (args.mode === "verify") {
    const stored = await readBoundedJson(args.artifact, args.maxInputBytes);
    const report = verifyMaterializedActionPromotionArtifact(
      stored.raw as MaterializedActionPromotionArtifact,
      implementationManifest,
    );
    await writeFile(
      args.output,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    return report.valid ? 0 : 1;
  }
  const systemPath = args.system ?? (await bundledExamplePath(args.example!));
  const [system, action] = await Promise.all([
    readBoundedJson(systemPath, args.maxInputBytes),
    readBoundedJson(args.action, args.maxInputBytes),
  ]);
  const lawfulApplicability = args.lawfulApplicability
    ? ((await readBoundedJson(args.lawfulApplicability, args.maxInputBytes))
        .raw as LawfulTrackApplicabilityEvidence)
    : undefined;
  const sourceSystemArtifactSha256 = createHash("sha256")
    .update(system.bytes)
    .digest("hex");
  const sourceActionArtifactSha256 = createHash("sha256")
    .update(action.bytes)
    .digest("hex");
  const result = await promoteMaterializedActionToVirtualFibering(
    system.raw,
    action.raw,
    {
      budgets: args.budgets,
      sourceSystemArtifactSha256,
      sourceActionArtifactSha256,
      implementationManifest,
      coorientationSearch: {
        exactWallLimit: args.exactWallLimit,
        maxCandidates: args.maxCandidates,
        timeBudgetMs: args.timeBudgetMs,
        deterministicCandidateBudgetOnly: true,
      },
      lawfulSearch: {
        exactWallLimit: args.exactWallLimit,
        maxCandidates: args.maxCandidates,
        timeBudgetMs: args.timeBudgetMs,
        deterministicCandidateBudgetOnly: true,
        certificationComplex: args.lawfulComplex,
        applicability: lawfulApplicability,
        includeFullClosure: args.includeFullLawfulClosure,
      },
      alwaysRunFullDavis: args.alwaysRunFullDavis,
    },
  );
  await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result.status === "passed"
    ? 0
    : result.status === "incomplete"
      ? 2
      : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  runMaterializedFiberingCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
