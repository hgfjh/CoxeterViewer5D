# Known Limits

CoxeterViewer5D is a research-preview viewer. These limits are part of the
interpretation of every result.

## Dense Complexes

Large covers and compressions cannot be read as one static picture. Use a
selected wall, a lawful-cell filter, and the inspector rather than expecting
every wall arc and relation face to remain legible at once. The viewer keeps the
1-skeleton crisp and treats unrelated cells as context.

## Finite Cover Input And Torsion-Free Discovery

The Coxeter matrix does not select a canonical finite cover. Selberg's lemma
guarantees that a finite-index torsion-free subgroup exists, but does not give a
practical index bound or subgroup generators.

Automatic bounded discovery is implemented as an external job. The browser
cannot execute GAP or Sage, so web runs consume its artifact; the desktop
bridge can launch the same controlled job queue. The ladder includes GAP
low-index search, exact Sage congruence kernels, and bounded diagonal products
of smaller permutation modules. Bundled and manually imported actions remain
available. Every rung can still exhaust its configured resource bounds without
settling existence or minimum index.

A congruence reduction can certify a torsion-free finite-index kernel before
its finite image order is known. That is an existence certificate, not an
exact-index claim and not a materialized cover. Exact quotient cells, walls,
and links require complete generator permutations for a manageable action.

In GAP discovery, failing to find a subgroup through index `N` means only that
the bounded search was exhausted through `N`. A resource-limited
run is inconclusive. Neither status may be displayed as nonexistence.

The browser checks action closure and relation cells, but a torsion-free claim
requires a complete prime-order fixed-point certificate or equivalent subgroup
evidence.

For the bundled infinite compact systems, the user-facing input must currently
be a complete finite coset action. The subgroup-word Sage/GAP exporters are
limited to finite Coxeter sources and do not turn arbitrary generators of a
compact hyperbolic subgroup into that action.

## Wall And Morse Claims

Wall classes, coorientation parity, lawful cells, and finite links are exact
for accepted finite input. They do not alone prove incoherence, asphericity, or
fibering. Track A additionally requires the appropriate cover, a globally
consistent wall coorientation, a finite compatible PL Morse model, a discrete
height on the associated cyclic cover, the bounded-height-band `pi_1`
surjection, and the kernel transfer to `H`. Asphericity and CAT(0) evidence are
optional stronger diagnostics for this finite-generation argument, not
promotion gates. Embeddedness and no-self-osculation are reported because they
support the paper's probabilistic orientation search; they are not separate
gates when one supplied orientation and all of its links are checked directly.

An explicit map `H -> Z` is a virtual algebraic-fibering candidate. Calling it
an epimorphism requires a primitivity check; claiming finitely generated kernel
also requires the applicable Morse hypotheses, not just visible arrows.

Compact hyperbolic 5-dimensional Coxeter systems can have spherical triples and
need not lie in the paper's two-dimensional NPC setting. This prevents blindly
importing that asphericity package, but it does not obstruct the direct
finite-height-band argument on the actual lawful PL complex. Their wall
calculations remain diagnostics until the PL height, complete directed links,
finite-band certificate, and kernel transfer are established.

The direct compact-action branch now promotes one fixed wall character without
first computing full integral `H^1`. It certifies the primitive character,
generalized compression, and full-`K` directed links for both canonical offset
polarities. A two-polarity failure is only an obstruction for that action,
character, canonical quotient-point pulling order, and zero periodic
potential. It says nothing about another character, cocycle representative,
subdivision, cellulation, or finite cover.

The independent scalable branch replays proof-carrying full integral `H^1`,
generalized compression, the exact intrinsic height arrangement, and all-cell
links. Its callback-free JSON profile reconstructs the action, oracle, and
streamed preparation without trusting caller functions. The exhaustive
arrangement currently supports ranks one through four; a higher-rank or
resource stop is `incomplete`, not a negative result. The LinBox worker still
stores a dense `columns x nullity` nullspace, which is the main memory limit
when both quantities are large. Track B also currently packs
`degree x generatorCount x b1` exact-integer section entries, behind a
certificate-bound allocation cap.

No current artifact certifies smooth fibering or any bundle over the circle;
Track A and Track B certify a virtual algebraic fibration only (see
[two-track-fibering-certification.md](two-track-fibering-certification.md)). Collapsible directed links are
only one hypothesis of the relevant manifold theorem. The repository does not
yet replay a source-bound compact-smooth-manifold, compatible PL, and smoothing
certificate, so legacy caller-supplied IMM-style booleans are ignored.

## Low-Barycentric Route Limits

The low-barycentric scorer and search
(low-barycentric-morse.md) give exact scores, not
certificates. As of 2026-10-04:

1. The route produces no replayable certificate: it records no collapse
   sequences per link class, and there is no independent verifier.
2. `pnpm lowbary:score` and `pnpm lowbary:search` report the period gcd of the
   orientation's wall cocycle (`periods`): gcd 0 means a zero class, otherwise
   `H -> Z` has image `gcd·Z` and dividing by the gcd gives the primitive
   class. There is no Schreier/Bezout certificate of the image as in Track A
   step 13.
3. There is no generic, scalable step that passes from a cover with one-sided
   walls to a further cover on which they are two-sided (see
   [math.md](math.md#coorienting-walls)). When they compute wall sides from
   the action, both CLIs stop on a one-sided wall. For H5-P7-22 this step
   was one-off Python in `scripts/h5_p7_22/`.
4. The CP-SAT forced-failure lower bound
   (`scripts/h5_p7_22/min_forced_failures.py`) is Python-only and needs
   OR-Tools.
5. IMM's manifold hypotheses (compact smooth manifold, dimension at most 5,
   compatible affine structure) are argued in the docs, not machine-checked.
   An objective of `(0, 0)` is therefore not a fibering certificate.

The search is a local search. It cannot prove that no orientation passes; a
negative claim needs a separate lower bound. An `undecided` vertex means a
collapse search ended without a decision, not that the link is
non-collapsible. The scorer has no rank limit. A cell with more than 128 tied
minima stops the run, unless the scorer is prepared to count such cells as
undecided. The packed wall-sides file holds at most 128 walls.

## Bundled Compact Sources

As of 2026-10-04 every known compact hyperbolic Coxeter 5-polytope with 7, 8 or
9 facets is bundled: the 7-facet prisms P0, P2 and H5-P7-22 plus `P1 = D P0`
(Emery–Kellerhals), the 16 eight-facet cases of Tumarkin, and the 51 nine-facet
cases of Ma–Zheng. The H5-P7-22 and nine-facet certificates
(`scripts/certify_compact_5d_catalogue.py`) cover source transcription and
Gram signature only. Rank 6 and inertia `(5,1,n-6)` come from 80-digit
eigenvalues, the same standard as `certify_tumarkin_8facet.py`. That certifier
runs no CoxIter or Vinberg compactness check. Each of the 52 examples also
carries a separate stored CoxIter diagram artifact
(`scripts/certificates/coxiter/`) that reports the diagram as cocompact, with
the f-vector and Euler characteristic; `pnpm check:independent` reruns those
CoxIter checks. CoxIter's numerical signature is not used. There
is no quotient, manifold or Morse certificate for these sources, and their
geometric coordinates are numeric.

"Every known" rests on the published classifications. One point is unchecked:
P1 is combinatorially a 7-facet prism, but it is not in Ma–Zheng's
three-diagram figure of compact simplicial prisms in `H^5`. Whether
Kaplinskaja's list (through Esselmann's `d+2` theorem) counts it separately has
not been checked against Kaplinskaja's paper or Felikson's tables.

## H5-P7-22

The compact hyperbolic Coxeter 5-prism H5-P7-22 (rank 7) is packaged in
`h5-p7-22_index39628800/`, and its source is bundled as the viewer example
`compact_5_prism_h5_p7_22` (the 39.6M-point cover is not part of the example). The certified cover `Γ`, the Sylow-7 pullback in
`PO_6^-(7)`, has index 39,628,800, is torsion-free and has Euler
characteristic 0. Its action was rebuilt from the mod-7 representation
(`scripts/h5_p7_22/build_action.py`), and `pnpm bench:pipeline` with 8 workers
runs on it in about 12 minutes. Ten of its 20 wall classes, every lateral/`s5`
wall, are one-sided, so `Γ` has no wall orientation. The linear Sylow pullback
`Γ+` in `O_6^-(7)` has index 79,257,600 and all 30 of its walls are two-sided.
A CP-SAT lower bound shows that every orientation of `Γ+` has at least 818,128
chambers that fail the first gate, so no wall orientation of `Γ+` gives a
fibering by the low-barycentric construction. The bound is a solver result
(`scripts/h5_p7_22/min_forced_failures.py`), not an independently replayed
certificate. It is scoped to that construction and that cover; it says nothing
about another cover, character or Morse function.

## Compact Research Registration Limits

The schema-v2 compact manifest records seven targets, but registration is not
permission to run every lane. P0/P1 and the #06/#15 comparison accept finite
action evidence only while their policies are active and only at their
capacity-audited allowed degree tiers; an off-tier action is rejected rather
than merely labeled. P2's registry and raw-action attachment lane is
coarse-only, although an exact factored fine edge/Coxeter-cell oracle is bound
for the fixed-character calculations. G12221 is recorded as a deferred contrast,
not excluded, but action attachment remains disabled until its queue is
explicitly activated. H5-P7-22 is still registered as an `import-required`
placeholder in `src/fibering/compactResearchTargets.ts` and the generated
portfolio JSONs, although its source is now bundled; that entry is stale (as of
2026-10-04).

The completed Makarov `P_1` degree-28,800 structural pilot is also
scope-limited. It exactly normalizes the 34 `s_6` classes and propagates the
three rank-two braid/freeness constraints through rooted `H_3`-torsor maps,
including twists. It does not complete the global matching or replay every
maximal spherical subgroup for a surviving seed. Since all 34 classes retain
large local frontiers, the result archives that bounded solver branch but does
not obstruct a nonnormal subgroup of `P_1` or `P_0`.

Manifest-only replay validates source bindings and nested hashes. A
callback-free scalable certificate can rebuild from its embedded JSON input;
a legacy runtime-provider certificate still needs its original external proof
inputs for full mathematical replay. The P2 finite-field importer now replays
the complete bundled incidence and coloring artifacts and certifies a split
\(\mathbb Z^{144}\) subgroup of the closed colored manifold's first homology.
It does not compute the full integral first homology. Two primitive cocycles
in distinct exact reflection eigensectors are now materialized and
independently checked on the dual triangulation of `X`, then pulled back to the
closed colored manifold. Their opposite `s4` eigenvalues make their nonzero
rational classes linearly independent over \(\mathbb Q\). Their factored
Coxeter-cell Track B runs reject only the same cheap identity-first pulling
order and both tie polarities at the identity. A separate
coarse order-complex run for the first class rejects the two canonical
dimension perturbations at one translation-reduced root. None of these scoped
results obstructs either character or tests every potential, order,
subdivision, class, or cover.

For the primitive type-6 wall cocycle, both the ascending and descending links
at the identity are connected and nonempty for pulling polarity $-1$.
The exact type-6/Fourier follow-up covers all chamber roots and every constant-
and zero-Fourier maximal type-5 link in its declared family. That intermediate
gate left 24 maximal-type5 candidates. The subsequent endpoint-hub certificate
discharges every type-6 center, and the compiled rank-four full-star batch
eliminates all six representative classes, hence all 24 candidates. This
closes the declared 128-candidate height family. It does not obstruct another
character, periodic potential, subdivision, or P2 virtual fibering.

A bounded quotient-periodic `R2` extension was then checked exactly. Its quick
gates close all 72 pairs over the old 24-candidate frontier. Across the full
`128 x 3` product, the old and new quick gates eliminate 344 of 384 pairs and
leave 40 resurrected `c=+1` pairs in ten classes. The compiled maximal-type-5
scan eliminates all ten classes after 2,334 of 5,078 cell-orbit rows, and
independent Python full-fiber replay verifies all ten representative failures.
This closes only that `R2` coordinate, coefficient set, action, primitive
character, and canonical barycentric subdivision. Other periodic cell
coordinates, coefficient families, primitive characters, subdivisions, and
Track B remain open.

For wall Track A, one exact calculation proves that the explicit primitive
class is not in the rational wall-cochain span, even after adding a periodic
coboundary or passing to a nonzero integral multiple. A second exact parity
calculation proves that every generator-5 wall in the current cover is
one-sided. Thus no full wall coorientation exists there, and strict wall Track
A stops before its lawful-cell closure and directed links are defined. This
also rules out the natural 16-fold repair and the stated class of extensions
which alter only generator-5 color columns while leaving side voltages zero.
It does not rule out direct-cocycle Track A, facet-specific or side-voltage
extensions, odd-prime covers, or an arbitrary further finite cover. The
finite-height-band/$\pi_1$-surjection gate has not been
reached. The local mixed-potential probe repairs the former root-link
obstruction but does not replace a global direct-cocycle link calculation.

The generic Track A wall preflight makes this boundary explicit for any
materialized finite rank-two quotient. It certifies wall cleanliness and can
find or exhaust bounded global coorientations for original-vertex rank-two
links. Even a `rank-two-feasible` result is not a coface-closed higher-cell,
subdivision-link, finite-height-band, or fibering certificate. Its bundled JNW
run is a two-dimensional positive-control calibration; no P2 rank-two result
is inferred from it. P2 instead has a source-bound availability record saying
that strict wall Track A stops at the already-certified one-sidedness gate on
the current cover. That record does not invent a rank-two complex or a local
Morse calculation.

The rank-312 binary cover does have a complete voltage-graph description of
its sheet-resolved wall components. An unrestricted assignment passes the
ascending and descending rank-two links at 2,560 sampled original vertices
using 32,768 cells and 2,736 actual component variables. This is a bounded
frontier only: global compatibility, coface-closed higher cells, subdivision
vertices, and the finite-height-band gate have not been checked. A compact
radius-one rule was tested one step farther and fails at 96 radius-two
vertices.

A separate Niblo--Reeves cubical calculation on this same rank-312 cover now
does more locally: the canonical wall coorientation passes every sheet-zero
universal cubical link through radius three, a total of 261,252 states, and an
explicit length-6,105 stabilizer word has period `-1`. Hence the associated
integral character is primitive. It nevertheless fails globally. The exact
all-sheet principal calculation finds a reachable Hamming-weight-56 sheet on
which one ascending root is isolated. The same mask-separation argument closes
every sheet-independent projected-wall-constant flip family. Genuine
sheet-resolved component orientations and compatible sheet-dependent
potentials remain open; their component keys vary with the sheet and are not
covered by this obstruction.

For the odd-characteristic cover, the exact finite image is now the spinor
kernel in `O(7,9)`, of order `108051462804999168000`. This does not determine
the cover degree because the Section-5 stabilizer is nonnormal; only a divisor
40 of its image order is certified. The stored projective-root flip candidate
has explicit full-link and point-stabilizer failures. Actual quotient wall
components, global flips, lawful closure, and subdivision links remain open.

The `H_1(X)=\mathbb Z^{144}` input is source-reported: the
bounded Sage replay failed on dense FLINT allocation and GAP/HAP was not
installed. Remote paper/notebook hashes remain bindings unless those bytes are
explicitly supplied to the Python replay command.

## Projection Caveats

Geometric mode draws chamber barycenters in 3D. High-dimensional axes choices
and PCA are projection conventions. Do not read Euclidean distances, angles,
or apparent intersections as hyperbolic facts unless an attached certificate
states a narrower verified bound.

## Non-Planar Gamma

The defining graph can be non-planar. Its 2D view may contain crossings when a
crossing-free embedding does not exist; detected `K5` or `K3,3` subdivisions
are shown as obstructions. Gamma includes finite `m = 2` edges and omits
`m = inf` pairs.

## Search Limits

Optimization over wall coorientations is exponential in the worst case. Small
wall systems use exact branch-and-bound. Larger or budget-limited searches are
reported as **best found**, with bounds and a gap when available. A timed result
is never relabeled as a maximum.

## External Tool Constraints

Sage, GAP/KBMAG, CoxIter, and related tools are optional. The app runs without
them, but automatic cover discovery will require an external algebra backend.
The documented CoxIter feature set does not include low-index subgroup search;
it remains a diagram checker. Missing tools produce skipped or blocked statuses
rather than weaker claims.
