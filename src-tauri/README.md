# CoxeterViewer5D Desktop Contract

This directory is an optional Tauri v2 desktop wrapper. The Rust crate is present
and exposes narrow local session-file commands:

- `read_project_session(path)`
- `write_project_session(path, contents)`

Both commands only accept files named `.coxeter-session.json`. Mathematical JSON
imports still go through the same browser-side validators as the web app.

`npm run release:desktop` / `pnpm release:desktop` calls
`scripts/release_desktop.mjs`. Until a maintainer opts into the desktop CLI
dependency, the script exits successfully with `status: "skipped"` and a clear
reason such as `missing-tauri-cli-dependency`.

The web app remains the source of truth. Desktop builds should use the same
`dist` output created by `pnpm build`, and session files should keep using
`.coxeter-session.json`.
