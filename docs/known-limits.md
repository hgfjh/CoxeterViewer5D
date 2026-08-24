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
fibering. The Jankiewicz--Wise theorem uses further hypotheses, including the
appropriate cover, a globally consistent wall coorientation, and an
affine/aspherical Morse complex. Embeddedness and no-self-osculation are
reported because they support the paper's probabilistic orientation search;
they are not separate gates when one supplied orientation and all of its links
are checked directly.

An explicit map `H -> Z` is a virtual algebraic-fibering candidate. Calling it
an epimorphism requires a primitivity check; claiming finitely generated kernel
also requires the applicable Morse hypotheses, not just visible arrows.

Compact hyperbolic 5-dimensional Coxeter systems can have spherical triples and
need not lie in that two-dimensional setting. Their wall calculations are
diagnostics unless the missing hypotheses are established independently.

The manageable end-to-end promotion searches characters induced by wall
coorientations. It does not exhaust every primitive class in the full integral
`H^1`. The scalable generic `H^1` backend certifies the large sparse boundary,
integral kernel, and saturation data, but its emitted witness is not yet wired
into the generalized-compression, height-chamber, and all-cell link
orchestrator. Its current LinBox worker also stores a dense
`columns x nullity` nullspace, which is the main remaining memory limit when
both quantities are large.

No current artifact certifies smooth fibering. Collapsible directed links are
only one hypothesis of the relevant manifold theorem. The repository does not
yet replay a source-bound compact-smooth-manifold, compatible PL, and smoothing
certificate, so legacy caller-supplied IMM-style booleans are ignored.

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
