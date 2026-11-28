# Viewer Design

The viewer is organized around mathematical layers, not around rendering
effects. A user should always be able to answer:

1. Which complex am I looking at?
2. Which parts are exact incidence?
3. Which parts are drawing aids?

The current product replaces the earlier one-vertex and legal-system game
readers with the cover-compression-wall pipeline from Jankiewicz--Wise.

## Architecture Boundaries

Domain code and UI code have separate jobs:

- `coxeter/` validates Coxeter systems and Gram data;
- `cayley/` generates finite Cayley balls;
- `davis/` finds Davis cells and local incidence;
- `quotient/` validates finite actions and subgroup/coset artifacts;
- `compression/` builds `\hat X`, compresses it to `\bar X`, and certifies the
  finite cellular map;
- `walls/` constructs walls, diagnoses pathologies, coorients them, tests
  lawfulness, computes links, and searches coorientations;
- `geometry/` handles Lorentzian data and projections;
- `render/` draws immutable scene records and handles interaction;
- `app/` coordinates workflows, panels, sessions, and exports.

React components must not reconstruct attaching maps or infer wall classes.
They display results returned by the domain modules.

## Model Switch

The main switch in the **View** panel has five stable entries, labelled as
below.

### Davis complex

Shows a finite Cayley ball, rank-two Davis polygons, and available higher
spherical incidence. The radius boundary is visible and clipped cells are
labeled as omitted or partial.

With a finite cover loaded, the **Unit cell** view (`src/davis/unitCell.ts`,
`src/app/unitCellScene.ts`) draws a Dirichlet-type fundamental domain `D` of
`H` instead of a ball: one chamber per coset, grown outward from `e` by a
best-first search that adds the nearest adjacent chamber of a new coset, so
`D` is connected and its accepting edges are a spanning tree of the coset
graph. Edges leaving `D` become pairs of tagged stubs (`a`, `a′`) that `H`
glues; chambers just outside are ghosts labelled by the coset they are
`H`-equivalent to; each bar X relation cell is lifted once; neighbouring
copies `h·D` are optional faint context. Combinatorics and gluings come from
the exact finite action. Positions reuse the reflection-orbit layout, and the
only floating-point decision, whether two words name the same chamber, is a
named Tits-matrix comparison that affects drawing coincidence only. The
default camera is an oblique view along the domain's principal axes.

### hat X cover

Shows the finite lifted presentation complex before compression:

- cover vertices;
- directed generator lifts;
- lifted generator bigons;
- lifted finite-relation polygons.

The scene should make inverse-paired directed lifts and relation-cell fibers
inspectable without pretending their 3D separation is part of the cover.

### bar X compression

Shows the compressed even-sided 2-complex:

- the same cover vertices;
- one geometric edge per pair of generator bigons over an involution orbit;
- one relation polygon per common compressed boundary.

Walls, coorientations, lawful cells, and directed links are overlays on this
model. They do not create a sixth complex.

### Defining graph Gamma

Shows the defining finite-relation graph. `m = 2` edges can be included for a
full graph; `m = inf` pairs are omitted. Relation labels are always visible in
the planar diagram, with placement chosen to avoid unrelated edges and
crossings where possible.

### Projection drawing

Shows chamber barycenters obtained from supplied reflection data. The subtitle
names the projection and whether interval-certified model data are available.
The mesh remains a drawing.

## Covers + Walls Workflow

The **Covers + Walls** panel, present in both Teaching and Research modes,
presents one ordered workflow rather than several independent game panels. Its
numbered status list currently has seven steps (**1. Certify a torsion-free
subgroup** through **7. Certify a primitive map to ℤ**); the stages below are
the design order behind that list.

### 1. Source

Choose the Coxeter system and inspect its matrix, Gamma, source references, and
certificate scopes.

### 2. Discover a torsion-free cover

The primary path asks an external backend to find `H` and generate its coset
action. Show:

- backend and bounded index range;
- spherical special subgroups and prime-order exclusion words;
- search state: found, exhausted through a bound, inconclusive, or blocked;
- subgroup index and generators when found;
- fixed-point results for every torsion representative;
- artifact hashes and tool version.

The default `auto` backend begins with exact Sage finite-image/congruence
reductions, recognition and subgroup/mark screening, and reusable composite
modules. A bounded GAP low-index excluded-conjugate search is the final small
fallback. Every rung records its own scope and resource limits.

### 3. Validate the finite action

For an automatically generated or manually imported action, show:

- action size;
- generator permutations;
- involution and finite-relation checks;
- subgroup/backend provenance;
- torsion-free evidence as a separate field.

Manual import belongs under **Search bounds and fallback import** and remains
available for published or externally generated actions. There is no separate
build button: `\hat X` is built once a complete finite action is loaded. When
only an existence certificate for a congruence kernel is available, the panel
shows **Build quotient and walls** and **Run fibering pipeline** disabled, with
the reason. Construction is not blocked merely because external torsion-free
evidence is absent; instead the resulting claim status stays visibly limited.

### 4. Cover

Build `\hat X` and inspect lifted generator bigons and relation-cell fibers.
Selecting a cell highlights its signed boundary in order.

### 5. Compression

Build `\bar X` and show the compression certificate. Linked selection connects
one compressed edge or polygon to its complete `\hat X` fiber.

### 6. Walls

Find all wall equivalence classes from opposite sides. The panel reports:

- wall and crossing-segment counts;
- embeddedness;
- two-sidedness;
- self-osculation;
- concrete witnesses for every failure.

Selecting a wall emphasizes its dual edges and crossing arcs. Other walls
become faint context.

### 7. Coorientation and `H -> Z`

A coorientation is what Jankiewicz--Wise call an orientation of a two-sided
wall; the two words name the same thing. Flip individual two-sided walls or
run a search. Edge arrows update from the
wall parity data. One-sided walls stay marked as obstructions and cannot receive
a fake local orientation.

The panel also exposes the induced homomorphism on Schreier generators,
relation-boundary sums, and image gcd. It says **epimorphism to Z** only after
the primitivity check passes.

Search output uses only these labels:

- **Proven optimum**: exact search completed and bounds meet;
- **Best found**: the run stopped at its budget; the remaining gap is shown.

The search button is disabled while any wall is one-sided. A search that fails
reports its error message instead of a result.

### 8. Lawful subcomplex and links

The lawful view keeps the full `\bar X` 1-skeleton. Retained cells are drawn
normally; discarded cells are hidden or, with **Show non-lawful cells faintly**,
ghosted. The source and sink of a selected lawful cell are listed in the
inspector; the scene does not yet draw source/sink markers. The directed links
(ascending and descending) are inspected at a selected vertex under **Inspect
induced orientation**. Their nonempty/connected status is reported
independently of theorem claims.

When the subgroup, epimorphism, and applicable Morse hypotheses all pass, the
two-track certificate (**Track A (lawful complex)**, then **Track B (full Davis
quotient)**) can summarize the resulting virtual algebraic fibration and point
to its evidence. It must not derive finite generation of the kernel from the
picture alone.

### 9. Export

Save the source, finite action, derived complexes, compression certificate,
wall system, active coorientation or search certificate, lawful-cell result,
link diagnostics, notes, and view state in one deterministic experiment
bundle. A complete run also includes the torsion witnesses, bounded-search
report, subgroup presentation, values of `H -> Z`, primitivity result, and
Morse-hypothesis status.

### Current implementation boundary

The cover validator, automatic Sage/finite-image/composite/GAP discovery
ladder, cover, compression, wall, Schreier-character, lawful, and finite-link
stages are implemented. External algebra runs outside the browser; its
artifact enters through the same validation boundary as a manual import, and
the desktop bridge exposes it as a controlled job. Manageable complete actions
can reach a replayed wall-character virtual-algebraic-fibering certificate.

The external `cover:fiber:scalable-h1` CLI connects the proof-carrying
full-integral-`H^1` backend to generalized compression and intrinsic Track B.
This is deliberately not an in-browser calculation: large sparse rank and
integral-kernel evidence remain external artifacts. The exact in-process
all-character arrangement currently supports `b1` one through four. No
source-bound smooth-manifold/PL/smoothing verifier is implemented, so the
viewer and CLI do not certify smooth fibering.

## Teaching Mode

Teaching mode keeps the viewer dominant. The left rail contains, top to
bottom:

- **Choose Example**, with **Start Here** directly below the example picker;
- **View** (the model switch);
- **Covers + Walls**;
- **Labels**.

The right rail holds the **Focus Inspector**, **Caveats**, and the
**Interface** mode switch.

In Covers + Walls the numbered workflow list gives one line of status per step.
Search ledgers, wall-diagnostic grids, and the Track A/Track B check grids
(**Search summary**, **Wall diagnostics**, **Track A checks**, **Track B
checks**) start collapsed in Teaching mode; raw permutation tables, hashes, and
search budgets stay behind further disclosures.

## Research Mode

Research mode drops **Start Here**, titles the first panel **Source**, adds
**Compact H5 campaign status** under the example picker, and expands the
collapsed grids. The right rail gains **Data + Status** (source data, cover
action, torsion-free evidence, automatic search, index divisor, compression,
wall system, render calls) and **Notebook + Export** (**Export experiment**,
**Export figure**). Notes, comparisons, and camera bookmarks are not part of
the current UI; sessions and workspace actions are reached through the desktop
menu.

The earlier legal-system game and generator-uniform cochain are not parallel
top-level workflows. Legacy data may be shown in a migration report, but the
general interaction is wall coorientation on `\bar X`.

## Focus Inspector

The inspector always begins with three short answers:

- **What is selected?**
- **Why is it here?**
- **Exact or drawing?**

Selection details depend on the object. The current inspector implements
vertex, relation-cell, wall (chosen with **Select a wall**), and directed-link
(chosen under **Inspect induced orientation**) summaries; edges cannot yet be
selected, so the cover-edge and compressed-edge entries below are design
targets.

### Cover edge

Show generator, source and target vertices, inverse partner, bigon fiber, and
source action record.

### Compressed edge

Show generator, endpoints, the two directed lifts, its two bigons, dual wall, and
active arrow direction.

### Relation cell

Show generator pair, `m`, signed attaching map, compression fiber, opposite
edge pairs, wall crossings, lawful sign word, and source/sink when present.

### Wall

Show dual edges, crossing cells, parity propagation, embedded/two-sided status,
self-osculation witnesses, and active coorientation.

### Vertex link

Show incident directed edges, retained corners, ascending and descending
components, and the exact hypotheses not checked by the browser.

## Drawing hat X

`\hat X` can contain many coincident-looking lifts. Readability controls may:

- offset inverse directed rails;
- peel one relation-cell fiber;
- separate lifted cells sharing a boundary;
- switch between outline, glass, and filled faces;
- show a construction sequence.

These transforms operate on scene coordinates only. Cell IDs, signed boundary
occurrences, and compression fibers never change.

The common boundary of the two bigons over a generator orbit is shown as paired
rails or an outlined ribbon. The cells are not replaced
with a triangle merely to satisfy a mesh API.

## Drawing bar X

The default `\bar X` view is rail-first:

- geometric edges are crisp and remain visible through faces;
- every visible semantic edge has one generator label;
- relation faces are glassy until selected;
- selected boundaries are numbered and oriented;
- source/sink markers appear only in lawful mode.

Dense complexes use overview plus focus. Cutaways may filter by generator,
relation order, wall, lawful status, or selected link. Hidden counts remain in
the inspector and export metadata.

Dense relation-cell reading keeps one quotient 1-skeleton. A pair focus moves
its actual 24 vertices so the four cycles for that finite edge of Gamma read as
hexagons; all other generator rails remain as faint gluing context. The full
view bends the 48 disk interiors into twelve shallow four-cell lanes. These
folds use drawing-only interior points, but every disk still meets the same
exact boundary rails. **Compact gluing** removes the folds for wall and gluing
inspection.

## Drawing Walls

A wall arc joins the midpoint anchors of opposite boundary edges. The renderer
may lift or curve arcs to avoid overlap. It must preserve:

- wall ID;
- endpoint edge IDs;
- relation cell ID;
- parity constraint.

Wall colors identify equivalence classes. Coorientation is shown with a normal
tick or dual-edge arrows, not by changing the wall class color. Color is backed
by labels and patterns for accessibility.

The wall display offers:

- **All walls** for an overview;
- **Selected wall** for one complete immersed graph.

Turning off **Show wall arcs** leaves only the dual edges when arcs obscure the
1-skeleton. A dedicated pathology-witness view is not implemented; failures are
summarized under **Wall diagnostics**.

## Lawful-Cell Reading

Clicking a relation cell of `\bar X` shows its cyclic sign word (**Boundary
signs**) and whether it is lawful. A lawful cell has two positive paths from
its source to its sink, and the inspector lists both vertices. A discarded
cell's sign word shows every transition, so the reader can see why there are
not exactly two.

This mode never deletes cells from `\bar X` data. It changes only the active
subcomplex/view and records retained and discarded IDs.

## Comparison Views

Linked split views are not implemented in the current UI, which shows one
model at a time. Two linked comparisons remain design targets:

### hat X versus bar X

Selecting an object on the compressed side highlights its full preimage on the
cover side. Captions state that the right pane is a cellular quotient, not a
different layout of the same cell list.

### bar X versus lawful subcomplex

Both panes share vertices, geometric edges, and camera intent. The right pane
keeps only lawful relation cells for the active coorientation. It is not a
claim that the chosen coorientation is globally optimal.

## Labels

Semantic labels follow strict ownership:

- Davis and cover edges are labeled by generators;
- Gamma edges are labeled by numerical Coxeter exponents;
- compressed edges inherit their generator labels;
- wall labels name walls, not generators;
- relation-step numbers appear only for a selected boundary.

There is exactly one generator label per geometric edge in `\bar X`. Dense
labels use shared text atlases and collision placement. Selected and hovered
labels have priority. Leader ticks point to the owned edge when proximity alone
would be ambiguous.

Scenes with more than 60 visible vertices use a dense label rule
(`src/render/labels.ts`): at the framed view at most 25 ordinary vertex labels
and 12 edge labels are drawn, and the cap doubles with each 2x zoom step (up to
three steps). The selected vertex and its neighbours are always labelled.
Smaller scenes, such as an `I2(m)` or `A3` ball, keep every label.

## Layout, Framing, And Onboarding

- Above 1180 px the layout has three columns (controls, viewer, inspector);
  from 761 to 1180 px the two rails stack in the left column beside the viewer;
  at 760 px and below there is one column with the viewer first.
- **Viewer only** (top-bar button or `U`) hides both rails; a floating **Show
  controls (U)** button restores them.
- With no stored choice, the theme follows the operating-system colour
  preference; the theme button overrides it. The current theme is written to
  browser storage on load, so later OS changes are not followed.
- The global camera preset fits the scene's bounding sphere. A nearly flat
  scene, such as a single Davis `2m`-gon or the planar Gamma drawing, is viewed
  face-on with a small tilt instead of edge-on. Node positions are not moved.
- The question-mark button starts a guided tour (`src/app/onboarding/`) on the
  regular ideal hyperbolic 3-cube (`ideal_hyperbolic_3_cube_m3`). It opens by
  itself once per browser (key `coxeterViewer.tour.v1`), never under
  `navigator.webdriver`; `?tour=1` forces it and `?tour=0` suppresses it.

## Exactness Language

The UI uses these phrases consistently:

- **certified source data**;
- **exact incidence**;
- **browser diagnostic**;
- **best found** or **maximum proven**;
- **drawing**;
- **projection**.

It does not use **certified wall system** merely because a finite browser check
passed, and it does not call a cover torsion-free without matching evidence.

## Rendering And Performance

The renderer is demand-driven. It renders on scene changes, camera movement,
resize, hover/pick updates, screenshots, and damping settle; an idle scene does
not keep a perpetual animation loop.

Revision tokens separate:

- topology;
- layout;
- cell geometry;
- wall geometry;
- coorientation/lawfulness appearance;
- labels;
- picking;
- camera.

Flipping a wall should update edge arrows, lawful-cell appearance, and affected
links without rebuilding `\hat X` or `\bar X` topology.

Heavy work belongs in persistent workers:

- cover and compression construction;
- wall equivalence and pathology checks;
- exact/heuristic coorientation search;
- large link calculations;
- progressive validation of large finite actions.

Search is cancellable. A partial result remains labeled partial, and camera
navigation stays responsive while it runs.

## Scene Indexes And Picking

Each topology revision builds retained indexes for:

- adjacency by vertex and generator;
- edges and cells by generator pair;
- compression image and fiber;
- cells by geometric edge;
- walls by edge and cell;
- lawful status by cell;
- link features by vertex.

Picking uses a retained spatial index before candidate-level tests. GPU picking
is a fallback for scenes where measured CPU candidate costs exceed the budget.
Both paths return the same stable mathematical ID.

## Caching

Memory and IndexedDB caches key derived objects by schema version, app version,
source hash, action hash, builder version, and relevant options. Drawing options
do not invalidate topology. Caches are byte-aware and may evict large scenes
without losing session metadata.

Cached results are accepted only after their input hashes and schema versions
match. A cached torsion-free status is never inferred from a matching action
alone.

## Export And Screenshots

Screenshot capture uses a one-shot high-quality render; the WebGL renderer does
not keep `preserveDrawingBuffer` enabled continuously.

A figure bundle contains the PNG, view metadata, selected IDs, status labels,
and topology hashes. A research bundle additionally contains or references the
source action, derived complexes, certificates, wall/coorientation results,
lawful subcomplex, and link diagnostics.

## Maintainability Rules

- Mathematical transforms live outside React components.
- Every approximation is named.
- Stable IDs do not include scene coordinates.
- Drawing filters never rewrite boundary occurrences.
- Solver status is derived from bounds and termination reason, not optimistic
  copy.
- Comments explain invariants or conventions, not syntax.
- New model terminology must be added to the inspector, export metadata,
  walkthroughs, and tests together.
