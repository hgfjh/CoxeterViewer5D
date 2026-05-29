export interface FiniteSimplicialComplex {
  vertices: string[];
  simplices: string[][];
  simplexKeys: string[];
  simplexCountByDimension: Record<string, number>;
  maximalSimplices: string[][];
  warnings: string[];
}

export interface MissingFlagSimplex {
  vertices: string[];
  dimension: number;
}

export interface LinkConditionDiagnostics {
  condition: "flag-link";
  status: "passes" | "fails" | "not-checked";
  checkedCliqueSize: number;
  missingFlagSimplices: MissingFlagSimplex[];
  warnings: string[];
}

export interface TopologyDiagnosticSummary {
  vertexCount: number;
  simplexCountByDimension: Record<string, number>;
  maximalSimplexDimensions: number[];
  linkCondition: LinkConditionDiagnostics;
  warnings: string[];
}

export interface FiniteSimplicialComplexInput {
  vertices?: string[];
  simplices: string[][];
}

export interface LinkConditionOptions {
  maxCliqueSize?: number;
}

function simplexKey(simplex: string[]): string {
  return [...simplex].sort().join(",");
}

function normalizeSimplex(simplex: string[]): string[] {
  return [...new Set(simplex.map(String))].sort();
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

function compareSimplex(left: string[], right: string[]): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }
  for (let index = 0; index < left.length; index += 1) {
    const comparison = left[index].localeCompare(right[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

function addSimplexAndFaces(
  simplex: string[],
  simplices: Map<string, string[]>,
) {
  for (let size = 1; size <= simplex.length; size += 1) {
    for (const face of combinations(simplex, size)) {
      simplices.set(simplexKey(face), face);
    }
  }
}

function maximalSimplices(simplices: string[][]): string[][] {
  return simplices.filter(
    (candidate) =>
      !simplices.some(
        (other) =>
          other.length > candidate.length &&
          candidate.every((vertex) => other.includes(vertex)),
      ),
  );
}

function simplexCounts(simplices: string[][]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const simplex of simplices) {
    const dimension = simplex.length - 1;
    counts[String(dimension)] = (counts[String(dimension)] ?? 0) + 1;
  }
  return counts;
}

export function createFiniteSimplicialComplex(
  input: FiniteSimplicialComplexInput,
): FiniteSimplicialComplex {
  const warnings: string[] = [];
  const vertices = new Set((input.vertices ?? []).map(String));
  const simplices = new Map<string, string[]>();

  for (const simplex of input.simplices) {
    const normalized = normalizeSimplex(simplex);
    if (normalized.length !== simplex.length) {
      warnings.push(
        `Simplex ${simplex.join(",")} repeats a vertex and was deduplicated.`,
      );
    }
    if (normalized.length === 0) {
      continue;
    }
    normalized.forEach((vertex) => vertices.add(vertex));
    addSimplexAndFaces(normalized, simplices);
  }

  for (const vertex of vertices) {
    simplices.set(vertex, [vertex]);
  }

  const simplexList = [...simplices.values()].sort(compareSimplex);
  return {
    vertices: [...vertices].sort(),
    simplices: simplexList,
    simplexKeys: simplexList.map(simplexKey),
    simplexCountByDimension: simplexCounts(simplexList),
    maximalSimplices: maximalSimplices(simplexList).sort(compareSimplex),
    warnings,
  };
}

function oneSkeletonEdges(complex: FiniteSimplicialComplex): Set<string> {
  return new Set(
    complex.simplices
      .filter((simplex) => simplex.length === 2)
      .map((simplex) => simplexKey(simplex)),
  );
}

function isClique(vertices: string[], edges: Set<string>): boolean {
  return combinations(vertices, 2).every((edge) => edges.has(simplexKey(edge)));
}

export function diagnoseFlagLinkCondition(
  complex: FiniteSimplicialComplex,
  options: LinkConditionOptions = {},
): LinkConditionDiagnostics {
  const maxCliqueSize = options.maxCliqueSize ?? complex.vertices.length;
  if (maxCliqueSize < 2) {
    return {
      condition: "flag-link",
      status: "not-checked",
      checkedCliqueSize: maxCliqueSize,
      missingFlagSimplices: [],
      warnings: ["Flag-link diagnostics require clique size at least 2."],
    };
  }

  const edges = oneSkeletonEdges(complex);
  const simplexKeys = new Set(complex.simplexKeys);
  const missingFlagSimplices: MissingFlagSimplex[] = [];
  const largestCliqueSize = Math.min(maxCliqueSize, complex.vertices.length);

  // For a Coxeter/Davis local link, the flag condition says every complete
  // graph in the 1-skeleton must already be filled by a simplex.
  for (let size = 3; size <= largestCliqueSize; size += 1) {
    for (const candidate of combinations(complex.vertices, size)) {
      if (
        isClique(candidate, edges) &&
        !simplexKeys.has(simplexKey(candidate))
      ) {
        missingFlagSimplices.push({
          vertices: candidate,
          dimension: candidate.length - 1,
        });
      }
    }
  }

  return {
    condition: "flag-link",
    status: missingFlagSimplices.length === 0 ? "passes" : "fails",
    checkedCliqueSize: largestCliqueSize,
    missingFlagSimplices,
    warnings: [...complex.warnings],
  };
}

export function summarizeTopologyDiagnostics(
  complex: FiniteSimplicialComplex,
  options: LinkConditionOptions = {},
): TopologyDiagnosticSummary {
  const linkCondition = diagnoseFlagLinkCondition(complex, options);
  return {
    vertexCount: complex.vertices.length,
    simplexCountByDimension: complex.simplexCountByDimension,
    maximalSimplexDimensions: [
      ...new Set(complex.maximalSimplices.map((simplex) => simplex.length - 1)),
    ].sort((left, right) => left - right),
    linkCondition,
    warnings: [...new Set([...complex.warnings, ...linkCondition.warnings])],
  };
}
