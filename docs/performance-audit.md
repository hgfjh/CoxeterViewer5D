# Performance Audit

Performance work is accepted only when the same run preserves the mathematical
objects the interface promises to show. A faster frame is not a win if it drops
an edge label, relation surface, wall class, warning, or export field.

## August 2026 Cover-And-Wall Baseline

The production benchmark serves `dist/` in a fresh Chromium context. It covers
cold and warm startup, all five model switches, wall flipping, exact wall-sign
search, label round trips, screenshot export, viewer-only mode, research export,
and idle rendering.

The checked `I2(5)` compression floor is:

- 10 exact vertices;
- 10 exact generator edges;
- one decagonal relation cell;
- five walls;
- one semantic generator label per exact edge;
- no labels on wall-midpoint drawing helpers.

On the audit machine, the current reference run measured approximately:

| Operation                  |     Time |
| -------------------------- | -------: |
| Cold load                  |   615 ms |
| Warm load                  |   362 ms |
| Flip selected wall         |    73 ms |
| Search wall coorientations |   255 ms |
| Export screenshot          |   329 ms |
| Idle render delta          | 0 frames |

These are regression baselines, not universal hardware guarantees. The machine
report records separate `ci-linux-standard` and local profiles so runner
variance does not weaken semantic floors.

## October 2026 Overhaul

This pass targeted two things: interaction latency in the viewer, and running
the fibering pipeline end to end on the index-39,628,800 torsion-free cover of
H5-P7-22 (rank 7, 138,700,800 geometric edges,
471,651,520 Davis cells). Every optimization below either keeps every digest
byte-identical, or is checked against the old code by an equivalence test.

### Viewer

Measured with `pnpm bench:scale` (production build, Chromium):

| Interaction                        | Before |  After |
| ---------------------------------- | -----: | -----: |
| Davis complex, radius 3 to 8       |  6.5 s | 2.26 s |
| Node click in projection mode      |  2.3 s | 1.36 s |
| Cayley-ball generation at radius 8 |  6.1 s | 0.75 s |

Changes: only the active model's scene is derived; selection no longer feeds
scene geometry; the virtual-fibering certificate is computed from a deferred
value; ball generation deduplicates on packed rounded matrices and builds a
string key only for new nodes (`tests/viewer-generation-equivalence.test.ts`
compares against the previous generator); higher Davis cells use per-node
incidence indexes; panels are memoized with stable callbacks.

### Pipeline at 39.6M points

Measured with `pnpm bench:pipeline` on a 22-core, 24 GB desktop. "Before" is
the first run of this audit. The oracle structure hash (`000fd5ae…`) and the
torsion-free certificate status are identical in every column. At this size
the H1 preparation digests were not compared across columns. Sequential and
parallel preparations are byte-identical on the compact 5-cube cover (34,560
points) and on every test fixture, and the benchmark now prints the
preparation digest for that comparison.

| Stage                            |             Before | Sequential now | 8 workers |
| -------------------------------- | -----------------: | -------------: | --------: |
| Torsion-free certificate         |              172 s |          156 s |      87 s |
| Streamed oracle                  |              763 s |          486 s |     248 s |
| — action validation              |              144 s |           75 s |      15 s |
| — spherical cell index           |              146 s |           82 s |    29 s ¹ |
| — walls                          |              449 s |          303 s |     173 s |
| Generic H1 preparation           | out of heap (4 GB) |         1132 s |     195 s |
| — boundary rows                  |                  — |          826 s |      92 s |
| — cotree columns                 |                  — |          152 s |      20 s |
| — wall vectors                   |                  — |           82 s |      20 s |
| — tree gauge                     |                  — |           20 s |      13 s |
| **Load → torsion → oracle → H1** |        not reached |        ~30 min |    ~9 min |

¹ With workers, the relation checks and the cell index share one 29 s kernel
phase before construction; validation then only checks the rows.

What changed, by stage:

- **Intake.** Packed `.u32` rows (one file per generator, SHA-256 pinned in a
  manifest) load straight into shared memory: 4.3 s for 1.1 GB.
- **Torsion-free certificate.** Coxeter relations are checked at one point per
  ⟨s,t⟩-orbit (for involutions, (st)^m holds on the whole orbit or nowhere).
  Only maximal spherical subgroups are walked, and freeness uses an orbit
  template: one row lookup per point instead of one per generator.
- **Oracle.** Lazy orbit-minimum bitsets with rank/select directories replace
  per-point ordinal tables. Edges are numbered by rank over a bitset. Walls use
  slot bookkeeping instead of edge-sized tables. A per-point "stored source"
  bit replaces a decimal-label comparison on every boundary step. Oracles are
  cached by content (`WeakRef`), so one run builds one oracle instead of ten
  or more.
- **H1 preparation.** Boundary rows, cotree columns and wall vectors are
  hashed from literal canonical JSON in fixed chunks, without intermediate
  objects. Wall vectors are digested incrementally instead of being retained,
  which removed the out-of-heap failure.
- **Hashing.** `canonicalSha256` uses `node:crypto` when present and a
  portable SHA-256 otherwise, and builds error paths lazily.
  `canonicalSha256WithRows` streams action rows instead of building a string.
- **Collapsibility.** A reduced Z/2 homology precheck (a new certificate kind,
  `nonzero-reduced-homology`) settles most non-collapsible links in polynomial
  time. The exhaustive search is now incremental (Zobrist-hashed states,
  explicit stack) and no longer runs out of memory on order complexes of about
  1000 simplices.

### Large imported covers in the viewer

Timed in Node on the compact 5-cube's index-17,280 action imported as a
quotient (17,280 vertices, rank 10, 9 walls):

| Step (when it runs)                       | Before |  After |
| ----------------------------------------- | -----: | -----: |
| Action to quotient complex (import)       |   40 s |   11 s |
| Cover compression (import)                |  232 s |   55 s |
| Wall system (import)                      | 11.5 s |  6.5 s |
| Schreier presentation (import)            |  578 s |   12 s |
| Lawful subcomplex + directed links (flip) |  6.3 s |  4.0 s |
| Virtual-fibering certificate (flip)       |  292 s | 7–17 s |

Each "before" figure came from a lookup that scanned a whole collection per
element. Examples: the Schreier builder filtered every quotient edge for
every (point, generator) step; cover compression re-sorted the unvisited
vertex set per relation orbit; the Bezout identity rescaled every earlier
coefficient at every step. Each fix gives identical output. Cover
compression was compared by deep equality against the old code on this
cover; the Bezout identity has a randomized test against the old algorithm.

Covers with at least 20,000 lift edges now run this chain in a worker
(`src/app/coverAnalysisWorker.ts`). It keeps the analysed cover, so a wall
flip sends only the new signs. The coorientation itself is recomputed on the
main thread at once, so wall colours change immediately. The lawful cells,
Directed links and certificate follow from the worker, and a burst of flips is
coalesced to the latest signs. Smaller covers stay inline.
`?coverWorker=always|never` forces either path; an e2e test checks that both
export the same experiment.

### Parallel kernels

`src/parallel/` holds a small kernel pool: `worker_threads` in Node, module Web
Workers in a cross-origin-isolated page, and an inline fallback everywhere
else. Kernels are pure functions of typed arrays in `SharedArrayBuffer`.
Callers fold their results in a fixed order, so outputs do not depend on the
worker count:

| Kernel                | Used by                          | Folded how                          |
| --------------------- | -------------------------------- | ----------------------------------- |
| `alternatingRelation` | torsion-free certificate, oracle | per generator pair                  |
| `freeOrbitTemplate`   | torsion-free certificate         | per maximal spherical subgroup      |
| `maximalCellIndex`    | oracle                           | per maximal spherical type          |
| `pairCellUnions`      | oracle walls                     | union-find applied in cell order    |
| `boundaryRows`        | H1 preparation                   | chunk digests concatenated in order |
| `treeRecordChunks`    | H1 preparation                   | chunk digests concatenated in order |
| `cotreeColumnChunks`  | H1 preparation                   | chunk digests concatenated in order |
| `wallVector`          | H1 preparation                   | one job per two-sided wall          |

The wall union-find stays on one thread. Its parity-conflict counts depend on
union order, and they are part of the structure hash, so workers only walk
cells and emit union records. The main thread applies those records in exactly
the sequential order.

The H1 preparation is written as a coroutine that yields batches of kernel
jobs; `prepareGenericStreamedH1` runs them inline and
`prepareGenericStreamedH1Parallel` on the pool, so both share every other
line of the preparation.

Entry points: `certifyTorsionFreeActionParallel`,
`buildStreamedLawfulDavisOracleParallel`, `prepareGenericStreamedH1Parallel`.
`tests/kernel-pool.test.ts` starts real worker threads and compares against the
sequential results. The oracle, torsion and H1 suites run the parallel paths
through a structured-clone pool.

The dev server, `vite preview` and the Tauri window send
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Static hosts must add the same
headers to get more than one browser worker.

## Current Architecture

- The renderer is demand-driven. Scene changes, picking, camera input,
  screenshots, and short damping windows request frames; an idle scene has no
  permanent animation loop.
- Nodes and arrowheads are instanced. Edges, relation fills, outlines, dense
  labels, and leader lines are batched.
- Sparse or focused labels use pooled canvas sprites. Dense labels share a
  single-channel SDF atlas and batched geometry.
- Picking uses retained spatial indexes and exact candidate tests. Very dense
  scenes can use the GPU id path, with CPU fallback and stable selection ids.
- Scene revisions separate topology, layout, cell geometry, appearance, labels,
  picking, and camera state. A wall-sign change does not rebuild the cover
  topology. The lawful-subcomplex and Morse derivations still rerun on the main
  thread; the virtual-fibering certificate is computed from a deferred value,
  so it no longer blocks the flip.
- Only the active model's scene is derived. Selecting a node or cell restyles
  the existing scene instead of rebuilding placement and labels.
- The finite-ball generator and wall-coorientation search use persistent
  workers. A new generation request terminates a superseded one instead of
  queueing behind it.
- Finite-action JSON import transfers bytes to a persistent validation worker.
  Parsing stays off the UI thread and structural checks yield bounded progress
  with cancellation.
- Memory and IndexedDB caches are entry- and byte-bounded. Cache hits are
  performance hints; validators and hashes still carry data claims.

## Rewrite-Specific Guardrails

The cover-compression reader distinguishes exact and drawing-only objects in
the scene data. Benchmark counts ignore wall midpoints and straight wall arcs
when reporting the exact 1-skeleton. Rendering may ghost those aids for an
induced-link lens, but it must not delete or relabel the exact generator edges.

The lawful-subcomplex search runs in a worker. A completed exact search may
report an optimum; a budget- or time-limited run reports only "best found" and
retains its lower bound, upper bound, and gap. Performance budgets never
upgrade that mathematical status.

## Torsion-Free Discovery Backend

The cover-discovery path is optimized around the operations that dominate an
exact finite-group search, rather than around dense matrix multiplication.

- The compact 5-cube catalogue is built once per matrix digest: 32 maximal
  spherical subgroups, 360 prime-order class origins compressed to 186
  deterministic witnesses, and the exact degree divisor
  `5,760`.
- Characteristics are probed independently. Exact `GF(2)` and `GF(3)` images
  are allowed only after all Coxeter relations and all spherical image orders
  pass.
- Sage/libGAP keeps each finite image as a native `MatrixGroup` and converts it
  to a compact faithful permutation model. Group order, BSGS operations,
  maximal subgroups, tables of marks, coset actions, and optional permutation
  characters stay inside the native group engine.
- A direct cover candidate `Q/L` is considered only at a degree divisible by
  the exact spherical lower divisor. Smaller natural or coset actions are kept
  only as partial modules for the composite search.
- Partial actions are spooled as verified row-major `uint16` or `uint32`
  buffers. JSON does not carry thousands of rejected permutation rows.
- The composite solver uses packed witness masks, rarest-witness branching,
  duplicate/dominance pruning, incremental intersections, and every diagonal
  orbit of each bounded factor combination. Two-factor searches use
  double-coset data.
- A candidate is independently recertified by exact relations, prime-order
  fixed points, and the condition that every `W_T`-orbit has size `|W_T|`.
  This certificate is never replaced by a cache hit or a search heuristic.
- The runtime starts four to six light probes and normally one heavy Sage/GAP
  worker under a hard byte semaphore. Timeout and cancellation kill the full
  process tree.

On Windows, all hot temporary files and persistent backend caches live in the
WSL Linux filesystem. Repeated random access under `/mnt/c` or a synchronized
OneDrive directory is avoided. Only final artifacts and manifests cross back
to the Windows workspace.

The finite-image, subgroup, module, and composite frontiers are hash-bound and
resumable. A checkpoint saves completed work; it is not a mathematical
certificate. Full action JSON and Schreier data are emitted only after a
candidate passes.

The search remains bounded. Reaching a prime, degree, subgroup, module, byte,
combination, or time cap proves neither nonexistence nor minimality. The packed
composite solver is complete only for its recorded factorwise
witness-covering combinations and their diagonal orbits.

### Why CPU, Not GPU Or NPU

The relevant matrices are small, while the costly operations are irregular:
finite-group recognition, stabilizer chains, subgroup traversal, orbit
construction, hashing, and branch-and-bound over packed sets. OpenVINO targets
neural-network inference. cuBLAS provides dense numerical and integer GEMM, not
the exact `GF(p)` and extension-field group semantics used here. Moving these
small matrices and branching frontiers to the GPU would add transfer and custom
kernel costs without accelerating the measured bottleneck.

GPU work should be reconsidered only if a future profile identifies a large,
regular finite-field kernel as dominant. The present design makes better use of
this machine through CPU concurrency, native GAP/Sage algorithms, packed memory
representations, ext4 I/O, and controlled memory pressure.

## Retained Renderer Optimizations

- Shared geometries and materials are disposed only on topology eviction.
- Id-to-instance maps permit in-place matrix and color updates.
- Hot vector, matrix, and raycast scratch objects are pooled in measured paths.
- Screen-space label collision uses a grid rather than all-pairs comparison.
- Selected labels outrank budgeted labels, while every exact `bar X` generator
  edge retains one semantic label.
- Transparent context is adaptively budgeted; focused cells and crisp outlines
  remain visible.
- Renderer statistics are sampled instead of forcing React updates every
  frame.
- Resize handling is coalesced and dimension-aware.
- `preserveDrawingBuffer` stays disabled. PNG export requests one high-quality
  render and captures that frame.

## Remaining Ceilings

The worthwhile remaining work is data-driven rather than speculative:

- The browser kernel pool exists, but no viewer path calls it. Its kernels
  work on packed typed-array actions, and the viewer only handles
  string-keyed quotients. Those are far too small for the kernels to matter,
  and the cover chain above is object-graph code. The pool becomes useful if
  the viewer gains a packed-action pipeline panel.
- At 39.6M points the oracle's wall union-find (about 1.5 billion ordered
  unions) is single-threaded and bound by memory latency. Making it parallel
  needs an order-independent definition of `parityConflictCount`, which is a
  digest-changing decision.
- Large imported covers still take about a minute to analyse, now in a
  worker. The remaining cost is the viewer's object model: a string id and an
  object for every lifted cell, compared with locale collation.
- Build artifacts no longer replay their own output (schema 2; see
  `docs/data-format.md`). One scalable pipeline run used to compute H1 four
  times, the expensive stage twice and generalized compression six times;
  it now builds each once. Generalized compression is still built twice:
  once by the stage, and once more by Track B's oracle-rooted replay, which
  is a genuinely different check. Independent replay is the job of the
  verify functions and the `--verify` commands.

  The direct rank-one proof branch follows the same rule: it builds its
  compression and both Track-B polarities once (it used to verify the
  compression and replay each polarity right after building them). Each
  oracle cache hit still re-hashes the action rows
  (O(N)) to form its key.

- Generalized compression now holds one point-sized root table at a time
  instead of one per spherical type: 13.6 GiB less for the 92 types of
  H5-P7-22 at 39.6M points. Face compatibility walks each coface fiber once
  for all of its faces (43 s to 33 s on the 17,280-point 5-cube action). The
  archive hash is identical. The per-type representative lists are still
  ordinary arrays, about 1 GB at that size.

- A genuinely streaming file format could parse, validate, and display
  complete neighborhoods before a million-object finite action has fully
  arrived.
- Dynamic imports for research-only panels are justified if startup traces
  show JavaScript evaluation becoming dominant.
- MSDF text may improve tiny sharp corners, but the current SDF path is a
  better cost/quality trade for short generator and wall labels.
- A direct native binary screenshot path would help unusually large desktop
  figures, not normal captures.
- WebGPU is not a standing goal. It should replace WebGL2 only if traces show
  draw or compute work, rather than scene derivation, dominates the checked
  workflows and the new path preserves the same semantic floors.
- Cover discovery should add a new accelerator only after a profile shows a
  measured kernel that the accelerator can execute with exact semantics.

## Running The Checks

```bash
corepack pnpm build
corepack pnpm bench:timed:check
corepack pnpm bench:timed:machine:check
python -m scripts.discovery_runtime
python -m scripts.discovery_runtime --wsl
python scripts/torsion_free_finite_image.py --pure-self-test
python scripts/packed_composite_solver.py --self-test
```

Use a baseline-writing command only after inspecting the report and confirming
the feature-preservation counts. Updating a snapshot is not a fix for a
regression.
