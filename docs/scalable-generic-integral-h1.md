# Scalable generic integral H1

The generic large-action path separates four claims that should not be
conflated:

1. the streamed tree-gauge matrix is the source-bound cellular boundary;
2. an external modular transcript consists of vectors in its kernel;
3. a reconstructed integral frame is saturated in its rational span;
4. that span is the whole kernel.

The first claim comes from `genericStreamedH1Preparation.ts`. The bridge in
[`generic_sparse_h1_bridge.py`](../scripts/generic_sparse_h1_bridge.py) checks
the preparation seal, the exact LinBox export, all file hashes, the modular
kernel replays, and the integral saturation replay. It makes the fourth claim
only when it also replays a `generic-sparse-modular-rank-certificate`.

## Why a LinBox rank line is not enough

`streamed_h1_core_nullspace.cpp` prints a rank and a complete modular
nullspace, but its historical transcript has no pivot ledger. The bridge keeps
that number under `modularRuns[].reportedRank` and sets
`rankClaimedFromBackendReport: false`.

The proof-carrying generic rank certificate supplies both finite-field
inequalities:

- selected original rows and columns form a minor with nonzero determinant
  modulo the recorded prime, proving `rank >= r`;
- `n-r` closed vectors have an identity chart on the free columns, proving
  `rank <= r` over the recorded field.

For the integral conclusion, the same nonzero minor gives the rational lower
bound, while the independently replayed integral frame supplies `n-r`
rationally independent closed vectors and hence the rational upper bound. Its
saturation replay then identifies the full integral kernel.

The replay recomputes the determinant and every matrix-vector product. If the
rank certificate is absent, the successful bridge status is
`verified-saturated-frame-only`; this is intentionally not a full `H^1`
calculation. With a valid certificate whose nullity equals the saturated frame
dimension, the status is `verified-full-integral-kernel`.

The TypeScript rank replay records its fully resolved budgets, including the
decimal coefficient-digit cap, inside the replay digest. Reaching one of those
caps is `incomplete`, not a failed mathematical certificate; the scalable
adapter stores the same budgets for exact later rebuild. Producer execution
counters are diagnostics only and are never used as proof inputs.

## Request protocol

Every request has this top-level shape. Unknown keys are rejected.

```json
{
  "schemaVersion": 1,
  "kind": "generic-sparse-h1-external-request",
  "executionMode": "consume-existing",
  "torsionFreeCertificateCanonicalSha256": "...",
  "preparation": { "path": "preparation.json", "sha256": "..." },
  "matrix": {
    "path": "boundary.linbox",
    "sha256": "...",
    "genericSparseMatrixDigest": "...",
    "rows": 100,
    "columns": 80,
    "nonzeroCount": 400,
    "maximumAbsoluteCoefficient": "2"
  },
  "linboxWorker": {
    "executablePath": "streamed_h1_core_nullspace",
    "executableSha256": "...",
    "driverSourcePath": "scripts/streamed_h1_core_nullspace.cpp",
    "driverSourceSha256": "...",
    "backend": "LinBox/Givaro",
    "backendVersion": "recorded-build-id",
    "algorithm": "GaussDomain::InPlaceLinearPivoting + nullspacebasis"
  },
  "modularRuns": [
    {
      "prime": 30011,
      "transcriptPath": "kernel-p30011.txt",
      "expectedSha256": "..."
    }
  ],
  "lift": {
    "scriptPath": "scripts/lift_modular_kernel.py",
    "scriptSha256": "...",
    "integralBasisPath": "integral-basis.txt",
    "certificatePath": "lift-certificate.json",
    "expectedIntegralBasisSha256": "...",
    "expectedCertificateSha256": "..."
  },
  "rankProof": {
    "certificatePath": "rank-certificate.json",
    "certificateSha256": "..."
  },
  "bounds": {
    "maxMatrixBytes": 4294967296,
    "maxPreparationCertificateBytes": 1073741824,
    "maxToolBytes": 4294967296,
    "maxRows": 10000000,
    "maxColumns": 10000000,
    "maxNonzeros": 100000000,
    "maxCoefficientDigits": 1024,
    "maxPrimeCount": 8,
    "maxTranscriptBytes": 4294967296,
    "maxNullity": 4096,
    "maxDenseLiftEntries": 100000000,
    "maxIntegralBasisBytes": 4294967296,
    "maxLiftCertificateBytes": 1073741824,
    "maxRankCertificateBytes": 4294967296,
    "maxKernelNonzeros": 100000000,
    "maxMinorWorkingNonzeros": 100000000,
    "maxFieldOperations": 1000000000,
    "workerTimeoutSeconds": 86400
  },
  "requestDigest": "..."
}
```

All numbers above are examples, not defaults. Every bound is mandatory and is
part of the request digest. `consume-existing` additionally requires expected
hashes for every modular transcript, integral basis, and lift certificate.
`execute-workers` omits those expected output hashes and refuses to overwrite
any declared output.

The preparation certificate supplies the system, action, oracle, cotree,
boundary, and logical LinBox-export bindings. The bridge self-replays its
canonical seal and requires all preparation checks to pass. The raw LinBox
file receives both a byte hash and the same chunked logical sparse-matrix
digest used by the TypeScript rank verifier. The request separately supplies
the canonical SHA-256 of the accepted torsion-free certificate. A rank proof
must carry exactly the six sorted bindings used by the TypeScript adapter:
action rows, generic sparse matrix, oracle structure, preparation, prepared
boundary, and torsion-free certificate.

The coefficient-digit and dense-entry bounds apply before integral-kernel or
parameter-basis arithmetic. Oversized integer tokens therefore stop replay
without constructing unbounded recovery data.

## Commands

First turn an arbitrary certified finite action into a bounded, immutable job
bundle as described in
[`generic-h1-external-job.md`](generic-h1-external-job.md):

```bash
corepack pnpm cover:prepare:generic-h1 -- \
  --system SYSTEM.json --action ACTION.json --output-dir NEW_JOB_DIRECTORY
```

Inspect a canonical LinBox sparse-row matrix before writing a request:

```bash
python scripts/generic_sparse_h1_bridge.py inspect-matrix boundary.linbox
```

For a large proof-carrying run, build the companion LinBox worker and let it
emit both the modular-kernel transcript and independently replayable rank
evidence:

```bash
g++ -std=c++17 -O2 scripts/generic_sparse_h1_rank_worker.cpp \
  -o generic_sparse_h1_rank_worker \
  $(linbox-config --cflags) $(linbox-config --libs)
./generic_sparse_h1_rank_worker boundary.linbox 30011 \
  kernel-p30011.txt rank-evidence-p30011.txt
```

After recording the transcript hash in a sealed `consume-existing` request,
convert the evidence into the shared TypeScript/Python certificate schema:

```bash
python scripts/generic_sparse_h1_bridge.py emit-rank-certificate \
  request-without-rank-proof.json rank-evidence-p30011.txt rank-certificate.json
```

The emitter requires the evidence prime, rank, and nullity to agree with the
declared modular transcript. It then replays every kernel product and the
selected minor against the same matrix pass used to recompute the canonical
matrix digest. Only verified bytes are published, without overwriting. Add the
new certificate path and file hash as `rankProof`, then reseal the final
request. The certificate proof is self-contained; its correctness does not
trust the worker's reported rank or unauthenticated backend label.

Assemble a response from already recorded artifacts, or execute the declared
LinBox runs and lift:

```bash
python scripts/generic_sparse_h1_bridge.py assemble request.json response.json
python scripts/generic_sparse_h1_bridge.py execute request.json response.json
python scripts/generic_sparse_h1_bridge.py emit-witness request.json integral-kernel-witness.json
```

`emit-witness` replays an already completed request and requires the full rank
proof. It writes, without overwriting, the separate sparse
`ScalableGenericActionH1IntegralKernelWitness` JSON consumed by the TypeScript
adapter. The small bridge response continues to reference the lifted basis by
hash and path instead of embedding a potentially huge copy.

Replay is source-facing: it rereads the preparation, matrix, transcripts,
lifted frame, lift certificate, and optional rank proof, then requires the
entire stored response to reproduce.

```bash
python scripts/generic_sparse_h1_bridge.py replay request.json response.json
python scripts/test_generic_sparse_h1_bridge.py
```

The Python suite also replays the rank fixture generated by
`scripts/generate_generic_sparse_rank_fixture.ts`; this guards the canonical
digest and six-source-binding contract across the TypeScript/Python boundary.

The bridge never overwrites its response. `execute` also refuses existing
transcript, integral-basis, or lift-certificate targets.

## Remaining boundary

The bridge certifies the integral kernel of the streamed tree-gauge boundary.
It does not independently rebuild the finite action or oracle; that remains the
preparation replay's responsibility. The torsion-free source hash is a binding,
not a torsion-freeness verification; the action adapter performs that replay.
The bridge also does not compute wall coordinates or Smith data. Those are
consumed by the scalable generic completion after the full integral kernel has
been certified.

That completion is currently a TypeScript library boundary, not a CLI. No
orchestrator yet constructs the final bridge request automatically, imports the
emitted witness, or feeds the resulting full integral `H^1` into exact
height-chamber, generalized-compression, and all-cell link certification.
Accordingly this protocol certifies cohomology input; it does not by itself
certify finite generation of a character kernel or any algebraic or smooth
fibering result.

The LinBox worker's dense `columns × nullity` nullspace is the remaining main
memory constraint. This path is intended for the target regime where the
quotient boundary is large but `b1` is modest.
