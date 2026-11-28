import type { CoxeterSystemInput } from "../types";
import type { TorsionFreeActionCandidate } from "./types";

export type CompactActionImportKind =
  | "generator-permutations"
  | "generator-permutation-files"
  | "subgroup-generators"
  | "finite-quotient-subgroup";

export interface GeneratorPermutationActionImport {
  schemaVersion: 1;
  kind: "generator-permutations";
  action: TorsionFreeActionCandidate;
}

/**
 * A permutation action whose rows live in flat binary files, one per
 * generator: `index` little-endian uint32 images, file size exactly 4*index.
 * This is the intake format for covers too large for JSON (tens of millions
 * of points); the manifest is small and pins every file by SHA-256.
 * File paths are relative to the manifest's directory.
 */
export interface PackedGeneratorPermutationFile {
  generator: number;
  path: string;
  sha256: string;
}

export interface GeneratorPermutationFilesImport {
  schemaVersion: 1;
  kind: "generator-permutation-files";
  action: {
    id: string;
    name?: string;
    index: number;
    encoding: "uint32le";
    files: PackedGeneratorPermutationFile[];
    backend?: string;
    backendVersion?: string;
    source?: string;
    notes?: string[];
  };
}

export interface SubgroupGeneratorActionImport {
  schemaVersion: 1;
  kind: "subgroup-generators";
  id: string;
  name?: string;
  subgroupGenerators: number[][];
  expectedIndex?: number;
  maxCosets?: number;
  timeoutSeconds?: number;
  memoryMb?: number;
  source?: string;
  notes?: string[];
}

export interface FiniteQuotientSubgroupActionImport {
  schemaVersion: 1;
  kind: "finite-quotient-subgroup";
  id: string;
  name?: string;
  quotient: {
    permutationDegree: number;
    generatorImages: number[][];
    expectedOrder?: number;
    source?: string;
  };
  subgroupGeneratorWords: number[][];
  expectedIndex?: number;
  limits?: {
    maxQuotientElements?: number;
    maxPermutationEntries?: number;
  };
  source?: string;
  notes?: string[];
}

export type CompactActionImportInput =
  | GeneratorPermutationActionImport
  | GeneratorPermutationFilesImport
  | SubgroupGeneratorActionImport
  | FiniteQuotientSubgroupActionImport;

export interface FiniteQuotientMaterialization {
  candidate: TorsionFreeActionCandidate;
  diagnostics: {
    quotientPermutationDegree: number;
    quotientOrder: number;
    subgroupOrder: number;
    actionDegree: number;
    quotientPermutationEntries: number;
  };
}

const DEFAULT_MAX_QUOTIENT_ELEMENTS = 100_000;
const DEFAULT_MAX_PERMUTATION_ENTRIES = 8_000_000;
const MAX_SUBGROUP_GENERATOR_WORDS = 100_000;
const MAX_SUBGROUP_GENERATOR_LETTERS = 1_000_000;

function inputError(message: string): never {
  throw new Error(`Compact action import: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    inputError(`${label} has unknown fields: ${unknown.sort().join(", ")}.`);
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    inputError(`${label} must be a positive safe integer.`);
  }
  return value as number;
}

function optionalPositiveInteger(
  value: unknown,
  label: string,
): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, label);
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    inputError(`${label} must be a nonempty string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : nonemptyString(value, label);
}

function optionalStringArray(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    inputError(`${label} must be an array of strings.`);
  }
  return value as string[];
}

function parseWords(
  value: unknown,
  rank: number,
  label: string,
  bounds: { maximumWords?: number; maximumLetters?: number } = {},
): number[][] {
  if (!Array.isArray(value)) inputError(`${label} must be an array of words.`);
  const maximumWords = bounds.maximumWords ?? MAX_SUBGROUP_GENERATOR_WORDS;
  const maximumLetters =
    bounds.maximumLetters ?? MAX_SUBGROUP_GENERATOR_LETTERS;
  if (value.length > maximumWords) {
    inputError(`${label} exceeds the ${maximumWords}-word input bound.`);
  }
  let totalLetters = 0;
  return value.map((rawWord, wordIndex) => {
    if (!Array.isArray(rawWord)) {
      inputError(`${label}[${wordIndex}] must be an array.`);
    }
    totalLetters += rawWord.length;
    if (totalLetters > maximumLetters) {
      inputError(`${label} exceeds the ${maximumLetters}-letter input bound.`);
    }
    return rawWord.map((letter, letterIndex) => {
      if (
        !Number.isSafeInteger(letter) ||
        (letter as number) < 0 ||
        (letter as number) >= rank
      ) {
        inputError(
          `${label}[${wordIndex}][${letterIndex}] must lie in 0..${rank - 1}.`,
        );
      }
      return letter as number;
    });
  });
}

function parsePermutationRows(
  value: unknown,
  rowCount: number,
  degree: number,
  label: string,
): number[][] {
  if (!Array.isArray(value) || value.length !== rowCount) {
    inputError(`${label} must contain exactly ${rowCount} rows.`);
  }
  return value.map((rawRow, generator) => {
    if (!Array.isArray(rawRow) || rawRow.length !== degree) {
      inputError(
        `${label}[${generator}] must contain exactly ${degree} images.`,
      );
    }
    const seen = new Uint8Array(degree);
    return rawRow.map((rawImage, point) => {
      if (
        !Number.isSafeInteger(rawImage) ||
        (rawImage as number) < 0 ||
        (rawImage as number) >= degree
      ) {
        inputError(
          `${label}[${generator}][${point}] must lie in 0..${degree - 1}.`,
        );
      }
      const image = rawImage as number;
      if (seen[image]) {
        inputError(`${label}[${generator}] repeats image ${image}.`);
      }
      seen[image] = 1;
      return image;
    });
  });
}

/**
 * Range and bijection check for one packed row.  Uint32 storage already rules
 * out negative and fractional images, so only the upper bound is tested.
 */
export function validatePackedPermutationRow(
  row: Uint32Array,
  degree: number,
  label: string,
): void {
  if (row.length !== degree) {
    inputError(`${label} must contain exactly ${degree} images.`);
  }
  const seen = new Uint8Array(degree);
  for (let point = 0; point < degree; point += 1) {
    const image = row[point];
    if (image >= degree) {
      inputError(`${label}[${point}] must lie in 0..${degree - 1}.`);
    }
    if (seen[image] !== 0) inputError(`${label} repeats image ${image}.`);
    seen[image] = 1;
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;

function parsePermutationFiles(
  value: unknown,
  system: CoxeterSystemInput,
): GeneratorPermutationFilesImport["action"] {
  if (!isRecord(value)) inputError("action must be an object.");
  assertKnownKeys(
    value,
    [
      "id",
      "name",
      "index",
      "encoding",
      "files",
      "backend",
      "backendVersion",
      "source",
      "notes",
    ],
    "action",
  );
  if (value.encoding !== "uint32le") {
    inputError('action.encoding must be "uint32le".');
  }
  const index = positiveInteger(value.index, "action.index");
  if (index > 0xffff_ffff)
    inputError("action.index does not fit uint32 images.");
  if (!Array.isArray(value.files) || value.files.length !== system.rank) {
    inputError(
      `action.files must list exactly ${system.rank} generator files.`,
    );
  }
  const seenGenerators = new Set<number>();
  const files = value.files.map((raw, position) => {
    const label = `action.files[${position}]`;
    if (!isRecord(raw)) inputError(`${label} must be an object.`);
    assertKnownKeys(raw, ["generator", "path", "sha256"], label);
    const generator = raw.generator;
    if (
      !Number.isSafeInteger(generator) ||
      (generator as number) < 0 ||
      (generator as number) >= system.rank ||
      seenGenerators.has(generator as number)
    ) {
      inputError(`${label}.generator must be a distinct generator index.`);
    }
    seenGenerators.add(generator as number);
    const path = nonemptyString(raw.path, `${label}.path`);
    if (
      path.startsWith("/") ||
      /^[A-Za-z]:/u.test(path) ||
      path.split(/[\\/]/u).includes("..")
    ) {
      inputError(
        `${label}.path must be relative to the manifest without "..".`,
      );
    }
    if (typeof raw.sha256 !== "string" || !SHA256_HEX.test(raw.sha256)) {
      inputError(`${label}.sha256 must be 64 lowercase hex digits.`);
    }
    return { generator: generator as number, path, sha256: raw.sha256 };
  });
  files.sort((left, right) => left.generator - right.generator);
  return {
    id: nonemptyString(value.id, "action.id"),
    index,
    encoding: "uint32le",
    files,
    ...(optionalString(value.name, "action.name")
      ? { name: value.name as string }
      : {}),
    ...(optionalString(value.backend, "action.backend")
      ? { backend: value.backend as string }
      : {}),
    ...(optionalString(value.backendVersion, "action.backendVersion")
      ? { backendVersion: value.backendVersion as string }
      : {}),
    ...(optionalString(value.source, "action.source")
      ? { source: value.source as string }
      : {}),
    ...(optionalStringArray(value.notes, "action.notes")
      ? { notes: value.notes as string[] }
      : {}),
  };
}

function parseCandidate(
  value: unknown,
  system: CoxeterSystemInput,
): TorsionFreeActionCandidate {
  if (!isRecord(value)) inputError("action must be an object.");
  assertKnownKeys(
    value,
    [
      "id",
      "name",
      "index",
      "generatorImages",
      "pointLabels",
      "representativeWords",
      "backend",
      "backendVersion",
      "source",
      "notes",
    ],
    "action",
  );
  const id = nonemptyString(value.id, "action.id");
  const index = positiveInteger(value.index, "action.index");
  const generatorImages = parsePermutationRows(
    value.generatorImages,
    system.rank,
    index,
    "action.generatorImages",
  );
  const pointLabels = optionalStringArray(
    value.pointLabels,
    "action.pointLabels",
  );
  if (pointLabels && pointLabels.length !== index) {
    inputError(`action.pointLabels must contain exactly ${index} entries.`);
  }
  const representativeWords =
    value.representativeWords === undefined
      ? undefined
      : parseWords(
          value.representativeWords,
          system.rank,
          "action.representativeWords",
          { maximumWords: index, maximumLetters: 50_000_000 },
        );
  if (representativeWords && representativeWords.length !== index) {
    inputError(
      `action.representativeWords must contain exactly ${index} words.`,
    );
  }
  return {
    id,
    index,
    generatorImages,
    ...(optionalString(value.name, "action.name")
      ? { name: value.name as string }
      : {}),
    ...(pointLabels ? { pointLabels } : {}),
    ...(representativeWords ? { representativeWords } : {}),
    ...(optionalString(value.backend, "action.backend")
      ? { backend: value.backend as string }
      : {}),
    ...(optionalString(value.backendVersion, "action.backendVersion")
      ? { backendVersion: value.backendVersion as string }
      : {}),
    ...(optionalString(value.source, "action.source")
      ? { source: value.source as string }
      : {}),
    ...(optionalStringArray(value.notes, "action.notes")
      ? { notes: value.notes as string[] }
      : {}),
  };
}

/** Parse one acquisition format without trusting any mathematical claim in it. */
export function parseCompactActionImport(
  raw: unknown,
  system: CoxeterSystemInput,
): CompactActionImportInput {
  if (!isRecord(raw)) inputError("the input must be an object.");
  if (raw.schemaVersion !== 1) inputError("schemaVersion must be 1.");
  const kind = nonemptyString(raw.kind, "kind") as CompactActionImportKind;
  if (kind === "generator-permutations") {
    assertKnownKeys(raw, ["schemaVersion", "kind", "action"], "input");
    return {
      schemaVersion: 1,
      kind,
      action: parseCandidate(raw.action, system),
    };
  }
  if (kind === "generator-permutation-files") {
    assertKnownKeys(raw, ["schemaVersion", "kind", "action"], "input");
    return {
      schemaVersion: 1,
      kind,
      action: parsePermutationFiles(raw.action, system),
    };
  }
  if (kind === "subgroup-generators") {
    assertKnownKeys(
      raw,
      [
        "schemaVersion",
        "kind",
        "id",
        "name",
        "subgroupGenerators",
        "expectedIndex",
        "maxCosets",
        "timeoutSeconds",
        "memoryMb",
        "source",
        "notes",
      ],
      "input",
    );
    return {
      schemaVersion: 1,
      kind,
      id: nonemptyString(raw.id, "id"),
      subgroupGenerators: parseWords(
        raw.subgroupGenerators,
        system.rank,
        "subgroupGenerators",
      ),
      ...(optionalString(raw.name, "name") ? { name: raw.name as string } : {}),
      ...(optionalPositiveInteger(raw.expectedIndex, "expectedIndex")
        ? { expectedIndex: raw.expectedIndex as number }
        : {}),
      ...(optionalPositiveInteger(raw.maxCosets, "maxCosets")
        ? { maxCosets: raw.maxCosets as number }
        : {}),
      ...(optionalPositiveInteger(raw.timeoutSeconds, "timeoutSeconds")
        ? { timeoutSeconds: raw.timeoutSeconds as number }
        : {}),
      ...(optionalPositiveInteger(raw.memoryMb, "memoryMb")
        ? { memoryMb: raw.memoryMb as number }
        : {}),
      ...(optionalString(raw.source, "source")
        ? { source: raw.source as string }
        : {}),
      ...(optionalStringArray(raw.notes, "notes")
        ? { notes: raw.notes as string[] }
        : {}),
    };
  }
  if (kind === "finite-quotient-subgroup") {
    assertKnownKeys(
      raw,
      [
        "schemaVersion",
        "kind",
        "id",
        "name",
        "quotient",
        "subgroupGeneratorWords",
        "expectedIndex",
        "limits",
        "source",
        "notes",
      ],
      "input",
    );
    if (!isRecord(raw.quotient)) inputError("quotient must be an object.");
    assertKnownKeys(
      raw.quotient,
      ["permutationDegree", "generatorImages", "expectedOrder", "source"],
      "quotient",
    );
    const permutationDegree = positiveInteger(
      raw.quotient.permutationDegree,
      "quotient.permutationDegree",
    );
    const limits = raw.limits;
    if (limits !== undefined && !isRecord(limits)) {
      inputError("limits must be an object when supplied.");
    }
    if (isRecord(limits)) {
      assertKnownKeys(
        limits,
        ["maxQuotientElements", "maxPermutationEntries"],
        "limits",
      );
    }
    return {
      schemaVersion: 1,
      kind,
      id: nonemptyString(raw.id, "id"),
      quotient: {
        permutationDegree,
        generatorImages: parsePermutationRows(
          raw.quotient.generatorImages,
          system.rank,
          permutationDegree,
          "quotient.generatorImages",
        ),
        ...(optionalPositiveInteger(
          raw.quotient.expectedOrder,
          "quotient.expectedOrder",
        )
          ? { expectedOrder: raw.quotient.expectedOrder as number }
          : {}),
        ...(optionalString(raw.quotient.source, "quotient.source")
          ? { source: raw.quotient.source as string }
          : {}),
      },
      subgroupGeneratorWords: parseWords(
        raw.subgroupGeneratorWords,
        system.rank,
        "subgroupGeneratorWords",
      ),
      ...(optionalString(raw.name, "name") ? { name: raw.name as string } : {}),
      ...(optionalPositiveInteger(raw.expectedIndex, "expectedIndex")
        ? { expectedIndex: raw.expectedIndex as number }
        : {}),
      ...(limits
        ? {
            limits: {
              ...(optionalPositiveInteger(
                limits.maxQuotientElements,
                "limits.maxQuotientElements",
              )
                ? {
                    maxQuotientElements: limits.maxQuotientElements as number,
                  }
                : {}),
              ...(optionalPositiveInteger(
                limits.maxPermutationEntries,
                "limits.maxPermutationEntries",
              )
                ? {
                    maxPermutationEntries:
                      limits.maxPermutationEntries as number,
                  }
                : {}),
            },
          }
        : {}),
      ...(optionalString(raw.source, "source")
        ? { source: raw.source as string }
        : {}),
      ...(optionalStringArray(raw.notes, "notes")
        ? { notes: raw.notes as string[] }
        : {}),
    };
  }
  inputError(
    "kind must be generator-permutations, subgroup-generators, or finite-quotient-subgroup.",
  );
}

function identityPermutation(degree: number): number[] {
  return Array.from({ length: degree }, (_unused, point) => point);
}

// Rows encode a right action. Applying `left` and then `right` gives
// right[left[p]], which is the permutation for the product left*right.
function multiplyPermutations(
  left: readonly number[],
  right: readonly number[],
): number[] {
  return left.map((image) => right[image]);
}

function inversePermutation(permutation: readonly number[]): number[] {
  const inverse = new Array<number>(permutation.length);
  for (let point = 0; point < permutation.length; point += 1) {
    inverse[permutation[point]] = point;
  }
  return inverse;
}

function permutationKey(permutation: readonly number[]): string {
  return permutation.join(",");
}

function permutationPower(
  permutation: readonly number[],
  exponent: number,
): number[] {
  let result = identityPermutation(permutation.length);
  let factor = [...permutation];
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) result = multiplyPermutations(result, factor);
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) factor = multiplyPermutations(factor, factor);
  }
  return result;
}

function assertCoxeterRelations(
  system: CoxeterSystemInput,
  rows: readonly number[][],
): void {
  const identityKey = permutationKey(identityPermutation(rows[0].length));
  for (let generator = 0; generator < system.rank; generator += 1) {
    if (
      permutationKey(multiplyPermutations(rows[generator], rows[generator])) !==
      identityKey
    ) {
      inputError(`quotient generator ${generator} is not an involution.`);
    }
  }
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const order = system.coxeterMatrix[left][right];
      if (order === "inf") continue;
      const product = multiplyPermutations(rows[left], rows[right]);
      if (permutationKey(permutationPower(product, order)) !== identityKey) {
        inputError(
          `quotient generators ${left},${right} violate their Coxeter relation.`,
        );
      }
    }
  }
}

function evaluateWord(
  word: readonly number[],
  rows: readonly number[][],
): number[] {
  let result = identityPermutation(rows[0].length);
  for (const generator of word) {
    result = multiplyPermutations(result, rows[generator]);
  }
  return result;
}

function enumeratePermutationGroup(
  degree: number,
  generators: readonly number[][],
  maximumElements: number,
  maximumEntries: number,
  label: string,
): { elements: number[][]; keyToIndex: Map<string, number> } {
  const identity = identityPermutation(degree);
  const elements = [identity];
  const keyToIndex = new Map([[permutationKey(identity), 0]]);
  const expandedGenerators = [
    ...generators,
    ...generators.map((generator) => inversePermutation(generator)),
  ];
  for (let cursor = 0; cursor < elements.length; cursor += 1) {
    for (const generator of expandedGenerators) {
      const next = multiplyPermutations(elements[cursor], generator);
      const key = permutationKey(next);
      if (keyToIndex.has(key)) continue;
      if (elements.length >= maximumElements) {
        inputError(
          `${label} exceeds the ${maximumElements}-element enumeration bound.`,
        );
      }
      if ((elements.length + 1) * degree > maximumEntries) {
        inputError(
          `${label} exceeds the ${maximumEntries}-entry memory bound.`,
        );
      }
      keyToIndex.set(key, elements.length);
      elements.push(next);
    }
  }
  return { elements, keyToIndex };
}

/**
 * Convert an explicit finite quotient Q and words generating L<Q into the
 * transitive right action on L\Q. This route is deliberately bounded because
 * it enumerates Q; a precomputed coset action should use generator-permutations.
 */
export function materializeFiniteQuotientSubgroupAction(
  system: CoxeterSystemInput,
  input: FiniteQuotientSubgroupActionImport,
): FiniteQuotientMaterialization {
  const rows = input.quotient.generatorImages;
  assertCoxeterRelations(system, rows);
  const maximumElements =
    input.limits?.maxQuotientElements ?? DEFAULT_MAX_QUOTIENT_ELEMENTS;
  const maximumEntries =
    input.limits?.maxPermutationEntries ?? DEFAULT_MAX_PERMUTATION_ENTRIES;
  if (rows.length * input.quotient.permutationDegree > maximumEntries) {
    inputError(
      "the supplied quotient rows already exceed maxPermutationEntries.",
    );
  }
  const quotient = enumeratePermutationGroup(
    input.quotient.permutationDegree,
    rows,
    maximumElements,
    maximumEntries,
    "finite quotient image",
  );
  if (
    input.quotient.expectedOrder !== undefined &&
    input.quotient.expectedOrder !== quotient.elements.length
  ) {
    inputError(
      `finite quotient image has order ${quotient.elements.length}, not expected order ${input.quotient.expectedOrder}.`,
    );
  }
  const subgroupGenerators = input.subgroupGeneratorWords.map((word) =>
    evaluateWord(word, rows),
  );
  const subgroup = enumeratePermutationGroup(
    input.quotient.permutationDegree,
    subgroupGenerators,
    Math.min(maximumElements, quotient.elements.length),
    maximumEntries,
    "finite quotient subgroup",
  );
  for (const key of subgroup.keyToIndex.keys()) {
    if (!quotient.keyToIndex.has(key)) {
      inputError(
        "the enumerated subgroup is not contained in the quotient image.",
      );
    }
  }

  const elementCoset = new Int32Array(quotient.elements.length);
  elementCoset.fill(-1);
  const representatives: number[] = [];
  for (
    let elementIndex = 0;
    elementIndex < quotient.elements.length;
    elementIndex += 1
  ) {
    if (elementCoset[elementIndex] >= 0) continue;
    const cosetIndex = representatives.length;
    representatives.push(elementIndex);
    for (const subgroupElement of subgroup.elements) {
      const member = multiplyPermutations(
        subgroupElement,
        quotient.elements[elementIndex],
      );
      const memberIndex = quotient.keyToIndex.get(permutationKey(member));
      if (memberIndex === undefined) {
        inputError("left-coset construction left the finite quotient image.");
      }
      if (
        elementCoset[memberIndex] >= 0 &&
        elementCoset[memberIndex] !== cosetIndex
      ) {
        inputError("left-coset construction produced overlapping cosets.");
      }
      elementCoset[memberIndex] = cosetIndex;
    }
  }
  if (elementCoset.some((coset) => coset < 0)) {
    inputError("left-coset construction did not cover the quotient image.");
  }
  if (
    quotient.elements.length !==
    subgroup.elements.length * representatives.length
  ) {
    inputError(
      "the finite quotient order does not equal subgroup order times index.",
    );
  }
  if (
    input.expectedIndex !== undefined &&
    input.expectedIndex !== representatives.length
  ) {
    inputError(
      `finite quotient subgroup has index ${representatives.length}, not expected index ${input.expectedIndex}.`,
    );
  }
  const actionRows = rows.map((generatorRow) =>
    representatives.map((representativeIndex) => {
      const target = multiplyPermutations(
        quotient.elements[representativeIndex],
        generatorRow,
      );
      const targetIndex = quotient.keyToIndex.get(permutationKey(target));
      if (targetIndex === undefined) {
        inputError(
          "a quotient generator step left the enumerated quotient image.",
        );
      }
      return elementCoset[targetIndex];
    }),
  );
  return {
    candidate: {
      id: input.id,
      name:
        input.name ?? `${system.name} action from a finite quotient subgroup`,
      index: representatives.length,
      generatorImages: actionRows,
      pointLabels: representatives.map((_unused, index) => `Lq${index}`),
      backend: "in-repo-finite-quotient-coset-materializer",
      backendVersion: "1",
      source:
        input.source ??
        input.quotient.source ??
        "user-supplied finite quotient and subgroup words",
      notes: [
        ...(input.notes ?? []),
        `Enumerated a quotient image of order ${quotient.elements.length} and a subgroup of order ${subgroup.elements.length}.`,
        "Torsion-freeness is not inherited from this import statement; the downstream spherical-action replay decides it.",
      ],
    },
    diagnostics: {
      quotientPermutationDegree: input.quotient.permutationDegree,
      quotientOrder: quotient.elements.length,
      subgroupOrder: subgroup.elements.length,
      actionDegree: representatives.length,
      quotientPermutationEntries:
        quotient.elements.length * input.quotient.permutationDegree,
    },
  };
}
