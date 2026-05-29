#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const COMMANDS = [
  ["node", ["scripts/verify_catalogue.mjs"]],
  [
    "python",
    [
      "scripts/certify_compact_5_cube.py",
      "public/examples/compact_5_cube_gamma1.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_compact_5_prism.py",
      "public/examples/compact_5_prism_makarov.json",
    ],
  ],
  [
    "python",
    [
      "scripts/gap_kbmag_export_backend.py",
      "--certify-output",
      "tests/fixtures/generated/I2_5_gap_radius_5.json",
      "tests/fixtures/generated/A2_gap_radius_3.json",
      "tests/fixtures/generated/A3_gap_radius_6.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_geometry_intervals.py",
      "public/examples/compact_5_cube_gamma1.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_geometry_intervals.py",
      "public/examples/compact_5_prism_makarov.json",
    ],
  ],
  ["node", ["scripts/check_independent.mjs"]],
  ["node", ["scripts/compare_backends.mjs"]],
  ["node", ["scripts/compare_quotient_backends.mjs"]],
  ["node", ["scripts/validate_workflow.mjs"]],
  [
    "node",
    [
      "scripts/certify_quotient.mjs",
      "tests/fixtures/quotients/I2_5_one_vertex_quotient.json",
    ],
  ],
  [
    "node",
    [
      "scripts/certify_morse.mjs",
      "tests/fixtures/quotients/I2_5_one_vertex_quotient.json",
    ],
  ],
  [
    "node",
    [
      "scripts/certify_local_links.mjs",
      "tests/fixtures/quotients/I2_5_one_vertex_quotient.json",
    ],
  ],
  [
    "node",
    [
      "scripts/certify_davis_incidence.mjs",
      "tests/fixtures/generated/A3_sage_radius_6.json",
    ],
  ],
  [
    "node",
    [
      "scripts/benchmark_catalogue.mjs",
      "--check",
      "scripts/benchmarks/catalogue-static-v1.json",
    ],
  ],
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  return {
    command: [command, ...args],
    status: result.status,
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

const checks = COMMANDS.map(([command, args]) => run(command, args));
const result = {
  ok: checks.every((check) => check.ok),
  validator: "research-grade-hard-gate",
  schemaVersion: 1,
  checks,
};

console.log(`${JSON.stringify(result, null, 2)}\n`);

if (!result.ok) {
  process.exitCode = 1;
}
