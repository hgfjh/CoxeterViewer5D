import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  buildMakarovP0P1ActionCampaign,
  makeMakarovP0DiscoveryRunnerFailure,
  MAKAROV_P0_P1_PRE_SCREEN_EVIDENCE,
  MAKAROV_P0_P1_SOURCE_BYTES_SHA256,
  MAKAROV_P0_P1_SOURCE_PATHS,
  makarovP0P1CampaignConfiguration,
  replayMakarovP0P1ActionCampaign,
  type MakarovP0P1ActionCampaignArtifact,
  type MakarovP0P1CampaignConfiguration,
  type MakarovP0P1DiscoveryExecution,
} from "./makarovP0P1ActionCampaign";
import {
  parseMakarovP0P1CampaignArguments,
  type MakarovP0P1CampaignCliArguments,
} from "./makarovP0P1ActionCampaignCli";

function portable(path: string): string {
  return relative(process.cwd(), resolve(path)).replaceAll("\\", "/");
}

async function readBoundedJson(
  path: string,
  maximumBytes: number,
): Promise<unknown> {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(
      `${portable(path)} is not a regular JSON file within the ${maximumBytes}-byte bound.`,
    );
  }
  const bytes = await readFile(path);
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`${portable(path)} changed while it was read.`);
  }
  return JSON.parse(bytes.toString("utf8")) as unknown;
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function fileSha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function verifyBundledSourceBytes(): Promise<void> {
  const checks = [
    [MAKAROV_P0_P1_SOURCE_PATHS.p0, MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p0],
    [MAKAROV_P0_P1_SOURCE_PATHS.p1, MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p1],
  ] as const;
  for (const [path, expected] of checks) {
    const actual = await fileSha256(resolve(path));
    if (actual !== expected) {
      throw new Error(`${path} no longer has its reviewed source-byte digest.`);
    }
  }
  for (const binding of MAKAROV_P0_P1_PRE_SCREEN_EVIDENCE) {
    const path = resolve(binding.path);
    const actual = await fileSha256(path);
    if (actual !== binding.bytesSha256) {
      throw new Error(
        `${binding.path} no longer has its reviewed byte digest.`,
      );
    }
    const raw = await readBoundedJson(path, 8 * 1024 * 1024);
    if (
      typeof raw !== "object" ||
      raw === null ||
      Array.isArray(raw) ||
      (raw as Record<string, unknown>).artifactType !== binding.artifactType ||
      (raw as Record<string, unknown>).status !== "passed" ||
      (raw as Record<string, unknown>).certificateSha256 !==
        binding.certificateSha256
    ) {
      throw new Error(`${binding.path} is not the pinned passed pre-screen.`);
    }
  }
}

function rawStatus(raw: unknown): unknown {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>).status
    : undefined;
}

function hardTerminateProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid !== undefined && process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      timeout: 10_000,
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return;
  } else if (pid !== undefined) {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      // Fall through when the process group has already exited.
    }
  }
  child.kill("SIGKILL");
}

async function reusablePassedArtifact(
  args: MakarovP0P1CampaignCliArguments,
  configuration: MakarovP0P1CampaignConfiguration,
): Promise<MakarovP0P1ActionCampaignArtifact | undefined> {
  if (!args.reusePassed) return undefined;
  let raw: unknown;
  try {
    raw = await readBoundedJson(resolve(args.discovery), args.maxInputBytes);
  } catch {
    return undefined;
  }
  if (rawStatus(raw) !== "passed") return undefined;
  try {
    return buildMakarovP0P1ActionCampaign({
      rawDiscovery: raw,
      selectedP0DegreeTier: configuration.selectedP0DegreeTier,
      maxCongruencePrime: configuration.maxCongruencePrime,
      timeoutSeconds: configuration.timeoutSeconds,
      execution: {
        mode: "accepted-existing-artifact",
        discoveryArtifactPath: portable(args.discovery),
        checkpointDirectory: portable(args.checkpointDirectory),
        processExitCode: null,
        campaignWallClockTimeoutTriggered: false,
        hardTerminationRequested: false,
        terminationDeadlineExceeded: false,
      },
    });
  } catch {
    return undefined;
  }
}

interface DiscoveryExecutionResult {
  raw: unknown;
  execution: MakarovP0P1DiscoveryExecution;
  prebuiltArtifact?: MakarovP0P1ActionCampaignArtifact;
}

export interface MakarovP0P1CampaignTiming {
  millisecondsPerSecond: number;
  hardKillGraceMs: number;
  terminationGraceMs: number;
  cleanupGraceMs: number;
}

const DEFAULT_CAMPAIGN_TIMING: MakarovP0P1CampaignTiming = {
  millisecondsPerSecond: 1_000,
  hardKillGraceMs: 30_000,
  terminationGraceMs: 45_000,
  cleanupGraceMs: 2_000,
};

function validateCampaignTiming(timing: MakarovP0P1CampaignTiming): void {
  for (const [label, value] of Object.entries(timing)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${label} must be a positive safe integer.`);
    }
  }
  if (timing.terminationGraceMs <= timing.hardKillGraceMs) {
    throw new Error("terminationGraceMs must exceed hardKillGraceMs.");
  }
}

async function executeBoundedDiscovery(
  args: MakarovP0P1CampaignCliArguments,
  configuration: MakarovP0P1CampaignConfiguration,
  timing: MakarovP0P1CampaignTiming,
  spawnProcess: typeof spawn,
): Promise<DiscoveryExecutionResult> {
  const discoveryPath = resolve(args.discovery);
  const checkpointDirectory = resolve(args.checkpointDirectory);
  const runDirectory = dirname(discoveryPath);
  await mkdir(runDirectory, { recursive: true });
  await mkdir(checkpointDirectory, { recursive: true });
  const freshOutput = `${discoveryPath}.run-${process.pid}-${Date.now()}.json`;
  const cancelFile = `${discoveryPath}.cancel-${process.pid}`;
  // Keep this path short: the runtime appends two SHA-256 directory names,
  // which exceeds the legacy Windows path limit under a verbose checkpoint
  // directory. Cache entries are still content/configuration scoped.
  const runtimeCacheRoot = resolve(".cover-search", ".runtime");
  await unlink(cancelFile).catch(() => undefined);
  const command = [
    ...configuration.discoveryCommand,
    "--output",
    portable(freshOutput),
    "--checkpoint-dir",
    portable(checkpointDirectory),
    "--cancel-file",
    portable(cancelFile),
  ];
  let timeoutTriggered = false;
  let hardTerminationRequested = false;
  let terminationDeadlineExceeded = false;
  let childClosed = false;
  let spawnError: Error | undefined;
  let processExitCode: number | null = null;
  let cancellationWrite: Promise<void> | undefined;
  const child = spawnProcess(command[0], command.slice(1), {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      // The managed runtime prefers an ext4 cache. If WSL setup falls back to
      // a native cache, keep it in the repository's ignored search boundary
      // instead of an implicit user directory.
      LOCALAPPDATA: runtimeCacheRoot,
      COXETER_DISCOVERY_CACHE: resolve(runtimeCacheRoot, "packed-composite"),
    },
    shell: false,
    stdio: "inherit",
  });
  const cancelTimer = setTimeout(() => {
    timeoutTriggered = true;
    cancellationWrite = writeFile(
      cancelFile,
      "bounded P0 campaign timeout\n",
      "utf8",
    ).catch(() => undefined);
  }, configuration.timeoutSeconds * timing.millisecondsPerSecond);
  const hardKillTimer = setTimeout(
    () => {
      if (timeoutTriggered && !childClosed) {
        hardTerminationRequested = true;
        hardTerminateProcessTree(child);
      }
    },
    configuration.timeoutSeconds * timing.millisecondsPerSecond +
      timing.hardKillGraceMs,
  );
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const childCompletion = new Promise<void>((settle) => {
    let settled = false;
    const done = (): void => {
      if (!settled) {
        settled = true;
        settle();
      }
    };
    child.once("error", (error) => {
      spawnError = error;
      childClosed = true;
      done();
    });
    child.once("close", (code) => {
      processExitCode = code;
      childClosed = true;
      done();
    });
  });
  const terminationDeadline = new Promise<void>((settle) => {
    deadlineTimer = setTimeout(
      () => {
        if (!childClosed) {
          terminationDeadlineExceeded = true;
          hardTerminationRequested = true;
          hardTerminateProcessTree(child);
        }
        settle();
      },
      configuration.timeoutSeconds * timing.millisecondsPerSecond +
        timing.terminationGraceMs,
    );
  });
  await Promise.race([childCompletion, terminationDeadline]);
  if (terminationDeadlineExceeded && !childClosed) {
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanupGrace = new Promise<void>((settle) => {
      cleanupTimer = setTimeout(settle, timing.cleanupGraceMs);
    });
    await Promise.race([childCompletion, cleanupGrace]);
    if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
    if (!childClosed) child.unref();
  }
  clearTimeout(cancelTimer);
  clearTimeout(hardKillTimer);
  if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  await cancellationWrite;
  if (childClosed) await unlink(cancelFile).catch(() => undefined);

  let raw: unknown;
  if (terminationDeadlineExceeded) {
    raw = makeMakarovP0DiscoveryRunnerFailure(
      configuration,
      "The discovery process did not close after cancellation and hard process-tree termination.",
      "timeout",
    );
  } else {
    try {
      raw = await readBoundedJson(freshOutput, args.maxInputBytes);
    } catch (error) {
      const reason = spawnError
        ? `The discovery process could not start: ${spawnError.message}`
        : `The bounded discovery exited ${String(processExitCode)} without a readable artifact: ${error instanceof Error ? error.message : String(error)}`;
      raw = makeMakarovP0DiscoveryRunnerFailure(
        configuration,
        reason,
        timeoutTriggered ? "timeout" : "failed",
      );
    } finally {
      await unlink(freshOutput).catch(() => undefined);
    }
  }
  return {
    raw,
    execution: {
      mode: "executed-bounded-discovery",
      discoveryArtifactPath: portable(discoveryPath),
      checkpointDirectory: portable(checkpointDirectory),
      processExitCode,
      campaignWallClockTimeoutTriggered: timeoutTriggered,
      hardTerminationRequested,
      terminationDeadlineExceeded,
    },
  };
}

async function acquireRawDiscovery(
  args: MakarovP0P1CampaignCliArguments,
  configuration: MakarovP0P1CampaignConfiguration,
  timing: MakarovP0P1CampaignTiming,
  spawnProcess: typeof spawn,
): Promise<DiscoveryExecutionResult> {
  if (!args.execute) {
    return {
      raw: await readBoundedJson(resolve(args.discovery), args.maxInputBytes),
      execution: {
        mode: "accepted-existing-artifact",
        discoveryArtifactPath: portable(args.discovery),
        checkpointDirectory: portable(args.checkpointDirectory),
        processExitCode: null,
        campaignWallClockTimeoutTriggered: false,
        hardTerminationRequested: false,
        terminationDeadlineExceeded: false,
      },
    };
  }
  const reusable = await reusablePassedArtifact(args, configuration);
  if (reusable) {
    return {
      raw: reusable.discovery.rawArtifact,
      execution: reusable.execution,
      prebuiltArtifact: reusable,
    };
  }
  return executeBoundedDiscovery(args, configuration, timing, spawnProcess);
}

export async function runMakarovP0P1ActionCampaignCli(
  argv: readonly string[],
  timing: MakarovP0P1CampaignTiming = DEFAULT_CAMPAIGN_TIMING,
  spawnProcess: typeof spawn = spawn,
): Promise<number> {
  validateCampaignTiming(timing);
  const args = parseMakarovP0P1CampaignArguments(argv);
  await verifyBundledSourceBytes();
  const output = resolve(args.output);
  if (args.verifyOnly) {
    const stored = await readBoundedJson(output, args.maxInputBytes);
    const replay = replayMakarovP0P1ActionCampaign(stored);
    if (replay.status !== "passed") {
      throw new Error(
        `Stored P0/P1 campaign failed replay: ${replay.errors.join(" ")}`,
      );
    }
    console.log(`verified ${portable(output)} (${replay.replayDigest})`);
    return 0;
  }

  const configuration = makarovP0P1CampaignConfiguration({
    selectedP0DegreeTier: args.selectedP0DegreeTier,
    maxCongruencePrime: args.maxCongruencePrime,
    timeoutSeconds: args.timeoutSeconds,
  });
  if (resolve(args.output) === resolve(args.discovery)) {
    throw new Error("The campaign output and raw discovery paths must differ.");
  }
  const acquired = await acquireRawDiscovery(
    args,
    configuration,
    timing,
    spawnProcess,
  );
  const artifact =
    acquired.prebuiltArtifact ??
    buildMakarovP0P1ActionCampaign({
      rawDiscovery: acquired.raw,
      selectedP0DegreeTier: configuration.selectedP0DegreeTier,
      maxCongruencePrime: configuration.maxCongruencePrime,
      timeoutSeconds: configuration.timeoutSeconds,
      execution: acquired.execution,
    });
  const replay = replayMakarovP0P1ActionCampaign(artifact);
  if (replay.status !== "passed") {
    throw new Error(
      `Fresh P0/P1 campaign failed replay: ${replay.errors.join(" ")}`,
    );
  }
  if (acquired.execution.mode === "executed-bounded-discovery") {
    await atomicJson(resolve(args.discovery), acquired.raw);
  }
  await atomicJson(output, artifact);
  console.log(
    `wrote ${portable(output)} (${artifact.outcome}; ${artifact.acceptedActionPayloads.length} accepted action payloads)`,
  );
  return 0;
}
