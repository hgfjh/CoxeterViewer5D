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
  - Section 2.3 defines the two orientations of a two-sided wall. The app calls
    these coorientations to emphasize the induced direction on dual 1-cells.
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
  - Theorem 4.1 gives separate sufficient link conditions: connected
    ascending and descending links support finite generation, while simply
    connected ascending and descending links support finite presentation in
    the direct equivariant Morse setup.
  - The viewer reports local link diagnostics; it does not infer the required
    asphericity, affine structure, or global group conclusion.
  - DOI: https://doi.org/10.1007/s002220050168

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
  5-manifolds that fiber over the circle**, _Inventiones Mathematicae_ 231
  (2023), 1--38; arXiv:2105.14795.
  - Sections 1.11--1.12 prove collapsibility of ascending and descending links
    for their explicit cellulation and subdivision, including the new vertex
    types introduced by the subdivision.
  - Their fibration conclusion uses additional hypotheses: a compact smooth
    manifold, dimension at most five, a compatible affine/PL structure, and a
    genuine circle-valued map. The app records collapsibility as a stronger
    diagnostic but does not transfer that fibration conclusion to an
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
  - Supports the state/move legal-system construction for right-angled Coxeter
    groups and its state-dependent ascending/descending links.
  - This is retained as comparison and historical context. The current product
    uses wall coorientations in `\bar X`, which apply to general even Coxeter
    relation polygons. It does not present the right-angled legal-system game
    as the general model.
  - arXiv abstract: https://arxiv.org/abs/1711.11505

## Coxeter And Davis Background

- Michael W. Davis, _The Geometry and Topology of Coxeter Groups_, London
  Mathematical Society Monographs 32, Princeton University Press, 2008.
  - Supports Coxeter systems, spherical special subgroups, Davis cells, links,
    and the Davis complex viewpoint.
  - DOI page: https://www.degruyter.com/document/doi/10.1515/9781400845941/html

- Michael W. Davis, Tadeusz Januszkiewicz, and Richard Scott,
  **Fundamental groups of blow-ups**, _Advances in Mathematics_ 177 (2003),
  115--179.
  - Section 5.8 equips Coxeter cell complexes with their canonical piecewise
    Euclidean metric. A link edge for a finite pair has length
    `pi - pi/m_ij`.
  - The metric-flag criterion and Theorem 5.8.5 identify nonpositive curvature
    of a Coxeter cell complex with metric-flag vertex links. This is the
    one-sided CAT(0)/asphericity certificate used for the generalized lawful
    complex.
  - A failed metric-flag check rules out this inherited-metric certificate; it
    does not prove that the complex is non-aspherical.
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
  - EuDML: https://eudml.org/doc/165119

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
  - `P1` is recorded as the double of `P0`, not as a third simplicial prism.
  - `scripts/certify_compact_5_prism_family.py` checks the stated transcription
    and Gram/signature scopes. Stored CoxIter results are a separate diagram
    check.
  - PDF: https://msp.org/agt/2013/13-2/agt-v13-n2-p05-s.pdf

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
