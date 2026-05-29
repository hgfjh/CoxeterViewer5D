# Coxeter Viewer 5D

An offline-capable local web app for inspecting finite Coxeter Cayley balls,
Davis cells, hyperbolic chamber projections, the one-vertex base complex
`Y_Gamma`, and quotient/game diagnostics.

The app is an educational and research workflow tool, not a theorem prover. It
keeps exact data, numerical geometry, and drawing conventions visibly separate.

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

## What Is Exact?

Bundled compact 5-cube and Makarov 5-prism data are certified for source
transcription and exact Gram/signature diagnostics. Generated Sage and GAP
fixtures carry backend metadata and certification summaries. Finite quotient
exports can now be produced by native Sage or GAP subgroup/coset exporters when
those tools are available; otherwise the scripts fall back to a clearly labeled
in-repo finite checker. Quotient imports are validated for generator actions,
involutions, relation closure, and rank-two cells when the relevant data is
supplied.

The **Topology Inspector** reports whether the selected object is certified,
exact incidence, a visual proxy, a projection, or uncertified.

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

Click **Open Y_Gamma complex** or use the guided `Y_Gamma 2-skeleton` mode. The
viewer shows one base vertex, oriented generator arrows, and rank-two relation
faces. The `Y_Gamma Reader` offers narrated presets for one relation,
rank-three cells, square families, hexagon families, cells around a generator,
and the full 2-skeleton. The nerve/local-link diagnostic is available as a
separate topology view; it is not `Y_Gamma` itself.

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

## Commands

Use `pnpm` from the repository root.

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm exec playwright test
pnpm validate:research-grade
```

Useful research scripts:

```bash
pnpm exact:sage:i2-5
pnpm exact:gap:i2-5
pnpm compare:backends
pnpm certify:geometry:intervals:compact-5-cube
pnpm certify:geometry:intervals:compact-5-prism
pnpm quotient:sage:export
pnpm quotient:gap:export
pnpm quotient:sage:export:i2-5-demo
pnpm quotient:gap:export:i2-5-demo
pnpm quotient:sage:export:a3-demo
pnpm quotient:gap:export:a3-demo
pnpm compare:quotient-backends
pnpm workflow:validate
pnpm registry:validate
pnpm session:validate
pnpm bench:timed:machine
pnpm demo:record
pnpm release:web
pnpm release:desktop
pnpm certify:quotient:torsion-free
pnpm notebook:validate path/to/bundle.json
```

External Sage, GAP/KBMAG, and CoxIter integrations are command-line tooling, not
browser dependencies. If a tool is unavailable, scripts should emit a clear
skipped or blocked status rather than making a weaker claim.

For heavy reproducibility runs, use `.researchcontainer/`. The normal
`.devcontainer/` stays light for app work; the research container adds
SageMath, GAP/KBMAG, and a stable CoxIter executable path for artifact checks.

## Documentation Map

- [docs/math.md](docs/math.md): Coxeter, Davis, quotient, game, and projection conventions.
- [docs/data-format.md](docs/data-format.md): JSON schemas and import/export behavior.
- [docs/viewer-design.md](docs/viewer-design.md): rendering, interaction, performance, and UI decisions.
- [docs/tooling.md](docs/tooling.md): exact exporter contracts, scripts, runtime checks, and CI policy.
- [docs/walkthroughs.md](docs/walkthroughs.md): guided readings for hexagon, rank-three, `Y_Gamma`, and quotient/game views.
- [docs/exact-vs-drawing.md](docs/exact-vs-drawing.md): how to separate exact incidence, numerical geometry, and readable drawings.
- [docs/glossary.md](docs/glossary.md): project vocabulary for Coxeter, Davis, geometry, quotient, and game terms.
- [docs/demo-media.md](docs/demo-media.md): screenshot, caption, sidecar, and demo-media guidance.
- [docs/references.md](docs/references.md): citations and what each source supports.
