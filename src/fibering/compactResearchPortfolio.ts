import { canonicalSha256, canonicalizeJson } from "../utils/canonicalSha256";
import { computeGeneralizedCompressionArchiveHash } from "../davis/generalizedCompression";
import {
  computeCompactActionProofBranchDigest,
  type CompactActionProofBranchCertificate,
} from "./compactActionProofBranch";
import {
  compactResearchCampaigns,
  compactResearchTargets,
  type CompactResearchCampaign,
  type CompactResearchTarget,
  type CompactResearchTargetId,
} from "./compactResearchTargets";
import {
  computeExactCheapScreenActionBindingDigest,
  type ExactCompactActionCheapScreenReport,
  type ExactIntegralCocycleSectionCertificate,
} from "./exactCompactActionCheapScreen";
import { computeGenericCompactExpensiveStageDigest } from "./genericCompactExpensiveStage";
import {
  buildP2CoarseExperimentPlan,
  replayP2CoarseExperimentPlan,
  type P2CoarseExperimentPlan,
} from "./p2CoarseExperiment";
import { computeScalableGenericActionH1CertificateDigest } from "./scalableGenericActionH1";
import {
  computeScalableFullH1TrackBJsonCertificateDigest,
  replayScalableFullH1TrackBJsonCertificate,
} from "./scalableFullH1TrackBJson";
import { computeScalableFullH1TrackBPipelineDigest } from "./scalableFullH1TrackBPipeline";
import { computeStreamedTrackBArtifactHash } from "./streamedTrackB";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

export type CompactResearchProofBranchId =
  | "direct-rank-one"
  | "scalable-full-h1";

export interface CompactResearchActionProofInput {
  targetId: CompactResearchTargetId;
  /** Stable within the target. It need not equal the backend candidate id. */
  actionId: string;
  proofBranches: readonly CompactActionProofBranchCertificate[];
}

export interface CompactResearchActionBinding {
  targetId: CompactResearchTargetId;
  actionId: string;
  systemCanonicalSha256: string;
  candidateId: string;
  degree: number;
  generatorCount: number;
  actionRowsCanonicalSha256: string;
  torsionFreeCertificateDigest: string;
  bindingDigest: string;
}

export interface CompactResearchProofBranchRun {
  runId: string;
  branch: CompactResearchProofBranchId;
  status: CompactActionProofBranchCertificate["status"];
  outcome: CompactActionProofBranchCertificate["outcome"];
  actionBindingDigest: string;
  certificateDigest: string;
  /** True only when a callback-free scalable certificate embeds its JSON input. */
  proofInputsStored: boolean;
  replayScope: "digest-and-action-binding-only" | "exact-callback-free-rebuild";
  certificate: CompactActionProofBranchCertificate;
  checks: {
    certificateDigestValid: true;
    nestedCertificateDigestsValid: true;
    actionBindingMatches: true;
  };
  runDigest: string;
}

export interface CompactResearchActionEvidence {
  actionId: string;
  binding: CompactResearchActionBinding;
  registeredDegreeTier: boolean;
  branches: {
    execution: "independent";
    directRankOne: CompactResearchProofBranchRun[];
    scalableFullH1: CompactResearchProofBranchRun[];
  };
  summary: {
    directRankOneRunCount: number;
    directRankOnePassedCount: number;
    directRankOneFiberingCertificateCount: number;
    scalableFullH1RunCount: number;
    scalableFullH1PassedCount: number;
    scalableFullH1FiberingCertificateCount: number;
  };
  actionEvidenceDigest: string;
}

export interface CompactResearchPortfolioTargetRecord {
  definition: CompactResearchTarget;
  actions: CompactResearchActionEvidence[];
  targetRecordDigest: string;
}

export interface CompactResearchPortfolioArtifact {
  schemaVersion: 2;
  kind: "compact-h5-research-portfolio";
  status: "research-manifest-recorded";
  registry: {
    campaigns: CompactResearchCampaign[];
    registryDigest: string;
  };
  policy: {
    proofBranchesRunIndependently: true;
    directRankOneGatesScalableFullH1: false;
    scalableFullH1GatesDirectRankOne: false;
    p2UsesSeparateCoarsePlan: true;
  };
  targets: CompactResearchPortfolioTargetRecord[];
  p2Plan: P2CoarseExperimentPlan;
  replayLimitations: string[];
  artifactDigest: string;
}

export interface CompactResearchPortfolioReplay {
  schemaVersion: 2;
  kind: "compact-h5-research-portfolio-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    artifactDigestValid: boolean;
    registryMatchesCurrent: boolean;
    everyTargetRecorded: boolean;
    p2PlanReplayed: boolean;
    branchCertificateDigestsValid: boolean;
    branchActionBindingsValid: boolean;
    derivedRecordsMatch: boolean;
    independentBranchPolicyRecorded: boolean;
  };
  limitations: string[];
  errors: string[];
  replayDigest: string;
}

export interface CompactResearchPortfolioBuildOptions {
  p2Plan?: P2CoarseExperimentPlan;
  actions?: readonly CompactResearchActionProofInput[];
}

const POLICY: CompactResearchPortfolioArtifact["policy"] = {
  proofBranchesRunIndependently: true,
  directRankOneGatesScalableFullH1: false,
  scalableFullH1GatesDirectRankOne: false,
  p2UsesSeparateCoarsePlan: true,
};

const REPLAY_LIMITATIONS = [
  "Manifest replay exactly rebuilds callback-free scalable branches from their embedded JSON input; other branches receive canonical-digest, nested-digest, and action-binding validation only.",
  "Direct-rank-one replay still needs the original Coxeter system, accepted action, and complete wall-sign source.",
  "A legacy scalable-full-H1 branch without an embedded JSON adapter still needs its runtime oracle/preparation and external modular-rank and integral-kernel inputs.",
  "Pure manifest replay validates acquisition-screen registry bindings only; the Node CLI additionally reads the H4 and Tumarkin artifacts and sources, checks their byte hashes and certificate seals, and replays their completed scope.",
  "P2-plan replay validates the declared plan and source hashes, not the bytes at external source locators.",
] as const;

interface BranchValidation {
  certificateDigestsValid: boolean;
  actionBindingValid: boolean;
  errors: string[];
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

function withoutKey(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([entryKey]) => entryKey !== key),
  );
}

function digestWithoutKey(value: object, key: string): string {
  return canonicalSha256(withoutKey(value, key));
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

function sameActionSource(
  left: CompactActionProofBranchCertificate["source"],
  right: CompactActionProofBranchCertificate["source"],
): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

function targetSystemDigest(target: CompactResearchTarget): string | null {
  return target.canonicalSystemSha256;
}

function sourceMatchesBinding(
  source: CompactActionProofBranchCertificate["source"],
  binding: CompactResearchActionBinding,
): boolean {
  return (
    source.systemCanonicalSha256 === binding.systemCanonicalSha256 &&
    source.candidateId === binding.candidateId &&
    source.degree === binding.degree &&
    source.generatorCount === binding.generatorCount &&
    source.actionRowsCanonicalSha256 === binding.actionRowsCanonicalSha256 &&
    source.torsionFreeCertificateDigest === binding.torsionFreeCertificateDigest
  );
}

function validateCocycleCertificate(
  certificate: ExactIntegralCocycleSectionCertificate,
): boolean {
  return (
    certificate.schemaVersion === 1 &&
    certificate.kind === "exact-integral-cocycle-section-certificate" &&
    isDigest(certificate.certificateDigest) &&
    certificate.certificateDigest ===
      digestWithoutKey(certificate, "certificateDigest")
  );
}

function validateCheapReport(
  report: ExactCompactActionCheapScreenReport,
): boolean {
  return (
    isDigest(report.reportDigest) &&
    report.reportDigest === digestWithoutKey(report, "reportDigest")
  );
}

function validateBranchCertificate(
  certificate: CompactActionProofBranchCertificate,
  target?: CompactResearchTarget,
): BranchValidation {
  const digestErrors: string[] = [];
  const bindingErrors: string[] = [];
  try {
    canonicalizeJson(certificate);
    if (
      certificate.schemaVersion !== 2 ||
      certificate.kind !== "compact-action-proof-branch-certificate" ||
      !isDigest(certificate.certificateDigest) ||
      certificate.certificateDigest !==
        computeCompactActionProofBranchDigest(certificate)
    ) {
      digestErrors.push("The proof-branch wrapper digest is invalid.");
    }
    if (
      !isDigest(certificate.source.systemCanonicalSha256) ||
      !isDigest(certificate.source.actionRowsCanonicalSha256) ||
      !isDigest(certificate.source.torsionFreeCertificateDigest) ||
      !Number.isSafeInteger(certificate.source.degree) ||
      certificate.source.degree < 1 ||
      !Number.isSafeInteger(certificate.source.generatorCount) ||
      certificate.source.generatorCount < 1
    ) {
      bindingErrors.push("The proof branch has an invalid action source.");
    }
    const expectedTargetDigest = target ? targetSystemDigest(target) : null;
    if (
      expectedTargetDigest !== null &&
      certificate.source.systemCanonicalSha256 !== expectedTargetDigest
    ) {
      bindingErrors.push(
        "The proof branch is bound to a different target system.",
      );
    }
    if (
      certificate.checks.exactActionBound !== true ||
      certificate.checks.proofSourceReplayed !== true
    ) {
      bindingErrors.push(
        "The proof branch does not claim a replayed exact action binding.",
      );
    }

    if (certificate.branch === "direct-rank-one") {
      const direct = certificate.direct;
      if (direct === undefined || certificate.scalableFullH1 !== undefined) {
        digestErrors.push("The direct branch payload is missing or ambiguous.");
      } else {
        const binding = direct.actionBinding;
        const compression = direct.generalizedCompression;
        const compressionDigestValid =
          isDigest(compression.certificate.archiveHash) &&
          compression.certificate.archiveHash ===
            computeGeneralizedCompressionArchiveHash(compression.certificate);
        const trackBPayload = withoutKey(direct.trackB, "trackBDigest");
        const trackBDigestsValid =
          isDigest(direct.trackB.trackBDigest) &&
          direct.trackB.trackBDigest === canonicalSha256(trackBPayload) &&
          (["-1", "1"] as const).every((polarity) => {
            const entry = direct.trackB.polarities[polarity];
            return (
              isDigest(entry.certificate.artifactHash) &&
              entry.certificate.artifactHash ===
                computeStreamedTrackBArtifactHash(entry.certificate)
            );
          });
        if (
          !isDigest(binding.bindingDigest) ||
          binding.bindingDigest !==
            computeExactCheapScreenActionBindingDigest(binding) ||
          !validateCocycleCertificate(direct.cocycleSection) ||
          !compressionDigestValid ||
          !trackBDigestsValid
        ) {
          digestErrors.push(
            "A nested direct-branch certificate digest is invalid.",
          );
        }
        const commonActionBound =
          binding.degree === certificate.source.degree &&
          binding.generatorCount === certificate.source.generatorCount &&
          binding.actionRowsCanonicalSha256 ===
            certificate.source.actionRowsCanonicalSha256 &&
          binding.upstreamCertificateDigest ===
            certificate.source.torsionFreeCertificateDigest &&
          direct.cocycleSection.source.degree === certificate.source.degree &&
          direct.cocycleSection.source.generatorCount ===
            certificate.source.generatorCount &&
          direct.cocycleSection.source.actionRowsCanonicalSha256 ===
            certificate.source.actionRowsCanonicalSha256 &&
          direct.sourceDigest ===
            direct.cocycleSection.source.latticeBasisDigest;
        const compressionActionBound =
          compression.certificate.source.systemCanonicalSha256 ===
            certificate.source.systemCanonicalSha256 &&
          compression.certificate.source.actionRowsCanonicalSha256 ===
            certificate.source.actionRowsCanonicalSha256 &&
          compression.certificate.source.candidateId ===
            certificate.source.candidateId &&
          compression.certificate.source.degree === certificate.source.degree;
        const trackBActionBound = (["-1", "1"] as const).every((polarity) => {
          const source = direct.trackB.polarities[polarity].certificate.source;
          return (
            source.systemCanonicalSha256 ===
              certificate.source.systemCanonicalSha256 &&
            source.actionRowsCanonicalSha256 ===
              certificate.source.actionRowsCanonicalSha256 &&
            source.generalizedCompressionArchiveHash ===
              compression.certificate.archiveHash &&
            source.offsetPolarity === Number(polarity)
          );
        });
        if (!commonActionBound) {
          bindingErrors.push(
            "The direct cocycle is not consistently action-bound.",
          );
        }
        if (!compressionActionBound) {
          bindingErrors.push(
            "The direct generalized compression is not consistently action-bound.",
          );
        }
        if (!trackBActionBound) {
          bindingErrors.push(
            "A direct Track-B polarity is not consistently action-bound.",
          );
        }
      }
    } else if (certificate.branch === "scalable-full-h1") {
      const scalable = certificate.scalableFullH1;
      if (scalable === undefined || certificate.direct !== undefined) {
        digestErrors.push(
          "The scalable branch payload is missing or ambiguous.",
        );
      } else {
        const pipeline = scalable.pipeline;
        const h1 = pipeline.h1.certificate;
        const jsonAdapter = scalable.jsonAdapter;
        const jsonAdapterValid =
          jsonAdapter === undefined ||
          (isDigest(jsonAdapter.certificateDigest) &&
            jsonAdapter.certificateDigest ===
              computeScalableFullH1TrackBJsonCertificateDigest(jsonAdapter) &&
            canonicalSha256(jsonAdapter.pipeline) ===
              canonicalSha256(pipeline) &&
            replayScalableFullH1TrackBJsonCertificate(jsonAdapter).status ===
              "passed");
        if (
          !isDigest(pipeline.certificateDigest) ||
          pipeline.certificateDigest !==
            computeScalableFullH1TrackBPipelineDigest(pipeline) ||
          !isDigest(h1.certificateDigest) ||
          h1.certificateDigest !==
            computeScalableGenericActionH1CertificateDigest(h1) ||
          pipeline.promotion.promotionDigest !==
            digestWithoutKey(pipeline.promotion, "promotionDigest") ||
          (pipeline.cheapScreen !== undefined &&
            !validateCheapReport(pipeline.cheapScreen.report)) ||
          (pipeline.trackB !== undefined &&
            pipeline.trackB.certificate.certificateDigest !==
              computeGenericCompactExpensiveStageDigest(
                pipeline.trackB.certificate,
              )) ||
          !jsonAdapterValid
        ) {
          digestErrors.push(
            "A nested scalable-branch certificate digest is invalid.",
          );
        }
        if (
          pipeline.source.systemCanonicalSha256 !==
            certificate.source.systemCanonicalSha256 ||
          pipeline.source.candidateId !== certificate.source.candidateId ||
          pipeline.source.degree !== certificate.source.degree ||
          pipeline.source.generatorCount !==
            certificate.source.generatorCount ||
          pipeline.source.actionRowsCanonicalSha256 !==
            certificate.source.actionRowsCanonicalSha256 ||
          pipeline.source.torsionFreeCertificateDigest !==
            certificate.source.torsionFreeCertificateDigest ||
          h1.source.systemCanonicalSha256 !==
            certificate.source.systemCanonicalSha256 ||
          h1.source.actionRowsCanonicalSha256 !==
            certificate.source.actionRowsCanonicalSha256 ||
          h1.source.suppliedTorsionFreeCertificateDigest !==
            certificate.source.torsionFreeCertificateDigest ||
          (pipeline.trackB !== undefined &&
            (pipeline.trackB.certificate.source.systemCanonicalSha256 !==
              certificate.source.systemCanonicalSha256 ||
              pipeline.trackB.certificate.source.candidateId !==
                certificate.source.candidateId ||
              pipeline.trackB.certificate.source.degree !==
                certificate.source.degree ||
              pipeline.trackB.certificate.source.generatorCount !==
                certificate.source.generatorCount ||
              pipeline.trackB.certificate.source
                .oracleActionRowsCanonicalSha256 !==
                certificate.source.actionRowsCanonicalSha256 ||
              pipeline.trackB.certificate.source.h1CertificateDigest !==
                h1.certificateDigest))
        ) {
          bindingErrors.push(
            "The scalable branch is not consistently action-bound.",
          );
        }
      }
    } else {
      digestErrors.push("The proof branch id is unsupported.");
    }
  } catch (error) {
    digestErrors.push(error instanceof Error ? error.message : String(error));
  }
  return {
    certificateDigestsValid: digestErrors.length === 0,
    actionBindingValid: bindingErrors.length === 0,
    errors: [...digestErrors, ...bindingErrors],
  };
}

function actionBinding(
  targetId: CompactResearchTargetId,
  actionId: string,
  source: CompactActionProofBranchCertificate["source"],
): CompactResearchActionBinding {
  const payload = { targetId, actionId, ...source };
  return { ...payload, bindingDigest: canonicalSha256(payload) };
}

function branchRun(
  certificate: CompactActionProofBranchCertificate,
  binding: CompactResearchActionBinding,
): CompactResearchProofBranchRun {
  const exactCallbackFreeReplay =
    certificate.branch === "scalable-full-h1" &&
    certificate.scalableFullH1?.jsonAdapter !== undefined;
  const payload = {
    runId: `${certificate.branch}:${certificate.certificateDigest}`,
    branch: certificate.branch,
    status: certificate.status,
    outcome: certificate.outcome,
    actionBindingDigest: binding.bindingDigest,
    certificateDigest: certificate.certificateDigest,
    proofInputsStored: exactCallbackFreeReplay,
    replayScope: exactCallbackFreeReplay
      ? ("exact-callback-free-rebuild" as const)
      : ("digest-and-action-binding-only" as const),
    certificate: canonicalClone(certificate),
    checks: {
      certificateDigestValid: true as const,
      nestedCertificateDigestsValid: true as const,
      actionBindingMatches: true as const,
    },
  };
  return { ...payload, runDigest: canonicalSha256(payload) };
}

function buildActionEvidence(
  target: CompactResearchTarget,
  input: CompactResearchActionProofInput,
): CompactResearchActionEvidence {
  if (input.actionId.trim().length === 0) {
    throw new Error(`${target.id} has an empty action id.`);
  }
  if (
    !target.executionPolicy.acceptsFiniteActionEvidence ||
    target.executionPolicy.queueStatus !== "active"
  ) {
    throw new Error(
      `${target.id} is not registered for finite-action proof runs.`,
    );
  }
  if (input.proofBranches.length === 0) {
    throw new Error(`${target.id}/${input.actionId} has no proof-branch runs.`);
  }
  const certificates = input.proofBranches
    .map(canonicalClone)
    .sort((left, right) =>
      `${left.branch}:${left.certificateDigest}`.localeCompare(
        `${right.branch}:${right.certificateDigest}`,
      ),
    );
  if (
    new Set(certificates.map((entry) => entry.certificateDigest)).size !==
    certificates.length
  ) {
    throw new Error(
      `${target.id}/${input.actionId} repeats a proof certificate.`,
    );
  }
  for (const certificate of certificates) {
    const validation = validateBranchCertificate(certificate, target);
    if (!validation.certificateDigestsValid || !validation.actionBindingValid) {
      throw new Error(
        `${target.id}/${input.actionId} has invalid proof evidence: ${validation.errors.join(" ")}`,
      );
    }
  }
  const source = certificates[0].source;
  if (
    !certificates.every((certificate) =>
      sameActionSource(certificate.source, source),
    )
  ) {
    throw new Error(
      `${target.id}/${input.actionId} mixes different finite actions.`,
    );
  }
  if (!target.executionPolicy.allowedDegreeTiers.includes(source.degree)) {
    throw new Error(
      `${target.id}/${input.actionId} has degree ${source.degree}, outside the active capacity-audited tiers ${target.executionPolicy.allowedDegreeTiers.join(", ")}.`,
    );
  }
  const binding = actionBinding(target.id, input.actionId, source);
  const runs = certificates.map((certificate) =>
    branchRun(certificate, binding),
  );
  const directRankOne = runs.filter((run) => run.branch === "direct-rank-one");
  const scalableFullH1 = runs.filter(
    (run) => run.branch === "scalable-full-h1",
  );
  const payload = {
    actionId: input.actionId,
    binding,
    registeredDegreeTier: true,
    branches: {
      execution: "independent" as const,
      directRankOne,
      scalableFullH1,
    },
    summary: {
      directRankOneRunCount: directRankOne.length,
      directRankOnePassedCount: directRankOne.filter(
        (run) => run.status === "passed",
      ).length,
      directRankOneFiberingCertificateCount: directRankOne.filter(
        (run) =>
          run.status === "passed" &&
          run.outcome === "direct-rank-one-finite-generation-certified",
      ).length,
      scalableFullH1RunCount: scalableFullH1.length,
      scalableFullH1PassedCount: scalableFullH1.filter(
        (run) => run.status === "passed",
      ).length,
      scalableFullH1FiberingCertificateCount: scalableFullH1.filter(
        (run) =>
          run.status === "passed" &&
          run.outcome === "virtual-algebraic-fibering-certified",
      ).length,
    },
  };
  return { ...payload, actionEvidenceDigest: canonicalSha256(payload) };
}

function registryDigest(
  campaigns: readonly CompactResearchCampaign[],
  targets: readonly CompactResearchTarget[],
): string {
  return canonicalSha256({ campaigns, targets });
}

export function computeCompactResearchPortfolioDigest(
  artifact: CompactResearchPortfolioArtifact,
): string {
  return digestWithoutKey(artifact, "artifactDigest");
}

/** Build a deterministic schema-v2 manifest without retaining callback objects. */
export function buildCompactResearchPortfolio(
  options: CompactResearchPortfolioBuildOptions = {},
): CompactResearchPortfolioArtifact {
  const campaigns = [...canonicalClone(compactResearchCampaigns)];
  const definitions = [...canonicalClone(compactResearchTargets)];
  const p2Plan = canonicalClone(
    options.p2Plan ?? buildP2CoarseExperimentPlan(),
  );
  const p2Replay = replayP2CoarseExperimentPlan(p2Plan);
  if (p2Replay.status !== "passed") {
    throw new Error(`The P2 plan did not replay: ${p2Replay.errors.join(" ")}`);
  }
  const inputs = [...(options.actions ?? [])];
  const inputKeys = inputs.map(
    (input) => `${input.targetId}\u0000${input.actionId}`,
  );
  if (new Set(inputKeys).size !== inputKeys.length) {
    throw new Error("A compact target/action id is repeated.");
  }
  const targets: CompactResearchPortfolioTargetRecord[] = definitions.map(
    (definition) => {
      const actions = inputs
        .filter((input) => input.targetId === definition.id)
        .map((input) => buildActionEvidence(definition, input))
        .sort((left, right) => left.actionId.localeCompare(right.actionId));
      const payload = { definition, actions };
      return { ...payload, targetRecordDigest: canonicalSha256(payload) };
    },
  );
  const knownIds = new Set(definitions.map(({ id }) => id));
  for (const input of inputs) {
    if (!knownIds.has(input.targetId)) {
      throw new Error(`Unknown compact research target ${input.targetId}.`);
    }
  }
  const payload = {
    schemaVersion: 2 as const,
    kind: "compact-h5-research-portfolio" as const,
    status: "research-manifest-recorded" as const,
    registry: {
      campaigns,
      registryDigest: registryDigest(
        campaigns,
        targets.map(({ definition }) => definition),
      ),
    },
    policy: POLICY,
    targets,
    p2Plan,
    replayLimitations: [...REPLAY_LIMITATIONS],
  };
  return { ...payload, artifactDigest: canonicalSha256(payload) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Replay the serializable manifest layer. Callback-free scalable inputs are
 * rebuilt exactly; direct and legacy runtime-provider inputs are unavailable.
 */
export function replayCompactResearchPortfolio(
  storedInput: unknown,
): CompactResearchPortfolioReplay {
  const checks: CompactResearchPortfolioReplay["checks"] = {
    envelopeRecognized: false,
    artifactDigestValid: false,
    registryMatchesCurrent: false,
    everyTargetRecorded: false,
    p2PlanReplayed: false,
    branchCertificateDigestsValid: false,
    branchActionBindingsValid: false,
    derivedRecordsMatch: false,
    independentBranchPolicyRecorded: false,
  };
  const errors: string[] = [];
  if (!isRecord(storedInput)) {
    errors.push("The compact research portfolio is not an object.");
  } else {
    try {
      const stored = storedInput as unknown as CompactResearchPortfolioArtifact;
      checks.envelopeRecognized =
        stored.schemaVersion === 2 &&
        stored.kind === "compact-h5-research-portfolio" &&
        stored.status === "research-manifest-recorded" &&
        Array.isArray(stored.targets);
      checks.artifactDigestValid =
        isDigest(stored.artifactDigest) &&
        stored.artifactDigest === computeCompactResearchPortfolioDigest(stored);
      checks.independentBranchPolicyRecorded =
        canonicalSha256(stored.policy) === canonicalSha256(POLICY);

      const currentCampaigns = [...canonicalClone(compactResearchCampaigns)];
      const currentTargets = [...canonicalClone(compactResearchTargets)];
      checks.registryMatchesCurrent =
        stored.registry.registryDigest ===
          registryDigest(
            stored.registry.campaigns,
            stored.targets.map(({ definition }) => definition),
          ) &&
        canonicalSha256(stored.registry.campaigns) ===
          canonicalSha256(currentCampaigns) &&
        canonicalSha256(stored.targets.map(({ definition }) => definition)) ===
          canonicalSha256(currentTargets);
      checks.everyTargetRecorded =
        stored.targets.length === currentTargets.length &&
        canonicalSha256(
          stored.targets.map(({ definition }) => definition.id),
        ) === canonicalSha256(currentTargets.map(({ id }) => id));
      checks.p2PlanReplayed =
        replayP2CoarseExperimentPlan(stored.p2Plan).status === "passed";

      let nestedDigestsValid = true;
      let bindingsValid = true;
      const rebuiltInputs: CompactResearchActionProofInput[] = [];
      for (const targetRecord of stored.targets) {
        if (
          targetRecord.targetRecordDigest !==
          digestWithoutKey(targetRecord, "targetRecordDigest")
        ) {
          nestedDigestsValid = false;
        }
        for (const action of targetRecord.actions) {
          if (
            action.actionEvidenceDigest !==
              digestWithoutKey(action, "actionEvidenceDigest") ||
            action.binding.bindingDigest !==
              digestWithoutKey(action.binding, "bindingDigest")
          ) {
            nestedDigestsValid = false;
          }
          const runs = [
            ...action.branches.directRankOne,
            ...action.branches.scalableFullH1,
          ];
          for (const run of runs) {
            if (run.runDigest !== digestWithoutKey(run, "runDigest")) {
              nestedDigestsValid = false;
            }
            const validation = validateBranchCertificate(
              run.certificate,
              targetRecord.definition,
            );
            nestedDigestsValid &&= validation.certificateDigestsValid;
            bindingsValid &&=
              validation.actionBindingValid &&
              sourceMatchesBinding(run.certificate.source, action.binding) &&
              run.actionBindingDigest === action.binding.bindingDigest &&
              run.certificateDigest === run.certificate.certificateDigest;
            if (validation.errors.length > 0) errors.push(...validation.errors);
          }
          rebuiltInputs.push({
            targetId: targetRecord.definition.id,
            actionId: action.actionId,
            proofBranches: runs.map(({ certificate }) => certificate),
          });
        }
      }
      checks.branchCertificateDigestsValid = nestedDigestsValid;
      checks.branchActionBindingsValid = bindingsValid;
      if (
        checks.registryMatchesCurrent &&
        checks.p2PlanReplayed &&
        nestedDigestsValid &&
        bindingsValid
      ) {
        const rebuilt = buildCompactResearchPortfolio({
          p2Plan: stored.p2Plan,
          actions: rebuiltInputs,
        });
        checks.derivedRecordsMatch =
          canonicalSha256(rebuilt) === canonicalSha256(stored);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) errors.push(`Replay check failed: ${name}.`);
  }
  const uniqueErrors = [...new Set(errors)].sort();
  const payload = {
    schemaVersion: 2 as const,
    kind: "compact-h5-research-portfolio-replay" as const,
    status: (uniqueErrors.length === 0 && Object.values(checks).every(Boolean)
      ? "passed"
      : "failed") as "passed" | "failed",
    checks,
    limitations: [...REPLAY_LIMITATIONS],
    errors: uniqueErrors,
  };
  return { ...payload, replayDigest: canonicalSha256(payload) };
}
