# Exact Data Versus Drawing Conventions

CoxeterViewer5D is designed around a simple rule: show useful pictures, but do
not let the picture make a stronger mathematical claim than the data supports.

## Three Layers

| Layer              | Examples                                                                                   | What It Can Support                                                 |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Combinatorial data | Coxeter matrix, generators, Cayley nodes, edges, Davis cell boundaries, quotient actions   | Exact incidence and relation statements when validated or certified |
| Numerical geometry | Hyperboloid normals, solved basepoints, reflection matrices, projected chamber barycenters | Geometric exploration with tolerances and warnings                  |
| Drawing convention | Shell layout, force layout, PCA, proxy hulls, ghost context, camera presets                | Readable inspection, screenshots, and teaching views                |

These layers often appear in the same scene. A filled Davis cell can have an
exact boundary while its Euclidean-looking panel is only a drawing.

## What "Exact" Means Here

An exact or certified claim is narrow. It should say exactly what was checked.

Examples of narrow exact claims:

- The Coxeter matrix is symmetric and has valid diagonal and off-diagonal
  entries.
- A generated graph uses right multiplication and contains no duplicate exact
  backend elements within the exported radius.
- A rank-two cell has boundary length `2m` for its generator pair.
- A Schreier certificate verifies generator involutions and finite relation
  closure on the quotient action.
- A compact example certificate verifies a source transcription or Gram
  signature claim stated in that certificate.

Examples of claims that do not follow automatically:

- A 3D projected scene preserves hyperbolic distances.
- A proxy rank-three hull is an exact affine Coxeter cell.
- A finite quotient is a manifold.
- A rounded floating-point matrix key proves a group order.
- A screenshot is a certificate.

## What Counts As A Drawing

The following are useful drawings, not mathematical embeddings:

- Word-length shell layouts.
- Force-directed layouts.
- Local chamber re-rooting.
- `Y_Gamma` singular relation sheets and hidden construction corners.
- Higher-rank Davis proxy hulls.
- PCA projections from higher-dimensional point clouds.
- Camera offsets, opacity, label placement, and ghost context.

The drawing may be deterministic and carefully tested. Deterministic does not
mean exact.

## How To Read A Scene

Ask these questions in order:

1. What is the source object: Coxeter system, generated Cayley ball,
   `Y_Gamma`, or quotient complex?
2. Which selected object is the inspector describing: node, edge, rank-two
   cell, higher cell, or quotient vertex?
3. Which fields are structural ids or incidence records?
4. Which parts are numerical geometry or projection?
5. Which warnings apply to the current view?

This order keeps the mathematical object ahead of the picture.

## Captions And UI Language

Use conservative captions:

- "rank-two Davis cell with boundary length 6"
- "hyperbolic chamber barycenters projected to 3D"
- "PCA drawing of a local neighborhood"
- "quotient complex with Schreier-action diagnostics"
- "`Y_Gamma` relation face for a finite generator pair"

Avoid stronger captions unless the artifact supports them:

- "the true 3D geometry"
- "the manifold"
- "exact hyperbolic distances"
- "proof of compactness"
- "certified torsion-free quotient"

When a stronger claim is valid, cite the certificate or source field that
supports it.

## Screenshots

A screenshot records a camera state and render state. Pair it with a sidecar
export when it is used in a note, demo, or issue. The sidecar contains the
dataset id, selected object, filters, view mode, warnings, and scene stats that
make the image reproducible.

The rule of thumb: the screenshot teaches what to look at; the JSON says what
was actually inspected.
