# Walkthroughs

These walkthroughs are short enough to use beside the app. Each one ends by
separating exact incidence from the 3D drawing.

## Before You Start

Use **Teaching** mode for the first three walkthroughs. Switch to **Research**
mode (the **Interface** panel at the bottom of the right rail) for the
**Data + Status** rows, expanded diagnostic grids, and exports. Finite-action
import is available in both modes.

The **View** panel has five model buttons:

```text
Davis complex | hat X cover | bar X compression | Defining graph Gamma | Projection drawing
```

The **Focus Inspector** is the reference point. It should always tell you what
is selected, why it exists, and whether the claim is exact data, a browser
diagnostic, or a drawing.

## Find A Rank-Two Cell

Goal: see why a finite Coxeter relation gives a polygon in the Davis complex.

1. In **Source Coxeter system**, choose **A2**.
2. In **View**, choose **Davis complex**.
3. Click the filled hexagon in the viewer.
4. Read the **Focus Inspector**: it names the alternating generators `s0` and
   `s1`, and **Selection details** gives the boundary length.

For `m_01 = 3`, the attaching word alternates:

```text
s0, s1, s0, s1, s0, s1.
```

The cell is therefore a hexagon. With **I2(5) wall demo**, the same
construction gives a decagon.

Exact here:

- the finite pair;
- boundary length `2m`;
- boundary vertex and edge IDs;
- the alternating generator sequence.

Drawing here:

- the polygon's Euclidean shape;
- the 3D node positions;
- fill opacity and camera angle.

## Read Gamma

Goal: read the Coxeter presentation before building a cover.

1. Choose **Compact 5-cube Gamma1** or a small finite example.
2. In **View**, choose **Defining graph Gamma**.
3. Keep **Show edge labels** on: each edge is labelled by its Coxeter order
   `m`, not by a generator.
4. Click a generator vertex; the inspector names it.
5. Open **Caveats** for the number of drawn `m = 2` pairs and the planarity
   note.

The app's full finite-relation graph includes commuting `m = 2` pairs. Pairs
with `m = inf` are absent because they give no finite rank-two relation.

For a planar drawing, the **Caveats** list distinguishes a poor layout from a
nonplanar graph and reports a `K5` or `K3,3` obstruction when one is found.

Exact here:

- generator IDs;
- finite Coxeter matrix entries;
- relation-order connected components;
- a verified planarity obstruction.

Drawing here:

- 2D or 3D vertex placement;
- crossing minimization;
- label offsets.

## Discover A Torsion-Free Cover

Goal: begin with a Coxeter system and obtain a certified coset action without
writing the permutations by hand.

The workflow is:

1. Choose the source Coxeter system. In **Covers + Walls**, open **Search
   bounds and fallback import** to set **Maximum subgroup index** and the
   other bounds.
2. Press **Find torsion-free cover** (desktop app). The backend enumerates
   prime-order torsion representatives from the spherical special subgroups.
3. It runs the bounded automatic finite-image/composite/GAP strategy ladder.
4. Open **Search summary** for the spherical catalogue, the necessary index
   divisor, and the **Torsion-free cover**, **Exact cover index**, and
   **Usable finite cover** rows.
5. Continue only after every representative has zero fixed points.

The status pill reads _ready_, _searching_, _found_, _bounds exhausted_,
_skipped_, _timed out_, or _failed_. Only _found_, with a passing
recertification, supplies a torsion-free cover. Exhausting a bound is
inconclusive beyond that bound; it does not contradict Selberg's lemma.

The automatic ladder starts with exact Sage finite-image/congruence reductions,
recognition and fixed-point marks, and compatible smaller permutation modules.
It uses bounded GAP low-index enumeration as the final small fallback. Run it
through the controlled desktop job or the command documented in
`docs/tooling.md`. In a browser, use **Export search request**, run the
request externally, and load the result with **Import discovery result**. The
browser itself cannot launch GAP or Sage. The bundled action in the next
walkthrough remains the quickest small example.

## Build hat X From I2(5)

Goal: see a complete finite action turned into the lifted presentation
complex.

1. In **Source Coxeter system**, choose **I2(5) wall demo** (the default). Its
   bundled identity-subgroup action loads with it; `hat X` is built
   automatically once the action passes validation (both generators act as
   involutions and the length-ten relation closes). There is no separate
   build button.
2. In **Covers + Walls**, step **2. Materialize a manageable finite cover**
   reports index 10.
3. In **View**, choose **hat X cover**.

The identity subgroup of `I2(5)` is torsion-free and gives a ten-sheet action.
It is a transparent fixture, not evidence that identity-subgroup covers are a
practical choice for infinite Coxeter groups. In `\hat X`, inspect:

- the ten cover vertices;
- directed lifts of `s0` and `s1`;
- twenty lifted `s_i^2` bigons, one at each vertex for each generator;
- the lifted decagonal relation cells.

Click a vertex: the inspector explains it as a lift of the base vertex. Click a
relation lift: **Selection details** gives boundary length 10. Edges cannot yet
be selected, so inverse partners and bigon fibers are not shown in the
inspector; they are recorded in the exported experiment.

Exact here, after validation:

- the finite action and lifted incidence;
- inverse pairing;
- signed attaching maps;
- source hashes and supplied evidence status.

Not proved by the picture:

- that an arbitrary imported action comes from a torsion-free subgroup;
- that the 3D spacing is a covering-space metric.

## Compress hat X To bar X

Goal: see the two cellular identifications in the paper.

1. Continue from the `I2(5)` cover.
2. In **View**, choose **bar X compression**. Compression runs automatically;
   step **3. Compress to bar X** reads 10 edges and 1 relation cell.
3. In Research mode, the **Compression** row of **Data + Status** shows the
   certificate status.

For rank `r = 2` and degree `d = 10`, the paper's count gives:

```text
vertices                 d = 10
geometric edges          d r / 2 = 10
decagonal cells          d / (2m) = 1
```

The fiber of a compressed edge is two directed generator lifts and two bigons,
and the fiber of the decagon is the ten lifted relation cells with the same
compressed boundary. The current UI shows one model at a time and has no
linked `\hat X` highlight; the fibers are recorded in the compression
certificate of the exported experiment.

The compression certificate checks the actual data. A matching count by itself
is not enough; boundary signs and complete fiber coverage must also agree.

Exact here:

- the compression map and its fibers;
- the compressed signed boundary;
- passed count and closure checks.

Drawing here:

- vertex positions and camera placement;
- glass faces and the spread of relation-cell interiors.

## Read The Ideal 3-Cube Hexagons

Goal: see why the compression has four hexagons for each finite edge of Gamma
and 48 hexagons altogether.

1. In **Source Coxeter system**, choose **Ideal 3-cube, all m=3 (S4 cover)**.
2. In **View**, choose **bar X compression**.
3. In **Relation family in bar X** (it opens on **Compact gluing**), choose the
   first pair, `t12–t13`.
4. Read the four highlighted boundary cycles on the shared quotient skeleton.
   The faint rails between them show how the rest of the complex remains glued.
5. Choose **All families** to spread all 48 disk interiors into twelve groups
   of four. Orbit the object to follow each disk back to the common rails.
6. Choose **Compact gluing** to remove the drawing folds before inspecting
   walls.

The count is

```text
d/(2m) = 24/(2 x 3) = 4 hexagons per finite pair,
12 finite pairs x 4 = 48 hexagons in bar X.
```

The spread drawing retains the exact 24 vertices, 72 edges, cell IDs, and cyclic
attaching words. Its interior folds make crowded disks readable; they do not
split `bar X` into separate polygons.

## Open The Closed C(4,4;2,2;3,3) Example

Goal: see a closed hyperbolic 3-manifold cover and its 42 walls in the viewer.

1. In **Source Coxeter system**, choose **Compact tetrahedron C(4,4;2,2;3,3)
   (PSL(2,7) cover)**. The bundled 336-sheet cover loads with it; the
   **Covers + Walls** panel reports that every spherical `B3` restriction was
   checked in-repo.
2. In **View**, choose **hat X cover**: 336 vertices, one for each sheet.
3. Choose **bar X compression**. Step 3 of **Covers + Walls** reads 672 edges
   and 364 relation cells.
4. Step **4. Find walls** reads 42 opposite-edge classes, and the **Walls**
   count above the scene agrees.

The low-barycentric check of this example is not run in the browser. The
golden test reproduces it, with an orientation that passes both gates at every
vertex (see
low-barycentric-morse.md):

```bash
corepack pnpm exec vitest run tests/c44-golden-example.test.ts
```

## Find The Walls Of bar X

Goal: construct walls from opposite sides, not from generator colors.

1. Continue with the `I2(5)` decagon in **bar X compression**, with
   **Relation family in bar X** set to **Compact gluing** (the default). Walls
   are found automatically; step **4. Find walls** reads 5 opposite-edge
   classes.
2. In the **Wall reader**, choose **All walls**, then **Selected wall**.
3. Step through the five wall classes with **Select a wall**.

A decagon has five opposite edge pairs. In this one-cell example each pair
gives one wall segment. Notice that a wall is defined by the transitive closure
of opposition; in a larger complex it can pass through many cells and can meet
edges carrying different generator labels.

Open **Wall diagnostics** and inspect:

- embeddedness;
- two-sidedness;
- self-osculation;
- the number of vertices with failing directed links.

The midpoint arcs are only how the wall immersion is drawn. The exact data are
the dual edge IDs, opposite-pair occurrences, relation-cell IDs, and parity
constraints.

## Coorient Walls And Read A Lawful Cell

Goal: see how wall coorientations produce edge directions and lawful polygons.
A coorientation is what Jankiewicz--Wise call an orientation of a two-sided
wall; the two words name the same thing.

1. In **Covers + Walls**, with **Compact gluing** selected, keep **Show
   induced edge arrows** on. Every two-sided wall starts with a sign.
2. Click the decagon.
3. Open **Selection details** and read **Boundary signs** and **Lawful**.
4. Choose a wall in **Select a wall**, press **Flip selected wall**, and
   compare the result.

The colored arcs are not directed paths. Their coorientation is transverse:
the arrowheads appear on the dual edges of `bar X`. Turn on **Color dual edges
by wall** to match each edge to the wall that controls its arrow. Use **All
walls** for the global pattern and **Selected wall** to isolate one parity
class without removing the surrounding complex.

A lawful cell has exactly two cyclic sign changes, so it has a unique source
and sink joined by two positively directed boundary paths. **Selection
details** lists the **Source** and **Sink** vertices.
If the sign word has more than two transitions, the cell is discarded from the
lawful subcomplex.

The word **maximal** needs care:

- after the coorientation is fixed, the displayed lawful subcomplex already
  contains every lawful cell for that assignment;
- finding a coorientation that retains the largest possible number of cells is
  a separate optimization problem.

## Search For A Large Lawful Subcomplex

Goal: tell a proven finite optimum from a budget-limited result.

1. Load a `bar X` with more than one relation cell and only two-sided walls,
   and choose **Compact gluing**.
2. In **Covers + Walls**, press **Find largest lawful subcomplex**.
3. Read the status line under the button.

The search maximizes the number of lawful relation cells over wall
orientations. It runs exactly when there are at most 22 walls, and in any case
within a 2,000,000-node and 12-second budget. Read the result literally:

- **Proven optimum** means the search completed and its lower and upper bounds
  agree.
- **Best found** means the assignment is only a lower bound; the status line
  reports the remaining gap.

The button applies the best assignment it found to the wall signs. It does not
add link constraints. Check the ascending and descending links afterwards, as
in the next walkthrough. The exported search certificate records the budgets.

## Inspect Ascending And Descending Links

Goal: understand the local condition without overreading it.

1. Choose a coorientation (for example, after **Find largest lawful
   subcomplex**).
2. Open **Inspect induced orientation** and pick a vertex in **Vertex of bar
   X**.
3. Press **Ascending**, then **Descending**.
4. The inspector reports the link vertices, link edges, components, and
   whether the link is nonempty and connected.

An ascending link vertex corresponds to an edge directed away from the selected
vertex. A descending link vertex corresponds to an edge directed toward it.
Link edges come from corners of retained lawful cells and the wall directions
through those cells.

A green nonempty/connected result is an exact finite check for the selected
data. By itself it does not certify a compatible PL height, the cyclic-cover
finite-band argument, the torsion-freeness of the finite action, or the kernel
transfer to `H`. It also does not prove asphericity, although asphericity is an
optional stronger diagnostic rather than a Track A finite-generation gate.

## Find And Certify A Virtual Algebraic Fibration

Goal: obtain an explicit map `phi: H -> Z` and see exactly why the Morse
conclusion passes or fails.

1. Load a source with a certified finite action and open **bar X compression**.
2. Choose **Compact gluing** so the wall controls are available.
3. Press **Run lawful-first certification**. Use **Check full Davis quotient**
   when you want the all-cell fallback even if the lawful track passes.
4. Expand **Certificate stages and evidence** under the Track B result, or
   **Lawful-track evidence and limits** under Track A.
5. Read the pipeline stages, the values of `phi` on the Schreier generators,
   the primitive-character and rank-two-sum status, and the claim boundary.
6. Press **Export fibering certificate**.

The original wall cochain assigns `+1` or `-1` to each stored edge and drives
the Morse orientation. Its periods may generate `dZ`. The exported primitive
map divides those loop periods by `d`; it does not divide the edge arrows.
The Bezout row is the short proof that the normalized generator values span
all of `Z`.

The bundled ideal 3-cube is a useful diagnostic: its wall map has raw image
`2Z` and normalizes to an epimorphism. The current compression also reports
self-osculation. That warning means the paper's random-orientation probability
estimate does not apply unchanged; it is not a theorem gate after the app has
checked this concrete orientation and every directed link directly.

## Use A Compact Hyperbolic Example Responsibly

Goal: separate a useful wall experiment from a theorem claim.

1. Load the compact 5-cube or a compact 5-prism example.
2. Inspect **Defining graph Gamma** and, in Research mode, the **Source data**
   row of **Data + Status** and the **Compact H5 campaign status** list.
3. Open **Projection drawing** to examine chamber barycenters.
4. Return to **Covers + Walls**.

The Coxeter matrix guarantees neither a canonical cover nor a useful index
bound. The implemented automatic backend is bounded and may finish
inconclusively. A complete materialized finite action is still required before
constructing `\hat X`; a matrix-only congruence kernel is not enough. If no
suitable torsion-free evidence is attached, the app labels the derived
incidence as a browser construction rather than a certified torsion-free cover.

These high-dimensional examples can contain finite rank-three special
subgroups. The paper's dimension-at-most-two/asphericity argument therefore
does not automatically apply. That does not obstruct the direct Track A
finite-height-band argument on a certified lawful PL complex. Wall,
coorientation, lawful-cell, and link results remain worthwhile diagnostics,
but by themselves they are neither a fibering nor an incoherence proof.

## Inspect A Geometric Projection

Goal: read reflection placement without mistaking it for an exact 3D embedding.

1. Load an example with supplied geometric data.
2. In **View**, choose **Projection drawing**.
3. Read the geometry status in the **Focus Inspector** and **Caveats**.
4. In the **Projection** selector, compare the coordinate-axes Klein or
   Poincaré views with PCA.

The reference sphere belongs only to actual ball-model coordinates. PCA output
does not inherit the unit sphere after dimension reduction.

Certified interval normals, basepoints, reflections, and projection bounds
support their named algebraic/numerical scopes. Cell shapes, occlusion, and the
final 3D mesh remain drawings.

## Check Data And Certificates

Goal: understand what a green status actually certifies.

1. Switch to **Research** mode.
2. Find **Data + Status** in the right rail.
3. Read the **Source data**, **Cover action**, **Torsion-free evidence**,
   **Automatic cover search**, **Compression**, and **Wall system** rows
   separately.
4. For hashes, tool versions, claims, and limitations, export the experiment
   (**Export experiment**) and read its certificate blocks.

Typical distinctions:

- source transcription passed;
- exact Gram/signature check passed;
- finite action passed in-repo checks;
- torsion-free evidence not supplied;
- compression passed for the supplied action;
- walls passed finite browser diagnostics;
- external checker skipped because the tool was unavailable.

No row inherits a stronger status from another row.

## Save A Reproducible Run

1. Switch to **Research** mode.
2. In **Notebook + Export**, press **Export experiment**.
3. Press **Export figure** if a screenshot is needed.
4. In the desktop app, **Save Session** also writes a `.coxeter-session.json`
   file. The current UI has no notebook for notes; record the question and any
   unverified hypothesis beside the exported files.

The research bundle should contain or hash the source, action, `\hat X`,
`\bar X`, compression certificate, wall system, coorientation/search result,
lawful subcomplex, links, warnings, and view state. The figure bundle records
the camera and selected IDs but is not a substitute for the research data.

An automatic-discovery bundle includes the bounded-search report, prime-order
torsion words, and fixed-point table. The fibering block adds the subgroup
presentation, raw values of `chi` and normalized values of `phi` on Schreier
generators, rewritten-relator sums, compressed-cell sums, a Bezout primitivity
witness, directed links, and the complete PL Morse checklist.
