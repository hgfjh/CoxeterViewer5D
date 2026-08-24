# Automatic Torsion-Free Cover Discovery

The cover workflow starts with a Coxeter system, not a hand-written
permutation action:

```text
Coxeter system W
  -> finite quotient rho: W -> Q
  -> subgroup L < Q
  -> pullback H = rho^{-1}(L) < W
  -> certified action of W on Q/L
  -> finite Davis quotient H\Sigma
  -> walls, coorientations, and PL Morse data
```

The discovery backend searches for the middle two lines. It is not a theorem
prover and it does not assume that the first subgroup it finds has minimum
index. Manual finite-action import remains useful for reproducing published
examples, but it is no longer the primary path.

## What Existence Does Not Compute

The Tits representation makes a finitely generated Coxeter group linear in
characteristic zero. Selberg's lemma therefore supplies a torsion-free subgroup
of finite index. This is an existence result. It does not identify the
subgroup, produce its coset action, or give a practical index bound.

The backend must instead construct a concrete finite transitive action and
retain enough exact data to check it independently.

## The Finite Torsion Test

Every finite subgroup of a Coxeter group lies in a conjugate of a finite
spherical special subgroup. A nontrivial finite group contains an element of
prime order. It is therefore enough to test representatives of all prime-order
torsion conjugacy classes coming from the maximal spherical special subgroups.

Let `W` act transitively on a finite set `Omega`, and let `H` be a point
stabilizer. The following conditions are equivalent:

1. `H` is torsion-free.
2. No prime-order torsion witness fixes a point of `Omega`.
3. Every spherical special subgroup `W_T` acts freely on `Omega`.
4. Every `W_T`-orbit in `Omega` has size exactly `|W_T|`.

The final form is the independent certificate used by the app. It is stronger
than checking the simple reflections and avoids enumerating the restricted
permutation group when the action is large.

The action degree must consequently be divisible by every `|W_T|`. The least
common multiple

```text
D = lcm_T |W_T|
```

is a necessary lower divisor for a torsion-free action. It is not sufficient,
and it is not a prediction of the minimum index.

### Compact 5-cube planning data

For the bundled compact hyperbolic 5-cube, the exact catalogue currently has:

- 32 maximal spherical special subgroups;
- 360 prime-order conjugacy-class origins across those subgroups, compressed
  to 186 deterministic shortlex witnesses;
- index divisor `D = 5,760`.

The origin count is the stable mathematical audit trail. An older backend
reported 219 witnesses, but that count depended on GAP's arbitrary choice of
class representatives and varied between fresh processes. The current backend
assigns each finite spherical element a generator-ordered shortlex word, keeps
the map from all 360 origins to the retained witnesses, and binds the cache to
the implementation hash. Changing the source matrix, spherical catalogue, or
backend source invalidates the cache. The cache accelerates a run; it is not
part of the proof unless the selected candidate artifact carries and rechecks
the corresponding hashes.

## The Implemented Strategy Ladder

The finite-image strategy uses the following order. Recognition comes before
subgroup enumeration: asking GAP for all maximal-subgroup classes of a large,
unrecognized permutation group is both expensive and mathematically
uninformative.

1. Build or load the exact spherical and witness catalogue.
2. Probe small congruence images independently, with characteristics `2` and
   `3` included when the Coxeter coefficients permit them.
3. Represent each accepted finite image compactly with Sage and transfer its
   exact source-generator action to an isolated GAP 4.16 process.
4. Recognize the image, certify the recognition, and use subgroup-index
   arithmetic or a complete recognized maximal-subgroup source to discard
   impossible action degrees.
5. Search transitive coset actions `Q/L` only at the surviving admissible
   degrees.
6. Combine useful partial actions by a packed diagonal-orbit search.
7. Use generic GAP low-index subgroup enumeration only as a small-index
   fallback.
8. Recheck the winning action independently before constructing the cover.

Every rung is bounded and journaled. A search stopped by time, memory, module,
subgroup, degree, or prime bounds is reported as incomplete within those
bounds. It is never reported as evidence that no torsion-free subgroup exists.

## Exact Congruence Images

For matrices whose off-diagonal Tits coefficients are integral, the backend
constructs the standard Tits matrices directly over `GF(p)`. This includes the
common `m=2`, `m=3`, and infinite entries and allows characteristics `2` and
`3` to be tested instead of rejecting them by convention. For other finite
labels it constructs the exact cyclotomic model and reduces at prime ideals.

The cyclotomic path enumerates every prime ideal above each requested rational
prime, rather than choosing one factor of the defining polynomial and calling
that "the" reduction. Each residue record includes the ideal basis, norm,
residue degree, field order, and deterministic source hash. Extension-field
generators use a fixed polynomial basis over `GF(p)`, so two runs serialize the
same matrices. The current isolated GAP bridge accepts prime-field matrices;
extension-field residues are still checked in Sage and remain explicit
non-screened sources until an equally exact GAP field-transfer contract is
available.

A residue is accepted only after both checks pass exactly:

1. every generator is an involution and every finite Coxeter relation
   `(s_i s_j)^m_ij = 1` holds in the residue field;
2. the image of every maximal spherical subgroup has its classified order
   `|W_T|`.

The second check proves that the congruence kernel meets every conjugate of a
spherical subgroup trivially. Small or ramified characteristics receive no
special trust; they survive only these same exact checks.

### Kernel certificates and usable covers

An accepted reduction already gives a concrete normal subgroup

```text
K_p = ker(W -> Q_p).
```

If every maximal spherical subgroup maps injectively to `Q_p`, then `K_p` is
torsion-free. The backend now records that conclusion as a **kernel-cover
certificate**. There are three deliberately separate levels:

1. **finite-index kernel**: exact matrices over a finite residue field and the
   complete spherical-injectivity checks prove that `K_p` is normal,
   torsion-free, and finite index, but the exact order of `Q_p` is not yet
   certified;
2. **exact-index kernel**: a verified structural or constructive-recognition
   certificate also proves `|Q_p| = [W : K_p]`;
3. **manageable materialized cover**: ordered generator permutations have
   actually been written and independently checked.

The first level is already a valid existence certificate. It must not contain
an inferred image order. Exact symbolic cell counts begin only at the second
level, and the quotient, wall, and fibering pipelines begin only at the third.
Every level retains the spherical image-order checks, source hashes, and the
materialization boundary.

That certificate does not make the cover usable in the viewer. Constructing
`K_p\Sigma`, its Schreier presentation, or its walls needs an explicit finite
action on the cosets of a manageable subgroup. The UI therefore reports two
independent statuses:

- **torsion-free cover certified**: an exact finite-field congruence kernel or
  a checked coset stabilizer proves a torsion-free finite-index subgroup; its
  exact index is reported separately when known;
- **usable finite cover materialized**: the ordered generator permutations
  have been written and independently checked, so the Davis quotient can be
  built.

The wall and fibering controls remain disabled after the first status alone.
This prevents an existence certificate of very large index from being mistaken
for a quotient that has actually been constructed.

The finite image is held as a Sage matrix group. For the compact 5-cube in
supported odd prime characteristics, the preferred route bypasses generic
`recog`: GAP changes the invariant form to the standard split form, checks
derived generators with `CM_InOmega`, proves a prescribed-order GenSS chain,
and stores straight-line programs for standard Omega generators. A fresh
process replays those words and the index-two outer-coset checks. The exact
image order is promoted only after that replay. Generic recognition remains a
fallback for finite images without this direct certificate; its `IsReady`
status alone never certifies an order. Subgroup-index screening stays in the
exact matrix representation, and a permutation model is created only if a
target index survives. Characteristic two uses
the certified compact `3 + 119` point model needed by its structural and
table-of-marks calculations. When an action is materialized, GAP uses a base
and strong generating set (BSGS), its standard compact form for group, orbit,
and subgroup operations. The compact permutation degree is an implementation
detail; it is not the index of the desired cover.

## Recognition Before Subgroup Search

Recognition is separated from Sage by a narrow, hashed action-transfer
boundary. Sage writes the compact permutation rows of every source Coxeter
generator, together with the permutation degree, expected image order, source
matrix digest, and transfer-schema version. The transfer hash covers all of
those fields. The isolated GAP process reconstructs the permutations and
checks the hash, bijectivity, generator orders, Coxeter relations, generated
group order, and agreement with the source-generator ordering before it is
allowed to attach a structural name or use a subgroup catalogue.

This boundary matters because equal group orders are not group
identifications. A name such as an orthogonal group is accepted only after an
explicit isomorphism or a recognition certificate whose hypotheses are
rechecked. Likewise, a list of maximal subgroups is treated as complete only
when it comes from a complete table of marks or from an applicable recognized
classical-group routine with a documented completeness range.

The policy is fail-closed. If the transfer hash fails, a required GAP package
is absent, recognition is inconclusive, or the available subgroup catalogue is
not known to be complete, the corresponding degree screen is recorded as
`incomplete`. The backend does not silently fall back to
`MaximalSubgroupClassReps` on the unrecognized root group, and it does not turn
an incomplete screen into a nonexistence statement.

### The compact 5-cube mod-2 image

The accepted characteristic-two image has order `2,368,880,640`. Its exact
degree-3 action has image `S3` and kernel `B` of order `394,813,440`; its exact
degree-119 action has image of order `394,813,440` and kernel `A` of order `6`.
The kernels commute, intersect trivially, and generate the full image. The
kernel `A` is identified as `S3`. The derived subgroup of `B` is explicitly
identified with the simple group `O8^-(2)`, while `B` itself is identified with
the index-two extension `O8^-(2):2`. Thus the certified structure is

```text
Q_2 is isomorphic to S3 x (O8^-(2):2).
```

The extension suffix is essential. It would be wrong to replace the second
factor by the simple group `O8^-(2)` merely because that simple group appears
as its derived subgroup.

There is a second subtlety. Subgroups of a direct product need not be products
of subgroups. Goursat's lemma describes a subgroup using projections
`A_0 <= S3` and `B_0 <= O8^-(2):2` together with a common quotient `C`; its
index is

```text
[S3 : A_0] [O8^-(2):2 : B_0] |C|.
```

Both factors have a quotient of order two, so diagonal fiber-product subgroups
over this common `C2` really can occur. Any index argument that ignores this
common quotient is incomplete.

TomLib's complete table of marks for the simple subgroup `O8^-(2)` contains
5,351 subgroup classes. Among its subgroup indices at most `23,040`, the only
index not divisible by `17` is `1`. Combining that complete fact with the
normal structure of `O8^-(2):2`, the subgroup and quotient lattice of `S3`,
and the common-`C2` cases from Goursat's lemma gives exactly

```text
{1, 2, 3, 4, 6, 12}
```

as the subgroup indices of `Q_2` not divisible by `17` in the relevant range.
The spherical lower divisor is `5,760`, so the candidate degrees through
`23,040` are `5,760`, `11,520`, `17,280`, and `23,040`. None is divisible by
`17`, and none belongs to the displayed set. Consequently the mod-2 image has
no subgroup of any requested candidate index. This eliminates mod 2 as the
source of a cover in the current range; it does **not** prove that the Coxeter
group has no torsion-free subgroup of one of those indices through another
finite image.

The search no longer stops at those four historical targets. It enumerates
every multiple of `5,760` through the configured maximum. TomLib supplies all
5,351 subgroup classes of the normal simple factor. For each required index,
the backend constructs every contained or outer-surjective subgroup of
`O8^-(2):2` from transporter and normalizer-quotient data. It then combines
these with every subgroup of `S3` using all common-quotient subdirect products.
Every failed catalogue or subdirect operation becomes an explicit resumable
frontier; it cannot silently disappear from a completed row.

Prime-order witness intersections are tested in the compact 122-point image
before any large coset action is constructed. A survivor would cross the
backend boundary as content-addressed compact subgroup generators, after which
the independent evaluator would build `Q/L` and check that every spherical
restriction has regular orbits.

The exact run through `576,000` is complete for all 100 multiples of `5,760`:

```text
classification                 degree rows   exact subgroup classes
impossible                              96                         0
materialized and rejected               4                        45
```

The four non-impossible rows are `97,920`, `195,840`, `293,760`, and
`391,680`, with respectively `10`, `9`, `14`, and `12` exact subgroup classes.
Every class contains a conjugate of a supplied prime-order spherical torsion
witness. An independent degree-97,920 audit separately recovers the same ten
classes from the four required extension indices and eight Goursat rows. Thus
the mod-2 image contributes no torsion-free transitive action through
`576,000`. This is a complete statement about that finite image and range, not
about other congruence images or diagonal/composite actions.

### The GF(3) replay certificate and degree ledger

The characteristic-three calculation has a precise promotion target:

```text
Q_3' = Omega^+(10,3),          [Q_3 : Q_3'] = 2.
```

That formula is **not** accepted merely because a previous GAP process printed
the expected orders. The reusable certificate must contain enough evidence to
check the identification again:

- the ordered `GF(3)` source matrices and their Coxeter-matrix binding;
- the preserved nondegenerate split form;
- a change of basis to the documented standard split orthogonal form;
- either a `recog` tree whose `IsCorrect` check passes or an independently
  proved stabilizer chain of the prescribed exact order;
- standard `Omega^+(10,3)` generators and replayable straight-line programs
  relating them to the transformed derived generators;
- a representative of the outer coset, together with the index-two checks;
- SHA-256 hashes of the source, representation, verifier, and pinned GAP
  toolchain.

`scripts/mod3_structural_certificate.py generate` builds this artifact.
`replay` first checks every hash against the current source and implementation,
then asks GAP to replay the stored form, basis, SLP, outer-coset, and degree
evidence. Promotion requires both `status: "verified"` in the artifact and a
successful replay. An `unknown` or `failed` field leaves the corresponding
mathematical statement unproved.

The checked artifact at
`scripts/certificates/torsion-free/compact_5_cube_mod3_structural_certificate.json`
is `verified`. GAP proves containment in the standard `Omega^+(10,3)` with
`CM_InOmega`, constructs a proved GenSS stabilizer chain of the prescribed
exact order

```text
1,289,512,799,941,305,139,200,
```

and supplies replayable SLPs for the two canonical standard generators. Those
SLPs prove the reverse containment. The outer reflection is then checked to
preserve the form, lie outside Omega, normalize Omega, and represent the
index-two coset. Independent replay reconstructs these facts from the stored
matrices and words. Generic `recog` exceeded its strict diagnostic time bound;
its `unknown` status is recorded but is not part of the equality proof.

Once the structural certificate passes, the same artifact screens all 100
multiples of `5,760` through `576,000`. Let `N = Q_3'` and let `L <= Q_3` have
index `d`. There are two cases:

```text
L <= N:       d = 2 [N : L],
LN = Q_3:     d = [N : L intersect N].
```

Every proper `L intersect N` lies in a maximal subgroup of `N`. The complete
dimension-ten output of `ClassicalMaximalsGeneric("O+", 10, 3)` therefore gives
a necessary maximal-index divisibility test for `d` or `d/2`. A target rejected
by that exact test is recorded as impossible. If a target survives, the search
recurses only into compatible maximal families and checks contained subgroups,
outer lifts, and index-two extension cases. A degree row may say `impossible`
only when all of those required branches are complete; otherwise it remains
`unknown` with its unresolved frontier recorded.

For this image, none of the complete root maximal-subgroup indices divides a
target `d` or `d/2`. All 100 rows are therefore certified `impossible` at the
root sieve, and no recursive subgroup branch is needed. This ledger is a
statement about subgroups of the named finite image, not a nonexistence theorem
for the Coxeter group or for composite actions.

### Residue images and the partial-module portfolio

The portfolio combines mod-2 data with exact searches in characteristics `3`,
`5`, `7`, and `11`. For coefficient fields larger than `Q`, the Sage worker
enumerates every eligible prime ideal above the requested rational prime. A
small residue field from a nontrivial prime ideal can be useful even when the
rational-prime image is not. Each residue first has to pass exact Coxeter
relations and injectivity on every maximal spherical special subgroup.

Odd-characteristic images stay in their matrix representation while GAP checks
the preserved form, recognition evidence, group order, and applicable
classical maximal-index arithmetic. The enormous natural point action is not
built merely to reject an index. A surviving index is still only a subgroup
search target. If a bounded coset action is constructed, it is stored as a
**partial module** with its exact torsion-witness coverage, action degree,
stabilizer provenance, packed generator rows, and SHA-256 hashes.

`scripts/run_finite_image_portfolio.py` coordinates the two-stage search:

1. run the mod-2 seed and characteristics `3`, `5`, `7`, and `11`, including
   eligible prime-ideal and extension-field residues emitted by the Sage
   backend;
2. admit only one recognition-heavy worker at a time, while four to six light
   threads validate and seal completed artifacts;
3. merge every compatible partial module into content-addressed storage;
4. search the admitted combinations with packed witness masks, all bounded
   transitive diagonal orbits, and available double-coset data;
5. only for a witness-free survivor, rerun the solver in bounded
   materialization mode, stream the complete generator rows, and independently
   replay permutation shape, involutions, Coxeter relations, and every stored
   torsion witness;
6. hand that action to the independent TypeScript promotion gate, which
   recomputes the complete spherical-subgroup plan and spherical freeness before
   constructing `H\Sigma`;
7. replay the promotion in a second verifier-only process, rebuilding every
   theorem-facing object from the finite action; and
8. only after those checks pass, construct the full Davis quotient and run the
   wall-coorientation, Schreier, pulling-subdivision, directed-link, and
   collapsibility pipeline.

The resulting materialized-action record is still not a cover certificate. Its
independent replay establishes a complete witness-free permutation action, but
the automatic promotion stage additionally checks that every spherical
restriction is a regular orbit of size `|W_T|`. Only that spherical-freeness
certificate may be used to build `H\Sigma`. A resource cap or missing Node
runtime leaves promotion `incomplete`; it is not a failed mathematical check.
No-survivor runs never enter materialization or promotion.

Matrix-only does not mean constant-time. Recognition and subgroup arithmetic
can still outlast a laptop search window. Timeouts, missing residue support,
byte limits, and unfinished composite frontiers produce
`incomplete-no-survivor`; they do not show that no useful quotient exists. A
`complete-no-survivor` result is complete only for the artifact's recorded
primes, ideals, modules, combination bounds, degrees, and solver family.
It is emitted only when every scheduled characteristic `2,3,5,7,11` worker
has an explicit bounded-complete terminal record, every emitted module
catalogue is complete in its stated scope, and the composite solver exhausts
its stated bounds. A timed-out odd-prime worker does not invalidate partial
modules already found, but it forces `incomplete-no-survivor`; a successful
process exit by itself is not mathematical completeness evidence.

## From A Finite Image To A Cover

Fix an accepted quotient `rho: W -> Q`. For each searched subgroup `L < Q`, the
backend constructs the right-coset action `Q/L`. Pulling `L` back gives

```text
H = rho^{-1}(L),          [W : H] = [Q : L] = |Q/L|.
```

The candidate is considered only when its degree lies within the recorded
bounds and is divisible by the spherical lower divisor. Partial modules used
later in a product may have smaller degrees; they are not themselves claimed
to be torsion-free covers.

For recognized finite images, a complete table of marks records the fixed-point
marks of subgroup conjugacy classes, or an applicable classical-group routine
supplies the relevant maximal families. The backend filters their indices
before constructing coset actions. It does not ask GAP to enumerate the
maximal subgroups of a large unrecognized root group. Natural orbits from the
compact BSGS model remain useful as inexpensive partial modules. An optional
permutation character records fixed-point counts by conjugacy class and
provides a reproducible diagnostic, but it does not replace the
spherical-orbit certificate.

For each `Q/L`, the backend checks:

- the source-generator permutations are bijective involutions;
- every finite Coxeter relation holds;
- every canonical compact-cube witness has the recorded fixed-point count,
  with all 360 prime-order class origins accounted for;
- for a passing candidate, every `W_T`-orbit has size `|W_T|`.

The final check is the primary torsion-free certificate. The witness check is
an independently hashed search diagnostic and a useful cross-check, but the
launcher does not treat an externally generated witness list as the root of
the proof.

Partial transitive modules are retained for Everitt-style composite actions
only when their degree divides at least one requested final degree. This loses
no requested diagonal orbit: projection from a diagonal orbit onto a
transitive factor is surjective with constant-size fibers, so the factor
degree must divide the diagonal-orbit degree. The filter is especially useful
for large natural actions that cannot participate in the requested range.

## Packed Composite Actions

A partial action can eliminate some torsion witnesses without eliminating all
of them. Given actions `Omega_1, ..., Omega_k`, the group acts diagonally on
their Cartesian product. A witness has no fixed point in the product whenever
at least one factor has no fixed point for it.

The composite solver does not allocate the full Cartesian product. It uses:

- packed witness bitsets;
- rarest-witness branching;
- exact duplicate and dominance pruning;
- incremental orbit intersections;
- all diagonal orbits of each selected product;
- double-coset data for two-factor products (the diagonal orbits of
  `Q/L x Q/M` correspond to double cosets `L\Q/M`);
- packed, memory-mapped permutation rows with verified lengths and hashes.

Every surviving orbit receives fresh relation, transitivity, witness, and
spherical-orbit checks. Factor coverage is only a search heuristic.

The completeness statement is intentionally narrow: within its recorded
bounds, the solver exhausts every admitted factor multiset and inspects all of
its transitive diagonal orbits. It does not prune a factor multiset merely
because its factorwise witness masks fail to cover the catalogue: an
exceptional diagonal orbit can be fixed-point-free even when no factor has that
property. Every orbit is checked from its exact action. The solver makes no
claim outside its recorded factor, degree, Cartesian-point, combination, and
byte limits, and it makes no global minimum-index claim.

### Reusable partial-module catalogue

Every evaluated transitive module is sealed into a content-addressed catalogue
under the finite-image cache. A module record binds:

- source-system, Coxeter-matrix, and witness-catalogue hashes;
- finite-image characteristic, residue field, order, and recognition record;
- action degree and ordered source generators;
- a packed bitset saying exactly which torsion witnesses have no fixed point;
- exact relation/transitivity checks and the SHA-256 hash of its packed rows.

Packed permutation bytes are stored once by content hash. Catalogue union is
byte-aware and rejects stale mathematics, duplicate actions, inconsistent
witness orderings, and truncated blobs. Later prime runs and composite searches
reuse compatible modules without rerunning their coset action, while preserving
the distinction between a **partial module** and a **torsion-free cover**.
Degree divisibility is used only as a necessary filter for a possible diagonal
orbit; every composite survivor is reconstructed and recertified.

## Managed Runtime And Checkpoints

Long searches run through `scripts/discovery_runtime/`.

- On Windows, Sage/GAP inputs, packed rows, and temporary frontiers are staged
  in the WSL Linux filesystem, not under `/mnt/c` or the OneDrive checkout.
- Reusable catalogues and run checkpoints live under
  `~/.cache/coxeter-viewer/torsion-free` inside WSL.
- Four to six lightweight residue probes may run concurrently.
- One memory-heavy Sage/GAP subgroup search runs by default; a second is
  allowed only when the configured byte budget admits it.
- A byte semaphore, rather than a candidate-count guess, controls admission.
- Timeouts and cancellation terminate the complete process group, including
  WSL descendants.
- Checkpoint journals are bound to full input and configuration hashes and use
  a hash chain. A stale checkpoint is refused.
- A maximal-subgroup expansion writes every sibling candidate and recursive
  frontier entry atomically before evaluating the first sibling.
- `candidate found`, `frontier exhausted`, and `minimum proved by the lower
divisor` are separate statuses. Finding a candidate does not pretend that an
  unfinished frontier was exhausted.

Microsoft recommends keeping Linux-tool workloads in the WSL filesystem for
the best file performance. Only final artifacts and manifests are copied back
to the research workspace. Swap can prevent an abrupt out-of-memory failure,
but it cannot make an oversized enumeration fast; the byte budget should keep
normal runs out of swap.

Checkpoints record explored work. They never certify an action. On resume, the
backend reconstructs the relevant group objects and rechecks the hashes and
exact invariants. A restored passing module is recertified before its full
action is emitted again.

## Delayed Materialization

Partial modules are stored as packed unsigned permutation rows plus metadata
and SHA-256 hashes. Candidate and frontier checkpoints contain compact group
descriptors, witness coverage, and spool references. The backend writes full
JSON generator rows only for a candidate that has passed all exact checks. The
app derives Schreier data downstream from that passing action; rejected modules
never pay that cost. This keeps memory and I/O proportional to the active
search rather than to every rejected candidate.

The order of work is deliberate: necessary index arithmetic, then table-of-
marks fixed points, then candidate subgroup reconstruction, then packed coset
rows, then an independent spherical-freeness certificate. Only after that last
certificate does the app build `H\Sigma`, compute walls and coorientations,
derive the primitive Reidemeister-Schreier map to `Z`, triangulate, or test
ascending/descending links and collapsibility.

The final artifact retains:

- the Coxeter input hash and matrix digest;
- all maximal spherical records and the witness catalogue;
- the finite quotient and subgroup provenance;
- the complete source-generator action;
- exact Coxeter-relation results;
- prime-order fixed-point results;
- every spherical regular-orbit result;
- bounds, attempts, checkpoints, commands, and tool versions;
- explicit claims and non-claims.

The TypeScript verifier then repeats the finite-action and spherical-orbit
checks before the viewer may construct `H\Sigma`.

## Two Tracks: A Manageable Cover And The Regular Kernel

The backend keeps two deliberately different representations.

The **manageable-action track** searches for a transitive action `Q/L` within
the configured degree and byte limits. A success contains every ordered
generator permutation. It can therefore build the full Davis quotient, find
all quotient walls, search unrestricted coorientations, construct a primitive
map to `Z`, and check every ascending and descending link.

The **symbolic regular-kernel track** keeps `H = ker(rho)` through exact
deck-group formulas when `|Q|` is too large to enumerate. Its vertices are the
elements `q in Q`, a generator edge is the exact formula

```text
q -> q rho(s_i),
```

and a spherical cell of type `T` is represented by a right coset of
`rho(W_T)`. Spherical injectivity gives the exact count

```text
number of T-cells = |Q| / |W_T|.
```

This representation can avoid writing billions of vertices, but formulas and
cardinality totals alone are not a certificate. A theorem-facing symbolic run
must provide replayable orbit data. In particular, equal represented counts do
not prove that a list of orbit representatives is disjoint or exhaustive.

A positive symbolic fibering result may be promoted without materializing the
regular cover only after all of the following pass exactly:

1. the quotient homomorphism and its kernel are hash-bound, and every spherical
   special subgroup maps injectively;
2. the complete cell-poset orbit catalogue supplies canonical representatives,
   stabilizers, transporters, flags, and replayable disjointness and
   exhaustiveness checks;
3. the wall-orbit partition is complete, and side transport proves every wall
   is two-sided;
4. one selected sign per wall orbit transports to a well-defined sign on every
   actual quotient wall;
5. the signed sum vanishes on every rank-two cell orbit;
6. a complete Reidemeister-Schreier presentation is replayed, every relator has
   value zero, and the generator values have positive gcd;
7. division by that gcd is recorded, together with Bezout coefficients proving
   that the normalized image is all of `Z`;
8. a compatible pulling triangulation records the global vertex order,
   simplex-orbit catalogue, face compatibility, integrated heights, rational
   tie-breaking offsets, and proof that no directed generator edge is reversed;
9. every vertex orbit has a complete link in that subdivision, and every
   ascending and descending link is nonempty and connected.

Collapsibility checks may strengthen the local-link record, but they are not a
substitute for nonempty connected links and are not required for the basic
finite-generation conclusion. Scientific bindings use canonical serialization
and SHA-256; short cache hashes are not certificate hashes.

The coorientation search may deliberately use one sign variable per symmetry
orbit. This changes the interpretation of failure, not the validity of a
positive witness. If the restricted search finds a sign assignment and the
nine replay conditions above hold after transport to all walls, that exported
coorientation is a genuine global witness. If the restricted search finds no
assignment, the result is **inconclusive**: a nonsymmetric coorientation may
still exist. A positive witness does not certify that every unrestricted wall
assignment was searched.

The current repository supplies the symbolic data model and synthetic
promotion tests. It does not yet contain a positive compact-5-cube symbolic
fibering artifact satisfying this entire chain, so no compact-cube fibering
claim is made here.

## Scale Benchmark Before Candidate Materialization

Run the synthetic cover benchmark before committing a large passing action to
the downstream pipeline:

```bash
corepack pnpm cover:benchmark:smoke
corepack pnpm cover:benchmark:tests
corepack pnpm cover:benchmark:scale
```

The scale fixture is a deterministic regular Coxeter action on `103,680`
points. It streams spherical-freeness, cell-poset counts, wall union-find,
coorientation equations, pulling-subdivision bookkeeping, and all local-link
diagnostics into counters and SHA-256 digests. It intentionally retains no
quotient-cell or simplex object graph. On the current development laptop the
recent full runs completed in roughly `202` to `251` seconds with peak process
RSS near `32 MiB`; timing is machine-specific, while the semantic digest and
checks are deterministic. The August 2026 verification run produced semantic
digest `6082353b474cf3d4e538e948cff48b27d8b8ee4d54d7d7db00dfb2be13b2b407`.
This is a scalability test, not evidence that the fixture is a compact-5-cube
cover.

## GAP Low-Index Fallback

`LowIndexSubgroupsFpGroupIterator` remains useful for toy examples and genuinely
small index bounds. It is now the last rung and is capped separately from the
research action-degree bound. Asking generic low-index enumeration to search
blindly to degree `5,760` or beyond is not a practical compact-cube strategy.

GAP's `excluded` words still provide an exact fallback criterion when the
witness list is complete. Its status language remains bounded:

- **found and verified**: a candidate passed the independent certificate;
- **exhausted through N**: this particular complete iterator finished through
  `N`;
- **incomplete**: a resource or user limit stopped it;
- **blocked**: a required runtime or complete witness list was unavailable.

None of the last three statements is a nonexistence theorem.

## Why This Is A CPU Workload

The matrices in the compact examples are small. The expensive work is finite
group recognition, stabilizer chains, subgroup traversal, orbit construction,
hashing, bitset branching, and exact finite-field arithmetic. Sage and GAP
already provide mature CPU algorithms for those operations.

The Intel NPU/OpenVINO stack targets neural-network inference, not exact finite
groups. cuBLAS supplies dense numerical and integer GEMM primitives, not the
required `GF(p)` or extension-field group semantics. Moving 10-by-10 matrices
and irregular subgroup frontiers to a 6 GB GPU would add transfer and custom
kernel costs without addressing the measured bottleneck. GPU work becomes
reasonable only if future profiles show a large, regular finite-field kernel
dominating the runtime. Current profiles do not.

## Operational Expectations

The resource design separates certification from discovery:

- checking a supplied action of degree roughly `5,760` to `23,040` should be a
  seconds-to-minutes task, depending on rank and the witness catalogue;
- constructing and checking a congruence image can take seconds to minutes,
  depending on the compact permutation degree and whether its cache is warm;
- the compact 5-cube mod-2 image is screened by exact recognition and subgroup
  index arithmetic, avoiding a blind traversal of its subgroup lattice;
- the compact 5-cube mod-3 path reuses a structural certificate only after its
  status and replay verify; the checked artifact now certifies the structural
  identification and all 100 degree obstructions through `576,000`;
- discovery is not guaranteed on a laptop.

These are engineering targets, not certificate claims or fixed performance
promises. Artifacts record the actual elapsed time, memory bounds, cache state,
and completed search scope.

## From The Cover To Fibering Data

Once the subgroup action passes, the app can construct the complete finite
Davis quotient `K = H\Sigma`. Wall coorientations give an integral cellular
1-cocycle. The later certification pipeline derives a Reidemeister-Schreier
homomorphism `phi: H -> Z`, checks primitivity, builds the compatible PL
subdivision and height function, and verifies ascending and descending links.

Those are separate claims. A torsion-free action does not itself prove virtual
algebraic fibering, finite generation of `ker(phi)`, a manifold statement, or a
topological bundle.

## Current Scope

Implemented now:

- exact spherical catalogues and prime-order witnesses;
- finite-image-first Sage/libGAP search, including admissible small
  characteristics;
- exact normal congruence-kernel certificates, kept separate from materialized
  cover actions in both artifacts and the UI;
- matrix-only orthogonal recognition and complete classical-maximal index
  screening for supported odd-prime, dimension-ten images;
- a complete TomLib/Goursat sweep of all relevant mod-2 subgroup families
  through degree `576,000`, including outer lifts and nonsplit subdirect
  products, using witness tests before large-action materialization;
- natural BSGS modules and optional permutation-character diagnostics;
- persistent, content-addressed partial-module catalogues with packed witness
  coverage for reuse across finite images and composite searches;
- a bounded residue portfolio over mod `2`, `3`, `5`, `7`, and `11`, including
  eligible prime-ideal residues, with one heavy recognizer and survivor-only,
  byte-bounded action materialization and replay;
- packed composite search over all bounded diagonal orbits;
- hash-bound cache/checkpoint resume and managed WSL process cancellation;
- a separately capped GAP low-index fallback;
- independent TypeScript action and spherical-freeness verification;
- delayed full-action serialization, followed by downstream Schreier
  construction only for passing candidates;
- an exact symbolic regular-kernel model for deck-group orbit calculations,
  with positive-witness promotion hooks and an explicit inconclusive status for
  failed symmetry-restricted searches;
- a streamed 103,680-point scale benchmark for spherical checks, cell posets,
  walls, coorientation, pulling subdivision, and local links.

Established for the recognition-first rewrite:

- the exact compact-5-cube mod-2 identification
  `S3 x (O8^-(2):2)` and the complete classification of every admissible
  degree through `576,000`: 96 impossible rows and 45 torsion-contaminated
  subgroup classes across the other four rows;
- the hashed Sage-to-GAP action-transfer contract and fail-closed recognition
  policy described above;
- the compact-5-cube GF(3) identification
  `Q_3' = Omega^+(10,3)` with `[Q_3:Q_3']=2`;
- its replayed standard-generator SLPs and index-two outer-coset proof;
- its complete degree ledger through `576,000`, with every row rejected by the
  complete dimension-ten classical-maximal index obstruction;
- the compact-5-cube GF(5) identification
  `Q_5' = Omega^+(10,5)` with `[Q_5:Q_5']=2`, proved and replayed without
  generic `recog`;
- the exact GF(5) kernel index
  `27,230,655,539,587,500,000,000,000,000,000` and a complete ledger rejecting
  all 100 admissible degrees through `576,000` inside that finite image;
- the analogous GF(7) identification and exact kernel index
  `104,772,288,945,650,279,285,144,527,564,308,480,000`, proved by a
  prescribed-order GenSS chain and replayed standard-generator words;
- the GF(11) identification and exact kernel index
  `72,282,655,659,789,924,991,879,132,244,787,601,185,792,000,000`, proved
  without the 235,809,410-point natural orbit by combining exact `CM_InOmega`
  containment with a conclusive positive one-sided classical-containment
  check;
- complete GF(7) and GF(11) ledgers rejecting all 100 admissible degrees
  through `576,000` inside those finite images;
- exact negative R1, R2, and same-block two-chord R3 geometric gluing strata at
  degree `5,760`, with their unsearched holonomy scopes stated explicitly.

Not claimed:

- discovery of a manageable compact-5-cube cover by the bounded ladder (the
  repository separately imports and replays an external index-17,280 action,
  and its character double cover of degree 34,560; the accepted congruence
  reductions also certify explicit, generally enormous, normal torsion-free
  kernels);
- a positive symbolic compact-5-cube wall coorientation, primitive Schreier
  map, pulling-Morse certificate, or complete directed-link certificate;
- guaranteed discovery on a laptop;
- completeness beyond the recorded primes, groups, modules, subgroups, bytes,
  degree, and time bounds;
- a minimum-index torsion-free subgroup;
- any fibering or manifold conclusion before the downstream certificates pass.

For commands and runtime setup, see [Tooling](tooling.md). For the papers and
software supporting these steps, see [References](references.md).
