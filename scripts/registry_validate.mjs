#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_MANIFEST =
  "scripts/certificates/external-artifact-manifest.example.json";
const MANIFEST_KIND = "coxeter-viewer-external-artifact-manifest";

// The registry records provenance for generated artifacts. It checks hashes,
// commands, tool names, and declared claim boundaries; the mathematical content
// is checked by the artifact-specific certifier named in each record.
const KNOWN_TOOLS = new Set([
  "sage",
  "gap-kbmag",
  "coxiter",
  "polymake",
  "regina",
  "published-transcription",
]);
const STATUSES = new Set([
  "passed",
  "failed",
  "skipped",
  "draft",
  "superseded",
]);

function usage() {
  return [
    "Usage: node scripts/registry_validate.mjs [--root DIR] [manifest.json]...",
    "",
    `When no manifest is given, validates ${DEFAULT_MANIFEST}.`,
  ].join("\n");
}

function parseArgs(argv) {
  const manifests = [];
  let root = process.cwd();

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
    manifests.push(arg);
  }

  return {
    root,
    manifests: manifests.length > 0 ? manifests : [DEFAULT_MANIFEST],
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath}: could not parse JSON: ${error.message}`);
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value, label, errors) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string`);
  }
}

function requireStringArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      errors.push(`${label}[${index}] must be a non-empty string`);
    }
  });
}

function resolveWithinRoot(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes registry root: ${relativePath}`);
  }
  return resolved;
}

function resolveExistingFile(root, relativePath, label, errors) {
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    return undefined;
  }

  let resolved;
  try {
    resolved = resolveWithinRoot(root, relativePath);
  } catch {
    errors.push(`${label}.path must stay inside the registry root`);
    return undefined;
  }

  if (!existsSync(resolved)) {
    errors.push(`${label}.path does not exist: ${relativePath}`);
    return undefined;
  }

  if (!statSync(resolved).isFile()) {
    errors.push(`${label}.path must point to a file: ${relativePath}`);
    return undefined;
  }

  return resolved;
}

function checkSha256(root, relativePath, expected, label, errors) {
  const resolved = resolveExistingFile(root, relativePath, label, errors);
  if (resolved === undefined) {
    return undefined;
  }

  if (expected !== undefined) {
    if (typeof expected !== "string" || !/^[0-9a-fA-F]{64}$/.test(expected)) {
      errors.push(`${label}.sha256 must be a 64-character hex digest`);
      return { path: relativePath, status: "invalid-expected-digest" };
    }
    const actual = sha256File(resolved);
    if (expected.toLowerCase() !== actual) {
      errors.push(
        `${label}.sha256 mismatch for ${relativePath}: expected ${expected}, got ${actual}`,
      );
      return { path: relativePath, status: "mismatch", expected, actual };
    }
    return { path: relativePath, status: "matched", sha256: actual };
  }

  return {
    path: relativePath,
    status: "not-declared",
    sha256: sha256File(resolved),
  };
}

function storedArtifactInputHash(root, relativePath) {
  try {
    const resolved = resolveWithinRoot(root, relativePath);
    const artifact = JSON.parse(readFileSync(resolved, "utf8"));
    return typeof artifact.inputHash === "string" ? artifact.inputHash : null;
  } catch {
    return null;
  }
}

function checkInputHash(root, artifact, label, errors) {
  const input = artifact.input;
  const sourcePath = input.example;
  const expected = input.sha256;

  const resolvedSource = resolveExistingFile(
    root,
    sourcePath,
    `${label}.input`,
    errors,
  );
  if (resolvedSource === undefined) {
    return undefined;
  }

  if (typeof expected !== "string" || !/^[0-9a-fA-F]{64}$/.test(expected)) {
    errors.push(`${label}.input.sha256 must be a 64-character hex digest`);
    return {
      path: sourcePath,
      status: "invalid-expected-digest",
    };
  }

  const stored = storedArtifactInputHash(root, artifact.path);
  if (stored === null) {
    return {
      path: sourcePath,
      status: "declared",
      sha256: expected.toLowerCase(),
      note: "source file exists; stored artifact does not expose inputHash",
    };
  }

  if (stored.toLowerCase() !== expected.toLowerCase()) {
    errors.push(
      `${label}.input.sha256 does not match stored artifact inputHash: expected ${expected}, got ${stored}`,
    );
    return {
      path: sourcePath,
      status: "mismatch",
      expected,
      actual: stored,
    };
  }

  return {
    path: sourcePath,
    status: "matched",
    sha256: expected.toLowerCase(),
    checkedAgainst: artifact.path,
  };
}

function validateArtifact(artifact, index, root, seenIds, errors) {
  const label = `artifacts[${index}]`;

  if (!isRecord(artifact)) {
    errors.push(`${label} must be an object`);
    return {
      id: null,
      tool: null,
      status: "invalid",
      artifactHash: undefined,
      inputHash: undefined,
    };
  }

  requireString(artifact.id, `${label}.id`, errors);
  requireString(artifact.tool, `${label}.tool`, errors);
  requireString(artifact.artifactKind, `${label}.artifactKind`, errors);
  requireString(artifact.status, `${label}.status`, errors);
  requireString(artifact.path, `${label}.path`, errors);
  requireStringArray(artifact.claims, `${label}.claims`, errors);
  requireStringArray(artifact.boundary, `${label}.boundary`, errors);

  if (typeof artifact.id === "string") {
    if (seenIds.has(artifact.id)) {
      errors.push(`${label}.id duplicates an earlier artifact: ${artifact.id}`);
    }
    seenIds.add(artifact.id);
  }

  if (typeof artifact.tool === "string" && !KNOWN_TOOLS.has(artifact.tool)) {
    errors.push(`${label}.tool is not a known external tool: ${artifact.tool}`);
  }

  if (typeof artifact.status === "string" && !STATUSES.has(artifact.status)) {
    errors.push(`${label}.status is not supported: ${artifact.status}`);
  }

  if (!Array.isArray(artifact.command) || artifact.command.length === 0) {
    errors.push(`${label}.command must be a non-empty array`);
  } else {
    artifact.command.forEach((entry, commandIndex) => {
      if (typeof entry !== "string" || entry.trim().length === 0) {
        errors.push(
          `${label}.command[${commandIndex}] must be a non-empty string`,
        );
      }
    });
  }

  if (!isRecord(artifact.environment)) {
    errors.push(`${label}.environment must be an object`);
  } else {
    requireString(
      artifact.environment.runtime,
      `${label}.environment.runtime`,
      errors,
    );
  }

  let inputHash;
  if (!isRecord(artifact.input)) {
    errors.push(`${label}.input must be an object`);
  } else {
    requireString(artifact.input.example, `${label}.input.example`, errors);
    requireString(artifact.input.sha256, `${label}.input.sha256`, errors);
    inputHash = checkInputHash(root, artifact, label, errors);
  }

  const artifactHash = checkSha256(
    root,
    artifact.path,
    artifact.sha256,
    label,
    errors,
  );

  return {
    id: typeof artifact.id === "string" ? artifact.id : null,
    tool: typeof artifact.tool === "string" ? artifact.tool : null,
    status: typeof artifact.status === "string" ? artifact.status : "invalid",
    artifactHash,
    inputHash,
  };
}

function validateManifest(manifestPath, root) {
  const resolvedManifest = path.resolve(root, manifestPath);
  const manifest = readJson(resolvedManifest);
  const errors = [];
  const seenIds = new Set();

  if (manifest.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (manifest.manifestKind !== MANIFEST_KIND) {
    errors.push(`manifestKind must be ${MANIFEST_KIND}`);
  }
  requireString(manifest.createdAt, "createdAt", errors);
  requireString(manifest.purpose, "purpose", errors);

  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (artifacts.length === 0) {
    errors.push("artifacts must be a non-empty array");
  }

  const artifactReports = artifacts.map((artifact, index) =>
    validateArtifact(artifact, index, root, seenIds, errors),
  );

  return {
    ok: errors.length === 0,
    filePath: manifestPath,
    manifestKind: manifest.manifestKind ?? null,
    artifactCount: artifacts.length,
    artifacts: artifactReports,
    errors,
  };
}

try {
  const { root, manifests } = parseArgs(process.argv.slice(2));
  const reports = manifests.map((manifest) => validateManifest(manifest, root));
  const result = {
    ok: reports.every((report) => report.ok),
    schemaVersion: 1,
    validator: "coxeter-viewer-artifact-registry-v1",
    root,
    manifests: reports,
  };

  console.log(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.log(
    `${JSON.stringify(
      {
        ok: false,
        schemaVersion: 1,
        validator: "coxeter-viewer-artifact-registry-v1",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
