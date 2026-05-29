# Walkthroughs

These walkthroughs are short inspection scripts for the main teaching views.
They are not proofs. Each one separates the combinatorial object from the 3D
drawing used to make it legible.

## Before You Start

Use a small radius first. A radius that is too small may show an incomplete
cell boundary; a radius that is too large may hide labels or cells behind render
budgets. The warnings panel is part of the mathematical readout, not a nuisance
banner.

Good first examples:

- `A2`: one rank-two spherical pair with `m = 3`.
- `I2(5)`: one decagon relation with full group order `10`.
- `A3`: a rank-three spherical example with square and hexagon relation faces.
- The `I2(5)` quotient/game demo: ten cosets and one decagon quotient cell.

## Hexagon Relation

Goal: read the relation `(s_i s_j)^3 = 1` as one rank-two Davis cell.

1. Open `A2` or any example with a finite pair `m_ij = 3`.
2. Set the radius large enough to include the full relation boundary. For `A2`,
   the full group appears quickly.
3. Open the rank-two relation view and choose the pair `(i, j)` with `m = 3`.
4. Select one visible rank-two cell.
5. Turn on relation-walk labels if available.

What to look for:

- The boundary has `2m = 6` directed edge steps.
- Edge labels alternate between the two generators.
- The same polygon can be started at any boundary vertex and read in either
  direction.
- Filled color means the whole boundary is present in the finite ball.

What is exact:

- The generator pair.
- The Coxeter value `m = 3`.
- The cyclic boundary node ids in the generated graph.
- The statement that this is the Davis cell for one coset of `<s_i, s_j>`.

What is a drawing:

- The Euclidean shape of the filled hexagon.
- The camera angle, opacity, label placement, and any ghost context.
- Any apparent metric length or angle in the 3D scene.

If the cell is outlined but not filled, the radius cutoff probably clipped the
boundary. Increase radius or switch to a focused relation view.

## Rank-Three Cell

Goal: inspect how rank-two faces assemble around one finite rank-three
spherical subset.

1. Open `A3`.
2. Use the rank-three cell or `Y_Gamma` reader preset.
3. Choose a spherical triple, typically `{s0, s1, s2}` in the bundled `A3`
   example.
4. Rotate the camera until the square and hexagon face families are both
   visible.
5. Use the local link or atlas panel to compare the displayed faces with the
   finite generator pairs.

What to look for:

- A finite rank-three subset contributes one higher Davis cell in the local
  model.
- Its boundary is organized by rank-two spherical faces.
- In an `A3`-style triple, one commuting square face and one `m = 3` hexagon
  face can meet along a common generator direction.
- The viewer may draw the rank-three cell as a bounded 3D proxy so the
  incidence is readable.

What is exact:

- Which three generators form the spherical subset.
- Which rank-two faces belong to its boundary.
- The incidence records between the higher cell and the listed rank-two faces.

What is a drawing:

- The convex hull or panel geometry used to make the cell visible.
- The apparent Euclidean shape of a finite Coxeter cell unless exact affine
  coordinates were imported.
- Any separation between faces introduced only to prevent visual overlap.

The important question is not "is this a literal Euclidean polytope?" The
first question is "which spherical subset and which face incidences am I
seeing?"

## The Base Complex `Y_Gamma`

Goal: read the one-vertex fundamental-domain complex derived from a Coxeter
system.

1. Open a Coxeter example and choose the `Y_Gamma` view.
2. Start with the "one relation" reader preset.
3. Move to "around generator" to see all relation faces incident to one
   generator arrow.
4. Use the rank-three preset when a finite triple is available.
5. Use the full two-skeleton overview only after the local pieces are clear.

What to look for:

- There is one base vertex.
- Each generator appears as an oriented arrow from the base vertex.
- Each finite Coxeter pair contributes a rank-two relation face attached along
  an alternating word.
- Hidden construction corners complete the visible `2m`-gon, but they are not
  extra quotient vertices.
- The local link or nerve view is a diagnostic derived from spherical subsets;
  it is not the same object as `Y_Gamma`.

What is exact:

- The one-vertex 1-skeleton and generator labels.
- The attaching word for each finite rank-two relation face.
- The spherical-subset incidence records used by the atlas.

What is a drawing:

- The singular sheet used to show a relation face in 3D.
- The hidden construction corners of a hexagon, octagon, or decagon.
- The placement of generator arrows around the base vertex.

Do not call `Y_Gamma` a torsion-free quotient manifold. It is the base
orbicomplex or fundamental-domain style complex associated to the Coxeter
system being inspected.

## Quotient And Game Demo

Goal: follow a small quotient experiment from group data to cocycle and local
topology diagnostics.

1. Open the Research Workflow panel.
2. Choose the `I2(5)` identity-subgroup demo.
3. Confirm that the quotient has ten visible cosets and one rank-two decagon
   cell.
4. Select the named cocycle with `s0 = +1` and `s1 = -1`.
5. Inspect the boundary-sum diagnostic for the decagon.
6. Switch between ascending, descending, level, and full local-link lenses.
7. Save an experiment notebook run if you want a reproducible inspection
   record.

What to look for:

- Generator actions should be involutions on quotient vertices.
- The finite relation should close around the quotient cell.
- The decagon boundary sum should be zero for the named cocycle.
- Ascending and descending edges are view filters for the selected integer
  assignment.

What is exact when supplied by the artifact:

- Quotient vertices and generator actions.
- Edge inverse pairing.
- Rank-two cell boundary references.
- Schreier-style relation checks recorded in the certificate block.

What still needs care:

- A quotient complex is not automatically a manifold.
- Passing the in-repo visible stabilizer guard is useful evidence, not a
  published torsion-free proof.
- A game or PL Morse label assignment needs boundary checks before it should be
  called a cocycle on the displayed cell structure.

Use "quotient complex" until a torsion-free certificate is present and its
scope is clear.
