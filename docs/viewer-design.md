# Viewer Design

The viewer should feel like a mathematical cockpit: dense enough for repeated inspection, clear about what is being drawn, and careful about finite-radius growth.

## Architecture Boundaries

Keep domain math out of React components.

Suggested boundaries:

- `src/coxeter/`: Coxeter matrix validation, Gram-entry conversion, examples, and diagram-level helpers.
- `src/cayley/`: Cayley-ball generation, word handling, backend interfaces, and deduplication diagnostics.
- `src/davis/`: spherical subsets, rank-two Davis cells, local links, and future higher-cell proxies.
- `src/geometry/`: Lorentzian linear algebra, reflection matrices, hyperboloid validation, and projections.
- `src/render/`: Three.js scene construction, picking, labels, controls, and export helpers.
- `src/app/`: React panels, state wiring, keyboard shortcuts, import/export UI, and warnings.

The renderer should consume generated graph data. It should not know how to reduce words, validate Coxeter matrices, or infer Davis cells.

Compact labels are renderer data, not new mathematics. The app supplies a preferred reduced word label for vertices and generator labels for edges; the renderer caps how many sprites it creates so labels help inspection without dominating frame time.

## 3D Readability Guardrail

Cell and fundamental-domain views must be genuinely three-dimensional by
default. A relation, rank-three cell, `Y_Gamma` model, quotient link, or local
topology diagnostic should not be presented as a flat drawing unless the UI
explicitly labels it as a 2D schematic. The main viewer should use non-coplanar
vertex placement, separated face planes, depth cues, outlines, and camera
presets that make shared edges and incident faces readable.

This is especially important for `Y_Gamma`: a rank-three cell such as the
`m=2/m=3` A3-style example should read as a small 3D object with a square face
and a hexagon face meeting along a shared generator direction. If a fallback
construction produces a flat or nearly flat picture, treat that as a rendering
bug or an unfinished readability prototype, not as an acceptable final view.

## Backend Boundary

The generation backend should be replaceable:

```ts
interface CayleyBallBackend {
  name: string;
  generate(
    input: CoxeterSystemInput,
    radius: number,
  ): Promise<GeneratedCayleyBall>;
}
```

Initial browser generation uses approximate reflection matrices behind the same
generated-graph contract. The app sends generation requests through a Vite web
worker so radius changes and example switches do not block the React shell while
BFS and rank-two cell detection run. Exact Sage, GAP, or KBMAG paths are
optional external exporters that produce the same generated graph shape.

The current Sage and GAP/KBMAG adapters are unavailable browser generators. They return structured errors explaining that exact enumeration must run outside the browser and be imported as generated JSON.

The script-level contract lives in `scripts/exact_export_contract.json`.
`scripts/sage_export_backend.py` provides `--contract`, `--check-runtime`, and
exact Sage enumeration using algebraic real reflection matrices. The GAP/KBMAG
wrapper provides the same contract, runtime checks, and a finite spherical
export path. For `I2_5`, `A3`, and other positive-definite Coxeter matrices, the
wrapper asks GAP to load KBMAG, builds the Coxeter presentation, maps it to a
finite permutation group, and serializes the resulting ball as
`external-gap-kbmag`. Inputs with infinite entries or a non-positive-definite
standard Gram matrix are rejected before GAP enumeration so the UI and scripts
do not pretend an infinite word problem was solved.

External checker outputs use a separate artifact-manifest layer under
`scripts/certificates/`. A manifest records the tool, input hash, artifact hash,
command shape, narrow claims, and explicit non-claims. The renderer and React
shell do not consume these manifests directly; they are research provenance for
fixtures, release gates, and documentation. Imported generated graphs still
enter through the generated-JSON validator, while CoxIter and transcription
artifacts remain outside the Cayley-ball backend interface.

The devcontainer is an app-side reproducibility scaffold, not a hidden
exact-backend runtime. It pins Node and pnpm for TypeScript work and documents
where optional Sage, GAP/KBMAG, and CoxIter installations attach at the script
boundary.

## Panels And Controls

Expected panels:

- Input panel: example picker, JSON import, radius, backend, and export buttons.
- View preset panel: Global, Local Chamber, Rank-Two Cells, and Geometric Projection presets.
- Graph size control: Small, Medium, Large, and Experimental presets that tune radius, node, edge, label, cell, and proxy budgets.
- Mode panel: shell layout, force layout if available, and geometric projection when valid.
- Davis cells panel: rank-two cell toggle, generator-pair filters, local-link summary, higher-rank proxy count, and visible cell counts.
- Inspector panel: selected node, edge, or cell details.
- Local Link panel: selected-chamber link, generator stepping, and synchronized rank-two pair filters.
- What Am I Seeing panel: concise facts about the active dataset, radius, view, visible counts, exact cells, visual proxies, and geometry status.
- Math notes panel: short context for the current mode.
- Warnings panel: grouped approximation, truncation, invalid geometry, omitted-view, backend, and placeholder notices.

On desktop-size viewports, the central Three.js viewer should stay fixed in the
visible workspace. The left control rail and right inspector rail scroll
independently, so changing a setting should not require scrolling away from the
geometric object. The `Viewer only` control hides both rails and the header
strip, leaving the canvas as the primary surface with a small `Show UI` escape
button over the viewer.

Light/dark mode is presentation state. It changes the React shell and the
Three.js scene background, but generator colors, status badges, and exact/proxy
semantics keep their usual meanings.

Expected scene controls:

- Orbit controls for camera movement.
- WASD camera nudging for desktop-style navigation. This moves the camera in
  the active view only; it never edits words, quotient data, cocycles, or
  generator choices. Forward/back movement is deliberately slower than orbit
  movement, and strafing is slower still so `A`/`D` can be used for small
  inspection adjustments instead of jumping across the model.
- Reset view.
- Focus selected node.
- Switch between global view and a local chamber view around the selected node.
- Toggle labels.
- Toggle compact vertex labels and generator edge labels independently.
- Choose label scope: off, focused, or budgeted.
- Toggle rank-two cells.
- Increase or decrease radius.
- Switch mode.

Use roles and accessible names for controls. Add stable `data-testid` attributes only where a visual canvas or compact tool control is not easy to locate by role.

## Rendering Rules

Nodes are colored by word-length shell by default. Edges are colored by generator. The legend should show both color and generator label so color is not the only channel.

Rank-two Davis cells are filled only when every boundary vertex is present in the current ball. Clipped cells can be listed or outlined, but not filled.

Geometric mode renders a reference ball for axis-based Klein or Poincare projection, scaled up 12x with the displayed chamber coordinates so near-boundary points remain readable. The initial geometric camera sits close to this enlarged ball instead of framing it like a small desktop object. It does not render that ball for PCA projections because PCA coordinates are not ball coordinates. For compact examples in dimension greater than three, the Geometric Projection preset uses a local graph-neighborhood and a PCA basis fitted around the selected chamber; this is the readable default for examples like the Makarov prism. The UI text must say that chamber barycenters are projected to 3D when the source dimension is greater than three. Global geometric views keep the model origin fixed at the reference ball center; selected-node re-rooting is a shell-layout convention only.

The current label implementation uses Three.js sprites built from canvas textures. Node labels prefer selected and shallow-shell vertices; edge labels prefer edges incident to the selected node and are generator-colored. Both have hard budgets, draw over geometry for readability, and dispose their textures when the graph updates.

## Local Chamber View

Local Chamber is an on-graph, cell-first 3D view centered at the selected
chamber. It filters the rendered scene to the distance-`d` Cayley-graph
neighborhood of that chamber, with `d` chosen from the local-depth control. The
selected chamber is drawn at the local origin. Generator-neighbor chambers are
placed on stable 3D directions on a small sphere, and distance-two-or-deeper
chambers move to separated shells keyed by their shortest visible generator
path.

This view is a local inspection tool. It does not alter stored group words,
word lengths, generated-ball metadata, rank-two Davis cells, or quotient data.
Cells whose full boundary is outside the visible local neighborhood are hidden
from the scene rather than filled as if they were complete. The warning surface
must say when global cells or labels are omitted by the local view.

Rank-two Davis cells in Local Chamber default to `in-graph`, so the filled
polygon uses the displayed boundary vertices of the 1-skeleton. Optional
`lifted-panels` and `petals` modes remain available as explicit readability
drawings when the graph embedding is too cluttered. `outline-only` suppresses
fills. Any off-graph transform is visual only: exactness refers to the
combinatorial boundary and incidence data, not to the Euclidean panel shape.

The cell-focus control chooses whether Local Chamber shows all local cells,
only cells incident to the selected chamber, or only the active generator pair.
Far-shell controls can hide, fade, or x-ray deeper shells. Bringing focused
cells forward is a deterministic display offset, not a geometric assertion.

The global root control is also visual: it translates global coordinates so a
chosen node is near the origin, but words and lengths remain based at the
identity.

## Dense Example Defaults

Dense examples currently auto-enter the Local Chamber preset once per dataset
when the system rank is at least `7` or the generated ball has more than `500`
nodes. This default is a usability choice for high-rank or visually crowded
examples, not a mathematical classification. The preset uses shell mode, 3D
Local Chamber rendering, local depth `2`, focused labels, visible node and edge
labels, rank-two cells, hidden far shells, and graph-bounded cells.

Graph size presets still control generation and render budgets. Local Chamber
may raise the effective label cap up to the smaller of the visible local count
and `180`, so the nearby neighborhood can be read without enabling labels for
the whole ball.

## Label Scopes

Labels have two independent axes: content toggles and scope. Content toggles
turn compact group-element labels and generator edge labels on or off. Scope
then decides which eligible labels are drawn:

- `off`: no label sprites are created, regardless of content toggles.
- `focused`: labels are restricted to the selected chamber, adjacent vertices,
  and edges incident to the selected chamber when available.
- `budgeted`: labels are selected by deterministic priority within the current
  render budget.

Label text is an inspection aid. Vertex labels are compacted preferred reduced
words; edge labels are generator labels. Neither changes the graph data or
asserts uniqueness of the displayed reduced word.

## Local Link And Pair Filters

The Local Link panel draws the selected chamber link from spherical subsets of
the source Coxeter system. Link vertices are generators. Rank-two spherical
subsets are link edges, and higher spherical subsets may be drawn as filled
link faces for orientation.

The rank-two chips in the Davis cells panel are visibility toggles. The Local
Link chords and the pair matrix are focus controls: clicking a finite pair
activates that pair, selects a representative `DavisTwoCell` when one is
available, expands the local drawing enough to include its boundary, and snaps
the camera toward the relation panel. Clicking a link vertex steps by that
generator when the adjacent chamber is present in the finite ball; otherwise
the UI reports that the radius must be increased.

Higher-rank Davis cells remain visual proxies unless an exact rendered
embedding has been implemented. Their incidence records can be exact within
the generated ball even when the filled shape is only a drawing proxy.

## Rank-Two Relation Focus

Rank-Two Cells is the preset for reading one Coxeter relation at a time. It
uses the same generated `DavisTwoCell` records as Local Chamber, but the
controls are organized around generator pairs and individual cell boundaries.

Pair controls should include:

- All on: enables every finite rank-two pair currently present in the ball.
- All off: disables every finite rank-two pair without discarding the generated
  cells.
- m=3: enables only finite pairs with Coxeter entry `3`; this is useful for
  scanning simply-laced examples such as `A3`.
- Custom: records the manual state after individual pair toggles.

The pair matrix is a compact upper-triangular view of the Coxeter matrix. Each
finite entry shows the pair key, the Coxeter value `m`, whether the pair is
enabled, visible filled-cell count, and clipped or budgeted-cell count. Infinite
entries are shown as non-spherical for rank-two Davis cells and should not
create filled-cell toggles.

When a pair is active, the relation-focus panel can narrow from `selected-pair`
to `selected-cell` by keeping exactly one `DavisTwoCell` visible. The scene
then has four neighborhood choices:

- `cell-boundary`: draw only the cyclic boundary vertices, boundary edges, and
  the selected filled or outlined cell.
- `cell-plus-1`: draw the boundary plus one local Cayley-graph shell around it
  for context.
- `cell-plus-2`: draw the boundary plus two local shells for a broader partial
  neighborhood.
- `chamber`: return to the ordinary selected-chamber neighborhood.

Relation-walk labels list one cyclic representative of the boundary walk:
starting vertex, alternating generator labels, and boundary vertex ids. Because
the same polygon can be started at any boundary vertex and read in either
orientation, the label must be described as an inspection representative, not a
new canonical word.

Ghost context is a rendering layer for hidden surroundings: faint nodes and
edges that explain where the focused relation sits in the larger ball. Ghost
objects do not appear in exported generated graph data. View exports may record
that ghost context was enabled so screenshots can be reproduced.

## What Am I Seeing And Warnings

The What Am I Seeing panel is the short narrative contract for the current
view. It reports the dataset, radius, view preset, global versus local view,
visible node and edge counts, label scope, exact rank-two Davis-cell count,
higher-rank proxy count, available Davis incidence records, and whether
geometric projection is available. It should distinguish deterministic shell
layout from hyperbolic geometry and distinguish exact rank-two cells from
proxy drawings.

Warnings are grouped before display:

- Important: placeholders, invalid data, explicit errors, and "must not" caveats.
- Approximation: rounded matrix keys, numerical geometry, projections, and
  visualization-only claims.
- Omitted by view: local-view hiding, render budgets, truncation, and hidden
  labels or cells.
- Backend/status: worker status, unavailable exact backends, and other
  operational messages.

Duplicate warnings are removed. The panel may initially show a short prefix of
the grouped list, but all warning text must remain available and included in
exports.

Research-only panels such as detailed status, experiment logs, and higher-cell
proxy controls are hidden behind the "Show research panels" toggle. The default
screen keeps the central viewer, local link or cell focus, and current
explanation visible without forcing every diagnostic surface onto the page.

## Export Workflows

The viewer exposes four export actions from the inspector:

- Graph JSON exports the current generated Cayley ball, including nodes, edges,
  rank-two cells, metadata, caps, warnings, and backend diagnostics.
- Local neighborhood JSON exports the current local/view state: dataset
  identity, selected node and compact word, preset, graph view, local depth,
  mode, projection, label scope, disabled and active generator-pair filters,
  visible node/edge/cell ids, and warnings.
- Screenshot exports the current WebGL canvas as a PNG. It is a visual record,
  not a mathematical certificate.
- View bundle exports the screenshot plus a sidecar JSON with selected node,
  filters, view settings, scene statistics, and warnings.

Exports should be deterministic where they contain structured ids or metadata.
Screenshots are allowed to reflect camera and renderer state.

## Renderer Instrumentation

`SceneView` exposes renderer-owned statistics without requiring the app shell to
own Three.js details. The optional `onRenderStats` prop reports graph-update
counts for future panels, while the mounted scene element and
`window.__coxeterSceneStats` expose frame-sampled data for Playwright and local
benchmarks.

The current stats include input graph counts, rendered node/edge/cell counts,
label counts, Three.js draw calls and triangles, the active camera mode, the
last graph rebuild time, and a small rolling sample of frame deltas. The
callback fires after graph updates; the DOM/window hook is refreshed during the
render loop so tests can observe frame progress without forcing React state
updates every frame.

The scene mount also carries compact `data-*` attributes such as
`data-rendered-nodes`, `data-rendered-edges`, and `data-scene-mode`. These are
testing and benchmarking contracts, not user-facing mathematical data.

## Performance Guardrails

Cayley balls grow quickly. The app should protect the browser before the user asks for a huge radius by accident.

Implemented guardrails:

- Default radius: `5` for the bundled `I2(5)` example, which makes the decagon cell visible immediately while staying small.
- Small preset: radius `6`, `2500` nodes, `9000` edges, `180` node labels, `120` edge labels, `220` filled cells, and `40` higher-rank proxies.
- Medium preset: radius `7`, `6000` nodes, `20000` edges, `100` node labels, `60` edge labels, `160` filled cells, and `35` higher-rank proxies.
- Large preset: radius `8`, `12000` nodes, `45000` edges, `48` node labels, `40` edge labels, `80` filled cells, and `20` higher-rank proxies.
- Experimental preset: radius `10`, `20000` nodes, `80000` edges, `24` node labels, `24` edge labels, `60` filled cells, and `12` higher-rank proxies. This preset exists for local-view-first research inspection; dense global compact examples should still warn when the view becomes a stress case.
- Hard caps for radius, nodes, edges, cells, higher-rank proxies, and rendered labels.
- Debounced generation when radius changes from an input control or keyboard shortcut.
- Workerized generation for Coxeter-system examples, with stale requests ignored when a newer request completes.
- Memoized rendering inputs by dataset, debounced radius, graph-size preset, and projection mode.
- Render only selected generator-pair cells when filters are active.
- Cap rendered node and edge labels separately.
- Surface truncation in warnings and exported metadata.
- In relation-focus mode, prefer selected-cell-only or selected-pair rendering
  before increasing radius; the pair matrix should report hidden, ghosted, and
  budgeted cells instead of forcing every panel into the scene.
- Ghost context must share the same render budgets as ordinary context. If the
  budget is exceeded, keep the selected relation boundary and drop ghosted far
  shells first.

Future asynchronous exact backends should cancel stale generation requests if a
newer radius or example is selected before the external process returns.

Beyond a few thousand nodes, the app should degrade gracefully: hide labels, reduce cell fills, simplify hover work, and explain what was omitted.

## Approximate Deduplication

Rounded matrix keys are acceptable for prototype visualization, but only with clear labeling.

When approximate deduplication is used:

- The backend metadata must say `deduplication: "rounded-matrix"`.
- The UI should show a warning.
- The matrix precision should be recorded.
- Finite group order checks should be treated as tests of the implementation, not mathematical proofs.

Exact external backends can later replace approximate browser generation without changing the renderer.

## Geometric Data Pipeline

Geometric mode accepts explicit hyperboloid normal coordinates first. If an
example supplies only `normalGram`, the geometry layer numerically factors it
into Lorentzian normal coordinates, checks the signature and residual, and emits
warnings for any approximation. If no basepoint is supplied, the geometry layer
tries to solve a chamber basepoint satisfying `<x,n_i> <= 0` for every normal.
The renderer receives projected chamber barycenters only after those validation
steps pass.

This pipeline is intentionally diagnostic-heavy. A numerically factored
`normalGram` can make a published Coxeter diagram explorable, but it does not
upgrade the file into verified normal-coordinate data.

## Quotient And Game Hooks

`src/quotient/` defines finite quotient-complex data and validators for edge involution pairing, cell vertex references, and torsion-free verification metadata. The code deliberately refuses manifold language unless that verification is supplied.

The viewer can derive the base complex `Y_Gamma` from the active Coxeter system
without an external file. This mode creates one base vertex, one oriented arrow
for each generator/facet direction, rank-two quotient cells for finite Coxeter
entries, and higher spherical incidence/proxy records when available. It is
rendered as a quotient/game dataset, not as a universal Cayley ball.

The primary `Y_Gamma` display is now a main-stage 3D 2-skeleton scene. It shows
the base vertex, oriented generator arrows, and filled rank-two relation faces
glued directly to the corresponding generator arrows. The cell inventory panel
lists the same base vertex, oriented generator arrows, rank-two relation cells,
higher spherical cells, and label meanings. The 2D nerve/local-link schematic is
available only as a diagnostic derived from this complex. The relation faces
are singular sheets in the drawing: two boundary sides are the existing
generator 1-cells, and the remaining hidden construction corners complete the
full `2m`-sided outline. Thus an `m=3` relation still appears as a complete
hexagon, while only the true quotient 0/1-skeleton vertices are displayed.

For high-rank examples the full `Y_Gamma` 2-skeleton is visually dense: the
compact 5-cube has ten generator arrows and forty rank-two faces. The default
view therefore keeps the generator 1-skeleton visible and labels its arrows,
then shows only the active rank-two relation face. The all-faces toggle is an
overview/debug view, not the recommended way to read local topology. The 2D
nerve schematic and relation picker are better summaries of which generator
pairs and higher spherical subsets control the local link.

Rank-three `Y_Gamma` cells are rendered from the finite rank-three Coxeter
cell boundary, then glued to the base vertex and the three generator-arrow
endpoints by a deterministic readability embedding. A right-angled triple is
therefore drawn as a cube-like boundary with six square faces, not as a
tetrahedron. Non-right-angled rank-three cells use the corresponding finite
Coxeter-cell rank-two faces. These are still visual incidence proxies unless
separate affine coordinates are imported; the cell inventory stores the actual
generators and rank-two face references. In dense views the rank-three fills
are restricted to triples incident to the active generator pair unless the user
turns on the all-faces overview.

The full `m=2/m=3 3-cell` focus mode searches the current `Y_Gamma` cell
inventory for a rank-three spherical cell containing a square relation face and a hexagon
relation face that share one generator. That hinge fixes a readable 3D
orientation and is the default normal inspection view whenever such a hinge is
available, including compact examples. The full generator spine remains visible
around the focused 3-cell, so this is still one `Y_Gamma` object rather than a
detached diagram. The normal view draws the square and hexagon face families
together; the square/hexagon buttons only rotate the camera and emphasize one
family. They do not filter the other family out of the object. Each square or
hexagon is drawn in its cyclic geometric order so the relation sheets are
simply embedded inside one cohesive object, instead of becoming star polygons
from the alternating word traversal. Camera offsets are intentionally oblique
so the object does not collapse into a flat face-on drawing. The generator
labels live on the oriented edges, not on the non-base drawing vertices. The
older two-face hinge witness remains a testing/debugging mode, not the normal
user-facing model.

The Y_Gamma reader is the default human-readable control surface for this
object. Its narrated presets coordinate scene visibility, labels, opacity,
camera target, and explanatory text:

- One relation: isolate one finite rank-two relation cell and number its
  alternating boundary edges.
- One rank-three cell: show the full boundary of the selected finite
  rank-three Coxeter cell.
- Around generator: show all visible relation faces incident to a chosen
  generator arrow.
- m=2 squares and m=3 hexagons: filter by Coxeter relation order while keeping
  the common generator spine.
- Full Y_Gamma 2-skeleton: show the complete derived two-skeleton.

Cell peeling controls reduce the 3D object to a selected face, adjacent faces,
or the same rank-three cell. Transparent topology mode lowers fill opacity and
emphasizes outlines and generator arrows. The relation picker beside the viewer
is a compact Coxeter-pair grid; finite entries focus the corresponding relation,
and infinite entries are shown as absent rank-two cells.

`src/quotient/` also exposes a bounded in-repo certification layer. It checks
Schreier-style generator actions, finite Coxeter relations, rank-two quotient
cell coverage, duplicate cells, and visible spherical stabilizers. These checks
are displayed and stored as diagnostics; only external or published torsion-free
certificates unlock manifold wording.

`src/game/` defines integer edge/generator labels, named integer cocycles, and
experiment logs for PL Morse or game experiments. Current helpers check boundary
sums around rank-two cells and classify incident edges as ascending, descending,
or level at a selected vertex.

The Research Workflow panel is the primary quotient/game path. It bundles the
source system, subgroup/coset request, quotient artifact, cocycle choice,
topology lens, notebook save, comparison, and export actions into one sequence.
The built-in golden path is the identity-subgroup quotient of `I2(5)` with the
nonzero cocycle `s0=+1, s1=-1`; `A3` remains the rank-three topology-lens demo.
Topology lenses are scene filters, not new mathematical data. Ascending,
descending, level, and full-local-link lenses render the selected quotient
vertex and the incident edges of that class as first-class 3D objects.

`src/topology/` contains the first local-link topology helper: finite
simplicial homology over `F2`, reporting reduced `H0` and `H1`. It is kept
separate from rendering so certificate scripts and tests can use it directly.

Generated graph imports and quotient imports both bypass browser Coxeter BFS.
Generated graphs are validated as already-enumerated Cayley balls. Quotient
imports are converted into renderable graph data with circular fallback
positions, but their mathematical status remains "quotient complex" unless the
file includes torsion-free verification metadata.

## Maintainability Notes

Prefer small, named functions for mathematical operations. Public math utilities should have docstrings or short comments explaining the convention they implement.

Comments should explain choices and invariants, not syntax. For example, a comment near rank-two cell keys should explain why duplicate cycles appear and how the canonical key avoids them.

Keep generated JSON deterministic so examples and exports can be diffed in git. Stable ids are part of the data contract.

E2E tests should prefer user-facing roles and names, with test ids as explicit contracts for canvas-adjacent UI. Unit tests should cover matrix validation, reflection identities, finite examples, Davis boundary lengths, and deterministic projection.
