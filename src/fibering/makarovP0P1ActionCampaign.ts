import { parseCoxeterSystemInput } from "../coxeter/validation";
import p0Input from "../examples/compact_5_prism_makarov.json";
import p1Input from "../examples/compact_5_polytope_p1_double_makarov.json";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCertificate,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  actionFromCompactDiscoveryArtifact,
  compactDiscoveryPortableSha256,
  restrictP0ActionToP1,
} from "./compactActionPortfolio";
import { getCompactResearchTarget } from "./compactResearchTargets";
import {
  promoteMaterializedActionToFullDavisFibering,
  type MaterializedActionPipelineOptions,
  type MaterializedActionPromotionArtifact,
} from "./materializedActionPipeline";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const MAKAROV_P0_P1_DEFAULT_TIER = 28_800;
export const MAKAROV_P0_P1_DEFAULT_PRIME_CAP = 11;
export const MAKAROV_P0_P1_DEFAULT_TIMEOUT_SECONDS = 1_800;
export const MAKAROV_P0_P1_MAX_TIMEOUT_SECONDS = 1_800;
export const MAKAROV_P0_P1_LIVE_DISCOVERY_PRIME_CAP = 2;

export const MAKAROV_P0_P1_SOURCE_PATHS = {
  p0: "public/examples/compact_5_prism_makarov.json",
  p1: "public/examples/compact_5_polytope_p1_double_makarov.json",
} as const;

export const MAKAROV_P0_P1_SOURCE_BYTES_SHA256 = {
  p0: "6cb5c7bd535e654e83dc87d383fd9aba5db61fa491edaeff634f792aea5bc221",
  p1: "2f5acbaef9bfa5423a38e6052eb1bd25929b41b9c8430c179e49e0993bdcaf31",
} as const;

export const MAKAROV_P0_P1_SOURCE_CANONICAL_SHA256 = {
  p0: "c1e89cfd943dbb7eda7c55a761ca80f612e95bdc44d118b9429f38bcf77914d0",
  p1: "d88862776eb9945135d42f16b2fe7ed35f813d5f6bd388a0ae6c03398148daec",
} as const;

export interface MakarovP0P1PreScreenEvidenceBinding {
  id: "small-prime-3-7-11" | "prime-5";
  path: string;
  bytesSha256: string;
  artifactType: string;
  certificateSha256: string;
  rationalPrimes: number[];
  activeDegreeTiers: number[];
  systems: ["makarov-p0", "makarov-p1"];
  scope: string;
}

export const MAKAROV_P0_P1_PRE_SCREEN_EVIDENCE: readonly MakarovP0P1PreScreenEvidenceBinding[] =
  [
    {
      id: "small-prime-3-7-11",
      path: "scripts/certificates/portfolio/makarov_p0_p1_small_prime_structural_screen.json",
      bytesSha256:
        "7bbbdb4879d81722a3faff3ce799f9a3a73907e809c802d2cff3f5b4d10f69c5",
      artifactType: "makarov-p0-p1-small-prime-structural-screen-portfolio",
      certificateSha256:
        "3a3c7915b4811c9c650f92bb404cac4a2ea079867cf682ab87c606028f43b2b7",
      rationalPrimes: [3, 7, 11],
      activeDegreeTiers: [28_800, 57_600, 86_400, 115_200],
      systems: ["makarov-p0", "makarov-p1"],
      scope:
        "only the reductions and finite images pinned by the three child structural certificates",
    },
    {
      id: "prime-5",
      path: "scripts/certificates/torsion-free/makarov_p0_p1_prime5_structural_obstruction.json",
      bytesSha256:
        "ceab7d14c466d2f6f059e93338be5a09887ebb6e851210293b0857c6b1ed6bcc",
      artifactType: "makarov-p0-p1-prime5-structural-obstruction-certificate",
      certificateSha256:
        "16a076f222a5ad0d5eecaccefa0de8c1c7d062427351b4a9fac76f6ff00fc606",
      rationalPrimes: [5],
      activeDegreeTiers: [28_800, 57_600, 86_400, 115_200],
      systems: ["makarov-p0", "makarov-p1"],
      scope:
        "only the reviewed characteristic-5 finite image and its P1 restriction",
    },
  ];

export interface MakarovP0DiscoveryBounds {
  maxIndex: number;
  maxCandidates: 128;
  maxModuleCandidates: 512;
  maxCompositeModules: 6;
  maxCompositeCombinations: 100_000;
  maxCongruencePrime: number;
  maxCongruenceImageOrder: 5_000_000;
  maxLowIndexFallback: 512;
  maxMemoryBytes: number;
  lightWorkers: 4;
  heavyWorkers: 1;
  maxWitnesses: 8_192;
  maxSphericalOrder: 100_000;
  maxSubsets: 65_536;
  timeoutSeconds: number;
}

export interface MakarovP0P1CampaignConfiguration {
  selectedP0DegreeTier: number;
  maxCongruencePrime: number;
  liveDiscoveryPrimeCap: 2;
  preScreenedRationalPrimes: number[];
  preScreenEvidence: MakarovP0P1PreScreenEvidenceBinding[];
  timeoutSeconds: number;
  bounds: MakarovP0DiscoveryBounds;
  allowedP0DegreeTiers: number[];
  allowedP1DegreeTiers: number[];
  discoveryCommand: string[];
  discoveryCommandDigest: string;
  checkpointPolicy: {
    resumable: true;
    scope: "source-bounds-and-backend-bound-producer-checkpoints";
  };
}

export interface MakarovP0P1SourceBinding {
  targetId: "makarov-p0" | "makarov-p1";
  sourcePath: string;
  sourceBytesSha256: string;
  canonicalSystemSha256: string;
  sourceCertificateSha256: string;
  system: CoxeterSystemInput;
  checks: {
    bundledSourceCertified: true;
    compactHyperbolicDimensionFive: true;
    registryCanonicalHashAgrees: true;
  };
}

export interface MakarovP0P1DiscoveryCandidateReport {
  attemptIndex: number;
  strategy: string;
  phase: string | null;
  status: string;
  candidateDegree: number | null;
  reportDigest: string;
}

export interface MakarovP0P1DiscoveryExecution {
  mode: "accepted-existing-artifact" | "executed-bounded-discovery";
  discoveryArtifactPath: string;
  checkpointDirectory: string;
  processExitCode: number | null;
  campaignWallClockTimeoutTriggered: boolean;
  hardTerminationRequested: boolean;
  terminationDeadlineExceeded: boolean;
}

export interface MakarovP0P1RunnerFailureArtifact {
  schemaVersion: 1;
  artifactType: "makarov-p0-bounded-discovery-runner-failure";
  status: "failed" | "timeout";
  sourceCanonicalSha256: string;
  sourceBytesSha256: string;
  bounds: MakarovP0DiscoveryBounds;
  discoveryCommandDigest: string;
  reason: string;
}

export interface MakarovP0P1AcceptedActionPayload {
  targetId: "makarov-p0" | "makarov-p1";
  actionId: string;
  system: CoxeterSystemInput;
  accepted: TorsionFreeCandidateResult;
  candidateDigest: string;
  actionRowsCanonicalSha256: string;
  torsionFreeCertificateDigest: string;
  derivation:
    | {
        method: "materialized-p0-discovery";
        rawDiscoveryDigest: string;
      }
    | {
        method: "exact-index-two-p0-to-p1-restriction";
        parentActionId: string;
        parentCandidateDigest: string;
        orbitIndex: number;
        orbitCount: number;
        generatorWordsInP0: number[][];
      }
    | {
        method: "independent-direct-finite-target-ingest";
        ingestPayloadDigest: string;
        finiteTargetId: string;
        finiteTargetOrder: number;
        p0ToP1RestrictionApplied: false;
      };
}

export interface ParsedMakarovIndependentActionIngest {
  targetId: "makarov-p0" | "makarov-p1";
  system: CoxeterSystemInput;
  candidate: TorsionFreeActionCandidate;
  payloadDigest: string;
  finiteTargetId: string;
  finiteTargetOrder: number;
}

export type MakarovP0P1CampaignOutcome =
  | "p0-and-restricted-p1-actions-certified"
  | "bounded-search-no-action-materialized"
  | "bounded-search-incomplete"
  | "bounded-search-failed";

export interface MakarovP0P1ActionCampaignArtifact {
  schemaVersion: 1;
  kind: "makarov-p0-p1-action-acquisition-certificate";
  status: "passed" | "not-found" | "incomplete" | "failed";
  outcome: MakarovP0P1CampaignOutcome;
  sources: {
    p0: MakarovP0P1SourceBinding;
    p1: MakarovP0P1SourceBinding;
    pairBindingDigest: string;
  };
  configuration: MakarovP0P1CampaignConfiguration;
  execution: MakarovP0P1DiscoveryExecution;
  discovery: {
    rawStatus: string;
    rawArtifact: unknown;
    rawArtifactDigest: string;
    producerPortableArtifactHash: string | null;
    producerCertificateDigest: string | null;
    candidateReports: MakarovP0P1DiscoveryCandidateReport[];
    selectedCandidateDegree: number | null;
  };
  acceptedActionPayloads: MakarovP0P1AcceptedActionPayload[];
  checks: {
    selectedP0TierAllowed: true;
    preScreenEvidencePinned: true;
    liveDiscoveryPrimeCapApplied: true;
    discoverySourceBound: true;
    discoveryBoundsExact: true;
    rawArtifactIntegrityVerified: true;
    materializedP0DegreeAllowed: true | null;
    p0TorsionFreeReplayPassed: true | null;
    everyRestrictedP1DegreeAllowed: true | null;
    everyRestrictedP1OrbitTorsionFreeReplayPassed: true | null;
  };
  claims: string[];
  nonClaims: string[];
  artifactDigest: string;
}

export interface MakarovP0P1ActionCampaignReplay {
  schemaVersion: 1;
  kind: "makarov-p0-p1-action-acquisition-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    storedArtifactDigestValid: boolean;
    exactRootedRebuildMatches: boolean;
  };
  rebuiltArtifactDigest?: string;
  errors: string[];
  replayDigest: string;
}

export interface BuildMakarovP0P1ActionCampaignOptions {
  rawDiscovery: unknown;
  selectedP0DegreeTier?: number;
  maxCongruencePrime?: number;
  timeoutSeconds?: number;
  execution?: MakarovP0P1DiscoveryExecution;
}

const p0System = parseCoxeterSystemInput(p0Input);
const p1System = parseCoxeterSystemInput(p1Input);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function requireCertifiedSource(
  targetId: "makarov-p0" | "makarov-p1",
  system: CoxeterSystemInput,
  sourcePath: string,
  sourceBytesSha256: string,
  expectedCanonicalSha256: string,
): MakarovP0P1SourceBinding {
  const target = getCompactResearchTarget(targetId);
  const canonicalSystemSha256 = canonicalSha256(system);
  if (
    target.sourceStatus !== "bundled-certified" ||
    target.executionPolicy.queueStatus !== "active" ||
    canonicalSystemSha256 !== expectedCanonicalSha256 ||
    target.canonicalSystemSha256 !== canonicalSystemSha256 ||
    target.facts?.sourcePath !== sourcePath ||
    system.dataStatus !== "certified" ||
    system.certificate?.status !== "passed" ||
    system.geometry?.dimension !== 5
  ) {
    throw new Error(`${targetId} is not the active certified bundled source.`);
  }
  return {
    targetId,
    sourcePath,
    sourceBytesSha256,
    canonicalSystemSha256,
    sourceCertificateSha256: canonicalSha256(system.certificate),
    system,
    checks: {
      bundledSourceCertified: true,
      compactHyperbolicDimensionFive: true,
      registryCanonicalHashAgrees: true,
    },
  };
}

export function makarovP0P1SourceBindings(): {
  p0: MakarovP0P1SourceBinding;
  p1: MakarovP0P1SourceBinding;
  pairBindingDigest: string;
} {
  const p0 = requireCertifiedSource(
    "makarov-p0",
    p0System,
    MAKAROV_P0_P1_SOURCE_PATHS.p0,
    MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p0,
    MAKAROV_P0_P1_SOURCE_CANONICAL_SHA256.p0,
  );
  const p1 = requireCertifiedSource(
    "makarov-p1",
    p1System,
    MAKAROV_P0_P1_SOURCE_PATHS.p1,
    MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p1,
    MAKAROV_P0_P1_SOURCE_CANONICAL_SHA256.p1,
  );
  return { p0, p1, pairBindingDigest: canonicalSha256({ p0, p1 }) };
}

export function makarovP0P1CampaignConfiguration(options?: {
  selectedP0DegreeTier?: number;
  maxCongruencePrime?: number;
  timeoutSeconds?: number;
}): MakarovP0P1CampaignConfiguration {
  const selectedP0DegreeTier =
    options?.selectedP0DegreeTier ?? MAKAROV_P0_P1_DEFAULT_TIER;
  const maxCongruencePrime =
    options?.maxCongruencePrime ?? MAKAROV_P0_P1_DEFAULT_PRIME_CAP;
  const timeoutSeconds =
    options?.timeoutSeconds ?? MAKAROV_P0_P1_DEFAULT_TIMEOUT_SECONDS;
  requirePositiveInteger(selectedP0DegreeTier, "selectedP0DegreeTier");
  requirePositiveInteger(maxCongruencePrime, "maxCongruencePrime");
  requirePositiveInteger(timeoutSeconds, "timeoutSeconds");
  if (maxCongruencePrime < 2 || maxCongruencePrime > 11) {
    throw new Error("maxCongruencePrime must lie in the reviewed range 2..11.");
  }
  if (timeoutSeconds > MAKAROV_P0_P1_MAX_TIMEOUT_SECONDS) {
    throw new Error(
      `timeoutSeconds exceeds the bounded campaign cap ${MAKAROV_P0_P1_MAX_TIMEOUT_SECONDS}.`,
    );
  }
  const p0Target = getCompactResearchTarget("makarov-p0");
  const p1Target = getCompactResearchTarget("makarov-p1");
  const allowedP0DegreeTiers = [...p0Target.executionPolicy.allowedDegreeTiers];
  const allowedP1DegreeTiers = [...p1Target.executionPolicy.allowedDegreeTiers];
  if (!allowedP0DegreeTiers.includes(selectedP0DegreeTier)) {
    throw new Error(
      `P0 degree ${selectedP0DegreeTier} is not an active capacity-approved tier.`,
    );
  }
  const bounds: MakarovP0DiscoveryBounds = {
    maxIndex: selectedP0DegreeTier,
    maxCandidates: 128,
    maxModuleCandidates: 512,
    maxCompositeModules: 6,
    maxCompositeCombinations: 100_000,
    // Characteristics 3, 5, 7, and 11 already have pinned image-scoped
    // structural screens below. Re-running those gauges cannot produce an
    // active-tier action through the same finite images.
    maxCongruencePrime: MAKAROV_P0_P1_LIVE_DISCOVERY_PRIME_CAP,
    maxCongruenceImageOrder: 5_000_000,
    maxLowIndexFallback: 512,
    maxMemoryBytes: 12 * 1024 * 1024 * 1024,
    lightWorkers: 4,
    heavyWorkers: 1,
    maxWitnesses: 8_192,
    maxSphericalOrder: 100_000,
    maxSubsets: 65_536,
    timeoutSeconds,
  };
  const discoveryCommand = [
    "python",
    "scripts/torsion_free_discovery.py",
    "--input",
    MAKAROV_P0_P1_SOURCE_PATHS.p0,
    "--backend",
    "auto",
    "--max-index",
    String(bounds.maxIndex),
    "--max-candidates",
    String(bounds.maxCandidates),
    "--max-module-candidates",
    String(bounds.maxModuleCandidates),
    "--max-composite-modules",
    String(bounds.maxCompositeModules),
    "--max-composite-combinations",
    String(bounds.maxCompositeCombinations),
    "--max-congruence-prime",
    String(bounds.maxCongruencePrime),
    "--max-congruence-image-order",
    String(bounds.maxCongruenceImageOrder),
    "--max-low-index-fallback",
    String(bounds.maxLowIndexFallback),
    "--max-memory-bytes",
    String(bounds.maxMemoryBytes),
    "--light-workers",
    String(bounds.lightWorkers),
    "--heavy-workers",
    String(bounds.heavyWorkers),
    "--max-witnesses",
    String(bounds.maxWitnesses),
    "--max-spherical-order",
    String(bounds.maxSphericalOrder),
    "--max-subsets",
    String(bounds.maxSubsets),
    "--timeout",
    String(bounds.timeoutSeconds),
  ];
  return {
    selectedP0DegreeTier,
    maxCongruencePrime,
    liveDiscoveryPrimeCap: MAKAROV_P0_P1_LIVE_DISCOVERY_PRIME_CAP,
    preScreenedRationalPrimes: [3, 5, 7, 11].filter(
      (prime) => prime <= maxCongruencePrime,
    ),
    preScreenEvidence: MAKAROV_P0_P1_PRE_SCREEN_EVIDENCE.map((binding) =>
      structuredClone(binding),
    ),
    timeoutSeconds,
    bounds,
    allowedP0DegreeTiers,
    allowedP1DegreeTiers,
    discoveryCommand,
    discoveryCommandDigest: canonicalSha256(discoveryCommand),
    checkpointPolicy: {
      resumable: true,
      scope: "source-bounds-and-backend-bound-producer-checkpoints",
    },
  };
}

export function makeMakarovP0DiscoveryRunnerFailure(
  configuration: MakarovP0P1CampaignConfiguration,
  reason: string,
  status: "failed" | "timeout" = "failed",
): MakarovP0P1RunnerFailureArtifact {
  if (reason.trim().length === 0) {
    throw new Error("A runner-failure reason is required.");
  }
  return {
    schemaVersion: 1,
    artifactType: "makarov-p0-bounded-discovery-runner-failure",
    status,
    sourceCanonicalSha256: canonicalSha256(p0System),
    sourceBytesSha256: MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p0,
    bounds: configuration.bounds,
    discoveryCommandDigest: configuration.discoveryCommandDigest,
    reason,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

function validateProducerArtifact(
  raw: Record<string, unknown>,
  configuration: MakarovP0P1CampaignConfiguration,
  source: MakarovP0P1SourceBinding,
): { portableHash: string; producerCertificateDigest: string | null } {
  if (
    raw.schemaVersion !== 1 ||
    raw.artifactType !== "coxeter-torsion-free-discovery" ||
    typeof raw.status !== "string"
  ) {
    throw new Error("The P0 discovery artifact envelope is unsupported.");
  }
  if (raw.inputHash !== source.sourceBytesSha256) {
    throw new Error("The P0 discovery input bytes are not the bundled source.");
  }
  const sourceSystem = parseCoxeterSystemInput(raw.sourceSystem);
  if (canonicalSha256(sourceSystem) !== source.canonicalSystemSha256) {
    throw new Error("The P0 discovery artifact names a different system.");
  }
  if (!sameJson(raw.bounds, configuration.bounds)) {
    throw new Error("The P0 discovery artifact changed a campaign bound.");
  }
  if (!isRecord(raw.provenance)) {
    throw new Error("The P0 discovery artifact has no provenance object.");
  }
  const provenance = raw.provenance;
  if (
    provenance.inputHash !== source.sourceBytesSha256 ||
    typeof provenance.backendVersion !== "string" ||
    provenance.backendVersion.length === 0 ||
    typeof provenance.backend !== "string" ||
    typeof provenance.runtime !== "string" ||
    ![
      "automatic-torsion-free-cover",
      "gap-low-index-torsion-free",
      "sage-congruence-torsion-free",
      "sage-finite-image-coset",
      "everitt-composite-permutation-action",
    ].includes(provenance.backend) ||
    typeof provenance.artifactHash !== "string" ||
    !SHA256_PATTERN.test(provenance.artifactHash) ||
    typeof provenance.portableArtifactHash !== "string" ||
    !SHA256_PATTERN.test(provenance.portableArtifactHash)
  ) {
    throw new Error("The P0 discovery producer provenance is unsupported.");
  }
  const producerPayload = structuredClone(raw);
  if (!isRecord(producerPayload.provenance)) {
    throw new Error("The P0 discovery provenance copy is malformed.");
  }
  delete producerPayload.provenance.portableArtifactHash;
  if (
    compactDiscoveryPortableSha256(producerPayload) !==
    provenance.portableArtifactHash
  ) {
    throw new Error("The P0 discovery portable producer seal is invalid.");
  }
  const producerCertificateDigest = isRecord(raw.certificate)
    ? canonicalSha256(raw.certificate)
    : null;
  return {
    portableHash: provenance.portableArtifactHash,
    producerCertificateDigest,
  };
}

function validateRunnerFailure(
  raw: Record<string, unknown>,
  configuration: MakarovP0P1CampaignConfiguration,
  source: MakarovP0P1SourceBinding,
): void {
  if (
    raw.schemaVersion !== 1 ||
    raw.artifactType !== "makarov-p0-bounded-discovery-runner-failure" ||
    (raw.status !== "failed" && raw.status !== "timeout") ||
    raw.sourceCanonicalSha256 !== source.canonicalSystemSha256 ||
    raw.sourceBytesSha256 !== source.sourceBytesSha256 ||
    raw.discoveryCommandDigest !== configuration.discoveryCommandDigest ||
    !sameJson(raw.bounds, configuration.bounds) ||
    typeof raw.reason !== "string" ||
    raw.reason.trim().length === 0
  ) {
    throw new Error("The local bounded-discovery failure receipt is invalid.");
  }
}

function discoveryCandidateReports(
  raw: Record<string, unknown>,
): MakarovP0P1DiscoveryCandidateReport[] {
  if (!Array.isArray(raw.strategyAttempts)) return [];
  return raw.strategyAttempts.map((entry, attemptIndex) => {
    if (!isRecord(entry)) {
      throw new Error(`strategyAttempts[${attemptIndex}] is not an object.`);
    }
    const candidateDegree =
      entry.candidateDegree === null || entry.candidateDegree === undefined
        ? null
        : entry.candidateDegree;
    if (
      typeof entry.strategy !== "string" ||
      typeof entry.status !== "string" ||
      (entry.phase !== undefined &&
        entry.phase !== null &&
        typeof entry.phase !== "string") ||
      (candidateDegree !== null &&
        (typeof candidateDegree !== "number" ||
          !Number.isSafeInteger(candidateDegree) ||
          candidateDegree < 1))
    ) {
      throw new Error(`strategyAttempts[${attemptIndex}] is malformed.`);
    }
    const withoutDigest = {
      attemptIndex,
      strategy: entry.strategy,
      phase: (entry.phase as string | null | undefined) ?? null,
      status: entry.status,
      candidateDegree: candidateDegree as number | null,
    };
    return { ...withoutDigest, reportDigest: canonicalSha256(withoutDigest) };
  });
}

function replayTorsionFreeAction(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): TorsionFreeActionCertificate {
  const plan = planSphericalSpecialSubgroups(system, {
    maxRankForExhaustiveEnumeration: system.rank,
    maxSubsetsToCheck: 2 ** system.rank,
  });
  if (plan.status !== "complete") {
    throw new Error("The bundled source has no complete spherical plan.");
  }
  return certifyTorsionFreeAction(system, candidate, plan, {
    maxSphericalSubgroupElements: 100_000,
    maxWitnesses: 8_192,
  });
}

function acceptedPayload(
  targetId: "makarov-p0" | "makarov-p1",
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
  certificate: TorsionFreeActionCertificate,
  derivation: MakarovP0P1AcceptedActionPayload["derivation"],
): MakarovP0P1AcceptedActionPayload {
  if (certificate.status !== "passed") {
    throw new Error(
      `${targetId} failed independent exact torsion-free replay.`,
    );
  }
  return {
    targetId,
    actionId: candidate.id,
    system,
    accepted: { candidate, certificate },
    candidateDigest: canonicalSha256(candidate),
    actionRowsCanonicalSha256: canonicalSha256(candidate.generatorImages),
    torsionFreeCertificateDigest: canonicalSha256(certificate),
    derivation,
  };
}

function artifactPayload(
  artifact: MakarovP0P1ActionCampaignArtifact,
): Omit<MakarovP0P1ActionCampaignArtifact, "artifactDigest"> {
  const { artifactDigest: _digest, ...payload } = artifact;
  void _digest;
  return payload;
}

export function computeMakarovP0P1ActionCampaignDigest(
  artifact: MakarovP0P1ActionCampaignArtifact,
): string {
  return canonicalSha256(artifactPayload(artifact));
}

function statusAndOutcome(rawStatus: string): {
  status: MakarovP0P1ActionCampaignArtifact["status"];
  outcome: MakarovP0P1CampaignOutcome;
} {
  if (rawStatus === "passed") {
    return {
      status: "passed",
      outcome: "p0-and-restricted-p1-actions-certified",
    };
  }
  if (rawStatus === "exhausted") {
    return {
      status: "incomplete",
      outcome: "bounded-search-incomplete",
    };
  }
  if (["timeout", "timed-out", "cancelled", "skipped"].includes(rawStatus)) {
    return { status: "incomplete", outcome: "bounded-search-incomplete" };
  }
  if (rawStatus === "failed") {
    return { status: "failed", outcome: "bounded-search-failed" };
  }
  throw new Error(`Unsupported P0 discovery status ${rawStatus}.`);
}

function nonClaimsFor(
  status: MakarovP0P1ActionCampaignArtifact["status"],
  configuration: MakarovP0P1CampaignConfiguration,
  execution: MakarovP0P1DiscoveryExecution,
): string[] {
  const common = [
    "The pinned characteristic-3, -5, -7, and -11 screens rule out active tiers only inside their named finite images; this campaign does not combine them into a product, subdirect-product, direct-action, or noncongruence obstruction.",
    "Congruence-kernel evidence in the raw receipt is not accepted as a permutation action; the standalone kernel certificate must be replayed separately, and H^1 or Track B still requires exact action rows.",
    `No subgroup search is claimed inside a congruence image above the configured order cap ${configuration.bounds.maxCongruenceImageOrder}; in particular, the certified P0 p=5 image of order 457002000000000 was not searched by the default campaign.`,
    "No full integral H^1 lattice or wall-saturation certificate is produced.",
    "No direct wall-cocycle, generalized-compression, Track B, algebraic-fibering, or smooth-fibering claim is produced.",
    "Accepted action payloads are inputs for the independent direct-cocycle and scalable-H^1 preparers; they are not proof-job manifests.",
  ];
  if (status === "passed") return common;
  const timeoutScope =
    execution.mode === "executed-bounded-discovery"
      ? `after the configured ${configuration.timeoutSeconds}-second campaign wall-clock bound`
      : `with a larger timeout than the embedded producer bound of ${configuration.timeoutSeconds} seconds`;
  return [
    `This run does not prove that P0 has no torsion-free subgroup of index at most ${configuration.selectedP0DegreeTier}.`,
    `This run does not prove that no action exists outside the attempted strategy ladder, beyond congruence-prime cap ${configuration.maxCongruencePrime}, or ${timeoutScope}.`,
    "An outer exhausted label is not treated as a complete negative result without target-scoped nested proofs that every relevant iterator and finite-image ledger completed; capped and prefix searches remain incomplete.",
    "Failure to materialize a P0 action gives no negative conclusion about P1 or virtual fibering.",
    ...common,
  ];
}

export function buildMakarovP0P1ActionCampaign(
  options: BuildMakarovP0P1ActionCampaignOptions,
): MakarovP0P1ActionCampaignArtifact {
  const configuration = makarovP0P1CampaignConfiguration(options);
  const sources = makarovP0P1SourceBindings();
  if (!isRecord(options.rawDiscovery)) {
    throw new Error("The raw P0 discovery receipt must be an object.");
  }
  const raw = structuredClone(options.rawDiscovery);
  const runnerFailure =
    raw.artifactType === "makarov-p0-bounded-discovery-runner-failure";
  let producerPortableArtifactHash: string | null = null;
  let producerCertificateDigest: string | null = null;
  if (runnerFailure) {
    validateRunnerFailure(raw, configuration, sources.p0);
  } else {
    const producer = validateProducerArtifact(raw, configuration, sources.p0);
    producerPortableArtifactHash = producer.portableHash;
    producerCertificateDigest = producer.producerCertificateDigest;
  }
  const rawStatus = String(raw.status);
  const { status, outcome } = statusAndOutcome(rawStatus);
  const rawArtifactDigest = canonicalSha256(raw);
  const candidateReports = discoveryCandidateReports(raw);
  const acceptedActionPayloads: MakarovP0P1AcceptedActionPayload[] = [];
  let selectedCandidateDegree: number | null = null;
  let materializedP0DegreeAllowed: true | null = null;
  let p0TorsionFreeReplayPassed: true | null = null;
  let everyRestrictedP1DegreeAllowed: true | null = null;
  let everyRestrictedP1OrbitTorsionFreeReplayPassed: true | null = null;

  if (status === "passed") {
    if (runnerFailure || !isRecord(raw.certificate)) {
      throw new Error("A passing discovery lacks its producer certificate.");
    }
    if (raw.certificate.status !== "passed") {
      throw new Error(
        "A passing discovery has a non-passed producer certificate.",
      );
    }
    const candidate = actionFromCompactDiscoveryArtifact(
      raw,
      `makarov-p0-degree-${String(
        isRecord(raw.finiteAction) ? raw.finiteAction.degree : "unknown",
      )}`,
    );
    selectedCandidateDegree = candidate.index;
    const p0DegreeAllowed =
      configuration.allowedP0DegreeTiers.includes(candidate.index) &&
      candidate.index <= configuration.selectedP0DegreeTier;
    if (!p0DegreeAllowed) {
      throw new Error(
        `The materialized P0 action degree ${candidate.index} is not an allowed tier within this run.`,
      );
    }
    materializedP0DegreeAllowed = true;
    const p0Certificate = replayTorsionFreeAction(sources.p0.system, candidate);
    if (p0Certificate.status !== "passed") {
      throw new Error(
        `The producer's P0 action failed independent torsion-free replay: ${p0Certificate.errors.join(" ")}`,
      );
    }
    p0TorsionFreeReplayPassed = true;
    const p0Payload = acceptedPayload(
      "makarov-p0",
      sources.p0.system,
      candidate,
      p0Certificate,
      {
        method: "materialized-p0-discovery",
        rawDiscoveryDigest: rawArtifactDigest,
      },
    );
    acceptedActionPayloads.push(p0Payload);

    const restricted = restrictP0ActionToP1(candidate);
    const restrictedPayloads = restricted.map((p1Candidate, orbitIndex) => {
      if (!configuration.allowedP1DegreeTiers.includes(p1Candidate.index)) {
        throw new Error(
          `Restricted P1 orbit ${orbitIndex} has off-tier degree ${p1Candidate.index}.`,
        );
      }
      const certificate = replayTorsionFreeAction(
        sources.p1.system,
        p1Candidate,
      );
      if (certificate.status !== "passed") {
        throw new Error(
          `Restricted P1 orbit ${orbitIndex} failed exact torsion-free replay: ${certificate.errors.join(" ")}`,
        );
      }
      return acceptedPayload(
        "makarov-p1",
        sources.p1.system,
        p1Candidate,
        certificate,
        {
          method: "exact-index-two-p0-to-p1-restriction",
          parentActionId: candidate.id,
          parentCandidateDigest: p0Payload.candidateDigest,
          orbitIndex,
          orbitCount: restricted.length,
          generatorWordsInP0: [[0], [1], [2], [3], [4], [5], [6, 5, 6]],
        },
      );
    });
    acceptedActionPayloads.push(...restrictedPayloads);
    everyRestrictedP1DegreeAllowed = true;
    everyRestrictedP1OrbitTorsionFreeReplayPassed = true;
  }

  const execution: MakarovP0P1DiscoveryExecution = options.execution ?? {
    mode: "accepted-existing-artifact",
    discoveryArtifactPath: "<embedded>",
    checkpointDirectory: "<not-executed>",
    processExitCode: null,
    campaignWallClockTimeoutTriggered: false,
    hardTerminationRequested: false,
    terminationDeadlineExceeded: false,
  };
  if (
    !["accepted-existing-artifact", "executed-bounded-discovery"].includes(
      execution.mode,
    ) ||
    typeof execution.discoveryArtifactPath !== "string" ||
    execution.discoveryArtifactPath.trim().length === 0 ||
    typeof execution.checkpointDirectory !== "string" ||
    execution.checkpointDirectory.trim().length === 0 ||
    typeof execution.campaignWallClockTimeoutTriggered !== "boolean" ||
    typeof execution.hardTerminationRequested !== "boolean" ||
    typeof execution.terminationDeadlineExceeded !== "boolean" ||
    (execution.processExitCode !== null &&
      (!Number.isSafeInteger(execution.processExitCode) ||
        execution.processExitCode < 0)) ||
    (execution.mode === "accepted-existing-artifact" &&
      (execution.processExitCode !== null ||
        execution.campaignWallClockTimeoutTriggered ||
        execution.hardTerminationRequested ||
        execution.terminationDeadlineExceeded)) ||
    (execution.hardTerminationRequested &&
      !execution.campaignWallClockTimeoutTriggered) ||
    (execution.terminationDeadlineExceeded &&
      !execution.hardTerminationRequested)
  ) {
    throw new Error("The discovery execution record is malformed.");
  }
  const claims: string[] =
    status === "passed"
      ? [
          `A transitive torsion-free P0 action of degree ${selectedCandidateDegree} passed independent exact replay.`,
          "Every P1 orbit obtained by the exact index-two restriction passed independent exact torsion-free replay.",
          `Pinned image-scoped screens for rational primes ${configuration.preScreenedRationalPrimes.join(", ")} were bound to the run and omitted from live discovery.`,
        ]
      : runnerFailure
        ? [
            `The local ${rawStatus} runner receipt is bound to the configured finite P0 search; no producer artifact was emitted.`,
            `Pinned image-scoped screens for rational primes ${configuration.preScreenedRationalPrimes.join(", ")} were bound to the run and omitted from live discovery.`,
          ]
        : [
            `The embedded ${rawStatus} receipt is bound to the configured finite P0 search run.`,
            `Pinned image-scoped screens for rational primes ${configuration.preScreenedRationalPrimes.join(", ")} were bound to the run and omitted from live discovery.`,
          ];
  const withoutDigest: Omit<
    MakarovP0P1ActionCampaignArtifact,
    "artifactDigest"
  > = {
    schemaVersion: 1,
    kind: "makarov-p0-p1-action-acquisition-certificate",
    status,
    outcome,
    sources,
    configuration,
    execution,
    discovery: {
      rawStatus,
      rawArtifact: raw,
      rawArtifactDigest,
      producerPortableArtifactHash,
      producerCertificateDigest,
      candidateReports,
      selectedCandidateDegree,
    },
    acceptedActionPayloads,
    checks: {
      selectedP0TierAllowed: true,
      preScreenEvidencePinned: true,
      liveDiscoveryPrimeCapApplied: true,
      discoverySourceBound: true,
      discoveryBoundsExact: true,
      rawArtifactIntegrityVerified: true,
      materializedP0DegreeAllowed,
      p0TorsionFreeReplayPassed,
      everyRestrictedP1DegreeAllowed,
      everyRestrictedP1OrbitTorsionFreeReplayPassed,
    },
    claims,
    nonClaims: nonClaimsFor(status, configuration, execution),
  };
  const artifact = { ...withoutDigest, artifactDigest: "" };
  artifact.artifactDigest = computeMakarovP0P1ActionCampaignDigest(artifact);
  return artifact;
}

export function replayMakarovP0P1ActionCampaign(
  storedInput: unknown,
): MakarovP0P1ActionCampaignReplay {
  const errors: string[] = [];
  const checks: MakarovP0P1ActionCampaignReplay["checks"] = {
    envelopeRecognized: false,
    storedArtifactDigestValid: false,
    exactRootedRebuildMatches: false,
  };
  let rebuiltArtifactDigest: string | undefined;
  try {
    if (!isRecord(storedInput))
      throw new Error("Stored campaign is not an object.");
    if (
      storedInput.schemaVersion !== 1 ||
      storedInput.kind !== "makarov-p0-p1-action-acquisition-certificate"
    ) {
      throw new Error("Stored campaign envelope is unsupported.");
    }
    checks.envelopeRecognized = true;
    const stored = storedInput as unknown as MakarovP0P1ActionCampaignArtifact;
    if (
      typeof stored.artifactDigest !== "string" ||
      !SHA256_PATTERN.test(stored.artifactDigest) ||
      computeMakarovP0P1ActionCampaignDigest(stored) !== stored.artifactDigest
    ) {
      throw new Error("Stored campaign digest is invalid.");
    }
    checks.storedArtifactDigestValid = true;
    const rebuilt = buildMakarovP0P1ActionCampaign({
      rawDiscovery: stored.discovery.rawArtifact,
      selectedP0DegreeTier: stored.configuration.selectedP0DegreeTier,
      maxCongruencePrime: stored.configuration.maxCongruencePrime,
      timeoutSeconds: stored.configuration.timeoutSeconds,
      execution: stored.execution,
    });
    rebuiltArtifactDigest = rebuilt.artifactDigest;
    if (canonicalSha256(rebuilt) !== canonicalSha256(stored)) {
      throw new Error("Stored campaign differs from its exact rooted rebuild.");
    }
    checks.exactRootedRebuildMatches = true;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "makarov-p0-p1-action-acquisition-replay" as const,
    status: errors.length === 0 ? ("passed" as const) : ("failed" as const),
    checks,
    ...(rebuiltArtifactDigest ? { rebuiltArtifactDigest } : {}),
    errors,
  };
  return { ...withoutDigest, replayDigest: canonicalSha256(withoutDigest) };
}

/**
 * Returns exact action/system/certificate inputs for downstream preparers.
 * Wall signs, full-H1 witnesses, and proof-job envelopes are intentionally not
 * synthesized by action acquisition.
 */
export function acceptedMakarovP0P1ActionPayloads(
  artifact: MakarovP0P1ActionCampaignArtifact,
): MakarovP0P1AcceptedActionPayload[] {
  const replay = replayMakarovP0P1ActionCampaign(artifact);
  if (replay.status !== "passed") {
    throw new Error(`Campaign replay failed: ${replay.errors.join(" ")}`);
  }
  return structuredClone(artifact.acceptedActionPayloads);
}

const MAKAROV_DIRECT_TARGET_SOURCE_BINDINGS = {
  "makarov-p0": {
    systemId: "p0",
    exampleId: "compact_5_prism_makarov",
    canonicalSourceSha256:
      "907041f98b252d98aeb0b14b4279bf2e311c56a925d1e60781d590e9a44fcf86",
    matrixSha256:
      "0174a43ebb1a22abea511af134eda1c32967235ac1a5fe1b926af582060de6fa",
    maximalSphericalCatalogueSha256:
      "3ef13a3691b660988fbd47247bdf3d36026c91a0d6a986c083030377f2f8b1bf",
  },
  "makarov-p1": {
    systemId: "p1",
    exampleId: "compact_5_polytope_p1_double_makarov",
    canonicalSourceSha256:
      "7704ef26a631675e44f37969b0125f7675ad0f5ad9337046d413d0c1621256d7",
    matrixSha256:
      "667adb167fda5d05b50a81a8f18aeb68ff9d7e7c37932bbb01702760d67bc0e1",
    maximalSphericalCatalogueSha256:
      "f5c25f656f8c3f460b6aec9e62889a0ea9ea5094725d74d78f8f1fb73ea9f9b1",
  },
} as const;

function independentIngestCandidate(
  input: Record<string, unknown>,
  system: CoxeterSystemInput,
): TorsionFreeActionCandidate {
  const index = input.index;
  if (!Number.isSafeInteger(index) || (index as number) < 1) {
    throw new Error("The independent ingest candidate has no positive degree.");
  }
  const degree = index as number;
  if (
    typeof input.id !== "string" ||
    input.id.length === 0 ||
    !Array.isArray(input.generatorImages) ||
    input.generatorImages.length !== system.rank
  ) {
    throw new Error("The independent ingest candidate envelope is malformed.");
  }
  const generatorImages = input.generatorImages.map((rawRow, generator) => {
    if (!Array.isArray(rawRow) || rawRow.length !== degree) {
      throw new Error(
        `Independent ingest generator ${generator} has the wrong degree.`,
      );
    }
    const seen = new Uint8Array(degree);
    const row = rawRow.map((image) => {
      if (
        !Number.isSafeInteger(image) ||
        (image as number) < 0 ||
        (image as number) >= degree ||
        seen[image as number] !== 0
      ) {
        throw new Error(
          `Independent ingest generator ${generator} is not a permutation.`,
        );
      }
      seen[image as number] = 1;
      return image as number;
    });
    return row;
  });
  const candidate: TorsionFreeActionCandidate = {
    id: input.id,
    index: degree,
    generatorImages,
  };
  for (const field of [
    "name",
    "backend",
    "backendVersion",
    "source",
  ] as const) {
    const value = input[field];
    if (value !== undefined) {
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Independent ingest candidate.${field} is invalid.`);
      }
      candidate[field] = value;
    }
  }
  if (input.notes !== undefined) {
    if (
      !Array.isArray(input.notes) ||
      input.notes.some((note) => typeof note !== "string")
    ) {
      throw new Error("Independent ingest candidate.notes is invalid.");
    }
    candidate.notes = [...input.notes] as string[];
  }
  return candidate;
}

/**
 * Accept the source-bound handoff emitted by the direct finite-target search.
 * P0 and P1 are selected independently; this parser never restricts or
 * extends an action between them.
 */
export function parseMakarovIndependentActionIngest(
  input: unknown,
): ParsedMakarovIndependentActionIngest {
  if (!isRecord(input))
    throw new Error("Independent action ingest is not an object.");
  const raw = structuredClone(input);
  if (
    raw.schemaVersion !== 1 ||
    raw.kind !== "makarov-independent-action-ingest" ||
    (raw.targetId !== "makarov-p0" && raw.targetId !== "makarov-p1") ||
    typeof raw.payloadSha256 !== "string" ||
    !SHA256_PATTERN.test(raw.payloadSha256)
  ) {
    throw new Error("Independent action ingest has an unsupported envelope.");
  }
  const payloadSha256 = raw.payloadSha256;
  delete raw.payloadSha256;
  if (canonicalSha256(raw) !== payloadSha256) {
    throw new Error("Independent action ingest has a stale payload seal.");
  }

  const sources = makarovP0P1SourceBindings();
  const source = raw.targetId === "makarov-p0" ? sources.p0 : sources.p1;
  const direct = MAKAROV_DIRECT_TARGET_SOURCE_BINDINGS[raw.targetId];
  if (raw.exampleId !== direct.exampleId || !isRecord(raw.systemBinding)) {
    throw new Error(
      "Independent action ingest names the wrong bundled example.",
    );
  }
  const binding = raw.systemBinding;
  if (
    binding.systemId !== direct.systemId ||
    binding.sourcePath !== source.sourcePath ||
    binding.sourceBytesSha256 !== source.sourceBytesSha256 ||
    binding.canonicalSourceSha256 !== direct.canonicalSourceSha256 ||
    binding.matrixSha256 !== direct.matrixSha256 ||
    binding.maximalSphericalCatalogueSha256 !==
      direct.maximalSphericalCatalogueSha256
  ) {
    throw new Error("Independent action ingest source binding is stale.");
  }
  if (!isRecord(raw.candidate)) {
    throw new Error("Independent action ingest has no candidate.");
  }
  const candidate = independentIngestCandidate(raw.candidate, source.system);
  if (
    raw.candidateSha256 !== canonicalSha256(raw.candidate) ||
    !isRecord(raw.derivation) ||
    raw.derivation.method !== "direct-finite-target-regular-action" ||
    typeof raw.derivation.finiteTargetId !== "string" ||
    !Number.isSafeInteger(raw.derivation.finiteTargetOrder) ||
    (raw.derivation.finiteTargetOrder as number) < candidate.index ||
    (raw.derivation.finiteTargetOrder as number) % candidate.index !== 0 ||
    raw.derivation.regularActionRowsSha256 !==
      canonicalSha256(candidate.generatorImages) ||
    raw.derivation.independentSystemAction !== true ||
    raw.derivation.p0ToP1RestrictionApplied !== false ||
    !isRecord(raw.torsionFreeCertification) ||
    raw.torsionFreeCertification.status !== "passed"
  ) {
    throw new Error("Independent action ingest derivation is malformed.");
  }
  const allowedTiers = getCompactResearchTarget(raw.targetId).executionPolicy
    .allowedDegreeTiers;
  if (!allowedTiers.includes(candidate.index)) {
    throw new Error(
      `Independent ${raw.targetId} action degree ${candidate.index} is not an active tier.`,
    );
  }
  return {
    targetId: raw.targetId,
    system: structuredClone(source.system),
    candidate,
    payloadDigest: payloadSha256,
    finiteTargetId: raw.derivation.finiteTargetId,
    finiteTargetOrder: raw.derivation.finiteTargetOrder as number,
  };
}

export function acceptMakarovIndependentActionIngest(
  input: unknown,
): MakarovP0P1AcceptedActionPayload {
  const parsed = parseMakarovIndependentActionIngest(input);
  return acceptedPayload(
    parsed.targetId,
    parsed.system,
    parsed.candidate,
    replayTorsionFreeAction(parsed.system, parsed.candidate),
    {
      method: "independent-direct-finite-target-ingest",
      ingestPayloadDigest: parsed.payloadDigest,
      finiteTargetId: parsed.finiteTargetId,
      finiteTargetOrder: parsed.finiteTargetOrder,
      p0ToP1RestrictionApplied: false,
    },
  );
}

export async function promoteMakarovIndependentActionIngest(
  input: unknown,
  options: MaterializedActionPipelineOptions = {},
): Promise<MaterializedActionPromotionArtifact> {
  const parsed = parseMakarovIndependentActionIngest(input);
  return promoteMaterializedActionToFullDavisFibering(
    parsed.system,
    parsed.candidate,
    {
      ...options,
      sourceSystemArtifactSha256:
        options.sourceSystemArtifactSha256 ??
        MAKAROV_P0_P1_SOURCE_BYTES_SHA256[
          parsed.targetId === "makarov-p0" ? "p0" : "p1"
        ],
    },
  );
}
