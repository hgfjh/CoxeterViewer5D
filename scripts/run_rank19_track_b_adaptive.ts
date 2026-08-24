#!/usr/bin/env -S pnpm exec tsx

import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { JsonlCachedExactConeOracle } from "../src/fibering/node/jsonlCachedExactConeOracle";
import { CapturedExactConeOracle } from "../src/fibering/node/capturedExactConeOracle";
import {
  replayRank19AdaptiveCheckpoint,
  sealRank19AdaptiveCheckpoint,
  type Rank19AdaptiveCheckpoint,
  type Rank19AdaptiveCheckpointBinding,
} from "../src/fibering/node/rank19AdaptiveCheckpoint";
import { loadCompactCubeRank19Inputs } from "../src/fibering/node/compactCubeRank19Inputs";
import { PersistentSageHeightConeOracle } from "../src/fibering/node/persistentSageHeightConeOracle";
import type { ObstructionPrunedConeTraversalStrategy } from "../src/fibering/scalableHeightCone";
import {
  buildStreamedRank19AdaptivePointSearch,
  sealStreamedRank19AdaptiveRunnerArtifact,
} from "../src/fibering/streamedRank19Adaptive";

interface Arguments {
  system: string;
  certificate: string;
  generalizedCompression: string;
  coreBasis: string;
  modularTranscript30011: string;
  modularTranscript32749: string;
  output: string;
  checkpoint?: string;
  oracleCache?: string;
  oracleRequestCapture?: string;
  initialPointCount: number;
  maxIterations: number;
  maxConeNodes?: number;
  maxOracleQueries?: number;
  queryTimeoutSeconds: number;
  traversalStrategy: ObstructionPrunedConeTraversalStrategy;
}

const DEFAULTS = {
  system: "public/examples/compact_5_cube_gamma1.json",
  certificate: "coxeter5cube_index17280/index17280_permutations.json.gz",
  generalizedCompression:
    "scripts/certificates/torsion-free/compact_5_cube_index34560_generalized_compression.json",
  coreBasis:
    "scripts/certificates/torsion-free/compact_5_cube_h1_integral_core_basis.txt.gz",
  modularTranscript30011:
    "scripts/certificates/torsion-free/compact_5_cube_h1_modular_basis_p30011.txt.gz",
  modularTranscript32749:
    "scripts/certificates/torsion-free/compact_5_cube_h1_modular_basis_p32749.txt.gz",
} as const;

const usage = [
  "Usage:",
  "  pnpm exec tsx scripts/run_rank19_track_b_adaptive.ts --output REPORT.json",
  "    [--system SYSTEM.json] [--certificate ACTION.json.gz]",
  "    [--generalized-compression COMPRESSION.json] [--core-basis BASIS.txt.gz]",
  "    [--modular-transcript-30011 FILE] [--modular-transcript-32749 FILE]",
  "    [--initial-point-count 8] [--max-iterations 32]",
  "    [--max-cone-nodes N] [--max-oracle-queries N]",
  "    [--checkpoint CHECKPOINT.json] [--oracle-cache CACHE.jsonl]",
  "    [--oracle-request-capture REQUEST.json]",
  "    [--traversal canonical|witness-last]",
  "    [--query-timeout-seconds 300]",
].join("\n");

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function traversalStrategy(
  value: string | undefined,
): ObstructionPrunedConeTraversalStrategy {
  const strategy = value ?? "canonical";
  if (strategy !== "canonical" && strategy !== "witness-last") {
    throw new Error("--traversal must be either canonical or witness-last.");
  }
  return strategy;
}

function parseArguments(argv: readonly string[]): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (normalized.length % 2 !== 0) throw new Error(usage);
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (!flag.startsWith("--") || values.has(flag)) throw new Error(usage);
    values.set(flag, value);
  }
  const allowed = new Set([
    "--system",
    "--certificate",
    "--generalized-compression",
    "--core-basis",
    "--modular-transcript-30011",
    "--modular-transcript-32749",
    "--output",
    "--checkpoint",
    "--oracle-cache",
    "--oracle-request-capture",
    "--initial-point-count",
    "--max-iterations",
    "--max-cone-nodes",
    "--max-oracle-queries",
    "--traversal",
    "--query-timeout-seconds",
  ]);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) throw new Error(`Unknown flag ${flag}.\n${usage}`);
  }
  const output = values.get("--output");
  if (!output) throw new Error(`Missing --output.\n${usage}`);
  return {
    system: values.get("--system") ?? DEFAULTS.system,
    certificate: values.get("--certificate") ?? DEFAULTS.certificate,
    generalizedCompression:
      values.get("--generalized-compression") ??
      DEFAULTS.generalizedCompression,
    coreBasis: values.get("--core-basis") ?? DEFAULTS.coreBasis,
    modularTranscript30011:
      values.get("--modular-transcript-30011") ??
      DEFAULTS.modularTranscript30011,
    modularTranscript32749:
      values.get("--modular-transcript-32749") ??
      DEFAULTS.modularTranscript32749,
    output,
    ...(values.get("--checkpoint")
      ? { checkpoint: values.get("--checkpoint") }
      : {}),
    ...(values.get("--oracle-cache")
      ? { oracleCache: values.get("--oracle-cache") }
      : {}),
    ...(values.get("--oracle-request-capture")
      ? { oracleRequestCapture: values.get("--oracle-request-capture") }
      : {}),
    initialPointCount: positiveInteger(
      values.get("--initial-point-count") ?? "8",
      "--initial-point-count",
    ),
    maxIterations: positiveInteger(
      values.get("--max-iterations") ?? "32",
      "--max-iterations",
    ),
    queryTimeoutSeconds: positiveInteger(
      values.get("--query-timeout-seconds") ?? "300",
      "--query-timeout-seconds",
    ),
    traversalStrategy: traversalStrategy(values.get("--traversal")),
    ...(values.get("--max-cone-nodes")
      ? {
          maxConeNodes: positiveInteger(
            values.get("--max-cone-nodes")!,
            "--max-cone-nodes",
          ),
        }
      : {}),
    ...(values.get("--max-oracle-queries")
      ? {
          maxOracleQueries: positiveInteger(
            values.get("--max-oracle-queries")!,
            "--max-oracle-queries",
          ),
        }
      : {}),
  };
}

function parseJsonFile(path: string, maximumBytes: number): unknown {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(`${path} is not a bounded regular JSON file.`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function atomicJson(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const outputPath = resolve(args.output);
  const checkpointPath = resolve(
    args.checkpoint ?? `${outputPath}.checkpoint.json`,
  );
  const oracleCachePath = resolve(
    args.oracleCache ?? `${outputPath}.oracle-cache.jsonl`,
  );
  const oracleRequestCapturePath = resolve(
    args.oracleRequestCapture ?? `${outputPath}.oracle-request.json`,
  );
  const progressPath = `${outputPath}.progress.json`;
  if (existsSync(outputPath)) {
    throw new Error(`Refusing to replace existing report ${outputPath}.`);
  }
  if (
    new Set([
      outputPath,
      checkpointPath,
      oracleCachePath,
      oracleRequestCapturePath,
      progressPath,
    ]).size !== 5
  ) {
    throw new Error(
      "The output, checkpoint, progress, oracle-cache, and request-capture paths must differ.",
    );
  }
  const started = performance.now();
  let previousStage = started;
  const portable = (path: string): string =>
    relative(process.cwd(), path).replaceAll("\\", "/");
  const stage = (label: string): void => {
    const now = performance.now();
    process.stderr.write(
      `[rank19-adaptive] ${label}: ${((now - previousStage) / 1_000).toFixed(1)} s; total ${((now - started) / 1_000).toFixed(1)} s.\n`,
    );
    previousStage = now;
  };
  const loaded = loadCompactCubeRank19Inputs(
    {
      system: args.system,
      certificate: args.certificate,
      generalizedCompression: args.generalizedCompression,
      coreBasis: args.coreBasis,
      modularTranscript30011: args.modularTranscript30011,
      modularTranscript32749: args.modularTranscript32749,
    },
    stage,
  );
  const binding: Rank19AdaptiveCheckpointBinding = {
    oracleStructureHash: loaded.oracle.structureHash,
    actionRowsCanonicalSha256: loaded.oracle.actionRowsCanonicalSha256,
    generalizedCompressionArchiveHash:
      loaded.generalizedCompression.archiveHash,
    h1CertificateDigest: loaded.h1Binding.certificateDigest,
    latticeBasisDigest: loaded.h1Binding.fullLatticeBasisDigest,
    cocycleSectionDigest: loaded.h1Binding.fullCocycleSectionDigest,
    degree: loaded.oracle.degree,
  };
  const defaultInitialPointIds = Array.from(
    {
      length: Math.min(args.initialPointCount, loaded.oracle.degree),
    },
    (_unused, point) => point,
  );
  let resumedCheckpoint: Rank19AdaptiveCheckpoint | undefined;
  if (existsSync(checkpointPath)) {
    const replay = replayRank19AdaptiveCheckpoint(
      parseJsonFile(checkpointPath, 64 * 1024 * 1024),
      binding,
    );
    if (!replay.passed || !replay.checkpoint) {
      throw new Error(
        `The adaptive checkpoint failed strict replay: ${replay.errors.join(" ")}`,
      );
    }
    if (replay.checkpoint.oracleCachePath !== portable(oracleCachePath)) {
      throw new Error(
        "The adaptive checkpoint is bound to another oracle-cache path.",
      );
    }
    resumedCheckpoint = replay.checkpoint;
  }
  const initialPointIds =
    resumedCheckpoint?.selectedPointIds ?? defaultInitialPointIds;
  const originalInitialPointIds =
    resumedCheckpoint?.initialPointIds ?? defaultInitialPointIds;
  const completedIterationBase =
    resumedCheckpoint?.completedIterationCount ?? 0;
  stage(
    resumedCheckpoint
      ? `replay adaptive checkpoint with ${initialPointIds.length} selected points`
      : `initialize q0,...,q${initialPointIds.length - 1}`,
  );

  let sage: PersistentSageHeightConeOracle | undefined;
  const sageStats = () =>
    sage?.stats() ?? {
      submitted: 0,
      completed: 0,
      pending: 0,
      backendCacheSize: 0,
      stderrTail: "",
    };
  const delegate = {
    solve(request: Parameters<PersistentSageHeightConeOracle["solve"]>[0]) {
      sage ??= new PersistentSageHeightConeOracle({
        command: process.platform === "win32" ? "wsl" : "sage",
        args:
          process.platform === "win32"
            ? [
                "/opt/miniforge3/envs/sage/bin/python",
                "scripts/sage_exact_height_cone.py",
                "--server",
                "--solver",
                "reduced-auto",
              ]
            : [
                "-python",
                "scripts/sage_exact_height_cone.py",
                "--server",
                "--solver",
                "reduced-auto",
              ],
        cwd: process.cwd(),
        maxPendingQueries: 1,
        queryTimeoutMs: 1_000 * args.queryTimeoutSeconds,
      });
      return sage.solve(request);
    },
  };
  const capturedDelegate = new CapturedExactConeOracle({
    path: oracleRequestCapturePath,
    delegate,
  });
  const exactConeCache = new JsonlCachedExactConeOracle({
    path: oracleCachePath,
    delegate: capturedDelegate,
  });
  let lastProgressWrite = 0;
  const writeProgress = (event: Record<string, unknown>): void => {
    const now = performance.now();
    if (now - lastProgressWrite < 15_000 && event.completed !== event.total)
      return;
    atomicJson(progressPath, {
      schemaVersion: 1,
      kind: "rank19-adaptive-progress",
      event,
      checkpointPath: portable(checkpointPath),
      oracleCachePath: portable(oracleCachePath),
      oracleRequestCapturePath: portable(oracleRequestCapturePath),
      elapsedSeconds: (now - started) / 1_000,
      sage: sageStats(),
      oracleCache: exactConeCache.stats(),
    });
    process.stderr.write(
      `[rank19-adaptive] ${String(event.stage)} ${String(event.completed ?? "?")}/${String(event.total ?? "?")}.\n`,
    );
    lastProgressWrite = now;
  };

  try {
    const report = await buildStreamedRank19AdaptivePointSearch({
      oracle: loaded.oracle,
      generalizedCompression: loaded.generalizedCompression,
      h1Certificate: loaded.completion.certificate,
      cocycleBasis: loaded.completion.integralCocycleBasis,
      exactConeOracle: exactConeCache,
      initialPointIds,
      maxIterations: args.maxIterations,
      ...(args.maxConeNodes === undefined
        ? {}
        : { maxConeNodes: args.maxConeNodes }),
      ...(args.maxOracleQueries === undefined
        ? {}
        : { maxOracleQueries: args.maxOracleQueries }),
      traversalStrategy: args.traversalStrategy,
      onProgress(event) {
        writeProgress(event);
      },
      onIteration(event) {
        const checkpoint = sealRank19AdaptiveCheckpoint({
          schemaVersion: 2,
          kind: "compact-5-cube-rank19-adaptive-checkpoint",
          status: event.status === "continuing" ? "running" : event.status,
          binding,
          initialPointIds: originalInitialPointIds,
          selectedPointIds: event.selectedPointIds,
          completedIterationCount:
            completedIterationBase + event.iteration.iteration + 1,
          lastIteration: event.iteration,
          oracleCachePath: portable(oracleCachePath),
        });
        atomicJson(checkpointPath, checkpoint);
        writeProgress({
          stage: "iteration-checkpoint",
          completed: checkpoint.completedIterationCount,
          total: completedIterationBase + args.maxIterations,
          selectedPointCount: checkpoint.selectedPointIds.length,
          checkpointDigest: checkpoint.checkpointDigest,
          status: checkpoint.status,
        });
      },
    });
    const finalCheckpointReplay = replayRank19AdaptiveCheckpoint(
      parseJsonFile(checkpointPath, 64 * 1024 * 1024),
      binding,
    );
    if (!finalCheckpointReplay.passed || !finalCheckpointReplay.checkpoint) {
      throw new Error(
        `The final adaptive checkpoint failed replay: ${finalCheckpointReplay.errors.join(" ")}`,
      );
    }
    const runner = {
      inputPaths: Object.fromEntries(
        Object.entries(loaded.paths).map(([name, path]) => [
          name,
          portable(path),
        ]),
      ),
      initialPointIds: originalInitialPointIds,
      traversalStrategy: args.traversalStrategy,
      exactConeSolver: "reduced-auto",
      resumedFromCheckpointDigest: resumedCheckpoint?.checkpointDigest ?? null,
      finalCheckpointPath: portable(checkpointPath),
      finalCheckpointDigest: finalCheckpointReplay.checkpoint.checkpointDigest,
      oracleCachePath: portable(oracleCachePath),
      oracleRequestCapturePath: portable(oracleRequestCapturePath),
      oracleCache: exactConeCache.stats(),
      sage: sageStats(),
      elapsedSeconds: (performance.now() - started) / 1_000,
    };
    const artifact = sealStreamedRank19AdaptiveRunnerArtifact(report, runner);
    atomicJson(outputPath, artifact);
    atomicJson(progressPath, {
      schemaVersion: 1,
      kind: "rank19-adaptive-progress",
      status: "completed",
      reportPath: portable(outputPath),
      reportDigest: report.reportDigest,
      artifactDigest: artifact.artifactDigest,
      selectedPointIds: report.search.selectedPointIds,
      checkpointDigest: finalCheckpointReplay.checkpoint.checkpointDigest,
      elapsedSeconds: (performance.now() - started) / 1_000,
      sage: sageStats(),
      oracleCache: exactConeCache.stats(),
    });
    stage(`write ${basename(outputPath)}`);
  } finally {
    try {
      await exactConeCache.close();
    } finally {
      if (sage) await sage.close();
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
