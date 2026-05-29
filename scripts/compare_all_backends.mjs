#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const CHECKS = [
  {
    id: "adapter-contracts",
    command: ["node", "scripts/adapter_contract_validate.mjs"],
  },
  {
    id: "exact-generated-fixtures",
    command: ["node", "scripts/compare_backends.mjs"],
  },
  {
    id: "quotient-game-fixtures",
    command: ["node", "scripts/compare_quotient_backends.mjs"],
    env: {
      COXETER_QUOTIENT_EXTERNAL_MODE: "in-repo",
    },
  },
];

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

function runCheck(check) {
  const [command, ...args] = check.command;
  const executable = command === "node" ? process.execPath : command;
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      ...(check.env ?? {}),
    },
  });
  const report = parseJson(result.stdout);
  const ok = result.status === 0 && (report?.ok ?? true) === true;
  return {
    id: check.id,
    ok,
    status: result.status,
    command: check.command,
    reportName: report?.reportName ?? report?.validator ?? null,
    report,
    stderr: result.stderr?.trim() ?? "",
  };
}

const checks = CHECKS.map(runCheck);
const result = {
  ok: checks.every((check) => check.ok),
  schemaVersion: 1,
  reportName: "coxeter-viewer-all-backend-reproducibility",
  checkedAt: "1970-01-01T00:00:00.000Z",
  checks,
  limitations: [
    "The quotient comparison is forced to the deterministic in-repo exporter path.",
    "External runtime availability is covered by adapter contracts and separate runtime check commands.",
  ],
};

console.log(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) {
  process.exitCode = 1;
}
