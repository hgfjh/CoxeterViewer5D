import { parseCoxeterSystemInput } from "../coxeter";
import type { CoxeterSystemInput } from "../types";
import { exactIntegerToBigInt } from "./arithmetic";
import { computeTorsionFreeIndexLowerBound } from "./sphericalPlanning";
import type {
  SphericalSpecialSubgroupPlan,
  SphericalSubsetPlan,
  TorsionFreeActionCandidate,
  TorsionFreeActionCertificate,
  TorsionFreeDiscoveryProgress,
  TorsionFreeWitness,
} from "./types";

interface WordPermutation {
  images: number[];
  word: number[];
}

interface PermutationStabilizerChain {
  degree: number;
  order: bigint;
  transversals: WordPermutation[];
  stabilizer?: PermutationStabilizerChain;
}

interface StreamedPermutationDiagnostics {
  enumeratedElements: number;
  complete: boolean;
  fixedPointElementCount: number;
}

type ProgressReporter = (progress: TorsionFreeDiscoveryProgress) => void;

function isIdentity(permutation: number[]): boolean {
  return permutation.every((image, point) => image === point);
}

function permutationKey(permutation: number[]): string {
  return permutation.join(",");
}

// `left` acts first. This matches a right action read from a word left-to-right.
function composePermutation(left: number[], right: number[]): number[] {
  return left.map((image) => right[image]);
}

function identityPermutation(degree: number): number[] {
  return Array.from({ length: degree }, (_unused, point) => point);
}

function inversePermutation(permutation: number[]): number[] {
  const inverse = Array<number>(permutation.length);
  for (let point = 0; point < permutation.length; point += 1) {
    inverse[permutation[point]] = point;
  }
  return inverse;
}

function composeWordPermutations(
  left: WordPermutation,
  right: WordPermutation,
): WordPermutation {
  return {
    images: composePermutation(left.images, right.images),
    word: [...left.word, ...right.word],
  };
}

function invertWordPermutation(permutation: WordPermutation): WordPermutation {
  return {
    images: inversePermutation(permutation.images),
    // Coxeter generators are involutions, so reversing a word gives its inverse.
    word: [...permutation.word].reverse(),
  };
}

function distinctNonidentityGenerators(
  generators: WordPermutation[],
): WordPermutation[] {
  const distinct = new Map<string, WordPermutation>();
  for (const generator of generators) {
    if (!isIdentity(generator.images)) {
      distinct.set(permutationKey(generator.images), generator);
    }
  }
  return [...distinct.values()];
}

/**
 * Builds a Schreier stabilizer chain for exact legacy diagnostics.
 *
 * Unlike breadth-first subgroup closure, the chain retains orbit transversals
 * and stabilizer generators rather than one full permutation per group element.
 * Passing torsion-free checks never need this chain; their image order and lack
 * of fixed points already follow from the orbit-size criterion below.
 */
function buildPermutationStabilizerChain(
  generators: WordPermutation[],
  degree: number,
): PermutationStabilizerChain {
  const reducedGenerators = distinctNonidentityGenerators(generators);
  const basePoint = Array.from(
    { length: degree },
    (_unused, point) => point,
  ).find((point) =>
    reducedGenerators.some((generator) => generator.images[point] !== point),
  );
  const identity: WordPermutation = {
    images: identityPermutation(degree),
    word: [],
  };
  if (basePoint === undefined) {
    return { degree, order: 1n, transversals: [identity] };
  }

  const transversalByPoint = new Map<number, WordPermutation>([
    [basePoint, identity],
  ]);
  const orbitQueue = [basePoint];
  for (let cursor = 0; cursor < orbitQueue.length; cursor += 1) {
    const point = orbitQueue[cursor];
    const representative = transversalByPoint.get(point) as WordPermutation;
    for (const generator of reducedGenerators) {
      const nextRepresentative = composeWordPermutations(
        representative,
        generator,
      );
      const nextPoint = nextRepresentative.images[basePoint];
      if (!transversalByPoint.has(nextPoint)) {
        transversalByPoint.set(nextPoint, nextRepresentative);
        orbitQueue.push(nextPoint);
      }
    }
  }

  const stabilizerGenerators: WordPermutation[] = [];
  for (const representative of transversalByPoint.values()) {
    for (const generator of reducedGenerators) {
      const next = composeWordPermutations(representative, generator);
      const nextPoint = next.images[basePoint];
      const nextTransversal = transversalByPoint.get(nextPoint);
      if (nextTransversal === undefined) {
        throw new Error("Schreier orbit is missing a transversal.");
      }
      stabilizerGenerators.push(
        composeWordPermutations(next, invertWordPermutation(nextTransversal)),
      );
    }
  }

  const stabilizer = buildPermutationStabilizerChain(
    stabilizerGenerators,
    degree,
  );
  return {
    degree,
    order: BigInt(transversalByPoint.size) * stabilizer.order,
    transversals: [...transversalByPoint.values()],
    stabilizer,
  };
}

function visitStabilizerChainElements(
  chain: PermutationStabilizerChain,
  visit: (element: WordPermutation) => boolean,
): boolean {
  if (chain.stabilizer === undefined) {
    return visit({ images: identityPermutation(chain.degree), word: [] });
  }
  return visitStabilizerChainElements(chain.stabilizer, (stabilizerElement) => {
    for (const transversal of chain.transversals) {
      if (!visit(composeWordPermutations(stabilizerElement, transversal))) {
        return false;
      }
    }
    return true;
  });
}

function streamPermutationDiagnostics(
  chain: PermutationStabilizerChain,
  cap: number,
  onFixedPoint: (element: WordPermutation, point: number) => void,
): StreamedPermutationDiagnostics {
  let enumeratedElements = 0;
  let fixedPointElementCount = 0;
  const complete = visitStabilizerChainElements(chain, (element) => {
    if (enumeratedElements >= cap) {
      return false;
    }
    enumeratedElements += 1;
    if (isIdentity(element.images)) {
      return true;
    }
    let hasFixedPoint = false;
    for (let point = 0; point < element.images.length; point += 1) {
      if (element.images[point] === point) {
        hasFixedPoint = true;
        onFixedPoint(element, point);
      }
    }
    if (hasFixedPoint) {
      fixedPointElementCount += 1;
    }
    return true;
  });
  return { enumeratedElements, complete, fixedPointElementCount };
}

function sphericalActionOrbitSizes(
  candidate: TorsionFreeActionCandidate,
  subgroup: SphericalSpecialSubgroupPlan,
): number[] {
  const visited = new Uint8Array(candidate.index);
  const orbitSizes: number[] = [];
  for (let start = 0; start < candidate.index; start += 1) {
    if (visited[start] !== 0) {
      continue;
    }
    const orbit = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < orbit.length; cursor += 1) {
      const point = orbit[cursor];
      for (const generator of subgroup.generators) {
        const image = candidate.generatorImages[generator][point];
        if (visited[image] === 0) {
          visited[image] = 1;
          orbit.push(image);
        }
      }
    }
    orbitSizes.push(orbit.length);
  }
  return orbitSizes;
}

function applyAlternatingRelation(
  start: number,
  left: number[],
  right: number[],
  m: number,
): number {
  let point = start;
  for (let repeat = 0; repeat < m; repeat += 1) {
    point = left[point];
    point = right[point];
  }
  return point;
}

function validateCandidateShape(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
  addWitness: (witness: TorsionFreeWitness) => void,
): string[] {
  const errors: string[] = [];
  if (candidate.id.trim().length === 0) {
    errors.push("Candidate id must be nonempty.");
  }
  if (!Number.isSafeInteger(candidate.index) || candidate.index < 1) {
    errors.push("Candidate index must be a positive safe integer.");
  }
  if (candidate.generatorImages.length !== system.rank) {
    errors.push(
      `Candidate supplies ${candidate.generatorImages.length} generator permutations; expected ${system.rank}.`,
    );
  }

  if (
    candidate.pointLabels !== undefined &&
    candidate.pointLabels.length !== candidate.index
  ) {
    errors.push("pointLabels must contain one label per action point.");
  }
  if (
    candidate.representativeWords !== undefined &&
    candidate.representativeWords.length !== candidate.index
  ) {
    errors.push("representativeWords must contain one word per action point.");
  }

  for (let generator = 0; generator < system.rank; generator += 1) {
    const permutation = candidate.generatorImages[generator];
    if (!Array.isArray(permutation) || permutation.length !== candidate.index) {
      const message = `Generator ${generator} must have ${candidate.index} images.`;
      errors.push(message);
      addWitness({ kind: "invalid-permutation", generator, message });
      continue;
    }
    const images = new Set<number>();
    for (const image of permutation) {
      if (!Number.isInteger(image) || image < 0 || image >= candidate.index) {
        const message = `Generator ${generator} has image ${String(image)} outside 0..${candidate.index - 1}.`;
        errors.push(message);
        addWitness({ kind: "invalid-permutation", generator, message });
        continue;
      }
      images.add(image);
    }
    if (images.size !== candidate.index) {
      const message = `Generator ${generator} images are not a bijection.`;
      errors.push(message);
      addWitness({ kind: "invalid-permutation", generator, message });
    }
  }
  return errors;
}

function actionOrbit(candidate: TorsionFreeActionCandidate): number[] {
  const seen = new Set([0]);
  const queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    for (const permutation of candidate.generatorImages) {
      const image = permutation[point];
      if (!seen.has(image)) {
        seen.add(image);
        queue.push(image);
      }
    }
  }
  return [...seen].sort((left, right) => left - right);
}

/** A stable diagnostic key tying a certificate to its system and action data. */
export function torsionFreeActionFingerprint(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): string {
  const canonical = [
    system.rank,
    system.coxeterMatrix.flat().join(","),
    candidate.index,
    ...candidate.generatorImages.map((images) => images.join(",")),
  ].join("|");
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/**
 * Certifies a transitive finite action using the Coxeter torsion criterion.
 *
 * Every finite subgroup of a Coxeter group is conjugate into a spherical
 * special subgroup. For a transitive coset action, its point stabilizer is
 * therefore torsion-free exactly when every spherical special subgroup acts
 * freely.
 *
 * If a finite group G acts on a point x, orbit-stabilizer gives
 * |G.x| = |G| / |Stab_G(x)|. Thus the restricted action of a spherical W_T is
 * free exactly when every point orbit has size |W_T|. Checking point orbits is
 * linear in the action degree and avoids materializing the permutation image of
 * W_T. A compact Schreier chain is built only after a failed orbit check, to
 * preserve the certificate's exact legacy image-order and fixed-point details.
 */
export function certifyTorsionFreeAction(
  input: unknown,
  candidate: TorsionFreeActionCandidate,
  sphericalPlan: SphericalSubsetPlan,
  options: {
    maxSphericalSubgroupElements?: number;
    maxWitnesses?: number;
    onProgress?: ProgressReporter;
  } = {},
): TorsionFreeActionCertificate {
  const system = parseCoxeterSystemInput(input);
  const indexLowerBound = computeTorsionFreeIndexLowerBound(sphericalPlan);
  const maxElements =
    Number.isSafeInteger(options.maxSphericalSubgroupElements) &&
    (options.maxSphericalSubgroupElements ?? 0) > 0
      ? (options.maxSphericalSubgroupElements as number)
      : 100_000;
  const maxWitnesses =
    Number.isSafeInteger(options.maxWitnesses) &&
    (options.maxWitnesses ?? 0) > 0
      ? (options.maxWitnesses as number)
      : 64;
  const witnesses: TorsionFreeWitness[] = [];
  let witnessCount = 0;
  const addWitness = (witness: TorsionFreeWitness): void => {
    witnessCount += 1;
    if (witnesses.length < maxWitnesses) {
      witnesses.push(witness);
    }
  };
  const errors = validateCandidateShape(system, candidate, addWitness);
  const warnings = [...sphericalPlan.warnings];
  const checks: TorsionFreeActionCertificate["checks"] = {
    actionShape: errors.length === 0,
    transitive: false,
    involutiveGenerators: false,
    coxeterRelations: false,
    indexDivisibility: false,
    sphericalEnumerationComplete: sphericalPlan.status === "complete",
    sphericalSubgroupEnumerationsComplete: false,
    sphericalActionsFaithful: false,
    sphericalActionsFree: false,
  };
  const sphericalActions: TorsionFreeActionCertificate["sphericalActions"] = [];

  options.onProgress?.({
    phase: "candidate-validation",
    completed: 0,
    total: 1,
    candidateId: candidate.id,
    message: `Validating finite action ${candidate.id}.`,
  });

  if (checks.actionShape) {
    const orbit = actionOrbit(candidate);
    checks.transitive = orbit.length === candidate.index;
    if (!checks.transitive) {
      const orbitSet = new Set(orbit);
      const unreachablePoints = Array.from(
        { length: candidate.index },
        (_unused, point) => point,
      ).filter((point) => !orbitSet.has(point));
      addWitness({ kind: "intransitive-action", orbit, unreachablePoints });
      errors.push(
        `Action orbit from point 0 has ${orbit.length} of ${candidate.index} points.`,
      );
    }

    checks.involutiveGenerators = true;
    for (let generator = 0; generator < system.rank; generator += 1) {
      const permutation = candidate.generatorImages[generator];
      for (let point = 0; point < candidate.index; point += 1) {
        const image = permutation[point];
        const secondImage = permutation[image];
        if (secondImage !== point) {
          checks.involutiveGenerators = false;
          addWitness({
            kind: "non-involution",
            generator,
            point,
            image,
            secondImage,
          });
          errors.push(
            `Generator ${generator} is not involutive at point ${point}.`,
          );
          break;
        }
      }
    }

    checks.coxeterRelations = true;
    for (let left = 0; left < system.rank; left += 1) {
      for (let right = left + 1; right < system.rank; right += 1) {
        const m = system.coxeterMatrix[left][right];
        if (m === "inf") {
          continue;
        }
        for (let point = 0; point < candidate.index; point += 1) {
          const image = applyAlternatingRelation(
            point,
            candidate.generatorImages[left],
            candidate.generatorImages[right],
            m,
          );
          if (image !== point) {
            checks.coxeterRelations = false;
            addWitness({
              kind: "coxeter-relation-failure",
              generatorPair: [left, right],
              m,
              point,
              image,
            });
            errors.push(
              `Relation (${left}, ${right}, m=${m}) fails at point ${point}.`,
            );
            break;
          }
        }
      }
    }

    const divisor = exactIntegerToBigInt(indexLowerBound.value);
    checks.indexDivisibility = BigInt(candidate.index) % divisor === 0n;
    if (!checks.indexDivisibility) {
      addWitness({
        kind: "index-divisibility-failure",
        index: candidate.index,
        requiredDivisor: indexLowerBound.value,
      });
      errors.push(
        `Action index ${candidate.index} is not divisible by the necessary spherical-subgroup LCM ${indexLowerBound.value.decimal}.`,
      );
    }
  }

  options.onProgress?.({
    phase: "candidate-validation",
    completed: 1,
    total: 1,
    candidateId: candidate.id,
    message: `Validated finite action ${candidate.id}.`,
  });

  const structuralChecksPass =
    checks.actionShape &&
    checks.transitive &&
    checks.involutiveGenerators &&
    checks.coxeterRelations;
  let allEnumerationsComplete = true;
  let allFaithful = true;
  let allFree = true;

  if (structuralChecksPass) {
    sphericalPlan.sphericalSubgroups.forEach((subgroup, subgroupIndex) => {
      options.onProgress?.({
        phase: "spherical-action",
        completed: subgroupIndex,
        total: sphericalPlan.sphericalSubgroups.length,
        candidateId: candidate.id,
        sphericalSubsetId: subgroup.id,
        message: `Checking ${subgroup.type} action for ${candidate.id}.`,
      });
      const expectedOrder = exactIntegerToBigInt(subgroup.order);
      const orbitSizes = sphericalActionOrbitSizes(candidate, subgroup);
      const free = orbitSizes.every(
        (orbitSize) => BigInt(orbitSize) === expectedOrder,
      );

      // A full-size orbit has trivial stabilizer, hence it also proves that the
      // restricted homomorphism W_T -> Sym(X) is faithful and has image |W_T|.
      // This is the common passing path and needs no permutation-group closure.
      let faithful = free;
      let enumeratedImageElements = free ? Number(expectedOrder) : 0;
      let enumerationComplete = true;
      let fixedPointElementCount = 0;
      if (!free) {
        const generators = subgroup.generators.map<WordPermutation>(
          (generator) => ({
            images: candidate.generatorImages[generator],
            word: [generator],
          }),
        );
        const chain = buildPermutationStabilizerChain(
          generators,
          candidate.index,
        );
        faithful = chain.order === expectedOrder;
        const diagnostics = streamPermutationDiagnostics(
          chain,
          maxElements,
          (element, point) => {
            addWitness({
              kind: "fixed-point",
              sphericalSubsetId: subgroup.id,
              generators: subgroup.generators,
              word: element.word,
              point,
              pointLabel: candidate.pointLabels?.[point],
            });
          },
        );
        enumeratedImageElements = diagnostics.enumeratedElements;
        enumerationComplete = diagnostics.complete;
        fixedPointElementCount = diagnostics.fixedPointElementCount;

        if (!diagnostics.complete) {
          allEnumerationsComplete = false;
          addWitness({
            kind: "subgroup-enumeration-capped",
            sphericalSubsetId: subgroup.id,
            cap: maxElements,
            enumeratedElements: diagnostics.enumeratedElements,
          });
          warnings.push(
            `${subgroup.id} failed the orbit-size test; fixed-point diagnostics reached the ${maxElements} element cap.`,
          );
        }
        if (!faithful) {
          const imageOrder = Number(chain.order);
          if (Number.isSafeInteger(imageOrder)) {
            addWitness({
              kind: "spherical-action-kernel",
              sphericalSubsetId: subgroup.id,
              expectedOrder: subgroup.order,
              imageOrder,
            });
          } else {
            warnings.push(
              `${subgroup.id} has image order ${chain.order.toString()}, beyond the numeric witness schema.`,
            );
          }
          errors.push(
            `${subgroup.id} has order ${subgroup.order.decimal}, but its permutation image has order ${chain.order.toString()}.`,
          );
        }

        const orbitSizeCounts = new Map<number, number>();
        for (const orbitSize of orbitSizes) {
          orbitSizeCounts.set(
            orbitSize,
            (orbitSizeCounts.get(orbitSize) ?? 0) + 1,
          );
        }
        const orbitSummary = [...orbitSizeCounts.entries()]
          .sort(([left], [right]) => left - right)
          .map(
            ([size, count]) =>
              `${count} orbit${count === 1 ? "" : "s"} of size ${size}`,
          )
          .join(", ");
        errors.push(
          `${subgroup.id} is not free: ${orbitSummary}; every orbit must have size ${subgroup.order.decimal}.`,
        );
      }

      if (!faithful) {
        allFaithful = false;
      }
      if (!free) {
        allFree = false;
      }
      if (fixedPointElementCount > 0) {
        errors.push(
          `${subgroup.id} has ${fixedPointElementCount} nonidentity permutation elements with fixed points.`,
        );
      }
      sphericalActions.push({
        sphericalSubsetId: subgroup.id,
        generators: subgroup.generators,
        expectedOrder: subgroup.order,
        enumeratedImageElements,
        enumerationComplete,
        faithful,
        free,
        fixedPointElementCount,
      });
      options.onProgress?.({
        phase: "spherical-action",
        completed: subgroupIndex + 1,
        total: sphericalPlan.sphericalSubgroups.length,
        candidateId: candidate.id,
        sphericalSubsetId: subgroup.id,
        message: `Checked ${subgroup.type} action for ${candidate.id}.`,
      });
    });
  } else {
    allEnumerationsComplete = false;
    allFaithful = false;
    allFree = false;
  }

  checks.sphericalSubgroupEnumerationsComplete = allEnumerationsComplete;
  checks.sphericalActionsFaithful = allFaithful;
  checks.sphericalActionsFree = allFree;
  if (witnessCount > witnesses.length) {
    warnings.push(
      `${witnessCount - witnesses.length} additional witnesses were omitted from the stored certificate.`,
    );
  }

  const hasDefinitiveFailure = errors.length > 0;
  const incomplete =
    !checks.sphericalEnumerationComplete ||
    !checks.sphericalSubgroupEnumerationsComplete;
  const status = hasDefinitiveFailure
    ? "failed"
    : incomplete
      ? "incomplete"
      : "passed";

  return {
    status,
    method: "tits-spherical-special-subgroup-action",
    candidateId: candidate.id,
    candidateIndex: candidate.index,
    actionFingerprint: torsionFreeActionFingerprint(system, candidate),
    indexLowerBound,
    checks,
    sphericalActions,
    witnesses,
    witnessCount,
    errors,
    warnings,
  };
}
