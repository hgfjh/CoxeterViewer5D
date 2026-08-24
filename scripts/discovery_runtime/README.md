# Discovery runtime

This package provides the operating-system layer for long torsion-free-cover
searches. It does not choose subgroups or certify Coxeter mathematics.

The public pieces are independent:

- `DiscoveryRuntimeSession` is the stable launcher API. It stages the request,
  polls a cancel file, selects native or WSL execution, opens persistent
  journals, publishes chosen outputs, and cleans scratch on exit.
- `PersistentCacheLocation` exposes matching host and backend paths under
  `~/.cache/coxeter-viewer/torsion-free` for WSL sessions. Catalogue caches are
  keyed by input hash; run and checkpoint caches are keyed by input and config
  hashes. This directory is mode `700` and is never placed under `/mnt/c`.
- `ScratchWorkspace` stages a run into WSL's Linux filesystem when available
  and records hashes for every copied input and published output.
- `ResourcePortfolio` admits four to six lightweight jobs and a separately
  capped heavy queue under one byte budget.
- `ManagedProcessRunner` owns the complete process tree and kills descendants
  after cancellation or timeout.
- `CheckpointJournal` resumes only when the input and configuration hashes
  match, and verifies its append-only hash chain on open.
- `PackedPermutationSpool` stores exact action rows in 8-, 16-, or 32-bit form
  and commits complete batches without constructing a large JSON value.

Run the dependency-free self-test from the repository root:

```powershell
python -m scripts.discovery_runtime
```

To require a live WSL ext4 staging check:

```powershell
python -m scripts.discovery_runtime --wsl
```

Run the focused unit suite with:

```powershell
python -m unittest discover -s scripts/discovery_runtime/tests -p "test_*.py"
```

Callers should put only transient work in a scratch workspace. A passing action,
its certificate, the copy manifest, and the final journal belong in the chosen
research workspace. Browser operation remains independent of Python; on a
desktop without WSL, `ScratchWorkspace` uses a unique local temporary directory
and every subprocess still runs with `shell=False`.

A launcher can use the integration API without depending on implementation
details:

```python
from scripts.discovery_runtime import DiscoveryRuntimeSession

with DiscoveryRuntimeSession(request, search_config, checkpoint_dir) as runtime:
    journal = runtime.journal("congruence-images")
    catalogue_cache = runtime.paths.catalogue_cache_execution_path
    result = runtime.run_backend(
        "sage-mod2",
        ["sage", "worker.py", runtime.paths.input_execution_path],
        timeout_seconds=900,
        memory_limit_bytes=8 * 1024**3,
    )
```
