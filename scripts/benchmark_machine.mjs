#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

const DEFAULT_TIMED_BASELINE = "scripts/benchmarks/timed-browser-v1.json";
const DEFAULT_OUTPUT = "scripts/benchmarks/machine-baselines-v1.json";
const checkedAt = "1970-01-01T00:00:00.000Z";

const machineClasses = {
  "ci-linux-standard": {
    hardGate: true,
    description: "GitHub-hosted Linux runner or equivalent shared CI machine.",
    elapsedScale: 1.75,
    graphUpdateScale: 2,
  },
  "local-dev-laptop": {
    hardGate: false,
    description:
      "A normal developer laptop; recorded locally and not used as a release blocker.",
    elapsedScale: 1,
    graphUpdateScale: 1,
  },
  "research-workstation": {
    hardGate: false,
    description:
      "A faster local machine used for large-radius experiments and artifact generation.",
    elapsedScale: 0.7,
    graphUpdateScale: 0.8,
  },
};

function parseArgs(argv) {
  const args = {
    baseline: DEFAULT_TIMED_BASELINE,
    write: undefined,
    check: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--baseline") {
      args.baseline = argv[index + 1] ?? args.baseline;
      index += 1;
      continue;
    }
    if (arg === "--write" || arg === "--check") {
      args[arg.slice(2)] = argv[index + 1] ?? DEFAULT_OUTPUT;
      index += 1;
      continue;
    }
    throw new Error(`unknown machine benchmark argument: ${arg}`);
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertCloseEnough(actual, expected, path) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `${path} is stale. Run pnpm bench:timed:machine -- --write ${path}`,
    );
  }
}

function summarizeTimedBaseline(report) {
  const cases = Array.isArray(report.cases) ? report.cases : [];
  const interactions = Array.isArray(report.interactions)
    ? report.interactions
    : [];
  return {
    sourceReport: report.reportKind ?? "timed-browser-benchmark",
    sourceCreatedAt: report.createdAt ?? checkedAt,
    cases: cases.map((entry) => ({
      id: entry.id ?? `${entry.exampleId}:${entry.radius}`,
      elapsedMs: Number(entry.elapsedMs ?? 0),
      lastGraphUpdateMs: Number(entry.lastGraphUpdateMs ?? 0),
      renderedNodes: Number(entry.renderedNodes ?? 0),
      renderedCells: Number(entry.renderedCells ?? 0),
      drawCalls: Number(entry.drawCalls ?? 0),
    })),
    interactions: interactions.map((entry) => ({
      id: entry.id,
      elapsedMs: Number(entry.elapsedMs ?? 0),
      lastGraphUpdateMs: Number(entry.lastGraphUpdateMs ?? 0),
      renderCountDelta: Number(entry.renderCountDelta ?? 0),
      drawCalls: Number(entry.drawCalls ?? 0),
    })),
  };
}

function scaledBudgets(summary, scale) {
  const round = (value) => Math.max(1, Math.round(value));
  return {
    cases: summary.cases.map((entry) => ({
      id: entry.id,
      maxElapsedMs: round(entry.elapsedMs * scale.elapsedScale),
      maxGraphUpdateMs: round(
        Math.max(entry.lastGraphUpdateMs, 1) * scale.graphUpdateScale,
      ),
    })),
    interactions: summary.interactions.map((entry) => ({
      id: entry.id,
      maxElapsedMs: round(entry.elapsedMs * scale.elapsedScale),
      maxGraphUpdateMs: round(
        Math.max(entry.lastGraphUpdateMs, 1) * scale.graphUpdateScale,
      ),
    })),
  };
}

function buildMachineBaseline(timedReport) {
  const summary = summarizeTimedBaseline(timedReport);
  return {
    schemaVersion: 1,
    reportKind: "coxeter-machine-performance-baselines",
    checkedAt,
    timedBaselinePath: DEFAULT_TIMED_BASELINE,
    summary,
    machineClasses: Object.fromEntries(
      Object.entries(machineClasses).map(([id, machine]) => [
        id,
        {
          hardGate: machine.hardGate,
          description: machine.description,
          budgets: scaledBudgets(summary, machine),
        },
      ]),
    ),
    notes: [
      "ci-linux-standard is the only hard gate.",
      "Local classes are stored so larger topology and quotient experiments can be compared without changing CI thresholds.",
    ],
  };
}

const args = parseArgs(process.argv.slice(2));

if (!existsSync(args.baseline)) {
  throw new Error(
    `${args.baseline} is missing. Run pnpm bench:timed:write before computing machine baselines.`,
  );
}

const report = buildMachineBaseline(readJson(args.baseline));

if (args.write) {
  mkdirSync(dirname(args.write), { recursive: true });
  writeFileSync(args.write, stableJson(report));
  process.stdout.write(
    stableJson({ ok: true, status: "written", path: args.write }),
  );
  process.exit(0);
}

if (args.check) {
  if (!existsSync(args.check)) {
    throw new Error(`${args.check} is missing.`);
  }
  assertCloseEnough(readJson(args.check), report, args.check);
  process.stdout.write(
    stableJson({ ok: true, status: "passed", path: args.check }),
  );
  process.exit(0);
}

process.stdout.write(stableJson(report));
