import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const KNOWN_TOOLS = new Set([
  "sage",
  "gap-kbmag",
  "coxiter",
  "published-transcription",
]);

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

function requireString(value, label, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${label} must be a non-empty string`);
  }
}

function requireStringArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      errors.push(`${label}[${index}] must be a non-empty string`);
    }
  });
}

function validateArtifact(artifact, index, rootDir, errors) {
  const label = `artifacts[${index}]`;
  requireString(artifact.id, `${label}.id`, errors);
  requireString(artifact.tool, `${label}.tool`, errors);
  requireString(artifact.artifactKind, `${label}.artifactKind`, errors);
  requireString(artifact.status, `${label}.status`, errors);
  requireString(artifact.path, `${label}.path`, errors);

  if (artifact.tool && !KNOWN_TOOLS.has(artifact.tool)) {
    errors.push(`${label}.tool is not a known external tool: ${artifact.tool}`);
  }

  requireStringArray(artifact.claims, `${label}.claims`, errors);
  requireStringArray(artifact.boundary, `${label}.boundary`, errors);

  if (!Array.isArray(artifact.command) || artifact.command.length === 0) {
    errors.push(`${label}.command must be a non-empty array`);
  }

  if (!artifact.environment || typeof artifact.environment !== "object") {
    errors.push(`${label}.environment must be an object`);
  } else {
    requireString(
      artifact.environment.runtime,
      `${label}.environment.runtime`,
      errors,
    );
  }

  if (!artifact.input || typeof artifact.input !== "object") {
    errors.push(`${label}.input must be an object`);
  } else {
    requireString(artifact.input.example, `${label}.input.example`, errors);
    requireString(artifact.input.sha256, `${label}.input.sha256`, errors);
  }

  if (typeof artifact.path === "string" && artifact.path.length > 0) {
    const artifactPath = path.resolve(rootDir, artifact.path);
    try {
      statSync(artifactPath);
    } catch {
      errors.push(`${label}.path does not exist: ${artifact.path}`);
      return;
    }

    if (artifact.sha256) {
      const actual = sha256File(artifactPath);
      if (artifact.sha256.toLowerCase() !== actual) {
        errors.push(
          `${label}.sha256 mismatch for ${artifact.path}: expected ${artifact.sha256}, got ${actual}`,
        );
      }
    }
  }
}

function validateManifest(filePath) {
  const manifest = readJson(filePath);
  const errors = [];
  const rootDir = process.cwd();

  if (manifest.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (manifest.manifestKind !== "coxeter-viewer-external-artifact-manifest") {
    errors.push(
      "manifestKind must be coxeter-viewer-external-artifact-manifest",
    );
  }
  requireString(manifest.createdAt, "createdAt", errors);
  requireString(manifest.purpose, "purpose", errors);

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    errors.push("artifacts must be a non-empty array");
  } else {
    manifest.artifacts.forEach((artifact, index) =>
      validateArtifact(artifact, index, rootDir, errors),
    );
  }

  if (errors.length > 0) {
    throw new Error(`${filePath} failed validation:\n- ${errors.join("\n- ")}`);
  }

  return { filePath, artifactCount: manifest.artifacts.length };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error(
    "Usage: node scripts/validate_artifact_manifest.mjs <manifest.json>...",
  );
  process.exit(2);
}

try {
  const results = files.map(validateManifest);
  console.log(
    JSON.stringify(
      {
        ok: true,
        manifests: results,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
