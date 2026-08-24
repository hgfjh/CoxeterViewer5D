import { canonicalSha256 } from "../utils/canonicalSha256";

export type CubeRescueDirection = "ascending" | "descending";

export interface CubeRescueSeparatorMotif {
  motifId: string;
  point: number;
  direction: CubeRescueDirection;
  failureKind: "ascending-disconnected" | "descending-disconnected";
  sigma: -1 | 1;
  coneDimension: number;
  primitiveWitness: string[];
  forcedWitnessGermIds: string[];
  forcedGermCount: number;
  possibleGermCount: number;
  possibleComponentCount: number;
  proofHash: string;
  nodeHash: string;
}

export interface CubeRescueMotifExtraction {
  schemaVersion: 1;
  kind: "compact-5-cube-separator-motif-extraction";
  adaptiveArtifactDigest: string;
  adaptiveReportDigest: string;
  adaptiveSourceHash: string;
  rank: 19;
  terminalPruneCount: number;
  pointCensus: Array<{ point: number; count: number }>;
  motifs: CubeRescueSeparatorMotif[];
  motifDigest: string;
}

export type CubeRescueSubdivisionFamily = "pulling" | "maximal-simplex-stellar";

/**
 * A local link vertex carries the numerator of an exact affine height
 * difference.  Its denominator is positive and therefore irrelevant to its
 * sign.  Introduced stellar vertices use sums of the surrounding vertex
 * forms, which avoids floating-point barycentres.
 */
export interface CubeRescueAffineLinkVertex {
  id: string;
  sourceKind: "pulling-germ" | "maximal-simplex-stellar";
  characterNumeratorPairs: Array<[number, string]>;
  potentialNumeratorPairs: Array<[number, string]>;
  tieNumerator: number;
  /** Used only when the displayed exact numerator vanishes. */
  microTie: -1 | 0 | 1;
}

export interface CubeRescueLocalTemplate {
  schemaVersion: 1;
  kind: "compact-5-cube-rescue-local-link-template";
  point: number;
  rank: number;
  degree: number;
  orderId: string;
  orderDigest: string;
  subdivisionFamily: CubeRescueSubdivisionFamily;
  vertices: CubeRescueAffineLinkVertex[];
  edges: Array<[number, number]>;
  introducedVertexCount: number;
  sourceTopologyDigest: string;
  templateDigest: string;
}

export interface CubeRescuePotential {
  /** Quotient-periodic integral values; omitted points have value zero. */
  values: Array<[number, string]>;
  potentialDigest: string;
}

export interface CubeRescueLinkEvaluation {
  point: number;
  orderId: string;
  subdivisionFamily: CubeRescueSubdivisionFamily;
  ascendingVertexCount: number;
  descendingVertexCount: number;
  ascendingComponentCount: number;
  descendingComponentCount: number;
  ascendingComponents: string[][];
  descendingComponents: string[][];
  failures: Array<
    | "ascending-empty"
    | "descending-empty"
    | "ascending-disconnected"
    | "descending-disconnected"
  >;
  signDigest: string;
  evaluationDigest: string;
}

export interface CubeRescuePotentialSearchBounds {
  maxIterations: number;
  beamWidth: number;
  maxStates: number;
  maxVariablesPerFailure: number;
  maxCandidateValuesPerVariable: number;
  maxAbsolutePotential: number;
}

export interface CubeRescuePotentialSearchResult {
  schemaVersion: 2;
  kind: "bounded-exact-periodic-potential-connector-search";
  status: "connector-found" | "not-found-within-bounds";
  method: "separator-path-threshold-beam-search-v2-potential-digest-tiebreak";
  sigma: -1 | 1;
  primitiveWitness: string[];
  bounds: CubeRescuePotentialSearchBounds;
  exploredStateCount: number;
  iterationCount: number;
  initialScore: number[];
  bestScore: number[];
  potential: CubeRescuePotential;
  evaluations: CubeRescueLinkEvaluation[];
  searchDigest: string;
  nonClaims: string[];
}

interface AdaptiveNode {
  constraintDigest?: unknown;
  decision?: unknown;
  depth?: unknown;
  feasibility?: unknown;
  nodeHash?: unknown;
}

interface MaterializedTemplateEvaluation {
  publicResult: CubeRescueLinkEvaluation;
  signs: Int8Array;
  ascendingComponents: number[][];
  descendingComponents: number[][];
}

interface EvaluatedTemplateInternal {
  signs: Int8Array;
  ascendingVertexCount: number;
  descendingVertexCount: number;
  ascendingComponents: number[][];
  descendingComponents: number[][];
  failures: CubeRescueLinkEvaluation["failures"];
}

interface PotentialState {
  values: Map<number, bigint>;
  evaluations: EvaluatedTemplateInternal[];
  score: number[];
  potentialDigest: string;
}

interface CubeRescuePreparedVertex {
  readonly characterNumerator: bigint;
  readonly potentialNumeratorPairs: ReadonlyArray<readonly [number, bigint]>;
  readonly tieNumerator: bigint;
}

interface CubeRescuePreparedTemplate {
  readonly template: CubeRescueLocalTemplate;
  readonly templateDigest: string;
  readonly heightScale: bigint;
  readonly vertices: ReadonlyArray<CubeRescuePreparedVertex>;
}

interface CubeRescueTemplateDerivedCache {
  templateDigest: string;
  adjacency?: number[][];
  heightScale?: bigint;
}

export interface CubeRescueTemplateDerivedCacheMetrics {
  adjacencyHits: number;
  adjacencyMisses: number;
  heightScaleHits: number;
  heightScaleMisses: number;
  digestInvalidations: number;
}

const templateDerivedCacheMetrics: CubeRescueTemplateDerivedCacheMetrics = {
  adjacencyHits: 0,
  adjacencyMisses: 0,
  heightScaleHits: 0,
  heightScaleMisses: 0,
  digestInvalidations: 0,
};

export function readCubeRescueTemplateDerivedCacheMetrics(): CubeRescueTemplateDerivedCacheMetrics {
  return { ...templateDerivedCacheMetrics };
}

export function resetCubeRescueTemplateDerivedCacheMetrics(): void {
  for (const key of Object.keys(templateDerivedCacheMetrics) as Array<
    keyof CubeRescueTemplateDerivedCacheMetrics
  >) {
    templateDerivedCacheMetrics[key] = 0;
  }
}

const templateDerivedCache = new WeakMap<
  CubeRescueLocalTemplate,
  CubeRescueTemplateDerivedCache
>();

function derivedCacheOf(
  template: CubeRescueLocalTemplate,
): CubeRescueTemplateDerivedCache {
  const cached = templateDerivedCache.get(template);
  if (cached?.templateDigest === template.templateDigest) return cached;
  if (cached) templateDerivedCacheMetrics.digestInvalidations += 1;
  const fresh = { templateDigest: template.templateDigest };
  templateDerivedCache.set(template, fresh);
  return fresh;
}

const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactInteger(value: unknown, context: string): bigint {
  if (typeof value !== "string" || !INTEGER_PATTERN.test(value)) {
    throw new Error(`${context} is not a canonical decimal integer.`);
  }
  return BigInt(value);
}

function safeInteger(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${context} is not a safe integer.`);
  }
  return value as number;
}

function digest(value: unknown, context: string): string {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new Error(`${context} is not a SHA-256 digest.`);
  }
  return value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function isPrimitiveNonzero(values: readonly string[]): boolean {
  let divisor = 0n;
  for (const value of values)
    divisor = gcd(divisor, exactInteger(value, "weight"));
  return divisor === 1n;
}

function canonicalPotential(
  values: ReadonlyMap<number, bigint>,
): CubeRescuePotential {
  const entries = [...values.entries()]
    .filter(([, value]) => value !== 0n)
    .sort(([left], [right]) => left - right)
    .map(([point, value]) => [point, value.toString()] as [number, string]);
  return {
    values: entries,
    potentialDigest: canonicalSha256({
      method: "quotient-periodic-integral-zero-cochain",
      values: entries,
    }),
  };
}

function motifFromPruneNode(
  node: AdaptiveNode,
): CubeRescueSeparatorMotif | undefined {
  if (!isRecord(node.decision) || node.decision.kind !== "prune")
    return undefined;
  const proof = isRecord(node.decision.proof) ? node.decision.proof : undefined;
  const feasibility = isRecord(node.feasibility) ? node.feasibility : undefined;
  const result =
    feasibility && isRecord(feasibility.result)
      ? feasibility.result
      : undefined;
  if (!proof || !result || result.kind !== "feasible") {
    throw new Error(
      "A terminal obstruction prune lacks its feasible cone witness.",
    );
  }
  if (
    !Array.isArray(result.primitiveWitness) ||
    result.primitiveWitness.length !== 19
  ) {
    throw new Error(
      "A separator motif must carry a rank-19 primitive witness.",
    );
  }
  const primitiveWitness = result.primitiveWitness.map((entry, index) => {
    exactInteger(entry, `primitive witness coordinate ${index}`);
    return entry as string;
  });
  if (!isPrimitiveNonzero(primitiveWitness)) {
    throw new Error("A separator motif witness is zero or nonprimitive.");
  }
  const direction = proof.direction;
  const failureKind = proof.failureKind;
  if (
    (direction !== "ascending" && direction !== "descending") ||
    (failureKind !== "ascending-disconnected" &&
      failureKind !== "descending-disconnected")
  ) {
    throw new Error(
      "The adaptive prune is not a disconnected-link separator motif.",
    );
  }
  const sigma = safeInteger(proof.sigma, "motif sigma");
  if (sigma !== -1 && sigma !== 1)
    throw new Error("A motif sigma must be +/-1.");
  const forcedWitnessGermIds = Array.isArray(
    proof.forcedComponentWitnessExcerpt,
  )
    ? proof.forcedComponentWitnessExcerpt.map((entry) => {
        if (typeof entry !== "string" || entry.length === 0) {
          throw new Error("A forced separator witness id is invalid.");
        }
        return entry;
      })
    : [];
  if (forcedWitnessGermIds.length < 2) {
    throw new Error("A separator motif must name two separated forced germs.");
  }
  const payload: Omit<CubeRescueSeparatorMotif, "motifId"> = {
    point: safeInteger(proof.point, "motif point"),
    direction,
    failureKind,
    sigma: sigma as -1 | 1,
    coneDimension: safeInteger(result.dimension, "cone dimension"),
    primitiveWitness,
    forcedWitnessGermIds,
    forcedGermCount: safeInteger(proof.forcedGermCount, "forced germ count"),
    possibleGermCount: safeInteger(
      proof.possibleGermCount,
      "possible germ count",
    ),
    possibleComponentCount: safeInteger(
      proof.possibleComponentCount,
      "possible component count",
    ),
    proofHash: digest(proof.proofHash, "motif proof hash"),
    nodeHash: digest(node.nodeHash, "motif node hash"),
  };
  return { motifId: canonicalSha256(payload), ...payload };
}

function visitAdaptiveTree(
  value: unknown,
  motifs: CubeRescueSeparatorMotif[],
): void {
  if (!isRecord(value)) return;
  const motif = motifFromPruneNode(value as AdaptiveNode);
  if (motif) {
    motifs.push(motif);
    return;
  }
  const decision = isRecord(value.decision) ? value.decision : undefined;
  if (!decision || !Array.isArray(decision.branches)) return;
  for (const branch of decision.branches) {
    if (!isRecord(branch)) continue;
    if (branch.outcome === "feasible") visitAdaptiveTree(branch.child, motifs);
  }
}

/** Extract the exact terminal separator witnesses without loading the global normal catalogue. */
export function extractCubeRescueSeparatorMotifs(
  adaptiveArtifact: unknown,
): CubeRescueMotifExtraction {
  if (!isRecord(adaptiveArtifact) || !isRecord(adaptiveArtifact.report)) {
    throw new Error("The sealed adaptive artifact has the wrong envelope.");
  }
  const report = adaptiveArtifact.report;
  const search = isRecord(report.search) ? report.search : undefined;
  const finalCover =
    search && isRecord(search.finalCover) ? search.finalCover : undefined;
  const source = isRecord(report.source) ? report.source : undefined;
  if (
    adaptiveArtifact.kind !==
      "compact-5-cube-rank19-adaptive-runner-artifact" ||
    report.kind !== "compact-5-cube-rank19-adaptive-obstruction-point-search" ||
    report.status !== "invariant-obstruction-cover" ||
    search?.rank !== 19 ||
    finalCover?.kind !== "oracle-backed-obstruction-pruned-cone-cover" ||
    !source
  ) {
    throw new Error(
      "The rescue requires the terminal rank-19 obstruction cover.",
    );
  }
  const motifs: CubeRescueSeparatorMotif[] = [];
  visitAdaptiveTree(finalCover.root, motifs);
  motifs.sort(
    (left, right) =>
      left.point - right.point ||
      left.coneDimension - right.coneDimension ||
      left.motifId.localeCompare(right.motifId),
  );
  if (
    motifs.length !== safeInteger(finalCover.pruneLeafCount, "prune leaf count")
  ) {
    throw new Error(
      `Extracted ${motifs.length} motifs from ${String(finalCover.pruneLeafCount)} prune leaves.`,
    );
  }
  const pointCounts = new Map<number, number>();
  for (const motif of motifs)
    pointCounts.set(motif.point, (pointCounts.get(motif.point) ?? 0) + 1);
  const pointCensus = [...pointCounts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([point, count]) => ({ point, count }));
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-separator-motif-extraction" as const,
    adaptiveArtifactDigest: digest(
      adaptiveArtifact.artifactDigest,
      "adaptive artifact digest",
    ),
    adaptiveReportDigest: digest(report.reportDigest, "adaptive report digest"),
    adaptiveSourceHash: digest(source.sourceHash, "adaptive source hash"),
    rank: 19 as const,
    terminalPruneCount: motifs.length,
    pointCensus,
    motifs,
  };
  return { ...withoutDigest, motifDigest: canonicalSha256(withoutDigest) };
}

function validatePairs(
  pairs: readonly [number, string][],
  maximumIndex: number,
  context: string,
): void {
  let previous = -1;
  for (const [index, value] of pairs) {
    if (
      !Number.isSafeInteger(index) ||
      index <= previous ||
      index < 0 ||
      index >= maximumIndex
    ) {
      throw new Error(
        `${context} indices are not strictly increasing and in range.`,
      );
    }
    if (exactInteger(value, `${context} value`) === 0n) {
      throw new Error(`${context} contains an explicit zero.`);
    }
    previous = index;
  }
}

export function computeCubeRescueLocalTemplateDigest(
  template: CubeRescueLocalTemplate,
): string {
  return canonicalSha256({ ...template, templateDigest: "" });
}

export function validateCubeRescueLocalTemplate(
  template: CubeRescueLocalTemplate,
): void {
  if (
    template.schemaVersion !== 1 ||
    template.kind !== "compact-5-cube-rescue-local-link-template" ||
    template.rank < 1 ||
    template.degree < 1 ||
    template.point < 0 ||
    template.point >= template.degree ||
    template.vertices.length === 0
  ) {
    throw new Error("The local rescue template has an invalid envelope.");
  }
  const ids = new Set<string>();
  let introduced = 0;
  for (const vertex of template.vertices) {
    if (vertex.id.length === 0 || ids.has(vertex.id)) {
      throw new Error(
        "Local rescue link vertex ids must be nonempty and unique.",
      );
    }
    ids.add(vertex.id);
    validatePairs(
      vertex.characterNumeratorPairs,
      template.rank,
      `${vertex.id} character`,
    );
    validatePairs(
      vertex.potentialNumeratorPairs,
      template.degree,
      `${vertex.id} potential`,
    );
    if (
      vertex.microTie !== -1 &&
      vertex.microTie !== 0 &&
      vertex.microTie !== 1
    ) {
      throw new Error(`${vertex.id} has an invalid micro tie.`);
    }
    if (vertex.sourceKind !== "pulling-germ") introduced += 1;
  }
  if (introduced !== template.introducedVertexCount) {
    throw new Error("The introduced local vertex count is stale.");
  }
  let previousLeft = -1;
  let previousRight = -1;
  for (const [left, right] of template.edges) {
    if (
      !Number.isSafeInteger(left) ||
      !Number.isSafeInteger(right) ||
      left < 0 ||
      right <= left ||
      right >= template.vertices.length
    ) {
      throw new Error(
        "A local rescue link edge is noncanonical or out of range.",
      );
    }
    if (
      left < previousLeft ||
      (left === previousLeft && right <= previousRight)
    ) {
      throw new Error("Local rescue link edges are not canonical.");
    }
    previousLeft = left;
    previousRight = right;
  }
  if (
    computeCubeRescueLocalTemplateDigest(template) !== template.templateDigest
  ) {
    throw new Error("The local rescue template digest is stale.");
  }
}

function selectedComponents(
  selected: readonly number[],
  adjacency: readonly number[][],
): number[][] {
  const unseen = new Uint8Array(adjacency.length);
  for (const index of selected) unseen[index] = 1;
  const components: number[][] = [];
  for (const root of selected) {
    if (unseen[root] === 0) continue;
    unseen[root] = 0;
    const component = [root];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of adjacency[component[cursor]]) {
        if (unseen[neighbor] === 0) continue;
        unseen[neighbor] = 0;
        component.push(neighbor);
      }
    }
    component.sort((left, right) => left - right);
    components.push(component);
  }
  return components;
}

function adjacencyOf(template: CubeRescueLocalTemplate): number[][] {
  const derived = derivedCacheOf(template);
  if (derived.adjacency) {
    templateDerivedCacheMetrics.adjacencyHits += 1;
    return derived.adjacency;
  }
  templateDerivedCacheMetrics.adjacencyMisses += 1;
  const adjacency = Array.from(
    { length: template.vertices.length },
    () => [] as number[],
  );
  for (const [left, right] of template.edges) {
    adjacency[left].push(right);
    adjacency[right].push(left);
  }
  for (const row of adjacency) row.sort((left, right) => left - right);
  derived.adjacency = adjacency;
  return adjacency;
}

function dotSparse(
  pairs: readonly [number, string][],
  vector: readonly bigint[],
): bigint {
  let total = 0n;
  for (const [index, value] of pairs) total += BigInt(value) * vector[index];
  return total;
}

function potentialSparse(
  pairs: readonly [number, string][],
  potential: ReadonlyMap<number, bigint>,
): bigint {
  let total = 0n;
  for (const [point, value] of pairs)
    total += BigInt(value) * (potential.get(point) ?? 0n);
  return total;
}

function preparedPotentialSparse(
  pairs: ReadonlyArray<readonly [number, bigint]>,
  potential: ReadonlyMap<number, bigint>,
): bigint {
  let total = 0n;
  for (const [point, coefficient] of pairs) {
    total += coefficient * (potential.get(point) ?? 0n);
  }
  return total;
}

function prepareCubeRescueTemplate(
  template: CubeRescueLocalTemplate,
  weight: readonly bigint[],
): CubeRescuePreparedTemplate {
  // The character is fixed throughout one bounded search.  Evaluating its
  // sparse dot products and parsing coefficient strings here preserves the
  // exact affine numerator while avoiding the same BigInt work in every state.
  return {
    template,
    templateDigest: template.templateDigest,
    heightScale: cubeRescueTemplateHeightScale(template),
    vertices: template.vertices.map((vertex) => ({
      characterNumerator: dotSparse(vertex.characterNumeratorPairs, weight),
      potentialNumeratorPairs: vertex.potentialNumeratorPairs.map(
        ([point, coefficient]) => [point, BigInt(coefficient)] as const,
      ),
      tieNumerator: BigInt(vertex.tieNumerator),
    })),
  };
}

function assertPreparedTemplateBinding(
  template: CubeRescueLocalTemplate,
  prepared: CubeRescuePreparedTemplate,
): void {
  if (
    prepared.template !== template ||
    prepared.templateDigest !== template.templateDigest ||
    prepared.vertices.length !== template.vertices.length
  ) {
    throw new Error(
      "Prepared rescue data is stale or belongs to another template.",
    );
  }
}

/** A common exact scale on one link; it makes every nonzero integral term dominate its tie. */
export function cubeRescueTemplateHeightScale(
  template: CubeRescueLocalTemplate,
): bigint {
  const derived = derivedCacheOf(template);
  if (derived.heightScale !== undefined) {
    templateDerivedCacheMetrics.heightScaleHits += 1;
    return derived.heightScale;
  }
  templateDerivedCacheMetrics.heightScaleMisses += 1;
  let maximumTie = 0n;
  for (const vertex of template.vertices) {
    const tie = BigInt(vertex.tieNumerator);
    const absolute = tie < 0n ? -tie : tie;
    if (absolute > maximumTie) maximumTie = absolute;
  }
  derived.heightScale = maximumTie + 1n;
  return derived.heightScale;
}

function evaluateTemplateMaterialized(options: {
  template: CubeRescueLocalTemplate;
  primitiveWitness: readonly string[];
  potential: ReadonlyMap<number, bigint>;
  sigma: -1 | 1;
  validate?: boolean;
  prepared?: CubeRescuePreparedTemplate;
}): MaterializedTemplateEvaluation {
  const { template } = options;
  if (options.validate !== false) validateCubeRescueLocalTemplate(template);
  if (options.primitiveWitness.length !== template.rank) {
    throw new Error(
      "The rescue witness rank does not match the local template.",
    );
  }
  if (options.prepared) {
    assertPreparedTemplateBinding(template, options.prepared);
  }
  const weight = options.prepared
    ? undefined
    : options.primitiveWitness.map((value, index) =>
        exactInteger(value, `rescue witness coordinate ${index}`),
      );
  const signs = new Int8Array(template.vertices.length);
  const ascending: number[] = [];
  const descending: number[] = [];
  const signRecords: Array<[string, number, string]> = [];
  const heightScale =
    options.prepared?.heightScale ?? cubeRescueTemplateHeightScale(template);
  const sigma = BigInt(options.sigma);
  for (let index = 0; index < template.vertices.length; index += 1) {
    const vertex = template.vertices[index];
    const preparedVertex = options.prepared?.vertices[index];
    const integral = preparedVertex
      ? preparedVertex.characterNumerator +
        preparedPotentialSparse(
          preparedVertex.potentialNumeratorPairs,
          options.potential,
        )
      : dotSparse(vertex.characterNumeratorPairs, weight!) +
        potentialSparse(vertex.potentialNumeratorPairs, options.potential);
    const main =
      heightScale * integral +
      sigma * (preparedVertex?.tieNumerator ?? BigInt(vertex.tieNumerator));
    const signed = main === 0n ? vertex.microTie : main > 0n ? 1 : -1;
    if (signed === 0) {
      throw new Error(
        `${vertex.id} remains tied after the declared micro perturbation.`,
      );
    }
    signs[index] = signed;
    (signed > 0 ? ascending : descending).push(index);
    signRecords.push([vertex.id, signed, main.toString()]);
  }
  const adjacency = adjacencyOf(template);
  const ascendingComponents = selectedComponents(ascending, adjacency);
  const descendingComponents = selectedComponents(descending, adjacency);
  const failures: CubeRescueLinkEvaluation["failures"] = [];
  if (ascending.length === 0) failures.push("ascending-empty");
  else if (ascendingComponents.length !== 1)
    failures.push("ascending-disconnected");
  if (descending.length === 0) failures.push("descending-empty");
  else if (descendingComponents.length !== 1)
    failures.push("descending-disconnected");
  const ascendingPublic = ascendingComponents.map((component) =>
    component.map((index) => template.vertices[index].id),
  );
  const descendingPublic = descendingComponents.map((component) =>
    component.map((index) => template.vertices[index].id),
  );
  const signDigest = canonicalSha256(signRecords);
  const withoutDigest = {
    point: template.point,
    orderId: template.orderId,
    subdivisionFamily: template.subdivisionFamily,
    ascendingVertexCount: ascending.length,
    descendingVertexCount: descending.length,
    ascendingComponentCount: ascendingComponents.length,
    descendingComponentCount: descendingComponents.length,
    ascendingComponents: ascendingPublic,
    descendingComponents: descendingPublic,
    failures,
    signDigest,
  };
  return {
    publicResult: {
      ...withoutDigest,
      evaluationDigest: canonicalSha256(withoutDigest),
    },
    signs,
    ascendingComponents,
    descendingComponents,
  };
}

function evaluateTemplateInternal(options: {
  template: CubeRescueLocalTemplate;
  primitiveWitness: readonly string[];
  potential: ReadonlyMap<number, bigint>;
  sigma: -1 | 1;
  prepared?: CubeRescuePreparedTemplate;
}): EvaluatedTemplateInternal {
  const { template } = options;
  if (options.primitiveWitness.length !== template.rank) {
    throw new Error(
      "The rescue witness rank does not match the local template.",
    );
  }
  if (options.prepared) {
    assertPreparedTemplateBinding(template, options.prepared);
  }
  const weight = options.prepared
    ? undefined
    : options.primitiveWitness.map((value, index) =>
        exactInteger(value, `rescue witness coordinate ${index}`),
      );
  const signs = new Int8Array(template.vertices.length);
  const ascending: number[] = [];
  const descending: number[] = [];
  const heightScale =
    options.prepared?.heightScale ?? cubeRescueTemplateHeightScale(template);
  const sigma = BigInt(options.sigma);
  for (let index = 0; index < template.vertices.length; index += 1) {
    const vertex = template.vertices[index];
    const preparedVertex = options.prepared?.vertices[index];
    const integral = preparedVertex
      ? preparedVertex.characterNumerator +
        preparedPotentialSparse(
          preparedVertex.potentialNumeratorPairs,
          options.potential,
        )
      : dotSparse(vertex.characterNumeratorPairs, weight!) +
        potentialSparse(vertex.potentialNumeratorPairs, options.potential);
    const main =
      heightScale * integral +
      sigma * (preparedVertex?.tieNumerator ?? BigInt(vertex.tieNumerator));
    const signed = main === 0n ? vertex.microTie : main > 0n ? 1 : -1;
    if (signed === 0) {
      throw new Error(
        `${vertex.id} remains tied after the declared micro perturbation.`,
      );
    }
    signs[index] = signed;
    (signed > 0 ? ascending : descending).push(index);
  }
  const adjacency = adjacencyOf(template);
  const ascendingComponents = selectedComponents(ascending, adjacency);
  const descendingComponents = selectedComponents(descending, adjacency);
  const failures: CubeRescueLinkEvaluation["failures"] = [];
  if (ascending.length === 0) failures.push("ascending-empty");
  else if (ascendingComponents.length !== 1)
    failures.push("ascending-disconnected");
  if (descending.length === 0) failures.push("descending-empty");
  else if (descendingComponents.length !== 1)
    failures.push("descending-disconnected");
  return {
    signs,
    ascendingVertexCount: ascending.length,
    descendingVertexCount: descending.length,
    ascendingComponents,
    descendingComponents,
    failures,
  };
}

export function evaluateCubeRescueLocalTemplate(options: {
  template: CubeRescueLocalTemplate;
  primitiveWitness: readonly string[];
  potential: CubeRescuePotential | ReadonlyMap<number, bigint>;
  sigma: -1 | 1;
}): CubeRescueLinkEvaluation {
  const potential: ReadonlyMap<number, bigint> = Array.isArray(
    (options.potential as CubeRescuePotential).values,
  )
    ? new Map(
        (options.potential as CubeRescuePotential).values.map(
          ([point, value]): [number, bigint] => [point, BigInt(value)],
        ),
      )
    : (options.potential as ReadonlyMap<number, bigint>);
  return evaluateTemplateMaterialized({ ...options, potential }).publicResult;
}

function score(evaluations: readonly EvaluatedTemplateInternal[]): number[] {
  let failedDirections = 0;
  let emptyDirections = 0;
  let componentExcess = 0;
  for (const evaluation of evaluations) {
    failedDirections += evaluation.failures.length;
    emptyDirections += evaluation.failures.filter((failure) =>
      failure.endsWith("empty"),
    ).length;
    componentExcess += Math.max(0, evaluation.ascendingComponents.length - 1);
    componentExcess += Math.max(0, evaluation.descendingComponents.length - 1);
  }
  return [failedDirections, emptyDirections, componentExcess];
}

function scoreMaterialized(
  evaluations: readonly CubeRescueLinkEvaluation[],
): number[] {
  let failedDirections = 0;
  let emptyDirections = 0;
  let componentExcess = 0;
  for (const evaluation of evaluations) {
    failedDirections += evaluation.failures.length;
    emptyDirections += evaluation.failures.filter((failure) =>
      failure.endsWith("empty"),
    ).length;
    componentExcess += Math.max(0, evaluation.ascendingComponentCount - 1);
    componentExcess += Math.max(0, evaluation.descendingComponentCount - 1);
  }
  return [failedDirections, emptyDirections, componentExcess];
}

function compareScore(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function shortestConnectorPath(
  components: readonly number[][],
  adjacency: readonly number[][],
): number[] {
  if (components.length < 2) return [];
  const target = new Uint8Array(adjacency.length);
  for (let index = 1; index < components.length; index += 1) {
    for (const vertex of components[index]) target[vertex] = 1;
  }
  const parent = new Int32Array(adjacency.length);
  parent.fill(-2);
  const queue: number[] = [];
  for (const root of components[0]) {
    parent[root] = -1;
    queue.push(root);
  }
  let found = -1;
  for (let cursor = 0; cursor < queue.length && found < 0; cursor += 1) {
    const current = queue[cursor];
    if (target[current]) {
      found = current;
      break;
    }
    for (const neighbor of adjacency[current]) {
      if (parent[neighbor] !== -2) continue;
      parent[neighbor] = current;
      queue.push(neighbor);
    }
  }
  if (found < 0) return [];
  const path: number[] = [];
  for (let current = found; current >= 0; current = parent[current])
    path.push(current);
  return path.reverse();
}

function candidateVariables(
  templates: readonly CubeRescueLocalTemplate[],
  evaluations: readonly EvaluatedTemplateInternal[],
  maximum: number,
): number[] {
  const frequency = new Map<number, number>();
  const acceptVertex = (vertex: CubeRescueAffineLinkVertex): void => {
    for (const [point] of vertex.potentialNumeratorPairs) {
      frequency.set(point, (frequency.get(point) ?? 0) + 1);
    }
  };
  for (let index = 0; index < templates.length; index += 1) {
    const template = templates[index];
    const evaluation = evaluations[index];
    const adjacency = adjacencyOf(template);
    const paths = [
      shortestConnectorPath(evaluation.ascendingComponents, adjacency),
      shortestConnectorPath(evaluation.descendingComponents, adjacency),
    ];
    for (const path of paths)
      for (const vertex of path) acceptVertex(template.vertices[vertex]);
    if (
      paths.every((path) => path.length === 0) &&
      evaluation.failures.length > 0
    ) {
      for (
        let vertex = 0;
        vertex < Math.min(template.vertices.length, 32);
        vertex += 1
      ) {
        acceptVertex(template.vertices[vertex]);
      }
    }
    frequency.set(template.point, (frequency.get(template.point) ?? 0) + 1);
  }
  return [...frequency.entries()]
    .sort(
      ([leftPoint, leftCount], [rightPoint, rightCount]) =>
        rightCount - leftCount || leftPoint - rightPoint,
    )
    .slice(0, maximum)
    .map(([point]) => point);
}

function floorDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("Cannot divide by zero.");
  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let quotient = n / d;
  if (n < 0n && n % d !== 0n) quotient -= 1n;
  return quotient;
}

function candidateValuesForVariable(options: {
  variable: number;
  templates: readonly CubeRescueLocalTemplate[];
  preparedTemplates?: readonly CubeRescuePreparedTemplate[];
  primitiveWitness: readonly bigint[];
  potential: ReadonlyMap<number, bigint>;
  sigma: -1 | 1;
  maximumCount: number;
  maximumAbsolute: bigint;
}): bigint[] {
  const values = new Set<bigint>([
    options.potential.get(options.variable) ?? 0n,
    0n,
  ]);
  const current = options.potential.get(options.variable) ?? 0n;
  const sigma = BigInt(options.sigma);
  const acceptThresholds = (
    coefficient: bigint,
    integral: bigint,
    tieNumerator: bigint,
    scale: bigint,
  ): void => {
    const main = scale * integral + sigma * tieNumerator;
    const withoutVariable = main - scale * coefficient * current;
    const boundary = floorDiv(-withoutVariable, scale * coefficient);
    for (const offset of [-1n, 0n, 1n, 2n]) {
      const candidate = boundary + offset;
      if (
        candidate >= -options.maximumAbsolute &&
        candidate <= options.maximumAbsolute
      ) {
        values.add(candidate);
      }
    }
  };
  for (
    let templateIndex = 0;
    templateIndex < options.templates.length;
    templateIndex += 1
  ) {
    const template = options.templates[templateIndex];
    const prepared = options.preparedTemplates?.[templateIndex];
    if (prepared) {
      assertPreparedTemplateBinding(template, prepared);
      for (let index = 0; index < prepared.vertices.length; index += 1) {
        const preparedVertex = prepared.vertices[index];
        const pair = preparedVertex.potentialNumeratorPairs.find(
          ([point]) => point === options.variable,
        );
        if (!pair) continue;
        acceptThresholds(
          pair[1],
          preparedVertex.characterNumerator +
            preparedPotentialSparse(
              preparedVertex.potentialNumeratorPairs,
              options.potential,
            ),
          preparedVertex.tieNumerator,
          prepared.heightScale,
        );
      }
      continue;
    }
    const scale = cubeRescueTemplateHeightScale(template);
    for (const vertex of template.vertices) {
      const pair = vertex.potentialNumeratorPairs.find(
        ([point]) => point === options.variable,
      );
      if (!pair) continue;
      acceptThresholds(
        BigInt(pair[1]),
        dotSparse(vertex.characterNumeratorPairs, options.primitiveWitness) +
          potentialSparse(vertex.potentialNumeratorPairs, options.potential),
        BigInt(vertex.tieNumerator),
        scale,
      );
    }
  }
  return [...values]
    .filter(
      (value) =>
        value >= -options.maximumAbsolute && value <= options.maximumAbsolute,
    )
    .sort((left, right) => {
      const current = options.potential.get(options.variable) ?? 0n;
      const leftDistance = left >= current ? left - current : current - left;
      const rightDistance =
        right >= current ? right - current : current - right;
      return leftDistance < rightDistance
        ? -1
        : leftDistance > rightDistance
          ? 1
          : left < right
            ? -1
            : 1;
    })
    .slice(0, options.maximumCount);
}

function evaluateState(options: {
  templates: readonly CubeRescueLocalTemplate[];
  preparedTemplates?: readonly CubeRescuePreparedTemplate[];
  materializeProvisional?: boolean;
  primitiveWitness: readonly string[];
  potential: Map<number, bigint>;
  sigma: -1 | 1;
}): PotentialState {
  const evaluations = options.templates.map((template, index) => {
    const shared = {
      template,
      prepared: options.preparedTemplates?.[index],
      primitiveWitness: options.primitiveWitness,
      potential: options.potential,
      sigma: options.sigma,
    };
    if (!options.materializeProvisional) {
      return evaluateTemplateInternal(shared);
    }
    const materialized = evaluateTemplateMaterialized({
      ...shared,
      validate: false,
    });
    return {
      signs: materialized.signs,
      ascendingVertexCount: materialized.publicResult.ascendingVertexCount,
      descendingVertexCount: materialized.publicResult.descendingVertexCount,
      ascendingComponents: materialized.ascendingComponents,
      descendingComponents: materialized.descendingComponents,
      failures: [...materialized.publicResult.failures],
    };
  });
  const potential = canonicalPotential(options.potential);
  const stateScore = score(evaluations);
  return {
    values: options.potential,
    evaluations,
    score: stateScore,
    potentialDigest: potential.potentialDigest,
  };
}

function sealPotentialSearchResult(
  value: Omit<CubeRescuePotentialSearchResult, "searchDigest">,
): CubeRescuePotentialSearchResult {
  return { ...value, searchDigest: canonicalSha256(value) };
}

/**
 * Bounded exact-inequality search.  Every evaluated state and threshold is
 * integral; failure means only that this declared beam/domain was exhausted.
 */
export interface CubeRescuePotentialSearchOptions {
  templates: readonly CubeRescueLocalTemplate[];
  primitiveWitness: readonly string[];
  sigma: -1 | 1;
  initialPotential?: CubeRescuePotential;
  bounds: CubeRescuePotentialSearchBounds;
}

function searchCubeRescuePeriodicPotentialInternal(
  options: CubeRescuePotentialSearchOptions,
  usePreparedData: boolean,
  materializeProvisional: boolean,
): CubeRescuePotentialSearchResult {
  if (options.templates.length === 0)
    throw new Error("A connector search needs a template.");
  for (const template of options.templates)
    validateCubeRescueLocalTemplate(template);
  if (new Set(options.templates.map((template) => template.rank)).size !== 1) {
    throw new Error("Connector templates do not use one character lattice.");
  }
  const bounds = options.bounds;
  for (const [name, value] of Object.entries(bounds)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${name} must be positive.`);
  }
  if (
    options.primitiveWitness.length !== options.templates[0].rank ||
    !isPrimitiveNonzero(options.primitiveWitness)
  ) {
    throw new Error(
      "The connector search requires a primitive nonzero witness.",
    );
  }
  const exactWeight = options.primitiveWitness.map(BigInt);
  const preparedTemplates = usePreparedData
    ? options.templates.map((template) =>
        prepareCubeRescueTemplate(template, exactWeight),
      )
    : undefined;
  const initialValues = new Map<number, bigint>();
  for (const [point, value] of options.initialPotential?.values ?? []) {
    if (
      point < 0 ||
      point >= options.templates[0].degree ||
      initialValues.has(point)
    ) {
      throw new Error("The initial periodic potential is not canonical.");
    }
    initialValues.set(point, exactInteger(value, "initial potential"));
  }
  let beam = [
    evaluateState({
      templates: options.templates,
      preparedTemplates,
      materializeProvisional,
      primitiveWitness: options.primitiveWitness,
      potential: initialValues,
      sigma: options.sigma,
    }),
  ];
  const initialScore = [...beam[0].score];
  let best = beam[0];
  const visited = new Set<string>([
    canonicalPotential(initialValues).potentialDigest,
  ]);
  let exploredStateCount = 1;
  let iterationCount = 0;
  for (
    ;
    iterationCount < bounds.maxIterations &&
    exploredStateCount < bounds.maxStates;
  ) {
    const passing = beam.find((state) => state.score[0] === 0);
    if (passing) {
      best = passing;
      break;
    }
    iterationCount += 1;
    const next: PotentialState[] = [];
    for (const state of beam) {
      const variables = candidateVariables(
        options.templates,
        state.evaluations,
        bounds.maxVariablesPerFailure,
      );
      for (const variable of variables) {
        const values = candidateValuesForVariable({
          variable,
          templates: options.templates,
          preparedTemplates,
          primitiveWitness: exactWeight,
          potential: state.values,
          sigma: options.sigma,
          maximumCount: bounds.maxCandidateValuesPerVariable,
          maximumAbsolute: BigInt(bounds.maxAbsolutePotential),
        });
        for (const value of values) {
          if (value === (state.values.get(variable) ?? 0n)) continue;
          const trial = new Map(state.values);
          if (value === 0n) trial.delete(variable);
          else trial.set(variable, value);
          const potentialDigest = canonicalPotential(trial).potentialDigest;
          if (visited.has(potentialDigest)) continue;
          visited.add(potentialDigest);
          const evaluated = evaluateState({
            templates: options.templates,
            preparedTemplates,
            materializeProvisional,
            primitiveWitness: options.primitiveWitness,
            potential: trial,
            sigma: options.sigma,
          });
          next.push(evaluated);
          exploredStateCount += 1;
          if (
            compareScore(evaluated.score, best.score) < 0 ||
            (compareScore(evaluated.score, best.score) === 0 &&
              evaluated.potentialDigest < best.potentialDigest)
          ) {
            best = evaluated;
          }
          if (
            evaluated.score[0] === 0 ||
            exploredStateCount >= bounds.maxStates
          )
            break;
        }
        if (best.score[0] === 0 || exploredStateCount >= bounds.maxStates)
          break;
      }
      if (best.score[0] === 0 || exploredStateCount >= bounds.maxStates) break;
    }
    if (best.score[0] === 0) break;
    if (next.length === 0) break;
    next.sort(
      (left, right) =>
        compareScore(left.score, right.score) ||
        left.potentialDigest.localeCompare(right.potentialDigest),
    );
    beam = next.slice(0, bounds.beamWidth);
  }
  const status =
    best.score[0] === 0 ? "connector-found" : "not-found-within-bounds";
  const materializedEvaluations = options.templates.map(
    (template, index) =>
      evaluateTemplateMaterialized({
        template,
        prepared: preparedTemplates?.[index],
        primitiveWitness: options.primitiveWitness,
        potential: best.values,
        sigma: options.sigma,
        validate: false,
      }).publicResult,
  );
  if (
    compareScore(scoreMaterialized(materializedEvaluations), best.score) !== 0
  ) {
    throw new Error(
      "The materialized best rescue state does not match its provisional score.",
    );
  }
  return sealPotentialSearchResult({
    schemaVersion: 2,
    kind: "bounded-exact-periodic-potential-connector-search",
    status,
    method: "separator-path-threshold-beam-search-v2-potential-digest-tiebreak",
    sigma: options.sigma,
    primitiveWitness: [...options.primitiveWitness],
    bounds: { ...bounds },
    exploredStateCount,
    iterationCount,
    initialScore,
    bestScore: [...best.score],
    potential: canonicalPotential(best.values),
    evaluations: materializedEvaluations,
    nonClaims: [
      "A not-found result exhausts only the recorded beam, potential bound, threshold candidates, witnesses, orders, and subdivision families.",
      "Version 2 orders equal-score provisional states by the canonical quotient-potential digest; provisional link data is not a public certificate record.",
      "A local connector is not a full Track-B certificate; every quotient point and every introduced subdivision vertex would still require exact link replay.",
      "Changing the quotient-periodic potential changes the cellular representative but not the underlying integral character.",
    ],
  });
}

export function searchCubeRescuePeriodicPotential(
  options: CubeRescuePotentialSearchOptions,
): CubeRescuePotentialSearchResult {
  return searchCubeRescuePeriodicPotentialInternal(options, true, false);
}

/** Exact reference path retained for optimization equivalence tests and benchmarks. */
export function searchCubeRescuePeriodicPotentialUnpreparedReference(
  options: CubeRescuePotentialSearchOptions,
): CubeRescuePotentialSearchResult {
  return searchCubeRescuePeriodicPotentialInternal(options, false, false);
}

/** Exact v2 reference that reproduces the discarded per-state public materialization cost. */
export function searchCubeRescuePeriodicPotentialMaterializedProvisionalReference(
  options: CubeRescuePotentialSearchOptions,
): CubeRescuePotentialSearchResult {
  return searchCubeRescuePeriodicPotentialInternal(options, true, true);
}
