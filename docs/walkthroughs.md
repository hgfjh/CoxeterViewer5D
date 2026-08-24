# Walkthroughs

These walkthroughs are short enough to use beside the app. Each one ends by
separating exact incidence from the 3D drawing.

## Before You Start

Use **Teaching** mode for the first three walkthroughs. Switch to **Research**
mode for finite-action imports, compression certificates, wall search settings,
and exports.

The model switch has five entries:

```text
Davis | hat X | bar X | Gamma | Projection
```

The **Focus Inspector** is the reference point. It should always tell you what
is selected, why it exists, and whether the claim is exact data, a browser
diagnostic, or a drawing.

## Find A Rank-Two Cell

Goal: see why a finite Coxeter relation gives a polygon in the Davis complex.

1. Load `A2` or `I2(3)`.
2. Open **Davis**.
3. Turn on rank-two cells and choose the pair `(s0,s1)`.
4. Select the filled polygon.
5. Read its boundary in the inspector.

For `m_01 = 3`, the attaching word alternates:

```text
s0, s1, s0, s1, s0, s1.
```

The cell is therefore a hexagon. With `I2(5)`, the same construction gives a
decagon.

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

1. Load the compact 5-cube or a small finite example.
2. Open **Gamma**.
3. Select a generator vertex.
4. Read its incident relation counts and neighbor list.
5. Open the relation-order components for `m = 2`, `m = 3`, and any other
   finite labels present.

The app's full finite-relation graph includes commuting `m = 2` pairs. Pairs
with `m = inf` are absent because they give no finite rank-two relation.

In the 2D view, **Why crossings remain** distinguishes a poor layout from a
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

The intended workflow is:

1. Choose the source Coxeter system and an index bound.
2. Enumerate prime-order torsion representatives from its spherical special
   subgroups.
3. Run the bounded automatic finite-image/composite/GAP strategy ladder.
4. Inspect the subgroup index, generators, and fixed-point table.
5. Continue only after every representative has zero fixed points.

The result must say **Found and verified**, **Exhausted through index N**,
**Inconclusive**, or **Blocked**. Only the first status supplies a torsion-free
cover. Exhausting a bound does not contradict Selberg's lemma.

The automatic ladder starts with exact Sage finite-image/congruence reductions,
recognition and fixed-point marks, and compatible smaller permutation modules.
It uses bounded GAP low-index enumeration as the final small fallback. Run it
through the controlled desktop job or the command documented in
`docs/tooling.md`, then open its finite-action artifact in Covers + Walls. The
browser itself cannot launch GAP or Sage. The bundled action in the next
walkthrough remains the quickest small example.

## Build hat X From I2(5)

Goal: use the current fallback to turn a complete finite action into the lifted
presentation complex.

1. Load `I2(5)`.
2. Open **Research** -> **Covers + Walls**.
3. Choose the bundled identity-action fixture.
4. Inspect the action checks: both generators must act as involutions and the
   length-ten relation must close.
5. Press **Build hat X**.
6. Open **hat X** in the model switch.

The identity subgroup of `I2(5)` is torsion-free and gives a ten-sheet action.
It is a transparent fixture, not evidence that identity-subgroup covers are a
practical choice for infinite Coxeter groups. In `\hat X`, inspect:

- the ten cover vertices;
- directed lifts of `s0` and `s1`;
- twenty lifted `s_i^2` bigons, one at each vertex for each generator;
- the lifted decagonal relation cells.

Select one directed lift. Its inspector entry should name its inverse partner
and generator bigon. Select one relation lift and follow all ten signed boundary
occurrences in order.

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
2. Press **Compress to bar X**.
3. Open **bar X**.
4. Open the compression certificate.

For rank `r = 2` and degree `d = 10`, the paper's count gives:

```text
vertices                 d = 10
geometric edges          d r / 2 = 10
decagonal cells          d / (2m) = 1
```

Select a compressed edge. The linked `\hat X` view should highlight the two
directed generator lifts and the two bigons in its fiber. Select the decagon. Its
fiber should contain the ten lifted relation cells with the same compressed
boundary.

The compression certificate checks the actual data. A matching count by itself
is not enough; boundary signs and complete fiber coverage must also agree.

Exact here:

- the compression map and its fibers;
- the compressed signed boundary;
- passed count and closure checks.

Drawing here:

- separation between fiber members;
- glass faces and exploded views;
- linked-view camera placement.

## Read The Ideal 3-Cube Hexagons

Goal: see why the compression has four hexagons for each finite edge of Gamma
and 48 hexagons altogether.

1. Load **Regular ideal hyperbolic Coxeter 3-cube**.
2. Open **bar X compression**.
3. In **Finite edge of Gamma**, keep the first pair selected.
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

## Find The Walls Of bar X

Goal: construct walls from opposite sides, not from generator colors.

1. Continue with the `I2(5)` decagon.
2. Press **Find walls**.
3. Choose **All walls**, then **Selected wall**.
4. Step through the five wall classes.

A decagon has five opposite edge pairs. In this one-cell example each pair
gives one wall segment. Notice that a wall is defined by the transitive closure
of opposition; in a larger complex it can pass through many cells and can meet
edges carrying different generator labels.

Open **Wall diagnostics** and inspect:

- embeddedness;
- two-sidedness;
- self-osculation;
- any retained witness.

The midpoint arcs are only how the wall immersion is drawn. The exact data are
the dual edge IDs, opposite-pair occurrences, relation-cell IDs, and parity
constraints.

## Coorient Walls And Read A Lawful Cell

Goal: see how wall coorientations produce edge directions and lawful polygons.

1. In **Coorientation**, choose a direction for each two-sided wall.
2. Turn on **Show induced edge arrows**.
3. Select the decagon.
4. Read its cyclic sign word.
5. Flip one wall and compare the result.

The colored arcs are not directed paths. Their coorientation is transverse:
the arrowheads appear on the dual edges of `bar X`. Turn on **Color dual edges
by wall** to match each edge to the wall that controls its arrow. Use **All
walls** for the global pattern and **Selected wall** to isolate one parity
class without removing the surrounding complex.

A lawful cell has exactly two cyclic sign changes. The viewer marks its unique
source and sink and shows two positively directed boundary paths between them.
If the sign word has more than two transitions, the cell is discarded from the
lawful subcomplex.

The word **maximal** needs care:

- after the coorientation is fixed, the displayed lawful subcomplex already
  contains every lawful cell for that assignment;
- finding a coorientation that retains the largest possible number of cells is
  a separate optimization problem.

## Search For A Large Lawful Subcomplex

Goal: compare a proven finite optimum with a heuristic result.

1. Load a `\bar X` with more than one relation cell.
2. Open **Search coorientations**.
3. Start with the unweighted lawful-cell objective.
4. Leave link constraints off for the first run.
5. Run the exact search when the wall count is below the displayed limit.
6. Compare with a time-limited run.

Read the result literally:

- **Maximum proven** means exact search completed and lower and upper bounds
  agree.
- **Best found** means the assignment is only a lower bound.
- **No feasible assignment** refers to the selected constraints, not to every
  possible mathematical reformulation.
- **Invalid wall system** means the required coorientation data could not be
  formed.

Turn on nonempty/connected ascending and descending link constraints only after
inspecting the unconstrained result. The search certificate records all options
and budgets.

## Inspect Ascending And Descending Links

Goal: understand the local condition without overreading it.

1. Choose a lawful coorientation.
2. Select a vertex of `\bar X`.
3. Open **Ascending link** and **Descending link** in turn.
4. Inspect their vertices, retained corners, and connected components.

An ascending link vertex corresponds to an edge directed away from the selected
vertex. A descending link vertex corresponds to an edge directed toward it.
Link edges come from corners of retained lawful cells and the wall directions
through those cells.

A green nonempty/connected result is an exact finite check for the selected
data. It does not prove that the complex is aspherical or affine, that the
finite action is torsion-free, or that all hypotheses of Bestvina--Brady or
Jankiewicz--Wise hold.

## Find And Certify A Virtual Algebraic Fibration

Goal: obtain an explicit map `phi: H -> Z` and see exactly why the Morse
conclusion passes or fails.

1. Load a source with a certified finite action and open **bar X compression**.
2. Choose **Compact gluing** so the wall controls are available.
3. Press **Run lawful-first certification**. Use **Check full Davis quotient**
   when you want the all-cell fallback even if the lawful track passes.
4. Expand **Schreier values and PL Morse hypotheses**.
5. Read the raw image, normalization divisor, primitive values, relator sums,
   cell-boundary sums, and the per-hypothesis status list.
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
2. Inspect **Gamma** and its certificate scopes.
3. Open **Projection** to examine chamber barycenters.
4. Return to **Covers + Walls**.

The Coxeter matrix guarantees neither a canonical cover nor a useful index
bound. The implemented automatic backend is bounded and may finish
inconclusively. A complete materialized finite action is still required before
constructing `\hat X`; a matrix-only congruence kernel is not enough. If no
suitable torsion-free evidence is attached, the app labels the derived
incidence as a browser construction rather than a certified torsion-free cover.

These high-dimensional examples can contain finite rank-three special
subgroups. The paper's dimension-at-most-two/asphericity argument therefore
does not automatically apply. Wall, coorientation, lawful-cell, and link
results remain worthwhile diagnostics, but they are not an incoherence proof.

## Inspect A Geometric Projection

Goal: read reflection placement without mistaking it for an exact 3D embedding.

1. Load an example with supplied geometric data.
2. Open **Projection**.
3. Read the projection name and geometry status.
4. Compare axes-based Klein or Poincare coordinates with PCA where available.

The reference sphere belongs only to actual ball-model coordinates. PCA output
does not inherit the unit sphere after dimension reduction.

Certified interval normals, basepoints, reflections, and projection bounds
support their named algebraic/numerical scopes. Cell shapes, occlusion, and the
final 3D mesh remain drawings.

## Check Data And Certificates

Goal: understand what a green status actually certifies.

1. Switch to **Research** mode.
2. Open **Status/tools**.
3. Read the source-data, finite-action, compression, wall, and geometry rows
   separately.
4. Expand a row to see hashes, tool versions, claims, and limitations.

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

1. Save the active Covers + Walls run in the notebook.
2. Add a note describing the question and any unverified hypothesis.
3. Export the experiment bundle.
4. Export a figure bundle if a screenshot is needed.

The research bundle should contain or hash the source, action, `\hat X`,
`\bar X`, compression certificate, wall system, coorientation/search result,
lawful subcomplex, links, warnings, and view state. The figure bundle records
the camera and selected IDs but is not a substitute for the research data.

An automatic-discovery bundle includes the bounded-search report, prime-order
torsion words, and fixed-point table. The fibering block adds the subgroup
presentation, raw values of `chi` and normalized values of `phi` on Schreier
generators, rewritten-relator sums, compressed-cell sums, a Bezout primitivity
witness, directed links, and the complete PL Morse checklist.
