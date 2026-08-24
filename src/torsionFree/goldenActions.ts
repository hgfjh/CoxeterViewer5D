import type { QuotientComplex } from "../quotient";
import type { CoxeterSystemInput } from "../types";
import { certifyTorsionFreeAction } from "./certification";
import { acceptedActionToQuotientComplex } from "./quotient";
import { planSphericalSpecialSubgroups } from "./sphericalPlanning";
import type { TorsionFreeActionCandidate } from "./types";

type Permutation = readonly number[];

const s4TranspositionPairs = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
] as const;

function permutations(values: readonly number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_entry, entryIndex) => entryIndex !== index),
    ).map((tail) => [value, ...tail]),
  );
}

function transposition(left: number, right: number): number[] {
  const result = [0, 1, 2, 3];
  [result[left], result[right]] = [result[right], result[left]];
  return result;
}

/** Compose `left` after `right`, so appending a generator is right multiplication. */
function composePermutations(left: Permutation, right: Permutation): number[] {
  return right.map((image) => left[image]);
}

function permutationKey(permutation: Permutation): string {
  return permutation.join(",");
}

function cycleLabel(permutation: Permutation): string {
  const visited = new Set<number>();
  const cycles: string[] = [];
  for (let start = 0; start < permutation.length; start += 1) {
    if (visited.has(start) || permutation[start] === start) continue;
    const cycle: number[] = [];
    let current = start;
    while (!visited.has(current)) {
      visited.add(current);
      cycle.push(current + 1);
      current = permutation[current];
    }
    cycles.push(`(${cycle.join("")})`);
  }
  return cycles.length === 0 ? "e" : cycles.join("");
}

function representativeWords(generatorImages: number[][]): number[][] {
  const words: Array<number[] | undefined> = Array.from(
    { length: generatorImages[0].length },
    () => undefined,
  );
  words[0] = [];
  const queue = [0];
  while (queue.length > 0) {
    const point = queue.shift()!;
    for (
      let generator = 0;
      generator < generatorImages.length;
      generator += 1
    ) {
      const image = generatorImages[generator][point];
      if (words[image] !== undefined) continue;
      words[image] = [...words[point]!, generator];
      queue.push(image);
    }
  }
  if (words.some((word) => word === undefined)) {
    throw new Error(
      "The six transpositions did not generate a transitive S4 action.",
    );
  }
  return words as number[][];
}

function assertIdealCubePresentation(system: CoxeterSystemInput): void {
  const expectedLabels = s4TranspositionPairs.map(
    ([left, right]) => `t${left + 1}${right + 1}`,
  );
  if (
    system.rank !== 6 ||
    system.generators.some(
      (generator, index) => generator.id !== expectedLabels[index],
    )
  ) {
    throw new Error(
      "The bundled S4 action requires generators t12, t13, t14, t23, t24, t34 in that order.",
    );
  }
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const rightLetters: readonly number[] = s4TranspositionPairs[right];
      const sharesLetter = s4TranspositionPairs[left].some((letter) =>
        rightLetters.includes(letter),
      );
      const expected = sharesLetter ? 3 : "inf";
      if (system.coxeterMatrix[left][right] !== expected) {
        throw new Error(
          `The bundled S4 action does not match Coxeter entry (${left}, ${right}).`,
        );
      }
    }
  }
}

/**
 * Return the regular right action of S4 induced by t_ij -> (ij).
 *
 * The action itself is exact finite data.  Torsion-freeness is not inferred
 * here; `buildIdealHyperbolic3CubeS4Cover` runs the exhaustive spherical-
 * subgroup certificate before converting this candidate into a cover.
 */
export function createIdealHyperbolic3CubeS4Action(
  system: CoxeterSystemInput,
): TorsionFreeActionCandidate {
  assertIdealCubePresentation(system);
  const elements = permutations([0, 1, 2, 3]);
  const pointByKey = new Map(
    elements.map((permutation, point) => [permutationKey(permutation), point]),
  );
  const generators = s4TranspositionPairs.map(([left, right]) =>
    transposition(left, right),
  );
  const generatorImages = generators.map((generator) =>
    elements.map((element) => {
      const point = pointByKey.get(
        permutationKey(composePermutations(element, generator)),
      );
      if (point === undefined) {
        throw new Error("The deterministic S4 element table is incomplete.");
      }
      return point;
    }),
  );
  return {
    id: "ideal-3-cube-s4-regular",
    name: "ker(W -> S4), t_ij -> (ij)",
    index: elements.length,
    generatorImages,
    pointLabels: elements.map(cycleLabel),
    representativeWords: representativeWords(generatorImages),
    backend: "bundled-exact-s4-action",
    backendVersion: "1.0.0",
    source:
      "Explicit surjection W -> S4 sending t_ij to the transposition (ij).",
    notes: [
      "The six transpositions generate S4, so the kernel has index 24.",
      "Every spherical subgroup is A1 or A2; the in-repo certificate checks its regular action exactly.",
      "No minimum-index claim is made.",
    ],
  };
}

/** Build the bundled 24-sheet cover only after the exact action certificate passes. */
export function buildIdealHyperbolic3CubeS4Cover(
  system: CoxeterSystemInput,
): QuotientComplex {
  const candidate = createIdealHyperbolic3CubeS4Action(system);
  const sphericalPlan = planSphericalSpecialSubgroups(system);
  const certificate = certifyTorsionFreeAction(
    system,
    candidate,
    sphericalPlan,
  );
  if (certificate.status !== "passed") {
    throw new Error(
      `Bundled S4 kernel failed its torsion-free certificate: ${certificate.errors.join(" ")}`,
    );
  }
  return acceptedActionToQuotientComplex(
    system,
    { candidate, certificate },
    {
      name: "Regular ideal 3-cube S4-kernel cover (24 sheets)",
      subgroupName: "ker(W -> S4)",
      checkedAt: "1970-01-01T00:00:00.000Z",
    },
  );
}
