# UI Controls

The interface follows one question: which mathematical layer are you reading?
Controls that do not apply to the active layer are hidden.

## Choose Example

Selects the source Coxeter system. The radius slider appears only in the Davis
and Projection views. The primary workflow asks the bounded automatic backend
to discover a finite-index torsion-free cover. Sage/finite-image and GAP jobs
run outside the browser and produce the same finite-action artifact accepted
by **Import finite cover JSON**. The desktop bridge can run the controlled job;
manual import remains the advanced path for artifacts made elsewhere.

The cover status uses three separate rows. **Torsion-free cover** records the
existence proof, **Exact cover index** says whether the finite image order has
also been certified, and **Usable finite cover** says whether complete
generator permutations are available for quotient, wall, and Morse work.

The selector groups the 16 certified eight-facet cases under **Certified
eight-facet catalogue** so they remain reachable without filling the main
screen with cards. After a finite action is imported, **Active source** names
the Coxeter system carried by that action; all five model views use it.

## Model Switch

- **Davis complex** shows a finite Cayley ball and visible Davis cells.
- **hat X cover** shows the lifted standard presentation complex reconstructed
  from the active finite action.
- **bar X compression** shows the compressed even-sided complex, walls,
  cooriented edges, and lawful cells.
- **Defining graph Gamma** shows generators and all finite relation edges,
  including `m = 2`.
- **Projection drawing** shows chamber barycenters from supplied reflection
  data in a 3D projection.

The sentence below the buttons describes the active layer. The Focus Inspector
contains the longer explanation.

## Covers + Walls

The numbered list is both a workflow and a status display. Automatic
torsion-free subgroup discovery belongs before step 1; its passing artifact
feeds the same finite-cover validator.

1. **Finite cover** reports the imported action/cover artifact.
2. **Compress to bar X** reports the certified compression counts.
3. **Find walls** reports opposite-edge equivalence classes.
4. **Coorient walls** reports whether every wall admits a consistent side.
5. **Keep lawful cells** reports how many relation polygons have one source and
   one sink.
6. **Certify a primitive map to Z** reports whether the subgroup presentation,
   wall cocycle, primitive image, and PL Morse hypotheses all pass.

### Relation-family selector

**Finite edge of Gamma** controls how the relation cells of `bar X` are drawn:

- **All families** spreads the interiors of all exact relation disks into
  twelve shallow four-cell lanes. The disks remain attached to the same 24
  vertices and 72 generator edges.
- Choosing one pair, such as `t12 - t13`, rearranges the actual shared
  1-skeleton so that its four boundary cycles read as hexagons. The other
  generator edges remain as faint gluing context. For the bundled ideal
  3-cube, the degree-24 cover gives `24/(2 x 3) = 4` hexagons for each finite
  pair.
- **Compact gluing** removes the interior spread. Use it to inspect walls and
  the least-deformed drawing of the common 1-skeleton.

The spread view never repeats a quotient vertex or edge. Drawing-only fold
points bend the interiors of the disks away from one another; they are not
vertices of `bar X`. Edge labels in a focused family name the alternating
Coxeter generators.

**Import finite cover JSON** accepts the existing validated quotient/action
schema. The app rebuilds the lifted presentation cells; it does not trust the
hybrid display cells in an imported artifact as `hat X` or `bar X`.
Manual import is the present working path and the long-term advanced fallback,
not the desired burden on an ordinary user.

**Select a wall** chooses one abstract wall. The scene brightens its dual edges
and midpoint arcs.

**Flip selected wall** reverses its coorientation and every induced edge
direction. It does not change the wall class or the complex.

**Find largest lawful subcomplex** searches wall signs. A completed exact run
says **Proven optimum**. A budget-limited run says **Best found** and reports a
gap when one is available.

**Run lawful-first certification** starts with the smaller lawful polygonal
complex. It checks the exact regular-polygon metric links, the affine Morse
data, both directed links at every vertex, the primitive Schreier character,
and the kernel surjection onto `H`. If that track does not certify, the same
action automatically enters the complete Davis-quotient fallback.

**Check full Davis quotient** runs the stronger second track directly. It
builds every spherical Coxeter cell, one compatible pulling subdivision, the
exact perturbed height, and the full ascending and descending links. This is
also available after a lawful success when the stronger geometric record is
useful. The result panel shows:

- the Reidemeister--Schreier generator and relator counts for `H`;
- the raw wall-map image `dZ` and the normalized primitive values;
- the number of compressed relation boundaries with sum zero;
- every PL Morse hypothesis as `passed`, `failed`, or `missing-evidence`.

**Export fibering certificate** writes the action-rooted lawful certificate
when Track A passed, otherwise the full-Davis certificate or the older
compression diagnostic. The file name identifies that scope. A failed export
is useful evidence; it is not presented as a theorem.

## Drawing Options

- **Show wall arcs** toggles straight midpoint segments representing exact
  opposite-edge incidences.
- **Show relation cells** toggles polygon surfaces without removing cell data.
- **Show nonlawful cells as context** keeps discarded cells faint rather than
  deleting them from the drawing.

Wall arcs, transparency, and layout are drawings. Edge IDs, signed boundary
occurrences, wall classes, and lawfulness are combinatorial data.

## Labels

**Show vertex labels** and **Show edge labels** control semantic labels. In
`hat X` and `bar X`, generator labels belong to the actual cover/compression
edges. In Gamma, edge labels are numerical Coxeter orders (`2`, `3`, `5`, and
so on), not generator names. A selected wall receives one short wall label;
its drawing arcs do not masquerade as generator edges.

## Focus Inspector

Every selection answers:

1. **What is selected?**
2. **Why is it here?**
3. **Exact or drawing?**

Open **Selection details** for IDs, boundary length, wall size, pathology
witnesses, and lawful-cell counts.

## Teaching And Research Modes

Teaching mode keeps source, model, Start Here, Covers + Walls, labels, inspector,
and caveats visible. Research mode adds evidence status, render statistics, and
reproducible exports.

## Keyboard And Camera

- Drag to orbit; wheel to zoom.
- `W/A/S/D` moves the camera while the viewer has focus.
- `U` hides or restores the side rails.
- The reset icon restores the camera.

Keyboard movement is disabled while typing in a form control.
