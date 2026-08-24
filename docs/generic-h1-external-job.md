# Preparing a scalable generic H1 job

`prepare_generic_h1_external_job.ts` turns a Coxeter system and a complete
finite action into the immutable input bundle used by the external LinBox and
integral-lift pipeline. It does not trust a stored torsion-free certificate.
It recomputes the complete spherical-subgroup plan and certifies the action
before constructing the streamed Davis oracle.

```powershell
corepack pnpm exec tsx scripts/prepare_generic_h1_external_job.ts `
  --system public/examples/jnw_cube_graph.json `
  --action path/to/action.json `
  --output-dir .h1-jobs/jnw-action
```

The action file may be either a raw `TorsionFreeActionCandidate` or a wrapper
such as `{ "candidate": { ... }, "certificate": { ... } }`. A supplied
wrapper certificate is explicitly ignored. The output directory must not
exist; the runner stages the complete bundle and publishes it only after all
checks pass. It creates the destination exclusively and links `manifest.json`
last. A directory without that manifest is an interrupted publication, not a
completed job.

The four output files are:

- `preparation.json`: the canonical tree-gauge preparation certificate;
- `boundary.linbox`: the exact LinBox sparse-row integer matrix, written in
  bounded batches rather than assembled in memory;
- `torsion-free-certificate.json`: the independently recomputed certificate;
- `manifest.json`: input and output byte hashes, exact mathematical source
  bindings, dimensions, resolved bounds, and the self-sealing manifest digest.

The manifest exposes the six bindings expected by the scalable TypeScript and
Python adapters: action rows, generic sparse matrix, oracle structure,
preparation, prepared boundary, and torsion-free certificate. Its
`torsionFreeCertificateCanonicalSha256` is the value required by a
`generic-sparse-h1-external-request`; the preparation and matrix artifact
records supply their file hashes.

Default safety bounds are 16 MiB for the system input, 512 MiB for the action
input, 16 GiB for the matrix output, rank 12 and 4,096 subsets for exhaustive
spherical planning, 100,000 spherical diagnostic elements, and 8,192 stored
witnesses. Override them explicitly when needed:

```text
--max-system-input-bytes N
--max-action-input-bytes N
--max-matrix-output-bytes N
--matrix-write-batch-bytes N
--max-exhaustive-rank N
--max-subsets N
--max-spherical-elements N
--max-witnesses N
```

An incomplete spherical plan, a nonfree action, a failed preparation check,
an output-size breach, or an existing output directory is a hard stop. No
rank, integral kernel, wall-saturation, or fibering claim is made at this
stage. Continue with the rank worker and bridge described in
[`scalable-generic-integral-h1.md`](scalable-generic-integral-h1.md).
That bridge currently ends at an emitted integral-kernel witness; the
wall-Smith completion is library-only, and no generic CLI yet carries the full
`H^1` result through height chambers and Morse links.
