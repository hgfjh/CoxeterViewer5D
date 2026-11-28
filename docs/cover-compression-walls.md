# From A Finite Cover To Walls

This note records the conventions used by the Covers + Walls workflow. The
primary reference is Jankiewicz and Wise, _Incoherent Coxeter Groups_.

The entry point is a Coxeter system plus a finite-index torsion-free subgroup,
given by its coset action. The action either comes from automatic discovery
([torsion-free-cover-discovery.md](torsion-free-cover-discovery.md)) or is
supplied by the user, small or as a packed `generator-permutation-files`
manifest (compact-action-import.md). Background
and proofs are in [math.md](math.md); this note covers the workflow and the
viewer.

## The Base Presentation Complex

For a Coxeter presentation

```text
W = <s_1, ..., s_r | s_i^2, (s_i s_j)^m_ij>,
```

let `X` be the standard one-vertex presentation 2-complex. It has a directed
generator loop for each `s_i`, a bigon for `s_i^2`, and a `2m_ij`-gon for every
finite pair.

## The Finite Cover `hat X`

A complete finite permutation action, whether discovered or imported,
describes the lifts of the presentation cells. If the action has degree `d`,
`hat X` has `d` vertices, `d r` directed generator lifts, and `d r` lifted
generator bigons. For each finite pair `{i,j}`, it also has `d` lifts of the
`(s_i s_j)^m_ij` cell. This is the ordinary covering-space count: every open
cell of the one-vertex presentation complex has one lift over each of the `d`
points in a generic fiber. Relation words must close at every action point.
The viewer reconstructs these lifts rather than treating imported display
cells as the cover.

For a generator `s_i`, the bigon based at `x` follows

```text
e(x,i) e(x s_i,i).
```

The distinct bigon based at `x s_i` follows the cyclically shifted boundary
`e(x s_i,i) e(x,i)`. Thus two lifted bigons share the same two directed edges.
Keeping both cells is necessary for `hat X` to be the literal cover of `X`.

The action can be exact while torsion-freeness remains unproved. Those statuses
are stored and displayed separately.

### Automatic discovery

The automatic backend uses the Tits torsion criterion. It enumerates
prime-order torsion representatives inside the maximal spherical special
subgroups, then tries exact Sage finite-image/congruence reductions,
recognition and fixed-point marks, complementary permutation-module products,
and finally a small GAP low-index excluded-conjugate fallback. A resulting
coset action is accepted only when every representative acts without fixed
points.

This is a bounded search. A completed search through index `N` can rule out a
qualifying subgroup only through `N`; an interrupted search is inconclusive.
Every selected action is checked again before this construction runs.
CoxIter is used for diagram checks, not subgroup discovery. Full details and
source links are in
[Automatic torsion-free cover discovery](torsion-free-cover-discovery.md).

## The Compression `bar X`

For each two-point orbit `{x, x s_i}`, the two lifted `s_i^2` bigons and their
two directed boundary edges collapse to one geometric edge. Relation-cell
lifts that acquire the same signed boundary are identified. Under the free
finite-pair action assumed in the paper, a finite pair contributes
`d/(2m_ij)` compressed polygons.

Each compressed polygon has a fiber of exactly `2m_ij` lifted cells because
`W_ij = <s_i,s_j>` acts freely on the cover vertices when `H` is torsion-free;
the orbit-stabilizer argument is in
[math.md](math.md#the-finite-dihedral-orbit-calculation).

The compression certificate checks counts, closure, two directed edges and two
bigons over every compressed edge, `2m_ij` relation cells over every compressed
polygon, complete source coverage, and equality of signed boundaries.

### Reading many relation cells

The shared compression is the exact gluing, but it is often a poor overview:
many relation cells use the same small set of vertices and edges. The viewer's
spread drawing keeps that one quotient 1-skeleton and bends disk interiors away
from it. Cells are grouped by the corresponding finite edge of Gamma. Selecting
one group rearranges the actual quotient vertices so its four attaching cycles
are legible while all other generator rails remain as faint gluing context.

For the ideal 3-cube cover, `d = 24` and every finite pair has `m = 3`. Hence
each of the twelve finite pairs contributes four compressed hexagons, for 48
hexagons in total. The full spread view places their interiors in twelve
four-cell lanes, but all 48 disks remain attached to the original 24 vertices
and 72 generator rails. Interior fold points, spacing, and apparent flatness are
drawing conventions. No boundary occurrence is duplicated. Return to
**Compact gluing** before reading walls or the undeformed 1-skeleton.

## Walls

In a `2m`-gon, boundary occurrences `k` and `k + m` are opposite. Generate an
equivalence relation on geometric edges by declaring every opposite pair
equivalent. A wall vertex lies at the midpoint of each dual edge, and a wall
segment crosses a relation cell between opposite edge midpoints.

The midpoint drawing is not the definition. The exported wall records contain
the exact dual edges, cells, opposite occurrences, and orientation parity.
The implementation computes the transitive closure with a disjoint-set data
structure, then solves the signed opposite-side constraints on each component
to detect one-sided walls. The complete algorithm, including the parity
formula and exact-versus-heuristic coorientation search, is in
[Certifying a virtual algebraic fibration](virtual-algebraic-fibering.md#3-find-walls-algorithmically).

### Reading walls in the viewer

Open `bar X` and use **Read walls and induced directions**:

- **All walls** keeps every wall class and its dual edges visible.
- **Selected wall** brightens one wall, its dual edges, and the relation cells
  it crosses while leaving the rest as faint context.
- **Color dual edges by wall** gives a wall and every edge dual to it the same
  color. The edge label still names the Coxeter generator.
- **Show induced edge arrows** displays the transverse direction determined by
  the current coorientation.

The arrowheads belong to the edges of `bar X`, not to the colored wall arcs. A
wall is cooriented transversely; it is not oriented along its own length.
Flipping `W_i` reverses exactly the arrows on edges dual to `W_i`. Wall colors,
midpoint nodes, straight crossing arcs, transparency, and arrow size are
drawing choices. The wall equivalence classes, parity propagation, and induced
edge directions are exact finite combinatorics for the loaded compression.

## Coorientations And Lawful Cells

A two-sided wall admits a consistent choice of transverse direction, which
Jankiewicz--Wise call an orientation of the wall and the UI calls a
coorientation. A one-sided wall admits none, so any route that starts from a
wall orientation must first replace a cover with one-sided walls by a further
finite cover; the repo has no generic step for that. Choosing one sign per wall directs all edges of `bar X`. Read those directions along the
boundary of a relation polygon. It is lawful exactly when the cyclic sign word
has two transitions. Equivalently, the boundary consists of two positive paths
from one source to one sink.

For fixed wall signs, the lawful subcomplex is unambiguous: keep the full
1-skeleton and every lawful polygon. Searching for wall signs that retain the
largest total cell weight is a separate optimization layer added by this app.

The coorientation also defines a cellular map to `S^1` and a homomorphism
`H -> Z`. A reproducible virtual algebraic-fibering record includes its values
on Schreier generators, all boundary sums, a primitivity check, and the
ascending and descending links. The map is not called an algebraic fibration
unless the hypotheses for finite generation of its kernel carry evidence.

The lawful subcomplex is the Track A route. The same wall orientation can
instead be scored on the full Davis quotient (Track B) or on its
low-barycentric subdivision; see [math.md](math.md#three-analysis-routes).

## Theorem Boundary

The finite algorithms do not prove all hypotheses of the paper. Applying its
incoherence conclusion requires the relevant cover and subgroup evidence, the
paper's dimension/asphericity and Euler-characteristic hypotheses, and its
group-theoretic conditions. For Track A finite generation, the direct
Bestvina--Brady bounded-band argument instead requires a globally consistent
coorientation, a finite compatible PL Morse model, a discrete cyclic-cover
height, and nonempty connected directed links; asphericity is optional stronger
evidence. Embeddedness and absence of self-osculation are
reported separately because they support the paper's probabilistic existence
argument; direct certification of a supplied orientation uses its actual cell
sums and links. Selberg's lemma guarantees virtual torsion-freeness; it does
not certify the particular subgroup used by a run.
