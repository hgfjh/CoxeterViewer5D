#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

const GENERATED_FIXTURES = [
  {
    id: "exact-sage-i2-5",
    backend: "sage",
    input: "public/examples/I2_5.json",
    radius: 5,
    output: "tests/fixtures/generated/I2_5_sage_radius_5.json",
  },
  {
    id: "exact-sage-a2",
    backend: "sage",
    input: "public/examples/A2.json",
    radius: 3,
    output: "tests/fixtures/generated/A2_sage_radius_3.json",
  },
  {
    id: "exact-sage-a3",
    backend: "sage",
    input: "public/examples/A3.json",
    radius: 6,
    output: "tests/fixtures/generated/A3_sage_radius_6.json",
  },
  {
    id: "exact-gap-i2-5",
    backend: "gap",
    input: "public/examples/I2_5.json",
    radius: 5,
    output: "tests/fixtures/generated/I2_5_gap_radius_5.json",
  },
  {
    id: "exact-gap-a2",
    backend: "gap",
    input: "public/examples/A2.json",
    radius: 3,
    output: "tests/fixtures/generated/A2_gap_radius_3.json",
  },
  {
    id: "exact-gap-a3",
    backend: "gap",
    input: "public/examples/A3.json",
    radius: 6,
    output: "tests/fixtures/generated/A3_gap_radius_6.json",
  },
];

function usage() {
  return [
    "Usage: node scripts/regenerate_all.mjs [--execute]",
    "",
    "Default mode is a deterministic dry-run report.",
    "Execution also requires COXETER_REGENERATE_ALLOW_WRITE=1.",
  ].join("\n");
}

function parseArgs(argv) {
  let execute = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return { execute };
}

function commandFor(fixture) {
  const runner =
    fixture.backend === "sage"
      ? "scripts/run_sage_export.mjs"
      : "scripts/run_gap_export.mjs";
  return [
    "node",
    [
      runner,
      "--input",
      fixture.input,
      "--radius",
      String(fixture.radius),
      "--created-at",
      CREATED_AT,
      "--output",
      fixture.output,
    ],
  ];
}

function plan() {
  return GENERATED_FIXTURES.map((fixture) => {
    const [command, args] = commandFor(fixture);
    return {
      id: fixture.id,
      kind: "generated-cayley-ball",
      backend: fixture.backend,
      input: fixture.input,
      radius: fixture.radius,
      writes: [fixture.output],
      command: [command, ...args],
    };
  });
}

function runStep(step) {
  const [command, ...args] = step.command;
  const executable = command === "node" ? process.execPath : command;
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    id: step.id,
    status: result.status,
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

try {
  const { execute } = parseArgs(process.argv.slice(2));
  const allowWrite = process.env.COXETER_REGENERATE_ALLOW_WRITE === "1";
  const steps = plan();
  const willExecute = execute && allowWrite;
  const results = willExecute ? steps.map(runStep) : [];
  const blocked = execute && !allowWrite;
  const ok = blocked ? false : results.every((result) => result.ok);

  const report = {
    ok,
    schemaVersion: 1,
    command: "regenerate-all",
    mode: willExecute ? "execute" : "dry-run",
    checkedAt: "1970-01-01T00:00:00.000Z",
    createdAtForGeneratedArtifacts: CREATED_AT,
    plannedWrites: steps.flatMap((step) => step.writes),
    plan: steps,
    results,
    warnings: [
      "Default mode is a dry run and does not rewrite generated fixtures.",
      "Use --execute with COXETER_REGENERATE_ALLOW_WRITE=1 only when intentionally refreshing fixtures.",
      ...(blocked
        ? [
            "--execute was requested but COXETER_REGENERATE_ALLOW_WRITE was not 1.",
          ]
        : []),
    ],
  };

  console.log(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.log(
    `${JSON.stringify(
      {
        ok: false,
        schemaVersion: 1,
        command: "regenerate-all",
        mode: "dry-run",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
