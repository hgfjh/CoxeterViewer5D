import type { CoxeterMatrixEntry } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";

export type LabelledS4ProofStatus = "passed" | "failed" | "not-run";

/**
 * Protocol identifiers understood by a repository-owned replay runner.
 *
 * They are data, not executable names.  This browser-safe module never turns
 * an identifier or argument into a shell command.
 */
export const LABELLED_S4_REPLAY_BACKEND_IDS = [
  "labelled-s4-gap-v1",
  "labelled-s4-sage-v1",
  "labelled-s4-polymake-v1",
  "labelled-s4-regina-v1",
  "labelled-s4-test-fixture-v1",
] as const;

export type LabelledS4ReplayBackendId =
  (typeof LABELLED_S4_REPLAY_BACKEND_IDS)[number];

export interface LabelledS4ReplayBinding {
  backendId: LabelledS4ReplayBackendId;
  argv: string[];
}

/**
 * Binds a mathematical assertion to a replayable exact artifact.
 *
 * This module checks the binding and its input digest. A separate, fixed
 * repository runner must additionally hash `artifactPath`, dispatch `replay`
 * through its backend allowlist, and set `replayStatus` to `passed`. This
 * module deliberately contains no process-execution code.
 */
export interface LabelledS4ExactEvidenceBinding {
  status: LabelledS4ProofStatus;
  exactArithmetic: boolean;
  backend: string;
  backendVersion?: string;
  artifactPath: string;
  artifactSha256: string;
  replay: LabelledS4ReplayBinding;
  replayStatus: LabelledS4ProofStatus;
}

export interface LabelledS4CoxeterPresentation {
  rank: number;
  generatorIds: string[];
  coxeterMatrix: CoxeterMatrixEntry[][];
}

export interface LabelledS4NerveInput {
  dimension: 4;
  maximalSimplices: string[][];
}

export interface LabelledS4SphericalSubsetCertificate {
  kind: "exact-maximal-spherical-subsets";
  coxeterDataSha256: string;
  exhaustive: boolean;
  maximalSphericalSubsets: string[][];
  allListedSubsetsCertifiedSpherical: boolean;
  evidence: LabelledS4ExactEvidenceBinding;
}

export type LabelledS4PlSphereProofKind =
  | "bistellar-to-simplex-boundary"
  | "simplicial-isomorphism-to-known-pl-sphere"
  | "shellable-ball-boundary";

export interface LabelledS4PlSphereCertificate {
  kind: "exact-pl-sphere";
  nerveSha256: string;
  dimension: 4;
  conclusion: "pl-sphere" | "not-pl-sphere" | "unknown";
  proofKind: LabelledS4PlSphereProofKind;
  closedCombinatorialManifoldVerified: boolean;
  integralHomologySphereVerified: boolean;
  plHomeomorphismVerified: boolean;
  evidence: LabelledS4ExactEvidenceBinding;
}

export interface LabelledS4CommutingInfinitePair {
  left: string[];
  right: string[];
  leftCertifiedInfinite: boolean;
  rightCertifiedInfinite: boolean;
}

export interface LabelledS4MoussongCertificate {
  kind: "exact-moussong-hyperbolicity";
  criterion: "no-affine-rank-ge-3-and-no-commuting-infinite-special-pair";
  coxeterDataSha256: string;
  irreducibleAffineAuditExhaustive: boolean;
  irreducibleAffineRankAtLeastThreeSubsets: string[][];
  commutingInfinitePairAuditExhaustive: boolean;
  commutingInfinitePairs: LabelledS4CommutingInfinitePair[];
  conclusion: "word-hyperbolic" | "not-word-hyperbolic" | "unknown";
  evidence: LabelledS4ExactEvidenceBinding;
}

/** Candidate intake intentionally has no geometric-reflection-data field. */
export interface LabelledS4NongeometricCandidate {
  schemaVersion: 1;
  kind: "labelled-s4-nongeometric-coxeter-candidate";
  id: string;
  label: string;
  claimScope: "abstract-coxeter-davis";
  ambientGeometryClaim: "none";
  intendedDavisDimension: 5;
  sourceRefs: Array<{
    citation: string;
    url?: string;
    locator?: string;
  }>;
  presentation: LabelledS4CoxeterPresentation;
  nerve: LabelledS4NerveInput;
  sphericalSubsets: LabelledS4SphericalSubsetCertificate;
  plSphere: LabelledS4PlSphereCertificate;
  moussong: LabelledS4MoussongCertificate;
  notes: string[];
}

export interface LabelledS4PreflightChecks {
  envelopeRecognized: boolean;
  abstractDavisScopeOnly: boolean;
  sourceProvenanceRecorded: boolean;
  matrixValid: boolean;
  nerveIsPureFourDimensional: boolean;
  everyGeneratorOccursInNerve: boolean;
  sphericalCertificateInputMatches: boolean;
  maximalSphericalSubsetsAgreeWithNerve: boolean;
  sphericalAuditExactAndExhaustive: boolean;
  plSphereCertificateInputMatches: boolean;
  plSphereProofExactAndReplayable: boolean;
  moussongCertificateInputMatches: boolean;
  moussongAuditsExactAndExhaustive: boolean;
  noIrreducibleAffineObstruction: boolean;
  noCommutingInfiniteSpecialPair: boolean;
  wordHyperbolicityCertified: boolean;
  nonRightAngled: boolean;
}

export interface LabelledS4PreflightResult {
  candidateId: string;
  status: "passed" | "blocked" | "rejected";
  checks: LabelledS4PreflightChecks;
  digests: {
    coxeterDataSha256: string | null;
    nerveSha256: string | null;
  };
  errors: string[];
  blockers: string[];
  warnings: string[];
}

export interface LabelledS4PilotLimits {
  maxCandidates: number;
  maxRank: number;
  maxNerveFacets: number;
  maxPreflightSecondsPerCandidate: number;
}

export interface LabelledS4PilotPlanEntry {
  candidateId: string;
  rank: number;
  nerveFacetCount: number;
  preflightStatus: LabelledS4PreflightResult["status"];
  disposition: "queue" | "defer-capacity" | "blocked" | "reject";
  reasons: string[];
}

export interface LabelledS4PilotPlan {
  schemaVersion: 1;
  kind: "labelled-s4-nongeometric-pilot-plan";
  status: "candidate-intake-open" | "bounded-queue-ready" | "no-survivor";
  limits: LabelledS4PilotLimits;
  entries: LabelledS4PilotPlanEntry[];
  queuedCandidateIds: string[];
}

export const LABELLED_S4_DEFAULT_PILOT_LIMITS: Readonly<LabelledS4PilotLimits> =
  {
    maxCandidates: 16,
    maxRank: 32,
    maxNerveFacets: 100_000,
    maxPreflightSecondsPerCandidate: 900,
  };

/**
 * The registry is deliberately empty until a sourced candidate and all three
 * exact preflight artifacts are imported.
 */
export const LABELLED_S4_RESEARCH_LANE = {
  schemaVersion: 1,
  kind: "labelled-s4-nongeometric-research-lane",
  id: "labelled-s4-nongeometric-coxeter",
  status: "candidate-intake-open",
  currentCandidateIds: [] as string[],
  objective:
    "Find a word-hyperbolic labelled Coxeter system with PL-S4 nerve, then search finite covers and PL Morse data on its Davis 5-manifold.",
  geometryPolicy: {
    realHyperbolic5ReflectionRealizationRequired: false,
    gramSignatureRequired: false,
    compactHyperbolicPolytopeRequired: false,
    permittedClaimScope: "abstract-coxeter-davis",
  },
  rightAngledPolicy: {
    admitted: false,
    reason:
      "A word-hyperbolic right-angled Coxeter group would require a flag-no-square nerve, but no four-dimensional generalized homology sphere is flag-no-square.",
    scope:
      "This excludes the right-angled PL-S4 route, not non-right-angled labelled Coxeter nerves or flag-no-square pseudomanifolds.",
  },
  exactPreflightOrder: [
    "coxeter-matrix",
    "maximal-spherical-subset-agreement",
    "pl-s4-certificate",
    "moussong-hyperbolicity",
    "finite-cover-h1",
    "pl-morse-links",
  ],
  pilotLimits: LABELLED_S4_DEFAULT_PILOT_LIMITS,
  nonClaims: [
    "A passed preflight does not realize the Coxeter group by reflections in real hyperbolic five-space.",
    "A passed preflight does not supply a finite-index subgroup, a character, or a fibering result.",
    "Combinatorial-manifold and homology-sphere checks alone are not accepted as a PL-S4 certificate.",
  ],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function containsAsciiControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

/**
 * Evidence paths use a canonical repository-relative POSIX spelling. The
 * filesystem replay layer still resolves the path and verifies containment;
 * this check prevents absolute, drive-qualified, URI-like, or traversing
 * bindings from entering the certificate model.
 */
export function isNormalizedRepositoryRelativePath(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes(":") ||
    value.includes("\\") ||
    containsAsciiControlCharacter(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

function replayBindingValid(value: unknown): value is LabelledS4ReplayBinding {
  if (!isRecord(value)) return false;
  if (
    typeof value.backendId !== "string" ||
    !LABELLED_S4_REPLAY_BACKEND_IDS.some(
      (backendId) => backendId === value.backendId,
    ) ||
    !Array.isArray(value.argv) ||
    value.argv.length === 0 ||
    value.argv.length > 64
  ) {
    return false;
  }
  return value.argv.every(
    (argument) =>
      typeof argument === "string" &&
      argument.length > 0 &&
      argument.length <= 4096 &&
      !containsAsciiControlCharacter(argument),
  );
}

function presentationShapeValid(
  presentation: LabelledS4CoxeterPresentation,
  errors: string[],
): boolean {
  const { rank, generatorIds, coxeterMatrix } = presentation;
  if (!Number.isInteger(rank) || rank < 6) {
    errors.push("A PL four-sphere nerve requires at least six generators.");
    return false;
  }
  if (
    generatorIds.length !== rank ||
    new Set(generatorIds).size !== rank ||
    generatorIds.some((id) => id.length === 0)
  ) {
    errors.push("Generator ids must be nonempty, distinct, and match rank.");
    return false;
  }
  if (
    coxeterMatrix.length !== rank ||
    coxeterMatrix.some((row) => row.length !== rank)
  ) {
    errors.push("The Coxeter matrix must be rank by rank.");
    return false;
  }
  for (let i = 0; i < rank; i += 1) {
    for (let j = 0; j < rank; j += 1) {
      const entry = coxeterMatrix[i][j];
      if (i === j) {
        if (entry !== 1) {
          errors.push(`Coxeter diagonal entry (${i},${j}) must be 1.`);
          return false;
        }
      } else if (entry !== "inf" && (!Number.isInteger(entry) || entry < 2)) {
        errors.push(
          `Off-diagonal Coxeter entry (${i},${j}) must be an integer at least 2 or inf.`,
        );
        return false;
      }
      if (entry !== coxeterMatrix[j][i]) {
        errors.push(`Coxeter entries (${i},${j}) and (${j},${i}) differ.`);
        return false;
      }
    }
  }
  return true;
}

function generatorOrder(presentation: LabelledS4CoxeterPresentation) {
  return new Map(
    presentation.generatorIds.map((generator, index) => [generator, index]),
  );
}

function normalizeSubset(
  subset: string[],
  order: Map<string, number>,
  label: string,
  errors: string[],
): string[] | null {
  if (subset.length === 0) {
    errors.push(`${label} must be nonempty.`);
    return null;
  }
  if (new Set(subset).size !== subset.length) {
    errors.push(`${label} repeats a generator.`);
    return null;
  }
  if (subset.some((generator) => !order.has(generator))) {
    errors.push(`${label} names a generator outside the presentation.`);
    return null;
  }
  return [...subset].sort(
    (left, right) => order.get(left)! - order.get(right)!,
  );
}

function compareNormalizedSubsets(left: string[], right: string[]): number {
  if (left.length !== right.length) return left.length - right.length;
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareStableText(left[index], right[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function normalizedSubsetFamily(
  subsets: string[][],
  presentation: LabelledS4CoxeterPresentation,
  label: string,
  errors: string[],
): string[][] | null {
  const order = generatorOrder(presentation);
  const normalized: string[][] = [];
  for (let index = 0; index < subsets.length; index += 1) {
    const subset = normalizeSubset(
      subsets[index],
      order,
      `${label}[${index}]`,
      errors,
    );
    if (subset === null) return null;
    normalized.push(subset);
  }
  normalized.sort(compareNormalizedSubsets);
  const keys = normalized.map((subset) => subset.join("\u0000"));
  if (new Set(keys).size !== keys.length) {
    errors.push(`${label} contains a duplicate subset.`);
    return null;
  }
  return normalized;
}

export function computeLabelledS4CoxeterDataSha256(
  presentation: LabelledS4CoxeterPresentation,
): string {
  return canonicalSha256({
    rank: presentation.rank,
    generatorIds: presentation.generatorIds,
    coxeterMatrix: presentation.coxeterMatrix,
  });
}

export function computeLabelledS4NerveSha256(
  presentation: LabelledS4CoxeterPresentation,
  nerve: LabelledS4NerveInput,
): string {
  const errors: string[] = [];
  const maximalSimplices = normalizedSubsetFamily(
    nerve.maximalSimplices,
    presentation,
    "nerve.maximalSimplices",
    errors,
  );
  if (maximalSimplices === null) {
    throw new Error(errors.join(" "));
  }
  return canonicalSha256({
    dimension: nerve.dimension,
    generatorIds: presentation.generatorIds,
    maximalSimplices,
  });
}

/** True exactly when every off-diagonal label is 2 or infinity. */
export function isRightAngledCoxeterPresentation(
  presentation: LabelledS4CoxeterPresentation,
): boolean {
  for (let i = 0; i < presentation.rank; i += 1) {
    for (let j = i + 1; j < presentation.rank; j += 1) {
      const entry = presentation.coxeterMatrix[i]?.[j];
      if (entry !== 2 && entry !== "inf") return false;
    }
  }
  return true;
}

function evidencePassed(
  binding: LabelledS4ExactEvidenceBinding,
  label: string,
  errors: string[],
  blockers: string[],
): boolean {
  if (!isRecord(binding)) {
    errors.push(`${label} evidence binding is missing or malformed.`);
    return false;
  }
  if (binding.status === "failed" || binding.replayStatus === "failed") {
    errors.push(`${label} exact evidence or replay failed.`);
    return false;
  }
  if (binding.status !== "passed" || binding.replayStatus !== "passed") {
    blockers.push(`${label} exact evidence has not passed replay.`);
    return false;
  }
  if (!binding.exactArithmetic) {
    errors.push(`${label} evidence is not exact arithmetic.`);
    return false;
  }
  if (
    typeof binding.backend !== "string" ||
    binding.backend.trim().length === 0 ||
    !replayBindingValid(binding.replay) ||
    !isSha256(binding.artifactSha256) ||
    !isNormalizedRepositoryRelativePath(binding.artifactPath)
  ) {
    errors.push(`${label} evidence is not a valid replayable file binding.`);
    return false;
  }
  return true;
}

function sameSubsetFamily(left: string[][], right: string[][]): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

function subsetContained(left: string[], right: string[]): boolean {
  const container = new Set(right);
  return left.every((generator) => container.has(generator));
}

function validateCommutingInfinitePair(
  pair: LabelledS4CommutingInfinitePair,
  presentation: LabelledS4CoxeterPresentation,
  index: number,
  errors: string[],
): void {
  const order = generatorOrder(presentation);
  const left = normalizeSubset(
    pair.left,
    order,
    `moussong.commutingInfinitePairs[${index}].left`,
    errors,
  );
  const right = normalizeSubset(
    pair.right,
    order,
    `moussong.commutingInfinitePairs[${index}].right`,
    errors,
  );
  if (left === null || right === null) return;
  if (!pair.leftCertifiedInfinite || !pair.rightCertifiedInfinite) {
    errors.push(`Moussong product obstruction ${index} lacks infinity proofs.`);
  }
  if (left.some((generator) => right.includes(generator))) {
    errors.push(`Moussong product obstruction ${index} is not disjoint.`);
    return;
  }
  for (const leftGenerator of left) {
    for (const rightGenerator of right) {
      const i = order.get(leftGenerator)!;
      const j = order.get(rightGenerator)!;
      if (presentation.coxeterMatrix[i][j] !== 2) {
        errors.push(
          `Moussong product obstruction ${index} has noncommuting cross generators.`,
        );
        return;
      }
    }
  }
}

export function preflightLabelledS4Candidate(
  candidate: LabelledS4NongeometricCandidate,
): LabelledS4PreflightResult {
  const errors: string[] = [];
  const blockers: string[] = [];
  const warnings = [
    "This lane certifies an abstract Coxeter/Davis candidate, not a real-H5 reflection realization.",
    "Finite-cover H1 and PL Morse link calculations begin only after this preflight passes.",
  ];
  const checks: LabelledS4PreflightChecks = {
    envelopeRecognized:
      candidate?.schemaVersion === 1 &&
      candidate?.kind === "labelled-s4-nongeometric-coxeter-candidate",
    abstractDavisScopeOnly:
      candidate?.claimScope === "abstract-coxeter-davis" &&
      candidate?.ambientGeometryClaim === "none" &&
      candidate?.intendedDavisDimension === 5,
    sourceProvenanceRecorded:
      Array.isArray(candidate?.sourceRefs) &&
      candidate.sourceRefs.length > 0 &&
      candidate.sourceRefs.every((source) => source.citation.trim().length > 0),
    matrixValid: false,
    nerveIsPureFourDimensional: false,
    everyGeneratorOccursInNerve: false,
    sphericalCertificateInputMatches: false,
    maximalSphericalSubsetsAgreeWithNerve: false,
    sphericalAuditExactAndExhaustive: false,
    plSphereCertificateInputMatches: false,
    plSphereProofExactAndReplayable: false,
    moussongCertificateInputMatches: false,
    moussongAuditsExactAndExhaustive: false,
    noIrreducibleAffineObstruction: false,
    noCommutingInfiniteSpecialPair: false,
    wordHyperbolicityCertified: false,
    nonRightAngled: false,
  };
  const candidateId = candidate?.id ?? "unknown";
  if (!checks.envelopeRecognized) errors.push("Candidate envelope is invalid.");
  if (!checks.abstractDavisScopeOnly) {
    errors.push(
      "Candidate must make only the abstract Coxeter/Davis claim; real-H5 geometry is outside this lane.",
    );
  }
  if (!checks.sourceProvenanceRecorded) {
    blockers.push("At least one nonempty source citation is required.");
  }
  checks.matrixValid = presentationShapeValid(candidate.presentation, errors);
  let coxeterDataSha256: string | null = null;
  let nerveSha256: string | null = null;
  let nerveFacets: string[][] | null = null;
  let sphericalFacets: string[][] | null = null;
  if (checks.matrixValid) {
    coxeterDataSha256 = computeLabelledS4CoxeterDataSha256(
      candidate.presentation,
    );
    checks.nonRightAngled = !isRightAngledCoxeterPresentation(
      candidate.presentation,
    );
    if (!checks.nonRightAngled) {
      errors.push(
        "Right-angled PL-S4 candidates are excluded: word-hyperbolicity would force an impossible flag-no-square four-dimensional generalized homology sphere.",
      );
    }
    nerveFacets = normalizedSubsetFamily(
      candidate.nerve.maximalSimplices,
      candidate.presentation,
      "nerve.maximalSimplices",
      errors,
    );
    if (nerveFacets !== null) {
      checks.nerveIsPureFourDimensional =
        candidate.nerve.dimension === 4 &&
        nerveFacets.length > 0 &&
        nerveFacets.every((simplex) => simplex.length === 5) &&
        !nerveFacets.some((simplex, index) =>
          nerveFacets!.some(
            (other, otherIndex) =>
              index !== otherIndex && subsetContained(simplex, other),
          ),
        );
      if (!checks.nerveIsPureFourDimensional) {
        errors.push(
          "The nerve must be recorded by distinct maximal five-vertex simplices.",
        );
      }
      const occurring = new Set(nerveFacets.flat());
      checks.everyGeneratorOccursInNerve =
        candidate.presentation.generatorIds.every((id) => occurring.has(id));
      if (!checks.everyGeneratorOccursInNerve) {
        errors.push("Every Coxeter generator must occur in the PL-S4 nerve.");
      }
      try {
        nerveSha256 = computeLabelledS4NerveSha256(
          candidate.presentation,
          candidate.nerve,
        );
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    sphericalFacets = normalizedSubsetFamily(
      candidate.sphericalSubsets.maximalSphericalSubsets,
      candidate.presentation,
      "sphericalSubsets.maximalSphericalSubsets",
      errors,
    );
  }

  if (coxeterDataSha256 !== null) {
    checks.sphericalCertificateInputMatches =
      candidate.sphericalSubsets.coxeterDataSha256 === coxeterDataSha256;
    if (!checks.sphericalCertificateInputMatches) {
      blockers.push("The maximal-spherical-subset certificate is stale.");
    }
    checks.moussongCertificateInputMatches =
      candidate.moussong.coxeterDataSha256 === coxeterDataSha256;
    if (!checks.moussongCertificateInputMatches) {
      blockers.push("The Moussong certificate is stale.");
    }
  }
  if (nerveSha256 !== null) {
    checks.plSphereCertificateInputMatches =
      candidate.plSphere.nerveSha256 === nerveSha256;
    if (!checks.plSphereCertificateInputMatches) {
      blockers.push("The PL-S4 certificate is stale.");
    }
  }
  if (nerveFacets !== null && sphericalFacets !== null) {
    checks.maximalSphericalSubsetsAgreeWithNerve = sameSubsetFamily(
      nerveFacets,
      sphericalFacets,
    );
    if (!checks.maximalSphericalSubsetsAgreeWithNerve) {
      errors.push(
        "The nerve facets do not equal the exact maximal spherical subsets.",
      );
    }
  }

  const sphericalEvidencePassed = evidencePassed(
    candidate.sphericalSubsets.evidence,
    "Maximal-spherical-subset",
    errors,
    blockers,
  );
  checks.sphericalAuditExactAndExhaustive =
    checks.sphericalCertificateInputMatches &&
    candidate.sphericalSubsets.exhaustive === true &&
    candidate.sphericalSubsets.allListedSubsetsCertifiedSpherical === true &&
    sphericalEvidencePassed;
  if (!candidate.sphericalSubsets.exhaustive) {
    blockers.push("The maximal spherical subset audit is not exhaustive.");
  }
  if (!candidate.sphericalSubsets.allListedSubsetsCertifiedSpherical) {
    errors.push("At least one claimed nerve facet is not certified spherical.");
  }

  const sphereEvidencePassed = evidencePassed(
    candidate.plSphere.evidence,
    "PL-S4",
    errors,
    blockers,
  );
  if (candidate.plSphere.conclusion === "not-pl-sphere") {
    errors.push("The exact topology certificate rejects the PL-S4 claim.");
  } else if (candidate.plSphere.conclusion === "unknown") {
    blockers.push("The PL-S4 conclusion is unknown.");
  }
  checks.plSphereProofExactAndReplayable =
    checks.plSphereCertificateInputMatches &&
    candidate.plSphere.dimension === 4 &&
    candidate.plSphere.conclusion === "pl-sphere" &&
    candidate.plSphere.closedCombinatorialManifoldVerified === true &&
    candidate.plSphere.integralHomologySphereVerified === true &&
    candidate.plSphere.plHomeomorphismVerified === true &&
    sphereEvidencePassed;
  if (
    candidate.plSphere.conclusion === "pl-sphere" &&
    !candidate.plSphere.plHomeomorphismVerified
  ) {
    errors.push(
      "Homology and manifold checks do not replace an exact PL-homeomorphism proof.",
    );
  }

  const moussongEvidencePassed = evidencePassed(
    candidate.moussong.evidence,
    "Moussong",
    errors,
    blockers,
  );
  checks.moussongAuditsExactAndExhaustive =
    checks.moussongCertificateInputMatches &&
    candidate.moussong.criterion ===
      "no-affine-rank-ge-3-and-no-commuting-infinite-special-pair" &&
    candidate.moussong.irreducibleAffineAuditExhaustive === true &&
    candidate.moussong.commutingInfinitePairAuditExhaustive === true &&
    moussongEvidencePassed;
  if (!candidate.moussong.irreducibleAffineAuditExhaustive) {
    blockers.push(
      "The irreducible affine special-subgroup audit is incomplete.",
    );
  }
  if (!candidate.moussong.commutingInfinitePairAuditExhaustive) {
    blockers.push("The commuting infinite special-pair audit is incomplete.");
  }
  const order = checks.matrixValid
    ? generatorOrder(candidate.presentation)
    : new Map<string, number>();
  for (
    let index = 0;
    index < candidate.moussong.irreducibleAffineRankAtLeastThreeSubsets.length;
    index += 1
  ) {
    const subset = normalizeSubset(
      candidate.moussong.irreducibleAffineRankAtLeastThreeSubsets[index],
      order,
      `moussong.irreducibleAffineRankAtLeastThreeSubsets[${index}]`,
      errors,
    );
    if (subset !== null && subset.length < 3) {
      errors.push("An affine obstruction row has rank below three.");
    }
  }
  if (checks.matrixValid) {
    candidate.moussong.commutingInfinitePairs.forEach((pair, index) =>
      validateCommutingInfinitePair(
        pair,
        candidate.presentation,
        index,
        errors,
      ),
    );
  }
  checks.noIrreducibleAffineObstruction =
    candidate.moussong.irreducibleAffineRankAtLeastThreeSubsets.length === 0;
  checks.noCommutingInfiniteSpecialPair =
    candidate.moussong.commutingInfinitePairs.length === 0;
  if (!checks.noIrreducibleAffineObstruction) {
    errors.push(
      "Moussong's criterion found an irreducible affine obstruction.",
    );
  }
  if (!checks.noCommutingInfiniteSpecialPair) {
    errors.push(
      "Moussong's criterion found a commuting infinite special pair.",
    );
  }
  if (
    candidate.moussong.conclusion === "word-hyperbolic" &&
    (!checks.noIrreducibleAffineObstruction ||
      !checks.noCommutingInfiniteSpecialPair)
  ) {
    errors.push("The Moussong conclusion contradicts its obstruction lists.");
  }
  if (candidate.moussong.conclusion === "unknown") {
    blockers.push("The exact word-hyperbolicity conclusion is unknown.");
  } else if (candidate.moussong.conclusion === "not-word-hyperbolic") {
    errors.push("The exact Moussong certificate rejects word-hyperbolicity.");
  }
  checks.wordHyperbolicityCertified =
    checks.moussongAuditsExactAndExhaustive &&
    checks.noIrreducibleAffineObstruction &&
    checks.noCommutingInfiniteSpecialPair &&
    candidate.moussong.conclusion === "word-hyperbolic";

  const status =
    errors.length > 0
      ? "rejected"
      : blockers.length > 0
        ? "blocked"
        : Object.values(checks).every(Boolean)
          ? "passed"
          : "blocked";
  if (status === "blocked" && blockers.length === 0) {
    blockers.push("One or more exact preflight checks remain incomplete.");
  }
  return {
    candidateId,
    status,
    checks,
    digests: { coxeterDataSha256, nerveSha256 },
    errors,
    blockers,
    warnings,
  };
}

export function buildLabelledS4PilotPlan(
  candidates: LabelledS4NongeometricCandidate[],
  limits: LabelledS4PilotLimits = LABELLED_S4_DEFAULT_PILOT_LIMITS,
): LabelledS4PilotPlan {
  const audited = candidates.map((candidate) => ({
    candidate,
    preflight: preflightLabelledS4Candidate(candidate),
  }));
  audited.sort(
    (left, right) =>
      left.candidate.nerve.maximalSimplices.length -
        right.candidate.nerve.maximalSimplices.length ||
      left.candidate.presentation.rank - right.candidate.presentation.rank ||
      compareStableText(left.candidate.id, right.candidate.id),
  );
  let queued = 0;
  const entries = audited.map(({ candidate, preflight }) => {
    const reasons: string[] = [];
    let disposition: LabelledS4PilotPlanEntry["disposition"];
    if (preflight.status === "rejected") {
      disposition = "reject";
      reasons.push(...preflight.errors);
    } else if (preflight.status === "blocked") {
      disposition = "blocked";
      reasons.push(...preflight.blockers);
    } else if (
      candidate.presentation.rank > limits.maxRank ||
      candidate.nerve.maximalSimplices.length > limits.maxNerveFacets ||
      queued >= limits.maxCandidates
    ) {
      disposition = "defer-capacity";
      reasons.push("Candidate exceeds the bounded pilot queue.");
    } else {
      disposition = "queue";
      queued += 1;
    }
    return {
      candidateId: candidate.id,
      rank: candidate.presentation.rank,
      nerveFacetCount: candidate.nerve.maximalSimplices.length,
      preflightStatus: preflight.status,
      disposition,
      reasons,
    };
  });
  const queuedCandidateIds = entries
    .filter(({ disposition }) => disposition === "queue")
    .map(({ candidateId }) => candidateId);
  return {
    schemaVersion: 1,
    kind: "labelled-s4-nongeometric-pilot-plan",
    status:
      candidates.length === 0
        ? "candidate-intake-open"
        : queuedCandidateIds.length > 0
          ? "bounded-queue-ready"
          : "no-survivor",
    limits: { ...limits },
    entries,
    queuedCandidateIds,
  };
}
