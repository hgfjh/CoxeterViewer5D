#!/usr/bin/env -S pnpm exec tsx

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";

import type { GeneralizedCompressionCertificate } from "../src/davis/generalizedCompression";
import {
  completeStreamedH1Lattice,
  parseStreamedH1IntegralCoreBasis,
} from "../src/fibering/streamedH1Completion";
import { prepareStreamedH1Lattice } from "../src/fibering/streamedH1Lattice";
import { parseStreamedH1ModularCoreTranscript } from "../src/fibering/streamedH1ModularTranscript";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  bindStreamedFullH1Lattice,
  buildStreamedRank19TrackBReport,
} from "../src/fibering/streamedRank19TrackB";
import { JsonlCachedExactConeOracle } from "../src/fibering/node/jsonlCachedExactConeOracle";
import { PersistentSageHeightConeOracle } from "../src/fibering/node/persistentSageHeightConeOracle";
import { runStreamedRank19GlobalNormalCatalogue } from "../src/fibering/node/streamedRank19GlobalNormalCatalogue";
import { buildExactZ2CharacterLift } from "../src/torsionFree/derivedCharacterLift";
import { adaptExactPermutationCertificate } from "../src/torsionFree/exactPermutationArtifact";

interface Arguments {
  system: string;
  certificate: string;
  generalizedCompression: string;
  coreBasis: string;
  output: string;
  prefixCount: number;
  globalCatalogue: boolean;
  catalogueOnly: boolean;
  catalogueCheckpoint?: string;
  catalogueChunkSize: number;
  catalogueMaxChunks?: number;
  maxConeNodes?: number;
  maxOracleQueries?: number;
  modularTranscript30011: string;
  modularTranscript32749: string;
  oracleCache?: string;
  queryTimeoutSeconds: number;
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
  "  pnpm exec tsx scripts/run_rank19_track_b.ts --output REPORT.json",
  "    [--system SYSTEM.json] [--certificate ACTION.json.gz]",
  "    [--generalized-compression COMPRESSION.json] [--core-basis BASIS.txt]",
  "    [--prefix-count 8] [--global-catalogue true|false]",
  "    [--catalogue-only true|false] [--catalogue-checkpoint FILE]",
  "    [--catalogue-chunk-size 8192] [--catalogue-max-chunks N]",
  "    [--modular-transcript-30011 FILE] [--modular-transcript-32749 FILE]",
  "    [--max-cone-nodes N] [--max-oracle-queries N]",
  "    [--oracle-cache CACHE.jsonl]",
  "    [--query-timeout-seconds 300]",
].join("\n");

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parseBoolean(value: string, flag: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flag} must be true or false.`);
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
    "--output",
    "--prefix-count",
    "--global-catalogue",
    "--catalogue-only",
    "--catalogue-checkpoint",
    "--catalogue-chunk-size",
    "--catalogue-max-chunks",
    "--max-cone-nodes",
    "--max-oracle-queries",
    "--oracle-cache",
    "--modular-transcript-30011",
    "--modular-transcript-32749",
    "--query-timeout-seconds",
  ]);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) throw new Error(`Unknown flag ${flag}.\n${usage}`);
  }
  const output = values.get("--output");
  if (output === undefined) throw new Error(`Missing --output.\n${usage}`);
  return {
    system: values.get("--system") ?? DEFAULTS.system,
    certificate: values.get("--certificate") ?? DEFAULTS.certificate,
    generalizedCompression:
      values.get("--generalized-compression") ??
      DEFAULTS.generalizedCompression,
    coreBasis: values.get("--core-basis") ?? DEFAULTS.coreBasis,
    output,
    modularTranscript30011:
      values.get("--modular-transcript-30011") ??
      DEFAULTS.modularTranscript30011,
    modularTranscript32749:
      values.get("--modular-transcript-32749") ??
      DEFAULTS.modularTranscript32749,
    ...(values.get("--oracle-cache") === undefined
      ? {}
      : { oracleCache: values.get("--oracle-cache")! }),
    prefixCount: positiveInteger(
      values.get("--prefix-count") ?? "8",
      "--prefix-count",
    ),
    globalCatalogue: parseBoolean(
      values.get("--global-catalogue") ?? "true",
      "--global-catalogue",
    ),
    catalogueOnly: parseBoolean(
      values.get("--catalogue-only") ?? "false",
      "--catalogue-only",
    ),
    ...(values.get("--catalogue-checkpoint") === undefined
      ? {}
      : { catalogueCheckpoint: values.get("--catalogue-checkpoint")! }),
    catalogueChunkSize: positiveInteger(
      values.get("--catalogue-chunk-size") ?? "8192",
      "--catalogue-chunk-size",
    ),
    ...(values.get("--catalogue-max-chunks") === undefined
      ? {}
      : {
          catalogueMaxChunks: positiveInteger(
            values.get("--catalogue-max-chunks")!,
            "--catalogue-max-chunks",
          ),
        }),
    queryTimeoutSeconds: positiveInteger(
      values.get("--query-timeout-seconds") ?? "300",
      "--query-timeout-seconds",
    ),
    ...(values.get("--max-cone-nodes") === undefined
      ? {}
      : {
          maxConeNodes: positiveInteger(
            values.get("--max-cone-nodes")!,
            "--max-cone-nodes",
          ),
        }),
    ...(values.get("--max-oracle-queries") === undefined
      ? {}
      : {
          maxOracleQueries: positiveInteger(
            values.get("--max-oracle-queries")!,
            "--max-oracle-queries",
          ),
        }),
  };
}

function boundedFile(path: string, maximumBytes: number): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(
      `${path} is not a regular file within ${maximumBytes} bytes.`,
    );
  }
  return readFileSync(path);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
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
  if (existsSync(outputPath)) {
    throw new Error(`Refusing to replace existing report ${outputPath}.`);
  }
  const progressPath = `${outputPath}.progress.json`;
  const oracleCachePath = resolve(
    args.oracleCache ?? `${outputPath}.oracle-cache.jsonl`,
  );
  if (oracleCachePath === outputPath || oracleCachePath === progressPath) {
    throw new Error(
      "The exact-oracle cache must differ from the report and progress paths.",
    );
  }
  const started = performance.now();
  let previousStage = started;
  const stage = (label: string): void => {
    const now = performance.now();
    process.stderr.write(
      `[rank19-track-b] ${label}: ${((now - previousStage) / 1_000).toFixed(1)} s; total ${((now - started) / 1_000).toFixed(1)} s.\n`,
    );
    previousStage = now;
  };
  const portable = (path: string): string =>
    relative(process.cwd(), path).replaceAll("\\", "/");

  const systemPath = resolve(args.system);
  const certificatePath = resolve(args.certificate);
  const compressionPath = resolve(args.generalizedCompression);
  const coreBasisPath = resolve(args.coreBasis);
  const modularTranscript30011Path = resolve(args.modularTranscript30011);
  const modularTranscript32749Path = resolve(args.modularTranscript32749);
  const systemBytes = boundedFile(systemPath, 16 * 1024 * 1024);
  const compressedAction = boundedFile(certificatePath, 128 * 1024 * 1024);
  const actionBytes =
    compressedAction[0] === 0x1f && compressedAction[1] === 0x8b
      ? gunzipSync(compressedAction, { maxOutputLength: 256 * 1024 * 1024 })
      : compressedAction;
  const parent = adaptExactPermutationCertificate(
    parseJson(systemBytes, systemPath),
    parseJson(actionBytes, certificatePath),
    {
      candidateId: "rank19-track-b-parent",
      candidateName: "Rank-19 Track-B parent action",
      callerAssertedProvenance: {
        sourceArtifact: {
          path: portable(certificatePath),
          sha256: sha256(compressedAction),
          encoding: compressedAction === actionBytes ? "json" : "gzip-json",
        },
        sourceSystemFile: {
          path: portable(systemPath),
          sha256: sha256(systemBytes),
        },
      },
    },
  );
  const lift = buildExactZ2CharacterLift(
    parent.system,
    parent.action,
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    {
      candidateId: "rank19-track-b-z2-lift",
      candidateName: "Rank-19 Track-B exact Z/2 lift",
    },
  );
  if (!lift.acceptedCandidate)
    throw new Error("The exact Z/2 lift was rejected.");
  const oracle = buildStreamedLawfulDavisOracle({
    system: parent.system,
    generatorImages: lift.acceptedCandidate.generatorImages,
  });
  const compression = parseJson(
    boundedFile(compressionPath, 64 * 1024 * 1024),
    compressionPath,
  ) as GeneralizedCompressionCertificate;
  stage("load exact action, lift, oracle, and generalized compression");

  const preparation = prepareStreamedH1Lattice(oracle);
  const storedCoreBasisBytes = boundedFile(coreBasisPath, 64 * 1024 * 1024);
  const coreBasisContainerSha256 = sha256(storedCoreBasisBytes);
  if (
    coreBasisContainerSha256 !==
    "1c30dcb941d8e723c4032aadd591fb3efe19e5b20b33d30223075a8b2892f1ad"
  ) {
    throw new Error(
      `Integral core-basis container SHA-256 is ${coreBasisContainerSha256}; expected 1c30dcb941d8e723c4032aadd591fb3efe19e5b20b33d30223075a8b2892f1ad.`,
    );
  }
  const coreBasisBytes =
    storedCoreBasisBytes[0] === 0x1f && storedCoreBasisBytes[1] === 0x8b
      ? gunzipSync(storedCoreBasisBytes, {
          maxOutputLength: 64 * 1024 * 1024,
        })
      : storedCoreBasisBytes;
  const coreBasisContentSha256 = sha256(coreBasisBytes);
  if (
    coreBasisContentSha256 !==
    "b81fbf5d0f387ce62ccffe8d3698a7f6fad4f16a36698b7dd0cbc2c883c7f370"
  ) {
    throw new Error(
      `Integral core-basis content SHA-256 is ${coreBasisContentSha256}; expected b81fbf5d0f387ce62ccffe8d3698a7f6fad4f16a36698b7dd0cbc2c883c7f370.`,
    );
  }
  const coreBasis = parseStreamedH1IntegralCoreBasis(
    coreBasisBytes.toString("utf8"),
    {
      sourceArtifactSha256: coreBasisContentSha256,
      expectedCoreColumnCount:
        preparation.certificate.peel.unresolvedColumnCount,
      expectedCoreRowCount: preparation.certificate.peel.nonpivotRowCount,
    },
  );
  const parseModularTranscript = (
    path: string,
    modulusPrime: number,
    expectedContainerSha256: string,
    expectedContentSha256: string,
  ) => {
    const stored = boundedFile(path, 64 * 1024 * 1024);
    const containerSha256 = sha256(stored);
    if (containerSha256 !== expectedContainerSha256) {
      throw new Error(
        `Modular transcript ${path} has container SHA-256 ${containerSha256}; expected ${expectedContainerSha256}.`,
      );
    }
    const decoded =
      stored[0] === 0x1f && stored[1] === 0x8b
        ? gunzipSync(stored, { maxOutputLength: 64 * 1024 * 1024 })
        : stored;
    const text = decoded.toString("utf8");
    if (sha256(decoded) !== expectedContentSha256) {
      throw new Error(
        `Modular transcript ${path} has content SHA-256 ${sha256(decoded)}; expected ${expectedContentSha256}.`,
      );
    }
    return parseStreamedH1ModularCoreTranscript(text, {
      sourceArtifactSha256: expectedContentSha256,
      modulusPrime,
      preparation,
      integralCoreBasis: coreBasis,
      backend: "LinBox/Givaro",
      backendVersion: "1.7.0-4/4.2.0",
      algorithm: "GaussDomain::InPlaceLinearPivoting",
    });
  };
  const modular30011 = parseModularTranscript(
    modularTranscript30011Path,
    30_011,
    "a08e6af7e33ac4353020af8a2a8ab5ada6bc01c3bf7e4a136703f62b650b923d",
    "e1ee69886d250aff960f527c16396ddbb6a6d2cad0397c40bad750913b5f960c",
  );
  const modular32749 = parseModularTranscript(
    modularTranscript32749Path,
    32_749,
    "326864ee604bccbe131928726d046ddd00cdb5d5201089b11786cdb541853451",
    "aa11a098739ebfa20eb0743d6cfa56ecc52169a3000bfe641fecfd962b7b8006",
  );
  const completion = completeStreamedH1Lattice({
    oracle,
    preparation,
    coreBasis,
    modularRankWitnesses: [modular30011.witness, modular32749.witness],
  });
  if (completion.certificate.status !== "passed") {
    const failedChecks = Object.entries(completion.certificate.checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    throw new Error(
      `The complete H^1 replay failed checks ${failedChecks.join(", ")}: ${completion.certificate.errors.join(" ")}`,
    );
  }
  bindStreamedFullH1Lattice(completion.certificate);
  stage("replay and bind the complete integral H^1 lattice");

  if (args.catalogueOnly) {
    const checkpointPath = resolve(
      args.catalogueCheckpoint ?? `${outputPath}.checkpoint.json`,
    );
    if (checkpointPath === outputPath || checkpointPath === progressPath) {
      throw new Error(
        "The catalogue checkpoint must differ from the output and progress paths.",
      );
    }
    const catalogueResult = runStreamedRank19GlobalNormalCatalogue({
      oracle,
      generalizedCompression: compression,
      cocycleBasis: completion.integralCocycleBasis,
      h1Certificate: completion.certificate,
      checkpointPath,
      chunkSize: args.catalogueChunkSize,
      ...(args.catalogueMaxChunks === undefined
        ? {}
        : { maxChunksThisRun: args.catalogueMaxChunks }),
      onCheckpoint(checkpoint) {
        atomicJson(progressPath, {
          schemaVersion: 1,
          kind: "rank19-global-normal-catalogue-progress",
          status: "running",
          source: {
            system: portable(systemPath),
            certificate: portable(certificatePath),
            generalizedCompression: portable(compressionPath),
            coreBasis: portable(coreBasisPath),
            modularTranscript30011: portable(modularTranscript30011Path),
            modularTranscript32749: portable(modularTranscript32749Path),
          },
          checkpointPath: portable(checkpointPath),
          checkpointDigest: checkpoint.checkpointDigest,
          completed: checkpoint.nextPoint,
          total: checkpoint.degree,
          chunkCount: checkpoint.chunks.length,
          normalCount: checkpoint.normalCount,
          identicallyZeroGermCount: checkpoint.identicallyZeroGermCount,
          elapsedSeconds: (performance.now() - started) / 1_000,
        });
      },
    });
    if (catalogueResult.status === "checkpointed") {
      atomicJson(progressPath, {
        schemaVersion: 1,
        kind: "rank19-global-normal-catalogue-progress",
        status: "checkpointed",
        checkpointPath: portable(checkpointPath),
        checkpointDigest: catalogueResult.checkpoint.checkpointDigest,
        completed: catalogueResult.checkpoint.nextPoint,
        total: catalogueResult.checkpoint.degree,
        chunkCount: catalogueResult.checkpoint.chunks.length,
        normalCount: catalogueResult.checkpoint.normalCount,
        identicallyZeroGermCount:
          catalogueResult.checkpoint.identicallyZeroGermCount,
        elapsedSeconds: (performance.now() - started) / 1_000,
      });
      stage("checkpoint global rank-19 normal catalogue");
      return;
    }
    atomicJson(outputPath, catalogueResult.artifact);
    atomicJson(progressPath, {
      schemaVersion: 1,
      kind: "rank19-global-normal-catalogue-progress",
      status: "completed",
      artifactPath: portable(outputPath),
      artifactDigest: catalogueResult.artifact.artifactDigest,
      checkpointPath: portable(checkpointPath),
      completed: catalogueResult.artifact.nextPoint,
      total: catalogueResult.artifact.degree,
      chunkCount: catalogueResult.artifact.chunks.length,
      normalCount: catalogueResult.artifact.normalCount,
      identicallyZeroGermCount:
        catalogueResult.artifact.identicallyZeroGermCount,
      elapsedSeconds: (performance.now() - started) / 1_000,
    });
    stage(`write ${basename(outputPath)}`);
    return;
  }

  // Building the pulling templates is CPU-heavy and can take several
  // minutes. Start WSL/Sage at the first cone query so its stdin is not left
  // idle during that synchronous phase (some wsl.exe versions close it).
  let sage: PersistentSageHeightConeOracle | undefined;
  const sageStats = () =>
    sage?.stats() ?? {
      submitted: 0,
      completed: 0,
      pending: 0,
      backendCacheSize: 0,
      stderrTail: "",
    };
  const sageDelegate = {
    solve(request: Parameters<PersistentSageHeightConeOracle["solve"]>[0]) {
      sage ??= new PersistentSageHeightConeOracle({
        command: process.platform === "win32" ? "wsl" : "sage",
        args:
          process.platform === "win32"
            ? [
                "/opt/miniforge3/envs/sage/bin/python",
                "scripts/sage_exact_height_cone.py",
                "--server",
              ]
            : ["-python", "scripts/sage_exact_height_cone.py", "--server"],
        cwd: process.cwd(),
        maxPendingQueries: 1,
        queryTimeoutMs: 1_000 * args.queryTimeoutSeconds,
      });
      return sage.solve(request);
    },
  };
  const exactConeCache = new JsonlCachedExactConeOracle({
    path: oracleCachePath,
    delegate: sageDelegate,
  });
  let logicalOracleCompleted = 0;
  let lastProgressWrite = 0;
  const writeProgress = (event: Record<string, unknown>): void => {
    const now = performance.now();
    process.stderr.write(
      `[rank19-track-b] ${String(event.stage)}: ${String(event.completed ?? "?")}/${String(event.total ?? "?")}.\n`,
    );
    atomicJson(progressPath, {
      schemaVersion: 1,
      kind: "rank19-track-b-progress",
      source: {
        system: portable(systemPath),
        certificate: portable(certificatePath),
        generalizedCompression: portable(compressionPath),
        coreBasis: portable(coreBasisPath),
        modularTranscript30011: portable(modularTranscript30011Path),
        modularTranscript32749: portable(modularTranscript32749Path),
        oracleCache: portable(oracleCachePath),
      },
      event,
      elapsedSeconds: (now - started) / 1_000,
      sage: sageStats(),
      oracleCache: exactConeCache.stats(),
    });
    lastProgressWrite = now;
  };
  const exactConeOracle = {
    async solve(
      request: Parameters<PersistentSageHeightConeOracle["solve"]>[0],
    ) {
      const certificate = await exactConeCache.solve(request);
      logicalOracleCompleted += 1;
      const now = performance.now();
      if (logicalOracleCompleted === 1 || now - lastProgressWrite >= 15_000) {
        writeProgress({
          stage: "cone-query",
          completed: logicalOracleCompleted,
          total: args.maxOracleQueries ?? "unbounded",
        });
      }
      return certificate;
    },
  };
  try {
    const report = await buildStreamedRank19TrackBReport({
      oracle,
      generalizedCompression: compression,
      h1Certificate: completion.certificate,
      cocycleBasis: completion.integralCocycleBasis,
      exactConeOracle,
      prefixPoints: Array.from(
        { length: Math.min(args.prefixCount, oracle.degree) },
        (_unused, point) => point,
      ),
      materializeGlobalNormalCatalogue: args.globalCatalogue,
      ...(args.maxConeNodes === undefined
        ? {}
        : { maxConeNodes: args.maxConeNodes }),
      ...(args.maxOracleQueries === undefined
        ? {}
        : { maxOracleQueries: args.maxOracleQueries }),
      onProgress(event) {
        const now = performance.now();
        if (
          event.completed === event.total ||
          event.completed === 1 ||
          now - lastProgressWrite >= 15_000
        ) {
          writeProgress(event);
        }
      },
    });
    atomicJson(outputPath, {
      ...report,
      runner: {
        systemPath: portable(systemPath),
        certificatePath: portable(certificatePath),
        generalizedCompressionPath: portable(compressionPath),
        coreBasisPath: portable(coreBasisPath),
        modularTranscript30011Path: portable(modularTranscript30011Path),
        modularTranscript32749Path: portable(modularTranscript32749Path),
        elapsedSeconds: (performance.now() - started) / 1_000,
        sage: sageStats(),
        oracleCachePath: portable(oracleCachePath),
        oracleCache: exactConeCache.stats(),
      },
    });
    atomicJson(progressPath, {
      schemaVersion: 1,
      kind: "rank19-track-b-progress",
      status: "completed",
      reportPath: portable(outputPath),
      reportDigest: report.reportDigest,
      elapsedSeconds: (performance.now() - started) / 1_000,
      sage: sageStats(),
      oracleCache: exactConeCache.stats(),
    });
    stage(`write ${basename(outputPath)}`);
  } finally {
    try {
      await exactConeCache.close();
    } finally {
      if (sage !== undefined) await sage.close();
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
