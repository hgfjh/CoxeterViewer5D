# GitHub Pages deployment

The project site is configured for [CoxeterViewer5D](https://hgfjh.github.io/CoxeterViewer5D/).
It uses the same React application and starts with the bundled `I2(5)` wall
example. Example selection, session import and export, and browser storage
follow their usual viewer behavior.

## Run locally

Use Node.js 22.13 or later in the Node 22 line with Corepack and the
`pnpm@11.3.0` pinned in `package.json`. The Pages workflow uses the latest
Node 22 patch on Ubuntu 24.04. [Pinned pnpm package metadata](https://github.com/pnpm/pnpm/blob/v11.3.0/pnpm/package.json)

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Build, inspect, and serve the Pages artifact in separate terminals as needed.

```bash
pnpm build:pages
pnpm verify:pages
pnpm preview:pages
```

Open `http://127.0.0.1:4180/CoxeterViewer5D/`. The static preview serves
`.tmp/pages-dist/` at that prefix and returns 404 for missing files. Use a
separate terminal or stop the preview before running the smoke test, which
starts its own server on the same port.

```bash
pnpm exec playwright install chromium
pnpm e2e:pages
```

The Pages config inherits the main Vite configuration and sets the site prefix
and output directory for this build. Vite rewrites the entry, chunk, CSS, and
worker URLs. The app imports the catalogue and its embedded certificates from
`src/examples/`. Standalone CLI and reference copies in `public/` are left out
of the Pages artifact. The verifier inventories `index.html` and generated
JavaScript and CSS bundles, checks that HTML asset URLs resolve at the Pages
prefix, and rejects unexpected files, including source maps and symlinks.
In CI it also checks the base path reported by GitHub Pages.
Builds from a workspace include the source imported by that workspace. Publish
from the workflow's clean checkout on `main` to control what becomes public.

`pnpm build`, `pnpm preview`, and `pnpm release:web` continue to use root-hosted
`dist/`. Tauri also builds from `dist/` and keeps its native bridge and bundle.

## What runs in the browser

| Browser                                                                                                                                            | Desktop or external tooling                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Bundled examples, Cayley and Davis neighborhoods, defining graphs, and geometric projection from supplied data                                     | SageMath exact export and GAP/KBMAG workflows                                                                    |
| Import and local validation of supported artifacts, manageable finite actions, cover compression, wall operations, and lawful-cell and link checks | Automatic discovery through the desktop job or CLI with the applicable Python, SageMath, and GAP tools           |
| File picker and downloads for supported sessions, requests, and results, plus screenshots when WebGL 2 is available                                | Native file associations, filesystem and job integration, and external CoxIter or research certification tooling |

In **Covers + Walls**, expand **Search bounds and fallback import** to export
a request and import a finite action or discovery artifact. The viewer checks
the imported data within its existing validation scope and shows the
certificate and search status. For installation and CLI commands, see the
[desktop releases](https://github.com/hgfjh/CoxeterViewer5D/releases) and the
[cover discovery guide](torsion-free-cover-discovery.md).

The app keeps its distinctions among exact incidence, externally certified
artifacts, numerical approximations, drawing conventions, and bounded or
incomplete searches. Ordinary module workers run on Pages. The Pages host does
not provide the cross-origin isolation headers required for `SharedArrayBuffer`.
Builds with shared-memory research kernels use their existing inline fallback
on Pages. The browser performs its computations locally after the required
files load. Reloading offline depends on the browser cache.

## Publish or roll back

1. Open the repository's **Settings → Pages**. In **Build and deployment →
   Source**, select **GitHub Actions**. Leave the custom domain field blank to
   use the project URL shown above. [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. Push the reviewed deployment commit to `main`, or select **Actions → Deploy
   browser app to GitHub Pages → Run workflow** and choose `main` when the
   workflow is already present. The deployment job publishes the verified
   artifact to the `github-pages` environment and reports the live URL.
3. If a deployment needs to be rolled back, revert the offending commit on
   `main` and push the revert. The same workflow rebuilds and verifies that
   source before deploying. Git history records both changes.

Pages CI runs Prettier, ESLint, Vitest, the TypeScript and Vite production
build, the artifact verifier, and the subpath Chromium smoke tests. The
research-grade workflow retains the full browser suite, timed regression
gate, artifact manifests, and external mathematical validation. The desktop
release workflow continues to build native packages separately.

For a blank page or missing chunks, open the browser Network tab and check
the document and script URLs. The page should be at `/CoxeterViewer5D/`, and
its same-origin scripts, styles, and workers should be under
`/CoxeterViewer5D/assets/`. An HTML response for a JavaScript URL usually
means a missing file was replaced with a fallback page. A root `/assets/`
request points to a root build or a stale document. Confirm the deployed
workflow run and retry in a fresh browser context, then reproduce any failure
with `pnpm verify:pages` and `pnpm e2e:pages`.

## Local performance measurements

The comparison used a pristine `origin/main` snapshot (`065112e`) for the
root build and that snapshot plus the Pages changes for the project build.
Both ran through the same loopback static server on Windows with an Intel
Core Ultra 9 185H, 23 GiB RAM, Node.js 24.16.0, and headless Chromium
148.0.7778.96. The server sent uncompressed responses and used the same
asset cache policy for both builds.

| Measurement                                                 |        Root production |       Pages production |
| ----------------------------------------------------------- | ---------------------: | ---------------------: |
| All static files                                            | 2,349,298 B (44 files) | 2,052,246 B (17 files) |
| Cold JS transfer, including response headers                |            1,507,061 B |            1,507,831 B |
| Cold CSS transfer, including response headers               |               47,209 B |               47,209 B |
| Cold JS and CSS payloads, gzip estimate                     |              407,114 B |              407,417 B |
| Cold first rendered decagon, median of five                 |                 579 ms |                 574 ms |
| Warm first rendered decagon, median of five                 |                 423 ms |                 394 ms |
| Search worker creation through first result, median of five |                  18 ms |                  16 ms |
| Switch to Davis, timed suite                                |                 408 ms |                 398 ms |
| Flip a selected wall, timed suite                           |                  82 ms |                  92 ms |
| Run lawful search, timed suite                              |                 102 ms |                  82 ms |
| Added render frames during the 900 ms idle check            |                      0 |                      0 |

The first-scene measurement waits for the decagon, its five wall arcs, and
the label counts. The warm runs reused each cold run's browser context and
the JS/CSS transfer counters were zero. The worker measurement includes
loading, initialization, and the first computation. The Pages build's three
largest bundles were Three.js (524,048 B), cover and wall code (268,598 B),
and the on-demand lawful-certification worker (246,918 B). The standalone
example copies account for nearly all the artifact size difference.

Both builds passed the existing timed-browser structure, semantic floors,
and configured budgets. The timings describe this machine and loopback
setup. GitHub CDN transfer and remote-network latency were outside this
measurement. See the [performance audit](performance-audit.md) for the
benchmark methodology and regression checks.

Codex assisted with the Pages configuration, browser capability messaging,
deployment tests, and this documentation.
