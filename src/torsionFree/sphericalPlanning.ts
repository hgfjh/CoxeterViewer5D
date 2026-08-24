import { parseCoxeterSystemInput } from "../coxeter";
import type { CoxeterMatrixEntry, CoxeterSystemInput } from "../types";
import {
  exactIntegerToBigInt,
  factorial,
  leastCommonMultiple,
  toExactIntegerValue,
} from "./arithmetic";
import type {
  FiniteCoxeterComponentType,
  SphericalComponentPlan,
  SphericalEnumerationLimits,
  SphericalSpecialSubgroupPlan,
  SphericalSubsetPlan,
  TorsionFreeIndexLowerBound,
} from "./types";

const DEFAULT_MAX_EXHAUSTIVE_RANK = 16;
const DEFAULT_MAX_SUBSETS = 65_535;
const DEFAULT_PARTIAL_SUBSET_RANK = 2;

interface ClassifiedComponent {
  type: FiniteCoxeterComponentType;
  order: bigint;
}

function finiteComponentOrder(
  type: FiniteCoxeterComponentType,
  rank: number,
  dihedralM?: number,
): bigint {
  if (type === "A1") {
    return 2n;
  }
  if (type.startsWith("A")) {
    return factorial(rank + 1);
  }
  if (type.startsWith("B")) {
    return 2n ** BigInt(rank) * factorial(rank);
  }
  if (type.startsWith("D")) {
    return 2n ** BigInt(rank - 1) * factorial(rank);
  }
  if (type === "E6") {
    return 51_840n;
  }
  if (type === "E7") {
    return 2_903_040n;
  }
  if (type === "E8") {
    return 696_729_600n;
  }
  if (type === "F4") {
    return 1_152n;
  }
  if (type === "H3") {
    return 120n;
  }
  if (type === "H4") {
    return 14_400n;
  }
  if (dihedralM === undefined) {
    throw new Error(`Missing m for finite Coxeter type ${type}.`);
  }
  return 2n * BigInt(dihedralM);
}

function nonCommutingNeighbors(
  system: CoxeterSystemInput,
  generators: number[],
): Map<number, number[]> {
  const neighbors = new Map<number, number[]>(
    generators.map((generator) => [generator, []]),
  );
  for (let leftIndex = 0; leftIndex < generators.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < generators.length;
      rightIndex += 1
    ) {
      const left = generators[leftIndex];
      const right = generators[rightIndex];
      if (system.coxeterMatrix[left][right] !== 2) {
        neighbors.get(left)?.push(right);
        neighbors.get(right)?.push(left);
      }
    }
  }
  return neighbors;
}

function connectedComponents(
  system: CoxeterSystemInput,
  generators: number[],
): number[][] {
  const neighbors = nonCommutingNeighbors(system, generators);
  const unseen = new Set(generators);
  const components: number[][] = [];

  while (unseen.size > 0) {
    const start = Math.min(...unseen);
    const component: number[] = [];
    const queue = [start];
    unseen.delete(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (unseen.delete(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
    components.push(component.sort((left, right) => left - right));
  }

  return components.sort((left, right) => left[0] - right[0]);
}

function edgeLabel(
  system: CoxeterSystemInput,
  left: number,
  right: number,
): CoxeterMatrixEntry {
  return system.coxeterMatrix[left][right];
}

function orderedPath(
  neighbors: Map<number, number[]>,
  generators: number[],
): number[] | undefined {
  const edgeCount =
    [...neighbors.values()].reduce((sum, entries) => sum + entries.length, 0) /
    2;
  const endpoints = generators.filter(
    (generator) => neighbors.get(generator)?.length === 1,
  );
  if (
    edgeCount !== generators.length - 1 ||
    endpoints.length !== 2 ||
    generators.some((generator) => (neighbors.get(generator)?.length ?? 0) > 2)
  ) {
    return undefined;
  }

  const path: number[] = [];
  let previous: number | undefined;
  let current = Math.min(...endpoints);
  while (path.length < generators.length) {
    path.push(current);
    const next = (neighbors.get(current) ?? []).find(
      (neighbor) => neighbor !== previous,
    );
    if (next === undefined) {
      break;
    }
    previous = current;
    current = next;
  }
  return path.length === generators.length ? path : undefined;
}

function branchArmLengths(
  neighbors: Map<number, number[]>,
  generators: number[],
): number[] | undefined {
  const centers = generators.filter(
    (generator) => neighbors.get(generator)?.length === 3,
  );
  const edgeCount =
    [...neighbors.values()].reduce((sum, entries) => sum + entries.length, 0) /
    2;
  if (
    centers.length !== 1 ||
    edgeCount !== generators.length - 1 ||
    generators.some((generator) => (neighbors.get(generator)?.length ?? 0) > 3)
  ) {
    return undefined;
  }

  const center = centers[0];
  const lengths: number[] = [];
  for (const first of neighbors.get(center) ?? []) {
    let length = 1;
    let previous = center;
    let current = first;
    while ((neighbors.get(current)?.length ?? 0) === 2) {
      const next = (neighbors.get(current) ?? []).find(
        (neighbor) => neighbor !== previous,
      );
      if (next === undefined) {
        return undefined;
      }
      previous = current;
      current = next;
      length += 1;
    }
    if ((neighbors.get(current)?.length ?? 0) !== 1) {
      return undefined;
    }
    lengths.push(length);
  }
  return lengths.sort((left, right) => left - right);
}

function sameNumbers(left: number[], right: number[]): boolean {
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
}

/**
 * Recognizes an irreducible finite Coxeter diagram by the finite classification.
 * This is a combinatorial test on integer Coxeter labels; no Gram rounding is used.
 */
function classifyConnectedComponent(
  system: CoxeterSystemInput,
  generators: number[],
): ClassifiedComponent | undefined {
  const rank = generators.length;
  if (rank === 1) {
    return { type: "A1", order: 2n };
  }

  for (let left = 0; left < rank; left += 1) {
    for (let right = left + 1; right < rank; right += 1) {
      if (edgeLabel(system, generators[left], generators[right]) === "inf") {
        return undefined;
      }
    }
  }

  if (rank === 2) {
    const m = edgeLabel(system, generators[0], generators[1]);
    if (typeof m !== "number" || m < 3) {
      return undefined;
    }
    const type = `I2(${m})` as const;
    return { type, order: finiteComponentOrder(type, rank, m) };
  }

  const neighbors = nonCommutingNeighbors(system, generators);
  const path = orderedPath(neighbors, generators);
  if (path !== undefined) {
    const labels = path
      .slice(0, -1)
      .map((generator, index) => edgeLabel(system, generator, path[index + 1]));
    if (labels.every((label) => label === 3)) {
      const type = `A${rank}` as const;
      return { type, order: finiteComponentOrder(type, rank) };
    }

    const endpointFour =
      labels.filter((label) => label === 4).length === 1 &&
      labels.every((label) => label === 3 || label === 4) &&
      (labels[0] === 4 || labels.at(-1) === 4);
    if (endpointFour) {
      const type = `B${rank}` as const;
      return { type, order: finiteComponentOrder(type, rank) };
    }
    if (rank === 4 && sameNumbers(labels as number[], [3, 4, 3])) {
      return { type: "F4", order: finiteComponentOrder("F4", rank) };
    }

    const normalizedLabels = labels[0] === 5 ? labels : [...labels].reverse();
    if (rank === 3 && sameNumbers(normalizedLabels as number[], [5, 3])) {
      return { type: "H3", order: finiteComponentOrder("H3", rank) };
    }
    if (rank === 4 && sameNumbers(normalizedLabels as number[], [5, 3, 3])) {
      return { type: "H4", order: finiteComponentOrder("H4", rank) };
    }
    return undefined;
  }

  const allEdgesSimplyLaced = generators.every((generator) =>
    (neighbors.get(generator) ?? []).every(
      (neighbor) => edgeLabel(system, generator, neighbor) === 3,
    ),
  );
  if (!allEdgesSimplyLaced) {
    return undefined;
  }
  const arms = branchArmLengths(neighbors, generators);
  if (arms === undefined) {
    return undefined;
  }
  if (sameNumbers(arms, [1, 1, rank - 3]) && rank >= 4) {
    const type = `D${rank}` as const;
    return { type, order: finiteComponentOrder(type, rank) };
  }
  if (rank === 6 && sameNumbers(arms, [1, 2, 2])) {
    return { type: "E6", order: finiteComponentOrder("E6", rank) };
  }
  if (rank === 7 && sameNumbers(arms, [1, 2, 3])) {
    return { type: "E7", order: finiteComponentOrder("E7", rank) };
  }
  if (rank === 8 && sameNumbers(arms, [1, 2, 4])) {
    return { type: "E8", order: finiteComponentOrder("E8", rank) };
  }
  return undefined;
}

function classifySphericalSubset(
  system: CoxeterSystemInput,
  generators: number[],
): SphericalSpecialSubgroupPlan | undefined {
  const componentGenerators = connectedComponents(system, generators);
  const components: SphericalComponentPlan[] = [];
  let order = 1n;
  for (const component of componentGenerators) {
    const classification = classifyConnectedComponent(system, component);
    if (classification === undefined) {
      return undefined;
    }
    order *= classification.order;
    components.push({
      generators: component,
      type: classification.type,
      order: toExactIntegerValue(classification.order),
    });
  }

  return {
    id: `T:${generators.join(",")}`,
    generators,
    generatorLabels: generators.map(
      (generator) => system.generators[generator].label,
    ),
    rank: generators.length,
    components,
    type: components.map((component) => component.type).join(" x "),
    order: toExactIntegerValue(order),
  };
}

function enumerateGeneratorSubsets(
  rank: number,
  maxSubsetRank: number,
  cap: number,
): { subsets: number[][]; capped: boolean } {
  const subsets: number[][] = [];
  let capped = false;

  function visit(start: number, size: number, current: number[]): void {
    if (capped) {
      return;
    }
    if (current.length === size) {
      if (subsets.length >= cap) {
        capped = true;
        return;
      }
      subsets.push([...current]);
      return;
    }
    for (let generator = start; generator < rank; generator += 1) {
      current.push(generator);
      visit(generator + 1, size, current);
      current.pop();
      if (capped) {
        return;
      }
    }
  }

  for (let size = 1; size <= maxSubsetRank; size += 1) {
    visit(0, size, []);
    if (capped) {
      break;
    }
  }
  return { subsets, capped };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;
}

/**
 * Plans every spherical special subgroup when the configured bounds permit it.
 * The exact finite Coxeter classification supplies subgroup orders. If either
 * bound is crossed, the partial list is retained but the plan is `incomplete`.
 */
export function planSphericalSpecialSubgroups(
  input: unknown,
  limits: SphericalEnumerationLimits = {},
): SphericalSubsetPlan {
  const system = parseCoxeterSystemInput(input);
  const maxRank = positiveInteger(
    limits.maxRankForExhaustiveEnumeration,
    DEFAULT_MAX_EXHAUSTIVE_RANK,
  );
  const maxSubsets = positiveInteger(
    limits.maxSubsetsToCheck,
    DEFAULT_MAX_SUBSETS,
  );
  const partialRank = Math.min(
    system.rank,
    positiveInteger(
      limits.maxSubsetRankWhenIncomplete,
      DEFAULT_PARTIAL_SUBSET_RANK,
    ),
  );
  const rankLimited = system.rank > maxRank;
  const maxSubsetRank = rankLimited ? partialRank : system.rank;
  const enumeration = enumerateGeneratorSubsets(
    system.rank,
    maxSubsetRank,
    maxSubsets,
  );
  const sphericalSubgroups = enumeration.subsets
    .map((subset) => classifySphericalSubset(system, subset))
    .filter(
      (subset): subset is SphericalSpecialSubgroupPlan => subset !== undefined,
    );
  const warnings: string[] = [];
  if (rankLimited) {
    warnings.push(
      `Rank ${system.rank} exceeds the exhaustive rank limit ${maxRank}; only subsets through rank ${partialRank} were planned.`,
    );
  }
  if (enumeration.capped) {
    warnings.push(
      `Spherical planning stopped at the ${maxSubsets} candidate-subset cap.`,
    );
  }

  return {
    status: rankLimited || enumeration.capped ? "incomplete" : "complete",
    rank: system.rank,
    candidateSubsetCount: toExactIntegerValue(2n ** BigInt(system.rank) - 1n),
    checkedSubsetCount: enumeration.subsets.length,
    sphericalSubgroups,
    ...(rankLimited
      ? { omittedReason: "rank-limit" as const }
      : enumeration.capped
        ? { omittedReason: "subset-cap" as const }
        : {}),
    warnings,
  };
}

/**
 * Any free action of a finite spherical subgroup has orbit size divisible by
 * its order. Their exact LCM is therefore a necessary cover-index divisor.
 */
export function computeTorsionFreeIndexLowerBound(
  plan: SphericalSubsetPlan,
): TorsionFreeIndexLowerBound {
  let current = 1n;
  const contributingSubgroupIds: string[] = [];
  for (const subgroup of plan.sphericalSubgroups) {
    const next = leastCommonMultiple([
      current,
      exactIntegerToBigInt(subgroup.order),
    ]);
    if (next !== current) {
      contributingSubgroupIds.push(subgroup.id);
      current = next;
    }
  }
  return {
    value: toExactIntegerValue(current),
    contributingSubgroupIds,
    explanation:
      "A torsion-free coset action restricts freely to every spherical special subgroup, so the action degree is divisible by this LCM.",
  };
}
