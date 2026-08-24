#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildCompactActionPortfolio,
  COMPACT_TARGET_DEFINITIONS,
  replayCompactActionPortfolio,
  type CompactActionPortfolioArtifact,
  type CompactTargetSourceInput,
} from "../src/fibering/compactActionPortfolio";
import {
  buildJnwCubePositiveControlCertificate,
  replayJnwCubePositiveControlCertificate,
  type JnwCubePositiveControlCertificate,
} from "../src/fibering/jnwCubePositiveControl";
import {
  buildFiberingResearchPortfolio,
  replayFiberingResearchPortfolio,
  type FiberingResearchPortfolioArtifact,
  type ResearchPortfolioFileBinding,
} from "../src/fibering/researchPortfolio";
import { canonicalSha256 } from "../src/utils/canonicalSha256";
import {
  RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
  runRank19CubeRescue,
  type CompactCubeBoundedRescueRunnerArtifact,
} from "./run_rank19_cube_rescue";

const DEFAULT_OUTPUT =
  "scripts/certificates/portfolio/fibering_research_portfolio.json";
const COMPACT_OUTPUT =
  "scripts/certificates/portfolio/compact_h5_action_portfolio.json";
const JNW_SOURCE = "public/examples/jnw_cube_graph.json";
const JNW_OUTPUT =
  "scripts/certificates/torsion-free/jnw_cube_graph_degree4_positive_control.json";
const FIXED_PREFLIGHT_TIME = "2026-08-22T00:00:00.000Z";

interface Arguments {
  output: string;
  verifyOnly: boolean;
  rebindOnly: boolean;
  rebuildCube: boolean;
  rebuildJnw: boolean;
  rebuildCompact: boolean;
}

function booleanValue(value: string | undefined, label: string): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${label} must be true or false.`);
}

function parseArguments(argv: readonly string[]): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (normalized.length % 2 !== 0) {
    throw new Error("Arguments must be supplied as --name value pairs.");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      throw new Error(
        "Arguments must be supplied as distinct --name value pairs.",
      );
    }
    values.set(key, value);
  }
  const known = new Set([
    "--output",
    "--verify-only",
    "--rebind-only",
    "--rebuild-cube",
    "--rebuild-jnw",
    "--rebuild-compact",
  ]);
  for (const key of values.keys()) {
    if (!known.has(key)) throw new Error(`Unknown argument ${key}.`);
  }
  return {
    output: values.get("--output") ?? DEFAULT_OUTPUT,
    verifyOnly: booleanValue(values.get("--verify-only"), "--verify-only"),
    rebindOnly: booleanValue(values.get("--rebind-only"), "--rebind-only"),
    rebuildCube: booleanValue(values.get("--rebuild-cube"), "--rebuild-cube"),
    rebuildJnw: booleanValue(values.get("--rebuild-jnw"), "--rebuild-jnw"),
    rebuildCompact: booleanValue(
      values.get("--rebuild-compact"),
      "--rebuild-compact",
    ),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function fileBinding(path: string): ResearchPortfolioFileBinding {
  const absolute = resolve(path);
  return {
    path: relative(process.cwd(), absolute).replaceAll("\\", "/"),
    bytesSha256: sha256(readFileSync(absolute)),
  };
}

function atomicJson(path: string, value: unknown): void {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function compactSources(): CompactTargetSourceInput[] {
  return COMPACT_TARGET_DEFINITIONS.map((definition) => {
    const bytes = readFileSync(resolve(definition.sourcePath));
    return {
      id: definition.id,
      path: definition.sourcePath,
      bytesSha256: sha256(bytes),
      input: JSON.parse(bytes.toString("utf8")) as unknown,
    };
  });
}

function requireExistingArtifact(path: string, label: string): void {
  if (!existsSync(resolve(path))) {
    throw new Error(
      `Missing ${label} ${resolve(path)}. Verification is read-only; run the portfolio build first.`,
    );
  }
}

function artifactHashIsValid(
  artifact: FiberingResearchPortfolioArtifact,
): boolean {
  const { artifactHash, ...payload } = artifact;
  return artifactHash === canonicalSha256(payload);
}

/**
 * Rebinding changes only the small aggregate envelope after another component
 * was regenerated. The previous aggregate is the receipt that the exact cube
 * replay already ran; the cube bytes and all three internal digests must be
 * unchanged. This is never a substitute for the initial fresh build.
 */
function loadCubeFromExistingAggregate(
  aggregatePath: string,
): CompactCubeBoundedRescueRunnerArtifact {
  requireExistingArtifact(aggregatePath, "aggregate portfolio rebind source");
  requireExistingArtifact(
    RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
    "cube-rescue artifact",
  );
  const prior = readJson<FiberingResearchPortfolioArtifact>(aggregatePath);
  if (
    prior.schemaVersion !== 1 ||
    prior.kind !== "fibering-research-portfolio" ||
    prior.status !== "passed" ||
    !artifactHashIsValid(prior)
  ) {
    throw new Error(
      "Rebind-only mode requires an intact previously passed aggregate.",
    );
  }
  const binding = fileBinding(RANK19_CUBE_RESCUE_DEFAULT_OUTPUT);
  const cube = readJson<CompactCubeBoundedRescueRunnerArtifact>(
    RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
  );
  if (
    prior.cubeRescue.path !== binding.path ||
    prior.cubeRescue.bytesSha256 !== binding.bytesSha256 ||
    prior.cubeRescue.runnerArtifactDigest !== cube.artifactDigest ||
    prior.cubeRescue.certificateDigest !== cube.certificate.certificateDigest ||
    prior.cubeRescue.replayDigest !== cube.replay.replayDigest ||
    prior.cubeRescue.noGlobalNormalCatalogueLoaded !== true ||
    cube.runner.noGlobalNormalCatalogueLoaded !== true ||
    cube.replay.status !== "passed" ||
    !Object.values(cube.replay.checks).every(Boolean)
  ) {
    throw new Error(
      "The cube artifact changed after the aggregate's exact replay; a fresh aggregate build is required.",
    );
  }
  return cube;
}

async function loadCube(
  rebuild: boolean,
  verifyOnly: boolean,
): Promise<CompactCubeBoundedRescueRunnerArtifact> {
  const output = resolve(RANK19_CUBE_RESCUE_DEFAULT_OUTPUT);
  if (verifyOnly) {
    requireExistingArtifact(
      RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
      "cube-rescue artifact",
    );
    return runRank19CubeRescue([
      "--verify-only",
      "true",
      "--output",
      RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
    ]);
  }
  if (!existsSync(output) || rebuild) {
    return runRank19CubeRescue([
      "--output",
      RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
      ...(existsSync(output) ? ["--overwrite", "true"] : []),
    ]);
  }
  return runRank19CubeRescue([
    "--verify-only",
    "true",
    "--output",
    RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
  ]);
}

function loadJnw(
  rebuild: boolean,
  verifyOnly: boolean,
): {
  certificate: JnwCubePositiveControlCertificate;
  replay: ReturnType<typeof replayJnwCubePositiveControlCertificate>;
} {
  const source = readJson<unknown>(JNW_SOURCE);
  if (verifyOnly) {
    requireExistingArtifact(JNW_OUTPUT, "JNW positive-control artifact");
  }
  if (!existsSync(resolve(JNW_OUTPUT)) || rebuild) {
    atomicJson(JNW_OUTPUT, buildJnwCubePositiveControlCertificate(source));
  }
  const certificate = readJson<JnwCubePositiveControlCertificate>(JNW_OUTPUT);
  const replay = replayJnwCubePositiveControlCertificate(certificate, source);
  if (!replay.valid) {
    throw new Error(
      `JNW positive-control replay failed: ${replay.errors.join(" ")}`,
    );
  }
  return { certificate, replay };
}

function loadCompact(
  rebuild: boolean,
  verifyOnly: boolean,
): {
  artifact: CompactActionPortfolioArtifact;
  replay: ReturnType<typeof replayCompactActionPortfolio>;
} {
  const sources = compactSources();
  if (verifyOnly) {
    requireExistingArtifact(
      COMPACT_OUTPUT,
      "compact-action preflight artifact",
    );
  }
  if (!existsSync(resolve(COMPACT_OUTPUT)) || rebuild) {
    atomicJson(
      COMPACT_OUTPUT,
      buildCompactActionPortfolio(sources, {
        generatedAt: FIXED_PREFLIGHT_TIME,
      }),
    );
  }
  const artifact = readJson<CompactActionPortfolioArtifact>(COMPACT_OUTPUT);
  const replay = replayCompactActionPortfolio(artifact, sources);
  if (replay.status !== "passed") {
    throw new Error(
      `Compact preflight replay failed: ${replay.errors.join(" ")}`,
    );
  }
  return { artifact, replay };
}

async function rebuildFromComponents(options: {
  rebuildCube: boolean;
  rebuildJnw: boolean;
  rebuildCompact: boolean;
  verifyOnly: boolean;
  rebindAggregatePath?: string;
}): Promise<FiberingResearchPortfolioArtifact> {
  const cube = options.rebindAggregatePath
    ? loadCubeFromExistingAggregate(options.rebindAggregatePath)
    : await loadCube(options.rebuildCube, options.verifyOnly);
  const jnw = loadJnw(options.rebuildJnw, options.verifyOnly);
  const compact = loadCompact(options.rebuildCompact, options.verifyOnly);
  return buildFiberingResearchPortfolio({
    cube,
    cubeFile: fileBinding(RANK19_CUBE_RESCUE_DEFAULT_OUTPUT),
    compact: compact.artifact,
    compactFile: fileBinding(COMPACT_OUTPUT),
    compactReplay: compact.replay,
    jnw: jnw.certificate,
    jnwFile: fileBinding(JNW_OUTPUT),
    jnwReplay: jnw.replay,
  });
}

export async function runFiberingResearchPortfolio(
  argv: readonly string[] = process.argv.slice(2),
): Promise<FiberingResearchPortfolioArtifact> {
  const args = parseArguments(argv);
  const resolvedOutput = resolve(args.output);
  const componentPaths = [
    RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
    COMPACT_OUTPUT,
    JNW_OUTPUT,
  ].map((path) => resolve(path));
  if (componentPaths.includes(resolvedOutput)) {
    throw new Error(
      "The aggregate output must not overwrite one of its component artifacts.",
    );
  }
  if (
    (args.verifyOnly || args.rebindOnly) &&
    (args.rebuildCube || args.rebuildJnw || args.rebuildCompact)
  ) {
    throw new Error(
      "Verify-only and rebind-only modes cannot be combined with a rebuild option.",
    );
  }
  if (args.verifyOnly && args.rebindOnly) {
    throw new Error(
      "Verify-only and rebind-only modes are mutually exclusive.",
    );
  }
  if (args.verifyOnly) {
    // Check the whole immutable input set before starting the expensive cube
    // replay, so a missing later component cannot waste several minutes.
    requireExistingArtifact(args.output, "aggregate portfolio");
    requireExistingArtifact(
      RANK19_CUBE_RESCUE_DEFAULT_OUTPUT,
      "cube-rescue artifact",
    );
    requireExistingArtifact(JNW_OUTPUT, "JNW positive-control artifact");
    requireExistingArtifact(
      COMPACT_OUTPUT,
      "compact-action preflight artifact",
    );
  }
  const rebuilt = await rebuildFromComponents({
    rebuildCube: !args.verifyOnly && args.rebuildCube,
    rebuildJnw: !args.verifyOnly && args.rebuildJnw,
    rebuildCompact: !args.verifyOnly && args.rebuildCompact,
    verifyOnly: args.verifyOnly,
    ...(args.rebindOnly ? { rebindAggregatePath: args.output } : {}),
  });
  if (args.verifyOnly) {
    const stored = readJson<FiberingResearchPortfolioArtifact>(args.output);
    const replay = replayFiberingResearchPortfolio(stored, rebuilt);
    if (replay.status !== "passed") {
      throw new Error(
        `Aggregate portfolio replay failed: ${replay.errors.join(" ")}`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({ status: "verified", output: args.output, replayDigest: replay.replayDigest }, null, 2)}\n`,
    );
    return stored;
  }
  atomicJson(args.output, rebuilt);
  process.stdout.write(
    `${JSON.stringify({ status: args.rebindOnly ? "rebound" : "written", output: args.output, cubeDecision: rebuilt.cubeRescue.decision, compactTargets: rebuilt.compactActions.orderedTargetIds, jnwPositiveControl: rebuilt.jnwPositiveControl.virtualAlgebraicFibration }, null, 2)}\n`,
  );
  return rebuilt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runFiberingResearchPortfolio().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
