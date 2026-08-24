# Scalable exact height-cone certificates

The in-process solver in `streamedHeightArrangement.ts` uses exact
Fourier--Motzkin elimination and intentionally stops at rank four. That is a
useful small-rank implementation, but it is not an appropriate algorithm for
a substantially larger eventual character lattice: intermediate inequalities
can grow exponentially even before the arrangement faces are considered.

This generic cone layer does not infer `rank H^1`. In the compact 5-cube
calculation the separate complete-lattice certificate supplies rank 19 and is
embedded and replayed before the cone search begins.

## Do not enumerate the whole arrangement

With `M` distinct central hyperplanes in rank `r`, even the generic number of
open chambers is on the order of

```text
2 * sum_{k=0}^{r-1} binomial(M-1,k).
```

Lower-dimensional zero-sign faces make the complete ternary face poset larger.
Consequently a theorem-facing calculation should not first construct every
face and only then inspect links.

`scalableHeightCone.ts` instead records a lazy ternary decision tree. At a
feasible cone, the directed-link evaluator may do exactly one of three things:

1. request the sign of another height-difference normal;
2. attach a source-bound obstruction which is valid throughout the current
   cone; or
3. retain the cone as a survivor for a complete link check.

A requested normal produces all three branches `-`, `0`, and `+`. An
infeasible branch ends immediately with a Farkas certificate. A valid link
obstruction ends the whole current cone without deciding irrelevant normals.
If an alleged obstruction depends on an unresolved sign, its verifier must
reject it and the evaluator must split that normal first. Thus the artifact is
exhaustive by induction over the recorded tree, not by materializing the full
hyperplane arrangement.

This method can still be exponential in a worst case. Its advantage is that
the cost is governed by normals actually needed before a directed-link
failure, while exact infeasibility and early local obstructions prune entire
subtrees.

## Why the central arrangement is exact on integral characters

Let `N` be the quotient degree, let `q` be the current point and `r` the other
point of a genuine germ, and let `n` be that germ's integral coefficient form.
Thus `q,r` lie in `{0,...,N-1}`, `r != q`, and

```text
0 < |r-q| < N.
```

For an integral character vector `w` and tie polarity `sigma` in `{-1,+1}`,
the cleared height difference is

```text
D = 4*N*dot(n,w) + sigma*(r-q).
```

This gives the integral-sign lemma. Since `dot(n,w)` is an integer:

- if `dot(n,w) != 0`, then `|4*N*dot(n,w)| >= 4*N > |r-q|`, so
  `sign(D) = sign(dot(n,w))`;
- if `dot(n,w) = 0`, then `D = sigma*(r-q)`, so the fixed global point order
  supplies the sign.

In particular, `D` never vanishes at an integral lattice point. Therefore the
central raw hyperplanes `dot(n,w)=0`, including all their lower-dimensional
intersections, govern the integral characters exactly; the tie rule resolves
precisely the raw-zero germs. This also covers an identically zero form `n=0`,
for which every integral character uses the tie term.

This is a lattice statement, not an identification of real arrangements. For
a real vector `x`, the equation

```text
4*N*dot(n,x) + sigma*(r-q) = 0
```

is generally a translated affine wall distinct from `dot(n,x)=0`. The global
normal catalogue does not claim to enumerate those translated real affine
walls; it records the central raw arrangement that is exact for integral
characters.

## Exact feasibility oracle

For canonical assignments `(a_i,s_i)`, put

```text
B_i = s_i a_i when s_i is +1 or -1,
E_i = a_i when s_i is 0.
```

The relatively open homogeneous cone is

```text
B x > 0,  E x = 0.
```

For a finite family this is feasible exactly when the rescaled rational system
`B x >= 1, E x = 0` is feasible. The external Sage/PPL worker returns one of:

- a rational feasible point, cleared to a primitive integral witness; or
- rational multipliers `lambda >= 0` and unrestricted `mu` satisfying
  `sum(lambda)>0` and `lambda B + mu E = 0`.

The latter is a Farkas obstruction to strict feasibility. The TypeScript
replayer recomputes the equality rank, every witness dot product, every
multiplier sign, and the exact rational linear combination with `BigInt`
arithmetic. Solver status text is not a certificate.

The request binds the source, rank, ordered sign constraints, and their digest.
The response binds the request hash, solver identity/version/algorithm, a
transcript digest, and the primal or dual certificate. Cone-cover nodes also
bind their child hashes, census, prune-proof digests, and survivor digests.
The transcript digest is provenance metadata, not a proof log; soundness comes
from replaying the explicit primal point or Farkas identity.

## External worker

`scripts/sage_exact_height_cone.py` is the reference exact oracle. It accepts
one canonical request JSON and creates one certificate JSON. PPL discovers a
point or normalized Farkas vector; independent replay remains mandatory.

For a lazy cover, `--server` switches the worker to a one-request/one-response
JSON Lines protocol and keeps Sage resident. The Node-only client
`src/fibering/node/persistentSageHeightConeOracle.ts` checks each response
before resolving its promise. `buildObstructionPrunedConeCoverAsync` consumes
that client and produces exactly the same hashed artifact as the synchronous
builder when the oracle answers are identical.

Long searches can wrap that client in
`src/fibering/node/jsonlCachedExactConeOracle.ts`. The wrapper keeps an
append-only `requestHash -> certificate` JSONL checkpoint, replays a delegate
answer before writing it, and replays a cache hit against the complete current
request before returning it. It can remove one malformed unterminated EOF
suffix left by an interrupted append, but rejects corruption anywhere else.
The sidecar is a single-writer performance cache. It is not substituted for
the explicit certificates embedded in the final replayed cover.

`scripts/run_rank19_track_b.ts` is the production compact-5-cube bridge. Its
output becomes a result only after all of these checks finish:

- a passed certificate for the complete integral character lattice;
- a complete, source-bound stream of all relevant height-difference forms and
  full link templates;
- replay of every obstruction against those templates for both perturbation
  polarities; and
- an account of every survivor and of the zero character.

The conclusion also remains scoped to the declared BFS-tree cocycle section,
pulling order, and perturbation rule.

Invariant link-failure records use schema version 2. They store counts and
canonical SHA-256 digests for the full normal, germ, and component lists,
rather than copying those sometimes-large lists into every leaf. The first two
forced-component witnesses remain inline as a readable diagnostic. Replay
regenerates the complete lists from the source-bound template and verifies all
counts and digests, so this is certificate compression rather than a weaker
obstruction test.

The two offset polarities are related by the exact antipodal involution
`(weight,sigma) -> (-weight,-sigma)`. The production runner solves the first
cover and derives the second: primitive witnesses are negated, Farkas
inequality multipliers are retained, free equality multipliers are negated,
and branch signs are reversed. It then reruns the opposite-polarity link
decision at every feasible node and independently replays the resulting
cover. Thus both polarities remain explicit in the certificate without a
second set of external cone solves.

## Adaptive obstruction points

`adaptiveStreamedHeightSearch.ts` implements a counterexample-guided search
for a small set of quotient points. Its exploratory exact DFS returns as soon
as it reaches and replays the first
`streamed-track-b-provisional-passing-witness`; it does not finish that
iteration's unrelated sibling cones first. The returned object is explicitly
an operational survivor hit, not a partial cover. Replay checks its exact cone
certificate and primitive witness at every active point, but the hit makes no
statement about the rest of its cone. The witness is then scanned point-major;
the first failing quotient point is added and the search restarts.

Exploratory branch traversal is configurable. Production defaults to the
canonical `-1,0,+1` order so request prefixes agree with earlier exhaustive
caches; `witness-last` remains available as an operational heuristic. Both
strategies store an exhausted cover in canonical branch order, hence produce
the same theorem object and cover hash.

There are only two terminal interpretations. If the DFS exhausts without a
provisional survivor, the resulting full cover's invariant prune proofs cover
every nonzero integral
character in the certified lattice (equivalently, primitive integral
characters up to positive scaling). This does not extend the central-wall
description to arbitrary real weights near the translated affine height
walls. If a provisional witness passes all quotient points, it is recorded as
a global passing witness. Reaching a resource or iteration cap is incomplete.
For an obstruction result, the report stores the regenerated and replayed
opposite-polarity cover as well as a digest binding the antipodal transport.
For a global witness, it stores source-bound all-point certificates for the
witness and its antipode after explicitly evaluating both polarities. The
standalone report replayer regenerates every recorded full-adjacency template
and reconstructs these checks; it does not accept the antipodal lemma as a
digest-only assertion.

The production adaptive runner records strict atomic schema-v2 iteration checkpoints
and uses the replay-validating JSONL exact-oracle cache. Its output separates
the sealed mathematical `report` from `runner` provenance and binds both in an
outer `artifactDigest`.

The rank-19 adapter prepares the action, generalized compression, and packed
integral cocycle section once. Initial selected points are emitted in one
batch; each provisional witness uses one point-major stream that stops at its
first separator; an all-point witness and its antipode are replayed together
in one exhaustive stream. Only selected templates plus four transient
templates are retained. Report schema version 3 records batch manifests
separately from stable per-template digests, since a batch stream hash is not
a singleton per-point stream hash. Standalone replay uses one fresh
preparation and one batch over the recorded point catalogue.

Intermediate survivor hits, separator choices, and their batch manifests are
operational CEGAR provenance, not theorem certificates for historical
provisional witnesses. Exact hit requests remain reusable through the JSONL
oracle cache. The theorem-facing object is the independently replayed final
two-polarity obstruction cover or the explicit all-point witness/antipode
pair.
