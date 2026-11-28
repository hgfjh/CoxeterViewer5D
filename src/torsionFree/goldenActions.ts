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
    throw new Error("The bundled generators did not act transitively.");
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

/**
 * The Coxeter matrix of the compact hyperbolic tetrahedron C(4,4;2,2;3,3) in
 * the labelling of docs/C44_2233_3D_Coxeter_Wall_Fibering_Writeup.md.
 */
export const C44_2233_COXETER_MATRIX = [
  [1, 3, 4, 2],
  [3, 1, 2, 4],
  [4, 2, 1, 3],
  [2, 4, 3, 1],
] as const;

/** Projective involutions r_0..r_3 in PSL(2,7), as [a, b, c, d] for (a b; c d). */
const C44_PSL27_INVOLUTIONS = [
  [0, 1, 6, 0],
  [0, 2, 3, 0],
  [3, 3, 6, 4],
  [3, 2, 2, 4],
] as const;

type ProjectiveSign = [number, number, number, number, number];

function multiplyMod7(x: ProjectiveSign, y: ProjectiveSign): ProjectiveSign {
  const p = 7;
  return [
    (x[0] * y[0] + x[1] * y[2]) % p,
    (x[0] * y[1] + x[1] * y[3]) % p,
    (x[2] * y[0] + x[3] * y[2]) % p,
    (x[2] * y[1] + x[3] * y[3]) % p,
    x[4] ^ y[4],
  ];
}

/** A matrix and its negative are the same element of PSL(2,7). */
function projectiveKey(x: ProjectiveSign): string {
  const negated = x.map((value, index) =>
    index < 4 ? (7 - value) % 7 : value,
  );
  const plain = x.join(",");
  const other = negated.join(",");
  return plain < other ? plain : other;
}

function assertC44Presentation(system: CoxeterSystemInput): void {
  const ok =
    system.rank === 4 &&
    C44_2233_COXETER_MATRIX.every((row, i) =>
      row.every((m, j) => system.coxeterMatrix[i][j] === m),
    );
  if (!ok) {
    throw new Error(
      "The bundled PSL(2,7) action requires the C(4,4;2,2;3,3) Coxeter matrix in the writeup's labelling.",
    );
  }
}

/**
 * Regular right action of the image of W = C(4,4;2,2;3,3) under
 * s_i -> (r_i, 1) in PSL(2,7) x C2 (Zimmermann's quotient, with reflection
 * parity adjoined).  The image has order 336.  As for the S4 action,
 * torsion-freeness is not inferred here; `buildC44Psl27Cover` certifies it.
 */
export function createC44Psl27Action(
  system: CoxeterSystemInput,
): TorsionFreeActionCandidate {
  assertC44Presentation(system);
  const generators = C44_PSL27_INVOLUTIONS.map(
    (r) => [...r, 1] as ProjectiveSign,
  );
  const identity: ProjectiveSign = [1, 0, 0, 1, 0];
  const elements: ProjectiveSign[] = [identity];
  const pointByKey = new Map([[projectiveKey(identity), 0]]);
  for (let head = 0; head < elements.length; head += 1) {
    for (const generator of generators) {
      const product = multiplyMod7(elements[head], generator);
      const key = projectiveKey(product);
      if (!pointByKey.has(key)) {
        pointByKey.set(key, elements.length);
        elements.push(product);
      }
    }
  }
  const generatorImages = generators.map((generator) =>
    elements.map(
      (element) =>
        pointByKey.get(projectiveKey(multiplyMod7(element, generator)))!,
    ),
  );
  return {
    id: "c44-2233-psl27-c2-regular",
    name: "ker(W -> PSL(2,7) x C2), s_i -> (r_i, 1)",
    index: elements.length,
    generatorImages,
    pointLabels: elements.map(
      ([a, b, c, d, parity]) =>
        `[[${a},${b}],[${c},${d}]]${parity ? "-" : "+"}`,
    ),
    representativeWords: representativeWords(generatorImages),
    backend: "bundled-exact-psl27-action",
    backendVersion: "1.0.0",
    source:
      "Explicit map W -> PSL(2,7) x C2 from docs/C44_2233_3D_Coxeter_Wall_Fibering_Writeup.md section 2 (after Zimmermann).",
    notes: [
      "The four projective involutions have pair-product orders equal to the Coxeter matrix and generate PSL(2,7); with parity the image has order 336.",
      "Every maximal spherical subgroup is B3 of order 48 and maps injectively, so the kernel is torsion-free; the in-repo certificate checks this exactly.",
      "The parity coordinate puts the kernel in the orientation-preserving subgroup, so the quotient is a closed orientable hyperbolic 3-manifold.",
    ],
  };
}

/** Build the bundled 336-sheet cover only after the exact action certificate passes. */
export function buildC44Psl27Cover(
  system: CoxeterSystemInput,
): QuotientComplex {
  const candidate = createC44Psl27Action(system);
  const certificate = certifyTorsionFreeAction(
    system,
    candidate,
    planSphericalSpecialSubgroups(system),
  );
  if (certificate.status !== "passed") {
    throw new Error(
      `Bundled PSL(2,7) kernel failed its torsion-free certificate: ${certificate.errors.join(" ")}`,
    );
  }
  return acceptedActionToQuotientComplex(
    system,
    { candidate, certificate },
    {
      name: "C(4,4;2,2;3,3) PSL(2,7) x C2 kernel cover (336 sheets)",
      subgroupName: "ker(W -> PSL(2,7) x C2)",
      checkedAt: "1970-01-01T00:00:00.000Z",
    },
  );
}
