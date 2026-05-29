import {
  enumerateSphericalSubsets,
  type SphericalSubset,
  type SphericalSubsetEnumerationResult,
} from "../davis";
import type { CoxeterSystemInput } from "../types";
import type { QuotientComplex } from "../quotient";
import { pairKey, polygonLabelForM } from "./localView";

export type YGammaCellKind =
  | "base-vertex"
  | "generator-arrow"
  | "rank-two-relation"
  | "higher-spherical-cell";

export interface YGammaCellRecord {
  id: string;
  kind: YGammaCellKind;
  rank: number;
  dimension: number;
  generators: number[];
  generatorLabels: string[];
  label: string;
  description: string;
  attachingWord: string[];
  rankTwoFaceIds: string[];
  m?: number;
  boundaryLength?: number;
  polygonLabel?: string;
  subgroupOrder?: number;
  subgroupOrderStatus?: SphericalSubset["subgroupOrderStatus"];
}

export interface YGammaAtlasRankGroup {
  rank: number;
  label: string;
  cells: YGammaCellRecord[];
}

export interface YGammaCellAtlas {
  systemName: string;
  generatorCount: number;
  baseVertex: YGammaCellRecord;
  generatorCells: YGammaCellRecord[];
  rankTwoCells: YGammaCellRecord[];
  higherCells: YGammaCellRecord[];
  rankGroups: YGammaAtlasRankGroup[];
  nerveVertices: string[];
  nerveSimplexCount: number;
  warnings: string[];
  labelLegend: Array<{ token: string; meaning: string }>;
}

export function buildYGammaCellAtlas(
  system: CoxeterSystemInput,
  sphericalSubsets?: SphericalSubsetEnumerationResult,
): YGammaCellAtlas {
  const spherical =
    sphericalSubsets ??
    enumerateSphericalSubsets(system, {
      maxRankForExhaustiveEnumeration: 12,
    });
  const baseVertex: YGammaCellRecord = {
    id: "Y:vertex:*",
    kind: "base-vertex",
    rank: 0,
    dimension: 0,
    generators: [],
    generatorLabels: [],
    label: "*",
    description:
      "The single quotient vertex. It is not a chamber vertex of the universal Davis complex.",
    attachingWord: [],
    rankTwoFaceIds: [],
  };
  const generatorCells = system.generators.map((generator, index) => ({
    id: `Y:arrow:${index}`,
    kind: "generator-arrow" as const,
    rank: 1,
    dimension: 1,
    generators: [index],
    generatorLabels: [generator.label],
    label: generator.label,
    description:
      "An oriented generator arrow in the fundamental-domain model. Its target side is identified by the corresponding relation data; it is not drawn as a literal loop.",
    attachingWord: [generator.label],
    rankTwoFaceIds: [],
    subgroupOrder: 2,
    subgroupOrderStatus: "computed" as const,
  }));
  const rankTwoCells = finiteGeneratorPairs(system).map(([left, right]) => {
    const m = system.coxeterMatrix[left][right];
    if (typeof m !== "number") {
      throw new Error("finiteGeneratorPairs returned a non-finite pair.");
    }
    const labels = [
      system.generators[left]?.label ?? `s${left}`,
      system.generators[right]?.label ?? `s${right}`,
    ];
    return {
      id: `Y:cell:${left}-${right}`,
      kind: "rank-two-relation" as const,
      rank: 2,
      dimension: 2,
      generators: [left, right],
      generatorLabels: labels,
      label: labels.join("-"),
      description: `The relation cell for (${labels[0]} ${labels[1]})^${m}=1. Its boundary is a ${polygonLabelForM(m)} attached by alternating oriented generator arrows.`,
      attachingWord: alternatingWord(labels, 2 * m),
      rankTwoFaceIds: [],
      m,
      boundaryLength: 2 * m,
      polygonLabel: polygonLabelForM(m),
      subgroupOrder: 2 * m,
      subgroupOrderStatus: "computed" as const,
    };
  });
  const rankTwoIdsByPair = new Map(
    rankTwoCells.map((cell) => [
      pairKey(cell.generators as [number, number]),
      cell.id,
    ]),
  );
  const higherCells = spherical.subsets
    .filter((subset) => subset.rank >= 3)
    .map((subset) => ({
      id: `Y:higher:${subset.generators.join("-")}`,
      kind: "higher-spherical-cell" as const,
      rank: subset.rank,
      dimension: subset.rank,
      generators: subset.generators,
      generatorLabels: subset.generatorLabels,
      label: subset.generatorLabels.join("-"),
      description:
        "A higher spherical Coxeter cell recorded by its face incidence. The viewer may draw a proxy hull, but this atlas is the combinatorial data.",
      attachingWord: [],
      rankTwoFaceIds: finitePairsInSubset(system, subset.generators)
        .map((pair) => rankTwoIdsByPair.get(pairKey(pair)))
        .filter((id): id is string => id !== undefined),
      subgroupOrder: subset.subgroupOrder,
      subgroupOrderStatus: subset.subgroupOrderStatus,
    }));
  const rankGroups = groupByRank([
    baseVertex,
    ...generatorCells,
    ...rankTwoCells,
    ...higherCells,
  ]);

  return {
    systemName: system.name,
    generatorCount: system.rank,
    baseVertex,
    generatorCells,
    rankTwoCells,
    higherCells,
    rankGroups,
    nerveVertices: system.generators.map((generator) => generator.label),
    nerveSimplexCount: spherical.subsets.length,
    warnings: [
      "The Y_Gamma atlas is combinatorial face data for the fundamental-domain cell complex.",
      "Generator 1-cells are drawn as oriented arrows, not literal geometric loops.",
      "The 3D 2-skeleton draws relation faces as singular sheets glued to generator arrows; it is not an affine coordinate realization.",
      ...spherical.warnings,
    ],
    labelLegend: [
      {
        token: "*",
        meaning: "The base vertex/chamber of the fundamental-domain model.",
      },
      {
        token: "s_i or generator label",
        meaning:
          "A Coxeter generator/facet label and the oriented arrow leaving the base vertex.",
      },
      {
        token: "0: *, 1: *, ...",
        meaning:
          "A boundary step in a relation cell attaching map. These are not distinct affine vertices.",
      },
      {
        token: "Y:cell:i-j",
        meaning:
          "The rank-two relation cell for the finite dihedral subgroup <s_i, s_j>.",
      },
    ],
  };
}

export function isYGammaBaseComplex(
  quotient: QuotientComplex | undefined,
): boolean {
  if (!quotient) {
    return false;
  }
  return (
    quotient.name.startsWith("Y_Gamma(") &&
    quotient.vertices.length === 1 &&
    quotient.edges.every((edge) => edge.source === edge.target)
  );
}

function finiteGeneratorPairs(
  system: CoxeterSystemInput,
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      if (typeof system.coxeterMatrix[left]?.[right] === "number") {
        pairs.push([left, right]);
      }
    }
  }
  return pairs;
}

function finitePairsInSubset(
  system: CoxeterSystemInput,
  generators: number[],
): Array<[number, number]> {
  const generatorSet = new Set(generators);
  return finiteGeneratorPairs(system).filter(
    ([left, right]) => generatorSet.has(left) && generatorSet.has(right),
  );
}

function alternatingWord(labels: string[], length: number): string[] {
  return Array.from({ length }, (_unused, index) => labels[index % 2]);
}

function groupByRank(cells: YGammaCellRecord[]): YGammaAtlasRankGroup[] {
  const groups = new Map<number, YGammaCellRecord[]>();
  for (const cell of cells) {
    groups.set(cell.rank, [...(groups.get(cell.rank) ?? []), cell]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rank, rankCells]) => ({
      rank,
      label: rank === 0 ? "base vertex" : `rank ${rank}`,
      cells: rankCells.sort(compareCells),
    }));
}

function compareCells(left: YGammaCellRecord, right: YGammaCellRecord): number {
  const byKind = left.kind.localeCompare(right.kind);
  if (byKind !== 0) {
    return byKind;
  }
  return left.label.localeCompare(right.label);
}
