import { canonicalSha256, sha256Hex } from "../utils/canonicalSha256";
import type {
  StreamedDavisCell,
  StreamedLawfulDavisOracle,
  StreamedLawfulEvaluation,
} from "./streamedLawfulDavis";

/**
 * The small interface needed by the generalized lawful calculation.  It is
 * deliberately action-backed: callers may enumerate one spherical orbit at a
 * time instead of materializing the strict face poset of the whole quotient.
 */
export interface GeneralizedLawfulCellKey {
  typeIndex: number;
  generators: readonly number[];
  representativePoint: number;
  dimension: number;
}

export interface GeneralizedLawfulSphericalType {
  typeIndex: number;
  generators: readonly number[];
  dimension: number;
}

export interface GeneralizedLawfulCellOracle<
  Cell extends GeneralizedLawfulCellKey = GeneralizedLawfulCellKey,
> {
  degree: number;
  dimension: number;
  sourceHash: string;
  sphericalTypes: readonly GeneralizedLawfulSphericalType[];
  cellCountByDimension: Readonly<Record<string, number>>;
  cellContaining(typeIndex: number, point: number): Cell;
  cellVertices(cell: Cell): Uint32Array;
  forEachCell(typeIndex: number, visitor: (cell: Cell) => void): void;
  forEachFacet(cell: Cell, visitor: (facet: Cell) => void): void;
  forEachRankTwoFace(cell: Cell, visitor: (face: Cell) => void): void;
  isRetained(cell: Cell, candidateIndex: number): boolean;
  neighbor(point: number, generator: number): number;
}

export interface GeneralizedLawfulSourceChecks {
  finiteConnectedQuotient: boolean;
  torsionFreeDavisQuotient: boolean;
  completeSphericalEnumeration: boolean;
  /**
   * Cell characteristic maps are regular: generator germs and spherical cell
   * incidences have no quotient identifications inside one Coxeter cell.
   */
  regularCoxeterCellQuotient: boolean;
  inheritedMoussongMetric: boolean;
}

export interface GeneralizedLawfulSourceBinding {
  kind: "streamed-lawful-davis-source-binding";
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  wallStructureHash: string;
  streamedRetentionHash: string;
  streamedClosureHash: string;
  candidateId: string;
  /** Canonical singleton artifact slot; streamed adapters always write zero. */
  candidateIndex: number;
  coorientationHash: string;
}

export interface GeneralizedLawfulCertificateOptions<
  Cell extends GeneralizedLawfulCellKey = GeneralizedLawfulCellKey,
> {
  oracle: GeneralizedLawfulCellOracle<Cell>;
  candidateIndex: number;
  candidateId: string;
  /** The integral oriented edge cocycle, evaluated on p -> p.s. */
  edgeIncrement(
    point: number,
    generator: number,
    candidateIndex: number,
  ): -1 | 1;
  sourceChecks: GeneralizedLawfulSourceChecks;
  /** Exact source envelope when this calculation comes from a packed oracle. */
  sourceBinding?: GeneralizedLawfulSourceBinding;
  /**
   * Compact mode computes exactly the 2-skeleton needed for link
   * connectivity. Full mode additionally enumerates every maximal simplex.
   */
  calculationMode?: "compact-connectivity" | "full-simplices";
  linkScan?: "exhaustive" | "stop-on-first-failure";
  /** Number of disconnected/empty-link witnesses retained in the artifact. */
  maxLinkWitnesses?: number;
  /** Number of metric-flag obstructions retained in the artifact. */
  maxMetricFlagWitnesses?: number;
}

export interface StreamedGeneralizedLawfulCertificateOptions {
  oracle: StreamedLawfulDavisOracle;
  evaluation: StreamedLawfulEvaluation;
  /** Position in this evaluation batch; it is not serialized as identity. */
  candidateIndex: number;
  calculationMode?: "compact-connectivity" | "full-simplices";
  linkScan?: "exhaustive" | "stop-on-first-failure";
  maxLinkWitnesses?: number;
  maxMetricFlagWitnesses?: number;
}

export interface StreamedGeneralizedLawfulDirectedLinkPointOptions {
  oracle: StreamedLawfulDavisOracle;
  evaluation: StreamedLawfulEvaluation;
  candidateIndex: number;
  point: number;
}

export interface GeneralizedLawfulRetentionCertificate {
  status: "passed" | "failed";
  method: "retain-one-skeleton-and-cells-with-only-lawful-rank-two-faces";
  sourceHash: string;
  totalCellCountByDimension: Record<string, number>;
  retainedCellCountByDimension: Record<string, number>;
  discardedCellCountByDimension: Record<string, number>;
  checks: {
    deterministicCellEnumeration: boolean;
    advertisedCellCountsMatch: boolean;
    rankZeroAndOneCellsRetained: boolean;
    higherRetentionMatchesRankTwoRule: boolean;
    retainedCellsDownwardClosed: boolean;
  };
  digestAlgorithm: "sha256-chunk-tree-v1" | "sha256-source-binding-v1";
  cellSetDigest: string;
  errors: string[];
}

export interface GeneralizedPullingSubdivisionCertificate {
  status: "passed" | "failed";
  method: "global-action-point-order-recursive-pulling";
  sourceCellSetDigest: string;
  globalVertexOrder: "increasing-action-point";
  representation: "global-rule-and-two-skeleton" | "all-maximal-simplices";
  originalVertexCount: number;
  /** Pulling is vertex preserving.  This field is explicit for replay. */
  introducedVertexIds: string[];
  retainedCellsTriangulated: number;
  maximalRetainedCells: number;
  maximalSimplexOccurrences: number | null;
  faceCompatibilityChecks: number;
  checks: {
    globalOrderTotal: boolean;
    vertexDeclarationComplete: boolean;
    everyRetainedCellTriangulated: boolean;
    simplexDimensionsCorrect: boolean;
    simplicesUseOnlyDeclaredVertices: boolean;
    sharedFacesCompatible: boolean;
  };
  digestAlgorithm: "sha256-chain-v1";
  subdivisionDigest: string;
  errors: string[];
  nonClaims: string[];
}

export interface GeneralizedAffineHeightCertificate {
  status: "passed" | "failed";
  method: "integral-cell-charts-with-global-rank-perturbation";
  sourceCellSetDigest: string;
  sourceSubdivisionDigest: string;
  cocycleScale: "raw-integral-no-division";
  periodicOffsetFormula: "actionPoint/(4*degree)";
  periodicOffsetDenominator: string;
  retainedCellCharts: number;
  explicitlyIntegratedCellCharts: number;
  higherCellChartsDerivedFromTwoSkeleton: number;
  integrationChecks: number;
  overlapChecks: number;
  edgeSignChecks: number;
  checks: {
    involutiveEdgeData: boolean;
    integralCocycleClosedOnEveryRetainedCell: boolean;
    everyRetainedCellIntegrated: boolean;
    overlapConstantsIntegral: boolean;
    overlapDifferencesConstant: boolean;
    quotientCircleValuesAgree: boolean;
    edgeSignsPreserved: boolean;
    simplexHeightsDistinct: boolean;
  };
  digestAlgorithm: "sha256-chunk-tree-v1";
  heightDigest: string;
  errors: string[];
  nonClaims: string[];
}

export interface GeneralizedDirectedLinkSummary {
  point: number;
  ascendingVertexCount: number;
  ascendingMaximalSimplexCount: number | null;
  ascendingEdgeCount: number | null;
  ascendingComponentCount: number;
  descendingVertexCount: number;
  descendingMaximalSimplexCount: number | null;
  descendingEdgeCount: number | null;
  descendingComponentCount: number;
  ascendingNonempty: boolean;
  ascendingConnected: boolean;
  descendingNonempty: boolean;
  descendingConnected: boolean;
  linkDigest: string;
}

export interface GeneralizedDirectedLinkWitness {
  point: number;
  kind: "ascending" | "descending";
  reason: "empty" | "disconnected";
  components: string[][];
}

export interface GeneralizedDirectedLinksCertificate {
  status: "passed" | "failed";
  method: "actual-links-in-retained-pulling-subdivision";
  representation:
    | "exact-connectivity-component-partitions"
    | "complete-maximal-simplices";
  scanMode: "exhaustive" | "stop-on-first-failure";
  scanOutcome: "exhaustive" | "counterexample-found" | "incomplete";
  sourceCellSetDigest: string;
  sourceSubdivisionDigest: string;
  sourceHeightDigest: string;
  declaredOriginalVertexCount: number;
  declaredIntroducedVertexIds: string[];
  checkedOriginalVertexCount: number;
  checkedIntroducedVertexIds: string[];
  vertexSummaries: GeneralizedDirectedLinkSummary[];
  witnesses: GeneralizedDirectedLinkWitness[];
  checks: {
    sourceCertificatesPassed: boolean;
    everyDeclaredSubdivisionVertexChecked: boolean;
    everyAscendingLinkNonempty: boolean;
    everyDescendingLinkNonempty: boolean;
    everyAscendingLinkConnected: boolean;
    everyDescendingLinkConnected: boolean;
  };
  morseCondition: "passed" | "not-established";
  digestAlgorithm: "sha256-chain-v1";
  linksDigest: string;
  errors: string[];
  nonClaims: string[];
}

export interface MetricFlagObstruction {
  point: number;
  generators: number[];
  missingCellId: string;
  incidentPairCellIds: string[];
  unlawfulRankTwoFaceCellId?: string;
  unlawfulRankTwoFaceRepresentativePoint?: number;
}

export interface GeneralizedLawfulAsphericityCertificate {
  status: "passed" | "not-established";
  method: "inherited-davis-moussong-metric-and-metric-flag-links";
  sourceCellSetDigest: string;
  checks: GeneralizedLawfulSourceChecks & {
    lawfulCellSetCertified: boolean;
    everyMetricSphericalCliqueFilled: boolean;
  };
  sphericalCliquesChecked: number;
  metricFlagObstructionCount: number;
  obstructions: MetricFlagObstruction[];
  metricFlagDigest: string;
  metricFlagDigestAlgorithm: "sha256";
  conclusion: string;
  nonClaims: string[];
}

export interface GeneralizedLawfulCertificate {
  schemaVersion: 1;
  kind: "generalized-coface-closed-lawful-certificate";
  method: "streamed-lawful-cells-pulling-links-and-moussong-check";
  status: "completed" | "failed";
  candidateId: string;
  candidateIndex: number;
  sourceHash: string;
  sourceBinding: GeneralizedLawfulSourceBinding | null;
  retention: GeneralizedLawfulRetentionCertificate;
  subdivision: GeneralizedPullingSubdivisionCertificate;
  height: GeneralizedAffineHeightCertificate;
  directedLinks: GeneralizedDirectedLinksCertificate;
  asphericity: GeneralizedLawfulAsphericityCertificate;
  artifactHashAlgorithm: "sha256";
  artifactHash: string;
  errors: string[];
  nonClaims: string[];
}

export interface GeneralizedLawfulCertificateReplay {
  schemaVersion: 1;
  kind: "generalized-coface-closed-lawful-certificate-replay";
  status: "passed" | "failed";
  checks: {
    storedArtifactHashValid: boolean;
    actionRootedReconstructionMatches: boolean;
    rebuiltCalculationCompleted: boolean;
  };
  rebuiltArtifactHash: string;
  errors: string[];
}

export interface GeneralizedLawfulClosureAndAsphericityResult {
  candidateId: string;
  candidateIndex: number;
  sourceHash: string;
  retention: GeneralizedLawfulRetentionCertificate;
  asphericity: GeneralizedLawfulAsphericityCertificate;
  resultHash: string;
}

export interface GeneralizedLawfulDirectedLinkPointResult {
  schemaVersion: 1;
  kind: "generalized-lawful-directed-link-point-replay";
  status: "passed";
  sourceHash: string;
  sourceBinding: GeneralizedLawfulSourceBinding;
  candidateId: string;
  candidateIndex: number;
  point: number;
  subdivision: {
    method: "global-action-point-order-recursive-pulling";
    introducedVertexIds: [];
  };
  height: {
    cocycleScale: "raw-integral-no-division";
    periodicOffsetFormula: "actionPoint/(4*degree)";
  };
  ascending: {
    vertexCount: number;
    componentCount: number;
    components: string[][];
    nonempty: boolean;
    connected: boolean;
  };
  descending: {
    vertexCount: number;
    componentCount: number;
    components: string[][];
    nonempty: boolean;
    connected: boolean;
  };
  linkDigest: string;
  resultHash: string;
}

interface PullingResult<Cell extends GeneralizedLawfulCellKey> {
  cell: Cell;
  cellId: string;
  apex: number;
  vertices: number[];
  maximalSimplices: number[][];
}

interface HeightChart<Cell extends GeneralizedLawfulCellKey> {
  cell: Cell;
  cellId: string;
  root: number;
  vertices: number[];
  rawByPoint: Map<number, number>;
  integrationChecks: number;
  consistent: boolean;
  errors: string[];
}

interface LinkData {
  maximalSimplices: string[][];
  edgeCount: number | null;
  components: string[][];
  nonempty: boolean;
  connected: boolean;
}

class LinkComponentAccumulator {
  private readonly indexByVertex = new Map<string, number>();
  private readonly vertexByIndex: string[] = [];
  private readonly parent: number[] = [];
  private readonly rank: number[] = [];

  add(vertex: string): number {
    const existing = this.indexByVertex.get(vertex);
    if (existing !== undefined) return existing;
    const index = this.vertexByIndex.length;
    this.indexByVertex.set(vertex, index);
    this.vertexByIndex.push(vertex);
    this.parent.push(index);
    this.rank.push(0);
    return index;
  }

  union(firstVertex: string, secondVertex: string): void {
    let first = this.find(this.add(firstVertex));
    let second = this.find(this.add(secondVertex));
    if (first === second) return;
    if (this.rank[first] < this.rank[second]) {
      [first, second] = [second, first];
    }
    this.parent[second] = first;
    if (this.rank[first] === this.rank[second]) this.rank[first] += 1;
  }

  finish(): LinkData {
    const byRoot = new Map<number, string[]>();
    for (let index = 0; index < this.vertexByIndex.length; index += 1) {
      const root = this.find(index);
      const component = byRoot.get(root) ?? [];
      component.push(this.vertexByIndex[index]);
      byRoot.set(root, component);
    }
    const components = [...byRoot.values()]
      .map((component) => component.sort(compareIds))
      .sort((left, right) => compareIds(left[0] ?? "", right[0] ?? ""));
    // In compact mode this field stores the component partition, not a list
    // of all graph edges. It is sufficient for exact connectivity replay.
    return {
      maximalSimplices: components,
      edgeCount: null,
      components,
      nonempty: this.vertexByIndex.length > 0,
      connected: components.length === 1,
    };
  }

  private find(index: number): number {
    let root = index;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[index] !== index) {
      const next = this.parent[index];
      this.parent[index] = root;
      index = next;
    }
    return root;
  }
}

interface PullingTwoSkeleton<Cell extends GeneralizedLawfulCellKey> {
  cell: Cell;
  cellId: string;
  vertices: number[];
  edges: number[][];
  triangles: number[][];
}

interface CalculationContext<Cell extends GeneralizedLawfulCellKey> {
  triangulations: Map<string, PullingResult<Cell>>;
  twoSkeletons: Map<string, PullingTwoSkeleton<Cell>>;
  heightCharts: Map<string, HeightChart<Cell>>;
  maxCachedCells: number;
}

function createCalculationContext<
  Cell extends GeneralizedLawfulCellKey,
>(): CalculationContext<Cell> {
  return {
    triangulations: new Map(),
    twoSkeletons: new Map(),
    heightCharts: new Map(),
    // Only low-dimensional objects enter this cache. Higher pulling data can
    // be orders of magnitude larger and is streamed once.
    maxCachedCells: 16_384,
  };
}

function rememberBounded<Value>(
  cache: Map<string, Value>,
  key: string,
  value: Value,
  limit: number,
): void {
  if (!cache.has(key) && cache.size >= limit) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareIds);
}

function uniqueSortedNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort(compareNumbers);
}

function generatorKey(generators: readonly number[]): string {
  return uniqueSortedNumbers(generators).join(",");
}

/** Stable cell identifier shared by the digest, charts, and link germs. */
export function generalizedLawfulCellId(
  cell: GeneralizedLawfulCellKey,
): string {
  const type = generatorKey(cell.generators);
  return type.length === 0
    ? `glc:v:q${cell.representativePoint}`
    : `glc:cell:T${type.replaceAll(",", "-")}:q${cell.representativePoint}`;
}

function beginDigest(label: string): string {
  return sha256Hex(`generalized-lawful:${label}:v1`);
}

function appendDigest(current: string, value: unknown): string {
  return sha256Hex(`${current}\n${canonicalSha256(value)}`);
}

class CanonicalChunkTreeDigest {
  private readonly records: unknown[] = [];
  private readonly chunkHashes: string[] = [];
  private recordCount = 0;

  constructor(
    private readonly label: string,
    private readonly chunkSize = 1_024,
  ) {}

  append(value: unknown): void {
    this.records.push(value);
    this.recordCount += 1;
    if (this.records.length === this.chunkSize) this.flush();
  }

  finish(): string {
    this.flush();
    return canonicalSha256({
      schemaVersion: 1,
      method: "fixed-record-chunk-sha256-tree",
      label: this.label,
      chunkSize: this.chunkSize,
      recordCount: this.recordCount,
      chunkHashes: this.chunkHashes,
    });
  }

  private flush(): void {
    if (this.records.length === 0) return;
    const chunkIndex = this.chunkHashes.length;
    this.chunkHashes.push(
      canonicalSha256({ chunkIndex, records: this.records }),
    );
    this.records.length = 0;
  }
}

/** Recompute the exact action/coorientation/closure binding hash. */
export function computeGeneralizedLawfulSourceHash(
  binding: GeneralizedLawfulSourceBinding,
): string {
  return canonicalSha256(binding);
}

function numericSimplexKey(simplex: readonly number[]): string {
  return JSON.stringify(uniqueSortedNumbers(simplex));
}

function stringSimplexKey(simplex: readonly string[]): string {
  return JSON.stringify(uniqueSortedStrings(simplex));
}

function isNumberSubset(
  subset: readonly number[],
  superset: ReadonlySet<number>,
): boolean {
  return subset.every((entry) => superset.has(entry));
}

function isStringSubset(
  subset: readonly string[],
  superset: ReadonlySet<string>,
): boolean {
  return subset.every((entry) => superset.has(entry));
}

function maximalNumberSimplices(simplices: readonly number[][]): number[][] {
  const unique = new Map<string, number[]>();
  for (const simplex of simplices) {
    const normalized = uniqueSortedNumbers(simplex);
    if (normalized.length > 0)
      unique.set(numericSimplexKey(normalized), normalized);
  }
  const ordered = [...unique.values()].sort(
    (left, right) =>
      right.length - left.length ||
      compareIds(numericSimplexKey(left), numericSimplexKey(right)),
  );
  const maximal: number[][] = [];
  for (const simplex of ordered) {
    if (!maximal.some((other) => isNumberSubset(simplex, new Set(other)))) {
      maximal.push(simplex);
    }
  }
  return maximal.sort((left, right) =>
    compareIds(numericSimplexKey(left), numericSimplexKey(right)),
  );
}

function deduplicateNumberSimplices(
  simplices: readonly number[][],
): number[][] {
  const unique = new Map<string, number[]>();
  for (const simplex of simplices) {
    const normalized = uniqueSortedNumbers(simplex);
    unique.set(numericSimplexKey(normalized), normalized);
  }
  return [...unique.values()].sort((left, right) =>
    compareIds(numericSimplexKey(left), numericSimplexKey(right)),
  );
}

function maximalStringSimplices(simplices: readonly string[][]): string[][] {
  const unique = new Map<string, string[]>();
  for (const simplex of simplices) {
    const normalized = uniqueSortedStrings(simplex);
    if (normalized.length > 0)
      unique.set(stringSimplexKey(normalized), normalized);
  }
  const ordered = [...unique.values()].sort(
    (left, right) =>
      right.length - left.length ||
      compareIds(stringSimplexKey(left), stringSimplexKey(right)),
  );
  const maximal: string[][] = [];
  for (const simplex of ordered) {
    if (!maximal.some((other) => isStringSubset(simplex, new Set(other)))) {
      maximal.push(simplex);
    }
  }
  return maximal.sort((left, right) =>
    compareIds(stringSimplexKey(left), stringSimplexKey(right)),
  );
}

function sameStringArrays(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function connectedComponents(simplices: readonly string[][]): string[][] {
  const vertices = uniqueSortedStrings(simplices.flat());
  const adjacency = new Map(
    vertices.map((vertex) => [vertex, new Set<string>()] as const),
  );
  for (const simplex of simplices) {
    for (let left = 0; left < simplex.length; left += 1) {
      for (let right = left + 1; right < simplex.length; right += 1) {
        adjacency.get(simplex[left])?.add(simplex[right]);
        adjacency.get(simplex[right])?.add(simplex[left]);
      }
    }
  }
  const unseen = new Set(vertices);
  const result: string[][] = [];
  while (unseen.size > 0) {
    const root = [...unseen].sort(compareIds)[0];
    unseen.delete(root);
    const component = [root];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of adjacency.get(component[cursor]) ?? []) {
        if (unseen.delete(neighbor)) component.push(neighbor);
      }
    }
    result.push(component.sort(compareIds));
  }
  return result;
}

function simplicialEdgeCount(simplices: readonly string[][]): number {
  const edges = new Set<string>();
  for (const simplex of simplices) {
    for (let left = 0; left < simplex.length; left += 1) {
      for (let right = left + 1; right < simplex.length; right += 1) {
        edges.add(stringSimplexKey([simplex[left], simplex[right]]));
      }
    }
  }
  return edges.size;
}

function incrementCount(
  record: Record<string, number>,
  dimension: number,
): void {
  const key = String(dimension);
  record[key] = (record[key] ?? 0) + 1;
}

function sortedTypes(
  oracle: GeneralizedLawfulCellOracle,
): GeneralizedLawfulSphericalType[] {
  return [...oracle.sphericalTypes].sort(
    (left, right) =>
      left.dimension - right.dimension ||
      compareIds(
        generatorKey(left.generators),
        generatorKey(right.generators),
      ) ||
      left.typeIndex - right.typeIndex,
  );
}

function sortedCellsOfType<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  typeIndex: number,
): Cell[] {
  const cells: Cell[] = [];
  oracle.forEachCell(typeIndex, (cell) => cells.push(cell));
  return cells.sort((left, right) =>
    compareIds(generalizedLawfulCellId(left), generalizedLawfulCellId(right)),
  );
}

function sortedFacets<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  cell: Cell,
): Cell[] {
  const facets = new Map<string, Cell>();
  oracle.forEachFacet(cell, (facet) => {
    facets.set(generalizedLawfulCellId(facet), facet);
  });
  return [...facets.values()].sort((left, right) =>
    compareIds(generalizedLawfulCellId(left), generalizedLawfulCellId(right)),
  );
}

function sortedRankTwoFaces<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  cell: Cell,
): Cell[] {
  if (cell.dimension === 2) return [cell];
  const faces = new Map<string, Cell>();
  oracle.forEachRankTwoFace(cell, (face) => {
    faces.set(generalizedLawfulCellId(face), face);
  });
  return [...faces.values()].sort((left, right) =>
    compareIds(generalizedLawfulCellId(left), generalizedLawfulCellId(right)),
  );
}

function cellVertices<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  cell: Cell,
): number[] {
  return uniqueSortedNumbers([...oracle.cellVertices(cell)]);
}

function buildRetentionCertificate<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  candidateIndex: number,
): GeneralizedLawfulRetentionCertificate {
  const errors: string[] = [];
  const totalCellCountByDimension: Record<string, number> = {};
  const retainedCellCountByDimension: Record<string, number> = {};
  const discardedCellCountByDimension: Record<string, number> = {};
  const digest = new CanonicalChunkTreeDigest("retained-cell-set");
  let deterministicCellEnumeration = true;
  let rankZeroAndOneCellsRetained = true;
  let higherRetentionMatchesRankTwoRule = true;
  let retainedCellsDownwardClosed = true;

  for (const type of sortedTypes(oracle)) {
    const cells = sortedCellsOfType(oracle, type.typeIndex);
    const ids = cells.map(generalizedLawfulCellId);
    if (new Set(ids).size !== ids.length) {
      deterministicCellEnumeration = false;
      errors.push(
        `Spherical type ${type.typeIndex} enumerates duplicate cells.`,
      );
    }
    for (const cell of cells) {
      const id = generalizedLawfulCellId(cell);
      const retained = oracle.isRetained(cell, candidateIndex);
      incrementCount(totalCellCountByDimension, cell.dimension);
      incrementCount(
        retained ? retainedCellCountByDimension : discardedCellCountByDimension,
        cell.dimension,
      );
      if (
        cell.typeIndex !== type.typeIndex ||
        cell.dimension !== type.dimension ||
        generatorKey(cell.generators) !== generatorKey(type.generators)
      ) {
        deterministicCellEnumeration = false;
        errors.push(`${id} does not match its advertised spherical type.`);
      }
      const rankTwoFaces = sortedRankTwoFaces(oracle, cell);
      const unlawfulRankTwoFaceIds = rankTwoFaces
        .filter((face) => !oracle.isRetained(face, candidateIndex))
        .map(generalizedLawfulCellId);
      if (cell.dimension <= 1 && !retained) {
        rankZeroAndOneCellsRetained = false;
        errors.push(`${id} discards part of the zero- or one-skeleton.`);
      }
      if (cell.dimension >= 2) {
        const expected = unlawfulRankTwoFaceIds.length === 0;
        if (cell.dimension > 2 && rankTwoFaces.length === 0) {
          higherRetentionMatchesRankTwoRule = false;
          errors.push(`${id} has no enumerated rank-two faces.`);
        }
        if (retained !== expected) {
          higherRetentionMatchesRankTwoRule = false;
          errors.push(`${id} does not follow the all-rank-two-faces rule.`);
        }
      }
      const facetIds: string[] = [];
      for (const facet of sortedFacets(oracle, cell)) {
        const facetId = generalizedLawfulCellId(facet);
        facetIds.push(facetId);
        if (retained && !oracle.isRetained(facet, candidateIndex)) {
          retainedCellsDownwardClosed = false;
          errors.push(
            `${id} is retained while its facet ${facetId} is discarded.`,
          );
        }
      }
      digest.append({
        id,
        dimension: cell.dimension,
        generators: uniqueSortedNumbers(cell.generators),
        representativePoint: cell.representativePoint,
        retained,
        facetIds,
        rankTwoFaceIds: rankTwoFaces.map(generalizedLawfulCellId),
        unlawfulRankTwoFaceIds,
      });
    }
  }

  const dimensions = new Set([
    ...Object.keys(totalCellCountByDimension),
    ...Object.keys(oracle.cellCountByDimension),
  ]);
  const advertisedCellCountsMatch = [...dimensions].every(
    (dimension) =>
      (totalCellCountByDimension[dimension] ?? 0) ===
      (oracle.cellCountByDimension[dimension] ?? 0),
  );
  if (!advertisedCellCountsMatch) {
    errors.push("Streamed cell counts do not match the oracle manifest.");
  }
  const checks = {
    deterministicCellEnumeration,
    advertisedCellCountsMatch,
    rankZeroAndOneCellsRetained,
    higherRetentionMatchesRankTwoRule,
    retainedCellsDownwardClosed,
  };
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    method: "retain-one-skeleton-and-cells-with-only-lawful-rank-two-faces",
    sourceHash: oracle.sourceHash,
    totalCellCountByDimension,
    retainedCellCountByDimension,
    discardedCellCountByDimension,
    checks,
    digestAlgorithm: "sha256-chunk-tree-v1",
    cellSetDigest: digest.finish(),
    errors: uniqueSortedStrings(errors),
  };
}

function triangulateCell<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  requested: Cell,
  context: CalculationContext<Cell>,
): PullingResult<Cell> {
  const active = new Set<string>();
  const recurse = (cell: Cell): PullingResult<Cell> => {
    const id = generalizedLawfulCellId(cell);
    const cached = context.triangulations.get(id);
    if (cached) return cached;
    if (active.has(id))
      throw new Error(`Facet recursion contains a cycle at ${id}.`);
    active.add(id);
    try {
      const vertices = cellVertices(oracle, cell);
      if (vertices.length === 0) throw new Error(`${id} has no vertices.`);
      const apex = vertices[0];
      let maximalSimplices: number[][];
      if (cell.dimension === 0) {
        maximalSimplices = [[apex]];
      } else {
        const oppositeFacets = sortedFacets(oracle, cell).filter(
          (facet) => !cellVertices(oracle, facet).includes(apex),
        );
        if (oppositeFacets.length === 0) {
          throw new Error(`${id} has no facet opposite pulling apex q${apex}.`);
        }
        maximalSimplices = maximalNumberSimplices(
          oppositeFacets.flatMap((facet) =>
            recurse(facet).maximalSimplices.map((simplex) => [
              apex,
              ...simplex,
            ]),
          ),
        );
      }
      const result = { cell, cellId: id, apex, vertices, maximalSimplices };
      if (cell.dimension <= 2) {
        rememberBounded(
          context.triangulations,
          id,
          result,
          context.maxCachedCells,
        );
      }
      return result;
    } finally {
      active.delete(id);
    }
  };
  return recurse(requested);
}

/**
 * Compute only dimensions zero, one, and two of the recursive pulling
 * subdivision.  The link of a vertex has one vertex for each incident edge
 * and one graph edge for each incident triangle, so this is complete data for
 * nonemptiness and connectivity in every dimension.
 */
function pullingTwoSkeleton<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  requested: Cell,
  context: CalculationContext<Cell>,
): PullingTwoSkeleton<Cell> {
  const active = new Set<string>();
  const recurse = (cell: Cell): PullingTwoSkeleton<Cell> => {
    const id = generalizedLawfulCellId(cell);
    const cached = context.twoSkeletons.get(id);
    if (cached) return cached;
    if (active.has(id))
      throw new Error(`Facet recursion contains a cycle at ${id}.`);
    active.add(id);
    try {
      const vertices = cellVertices(oracle, cell);
      if (vertices.length === 0) throw new Error(`${id} has no vertices.`);
      const apex = vertices[0];
      const edgeCandidates: number[][] = [];
      const triangleCandidates: number[][] = [];
      if (cell.dimension > 0) {
        const oppositeFacets = sortedFacets(oracle, cell).filter(
          (facet) => !cellVertices(oracle, facet).includes(apex),
        );
        if (oppositeFacets.length === 0) {
          throw new Error(`${id} has no facet opposite pulling apex q${apex}.`);
        }
        for (const facet of oppositeFacets) {
          const skeleton = recurse(facet);
          edgeCandidates.push(...skeleton.edges);
          triangleCandidates.push(...skeleton.triangles);
          for (const point of skeleton.vertices) {
            edgeCandidates.push([apex, point]);
          }
          for (const edge of skeleton.edges) {
            triangleCandidates.push([apex, ...edge]);
          }
        }
      }
      const result: PullingTwoSkeleton<Cell> = {
        cell,
        cellId: id,
        vertices,
        edges: deduplicateNumberSimplices(edgeCandidates),
        triangles: deduplicateNumberSimplices(triangleCandidates),
      };
      if (cell.dimension <= 2) {
        rememberBounded(
          context.twoSkeletons,
          id,
          result,
          context.maxCachedCells,
        );
      }
      return result;
    } finally {
      active.delete(id);
    }
  };
  return recurse(requested);
}

function immediateCofaceTypes(
  types: readonly GeneralizedLawfulSphericalType[],
  cell: GeneralizedLawfulCellKey,
): GeneralizedLawfulSphericalType[] {
  const generators = new Set(cell.generators);
  return types.filter(
    (type) =>
      type.dimension === cell.dimension + 1 &&
      cell.generators.every((generator) =>
        type.generators.includes(generator),
      ) &&
      type.generators.some((generator) => !generators.has(generator)),
  );
}

function isMaximalRetained<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  types: readonly GeneralizedLawfulSphericalType[],
  cell: Cell,
  candidateIndex: number,
): boolean {
  return immediateCofaceTypes(types, cell).every((type) => {
    const coface = oracle.cellContaining(
      type.typeIndex,
      cell.representativePoint,
    );
    return !oracle.isRetained(coface, candidateIndex);
  });
}

function buildSubdivisionCertificate<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  candidateIndex: number,
  retention: GeneralizedLawfulRetentionCertificate,
  mode: "compact-connectivity" | "full-simplices",
  regularCoxeterCellQuotient: boolean,
): GeneralizedPullingSubdivisionCertificate {
  const errors: string[] = [];
  const types = sortedTypes(oracle);
  const context = createCalculationContext<Cell>();
  const expectedRetained = Object.values(
    retention.retainedCellCountByDimension,
  ).reduce((sum, count) => sum + count, 0);
  if (mode === "compact-connectivity") {
    let maximalRetainedCells = 0;
    for (const type of types) {
      for (const cell of sortedCellsOfType(oracle, type.typeIndex)) {
        if (
          oracle.isRetained(cell, candidateIndex) &&
          isMaximalRetained(oracle, types, cell, candidateIndex)
        ) {
          maximalRetainedCells += 1;
        }
      }
    }
    const checks = {
      globalOrderTotal:
        Number.isSafeInteger(oracle.degree) && oracle.degree > 0,
      vertexDeclarationComplete: true,
      everyRetainedCellTriangulated:
        retention.status === "passed" && regularCoxeterCellQuotient,
      simplexDimensionsCorrect: regularCoxeterCellQuotient,
      simplicesUseOnlyDeclaredVertices: regularCoxeterCellQuotient,
      // Pulling by one global total order restricts to the pulling
      // triangulation of every face. No cell-local diagonal choice remains.
      sharedFacesCompatible: regularCoxeterCellQuotient,
    };
    if (!Object.values(checks).every(Boolean)) {
      errors.push(
        "The compact pulling rule requires a certified regular Coxeter-cell quotient and retained downward closure.",
      );
    }
    return {
      status: Object.values(checks).every(Boolean) ? "passed" : "failed",
      method: "global-action-point-order-recursive-pulling",
      sourceCellSetDigest: retention.cellSetDigest,
      globalVertexOrder: "increasing-action-point",
      representation: "global-rule-and-two-skeleton",
      originalVertexCount: oracle.degree,
      introducedVertexIds: [],
      retainedCellsTriangulated: expectedRetained,
      maximalRetainedCells,
      maximalSimplexOccurrences: null,
      faceCompatibilityChecks: 0,
      checks,
      digestAlgorithm: "sha256-chain-v1",
      subdivisionDigest: appendDigest(beginDigest("pulling-subdivision"), {
        schemaVersion: 1,
        method: "global-action-point-order-recursive-pulling",
        sourceCellSetDigest: retention.cellSetDigest,
        vertexOrder: "increasing-action-point",
        originalVertexCount: oracle.degree,
        introducedVertexIds: [],
      }),
      errors: uniqueSortedStrings(errors),
      nonClaims: [
        "The compact certificate records the exact global pulling rule and computes its two-skeleton on demand; it does not archive every maximal simplex.",
        "The pulling rule is an exact abstract subdivision; it does not supply Euclidean drawing coordinates.",
        "Recursive pulling introduces no ambient vertices. Link germs below are not additional vertices of the subdivided complex.",
      ],
    };
  }
  let digest = beginDigest("pulling-subdivision");
  let retainedCellsTriangulated = 0;
  let maximalRetainedCells = 0;
  let maximalSimplexOccurrences = 0;
  let faceCompatibilityChecks = 0;
  let everyRetainedCellTriangulated = true;
  let simplexDimensionsCorrect = true;
  let simplicesUseOnlyDeclaredVertices = true;
  let sharedFacesCompatible = true;

  for (const type of types) {
    for (const cell of sortedCellsOfType(oracle, type.typeIndex)) {
      if (!oracle.isRetained(cell, candidateIndex)) continue;
      const id = generalizedLawfulCellId(cell);
      try {
        const triangulation = triangulateCell(oracle, cell, context);
        retainedCellsTriangulated += 1;
        const allowed = new Set(triangulation.vertices);
        for (const simplex of triangulation.maximalSimplices) {
          if (
            simplex.length !== cell.dimension + 1 ||
            new Set(simplex).size !== simplex.length
          ) {
            simplexDimensionsCorrect = false;
            errors.push(`A pulling simplex in ${id} has the wrong dimension.`);
          }
          if (
            simplex.some(
              (point) =>
                point < 0 || point >= oracle.degree || !allowed.has(point),
            )
          ) {
            simplicesUseOnlyDeclaredVertices = false;
            errors.push(
              `A pulling simplex in ${id} uses an undeclared vertex.`,
            );
          }
        }
        for (const facet of sortedFacets(oracle, cell)) {
          faceCompatibilityChecks += 1;
          if (!oracle.isRetained(facet, candidateIndex)) {
            sharedFacesCompatible = false;
            errors.push(`${id} has a discarded facet in its subdivision.`);
            continue;
          }
          const facetTriangulation = triangulateCell(oracle, facet, context);
          const facetVertices = new Set(facetTriangulation.vertices);
          const induced = maximalNumberSimplices(
            triangulation.maximalSimplices
              .map((simplex) =>
                simplex.filter((point) => facetVertices.has(point)),
              )
              .filter((simplex) => simplex.length === facet.dimension + 1),
          )
            .map(numericSimplexKey)
            .sort(compareIds);
          const expected = facetTriangulation.maximalSimplices
            .map(numericSimplexKey)
            .sort(compareIds);
          if (!sameStringArrays(induced, expected)) {
            sharedFacesCompatible = false;
            errors.push(
              `The pulling subdivision induced on ${generalizedLawfulCellId(facet)} by ${id} is incompatible.`,
            );
          }
        }
        const maximal = isMaximalRetained(oracle, types, cell, candidateIndex);
        if (maximal) {
          maximalRetainedCells += 1;
          maximalSimplexOccurrences += triangulation.maximalSimplices.length;
        }
        digest = appendDigest(digest, {
          cellId: id,
          apex: triangulation.apex,
          maximal,
          maximalSimplices: triangulation.maximalSimplices,
        });
      } catch (error) {
        everyRetainedCellTriangulated = false;
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  everyRetainedCellTriangulated &&=
    retainedCellsTriangulated === expectedRetained;
  const checks = {
    globalOrderTotal: Number.isSafeInteger(oracle.degree) && oracle.degree > 0,
    vertexDeclarationComplete: true,
    everyRetainedCellTriangulated,
    simplexDimensionsCorrect,
    simplicesUseOnlyDeclaredVertices,
    sharedFacesCompatible,
  };
  if (!Object.values(checks).every(Boolean)) {
    errors.push("At least one retained pulling-subdivision check failed.");
  }
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    method: "global-action-point-order-recursive-pulling",
    sourceCellSetDigest: retention.cellSetDigest,
    globalVertexOrder: "increasing-action-point",
    representation: "all-maximal-simplices",
    originalVertexCount: oracle.degree,
    introducedVertexIds: [],
    retainedCellsTriangulated,
    maximalRetainedCells,
    maximalSimplexOccurrences,
    faceCompatibilityChecks,
    checks,
    digestAlgorithm: "sha256-chain-v1",
    subdivisionDigest: digest,
    errors: uniqueSortedStrings(errors),
    nonClaims: [
      "The pulling rule is an exact abstract subdivision; it does not supply Euclidean drawing coordinates.",
      "Recursive pulling introduces no ambient vertices. Link germs below are not additional vertices of the subdivided complex.",
    ],
  };
}

function buildHeightChart<Cell extends GeneralizedLawfulCellKey>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
  cell: Cell,
  context: CalculationContext<Cell>,
): HeightChart<Cell> {
  const { oracle, candidateIndex, edgeIncrement } = options;
  const id = generalizedLawfulCellId(cell);
  const cached = context.heightCharts.get(id);
  if (cached) return cached;
  const vertices = cellVertices(oracle, cell);
  const errors: string[] = [];
  if (vertices.length === 0) {
    const result: HeightChart<Cell> = {
      cell,
      cellId: id,
      root: -1,
      vertices,
      rawByPoint: new Map(),
      integrationChecks: 0,
      consistent: false,
      errors: [`${id} has no vertices for height integration.`],
    };
    if (cell.dimension <= 2) {
      rememberBounded(context.heightCharts, id, result, context.maxCachedCells);
    }
    return result;
  }
  const allowed = new Set(vertices);
  const root = vertices[0];
  const rawByPoint = new Map<number, number>([[root, 0]]);
  const queue = [root];
  let integrationChecks = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    const current = rawByPoint.get(point)!;
    for (const generator of cell.generators) {
      const target = oracle.neighbor(point, generator);
      const increment = edgeIncrement(point, generator, candidateIndex);
      integrationChecks += 1;
      if (!allowed.has(target)) {
        errors.push(`Generator ${generator} leaves ${id} at q${point}.`);
        continue;
      }
      if (increment !== -1 && increment !== 1) {
        errors.push(
          `The cocycle step at q${point}, generator ${generator}, is not +1 or -1.`,
        );
        continue;
      }
      const expected = current + increment;
      const existing = rawByPoint.get(target);
      if (existing === undefined) {
        rawByPoint.set(target, expected);
        queue.push(target);
      } else if (existing !== expected) {
        errors.push(
          `Integral cocycle integration in ${id} gives ${existing} and ${expected} at q${target}.`,
        );
      }
    }
  }
  if (rawByPoint.size !== vertices.length) {
    errors.push(
      `Integral cocycle integration reached ${rawByPoint.size}/${vertices.length} vertices of ${id}.`,
    );
  }
  const result: HeightChart<Cell> = {
    cell,
    cellId: id,
    root,
    vertices,
    rawByPoint,
    integrationChecks,
    consistent: errors.length === 0,
    errors,
  };
  if (cell.dimension <= 2) {
    rememberBounded(context.heightCharts, id, result, context.maxCachedCells);
  }
  return result;
}

function perturbedHeightNumerator(
  chart: HeightChart<GeneralizedLawfulCellKey>,
  point: number,
  denominator: bigint,
): bigint {
  return BigInt(chart.rawByPoint.get(point) ?? 0) * denominator + BigInt(point);
}

function buildHeightCertificate<Cell extends GeneralizedLawfulCellKey>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
  retention: GeneralizedLawfulRetentionCertificate,
  subdivision: GeneralizedPullingSubdivisionCertificate,
  mode: "compact-connectivity" | "full-simplices",
): GeneralizedAffineHeightCertificate {
  const { oracle, candidateIndex, edgeIncrement } = options;
  const errors: string[] = [];
  const context = createCalculationContext<Cell>();
  const denominator = BigInt(4 * Math.max(1, oracle.degree));
  const generators = uniqueSortedNumbers(
    oracle.sphericalTypes.flatMap((type) => [...type.generators]),
  );
  let involutiveEdgeData = true;
  let edgeSignsPreserved = true;
  let edgeSignChecks = 0;
  for (let point = 0; point < oracle.degree; point += 1) {
    for (const generator of generators) {
      const target = oracle.neighbor(point, generator);
      const reverse =
        target >= 0 && target < oracle.degree
          ? oracle.neighbor(target, generator)
          : -1;
      const increment = edgeIncrement(point, generator, candidateIndex);
      const reverseIncrement =
        target >= 0 && target < oracle.degree
          ? edgeIncrement(target, generator, candidateIndex)
          : increment;
      const incrementsValid =
        (increment === -1 || increment === 1) &&
        (reverseIncrement === -1 || reverseIncrement === 1);
      if (
        target < 0 ||
        target >= oracle.degree ||
        reverse !== point ||
        reverseIncrement !== -increment ||
        !incrementsValid
      ) {
        involutiveEdgeData = false;
        errors.push(
          `The directed edge datum at q${point}, generator ${generator}, is not involutive.`,
        );
      }
      if (!incrementsValid) {
        edgeSignsPreserved = false;
        edgeSignChecks += 1;
        continue;
      }
      const perturbedDifference =
        BigInt(increment) * denominator + BigInt(target - point);
      if (
        (increment > 0 && perturbedDifference <= 0n) ||
        (increment < 0 && perturbedDifference >= 0n)
      ) {
        edgeSignsPreserved = false;
        errors.push(
          `The global rank perturbation reverses q${point} --${generator}--> q${target}.`,
        );
      }
      edgeSignChecks += 1;
    }
  }

  const digest = new CanonicalChunkTreeDigest("integral-height-charts");
  digest.append({
    mode,
    sourceCellSetDigest: retention.cellSetDigest,
    sourceSubdivisionDigest: subdivision.subdivisionDigest,
    derivation:
      mode === "compact-connectivity"
        ? "rank-two-closure-and-contractible-coxeter-cells"
        : "explicit-every-cell-chart",
  });
  let retainedCellCharts = 0;
  let explicitlyIntegratedCellCharts = 0;
  let higherCellChartsDerivedFromTwoSkeleton = 0;
  let integrationChecks = 0;
  let overlapChecks = 0;
  let integralCocycleClosedOnEveryRetainedCell = true;
  let everyRetainedCellIntegrated = true;
  let overlapConstantsIntegral = true;
  let overlapDifferencesConstant = true;
  let quotientCircleValuesAgree = true;
  let simplexHeightsDistinct = true;
  for (const type of sortedTypes(oracle)) {
    for (const cell of sortedCellsOfType(oracle, type.typeIndex)) {
      if (!oracle.isRetained(cell, candidateIndex)) continue;
      if (mode === "compact-connectivity" && cell.dimension !== 2) continue;
      const chart = buildHeightChart(options, cell, context);
      explicitlyIntegratedCellCharts += 1;
      integrationChecks += chart.integrationChecks;
      if (!chart.consistent) {
        integralCocycleClosedOnEveryRetainedCell = false;
        everyRetainedCellIntegrated = false;
        errors.push(...chart.errors);
      }
      for (const point of chart.vertices) {
        const raw = chart.rawByPoint.get(point);
        if (raw === undefined || !Number.isSafeInteger(raw)) {
          quotientCircleValuesAgree = false;
          errors.push(
            `${chart.cellId} has a nonintegral or missing raw height at q${point}.`,
          );
        }
      }
      for (const facet of mode === "full-simplices"
        ? sortedFacets(oracle, cell)
        : []) {
        if (!oracle.isRetained(facet, candidateIndex)) continue;
        overlapChecks += 1;
        const facetChart = buildHeightChart(options, facet, context);
        if (!facetChart.consistent) {
          everyRetainedCellIntegrated = false;
          errors.push(...facetChart.errors);
        }
        const shared = facetChart.vertices.filter((point) =>
          chart.rawByPoint.has(point),
        );
        const first = shared[0];
        const additiveConstant =
          first === undefined
            ? undefined
            : chart.rawByPoint.get(first)! - facetChart.rawByPoint.get(first)!;
        if (
          additiveConstant === undefined ||
          !Number.isSafeInteger(additiveConstant)
        ) {
          overlapConstantsIntegral = false;
          errors.push(
            `The height overlap on ${generalizedLawfulCellId(facet)} inside ${chart.cellId} has no integral constant.`,
          );
        }
        if (
          shared.length !== facetChart.vertices.length ||
          additiveConstant === undefined ||
          !shared.every(
            (point) =>
              chart.rawByPoint.get(point)! -
                facetChart.rawByPoint.get(point)! ===
              additiveConstant,
          )
        ) {
          overlapDifferencesConstant = false;
          errors.push(
            `The height charts on ${generalizedLawfulCellId(facet)} and ${chart.cellId} do not differ by one constant integer.`,
          );
        }
      }
      if (mode === "full-simplices") {
        try {
          const triangulation = triangulateCell(oracle, cell, context);
          for (const simplex of triangulation.maximalSimplices) {
            const numerators = simplex.map((point) =>
              perturbedHeightNumerator(chart, point, denominator).toString(),
            );
            if (new Set(numerators).size !== numerators.length) {
              simplexHeightsDistinct = false;
              errors.push(
                `A pulling simplex in ${chart.cellId} has equal perturbed heights.`,
              );
            }
          }
        } catch (error) {
          simplexHeightsDistinct = false;
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      digest.append({
        cellId: chart.cellId,
        root: chart.root,
        heights: chart.vertices.map((point) => ({
          point,
          raw: chart.rawByPoint.get(point) ?? null,
          perturbationNumerator: point,
          perturbationDenominator: denominator.toString(),
        })),
        consistent: chart.consistent,
      });
    }
  }
  const expectedRetained = Object.values(
    retention.retainedCellCountByDimension,
  ).reduce((sum, count) => sum + count, 0);
  if (mode === "compact-connectivity") {
    retainedCellCharts = expectedRetained;
    higherCellChartsDerivedFromTwoSkeleton = Object.entries(
      retention.retainedCellCountByDimension,
    )
      .filter(([dimension]) => Number(dimension) >= 3)
      .reduce((sum, [, count]) => sum + count, 0);
    everyRetainedCellIntegrated &&=
      retention.status === "passed" && subdivision.status === "passed";
    overlapConstantsIntegral &&= subdivision.status === "passed";
    overlapDifferencesConstant &&= subdivision.status === "passed";
    digest.append({
      explicitlyIntegratedCellCharts,
      higherCellChartsDerivedFromTwoSkeleton,
      rule: "closed integral one-cochain on the complete retained Coxeter-cell two-skeleton",
    });
  } else {
    retainedCellCharts = explicitlyIntegratedCellCharts;
    everyRetainedCellIntegrated &&= retainedCellCharts === expectedRetained;
  }
  const checks = {
    involutiveEdgeData,
    integralCocycleClosedOnEveryRetainedCell,
    everyRetainedCellIntegrated,
    overlapConstantsIntegral,
    overlapDifferencesConstant,
    quotientCircleValuesAgree,
    edgeSignsPreserved,
    simplexHeightsDistinct,
  };
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    method: "integral-cell-charts-with-global-rank-perturbation",
    sourceCellSetDigest: retention.cellSetDigest,
    sourceSubdivisionDigest: subdivision.subdivisionDigest,
    cocycleScale: "raw-integral-no-division",
    periodicOffsetFormula: "actionPoint/(4*degree)",
    periodicOffsetDenominator: denominator.toString(),
    retainedCellCharts,
    explicitlyIntegratedCellCharts,
    higherCellChartsDerivedFromTwoSkeleton,
    integrationChecks,
    overlapChecks,
    edgeSignChecks,
    checks,
    digestAlgorithm: "sha256-chunk-tree-v1",
    heightDigest: digest.finish(),
    errors: uniqueSortedStrings(errors),
    nonClaims: [
      "The cell charts are real lifts of one circle-valued affine map. Their overlap constants are checked integers.",
      "The integral cocycle is not divided by its image gcd; the rank perturbation is a global quotient-periodic coboundary and does not change its periods.",
      "This certificate does not assert that the resulting character is primitive or nonzero.",
    ],
  };
}

function minimalSupportingCell<Cell extends GeneralizedLawfulCellKey>(
  oracle: GeneralizedLawfulCellOracle<Cell>,
  ambient: Cell,
  requiredPoints: readonly number[],
): Cell {
  const required = uniqueSortedNumbers(requiredPoints);
  const leaves = new Map<string, Cell>();
  const visited = new Set<string>();
  const visit = (cell: Cell): void => {
    const id = generalizedLawfulCellId(cell);
    if (visited.has(id)) return;
    visited.add(id);
    const matching = sortedFacets(oracle, cell).filter((facet) => {
      const vertices = new Set(cellVertices(oracle, facet));
      return required.every((point) => vertices.has(point));
    });
    if (matching.length === 0) {
      leaves.set(id, cell);
      return;
    }
    for (const facet of matching) visit(facet);
  };
  visit(ambient);
  const ordered = [...leaves.values()].sort(
    (left, right) =>
      left.dimension - right.dimension ||
      compareIds(generalizedLawfulCellId(left), generalizedLawfulCellId(right)),
  );
  const support = ordered[0];
  if (!support) {
    throw new Error(
      `No face of ${generalizedLawfulCellId(ambient)} supports q${required.join(",q")}.`,
    );
  }
  const sameDimension = ordered.filter(
    (cell) => cell.dimension === support.dimension,
  );
  if (sameDimension.length > 1) {
    throw new Error(
      `The points q${required.join(",q")} have multiple minimal supports in ${generalizedLawfulCellId(ambient)}.`,
    );
  }
  return support;
}

function buildOnePointLinks<Cell extends GeneralizedLawfulCellKey>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
  types: readonly GeneralizedLawfulSphericalType[],
  point: number,
  context: CalculationContext<Cell>,
): { ascending: LinkData; descending: LinkData } {
  const { oracle, candidateIndex } = options;
  const cells = new Map<string, Cell>();
  for (const type of types) {
    const cell = oracle.cellContaining(type.typeIndex, point);
    if (
      oracle.isRetained(cell, candidateIndex) &&
      isMaximalRetained(oracle, types, cell, candidateIndex)
    ) {
      cells.set(generalizedLawfulCellId(cell), cell);
    }
  }
  const ascending: string[][] = [];
  const descending: string[][] = [];
  const denominator = BigInt(4 * Math.max(1, oracle.degree));
  const supportCache = new Map<string, string>();
  for (const cell of [...cells.values()].sort((left, right) =>
    compareIds(generalizedLawfulCellId(left), generalizedLawfulCellId(right)),
  )) {
    const triangulation = triangulateCell(oracle, cell, context);
    const chart = buildHeightChart(options, cell, context);
    if (!chart.consistent) {
      throw new Error(
        `Cannot build links from inconsistent chart ${chart.cellId}.`,
      );
    }
    const selectedHeight = perturbedHeightNumerator(chart, point, denominator);
    for (const simplex of triangulation.maximalSimplices) {
      if (!simplex.includes(point)) continue;
      const linkGerms = (otherPoint: number): string => {
        const pairKey = `${chart.cellId}\u0000${Math.min(point, otherPoint)}\u0000${Math.max(point, otherPoint)}`;
        const cached = supportCache.get(pairKey);
        if (cached) return cached;
        const support = minimalSupportingCell(oracle, cell, [
          point,
          otherPoint,
        ]);
        const id = `glc:link-germ:${generalizedLawfulCellId(support)}:at-q${point}:to-q${otherPoint}`;
        supportCache.set(pairKey, id);
        return id;
      };
      const higher = simplex
        .filter(
          (other) =>
            other !== point &&
            perturbedHeightNumerator(chart, other, denominator) >
              selectedHeight,
        )
        .map(linkGerms);
      const lower = simplex
        .filter(
          (other) =>
            other !== point &&
            perturbedHeightNumerator(chart, other, denominator) <
              selectedHeight,
        )
        .map(linkGerms);
      if (higher.length > 0) ascending.push(higher);
      if (lower.length > 0) descending.push(lower);
    }
  }
  const finish = (simplices: string[][]): LinkData => {
    const maximalSimplices = maximalStringSimplices(simplices);
    const components = connectedComponents(maximalSimplices);
    return {
      maximalSimplices,
      edgeCount: simplicialEdgeCount(maximalSimplices),
      components,
      nonempty: maximalSimplices.length > 0,
      connected: components.length === 1,
    };
  };
  return { ascending: finish(ascending), descending: finish(descending) };
}

function buildOnePointConnectivityLinks<Cell extends GeneralizedLawfulCellKey>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
  types: readonly GeneralizedLawfulSphericalType[],
  point: number,
  context: CalculationContext<Cell>,
): { ascending: LinkData; descending: LinkData } {
  const { oracle, candidateIndex } = options;
  const cells = new Map<string, Cell>();
  for (const type of types) {
    const cell = oracle.cellContaining(type.typeIndex, point);
    if (
      oracle.isRetained(cell, candidateIndex) &&
      isMaximalRetained(oracle, types, cell, candidateIndex)
    ) {
      cells.set(generalizedLawfulCellId(cell), cell);
    }
  }
  const ascendingVertices = new Set<string>();
  const descendingVertices = new Set<string>();
  const ascendingEdges = new Map<string, string[]>();
  const descendingEdges = new Map<string, string[]>();
  const denominator = BigInt(4 * Math.max(1, oracle.degree));
  const supportCache = new Map<string, string>();

  for (const cell of [...cells.values()].sort((left, right) =>
    compareIds(generalizedLawfulCellId(left), generalizedLawfulCellId(right)),
  )) {
    const skeleton = pullingTwoSkeleton(oracle, cell, context);
    const chart = buildHeightChart(options, cell, context);
    if (!chart.consistent) {
      throw new Error(
        `Cannot build links from inconsistent chart ${chart.cellId}.`,
      );
    }
    const selectedHeight = perturbedHeightNumerator(chart, point, denominator);
    const germ = (otherPoint: number): string => {
      const pairKey = `${chart.cellId}\u0000${Math.min(point, otherPoint)}\u0000${Math.max(point, otherPoint)}`;
      const cached = supportCache.get(pairKey);
      if (cached) return cached;
      const support = minimalSupportingCell(oracle, cell, [point, otherPoint]);
      const id = `glc:link-germ:${generalizedLawfulCellId(support)}:at-q${point}:to-q${otherPoint}`;
      supportCache.set(pairKey, id);
      return id;
    };
    for (const edge of skeleton.edges) {
      if (!edge.includes(point)) continue;
      const other = edge[0] === point ? edge[1] : edge[0];
      const otherHeight = perturbedHeightNumerator(chart, other, denominator);
      if (otherHeight > selectedHeight) ascendingVertices.add(germ(other));
      if (otherHeight < selectedHeight) descendingVertices.add(germ(other));
    }
    for (const triangle of skeleton.triangles) {
      if (!triangle.includes(point)) continue;
      const others = triangle.filter((entry) => entry !== point);
      if (others.length !== 2) {
        throw new Error(
          `A pulling triangle in ${chart.cellId} has an invalid q${point} occurrence.`,
        );
      }
      const firstHeight = perturbedHeightNumerator(
        chart,
        others[0],
        denominator,
      );
      const secondHeight = perturbedHeightNumerator(
        chart,
        others[1],
        denominator,
      );
      const germPair = uniqueSortedStrings([germ(others[0]), germ(others[1])]);
      if (firstHeight > selectedHeight && secondHeight > selectedHeight) {
        ascendingEdges.set(stringSimplexKey(germPair), germPair);
      }
      if (firstHeight < selectedHeight && secondHeight < selectedHeight) {
        descendingEdges.set(stringSimplexKey(germPair), germPair);
      }
    }
  }

  const finish = (
    vertices: ReadonlySet<string>,
    edges: ReadonlyMap<string, string[]>,
  ): LinkData => {
    const simplices = [
      ...edges.values(),
      ...[...vertices].map((vertex) => [vertex]),
    ];
    const graphSimplices = maximalStringSimplices(simplices);
    const components = connectedComponents(graphSimplices);
    return {
      maximalSimplices: graphSimplices,
      edgeCount: edges.size,
      components,
      nonempty: vertices.size > 0,
      connected: components.length === 1,
    };
  };
  return {
    ascending: finish(ascendingVertices, ascendingEdges),
    descending: finish(descendingVertices, descendingEdges),
  };
}

/**
 * Stream maximal retained cells once and distribute their incident pulling
 * edges/triangles to quotient-vertex links. This avoids rescanning a rank-five
 * cell's two-skeleton once for every one of its vertices.
 */
function buildAllPointConnectivityLinks<Cell extends GeneralizedLawfulCellKey>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
  types: readonly GeneralizedLawfulSphericalType[],
  context: CalculationContext<Cell>,
): Array<{ ascending: LinkData; descending: LinkData }> {
  const { oracle, candidateIndex } = options;
  const ascending = Array.from(
    { length: oracle.degree },
    () => new LinkComponentAccumulator(),
  );
  const descending = Array.from(
    { length: oracle.degree },
    () => new LinkComponentAccumulator(),
  );
  const denominator = BigInt(4 * Math.max(1, oracle.degree));

  for (const type of types) {
    for (const cell of sortedCellsOfType(oracle, type.typeIndex)) {
      if (
        !oracle.isRetained(cell, candidateIndex) ||
        !isMaximalRetained(oracle, types, cell, candidateIndex)
      ) {
        continue;
      }
      const skeleton = pullingTwoSkeleton(oracle, cell, context);
      const chart = buildHeightChart(options, cell, context);
      if (!chart.consistent) {
        throw new Error(
          `Cannot build links from inconsistent chart ${chart.cellId}.`,
        );
      }
      const heightAt = (point: number): bigint =>
        perturbedHeightNumerator(chart, point, denominator);
      const supportByPair = new Map<string, string>();
      const germ = (point: number, otherPoint: number): string => {
        const pairKey = `${Math.min(point, otherPoint)}\u0000${Math.max(point, otherPoint)}`;
        let supportId = supportByPair.get(pairKey);
        if (supportId === undefined) {
          supportId = generalizedLawfulCellId(
            minimalSupportingCell(oracle, cell, [point, otherPoint]),
          );
          supportByPair.set(pairKey, supportId);
        }
        return `glc:link-germ:${supportId}:at-q${point}:to-q${otherPoint}`;
      };

      for (const edge of skeleton.edges) {
        const [first, second] = edge;
        const firstHeight = heightAt(first);
        const secondHeight = heightAt(second);
        if (firstHeight < secondHeight) {
          ascending[first].add(germ(first, second));
          descending[second].add(germ(second, first));
        } else if (secondHeight < firstHeight) {
          ascending[second].add(germ(second, first));
          descending[first].add(germ(first, second));
        } else {
          throw new Error(
            `A pulling edge in ${chart.cellId} has equal endpoint heights.`,
          );
        }
      }
      for (const triangle of skeleton.triangles) {
        if (triangle.length !== 3) {
          throw new Error(
            `The pulling two-skeleton of ${chart.cellId} contains a nontriangle.`,
          );
        }
        for (let selected = 0; selected < 3; selected += 1) {
          const point = triangle[selected];
          const others = triangle.filter((_entry, index) => index !== selected);
          const pointHeight = heightAt(point);
          const firstHeight = heightAt(others[0]);
          const secondHeight = heightAt(others[1]);
          const firstGerm = germ(point, others[0]);
          const secondGerm = germ(point, others[1]);
          if (firstHeight > pointHeight && secondHeight > pointHeight) {
            ascending[point].union(firstGerm, secondGerm);
          }
          if (firstHeight < pointHeight && secondHeight < pointHeight) {
            descending[point].union(firstGerm, secondGerm);
          }
        }
      }
    }
  }
  return ascending.map((entry, point) => ({
    ascending: entry.finish(),
    descending: descending[point].finish(),
  }));
}

function buildDirectedLinksCertificate<Cell extends GeneralizedLawfulCellKey>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
  retention: GeneralizedLawfulRetentionCertificate,
  subdivision: GeneralizedPullingSubdivisionCertificate,
  height: GeneralizedAffineHeightCertificate,
): GeneralizedDirectedLinksCertificate {
  const { oracle } = options;
  const types = sortedTypes(oracle);
  const errors: string[] = [];
  const witnesses: GeneralizedDirectedLinkWitness[] = [];
  const maxWitnesses = Math.max(0, options.maxLinkWitnesses ?? 32);
  const mode = options.calculationMode ?? "compact-connectivity";
  const scanMode = options.linkScan ?? "exhaustive";
  const vertexSummaries: GeneralizedDirectedLinkSummary[] = [];
  const context = createCalculationContext<Cell>();
  let constructionFailed = false;
  let compactLinks:
    | Array<{ ascending: LinkData; descending: LinkData }>
    | undefined;
  if (mode === "compact-connectivity" && scanMode === "exhaustive") {
    try {
      compactLinks = buildAllPointConnectivityLinks(options, types, context);
      // Small fixtures replay the independently organized point-local scan.
      // This catches mistakes in the cell-stream distribution without adding
      // the factor-|W_T| scan to research-size quotients.
      if (oracle.degree <= 64) {
        for (let point = 0; point < oracle.degree; point += 1) {
          const local = buildOnePointConnectivityLinks(
            options,
            types,
            point,
            context,
          );
          const streamed = compactLinks[point];
          if (
            canonicalSha256(local.ascending.components) !==
              canonicalSha256(streamed.ascending.components) ||
            canonicalSha256(local.descending.components) !==
              canonicalSha256(streamed.descending.components)
          ) {
            throw new Error(
              `Cell-stream and point-local link graphs disagree at q${point}.`,
            );
          }
          // Preserve the complete compact graph on small fixtures so tests can
          // compare its edge set with full maximal-simplex enumeration.
          compactLinks[point] = local;
        }
      }
    } catch (error) {
      constructionFailed = true;
      errors.push(
        `Compact directed-link construction failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  let digest = beginDigest("actual-directed-links");
  for (let point = 0; point < oracle.degree; point += 1) {
    try {
      const links =
        mode === "full-simplices"
          ? buildOnePointLinks(options, types, point, context)
          : scanMode === "exhaustive"
            ? compactLinks?.[point]
            : buildOnePointConnectivityLinks(options, types, point, context);
      if (!links) throw new Error("No compact link datum was produced.");
      const linkDigest = canonicalSha256({
        point,
        representation: mode,
        ascending: links.ascending.maximalSimplices,
        descending: links.descending.maximalSimplices,
      });
      const summary: GeneralizedDirectedLinkSummary = {
        point,
        ascendingVertexCount: uniqueSortedStrings(
          links.ascending.maximalSimplices.flat(),
        ).length,
        ascendingMaximalSimplexCount:
          mode === "full-simplices"
            ? links.ascending.maximalSimplices.length
            : null,
        ascendingEdgeCount: links.ascending.edgeCount,
        ascendingComponentCount: links.ascending.components.length,
        descendingVertexCount: uniqueSortedStrings(
          links.descending.maximalSimplices.flat(),
        ).length,
        descendingMaximalSimplexCount:
          mode === "full-simplices"
            ? links.descending.maximalSimplices.length
            : null,
        descendingEdgeCount: links.descending.edgeCount,
        descendingComponentCount: links.descending.components.length,
        ascendingNonempty: links.ascending.nonempty,
        ascendingConnected: links.ascending.connected,
        descendingNonempty: links.descending.nonempty,
        descendingConnected: links.descending.connected,
        linkDigest,
      };
      vertexSummaries.push(summary);
      digest = appendDigest(digest, {
        point,
        representation: mode,
        ascending: links.ascending.maximalSimplices,
        descending: links.descending.maximalSimplices,
      });
      for (const [kind, link] of [
        ["ascending", links.ascending],
        ["descending", links.descending],
      ] as const) {
        if (
          (!link.nonempty || !link.connected) &&
          witnesses.length < maxWitnesses
        ) {
          witnesses.push({
            point,
            kind,
            reason: link.nonempty ? "disconnected" : "empty",
            components: link.components,
          });
        }
      }
      if (
        scanMode === "stop-on-first-failure" &&
        (!links.ascending.nonempty ||
          !links.ascending.connected ||
          !links.descending.nonempty ||
          !links.descending.connected)
      ) {
        break;
      }
    } catch (error) {
      constructionFailed = true;
      errors.push(
        `Directed-link construction at q${point} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  const sourceCertificatesPassed =
    retention.status === "passed" &&
    subdivision.status === "passed" &&
    height.status === "passed";
  const counterexampleFound = vertexSummaries.some(
    (entry) =>
      !entry.ascendingNonempty ||
      !entry.ascendingConnected ||
      !entry.descendingNonempty ||
      !entry.descendingConnected,
  );
  const scanOutcome = constructionFailed
    ? "incomplete"
    : vertexSummaries.length === oracle.degree
      ? "exhaustive"
      : counterexampleFound
        ? "counterexample-found"
        : "incomplete";
  const everyAscendingLinkNonempty =
    vertexSummaries.length === oracle.degree &&
    vertexSummaries.every((entry) => entry.ascendingNonempty);
  const everyDescendingLinkNonempty =
    vertexSummaries.length === oracle.degree &&
    vertexSummaries.every((entry) => entry.descendingNonempty);
  const everyAscendingLinkConnected =
    vertexSummaries.length === oracle.degree &&
    vertexSummaries.every((entry) => entry.ascendingConnected);
  const everyDescendingLinkConnected =
    vertexSummaries.length === oracle.degree &&
    vertexSummaries.every((entry) => entry.descendingConnected);
  const checks = {
    sourceCertificatesPassed,
    everyDeclaredSubdivisionVertexChecked:
      vertexSummaries.length === oracle.degree &&
      subdivision.introducedVertexIds.length === 0,
    everyAscendingLinkNonempty,
    everyDescendingLinkNonempty,
    everyAscendingLinkConnected,
    everyDescendingLinkConnected,
  };
  const witnessedAscendingEmpty = vertexSummaries.some(
    (entry) => !entry.ascendingNonempty,
  );
  const witnessedDescendingEmpty = vertexSummaries.some(
    (entry) => !entry.descendingNonempty,
  );
  const witnessedAscendingDisconnected = vertexSummaries.some(
    (entry) => entry.ascendingNonempty && !entry.ascendingConnected,
  );
  const witnessedDescendingDisconnected = vertexSummaries.some(
    (entry) => entry.descendingNonempty && !entry.descendingConnected,
  );
  if (witnessedAscendingEmpty)
    errors.push("A checked actual ascending link is empty.");
  if (witnessedDescendingEmpty)
    errors.push("A checked actual descending link is empty.");
  if (witnessedAscendingDisconnected)
    errors.push("A checked nonempty actual ascending link is disconnected.");
  if (witnessedDescendingDisconnected)
    errors.push("A checked nonempty actual descending link is disconnected.");
  if (scanOutcome !== "exhaustive") {
    errors.push(
      "The directed-link scan is not exhaustive; unwitnessed universal link conditions remain not established.",
    );
  }
  return {
    status:
      sourceCertificatesPassed &&
      !constructionFailed &&
      scanOutcome !== "incomplete"
        ? "passed"
        : "failed",
    method: "actual-links-in-retained-pulling-subdivision",
    representation:
      mode === "full-simplices"
        ? "complete-maximal-simplices"
        : "exact-connectivity-component-partitions",
    scanMode,
    scanOutcome,
    sourceCellSetDigest: retention.cellSetDigest,
    sourceSubdivisionDigest: subdivision.subdivisionDigest,
    sourceHeightDigest: height.heightDigest,
    declaredOriginalVertexCount: oracle.degree,
    declaredIntroducedVertexIds: [...subdivision.introducedVertexIds],
    checkedOriginalVertexCount: vertexSummaries.length,
    checkedIntroducedVertexIds: [],
    vertexSummaries,
    witnesses,
    checks,
    morseCondition: Object.values(checks).every(Boolean)
      ? "passed"
      : "not-established",
    digestAlgorithm: "sha256-chain-v1",
    linksDigest: digest,
    errors: uniqueSortedStrings(errors),
    nonClaims: [
      "These are links in the retained pulling subdivision, not links in the rank-two skeleton or the undeleted Davis complex.",
      ...(mode === "compact-connectivity"
        ? [
            "Compact mode archives exact link vertex counts and component partitions derived from the pulling two-skeleton. Its digest binds those connectivity data; the artifact does not embed the full graph edge list or higher link simplices.",
          ]
        : []),
      ...(scanMode === "stop-on-first-failure"
        ? [
            "A counterexample-stopped scan certifies the displayed failing link only. It does not claim that every quotient-vertex link was enumerated.",
          ]
        : []),
      "A link-germ id records an edge occurrence of the subdivision; it is not an undeclared ambient subdivision vertex.",
      "Connected nonempty directed links are a PL Morse input. They do not by themselves prove asphericity.",
    ],
  };
}

function buildAsphericityCertificate<Cell extends GeneralizedLawfulCellKey>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
  retention: GeneralizedLawfulRetentionCertificate,
): GeneralizedLawfulAsphericityCertificate {
  const { oracle, candidateIndex, sourceChecks } = options;
  const typeByGenerators = new Map(
    oracle.sphericalTypes.map((type) => [generatorKey(type.generators), type]),
  );
  const obstructions: MetricFlagObstruction[] = [];
  const maxWitnesses = Math.max(0, options.maxMetricFlagWitnesses ?? 32);
  let obstructionCount = 0;
  let sphericalCliquesChecked = 0;
  let pairTypesComplete = true;
  const higherTypes = sortedTypes(oracle).filter((type) => type.dimension >= 3);
  for (let point = 0; point < oracle.degree; point += 1) {
    for (const type of higherTypes) {
      const pairCellIds: string[] = [];
      let localClique = true;
      for (let left = 0; left < type.generators.length; left += 1) {
        for (let right = left + 1; right < type.generators.length; right += 1) {
          const pair = [type.generators[left], type.generators[right]].sort(
            compareNumbers,
          );
          const pairType = typeByGenerators.get(generatorKey(pair));
          if (!pairType) {
            pairTypesComplete = false;
            localClique = false;
            continue;
          }
          const pairCell = oracle.cellContaining(pairType.typeIndex, point);
          pairCellIds.push(generalizedLawfulCellId(pairCell));
          if (!oracle.isRetained(pairCell, candidateIndex)) localClique = false;
        }
      }
      if (!localClique) continue;
      sphericalCliquesChecked += 1;
      const higherCell = oracle.cellContaining(type.typeIndex, point);
      const filled = oracle.isRetained(higherCell, candidateIndex);
      const record = {
        point,
        generators: uniqueSortedNumbers(type.generators),
        cellId: generalizedLawfulCellId(higherCell),
        incidentPairCellIds: uniqueSortedStrings(pairCellIds),
        filled,
      };
      if (!filled) {
        obstructionCount += 1;
        if (obstructions.length < maxWitnesses) {
          const unlawfulRankTwoFace = sortedRankTwoFaces(
            oracle,
            higherCell,
          ).find((face) => !oracle.isRetained(face, candidateIndex));
          obstructions.push({
            point,
            generators: record.generators,
            missingCellId: record.cellId,
            incidentPairCellIds: record.incidentPairCellIds,
            ...(unlawfulRankTwoFace === undefined
              ? {}
              : {
                  unlawfulRankTwoFaceCellId:
                    generalizedLawfulCellId(unlawfulRankTwoFace),
                  unlawfulRankTwoFaceRepresentativePoint:
                    unlawfulRankTwoFace.representativePoint,
                }),
          });
        }
      }
    }
  }
  const checks = {
    ...sourceChecks,
    completeSphericalEnumeration:
      sourceChecks.completeSphericalEnumeration && pairTypesComplete,
    lawfulCellSetCertified: retention.status === "passed",
    everyMetricSphericalCliqueFilled: obstructionCount === 0,
  };
  const metricFlagDigest = canonicalSha256({
    schemaVersion: 1,
    method: "metric-flag-replay-bound-to-retained-cell-set",
    sourceCellSetDigest: retention.cellSetDigest,
    candidateId: options.candidateId,
    sphericalCliquesChecked,
    metricFlagObstructionCount: obstructionCount,
    retainedWitnesses: obstructions,
  });
  const passed = Object.values(checks).every(Boolean);
  return {
    status: passed ? "passed" : "not-established",
    method: "inherited-davis-moussong-metric-and-metric-flag-links",
    sourceCellSetDigest: retention.cellSetDigest,
    checks,
    sphericalCliquesChecked,
    metricFlagObstructionCount: obstructionCount,
    obstructions,
    metricFlagDigest,
    metricFlagDigestAlgorithm: "sha256",
    conclusion: passed
      ? "The retained complex is locally CAT(0) in the inherited Davis--Moussong metric. Its universal cover is CAT(0), hence contractible, so the retained complex is aspherical."
      : "Contractibility of the universal cover and asphericity are not established by this calculation.",
    nonClaims: [
      "A metric-flag obstruction only defeats this inherited-metric certificate; it is not proof that the retained complex is nonaspherical.",
      "No generic algorithm deciding asphericity of arbitrary finite complexes is claimed.",
    ],
  };
}

/**
 * Compute the generalized lawful complex and its theorem-facing downstream
 * data without constructing the quadratic strict-incidence archive.
 */
export function buildGeneralizedLawfulCertificate<
  Cell extends GeneralizedLawfulCellKey,
>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
): GeneralizedLawfulCertificate {
  const { oracle } = options;
  const retention = buildRetentionCertificate(oracle, options.candidateIndex);
  const subdivision = buildSubdivisionCertificate(
    oracle,
    options.candidateIndex,
    retention,
    options.calculationMode ?? "compact-connectivity",
    options.sourceChecks.regularCoxeterCellQuotient,
  );
  const height = buildHeightCertificate(
    options,
    retention,
    subdivision,
    options.calculationMode ?? "compact-connectivity",
  );
  const directedLinks = buildDirectedLinksCertificate(
    options,
    retention,
    subdivision,
    height,
  );
  const asphericity = buildAsphericityCertificate(options, retention);
  const sourceBindingValid =
    options.sourceBinding === undefined ||
    (options.sourceBinding.candidateId === options.candidateId &&
      options.sourceBinding.candidateIndex === options.candidateIndex &&
      computeGeneralizedLawfulSourceHash(options.sourceBinding) ===
        oracle.sourceHash);
  const errors = uniqueSortedStrings([
    ...retention.errors,
    ...subdivision.errors,
    ...height.errors,
    ...(directedLinks.status === "failed" ? directedLinks.errors : []),
    ...(sourceBindingValid
      ? []
      : ["The streamed action/coorientation source binding is inconsistent."]),
  ]);
  const certificate: GeneralizedLawfulCertificate = {
    schemaVersion: 1,
    kind: "generalized-coface-closed-lawful-certificate",
    method: "streamed-lawful-cells-pulling-links-and-moussong-check",
    status: errors.length === 0 ? "completed" : "failed",
    candidateId: options.candidateId,
    candidateIndex: options.candidateIndex,
    sourceHash: oracle.sourceHash,
    sourceBinding: options.sourceBinding ? { ...options.sourceBinding } : null,
    retention,
    subdivision,
    height,
    directedLinks,
    asphericity,
    artifactHashAlgorithm: "sha256",
    artifactHash: "",
    errors,
    nonClaims: [
      "Failure of a directed-link or metric-flag condition is reported as not-established, not as a negative asphericity theorem.",
      "The certificate concerns the explicitly retained generalized lawful complex, not the full Davis quotient and not only its rank-two skeleton.",
    ],
  };
  certificate.artifactHash = canonicalSha256({
    ...certificate,
    artifactHash: "",
  });
  return certificate;
}

/**
 * Run the streamed cell-set and Moussong checks without constructing pulling
 * simplices or Morse links.  This is the inexpensive first stage for a large
 * candidate list.
 */
export function buildGeneralizedLawfulClosureAndAsphericity<
  Cell extends GeneralizedLawfulCellKey,
>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
): GeneralizedLawfulClosureAndAsphericityResult {
  const retention = buildRetentionCertificate(
    options.oracle,
    options.candidateIndex,
  );
  const asphericity = buildAsphericityCertificate(options, retention);
  const result = {
    candidateId: options.candidateId,
    candidateIndex: options.candidateIndex,
    sourceHash: options.oracle.sourceHash,
    retention,
    asphericity,
  };
  return { ...result, resultHash: canonicalSha256(result) };
}

function adaptStreamedOptions(
  input: StreamedGeneralizedLawfulCertificateOptions,
): GeneralizedLawfulCertificateOptions<StreamedDavisCell> {
  const { oracle, evaluation } = input;
  const evaluationSlot = input.candidateIndex;
  if (evaluation.oracleStructureHash !== oracle.structureHash) {
    throw new Error(
      "The streamed lawful evaluation was produced by a different action oracle.",
    );
  }
  const candidate = evaluation.candidates[evaluationSlot];
  const closureCandidate = evaluation.closure.candidateSummaries.find(
    (entry) => entry.candidateIndex === evaluationSlot,
  );
  if (!candidate || !closureCandidate) {
    throw new RangeError(
      `Candidate index ${evaluationSlot} is absent from the streamed lawful evaluation.`,
    );
  }
  const sourceBinding: GeneralizedLawfulSourceBinding = {
    kind: "streamed-lawful-davis-source-binding",
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    wallStructureHash: oracle.walls.structureHash,
    streamedRetentionHash: closureCandidate.retentionHash,
    streamedClosureHash: closureCandidate.closureHash,
    candidateId: candidate.id,
    // The evaluation slot is deliberately private. A selected candidate is a
    // singleton theorem object, so its public artifact uses canonical slot 0
    // and replays identically whether evaluated alone or in a larger batch.
    candidateIndex: 0,
    coorientationHash: closureCandidate.coorientationHash,
  };
  const sourceHash = computeGeneralizedLawfulSourceHash(sourceBinding);
  const adaptedOracle: GeneralizedLawfulCellOracle<StreamedDavisCell> = {
    degree: oracle.degree,
    dimension: Math.max(
      0,
      ...oracle.sphericalTypes.map((type) => type.dimension),
    ),
    sourceHash,
    sphericalTypes: oracle.sphericalTypes,
    cellCountByDimension: oracle.cellCountByDimension,
    cellContaining: oracle.cellContaining,
    cellVertices: oracle.cellVertices,
    forEachCell: oracle.forEachCell,
    forEachFacet: oracle.forEachFacet,
    forEachRankTwoFace: oracle.forEachRankTwoFace,
    isRetained: (cell) => evaluation.isRetained(cell, evaluationSlot),
    neighbor: oracle.neighbor,
  };
  return {
    oracle: adaptedOracle,
    candidateIndex: 0,
    candidateId: candidate.id,
    edgeIncrement: (point, generator) =>
      evaluation.edgeIncrement(point, generator, evaluationSlot),
    // Successful construction of the packed oracle has already checked a
    // transitive Coxeter action, a complete spherical plan, and free action of
    // every nonempty spherical special subgroup.
    sourceChecks: {
      finiteConnectedQuotient: true,
      torsionFreeDavisQuotient: true,
      completeSphericalEnumeration: true,
      regularCoxeterCellQuotient: true,
      inheritedMoussongMetric: true,
    },
    sourceBinding,
    ...(input.calculationMode === undefined
      ? {}
      : { calculationMode: input.calculationMode }),
    ...(input.linkScan === undefined ? {} : { linkScan: input.linkScan }),
    ...(input.maxLinkWitnesses === undefined
      ? {}
      : { maxLinkWitnesses: input.maxLinkWitnesses }),
    ...(input.maxMetricFlagWitnesses === undefined
      ? {}
      : { maxMetricFlagWitnesses: input.maxMetricFlagWitnesses }),
  };
}

/** Build directly from the packed action oracle and its bound wall signs. */
export function buildGeneralizedLawfulCertificateFromStreamed(
  input: StreamedGeneralizedLawfulCertificateOptions,
): GeneralizedLawfulCertificate {
  return buildGeneralizedLawfulCertificate(adaptStreamedOptions(input));
}

/**
 * Reuse the packed oracle's exact all-cell retention pass.  Its retention hash
 * contains one bit per (cell,candidate), while the source binding fixes which
 * candidate bit this certificate means.  This avoids re-enumerating 780,000+
 * cells merely to reproduce counts already checked by the streamed builder.
 */
function buildStreamedRetentionCertificate(
  input: StreamedGeneralizedLawfulCertificateOptions,
  options: GeneralizedLawfulCertificateOptions<StreamedDavisCell>,
): GeneralizedLawfulRetentionCertificate {
  const closure = input.evaluation.closure;
  const candidate = closure.candidateSummaries.find(
    (entry) => entry.candidateIndex === input.candidateIndex,
  );
  if (!candidate || !options.sourceBinding) {
    throw new Error(
      `Candidate index ${input.candidateIndex} has no exact streamed closure binding.`,
    );
  }
  const totalCellCountByDimension = {
    ...input.oracle.cellCountByDimension,
  };
  const retainedCellCountByDimension = {
    ...candidate.retainedCellCountByDimension,
  };
  const discardedCellCountByDimension = {
    ...candidate.discardedCellCountByDimension,
  };
  const dimensions = new Set([
    ...Object.keys(totalCellCountByDimension),
    ...Object.keys(retainedCellCountByDimension),
    ...Object.keys(discardedCellCountByDimension),
  ]);
  const advertisedCellCountsMatch = [...dimensions].every(
    (dimension) =>
      (retainedCellCountByDimension[dimension] ?? 0) +
        (discardedCellCountByDimension[dimension] ?? 0) ===
      (totalCellCountByDimension[dimension] ?? 0),
  );
  const rankZeroAndOneCellsRetained =
    candidate.checks.allVerticesAndEdgesRetained &&
    [0, 1].every(
      (dimension) =>
        (retainedCellCountByDimension[String(dimension)] ?? 0) ===
        (totalCellCountByDimension[String(dimension)] ?? 0),
    );
  const checks = {
    // The packed oracle is constructed from canonical spherical orbits and
    // rejects duplicate or nonfree cells before an evaluation can be bound.
    deterministicCellEnumeration: true,
    advertisedCellCountsMatch,
    rankZeroAndOneCellsRetained,
    higherRetentionMatchesRankTwoRule:
      candidate.checks.higherCellsUseEveryRankTwoFace,
    retainedCellsDownwardClosed:
      candidate.checks.retainedCellsDownwardClosed &&
      candidate.downwardClosureViolationCount === 0,
  };
  const errors: string[] = [];
  if (!advertisedCellCountsMatch)
    errors.push(
      "Streamed retained and discarded counts do not sum to the cell manifest.",
    );
  if (!rankZeroAndOneCellsRetained)
    errors.push(
      "The streamed closure discards part of the zero- or one-skeleton.",
    );
  if (!checks.higherRetentionMatchesRankTwoRule)
    errors.push(
      "The streamed closure does not follow the all-rank-two-faces rule.",
    );
  if (!checks.retainedCellsDownwardClosed)
    errors.push("The streamed retained cell set is not downward closed.");
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    method: "retain-one-skeleton-and-cells-with-only-lawful-rank-two-faces",
    sourceHash: options.oracle.sourceHash,
    totalCellCountByDimension,
    retainedCellCountByDimension,
    discardedCellCountByDimension,
    checks,
    digestAlgorithm: "sha256-source-binding-v1",
    cellSetDigest: canonicalSha256({
      schemaVersion: 1,
      method: "streamed-exact-retained-cell-set-source-binding",
      sourceHash: options.oracle.sourceHash,
      candidateId: options.candidateId,
      streamedRetentionHash: candidate.retentionHash,
      streamedClosureHash: candidate.closureHash,
    }),
    errors: uniqueSortedStrings(errors),
  };
}

function buildStreamedAsphericityCertificate(
  input: StreamedGeneralizedLawfulCertificateOptions,
  options: GeneralizedLawfulCertificateOptions<StreamedDavisCell>,
  retention: GeneralizedLawfulRetentionCertificate,
): GeneralizedLawfulAsphericityCertificate {
  const metric = input.evaluation.checkMoussongMetricFlag(
    input.candidateIndex,
    input.maxMetricFlagWitnesses ?? 32,
  );
  const typeById = new Map(
    input.oracle.sphericalTypes.map((type) => [type.id, type] as const),
  );
  const obstructions = metric.witnesses.map((witness) => {
    const type = typeById.get(witness.sphericalTypeId);
    if (!type) {
      throw new Error(
        `Metric-flag replay references unknown spherical type ${witness.sphericalTypeId}.`,
      );
    }
    return {
      point: witness.point,
      generators: [...type.generators],
      missingCellId: witness.sphericalCellId,
      incidentPairCellIds: [...witness.pairCellIds],
      unlawfulRankTwoFaceCellId: witness.unlawfulRankTwoFaceCellId,
      unlawfulRankTwoFaceRepresentativePoint:
        witness.unlawfulRankTwoFaceRepresentativePoint,
    };
  });
  const checks = {
    ...options.sourceChecks,
    lawfulCellSetCertified: retention.status === "passed",
    everyMetricSphericalCliqueFilled: metric.metricallyFlag,
  };
  const passed =
    metric.status === "passed" && Object.values(checks).every(Boolean);
  const metricFlagDigest = canonicalSha256({
    schemaVersion: 1,
    method: "streamed-metric-flag-replay-bound-to-retained-cell-set",
    sourceCellSetDigest: retention.cellSetDigest,
    sourceHash: options.oracle.sourceHash,
    candidateId: options.candidateId,
    checkedPointTypePairs: metric.checkedPointTypePairs,
    violationCount: metric.violationCount,
    retainedWitnesses: obstructions,
  });
  return {
    status: passed ? "passed" : "not-established",
    method: "inherited-davis-moussong-metric-and-metric-flag-links",
    sourceCellSetDigest: retention.cellSetDigest,
    checks,
    sphericalCliquesChecked: metric.checkedPointTypePairs,
    metricFlagObstructionCount: metric.violationCount,
    obstructions,
    metricFlagDigest,
    metricFlagDigestAlgorithm: "sha256",
    conclusion: passed
      ? "The retained complex is locally CAT(0) in the inherited Davis--Moussong metric. Its universal cover is CAT(0), hence contractible, so the retained complex is aspherical."
      : "Contractibility of the universal cover and asphericity are not established by this calculation.",
    nonClaims: [
      "A metric-flag obstruction only defeats this inherited-metric certificate; it is not proof that the retained complex is nonaspherical.",
      "No generic algorithm deciding asphericity of arbitrary finite complexes is claimed.",
    ],
  };
}

/** Lightweight closure/asphericity stage for the concrete packed oracle. */
export function buildGeneralizedLawfulClosureAndAsphericityFromStreamed(
  input: StreamedGeneralizedLawfulCertificateOptions,
): GeneralizedLawfulClosureAndAsphericityResult {
  const options = adaptStreamedOptions(input);
  const retention = buildStreamedRetentionCertificate(input, options);
  const asphericity = buildStreamedAsphericityCertificate(
    input,
    options,
    retention,
  );
  const result = {
    candidateId: options.candidateId,
    candidateIndex: options.candidateIndex,
    sourceHash: options.oracle.sourceHash,
    retention,
    asphericity,
  };
  return { ...result, resultHash: canonicalSha256(result) };
}

/**
 * Replay one actual pulled-subdivision link without rescanning the global cell
 * set. This is the bounded verifier used for an exact early counterexample.
 */
export function computeGeneralizedLawfulDirectedLinkAtPointFromStreamed(
  input: StreamedGeneralizedLawfulDirectedLinkPointOptions,
): GeneralizedLawfulDirectedLinkPointResult {
  if (
    !Number.isSafeInteger(input.point) ||
    input.point < 0 ||
    input.point >= input.oracle.degree
  ) {
    throw new RangeError(
      `Directed-link point ${input.point} is outside 0..${input.oracle.degree - 1}.`,
    );
  }
  const options = adaptStreamedOptions({
    oracle: input.oracle,
    evaluation: input.evaluation,
    candidateIndex: input.candidateIndex,
    calculationMode: "compact-connectivity",
    linkScan: "stop-on-first-failure",
  });
  if (!options.sourceBinding) {
    throw new Error("The streamed directed-link replay has no source binding.");
  }
  const links = buildOnePointConnectivityLinks(
    options,
    sortedTypes(options.oracle),
    input.point,
    createCalculationContext<StreamedDavisCell>(),
  );
  const linkDigest = canonicalSha256({
    point: input.point,
    representation: "compact-connectivity",
    ascending: links.ascending.maximalSimplices,
    descending: links.descending.maximalSimplices,
  });
  const summarize = (link: LinkData) => ({
    vertexCount: uniqueSortedStrings(link.maximalSimplices.flat()).length,
    componentCount: link.components.length,
    components: link.components,
    nonempty: link.nonempty,
    connected: link.connected,
  });
  const resultWithoutHash = {
    schemaVersion: 1 as const,
    kind: "generalized-lawful-directed-link-point-replay" as const,
    status: "passed" as const,
    sourceHash: options.oracle.sourceHash,
    sourceBinding: { ...options.sourceBinding },
    candidateId: options.candidateId,
    candidateIndex: options.candidateIndex,
    point: input.point,
    subdivision: {
      method: "global-action-point-order-recursive-pulling" as const,
      introducedVertexIds: [] as [],
    },
    height: {
      cocycleScale: "raw-integral-no-division" as const,
      periodicOffsetFormula: "actionPoint/(4*degree)" as const,
    },
    ascending: summarize(links.ascending),
    descending: summarize(links.descending),
    linkDigest,
  };
  return {
    ...resultWithoutHash,
    resultHash: canonicalSha256(resultWithoutHash),
  };
}

/**
 * Replay every streamed cell, chart, subdivision, and link before comparing
 * the rebuilt object.  Merely recomputing the certificate's outer hash is not
 * accepted as replay.
 */
export function replayGeneralizedLawfulCertificate<
  Cell extends GeneralizedLawfulCellKey,
>(
  options: GeneralizedLawfulCertificateOptions<Cell>,
  certificate: GeneralizedLawfulCertificate,
): GeneralizedLawfulCertificateReplay {
  const storedArtifactHashValid =
    certificate.artifactHash ===
    canonicalSha256({ ...certificate, artifactHash: "" });
  const rebuilt = buildGeneralizedLawfulCertificate(options);
  const actionRootedReconstructionMatches =
    canonicalSha256(rebuilt) === canonicalSha256(certificate);
  const rebuiltCalculationCompleted = rebuilt.status === "completed";
  const checks = {
    storedArtifactHashValid,
    actionRootedReconstructionMatches,
    rebuiltCalculationCompleted,
  };
  const errors: string[] = [];
  if (!storedArtifactHashValid)
    errors.push("The stored generalized-lawful artifact hash is invalid.");
  if (!actionRootedReconstructionMatches)
    errors.push(
      "The generalized-lawful artifact differs from its action-rooted reconstruction.",
    );
  if (!rebuiltCalculationCompleted)
    errors.push("The rebuilt generalized-lawful calculation did not complete.");
  return {
    schemaVersion: 1,
    kind: "generalized-coface-closed-lawful-certificate-replay",
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks,
    rebuiltArtifactHash: rebuilt.artifactHash,
    errors,
  };
}

/** Replay convenience wrapper for the concrete packed oracle. */
export function replayGeneralizedLawfulCertificateFromStreamed(
  input: StreamedGeneralizedLawfulCertificateOptions,
  certificate: GeneralizedLawfulCertificate,
): GeneralizedLawfulCertificateReplay {
  return replayGeneralizedLawfulCertificate(
    adaptStreamedOptions(input),
    certificate,
  );
}
