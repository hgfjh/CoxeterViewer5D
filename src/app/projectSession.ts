export const PROJECT_SESSION_FILE_NAME = ".coxeter-session.json";
export const PROJECT_SESSION_KIND = "coxeter-viewer-project-session";
export const PROJECT_SESSION_MEDIA_TYPE = "application/json";

export type ProjectSessionSchemaVersion = 1;

export type ProjectSessionBackendId =
  | "browserApproxBackend"
  | "sageExportBackend"
  | "gapKbmagBackend";

export type ProjectSessionDatasetKind =
  | "none"
  | "example"
  | "imported-coxeter-system"
  | "generated-ball"
  | "quotient-complex";

export type ProjectSessionViewMode =
  | "combinatorial-shell"
  | "force-layout"
  | "geometric-projection"
  | "local-topology"
  | "y-gamma";

export type ProjectSessionLabelScope = "none" | "selected" | "focused" | "all";

export type ProjectSessionRecentFileKind =
  | "coxeter-system"
  | "generated-ball"
  | "quotient-complex"
  | "experiment-bundle"
  | "screenshot"
  | "session";

export interface ProjectSessionProject {
  id: string;
  label: string;
  rootPathHint?: string;
}

export interface ProjectSessionDatasetState {
  activeDatasetId?: string;
  activeExampleId?: string;
  sourceKind: ProjectSessionDatasetKind;
  importedFileId?: string;
  generatedBallId?: string;
  quotientId?: string;
}

export interface ProjectSessionGenerationState {
  radius: number;
  backend: ProjectSessionBackendId;
  maxRadius: number;
  maxNodes: number;
  maxEdges: number;
  matrixKeyPrecision?: number;
}

export interface ProjectSessionCameraState {
  position: [number, number, number];
  target: [number, number, number];
  zoom?: number;
}

export interface ProjectSessionViewState {
  mode: ProjectSessionViewMode;
  labelScope: ProjectSessionLabelScope;
  showRankTwoCells: boolean;
  showHigherCells: boolean;
  showNodeLabels: boolean;
  showEdgeLabels: boolean;
  selectedNodeId?: string;
  selectedCellId?: string;
  activeGeneratorPairKey?: string;
  camera?: ProjectSessionCameraState;
}

export interface ProjectSessionRecentFile {
  id: string;
  kind: ProjectSessionRecentFileKind;
  label?: string;
  path?: string;
  sha256?: string;
  lastOpenedAt?: string;
  notes?: string[];
}

export interface ProjectSessionFileState {
  recent: ProjectSessionRecentFile[];
}

export interface ProjectSessionExperimentState {
  activeBundleId?: string;
  bundleIds: string[];
}

export interface ProjectSessionDesktopState {
  preferredRuntime: "web" | "tauri";
  lastWebReleaseManifestPath?: string;
  lastDesktopReleaseManifestPath?: string;
}

export interface ProjectSession {
  schemaVersion: ProjectSessionSchemaVersion;
  sessionKind: typeof PROJECT_SESSION_KIND;
  project: ProjectSessionProject;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  dataset: ProjectSessionDatasetState;
  generation: ProjectSessionGenerationState;
  view: ProjectSessionViewState;
  files: ProjectSessionFileState;
  experiments: ProjectSessionExperimentState;
  desktop: ProjectSessionDesktopState;
  warnings: string[];
  notes: string[];
}

export interface ProjectSessionValidationIssue {
  path: string;
  message: string;
}

export type ProjectSessionValidationResult =
  | {
      ok: true;
      value: ProjectSession;
      errors: [];
      warnings: ProjectSessionValidationIssue[];
    }
  | {
      ok: false;
      value?: undefined;
      errors: ProjectSessionValidationIssue[];
      warnings: ProjectSessionValidationIssue[];
    };

export interface CreateProjectSessionInput {
  project?: Partial<ProjectSessionProject>;
  createdAt?: string;
  updatedAt?: string;
  appVersion?: string;
  dataset?: Partial<ProjectSessionDatasetState>;
  generation?: Partial<ProjectSessionGenerationState>;
  view?: Partial<ProjectSessionViewState>;
  files?: Partial<ProjectSessionFileState>;
  experiments?: Partial<ProjectSessionExperimentState>;
  desktop?: Partial<ProjectSessionDesktopState>;
  warnings?: string[];
  notes?: string[];
}

export interface ProjectSessionExport {
  fileName: typeof PROJECT_SESSION_FILE_NAME;
  mediaType: typeof PROJECT_SESSION_MEDIA_TYPE;
  contents: string;
}

const deterministicTimestamp = "1970-01-01T00:00:00.000Z";

const backendIds = [
  "browserApproxBackend",
  "sageExportBackend",
  "gapKbmagBackend",
] as const satisfies readonly ProjectSessionBackendId[];

const datasetKinds = [
  "none",
  "example",
  "imported-coxeter-system",
  "generated-ball",
  "quotient-complex",
] as const satisfies readonly ProjectSessionDatasetKind[];

const viewModes = [
  "combinatorial-shell",
  "force-layout",
  "geometric-projection",
  "local-topology",
  "y-gamma",
] as const satisfies readonly ProjectSessionViewMode[];

const labelScopes = [
  "none",
  "selected",
  "focused",
  "all",
] as const satisfies readonly ProjectSessionLabelScope[];

const recentFileKinds = [
  "coxeter-system",
  "generated-ball",
  "quotient-complex",
  "experiment-bundle",
  "screenshot",
  "session",
] as const satisfies readonly ProjectSessionRecentFileKind[];

export function createProjectSession(
  input: CreateProjectSessionInput = {},
): ProjectSession {
  const createdAt = input.createdAt ?? deterministicTimestamp;
  const session: ProjectSession = {
    schemaVersion: 1,
    sessionKind: PROJECT_SESSION_KIND,
    project: {
      id: input.project?.id ?? "coxeter-viewer-local-project",
      label: input.project?.label ?? "CoxeterViewer5D",
      rootPathHint: input.project?.rootPathHint,
    },
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    appVersion: input.appVersion,
    dataset: {
      sourceKind: input.dataset?.sourceKind ?? "example",
      activeDatasetId: input.dataset?.activeDatasetId ?? "I2_5",
      activeExampleId: input.dataset?.activeExampleId ?? "I2_5",
      importedFileId: input.dataset?.importedFileId,
      generatedBallId: input.dataset?.generatedBallId,
      quotientId: input.dataset?.quotientId,
    },
    generation: {
      radius: input.generation?.radius ?? 3,
      backend: input.generation?.backend ?? "browserApproxBackend",
      maxRadius: input.generation?.maxRadius ?? 6,
      maxNodes: input.generation?.maxNodes ?? 5000,
      maxEdges: input.generation?.maxEdges ?? 20000,
      matrixKeyPrecision: input.generation?.matrixKeyPrecision ?? 10,
    },
    view: {
      mode: input.view?.mode ?? "combinatorial-shell",
      labelScope: input.view?.labelScope ?? "selected",
      showRankTwoCells: input.view?.showRankTwoCells ?? true,
      showHigherCells: input.view?.showHigherCells ?? false,
      showNodeLabels: input.view?.showNodeLabels ?? false,
      showEdgeLabels: input.view?.showEdgeLabels ?? false,
      selectedNodeId: input.view?.selectedNodeId,
      selectedCellId: input.view?.selectedCellId,
      activeGeneratorPairKey: input.view?.activeGeneratorPairKey,
      camera: input.view?.camera,
    },
    files: {
      recent: input.files?.recent ?? [],
    },
    experiments: {
      activeBundleId: input.experiments?.activeBundleId,
      bundleIds: input.experiments?.bundleIds ?? [],
    },
    desktop: {
      preferredRuntime: input.desktop?.preferredRuntime ?? "web",
      lastWebReleaseManifestPath: input.desktop?.lastWebReleaseManifestPath,
      lastDesktopReleaseManifestPath:
        input.desktop?.lastDesktopReleaseManifestPath,
    },
    warnings: input.warnings ?? [],
    notes: input.notes ?? [],
  };
  const result = validateProjectSession(session);
  if (!result.ok) {
    throw new Error(
      `Internal ProjectSession defaults failed validation: ${formatSessionIssues(result.errors).join("; ")}`,
    );
  }
  return result.value;
}

export function validateProjectSession(
  input: unknown,
): ProjectSessionValidationResult {
  const errors: ProjectSessionValidationIssue[] = [];
  const warnings: ProjectSessionValidationIssue[] = [];
  if (!isRecord(input)) {
    errors.push({
      path: "$",
      message: "Project session must be a JSON object.",
    });
    return { ok: false, errors, warnings };
  }

  if (input.schemaVersion !== 1) {
    errors.push({
      path: "$.schemaVersion",
      message: "schemaVersion must be 1.",
    });
  }
  if (input.sessionKind !== PROJECT_SESSION_KIND) {
    errors.push({
      path: "$.sessionKind",
      message: `sessionKind must be "${PROJECT_SESSION_KIND}".`,
    });
  }

  const project = validateProject(input.project, "$.project", errors);
  const createdAt = requireIsoTimestamp(input.createdAt, "$.createdAt", errors);
  const updatedAt = requireIsoTimestamp(input.updatedAt, "$.updatedAt", errors);
  const appVersion = optionalString(input.appVersion, "$.appVersion", errors);
  const dataset = validateDataset(input.dataset, "$.dataset", errors);
  const generation = validateGeneration(
    input.generation,
    "$.generation",
    errors,
  );
  const view = validateView(input.view, "$.view", errors);
  const files = validateFiles(input.files, "$.files", errors);
  const experiments = validateExperiments(
    input.experiments,
    "$.experiments",
    errors,
    warnings,
  );
  const desktop = validateDesktop(input.desktop, "$.desktop", errors);
  const sessionWarnings = validateStringArray(
    input.warnings,
    "$.warnings",
    errors,
    { required: true, uniqueSorted: true },
  );
  const notes = validateStringArray(input.notes, "$.notes", errors, {
    required: true,
    uniqueSorted: false,
  });

  if (generation.radius > generation.maxRadius) {
    warnings.push({
      path: "$.generation.radius",
      message:
        "radius is larger than maxRadius; the generator will cap the effective radius.",
    });
  }
  if (updatedAt < createdAt) {
    warnings.push({
      path: "$.updatedAt",
      message: "updatedAt sorts before createdAt.",
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      sessionKind: PROJECT_SESSION_KIND,
      project,
      createdAt,
      updatedAt,
      appVersion,
      dataset,
      generation,
      view,
      files,
      experiments,
      desktop,
      warnings: sessionWarnings,
      notes,
    },
    errors: [],
    warnings,
  };
}

export function parseProjectSessionJson(
  contents: string,
  source = PROJECT_SESSION_FILE_NAME,
): ProjectSessionValidationResult {
  try {
    return validateProjectSession(JSON.parse(contents));
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: source,
          message: `Could not parse project session JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      warnings: [],
    };
  }
}

export function serializeProjectSession(session: ProjectSession): string {
  const result = validateProjectSession(session);
  if (!result.ok) {
    throw new Error(
      `Cannot serialize invalid ProjectSession: ${formatSessionIssues(result.errors).join("; ")}`,
    );
  }
  return `${JSON.stringify(stableNormalize(result.value), null, 2)}\n`;
}

export function createProjectSessionExport(
  session: ProjectSession,
): ProjectSessionExport {
  return {
    fileName: PROJECT_SESSION_FILE_NAME,
    mediaType: PROJECT_SESSION_MEDIA_TYPE,
    contents: serializeProjectSession(session),
  };
}

export function importProjectSession(
  contents: string,
  source = PROJECT_SESSION_FILE_NAME,
): ProjectSessionValidationResult {
  return parseProjectSessionJson(contents, source);
}

export function formatSessionIssues(
  issues: readonly ProjectSessionValidationIssue[],
): string[] {
  return issues.map((issue) => `${issue.path}: ${issue.message}`);
}

function validateProject(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): ProjectSessionProject {
  if (!isRecord(input)) {
    errors.push({ path, message: "project must be an object." });
    return { id: "", label: "" };
  }
  return {
    id: requireNonEmptyString(input.id, `${path}.id`, errors),
    label: requireNonEmptyString(input.label, `${path}.label`, errors),
    rootPathHint: optionalString(
      input.rootPathHint,
      `${path}.rootPathHint`,
      errors,
    ),
  };
}

function validateDataset(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): ProjectSessionDatasetState {
  if (!isRecord(input)) {
    errors.push({ path, message: "dataset must be an object." });
    return { sourceKind: "none" };
  }
  return {
    sourceKind: requireEnum(
      input.sourceKind,
      `${path}.sourceKind`,
      datasetKinds,
      errors,
    ),
    activeDatasetId: optionalString(
      input.activeDatasetId,
      `${path}.activeDatasetId`,
      errors,
    ),
    activeExampleId: optionalString(
      input.activeExampleId,
      `${path}.activeExampleId`,
      errors,
    ),
    importedFileId: optionalString(
      input.importedFileId,
      `${path}.importedFileId`,
      errors,
    ),
    generatedBallId: optionalString(
      input.generatedBallId,
      `${path}.generatedBallId`,
      errors,
    ),
    quotientId: optionalString(input.quotientId, `${path}.quotientId`, errors),
  };
}

function validateGeneration(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): ProjectSessionGenerationState {
  if (!isRecord(input)) {
    errors.push({ path, message: "generation must be an object." });
    return {
      radius: 0,
      backend: "browserApproxBackend",
      maxRadius: 0,
      maxNodes: 0,
      maxEdges: 0,
    };
  }
  return {
    radius: requireNonNegativeInteger(input.radius, `${path}.radius`, errors),
    backend: requireEnum(input.backend, `${path}.backend`, backendIds, errors),
    maxRadius: requireNonNegativeInteger(
      input.maxRadius,
      `${path}.maxRadius`,
      errors,
    ),
    maxNodes: requirePositiveInteger(
      input.maxNodes,
      `${path}.maxNodes`,
      errors,
    ),
    maxEdges: requirePositiveInteger(
      input.maxEdges,
      `${path}.maxEdges`,
      errors,
    ),
    matrixKeyPrecision:
      input.matrixKeyPrecision === undefined
        ? undefined
        : requireNonNegativeInteger(
            input.matrixKeyPrecision,
            `${path}.matrixKeyPrecision`,
            errors,
          ),
  };
}

function validateView(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): ProjectSessionViewState {
  if (!isRecord(input)) {
    errors.push({ path, message: "view must be an object." });
    return {
      mode: "combinatorial-shell",
      labelScope: "selected",
      showRankTwoCells: false,
      showHigherCells: false,
      showNodeLabels: false,
      showEdgeLabels: false,
    };
  }
  return {
    mode: requireEnum(input.mode, `${path}.mode`, viewModes, errors),
    labelScope: requireEnum(
      input.labelScope,
      `${path}.labelScope`,
      labelScopes,
      errors,
    ),
    showRankTwoCells: requireBoolean(
      input.showRankTwoCells,
      `${path}.showRankTwoCells`,
      errors,
    ),
    showHigherCells: requireBoolean(
      input.showHigherCells,
      `${path}.showHigherCells`,
      errors,
    ),
    showNodeLabels: requireBoolean(
      input.showNodeLabels,
      `${path}.showNodeLabels`,
      errors,
    ),
    showEdgeLabels: requireBoolean(
      input.showEdgeLabels,
      `${path}.showEdgeLabels`,
      errors,
    ),
    selectedNodeId: optionalString(
      input.selectedNodeId,
      `${path}.selectedNodeId`,
      errors,
    ),
    selectedCellId: optionalString(
      input.selectedCellId,
      `${path}.selectedCellId`,
      errors,
    ),
    activeGeneratorPairKey: optionalString(
      input.activeGeneratorPairKey,
      `${path}.activeGeneratorPairKey`,
      errors,
    ),
    camera:
      input.camera === undefined
        ? undefined
        : validateCamera(input.camera, `${path}.camera`, errors),
  };
}

function validateCamera(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): ProjectSessionCameraState {
  if (!isRecord(input)) {
    errors.push({ path, message: "camera must be an object." });
    return { position: [0, 0, 0], target: [0, 0, 0] };
  }
  return {
    position: requireNumberTriple(input.position, `${path}.position`, errors),
    target: requireNumberTriple(input.target, `${path}.target`, errors),
    zoom:
      input.zoom === undefined
        ? undefined
        : requirePositiveFiniteNumber(input.zoom, `${path}.zoom`, errors),
  };
}

function validateFiles(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): ProjectSessionFileState {
  if (!isRecord(input)) {
    errors.push({ path, message: "files must be an object." });
    return { recent: [] };
  }
  if (!Array.isArray(input.recent)) {
    errors.push({
      path: `${path}.recent`,
      message: "recent must be an array.",
    });
    return { recent: [] };
  }

  const ids = new Set<string>();
  const recent = input.recent.map((entry, index) => {
    const file = validateRecentFile(entry, `${path}.recent[${index}]`, errors);
    if (file.id.length > 0) {
      if (ids.has(file.id)) {
        errors.push({
          path: `${path}.recent[${index}].id`,
          message: `duplicate recent file id "${file.id}".`,
        });
      }
      ids.add(file.id);
    }
    return file;
  });
  return { recent };
}

function validateRecentFile(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): ProjectSessionRecentFile {
  if (!isRecord(input)) {
    errors.push({ path, message: "recent file must be an object." });
    return { id: "", kind: "session" };
  }
  const sha256 = optionalString(input.sha256, `${path}.sha256`, errors);
  if (sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(sha256)) {
    errors.push({
      path: `${path}.sha256`,
      message: "sha256 must be a 64-character hexadecimal string.",
    });
  }
  const lastOpenedAt =
    input.lastOpenedAt === undefined
      ? undefined
      : requireIsoTimestamp(input.lastOpenedAt, `${path}.lastOpenedAt`, errors);
  return {
    id: requireNonEmptyString(input.id, `${path}.id`, errors),
    kind: requireEnum(input.kind, `${path}.kind`, recentFileKinds, errors),
    label: optionalString(input.label, `${path}.label`, errors),
    path: optionalString(input.path, `${path}.path`, errors),
    sha256,
    lastOpenedAt,
    notes: validateStringArray(input.notes, `${path}.notes`, errors, {
      required: false,
      uniqueSorted: false,
    }),
  };
}

function validateExperiments(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
  warnings: ProjectSessionValidationIssue[],
): ProjectSessionExperimentState {
  if (!isRecord(input)) {
    errors.push({ path, message: "experiments must be an object." });
    return { bundleIds: [] };
  }
  const activeBundleId = optionalString(
    input.activeBundleId,
    `${path}.activeBundleId`,
    errors,
  );
  const bundleIds = validateStringArray(
    input.bundleIds,
    `${path}.bundleIds`,
    errors,
    { required: true, uniqueSorted: true },
  );
  if (activeBundleId !== undefined && !bundleIds.includes(activeBundleId)) {
    warnings.push({
      path: `${path}.activeBundleId`,
      message: "activeBundleId is not present in bundleIds.",
    });
  }
  return { activeBundleId, bundleIds };
}

function validateDesktop(
  input: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): ProjectSessionDesktopState {
  if (!isRecord(input)) {
    errors.push({ path, message: "desktop must be an object." });
    return { preferredRuntime: "web" };
  }
  return {
    preferredRuntime: requireEnum(
      input.preferredRuntime,
      `${path}.preferredRuntime`,
      ["web", "tauri"] as const,
      errors,
    ),
    lastWebReleaseManifestPath: optionalString(
      input.lastWebReleaseManifestPath,
      `${path}.lastWebReleaseManifestPath`,
      errors,
    ),
    lastDesktopReleaseManifestPath: optionalString(
      input.lastDesktopReleaseManifestPath,
      `${path}.lastDesktopReleaseManifestPath`,
      errors,
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push({ path, message: "must be a non-empty string." });
    return "";
  }
  return value;
}

function optionalString(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    errors.push({ path, message: "must be a string when provided." });
    return undefined;
  }
  return value;
}

function requireIsoTimestamp(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): string {
  const text = requireNonEmptyString(value, path, errors);
  if (text.length > 0 && Number.isNaN(Date.parse(text))) {
    errors.push({ path, message: "must be an ISO-like timestamp string." });
  }
  return text;
}

function requireBoolean(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): boolean {
  if (typeof value !== "boolean") {
    errors.push({ path, message: "must be a boolean." });
    return false;
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: T,
  errors: ProjectSessionValidationIssue[],
): T[number] {
  if (typeof value === "string" && allowed.includes(value)) {
    return value;
  }
  errors.push({
    path,
    message: `must be one of: ${allowed.join(", ")}.`,
  });
  return allowed[0];
}

function requireNonNegativeInteger(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors.push({ path, message: "must be a non-negative integer." });
    return 0;
  }
  return value;
}

function requirePositiveInteger(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors.push({ path, message: "must be a positive integer." });
    return 1;
  }
  return value;
}

function requirePositiveFiniteNumber(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push({ path, message: "must be a positive finite number." });
    return 1;
  }
  return value;
}

function requireNumberTriple(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
): [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    errors.push({ path, message: "must be a numeric 3-vector." });
    return [0, 0, 0];
  }
  return [value[0], value[1], value[2]];
}

function validateStringArray(
  value: unknown,
  path: string,
  errors: ProjectSessionValidationIssue[],
  options: { required: boolean; uniqueSorted: boolean },
): string[] {
  if (value === undefined && !options.required) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push({ path, message: "must be an array of strings." });
    return [];
  }
  const strings: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string") {
      errors.push({
        path: `${path}[${index}]`,
        message: "must be a string.",
      });
      continue;
    }
    strings.push(entry);
  }
  if (!options.uniqueSorted) {
    return strings;
  }
  return [...new Set(strings)].sort();
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableNormalize(entry)]),
    );
  }
  return value;
}
