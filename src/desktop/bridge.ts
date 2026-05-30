import type {
  ProjectSession,
  ProjectSessionWorkspaceState,
} from "../app/projectSession";
import { createProjectSessionExport } from "../app/projectSession";

export type DesktopRuntime = "browser" | "tauri";

export interface DesktopBridgeCapabilities {
  nativeWorkspace: boolean;
  nativeSessionOpen: boolean;
  nativeSessionSave: boolean;
  nativeExports: boolean;
  unsavedChangePrompt: boolean;
}

export interface DesktopRuntimeInfo {
  appName: string;
  appVersion: string;
  os: string;
  arch: string;
  debugBuild: boolean;
}

export interface ExternalToolStatus {
  id: string;
  displayName: string;
  found: boolean;
  path?: string;
  note: string;
}

export type DesktopMenuCommand =
  | "new-session"
  | "open-session"
  | "save-session"
  | "save-session-as"
  | "choose-workspace"
  | "export-graph"
  | "export-screenshot"
  | "export-figure-bundle"
  | "export-experiment-bundle"
  | "export-diagnostics"
  | "reveal-workspace"
  | "check-tools"
  | "show-logs"
  | "reset-view"
  | "teaching-mode"
  | "research-mode"
  | "toggle-labels"
  | "toggle-cells"
  | "fullscreen"
  | "guide-hexagon"
  | "guide-rank-three"
  | "guide-y-gamma"
  | "guide-quotient-game"
  | "lens-generator-star"
  | "lens-edge-star"
  | "lens-rank-k-family"
  | "help-readme"
  | "help-walkthroughs"
  | "help-about";

export type DesktopJobKind =
  | "detectTools"
  | "collectDiagnostics"
  | "validateWorkspace"
  | "sageQuotientExport"
  | "gapQuotientExport"
  | "coxiterCompactCheck"
  | "geometryCertificate"
  | "backendComparison";

export interface DesktopJobRequest {
  kind: DesktopJobKind;
  workspacePath?: string;
}

export interface DesktopJobRecord {
  id: string;
  kind: DesktopJobKind;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  message: string;
  result?: unknown;
}

export interface DesktopBridgeStatus {
  runtime: DesktopRuntime;
  nativeAvailable: boolean;
  workspace: ProjectSessionWorkspaceState;
  capabilities: DesktopBridgeCapabilities;
  message?: string;
}

export type DesktopExportKind =
  | "graph-json"
  | "local-neighborhood"
  | "quotient-build-request"
  | "screenshot"
  | "view-bundle"
  | "figure-bundle"
  | "experiment-bundle"
  | "project-session";

export interface DesktopExportRequest {
  kind: DesktopExportKind;
  fileName: string;
  contents: string;
  mediaType: string;
  contentEncoding?: "utf8" | "data-url";
}

export interface DesktopBridgeResult {
  ok: boolean;
  runtime: DesktopRuntime;
  fallbackDownload?: boolean;
  path?: string;
  message?: string;
}

export interface DesktopOpenSessionResult extends DesktopBridgeResult {
  contents?: string;
  path?: string;
}

export interface DesktopSaveSessionResult extends DesktopBridgeResult {
  path?: string;
}

export interface DesktopConfirmDiscardInput {
  isDirty: boolean;
  reason: string;
  sessionLabel?: string;
}

export interface DesktopConfirmDiscardResult {
  confirmed: boolean;
  runtime: DesktopRuntime;
  message?: string;
}

export interface DesktopBridge {
  getStatus(): Promise<DesktopBridgeStatus>;
  toggleFullscreen(): Promise<DesktopBridgeResult>;
  detectExternalTools(): Promise<ExternalToolStatus[]>;
  startDesktopJob(request: DesktopJobRequest): Promise<DesktopJobRecord>;
  listDesktopJobs(): Promise<DesktopJobRecord[]>;
  revealPath(path: string): Promise<DesktopBridgeResult>;
  exportDiagnosticBundle(workspacePath?: string): Promise<DesktopBridgeResult>;
  onMenuCommand(
    callback: (command: DesktopMenuCommand) => void,
  ): Promise<() => void>;
  pickWorkspace(): Promise<DesktopBridgeStatus>;
  openProjectSession(): Promise<DesktopOpenSessionResult>;
  saveProjectSession(
    session: ProjectSession,
    options?: { saveAs?: boolean },
  ): Promise<DesktopSaveSessionResult>;
  exportFile(request: DesktopExportRequest): Promise<DesktopBridgeResult>;
  confirmDiscardUnsavedChanges(
    input: DesktopConfirmDiscardInput,
  ): Promise<DesktopConfirmDiscardResult>;
}

type TauriCoreModule = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

type TauriDialogModule = {
  open: (
    options?: Record<string, unknown>,
  ) => Promise<string | string[] | null>;
  save: (options?: Record<string, unknown>) => Promise<string | null>;
  confirm: (
    message: string,
    options?: Record<string, unknown>,
  ) => Promise<boolean>;
};

type TauriEventModule = {
  listen: <T>(
    event: string,
    callback: (event: { payload: T }) => void,
  ) => Promise<() => void>;
};

type TauriWindowModule = {
  getCurrentWindow: () => {
    isFullscreen: () => Promise<boolean>;
    setFullscreen: (fullscreen: boolean) => Promise<void>;
  };
};

export interface DesktopBridgeOptions {
  loadTauriCore?: () => Promise<TauriCoreModule>;
  loadTauriDialog?: () => Promise<TauriDialogModule>;
  loadTauriEvent?: () => Promise<TauriEventModule>;
  loadTauriWindow?: () => Promise<TauriWindowModule>;
  confirm?: (message: string) => boolean;
}

const tauriCoreSpecifier = "@tauri-apps/api/core";
const tauriDialogSpecifier = "@tauri-apps/plugin-dialog";
const tauriEventSpecifier = "@tauri-apps/api/event";
const tauriWindowSpecifier = "@tauri-apps/api/window";

/**
 * Chooses the native Tauri bridge when available, otherwise browser fallbacks.
 *
 * The bridge is intentionally narrow: it opens/saves known project artifacts
 * and starts controlled jobs, but it never exposes an arbitrary shell command
 * runner to the React app.
 */
export function createDesktopBridge(
  options: DesktopBridgeOptions = {},
): DesktopBridge {
  return hasTauriRuntime()
    ? createTauriDesktopBridge(options)
    : createBrowserDesktopBridge(options);
}

/**
 * Browser implementation used by web builds and by tests.
 *
 * File operations become downloads or no-ops, so the web app remains usable
 * without native plugins.
 */
export function createBrowserDesktopBridge(
  options: DesktopBridgeOptions = {},
): DesktopBridge {
  const confirm =
    options.confirm ?? ((message: string) => window.confirm(message));
  return {
    async getStatus() {
      return browserStatus();
    },
    async detectExternalTools() {
      return [];
    },
    async toggleFullscreen() {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await document.documentElement.requestFullscreen();
        }
        return {
          ok: true,
          runtime: "browser",
          message: document.fullscreenElement
            ? "Entered browser fullscreen."
            : "Exited browser fullscreen.",
        };
      } catch (error) {
        return {
          ok: false,
          runtime: "browser",
          message: nativeErrorMessage(error),
        };
      }
    },
    async startDesktopJob(request) {
      return {
        id: `browser-${request.kind}`,
        kind: request.kind,
        status: "failed",
        message: "Desktop jobs are unavailable in the browser.",
      };
    },
    async listDesktopJobs() {
      return [];
    },
    async revealPath() {
      return {
        ok: false,
        runtime: "browser",
        message:
          "Reveal in file explorer is available only in the desktop app.",
      };
    },
    async exportDiagnosticBundle() {
      return {
        ok: false,
        runtime: "browser",
        fallbackDownload: true,
        message: "Diagnostic bundle export uses the browser fallback.",
      };
    },
    async onMenuCommand() {
      return () => undefined;
    },
    async pickWorkspace() {
      return {
        ...browserStatus(),
        message:
          "Workspace folders are managed by the desktop app. The browser keeps this session local until export.",
      };
    },
    async openProjectSession() {
      return {
        ok: false,
        runtime: "browser",
        message:
          "Native session open is unavailable in the browser; import or export JSON instead.",
      };
    },
    async saveProjectSession() {
      return {
        ok: false,
        runtime: "browser",
        fallbackDownload: true,
        message:
          "Native session save is unavailable in the browser; downloading .coxeter-session.json.",
      };
    },
    async exportFile() {
      return {
        ok: false,
        runtime: "browser",
        fallbackDownload: true,
        message: "Browser download fallback used.",
      };
    },
    async confirmDiscardUnsavedChanges(input) {
      if (!input.isDirty) {
        return { confirmed: true, runtime: "browser" };
      }
      const target = input.sessionLabel ? ` for ${input.sessionLabel}` : "";
      return {
        confirmed: confirm(
          `Discard unsaved session changes${target} before you ${input.reason}?`,
        ),
        runtime: "browser",
      };
    },
  };
}

/**
 * Tauri implementation. Every command name maps to a Rust allowlisted command
 * in src-tauri; frontend inputs are still treated as untrusted.
 */
export function createTauriDesktopBridge(
  options: DesktopBridgeOptions = {},
): DesktopBridge {
  let corePromise: Promise<TauriCoreModule> | undefined;
  let dialogPromise: Promise<TauriDialogModule> | undefined;
  let eventPromise: Promise<TauriEventModule> | undefined;
  let windowPromise: Promise<TauriWindowModule> | undefined;
  const loadCore =
    options.loadTauriCore ??
    (async () =>
      (await import(/* @vite-ignore */ tauriCoreSpecifier)) as TauriCoreModule);
  const loadDialog =
    options.loadTauriDialog ??
    (async () =>
      (await import(
        /* @vite-ignore */ tauriDialogSpecifier
      )) as TauriDialogModule);
  const loadEvent =
    options.loadTauriEvent ??
    (async () =>
      (await import(
        /* @vite-ignore */ tauriEventSpecifier
      )) as TauriEventModule);
  const loadWindow =
    options.loadTauriWindow ??
    (async () =>
      (await import(
        /* @vite-ignore */ tauriWindowSpecifier
      )) as TauriWindowModule);
  const invoke = async <T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    corePromise ??= loadCore();
    const core = await corePromise;
    return core.invoke<T>(command, args);
  };
  const dialog = async () => {
    dialogPromise ??= loadDialog();
    return dialogPromise;
  };
  const events = async () => {
    eventPromise ??= loadEvent();
    return eventPromise;
  };
  const desktopWindow = async () => {
    windowPromise ??= loadWindow();
    return windowPromise;
  };
  const browserFallback = createBrowserDesktopBridge(options);

  return {
    async getStatus() {
      try {
        const runtime = await invoke<DesktopRuntimeInfo>(
          "get_desktop_runtime_info",
        );
        const settings = await invoke<{
          contents: string;
          path: string;
          exists: boolean;
        }>("get_desktop_settings");
        const parsed = safeParseSettings(settings.contents);
        return normalizeStatus({
          nativeAvailable: true,
          workspace: parsed.workspace ?? {
            id: "desktop-workspace",
            label: "Desktop workspace",
            runtime: "tauri",
            rootPathHint: settings.path,
          },
          message: `${runtime.appName} ${runtime.appVersion} desktop bridge ready.`,
        });
      } catch (error) {
        return {
          ...browserStatus("tauri"),
          nativeAvailable: false,
          message: nativeErrorMessage(error),
        };
      }
    },
    async detectExternalTools() {
      const result = await invoke<{ tools?: ExternalToolStatus[] }>(
        "detect_external_tools",
      );
      return Array.isArray(result.tools) ? result.tools : [];
    },
    async toggleFullscreen() {
      try {
        const currentWindow = (await desktopWindow()).getCurrentWindow();
        const fullscreen = await currentWindow.isFullscreen();
        await currentWindow.setFullscreen(!fullscreen);
        return {
          ok: true,
          runtime: "tauri",
          message: fullscreen
            ? "Exited native fullscreen."
            : "Entered native fullscreen.",
        };
      } catch (error) {
        return {
          ...(await browserFallback.toggleFullscreen()),
          runtime: "tauri",
          message: nativeErrorMessage(error),
        };
      }
    },
    async startDesktopJob(request) {
      return invoke<DesktopJobRecord>("start_desktop_job", { request });
    },
    async listDesktopJobs() {
      return invoke<DesktopJobRecord[]>("list_desktop_jobs");
    },
    async revealPath(path) {
      try {
        await invoke<void>("reveal_path", { path });
        return { ok: true, runtime: "tauri", path };
      } catch (error) {
        return {
          ok: false,
          runtime: "tauri",
          message: nativeErrorMessage(error),
        };
      }
    },
    async exportDiagnosticBundle(workspacePath) {
      try {
        const result = await invoke<{ path?: string }>(
          "export_diagnostic_bundle",
          {
            workspacePath,
          },
        );
        return { ok: true, runtime: "tauri", path: result.path };
      } catch (error) {
        return {
          ok: false,
          runtime: "tauri",
          fallbackDownload: true,
          message: nativeErrorMessage(error),
        };
      }
    },
    async onMenuCommand(callback) {
      const eventApi = await events();
      return eventApi.listen<{ command?: DesktopMenuCommand }>(
        "desktop-menu-command",
        (event) => {
          const command = event.payload.command;
          if (command) {
            callback(command);
          }
        },
      );
    },
    async pickWorkspace() {
      try {
        const selected = await (
          await dialog()
        ).open({
          directory: true,
          multiple: false,
          title: "Choose Research Workspace",
        });
        const path = firstSelectedPath(selected);
        if (!path) {
          return normalizeStatus({
            nativeAvailable: true,
            message: "Workspace selection cancelled.",
          });
        }
        const workspace = await invoke<{ path: string; sessionPath: string }>(
          "choose_research_workspace",
          { path },
        );
        const settings = safeParseSettings(
          (await invoke<{ contents: string }>("get_desktop_settings")).contents,
        );
        const workspaceState: ProjectSessionWorkspaceState = {
          id: `workspace:${workspace.path}`,
          label: shortPathLabel(workspace.path),
          runtime: "tauri",
          rootPathHint: workspace.path,
          sessionPath: workspace.sessionPath,
          lastOpenedAt: new Date().toISOString(),
        };
        await invoke("save_desktop_settings", {
          request: {
            contents: JSON.stringify(
              { ...settings, workspace: workspaceState },
              null,
              2,
            ),
          },
        });
        return normalizeStatus({
          nativeAvailable: true,
          workspace: workspaceState,
          message: `Workspace: ${workspaceState.label}.`,
        });
      } catch (error) {
        return {
          ...browserStatus("tauri"),
          nativeAvailable: false,
          message: nativeErrorMessage(error),
        };
      }
    },
    async openProjectSession() {
      try {
        const selected = await (
          await dialog()
        ).open({
          multiple: false,
          title: "Open CoxeterViewer5D Session",
          filters: [
            {
              name: "CoxeterViewer5D session",
              extensions: ["coxeter-session", "json"],
            },
          ],
        });
        const path = firstSelectedPath(selected);
        if (!path) {
          return { ok: false, runtime: "tauri", message: "Open cancelled." };
        }
        return normalizeOpenSessionResult(
          await invoke<Partial<DesktopOpenSessionResult>>(
            "read_project_session",
            {
              path,
            },
          ),
        );
      } catch (error) {
        return {
          ok: false,
          runtime: "tauri",
          message: nativeErrorMessage(error),
        };
      }
    },
    async saveProjectSession(session, saveOptions = {}) {
      try {
        const exported = createProjectSessionExport(session);
        const currentPath = saveOptions.saveAs
          ? undefined
          : session.workspace?.sessionPath;
        const path =
          currentPath ??
          (await (
            await dialog()
          ).save({
            title: "Save CoxeterViewer5D Session",
            defaultPath: exported.fileName,
            filters: [
              {
                name: "CoxeterViewer5D session",
                extensions: ["json", "coxeter-session"],
              },
            ],
          }));
        if (!path) {
          return { ok: false, runtime: "tauri", message: "Save cancelled." };
        }
        return normalizeBridgeResult(
          await invoke<Partial<DesktopSaveSessionResult>>(
            "write_project_session",
            {
              path,
              contents: exported.contents,
            },
          ),
          "tauri",
        );
      } catch (error) {
        return {
          ...(await browserFallback.saveProjectSession(session)),
          runtime: "tauri",
          message: nativeErrorMessage(error),
        };
      }
    },
    async exportFile(request) {
      try {
        const path = await (
          await dialog()
        ).save({
          title: exportTitle(request.kind),
          defaultPath: request.fileName,
          filters: [exportFilter(request)],
        });
        if (!path) {
          return { ok: false, runtime: "tauri", message: "Export cancelled." };
        }
        if (request.contentEncoding === "data-url") {
          const base64 = dataUrlToBase64(request.contents);
          return normalizeBridgeResult(
            await invoke<Partial<DesktopBridgeResult>>("write_binary_export", {
              request: { path, base64, overwrite: true },
            }),
            "tauri",
          );
        }
        return normalizeBridgeResult(
          await invoke<Partial<DesktopBridgeResult>>("write_text_export", {
            request: {
              path,
              contents: request.contents,
              kind: exportKindForRequest(request.kind),
              overwrite: true,
            },
          }),
          "tauri",
        );
      } catch (error) {
        return {
          ok: false,
          runtime: "tauri",
          fallbackDownload: true,
          message: nativeErrorMessage(error),
        };
      }
    },
    async confirmDiscardUnsavedChanges(input) {
      if (!input.isDirty) {
        return { confirmed: true, runtime: "tauri" };
      }
      try {
        const result = await (
          await dialog()
        ).confirm(
          `Discard unsaved session changes before you ${input.reason}?`,
          { title: "Unsaved CoxeterViewer5D Session" },
        );
        return {
          confirmed: result === true,
          runtime: "tauri",
        };
      } catch {
        return browserFallback.confirmDiscardUnsavedChanges(input);
      }
    },
  };
}

export function shouldPromptForUnsavedChanges(
  savedFingerprint: string | undefined,
  currentFingerprint: string,
): boolean {
  return (
    savedFingerprint !== undefined && savedFingerprint !== currentFingerprint
  );
}

function safeParseSettings(contents: string): {
  workspace?: ProjectSessionWorkspaceState;
} {
  try {
    const parsed = JSON.parse(contents) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const workspace = (parsed as { workspace?: unknown }).workspace;
      if (isWorkspaceState(workspace)) {
        return { workspace };
      }
    }
  } catch {
    // Corrupt settings should never block the viewer; the next successful save
    // replaces the file with a valid settings object.
  }
  return {};
}

function isWorkspaceState(
  value: unknown,
): value is ProjectSessionWorkspaceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.label === "string" &&
    record.runtime === "tauri"
  );
}

function firstSelectedPath(
  value: string | string[] | null,
): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function shortPathLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function exportTitle(kind: DesktopExportKind): string {
  switch (kind) {
    case "screenshot":
      return "Save PNG Screenshot";
    case "figure-bundle":
      return "Save Figure Bundle";
    case "experiment-bundle":
      return "Save Experiment Bundle";
    case "project-session":
      return "Save Project Session";
    default:
      return "Save CoxeterViewer5D Export";
  }
}

function exportFilter(request: DesktopExportRequest): {
  name: string;
  extensions: string[];
} {
  if (request.contentEncoding === "data-url") {
    return { name: "PNG image", extensions: ["png"] };
  }
  if (request.kind === "project-session") {
    return {
      name: "CoxeterViewer5D session",
      extensions: ["json", "coxeter-session"],
    };
  }
  if (request.kind === "experiment-bundle") {
    return {
      name: "CoxeterViewer5D experiment",
      extensions: ["json", "coxeter-experiment"],
    };
  }
  return { name: "JSON", extensions: ["json"] };
}

function exportKindForRequest(kind: DesktopExportKind): string {
  switch (kind) {
    case "project-session":
      return "sessionJson";
    case "figure-bundle":
      return "figureBundle";
    case "experiment-bundle":
      return "experimentBundle";
    default:
      return "graphJson";
  }
}

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) {
    return dataUrl;
  }
  return dataUrl.slice(comma + 1);
}

function hasTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const maybeTauri = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return (
    maybeTauri.__TAURI_INTERNALS__ !== undefined ||
    maybeTauri.__TAURI__ !== undefined
  );
}

function browserStatus(
  runtime: DesktopRuntime = "browser",
): DesktopBridgeStatus {
  return {
    runtime,
    nativeAvailable: false,
    workspace: {
      id: "browser-workspace",
      label: "Browser workspace",
      runtime,
      lastOpenedAt: "1970-01-01T00:00:00.000Z",
    },
    capabilities: {
      nativeWorkspace: false,
      nativeSessionOpen: false,
      nativeSessionSave: false,
      nativeExports: false,
      unsavedChangePrompt: true,
    },
  };
}

function normalizeStatus(
  input: Partial<DesktopBridgeStatus>,
): DesktopBridgeStatus {
  const fallback = browserStatus("tauri");
  return {
    runtime: "tauri",
    nativeAvailable: input.nativeAvailable ?? true,
    workspace: {
      ...fallback.workspace,
      ...input.workspace,
      runtime: "tauri",
    },
    capabilities: {
      ...fallback.capabilities,
      nativeWorkspace: true,
      nativeSessionOpen: true,
      nativeSessionSave: true,
      nativeExports: true,
      ...input.capabilities,
    },
    message: stringOrUndefined(input.message),
  };
}

function normalizeOpenSessionResult(
  input: Partial<DesktopOpenSessionResult>,
): DesktopOpenSessionResult {
  return {
    ok: input.ok === true || typeof input.contents === "string",
    runtime: "tauri",
    contents: stringOrUndefined(input.contents),
    path: stringOrUndefined(input.path),
    message: stringOrUndefined(input.message),
  };
}

function normalizeBridgeResult(
  input: Partial<DesktopBridgeResult>,
  runtime: DesktopRuntime,
): DesktopBridgeResult {
  return {
    ok: input.ok === true || typeof input.path === "string",
    runtime,
    fallbackDownload: input.fallbackDownload === true,
    path: stringOrUndefined(input.path),
    message: stringOrUndefined(input.message),
  };
}

function nativeErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Native desktop bridge unavailable: ${detail}`;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}
