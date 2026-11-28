import { parseCoxeterSystemInput } from "../coxeter";
import {
  isFreeByOrbitTemplate,
  firstAlternatingRelationFailure,
  isInvolutionRow,
} from "./relationCheck";
import type { CoxeterSystemInput } from "../types";
import { shareRows, type KernelPool } from "../parallel/kernelPool";
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
  visited: Uint8Array = new Uint8Array(candidate.index),
  /** Result of isFreeByOrbitTemplate on these rows, when already known. */
  knownFree?: boolean,
): number[] {
  const order = exactIntegerToBigInt(subgroup.order);
  if (order <= BigInt(candidate.index)) {
    const free =
      knownFree ??
      isFreeByOrbitTemplate(
        subgroup.generators.map(
          (generator) => candidate.generatorImages[generator],
        ),
        candidate.index,
        Number(order),
        visited,
      );
    if (free) {
      return new Array<number>(candidate.index / Number(order)).fill(
        Number(order),
      );
    }
  }
  visited.fill(0);
  // An orbit of a finite group has at most |W_T| points, so one queue of
  // that length is reused for every orbit.
  const queue = new Uint32Array(
    Math.min(candidate.index, Number(exactIntegerToBigInt(subgroup.order))),
  );
  const rows = subgroup.generators.map(
    (generator) => candidate.generatorImages[generator],
  );
  const orbitSizes: number[] = [];
  for (let start = 0; start < candidate.index; start += 1) {
    if (visited[start] !== 0) {
      continue;
    }
    visited[start] = 1;
    queue[0] = start;
    let tail = 1;
    for (let cursor = 0; cursor < tail; cursor += 1) {
      const point = queue[cursor];
      for (const row of rows) {
        const image = row[point];
        if (visited[image] === 0) {
          visited[image] = 1;
          queue[tail] = image;
          tail += 1;
        }
      }
    }
    orbitSizes.push(tail);
  }
  return orbitSizes;
}

/**
 * Orbit sizes for the spherical subgroups that need an explicit pass.
 * A subgroup of a group acting freely acts freely, so once W_S passes the
 * orbit test every spherical W_T with T a subset of S is free as well; its
 * certificate record is then fully determined and needs no further pass
 * over the action.  Subgroups are tested from the largest rank down, so in
 * a torsion-free action only the maximal spherical subgroups are walked.
 * Returns undefined for subgroups whose freeness is implied.
 */
function sphericalOrbitSizesByNecessity(
  candidate: TorsionFreeActionCandidate,
  subgroups: readonly SphericalSpecialSubgroupPlan[],
  knownFree?: ReadonlyMap<string, boolean>,
): Array<number[] | undefined> {
  const masks = subgroups.map((subgroup) =>
    subgroup.generators.reduce((mask, generator) => mask | (1 << generator), 0),
  );
  const order = subgroups
    .map((_subgroup, index) => index)
    .sort(
      (left, right) =>
        subgroups[right].generators.length - subgroups[left].generators.length,
    );
  const freeMasks: number[] = [];
  const result: Array<number[] | undefined> = Array(subgroups.length);
  const visited = new Uint8Array(candidate.index);
  for (const index of order) {
    const mask = masks[index];
    if (freeMasks.some((free) => (free & mask) === mask)) continue;
    const sizes = sphericalActionOrbitSizes(
      candidate,
      subgroups[index],
      visited,
      knownFree?.get(subgroups[index].id),
    );
    result[index] = sizes;
    const expected = Number(exactIntegerToBigInt(subgroups[index].order));
    if (sizes.every((size) => size === expected)) freeMasks.push(mask);
  }
  return result;
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
    if (
      !(Array.isArray(permutation) || permutation instanceof Uint32Array) ||
      permutation.length !== candidate.index
    ) {
      const message = `Generator ${generator} must have ${candidate.index} images.`;
      errors.push(message);
      addWitness({ kind: "invalid-permutation", generator, message });
      continue;
    }
    // A byte mask instead of Set<number>: Sets stop at ~2^24 entries and box
    // every key, while covers of interest have 10^7..10^8 points.
    const seen = new Uint8Array(candidate.index);
    let distinct = 0;
    for (let point = 0; point < permutation.length; point += 1) {
      const image = permutation[point];
      if (!Number.isInteger(image) || image < 0 || image >= candidate.index) {
        const message = `Generator ${generator} has image ${String(image)} outside 0..${candidate.index - 1}.`;
        errors.push(message);
        addWitness({ kind: "invalid-permutation", generator, message });
        continue;
      }
      if (seen[image] === 0) {
        seen[image] = 1;
        distinct += 1;
      }
    }
    if (distinct !== candidate.index) {
      const message = `Generator ${generator} images are not a bijection.`;
      errors.push(message);
      addWitness({ kind: "invalid-permutation", generator, message });
    }
  }
  return errors;
}

/** Orbit of point 0 as a visited mask plus its size (typed BFS, no boxing). */
function actionOrbitMask(candidate: TorsionFreeActionCandidate): {
  visited: Uint8Array;
  size: number;
} {
  const visited = new Uint8Array(candidate.index);
  const queue = new Uint32Array(candidate.index);
  visited[0] = 1;
  let tail = 1;
  for (let head = 0; head < tail; head += 1) {
    const point = queue[head];
    for (const permutation of candidate.generatorImages) {
      const image = permutation[point];
      if (visited[image] === 0) {
        visited[image] = 1;
        queue[tail] = image;
        tail += 1;
      }
    }
  }
  return { visited, size: tail };
}

/**
 * Streaming FNV-1a 64 over UTF-16 code units, kept in four 16-bit limbs so
 * every intermediate stays an exact double.  Multiplying by the FNV prime
 * 2^40 + 0x1b3 is one small multiply per limb plus a 40-bit shift.
 */
class Fnv1a64 {
  private h0 = 0x2325;
  private h1 = 0x8422;
  private h2 = 0x9ce4;
  private h3 = 0xcbf2;
  private readonly digits = new Uint8Array(16);

  code(unit: number): void {
    const h0 = this.h0 ^ unit;
    const h1 = this.h1;
    let r = h0 * 0x1b3;
    this.h0 = r & 0xffff;
    r = h1 * 0x1b3 + (r >>> 16);
    this.h1 = r & 0xffff;
    r = this.h2 * 0x1b3 + h0 * 256 + (r >>> 16);
    this.h2 = r & 0xffff;
    this.h3 = (this.h3 * 0x1b3 + h1 * 256 + (r >>> 16)) & 0xffff;
  }

  text(value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      this.code(value.charCodeAt(index));
    }
  }

  /** Same code units as String(value), without allocating a string. */
  number(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      this.text(String(value));
      return;
    }
    let count = 0;
    do {
      this.digits[count] = value % 10;
      count += 1;
      value = Math.floor(value / 10);
    } while (value > 0);
    while (count > 0) {
      count -= 1;
      this.code(48 + this.digits[count]);
    }
  }

  hex(): string {
    return [this.h3, this.h2, this.h1, this.h0]
      .map((limb) => limb.toString(16).padStart(4, "0"))
      .join("");
  }
}

/**
 * A stable diagnostic key tying a certificate to its system and action data.
 *
 * The key is FNV-1a 64 of the string
 *   rank | coxeterMatrix.flat().join(",") | index | row_0.join(",") | ...
 * hashed incrementally: the string itself would exceed the engine's maximum
 * string length for actions with tens of millions of points.
 */
export function torsionFreeActionFingerprint(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): string {
  const hash = new Fnv1a64();
  hash.text(String(system.rank));
  hash.code(124); // "|"
  hash.text(system.coxeterMatrix.flat().join(","));
  hash.code(124);
  hash.text(String(candidate.index));
  for (const row of candidate.generatorImages) {
    hash.code(124);
    for (let point = 0; point < row.length; point += 1) {
      if (point > 0) hash.code(44); // ","
      hash.number(row[point]);
    }
  }
  return `fnv1a64:${hash.hex()}`;
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
export interface CertifyTorsionFreeActionOptions {
  maxSphericalSubgroupElements?: number;
  maxWitnesses?: number;
  onProgress?: ProgressReporter;
}

/**
 * Kernel results computed on worker threads for exactly this candidate.
 * Module-private: a caller-supplied value could forge a certificate.
 */
interface PrecomputedActionChecks {
  /** First relation failure per "left,right" pair, null when it holds. */
  relationFailures: ReadonlyMap<
    string,
    { point: number; image: number } | null
  >;
  /** isFreeByOrbitTemplate per spherical subgroup id. */
  freeBySubgroupId: ReadonlyMap<string, boolean>;
}

export function certifyTorsionFreeAction(
  input: unknown,
  candidate: TorsionFreeActionCandidate,
  sphericalPlan: SphericalSubsetPlan,
  options: CertifyTorsionFreeActionOptions = {},
): TorsionFreeActionCertificate {
  return certifyWithChecks(input, candidate, sphericalPlan, options);
}

/**
 * Same certificate as certifyTorsionFreeAction, with the relation checks and
 * the free-orbit passes of maximal spherical subgroups (the two linear-time
 * scans over the action) spread over a kernel pool.  Results are combined in
 * the sequential order, so the certificate is byte-identical.
 */
export async function certifyTorsionFreeActionParallel(
  input: unknown,
  candidate: TorsionFreeActionCandidate,
  sphericalPlan: SphericalSubsetPlan,
  pool: KernelPool,
  options: CertifyTorsionFreeActionOptions = {},
): Promise<TorsionFreeActionCertificate> {
  const system = parseCoxeterSystemInput(input);
  const shape = validateCandidateShape(system, candidate, () => {});
  if (shape.length > 0 || pool.kind === "inline") {
    return certifyWithChecks(input, candidate, sphericalPlan, options);
  }
  const rows = shareRows(candidate.generatorImages);
  const involutive = rows.map(isInvolutionRow);
  const relationJobs: Array<
    Promise<[string, { point: number; image: number } | null]>
  > = [];
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const m = system.coxeterMatrix[left][right];
      if (m === "inf") continue;
      relationJobs.push(
        pool
          .run("alternatingRelation", {
            left: rows[left],
            right: rows[right],
            m,
            degree: candidate.index,
            involutions: involutive[left] && involutive[right],
          })
          .then((failure) => [`${left},${right}`, failure]),
      );
    }
  }
  // Only subgroups not contained in another are walked when the action is
  // free (see sphericalOrbitSizesByNecessity).
  const subgroups = sphericalPlan.sphericalSubgroups;
  const masks = subgroups.map((subgroup) =>
    subgroup.generators.reduce((mask, generator) => mask | (1 << generator), 0),
  );
  const freeJobs = subgroups
    .filter((subgroup, index) => {
      const mask = masks[index];
      return !masks.some(
        (other, otherIndex) =>
          otherIndex !== index && other !== mask && (other & mask) === mask,
      );
    })
    .filter(
      (subgroup) =>
        exactIntegerToBigInt(subgroup.order) <= BigInt(candidate.index),
    )
    .map((subgroup) =>
      pool
        .run("freeOrbitTemplate", {
          rows: subgroup.generators.map((generator) => rows[generator]),
          degree: candidate.index,
          order: Number(exactIntegerToBigInt(subgroup.order)),
        })
        .then((free): [string, boolean] => [subgroup.id, free]),
    );
  const [relations, frees] = await Promise.all([
    Promise.all(relationJobs),
    Promise.all(freeJobs),
  ]);
  return certifyWithChecks(input, candidate, sphericalPlan, options, {
    relationFailures: new Map(relations),
    freeBySubgroupId: new Map(frees),
  });
}

function certifyWithChecks(
  input: unknown,
  candidate: TorsionFreeActionCandidate,
  sphericalPlan: SphericalSubsetPlan,
  options: CertifyTorsionFreeActionOptions,
  precomputed?: PrecomputedActionChecks,
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
    const { visited, size } = actionOrbitMask(candidate);
    checks.transitive = size === candidate.index;
    if (!checks.transitive) {
      // Witness lists are only materialized on failure, in ascending order.
      const orbit: number[] = [];
      const unreachablePoints: number[] = [];
      for (let point = 0; point < candidate.index; point += 1) {
        (visited[point] !== 0 ? orbit : unreachablePoints).push(point);
      }
      addWitness({ kind: "intransitive-action", orbit, unreachablePoints });
      errors.push(
        `Action orbit from point 0 has ${size} of ${candidate.index} points.`,
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
    const involutive = candidate.generatorImages.map(isInvolutionRow);
    for (let left = 0; left < system.rank; left += 1) {
      for (let right = left + 1; right < system.rank; right += 1) {
        const m = system.coxeterMatrix[left][right];
        if (m === "inf") {
          continue;
        }
        const known = precomputed?.relationFailures.get(`${left},${right}`);
        const failure =
          known !== undefined
            ? (known ?? undefined)
            : firstAlternatingRelationFailure(
                candidate.generatorImages[left],
                candidate.generatorImages[right],
                m,
                candidate.index,
                involutive[left] && involutive[right],
              );
        if (failure) {
          checks.coxeterRelations = false;
          addWitness({
            kind: "coxeter-relation-failure",
            generatorPair: [left, right],
            m,
            point: failure.point,
            image: failure.image,
          });
          errors.push(
            `Relation (${left}, ${right}, m=${m}) fails at point ${failure.point}.`,
          );
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
    const orbitSizesBySubgroup = sphericalOrbitSizesByNecessity(
      candidate,
      sphericalPlan.sphericalSubgroups,
      precomputed?.freeBySubgroupId,
    );
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
      // undefined: implied free by a spherical supergroup that passed.
      const orbitSizes = orbitSizesBySubgroup[subgroupIndex] ?? [];
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
            // Failure path only: the Schreier chain wants plain arrays.
            images: Array.from(candidate.generatorImages[generator]),
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
