#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_ADAPTERS = "scripts/external_tool_adapters.json";
const REQUIRED_TOOLS = [
  "SageMath",
  "GAP/KBMAG",
  "CoxIter",
  "polymake",
  "Regina",
];
const IMPLEMENTED_STATUSES = new Set(["implemented", "implemented-local-cli"]);
const CONTRACT_STATUSES = new Set(["contract-only"]);
const STATUSES = new Set([
  ...IMPLEMENTED_STATUSES,
  ...CONTRACT_STATUSES,
  "planned",
]);

function usage() {
  return [
    "Usage: node scripts/adapter_contract_validate.mjs [--root DIR] [adapters.json]",
    "",
    `When omitted, adapters.json defaults to ${DEFAULT_ADAPTERS}.`,
  ].join("\n");
}

function parseArgs(argv) {
  let root = process.cwd();
  let adaptersPath = DEFAULT_ADAPTERS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--root") {
      root = path.resolve(argv[index + 1] ?? "");
      if (!argv[index + 1]) {
        throw new Error("--root requires a directory");
      }
      index += 1;
      continue;
    }
    adaptersPath = arg;
  }

  return { root, adaptersPath };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value, label, errors) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string`);
  }
}

function scriptPath(script) {
  if (typeof script !== "string" || script.trim().length === 0) {
    return undefined;
  }
  return script.trim().split(/\s+/)[0];
}

function validateAdapter(adapter, index, root, seenIds, tools, errors) {
  const label = `adapters[${index}]`;
  if (!isRecord(adapter)) {
    errors.push(`${label} must be an object`);
    return undefined;
  }

  requireString(adapter.id, `${label}.id`, errors);
  requireString(adapter.tool, `${label}.tool`, errors);
  requireString(adapter.status, `${label}.status`, errors);
  requireString(adapter.input, `${label}.input`, errors);
  requireString(adapter.output, `${label}.output`, errors);

  if (typeof adapter.id === "string") {
    if (seenIds.has(adapter.id)) {
      errors.push(`${label}.id duplicates an earlier adapter: ${adapter.id}`);
    }
    seenIds.add(adapter.id);
  }

  if (typeof adapter.tool === "string") {
    tools.add(adapter.tool);
  }

  if (typeof adapter.status === "string" && !STATUSES.has(adapter.status)) {
    errors.push(`${label}.status is not supported: ${adapter.status}`);
  }

  const declaredScript = adapter.script;
  const pathPart = scriptPath(declaredScript);
  if (IMPLEMENTED_STATUSES.has(adapter.status)) {
    if (!pathPart) {
      errors.push(`${label}.script is required for implemented adapters`);
    } else if (!existsSync(path.resolve(root, pathPart))) {
      errors.push(`${label}.script does not exist: ${pathPart}`);
    }
  }

  if (CONTRACT_STATUSES.has(adapter.status) && declaredScript !== null) {
    errors.push(`${label}.script must be null for contract-only adapters`);
  }

  return {
    id: typeof adapter.id === "string" ? adapter.id : null,
    tool: typeof adapter.tool === "string" ? adapter.tool : null,
    status: typeof adapter.status === "string" ? adapter.status : "invalid",
    script: declaredScript ?? null,
    scriptExists: pathPart ? existsSync(path.resolve(root, pathPart)) : null,
  };
}

function validateAdapters(root, adaptersPath) {
  const resolved = path.resolve(root, adaptersPath);
  const input = readJson(resolved);
  const errors = [];
  const seenIds = new Set();
  const tools = new Set();

  if (input.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }

  const adapters = Array.isArray(input.adapters) ? input.adapters : [];
  if (adapters.length === 0) {
    errors.push("adapters must be a non-empty array");
  }

  const adapterReports = adapters.map((adapter, index) =>
    validateAdapter(adapter, index, root, seenIds, tools, errors),
  );

  for (const tool of REQUIRED_TOOLS) {
    if (!tools.has(tool)) {
      errors.push(`required adapter tool is missing: ${tool}`);
    }
  }

  return {
    ok: errors.length === 0,
    schemaVersion: 1,
    validator: "coxeter-viewer-adapter-contract-v1",
    adaptersPath,
    adapterCount: adapters.length,
    requiredTools: REQUIRED_TOOLS,
    tools: [...tools].sort((left, right) => left.localeCompare(right)),
    adapters: adapterReports,
    errors,
  };
}

try {
  const { root, adaptersPath } = parseArgs(process.argv.slice(2));
  const report = validateAdapters(root, adaptersPath);
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
        validator: "coxeter-viewer-adapter-contract-v1",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
