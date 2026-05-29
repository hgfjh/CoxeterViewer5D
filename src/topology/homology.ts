import type { LocalLink } from "../davis";

export interface SimplicialComplexInput {
  vertices: string[];
  simplices: string[][];
}

export interface LocalLinkHomologySummary {
  coefficientField: "F2";
  vertexCount: number;
  edgeCount: number;
  triangleCount: number;
  connectedComponents: number;
  reducedBetti0: number;
  betti1: number;
  warnings: string[];
}

function simplexKey(simplex: string[]): string {
  return [...simplex].sort().join(",");
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }
  if (items.length < size) {
    return [];
  }

  const [first, ...rest] = items;
  return [
    ...combinations(rest, size - 1).map((entry) => [first, ...entry]),
    ...combinations(rest, size),
  ];
}

function addFaces(
  simplex: string[],
  vertices: Set<string>,
  edges: Set<string>,
  triangles: Set<string>,
) {
  const normalized = [...new Set(simplex)].sort();
  if (normalized.length === 0) {
    return;
  }

  for (const vertex of normalized) {
    vertices.add(vertex);
  }

  for (const edge of combinations(normalized, 2)) {
    edges.add(simplexKey(edge));
  }

  for (const triangle of combinations(normalized, 3)) {
    triangles.add(simplexKey(triangle));
  }
}

function rankF2(rows: number[][]): number {
  const matrix = rows.map((row) => row.map((entry) => entry & 1));
  if (matrix.length === 0) {
    return 0;
  }

  const columnCount = matrix[0].length;
  let rank = 0;
  for (let column = 0; column < columnCount; column += 1) {
    const pivot = matrix.findIndex(
      (row, index) => index >= rank && row[column] === 1,
    );
    if (pivot === -1) {
      continue;
    }

    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    for (let row = 0; row < matrix.length; row += 1) {
      if (row !== rank && matrix[row][column] === 1) {
        for (let c = column; c < columnCount; c += 1) {
          matrix[row][c] ^= matrix[rank][c];
        }
      }
    }
    rank += 1;
  }

  return rank;
}

function countComponents(vertices: string[], edges: string[][]): number {
  const parent = new Map(vertices.map((vertex) => [vertex, vertex]));

  const find = (vertex: string): string => {
    const next = parent.get(vertex);
    if (next === undefined || next === vertex) {
      return vertex;
    }
    const root = find(next);
    parent.set(vertex, root);
    return root;
  };

  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  };

  for (const [left, right] of edges) {
    union(left, right);
  }

  return new Set(vertices.map((vertex) => find(vertex))).size;
}

export function computeF2HomologySummary(
  input: SimplicialComplexInput,
): LocalLinkHomologySummary {
  const warnings: string[] = [];
  const vertices = new Set(input.vertices);
  const edges = new Set<string>();
  const triangles = new Set<string>();

  for (const simplex of input.simplices) {
    if (simplex.length !== new Set(simplex).size) {
      warnings.push(
        `Simplex ${simplex.join(",")} repeats a vertex and was deduplicated.`,
      );
    }
    addFaces(simplex, vertices, edges, triangles);
  }

  const vertexList = [...vertices].sort();
  const edgeList = [...edges].sort().map((edge) => edge.split(","));
  const triangleList = [...triangles]
    .sort()
    .map((triangle) => triangle.split(","));
  const vertexToIndex = new Map(
    vertexList.map((vertex, index) => [vertex, index]),
  );
  const edgeToIndex = new Map(
    edgeList.map((edge, index) => [simplexKey(edge), index]),
  );

  const d1Rows = vertexList.map(() => Array(edgeList.length).fill(0));
  edgeList.forEach((edge, column) => {
    for (const vertex of edge) {
      const row = vertexToIndex.get(vertex);
      if (row !== undefined) {
        d1Rows[row][column] = 1;
      }
    }
  });

  const d2Rows = edgeList.map(() => Array(triangleList.length).fill(0));
  triangleList.forEach((triangle, column) => {
    for (const edge of combinations(triangle, 2)) {
      const row = edgeToIndex.get(simplexKey(edge));
      if (row !== undefined) {
        d2Rows[row][column] = 1;
      }
    }
  });

  const rankD1 = rankF2(d1Rows);
  const rankD2 = rankF2(d2Rows);
  const components =
    vertexList.length === 0 ? 0 : countComponents(vertexList, edgeList);

  return {
    coefficientField: "F2",
    vertexCount: vertexList.length,
    edgeCount: edgeList.length,
    triangleCount: triangleList.length,
    connectedComponents: components,
    reducedBetti0: Math.max(0, components - 1),
    betti1: Math.max(0, edgeList.length - rankD1 - rankD2),
    warnings,
  };
}

export function computeLocalLinkHomology(
  localLink: LocalLink,
): LocalLinkHomologySummary {
  return computeF2HomologySummary({
    vertices: localLink.vertices.map((vertex) => String(vertex.generator)),
    simplices: localLink.simplices.map((simplex) =>
      simplex.generators.map((generator) => String(generator)),
    ),
  });
}
