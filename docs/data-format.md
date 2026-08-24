# Data Format

Imported JSON is untrusted. The app validates identifiers, matrix entries,
actions, signed attaching maps, compression fibers, and certificate hashes
before using them. A clear failure is preferable to repairing mathematical data
silently.

This chapter distinguishes three kinds of data:

1. **source data**, such as a Coxeter matrix or a finite permutation action;
2. **derived incidence**, such as `\hat X`, `\bar X`, and their walls;
3. **drawing state**, such as coordinates, opacity, and camera position.

Only the first two can carry mathematical incidence claims.

## Coxeter System Input

The core source object is `CoxeterSystemInput`. The following excerpt omits
secondary provenance fields:

```ts
type CoxeterMatrixEntry = number | "inf";

interface CoxeterSystemInput {
  schemaVersion: 1;
  name: string;
  description?: string;
  rank: number;
  generators: Array<{
    id: string;
    label: string;
    colorHint?: string;
  }>;
  coxeterMatrix: CoxeterMatrixEntry[][];
  geometry?: GeometricModelInput;
  certificate?: CertificateSummary;
  notes?: string[];
}
```

Validation requires:

- `rank` generators and an `rank x rank` matrix;
- `m_ii = 1`;
- symmetry;
- off-diagonal entries equal to `inf` or integers at least `2`;
- unique generator IDs.

`m = 2` is a finite commuting relation. `m = inf` is not a finite relation and
does not produce a rank-two polygon.

## Geometric Data

Optional reflection data are structural rather than executable strings:

```ts
type GeometricEntry =
  | { kind: "coxeter"; m: number }
  | { kind: "right" }
  | { kind: "dotted"; coshDistance: number }
  | { kind: "numericGram"; value: number };
```

The geometry block may include normal coordinates, a basepoint, a normal Gram
matrix, interval certificates, and a preferred projection. Decimal caches do
not replace exact algebraic records or intervals. The validator rejects stale
source hashes and malformed intervals.

## Generated Cayley Balls

The Davis viewer consumes finite generated balls:

```ts
interface CayleyNode {
  id: string;
  word: number[];
  length: number;
  matrixKey?: string;
  hyperbolicPoint?: number[];
}

interface CayleyEdge {
  id: string;
  source: string;
  target: string;
  generator: number;
}

interface DavisTwoCell {
  id: string;
  generatorPair: [number, number];
  m: number;
  boundaryNodeIds: string[];
}
```

A rank-two boundary has length `2m`. Generated metadata records radius,
backend, deduplication method, caps, warnings, source hash, and backend version.
Rounded matrix deduplication is explicitly approximate.

## Finite Action Input

The cover pipeline consumes a complete finite action of every Coxeter generator
on a finite vertex set. The preferred producer is the automatic GAP
torsion-free-cover backend; manual quotient/coset import remains an advanced
fallback. Both routes meet the same validation boundary:

- a stable finite vertex ID set;
- one generator action at every vertex;
- inverse-paired directed edge records;
- Coxeter relation checks where supplied;
- subgroup representatives and backend provenance where available.

Before cover construction, validation checks that each generator action is a
permutation and an involution and that every finite Coxeter relation closes.

This is not enough to certify a torsion-free cover. The provenance block keeps
action evidence and torsion-free evidence separate:

```ts
type CoverEvidenceStatus =
  | "supplied-passed"
  | "in-repo-checked"
  | "not-supplied";
```

The app may derive exact finite incidence from an in-repo-checked action while
still reporting `torsionFreeEvidence: "not-supplied"`.

An automatically discovered action needs a companion artifact recording:

- the Coxeter presentation and source hash;
- the bounded search method, index range, and completion status;
- all maximal spherical subsets used by the torsion test;
- a complete list of prime-order representative words and their orders;
- fixed-point counts for every representative in the coset action;
- subgroup generators or a Schreier presentation;
- backend path, version, command, input hash, and output hash.

Automatic artifacts also contain `strategyAttempts` and a
`search.selectedStrategy`. A Sage result records its cyclotomic field,
prime ideal, residue field, finite image order, and every spherical image-order
check. An Everitt composite records the factor action IDs and degrees, witness
coverage, Cartesian degree bound, and actual reachable-orbit degree.

An exact congruence reduction may certify a torsion-free kernel without
materializing its regular action. That result uses a separate record:

```ts
interface AutomaticKernelCoverCertificate {
  status: "passed";
  kind: "normal-congruence-kernel";
  normal: true;
  torsionFree: true;
  certificateLevel: "finite-index-kernel" | "exact-index-kernel";
  indexStatus: "unknown" | "exact";
  index?: string; // present exactly when indexStatus is "exact"
  finiteImage: {
    candidateId: string;
    characteristic: number;
    residueFieldOrder: string;
    representationDimension?: number;
    finiteTargetCertified: true;
    orderStatus: "unknown" | "exact";
    order?: string; // present exactly when orderStatus is "exact"
  };
  criterion: "tits-maximal-spherical-injective-reduction";
  completeSphericalRestrictionChecks: true;
  sphericalImageChecks: Array<{
    subset: number[];
    expectedOrder: string;
    imageOrder: string;
    passed: true;
  }>;
  materialization: {
    status: "not-materialized" | "too-large";
    reason: string;
    maximumMaterializedDegree?: number;
  };
}
```

At the `finite-index-kernel` level, the exact finite-field matrices and all
maximal-spherical restrictions prove finite index and torsion-freeness even
though the image order is still unknown. The `exact-index-kernel` level adds
equal decimal `index` and `finiteImage.order` fields. Neither level supplies
vertices or generator permutations for `H\Sigma`. A discovery artifact may
therefore report `torsionFreeCoverCertified: true` and
`manageableCoverMaterialized: false`. Cover construction, Schreier data,
walls, and fibering require a separately checked `finiteAction` block.

Reusable partial-action catalogues bind source, matrix, witness, finite-image,
and packed-row SHA-256 hashes. Their coverage field is a bitset of witnesses
that act without fixed points. A `partial` module is search data, not a cover
certificate; only a reconstructed action with complete spherical regular-orbit
checks may become `finiteAction`.

A complete finite-image degree sweep may be reduced to a registry-friendly
`finite-image-bounded-degree-classification` artifact. It records the source,
matrix, witness-catalogue, and recognition-action hashes; one final outcome for
every requested degree; and counts of exact subgroup classes. The exporter
rejects unresolved rows. Its scope is one finite image and one degree range,
not the original Coxeter group across all finite quotients.

Very large normal kernel covers whose image order is certified also have an
exact symbolic form. An unknown-index certificate cannot supply exact orbit or
cell counts. A
`SymbolicRegularKernelCover` stores:

- the certified deck-group order and exact generator images;
- the right transition formula `q -> q rho(s_i)` for each generator;
- one deck orbit for each spherical cell type, with exact cell count
  `|Q| / |rho(W_T)|`;
- face-orbit incidence multiplicities; and
- an explicit completeness scope.

This representation does not contain a vertex array. Symmetry-restricted wall
variables may be attached to it, but the schema forbids promoting such a
restricted search to an unrestricted wall, link, or fibering certificate.

`exhausted-through-index-N` certifies only a finite search range.
`inconclusive-resource-limit` carries no nonexistence claim. Congruence and
composite searches are bounded too; their `exhausted` statuses have the same
limited meaning.

## Signed Boundary Occurrences

Every 2-cell attaching map uses signed occurrences:

```ts
interface BoundaryOccurrence {
  edgeId: string;
  traversal: 1 | -1;
  boundaryIndex: number;
  sourceVertexId: string;
  targetVertexId: string;
  generator: number;
}
```

`traversal` compares the boundary direction with the stored edge direction. It
is mathematical data. Reversing a mesh, moving a label, or changing the camera
must never change it.

Boundary validation checks cyclic closure, consecutive indices, valid edge and
vertex references, generator agreement, and expected length.

## hat X

The finite lifted presentation complex has this derived contract:

```ts
interface HatXCoverComplex {
  schemaVersion: 1;
  kind: "hat-x-cover";
  name: string;
  sourceSystem: CoxeterSystemInput;
  vertices: HatXVertex[];
  directedLiftEdges: HatXDirectedLiftEdge[];
  generatorBigonCells: HatXGeneratorBigonCell[];
  liftedRelationCells: HatXLiftedRelationCell[];
  provenance: CoverConstructionProvenance;
  warnings: string[];
}
```

Important records are:

- `HatXDirectedLiftEdge`: one directed lift of a generator loop;
- `HatXGeneratorBigonCell`: one two-edge lift of `s_i^2`, with its cover
  `baseVertexId`; there are `d` such cells per generator in a degree-`d` cover;
- `HatXLiftedRelationCell`: one lift of `(s_i s_j)^m`, with `2m`
  signed boundary occurrences.

No field in this model is a drawing coordinate.

## bar X

Compression produces:

```ts
interface BarXCompressedComplex {
  schemaVersion: 1;
  kind: "bar-x-compression";
  name: string;
  sourceSystem: CoxeterSystemInput;
  vertices: BarXVertex[];
  geometricEdges: BarXGeometricEdge[];
  relationCells: BarXRelationCell[];
  provenance: CoverConstructionProvenance & {
    compression: "generator-bigons-and-parallel-relation-lifts";
  };
  warnings: string[];
}
```

A geometric edge records the two directed `\hat X` lifts and the two generator
bigons that compress to it. A relation cell records its signed compressed
boundary and every lifted relation cell in its fiber.

The explicit `CompressionMap` contains:

- vertex images;
- directed-edge images;
- generator-bigon images;
- lifted-relation-cell images;
- edge, bigon, and relation fibers.

The associated `CompressionCertificate` checks boundary closure, expected
counts (`d r` directed edges, `d r` bigons, and `d` relation lifts per finite
pair), fiber cardinalities (two edges, two bigons, and `2m` relation cells),
complete image coverage, and agreement of signed relation boundaries. Its method is
`in-repo-exact-cellular-compression`; that phrase describes the finite
calculation, not external certification of the source cover.

## Generalized Spherical Compression Certificate

The all-ranks analogue starts from a certified permutation action on
`Omega = H\W`. For every spherical `T`, it treats each `(q,T)` as a rooted
source cell and compresses the free `W_T`-orbit of `|W_T|` rootings to one
Coxeter cell `qW_T`. Its theorem-facing artifact has kind
`generalized-spherical-compression-certificate`.

The artifact SHA-binds the parsed Coxeter system and every permutation row.
For each spherical type it records the subgroup order, rooted and compressed
counts, and fixed-size chunk hashes for both the root-to-cell map and the
ordered fiber members. For every proper inclusion `U<T`, it records the
factorized root-map commitment, the expected index `|W_T|/|W_U|`, and chunk
hashes for all compressed face incidences. Replay reconstructs and compares
the complete artifact; changing the outer archive hash cannot make altered
fiber or face data pass.

The JSON is intentionally a compact commitment, not a giant list of millions
of objects. `rootedSourceCellObjectsMaterialized` and
`strictFaceIncidencesMaterialized` are both `false`. The bounded inspection
helpers `materializeGeneralizedCompressionFibers` and
`materializeGeneralizedCompressionFaceCompatibility` reconstruct one type or
one `U<T` relation from the bound action.

Rank-at-most-two agreement has an explicit scope:

- `definition-level` replays the exact alternating generator boundaries from
  the action and proves agreement with the mathematical compression rule;
- `materialized-artifact` additionally checks a supplied `hat X -> bar X`
  object, including point/source binding, all four image maps, all fibers,
  endpoints, signed polygon boundaries, and both-way incidence coverage.

Only the second scope sets `materializedRankAtMostTwoBridgePassed` to `true`.

## Wall Systems

A wall result is derived from `BarXCompressedComplex`:

```ts
interface WallSystem {
  sourceComplexName: string;
  walls: Wall[];
  crossingSegments: WallCrossingSegment[];
  edgeToWallId: Record<string, string>;
  diagnostics: WallSystemDiagnostics;
}
```

Each `Wall` stores its geometric edge IDs, crossing-segment IDs, incident cell
IDs, two-sidedness, and the relative parity of each dual edge. Each crossing
segment records one opposite pair in one relation cell.

Diagnostics retain inspectable witnesses rather than a bare Boolean:

- repeated wall crossings or reused opposite occurrences for embeddedness;
- parity-conflict cycles for two-sidedness;
- multiple local-link adjacency features for self-osculation.

Wall IDs are canonical for one topology revision. They must not depend on scene
coordinates or iteration order.

## Coorientations

```ts
interface WallCoorientation {
  wallSigns: Record<string, 1 | -1>;
  edgeDirections: Record<string, 1 | -1>;
  valid: boolean;
  errors: string[];
}
```

`wallSigns` chooses one of the two coorientations relative to each wall's
canonical edge. `edgeDirections` expands those choices to every geometric edge
relative to its stored source-to-target direction.

A one-sided wall cannot receive a valid global sign. Exporters must report the
obstruction instead of choosing inconsistent local arrows.

## Lawful Subcomplex Results

For each relation cell, `LawfulCellEvaluation` records:

- the cyclic boundary signs;
- the sign-transition count;
- source and sink when lawful;
- the two positive boundary paths;
- whether the cell is retained.

`LawfulSubcomplexEvaluation` keeps all vertices and geometric edges of
`\bar X`, plus exactly the lawful relation cells for the active coorientation.
It also records discarded cell IDs and validation errors.

This block certifies maximality only **for the recorded coorientation**: every
cell passing the same lawful test is present. It says nothing about whether a
different coorientation would keep more cells.

## Coorientation Search Results

```ts
type MaximumLawfulSearchStatus =
  | "optimal"
  | "best-found"
  | "infeasible"
  | "invalid-wall-system";
```

`MaximumLawfulSearchCertificate` records method, bounds, gap, wall count,
searched nodes, elapsed time, termination reason, and whether global-reversal
symmetry was removed.

Interpretation is strict:

- `optimal` requires `optimalityProven: true` and a completed exact search;
- `best-found` is a lower bound from an incomplete exact run or deterministic
  local search;
- `infeasible` means no assignment met the requested link constraints;
- `invalid-wall-system` means a required wall condition prevented the search.

Cell weights and Morse-link constraints are search options and must be included
in the export hash.

## Ascending And Descending Links

`MorseLinksResult` stores an ascending and descending link for every vertex.
Each link contains its link vertices, retained cell corners, connected
components, and nonempty/connected flags. Aggregate fields state whether all
vertices pass each requested condition.

These are exact diagnostics for the supplied coorientation and retained finite
cell structure. They do not certify asphericity, affine metrics, or the
hypotheses of a group-theoretic theorem.

## Virtual Algebraic Fibering Certificate

### Legacy compressed 2-complex profile

The fibering export is derived data. It does not change the quotient or
compression schemas:

```ts
interface VirtualAlgebraicFiberingCertificate {
  schemaVersion: 1;
  kind: "virtual-algebraic-fibering-certificate";
  status: "passed" | "failed" | "incomplete";
  source: {
    coxeterSystemName: string;
    finiteActionName: string;
    subgroupName: string;
    subgroupIndex: number;
    actionEvidence: string;
    torsionFreeEvidence: string;
  };
  wallHomomorphism: WallHomomorphismFiniteCertificate;
  primitiveHomomorphism: PrimitiveSchreierHomomorphismCertificate;
  lawfulSubcomplex: LawfulSubcomplexEvaluation;
  morseLinks: MorseLinksResult;
  plMorse: PLMorseHypothesisCertificate;
}
```

`primitiveHomomorphism.presentation` contains the Schreier transversal,
generators as words in the Coxeter generators, and rewritten relators. Each
`generatorValues` record stores both the raw wall period `chi(x)` and the
normalized primitive value `phi(x) = chi(x)/d`. Every `relatorChecks` entry
must have raw and normalized value zero. The definition of the transversal,
Schreier generators, and rewriting algorithm is in
[Certifying a virtual algebraic fibration](virtual-algebraic-fibering.md#1-present-the-subgroup-h).

`wallHomomorphism.cocycle.relationChecks` records the signed contribution of
every boundary occurrence in every compressed relation cell. The image block
records the positive period gcd and a Bezout identity. A status of `passed`
requires a verified normalized gcd of one; it never follows merely from seeing
a nonzero arrow in the viewer.

`plMorse.checks` lists the cover, torsion-free evidence, compression,
dimension/asphericity condition, affine cell model, wall coorientability,
coorientation, cocycle, lawful full 1-skeleton, directed links, nonzero map,
and primitive image separately. The final fibering statement is present only
when every required check passes. See
[Certifying a virtual algebraic fibration](virtual-algebraic-fibering.md).

`plMorse.auxiliaryDiagnostics` records wall embeddedness and
self-osculation. These diagnose whether the probabilistic random-orientation
estimate in Jankiewicz--Wise applies; they do not override directly verified
cocycle and link data for a concrete orientation.

`plMorse.linkCertificates` gives an independently checkable connectivity
witness for each ascending and descending link: exact link-vertex ids,
retained-cell corner ids, components, and deterministic spanning-tree corner
ids. `plMorse.checks` also separates the cellular map to `S^1`, compatible
regular affine cells, the nonconstant Morse extension, integral discrete
lifted heights, asphericity evidence, and the full-1-skeleton surjection back
to `H`.

An exported artifact can be checked without opening the viewer:

```bash
node scripts/validate_virtual_fibering.mjs certificate.json
```

### Action-rooted lawful profile

The automatic first track exports a self-contained certificate rooted in the
finite permutation action rather than trusting stored compressed incidence:

```ts
interface LawfulSubcomplexActionCertificate {
  schemaVersion: 1;
  kind: "action-rooted-lawful-subcomplex-fibering-certificate";
  status: "passed" | "failed" | "incomplete";
  subgroupAction: CertifiedFiniteActionEvidence;
  requestedWallSigns: Record<string, 1 | -1>;
  lawful: LawfulSubcomplexFiberingCertificate;
  hashes: {
    sourceSystemSha256: string;
    actionSha256: string;
    coverCompressionSha256: string;
    wallSystemSha256: string;
    coorientationSha256: string;
    lawfulCertificateSha256: string;
    artifactSha256: string;
  };
}
```

The verifier recertifies spherical freeness and reconstructs the quotient,
compression, walls, signs, cellular presentations, metric links, directed
links, primitive character, and kernel-transfer argument from the embedded
action. The default `rank-two-lawful` model retains the full 1-skeleton and
exactly the lawful polygons. The optional `coface-closed-full` model also
retains each higher Davis cell whose every 2-face is lawful. Its closure record
is proof of a subcomplex only; higher-cell affine, asphericity, and full-link
evidence remain mandatory before promotion.

### Bring-your-own finite action

The command-line promotion entry point accepts three action envelopes:

1. a raw `TorsionFreeActionCandidate`;
2. `{ "candidate": <TorsionFreeActionCandidate>, ... }`, where any supplied
   certificate is ignored;
3. the hash-bound packed-composite solver artifact used by automatic
   discovery.

The minimal raw form is:

```ts
interface TorsionFreeActionCandidate {
  id: string;
  index: number;
  // generatorImages[g][q] = q * s_g, with points numbered 0,...,index-1.
  generatorImages: number[][];
  name?: string;
  backend?: string;
  backendVersion?: string;
  source?: string;
  notes?: string[];
}
```

Rows must follow the generator order of the selected Coxeter example. The
pipeline computes its own action hash and rechecks transitivity, involutions,
all finite Coxeter relations, and freeness of every spherical special subgroup;
the user's word “torsion-free” is not evidence.

The browser's **Import finite cover JSON** path is different: it currently
expects an expanded schema-v1 `QuotientComplex` with vertices, edges, cells,
and `permutationAction`. Automatic discovery artifacts are another envelope
and are normalized by the discovery adapter. For infinite compact Coxeter
systems, subgroup-generator words alone are not presently converted to a
finite action by the finite-only Sage/GAP quotient exporters.

The outer materialized-action envelope has schema version 2 and kind
`materialized-action-two-track-promotion`. Its six stages are
`materialized-action`, `spherical-plan`, `spherical-freeness`,
`quotient-2-skeleton`, `lawful-subcomplex`, and `full-davis-fallback`.
`selectedTrack` is either `lawful-subcomplex`, `full-davis`, or `null`. A
passing envelope needs the four common stages plus a fresh replay of the named
selected track; the other track may be `not-run` or inconclusive.

### Full Davis-quotient profile

The higher-dimensional certification path exports a separate schema. It does
not reinterpret the legacy object above:

```ts
interface FullDavisVirtualFiberingCertificate {
  schemaVersion: 2;
  kind: "full-davis-virtual-algebraic-fibering-certificate";
  method: "torsion-free-full-davis-pulling-morse";
  status: "passed" | "failed" | "incomplete";
  source: {
    coxeterSystemName: string;
    coxeterSystem: CoxeterSystemInput;
    quotientName: string;
    subgroupName: string;
    subgroupIndex: number;
  };
  subgroupAction?: CertifiedFiniteActionEvidence;
  coverCompression?: CoverCompressionResult;
  fullCellPoset?: FullDavisQuotientCellPoset;
  wallSystem?: WallSystem;
  coorientation?: WallCoorientation;
  wallHomomorphism?: WallHomomorphismFiniteCertificate;
  primitiveHomomorphism?: PrimitiveSchreierHomomorphismCertificate;
  triangulation?: PullingTriangulationCertificate;
  heightFunction?: PrimitiveMorseHeightCertificate;
  directedLinks?: FullDirectedLinkCertificate;
  result: {
    closedIntegralWallCocycle: boolean;
    wallCocycleExtendsAcrossEveryCoxeterCell: boolean;
    explicitPrimitiveEpimorphismToZ: boolean;
    allAscendingAndDescendingLinksNonemptyConnected: boolean;
    finitelyGeneratedKernel: boolean;
    virtualAlgebraicFibration: boolean;
    allDirectedLinksCollapsible: boolean;
    imm23TopologicalFibrationCertified: boolean;
  };
  hashes: Record<string, string | undefined>;
}
```

`fullCellPoset` contains every `HwW_T` cell and every face incidence. Its FNV
key is a fast in-app revision key; `archiveHash` is SHA-256 over the complete
canonical incidence records. The action, cover, walls, signs, all rank-two
equations, Schreier character, subdivision, exact height, and full directed
links each have content hashes chained into the final artifact hash.

`heightFunction.cellCharts` stores cell-local lifts of the wall cocycle. A
single real-valued potential on the finite quotient would force every loop
period to vanish, so these charts are allowed to differ by certified additive
constants on overlaps. `periodicOffset` values are exact rational tie breakers;
they are quotient-periodic and every edge-sign inequality is recorded.

`wallCocycleExtendsAcrossEveryCoxeterCell` is stronger than the rank-two
boundary check. It is true only after the verifier reconstructs a consistent
cell-local potential on every cell of `fullCellPoset`, including all higher
spherical cells, and checks additive constants on every face/coface overlap.

`directedLinks` contains both full simplicial links at every quotient vertex
orbit. Each contains its maximal simplices, connected components, and a
collapsibility result. A positive collapse result includes a replayable
elementary-collapse sequence. `unknown-budget` is inconclusive and is never
reported as noncollapsibility.

A `passed` schema-v2 artifact means the primitive map, full-cell extension,
and all nonempty, connected full-link checks passed. It certifies an explicit
virtual algebraic fibration with finitely generated kernel. It does not certify
a locally trivial or smooth bundle. The current code has no source-bound
IMM-style manifold/PL/smoothing verifier; legacy caller-supplied hypothesis
booleans are ignored and `imm23TopologicalFibrationCertified` remains false,
even when every directed link is collapsible.
See [Full Davis-quotient fibering certification](full-davis-fibering-certification.md).

## View And Experiment Exports

View state is separate from topology. A reproducible Covers + Walls export
should record:

- source-system and finite-action hashes;
- `\hat X`, `\bar X`, and compression-certificate hashes;
- wall-system hash and diagnostics;
- active coorientation or search certificate;
- lawful and link result hashes;
- selected model, wall, edge, cell, and vertex;
- visible filters and drawing settings;
- camera pose, notes, warnings, and screenshot metadata.

Changing opacity or the camera must change the view hash, not the topology or
certificate hash.

The current desktop/browser session envelope is deliberately small:

```ts
interface CoverWallViewSession {
  schemaVersion: 1;
  sessionKind: "coxeter-cover-wall-session";
  appVersion: string;
  updatedAt: string;
  exampleId: string;
  sourceCover?: QuotientComplex;
  view: {
    model: "davis" | "hat-x" | "bar-x" | "gamma" | "projection";
    wallSigns: Record<string, 1 | -1>;
    wallDisplayMode: "all" | "selected";
    showInducedDirections: boolean;
    colorEdgesByWall: boolean;
    selectedWallId?: string;
    selectedCellId?: string;
    selectedNodeId?: string;
    barRelationFamily: "shared-complex" | "all" | `${number}:${number}`;
    linkLens: "none" | "ascending" | "descending";
    // Radius, projection, labels, visibility, interface mode, and theme follow.
  };
}
```

The importer validates the finite action again after opening a session. It then
reconstructs `\hat X`, `\bar X`, the walls, and all derived diagnostics; those
large derived records are not trusted merely because they appeared in a saved
view file.

`barRelationFamily` is view state only. A pair key focuses one finite Coxeter
pair, `all` spreads every relation-disk interior, and `shared-complex` selects
the compact gluing drawing. None of these options changes a relation-cell ID,
boundary occurrence, quotient vertex, quotient edge, or attaching map.

Sessions from the earlier one-vertex/state-move workflow are legacy data. A
migration may retain their source Coxeter system, notes, camera, and imported
finite action, but it must not reinterpret old state/move records as wall
coorientations. Unsupported fields need an explicit migration warning.

## Metadata And Certificates

Generated and certified artifacts should record:

```ts
interface ArtifactMetadata {
  schemaVersion: number;
  sourceHash: string;
  inputHash: string;
  outputHash: string;
  tool: string;
  toolVersion?: string;
  command?: string;
  certificateScopes: string[];
  claims: string[];
  limitations: string[];
  warnings: string[];
}
```

Stable hashes cover mathematical input in deterministic order. Timestamps,
absolute local paths, and scene coordinates are excluded unless the artifact
explicitly describes a run environment or view.

Certificate scopes are additive, not contagious. A source-transcription
certificate does not imply a torsion-free cover; a compression certificate does
not imply wall two-sidedness; a link check does not imply a Morse theorem.

## Import Failure Policy

Imports fail with path-specific errors for:

- malformed Coxeter matrices;
- unknown or duplicated IDs;
- nonbijective or noninvolutive generator actions;
- failed finite Coxeter relations;
- open or wrongly signed cell boundaries;
- wrong `2m` boundary lengths;
- incomplete compression fibers;
- stale source or certificate hashes;
- unsupported schema versions.

The repair UI may suggest a migration or identify a missing record. It must not
invent subgroup evidence, reverse attaching maps silently, or promote a
browser-derived object to certified status.

## Bundled Examples

Small examples such as `I2(5)`, `A2`, and `A3` are useful for checking exact
counts and boundaries. The regular ideal 3-cube adds exact Lorentzian source
data and a bundled index-24 regular `S4` action. Its checker verifies the Gram
signature, eight ideal vertices, the transposition map, and every spherical
restriction used in the torsion-free certificate. The compact 5-cube, compact
prism family, and Tumarkin eight-facet catalogue carry source and Gram-related
certificates with scopes described in [references.md](references.md).

The earlier cube-graph legal-system fixture remains useful as historical test
data for the right-angled special case. It is not the guiding product workflow
for general Coxeter exponents.
