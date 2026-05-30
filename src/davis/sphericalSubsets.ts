import {
  buildSimpleReflectionMatrices,
  finiteCoxeterGramValue,
  identityMatrix,
  multiplyMatrices,
  parseCoxeterSystemInput,
  roundedMatrixKey,
} from "../coxeter";
import type { CoxeterMatrixEntry, CoxeterSystemInput } from "../types";

export interface PositiveDefiniteCheck {
  positiveDefinite: boolean;
  pivots: number[];
  reason?: string;
}

export interface SphericalSubsetCheck {
  generators: number[];
  spherical: boolean;
  gramMatrix?: number[][];
  positiveDefinite?: PositiveDefiniteCheck;
  reason?: string;
}

export interface SphericalSubset {
  id: string;
  generators: number[];
  generatorLabels: string[];
  rank: number;
  gramMatrix: number[][];
  subgroupOrder?: number;
  subgroupOrderStatus: "computed" | "capped" | "not-computed";
  subgroupOrderWarning?: string;
}

export interface SphericalSubsetEnumerationOptions {
  tolerance?: number;
  maxRankForExhaustiveEnumeration?: number;
  maxSubsetsToCheck?: number;
  maxSubgroupOrder?: number;
  maxRankForSubgroupOrder?: number;
  subgroupOrderPrecision?: number;
}

export interface SphericalSubsetEnumerationResult {
  subsets: SphericalSubset[];
  warnings: string[];
  checkedSubsets: number;
  exhaustive: boolean;
}

export interface LocalLinkVertex {
  generator: number;
  generatorId: string;
  label: string;
  colorHint?: string;
}

export interface LocalLinkSimplex {
  id: string;
  generators: number[];
  dimension: number;
  sphericalSubsetId: string;
}

export interface LocalLink {
  nodeId: string;
  vertices: LocalLinkVertex[];
  simplices: LocalLinkSimplex[];
  sphericalSubsets: SphericalSubset[];
  warnings: string[];
}

const defaultOptions = {
  tolerance: 1e-10,
  maxRankForExhaustiveEnumeration: 12,
  maxSubsetsToCheck: 8192,
  maxSubgroupOrder: 100_000,
  maxRankForSubgroupOrder: 4,
  subgroupOrderPrecision: 10,
};

function normalizeOptions(
  options: SphericalSubsetEnumerationOptions = {},
): Required<SphericalSubsetEnumerationOptions> {
  return {
    tolerance: options.tolerance ?? defaultOptions.tolerance,
    maxRankForExhaustiveEnumeration:
      options.maxRankForExhaustiveEnumeration ??
      defaultOptions.maxRankForExhaustiveEnumeration,
    maxSubsetsToCheck:
      options.maxSubsetsToCheck ?? defaultOptions.maxSubsetsToCheck,
    maxSubgroupOrder:
      options.maxSubgroupOrder ?? defaultOptions.maxSubgroupOrder,
    maxRankForSubgroupOrder:
      options.maxRankForSubgroupOrder ?? defaultOptions.maxRankForSubgroupOrder,
    subgroupOrderPrecision:
      options.subgroupOrderPrecision ?? defaultOptions.subgroupOrderPrecision,
  };
}

function subsetId(generators: number[]): string {
  return `T:${generators.join(",")}`;
}

function compareGeneratorSubsets(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }

  for (let i = 0; i < left.length; i += 1) {
    const difference = left[i] - right[i];
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function normalizeGeneratorSubset(
  system: CoxeterSystemInput,
  generators: number[],
): number[] {
  const subset = [...new Set(generators)].sort((left, right) => left - right);

  for (const generator of subset) {
    if (
      !Number.isInteger(generator) ||
      generator < 0 ||
      generator >= system.rank
    ) {
      throw new Error(
        `Generator index ${generator} is outside the range 0..${
          system.rank - 1
        }.`,
      );
    }
  }

  return subset;
}

function hasFinitePairEntries(
  system: CoxeterSystemInput,
  generators: number[],
): string | undefined {
  for (let a = 0; a < generators.length; a += 1) {
    for (let b = a + 1; b < generators.length; b += 1) {
      const i = generators[a];
      const j = generators[b];

      if (system.coxeterMatrix[i][j] === "inf") {
        return `Subset [${generators.join(", ")}] contains infinite Coxeter entry m_${i}${j}.`;
      }
    }
  }

  return undefined;
}

function finiteSubsetGramMatrix(
  system: CoxeterSystemInput,
  generators: number[],
): number[][] {
  return generators.map((i) =>
    generators.map((j) => {
      if (i === j) {
        return 1;
      }

      const entry = system.coxeterMatrix[i][j];
      if (entry === "inf") {
        throw new Error(
          `Cannot build a finite Coxeter Gram matrix for infinite entry m_${i}${j}.`,
        );
      }

      return finiteCoxeterGramValue(entry);
    }),
  );
}

function finiteSubsetCoxeterMatrix(
  system: CoxeterSystemInput,
  generators: number[],
): CoxeterMatrixEntry[][] {
  return generators.map((i) =>
    generators.map((j) => system.coxeterMatrix[i][j]),
  );
}

function computeSphericalSubgroupOrder(
  system: CoxeterSystemInput,
  generators: number[],
  options: Pick<
    Required<SphericalSubsetEnumerationOptions>,
    "maxRankForSubgroupOrder" | "maxSubgroupOrder" | "subgroupOrderPrecision"
  >,
): Pick<
  SphericalSubset,
  "subgroupOrder" | "subgroupOrderStatus" | "subgroupOrderWarning"
> {
  if (generators.length === 1) {
    return { subgroupOrder: 2, subgroupOrderStatus: "computed" };
  }

  if (generators.length === 2) {
    const entry = system.coxeterMatrix[generators[0]][generators[1]];
    if (typeof entry === "number") {
      return { subgroupOrder: 2 * entry, subgroupOrderStatus: "computed" };
    }
  }

  if (generators.length > options.maxRankForSubgroupOrder) {
    return {
      subgroupOrderStatus: "not-computed",
      subgroupOrderWarning: `Spherical subgroup <${generators.join(", ")}> order was not computed because its rank exceeds ${options.maxRankForSubgroupOrder}.`,
    };
  }

  const subsetMatrix = finiteSubsetCoxeterMatrix(system, generators);
  const reflections = buildSimpleReflectionMatrices(subsetMatrix);
  const identity = identityMatrix(generators.length);
  const seen = new Set([
    roundedMatrixKey(identity, options.subgroupOrderPrecision),
  ]);
  const queue = [identity];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const matrix = queue[cursor];

    for (const reflection of reflections) {
      const next = multiplyMatrices(matrix, reflection);
      const key = roundedMatrixKey(next, options.subgroupOrderPrecision);
      if (seen.has(key)) {
        continue;
      }

      if (seen.size >= options.maxSubgroupOrder) {
        return {
          subgroupOrderStatus: "capped",
          subgroupOrderWarning: `Spherical subgroup <${generators.join(", ")}> exceeded the ${options.maxSubgroupOrder} element order cap.`,
        };
      }

      seen.add(key);
      queue.push(next);
    }
  }

  return { subgroupOrder: seen.size, subgroupOrderStatus: "computed" };
}

/**
 * Tests positive definiteness of a finite Coxeter Gram matrix.
 *
 * In the Davis-complex convention, a special subgroup is spherical exactly
 * when its finite Coxeter Gram matrix is positive definite. This viewer uses a
 * numerical Cholesky test so interactive imports can be checked without Sage;
 * exact classification claims still belong to external certificates.
 */
export function checkPositiveDefinite(
  matrix: number[][],
  tolerance = defaultOptions.tolerance,
): PositiveDefiniteCheck {
  const size = matrix.length;
  const lower = Array.from({ length: size }, () => Array(size).fill(0));
  const pivots: number[] = [];

  for (let i = 0; i < size; i += 1) {
    if (matrix[i]?.length !== size) {
      return {
        positiveDefinite: false,
        pivots,
        reason: "Matrix must be square for a positive-definiteness check.",
      };
    }

    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i][j];

      for (let k = 0; k < j; k += 1) {
        sum -= lower[i][k] * lower[j][k];
      }

      if (i === j) {
        pivots.push(sum);
        if (!Number.isFinite(sum) || sum <= tolerance) {
          return {
            positiveDefinite: false,
            pivots,
            reason: `Cholesky pivot ${i} is ${sum}, not positive above tolerance ${tolerance}.`,
          };
        }

        lower[i][j] = Math.sqrt(sum);
      } else {
        lower[i][j] = sum / lower[j][j];
      }
    }
  }

  return {
    positiveDefinite: true,
    pivots,
  };
}

/**
 * Checks whether a named generator subset is spherical in the viewer model.
 *
 * Infinite Coxeter entries are rejected before the Gram test because they do
 * not define finite special subgroups. The returned Gram matrix is numerical
 * and should be treated as validation data, not as a proof artifact.
 */
export function checkSphericalSubset(
  input: unknown,
  generators: number[],
  options: Pick<SphericalSubsetEnumerationOptions, "tolerance"> = {},
): SphericalSubsetCheck {
  const system = parseCoxeterSystemInput(input);
  const subset = normalizeGeneratorSubset(system, generators);

  if (subset.length === 0) {
    return {
      generators: subset,
      spherical: false,
      reason: "The viewer enumerates nonempty spherical subsets.",
    };
  }

  const infiniteEntryReason = hasFinitePairEntries(system, subset);
  if (infiniteEntryReason !== undefined) {
    return {
      generators: subset,
      spherical: false,
      reason: infiniteEntryReason,
    };
  }

  const gramMatrix = finiteSubsetGramMatrix(system, subset);
  const positiveDefinite = checkPositiveDefinite(
    gramMatrix,
    options.tolerance ?? defaultOptions.tolerance,
  );

  return {
    generators: subset,
    spherical: positiveDefinite.positiveDefinite,
    gramMatrix,
    positiveDefinite,
    reason: positiveDefinite.reason,
  };
}

function enumerateSubsets(
  rank: number,
  maxSubsetSize: number,
  maxSubsetsToCheck: number,
): { subsets: number[][]; capped: boolean } {
  const subsets: number[][] = [];
  let capped = false;

  function visit(start: number, size: number, current: number[]) {
    if (capped) {
      return;
    }

    if (current.length === size) {
      subsets.push([...current]);
      if (subsets.length >= maxSubsetsToCheck) {
        capped = true;
      }
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

  for (let size = 1; size <= maxSubsetSize; size += 1) {
    visit(0, size, []);
    if (capped) {
      break;
    }
  }

  return { subsets, capped };
}

function toSphericalSubset(
  system: CoxeterSystemInput,
  check: SphericalSubsetCheck,
  options: Pick<
    Required<SphericalSubsetEnumerationOptions>,
    "maxRankForSubgroupOrder" | "maxSubgroupOrder" | "subgroupOrderPrecision"
  >,
): SphericalSubset {
  if (check.gramMatrix === undefined) {
    throw new Error(
      `Spherical subset ${check.generators.join(",")} has no Gram matrix.`,
    );
  }

  const order = computeSphericalSubgroupOrder(
    system,
    check.generators,
    options,
  );

  return {
    id: subsetId(check.generators),
    generators: check.generators,
    generatorLabels: check.generators.map(
      (generator) => system.generators[generator].label,
    ),
    rank: check.generators.length,
    gramMatrix: check.gramMatrix,
    ...order,
  };
}

/**
 * Enumerates nonempty spherical subsets used by Davis cells and local links.
 *
 * Small ranks are exhaustive. Large ranks fall back to singleton and finite
 * rank-two data so the viewer stays responsive; the warning is part of the
 * result because omitted higher-rank simplices change local-link topology.
 */
export function enumerateSphericalSubsets(
  input: unknown,
  options: SphericalSubsetEnumerationOptions = {},
): SphericalSubsetEnumerationResult {
  const system = parseCoxeterSystemInput(input);
  const normalizedOptions = normalizeOptions(options);
  const exhaustive =
    system.rank <= normalizedOptions.maxRankForExhaustiveEnumeration;
  const maxSubsetSize = exhaustive ? system.rank : 2;
  const { subsets: candidates, capped } = enumerateSubsets(
    system.rank,
    maxSubsetSize,
    normalizedOptions.maxSubsetsToCheck,
  );
  const sphericalSubsets: SphericalSubset[] = [];
  const warnings: string[] = [];

  if (!exhaustive) {
    warnings.push(
      `Spherical subset enumeration for rank ${system.rank} is capped at rank two; raise maxRankForExhaustiveEnumeration to check higher-rank subsets.`,
    );
  }

  if (capped) {
    warnings.push(
      `Spherical subset enumeration stopped after ${normalizedOptions.maxSubsetsToCheck} candidate subsets.`,
    );
  }

  for (const candidate of candidates) {
    const check = checkSphericalSubset(system, candidate, {
      tolerance: normalizedOptions.tolerance,
    });

    if (check.spherical) {
      const subset = toSphericalSubset(system, check, normalizedOptions);
      sphericalSubsets.push(subset);
      if (subset.subgroupOrderWarning !== undefined) {
        warnings.push(subset.subgroupOrderWarning);
      }
    }
  }

  return {
    subsets: sphericalSubsets.sort((left, right) =>
      compareGeneratorSubsets(left.generators, right.generators),
    ),
    warnings,
    checkedSubsets: candidates.length,
    exhaustive: exhaustive && !capped,
  };
}

export function computeLocalLink(
  input: unknown,
  nodeId: string,
  options: SphericalSubsetEnumerationOptions = {},
): LocalLink {
  const system = parseCoxeterSystemInput(input);
  const sphericalSubsets = enumerateSphericalSubsets(system, options);
  return buildLocalLinkFromSphericalSubsets(system, nodeId, sphericalSubsets);
}

export function buildLocalLinkFromSphericalSubsets(
  system: CoxeterSystemInput,
  nodeId: string,
  sphericalSubsets: SphericalSubsetEnumerationResult,
): LocalLink {
  const vertices: LocalLinkVertex[] = system.generators.map(
    (generator, index) => ({
      generator: index,
      generatorId: generator.id,
      label: generator.label,
      colorHint: generator.colorHint,
    }),
  );
  const simplices: LocalLinkSimplex[] = sphericalSubsets.subsets.map(
    (subset) => ({
      id: `link:${nodeId}:${subset.id}`,
      generators: subset.generators,
      dimension: subset.generators.length - 1,
      sphericalSubsetId: subset.id,
    }),
  );

  return {
    nodeId,
    vertices,
    simplices,
    sphericalSubsets: sphericalSubsets.subsets,
    warnings: sphericalSubsets.warnings,
  };
}
