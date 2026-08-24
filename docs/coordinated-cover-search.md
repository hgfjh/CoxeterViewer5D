# Coordinated Search For A Manageable Torsion-Free Cover

The compact 5-cube group already has a certified torsion-free congruence
kernel. Its index is too large to materialize the corresponding Davis
quotient. The practical problem is therefore narrower:

> Find a finite transitive action whose point stabilizer is torsion-free and
> whose degree is small enough for the quotient-cell and fibering pipelines.

The search runs three complementary tracks. They share the same spherical
catalogue and use the same independent promotion test, so a candidate found by
one track is not trusted more than a candidate found by another.

## Why The Degree Is A Multiple Of 5,760

Let `W` be the Coxeter group, let `H < W` be torsion-free, and let

```text
Omega = H\W
```

be the right-coset action. Its cardinality is the subgroup index
`d = [W:H]`. For a spherical subset `T`, the special subgroup `W_T` is finite.
The stabilizer in `W_T` of a coset `Hg` is

```text
Stab_W_T(Hg) = W_T intersect g^{-1} H g.
```

The conjugate `g^{-1} H g` is torsion-free. Its intersection with the finite
group `W_T` is consequently trivial. Thus `W_T` acts freely on `Omega`, every
`W_T`-orbit has exactly `|W_T|` points, and

```text
|W_T| divides d.
```

This holds for every spherical `T`. It is enough to use the maximal spherical
subsets: every smaller spherical special subgroup lies in one of them and its
order divides the containing finite Coxeter-group order. Therefore

```text
D = lcm_T |W_T|
```

divides every torsion-free subgroup index.

For the compact 5-cube, the 32 maximal spherical subsets are the 32 choices of
one facet from each opposite pair. Their types and multiplicities are:

| Count | Type                     | Order |
| ----: | ------------------------ | ----: |
|     6 | `A5`                     |   720 |
|     6 | `A4 x A1`                |   240 |
|     4 | `A3 x A1 x A1`           |    96 |
|     4 | `D4 x A1`                |   384 |
|     4 | `I2(3) x A1 x I2(3)`     |    72 |
|     2 | `A1 x A1 x A1 x A1 x A1` |    32 |
|     2 | `A1 x A1 x A1 x I2(3)`   |    48 |
|     2 | `A1 x A3 x A1`           |    96 |
|     2 | `A1 x I2(3) x I2(3)`     |    72 |

The two decisive orders are

```text
|W(A5)|       = 720 = 2^4 * 3^2 * 5,
|W(D4 x A1)|  = 384 = 2^7 * 3.
```

Their least common multiple is

```text
lcm(720, 384) = 2^7 * 3^2 * 5 = 5,760.
```

Every other order in the table divides 5,760. Hence `5,760 | [W:H]`.
This is a necessary condition, not an existence theorem: it neither proves
that index 5,760 occurs nor predicts the minimum index.

The converse local test is also useful. By the torsion theorem for Coxeter
groups, a point stabilizer is torsion-free exactly when every spherical
special subgroup acts freely. The final certifier therefore checks every
restricted spherical orbit has size `|W_T|`; it does not rely only on the
divisibility sieve.

Everitt gives the same argument in permutation-module language: finite-order
elements are conjugate into finite special subgroups, prime-order classes are
detected by fixed points, and the order of every finite subgroup divides the
degree of a torsion-free transitive module. See Theorem 4, Proposition 1, and
the discussion following Lemma 3 in
[Coxeter Groups and Hyperbolic Manifolds](https://arxiv.org/pdf/math/0205157).

## Three Different Degrees

Three integers can appear in one finite-quotient calculation:

1. A faithful embedding `Q -> S_n` has **permutation model degree** `n`.
2. A transitive action `W -> Sym(Omega)` has **cover degree** `|Omega|`, equal
   to the index of a point stabilizer.
3. A finite quotient `rho: W -> Q` has **kernel index** `|rho(W)|`.

These are not interchangeable. The known characteristic-two quotient of the
compact 5-cube has a faithful `3 + 119` point model, so it gives a map to
`S_122`. Its torsion-free congruence kernel nevertheless has index
`2,368,880,640`, the order of the image. A useful cover search instead seeks a
manageable transitive `Q/L`; its degree is `[Q:L]`.

## Track 1: Structural Finite-Target Synthesis

This track searches for images of the ten Coxeter generators among involution
classes of finite groups. It considers:

- symmetric groups, including involutions with several disjoint transpositions;
- finite Weyl groups and their root reflections;
- a curated `Sp(4,3)` target and explicitly supplied finite classical groups.

Before backtracking, a target is rejected when its order cannot contain every
maximal spherical type or cannot have an image order divisible by 5,760. For
`W(D6)`, `W(B6)`, and `W(E6)`, the global search starts with the spherical
subgroup

```text
T = {g0, g2, g3, g5, g6},   W_T = W(A5) = S6.
```

Every locally faithful map must embed this `S6`. In `W(D6)` and `W(B6)`, GAP
enumerates every complement of the normal sign-change module up to target
conjugacy. In `W(E6)`, it enumerates the complete subgroup-conjugacy-class
lattice and keeps the `S6` classes. For each subgroup class, the search also
enumerates the labeled simple systems modulo its normalizer. This second step
is essential for `S6`: the exceptional outer automorphism supplies a labeled
embedding type that is not obtained by conjugating the ordinary simple
reflections.

The remaining five source generators are extended modulo the pointwise
centralizer of the labeled `A5` tuple. At every step, the backend checks exact
finite pair orders and the exact image order of each completed spherical
subset. Thus one representative from each centralizer orbit is an exact
canonical augmentation, not a heuristic sample.

The current compact-5-cube run is a complete negative result for these three
declared targets:

| Target  | Target order | `S6` subgroup classes | Labeled anchor classes | Completed branches | Solutions |
| ------- | -----------: | --------------------: | ---------------------: | -----------------: | --------: |
| `W(D6)` |       23,040 |                     4 |                      8 |              8 / 8 |         0 |
| `W(B6)` |       46,080 |                     2 |                      4 |              4 / 4 |         0 |
| `W(E6)` |       51,840 |                     2 |                      4 |              4 / 4 |         0 |

Each artifact binds the source file, Coxeter matrix, all 242 spherical pruning
subsets, target declaration, Python and GAP implementations, GAP version, raw
transcript, branch counts, and search bounds. This rules out locally faithful
homomorphisms to these targets. It does not rule out other finite targets or
nonnormal coset actions in larger finite images.

### Normal targets at the first two admissible degrees

The `A5 = S6` anchor also gives a finite classification of normal covers at
degrees `5,760` and `11,520`. If `A` is the anchor image and `K` is its core in
the finite target, normality of `K` in `S6` leaves only

```text
K = 1, A6, or S6.
```

The faithful case `K = 1` reduces to the transitive-group catalogues in block
degrees `8` and `16`. The `K = S6` case is a pullback through
`Out(S6) = C2`; the `K = A6` case is a pullback through
`Out(A6) = C2 x C2`. The search constructs every resulting target up to the
relevant block-group automorphisms, enumerates every `S6` anchor class, and
then performs exact centralizer-reduced extension of the other generators.
This is a classification of normal targets at these two degrees, not of all
transitive actions.

The completed hash-bound runs are:

| Cover degree | Anchor core |                              Target classes | Global tuples |
| -----------: | ----------- | ------------------------------------------: | ------------: |
|        5,760 | `1`         | no degree-8 transitive group of order 5,760 |             0 |
|        5,760 | `A6`        |                                          32 |             0 |
|        5,760 | `S6`        |                                          12 |             0 |
|       11,520 | `1`         |                                1 (`2^4:S6`) |             0 |
|       11,520 | `A6`        |                                         302 |             0 |
|       11,520 | `S6`        |                                          42 |             0 |

Thus there is no normal cover at either of the first two admissible degrees.
This does not exclude a nonnormal subgroup of either index.

### First nonnormal block-amalgam stratum

The direct geometric route fixes the eight regular anchor blocks at degree
`5,760` and adjoins the remaining generators across common spherical
parabolics. The five extension stages have respectively

```text
7, 1, 7, 41, and 41
```

unlabeled incidence types. Scope `R0` uses one sorted-label embedding of each
abstract incidence type and the minimum-root zero-twist equivariant
identification on every overlap orbit. It is finite and exact for those
representatives. A negative `R0` result does not exclude covers with
nontrivial port assignments or overlap holonomy; those are the next strata.

The completed `R0` run retained all seven first-stage `A5`-over-`A4`
incidence types. Every one failed when the forced `K_(8,15)`
`A5`-over-`A3 x A1` residue was glued with the sorted minimum-root zero-twist
port map.
No later incidence stage was therefore reachable in `R0`. This is useful
structural information: any degree-`5,760` cover following this extension
chain must use a noncanonical port assignment or nontrivial overlap holonomy
already at the second gluing stage.

The second gluing has a much larger exact parameter space than the incidence
graph alone suggests. Write

```text
A = W_{0,2,3,5,6}       (type A5, order 720)
C = W_{0,2,4,5,6}       (type D4 x A1, order 384)
P = A intersection C    (type A3 x A1, order 48).
```

There are eight regular `A`-blocks, fifteen regular `C`-blocks, and 120
`P`-ports. The simple incidence graph is `K_(8,15)`, with cycle rank 98. After
dividing by the internal `C wr S_15` frames, but before the residual
centralizer of the first-stage action, the number of possible `g4` rows is

```text
(15!)^7 (105 * 48^8)^15,
```

a 317-digit number. This is why the program does not pretend that a literal
loop over every gluing is feasible.

Five exact diagnostic strata have now been exhausted:

- `R1` enumerates all 210 local `C/P` port orbits, uses the same local orbit at
  all fifteen `C`-blocks, keeps the existing-side ports canonical, and uses
  zero overlap twist. All 210 rows were tested against all seven first-stage
  branches. None satisfied the new `(g4 g7)^3 = 1` relation.
- `R2` keeps canonical ports and changes one overlap map on each of the 98
  chords outside a fixed spanning tree, using each of the 47 noncanonical
  equivariant `P`-maps: `98 * 47 = 4,606` rows, again against all seven
  branches. None satisfied `(g4 g7)^3 = 1`.
- `R3` changes exactly two fundamental chords that share one non-root
  `C`-block. There are `14 * binomial(7,2) = 294` such supports and `47^2`
  nonidentity overlap-map pairs per support, hence 649,446 rows. For each
  support and first-stage branch, an alternating-hexagon failure was found
  outside the mutable `C`-block. Those immutable witnesses reject all
  4,546,122 branch configurations, so no row needs to be materialized. The
  sealed run completed in 11.36 seconds with no survivor.
- `R4` checks all 210 local `C/P` classes on the root `C`-residue. In every
  first-stage branch it finds a failed `(g4 g7)^3` walk whose three `g4`
  inputs stay in that residue. The standard tree fixes all root-residue
  overlap maps, so the witness is independent of every non-tree chord
  assignment and every choice on the other fourteen `C`-residues in this
  fixed-tree map slice. This closes `210^15 * 48^98` slice configurations with
  canonical existing-side ports. In particular, it includes all
  different-block two-chord supports,
  all supports of size at least three, and nonuniform new-residue port classes.
  The sealed replay checked 1,470 branch witnesses in 3.14 seconds with no
  unresolved root class.
- `R5` varies the existing-side skeleton by one transposition after fixing the
  first A-block as gauge. There are `7 * binomial(15,2) = 735` skeletons. The
  637 transpositions not involving the root leave the `R4` residue unchanged.
  For each of the 98 root-changing transpositions, the program checks all 210
  root local classes and all seven branches. Every case has a root-contained
  failure, while choices away from the root and all 98 non-tree chord-map coordinates
  remain arbitrary. The sealed replay checked 145,530 branch witnesses in
  109.06 seconds with no unresolved configuration.

The first-stage residual centralizers have orders `2,1,1,1,1,1,1`; their
actions on all 120 ports and root coordinates are stored in the artifacts.
These results rule out every non-tree chord-map assignment and every
nonuniform new-residue port-class assignment in the fixed standard-tree map
slice when the existing-side skeleton is canonical, plus the analogous
distance-one slice. They do not close the full local torsor factor
`24^15 * 48^105`, nor existing-side permutations requiring two or more
transpositions. Because the existing-side gauge is only the residual
first-stage centralizer, none of these results is a `Hom(F_98,P)/P`
classification.

`R6` canonically generates all 266,560 existing-side skeletons at total
transposition distance two. It compresses them to 4,215 exact root signatures
with multiplicities, then reuses the local relation propagation against all
210 `C/P` classes and all seven first-stage branches. In the fixed-tree
minimum-root map slice, 265,662 skeletons are excluded and 898 remain open.
`R7` reconstructs the unique support-two skeleton behind each of those 898
signatures and propagates the same `(g4 g7)^3` triangle condition across all
fifteen `C`-residues. It exhausts all 3,001 viable signature/branch cases in
630,210 canonical class attempts, with no surviving `g4` row and no resource
limited case. Thus the distance-two fixed-tree minimum-root map slice is now
closed. This is not an exhaustion of the full local torsor factor.

The companion full-frame engine anchors one local frame and searches the exact
`S_7 x P^7` coordinates with a rollback triangle test. It is checkpointed in
prefix windows because that deeper space is much larger. The stored depth-5
window checks the first 100 canonical frame prefixes in every one of the 29,505
root-signature/branch cases. It visits 132,817,959 exact search nodes, rejects
128,066,102 relation branches, and retains 93 locally replayed frame seeds.
The replay checks one 384-point residue; it is not a replay of a complete
5,760-point `g4` row. This is a completed window, not exhaustion of
`S_7 x P^7`.

`R8` is the bounded candidate-first continuation of those 93 seeds. The seed
catalogue is extracted from the ignored 16 MB checkpoint into a compact,
hash-bound artifact so a clean checkout does not have to repeat the prefix
window. The ordered stage stabilizer and the branch-6 fixed-gauge centralizer
are both trivial, so no further symmetry quotient of the 93 seeds is
justified.

For each seed, `R8` inserts its 192 exact `g4` edges and propagates the
contracted-triangle form of `(g4 g7)^3=1`. A forced edge must stay inside one
of the fifteen prospective `C`-residues. The run learns ten reusable boundary
clauses: each clause records the local port assignments that force a specific
edge and rechecks its residue ownership in every seed. Ten direct seed replays
and 734 clause hits exclude all 93 recorded seeds in 744 search steps. No
adjacent residue had to be generated. This is a useful exact obstruction for
the recorded seed family, not an exhaustion of the unsearched full-frame
prefixes or the full second gluing.

Run the two strata with:

```bash
corepack pnpm cover:search:block-amalgam:r1:5760
corepack pnpm cover:search:block-amalgam:r2:5760
corepack pnpm cover:search:block-amalgam:r3:5760
corepack pnpm cover:search:block-amalgam:r4:5760
corepack pnpm cover:search:block-amalgam:r5:5760
corepack pnpm cover:search:block-amalgam:r6:5760
corepack pnpm cover:search:block-amalgam:r7:5760
corepack pnpm cover:search:block-amalgam:r6:full-frame
corepack pnpm cover:search:block-amalgam:r8:extract-seeds
corepack pnpm cover:search:block-amalgam:r8:5760
```

A surviving assignment must satisfy all finite Coxeter relations and generate
the claimed image. A normal-kernel claim additionally requires every maximal
spherical subgroup to have its exact classified image order.

Target screening is only a sieve. Passing an order test is not evidence that a
homomorphism exists, and satisfying pair relations is not enough to certify a
torsion-free kernel.

## Track 2: Nonnormal Coset Actions In Finite Images

The next bounded search asks for subgroups `L < Q` of exact finite images and
tests the transitive actions `Q/L`. These point stabilizers need not be normal.
The characteristics 2 and 3 stages use index arithmetic, tables of marks,
maximal-subgroup data, and exact coset actions only for surviving classes.

The geometric input is used as a certificate, not as a drawing heuristic: the
32 cube vertices give the maximal spherical restrictions, and the 186
prime-order torsion witnesses give fixed-point obstructions. A candidate is
accepted only when every restricted spherical orbit is regular. Exhaustion is
always qualified by the named finite images and maximum degree.

The current characteristic-2/3 campaign is complete through degree `576,000`
for its two declared finite images and finds no torsion-free transitive action.
It retains one degree-`3` characteristic-two partial module, which eliminates
four of the 186 torsion witnesses and is therefore still useful to the
composite search. The sealed aggregate is
`scripts/certificates/torsion-free/compact_5_cube_nonnormal_p2_p3_through_576000.json`.
This does not exhaust nonnormal actions in other finite images.

### Characteristic 5 after bypassing generic recognition

The generic `recog` route was the bottleneck, not matrix size or integer
overflow. The replacement certificate transforms the preserved form to the
standard split form (allowing the exact nonzero similitude multiplier that
does not change its orthogonal group), checks every derived generator with
`CM_InOmega`, and proves equality with `Omega^+(10,5)` using a GenSS chain of
the prescribed exact order. Stored straight-line programs express the
standard Omega generators in the source-derived generators, and a fresh GAP
process replays them. The first source reflection supplies the verified outer
coset, so the complete image is the index-two extension.

The resulting exact kernel index is
`27,230,655,539,587,500,000,000,000,000,000`. The complete dimension-ten
`ClassicalMaximals` catalogue has 31 root maximal classes; its smallest index
is `488,906`, which is not divisible by `5,760`. The hash-bound ledger rejects
all 100 admissible degrees through `576,000`. This closes that bounded search
inside the characteristic-five image while retaining its enormous normal
kernel as a valid exact-index torsion-free existence certificate.

### Characteristics 7 and 11

The characteristic-seven artifact uses the same constructive GenSS/SLP proof.
Its exact image is `Omega^+(10,7):2`, its normal-kernel index is
`104,772,288,945,650,279,285,144,527,564,308,480,000`, and its complete
maximal-index ledger rejects all 100 requested degrees.

At characteristic eleven, a constructive stabilizer chain would first meet a
natural orbit of `235,809,410` points. The backend therefore combines exact
`CM_InOmega` upper containment with the specialized one-sided
`RecogniseClassical` test. A positive `isOmegaContained` answer is conclusive;
a negative answer would remain unknown. The seeded result replays positively,
identifies `Omega^+(10,11):2`, and gives exact kernel index
`72,282,655,659,789,924,991,879,132,244,787,601,185,792,000,000`. Its
complete ledger also rejects every requested degree through `576,000`.

These are three finite-image-specific obstructions. They neither construct a
manageable cover nor exclude noncongruence or composite actions.

## Track 3: Odd-Prime And Everitt Composite Modules

A transitive action that is not torsion-free can still be useful. For each
partial module the backend records exactly which prime-order torsion witnesses
act without fixed points. It then searches multisets of modules, including
repeated copies, and partitions their complete Cartesian product into every
diagonal orbit.

For two factors these orbits are indexed by double cosets of the two point
stabilizers. The all-zero or distinguished orbit is not privileged: another
double-coset orbit may have a smaller stabilizer intersection and be
torsion-free. For more factors the same operation is iterated. A resulting
orbit is accepted by this track only after pointwise replay of the complete
prime-order witness catalogue. Before viewer promotion, the independent
materialized-action certifier also checks every spherical orbit directly.
Witness-set coverage merely orders the search.

This is the computational form of Everitt's permutation-module construction;
see Section 3, especially Lemmas 1 and 2, of [Brent Everitt, _Coxeter Groups
and Hyperbolic Manifolds_](https://arxiv.org/abs/math/0205157).

### Order-five-first campaign

The current campaign starts with every nonzero character `W -> C2`. The odd
Coxeter graph has two components, so there are exactly three such actions.
Together with the previously retained degree-`3` action, they make 123 of the
186 prime-order witnesses fixed-point-free somewhere. The 63 uncovered
witnesses have orders

```text
order 2: 33
order 3: 19
order 5: 11
```

All eleven order-five witnesses survive. A bounded conjugacy-reduced search
therefore anchors faithful `A4` and `A5` restrictions in `S5` and `S6`,
including both the ordinary and exceptional-outer `S6` classes. The declared
subset-action families are exhausted with no compatible global homomorphism.
This is a negative result only for those families, not for all partial
modules.

The parallel characteristic-two track is more productive. GAP reconstructs
the 45 subgroup classes in the certified 122-point image and computes each
fixed-coset vector by

```text
|Fix(g on Q/H)| = |C_Q(g)| |g^Q intersect H| / |H|.
```

No action of degree at least 97,920 is materialized for this calculation. All
45 vectors are exact; 20 remain on the degree/coverage Pareto frontier, and
their union covers all 186 witnesses. The certificate retains compact
122-point generators for every stabilizer so later double-coset intersections
can also stay symbolic.

Complete union coverage opens the composition gate, but it does not itself
construct a torsion-free action. There is also an exact degree obstruction in
the first requested range. A diagonal orbit based on `Q/H` projects onto
`Q/H`, so its degree is a multiple of `[Q:H]`. If the two degrees are equal,
that projection is a bijection and the added factor cannot improve the
fixed-point-free witness set. Since every characteristic-two module is
individually contaminated and the smaller modules cover only 123 witnesses,
no composite survivor can have degree at most 97,920. The first arithmetic
frontier at which two degree-97,920 actions can improve one another is
195,840.

The symbolic composite backend attacks that frontier by intersecting compact
stabilizers in the 122-point ambient image. It enumerates double cosets before
constructing a coset action and materializes 195,840 permutation rows only if
an intersection is fixed-point-free for all 186 witnesses. The recorded
two-minute run reached its wall-clock bound without completing the
double-coset ledger. Thus 97,920 is an exact exclusion for this module family,
while 195,840 remains open. The timeout is not a nonexistence result.

Run the two evidence tracks and the gate with:

```bash
corepack pnpm cover:search:partial-modules:order5
corepack pnpm cover:search:partial-modules:mod2
corepack pnpm cover:search:partial-modules:compose
corepack pnpm cover:search:partial-modules:integrate
```

To repeat both evidence tracks, the symbolic-composite frontier, and the
independent degree-5,760 CSP fallback as one campaign, run:

```bash
corepack pnpm cover:search:partial-modules:campaign
```

These commands print short decisions. Full fixed-point vectors, compact
stabilizers, hashes, and non-claims are written under
`scripts/certificates/torsion-free/`.

## Supplemental Geometric Local Development

The compact cube supplies 32 vertex constraints. Each vertex chooses one
facet from each of five opposite pairs, and its five incident reflections
generate a finite rank-five special subgroup. A proposed transitive action is
locally valid at that vertex exactly when this subgroup has only regular
orbits.

The geometric track computes the labeled diagram automorphism group and uses
it to group equivalent vertex constraints. Its direct bounded engine searches
involutions in small symmetric targets, prunes assignments with finite
relations and spherical image orders, enumerates every subgroup of each
surviving finite image, and checks the resulting transitive coset actions.
This includes nonnormal point stabilizers, not merely congruence kernels.

The in-process engine has an explicit small-target scope. For the ideal
all-`m=3` 3-cube it exhausts the default `S2` through `S4` search and finds an
index-`6` `S3` kernel: the two opposite facets in each pair map to the same
transposition, and adjacent facets map to distinct transpositions. Every
finite `I2(3)` subgroup therefore maps isomorphically to `S3`. The familiar
index-`24` `S4` kernel remains a valid golden example, but it is not minimal.

For the compact 5-cube, whose first admissible degree is `5,760`, the track
does not disguise an infeasible in-process permutation search as progress. It
emits a hash-bound GAP/Sage handoff with all 32 local developments, diagram
automorphisms, spherical constraints, admissible degrees, and a required
completeness declaration. Any returned action is replayed by the same local
validator before promotion.

Facet incidence does not itself construct a cover. The generators must still
define global permutations satisfying every Coxeter relation. Geometry makes
the constraint system smaller and gives an early local-freeness test; the
independent spherical and witness certificate remains the promotion gate.

## Promotion Gate

All tracks stop at the same boundary. Before an action can enter the
fibering pipeline, the repository must have:

1. complete generator permutations for one transitive action;
2. exact finite Coxeter relation checks;
3. regular-orbit checks for every maximal spherical subgroup;
4. a hash-bound source, witness catalogue, and action artifact;
5. an independent replay through the in-repo torsion-free certifier.

Only then does the app construct the full Davis quotient and start the
lawful-subcomplex and full-Davis fibering tracks.
