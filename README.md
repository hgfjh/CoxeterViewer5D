# CoxeterViewer5D

CoxeterViewer5D is an offline-capable viewer for Coxeter groups, finite cover
complexes, wall systems, and local Morse data. It combines five related views:

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

For a first pass:

1. Load `I2(5)` and open **Davis** to see its decagonal rank-two cell.
2. Load **Ideal 3-cube, all m=3 (S4 cover)** for the smallest bundled example
   that connects certified hyperbolic reflection data to a nontrivial
   torsion-free cover. Open **Gamma** to see its octahedral finite-relation
   graph, then compare **hat X** and **bar X**.
3. Open **Gamma** to read the defining generators and finite relations.
4. In **Covers + Walls**, press **Find torsion-free cover**. The desktop app
   runs the bounded automatic strategy ladder; the bundled `I2(5)` action
   remains ready as a quick example.
5. Compare **hat X** with **bar X** and inspect the compression fibers.
6. Open **Walls**, select one wall, and then flip its coorientation.
7. Open **Lawful cells** to see which polygons have one source and one sink.
8. Press **Run lawful-first certification**; use **Check full Davis quotient**
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

The one-vertex complex and state/move legal-system reader from earlier releases
are not part of the current model switch. The wall-coorientation workflow is
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

The wall workflow does not by itself prove incoherence or a fibering theorem.
The Jankiewicz--Wise argument uses additional hypotheses, including an
appropriate finite torsion-free cover, globally coorientable two-sided walls,
an aspherical affine 2-complex, and nonempty connected ascending and descending
links. Embeddedness and absence of self-osculation support the paper's random
orientation estimates; they are not extra gates once one concrete
coorientation and all of its cells and links are checked directly. Their
incoherence result adds further group-theoretic and Euler-characteristic input.

The intended virtual algebraic-fibering output is nevertheless concrete: a
finite-index subgroup `H`, an explicit primitive homomorphism `H -> Z`, checked
cell-boundary sums, and the relevant Morse links. The app should call this a
verified algebraic fibration only when the finite-index, torsion-free,
surjectivity, affine/aspherical, and finitely-generated-kernel hypotheses all
carry matching evidence.

This matters for the compact hyperbolic 5-dimensional examples. Their
rank-two compression is useful for finding and coorienting walls, but it is not
the complex on which the final five-dimensional Morse links are checked. The
full certificate reconstructs every spherical Coxeter cell of
`K = H\Sigma`, gives those cells one compatible pulling subdivision, builds an
exact rational height, and checks both directed links at every quotient vertex
orbit. Until a complete torsion-free action and every later stage pass, the UI
reports an incomplete calculation rather than a fibering claim.

There are therefore two independently replayed certification tracks:

- [the lawful-subcomplex-first track](docs/two-track-fibering-certification.md),
  which checks the actual retained polygonal complex and transfers finite
  generation through `pi_1(Y) -> H`;
- [the full Davis-quotient track](docs/full-davis-fibering-certification.md),
  which constructs an explicit PL Morse model on every Coxeter cell of
  `K = H\Sigma`.

The first track also records an optional generalized lawful subcomplex: remove
every unlawful 2-cell and all of its higher cofaces. That rule produces a
genuine maximal subcomplex, but closure alone does not prove its asphericity or
extend the Morse map across retained higher cells. Those are separate gates.

The full-Davis note defines the complete cell poset, quotient walls,
Reidemeister--Schreier generators, gcd normalization, pulling triangulation,
quotient-periodic tie breakers, full ascending and descending links, and the
optional collapsibility check. It also states exactly why a passing algebraic
fibration is not automatically a locally trivial topological bundle.

## Current Research Status And Bring Your Own Action

The end-to-end command-line path now accepts a complete transitive right coset
action for any bundled Coxeter system. The input is the action, not merely a
list of subgroup generators:

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

Each generator row must contain exactly `index` zero-based images; the number
and order of rows must match the bundled Coxeter generators. Run:

```bash
corepack pnpm cover:fiber:user-action -- \
  --example I2_5 \
  --action my-action.json \
  --output promotion.json
```

The command distrusts any torsion-free label, rechecks the Coxeter relations
and every spherical-special-subgroup orbit, constructs the quotient, and runs
the bounded lawful-first/full-Davis wall-character search. A passing result is
a replayed **virtual algebraic fibration**. A failed or incomplete result is
only about the recorded search family and bounds. For an infinite compact
Coxeter group, subgroup words alone are not yet converted to a finite coset
action by the generic exporters.

This is not yet a full integral `H^1` or smooth-fibering orchestrator. The
scalable generic integral `H^1` backend can prepare and certify large action
matrices, but its emitted kernel witness is not wired into the all-character
Morse/link search. The materialized path searches wall characters. Smooth
fibering is not certified: the repository has no source-bound
manifold/PL/smoothing verifier, and caller-supplied IMM-style booleans are
ignored.

Current theorem-facing results are:

- the JNW rank-eight control passes virtual algebraic fibering but is a
  two-dimensional Davis complex, not a compact hyperbolic 5-manifold;
- the imported compact-cube action has `H^1 = Z^19`, but its recorded Track-B
  height complex obstructs every nonzero integral character and its bounded
  rescue found no passing original-vertex link system;
- the P0/P1 and Tumarkin compact portfolio has certified source plans but no
  materialized torsion-free action, hence no fibering result.

See [the research portfolio](docs/fibering-research-portfolio.md),
[the generic external job contract](docs/generic-h1-external-job.md), and
[the scalable integral-H1 protocol](docs/scalable-generic-integral-h1.md).

## How Do I Run Web/Desktop?

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
the certified regular ideal hyperbolic 3-cube, certified compact 5-cube and
compact 5-prism-family data, and the compact eight-facet catalogue transcribed
from Tumarkin's classification. Each certificate has a limited scope. A passed
Gram/signature check, for example, does not certify the browser's 3D placement.

The ideal 3-cube is the golden cover example. Its six facet generators are the
transpositions `t12`, `t13`, `t14`, `t23`, `t24`, and `t34`. Two generators
have `m = 3` when the transpositions share a letter, so Gamma is an octahedron;
the three disjoint pairs have `m = inf`. Sending `tij` to `(ij)` gives a
surjection onto `S4`. The bundled regular action has 24 points, and the app
checks every spherical `A1` and `I2(3)` restriction before calling its kernel
torsion-free. The cube is finite-volume and ideal, not compact: each vertex
link is the Euclidean triangle `(3,3,3)`.

Open **Choose Example -> Certified eight-facet catalogue** to reach all 16
eight-facet cases without expanding the first-use interface.

Finite cover construction needs more than a Coxeter matrix, but users should
not normally have to write the missing action by hand. The primary backend
enumerates prime-order torsion in spherical special subgroups, constructs exact
congruence images, and rejects impossible action degrees from matrix-group and
fixed-point-mark data before it constructs a coset action. Compatible partial
actions are cached and may be combined on diagonal orbits. Generic GAP
low-index enumeration remains a bounded fallback. A selected action receives a
second, independent spherical-action certificate in the app.

The status panel separates **torsion-free finite-index kernel**, **exact index
certified**, and **usable finite cover materialized**. Exact matrices over a
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
corepack pnpm check:independent
```

Commands that invoke Sage, GAP, KBMAG, or CoxIter require those tools to be
installed or available through the documented container/WSL path.

## Documentation

- [Mathematical conventions](docs/math.md): `X`, `\hat X`, `\bar X`, walls,
  lawful cells, links, and theorem boundaries.
- [Automatic torsion-free cover discovery](docs/torsion-free-cover-discovery.md):
  spherical torsion witnesses, bounded GAP search, exact Sage congruence
  kernels, Everitt-style composite actions, and the route from a subgroup to
  `H -> Z`.
- [Coordinated compact-cube cover search](docs/coordinated-cover-search.md):
  the finite-target, composite-module, and geometry-informed search tracks,
  including the exact reason every cover degree is divisible by `5,760`.
- [Virtual algebraic fibering certificate](docs/virtual-algebraic-fibering.md):
  Schreier generators, wall periods, primitivity, lawful cells, and the exact
  PL Morse checklist.
- [Data format](docs/data-format.md): import contracts, signed attaching maps,
  compression certificates, wall results, and export status.
- [Viewer design](docs/viewer-design.md): model switch, Covers + Walls workflow,
  drawing rules, performance, and interaction design.
- [Walkthroughs](docs/walkthroughs.md): short guided readings of Davis cells,
  cover compression, walls, lawful cells, Gamma, and projections.
- [References](docs/references.md): sources and the exact claims each source
  supports.
- [Tooling](docs/tooling.md): external backends, containers, desktop builds,
  and release commands.

## License And Citation

Unless otherwise noted, CoxeterViewer5D source code, scripts, bundled JSON
examples, and documentation are released under the Apache License 2.0. Source
references cited in the data remain the property of their authors and
publishers; this project licenses only its own transcriptions, code, and
generated artifacts.

Academic citation metadata is in [CITATION.cff](CITATION.cff).
