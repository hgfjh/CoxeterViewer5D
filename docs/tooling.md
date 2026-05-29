# Tooling

The viewer is a local web app first. Normal app use, bundled examples, and JSON
imports should not require runtime network access or external algebra systems.

## App Commands

Use `pnpm` from the repository root:

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm exec playwright test
```

The package scripts also include:

```bash
pnpm e2e
pnpm format
pnpm preview
pnpm test:watch
pnpm bench:catalogue
pnpm bench:catalogue:check
```

## Exact Exporter Workflow

Exact Sage and GAP/KBMAG generation is an external workflow. The browser exposes
unavailable backend stubs so the UI can explain the limitation, but it should
not try to run Sage, GAP, or KBMAG.

The shared contract is:

```bash
python scripts/sage_export_backend.py --contract
python scripts/gap_kbmag_export_backend.py --contract
```

Both commands print `scripts/exact_export_contract.json`. The contract says that
exporters consume `CoxeterSystemInput` JSON and emit
`GeneratedCayleyBall` JSON with deterministic ids, right-multiplication edges,
rank-two Davis cells when complete, and metadata using either
`external-sage` or `external-gap-kbmag` deduplication.

## Devcontainer Research Environment

The optional devcontainer in `.devcontainer/` pins the app-side research
environment to Node 22 and `pnpm@11.3.0`, matching `package.json`. It installs
ordinary build tools, Python 3, and Graphviz, then runs:

```bash
pnpm install --frozen-lockfile
```

The container is meant to make the viewer, docs, validation scripts, and
browser tests reproducible. It deliberately does not install SageMath,
GAP/KBMAG, or CoxIter because those are large, platform-specific research
runtimes with their own version and build constraints.

The separate `.researchcontainer/` scaffold is the heavy artifact environment.
It keeps the same Node/pnpm toolchain and adds SageMath plus GAP/KBMAG from the
Debian stable package set. CoxIter packaging is less uniform, so the container
sets a stable `COXITER_EXECUTABLE=/usr/local/bin/coxiter` path; mount or install
the project-approved CoxIter binary there and record the exact version in the
artifact manifest. Use the research container for backend regeneration and
certificate checks, not for ordinary UI edits.

Optional exact-tool paths remain outside the container contract:

- SageMath: run exporters with a local `sage` executable, `sage -python`, or
  the existing `sage -c "..."` command shape.
- GAP/KBMAG: use a direct `gap` executable with KBMAG installed, or pass
  `--gap-executable <path>` to the Python wrapper. On Windows, the existing
  wrapper may use a WSL Sage-environment GAP when visible.
- CoxIter: use a direct `coxiter` executable, a WSL command, or
  `--coxiter-executable <command>` for compact-example checks.

When an external runtime is used, record the path and command shape in an
artifact manifest rather than hiding it in local machine state.

`scripts/external_tool_adapters.json` records the current interoperability
boundary. Sage, GAP/KBMAG, and CoxIter entries point at implemented wrappers.
polymake and Regina are contract-only entries for future topology artifacts:
they must emit tool version, command, input hash, and output hash before the app
or docs can treat their output as reproducible evidence.

## External Artifact Manifests

External tool outputs are tracked as inert research artifacts. The manifest
format lives by example at
`scripts/certificates/external-artifact-manifest.example.json`; companion notes
are in `scripts/certificates/README.md`.

Validate manifests without running Sage, GAP, KBMAG, or CoxIter:

```bash
node scripts/validate_artifact_manifest.mjs scripts/certificates/external-artifact-manifest.example.json
pnpm validate:artifact-manifest
```

The validator checks JSON shape, known tool ids, referenced artifact paths, and
recorded SHA-256 hashes. It does not reinterpret CoxIter stdout, prove a
word-reduction claim, certify a quotient as torsion-free, or upgrade numerical
normal coordinates into exact data. Those claims stay in the artifact's
`claims` and `boundary` fields.

Registry and regeneration helpers keep release artifacts diffable:

```bash
pnpm registry:validate
pnpm adapter:validate
pnpm schema:migrate
pnpm regenerate:all
pnpm compare:all-backends
```

`regenerate:all` is intentionally a report-first command. It lists the exact
subcommands needed to rebuild examples, quotient artifacts, certificates,
manifests, and benchmark snapshots without silently mutating mathematical data.

## Performance And Demo Artifacts

Timed browser benchmarks remain the primary speed gate:

```bash
pnpm bench:timed:check
pnpm bench:timed:machine
```

`bench:timed:machine` turns the stored timed benchmark into machine-class
budgets for `ci-linux-standard`, `local-dev-laptop`, and
`research-workstation`. CI should hard-gate only the standard class; local
classes are records for comparison as topology and quotient scenes grow.

Demo media is storyboard-first so normal validation does not depend on video
tooling:

```bash
pnpm demo:record
```

The command validates the walkthrough/demo manifest and can write a deterministic
`docs/demo-media-manifest.json` when a release wants to publish WebM/PNG
storyboards.

## Sessions And Releases

Project/session files use `.coxeter-session.json` and can be validated without
opening the app:

```bash
pnpm session:validate
```

Release scripts are deterministic readiness checks by default:

```bash
pnpm release:web
pnpm release:desktop
```

`release:web` builds and hashes `dist/`. `release:desktop` checks the optional
Tauri v2 scaffold and reports `skipped` until a maintainer opts into the Rust
project and Tauri CLI dependency. The desktop shell must wrap the same viewer
and artifact pipeline as the web app; it is not a separate math runtime.

## Runtime Checks

These checks do not run exact enumeration:

```bash
python scripts/sage_export_backend.py --check-runtime
python scripts/gap_kbmag_export_backend.py --check-runtime
```

The Sage script reports whether the current Python process can import
`sage.all`. Exact generation must run under Sage, not browser JavaScript. Some
Sage builds provide `sage -python`; the Sage CLI installed in this workspace
supports `sage -c`, which can launch the script with `runpy`.

The GAP wrapper first checks for a `gap` executable and then asks
`scripts/gap_kbmag_export_backend.g` whether KBMAG can be loaded. If either
runtime is missing, the command prints JSON with `ok: false` and a clear
`missing-runtime` or `missing-kbmag` code. `scripts/run_gap_export.mjs` is a
convenience launcher for package scripts: it tries native GAP first and, on
Windows, falls back to the Sage-environment GAP at
`/opt/miniforge3/envs/sage/bin/gap` inside WSL when that route is visible to the
calling shell.

On this development machine, GAP 4.14.0 is available in the Sage conda
environment and KBMAG 1.5.11 was built into the user GAP package directory
`~/.gap/pkg/kbmag`. The build followed the upstream KBMAG README: download the
1.5.11 release archive, run `./configure /opt/miniforge3/envs/sage/lib/gap`,
then `make`.

## Quotient/Game Workflow Exports

The primary quotient/game demo is the identity-subgroup quotient of `I2(5)`.
It carries ten cosets, one decagon quotient cell, and the named cocycle
`s0=+1, s1=-1`. The workflow scripts are:

```bash
pnpm quotient:sage:export:i2-5-demo
pnpm quotient:gap:export:i2-5-demo
pnpm quotient:sage:export:a3-demo
pnpm quotient:gap:export:a3-demo
pnpm compare:quotient-backends
pnpm workflow:validate
```

`scripts/run_quotient_export.mjs` is the stable automation entry point. It
tries native Sage/GAP quotient exports first, then WSL-backed Sage/GAP routes on
Windows, and records the attempted tool path in the emitted artifact. When Sage
is available,
`scripts/sage_quotient_export.py` performs finite Coxeter subgroup enumeration
with Sage algebraic-real reflection matrices, builds the left-coset action
`H\W`, emits quotient vertices/edges/rank-two cells, and attaches input/output
hashes. When GAP is available, `scripts/gap_quotient_export.py` asks GAP to
enumerate the finite Coxeter presentation and subgroup cosets, then serializes
the same quotient contract with an `external-gap-kbmag` Schreier certificate. If
an external tool is missing or the request is outside the finite scope, the
wrapper falls back to the deterministic in-repo finite coset builder and labels
that status explicitly.

For fast deterministic unit tests, set
`COXETER_QUOTIENT_EXTERNAL_MODE=in-repo` before calling
`scripts/run_quotient_export.mjs`. The standalone validation commands above
leave the mode unset so native Sage/GAP parity is still checked when those tools
are installed.

`skipped` means the external runtime was not callable or did not support that
request. `in-repo checked` means the finite quotient action, relation closure,
and cocycle boundary sums were verified by repository scripts. `external
certified` means the subgroup/coset enumeration was actually performed by Sage,
GAP, or another recorded external tool and whose input/output hashes are stored.

The lower-level Sage and GAP hooks are active for finite Coxeter systems. Do not
use quotient export alone to claim torsion-freeness or manifold status.

## Exact Exports

The Sage exporter is implemented. It uses Sage algebraic real reflection
matrices as dictionary keys, emits `external-sage` metadata, respects requested
caps, and includes warnings when the requested radius is capped or rank-two
cells are clipped. It also records conservative `normalFormRecords` and
`relationProofSummaries` metadata for backend parity. A local invocation shape
is:

```bash
sage -c "import runpy, sys; sys.argv=['scripts/sage_export_backend.py','--input','public/examples/I2_5.json','--radius','5','--output','generated/I2_5_r5.sage.json']; runpy.run_path('scripts/sage_export_backend.py', run_name='__main__')"
```

The GAP/KBMAG exporter is implemented for finite spherical Coxeter inputs. The
Python wrapper validates the JSON, rejects visibly non-spherical inputs before
calling GAP, then asks GAP to load KBMAG and enumerate the Cayley ball through a
finite permutation image of the Coxeter presentation. This covers the bundled
`I2_5` and `A3` examples when GAP and KBMAG are installed:

```bash
node scripts/run_gap_export.mjs --input public/examples/I2_5.json --radius 5 --created-at 2026-01-01T00:00:00.000Z --output generated/I2_5_r5.gap.json
node scripts/run_gap_export.mjs --input public/examples/A3.json --radius 6 --created-at 2026-01-01T00:00:00.000Z --output generated/A3_r6.gap.json
```

If the Node process cannot see WSL distributions, run the Python exporter from
inside WSL and pass the Sage-environment GAP explicitly:

```bash
python3 scripts/gap_kbmag_export_backend.py --input public/examples/I2_5.json --radius 5 --created-at 2026-01-01T00:00:00.000Z --output generated/I2_5_r5.gap.json --gap-executable /opt/miniforge3/envs/sage/bin/gap
python3 scripts/gap_kbmag_export_backend.py --input public/examples/A3.json --radius 6 --created-at 2026-01-01T00:00:00.000Z --output generated/A3_r6.gap.json --gap-executable /opt/miniforge3/envs/sage/bin/gap
```

If GAP or KBMAG is not available, export exits nonzero with JSON status and does
not create a generated graph. This is a runtime skip, not an implemented export.
If the input is not finite spherical, the wrapper returns
`unsupported-coxeter-system` rather than asking GAP to chase an infinite word
problem.

Both exact exporters can run structural certification without their algebra
runtime:

```bash
python scripts/sage_export_backend.py --certify-output tests/fixtures/generated/I2_5_sage_radius_5.json
python scripts/gap_kbmag_export_backend.py --certify-output generated/I2_5_r5.gap.json
```

Generated files should be imported through the app's JSON import path or parsed
with `validateGeneratedCayleyBall` in `src/backends/generatedJson.ts`. Validation
checks graph references, metadata, generator indices, and Davis-cell boundary
lengths. It does not prove that the external algebra computation was correct.

Backend parity is checked with deterministic JSON reports:

```bash
node scripts/compare_backends.mjs
node scripts/compare_backends.mjs --pair tests/fixtures/generated/A3_sage_radius_6.json tests/fixtures/generated/A3_gap_radius_6.json
```

The comparator scans matching Sage/GAP fixtures by default and checks counts,
length multisets, generator edge closure, rank-two cells, certificate status,
source input hashes, normal-form records, and visible rank-two relation
summaries. The current finite-spherical parity set is `A2`, `A3`, and `I2(5)`.
Adding `B3`, `H3`, or `I2(7)` is mechanical once those Coxeter-system JSON
inputs are added to the catalogue or a dedicated fixture-input directory.

Generated exports are intended to be deterministic artifacts. Prefer passing an
explicit `--created-at` value when producing fixtures that will be checked into
git, otherwise timestamps will differ across runs.

## CI Policy

Unit tests may inspect script text, generated fixtures, and the shared contract.
They must not require SageMath, GAP, or KBMAG in CI. Regenerating exact fixtures
is an opt-in local command because Sage availability is machine-specific.

The research-grade gate is stricter than CI:

```bash
pnpm certify:compact-5-cube
pnpm certify:compact-5-prism
python scripts/certify_geometry_intervals.py public/examples/compact_5_cube_gamma1.json
python scripts/certify_geometry_intervals.py public/examples/compact_5_prism_makarov.json
python scripts/coxiter_check_compact.py public/examples/compact_5_cube_gamma1.json --require-external
python scripts/coxiter_check_compact.py public/examples/compact_5_prism_makarov.json --require-external
pnpm check:independent
pnpm validate:research-grade
```

These gates are expected to pass for the bundled compact 5-cube and Makarov
5-prism source transcriptions. The geometry interval checker adds a bounded
validation layer for the numerical normals/basepoint/reflections used by the
viewer, but it is still not an exact algebraic coordinate certificate. CoxIter
reports are separate external-checker artifacts. The bundled artifacts in
`scripts/certificates/coxiter/` are accepted only when their input hash and
CoxIter graph hash match the current compact example. A `skipped` CoxIter
report means the diagram input was prepared and hashed, but no independent
CoxIter claim passed.

`scripts/coxiter_check_compact.py` can run a directly installed `coxiter` or,
on Windows, try WSL using a temporary graph file rather than shelling unescaped
graph text. Use `--coxiter-executable <command>` when CoxIter lives in a
non-standard path. Use `--require-external` for local release gating; the
command may satisfy that gate either by a live CoxIter run or by a hash-matched
stored artifact. Add `--no-artifact` when you explicitly want to test live tool
availability.

## Benchmarks

The catalogue benchmark is deterministic apart from the measured wall-clock
field printed to stdout:

```bash
pnpm bench:catalogue
pnpm bench:catalogue:check
pnpm bench:catalogue:write
```

`scripts/benchmark_catalogue.mjs` counts bundled Coxeter examples, generated
fixtures, graph sizes, and rank-two cell counts. The stored deterministic output
lives at `scripts/benchmarks/catalogue-static-v1.json`; it omits `elapsedMs` so
the file can be diffed in git. `bench:catalogue:check` compares the current
deterministic result to that stored file, while `bench:catalogue` prints the
same data plus an `elapsedMs` measurement.

For browser-level timing, start the dev server and run:

```bash
pnpm bench:timed
pnpm bench:timed:write
pnpm bench:timed:check
```

The timed benchmark selects the core examples/radii in the app and records
scene stats from the renderer. The structural snapshot ignores elapsed times so
performance changes can be inspected without introducing timestamp churn.
