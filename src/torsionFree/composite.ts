import type { TorsionFreeActionCandidate } from "./types";

/**
 * A prime-order torsion representative written in the same right-action word
 * convention as a Cayley edge: generators are applied from left to right.
 * The catalogue producer is responsible for proving that the word represents
 * an element of the stated prime order in the Coxeter group.
 */
export interface PrimeOrderTorsionWitness {
  id: string;
  word: number[];
  primeOrder: number;
  sphericalSubsetId?: string;
  description?: string;
}

/**
 * Composition proves torsion-freeness only when this list is exhaustive for
 * prime-order torsion. A partial catalogue is still useful for diagnostics,
 * but it cannot produce an accepted composite action.
 */
export interface PrimeOrderWitnessCatalogue {
  complete: boolean;
  witnesses: PrimeOrderTorsionWitness[];
  method?: string;
  notes?: string[];
}

/** A pointed transitive action used as one factor of the diagonal product. */
export interface FiniteTransitivePermutationModule extends TorsionFreeActionCandidate {
  basePoint?: number;
}

export interface PrimeWitnessModuleCheck {
  witnessId: string;
  primeOrder: number;
  imageOrder?: number;
  fixedPointCount?: number;
  fixedPointFree: boolean;
  orderDividesWitnessOrder: boolean;
  error?: string;
}

export interface PermutationModuleCoverage {
  moduleId: string;
  moduleIndex: number;
  basePoint: number;
  valid: boolean;
  transitive: boolean;
  coveredWitnessIds: string[];
  uncoveredWitnessIds: string[];
  witnessChecks: PrimeWitnessModuleCheck[];
  errors: string[];
}

export interface CompositePermutationOptions {
  /** Maximum number of factors allowed in the minimum set cover. */
  maxModules?: number;
  /** Maximum number of candidate subsets examined by the exact set-cover search. */
  maxCandidateSets?: number;
  /** Maximum number of points materialized in a diagonal-product orbit. */
  maxOrbitSize?: number;
  compositeId?: string;
  compositeName?: string;
}

export interface CompositePermutationSelection {
  moduleIds: string[];
  basePoints: number[];
  minimumModuleCount: number;
  productDegreeUpperBound: string;
  orbitDegree: number;
  orbitPointTuples: number[][];
}

export interface CompositePermutationDiagnostics {
  witnessCatalogueComplete: boolean;
  witnessCount: number;
  inputModuleCount: number;
  validModuleCount: number;
  usableModuleCount: number;
  maxModules: number;
  maxCandidateSets: number;
  maxOrbitSize: number;
  candidateSetsExamined: number;
  coveringCandidateSets: number;
  orbitBuildsAttempted: number;
  orbitBuildsCapped: number;
  searchComplete: boolean;
  minimumProved: boolean;
  uncoveredWitnessIds: string[];
}

export interface CompositePermutationResult {
  status: "composed" | "not-found" | "incomplete" | "invalid-input";
  candidate?: TorsionFreeActionCandidate;
  coverage: PermutationModuleCoverage[];
  selection?: CompositePermutationSelection;
  diagnostics: CompositePermutationDiagnostics;
  errors: string[];
  warnings: string[];
}

interface ValidatedModule {
  module: FiniteTransitivePermutationModule;
  basePoint: number;
  coverage: PermutationModuleCoverage;
  coveredWitnessIndexes: number[];
}

interface DiagonalOrbitBuild {
  capped: boolean;
  candidate?: TorsionFreeActionCandidate;
  pointTuples: number[][];
  productDegreeUpperBound: bigint;
}

const DEFAULT_MAX_MODULES = 8;
const DEFAULT_MAX_CANDIDATE_SETS = 100_000;
const DEFAULT_MAX_ORBIT_SIZE = 250_000;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function modularPower(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let factor = base % modulus;
  let remaining = exponent;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = (result * factor) % modulus;
    }
    factor = (factor * factor) % modulus;
    remaining >>= 1n;
  }
  return result;
}

/** Deterministic Miller-Rabin for every prime representable as a safe integer. */
function isPrimeSafeInteger(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 2) {
    return false;
  }
  const candidate = BigInt(value);
  for (const prime of [
    2n,
    3n,
    5n,
    7n,
    11n,
    13n,
    17n,
    19n,
    23n,
    29n,
    31n,
    37n,
  ]) {
    if (candidate === prime) {
      return true;
    }
    if (candidate % prime === 0n) {
      return false;
    }
  }

  let oddPart = candidate - 1n;
  let powerOfTwo = 0;
  while ((oddPart & 1n) === 0n) {
    oddPart >>= 1n;
    powerOfTwo += 1;
  }
  // This base set is deterministic below 2^64, hence also below 2^53.
  for (const rawBase of [
    2n,
    325n,
    9_375n,
    28_178n,
    450_775n,
    9_780_504n,
    1_795_265_022n,
  ]) {
    const base = rawBase % candidate;
    if (base === 0n) {
      continue;
    }
    let residue = modularPower(base, oddPart, candidate);
    if (residue === 1n || residue === candidate - 1n) {
      continue;
    }
    let witnessedComposite = true;
    for (let square = 1; square < powerOfTwo; square += 1) {
      residue = (residue * residue) % candidate;
      if (residue === candidate - 1n) {
        witnessedComposite = false;
        break;
      }
    }
    if (witnessedComposite) {
      return false;
    }
  }
  return true;
}

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  name: string,
  errors: string[],
): number {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    errors.push(`${name} must be a positive safe integer.`);
    return fallback;
  }
  return normalized;
}

function validateWitnessCatalogue(
  catalogue: PrimeOrderWitnessCatalogue,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  if (!Array.isArray(catalogue.witnesses) || catalogue.witnesses.length === 0) {
    errors.push("The prime-order witness catalogue is empty.");
    return errors;
  }
  for (const witness of catalogue.witnesses) {
    if (typeof witness.id !== "string" || witness.id.trim().length === 0) {
      errors.push("Every prime-order witness must have a nonempty id.");
    } else if (ids.has(witness.id)) {
      errors.push(`Prime-order witness id ${witness.id} is duplicated.`);
    } else {
      ids.add(witness.id);
    }
    if (!isPrimeSafeInteger(witness.primeOrder)) {
      errors.push(
        `Witness ${witness.id || "<unnamed>"} has non-prime order ${String(witness.primeOrder)}.`,
      );
    }
    if (!Array.isArray(witness.word) || witness.word.length === 0) {
      errors.push(`Witness ${witness.id || "<unnamed>"} has an empty word.`);
    } else if (
      witness.word.some(
        (generator) => !Number.isSafeInteger(generator) || generator < 0,
      )
    ) {
      errors.push(
        `Witness ${witness.id || "<unnamed>"} has an invalid generator index.`,
      );
    }
  }
  return errors;
}

function validatePermutation(
  images: number[],
  index: number,
  label: string,
  errors: string[],
): boolean {
  if (!Array.isArray(images) || images.length !== index) {
    errors.push(
      `${label} has length ${images?.length ?? 0}; expected ${index}.`,
    );
    return false;
  }
  const seen = new Uint8Array(index);
  for (let point = 0; point < index; point += 1) {
    const image = images[point];
    if (!Number.isSafeInteger(image) || image < 0 || image >= index) {
      errors.push(
        `${label} sends point ${point} to invalid point ${String(image)}.`,
      );
      return false;
    }
    if (seen[image] !== 0) {
      errors.push(
        `${label} is not bijective; point ${image} has two preimages.`,
      );
      return false;
    }
    seen[image] = 1;
  }
  return true;
}

function actionOrbit(module: FiniteTransitivePermutationModule): number[] {
  const visited = new Uint8Array(module.index);
  const queue = [module.basePoint ?? 0];
  visited[queue[0]] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const point = queue[head];
    for (const generator of module.generatorImages) {
      const image = generator[point];
      if (visited[image] === 0) {
        visited[image] = 1;
        queue.push(image);
      }
    }
  }
  return queue;
}

function applyWitnessWord(
  module: FiniteTransitivePermutationModule,
  word: number[],
): number[] {
  return Array.from({ length: module.index }, (_unused, point) => {
    let image = point;
    for (const generator of word) {
      image = module.generatorImages[generator][image];
    }
    return image;
  });
}

function checkPrimeWitnessImage(
  module: FiniteTransitivePermutationModule,
  witness: PrimeOrderTorsionWitness,
): PrimeWitnessModuleCheck {
  const rank = module.generatorImages.length;
  const invalidGenerator = witness.word.find(
    (generator) => generator < 0 || generator >= rank,
  );
  if (invalidGenerator !== undefined) {
    return {
      witnessId: witness.id,
      primeOrder: witness.primeOrder,
      fixedPointFree: false,
      orderDividesWitnessOrder: false,
      error: `Witness uses generator ${invalidGenerator}, but module rank is ${rank}.`,
    };
  }

  const permutation = applyWitnessWord(module, witness.word);
  let fixedPointCount = 0;
  const visited = new Uint8Array(module.index);
  let imageOrder = 1;
  for (let start = 0; start < module.index; start += 1) {
    if (permutation[start] === start) {
      fixedPointCount += 1;
    }
    if (visited[start] !== 0) {
      continue;
    }
    let cycleLength = 0;
    let point = start;
    do {
      if (point < 0 || point >= module.index || visited[point] !== 0) {
        return {
          witnessId: witness.id,
          primeOrder: witness.primeOrder,
          fixedPointFree: false,
          orderDividesWitnessOrder: false,
          error: "The induced witness map is not a permutation.",
        };
      }
      visited[point] = 1;
      cycleLength += 1;
      point = permutation[point];
    } while (point !== start);
    if (cycleLength !== 1 && cycleLength !== witness.primeOrder) {
      return {
        witnessId: witness.id,
        primeOrder: witness.primeOrder,
        fixedPointCount,
        fixedPointFree: false,
        orderDividesWitnessOrder: false,
        error: `The witness image has a cycle of length ${cycleLength}, which does not divide ${witness.primeOrder}.`,
      };
    }
    if (cycleLength === witness.primeOrder) {
      imageOrder = witness.primeOrder;
    }
  }
  return {
    witnessId: witness.id,
    primeOrder: witness.primeOrder,
    imageOrder,
    fixedPointCount,
    fixedPointFree: fixedPointCount === 0,
    orderDividesWitnessOrder: true,
  };
}

/**
 * Checks one pointed module and records the prime-order witnesses that act
 * without fixed points. A witness covered by any selected factor has no fixed
 * point in the diagonal product.
 */
export function computePrimeWitnessCoverage(
  module: FiniteTransitivePermutationModule,
  catalogue: PrimeOrderWitnessCatalogue,
): PermutationModuleCoverage {
  const errors: string[] = [];
  const index = module.index;
  const basePoint = module.basePoint ?? 0;
  if (typeof module.id !== "string" || module.id.trim().length === 0) {
    errors.push("A permutation module must have a nonempty id.");
  }
  if (!Number.isSafeInteger(index) || index < 1) {
    errors.push(`Module ${module.id} has invalid index ${String(index)}.`);
  }
  if (!Number.isSafeInteger(basePoint) || basePoint < 0 || basePoint >= index) {
    errors.push(
      `Module ${module.id} has invalid base point ${String(basePoint)}.`,
    );
  }
  if (
    !Array.isArray(module.generatorImages) ||
    module.generatorImages.length === 0
  ) {
    errors.push(`Module ${module.id} has no generator permutations.`);
  }
  if (module.pointLabels !== undefined && module.pointLabels.length !== index) {
    errors.push(
      `Module ${module.id} supplies ${module.pointLabels.length} point labels; expected ${index}.`,
    );
  }
  if (errors.length === 0) {
    for (
      let generator = 0;
      generator < module.generatorImages.length;
      generator += 1
    ) {
      const images = module.generatorImages[generator];
      const valid = validatePermutation(
        images,
        index,
        `Module ${module.id} generator ${generator}`,
        errors,
      );
      if (valid) {
        for (let point = 0; point < index; point += 1) {
          if (images[images[point]] !== point) {
            errors.push(
              `Module ${module.id} generator ${generator} is not an involution at point ${point}.`,
            );
            break;
          }
        }
      }
    }
  }

  let transitive = false;
  if (errors.length === 0) {
    const orbit = actionOrbit(module);
    transitive = orbit.length === index;
    if (!transitive) {
      errors.push(
        `Module ${module.id} is not transitive from base point ${basePoint}; its orbit has ${orbit.length} of ${index} points.`,
      );
    }
  }

  const witnessChecks =
    errors.length === 0
      ? catalogue.witnesses.map((witness) =>
          checkPrimeWitnessImage(module, witness),
        )
      : [];
  for (const check of witnessChecks) {
    if (!check.orderDividesWitnessOrder) {
      errors.push(
        `Module ${module.id}, witness ${check.witnessId}: ${check.error ?? "invalid witness image"}`,
      );
    }
  }
  const valid = errors.length === 0;
  const coveredWitnessIds = valid
    ? witnessChecks
        .filter((check) => check.fixedPointFree)
        .map((check) => check.witnessId)
        .sort(compareText)
    : [];
  const covered = new Set(coveredWitnessIds);
  return {
    moduleId: module.id,
    moduleIndex: index,
    basePoint,
    valid,
    transitive,
    coveredWitnessIds,
    uncoveredWitnessIds: catalogue.witnesses
      .map((witness) => witness.id)
      .filter((id) => !covered.has(id))
      .sort(compareText),
    witnessChecks,
    errors,
  };
}

function buildDiagonalOrbit(
  modules: ValidatedModule[],
  maxOrbitSize: number,
  compositeId: string,
  compositeName: string,
): DiagonalOrbitBuild {
  const rank = modules[0].module.generatorImages.length;
  const baseTuple = modules.map((entry) => entry.basePoint);
  const tuples: number[][] = [baseTuple];
  const representativeWords: number[][] = [[]];
  const pointByKey = new Map<string, number>([[baseTuple.join(","), 0]]);
  const generatorImages = Array.from({ length: rank }, () => [] as number[]);
  let productDegreeUpperBound = 1n;
  for (const entry of modules) {
    productDegreeUpperBound *= BigInt(entry.module.index);
  }

  for (let head = 0; head < tuples.length; head += 1) {
    const tuple = tuples[head];
    for (let generator = 0; generator < rank; generator += 1) {
      const next = tuple.map(
        (point, moduleIndex) =>
          modules[moduleIndex].module.generatorImages[generator][point],
      );
      const key = next.join(",");
      let target = pointByKey.get(key);
      if (target === undefined) {
        if (tuples.length >= maxOrbitSize) {
          return {
            capped: true,
            pointTuples: tuples,
            productDegreeUpperBound,
          };
        }
        target = tuples.length;
        pointByKey.set(key, target);
        tuples.push(next);
        representativeWords.push([...representativeWords[head], generator]);
      }
      generatorImages[generator][head] = target;
    }
  }

  // The factors are involutory, so the reachable component is closed under
  // every generator. Checking the output catches any indexing mistake here.
  const outputErrors: string[] = [];
  for (let generator = 0; generator < rank; generator += 1) {
    validatePermutation(
      generatorImages[generator],
      tuples.length,
      `Composite generator ${generator}`,
      outputErrors,
    );
  }
  if (outputErrors.length > 0) {
    return {
      capped: true,
      pointTuples: tuples,
      productDegreeUpperBound,
    };
  }

  const moduleIds = modules.map((entry) => entry.module.id);
  const pointLabels = tuples.map((tuple) =>
    tuple
      .map((point, moduleIndex) => {
        const entry = modules[moduleIndex].module;
        return `${entry.id}:${entry.pointLabels?.[point] ?? point}`;
      })
      .join(" | "),
  );
  return {
    capped: false,
    pointTuples: tuples,
    productDegreeUpperBound,
    candidate: {
      id: compositeId,
      name: compositeName,
      index: tuples.length,
      generatorImages,
      pointLabels,
      representativeWords,
      backend: "composite-permutation-modules",
      source: `Reachable diagonal orbit of ${moduleIds.join(", ")}`,
      notes: [
        "Each prime-order torsion witness is fixed-point-free in at least one selected factor.",
        "The emitted action is the exact reachable orbit of the selected base-point tuple.",
      ],
    },
  };
}

function compareSelections(
  left: { build: DiagonalOrbitBuild; moduleIds: string[] },
  right: { build: DiagonalOrbitBuild; moduleIds: string[] },
): number {
  const leftDegree = left.build.candidate?.index ?? Number.POSITIVE_INFINITY;
  const rightDegree = right.build.candidate?.index ?? Number.POSITIVE_INFINITY;
  if (leftDegree !== rightDegree) {
    return leftDegree - rightDegree;
  }
  if (
    left.build.productDegreeUpperBound !== right.build.productDegreeUpperBound
  ) {
    return left.build.productDegreeUpperBound <
      right.build.productDegreeUpperBound
      ? -1
      : 1;
  }
  return compareText(
    left.moduleIds.join("\u0000"),
    right.moduleIds.join("\u0000"),
  );
}

/**
 * Finds a minimum-cardinality cover of the complete witness catalogue, then
 * returns the smallest reachable diagonal orbit among all covers of that size.
 * The search is deterministic. Hitting either bound suppresses the result
 * rather than presenting a best-effort action as minimal.
 */
export function composePermutationModules(
  modules: FiniteTransitivePermutationModule[],
  catalogue: PrimeOrderWitnessCatalogue,
  options: CompositePermutationOptions = {},
): CompositePermutationResult {
  const errors = validateWitnessCatalogue(catalogue);
  const warnings: string[] = [];
  const maxModules = normalizeLimit(
    options.maxModules,
    DEFAULT_MAX_MODULES,
    "maxModules",
    errors,
  );
  const maxCandidateSets = normalizeLimit(
    options.maxCandidateSets,
    DEFAULT_MAX_CANDIDATE_SETS,
    "maxCandidateSets",
    errors,
  );
  const maxOrbitSize = normalizeLimit(
    options.maxOrbitSize,
    DEFAULT_MAX_ORBIT_SIZE,
    "maxOrbitSize",
    errors,
  );
  if (!Array.isArray(modules) || modules.length === 0) {
    errors.push("At least one permutation module is required.");
  }
  const moduleIds = new Set<string>();
  for (const module of modules) {
    if (typeof module.id !== "string" || module.id.trim().length === 0) {
      errors.push("Every permutation module must have a nonempty id.");
    } else if (moduleIds.has(module.id)) {
      errors.push(`Permutation module id ${module.id} is duplicated.`);
    } else {
      moduleIds.add(module.id);
    }
  }

  const coverage = modules.map((module) =>
    computePrimeWitnessCoverage(module, catalogue),
  );
  const diagnosticBase: CompositePermutationDiagnostics = {
    witnessCatalogueComplete: catalogue.complete,
    witnessCount: catalogue.witnesses.length,
    inputModuleCount: modules.length,
    validModuleCount: coverage.filter((entry) => entry.valid).length,
    usableModuleCount: coverage.filter(
      (entry) => entry.valid && entry.coveredWitnessIds.length > 0,
    ).length,
    maxModules,
    maxCandidateSets,
    maxOrbitSize,
    candidateSetsExamined: 0,
    coveringCandidateSets: 0,
    orbitBuildsAttempted: 0,
    orbitBuildsCapped: 0,
    searchComplete: false,
    minimumProved: false,
    uncoveredWitnessIds: catalogue.witnesses
      .map((witness) => witness.id)
      .sort(compareText),
  };

  if (!catalogue.complete) {
    errors.push(
      "The prime-order witness catalogue is incomplete; composition cannot certify torsion-freeness.",
    );
  }
  if (errors.length > 0) {
    return {
      status: "invalid-input",
      coverage,
      diagnostics: diagnosticBase,
      errors,
      warnings,
    };
  }

  const firstValidModuleIndex = coverage.findIndex((entry) => entry.valid);
  if (firstValidModuleIndex < 0) {
    return {
      status: "invalid-input",
      coverage,
      diagnostics: diagnosticBase,
      errors: [
        "No supplied permutation module is a valid transitive 0-based action.",
      ],
      warnings,
    };
  }
  const expectedRank = modules[firstValidModuleIndex].generatorImages.length;
  const witnessIndexById = new Map(
    catalogue.witnesses.map((witness, index) => [witness.id, index]),
  );
  const validated: ValidatedModule[] = modules
    .map((module, index) => {
      const moduleCoverage = coverage[index];
      if (
        !moduleCoverage.valid ||
        module.generatorImages.length !== expectedRank ||
        moduleCoverage.coveredWitnessIds.length === 0
      ) {
        if (
          moduleCoverage.valid &&
          module.generatorImages.length !== expectedRank
        ) {
          moduleCoverage.valid = false;
          moduleCoverage.coveredWitnessIds = [];
          moduleCoverage.uncoveredWitnessIds = catalogue.witnesses
            .map((witness) => witness.id)
            .sort(compareText);
          moduleCoverage.errors.push(
            `Module rank ${module.generatorImages.length} does not match expected rank ${expectedRank}.`,
          );
        }
        return undefined;
      }
      return {
        module,
        basePoint: module.basePoint ?? 0,
        coverage: moduleCoverage,
        coveredWitnessIndexes: moduleCoverage.coveredWitnessIds
          .map((id) => witnessIndexById.get(id))
          .filter((index): index is number => index !== undefined),
      };
    })
    .filter((entry): entry is ValidatedModule => entry !== undefined)
    .sort((left, right) => {
      const coverageDifference =
        right.coveredWitnessIndexes.length - left.coveredWitnessIndexes.length;
      if (coverageDifference !== 0) {
        return coverageDifference;
      }
      if (left.module.index !== right.module.index) {
        return left.module.index - right.module.index;
      }
      return compareText(left.module.id, right.module.id);
    });

  diagnosticBase.validModuleCount = coverage.filter(
    (entry) => entry.valid,
  ).length;
  diagnosticBase.usableModuleCount = validated.length;
  const globallyCovered = new Uint8Array(catalogue.witnesses.length);
  for (const entry of validated) {
    for (const witnessIndex of entry.coveredWitnessIndexes) {
      globallyCovered[witnessIndex] = 1;
    }
  }
  diagnosticBase.uncoveredWitnessIds = catalogue.witnesses
    .filter((_witness, index) => globallyCovered[index] === 0)
    .map((witness) => witness.id)
    .sort(compareText);
  if (diagnosticBase.uncoveredWitnessIds.length > 0) {
    return {
      status: "not-found",
      coverage,
      diagnostics: {
        ...diagnosticBase,
        searchComplete: true,
      },
      errors: [],
      warnings: [
        `No supplied module is fixed-point-free on witnesses: ${diagnosticBase.uncoveredWitnessIds.join(", ")}.`,
      ],
    };
  }

  const suffixCoverage = Array.from(
    { length: validated.length + 1 },
    () => new Uint8Array(catalogue.witnesses.length),
  );
  for (let index = validated.length - 1; index >= 0; index -= 1) {
    suffixCoverage[index].set(suffixCoverage[index + 1]);
    for (const witnessIndex of validated[index].coveredWitnessIndexes) {
      suffixCoverage[index][witnessIndex] = 1;
    }
  }

  let candidateSetsExamined = 0;
  let capped = false;
  let minimumModuleCount: number | undefined;
  let coveringSets: ValidatedModule[][] = [];
  const chosen: ValidatedModule[] = [];
  const covered = new Uint16Array(catalogue.witnesses.length);
  const allCovered = (): boolean => covered.every((count) => count > 0);
  const canStillCover = (start: number): boolean =>
    covered.every(
      (count, witnessIndex) =>
        count > 0 || suffixCoverage[start][witnessIndex] !== 0,
    );

  const searchAtSize = (targetSize: number, start: number): void => {
    if (capped || chosen.length > targetSize) {
      return;
    }
    if (chosen.length === targetSize) {
      if (candidateSetsExamined >= maxCandidateSets) {
        capped = true;
        return;
      }
      candidateSetsExamined += 1;
      if (allCovered()) {
        coveringSets.push([...chosen]);
      }
      return;
    }
    if (
      validated.length - start < targetSize - chosen.length ||
      !canStillCover(start)
    ) {
      return;
    }
    const lastStart = validated.length - (targetSize - chosen.length);
    for (let index = start; index <= lastStart; index += 1) {
      const entry = validated[index];
      chosen.push(entry);
      for (const witnessIndex of entry.coveredWitnessIndexes) {
        covered[witnessIndex] += 1;
      }
      searchAtSize(targetSize, index + 1);
      for (const witnessIndex of entry.coveredWitnessIndexes) {
        covered[witnessIndex] -= 1;
      }
      chosen.pop();
      if (capped) {
        return;
      }
    }
  };

  const largestSet = Math.min(maxModules, validated.length);
  for (let size = 1; size <= largestSet; size += 1) {
    coveringSets = [];
    searchAtSize(size, 0);
    if (capped) {
      break;
    }
    if (coveringSets.length > 0) {
      minimumModuleCount = size;
      break;
    }
  }

  if (capped) {
    return {
      status: "incomplete",
      coverage,
      diagnostics: {
        ...diagnosticBase,
        candidateSetsExamined,
        coveringCandidateSets: coveringSets.length,
      },
      errors: [],
      warnings: [
        `The set-cover search reached its ${maxCandidateSets}-candidate bound before proving a minimum.`,
      ],
    };
  }
  if (minimumModuleCount === undefined) {
    return {
      status: "not-found",
      coverage,
      diagnostics: {
        ...diagnosticBase,
        candidateSetsExamined,
        searchComplete: true,
      },
      errors: [],
      warnings: [
        `No witness cover uses at most ${maxModules} permutation modules.`,
      ],
    };
  }

  let orbitBuildsCapped = 0;
  const builtSelections: Array<{
    build: DiagonalOrbitBuild;
    modules: ValidatedModule[];
    moduleIds: string[];
  }> = [];
  for (const selected of coveringSets) {
    const sortedById = [...selected].sort((left, right) =>
      compareText(left.module.id, right.module.id),
    );
    const moduleIdPart = sortedById.map((entry) => entry.module.id).join("+");
    const build = buildDiagonalOrbit(
      sortedById,
      maxOrbitSize,
      options.compositeId ?? `composite:${moduleIdPart}`,
      options.compositeName ?? `Composite action (${moduleIdPart})`,
    );
    if (build.capped || build.candidate === undefined) {
      orbitBuildsCapped += 1;
      continue;
    }
    builtSelections.push({
      build,
      modules: sortedById,
      moduleIds: sortedById.map((entry) => entry.module.id),
    });
  }
  builtSelections.sort(compareSelections);
  const best = builtSelections[0];
  if (best === undefined) {
    return {
      status: "incomplete",
      coverage,
      diagnostics: {
        ...diagnosticBase,
        candidateSetsExamined,
        coveringCandidateSets: coveringSets.length,
        orbitBuildsAttempted: coveringSets.length,
        orbitBuildsCapped,
        searchComplete: true,
        minimumProved: true,
      },
      errors: [],
      warnings: [
        `Every minimum witness cover exceeded the ${maxOrbitSize}-point orbit bound.`,
      ],
    };
  }

  if (orbitBuildsCapped > 0) {
    // A capped orbit already has more than maxOrbitSize points, while `best`
    // completed within that bound, so no capped alternative can be smaller.
    warnings.push(
      `${orbitBuildsCapped} larger diagonal orbit(s) exceeded the ${maxOrbitSize}-point materialization bound.`,
    );
  }
  const selectedWitnesses = new Set<string>();
  for (const entry of best.modules) {
    for (const id of entry.coverage.coveredWitnessIds) {
      selectedWitnesses.add(id);
    }
  }
  const uncoveredWitnessIds = catalogue.witnesses
    .map((witness) => witness.id)
    .filter((id) => !selectedWitnesses.has(id))
    .sort(compareText);
  if (uncoveredWitnessIds.length > 0 || best.build.candidate === undefined) {
    return {
      status: "incomplete",
      coverage,
      diagnostics: {
        ...diagnosticBase,
        candidateSetsExamined,
        coveringCandidateSets: coveringSets.length,
        orbitBuildsAttempted: coveringSets.length,
        orbitBuildsCapped,
        searchComplete: true,
        minimumProved: true,
        uncoveredWitnessIds,
      },
      errors: ["Internal witness-cover verification failed."],
      warnings,
    };
  }

  return {
    status: "composed",
    candidate: best.build.candidate,
    coverage,
    selection: {
      moduleIds: best.moduleIds,
      basePoints: best.modules.map((entry) => entry.basePoint),
      minimumModuleCount,
      productDegreeUpperBound: best.build.productDegreeUpperBound.toString(),
      orbitDegree: best.build.candidate.index,
      orbitPointTuples: best.build.pointTuples,
    },
    diagnostics: {
      ...diagnosticBase,
      candidateSetsExamined,
      coveringCandidateSets: coveringSets.length,
      orbitBuildsAttempted: coveringSets.length,
      orbitBuildsCapped,
      searchComplete: true,
      minimumProved: true,
      uncoveredWitnessIds: [],
    },
    errors: [],
    warnings,
  };
}
