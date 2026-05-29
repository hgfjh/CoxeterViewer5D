#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function usage() {
  return [
    "Usage: node scripts/schema_migrate.mjs [--write] [<json-file>...]",
    "",
    "Default mode is a dry run. With no files, representative repository fixtures are checked.",
  ].join("\n");
}

function parseArgs(argv) {
  const files = [];
  let write = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--write") {
      write = true;
      continue;
    }
    files.push(arg);
  }

  return {
    files:
      files.length > 0
        ? files
        : [
            "public/examples/I2_5.json",
            "scripts/certificates/external-artifact-manifest.example.json",
          ],
    write,
    usingDefaultFiles: files.length === 0,
  };
}

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateCoxeterSystem(input) {
  const migrations = [];
  const output = { ...input };

  if (output.schemaVersion === undefined) {
    output.schemaVersion = 1;
    migrations.push("set schemaVersion=1");
  }

  if (output.coxeterMatrix === undefined && Array.isArray(output.matrix)) {
    output.coxeterMatrix = output.matrix;
    delete output.matrix;
    migrations.push("renamed matrix to coxeterMatrix");
  }

  if (
    !Array.isArray(output.generators) &&
    Array.isArray(output.generatorLabels)
  ) {
    output.generators = output.generatorLabels.map((label, index) => ({
      id: `s${index}`,
      label: String(label),
    }));
    delete output.generatorLabels;
    migrations.push("converted generatorLabels to generators");
  }

  if (
    !Array.isArray(output.generators) &&
    Number.isInteger(output.rank) &&
    output.rank > 0
  ) {
    output.generators = Array.from(
      { length: output.rank },
      (_unused, index) => ({
        id: `s${index}`,
        label: `s${index}`,
      }),
    );
    migrations.push("added default generators from rank");
  }

  return { output, migrations, documentKind: "coxeter-system-input" };
}

function migrateArtifactManifest(input) {
  const migrations = [];
  const output = { ...input };

  if (
    output.schemaVersion === undefined &&
    output.registryVersion === undefined
  ) {
    output.schemaVersion = 1;
    migrations.push("set schemaVersion=1");
  }

  if (
    output.schemaVersion === undefined &&
    output.registryVersion !== undefined
  ) {
    output.schemaVersion = output.registryVersion;
    delete output.registryVersion;
    migrations.push("renamed registryVersion to schemaVersion");
  }

  if (output.manifestKind === undefined && output.kind !== undefined) {
    output.manifestKind = output.kind;
    delete output.kind;
    migrations.push("renamed kind to manifestKind");
  }

  if (!Array.isArray(output.artifacts) && Array.isArray(output.files)) {
    output.artifacts = output.files.map((file) => {
      if (!isRecord(file)) {
        return file;
      }
      const artifact = { ...file };
      if (artifact.path === undefined && artifact.file !== undefined) {
        artifact.path = artifact.file;
        delete artifact.file;
      }
      if (artifact.input === undefined && artifact.source !== undefined) {
        artifact.input =
          typeof artifact.source === "string"
            ? { example: artifact.source, sha256: "" }
            : artifact.source;
        delete artifact.source;
      }
      return artifact;
    });
    delete output.files;
    migrations.push("renamed files to artifacts");
  }

  return { output, migrations, documentKind: "artifact-registry-manifest" };
}

function classifyAndMigrate(input) {
  if (!isRecord(input)) {
    return {
      output: input,
      migrations: [],
      documentKind: "unknown",
      errors: ["top-level JSON value must be an object"],
    };
  }

  if (
    input.manifestKind === "coxeter-viewer-external-artifact-manifest" ||
    input.kind === "coxeter-viewer-external-artifact-manifest" ||
    input.registryVersion !== undefined ||
    Array.isArray(input.files)
  ) {
    return { ...migrateArtifactManifest(input), errors: [] };
  }

  if (
    input.coxeterMatrix !== undefined ||
    input.matrix !== undefined ||
    input.generatorLabels !== undefined ||
    input.rank !== undefined
  ) {
    return { ...migrateCoxeterSystem(input), errors: [] };
  }

  return {
    output: input,
    migrations: [],
    documentKind: "unknown",
    errors: [],
  };
}

function migrateFile(filePath, write) {
  const resolved = path.resolve(process.cwd(), filePath);
  const originalText = readFileSync(resolved, "utf8");
  const input = readJson(resolved);
  const { output, migrations, documentKind, errors } =
    classifyAndMigrate(input);
  const migratedText = stableStringify(output);
  const changed = migrations.length > 0;
  const formatChanged = originalText !== migratedText;

  if (write && changed && errors.length === 0) {
    writeFileSync(resolved, migratedText, "utf8");
  }

  return {
    path: filePath,
    documentKind,
    changed,
    formatChanged,
    written: write && changed && errors.length === 0,
    migrations,
    errors,
    preview: write ? undefined : output,
  };
}

try {
  const { files, write, usingDefaultFiles } = parseArgs(process.argv.slice(2));
  const reports = files.map((file) => migrateFile(file, write));
  const result = {
    ok: reports.every((report) => report.errors.length === 0),
    schemaVersion: 1,
    migrator: "coxeter-viewer-schema-migrator-v1",
    dryRun: !write,
    usingDefaultFiles,
    files: reports,
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
        migrator: "coxeter-viewer-schema-migrator-v1",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
