import { buildCoverCompression } from "../compression";
import { parseCoxeterSystemInput } from "../coxeter";
import {
  buildGeneralizedCompressionCertificate,
  type GeneralizedCompressionBuildOptions,
  type GeneralizedCompressionCertificate,
} from "../davis/generalizedCompression";
import {
  acceptedActionToQuotientComplex,
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  createWallCoorientation,
  findWallSystem,
  type OrientationSign,
} from "../walls";
import {
  certifyExactIntegralCocycleSection,
  computeExactCheapScreenActionBindingDigest,
  type ExactCheapScreenActionBinding,
  type ExactIntegralCocycleSectionCertificate,
} from "./exactCompactActionCheapScreen";
import {
  buildScalableFullH1TrackBJsonCertificate,
  replayScalableFullH1TrackBJsonCertificate,
  type ScalableFullH1TrackBJsonCertificate,
  type ScalableFullH1TrackBJsonInput,
} from "./scalableFullH1TrackBJson";
import {
  buildScalableFullH1TrackBPipeline,
  replayScalableFullH1TrackBPipeline,
  type ScalableFullH1TrackBPipelineCertificate,
  type ScalableFullH1TrackBPipelineOptions,
  type ScalableFullH1TrackBPipelineOutcome,
} from "./scalableFullH1TrackBPipeline";
import {
  certifyPrimitiveSchreierHomomorphism,
  type PrimitiveSchreierHomomorphismCertificate,
} from "./schreierHomomorphism";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedLawfulDavisOracle,
  type StreamedWallSignCandidate,
} from "./streamedLawfulDavis";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  buildStreamedTrackBCertificate,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBCertificate,
  type StreamedTrackBOptions,
} from "./streamedTrackB";
import type { WallHomomorphismFiniteCertificate } from "./types";
import { certifyWallHomomorphismFiniteData } from "./wallHomomorphism";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

export interface CompactDirectWallCharacterInput {
  branch: "direct-rank-one";
  system: unknown;
  accepted: TorsionFreeCandidateResult;
  source: {
    id: string;
    /** A complete sign map in the streamed oracle's stable wall ids. */
    wallSigns: Readonly<Record<string, OrientationSign>>;
  };
  generalizedCompressionOptions?: GeneralizedCompressionBuildOptions;
  trackB?: Pick<StreamedTrackBOptions, "linkScan" | "maxLinkWitnesses">;
}

export interface CompactScalableFullH1LegacyProofInput {
  branch: "scalable-full-h1";
  options: ScalableFullH1TrackBPipelineOptions;
  jsonInput?: never;
}

export interface CompactScalableFullH1JsonProofInput {
  branch: "scalable-full-h1";
  options?: never;
  jsonInput: ScalableFullH1TrackBJsonInput;
}

export type CompactScalableFullH1ProofInput =
  | CompactScalableFullH1LegacyProofInput
  | CompactScalableFullH1JsonProofInput;

export type CompactActionProofBranchInput =
  | CompactDirectWallCharacterInput
  | CompactScalableFullH1ProofInput;

export interface CompactDirectRankOneProof {
  sourceKind: "cooriented-wall-rank-one-integral-cocycle";
  sourceId: string;
  sourceDigest: string;
  actionBinding: ExactCheapScreenActionBinding;
  cocycleSection: ExactIntegralCocycleSectionCertificate;
  wallHomomorphism: WallHomomorphismFiniteCertificate;
  schreierCharacter: PrimitiveSchreierHomomorphismCertificate;
  generalizedCompression: {
    certificate: GeneralizedCompressionCertificate;
  };
  trackB: {
    model: "canonical-global-point-order-pulling-with-zero-periodic-potential";
    requestedLinkScan: "exhaustive" | "stop-on-first-failure";
    polarities: Record<
      "-1" | "1",
      {
        certificate: StreamedTrackBCertificate;
      }
    >;
    passingPolarities: Array<-1 | 1>;
    exhaustiveObstructedPolarities: Array<-1 | 1>;
    outcome:
      | "finite-generation-certified"
      | "fixed-canonical-model-obstructed"
      | "not-established";
    trackBDigest: string;
  };
  checks: {
    sourceWallIdsComplete: boolean;
    wallSystemTwoSided: boolean;
    coorientationValid: boolean;
    cocycleDigestBound: boolean;
    directedEdgesAntisymmetric: boolean;
    everyRankTwoBoundaryClosed: boolean;
    wallFiniteDataPassed: boolean;
    schreierCharacterPassed: boolean;
    positivePeriodGcd: boolean;
    periodGcdAgreesWithCellularCertificate: boolean;
    normalizedBezoutIdentityVerified: boolean;
    primitiveAfterNormalization: boolean;
    allSourceChecksPassed: boolean;
  };
}

export type CompactActionProofBranchOutcome =
  | "direct-rank-one-source-rejected"
  | "direct-rank-one-finite-generation-certified"
  | "direct-rank-one-fixed-canonical-model-obstructed"
  | "direct-rank-one-track-b-not-established"
  | ScalableFullH1TrackBPipelineOutcome;

/**
 * Schema 2: the scalable branch embeds the pipeline it built; the pipeline
 * is replayed by replayCompactActionProofBranch, not inside the build.
 */
export interface CompactActionProofBranchCertificate {
  schemaVersion: 2;
  kind: "compact-action-proof-branch-certificate";
  branch: "direct-rank-one" | "scalable-full-h1";
  status: "passed" | "not-found" | "incomplete" | "failed";
  outcome: CompactActionProofBranchOutcome;
  source: {
    systemCanonicalSha256: string;
    candidateId: string;
    degree: number;
    generatorCount: number;
    actionRowsCanonicalSha256: string;
    torsionFreeCertificateDigest: string;
  };
  direct?: CompactDirectRankOneProof;
  scalableFullH1?: {
    pipeline: ScalableFullH1TrackBPipelineCertificate;
    /** Present exactly for a callback-free JSON-input build. */
    jsonAdapter?: ScalableFullH1TrackBJsonCertificate;
  };
  checks: {
    exactActionBound: boolean;
    proofSourceReplayed: boolean;
    proofSourcePassed: boolean;
  };
  claims: string[];
  nonClaims: string[];
  errors: string[];
  certificateDigest: string;
}

export interface CompactActionProofBranchReplay {
  schemaVersion: 2;
  kind: "compact-action-proof-branch-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    storedCertificateDigestValid: boolean;
    inputBranchMatches: boolean;
    /**
     * Direct branch: the stored Track-B digest is consistent (its
     * compression and polarities are replayed by the exact rebuild).
     * Scalable branch: the embedded pipeline or JSON adapter replayed.
     */
    nestedProofChecked: boolean;
    exactActionRootedRebuildMatches: boolean;
  };
  rebuiltCertificateDigest?: string;
  errors: string[];
  replayDigest: string;
}

export interface PreparedCompactDirectRankOneSource {
  oracle: StreamedLawfulDavisOracle;
  actionBinding: ExactCheapScreenActionBinding;
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
  certificate: CompactActionProofBranchCertificate;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function actionBinding(
  accepted: TorsionFreeCandidateResult,
  oracle: StreamedLawfulDavisOracle,
): ExactCheapScreenActionBinding {
  const withoutDigest: Omit<ExactCheapScreenActionBinding, "bindingDigest"> = {
    schemaVersion: 1,
    kind: "exact-finite-coxeter-permutation-action-binding",
    status: "passed",
    upstreamCertificateKind: accepted.certificate.method,
    upstreamCertificateDigest: canonicalSha256(accepted.certificate),
    degree: oracle.degree,
    generatorCount: oracle.generatorCount,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    checks: {
      exactPermutationActionVerified: true,
      coxeterRelationsVerified: true,
      torsionFreeVerified: true,
    },
  };
  const binding = { ...withoutDigest, bindingDigest: "" };
  binding.bindingDigest = computeExactCheapScreenActionBindingDigest(binding);
  return binding;
}

function rankOneWallCocycleBasis(
  oracle: StreamedLawfulDavisOracle,
  candidate: StreamedWallSignCandidate,
  sourceDigest: string,
): StreamedTrackBIntegralCocycleBasis {
  const evaluation = oracle.bindCoorientations([candidate]);
  const coordinateIds = [`wall-character:${candidate.id}`];
  const edgeCoordinatePairs = (point: number, generator: number) =>
    [[0, evaluation.edgeIncrement(point, generator, 0)]] as const;
  const expectedCocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(oracle, {
      coordinateIds,
      edgeCoordinatePairs,
    });
  return {
    coordinateIds,
    latticeBasisDigest: sourceDigest,
    expectedCocycleSectionDigest,
    edgeCoordinatePairs,
  };
}

function certificateDigestPayload(
  certificate: CompactActionProofBranchCertificate,
): Omit<CompactActionProofBranchCertificate, "certificateDigest"> {
  const { certificateDigest: _digest, ...payload } = certificate;
  void _digest;
  return payload;
}

export function computeCompactActionProofBranchDigest(
  certificate: CompactActionProofBranchCertificate,
): string {
  return canonicalSha256(certificateDigestPayload(certificate));
}

function seal(
  payload: Omit<CompactActionProofBranchCertificate, "certificateDigest">,
): CompactActionProofBranchCertificate {
  const certificate = { ...payload, certificateDigest: "" };
  certificate.certificateDigest =
    computeCompactActionProofBranchDigest(certificate);
  return certificate;
}

function scalableInputForm(
  input: CompactScalableFullH1ProofInput,
): "legacy-runtime-options" | "callback-free-json-input" {
  const hasRuntimeOptions = input.options !== undefined;
  const hasJsonInput = input.jsonInput !== undefined;
  if (hasRuntimeOptions === hasJsonInput) {
    throw new Error(
      "The scalable proof branch requires exactly one of options or jsonInput.",
    );
  }
  return hasJsonInput ? "callback-free-json-input" : "legacy-runtime-options";
}

/**
 * Rebuild a wall-derived rank-one cocycle and its fixed-character Track B run.
 *
 * The returned runtime basis can be passed directly to the exact cheap-screen
 * executor. The serialized certificate contains the generalized compression
 * and the full-K calculation for both offset polarities, each built once;
 * replayCompactActionProofBranch rebuilds them independently.
 */
export function prepareCompactDirectRankOneSource(
  input: CompactDirectWallCharacterInput,
): PreparedCompactDirectRankOneSource {
  if (!input.source.id) throw new Error("A direct source id is required.");
  const system = parseCoxeterSystemInput(input.system);
  const sphericalPlan = planSphericalSpecialSubgroups(system);
  if (sphericalPlan.status !== "complete") {
    throw new Error("The direct branch requires a complete spherical plan.");
  }
  const replayedActionCertificate = certifyTorsionFreeAction(
    system,
    input.accepted.candidate,
    sphericalPlan,
  );
  const suppliedActionDigest = canonicalSha256(input.accepted.certificate);
  const replayedActionDigest = canonicalSha256(replayedActionCertificate);
  if (
    replayedActionCertificate.status !== "passed" ||
    input.accepted.certificate.status !== "passed" ||
    suppliedActionDigest !== replayedActionDigest
  ) {
    throw new Error(
      "The direct branch requires an exact, independently replayed torsion-free action certificate.",
    );
  }
  const accepted = {
    candidate: input.accepted.candidate,
    certificate: replayedActionCertificate,
  };
  const oracle = buildStreamedLawfulDavisOracle({
    system,
    generatorImages: accepted.candidate.generatorImages,
  });
  const quotient = acceptedActionToQuotientComplex(system, accepted);
  const cover = buildCoverCompression(quotient);
  const wallSystem = findWallSystem(cover.barX);
  const coorientation = createWallCoorientation(
    wallSystem,
    input.source.wallSigns,
  );
  const wallHomomorphism = certifyWallHomomorphismFiniteData(
    cover.barX,
    wallSystem,
    coorientation,
  );
  const schreierCharacter = certifyPrimitiveSchreierHomomorphism({
    quotient,
    cover,
    finiteWallCertificate: wallHomomorphism,
  });
  const sortedWallSigns = Object.fromEntries(
    Object.entries(input.source.wallSigns).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
  const sourceDigest = canonicalSha256({
    schemaVersion: 1,
    method: "action-rooted-cooriented-wall-rank-one-cocycle",
    systemCanonicalSha256: canonicalSha256(system),
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    wallStructureHash: oracle.walls.structureHash,
    sourceId: input.source.id,
    wallSigns: sortedWallSigns,
  });
  const wallCandidate: StreamedWallSignCandidate = {
    id: input.source.id,
    wallSigns: input.source.wallSigns,
  };
  const cocycleBasis = rankOneWallCocycleBasis(
    oracle,
    wallCandidate,
    sourceDigest,
  );
  const cocycleSection = certifyExactIntegralCocycleSection({
    oracle,
    cocycleBasis,
  });
  const binding = actionBinding(accepted, oracle);
  const generalizedCompressionOptions: GeneralizedCompressionBuildOptions = {
    ...input.generalizedCompressionOptions,
    sourceQuotientVertexIds:
      input.generalizedCompressionOptions?.sourceQuotientVertexIds ??
      quotient.vertices.map((vertex) => vertex.id),
    coverCompression:
      input.generalizedCompressionOptions?.coverCompression ?? cover,
  };
  const generalizedCompressionCertificate =
    buildGeneralizedCompressionCertificate(
      system,
      accepted,
      generalizedCompressionOptions,
    );
  const requestedLinkScan = input.trackB?.linkScan ?? "exhaustive";
  const trackBReplayOptions = {
    ...(generalizedCompressionOptions.sourceQuotientVertexIds
      ? {
          sourceQuotientVertexIds:
            generalizedCompressionOptions.sourceQuotientVertexIds,
        }
      : {}),
    ...(generalizedCompressionOptions.coverCompression
      ? { coverCompression: generalizedCompressionOptions.coverCompression }
      : {}),
  };
  const polarityRecords = Object.fromEntries(
    ([-1, 1] as const).map((offsetPolarity) => {
      const options: StreamedTrackBOptions = {
        oracle,
        candidate: wallCandidate,
        generalizedCompression: generalizedCompressionCertificate,
        generalizedCompressionReplayOptions: trackBReplayOptions,
        offsetPolarity,
        linkScan: requestedLinkScan,
        ...(input.trackB?.maxLinkWitnesses === undefined
          ? {}
          : { maxLinkWitnesses: input.trackB.maxLinkWitnesses }),
      };
      const certificate = buildStreamedTrackBCertificate(options);
      return [String(offsetPolarity), { certificate }] as const;
    }),
  ) as CompactDirectRankOneProof["trackB"]["polarities"];
  const passingPolarities = ([-1, 1] as const).filter((polarity) => {
    const record = polarityRecords[String(polarity) as "-1" | "1"];
    return (
      record.certificate.status === "passed" &&
      record.certificate.conclusion === "finite-generation-certified"
    );
  });
  const exhaustiveObstructedPolarities = ([-1, 1] as const).filter(
    (polarity) => {
      const record = polarityRecords[String(polarity) as "-1" | "1"];
      return (
        record.certificate.conclusion === "morse-link-condition-failed" &&
        record.certificate.directedLinks.scanMode === "exhaustive" &&
        record.certificate.directedLinks.checks.everyQuotientVertexChecked &&
        record.certificate.character.status === "passed" &&
        record.certificate.height.status === "passed" &&
        Object.values(record.certificate.fullK.checks).every(Boolean)
      );
    },
  );
  const trackBOutcome: CompactDirectRankOneProof["trackB"]["outcome"] =
    passingPolarities.length > 0
      ? "finite-generation-certified"
      : exhaustiveObstructedPolarities.length === 2
        ? "fixed-canonical-model-obstructed"
        : "not-established";
  const trackBWithoutDigest = {
    model:
      "canonical-global-point-order-pulling-with-zero-periodic-potential" as const,
    requestedLinkScan,
    polarities: polarityRecords,
    passingPolarities,
    exhaustiveObstructedPolarities,
    outcome: trackBOutcome,
  };
  const trackB: CompactDirectRankOneProof["trackB"] = {
    ...trackBWithoutDigest,
    trackBDigest: canonicalSha256(trackBWithoutDigest),
  };
  const suppliedWallIds = Object.keys(input.source.wallSigns).sort();
  const expectedWallIds = oracle.walls.walls.map((wall) => wall.id).sort();
  const sourceWallIdsComplete =
    canonicalSha256(suppliedWallIds) === canonicalSha256(expectedWallIds);
  const normalizedBezout = schreierCharacter.normalizedBezoutIdentity;
  const checks: CompactDirectRankOneProof["checks"] = {
    sourceWallIdsComplete,
    wallSystemTwoSided:
      wallSystem.diagnostics.twoSided && oracle.walls.twoSided,
    coorientationValid: coorientation.valid,
    cocycleDigestBound:
      cocycleSection.source.expectedCocycleSectionDigest ===
        cocycleSection.source.cocycleSectionDigest &&
      cocycleSection.source.cocycleSectionDigest ===
        cocycleBasis.expectedCocycleSectionDigest,
    directedEdgesAntisymmetric:
      cocycleSection.checks.directedEdgesAntisymmetric,
    everyRankTwoBoundaryClosed:
      cocycleSection.checks.everyRankTwoBoundaryClosed,
    wallFiniteDataPassed: wallHomomorphism.finiteChecksPassed,
    schreierCharacterPassed: schreierCharacter.status === "passed",
    positivePeriodGcd: (schreierCharacter.normalizationDivisor ?? 0) > 0,
    periodGcdAgreesWithCellularCertificate:
      schreierCharacter.checks.periodGcdAgreesWithCellularCertificate,
    normalizedBezoutIdentityVerified:
      normalizedBezout?.gcd === 1 &&
      normalizedBezout.verified &&
      normalizedBezout.evaluatedSum === 1,
    primitiveAfterNormalization:
      schreierCharacter.primitiveImage &&
      schreierCharacter.checks.normalizedImageIsZ,
    allSourceChecksPassed: false,
  };
  checks.allSourceChecksPassed = Object.entries(checks)
    .filter(([key]) => key !== "allSourceChecksPassed")
    .every(([, value]) => value);
  const direct: CompactDirectRankOneProof = {
    sourceKind: "cooriented-wall-rank-one-integral-cocycle",
    sourceId: input.source.id,
    sourceDigest,
    actionBinding: binding,
    cocycleSection,
    wallHomomorphism,
    schreierCharacter,
    generalizedCompression: {
      certificate: generalizedCompressionCertificate,
    },
    trackB,
    checks,
  };
  const sourcePassed = checks.allSourceChecksPassed;
  const status: CompactActionProofBranchCertificate["status"] = !sourcePassed
    ? "failed"
    : trackBOutcome === "finite-generation-certified"
      ? "passed"
      : trackBOutcome === "fixed-canonical-model-obstructed"
        ? "not-found"
        : "incomplete";
  const outcome: CompactActionProofBranchOutcome = !sourcePassed
    ? "direct-rank-one-source-rejected"
    : trackBOutcome === "finite-generation-certified"
      ? "direct-rank-one-finite-generation-certified"
      : trackBOutcome === "fixed-canonical-model-obstructed"
        ? "direct-rank-one-fixed-canonical-model-obstructed"
        : "direct-rank-one-track-b-not-established";
  const errors = uniqueSorted([
    ...coorientation.errors,
    ...schreierCharacter.errors,
    ...wallHomomorphism.cocycle.failures.map((failure) => failure.message),
  ]);
  const certificate = seal({
    schemaVersion: 2,
    kind: "compact-action-proof-branch-certificate",
    branch: "direct-rank-one",
    status,
    outcome,
    source: {
      systemCanonicalSha256: canonicalSha256(system),
      candidateId: accepted.candidate.id,
      degree: oracle.degree,
      generatorCount: oracle.generatorCount,
      actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
      torsionFreeCertificateDigest: replayedActionDigest,
    },
    direct,
    checks: {
      exactActionBound:
        binding.bindingDigest ===
        computeExactCheapScreenActionBindingDigest(binding),
      proofSourceReplayed: true,
      proofSourcePassed: sourcePassed,
    },
    claims: !sourcePassed
      ? []
      : [
          "The supplied wall coorientation defines a nonzero integral character whose normalized image is Z.",
          "The direct rank-one cocycle is exact-action-bound, antisymmetric, and closed on every rank-two relation cell.",
          ...(trackBOutcome === "finite-generation-certified"
            ? [
                "At least one offset polarity has nonempty connected ascending and descending links at every quotient vertex, so this character has finitely generated kernel.",
              ]
            : trackBOutcome === "fixed-canonical-model-obstructed"
              ? [
                  "Both offset polarities exhaustively fail a directed-link gate for this direct character and the recorded canonical full-K height model.",
                ]
              : []),
        ],
    nonClaims: [
      "The rank-one source certificate is not a computation of the full integral H1 lattice.",
      "A fixed-model obstruction concerns only this finite action, direct wall character, canonical global point-order pulling rule, zero periodic potential, and the two recorded offset polarities.",
      "No negative conclusion is made about another character, finite cover, cocycle representative, periodic potential, subdivision, or cellulation.",
      "A passing algebraic result does not assert finite presentation, a topological bundle, or a smooth fibration.",
    ],
    errors: sourcePassed ? [] : errors,
  });
  return { oracle, actionBinding: binding, cocycleBasis, certificate };
}

/** Build either proof branch without changing the underlying math engines. */
export function buildCompactActionProofBranch(
  input: CompactActionProofBranchInput,
): CompactActionProofBranchCertificate {
  if (input.branch === "direct-rank-one") {
    return prepareCompactDirectRankOneSource(input).certificate;
  }
  const inputForm = scalableInputForm(input);
  let pipeline: ScalableFullH1TrackBPipelineCertificate;
  let jsonAdapter: ScalableFullH1TrackBJsonCertificate | undefined;
  if (inputForm === "callback-free-json-input") {
    if (input.jsonInput === undefined) {
      throw new Error("The callback-free scalable proof input is missing.");
    }
    jsonAdapter = buildScalableFullH1TrackBJsonCertificate(input.jsonInput);
    pipeline = jsonAdapter.pipeline;
  } else {
    if (input.options === undefined) {
      throw new Error("The legacy scalable proof options are missing.");
    }
    pipeline = buildScalableFullH1TrackBPipeline(input.options);
  }
  return seal({
    schemaVersion: 2,
    kind: "compact-action-proof-branch-certificate",
    branch: "scalable-full-h1",
    status: pipeline.status,
    outcome: pipeline.outcome,
    source: {
      systemCanonicalSha256: pipeline.source.systemCanonicalSha256,
      candidateId: pipeline.source.candidateId,
      degree: pipeline.source.degree,
      generatorCount: pipeline.source.generatorCount,
      actionRowsCanonicalSha256: pipeline.source.actionRowsCanonicalSha256,
      torsionFreeCertificateDigest:
        pipeline.source.torsionFreeCertificateDigest,
    },
    scalableFullH1: {
      pipeline,
      ...(jsonAdapter ? { jsonAdapter } : {}),
    },
    checks: {
      exactActionBound:
        pipeline.h1.certificate.checks.actionRowsMatchOracle &&
        pipeline.promotion.checks.torsionFreeActionReplayed,
      proofSourceReplayed: true,
      proofSourcePassed: pipeline.h1.certificate.status === "passed",
    },
    claims: [...pipeline.claims],
    nonClaims: [...pipeline.nonClaims],
    errors: [...pipeline.errors],
  });
}

/** Rebuild the selected branch from its proof inputs and reject resealed edits. */
export function replayCompactActionProofBranch(
  input: CompactActionProofBranchInput,
  stored: CompactActionProofBranchCertificate,
): CompactActionProofBranchReplay {
  const errors: string[] = [];
  const envelopeRecognized =
    stored.schemaVersion === 2 &&
    stored.kind === "compact-action-proof-branch-certificate" &&
    (stored.branch === "direct-rank-one" ||
      stored.branch === "scalable-full-h1");
  if (!envelopeRecognized) errors.push("The proof-branch envelope is invalid.");
  let storedCertificateDigestValid = false;
  try {
    storedCertificateDigestValid =
      DIGEST_PATTERN.test(stored.certificateDigest) &&
      stored.certificateDigest ===
        computeCompactActionProofBranchDigest(stored);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!storedCertificateDigestValid) {
    errors.push("The stored proof-branch certificate digest is stale.");
  }
  let scalableForm:
    | "legacy-runtime-options"
    | "callback-free-json-input"
    | undefined;
  if (input.branch === "scalable-full-h1") {
    try {
      scalableForm = scalableInputForm(input);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const inputBranchMatches =
    input.branch === stored.branch &&
    (input.branch !== "scalable-full-h1" || scalableForm !== undefined);
  if (!inputBranchMatches) {
    errors.push("The replay input selects a different proof branch.");
  }
  let nestedProofChecked = false;
  if (inputBranchMatches && stored.branch === "direct-rank-one") {
    if (stored.direct) {
      const { trackBDigest, ...trackBPayload } = stored.direct.trackB;
      nestedProofChecked = trackBDigest === canonicalSha256(trackBPayload);
    }
  } else if (
    inputBranchMatches &&
    input.branch === "scalable-full-h1" &&
    stored.scalableFullH1
  ) {
    if (scalableForm === "callback-free-json-input") {
      const adapter = stored.scalableFullH1.jsonAdapter;
      if (adapter === undefined) {
        errors.push(
          "The callback-free scalable branch omitted its JSON adapter certificate.",
        );
      } else {
        const nested = replayScalableFullH1TrackBJsonCertificate(adapter);
        nestedProofChecked =
          nested.status === "passed" &&
          canonicalSha256(adapter.pipeline) ===
            canonicalSha256(stored.scalableFullH1.pipeline);
        if (!nestedProofChecked) errors.push(...nested.errors);
      }
    } else if (scalableForm === "legacy-runtime-options") {
      if (stored.scalableFullH1.jsonAdapter !== undefined) {
        errors.push(
          "A legacy runtime-options branch unexpectedly embeds a JSON adapter certificate.",
        );
      } else if (input.options !== undefined) {
        const nested = replayScalableFullH1TrackBPipeline(
          input.options,
          stored.scalableFullH1.pipeline,
        );
        nestedProofChecked = nested.status === "passed";
        if (!nestedProofChecked) errors.push(...nested.errors);
      }
    }
  }
  if (!nestedProofChecked) {
    errors.push("The selected nested proof source failed its check.");
  }
  let rebuiltCertificateDigest: string | undefined;
  let exactActionRootedRebuildMatches = false;
  if (envelopeRecognized && inputBranchMatches) {
    try {
      const rebuilt = buildCompactActionProofBranch(input);
      rebuiltCertificateDigest = rebuilt.certificateDigest;
      exactActionRootedRebuildMatches =
        canonicalSha256(rebuilt) === canonicalSha256(stored);
      if (!exactActionRootedRebuildMatches) {
        errors.push("The action-rooted proof-branch rebuild differs.");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const checks = {
    envelopeRecognized,
    storedCertificateDigestValid,
    inputBranchMatches,
    nestedProofChecked,
    exactActionRootedRebuildMatches,
  };
  const payload = {
    schemaVersion: 2 as const,
    kind: "compact-action-proof-branch-replay" as const,
    status: (Object.values(checks).every(Boolean) && errors.length === 0
      ? "passed"
      : "failed") as "passed" | "failed",
    checks,
    ...(rebuiltCertificateDigest ? { rebuiltCertificateDigest } : {}),
    errors: uniqueSorted(errors),
  };
  return { ...payload, replayDigest: canonicalSha256(payload) };
}
