#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const deterministicCheckedAt = "1970-01-01T00:00:00.000Z";

// Release reports are designed for CI logs and release notes. They distinguish
// "not configured" from "failed" so unsigned local builds stay useful while
// public releases can still require signing/updater evidence.

function commandExists(command, args = ["--version"]) {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].join(" "), {
          cwd: process.cwd(),
          encoding: "utf8",
          shell: true,
          windowsHide: true,
        })
      : spawnSync(command, args, {
          cwd: process.cwd(),
          encoding: "utf8",
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

function envPresence(names) {
  return Object.fromEntries(
    names.map((name) => [name, Boolean(process.env[name])]),
  );
}

function desktopCodeSigningStatus() {
  const platformEnv = {
    darwin: [
      "APPLE_CERTIFICATE",
      "APPLE_CERTIFICATE_PASSWORD",
      "APPLE_SIGNING_IDENTITY",
      "APPLE_ID",
      "APPLE_PASSWORD",
      "APPLE_TEAM_ID",
    ],
    win32: ["WINDOWS_CERTIFICATE", "WINDOWS_CERTIFICATE_PASSWORD"],
    linux: [],
  };
  const env = platformEnv[process.platform] ?? [];
  if (env.length === 0) {
    return {
      status: "skipped",
      reason: "not-required-for-local-linux-bundles",
      env: {},
      note: "No desktop code-signing environment is required for local Linux bundle checks.",
    };
  }
  const present = envPresence(env);
  const missing = env.filter((name) => !present[name]);
  return {
    status: missing.length === 0 ? "configured" : "skipped",
    reason: missing.length === 0 ? "env-present" : "missing-env",
    requiredEnv: env,
    missingEnv: missing,
    env: present,
    note:
      missing.length === 0
        ? "Platform signing environment variables are present; the Tauri bundler may still apply platform-specific signing rules."
        : "Unsigned local desktop builds are allowed. Release signing is skipped until these environment variables are supplied.",
  };
}

function updaterStatus() {
  const requiredEnv = ["TAURI_SIGNING_PRIVATE_KEY"];
  const optionalEnv = ["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"];
  const present = envPresence([...requiredEnv, ...optionalEnv]);
  const missing = requiredEnv.filter((name) => !present[name]);
  return {
    status: missing.length === 0 ? "configured" : "skipped",
    reason: missing.length === 0 ? "env-present" : "missing-env",
    requiredEnv,
    optionalEnv,
    missingEnv: missing,
    env: present,
    note:
      missing.length === 0
        ? "Updater signing key is present. Publish endpoint configuration is still a separate release concern."
        : "Updater signing is skipped. This does not fail unsigned local desktop builds.",
  };
}

function releaseOperations() {
  return {
    codeSigning: desktopCodeSigningStatus(),
    updater: updaterStatus(),
  };
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
    releaseOperations: releaseOperations(),
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
    releaseOperations: releaseOperations(),
    files: [],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

const result =
  process.platform === "win32"
    ? spawnSync("corepack pnpm exec tauri build", {
        cwd: process.cwd(),
        encoding: "utf8",
        shell: true,
        windowsHide: true,
      })
    : spawnSync("corepack", ["pnpm", "exec", "tauri", "build"], {
        cwd: process.cwd(),
        encoding: "utf8",
        windowsHide: true,
      });

if (result.status !== 0) {
  const report = {
    ok: false,
    status: "failed",
    checkedAt: deterministicCheckedAt,
    releaseKind: "tauri-v2-desktop",
    readiness,
    releaseOperations: releaseOperations(),
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
  releaseOperations: releaseOperations(),
  build: {
    command: "corepack pnpm exec tauri build",
    status: "passed",
  },
  files: listBundleFiles(bundleDir),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
