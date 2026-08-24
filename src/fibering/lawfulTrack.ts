import type {
  BarXCompressedComplex,
  BarXRelationCell,
  CoverCompressionResult,
} from "../compression/types";
import type {
  FullDavisQuotientCell,
  FullDavisQuotientCellPoset,
} from "../davis/fullQuotient";
import type { QuotientComplex } from "../quotient/types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import { evaluateLawfulSubcomplex } from "../walls/lawfulness";
import { deriveMorseLinks } from "../walls/morseLinks";
import type {
  DirectedMorseLink,
  LawfulCellEvaluation,
  LawfulSubcomplexEvaluation,
  MorseLinksResult,
  OrientationSign,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import {
  certifyPrimitiveSchreierHomomorphism,
  type PrimitiveSchreierHomomorphismCertificate,
} from "./schreierHomomorphism";
import {
  type SchreierLetter,
  type SchreierPresentation,
} from "./schreierPresentation";
import type { WallHomomorphismFiniteCertificate } from "./types";
import { certifyWallHomomorphismFiniteData } from "./wallHomomorphism";
import {
  certifyLawfulNpcAsphericity,
  type LawfulNpcAsphericityCertificate,
} from "./lawfulNpcCertificate";
import {
  computeGeneralizedLawfulSourceHash,
  replayGeneralizedLawfulCertificateFromStreamed,
  type GeneralizedLawfulCertificate,
  type GeneralizedLawfulCertificateReplay,
} from "./generalizedLawfulCertificate";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedLawfulDavisOracle,
  type StreamedOrientationSign,
} from "./streamedLawfulDavis";

export type LawfulTrackCheckStatus = "passed" | "failed" | "not-established";

export interface LawfulTrackCheck {
  id: string;
  label: string;
  status: LawfulTrackCheckStatus;
  detail: string;
  evidence: string[];
}

export interface LawfulTrackEvidenceClaim {
  status: "passed" | "failed";
  statement: string;
  source: string;
  evidence: string[];
  artifactHash?: string;
}

/**
 * Evidence supplied by a theorem, an external checker, or a separate proof.
 * Its scope names the actual lawful subcomplex, so evidence for K cannot be
 * silently reused for a different subcomplex Y.
 */
export interface LawfulTrackApplicabilityEvidence {
  schemaVersion: 1;
  kind: "lawful-subcomplex-applicability-evidence";
  scope: {
    sourceComplexName: string;
    retainedCellIds: string[];
    fullCellPosetArchiveHash?: string;
    retainedFullCellIds?: string[];
  };
  method:
    | "verified-npc-lawful-complex"
    | "direct-contractible-universal-cover"
    | "published-lawful-subcomplex-theorem"
    | "external-proof-artifact";
  asphericity: LawfulTrackEvidenceClaim;
  morseTheoremApplicability: LawfulTrackEvidenceClaim;
  /** Required when the retained full Davis subcomplex has dimension >= 3. */
  higherCellMorseExtension?: LawfulTrackEvidenceClaim;
  /** Required when higher cells can add simplices to the directed links. */
  fullDirectedLinks?: LawfulTrackEvidenceClaim;
  limitations: string[];
}

export interface LawfulTrackApplicabilityGate {
  status: LawfulTrackCheckStatus;
  basis: "exact-metric-link-certificate" | "supplied-evidence" | "none";
  scopeMatches: boolean;
  asphericityEstablished: boolean;
  morseTheoremApplicabilityEstablished: boolean;
  higherCellMorseExtensionEstablished: boolean;
  fullDirectedLinksEstablished: boolean;
  evidence?: LawfulTrackApplicabilityEvidence;
  errors: string[];
  statement: string;
}

export interface LawfulTrackCellClassification {
  cellId: string;
  generatorPair: [number, number];
  m: number;
  disposition: "retained-lawful" | "discarded-unlawful";
  reason:
    | "one-source-one-sink"
    | "boundary-sign-word-does-not-have-two-transitions"
    | "invalid-or-incomplete-coorientation";
  transitionCount: number;
  boundarySigns: OrientationSign[];
  sourceVertexId?: string;
  sinkVertexId?: string;
  positivePathEdgeIds: string[][];
}

export interface FullDavisLawfulCellRecord {
  cellId: string;
  dimension: number;
  disposition: "retained" | "discarded";
  reason:
    | "zero-or-one-skeleton"
    | "lawful-rank-two-face"
    | "unlawful-rank-two-face"
    | "all-rank-two-faces-lawful"
    | "has-unlawful-rank-two-face";
  rankTwoFaceCellIds: string[];
  unlawfulRankTwoFaceCellIds: string[];
}

/**
 * Closure record for Y inside the complete cell poset of K = H\Sigma.
 * This proves that the selected cells form a subcomplex; it deliberately says
 * nothing by itself about affine Morse extensions or asphericity.
 */
export interface FullDavisLawfulClosureCertificate {
  status: "passed" | "failed" | "not-supplied";
  method: "remove-unlawful-two-faces-and-all-cofaces";
  sourcePosetArchiveHash?: string;
  sourceDimension?: number;
  barXToFullDavisTwoCellIds: Record<string, string>;
  cells: FullDavisLawfulCellRecord[];
  retainedCellIds: string[];
  discardedCellIds: string[];
  retainedCellIdsByDimension: Record<string, string[]>;
  discardedCellIdsByDimension: Record<string, string[]>;
  checks: {
    sourcePosetCertified: boolean;
    rankZeroAndOneCellsRetained: boolean;
    rankTwoCorrespondenceComplete: boolean;
    rankTwoRetentionMatchesLawfulness: boolean;
    higherCellsFollowTwoFaceRule: boolean;
    retainedCellsAreDownwardClosed: boolean;
  };
  higherCellMorseStatus: "not-applicable" | "not-established";
  errors: string[];
  nonClaims: string[];
}

export interface LawfulCellularRelator {
  cellId: string;
  word: SchreierLetter[];
  canonicalCyclicWord: string;
}

export interface LawfulCellularPresentation {
  rootVertexId: string;
  vertexIds: string[];
  edgeIds: string[];
  spanningTreeEdgeIds: string[];
  generators: Array<{
    generatorId: string;
    edgeId: string;
    storedEdgeExponent: 1 | -1;
  }>;
  relators: LawfulCellularRelator[];
}

export interface LawfulPresentationSurjectionCertificate {
  status: "passed" | "failed";
  method: "common-one-skeleton-cellular-presentation-quotient";
  domainPresentation: LawfulCellularPresentation;
  targetPresentation: LawfulCellularPresentation;
  targetSchreierSummary: {
    pointCount: number;
    graphRank: number;
    definingRelatorCount: number;
    rewrittenRelatorCount: number;
  };
  checks: {
    fullOneSkeletonRetained: boolean;
    commonMaximalTree: boolean;
    identityOnPresentationGenerators: boolean;
    retainedRelatorsAreTargetRelators: boolean;
    compressionPresentationCertified: boolean;
    targetRelatorsMatchSchreierPresentation: boolean;
    inclusionInducesSurjectionToH: boolean;
  };
  discardedTargetRelatorIds: string[];
  generatorMap: Array<{
    domainGeneratorId: string;
    targetGeneratorId: string;
  }>;
  proof: string[];
  errors: string[];
}

export interface LawfulDirectedLinkCertificate {
  kind: "ascending" | "descending";
  vertexIds: string[];
  cornerIds: string[];
  components: string[][];
  spanningTreeCornerIds: string[];
  nonempty: boolean;
  connected: boolean;
  spanningTreeVerified: boolean;
}

export interface LawfulTrackMorseCertificate {
  status: "passed" | "failed";
  checks: {
    finiteConnectedComplex: boolean;
    fullOneSkeletonRetained: boolean;
    everyEdgeHasNonzeroIntegralDirection: boolean;
    retainedCellsHaveOneSourceAndOneSink: boolean;
    wallCocycleClosesOnTarget: boolean;
    liftedVertexHeightsAreDiscrete: boolean;
    everyAscendingLinkNonemptyAndConnected: boolean;
    everyDescendingLinkNonemptyAndConnected: boolean;
  };
  links: Array<{
    vertexId: string;
    ascending: LawfulDirectedLinkCertificate;
    descending: LawfulDirectedLinkCertificate;
  }>;
  errors: string[];
}

/**
 * The theorem gate for the coface-closed complex.  The older polygonal Morse
 * and NPC certificates remain in the enclosing result as diagnostics, but
 * they do not decide this gate: its links and asphericity refer to the actual
 * retained higher-dimensional complex and its declared subdivision.
 */
export interface LawfulTrackGeneralizedCertificateGate {
  status: LawfulTrackCheckStatus;
  scopeMatches: boolean;
  certificateArtifactHash?: string;
  checks: {
    certificateSupplied: boolean;
    supportedCertificateHeader: boolean;
    storedArtifactHashValid: boolean;
    streamedSourceBindingPresent: boolean;
    sourceBindingHashValid: boolean;
    sourceOracleMatchesCurrentAction: boolean;
    sourceWallSystemMatches: boolean;
    candidateCoorientationMatches: boolean;
    retainedCountsMatchSourceOracle: boolean;
    materializedClosureConsistentWhenSupplied: boolean;
    stageDigestsLinked: boolean;
    currentCandidateReconstructed: boolean;
    actionRootedReplayPassed: boolean;
    calculationCompleted: boolean;
    retentionPassed: boolean;
    subdivisionPassed: boolean;
    affineHeightPassed: boolean;
    actualDirectedLinksPassed: boolean;
    asphericityPassed: boolean;
  };
  replay?: GeneralizedLawfulCertificateReplay;
  statement: string;
  errors: string[];
}

export interface LawfulKernelTransferCertificate {
  status: "passed" | "failed" | "not-established";
  checks: {
    primitiveEpimorphismHToZ: boolean;
    lawfulMorseKernelFinitelyGenerated: boolean;
    presentationSurjectionPi1YToH: boolean;
    charactersCommuteOnPresentationGenerators: boolean;
    restrictedKernelMapSurjective: boolean;
    finiteGenerationPassesToTargetKernel: boolean;
  };
  statement: string;
  proof: string[];
}

export interface LawfulSubcomplexFiberingCertificate {
  schemaVersion: 1;
  kind: "lawful-subcomplex-fibering-certificate";
  method: "jankiewicz-wise-lawful-subcomplex-first-track";
  status: "passed" | "failed" | "incomplete";
  certificationComplex: "rank-two-lawful" | "coface-closed-full";
  source: {
    coxeterSystemName: string;
    finiteActionName: string;
    subgroupName: string;
    subgroupIndex: number;
    compressedComplexName: string;
  };
  cells: LawfulTrackCellClassification[];
  retainedCellIds: string[];
  discardedCellIds: string[];
  lawfulSubcomplex: LawfulSubcomplexEvaluation;
  fullDavisClosure: FullDavisLawfulClosureCertificate;
  wallHomomorphism: WallHomomorphismFiniteCertificate;
  primitiveHomomorphism: PrimitiveSchreierHomomorphismCertificate;
  presentationSurjection: LawfulPresentationSurjectionCertificate;
  morse: LawfulTrackMorseCertificate;
  npcAsphericity: LawfulNpcAsphericityCertificate;
  /** Rank-two-only applicability evidence, retained as a diagnostic. */
  applicability: LawfulTrackApplicabilityGate;
  generalized: LawfulTrackGeneralizedCertificateGate;
  generalizedCertificate?: GeneralizedLawfulCertificate;
  kernelTransfer: LawfulKernelTransferCertificate;
  checks: LawfulTrackCheck[];
  conclusion: {
    explicitEpimorphismToZ: boolean;
    lawfulKernelFinitelyGenerated: boolean;
    targetKernelFinitelyGenerated: boolean;
    virtualAlgebraicFibrationCertified: boolean;
    statement: string;
  };
  errors: string[];
  warnings: string[];
  sources: string[];
  nonClaims: string[];
}

export interface LawfulSubcomplexFiberingInput {
  quotient: QuotientComplex;
  cover: CoverCompressionResult;
  wallSystem: WallSystem;
  coorientation: WallCoorientation;
  applicability?: LawfulTrackApplicabilityEvidence;
  /** Executable full-cell result used only by the coface-closed theorem gate. */
  generalizedCertificate?: GeneralizedLawfulCertificate;
  /** Reuse the packed source oracle when the caller already has it. */
  generalizedSourceOracle?: StreamedLawfulDavisOracle;
  schreierPresentation?: SchreierPresentation;
  fullCellPoset?: FullDavisQuotientCellPoset;
  /**
   * The 2D model is the inexpensive Jankiewicz--Wise track. The generalized
   * model additionally retains every higher cell whose 2-faces are lawful;
   * it therefore requires separate higher-cell Morse and full-link evidence.
   */
  certificationComplex?: "rank-two-lawful" | "coface-closed-full";
}

/**
 * Certify the inexpensive lawful-subcomplex track without borrowing any
 * asphericity claim from the ambient Davis complex. The routine is bounded:
 * it performs finite incidence, presentation, cocycle, and graph checks only.
 */
export function buildLawfulSubcomplexFiberingCertificate(
  input: LawfulSubcomplexFiberingInput,
): LawfulSubcomplexFiberingCertificate {
  const { quotient, cover, wallSystem, coorientation } = input;
  const certificationComplex = input.certificationComplex ?? "rank-two-lawful";
  const lawfulSubcomplex = evaluateLawfulSubcomplex(cover.barX, coorientation);
  const morseLinks = deriveMorseLinks(
    cover.barX,
    coorientation,
    lawfulSubcomplex,
  );
  const wallHomomorphism = certifyWallHomomorphismFiniteData(
    cover.barX,
    wallSystem,
    coorientation,
  );
  const primitiveHomomorphism = certifyPrimitiveSchreierHomomorphism({
    quotient,
    cover,
    finiteWallCertificate: wallHomomorphism,
    presentation: input.schreierPresentation,
  });
  const cells = classifyLawfulCells(cover.barX, lawfulSubcomplex);
  const fullDavisClosure = input.fullCellPoset
    ? buildFullDavisLawfulClosure(input.fullCellPoset, cover, lawfulSubcomplex)
    : emptyFullDavisLawfulClosure();
  const presentationSurjection = certifyPresentationSurjection(
    quotient,
    cover,
    lawfulSubcomplex,
    primitiveHomomorphism.presentation,
  );
  const morse = certifyLawfulMorseData(
    cover.barX,
    coorientation,
    lawfulSubcomplex,
    morseLinks,
    wallHomomorphism,
  );
  const npcAsphericity = certifyLawfulNpcAsphericity(
    cover.barX,
    lawfulSubcomplex,
  );
  const generalized = evaluateGeneralizedCertificateGate({
    certificate: input.generalizedCertificate,
    sourceOracle: input.generalizedSourceOracle,
    quotient,
    cover,
    wallSystem,
    coorientation,
    fullClosure: fullDavisClosure,
  });
  const applicability = evaluateApplicabilityGate(
    input.applicability,
    cover.barX.name,
    lawfulSubcomplex.retainedCellIds,
    fullDavisClosure,
    npcAsphericity,
    morse.status === "passed",
    certificationComplex,
  );

  const actionEstablished =
    cover.barX.provenance.actionEvidence !== "not-supplied";
  const torsionFreeEstablished =
    cover.barX.provenance.torsionFreeEvidence !== "not-supplied";
  const compressionPassed = cover.certificate.status === "passed";
  const twoSided = wallSystem.diagnostics.twoSided;
  const globalCoorientation =
    coorientation.valid &&
    cover.barX.geometricEdges.every((edge) => {
      const direction = coorientation.edgeDirections[edge.id];
      return direction === 1 || direction === -1;
    });
  const primitiveEpimorphism =
    primitiveHomomorphism.status === "passed" &&
    primitiveHomomorphism.primitiveImage;

  const checks: LawfulTrackCheck[] = [
    makeCheck(
      "finite-action",
      "Finite action identifying H",
      actionEstablished ? "passed" : "not-established",
      actionEstablished
        ? `The quotient action is ${cover.barX.provenance.actionEvidence}.`
        : "No accepted finite-action evidence identifies the point stabilizer H.",
      cover.barX.provenance.checksPerformed,
    ),
    makeCheck(
      "torsion-free-subgroup",
      "Torsion-free finite-index subgroup",
      torsionFreeEstablished ? "passed" : "not-established",
      torsionFreeEstablished
        ? `Torsion-freeness is ${cover.barX.provenance.torsionFreeEvidence}.`
        : "No accepted torsion-free certificate is attached to this action.",
      cover.barX.provenance.limitations,
    ),
    makeCheck(
      "compression",
      "Exact presentation-complex compression",
      compressionPassed ? "passed" : "failed",
      compressionPassed
        ? "The generator-bigon and relation-cell fibers pass the exact compression checks."
        : "The compression certificate failed.",
      cover.certificate.errors,
    ),
    makeCheck(
      "two-sided-walls",
      "Two-sided walls",
      twoSided ? "passed" : "failed",
      twoSided
        ? "Every wall admits a globally consistent transverse orientation."
        : "At least one wall has an orientation-parity conflict.",
      wallSystem.diagnostics.twoSidednessWitnesses.map(
        (witness) => witness.wallId,
      ),
    ),
    makeCheck(
      "global-coorientation",
      "Global nonzero edge directions",
      globalCoorientation ? "passed" : "failed",
      globalCoorientation
        ? "Every edge receives exactly one direction from its wall."
        : "The supplied coorientation is invalid or incomplete.",
      coorientation.errors,
    ),
    makeCheck(
      "wall-cocycle",
      "Integral cocycle on the target complex",
      wallHomomorphism.cocycle.closed ? "passed" : "failed",
      wallHomomorphism.cocycle.closed
        ? "Every compressed relation-cell boundary sum is zero."
        : "At least one compressed relation-cell boundary sum is nonzero.",
      wallHomomorphism.cocycle.failures.map((failure) => failure.message),
    ),
    makeCheck(
      "primitive-epimorphism",
      "Primitive epimorphism H -> Z",
      primitiveEpimorphism ? "passed" : "failed",
      primitiveEpimorphism
        ? "The Reidemeister--Schreier values have normalized image Z."
        : "The wall periods do not certify a primitive epimorphism H -> Z.",
      primitiveHomomorphism.errors,
    ),
    makeCheck(
      "presentation-surjection",
      "Presentation-level surjection pi_1(Y) -> H",
      presentationSurjection.status,
      presentationSurjection.checks.inclusionInducesSurjectionToH
        ? "The identity on common one-skeleton generators quotients the lawful presentation onto the certified presentation of H."
        : "The common-skeleton presentation quotient could not be certified.",
      presentationSurjection.errors,
    ),
    makeCheck(
      "lawful-morse-data",
      certificationComplex === "rank-two-lawful"
        ? "Rank-two Morse and directed-link checks on Y"
        : "Rank-two Morse/link diagnostic (not the full-cell theorem gate)",
      certificationComplex === "rank-two-lawful"
        ? morse.status
        : morse.status === "passed"
          ? "passed"
          : "not-established",
      morse.status === "passed"
        ? certificationComplex === "rank-two-lawful"
          ? "Every retained 2-cell is lawful and every rank-two ascending and descending link is nonempty and connected."
          : "The rank-two calculation passes, but the generalized theorem gate still uses the actual subdivided full-cell links."
        : certificationComplex === "rank-two-lawful"
          ? "At least one lawful-cell, height, or directed-link check fails."
          : "The polygonal diagnostic does not pass. This does not veto the coface-closed calculation; inspect the generalized directed links instead.",
      morse.errors,
    ),
    makeCheck(
      "lawful-applicability",
      certificationComplex === "rank-two-lawful"
        ? "Asphericity and Morse-theorem applicability for Y"
        : "Rank-two/external applicability diagnostic",
      certificationComplex === "rank-two-lawful"
        ? applicability.status
        : applicability.status === "passed"
          ? "passed"
          : "not-established",
      certificationComplex === "rank-two-lawful"
        ? applicability.statement
        : "This legacy diagnostic is retained for comparison only. The generalized artifact supplies the theorem-facing subdivision, links, and asphericity checks.",
      applicability.errors,
    ),
    ...(certificationComplex === "coface-closed-full"
      ? [
          makeCheck(
            "generalized-lawful-certificate",
            "Coface-closed full-cell Morse and asphericity certificate",
            generalized.status,
            generalized.statement,
            generalized.errors,
          ),
        ]
      : []),
    ...(input.fullCellPoset
      ? [
          makeCheck(
            "full-davis-lawful-closure",
            "Lawful subcomplex closure inside K",
            fullDavisClosure.status === "passed"
              ? "passed"
              : certificationComplex === "coface-closed-full"
                ? "failed"
                : "not-established",
            fullDavisClosure.status === "passed"
              ? "K^1, lawful 2-cells, and exactly the higher cofaces whose 2-faces are lawful form a downward-closed subcomplex."
              : "The lawful cells could not be matched to a downward-closed full Davis subcomplex.",
            fullDavisClosure.errors,
          ),
        ]
      : []),
  ];

  const lawfulMorseKernelFinitelyGenerated =
    certificationComplex === "rank-two-lawful"
      ? morse.status === "passed" && applicability.status === "passed"
      : generalized.status === "passed";
  const charactersCommute =
    presentationSurjection.status === "passed" &&
    wallHomomorphism.cocycle.closed &&
    primitiveEpimorphism;
  const restrictedKernelMapSurjective =
    presentationSurjection.status === "passed" && charactersCommute;
  const transferPassed =
    actionEstablished &&
    torsionFreeEstablished &&
    compressionPassed &&
    twoSided &&
    globalCoorientation &&
    primitiveEpimorphism &&
    lawfulMorseKernelFinitelyGenerated &&
    restrictedKernelMapSurjective;
  const transferMissing =
    (certificationComplex === "rank-two-lawful"
      ? applicability.status === "not-established"
      : generalized.status === "not-established") ||
    !actionEstablished ||
    !torsionFreeEstablished;
  const kernelTransfer: LawfulKernelTransferCertificate = {
    status: transferPassed
      ? "passed"
      : transferMissing && checks.every((check) => check.status !== "failed")
        ? "not-established"
        : "failed",
    checks: {
      primitiveEpimorphismHToZ: primitiveEpimorphism,
      lawfulMorseKernelFinitelyGenerated,
      presentationSurjectionPi1YToH: presentationSurjection.status === "passed",
      charactersCommuteOnPresentationGenerators: charactersCommute,
      restrictedKernelMapSurjective,
      finiteGenerationPassesToTargetKernel: transferPassed,
    },
    statement: transferPassed
      ? "The lawful Morse kernel surjects onto ker(phi in H), so the target kernel is finitely generated."
      : "Finite generation has not been transferred to ker(phi in H); inspect every failed or unsupported gate.",
    proof: [
      "Y and the compressed target have the same connected 1-skeleton, while Y has a subset of the target relators.",
      "Hence the identity on cellular generators induces a surjection i_*: pi_1(Y) -> H.",
      "The wall character on Y is psi = phi o i_* because both are evaluated by the same edge cocycle.",
      "For h in ker(phi), choose a with i_*(a)=h; then psi(a)=0, so ker(psi) -> ker(phi) is onto.",
      "A quotient of a finitely generated group is finitely generated.",
    ],
  };

  const failedChecks = checks.filter((check) => check.status === "failed");
  const unsupportedChecks = checks.filter(
    (check) => check.status === "not-established",
  );
  const status: LawfulSubcomplexFiberingCertificate["status"] = transferPassed
    ? "passed"
    : failedChecks.length > 0
      ? "failed"
      : "incomplete";

  return {
    schemaVersion: 1,
    kind: "lawful-subcomplex-fibering-certificate",
    method: "jankiewicz-wise-lawful-subcomplex-first-track",
    status,
    certificationComplex,
    source: {
      coxeterSystemName: cover.barX.sourceSystem.name,
      finiteActionName: quotient.name,
      subgroupName: quotient.subgroup?.name ?? quotient.name,
      subgroupIndex: quotient.subgroup?.index ?? quotient.vertices.length,
      compressedComplexName: cover.barX.name,
    },
    cells,
    retainedCellIds: [...lawfulSubcomplex.retainedCellIds],
    discardedCellIds: [...lawfulSubcomplex.discardedCellIds],
    lawfulSubcomplex,
    fullDavisClosure,
    wallHomomorphism,
    primitiveHomomorphism,
    presentationSurjection,
    morse,
    npcAsphericity,
    applicability,
    generalized,
    ...(input.generalizedCertificate
      ? { generalizedCertificate: input.generalizedCertificate }
      : {}),
    kernelTransfer,
    checks,
    conclusion: {
      explicitEpimorphismToZ: primitiveEpimorphism,
      lawfulKernelFinitelyGenerated: lawfulMorseKernelFinitelyGenerated,
      targetKernelFinitelyGenerated: transferPassed,
      virtualAlgebraicFibrationCertified: transferPassed,
      statement: transferPassed
        ? `The finite-index subgroup ${quotient.subgroup?.name ?? "H"} admits the displayed primitive epimorphism to Z with finitely generated kernel.`
        : unsupportedChecks.length > 0 && failedChecks.length === 0
          ? "All finite lawful-track checks pass, but the result remains incomplete until the named external hypotheses for Y are supplied."
          : "This lawful-track run does not certify a virtual algebraic fibration.",
    },
    errors: uniqueSorted(
      failedChecks.flatMap((check) => [
        `${check.label}: ${check.detail}`,
        ...check.evidence,
      ]),
    ),
    warnings: uniqueSorted(
      unsupportedChecks.flatMap((check) => [
        `${check.label}: ${check.detail}`,
        ...check.evidence,
      ]),
    ),
    sources: [
      "Jankiewicz--Wise, Incoherent Coxeter Groups, arXiv:1503.03102, Sections 2.4--2.5 and 3.3.",
      "Bestvina--Brady, Morse theory and finiteness properties of groups, Invent. Math. 129 (1997), Theorem 4.1.",
      "Reidemeister--Schreier theorem for presentations of finite-index subgroups.",
    ],
    nonClaims: [
      "The ambient Davis complex does not by itself establish that the retained lawful subcomplex Y is aspherical.",
      "Retaining a higher cell because all of its 2-faces are lawful proves closure only; it does not prove an affine Morse extension or the full directed-link conditions.",
      "A passed wall, cocycle, or directed-link computation does not replace either the exact metric-link certificate or other scope-matched applicability evidence for Y.",
      "This track does not certify a PL Morse function on the full Davis quotient.",
      "Finite presentability of the kernel, a manifold bundle, and geometric fibering are not asserted.",
      "Viewer coordinates and drawing offsets carry no proof content.",
    ],
  };
}

/**
 * Intersect the full Davis cell poset with the lawful rank-two data. All
 * vertices and edges survive. A higher cell survives exactly when every
 * rank-two face in its closure survives, which is equivalent to deleting each
 * unlawful 2-cell and its entire coface upset.
 */
export function buildFullDavisLawfulClosure(
  poset: FullDavisQuotientCellPoset,
  cover: CoverCompressionResult,
  lawful: LawfulSubcomplexEvaluation,
): FullDavisLawfulClosureCertificate {
  const errors: string[] = [];
  const cellsById = new Map(
    poset.cells.map((cell) => [cell.id, cell] as const),
  );
  const fullTwoCells = poset.cells.filter((cell) => cell.dimension === 2);
  const fullToBar = new Map<string, string>();
  const barToFull = new Map<string, string>();
  const pointToSourceVertex = new Map(
    poset.vertices.map((vertex) => [
      vertex.actionPoint,
      vertex.sourceQuotientVertexId,
    ]),
  );
  const hatVertexById = new Map(
    cover.hatX.vertices.map((vertex) => [vertex.id, vertex] as const),
  );
  const hatRelationById = new Map(
    cover.hatX.liftedRelationCells.map((cell) => [cell.id, cell] as const),
  );

  for (const barCell of cover.barX.relationCells) {
    const sourceVertexIds: string[] = [];
    for (const relationId of barCell.sourceHatRelationCellIds) {
      const relation = hatRelationById.get(relationId);
      const vertex = relation
        ? hatVertexById.get(relation.baseVertexId)
        : undefined;
      if (!relation || !vertex) {
        errors.push(
          `Compressed cell ${barCell.id} has incomplete lifted-cell provenance at ${relationId}.`,
        );
        continue;
      }
      sourceVertexIds.push(vertex.sourceQuotientVertexId);
    }
    const expectedVertices = uniqueSorted(sourceVertexIds);
    const candidates = fullTwoCells.filter((fullCell) => {
      if (!sameNumbers(fullCell.generators, barCell.generatorPair))
        return false;
      const actualVertices = fullCell.actionPoints
        .map((point) => pointToSourceVertex.get(point))
        .filter((vertexId): vertexId is string => vertexId !== undefined);
      return sameIds(actualVertices, expectedVertices);
    });
    if (candidates.length !== 1) {
      errors.push(
        `Compressed cell ${barCell.id} matches ${candidates.length} full Davis 2-cells; expected one.`,
      );
      continue;
    }
    const fullCellId = candidates[0].id;
    if (fullToBar.has(fullCellId)) {
      errors.push(
        `Full Davis 2-cell ${fullCellId} has multiple compressed matches.`,
      );
      continue;
    }
    barToFull.set(barCell.id, fullCellId);
    fullToBar.set(fullCellId, barCell.id);
  }

  const sourcePosetCertified =
    poset.certificate.status === "passed" &&
    poset.certificate.archiveHash === poset.archiveHash &&
    poset.certificate.checks.faceIncidenceClosed;
  if (!sourcePosetCertified) {
    errors.push(
      "The supplied full Davis cell poset is not certified and hash-bound.",
    );
  }
  const rankTwoCorrespondenceComplete =
    barToFull.size === cover.barX.relationCells.length &&
    fullToBar.size === fullTwoCells.length;
  if (!rankTwoCorrespondenceComplete) {
    errors.push(
      `Matched ${barToFull.size}/${cover.barX.relationCells.length} compressed cells and ${fullToBar.size}/${fullTwoCells.length} full Davis 2-cells.`,
    );
  }

  const lawfulBarIds = new Set(lawful.retainedCellIds);
  const retainedTwoCellIds = new Set<string>();
  for (const [fullCellId, barCellId] of fullToBar) {
    if (lawfulBarIds.has(barCellId)) retainedTwoCellIds.add(fullCellId);
  }
  const records: FullDavisLawfulCellRecord[] = [...poset.cells]
    .sort(compareFullDavisCells)
    .map((cell) => {
      const rankTwoFaceCellIds =
        cell.dimension === 2
          ? [cell.id]
          : cell.properFaceCellIds
              .filter((faceId) => cellsById.get(faceId)?.dimension === 2)
              .sort(compareIds);
      const unlawfulRankTwoFaceCellIds = rankTwoFaceCellIds.filter(
        (faceId) => !retainedTwoCellIds.has(faceId),
      );
      if (cell.dimension <= 1) {
        return {
          cellId: cell.id,
          dimension: cell.dimension,
          disposition: "retained",
          reason: "zero-or-one-skeleton",
          rankTwoFaceCellIds,
          unlawfulRankTwoFaceCellIds: [],
        };
      }
      if (cell.dimension === 2) {
        const retained = retainedTwoCellIds.has(cell.id);
        return {
          cellId: cell.id,
          dimension: 2,
          disposition: retained ? "retained" : "discarded",
          reason: retained ? "lawful-rank-two-face" : "unlawful-rank-two-face",
          rankTwoFaceCellIds,
          unlawfulRankTwoFaceCellIds,
        };
      }
      const retained =
        rankTwoFaceCellIds.length > 0 &&
        unlawfulRankTwoFaceCellIds.length === 0;
      return {
        cellId: cell.id,
        dimension: cell.dimension,
        disposition: retained ? "retained" : "discarded",
        reason: retained
          ? "all-rank-two-faces-lawful"
          : "has-unlawful-rank-two-face",
        rankTwoFaceCellIds,
        unlawfulRankTwoFaceCellIds,
      };
    });
  const retainedSet = new Set(
    records
      .filter((record) => record.disposition === "retained")
      .map((record) => record.cellId),
  );
  const rankZeroAndOneCellsRetained = records
    .filter((record) => record.dimension <= 1)
    .every((record) => record.disposition === "retained");
  const rankTwoRetentionMatchesLawfulness = fullTwoCells.every((cell) => {
    const barCellId = fullToBar.get(cell.id);
    return (
      barCellId !== undefined &&
      retainedSet.has(cell.id) === lawfulBarIds.has(barCellId)
    );
  });
  const higherCellsFollowTwoFaceRule = records
    .filter((record) => record.dimension >= 3)
    .every(
      (record) =>
        (record.disposition === "retained") ===
        (record.rankTwoFaceCellIds.length > 0 &&
          record.unlawfulRankTwoFaceCellIds.length === 0),
    );
  const retainedCellsAreDownwardClosed = records
    .filter((record) => record.disposition === "retained")
    .every((record) =>
      (cellsById.get(record.cellId)?.properFaceCellIds ?? []).every((faceId) =>
        retainedSet.has(faceId),
      ),
    );
  const checks = {
    sourcePosetCertified,
    rankZeroAndOneCellsRetained,
    rankTwoCorrespondenceComplete,
    rankTwoRetentionMatchesLawfulness,
    higherCellsFollowTwoFaceRule,
    retainedCellsAreDownwardClosed,
  };
  for (const [id, passed] of Object.entries(checks)) {
    if (!passed) errors.push(`Full Davis lawful-closure check failed: ${id}.`);
  }
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    method: "remove-unlawful-two-faces-and-all-cofaces",
    sourcePosetArchiveHash: poset.archiveHash,
    sourceDimension: poset.dimension,
    barXToFullDavisTwoCellIds: Object.fromEntries(
      [...barToFull.entries()].sort(([left], [right]) =>
        compareIds(left, right),
      ),
    ),
    cells: records,
    retainedCellIds: [...retainedSet].sort(compareIds),
    discardedCellIds: records
      .filter((record) => record.disposition === "discarded")
      .map((record) => record.cellId)
      .sort(compareIds),
    retainedCellIdsByDimension: groupCellIdsByDimension(
      records.filter((record) => record.disposition === "retained"),
    ),
    discardedCellIdsByDimension: groupCellIdsByDimension(
      records.filter((record) => record.disposition === "discarded"),
    ),
    checks,
    higherCellMorseStatus:
      poset.dimension >= 3 ? "not-established" : "not-applicable",
    errors: uniqueSorted(errors),
    nonClaims: [
      "Two-face lawfulness and downward closure do not establish asphericity of the retained full Davis subcomplex.",
      "A retained higher cell still needs a compatible affine Morse extension and full directed-link checks.",
    ],
  };
}

function classifyLawfulCells(
  barX: BarXCompressedComplex,
  evaluation: LawfulSubcomplexEvaluation,
): LawfulTrackCellClassification[] {
  const evaluationById = new Map(
    evaluation.cells.map((cell) => [cell.cellId, cell] as const),
  );
  return [...barX.relationCells]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((cell) => {
      const result = evaluationById.get(cell.id);
      const lawful = result?.lawful === true;
      const complete = result !== undefined && result.boundarySigns.length > 0;
      return {
        cellId: cell.id,
        generatorPair: [...cell.generatorPair] as [number, number],
        m: cell.m,
        disposition: lawful ? "retained-lawful" : "discarded-unlawful",
        reason: lawful
          ? "one-source-one-sink"
          : complete
            ? "boundary-sign-word-does-not-have-two-transitions"
            : "invalid-or-incomplete-coorientation",
        transitionCount: result?.transitionCount ?? 0,
        boundarySigns: [...(result?.boundarySigns ?? [])],
        ...(result?.sourceVertexId === undefined
          ? {}
          : { sourceVertexId: result.sourceVertexId }),
        ...(result?.sinkVertexId === undefined
          ? {}
          : { sinkVertexId: result.sinkVertexId }),
        positivePathEdgeIds:
          result?.positivePaths.map((path) =>
            path.steps.map((step) => step.edgeId),
          ) ?? [],
      } satisfies LawfulTrackCellClassification;
    });
}

function certifyLawfulMorseData(
  barX: BarXCompressedComplex,
  coorientation: WallCoorientation,
  lawful: LawfulSubcomplexEvaluation,
  links: MorseLinksResult,
  wallHomomorphism: WallHomomorphismFiniteCertificate,
): LawfulTrackMorseCertificate {
  const fullOneSkeletonRetained =
    sameIds(
      lawful.retainedVertexIds,
      barX.vertices.map((vertex) => vertex.id),
    ) &&
    sameIds(
      lawful.retainedEdgeIds,
      barX.geometricEdges.map((edge) => edge.id),
    );
  const finiteConnectedComplex =
    barX.vertices.length > 0 && isConnectedOneSkeleton(barX);
  const everyEdgeHasNonzeroIntegralDirection =
    coorientation.valid &&
    barX.geometricEdges.every((edge) => {
      const direction = coorientation.edgeDirections[edge.id];
      return direction === 1 || direction === -1;
    });
  const retainedById = new Map(
    lawful.cells.map((cell) => [cell.cellId, cell] as const),
  );
  const retainedCellsHaveOneSourceAndOneSink =
    lawful.valid &&
    lawful.retainedCellIds.every((cellId) =>
      isCertifiedLawfulCell(retainedById.get(cellId)),
    );
  const wallCocycleClosesOnTarget = wallHomomorphism.cocycle.closed;
  const liftedVertexHeightsAreDiscrete =
    finiteConnectedComplex &&
    everyEdgeHasNonzeroIntegralDirection &&
    wallHomomorphism.cocycle.edgeValues.every(
      (entry) => Math.abs(entry.value) === 1,
    );
  const linkCertificates = links.vertices.map((vertex) => ({
    vertexId: vertex.vertexId,
    ascending: certifyDirectedLink(vertex.ascending),
    descending: certifyDirectedLink(vertex.descending),
  }));
  const everyAscendingLinkNonemptyAndConnected =
    links.valid &&
    linkCertificates.length === barX.vertices.length &&
    linkCertificates.every(
      (entry) =>
        entry.ascending.nonempty &&
        entry.ascending.connected &&
        entry.ascending.spanningTreeVerified,
    );
  const everyDescendingLinkNonemptyAndConnected =
    links.valid &&
    linkCertificates.length === barX.vertices.length &&
    linkCertificates.every(
      (entry) =>
        entry.descending.nonempty &&
        entry.descending.connected &&
        entry.descending.spanningTreeVerified,
    );
  const checks = {
    finiteConnectedComplex,
    fullOneSkeletonRetained,
    everyEdgeHasNonzeroIntegralDirection,
    retainedCellsHaveOneSourceAndOneSink,
    wallCocycleClosesOnTarget,
    liftedVertexHeightsAreDiscrete,
    everyAscendingLinkNonemptyAndConnected,
    everyDescendingLinkNonemptyAndConnected,
  };
  const errors: string[] = [...lawful.errors, ...links.errors];
  for (const [id, passed] of Object.entries(checks)) {
    if (!passed) errors.push(`Lawful Morse check failed: ${id}.`);
  }
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks,
    links: linkCertificates,
    errors: uniqueSorted(errors),
  };
}

function certifyPresentationSurjection(
  quotient: QuotientComplex,
  cover: CoverCompressionResult,
  lawful: LawfulSubcomplexEvaluation,
  schreier: SchreierPresentation,
): LawfulPresentationSurjectionCertificate {
  const errors: string[] = [];
  const empty = emptyCellularPresentation(cover.barX);
  try {
    const bindings = buildSchreierEdgeBindings(cover, schreier);
    errors.push(...bindings.errors);
    const targetPresentation = buildCellularPresentation(
      cover.barX,
      new Set(cover.barX.relationCells.map((cell) => cell.id)),
      bindings.treeEdgeIds,
      bindings.bindingByEdgeId,
    );
    const domainPresentation = buildCellularPresentation(
      cover.barX,
      new Set(lawful.retainedCellIds),
      bindings.treeEdgeIds,
      bindings.bindingByEdgeId,
    );
    const fullOneSkeletonRetained =
      sameIds(domainPresentation.vertexIds, targetPresentation.vertexIds) &&
      sameIds(domainPresentation.edgeIds, targetPresentation.edgeIds);
    const commonMaximalTree =
      sameIds(
        domainPresentation.spanningTreeEdgeIds,
        targetPresentation.spanningTreeEdgeIds,
      ) &&
      targetPresentation.spanningTreeEdgeIds.length ===
        targetPresentation.vertexIds.length - 1;
    const identityOnPresentationGenerators =
      sameIds(
        domainPresentation.generators.map((entry) => entry.generatorId),
        targetPresentation.generators.map((entry) => entry.generatorId),
      ) &&
      domainPresentation.generators.every((entry, index) =>
        sameGeneratorBinding(entry, targetPresentation.generators[index]),
      );
    const targetRelatorById = new Map(
      targetPresentation.relators.map((relator) => [relator.cellId, relator]),
    );
    const retainedRelatorsAreTargetRelators =
      domainPresentation.relators.length === lawful.retainedCellIds.length &&
      domainPresentation.relators.every((relator) => {
        const target = targetRelatorById.get(relator.cellId);
        return target !== undefined && sameWord(relator.word, target.word);
      });
    const expectedRewriteCount =
      schreier.pointCount * schreier.definingRelators.length;
    const schreierComplete =
      schreier.pointCount === quotient.vertices.length &&
      schreier.relatorRewrites.length === expectedRewriteCount;
    const involutionRewritesTrivial = schreier.relatorRewrites
      .filter((rewrite) => rewrite.source.kind === "involution")
      .every((rewrite) => rewrite.word.length === 0);
    const cellularRelatorClasses = uniqueSorted(
      targetPresentation.relators
        .map((relator) => relator.canonicalCyclicWord)
        .filter((word) => word !== "[]"),
    );
    const schreierFinitePairClasses = uniqueSorted(
      schreier.relatorRewrites
        .filter((rewrite) => rewrite.source.kind === "finite-pair")
        .map((rewrite) => canonicalCyclicWord(rewrite.word))
        .filter((word) => word !== "[]"),
    );
    const targetRelatorsMatchSchreierPresentation =
      schreierComplete &&
      involutionRewritesTrivial &&
      sameIds(cellularRelatorClasses, schreierFinitePairClasses) &&
      targetPresentation.generators.length === schreier.graphRank &&
      bindings.errors.length === 0;
    const compressionPresentationCertified =
      cover.certificate.status === "passed" &&
      cover.certificate.checks.everyHatCellHasOneImage &&
      cover.certificate.checks.signedRelationBoundariesAgree;
    const inclusionInducesSurjectionToH =
      fullOneSkeletonRetained &&
      commonMaximalTree &&
      identityOnPresentationGenerators &&
      retainedRelatorsAreTargetRelators &&
      compressionPresentationCertified &&
      targetRelatorsMatchSchreierPresentation;
    const checks = {
      fullOneSkeletonRetained,
      commonMaximalTree,
      identityOnPresentationGenerators,
      retainedRelatorsAreTargetRelators,
      compressionPresentationCertified,
      targetRelatorsMatchSchreierPresentation,
      inclusionInducesSurjectionToH,
    };
    for (const [id, passed] of Object.entries(checks)) {
      if (!passed) errors.push(`Presentation-surjection check failed: ${id}.`);
    }
    return {
      status: inclusionInducesSurjectionToH ? "passed" : "failed",
      method: "common-one-skeleton-cellular-presentation-quotient",
      domainPresentation,
      targetPresentation,
      targetSchreierSummary: {
        pointCount: schreier.pointCount,
        graphRank: schreier.graphRank,
        definingRelatorCount: schreier.definingRelators.length,
        rewrittenRelatorCount: schreier.relatorRewrites.length,
      },
      checks,
      discardedTargetRelatorIds: targetPresentation.relators
        .map((relator) => relator.cellId)
        .filter((cellId) => !lawful.retainedCellIds.includes(cellId))
        .sort(compareIds),
      generatorMap: domainPresentation.generators.map((entry) => ({
        domainGeneratorId: entry.generatorId,
        targetGeneratorId: entry.generatorId,
      })),
      proof: [
        "Collapsing the recorded common maximal tree gives Y and the target the same free presentation generators.",
        "Every relator retained by Y is literally the target relator with the same cell id and rewritten word.",
        "The target is obtained by imposing the additional discarded-cell relators, so the identity on generators is surjective.",
        "The compression checks and normalized Reidemeister--Schreier relator classes identify the target presentation with H.",
      ],
      errors: uniqueSorted(errors),
    };
  } catch (error) {
    errors.push(errorMessage(error));
    return {
      status: "failed",
      method: "common-one-skeleton-cellular-presentation-quotient",
      domainPresentation: empty,
      targetPresentation: empty,
      targetSchreierSummary: {
        pointCount: schreier.pointCount,
        graphRank: schreier.graphRank,
        definingRelatorCount: schreier.definingRelators.length,
        rewrittenRelatorCount: schreier.relatorRewrites.length,
      },
      checks: {
        fullOneSkeletonRetained: false,
        commonMaximalTree: false,
        identityOnPresentationGenerators: false,
        retainedRelatorsAreTargetRelators: false,
        compressionPresentationCertified: false,
        targetRelatorsMatchSchreierPresentation: false,
        inclusionInducesSurjectionToH: false,
      },
      discardedTargetRelatorIds: [],
      generatorMap: [],
      proof: [],
      errors: uniqueSorted(errors),
    };
  }
}

interface EdgeBinding {
  generatorId: string;
  edgeId: string;
  storedEdgeExponent: 1 | -1;
}

function buildSchreierEdgeBindings(
  cover: CoverCompressionResult,
  schreier: SchreierPresentation,
): {
  treeEdgeIds: Set<string>;
  bindingByEdgeId: Map<string, EdgeBinding>;
  errors: string[];
} {
  const errors: string[] = [];
  const barEdgeByQuotientEdgeId = new Map<string, string>();
  for (const edge of cover.hatX.directedLiftEdges) {
    const barEdgeId = cover.compressionMap.directedEdgeImages[edge.id];
    if (barEdgeId === undefined) {
      errors.push(`No compressed image is recorded for ${edge.id}.`);
      continue;
    }
    barEdgeByQuotientEdgeId.set(edge.sourceQuotientEdgeId, barEdgeId);
  }
  const treeEdgeIds = new Set<string>();
  for (const treeEdge of schreier.spanningTreeEdges) {
    const barEdgeId = barEdgeByQuotientEdgeId.get(treeEdge.orientedEdgeId);
    if (barEdgeId === undefined) {
      errors.push(
        `Schreier tree edge ${treeEdge.orientedEdgeId} has no compressed edge.`,
      );
    } else {
      treeEdgeIds.add(barEdgeId);
    }
  }

  const vertexById = new Map(
    cover.barX.vertices.map((vertex) => [vertex.id, vertex] as const),
  );
  const bindings = new Map<string, EdgeBinding[]>();
  for (const generator of schreier.generators) {
    const barEdgeId = barEdgeByQuotientEdgeId.get(
      generator.provenance.orientedEdgeId,
    );
    const barEdge = cover.barX.geometricEdges.find(
      (edge) => edge.id === barEdgeId,
    );
    if (!barEdge) {
      errors.push(
        `Schreier generator ${generator.id} has no compressed edge image.`,
      );
      continue;
    }
    const sourcePointId = vertexById.get(
      barEdge.sourceVertexId,
    )?.sourceQuotientVertexId;
    const targetPointId = vertexById.get(
      barEdge.targetVertexId,
    )?.sourceQuotientVertexId;
    let storedEdgeExponent: 1 | -1;
    if (
      sourcePointId === generator.provenance.sourcePointId &&
      targetPointId === generator.provenance.targetPointId
    ) {
      storedEdgeExponent = 1;
    } else if (
      sourcePointId === generator.provenance.targetPointId &&
      targetPointId === generator.provenance.sourcePointId
    ) {
      storedEdgeExponent = -1;
    } else {
      errors.push(
        `Schreier generator ${generator.id} does not follow either orientation of ${barEdge.id}.`,
      );
      continue;
    }
    const bucket = bindings.get(barEdge.id) ?? [];
    bucket.push({
      generatorId: generator.id,
      edgeId: barEdge.id,
      storedEdgeExponent,
    });
    bindings.set(barEdge.id, bucket);
  }

  const bindingByEdgeId = new Map<string, EdgeBinding>();
  for (const edge of cover.barX.geometricEdges) {
    const candidates = bindings.get(edge.id) ?? [];
    if (treeEdgeIds.has(edge.id)) {
      if (candidates.length > 0) {
        errors.push(
          `Tree edge ${edge.id} unexpectedly has a Schreier generator.`,
        );
      }
      continue;
    }
    if (candidates.length !== 1) {
      errors.push(
        `Non-tree edge ${edge.id} has ${candidates.length} Schreier generator bindings; expected one.`,
      );
      continue;
    }
    bindingByEdgeId.set(edge.id, candidates[0]);
  }
  return { treeEdgeIds, bindingByEdgeId, errors };
}

function buildCellularPresentation(
  barX: BarXCompressedComplex,
  retainedCellIds: ReadonlySet<string>,
  treeEdgeIds: ReadonlySet<string>,
  bindingByEdgeId: ReadonlyMap<string, EdgeBinding>,
): LawfulCellularPresentation {
  const relators = [...barX.relationCells]
    .filter((cell) => retainedCellIds.has(cell.id))
    .sort((left, right) => compareIds(left.id, right.id))
    .map((cell) => cellularRelator(cell, treeEdgeIds, bindingByEdgeId));
  const generators = [...bindingByEdgeId.values()].sort((left, right) =>
    compareIds(left.generatorId, right.generatorId),
  );
  return {
    rootVertexId: [...barX.vertices]
      .map((vertex) => vertex.id)
      .sort(compareIds)[0],
    vertexIds: barX.vertices.map((vertex) => vertex.id).sort(compareIds),
    edgeIds: barX.geometricEdges.map((edge) => edge.id).sort(compareIds),
    spanningTreeEdgeIds: [...treeEdgeIds].sort(compareIds),
    generators,
    relators,
  };
}

function cellularRelator(
  cell: BarXRelationCell,
  treeEdgeIds: ReadonlySet<string>,
  bindingByEdgeId: ReadonlyMap<string, EdgeBinding>,
): LawfulCellularRelator {
  const word: SchreierLetter[] = [];
  for (const occurrence of [...cell.boundaryOccurrences].sort(
    (left, right) => left.boundaryIndex - right.boundaryIndex,
  )) {
    if (treeEdgeIds.has(occurrence.edgeId)) continue;
    const binding = bindingByEdgeId.get(occurrence.edgeId);
    if (!binding) {
      throw new Error(
        `Cell ${cell.id} uses non-tree edge ${occurrence.edgeId} without a Schreier binding.`,
      );
    }
    appendReducedLetter(word, {
      generatorId: binding.generatorId,
      exponent: (occurrence.traversal * binding.storedEdgeExponent) as 1 | -1,
    });
  }
  return {
    cellId: cell.id,
    word,
    canonicalCyclicWord: canonicalCyclicWord(word),
  };
}

interface GeneralizedCertificateGateInput {
  certificate?: GeneralizedLawfulCertificate;
  sourceOracle?: StreamedLawfulDavisOracle;
  quotient: QuotientComplex;
  cover: CoverCompressionResult;
  wallSystem: WallSystem;
  coorientation: WallCoorientation;
  fullClosure: FullDavisLawfulClosureCertificate;
}

/**
 * Match a generalized calculation to this exact action and coorientation.
 * The streamed source binding prevents a certificate for one wall mask (or a
 * different ordering of the same ten walls) from being reused here.
 */
function evaluateGeneralizedCertificateGate(
  input: GeneralizedCertificateGateInput,
): LawfulTrackGeneralizedCertificateGate {
  const certificate = input.certificate;
  const emptyChecks: LawfulTrackGeneralizedCertificateGate["checks"] = {
    certificateSupplied: false,
    supportedCertificateHeader: false,
    storedArtifactHashValid: false,
    streamedSourceBindingPresent: false,
    sourceBindingHashValid: false,
    sourceOracleMatchesCurrentAction: false,
    sourceWallSystemMatches: false,
    candidateCoorientationMatches: false,
    retainedCountsMatchSourceOracle: false,
    materializedClosureConsistentWhenSupplied: false,
    stageDigestsLinked: false,
    currentCandidateReconstructed: false,
    actionRootedReplayPassed: false,
    calculationCompleted: false,
    retentionPassed: false,
    subdivisionPassed: false,
    affineHeightPassed: false,
    actualDirectedLinksPassed: false,
    asphericityPassed: false,
  };
  if (!certificate) {
    return {
      status: "not-established",
      scopeMatches: false,
      checks: emptyChecks,
      statement:
        "No generalized full-cell certificate was supplied. Rank-two links cannot decide the coface-closed theorem gate.",
      errors: [
        "Supply a scope-bound generalized lawful certificate for this action and coorientation.",
      ],
    };
  }

  const errors: string[] = [];
  const supportedCertificateHeader =
    certificate.schemaVersion === 1 &&
    certificate.kind === "generalized-coface-closed-lawful-certificate" &&
    certificate.method ===
      "streamed-lawful-cells-pulling-links-and-moussong-check";
  if (!supportedCertificateHeader) {
    errors.push("The generalized certificate header is unsupported.");
  }
  const storedArtifactHashValid =
    certificate.artifactHashAlgorithm === "sha256" &&
    certificate.artifactHash ===
      canonicalSha256({ ...certificate, artifactHash: "" });
  if (!storedArtifactHashValid) {
    errors.push("The generalized certificate artifact hash is invalid.");
  }

  const binding = certificate.sourceBinding;
  const streamedSourceBindingPresent = binding !== null;
  if (!streamedSourceBindingPresent) {
    errors.push(
      "The generalized certificate has no streamed action/coorientation source binding.",
    );
  }
  const sourceBindingHashValid =
    binding !== null &&
    binding.candidateId === certificate.candidateId &&
    binding.candidateIndex === certificate.candidateIndex &&
    certificate.sourceHash === computeGeneralizedLawfulSourceHash(binding) &&
    certificate.retention.sourceHash === certificate.sourceHash;
  if (!sourceBindingHashValid) {
    errors.push(
      "The generalized source hash, candidate, and retention source do not form one binding.",
    );
  }

  let oracle: StreamedLawfulDavisOracle | undefined;
  let currentActionRowsHash: string | undefined;
  try {
    const rows = quotientPermutationRows(input.quotient);
    currentActionRowsHash = hashPackedPermutationRows(rows);
    oracle =
      input.sourceOracle ??
      buildStreamedLawfulDavisOracle({
        system: input.cover.barX.sourceSystem,
        generatorImages: rows,
      });
  } catch (error) {
    errors.push(
      `The current quotient could not be matched to a streamed source oracle: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const sourceOracleMatchesCurrentAction =
    binding !== null &&
    oracle !== undefined &&
    currentActionRowsHash !== undefined &&
    binding.oracleStructureHash === oracle.structureHash &&
    binding.actionRowsCanonicalSha256 === oracle.actionRowsCanonicalSha256 &&
    binding.actionRowsCanonicalSha256 === currentActionRowsHash &&
    oracle.degree === input.quotient.vertices.length &&
    streamedSystemSignature(oracle.system) ===
      streamedSystemSignature(input.cover.barX.sourceSystem);
  if (!sourceOracleMatchesCurrentAction) {
    errors.push(
      "The generalized certificate is not rooted in this Coxeter action.",
    );
  }

  const sourceWallSystemMatches =
    binding !== null &&
    oracle !== undefined &&
    binding.wallStructureHash === oracle.walls.structureHash &&
    sameIds(
      oracle.walls.walls.map((wall) => wall.id),
      input.wallSystem.walls.map((wall) => wall.id),
    );
  if (!sourceWallSystemMatches) {
    errors.push(
      "The generalized certificate is not bound to this quotient wall system.",
    );
  }

  let candidateCoorientationMatches = false;
  let currentStreamedWallSigns:
    | Record<string, StreamedOrientationSign>
    | undefined;
  if (binding !== null && oracle !== undefined && sourceWallSystemMatches) {
    try {
      const translatedWallSigns = translateTrackCoorientationToStreamed(
        input.quotient,
        input.cover,
        input.coorientation,
        oracle,
      );
      currentStreamedWallSigns = translatedWallSigns;
      const expectedHash = canonicalSha256({
        oracleStructureHash: oracle.structureHash,
        candidateId: binding.candidateId,
        wallSigns: oracle.walls.walls.map((wall) => [
          wall.id,
          translatedWallSigns[wall.id],
        ]),
      });
      candidateCoorientationMatches =
        expectedHash === binding.coorientationHash;
    } catch (error) {
      errors.push(
        `The current coorientation could not be translated to the packed wall gauge: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (!candidateCoorientationMatches) {
    errors.push(
      "The generalized certificate belongs to a different candidate coorientation.",
    );
  }

  const retainedCountsMatchSourceOracle =
    oracle !== undefined &&
    sameDimensionCounts(
      certificate.retention.totalCellCountByDimension,
      oracle.cellCountByDimension,
    ) &&
    (certificate.retention.retainedCellCountByDimension["0"] ?? 0) ===
      oracle.degree;
  if (!retainedCountsMatchSourceOracle) {
    errors.push(
      "The generalized retained-cell manifest does not match the current source oracle.",
    );
  }

  const materializedClosureConsistentWhenSupplied =
    input.fullClosure.status === "not-supplied" ||
    (input.fullClosure.status === "passed" &&
      sameDimensionCounts(
        certificate.retention.retainedCellCountByDimension,
        countIdsByDimension(input.fullClosure.retainedCellIdsByDimension),
      ) &&
      sameDimensionCounts(
        certificate.retention.discardedCellCountByDimension,
        countIdsByDimension(input.fullClosure.discardedCellIdsByDimension),
      ));
  if (!materializedClosureConsistentWhenSupplied) {
    errors.push(
      "The generalized retained cells disagree with the supplied materialized Davis closure.",
    );
  }

  const stageDigestsLinked =
    certificate.subdivision.sourceCellSetDigest ===
      certificate.retention.cellSetDigest &&
    certificate.height.sourceCellSetDigest ===
      certificate.retention.cellSetDigest &&
    certificate.height.sourceSubdivisionDigest ===
      certificate.subdivision.subdivisionDigest &&
    certificate.directedLinks.sourceCellSetDigest ===
      certificate.retention.cellSetDigest &&
    certificate.directedLinks.sourceSubdivisionDigest ===
      certificate.subdivision.subdivisionDigest &&
    certificate.directedLinks.sourceHeightDigest ===
      certificate.height.heightDigest &&
    certificate.asphericity.sourceCellSetDigest ===
      certificate.retention.cellSetDigest;
  if (!stageDigestsLinked) {
    errors.push(
      "The retention, subdivision, height, and directed-link digests are not chained.",
    );
  }

  let replay: GeneralizedLawfulCertificateReplay | undefined;
  let currentCandidateReconstructed = false;
  let actionRootedReplayPassed = false;
  if (oracle !== undefined && currentStreamedWallSigns !== undefined) {
    try {
      // Candidate-local source/stage digests are independent of the batch slot
      // in which a candidate was first evaluated. Rebuild this one sign map at
      // slot zero, then compare every mathematical stage exactly.
      const evaluation = oracle.bindCoorientations([
        {
          id: certificate.candidateId,
          wallSigns: currentStreamedWallSigns,
        },
      ]);
      currentCandidateReconstructed = true;
      replay = replayGeneralizedLawfulCertificateFromStreamed(
        {
          oracle,
          evaluation,
          candidateIndex: 0,
          calculationMode:
            certificate.subdivision.representation === "all-maximal-simplices"
              ? "full-simplices"
              : "compact-connectivity",
          linkScan: certificate.directedLinks.scanMode,
          maxLinkWitnesses: certificate.directedLinks.witnesses.length,
          maxMetricFlagWitnesses: certificate.asphericity.obstructions.length,
        },
        certificate,
      );
      actionRootedReplayPassed = replay.status === "passed";
      if (!actionRootedReplayPassed) errors.push(...replay.errors);
    } catch (error) {
      errors.push(
        `Action-rooted generalized replay failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (!currentCandidateReconstructed) {
    errors.push(
      "The current action and coorientation could not reconstruct the generalized calculation.",
    );
  }
  if (!actionRootedReplayPassed) {
    errors.push(
      "The generalized artifact did not match an exact reconstruction of its retained cells, subdivision, height, directed links, and asphericity calculation.",
    );
  }

  const calculationCompleted = certificate.status === "completed";
  const retentionPassed = certificate.retention.status === "passed";
  const subdivisionPassed = certificate.subdivision.status === "passed";
  const affineHeightPassed = certificate.height.status === "passed";
  const actualDirectedLinksPassed =
    certificate.directedLinks.status === "passed" &&
    certificate.directedLinks.morseCondition === "passed";
  const asphericityPassed = certificate.asphericity.status === "passed";
  const checks: LawfulTrackGeneralizedCertificateGate["checks"] = {
    certificateSupplied: true,
    supportedCertificateHeader,
    storedArtifactHashValid,
    streamedSourceBindingPresent,
    sourceBindingHashValid,
    sourceOracleMatchesCurrentAction,
    sourceWallSystemMatches,
    candidateCoorientationMatches,
    retainedCountsMatchSourceOracle,
    materializedClosureConsistentWhenSupplied,
    stageDigestsLinked,
    currentCandidateReconstructed,
    actionRootedReplayPassed,
    calculationCompleted,
    retentionPassed,
    subdivisionPassed,
    affineHeightPassed,
    actualDirectedLinksPassed,
    asphericityPassed,
  };
  const scopeMatches =
    supportedCertificateHeader &&
    storedArtifactHashValid &&
    streamedSourceBindingPresent &&
    sourceBindingHashValid &&
    sourceOracleMatchesCurrentAction &&
    sourceWallSystemMatches &&
    candidateCoorientationMatches &&
    retainedCountsMatchSourceOracle &&
    materializedClosureConsistentWhenSupplied &&
    stageDigestsLinked &&
    currentCandidateReconstructed;
  const calculationFailed =
    !calculationCompleted ||
    !retentionPassed ||
    !subdivisionPassed ||
    !affineHeightPassed ||
    certificate.directedLinks.status !== "passed" ||
    !actionRootedReplayPassed;
  const passed =
    scopeMatches &&
    !calculationFailed &&
    actualDirectedLinksPassed &&
    asphericityPassed;
  if (!calculationCompleted)
    errors.push("The generalized calculation did not complete.");
  if (!retentionPassed)
    errors.push("The coface-closed retained-cell calculation failed.");
  if (!subdivisionPassed)
    errors.push("The compatible higher-cell subdivision calculation failed.");
  if (!affineHeightPassed)
    errors.push("The compatible affine height calculation failed.");
  if (!actualDirectedLinksPassed)
    errors.push(
      "The actual ascending/descending links do not establish the Morse connectivity condition.",
    );
  if (!asphericityPassed)
    errors.push(
      "Contractibility of the universal cover/asphericity is not established for the retained full-cell complex.",
    );

  return {
    status: passed
      ? "passed"
      : !scopeMatches || calculationFailed
        ? "failed"
        : "not-established",
    scopeMatches,
    certificateArtifactHash: certificate.artifactHash,
    checks,
    ...(replay ? { replay } : {}),
    statement: passed
      ? "The scope-matched generalized certificate verifies the coface-closed cell set, compatible subdivision and affine height, every actual directed link, and asphericity."
      : "The generalized calculation does not establish every theorem-facing full-cell hypothesis; rank-two diagnostics are not used as a substitute.",
    errors: uniqueSorted(errors),
  };
}

function quotientPermutationRows(quotient: QuotientComplex): number[][] {
  if (!quotient.sourceSystem) {
    throw new Error("The quotient has no source Coxeter system.");
  }
  if (!quotient.permutationAction) {
    throw new Error("The quotient has no explicit permutation action.");
  }
  const pointByVertexId = new Map(
    quotient.vertices.map((vertex, point) => [vertex.id, point] as const),
  );
  return Array.from({ length: quotient.sourceSystem.rank }, (_, generator) => {
    const action = quotient.permutationAction?.find(
      (entry) => entry.generator === generator,
    );
    if (!action) throw new Error(`Generator ${generator} has no action row.`);
    return quotient.vertices.map((vertex) => {
      const targetId = action.images[vertex.id];
      const target =
        targetId === undefined ? undefined : pointByVertexId.get(targetId);
      if (target === undefined) {
        throw new Error(
          `Generator ${generator} has no valid image at ${vertex.id}.`,
        );
      }
      return target;
    });
  });
}

function hashPackedPermutationRows(
  rows: readonly (readonly number[])[],
): string {
  const degree = rows[0]?.length ?? 0;
  const chunkSize = 4_096;
  const rowChunkHashes = rows.map((row, generator) => {
    const chunks: string[] = [];
    for (let start = 0; start < row.length; start += chunkSize) {
      chunks.push(
        canonicalSha256({
          generator,
          start,
          images: row.slice(start, start + chunkSize),
        }),
      );
    }
    return canonicalSha256({ generator, degree, chunkSize, chunks });
  });
  return canonicalSha256({
    schemaVersion: 1,
    method: "fixed-row-chunk-sha256-tree",
    degree,
    generatorCount: rows.length,
    chunkSize,
    rowChunkHashes,
  });
}

function streamedSystemSignature(
  system: BarXCompressedComplex["sourceSystem"],
): string {
  return canonicalSha256({
    rank: system.rank,
    generators: system.generators.map((generator) => ({
      id: generator.id,
      label: generator.label,
    })),
    coxeterMatrix: system.coxeterMatrix,
  });
}

function translateTrackCoorientationToStreamed(
  quotient: QuotientComplex,
  cover: CoverCompressionResult,
  coorientation: WallCoorientation,
  oracle: StreamedLawfulDavisOracle,
): Record<string, StreamedOrientationSign> {
  const pointByVertexId = new Map(
    quotient.vertices.map((vertex, point) => [vertex.id, point] as const),
  );
  const barVertexById = new Map(
    cover.barX.vertices.map((vertex) => [vertex.id, vertex] as const),
  );
  const edgeById = new Map(
    cover.barX.geometricEdges.map((edge) => [edge.id, edge] as const),
  );
  const wallSigns: Record<string, StreamedOrientationSign> = {};
  for (const wall of oracle.walls.walls) {
    const edge = edgeById.get(wall.canonicalEdgeId);
    if (!edge) {
      throw new Error(`Missing canonical edge ${wall.canonicalEdgeId}.`);
    }
    const sourceVertex = barVertexById.get(edge.sourceVertexId);
    const point = sourceVertex
      ? pointByVertexId.get(sourceVertex.sourceQuotientVertexId)
      : undefined;
    if (point === undefined) {
      throw new Error(`Cannot locate the action point of ${edge.id}.`);
    }
    const binding = oracle.wallBinding(point, edge.generator);
    if (binding.edgeId !== edge.id || binding.wallId !== wall.id) {
      throw new Error(`Wall gauge mismatch at ${edge.id}.`);
    }
    const direction = coorientation.edgeDirections[edge.id];
    if (direction !== 1 && direction !== -1) {
      throw new Error(`The track has no direction for ${edge.id}.`);
    }
    wallSigns[wall.id] = (direction *
      binding.edgeParity) as StreamedOrientationSign;
  }
  return wallSigns;
}

function sameDimensionCounts(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const dimensions = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...dimensions].every(
    (dimension) => (left[dimension] ?? 0) === (right[dimension] ?? 0),
  );
}

function countIdsByDimension(
  grouped: Readonly<Record<string, readonly string[]>>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(grouped).map(([dimension, ids]) => [dimension, ids.length]),
  );
}

function evaluateApplicabilityGate(
  evidence: LawfulTrackApplicabilityEvidence | undefined,
  sourceComplexName: string,
  retainedCellIds: readonly string[],
  fullClosure: FullDavisLawfulClosureCertificate,
  npc: LawfulNpcAsphericityCertificate,
  lawfulMorseDataPassed: boolean,
  certificationComplex: "rank-two-lawful" | "coface-closed-full",
): LawfulTrackApplicabilityGate {
  if (evidence === undefined) {
    const usingRankTwoComplex = certificationComplex === "rank-two-lawful";
    const npcPassed =
      npc.status === "passed" &&
      npc.sourceComplexName === sourceComplexName &&
      sameIds(npc.retainedCellIds, retainedCellIds) &&
      npc.checks.aspherical;
    const passed = usingRankTwoComplex && npcPassed && lawfulMorseDataPassed;
    return {
      status: passed ? "passed" : "not-established",
      basis: npcPassed ? "exact-metric-link-certificate" : "none",
      scopeMatches: npcPassed,
      asphericityEstablished: npcPassed,
      morseTheoremApplicabilityEstablished:
        usingRankTwoComplex && lawfulMorseDataPassed,
      higherCellMorseExtensionEstablished: usingRankTwoComplex,
      fullDirectedLinksEstablished: usingRankTwoComplex,
      errors: passed
        ? []
        : uniqueSorted([
            ...(npcPassed
              ? []
              : [
                  "The exact regular-polygon metric-link check did not establish asphericity of the retained lawful 2-complex.",
                ]),
            ...(lawfulMorseDataPassed
              ? []
              : ["The retained lawful cells or directed links did not pass."]),
            ...(usingRankTwoComplex
              ? []
              : [
                  "The generalized coface-closed lawful complex requires scope-matched higher-cell Morse and full-link evidence.",
                ]),
          ]),
      statement: passed
        ? "Exact metric-link arithmetic certifies the retained polygonal complex as locally CAT(0), and the finite lawful-cell data supplies the required Morse map and directed links."
        : "The selected lawful complex still lacks a complete asphericity or Morse-applicability certificate; no ambient Davis claim has been borrowed.",
    };
  }
  const errors: string[] = [];
  const fullClosureRequired = certificationComplex === "coface-closed-full";
  const higherCellsPresent =
    certificationComplex === "coface-closed-full" &&
    fullClosure.status === "passed" &&
    highestRetainedDimension(fullClosure) >= 3;
  const scopeMatches =
    evidence.scope.sourceComplexName === sourceComplexName &&
    sameIds(evidence.scope.retainedCellIds, retainedCellIds) &&
    (!fullClosureRequired ||
      (fullClosure.status === "passed" &&
        evidence.scope.fullCellPosetArchiveHash ===
          fullClosure.sourcePosetArchiveHash &&
        evidence.scope.retainedFullCellIds !== undefined &&
        sameIds(
          evidence.scope.retainedFullCellIds,
          fullClosure.retainedCellIds,
        )));
  if (fullClosureRequired && fullClosure.status !== "passed") {
    errors.push(
      "The generalized coface-closed model requires a passed full Davis lawful-closure certificate.",
    );
  }
  if (!scopeMatches) {
    errors.push(
      "The applicability evidence is scoped to a different complex or retained-cell set.",
    );
  }
  const asphericityEstablished = validPassedClaim(
    evidence.asphericity,
    "asphericity",
    errors,
  );
  const morseTheoremApplicabilityEstablished = validPassedClaim(
    evidence.morseTheoremApplicability,
    "Morse theorem applicability",
    errors,
  );
  const higherCellMorseExtensionEstablished = higherCellsPresent
    ? evidence.higherCellMorseExtension !== undefined &&
      validPassedClaim(
        evidence.higherCellMorseExtension,
        "higher-cell Morse extension",
        errors,
      )
    : true;
  if (higherCellsPresent && evidence.higherCellMorseExtension === undefined) {
    errors.push(
      "No higher-cell affine Morse-extension evidence was supplied for the retained full Davis subcomplex.",
    );
  }
  const fullDirectedLinksEstablished = higherCellsPresent
    ? evidence.fullDirectedLinks !== undefined &&
      validPassedClaim(
        evidence.fullDirectedLinks,
        "full directed links",
        errors,
      )
    : true;
  if (higherCellsPresent && evidence.fullDirectedLinks === undefined) {
    errors.push(
      "No full-dimensional ascending/descending-link evidence was supplied for the retained full Davis subcomplex.",
    );
  }
  const passed =
    scopeMatches &&
    asphericityEstablished &&
    morseTheoremApplicabilityEstablished &&
    higherCellMorseExtensionEstablished &&
    fullDirectedLinksEstablished;
  return {
    status: passed ? "passed" : "failed",
    basis: "supplied-evidence",
    scopeMatches,
    asphericityEstablished,
    morseTheoremApplicabilityEstablished,
    higherCellMorseExtensionEstablished,
    fullDirectedLinksEstablished,
    evidence,
    errors: uniqueSorted(errors),
    statement: passed
      ? "A scope-matched source explicitly establishes asphericity and the lawful-complex Morse theorem hypotheses for Y."
      : "The supplied applicability evidence does not establish every required global hypothesis for Y.",
  };
}

function highestRetainedDimension(
  closure: FullDavisLawfulClosureCertificate,
): number {
  return Math.max(
    -1,
    ...Object.entries(closure.retainedCellIdsByDimension)
      .filter(([, cellIds]) => cellIds.length > 0)
      .map(([dimension]) => Number(dimension)),
  );
}

function emptyFullDavisLawfulClosure(): FullDavisLawfulClosureCertificate {
  return {
    status: "not-supplied",
    method: "remove-unlawful-two-faces-and-all-cofaces",
    barXToFullDavisTwoCellIds: {},
    cells: [],
    retainedCellIds: [],
    discardedCellIds: [],
    retainedCellIdsByDimension: {},
    discardedCellIdsByDimension: {},
    checks: {
      sourcePosetCertified: false,
      rankZeroAndOneCellsRetained: false,
      rankTwoCorrespondenceComplete: false,
      rankTwoRetentionMatchesLawfulness: false,
      higherCellsFollowTwoFaceRule: false,
      retainedCellsAreDownwardClosed: false,
    },
    higherCellMorseStatus: "not-applicable",
    errors: [],
    nonClaims: [
      "No complete full Davis cell poset was supplied to this lawful-track run.",
    ],
  };
}

function groupCellIdsByDimension(
  records: readonly FullDavisLawfulCellRecord[],
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const record of records) {
    const dimension = String(record.dimension);
    (grouped[dimension] ??= []).push(record.cellId);
  }
  for (const ids of Object.values(grouped)) ids.sort(compareIds);
  return Object.fromEntries(
    Object.entries(grouped).sort(
      ([left], [right]) => Number(left) - Number(right),
    ),
  );
}

function compareFullDavisCells(
  left: FullDavisQuotientCell,
  right: FullDavisQuotientCell,
): number {
  return left.dimension - right.dimension || compareIds(left.id, right.id);
}

function sameNumbers(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function validPassedClaim(
  claim: LawfulTrackEvidenceClaim,
  label: string,
  errors: string[],
): boolean {
  if (claim.status !== "passed") {
    errors.push(`${label} is explicitly recorded as failed.`);
    return false;
  }
  if (
    claim.statement.trim().length === 0 ||
    claim.source.trim().length === 0 ||
    claim.evidence.length === 0 ||
    claim.evidence.some((item) => item.trim().length === 0)
  ) {
    errors.push(`${label} is marked passed but lacks a source or evidence.`);
    return false;
  }
  return true;
}

function certifyDirectedLink(
  link: DirectedMorseLink,
): LawfulDirectedLinkCertificate {
  const vertexIds = link.vertices.map((vertex) => vertex.id).sort(compareIds);
  const vertexSet = new Set(vertexIds);
  const adjacency = new Map<
    string,
    Array<{ neighborId: string; cornerId: string }>
  >(vertexIds.map((vertexId) => [vertexId, []]));
  const corners = [...link.corners].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  for (const corner of corners) {
    if (
      !vertexSet.has(corner.firstLinkVertexId) ||
      !vertexSet.has(corner.secondLinkVertexId)
    ) {
      continue;
    }
    adjacency.get(corner.firstLinkVertexId)?.push({
      neighborId: corner.secondLinkVertexId,
      cornerId: corner.id,
    });
    adjacency.get(corner.secondLinkVertexId)?.push({
      neighborId: corner.firstLinkVertexId,
      cornerId: corner.id,
    });
  }
  for (const entries of adjacency.values()) {
    entries.sort(
      (left, right) =>
        compareIds(left.cornerId, right.cornerId) ||
        compareIds(left.neighborId, right.neighborId),
    );
  }
  const spanningTreeCornerIds: string[] = [];
  const visited = new Set<string>();
  for (const root of vertexIds) {
    if (visited.has(root)) continue;
    visited.add(root);
    const queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const entry of adjacency.get(queue[cursor]) ?? []) {
        if (visited.has(entry.neighborId)) continue;
        visited.add(entry.neighborId);
        queue.push(entry.neighborId);
        spanningTreeCornerIds.push(entry.cornerId);
      }
    }
  }
  const spanningTreeVerified =
    visited.size === vertexIds.length &&
    spanningTreeCornerIds.length ===
      Math.max(0, vertexIds.length - link.components.length);
  return {
    kind: link.kind,
    vertexIds,
    cornerIds: corners.map((corner) => corner.id),
    components: link.components.map((component) =>
      [...component].sort(compareIds),
    ),
    spanningTreeCornerIds,
    nonempty: link.nonempty,
    connected: link.connected,
    spanningTreeVerified,
  };
}

function isCertifiedLawfulCell(
  cell: LawfulCellEvaluation | undefined,
): boolean {
  return (
    cell?.lawful === true &&
    cell.transitionCount === 2 &&
    cell.sourceVertexId !== undefined &&
    cell.sinkVertexId !== undefined &&
    cell.sourceVertexId !== cell.sinkVertexId &&
    cell.positivePaths.length === 2 &&
    cell.positivePaths.every(
      (path) =>
        path.sourceVertexId === cell.sourceVertexId &&
        path.sinkVertexId === cell.sinkVertexId &&
        path.steps.length > 0,
    )
  );
}

function isConnectedOneSkeleton(barX: BarXCompressedComplex): boolean {
  if (barX.vertices.length === 0) return false;
  const adjacency = new Map(
    barX.vertices.map((vertex) => [vertex.id, new Set<string>()] as const),
  );
  for (const edge of barX.geometricEdges) {
    adjacency.get(edge.sourceVertexId)?.add(edge.targetVertexId);
    adjacency.get(edge.targetVertexId)?.add(edge.sourceVertexId);
  }
  const start = barX.vertices.map((vertex) => vertex.id).sort(compareIds)[0];
  const visited = new Set([start]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of adjacency.get(queue[cursor]) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited.size === barX.vertices.length;
}

function canonicalCyclicWord(input: readonly SchreierLetter[]): string {
  const word = cyclicallyReduce(input);
  if (word.length === 0) return "[]";
  const inverse = [...word].reverse().map((letter) => ({
    generatorId: letter.generatorId,
    exponent: -letter.exponent as 1 | -1,
  }));
  const candidates: string[] = [];
  for (const orientation of [word, inverse]) {
    for (let offset = 0; offset < orientation.length; offset += 1) {
      candidates.push(
        orientation
          .slice(offset)
          .concat(orientation.slice(0, offset))
          .map(
            (letter) =>
              `${letter.generatorId}${letter.exponent === -1 ? "^-1" : ""}`,
          )
          .join(" "),
      );
    }
  }
  return candidates.sort(compareIds)[0];
}

function cyclicallyReduce(input: readonly SchreierLetter[]): SchreierLetter[] {
  const word: SchreierLetter[] = [];
  for (const letter of input) appendReducedLetter(word, { ...letter });
  while (
    word.length >= 2 &&
    word[0].generatorId === word.at(-1)?.generatorId &&
    word[0].exponent === -word.at(-1)!.exponent
  ) {
    word.shift();
    word.pop();
  }
  return word;
}

function appendReducedLetter(
  word: SchreierLetter[],
  letter: SchreierLetter,
): void {
  const previous = word.at(-1);
  if (
    previous?.generatorId === letter.generatorId &&
    previous.exponent === -letter.exponent
  ) {
    word.pop();
  } else {
    word.push(letter);
  }
}

function sameGeneratorBinding(
  left: LawfulCellularPresentation["generators"][number] | undefined,
  right: LawfulCellularPresentation["generators"][number] | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.generatorId === right.generatorId &&
    left.edgeId === right.edgeId &&
    left.storedEdgeExponent === right.storedEdgeExponent
  );
}

function sameWord(
  left: readonly SchreierLetter[],
  right: readonly SchreierLetter[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (letter, index) =>
        letter.generatorId === right[index].generatorId &&
        letter.exponent === right[index].exponent,
    )
  );
}

function emptyCellularPresentation(
  barX: BarXCompressedComplex,
): LawfulCellularPresentation {
  return {
    rootVertexId: barX.vertices[0]?.id ?? "",
    vertexIds: [],
    edgeIds: [],
    spanningTreeEdgeIds: [],
    generators: [],
    relators: [],
  };
}

function makeCheck(
  id: string,
  label: string,
  status: LawfulTrackCheckStatus,
  detail: string,
  evidence: string[],
): LawfulTrackCheck {
  return { id, label, status, detail, evidence: uniqueSorted(evidence) };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const leftSorted = uniqueSorted(left);
  const rightSorted = uniqueSorted(right);
  return (
    leftSorted.length === left.length &&
    rightSorted.length === right.length &&
    leftSorted.length === rightSorted.length &&
    leftSorted.every((id, index) => id === rightSorted[index])
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareIds);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
