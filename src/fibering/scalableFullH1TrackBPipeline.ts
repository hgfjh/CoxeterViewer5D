import type { GeneralizedCompressionBuildOptions } from "../davis/generalizedCompression";
import type { TorsionFreeCandidateResult } from "../torsionFree";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildExactCheapScreenPeriodicPotential,
  buildExactCheapScreenPullingOrder,
  computeExactCheapScreenActionBindingDigest,
  runExactCompactActionCheapScreen,
  type ExactCheapScreenActionBinding,
  type ExactCompactActionCheapScreenOptions,
  type ExactCompactActionCheapScreenReport,
} from "./exactCompactActionCheapScreen";
import {
  buildGenericCompactExpensiveStage,
  type GenericCompactExpensiveStageBounds,
  type GenericCompactExpensiveStageCertificate,
  type GenericHeightArrangementFace,
  type GenericHeightPolarityEvaluation,
} from "./genericCompactExpensiveStage";
import {
  buildScalableGenericActionH1,
  type ScalableGenericActionH1BuildInput,
  type ScalableGenericActionH1Certificate,
} from "./scalableGenericActionH1";
import { buildStreamedLawfulDavisOracle } from "./streamedLawfulDavis";
import type { StreamedTrackBIntegralCocycleBasis } from "./streamedTrackB";

export type ScalableFullH1TrackBCheapScreenPlan = Omit<
  ExactCompactActionCheapScreenOptions,
  "oracle" | "actionBinding" | "cocycleBasis"
>;

export interface ScalableFullH1TrackBPipelineOptions {
  h1Input: ScalableGenericActionH1BuildInput;
  /** Omit for the deterministic basis-vector diagnostic portfolio. */
  cheapScreenPlan?: ScalableFullH1TrackBCheapScreenPlan;
  /** Defaults to true. The exact full-H1 search never depends on this screen. */
  runCheapScreen?: boolean;
  generalizedCompressionOptions?: GeneralizedCompressionBuildOptions;
  expensiveStageBounds?: GenericCompactExpensiveStageBounds;
}

export type ScalableFullH1TrackBPipelineOutcome =
  | "virtual-algebraic-fibering-certified"
  | "fixed-track-b-model-obstructed"
  | "zero-first-betti-number"
  | "resource-bound-incomplete"
  | "failed";

export interface ScalableFullH1TrackBPromotion {
  status: "certified" | "not-established";
  conclusion:
    | "finite-generation-certified"
    | "morse-link-condition-failed"
    | "not-established";
  selectedFaceDigest?: string;
  sigma?: -1 | 1;
  character?: {
    coordinateIds: string[];
    primitiveCoordinates: string[];
    coordinateGcd: "1";
    fullIntegralLatticeBasisDigest: string;
    cocycleSectionDigest: string;
    primitiveEpimorphismToZ: true;
    characterDigest: string;
  };
  fullK?: {
    torsionFreeCertificateDigest: string;
    generalizedCompressionArchiveHash: string;
    completeSphericalCellSet: boolean;
    everyRootedFiberComplete: boolean;
    everyFaceMapChecked: boolean;
    universalCover: "Davis complex Sigma";
    universalCoverContractible: boolean;
    quotientAspherical: boolean;
  };
  height?: {
    templateSourceHash: string;
    templateSetDigest: string;
    heightRuleDigest: string;
    arrangementCoverHash: string;
    faceCatalogueDigest: string;
    pulling: "canonical-global-point-order";
    periodicPotential: "zero";
    noIntroducedVertices: true;
  };
  directedLinks?: {
    checkedPointCount: number;
    allAscendingNonempty: boolean;
    allDescendingNonempty: boolean;
    allAscendingConnected: boolean;
    allDescendingConnected: boolean;
    pointResultDigest: string;
    evaluationDigest: string;
  };
  checks: {
    scalableH1Passed: boolean;
    fullIntegralLatticeBound: boolean;
    cocycleSectionReplayedAndClosed: boolean;
    torsionFreeActionReplayed: boolean;
    generalizedCompressionBuilt: boolean;
    completeSphericalCellSet: boolean;
    exactAllCharacterArrangementBuilt: boolean;
    everyRealizableNonzeroFaceRepresented: boolean;
    lowerDimensionalFacesIncluded: boolean;
    bothTiePolaritiesEvaluated: boolean;
    primitiveNonzeroCharacterSelected: boolean;
    exhaustiveAllPointTemplates: boolean;
    finiteCocompactFullKQuotient: boolean;
    globallyCompatiblePulling: boolean;
    equivariantAffineHeightWithDistinctSimplexVertices: boolean;
    liftedHeightImageClosedAndDiscrete: boolean;
    everyAscendingAndDescendingLinkNonemptyConnected: boolean;
    allPromotionGatesPassed: boolean;
  };
  promotionDigest: string;
}

/**
 * Schema 2 (October 2026): the build records the H1 and Track-B certificates
 * it built, without replays of its own output nested inside the build.
 * replayScalableFullH1TrackBPipeline (the verify command) is the independent
 * replay: it rebuilds the whole pipeline and requires an identical artifact.
 */
export interface ScalableFullH1TrackBPipelineCertificate {
  schemaVersion: 2;
  kind: "scalable-full-h1-track-b-pipeline-certificate";
  status: "passed" | "not-found" | "incomplete" | "failed";
  outcome: ScalableFullH1TrackBPipelineOutcome;
  method: "proof-carrying-scalable-h1-to-intrinsic-full-k-track-b";
  source: {
    systemCanonicalSha256: string;
    candidateId: string;
    degree: number;
    generatorCount: number;
    actionRowsCanonicalSha256: string;
    torsionFreeCertificateDigest: string;
    modularRankCertificateDigest: string;
    integralKernelWitnessDigest: string;
  };
  h1: {
    certificate: ScalableGenericActionH1Certificate;
  };
  cheapScreen?: {
    logicalRole: "diagnostic-only-not-a-track-b-gate";
    report: ExactCompactActionCheapScreenReport;
  };
  trackB?: {
    certificate: GenericCompactExpensiveStageCertificate;
  };
  promotion: ScalableFullH1TrackBPromotion;
  claims: string[];
  nonClaims: string[];
  errors: string[];
  warnings: string[];
  certificateDigest: string;
}

export interface ScalableFullH1TrackBPipelineReplay {
  schemaVersion: 1;
  kind: "scalable-full-h1-track-b-pipeline-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    storedCertificateDigestValid: boolean;
    exactActionRootedRebuildMatches: boolean;
  };
  rebuiltCertificateDigest?: string;
  errors: string[];
  replayDigest: string;
}

const DEFAULT_CHEAP_BOUNDS = {
  maxSamplePoints: 8,
  maxCharacters: 8,
  maxOrders: 1,
  maxPotentials: 1,
  maxSubdivisionFamilies: 1,
  maxTrials: 16,
  maxSourceCellsPerPoint: 4_096,
  maxPullingSimplicesPerSourceCell: 4_096,
  maxOriginalLinkVerticesPerPoint: 65_536,
  maxIntroducedCentersPerTrial: 65_536,
} as const;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function certificatePayload(
  certificate: ScalableFullH1TrackBPipelineCertificate,
): Omit<ScalableFullH1TrackBPipelineCertificate, "certificateDigest"> {
  const { certificateDigest, ...payload } = certificate;
  void certificateDigest;
  return payload;
}

export function computeScalableFullH1TrackBPipelineDigest(
  certificate: ScalableFullH1TrackBPipelineCertificate,
): string {
  return canonicalSha256(certificatePayload(certificate));
}

function sealPromotion(
  payload: Omit<ScalableFullH1TrackBPromotion, "promotionDigest">,
): ScalableFullH1TrackBPromotion {
  return { ...payload, promotionDigest: canonicalSha256(payload) };
}

function sealCertificate(
  payload: Omit<ScalableFullH1TrackBPipelineCertificate, "certificateDigest">,
): ScalableFullH1TrackBPipelineCertificate {
  const certificate = { ...payload, certificateDigest: "" };
  certificate.certificateDigest =
    computeScalableFullH1TrackBPipelineDigest(certificate);
  return certificate;
}

function exactActionBinding(
  accepted: TorsionFreeCandidateResult,
  oracle: ReturnType<typeof buildStreamedLawfulDavisOracle>,
): ExactCheapScreenActionBinding {
  const binding: ExactCheapScreenActionBinding = {
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
    bindingDigest: "",
  };
  binding.bindingDigest = computeExactCheapScreenActionBindingDigest(binding);
  return binding;
}

/** A bounded diagnostic portfolio. It never gates the exhaustive Track-B run. */
export function defaultScalableFullH1TrackBCheapScreenPlan(
  accepted: TorsionFreeCandidateResult,
  oracle: ReturnType<typeof buildStreamedLawfulDavisOracle>,
  basis: StreamedTrackBIntegralCocycleBasis,
): ScalableFullH1TrackBCheapScreenPlan {
  const characterCount = Math.min(
    basis.coordinateIds.length,
    DEFAULT_CHEAP_BOUNDS.maxCharacters,
  );
  return {
    characters: Array.from(
      { length: characterCount },
      (_unused, coordinate) => ({
        id: `primitive-basis-${coordinate}`,
        coordinates: basis.coordinateIds.map((_id, index) =>
          index === coordinate ? "1" : "0",
        ),
      }),
    ),
    pullingOrders: [
      buildExactCheapScreenPullingOrder(oracle.degree, {
        id: "canonical-point-order",
        multiplier: 1,
        shift: 0,
      }),
    ],
    periodicPotentials: [
      buildExactCheapScreenPeriodicPotential(oracle.degree, {
        id: "zero",
        specification: { method: "zero" },
      }),
    ],
    subdivisionFamilies: ["pulling"],
    tiePolarities: [-1, 1],
    samplePoints: Array.from(
      { length: Math.min(oracle.degree, DEFAULT_CHEAP_BOUNDS.maxSamplePoints) },
      (_unused, point) => point,
    ),
    bounds: { ...DEFAULT_CHEAP_BOUNDS },
  };
}

function coordinateGcd(values: readonly string[]): bigint {
  const gcd = (left: bigint, right: bigint): bigint => {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
  };
  return values.reduce(
    (value, coordinate) => gcd(value, BigInt(coordinate)),
    0n,
  );
}

function passingFace(certificate: GenericCompactExpensiveStageCertificate): {
  face: GenericHeightArrangementFace;
  evaluation: GenericHeightPolarityEvaluation;
} | null {
  const passing: Array<{
    face: GenericHeightArrangementFace;
    evaluation: GenericHeightPolarityEvaluation;
  }> = [];
  for (const face of certificate.arrangement?.faceCatalogue ?? []) {
    for (const evaluation of face.polarities) {
      if (evaluation.allLinksPass) passing.push({ face, evaluation });
    }
  }
  passing.sort((left, right) => {
    const leftFirst = left.face.primitiveRepresentative.find(
      (value) => BigInt(value) !== 0n,
    );
    const rightFirst = right.face.primitiveRepresentative.find(
      (value) => BigInt(value) !== 0n,
    );
    const leftPositive = leftFirst !== undefined && BigInt(leftFirst) > 0n;
    const rightPositive = rightFirst !== undefined && BigInt(rightFirst) > 0n;
    if (leftPositive !== rightPositive) return leftPositive ? -1 : 1;
    if (left.evaluation.sigma !== right.evaluation.sigma) {
      return left.evaluation.sigma - right.evaluation.sigma;
    }
    return left.face.faceDigest.localeCompare(right.face.faceDigest);
  });
  return passing[0] ?? null;
}

function emptyPromotion(
  conclusion: ScalableFullH1TrackBPromotion["conclusion"],
  scalableH1Passed: boolean,
): ScalableFullH1TrackBPromotion {
  return sealPromotion({
    status: "not-established",
    conclusion,
    checks: {
      scalableH1Passed,
      fullIntegralLatticeBound: false,
      cocycleSectionReplayedAndClosed: false,
      torsionFreeActionReplayed: false,
      generalizedCompressionBuilt: false,
      completeSphericalCellSet: false,
      exactAllCharacterArrangementBuilt: false,
      everyRealizableNonzeroFaceRepresented: false,
      lowerDimensionalFacesIncluded: false,
      bothTiePolaritiesEvaluated: false,
      primitiveNonzeroCharacterSelected: false,
      exhaustiveAllPointTemplates: false,
      finiteCocompactFullKQuotient: false,
      globallyCompatiblePulling: false,
      equivariantAffineHeightWithDistinctSimplexVertices: false,
      liftedHeightImageClosedAndDiscrete: false,
      everyAscendingAndDescendingLinkNonemptyConnected: false,
      allPromotionGatesPassed: false,
    },
  });
}

function buildPromotion(options: {
  accepted: TorsionFreeCandidateResult;
  h1: ScalableGenericActionH1Certificate;
  basis: StreamedTrackBIntegralCocycleBasis;
  trackB: GenericCompactExpensiveStageCertificate;
}): ScalableFullH1TrackBPromotion {
  const { trackB } = options;
  const arrangement = trackB.arrangement;
  const compression = trackB.generalizedCompression?.certificate;
  const stream = arrangement?.templateStream;
  const selected = passingFace(trackB);
  const fullIntegralLatticeBound =
    options.h1.status === "passed" &&
    options.h1.completion?.h1?.checks.fullIntegralKernelCertified === true &&
    options.h1.h1 !== undefined &&
    options.h1.h1.rank > 0 &&
    options.h1.h1.cocycleSectionDigest !== null;
  const cocycleSectionReplayedAndClosed =
    stream?.checks.sourceReplayed === true &&
    stream.checks.coordinateIdsValid &&
    stream.checks.expectedCocycleSectionDigestMatches &&
    stream.checks.directedEdgesAntisymmetric &&
    stream.checks.rankTwoBoundariesClosed &&
    stream.checks.exactNumberPackingBoundProved &&
    stream.latticeBasisDigest === options.h1.h1?.latticeBasisDigest &&
    stream.cocycleSectionDigest === options.h1.h1?.cocycleSectionDigest &&
    canonicalSha256(stream.coordinateIds) ===
      canonicalSha256(options.basis.coordinateIds) &&
    stream.latticeBasisDigest === options.basis.latticeBasisDigest &&
    stream.cocycleSectionDigest === options.basis.expectedCocycleSectionDigest;
  const torsionFreeActionReplayed =
    options.h1.torsionFree.status === "passed" &&
    options.h1.checks.independentTorsionFreeReplayPassed;
  const generalizedCompressionBuilt =
    trackB.generalizedCompression !== undefined &&
    trackB.checks.generalizedCompressionBuilt;
  const completeCellCensus =
    compression?.status === "passed" &&
    compression.checks.completeSphericalCatalogue &&
    compression.checks.everyRootedCellRecorded &&
    compression.checks.allFiberCardinalitiesEqualSphericalOrders &&
    compression.checks.everyProperSphericalFaceTypeChecked &&
    compression.checks.allFaceMapsCompatible &&
    compression.checks.sourceTorsionFreeCertificateReplayed &&
    compression.checks.rankAtMostTwoDefinitionAgreementPassed &&
    generalizedCompressionBuilt;
  const exactAllCharacterArrangementBuilt =
    trackB.status === "completed" &&
    trackB.outcome === "exact-arrangement-complete" &&
    trackB.checks.allClaimedChecksPassed &&
    trackB.checks.exactArrangementBuilt;
  const everyRealizableNonzeroFaceRepresented =
    arrangement?.checks.everyRealizableNonzeroFaceRepresented === true;
  const lowerDimensionalFacesIncluded =
    arrangement?.checks.lowerDimensionalZeroSignFacesIncluded === true;
  const bothTiePolaritiesEvaluated =
    arrangement?.checks.bothOffsetPolaritiesEvaluated === true;
  const primitiveNonzeroCharacterSelected =
    selected !== null &&
    selected.face.primitiveRepresentative.some(
      (value) => BigInt(value) !== 0n,
    ) &&
    coordinateGcd(selected.face.primitiveRepresentative) === 1n;
  const exhaustiveAllPointTemplates =
    stream?.status === "completed" &&
    stream.scanOutcome === "exhaustive-request" &&
    stream.adjacencyIncluded &&
    stream.checkedPointCount === trackB.source.degree &&
    stream.checks.everyQuotientPointStreamed &&
    stream.generalizedCompressionArchiveHash === compression?.archiveHash &&
    stream.oracleStructureHash === trackB.source.oracleStructureHash;
  const finiteCocompactFullKQuotient =
    torsionFreeActionReplayed &&
    Number.isSafeInteger(trackB.source.degree) &&
    trackB.source.degree > 0 &&
    completeCellCensus;
  const globallyCompatiblePulling =
    completeCellCensus &&
    exhaustiveAllPointTemplates &&
    trackB.checks.templateRuleMatchesSelectedSurvivor &&
    stream?.heightRule.method ===
      "integral-character-plus-fixed-global-point-order-offset";
  const equivariantAffineHeightWithDistinctSimplexVertices =
    cocycleSectionReplayedAndClosed &&
    globallyCompatiblePulling &&
    stream?.heightRule.offsetDenominator === 4 * trackB.source.degree &&
    stream?.heightRule.clearedDifferenceFormula ===
      "4*degree*dot(coefficientForm,weight)+sigma*pointDifference";
  const liftedHeightImageClosedAndDiscrete =
    equivariantAffineHeightWithDistinctSimplexVertices &&
    finiteCocompactFullKQuotient &&
    exhaustiveAllPointTemplates;
  const linksPass =
    selected !== null &&
    selected.evaluation.allLinksPass &&
    selected.evaluation.checkedPointCount === trackB.source.degree &&
    selected.evaluation.firstFailure === undefined &&
    Object.values(selected.evaluation.failureCountByKind).every(
      (count) => count === 0,
    );
  const checks: ScalableFullH1TrackBPromotion["checks"] = {
    scalableH1Passed:
      options.h1.status === "passed" &&
      options.h1.checks.allClaimedChecksPassed,
    fullIntegralLatticeBound,
    cocycleSectionReplayedAndClosed,
    torsionFreeActionReplayed,
    generalizedCompressionBuilt,
    completeSphericalCellSet: completeCellCensus,
    exactAllCharacterArrangementBuilt,
    everyRealizableNonzeroFaceRepresented,
    lowerDimensionalFacesIncluded,
    bothTiePolaritiesEvaluated,
    primitiveNonzeroCharacterSelected,
    exhaustiveAllPointTemplates,
    finiteCocompactFullKQuotient,
    globallyCompatiblePulling,
    equivariantAffineHeightWithDistinctSimplexVertices,
    liftedHeightImageClosedAndDiscrete,
    everyAscendingAndDescendingLinkNonemptyConnected: linksPass,
    allPromotionGatesPassed: false,
  };
  checks.allPromotionGatesPassed = Object.entries(checks)
    .filter(([name]) => name !== "allPromotionGatesPassed")
    .every(([, value]) => value);

  if (!selected || !checks.allPromotionGatesPassed || !stream || !compression) {
    return sealPromotion({
      status: "not-established",
      conclusion:
        exactAllCharacterArrangementBuilt && selected === null
          ? "morse-link-condition-failed"
          : "not-established",
      checks,
    });
  }

  const h1 = options.h1.h1!;
  const characterWithoutDigest = {
    coordinateIds: [...stream.coordinateIds],
    primitiveCoordinates: [...selected.face.primitiveRepresentative],
    coordinateGcd: "1" as const,
    fullIntegralLatticeBasisDigest: h1.latticeBasisDigest,
    cocycleSectionDigest: h1.cocycleSectionDigest!,
    primitiveEpimorphismToZ: true as const,
  };
  const character = {
    ...characterWithoutDigest,
    characterDigest: canonicalSha256(characterWithoutDigest),
  };
  const failureCounts = selected.evaluation.failureCountByKind;
  return sealPromotion({
    status: "certified",
    conclusion: "finite-generation-certified",
    selectedFaceDigest: selected.face.faceDigest,
    sigma: selected.evaluation.sigma,
    character,
    fullK: {
      torsionFreeCertificateDigest: canonicalSha256(
        options.accepted.certificate,
      ),
      generalizedCompressionArchiveHash: compression.archiveHash,
      completeSphericalCellSet: true,
      everyRootedFiberComplete: true,
      everyFaceMapChecked: true,
      universalCover: "Davis complex Sigma",
      universalCoverContractible: true,
      quotientAspherical: true,
    },
    height: {
      templateSourceHash: stream.sourceHash,
      templateSetDigest: stream.templateSetDigest,
      heightRuleDigest: stream.heightRule.heightRuleDigest,
      arrangementCoverHash: arrangement!.cover.coverHash,
      faceCatalogueDigest: arrangement!.faceCatalogueDigest,
      pulling: "canonical-global-point-order",
      periodicPotential: "zero",
      noIntroducedVertices: true,
    },
    directedLinks: {
      checkedPointCount: selected.evaluation.checkedPointCount,
      allAscendingNonempty: failureCounts["ascending-empty"] === 0,
      allDescendingNonempty: failureCounts["descending-empty"] === 0,
      allAscendingConnected: failureCounts["ascending-disconnected"] === 0,
      allDescendingConnected: failureCounts["descending-disconnected"] === 0,
      pointResultDigest: selected.evaluation.pointResultDigest,
      evaluationDigest: selected.evaluation.evaluationDigest,
    },
    checks,
  });
}

export function buildScalableFullH1TrackBPipeline(
  options: ScalableFullH1TrackBPipelineOptions,
): ScalableFullH1TrackBPipelineCertificate {
  const { h1Input } = options;
  const oracle = buildStreamedLawfulDavisOracle({
    system: h1Input.oracle.system,
    generatorImages: h1Input.accepted.candidate.generatorImages,
  });
  const source: ScalableFullH1TrackBPipelineCertificate["source"] = {
    systemCanonicalSha256: canonicalSha256(oracle.system),
    candidateId: h1Input.accepted.candidate.id,
    degree: oracle.degree,
    generatorCount: oracle.generatorCount,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    torsionFreeCertificateDigest: canonicalSha256(h1Input.accepted.certificate),
    modularRankCertificateDigest:
      h1Input.modularRankCertificate.certificateDigest,
    integralKernelWitnessDigest: h1Input.integralKernelWitness.witnessDigest,
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const h1Result = buildScalableGenericActionH1({ ...h1Input, oracle });
  let cheapScreen: ScalableFullH1TrackBPipelineCertificate["cheapScreen"];
  let trackB: ScalableFullH1TrackBPipelineCertificate["trackB"];
  let promotion = emptyPromotion(
    "not-established",
    h1Result.certificate.status === "passed",
  );
  let status: ScalableFullH1TrackBPipelineCertificate["status"] = "failed";
  let outcome: ScalableFullH1TrackBPipelineOutcome = "failed";

  if (h1Result.certificate.status === "incomplete") {
    status = "incomplete";
    outcome = "resource-bound-incomplete";
    warnings.push(
      h1Result.certificate.stopReason ??
        "The scalable full-H1 stage reached a declared resource bound.",
    );
  } else if (
    h1Result.certificate.status !== "passed" ||
    h1Result.certificate.h1 === undefined ||
    h1Result.integralCocycleBasis === null
  ) {
    if (
      h1Result.certificate.status === "passed" &&
      h1Result.certificate.h1?.rank === 0
    ) {
      status = "not-found";
      outcome = "zero-first-betti-number";
    } else {
      errors.push(...h1Result.certificate.errors);
    }
  } else if (h1Result.certificate.h1.rank === 0) {
    status = "not-found";
    outcome = "zero-first-betti-number";
  } else {
    const basis = h1Result.integralCocycleBasis;
    if (options.runCheapScreen ?? true) {
      try {
        const plan =
          options.cheapScreenPlan ??
          defaultScalableFullH1TrackBCheapScreenPlan(
            h1Input.accepted,
            oracle,
            basis,
          );
        cheapScreen = {
          logicalRole: "diagnostic-only-not-a-track-b-gate",
          report: runExactCompactActionCheapScreen({
            ...plan,
            oracle,
            actionBinding: exactActionBinding(h1Input.accepted, oracle),
            cocycleBasis: basis,
          }),
        };
      } catch (error) {
        warnings.push(
          `The optional cheap screen did not complete: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const stageOptions = {
      oracle,
      h1: h1Result,
      scalableH1ReplayInput: { ...h1Input, oracle },
      // Built a few lines above from the same input; the stage checks the
      // binding and records this instead of replaying H1 again.
      h1Provenance: "built-in-same-run" as const,
      ...(options.generalizedCompressionOptions
        ? {
            generalizedCompressionOptions:
              options.generalizedCompressionOptions,
          }
        : {}),
      ...(options.expensiveStageBounds
        ? { bounds: options.expensiveStageBounds }
        : {}),
    };
    const certificate = buildGenericCompactExpensiveStage(
      oracle.system,
      h1Input.accepted,
      stageOptions,
    );
    trackB = { certificate };
    promotion = buildPromotion({
      accepted: h1Input.accepted,
      h1: h1Result.certificate,
      basis,
      trackB: certificate,
    });
    if (certificate.status === "failed") {
      errors.push(...certificate.errors);
    } else if (certificate.status === "incomplete") {
      status = "incomplete";
      outcome = "resource-bound-incomplete";
      if (certificate.stop) warnings.push(certificate.stop.detail);
    } else if (promotion.status === "certified") {
      status = "passed";
      outcome = "virtual-algebraic-fibering-certified";
    } else if (promotion.conclusion === "morse-link-condition-failed") {
      status = "not-found";
      outcome = "fixed-track-b-model-obstructed";
    } else {
      errors.push(
        "The exact Track-B stage completed without a promotable terminal conclusion.",
      );
    }
  }

  const claims =
    status === "passed"
      ? [
          "A primitive integral character on the certified subgroup has finitely generated kernel.",
          "The result is a virtual algebraic fibration for this finite action, established by the recorded checks; the verify command replays the whole pipeline independently.",
        ]
      : outcome === "fixed-track-b-model-obstructed"
        ? [
            "Every nonzero integral character in the certified full H1 lattice fails a directed-link gate for the recorded canonical Track-B height model.",
          ]
        : [];
  const nonClaims = [
    "This pipeline does not certify finite presentation, a locally trivial bundle, or smooth fibering.",
    "The finite aspherical quotient H\\Sigma need not be a manifold.",
    "A negative result concerns only this finite action, certified cocycle section, canonical point-order pulling subdivision, zero periodic potential, and the two recorded tie polarities.",
    "A fixed-model directed-link obstruction does not prove that every character kernel is infinitely generated or that the subgroup has no algebraic fibration.",
    "The exhaustive arrangement ranges over nonzero integral characters in the certified lattice; it makes no separate claim about unrecorded real characters.",
    "No conclusion is made about another finite cover, minimum subgroup index, another cocycle section, subdivision, or height construction.",
    "A resource-bound or rank-bound stop is incomplete, not a nonfibering theorem.",
    "The command requires a complete finite action; it does not construct a coset action from subgroup generators.",
  ];
  return sealCertificate({
    schemaVersion: 2,
    kind: "scalable-full-h1-track-b-pipeline-certificate",
    status,
    outcome,
    method: "proof-carrying-scalable-h1-to-intrinsic-full-k-track-b",
    source,
    h1: { certificate: h1Result.certificate },
    ...(cheapScreen ? { cheapScreen } : {}),
    ...(trackB ? { trackB } : {}),
    promotion,
    claims,
    nonClaims,
    errors: uniqueSorted(errors),
    warnings: uniqueSorted(warnings),
  });
}

export function replayScalableFullH1TrackBPipeline(
  options: ScalableFullH1TrackBPipelineOptions,
  storedInput: unknown,
): ScalableFullH1TrackBPipelineReplay {
  const checks: ScalableFullH1TrackBPipelineReplay["checks"] = {
    envelopeRecognized: false,
    storedCertificateDigestValid: false,
    exactActionRootedRebuildMatches: false,
  };
  const errors: string[] = [];
  let rebuiltCertificateDigest: string | undefined;
  try {
    if (
      storedInput === null ||
      typeof storedInput !== "object" ||
      Array.isArray(storedInput)
    ) {
      throw new Error(
        "The stored scalable full-H1 Track-B artifact is not an object.",
      );
    }
    const stored = storedInput as ScalableFullH1TrackBPipelineCertificate;
    checks.envelopeRecognized =
      stored.schemaVersion === 2 &&
      stored.kind === "scalable-full-h1-track-b-pipeline-certificate" &&
      stored.method ===
        "proof-carrying-scalable-h1-to-intrinsic-full-k-track-b" &&
      ["passed", "not-found", "incomplete", "failed"].includes(stored.status);
    checks.storedCertificateDigestValid =
      typeof stored.certificateDigest === "string" &&
      stored.certificateDigest ===
        computeScalableFullH1TrackBPipelineDigest(stored);
    if (!checks.envelopeRecognized || !checks.storedCertificateDigestValid) {
      throw new Error("The stored pipeline envelope or digest is invalid.");
    }
    const rebuilt = buildScalableFullH1TrackBPipeline(options);
    rebuiltCertificateDigest = rebuilt.certificateDigest;
    checks.exactActionRootedRebuildMatches =
      canonicalSha256(rebuilt) === canonicalSha256(stored);
    if (!checks.exactActionRootedRebuildMatches) {
      errors.push(
        "The stored pipeline differs from exact action-rooted replay.",
      );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const uniqueErrors = uniqueSorted(errors);
  const payload = {
    schemaVersion: 1 as const,
    kind: "scalable-full-h1-track-b-pipeline-replay" as const,
    status:
      uniqueErrors.length === 0 && Object.values(checks).every(Boolean)
        ? ("passed" as const)
        : ("failed" as const),
    checks,
    ...(rebuiltCertificateDigest ? { rebuiltCertificateDigest } : {}),
    errors: uniqueErrors,
  };
  return { ...payload, replayDigest: canonicalSha256(payload) };
}
