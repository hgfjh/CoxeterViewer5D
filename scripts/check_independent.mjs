#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(command, args) {
  const startedAt = performance.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  return {
    command: [command, ...args],
    status: result.status,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    ok: result.status === 0,
  };
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const checks = [
  run("python", [
    "scripts/certify_compact_5_cube.py",
    "public/examples/compact_5_cube_gamma1.json",
  ]),
  run("python", [
    "scripts/certify_compact_5_prism.py",
    "public/examples/compact_5_prism_makarov.json",
  ]),
  run("python", [
    "scripts/certify_geometry_intervals.py",
    "public/examples/compact_5_cube_gamma1.json",
  ]),
  run("python", [
    "scripts/certify_geometry_intervals.py",
    "public/examples/compact_5_prism_makarov.json",
  ]),
  run("python", [
    "scripts/coxiter_check_compact.py",
    "public/examples/compact_5_cube_gamma1.json",
    "--require-external",
  ]),
  run("python", [
    "scripts/coxiter_check_compact.py",
    "public/examples/compact_5_prism_makarov.json",
    "--require-external",
  ]),
];

const coxiterAvailability =
  process.platform === "win32"
    ? run("powershell.exe", [
        "-NoProfile",
        "-Command",
        'wsl -d Ubuntu-24.04 -- bash -lc "which coxiter"',
      ])
    : run("bash", ["-lc", "which coxiter"]);

const result = {
  ok: checks.every((check) => check.ok),
  checker: "independent-research-grade-gate",
  schemaVersion: 1,
  checks: checks.map((check) => ({
    command: check.command,
    status: check.status,
    elapsedMs: check.elapsedMs,
    ok: check.ok,
    report: tryJson(check.stdout),
    stderr: check.stderr,
  })),
  optionalTools: {
    coxiter: {
      available: coxiterAvailability.ok,
      path: coxiterAvailability.ok ? coxiterAvailability.stdout : undefined,
      status: coxiterAvailability.status,
      stderr: coxiterAvailability.stderr,
    },
  },
};

console.log(`${JSON.stringify(result, null, 2)}\n`);

if (!result.ok) {
  process.exitCode = 1;
}
