#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function parseResult(result, label) {
  if (result.status !== 0) {
    return {
      ok: false,
      label,
      errors: [result.stderr || result.stdout || `${label} failed`],
    };
  }
  return JSON.parse(result.stdout);
}

const temp = mkdtempSync(join(tmpdir(), "coxeter-workflow-"));
const quotientPath = join(temp, "i2-5-identity-quotient.json");
const exportResult = parseResult(
  runNode([
    "scripts/run_quotient_export.mjs",
    "--backend",
    "sage",
    "--input",
    "tests/fixtures/quotients/I2_5_identity_subgroup_build_request.json",
  ]),
  "i2-5 quotient export",
);

const checks = [];
if (exportResult.schemaVersion === 1) {
  writeFileSync(quotientPath, JSON.stringify(exportResult), "utf8");
  checks.push({
    id: "export-i2-5-demo",
    status: "passed",
    vertices: exportResult.vertices.length,
    edges: exportResult.edges.length,
    cells: exportResult.twoCells.length,
    activeCocycleId: exportResult.game?.activeCocycleId,
  });

  checks.push({
    id: "certify-quotient",
    ...parseResult(
      runNode(["scripts/certify_quotient.mjs", quotientPath]),
      "certify quotient",
    ),
  });
  checks.push({
    id: "certify-morse",
    ...parseResult(
      runNode(["scripts/certify_morse.mjs", quotientPath]),
      "certify morse",
    ),
  });
} else {
  checks.push({
    id: "export-i2-5-demo",
    status: "failed",
    errors: exportResult.errors ?? ["quotient export did not emit a complex"],
  });
}

const parity = parseResult(
  runNode(["scripts/compare_quotient_backends.mjs"]),
  "compare quotient backends",
);
checks.push({
  id: "compare-quotient-backends",
  status: parity.ok ? "passed" : "failed",
  reports: parity.reports,
  errors: parity.reports?.flatMap((report) => report.errors ?? []) ?? [],
});

const ok = checks.every((check) => {
  if ("ok" in check) {
    return check.ok !== false;
  }
  return check.status === "passed";
});

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      checkedAt: "1970-01-01T00:00:00.000Z",
      workflow: "quotient-game-i2-5",
      checks,
    },
    null,
    2,
  )}\n`,
);
process.exit(ok ? 0 : 1);
