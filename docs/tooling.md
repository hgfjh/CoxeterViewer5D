# Tooling

The viewer is a local web app first. Normal app use, bundled examples, and JSON
imports should not require runtime network access or external algebra systems.

## App Commands

Use Corepack so the pinned `pnpm` version in `package.json` is respected:

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

If a developer already has a compatible global `pnpm`, the shorter `pnpm ...`
commands work too. Corepack is documented because it is less fragile for a
fresh clone.

`corepack pnpm dev` starts the Vite development server. Vite prints the local
browser URL, usually `http://127.0.0.1:5173/`.

For a production-style web check:

```bash
corepack pnpm build
corepack pnpm preview
```

`build` writes `dist/`; `preview` serves that directory locally.

Routine validation commands:

```bash
corepack pnpm format
corepack pnpm lint
corepack pnpm test
corepack pnpm exec playwright test
```

The package scripts also include:

```bash
corepack pnpm e2e
corepack pnpm test:watch
corepack pnpm bench:catalogue
corepack pnpm bench:catalogue:check
```

## Desktop App Commands

The desktop app is a Tauri v2 shell around the same web viewer. It needs the
web dependencies above plus Rust and the operating-system prerequisites that
Tauri expects.

Run the desktop app in development mode:

```bash
corepack pnpm desktop:dev
```

Build an unsigned local desktop bundle:

```bash
corepack pnpm desktop:build
```

Tauri writes the raw release binary under `src-tauri/target/release/` and
platform bundles under `src-tauri/target/release/bundle/`. The exact file names
depend on the target OS and Tauri bundle target. These outputs are ignored by
git; public users should get desktop artifacts from a GitHub Release, not from a
source checkout.

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

Tumarkin's full compact 5D eight-facet list, consisting of 15 `G11411` cases
and the unique `G12221` case, is regenerated and checked by a dedicated in-repo
certifier:

```bash
python -m pip install -r requirements-ci.txt
python scripts/tumarkin_8facet_eps.py
python scripts/tumarkin_8facet_solve.py
python scripts/certify_tumarkin_8facet.py --write-examples
python scripts/certify_tumarkin_8facet.py
```

The first command parses the arXiv EPS artwork into source-vector diagram
records, the second solves the dotted weights, and the certifier writes or
validates the bundled `tumarkin_5d_8facet_*.json` files. The pinned
Python requirements are intentionally small: SymPy is used for the exact
algebraic equations, while the rank/signature check uses an in-repo numerical
Jacobi routine so CI does not depend on NumPy. These scripts certify the source
transcription and normal-Gram diagnostics; rendered coordinates remain
numerical visualization data.

External tool jobs should be treated as finite, inspectable jobs, not as hidden
desktop services. A job is ready for release only when it has a stable launcher
under `scripts/`, validates its input, emits JSON or a certificate artifact, and
records tool id, command shape, input hash, output hash, status, claims, and
non-claims. `missing-runtime`, `missing-kbmag`, `unsupported-coxeter-system`,
and `skipped` are valid outcomes; they are preferable to pretending that an
exact backend ran.

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

The timed command builds against the production `dist/` server by default. It
records long tasks, heap use, renderer work, label renderer (`sprite` or
`sdf-batch`), picking strategy/build/query time, the cache policy used for the
run, and semantic object floors. It fails if any interaction scenario fails. See
[performance-audit.md](performance-audit.md) for the current measurements and
the remaining architecture thresholds.

`bench:timed:machine` turns the stored timed benchmark into machine-class
budgets for `ci-linux-standard`, `local-dev-laptop`, and
`research-workstation`. CI should hard-gate only the standard class; local
classes are records for comparison as topology and quotient scenes grow.

CI runs the timed hard gate as its own fresh step. `validate:research-grade`
does not repeat browser timing after the CPU-heavy exact-tool checks; doing so
measures residual host contention rather than a stable application baseline.
The validator prints a compact command/status report and includes output tails
only for failures. Use `corepack pnpm validate:research-grade:full` only when
the full diagnostics from every passing checker are needed.

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
corepack pnpm release:web
corepack pnpm release:desktop
```

`release:web` builds and hashes `dist/`. `release:desktop` checks the Tauri v2
scaffold, signing environment, updater environment, and packaging readiness.
The desktop shell must wrap the same viewer and artifact pipeline as the web
app; it is not a separate math runtime.

Cross-platform desktop release artifacts are built by the
`desktop-release.yml` GitHub Actions workflow. It checks out the requested tag,
builds Tauri on Windows, macOS, and Linux runners, and can attach the resulting
`.exe`, `.msi`, `.dmg`, `.app.tar.gz`, `.AppImage`, `.deb`, and `.rpm` files to
the GitHub Release. macOS signing/notarization and Windows signing remain
credential-gated release steps; unsigned artifacts are acceptable for research
preview builds but should be labeled as such.

Both release scripts include a `releaseOperations` object. For web releases,
code signing and native updater work are `not-applicable`. For desktop releases,
code signing is reported from platform environment variables and updater signing
is reported from `TAURI_SIGNING_PRIVATE_KEY` plus the optional
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Missing signing or updater variables
produce `status: "skipped"` with `ok: true`; unsigned local bundles are allowed.
A public auto-updating build still needs platform signing credentials, a Tauri
updater signing key, a release endpoint, and maintainer release-channel policy.

Release notes are scaffolded in `docs/releases/`. Start from
`docs/releases/template.md` and record the exact web/desktop report status,
signing/updater state, validation commands, and blockers.

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

The recognition-first finite-image backend uses a separate GAP 4.16 tree so
its package ABI and package versions do not depend on Sage's embedded GAP or a
user package directory. From the Windows checkout, install or verify that
toolchain with:

```bash
wsl bash scripts/install_gap_research_toolchain.sh
```

From an interactive WSL shell, the equivalent command is
`bash scripts/install_gap_research_toolchain.sh`. The installer keeps the full
GAP tree under `~/.local/opt/coxeter-gap/gap-4.16.0`, builds the native package
components it needs, and checks pinned versions of AtlasRep, TomLib, Forms,
Orb, genss, recog, ClassicalMaximals, and Ferret. Backend invocations use GAP's
`-r` option so Sage and `~/.gap/pkg` cannot leak incompatible packages into the
process. The generated toolchain manifest records the exact versions checked.

Verify an existing installation without rebuilding it:

```bash
wsl bash scripts/install_gap_research_toolchain.sh --check
```

## Automatic Torsion-Free Cover Discovery

The primary research path accepts a Coxeter system and searches for the finite
action needed by the cover reader. It does not require a user to invent a coset
table. The current ladder is recognition-first within each finite image:

1. build and cache the maximal spherical subgroups and prime-order torsion
   witnesses;
2. probe exact Tits-representation reductions in several characteristics;
3. transfer exact source-generator matrices and their form to the isolated GAP
   4.16 toolchain; characteristic two also supplies its certified compact point
   action;
4. recognize `Q` and eliminate impossible indices using complete structural
   data before constructing subgroups;
5. use fixed-point marks to reject table-of-marks classes before building any
   coset action;
6. materialize and independently certify only surviving `Q/L` actions;
7. persist reusable partial modules and combine complementary ones with the packed diagonal-orbit
   solver;
8. use generic GAP low-index enumeration only below the separately configured
   fallback cap;
9. verify the selected action independently before building `H\Sigma`.

For the compact 5-cube, the planning catalogue has 32 maximal spherical
subgroups, 360 prime-order class origins compressed to 186 deterministic
shortlex witnesses, and the necessary action-degree divisor
`5,760`. A passing `Q/L` degree must be a multiple of `5,760`; a partial module
used in a composite action need not be.

The focused order-five and symbolic mod-2 campaign is reproducible with:

```bash
corepack pnpm cover:search:partial-modules:order5
corepack pnpm cover:search:partial-modules:mod2
corepack pnpm cover:search:partial-modules:compose
corepack pnpm cover:search:partial-modules:integrate
```

The mod-2 command uses the pinned GAP installation in WSL. It computes
fixed-coset counts from compact stabilizers and conjugacy classes; it does not
materialize any 97,920-point action. Console output is intentionally short.
The compose command intersects those stabilizers through double cosets. Its
default bound is 20 minutes. A bounded run may end with exit status `2` after
writing a valid `incomplete-resource-bounded` artifact; that status does not
exclude degree 195,840. The exact base exclusion through degree 97,920 remains
valid.
The full evidence and hashes are written to
`scripts/certificates/torsion-free/`. Run
`cover:search:partial-modules:campaign` to repeat both tracks and the bounded
symbolic-composite and global degree-5,760 fallback stages.

Characteristics `2` and `3` are allowed when exact arithmetic supports them.
They are accepted only if all finite Coxeter relations hold and every maximal
spherical subgroup retains its exact classified order. That condition already
certifies the normal congruence kernel as torsion-free and finite index because
the matrices lie in a finite general linear group. The artifact records this
first certificate level even if the complete image order is still unknown. A
verified recognition or structural certificate promotes it to an exact-index
kernel; a materialized permutation action is a third, stronger operational
level. The UI keeps all three distinct. Optional permutation characters are diagnostics, not
torsion certificates.

Cyclotomic coefficient fields are searched ideal by ideal. The residue record
names the prime ideal, norm, residue degree, and field order. A rational prime
can therefore contribute several distinct finite images, including extension
fields. The matrix serialization fixes a polynomial basis, so cached hashes do
not depend on whichever root a computer algebra system happened to choose.

The Sage-to-GAP transfer is an exact boundary, not an informal conversion.
The record contains every source-generator permutation row, its degree, the
expected image order, the source matrix digest, a schema version, and a hash of
the complete payload. GAP reconstructs the action and rechecks the hash,
generator ordering, relations, and group order before recognition. A failed
hash, missing package, inconclusive recognition, or incomplete maximal-subgroup
source stops that recognition branch with an `incomplete` status. The backend
does not call `MaximalSubgroupClassReps` blindly on a large unrecognized root
group.

The generic fallback accepts an order from a recognition tree only after
`IsCorrect`, constructive membership for every transferred generator, and
independent relation checks. The primary compact-cube odd-prime path is more
specific and avoids that composition tree: it proves containment in standard
Omega with `CM_InOmega`, proves reverse containment by GenSS words or a
conclusive positive `RecogniseClassical` result, and obtains the order from the
now-identified standard group. This replaced the generic `Size()` request that
previously stalled characteristic five. The same GAP process then performs
classical maximal-index screening.

For the compact 5-cube, exact degree-3 and degree-119 actions identify the
mod-2 image as

```text
S3 x (O8^-(2):2).
```

This is not `S3 x O8^-(2)`: the second factor is the index-two extension of
the simple orthogonal group. The two factors share a quotient `C2`, so the
index calculation includes the fiber-product cases required by Goursat's
lemma. TomLib's complete 5,351-class table of marks for `O8^-(2)`, combined
with those common-quotient cases, shows that the only mod-2 subgroup indices
at most `23,040` that are not divisible by `17` are
`1, 2, 3, 4, 6, 12`. The admissible cover degrees in the configured range are
`5,760`, `11,520`, `17,280`, and `23,040`; none can occur in the mod-2 image.

The current worker sweeps all later multiples of `5,760` through the configured
maximum. It constructs contained and outer-surjective subgroups of
`O8^-(2):2`, enumerates all common-quotient subdirect products with the `S3`
factor, and applies exact witness tests before any large coset action. The run
through `576,000` classifies 96 degree rows as impossible and fully rejects all
45 exact subgroup classes at the four surviving degrees `97,920`, `195,840`,
`293,760`, and `391,680`. There are no unresolved mod-2 rows in that range.

To turn a complete full run into the compact registry artifact, use:

```bash
corepack pnpm cover:report:finite-image -- full-run.json bounded-report.json
```

The extractor rejects an incomplete sieve, subgroup-family frontier, or degree
row instead of publishing a partial report as complete.

### Replayable GF(3) structure and ledger

The GF(3) structural calculation has its own generator and replay command:

```bash
python scripts/mod3_structural_certificate.py generate \
  --source public/examples/compact_5_cube_gamma1.json \
  --output scripts/certificates/torsion-free/compact_5_cube_mod3_structural_certificate.json \
  --timeout 3600 \
  --max-subgroup-nodes 20000

python scripts/mod3_structural_certificate.py replay \
  --source public/examples/compact_5_cube_gamma1.json \
  --output scripts/certificates/torsion-free/compact_5_cube_mod3_structural_certificate.json \
  --timeout 3600
```

The short project aliases are `corepack pnpm cover:certify:mod3:generate` and
`corepack pnpm cover:certify:mod3` (or its explicit `:replay` alias). Use
`corepack pnpm cover:validate:mod3-artifact` to check only hashes and schema
without confusing provenance validation with mathematical certification.

Characteristics `5`, `7`, and `11` use direct orthogonal proofs without using
a generic composition tree as an order oracle:

```bash
corepack pnpm cover:certify:mod5:generate
corepack pnpm cover:certify:mod5
corepack pnpm cover:certify:mod7:generate
corepack pnpm cover:certify:mod7
corepack pnpm cover:certify:mod11:generate
corepack pnpm cover:certify:mod11
```

The shared entry point is
`python scripts/odd_prime_structural_certificate.py {generate,replay,validate}
--prime P`. Generation checks the finite Coxeter relations and all 32 maximal
spherical images first. It then changes the preserved split form to the
ClassicalMaximals standard form and uses `CM_InOmega` for exact upper
containment. At `p=5` and `p=7`, reverse containment is proved by a
prescribed-order GenSS chain with replayable standard-generator SLPs. The
smallest natural `p=11` orbit has `235,809,410` points, so its default route is
the specialized `RecogniseClassical` naming algorithm instead. A positive
`isOmegaContained` answer is a conclusive one-sided containment result; a
negative answer is not a proof and remains `unknown`. The search uses a stored
seed and is repeated during replay.

A process limit, failed chain, or inconclusive one-sided search leaves
structural equality and the exact image order `unknown`; it does not revoke
the lower-level finite-index torsion-free-kernel certificate supplied by exact
spherical injectivity.

The default `--gap` and `--manifest` values point to the pinned GAP 4.16
toolchain described above; `--wsl-distro` selects a particular WSL distribution
when Windows cannot infer it. Run `--help` before changing those paths.

The artifact stores the exact source matrices, preserved split form, basis
change to the standard orthogonal form, the applicable lower-containment
evidence, an index-two outer representative, the degree ledger, and source/tool
hashes. GenSS artifacts retain the standard-generator words. The p=11
artifact records the seeded one-sided result and its ppd/order diagnostics,
but does not pretend those diagnostics are constructive words. Generation can
end with `status: "unknown"` when GAP reaches its bound. Do not use the process
exit code as a proof. A reusable structural conclusion requires
`status: "verified"` **and** a separate replay that prints
`"replay": "verified"`.

Only then may the project promote `Q_3' = Omega^+(10,3)`, the index-two
extension statement, or an impossible row in the degree ledger. The ledger has
one row for every multiple of `5,760` through `576,000`; surviving maximal
families retain an unresolved frontier until the required recursive and outer
extension cases have been checked. The checked artifact is now `verified` and
replays independently. Its complete root maximal-index sieve rejects all 100
target degrees, so no recursive subgroup frontier remains in this range.
Generic `recog` is an optional diagnostic here; the exact equality proof uses
`CM_InOmega`, a proved GenSS chain of the prescribed order, and replayed SLPs
for the standard Omega generators.

The completed mod-2 obstruction still has its stated scope: one finite image
through degree `576,000`. Accepted congruence reductions may separately certify
their normal kernels as torsion-free even when those regular covers are too
large for the quotient workflow. Neither fact supplies a manageable action for
the compact 5-cube, and another finite image or a composite action may still
succeed.

The checked `p=5`, `p=7`, and `p=11` artifacts are verified. They identify
`Q_p` as `Omega^+(10,p):2`, certify the corresponding normal congruence kernel
as torsion-free with exact index, and reject all 100 multiples of `5,760`
through `576,000` inside each finite image. They do not acquire a natural
permutation action because no requested target survives. This is not a global
nonexistence theorem: another finite image, a noncongruence action, or a
composite module may still provide a manageable cover.

### Finite-image module portfolio

Inspect the fixed search plan without starting Sage or GAP:

```bash
python scripts/run_finite_image_portfolio.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output-dir artifacts/compact-5-cube-portfolio-plan \
  --max-index 576000 \
  --dry-run
```

`corepack pnpm cover:discover:portfolio:plan` runs the same dry plan for the
bundled compact 5-cube. Long portfolio runs should still use the explicit Sage
command below so their output stays in WSL's Linux filesystem.

Run the portfolio from the pinned Sage environment, keeping the output and
cache on the Linux filesystem for a long WSL job:

```bash
sage scripts/run_finite_image_portfolio.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output-dir "$HOME/.cache/coxeter-viewer/portfolio/compact-5-cube" \
  --max-index 576000 \
  --light-workers 4
```

The orchestrator runs the mod-2 seed plus characteristics `3`, `5`, `7`, and
`11`. The Sage worker also emits every eligible prime-ideal and extension-field
residue supported by the source representation. Recognition-heavy jobs run one
at a time; four to six light threads hash-check and ingest completed artifacts.
`--resume` is the default. Use `--no-resume` only when deliberately discarding
the matching checkpoint.

The public result is `portfolio.json`. Its main statuses are:

- `virtual-fibering-certified`: all five downstream gates passed: complete
  action replay, spherical plan, spherical freeness, Davis quotient, and the
  wall/Schreier/PL-Morse/link certificate;
- `materialized-witness-free-survivor`: the bounded composite solver found a
  witness-free diagonal orbit, materialized its complete generator rows within
  the byte cap, and independently replayed rows, relations, and witnesses, but
  downstream promotion is incomplete;
- `materialized-candidate-promotion-failed`: a downstream exact check failed;
  inspect `fullDavisPromotion.stages` to distinguish action, spherical,
  quotient, and fibering failures;
- `complete-no-survivor`: the recorded workers and bounded solver family were
  complete and found none;
- `incomplete-no-survivor`: at least one prime, ideal, cache object, or solver
  frontier did not complete;
- `dry-run`: commands and resource policy only.

Every useful partial action is retained with packed generator rows, exact
witness coverage, degree, stabilizer provenance, and content hashes. A GF(3)
degree ledger is not itself an action and cannot be used as a module seed.
Likewise, a solver survivor is not accepted as a cover merely from its witness
mask. The orchestrator materializes it only after the survivor gate, rechecks
complete rows, relations, and witness freeness, and then automatically invokes
`scripts/run_materialized_fibering.ts`. That independent path verifies regular
spherical orbits before quotient construction, tries the lawful rank-two
certificate first, and builds the full Davis Morse model only as a fallback or
when explicitly requested. A run with no survivor never
materializes an action and never invokes the fibering pipeline.

The downstream stage can also be replayed directly:

```bash
corepack pnpm cover:promote:materialized-action -- \
  --system public/examples/compact_5_cube_gamma1.json \
  --action ACTION.json \
  --output promotion.json
```

When a long portfolio runs under WSL, use a Linux Node/pnpm installation or the
research container. If no local TypeScript runtime is available, the portfolio
keeps the verified action and records `incomplete-runner-unavailable`; it does
not manufacture a failed certificate.

The implemented entry point is:

```bash
corepack pnpm cover:discover:check-runtime
corepack pnpm cover:discover:self-test
corepack pnpm cover:discover:sage:self-test
corepack pnpm cover:discover:compact-5-cube
corepack pnpm cover:discover:finite-image:tests
corepack pnpm cover:benchmark:tests
corepack pnpm cover:benchmark:scale
python -m scripts.discovery_runtime
python -m scripts.discovery_runtime --wsl
python scripts/torsion_free_discovery.py --check-runtime
python scripts/torsion_free_discovery.py --self-test
python scripts/torsion_free_discovery.py \
  --input public/examples/I2_5.json \
  --max-index 10 \
  --output artifacts/I2_5.torsion-free-discovery.json
```

The launcher tries native tools or managed WSL tools, enforces the requested
byte and time caps, and emits one deterministic record per attempted rung.
`scripts/torsion_free_finite_image.py` owns the exact residue construction,
finite-image recognition, witness cache, subgroup search, and packed module
spools. `scripts/finite_image_module_catalogue.py` seals compatible modules by
source, matrix, witness, action, and packed-row hashes for reuse across runs.
`scripts/packed_composite_solver.py` searches all diagonal orbits of
the admitted factorwise witness-covering combinations and uses double-coset
data where available. Its minimum flag is scoped to that admitted family; only
a candidate whose degree equals the independent spherical lower divisor has a
global minimum-index certificate.
`scripts/gap_torsion_free_discovery.g` is the small-index fallback.

The `scripts/discovery_runtime/` package stages heavy Linux work in WSL's ext4
filesystem. Transient Sage/GAP files do not live in `/mnt/c` or the OneDrive
checkout. Persistent catalogues and checkpoints live at
`~/.cache/coxeter-viewer/torsion-free`, keyed by the full input and search
configuration hashes. The default portfolio admits four to six light probes
and one heavy subgroup worker under a byte semaphore. A cancel file or timeout
kills the whole process group.

Keep recognition payloads, tables, subgroup frontiers, permutation spools, and
checkpoint journals in that WSL ext4 workspace as well. Copy only final
manifests and result artifacts back to the Windows checkout. This avoids making
large exact-group jobs pay the `/mnt/c` and OneDrive metadata cost.

Use a dedicated checkpoint directory for a long run:

```bash
python scripts/torsion_free_discovery.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output artifacts/compact-5-cube.torsion-free-discovery.json \
  --checkpoint-dir artifacts/.compact-5-cube-checkpoints \
  --max-index 576000 \
  --max-module-candidates 512 \
  --max-low-index-fallback 512 \
  --max-memory-bytes 12884901888 \
  --light-workers 4 \
  --heavy-workers 1 \
  --timeout 1800
```

The finite-image worker can also be profiled directly under Sage:

```bash
sage scripts/torsion_free_finite_image.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --prime 2 \
  --probe-only \
  --output /tmp/compact-cube-mod2-probe.json
```

Do not put `--cache-dir` under `/mnt/c` unless deliberately testing the slow
interop path. Microsoft recommends the Linux filesystem for Linux command-line
workloads. The runtime copies only final artifacts and manifests back to the
research workspace.

On a 24 GB Windows development machine, a conservative optional WSL 2 budget is
16 GB of RAM and 12 GB of swap. Put this in `%UserProfile%\.wslconfig`, then run
`wsl --shutdown` before the next backend job:

```ini
[wsl2]
memory=16GB
swap=12GB
```

This setting is not installed or changed by the project. Swap protects against
an abrupt allocation failure; it does not make a poor enumeration fast. Keep
`--max-memory-bytes` below the WSL memory limit so Windows and the viewer remain
responsive.

Partial modules stay as hashed 16- or 32-bit permutation spools. Full JSON rows
are written only after a candidate passes; the app derives Schreier data from
that passing action. The independent certificate checks that each maximal
spherical subgroup has orbit size `|W_T|` at every point. Fixed-point coverage
or a backend `passed` flag alone is not accepted.

The downstream code has two inputs. A manageable action can materialize the
complete Davis quotient. A large regular congruence kernel may instead use the
symbolic deck-group path in `src/torsionFree/symbolicRegularCover.ts`. The
symbolic path is theorem-facing only when its orbit catalogues carry canonical
representatives, stabilizers, transporters, and replayable partition checks;
counts and caller-supplied `passed` flags are not enough.

A symmetry-restricted wall search has asymmetric conclusions. Failure is
inconclusive because a nonsymmetric coorientation may exist. A positive sign
assignment may promote only after exact transport defines it on every wall,
all rank-two cocycle equations pass, the complete Reidemeister-Schreier map and
relators replay, gcd normalization has explicit Bezout coefficients, the
compatible pulling-Morse construction is certified, and every ascending and
descending link orbit is nonempty and connected. Collapsibility is an optional
stronger diagnostic. No compact-5-cube symbolic fibering artifact currently
passes that complete chain.

The packed solver's completeness is bounded and specific: it exhausts the
recorded factorwise witness-covering combinations and all their diagonal
orbits. It does not claim to find exceptional free orbits from non-covering
factor sets, prove minimum index, or guarantee discovery on a laptop.

The TypeScript `src/torsionFree/` layer independently checks selected actions
before the viewer uses them and contains the symbolic orbit model. Its focused
regression test is:

```bash
corepack pnpm exec vitest run tests/symbolic-regular-cover.test.ts
```

This test exercises the fail-closed data flow with synthetic fixtures. Passing
it is software validation, not a compact-cube fibering certificate. The
desktop bridge exposes finite-cover discovery as the controlled
`discoverTorsionFreeCover` job.

CoxIter is not a substitute. Its documented commands concern hyperbolic
Coxeter invariants and diagram checks, not low-index subgroup enumeration.
Project wrappers therefore keep CoxIter in the independent-checker lane.

See [Automatic torsion-free cover discovery](torsion-free-cover-discovery.md)
for the mathematical criterion, artifact requirements, and the route from the
cover to an explicit `H -> Z`.

### Coordinated compact-cube search

Three bounded search tracks share one source hash, spherical catalogue, and
promotion gate:

```bash
corepack pnpm cover:search:coordinated:plan
corepack pnpm cover:search:finite-target:plan
corepack pnpm cover:search:finite-target:ideal-cube
corepack pnpm cover:search:everitt:plan
corepack pnpm cover:search:orbifold:plan
corepack pnpm cover:search:orbifold:ideal-cube
corepack pnpm cover:search:priority:plan
corepack pnpm cover:search:block-amalgam:r1:5760
corepack pnpm cover:search:block-amalgam:r2:5760
corepack pnpm cover:search:block-amalgam:r3:5760
corepack pnpm cover:search:block-amalgam:r4:5760
corepack pnpm cover:search:block-amalgam:r5:5760
corepack pnpm cover:search:block-amalgam:r6:5760
```

The plan command is cheap: it verifies the 32 maximal spherical subgroups,
derives the exact index divisor, screens finite targets, enumerates the local
cube-development constraints, and records what module catalogues the
composite track still needs. A real coordinated run is:

The two ideal-cube commands are executable controls rather than dry runs. The
finite-target command recovers an index-`24` `S4` kernel. The direct orbifold
command exhausts its declared small symmetric-target scope and also finds an
index-`6` `S3` kernel. Both results are replayed against every maximal
spherical subgroup; neither is inferred from target order alone.

The six block-amalgam commands are exact follow-ups to `R0`. `R1`
enumerates all 210 local second-gluing port orbits in the documented uniform
stratum. `R2` tests all 98 chords outside a fixed spanning tree with each of
the 47 noncanonical equivariant `P`-maps. `R3` exhausts the 294 supports made
of two changed fundamental chords sharing one non-root `C`-block and all
`47^2` nonidentity map pairs on each support.

`R4` proves a stronger local obstruction instead of enumerating supports. A
failed `(g4 g7)^3` walk stays inside the root `D4 x A1` residue for all 210
local `C/P` classes and all seven first-stage branches. It therefore survives
arbitrary changes on the other fourteen residues and arbitrary assignments on
all 98 non-tree chord coordinates in the fixed-tree map slice. This closes
different-block pairs, supports of size at least three, and all nonuniform
new-residue port-class assignments while
the existing-side port skeleton is canonical. `R5` repeats the local proof for
every existing-side skeleton one transposition from canonical in that slice.
`R6` canonically enumerates the 266,560 distance-two skeletons and compresses
their local checks by root signature. Its packed relation evaluator uses Numba;
install the pinned Python packages from `requirements-ci.txt`. Checkpoints are
safe to resume only when their source and implementation hashes still match.
`R7` takes the 898 locally viable distance-two signatures from `R6`, restores
their unique support-two skeletons, and propagates the relation constraint
over all fifteen residues. The complete run exhausts 3,001 branch cases and
630,210 local-class choices without a surviving second-gluing row. Run it with
`corepack pnpm cover:search:block-amalgam:r7:5760`; its prerequisite is the
current sealed `R6` artifact.

The `r6:full-frame` command runs a declared depth-5 prefix window. The stored
window covers 100 canonical prefixes in every signature/branch case and keeps
93 locally replayed frames; it does not produce complete 5,760-point rows or
claim full-frame exhaustion.

The `r8:extract-seeds` command converts those 93 checkpoint records into a
small sealed catalogue bound to the R6 certificate, checkpoint outcome hash,
source hash, and implementation hash. The `r8:5760` command runs the bounded
candidate-first globalizer with a 30-minute, 6 GB, five-million-node budget:

```bash
corepack pnpm cover:search:block-amalgam:r8:extract-seeds
corepack pnpm cover:search:block-amalgam:r8:5760
```

The recorded run terminates much earlier. Ten exact root-frame replays learn
ten forced-boundary conflicts, and those clauses reject all 93 seeds after 734
cache hits. The result says that the supplied local seeds cannot be extended
through their exact distance-two residue partitions. It does not exclude the
rest of the full-frame space, so the artifact keeps `complete: false` and makes
no cover claim.

These are exact negative results for their stated scopes, not for the full
second-gluing double quotient. The full local torsor factor is
`24^15 * 48^105`; it cannot be replaced by `48^98` using the known residual
centralizer. Existing-side permutations beyond the declared distance layers
also remain open.

The priority plan records the strict search order
`W(D6) -> W(B6) -> W(E6) -> nonnormal finite-image actions -> odd-prime and
composite modules`. Run a long campaign from the pinned Sage environment and
keep its output under WSL's Linux filesystem:

```bash
sage scripts/ordered_cover_search_campaign.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output-dir "$HOME/.cache/coxeter-viewer/ordered-compact-5-cube"
```

Use `--resume` after interruption. The campaign replays source,
implementation, request, and artifact hashes before reusing a terminal stage.
The Weyl stages are short because they enumerate structural `A5` subgroup
classes and extend them modulo pointwise centralizers.

To reuse completed characteristic-2 and characteristic-3 workers, pass each
sealed child with `--nonnormal-artifact`. The ordered campaign validates their
common spherical and witness catalogues before advancing:

```bash
sage scripts/ordered_cover_search_campaign.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output-dir "$HOME/.cache/coxeter-viewer/ordered-compact-5-cube" \
  --nonnormal-artifact path/to/p2.json \
  --nonnormal-artifact path/to/p3.json
```

```bash
python scripts/coordinated_cover_search.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output-dir .cover-search/compact-5-cube \
  --catalogue path/to/mod2.modules.json \
  --catalogue path/to/mod3.modules.json \
  --witness-catalogue path/to/witnesses.json \
  --parallel 3 \
  --timeout 7200 \
  --max-memory-bytes 12884901888
```

The coordinator gives each child process a hard share of the byte budget and
kills its process tree on timeout. Search plans, target order screens, and
witness-set coverage are not promoted as covers. Only concrete generator
permutations that pass an independent relation replay and regular spherical
orbit checks can enter the Davis-quotient pipeline. The full mathematical and
artifact contract is in
[Coordinated Search For A Manageable Torsion-Free Cover](coordinated-cover-search.md).

The compact-5-cube command runs the complete bounded ladder. It can take much
longer than the self-tests. A missing runtime, cancellation, or exhausted bound
produces a deterministic incomplete artifact; it never fabricates a subgroup
from Selberg's lemma and never turns a bounded failure into a nonexistence
claim.

Once a complete quotient action is available, the browser's **Search full
Davis quotient** action runs the wall-sign search and full link checks in a
persistent worker. The focused regression gate is:

```bash
corepack pnpm validate:full-davis-fibering
```

It checks the complete cell-poset constructor, SHA-256 evidence chain,
compatible pulling triangulation, rational height perturbation, full directed
links, collapse-certificate replay, action/quotient mismatch rejection, and
tamper detection. The full mathematical construction is documented in
[Full Davis-quotient fibering certification](full-davis-fibering-certification.md).

## Manual Finite-Action Export And Import

Manual finite-action import is the advanced fallback. The bundled `I2(5)`
identity-subgroup action has ten vertices. From it, the app reconstructs
`hat X`, validates every generator and finite rank-two orbit, and constructs
the signed compression `bar X`.

The existing quotient exporters produce actions for supplied subgroup words or
the bounded finite demo cases. They enumerate only finite Coxeter sources; they
do not turn subgroup words in the bundled infinite compact hyperbolic groups
into finite coset actions.

```bash
pnpm quotient:sage:export:i2-5-demo
pnpm quotient:gap:export:i2-5-demo
pnpm quotient:sage:export:a3-demo
pnpm quotient:gap:export:a3-demo
pnpm compare:quotient-backends
pnpm workflow:validate
pnpm validate:virtual-fibering
```

If an external program already supplied a complete transitive action, run the
theorem-facing wall-character path directly:

```bash
corepack pnpm cover:fiber:user-action -- \
  --example compact_5_cube_gamma1 \
  --action ACTION.json \
  --output promotion.json
```

`ACTION.json` may be the raw `{id,index,generatorImages}` candidate, a wrapper
containing that candidate, or the packed automatic-discovery envelope. The
runner computes its own action hash and independently rechecks spherical
freeness. It can certify virtual algebraic fibering in the searched wall
family; it does not run the scalable full-`H^1` path or certify smooth
fibering.

To validate a certificate exported from **Covers + Walls**:

```bash
node scripts/validate_virtual_fibering.mjs path/to/example-virtual-fibering.certificate.json
```

This command uses the same typed checker as the app but runs outside React. It
recomputes exact integer sums and finite graph witnesses. It does not replace
the finite-action or torsion-free certificate named by the artifact.

`scripts/run_quotient_export.mjs` is the stable manual-export entry point. It tries
native Sage/GAP exports first, then WSL-backed routes on Windows, and records the
attempted tool path. When Sage is available,
`scripts/sage_quotient_export.py` performs finite Coxeter subgroup enumeration
with Sage algebraic-real reflection matrices, builds the left-coset action
`H\W`, emits quotient vertices/edges/rank-two cells, and attaches input/output
hashes. When GAP is available, `scripts/gap_quotient_export.py` asks GAP to
enumerate the finite Coxeter presentation and subgroup cosets, then serializes
the same finite-action contract with an `external-gap-kbmag` Schreier
certificate. If an external tool is missing or the request is outside the
finite scope, the wrapper falls back to the deterministic in-repo finite coset
builder and labels that status explicitly.

For fast deterministic unit tests, set
`COXETER_QUOTIENT_EXTERNAL_MODE=in-repo` before calling
`scripts/run_quotient_export.mjs`. The standalone validation commands above
leave the mode unset so native Sage/GAP parity is still checked when those tools
are installed.

`skipped` means the external runtime was not callable or did not support that
request. `in-repo checked` means the finite action and Coxeter relations were
verified by repository scripts. `external certified` means the subgroup/coset
enumeration was actually performed by a recorded external tool and its hashes
were stored.

The browser applies stricter preconditions before calling the result a cover in
the sense needed by the wall workflow: generator actions must be fixed-point
free, involutive, and bijective, and every finite dihedral orbit must have size
`2m`. The generated `hat X -> bar X` compression then carries its own exact
count, fiber, boundary, and attaching-map certificate. Even these checks do not
replace a global torsion-free subgroup certificate in higher rank. Do not use a
finite-action export alone to claim torsion-freeness, asphericity, manifold
status, or incoherence.

This manual exporter starts from subgroup data or a finite demo that is already
specified. Automatic GAP exclusion, Sage congruence kernels, and composite
permutation modules are handled by the separate discovery ladder above.

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
pnpm certify:compact-5-prism-family
python scripts/certify_geometry_intervals.py public/examples/compact_5_cube_gamma1.json
python scripts/certify_geometry_intervals.py public/examples/compact_5_prism_makarov.json
python scripts/certify_ideal_hyperbolic_3_cube.py public/examples/ideal_hyperbolic_3_cube_m3.json
python scripts/certify_geometry_intervals.py public/examples/compact_5_polytope_p1_double_makarov.json
python scripts/certify_geometry_intervals.py public/examples/compact_5_prism_makarov_p2.json
python scripts/coxiter_check_compact.py public/examples/compact_5_cube_gamma1.json --require-external
python scripts/coxiter_check_compact.py public/examples/compact_5_prism_makarov.json --require-external
python scripts/coxiter_check_compact.py public/examples/compact_5_polytope_p1_double_makarov.json --require-external
python scripts/coxiter_check_compact.py public/examples/compact_5_prism_makarov_p2.json --require-external
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

For browser-level timing, build the app and run:

```bash
pnpm bench:timed
pnpm bench:timed:write
pnpm bench:timed:check
```

The benchmark starts its own local production server over `dist/`. Set
`COXETER_BENCHMARK_URL` only when deliberately measuring another build.

The timed benchmark selects the core examples/radii in the app and records
scene stats from the renderer. Those stats include which dense-text and picking
path was active, so a speedup cannot quietly come from dropping labels or
selection work. The structural snapshot ignores elapsed times so performance
changes can be inspected without introducing timestamp churn.
