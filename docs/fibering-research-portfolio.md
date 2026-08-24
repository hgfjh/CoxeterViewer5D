# Fibering research portfolio

This portfolio separates three logically different jobs:

1. one bounded rescue of the existing compact 5-cube action;
2. discovery and triage of new compact hyperbolic 5-dimensional actions; and
3. a small, exact positive control for the entire certification pipeline.

The commands and artifacts below are certificates or bounded experiment
records. A bounded negative screen is not a theorem that no fibering character
exists.

## One-shot entry point

```bash
pnpm research:portfolio
pnpm research:portfolio:verify
```

If a non-cube component is regenerated after a passed aggregate build, the
small envelope can be rebound without repeating the multi-hour cube replay:

```bash
pnpm research:portfolio:rebind
```

Rebind-only mode requires the existing aggregate to have a valid hash and
requires the cube file byte hash, certificate digest, replay digest, and runner
digest to be unchanged. It refuses to serve as the initial build.

The build command creates missing components, exactly replays existing ones,
and writes their aggregate binding. The verification command is read-only: it
fails if any component is missing, then replays all three components and their
aggregate source bindings. The aggregate is stored at
`scripts/certificates/portfolio/fibering_research_portfolio.json`. It records
the byte hash and internal certificate/replay digests of every component; exact
verification reconstructs the complete aggregate and rejects a component swap
even if the outer artifact hash has been recomputed.

New compact subgroup discovery is deliberately opt-in because each external
backend subprocess has a 30-minute bound and one target campaign may invoke
several subprocesses:

```bash
pnpm cover:portfolio:compact-actions -- --execute-discovery true
```

The discovery launcher preserves its checkpoint directories under
`.cover-search/compact-action-portfolio`. A passed Python action is converted
to the shared permutation-action format and independently replayed against all
spherical special subgroups. The runner then embeds the raw generic integral
cohomology/wall certificate. Portfolio verification reconstructs that
certificate from the stored permutation rows; it does not trust a replay
boolean or an outer summary.

A failed, exhausted/cancelled, or timed-out opt-in run is also retained. Its
raw discovery artifact, exact target source hashes, configured-command digest,
all effective resource/search bounds, producer seal, and normalized outcome
are sealed together in the target record. Replay reconstructs that binding and
leaves every later stage blocked (`stage-failed`, `stage-incomplete`, or
`stage-timed-out`). A rerun writes to a unique temporary result before replacing
an older outcome, and a no-discovery invocation preserves any replayable stored
outcome. Such a record certifies only what happened in that bounded run: it
neither certifies a torsion-free action nor proves that no such action exists.

## Compact-action promotion gates

Every new compact action follows this order:

| Stage                   | Exact promotion condition                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Source                  | Certified compact \(H^5\) Coxeter input replays.                                                                    |
| Spherical plan          | Every generator subset is checked and the exact finite-special-subgroup orders are complete.                        |
| Action                  | The finite transitive action satisfies the Coxeter relations and every spherical special subgroup acts freely.      |
| Integral cohomology     | The full integral cocycle lattice, coboundaries, wall sublattice, and Smith/saturation data replay.                 |
| \(b_1\) gate            | Actions with \(b_1=0\) are recorded and deprioritized.                                                              |
| Cheap screen            | The declared gauges, pulling orders, and subdivision rules all receive exact local-link replay.                     |
| Generalized compression | A selected cheap-screen survivor triggers the full rooted-cell, spherical-fibre, and face-map certificate.          |
| Exact arrangement       | Requires canonical point-order pulling, a constant periodic potential, and full integral \(H^1\) rank at most four. |

The compact preflight artifact is
`scripts/certificates/portfolio/compact_h5_action_portfolio.json`. Its
actionless plan declares exactly the registered executable family: three
periodic-potential gauges, four compatible global pulling orders, and two
subdivision families (regular pulling and maximal-simplex stellar). These are
24 configuration families, or 48 directed runs after both tie polarities. The
preflight does not claim that they have run. Once an action and positive-rank
integral \(H^1\) exist, the executor uses up to eight primitive basis
characters and the first 32 quotient vertices, for at most 384 total trials.
Every retained higher cell is triangulated by one global pulling order, and the
report includes exact ascending and descending links at both original and new
stellar-center vertices. Portfolio replay rebuilds the raw report from the
certified action.

If the screen has survivors, the portfolio deterministically selects the
earliest pass compatible with the current full-template backend: regular
pulling, canonical quotient-point order, and constant periodic potential. If
there is no compatible pass, it selects the first pass and records the precise
unsupported rule. In either case it constructs and replays the full
generalized compression, including rooted source cells, every
\(\lvert W_T\rvert\)-element fibre, and all proper spherical face maps. Only
one selected survivor is promoted; the other sampled survivors are not claimed
to have undergone exhaustive expensive-stage analysis.

For a compatible survivor with
\(1\leq \operatorname{rank} H^1\leq 4\), the registered exact backend streams
every quotient-point link template and forms the complete central
height-difference sign-face arrangement. It includes lower-dimensional faces
where raw differences vanish and evaluates both global tie polarities. A
noncompatible survivor or higher-rank \(H^1\) preserves the replayed
generalized compression as a `compression-sidecar-only` result with an
explicit nonpromotable implementation gap. Every resource-bound stop is a
replayable `incomplete` result; none is a negative mathematical conclusion.
The preflight recomputes a capacity audit for every target and rejects a
portfolio whose fixed action, compression, or template caps are below that
target's configured maximum discovery index.

Replay also recognizes the one sealed historical actionless preflight from
before this executor was registered. That exception is keyed to its exact
artifact hash, contains no promoted action or link evidence, and cannot be used
to pass the new screen. Fresh builds always emit the executable plan above.

The portfolio runner itself still uses the dense generic integral backend,
which is deliberately bounded to degree 4,096. Since every compact target has
necessary degree divisor 28,800, a newly discovered compact action stops
honestly at this integration boundary. It is not relabelled as \(b_1=0\), and
the cheap screen is not claimed to have run.

A scalable generic sparse backend now exists separately. It provides
source-bound preparation, proof-carrying modular rank, saturated integral
completion, and wall Smith reconstruction for an arbitrary complete finite
action. What remains missing is orchestration: the portfolio does not consume
the external integral-kernel witness, and the scalable result is not yet
adapted into the generalized-compression, exact height-chamber, and all-cell
link stages. Thus the later-stage implementation is replay-tested on small
certified actions but has not run on any of the four compact targets. No
asphericity, CAT(0), universal-cover contractibility, fibering, or
character-kernel finiteness claim follows from this portfolio stage.

### Target order

The preflight recomputes these quantities directly from the certified Coxeter
matrices:

| Priority | Target              | Nonempty spherical types | Necessary degree divisor | Conditional cells at that divisor | Nonzero mod-2 characters |
| -------: | ------------------- | -----------------------: | -----------------------: | --------------------------------: | -----------------------: |
|        1 | Makarov \(P_0\)     |                       92 |                   28,800 |                           352,484 |                        3 |
|        2 | Makarov \(P_1\)     |                       92 |                   28,800 |                           342,084 |                        1 |
|        3 | Tumarkin G11411 #15 |                      122 |                   28,800 |                           443,348 |                        7 |
|        4 | Tumarkin G11411 #04 |                      122 |                   28,800 |                           414,184 |                        1 |

The cell counts are conditional workload estimates at the necessary index
divisor; they do not assert that an action of that degree exists. G12221 is
explicitly excluded from this first portfolio.

### The exact \(P_0/P_1\) relation

Let the \(P_0\) generators be \(p_0,\ldots,p_6\). The character

\[
p_6\longmapsto 1\in\mathbb Z/2,\qquad p_0,\ldots,p_5\longmapsto 0
\]

has an index-two kernel. Reidemeister--Schreier rewriting with transversal
\(\{1,p_6\}\) gives the seven generators

\[
p_0,p_1,p_2,p_3,p_4,p_5,p_6p_5p_6,
\]

whose Coxeter matrix is exactly the stored \(P_1\) matrix. The implementation
therefore restricts every discovered \(P_0\) permutation action to its one or
two \(P_1\)-orbits and re-certifies each orbit before launching an independent
\(P_1\) search. The source-level geometric doubling claim is recorded in
`public/examples/compact_5_polytope_p1_double_makarov.json`.

## Compact 5-cube rescue

The rescue reads the sealed rank-19 adaptive obstruction archive. It does not
load or recompute the completed 46,275-normal catalogue. It extracts all 38
terminal separator leaves, with census `q_2`: 13, `q_4`: 5, and `q_27`: 20.
The production Cartesian portfolio has exactly five global pulling orders and
two compatible subdivision families (`pulling` and
`maximal-simplex-stellar`), hence 38 × 5 × 2 = 380 trials. The aggregate
rejects smoke runs or incomplete Cartesian products.

Each trial is bound to one primitive integral character witness, a global
quotient-point pulling order, a declared compatible subdivision rule, and an
integral quotient-periodic potential. Every evaluated sign and link component
is exact. Failure is scoped to the recorded witness/order/subdivision/potential
bounds. A local hit is only a promotion to bounded global CEGAR. The status
`all-subdivision-vertices-pass` means that all original quotient vertices pass
and that every introduced stellar-center link has its compatible exact
certificate. Even then, the aggregate advances the survivor to the remaining
Track-B topology/asphericity check; it does not declare a fibering theorem.

The certificate stores compact per-trial commitments rather than the full link
component arrays. Each commitment retains the exact search/CEGAR digest,
scores, potential, and final evaluation digests; standalone replay rebuilds
the omitted transcript and compares that compact projection field by field.
During generation, an atomic hash-chained `.checkpoint.json` beside the target
artifact records each completed trial. Its run binding includes the source
hashes, algorithm revision, exact Cartesian plan, and all search bounds. A
restart accepts only an intact canonical prefix. The checkpoint remains until
the final certificate has passed its full self-replay and has been written.

The result is stored at
`scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_bounded_rescue.json`.
The production outcome is `local-connectors-only`: 104 of 380 local trials
found a connector, all 104 entered bounded global CEGAR, and none passed every
original quotient vertex within the declared bounds. The action is therefore
kept as a benchmark with local-connector data; no further cube campaign is
scheduled by this portfolio.
It can be independently replayed, including reconstruction of every exact
bounded search, with:

```bash
pnpm cover:verify:rescue:rank19
```

## JNW rank-8 positive control

The positive control uses `public/examples/jnw_cube_graph.json`. It is a
right-angled Coxeter group with two-dimensional Davis complex, not a compact
hyperbolic 5-polytope. Its production certificate proves:

- the move-kernel action is torsion-free of index 4;
- the complete quotient is a nonpositively curved square complex;
- its universal cover is CAT(0), hence contractible, and the quotient is
  aspherical;
- \(H^1(H;\mathbb Z)\cong\mathbb Z^6\);
- normalization of the raw period image \(2\mathbb Z\) gives a primitive
  epimorphism \(H\to\mathbb Z\); and
- all four ascending and all four descending quotient-vertex links are
  nonempty trees (eight directed links total).

Thus the standard PL Morse criterion gives a finitely generated kernel. The
certificate does not claim a compact \(H^5\)-manifold, a smooth fibration, or a
finitely presented kernel.

The source-bound artifact is
`scripts/certificates/torsion-free/jnw_cube_graph_degree4_positive_control.json`.
It is rebuilt and replayed with:

```bash
pnpm cover:positive-control:jnw
pnpm cover:verify:positive-control:jnw
```

The mathematical model follows Jankiewicz--Norin--Wise, _Virtually Fibering
Right-Angled Coxeter Groups_, arXiv:1711.11505.
