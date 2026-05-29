#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const deterministicCheckedAt = "1970-01-01T00:00:00.000Z";

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  return result.error === undefined && result.status === 0;
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function listFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        const stats = statSync(absolute);
        files.push({
          path: relative(process.cwd(), absolute).replaceAll("\\", "/"),
          size: stats.size,
          sha256: sha256File(absolute),
        });
      }
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function skipped(reason, detail) {
  return {
    ok: true,
    status: "skipped",
    reason,
    detail,
    checkedAt: deterministicCheckedAt,
    releaseKind: "web-static",
    artifactDir: "dist",
    files: [],
  };
}

const args = new Set(process.argv.slice(2));
const skipBuild = args.has("--skip-build") || args.has("--check");
const distDir = resolve(process.cwd(), "dist");

let build = {
  requested: !skipBuild,
  command: "corepack pnpm build",
  status: skipBuild ? "skipped" : "pending",
};

if (!skipBuild) {
  if (!commandExists("corepack")) {
    const report = skipped(
      "missing-corepack",
      "corepack was not found, so the deterministic web build was not run.",
    );
    process.stdout.write(`${JSON.stringify({ ...report, build }, null, 2)}\n`);
    process.exit(0);
  }

  const result = run("corepack", ["pnpm", "build"]);
  if (result.status !== 0) {
    const report = {
      ok: false,
      status: "failed",
      checkedAt: deterministicCheckedAt,
      releaseKind: "web-static",
      artifactDir: "dist",
      build: {
        ...build,
        status: "failed",
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      files: [],
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(1);
  }
  build = {
    ...build,
    status: "passed",
  };
}

if (!existsSync(join(distDir, "index.html"))) {
  const report = skipped(
    "missing-dist",
    skipBuild
      ? "dist/index.html is missing and --skip-build or --check was used."
      : "dist/index.html is missing after the web build.",
  );
  process.stdout.write(`${JSON.stringify({ ...report, build }, null, 2)}\n`);
  process.exit(skipBuild ? 0 : 1);
}

const report = {
  ok: true,
  status: "passed",
  checkedAt: deterministicCheckedAt,
  releaseKind: "web-static",
  artifactDir: "dist",
  build,
  files: listFiles(distDir),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
