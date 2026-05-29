# Mathematical Conventions

This viewer is meant to make finite neighborhoods of Coxeter groups visible. It is not a theorem prover. The code and UI should distinguish algebraic data, drawing conventions, and geometric reflection data at every point where those meanings can diverge.

## Coxeter Systems

A Coxeter system is written `(W, S)`, where `S = {s0, ..., s_{n-1}}` is a finite set of involutory generators and `W` has presentation

```text
W = < S | (s_i s_j)^{m_ij} = 1 >
```

with the usual conventions:

- `m_ii = 1`.
- `m_ij = m_ji`.
- `m_ij = 2` means `s_i` and `s_j` commute. Coxeter diagrams usually omit this edge.
- Finite `m_ij >= 3` records a braid relation of length `m_ij`.
- `m_ij = Infinity` records that `s_i s_j` has infinite order in the Coxeter presentation.

The Coxeter matrix is combinatorial data. It does not, by itself, give distances between hyperplanes in a chosen hyperbolic realization. If geometric data is supplied, dotted or numeric Gram entries belong to that geometric layer.

## Cayley Graph Convention

The Cayley graph uses right multiplication:

```text
w --i--> w * s_i
```

Since each Coxeter generator is an involution, the rendered edge can be undirected. The edge record should still preserve the generator index, because generator labels control colors, filters, rank-two cells, and inspector output.

The radius-`R` ball contains nodes whose word length is at most `R`, measured from the identity with respect to `S`. A displayed word is a preferred reduced word, not necessarily the only reduced expression for the element.

Compact vertex labels in the scene are this preferred word rendered in generator labels, with long words shortened for display. Edge labels are generator labels. These labels are inspection aids; the graph records remain the source of truth.

## Drawing Conventions

The combinatorial shell layout is a stable drawing convention:

- The identity lies at the origin.
- Nodes of word length `k` lie on a shell with radius proportional to `k`.
- Angular placement may be deterministic hash order, sorted Fibonacci-sphere placement, or another stable rule.

Force-directed layout, if enabled, is also a drawing convention. It may clarify local adjacency, but it is not Coxeter geometry and should not be labeled as such.

## Rank-Two Davis Cells

The Davis complex adds cells for spherical special subgroups. In the first implementation milestone, the viewer focuses on rank-two cells.

For a finite pair `m_ij < Infinity`, the special subgroup `<s_i, s_j>` is dihedral of order `2*m_ij`. Each coset of this subgroup contributes one polygon with `2*m_ij` sides. With the right-multiplication Cayley convention, the boundary is traced by alternating right multiplication by `s_i` and `s_j`.

The viewer should emit one polygon per coset, not one duplicate polygon from every boundary vertex. A canonical key can use the sorted generator pair and the minimum node id found along the completed boundary cycle.

If the radius cutoff clips a boundary, the viewer may draw a partial outline, but it should not fill the polygon. Filled cells should mean that the whole boundary is present in the generated ball.

A relation-focus view chooses one finite pair `(i, j)` and displays one cyclic
representative of the relation walk

```text
w, w*s_i, w*s_i*s_j, w*s_i*s_j*s_i, ...
```

until `2*m_ij` boundary vertices have been reached. The same cell can be read
from any boundary vertex and in either direction, so boundary labels are
inspection labels rather than a new algebraic normal form. For `m_ij = 3`, the
filled cell is a hexagon recording `(s_i s_j)^3 = 1`; for `m_ij = 2`, it is the
commuting square.

The pair matrix in the UI is just the Coxeter matrix restricted to rank-two
subsets, decorated with view state such as enabled, hidden, clipped, or
ghosted. A ghosted boundary edge or shell node is context from the same finite
ball. It is not an extra Davis cell and it should not be counted as visible
cell data.

## Spherical Subsets And Local Links

Higher-dimensional Davis cells come from higher-rank spherical subsets `T subset S`. For a finite Coxeter matrix on `T`, the viewer forms the Coxeter Gram matrix with diagonal entries `1` and off-diagonal entries `-cos(pi / m_ij)`. The subset is treated as spherical when all entries in `T` are finite and this finite Gram matrix is positive definite.

Singletons are always spherical. A rank-two subset is spherical exactly when its Coxeter entry is finite, so the existing rank-two Davis polygons are the two-dimensional part of the same test. Infinite entries are rejected before the positive-definiteness check because they do not define a finite Coxeter angle.

The local link at a chamber vertex has one vertex for each generator. Its simplices are the nonempty spherical subsets. For now this link is the same at every chamber of the full Davis complex, but the API records the selected `nodeId` so quotient links can later depend on the chosen representative.

Any rendered higher-cell hull should be labeled as a visual proxy unless an exact embedding of that cell has been implemented.

The current higher-rank display follows this rule: it can list spherical subsets
and draw bounded visual proxies for some higher-rank cells, but those proxies
are not mathematical embeddings of the Coxeter cells. They are inspection aids
for seeing where a spherical subset acts near the displayed graph.

## Hyperboloid Model

When valid hyperbolic reflection data is available, the preferred convention is the hyperboloid model in `R^{d,1}`:

```text
<x, y>_J = -x0*y0 + x1*y1 + ... + xd*yd
H^d = { x : <x, x>_J = -1, x0 > 0 }
```

Facet normals `n_i` are spacelike:

```text
<n_i, n_i>_J = 1
```

The reflection in the hyperplane `<x, n_i>_J = 0` is

```text
R_i(x) = x - 2 * <x, n_i>_J * n_i
```

The base chamber convention should be explicit. The app uses the inequality `<x_base, n_i>_J <= 0` for every facet normal. Validation checks this inequality, normal norms, reflection involutions, and preservation of the Lorentz form. If the supplied normals satisfy the same chamber inequalities after a global orientation flip, the app may reorient all normals together and warn about it.

Geometric inputs may supply either explicit `normalCoordinates` or a `normalGram`.
Explicit coordinates are preferred. When only `normalGram` is supplied, the app
performs a numerical Lorentzian factorization to recover spacelike normal
coordinates with the requested signature. This is useful for visualization, but
it is not an exact certificate of a published Coxeter polytope. The app records
factorization residual and signature warnings when the numerical data does not
meet tolerance or when unused spatial directions must be padded.

If `geometry.basepoint` is absent, the app attempts to solve numerically for a
future-directed timelike point satisfying `<x_base, x_base>_J = -1` and the
chamber inequalities. A solved basepoint is also visualization data, not a
classification proof. Inputs that need theorem-level geometric claims should
ship explicit coordinates or cite an independently verified computation.

The matrix-composition convention for a word must match the right-multiplication convention used by the Cayley graph. Tests should verify that traversing an edge labeled `i` applies the same reflection `R_i` used by geometric placement.

The bundled `hyperbolic_toy_rank2.json` example supplies explicit normals and a basepoint so geometric mode can be exercised end to end. It is a self-contained toy fixture and is not compact 5-prism or 5-cube data. The bundled compact 5-cube example carries a machine-checkable certificate for the Gamma_1 source transcription, the two algebraic dotted weights, and the exact normal Gram rank/signature. It still relies on numerical `normalGram` factorization and basepoint solving for visualization.

## Projection To 3D

Hyperbolic chamber barycenters may live in dimension greater than three. The viewer can still draw a 3D scene, but that scene is a projection.

Two common ball projections are:

```text
klein(x) = spatial(x) / x0
poincare(x) = spatial(x) / (x0 + 1)
```

The Klein model makes geodesics appear as straight chords, but it does not preserve hyperbolic lengths or angles. The Poincare model is conformal in the full dimension, but after selecting three axes or applying PCA, the displayed 3D scene is no longer the full model.

The reference sphere in the viewer is meaningful only for axis-based Klein or Poincare coordinates: in those modes the chamber barycenter coordinates should lie inside the ball. PCA coordinates are centered drawing coordinates, not ball coordinates, so the viewer hides the reference sphere for PCA projections. Axis-based ball views are drawn at an enlarged 12x display scale; this changes only the drawing size, not the underlying Klein or Poincare model coordinates.

For `d > 3`, the viewer may choose three coordinates or apply deterministic PCA. These choices are useful for inspection, but they can create apparent crossings, separations, or cell intersections that are artifacts of projection. For compact high-dimensional examples, the geometric preset fits the PCA basis to the selected chamber's local graph-neighborhood and centers that chamber at the origin. This makes the local topology easier to read, but it is still a projection convention. The UI should say that geometric mode shows hyperbolic chamber barycenters projected to 3D, not an exact 3D embedding of the Davis complex.

## Approximation Policy

Floating-point checks are acceptable for visualization:

- Reflection matrices can be checked with tolerances.
- Hyperboloid points can be checked with tolerances.
- Matrix keys may be rounded for approximate deduplication.
- `normalGram` factorization and chamber-basepoint solving may be numerical.

Every such approximation must be named as an approximation in warnings and exported metadata. The viewer should not present approximate enumeration as a proof of group order, classification, compactness, or manifold status.

Provenance language should be conservative. A source citation can verify a
Coxeter graph, a dotted-edge formula, or a theorem quoted from that source, but
it does not automatically certify every numerical coordinate or projected view
derived inside the app. Schema version 1 validates `dataStatus`, `sourceRefs`,
and certificate summaries, but the meaning stays narrow: `verified-source`
means the cited source supports the stated diagram or value, while `certified`
requires a passed machine-checkable certificate. The compact 5-cube certificate
checks exact Gram inertia `(5 positive, 1 negative, 4 zero)`, not a rendered
3D projection or numerically solved chamber point.

## Quotients And Game Data

Finite quotient complexes are separate from the base Davis viewer. A quotient can carry vertices, generator-labeled edges, rank-two cells, and subgroup metadata, but it should not be called a manifold unless torsion-free verification is supplied.

The base complex `Y_Gamma` is a fundamental-domain cell complex for the Coxeter
data being inspected. It has a base vertex, one oriented arrow for each
Coxeter generator/facet direction, and one rank-two `2m`-gon for each finite
Coxeter pair. Higher spherical subsets are recorded as higher-cell
incidence/proxy data when the viewer can enumerate them. `Y_Gamma` is not a
torsion-free quotient manifold.

The app represents `Y_Gamma` primarily as a 3D 2-skeleton scene in the main
viewer and as a cell atlas in the side panel: a base vertex, generator arrows,
rank-two relation cells, higher spherical cells, and attaching-word data. The
nerve/local link is a separate diagnostic derived from the spherical subsets;
it is not `Y_Gamma` itself. The 3D relation faces are drawn as singular sheets
glued to the visible generator arrows, because the quotient attaches the
alternating `2m` boundary word to the same one-vertex 1-skeleton. The viewer
draws hidden construction corners to complete the visible hexagon, octagon, or
decagon outline, but it displays only the true quotient 0/1-skeleton vertices.
A faithful affine coordinate realization would require additional polytope
coordinates or face-lattice data that is separate from the Coxeter presentation.
Rank-three spherical cells are drawn from the finite rank-three Coxeter cell
boundary and glued to the base vertex and three generator endpoints. Thus a
right-angled rank-three relation is cube-like, with six square rank-two faces.
Other finite rank-three types use their finite Coxeter-cell rank-two boundary
faces in the all-faces overview. The viewer orders each displayed square or
hexagon by its cyclic drawing boundary so the face is simply embedded; edge
labels still record the corresponding relation generators. These fills explain
incidence and local topology; they are not certified affine 3-polytopes unless
such coordinates are imported separately.

The in-repo quotient certificate is a Schreier-action check. It verifies that
each generator acts as a bijective involution on quotient vertices, that the
directed generator edges agree with the action, that finite Coxeter relations
hold on the quotient action, and that visible rank-two orbits have exactly one
matching quotient two-cell. This is a certificate of the imported finite action,
not a derivation of the subgroup from a presentation.

The bounded torsion-free guard checks visible stabilizers of spherical special
subgroups in the quotient action. A nonidentity finite-special-subgroup element
fixing a quotient vertex is a torsion witness. Passing this in-repo guard is
useful evidence, but manifold language is reserved for external Sage/GAP or
published torsion-free certificates.

PL Morse/game experiments can assign named integer cocycles to oriented edges
or generators. Boundary sums around rank-two cells are the first consistency
check; a nonzero sum means the assignment is not a cocycle on the displayed
cell structure. Experiment logs record the assignment, input hash, diagnostics,
and certificate summary for reproducibility.

Local-link topology is computed as finite simplicial homology over `F2` in the
first version. The summary reports rank counts, reduced `H0`, and `H1`; it is a
small-link diagnostic, not a general high-dimensional homology engine.

Quotient imports are rendered as quotient complexes first. The app validates
vertex references, generator indices, inverse-edge pairing, rank-two cell
boundaries, and torsion-free metadata. It may display ascending, descending, and
level incident edges for integer labels, but that is game/PL-Morse preparation;
it is not a claim that the quotient is a manifold or that a Morse function has
been certified.
