# References

This file records sources that support the viewer's mathematical and engineering conventions. It is intentionally conservative. It certifies only the compact 5-cube and Makarov compact 5-prism data explicitly listed below.

## Mathematics

- Michael W. Davis, _The Geometry and Topology of Coxeter Groups_, Princeton University Press, 2008.
  - Supports the Davis complex viewpoint, spherical special subgroups, and the terminology used for Coxeter-group geometry.
  - Publisher DOI page: https://www.degruyterbrill.com/document/doi/10.1515/9781400845941/html

- James E. Humphreys, _Reflection Groups and Coxeter Groups_, Cambridge University Press, 1990.
  - Supports Coxeter systems, reflection representations, finite Coxeter examples, and standard notation.
  - Cambridge page: https://www.cambridge.org/core/books/reflection-groups-and-coxeter-groups/contents/3B59A3A956309AFDD72C084E2BA953BF

- Brink and Howlett, work on automatic structures for Coxeter groups.
  - Supports future normal-form and exact-word-reduction context.
  - Exact bibliographic details should be filled in before this source is used for an implementation claim.

- Matthieu Jacquemet and Steven T. Tschantz, "All hyperbolic Coxeter n-cubes," arXiv:1803.10462; Journal of Combinatorial Theory, Series A 158 (2018), 387-406.
  - Supports `compact_5_cube_gamma1.json`: Theorem 1 states that there is a unique compact hyperbolic Coxeter 5-cube, Figure 3 gives its Coxeter graph, and Section 4.2.2 gives the two dotted-edge weights for the compact graph Gamma_1.
  - The source LaTeX for Figure 3 was used to transcribe the graph coordinates and edges rather than copying the diagram by eye.
  - `scripts/certify_compact_5_cube.py` independently checks the repository JSON against the Gamma_1 transcription table, the algebraic dotted values, and exact normal Gram rank/signature. This is the scope of the bundled `certified` status.
  - arXiv page: https://arxiv.org/abs/1803.10462
  - DOI: https://doi.org/10.1016/j.jcta.2018.04.001

- Naomi Bredon and Ruth Kellerhals, "Hyperbolic Coxeter groups and minimal growth rates in dimensions four and five," Groups Geom. Dyn. 16 (2022), no. 2, 725-741.
  - Supports `compact_5_prism_makarov.json`: Theorem B identifies the Coxeter prism group based on `[5,3,3,3,3]` in `H^5`; Example 8 gives the Makarov prism graph and the dotted distance `cosh(l)=1/2*sqrt((7+sqrt(5))/2)`.
  - The bundled JSON uses the viewer's normal-Gram sign convention, so finite and dotted off-diagonal Gram entries are negative.
  - `scripts/certify_compact_5_prism.py` independently checks the repository JSON against the source graph, the algebraic dotted value, and exact normal Gram rank/signature. This is the scope of the bundled `certified` status.
  - EMS page: https://ems.press/journals/ggd/articles/7155473
  - DOI: https://doi.org/10.4171/GGD/663

## Optional Exact Backends

- SageMath Coxeter group documentation.
  - Candidate support for exact or symbolic Coxeter computations and exported fixtures.
  - Category documentation: https://doc.sagemath.org/html/en/reference/categories/sage/categories/coxeter_groups.html
  - Matrix Coxeter groups: https://doc.sagemath.org/html/en/reference/groups/sage/groups/matrix_gps/coxeter_group.html

- GAP documentation for finitely presented groups.
  - Candidate support for exact group computations and future backend comparison.
  - Manual chapter: https://docs.gap-system.org/doc/ref/chap47.html

- KBMAG, the GAP package for Knuth-Bendix methods and automatic groups.
  - Supports the optional GAP/KBMAG finite-spherical exporter. The local WSL installation uses KBMAG 1.5.11, released 2023-01-03, built in the user GAP package directory.
  - Package page: https://gap-packages.github.io/kbmag/
  - Manual: https://docs.gap-system.org/pkg/kbmag/doc/manual.pdf

- CoxIter.
  - Supports the graph-file format used by `scripts/coxiter_check_compact.py`: number of vertices and dimension, optional vertex labels, non-right Coxeter edges, and dotted edges written with weight `1`.
  - A passed CoxIter report is recorded as an external checker summary. The compact 5-cube and 5-prism reports are stored as hash-matched artifacts under `scripts/certificates/coxiter/` so the research-grade gate can replay the checker output when WSL/CoxIter is unavailable to the calling process. A skipped report only records the deterministic input hash and does not certify the diagram independently.
  - Project documentation: https://coxiter.rgug.ch/doc/

## App And Rendering

- Three.js documentation.
  - Supports renderer, scene, camera, sprite labels, canvas textures, and controls implementation decisions.
  - OrbitControls: https://threejs.org/docs/pages/OrbitControls.html

- Playwright documentation.
  - Supports browser smoke tests using role-based locators, test ids, and web-first assertions.
  - Locators: https://playwright.dev/docs/locators

- Vite documentation.
  - Supports local development, build, and preview workflow.
  - Guide: https://vite.dev/guide/

- React documentation.
  - Supports the React + TypeScript app shell and component conventions.
  - TypeScript guide: https://react.dev/learn/typescript

- Vitest documentation.
  - Supports TypeScript unit tests for math and serialization behavior.
  - Guide: https://vitest.dev/guide/

- Tauri documentation.
  - Candidate future desktop wrapper if local file access or packaging becomes important.
  - Documentation: https://v2.tauri.app/

## Research Leads

Legacy label-only prism scaffolds are no longer bundled now that the certified Makarov 5-prism example is available. The bundled compact 5-prism data should refer to the cited Makarov/Bredon-Kellerhals source-backed file rather than a scaffold.

Additional source candidates for future compact prism/cube work:

- Frank Esselmann, "The classification of compact hyperbolic Coxeter d-polytopes with d + 2 facets."
  - Candidate source for compact prism-type cases because a 5-prism has `d + 2` facets in dimension `d = 5`.
  - EUDML page: https://eudml.org/doc/140398

- Pavel Tumarkin, "Hyperbolic Coxeter n-polytopes with n+2 facets," arXiv:math/0301133.
  - Candidate context for the finite-volume `n + 2` facet classification and how compact cases relate to earlier work.
  - arXiv page: https://arxiv.org/abs/math/0301133

- Pavel Tumarkin, "Compact Hyperbolic Coxeter n-Polytopes with n+3 Facets," Electronic Journal of Combinatorics 14 (2007), R69.
  - Candidate background for Gale-diagram methods and neighboring few-facet classifications; not itself an additional certified 5-prism data source for this repo.
  - Journal page: https://www.combinatorics.org/ojs/index.php/eljc/article/view/v14i1r69

- Rafael Guglielmetti, CoxIter.
  - Candidate independent checker for future compact Coxeter diagram and growth-rate cross-checks beyond the narrow source-transcription certificates bundled here.
  - Project page: https://coxiter.rgug.ch/

These research-lead entries are not additional certification. Before adding more compact examples or stronger geometric claims, transcribe exact diagram or Gram entries from a verified source, record page/figure/table details here, and add validation notes to the example file.
