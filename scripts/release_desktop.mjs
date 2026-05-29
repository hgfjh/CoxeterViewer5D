#!/usr/bin/env node
import { spawnSync } from "node:child_process";
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

function readPackageJson() {
  try {
    return JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    );
  } catch {
    return {};
  }
}

function hasTauriCliDependency(packageJson) {
  return Boolean(
    packageJson.dependencies?.["@tauri-apps/cli"] ??
    packageJson.devDependencies?.["@tauri-apps/cli"],
  );
}

function listBundleFiles(root) {
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
        });
      }
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function reportSkipped(reason, detail, readiness) {
  const report = {
    ok: true,
    status: "skipped",
    reason,
    detail,
    checkedAt: deterministicCheckedAt,
    releaseKind: "tauri-v2-desktop",
    readiness,
    files: [],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check") || args.has("--skip-build");
const srcTauri = resolve(process.cwd(), "src-tauri");
const readiness = {
  config: existsSync(join(srcTauri, "tauri.conf.json")),
  contract: existsSync(join(srcTauri, "desktop-contract.json")),
  cargoToml: existsSync(join(srcTauri, "Cargo.toml")),
  cargo: commandExists("cargo"),
  corepack: commandExists("corepack"),
  tauriCliDependency: hasTauriCliDependency(readPackageJson()),
};

if (!readiness.config) {
  reportSkipped(
    "missing-tauri-config",
    "src-tauri/tauri.conf.json is missing.",
    readiness,
  );
}

if (!readiness.cargoToml) {
  reportSkipped(
    "missing-tauri-rust-project",
    "The Tauri v2 contract exists, but no src-tauri/Cargo.toml has been added.",
    readiness,
  );
}

if (!readiness.tauriCliDependency) {
  reportSkipped(
    "missing-tauri-cli-dependency",
    "@tauri-apps/cli is not installed; desktop release is intentionally optional.",
    readiness,
  );
}

if (!readiness.cargo) {
  reportSkipped(
    "missing-cargo",
    "Rust Cargo is not available on PATH.",
    readiness,
  );
}

if (!readiness.corepack) {
  reportSkipped(
    "missing-corepack",
    "corepack is not available on PATH.",
    readiness,
  );
}

if (checkOnly) {
  const report = {
    ok: true,
    status: "ready",
    checkedAt: deterministicCheckedAt,
    releaseKind: "tauri-v2-desktop",
    readiness,
    files: [],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

const result = spawnSync("corepack", ["pnpm", "exec", "tauri", "build"], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: process.platform === "win32",
  windowsHide: true,
});

if (result.status !== 0) {
  const report = {
    ok: false,
    status: "failed",
    checkedAt: deterministicCheckedAt,
    releaseKind: "tauri-v2-desktop",
    readiness,
    build: {
      command: "corepack pnpm exec tauri build",
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    },
    files: [],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(1);
}

const bundleDir = resolve(srcTauri, "target", "release", "bundle");
const report = {
  ok: true,
  status: "passed",
  checkedAt: deterministicCheckedAt,
  releaseKind: "tauri-v2-desktop",
  readiness,
  build: {
    command: "corepack pnpm exec tauri build",
    status: "passed",
  },
  files: listBundleFiles(bundleDir),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
