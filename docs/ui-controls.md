# UI Controls

The interface follows one question: which mathematical layer are you reading?
Controls that do not apply to the active layer are hidden.

## Choose Example

Selects the source Coxeter system. The panel is titled **Choose Example** in
Teaching mode and **Source** in Research mode. The radius slider appears only
in the Davis and Projection views, and the projection selector only in the
Projection view.

The selector groups the 16 certified eight-facet cases under **Certified
eight-facet catalogue** and the 51 certified nine-facet cases (labelled, for
example, "Nine-facet P319 #10") under **Certified nine-facet catalogue
(Ma-Zheng)**, so they remain reachable without filling the main screen with
cards. The H5-P7-22 prism and the regular ideal hyperbolic 3-cube are in
**Core and featured examples**. After a finite action is imported, **Active
source** names the Coxeter system carried by that action; all five model views
use it.

## Model Switch

The **View** panel switches among five models:

- **Davis complex** shows a finite Cayley ball and visible Davis cells. Each
  element `w` is placed at its reflection-orbit point `w·x0`: the hyperbolic
  orbit when the example has reflection data (drawn by a central projection
  that keeps every `2m`-gon flat), the Tits-cone orbit for finite groups (so
  `A3` is the permutohedron), and word-length shells otherwise. Examples with
  hyperbolic data open at radius 3.
- **hat X cover** shows the lifted standard presentation complex reconstructed
  from the active finite action.
- **bar X compression** shows the compressed even-sided complex, walls,
  cooriented edges, and lawful cells.
- **Defining graph Gamma** shows generators and all finite relation edges,
  including `m = 2`. Vertices carry their generator colour; edges are neutral
  and their order is shown by the label `m=k` and a line style (`m = 2`
  dotted, 3 solid, 4 dashed, 5 dash-dot, 6 or more long-dash). A planar Gamma
  is drawn flat without crossings.
- **Projection drawing** shows chamber barycenters from supplied reflection
  data in a 3D projection. The Klein model with coordinate axes is the
  default, since its straight edges are hyperbolic geodesics. The button is
  disabled, with the reason as its tooltip, for examples without reflection
  data.

Badges at the bottom right of the viewer name the projection (and say when it
is projected from `H^d`, `d > 3`, to 3D), how Davis positions were obtained,
and whether elements were identified by rounded matrices. A collapsible
generator legend sits at the bottom left; it is hidden when edge colours mean
walls instead of generators.

The sentence below the buttons describes the active layer. The Focus Inspector
contains the longer explanation.

## Covers + Walls

The panel reads from top to bottom in the order of the construction: a short
introduction, the workflow list, cover discovery and import, the relation
reader, walls, the lawful-subcomplex search, directed links, and the
virtual-fibering certificate.

### Workflow list

The numbered list is both a workflow and a status display. A completed step has
a check mark and a coloured left rule; screen readers hear "done" or "pending".

1. **Certify a torsion-free subgroup** reports the existence proof for a
   finite-index torsion-free subgroup `H`.
2. **Materialize a manageable finite cover** reports whether complete generator
   permutations are available, and the index.
3. **Compress to bar X** reports the edge and relation-cell counts of the
   certified compression.
4. **Find walls** reports the number of opposite-edge classes.
5. **Coorient walls** reports whether every wall has a consistent side.
6. **Keep lawful cells** reports how many relation polygons have one source and
   one sink.
7. **Certify a primitive map to ℤ** reports whether the subgroup presentation,
   wall cocycle, primitive image, and directed-link hypotheses all pass.

### Find a torsion-free cover

**Find torsion-free cover** asks the bounded automatic backend for a
finite-index torsion-free subgroup. Sage finite-image and GAP jobs run outside
the browser: the desktop app runs them directly, and in a browser the button
explains how to use the fallback below. The status pill reads _ready_,
_searching_, _found_, _bounds exhausted_, _skipped_, _timed out_, or _failed_.

**Search summary** lists the spherical catalogue, the necessary index divisor,
the search bound and **Search strategy**, and three separate cover rows.
**Torsion-free cover** records the existence proof, **Exact cover index** says
whether the finite image order has also been certified, and **Usable finite
cover** says whether complete generator permutations are available for
quotient, wall, and directed-link work. A congruence kernel can certify
existence even when its action is too large to build; the panel then shows
**Build quotient and walls** and **Run fibering pipeline** disabled, with the
reason next to them.

**Search bounds and fallback import** holds the search strategy, the numeric
bounds, and three buttons:

- **Export search request** writes the request for an external GAP/Sage run.
- **Import discovery result** reads the artifact such a run produces and
  certifies it again in the browser before building `hat X`.
- **Import an existing finite action** accepts the validated quotient/action
  schema directly. The app rebuilds the lifted presentation cells; it does not
  trust display cells in an imported artifact as `hat X` or `bar X`.

Import progress, a **Cancel import** button, and any import error appear
directly below the discovery card.

### Relation reader

**Relation family in bar X** controls how the relation cells of `bar X` are
drawn. Each family is one finite edge of Gamma.

- **All families** spreads the interiors of all exact relation disks into one
  shallow lane per family. The disks remain attached to the same vertices and
  generator edges (24 and 72 for the bundled ideal 3-cube).
- Choosing one pair, such as `t12–t13`, rearranges the shared 1-skeleton so
  that its boundary cycles read as polygons. The other generator edges remain
  as faint gluing context. For the ideal 3-cube, the degree-24 cover gives
  `24/(2 × 3) = 4` hexagons for each finite pair.
- **Compact gluing** removes the interior spread. Walls are read in this view;
  the wall controls appear only when it is selected.

The spread view never repeats a quotient vertex or edge. Drawing-only fold
points bend the interiors of the disks away from one another; they are not
vertices of `bar X`. Edge labels in a focused family name the alternating
Coxeter generators.

### Walls

**Select a wall** chooses one abstract wall. The **Wall reader** below it
switches between **All walls** and **Selected wall** and holds three toggles:

- **Show wall arcs** draws straight midpoint segments for the exact
  opposite-edge incidences.
- **Color dual edges by wall** colours each edge by the wall it crosses.
- **Show induced edge arrows** draws the direction the coorientation induces
  on each dual edge. Wall arcs themselves carry no direction.

**Wall diagnostics** reports whether the walls are embedded, two-sided, and
free of self-osculation, and how many vertices have a failing directed link.
In Teaching mode this grid is collapsed.

### Flip and optimise

**Flip selected wall** reverses its coorientation and every induced edge
direction. It does not change the wall class or the complex.

**Find largest lawful subcomplex** searches wall signs. A completed exact run
says **Proven optimum**. A budget-limited run says **Best found** and reports a
gap when one is available. If some wall is one-sided there is no coorientation;
this button and Track A are then disabled, and the panel says why.

### Directed links

**Inspect induced orientation** picks a vertex of `bar X` and switches the
scene between **All edges**, the **Ascending** link, and the **Descending**
link at that vertex, with the vertex and component counts of both links.

### Virtual-fibering certificate

**Run lawful-first certification** starts with Track A (lawful complex), the
smaller lawful polygonal complex. It checks both directed links at every
vertex, the finite-height-band π₁ argument, the primitive Schreier character,
and the kernel surjection onto `H`. CAT(0) or asphericity evidence is recorded
as optional. If Track A does not certify, the same action enters Track B
automatically.

**Check full Davis quotient** runs Track B (full Davis quotient) directly. It
builds every spherical Coxeter cell, one compatible pulling subdivision, the
exact perturbed height, and the full ascending and descending links. It is
also useful after a Track A success when the stronger geometric record is
wanted.

Each track shows its conclusion first. Its check grid (collapsed in Teaching
mode) and an evidence drawer follow. For Track B, **Certificate stages and
evidence** lists every pipeline stage as _passed_, _failed_, _incomplete_, or
_not run_, the values of φ on the Schreier generators, and the claim boundary.

**Export fibering certificate** writes the action-rooted lawful certificate
when Track A passed, otherwise the full-Davis certificate or the older
compression diagnostic. The file name identifies that scope. A failed export
is useful evidence; it is not presented as a theorem.

### Drawing options

- **Show relation cells** toggles polygon surfaces without removing cell data.
- **Show non-lawful cells faintly** keeps discarded cells as faint context
  rather than deleting them from the drawing.

Wall arcs, transparency, and layout are drawings. Edge IDs, signed boundary
occurrences, wall classes, and lawfulness are combinatorial data.

## Labels

**Show vertex labels** and **Show edge labels** control semantic labels. In
`hat X` and `bar X`, generator labels belong to the actual cover/compression
edges. In Gamma, edge labels are Coxeter orders (`m=2`, `m=3`, and so on), not
generator names. Long words are shortened by whole generators, as
`t24 t13 … t23 (ℓ=5)`, never by cutting a generator name. A selected wall receives one short wall label;
its drawing arcs do not masquerade as generator edges.

In scenes with more than 60 vertices, at most 25 vertex labels and 12 edge
labels are drawn at the framed view; the cap doubles with each 2x zoom (up to
three times). The selected vertex and its neighbours are always labelled.

**Fade far from the selected vertex** dims every vertex, edge and cell more
than one edge away from the selection (graph distance in the drawn ball), for
reading the local structure on the graph.

Clicking an edge selects it; the inspector names its generator and endpoints.
Each wall has its own colour and line style (45 distinct pairs), and the
selected wall's dual edges are drawn in that style rather than in the black
relation-boundary stroke.

## Focus Inspector

Every selection answers:

1. **What is selected?**
2. **Why is it here?**
3. **Exact or drawing?**

With nothing selected, the second answer is replaced by a hint to click a
vertex, edge, or cell. Open **Selection details** for IDs, boundary length,
wall size, pathology witnesses, and lawful-cell counts.

The **Caveats** panel below the inspector shows the number of active caveats;
**Show n caveats** opens the full list.

## Teaching And Research Modes

The **Interface** panel at the bottom of the right rail switches modes.
Teaching mode shows Choose Example, Start Here, View, **Covers + Walls**,
Labels, the inspector, and caveats. In that mode the long diagnostic grids and
search ledgers of the cover panel start collapsed. Research mode drops Start
Here, expands those grids, and adds the compact campaign status, **Data +
Status**, and **Notebook + Export**.

## Guided Tour

The question-mark button in the top bar starts a guided tour. It also opens
automatically once per browser on the first visit, but never under browser
automation. The URL parameter `?tour=1` forces it to open and `?tour=0`
suppresses it.

The tour loads the regular ideal hyperbolic 3-cube and its index-24 cover from
the surjection onto S4, then walks through Gamma, the Davis ball, the
projection, `hat X`, `bar X`, walls, lawful cells, and the fibering
certificate. Escape skips it. When the tour card has focus, the left and right
arrow keys move between steps.

## Keyboard And Camera

- Drag to orbit; wheel to zoom.
- `W`/`S` move forward and back, `A`/`D` left and right, and `Q`/`E` down and
  up. Hold Shift to move faster.
- `U` hides or restores the side rails. In viewer-only mode a floating **Show
  controls (U)** button also restores them.
- The **Reset camera** icon in the viewer restores the camera. Nearly flat
  scenes, such as one Davis polygon or the planar Gamma drawing, are framed
  face-on.
- The theme button switches between light and dark. Without a stored choice
  the theme follows the operating-system preference.

These keys work anywhere on the page; they are ignored while typing in a text
field or a select box.
