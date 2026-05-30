# Native Desktop UX

CoxeterViewer5D is a web viewer first and a native desktop wrapper second. The
desktop app should feel like the same mathematical cockpit with a few local-file
conveniences, not like a separate research runtime.

## Workspace Layout

The normal workspace is the repository root:

- `src/` contains the React app, mathematical data pipeline, and renderer-facing
  TypeScript.
- `public/examples/` contains bundled Coxeter-system and quotient examples.
- `docs/` contains the mathematical, UX, tooling, release, and reference notes.
- `scripts/` contains exact-export contracts, external-tool launchers,
  certificates, validation, benchmarks, and release reports.
- `src-tauri/` contains the optional Tauri v2 shell. It may read or write
  `.coxeter-session.json` files, but it must not add desktop-only mathematical
  import paths.
- `.devcontainer/` is the light app container. `.researchcontainer/` is the
  heavier exact-tool container for Sage, GAP/KBMAG, and CoxIter work.

Do not put generated exact-tool outputs in the desktop wrapper. Generated graph
JSON, quotient artifacts, and certificates should keep using the shared import
and validation contracts.

## Running And Packaging

Use the web app for ordinary development:

```bash
corepack pnpm dev
```

Use the desktop shell when testing native menus, local session files, fullscreen,
or packaging:

```bash
corepack pnpm desktop:dev
corepack pnpm desktop:build
```

`desktop:dev` opens a Tauri window backed by the Vite dev server. `desktop:build`
creates an unsigned local bundle under `src-tauri/target/release/`. Bundle
outputs are not committed. A public executable should be published through a
GitHub Release with release notes, validation status, and signing/updater status
made explicit.

## Controls

The desktop shell should expose the same keyboard behavior as the web app.
Core movement and inspection controls are:

- Orbit/trackpad/mouse drag for camera motion.
- `W`, `A`, `S`, `D` for directional camera nudging in the active view.
  Forward/back movement is tuned for inspection rather than travel, and
  left/right strafing is intentionally gentler than forward/back movement.
- Light/dark mode for the shell and scene background.
- Viewer-only mode for hiding the side rails and header strip while keeping a
  small `Show UI` button over the canvas.
- Fullscreen from the desktop menu uses the native Tauri window fullscreen API
  when available. Browser fullscreen remains the web fallback.
- Reset view, focus selected object, toggle labels, toggle rank-two cells,
  increase/decrease radius, and switch mode through the same app actions used
  by browser shortcuts.

WASD is a camera/navigation convention only. It must not change Coxeter words,
selected generators, quotient cocycles, or generated graph data.

On desktop-size windows the viewer remains in place while the left and right
rails scroll independently. If a control panel forces the user to scroll the
geometric object out of view, that is a layout regression.

## Native File Behavior

The Tauri shell currently owns only narrow local session-file operations:

- Read `.coxeter-session.json`.
- Write `.coxeter-session.json`.

Mathematical JSON imports still pass through the browser-side validators. A
desktop import dialog may choose a file path, but validation, warnings,
approximation labels, and certificate boundaries stay the same as the web app.

## External Tool Jobs

Sage, GAP/KBMAG, CoxIter, polymake, Regina, and similar tools are external jobs.
The desktop app may help launch or inspect job artifacts in a later milestone,
but the release contract is:

- External tools emit JSON or certificate artifacts through `scripts/`.
- Every artifact records tool id, command shape, input hash, output hash, and
  claim boundary.
- Missing tools report `skipped`, `missing-runtime`, `missing-kbmag`, or another
  explicit status. Missing tools must not be silently replaced by weaker claims.

The browser and desktop shells consume validated artifacts. They do not become
Sage, GAP, KBMAG, or CoxIter front ends.

## Diagnostics

Diagnostics are part of the product surface:

- Generation warnings explain caps, rounded matrix keys, clipped cells, and
  unavailable exact backends.
- Geometry diagnostics distinguish certified source transcription, numerical
  normals, interval checks, and 3D projection.
- Quotient/game diagnostics distinguish in-repo finite checks from external
  subgroup/coset certificates.
- Release diagnostics report build readiness, bundle files, signing status, and
  updater status in deterministic JSON.

Desktop UI should show diagnostic summaries without requiring the user to read a
terminal log, but the terminal JSON remains the release/debugging source of
truth.

## Signing And Updater Reality

Unsigned local desktop builds are allowed. `pnpm release:desktop` must not fail
only because signing or updater environment variables are absent.

Current release reporting:

- `releaseOperations.codeSigning.status` is `configured` when the platform
  signing environment is present and `skipped` otherwise.
- `releaseOperations.updater.status` is `configured` only when
  `TAURI_SIGNING_PRIVATE_KEY` is present. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  is reported as optional.
- A skipped updater means no signed updater artifact was prepared. It does not
  mean the unsigned local bundle failed.

Publishing a real auto-updating desktop release still needs a maintainer-owned
endpoint, platform signing credentials, updater signing keys, and release
channel policy. None of those should be implied by a local bundle build.
