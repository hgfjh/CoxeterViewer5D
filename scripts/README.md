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
- `certify_quotient.mjs` checks an imported quotient action: generator
  regularity, bijective involutions, directed edge compatibility, finite
  Coxeter relations, rank-two orbit cell coverage, and duplicate rank-two
  cells.
- `certify_morse.mjs` checks the active integer game assignment or named
  cocycle by summing signed labels around quotient rank-two cells.
- `certify_local_links.mjs` computes small finite local-link homology over
  `F2`, reporting reduced `H0` and `H1`. It is intended for certificate
  diagnostics, not large-scale homology computations.

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
