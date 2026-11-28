# Fibering Certification After A Cover: Track A, Track B And The Low-Barycentric Route

**Status (as of 2026-10-04).** Track A and Track B are implemented and can
promote a certificate. The low-barycentric (IMM) route has an exact scorer and
an orientation search, but it emits no replayable certificate yet and is not
wired into the certification CLIs.

This note is the map of what the repository can do once a finite torsion-free
action of a Coxeter group `W` is in hand, that is, a torsion-free finite-index
subgroup `H` given by a complete coset action. How to get such a cover is in
[torsion-free-cover-discovery.md](torsion-free-cover-discovery.md) and
compact-action-import.md. Background on
compressions and walls is in [math.md](math.md); definitions are in
[glossary.md](glossary.md).

All three routes start from the same subgroup and apply PL Morse theory to
different complexes. None of them is a theorem prover. A run is promoted only
when its finite artifact contains the data and witnesses listed below. The
worked numbers in this note come from the compact 5-cube.

## The Three Routes At A Glance

|               | Track A                                                                                                             | Track B                                                                                                     | Low-barycentric (IMM)                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Complex       | lawful subcomplex `Y` (or `Y^up`) of the compression, for one wall orientation                                      | full Davis quotient `K = H\Sigma` with a global pulling triangulation                                       | low-barycentric subdivision of the chamber tessellation, for one wall orientation |
| Character     | wall cocycle                                                                                                        | wall cocycle, or any primitive class in a certified `H^1(H;Z)`                                              | wall cocycle                                                                      |
| Local test    | ascending/descending links nonempty and connected                                                                   | ascending/descending links nonempty and connected                                                           | first gate (nonempty, connected) and second gate (collapsible) at every vertex    |
| Certifies     | virtual algebraic fibration, via the finite-height-band / `pi_1`-surjection argument and the kernel transfer to `H` | virtual algebraic fibration, directly on `K` (direct fixed-character branch and scalable full-`H^1` branch) | nothing yet: an exact score, not a certificate                                    |
| Canonical doc | [virtual-algebraic-fibering.md](virtual-algebraic-fibering.md)                                                      | [full-davis-fibering-certification.md](full-davis-fibering-certification.md)                                | low-barycentric-morse.md                                                          |
| Entry points  | `pnpm cover:fiber:user-action`; the Covers + Walls export, checked by `node scripts/validate_virtual_fibering.mjs`  | `pnpm cover:fiber:user-action`, `pnpm cover:fiber:scalable-h1`                                              | `pnpm lowbary:score`, `pnpm lowbary:search`                                       |
| Status        | implemented; promotes                                                                                               | implemented; promotes                                                                                       | scorer and search implemented; no certificate                                     |

`pnpm bench:pipeline` runs the packed-manifest stages that come before any of
these routes at scale: load the action, certify torsion-freeness, build the
streamed oracle and prepare `H^1`. Packed actions use
`generator-permutation-files` manifests
(compact-action-import.md).

### What a passing certificate means

A **virtual algebraic fibration** is an epimorphism `phi: H -> Z` from a
finite-index subgroup `H <= W` whose kernel is finitely generated. Track A and
Track B certify exactly this, through the Bestvina--Brady first gate: every
ascending and descending link nonempty and connected.

For the compact hyperbolic Coxeter groups of dimension at least three targeted
here (whose first `L^2`-Betti number vanishes), a finite-index algebraic
fibration with finitely generated kernel is already known to exist abstractly
(Kielak; Fisher; Haglund--Wise; see
[references.md](references.md#abstract-virtual-fibering-results)). A passing
certificate makes one explicit; it is not a new existence result. A finitely
presented or type-`F` kernel for a closed hyperbolic manifold group of
dimension at least five would be new, and neither track certifies one.

Neither track certifies a topological or smooth bundle. The criterion this
project uses to conclude that a manifold fibers over `S^1` is IMM Theorem 8: a
compact smooth manifold of
dimension at most five with a compatible affine structure, and every directed
link **collapsible** (the second gate). The low-barycentric route computes that
second gate, but the manifold hypotheses are argued in the docs and not
machine-checked, and the route has no certificate yet. So no current artifact
certifies a fibration over the circle. A cone link is only a sufficient
condition for collapsibility.

The rest of this note gives the setup shared by all routes, the Track A and
Track B promotion policy, a short section on the low-barycentric route, and how
the routes relate.

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

A two-sided quotient wall has two possible coorientations (Jankiewicz--Wise
call a coorientation an orientation of the wall; the two words mean the same
thing here). Choosing one for each wall directs every geometric generator edge dual to it. Give an oriented
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

Fix the wall orientation. A rank-two polygon is **lawful** when its boundary
has exactly one source and one sink, that is, two positively directed paths
with the same endpoints; for unit edge values this means the cyclic sign word
has exactly two sign changes. Lawfulness is stronger than the zero boundary
sum: `+ - + - + -` sums to zero but is not lawful, while `+ + + - - -` is. The
full definition and the record kept for each retained cell are in
[virtual-algebraic-fibering.md, section 7](virtual-algebraic-fibering.md#7-build-the-lawful-subcomplex).

For this fixed orientation, `Y` retains every vertex and every geometric
generator edge of `K`, and exactly the lawful rank-two cells. There is no
further choice of cells after the wall signs are fixed. Searching for a large
lawful subcomplex means searching over wall orientations, not discarding
arbitrary lawful cells from a completed answer.

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
lawful polygonal faces without making the wall height affine on that original,
nonsimplicial cell. A compatible triangulation does, however, give a PL
extension: integrate the cocycle on the vertices, break any new height ties,
and extend uniquely over every simplex. The higher-dimensional ascending and
descending links may differ from the graph links in the rank-two complex. A
theorem-facing certificate for `Y^up` therefore requires scope-matched
evidence for:

- a finite compatible triangulation and a nonconstant PL-affine Morse height
  on every retained simplex;
- the complete ascending and descending links in that retained subdivision;
  and
- the finite-height-band `pi_1`-surjection argument described below.

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

Asphericity remains a separate, optional stronger diagnostic. Each retained
Coxeter cell uses the inherited Davis--Moussong piecewise Euclidean metric. At every
quotient vertex, the implementation checks the metric-flag condition exactly:
whenever the incident lawful rank-two faces form the edge set of a spherical
subset, the corresponding retained higher cell must fill that simplex. If all
links pass, the complex is locally CAT(0), and its universal cover is CAT(0)
and contractible. A metric-flag obstruction means only that this inherited
metric did not certify asphericity; it is not a proof of non-asphericity and
does not block the finite-generation conclusion.

The ordinary `rank-two-lawful` model remains the default first track because
its affine polygon models and directed graph links can be checked directly
and cheaply. Its regular-polygon metric links are useful optional evidence,
not a promotion gate. The generalized model is implemented, but it is never
promoted merely because its cell set is downward closed.

On every retained polygon, the circle-valued wall map has a lift with one
minimum and one maximum. Lawfulness permits a compatible affine extension
over that polygon; assembling these extensions gives the Morse map used in
the Jankiewicz--Wise argument. A regular Euclidean polygon metric may be used
separately to certify nonpositive curvature. The certificate must record both
structures and must not assume that regularity alone makes the wall map
affine.

### Why the finite-height band and `pi_1(Y)` are enough

Two facts carry Track A. They are proved in
[virtual-algebraic-fibering.md, section 8](virtual-algebraic-fibering.md#8-certify-the-finite-height-band-argument).

1. **Finite-height band.** Let `Y_psi -> Y` be the infinite cyclic cover for
   `ker(psi)`, where `psi = chi o q` and `q: pi_1(Y) -> pi_1(K) = H` is onto
   because `Y` contains the whole connected 1-skeleton. If every ascending and
   descending link is nonempty and connected, Bestvina--Brady Corollary 2.6(3)
   makes `pi_1` of a compact height band surject onto `pi_1(Y_psi) =
ker(psi)`, so `ker(psi)` is finitely generated. This takes place in the
   cyclic cover itself and needs no asphericity hypothesis on `Y`.
2. **Kernel transfer.** `q` restricts to a surjection
   `ker(psi) -> ker(chi) = ker(phi)`, so `ker(phi)` is finitely generated. This
   is the kernel-quotient step of Jankiewicz--Wise, Section 3.3. It is why the
   Morse function need not be defined on every cell of `K`.

Jankiewicz--Wise package their two-dimensional application with an aspherical
affine complex. Those nonpositive-curvature hypotheses matter for their other
conclusions but are stronger than this `F_1` transfer needs. For Track A, a
CAT(0) or asphericity certificate is optional geometric evidence; the
theorem-facing record is the replayable `LawfulFiniteHeightBandCertificate`,
whose method is `bestvina-brady-finite-height-band-pi1-surjection`.

This distinction matters in the compact 5-cube. Its lawful subcomplex can
fail the inherited Davis--Moussong metric-flag test because spherical cells
were removed. That failure says nothing about the bounded-band argument once
the actual PL height and all actual directed links pass.

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
Davis--Moussong metric. Those obstructions disable that optional CAT(0)
certificate but are not a Track A failure. Generalized Track A fails here
because its actual ascending and descending links are disconnected. That
failure is still scoped to this cover and PL construction; it is not a
general obstruction to a different cover or Morse construction.

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
7. The selected `Y` is finite and has a compatible affine or subdivided
   PL-affine structure.
8. The lifted map is Morse on every retained cell or simplex, with discrete
   vertex heights. The generalized model requires this check on its higher
   cells, not only on their polygonal faces.
9. The complete ascending and descending links in the selected `Y` are
   nonempty and connected at every quotient vertex. Connectivity must carry
   replayable witnesses, not only Boolean fields.
10. The `finiteHeightBand` record rechecks the finite quotient, PL height, and
    directed-link prerequisites, then records the Bestvina--Brady
    bounded-band `pi_1`-surjection consequence. It does not materialize the
    infinite cyclic cover or the band.
11. The maps `pi_1(Y) -> H -> Z` commute, so the exported kernel-surjection
    argument can be checked directly.

If these gates pass, Bestvina--Brady Morse theory makes `ker(psi)` finitely
generated, and the kernel-surjection argument makes `ker(phi)` finitely
generated. This is already an explicit virtual algebraic fibration of `W`.

### What Track A does not prove

A passing lawful certificate does not produce a Morse function on all of
`K`. It does not compute the full five-dimensional ascending and descending
links, and it says nothing by itself about collapsibility of those links. It
does not prove that `ker(phi)` is finitely presented, nor that a manifold
fibers locally trivially over the circle. The collapsibility (second-gate)
question is what the low-barycentric route below computes.

Failure also has to be read carefully. If no tested coorientation has enough
lawful cells, the search may simply be incomplete. Failure of an optional NPC
test is not a fibering obstruction. If the directed links are disconnected,
another coorientation or PL construction may work. None of these is a general
obstruction to virtual fibering.

## Track B: The Full Davis Quotient

Track B applies Morse theory directly to

```text
K = H\Sigma.
```

Here `Sigma` is the contractible universal cover and the torsion-free action
identifies `pi_1(K)` with `H`. This supplies stronger ambient geometry than
the finite-generation argument needs and removes the kernel-quotient transfer
through `Y`. The price is that all Coxeter cells, not merely the rank-two
polygons, must be handled compatibly.

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
the full Coxeter-cell complex. The construction is specified in
[full-davis-fibering-certification.md](full-davis-fibering-certification.md),
sections 7--9.

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
presented. Because `Sigma` is contractible and `H` acts freely and
cocompactly, Bestvina--Brady Theorem 4.1 would give a finitely presented
kernel from simply connected links and a kernel of type `F` from contractible
links; the current certificate promotes neither. Stronger finiteness or
manifold-fibration conclusions require their own hypotheses and must be
stated separately.

## The Low-Barycentric Route (IMM)

The third route keeps the wall orientation but changes the complex and the
local test. It subdivides the chamber tessellation low-barycentrically, giving
the barycentre of a face `F` of codimension `k` the height
`h(F^) = min_C h + k*eps`, and tests every vertex of the subdivision. The link
of a barycentre is the join `FL(F) * CL(F)` of the IMM face link and coface
link. The C44 writeup's "face/coface join" is the same join, written in the
dual cellulation. Each vertex is tested against both gates: the first gate
(both directed links nonempty and connected) and the second gate (both
collapsible). The model and the exact objective are in
low-barycentric-morse.md. A 3-dimensional positive
benchmark, a closed hyperbolic 3-manifold that fibers this way, is
the C(4,4;2,2;3,3) writeup.
Its original artifacts are not in this repository, but the example and its
336-sheet cover are bundled, and `tests/c44-golden-example.test.ts` reproduces
an orientation with score `(0, 0)` and a nonzero class (see
the golden example).

This route can accept orientations that Track A rejects. An unlawful polygon
is not by itself an obstruction, because the transverse directions in the
join can repair its directed link.

What exists:

- an exact scorer, `src/fibering/lowBarycentricMorse.ts`, which counts
  first-gate failures, second-gate failures and undecided vertices for one
  orientation (`pnpm lowbary:score`), and the period gcd of its wall cocycle;
- an iterated steepest-descent search over orientations, with checkpoints
  (`src/fibering/lowBarycentricSearch.ts`, `pnpm lowbary:search`).

What does not exist yet:

- a replayable certificate (collapse sequences per link class) and an
  independent verifier;
- a certificate that the orientation's class is nonzero and primitive in
  `H^1`: the CLIs report the period gcd, which tests nonzero and gives the
  normalisation, but there is no Schreier/Bezout witness as in Track A;
- a generic step from a cover with one-sided walls to a further cover where
  they are two-sided;
- a machine check of IMM's manifold hypotheses.

So a `(0, 0)` score is evidence for a fibration over the circle, not a
certificate. A first-gate pass everywhere, together with a nonzero primitive
class, would be the same Bestvina--Brady finite-generation input that Track A
and Track B certify, but this route does not yet export it in a promotable
form. The H5-P7-22 calculation, where no orientation of the two-sided cover
`Γ+` passes the first gate, is summarized in
low-barycentric-morse.md.

## How The Routes Work Together

The intended order for Track A and Track B is:

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

Track B is the fallback when the lawful complex's directed links fail, when
its PL Morse model cannot be certified, or when a full-dimensional model is
wanted for its own sake. Failure of an optional lawful-complex CAT(0) or NPC
diagnostic is not a reason by itself to invoke Track B. Higher cells can add
simplices to directed links, so failure of a lawful link does not force
failure of the full-Davis link. Conversely, a successful lawful calculation
says nothing automatic about the full links.

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
another integral cocycle. One-sided walls also block the low-barycentric
route. Track B runs that take an intrinsic character instead of a wall
character, such as the scalable full-`H^1` branch, can still proceed on such a
cover.

The low-barycentric route sits beside this diagram rather than inside it. Use
it when the question is collapsibility (the second gate), or when lawfulness
is too strict a filter. Its results are scores until it gains a certificate.

Every exported result should therefore name its scope explicitly:

- **lawful-subcomplex certified** means all Track A gates passed;
- **full-Davis certified** means all Track B gates passed;
- **both tracks certified** means the same primitive character passed both;
- **candidate only** means an explicit character or favorable link data was
  found but at least one promotion gate remains unproved. Every
  low-barycentric result is currently in this class.

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
  definitions and Corollary 2.6(3) supply the bounded-height-band
  `pi_1`-surjection used here to deduce finite generation without an
  asphericity hypothesis. Theorem 4.1 gives stronger group-action
  applications under additional hypotheses.

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
  the optional generalized lawful CAT(0)/asphericity diagnostic.

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

- Giovanni Italiano, Bruno Martelli, and Matteo Migliorini,
  _Hyperbolic 5-manifolds that fiber over `S^1`_, _Inventiones Mathematicae_
  231 (2023), 1--38. Theorem 8 is the collapsible-link fibering criterion
  behind the second gate, and the low-barycentric route follows their face
  link / coface link convention. Full details are in
  [references.md](references.md).

The policy itself is a synthesis. Jankiewicz--Wise supply the
lawful-subcomplex and kernel-quotient argument; Bestvina--Brady supplies the
Morse finiteness criterion; Davis supplies the full contractible Coxeter-cell
complex; IMM supply the collapsible-link criterion that the low-barycentric
route is aiming at. The project-specific responsibility is to turn every
hypothesis in those arguments into finite, independently replayable evidence.
