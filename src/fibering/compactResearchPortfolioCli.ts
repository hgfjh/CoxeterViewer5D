import {
  buildCompactActionProofBranch,
  type CompactActionProofBranchCertificate,
  type CompactActionProofBranchInput,
  type CompactDirectWallCharacterInput,
} from "./compactActionProofBranch";
import { parseCoxeterSystemInput } from "../coxeter";
import {
  torsionFreeActionFingerprint,
  type TorsionFreeActionCandidate,
} from "../torsionFree";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildCompactResearchPortfolio,
  type CompactResearchPortfolioArtifact,
} from "./compactResearchPortfolio";
import {
  compactResearchTargets,
  type CompactResearchTarget,
  type CompactResearchTargetId,
} from "./compactResearchTargets";
import {
  buildP2CoarseExperimentPlan,
  type P2CoarseSourceBinding,
} from "./p2CoarseExperiment";
import {
  replayScalableFullH1TrackBJsonInput,
  type ScalableFullH1TrackBJsonInput,
} from "./scalableFullH1TrackBJson";
import { computeStreamedActionRowsCanonicalSha256 } from "./streamedLawfulDavis";

export const COMPACT_RESEARCH_PORTFOLIO_DEFAULT_OUTPUT =
  "scripts/certificates/portfolio/compact_h5_research_portfolio.json";
export const COMPACT_RESEARCH_PORTFOLIO_DEFAULT_MAX_INPUT_BYTES =
  256 * 1024 * 1024;

export interface CompactResearchPortfolioCliArguments {
  output: string;
  job?: string;
  verifyOnly: boolean;
  maxInputBytes: number;
}

type DirectJsonInput = Omit<CompactDirectWallCharacterInput, "branch">;

export interface CompactResearchDirectProofJob {
  targetId: CompactResearchTargetId;
  actionId: string;
  branch: "direct-rank-one";
  input: DirectJsonInput;
}

export interface CompactResearchScalableProofJob {
  targetId: CompactResearchTargetId;
  actionId: string;
  branch: "scalable-full-h1";
  input: ScalableFullH1TrackBJsonInput;
}

export type CompactResearchProofJob =
  | CompactResearchDirectProofJob
  | CompactResearchScalableProofJob;

/** Callback-free job file. Runs are grouped by target/action before building. */
export interface CompactResearchPortfolioJobManifest {
  schemaVersion: 1;
  kind: "compact-h5-research-portfolio-job";
  proofRuns: CompactResearchProofJob[];
  /** Exact byte bindings only; the resulting P2 plan remains validation-only. */
  p2SourceBindings?: P2CoarseSourceBinding[];
}

const ARGUMENT_NAMES = new Set([
  "--output",
  "--job",
  "--verify-only",
  "--max-input-bytes",
]);
const JOB_KEYS = new Set([
  "schemaVersion",
  "kind",
  "proofRuns",
  "p2SourceBindings",
]);
const RUN_KEYS = new Set(["targetId", "actionId", "branch", "input"]);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const TARGETS_BY_ID = new Map(
  compactResearchTargets.map((target) => [target.id, target] as const),
);

interface CompactResearchJobActionBinding {
  systemCanonicalSha256: string;
  candidateId: string;
  degree: number;
  generatorCount: number;
  actionRowsCanonicalSha256: string;
  torsionFreeCertificateDigest: string;
}

export interface CompactResearchPortfolioBuildDependencies {
  /** Injectable only so tests can prove preflight runs before a proof engine. */
  buildProofBranch?: (
    input: CompactActionProofBranchInput,
  ) => CompactActionProofBranchCertificate;
}

function booleanValue(value: string | undefined, label: string): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${label} must be true or false.`);
}

function positiveSafeInteger(value: string | undefined, label: string): number {
  if (value === undefined) {
    return COMPACT_RESEARCH_PORTFOLIO_DEFAULT_MAX_INPUT_BYTES;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
}

export function parseCompactResearchPortfolioArguments(
  argv: readonly string[],
): CompactResearchPortfolioCliArguments {
  // pnpm appends its separator after arguments already present in a package
  // script, so the verify command can receive `--verify-only true -- ...`.
  const normalized = argv.filter((argument) => argument !== "--");
  if (normalized.length % 2 !== 0) {
    throw new Error("Arguments must be supplied as --name value pairs.");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      throw new Error(
        "Arguments must be supplied as distinct --name value pairs.",
      );
    }
    if (!ARGUMENT_NAMES.has(key)) throw new Error(`Unknown argument ${key}.`);
    values.set(key, value);
  }
  return {
    output: values.get("--output") ?? COMPACT_RESEARCH_PORTFOLIO_DEFAULT_OUTPUT,
    ...(values.has("--job") ? { job: values.get("--job") as string } : {}),
    verifyOnly: booleanValue(values.get("--verify-only"), "--verify-only"),
    maxInputBytes: positiveSafeInteger(
      values.get("--max-input-bytes"),
      "--max-input-bytes",
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  label: string,
): void {
  const unsupported = Object.keys(value).filter((key) => !keys.has(key));
  if (unsupported.length > 0) {
    throw new Error(
      `${label} has unsupported keys: ${unsupported.sort().join(", ")}.`,
    );
  }
}

function targetForId(value: unknown, label: string): CompactResearchTarget {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a compact research target id.`);
  }
  const target = TARGETS_BY_ID.get(value as CompactResearchTargetId);
  if (target === undefined) {
    throw new Error(`${label} names unknown compact research target ${value}.`);
  }
  return target;
}

function actionCandidate(
  value: unknown,
  label: string,
): TorsionFreeActionCandidate {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    !Number.isSafeInteger(value.index) ||
    (value.index as number) < 1 ||
    !Array.isArray(value.generatorImages)
  ) {
    throw new Error(`${label} is not a finite permutation-action candidate.`);
  }
  const degree = value.index as number;
  for (const [generator, row] of value.generatorImages.entries()) {
    if (!Array.isArray(row) || row.length !== degree) {
      throw new Error(
        `${label}.generatorImages[${generator}] does not have degree ${degree}.`,
      );
    }
    for (const image of row) {
      if (
        !Number.isSafeInteger(image) ||
        (image as number) < 0 ||
        (image as number) >= degree
      ) {
        throw new Error(
          `${label}.generatorImages[${generator}] has an out-of-range image.`,
        );
      }
    }
  }
  return value as unknown as TorsionFreeActionCandidate;
}

function modularSourceBinding(
  input: Record<string, unknown>,
  id: string,
  label: string,
): string {
  const certificate = input.modularRankCertificate;
  const source = isRecord(certificate) ? certificate.source : undefined;
  const bindings = isRecord(source) ? source.sourceBindings : undefined;
  if (!Array.isArray(bindings)) {
    throw new Error(`${label} has no modular-rank source bindings.`);
  }
  const matches = bindings.filter(
    (binding) => isRecord(binding) && binding.id === id,
  );
  if (
    matches.length !== 1 ||
    !isRecord(matches[0]) ||
    typeof matches[0].sha256 !== "string" ||
    !DIGEST_PATTERN.test(matches[0].sha256)
  ) {
    throw new Error(`${label} must bind exactly one ${id} SHA-256 digest.`);
  }
  return matches[0].sha256;
}

function basePreflight(
  target: CompactResearchTarget,
  systemInput: unknown,
  candidateInput: unknown,
  label: string,
): {
  system: ReturnType<typeof parseCoxeterSystemInput>;
  candidate: TorsionFreeActionCandidate;
  source: Omit<CompactResearchJobActionBinding, "torsionFreeCertificateDigest">;
} {
  if (
    !target.executionPolicy.acceptsFiniteActionEvidence ||
    target.executionPolicy.queueStatus !== "active"
  ) {
    throw new Error(`${target.id} is not active for finite-action proof jobs.`);
  }
  const system = parseCoxeterSystemInput(systemInput);
  const systemCanonicalSha256 = canonicalSha256(system);
  if (
    target.canonicalSystemSha256 === null ||
    systemCanonicalSha256 !== target.canonicalSystemSha256
  ) {
    throw new Error(`${label} does not use ${target.id}'s canonical system.`);
  }
  const candidate = actionCandidate(candidateInput, `${label} action`);
  if (candidate.generatorImages.length !== system.rank) {
    throw new Error(
      `${label} has ${candidate.generatorImages.length} action rows for Coxeter rank ${system.rank}.`,
    );
  }
  if (!target.executionPolicy.allowedDegreeTiers.includes(candidate.index)) {
    throw new Error(
      `${target.id} action degree ${candidate.index} is outside the active capacity-audited tiers ${target.executionPolicy.allowedDegreeTiers.join(", ")}.`,
    );
  }
  return {
    system,
    candidate,
    source: {
      systemCanonicalSha256,
      candidateId: candidate.id,
      degree: candidate.index,
      generatorCount: candidate.generatorImages.length,
      actionRowsCanonicalSha256: computeStreamedActionRowsCanonicalSha256(
        candidate.generatorImages,
      ),
    },
  };
}

function preflightRun(
  run: CompactResearchProofJob,
  index: number,
): CompactResearchJobActionBinding {
  const label = `proofRuns[${index}]`;
  const target = targetForId(run.targetId, `${label}.targetId`);
  if (run.actionId.trim().length === 0) {
    throw new Error(`${label}.actionId must be nonempty.`);
  }
  if (run.branch === "direct-rank-one") {
    const accepted = run.input.accepted;
    if (!isRecord(accepted)) {
      throw new Error(`${label} has no accepted direct action.`);
    }
    const prepared = basePreflight(
      target,
      run.input.system,
      accepted.candidate,
      label,
    );
    const certificate = accepted.certificate;
    if (
      !isRecord(certificate) ||
      certificate.status !== "passed" ||
      certificate.method !== "tits-spherical-special-subgroup-action" ||
      certificate.candidateId !== prepared.candidate.id ||
      certificate.candidateIndex !== prepared.candidate.index ||
      certificate.actionFingerprint !==
        torsionFreeActionFingerprint(prepared.system, prepared.candidate)
    ) {
      throw new Error(
        `${label} direct torsion-free certificate is not bound to its system and action.`,
      );
    }
    return {
      ...prepared.source,
      torsionFreeCertificateDigest: canonicalSha256(certificate),
    };
  }
  if (run.branch !== "scalable-full-h1") {
    throw new Error(`${label} selects an unsupported proof branch.`);
  }

  const rawInput = run.input as unknown as Record<string, unknown>;
  const prepared = basePreflight(
    target,
    rawInput.system,
    rawInput.actionCandidate,
    label,
  );
  const boundActionRows = modularSourceBinding(rawInput, "action-rows", label);
  if (boundActionRows !== prepared.source.actionRowsCanonicalSha256) {
    throw new Error(
      `${label} modular-rank evidence is bound to different action rows.`,
    );
  }
  return {
    ...prepared.source,
    torsionFreeCertificateDigest: modularSourceBinding(
      rawInput,
      "torsion-free-certificate",
      label,
    ),
  };
}

/** Reject every cheap target/action mismatch before either proof engine runs. */
export function preflightCompactResearchPortfolioJob(
  job: CompactResearchPortfolioJobManifest,
): void {
  const actionBindings = new Map<string, CompactResearchJobActionBinding>();
  for (const [index, run] of job.proofRuns.entries()) {
    const binding = preflightRun(run, index);
    const key = `${run.targetId}\u0000${run.actionId}`;
    const previous = actionBindings.get(key);
    if (
      previous !== undefined &&
      canonicalSha256(previous) !== canonicalSha256(binding)
    ) {
      throw new Error(
        `${run.targetId}/${run.actionId} mixes inconsistent finite-action bindings.`,
      );
    }
    actionBindings.set(key, binding);
  }
}

export function parseCompactResearchPortfolioJobManifest(
  raw: unknown,
): CompactResearchPortfolioJobManifest {
  if (!isRecord(raw)) {
    throw new Error("The compact research job must be an object.");
  }
  assertExactKeys(raw, JOB_KEYS, "The compact research job");
  if (
    raw.schemaVersion !== 1 ||
    raw.kind !== "compact-h5-research-portfolio-job" ||
    !Array.isArray(raw.proofRuns)
  ) {
    throw new Error("The compact research job envelope is unsupported.");
  }
  const proofRuns = raw.proofRuns.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`proofRuns[${index}] must be an object.`);
    }
    assertExactKeys(entry, RUN_KEYS, `proofRuns[${index}]`);
    if (
      typeof entry.targetId !== "string" ||
      typeof entry.actionId !== "string" ||
      entry.actionId.trim().length === 0 ||
      !isRecord(entry.input)
    ) {
      throw new Error(
        `proofRuns[${index}] has an invalid target, action id, or input.`,
      );
    }
    const targetId = targetForId(
      entry.targetId,
      `proofRuns[${index}].targetId`,
    ).id;
    if (entry.branch === "direct-rank-one") {
      const input = entry.input;
      if (
        !("system" in input) ||
        !("accepted" in input) ||
        !isRecord(input.source) ||
        typeof input.source.id !== "string" ||
        !isRecord(input.source.wallSigns)
      ) {
        throw new Error(
          `proofRuns[${index}] has an invalid direct-rank-one input.`,
        );
      }
      return {
        targetId,
        actionId: entry.actionId,
        branch: entry.branch,
        input: entry.input as unknown as DirectJsonInput,
      } satisfies CompactResearchDirectProofJob;
    }
    if (entry.branch === "scalable-full-h1") {
      return {
        targetId,
        actionId: entry.actionId,
        branch: entry.branch,
        input: entry.input as unknown as ScalableFullH1TrackBJsonInput,
      } satisfies CompactResearchScalableProofJob;
    }
    throw new Error(`proofRuns[${index}] selects an unsupported proof branch.`);
  });
  if (
    raw.p2SourceBindings !== undefined &&
    !Array.isArray(raw.p2SourceBindings)
  ) {
    throw new Error("p2SourceBindings must be a JSON array when supplied.");
  }
  const p2SourceBindings = raw.p2SourceBindings as
    | P2CoarseSourceBinding[]
    | undefined;
  // This validates declared bindings; it does not read or trust their bytes.
  if (p2SourceBindings) buildP2CoarseExperimentPlan(p2SourceBindings);
  const job: CompactResearchPortfolioJobManifest = {
    schemaVersion: 1,
    kind: "compact-h5-research-portfolio-job",
    proofRuns,
    ...(p2SourceBindings ? { p2SourceBindings } : {}),
  };
  preflightCompactResearchPortfolioJob(job);

  // This reconstruction is intentionally second-pass: no proof replay begins
  // until every target, tier, system, and grouped action binding has passed.
  for (const [index, run] of proofRuns.entries()) {
    if (run.branch !== "scalable-full-h1") continue;
    const replay = replayScalableFullH1TrackBJsonInput(run.input);
    if (replay.status !== "passed") {
      throw new Error(
        `proofRuns[${index}] has an invalid scalable input: ${replay.errors.join(" ")}`,
      );
    }
  }
  return job;
}

export function buildCompactResearchPortfolioFromJob(
  job: CompactResearchPortfolioJobManifest,
  dependencies: CompactResearchPortfolioBuildDependencies = {},
): CompactResearchPortfolioArtifact {
  interface MutableActionInput {
    targetId: CompactResearchTargetId;
    actionId: string;
    proofBranches: CompactActionProofBranchCertificate[];
  }
  preflightCompactResearchPortfolioJob(job);
  const p2Plan = job.p2SourceBindings
    ? buildP2CoarseExperimentPlan(job.p2SourceBindings)
    : buildP2CoarseExperimentPlan();
  const buildProofBranch =
    dependencies.buildProofBranch ?? buildCompactActionProofBranch;
  const grouped = new Map<string, MutableActionInput>();
  for (const run of job.proofRuns) {
    const key = `${run.targetId}\u0000${run.actionId}`;
    let action = grouped.get(key);
    if (!action) {
      action = {
        targetId: run.targetId,
        actionId: run.actionId,
        proofBranches: [],
      };
      grouped.set(key, action);
    }
    action.proofBranches.push(
      run.branch === "direct-rank-one"
        ? buildProofBranch({
            branch: "direct-rank-one",
            ...run.input,
          })
        : buildProofBranch({
            branch: "scalable-full-h1",
            jsonInput: run.input,
          }),
    );
  }
  return buildCompactResearchPortfolio({
    actions: [...grouped.values()],
    p2Plan,
  });
}
