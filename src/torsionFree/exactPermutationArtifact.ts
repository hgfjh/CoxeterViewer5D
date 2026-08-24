import { parseCoxeterSystemInput } from "../coxeter";
import { localLinkHomology, type LocalLink } from "../davis";
import type { CoxeterSystemInput, LocalLinkHomologySummary } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import { exactIntegerToBigInt, toExactIntegerValue } from "./arithmetic";
import {
  certifyTorsionFreeAction,
  torsionFreeActionFingerprint,
} from "./certification";
import { planSphericalSpecialSubgroups } from "./sphericalPlanning";
import type {
  ExactIntegerValue,
  SphericalSpecialSubgroupPlan,
  SphericalSubsetPlan,
  TorsionFreeActionCandidate,
  TorsionFreeActionCertificate,
} from "./types";

export const EXACT_PERMUTATION_ACTION_KIND =
  "coxeter-exact-permutation-action" as const;

const ADAPTER_ID = "coxeter-viewer-exact-permutation-adapter-v1" as const;
const ACTION_BACKEND = "exact-permutation-certificate" as const;
const PROVENANCE_EVIDENCE_STATUS = "caller-asserted-to-adapter" as const;

// These caps admit substantially larger follow-up actions than degree 34,560
// while preventing an imported JSON array from exhausting browser memory.
export const MAX_EXACT_PERMUTATION_ACTION_DEGREE = 1_000_000;
export const MAX_EXACT_PERMUTATION_IMAGE_ENTRIES = 10_000_000;

const ACTION_CLAIMS = [
  "The artifact contains one complete zero-based integer permutation per Coxeter generator.",
  "Generator indices, action rows, source metadata, and all parsed provenance evidence are bound by the artifact's canonical SHA-256 digest.",
] as const;

const ACTION_NON_CLAIMS = [
  "Importing the rows alone does not certify torsion-freeness; replayExactPermutationActionArtifact performs that check.",
  "The adapter does not replay the source artifact's finite-quotient construction, non-normality, orientation, or minimal-index claims.",
  "The adapter does not use or claim packed-composite-permutation-module-solver provenance.",
  "Source-file, checksum, and verifier evidence is caller-asserted to the pure adapter; the bundled CLI computes file hashes from bytes before calling it.",
  "No expanded quotient complex or full Davis incidence poset is materialized by this artifact.",
  "No virtual-fibering, PL Morse, or game-state claim is made.",
] as const;

export interface ExactPermutationSourceFile {
  path?: string;
  sha256: string;
  encoding: "gzip-json" | "json";
}

export interface ExactPermutationChecksumEvidence {
  manifestPath?: string;
  expectedSha256: string;
  matched: true;
}

export interface ExactPermutationSystemFile {
  path?: string;
  sha256: string;
}

export interface ExactPermutationVerifierEvidence {
  path?: string;
  sha256?: string;
  status: "not-run" | "passed" | "failed";
  command?: string;
}

export interface ExactPermutationImportProvenance {
  sourceArtifact: ExactPermutationSourceFile;
  sourceSystemFile?: ExactPermutationSystemFile;
  checksum?: ExactPermutationChecksumEvidence;
  bundledVerifier?: ExactPermutationVerifierEvidence;
}

export interface DeclaredMaximalSphericalSubgroup {
  generators: number[];
  type: string;
  order: number;
  expectedNumberOfOrbits: number;
  expectedOrbitSize: number;
}

export interface ExactPermutationSourceCertificateMetadata {
  format: "zero-based-coxeter-permutations-v1";
  declaredDescription?: string;
  declaredIndexing: string;
  generatorNames: string[];
  declaredMaximalSphericalSubgroups?: DeclaredMaximalSphericalSubgroup[];
  sourcePresentationMetadataMatched: true;
  sourceConstructionReplayed: false;
}

/**
 * A self-contained exact permutation action, before any torsion-free claim.
 *
 * Keeping this boundary separate from solver-specific artifacts prevents an
 * imported action from acquiring provenance belonging to a different search.
 */
export interface ExactPermutationActionArtifact {
  schemaVersion: 1;
  kind: typeof EXACT_PERMUTATION_ACTION_KIND;
  system: CoxeterSystemInput;
  systemCanonicalSha256: string;
  actionCanonicalSha256: string;
  generatorMapping: Array<{
    index: number;
    certificateName: string;
    systemGeneratorId: string;
  }>;
  action: TorsionFreeActionCandidate;
  sourceCertificate: ExactPermutationSourceCertificateMetadata;
  provenance: ExactPermutationImportProvenance & {
    adapter: typeof ADAPTER_ID;
    evidenceStatus: typeof PROVENANCE_EVIDENCE_STATUS;
  };
  claims: string[];
  nonClaims: string[];
  warnings: string[];
}

export interface SignedExactIntegerValue {
  decimal: string;
  safeInteger?: number;
}

export interface CompactDavisQuotientCountSummary {
  status: "derived-without-materialization";
  quotientMaterialized: false;
  fullDavisPosetMaterialized: false;
  cellCountByDimension: Record<string, ExactIntegerValue>;
  sphericalCellTypeCountByDimension: Record<string, number>;
  totalCellCount: ExactIntegerValue;
  eulerCharacteristic: SignedExactIntegerValue;
  derivation: string;
}

export interface ExactPermutationValidationReport {
  schemaVersion: 1;
  kind: "exact-permutation-action-validation-report";
  status: TorsionFreeActionCertificate["status"];
  validationMethod: "tits-spherical-special-subgroup-action";
  sourceBinding: {
    systemName: string;
    systemCanonicalSha256: string;
    sourceArtifact: ExactPermutationSourceFile;
    sourceSystemFile?: ExactPermutationSystemFile;
    checksum?: ExactPermutationChecksumEvidence;
    bundledVerifier?: ExactPermutationVerifierEvidence;
    evidenceStatus: typeof PROVENANCE_EVIDENCE_STATUS;
  };
  action: {
    id: string;
    index: number;
    generatorCount: number;
    generatorImageEntryCount: number;
    fingerprint: string;
    canonicalSha256: string;
  };
  sphericalPlan: {
    status: SphericalSubsetPlan["status"];
    candidateSubsetCount: ExactIntegerValue;
    checkedSubsetCount: number;
    sphericalSubsetCount: number;
    maximalSphericalSubsetCount: number;
    indexLowerBound: ExactIntegerValue;
  };
  certificate: {
    status: TorsionFreeActionCertificate["status"];
    method: TorsionFreeActionCertificate["method"];
    checks: TorsionFreeActionCertificate["checks"];
    sphericalActionCheckCount: number;
    witnessCount: number;
    errors: string[];
    warnings: string[];
  };
  compactDavisQuotient?: CompactDavisQuotientCountSummary;
  localLink?: LocalLinkHomologySummary;
  claims: string[];
  nonClaims: string[];
  warnings: string[];
}

export interface AdaptExactPermutationCertificateOptions {
  candidateId?: string;
  candidateName?: string;
  /**
   * These values are assertions at this pure-data API boundary. Prefer the
   * byte-aware CLI when hashes must be computed rather than supplied.
   */
  callerAssertedProvenance: ExactPermutationImportProvenance;
}

interface ParsedSourceCertificate {
  description?: string;
  degree: number;
  generatorNames: string[];
  indexing: string;
  oppositeInfinitePairs: Array<[number, number]>;
  m3Pairs: Array<[number, number]>;
  generators: number[][];
  vertexParabolics: DeclaredMaximalSphericalSubgroup[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredNonemptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a nonempty string.`);
  }
  return value;
}

function optionalNonemptyString(
  value: unknown,
  path: string,
): string | undefined {
  return value === undefined ? undefined : requiredNonemptyString(value, path);
}

function positiveSafeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${path} must be a positive safe integer.`);
  }
  return value as number;
}

function assertActionSizeWithinLimits(
  degree: number,
  generatorCount: number,
  path: string,
): void {
  if (degree > MAX_EXACT_PERMUTATION_ACTION_DEGREE) {
    throw new Error(
      `${path} degree ${degree} exceeds the adapter limit ${MAX_EXACT_PERMUTATION_ACTION_DEGREE}.`,
    );
  }
  const entryCount = BigInt(degree) * BigInt(generatorCount);
  if (entryCount > BigInt(MAX_EXACT_PERMUTATION_IMAGE_ENTRIES)) {
    throw new Error(
      `${path} would contain ${entryCount} generator images; the adapter limit is ${MAX_EXACT_PERMUTATION_IMAGE_ENTRIES}.`,
    );
  }
}

function parseSha256(value: unknown, path: string): string {
  const digest = requiredNonemptyString(value, path).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`${path} must be a 64-digit hexadecimal SHA-256 digest.`);
  }
  return digest;
}

function parseStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of nonempty strings.`);
  }
  const entries = value.map((entry, index) =>
    requiredNonemptyString(entry, `${path}[${index}]`),
  );
  if (new Set(entries).size !== entries.length) {
    throw new Error(`${path} must not contain duplicates.`);
  }
  return entries;
}

function parsePermutationRows(
  value: unknown,
  degree: number,
  generatorCount: number,
  path: string,
): number[][] {
  if (!Array.isArray(value) || value.length !== generatorCount) {
    throw new Error(
      `${path} must contain ${generatorCount} generator permutations.`,
    );
  }

  return value.map((rawRow, generator) => {
    if (!Array.isArray(rawRow) || rawRow.length !== degree) {
      throw new Error(
        `${path}[${generator}] must contain exactly ${degree} images.`,
      );
    }
    const seen = new Uint8Array(degree);
    const row = Array<number>(degree);
    for (let point = 0; point < degree; point += 1) {
      const image = rawRow[point];
      if (!Number.isSafeInteger(image) || image < 0 || image >= degree) {
        throw new Error(
          `${path}[${generator}][${point}] must be an integer in 0..${degree - 1}.`,
        );
      }
      if (seen[image] !== 0) {
        throw new Error(
          `${path}[${generator}] is not a permutation: image ${image} occurs more than once.`,
        );
      }
      seen[image] = 1;
      row[point] = image;
    }
    return row;
  });
}

function parsePairList(
  value: unknown,
  rank: number,
  path: string,
): Array<[number, number]> {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of generator-index pairs.`);
  }
  const seen = new Set<string>();
  const pairs = value.map<[number, number]>((rawPair, index) => {
    if (
      !Array.isArray(rawPair) ||
      rawPair.length !== 2 ||
      !rawPair.every(Number.isSafeInteger)
    ) {
      throw new Error(`${path}[${index}] must contain two generator indices.`);
    }
    const [rawLeft, rawRight] = rawPair as [number, number];
    if (
      rawLeft < 0 ||
      rawRight < 0 ||
      rawLeft >= rank ||
      rawRight >= rank ||
      rawLeft === rawRight
    ) {
      throw new Error(
        `${path}[${index}] must contain distinct indices in 0..${rank - 1}.`,
      );
    }
    const pair: [number, number] =
      rawLeft < rawRight ? [rawLeft, rawRight] : [rawRight, rawLeft];
    const key = pair.join(",");
    if (seen.has(key)) {
      throw new Error(`${path} contains duplicate pair ${key}.`);
    }
    seen.add(key);
    return pair;
  });
  return pairs.sort(comparePairs);
}

function comparePairs(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  return left[0] - right[0] || left[1] - right[1];
}

function pairListsEqual(
  left: ReadonlyArray<readonly [number, number]>,
  right: ReadonlyArray<readonly [number, number]>,
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (pair, index) =>
        pair[0] === right[index][0] && pair[1] === right[index][1],
    )
  );
}

function parseDeclaredMaximalSubgroups(
  value: unknown,
  degree: number,
  rank: number,
  path: string,
): DeclaredMaximalSphericalSubgroup[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  const seen = new Set<string>();
  return value.map((rawEntry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(rawEntry)) {
      throw new Error(`${entryPath} must be an object.`);
    }
    if (!Array.isArray(rawEntry.generators)) {
      throw new Error(`${entryPath}.generators must be an array.`);
    }
    const generators = rawEntry.generators.map((generator, generatorIndex) => {
      if (
        !Number.isSafeInteger(generator) ||
        (generator as number) < 0 ||
        (generator as number) >= rank
      ) {
        throw new Error(
          `${entryPath}.generators[${generatorIndex}] must be an index in 0..${rank - 1}.`,
        );
      }
      return generator as number;
    });
    if (new Set(generators).size !== generators.length) {
      throw new Error(`${entryPath}.generators must not contain duplicates.`);
    }
    generators.sort((left, right) => left - right);
    const key = generators.join(",");
    if (seen.has(key)) {
      throw new Error(`${path} contains duplicate generator set ${key}.`);
    }
    seen.add(key);

    const order = positiveSafeInteger(rawEntry.order, `${entryPath}.order`);
    const expectedNumberOfOrbits = positiveSafeInteger(
      rawEntry.expected_number_of_orbits ?? rawEntry.expectedNumberOfOrbits,
      `${entryPath}.expectedNumberOfOrbits`,
    );
    const expectedOrbitSize = positiveSafeInteger(
      rawEntry.expected_orbit_size ?? rawEntry.expectedOrbitSize,
      `${entryPath}.expectedOrbitSize`,
    );
    if (expectedOrbitSize !== order) {
      throw new Error(
        `${entryPath}.expectedOrbitSize must equal its declared subgroup order.`,
      );
    }
    if (
      BigInt(expectedNumberOfOrbits) * BigInt(expectedOrbitSize) !==
      BigInt(degree)
    ) {
      throw new Error(
        `${entryPath} orbit count and size do not multiply to degree ${degree}.`,
      );
    }
    return {
      generators,
      type: requiredNonemptyString(rawEntry.type, `${entryPath}.type`),
      order,
      expectedNumberOfOrbits,
      expectedOrbitSize,
    };
  });
}

function parseProvenance(value: unknown): ExactPermutationImportProvenance {
  if (!isRecord(value) || !isRecord(value.sourceArtifact)) {
    throw new Error("provenance.sourceArtifact must be an object.");
  }
  const encoding = value.sourceArtifact.encoding;
  if (encoding !== "gzip-json" && encoding !== "json") {
    throw new Error(
      'provenance.sourceArtifact.encoding must be "gzip-json" or "json".',
    );
  }
  const sourceArtifact: ExactPermutationSourceFile = {
    ...(value.sourceArtifact.path === undefined
      ? {}
      : {
          path: requiredNonemptyString(
            value.sourceArtifact.path,
            "provenance.sourceArtifact.path",
          ),
        }),
    sha256: parseSha256(
      value.sourceArtifact.sha256,
      "provenance.sourceArtifact.sha256",
    ),
    encoding,
  };

  let sourceSystemFile: ExactPermutationSystemFile | undefined;
  if (value.sourceSystemFile !== undefined) {
    if (!isRecord(value.sourceSystemFile)) {
      throw new Error(
        "provenance.sourceSystemFile must be an object when supplied.",
      );
    }
    sourceSystemFile = {
      ...(value.sourceSystemFile.path === undefined
        ? {}
        : {
            path: requiredNonemptyString(
              value.sourceSystemFile.path,
              "provenance.sourceSystemFile.path",
            ),
          }),
      sha256: parseSha256(
        value.sourceSystemFile.sha256,
        "provenance.sourceSystemFile.sha256",
      ),
    };
  }

  let checksum: ExactPermutationChecksumEvidence | undefined;
  if (value.checksum !== undefined) {
    if (!isRecord(value.checksum)) {
      throw new Error("provenance.checksum must be an object when supplied.");
    }
    if (value.checksum.matched !== true) {
      throw new Error(
        "provenance.checksum.matched must be true; a checksum mismatch cannot be imported.",
      );
    }
    const expectedSha256 = parseSha256(
      value.checksum.expectedSha256,
      "provenance.checksum.expectedSha256",
    );
    if (expectedSha256 !== sourceArtifact.sha256) {
      throw new Error(
        "The checksum-manifest digest does not match the source artifact digest.",
      );
    }
    checksum = {
      ...(value.checksum.manifestPath === undefined
        ? {}
        : {
            manifestPath: requiredNonemptyString(
              value.checksum.manifestPath,
              "provenance.checksum.manifestPath",
            ),
          }),
      expectedSha256,
      matched: true,
    };
  }

  let bundledVerifier: ExactPermutationVerifierEvidence | undefined;
  if (value.bundledVerifier !== undefined) {
    if (!isRecord(value.bundledVerifier)) {
      throw new Error(
        "provenance.bundledVerifier must be an object when supplied.",
      );
    }
    const status = value.bundledVerifier.status;
    if (status !== "not-run" && status !== "passed" && status !== "failed") {
      throw new Error(
        'provenance.bundledVerifier.status must be "not-run", "passed", or "failed".',
      );
    }
    const verifierPath = optionalNonemptyString(
      value.bundledVerifier.path,
      "provenance.bundledVerifier.path",
    );
    const verifierSha256 =
      value.bundledVerifier.sha256 === undefined
        ? undefined
        : parseSha256(
            value.bundledVerifier.sha256,
            "provenance.bundledVerifier.sha256",
          );
    const verifierCommand = optionalNonemptyString(
      value.bundledVerifier.command,
      "provenance.bundledVerifier.command",
    );
    if (status !== "not-run" && verifierSha256 === undefined) {
      throw new Error(
        `provenance.bundledVerifier.sha256 is required when status is ${status}.`,
      );
    }
    if (
      status !== "not-run" &&
      verifierPath === undefined &&
      verifierCommand === undefined
    ) {
      throw new Error(
        `provenance.bundledVerifier.path or command is required when status is ${status}.`,
      );
    }
    bundledVerifier = {
      ...(verifierPath === undefined ? {} : { path: verifierPath }),
      ...(verifierSha256 === undefined ? {} : { sha256: verifierSha256 }),
      status,
      ...(verifierCommand === undefined ? {} : { command: verifierCommand }),
    };
  }

  return {
    sourceArtifact,
    ...(sourceSystemFile === undefined ? {} : { sourceSystemFile }),
    ...(checksum === undefined ? {} : { checksum }),
    ...(bundledVerifier === undefined ? {} : { bundledVerifier }),
  };
}

function sourcePresentationPairs(system: CoxeterSystemInput): {
  oppositeInfinitePairs: Array<[number, number]>;
  m3Pairs: Array<[number, number]>;
} {
  const oppositeInfinitePairs: Array<[number, number]> = [];
  const m3Pairs: Array<[number, number]> = [];
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const exponent = system.coxeterMatrix[left][right];
      if (exponent === "inf") {
        oppositeInfinitePairs.push([left, right]);
      } else if (exponent === 3) {
        m3Pairs.push([left, right]);
      } else if (exponent !== 2) {
        throw new Error(
          `The source certificate's pair metadata cannot encode Coxeter exponent ${exponent} at generators ${left},${right}.`,
        );
      }
    }
  }
  return { oppositeInfinitePairs, m3Pairs };
}

function parseSourceCertificate(
  input: unknown,
  system: CoxeterSystemInput,
): ParsedSourceCertificate {
  if (!isRecord(input)) {
    throw new Error("The exact permutation certificate must be a JSON object.");
  }
  const degree = positiveSafeInteger(input.degree, "degree");
  assertActionSizeWithinLimits(degree, system.rank, "certificate action");
  const generatorNames = parseStringArray(
    input.generator_names,
    "generator_names",
  );
  if (generatorNames.length !== system.rank) {
    throw new Error(
      `generator_names contains ${generatorNames.length} entries; the Coxeter system has rank ${system.rank}.`,
    );
  }
  const indexing = requiredNonemptyString(input.indexing, "indexing");
  if (!/zero[- ]based/i.test(indexing)) {
    throw new Error(
      "Only zero-based permutation rows are accepted by this adapter.",
    );
  }

  const oppositeInfinitePairs = parsePairList(
    input.opposite_infinite_pairs,
    system.rank,
    "opposite_infinite_pairs",
  );
  const m3Pairs = parsePairList(input.m3_pairs, system.rank, "m3_pairs");
  if (input.all_other_distinct_pairs_have_m !== 2) {
    throw new Error("all_other_distinct_pairs_have_m must be 2.");
  }
  const expectedPairs = sourcePresentationPairs(system);
  if (
    !pairListsEqual(
      oppositeInfinitePairs,
      expectedPairs.oppositeInfinitePairs,
    ) ||
    !pairListsEqual(m3Pairs, expectedPairs.m3Pairs)
  ) {
    throw new Error(
      "Certificate pair metadata does not match the imported Coxeter matrix by generator index.",
    );
  }

  const generators = parsePermutationRows(
    input.generators,
    degree,
    system.rank,
    "generators",
  );
  const vertexParabolics = parseDeclaredMaximalSubgroups(
    input.vertex_parabolics,
    degree,
    system.rank,
    "vertex_parabolics",
  );
  const description = optionalNonemptyString(input.description, "description");
  return {
    ...(description === undefined ? {} : { description }),
    degree,
    generatorNames,
    indexing,
    oppositeInfinitePairs,
    m3Pairs,
    generators,
    vertexParabolics,
  };
}

function isProperSubset(
  smaller: readonly number[],
  larger: readonly number[],
): boolean {
  if (smaller.length >= larger.length) return false;
  const largerSet = new Set(larger);
  return smaller.every((generator) => largerSet.has(generator));
}

function maximalSphericalSubgroups(
  plan: SphericalSubsetPlan,
): SphericalSpecialSubgroupPlan[] {
  return plan.sphericalSubgroups.filter(
    (subgroup) =>
      !plan.sphericalSubgroups.some((candidate) =>
        isProperSubset(subgroup.generators, candidate.generators),
      ),
  );
}

function assertDeclaredMaximalSubgroupsMatch(
  declared: DeclaredMaximalSphericalSubgroup[],
  system: CoxeterSystemInput,
): void {
  const plan = planSphericalSpecialSubgroups(system);
  if (plan.status !== "complete") {
    throw new Error(
      "The spherical-subgroup plan is incomplete, so declared maximal parabolics cannot be source-bound.",
    );
  }
  const expected = maximalSphericalSubgroups(plan);
  const expectedByKey = new Map(
    expected.map((subgroup) => [subgroup.generators.join(","), subgroup]),
  );
  if (declared.length !== expected.length) {
    throw new Error(
      `vertex_parabolics declares ${declared.length} maximal subgroups; the Coxeter system has ${expected.length}.`,
    );
  }
  for (const subgroup of declared) {
    const key = subgroup.generators.join(",");
    const planned = expectedByKey.get(key);
    if (planned === undefined) {
      throw new Error(
        `Declared vertex parabolic ${key} is not a maximal spherical special subgroup of the source system.`,
      );
    }
    if (BigInt(subgroup.order) !== exactIntegerToBigInt(planned.order)) {
      throw new Error(
        `Declared vertex parabolic ${key} has order ${subgroup.order}; the exact Coxeter classification gives ${planned.order.decimal}.`,
      );
    }
  }
}

function generatorMapping(
  system: CoxeterSystemInput,
  names: readonly string[],
): ExactPermutationActionArtifact["generatorMapping"] {
  return names.map((certificateName, index) => ({
    index,
    certificateName,
    systemGeneratorId: system.generators[index].id,
  }));
}

function exactActionPayloadSha256(
  systemCanonicalSha256: string,
  mapping: ExactPermutationActionArtifact["generatorMapping"],
  action: TorsionFreeActionCandidate,
  sourceCertificate: ExactPermutationSourceCertificateMetadata,
  provenance: ExactPermutationActionArtifact["provenance"],
): string {
  // This envelope digest binds the large permutation table, its positional
  // generator map, and every parsed provenance field. Report prose is omitted.
  return canonicalSha256({
    schemaVersion: 1,
    kind: EXACT_PERMUTATION_ACTION_KIND,
    systemCanonicalSha256,
    generatorMapping: mapping,
    action,
    sourceCertificate,
    provenance,
  });
}

/**
 * Adapts the folder's compact zero-based permutation JSON to the viewer's
 * generic exact-action boundary. Source construction prose is deliberately not
 * promoted into solver provenance or a verified mathematical claim.
 */
export function adaptExactPermutationCertificate(
  systemInput: unknown,
  certificateInput: unknown,
  options: AdaptExactPermutationCertificateOptions,
): ExactPermutationActionArtifact {
  const system = parseCoxeterSystemInput(systemInput);
  const source = parseSourceCertificate(certificateInput, system);
  assertDeclaredMaximalSubgroupsMatch(source.vertexParabolics, system);
  const callerAssertedProvenance = parseProvenance(
    options.callerAssertedProvenance,
  );
  const provenance: ExactPermutationActionArtifact["provenance"] = {
    adapter: ADAPTER_ID,
    evidenceStatus: PROVENANCE_EVIDENCE_STATUS,
    ...callerAssertedProvenance,
  };
  const candidateId =
    options.candidateId === undefined
      ? `exact-permutation-index-${source.degree}`
      : requiredNonemptyString(options.candidateId, "candidateId");
  const candidateName = optionalNonemptyString(
    options.candidateName,
    "candidateName",
  );
  const action: TorsionFreeActionCandidate = {
    id: candidateId,
    ...(candidateName === undefined ? {} : { name: candidateName }),
    index: source.degree,
    generatorImages: source.generators,
    backend: ACTION_BACKEND,
    ...(callerAssertedProvenance.sourceArtifact.path === undefined
      ? {}
      : { source: callerAssertedProvenance.sourceArtifact.path }),
    notes: [
      "Exact integer permutation rows imported from a source certificate.",
      "Torsion-freeness is not asserted until the viewer's spherical-action replay passes.",
    ],
  };
  const mapping = generatorMapping(system, source.generatorNames);
  const sourceCertificate: ExactPermutationSourceCertificateMetadata = {
    format: "zero-based-coxeter-permutations-v1",
    ...(source.description === undefined
      ? {}
      : { declaredDescription: source.description }),
    declaredIndexing: source.indexing,
    generatorNames: source.generatorNames,
    declaredMaximalSphericalSubgroups: source.vertexParabolics,
    sourcePresentationMetadataMatched: true,
    sourceConstructionReplayed: false,
  };
  const systemCanonicalSha256 = canonicalSha256(system);

  return {
    schemaVersion: 1,
    kind: EXACT_PERMUTATION_ACTION_KIND,
    system,
    systemCanonicalSha256,
    actionCanonicalSha256: exactActionPayloadSha256(
      systemCanonicalSha256,
      mapping,
      action,
      sourceCertificate,
      provenance,
    ),
    generatorMapping: mapping,
    action,
    sourceCertificate,
    provenance,
    claims: [...ACTION_CLAIMS],
    nonClaims: [...ACTION_NON_CLAIMS],
    warnings: [
      "Source-file, checksum, and verifier evidence was caller-asserted to this pure adapter; use the bundled CLI to compute hashes directly from bytes.",
      "The source artifact's construction metadata is retained only by the source file and was not replayed by this adapter.",
    ],
  };
}

function parseArtifactGeneratorMapping(
  value: unknown,
  system: CoxeterSystemInput,
): ExactPermutationActionArtifact["generatorMapping"] {
  if (!Array.isArray(value) || value.length !== system.rank) {
    throw new Error(
      `generatorMapping must contain ${system.rank} positional entries.`,
    );
  }
  return value.map((rawEntry, index) => {
    if (!isRecord(rawEntry)) {
      throw new Error(`generatorMapping[${index}] must be an object.`);
    }
    if (rawEntry.index !== index) {
      throw new Error(
        `generatorMapping[${index}].index must equal its position ${index}.`,
      );
    }
    const systemGeneratorId = requiredNonemptyString(
      rawEntry.systemGeneratorId,
      `generatorMapping[${index}].systemGeneratorId`,
    );
    if (systemGeneratorId !== system.generators[index].id) {
      throw new Error(
        `generatorMapping[${index}] does not match system generator id ${system.generators[index].id}.`,
      );
    }
    return {
      index,
      certificateName: requiredNonemptyString(
        rawEntry.certificateName,
        `generatorMapping[${index}].certificateName`,
      ),
      systemGeneratorId,
    };
  });
}

function parseArtifactSourceMetadata(
  value: unknown,
  system: CoxeterSystemInput,
  degree: number,
): ExactPermutationSourceCertificateMetadata {
  if (!isRecord(value)) {
    throw new Error("sourceCertificate must be an object.");
  }
  if (value.format !== "zero-based-coxeter-permutations-v1") {
    throw new Error(
      'sourceCertificate.format must be "zero-based-coxeter-permutations-v1".',
    );
  }
  if (value.sourcePresentationMetadataMatched !== true) {
    throw new Error(
      "sourceCertificate.sourcePresentationMetadataMatched must be true.",
    );
  }
  if (value.sourceConstructionReplayed !== false) {
    throw new Error(
      "sourceCertificate.sourceConstructionReplayed must remain false; construction replay is outside this adapter.",
    );
  }
  const generatorNames = parseStringArray(
    value.generatorNames,
    "sourceCertificate.generatorNames",
  );
  if (generatorNames.length !== system.rank) {
    throw new Error(
      `sourceCertificate.generatorNames must contain ${system.rank} entries.`,
    );
  }
  const declaredIndexing = requiredNonemptyString(
    value.declaredIndexing,
    "sourceCertificate.declaredIndexing",
  );
  if (!/zero[- ]based/i.test(declaredIndexing)) {
    throw new Error(
      "sourceCertificate.declaredIndexing must declare zero-based permutation rows.",
    );
  }
  let declaredMaximalSphericalSubgroups:
    | DeclaredMaximalSphericalSubgroup[]
    | undefined;
  if (value.declaredMaximalSphericalSubgroups !== undefined) {
    declaredMaximalSphericalSubgroups = parseDeclaredMaximalSubgroups(
      value.declaredMaximalSphericalSubgroups,
      degree,
      system.rank,
      "sourceCertificate.declaredMaximalSphericalSubgroups",
    );
    assertDeclaredMaximalSubgroupsMatch(
      declaredMaximalSphericalSubgroups,
      system,
    );
  }
  return {
    format: "zero-based-coxeter-permutations-v1",
    ...(value.declaredDescription === undefined
      ? {}
      : {
          declaredDescription: requiredNonemptyString(
            value.declaredDescription,
            "sourceCertificate.declaredDescription",
          ),
        }),
    declaredIndexing,
    generatorNames,
    ...(declaredMaximalSphericalSubgroups === undefined
      ? {}
      : { declaredMaximalSphericalSubgroups }),
    sourcePresentationMetadataMatched: true,
    sourceConstructionReplayed: false,
  };
}

/** Runtime parser for self-contained artifacts emitted by the adapter. */
export function parseExactPermutationActionArtifact(
  input: unknown,
): ExactPermutationActionArtifact {
  if (!isRecord(input)) {
    throw new Error("Exact permutation action artifact must be an object.");
  }
  if (input.schemaVersion !== 1) {
    throw new Error(
      "Exact permutation action artifact schemaVersion must be 1.",
    );
  }
  if (input.kind !== EXACT_PERMUTATION_ACTION_KIND) {
    throw new Error(
      `Exact permutation action artifact kind must be ${EXACT_PERMUTATION_ACTION_KIND}.`,
    );
  }
  const system = parseCoxeterSystemInput(input.system);
  const systemCanonicalSha256 = canonicalSha256(system);
  if (input.systemCanonicalSha256 !== systemCanonicalSha256) {
    throw new Error(
      "systemCanonicalSha256 does not match the embedded Coxeter system.",
    );
  }
  if (!isRecord(input.action)) {
    throw new Error("action must be an object.");
  }
  const index = positiveSafeInteger(input.action.index, "action.index");
  assertActionSizeWithinLimits(index, system.rank, "embedded action");
  const action: TorsionFreeActionCandidate = {
    id: requiredNonemptyString(input.action.id, "action.id"),
    ...(input.action.name === undefined
      ? {}
      : { name: requiredNonemptyString(input.action.name, "action.name") }),
    index,
    generatorImages: parsePermutationRows(
      input.action.generatorImages,
      index,
      system.rank,
      "action.generatorImages",
    ),
    backend: ACTION_BACKEND,
    ...(input.action.source === undefined
      ? {}
      : {
          source: requiredNonemptyString(input.action.source, "action.source"),
        }),
    notes: [
      "Exact integer permutation rows imported from a source certificate.",
      "Torsion-freeness is not asserted until the viewer's spherical-action replay passes.",
    ],
  };
  if (input.action.backend !== ACTION_BACKEND) {
    throw new Error(`action.backend must be ${ACTION_BACKEND}.`);
  }
  const generatorMap = parseArtifactGeneratorMapping(
    input.generatorMapping,
    system,
  );
  const sourceCertificate = parseArtifactSourceMetadata(
    input.sourceCertificate,
    system,
    index,
  );
  if (
    generatorMap.some(
      (entry, position) =>
        entry.certificateName !== sourceCertificate.generatorNames[position],
    )
  ) {
    throw new Error(
      "generatorMapping certificate names do not match sourceCertificate.generatorNames.",
    );
  }
  if (!isRecord(input.provenance) || input.provenance.adapter !== ADAPTER_ID) {
    throw new Error(`provenance.adapter must be ${ADAPTER_ID}.`);
  }
  if (input.provenance.evidenceStatus !== PROVENANCE_EVIDENCE_STATUS) {
    throw new Error(
      `provenance.evidenceStatus must be ${PROVENANCE_EVIDENCE_STATUS}.`,
    );
  }
  const parsedProvenance = parseProvenance(input.provenance);
  const provenance: ExactPermutationActionArtifact["provenance"] = {
    adapter: ADAPTER_ID,
    evidenceStatus: PROVENANCE_EVIDENCE_STATUS,
    ...parsedProvenance,
  };
  const actionCanonicalSha256 = parseSha256(
    input.actionCanonicalSha256,
    "actionCanonicalSha256",
  );
  const computedActionSha256 = exactActionPayloadSha256(
    systemCanonicalSha256,
    generatorMap,
    action,
    sourceCertificate,
    provenance,
  );
  if (actionCanonicalSha256 !== computedActionSha256) {
    throw new Error(
      "actionCanonicalSha256 does not match the embedded permutation action and source binding.",
    );
  }

  return {
    schemaVersion: 1,
    kind: EXACT_PERMUTATION_ACTION_KIND,
    system,
    systemCanonicalSha256,
    actionCanonicalSha256,
    generatorMapping: generatorMap,
    action,
    sourceCertificate,
    provenance,
    claims: [...ACTION_CLAIMS],
    nonClaims: [...ACTION_NON_CLAIMS],
    warnings: [
      "Source-file, checksum, and verifier evidence was caller-asserted to this pure adapter; use the bundled CLI to compute hashes directly from bytes.",
      "The source artifact's construction metadata is retained only by the source file and was not replayed by this adapter.",
    ],
  };
}

function signedExactIntegerValue(value: bigint): SignedExactIntegerValue {
  const safeInteger =
    value >= BigInt(Number.MIN_SAFE_INTEGER) &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : undefined;
  return {
    decimal: value.toString(),
    ...(safeInteger === undefined ? {} : { safeInteger }),
  };
}

function deriveCompactDavisCounts(
  index: number,
  plan: SphericalSubsetPlan,
): CompactDavisQuotientCountSummary {
  const counts = new Map<number, bigint>([[0, BigInt(index)]]);
  const typeCounts = new Map<number, number>([[0, 1]]);
  for (const subgroup of plan.sphericalSubgroups) {
    const order = exactIntegerToBigInt(subgroup.order);
    if (BigInt(index) % order !== 0n) {
      throw new Error(
        `Index ${index} is not divisible by spherical subgroup ${subgroup.id} order ${order}.`,
      );
    }
    counts.set(
      subgroup.rank,
      (counts.get(subgroup.rank) ?? 0n) + BigInt(index) / order,
    );
    typeCounts.set(subgroup.rank, (typeCounts.get(subgroup.rank) ?? 0) + 1);
  }
  const dimensions = [...counts.keys()].sort((left, right) => left - right);
  let total = 0n;
  let euler = 0n;
  for (const dimension of dimensions) {
    const count = counts.get(dimension) as bigint;
    total += count;
    euler += dimension % 2 === 0 ? count : -count;
  }
  return {
    status: "derived-without-materialization",
    quotientMaterialized: false,
    fullDavisPosetMaterialized: false,
    cellCountByDimension: Object.fromEntries(
      dimensions.map((dimension) => [
        String(dimension),
        toExactIntegerValue(counts.get(dimension) as bigint),
      ]),
    ),
    sphericalCellTypeCountByDimension: Object.fromEntries(
      dimensions.map((dimension) => [
        String(dimension),
        typeCounts.get(dimension) ?? 0,
      ]),
    ),
    totalCellCount: toExactIntegerValue(total),
    eulerCharacteristic: signedExactIntegerValue(euler),
    derivation:
      "For each nonempty spherical T, the quotient has index/|W_T| cells of dimension |T|; dimension zero consists of the action points.",
  };
}

function localLinkFromPlan(
  system: CoxeterSystemInput,
  plan: SphericalSubsetPlan,
): LocalLinkHomologySummary {
  const link: LocalLink = {
    nodeId: "action-point:0",
    vertices: system.generators.map((generator, index) => ({
      generator: index,
      generatorId: generator.id,
      label: generator.label,
      ...(generator.colorHint === undefined
        ? {}
        : { colorHint: generator.colorHint }),
    })),
    simplices: plan.sphericalSubgroups.map((subgroup) => ({
      id: `link:action-point:0:${subgroup.id}`,
      generators: [...subgroup.generators],
      dimension: subgroup.rank - 1,
      sphericalSubsetId: subgroup.id,
    })),
    // The homology helper only consumes vertices and simplices. The exact
    // classification records live in the spherical plan summarized alongside it.
    sphericalSubsets: [],
    warnings: [...plan.warnings],
  };
  return localLinkHomology(link);
}

/**
 * Replays exact action and torsion checks, then derives only compact counts.
 * It never calls the expanded quotient builder or Davis-poset materializer.
 */
export function replayExactPermutationActionArtifact(
  input: unknown,
): ExactPermutationValidationReport {
  const artifact = parseExactPermutationActionArtifact(input);
  const plan = planSphericalSpecialSubgroups(artifact.system);
  const certificate = certifyTorsionFreeAction(
    artifact.system,
    artifact.action,
    plan,
  );
  const maximalCount = maximalSphericalSubgroups(plan).length;
  const passed = certificate.status === "passed";
  const reportWarnings = [
    ...artifact.warnings,
    ...plan.warnings,
    ...certificate.warnings,
  ];
  const claims = passed
    ? [
        `The exact permutations define a transitive Coxeter action of degree ${artifact.action.index}.`,
        "Every spherical special subgroup acts freely, so the stabilizer of action point 0 is torsion-free by the Coxeter torsion theorem.",
        "The compact Davis quotient counts and local-link calculation are derived from the complete spherical-subgroup plan without materializing quotient cells.",
      ]
    : [];

  return {
    schemaVersion: 1,
    kind: "exact-permutation-action-validation-report",
    status: certificate.status,
    validationMethod: "tits-spherical-special-subgroup-action",
    sourceBinding: {
      systemName: artifact.system.name,
      systemCanonicalSha256: artifact.systemCanonicalSha256,
      evidenceStatus: artifact.provenance.evidenceStatus,
      sourceArtifact: artifact.provenance.sourceArtifact,
      ...(artifact.provenance.sourceSystemFile === undefined
        ? {}
        : { sourceSystemFile: artifact.provenance.sourceSystemFile }),
      ...(artifact.provenance.checksum === undefined
        ? {}
        : { checksum: artifact.provenance.checksum }),
      ...(artifact.provenance.bundledVerifier === undefined
        ? {}
        : { bundledVerifier: artifact.provenance.bundledVerifier }),
    },
    action: {
      id: artifact.action.id,
      index: artifact.action.index,
      generatorCount: artifact.action.generatorImages.length,
      generatorImageEntryCount:
        artifact.action.index * artifact.action.generatorImages.length,
      fingerprint: torsionFreeActionFingerprint(
        artifact.system,
        artifact.action,
      ),
      canonicalSha256: artifact.actionCanonicalSha256,
    },
    sphericalPlan: {
      status: plan.status,
      candidateSubsetCount: plan.candidateSubsetCount,
      checkedSubsetCount: plan.checkedSubsetCount,
      sphericalSubsetCount: plan.sphericalSubgroups.length,
      maximalSphericalSubsetCount: maximalCount,
      indexLowerBound: certificate.indexLowerBound.value,
    },
    certificate: {
      status: certificate.status,
      method: certificate.method,
      checks: certificate.checks,
      sphericalActionCheckCount: certificate.sphericalActions.length,
      witnessCount: certificate.witnessCount,
      errors: certificate.errors,
      warnings: certificate.warnings,
    },
    ...(passed
      ? {
          compactDavisQuotient: deriveCompactDavisCounts(
            artifact.action.index,
            plan,
          ),
          localLink: localLinkFromPlan(artifact.system, plan),
        }
      : {}),
    claims,
    nonClaims: [...ACTION_NON_CLAIMS],
    warnings: [...new Set(reportWarnings)],
  };
}
