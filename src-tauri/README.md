# CoxeterViewer5D Desktop Contract

This directory is an optional Tauri v2 desktop wrapper. The Rust crate exposes a
narrow native command surface for local sessions and diagnostics:

- `read_project_session(path)`
- `write_project_session(path, contents)`
- `open_workspace(path)`
- `read_workspace_session(workspacePath)`
- `write_workspace_session(workspacePath, contents)`
- `read_desktop_settings()` / `write_desktop_settings({ contents })`
- `detect_tools()` / `collect_diagnostics()`
- `enqueue_desktop_job({ kind, workspacePath? })`
- `read_desktop_log()` / `append_desktop_log({ level, message })`
- `export_text_file({ path, contents, kind, overwrite })`
- `reveal_path(path)`

Session commands only accept files named `.coxeter-session.json`, and workspace
session commands keep that path inside the selected workspace. Export commands
are extension-checked by kind. The job queue only accepts controlled jobs:
`detectTools`, `collectDiagnostics`, and `validateWorkspace`; there is no
arbitrary shell runner.

The app menu is installed by Rust and emits `desktop-menu-command` events with a
typed command payload. Background jobs emit `desktop-job-updated`.

Run the desktop shell from the repository root:

```bash
corepack pnpm desktop:dev
```

Build an unsigned local bundle:

```bash
corepack pnpm desktop:build
```

Tauri writes local release output under `src-tauri/target/release/` and bundle
artifacts under `src-tauri/target/release/bundle/`. Those files are ignored by
git. Public users should receive executables from GitHub Releases, not from a
source checkout.

`corepack pnpm release:desktop` calls `scripts/release_desktop.mjs`. The script
exits successfully with `status: "skipped"` when an optional prerequisite is
absent, and it always reports `releaseOperations.codeSigning` and
`releaseOperations.updater`. Missing signing or updater environment variables
are an explicit skip, not a failed unsigned local build.

The web app remains the source of truth. Desktop builds should use the same
`dist` output created by `corepack pnpm build`, and session files should keep
using `.coxeter-session.json`.

Native UX expectations live in `docs/desktop-ux.md`: the desktop wrapper should
keep the browser controls, including WASD camera nudging, and should treat Sage,
GAP/KBMAG, CoxIter, and similar tools as external jobs that emit validated
artifacts through `scripts/`.
