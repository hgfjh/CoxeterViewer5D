# Data Format

The viewer consumes validated JSON. Imported data is untrusted input: parse it as data, validate it, and never evaluate formulas or code embedded in strings.

## Coxeter System Input

The initial input format is versioned so examples can evolve without silently changing meaning.

```ts
type CoxeterMatrixEntry = number | "inf";

type DataStatus = "toy" | "placeholder" | "verified-source" | "certified";

interface SourceRef {
  id: string;
  citation: string;
  url?: string;
  locator?: string;
  notes?: string;
}

interface ExactReal {
  kind: "algebraic-real";
  decimal: number;
  minimalPolynomial: number[];
  isolatingInterval: [number, number];
}

type GeometricEntry =
  | { kind: "coxeter"; m: number; sourceRefId?: string; exact?: ExactReal }
  | { kind: "right"; sourceRefId?: string; exact?: ExactReal }
  | {
      kind: "dotted";
      coshDistance: number;
      sourceRefId?: string;
      exact?: ExactReal;
    }
  | {
      kind: "numericGram";
      value: number;
      sourceRefId?: string;
      exact?: ExactReal;
    };

interface CoxeterSystemInput {
  schemaVersion: 1;
  name: string;
  dataStatus?: DataStatus;
  description?: string;
  rank: number;
  generators: Array<{
    id: string;
    label: string;
    colorHint?: string;
  }>;
  coxeterMatrix: CoxeterMatrixEntry[][];
  geometry?: {
    model: "hyperboloid";
    dimension: number;
    normalGram?: GeometricEntry[][];
    normalCoordinates?: number[][];
    basepoint?: number[];
    projection?: "klein-pca" | "poincare-pca" | "klein-axes" | "poincare-axes";
    source?: string;
  };
  sourceRefs?: SourceRef[];
  certificate?: CertificateSummary;
  notes?: string[];
  warnings?: string[];
}
```

Schema version 1 now validates first-class provenance fields. `verified-source`
requires at least one `sourceRefs` entry. `certified` additionally requires a
passed certificate block. Toy and placeholder examples can omit source refs, but
placeholders must still carry visible warnings.

Use the following vocabulary consistently in notes, warnings, and future
metadata:

- `verified`: the displayed Coxeter matrix, diagram, or dotted-edge weights were
  transcribed from a cited source, and the exact claim being verified is stated.
- `computed`: data was derived by a named computation from verified input, such
  as numerical `normalGram` factorization. Computed floating-point geometry is
  visualization data unless an exact certificate is cited.
- `toy`: constructed data for exercising the viewer or tests, with no published
  classification claim.
- `placeholder`: label or UI scaffolding only. It is not suitable for
  mathematical use until replaced by verified source data.
- `uncertified`: a useful import or experiment whose provenance is incomplete.

Validation rules should include:

- `schemaVersion` must be supported.
- `rank` must match the generator count and matrix dimensions.
- The Coxeter matrix must be square and symmetric.
- Diagonal entries must be `1`.
- Off-diagonal finite entries must be integers at least `2`; infinite entries are encoded as `"inf"`.
- Generator ids must be unique and stable.
- Geometry, when present, must use declared dimensions consistently.
- `normalCoordinates`, when supplied, should be interpreted as rows indexed by generator unless a later schema version says otherwise.
- `normalGram`, when supplied without coordinates, may be numerically factored into Lorentzian normal coordinates for visualization. The result must be warned about as numerical data.
- `basepoint`, when omitted for otherwise usable hyperboloid data, may be solved numerically. The solved point must satisfy the chamber inequalities within tolerance or geometric mode is disabled.
- Numeric geometric data must be finite, except for combinatorial `"inf"` Coxeter matrix entries.

If validation fails, the UI should show a human-readable error that names the field and the reason.

`sourceRefs` identify exact bibliography entries, figure or table locations, and
which field each source supports. Certificate blocks distinguish exact or
structural checks from numerical diagnostics; they do not turn a visualization
warning into a theorem claim.

## Geometric Entries

The Coxeter matrix records group relations. Geometric Gram data records reflection-hyperplane information for a chosen model.

Suggested conversion for normal Gram entries:

```text
{ kind: "right" }                  -> 0
{ kind: "coxeter", m }             -> -cos(pi / m)
{ kind: "dotted", coshDistance }   -> -coshDistance
{ kind: "numericGram", value }     -> value
```

Do not accept strings such as `"-cos(pi/5)"`. Symbolic-looking strings are ambiguous and invite unsafe parsing.

## Generated Cayley Ball

A generated ball should be deterministic for fixed input, radius, backend, and approximation settings.

```ts
interface CayleyNode {
  id: string;
  word: number[];
  length: number;
  matrixKey?: string;
  position?: [number, number, number];
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

interface SphericalSubset {
  id: string;
  generators: number[];
  generatorLabels: string[];
  rank: number;
  gramMatrix: number[][];
}

interface LocalLink {
  nodeId: string;
  vertices: Array<{
    generator: number;
    generatorId: string;
    label: string;
    colorHint?: string;
  }>;
  simplices: Array<{
    id: string;
    generators: number[];
    dimension: number;
    sphericalSubsetId: string;
  }>;
  sphericalSubsets: SphericalSubset[];
  warnings: string[];
}

interface GeneratedCayleyBall {
  systemName: string;
  rank: number;
  nodes: CayleyNode[];
  edges: CayleyEdge[];
  twoCells: DavisTwoCell[];
  higherCells?: DavisHigherCell[];
  metadata: GenerationMetadata;
}
```

Node ids should be stable canonical ids, not array indices that change when generation order changes. Edge ids should include enough information to avoid collisions between generators.

`word` stores a preferred reduced word as generator indices. It is an inspection aid and a reproducibility handle, not a claim that no other reduced word exists.

The scene may render compact labels derived from `word` and `generator`, but these labels are display choices. Exported graph data should remain structural and deterministic.

Spherical subsets and local links are derived data, not required input fields. A spherical subset lists generator indices whose special subgroup is finite. The local link records the selected `nodeId` even though full Davis-complex chamber links are currently identical; quotient links may later depend on that node.

## View-State Exports

View-state exports record what the user was inspecting. They are not source
Coxeter data and do not replace generated Cayley-ball JSON.

```ts
interface LocalNeighborhoodExport {
  schemaVersion: 1;
  kind: "coxeter-local-neighborhood-view";
  dataset: {
    id: string;
    label: string;
    systemName: string;
  };
  selectedNodeId?: string;
  selectedWord: {
    generators: number[];
    labels: string[];
    compactLabel: string;
  };
  view: {
    preset:
      | "global"
      | "local-chamber"
      | "rank-two-cells"
      | "geometric-projection";
    graphView: "global" | "on-graph";
    localDepth: number;
    mode: "shell" | "geometric";
    projection: "klein-pca" | "poincare-pca" | "klein-axes" | "poincare-axes";
    labelScope: "off" | "focused" | "budgeted";
    layout: "local-chamber-3d" | "global-shell" | "geometric-projection";
    cellRenderMode: "in-graph" | "lifted-panels" | "petals" | "outline-only";
    cellFocusMode:
      | "all-local"
      | "incident-selected"
      | "selected-pair"
      | "selected-cell";
    cellNeighborhoodMode:
      | "chamber"
      | "cell-boundary"
      | "cell-plus-1"
      | "cell-plus-2";
    relationWalkMode: "off" | "numbered";
    occlusionMode: "hide-far" | "fade-far" | "x-ray";
  };
  filters: {
    disabledGeneratorPairs: string[];
    activeGeneratorPair?: string;
  };
  visible: {
    nodeIds: string[];
    edgeIds: string[];
    rankTwoCellIds: string[];
  };
  warnings: string[];
}
```

`disabledGeneratorPairs` and `activeGeneratorPair` use the same sorted key
format as the UI pair filters, for example `"0-2"`. The `visible` ids describe
the current view after local-neighborhood filtering and render budgets; they do
not imply that omitted graph elements are absent from the generated ball.

Rank-two relation-focus state is stored in the view block and can also be
represented by this optional extension when a bundle wants the full pair-matrix
snapshot. Older exports without this extension remain valid:

```ts
interface RankTwoRelationFocusState {
  pairControlPreset: "all-on" | "all-off" | "m=3" | "custom";
  pairMatrix: Array<{
    key: string;
    generatorPair: [number, number];
    m: number | "inf";
    enabled: boolean;
    visibleCellCount: number;
    hiddenCellCount: number;
  }>;
  activeGeneratorPair?: string;
  selectedRankTwoCellId?: string;
  neighborhood: "chamber" | "cell-boundary" | "cell-plus-1" | "cell-plus-2";
  relationWalk?: {
    startNodeId: string;
    generatorLabels: string[];
    boundaryNodeIds: string[];
    boundaryEdgeIds?: string[];
  };
  ghostContext: "off" | "faint";
  boundaryLabelScope: "off" | "relation-walk" | "boundary";
}
```

The optional `selectedRankTwoCellId` is the selected-cell-only state. The cell
id must also appear in `visible.rankTwoCellIds` when it is visible. Ghost
context describes faint surrounding graph context in a screenshot or local view;
it does not add nodes, edges, or cells to the generated graph.

The view-bundle sidecar uses:

```ts
interface ViewSidecarExport {
  schemaVersion: 1;
  kind: "coxeter-view-sidecar";
  dataset: { id: string; label: string; systemName: string };
  selectedNodeId?: string;
  selectedWord?: { generators: number[]; compactLabel: string };
  filters: {
    disabledGeneratorPairs: string[];
    activeGeneratorPair?: string;
  };
  view: LocalNeighborhoodExport["view"];
  sceneStats?: object;
  warnings: string[];
}
```

The paired screenshot is a raster record of the canvas. It can document an
inspection state, but it is not a certificate of Coxeter relations, geometry,
or quotient topology.

Experiment bundles use the same view vocabulary and add run notes, render
statistics, topology diagnostics, source identifiers, warnings, and optional
screenshot data. They are reproducibility records for local inspection sessions,
not replacement Coxeter-system or generated-ball data.

## Metadata And Warnings

Generated JSON should carry the conditions under which it was produced:

```ts
interface GenerationMetadata {
  radius: number;
  requestedRadius: number;
  generatorConvention: "right-multiplication";
  deduplication:
    | "exact"
    | "rounded-matrix"
    | "external-sage"
    | "external-gap-kbmag";
  matrixKeyPrecision?: number;
  caps: {
    maxRadius: number;
    maxNodes: number;
    maxEdges: number;
  };
  backend?: {
    id: string;
    version?: string;
    command?: { argv: string[]; note?: string };
    input?: { path: string; sha256: string };
  };
  completeness?: "complete" | "truncated" | "unknown" | object;
  capStatus?: object;
  certification?: GeneratedBallCertification;
  createdAt: string;
  warnings: string[];
}
```

Warnings are part of the product. They should be shown in the UI and included in exports. Useful warnings include:

- Approximate rounded matrix keys were used for deduplication.
- Node, edge, radius, or cell caps truncated generation.
- Geometric mode is unavailable because neither `normalCoordinates` nor a usable `normalGram` was supplied, or because no valid chamber basepoint could be supplied or solved.
- Geometric normal coordinates were numerically factored from `normalGram`.
- A chamber basepoint was solved numerically, or normal orientation was flipped to satisfy the chamber inequalities.
- A rank-two cell boundary was clipped by the radius cutoff.
- A placeholder example does not contain verified compact hyperbolic data.

Warnings are not a substitute for provenance, but they are the user-facing
surface for caveats. If a file has `dataStatus: "placeholder"`, the same fact
should still appear as a visible warning.

## Example Files

Early examples should live under `public/examples/` so the app can load them offline after installation.

Recommended examples:

- `I2_5.json`: dihedral group with two generators and `m = 5`; full order `10`; one rank-two Davis decagon in the full ball.
- `A2.json`: rank-two spherical example of order `6`.
- `A3.json`: finite rank-three example of order `24`.
- `universal_rank3.json`: all off-diagonal entries infinite; useful for tree-like Cayley balls and absence of rank-two cells.
- `hyperbolic_toy_rank2.json`: explicit hyperboloid normals and basepoint for exercising geometric mode; toy data only.
- `compact_5_cube_gamma1.json`: certified compact hyperbolic Coxeter 5-cube graph from Jacquemet-Tschantz Figure 3. The bundled certificate checks the Gamma_1 source transcription table, the algebraic dotted values, and exact normal Gram rank/signature. Geometric coordinates and basepoint are still numerical visualization data derived from `normalGram`, not part of the certificate.
- `compact_5_prism_makarov.json`: certified compact hyperbolic Coxeter 5-prism graph from Bredon-Kellerhals Example 8. The bundled certificate checks the source graph based on `[5,3,3,3,3]`, the algebraic dotted value, and exact normal Gram rank/signature. Geometric coordinates and basepoint are still numerical visualization data derived from `normalGram`, not part of the certificate.

Do not ship further compact hyperbolic data, or further compact 5-cube/5-prism Gram or coordinate data, unless the source is verified and cited in [references.md](references.md).

## Import Behavior

The import path should fail closed:

- Invalid JSON produces a parse error.
- Valid JSON with schema errors produces field-specific validation messages.
- Unsupported schema versions are rejected with an upgrade message.
- Geometric data that fails validation disables geometric mode instead of crashing the app.
- Warnings from the file are preserved and displayed.

The viewer may still show combinatorial mode when geometry is invalid, provided the Coxeter matrix itself is valid.

Generated graph imports are a separate path from Coxeter-system imports. The app
validates `systemName`, `rank`, node and edge references, generator bounds,
rank-two boundary lengths, metadata, warnings, and cap fields before rendering.
When an imported generated graph does not carry the original Coxeter system, the
viewer uses a synthetic Coxeter shell for labels and colors only. In that case
spherical subsets and local-link mathematics are disabled because the Coxeter
matrix is unavailable.

## Generated JSON And External Backends

`src/backends/` validates generated Cayley-ball JSON and adds structural
certification diagnostics when possible. Exact Sage and GAP/KBMAG backends are
explicit unavailable browser generators with structured errors. The Sage script
in `scripts/` emits this generated graph shape when run under Sage and can
certify generated files outside Sage with `--certify-output`; the GAP/KBMAG
scripts reserve the same contract until that external path is implemented.

## Quotient And Game Preparation

Quotient-complex data is intentionally separate from Coxeter-system input. It can record quotient vertices, involution-paired generator edges, rank-two quotient cells, and subgroup metadata. A manifold claim requires torsion-free verification metadata.

The browser can export a quotient build request before any external
enumeration happens. That request records the source Coxeter system,
subgroup-generator words, optional word labels, a subgroup name, requested
backend, optional game preset, optional artifact manifest, and a coset cap.
Sage/GAP exporters are responsible for turning the request into a validated
`QuotientComplex`; the browser does not infer missing subgroup or manifold
claims. The bundled workflow request for `I2(5)` uses the identity subgroup and
the game preset `i2-5-height`.

The app can also derive the base orbicomplex `Y_Gamma` from a Coxeter system.
The derived JSON shape is quotient-like for validation, but the viewer presents
it as a fundamental-domain complex: one base vertex `"*"`, one oriented arrow
per generator/facet direction, rank-two cells whose boundary positions reference
`"*"`, and optional higher spherical incidence records.
The viewer presents this data as a cell atlas plus a main-stage 3D 2-skeleton.
The rendered rank-two faces are singular sheets glued to the visible generator
arrows. Hidden construction corners complete the full `2m` outline; repeated
boundary labels such as `"*"` in the quotient data are attaching-map positions
at the same quotient vertex and are not drawn as separate affine polytope
vertices in the main `Y_Gamma` scene.
Rank-three spherical records may be rendered from the finite rank-three
Coxeter-cell boundary using the base vertex and the three corresponding
generator endpoints as the visible spine. A right-angled triple is cube-like,
with six square rank-two faces. The JSON record remains incidence data; no
affine coordinates are implied by that fill.

Research-grade quotient files may also carry `schreierCertificate` and
`torsionFreeCertificate` blocks. The Schreier certificate records the checked
generator rank, vertex count, action checks, rank-two orbit matches, errors, and
warnings. The in-repo torsion-free certificate is explicitly scoped as
`visible-spherical-stabilizer`; external Sage/GAP or published-reference
certificates are required before the UI may use manifold language.

Game/PL Morse preparation stores integer edge labels, named cocycles, and
experiment logs. A named cocycle points to one integer assignment and records
its coefficient ring, currently `Z`. Experiment logs record the assignment or
cocycle id, optional selected vertex, input hash, diagnostics, and certificate
summary. Boundary-sum checks around rank-two cells are the first in-repo
cocycle certificate.

Experiment notebook bundles use the existing experiment bundle schema: saved
runs include dataset identity, view/filter state, render stats, topology
diagnostics, warnings, notes, and optional screenshots. They are deterministic
JSON and can be imported back into the browser notebook. Workflow-aware runs
also record the workflow id, active step, topology lens, quotient artifact hash,
active cocycle id, and selected topology diagnostics.

Local-link topology certificates use finite simplicial complexes over `F2`.
They report vertex/edge/triangle counts, connected components, reduced `H0`,
and `H1`. Higher-dimensional homology and integer torsion are out of scope for
this first certificate layer.

Quotient imports fail closed. Validation checks that edge endpoints exist,
`inverseEdgeId` references pair correctly, cell vertices exist, optional cell
edge references exist, generator pairs are well formed, and any claimed
torsion-free status includes method and source metadata. Without that metadata,
the UI should use "quotient complex" language even if subgroup notes are
present.
