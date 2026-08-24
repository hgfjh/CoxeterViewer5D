# Full Davis-Quotient Fibering Certification

This note specifies the full-dimensional certificate for a virtual algebraic
fibration of a Coxeter group. It is the profile intended for the compact
5-cube. It is different from the two-dimensional lawful-compression argument
described in
[Certifying a virtual algebraic fibration](virtual-algebraic-fibering.md).

The input is a Coxeter system `(W,S)`. Its Davis complex is denoted by `Sigma`.
The target calculation is an explicit finite-index subgroup `H <= W` and a
primitive homomorphism

```text
phi: H -> Z
```

whose kernel is finitely generated. A passing artifact certifies the exact
sequence

```text
1 -> ker(phi) -> H -> Z -> 1.
```

This is a **virtual algebraic fibration**: `virtual` records the passage to the
finite-index subgroup `H`, and `algebraic fibration` means an epimorphism to
`Z` with finitely generated kernel. It is not, by itself, a proof that a
manifold fibers locally trivially over the circle.

## What Is Already Checked, And What Must Not Be Conflated

The repository contains exact foundations for this profile:

- [`src/torsionFree/`](../src/torsionFree/) validates finite Coxeter actions
  and their torsion-free stabilizers;
- [`src/davis/fullQuotient.ts`](../src/davis/fullQuotient.ts) constructs the
  complete Coxeter-cell poset of `K = H\Sigma` from a certified action;
- [`src/walls/`](../src/walls/) constructs quotient walls, parity constraints,
  coorientations, and wall searches on the quotient 2-skeleton;
- [`src/fibering/wallHomomorphism.ts`](../src/fibering/wallHomomorphism.ts)
  checks cellular boundary sums;
- [`src/fibering/schreierPresentation.ts`](../src/fibering/schreierPresentation.ts)
  and
  [`src/fibering/schreierHomomorphism.ts`](../src/fibering/schreierHomomorphism.ts)
  construct the subgroup presentation and primitive character;
- [`src/topology/collapsibility.ts`](../src/topology/collapsibility.ts)
  searches for and independently verifies simplicial collapse certificates.
- [`src/fibering/pullingTriangulation.ts`](../src/fibering/pullingTriangulation.ts)
  applies one global quotient-vertex order to every Coxeter cell;
- [`src/fibering/fullDavisMorse.ts`](../src/fibering/fullDavisMorse.ts)
  constructs exact local heights and the full directed links;
- [`src/fibering/fullDavisCertificate.ts`](../src/fibering/fullDavisCertificate.ts)
  assembles and independently replays the schema-v2 certificate;
- [`src/fibering/fullDavisSearch.ts`](../src/fibering/fullDavisSearch.ts)
  searches wall signs against the full-link conditions, using exhaustive
  search only when the recorded wall bound permits it.

The existing builder in
[`src/fibering/certificate.ts`](../src/fibering/certificate.ts) is the
two-dimensional lawful-compression profile. Its directed links are links in a
compressed polygonal complex. They are not the full links in a subdivided
five-dimensional Davis quotient. Removing that profile's dimension guard
would not produce a valid compact-5-cube certificate.

A full-dimensional artifact may say **passed** only when it also records and
verifies the compatible triangulation, exact perturbed height, and every full
ascending and descending link described below.

## The Dependency Chain

Each stage consumes the certified output of the preceding stages. A later
stage cannot repair missing evidence from an earlier one.

| Stage | Object or calculation          | Required finite evidence                                                                             |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1     | Torsion-free finite action     | Complete transitive right action, Coxeter relations, free action of every spherical special subgroup |
| 2     | Full Davis quotient `K`        | Every cell `HwW_T`, every face incidence, exact orbit counts                                         |
| 3     | Quotient walls                 | Every quotient edge assigned to one wall; parity constraints and two-sidedness witnesses             |
| 4     | Wall coorientation             | One transverse sign per wall and one nonzero signed value per oriented edge                          |
| 5     | Cellular 1-cocycle             | Signed sum zero around every rank-two Coxeter cell                                                   |
| 6     | Presentation of `H`            | Schreier transversal, Schreier generators, rewritten Coxeter relators                                |
| 7     | Primitive character            | Values on Schreier generators, relator sums, gcd, and Bezout witness                                 |
| 8     | Compatible subdivision         | Fixed global vertex order, pulling simplices, and shared-face agreement                              |
| 9     | PL height                      | Cell-local integral potentials, primitive normalization, rational offsets, and sign inequalities     |
| 10    | Directed links                 | Complete ascending and descending link complexes at every vertex orbit                               |
| 11    | Finiteness and collapse checks | Nonemptiness, connectivity witnesses, and optional collapse certificates                             |
| 12    | Export                         | Canonical data, source hashes, intermediate hashes, checks, warnings, and precise claim status       |

## 1. A Torsion-Free Finite Action

A **finite action** in this pipeline is a transitive right action of `W` on a
finite set `Omega`. Choose a basepoint `q_0`. Its stabilizer

```text
H = Stab_W(q_0)
```

has index `|Omega|`. With the app's convention, points of `Omega` are left
cosets `Hw` and generators act on the right:

```text
Hw . s_i = Hw s_i.
```

The action certificate checks that each `s_i` is an involutive permutation and
that every finite Coxeter relation `(s_i s_j)^m_ij` acts trivially. These checks
show that the permutations define an action of `W`; they do not yet prove that
`H` is torsion-free.

For a spherical subset `T subset S`, the special subgroup `W_T` is finite. A
finite-order element of a Coxeter group is conjugate into a finite spherical
special subgroup. It follows that `H` is torsion-free when every spherical
subgroup acts freely on `Omega`. The certificate may verify this directly, or
equivalently use an exhaustive set of prime-order torsion witnesses and prove
that none fixes an action point. See
[Automatic torsion-free cover discovery](torsion-free-cover-discovery.md) and
Everitt's criterion in [References](references.md#cover-compression-walls-and-morse-theory).

The artifact must contain the full permutation action. A statement that
Selberg's lemma guarantees some torsion-free subgroup is not an executable
cover certificate.

## 2. The Full Davis Quotient Cell Poset

The Davis complex `Sigma` contains one Coxeter cell for each coset `wW_T`,
where `T` is spherical. The quotient

```text
K = H\Sigma
```

therefore has cells indexed by double cosets

```text
HwW_T.
```

Computationally, a `T`-cell is one `W_T`-orbit in the right action on `H\W`.
Because `H` is torsion-free, this restricted action is free. Every `T`-orbit
has exactly `|W_T|` points, so an action of degree `d` has

```text
d / |W_T|
```

cells of type `T`.

Equivalently, this is the target of the **generalized compression**. Regard
each pair `(q,T)`, with `q in H\W`, as a rooting of a spherical `T`-cell and
identify all `|W_T|` rootings in the orbit `qW_T`. The ordinary
Jankiewicz--Wise compression is exactly the rank-at-most-two restriction of
this construction. For ranks greater than two these are deliberately
introduced rooted records: the presentation-complex cover `hat X` is itself
only two-dimensional.

A **cell poset** is the set of all cells ordered by the face relation. If
`U subset T` is spherical, the `U`-faces of a `T`-cell are the `W_U`-orbits
contained in its `W_T`-orbit. A complete certificate records:

- the exhaustive catalogue of spherical subsets;
- every cell in every dimension;
- its quotient vertices;
- immediate facets and all proper faces;
- immediate cofacets and all proper cofaces;
- the count `d/|W_T|` for every spherical type;
- a deterministic incidence hash.

The compact generalized-compression artifact commits the root-to-fiber map
and face-compatibility stream in fixed chunks. Replay reconstructs every
entry from the exact permutation action. This avoids materializing millions
of string-valued rooted records or all strict face incidences while preserving
an exact, tamper-evident certificate.

The constructor in
[`src/davis/fullQuotient.ts`](../src/davis/fullQuotient.ts) implements this
description. Its FNV-1a hash is a fast revision key for in-app caches. The
separate `archiveHash` is SHA-256 over the complete canonical incidence
records; the schema-v2 fibering artifact binds that archive hash into its final
evidence chain.

The rank-two part of this poset must agree with the corresponding cells in the
quotient 2-skeleton. A finite pair `{i,j}` contributes a `2m_ij`-gon for each
`W_{i,j}`-orbit. Higher cells cannot be inferred from those polygons; they must
come from the complete spherical catalogue.

## 3. Quotient Walls And Two-Sidedness

The wall calculation begins in the quotient 2-skeleton. In each rank-two
`2m`-gon, two boundary edges are **opposite** when they are separated by `m`
boundary steps. Generate an equivalence relation on quotient edges by declaring
opposite edges equivalent in every rank-two cell and taking transitive closure.
An equivalence class is an **abstract quotient wall**.

This is combinatorial data. A rendered surface is only a drawing of the wall
class.

When an opposite-side identification is propagated through a polygon it also
propagates a transverse orientation parity. A wall is **two-sided** when those
parity constraints are globally consistent: following any closed chain of
opposite-side identifications returns with the original transverse direction.
The certificate records the constraint graph and a parity assignment, not only
a boolean result.

Embeddedness and absence of self-osculation are useful geometric properties,
but they are not silently substituted for the checks below. For this pipeline,
the essential inputs are a globally coorientable wall system, a closed edge
cochain, and complete directed-link calculations.

## 4. Coorientation And The Cellular 1-Cocycle

A **coorientation** chooses one of the two transverse directions on each
two-sided wall. It does not orient the wall internally. Instead, it directs
each 1-cell dual to that wall.

Fix one stored orientation for every quotient edge. If edge `e` crosses wall
`A`, give it a nonzero integer value

```text
c(e) = sign(A) * weight(A),
c(reverse(e)) = -c(e).
```

The resulting cellular 1-cochain is a **cellular 1-cocycle** when its signed
sum around the attaching loop of every 2-cell is zero. Every 2-cell of the
Davis quotient has spherical rank two, so it is enough to check every exact
rank-two boundary:

```text
sum_{boundary occurrence a} traversal_sign(a) * c(edge(a)) = 0.
```

The export records the whole equation for every cell. It must reject missing
edges, zero values when the later Morse construction requires strict edge
directions, and any nonzero boundary sum.

Closedness is what makes path integration independent of homotopy. It is also
what makes evaluation on loops depend only on an element of `H`, rather than
on the chosen edge word.

### Why a compression wall may be used on the full Davis quotient

The wall classes are found in the compressed rank-two complex, but the
fibering claim concerns the complete Davis quotient. The code therefore does
not assume that a successful rank-two check automatically settles the
higher-dimensional cells. After enumerating the full spherical-cell poset, it
integrates the induced edge cocycle separately on every Coxeter cell. It then
checks that:

- every vertex of every cell is reached with a unique height;
- every generator edge has the prescribed height difference; and
- cell-local heights on each face/coface overlap differ by one additive
  constant.

The `full-cell-cocycle-extension` stage records those checks, including the
number of cells of dimension at least three. A failed or missing extension
blocks the virtual-fibering result even when every rank-two boundary sum is
zero. Thus the exported evidence is a compression-wall coorientation **plus
an explicit extension certificate on the full Davis quotient**; it is not a
claim that the compressed walls themselves are already a geometric wall
decomposition of every higher cell.

## 5. Reidemeister--Schreier Data

Suppose

```text
W = <S | R>
```

is the Coxeter presentation. The **Reidemeister--Schreier procedure** converts
this presentation and the finite coset action into a presentation of the
stabilizer `H`.

Choose one representative word `t_q` for every action point `q=Ht_q`, with
`t_{q_0}=1`. The representatives are selected by a deterministic spanning tree
in the coset graph. For every action point `q` and generator `s_i`, define

```text
x_(q,i) = t_q s_i t_(q.s_i)^(-1) in H.
```

These are the **Schreier generators**. Geometrically, `x_(q,i)` follows the
tree from the basepoint to `q`, traverses the `s_i` edge, and returns along the
tree from `q.s_i`. A tree edge gives the trivial generator. Each remaining
geometric coset edge supplies one generator, and reverse traversal supplies its
inverse.

The Reidemeister--Schreier presentation rewrites every Coxeter relator based at
every coset point as a word in these generators. The certificate contains the
transversal, retained generators, tree-edge declarations, rewritten relators,
and their source edge paths. The implementation is in
[`src/fibering/schreierPresentation.ts`](../src/fibering/schreierPresentation.ts).
Classical and modern references are listed under
[Reidemeister--Schreier Presentations](references.md#reidemeister--schreier-presentations).

Evaluating the wall cocycle on the based loop for `x_(q,i)` gives an integer.
Every rewritten relator must evaluate to zero. This produces a homomorphism

```text
chi_raw: H -> Z.
```

## 6. GCD Normalization And A Primitive Epimorphism

Let the values of `chi_raw` on the retained Schreier generators be
`a_1,...,a_n`. Since those generators generate `H`, the image is

```text
chi_raw(H) = D Z,
D = gcd(|a_1|,...,|a_n|).
```

Three cases must be distinguished:

- `D=0`: every value is zero, so there is no nontrivial character;
- `D>1`: `chi_raw` is nonzero but is not onto `Z`;
- `D=1`: `chi_raw` is already primitive.

When `D>0`, divide every generator value by `D` and define

```text
phi = chi_raw / D: H -> Z.
```

This is **normalization**. It does not change the kernel or any edge direction.
It changes the named image from `D Z` to all of `Z`. A Bezout witness

```text
u_1 a_1 + ... + u_n a_n = D
```

is finite evidence for the gcd. After division, the same coefficients exhibit
an element mapping to `1`, so `phi` is a **primitive epimorphism**. The checks
are implemented in
[`src/fibering/schreierHomomorphism.ts`](../src/fibering/schreierHomomorphism.ts).

This arithmetic step is necessary. Nonempty connected local links describe the
kernel of the character being studied; they do not prove that its image is all
of `Z`.

## 7. A Compatible Pulling Triangulation

The height must be affine on simplices. The Coxeter cells of `K` are therefore
given a common simplicial subdivision.

First give all quotient vertices one fixed global total order, for example the
lexicographic order of their stable vertex ids. Restrict this same order to the
vertices of every face. This is the **fixed global vertex order**.

The **pulling triangulation** of a cell `C` is defined recursively:

1. let `v` be the least vertex of `C`;
2. triangulate every facet of `C` that does not contain `v` by the same rule;
3. cone each resulting simplex to `v`.

Dimension-zero cells are already simplices. The use of one global order is the
compatibility mechanism: on a shared face, both incident cells restrict to the
same ordered vertex set and hence induce the same recursive triangulation.

The certificate must check this agreement explicitly for every face incidence.
It must also check that no quotient cell contains the same quotient vertex
twice. The free spherical action supplied by the torsion-free certificate is
what makes that regularity check possible.

A pulling triangulation introduces no new vertices. If another subdivision
does introduce vertices, the later link check must include every new vertex
orbit as well.

## 8. Integrating The Cocycle And Perturbing Heights

### Why the integration lives upstairs

A nontrivial cocycle on the finite quotient `K` cannot be the differential of
a globally defined real-valued function on `K`; if it were, every loop period
would vanish. Pull `c` back to the universal cover `Sigma`. Since `Sigma` is
simply connected and the pulled-back cochain is closed, choose a base vertex
`v_0` and set

```text
F_raw(v) = sum of c along any edge path from v_0 to v.
```

The rank-two boundary equations make this path-independent. Deck translation
by `h in H` changes the value by the period:

```text
F_raw(hv) - F_raw(v) = chi_raw(h).
```

After division by `D`, the normalized height `F_0=F_raw/D` satisfies

```text
F_0(hv) - F_0(v) = phi(h).
```

The implementation need not enumerate the infinite cover. It can store a
**cell-local integration**: for each quotient cell, choose a lift and a base
vertex, then integrate the edge values across that finite lifted cell. Two
local potentials on an overlap may differ by an additive integer constant.
That is expected; the constants record deck periods. The local records must
still agree on every edge difference.

Modulo `Z`, the normalized height descends to the desired circle-valued map on
`K`.

### Quotient-periodic rational offsets

Distinct vertices of one pulling simplex can have equal values under `F_0`.
To remove such ties without changing the character, choose a rational function

```text
delta: K^(0) -> Q
```

whose values are distinct on the vertices of every quotient cell. Lift it
periodically to `Sigma`, meaning `delta(hv)=delta(v)` for every `h in H`.
Then set

```text
F(v) = F_0(v) + epsilon * delta(v),
```

with a positive rational `epsilon` chosen exactly, not by floating-point
guesswork.

Let `d delta(e)=delta(target)-delta(source)`. To preserve every original
generator-edge direction it is enough to certify

```text
epsilon * max_e |d delta(e)|
    < min_e |c(e)| / D.
```

The left side is the largest perturbation of an edge difference; the right
side is the smallest unperturbed nonzero edge slope. The strict inequality
proves that no edge sign reverses. If a required edge has `c(e)=0`, this bound
does not exist; the certificate must fail or use a different construction and
check its directions separately.

Because `delta` is quotient-periodic, the deck-period equation remains

```text
F(hv)-F(v)=phi(h).
```

Thus the offsets break ties but do not alter the homomorphism.

### Affine extension

On each pulling simplex, there is a unique affine function taking the assigned
values at its vertices. **Extend linearly over each simplex** means using this
function in barycentric coordinates. Compatibility of the triangulation and
agreement of vertex values make the affine pieces agree on common faces.

The exported height certificate records exact rational vertex values, the
offset denominator, every edge sign comparison, and every simplex. A 3D
drawing of these values is not part of the proof.

## 9. Ascending And Descending Links

Let `v` be a vertex of the triangulated universal cover. Its simplicial link
records the directions leaving `v`. Because the perturbed heights are distinct
on every simplex:

- the **ascending link** consists of link simplices whose vertices all have
  height greater than `F(v)`;
- the **descending link** consists of link simplices whose vertices all have
  height less than `F(v)`.

Equivalently, in a simplex containing `v`, the face opposite `v` contributes in
full to the ascending link when `v` is the unique minimum, and in full to the
descending link when `v` is the unique maximum. In a mixed simplex, only the
subfaces spanned entirely by higher, respectively lower, vertices contribute.

The calculation is finite because `H` acts cocompactly. It must nevertheless
be run at every quotient vertex orbit. For each directed link, the artifact
records all simplices, nonemptiness, connected components, and a spanning tree
when connected. The calculation uses the full Davis cell poset and the common
triangulation, not only corners of rank-two polygons.

## 10. Connectedness And Collapsibility

A finite simplicial complex is **collapsible** if a sequence of elementary
collapses reduces it to one vertex. An elementary collapse removes a simplex
and a free codimension-one face contained in no other remaining coface.
Collapsibility implies contractibility, hence connectedness, but the converse
is false.

The checker in
[`src/topology/collapsibility.ts`](../src/topology/collapsibility.ts) has three
possible outcomes:

- `collapsible`: accompanied by a replayable elementary-collapse sequence;
- `proven-not-collapsible`: accompanied by an exhaustive decision DAG that
  accounts for every possible first collapse and every continuation;
- `unknown-budget`: the state, transition, or time budget ended first.

A failed greedy attempt is not evidence of noncollapsibility. In particular,
`unknown-budget` must remain an inconclusive diagnostic.

For the virtual algebraic-fibration claim, the mandatory local condition is
that every ascending and descending link is nonempty and connected, together
with the other PL Morse hypotheses above. In the finite cocompact
Bestvina--Brady setting, these conditions imply that `ker(phi)` is finitely
generated.

Collapsibility is a stronger, separately reported condition. Italiano,
Martelli, and Migliorini use collapsible ascending and descending links in a
specific affine cellulation and subdivision of a compact smooth manifold of
dimension at most five to obtain a map smoothable to a fibration over the
circle. Their conclusion depends on those manifold, dimension, affine, and
smoothing hypotheses. A collapsibility result for an arbitrary Davis quotient
does not by itself certify a topological or smooth bundle.

The current software does **not** implement the additional manifold/PL/
smoothing verifier. The legacy `imm23Hypotheses` shape is retained only for
schema compatibility; it consists of caller-supplied booleans and hash strings,
is ignored by certificate construction, and is rejected by replay if embedded
in an artifact. Consequently `imm23TopologicalFibrationCertified` is always
`false`. Smooth fibering can be exposed only after those referenced objects are
loaded, source-bound, and independently replayed.

## 11. The Exact Conclusion

The full certificate may assert a virtual algebraic fibration only when all of
the following pass:

1. the finite action defines a finite-index torsion-free subgroup `H`;
2. the complete cell poset of `K=H\Sigma` is certified;
3. the wall coorientation gives a closed integral 1-cocycle;
4. the Reidemeister--Schreier calculation gives a primitive epimorphism
   `phi:H->Z`;
5. the compatible subdivision and exact perturbed height satisfy the PL Morse
   conditions;
6. every ascending and descending link is nonempty and connected.

Under these hypotheses the artifact certifies

```text
1 -> ker(phi) -> H -> Z -> 1
```

with `ker(phi)` finitely generated. The statement is explicit: `H` is the
basepoint stabilizer in the recorded finite action, and `phi` is given by its
recorded integer values on the recorded Schreier generators.

The output must not replace this conclusion by any of the following without
additional evidence:

- `K` is a manifold;
- `ker(phi)` is finitely presented;
- the circle map is a locally trivial topological bundle;
- the circle map is smoothable to a smooth fibration;
- the subgroup has minimum possible index.

## 12. Export And Independent Verification

A reproducible full-dimensional artifact should contain:

- Coxeter input, source identity, schema version, and SHA-256 hash;
- the finite action, basepoint, subgroup index, and torsion-free certificate;
- the exhaustive spherical-subgroup catalogue;
- the complete Davis quotient cell poset and incidence hash;
- all quotient walls, parity witnesses, and two-sidedness results;
- one sign and weight per wall and one signed value per oriented edge;
- every rank-two cocycle equation;
- the Schreier transversal, generators, rewritten relators, and source paths;
- raw and primitive values, gcd, and Bezout witness;
- the global quotient-vertex order and every pulling simplex;
- cell-local exact heights, rational offsets, and sign-preservation checks;
- every ascending and descending link with connectivity witnesses;
- collapsibility status and any positive or exhaustive-negative certificate;
- canonical hashes of every stage and the final artifact;
- warnings, unsupported hypotheses, and the exact claim level.

`verifyFullDavisVirtualFiberingCertificate` independently recertifies the
finite action and canonical quotient, rebuilds the compression and complete
cell poset, reconstructs walls, coorientation, wall cocycle, primitive
Schreier character, pulling triangulation, heights, and directed links,
recomputes every content hash and connectivity result, and replays each
exported collapse certificate. Renderer coordinates,
camera state, and screenshots may accompany the artifact, but they never enter
the mathematical checks.

For a serialized promotion, run that replay in a fresh process:

```bash
corepack pnpm exec tsx scripts/run_materialized_fibering.ts \
  --verify-artifact promotion.json \
  --output promotion.replay.json
```

The report must match the theorem-facing source-tree and toolchain manifest
stored by the promotion. The portfolio orchestrator runs this command after
promotion and refuses a nested replay report that has not been reproduced.

### Streamed all-cells Track B adapter

The degree-34,560 compact-5-cube run uses
[`src/fibering/streamedTrackB.ts`](../src/fibering/streamedTrackB.ts) instead
of materializing the complete strict face poset. This does not discard any
Coxeter cells. The generalized-compression certificate commits every rooted
source cell, every `|W_T|`-element fiber, and every proper spherical face-type
map; strict action-rooted replay reconstructs and checks those commitments.
The Track B adapter then streams the full cell set into one compatible global
pulling rule and its exact link one-skeleta. Recursive pulling adds no
vertices, so the quotient's 34,560 action points are the complete vertex set
that must be checked.

The raw wall character may have image `D Z`. This adapter records `D`, the
spanning-tree periods, and a Bezout trace for the associated primitive
character, but it does not divide cell-local height charts by `D`. Instead it
uses

```text
F_c(q) = raw_c(q) + polarity * sign_c(anchor) * q / (4 * degree).
```

This retains integral overlap constants. Since the raw and primitive
characters have the same kernel, a passing directed-link calculation would
still certify finite generation of that kernel. The anchor-dependent offset
also proves `F_(-c)=-F_c`, allowing an exact 512-sign-vector by two-polarity
search of the 1,024 height classes.

The canonical run found a disconnected directed link for every class by
`q7`; its first-failure counts are `[924, 62, 14, 12, 4, 4, 3, 1]`. The strict
batch replay passed. This is a scoped negative result for the recorded global
pulling subdivision and candidate-odd perturbation family, not a
non-fibering theorem. See [`scripts/README.md`](../scripts/README.md) for the
reproduction command and
[`scripts/certificates/README.md`](../scripts/certificates/README.md) for the
content hashes.

## Sources And Scope

- Davis's monograph supplies the Coxeter-cell description of the Davis complex
  and its spherical special subgroups.
- Everitt supplies the finite torsion criterion used for permutation actions.
- Reidemeister--Schreier theory supplies the subgroup presentation.
- Bestvina--Brady Morse theory supplies the link criterion for finiteness
  properties of the kernel.
- Jankiewicz--Wise supplies the wall/coorientation and algebraic-fibering
  context for Coxeter presentation complexes.
- Italiano--Martelli--Migliorini supplies the collapsible-link-to-fibration
  model under additional low-dimensional manifold hypotheses.

Bibliographic details and links are collected in
[`docs/references.md`](references.md). These sources support the mathematical
implications. A particular compact-5-cube run is certified only by its own
complete, hash-bound artifact.
