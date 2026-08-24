# Two-Track Fibering Certification For The Compact 5-Cube

This note describes two ways to certify a virtual algebraic fibration once a
torsion-free finite-index subgroup of the compact 5-cube Coxeter group has
been found. The two tracks use the same subgroup and apply PL Morse theory to
different complexes. Track A is built from a wall coorientation. Track B can
use that wall character or an independently certified integral character in
the full lattice `H^1(H;Z)`.

The first track follows Jankiewicz--Wise as closely as the compact 5-cube
allows: retain the full 1-skeleton and only those rank-two cells on which the
wall map is lawful. It is usually the smaller calculation. The second track
works on the complete Davis quotient and supplies a compatible subdivision
and a generic PL height there. It is more expensive, but it avoids having to
prove that a separately chosen 2-dimensional subcomplex is aspherical.

Neither track is a theorem prover. A run is promoted only when its finite
artifact contains the data and witnesses listed below.

## Common Setup

Let `(W,S)` be the Coxeter system of the compact hyperbolic 5-cube. Suppose a
certified transitive finite action of `W` has point stabilizer `H`, where `H`
is torsion-free and has finite index. Write `Sigma` for the Davis complex and

```text
K = H\Sigma.
```

The complex `Sigma` is contractible. Since `H` acts freely and with finite
quotient, `K` is a finite aspherical Coxeter-cell complex with

```text
pi_1(K) = H.
```

Its cells are the quotient cells `HwW_T`, where `T subset S` is spherical.
The rank-two cells are the familiar `2m_ij`-gons. The higher cells record the
higher-rank spherical special subgroups; they are indispensable in dimension
five.

The compression `bar X` of the torsion-free presentation-complex cover has
the same vertices, geometric generator edges, and rank-two polygons as the
2-skeleton of `K`. The implementation must verify this incidence
identification. It must not infer it from equal cell counts or from the 3D
drawing. Once verified, we may regard

```text
bar X = K^(2)
```

for the purposes of walls, coorientations, and rank-two attaching maps.

### The all-ranks generalized compression

The rank-two compression has a canonical extension through every spherical
rank. Write `Omega = H\W`. For each spherical subset `T` and each
`q in Omega`, introduce a rooted record `(q,T)`. The restricted right action
of `W_T` identifies

```text
(q,T) ~ (q u,T),  u in W_T.
```

Because `H` is torsion-free, this action is free. Every fiber therefore has
exactly `|W_T|` rootings and its image is the Coxeter cell

```text
q W_T = H w W_T.
```

The resulting generalized compression is not a third ambient complex: in the
Coxeter-cell structure it is canonically the complete Davis quotient

```text
bar X_gen = H\Sigma = K,
(bar X_gen)^(2) = bar X.
```

For `U subset T`, the `U`-faces of the image of `(q,T)` are the distinct cells
`q v W_U`, with `v` ranging over `W_T/W_U`. A generalized-compression
certificate must bind the complete spherical catalogue and action, record or
hash every rooted fiber, check these face maps in every rank, and verify that
its rank-zero, rank-one, and rank-two restriction agrees with the existing
signed `hat X -> bar X` compression. Counts of the form
`[W:H]/|W_T|` are consequences of these checks, not substitutes for them.

[`src/davis/generalizedCompression.ts`](../src/davis/generalizedCompression.ts)
implements this as a replayable chunk commitment. The compact artifact does
not pretend that millions of rooted records are embedded as JSON objects:
each fixed-size chunk commits the ordered roots, fiber members, or face
records, and replay reconstructs every chunk from the SHA-bound permutation
action. Its rank-at-most-two result distinguishes a definition-level replay
from a stronger bridge to a supplied materialized `hat X -> bar X` artifact.

A two-sided quotient wall has two possible coorientations. Choosing one for
each wall directs every geometric generator edge dual to it. Give an oriented
edge `e` the value `c(e) = +1` when it follows that direction and `c(e) = -1`
when it runs against it. Opposite sides of a Coxeter polygon receive
compatible directions, so a candidate coorientation should satisfy

```text
sum of c(e) around the boundary of every rank-two cell = 0.
```

These equations say that `c` is an integral cellular 1-cocycle. They produce
a homomorphism

```text
chi: H = pi_1(K) -> Z.
```

The app computes `chi` on a Reidemeister--Schreier generating set for `H`,
checks every rewritten relator, and lets `d` be the gcd of those integer
values. If `d > 0`, then

```text
phi = chi / d: H -> Z
```

is primitive and hence onto. This normalization changes neither the kernel
nor any edge orientation. The common algebraic target of both tracks is the
exact sequence

```text
1 -> ker(phi) -> H -> Z -> 1.
```

What remains is to certify that `ker(phi)` is finitely generated.

## Track A: The Lawful Subcomplex First

### The lawful polygon criterion

Fix the wall coorientation. Read the directed edges around the attaching
cycle of a rank-two polygon `C`. The polygon is **lawful** when its attaching
map can be written

```text
boundary(C) = alpha beta^(-1),
```

where `alpha` and `beta` are positively directed edge paths with the same
initial and terminal vertices. Thus the boundary has one source, one sink,
and two directed routes from the source to the sink. When the polygon is
embedded and every boundary value is `+1` or `-1`, this is equivalent to the
cyclic boundary-sign sequence having exactly two sign changes.

Lawfulness is stronger than the cocycle equation. A hexagon with signs

```text
+ - + - + -
```

has total sum zero, but it has three local maxima and three local minima. It
is not lawful. By contrast,

```text
+ + + - - -
```

has one source and one sink and is lawful.

For this fixed coorientation, define `Y` by retaining:

- every vertex of `K`;
- every geometric generator edge of `K`;
- exactly the lawful rank-two cells.

There is no further choice of cells after the wall signs are fixed. Searching
for a large lawful subcomplex means searching over wall coorientations, not
discarding arbitrary lawful cells from a completed answer.

### The generalized coface-closed lawful complex

There is also a canonical higher-dimensional version of this construction.
Let `U` be the set of unlawful rank-two cells in the complete Davis quotient
`K`. Define

```text
Y^up = { cells C of K : dim(C) <= 1, or every 2-face of C is lawful }.
```

Equivalently, delete every cell in `U` and every cell having an element of `U`
as a face. In poset language, one deletes the union of the coface upsets of
the unlawful 2-cells. This is a subcomplex: if every 2-face of `C` is lawful,
then every 2-face of a face of `C` is also a 2-face of `C`. It is the unique
largest subcomplex of `K` that contains the full 1-skeleton and contains no
unlawful 2-cell.

The implementation calls this the `coface-closed-full` lawful complex. Its
streamed certificate keys a cell by its spherical type and orbit
representative, records the retained and discarded counts in every dimension,
hashes the retained set, and checks the rule above and downward closure. It
streams immediate faces and local stars instead of materializing the complete
strict face poset. Changing this option does not change the wall signs, the
cocycle, or the rank-two lawfulness test.

Closure is not a Morse theorem. A retained higher Coxeter cell may have only
lawful polygonal faces without admitting the required compatible affine
extension of the chosen wall map. Its higher-dimensional ascending and
descending links may also differ from the graph links in the rank-two
complex. Finally, deleting cofaces from a contractible complex does not by
itself leave an aspherical complex. A theorem-facing certificate for `Y^up`
therefore also requires scope-matched evidence for:

- asphericity (or a contractible universal cover) of this actual retained
  subcomplex;
- a compatible nonconstant affine Morse extension over every retained higher
  cell; and
- the complete ascending and descending links in the retained subdivision.

These are executable checks, not external evidence fields. The subdivision is
the global pulling subdivision defined by increasing quotient-vertex order.
It is vertex preserving, so the certificate declares
`introducedVertexIds: []` and checks links at every vertex of the subdivision.
On each retained cell, the integral wall cocycle is integrated to a chart
`h_0`; the PL height is

```text
h(q) = h_0(q) + q/(4N),
```

where `N` is the number of quotient vertices. Shared charts are required to
differ by an integer constant. The perturbation is less than `1/4`, so it
breaks integral ties without reversing an edge whose cocycle value is `+1` or
`-1`. The link calculation uses the actual retained higher cells and their
pulled simplices. Compact mode constructs the exact link one-skeleton during
calculation and replay, but archives only its vertex counts, component
partition, and source-rooted digest. Those archived data are complete for
testing nonemptiness and connectivity; they do not contain every link edge.

Asphericity has a separate, one-sided certificate. Each retained Coxeter cell
uses the inherited Davis--Moussong piecewise Euclidean metric. At every
quotient vertex, the implementation checks the metric-flag condition exactly:
whenever the incident lawful rank-two faces form the edge set of a spherical
subset, the corresponding retained higher cell must fill that simplex. If all
links pass, the complex is locally CAT(0), and its universal cover is CAT(0)
and contractible. A metric-flag obstruction means only that this inherited
metric did not certify asphericity; it is not a proof of non-asphericity.

The ordinary `rank-two-lawful` model remains the default first track because
its regular-polygon metric links and directed graph links can be checked
directly and cheaply. The generalized model is implemented, but it is never
promoted merely because its cell set is downward closed.

On every retained polygon, the circle-valued wall map has a lift with one
minimum and one maximum. Lawfulness permits a compatible affine extension
over that polygon; assembling these extensions gives the Morse map used in
the Jankiewicz--Wise argument. A regular Euclidean polygon metric may be used
separately to certify nonpositive curvature. The certificate must record both
structures and must not assume that regularity alone makes the wall map
affine.

### Why `pi_1(Y)` is enough

The inclusion `Y -> K` contains the entire connected 1-skeleton. Consequently
it induces a surjection

```text
q: pi_1(Y) -> pi_1(K) = H.
```

One way to see this is to construct `K` from its 1-skeleton. Adding the
rank-two cells omitted from `Y` imposes additional relations on `pi_1(Y)`;
adding cells of dimension at least three does not change the fundamental
group. Thus every element of `H` is represented by an edge loop already
present in `Y`.

The unnormalized wall character on `Y` is the pullback of the character on
`K`:

```text
psi = chi o q: pi_1(Y) -> Z.
```

The map `q` restricts to a surjection of kernels,

```text
q: ker(psi) -> ker(chi) = ker(phi).
```

Indeed, if `h` lies in `ker(phi)=ker(chi)`, choose `y in pi_1(Y)` with
`q(y)=h`. Then `psi(y)=chi(h)=0`, so `y` lies in `ker(psi)`. It follows that
`ker(phi)` is a quotient of `ker(psi)`. Therefore

```text
ker(psi) finitely generated  =>  ker(phi) finitely generated.
```

This is the kernel-quotient step used by Jankiewicz--Wise. It is why the
Morse function need not be defined on every cell of `K` in order to prove an
algebraic fibration of `H`.

### The compact-5-cube asphericity problem

The lawful route is not automatic in the compact-5-cube setting. The version
of the Jankiewicz--Wise argument used for their two-dimensional Coxeter
complexes assumes an aspherical affine complex. They obtain the relevant
nonpositive-curvature setting when every three-generator special subgroup is
infinite; in their notation the condition is

```text
1/m_ij + 1/m_jk + 1/m_ki <= 1
```

for every triple.

The compact 5-cube has finite spherical subsets of rank three and higher. In
the full Davis complex, a higher Coxeter cell fills the spherical residue
created by such a subset. Its boundary can already appear as a sphere in the
2-skeleton. Jankiewicz--Wise point out the rank-three instance explicitly:
when a three-generator special subgroup is finite, the compressed
2-complex contains a copy of `S^2`.

This observation has two consequences.

First, the asphericity of `K` does not imply the asphericity of `Y`. The
higher Davis cells that make `Sigma` contractible are absent from `Y`.
Second, the presence of spherical triples does not prove that every lawful
`Y` is nonaspherical. Deleting unlawful polygons may break the offending
spherical subcomplexes. Asphericity must therefore be checked for the actual
`Y` produced by the chosen wall signs.

The preferred finite certificate is a nonpositively curved piecewise
Euclidean metric on `Y`: record the metric polygons and verify the metric link
condition at every quotient vertex. A complete local CAT(0) certificate
implies that the universal cover of `Y` is CAT(0), hence contractible. A
different proof of asphericity may be supplied, but an unchecked assertion or
a picture of the links is not enough.

### Current index-34,560 generalized calculation

The exact index-17,280 action has a canonical character double cover of degree
34,560 in which all ten quotient walls are two-sided. Exhausting all 1,024
wall-sign masks leaves 16 masks after the native full-Davis link prefilter (8
up to simultaneous sign reversal). For every survivor, the coface-closed
lawful complex has f-vector

```text
(34560, 172800, 300024, 214056, 56052, 3132).
```

The global pulling subdivision introduces no vertices. Exact links in the
actual retained complex give a disconnected ascending and a disconnected
descending link for every one of the 16 candidates by quotient vertex 163.
For example, canonical mask `0x19d` has an ascending link at `q36` with two
components of sizes 77 and 7. This is the corrected generalized Track A
failure; it is not the earlier rank-two-only calculation.

All 16 candidates also have exact metric-flag obstructions in the inherited
Davis--Moussong metric. Consequently neither the Morse-link gate nor this
particular CAT(0) route certifies generalized Track A for the double cover.
The latter failure still does not prove that these finite complexes are
non-aspherical, and neither failure is a general obstruction to a different
cover or Morse construction.

### Lawful-track promotion gates

Track A may report **virtual algebraic fibration certified** only when all of
the following have passed:

1. The finite action is complete, transitive, hash-bound to the Coxeter
   system, and its stabilizer `H` is independently certified torsion-free.
2. The compression is certified to have the rank-two incidence of `K^(2)`.
3. Every quotient wall is recorded and two-sided; each edge receives exactly
   one coorientation value.
4. Every rank-two boundary sum is zero, and the same cocycle vanishes on every
   rewritten Reidemeister--Schreier relator.
5. The computed character is nonzero; its gcd and Bezout witness certify a
   primitive epimorphism `phi:H->Z`.
6. The selected lawful model is reconstructed exactly. For the rank-two model,
   it contains the complete 1-skeleton and exactly the lawful polygons. For
   the generalized model, it additionally contains exactly the higher cells
   whose every 2-face is lawful and passes a downward-closure check.
7. The selected `Y` is finite and affine, and its universal cover is certified
   contractible, for example by a complete nonpositive-curvature link check.
8. The lifted map is Morse on every retained cell, with discrete vertex
   heights. The generalized model requires this check on its higher cells,
   not only on their polygonal faces.
9. The complete ascending and descending links in the selected `Y` are
   nonempty and connected at every quotient vertex. Connectivity must carry
   replayable witnesses, not only Boolean fields.
10. The maps `pi_1(Y) -> H -> Z` commute, so the exported kernel-surjection
    argument can be checked directly.

If these gates pass, Bestvina--Brady Morse theory makes `ker(psi)` finitely
generated, and the kernel-surjection argument makes `ker(phi)` finitely
generated. This is already an explicit virtual algebraic fibration of `W`.

### What Track A does not prove

A passing lawful certificate does not produce a Morse function on all of
`K`. It does not compute the full five-dimensional ascending and descending
links, and it says nothing by itself about collapsibility of those links. It
does not prove that `ker(phi)` is finitely presented, nor that a manifold
fibers locally trivially over the circle.

Failure also has to be read carefully. If no tested coorientation has enough
lawful cells, the search may simply be incomplete. If the selected `Y` fails
an NPC test, it might still be aspherical for another reason. If its directed
links are disconnected, another coorientation may work. None of these is a
general obstruction to virtual fibering.

## Track B: The Full Davis Quotient

Track B applies Morse theory directly to

```text
K = H\Sigma.
```

Here the global asphericity problem has already been solved: `Sigma` is the
contractible universal cover and the torsion-free action identifies
`pi_1(K)` with `H`. The price is that all Coxeter cells, not merely the
rank-two polygons, must be handled compatibly.

The wall cocycle gives an exact character on the 1-skeleton, but arbitrary
vertex heights need not be the restriction of one affine function on a
nonsimplicial Coxeter cell. Integrated heights can also tie at vertices that
become adjacent in a subdivision. The full track therefore performs the
following construction:

1. Enumerate every quotient cell `HwW_T` for every spherical subset `T`. A
   streamed implementation may certify the rooted fibers and all face maps
   without materializing the full strict face poset.
2. Give the quotient vertices one fixed global order.
3. Apply the induced pulling triangulation to every Coxeter cell. Restricting
   the same order to a shared face makes the two subdivisions agree.
4. Integrate the wall cocycle on the universal cover and certify its period
   gcd and Bezout normalization. The streamed profile keeps the raw integral
   heights: the raw character is the gcd multiple of the primitive character,
   so the two characters have the same kernel.
5. Add distinct, quotient-periodic rational offsets small enough that no
   generator edge reverses direction. These offsets break equal heights while
   preserving `h(gv)=h(v)+phi(g)`.
6. Extend the resulting vertex values affinely over every simplex.
7. Compute ascending and descending links in this actual subdivided complex,
   including every higher-dimensional simplex.

The vertex order, pulling subdivision, and rational offsets are canonical
implementation choices, not additional hypotheses of the fibering theorem.
Their role is to produce a finite, exact, reproducible affine Morse model on
the full Coxeter-cell complex.

### Full-Davis promotion gates

For a wall character, Track B inherits common gates 1--5 from Track A. For an
intrinsic character outside the wall lattice, gates 3--5 are replaced by a
complete `H^1(H;Z)` lattice certificate, a source-bound closed integral
cocycle section, and a primitive nonzero lattice vector. It then requires:

1. An exhaustive spherical-subset catalogue and complete quotient cell poset,
   with all incidences and orbit counts independently checked.
2. A global vertex order and pulling triangulation whose restrictions agree
   on every shared face.
3. Exact integrated heights and rational offsets satisfying equivariance,
   nonreversal of every generator edge, and distinct heights on every
   simplex.
4. A nonconstant affine extension on every positive-dimensional simplex and
   a closed discrete set of lifted vertex heights.
5. Complete ascending and descending links at every quotient vertex orbit,
   both nonempty and connected, with replayable connectivity witnesses.
6. A final artifact binding the finite action, cell poset, walls, character,
   subdivision, heights, links, and source data by canonical hashes.

When these gates pass, Bestvina--Brady Morse theory applies directly to the
equivariant height on `Sigma` and proves that `ker(phi)` is finitely generated.
No intermediate quotient of kernels is needed.

### Streamed full-`K` production profile

[`src/fibering/streamedTrackB.ts`](../src/fibering/streamedTrackB.ts) is the
all-cells adapter used for the degree-34,560 compact-5-cube calculation. It
strictly replays the torsion-free action and the all-ranks generalized
compression, retains all 884,304 quotient Coxeter cells, and applies the one
global order `q0 < ... < q34559`. Recursive pulling introduces no new
vertices. The height used for a sign vector `c` is

```text
F_c(q) = raw_c(q) + polarity * sign_c(anchor) * q / (4 * degree),
polarity in {+1,-1}.
```

The offset is small enough to preserve every generator-edge sign, and its
dependence on the anchor sign gives `F_(-c) = -F_c`. The exact search can
therefore use the 512 anchor-positive sign vectors while testing both offset
polarities. This covers all 1,024 height classes modulo the stated reversal,
not merely the sixteen candidates that survived the earlier lawful-complex
prefilter.

For the recorded degree-34,560 action, all 1,024 classes have a disconnected
ascending or descending link by quotient point `q7`. The first-failure census
at `q0,...,q7` is

```text
[924, 62, 14, 12, 4, 4, 3, 1].
```

The batch and its action-rooted replay both pass, but there is no promoted
survivor. Thus the result is **not found for this global pulling and
candidate-odd height family**. It is not a proof that the subgroup has no
finitely generated-kernel character, that another subdivision cannot work,
or that the compact 5-cube has no virtual algebraic fibration. The exact run
command and artifact hashes are recorded in
[`scripts/README.md`](../scripts/README.md) and
[`scripts/certificates/README.md`](../scripts/certificates/README.md).

### Intrinsic-character extension and exact sign-cone cover

The 1,024-class run above is exhaustive only for unit wall weights. It is not
an exhaustive search of `H^1(H;Z)`. The rigorous extension separates three
finite certificates which must not be conflated:

1. an integral character-lattice certificate;
2. an exact stream of pulling-link height-difference forms in a declared
   lattice basis; and
3. an exact cover of real character space by realizable ternary sign cones,
   coupled to replayable directed-link obstructions or passing witnesses.

For the first certificate, choose the canonical generator-order BFS spanning
tree of the quotient Cayley graph. A cocycle is put in **tree gauge** by
making it zero on every tree edge; its cotree-edge values then record its
periods. This gives one deterministic cocycle section of the map from closed
integral cochains to `H^1(H;Z)`. The tree gauge is an implementation choice,
not a canonical structure on the abstract group. Replacing it by a
cohomologous section changes vertex heights by a quotient-periodic function
and can change directed links, even though it does not change the underlying
character.

The exact lattice calculation first constructs four integral tree-gauge
cocycles `beta0,...,beta3` which saturate the lattice generated by the ten wall
period vectors. In these declared coordinates the image of arbitrary integral
wall weights is

```text
Z beta0 + Z beta1 + Z beta2 + 2 Z beta3.
```

Equivalently, its Smith invariant factors are `(1,1,1,2)`: the wall-generated
lattice has index two in this rank-four saturation and misses the parity coset
whose `beta3` coordinate is odd. The earlier `+/-1` wall search is a much
smaller subset even of the even-parity coset. Thus allowing arbitrary wall
weights would still not test every character represented by the saturated
basis.

The four-coordinate object is only the **saturated wall-period lattice**, not
the full character lattice. The completed calculation finds 15 additional
integral tree-gauge cocycles `gamma0,...,gamma14`. Their restriction to the
declared 15 core columns is the identity, and every one replays to zero on all
266,513 residual boundary rows. Deterministic exact LinBox elimination gives
core rank 87,935 at both primes 30,011 and 32,749; after normalization on the
same identity chart, both modular nullspace bases agree entry-for-entry with
the integral gamma frame. Combined with the 50,287 unit pivots and the four
beta seed coordinates, this certifies

```text
H^1(H;Z) = Z^19,
H^1(H;Z)/L_wall = Z^15 + Z/2.
```

Thus the wall lattice has rank four and index two in its rank-four saturation,
but infinite index in full `H^1`. The exact rank calculation is reproducible
from the tracked LinBox driver and transcripts; the compact certificate binds
that external deterministic elimination rather than embedding a separate
proof-carrying pivot ledger.

Once the lattice gate passes, every pulling-link germ `e` has an exact sparse
linear form

```text
a_e in Z^r,
raw height difference = <a_e,w>,  w in Z^r.
```

The equations `<a_e,w>=0` form a central rational hyperplane arrangement in
real character space. The implementation uses an exact ternary cone cover:
each new primitive normal is assigned sign `-`, `0`, or `+`, and infeasible
branches carry exact Farkas certificates. The zero branches are essential;
they are precisely the lower-dimensional faces that a chamber-only search
would miss. Every nonzero feasible rational cone contains an integral vector,
which is divided by the gcd of its coordinates to obtain a primitive integral
representative. The zero cone is recorded separately and is never promoted as
a character to `Z`.

For the fixed global pulling order, the two perturbations are

```text
F_(w,sigma)(q) = raw_w(q) + sigma*q/(4N),  sigma in {-1,+1},
```

where `N` is the quotient degree. On a germ from `q` to `q'`, its cleared exact
difference is

```text
4N<a_e,w> + sigma*(q'-q).
```

Thus a zero arrangement sign does not leave a tied simplex: `sigma*(q'-q)`
chooses its direction. Total height reversal identifies only
`(w,sigma)` with `(-w,-sigma)`. Fixing the sign of an anchor coordinate is not
valid on faces where that coordinate vanishes.

[`src/fibering/streamedH1Lattice.ts`](../src/fibering/streamedH1Lattice.ts)
records the BFS tree, cotree periods, wall saturation, flattened boundary
matrix, and unit-peel ledger.
[`src/fibering/streamedH1Completion.ts`](../src/fibering/streamedH1Completion.ts)
maps the exact residual frame back to quotient edges, replays the full
rank-19 cocycle basis, and records the wall quotient.
[`src/fibering/streamedH1ModularTranscript.ts`](../src/fibering/streamedH1ModularTranscript.ts)
normalizes and compares the two exact modular nullspace transcripts.
[`src/fibering/streamedTrackB.ts`](../src/fibering/streamedTrackB.ts) checks the
concrete cocycle section on edge reversal and every rank-two boundary, then
streams the exact germ forms and full link adjacency.
[`src/fibering/streamedHeightArrangement.ts`](../src/fibering/streamedHeightArrangement.ts)
constructs and replays the ternary cone cover and its feasibility
certificates.

That in-process Fourier--Motzkin engine is deliberately limited to ranks at
most four. Since the certified integral character lattice has rank 19, the
generic oracle-backed tree in
[`src/fibering/scalableHeightCone.ts`](../src/fibering/scalableHeightCone.ts)
uses externally discovered primal/Farkas certificates with independent exact
replay and splits only normals requested before a source-bound link
obstruction. It does not enumerate the complete arrangement in advance. See
[`scalable-height-cone-certificates.md`](scalable-height-cone-certificates.md)
for the protocol and its limits.

A production artifact may conclude that no character works for this model
only after all of the following have replayed:

1. the saturated basis is certified to be the complete `H^1(H;Z)` lattice;
2. every quotient point contributes all of its pulling-germ forms;
3. both offset polarities are covered, modulo only simultaneous antipodal
   reversal;
4. every nonzero feasible sign cone is either pruned by a source-bound exact
   empty/disconnected directed-link witness or represented by a primitive
   integral character whose links are all checked; and
5. the zero character and every infeasible branch are accounted for
   separately.

Even such an exhaustive result is scoped to the canonical BFS-tree section,
the global increasing-point pulling order, and the stated two perturbations.
It would not exclude another cocycle section, subdivision, finite cover, or PL
Morse construction.

Track B proves more geometric structure than Track A: it provides an explicit
PL representative of `phi` on the complete Davis quotient and the full
ascending and descending links for that representative. Optional verified
collapse sequences can show that these links are collapsible, a condition
stronger than connectedness. Collapsibility is not required for finite
generation of the kernel.

Track B still proves an algebraic fibration, not automatically a topological
bundle. Connected directed links do not imply that the kernel is finitely
presented. Stronger finiteness or manifold-fibration conclusions require
their own hypotheses and must be stated separately.

## How The Two Tracks Work Together

The intended order is:

```text
certify H and the wall character
              |
              v
       try lawful Y first
          /          \
       passes       blocked or fails
         |                 |
         v                 v
  certify fibering    run full Davis track
         |                 |
         +------ optional -+
             stronger full-K evidence
```

Track A is cheaper because it works with the 1-skeleton and selected polygons;
its directed links are graphs. It should be tried first. A pass is a complete
finite-generation proof for `ker(phi)`, not a provisional result.

Track B is the fallback when the lawful complex lacks a certified asphericity
or NPC argument, when its directed links fail, or when a full-dimensional PL
model is wanted for its own sake. Higher cells can add simplices to directed
links, so failure of a lawful link does not force failure of the full-Davis
link. Conversely, a successful lawful calculation says nothing automatic
about the full links.

More precisely, for the same global pulling order and vertex height,

```text
Lk^+_(Y^up)(v) subset Lk^+_K(v),
Lk^-_(Y^up)(v) subset Lk^-_K(v).
```

Deleting an unlawful polygon and all of its cofaces can disconnect the
left-hand link even when the restored simplices connect the right-hand link.
The converse implication is the useful obstruction: a disconnected full-`K`
link cannot be repaired by passing to this lawful subcomplex with the same
subdivision and height. Track B is therefore an independent calculation, not
a theorem that automatically succeeds when generalized Track A (the
`coface-closed-full` retained complex) fails.

Failures in the common algebraic layer are different. If a wall is one-sided,
a rank-two boundary sum is nonzero, or the resulting character is zero, the
same wall assignment cannot be repaired merely by changing certification
tracks. The app must find another wall coorientation, another finite cover, or
another integral cocycle.

Every exported result should therefore name its scope explicitly:

- **lawful-subcomplex certified** means all Track A gates passed;
- **full-Davis certified** means all Track B gates passed;
- **both tracks certified** means the same primitive character passed both;
- **candidate only** means an explicit character or favorable link data was
  found but at least one promotion gate remains unproved.

## Primary References

- Kasia Jankiewicz and Daniel T. Wise,
  [_Incoherent Coxeter Groups_](https://arxiv.org/pdf/1503.03102), 2015.
  Sections 2.1--2.5 define the compression, walls, wall orientations, affine
  Morse setup, and lawful subcomplex. Section 3.3 applies Morse theory to the
  lawful subcomplex and then passes finite generation to the kernel in the
  compressed complex by the quotient argument. Section 2.1 also explains why
  a finite three-generator special subgroup creates spherical behavior in the
  compressed 2-complex.

- Mladen Bestvina and Noel Brady,
  [_Morse theory and finiteness properties of groups_](https://doi.org/10.1007/s002220050168),
  _Inventiones Mathematicae_ 129 (1997), 445--470. The affine Morse
  definitions and Theorem 4.1 supply the ascending/descending-link criterion
  used to deduce finite generation.

- Michael W. Davis,
  [_The Geometry and Topology of Coxeter Groups_](https://www.degruyter.com/document/doi/10.1515/9781400845941/html),
  Princeton University Press, 2008. This is the standard reference for the
  Davis complex, spherical special subgroups, Coxeter cells, and the
  contractibility of `Sigma` used by the full-Davis track.

- Michael W. Davis, Tadeusz Januszkiewicz, and Richard Scott,
  [_Fundamental groups of blow-ups_](https://people.math.osu.edu/davis.12/old_papers/djs2.pdf),
  _Advances in Mathematics_ 177 (2003), 115--179. Section 5.8 gives the
  canonical metric on Coxeter cell complexes, link-edge lengths
  `pi - pi/m_ij`, and the metric-flag nonpositive-curvature criterion used by
  the generalized lawful asphericity certificate.

- Mladen Bestvina,
  [_PL Morse theory_](https://www.math.utah.edu/~bestvina/eprints/minicourse.pdf),
  _Mathematical Communications_ 13 (2008), 149--162. These notes give a
  concise account of piecewise-affine height functions and directed links.

- Martin R. Bridson and Andre Haefliger,
  [_Metric Spaces of Non-Positive Curvature_](https://link.springer.com/book/10.1007/978-3-662-12494-9),
  Springer, 1999. This is the standard reference for piecewise Euclidean
  local curvature conditions and the passage from a complete locally CAT(0)
  complex to a CAT(0), hence contractible, universal cover.

- Jesus A. De Loera, Joerg Rambau, and Francisco Santos,
  [_Triangulations: Structures for Algorithms and Applications_](https://link.springer.com/book/10.1007/978-3-642-12971-1),
  Springer, 2010. This supports the compatible pulling-triangulation machinery
  used to make the full-Davis construction deterministic.

The two-track policy itself is a synthesis. Jankiewicz--Wise supply the
lawful-subcomplex and kernel-quotient argument; Bestvina--Brady supplies the
Morse finiteness criterion; Davis supplies the full contractible Coxeter-cell
complex. The project-specific responsibility is to turn every hypothesis in
those arguments into finite, independently replayable evidence.
