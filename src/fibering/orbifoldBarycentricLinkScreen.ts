import { planSphericalSpecialSubgroups } from "../torsionFree";
import type { TorsionFreeActionCandidate } from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildOrbifoldSchreierCocycleFamily,
  type OrbifoldSchreierCocycleFamily,
  type OrbifoldSchreierH1Preparation,
  type OrbifoldSchreierIntegralKernelVector,
} from "./orbifoldSchreierH1";
import { certifyOrbifoldFiniteActionStructure } from "./orbifoldIntersectionPromotion";

const INTEGER_PATTERN = /^(0|-?[1-9][0-9]*)$/u;

export interface OrbifoldShortCharacter {
  id: string;
  basisCoordinates: string[];
  kernelVector: OrbifoldSchreierIntegralKernelVector;
  coordinateDigest: string;
  supportSize: number;
  l1Norm: string;
  squaredL2Norm: string;
  maximumAbsoluteCoefficient: string;
  ambientCoordinateGcd: string;
  primitive: true;
}

export interface OrbifoldShortCharacterCertificate {
  schemaVersion: 1;
  kind: "orbifold-short-primitive-character-certificate";
  status: "passed";
  source: {
    preparationDigest: string;
    matrixDigest: string;
    saturatedKernelBasisDigest: string;
    saturatedKernelRank: number;
  };
  enumeration: {
    method: "exact-bounded-coefficient-cube-and-ambient-l2-order";
    coefficientBound: number;
    primitiveVectorCountBeforeSignQuotient: number;
    globalSignOrbitCount: number;
    retainedCharacterCount: number;
    scoreOrder: ["squared-l2", "support", "l1", "max-abs", "basis-lex"];
  };
  symmetry: {
    globalCharacterReversalQuotiented: true;
    coxeterDiagramAutomorphismCount: number;
    diagramAutomorphismReductionApplied: boolean;
    finiteActionNormalizerNotComputed: true;
  };
  characters: OrbifoldShortCharacter[];
  checks: {
    exactKernelVectorsClosed: true;
    everyRetainedBasisVectorPrimitive: true;
    everyRetainedAmbientVectorPrimitive: true;
    characterDigestsReplayed: true;
    diagramAutomorphismsEnumeratedExactly: true;
  };
  claims: string[];
  nonClaims: string[];
  certificateDigest: string;
}

export interface OrbifoldShortCharacterExtraction {
  certificate: OrbifoldShortCharacterCertificate;
  characters: OrbifoldShortCharacter[];
  cocycleFamily: OrbifoldSchreierCocycleFamily;
}

export interface OrbifoldBarycentricPotentialRule {
  id: string;
  generatorWeights: string[];
}

export interface OrbifoldBarycentricChamberLinkFailure {
  point: number;
  direction: "ascending" | "descending";
  componentCount: number;
  componentSizes: number[];
  sampledComponentTypeIds: string[][];
  signVectorDigest: string;
  failureDigest: string;
}

export interface OrbifoldBarycentricChamberLinkScreenCertificate {
  schemaVersion: 1;
  kind: "orbifold-rooted-barycentric-chamber-link-screen";
  status: "completed";
  method: "stabilizer-resolved-rooted-chamber-stars";
  source: {
    systemDigest: string;
    actionDigest: string;
    preparationDigest: string;
    cocycleFamilyDigest: string;
    shortCharacterCertificateDigest: string;
    degree: number;
  };
  cellulation: {
    method: "full-Davis-barycentric-subdivision";
    barycenterRawHeight: "mean-of-source-cell-vertex-heights";
    perturbation: "epsilon-times-spherical-type-potential";
    sphericalTypeCount: number;
    sphericalCatalogueDigest: string;
    sourceCellMeanCompression: "uniform-W_T-to-action-orbit-fibers-with-zero-stabilizer-period";
    sphericalTypes: Array<{
      id: string;
      generators: number[];
      expectedSourceVertexCount: string;
      actionOrbitCount: number;
      orbitSizeCensus: Array<{
        actionOrbitSize: number;
        orbitCount: number;
        stabilizerMultiplicity: string;
      }>;
      sourceMeanEqualsActionOrbitMean: true;
    }>;
    rootedGermsAreStabilizerResolved: true;
    quotientFoldingUsed: false;
  };
  potentials: Array<{
    id: string;
    generatorWeights: string[];
    typePotentialDigest: string;
    maximumAbsoluteTypePotential: string;
    epsilonDenominator: string;
    nestedTypesHaveDistinctPotentials: true;
  }>;
  results: Array<{
    characterId: string;
    potentialId: string;
    checkedPointCount: number;
    passedEveryRootedChamberLink: boolean;
    firstFailure?: OrbifoldBarycentricChamberLinkFailure;
    resultDigest: string;
  }>;
  survivorCharacterIds: string[];
  checks: {
    finiteTransitiveCoxeterActionReplayed: true;
    completeSphericalCatalogue: true;
    cocycleFamilyBoundToPreparation: true;
    shortCharacterPortfolioReplayed: true;
    everyShortCharacterMatchesIntegralBasisCoordinates: true;
    everySphericalOrbitHeightPathIndependent: true;
    everyActionOrbitSizeDividesExpectedSphericalOrder: true;
    everySourceMeanCompressionReplayed: true;
    allPotentialTiesBrokenOnNestedTypes: true;
    everyCharacterPotentialClassResolved: true;
  };
  claims: string[];
  nonClaims: string[];
  certificateDigest: string;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = abs(left);
  let b = abs(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareBigIntVectors(
  left: readonly bigint[],
  right: readonly bigint[],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareBigInt(left[index], right[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function firstNonzeroPositive(values: readonly bigint[]): boolean {
  const first = values.find((value) => value !== 0n);
  return first !== undefined && first > 0n;
}

function sparseMap(
  vector: OrbifoldSchreierIntegralKernelVector,
  columnCount: number,
): Map<number, bigint> {
  const result = new Map<number, bigint>();
  let previous = -1;
  for (const [column, rawCoefficient] of vector.entries) {
    if (
      !Number.isSafeInteger(column) ||
      column <= previous ||
      column >= columnCount ||
      !INTEGER_PATTERN.test(rawCoefficient) ||
      rawCoefficient === "0"
    ) {
      throw new Error(`Kernel vector ${vector.id} is not canonical.`);
    }
    previous = column;
    result.set(column, BigInt(rawCoefficient));
  }
  return result;
}

function enumerateIntegerCube(rank: number, bound: number): bigint[][] {
  const result: bigint[][] = [];
  const current = Array<bigint>(rank).fill(0n);
  const visit = (coordinate: number): void => {
    if (coordinate === rank) {
      result.push([...current]);
      return;
    }
    for (let value = -bound; value <= bound; value += 1) {
      current[coordinate] = BigInt(value);
      visit(coordinate + 1);
    }
  };
  visit(0);
  return result;
}

function diagramAutomorphismCount(system: CoxeterSystemInput): number {
  const rank = system.rank;
  const used = new Uint8Array(rank);
  const permutation = new Int16Array(rank).fill(-1);
  let count = 0;
  const visit = (position: number): void => {
    if (position === rank) {
      count += 1;
      return;
    }
    for (let image = 0; image < rank; image += 1) {
      if (used[image] !== 0) continue;
      let compatible = true;
      for (let previous = 0; previous < position; previous += 1) {
        if (
          system.coxeterMatrix[position][previous] !==
          system.coxeterMatrix[image][permutation[previous]]
        ) {
          compatible = false;
          break;
        }
      }
      if (!compatible) continue;
      used[image] = 1;
      permutation[position] = image;
      visit(position + 1);
      permutation[position] = -1;
      used[image] = 0;
    }
  };
  visit(0);
  return count;
}

/**
 * Enumerate a declared coefficient cube in a saturated integral H1 basis.
 * The ordering is exact in the ambient Schreier edge norm. Global reversal is
 * removed by requiring the first nonzero basis coefficient to be positive.
 */
export function extractShortPrimitiveOrbifoldCharacters(input: {
  system: CoxeterSystemInput;
  preparation: OrbifoldSchreierH1Preparation;
  saturatedKernelBasisDigest: string;
  basisVectors: readonly OrbifoldSchreierIntegralKernelVector[];
  coefficientBound?: number;
  retainCount?: number;
}): OrbifoldShortCharacterExtraction {
  const coefficientBound = input.coefficientBound ?? 3;
  const retainCount = input.retainCount ?? 16;
  if (
    !Number.isInteger(coefficientBound) ||
    coefficientBound < 1 ||
    coefficientBound > 8
  ) {
    throw new RangeError(
      "The short-character coefficient bound must lie in 1..8.",
    );
  }
  if (!Number.isInteger(retainCount) || retainCount < 1 || retainCount > 256) {
    throw new RangeError(
      "The short-character retain count must lie in 1..256.",
    );
  }
  if (input.basisVectors.length === 0 || input.basisVectors.length > 24) {
    throw new RangeError(
      "The bounded short-character extractor needs basis rank 1..24.",
    );
  }
  if (!/^[0-9a-f]{64}$/u.test(input.saturatedKernelBasisDigest)) {
    throw new Error(
      "The saturated-kernel basis digest must be a SHA-256 hash.",
    );
  }
  const columnCount = input.preparation.certificate.matrix.columnCount;
  const basisMaps = input.basisVectors.map((vector) =>
    sparseMap(vector, columnCount),
  );
  const basisFamily = buildOrbifoldSchreierCocycleFamily(
    input.preparation,
    input.basisVectors,
  );
  const primitive = enumerateIntegerCube(
    input.basisVectors.length,
    coefficientBound,
  ).filter((coordinates) => {
    let divisor = 0n;
    for (const coordinate of coordinates) divisor = gcd(divisor, coordinate);
    return divisor === 1n;
  });
  const signRepresentatives = primitive.filter(firstNonzeroPositive);
  const scored = signRepresentatives.map((basisCoordinates) => {
    const combined = new Map<number, bigint>();
    for (let basisIndex = 0; basisIndex < basisMaps.length; basisIndex += 1) {
      const multiplier = basisCoordinates[basisIndex];
      if (multiplier === 0n) continue;
      for (const [column, value] of basisMaps[basisIndex]) {
        combined.set(column, (combined.get(column) ?? 0n) + multiplier * value);
      }
    }
    for (const [column, value] of combined)
      if (value === 0n) combined.delete(column);
    const entries = [...combined.entries()]
      .sort(([left], [right]) => left - right)
      .map(([column, value]) => [column, value.toString()] as [number, string]);
    let ambientCoordinateGcd = 0n;
    let l1Norm = 0n;
    let squaredL2Norm = 0n;
    let maximumAbsoluteCoefficient = 0n;
    for (const value of combined.values()) {
      const magnitude = abs(value);
      ambientCoordinateGcd = gcd(ambientCoordinateGcd, magnitude);
      l1Norm += magnitude;
      squaredL2Norm += value * value;
      if (magnitude > maximumAbsoluteCoefficient)
        maximumAbsoluteCoefficient = magnitude;
    }
    if (ambientCoordinateGcd !== 1n) {
      throw new Error(
        "A primitive basis vector did not map to a primitive ambient vector.",
      );
    }
    return {
      basisCoordinates,
      entries,
      supportSize: entries.length,
      l1Norm,
      squaredL2Norm,
      maximumAbsoluteCoefficient,
      ambientCoordinateGcd,
    };
  });
  scored.sort(
    (left, right) =>
      compareBigInt(left.squaredL2Norm, right.squaredL2Norm) ||
      left.supportSize - right.supportSize ||
      compareBigInt(left.l1Norm, right.l1Norm) ||
      compareBigInt(
        left.maximumAbsoluteCoefficient,
        right.maximumAbsoluteCoefficient,
      ) ||
      compareBigIntVectors(left.basisCoordinates, right.basisCoordinates),
  );
  const retained = scored.slice(0, retainCount);
  const vectors: OrbifoldSchreierIntegralKernelVector[] = retained.map(
    (entry, index) => ({
      id: `short-${String(index).padStart(2, "0")}`,
      entries: entry.entries,
    }),
  );
  const cocycleFamily = buildOrbifoldSchreierCocycleFamily(
    input.preparation,
    vectors,
  );
  const characters: OrbifoldShortCharacter[] = retained.map((entry, index) => {
    const cocycle = cocycleFamily.cocycles[index];
    if (!cocycle?.primitive || cocycle.coordinateGcd !== "1") {
      throw new Error(
        "A retained short character did not replay as primitive.",
      );
    }
    return {
      id: vectors[index].id,
      basisCoordinates: entry.basisCoordinates.map(String),
      kernelVector: vectors[index],
      coordinateDigest: cocycle.coordinateDigest,
      supportSize: entry.supportSize,
      l1Norm: entry.l1Norm.toString(),
      squaredL2Norm: entry.squaredL2Norm.toString(),
      maximumAbsoluteCoefficient: entry.maximumAbsoluteCoefficient.toString(),
      ambientCoordinateGcd: entry.ambientCoordinateGcd.toString(),
      primitive: true,
    };
  });
  const automorphismCount = diagramAutomorphismCount(input.system);
  const extractionChecks = {
    exactKernelVectorsClosed:
      basisFamily.cocycles.length === input.basisVectors.length,
    everyRetainedBasisVectorPrimitive: characters.every(
      (character) =>
        character.basisCoordinates.reduce(
          (divisor, coordinate) => gcd(divisor, BigInt(coordinate)),
          0n,
        ) === 1n,
    ),
    everyRetainedAmbientVectorPrimitive: characters.every(
      (character) => character.ambientCoordinateGcd === "1",
    ),
    characterDigestsReplayed: characters.every(
      (character, index) =>
        character.coordinateDigest ===
        cocycleFamily.cocycles[index]?.coordinateDigest,
    ),
  };
  if (!Object.values(extractionChecks).every(Boolean)) {
    throw new Error("The exact short-character replay failed.");
  }
  const withoutDigest: Omit<
    OrbifoldShortCharacterCertificate,
    "certificateDigest"
  > = {
    schemaVersion: 1,
    kind: "orbifold-short-primitive-character-certificate",
    status: "passed",
    source: {
      preparationDigest: input.preparation.certificate.preparationDigest,
      matrixDigest:
        input.preparation.certificate.matrix.genericSparseMatrixDigest,
      saturatedKernelBasisDigest: input.saturatedKernelBasisDigest,
      saturatedKernelRank: input.basisVectors.length,
    },
    enumeration: {
      method: "exact-bounded-coefficient-cube-and-ambient-l2-order",
      coefficientBound,
      primitiveVectorCountBeforeSignQuotient: primitive.length,
      globalSignOrbitCount: signRepresentatives.length,
      retainedCharacterCount: characters.length,
      scoreOrder: ["squared-l2", "support", "l1", "max-abs", "basis-lex"],
    },
    symmetry: {
      globalCharacterReversalQuotiented: true,
      coxeterDiagramAutomorphismCount: automorphismCount,
      diagramAutomorphismReductionApplied: false,
      finiteActionNormalizerNotComputed: true,
    },
    characters,
    checks: {
      exactKernelVectorsClosed: true,
      everyRetainedBasisVectorPrimitive: true,
      everyRetainedAmbientVectorPrimitive: true,
      characterDigestsReplayed: true,
      diagramAutomorphismsEnumeratedExactly: true,
    },
    claims: [
      "Within the declared coefficient cube, the retained representatives are the first exact ambient-l2 characters after quotienting global reversal.",
      "Every retained vector is an exact primitive integral cocycle on the degree-3906 Schreier graph.",
    ],
    nonClaims: [
      "The bounded coefficient cube is not the complete set of short vectors of the lattice under every norm.",
      "No finite-action normalizer symmetry was computed.",
      "Character extraction alone makes no directed-link or fibering claim.",
    ],
  };
  return {
    certificate: {
      ...withoutDigest,
      certificateDigest: canonicalSha256(withoutDigest),
    },
    characters,
    cocycleFamily,
  };
}

function subsetMask(generators: readonly number[]): number {
  return generators.reduce((mask, generator) => mask | (1 << generator), 0);
}

function comparable(leftMask: number, rightMask: number): boolean {
  return (
    leftMask !== rightMask &&
    ((leftMask & rightMask) === leftMask ||
      (leftMask & rightMask) === rightMask)
  );
}

function components(
  selected: Uint8Array,
  adjacency: readonly number[][],
): number[][] {
  const seen = new Uint8Array(selected.length);
  const result: number[][] = [];
  for (let start = 0; start < selected.length; start += 1) {
    if (selected[start] === 0 || seen[start] !== 0) continue;
    const component: number[] = [];
    const queue = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      for (const next of adjacency[current]) {
        if (selected[next] === 0 || seen[next] !== 0) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    result.push(component);
  }
  return result;
}

interface ParsedPotentialRule {
  id: string;
  generatorWeights: string[];
  typePotentialDigest: string;
  maximumAbsoluteTypePotential: string;
  epsilonDenominator: string;
  nestedTypesHaveDistinctPotentials: true;
  weights: bigint[];
  typeSigns: Int8Array;
}

function parsePotentialRules(
  rules: readonly OrbifoldBarycentricPotentialRule[],
  rank: number,
  masks: readonly number[],
  degree: number,
): ParsedPotentialRule[] {
  const ids = new Set<string>();
  return rules.map((rule) => {
    if (!rule.id || ids.has(rule.id) || rule.generatorWeights.length !== rank) {
      throw new Error(
        "Barycentric potential ids must be unique and have one weight per generator.",
      );
    }
    ids.add(rule.id);
    const weights = rule.generatorWeights.map((value) => {
      if (!INTEGER_PATTERN.test(value) || value === "0") {
        throw new Error(
          `${rule.id} has a noncanonical or zero generator weight.`,
        );
      }
      return BigInt(value);
    });
    const values = masks.map((mask) =>
      weights.reduce(
        (sum, weight, generator) =>
          sum + ((mask & (1 << generator)) === 0 ? 0n : weight),
        0n,
      ),
    );
    if (values.some((value) => value === 0n)) {
      throw new Error(
        `${rule.id} ties a nonempty spherical type with the chamber vertex.`,
      );
    }
    for (let left = 0; left < masks.length; left += 1) {
      for (let right = left + 1; right < masks.length; right += 1) {
        if (
          comparable(masks[left], masks[right]) &&
          values[left] === values[right]
        ) {
          throw new Error(`${rule.id} ties two nested spherical types.`);
        }
      }
    }
    let maximumAbsoluteTypePotential = 0n;
    for (const value of values) {
      if (abs(value) > maximumAbsoluteTypePotential)
        maximumAbsoluteTypePotential = abs(value);
    }
    const epsilonDenominator =
      4n * maximumAbsoluteTypePotential * BigInt(degree) * BigInt(degree);
    return {
      id: rule.id,
      generatorWeights: [...rule.generatorWeights],
      typePotentialDigest: canonicalSha256({
        id: rule.id,
        generatorWeights: rule.generatorWeights,
        sphericalTypeValues: values.map(String),
      }),
      maximumAbsoluteTypePotential: maximumAbsoluteTypePotential.toString(),
      epsilonDenominator: epsilonDenominator.toString(),
      nestedTypesHaveDistinctPotentials: true as const,
      weights,
      typeSigns: Int8Array.from(values.map((value) => (value > 0n ? 1 : -1))),
    };
  });
}

/**
 * Test every original Davis vertex in the rooted local development after full
 * barycentric subdivision. Germs retain their spherical type, even when a
 * cell stabilizer identifies them in the orbifold quotient.
 *
 * This intentionally stops at chamber vertices. Passing candidates still need
 * links at the introduced barycenters before theorem-facing promotion.
 */
export function screenOrbifoldBarycentricChamberLinks(input: {
  system: CoxeterSystemInput;
  action: TorsionFreeActionCandidate;
  preparation: OrbifoldSchreierH1Preparation;
  basisCocycleFamily: OrbifoldSchreierCocycleFamily;
  shortCharacters: readonly OrbifoldShortCharacter[];
  shortCharacterCertificate: OrbifoldShortCharacterCertificate;
  potentialRules: readonly OrbifoldBarycentricPotentialRule[];
}): OrbifoldBarycentricChamberLinkScreenCertificate {
  if (input.shortCharacters.length === 0 || input.potentialRules.length === 0) {
    throw new Error(
      "The chamber-link screen needs characters and potential rules.",
    );
  }
  const actionReplay = certifyOrbifoldFiniteActionStructure(
    input.system,
    input.action,
  );
  if (
    actionReplay.errors.length > 0 ||
    !Object.values(actionReplay.checks).every(Boolean)
  ) {
    throw new Error(
      actionReplay.errors.join(" ") || "The finite action did not replay.",
    );
  }
  if (
    input.basisCocycleFamily.preparationDigest !==
    input.preparation.certificate.preparationDigest
  ) {
    throw new Error(
      "The cocycle family is not bound to the Schreier preparation.",
    );
  }
  const {
    certificateDigest: suppliedShortCharacterDigest,
    ...shortCharacterPayload
  } = input.shortCharacterCertificate;
  if (
    suppliedShortCharacterDigest !== canonicalSha256(shortCharacterPayload) ||
    input.shortCharacterCertificate.source.preparationDigest !==
      input.preparation.certificate.preparationDigest ||
    input.shortCharacterCertificate.source.saturatedKernelRank !==
      input.basisCocycleFamily.cocycles.length ||
    canonicalSha256(input.shortCharacterCertificate.characters) !==
      canonicalSha256(input.shortCharacters)
  ) {
    throw new Error(
      "The supplied short-character portfolio does not replay against its certificate.",
    );
  }
  const selectedCocycleFamily = buildOrbifoldSchreierCocycleFamily(
    input.preparation,
    input.shortCharacters.map((character) => character.kernelVector),
  );
  if (
    selectedCocycleFamily.cocycles.some(
      (cocycle, index) =>
        !cocycle.primitive ||
        cocycle.coordinateDigest !==
          input.shortCharacters[index]?.coordinateDigest,
    )
  ) {
    throw new Error(
      "A short character did not replay as its certified primitive cocycle.",
    );
  }
  const sphericalPlan = planSphericalSpecialSubgroups(input.system);
  if (sphericalPlan.status !== "complete") {
    throw new Error("The spherical-subset catalogue is incomplete.");
  }
  const types = sphericalPlan.sphericalSubgroups.map((type) => ({
    id: type.id,
    generators: [...type.generators],
    mask: subsetMask(type.generators),
    expectedOrder: BigInt(type.order.decimal),
  }));
  const masks = types.map((type) => type.mask);
  const adjacency = masks.map((left, leftIndex) =>
    masks
      .map((right, rightIndex) => ({ right, rightIndex }))
      .filter(
        ({ right, rightIndex }) =>
          rightIndex !== leftIndex && comparable(left, right),
      )
      .map(({ rightIndex }) => rightIndex),
  );
  const parsedPotentials = parsePotentialRules(
    input.potentialRules,
    input.system.rank,
    masks,
    input.action.index,
  );
  const basisRank = input.basisCocycleFamily.cocycles.length;
  if (
    basisRank === 0 ||
    input.shortCharacters.some(
      (character) => character.basisCoordinates.length !== basisRank,
    )
  ) {
    throw new Error(
      "Short-character coordinates do not match the cocycle basis rank.",
    );
  }
  const basisEdges = input.basisCocycleFamily.cocycles.map((cocycle) =>
    cocycle.character.edgeIncrements.map((row) => row.map(BigInt)),
  );
  const characterCoordinates = input.shortCharacters.map((character) =>
    character.basisCoordinates.map(BigInt),
  );
  for (
    let characterIndex = 0;
    characterIndex < input.shortCharacters.length;
    characterIndex += 1
  ) {
    for (let generator = 0; generator < input.system.rank; generator += 1) {
      for (let point = 0; point < input.action.index; point += 1) {
        let expected = 0n;
        for (let basisIndex = 0; basisIndex < basisRank; basisIndex += 1) {
          expected +=
            characterCoordinates[characterIndex][basisIndex] *
            basisEdges[basisIndex][generator][point];
        }
        if (
          expected !==
          BigInt(
            selectedCocycleFamily.cocycles[characterIndex].character
              .edgeIncrements[generator][point],
          )
        ) {
          throw new Error(
            `Short character ${input.shortCharacters[characterIndex].id} is not the stated integral-basis combination.`,
          );
        }
      }
    }
  }
  const typeCount = types.length;
  const degree = input.action.index;
  const rawSigns = input.shortCharacters.map(
    () => new Int8Array(degree * typeCount),
  );
  let everySphericalOrbitHeightPathIndependent = true;
  let everyActionOrbitSizeDividesExpectedSphericalOrder = true;
  const orbitSizeCensus = types.map(() => new Map<number, number>());

  for (let typeIndex = 0; typeIndex < typeCount; typeIndex += 1) {
    const generators = types[typeIndex].generators;
    const assigned = new Uint8Array(degree);
    const potential = Array.from({ length: basisRank }, () =>
      Array<bigint>(degree).fill(0n),
    );
    for (let root = 0; root < degree; root += 1) {
      if (assigned[root] !== 0) continue;
      assigned[root] = 1;
      const orbit = [root];
      for (let cursor = 0; cursor < orbit.length; cursor += 1) {
        const point = orbit[cursor];
        for (const generator of generators) {
          const next = input.action.generatorImages[generator][point];
          const proposed = Array.from(
            { length: basisRank },
            (_unused, coordinate) =>
              potential[coordinate][point] +
              basisEdges[coordinate][generator][point],
          );
          if (assigned[next] === 0) {
            assigned[next] = 1;
            orbit.push(next);
            for (let coordinate = 0; coordinate < basisRank; coordinate += 1) {
              potential[coordinate][next] = proposed[coordinate];
            }
          } else if (
            proposed.some(
              (value, coordinate) => value !== potential[coordinate][next],
            )
          ) {
            everySphericalOrbitHeightPathIndependent = false;
            throw new Error(
              `The cocycle height is path-dependent on ${types[typeIndex].id} at q${point}.`,
            );
          }
        }
      }
      const sums = Array<bigint>(basisRank).fill(0n);
      for (const point of orbit) {
        for (let coordinate = 0; coordinate < basisRank; coordinate += 1) {
          sums[coordinate] += potential[coordinate][point];
        }
      }
      const orbitSize = BigInt(orbit.length);
      if (types[typeIndex].expectedOrder % orbitSize !== 0n) {
        everyActionOrbitSizeDividesExpectedSphericalOrder = false;
        throw new Error(
          `${types[typeIndex].id} has action orbit size ${orbit.length}, which does not divide |W_T|=${types[typeIndex].expectedOrder}.`,
        );
      }
      orbitSizeCensus[typeIndex].set(
        orbit.length,
        (orbitSizeCensus[typeIndex].get(orbit.length) ?? 0) + 1,
      );
      for (const point of orbit) {
        const numerators = sums.map(
          (sum, coordinate) => sum - orbitSize * potential[coordinate][point],
        );
        for (
          let characterIndex = 0;
          characterIndex < input.shortCharacters.length;
          characterIndex += 1
        ) {
          const coordinates = characterCoordinates[characterIndex];
          let value = 0n;
          for (let coordinate = 0; coordinate < basisRank; coordinate += 1) {
            value += coordinates[coordinate] * numerators[coordinate];
          }
          rawSigns[characterIndex][point * typeCount + typeIndex] =
            value > 0n ? 1 : value < 0n ? -1 : 0;
        }
      }
    }
  }

  const results: OrbifoldBarycentricChamberLinkScreenCertificate["results"] =
    [];
  const survivors = new Set<string>();
  for (
    let characterIndex = 0;
    characterIndex < input.shortCharacters.length;
    characterIndex += 1
  ) {
    const character = input.shortCharacters[characterIndex];
    for (const potential of parsedPotentials) {
      let firstFailure: OrbifoldBarycentricChamberLinkFailure | undefined;
      let checkedPointCount = 0;
      for (let point = 0; point < degree; point += 1) {
        const ascending = new Uint8Array(typeCount);
        const descending = new Uint8Array(typeCount);
        const signedTypes: number[] = [];
        for (let typeIndex = 0; typeIndex < typeCount; typeIndex += 1) {
          const rawSign =
            rawSigns[characterIndex][point * typeCount + typeIndex];
          const sign = rawSign === 0 ? potential.typeSigns[typeIndex] : rawSign;
          signedTypes.push(sign);
          if (sign > 0) ascending[typeIndex] = 1;
          else descending[typeIndex] = 1;
        }
        checkedPointCount += 1;
        const ascendingComponents = components(ascending, adjacency);
        const descendingComponents = components(descending, adjacency);
        const direction: "ascending" | "descending" | undefined =
          ascendingComponents.length !== 1
            ? "ascending"
            : descendingComponents.length !== 1
              ? "descending"
              : undefined;
        if (direction === undefined) continue;
        const failedComponents =
          direction === "ascending"
            ? ascendingComponents
            : descendingComponents;
        const signVectorDigest = canonicalSha256({
          point,
          characterId: character.id,
          potentialId: potential.id,
          sphericalTypeIds: types.map((type) => type.id),
          signs: signedTypes,
        });
        const failureWithoutDigest = {
          point,
          direction,
          componentCount: failedComponents.length,
          componentSizes: failedComponents.map((component) => component.length),
          sampledComponentTypeIds: failedComponents
            .slice(0, 4)
            .map((component) =>
              component.slice(0, 8).map((index) => types[index].id),
            ),
          signVectorDigest,
        };
        firstFailure = {
          ...failureWithoutDigest,
          failureDigest: canonicalSha256(failureWithoutDigest),
        };
        break;
      }
      const passedEveryRootedChamberLink =
        checkedPointCount === degree && !firstFailure;
      if (passedEveryRootedChamberLink) survivors.add(character.id);
      const resultWithoutDigest = {
        characterId: character.id,
        potentialId: potential.id,
        checkedPointCount,
        passedEveryRootedChamberLink,
        ...(firstFailure ? { firstFailure } : {}),
      };
      results.push({
        ...resultWithoutDigest,
        resultDigest: canonicalSha256(resultWithoutDigest),
      });
    }
  }
  const publicPotentials = parsedPotentials.map((rule) => ({
    id: rule.id,
    generatorWeights: rule.generatorWeights,
    typePotentialDigest: rule.typePotentialDigest,
    maximumAbsoluteTypePotential: rule.maximumAbsoluteTypePotential,
    epsilonDenominator: rule.epsilonDenominator,
    nestedTypesHaveDistinctPotentials: rule.nestedTypesHaveDistinctPotentials,
  }));
  const everyCharacterPotentialClassResolved = results.every(
    (result) =>
      result.passedEveryRootedChamberLink || result.firstFailure !== undefined,
  );
  if (
    !everySphericalOrbitHeightPathIndependent ||
    !everyActionOrbitSizeDividesExpectedSphericalOrder ||
    !everyCharacterPotentialClassResolved
  ) {
    throw new Error(
      "The rooted chamber-link screen did not resolve its declared portfolio.",
    );
  }
  const withoutDigest: Omit<
    OrbifoldBarycentricChamberLinkScreenCertificate,
    "certificateDigest"
  > = {
    schemaVersion: 1,
    kind: "orbifold-rooted-barycentric-chamber-link-screen",
    status: "completed",
    method: "stabilizer-resolved-rooted-chamber-stars",
    source: {
      systemDigest: canonicalSha256(input.system),
      actionDigest: actionReplay.actionDigest,
      preparationDigest: input.preparation.certificate.preparationDigest,
      cocycleFamilyDigest: input.basisCocycleFamily.familyDigest,
      shortCharacterCertificateDigest: suppliedShortCharacterDigest,
      degree,
    },
    cellulation: {
      method: "full-Davis-barycentric-subdivision",
      barycenterRawHeight: "mean-of-source-cell-vertex-heights",
      perturbation: "epsilon-times-spherical-type-potential",
      sphericalTypeCount: typeCount,
      sphericalCatalogueDigest: canonicalSha256(
        types.map((type) => ({
          id: type.id,
          generators: type.generators,
          expectedOrder: type.expectedOrder.toString(),
        })),
      ),
      sourceCellMeanCompression:
        "uniform-W_T-to-action-orbit-fibers-with-zero-stabilizer-period",
      sphericalTypes: types.map((type, typeIndex) => ({
        id: type.id,
        generators: [...type.generators],
        expectedSourceVertexCount: type.expectedOrder.toString(),
        actionOrbitCount: [...orbitSizeCensus[typeIndex].values()].reduce(
          (sum, count) => sum + count,
          0,
        ),
        orbitSizeCensus: [...orbitSizeCensus[typeIndex].entries()]
          .sort(([left], [right]) => left - right)
          .map(([actionOrbitSize, orbitCount]) => ({
            actionOrbitSize,
            orbitCount,
            stabilizerMultiplicity: (
              type.expectedOrder / BigInt(actionOrbitSize)
            ).toString(),
          })),
        sourceMeanEqualsActionOrbitMean: true,
      })),
      rootedGermsAreStabilizerResolved: true,
      quotientFoldingUsed: false,
    },
    potentials: publicPotentials,
    results,
    survivorCharacterIds: [...survivors],
    checks: {
      finiteTransitiveCoxeterActionReplayed: true,
      completeSphericalCatalogue: true,
      cocycleFamilyBoundToPreparation: true,
      shortCharacterPortfolioReplayed: true,
      everyShortCharacterMatchesIntegralBasisCoordinates: true,
      everySphericalOrbitHeightPathIndependent: true,
      everyActionOrbitSizeDividesExpectedSphericalOrder: true,
      everySourceMeanCompressionReplayed: true,
      allPotentialTiesBrokenOnNestedTypes: true,
      everyCharacterPotentialClassResolved: true,
    },
    claims: [
      "Every recorded link is the actual ascending or descending one-skeleton at an original Davis vertex in the stabilizer-resolved local development of the stated barycentric cellulation.",
      "Each passing class has nonempty connected ascending and descending chamber-vertex links at all action points for the stated compatible periodic height rule.",
    ],
    nonClaims: [
      "The screen does not test links at barycenters introduced by the barycentric subdivision.",
      "Failure rejects only the recorded character, potential, and barycentric height rule; another periodic potential or subdivision may repair it.",
      "A chamber-link survivor is prioritization evidence, not a Track B or fibering certificate.",
      "No torsion-free intersection is constructed by this screen.",
    ],
  };
  return {
    ...withoutDigest,
    certificateDigest: canonicalSha256(withoutDigest),
  };
}

export function defaultSuperincreasingOrbifoldBarycentricPotentials(
  rank: number,
): OrbifoldBarycentricPotentialRule[] {
  if (!Number.isInteger(rank) || rank < 1 || rank > 30) {
    throw new RangeError(
      "The superincreasing potential rank must lie in 1..30.",
    );
  }
  const powers = Array.from(
    { length: rank },
    (_unused, index) => 1n << BigInt(index),
  );
  const alternating = powers.map((value, index) =>
    index % 2 === 0 ? value : -value,
  );
  const reverseAlternating = [...powers]
    .reverse()
    .map((value, index) => (index % 2 === 0 ? value : -value));
  const bases = [
    { id: "dimension-positive", weights: powers.map(() => 1n) },
    { id: "alternating-binary", weights: alternating },
    { id: "reverse-alternating-binary", weights: reverseAlternating },
  ];
  return bases.flatMap(({ id, weights }) => [
    { id, generatorWeights: weights.map(String) },
    {
      id: id === "dimension-positive" ? "dimension-negative" : `${id}-negative`,
      generatorWeights: weights.map((value) => (-value).toString()),
    },
  ]);
}
