# Coxeter Viewer 5D

An offline-capable local web app for inspecting finite Coxeter Cayley balls,
Davis cells, hyperbolic chamber projections, the one-vertex base complex
`Y_Gamma`, and quotient/game diagnostics.

The app is an educational and research workflow tool, not a theorem prover. It
keeps exact data, numerical geometry, and drawing conventions visibly separate.

## Run The App From Source

These commands are for someone who has just cloned or downloaded the repository
from GitHub. They require Node.js with Corepack enabled; the repository pins
`pnpm@11.3.0` in `package.json`.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

If you already have a compatible `pnpm` installed globally, `pnpm dev` is fine.
The `corepack pnpm ...` form is the safest one for a fresh checkout.

Vite prints a local URL, usually `http://127.0.0.1:5173/`. Open that URL in a
browser. The viewer is offline after dependencies are installed; bundled
examples and ordinary JSON imports do not need Sage, GAP, KBMAG, or CoxIter.

For a production-style web build:

```bash
corepack pnpm build
corepack pnpm preview
```

`build` writes static files to `dist/`. The `preview` command serves that build
locally so you can check what a web release will look like.

## Run The Desktop App From Source

The desktop app is a Tauri v2 wrapper around the same web viewer. It is useful
for native windows, local session files, desktop menus, and packaging tests; it
does not change the mathematical model.

Desktop development needs the web dependencies above plus Rust and the normal
Tauri platform prerequisites for your operating system. On Windows, WebView2 is
also required; most current Windows installations already include it.

```bash
corepack pnpm desktop:dev
```

That starts the Vite dev server and opens the Tauri window.

To make an unsigned local desktop bundle:

```bash
corepack pnpm desktop:build
```

Tauri writes platform-specific output under `src-tauri/target/release/`; bundled
installers and app packages live under `src-tauri/target/release/bundle/`.

## Is There A One-Click Executable?

Not from the source tree itself. Source checkouts are meant for developers and
researchers who can run the commands above.

For a public release, the maintainer should attach built desktop artifacts to a
GitHub Release. Until those artifacts are published, there is no installer or
portable executable that other people can simply double-click. Unsigned local
desktop builds are supported for testing, but a polished public Windows release
still needs signing credentials and release notes.

## What Am I Seeing?

- **Cayley graph ball**: a finite-radius neighborhood of the identity, with
  generator-colored edges and reduced-word labels.
- **Davis cells**: rank-two `2m`-gons from finite Coxeter pairs, plus exact
  visible incidence records and visual proxies for higher spherical cells.
- **Local chamber view**: a selected chamber-centered view for understanding
  local topology without global graph clutter.
- **Geometric projection**: hyperbolic chamber barycenters projected to 3D.
  Compact high-dimensional examples use local PCA for readability.
- **`Y_Gamma`**: the fundamental-domain style one-vertex complex with oriented
  generator arrows and relation faces shown as one cohesive 3D object.
- **Quotient/game mode**: imported quotient-style complexes with Schreier,
  cocycle, and ascending/descending-link diagnostics.

Use the **Guided Inspection** panel for one-click tours: one Coxeter relation,
one rank-three cell, local link, `Y_Gamma` 2-skeleton, and quotient/game
experiment. See [docs/walkthroughs.md](docs/walkthroughs.md) for short scripts
that explain what to inspect and what each view does not claim.

## Public Alpha Demo Path

For a first public pass, use these four demos in order:

1. **Find a hexagon**: load `A2`, start **Find a hexagon**, and inspect the
   filled `m = 3` rank-two Davis cell.
2. **Inspect A3 rank-three cell**: load `A3`, open the rank-three
   `Y_Gamma(A3)` focus, and show the square/hexagon incidence as a 3D object.
3. **Inspect `Y_Gamma` for P2**: load **Compact 5-prism P2 Makarov**, open the
   3D `Y_Gamma` model, and use one-relation or around-generator focus before
   showing the full two-skeleton.
4. **Run `I2(5)` quotient/game**: open the Research Workflow demo, choose the
   `s0 = +1, s1 = -1` cocycle, and show the zero boundary-sum diagnostic on the
   decagon.

Presenter scripts live in [docs/walkthroughs.md](docs/walkthroughs.md). Capture
and caption guidance lives in [docs/demo-media.md](docs/demo-media.md).

## What Is Exact?

Bundled compact 5-cube, Makarov `P0` 5-prism, Emery-Kellerhals `P1 = D P0`
double, and Makarov `P2 = [5,3,3,3,4]` data are certified for source
transcription, algebraic dotted values, and exact Gram/signature diagnostics.
`P1` is still described as a double of the prism, not as a simplicial prism.
Generated Sage and GAP fixtures carry backend metadata and certification
summaries. Finite quotient exports can now be produced by native
Sage or GAP subgroup/coset exporters when those tools are available; otherwise
the scripts fall back to a clearly labeled in-repo finite checker. Quotient
imports are validated for generator actions, involutions, relation closure, and
rank-two cells when the relevant data is supplied.

The **Topology Inspector** reports whether the selected object is certified,
exact incidence, a visual proxy, a projection, or uncertified.

The example gallery also includes a searchable catalogue for Tumarkin's 15
compact 5D eight-facet `G11411` cases from Table 4.10. Those diagrams are now
manually transcribed from the arXiv EPS source, generated as loadable bundled
examples, and certified for source transcription, exact algebraic dotted
weights, and normal-Gram rank/signature diagnostics. They live in the catalogue
instead of the main gallery so the first screen stays readable.

## What Is A Drawing Convention?

Shell layouts, local chamber layouts, `Y_Gamma` readability embeddings, higher
Davis proxy hulls, and PCA projections are drawings. They are designed to make
incidence and local topology legible; they are not claims of exact Euclidean or
hyperbolic embedding.

Axis-based Klein/Poincare views draw a scaled reference ball. PCA views hide the
ball because PCA coordinates are not ball-model coordinates.

For the project-wide vocabulary, see
[docs/exact-vs-drawing.md](docs/exact-vs-drawing.md) and
[docs/glossary.md](docs/glossary.md).

## How Do I Study `Y_Gamma`?

Click **Open 3D Y_Gamma model** or use the guided `Y_Gamma 2-skeleton` mode. The
viewer shows one base vertex, oriented generator arrows, and rank-two relation
faces. The `Y_Gamma 3D Reader` offers narrated presets for one relation,
rank-three cells, square families, hexagon families, cells around a generator,
and the full 2-skeleton. The 2D nerve/local-link schematic is available as a
separate topology view; it explains spherical subsets but is not `Y_Gamma`
itself.

## How Do I Run A Quotient/Game Experiment?

Use the **Research Workflow** panel. It is a five-step path:

1. **Source System**: start from a Coxeter system. The bundled demo uses
   `I2(5)`.
2. **Subgroup/Cosets**: record subgroup generator words. The demo uses the
   identity subgroup, so all ten cosets of `I2(5)` are visible.
3. **Quotient Complex**: load or import the quotient artifact with Schreier
   action, permutation data, and rank-two quotient cells.
4. **Cocycle/Game**: choose a named integer cocycle. The demo uses
   `s0 = +1, s1 = -1`, so the decagon boundary sum is zero while ascending and
   descending edges are both visible.
5. **Local Topology + Export**: inspect topology lenses and export a
   reproducible experiment bundle.

The topology lenses make quotient/game mode primary: generator star,
rank-three spherical cell, cells incident to an edge, ascending link,
descending link, level link, and full local link. The workflow readout reports
the visible vertices, edges, cells, local-link F2 homology, and flag-link status
so the topology is visible before opening the full inspector. Importing
quotient JSON still works, and the old raw builder remains available under
advanced controls, but the intended research path now lives in the workflow
panel.

The **Experiment Notebook** saves named runs with notes, warnings, scene stats,
selected objects, topology diagnostics, data hashes, and optional screenshots.
Bundles can be exported, imported, duplicated, and compared.

## Validation Commands

Use these from the repository root before publishing changes:

```bash
corepack pnpm format
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm exec playwright test
corepack pnpm validate:research-grade
```

Useful research scripts:

```bash
corepack pnpm exact:sage:i2-5
corepack pnpm exact:gap:i2-5
corepack pnpm compare:backends
corepack pnpm certify:geometry:intervals:compact-5-cube
corepack pnpm certify:geometry:intervals:compact-5-prism
corepack pnpm quotient:sage:export
corepack pnpm quotient:gap:export
corepack pnpm quotient:sage:export:i2-5-demo
corepack pnpm quotient:gap:export:i2-5-demo
corepack pnpm quotient:sage:export:a3-demo
corepack pnpm quotient:gap:export:a3-demo
corepack pnpm compare:quotient-backends
corepack pnpm workflow:validate
corepack pnpm registry:validate
corepack pnpm session:validate
corepack pnpm bench:timed:machine
corepack pnpm demo:record
corepack pnpm release:web
corepack pnpm release:desktop
corepack pnpm certify:quotient:torsion-free
corepack pnpm notebook:validate path/to/bundle.json
```

External Sage, GAP/KBMAG, and CoxIter integrations are command-line tooling, not
browser dependencies. If a tool is unavailable, scripts should emit a clear
skipped or blocked status rather than making a weaker claim.

## Native Desktop Status

The optional Tauri shell wraps the same viewer and validation pipeline as the
web app. It adds narrow `.coxeter-session.json` file access, not a separate math
runtime. WASD camera nudging, orbit controls, focus/reset actions, labels,
rank-two cell toggles, and mode switches should behave the same in browser and
desktop builds. On desktop-size windows the viewer stays fixed while the side
rails scroll; light/dark mode and viewer-only mode are available from the top
strip for presentation and focused inspection.

`corepack pnpm release:desktop` reports bundle readiness, code-signing status, and
updater-signing status as deterministic JSON. Missing signing or updater
environment variables are reported as `skipped` and do not fail unsigned local
builds. Public auto-updating desktop releases still require maintainer-owned
platform signing credentials, a Tauri updater signing key, and an update
endpoint.

For heavy reproducibility runs, use `.researchcontainer/`. The normal
`.devcontainer/` stays light for app work; the research container adds
SageMath, GAP/KBMAG, and a stable CoxIter executable path for artifact checks.

## Documentation Map

- [docs/math.md](docs/math.md): Coxeter, Davis, quotient, game, and projection conventions.
- [docs/data-format.md](docs/data-format.md): JSON schemas and import/export behavior.
- [docs/viewer-design.md](docs/viewer-design.md): rendering, interaction, performance, and UI decisions.
- [docs/tooling.md](docs/tooling.md): exact exporter contracts, scripts, runtime checks, and CI policy.
- [docs/desktop-ux.md](docs/desktop-ux.md): native wrapper UX, workspace layout, diagnostics, signing, and updater status.
- [docs/walkthroughs.md](docs/walkthroughs.md): guided readings for hexagon, rank-three, `Y_Gamma`, and quotient/game views.
- [docs/exact-vs-drawing.md](docs/exact-vs-drawing.md): how to separate exact incidence, numerical geometry, and readable drawings.
- [docs/glossary.md](docs/glossary.md): project vocabulary for Coxeter, Davis, geometry, quotient, and game terms.
- [docs/demo-media.md](docs/demo-media.md): screenshot, caption, sidecar, and demo-media guidance.
- [docs/releases/](docs/releases/): release-note templates and packaging status notes.
- [docs/references.md](docs/references.md): citations and what each source supports.
