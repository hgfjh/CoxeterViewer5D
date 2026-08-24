import { parseCoxeterSystemInput } from "../coxeter";
import {
  discoverTorsionFreeCover,
  exactIntegerToBigInt,
  type SphericalSubsetPlan,
  type TorsionFreeActionCandidate,
  type TorsionFreeDiscoveryResult,
  type TorsionFreeIndexLowerBound,
  computeTorsionFreeIndexLowerBound,
  planSphericalSpecialSubgroups,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";

export interface AutomaticCoverSearchOptions {
  backend: "auto" | "gap" | "sage";
  maxIndex: number;
  maxCandidates: number;
  maxModuleCandidates: number;
  maxCompositeModules: number;
  maxCompositeCombinations: number;
  maxCongruencePrime: number;
  maxCongruenceImageOrder: number;
  maxLowIndexFallback: number;
  maxMemoryBytes: number;
  lightWorkers: number;
  heavyWorkers: number;
  maxWitnesses: number;
  maxSphericalOrder: number;
  maxSubsets: number;
  timeoutSeconds: number;
}

export interface AutomaticCoverSearchPlan {
  sphericalPlan: SphericalSubsetPlan;
  indexLowerBound: TorsionFreeIndexLowerBound;
  request: AutomaticCoverSearchRequest;
}

export interface AutomaticCoverSearchRequest {
  schemaVersion: 1;
  artifactType: "coxeter-torsion-free-discovery-request";
  sourceSystem: CoxeterSystemInput;
  search: AutomaticCoverSearchOptions;
}

export interface AutomaticKernelSphericalImageCheck {
  subset: number[];
  expectedOrder: string;
  imageOrder: string;
  passed: true;
}

interface AutomaticKernelCoverCertificateBase {
  status: "passed";
  kind: "normal-congruence-kernel";
  normal: true;
  torsionFree: true;
  certificateLevel: "finite-index-kernel" | "exact-index-kernel";
  indexStatus: "unknown" | "exact";
  finiteImage: {
    candidateId: string;
    characteristic: number;
    residueFieldOrder: string;
    representationDimension?: number;
    finiteTargetCertified: true;
    orderStatus: "unknown" | "exact";
    order?: string;
  };
  criterion:
    | "tits-spherical-image-order"
    | "tits-maximal-spherical-injective-reduction";
  completeSphericalRestrictionChecks: true;
  sphericalImageChecks: AutomaticKernelSphericalImageCheck[];
  materialization: {
    status: "not-materialized" | "too-large";
    reason: string;
    maximumMaterializedDegree?: number;
  };
  claims?: string[];
  nonClaims?: string[];
}

/**
 * Exact matrices over a finite field and injectivity on every maximal
 * spherical subgroup already certify a finite-index torsion-free kernel. The
 * image order, and hence the kernel index, is deliberately absent at this
 * level.
 */
export interface AutomaticFiniteIndexKernelCertificate extends AutomaticKernelCoverCertificateBase {
  certificateLevel: "finite-index-kernel";
  indexStatus: "unknown";
  index?: never;
  finiteImage: AutomaticKernelCoverCertificateBase["finiteImage"] & {
    orderStatus: "unknown";
    order?: never;
    representationDimension: number;
  };
}

/** Decimal strings keep exact group orders outside JavaScript's safe range. */
export interface AutomaticExactIndexKernelCertificate extends AutomaticKernelCoverCertificateBase {
  certificateLevel: "exact-index-kernel";
  indexStatus: "exact";
  index: string;
  finiteImage: AutomaticKernelCoverCertificateBase["finiteImage"] & {
    orderStatus: "exact";
    order: string;
  };
}

export type AutomaticKernelCoverCertificate =
  | AutomaticFiniteIndexKernelCertificate
  | AutomaticExactIndexKernelCertificate;

export interface AutomaticCoverSearchArtifact {
  schemaVersion: 1;
  artifactType: "coxeter-torsion-free-discovery";
  status:
    | "passed"
    | "failed"
    | "exhausted"
    | "skipped"
    | "timeout"
    | "cancelled";
  ok: boolean;
  sourceSystem?: CoxeterSystemInput;
  bounds?: Partial<AutomaticCoverSearchOptions>;
  kernelCover?: AutomaticKernelCoverCertificate;
  finiteImageReports?: AutomaticFiniteImageEvidenceReport[];
  finiteAction?: {
    degree: number;
    vertices: Array<{
      id: string;
      representativeWord?: number[];
    }>;
    generatorActions: Array<{
      generator: number;
      images: string[];
    }>;
    subgroupGenerators?: number[][];
    cosetConvention?: string;
  };
  certificate?: {
    status?: string;
    criterion?: string;
    completeTorsionWitnessCatalogue?: boolean;
    completeSphericalRestrictionChecks?: boolean;
    claims?: string[];
    nonClaims?: string[];
  };
  sphericalCatalogue?: {
    complete?: boolean;
    maximalSubgroups?: unknown[];
  };
  search?: {
    method?: string;
    candidatesChecked?: number;
    maxIndex?: number;
    maxCandidates?: number;
    iteratorComplete?: boolean;
    reason?: string;
    selectedStrategy?: AutomaticCoverStrategyId;
  };
  strategyAttempts?: AutomaticCoverStrategyAttempt[];
  indexLowerBound?: {
    value: string;
    contributingSubgroupIds?: string[];
  };
  congruence?: {
    cyclotomicOrder?: number;
    rationalPrime?: number;
    primeIdeal?: string;
    residueFieldOrder?: number;
    imageOrder?: number;
    sphericalImageChecks?: Array<{
      subset: number[];
      expectedOrder: number;
      imageOrder: number;
      passed: boolean;
    }>;
  };
  composite?: {
    moduleIds?: string[];
    moduleDegrees?: number[];
    cartesianDegreeBound?: number;
    orbitDegree?: number;
    coveredWitnessIds?: string[];
  };
  provenance?: {
    backend?: string;
    backendVersion?: string;
    gapVersion?: string;
    runtime?: string;
    command?: string;
    inputHash?: string;
    artifactHash?: string;
    checkpointPath?: string;
    scratchKind?: "wsl-ext4" | "native";
  };
  warnings?: string[];
  errors?: string[];
}

export type AutomaticFiniteImageDegreeOutcome =
  | "impossible"
  | "witness-contaminated"
  | "materialized-and-rejected"
  | "certified-torsion-free"
  | "unresolved-family-coverage"
  | "ruled-out"
  | "admissible"
  | "unknown";

export interface AutomaticFiniteImageDegreeDecision {
  degree: number;
  outcome: AutomaticFiniteImageDegreeOutcome;
  complete: boolean;
  reason: string;
}

export interface AutomaticFiniteImageEvidenceReport {
  sourceArtifactHash?: string;
  residueSource: {
    candidateId: string;
    rationalPrime?: number;
    primeIdeal?: string;
    primeIdealNorm?: number;
    residueDegree?: number;
    residueFieldOrder?: number;
    status?: string;
    reason?: string;
  };
  degreeLedger: AutomaticFiniteImageDegreeDecision[];
  boundedComplete: boolean;
  subgroupSearchReason?: string;
  classificationScope?: {
    classificationCeiling?: number;
    completeNecessaryIndexSieve?: boolean;
    completeSubgroupFamilyClassification?: boolean;
    requestedCeiling576000Covered?: boolean;
    statement?: string;
  };
}

export type AutomaticCoverStrategyId =
  | "gap-low-index"
  | "sage-congruence-kernel"
  | "sage-finite-image-coset"
  | "everitt-composite";

export interface AutomaticCoverStrategyAttempt {
  strategy: AutomaticCoverStrategyId;
  status: "passed" | "failed" | "exhausted" | "skipped" | "timeout";
  message: string;
  candidateDegree?: number;
  elapsedMs?: number;
}

export interface CertifiedAutomaticCover {
  artifact: AutomaticCoverSearchArtifact;
  result: TorsionFreeDiscoveryResult;
}

export type AutomaticCoverSearchStatus =
  | "ready"
  | "searching"
  | "found"
  | "exhausted"
  | "skipped"
  | "timeout"
  | "failed";

export interface AutomaticCoverSearchState {
  status: AutomaticCoverSearchStatus;
  message: string;
  jobId?: string;
  artifactPath?: string;
  artifact?: AutomaticCoverSearchArtifact;
}

export const DEFAULT_AUTOMATIC_COVER_SEARCH: AutomaticCoverSearchOptions = {
  backend: "auto",
  maxIndex: 256,
  maxCandidates: 32,
  maxModuleCandidates: 96,
  maxCompositeModules: 4,
  maxCompositeCombinations: 20_000,
  maxCongruencePrime: 31,
  maxCongruenceImageOrder: 100_000,
  maxLowIndexFallback: 512,
  maxMemoryBytes: 12 * 1024 * 1024 * 1024,
  lightWorkers: 4,
  heavyWorkers: 1,
  maxWitnesses: 4096,
  maxSphericalOrder: 100_000,
  maxSubsets: 65_536,
  timeoutSeconds: 120,
};

/**
 * Computes the exact finite-Coxeter catalogue before asking an external tool
 * to search. The LCM is a necessary index divisor, not an existence claim.
 */
export function buildAutomaticCoverSearchPlan(
  input: unknown,
  options: AutomaticCoverSearchOptions = DEFAULT_AUTOMATIC_COVER_SEARCH,
): AutomaticCoverSearchPlan {
  const sourceSystem = parseCoxeterSystemInput(input);
  const sphericalPlan = planSphericalSpecialSubgroups(sourceSystem, {
    maxRankForExhaustiveEnumeration: 16,
    maxSubsetsToCheck: options.maxSubsets,
    maxSubsetRankWhenIncomplete: 2,
  });
  return {
    sphericalPlan,
    indexLowerBound: computeTorsionFreeIndexLowerBound(sphericalPlan),
    request: {
      schemaVersion: 1,
      artifactType: "coxeter-torsion-free-discovery-request",
      sourceSystem,
      search: options,
    },
  };
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function positiveDecimal(value: unknown, field: string): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${field} must be a positive decimal integer.`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive safe integer.`);
  }
  return value;
}

function isPrime(value: number): boolean {
  if (value < 2) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function isPowerOf(value: string, prime: number): boolean {
  let remainder = BigInt(value);
  const divisor = BigInt(prime);
  while (remainder > 1n && remainder % divisor === 0n) {
    remainder /= divisor;
  }
  return remainder === 1n;
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return [...value];
}

/**
 * Parse an existence certificate for a congruence kernel.  This check is
 * deliberately independent of finite-action parsing: passing it never creates
 * quotient vertices or enables the downstream cover pipeline.
 */
export function parseAutomaticKernelCoverCertificate(
  input: unknown,
  sourceRank: number,
): AutomaticKernelCoverCertificate {
  const value = asRecord(input, "kernelCover must be an object.");
  if (
    value.status !== "passed" ||
    value.kind !== "normal-congruence-kernel" ||
    value.normal !== true ||
    value.torsionFree !== true
  ) {
    throw new Error(
      "kernelCover must certify a passed, normal, torsion-free congruence kernel.",
    );
  }

  const finiteImage = asRecord(
    value.finiteImage,
    "kernelCover.finiteImage must be an object.",
  );
  if (
    typeof finiteImage.candidateId !== "string" ||
    finiteImage.candidateId.trim().length === 0
  ) {
    throw new Error("kernelCover finite-image candidate id is required.");
  }
  const legacyExactCertificate =
    value.certificateLevel === undefined &&
    value.index !== undefined &&
    finiteImage.order !== undefined;
  const certificateLevel = legacyExactCertificate
    ? "exact-index-kernel"
    : value.certificateLevel;
  const indexStatus = legacyExactCertificate ? "exact" : value.indexStatus;
  const orderStatus = legacyExactCertificate
    ? "exact"
    : finiteImage.orderStatus;
  if (
    (certificateLevel !== "finite-index-kernel" &&
      certificateLevel !== "exact-index-kernel") ||
    (indexStatus !== "unknown" && indexStatus !== "exact") ||
    (orderStatus !== "unknown" && orderStatus !== "exact")
  ) {
    throw new Error("kernelCover has an unsupported certificate level.");
  }
  if (
    (certificateLevel === "exact-index-kernel") !== (indexStatus === "exact") ||
    (indexStatus === "exact") !== (orderStatus === "exact")
  ) {
    throw new Error(
      "kernelCover certificate, index, and finite-image order levels disagree.",
    );
  }
  const characteristic = positiveSafeInteger(
    finiteImage.characteristic,
    "kernelCover.finiteImage.characteristic",
  );
  if (!isPrime(characteristic)) {
    throw new Error("kernelCover finite-image characteristic must be prime.");
  }
  const residueFieldOrder = positiveDecimal(
    finiteImage.residueFieldOrder,
    "kernelCover.finiteImage.residueFieldOrder",
  );
  if (!isPowerOf(residueFieldOrder, characteristic)) {
    throw new Error(
      "kernelCover residue-field order must be a power of its characteristic.",
    );
  }
  const finiteTargetCertified =
    finiteImage.finiteTargetCertified === true || legacyExactCertificate;
  if (!finiteTargetCertified) {
    throw new Error(
      "kernelCover must certify an exact matrix image over its finite residue field.",
    );
  }
  const representationDimension =
    finiteImage.representationDimension === undefined
      ? undefined
      : positiveSafeInteger(
          finiteImage.representationDimension,
          "kernelCover.finiteImage.representationDimension",
        );
  if (certificateLevel === "finite-index-kernel" && !representationDimension) {
    throw new Error(
      "An unknown-index kernel certificate must record its matrix representation dimension.",
    );
  }

  const index =
    certificateLevel === "exact-index-kernel"
      ? positiveDecimal(value.index, "kernelCover.index")
      : undefined;
  const finiteImageOrder =
    certificateLevel === "exact-index-kernel"
      ? positiveDecimal(finiteImage.order, "kernelCover.finiteImage.order")
      : undefined;
  if (index !== finiteImageOrder) {
    throw new Error(
      "A congruence-kernel index must equal the order of its finite image.",
    );
  }
  if (
    certificateLevel === "finite-index-kernel" &&
    (value.index !== undefined || finiteImage.order !== undefined)
  ) {
    throw new Error(
      "An unknown-index kernel certificate cannot include an uncertified index or image order.",
    );
  }

  if (
    value.criterion !== "tits-spherical-image-order" &&
    value.criterion !== "tits-maximal-spherical-injective-reduction"
  ) {
    throw new Error("kernelCover uses an unsupported torsion criterion.");
  }
  const criterion: AutomaticKernelCoverCertificateBase["criterion"] =
    value.criterion;
  if (value.completeSphericalRestrictionChecks !== true) {
    throw new Error(
      "kernelCover must mark its maximal-spherical restriction checks complete.",
    );
  }
  if (
    !Array.isArray(value.sphericalImageChecks) ||
    value.sphericalImageChecks.length === 0
  ) {
    throw new Error(
      "kernelCover must include its complete spherical image checks.",
    );
  }
  const sphericalImageChecks = value.sphericalImageChecks.map(
    (entry, checkIndex): AutomaticKernelSphericalImageCheck => {
      const check = asRecord(
        entry,
        `kernelCover spherical check ${checkIndex} must be an object.`,
      );
      if (
        !Array.isArray(check.subset) ||
        check.subset.length === 0 ||
        check.subset.some(
          (generator) =>
            typeof generator !== "number" ||
            !Number.isSafeInteger(generator) ||
            generator < 0 ||
            generator >= sourceRank,
        )
      ) {
        throw new Error(
          `kernelCover spherical check ${checkIndex} has an invalid subset.`,
        );
      }
      const subset = [...check.subset] as number[];
      if (
        subset.some(
          (generator, indexInSubset) =>
            indexInSubset > 0 && generator <= subset[indexInSubset - 1],
        )
      ) {
        throw new Error(
          `kernelCover spherical check ${checkIndex} subset must be sorted and unique.`,
        );
      }
      const expectedOrder = positiveDecimal(
        check.expectedOrder,
        `kernelCover spherical check ${checkIndex} expectedOrder`,
      );
      const imageOrder = positiveDecimal(
        check.imageOrder,
        `kernelCover spherical check ${checkIndex} imageOrder`,
      );
      if (check.passed !== true || expectedOrder !== imageOrder) {
        throw new Error(
          `kernelCover spherical check ${checkIndex} does not certify injectivity.`,
        );
      }
      return { subset, expectedOrder, imageOrder, passed: true };
    },
  );

  const materialization = asRecord(
    value.materialization,
    "kernelCover.materialization must be an object.",
  );
  if (
    materialization.status !== "not-materialized" &&
    materialization.status !== "too-large"
  ) {
    throw new Error(
      "kernelCover materialization status must say not-materialized or too-large.",
    );
  }
  const materializationStatus: "not-materialized" | "too-large" =
    materialization.status;
  if (
    typeof materialization.reason !== "string" ||
    materialization.reason.trim().length === 0
  ) {
    throw new Error("kernelCover materialization reason is required.");
  }
  const maximumMaterializedDegree =
    materialization.maximumMaterializedDegree === undefined
      ? undefined
      : positiveSafeInteger(
          materialization.maximumMaterializedDegree,
          "kernelCover.materialization.maximumMaterializedDegree",
        );

  const common = {
    status: "passed" as const,
    kind: "normal-congruence-kernel" as const,
    normal: true as const,
    torsionFree: true as const,
    criterion,
    completeSphericalRestrictionChecks: true as const,
    sphericalImageChecks,
    materialization: {
      status: materializationStatus,
      reason: materialization.reason,
      maximumMaterializedDegree,
    },
    claims: stringArray(value.claims, "kernelCover.claims"),
    nonClaims: stringArray(value.nonClaims, "kernelCover.nonClaims"),
  };
  if (certificateLevel === "finite-index-kernel") {
    return {
      ...common,
      certificateLevel,
      indexStatus: "unknown",
      finiteImage: {
        candidateId: finiteImage.candidateId,
        characteristic,
        residueFieldOrder,
        representationDimension: representationDimension!,
        finiteTargetCertified: true,
        orderStatus: "unknown",
      },
    };
  }
  return {
    ...common,
    certificateLevel,
    indexStatus: "exact",
    index: index!,
    finiteImage: {
      candidateId: finiteImage.candidateId,
      characteristic,
      residueFieldOrder,
      representationDimension,
      finiteTargetCertified: true,
      orderStatus: "exact",
      order: finiteImageOrder!,
    },
  };
}

const FINITE_IMAGE_DEGREE_OUTCOMES = new Set<AutomaticFiniteImageDegreeOutcome>(
  [
    "impossible",
    "witness-contaminated",
    "materialized-and-rejected",
    "certified-torsion-free",
    "unresolved-family-coverage",
    "ruled-out",
    "admissible",
    "unknown",
  ],
);

function parseFiniteImageEvidenceReports(
  input: unknown,
): AutomaticFiniteImageEvidenceReport[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    throw new Error("finiteImageReports must be an array.");
  }
  return input.map((entry, reportIndex) => {
    const report = asRecord(
      entry,
      `finiteImageReports[${reportIndex}] must be an object.`,
    );
    const source = asRecord(
      report.residueSource,
      `finiteImageReports[${reportIndex}].residueSource must be an object.`,
    );
    if (
      typeof source.candidateId !== "string" ||
      source.candidateId.trim().length === 0
    ) {
      throw new Error(
        `finiteImageReports[${reportIndex}] needs a residue candidate id.`,
      );
    }
    if (!Array.isArray(report.degreeLedger)) {
      throw new Error(
        `finiteImageReports[${reportIndex}].degreeLedger must be an array.`,
      );
    }
    const seenDegrees = new Set<number>();
    const degreeLedger = report.degreeLedger.map((raw, decisionIndex) => {
      const decision = asRecord(
        raw,
        `finite-image degree decision ${decisionIndex} must be an object.`,
      );
      const degree = positiveSafeInteger(
        decision.degree,
        `finite-image degree decision ${decisionIndex}.degree`,
      );
      if (seenDegrees.has(degree)) {
        throw new Error(`Finite-image degree ${degree} is repeated.`);
      }
      seenDegrees.add(degree);
      if (
        typeof decision.outcome !== "string" ||
        !FINITE_IMAGE_DEGREE_OUTCOMES.has(
          decision.outcome as AutomaticFiniteImageDegreeOutcome,
        )
      ) {
        throw new Error(
          `Finite-image degree ${degree} has an unknown outcome.`,
        );
      }
      if (
        typeof decision.complete !== "boolean" ||
        typeof decision.reason !== "string" ||
        decision.reason.trim().length === 0
      ) {
        throw new Error(
          `Finite-image degree ${degree} needs completeness and a reason.`,
        );
      }
      return {
        degree,
        outcome: decision.outcome as AutomaticFiniteImageDegreeOutcome,
        complete: decision.complete,
        reason: decision.reason,
      };
    });
    if (
      degreeLedger.some(
        (decision, index) =>
          index > 0 && decision.degree <= degreeLedger[index - 1].degree,
      )
    ) {
      throw new Error("Finite-image degree ledgers must be strictly sorted.");
    }
    if (typeof report.boundedComplete !== "boolean") {
      throw new Error(
        `finiteImageReports[${reportIndex}].boundedComplete must be boolean.`,
      );
    }
    if (
      report.boundedComplete !==
      (degreeLedger.length > 0 && degreeLedger.every((item) => item.complete))
    ) {
      throw new Error(
        `finiteImageReports[${reportIndex}] has inconsistent bounded completeness.`,
      );
    }
    return {
      sourceArtifactHash:
        typeof report.sourceArtifactHash === "string"
          ? report.sourceArtifactHash
          : undefined,
      residueSource: {
        candidateId: source.candidateId,
        rationalPrime:
          typeof source.rationalPrime === "number"
            ? source.rationalPrime
            : undefined,
        primeIdeal:
          typeof source.primeIdeal === "string" ? source.primeIdeal : undefined,
        primeIdealNorm:
          typeof source.primeIdealNorm === "number"
            ? source.primeIdealNorm
            : undefined,
        residueDegree:
          typeof source.residueDegree === "number"
            ? source.residueDegree
            : undefined,
        residueFieldOrder:
          typeof source.residueFieldOrder === "number"
            ? source.residueFieldOrder
            : undefined,
        status: typeof source.status === "string" ? source.status : undefined,
        reason: typeof source.reason === "string" ? source.reason : undefined,
      },
      degreeLedger,
      boundedComplete: report.boundedComplete,
      subgroupSearchReason:
        typeof report.subgroupSearchReason === "string"
          ? report.subgroupSearchReason
          : undefined,
      classificationScope:
        report.classificationScope &&
        typeof report.classificationScope === "object"
          ? (report.classificationScope as AutomaticFiniteImageEvidenceReport["classificationScope"])
          : undefined,
    };
  });
}

/** Validate the stable external artifact envelope without trusting its claim. */
export function parseAutomaticCoverSearchArtifact(
  input: unknown,
): AutomaticCoverSearchArtifact {
  const value = asRecord(input, "Discovery backend did not return an object.");
  if (
    value.schemaVersion !== 1 ||
    value.artifactType !== "coxeter-torsion-free-discovery"
  ) {
    throw new Error(
      "Expected a schemaVersion 1 torsion-free discovery artifact.",
    );
  }
  if (
    value.status !== "passed" &&
    value.status !== "failed" &&
    value.status !== "exhausted" &&
    value.status !== "skipped" &&
    value.status !== "timeout" &&
    value.status !== "cancelled"
  ) {
    throw new Error(`Unknown discovery status: ${String(value.status)}.`);
  }
  if (!Array.isArray(value.warnings) || !Array.isArray(value.errors)) {
    throw new Error("Discovery artifact warnings and errors must be arrays.");
  }
  const artifact = value as unknown as AutomaticCoverSearchArtifact;
  artifact.finiteImageReports = parseFiniteImageEvidenceReports(
    value.finiteImageReports,
  );
  if (value.kernelCover !== undefined) {
    if (value.sourceSystem === undefined) {
      throw new Error(
        "A kernelCover certificate must include its source Coxeter system.",
      );
    }
    const sourceSystem = parseCoxeterSystemInput(value.sourceSystem);
    artifact.kernelCover = parseAutomaticKernelCoverCertificate(
      value.kernelCover,
      sourceSystem.rank,
    );
  }
  return artifact;
}

export interface AutomaticCoverAvailabilitySummary {
  torsionFreeCoverCertified: boolean;
  torsionFreeCoverSummary: string;
  exactIndexCertified: boolean;
  exactIndexSummary: string;
  manageableCoverMaterialized: boolean;
  manageableCoverSummary: string;
  downstreamEnabled: boolean;
  downstreamReason?: string;
}

export interface AutomaticSymbolicKernelCellCount {
  rank: number;
  sphericalTypeCount: number;
  cellCount: string;
}

/**
 * Compact exact counts for the regular kernel cover H\Sigma, retained by
 * deck-group orbits rather than by enumerating its often enormous vertex set.
 * This is useful planning data; it is not a materialized wall or Morse model.
 */
export interface AutomaticSymbolicKernelSummary {
  status: "exact-orbit-model";
  deckGroupOrder: string;
  vertexCount: string;
  generatorTransitionFamilies: number;
  cellCountsByRank: AutomaticSymbolicKernelCellCount[];
  unrestrictedWallSearchAvailable: false;
  fiberingPromotionAllowed: false;
  explanation: string;
}

export function summarizeAutomaticSymbolicKernel(
  artifact: AutomaticCoverSearchArtifact | undefined,
  sphericalPlan: SphericalSubsetPlan,
): AutomaticSymbolicKernelSummary | undefined {
  const kernel = artifact?.kernelCover;
  if (
    kernel?.status !== "passed" ||
    kernel.indexStatus !== "exact" ||
    sphericalPlan.status !== "complete"
  ) {
    return undefined;
  }
  const order = BigInt(kernel.index);
  const counts = new Map<number, { types: number; cells: bigint }>();
  counts.set(0, { types: 1, cells: order });
  for (const subgroup of sphericalPlan.sphericalSubgroups) {
    const subgroupOrder = exactIntegerToBigInt(subgroup.order);
    if (subgroupOrder <= 0n || order % subgroupOrder !== 0n) {
      // A parsed kernel certificate and the current spherical plan should
      // agree. Fail closed if imported evidence is stale or mismatched.
      return undefined;
    }
    const current = counts.get(subgroup.rank) ?? { types: 0, cells: 0n };
    current.types += 1;
    current.cells += order / subgroupOrder;
    counts.set(subgroup.rank, current);
  }
  return {
    status: "exact-orbit-model",
    deckGroupOrder: order.toString(),
    vertexCount: order.toString(),
    generatorTransitionFamilies: sphericalPlan.rank,
    cellCountsByRank: [...counts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([rank, value]) => ({
        rank,
        sphericalTypeCount: value.types,
        cellCount: value.cells.toString(),
      })),
    unrestrictedWallSearchAvailable: false,
    fiberingPromotionAllowed: false,
    explanation:
      "The regular kernel cover is represented exactly by deck-group orbit formulas. Its individual cells, walls, and links have not been enumerated.",
  };
}

/** Keep existence of a torsion-free kernel separate from a usable coset action. */
export function summarizeAutomaticCoverAvailability(
  artifact: AutomaticCoverSearchArtifact | undefined,
  materializedCover?: { index: number; certified: boolean },
): AutomaticCoverAvailabilitySummary {
  const kernel = artifact?.kernelCover;
  const materialized =
    materializedCover !== undefined &&
    Number.isSafeInteger(materializedCover.index) &&
    materializedCover.index > 0;
  const torsionFreeCoverCertified =
    kernel?.status === "passed" ||
    (materialized && materializedCover.certified);
  const exactIndexCertified =
    kernel?.indexStatus === "exact" ||
    (materialized && materializedCover.certified);
  const torsionFreeCoverSummary = kernel
    ? kernel.indexStatus === "exact"
      ? `Certified normal congruence kernel (exact index ${kernel.index}).`
      : "Certified normal congruence kernel (finite index; exact index not yet known)."
    : materializedCover?.certified
      ? `Certified from the materialized action (index ${materializedCover.index}).`
      : "No torsion-free cover certificate is loaded.";
  const manageableCoverSummary = materialized
    ? `Materialized cover available (index ${materializedCover.index}).`
    : kernel
      ? `No manageable cover was materialized. ${kernel.materialization.reason}`
      : "No manageable cover has been found or imported.";
  const exactIndexSummary =
    kernel?.indexStatus === "exact"
      ? `Exact kernel index ${kernel.index} is certified.`
      : materialized && materializedCover.certified
        ? `Exact cover index ${materializedCover.index} follows from the checked action.`
        : torsionFreeCoverCertified
          ? "Finite index is certified; its exact value is not yet known."
          : "No exact cover index is certified.";

  return {
    torsionFreeCoverCertified,
    torsionFreeCoverSummary,
    exactIndexCertified,
    exactIndexSummary,
    manageableCoverMaterialized: materialized,
    manageableCoverSummary,
    downstreamEnabled: materialized,
    downstreamReason: materialized
      ? undefined
      : kernel
        ? "The certified kernel establishes existence, but without its finite action the app cannot construct hat X, walls, or fibering data."
        : "A materialized finite action is required before the quotient and fibering pipeline can run.",
  };
}

function sameCoxeterPresentation(
  left: CoxeterSystemInput,
  right: CoxeterSystemInput,
): boolean {
  return (
    left.rank === right.rank &&
    left.coxeterMatrix.every((row, index) =>
      row.every(
        (entry, column) => entry === right.coxeterMatrix[index][column],
      ),
    )
  );
}

function candidateFromArtifact(
  artifact: AutomaticCoverSearchArtifact,
): TorsionFreeActionCandidate {
  const action = artifact.finiteAction;
  if (!action || !Number.isSafeInteger(action.degree) || action.degree < 1) {
    throw new Error("Passing discovery artifact has no finite action.");
  }
  if (action.vertices.length !== action.degree) {
    throw new Error("Finite action must have one vertex per action point.");
  }
  const pointById = new Map(
    action.vertices.map((vertex, point) => [vertex.id, point]),
  );
  if (pointById.size !== action.degree) {
    throw new Error("Finite action vertex ids must be unique.");
  }
  const generatorImages = [...action.generatorActions]
    .sort((left, right) => left.generator - right.generator)
    .map((entry, expectedGenerator) => {
      if (
        entry.generator !== expectedGenerator ||
        entry.images.length !== action.degree
      ) {
        throw new Error("Finite action generator table is incomplete.");
      }
      return entry.images.map((vertexId) => {
        const point = pointById.get(vertexId);
        if (point === undefined) {
          throw new Error(
            `Finite action references unknown point ${vertexId}.`,
          );
        }
        return point;
      });
    });
  const strategy = artifact.search?.selectedStrategy;
  const strategyLabel =
    strategy === "sage-congruence-kernel" ||
    strategy === "sage-finite-image-coset"
      ? strategy === "sage-finite-image-coset"
        ? "Sage finite-image coset action"
        : "Sage congruence kernel"
      : strategy === "everitt-composite"
        ? "Everitt composite action"
        : "GAP point stabilizer";
  return {
    id: `external-${strategy ?? "gap"}-index-${action.degree}`,
    name: `${strategyLabel} (index ${action.degree})`,
    index: action.degree,
    generatorImages,
    pointLabels: action.vertices.map((vertex) => vertex.id),
    representativeWords: action.vertices.map(
      (vertex) => vertex.representativeWord ?? [],
    ),
    backend: artifact.provenance?.backend ?? strategy ?? "automatic-cover",
    backendVersion: artifact.provenance?.backendVersion,
    source: artifact.provenance?.command,
    notes: [
      action.cosetConvention ??
        "Transitive finite action returned by the automatic cover ladder.",
      `External artifact: ${artifact.provenance?.artifactHash ?? "hash unavailable"}.`,
    ],
  };
}

/**
 * Independently certifies the backend action and constructs a QuotientComplex.
 * A GAP `passed` string alone is never enough to enter the cover pipeline.
 */
export function certifyAutomaticCoverArtifact(
  artifactInput: unknown,
  expectedSystem: CoxeterSystemInput,
): CertifiedAutomaticCover {
  const artifact = parseAutomaticCoverSearchArtifact(artifactInput);
  if (artifact.kernelCover && !artifact.finiteAction) {
    const indexDescription =
      artifact.kernelCover.indexStatus === "exact"
        ? `at index ${artifact.kernelCover.index}`
        : "at finite but not yet exactly determined index";
    throw new Error(
      `The normal congruence kernel is certified ${indexDescription}, but it is not materialized. A finite action is required to construct hat X or run the wall/fibering pipeline.`,
    );
  }
  if (
    artifact.status !== "passed" ||
    artifact.certificate?.status !== "passed"
  ) {
    throw new Error(
      `Discovery did not produce a certified action (status ${artifact.status}).`,
    );
  }
  const completeExternalCriterion =
    artifact.certificate.criterion === "tits-prime-order-fixed-point"
      ? artifact.certificate.completeTorsionWitnessCatalogue === true
      : artifact.certificate.criterion === "tits-spherical-image-order" ||
          artifact.certificate.criterion ===
            "tits-maximal-spherical-regular-orbits"
        ? artifact.certificate.completeSphericalRestrictionChecks === true
        : false;
  if (
    !completeExternalCriterion ||
    artifact.sphericalCatalogue?.complete !== true
  ) {
    throw new Error(
      "External discovery did not certify a complete torsion criterion.",
    );
  }
  const artifactSystem = parseCoxeterSystemInput(artifact.sourceSystem);
  const expected = parseCoxeterSystemInput(expectedSystem);
  if (!sameCoxeterPresentation(artifactSystem, expected)) {
    throw new Error(
      "Discovery artifact belongs to a different Coxeter presentation.",
    );
  }
  const candidate = candidateFromArtifact(artifact);
  const result = discoverTorsionFreeCover({
    schemaVersion: 1,
    system: expected,
    candidates: [candidate],
    candidateEnumeration: {
      complete: artifact.search?.iteratorComplete === true,
      method: artifact.search?.method ?? "external GAP low-index search",
      searchedThroughIndex: artifact.search?.maxIndex,
      notes: [
        "Candidate generation and the independent in-repo Tits certificate are separate steps.",
      ],
    },
    limits: {
      maxRankForExhaustiveEnumeration: 16,
      maxSubsetsToCheck: artifact.bounds?.maxSubsets ?? 65_536,
      maxSphericalSubgroupElements:
        artifact.bounds?.maxSphericalOrder ?? 100_000,
      maxWitnesses: artifact.bounds?.maxWitnesses ?? 4096,
    },
  });
  if (result.status !== "found" || !result.quotient) {
    const reason = result.candidates[0]?.certificate.errors.join(" ");
    throw new Error(
      `Independent torsion-free action certificate did not pass.${reason ? ` ${reason}` : ""}`,
    );
  }

  const selectedStrategy = artifact.search?.selectedStrategy;
  const verificationMethod =
    selectedStrategy === "sage-congruence-kernel" ||
    selectedStrategy === "sage-finite-image-coset"
      ? "external-sage"
      : "external-gap-kbmag";
  const externalSource = [
    artifact.provenance?.backend ?? selectedStrategy ?? "automatic backend",
    selectedStrategy === "sage-congruence-kernel" ||
    selectedStrategy === "sage-finite-image-coset"
      ? artifact.provenance?.runtime
      : artifact.provenance?.gapVersion,
    artifact.provenance?.artifactHash,
  ]
    .filter(Boolean)
    .join(" / ");
  result.quotient.torsionFreeCertificate = {
    ...result.quotient.torsionFreeCertificate!,
    method: verificationMethod,
    limitations: [
      "The external finite-action checks and the in-repo exhaustive spherical-action check both passed.",
      "The search does not claim that this subgroup has minimum possible index.",
    ],
  };
  if (result.quotient.subgroup) {
    if (artifact.finiteAction?.subgroupGenerators !== undefined) {
      result.quotient.subgroup.generators =
        artifact.finiteAction.subgroupGenerators;
    } else {
      delete result.quotient.subgroup.generators;
    }
    result.quotient.subgroup.torsionFreeVerification = {
      verified: true,
      method: verificationMethod,
      source: externalSource,
      notes: [
        "Tits' torsion theorem reduces the check to freeness of the restricted maximal spherical subgroup actions.",
      ],
    };
  }
  return { artifact, result };
}
