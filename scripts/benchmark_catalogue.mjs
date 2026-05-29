#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(argv) {
  const args = { write: undefined, check: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write" || arg === "--check") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      args[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown benchmark argument: ${arg}`);
  }
  return args;
}

function matrixStats(example) {
  let finitePairs = 0;
  let infinitePairs = 0;

  for (let i = 0; i < example.rank; i += 1) {
    for (let j = i + 1; j < example.rank; j += 1) {
      if (example.coxeterMatrix[i][j] === "inf") {
        infinitePairs += 1;
      } else {
        finitePairs += 1;
      }
    }
  }

  return { finitePairs, infinitePairs };
}

function generatedStats(ball) {
  return {
    systemName: ball.systemName,
    radius: ball.metadata.radius,
    deduplication: ball.metadata.deduplication,
    certification: ball.metadata.certification?.status ?? "not-recorded",
    nodes: ball.nodes.length,
    edges: ball.edges.length,
    twoCells: ball.twoCells.length,
    higherCells: ball.higherCells?.length ?? 0,
  };
}

function collectBenchmark() {
  const examples = readdirSync("public/examples")
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const example = readJson(join("public/examples", name));
      return {
        file: name,
        name: example.name,
        dataStatus: example.dataStatus ?? "unspecified",
        rank: example.rank,
        ...matrixStats(example),
      };
    });

  const generated = readdirSync("tests/fixtures/generated")
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      file: name,
      ...generatedStats(readJson(join("tests/fixtures/generated", name))),
    }));

  return {
    ok: true,
    benchmark: "catalogue-static-v1",
    schemaVersion: 1,
    examples,
    generated,
    totals: {
      examples: examples.length,
      generated: generated.length,
      generatedNodes: generated.reduce((sum, item) => sum + item.nodes, 0),
      generatedEdges: generated.reduce((sum, item) => sum + item.edges, 0),
      generatedTwoCells: generated.reduce(
        (sum, item) => sum + item.twoCells,
        0,
      ),
    },
  };
}

function writeDeterministicOutput(path, result) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableJson(result), "utf8");
}

function checkDeterministicOutput(path, result) {
  if (!existsSync(path)) {
    return {
      ok: false,
      message: `benchmark output does not exist: ${path}`,
    };
  }

  const expected = readFileSync(path, "utf8");
  const actual = stableJson(result);
  return {
    ok: expected === actual,
    message:
      expected === actual
        ? "stored deterministic benchmark output is current"
        : "stored deterministic benchmark output is stale",
  };
}

const startedAt = performance.now();
const args = parseArgs(process.argv.slice(2));
const result = collectBenchmark();
const elapsedMs = Number((performance.now() - startedAt).toFixed(3));

if (args.write) {
  writeDeterministicOutput(args.write, result);
}

const check = args.check
  ? checkDeterministicOutput(args.check, result)
  : undefined;
const timedResult = {
  ...result,
  elapsedMs,
  ...(args.write ? { wrote: args.write } : {}),
  ...(check ? { check } : {}),
};

console.log(stableJson(timedResult));

if (check && !check.ok) {
  process.exitCode = 1;
}
