# Mathematical Conventions

This chapter fixes the mathematical meaning of the five viewer models. The
central construction follows Jankiewicz and Wise, _Incoherent Coxeter Groups_.
The browser computes finite cellular data; it does not infer the hypotheses of
their theorems from a picture.

## Coxeter Systems

A Coxeter system has generators

```text
S = {s_0, ..., s_(r-1)}
```

and a symmetric matrix `M = (m_ij)` with `m_ii = 1`. For `i != j`:

- `m_ij = 2` means `s_i` and `s_j` commute;
- finite `m_ij >= 3` gives `(s_i s_j)^(m_ij) = 1`;
- `m_ij = inf` means there is no finite rank-two relation.

The defining graph `Gamma` has one vertex per generator. In this app a full
finite-relation view may draw `m = 2` edges, even though standard Coxeter
diagrams omit them. Infinite pairs are not edges.

## Davis Complex

The Davis complex has the Cayley graph as its 1-skeleton. The app uses right
multiplication:

```text
w --s_i--> w s_i.
```

A finite rank-two special subgroup `<s_i,s_j>` contributes a `2m_ij`-gon for
each coset. More generally, spherical subsets index higher Davis cells. A
finite-radius viewer can omit or clip cells whose full boundary lies outside
the generated ball; such a cell must not be filled as though it were complete.

The Davis view and the cover-compression views answer different questions.
The Davis view is organized by group elements and spherical cosets. The
`\hat X` and `\bar X` views below are finite cellular complexes built from a
finite action.

## The Standard Complex X

Write the Coxeter presentation as

```text
<s_0, ..., s_(r-1) |
  s_i^2,
  (s_i s_j)^(m_ij) for finite m_ij>.
```

`X` is the standard presentation 2-complex. It has one vertex, one oriented
generator loop for each `s_i`, a bigon for `s_i^2`, and a `2m_ij`-gon for each
finite relation `(s_i s_j)^(m_ij)`.

`X` is the source of the finite-cover construction. It is not a Davis chamber,
and it is not one of the main 3D model-switch views.

## Finding A Torsion-Free Subgroup

The faithful Tits reflection representation shows that a finitely generated
Coxeter group is linear in characteristic zero. Selberg's lemma therefore
guarantees a finite-index torsion-free subgroup, but it does not construct one
or bound the smallest useful index.

The computational criterion comes from the torsion structure of Coxeter
groups. Every finite-order element is conjugate into a finite spherical special
subgroup. It is enough to consider prime-order elements. If `W` acts
transitively on a finite set `Omega` and `H` is a point stabilizer, then `H` is
torsion-free exactly when every prime-order torsion conjugacy class acts without
a fixed point on `Omega`.

The automatic GAP backend enumerates a complete, possibly redundant, list
of prime-order representatives from the maximal spherical special subgroups.
GAP then searches for a bounded-index subgroup containing no conjugate of any
representative. Every returned action is checked again by the fixed-point test.
See [Automatic torsion-free cover discovery](torsion-free-cover-discovery.md).

A failed bounded search is not a contradiction to Selberg's lemma. Exhausting
indices through `N` rules out only that bounded range; stopping on a resource
limit is inconclusive.

### Golden example: the ideal 3-cube and its `S4` cover

The bundled regular ideal hyperbolic 3-cube has six facet generators

```text
t12, t13, t14, t23, t24, t34.
```

Two generators have exponent `3` exactly when the corresponding
transpositions share a letter. Disjoint transpositions form the three opposite
facet pairs and have exponent `inf`. Thus the finite-relation graph is the
octahedron `L(K4)`.

With Lorentz form `J = diag(-1,1,1,1)`, put `a = 1/sqrt(2)` and
`b = sqrt(3/2)`. The six outward normals are `(a, +/-b, 0, 0)`,
`(a, 0, +/-b, 0)`, and `(a, 0, 0, +/-b)`. Their Gram matrix has signature
`(3,1,2)`: adjacent facets have inner product `-1/2`, while opposite facets
have inner product `-2`. In Klein coordinates the chamber is
`|x_i| <= 1/sqrt(3)`. Its eight corners lie on the unit sphere, so the cube has
eight ideal vertices. Equivalently, every vertex link is the Euclidean
`(3,3,3)` triangle. This is a finite-volume noncompact cube, not a compact one.

The assignment `tij -> (ij)` defines a surjection `W -> S4`. Its kernel has
index 24. The only nontrivial spherical special subgroups are the six `A1`
groups and the twelve `I2(3)` groups. Their images in `S4` have orders `2` and
`6`, respectively, so the kernel meets each trivially. The finite-torsion
criterion therefore proves that the kernel is torsion-free. The app ships the
regular 24-point action and independently repeats these spherical-restriction
checks before constructing `hat X`; it makes no claim that index 24 is minimal.

## The Finite Cover hat X

Let `G'` be a finite-index torsion-free subgroup of index `d`. The corresponding
cover is

```text
hat X -> X.
```

Its vertices are the `d` sheets or cosets. Every generator loop of `X` lifts to
`d` directed generator edges. Every open 2-cell also has `d` lifts. Thus a
rank-`r` cover has `d r` lifted generator bigons, and each finite pair has `d`
lifted relation polygons, all with their signed attaching maps.

The two bigons based at `x` and `x s_i` are distinct open 2-cells even though
they use the same two directed edges in opposite cyclic order. This is the
same elementary phenomenon by which the universal cover of the presentation
complex `<s | s^2>` has two 2-cells, not one.

The paper uses torsion-freeness to ensure the relevant lifted edges and cells
embed. The viewer can construct the incidence of `\hat X` from a discovered or
supplied finite permutation action. That construction does **not** prove the
action comes from a torsion-free subgroup. A certified cover claim therefore
needs the complete prime-order fixed-point test or equivalent subgroup
evidence.

The implementation stores each use of an edge in a cell boundary as a signed
occurrence. If `t = +1`, the boundary follows the stored edge direction. If
`t = -1`, it traverses that edge backwards. This sign is part of the attaching
map, not a drawing choice.

## The Compression bar X

Jankiewicz--Wise form `\bar X` in two steps:

1. For every generator orbit `{x,xs_i}`, collapse its two lifted `s_i^2`
   bigons and two directed boundary edges to a single geometric edge.
2. For finite `m_ij`, identify the `2m_ij` lifted relation polygons that have
   the same compressed boundary.

The resulting cellular map is

```text
hat X -> bar X.
```

For a degree-`d`, rank-`r` torsion-free cover, the paper records:

```text
vertices of bar X                         d
geometric edges of bar X                 d r / 2
cells of type {i,j} in bar X              d / (2 m_ij)
```

The divisibility in the last line is a consequence of the free finite
dihedral action in the intended cover. The app checks the actual fibers rather
than assuming these counts.

Compression does not mean geometric flattening. It is a cellular quotient with
explicit fibers:

- two directed generator lifts map to one geometric edge;
- two generator-bigon lifts map to that edge;
- `2m_ij` compatible lifted relation cells map to one relation polygon.

### The finite-dihedral orbit calculation

Fix a finite pair `{i,j}` and write `W_ij = <s_i,s_j>`. This is the dihedral
special subgroup of order `2m_ij`. Let the degree-`d` cover be represented by
left cosets `H\W`, with `W_ij` acting on the right. For a cover vertex `Hg`,

```text
Hg w = Hg
  iff g w g^{-1} lies in H
  iff w lies in W_ij intersect g^{-1} H g.
```

Hence

```text
Stab_Wij(Hg) = W_ij intersect g^{-1} H g.
```

If `H` is torsion-free, so is `g^{-1}Hg`. Its intersection with the finite
group `W_ij` is therefore trivial. Orbit-stabilizer now gives

```text
|Hg W_ij| = |W_ij| / |Stab_Wij(Hg)| = 2m_ij.
```

The `d` cover vertices consequently split into `d/(2m_ij)` orbits. Since the
uncompressed cover has one lifted `(s_i s_j)^m_ij` cell based at every vertex,
each orbit indexes `2m_ij` lifted cells. Collapsing the generator bigons makes
their attaching cycles equal up to cyclic reparametrization, so compression
identifies that entire orbit to one polygon. Equivalently, compressed
rank-two cells are indexed by the double cosets `H\W/W_ij`.

When these fiber checks fail, the object may still be inspected as imported
data, but it is not labeled a passed Jankiewicz--Wise compression.

## Walls In bar X

Every relation cell of `\bar X` has an even number of sides. In a `2m`-gon,
boundary positions `k` and `k + m` are opposite.

Two geometric edges are **parallel** when they occur in opposite positions of
one relation cell. An **abstract wall** is an equivalence class generated by
this parallelism relation.

The corresponding wall is a graph:

- it has one wall vertex at the midpoint of every dual geometric edge;
- each relation cell contributes an arc joining the midpoints of one opposite
  pair;
- the map of this graph into `\bar X` is the wall immersion.

The colored wall arcs in the viewer are a drawing of this exact midpoint-and-
opposition incidence. Their curvature, height, and separation have no
mathematical significance.

### Wall diagnostics

The paper distinguishes three local/global properties:

- **embedded**: the wall map into `\bar X` is injective;
- **two-sided**: the map extends to an embedded product neighborhood
  `W x (-1,1)`;
- **no self-osculation**: at each vertex of `\bar X`, the wall is adjacent at
  no more than one vertex or edge of the local link.

The app reports witnesses when a finite combinatorial check fails. A passed
browser check is exact for the imported finite incidence, but it is not a
certificate that the input is the intended finite cover.

Only global coorientability is needed to direct the dual edges and construct
the cellular map used by the deterministic PL Morse check. Embeddedness and
absence of self-osculation are valuable diagnostics: in Jankiewicz--Wise they
make the random local orientation events controllable. A self-osculating wall
does not by itself invalidate a particular orientation when the resulting
ascending and descending links have been computed and verified directly.

## Coorienting Walls

The paper calls this an orientation of a wall. In the UI we use
**coorientation** to stress what is oriented: every 1-cell dual to the wall.

A two-sided wall has two possible coorientations. They assign directions to all
dual geometric edges so that opposite edges in each relation polygon have
opposite directions when read around that polygon.

Choose one coorientation for each wall. Mapping every positively directed edge
once around the oriented 1-cell of `S^1` gives a combinatorial map

```text
bar X^1 -> S^1.
```

Opposite sides of every relation polygon contribute with opposite signs, so
the boundary sum is zero and the map extends across every 2-cell. This
extension alone is not yet a Morse function on every cell.

Compression preserves the fundamental group: duplicate cells with the same
attaching map carry redundant relations. Thus a cover belonging to `H` gives
`pi_1(bar X) = H`, and the circle-valued map induces an explicit homomorphism

```text
chi: H -> Z.
```

The algebraic record evaluates `chi` on Reidemeister--Schreier generators,
checks every rewritten relator sum, and computes the positive generator `d` of
its image. If `chi` is nonzero, then `image(chi) = dZ` and
`phi(h) = chi(h)/d` is the primitive epimorphism `H -> Z`. The two maps have
the same kernel. This normalization is global period arithmetic; it does not
divide the original `+1` and `-1` edge arrows.

## Lawful Cells And The Lawful Subcomplex

Fix a coorientation of every two-sided wall. Give each boundary occurrence of
a relation cell a sign:

```text
boundary sign = edge coorientation * boundary traversal sign.
```

A relation cell is **lawful** when its attaching map can be written

```text
alpha beta^(-1)
```

with `alpha` and `beta` positively directed. Equivalently, its cyclic sign
sequence has exactly two sign changes. The boundary then has one source and one
sink, and the circle-valued map lifts to an affine Morse function on that cell.

For a **fixed** coorientation, the lawful subcomplex is canonical: keep the
entire 1-skeleton and every lawful 2-cell. It is maximal by inclusion among
subcomplexes with that full 1-skeleton on which this particular orientation
has the lawful-cell property. There is no additional cell choice to optimize
after the coorientation is fixed.

### Optimization over coorientations

The app also asks a separate finite optimization question:

> Which choice of wall coorientations retains the largest number, or greatest
> specified weight, of lawful relation cells?

This is not a definition or theorem from the paper. It is a search over one
binary choice per two-sided wall.

Different coorientations can produce incomparable sets of lawful cells. Thus
"largest" needs an explicit objective such as retained-cell count or total
weight; it is not a canonical largest subcomplex across all coorientations.

- A completed exhaustive or branch-and-bound run can certify an optimum for
  the supplied finite complex.
- A heuristic or interrupted run reports only the best assignment found.
- Optional link constraints can require every ascending and descending link to
  be nonempty and connected.
- One-sided or otherwise noncoorientable walls are obstructions, not variables
  that may be silently ignored.

Global reversal of every wall coorientation gives the same lawful-cell count
with ascending and descending exchanged. A solver may fix one wall to remove
this symmetry, provided it records that normalization.

## Ascending And Descending Links

The app has two link calculations, and their scopes must not be confused.

### Compression diagnostic

Let `x` be a vertex of a cooriented `\bar X` or of its lawful subcomplex.

- A link vertex is ascending when its geometric edge points away from `x`, and
  descending when the edge points toward `x`.
- A link edge comes from a corner of a retained relation cell. Its ascending or
  descending status is determined by the wall directions through that cell,
  as in the paper's local definition.

The viewer computes these as finite combinatorial subgraphs of `link(x)`. It
can report emptiness, connected components, and homology diagnostics where the
available link is represented simplicially.

Together, a certified finite-index torsion-free `H`, a primitive `phi`, and the
required nonempty connected links are the visible ingredients of a virtual
algebraic fibration. Finite generation of `ker(phi)` still depends on the
affine/aspherical Morse hypotheses; it is not inferred from the scene.

The link tests do not prove primitivity. They see only local up/down directions
and are unchanged when every closed-loop period is multiplied by the same
positive integer. Surjectivity is the separate gcd/Bezout calculation on the
Schreier generator values. See
[Certifying a virtual algebraic fibration](virtual-algebraic-fibering.md) for
the complete dependency chain and the subgroup-presentation definitions.

### Two certification tracks

The app tries the lawful rank-two subcomplex first. It retains the full
1-skeleton and the polygons with one source and one sink, certifies that actual
polygonal complex by exact metric-link arithmetic, checks its directed links,
and verifies the presentation-level surjection onto `H`. Finite generation of
the lawful kernel then descends to the kernel in `H`.

An optional generalized model retains a higher Coxeter cell precisely when
all of its 2-faces are lawful. Equivalently, it removes every unlawful 2-cell
and its full coface upset. This is a valid downward-closed subcomplex, but the
app requires separate higher-cell affine, asphericity, and full-link evidence
before using it in a fibering claim. The executable implementation streams
spherical cell orbits, applies one global quotient-vertex pulling order, and
uses the height `h_0(q) + q/(4N)`, where `h_0` integrates the raw integral wall
cocycle on each retained cell. Pulling introduces no vertices. Ascending and
descending connectivity is computed in the actual pulled retained complex,
not in its rank-two truncation.

There is also a direct, unsubdivided calculation. A retained spherical
`T`-cell contributes its Coxeter-cell vertex-figure simplex to the ascending
link at `q` exactly when every `T`-edge germ at `q` has positive cocycle value;
the descending condition uses negative values. This is the polyhedral Morse
definition itself, so no diagonal edges or tie-breaking heights are added.
Before treating those sign links as Morse links, the direct certificate checks
whether the unit wall cocycle is affine on compatible convex cell charts. The
implemented sufficient model uses positive inverse zone scales on the
simply-laced/right-angled Coxeter root zonotopes. Zone variables are the
opposite-edge components generated by retained polygons, so deleting a polygon
is allowed to split an ambient wall into independently scaled pieces. The
scales deform cell geometry while the edge cocycle remains `+/-1`. Exact
root-transition equations and the generalized-compression face fibers bind the
charts across retained faces. Infeasibility in this model is deliberately
narrower than infeasibility for all possible affine realizations.

For asphericity, the generalized certificate checks the inherited
Davis--Moussong metric. Exact metric-flag links certify local CAT(0), hence a
CAT(0) contractible universal cover. Failure has the deliberately weaker
meaning “not established by this metric”; it is not a decision procedure for
asphericity.

See [Two-track fibering certification](two-track-fibering-certification.md)
for the exact gates and the kernel-surjection argument.

### Full Davis-quotient certificate

For a theorem-facing higher-dimensional run, the Morse complex is the complete
quotient `K = H\Sigma`, not `\bar X`. The app enumerates every cell `HwW_T`
for every spherical subset `T`, fixes one global order on quotient vertices,
and applies the corresponding pulling triangulation to every Coxeter cell.
The same order on a common face makes the subdivisions agree.

The wall cocycle is integrated on lifted cell charts. Its values are divided
by the gcd of the Reidemeister--Schreier generator periods, producing a
primitive `phi:H->Z`. Small quotient-periodic rational offsets then break equal
vertex heights. Each offset inequality is checked exactly so no generator edge
is reversed. Extending these values affinely over each simplex gives the PL
height used for the full directed links.

At every quotient vertex orbit, the ascending and descending links are the
full subcomplexes of the subdivided simplicial link spanned by higher and lower
vertices. Nonemptiness and connectedness of every such link are the local
conditions used for finite generation of `ker(phi)`. Collapsibility is checked
separately by replaying elementary collapses; it is stronger than connectedness
and is not needed for the algebraic-fibration conclusion.

See [Full Davis-quotient fibering certification](full-davis-fibering-certification.md)
for the exact construction and its claim boundary.

## What The Browser Does Not Prove

The Bestvina--Brady criterion used in the paper requires a finite aspherical
affine cell complex, a circle-valued map whose lift is Morse, and nonempty
connected ascending and descending links. Under those hypotheses the kernel of
the induced map to `Z` is finitely generated.

The Jankiewicz--Wise incoherence argument needs more: their cover and wall
hypotheses, dimension/asphericity conditions, and group-theoretic Euler
characteristic input. In their dimension-at-most-two setting, every
three-generator special subgroup must satisfy

```text
1/m_ij + 1/m_jk + 1/m_ki <= 1.
```

If a three-generator special subgroup is finite, `\bar X` contains higher
spherical behavior (in the paper's discussion, a copy of `S^2`) and the
2-dimensional asphericity argument does not apply as stated. When every triple
satisfies the displayed inequality, regular Euclidean metrics on the relation
polygons give the nonpositively curved 2-dimensional setting used there.

Therefore:

- a wall decomposition is not an incoherence proof;
- a lawful-cell optimum is not a fibering proof;
- passing local-link checks do not certify the cover or asphericity;
- compact 5-dimensional examples remain experiments unless all required
  hypotheses are supplied separately.

The older right-angled state/move legal-system construction can be interpreted
as a special way of organizing coorientations in a cubical setting. It is not
the current general workflow and should not be applied unchanged to arbitrary
finite Coxeter exponents.

## Hyperbolic Reflection Data

When geometric data are supplied, the app uses the Lorentz form

```text
<x,y>_J = -x_0 y_0 + x_1 y_1 + ... + x_d y_d
```

and the hyperboloid

```text
H^d = {x : <x,x>_J = -1 and x_0 > 0}.
```

For a spacelike unit normal `n`, reflection is

```text
R_n(x) = x - 2 <x,n>_J n.
```

The app checks normal norms, chamber inequalities, involutions, and Lorentz
residuals when the relevant numerical or interval data are present.

## Projection To Three Dimensions

Klein and Poincare coordinates in `R^d` are

```text
klein(x)    = spatial(x) / x_0
poincare(x) = spatial(x) / (x_0 + 1).
```

If `d > 3`, selected axes or PCA reduce these coordinates to three dimensions.
PCA is deterministic for a fixed ordered input, but it is a readability
projection. It does not preserve all distances, angles, intersections, or the
unit-ball boundary.

Certified interval coordinates and projection bounds support only the claims
listed in their certificate scopes. They do not turn the browser mesh into an
exact embedded model.
