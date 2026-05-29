#!/usr/bin/env node
import { platform } from "node:os";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const input = valueAfter("--input");
const radius = valueAfter("--radius");
const output = valueAfter("--output");
const createdAt = valueAfter("--created-at");
const maxRadius = valueAfter("--max-radius");
const maxNodes = valueAfter("--max-nodes");
const maxEdges = valueAfter("--max-edges");

if (!input || !radius || !output) {
  console.error("--input, --radius, and --output are required.");
  process.exit(4);
}

const scriptArgs = [
  "scripts/sage_export_backend.py",
  "--input",
  input,
  "--radius",
  radius,
  "--output",
  output,
];

if (createdAt) {
  scriptArgs.push("--created-at", createdAt);
}

if (maxRadius) {
  scriptArgs.push("--max-radius", maxRadius);
}

if (maxNodes) {
  scriptArgs.push("--max-nodes", maxNodes);
}

if (maxEdges) {
  scriptArgs.push("--max-edges", maxEdges);
}

const code = [
  "import runpy, sys",
  `sys.argv=${JSON.stringify(scriptArgs)}`,
  "runpy.run_path('scripts/sage_export_backend.py', run_name='__main__')",
].join("; ");

const candidates =
  platform() === "win32"
    ? [
        { command: "sage", args: ["-c", code] },
        { command: "wsl", args: ["sage", "-c", code] },
      ]
    : [{ command: "sage", args: ["-c", code] }];

for (const candidate of candidates) {
  const result = spawnSync(candidate.command, candidate.args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error && result.error.code === "ENOENT") {
    continue;
  }

  process.exit(result.status ?? 1);
}

console.error(
  "Could not find Sage. Install SageMath or expose it through WSL.",
);
process.exit(2);
