# Research Container

This container is for reproducible artifact work, not day-to-day viewer
development. It keeps the browser app stack aligned with `package.json` and
adds the heavy exact-tool layer used by certificate scripts:

- Node 22 with `pnpm@11.3.0`
- Python 3
- SageMath from the Debian stable package set
- GAP with KBMAG from the Debian stable package set
- a stable `COXITER_EXECUTABLE` path for a locally installed or mounted CoxIter
  binary

The lightweight `.devcontainer/` remains the default because normal app
development, tests, and docs do not need Sage, GAP, KBMAG, or CoxIter.

Typical research checks:

```bash
pnpm validate:research-grade
pnpm compare:all-backends
pnpm registry:validate
pnpm workflow:validate
pnpm bench:timed:check
```

CoxIter is intentionally represented by an executable path rather than vendored
source. The external artifact manifest records the exact binary path, version,
input hash, and output hash whenever CoxIter is used for a claim.
