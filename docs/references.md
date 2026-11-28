# References

This file records what each source supports. A citation establishes provenance;
it does not certify a particular imported JSON file. Example certificates and
hashes remain responsible for that narrower job.

## Reidemeister--Schreier Presentations

- Otto Schreier, **Die Untergruppen der freien Gruppen**,
  _Abhandlungen aus dem Mathematischen Seminar der Universitat Hamburg_ 5
  (1927), 161--183.
  - Introduces the classical Schreier method for constructing subgroup
    generators and bases in free groups.
  - DOI: https://doi.org/10.1007/BF02952517

- Kurt Reidemeister, _Einfuhrung in die kombinatorische Topologie_, Vieweg,
  Braunschweig, 1932.
  - One of the original sources for the subgroup-presentation theorem now
    called the Reidemeister--Schreier theorem.

- Roger C. Lyndon and Paul E. Schupp, _Combinatorial Group Theory_, Springer,
  1977; reprinted in the Classics in Mathematics series, 2001.
  - Standard modern reference for presentations, free groups, subgroup
    rewriting, and related combinatorial group theory.
  - DOI: https://doi.org/10.1007/978-3-642-61896-3

- Charles F. Miller III, **Combinatorial Group Theory**, lecture notes, 2002.
  - Section 4.2 gives the maximal-tree/coset-graph construction of Schreier
    generators. Theorem 4.3 states the Reidemeister--Schreier presentation and
    Corollary 4.4 records finite generation and finite presentability for
    finite-index subgroups.
  - PDF: https://www.macs.hw.ac.uk/~lc45/Teaching/kggt/miller.pdf

- Charles C. Sims, _Computation with Finitely Presented Groups_, Cambridge
  University Press, 1994, Chapter 6, **The Reidemeister--Schreier procedure**.
  - Supports the computational view: coset data, subgroup generators,
    relator rewriting, and subsequent presentation simplification.
  - DOI: https://doi.org/10.1017/CBO9780511574702.008

The app uses left cosets with a right action, a deterministic spanning-tree
transversal, one retained generator per non-tree geometric edge, and one
rewrite of each Coxeter relator at every action point. The exact convention and
formulas are documented in
[Certifying a virtual algebraic fibration](virtual-algebraic-fibering.md).

## Cover Compression, Walls, And Morse Theory

- Kasia Jankiewicz and Daniel T. Wise, **Incoherent Coxeter Groups**,
  arXiv:1503.03102.
  - Section 2.1 defines the standard Coxeter presentation complex `X`, the
    finite torsion-free cover `\hat X`, and its compression `\bar X` by
    collapsing lifted generator bigons and identifying `2m_ij` relation cells
    with the same boundary. Its count of `d` uncompressed relation cells per
    finite pair and `d/(2m_ij)` compressed cells is the orbit count implemented
    by the compression certificate.
  - Section 2.2 defines parallel 1-cells, abstract walls, wall graphs,
    embeddedness, two-sidedness, and self-osculation.
  - Section 2.3 defines the two orientations of a two-sided wall. The app also
    calls an orientation a coorientation, to emphasize the induced direction on
    dual 1-cells; the two words name the same thing.
  - Sections 2.4--2.5 define ascending and descending links, the induced map to
    `S^1`, and the lawful subcomplex.
  - Theorem 3.1 states the virtual algebraic-fibering conclusion for the
    uniform-exponent family: a finite-index torsion-free subgroup maps onto
    `Z` with finitely generated kernel.
  - Section 3.3 obtains finite generation first for the lawful-subcomplex
    kernel and then passes to its quotient in the compressed complex.
    Corollary 3.2 proves that this kernel is not finitely presented only after
    adding Bieri's cohomological-dimension theorem and the positive
    Euler-characteristic argument. Failure of a link test alone does not give
    that conclusion.
  - The paper supports the mathematical model. It does not support the app's
    extra optimization objective of maximizing retained lawful cells over all
    coorientations.
  - Repo use: the definitions and the lawful-subcomplex argument behind
    Track A ([virtual-algebraic-fibering.md](virtual-algebraic-fibering.md)),
    and the wall vocabulary used by the low-barycentric scorer.
  - arXiv abstract: https://arxiv.org/abs/1503.03102
  - PDF: https://arxiv.org/pdf/1503.03102

- Brent Everitt, **Coxeter groups and hyperbolic manifolds**,
  _Mathematische Annalen_ 330 (2004), 127--150; arXiv:math/0205157.
  - Theorem 4 states that every finite-order element of a Coxeter group is
    conjugate into a finite spherical special subgroup.
  - Proposition 1 states that a transitive permutation module is torsion-free
    exactly when representatives of every prime-order torsion conjugacy class
    have no fixed points.
  - Lemma 1 gives the diagonal-product rule: a torsion class is avoided by the
    product when at least one factor avoids it. This is the source for the
    composite permutation-module backend.
  - The discussion following Lemma 3 gives the divisibility lower bound from
    the least common multiple of finite-subgroup orders.
  - These results support the finite certificate used by automatic cover
    discovery; they do not provide a practical smallest-index search bound.
  - arXiv abstract: https://arxiv.org/abs/math/0205157
  - PDF: https://arxiv.org/pdf/math/0205157

- Brent Everitt and Colin Maclachlan, **Constructing Hyperbolic Manifolds**,
  arXiv:math/9907139.
  - Section 2 constructs finite representations by reducing an invariant
    number-field lattice modulo prime ideals.
  - Proposition 1 gives the finite-stabilizer image-order criterion for a
    torsion-free kernel. The backend uses the Coxeter-wide version: every
    maximal spherical special subgroup must retain its exact order.
  - PDF: https://arxiv.org/pdf/math/9907139

- Mladen Bestvina and Noel Brady, **Morse theory and finiteness properties of
  groups**, _Inventiones Mathematicae_ 129 (1997), 445--470.
  - Supports the affine-cellular Morse framework and finiteness criterion used
    by Jankiewicz--Wise.
  - Corollary 2.6(3) is the source for the Track A bounded-height-band step:
    connected ascending and descending links make the fundamental group of a
    bounded band surject onto the fundamental group of the cyclic cover. The
    band is a compact finite polyhedron (after subdividing where its boundary
    cuts cells), so the character kernel is finitely generated. This local
    argument does not require the lawful quotient to be aspherical.
  - Theorem 4.1 gives stronger group-action criteria, including the
    simply-connected-link route to finite presentation, under its stated
    hypotheses.
  - The viewer reports local link diagnostics, but promotion additionally
    requires the finite PL height, cyclic-cover/band evidence, character, and
    kernel-transfer records.
  - Repo use: the first gate. Nonempty, connected ascending and descending
    links at every vertex give a finitely generated kernel, that is, a virtual
    algebraic fibration. Track A, Track B and the low-barycentric scorer all
    test this gate.
  - DOI: https://doi.org/10.1007/s002220050168
  - Author-hosted scan: https://people.math.osu.edu/davis.12/courses/8800-20/Bestvina-Brady.pdf

- Mladen Bestvina, **PL Morse theory**, _Mathematical Communications_ 13
  (2008), 149--162.
  - Gives a concise account of affine cell complexes, equivariant height
    functions, ascending and descending links, and the local changes in level
    sets used by combinatorial Morse theory.
  - The full Davis-quotient certificate uses this as background for the
    lifted, piecewise-affine height. Its exact rational perturbation and
    pulling-triangulation checks are project-specific finite proof
    obligations, not claims made by these notes.
  - PDF: https://www.math.utah.edu/~bestvina/eprints/minicourse.pdf

- Giovanni Italiano, Bruno Martelli, and Matteo Migliorini, **Hyperbolic
  5-manifolds that fiber over `S^1`**, _Inventiones Mathematicae_ 231
  (2023), 1--38; arXiv:2105.14795. Cited in the repo as IMM.
  - Theorem 8: on a compact smooth manifold of dimension at most five,
    decomposed as an affine cell complex with compatible PL structure, a
    circle-valued Morse function whose ascending and descending links are all
    collapsible is homotopic to a smooth fibration.
  - Sections 1.11--1.12 prove collapsibility of ascending and descending links
    for their explicit cellulation and subdivision, including the new vertex
    types introduced by the subdivision. They call the I/O label of a facet
    its status.
  - Repo use: the second gate (both directed links collapsible) and the
    low-barycentric subdivision convention of
    docs/low-barycentric-morse.md, including the
    face link / coface link join. The manifold hypotheses of Theorem 8 are
    argued in the docs, not machine-checked. The app records collapsibility as
    a stronger diagnostic and does not transfer the fibration conclusion to an
    arbitrary Davis quotient.
  - arXiv abstract: https://arxiv.org/abs/2105.14795
  - PDF: https://arxiv.org/pdf/2105.14795
  - DOI: https://doi.org/10.1007/s00222-022-01141-w

- Robert Bieri, _Homological Dimension of Discrete Groups_, second edition,
  Queen Mary College Department of Pure Mathematics, London, 1981.
  - Jankiewicz--Wise invoke Bieri in Corollary 3.2: a nontrivial finitely
    presented normal subgroup of a group of cohomological dimension at most
    two is free or has finite index.
  - This result is one input to their non-finite-presentability argument. It
    does not turn a failed local-link check into such a conclusion.

- Kasia Jankiewicz, Sergey Norin, and Daniel T. Wise, **Virtually Fibering
  Right-Angled Coxeter Groups**, arXiv:1711.11505.
  - Supports the legal-system construction for right-angled Coxeter groups
    (Section 2, "Systems of moves and legal states"; Theorem 4.3). A state of
    the defining graph is a subset `S` of its vertex set, legal when `S` and its
    complement both induce nonempty connected subgraphs. In the proof of
    Theorem 4.3 the state at a 0-cube is the set of outgoing (ascending)
    1-cubes there, so a legal orbit gives nonempty connected directed links.
    The repo uses "state" only in JNW-specific code and docs, and elsewhere
    keeps to Jankiewicz--Wise link terminology.
  - Repo use: the JNW cube-graph positive control
    (`pnpm cover:positive-control:jnw`, `src/fibering/jnwCubePositiveControl.ts`,
    `src/game/`), and comparison with the general model. The main pipelines use
    wall orientations in `\bar X`, which apply to general even Coxeter relation
    polygons, and do not present the right-angled legal-system game as the
    general model.
  - arXiv abstract: https://arxiv.org/abs/1711.11505

- Giovanni Italiano, Bruno Martelli, and Matteo Migliorini, **Hyperbolic
  manifolds that fiber algebraically up to dimension 8**, arXiv:2010.10200.
  - Constructs cusped finite-volume hyperbolic `n`-manifolds, `5 <= n <= 8`,
    with finitely generated kernel, using colourings and JNW states on
    right-angled polytopes.
  - Repo use: literature framing only. It is a right-angled, cusped
    application of the JNW/Bestvina--Brady method, not a closed example.
  - arXiv abstract: https://arxiv.org/abs/2010.10200

## Abstract Virtual Fibering Results

These results are cited for literature framing: they give the abstract
existence of a finite-index algebraic fibration for the compact hyperbolic
Coxeter groups of dimension at least 3 studied here (virtually RFRS, with
vanishing first L²-Betti number), so an explicit finitely generated kernel
produced by the repo is explicit rather than new. They do not apply to the
two-dimensional toy examples, whose first L²-Betti number is nonzero. None of
them supplies an explicit character or cover. Agol's theorem that every closed
hyperbolic 3-manifold virtually fibers (I. Agol, _The virtual Haken
conjecture_, Doc. Math. 18 (2013), 1045–1087, arXiv:1204.2810) is cited in the
C44 writeup to place that 3-dimensional example as a calibration of the method.

- Dawid Kielak, **Residually finite rationally solvable groups and virtual
  fibring**, _Journal of the American Mathematical Society_ 33 (2020),
  451--486; arXiv:1809.09386.
  - A finitely generated RFRS group virtually algebraically fibres (finitely
    generated kernel) if and only if its first `L^2`-Betti number vanishes.
  - arXiv abstract: https://arxiv.org/abs/1809.09386
  - DOI: https://doi.org/10.1090/jams/936

- Sam P. Fisher, **Improved algebraic fibrings**, _Compositio Mathematica_ 160
  (2024), 2203--2227; arXiv:2112.00397.
  - A virtually RFRS group of type `FP_n(Q)` virtually algebraically fibres
    with kernel of type `FP_n(Q)` if and only if `b_p^(2)` vanishes for
    `p <= n`.
  - arXiv abstract: https://arxiv.org/abs/2112.00397
  - DOI: https://doi.org/10.1112/S0010437X24007309

- Sam P. Fisher, **Algebraic fibrings of a hyperbolic 7-manifold**,
  arXiv:2203.01125 (accepted in the _Bulletin of the London Mathematical
  Society_ according to the arXiv comments).
  - A finite cover of the IMM cusped 7-manifold algebraically fibres with
    finitely presented kernel of type `FP(Q)`. Repo use: literature framing
    (cusped, right-angled origin).
  - arXiv abstract: https://arxiv.org/abs/2203.01125

- Frederic Haglund and Daniel T. Wise, **Coxeter groups are virtually
  special**, _Advances in Mathematics_ 224 (2010), 1890--1903.
  - Coxeter groups are virtually special, hence virtually RFRS; this is the
    input that lets the Kielak and Fisher criteria apply to the Coxeter groups
    in this repository.
  - DOI: https://doi.org/10.1016/j.aim.2010.01.011

- Noel Brady, **Branched coverings of cubical complexes and subgroups of
  hyperbolic groups**, _Journal of the London Mathematical Society_ (2) 60
  (1999), 461--480.
  - Question 7.2 (as cited by IMM, arXiv:2105.14795; the text of the question
    was not checked here) asks for a hyperbolic group with a non-hyperbolic
    subgroup of finite type. IMM answer it in Corollary 2 with a group obtained
    by Dehn filling a cusped 5-manifold. Repo use: literature framing in
    `cube-manifold-gate1.md`.

- Claudio Llosa Isenrich and Pierre Py, **Subgroups of hyperbolic groups,
  finiteness properties and complex hyperbolic lattices**, arXiv:2204.05788.
  - Answers Brady's question (their Question 4) on hyperbolic groups with
    subgroups of type `F_n` but not `F_{n+1}`, for all `n`, using complex
    hyperbolic lattices. Repo use: literature framing only.
  - arXiv abstract: https://arxiv.org/abs/2204.05788

## Coxeter And Davis Background

- Jonathan A. Barmak and Elias Gabriel Minian, **Strong homotopy types, nerves
  and collapses**, _Discrete & Computational Geometry_ 47 (2012).
  - Removing a beat point of a finite poset is a strong collapse of its order
    complex. `beatPointCore` in `src/fibering/lowBarycentricLinks.ts` uses this
    to shrink descending face links before testing collapsibility.

- Michael W. Davis, _The Geometry and Topology of Coxeter Groups_, London
  Mathematical Society Monographs 32, Princeton University Press, 2008.
  - Supports Coxeter systems, spherical special subgroups, Davis cells, links,
    and the Davis complex viewpoint.
  - The nerve is the simplicial complex of nonempty spherical subsets. A
    PL-\(S^4\) nerve gives a contractible five-manifold Davis complex; the
    discussion of Moussong's criterion supplies the abstract
    word-hyperbolicity gate used by the labelled-\(S^4\) lane.
  - Proposition I.6.6 (Appendix I.6; restated as Proposition 12.2.2) and
    Corollary 12.2.3 (Moussong) record the
    flag-no-square generalized-homology-sphere obstruction used to exclude the
    right-angled shortcut in dimension five.
  - DOI page: https://www.degruyter.com/document/doi/10.1515/9781400845941/html
  - Author PDF: https://people.math.osu.edu/davis.12/davisbook.pdf

- Gábor Moussong, _Hyperbolic Coxeter Groups_, PhD thesis, Ohio State
  University, 1988.
  - Supplies the special-subgroup criterion used in the exact preflight: a
    Coxeter group is word-hyperbolic precisely when it has no irreducible
    affine special subgroup of rank at least three and no commuting pair of
    disjoint infinite special subgroups.
  - This criterion concerns the abstract Coxeter system and does not require a
    reflection realization in real hyperbolic space.

- Grigori Avramidi, Boris Okun, and Kevin Schreve, **Homology growth,
  hyperbolization, and fibering**, _Geometric and Functional Analysis_ 34
  (2024), 303--376; arXiv:2301.06112.
  - Restates the flag-no-square obstruction for four-dimensional homology
    spheres in a remark after Theorem 5.3 (arXiv version), citing Davis,
    Proposition I.6.6, and attributing it to Moussong. The repository uses that
    precise scope to rule out a right-angled word-hyperbolic Coxeter group with
    PL-\(S^4\) nerve, not to rule out non-right-angled labelled systems.
  - DOI: https://doi.org/10.1007/s00039-024-00667-w

- Michael W. Davis, Tadeusz Januszkiewicz, and Richard Scott,
  **Fundamental groups of blow-ups**, _Advances in Mathematics_ 177 (2003),
  115--179.
  - Section 5.8 equips Coxeter cell complexes with their canonical piecewise
    Euclidean metric. A link edge for a finite pair has length
    `pi - pi/m_ij`.
  - The metric-flag criterion and Theorem 5.8.5 identify nonpositive curvature
    of a Coxeter cell complex with metric-flag vertex links. This is the
    one-sided optional CAT(0)/asphericity diagnostic used for the generalized
    lawful complex.
  - A failed metric-flag check rules out this inherited-metric certificate; it
    does not prove that the complex is non-aspherical and does not block the
    Track A finite-height-band argument.
  - Author PDF: https://people.math.osu.edu/davis.12/old_papers/djs2.pdf

- James E. Humphreys, _Reflection Groups and Coxeter Groups_, Cambridge
  University Press, 1990.
  - Supports standard Coxeter notation, reflection representations, finite
    examples, and Gram conventions.
  - Cambridge page: https://www.cambridge.org/core/books/reflection-groups-and-coxeter-groups/contents/3B59A3A956309AFDD72C084E2BA953BF

- Brigitte Brink and Robert B. Howlett, **A finiteness property and an
  automatic structure for Coxeter groups**, _Mathematische Annalen_ 296
  (1993), 179--190.
  - Background for exact normal forms and automatic structures. Browser
    generation does not claim this backend unless its artifact says so.
  - The elementary/small-root recursion also supplies the finite root states
    used by the bounded Niblo--Reeves ultrafilter automaton. The repository
    independently replays its exact root counts for each bundled target.
  - EuDML: https://eudml.org/doc/165119

- Graham A. Niblo and Lawrence D. Reeves, **Coxeter groups act on CAT(0) cube
  complexes**, _Journal of Group Theory_ 6 (2003), 399--413.
  - Supports the wallspace cubing used in the dedicated compact-cube and `P2`
    branch: vertices are consistent wall orientations, transverse walls span
    cubes, and the Coxeter group acts properly and cocompactly on the resulting
    CAT(0) cube complex.
  - The repository's quotient parity DSU, exact `Sigma_n` cutoffs, and finite
    directed-link certificates are implementation-specific calculations, not
    claims copied from the paper.
  - DOI: https://doi.org/10.1515/jgth.2003.028

- Frederic Haglund and Daniel T. Wise, **Special cube complexes**,
  _Geometric and Functional Analysis_ 17 (2008), 1551--1620.
  - Supports the clean-hyperplane terminology: embedded and two-sided
    hyperplanes without self-osculation or inter-osculation. The current
    cubulation census records these pathologies separately from directed-link
    connectivity.
  - Specialness does not itself certify a nonzero character or connected
    ascending and descending links.
  - DOI: https://doi.org/10.1007/s00039-007-0629-4

## Golden Ideal 3-Cube

- Matthieu Jacquemet and Steven T. Tschantz, **All hyperbolic Coxeter
  n-cubes**, _Journal of Combinatorial Theory, Series A_ 158 (2018), 387--406;
  arXiv:1803.10462.
  - Sections 2.1--2.2 provide the Gram, vertex-link, and cube conventions used
    by the exact ideal 3-cube construction.
  - A Euclidean `(3,3,3)` vertex link marks an ideal vertex. Consequently the
    all-adjacent-`m=3` cube is finite-volume and noncompact, not compact.
  - `scripts/certify_ideal_hyperbolic_3_cube.py` checks the exact Gram
    signature, normal-coordinate cache, ideal Klein vertices, `S4` image, and
    spherical restrictions used for the bundled cover.
  - arXiv: https://arxiv.org/abs/1803.10462
  - DOI: https://doi.org/10.1016/j.jcta.2018.04.001

The torsion-free interpretation of the `S4` action also uses Everitt's
finite-special-subgroup and fixed-point criteria cited above. The source paper
does not assert that this particular index-24 kernel is a smallest cover.

## Three-Dimensional C(4,4;2,2;3,3) Benchmark

- Bruno P. Zimmermann, **Tetrahedral Coxeter groups, large group-actions on
  3-manifolds and equivariant Heegaard splittings**, arXiv:2003.00730 (2020).
  - Supplies the `C(4,4;2,2;3,3)` tetrahedral group, its `PSL(2,7)` quotient,
    and the index-336 torsion-free kernel used by the bundled
    `compact_3_tetrahedron_c44_2233` example and
    the C44 writeup.
  - The writeup gives the journal as _Rendiconti dell'Istituto di Matematica
    dell'Universita di Trieste_ 52 (2020), 601--612, DOI
    10.13137/2464-8728/30923. The arXiv page carries no journal reference, and
    that DOI did not resolve through Crossref when checked on 2026-11-27, so
    the journal details are recorded here as unverified.
  - arXiv abstract: https://arxiv.org/abs/2003.00730

## Certified Compact Examples

- Matthieu Jacquemet and Steven T. Tschantz, **All hyperbolic Coxeter
  n-cubes**, _Journal of Combinatorial Theory, Series A_ 158 (2018), 387--406;
  arXiv:1803.10462.
  - Supports the unique compact hyperbolic Coxeter 5-cube, its Coxeter graph,
    and dotted-edge weights.
  - `scripts/certify_compact_5_cube.py` checks the repository transcription,
    algebraic dotted values, and exact normal-Gram rank/signature. Those are
    the limits of the bundled `certified` label.
  - arXiv: https://arxiv.org/abs/1803.10462
  - DOI: https://doi.org/10.1016/j.jcta.2018.04.001

- Naomi Bredon and Ruth Kellerhals, **Hyperbolic Coxeter groups and minimal
  growth rates in dimensions four and five**, _Groups, Geometry, and Dynamics_
  16 (2022), 725--741.
  - Supports the Makarov compact 5-prism based on `[5,3,3,3,3]` and its dotted
    distance.
  - `scripts/certify_compact_5_prism.py` checks the graph, algebraic dotted
    value, and exact normal-Gram rank/signature.
  - EMS: https://ems.press/journals/ggd/articles/7155473
  - DOI: https://doi.org/10.4171/GGD/663

- Vincent Emery and Ruth Kellerhals, **The three smallest compact arithmetic
  hyperbolic 5-orbifolds**, _Algebraic & Geometric Topology_ 13 (2013),
  817--829.
  - Supports the `P0`, `P1 = D P0`, and `P2` source family and Coxeter diagrams.
  - The paper calls the `[5,3,3,3,4]` simplicial prism `P2`, says that Makarov
    first discovered it, and was published on 30 March 2013.
  - `P1` is recorded as the double of `P0`, not as a third simplicial prism.
  - `scripts/certify_compact_5_prism_family.py` checks the stated transcription
    and Gram/signature scopes. Stored CoxIter results are a separate diagram
    check.
  - PDF: https://msp.org/agt/2013/13-2/agt-v13-n2-p05-s.pdf

- Daniel Allcock, **Infinitely many hyperbolic Coxeter groups through
  dimension 19**, _Geometry & Topology_ 10 (2006), 737--758.
  - Supports the doubling-wall construction used to form reflection
    subgroups from the two certified P2 doubling walls. The repository's exact
    doubled-cellulation artifact, rather than the general theorem alone,
    certifies those two instances.
  - Journal record: https://msp.org/index/ail.php?jpath=gt&l=A
  - Author PDF: https://web.ma.utexas.edu/users/allcock/research/doubling.pdf
  - DOI: https://doi.org/10.2140/gt.2006.10.737

- V. S. Makarov, **The Fedorov groups of four-dimensional and
  five-dimensional Lobachevsky space**, in _Studies in General Algebra_,
  volume 1, Kishinev State University (1968), 120--129; MR0259735.
  - This is the original discovery reference for the compact prisms now called
    `P0` and `P2`. The repository uses Emery--Kellerhals for the modern diagrams
    and notation because that source is directly inspectable online.

- Jacopo G. Chen, **Some closed hyperbolic 5-manifolds**, arXiv:2502.19225v2
  (2025).
  - The first submission was 26 February 2025; version 2 is dated 3 March 2025.
  - Section 1 defines a Coxeter prism `P` (a--5--b--c--d--e--4--f, dotted
    f--g; attributed by Chen to Bugaenko 1984) whose diagram is that of
    Emery--Kellerhals P2, with a, ..., g = s0, ..., s6. Chen does not use the
    name P2 or cite Makarov; the identification is by Coxeter diagram.
    14,400 copies form a 120-cell prism.
  - Section 4.3 proves vanishing first Betti number for the published closed
    families used here only as negative controls.
  - Sections 5.2--5.3 construct the alternative 650-cell four-manifold \(X\),
    compute \(H_1(X;\mathbb Z)\cong\mathbb Z^{144}\), and describe colorings.
    They do not compute \(b_1\) or prove fibering for the resulting closed
    Section 5 colored five-manifolds.
  - The author's GPL-3.0 computational supplement is
    https://github.com/floatingpoint-754/closed-hyp-5-manifolds. The P2 import
    binds `5-manifolds-2.ipynb` at commit
    `f14f1a6018bb53c6fe55997cb9fba7f7278fa3bb` (17 September 2025), rather
    than copying its code into this Apache-2.0 repository.
  - arXiv: https://arxiv.org/abs/2502.19225v2

- Pavel Tumarkin, **Compact Hyperbolic Coxeter n-Polytopes with n+3 Facets**,
  _Electronic Journal of Combinatorics_ 14 (2007), R69;
  arXiv:math/0406226.
  - Supports the compact eight-facet 5-dimensional catalogue: one `G12221`
    case and fifteen `G11411` cases in Table 4.10.
  - The repository transcription is generated from the arXiv EPS source.
    `scripts/certify_tumarkin_8facet.py` checks the transcription, algebraic
    dotted values, and normal-Gram rank/signature diagnostics.
  - Journal: https://www.combinatorics.org/ojs/index.php/eljc/article/view/v14i1r69
  - arXiv: https://arxiv.org/abs/math/0406226

- Jiming Ma and Fangting Zheng, **Compact hyperbolic Coxeter five-dimensional
  polytopes with nine facets**, arXiv:2203.16049 (2022).
  - Supports the complete compact nine-facet 5-dimensional catalogue: 51
    polytopes (types P284 x1, P302 x6, P312 x1, P313 x3, P319 x22, P322 x18),
    with the dotted-edge length table used for the exact dotted values. The
    bundled files are `mazheng_5d_9facet_p<type>[_<index>].json`.
  - Its figure "Compact simplicial prisms in H^5" (bottom diagram, dotted value
    `(1/2) sqrt(3 + sqrt(2))`) is the diagram source for the H5-P7-22 example
    `compact_5_prism_h5_p7_22`.
  - `scripts/certify_compact_5d_catalogue.py` checks the transcription and
    normal-Gram rank/inertia from 80-digit eigenvalues. It runs no CoxIter or
    Vinberg compactness check itself; the stored CoxIter diagram artifacts in
    `scripts/certificates/coxiter/` are a separate check.
  - Data provenance: the nine-facet transcription is
    `scripts/data/mazheng_9facet_verified.jsonl`, a SHA-256-pinned copy of
    `data/baselines/d5_m9/verified.jsonl` from the 10Facets5D census workspace
    at commit `65380c1`. That file carries facet-labelled Coxeter labels, exact
    dotted values (radicals, or a minimal polynomial with an isolating
    interval), and an exact Sage `AA` inertia check. The workspace is outside
    this repository.
  - arXiv: https://arxiv.org/abs/2203.16049

- I. M. Kaplinskaja, **Discrete groups generated by reflections in the faces
  of simplicial prisms in Lobachevskian spaces**, _Mathematical Notes_ 15
  (1974), 88--91.
  - The classification of Coxeter simplicial prisms. The repository cites it
    for H5-P7-22 as the third compact simplicial prism in `H^5`; the diagram
    itself is read from Ma--Zheng's prism figure, not from this paper.
  - Open question (as of 2026-10-04): P1 = D P0 is combinatorially a 7-facet
    prism but is not in Ma--Zheng's three-diagram prism figure. Whether
    Kaplinskaja's list (through Esselmann's `d+2` theorem) counts it separately
    has not been checked against this paper or Felikson's tables.

- Lizi Guo, Jiming Ma, Yourong Zang, and Fangting Zheng, **Several families of
  incommensurable noncompact hyperbolic Coxeter polytopes** (2026),
  arXiv:2607.14715.
  - Provides an independent census cross-check reporting sixteen compact
    eight-facet 5-dimensional cases.
  - It is not the transcription source for the bundled matrices.
  - arXiv: https://arxiv.org/abs/2607.14715

## External Exact And Independent Tools

- SageMath Coxeter-group documentation.
  - The matrix-group implementation provides the faithful Tits reflection
    representation over a cyclotomic or number field.
  - Sage's finite matrix-group implementation exposes exact order computation
    and `as_permutation_group`; the `algorithm="smaller"` option asks GAP for a
    compact faithful permutation representation but does not promise minimum
    degree.
  - These APIs support the implemented finite-image-first search. Sage's API
    does not make the torsion-free claim by itself; the project checks exact
    Coxeter relations, every maximal spherical image order, prime-order fixed
    points, and every spherical orbit size.
  - Categories: https://doc.sagemath.org/html/en/reference/categories/sage/categories/coxeter_groups.html
  - Coxeter matrix groups: https://doc.sagemath.org/html/en/reference/groups/sage/groups/matrix_gps/coxeter_group.html
  - Finite matrix groups and `as_permutation_group`:
    https://doc.sagemath.org/html/en/reference/groups/sage/groups/matrix_gps/finitely_generated_gap.html

- GAP reference manual and KBMAG.
  - The finite-image backend uses GAP's exact permutation-group operations,
    coset actions, stabilizer chains, maximal-subgroup class representatives,
    tables of marks, and optional permutation characters. Search heuristics
    choose candidates; the exported orbit-size checks carry the torsion-free
    claim.
  - `LowIndexSubgroupsFpGroupIterator` and
    `LowIndexSubgroupsFpGroup` enumerate subgroups through a specified index.
    Their `excluded` argument rejects every subgroup containing a conjugate of
    a supplied word. The app retains this API only as a capped small-index
    fallback.
  - The manual warns that runtime generally grows exponentially with the index
    bound.
  - GAP reference manual: https://docs.gap-system.org/doc/ref/manual.pdf
  - The structural Weyl-target search uses complete subgroup conjugacy
    classes, complement classes, automorphism groups, normalizers,
    centralizers, and exact group actions from the GAP reference library.
    These operations enumerate the labeled `A5` anchors and their extension
    orbits; the browser does not reproduce that classification numerically.
  - GAP manual, low-index subgroups:
    https://gap-system.github.io/gap/doc/ref/chap47_mj.html#X81D17F0282A444B3
  - KBMAG package: https://gap-packages.github.io/kbmag/
  - KBMAG manual: https://docs.gap-system.org/pkg/kbmag/doc/manual.pdf

- GAP AtlasRep, TomLib, GenSS, recog, and ClassicalMaximals packages.
  - AtlasRep supplies the independently checked `O8-(2)` and `O8-(2).2`
    representations used in the characteristic-two identification. TomLib's
    complete table of marks for `O8-(2)` supplies the subgroup-class data for
    the mod-2 index obstruction.
  - The characteristic-three certificate uses a GenSS stabilizer chain with a
    prescribed exact order. `IsProved` confirms the chain, and replayable SLPs
    for the standard generators prove the reverse containment. Generic `recog`
    is retained only as an optional consistency diagnostic.
  - The characteristic-eleven certificate uses `RecogniseClassical` only for
    its documented `isOmegaContained` conclusion. Praeger's ppd-element
    account explains the one-sided guarantee: a positive containment answer is
    conclusive, while failure to find the required witnesses is not a negative
    proof. Exact `CM_InOmega` checks supply the opposite containment, and the
    seeded positive computation is repeated during replay.
  - `ClassicalMaximalsGeneric("O+",10,3)` supplies the complete list of maximal
    subgroups of `Omega^+(10,3)`. The package documentation states that the
    unrestricted routine is complete through dimension `12`; the present input
    has dimension `10`.
  - AtlasRep: https://www.gap-system.org/Packages/atlasrep.html
  - TomLib: https://www.gap-system.org/Packages/tomlib.html
  - GenSS manual: https://docs.gap-system.org/pkg/genss/doc/manual.pdf
  - recog: https://gap-packages.github.io/recog/
  - `RecogniseClassical` API:
    https://gap-packages.github.io/recog/doc/chap7_mj.html
  - Cheryl E. Praeger, _Primitive prime divisor elements in finite classical
    groups_: https://arxiv.org/abs/1412.0814
  - ClassicalMaximals main function:
    https://gap-packages.github.io/ClassicalMaximals/doc/chap3.html
  - ClassicalMaximals method and completeness range:
    https://gap-packages.github.io/ClassicalMaximals/doc/chap1_mj.html

- Rafael Guglielmetti, CoxIter.
  - Supports independent Coxeter-diagram and finite-covolume checks stored as
    external checker artifacts.
  - A skipped CoxIter run records only availability and hashes; it does not
    certify the diagram.
  - The documented feature list covers Euler characteristic, `f`-vectors,
    cocompactness, finite volume, growth, and selected arithmeticity checks. It
    does not document low-index subgroup or torsion-free coset-action search,
    so CoxIter is not the automatic-cover backend.
  - Documentation: https://coxiter.rgug.ch/doc/

External tools can certify a finite action or subgroup claim only when the
artifact records the exact input, command, tool version, output hash, and scope.
Their presence on the machine is not itself evidence.

## Runtime And Accelerator Guidance

- Microsoft, **Working across file systems**.
  - Microsoft recommends storing files in the WSL filesystem when Linux
    command-line tools perform the work. The discovery runtime follows this
    guidance for Sage/GAP scratch, packed permutation rows, and persistent
    checkpoints instead of running hot I/O under `/mnt/c`.
  - https://learn.microsoft.com/en-us/windows/wsl/filesystems

- Intel, **OpenVINO Toolkit Overview** and **Enhance AI Upscaling with Intel AI
  Boost NPU**.
  - These pages describe OpenVINO and the NPU as neural-network inference
    systems. They do not provide exact finite-field group, orbit, or subgroup
    algorithms, so the NPU is not used by cover discovery.
  - https://www.intel.com/content/www/us/en/developer/tools/openvino-toolkit/overview.html
  - https://www.intel.com/content/www/us/en/developer/articles/technical/enhance-ai-upscaling-with-intel-ai-boost-npu.html

- NVIDIA, **cuBLAS 12.8 documentation**.
  - cuBLAS supplies dense numerical and selected integer GEMM operations. Its
    integer datatypes do not by themselves implement the exact `GF(p)` and
    extension-field semantics or irregular subgroup search used by this
    project. This supports the current decision to optimize the CPU path before
    considering a custom GPU kernel.
  - https://docs.nvidia.com/cuda/archive/12.8.2/cublas/index.html

## App And Rendering

- Three.js documentation.
  - Supports scene construction, materials, instancing, labels, picking, and
    camera controls. These are rendering decisions, not mathematical sources.
  - https://threejs.org/docs/

- React documentation.
  - Supports the component and state architecture.
  - https://react.dev/learn/typescript

- Vite documentation.
  - Supports local development and web builds.
  - https://vite.dev/guide/

- Vitest documentation.
  - Supports unit and integration testing.
  - https://vitest.dev/guide/

- Playwright documentation.
  - Supports end-to-end and visual workflow checks.
  - https://playwright.dev/docs/locators

- Tauri v2 documentation.
  - Supports the optional desktop wrapper, native dialogs, menus, file access,
    and platform packaging.
  - https://v2.tauri.app/

## Citation And Certification Policy

Before a new compact example, cover, or theorem-level claim is promoted:

1. identify a primary or authoritative source;
2. record the exact section, figure, table, or command used;
3. store deterministic input and output hashes;
4. add an independent check where the claim warrants one;
5. state what the artifact does **not** prove.

In particular, a Coxeter diagram source does not supply a finite torsion-free
cover, and a finite action does not by itself verify the hypotheses of the
Jankiewicz--Wise argument.
