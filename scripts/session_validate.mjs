#!/usr/bin/env node
import { readFileSync } from "node:fs";

const PROJECT_SESSION_KIND = "coxeter-viewer-project-session";

const allowed = {
  backends: new Set([
    "browserApproxBackend",
    "sageExportBackend",
    "gapKbmagBackend",
  ]),
  datasetKinds: new Set([
    "none",
    "example",
    "imported-coxeter-system",
    "generated-ball",
    "quotient-complex",
  ]),
  viewModes: new Set([
    "combinatorial-shell",
    "force-layout",
    "geometric-projection",
    "local-topology",
    "y-gamma",
  ]),
  labelScopes: new Set(["none", "selected", "focused", "all"]),
  recentKinds: new Set([
    "coxeter-system",
    "generated-ball",
    "quotient-complex",
    "experiment-bundle",
    "screenshot",
    "session",
  ]),
  runtimes: new Set(["web", "tauri"]),
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(path, message) {
  return { path, message };
}

function requireObject(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(issue(path, "must be an object"));
    return {};
  }
  return value;
}

function requireString(value, path, errors, options = {}) {
  if (typeof value !== "string" || (options.nonEmpty && value.length === 0)) {
    errors.push(issue(path, "must be a string"));
    return "";
  }
  return value;
}

function optionalString(value, path, errors) {
  if (value === undefined) {
    return;
  }
  requireString(value, path, errors);
}

function requireTimestamp(value, path, errors) {
  const text = requireString(value, path, errors, { nonEmpty: true });
  if (text.length > 0 && Number.isNaN(Date.parse(text))) {
    errors.push(issue(path, "must be an ISO-like timestamp"));
  }
}

function requireInteger(value, path, errors, min) {
  if (!Number.isInteger(value) || value < min) {
    errors.push(issue(path, `must be an integer >= ${min}`));
  }
}

function requireBoolean(value, path, errors) {
  if (typeof value !== "boolean") {
    errors.push(issue(path, "must be a boolean"));
  }
}

function requireEnum(value, path, values, errors) {
  if (typeof value !== "string" || !values.has(value)) {
    errors.push(issue(path, `must be one of: ${[...values].join(", ")}`));
  }
}

function requireStringArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue(path, "must be an array of strings"));
    return [];
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      errors.push(issue(`${path}[${index}]`, "must be a string"));
    }
  });
  return value.filter((entry) => typeof entry === "string");
}

function requireTriple(value, path, errors) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    errors.push(issue(path, "must be a numeric 3-vector"));
  }
}

function validateRecentFile(value, path, errors) {
  const file = requireObject(value, path, errors);
  requireString(file.id, `${path}.id`, errors, { nonEmpty: true });
  requireEnum(file.kind, `${path}.kind`, allowed.recentKinds, errors);
  optionalString(file.label, `${path}.label`, errors);
  optionalString(file.path, `${path}.path`, errors);
  optionalString(file.sha256, `${path}.sha256`, errors);
  if (typeof file.sha256 === "string" && !/^[a-f0-9]{64}$/i.test(file.sha256)) {
    errors.push(issue(`${path}.sha256`, "must be 64 hexadecimal characters"));
  }
  if (file.lastOpenedAt !== undefined) {
    requireTimestamp(file.lastOpenedAt, `${path}.lastOpenedAt`, errors);
  }
  if (file.notes !== undefined) {
    requireStringArray(file.notes, `${path}.notes`, errors);
  }
  return typeof file.id === "string" ? file.id : "";
}

function validateSession(value) {
  const errors = [];
  const warnings = [];
  const session = requireObject(value, "$", errors);

  if (session.schemaVersion !== 1) {
    errors.push(issue("$.schemaVersion", "must be 1"));
  }
  if (session.sessionKind !== PROJECT_SESSION_KIND) {
    errors.push(issue("$.sessionKind", `must be "${PROJECT_SESSION_KIND}"`));
  }

  const project = requireObject(session.project, "$.project", errors);
  requireString(project.id, "$.project.id", errors, { nonEmpty: true });
  requireString(project.label, "$.project.label", errors, { nonEmpty: true });
  optionalString(project.rootPathHint, "$.project.rootPathHint", errors);

  requireTimestamp(session.createdAt, "$.createdAt", errors);
  requireTimestamp(session.updatedAt, "$.updatedAt", errors);
  optionalString(session.appVersion, "$.appVersion", errors);

  const dataset = requireObject(session.dataset, "$.dataset", errors);
  requireEnum(
    dataset.sourceKind,
    "$.dataset.sourceKind",
    allowed.datasetKinds,
    errors,
  );
  optionalString(dataset.activeDatasetId, "$.dataset.activeDatasetId", errors);
  optionalString(dataset.activeExampleId, "$.dataset.activeExampleId", errors);
  optionalString(dataset.importedFileId, "$.dataset.importedFileId", errors);
  optionalString(dataset.generatedBallId, "$.dataset.generatedBallId", errors);
  optionalString(dataset.quotientId, "$.dataset.quotientId", errors);

  const generation = requireObject(session.generation, "$.generation", errors);
  requireInteger(generation.radius, "$.generation.radius", errors, 0);
  requireEnum(
    generation.backend,
    "$.generation.backend",
    allowed.backends,
    errors,
  );
  requireInteger(generation.maxRadius, "$.generation.maxRadius", errors, 0);
  requireInteger(generation.maxNodes, "$.generation.maxNodes", errors, 1);
  requireInteger(generation.maxEdges, "$.generation.maxEdges", errors, 1);
  if (generation.matrixKeyPrecision !== undefined) {
    requireInteger(
      generation.matrixKeyPrecision,
      "$.generation.matrixKeyPrecision",
      errors,
      0,
    );
  }
  if (
    Number.isInteger(generation.radius) &&
    Number.isInteger(generation.maxRadius) &&
    generation.radius > generation.maxRadius
  ) {
    warnings.push(
      issue(
        "$.generation.radius",
        "radius is larger than maxRadius and will be capped",
      ),
    );
  }

  const view = requireObject(session.view, "$.view", errors);
  requireEnum(view.mode, "$.view.mode", allowed.viewModes, errors);
  requireEnum(
    view.labelScope,
    "$.view.labelScope",
    allowed.labelScopes,
    errors,
  );
  requireBoolean(view.showRankTwoCells, "$.view.showRankTwoCells", errors);
  requireBoolean(view.showHigherCells, "$.view.showHigherCells", errors);
  requireBoolean(view.showNodeLabels, "$.view.showNodeLabels", errors);
  requireBoolean(view.showEdgeLabels, "$.view.showEdgeLabels", errors);
  optionalString(view.selectedNodeId, "$.view.selectedNodeId", errors);
  optionalString(view.selectedCellId, "$.view.selectedCellId", errors);
  optionalString(
    view.activeGeneratorPairKey,
    "$.view.activeGeneratorPairKey",
    errors,
  );
  if (view.camera !== undefined) {
    const camera = requireObject(view.camera, "$.view.camera", errors);
    requireTriple(camera.position, "$.view.camera.position", errors);
    requireTriple(camera.target, "$.view.camera.target", errors);
    if (
      camera.zoom !== undefined &&
      (typeof camera.zoom !== "number" ||
        !Number.isFinite(camera.zoom) ||
        camera.zoom <= 0)
    ) {
      errors.push(issue("$.view.camera.zoom", "must be a positive number"));
    }
  }

  const files = requireObject(session.files, "$.files", errors);
  if (!Array.isArray(files.recent)) {
    errors.push(issue("$.files.recent", "must be an array"));
  } else {
    const ids = new Set();
    files.recent.forEach((entry, index) => {
      const id = validateRecentFile(entry, `$.files.recent[${index}]`, errors);
      if (id.length > 0 && ids.has(id)) {
        errors.push(
          issue(`$.files.recent[${index}].id`, `duplicate file id "${id}"`),
        );
      }
      ids.add(id);
    });
  }

  const experiments = requireObject(
    session.experiments,
    "$.experiments",
    errors,
  );
  optionalString(
    experiments.activeBundleId,
    "$.experiments.activeBundleId",
    errors,
  );
  const bundleIds = requireStringArray(
    experiments.bundleIds,
    "$.experiments.bundleIds",
    errors,
  );
  if (
    typeof experiments.activeBundleId === "string" &&
    !bundleIds.includes(experiments.activeBundleId)
  ) {
    warnings.push(
      issue(
        "$.experiments.activeBundleId",
        "activeBundleId is not present in bundleIds",
      ),
    );
  }

  const desktop = requireObject(session.desktop, "$.desktop", errors);
  requireEnum(
    desktop.preferredRuntime,
    "$.desktop.preferredRuntime",
    allowed.runtimes,
    errors,
  );
  optionalString(
    desktop.lastWebReleaseManifestPath,
    "$.desktop.lastWebReleaseManifestPath",
    errors,
  );
  optionalString(
    desktop.lastDesktopReleaseManifestPath,
    "$.desktop.lastDesktopReleaseManifestPath",
    errors,
  );

  requireStringArray(session.warnings, "$.warnings", errors);
  requireStringArray(session.notes, "$.notes", errors);

  return { ok: errors.length === 0, errors, warnings };
}

function readJsonFile(filePath) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(filePath, "utf8")) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function defaultSessionFixture() {
  return {
    schemaVersion: 1,
    sessionKind: PROJECT_SESSION_KIND,
    project: {
      id: "coxeter-viewer-local-project",
      label: "CoxeterViewer5D",
    },
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    appVersion: "0.1.0",
    dataset: {
      sourceKind: "example",
      activeDatasetId: "I2_5",
      activeExampleId: "I2_5",
    },
    generation: {
      radius: 3,
      backend: "browserApproxBackend",
      maxRadius: 6,
      maxNodes: 5000,
      maxEdges: 20000,
      matrixKeyPrecision: 10,
    },
    view: {
      mode: "combinatorial-shell",
      labelScope: "selected",
      showRankTwoCells: true,
      showHigherCells: false,
      showNodeLabels: true,
      showEdgeLabels: true,
    },
    files: { recent: [] },
    experiments: { bundleIds: [] },
    desktop: { preferredRuntime: "web" },
    warnings: [],
    notes: [],
  };
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(
    "Usage: node scripts/session_validate.mjs [<.coxeter-session.json>...]\n",
  );
  process.exit(0);
}

const sessions =
  args.length === 0
    ? [
        {
          path: "<default-session-fixture>",
          ...validateSession(defaultSessionFixture()),
        },
      ]
    : args.map((filePath) => {
        const readResult = readJsonFile(filePath);
        if (!readResult.ok) {
          return {
            path: filePath,
            ok: false,
            errors: [
              issue(
                filePath,
                `could not read or parse JSON: ${readResult.error}`,
              ),
            ],
            warnings: [],
          };
        }
        return {
          path: filePath,
          ...validateSession(readResult.value),
        };
      });

const report = {
  ok: sessions.every((session) => session.ok),
  checked: sessions.length,
  sessions,
  errors: sessions.flatMap((session) =>
    session.errors.map(
      (entry) => `${session.path} ${entry.path}: ${entry.message}`,
    ),
  ),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);
