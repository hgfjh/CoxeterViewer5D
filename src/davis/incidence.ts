import type {
  CertificateSummary,
  CayleyEdge,
  DavisCellIncidenceRecord,
  DavisHigherCell,
  DavisIncidencePoset,
  DavisTwoCell,
  GeneratedCayleyBall,
  LocalLinkHomologySummary,
} from "../types";
import type { LocalLink, SphericalSubset } from "./sphericalSubsets";

export interface DavisIncidenceOptions {
  certificate?: CertificateSummary;
  includeRankTwo?: boolean;
  localLinks?: LocalLink[];
}

export function deriveDavisIncidencePoset(
  ball: GeneratedCayleyBall,
  sphericalSubsets: SphericalSubset[],
  options: DavisIncidenceOptions = {},
): DavisIncidencePoset {
  const records: DavisCellIncidenceRecord[] = [];
  const warnings: string[] = [];
  const subsetById = new Map(
    sphericalSubsets.map((subset) => [subset.id, subset]),
  );

  if (options.includeRankTwo ?? true) {
    for (const cell of ball.twoCells) {
      records.push(rankTwoRecord(cell, ball.edges));
    }
  }

  for (const cell of ball.higherCells ?? []) {
    const subset = subsetById.get(cell.sphericalSubsetId);
    records.push(higherCellRecord(cell, subset));
  }

  const clipped = records.some((record) => record.clipped);
  if (records.length === 0) {
    warnings.push("No Davis incidence records were derived for this ball.");
  }
  if (clipped) {
    warnings.push(
      "Some Davis incidence records are clipped by the finite Cayley ball.",
    );
  }

  return {
    status:
      records.length === 0
        ? "not-computed"
        : clipped
          ? "clipped"
          : "complete-in-ball",
    records: records.sort((left, right) => left.id.localeCompare(right.id)),
    localLinks: options.localLinks?.map((link) => localLinkHomology(link)),
    certificate: options.certificate,
    warnings,
  };
}

export function localLinkHomology(
  localLink: LocalLink,
): LocalLinkHomologySummary {
  const simplices = localLink.simplices
    .map((simplex) =>
      [...simplex.generators].sort((left, right) => left - right),
    )
    .filter((simplex) => simplex.length > 0);
  const vertices = new Set(
    localLink.vertices.map((vertex) => vertex.generator),
  );
  for (const simplex of simplices) {
    for (const generator of simplex) {
      vertices.add(generator);
    }
  }

  const simplexKeysByDimension = new Map<number, string[]>();
  for (const generator of vertices) {
    pushSimplex(simplexKeysByDimension, 0, keyOf([generator]));
  }
  for (const simplex of simplices) {
    pushSimplex(simplexKeysByDimension, simplex.length - 1, keyOf(simplex));
  }

  const dimensions = [...simplexKeysByDimension.keys()].sort(
    (left, right) => left - right,
  );
  const simplexCountByDimension = Object.fromEntries(
    dimensions.map((dimension) => [
      String(dimension),
      new Set(simplexKeysByDimension.get(dimension)).size,
    ]),
  );

  const boundaryRanks = new Map<number, number>();
  for (const dimension of dimensions.filter((entry) => entry > 0)) {
    boundaryRanks.set(
      dimension,
      boundaryRank(
        unique(simplexKeysByDimension.get(dimension) ?? []),
        unique(simplexKeysByDimension.get(dimension - 1) ?? []),
      ),
    );
  }

  const bettiNumbers: Record<string, number> = {};
  for (const dimension of dimensions) {
    const chains = unique(simplexKeysByDimension.get(dimension) ?? []).length;
    const boundaryOut = boundaryRanks.get(dimension) ?? 0;
    const boundaryIn = boundaryRanks.get(dimension + 1) ?? 0;
    bettiNumbers[String(dimension)] = Math.max(
      0,
      chains - boundaryOut - boundaryIn,
    );
  }

  return {
    nodeId: localLink.nodeId,
    coefficientRing: "F2",
    simplexCountByDimension,
    bettiNumbers,
    warnings: localLink.warnings,
  };
}

function rankTwoRecord(
  cell: DavisTwoCell,
  edges: CayleyEdge[],
): DavisCellIncidenceRecord {
  return {
    id: `incidence:${cell.id}`,
    dimension: 2,
    rank: 2,
    generators: cell.generatorPair,
    cosetRepresentativeNodeId: minId(cell.boundaryNodeIds),
    vertexNodeIds: [...cell.boundaryNodeIds],
    edgeIds: boundaryEdgeIds(cell, edges),
    rankTwoCellIds: [cell.id],
    faceCellIds: [],
    clipped: false,
    renderingStatus: "exact-incidence",
  };
}

function higherCellRecord(
  cell: DavisHigherCell,
  subset: SphericalSubset | undefined,
): DavisCellIncidenceRecord {
  const subgroupMismatch =
    cell.coset?.subgroupSizeStatus !== undefined &&
    cell.coset.subgroupSizeStatus !== "matches";
  return {
    id: `incidence:${cell.id}`,
    dimension: Math.max(0, cell.rank),
    rank: cell.rank,
    sphericalSubsetId: cell.sphericalSubsetId,
    generators: [...cell.generators],
    cosetRepresentativeNodeId:
      cell.coset?.representativeNodeId ?? minId(cell.nodeIds),
    vertexNodeIds: cell.incidence?.vertexNodeIds ?? [...cell.nodeIds],
    edgeIds: cell.incidence?.edgeIds ?? [],
    rankTwoCellIds: cell.incidence?.rankTwoCellIds ?? [],
    faceCellIds: cell.incidence?.rankTwoCellIds ?? [],
    expectedSubgroupOrder:
      cell.coset?.expectedSubgroupOrder ?? subset?.subgroupOrder,
    clipped: !cell.complete || subgroupMismatch,
    renderingStatus: cell.rendering?.kind ?? "visual-proxy",
  };
}

function boundaryEdgeIds(cell: DavisTwoCell, edges: CayleyEdge[]): string[] {
  const ids: string[] = [];
  const edgeKeyToId = new Map<string, string>();
  for (const edge of edges) {
    edgeKeyToId.set(undirectedEdgeKey(edge.source, edge.target), edge.id);
  }
  for (let index = 0; index < cell.boundaryNodeIds.length; index += 1) {
    const source = cell.boundaryNodeIds[index];
    const target =
      cell.boundaryNodeIds[(index + 1) % cell.boundaryNodeIds.length];
    const id = edgeKeyToId.get(undirectedEdgeKey(source, target));
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return ids.sort();
}

function boundaryRank(domainKeys: string[], codomainKeys: string[]): number {
  const rowIndex = new Map(codomainKeys.map((key, index) => [key, index]));
  const columns = domainKeys.map((key) => {
    const simplex = key.split(",").map(Number);
    const rows: number[] = [];
    for (let index = 0; index < simplex.length; index += 1) {
      const face = simplex.filter((_, faceIndex) => faceIndex !== index);
      const row = rowIndex.get(keyOf(face));
      if (row !== undefined) {
        rows.push(row);
      }
    }
    return rows;
  });

  return gf2Rank(columns, codomainKeys.length);
}

function gf2Rank(columns: number[][], rowCount: number): number {
  const rows = Array.from({ length: rowCount }, () => 0n);
  columns.forEach((column, columnIndex) => {
    const bit = 1n << BigInt(columnIndex);
    for (const row of column) {
      rows[row] ^= bit;
    }
  });

  let rank = 0;
  for (let column = columns.length - 1; column >= 0; column -= 1) {
    const pivot = rows.findIndex(
      (row, index) => index >= rank && ((row >> BigInt(column)) & 1n) === 1n,
    );
    if (pivot < 0) {
      continue;
    }
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let row = 0; row < rows.length; row += 1) {
      if (row !== rank && ((rows[row] >> BigInt(column)) & 1n) === 1n) {
        rows[row] ^= rows[rank];
      }
    }
    rank += 1;
  }
  return rank;
}

function pushSimplex(
  byDimension: Map<number, string[]>,
  dimension: number,
  key: string,
) {
  byDimension.set(dimension, [...(byDimension.get(dimension) ?? []), key]);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function keyOf(simplex: number[]): string {
  return [...simplex].sort((left, right) => left - right).join(",");
}

function minId(ids: string[]): string {
  return [...ids].sort()[0] ?? "";
}

function undirectedEdgeKey(left: string, right: string): string {
  return [left, right].sort().join("--");
}
