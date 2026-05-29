#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { platform } from "node:os";

const args = process.argv.slice(2);

function hasFlag(flag) {
  return args.includes(flag);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function toWslPath(path) {
  const match = /^([A-Za-z]):\\(.*)$/.exec(path);
  if (!match) {
    return path.replaceAll("\\", "/");
  }
  const drive = match[1].toLowerCase();
  const rest = match[2].replaceAll("\\", "/");
  return `/mnt/${drive}/${rest}`;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function decodeOutput(value) {
  if (!value) {
    return "";
  }
  const utf8 = value.toString("utf8");
  return utf8.includes("\u0000") ? value.toString("utf16le") : utf8;
}

function withDefaultGapExecutable(baseArgs, executable) {
  if (baseArgs.includes("--gap-executable")) {
    return baseArgs;
  }
  return [...baseArgs, "--gap-executable", executable];
}

const input = valueAfter("--input");
const radius = valueAfter("--radius");
const output = valueAfter("--output");

if ((!input || !radius || !output) && !hasFlag("--check-runtime")) {
  console.error("--input, --radius, and --output are required.");
  process.exit(4);
}

const pythonArgs = ["scripts/gap_kbmag_export_backend.py", ...args];

const candidates =
  platform() === "win32"
    ? [
        {
          command: "python",
          args: pythonArgs,
        },
        {
          command: "wsl",
          args: [
            "-d",
            "Ubuntu-24.04",
            "--",
            "bash",
            "-lc",
            [
              "cd",
              shellQuote(toWslPath(process.cwd())),
              "&&",
              "python3",
              ...withDefaultGapExecutable(
                pythonArgs,
                "/opt/miniforge3/envs/sage/bin/gap",
              ).map(shellQuote),
            ].join(" "),
          ],
        },
      ]
    : [
        {
          command: "python3",
          args: pythonArgs,
        },
      ];

for (const candidate of candidates) {
  const result = spawnSync(candidate.command, candidate.args, {
    shell: false,
  });
  const stdout = decodeOutput(result.stdout);
  const stderr = decodeOutput(result.stderr);

  if (result.error && result.error.code === "ENOENT") {
    continue;
  }

  const failedBecauseGapMissing =
    stdout.includes('"code": "missing-runtime"') ||
    stdout.includes('"code":"missing-runtime"') ||
    stdout.includes('"code": "missing-kbmag"') ||
    stdout.includes('"code":"missing-kbmag"');

  if (platform() === "win32" && failedBecauseGapMissing) {
    continue;
  }

  if (result.status === 0) {
    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }
    process.exit(0);
  }

  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }

  process.exit(result.status ?? 1);
}

console.error(
  "Could not find GAP with KBMAG. Install GAP+KBMAG locally or expose it through WSL.",
);
process.exit(2);
