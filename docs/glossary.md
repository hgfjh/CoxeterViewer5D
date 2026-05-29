# Glossary

This glossary favors the meanings used inside CoxeterViewer5D. Some terms have
broader meanings in the literature.

## Barycenter

The point used to represent a chamber in geometric mode. In hyperbolic examples
this is usually a point on the hyperboloid, then projected to 3D for display.

## Cayley Ball

The finite-radius subgraph of the Cayley graph around the identity. A radius
`R` ball contains elements of word length at most `R`.

## Cayley Graph

The graph whose vertices are group elements and whose edges are right
multiplication by generators:

```text
w --i--> w * s_i
```

Edges may be drawn undirected because Coxeter generators are involutions, but
the generator label remains part of the data.

## Coxeter Matrix

The symmetric matrix `M = (m_ij)` defining the relations
`(s_i s_j)^m_ij = 1`. The diagonal entries are `1`; off-diagonal entries are
integers at least `2` or `"inf"`.

## Davis Cell

A cell in the Davis complex coming from a spherical special subgroup. The first
implemented cells are rank-two polygons with `2m` sides.

## Davis Complex

The cell complex built from the Cayley graph by attaching cells for spherical
special subgroups. The Cayley graph is its 1-skeleton.

## Drawing Convention

A visual placement chosen for readability, such as shell layout, force layout,
PCA projection, ghost context, or a proxy hull. A drawing convention can show
incidence clearly without preserving metric geometry.

## Exact Backend

An external generator, such as Sage or GAP/KBMAG, that emits a generated graph
artifact with exact or symbolic group-element handling within its stated scope.
The viewer still validates the artifact before rendering it.

## Generator

One element of the Coxeter generating set `S`. The app labels them by stable
ids such as `s0`, `s1`, and uses generator colors for edges and cells.

## Geometric Projection

A 3D view produced from hyperbolic reflection data. The underlying chamber
points may live in dimension greater than three, so the displayed scene is a
projection.

## Gram Matrix

A matrix of inner products. Coxeter Gram entries for finite pairs use
`-cos(pi / m)`. Hyperbolic normal Gram data may also include dotted or numeric
entries.

## Hyperboloid Model

The model of hyperbolic space

```text
H^d = { x : -x0^2 + x1^2 + ... + xd^2 = -1, x0 > 0 }.
```

Facet normals are spacelike, and reflections are computed with the Lorentzian
inner product.

## Klein Projection

The map from the hyperboloid to a ball model

```text
spatial(x) / x0
```

It draws hyperbolic geodesics as straight chords, but it does not preserve
lengths or angles.

## Local Link

At a chamber vertex in the Davis complex, the simplicial complex whose vertices
are generators and whose simplices are spherical subsets. In quotients, the
local link may depend on the selected quotient vertex.

## Normal Coordinates

Explicit coordinates for reflection hyperplane normals in the chosen
Lorentzian vector space. These are preferred over numerical factorization from
a normal Gram matrix.

## PCA Projection

A deterministic linear projection fitted to a point cloud to choose three
drawing axes. PCA coordinates are not ball-model coordinates, so the reference
ball is hidden in PCA views.

## Poincare Projection

The map from the hyperboloid to the Poincare ball

```text
spatial(x) / (x0 + 1)
```

The full-dimensional map is conformal, but a later 3D axis choice or PCA step
can still distort what the viewer shows.

## Quotient Complex

A finite complex obtained from quotient or coset data. It can carry generator
actions, edges, cells, and certificates. It should not be called a manifold
without torsion-free verification.

## Rank-Two Davis Cell

For a finite Coxeter pair `(i, j)` with `m_ij = m`, the polygon with `2m`
boundary edges attached for one coset of `<s_i, s_j>`.

## Rank-Three Cell

A higher Davis cell associated to a spherical subset of three generators. The
viewer may show a bounded 3D incidence proxy unless exact cell coordinates are
provided.

## Reduced Word

A shortest expression for a group element in the Coxeter generators. The app
stores one preferred reduced word for inspection; it need not be unique.

## Spherical Subset

A subset of generators whose special subgroup is finite. The app detects this
from finite Coxeter entries and positive definiteness of the finite Coxeter
Gram matrix.

## Torsion-Free Certificate

Evidence that a quotient has no finite-order stabilizers in the relevant
scope. The in-repo visible stabilizer guard is bounded; manifold language
requires an external or published certificate with a clear scope.

## Warning

A first-class part of the data and UI. Warnings record approximations,
truncation, missing geometry, placeholder status, and other caveats that affect
how the scene should be read.

## `Y_Gamma`

The one-vertex base complex derived from a Coxeter system: one base vertex,
oriented generator arrows, and relation faces for finite Coxeter pairs. It is
not the Cayley graph and not automatically a manifold quotient.
