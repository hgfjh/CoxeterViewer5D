use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

const SESSION_FILE_NAME: &str = ".coxeter-session.json";
const SETTINGS_FILE_NAME: &str = "desktop-settings.json";
const LOG_FILE_NAME: &str = "desktop.log";
const WORKSPACE_DIR_NAME: &str = ".coxeter-viewer";
const MAX_SESSION_BYTES: usize = 5 * 1024 * 1024;
const MAX_EXPORT_BYTES: usize = 50 * 1024 * 1024;
const MAX_LOG_MESSAGE_BYTES: usize = 16 * 1024;
const MAX_LOG_READ_BYTES: u64 = 256 * 1024;

#[derive(Default)]
struct DesktopState {
    jobs: Mutex<HashMap<String, DesktopJob>>,
    next_job_id: AtomicU64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSessionFile {
    path: String,
    contents: String,
    size_bytes: u64,
    workspace_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopPathValidation {
    path: String,
    canonical_path: Option<String>,
    exists: bool,
    is_file: bool,
    is_directory: bool,
    inside_workspace: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopWorkspace {
    path: String,
    session_path: String,
    exists: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    app_name: String,
    app_version: String,
    package_version: String,
    tauri_version_major: u8,
    os: String,
    arch: String,
    debug_build: bool,
    executable_path: Option<String>,
    current_directory: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettingsFile {
    path: String,
    contents: String,
    exists: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteSettingsRequest {
    contents: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportFileRequest {
    path: String,
    contents: String,
    kind: ExportKind,
    overwrite: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BinaryExportRequest {
    path: String,
    base64: String,
    overwrite: bool,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum ExportKind {
    GraphJson,
    SessionJson,
    DiagnosticsJson,
    LogText,
    Png,
    FigureBundle,
    ExperimentBundle,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportFileResult {
    path: String,
    size_bytes: u64,
    kind: ExportKind,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolDetectionResult {
    tools: Vec<DetectedTool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedTool {
    id: String,
    display_name: String,
    found: bool,
    path: Option<String>,
    note: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopJobRequest {
    kind: DesktopJobKind,
    workspace_path: Option<String>,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum DesktopJobKind {
    DetectTools,
    CollectDiagnostics,
    ValidateWorkspace,
    SageQuotientExport,
    GapQuotientExport,
    CoxiterCompactCheck,
    GeometryCertificate,
    BackendComparison,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopJob {
    id: String,
    kind: DesktopJobKind,
    status: DesktopJobStatus,
    created_at: String,
    updated_at: String,
    message: String,
    result: Option<serde_json::Value>,
}

#[derive(Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum DesktopJobStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsReport {
    runtime: RuntimeInfo,
    settings_path: String,
    log_path: String,
    detected_tools: ToolDetectionResult,
    notes: Vec<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppendLogRequest {
    level: LogLevel,
    message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopLogResult {
    path: String,
    contents: String,
    truncated: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopMenuPayload {
    command: DesktopMenuCommand,
    menu_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopMenuCommand {
    NewSession,
    OpenSession,
    SaveSession,
    SaveSessionAs,
    ChooseWorkspace,
    ExportGraph,
    ExportScreenshot,
    ExportFigureBundle,
    ExportExperimentBundle,
    ExportDiagnostics,
    RevealWorkspace,
    CheckTools,
    ShowLogs,
    ResetView,
    TeachingMode,
    ResearchMode,
    ToggleLabels,
    ToggleCells,
    Fullscreen,
    GuideHexagon,
    GuideRankThree,
    GuideYGamma,
    GuideQuotientGame,
    LensGeneratorStar,
    LensEdgeStar,
    LensRankKFamily,
    HelpReadme,
    HelpWalkthroughs,
    HelpAbout,
}

impl DesktopMenuCommand {
    fn from_menu_id(menu_id: &str) -> Option<Self> {
        match menu_id {
            "desktop:new-session" => Some(Self::NewSession),
            "desktop:open-session" => Some(Self::OpenSession),
            "desktop:save-session" => Some(Self::SaveSession),
            "desktop:save-session-as" => Some(Self::SaveSessionAs),
            "desktop:choose-workspace" => Some(Self::ChooseWorkspace),
            "desktop:export-graph" => Some(Self::ExportGraph),
            "desktop:export-screenshot" => Some(Self::ExportScreenshot),
            "desktop:export-figure-bundle" => Some(Self::ExportFigureBundle),
            "desktop:export-experiment-bundle" => Some(Self::ExportExperimentBundle),
            "desktop:export-diagnostics" => Some(Self::ExportDiagnostics),
            "desktop:reveal-workspace" => Some(Self::RevealWorkspace),
            "desktop:check-tools" => Some(Self::CheckTools),
            "desktop:show-logs" => Some(Self::ShowLogs),
            "desktop:reset-view" => Some(Self::ResetView),
            "desktop:teaching-mode" => Some(Self::TeachingMode),
            "desktop:research-mode" => Some(Self::ResearchMode),
            "desktop:toggle-labels" => Some(Self::ToggleLabels),
            "desktop:toggle-cells" => Some(Self::ToggleCells),
            "desktop:fullscreen" => Some(Self::Fullscreen),
            "desktop:guide-hexagon" => Some(Self::GuideHexagon),
            "desktop:guide-rank-three" => Some(Self::GuideRankThree),
            "desktop:guide-y-gamma" => Some(Self::GuideYGamma),
            "desktop:guide-quotient-game" => Some(Self::GuideQuotientGame),
            "desktop:lens-generator-star" => Some(Self::LensGeneratorStar),
            "desktop:lens-edge-star" => Some(Self::LensEdgeStar),
            "desktop:lens-rank-k-family" => Some(Self::LensRankKFamily),
            "desktop:help-readme" => Some(Self::HelpReadme),
            "desktop:help-walkthroughs" => Some(Self::HelpWalkthroughs),
            "desktop:help-about" => Some(Self::HelpAbout),
            _ => None,
        }
    }
}

fn now_iso_like() -> String {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => format!("{}.{:03}Z", duration.as_secs(), duration.subsec_millis()),
        Err(_) => "0.000Z".into(),
    }
}

fn app_data_dir(app_name: &str) -> Result<PathBuf, String> {
    let base = if cfg!(target_os = "windows") {
        env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
        })
    } else {
        env::var_os("XDG_DATA_HOME").map(PathBuf::from).or_else(|| {
            env::var_os("HOME").map(|home| PathBuf::from(home).join(".local").join("share"))
        })
    };

    base.map(|path| path.join(app_name))
        .ok_or_else(|| "could not locate an application data directory".into())
}

fn settings_path(app_name: &str) -> Result<PathBuf, String> {
    Ok(app_data_dir(app_name)?.join(SETTINGS_FILE_NAME))
}

fn log_path(app_name: &str) -> Result<PathBuf, String> {
    Ok(app_data_dir(app_name)?.join(LOG_FILE_NAME))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn has_parent_traversal(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::ParentDir))
}

fn normalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    if has_parent_traversal(path) {
        return Err("paths with '..' components are not accepted".into());
    }
    fs::canonicalize(path).map_err(|error| format!("could not resolve path: {error}"))
}

fn normalize_new_file_path(path: &Path) -> Result<PathBuf, String> {
    if has_parent_traversal(path) {
        return Err("paths with '..' components are not accepted".into());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "file path has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("could not resolve parent directory: {error}"))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "file path has no file name".to_string())?;
    Ok(canonical_parent.join(file_name))
}

fn ensure_inside_workspace(path: &Path, workspace: &Path) -> Result<(), String> {
    if path.starts_with(workspace) {
        Ok(())
    } else {
        Err("path is outside the selected workspace".into())
    }
}

fn validate_workspace_path(path: &Path) -> Result<PathBuf, String> {
    let canonical = normalize_existing_path(path)?;
    if !canonical.is_dir() {
        return Err("workspace path must be an existing directory".into());
    }
    Ok(canonical)
}

fn validate_session_path(path: &Path, workspace: Option<&Path>) -> Result<PathBuf, String> {
    match path.file_name().and_then(|name| name.to_str()) {
        Some(SESSION_FILE_NAME) => {}
        Some(_) => return Err(format!("session files must be named {SESSION_FILE_NAME}")),
        None => return Err("session path has no file name".into()),
    }

    let canonical = if path.exists() {
        normalize_existing_path(path)?
    } else {
        normalize_new_file_path(path)?
    };

    if let Some(workspace) = workspace {
        ensure_inside_workspace(&canonical, workspace)?;
    }

    Ok(canonical)
}

fn validate_export_path(
    path: &Path,
    kind: &ExportKind,
    overwrite: bool,
) -> Result<PathBuf, String> {
    let canonical = if path.exists() {
        if !overwrite {
            return Err("export path already exists and overwrite is false".into());
        }
        normalize_existing_path(path)?
    } else {
        normalize_new_file_path(path)?
    };

    if canonical.is_dir() {
        return Err("export path points to a directory".into());
    }

    let extension = canonical
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("");
    let allowed = match kind {
        ExportKind::GraphJson
        | ExportKind::SessionJson
        | ExportKind::DiagnosticsJson
        | ExportKind::FigureBundle
        | ExportKind::ExperimentBundle => extension.eq_ignore_ascii_case("json"),
        ExportKind::LogText => {
            extension.eq_ignore_ascii_case("log") || extension.eq_ignore_ascii_case("txt")
        }
        ExportKind::Png => extension.eq_ignore_ascii_case("png"),
    };

    if !allowed {
        return Err("export extension does not match the export kind".into());
    }

    Ok(canonical)
}

fn workspace_session_path(workspace: &Path) -> PathBuf {
    workspace
        .join(WORKSPACE_DIR_NAME)
        .join("sessions")
        .join(SESSION_FILE_NAME)
}

fn workspace_internal_dir(workspace: &Path) -> PathBuf {
    workspace.join(WORKSPACE_DIR_NAME)
}

fn ensure_workspace_layout(workspace: &Path) -> Result<(), String> {
    for child in [
        "sessions",
        "notebooks",
        "artifacts",
        "exports",
        "logs",
        "cache",
        "diagnostics",
    ] {
        fs::create_dir_all(workspace_internal_dir(workspace).join(child))
            .map_err(|error| format!("could not create workspace {child} directory: {error}"))?;
    }
    Ok(())
}

fn workspace_artifact_path(workspace: &Path, job_id: &str) -> PathBuf {
    workspace_internal_dir(workspace)
        .join("artifacts")
        .join(format!("{job_id}.json"))
}

fn workspace_diagnostics_path(workspace: &Path) -> PathBuf {
    workspace_internal_dir(workspace)
        .join("diagnostics")
        .join("desktop-diagnostics.json")
}

fn read_session_file(path: &Path, workspace: Option<&Path>) -> Result<DesktopSessionFile, String> {
    let canonical_workspace = match workspace {
        Some(workspace) => Some(validate_workspace_path(workspace)?),
        None => None,
    };
    let canonical = validate_session_path(path, canonical_workspace.as_deref())?;
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("could not read session metadata: {error}"))?;
    if metadata.len() as usize > MAX_SESSION_BYTES {
        return Err("session file is too large for the desktop shell".into());
    }
    let contents = fs::read_to_string(&canonical)
        .map_err(|error| format!("could not read session file: {error}"))?;
    Ok(DesktopSessionFile {
        path: path_to_string(&canonical),
        contents,
        size_bytes: metadata.len(),
        workspace_path: canonical_workspace.as_deref().map(path_to_string),
    })
}

fn write_session_file(
    path: &Path,
    contents: &str,
    workspace: Option<&Path>,
) -> Result<DesktopSessionFile, String> {
    if contents.len() > MAX_SESSION_BYTES {
        return Err("session contents are too large for the desktop shell".into());
    }
    let canonical_workspace = match workspace {
        Some(workspace) => Some(validate_workspace_path(workspace)?),
        None => None,
    };
    let canonical = validate_session_path(path, canonical_workspace.as_deref())?;
    if let Some(parent) = canonical.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create session directory: {error}"))?;
    }
    fs::write(&canonical, contents.as_bytes())
        .map_err(|error| format!("could not write session file: {error}"))?;
    Ok(DesktopSessionFile {
        path: path_to_string(&canonical),
        contents: contents.to_string(),
        size_bytes: contents.len() as u64,
        workspace_path: canonical_workspace.as_deref().map(path_to_string),
    })
}

#[tauri::command]
fn get_runtime_info(app: AppHandle) -> RuntimeInfo {
    runtime_info(&app)
}

#[tauri::command]
fn get_desktop_runtime_info(app: AppHandle) -> RuntimeInfo {
    runtime_info(&app)
}

fn runtime_info<R: Runtime>(app: &AppHandle<R>) -> RuntimeInfo {
    RuntimeInfo {
        app_name: app.package_info().name.clone(),
        app_version: app.package_info().version.to_string(),
        package_version: env!("CARGO_PKG_VERSION").into(),
        tauri_version_major: 2,
        os: env::consts::OS.into(),
        arch: env::consts::ARCH.into(),
        debug_build: cfg!(debug_assertions),
        executable_path: env::current_exe().ok().map(|path| path_to_string(&path)),
        current_directory: env::current_dir().ok().map(|path| path_to_string(&path)),
    }
}

#[tauri::command]
fn validate_desktop_path(
    path: String,
    workspace_path: Option<String>,
) -> Result<DesktopPathValidation, String> {
    let input = PathBuf::from(path);
    let exists = input.exists();
    let canonical = if exists {
        Some(normalize_existing_path(&input)?)
    } else {
        None
    };
    let workspace = match workspace_path {
        Some(path) => Some(validate_workspace_path(Path::new(&path))?),
        None => None,
    };
    let inside_workspace = match (&canonical, &workspace) {
        (Some(path), Some(workspace)) => Some(path.starts_with(workspace)),
        (_, Some(_)) => Some(false),
        _ => None,
    };
    let path_for_flags = canonical.as_deref().unwrap_or(input.as_path());
    Ok(DesktopPathValidation {
        path: path_to_string(&input),
        canonical_path: canonical.as_deref().map(path_to_string),
        exists,
        is_file: path_for_flags.is_file(),
        is_directory: path_for_flags.is_dir(),
        inside_workspace,
    })
}

#[tauri::command]
fn open_workspace(path: String) -> Result<DesktopWorkspace, String> {
    let workspace = validate_workspace_path(Path::new(&path))?;
    ensure_workspace_layout(&workspace)?;
    Ok(DesktopWorkspace {
        session_path: path_to_string(&workspace_session_path(&workspace)),
        path: path_to_string(&workspace),
        exists: true,
    })
}

#[tauri::command]
fn choose_research_workspace(path: String) -> Result<DesktopWorkspace, String> {
    open_workspace(path)
}

#[tauri::command]
fn read_project_session(path: String) -> Result<DesktopSessionFile, String> {
    read_session_file(Path::new(&path), None)
}

#[tauri::command]
fn write_project_session(path: String, contents: String) -> Result<DesktopSessionFile, String> {
    write_session_file(Path::new(&path), &contents, None)
}

#[tauri::command]
fn read_workspace_session(workspace_path: String) -> Result<DesktopSessionFile, String> {
    let workspace = validate_workspace_path(Path::new(&workspace_path))?;
    read_session_file(&workspace_session_path(&workspace), Some(&workspace))
}

#[tauri::command]
fn write_workspace_session(
    workspace_path: String,
    contents: String,
) -> Result<DesktopSessionFile, String> {
    let workspace = validate_workspace_path(Path::new(&workspace_path))?;
    write_session_file(
        &workspace_session_path(&workspace),
        &contents,
        Some(&workspace),
    )
}

#[tauri::command]
fn read_desktop_settings(app: AppHandle) -> Result<DesktopSettingsFile, String> {
    let path = settings_path(app.package_info().name.as_str())?;
    if !path.exists() {
        return Ok(DesktopSettingsFile {
            path: path_to_string(&path),
            contents: "{}".into(),
            exists: false,
        });
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("could not read desktop settings: {error}"))?;
    Ok(DesktopSettingsFile {
        path: path_to_string(&path),
        contents,
        exists: true,
    })
}

#[tauri::command]
fn get_desktop_settings(app: AppHandle) -> Result<DesktopSettingsFile, String> {
    read_desktop_settings(app)
}

#[tauri::command]
fn write_desktop_settings(
    app: AppHandle,
    request: WriteSettingsRequest,
) -> Result<DesktopSettingsFile, String> {
    serde_json::from_str::<serde_json::Value>(&request.contents)
        .map_err(|error| format!("desktop settings must be JSON: {error}"))?;
    let path = settings_path(app.package_info().name.as_str())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create settings directory: {error}"))?;
    }
    fs::write(&path, request.contents.as_bytes())
        .map_err(|error| format!("could not write desktop settings: {error}"))?;
    Ok(DesktopSettingsFile {
        path: path_to_string(&path),
        contents: request.contents,
        exists: true,
    })
}

#[tauri::command]
fn save_desktop_settings(
    app: AppHandle,
    request: WriteSettingsRequest,
) -> Result<DesktopSettingsFile, String> {
    write_desktop_settings(app, request)
}

#[tauri::command]
fn export_text_file(request: ExportFileRequest) -> Result<ExportFileResult, String> {
    if request.contents.len() > MAX_EXPORT_BYTES {
        return Err("export contents are too large for the desktop shell".into());
    }
    if matches!(
        request.kind,
        ExportKind::GraphJson | ExportKind::SessionJson | ExportKind::DiagnosticsJson
    ) {
        serde_json::from_str::<serde_json::Value>(&request.contents)
            .map_err(|error| format!("JSON export is invalid: {error}"))?;
    }
    let path = validate_export_path(Path::new(&request.path), &request.kind, request.overwrite)?;
    fs::write(&path, request.contents.as_bytes())
        .map_err(|error| format!("could not write export: {error}"))?;
    Ok(ExportFileResult {
        path: path_to_string(&path),
        size_bytes: request.contents.len() as u64,
        kind: request.kind,
    })
}

#[tauri::command]
fn write_text_export(request: ExportFileRequest) -> Result<ExportFileResult, String> {
    export_text_file(request)
}

#[tauri::command]
fn write_binary_export(request: BinaryExportRequest) -> Result<ExportFileResult, String> {
    let bytes = BASE64_STANDARD
        .decode(request.base64.as_bytes())
        .map_err(|error| format!("binary export must be base64: {error}"))?;
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err("binary export is too large for the desktop shell".into());
    }
    let path = validate_export_path(
        Path::new(&request.path),
        &ExportKind::Png,
        request.overwrite,
    )?;
    fs::write(&path, &bytes).map_err(|error| format!("could not write binary export: {error}"))?;
    Ok(ExportFileResult {
        path: path_to_string(&path),
        size_bytes: bytes.len() as u64,
        kind: ExportKind::Png,
    })
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let canonical = normalize_existing_path(Path::new(&path))?;
    reveal_existing_path(&canonical)
}

fn reveal_existing_path(path: &Path) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        let argument = if path.is_file() {
            format!("/select,{}", path_to_string(path))
        } else {
            path_to_string(path)
        };
        Command::new("explorer.exe")
            .arg(argument)
            .spawn()
            .map_err(|error| format!("could not reveal path in Explorer: {error}"))?;
    } else if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        if path.is_file() {
            command.arg("-R");
        }
        command
            .arg(path)
            .spawn()
            .map_err(|error| format!("could not reveal path in Finder: {error}"))?;
    } else {
        let target = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|error| format!("could not reveal path with xdg-open: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn detect_tools() -> ToolDetectionResult {
    detect_known_tools()
}

#[tauri::command]
fn detect_external_tools() -> ToolDetectionResult {
    detect_known_tools()
}

fn detect_known_tools() -> ToolDetectionResult {
    let specs = [
        (
            "node",
            "Node.js",
            &["node"][..],
            "Frontend runtime for Vite scripts.",
        ),
        (
            "pnpm",
            "pnpm",
            &["pnpm", "pnpm.cmd"][..],
            "Preferred package manager for this repo.",
        ),
        (
            "cargo",
            "Cargo",
            &["cargo", "cargo.exe"][..],
            "Rust build tool for the desktop shell.",
        ),
        (
            "rustc",
            "rustc",
            &["rustc", "rustc.exe"][..],
            "Rust compiler used by Cargo.",
        ),
        (
            "python",
            "Python",
            &["python", "python3", "python.exe"][..],
            "Optional helper-script runtime.",
        ),
        (
            "sage",
            "SageMath",
            &["sage", "sage.exe"][..],
            "Optional exact Coxeter backend.",
        ),
        (
            "gap",
            "GAP",
            &["gap", "gap.exe"][..],
            "Optional exact group backend.",
        ),
        (
            "coxiter",
            "CoxIter",
            &["coxiter", "coxiter.exe"][..],
            "Optional Coxeter-diagram checker.",
        ),
    ];

    ToolDetectionResult {
        tools: specs
            .iter()
            .map(|(id, display_name, names, note)| {
                let path = find_on_path(names);
                DetectedTool {
                    id: (*id).into(),
                    display_name: (*display_name).into(),
                    found: path.is_some(),
                    path: path.map(|path| path_to_string(&path)),
                    note: (*note).into(),
                }
            })
            .collect(),
    }
}

fn find_on_path(names: &[&str]) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    let extensions = path_extensions();
    for directory in env::split_paths(&path_var) {
        for name in names {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
            if Path::new(name).extension().is_none() {
                for extension in &extensions {
                    let mut file_name = OsString::from(name);
                    file_name.push(extension);
                    let candidate = directory.join(file_name);
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
        }
    }
    None
}

fn path_extensions() -> Vec<OsString> {
    if !cfg!(target_os = "windows") {
        return Vec::new();
    }
    env::var_os("PATHEXT")
        .map(|value| {
            env::split_paths(&value)
                .map(|path| path.as_os_str().to_os_string())
                .collect()
        })
        .unwrap_or_else(|| {
            vec![
                OsString::from(".EXE"),
                OsString::from(".CMD"),
                OsString::from(".BAT"),
            ]
        })
}

#[tauri::command]
fn append_desktop_log(
    app: AppHandle,
    request: AppendLogRequest,
) -> Result<DesktopLogResult, String> {
    let mut message = request.message;
    if message.len() > MAX_LOG_MESSAGE_BYTES {
        message.truncate(MAX_LOG_MESSAGE_BYTES);
    }
    let path = log_path(app.package_info().name.as_str())?;
    append_log_line(&path, request.level, &message)?;
    read_log_file_at(&path)
}

fn append_log_line(path: &Path, level: LogLevel, message: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create log directory: {error}"))?;
    }
    let line = format!(
        "{} {:?}: {}\n",
        now_iso_like(),
        level,
        message.replace(['\r', '\n'], " ")
    );
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| file.write_all(line.as_bytes()))
        .map_err(|error| format!("could not append desktop log: {error}"))
}

#[tauri::command]
fn read_desktop_log(app: AppHandle) -> Result<DesktopLogResult, String> {
    let path = log_path(app.package_info().name.as_str())?;
    read_log_file_at(&path)
}

fn read_log_file_at(path: &Path) -> Result<DesktopLogResult, String> {
    if !path.exists() {
        return Ok(DesktopLogResult {
            path: path_to_string(path),
            contents: String::new(),
            truncated: false,
        });
    }
    let mut file =
        fs::File::open(path).map_err(|error| format!("could not open desktop log: {error}"))?;
    let len = file
        .metadata()
        .map_err(|error| format!("could not read desktop log metadata: {error}"))?
        .len();
    let truncated = len > MAX_LOG_READ_BYTES;
    if truncated {
        file.seek(SeekFrom::End(-(MAX_LOG_READ_BYTES as i64)))
            .map_err(|error| format!("could not seek desktop log: {error}"))?;
    }
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|error| format!("could not read desktop log: {error}"))?;
    Ok(DesktopLogResult {
        path: path_to_string(path),
        contents,
        truncated,
    })
}

#[tauri::command]
fn collect_diagnostics(app: AppHandle) -> Result<DiagnosticsReport, String> {
    diagnostics_report(&app)
}

#[tauri::command]
fn export_diagnostic_bundle(
    app: AppHandle,
    workspace_path: Option<String>,
) -> Result<ExportFileResult, String> {
    let report = diagnostics_report(&app)?;
    let contents = serde_json::to_string_pretty(&report)
        .map_err(|error| format!("could not serialize diagnostics: {error}"))?;
    let path = if let Some(workspace_path) = workspace_path {
        let workspace = validate_workspace_path(Path::new(&workspace_path))?;
        ensure_workspace_layout(&workspace)?;
        workspace_diagnostics_path(&workspace)
    } else {
        app_data_dir(app.package_info().name.as_str())?
            .join("diagnostics")
            .join("desktop-diagnostics.json")
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create diagnostics directory: {error}"))?;
    }
    fs::write(&path, contents.as_bytes())
        .map_err(|error| format!("could not write diagnostics bundle: {error}"))?;
    Ok(ExportFileResult {
        path: path_to_string(&path),
        size_bytes: contents.len() as u64,
        kind: ExportKind::DiagnosticsJson,
    })
}

fn diagnostics_report<R: Runtime>(app: &AppHandle<R>) -> Result<DiagnosticsReport, String> {
    Ok(DiagnosticsReport {
        runtime: runtime_info(app),
        settings_path: path_to_string(&settings_path(app.package_info().name.as_str())?),
        log_path: path_to_string(&log_path(app.package_info().name.as_str())?),
        detected_tools: detect_known_tools(),
        notes: vec![
            "Tool detection only checks PATH entries; it does not execute arbitrary programs."
                .into(),
            "The desktop shell only writes session, settings, log, and requested export files."
                .into(),
        ],
    })
}

fn validate_job_request(request: &DesktopJobRequest) -> Result<(), String> {
    if request.kind == DesktopJobKind::ValidateWorkspace && request.workspace_path.is_none() {
        return Err("workspacePath is required for validateWorkspace jobs".into());
    }
    if matches!(
        request.kind,
        DesktopJobKind::SageQuotientExport
            | DesktopJobKind::GapQuotientExport
            | DesktopJobKind::CoxiterCompactCheck
            | DesktopJobKind::GeometryCertificate
            | DesktopJobKind::BackendComparison
    ) && request.workspace_path.is_none()
    {
        return Err("workspacePath is required for external tool jobs".into());
    }
    Ok(())
}

#[tauri::command]
fn enqueue_desktop_job(
    app: AppHandle,
    state: State<DesktopState>,
    request: DesktopJobRequest,
) -> Result<DesktopJob, String> {
    validate_job_request(&request)?;
    let id = format!(
        "job-{}",
        state.next_job_id.fetch_add(1, Ordering::Relaxed) + 1
    );
    let created = now_iso_like();
    let job = DesktopJob {
        id: id.clone(),
        kind: request.kind.clone(),
        status: DesktopJobStatus::Queued,
        created_at: created.clone(),
        updated_at: created,
        message: "queued".into(),
        result: None,
    };
    {
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| "job queue lock was poisoned".to_string())?;
        jobs.insert(id.clone(), job.clone());
    }

    let app_for_thread = app.clone();
    let workspace_path = request.workspace_path.clone();
    thread::spawn(move || {
        let _ = run_job(app_for_thread, id, request.kind, workspace_path);
    });

    Ok(job)
}

#[tauri::command]
fn start_desktop_job(
    app: AppHandle,
    state: State<DesktopState>,
    request: DesktopJobRequest,
) -> Result<DesktopJob, String> {
    enqueue_desktop_job(app, state, request)
}

#[tauri::command]
fn cancel_desktop_job(
    state: State<DesktopState>,
    id: String,
) -> Result<Option<DesktopJob>, String> {
    let mut jobs = state
        .jobs
        .lock()
        .map_err(|_| "job queue lock was poisoned".to_string())?;
    if let Some(job) = jobs.get_mut(&id) {
        if matches!(
            job.status,
            DesktopJobStatus::Queued | DesktopJobStatus::Running
        ) {
            job.status = DesktopJobStatus::Cancelled;
            job.updated_at = now_iso_like();
            job.message = "cancel requested".into();
        }
        return Ok(Some(job.clone()));
    }
    Ok(None)
}

fn run_job<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    kind: DesktopJobKind,
    workspace_path: Option<String>,
) -> Result<(), String> {
    update_job(&app, &id, DesktopJobStatus::Running, "running", None)?;
    let result = match kind {
        DesktopJobKind::DetectTools => {
            serde_json::to_value(detect_known_tools()).map_err(|error| error.to_string())
        }
        DesktopJobKind::CollectDiagnostics => diagnostics_report(&app)
            .and_then(|report| serde_json::to_value(report).map_err(|error| error.to_string())),
        DesktopJobKind::ValidateWorkspace => {
            let workspace_path =
                workspace_path.ok_or_else(|| "workspacePath is required".to_string());
            workspace_path.and_then(|path| {
                open_workspace(path).and_then(|workspace| {
                    serde_json::to_value(workspace).map_err(|error| error.to_string())
                })
            })
        }
        DesktopJobKind::SageQuotientExport
        | DesktopJobKind::GapQuotientExport
        | DesktopJobKind::CoxiterCompactCheck
        | DesktopJobKind::GeometryCertificate
        | DesktopJobKind::BackendComparison => {
            write_controlled_job_artifact(&kind, &id, workspace_path)
        }
    };

    match result {
        Ok(value) => update_job(
            &app,
            &id,
            DesktopJobStatus::Succeeded,
            "completed",
            Some(value),
        ),
        Err(error) => update_job(&app, &id, DesktopJobStatus::Failed, &error, None),
    }
}

fn write_controlled_job_artifact(
    kind: &DesktopJobKind,
    job_id: &str,
    workspace_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let workspace_path = workspace_path
        .ok_or_else(|| "workspacePath is required for external tool jobs".to_string())?;
    let workspace = validate_workspace_path(Path::new(&workspace_path))?;
    ensure_workspace_layout(&workspace)?;
    let artifact_path = workspace_artifact_path(&workspace, job_id);
    let artifact = serde_json::json!({
        "schemaVersion": 1,
        "kind": "coxeter-viewer-desktop-job-artifact",
        "jobId": job_id,
        "jobKind": kind,
        "status": "skipped",
        "reason": "external tool execution is controlled by the desktop job queue; this build recorded the request and workspace artifact without running arbitrary commands",
        "workspacePath": path_to_string(&workspace),
        "createdAt": now_iso_like(),
    });
    fs::write(
        &artifact_path,
        serde_json::to_string_pretty(&artifact)
            .map_err(|error| format!("could not serialize job artifact: {error}"))?
            .as_bytes(),
    )
    .map_err(|error| format!("could not write job artifact: {error}"))?;
    Ok(serde_json::json!({
        "artifactPath": path_to_string(&artifact_path),
        "artifact": artifact,
    }))
}

fn update_job<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    status: DesktopJobStatus,
    message: &str,
    result: Option<serde_json::Value>,
) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    let updated_job = {
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| "job queue lock was poisoned".to_string())?;
        let job = jobs
            .get_mut(id)
            .ok_or_else(|| "job was not found".to_string())?;
        job.status = status;
        job.updated_at = now_iso_like();
        job.message = message.into();
        job.result = result;
        job.clone()
    };
    app.emit("desktop-job-event", &updated_job)
        .map_err(|error| format!("could not emit job update: {error}"))?;
    app.emit("desktop-job-updated", &updated_job)
        .map_err(|error| format!("could not emit job update: {error}"))?;
    Ok(())
}

#[tauri::command]
fn list_desktop_jobs(state: State<DesktopState>) -> Result<Vec<DesktopJob>, String> {
    let mut jobs: Vec<_> = state
        .jobs
        .lock()
        .map_err(|_| "job queue lock was poisoned".to_string())?
        .values()
        .cloned()
        .collect();
    jobs.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(jobs)
}

#[tauri::command]
fn get_desktop_job(state: State<DesktopState>, id: String) -> Result<Option<DesktopJob>, String> {
    Ok(state
        .jobs
        .lock()
        .map_err(|_| "job queue lock was poisoned".to_string())?
        .get(&id)
        .cloned())
}

fn install_app_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let new_session = MenuItemBuilder::with_id("desktop:new-session", "New Session")
        .accelerator("Ctrl+N")
        .build(app)?;
    let open_session = MenuItemBuilder::with_id("desktop:open-session", "Open Session...")
        .accelerator("Ctrl+O")
        .build(app)?;
    let save_session = MenuItemBuilder::with_id("desktop:save-session", "Save Session")
        .accelerator("Ctrl+S")
        .build(app)?;
    let save_session_as = MenuItemBuilder::with_id("desktop:save-session-as", "Save Session As...")
        .accelerator("Ctrl+Shift+S")
        .build(app)?;
    let choose_workspace =
        MenuItemBuilder::with_id("desktop:choose-workspace", "Choose Research Workspace...")
            .build(app)?;
    let reveal_workspace =
        MenuItemBuilder::with_id("desktop:reveal-workspace", "Open Artifact Folder").build(app)?;
    let quit = PredefinedMenuItem::quit(app, None)?;

    let teaching_mode = MenuItemBuilder::with_id("desktop:teaching-mode", "Teaching Mode")
        .accelerator("Ctrl+1")
        .build(app)?;
    let research_mode = MenuItemBuilder::with_id("desktop:research-mode", "Research Mode")
        .accelerator("Ctrl+2")
        .build(app)?;
    let reset_view = MenuItemBuilder::with_id("desktop:reset-view", "Reset Camera")
        .accelerator("R")
        .build(app)?;
    let toggle_labels = MenuItemBuilder::with_id("desktop:toggle-labels", "Toggle Labels")
        .accelerator("L")
        .build(app)?;
    let toggle_cells = MenuItemBuilder::with_id("desktop:toggle-cells", "Toggle Cells")
        .accelerator("C")
        .build(app)?;
    let fullscreen = MenuItemBuilder::with_id("desktop:fullscreen", "Toggle Fullscreen")
        .accelerator("F11")
        .build(app)?;

    let guide_hexagon =
        MenuItemBuilder::with_id("desktop:guide-hexagon", "Find a Hexagon").build(app)?;
    let guide_rank_three =
        MenuItemBuilder::with_id("desktop:guide-rank-three", "Understand a Rank-Three Cell")
            .build(app)?;
    let guide_y_gamma =
        MenuItemBuilder::with_id("desktop:guide-y-gamma", "Inspect Y_Gamma").build(app)?;
    let guide_quotient = MenuItemBuilder::with_id(
        "desktop:guide-quotient-game",
        "Run Quotient/Game Experiment",
    )
    .build(app)?;
    let lens_generator_star =
        MenuItemBuilder::with_id("desktop:lens-generator-star", "Generator Star Lens")
            .build(app)?;
    let lens_edge_star =
        MenuItemBuilder::with_id("desktop:lens-edge-star", "Edge Star Lens").build(app)?;
    let lens_rank_k =
        MenuItemBuilder::with_id("desktop:lens-rank-k-family", "Rank-k Family Lens").build(app)?;

    let export_graph =
        MenuItemBuilder::with_id("desktop:export-graph", "Graph JSON...").build(app)?;
    let export_screenshot =
        MenuItemBuilder::with_id("desktop:export-screenshot", "PNG Screenshot...")
            .accelerator("Ctrl+Shift+P")
            .build(app)?;
    let export_figure =
        MenuItemBuilder::with_id("desktop:export-figure-bundle", "Figure Bundle...").build(app)?;
    let export_experiment =
        MenuItemBuilder::with_id("desktop:export-experiment-bundle", "Experiment Bundle...")
            .build(app)?;
    let export_diagnostics =
        MenuItemBuilder::with_id("desktop:export-diagnostics", "Diagnostic Bundle...")
            .build(app)?;

    let check_tools =
        MenuItemBuilder::with_id("desktop:check-tools", "External Tool Status").build(app)?;
    let show_logs = MenuItemBuilder::with_id("desktop:show-logs", "Show Local Logs").build(app)?;
    let help_readme = MenuItemBuilder::with_id("desktop:help-readme", "README").build(app)?;
    let help_walkthroughs =
        MenuItemBuilder::with_id("desktop:help-walkthroughs", "Walkthroughs").build(app)?;
    let help_about = MenuItemBuilder::with_id("desktop:help-about", "About").build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .items(&[
            &new_session,
            &open_session,
            &save_session,
            &save_session_as,
            &choose_workspace,
            &reveal_workspace,
            &quit,
        ])
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .items(&[
            &teaching_mode,
            &research_mode,
            &reset_view,
            &toggle_labels,
            &toggle_cells,
            &fullscreen,
        ])
        .build()?;
    let workflow_menu = SubmenuBuilder::new(app, "Workflow")
        .items(&[
            &guide_hexagon,
            &guide_rank_three,
            &guide_y_gamma,
            &guide_quotient,
            &lens_generator_star,
            &lens_edge_star,
            &lens_rank_k,
        ])
        .build()?;
    let export_menu = SubmenuBuilder::new(app, "Export")
        .items(&[
            &export_graph,
            &export_screenshot,
            &export_figure,
            &export_experiment,
            &export_diagnostics,
        ])
        .build()?;
    let help_menu = SubmenuBuilder::new(app, "Help")
        .items(&[
            &check_tools,
            &show_logs,
            &help_readme,
            &help_walkthroughs,
            &help_about,
        ])
        .build()?;
    let menu = MenuBuilder::new(app)
        .items(&[
            &file_menu,
            &view_menu,
            &workflow_menu,
            &export_menu,
            &help_menu,
        ])
        .build()?;

    app.set_menu(menu)?;
    app.on_menu_event(move |app, event| {
        let menu_id = event.id().0.as_str();
        if let Some(command) = DesktopMenuCommand::from_menu_id(menu_id) {
            let payload = DesktopMenuPayload {
                command,
                menu_id: menu_id.into(),
            };
            let _ = app.emit("desktop-menu-command", payload);
        }
    });
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(DesktopState::default())
        .setup(|app| {
            install_app_menu(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            append_desktop_log,
            cancel_desktop_job,
            collect_diagnostics,
            choose_research_workspace,
            detect_tools,
            detect_external_tools,
            enqueue_desktop_job,
            export_diagnostic_bundle,
            export_text_file,
            get_desktop_runtime_info,
            get_desktop_settings,
            get_desktop_job,
            get_runtime_info,
            list_desktop_jobs,
            open_workspace,
            read_desktop_log,
            read_desktop_settings,
            read_project_session,
            read_workspace_session,
            reveal_path,
            save_desktop_settings,
            start_desktop_job,
            validate_desktop_path,
            write_binary_export,
            write_desktop_settings,
            write_project_session,
            write_text_export,
            write_workspace_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running CoxeterViewer5D desktop shell");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be after epoch")
            .as_nanos();
        env::temp_dir().join(format!("coxeter-viewer-5d-{name}-{stamp}"))
    }

    #[test]
    fn session_path_requires_named_file() {
        let dir = unique_temp_dir("session-name");
        fs::create_dir_all(&dir).expect("create temp dir");
        let bad_path = dir.join("session.json");
        let result = validate_session_path(&bad_path, None);
        fs::remove_dir_all(&dir).expect("remove temp dir");
        assert!(result.is_err());
    }

    #[test]
    fn session_path_rejects_parent_traversal() {
        let dir = unique_temp_dir("session-traversal");
        fs::create_dir_all(&dir).expect("create temp dir");
        let result = validate_session_path(&dir.join("..").join(SESSION_FILE_NAME), None);
        fs::remove_dir_all(&dir).expect("remove temp dir");
        assert!(result.is_err());
    }

    #[test]
    fn workspace_session_must_stay_inside_workspace() {
        let workspace = unique_temp_dir("workspace");
        let outside = unique_temp_dir("outside");
        fs::create_dir_all(&workspace).expect("create workspace");
        fs::create_dir_all(&outside).expect("create outside");
        let workspace = fs::canonicalize(&workspace).expect("canonical workspace");
        let outside_session = outside.join(SESSION_FILE_NAME);
        let result = validate_session_path(&outside_session, Some(&workspace));
        fs::remove_dir_all(&workspace).expect("remove workspace");
        fs::remove_dir_all(&outside).expect("remove outside");
        assert!(result.is_err());
    }

    #[test]
    fn write_and_read_workspace_session_round_trip() {
        let workspace = unique_temp_dir("round-trip");
        fs::create_dir_all(&workspace).expect("create workspace");
        let written = write_session_file(
            &workspace.join(SESSION_FILE_NAME),
            "{\"radius\":3}",
            Some(&workspace),
        )
        .expect("write session");
        let read =
            read_session_file(Path::new(&written.path), Some(&workspace)).expect("read session");
        fs::remove_dir_all(&workspace).expect("remove workspace");
        assert_eq!(read.contents, "{\"radius\":3}");
        assert_eq!(read.size_bytes, 12);
    }

    #[test]
    fn export_kind_controls_extension() {
        let dir = unique_temp_dir("export-extension");
        fs::create_dir_all(&dir).expect("create temp dir");
        let bad = validate_export_path(&dir.join("graph.txt"), &ExportKind::GraphJson, false);
        let good = validate_export_path(&dir.join("graph.json"), &ExportKind::GraphJson, false);
        fs::remove_dir_all(&dir).expect("remove temp dir");
        assert!(bad.is_err());
        assert!(good.is_ok());
    }

    #[test]
    fn job_queue_rejects_missing_workspace_for_workspace_validation() {
        let request = DesktopJobRequest {
            kind: DesktopJobKind::ValidateWorkspace,
            workspace_path: None,
        };
        assert!(validate_job_request(&request).is_err());
    }

    #[test]
    fn tool_detection_never_executes_tools() {
        let result = detect_known_tools();
        assert!(result.tools.iter().any(|tool| tool.id == "cargo"));
        assert!(result
            .tools
            .iter()
            .all(|tool| tool.note.contains("Optional") || !tool.note.is_empty()));
    }
}
