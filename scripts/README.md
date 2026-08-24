# Exact Exporter Scripts

These scripts define the external exact-backend workflow for Coxeter Viewer 5D.
They do not run in the browser, and they do not replace the approximate browser
backend used for interactive exploration.

Useful inspection commands:

```bash
python scripts/sage_export_backend.py --help
python scripts/sage_export_backend.py --contract
python scripts/sage_export_backend.py --check-runtime
python scripts/sage_export_backend.py --certify-output tests/fixtures/generated/I2_5_sage_radius_5.json
python scripts/certify_compact_5_cube.py public/examples/compact_5_cube_gamma1.json
python scripts/certify_compact_5_prism.py public/examples/compact_5_prism_makarov.json
python scripts/certify_ideal_hyperbolic_3_cube.py public/examples/ideal_hyperbolic_3_cube_m3.json
python scripts/certify_tumarkin_8facet.py
node scripts/check_independent.mjs
python scripts/gap_kbmag_export_backend.py --help
python scripts/gap_kbmag_export_backend.py --contract
python scripts/gap_kbmag_export_backend.py --check-runtime
node scripts/run_gap_export.mjs --check-runtime
python scripts/gap_kbmag_export_backend.py --certify-output generated/I2_5_r5.gap.json
node scripts/compare_backends.mjs
node scripts/benchmark_catalogue.mjs
node scripts/benchmark_timed.mjs
node scripts/validate_research_grade.mjs
node scripts/validate_virtual_fibering.mjs --self-test
node scripts/validate_virtual_fibering.mjs path/to/certificate.json
corepack pnpm validate:full-davis-fibering
corepack pnpm cover:discover:compact-5-cube
python -m scripts.discovery_runtime
python scripts/torsion_free_finite_image.py --pure-self-test
python scripts/packed_composite_solver.py --self-test
python scripts/mod3_structural_certificate.py --help
python scripts/run_finite_image_portfolio.py --help
corepack pnpm cover:certify:mod3
corepack pnpm cover:certify:mod3:replay
corepack pnpm cover:validate:mod3-artifact
corepack pnpm cover:discover:portfolio:plan
corepack pnpm cover:validate:symbolic-kernel
corepack pnpm cover:search:coordinated:plan
corepack pnpm cover:search:finite-target:plan
corepack pnpm cover:search:affine-s6:11520
corepack pnpm cover:search:s6-block:5760
corepack pnpm cover:search:s6-block:11520
corepack pnpm cover:search:a6-core:5760
corepack pnpm cover:search:a6-core:11520
corepack pnpm cover:search:block-amalgam:r0:5760
corepack pnpm cover:search:block-amalgam:r1:5760
corepack pnpm cover:search:block-amalgam:r2:5760
corepack pnpm cover:search:block-amalgam:r3:5760
corepack pnpm cover:search:block-amalgam:r4:5760
corepack pnpm cover:search:block-amalgam:r5:5760
corepack pnpm cover:search:finite-target:ideal-cube
corepack pnpm cover:search:everitt:plan
corepack pnpm cover:search:orbifold:plan
corepack pnpm cover:search:orbifold:ideal-cube
corepack pnpm cover:search:priority:plan
wsl bash scripts/install_gap_research_toolchain.sh
corepack pnpm cover:discover:finite-image:tests
corepack pnpm cover:benchmark:smoke
corepack pnpm cover:benchmark:scale
node scripts/release_web.mjs --check
node scripts/release_desktop.mjs --check
```

The Sage exporter is implemented when run in a Sage Python process. This Sage
build accepts `sage -c`, so the portable local command is:

```bash
sage -c "import runpy, sys; sys.argv=['scripts/sage_export_backend.py','--input','public/examples/I2_5.json','--radius','5','--output','generated/I2_5_r5.sage.json']; runpy.run_path('scripts/sage_export_backend.py', run_name='__main__')"
```

Current status:

- `sage_export_backend.py` emits exact Sage-generated `GeneratedCayleyBall`
  JSON when SageMath is importable. It deduplicates with Sage algebraic real
  reflection matrices, respects radius/node/edge caps, emits complete rank-two
  Davis cells when their boundaries are present, and writes warnings into
  metadata for clipped cells or cap hits. New exports also include a backend
  metadata envelope with the exporter version, captured `sys.argv`, input
  SHA-256, cap status, completeness status, and deterministic certification
  diagnostics. New exports also include conservative normal-form records and
  visible rank-two relation summaries.
- `sage_export_backend.py --certify-output ...` runs with ordinary Python and
  checks generated graph JSON for duplicate ids, missing edge references, node
  word-length mismatches, and invalid rank-two cell boundaries. It is a
  structural export certificate, not a theorem-level Coxeter-group proof.
- `certify_compact_5_cube.py` runs with ordinary Python and no third-party
  package imports. It checks the bundled Jacquemet-Tschantz Gamma_1 compact
  5-cube transcription against an independent source table in the script,
  verifies the algebraic dotted values, and computes the exact normal Gram
  rank/signature over `Q(sqrt(13), sqrt(10 + 2 sqrt(13)))`. Its certificate is
  intentionally narrow: it does not certify numerical normal coordinates,
  chamber basepoints, quotient data, or generated Cayley balls.
- `certify_compact_5_prism.py` runs with ordinary Python and no third-party
  package imports. It checks the bundled Makarov compact 5-prism transcription
  against Bredon-Kellerhals Example 8, verifies the algebraic dotted value
  `1/2 * sqrt((7 + sqrt(5)) / 2)`, and computes the exact normal Gram
  rank/signature over `Q(sqrt(5), sqrt((7 + sqrt(5)) / 2))`. Its certificate is
  intentionally narrow: it does not certify numerical normal coordinates,
  chamber basepoints, quotient data, or generated Cayley balls.
- `certify_ideal_hyperbolic_3_cube.py` runs with ordinary Python. It checks the
  octahedral all-`m=3` finite-relation graph, exact Lorentzian Gram signature,
  normal-coordinate cache, eight ideal Klein vertices, the surjection
  `tij -> (ij)` onto `S4`, and all spherical restrictions used to certify the
  index-24 kernel. It explicitly rejects a compactness claim.
- `tumarkin_8facet_eps.py` parses Tumarkin's arXiv EPS artwork for Table 4.10
  into `scripts/data/tumarkin_8facet_transcription.json`. `tumarkin_8facet_solve.py`
  solves the hidden dotted-edge weights from the determinant/rank equations.
  `certify_tumarkin_8facet.py` writes and validates all 16 bundled
  `tumarkin_5d_8facet_*.json` examples, including the unique `G12221` case,
  checking the transcription, algebraic dotted weights, and normal-Gram
  rank/signature diagnostics. Install
  `requirements-ci.txt` first if the local Python does not already provide
  SymPy.
- `coxiter_check_compact.py` prepares deterministic CoxIter graph input for the
  bundled compact examples. It runs a live `coxiter` executable when available
  and otherwise accepts only hash-matched stored CoxIter artifacts from
  `scripts/certificates/coxiter/`.
- `check_independent.mjs` combines compact-example independent checks, requires
  passed CoxIter diagram certificates, and reports optional live CoxIter
  availability.
- `gap_kbmag_export_backend.py` fails with JSON status if GAP is missing. It
  can also certify generated graph JSON with ordinary Python.
- `gap_kbmag_export_backend.g` fails with JSON status if GAP cannot load KBMAG.
- `run_gap_export.mjs` is a convenience launcher for package scripts. It tries
  native GAP first and, on Windows, falls back to the Sage-environment GAP at
  `/opt/miniforge3/envs/sage/bin/gap` inside WSL when that route is visible to
  the calling shell.
- The GAP/KBMAG path is implemented for finite spherical Coxeter inputs. The
  wrapper rejects infinite or non-spherical matrices before launching GAP, then
  GAP loads KBMAG, builds the Coxeter presentation, maps it to a finite
  permutation group, and returns the Cayley-ball skeleton that Python serializes
  as `external-gap-kbmag` generated JSON.
- `compare_backends.mjs` compares matching Sage/GAP generated fixtures. It
  checks counts, length multisets, node/edge/two-cell signatures, generator
  edge closure, source input hashes, backend certificate status, normal-form
  metadata, and visible rank-two relation summaries. It is intentionally scoped
  to finite-spherical generated fixtures.
- `benchmark_catalogue.mjs` prints a timed catalogue benchmark. Use
  `node scripts/benchmark_catalogue.mjs --check scripts/benchmarks/catalogue-static-v1.json`
  to compare against the stored deterministic output.
- `benchmark_timed.mjs` drives the browser against a running dev server at
  `http://127.0.0.1:5173/` and records rendered scene stats for the main
  example/radius performance cases.
- `validate_research_grade.mjs` is the final hard gate for bundled catalogue
  provenance and deterministic benchmarks. GAP fixture generation still depends
  on the optional external GAP/KBMAG runtime.
- `release_web.mjs` builds and hashes `dist/` unless `--check` or
  `--skip-build` is passed. Its report marks native code signing and updater
  work as `not-applicable`.
- `release_desktop.mjs` checks and, when requested, builds the optional Tauri v2
  bundle. Its report includes `releaseOperations.codeSigning` and
  `releaseOperations.updater`. Missing signing or updater environment variables
  are reported as `skipped` without failing unsigned local builds.
- `certify_quotient.mjs` checks an imported quotient action: generator
  regularity, bijective involutions, directed edge compatibility, finite
  Coxeter relations, rank-two orbit cell coverage, and duplicate rank-two
  cells.
- `certify_morse.mjs` checks the active integer game assignment or named
  cocycle by summing signed labels around quotient rank-two cells.
- `certify_local_links.mjs` computes small finite local-link homology over
  `F2`, reporting reduced `H0` and `H1`. It is intended for certificate
  diagnostics, not large-scale homology computations.
- `validate_virtual_fibering.mjs` rechecks an exported wall-fibering artifact:
  cellular boundary sums, Schreier relators, primitive normalization and
  Bezout identity, directed-link spanning trees, and conclusion flags. Its
  `--self-test` mode is part of the research-grade gate.
- `validate:full-davis-fibering` runs the schema-v2 full-Davis certificate
  regression suite. It independently recertifies the finite action, rebuilds
  the complete `H\Sigma` cell poset, checks the chained SHA-256 identities,
  replays rank-two equations and collapse certificates, and includes deep
  tamper tests. This is the theorem-facing profile for higher-dimensional
  examples; `validate_virtual_fibering.mjs` remains the legacy compressed
  2-complex checker.
- `torsion_free_finite_image.py` is the primary exact cover-discovery worker.
  It builds direct finite-field or cyclotomic Tits images, accepts a residue
  only after exact relation and maximal-spherical-order checks, and delegates
  finite group operations to Sage/libGAP. Odd-prime images transfer exact
  matrices and their preserved form to an isolated GAP 4.16 process for
  recognition and admissible-index screening; a permutation image is delayed
  until a target survives. It stores evaluated partial actions as packed rows.
- `finite_image_module_catalogue.py` seals those rows into hash-bound,
  content-addressed catalogues. Exact witness-coverage bitsets allow later
  residue and composite runs to reuse compatible modules without confusing a
  partial module with a torsion-free cover.
- `install_gap_research_toolchain.sh` installs the isolated GAP 4.16 research
  tree under WSL ext4 and verifies the pinned AtlasRep, TomLib, Forms, Orb,
  genss, recog, ClassicalMaximals, and Ferret packages. Run it from Windows as
  `wsl bash scripts/install_gap_research_toolchain.sh`. Recognition jobs invoke
  that GAP with `-r`; they do not mix its packages with Sage's GAP or
  `~/.gap/pkg`.
- `sage_congruence_torsion_free.py` enumerates every prime ideal over each
  requested rational prime. It records ideal bases, norms, residue degrees,
  field orders, and deterministic hashes; extension-field matrices use a fixed
  polynomial basis rather than an implementation-dependent root choice.
- `benchmark_cover_scale.py` exercises the post-discovery pipeline on a
  deterministic 103,680-point regular action. It streams cell, wall,
  subdivision, and local-link data into hashes so the benchmark measures the
  algorithms without first allocating a giant quotient JSON document.
- `finite_image_degree_report.py` extracts a deterministic, hash-bound degree
  ledger from a complete recognition artifact. It refuses unresolved rows;
  the checked-in compact-5-cube report records all 100 mod-2 decisions through
  degree `576,000` without retaining the megabyte-scale GAP audit payload.
- `mod3_structural_certificate.py` builds and replays the separate GF(3)
  structural artifact. It binds the exact matrices, split form, standard-form
  basis change, proved GenSS evidence, standard-generator SLPs, outer
  coset representative, degree ledger, and toolchain hashes. The identification
  `Q_3' = Omega^+(10,3)` is usable only when the artifact status is `verified`
  and `replay` verifies it again. The checked artifact is verified: it proves
  the exact Omega order and both containments, verifies the index-two outer
  coset, and rejects all 100 target degrees through `576,000`. Generic `recog`
  is retained as an optional diagnostic and is not needed by this proof.
- `odd_prime_structural_certificate.py` performs the direct orthogonal proof
  for characteristics `5`, `7`, and `11`. It checks the split form up to an
  exact nonzero similitude multiplier and proves `CM_InOmega` containment.
  The `p=5` and `p=7` artifacts use proved GenSS chains of the prescribed
  `Omega^+(10,p)` order plus replayable standard-generator SLPs. At `p=11`,
  that orbit is too large, so the artifact uses the specialized one-sided
  `RecogniseClassical` containment test: a positive result is conclusive, while
  a negative result would remain unknown. A fixed seed makes replay stable.
  All three artifacts also verify the outer coset and the complete
  ClassicalMaximals root-index ledger through `576,000`; all three checked
  ledgers reject every requested degree in their respective finite image.
- `run_finite_image_portfolio.py` coordinates the mod-2 seed and exact residue
  searches at `3`, `5`, `7`, and `11`, including eligible prime ideals emitted
  by the Sage backend. It retains every compatible partial action in
  content-addressed storage and runs the packed diagonal-orbit solver. Only a
  witness-free survivor is materialized; the orchestrator then rechecks the
  complete rows, relations, and torsion witnesses before sealing the action.
  It then invokes the separate full-Davis promotion gate, which must pass
  spherical freeness before quotient construction or fibering certification.
- `packed_composite_solver.py` combines partial modules with packed witness
  masks, rarest-witness branching, and all diagonal orbits of each bounded
  module multiset, including repeated factors. Factorwise witness coverage is
  only an ordering shortcut: every degree-eligible diagonal orbit receives an
  exact witness test, so exceptional off-diagonal orbits are not discarded.
  Completeness is limited to the recorded factor, degree, Cartesian-product,
  combination, and byte bounds. A minimum is reported only when that bounded
  search is complete or a candidate reaches the independent spherical lower
  bound.
- `discovery_runtime/` stages heavy work in WSL ext4, maintains hash-bound
  persistent caches and checkpoints, enforces light/heavy worker and byte
  budgets, and kills process groups on timeout or cancellation.
- `gap_torsion_free_discovery.g` remains the separately capped small-index
  fallback. It is not asked to enumerate blindly through the compact-cube
  lower divisor.
- `cover:discover:compact-5-cube` runs the finite-image-first, packed-composite,
  then bounded-GAP strategy ladder with compact-5-cube research limits. Tool
  absence or budget exhaustion is reported as incomplete, not as a negative
  theorem or a guessed subgroup.

## Torsion-Free Cover Discovery

For the compact 5-cube, the exact planning record contains 32 maximal
spherical subgroups, 360 prime-order class origins compressed to 186
deterministic shortlex witnesses, and action-degree
divisor `5,760`. A candidate coset action `Q/L` is accepted only when:

1. all source Coxeter relations hold;
2. every prime-order witness is fixed-point free;
3. every restricted spherical orbit has size `|W_T|`.

The third check is the independent spherical-freeness certificate. Search
coverage, a cache entry, or a backend status flag does not replace it.

### Coordinated cover search

The compact-cube search has complementary front ends. Run their bounded plans
together with:

```bash
corepack pnpm cover:search:coordinated:plan
corepack pnpm cover:search:priority:plan
```

The priority campaign runs in the strict order `W(D6)`, `W(B6)`, `W(E6)`,
nonnormal coset actions in exact finite images, then odd-prime and composite
modules. A timeout or unexecuted handoff is incomplete and blocks later stages;
it is never recorded as exhaustion.

Existing characteristic-2 and characteristic-3 results can be replayed into
the nonnormal stage without recomputation:

```bash
python scripts/nonnormal_coset_action_campaign.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output .cover-search/nonnormal-p2-p3.json \
  --artifact path/to/p2.json \
  --artifact path/to/p3.json
```

The aggregate validates both child seals, source and matrix hashes, all 32
maximal spherical restrictions, the common 186-witness catalogue, bounded
search declarations, and any materialized survivor. The current checked run is
exhausted through degree `576,000` in those two finite images; that statement
does not cover other finite images.

The three first Weyl targets use a complete catalogue of labeled `A5 = S6`
embeddings rather than the old timed-out local containment search. The current
compact-cube certificates exhaust `8`, `4`, and `4` labeled anchor classes in
`W(D6)`, `W(B6)`, and `W(E6)` respectively, including the `S6` outer-
automorphism labelings, and find no global tuple.

The `S6` block-extension commands search the two smallest normal-cover
families suggested by the local `A5` subgroup. Since `S6` is centerless, an
extension by a 2-group `R` is determined by the map
`R -> Out(S6) = C2`. The backend enumerates every group `R` of order `8` or
`16`, every index-two kernel up to `Aut(R)`, and the trivial action. GAP then
enumerates every `S6` anchor subgroup up to target conjugacy before extending
the other five Coxeter generators. These runs are complete for their declared
extension targets; they do not exhaust nonnormal covers or arbitrary
amalgamations of the 32 local spherical groups.

The general finite-target track searches involution assignments in screened
symmetric, Weyl, and curated or configured classical targets. The Everitt track combines
sealed partial permutation modules and checks every transitive diagonal orbit,
including the double-coset orbits that do not contain the distinguished
product point. The geometric track compiles the cube's 32 local developments
and labeled diagram symmetries, then checks supplied nonnormal actions against
those constraints. Use `corepack pnpm cover:search:coordinated` only after
providing the module catalogues needed by the Everitt track; every branch is
bounded and checkpointed.

The block-amalgam `R1` command exhausts the 210 local `C/P` port orbits in its
declared uniform-port, zero-twist stratum. `R2` exhausts the 4,606 single-chord
overlap probes; `R3` closes two changed chords sharing one non-root `C`-block.

`R4` is the first non-enumerative closure. For every one of the 210 possible
local classes on the root `C`-residue and every first-stage branch, it records
a failed alternating hexagon contained in that residue. The witness is
unchanged by choices on the other fourteen residues or by any of the 98 chord
maps. Thus `R4` closes all `210^15 * 48^98` configurations in the fixed-tree
map slice with the canonical existing-side port skeleton, including different-block chord pairs,
every support of size at least three, and nonuniform choices among the fifteen
new residues.

`R5` closes the same map slice for every existing-side skeleton at
transposition distance one from
the canonical gauge. There are `7 * C(15,2) = 735` such skeletons. The 637
transpositions away from the root use the `R4` witnesses unchanged; the 98
root-changing transpositions are checked for all 210 local classes and all
seven branches. Both commands use hash-bound resumable checkpoints. They do
not close the full local torsor factor `24^15 * 48^105`.

`block_amalgam_canonical_augmentation.py` adds `R6`. It canonically accounts
for all 266,560 distance-two existing-side skeletons, compresses them by 4,215
root signatures, and exhausts the fixed-tree minimum-root relation slice. The
complete run excludes 265,662 skeletons in that slice and leaves 898 for
the full anchored `S_7 x P^7` frame search. The full-frame mode is resumable
and reports prefix-window completion separately from mathematical exhaustion.
The bundled depth-5 window checks 100 canonical prefixes in all 29,505
signature/branch cases and retains 93 independently replayed local frames
after 132,817,959 exact search nodes.

The `minimum-root-global` mode is the `R7` continuation. It reconstructs each
of the 898 multiplicity-one skeletons left by `R6`, assigns exact local classes
to all fifteen residues, and propagates forced triangle-closing edges between
them. The sealed run exhausts all 3,001 viable signature/branch cases in
630,210 attempts and finds no complete `g4` row. This closes the distance-two
fixed-tree minimum-root map slice, not the full local torsor space.

`block_amalgam_candidate_globalizer.py` is the bounded `R8` continuation of
the 93 full-frame-window seeds. `extract-seeds` creates a portable, sealed seed
catalogue from the large ignored checkpoint. `search` inserts each exact local
matching, propagates forced `(g4 g7)^3` triangle closures, learns reusable
boundary conflicts, and creates another residue domain only if a forced edge
requires it. The stored run learns ten clauses that collectively reject all
93 seeds. Because those seeds came from a prefix window, this is a family
obstruction rather than a complete second-gluing result.

All block-amalgam artifacts use the same exact source-file hash and spherical
lower divisor. A reported candidate still has to pass the independent
materialized-action certifier. See
[`docs/coordinated-cover-search.md`](../docs/coordinated-cover-search.md) for
the proof that every compact-cube cover degree is divisible by `5,760` and for
the distinction between target representation degree, cover degree, and
normal-kernel index.

The ideal-cube commands are quick end-to-end controls. Finite-target synthesis
recovers the familiar `S4` kernel of index `24`. The direct orbifold search also
exhausts its declared `S2`--`S4` target scope and finds an index-`6` `S3`
kernel. Opposite facet generators map to the same transposition, while every
finite `I2(3)` special subgroup maps injectively. The index-`24` cover remains
valid; it is simply not minimal.

### Recognition-first finite images

The finite-image worker does not begin by requesting maximal subgroups of an
unrecognized permutation group. Sage first writes an exact transfer record:
one permutation row for each source Coxeter generator, the permutation degree,
expected image order, source matrix digest, schema version, and a SHA-256 hash
covering the payload. Isolated GAP reconstructs the action and verifies the
hash, generator order, Coxeter relations, and generated order before any
structural recognition result can guide a subgroup search.

Recognition fails closed. A missing package, stale transfer, unproved group
identification, or maximal-subgroup routine outside its documented complete
range produces an incomplete branch. It does not trigger a blind
`MaximalSubgroupClassReps` call on the large root group, and it does not become
a nonexistence claim.

For the compact 5-cube, the exact characteristic-two result is

```text
Q_2 is isomorphic to S3 x (O8^-(2):2).
```

The derived subgroup of the second factor is the simple `O8^-(2)`; the factor
itself is its index-two extension. Moreover, `S3` and `O8^-(2):2` have a common
quotient `C2`. Subgroups therefore need not split as products. The index screen
uses Goursat's lemma and includes the possible fiber products over that common
quotient.

TomLib's complete table of marks for `O8^-(2)` has 5,351 subgroup classes. In
the range through `23,040`, its only subgroup index not divisible by `17` is
`1`. Combining this with the extension and Goursat calculations leaves exactly

```text
1, 2, 3, 4, 6, 12
```

as mod-2 subgroup indices not divisible by `17`. The spherical lower divisor
requires the candidate degrees `5,760`, `11,520`, `17,280`, or `23,040`; none
is possible in the mod-2 image. This is an obstruction for this finite image
and degree range, not a proof that the Coxeter group has no torsion-free cover.

The research search now visits every multiple of `5,760` through its configured
maximum. It constructs every relevant subgroup of `O8^-(2):2`, including
outer-factor lifts, and combines those classes with every subgroup of `S3`
through all common-quotient fiber products. Exact prime-order witness tests run
in the compact 122-point image before a large coset action is considered.

The complete sweep through `576,000` has 100 degree rows. Ninety-six are
impossible by the exact Goursat index sieve. The remaining four degrees and
their exact subgroup-class counts are:

```text
 97,920 : 10 classes
195,840 :  9 classes
293,760 : 14 classes
391,680 : 12 classes
```

All 45 classes contain a supplied prime-order spherical torsion witness, so all
four degrees are recorded as `materialized-and-rejected`. The independent
degree-97,920 audit recovers the same ten classes from a separate count of the
relevant normalizer quotients and Goursat rows. This closes the mod-2 finite
image through `576,000`; it does not rule out another finite image or a
composite action.

For the characteristic-three image, the expected structural conclusion is
`Q_3' = Omega^+(10,3)` with `[Q_3:Q_3']=2`. The repository does not accept that
statement from an order printout or a cached recognition run. Generate and
replay the hash-bound artifact instead:

```bash
python scripts/mod3_structural_certificate.py generate \
  --source public/examples/compact_5_cube_gamma1.json \
  --output scripts/certificates/torsion-free/compact_5_cube_mod3_structural_certificate.json \
  --timeout 3600 \
  --max-subgroup-nodes 20000

python scripts/mod3_structural_certificate.py replay \
  --source public/examples/compact_5_cube_gamma1.json \
  --output scripts/certificates/torsion-free/compact_5_cube_mod3_structural_certificate.json \
  --timeout 3600
```

The conclusion and its degree ledger through `576,000` are promotable only if
the artifact has `status: "verified"` and the second command reports a verified
replay. The checked artifact meets that gate. Its exact proof uses `CM_InOmega`
containment, a proved GenSS stabilizer chain of the prescribed Omega order, and
replayed SLPs for the standard generators. The complete root maximal-index
catalogue then rejects all 100 requested degrees. An unresolved ledger row
would remain `unknown`; it could not be summarized as impossible.

The bounded discovery ladder has not found a manageable compact-5-cube action.
The repository does separately contain and replay the externally imported
index-17,280 action and its degree-34,560 character lift; those are not outputs
of this search. An accepted congruence reduction may also certify its normal
kernel as torsion-free, but that existence certificate remains separate from a
materialized action that can construct the quotient.

Characteristics `5`, `7`, `11`, and later odd primes follow the same exact
orthogonal matrix path. Complete classical-maximal index arithmetic can reject
all requested targets without constructing the enormous natural permutation
action. A surviving target is only a materialization candidate, never a
subgroup or torsion-free claim.

The focused partial-module campaign has four entry points:

```bash
corepack pnpm cover:search:partial-modules:order5
corepack pnpm cover:search:partial-modules:mod2
corepack pnpm cover:search:partial-modules:compose
corepack pnpm cover:search:partial-modules:integrate
```

`order5_partial_module_campaign.py` certifies the three `C2` characters and
runs the declared `S5`/`S6` anchor families. It currently reaches 123 of 186
witnesses. `mod2_symbolic_partial_modules.py` reconstructs all 45 bounded
mod-2 subgroup classes in GAP's compact 122-point action and stores exact
fixed-point vectors plus compact stabilizer generators. It does not construct
the 97,920-point and larger coset actions.

`partial_module_search_campaign.py` verifies both seals and opens the
diagonal-orbit gate only when the exact union covers all 186 witnesses. It
also applies the orbit-degree divisor before starting a double-coset search.
The current union is complete, but every requested degree through 97,920 is
eliminated by that divisor; the first possible coverage-improving mod-2
intersection has degree 195,840. Add `--run-fallback` to run the separate
global degree-5,760 CSP under its declared resource bounds. A bounded fallback
run is discovery evidence, never a degree-5,760 nonexistence result.

`mod2_symbolic_composite_search.py` handles the 195,840 frontier without first
building a large permutation action. It enumerates stabilizer double cosets in
the compact ambient group, computes exact fixed-point marks for each surviving
intersection, and materializes rows only for a witness-free candidate. The
current two-minute run is incomplete at 195,840; the exact exclusion through
97,920 is unaffected. Repeat with a larger `--timeout-seconds` rather than
interpreting the timeout as a negative theorem.

Run the managed ladder with explicit resource limits:

```bash
python scripts/torsion_free_discovery.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output artifacts/compact-5-cube.torsion-free-discovery.json \
  --checkpoint-dir artifacts/.compact-5-cube-checkpoints \
  --max-index 576000 \
  --max-module-candidates 512 \
  --max-low-index-fallback 512 \
  --max-memory-bytes 12884901888 \
  --light-workers 4 \
  --heavy-workers 1 \
  --timeout 1800
```

On Windows, the runtime moves transient Sage/GAP files and packed module rows
into WSL's Linux filesystem. Its persistent backend cache is
`~/.cache/coxeter-viewer/torsion-free`; do not redirect it to `/mnt/c` for a
normal run. Only final passing action JSON and manifests are copied to the
research workspace. The app derives Schreier data from a passing action only;
rejected modules never pay that cost. Compatible partial modules remain in the
content-addressed catalogue for later diagonal-orbit searches.

The same rule applies to recognition transfers, tables of marks, subgroup
frontiers, and checkpoint journals: keep heavy state on WSL's ext4 filesystem,
not in the OneDrive checkout.

Preview the residue portfolio without launching its workers:

```bash
python scripts/run_finite_image_portfolio.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output-dir artifacts/compact-5-cube-portfolio-plan \
  --max-index 576000 \
  --dry-run
```

Run it under the pinned Sage Python and keep the live store in WSL ext4:

```bash
sage scripts/run_finite_image_portfolio.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --output-dir "$HOME/.cache/coxeter-viewer/portfolio/compact-5-cube" \
  --max-index 576000 \
  --light-workers 4
```

The portfolio schedules characteristics `2`, `3`, `5`, `7`, and `11`; the
underlying Sage worker enumerates eligible prime-ideal and extension-field
residues. It resumes by default. A degree ledger cannot stand in for a packed
permutation module. A genuine survivor triggers byte-bounded action
materialization and an independent replay of complete rows, relations, and all
stored torsion witnesses. It then automatically invokes the independent
two-track promotion path: complete spherical regular-orbit checks and quotient
construction, then the lawful rank-two complex first. Only when that smaller
certificate does not pass does the default run build the complete Davis cell
poset, pulling subdivision, and full directed links.
The promotion artifact is then passed to a second verifier-only process, which
rebuilds the quotient, compression, walls, coorientation, character, heights,
and links from the certified action and the current source-tree manifest. A
nested replay object is never trusted by itself.
Missing runtimes and resource caps are recorded as `incomplete`, never as
mathematical failures.

Replay that downstream gate by itself with:

```bash
corepack pnpm cover:fiber:user-action -- \
  --example compact_5_cube_gamma1 \
  --action ACTION.json \
  --output promotion.json

corepack pnpm exec tsx scripts/run_materialized_fibering.ts \
  --verify-artifact promotion.json \
  --output promotion.replay.json
```

`ACTION.json` may be a raw
`{id,index,generatorImages}` finite right action, a wrapper with that object in
`candidate`, or the packed-composite discovery artifact. Raw and wrapped
actions are hashed by the runner and receive the same independent spherical-
freeness replay; a supplied torsion-free certificate is not trusted. The row
order must match the selected bundled example. For an infinite compact Coxeter
system, subgroup generators alone are not enough: the current finite-only
quotient exporters do not build their coset action.

This command searches the recorded wall-character family. It can certify a
virtual algebraic fibration, but it neither exhausts the full integral `H^1`
nor certifies a smooth bundle. Legacy IMM-style booleans are ignored until a
source-bound manifold/PL/smoothing verifier exists.

To record the generalized coface-closed lawful complex and run the stronger
full-Davis track even after a rank-two lawful success:

```bash
corepack pnpm cover:promote:materialized-action -- \
  --system public/examples/compact_5_cube_gamma1.json \
  --action ACTION.json \
  --output promotion-both.json \
  --include-full-lawful-closure true \
  --always-run-full-davis true
```

Use `--lawful-complex coface-closed-full --lawful-applicability EVIDENCE.json`
to ask the generalized retained complex itself to carry Track A. The evidence
file must name the exact retained cells and full-poset archive hash and must
cover asphericity, higher-cell affine extension, and full directed links. With
no such evidence, the generalized track remains incomplete and the full-Davis
fallback runs; downward closure alone is not promoted.

The action-backed streamed calculator is the executable replacement for that
legacy external-evidence path. It imports the exact permutation certificate,
builds a Z/2-character lift, exhausts the canonical wall masks, constructs the
coface-closed cell set, and checks the inherited metric-flag condition without
materializing the strict Davis face poset:

```bash
corepack pnpm exec tsx scripts/run_generalized_lawful_calculation.ts \
  --system public/examples/compact_5_cube_gamma1.json \
  --certificate coxeter5cube_index17280/index17280_permutations.json.gz \
  --checksum-manifest coxeter5cube_index17280/SHA256SUMS.txt \
  --character 1,1,1,1,1,1,1,1,0,0 \
  --masks survivors \
  --actual-links false \
  --targeted-witnesses 0x186:97,0x279:96 \
  --output generalized-lawful.json
```

`--targeted-witnesses MASK:POINT,...` reconstructs only the named actual
pulled-subdivision links. This is the practical exact rejection route once a
disconnected link is known. Use `--actual-links true` with exactly one mask
for a complete certificate run; the default is `false` because the higher-cell
subdivision and link scan are intentionally expensive. Numeric masks are never
interpreted without the report's ordered wall IDs and explicit sign maps.

The same runner can instead test the unsubdivided Coxeter cells directly:

```bash
corepack pnpm exec tsx scripts/run_generalized_lawful_calculation.ts \
  --system public/examples/compact_5_cube_gamma1.json \
  --certificate coxeter5cube_index17280/index17280_permutations.json.gz \
  --checksum-manifest coxeter5cube_index17280/SHA256SUMS.txt \
  --character 1,1,1,1,1,1,1,1,0,0 \
  --masks survivors \
  --actual-links false \
  --direct-cellwise true \
  --direct-affine-scan stop-on-first-obstruction \
  --direct-link-scan exhaustive \
  --direct-replay false \
  --generalized-compression-output generalized-compression.json \
  --output direct-cellwise.json
```

This mode first replays the all-ranks generalized-compression fibers and face
maps. It then solves exact objective-function equations in a zone-scaled
simply-laced/right-angled Coxeter-zonotope model and constructs ascending and
descending links as unions of vertex-figure simplices from the retained cells.
The primary variables are components of geometric edges under opposite-edge
relations from retained polygons only; an ambient-wall model is recorded as a
stricter diagnostic. The calculation uses no pulling subdivision or
vertex-height perturbation. Inverse zone scales alter the affine realization,
not the integral `+/-1` wall cocycle. Failure of that sufficient realization
is not a proof that every affine realization fails; a disconnected direct sign
link is recorded separately. The all-mask command stops after an exact affine
obstruction but exhausts every quotient vertex for link statistics. For a
small independently rebuilt witness artifact, select one mask, use
`--direct-link-scan stop-on-first-failure`, and set `--direct-replay true`.
Reuse the first run's compression commitment so the replay does not rebuild
the 4 MB all-ranks archive from scratch:

```bash
corepack pnpm exec tsx scripts/run_generalized_lawful_calculation.ts \
  --system public/examples/compact_5_cube_gamma1.json \
  --certificate coxeter5cube_index17280/index17280_permutations.json.gz \
  --checksum-manifest coxeter5cube_index17280/SHA256SUMS.txt \
  --character 1,1,1,1,1,1,1,1,0,0 \
  --masks 0x186 \
  --actual-links false \
  --direct-cellwise true \
  --direct-affine-scan stop-on-first-obstruction \
  --direct-link-scan stop-on-first-failure \
  --direct-replay true \
  --generalized-compression-input generalized-compression.json \
  --output direct-cellwise-0x186-replay.json
```

Run the exact all-cells Track B calculation with the same generalized
compression commitment:

```bash
corepack pnpm exec tsx scripts/run_streamed_track_b.ts \
  --system public/examples/compact_5_cube_gamma1.json \
  --certificate coxeter5cube_index17280/index17280_permutations.json.gz \
  --checksum-manifest coxeter5cube_index17280/SHA256SUMS.txt \
  --generalized-compression scripts/certificates/torsion-free/compact_5_cube_index34560_generalized_compression.json \
  --character 1,1,1,1,1,1,1,1,0,0 \
  --masks all \
  --link-scan stop-on-first-failure \
  --replay true \
  --output scripts/certificates/torsion-free/compact_5_cube_index34560_streamed_track_b.json
```

The output path must be new; the runner refuses to overwrite an artifact.
This command strictly replays the exact parent action, the derived
torsion-free degree-34,560 action, and the generalized-compression fibers and
face maps before scanning links. It retains all full-`K` cells, uses one
global pulling order with no new vertices, and evaluates 512 anchor-positive
wall sign vectors with both anchor-relative offset polarities. The point-major
screen stops each class at its first exact link obstruction, then replays the
entire batch from the action-rooted source.

The canonical run resolves all 1,024 height classes with no survivor. Its
first-failure counts at `q0,...,q7` are
`[924, 62, 14, 12, 4, 4, 3, 1]`. This means only that no character passed for
this global pulling and candidate-odd height family. It does not rule out a
different subdivision, affine rule, character construction, finite cover, or
virtual algebraic fibration.

The command above is the historical unit-wall search. It does **not** run the
new intrinsic-character calculation. That calculation is deliberately split
into replayable stages.

**Stage 1: the integral character lattice.** `prepareStreamedH1Lattice` in
`src/fibering/streamedH1Lattice.ts` constructs the canonical
generator-order BFS tree gauge, cotree periods, saturated wall-period
basis, flattened rank-two boundary matrix, and unit-peel core. A
preparation with `status: "prepared"` is not an `H^1` theorem. The old
rank-four `certifyStreamedH1Lattice` path is retired because the residual
core has nullity 15. `completeStreamedH1Lattice` combines the primitive
rank-four wall-saturation frame with the exact rank-15 residual frame and
requires the rank-87,935 modular calculation before calling the resulting
19 cocycles the complete integral character lattice.

The exact residual-kernel frame used while auditing that rank calculation is
replayed with:

```bash
corepack pnpm cover:certify:h1-residual-kernel
```

This command reconstructs the derived degree-34,560 action and the canonical
unit-peel core from the source action, checks the preparation, peel-ledger,
core-matrix, and raw sparse-matrix digests, and then replays all 15 recorded
integer kernel vectors over `Z`. Their displayed coordinate minor is the
identity, so the frame is saturated in its rational span. The two independent
LinBox bases at primes 30,011 and 32,749 normalize to the same small integral
frame. The frame by itself is not a rank certificate: equality with the whole
rational kernel additionally uses the exact modular-rank result.

**Stage 2: exact height forms.**
`streamStreamedTrackBLinearLinkTemplates` in
`src/fibering/streamedTrackB.ts` independently checks the concrete tree-gauge
cocycles on edge reversal and every rank-two boundary. It then emits exact
sparse pulling-germ forms. `includeAdjacency: false` is a first-pass
optimization for collecting normals; it is not a completed link scan. A
production manifest must have `checkedPointCount == degree` and a valid report
hash.

**Stage 3: exact cone cover and links.** The scalable external-oracle engine
in `src/fibering/scalableHeightCone.ts` splits character space into exact
`-/0/+` sign cones. Zero-sign branches retain the lower-dimensional
arrangement faces, and infeasible branches require exact Farkas certificates.
Directed-link pruning proofs are replayed against source-bound full-adjacency
templates.

The large residual kernel from stage 1 has a separate exact replay checker.
Given the LinBox sparse residual matrix and the sparse kernel returned by
exact prime-field Gaussian elimination, run:

```bash
python scripts/certify_h1_residual_kernel.py \
  .tmp/h1_boundary_residual.linbox \
  .tmp/h1_core_nullspace_p30011.txt \
  .tmp/h1_residual_saturated_basis.json \
  .tmp/h1_residual_kernel_certificate.json
python scripts/test_certify_h1_residual_kernel.py
```

The checker validates the prime, replays every matrix row modulo the prime and
over the integers, performs exact mod-two saturation, and requires a
unimodular coordinate minor. For the compact-cube residual matrix, the exact
dimensions are `266513 x 87950` with `703600` nonzero entries. Both primes
`30011` and `32749` give rank `87935` and nullity `15`; their independently
lifted and saturated outputs are byte-identical. The source-bound digests are:

- residual matrix SHA-256:
  `a5bcc0771d5cc35f070fbcbf190d97aae0ce782b85117b869614fd0ad118e450`;
- prime-`30011` modular witness SHA-256:
  `e1ee69886d250aff960f527c16396ddbb6a6d2cad0397c40bad750913b5f960c`;
- prime-`32749` modular witness SHA-256:
  `aa11a098739ebfa20eb0743d6cfa56ecc52169a3000bfe641fecfd962b7b8006`;
- saturated residual basis SHA-256:
  `adf984978b32878c1bb9caff0f26b92a6ab623e5ac4d81c8312b856ccc0a91ff`.

The final `15 x 15` coordinate minor has determinant `-1`, and all residuals
are zero. This proves that the recorded residual vectors form the full
saturated integer kernel, conditional only on replaying the source-bound
matrix construction and exact LinBox rank step. The full `H^1` certificate
must additionally map these residual columns back through the unit-peel
ledger; the residual certificate alone does not make that identification.

The theorem-facing completion is self-contained in tracked gzip artifacts:

```bash
corepack pnpm exec tsx scripts/run_streamed_h1_lattice.ts \
  --system public/examples/compact_5_cube_gamma1.json \
  --certificate coxeter5cube_index17280/index17280_permutations.json.gz \
  --expected-certificate-sha256 067c1c0683d7bf9bf14cefcdccb008bd09ffbf9b026cb0a6bce9f23db548a8a8 \
  --character 1,1,1,1,1,1,1,1,0,0 \
  --core-matrix scripts/certificates/torsion-free/compact_5_cube_h1_core_matrix.linbox.gz \
  --expected-core-sha256 f7142317ad132d5f04ea021418d4b71c9dec0fd6b093198ffce6e04ae9c4aec5 \
  --core-basis scripts/certificates/torsion-free/compact_5_cube_h1_integral_core_basis.txt.gz \
  --expected-core-basis-sha256 1c30dcb941d8e723c4032aadd591fb3efe19e5b20b33d30223075a8b2892f1ad \
  --modular-basis 30011,scripts/certificates/torsion-free/compact_5_cube_h1_modular_basis_p30011.txt.gz,a08e6af7e33ac4353020af8a2a8ab5ada6bc01c3bf7e4a136703f62b650b923d \
  --modular-basis 32749,scripts/certificates/torsion-free/compact_5_cube_h1_modular_basis_p32749.txt.gz,326864ee604bccbe131928726d046ddd00cdb5d5201089b11786cdb541853451 \
  --output scripts/certificates/torsion-free/compact_5_cube_index34560_h1.json
```

If that report already exists, the runner verifies it byte-for-byte and never
overwrites it. A differing existing report is an error.

The runner bounded-decompresses and hashes every payload, regenerates and
byte-replays the 266,513-by-87,950 core, normalizes both modular nullspace
bases on the declared 15-coordinate identity chart, and compares all
1,319,250 normalized entries at each prime with the integral frame. It then
replays all 266,513 core equations, 345,600 directed-edge reversals, and
316,800 rank-two boundaries. The result is
`H^1(G;Z) = Z^19` and
`H^1/L_wall = Z^15 + Z/2`; the wall lattice has rank four, index two only in
its rank-four saturation, and infinite index in full `H^1`.
The canonical completion digest is
`dbd4b3b901f66d00d9acc0125c9df550c664eded720990f4722da8842f01c38f`,
the report digest is
`b48078fb50d9ee9615fbaeaa46c75c72af9270c909aaaf3567dfb05ec8540cb7`,
and the generated JSON file SHA-256 is
`99a7c3909773eeaefa1a0a51e1ca4a8ba0120a2caed9861b9d6db4ef14468299`.

The rank-87,935 lower bound is a reproducible deterministic exact
LinBox/Givaro elimination, with source and two complete nullspace transcripts
bound into the report. It is not an embedded proof-carrying pivot ledger; a
standalone checker must rerun the supplied C++ driver to independently
recompute that rank.

The in-process cone solver is intentionally restricted to ranks at most four.
For a larger eventual certified lattice, create individual exact oracle
certificates with:

```bash
sage -python scripts/sage_exact_height_cone.py \
  request.json certificate.json
```

Conda Sage installations can invoke their environment's Python executable
directly. Use the invocation supported by that installation. `request.json` must come from
`buildExactConeOracleRequest`. The worker uses exact PPL polyhedra and returns
either a primitive integral point or rational Farkas multipliers.
`replayExactConeOracleCertificate` independently checks the result, and
`buildObstructionPrunedConeCover` records a lazy source-bound ternary tree so
that irrelevant arrangement normals need not be split. The complete protocol
and limitations are in
[`docs/scalable-height-cone-certificates.md`](../docs/scalable-height-cone-certificates.md).
This backend does not itself establish an `H^1` rank; the source-bound
rank-19 certificate above supplies that input.

The saturated wall slice has four declared coordinates. The ten integral wall
classes have Smith factors `(1,1,1,2)` in that slice, so wall weights reach
only vectors with even fourth coordinate. The odd fourth-coordinate parity
coset was absent from every wall-weight search. The completed calculation also
has 15 independent gamma coordinates, so arbitrary wall weights explore only
a proper rank-four slice of `H^1 = Z^19`.

For a basis weight `w` and offset polarity `sigma`, the exact germ comparison
used by the new pipeline is

```text
4*degree*dot(germForm,w) + sigma*(otherPoint-point),
sigma in {-1,+1}.
```

Here is the exact reason the central raw arrangement suffices for integral
characters. Put `N=degree`, `q=point`, `r=otherPoint`, and `n=germForm`. A
genuine germ has `r != q`, hence `0 < |r-q| < N`. For `w` integral,
`dot(n,w)` is integral. Therefore, for

```text
D = 4*N*dot(n,w) + sigma*(r-q),
```

a nonzero `dot(n,w)` has main term of absolute value at least `4*N`, which
strictly dominates `|r-q|`; consequently `sign(D)=sign(dot(n,w))`. If
`dot(n,w)=0`, then `D=sigma*(r-q)`, exactly the declared tie-break sign. Thus
`D` never vanishes on the integral character lattice. The central hyperplanes
`dot(n,w)=0` and all of their lower-dimensional faces therefore govern the
integral-character sign calculation exactly, with the point-order rule acting
only on raw-zero germs.

This lemma does not identify the arrangement over the reals. The equations
`4*N*dot(n,x)+sigma*(r-q)=0` are generally translated affine walls for real
`x`, distinct from the central walls `dot(n,x)=0`. The raw-normal catalogue
does not claim to enumerate those translated real affine walls.

Consequently `(w,sigma)` is identified with `(-w,-sigma)`, but one must not
fix an anchor-coordinate sign on a lower-dimensional face where that
coordinate is zero. The zero character is recorded separately and is never a
survivor.

The production rank-19 runner is:

```bash
corepack pnpm exec tsx scripts/run_rank19_track_b.ts \
  --output scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_track_b.json \
  --prefix-count 8 \
  --global-catalogue true \
  --oracle-cache .tmp/compact_5_cube_rank19_cones.jsonl
```

It consumes the tracked integral core frame and both tracked modular
nullspace transcripts, reconstructs the certified `Z^19` cocycle basis, and
uses a persistent exact Sage/PPL cone oracle. The exhaustive no-adjacency
stage records the global height-normal catalogue. The full-adjacency prefix
stage then builds exact obstruction-pruned `-/0/+` covers for both tie
polarities. The second cover is obtained by the exact antipodal certificate
transport `(weight,sigma) -> (-weight,-sigma)` and is fully replayed, so only
one polarity requires Sage cone solves. Progress is written beside the
requested report. Sage is started lazily at the first cone query, after the
long synchronous template stage.

Exact cone answers are also checkpointed in an append-only JSONL sidecar. If
`--oracle-cache` is omitted, its path is `<output>.oracle-cache.jsonl`.
Reusing that path after an interrupted run avoids repeating completed Sage
queries: every loaded answer is nevertheless replayed against the current
canonical request before use. Every new answer is replayed before append. One
unterminated final record left by a killed process is discarded; malformed
interior records or hash mismatches stop the run. The cache is a single-writer
performance checkpoint, not a proof object. The final cone cover still embeds
and replays every certificate it uses.

The exhaustive raw-normal catalogue can be run and resumed independently of
the cone search:

```bash
corepack pnpm exec tsx scripts/run_rank19_track_b.ts \
  --output scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_normals.json \
  --catalogue-only true \
  --catalogue-checkpoint .tmp/compact_5_cube_rank19_normals.checkpoint.json \
  --catalogue-chunk-size 8192 \
  --global-catalogue false
```

Each completed chunk is an exact no-adjacency template stream over one
gap-free point interval. The runner replays its complete-H1, action,
compression, lattice-basis, cocycle-section, and height-rule bindings before
atomically replacing the checkpoint. Repeating the same command resumes at
the next uncovered point. `--catalogue-max-chunks N` deliberately stops after
at most `N` new chunks for a bounded campaign. Production chunks smaller than
4096 are rejected because every chunk repeats the exact source and cocycle
closure replay.

The completed artifact exhausts primitive raw coefficient-form hyperplanes
`dot(form,w)=0`, their occurrence counts, and identically zero germs. It does
not claim to catalogue the translated expressions
`4*degree*dot(form,w)+sigma*pointDifference=0`, and it contains no adjacency or
ascending/descending-link calculation. A theorem-facing finalizer must reload
the exact inputs, regenerate and replay the selected full-adjacency obstruction
cover (and its antipodal cover), then bind that result to this separately
replayed catalogue artifact. A digest-only pairing is provenance, not that
final theorem replay.

The completed degree-34,560 run contains 4,467,168 germ occurrences,
856,530 identically zero germs, and 46,275 distinct oriented primitive
rank-19 normals. Its normal-catalogue digest is
`6cf32c34bb84fcf7c42a0f5064b8aac9c93d1f124e90453e9170c748f8cf9e8b`.
The compact tracked archive and its manifest can be regenerated or replayed
with:

```bash
corepack pnpm run cover:archive:rank19-normals
corepack pnpm run cover:verify:rank19-normals
```

Archive verification decompresses the bounded payload and reruns all manifest,
binding, chunk, count, and catalogue-digest consistency checks; the gzip
container is not trusted as a proof object. This standalone command does not
regenerate quotient templates. The theorem-facing finalizer below does that
separately, chunk by chunk, from the fresh exact action, compression, and
integral cocycle section.

The command's existence is not a compact-5-cube conclusion. Do not promote a
partial progress file, partial normal counts, a `prepared` lattice artifact,
or a cone cover with unverified pruning leaves. A terminal obstruction cone
may compress many literal global faces only when its replayed forced/possible
link obstruction is invariant under every omitted sign refinement.

For large covers, first select a sparse obstruction-point set by exact
counterexample-guided refinement:

```bash
corepack pnpm run cover:track-b:rank19:adaptive -- \
  --output .tmp/compact_5_cube_rank19_adaptive.json \
  --initial-point-count 1 \
  --traversal canonical \
  --max-iterations 32
```

The adaptive runner begins with `q0`. Its exact DFS stops immediately
after it reaches and replays the first provisional survivor, rather than
finishing unrelated sibling cones. It scans that primitive integral witness
in canonical quotient-point order and adds the first point where a directed
link fails, then restarts with that point included. The operational hit
certifies only its stored witness; it is never called a partial cover or used
as a cone-wide all-links-pass claim. A negative result is emitted only when a
DFS exhausts and produces a full cover with invariant obstruction leaves and
no provisional survivors. Its domain is the certified integral `Z^19`
character lattice, not arbitrary real weights near the translated affine
height walls.

The default exploratory traversal visits branches canonically as `-1,0,+1`,
which maximizes reuse of certificates produced by the original exhaustive
DFS. `--traversal witness-last` is an optional operational heuristic. Under
either strategy an exhausted search serializes branches canonically, so the
full proof object and its hash are identical. Request-keyed certificates from
an earlier run remain valid in the JSONL cache.

The expensive action/compression/cocycle preparation is reusable: selected
points are loaded by one template stream, and every later fixed-witness scan is a
single point-major stream rather than 34,560 singleton preparations. The
adapter retains only selected templates plus a four-template transient cache.
Its schema-v3 report keeps batch stream hashes separate from stable
per-point template digests; standalone replay prepares once and streams the
recorded catalogue once.

The intermediate survivor/separator/batch history is operational CEGAR
provenance; historical provisional witnesses are not theorem certificates.
The final
replayed two-polarity cover or explicit all-point witness pair is the
mathematical object used downstream.

That result contains both the replayed `sigma=-1` cover and the explicitly
derived, independently replayed `sigma=+1` cover, plus a transport digest. If
the search instead finds a global witness, it explicitly checks and records
source-bound all-point certificates for the witness and its antipode.

Every completed iteration is written atomically to a schema-v2
`REPORT.json.checkpoint.json`. Rerunning the same command strictly replays the
checkpoint's source, H1, selected-point, iteration, and content digests before
resuming. Exact cone certificates are independently retained in
`REPORT.json.oracle-cache.jsonl`, so a restart normally reuses completed Sage
queries. A terminal iteration checkpoint may also be resumed if the process
stopped while constructing the opposite-polarity final object; that work is
repeated from the cached exact requests. The checkpoint is bound to its
recorded cache path. Override either path with `--checkpoint` or
`--oracle-cache` before the first run.

Every cache miss is written first to the sealed operational sidecar
`REPORT.json.oracle-request.json`. Completion or failure atomically reseals the
same full canonical request with timing and certificate/error metadata, so a
timeout can be replayed in a one-shot solver without reconstructing its DFS
path. Override it with `--oracle-request-capture`; keep it distinct from the
report, checkpoint, progress, and certificate cache.

Production uses the `reduced-auto` exact cone backend. Before an external
solve, cached primitive witnesses are checked exactly against the complete new
request. Remaining requests eliminate equality rows over `QQ`, deduplicate
only positively proportional projected strict rays, and use a floating LP only
to propose a candidate. A proposed witness is accepted only after exact
verification against every original rank-19 row. Otherwise the backend uses
the exact PPL LP primal or an explicit normalized PPL dual and lifts the result
to the original assignment indices. TypeScript replay still checks every
ambient witness dot product or Farkas identity; the floating computation is
never a certificate.

The output is an outer artifact containing a sealed mathematical `report` and
separate `runner` provenance; `artifactDigest` binds the complete emitted JSON
apart from that digest field itself. The exported standalone report replayer
regenerates every recorded full-adjacency template, replays the final negative
object, reconstructs the positive cover or both all-point witness scans, and
checks all transport hashes. A theorem-facing finalizer still has to replay
and bind this adaptive artifact to the separately exhaustive global-normal
catalogue; a digest-only pairing is not that final theorem replay.

After the adaptive runner reaches a terminal status, perform that joint replay
and binding in two stages. First replace no files manually: archive the sealed
terminal runner artifact with the deterministic packager, then replay the
tracked container and manifest:

```bash
corepack pnpm run cover:archive:rank19-adaptive
corepack pnpm run cover:verify:rank19-adaptive
```

The packager accepts only `invariant-obstruction-cover` or
`global-passing-witness`; an `iteration-limit` checkpoint cannot be promoted.
It canonicalizes the decoded JSON, writes a level-9 gzip member with zero
mtime and a platform-neutral OS byte, and refuses to overwrite either output.
Verification requires gzip magic and the canonical header, applies the
128 MiB compressed and 256 MiB decoded limits, checks both byte hashes,
requires the exact manifest schema, and replays the sealed terminal envelope.
That packaging replay is deliberately not a substitute for source-bound cone
and link replay. The finalizer performs the latter from the exact action,
compression, H1 lattice, and cocycle section.

The finalizer defaults to the tracked `.json.gz` adaptive archive and its
adjacent `.archive.json` manifest:

```bash
corepack pnpm run cover:finalize:rank19-track-b
corepack pnpm run cover:verify:rank19-track-b
```

The finalizer reconstructs the exact action and integral `H^1` basis, rebuilds
the mathematical global-catalogue binding, replays the bounded gzip payload
and its exact adaptive archive manifest, regenerates every archived
no-adjacency chunk,
regenerates all selected full-adjacency templates, and replays the terminal
two-polarity link object. Its small final report references the large sidecars
by byte hash but is accepted only after those full replays, not from their
digests alone.

The archived catalogue predates a provenance-only metadata reseal of the
completed `H^1` certificate. The final report therefore records the tracked
and runtime completion-certificate hashes as distinct provenance. It does not
call either one an H1-binding digest. Acceptance requires equality of the action,
preparation, rank/result fields, ordered integral basis, cocycle section,
compression, height rule, and every freshly regenerated chunk; a difference
in the certificate hash is not used to waive any mathematical comparison.
Invariant obstruction leaves are proof regions and may cover many literal
arrangement faces; neither the adaptive report nor the final report claims a
literal face enumeration or face count.

The completed degree-34,560 finalization has status `passed` and conclusion
`all-nonzero-integral-characters-obstructed-for-this-track-b-height-complex`.
It records `H^1(G;Z) = Z^19`, wall-lattice saturation index two, 46,275 exact
primitive raw-difference hyperplanes, and a two-polarity invariant cover of
all nonzero integral characters. The cover has 38 terminal obstruction
regions; 36 representative characters lie on proper raw-zero faces, and all
42 feasible zero-sign branches are retained. The final report is
`scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_track_b_final.json`;
its file SHA-256 is
`8df14257a67805e1f7e1c365f3386659861265f89748e5609b17c147a1f1eb5a`
and its internal calculation digest is
`1778a529f57b1be74b62b445d98f3b639d21d3cc44125ac1b3d783e83e94e525`.
This proves the directed-link obstruction for the retained full
generalized-compression complex with the recorded pulling-height and tie
rule. It does not rule out a different subdivision, height construction, or
finite cover.

The generic exact interfaces are exercised with:

```bash
corepack pnpm exec vitest run \
  tests/scalable-height-cone.test.ts \
  tests/scalable-streamed-height-cone-search.test.ts \
  tests/streamed-rigorous-track-b-pipeline.test.ts \
  tests/streamed-height-arrangement.test.ts \
  tests/streamed-track-b.test.ts
```

Focused backend checks:

```bash
python -m scripts.discovery_runtime
python -m scripts.discovery_runtime --wsl
python -m unittest discover -s scripts/discovery_runtime/tests -p "test_*.py"
python scripts/torsion_free_finite_image.py --pure-self-test
python scripts/packed_composite_solver.py --self-test
sage scripts/torsion_free_finite_image.py \
  --input public/examples/compact_5_cube_gamma1.json \
  --prime 2 \
  --probe-only \
  --output /tmp/compact-cube-mod2-probe.json
```

The search is deliberately bounded. `exhausted` means only that the recorded
prime, degree, subgroup, module, byte, combination, and time limits were
exhausted. It is not a nonexistence or minimum-index result.

### Symbolic regular-kernel certificates

The high-index alternative keeps the regular congruence kernel through exact
deck-group orbit data instead of writing every vertex and cell. The TypeScript
model lives in `src/torsionFree/symbolicRegularCover.ts`; its focused software
test is:

```bash
corepack pnpm exec vitest run tests/symbolic-regular-cover.test.ts
```

A failed search with one coorientation variable per symmetry orbit is
inconclusive. A positive restricted solution can support a genuine fibering
certificate only after deterministic verifiers establish all of the following:

- a disjoint and exhaustive cell-poset orbit partition, with stabilizers and
  transporters;
- a complete two-sided wall partition and exact sign transport to every wall;
- zero cocycle sum on every rank-two cell orbit;
- a complete Reidemeister-Schreier presentation, zero value on every relator,
  and a primitive normalized map with explicit gcd and Bezout data;
- a compatible pulling subdivision and PL height construction;
- nonempty connected ascending and descending links at every vertex orbit.

Collapsibility is optional stronger evidence. SHA-256 binds the scientific
artifacts; short cache digests do not. The test command uses synthetic fixtures
and does not certify a compact-5-cube coorientation or fibering map.

Any exporter must emit `GeneratedCayleyBall` JSON as described in
`scripts/exact_export_contract.json` and `docs/data-format.md`. The app validates
that generated JSON rather than asking the browser to run Sage, GAP, or KBMAG.
For reproducible fixtures, pass `--created-at` explicitly so only mathematical
or cap changes appear in diffs. The input hash is computed from the exact input
file bytes, so formatting-only input changes intentionally change metadata.

GAP/KBMAG fixture commands, when the runtime is available:

```bash
python scripts/gap_kbmag_export_backend.py --input public/examples/I2_5.json --radius 5 --created-at 2026-01-01T00:00:00.000Z --output tests/fixtures/generated/I2_5_gap_radius_5.json
python scripts/gap_kbmag_export_backend.py --input public/examples/A2.json --radius 3 --created-at 2026-01-01T00:00:00.000Z --output tests/fixtures/generated/A2_gap_radius_3.json
python scripts/gap_kbmag_export_backend.py --input public/examples/A3.json --radius 6 --created-at 2026-01-01T00:00:00.000Z --output tests/fixtures/generated/A3_gap_radius_6.json
```

The bundled GAP fixtures were generated from WSL with:

```bash
python3 scripts/gap_kbmag_export_backend.py --input public/examples/I2_5.json --radius 5 --created-at 2026-01-01T00:00:00.000Z --output tests/fixtures/generated/I2_5_gap_radius_5.json --gap-executable /opt/miniforge3/envs/sage/bin/gap
python3 scripts/gap_kbmag_export_backend.py --input public/examples/A2.json --radius 3 --created-at 2026-01-01T00:00:00.000Z --output tests/fixtures/generated/A2_gap_radius_3.json --gap-executable /opt/miniforge3/envs/sage/bin/gap
python3 scripts/gap_kbmag_export_backend.py --input public/examples/A3.json --radius 6 --created-at 2026-01-01T00:00:00.000Z --output tests/fixtures/generated/A3_gap_radius_6.json --gap-executable /opt/miniforge3/envs/sage/bin/gap
```

If GAP or KBMAG is unavailable, those commands report `missing-runtime` or
`missing-kbmag` and leave the output file absent.

Backend parity report:

```bash
node scripts/compare_backends.mjs
node scripts/compare_backends.mjs --pair tests/fixtures/generated/A2_sage_radius_3.json tests/fixtures/generated/A2_gap_radius_3.json
```

The default mode scans `tests/fixtures/generated` for matching
`*_sage_radius_R.json` and `*_gap_radius_R.json` pairs. The report is
deterministic JSON and exits nonzero if any pair disagrees.

### Fibering research portfolio

The bounded rank-19 rescue, compact-action target planner, and JNW positive
control have separate replayable entry points:

```bash
corepack pnpm run cover:rescue:rank19
corepack pnpm run cover:positive-control:jnw
corepack pnpm run cover:verify:positive-control:jnw
corepack pnpm run cover:portfolio:compact-actions
corepack pnpm run cover:verify:portfolio:compact-actions
```

The compact planner does not start an external subgroup search by default. To
run the bounded, checkpointed discovery campaigns in priority order, pass:

```bash
corepack pnpm run cover:portfolio:compact-actions -- --execute-discovery true
```

If a P0 action passes, the runner first restricts it through the exact
index-two P1 kernel and replays the resulting P1 orbit actions. It launches an
independent P1 search only if that transfer supplies no passed action. Every
new compact action immediately receives a raw, action-rooted generic integral
H1/wall certificate. The present exact backend has a declared degree-4,096
bound, so compact actions (whose necessary degree is divisible by 28,800) are
recorded as incomplete there until a scalable backend replaces it. A passed
positive-rank result would automatically run the registered bounded exact
potential/order/pulling-and-stellar link screen; `b1 = 0` actions are
deprioritized. A completed screen with a survivor now selects the earliest
passing canonical point-order, constant-potential pulling trial when one
exists, falling back to the first passing trial only to preserve an explicit
unsupported-rule gap. The selected trial triggers a full replayed generalized
compression certificate with rooted source cells, all spherical-subgroup
fibres, and face compatibility. The exact full-\(H^1\) sign-face arrangement
runs only for a compatible selected trial and \(H^1\) rank at most four; it
includes lower-dimensional raw-zero faces and both tie polarities. Other
survivors are not exhaustively promoted. Incompatible rules, higher rank, and
declared resource stops retain a replayable `compression-sidecar-only` or
`incomplete` result rather than a negative claim.

Opt-in discovery outcomes that fail, time out, or finish without a materialized
action are not discarded. The portfolio embeds the raw discovery artifact and
binds its producer seal and complete effective bounds to the exact target
source and configured command. Fresh runs publish through a unique temporary
result, so a crashed rerun cannot masquerade as an old result; ordinary
no-discovery runs preserve replayable outcomes. Verification rebuilds this
non-passed evidence and keeps all post-action stages blocked; it does not
reinterpret bounded exhaustion as either torsion-freeness or a nonexistence
theorem.

The aggregate commands are:

```bash
corepack pnpm run research:portfolio
corepack pnpm run research:portfolio:rebind
corepack pnpm run research:portfolio:verify
```

See `docs/fibering-research-portfolio.md` for the exact stage semantics and
the nonclaims attached to bounded negative results.

### Generic external integral-H1 bridge

Large generic tree-gauge matrices can be passed through the source-bound
LinBox/nullspace and integral-lift bridge:

```bash
corepack pnpm cover:prepare:generic-h1 -- \
  --system SYSTEM.json --action ACTION.json --output-dir NEW_JOB_DIRECTORY
python scripts/generic_sparse_h1_bridge.py inspect-matrix boundary.linbox
g++ -std=c++17 -O2 scripts/generic_sparse_h1_rank_worker.cpp \
  -o generic_sparse_h1_rank_worker \
  $(linbox-config --cflags) $(linbox-config --libs)
./generic_sparse_h1_rank_worker boundary.linbox 30011 \
  kernel-p30011.txt rank-evidence-p30011.txt
python scripts/generic_sparse_h1_bridge.py emit-rank-certificate \
  request-without-rank-proof.json rank-evidence-p30011.txt rank-certificate.json
python scripts/generic_sparse_h1_bridge.py assemble request.json response.json
python scripts/generic_sparse_h1_bridge.py execute request.json response.json
python scripts/generic_sparse_h1_bridge.py replay request.json response.json
python scripts/generic_sparse_h1_bridge.py emit-witness request.json integral-kernel-witness.json
python scripts/test_generic_sparse_h1_bridge.py
```

The preparation command independently recertifies a raw finite-action
candidate (or the `candidate` in a wrapper), then creates the output directory
exclusively, publishes the checked artifacts, and publishes the hash/dimension
manifest last as the completion marker. It never overwrites an output
directory or file. See
[`docs/generic-h1-external-job.md`](../docs/generic-h1-external-job.md) for
its bounds and file contract.

The bridge records a LinBox rank only as backend output. It certifies the full
integral kernel only after replaying the separate generic proof-carrying rank
certificate (nonzero pivot minor plus identity-chart modular kernel). Without
that proof its strongest status is `verified-saturated-frame-only`. The strict
bounded request binds the preparation, exact sparse matrix, and accepted
torsion-free certificate. The protocol and TypeScript-generated cross-language
rank fixture are documented in
[`docs/scalable-generic-integral-h1.md`](../docs/scalable-generic-integral-h1.md).

This bridge is not yet a one-command fibering workflow. No CLI currently
constructs the final sealed request from the job manifest, consumes
`integral-kernel-witness.json` into the scalable Smith/wall completion, and
then hands every primitive height chamber to generalized compression and
all-cell link replay. Those adapter/orchestrator steps remain library or future
work; `emit-witness` is the last executable generic stage today.
