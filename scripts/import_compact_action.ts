#!/usr/bin/env -S pnpm exec tsx

import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { parseCoxeterSystemInput } from "../src/coxeter";
import {
  GENERIC_H1_EXTERNAL_JOB_FILES,
  prepareGenericH1ExternalJob,
  type GenericH1ExternalJobLimits,
} from "../src/fibering/node/genericH1ExternalJob";
import {
  materializeFiniteQuotientSubgroupAction,
  parseCompactActionImport,
  type CompactActionImportInput,
  type GeneratorPermutationFilesImport,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");
const EXAMPLE_DIRECTORY = join(REPOSITORY_ROOT, "public", "examples");
const USAGE = [
  "Usage:",
  "  corepack pnpm cover:import:compact-action -- \\",
  "    (--system SYSTEM.json | --example BUNDLED_ID) --input IMPORT.json \\",
  "    --action-output ACTION.json --h1-job-dir NEW_DIRECTORY --receipt RECEIPT.json",
].join("\n");

interface Arguments {
  system?: string;
  example?: string;
  input: string;
  actionOutput: string;
  h1JobDirectory: string;
  receipt: string;
  limits: GenericH1ExternalJobLimits;
}

interface CompactActionImportReceipt {
  schemaVersion: 1;
  kind: "compact-action-import-handoff";
  status: "prepared" | "incomplete" | "rejected";
  outcome:
    | "awaiting-external-integral-h1-proofs"
    | "action-not-materialized"
    | "action-rejected-before-h1";
  target: {
    systemName: string;
    systemPath: string;
    priority: "p0-primary" | "user-selected";
  };
  acquisition: {
    inputKind: CompactActionImportInput["kind"];
    inputPath: string;
    inputArtifactSha256: string;
    actionPath?: string;
    actionArtifactSha256?: string;
    actionId?: string;
    actionDegree?: number;
    diagnostics?: Record<string, unknown>;
  };
  exactReplay: {
    status: "passed" | "not-run" | "failed";
    method: "complete-spherical-special-subgroup-action";
    torsionFreeCertificatePath?: string;
    torsionFreeCertificateSha256?: string;
    checkedSphericalSubsetCount?: number;
  };
  scalableH1Handoff: {
    status: "prepared" | "not-run";
    jobDirectory?: string;
    manifestPath?: string;
    manifestDigest?: string;
    matrixRows?: number;
    matrixColumns?: number;
    nonzeroCount?: number;
  };
  trackBHandoff: {
    status: "awaiting-rank-certificate-and-integral-kernel-witness" | "not-run";
    command?: string;
  };
  claims: string[];
  nonClaims: string[];
  errors: string[];
  receiptSha256: string;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive safe integer.`);
  }
  return parsed;
}

export function parseCompactActionImportArguments(
  argv: readonly string[],
): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (normalized.includes("--help")) throw new Error(USAGE);
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (!flag?.startsWith("--") || value === undefined) throw new Error(USAGE);
    if (values.has(flag)) throw new Error(`Duplicate flag ${flag}.`);
    values.set(flag, value);
  }
  const allowed = new Set([
    "--system",
    "--example",
    "--input",
    "--action-output",
    "--h1-job-dir",
    "--receipt",
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
  const system = values.get("--system");
  const example = values.get("--example");
  if (Boolean(system) === Boolean(example)) {
    throw new Error(`Supply exactly one of --system or --example.\n${USAGE}`);
  }
  return {
    ...(system ? { system } : {}),
    ...(example ? { example } : {}),
    input: required("--input"),
    actionOutput: required("--action-output"),
    h1JobDirectory: required("--h1-job-dir"),
    receipt: required("--receipt"),
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

function bundledExamplePath(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) {
    throw new Error("--example contains an unsupported character.");
  }
  const expected = `${id}.json`;
  const matches = readdirSync(EXAMPLE_DIRECTORY, {
    withFileTypes: true,
  }).filter((entry) => entry.isFile() && basename(entry.name) === expected);
  if (matches.length !== 1) throw new Error(`Unknown bundled example ${id}.`);
  return join(EXAMPLE_DIRECTORY, expected);
}

function readJson(path: string, maximumBytes = 512 * 1024 * 1024): unknown {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(
      `${path} is not a regular JSON file within the byte bound.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function sha256File(path: string): string {
  const descriptor = openSync(path, "r");
  const digest = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      digest.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return digest.digest("hex");
}

function relativePath(path: string): string {
  const resolved = resolve(path);
  const local = relative(REPOSITORY_ROOT, resolved).replaceAll("\\", "/");
  return local.startsWith("../") ? resolved.replaceAll("\\", "/") : local;
}

function writeNewJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

/**
 * Place a packed action's row files beside the action output as
 * `<output>.s{g}.u32` and stage a manifest that names them.  Rows are
 * hard-linked when the volume allows it, so a 1 GB action is not copied; the
 * manifest still pins every file by SHA-256, and the job re-hashes each row.
 */
function stagePackedAction(
  input: GeneratorPermutationFilesImport,
  inputPath: string,
  actionOutput: string,
  stagingManifest: string,
): string[] {
  const created: string[] = [];
  try {
    const files = input.action.files.map((file) => {
      const source = join(dirname(resolve(inputPath)), file.path);
      const target = `${resolve(actionOutput)}.s${file.generator}.u32`;
      try {
        linkSync(source, target);
      } catch {
        copyFileSync(source, target, fsConstants.COPYFILE_EXCL);
      }
      created.push(target);
      return { ...file, path: basename(target) };
    });
    writeNewJson(stagingManifest, {
      ...input,
      action: { ...input.action, files },
    });
    return created;
  } catch (error) {
    for (const path of created) removeStagingOutput(path);
    throw error;
  }
}

function removeStagingOutput(path: string): void {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

function sameFileIdentity(left: string, right: string): boolean {
  try {
    const leftStat = lstatSync(left, { bigint: true });
    const rightStat = lstatSync(right, { bigint: true });
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

function unlinkIfSameFile(path: string, source: string): void {
  if (sameFileIdentity(path, source)) unlinkSync(path);
}

const PUBLISHED_JOB_FILES = [
  GENERIC_H1_EXTERNAL_JOB_FILES.preparation,
  GENERIC_H1_EXTERNAL_JOB_FILES.torsionFreeCertificate,
  GENERIC_H1_EXTERNAL_JOB_FILES.matrix,
  GENERIC_H1_EXTERNAL_JOB_FILES.manifest,
] as const;

/**
 * Publish the three outputs without a no-replace race. Hard links are cheap
 * even for a multi-gigabyte boundary matrix and fail if a target already
 * exists. The receipt link is the completion marker and is published last.
 */
function publishPreparedImport(input: {
  stagingAction: string;
  actionOutput: string;
  stagingJob: string;
  jobOutput: string;
  stagingReceipt: string;
  receiptOutput: string;
}): void {
  const actionOutput = resolve(input.actionOutput);
  const jobOutput = resolve(input.jobOutput);
  const receiptOutput = resolve(input.receiptOutput);
  let actionLinked = false;
  let jobDirectoryCreated = false;
  const jobLinks: string[] = [];
  try {
    linkSync(input.stagingAction, actionOutput);
    actionLinked = true;
    mkdirSync(jobOutput);
    jobDirectoryCreated = true;
    for (const name of PUBLISHED_JOB_FILES) {
      linkSync(join(input.stagingJob, name), join(jobOutput, name));
      jobLinks.push(name);
    }
    linkSync(input.stagingReceipt, receiptOutput);
  } catch (error) {
    // Only unlink entries that are still the same inode as this run's staged
    // source. Unknown or concurrently replaced entries are never removed.
    for (const name of jobLinks.reverse()) {
      unlinkIfSameFile(join(jobOutput, name), join(input.stagingJob, name));
    }
    if (jobDirectoryCreated) {
      try {
        rmdirSync(jobOutput);
      } catch {
        // Preserve a concurrent writer's entry rather than recursively
        // deleting a directory we no longer know to be empty.
      }
    }
    if (actionLinked) unlinkIfSameFile(actionOutput, input.stagingAction);
    throw error;
  }

  if (existsSync(input.stagingAction)) unlinkSync(input.stagingAction);
  for (const name of PUBLISHED_JOB_FILES) {
    const staged = join(input.stagingJob, name);
    if (existsSync(staged)) unlinkSync(staged);
  }
  rmdirSync(input.stagingJob);
  if (existsSync(input.stagingReceipt)) unlinkSync(input.stagingReceipt);
}

function shellArgument(value: string): string {
  return JSON.stringify(value);
}

function isStrictlyInside(child: string, parent: string): boolean {
  const relation = relative(resolve(parent), resolve(child));
  return (
    relation.length > 0 &&
    !/^\.\.(?:[\\/]|$)/u.test(relation) &&
    !isAbsolute(relation)
  );
}

function pathsOverlap(left: string, right: string): boolean {
  return (
    resolve(left) === resolve(right) ||
    isStrictlyInside(left, right) ||
    isStrictlyInside(right, left)
  );
}

function sealReceipt(
  receipt: Omit<CompactActionImportReceipt, "receiptSha256">,
): CompactActionImportReceipt {
  return { ...receipt, receiptSha256: canonicalSha256(receipt) };
}

function targetPriority(systemPath: string): "p0-primary" | "user-selected" {
  return basename(systemPath) === "compact_5_prism_makarov.json"
    ? "p0-primary"
    : "user-selected";
}

function runSubgroupMaterializer(
  systemPath: string,
  inputPath: string,
  outputPath: string,
): { code: number; report: Record<string, unknown> } {
  const process = spawnSync(
    "python",
    [
      join(REPOSITORY_ROOT, "scripts", "import_compact_subgroup_action.py"),
      "--system",
      systemPath,
      "--input",
      inputPath,
      "--output",
      outputPath,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (process.error) throw process.error;
  const text = process.stdout.trim().split(/\r?\n/u).at(-1) ?? "{}";
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(text) as Record<string, unknown>;
  } catch {
    report = { status: "failed", error: process.stderr || process.stdout };
  }
  return { code: process.status ?? 1, report };
}

function incompleteReceipt(input: {
  system: CoxeterSystemInput;
  systemPath: string;
  importPath: string;
  importSha256: string;
  importKind: CompactActionImportInput["kind"];
  status: "incomplete" | "rejected";
  error: string;
  actionPath?: string;
  actionSha256?: string;
}): CompactActionImportReceipt {
  return sealReceipt({
    schemaVersion: 1,
    kind: "compact-action-import-handoff",
    status: input.status,
    outcome:
      input.status === "incomplete"
        ? "action-not-materialized"
        : "action-rejected-before-h1",
    target: {
      systemName: input.system.name,
      systemPath: relativePath(input.systemPath),
      priority: targetPriority(input.systemPath),
    },
    acquisition: {
      inputKind: input.importKind,
      inputPath: relativePath(input.importPath),
      inputArtifactSha256: input.importSha256,
      ...(input.actionPath
        ? { actionPath: relativePath(input.actionPath) }
        : {}),
      ...(input.actionSha256
        ? { actionArtifactSha256: input.actionSha256 }
        : {}),
    },
    exactReplay: {
      status: input.status === "rejected" ? "failed" : "not-run",
      method: "complete-spherical-special-subgroup-action",
    },
    scalableH1Handoff: { status: "not-run" },
    trackBHandoff: { status: "not-run" },
    claims: [],
    nonClaims: [
      "No torsion-free compact action is certified by this receipt.",
      "No H1, virtual fibering, topological bundle, or smooth fibering claim is made.",
    ],
    errors: [input.error],
  });
}

export function runCompactActionImportCli(argv: readonly string[]): number {
  const args = parseCompactActionImportArguments(argv);
  if (
    pathsOverlap(args.actionOutput, args.receipt) ||
    pathsOverlap(args.actionOutput, args.h1JobDirectory) ||
    pathsOverlap(args.receipt, args.h1JobDirectory)
  ) {
    throw new Error(
      "--action-output, --h1-job-dir, and --receipt must be distinct non-overlapping paths.",
    );
  }
  if (existsSync(args.actionOutput)) {
    throw new Error(`Action output already exists: ${args.actionOutput}.`);
  }
  if (existsSync(args.receipt)) {
    throw new Error(`Receipt already exists: ${args.receipt}.`);
  }
  if (existsSync(args.h1JobDirectory)) {
    throw new Error(`H1 job directory already exists: ${args.h1JobDirectory}.`);
  }
  mkdirSync(dirname(resolve(args.actionOutput)), { recursive: true });
  mkdirSync(dirname(resolve(args.h1JobDirectory)), { recursive: true });
  mkdirSync(dirname(resolve(args.receipt)), { recursive: true });
  const systemPath = args.system ?? bundledExamplePath(args.example!);
  const system = parseCoxeterSystemInput(
    readJson(systemPath, args.limits.maxSystemInputBytes ?? 16 * 1024 * 1024),
  );
  const importSha256 = sha256File(args.input);
  const input = parseCompactActionImport(
    readJson(args.input, args.limits.maxActionInputBytes ?? 512 * 1024 * 1024),
    system,
  );
  const stagingNonce = randomUUID();
  const stagingAction = join(
    dirname(resolve(args.actionOutput)),
    `.${basename(args.actionOutput)}.import-staging-${stagingNonce}`,
  );
  const stagingJob = `${resolve(args.h1JobDirectory)}.import-staging-${stagingNonce}`;
  let diagnostics: Record<string, unknown> | undefined;
  let packedRowFiles: string[] = [];
  if (input.kind === "generator-permutations") {
    writeNewJson(stagingAction, input.action);
  } else if (input.kind === "generator-permutation-files") {
    packedRowFiles = stagePackedAction(
      input,
      args.input,
      args.actionOutput,
      stagingAction,
    );
  } else if (input.kind === "finite-quotient-subgroup") {
    const materialized = materializeFiniteQuotientSubgroupAction(system, input);
    diagnostics = materialized.diagnostics;
    writeNewJson(stagingAction, materialized.candidate);
  } else {
    const result = runSubgroupMaterializer(
      systemPath,
      args.input,
      stagingAction,
    );
    diagnostics = result.report;
    if (result.code !== 0 || !existsSync(stagingAction)) {
      removeStagingOutput(stagingAction);
      const receipt = incompleteReceipt({
        system,
        systemPath,
        importPath: args.input,
        importSha256,
        importKind: input.kind,
        status: result.code === 2 ? "incomplete" : "rejected",
        error: String(
          result.report.error ?? "GAP/ACE did not materialize an action.",
        ),
      });
      writeNewJson(args.receipt, receipt);
      return result.code === 2 ? 2 : 1;
    }
  }

  const actionSha256 = sha256File(stagingAction);
  const staged = readJson(stagingAction) as Record<string, unknown>;
  const candidate = (
    staged.kind === "generator-permutation-files" ? staged.action : staged
  ) as { id: string; index: number };
  const discardPackedRows = () => {
    for (const path of packedRowFiles) removeStagingOutput(path);
  };
  let job;
  try {
    job = prepareGenericH1ExternalJob({
      systemPath,
      actionPath: stagingAction,
      outputDirectory: stagingJob,
      limits: args.limits,
    });
  } catch (error) {
    removeStagingOutput(stagingAction);
    removeStagingOutput(stagingJob);
    discardPackedRows();
    const receipt = incompleteReceipt({
      system,
      systemPath,
      importPath: args.input,
      importSha256,
      importKind: input.kind,
      status: "rejected",
      error: error instanceof Error ? error.message : String(error),
      actionSha256,
    });
    writeNewJson(args.receipt, receipt);
    return 1;
  }
  const manifest = job.manifest;
  const stagingTorsionPath = join(
    stagingJob,
    GENERIC_H1_EXTERNAL_JOB_FILES.torsionFreeCertificate,
  );
  const torsionPath = join(
    resolve(args.h1JobDirectory),
    GENERIC_H1_EXTERNAL_JOB_FILES.torsionFreeCertificate,
  );
  const systemFlag = args.example
    ? `--example ${shellArgument(args.example)}`
    : `--system ${shellArgument(relativePath(systemPath))}`;
  const receipt = sealReceipt({
    schemaVersion: 1,
    kind: "compact-action-import-handoff",
    status: "prepared",
    outcome: "awaiting-external-integral-h1-proofs",
    target: {
      systemName: system.name,
      systemPath: relativePath(systemPath),
      priority: targetPriority(systemPath),
    },
    acquisition: {
      inputKind: input.kind,
      inputPath: relativePath(args.input),
      inputArtifactSha256: importSha256,
      actionPath: relativePath(args.actionOutput),
      actionArtifactSha256: actionSha256,
      actionId: candidate.id,
      actionDegree: candidate.index,
      ...(diagnostics ? { diagnostics } : {}),
    },
    exactReplay: {
      status: "passed",
      method: "complete-spherical-special-subgroup-action",
      torsionFreeCertificatePath: relativePath(torsionPath),
      torsionFreeCertificateSha256: sha256File(stagingTorsionPath),
      checkedSphericalSubsetCount: manifest.torsionFree.checkedSubsetCount,
    },
    scalableH1Handoff: {
      status: "prepared",
      jobDirectory: relativePath(args.h1JobDirectory),
      manifestPath: relativePath(
        join(args.h1JobDirectory, GENERIC_H1_EXTERNAL_JOB_FILES.manifest),
      ),
      manifestDigest: manifest.manifestDigest,
      matrixRows: manifest.boundary.rowCount,
      matrixColumns: manifest.boundary.columnCount,
      nonzeroCount: manifest.boundary.nonzeroCount,
    },
    trackBHandoff: {
      status: "awaiting-rank-certificate-and-integral-kernel-witness",
      command: `corepack pnpm cover:fiber:scalable-h1 -- ${systemFlag} --action ${shellArgument(relativePath(args.actionOutput))} --rank-certificate ${shellArgument("RANK.json")} --kernel-witness ${shellArgument("WITNESS.json")} --output ${shellArgument("RESULT.json")}`,
    },
    claims: [
      "The complete finite action satisfies the Coxeter relations and is transitive.",
      "Every nonidentity element in every spherical special subgroup acts without a fixed point.",
      "The exact sparse integral-H1 boundary job is source-bound and ready for the external rank/lift bridge.",
    ],
    nonClaims: [
      "Job preparation does not compute H1 or assert that b1 is positive.",
      "Track B has not run until proof-carrying rank and integral-kernel artifacts are supplied.",
      "No topological bundle or smooth fibering claim is made.",
    ],
    errors: [],
  });
  const stagingReceipt = join(
    dirname(resolve(args.receipt)),
    `.${basename(args.receipt)}.import-staging-${stagingNonce}`,
  );
  writeNewJson(stagingReceipt, receipt);
  try {
    publishPreparedImport({
      stagingAction,
      actionOutput: args.actionOutput,
      stagingJob,
      jobOutput: args.h1JobDirectory,
      stagingReceipt,
      receiptOutput: args.receipt,
    });
  } catch (error) {
    removeStagingOutput(stagingAction);
    removeStagingOutput(stagingJob);
    removeStagingOutput(stagingReceipt);
    discardPackedRows();
    throw error;
  }
  console.log(
    JSON.stringify({
      status: receipt.status,
      actionDegree: candidate.index,
      h1Rows: manifest.boundary.rowCount,
      h1Columns: manifest.boundary.columnCount,
      receiptSha256: receipt.receiptSha256,
    }),
  );
  return 0;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  try {
    process.exitCode = runCompactActionImportCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
