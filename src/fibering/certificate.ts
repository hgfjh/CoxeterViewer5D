import type { CoverCompressionResult } from "../compression";
import type { QuotientComplex } from "../quotient";
import type {
  LawfulSubcomplexEvaluation,
  MaximumLawfulSearchCertificate,
  MorseLinksResult,
  WallCoorientation,
  WallSystem,
} from "../walls";
import {
  certifyPLMorseHypotheses,
  type PLMorseHypothesisCertificate,
} from "./plMorseHypotheses";
import {
  certifyPrimitiveSchreierHomomorphism,
  type PrimitiveSchreierHomomorphismCertificate,
} from "./schreierHomomorphism";
import type { SchreierPresentation } from "./schreierPresentation";
import type { WallHomomorphismFiniteCertificate } from "./types";
import { certifyWallHomomorphismFiniteData } from "./wallHomomorphism";

export interface VirtualAlgebraicFiberingCertificate {
  schemaVersion: 1;
  kind: "virtual-algebraic-fibering-certificate";
  method: "cooriented-walls-schreier-and-pl-morse";
  status: "passed" | "failed" | "incomplete";
  source: {
    coxeterSystemName: string;
    finiteActionName: string;
    subgroupName: string;
    subgroupIndex: number;
    actionEvidence: string;
    torsionFreeEvidence: string;
    sourceInputHash?: string;
  };
  wallHomomorphism: WallHomomorphismFiniteCertificate;
  primitiveHomomorphism: PrimitiveSchreierHomomorphismCertificate;
  lawfulSubcomplex: LawfulSubcomplexEvaluation;
  morseLinks: MorseLinksResult;
  plMorse: PLMorseHypothesisCertificate;
  optimization?: MaximumLawfulSearchCertificate;
  result: {
    explicitEpimorphismToZ: boolean;
    finitelyGeneratedKernel: boolean;
    virtualAlgebraicFibration: boolean;
    statement: string;
  };
  errors: string[];
  warnings: string[];
  references: string[];
}

/**
 * Assemble the exact finite certificates behind one wall-coorientation run.
 * No result is inferred from scene coordinates or visual wall placement.
 */
export function buildVirtualAlgebraicFiberingCertificate(input: {
  quotient: QuotientComplex;
  cover: CoverCompressionResult;
  wallSystem: WallSystem;
  coorientation: WallCoorientation;
  lawfulSubcomplex: LawfulSubcomplexEvaluation;
  morseLinks: MorseLinksResult;
  optimization?: MaximumLawfulSearchCertificate;
  schreierPresentation?: SchreierPresentation;
}): VirtualAlgebraicFiberingCertificate {
  const {
    quotient,
    cover,
    wallSystem,
    coorientation,
    lawfulSubcomplex,
    morseLinks,
    optimization,
  } = input;
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
  const presentation = primitiveHomomorphism.presentation;
  const expectedRewrites =
    presentation.pointCount * presentation.definingRelators.length;
  const presentationPassed =
    presentation.pointCount === quotient.vertices.length &&
    presentation.relatorRewrites.length === expectedRewrites &&
    primitiveHomomorphism.checks.everyGeneratorEvaluated &&
    primitiveHomomorphism.checks.everySchreierLoopCloses;
  const plMorse = certifyPLMorseHypotheses({
    cover,
    wallSystem,
    coorientation,
    lawfulSubcomplex,
    morseLinks,
    homomorphism: {
      schreierPresentationPassed: presentationPassed,
      wallCocyclePassed:
        wallHomomorphism.checks.cocycleConsistentAroundEveryRelationCell,
      wallCocycleNonzero: wallHomomorphism.checks.nonzeroImage,
      primitiveImagePassed: primitiveHomomorphism.status === "passed",
      periodDivisor: primitiveHomomorphism.normalizationDivisor ?? undefined,
    },
  });

  const explicitEpimorphismToZ =
    primitiveHomomorphism.status === "passed" &&
    primitiveHomomorphism.primitiveImage;
  const finitelyGeneratedKernel =
    explicitEpimorphismToZ &&
    plMorse.conclusion.virtualAlgebraicFibrationCertified;
  const virtualAlgebraicFibration = finitelyGeneratedKernel;
  const errors = [
    ...primitiveHomomorphism.errors,
    ...plMorse.checks
      .filter((check) => check.status === "failed")
      .map((check) => `${check.label}: ${check.detail}`),
  ];
  const warnings = [
    ...plMorse.checks
      .filter((check) => check.status === "missing-evidence")
      .map((check) => `${check.label}: ${check.detail}`),
    ...plMorse.auxiliaryDiagnostics
      .filter((diagnostic) => !diagnostic.passed)
      .map(
        (diagnostic) =>
          `${diagnostic.label} (probabilistic-search diagnostic only): ${diagnostic.detail}`,
      ),
  ];

  return {
    schemaVersion: 1,
    kind: "virtual-algebraic-fibering-certificate",
    method: "cooriented-walls-schreier-and-pl-morse",
    status:
      plMorse.status === "passed"
        ? "passed"
        : plMorse.status === "incomplete"
          ? "incomplete"
          : "failed",
    source: {
      coxeterSystemName: cover.barX.sourceSystem.name,
      finiteActionName: quotient.name,
      subgroupName: quotient.subgroup?.name ?? quotient.name,
      subgroupIndex: quotient.subgroup?.index ?? quotient.vertices.length,
      actionEvidence: cover.barX.provenance.actionEvidence,
      torsionFreeEvidence: cover.barX.provenance.torsionFreeEvidence,
      ...(cover.barX.provenance.sourceVerifierInputHash
        ? { sourceInputHash: cover.barX.provenance.sourceVerifierInputHash }
        : {}),
    },
    wallHomomorphism,
    primitiveHomomorphism,
    lawfulSubcomplex,
    morseLinks,
    plMorse,
    ...(optimization ? { optimization } : {}),
    result: {
      explicitEpimorphismToZ,
      finitelyGeneratedKernel,
      virtualAlgebraicFibration,
      statement: virtualAlgebraicFibration
        ? `The finite-index subgroup ${quotient.subgroup?.name ?? "H"} admits the displayed primitive homomorphism to Z with finitely generated kernel.`
        : "This run does not yet certify a virtual algebraic fibration. The artifact records every failing or unsupported hypothesis.",
    },
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
    references: [
      "Jankiewicz--Wise, Incoherent Coxeter Groups, arXiv:1503.03102, Sections 2.1--2.5 and Theorem 3.1.",
      "Bestvina--Brady, Morse theory and finiteness properties of groups, Invent. Math. 129 (1997), Theorem 4.1.",
    ],
  };
}
