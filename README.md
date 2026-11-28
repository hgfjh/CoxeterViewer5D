# CoxeterViewer5D

CoxeterViewer5D is an offline-capable viewer for Coxeter groups, finite cover
complexes, wall systems, and local Morse data. It combines five related views
(the **View** buttons read **Davis complex**, **hat X cover**, **bar X
compression**, **Defining graph Gamma**, and **Projection drawing**):

- **Davis**: a finite Cayley ball with visible Davis cells;
- **hat X** (`\hat X`): a finite cover of the standard Coxeter presentation
  2-complex;
- **bar X** (`\bar X`): the compression of `\hat X` used by
  Jankiewicz--Wise;
- **Gamma** (`\Gamma`): the defining graph of the Coxeter system;
- **Projection**: chamber barycenters drawn from supplied reflection data.

The app is a research and teaching instrument, not a theorem prover. Incidence
computed from validated finite data can be exact while the 3D placement remains
a drawing. The interface labels those two claims separately.

## What Is This App For?

The main research path is **Covers + Walls**:

1. Choose a Coxeter system.
2. Ask an exact backend to find a finite-index torsion-free subgroup `H` and
   its coset action.
3. Verify torsion-freeness by testing prime-order torsion from the spherical
   special subgroups.
4. Build `\hat X` from the lifted presentation cells.
5. Compress it to `\bar X`.
6. Find and coorient the walls of `\bar X`.
7. Extract the induced homomorphism `H -> Z`.
8. Inspect lawful cells and the ascending and descending links used in the
   Morse-theoretic argument.

This follows the setup in Kasia Jankiewicz and Daniel T. Wise,
[_Incoherent Coxeter Groups_](https://arxiv.org/abs/1503.03102). The viewer can
also search over wall coorientations to retain many lawful cells. That search is
an application feature, not a theorem from the paper.

Automatic cover discovery is the intended primary backend path. The current
source already validates finite actions and carries out the cover,
compression, wall, lawfulness, and finite-link calculations. The controlled
desktop job now runs a bounded strategy ladder: exact Sage congruence images,
matrix and table-of-marks screening, reusable partial modules and their
Everitt-style diagonal products, then a small GAP low-index fallback. An exact
reduction can certify a large normal torsion-free kernel without pretending
that its cover has been built. The browser constructs `\hat X` only when a
manageable generator action is also present and passes an independent check.
The fibering step then
writes a deterministic Reidemeister--Schreier presentation, evaluates the wall
map on every Schreier generator and relator, normalizes its period gcd, and
checks every stated PL Morse hypothesis. Manual finite-action import stays
available as the advanced fallback.
See
[Automatic torsion-free cover discovery](docs/torsion-free-cover-discovery.md)
for the algorithm and the exact status language.

## What Can I Click First?

On a first visit the app offers a guided tour. It runs through every view on
the ideal 3-cube and its S4 cover, and can be skipped at any step. The
question-mark button in the top bar restarts it, and `?tour=1` in the URL opens
it directly (`?tour=0` suppresses it). The tour does not open automatically
under browser automation, so scripted screenshots and tests are unaffected.

For a first pass on your own:

1. With **I2(5) wall demo** (the default example), open **Davis complex** to
   see its decagonal rank-two cell.
2. Load **Ideal 3-cube, all m=3 (S4 cover)** for the smallest bundled example
   that connects certified hyperbolic reflection data to a nontrivial
   torsion-free cover. Open **Defining graph Gamma** to see its octahedral
   finite-relation graph and read the defining generators and finite
   relations.
3. In **Covers + Walls**, press **Find torsion-free cover**. The desktop app
   runs the bounded automatic strategy ladder; the bundled `I2(5)` and ideal
   3-cube actions remain ready as quick examples.
4. Compare **hat X cover** with **bar X compression**; the **Covers + Walls**
   workflow list gives the compression counts.
5. In **bar X compression**, with **Relation family in bar X** on **Compact
   gluing**, choose a wall in **Select a wall** and press **Flip selected
   wall**.
6. Press **Find largest lawful subcomplex**, then click a relation polygon to
   see whether it has one source and one sink.
7. Press **Run lawful-first certification**; use **Check full Davis quotient**
   for the all-cell fallback. Inspect or export the resulting certificate.

The **Start Here** panel names these paths directly:

- **Explore a Coxeter example**
- **Find a torsion-free cover**
- **Find walls in bar X**
- **Coorient walls**
- **Inspect exactness and data status**

The **Focus Inspector** answers three questions throughout the app:

- What is selected?
- Why is it here?
- Is it exact data, a browser check, or a drawing?

## The Five Models

**Davis** shows the Cayley graph and cells associated to spherical special
subgroups. Its finite-radius boundary may clip cells.

**hat X** shows the lifted Coxeter presentation complex before compression. Its
directed generator lifts and lifted 2-cells come from a discovered or imported
finite action. Calling this data a torsion-free cover requires a complete
prime-order fixed-point certificate or equivalent subgroup evidence; a
permutation action by itself does not prove torsion-freeness.

**bar X** shows the compressed even-sided 2-complex. The two lifted generator
bigons based at opposite ends of an `s_i` orbit collapse with their two
directed boundary edges to one geometric edge. The `2m_ij` relation lifts in
one finite-dihedral orbit become one `2m_ij`-gon. Walls and lawful cells are
computed here.

**Gamma** shows the defining Coxeter graph. The app can include `m = 2` edges
when a full finite-relation graph is useful. Pairs with `m = inf` are omitted
because they do not define a finite rank-two relation.

**Projection** applies supplied reflection data to chamber barycenters and
projects the result to three dimensions. A Klein, Poincare, axes, or PCA view
is still a projection unless the displayed certificate states a narrower
verified claim.

The one-vertex complex and the JNW legal-system game reader from earlier
releases are not part of the current model switch. The wall-coorientation workflow is
the general object used by the current source tree.

## What Is Exact?

The app uses four deliberately different status levels:

- **Certified source data**: a stored artifact and hashes support a stated
  transcription, Gram, geometry-interval, or external-checker scope.
- **Exact incidence**: finite combinatorial data pass the in-repo validators.
  Examples include signed attaching maps, compression fibers, wall classes,
  and lawful-cell tests.
- **Browser diagnostic**: a deterministic computation has passed, but it is
  not an external theorem certificate. Wall pathology checks and a completed
  small exact coorientation search normally belong here.
- **Drawing**: coordinates, spacing, clipping, transparency, and camera
  choices used to make the same incidence data legible.

A result called **maximum** must come from a completed exhaustive or
branch-and-bound search with matching bounds. A timed or heuristic search is
reported as **best found**, together with its lower bound and any available
upper bound.

## What Is Only A Drawing?

The app never treats a convenient 3D placement as part of the cell complex.
Node coordinates, force relaxation, parallel-rail offsets, wall arcs through a
polygon, transparency, clipping, and camera choices are drawings. The objects
they refer to can still be exact: a wall arc, for example, connects the exact
pair of opposite boundary occurrences recorded for that relation cell.

Projection mode is also a drawing. Even when interval certificates support the
reflection data or bound selected coordinates, the final three-dimensional
axes or PCA view need not preserve hyperbolic distances, angles, or
intersections.

## Theorem Boundaries

Wall data alone do not prove incoherence or fibering. Once a finite
torsion-free action is in hand, the repository has three ways to turn a wall
orientation, or another integral class, into a theorem-level claim. Each route
states what it certifies:

| Route                     | Complex and height                                                                          | Certifies                                                                                                                                                                                  | Doc                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Track A**               | lawful subcomplex `Y` of the compression `bar X`, wall cocycle                              | virtual algebraic fibration, by the Bestvina--Brady bounded-height-band argument and the surjection `pi_1(Y) -> H`                                                                         | [virtual-algebraic-fibering.md](docs/virtual-algebraic-fibering.md)               |
| **Track B**               | full Davis quotient `K = H\Sigma`, pulling triangulation, exact rational cell-local heights | virtual algebraic fibration, with nonempty connected links at every vertex orbit                                                                                                           | [full-davis-fibering-certification.md](docs/full-davis-fibering-certification.md) |
| **Low-barycentric (IMM)** | `K` with the low-barycentric subdivision `h(F^) = min h + codim(F) eps`                     | exact scores for both gates at every vertex; if every link is collapsible on a compact smooth manifold of dimension at most 5, IMM Theorem 8 makes the map homotopic to a smooth fibration | low-barycentric-morse.md                                                          |

Here a **virtual algebraic fibration** means an epimorphism `H -> Z` from a
finite-index subgroup with a finitely generated kernel. It is not a
topological or smooth bundle claim. The low-barycentric route currently scores
and searches orientations, but it does not yet emit a replayable certificate
(see [Bring Your Own Cover](#bring-your-own-cover)).
[Two-track certification](docs/two-track-fibering-certification.md) explains
how the routes relate and which evidence each one replays.

Embeddedness and absence of self-osculation support the probabilistic
orientation estimates of Jankiewicz--Wise. They are not extra gates once one
concrete orientation and all of its links are checked directly. Asphericity and
CAT(0) evidence are optional stronger diagnostics for Track A.

## Bring Your Own Cover

The pipeline takes a complete transitive right coset action of the Coxeter
group, given as one image row per generator. A list of subgroup generators is
not enough; see
Compact action import and
[Torsion-free cover discovery](docs/torsion-free-cover-discovery.md) for how to
obtain an action. Two input forms are accepted:

- a JSON candidate with `index` and `generatorImages` (small and medium actions):

  ```json
  {
    "id": "i2-5-regular-action",
    "index": 10,
    "generatorImages": [
      [1, 0, 3, 2, 5, 4, 7, 6, 9, 8],
      [9, 2, 1, 4, 3, 6, 5, 8, 7, 0]
    ]
  }
  ```

- a `generator-permutation-files` manifest of SHA-pinned packed `uint32le`
  rows, for actions with tens of millions of points.

Every stage distrusts the label it is given. It rechecks the Coxeter relations
and every spherical-special-subgroup orbit before it calls the action
torsion-free.

| Stage                                                                                                                     | Command                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Torsion-free check, quotient, and bounded Track A / Track B wall-character search with a replayed certificate             | `corepack pnpm cover:fiber:user-action -- --example I2_5 --action my-action.json --output promotion.json`                      |
| Packed actions at scale: load, torsion-free certificate, streamed oracle (cells, walls, two-sidedness), `H^1` preparation | `corepack pnpm bench:pipeline --system SYSTEM.json --manifest MANIFEST.json --stages load,torsion,oracle,h1 --workers N`       |
| Proof-carrying full integral `H^1` and intrinsic Track B                                                                  | `corepack pnpm cover:fiber:scalable-h1 -- --example ... --action ... --rank-certificate ... --kernel-witness ... --output ...` |
| Low-barycentric score of given wall orientations                                                                          | `corepack pnpm lowbary:score --system ... --manifest ... --wall-sides ... --orientation ... --workers N`                       |
| Iterated local search over wall orientations                                                                              | `corepack pnpm lowbary:search --system ... --manifest ... --wall-sides ... --start ... --hours H --workers N`                  |

Results and hashes do not depend on `--workers`. A failed or incomplete result
is a statement about the recorded search family and bounds only.

What is not automated yet:

- **Low-barycentric certificates.** The route counts link classes exactly, but
  it does not write replayable collapse sequences or have an independent
  verifier. Both CLIs report the period gcd of the orientation's wall cocycle
  (gcd 0 means a zero class; otherwise the primitive class is the cocycle
  divided by the gcd), but there is no Schreier/Bezout certificate of the
  image as in Track A.
- **One-sided walls.** If some walls are one-sided, no orientation exists.
  There is no generic, scalable step that passes to a further cover on which
  they become two-sided.
- **Lower bounds.** The search cannot prove that no orientation passes. The
  forced-failure lower bound used for H5-P7-22
  (`scripts/h5_p7_22/min_forced_failures.py`) is a Python/OR-Tools research
  script.
- **Manifold hypotheses.** IMM's hypotheses (a compact smooth manifold, of
  dimension at most 5, with a compatible affine structure) are argued in the
  docs, not machine-checked.
- **Subgroup words.** For infinite compact Coxeter groups, subgroup words alone
  are not turned into a finite coset action by the generic exporters.

## Research Status

As of 2026-10-04 no compact hyperbolic 5-dimensional example has a certified
fibering or virtual algebraic fibration. For context: no closed hyperbolic
manifold of dimension at least 5 is known to fiber, while a finite cover that
algebraically fibers with a finitely generated kernel is known to exist
abstractly (see
[two-track certification](docs/two-track-fibering-certification.md)). An
explicit finitely generated kernel would therefore be explicit, not new; a
finitely presented or type-`F` kernel would be new. The main results:

- **H5-P7-22** (a compact 5-prism, rank 7). Its source is bundled as the
  example `compact_5_prism_h5_p7_22`. The certified Sylow-7 cover of index
  39,628,800 is torsion-free with `chi = 0`, and the packed pipeline runs on it
  in about 12 minutes. Ten of its 20 walls are one-sided. On the two-sided
  linear cover of index 79,257,600, a CP-SAT lower bound (solver output, not
  a replayable certificate) says that **every** wall orientation leaves at
  least 818,128 chambers with an empty or disconnected ascending link. Granting
  that bound, no wall orientation of that cover fibers by the low-barycentric
  construction with its present height rule; further covers and other height
  rules remain open. See
  the bundle README and
  low-barycentric-morse.md.
- **Compact 5-cube.** The imported action has `H^1 = Z^19`. Its Track B height
  complex obstructs every nonzero integral character, and the bounded rescue
  found no passing original-vertex link system.
- **Makarov P0/P1/P2 prisms.** Bounded campaigns cover action acquisition,
  orbifold `H^1`, structural finite-image screens, and many character and
  subdivision screens for P2. None has yet produced a materialized action that
  certifies virtual algebraic fibering.
- **Controls.** The JNW rank-eight right-angled control passes virtual
  algebraic fibering. It is two-dimensional, not a compact hyperbolic
  5-manifold. The 3-dimensional
  C(4,4;2,2;3,3) benchmark
  is reported there to fiber by wall orientation, the low-barycentric
  subdivision and IMM. It is
  bundled as the example `compact_3_tetrahedron_c44_2233` with its 336-sheet
  cover, and `tests/c44-golden-example.test.ts` reproduces the census, the 42
  two-sided walls and an orientation with score `(0, 0)` and period gcd 2. This
  is strong in-repo evidence, not a stored certificate; the writeup's original
  artifacts remain outside this repository.

[The research portfolio](docs/fibering-research-portfolio.md) has the full
status table, every per-experiment report, and the commands that reproduce
them.

## How Do I Run Web/Desktop?

### Hosted Browser App

Open the [GitHub Pages viewer](https://hgfjh.github.io/CoxeterViewer5D/) to try
the bundled `I2(5)` wall example. A WebGL 2-capable browser is needed for the
interactive 3D view. The browser can check imported finite actions, build their
cover and wall data within the viewer's limits, and run the bundled
lawful-subcomplex search. To run automatic GAP/Sage cover discovery, export a
search request for the desktop app or CLI and import the resulting artifact.

See [GitHub Pages deployment](docs/github-pages.md) for the build, static
preview, smoke test, and publishing instructions.

### Web App From Source

Install Node.js with Corepack enabled, then run:

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

Vite prints a local address, usually `http://127.0.0.1:5173/`. After the
dependencies are installed, ordinary use of the viewer is offline. Sage, GAP,
KBMAG, and CoxIter are optional external research tools, not browser runtime
dependencies.

For a production-style build:

```bash
corepack pnpm build
corepack pnpm preview
```

The static build is written to `dist/`.

To run research kernels on several worker threads, the page must be
cross-origin isolated so that workers can share action rows through
`SharedArrayBuffer`. `pnpm dev`, `pnpm preview` and the desktop app already
send the two required headers. A static host serving `dist/` should send them
too:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them the viewer still works and gives the same results, but runs
those kernels on a single thread.

For large packed actions on the command line, `pnpm bench:pipeline ...
--workers N` runs the torsion-free certificate and the streamed oracle with N
worker threads. Results and hashes are identical for every N.

### Desktop App

The desktop application is a Tauri v2 wrapper around the same viewer. Desktop
development also requires Rust and the Tauri prerequisites for your operating
system.

```bash
corepack pnpm desktop:dev
```

Build an unsigned local bundle with:

```bash
corepack pnpm desktop:build
```

Platform packages are written below `src-tauri/target/release/bundle/`.

The [v0.2.0 research preview](https://github.com/hgfjh/CoxeterViewer5D/releases/tag/v0.2.0)
contains the previously published web and desktop artifacts. Those binaries
may predate the cover-compression rewrite described by the current source tree.
Windows artifacts are unsigned and macOS artifacts are not notarized, so the
operating system may show a first-launch warning.

## Bundled Data And Certificates

The repository includes small finite examples, generated Sage/GAP fixtures,
the certified regular ideal hyperbolic 3-cube, the certified compact 5-cube,
and the closed 3D example `compact_3_tetrahedron_c44_2233`
(`C(4,4;2,2;3,3)`, with its 336-sheet cover). As of 2026-10-04 every known
compact hyperbolic Coxeter 5-polytope with 7, 8 or 9 facets is bundled:

- 7 facets: the three compact simplicial prisms P0, P2 and H5-P7-22, plus
  P1 = D P0 from Emery-Kellerhals;
- 8 facets: all 16 of Tumarkin's classification;
- 9 facets: all 51 of Ma-Zheng's classification (arXiv:2203.16049).

One question is open: P1 is combinatorially a 7-facet prism, but it is not in
Ma-Zheng's three-diagram prism figure. Whether Kaplinskaja's list (through
Esselmann's `d+2` theorem) counts it separately has not been checked against
Kaplinskaja's paper or Felikson's tables.

Each certificate has a limited scope. A passed Gram/signature check, for
example, does not certify the browser's 3D placement. The H5-P7-22 and
nine-facet sources are certified by `scripts/certify_compact_5d_catalogue.py`
for source transcription and Gram signature only; the 39.6M-point H5-P7-22
cover itself is not bundled with the example.

The ideal 3-cube is the golden cover example. Its six facet generators are the
transpositions `t12`, `t13`, `t14`, `t23`, `t24`, and `t34`. Two generators
have `m = 3` when the transpositions share a letter, so Gamma is an octahedron;
the three disjoint pairs have `m = inf`. Sending `tij` to `(ij)` gives a
surjection onto `S4`. The bundled regular action has 24 points, and the app
checks every spherical `A1` and `I2(3)` restriction before calling its kernel
torsion-free. The cube is finite-volume and ideal, not compact: each vertex
link is the Euclidean triangle `(3,3,3)`.

Open **Choose Example -> Certified eight-facet catalogue** to reach all 16
eight-facet cases, and **Certified nine-facet catalogue (Ma-Zheng)** to reach
all 51 nine-facet cases, without expanding the first-use interface. H5-P7-22 is
in **Core and featured examples**.

Finite cover construction needs more than a Coxeter matrix, but users should
not normally have to write the missing action by hand. The primary backend
enumerates prime-order torsion in spherical special subgroups, constructs exact
congruence images, and rejects impossible action degrees from matrix-group and
fixed-point-mark data before it constructs a coset action. Compatible partial
actions are cached and may be combined on diagonal orbits. Generic GAP
low-index enumeration remains a bounded fallback. A selected action receives a
second, independent spherical-action certificate in the app.

The **Search summary** in **Covers + Walls** separates **Torsion-free cover**
(a torsion-free finite-index kernel exists), **Exact cover index** (its index
is certified), and **Usable finite cover** (a complete generator action is
materialized). Exact matrices over a
finite field plus the complete spherical-injectivity checks can establish the
first before a structural computation determines the image order. The wall and
fibering pipeline requires the third.

The browser accepts the generated artifact or a complete manually supplied
generator action on a finite vertex set. Manual import is an advanced
compatibility path. When evidence is absent, the app may validate and display
the incidence, but it does not call the action torsion-free.

External tools follow the same rule. A missing tool produces a skipped or
blocked artifact, never a silent downgrade to a stronger in-repo claim.

## Validation

Run the ordinary release checks from the repository root:

```bash
corepack pnpm format
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm exec playwright test
corepack pnpm bench:timed:check
corepack pnpm workflow:validate
corepack pnpm validate:research-grade
```

Useful research checks include:

```bash
corepack pnpm compare:backends
corepack pnpm compare:quotient-backends
corepack pnpm validate:virtual-fibering
corepack pnpm registry:validate
corepack pnpm session:validate
corepack pnpm certify:compact-5-cube
corepack pnpm certify:compact-5-prism
corepack pnpm certify:tumarkin-8facet
corepack pnpm certify:compact-5d-catalogue
corepack pnpm check:independent
```

Commands that invoke Sage, GAP, KBMAG, or CoxIter require those tools to be
installed or available through the documented container/WSL path.

## Documentation

Background and conventions:

- [Mathematical conventions](docs/math.md): `X`, `\hat X`, `\bar X`, walls,
  orientations, lawful cells, links, and theorem boundaries.
- [Glossary](docs/glossary.md) and [Exact vs drawing](docs/exact-vs-drawing.md).
- [References](docs/references.md): sources and the exact claims each one
  supports.

Getting a cover:

- [Automatic torsion-free cover discovery](docs/torsion-free-cover-discovery.md):
  spherical torsion witnesses, bounded GAP search, exact Sage congruence
  kernels, and Everitt-style composite actions.
- Compact action import: JSON and packed
  `generator-permutation-files` actions.
- [Coordinated compact-cube cover search](docs/coordinated-cover-search.md).

From a cover to `H -> Z`:

- [Two-track certification](docs/two-track-fibering-certification.md): how
  Track A, Track B, and the low-barycentric route relate.
- [Virtual algebraic fibering certificate](docs/virtual-algebraic-fibering.md)
  (Track A): Schreier generators, wall periods, primitivity, lawful cells, and
  the PL Morse checklist.
- [Full Davis-quotient certification](docs/full-davis-fibering-certification.md)
  (Track B).
- Low-barycentric Morse objective: an exact
  score for a wall orientation, using the IMM face and coface links at every
  chamber and barycentre (`pnpm lowbary:score`), and a search over
  orientations (`pnpm lowbary:search`).
- [Scalable integral H1](docs/scalable-generic-integral-h1.md) and
  [the external H1 job](docs/generic-h1-external-job.md).
- [Known limits](docs/known-limits.md).

Research:

- [Research portfolio](docs/fibering-research-portfolio.md): status of every
  example, and the index of per-experiment reports.

App, data, and tooling:

- [Data format](docs/data-format.md): import contracts, signed attaching maps,
  compression certificates, wall results, and export status.
- [Viewer design](docs/viewer-design.md), [UI controls](docs/ui-controls.md),
  and [Walkthroughs](docs/walkthroughs.md).
- [Tooling](docs/tooling.md): external backends, containers, desktop builds,
  and release commands.
- [Performance audit](docs/performance-audit.md).
- [Scripts](scripts/README.md): every command-line script and its package
  command.

## License And Citation

Unless otherwise noted, CoxeterViewer5D source code, scripts, bundled JSON
examples, and documentation are released under the Apache License 2.0. Source
references cited in the data remain the property of their authors and
publishers; this project licenses only its own transcriptions, code, and
generated artifacts.

Academic citation metadata is in [CITATION.cff](CITATION.cff).
