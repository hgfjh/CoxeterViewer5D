#!/usr/bin/env tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  buildJnwCubePositiveControlCertificate,
  replayJnwCubePositiveControlCertificate,
  type JnwCubePositiveControlCertificate,
} from "../src/fibering/jnwCubePositiveControl";

const SOURCE_PATH = resolve("public/examples/jnw_cube_graph.json");
const DEFAULT_ARTIFACT_PATH = resolve(
  "scripts/certificates/torsion-free/jnw_cube_graph_degree4_positive_control.json",
);

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function parseArguments(argv: readonly string[]): {
  mode: "build" | "verify";
  artifactPath: string;
} {
  if (argv[0] === "--verify") {
    return {
      mode: "verify",
      artifactPath: resolve(argv[1] ?? DEFAULT_ARTIFACT_PATH),
    };
  }
  if (argv[0] === "--output") {
    if (!argv[1]) throw new Error("--output requires an artifact path.");
    return { mode: "build", artifactPath: resolve(argv[1]) };
  }
  if (argv.length > 0) {
    throw new Error(
      `Unknown argument ${argv[0]}. Use --output PATH or --verify [PATH].`,
    );
  }
  return { mode: "build", artifactPath: DEFAULT_ARTIFACT_PATH };
}

function conciseResult(certificate: JnwCubePositiveControlCertificate) {
  return {
    status: certificate.status,
    artifactPath: undefined as string | undefined,
    artifactDigest: certificate.artifactDigest,
    subgroupIndex: certificate.theorem.result.subgroupIndex,
    h1: certificate.theorem.result.h1IsomorphicTo,
    rawPeriodImageGcd: certificate.primitiveCocycle.rawPeriodImageGcd,
    primitiveCoordinates: certificate.primitiveCocycle.primitiveH1Coordinates,
    directedLinkCount: certificate.npcAndDirectedLinks.vertexLinks.length * 2,
    virtualAlgebraicFibration:
      certificate.theorem.result.virtualAlgebraicFibration,
  };
}

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const source = loadJson(SOURCE_PATH);
  if (options.mode === "verify") {
    const stored = loadJson(options.artifactPath);
    const replay = replayJnwCubePositiveControlCertificate(stored, source);
    process.stdout.write(`${JSON.stringify(replay, null, 2)}\n`);
    if (!replay.valid) process.exitCode = 1;
    return;
  }

  const certificate = buildJnwCubePositiveControlCertificate(source);
  const replay = replayJnwCubePositiveControlCertificate(certificate, source);
  if (!replay.valid) {
    throw new Error(`Self-replay failed: ${replay.errors.join(" ")}`);
  }
  mkdirSync(dirname(options.artifactPath), { recursive: true });
  writeFileSync(
    options.artifactPath,
    `${JSON.stringify(certificate, null, 2)}\n`,
    "utf8",
  );
  const result = conciseResult(certificate);
  result.artifactPath = options.artifactPath;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
