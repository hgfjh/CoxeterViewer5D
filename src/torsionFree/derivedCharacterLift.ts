import { parseCoxeterSystemInput } from "../coxeter";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import type { TorsionFreeActionCandidate } from "./types";

export const EXACT_Z2_CHARACTER_LIFT_KIND =
  "coxeter-exact-z2-character-lift" as const;

export const MAX_EXACT_Z2_LIFT_DEGREE = 2_000_000;
export const MAX_EXACT_Z2_LIFT_IMAGE_ENTRIES = 20_000_000;

const BACKEND_ID = "exact-z2-character-lift" as const;
const BACKEND_VERSION = "1" as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export type Z2Value = 0 | 1;

export interface ExactZ2CharacterViolation {
  generatorPair: [number, number];
  exponent: number;
  values: [Z2Value, Z2Value];
}

export interface ExactZ2ActionWitness {
  kind:
    | "parent-intransitive"
    | "parent-non-involution"
    | "parent-relation-failure"
    | "character-relation-failure"
    | "derived-intransitive"
    | "derived-non-involution"
    | "derived-relation-failure"
    | "parent-row-hash-mismatch"
    | "derived-row-hash-mismatch";
  message: string;
  generator?: number;
  generatorPair?: [number, number];
  exponent?: number;
  point?: number;
  image?: number;
  unreachablePointCount?: number;
  unreachablePointSample?: number[];
  expectedSha256?: string;
  actualSha256?: string;
}

export interface BuildExactZ2CharacterLiftOptions {
  candidateId?: string;
  candidateName?: string;
  expectedParentRowsSha256?: string;
  expectedDerivedRowsSha256?: string;
}

export interface ExactZ2CharacterLiftCertificate {
  schemaVersion: 1;
  kind: typeof EXACT_Z2_CHARACTER_LIFT_KIND;
  status: "accepted" | "rejected";
  method: "exact-product-action-by-z2-character";
  system: {
    name: string;
    rank: number;
    canonicalSha256: string;
  };
  parentAction: {
    candidateId: string;
    index: number;
    backend?: string;
    rowsCanonicalSha256: string;
  };
  character: {
    values: Z2Value[];
    oddEdgeComponents: number[][];
    relationViolations: ExactZ2CharacterViolation[];
    canonicalSha256: string;
  };
  pointEncoding: {
    formula: "2 * parentPoint + sheetBit";
    parentPointFormula: "floor(liftedPoint / 2)";
    sheetBitFormula: "liftedPoint mod 2";
    generatorFormula: "2 * rho_g(parentPoint) + (sheetBit xor chi_g)";
  };
  derivedAction: {
    candidateId: string;
    index: number;
    generatorCount: number;
    generatorImageEntryCount: number;
    rowsCanonicalSha256: string;
    actionEnvelopeCanonicalSha256: string;
  };
  checks: {
    parentRowsInBoundsAndPermutations: boolean;
    parentTransitive: boolean;
    parentGeneratorsInvolutive: boolean;
    parentCoxeterRelations: boolean;
    characterRespectsOddCoxeterRelations: boolean;
    derivedRowsInBoundsAndPermutations: boolean;
    derivedTransitive: boolean;
    derivedGeneratorsInvolutive: boolean;
    derivedCoxeterRelations: boolean;
    parentRowsSha256MatchesExpectation: boolean;
    derivedRowsSha256MatchesExpectation: boolean;
  };
  witnesses: ExactZ2ActionWitness[];
  claims: string[];
  nonClaims: string[];
  certificateCanonicalSha256: string;
}

/**
 * `acceptedCandidate` is present only after the product rows have passed every
 * exact action and transitivity check. Acceptance here is as a Coxeter action;
 * it does not silently attach a search backend's torsion-free provenance.
 */
export interface ExactZ2CharacterLiftResult {
  certificate: ExactZ2CharacterLiftCertificate;
  acceptedCandidate?: TorsionFreeActionCandidate;
}

interface RelationFailure {
  generatorPair: [number, number];
  exponent: number;
  point: number;
  image: number;
}

interface InvolutionFailure {
  generator: number;
  point: number;
  image: number;
}

interface TransitivityCheck {
  transitive: boolean;
  unreachablePointCount: number;
  unreachablePointSample: number[];
}

function requiredSha256(
  value: string | undefined,
  path: string,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`${path} must be a 64-digit hexadecimal SHA-256 digest.`);
  }
  return normalized;
}

function parseCharacter(values: readonly number[], rank: number): Z2Value[] {
  if (!Array.isArray(values) || values.length !== rank) {
    throw new Error(`character must contain exactly ${rank} entries.`);
  }
  return values.map((value, generator) => {
    if (value !== 0 && value !== 1) {
      throw new Error(`character[${generator}] must be 0 or 1.`);
    }
    return value;
  });
}

function assertPermutationRows(
  candidate: TorsionFreeActionCandidate,
  generatorCount: number,
): number[][] {
  if (!Number.isSafeInteger(candidate.index) || candidate.index < 1) {
    throw new Error("parent.index must be a positive safe integer.");
  }
  if (
    !Array.isArray(candidate.generatorImages) ||
    candidate.generatorImages.length !== generatorCount
  ) {
    throw new Error(
      `parent.generatorImages must contain exactly ${generatorCount} rows.`,
    );
  }

  const degree = candidate.index;
  return candidate.generatorImages.map((rawRow, generator) => {
    if (!Array.isArray(rawRow) || rawRow.length !== degree) {
      throw new Error(
        `parent.generatorImages[${generator}] must contain exactly ${degree} images.`,
      );
    }
    const seen = new Uint8Array(degree);
    const row = Array<number>(degree);
    for (let point = 0; point < degree; point += 1) {
      const image = rawRow[point];
      if (!Number.isSafeInteger(image) || image < 0 || image >= degree) {
        throw new Error(
          `parent.generatorImages[${generator}][${point}] must be an integer in 0..${degree - 1}.`,
        );
      }
      if (seen[image] !== 0) {
        throw new Error(
          `parent.generatorImages[${generator}] is not a permutation: image ${image} is repeated.`,
        );
      }
      seen[image] = 1;
      row[point] = image;
    }
    return row;
  });
}

function assertLiftSize(degree: number, generatorCount: number): number {
  const liftedDegree = degree * 2;
  if (!Number.isSafeInteger(liftedDegree)) {
    throw new Error("Doubling parent.index exceeds the safe-integer range.");
  }
  if (liftedDegree > MAX_EXACT_Z2_LIFT_DEGREE) {
    throw new Error(
      `The lifted degree ${liftedDegree} exceeds the limit ${MAX_EXACT_Z2_LIFT_DEGREE}.`,
    );
  }
  const entryCount = BigInt(liftedDegree) * BigInt(generatorCount);
  if (entryCount > BigInt(MAX_EXACT_Z2_LIFT_IMAGE_ENTRIES)) {
    throw new Error(
      `The lift would contain ${entryCount} generator images; the limit is ${MAX_EXACT_Z2_LIFT_IMAGE_ENTRIES}.`,
    );
  }
  return liftedDegree;
}

function oddEdgeComponents(system: CoxeterSystemInput): number[][] {
  const parent = Array.from(
    { length: system.rank },
    (_, generator) => generator,
  );

  const find = (generator: number): number => {
    let root = generator;
    while (parent[root] !== root) root = parent[root];
    let current = generator;
    while (parent[current] !== current) {
      const next = parent[current];
      parent[current] = root;
      current = next;
    }
    return root;
  };

  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const exponent = system.coxeterMatrix[left][right];
      if (exponent !== "inf" && exponent % 2 === 1) union(left, right);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let generator = 0; generator < system.rank; generator += 1) {
    const root = find(generator);
    const component = byRoot.get(root) ?? [];
    component.push(generator);
    byRoot.set(root, component);
  }
  return [...byRoot.values()].sort((left, right) => left[0] - right[0]);
}

function characterViolations(
  system: CoxeterSystemInput,
  character: readonly Z2Value[],
): ExactZ2CharacterViolation[] {
  const violations: ExactZ2CharacterViolation[] = [];
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const exponent = system.coxeterMatrix[left][right];
      if (
        exponent !== "inf" &&
        exponent % 2 === 1 &&
        character[left] !== character[right]
      ) {
        violations.push({
          generatorPair: [left, right],
          exponent,
          values: [character[left], character[right]],
        });
      }
    }
  }
  return violations;
}

function firstInvolutionFailure(
  rows: readonly (readonly number[])[],
): InvolutionFailure | undefined {
  for (let generator = 0; generator < rows.length; generator += 1) {
    const row = rows[generator];
    for (let point = 0; point < row.length; point += 1) {
      const image = row[row[point]];
      if (image !== point) return { generator, point, image };
    }
  }
  return undefined;
}

function firstCoxeterRelationFailure(
  system: CoxeterSystemInput,
  rows: readonly (readonly number[])[],
): RelationFailure | undefined {
  const degree = rows[0].length;
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const exponent = system.coxeterMatrix[left][right];
      if (exponent === "inf") continue;
      for (let point = 0; point < degree; point += 1) {
        let image = point;
        for (let repeat = 0; repeat < exponent; repeat += 1) {
          image = rows[right][rows[left][image]];
        }
        if (image !== point) {
          return {
            generatorPair: [left, right],
            exponent,
            point,
            image,
          };
        }
      }
    }
  }
  return undefined;
}

function checkTransitivity(
  rows: readonly (readonly number[])[],
): TransitivityCheck {
  const degree = rows[0].length;
  const reached = new Uint8Array(degree);
  const queue = new Int32Array(degree);
  reached[0] = 1;
  queue[0] = 0;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const point = queue[head];
    head += 1;
    for (const row of rows) {
      const image = row[point];
      if (reached[image] === 0) {
        reached[image] = 1;
        queue[tail] = image;
        tail += 1;
      }
    }
  }

  if (tail === degree) {
    return {
      transitive: true,
      unreachablePointCount: 0,
      unreachablePointSample: [],
    };
  }
  const unreachablePointSample: number[] = [];
  for (
    let point = 0;
    point < degree && unreachablePointSample.length < 32;
    point += 1
  ) {
    if (reached[point] === 0) unreachablePointSample.push(point);
  }
  return {
    transitive: false,
    unreachablePointCount: degree - tail,
    unreachablePointSample,
  };
}

function buildLiftedRows(
  parentRows: readonly (readonly number[])[],
  character: readonly Z2Value[],
): number[][] {
  const parentDegree = parentRows[0].length;
  return parentRows.map((parentRow, generator) => {
    const row = Array<number>(parentDegree * 2);
    const characterValue = character[generator];
    for (let parentPoint = 0; parentPoint < parentDegree; parentPoint += 1) {
      const targetParentPoint = parentRow[parentPoint];
      row[2 * parentPoint] = 2 * targetParentPoint + characterValue;
      row[2 * parentPoint + 1] = 2 * targetParentPoint + (1 ^ characterValue);
    }
    return row;
  });
}

function actionWitness(
  scope: "parent" | "derived",
  failure: InvolutionFailure | RelationFailure,
): ExactZ2ActionWitness {
  if ("generator" in failure) {
    return {
      kind:
        scope === "parent" ? "parent-non-involution" : "derived-non-involution",
      message: `${scope} generator ${failure.generator} is not involutive at point ${failure.point}.`,
      generator: failure.generator,
      point: failure.point,
      image: failure.image,
    };
  }
  return {
    kind:
      scope === "parent"
        ? "parent-relation-failure"
        : "derived-relation-failure",
    message: `${scope} relation (${failure.generatorPair[0]},${failure.generatorPair[1]})^${failure.exponent} fails at point ${failure.point}.`,
    generatorPair: failure.generatorPair,
    exponent: failure.exponent,
    point: failure.point,
    image: failure.image,
  };
}

/**
 * Builds the exact product action
 *
 *   rho'_g(2q+b) = 2 rho_g(q) + (b xor chi_g).
 *
 * Odd-labelled Coxeter edges are the only restrictions on a Z/2-valued
 * generator character: their endpoints must receive the same value.
 */
export function buildExactZ2CharacterLift(
  systemInput: unknown,
  parentCandidate: TorsionFreeActionCandidate,
  characterInput: readonly number[],
  options: BuildExactZ2CharacterLiftOptions = {},
): ExactZ2CharacterLiftResult {
  const system = parseCoxeterSystemInput(systemInput);
  const character = parseCharacter(characterInput, system.rank);
  const parentRows = assertPermutationRows(parentCandidate, system.rank);
  const liftedDegree = assertLiftSize(parentCandidate.index, system.rank);
  const expectedParentRowsSha256 = requiredSha256(
    options.expectedParentRowsSha256,
    "expectedParentRowsSha256",
  );
  const expectedDerivedRowsSha256 = requiredSha256(
    options.expectedDerivedRowsSha256,
    "expectedDerivedRowsSha256",
  );

  const parentRowsSha256 = canonicalSha256(parentRows);
  const parentTransitivity = checkTransitivity(parentRows);
  const parentInvolutionFailure = firstInvolutionFailure(parentRows);
  const parentRelationFailure = firstCoxeterRelationFailure(system, parentRows);
  const relationViolations = characterViolations(system, character);
  const components = oddEdgeComponents(system);
  const characterSha256 = canonicalSha256({
    systemCanonicalSha256: canonicalSha256(system),
    values: character,
    oddEdgeComponents: components,
  });

  const liftedRows = buildLiftedRows(parentRows, character);
  // The constructor above makes the bound/permutation property transparent,
  // but replay it independently before exposing an accepted candidate.
  const checkedLiftedRows = assertPermutationRows(
    {
      id: "derived-row-replay",
      index: liftedDegree,
      generatorImages: liftedRows,
    },
    system.rank,
  );
  const derivedRowsSha256 = canonicalSha256(checkedLiftedRows);
  const derivedTransitivity = checkTransitivity(checkedLiftedRows);
  const derivedInvolutionFailure = firstInvolutionFailure(checkedLiftedRows);
  const derivedRelationFailure = firstCoxeterRelationFailure(
    system,
    checkedLiftedRows,
  );

  const parentHashMatches =
    expectedParentRowsSha256 === undefined ||
    expectedParentRowsSha256 === parentRowsSha256;
  const derivedHashMatches =
    expectedDerivedRowsSha256 === undefined ||
    expectedDerivedRowsSha256 === derivedRowsSha256;
  const candidateId =
    options.candidateId ?? `${parentCandidate.id}-z2-character-lift`;
  const candidateName =
    options.candidateName ??
    `${parentCandidate.name ?? parentCandidate.id} exact Z/2-character lift`;
  const systemCanonicalSha256 = canonicalSha256(system);
  const actionEnvelopeCanonicalSha256 = canonicalSha256({
    schemaVersion: 1,
    kind: EXACT_Z2_CHARACTER_LIFT_KIND,
    systemCanonicalSha256,
    parentRowsCanonicalSha256: parentRowsSha256,
    characterCanonicalSha256: characterSha256,
    pointEncoding: "2q+b",
    candidateId,
    index: liftedDegree,
    generatorCount: system.rank,
    rowsCanonicalSha256: derivedRowsSha256,
  });

  const witnesses: ExactZ2ActionWitness[] = [];
  if (!parentTransitivity.transitive) {
    witnesses.push({
      kind: "parent-intransitive",
      message: `The parent orbit of point 0 omits ${parentTransitivity.unreachablePointCount} points.`,
      unreachablePointCount: parentTransitivity.unreachablePointCount,
      unreachablePointSample: parentTransitivity.unreachablePointSample,
    });
  }
  if (parentInvolutionFailure !== undefined) {
    witnesses.push(actionWitness("parent", parentInvolutionFailure));
  }
  if (parentRelationFailure !== undefined) {
    witnesses.push(actionWitness("parent", parentRelationFailure));
  }
  for (const violation of relationViolations) {
    witnesses.push({
      kind: "character-relation-failure",
      message: `Odd Coxeter edge (${violation.generatorPair[0]},${violation.generatorPair[1]}) has unequal character values ${violation.values[0]},${violation.values[1]}.`,
      generatorPair: violation.generatorPair,
      exponent: violation.exponent,
    });
  }
  if (!derivedTransitivity.transitive) {
    witnesses.push({
      kind: "derived-intransitive",
      message: `The lifted orbit of point 0 omits ${derivedTransitivity.unreachablePointCount} points.`,
      unreachablePointCount: derivedTransitivity.unreachablePointCount,
      unreachablePointSample: derivedTransitivity.unreachablePointSample,
    });
  }
  if (derivedInvolutionFailure !== undefined) {
    witnesses.push(actionWitness("derived", derivedInvolutionFailure));
  }
  if (derivedRelationFailure !== undefined) {
    witnesses.push(actionWitness("derived", derivedRelationFailure));
  }
  if (!parentHashMatches) {
    witnesses.push({
      kind: "parent-row-hash-mismatch",
      message:
        "The parent permutation-row hash does not match the expected digest.",
      expectedSha256: expectedParentRowsSha256,
      actualSha256: parentRowsSha256,
    });
  }
  if (!derivedHashMatches) {
    witnesses.push({
      kind: "derived-row-hash-mismatch",
      message:
        "The derived permutation-row hash does not match the expected digest.",
      expectedSha256: expectedDerivedRowsSha256,
      actualSha256: derivedRowsSha256,
    });
  }

  const checks = {
    parentRowsInBoundsAndPermutations: true,
    parentTransitive: parentTransitivity.transitive,
    parentGeneratorsInvolutive: parentInvolutionFailure === undefined,
    parentCoxeterRelations: parentRelationFailure === undefined,
    characterRespectsOddCoxeterRelations: relationViolations.length === 0,
    derivedRowsInBoundsAndPermutations: true,
    derivedTransitive: derivedTransitivity.transitive,
    derivedGeneratorsInvolutive: derivedInvolutionFailure === undefined,
    derivedCoxeterRelations: derivedRelationFailure === undefined,
    parentRowsSha256MatchesExpectation: parentHashMatches,
    derivedRowsSha256MatchesExpectation: derivedHashMatches,
  };
  const status: ExactZ2CharacterLiftCertificate["status"] = Object.values(
    checks,
  ).every(Boolean)
    ? "accepted"
    : "rejected";
  const certificateWithoutHash = {
    schemaVersion: 1 as const,
    kind: EXACT_Z2_CHARACTER_LIFT_KIND,
    status,
    method: "exact-product-action-by-z2-character" as const,
    system: {
      name: system.name,
      rank: system.rank,
      canonicalSha256: systemCanonicalSha256,
    },
    parentAction: {
      candidateId: parentCandidate.id,
      index: parentCandidate.index,
      ...(parentCandidate.backend === undefined
        ? {}
        : { backend: parentCandidate.backend }),
      rowsCanonicalSha256: parentRowsSha256,
    },
    character: {
      values: character,
      oddEdgeComponents: components,
      relationViolations,
      canonicalSha256: characterSha256,
    },
    pointEncoding: {
      formula: "2 * parentPoint + sheetBit" as const,
      parentPointFormula: "floor(liftedPoint / 2)" as const,
      sheetBitFormula: "liftedPoint mod 2" as const,
      generatorFormula:
        "2 * rho_g(parentPoint) + (sheetBit xor chi_g)" as const,
    },
    derivedAction: {
      candidateId,
      index: liftedDegree,
      generatorCount: system.rank,
      generatorImageEntryCount: liftedDegree * system.rank,
      rowsCanonicalSha256: derivedRowsSha256,
      actionEnvelopeCanonicalSha256,
    },
    checks,
    witnesses,
    claims: [
      "The displayed rows are the exact Z/2 product action for the recorded parent rows and character.",
      "Acceptance certifies row bounds, permutation shape, transitivity, involutions, and every finite Coxeter relation.",
      "If the parent point stabilizer is torsion-free, the lifted point stabilizer is torsion-free because it is a subgroup of the parent stabilizer.",
    ],
    nonClaims: [
      "This algebraic constructor does not replay or inherit the parent action's external provenance.",
      "The exact-z2-character-lift backend is not the packed-composite-permutation-module solver.",
      "Acceptance does not by itself certify that the parent point stabilizer is torsion-free.",
      "No lawful-subcomplex, Morse-link, asphericity, or virtual-fibering claim is made here.",
    ],
  };
  const certificate: ExactZ2CharacterLiftCertificate = {
    ...certificateWithoutHash,
    certificateCanonicalSha256: canonicalSha256(certificateWithoutHash),
  };

  if (status === "rejected") return { certificate };

  return {
    certificate,
    acceptedCandidate: {
      id: candidateId,
      name: candidateName,
      index: liftedDegree,
      generatorImages: checkedLiftedRows,
      backend: BACKEND_ID,
      backendVersion: BACKEND_VERSION,
      source: `Exact Z/2-character lift of action ${parentCandidate.id}.`,
      notes: [
        "Point q on sheet b is encoded as 2*q+b.",
        "This is a derived exact action, not a packed-solver output.",
      ],
    },
  };
}
