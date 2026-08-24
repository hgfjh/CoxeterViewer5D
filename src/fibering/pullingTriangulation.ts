import type {
  FullDavisQuotientCell,
  FullDavisQuotientCellPoset,
} from "../davis/fullQuotient";
import { canonicalSha256 } from "../utils/canonicalSha256";

export interface PullingCellTriangulation {
  cellId: string;
  dimension: number;
  apexVertexId: string;
  maximalSimplices: string[][];
  maximalSimplexIds: string[];
}

export interface PullingFaceCompatibilityCheck {
  faceCellId: string;
  cofaceCellId: string;
  expectedSimplexIds: string[];
  inducedSimplexIds: string[];
  passed: boolean;
}

export interface PullingTriangulationCertificate {
  schemaVersion: 1;
  kind: "compatible-pulling-triangulation-certificate";
  method: "global-vertex-order-recursive-pulling";
  status: "passed" | "failed";
  sourcePosetHash: string;
  vertexOrder: string[];
  cellTriangulations: PullingCellTriangulation[];
  maximalCellIds: string[];
  maximalSimplices: string[][];
  faceCompatibilityChecks: PullingFaceCompatibilityCheck[];
  checks: {
    globalOrderTotal: boolean;
    everyCellTriangulated: boolean;
    simplexDimensionsCorrect: boolean;
    simplicesUseCellVertices: boolean;
    sharedFacesCompatible: boolean;
  };
  triangulationHashAlgorithm: "sha256";
  triangulationHash: string;
  errors: string[];
  nonClaims: string[];
}

/** Recompute the content hash carried by a pulling-triangulation artifact. */
export function computePullingTriangulationHash(
  certificate: Pick<
    PullingTriangulationCertificate,
    "sourcePosetHash" | "vertexOrder" | "cellTriangulations"
  >,
): string {
  return canonicalSha256({
    sourcePosetHash: certificate.sourcePosetHash,
    vertexOrder: certificate.vertexOrder,
    cells: certificate.cellTriangulations.map((entry) => ({
      cellId: entry.cellId,
      dimension: entry.dimension,
      apexVertexId: entry.apexVertexId,
      maximalSimplexIds: entry.maximalSimplexIds,
    })),
  });
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function simplexId(vertexIds: readonly string[]): string {
  const vertices = [...new Set(vertexIds)].sort(compareIds);
  return `pull:${vertices.length - 1}:${JSON.stringify(vertices)}`;
}

function deduplicateSimplices(simplices: readonly string[][]): string[][] {
  const byId = new Map<string, string[]>();
  for (const simplex of simplices) {
    byId.set(simplexId(simplex), [...simplex]);
  }
  return [...byId.entries()]
    .sort(([left], [right]) => compareIds(left, right))
    .map(([, simplex]) => simplex);
}

function sortedSimplexIds(simplices: readonly string[][]): string[] {
  return simplices.map(simplexId).sort(compareIds);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function maximalCellIds(poset: FullDavisQuotientCellPoset): string[] {
  return poset.cells
    .filter((cell) => cell.properCofaceCellIds.length === 0)
    .map((cell) => cell.id)
    .sort(compareIds);
}

/**
 * Triangulate every Coxeter cell by pulling from one global quotient-vertex
 * order. The recursive construction is made on the face poset itself, so a
 * shared face is represented by one cached triangulation rather than two
 * independently chosen diagonals.
 */
export function buildCompatiblePullingTriangulation(
  poset: FullDavisQuotientCellPoset,
): PullingTriangulationCertificate {
  const errors: string[] = [];
  const vertexOrder = [...poset.vertices]
    .sort(
      (left, right) =>
        left.actionPoint - right.actionPoint || compareIds(left.id, right.id),
    )
    .map((vertex) => vertex.id);
  const vertexRank = new Map(
    vertexOrder.map((vertexId, index) => [vertexId, index]),
  );
  const cellById = new Map(poset.cells.map((cell) => [cell.id, cell]));
  const cache = new Map<string, PullingCellTriangulation>();

  const compareVertices = (left: string, right: string): number =>
    (vertexRank.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (vertexRank.get(right) ?? Number.MAX_SAFE_INTEGER) ||
    compareIds(left, right);

  const triangulate = (
    cell: FullDavisQuotientCell,
  ): PullingCellTriangulation => {
    const cached = cache.get(cell.id);
    if (cached) return cached;

    const vertices = [...cell.vertexIds].sort(compareVertices);
    if (vertices.length === 0) {
      throw new Error(`Davis cell ${cell.id} has no vertices.`);
    }
    const apexVertexId = vertices[0];
    let maximalSimplices: string[][];
    if (cell.dimension === 0) {
      maximalSimplices = [[apexVertexId]];
    } else {
      const oppositeFacets = cell.facetCellIds
        .map((facetId) => cellById.get(facetId))
        .filter(
          (facet): facet is FullDavisQuotientCell =>
            facet !== undefined && !facet.vertexIds.includes(apexVertexId),
        );
      if (oppositeFacets.length === 0) {
        throw new Error(
          `Davis cell ${cell.id} has no facet opposite its pulled vertex ${apexVertexId}.`,
        );
      }
      maximalSimplices = deduplicateSimplices(
        oppositeFacets.flatMap((facet) =>
          triangulate(facet).maximalSimplices.map((simplex) => [
            apexVertexId,
            ...simplex,
          ]),
        ),
      );
    }

    const result: PullingCellTriangulation = {
      cellId: cell.id,
      dimension: cell.dimension,
      apexVertexId,
      maximalSimplices,
      maximalSimplexIds: sortedSimplexIds(maximalSimplices),
    };
    cache.set(cell.id, result);
    return result;
  };

  for (const cell of poset.cells) {
    try {
      triangulate(cell);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const cellTriangulations = [...cache.values()].sort((left, right) =>
    compareIds(left.cellId, right.cellId),
  );
  let simplexDimensionsCorrect = true;
  let simplicesUseCellVertices = true;
  for (const triangulation of cellTriangulations) {
    const cell = cellById.get(triangulation.cellId)!;
    const allowed = new Set(cell.vertexIds);
    for (const simplex of triangulation.maximalSimplices) {
      if (
        simplex.length !== cell.dimension + 1 ||
        new Set(simplex).size !== simplex.length
      ) {
        simplexDimensionsCorrect = false;
        errors.push(
          `Pulling simplex ${simplexId(simplex)} has the wrong dimension in ${cell.id}.`,
        );
      }
      if (simplex.some((vertexId) => !allowed.has(vertexId))) {
        simplicesUseCellVertices = false;
        errors.push(
          `Pulling simplex ${simplexId(simplex)} uses a vertex outside ${cell.id}.`,
        );
      }
    }
  }

  const faceCompatibilityChecks: PullingFaceCompatibilityCheck[] = [];
  for (const incidence of poset.faceIncidences) {
    const face = cellById.get(incidence.faceCellId);
    const cofaceTriangulation = cache.get(incidence.cofaceCellId);
    const faceTriangulation = cache.get(incidence.faceCellId);
    if (!face || !cofaceTriangulation || !faceTriangulation) continue;
    const faceVertices = new Set(face.vertexIds);
    const induced = deduplicateSimplices(
      cofaceTriangulation.maximalSimplices
        .map((simplex) =>
          simplex.filter((vertexId) => faceVertices.has(vertexId)),
        )
        .filter((simplex) => simplex.length === face.dimension + 1),
    );
    const expectedSimplexIds = [...faceTriangulation.maximalSimplexIds];
    const inducedSimplexIds = sortedSimplexIds(induced);
    const passed = sameStrings(expectedSimplexIds, inducedSimplexIds);
    if (!passed) {
      errors.push(
        `The triangulation induced by ${incidence.cofaceCellId} on ${incidence.faceCellId} does not match the global pulling triangulation.`,
      );
    }
    faceCompatibilityChecks.push({
      faceCellId: incidence.faceCellId,
      cofaceCellId: incidence.cofaceCellId,
      expectedSimplexIds,
      inducedSimplexIds,
      passed,
    });
  }

  const topCellIds = maximalCellIds(poset);
  // Distinct quotient cells can have the same vertex set. Their simplex
  // occurrences remain distinct even though their vertex arrays agree.
  const maximalSimplices = topCellIds.flatMap(
    (cellId) =>
      cache.get(cellId)?.maximalSimplices.map((simplex) => [...simplex]) ?? [],
  );
  const checks = {
    globalOrderTotal:
      vertexOrder.length === poset.vertices.length &&
      new Set(vertexOrder).size === vertexOrder.length,
    everyCellTriangulated: cache.size === poset.cells.length,
    simplexDimensionsCorrect,
    simplicesUseCellVertices,
    sharedFacesCompatible: faceCompatibilityChecks.every(
      (check) => check.passed,
    ),
  };
  if (!Object.values(checks).every(Boolean)) {
    errors.push("At least one compatible pulling-triangulation check failed.");
  }
  const result: PullingTriangulationCertificate = {
    schemaVersion: 1,
    kind: "compatible-pulling-triangulation-certificate",
    method: "global-vertex-order-recursive-pulling",
    status:
      errors.length === 0 && Object.values(checks).every(Boolean)
        ? "passed"
        : "failed",
    sourcePosetHash: poset.posetHash,
    vertexOrder,
    cellTriangulations,
    maximalCellIds: topCellIds,
    maximalSimplices,
    faceCompatibilityChecks,
    checks,
    triangulationHashAlgorithm: "sha256",
    triangulationHash: "",
    errors: [...new Set(errors)].sort(compareIds),
    nonClaims: [
      "The pulling triangulation is exact combinatorial subdivision data; it is not a Euclidean or hyperbolic embedding of the Coxeter cells.",
    ],
  };
  result.triangulationHash = computePullingTriangulationHash(result);
  return result;
}

export function pullingSimplexId(vertexIds: readonly string[]): string {
  return simplexId(vertexIds);
}
