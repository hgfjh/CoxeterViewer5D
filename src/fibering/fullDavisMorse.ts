import type { CoverCompressionResult } from "../compression";
import type {
  FullDavisQuotientCell,
  FullDavisQuotientCellPoset,
} from "../davis/fullQuotient";
import {
  checkSimplicialCollapsibility,
  verifyCollapsibilityCertificate,
  type CollapsibilityCertificateVerification,
  type CollapsibilitySearchOptions,
  type SimplicialCollapsibilityResult,
} from "../topology/collapsibility";
import { canonicalSha256 } from "../utils/canonicalSha256";
import type { WallHomomorphismFiniteCertificate } from "./types";
import type { PrimitiveSchreierHomomorphismCertificate } from "./schreierHomomorphism";
import type { PullingTriangulationCertificate } from "./pullingTriangulation";
import {
  addRationals,
  compareRationals,
  exactRational,
  subtractRationals,
  type ExactRational,
} from "./exactRational";

export interface CellLocalVertexHeight {
  vertexId: string;
  sourceQuotientVertexId: string;
  rawHeight: number;
  normalizedHeight: ExactRational;
  periodicOffset: ExactRational;
  perturbedHeight: ExactRational;
}

export interface CellLocalHeightChart {
  cellId: string;
  rootVertexId: string;
  vertexHeights: CellLocalVertexHeight[];
  integrationChecks: number;
  consistent: boolean;
  errors: string[];
}

export interface HeightOverlapCheck {
  faceCellId: string;
  cofaceCellId: string;
  additiveConstant: ExactRational;
  sharedVertexCount: number;
  passed: boolean;
}

export interface HeightEdgeSignCheck {
  edgeId: string;
  sourceVertexId: string;
  targetVertexId: string;
  rawCocycleValue: number;
  perturbedDifference: ExactRational;
  signPreserved: boolean;
}

export interface PrimitiveMorseHeightCertificate {
  schemaVersion: 1;
  kind: "primitive-morse-height-certificate";
  method: "cell-local-cocycle-integration-with-periodic-rational-offset";
  status: "passed" | "failed";
  normalizationDivisor: number;
  periodicOffsetDenominator: string;
  sourcePosetHash: string;
  sourceTriangulationHash: string;
  cellCharts: CellLocalHeightChart[];
  overlapChecks: HeightOverlapCheck[];
  edgeSignChecks: HeightEdgeSignCheck[];
  checks: {
    cocycleClosed: boolean;
    everyWallEdgeNonzero: boolean;
    primitiveSchreierImage: boolean;
    everyCellIntegrated: boolean;
    overlapDifferencesConstant: boolean;
    edgeSignsPreserved: boolean;
    simplexHeightsDistinct: boolean;
    quotientOffsetsPeriodic: boolean;
  };
  heightHashAlgorithm: "sha256";
  heightHash: string;
  errors: string[];
  nonClaims: string[];
}

export interface DirectedLinkComplex {
  kind: "ascending" | "descending";
  faceOccurrences: Array<{
    id: string;
    supportCellId: string;
    quotientVertexIds: string[];
  }>;
  /** Maximal simplices in the order-complex subdivision of the link. */
  maximalSimplices: string[][];
  components: string[][];
  nonempty: boolean;
  connected: boolean;
  collapsibility: SimplicialCollapsibilityResult;
  collapseCertificateVerification?: CollapsibilityCertificateVerification;
}

export interface FullVertexDirectedLinks {
  vertexId: string;
  sourceQuotientVertexId: string;
  ascending: DirectedLinkComplex;
  descending: DirectedLinkComplex;
}

export interface FullDirectedLinkCertificate {
  schemaVersion: 1;
  kind: "full-davis-directed-link-certificate";
  method: "full-subcomplexes-of-pulling-simplex-links";
  status: "passed" | "failed";
  sourcePosetHash: string;
  sourceTriangulationHash: string;
  sourceHeightHash: string;
  vertices: FullVertexDirectedLinks[];
  checks: {
    sourceHeightAndTriangulationPassed: boolean;
    everyVertexOrbitChecked: boolean;
    allAscendingNonempty: boolean;
    allDescendingNonempty: boolean;
    allAscendingConnected: boolean;
    allDescendingConnected: boolean;
    allCollapseCertificatesReplay: boolean;
  };
  collapsibilitySummary: {
    ascendingCollapsible: number;
    descendingCollapsible: number;
    ascendingProvenNonCollapsible: number;
    descendingProvenNonCollapsible: number;
    ascendingUnknown: number;
    descendingUnknown: number;
  };
  linksHashAlgorithm: "sha256";
  linksHash: string;
  errors: string[];
  nonClaims: string[];
}

/** Recompute the exact height artifact hash without using drawing data. */
export function computePrimitiveMorseHeightHash(
  certificate: Pick<
    PrimitiveMorseHeightCertificate,
    | "sourcePosetHash"
    | "sourceTriangulationHash"
    | "normalizationDivisor"
    | "periodicOffsetDenominator"
    | "cellCharts"
    | "overlapChecks"
    | "edgeSignChecks"
    | "checks"
    | "errors"
  >,
): string {
  return canonicalSha256({
    sourcePosetHash: certificate.sourcePosetHash,
    sourceTriangulationHash: certificate.sourceTriangulationHash,
    normalizationDivisor: certificate.normalizationDivisor,
    periodicOffsetDenominator: certificate.periodicOffsetDenominator,
    cells: certificate.cellCharts.map((chart) => ({
      cellId: chart.cellId,
      rootVertexId: chart.rootVertexId,
      heights: chart.vertexHeights.map((height) => ({
        vertexId: height.vertexId,
        rawHeight: height.rawHeight,
        perturbedHeight: height.perturbedHeight,
      })),
      integrationChecks: chart.integrationChecks,
      consistent: chart.consistent,
      errors: chart.errors,
    })),
    overlapChecks: certificate.overlapChecks,
    edgeSignChecks: certificate.edgeSignChecks,
    checks: certificate.checks,
    errors: certificate.errors,
  });
}

/** Recompute the hash of all full ascending and descending link complexes. */
export function computeFullDirectedLinksHash(
  certificate: Pick<
    FullDirectedLinkCertificate,
    | "sourcePosetHash"
    | "sourceTriangulationHash"
    | "sourceHeightHash"
    | "vertices"
  >,
): string {
  return canonicalSha256({
    sourcePosetHash: certificate.sourcePosetHash,
    sourceTriangulationHash: certificate.sourceTriangulationHash,
    sourceHeightHash: certificate.sourceHeightHash,
    vertices: certificate.vertices.map((vertex) => ({
      vertexId: vertex.vertexId,
      ascending: vertex.ascending.maximalSimplices,
      descending: vertex.descending.maximalSimplices,
      ascendingCollapsibility: vertex.ascending.collapsibility.status,
      descendingCollapsibility: vertex.descending.collapsibility.status,
    })),
  });
}

interface DirectedStep {
  edgeId: string;
  generator: number;
  sourceQuotientVertexId: string;
  targetQuotientVertexId: string;
  increment: number;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function simplexKey(simplex: readonly string[]): string {
  return JSON.stringify([...new Set(simplex)].sort(compareIds));
}

function isSubset(
  left: readonly string[],
  right: ReadonlySet<string>,
): boolean {
  return left.every((entry) => right.has(entry));
}

function maximalSimplices(simplices: readonly string[][]): string[][] {
  const unique = new Map<string, string[]>();
  for (const simplex of simplices) {
    const normalized = [...new Set(simplex)].sort(compareIds);
    if (normalized.length > 0) unique.set(simplexKey(normalized), normalized);
  }
  const values = [...unique.values()].sort(
    (left, right) =>
      right.length - left.length ||
      compareIds(simplexKey(left), simplexKey(right)),
  );
  const maximal: string[][] = [];
  for (const simplex of values) {
    if (!maximal.some((candidate) => isSubset(simplex, new Set(candidate)))) {
      maximal.push(simplex);
    }
  }
  return maximal.sort((left, right) =>
    compareIds(simplexKey(left), simplexKey(right)),
  );
}

function connectedComponents(simplices: readonly string[][]): string[][] {
  const vertices = [...new Set(simplices.flat())].sort(compareIds);
  const adjacency = new Map(
    vertices.map((vertex) => [vertex, new Set<string>()]),
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
  const components: string[][] = [];
  while (unseen.size > 0) {
    const root = [...unseen].sort(compareIds)[0];
    unseen.delete(root);
    const component = [root];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of adjacency.get(component[cursor]) ?? []) {
        if (unseen.delete(neighbor)) component.push(neighbor);
      }
    }
    components.push(component.sort(compareIds));
  }
  return components;
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_entry, entryIndex) => entryIndex !== index),
    ).map((tail) => [value, ...tail]),
  );
}

function sourceVertexMaps(poset: FullDavisQuotientCellPoset): {
  posetBySource: Map<string, string>;
  sourceByPoset: Map<string, string>;
} {
  const posetBySource = new Map<string, string>();
  const sourceByPoset = new Map<string, string>();
  for (const vertex of poset.vertices) {
    if (!vertex.sourceQuotientVertexId) {
      throw new Error(
        `Full Davis vertex ${vertex.id} has no source quotient vertex id.`,
      );
    }
    posetBySource.set(vertex.sourceQuotientVertexId, vertex.id);
    sourceByPoset.set(vertex.id, vertex.sourceQuotientVertexId);
  }
  return { posetBySource, sourceByPoset };
}

function buildDirectedSteps(
  poset: FullDavisQuotientCellPoset,
  cover: CoverCompressionResult,
  finiteWallCertificate: WallHomomorphismFiniteCertificate,
): DirectedStep[] {
  const { posetBySource } = sourceVertexMaps(poset);
  const hatVertexById = new Map(
    cover.hatX.vertices.map((vertex) => [vertex.id, vertex]),
  );
  const barVertexById = new Map(
    cover.barX.vertices.map((vertex) => [vertex.id, vertex]),
  );
  const barEdgeById = new Map(
    cover.barX.geometricEdges.map((edge) => [edge.id, edge]),
  );
  const valueByEdgeId = new Map(
    finiteWallCertificate.cocycle.edgeValues.map((value) => [
      value.edgeId,
      value.value,
    ]),
  );
  const steps: DirectedStep[] = [];
  for (const directed of cover.hatX.directedLiftEdges) {
    const source = hatVertexById.get(directed.sourceVertexId);
    const target = hatVertexById.get(directed.targetVertexId);
    const barEdgeId = cover.compressionMap.directedEdgeImages[directed.id];
    const barEdge = barEdgeById.get(barEdgeId);
    const rawValue = valueByEdgeId.get(barEdgeId);
    if (!source || !target || !barEdge || rawValue === undefined) {
      throw new Error(`Cannot evaluate lifted generator step ${directed.id}.`);
    }
    const storedSource = barVertexById.get(
      barEdge.sourceVertexId,
    )?.sourceQuotientVertexId;
    const traversal = storedSource === source.sourceQuotientVertexId ? 1 : -1;
    if (
      !posetBySource.has(source.sourceQuotientVertexId) ||
      !posetBySource.has(target.sourceQuotientVertexId)
    ) {
      throw new Error(
        `Lifted generator step ${directed.id} is absent from the Davis quotient.`,
      );
    }
    steps.push({
      edgeId: barEdgeId,
      generator: directed.generator,
      sourceQuotientVertexId: source.sourceQuotientVertexId,
      targetQuotientVertexId: target.sourceQuotientVertexId,
      increment: traversal * rawValue,
    });
  }
  return steps.sort(
    (left, right) =>
      compareIds(left.sourceQuotientVertexId, right.sourceQuotientVertexId) ||
      left.generator - right.generator,
  );
}

function chartHeightMap(
  chart: CellLocalHeightChart,
): Map<string, ExactRational> {
  return new Map(
    chart.vertexHeights.map((entry) => [entry.vertexId, entry.perturbedHeight]),
  );
}

/**
 * Integrate the wall cocycle separately on every contractible Coxeter cell.
 * A nontrivial character cannot be represented by one real potential on the
 * finite quotient; chart potentials agree on overlaps up to constants and
 * therefore define the same equivariant height on the universal cover.
 */
export function buildPrimitiveMorseHeightCertificate(input: {
  poset: FullDavisQuotientCellPoset;
  triangulation: PullingTriangulationCertificate;
  cover: CoverCompressionResult;
  finiteWallCertificate: WallHomomorphismFiniteCertificate;
  primitiveHomomorphism: PrimitiveSchreierHomomorphismCertificate;
}): PrimitiveMorseHeightCertificate {
  const {
    poset,
    triangulation,
    cover,
    finiteWallCertificate,
    primitiveHomomorphism,
  } = input;
  const errors: string[] = [];
  const divisor = primitiveHomomorphism.normalizationDivisor ?? 0;
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    errors.push(
      "The primitive Schreier certificate has no positive safe normalization divisor.",
    );
  }
  const safeDivisor = divisor > 0 ? divisor : 1;
  const quotientVertexCount = poset.vertices.length;
  const offsetDenominator =
    BigInt(4 * Math.max(1, quotientVertexCount)) * BigInt(safeDivisor);
  const rankByVertex = new Map(
    triangulation.vertexOrder.map((vertexId, index) => [vertexId, index]),
  );
  const { posetBySource, sourceByPoset } = sourceVertexMaps(poset);
  let steps: DirectedStep[] = [];
  try {
    steps = buildDirectedSteps(poset, cover, finiteWallCertificate);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const stepBySourceGenerator = new Map(
    steps.map((step) => [
      `${step.sourceQuotientVertexId}\u0000${step.generator}`,
      step,
    ]),
  );

  const cellCharts: CellLocalHeightChart[] = [];
  for (const cell of poset.cells) {
    const chartErrors: string[] = [];
    const allowed = new Set(cell.vertexIds);
    const rootVertexId = [...cell.vertexIds].sort(
      (left, right) =>
        (rankByVertex.get(left) ?? 0) - (rankByVertex.get(right) ?? 0),
    )[0];
    const raw = new Map<string, number>([[rootVertexId, 0]]);
    const queue = [rootVertexId];
    let integrationChecks = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const sourceVertexId = queue[cursor];
      const sourceId = sourceByPoset.get(sourceVertexId)!;
      for (const generator of cell.generators) {
        const step = stepBySourceGenerator.get(`${sourceId}\u0000${generator}`);
        if (!step) {
          chartErrors.push(
            `Missing generator ${generator} step from ${sourceId}.`,
          );
          continue;
        }
        const targetVertexId = posetBySource.get(step.targetQuotientVertexId)!;
        if (!allowed.has(targetVertexId)) {
          chartErrors.push(
            `Generator ${generator} leaves Davis cell ${cell.id}.`,
          );
          continue;
        }
        const expected = raw.get(sourceVertexId)! + step.increment;
        const existing = raw.get(targetVertexId);
        integrationChecks += 1;
        if (existing === undefined) {
          raw.set(targetVertexId, expected);
          queue.push(targetVertexId);
        } else if (existing !== expected) {
          chartErrors.push(
            `Cocycle integration in ${cell.id} gives both ${existing} and ${expected} at ${targetVertexId}.`,
          );
        }
      }
    }
    if (raw.size !== cell.vertexIds.length) {
      chartErrors.push(
        `Cocycle integration reached ${raw.size}/${cell.vertexIds.length} vertices of ${cell.id}.`,
      );
    }
    const vertexHeights = [...cell.vertexIds]
      .sort(
        (left, right) =>
          (rankByVertex.get(left) ?? 0) - (rankByVertex.get(right) ?? 0),
      )
      .map((vertexId) => {
        const rawHeight = raw.get(vertexId) ?? 0;
        const normalizedHeight = exactRational(rawHeight, safeDivisor);
        const periodicOffset = exactRational(
          rankByVertex.get(vertexId) ?? 0,
          offsetDenominator,
        );
        return {
          vertexId,
          sourceQuotientVertexId: sourceByPoset.get(vertexId)!,
          rawHeight,
          normalizedHeight,
          periodicOffset,
          perturbedHeight: addRationals(normalizedHeight, periodicOffset),
        };
      });
    cellCharts.push({
      cellId: cell.id,
      rootVertexId,
      vertexHeights,
      integrationChecks,
      consistent: chartErrors.length === 0,
      errors: chartErrors,
    });
    errors.push(...chartErrors);
  }
  cellCharts.sort((left, right) => compareIds(left.cellId, right.cellId));
  const chartByCellId = new Map(
    cellCharts.map((chart) => [chart.cellId, chart]),
  );

  const overlapChecks: HeightOverlapCheck[] = [];
  for (const incidence of poset.faceIncidences) {
    const face = chartByCellId.get(incidence.faceCellId);
    const coface = chartByCellId.get(incidence.cofaceCellId);
    if (!face || !coface) continue;
    const faceHeights = chartHeightMap(face);
    const cofaceHeights = chartHeightMap(coface);
    const shared = [...faceHeights.keys()].filter((vertexId) =>
      cofaceHeights.has(vertexId),
    );
    const additiveConstant =
      shared.length > 0
        ? subtractRationals(
            cofaceHeights.get(shared[0])!,
            faceHeights.get(shared[0])!,
          )
        : exactRational(0);
    const passed =
      shared.length === face.vertexHeights.length &&
      shared.every(
        (vertexId) =>
          compareRationals(
            subtractRationals(
              cofaceHeights.get(vertexId)!,
              faceHeights.get(vertexId)!,
            ),
            additiveConstant,
          ) === 0,
      );
    if (!passed)
      errors.push(
        `Height charts disagree non-constantly on ${incidence.faceCellId}.`,
      );
    overlapChecks.push({
      faceCellId: incidence.faceCellId,
      cofaceCellId: incidence.cofaceCellId,
      additiveConstant,
      sharedVertexCount: shared.length,
      passed,
    });
  }

  const rankOneCellByEndpoints = new Map<string, FullDavisQuotientCell>();
  for (const cell of poset.cells.filter((entry) => entry.dimension === 1)) {
    const endpoints = [...cell.vertexIds].sort(compareIds);
    rankOneCellByEndpoints.set(
      `${cell.generators[0]}\u0000${endpoints.join("\u0000")}`,
      cell,
    );
  }
  const edgeSignChecks: HeightEdgeSignCheck[] = [];
  const edgeValueById = new Map(
    finiteWallCertificate.cocycle.edgeValues.map((entry) => [
      entry.edgeId,
      entry,
    ]),
  );
  for (const edge of cover.barX.geometricEdges) {
    const sourceId = cover.barX.vertices.find(
      (vertex) => vertex.id === edge.sourceVertexId,
    )?.sourceQuotientVertexId;
    const targetId = cover.barX.vertices.find(
      (vertex) => vertex.id === edge.targetVertexId,
    )?.sourceQuotientVertexId;
    const sourceVertexId = sourceId ? posetBySource.get(sourceId) : undefined;
    const targetVertexId = targetId ? posetBySource.get(targetId) : undefined;
    const value = edgeValueById.get(edge.id)?.value;
    if (!sourceVertexId || !targetVertexId || value === undefined) {
      errors.push(`Cannot check the height sign on wall edge ${edge.id}.`);
      continue;
    }
    const endpoints = [sourceVertexId, targetVertexId].sort(compareIds);
    const oneCell = rankOneCellByEndpoints.get(
      `${edge.generator}\u0000${endpoints.join("\u0000")}`,
    );
    const chart = oneCell ? chartByCellId.get(oneCell.id) : undefined;
    const heights = chart ? chartHeightMap(chart) : undefined;
    if (!heights) {
      errors.push(`No rank-one height chart represents wall edge ${edge.id}.`);
      continue;
    }
    const difference = subtractRationals(
      heights.get(targetVertexId)!,
      heights.get(sourceVertexId)!,
    );
    const signPreserved =
      compareRationals(difference, exactRational(0)) === (value > 0 ? 1 : -1);
    if (!signPreserved)
      errors.push(`The rational perturbation reverses wall edge ${edge.id}.`);
    edgeSignChecks.push({
      edgeId: edge.id,
      sourceVertexId,
      targetVertexId,
      rawCocycleValue: value,
      perturbedDifference: difference,
      signPreserved,
    });
  }

  let simplexHeightsDistinct = true;
  for (const cellTriangulation of triangulation.cellTriangulations) {
    const chart = chartByCellId.get(cellTriangulation.cellId);
    if (!chart) continue;
    const heights = chartHeightMap(chart);
    for (const simplex of cellTriangulation.maximalSimplices) {
      for (let left = 0; left < simplex.length; left += 1) {
        for (let right = left + 1; right < simplex.length; right += 1) {
          if (
            compareRationals(
              heights.get(simplex[left])!,
              heights.get(simplex[right])!,
            ) === 0
          ) {
            simplexHeightsDistinct = false;
            errors.push(
              `Pulling simplex in ${cellTriangulation.cellId} has equal perturbed vertex heights.`,
            );
          }
        }
      }
    }
  }

  const checks = {
    cocycleClosed: finiteWallCertificate.cocycle.closed,
    everyWallEdgeNonzero:
      finiteWallCertificate.cocycle.edgeValues.length ===
        cover.barX.geometricEdges.length &&
      finiteWallCertificate.cocycle.edgeValues.every(
        (entry) => entry.value !== 0,
      ),
    primitiveSchreierImage:
      primitiveHomomorphism.status === "passed" &&
      primitiveHomomorphism.primitiveImage,
    everyCellIntegrated:
      cellCharts.length === poset.cells.length &&
      cellCharts.every((chart) => chart.consistent),
    overlapDifferencesConstant: overlapChecks.every((check) => check.passed),
    edgeSignsPreserved:
      edgeSignChecks.length === cover.barX.geometricEdges.length &&
      edgeSignChecks.every((check) => check.signPreserved),
    simplexHeightsDistinct,
    quotientOffsetsPeriodic:
      new Set(poset.vertices.map((vertex) => vertex.id)).size ===
      quotientVertexCount,
  };
  if (!Object.values(checks).every(Boolean)) {
    errors.push("At least one primitive PL-height check failed.");
  }
  const result: PrimitiveMorseHeightCertificate = {
    schemaVersion: 1,
    kind: "primitive-morse-height-certificate",
    method: "cell-local-cocycle-integration-with-periodic-rational-offset",
    status:
      errors.length === 0 && Object.values(checks).every(Boolean)
        ? "passed"
        : "failed",
    normalizationDivisor: safeDivisor,
    periodicOffsetDenominator: offsetDenominator.toString(),
    sourcePosetHash: poset.posetHash,
    sourceTriangulationHash: triangulation.triangulationHash,
    cellCharts,
    overlapChecks,
    edgeSignChecks,
    checks,
    heightHashAlgorithm: "sha256",
    heightHash: "",
    errors: [...new Set(errors)].sort(compareIds),
    nonClaims: [
      "The real heights are cell-local lifts. Their reductions modulo Z define the finite quotient circle map; a single-valued real potential downstairs would force the character to be trivial.",
      "The rational offsets are quotient-periodic tie breakers. They do not change the character or reverse a generator edge.",
      "Affine extension is made on the certified abstract simplices; no metric embedding is inferred.",
    ],
  };
  result.heightHash = computePrimitiveMorseHeightHash(result);
  return result;
}

function buildOneDirectedLink(
  kind: "ascending" | "descending",
  vertexId: string,
  poset: FullDavisQuotientCellPoset,
  maximalCellTriangulations: PullingTriangulationCertificate["cellTriangulations"],
  chartByCellId: ReadonlyMap<string, CellLocalHeightChart>,
  collapseOptions: CollapsibilitySearchOptions,
): DirectedLinkComplex {
  const directedOccurrences: Array<{
    ambientCell: FullDavisQuotientCell;
    quotientVertexIds: string[];
  }> = [];
  const cellById = new Map(poset.cells.map((cell) => [cell.id, cell]));
  for (const triangulation of maximalCellTriangulations) {
    const chart = chartByCellId.get(triangulation.cellId);
    const ambientCell = cellById.get(triangulation.cellId);
    if (!chart || !ambientCell) continue;
    const heightByVertex = chartHeightMap(chart);
    const selectedHeight = heightByVertex.get(vertexId);
    if (!selectedHeight) continue;
    for (const simplex of triangulation.maximalSimplices) {
      if (!simplex.includes(vertexId)) continue;
      const directedVertices = simplex.filter((otherVertexId) => {
        if (otherVertexId === vertexId) return false;
        const comparison = compareRationals(
          heightByVertex.get(otherVertexId)!,
          selectedHeight,
        );
        return kind === "ascending" ? comparison > 0 : comparison < 0;
      });
      if (directedVertices.length > 0) {
        directedOccurrences.push({
          ambientCell,
          quotientVertexIds: directedVertices,
        });
      }
    }
  }

  const faceOccurrences = new Map<
    string,
    { id: string; supportCellId: string; quotientVertexIds: string[] }
  >();
  const chains: string[][] = [];
  for (const occurrence of directedOccurrences) {
    for (const ordering of permutations(occurrence.quotientVertexIds)) {
      const chain: string[] = [];
      for (let length = 1; length <= ordering.length; length += 1) {
        const quotientVertexIds = ordering.slice(0, length).sort(compareIds);
        const requiredVertices = new Set([vertexId, ...quotientVertexIds]);
        const support = [
          occurrence.ambientCell,
          ...occurrence.ambientCell.properFaceCellIds
            .map((cellId) => cellById.get(cellId))
            .filter(
              (cell): cell is FullDavisQuotientCell => cell !== undefined,
            ),
        ]
          .filter((cell) =>
            [...requiredVertices].every((required) =>
              cell.vertexIds.includes(required),
            ),
          )
          .sort(
            (left, right) =>
              left.dimension - right.dimension || compareIds(left.id, right.id),
          )[0];
        if (!support) {
          throw new Error(
            `No supporting face contains a directed pulling face at ${vertexId} in ${occurrence.ambientCell.id}.`,
          );
        }
        const faceId = `link-face:${support.id}:${vertexId}:${quotientVertexIds.join(",")}`;
        faceOccurrences.set(faceId, {
          id: faceId,
          supportCellId: support.id,
          quotientVertexIds,
        });
        chain.push(faceId);
      }
      chains.push(chain);
    }
  }
  // The order complex is an honest abstract simplicial complex even when the
  // quotient has parallel edges or distinct cells with the same vertex set.
  const simplices = maximalSimplices(chains);
  const components = connectedComponents(simplices);
  const collapsibility = checkSimplicialCollapsibility(
    { simplices },
    collapseOptions,
  );
  const certificate =
    "certificate" in collapsibility ? collapsibility.certificate : undefined;
  const collapseCertificateVerification = certificate
    ? verifyCollapsibilityCertificate({ simplices }, certificate)
    : undefined;
  return {
    kind,
    faceOccurrences: [...faceOccurrences.values()].sort((left, right) =>
      compareIds(left.id, right.id),
    ),
    maximalSimplices: simplices,
    components,
    nonempty: simplices.length > 0,
    connected: components.length === 1,
    collapsibility,
    ...(collapseCertificateVerification
      ? { collapseCertificateVerification }
      : {}),
  };
}

/** Build full ascending and descending links at every quotient vertex orbit. */
export function buildFullDirectedLinkCertificate(input: {
  poset: FullDavisQuotientCellPoset;
  triangulation: PullingTriangulationCertificate;
  height: PrimitiveMorseHeightCertificate;
  collapsibilityOptions?: CollapsibilitySearchOptions;
}): FullDirectedLinkCertificate {
  const { poset, triangulation, height } = input;
  const sourceEvidenceValid =
    height.status === "passed" &&
    Object.values(height.checks).every(Boolean) &&
    height.sourcePosetHash === poset.posetHash &&
    height.sourceTriangulationHash === triangulation.triangulationHash &&
    triangulation.status === "passed" &&
    triangulation.sourcePosetHash === poset.posetHash;
  const collapseOptions = input.collapsibilityOptions ?? {
    maxStates: 25_000,
    maxTransitions: 250_000,
    maxMilliseconds: 1_000,
  };
  const chartByCellId = new Map(
    height.cellCharts.map((chart) => [chart.cellId, chart]),
  );
  const maximalCellSet = new Set(triangulation.maximalCellIds);
  const maximalCellTriangulations = triangulation.cellTriangulations.filter(
    (entry) => maximalCellSet.has(entry.cellId),
  );
  const vertices = poset.vertices.map((vertex) => ({
    vertexId: vertex.id,
    sourceQuotientVertexId: vertex.sourceQuotientVertexId ?? vertex.label,
    ascending: buildOneDirectedLink(
      "ascending",
      vertex.id,
      poset,
      maximalCellTriangulations,
      chartByCellId,
      collapseOptions,
    ),
    descending: buildOneDirectedLink(
      "descending",
      vertex.id,
      poset,
      maximalCellTriangulations,
      chartByCellId,
      collapseOptions,
    ),
  }));
  const everyCollapseCertificateReplays = vertices.every((vertex) =>
    [vertex.ascending, vertex.descending].every(
      (link) =>
        !link.collapseCertificateVerification ||
        link.collapseCertificateVerification.valid,
    ),
  );
  const checks = {
    sourceHeightAndTriangulationPassed: sourceEvidenceValid,
    everyVertexOrbitChecked: vertices.length === poset.vertices.length,
    allAscendingNonempty: vertices.every((vertex) => vertex.ascending.nonempty),
    allDescendingNonempty: vertices.every(
      (vertex) => vertex.descending.nonempty,
    ),
    allAscendingConnected: vertices.every(
      (vertex) => vertex.ascending.connected,
    ),
    allDescendingConnected: vertices.every(
      (vertex) => vertex.descending.connected,
    ),
    allCollapseCertificatesReplay: everyCollapseCertificateReplays,
  };
  const errors: string[] = [];
  if (!sourceEvidenceValid) {
    errors.push(
      "Directed links cannot certify PL Morse data because the full-cell height or pulling triangulation did not replay.",
    );
  }
  for (const vertex of vertices) {
    if (!vertex.ascending.nonempty)
      errors.push(`Ascending link at ${vertex.vertexId} is empty.`);
    else if (!vertex.ascending.connected)
      errors.push(`Ascending link at ${vertex.vertexId} is disconnected.`);
    if (!vertex.descending.nonempty)
      errors.push(`Descending link at ${vertex.vertexId} is empty.`);
    else if (!vertex.descending.connected)
      errors.push(`Descending link at ${vertex.vertexId} is disconnected.`);
    for (const link of [vertex.ascending, vertex.descending]) {
      if (
        link.collapseCertificateVerification &&
        !link.collapseCertificateVerification.valid
      ) {
        errors.push(
          `${link.kind} collapse certificate at ${vertex.vertexId} does not replay.`,
        );
      }
    }
  }
  const count = (
    kind: "ascending" | "descending",
    status: SimplicialCollapsibilityResult["status"],
  ): number =>
    vertices.filter((vertex) => vertex[kind].collapsibility.status === status)
      .length;
  const collapsibilitySummary = {
    ascendingCollapsible: count("ascending", "collapsible"),
    descendingCollapsible: count("descending", "collapsible"),
    ascendingProvenNonCollapsible: count("ascending", "proven-not-collapsible"),
    descendingProvenNonCollapsible: count(
      "descending",
      "proven-not-collapsible",
    ),
    ascendingUnknown: count("ascending", "unknown-budget"),
    descendingUnknown: count("descending", "unknown-budget"),
  };
  const result: FullDirectedLinkCertificate = {
    schemaVersion: 1,
    kind: "full-davis-directed-link-certificate",
    method: "full-subcomplexes-of-pulling-simplex-links",
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    sourcePosetHash: poset.posetHash,
    sourceTriangulationHash: triangulation.triangulationHash,
    sourceHeightHash: height.heightHash,
    vertices,
    checks,
    collapsibilitySummary,
    linksHashAlgorithm: "sha256",
    linksHash: "",
    errors: [...new Set(errors)].sort(compareIds),
    nonClaims: [
      "Nonempty connected ascending and descending links certify finite generation of the primitive character kernel under the stated PL Morse hypotheses.",
      "Collapsibility is a stronger combinatorial diagnostic. It implies a topological or smooth fibration only when separate compact-manifold, dimension, PL, and smoothing hypotheses are certified.",
      "A budget-exhausted collapse search is reported as unknown, never as noncollapsible.",
    ],
  };
  result.linksHash = computeFullDirectedLinksHash(result);
  return result;
}
