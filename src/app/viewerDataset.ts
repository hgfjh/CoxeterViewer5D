import type {
  CoxeterGeneratorInput,
  CoxeterSystemInput,
  DavisHigherCell,
  GeneratedCayleyBall,
} from "../types";
import type { QuotientComplex } from "../quotient";
import { enumerateSphericalSubsets } from "../davis";

export type ViewerDataset =
  | {
      kind: "coxeter-system";
      id: string;
      label: string;
      system: CoxeterSystemInput;
    }
  | {
      kind: "generated-graph";
      id: string;
      label: string;
      ball: GeneratedCayleyBall;
      sourceSystem?: CoxeterSystemInput;
    }
  | {
      kind: "quotient-complex";
      id: string;
      label: string;
      quotient: QuotientComplex;
      ball: GeneratedCayleyBall;
      sourceSystem?: CoxeterSystemInput;
    };

const fallbackColors = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#d97706",
  "#0891b2",
  "#be123c",
  "#4f46e5",
];

export function syntheticSystemForGeneratedBall(
  ball: GeneratedCayleyBall,
): CoxeterSystemInput {
  return {
    schemaVersion: 1,
    name: ball.systemName,
    description:
      "Synthetic Coxeter-system shell for a generated graph import. The original Coxeter matrix was not supplied.",
    rank: ball.rank,
    generators: syntheticGenerators(ball.rank),
    coxeterMatrix: Array.from({ length: ball.rank }, (_, row) =>
      Array.from({ length: ball.rank }, (_unused, column) =>
        row === column ? 1 : 2,
      ),
    ),
    warnings: [
      "Generated graph import did not include a source Coxeter system; local-link and spherical-subset mathematics are disabled.",
    ],
  };
}

export function syntheticSystemForQuotient(
  quotient: QuotientComplex,
): CoxeterSystemInput {
  const rank =
    quotient.sourceSystem?.rank ??
    quotient.generatorRank ??
    (Math.max(-1, ...quotient.edges.map((edge) => edge.generator)) + 1 || 1);
  return {
    schemaVersion: 1,
    name: quotient.name,
    description:
      "Synthetic Coxeter-system shell for rendering a quotient complex.",
    rank,
    generators: syntheticGenerators(rank),
    coxeterMatrix: Array.from({ length: rank }, (_, row) =>
      Array.from({ length: rank }, (_unused, column) =>
        row === column ? 1 : 2,
      ),
    ),
    warnings: quotient.warnings,
  };
}

export function quotientToGeneratedBall(
  quotient: QuotientComplex,
): GeneratedCayleyBall {
  const rank =
    quotient.sourceSystem?.rank ??
    quotient.generatorRank ??
    (Math.max(-1, ...quotient.edges.map((edge) => edge.generator)) + 1 || 1);
  return {
    systemName: quotient.name,
    rank,
    nodes: quotient.vertices.map((vertex, index) => ({
      id: vertex.id,
      word: vertex.representativeWord ?? [],
      length: vertex.representativeWord?.length ?? 0,
      position: circularPosition(index, quotient.vertices.length),
    })),
    edges: quotient.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      generator: edge.generator,
    })),
    twoCells: quotient.twoCells.map((cell) => ({
      id: cell.id,
      generatorPair: cell.generatorPair,
      m: cell.m,
      boundaryNodeIds: cell.boundaryVertexIds,
    })),
    higherCells: quotient.higherCells,
    metadata: {
      radius: 0,
      requestedRadius: 0,
      generatorConvention: "right-multiplication",
      deduplication: "exact",
      caps: {
        maxRadius: 0,
        maxNodes: quotient.vertices.length,
        maxEdges: quotient.edges.length,
      },
      createdAt: new Date(0).toISOString(),
      warnings: [
        "Quotient complex rendering is separate from the universal Cayley ball.",
        ...(quotient.sourceSystem
          ? [
              `Source Coxeter system "${quotient.sourceSystem.name}" is preserved for labels and relation checks.`,
            ]
          : []),
      ],
    },
  };
}

export function baseOrbicomplexForSystem(
  system: CoxeterSystemInput,
): QuotientComplex {
  const vertexId = "*";
  const edgeId = (generator: number) => `Y:edge:${generator}`;
  const finitePairCells = finiteGeneratorPairs(system).map(([i, j]) => {
    const m = system.coxeterMatrix[i][j];
    if (typeof m !== "number") {
      throw new Error("finiteGeneratorPairs returned a non-finite pair.");
    }
    return {
      id: `Y:cell:${i}-${j}`,
      generatorPair: [i, j] as [number, number],
      m,
      boundaryVertexIds: Array.from({ length: 2 * m }, () => vertexId),
      boundaryEdgeIds: Array.from({ length: 2 * m }, (_unused, index) =>
        edgeId(index % 2 === 0 ? i : j),
      ),
    };
  });
  const rankTwoCellIdsByPair = new Map(
    finitePairCells.map((cell) => [pairKey(cell.generatorPair), cell.id]),
  );
  const spherical = enumerateSphericalSubsets(system, {
    maxRankForExhaustiveEnumeration: 12,
  });
  const higherCells: DavisHigherCell[] = spherical.subsets
    .filter((subset) => subset.rank >= 3)
    .map((subset) => ({
      id: `Y:higher:${subset.generators.join("-")}`,
      sphericalSubsetId: subset.id,
      generators: subset.generators,
      rank: subset.rank,
      nodeIds: [vertexId],
      complete: true,
      source: "imported-exact-coset",
      incidence: {
        vertexNodeIds: [vertexId],
        edgeIds: subset.generators.map(edgeId),
        rankTwoCellIds: finiteGeneratorPairsForSubset(system, subset.generators)
          .map((pair) => rankTwoCellIdsByPair.get(pairKey(pair)))
          .filter((id): id is string => id !== undefined),
      },
      rendering: {
        kind: "visual-proxy",
        proxy: true,
        note: "Y_Gamma higher cells are recorded as quotient incidence data; the rendered hull is a readability proxy.",
      },
    }));

  return {
    schemaVersion: 1,
    name: `Y_Gamma(${system.name})`,
    sourceSystem: system,
    generatorRank: system.rank,
    permutationAction: system.generators.map((_generator, index) => ({
      generator: index,
      images: { [vertexId]: vertexId },
    })),
    vertices: [{ id: vertexId, label: "base vertex", representativeWord: [] }],
    edges: system.generators.map((generator, index) => ({
      id: edgeId(index),
      source: vertexId,
      target: vertexId,
      generator: index,
      inverseEdgeId: edgeId(index),
      label: generator.label,
    })),
    twoCells: finitePairCells,
    higherCells,
    game: {
      activeAssignmentId: "zero-generators",
      activeCocycleId: "zero-cocycle",
      assignments: [
        {
          id: "zero-generators",
          label: "Zero generator labels",
          kind: "integer-generator-labeling",
          generatorStates: system.generators.map((_generator, index) => ({
            generator: index,
            value: 0,
          })),
          notes: [
            "Default exploratory labeling for Y_Gamma; replace with a certified cocycle for PL Morse claims.",
          ],
        },
      ],
      cocycles: [
        {
          id: "zero-cocycle",
          label: "Zero cocycle",
          assignmentId: "zero-generators",
          coefficientRing: "Z",
          notes: ["Boundary sums vanish tautologically for the zero labeling."],
        },
      ],
      notes: [
        "Y_Gamma is a fundamental-domain cell complex with oriented generator arrows; it is not a torsion-free manifold cover.",
      ],
    },
    warnings: [
      "Y_Gamma is modeled as a fundamental-domain cell complex with one base vertex and oriented generator arrows.",
      "The internal quotient edge references keep source and target at the base vertex for validation, but the primary drawing shows arrows rather than literal loops.",
      "The 3D scene for Y_Gamma draws singular relation sheets glued to the generator arrows, not an affine coordinate realization.",
      "Use the Y_Gamma cell atlas for the affine/polytope-complex incidence data.",
      ...spherical.warnings,
    ],
  };
}

function syntheticGenerators(rank: number): CoxeterGeneratorInput[] {
  return Array.from({ length: rank }, (_unused, index) => ({
    id: `s${index}`,
    label: `s${index}`,
    colorHint: fallbackColors[index % fallbackColors.length],
  }));
}

function finiteGeneratorPairs(
  system: CoxeterSystemInput,
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < system.rank; i += 1) {
    for (let j = i + 1; j < system.rank; j += 1) {
      if (typeof system.coxeterMatrix[i]?.[j] === "number") {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

function finiteGeneratorPairsForSubset(
  system: CoxeterSystemInput,
  generators: number[],
): Array<[number, number]> {
  const generatorSet = new Set(generators);
  return finiteGeneratorPairs(system).filter(
    ([i, j]) => generatorSet.has(i) && generatorSet.has(j),
  );
}

function pairKey(pair: [number, number]) {
  return `${pair[0]}-${pair[1]}`;
}

function circularPosition(
  index: number,
  count: number,
): [number, number, number] {
  if (count <= 1) {
    return [0, 0, 0];
  }
  const angle = (2 * Math.PI * index) / count;
  return [Math.cos(angle) * 1.8, Math.sin(angle) * 1.8, 0];
}
