# Certifying A Virtual Algebraic Fibration

> **Lawful-subcomplex profile.** This document describes the
> Jankiewicz--Wise lawful-subcomplex argument in the compressed presentation
> 2-complex. The action-rooted automatic certificate and the optional
> coface-closed higher-dimensional lawful model are described in
> [Two-track fibering certification](two-track-fibering-certification.md).
> For the distinct full-dimensional profile on
> `K = H\Sigma`, including the complete Davis cell poset, compatible pulling
> triangulation, exact perturbed height, full directed links, and optional
> collapsibility certificates, see
> [Full Davis-quotient fibering certification](full-davis-fibering-certification.md).
> The polygon-link checks below must not be used as substitutes for full Davis
> links in dimensions greater than two.

## Implementation Status

The Covers + Walls workflow now exports this certificate directly. It includes
the deterministic Reidemeister--Schreier presentation, raw and primitive
values on every Schreier generator, every rewritten-relator sum, every
compressed-cell sum, Bezout witnesses, lawful-cell records, directed links,
and the complete PL Morse checklist. Connectivity claims include explicit
spanning-tree corner ids, not only a `connected` flag.

Validate an exported JSON artifact from the command line with:

```bash
node scripts/validate_virtual_fibering.mjs path/to/certificate.json
```

`corepack pnpm validate:virtual-fibering` runs a small exact self-test. The
validator recomputes cellular sums, Schreier-relator values, gcd/Bezout
arithmetic, link spanning trees, and conclusion status. It checks the evidence
inside the artifact; it does not independently rediscover the finite subgroup.

This note specifies what the Covers + Walls workflow must export before it may
describe a run as a verified virtual algebraic fibration. The model follows
Jankiewicz and Wise,
[_Incoherent Coxeter Groups_](https://arxiv.org/abs/1503.03102). It separates
finite computation from the hypotheses supplied by PL Morse theory.

The intended conclusion is concrete. For a Coxeter group `W`, find a
finite-index subgroup `H` and an epimorphism

```text
phi: H -> Z
```

whose kernel is finitely generated. The word **virtual** refers to passing
from `W` to `H`. In the Jankiewicz--Wise construction, `H` is also
torsion-free; torsion-freeness is needed for their cover and compression, even
though it is not part of the bare definition of an algebraic fibration.

An orientation seen in the 3D viewer is not this certificate. The certificate
must connect the cooriented walls to a presentation of `H`, prove that `phi`
is primitive, and record every Morse-theoretic hypothesis used to deduce finite
generation.

## Notation

The paper writes `G'` for the finite-index torsion-free subgroup. The app uses
`H`. The relevant complexes are:

- `X`: the standard one-vertex Coxeter presentation 2-complex;
- `hat X`: the cover of `X` corresponding to `H`;
- `bar X`: the compression of `hat X` obtained by collapsing generator
  bigons and identifying relation cells with the same compressed boundary;
- `Y`: the lawful subcomplex of `bar X` for a chosen wall orientation.

The compression checks should establish

```text
pi_1(hat X) = H  and  pi_1(bar X) = H.
```

The second equality is a statement about the recorded cellular quotient, not
about its drawing. Collapsing the prescribed bigons and removing duplicate
2-cell relations does not change the fundamental group. A certificate must
show that the supplied data really has those fibers.

## The Logical Chain

The construction has four mathematical objects and three different maps. It is
useful to keep them visible from the start:

```text
W  >=  H = pi_1(hat X) = pi_1(bar X)
                              ^
                              |  pi_1(Y) -> H is onto
                              |
                         lawful Y

wall coorientation on bar X
        |
        +--> cellular cocycle c
        |         |
        |         +--> psi: pi_1(Y) -> Z
        |         +--> chi: H -> dZ
        |
        +--> ascending and descending links in Y

phi = chi/d: H -> Z,       ker(phi) = ker(chi).
```

The PL Morse theorem is applied to the lift of the map on `Y`, not directly to
an arbitrary drawing of `bar X`. It proves that `ker(psi)` is finitely
generated. Because `Y` and `bar X` have the same connected 1-skeleton, the map
`pi_1(Y) -> H` is onto and restricts to an epimorphism

```text
ker(psi) -> ker(chi) = ker(phi).
```

Thus `ker(phi)` is finitely generated. Normalizing `chi` to `phi` is a separate
global arithmetic step; it changes the named target from `dZ` to `Z`, but it
does not change the kernel or any edge direction.

## Complete Computational Workflow

The app follows this dependency order. A later row is not allowed to pass when
one of its required earlier rows is missing.

| Step | Construction                             | What is checked                                                                                      |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1    | Validate the Coxeter system `W`          | Matrix symmetry, involutions, finite Coxeter relators, source hashes                                 |
| 2    | Discover a finite transitive action      | Every generator is a permutation and every Coxeter relator acts trivially                            |
| 3    | Define `H` as a point stabilizer         | Index, basepoint, coset convention, torsion-free evidence                                            |
| 4    | Build `hat X`                            | One lift of every open presentation cell over every action point; every lifted attaching word closes |
| 5    | Compress to `bar X`                      | Exact edge, bigon, and relation-cell fibers; signed boundaries agree                                 |
| 6    | Find walls                               | Transitive closure of opposite sides in every compressed `2m`-gon                                    |
| 7    | Test two-sidedness and choose wall signs | Orientation-parity constraints have no contradiction; every edge receives one direction              |
| 8    | Form the wall cocycle                    | Every compressed relation-cell boundary has signed sum zero                                          |
| 9    | Find lawful cells                        | Each retained boundary is two directed paths from one source to one sink                             |
| 10   | Build ascending and descending links     | Exact incidence, nonemptiness, components, and connectivity witnesses at every vertex                |
| 11   | Present `H`                              | Deterministic Reidemeister--Schreier generators and rewritten Coxeter relators                       |
| 12   | Evaluate the wall map                    | Integer value on every Schreier generator and zero on every rewritten relator                        |
| 13   | Prove the image and normalize            | Period gcd, Bezout witness, nonzero image, and primitive map `phi: H -> Z`                           |
| 14   | Check the PL Morse hypotheses            | Finite affine/aspherical setting, Morse cells, discrete heights, and all directed-link conditions    |
| 15   | Transfer finite generation to `H`        | Full 1-skeleton and the explicit commuting maps from `pi_1(Y)` to `H`                                |

Steps 2--3 may be supplied by an imported exact artifact or discovered by the
GAP/Sage strategy ladder. Steps 4--15 are deterministic for a fixed action and
wall-sign assignment. The wall-sign optimization in Step 7 is exact only when
its branch-and-bound search completes; otherwise the app says **best found**,
not **largest**.

In implementation terms, the core pipeline is:

```text
action       = discover_or_import_finite_action(W)
cover        = build_hat_X(action)
compression  = compress_hat_X(cover)
walls        = opposite_side_transitive_closure(compression.bar_X)
parities     = solve_two_sidedness_constraints(walls)
signs        = search_or_supply_one_sign_per_wall(parities)
cocycle      = assign_signed_values_to_dual_edges(signs)
lawful_Y     = retain_full_skeleton_and_lawful_cells(cocycle)
links        = build_directed_links_from_exact_incidence(lawful_Y)
presentation = reidemeister_schreier(W, action)
chi          = evaluate_cocycle_on_schreier_loops(presentation)
phi          = normalize_by_period_gcd(chi)
certificate  = check_all_dependencies_and_export()
```

The renderer consumes these records after they are built. It is not used by
any equality, gcd, wall-class, lawfulness, or link-connectivity test.

## The Certificate Has Three Layers

The output keeps three logically different claims apart.

1. **Subgroup layer:** the finite action defines the stated finite-index
   subgroup `H`, and a Reidemeister--Schreier calculation presents `H`.
2. **Cocycle layer:** the wall coorientation defines an integral cellular
   1-cocycle and hence an explicit primitive homomorphism `H -> Z`.
3. **Morse layer:** a lawful affine subcomplex and its ascending and descending
   links satisfy the hypotheses that imply finite generation of the kernel.

A run that passes only the first two layers has an explicit epimorphism, but
not yet a verified algebraic fibration in the finiteness sense.

## 1. Present The Subgroup `H`

Start with the Coxeter presentation

```text
W = <s_0, ..., s_(r-1) |
       s_i^2,
       (s_i s_j)^m_ij for finite m_ij>.
```

### What a Reidemeister--Schreier presentation is

Suppose more generally that

```text
G = <A | R>
```

and `H <= G`. The **Reidemeister--Schreier procedure** converts the given
presentation of `G`, together with coset data for `H`, into a presentation of
`H`. A presentation of `H` means both:

- an explicit generating set whose words represent elements of `H`; and
- an explicit set of relators whose normal closure gives exactly all relations
  among those generators.

The construction is not merely a claim that `H` is finitely generated. It is a
rewriting algorithm. The classical sources are Schreier's 1927 paper
[_Die Untergruppen der freien Gruppen_](https://doi.org/10.1007/BF02952517)
and Reidemeister's 1932 book _Einfuhrung in die kombinatorische Topologie_. A
modern reference is Lyndon and Schupp,
[_Combinatorial Group Theory_](https://link.springer.com/book/10.1007/978-3-642-61896-3).
For a concise covering-space derivation and the exact theorem statement, see
Charles F. Miller III,
[_Combinatorial Group Theory_, Theorem 4.3](https://www.macs.hw.ac.uk/~lc45/Teaching/kggt/miller.pdf).

### Cosets and the transversal used by the app

The app uses **left cosets with a right action**. An action point is

```text
q = H t_q in H\W,
```

and a Coxeter generator acts by

```text
q . s_i = H t_q s_i.
```

The finite action must be transitive. Choose a root point `q_0 = H`; its
stabilizer is `H`. A **Schreier transversal** is one chosen representative word
`t_q` for every action point `q`, with `t_(q_0) = 1`. The implementation runs a
deterministic breadth-first search in the coset graph. The first path from the
root to `q` supplies `t_q`; those first paths form a spanning tree. In
particular, every initial segment of a representative is again a chosen
representative, which is the usual prefix-closed Schreier condition.

### Schreier generators

For every action point `q` and original generator `s_i`, define the
**Schreier generator**

```text
x_(q,i) = t_q s_i t_(q s_i)^(-1) in H.
```

This word lies in `H` because `t_q s_i` and `t_(q.s_i)` represent the same left
coset. Geometrically, it is the loop that:

1. follows the tree path `t_q` from the root to `q`;
2. crosses the edge labeled `s_i` from `q` to `q.s_i`;
3. returns to the root along `t_(q.s_i)` in reverse.

If that middle edge belongs to the spanning tree, the outgoing and returning
tree paths cancel, so `x_(q,i) = 1`. The implementation discards these trivial
tree generators. Each remaining unoriented coset-graph edge gives one retained
generator; traversing it in the opposite direction gives the inverse symbol.

The phrase **Schreier generators** therefore refers to this concrete family of
based loops. It does not mean the original Coxeter generators `s_i`, and it
does not assert that the displayed generating set is minimal.

### Rewriting the relators

Let `overline(g)` denote the chosen transversal representative of the coset
`Hg`. For a general signed word

```text
w = a_1^(epsilon_1) ... a_n^(epsilon_n),
```

the rewriting map `tau` reads `w` from left to right while tracking its current
coset. A positive letter `a_k` contributes the Schreier generator based at the
coset reached by the preceding prefix. A negative letter contributes the
inverse generator based at the coset reached after traversing that inverse.
Tree generators are omitted, and adjacent inverse letters are freely reduced.

The Reidemeister--Schreier theorem gives

```text
H = < x_(q,a) |
      x_(q,a) = 1 for transversal-tree edges,
      tau(t_q r t_q^(-1)) for q in H\G and r in R >.
```

For a Coxeter presentation, every generator is an involution. The app can
therefore store an original word as a list of generator indices without signed
exponents. At every action point it follows each word

```text
s_i s_i
and
(s_i s_j)^m_ij,
```

checks that the path closes, replaces each non-tree edge by its Schreier letter
or inverse, and freely reduces. Rewriting the relator loop at every action
point is the coset-graph form of rewriting all the conjugates above.

After the tree generators are removed, the output is a finite presentation

```text
H = <x_1, ..., x_n | rho_1, ..., rho_k>.
```

The export must contain:

- the original Coxeter presentation and its input hash;
- the transitive permutation action and chosen basepoint;
- the transversal words `t_q`;
- every retained Schreier generator as both a formal id and the word
  `t_q s_i t_(q.s_i)^(-1)` in the `s_i`;
- every tree edge declared trivial and every reverse-edge assignment;
- every rewritten relator as a word in the Schreier generators;
- the original action-edge path used for each rewrite;
- enough rewrite data to check each equality back in the original
  presentation;
- the index `[W:H]` and the torsion-free certificate used by the cover.

For this workflow, a permutation action satisfying the Coxeter relations is
not enough. Torsion-freeness needs its own fixed-point or spherical-subgroup
certificate. See [Automatic torsion-free cover discovery](torsion-free-cover-discovery.md).

## 2. Build `hat X` And Compress It To `bar X`

Let the transitive action have degree `d`. The standard one-vertex Coxeter
presentation complex `X` has:

- one loop labeled `s_i` for each generator;
- one bigon attached along `s_i s_i`;
- one `2m_ij`-gon attached along `(s_i s_j)^m_ij` for each finite pair.

The cover `hat X` has one vertex over the base vertex for each action point.
It has one directed lift of each generator loop and one lift of each 2-cell
over every action point. The app constructs these cells from the action rather
than trusting display polygons from an imported file. It verifies that every
lifted relator closes.

The compression `hat X -> bar X` performs two exact identifications:

1. For the two-point `s_i`-orbit `{q, q.s_i}`, the directed lifts
   `q -> q.s_i` and `q.s_i -> q`, together with the two lifted `s_i^2`
   bigons, form one compression fiber. They become one geometric edge of
   `bar X`.
2. For a finite pair `{i,j}`, the subgroup
   `W_ij = <s_i,s_j>` has order `2m_ij`. Torsion-freeness of `H` makes its
   action on `H\W` free: a stabilizer would be a finite subgroup of a
   conjugate of `H`. Hence every `W_ij`-orbit has `2m_ij` action points. The
   `2m_ij` relation-cell lifts based at those points acquire the same compressed
   signed boundary, up to cyclic shift and reversal, and become one relation
   polygon of `bar X`.

Consequently one finite pair contributes

```text
d / (2m_ij)
```

compressed polygons. This is an orbit-stabilizer count, not a drawing rule.
The compression certificate records every fiber and checks that all source
vertices, edges, bigons, and relation cells have exactly one image. See
[From a finite cover to walls](cover-compression-walls.md) for the full cell
count and the viewer conventions.

## 3. Find Walls Algorithmically

### Mathematical definition

In a compressed relation cell with cyclic boundary

```text
b_0, b_1, ..., b_(2m-1),
```

the occurrence `b_k` is opposite `b_(k+m)`. Two geometric edges are declared
parallel when they occur in opposite positions of some relation polygon. The
equivalence relation generated by parallelism partitions the geometric edges
of `bar X`. Each equivalence class is an **abstract wall**.

An occurrence matters here, not only an edge id: the same geometric edge can
occur more than once in an attaching map. The exported record therefore keeps
the cell id, boundary index, edge id, traversal sign, endpoints, and generator
for both sides of every crossing.

### Disjoint-set wall finder

The implementation uses a disjoint-set union structure:

1. Create one singleton set for each geometric edge of `bar X`.
2. Sort relation cells and edge ids so the result is deterministic.
3. For each `2m`-gon and each `0 <= k < m`, union the edge at boundary
   position `k` with the edge at position `k+m`.
4. Record a wall-crossing segment for that exact opposite pair. The straight
   midpoint segment shown by the renderer is only a picture of this record.
5. After all cells have been scanned, each disjoint-set component is one wall.
   Its stable id is derived from the least edge id in the component.

The partitioning phase is essentially linear in the total number of boundary
occurrences: disjoint-set operations take amortized inverse-Ackermann time.
No 3D coordinate, distance threshold, or geometric intersection test enters
the definition.

### Two-sidedness as a parity problem

Fix a stored direction on every geometric edge. If an occurrence traverses its
stored edge direction, write `epsilon_k = +1`; otherwise write `-1`. Opposite
positions impose the transverse-orientation constraint

```text
d(e_(k+m)) = -epsilon_k epsilon_(k+m) d(e_k),
```

where `d(e)` is `+1` or `-1` relative to the stored edge direction. The minus
sign accounts for the fact that opposite sides are traversed in opposite
directions around the polygon.

For each wall, the app builds this signed constraint graph, assigns parity
`+1` to its canonical edge, and propagates parity by breadth-first search. If
an already assigned edge is reached with the opposite parity, the wall is
one-sided. The certificate stores the conflicting constraint cycle. If no
conflict occurs, the wall is two-sided and has exactly two global
coorientations, obtained by multiplying every propagated edge direction by a
single wall sign `sigma_W in {+1,-1}`.

The app also reports whether a wall crosses one cell more than once and whether
it self-osculates at a vertex. These are important for the random-orientation
probability estimates in Jankiewicz--Wise. They are not extra gates for a
specific supplied coorientation whose cocycle sums and every directed link are
checked directly. Global two-sidedness/coorientability is a gate.

### Searching for a large lawful subcomplex

For a two-sided wall system, one binary variable `sigma_W` is chosen per wall.
If `p_e` is the propagated parity of edge `e`, its direction is

```text
d(e) = sigma_(wall(e)) p_e.
```

Along a cell boundary, the visible direction sign is

```text
epsilon_k d(e_k).
```

The cell is lawful exactly when this cyclic sign word has two transitions: one
source and one sink. The optimization objective is the sum of the weights of
lawful cells, optionally subject to nonempty/connected ascending and descending
links at every vertex.

For at most 20 walls by default, the app uses deterministic branch-and-bound.
It orders influential walls first, fixes one sign when global reversal is a
symmetry, and prunes a partial assignment when even retaining every unresolved
cell cannot beat the current lower bound. A completed search with equal lower
and upper bounds certifies a maximum. A node or time limit yields a best-found
assignment and an unresolved upper bound.

For larger wall systems, the app uses deterministic multi-start local search.
That result is always labeled **best found**. It is not evidence that no better
coorientation exists. Wall discovery itself remains exact in both cases; only
the optimization over the `2^(number of walls)` sign choices changes status.

## 4. Turn A Wall Coorientation Into A 1-Cocycle

Jankiewicz--Wise call a choice on a two-sided wall an orientation. The app uses
**coorientation** because the choice directs the 1-cells dual to the wall.

For the deterministic certificate, the required wall condition is the
existence of this globally consistent coorientation. Embedded walls with no
self-osculation are useful sufficient conditions in the paper's construction
of a cover and its random-orientation estimates. They are not additional
hypotheses of the Bestvina--Brady criterion once a particular coorientation
has been supplied and every ascending and descending link is checked directly.
In particular, self-osculation creates dependence among random local
directions; it does not invalidate an orientation whose resulting links pass.

Fix a stored orientation for every geometric edge `e` of `bar X`. A wall
coorientation assigns

```text
c(e) in {+1, -1}.
```

Reversing the traversal of `e` changes the sign. If a compressed relation cell
has signed attaching map

```text
(e_1, epsilon_1), ..., (e_l, epsilon_l),
```

its cellular boundary sum is

```text
sum_k epsilon_k c(e_k).
```

This sum must be zero for **every** relation cell of `bar X`. Opposite sides
cancel when the wall orientation is globally consistent, but the exporter
must record the sums rather than relying on the picture. These checks prove
that `c` is a cellular 1-cocycle and that the map on the 1-skeleton extends to
a map

```text
bar X -> S^1.
```

This extension is an algebraic statement. It does not say that the lift is a
Morse function on every 2-cell.

## 5. Evaluate The Wall Map On Schreier Generators

The cellular cocycle and the subgroup presentation must be tied together
explicitly. Let `h(q)` be the signed sum of `c` along the path represented by
the transversal word `t_q`. If `e(q,i)` is the generator edge from `q` to
`q s_i`, then

```text
chi(x_(q,i)) = h(q) + c(e(q,i)) - h(q s_i).
```

The sign of `c(e(q,i))` is taken in the direction in which that path traverses
the stored geometric edge. This formula also explains why Schreier generators
belonging to the transversal tree evaluate to zero.

This is simply the cocycle sum along the loop
`t_q s_i t_(q.s_i)^(-1)`. The export lists the integer value of `chi` on every
retained Schreier generator. It must then check

```text
chi(rho_j) = 0
```

for every rewritten relator. The compressed-cell sums and the rewritten
relator sums are two views of the same cocycle condition, but both are useful:
the first checks the cellular model, while the second checks the claimed map on
the displayed presentation of `H`.

No floating-point arithmetic is needed here. Words, signs, sums, and greatest
common divisors are exact integers.

## 6. Prove The Image And Normalize It To `Z`

A nonzero homomorphism to `Z` need not be onto. Call the homomorphism obtained
directly from the wall cocycle `chi`. If its values on the retained Schreier
generators are `a_1, ..., a_n`, then

```text
image(chi) = d Z,
d = gcd(|a_1|, ..., |a_n|).
```

This works because the Schreier generators generate `H`: every value of `chi`
is an integer combination of the `a_i`, and every such combination occurs as
the value of a word in those generators. The raw wall map is primitive exactly
when `d = 1`.

The app computes the same period subgroup independently from a spanning tree
of the geometric 1-skeleton. Every non-tree edge closes a fundamental cycle;
the gcd of the cocycle periods on those cycles must equal the gcd from the
Schreier presentation. This catches convention or rewrite errors between the
cellular and group-theoretic models.

### What normalization means

Suppose `d > 0`. Since every value of `chi` is divisible by `d`, define

```text
phi(h) = chi(h) / d.
```

Then `phi: H -> Z` is a homomorphism and

```text
ker(phi) = ker(chi).
```

This is **normalization**. Equivalently, `chi` is already onto its image
`dZ`, and the isomorphism `dZ -> Z` sending `dn` to `n` gives `phi`.
Normalization is necessary only when the final claim is stated as an
epimorphism onto the standard copy of `Z`. It does not repair a zero map, alter
the wall signs, or change the PL Morse kernel.

The normalized generator values `b_i = a_i/d` should include Bezout
coefficients `u_i` satisfying

```text
sum_i u_i b_i = 1.
```

This is a short, independently checkable proof that `image(phi) = Z`. For the
raw values, the corresponding identity has right side `d`.

Jankiewicz--Wise prove first that their map is nontrivial: compactness and a
nonempty ascending link produce a positively directed closed path. If the
resulting image is `d Z` with `d > 1`, identify `d Z` with `Z`, or equivalently
use the normalization above. The export retains both `chi` and `phi`, together
with `d` and their exact relation. It must not pretend that dividing the group
homomorphism is the same as dividing each original edge value: the edge values
may be `+1` and `-1` even when every **closed-loop period** is even.

### Why the directed-link test does not prove surjectivity

Ascending and descending links are local. They depend on which incident edge
germs point up or down, so multiplying every height difference by a positive
integer leaves them unchanged. Surjectivity is global: it asks for the gcd of
all closed-loop periods.

A two-edge circle makes the distinction concrete. Orient both edges around the
circle and map each edge once positively around `S^1`. At each vertex the
ascending link and descending link are nonempty singletons, hence connected.
But the fundamental loop has total value `2`, so the induced map has image
`2Z`, not `Z`. Dividing the group homomorphism by `2` gives the primitive map
with the same kernel. Thus link conditions can support finite generation of a
kernel without detecting whether the chosen integer coordinate is primitive.

The three possible outcomes are:

- `d = 0`: the wall coorientation induces the zero homomorphism;
- `d > 1`: the recorded wall map has image `d Z` and needs explicit
  normalization;
- `d = 1`: the recorded map itself is primitive.

Only the last two cases can yield an epimorphism after the normalization is
recorded.

## 7. Build The Lawful Subcomplex

The cocycle map on `bar X` need not be Morse on every relation cell. For the
chosen wall orientation, a 2-cell is **lawful** when its attaching path can be
written

```text
alpha beta^(-1),
```

where `alpha` and `beta` are positively directed paths. For the unit edge
coorientation used here, the cyclic boundary sign word has exactly two sign
changes: one source and one sink.

This condition is stronger than the zero boundary sum. A polygon can have as
many positive as negative sides, so its cocycle sum is zero, while alternating
up and down several times around the boundary. The circle map still extends
over such a polygon, but that polygon does not have the single-minimum,
single-maximum affine behavior required by the Morse argument. Lawfulness is
the cell-by-cell test that removes this ambiguity.

The lawful subcomplex `Y` keeps the entire 1-skeleton of `bar X` and discards
the unlawful 2-cells. Jankiewicz--Wise show that the restricted circle-valued
map lifts to a Morse function

```text
tilde Y -> R.
```

The certificate records, for every retained cell:

- its exact signed attaching map;
- the two directed paths `alpha` and `beta`;
- its unique minimum and maximum;
- the boundary positions of its source and sink.

For every discarded cell it should record the failed lawfulness condition.
An optimized "largest lawful subcomplex" search is an app feature; it is not a
definition from the paper. Once the wall orientations are fixed, the lawful
subcomplex is obtained by keeping all and only the lawful cells.

Keeping the entire 1-skeleton is essential. It is what later makes
`pi_1(Y) -> pi_1(bar X)` surjective. The app is not claiming that removing
2-cells preserves the fundamental group; it records the resulting surjection
and uses it in the direction in which it is valid.

## 8. Check The PL Morse Hypotheses

The finite-generation theorem quoted as Theorem 2.1 in Jankiewicz--Wise has
several hypotheses. A theorem-level result needs all of them, not just a link
graph drawn in the viewer.

The checklist deliberately does **not** require embeddedness or absence of
self-osculation. It reports them separately as diagnostics for the
probabilistic search argument. Two-sidedness/global coorientability is
required, as are the concrete cocycle, Morse-cell, and link checks below.

### The ambient complex

For the complex to which Morse theory is applied, certify that it is:

- **finite**;
- **affine**, with convex Euclidean cell models whose face structures agree;
- **aspherical**, or supplied with an accepted exact implication such as a
  verified nonpositively curved structure;
- equipped with a circle-valued map whose lift is affine and nonconstant on
  each positive-dimensional cell;
- equipped with a lift whose vertex heights form a closed discrete subset of
  `R`.

In the Jankiewicz--Wise dimension-at-most-two setting, the inequalities

```text
1/m_ij + 1/m_jk + 1/m_ki <= 1
```

for every triple give the regular-polygon nonpositively curved setting used in
their discussion. A 3D rendering, a numerical Gram signature, or a passed
cell-boundary sum is not an asphericity certificate.

### The links

At every vertex `x`:

- a link vertex is ascending when its 1-cell points away from `x` and
  descending when it points toward `x`;
- a link edge, corresponding to a 2-cell corner, is ascending or descending
  according to the orientations of the walls through that cell, as in
  Section 2.4 of the paper.

The app must build these links from the exact retained-cell incidence, not
from projected coordinates. It should export vertex and edge ids, components,
and a spanning tree for every link claimed to be connected. Since links are
local and the complex is finite, checking one representative of every vertex
in the finite quotient checks all lifted vertices.

For finite generation, every ascending and descending link must be:

```text
nonempty and connected.
```

Under the finite, aspherical, affine, and Morse hypotheses above,
Bestvina--Brady Morse theory then proves that

```text
ker(pi_1(Y) -> Z)
```

is finitely generated.

### Why This Proves Finite Generation For `ker(phi)`

The lawful subcomplex `Y` has the same 1-skeleton as `bar X`. The inclusion

```text
i: Y -> bar X
```

therefore induces a surjection

```text
i_*: A = pi_1(Y) -> H = pi_1(bar X).
```

Let `psi = chi o i_*`. The following square commutes:

```text
A  --i_*-->  H
|            |
psi          chi
|            |
v            v
Z  ---id-->  Z
```

Now take any `h in ker(chi)`. Surjectivity of `i_*` gives an `a in A` with
`i_*(a) = h`. Then

```text
psi(a) = chi(i_*(a)) = chi(h) = 0,
```

so `a in ker(psi)`. Hence the restricted map

```text
ker(psi) -> ker(chi) = ker(phi)
```

is surjective. PL Morse theory makes `ker(psi)` finitely generated, and a
quotient of a finitely generated group is finitely generated. This is the
final step in Section 3.3 of Jankiewicz--Wise.

The export should include the common 1-skeleton check and the induced map on
presentations. Otherwise the passage from the lawful subcomplex back to `H`
has not been certified.

This argument also explains why connected links alone do not prove the final
claim. They address `ker(psi)` only after the affine/aspherical Morse setup has
been established. The map on `H`, its nonzero image, normalization, and the
surjection from `pi_1(Y)` are separate global checks.

## Finite Generation And Finite Presentation Are Different Claims

The following distinctions are essential.

### Finite generation

For a direct Bestvina--Brady Morse setup, nonempty connected ascending and
descending links imply finite generation of the kernel. This is the conclusion
used by Jankiewicz--Wise. In their lawful-subcomplex argument, finite
generation passes from the kernel over `Y` to its quotient `ker(phi)`.

### Finite presentation

Bestvina--Brady Theorem 4.1(3) gives a stronger positive criterion: when the
Morse setup is on a contractible affine complex with a cocompact group action,
and every ascending and descending link is simply connected, the kernel is
finitely presented.

There is an important limit in the Jankiewicz--Wise lawful-subcomplex setup.
Even if the links of `Y` are simply connected, the theorem first proves finite
presentation for `ker(pi_1(Y) -> Z)`. The target `ker(H -> Z)` is only known to
be a quotient of that group, and finite presentation does not pass to arbitrary
quotients. To certify finite presentability of `ker(phi)`, the app would need
either:

- a Morse function directly on a complex with fundamental group `H` and all
  ascending and descending links simply connected; or
- separate finite normal-generation/presentation data for the quotient of the
  lawful kernel.

The current certificate must report this conclusion as **not established**
unless one of those additional routes is supplied.

### Non-finite presentability

Disconnected links, non-simply-connected links, or a failed link computation
do **not** prove that a kernel is not finitely presented.

Jankiewicz--Wise prove non-finite presentability in Corollary 3.2 by a separate
group-theoretic argument. For that conclusion, a certificate must establish:

1. `N = ker(phi)` is nontrivial and finitely generated;
2. `phi` is onto `Z`, so `N` is normal and has infinite index in `H`;
3. `H` has cohomological dimension at most two;
4. the Bieri normal-subgroup theorem used in the paper applies: a nontrivial
   finitely presented normal subgroup of such a group is free or finite
   index;
5. the exact Euler characteristic of `H` is positive (more generally,
   nonzero is enough for the final contradiction when the multiplicativity
   hypotheses are present).

If `N` were finitely presented, Bieri's result and infinite index would force
`N` to be free. Since `N` is already finitely generated, it would be a
finite-rank free group. The extension by `Z` would then give

```text
chi(H) = chi(N) chi(Z) = 0,
```

contradicting the certified positive Euler characteristic. This proves that
`N` is not finitely presented. It is not a PL-link conclusion.

## Required Export Record

A reproducible virtual-algebraic-fibering bundle should contain at least the
following records.

### Provenance and subgroup

- source Coxeter matrix, presentation, and hashes;
- finite action, basepoint, and index;
- exact backend name, version, command, and output hash;
- action-relation checks;
- torsion-free certificate and its precise scope;
- `hat X`, `bar X`, and the compression-fiber certificate.

### Presentation and homomorphism

- Schreier transversal;
- Schreier generators as words in the Coxeter generators;
- complete rewritten relators;
- wall-coorientation id and one sign per wall;
- signed value on every compressed geometric edge;
- boundary sum for every compressed relation cell;
- value on every Schreier generator;
- sum on every Schreier relator;
- image gcd, Bezout witness, and any primitive normalization.

### Morse data

- lawful and discarded cell ids with reasons;
- exact affine/asphericity evidence for the lawful complex;
- unique minimum and maximum check for every retained cell;
- ascending and descending links at every vertex representative;
- nonemptiness and connectivity witnesses;
- optional simple-connectivity data, clearly separated from the conclusion it
  supports;
- the map from the lawful-kernel presentation onto `ker(phi)`.

### Conclusion status

The bundle should state each conclusion independently:

- `H is a finite-index subgroup of W`;
- `H is torsion-free`;
- `phi: H -> Z is a well-defined homomorphism`;
- `phi is primitive`;
- `ker(phi) is finitely generated`;
- `ker(phi) is finitely presented`;
- `ker(phi) is not finitely presented`.

Each row is `passed`, `failed`, or `not established`, with links to the exact
records used. A stronger row must not inherit a pass merely because an earlier
row passed.

## Evidence Versus A Theorem-Level Conclusion

The following are exact finite computations for a supplied artifact:

- Schreier rewriting;
- integer cocycle sums;
- gcd and Bezout checks;
- lawful-cell classification;
- finite link components and homology;
- wall embeddedness, two-sidedness, and self-osculation checks in the supplied
  finite incidence.

They become part of a theorem-level virtual-fibering certificate only when the
artifact also proves that the finite action is the stated cover, that `H` has
the required subgroup properties, and that the affine/aspherical Morse
hypotheses apply. A browser drawing supplies none of those implications.

Suggested UI language:

- **Explicit primitive homomorphism:** presentation, relators, and gcd pass.
- **Morse diagnostics pass:** lawful cells and finite links pass, but a global
  hypothesis is missing.
- **Verified virtual algebraic fibration:** every subgroup, algebraic, and
  finite-generation hypothesis has a matching certificate.
- **Non-finite-presentability conclusion:** the separate Bieri and Euler
  characteristic package also passes.

## Source Map

The explicit subgroup presentation is an implementation-level certificate
added to make the homomorphism independently checkable. Its mathematical basis
is the Reidemeister--Schreier theorem; see Schreier (1927), Reidemeister (1932),
Lyndon--Schupp, Miller Theorem 4.3, and Sims Chapter 6 in
[References](references.md#reidemeister--schreier-presentations).

The following parts of Jankiewicz--Wise, _Incoherent Coxeter Groups_, were used
for this specification:

- Section 2.1: `X`, the torsion-free cover, compression, cell counts,
  dimension at most two, and Euler characteristic;
- Sections 2.2--2.3: walls, two-sidedness, and orientations of dual 1-cells;
- Section 2.4, especially Theorem 2.1: affine Morse functions, ascending and
  descending links, and the finite-generation criterion;
- Section 2.5: extension of the oriented 1-skeleton map to `S^1` and the
  lawful subcomplex;
- Theorem 3.1 and Section 3.3: the epimorphism with finitely generated kernel
  and the passage from the lawful subcomplex to the compressed complex;
- Corollary 3.2: the separate Bieri/Euler-characteristic argument for failure
  of finite presentability;
- Proposition 3.5 and Sections 3.2--3.3: the good-wall hypotheses used in the
  paper's existence argument.

The positive simple-connectivity criterion for finite presentation is
Bestvina--Brady, _Morse theory and finiteness properties of groups_, Theorem
4.1(3). Jankiewicz--Wise quote only the finite-generation specialization needed
for their proof.

See also [Mathematical conventions](math.md),
[From a finite cover to walls](cover-compression-walls.md), and
[References](references.md).
