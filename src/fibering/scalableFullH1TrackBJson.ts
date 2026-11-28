import { parseCoxeterSystemInput } from "../coxeter";
import type { GeneralizedCompressionBuildOptions } from "../davis/generalizedCompression";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeActionCertificate,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import type { GenericCompactExpensiveStageBounds } from "./genericCompactExpensiveStage";
import {
  computeGenericSparseModularRankCertificateDigest,
  type GenericSparseModularRankBudgets,
  type GenericSparseModularRankCertificate,
} from "./genericSparseModularRank";
import {
  prepareGenericStreamedH1,
  type GenericStreamedH1Preparation,
  type GenericStreamedH1PreparationCertificate,
} from "./genericStreamedH1Preparation";
import type { ScalableIntegralH1CompletionBudgets } from "./scalableGenericH1Completion";
import {
  computeScalableGenericActionH1IntegralKernelWitnessDigest,
  type ScalableGenericActionH1BuildInput,
  type ScalableGenericActionH1IntegralKernelWitness,
  type ScalableGenericActionH1TorsionFreeReplayBudgets,
} from "./scalableGenericActionH1";
import {
  buildScalableFullH1TrackBPipeline,
  type ScalableFullH1TrackBPipelineCertificate,
  type ScalableFullH1TrackBPipelineOptions,
} from "./scalableFullH1TrackBPipeline";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";

export type SerializableGeneralizedCompressionOptions = Pick<
  GeneralizedCompressionBuildOptions,
  | "rootHashChunkSize"
  | "fiberHashChunkSize"
  | "faceHashChunkSize"
  | "sourceQuotientVertexIds"
>;

export interface ScalableFullH1TrackBJsonOptions {
  rankReplayBudgets?: GenericSparseModularRankBudgets;
  torsionFreeReplayBudgets?: ScalableGenericActionH1TorsionFreeReplayBudgets;
  completionBudgets?: ScalableIntegralH1CompletionBudgets;
  generalizedCompressionOptions?: SerializableGeneralizedCompressionOptions;
  expensiveStageBounds?: GenericCompactExpensiveStageBounds;
}

/** Complete callback-free input. Every field survives an exact JSON round trip. */
export interface ScalableFullH1TrackBJsonInput {
  schemaVersion: 1;
  kind: "scalable-full-h1-track-b-json-input";
  system: CoxeterSystemInput;
  actionCandidate: TorsionFreeActionCandidate;
  modularRankCertificate: GenericSparseModularRankCertificate;
  integralKernelWitness: ScalableGenericActionH1IntegralKernelWitness;
  runCheapScreen: boolean;
  options: ScalableFullH1TrackBJsonOptions;
  inputDigest: string;
}

export interface ScalableFullH1TrackBJsonInputReplay {
  schemaVersion: 1;
  kind: "scalable-full-h1-track-b-json-input-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    exactJsonValue: boolean;
    inputDigestValid: boolean;
    modularRankCertificateDigestValid: boolean;
    integralKernelWitnessDigestValid: boolean;
    systemParsed: boolean;
    torsionFreeActionIndependentlyCertified: boolean;
    oracleReconstructed: boolean;
    preparationReconstructed: boolean;
  };
  source?: {
    systemCanonicalSha256: string;
    candidateId: string;
    degree: number;
    generatorCount: number;
    actionRowsCanonicalSha256: string;
    torsionFreeCertificateDigest: string;
    oracleStructureHash: string;
    preparationDigest: string;
    modularRankCertificateDigest: string;
    integralKernelWitnessDigest: string;
  };
  errors: string[];
  replayDigest: string;
}

/**
 * Schema 2: the adapter records the pipeline it built from the replayed
 * JSON input; the pipeline itself is replayed independently by
 * replayScalableFullH1TrackBJsonCertificate, not inside the build.
 */
export interface ScalableFullH1TrackBJsonCertificate {
  schemaVersion: 2;
  kind: "scalable-full-h1-track-b-json-certificate";
  status: ScalableFullH1TrackBPipelineCertificate["status"];
  method: "callback-free-json-action-reconstruction-and-pipeline-build";
  input: ScalableFullH1TrackBJsonInput;
  inputReplay: ScalableFullH1TrackBJsonInputReplay;
  reconstruction: {
    torsionFreeCertificate: TorsionFreeActionCertificate;
    oracle: {
      structureHash: string;
      actionRowsCanonicalSha256: string;
      degree: number;
      generatorCount: number;
      geometricEdgeCount: number;
      rankTwoCellCount: number;
    };
    preparationCertificate: GenericStreamedH1PreparationCertificate;
  };
  pipeline: ScalableFullH1TrackBPipelineCertificate;
  checks: {
    inputReplayPassed: boolean;
    independentTorsionFreeCertificatePassed: boolean;
    oracleBoundToRawAction: boolean;
    preparationBoundToOracle: boolean;
    noCallerCallbacksRequired: true;
    allClaimedChecksPassed: boolean;
  };
  nonClaims: string[];
  certificateDigest: string;
}

export interface ScalableFullH1TrackBJsonCertificateReplay {
  schemaVersion: 1;
  kind: "scalable-full-h1-track-b-json-certificate-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    storedCertificateDigestValid: boolean;
    embeddedInputReplayPassed: boolean;
    exactCallbackFreeRebuildMatches: boolean;
  };
  rebuiltCertificateDigest?: string;
  errors: string[];
  replayDigest: string;
}

interface Reconstruction {
  input: ScalableFullH1TrackBJsonInput;
  system: CoxeterSystemInput;
  accepted: TorsionFreeCandidateResult;
  oracle: StreamedLawfulDavisOracle;
  preparation: GenericStreamedH1Preparation;
  replay: ScalableFullH1TrackBJsonInputReplay;
}

const INPUT_KEYS = [
  "schemaVersion",
  "kind",
  "system",
  "actionCandidate",
  "modularRankCertificate",
  "integralKernelWitness",
  "runCheapScreen",
  "options",
  "inputDigest",
] as const;

const OPTION_KEYS = [
  "rankReplayBudgets",
  "torsionFreeReplayBudgets",
  "completionBudgets",
  "generalizedCompressionOptions",
  "expensiveStageBounds",
] as const;

const GENERALIZED_COMPRESSION_OPTION_KEYS = [
  "rootHashChunkSize",
  "fiberHashChunkSize",
  "faceHashChunkSize",
  "sourceQuotientVertexIds",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function assertAllowedKeys(
  value: unknown,
  label: string,
  allowed: readonly string[],
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `${label} has unsupported keys: ${unknown.sort().join(", ")}.`,
    );
  }
}

function assertExactJsonValue(
  value: unknown,
  path = "$",
  ancestors = new Set<object>(),
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(`${path} is not a finite JSON number.`);
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${path} contains non-JSON value type ${typeof value}.`);
  }
  if (ancestors.has(value)) throw new Error(`${path} contains a JSON cycle.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertExactJsonValue(entry, `${path}[${index}]`, ancestors),
    );
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} is not a plain JSON object.`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw new Error(`${path} has a non-string JSON key.`);
      }
      assertExactJsonValue(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        ancestors,
      );
    }
  }
  ancestors.delete(value);
}

function jsonClone<T>(value: T): T {
  assertExactJsonValue(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function omitKey(
  value: Record<string, unknown>,
  omitted: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omitted),
  );
}

function inputPayload(
  input: ScalableFullH1TrackBJsonInput,
): Omit<ScalableFullH1TrackBJsonInput, "inputDigest"> {
  return omitKey(
    input as unknown as Record<string, unknown>,
    "inputDigest",
  ) as Omit<ScalableFullH1TrackBJsonInput, "inputDigest">;
}

export function computeScalableFullH1TrackBJsonInputDigest(
  input: ScalableFullH1TrackBJsonInput,
): string {
  return canonicalSha256(inputPayload(input));
}

function certificatePayload(
  certificate: ScalableFullH1TrackBJsonCertificate,
): Omit<ScalableFullH1TrackBJsonCertificate, "certificateDigest"> {
  return omitKey(
    certificate as unknown as Record<string, unknown>,
    "certificateDigest",
  ) as Omit<ScalableFullH1TrackBJsonCertificate, "certificateDigest">;
}

export function computeScalableFullH1TrackBJsonCertificateDigest(
  certificate: ScalableFullH1TrackBJsonCertificate,
): string {
  return canonicalSha256(certificatePayload(certificate));
}

function validateOptionEnvelope(options: unknown): void {
  assertAllowedKeys(options, "JSON Track-B options", OPTION_KEYS);
  const generalized = options.generalizedCompressionOptions;
  if (generalized !== undefined) {
    assertAllowedKeys(
      generalized,
      "JSON generalized-compression options",
      GENERALIZED_COMPRESSION_OPTION_KEYS,
    );
  }
  for (const key of OPTION_KEYS) {
    const value = options[key];
    if (value !== undefined && !isRecord(value)) {
      throw new Error(`JSON Track-B option ${key} must be an object.`);
    }
  }
}

function validateJsonInput(stored: unknown): ScalableFullH1TrackBJsonInput {
  assertExactJsonValue(stored);
  assertAllowedKeys(stored, "Scalable full-H1 Track-B JSON input", INPUT_KEYS);
  if (
    stored.schemaVersion !== 1 ||
    stored.kind !== "scalable-full-h1-track-b-json-input"
  ) {
    throw new Error(
      "The scalable full-H1 Track-B JSON input envelope is unsupported.",
    );
  }
  if (typeof stored.runCheapScreen !== "boolean") {
    throw new Error("runCheapScreen must be a JSON boolean.");
  }
  if (typeof stored.inputDigest !== "string") {
    throw new Error("The scalable full-H1 Track-B JSON input has no digest.");
  }
  validateOptionEnvelope(stored.options);
  const input = stored as unknown as ScalableFullH1TrackBJsonInput;
  if (input.inputDigest !== computeScalableFullH1TrackBJsonInputDigest(input)) {
    throw new Error(
      "The scalable full-H1 Track-B JSON input digest is invalid.",
    );
  }
  return jsonClone(input);
}

export function sealScalableFullH1TrackBJsonInput(
  payload: Omit<ScalableFullH1TrackBJsonInput, "inputDigest">,
): ScalableFullH1TrackBJsonInput {
  assertExactJsonValue(payload);
  assertAllowedKeys(
    payload,
    "Scalable full-H1 Track-B JSON input payload",
    INPUT_KEYS.filter((key) => key !== "inputDigest"),
  );
  validateOptionEnvelope(payload.options);
  const cloned = jsonClone(payload);
  const input = { ...cloned, inputDigest: canonicalSha256(cloned) };
  return validateJsonInput(input);
}

function inputReplayPayload(
  replay: Omit<ScalableFullH1TrackBJsonInputReplay, "replayDigest">,
): ScalableFullH1TrackBJsonInputReplay {
  return { ...replay, replayDigest: canonicalSha256(replay) };
}

function reconstructJsonInput(stored: unknown): {
  reconstruction?: Reconstruction;
  replay: ScalableFullH1TrackBJsonInputReplay;
} {
  const checks: ScalableFullH1TrackBJsonInputReplay["checks"] = {
    envelopeRecognized: false,
    exactJsonValue: false,
    inputDigestValid: false,
    modularRankCertificateDigestValid: false,
    integralKernelWitnessDigestValid: false,
    systemParsed: false,
    torsionFreeActionIndependentlyCertified: false,
    oracleReconstructed: false,
    preparationReconstructed: false,
  };
  const errors: string[] = [];
  try {
    assertExactJsonValue(stored);
    checks.exactJsonValue = true;
    if (isRecord(stored)) {
      checks.envelopeRecognized =
        stored.schemaVersion === 1 &&
        stored.kind === "scalable-full-h1-track-b-json-input";
    }
    const input = validateJsonInput(stored);
    checks.inputDigestValid = true;
    checks.modularRankCertificateDigestValid =
      input.modularRankCertificate.certificateDigest ===
      computeGenericSparseModularRankCertificateDigest(
        input.modularRankCertificate,
      );
    if (!checks.modularRankCertificateDigestValid) {
      throw new Error("The modular-rank certificate digest is invalid.");
    }
    checks.integralKernelWitnessDigestValid =
      input.integralKernelWitness.witnessDigest ===
      computeScalableGenericActionH1IntegralKernelWitnessDigest(
        input.integralKernelWitness,
      );
    if (!checks.integralKernelWitnessDigestValid) {
      throw new Error("The integral-kernel witness digest is invalid.");
    }

    const system = parseCoxeterSystemInput(input.system);
    checks.systemParsed = true;
    const torsionBudgets = input.options.torsionFreeReplayBudgets ?? {};
    const sphericalPlan = planSphericalSpecialSubgroups(system, {
      maxRankForExhaustiveEnumeration:
        torsionBudgets.maxRankForExhaustiveEnumeration,
      maxSubsetsToCheck: torsionBudgets.maxSubsetsToCheck,
    });
    const torsionFreeCertificate = certifyTorsionFreeAction(
      system,
      input.actionCandidate,
      sphericalPlan,
      {
        maxSphericalSubgroupElements:
          torsionBudgets.maxSphericalSubgroupElements,
        maxWitnesses: torsionBudgets.maxWitnesses,
      },
    );
    checks.torsionFreeActionIndependentlyCertified =
      torsionFreeCertificate.status === "passed";
    if (!checks.torsionFreeActionIndependentlyCertified) {
      throw new Error(
        `Independent torsion-free certification failed: ${torsionFreeCertificate.errors.join(" ")}`,
      );
    }
    const accepted = {
      candidate: input.actionCandidate,
      certificate: torsionFreeCertificate,
    };
    const oracle = buildStreamedLawfulDavisOracle({
      system,
      generatorImages: input.actionCandidate.generatorImages,
    });
    checks.oracleReconstructed = true;
    const preparation = prepareGenericStreamedH1(oracle);
    checks.preparationReconstructed = true;
    const source: NonNullable<ScalableFullH1TrackBJsonInputReplay["source"]> = {
      systemCanonicalSha256: canonicalSha256(system),
      candidateId: input.actionCandidate.id,
      degree: oracle.degree,
      generatorCount: oracle.generatorCount,
      actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
      torsionFreeCertificateDigest: canonicalSha256(torsionFreeCertificate),
      oracleStructureHash: oracle.structureHash,
      preparationDigest: preparation.certificate.preparationDigest,
      modularRankCertificateDigest:
        input.modularRankCertificate.certificateDigest,
      integralKernelWitnessDigest: input.integralKernelWitness.witnessDigest,
    };
    const replay = inputReplayPayload({
      schemaVersion: 1,
      kind: "scalable-full-h1-track-b-json-input-replay",
      status: "passed",
      checks,
      source,
      errors: [],
    });
    return {
      reconstruction: {
        input,
        system,
        accepted,
        oracle,
        preparation,
        replay,
      },
      replay,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return {
    replay: inputReplayPayload({
      schemaVersion: 1,
      kind: "scalable-full-h1-track-b-json-input-replay",
      status: "failed",
      checks,
      errors: uniqueSorted(errors),
    }),
  };
}

export function replayScalableFullH1TrackBJsonInput(
  stored: unknown,
): ScalableFullH1TrackBJsonInputReplay {
  return reconstructJsonInput(stored).replay;
}

function pipelineOptions(
  reconstruction: Reconstruction,
): ScalableFullH1TrackBPipelineOptions {
  const { input, oracle, accepted, preparation } = reconstruction;
  const h1Input: ScalableGenericActionH1BuildInput = {
    oracle,
    accepted,
    preparation,
    modularRankCertificate: input.modularRankCertificate,
    integralKernelWitness: input.integralKernelWitness,
    ...(input.options.rankReplayBudgets
      ? { rankReplayBudgets: input.options.rankReplayBudgets }
      : {}),
    ...(input.options.torsionFreeReplayBudgets
      ? {
          torsionFreeReplayBudgets: input.options.torsionFreeReplayBudgets,
        }
      : {}),
    ...(input.options.completionBudgets
      ? { completionBudgets: input.options.completionBudgets }
      : {}),
  };
  return {
    h1Input,
    runCheapScreen: input.runCheapScreen,
    ...(input.options.generalizedCompressionOptions
      ? {
          generalizedCompressionOptions:
            input.options.generalizedCompressionOptions,
        }
      : {}),
    ...(input.options.expensiveStageBounds
      ? { expensiveStageBounds: input.options.expensiveStageBounds }
      : {}),
  };
}

export function buildScalableFullH1TrackBJsonCertificate(
  storedInput: unknown,
): ScalableFullH1TrackBJsonCertificate {
  const reconstructed = reconstructJsonInput(storedInput);
  if (
    !reconstructed.reconstruction ||
    reconstructed.replay.status !== "passed"
  ) {
    throw new Error(
      `The callback-free Track-B input did not replay: ${reconstructed.replay.errors.join(" ")}`,
    );
  }
  const runtime = reconstructed.reconstruction;
  const options = pipelineOptions(runtime);
  const pipeline = buildScalableFullH1TrackBPipeline(options);
  const checks: ScalableFullH1TrackBJsonCertificate["checks"] = {
    inputReplayPassed: runtime.replay.status === "passed",
    independentTorsionFreeCertificatePassed:
      runtime.accepted.certificate.status === "passed",
    oracleBoundToRawAction:
      runtime.oracle.actionRowsCanonicalSha256 ===
      pipeline.source.actionRowsCanonicalSha256,
    preparationBoundToOracle:
      runtime.preparation.certificate.source.oracleStructureHash ===
      runtime.oracle.structureHash,
    noCallerCallbacksRequired: true,
    allClaimedChecksPassed: false,
  };
  checks.allClaimedChecksPassed = Object.entries(checks)
    .filter(([name]) => name !== "allClaimedChecksPassed")
    .every(([, passed]) => passed);
  if (!checks.allClaimedChecksPassed) {
    throw new Error(
      "The callback-free Track-B adapter failed an internal replay gate.",
    );
  }
  const payload: Omit<
    ScalableFullH1TrackBJsonCertificate,
    "certificateDigest"
  > = {
    schemaVersion: 2,
    kind: "scalable-full-h1-track-b-json-certificate",
    status: pipeline.status,
    method: "callback-free-json-action-reconstruction-and-pipeline-build",
    input: runtime.input,
    inputReplay: runtime.replay,
    reconstruction: {
      torsionFreeCertificate: runtime.accepted.certificate,
      oracle: {
        structureHash: runtime.oracle.structureHash,
        actionRowsCanonicalSha256: runtime.oracle.actionRowsCanonicalSha256,
        degree: runtime.oracle.degree,
        generatorCount: runtime.oracle.generatorCount,
        geometricEdgeCount: runtime.oracle.geometricEdgeCount,
        rankTwoCellCount: runtime.oracle.rankTwoCellCount,
      },
      preparationCertificate: runtime.preparation.certificate,
    },
    pipeline,
    checks,
    nonClaims: [
      "The JSON adapter reconstructs runtime row streams internally; it does not serialize or trust callback implementations.",
      "Its mathematical claims are exactly those of the embedded scalable full-H1 Track-B pipeline certificate.",
      "A failed input replay or resource stop is not a nonfibering theorem.",
    ],
  };
  const certificate = {
    ...payload,
    certificateDigest: canonicalSha256(payload),
  };
  return jsonClone(certificate);
}

export function replayScalableFullH1TrackBJsonCertificate(
  storedInput: unknown,
): ScalableFullH1TrackBJsonCertificateReplay {
  const checks: ScalableFullH1TrackBJsonCertificateReplay["checks"] = {
    envelopeRecognized: false,
    storedCertificateDigestValid: false,
    embeddedInputReplayPassed: false,
    exactCallbackFreeRebuildMatches: false,
  };
  const errors: string[] = [];
  let rebuiltCertificateDigest: string | undefined;
  try {
    assertExactJsonValue(storedInput);
    if (!isRecord(storedInput)) {
      throw new Error(
        "The callback-free Track-B certificate is not an object.",
      );
    }
    const stored =
      storedInput as unknown as ScalableFullH1TrackBJsonCertificate;
    checks.envelopeRecognized =
      stored.schemaVersion === 2 &&
      stored.kind === "scalable-full-h1-track-b-json-certificate" &&
      stored.method ===
        "callback-free-json-action-reconstruction-and-pipeline-build";
    checks.storedCertificateDigestValid =
      typeof stored.certificateDigest === "string" &&
      stored.certificateDigest ===
        computeScalableFullH1TrackBJsonCertificateDigest(stored);
    checks.embeddedInputReplayPassed =
      replayScalableFullH1TrackBJsonInput(stored.input).status === "passed";
    if (
      !checks.envelopeRecognized ||
      !checks.storedCertificateDigestValid ||
      !checks.embeddedInputReplayPassed
    ) {
      throw new Error(
        "The callback-free Track-B certificate envelope, digest, or embedded input is invalid.",
      );
    }
    const rebuilt = buildScalableFullH1TrackBJsonCertificate(stored.input);
    rebuiltCertificateDigest = rebuilt.certificateDigest;
    checks.exactCallbackFreeRebuildMatches =
      canonicalSha256(rebuilt) === canonicalSha256(stored);
    if (!checks.exactCallbackFreeRebuildMatches) {
      errors.push(
        "The stored callback-free Track-B certificate differs from its exact JSON-input rebuild.",
      );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const payload = {
    schemaVersion: 1 as const,
    kind: "scalable-full-h1-track-b-json-certificate-replay" as const,
    status:
      errors.length === 0 && Object.values(checks).every(Boolean)
        ? ("passed" as const)
        : ("failed" as const),
    checks,
    ...(rebuiltCertificateDigest ? { rebuiltCertificateDigest } : {}),
    errors: uniqueSorted(errors),
  };
  return { ...payload, replayDigest: canonicalSha256(payload) };
}
