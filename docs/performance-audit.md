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
  picking, and camera state. A wall-sign change is an appearance update; it does
  not rebuild the cover topology.
- The finite-ball generator and wall-coorientation search use persistent
  workers. Stale requests are ignored or cancelled.
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
