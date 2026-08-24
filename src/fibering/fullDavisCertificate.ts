import {
  buildCoverCompression,
  type CoverCompressionResult,
} from "../compression";
import {
  buildFullDavisQuotientCellPoset,
  computeFullDavisQuotientArchiveHash,
  type FullDavisQuotientCellPoset,
} from "../davis/fullQuotient";
import type { QuotientComplex } from "../quotient";
import {
  acceptedActionToQuotientComplex,
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeActionCertificate,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import {
  verifyCollapsibilityCertificate,
  type CollapsibilitySearchOptions,
} from "../topology/collapsibility";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  createWallCoorientation,
  findWallSystem,
  type OrientationSign,
  type WallCoorientation,
  type WallSystem,
} from "../walls";
import {
  buildFullDirectedLinkCertificate,
  buildPrimitiveMorseHeightCertificate,
  computeFullDirectedLinksHash,
  computePrimitiveMorseHeightHash,
  type FullDirectedLinkCertificate,
  type PrimitiveMorseHeightCertificate,
} from "./fullDavisMorse";
import {
  certifyPrimitiveSchreierHomomorphism,
  type PrimitiveSchreierHomomorphismCertificate,
} from "./schreierHomomorphism";
import {
  buildCompatiblePullingTriangulation,
  computePullingTriangulationHash,
  type PullingTriangulationCertificate,
} from "./pullingTriangulation";
import type { WallHomomorphismFiniteCertificate } from "./types";
import { certifyWallHomomorphismFiniteData } from "./wallHomomorphism";

export type FullDavisFiberingStageId =
  | "torsion-free-action"
  | "cover-and-compression"
  | "complete-cell-poset"
  | "two-sided-walls"
  | "closed-wall-cocycle"
  | "primitive-schreier-character"
  | "compatible-pulling-triangulation"
  | "primitive-pl-height"
  | "full-cell-cocycle-extension"
  | "full-directed-links"
  | "link-collapsibility";

export interface FullDavisFiberingStage {
  id: FullDavisFiberingStageId;
  label: string;
  status: "passed" | "failed" | "incomplete" | "not-run";
  detail: string;
}

export interface Imm23FibrationHypotheses {
  /** @deprecated Unverified legacy input. Construction ignores it and replay rejects it. */
  compactSmoothManifoldCertified: boolean;
  dimensionAtMostFiveCertified: boolean;
  compatibleAffinePlStructureCertified: boolean;
  circleValuedMorseMapCertified: boolean;
  smoothingCompatibilityCertified: boolean;
  certificateHashes: string[];
}

export interface CertifiedFiniteActionEvidence {
  sourceQuotientVertexIds: string[];
  candidate: TorsionFreeActionCandidate;
  certificate: TorsionFreeActionCertificate;
  actionHashAlgorithm: "sha256";
  actionHash: string;
}

export interface FullDavisVirtualFiberingCertificate {
  schemaVersion: 2;
  kind: "full-davis-virtual-algebraic-fibering-certificate";
  method: "torsion-free-full-davis-pulling-morse";
  status: "passed" | "failed" | "incomplete";
  source: {
    coxeterSystemName: string;
    coxeterSystem: CoxeterSystemInput;
    quotientName: string;
    subgroupName: string;
    subgroupIndex: number;
  };
  stages: FullDavisFiberingStage[];
  subgroupAction?: CertifiedFiniteActionEvidence;
  coverCompression?: CoverCompressionResult;
  fullCellPoset?: FullDavisQuotientCellPoset;
  wallSystem?: WallSystem;
  coorientation?: WallCoorientation;
  wallHomomorphism?: WallHomomorphismFiniteCertificate;
  primitiveHomomorphism?: PrimitiveSchreierHomomorphismCertificate;
  triangulation?: PullingTriangulationCertificate;
  heightFunction?: PrimitiveMorseHeightCertificate;
  directedLinks?: FullDirectedLinkCertificate;
  imm23Hypotheses?: Imm23FibrationHypotheses;
  result: {
    closedIntegralWallCocycle: boolean;
    wallCocycleExtendsAcrossEveryCoxeterCell: boolean;
    explicitPrimitiveEpimorphismToZ: boolean;
    allAscendingAndDescendingLinksNonemptyConnected: boolean;
    finitelyGeneratedKernel: boolean;
    virtualAlgebraicFibration: boolean;
    allDirectedLinksCollapsible: boolean;
    imm23TopologicalFibrationCertified: boolean;
    exactSequence?: string;
    statement: string;
  };
  hashes: {
    sourceSystemSha256: string;
    actionSha256?: string;
    coverCompressionSha256?: string;
    cellPoset?: string;
    wallSystemSha256?: string;
    coorientationSha256?: string;
    wallHomomorphismSha256?: string;
    primitiveHomomorphismSha256?: string;
    triangulation?: string;
    heightFunction?: string;
    directedLinks?: string;
    artifactSha256?: string;
  };
  errors: string[];
  warnings: string[];
  references: string[];
  nonClaims: string[];
}

export interface FullDavisCertificateVerification {
  schemaVersion: 1;
  kind: "full-davis-certificate-replay";
  valid: boolean;
  errors: string[];
  checkedHashes: string[];
  reconstructedHashes: Record<string, string>;
  mandatoryStagesPassed: boolean;
  replayedCollapseCertificates: number;
  replayHashAlgorithm: "sha256";
  replayHash: string;
}

export interface FullDavisCertificationInput {
  quotient: QuotientComplex;
  acceptedAction?: TorsionFreeCandidateResult;
  sourceQuotientVertexIds?: readonly string[];
  requestedWallSigns?: Partial<Record<string, OrientationSign>>;
  collapsibilityOptions?: CollapsibilitySearchOptions;
  /** @deprecated Retained for call-site compatibility; never promotes a bundle claim. */
  imm23Hypotheses?: Imm23FibrationHypotheses;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const MANDATORY_FIBERING_STAGES: readonly FullDavisFiberingStageId[] = [
  "torsion-free-action",
  "cover-and-compression",
  "complete-cell-poset",
  "two-sided-walls",
  "closed-wall-cocycle",
  "primitive-schreier-character",
  "compatible-pulling-triangulation",
  "primitive-pl-height",
  "full-cell-cocycle-extension",
  "full-directed-links",
];

function mandatoryStageErrors(
  stages: readonly FullDavisFiberingStage[],
): string[] {
  const errors: string[] = [];
  for (const id of MANDATORY_FIBERING_STAGES) {
    const matches = stages.filter((entry) => entry.id === id);
    if (matches.length !== 1) {
      errors.push(
        `Mandatory stage ${id} occurs ${matches.length} times; exactly one record is required.`,
      );
    } else if (matches[0].status !== "passed") {
      errors.push(`Mandatory stage ${id} is ${matches[0].status}, not passed.`);
    }
  }
  return errors;
}

function jsonData(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function stage(
  id: FullDavisFiberingStageId,
  label: string,
  status: FullDavisFiberingStage["status"],
  detail: string,
): FullDavisFiberingStage {
  return { id, label, status, detail };
}

function sourceSystemOrThrow(quotient: QuotientComplex): CoxeterSystemInput {
  if (!quotient.sourceSystem) {
    throw new Error("The quotient does not include its source Coxeter system.");
  }
  return quotient.sourceSystem;
}

function compareQuotientVertexIds(left: string, right: string): number {
  const leftPoint = /^q(\d+)$/.exec(left);
  const rightPoint = /^q(\d+)$/.exec(right);
  if (leftPoint && rightPoint) {
    const numeric = Number(leftPoint[1]) - Number(rightPoint[1]);
    if (numeric !== 0) return numeric;
  }
  return compareIds(left, right);
}

function canonicalQuotientFromAction(
  system: CoxeterSystemInput,
  accepted: TorsionFreeCandidateResult,
  quotientName: string,
  subgroupName: string,
): QuotientComplex {
  return acceptedActionToQuotientComplex(system, accepted, {
    name: quotientName,
    subgroupName,
  });
}

/**
 * Reconstruct and independently recertify the complete finite right action
 * stored in a quotient artifact. Vertex order is canonicalized before any
 * Davis cells are enumerated, so JSON array order cannot change the result.
 */
export function certifyFiniteActionFromQuotient(quotient: QuotientComplex): {
  accepted: TorsionFreeCandidateResult;
  sourceQuotientVertexIds: string[];
} {
  const system = sourceSystemOrThrow(quotient);
  if (!quotient.permutationAction) {
    throw new Error(
      "The quotient has no complete permutation action. A finite action must be discovered or imported before certification.",
    );
  }
  const vertices = [...quotient.vertices].sort((left, right) =>
    compareQuotientVertexIds(left.id, right.id),
  );
  const sourceQuotientVertexIds = vertices.map((vertex) => vertex.id);
  const pointById = new Map(
    sourceQuotientVertexIds.map((id, point) => [id, point]),
  );
  const actionByGenerator = new Map(
    quotient.permutationAction.map((action) => [action.generator, action]),
  );
  const generatorImages: number[][] = [];
  for (let generator = 0; generator < system.rank; generator += 1) {
    const action = actionByGenerator.get(generator);
    if (!action)
      throw new Error(`The quotient action omits generator ${generator}.`);
    generatorImages.push(
      sourceQuotientVertexIds.map((vertexId) => {
        const imageId = action.images[vertexId];
        const image = pointById.get(imageId);
        if (image === undefined) {
          throw new Error(
            `Generator ${generator} sends ${vertexId} to unknown vertex ${String(imageId)}.`,
          );
        }
        return image;
      }),
    );
  }
  const candidate: TorsionFreeActionCandidate = {
    id: `quotient-action:${canonicalSha256({
      matrix: system.coxeterMatrix,
      sourceQuotientVertexIds,
      generatorImages,
    }).slice(0, 20)}`,
    name: quotient.subgroup?.name ?? quotient.name,
    index: vertices.length,
    generatorImages,
    pointLabels: vertices.map((vertex) => vertex.label ?? vertex.id),
    representativeWords: vertices.map(
      (vertex) => vertex.representativeWord ?? [],
    ),
    backend:
      quotient.verifier?.backend ??
      quotient.subgroup?.certificate?.backend ??
      "reconstructed-quotient-action",
    source: quotient.subgroup?.source,
    notes: [
      "Reconstructed from the complete quotient permutation action and independently recertified in this run.",
    ],
  };
  const sphericalPlan = planSphericalSpecialSubgroups(system);
  const certificate = certifyTorsionFreeAction(
    system,
    candidate,
    sphericalPlan,
  );
  if (certificate.status !== "passed") {
    throw new Error(
      `The reconstructed finite action is not torsion-free certified: ${certificate.errors.join(" ")}`,
    );
  }
  return { accepted: { candidate, certificate }, sourceQuotientVertexIds };
}

function actionEvidence(
  system: CoxeterSystemInput,
  accepted: TorsionFreeCandidateResult,
  sourceQuotientVertexIds: readonly string[],
): CertifiedFiniteActionEvidence {
  const actionHash = canonicalSha256({
    system: jsonData(system),
    sourceQuotientVertexIds: [...sourceQuotientVertexIds],
    generatorImages: accepted.candidate.generatorImages,
    certificate: jsonData(accepted.certificate),
  });
  return {
    sourceQuotientVertexIds: [...sourceQuotientVertexIds],
    candidate: accepted.candidate,
    certificate: accepted.certificate,
    actionHashAlgorithm: "sha256",
    actionHash,
  };
}

function allLinksCollapsible(
  links: FullDirectedLinkCertificate | undefined,
): boolean {
  return Boolean(
    links &&
    links.vertices.every(
      (vertex) =>
        vertex.ascending.collapsibility.status === "collapsible" &&
        vertex.descending.collapsibility.status === "collapsible" &&
        vertex.ascending.collapseCertificateVerification?.valid === true &&
        vertex.descending.collapseCertificateVerification?.valid === true,
    ),
  );
}

function artifactHashPayload(input: {
  sourceSystemSha256: string;
  quotientName: string;
  subgroupName: string;
  stages: readonly FullDavisFiberingStage[];
  hashes: FullDavisVirtualFiberingCertificate["hashes"];
  coorientation?: WallCoorientation;
  primitiveHomomorphism?: PrimitiveSchreierHomomorphismCertificate;
  result: FullDavisVirtualFiberingCertificate["result"];
}): unknown {
  const sectionHashes = { ...input.hashes };
  delete sectionHashes.artifactSha256;
  return {
    schemaVersion: 2,
    source: {
      system: input.sourceSystemSha256,
      quotientName: input.quotientName,
      subgroupName: input.subgroupName,
    },
    stages: input.stages.map(({ id, status, detail }) => ({
      id,
      status,
      detail,
    })),
    hashes: sectionHashes,
    wallSigns: input.coorientation?.wallSigns ?? {},
    primitiveGeneratorValues:
      input.primitiveHomomorphism?.generatorValues.map((entry) => ({
        generatorId: entry.generatorId,
        primitiveValue: entry.primitiveValue,
      })) ?? [],
    result: input.result,
  };
}

/**
 * Run the complete full-Davis certification profile. Every theorem-facing
 * conclusion is reconstructed from finite incidence data; scene coordinates
 * and browser drawings are never inputs to this function.
 */
export function certifyFullDavisVirtualAlgebraicFibration(
  input: FullDavisCertificationInput,
): FullDavisVirtualFiberingCertificate {
  const { quotient } = input;
  const system = sourceSystemOrThrow(quotient);
  const quotientName = quotient.name;
  const subgroupName = quotient.subgroup?.name ?? "H";
  const errors: string[] = [];
  const warnings: string[] = [];
  const stages: FullDavisFiberingStage[] = [];
  let accepted: TorsionFreeCandidateResult | undefined;
  let certificationQuotient: QuotientComplex | undefined;
  let sourceQuotientVertexIds: string[] = [];
  let subgroupAction: CertifiedFiniteActionEvidence | undefined;
  let coverCompression: CoverCompressionResult | undefined;
  let fullCellPoset: FullDavisQuotientCellPoset | undefined;
  let wallSystem: WallSystem | undefined;
  let coorientation: WallCoorientation | undefined;
  let wallHomomorphism: WallHomomorphismFiniteCertificate | undefined;
  let primitiveHomomorphism:
    | PrimitiveSchreierHomomorphismCertificate
    | undefined;
  let triangulation: PullingTriangulationCertificate | undefined;
  let heightFunction: PrimitiveMorseHeightCertificate | undefined;
  let directedLinks: FullDirectedLinkCertificate | undefined;

  try {
    if (input.acceptedAction) {
      const reconstructed = certifyFiniteActionFromQuotient(quotient);
      if (
        JSON.stringify(reconstructed.accepted.candidate.generatorImages) !==
        JSON.stringify(input.acceptedAction.candidate.generatorImages)
      ) {
        throw new Error(
          "The supplied accepted action does not match the quotient permutation action.",
        );
      }
      if (
        input.sourceQuotientVertexIds &&
        JSON.stringify(input.sourceQuotientVertexIds) !==
          JSON.stringify(reconstructed.sourceQuotientVertexIds)
      ) {
        throw new Error(
          "The supplied quotient vertex order does not match the canonical quotient action order.",
        );
      }
      accepted = reconstructed.accepted;
      sourceQuotientVertexIds = reconstructed.sourceQuotientVertexIds;
    } else {
      ({ accepted, sourceQuotientVertexIds } =
        certifyFiniteActionFromQuotient(quotient));
    }
    certificationQuotient = canonicalQuotientFromAction(
      system,
      accepted,
      quotientName,
      subgroupName,
    );
    sourceQuotientVertexIds = Array.from(
      { length: accepted.candidate.index },
      (_unused, point) => `q${point}`,
    );
    subgroupAction = actionEvidence(system, accepted, sourceQuotientVertexIds);
    stages.push(
      stage(
        "torsion-free-action",
        "Torsion-free finite action",
        "passed",
        `A transitive index-${accepted.candidate.index} action is free on every spherical special subgroup.`,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    stages.push(
      stage(
        "torsion-free-action",
        "Torsion-free finite action",
        "incomplete",
        message,
      ),
    );
  }

  if (accepted && certificationQuotient) {
    try {
      coverCompression = buildCoverCompression(certificationQuotient);
      const passed = coverCompression.certificate.status === "passed";
      stages.push(
        stage(
          "cover-and-compression",
          "Finite cover and 2-skeleton compression",
          passed ? "passed" : "failed",
          passed
            ? "The finite cover and signed rank-two compression maps are exact."
            : coverCompression.certificate.errors.join(" "),
        ),
      );
      if (!passed) errors.push(...coverCompression.certificate.errors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      stages.push(
        stage(
          "cover-and-compression",
          "Finite cover and 2-skeleton compression",
          "incomplete",
          message,
        ),
      );
    }

    try {
      fullCellPoset = buildFullDavisQuotientCellPoset(system, accepted, {
        sourceQuotientVertexIds,
      });
      stages.push(
        stage(
          "complete-cell-poset",
          "Complete Davis quotient cell poset",
          "passed",
          `${fullCellPoset.cells.length} cells through dimension ${fullCellPoset.dimension} were enumerated as spherical-subgroup orbits.`,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      stages.push(
        stage(
          "complete-cell-poset",
          "Complete Davis quotient cell poset",
          "incomplete",
          message,
        ),
      );
    }
  }

  if (coverCompression) {
    wallSystem = findWallSystem(coverCompression.barX);
    const twoSided = wallSystem.diagnostics.twoSided;
    coorientation = createWallCoorientation(
      wallSystem,
      input.requestedWallSigns,
    );
    const passed = twoSided && coorientation.valid;
    stages.push(
      stage(
        "two-sided-walls",
        "Quotient walls and coorientation",
        passed ? "passed" : "failed",
        passed
          ? `${wallSystem.walls.length} quotient walls are two-sided and carry the exported signs.`
          : [
              ...coorientation.errors,
              ...wallSystem.diagnostics.twoSidednessWitnesses.map(
                (witness) =>
                  `Wall ${witness.wallId} has an orientation-parity conflict.`,
              ),
            ].join(" "),
      ),
    );
    if (!passed)
      errors.push(
        ...coorientation.errors,
        "At least one quotient wall is not two-sided.",
      );

    wallHomomorphism = certifyWallHomomorphismFiniteData(
      coverCompression.barX,
      wallSystem,
      coorientation,
    );
    const cocyclePassed =
      wallHomomorphism.cocycle.closed &&
      wallHomomorphism.cocycle.edgeValues.every((entry) => entry.value !== 0);
    stages.push(
      stage(
        "closed-wall-cocycle",
        "Rank-two cocycle equations",
        cocyclePassed ? "passed" : "failed",
        cocyclePassed
          ? `${wallHomomorphism.cocycle.relationChecks.length}/${wallHomomorphism.cocycle.relationChecks.length} signed rank-two boundary sums vanish.`
          : `${wallHomomorphism.cocycle.relationChecks.filter((check) => check.passed).length}/${wallHomomorphism.cocycle.relationChecks.length} signed rank-two boundary sums vanish.`,
      ),
    );
    if (!cocyclePassed) {
      errors.push(
        ...wallHomomorphism.cocycle.failures.map((failure) => failure.message),
        "A PL Morse edge value must be nonzero on every generator edge.",
      );
    }

    primitiveHomomorphism = certifyPrimitiveSchreierHomomorphism({
      quotient: certificationQuotient!,
      cover: coverCompression,
      finiteWallCertificate: wallHomomorphism,
    });
    stages.push(
      stage(
        "primitive-schreier-character",
        "Primitive Reidemeister-Schreier character",
        primitiveHomomorphism.status === "passed" ? "passed" : "failed",
        primitiveHomomorphism.status === "passed"
          ? `The raw periods have gcd ${primitiveHomomorphism.normalizationDivisor}; division gives a verified epimorphism H -> Z.`
          : primitiveHomomorphism.errors.join(" "),
      ),
    );
    errors.push(...primitiveHomomorphism.errors);
  }

  if (fullCellPoset) {
    triangulation = buildCompatiblePullingTriangulation(fullCellPoset);
    stages.push(
      stage(
        "compatible-pulling-triangulation",
        "Compatible pulling triangulation",
        triangulation.status,
        triangulation.status === "passed"
          ? `${triangulation.maximalSimplices.length} maximal simplices use one fixed quotient-vertex order.`
          : triangulation.errors.join(" "),
      ),
    );
    errors.push(...triangulation.errors);
  }

  if (
    fullCellPoset &&
    triangulation &&
    coverCompression &&
    wallHomomorphism &&
    primitiveHomomorphism
  ) {
    heightFunction = buildPrimitiveMorseHeightCertificate({
      poset: fullCellPoset,
      triangulation,
      cover: coverCompression,
      finiteWallCertificate: wallHomomorphism,
      primitiveHomomorphism,
    });
    stages.push(
      stage(
        "primitive-pl-height",
        "Primitive PL height",
        heightFunction.status,
        heightFunction.status === "passed"
          ? "Cell-local height lifts, rational tie breakers, and affine simplex extensions preserve every generator-edge direction."
          : heightFunction.errors.join(" "),
      ),
    );
    errors.push(...heightFunction.errors);

    const fullCellExtensionPassed =
      heightFunction.status === "passed" &&
      heightFunction.checks.everyCellIntegrated &&
      heightFunction.checks.overlapDifferencesConstant;
    const higherCellCount = fullCellPoset.cells.filter(
      (cell) => cell.dimension >= 3,
    ).length;
    stages.push(
      stage(
        "full-cell-cocycle-extension",
        "Cocycle extension across every Coxeter cell",
        fullCellExtensionPassed ? "passed" : "failed",
        fullCellExtensionPassed
          ? `The compression-wall cocycle integrates consistently on all ${fullCellPoset.cells.length} Davis cells, including ${higherCellCount} cells of dimension at least three.`
          : "The compression-wall cocycle does not extend consistently across every cell of the complete Davis quotient.",
      ),
    );
    if (!fullCellExtensionPassed) {
      errors.push(
        "The compression-wall cocycle failed its explicit full-cell extension check.",
      );
    }

    directedLinks = buildFullDirectedLinkCertificate({
      poset: fullCellPoset,
      triangulation,
      height: heightFunction,
      collapsibilityOptions: input.collapsibilityOptions,
    });
    stages.push(
      stage(
        "full-directed-links",
        "Full ascending and descending links",
        directedLinks.status,
        directedLinks.status === "passed"
          ? `Both directed links are nonempty and connected at all ${directedLinks.vertices.length} quotient vertex orbits.`
          : directedLinks.errors.join(" "),
      ),
    );
    errors.push(...directedLinks.errors);
    const collapsible = allLinksCollapsible(directedLinks);
    const unknown =
      directedLinks.collapsibilitySummary.ascendingUnknown +
      directedLinks.collapsibilitySummary.descendingUnknown;
    stages.push(
      stage(
        "link-collapsibility",
        "Directed-link collapsibility",
        collapsible ? "passed" : unknown > 0 ? "incomplete" : "failed",
        collapsible
          ? "Every ascending and descending link has a replayable elementary-collapse sequence."
          : unknown > 0
            ? `${unknown} directed-link collapse searches exhausted their budgets; no negative claim is made.`
            : "At least one directed link has an exhaustive noncollapsibility certificate.",
      ),
    );
  }

  const closedIntegralWallCocycle = Boolean(
    wallHomomorphism?.cocycle.closed &&
    wallHomomorphism.cocycle.edgeValues.every((entry) => entry.value !== 0),
  );
  const wallCocycleExtendsAcrossEveryCoxeterCell = Boolean(
    heightFunction?.status === "passed" &&
    heightFunction.checks.everyCellIntegrated &&
    heightFunction.checks.overlapDifferencesConstant,
  );
  const explicitPrimitiveEpimorphismToZ = Boolean(
    primitiveHomomorphism?.status === "passed" &&
    primitiveHomomorphism.primitiveImage,
  );
  const linksPassed = Boolean(directedLinks?.status === "passed");
  const mandatoryStageProblems = mandatoryStageErrors(stages);
  const mandatoryStagesPassed = mandatoryStageProblems.length === 0;
  const finitelyGeneratedKernel =
    mandatoryStagesPassed &&
    closedIntegralWallCocycle &&
    wallCocycleExtendsAcrossEveryCoxeterCell &&
    explicitPrimitiveEpimorphismToZ &&
    linksPassed;
  const virtualAlgebraicFibration = finitelyGeneratedKernel;
  const allDirectedLinksCollapsible = allLinksCollapsible(directedLinks);
  // A theorem-level IMM23 conclusion needs source-bound manifold, PL, and
  // smoothing evidence with its own replay. Caller-supplied booleans and hash
  // strings are not such a verifier, so this schema must fail closed.
  const imm23TopologicalFibrationCertified = false;
  const result: FullDavisVirtualFiberingCertificate["result"] = {
    closedIntegralWallCocycle,
    wallCocycleExtendsAcrossEveryCoxeterCell,
    explicitPrimitiveEpimorphismToZ,
    allAscendingAndDescendingLinksNonemptyConnected: linksPassed,
    finitelyGeneratedKernel,
    virtualAlgebraicFibration,
    allDirectedLinksCollapsible,
    imm23TopologicalFibrationCertified,
    ...(virtualAlgebraicFibration
      ? { exactSequence: `1 -> ker(phi) -> ${subgroupName} -> Z -> 1` }
      : {}),
    statement: virtualAlgebraicFibration
      ? `The exported primitive character phi: ${subgroupName} -> Z has finitely generated kernel, certified from the full subdivided Davis quotient.`
      : "This run does not certify a virtual algebraic fibration. The failed or missing finite checks are listed by stage.",
  };

  const sourceSystemSha256 = canonicalSha256(jsonData(system));
  const hashes: FullDavisVirtualFiberingCertificate["hashes"] = {
    sourceSystemSha256,
    ...(subgroupAction ? { actionSha256: subgroupAction.actionHash } : {}),
    ...(coverCompression
      ? { coverCompressionSha256: canonicalSha256(jsonData(coverCompression)) }
      : {}),
    ...(fullCellPoset ? { cellPoset: fullCellPoset.archiveHash } : {}),
    ...(wallSystem
      ? { wallSystemSha256: canonicalSha256(jsonData(wallSystem)) }
      : {}),
    ...(coorientation
      ? { coorientationSha256: canonicalSha256(jsonData(coorientation)) }
      : {}),
    ...(wallHomomorphism
      ? {
          wallHomomorphismSha256: canonicalSha256(jsonData(wallHomomorphism)),
        }
      : {}),
    ...(primitiveHomomorphism
      ? {
          primitiveHomomorphismSha256: canonicalSha256(
            jsonData(primitiveHomomorphism),
          ),
        }
      : {}),
    ...(triangulation
      ? { triangulation: triangulation.triangulationHash }
      : {}),
    ...(heightFunction ? { heightFunction: heightFunction.heightHash } : {}),
    ...(directedLinks ? { directedLinks: directedLinks.linksHash } : {}),
  };
  hashes.artifactSha256 = canonicalSha256(
    artifactHashPayload({
      sourceSystemSha256,
      quotientName,
      subgroupName,
      stages,
      hashes,
      coorientation,
      primitiveHomomorphism,
      result,
    }),
  );

  const requiredIncomplete = MANDATORY_FIBERING_STAGES.some((id) => {
    const matches = stages.filter((entry) => entry.id === id);
    return (
      matches.length !== 1 ||
      matches[0].status === "incomplete" ||
      matches[0].status === "not-run"
    );
  });
  const status: FullDavisVirtualFiberingCertificate["status"] =
    virtualAlgebraicFibration
      ? "passed"
      : requiredIncomplete
        ? "incomplete"
        : "failed";
  if (!mandatoryStagesPassed) {
    errors.push(...mandatoryStageProblems);
  }
  if (!allDirectedLinksCollapsible) {
    warnings.push(
      "Collapsibility is not part of the finite-generation conclusion. Unknown or failed collapse checks block only the stronger conditional IMM-style conclusion.",
    );
  }
  if (input.imm23Hypotheses) {
    warnings.push(
      "The legacy IMM23 hypothesis record was ignored because no source-bound manifold/PL/smoothing verifier is implemented.",
    );
  } else {
    warnings.push(
      "No compact-manifold and smoothing certificate was supplied, so no topological or smooth bundle conclusion is made.",
    );
  }

  return {
    schemaVersion: 2,
    kind: "full-davis-virtual-algebraic-fibering-certificate",
    method: "torsion-free-full-davis-pulling-morse",
    status,
    source: {
      coxeterSystemName: system.name,
      coxeterSystem: system,
      quotientName,
      subgroupName,
      subgroupIndex:
        accepted?.candidate.index ??
        quotient.subgroup?.index ??
        quotient.vertices.length,
    },
    stages,
    ...(subgroupAction ? { subgroupAction } : {}),
    ...(coverCompression ? { coverCompression } : {}),
    ...(fullCellPoset ? { fullCellPoset } : {}),
    ...(wallSystem ? { wallSystem } : {}),
    ...(coorientation ? { coorientation } : {}),
    ...(wallHomomorphism ? { wallHomomorphism } : {}),
    ...(primitiveHomomorphism ? { primitiveHomomorphism } : {}),
    ...(triangulation ? { triangulation } : {}),
    ...(heightFunction ? { heightFunction } : {}),
    ...(directedLinks ? { directedLinks } : {}),
    result,
    hashes,
    errors: [...new Set(errors.filter(Boolean))].sort(compareIds),
    warnings: [...new Set(warnings)].sort(compareIds),
    references: [
      "M. Davis, The Geometry and Topology of Coxeter Groups: the Davis complex and spherical special-subgroup cells.",
      "M. Bestvina, PL Morse theory notes: ascending/descending links and finite-generation criteria.",
      "K. Jankiewicz and D. Wise, Incoherent Coxeter Groups, arXiv:1503.03102: quotient walls and coorientations.",
      "G. Italiano, B. Martelli, M. Migliorini, Hyperbolic 5-manifolds that fiber over S1, Invent. Math. 231 (2023): collapsible-link fibration criterion under additional manifold hypotheses.",
    ],
    nonClaims: [
      "The browser does not infer a torsion-free subgroup when no complete finite permutation action is available.",
      "A virtual algebraic fibration is an epimorphism to Z with finitely generated kernel; it is not automatically a locally trivial topological bundle.",
      "Collapsible links do not imply the IMM23 bundle conclusion without separate compact smooth manifold, dimension, PL, circle-map, and smoothing certificates.",
      "No smooth fibration is certified by the current pipeline.",
      "No renderer coordinates or drawing offsets are used as mathematical evidence.",
    ],
  };
}

function gcdIntegers(values: readonly number[]): number {
  const gcdPair = (left: number, right: number): number => {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  };
  return values.reduce(gcdPair, 0);
}

function linkConnectivityFromSimplices(simplices: readonly string[][]): {
  nonempty: boolean;
  connected: boolean;
} {
  const vertices = [...new Set(simplices.flat())];
  if (vertices.length === 0) return { nonempty: false, connected: false };
  const adjacency = new Map(
    vertices.map((vertex) => [vertex, new Set<string>()]),
  );
  for (const simplex of simplices) {
    for (let left = 0; left < simplex.length; left += 1) {
      for (let right = left + 1; right < simplex.length; right += 1) {
        adjacency.get(simplex[left])?.add(simplex[right]);
        adjacency.get(simplex[right])?.add(simplex[left]);
      }
    }
  }
  const seen = new Set<string>();
  const queue = [vertices[0]];
  seen.add(vertices[0]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of adjacency.get(queue[cursor]) ?? []) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return { nonempty: true, connected: seen.size === vertices.length };
}

function directedLinkIncidencePayload(
  links: FullDirectedLinkCertificate,
): unknown {
  return links.vertices.map((vertex) => ({
    vertexId: vertex.vertexId,
    sourceQuotientVertexId: vertex.sourceQuotientVertexId,
    ascending: {
      faceOccurrences: vertex.ascending.faceOccurrences,
      maximalSimplices: vertex.ascending.maximalSimplices,
      components: vertex.ascending.components,
      nonempty: vertex.ascending.nonempty,
      connected: vertex.ascending.connected,
    },
    descending: {
      faceOccurrences: vertex.descending.faceOccurrences,
      maximalSimplices: vertex.descending.maximalSimplices,
      components: vertex.descending.components,
      nonempty: vertex.descending.nonempty,
      connected: vertex.descending.connected,
    },
  }));
}

function finishFullDavisReplay(input: {
  errors: readonly string[];
  checkedHashes: readonly string[];
  reconstructedHashes: Readonly<Record<string, string>>;
  mandatoryStagesPassed: boolean;
  replayedCollapseCertificates: number;
}): FullDavisCertificateVerification {
  const payload = {
    schemaVersion: 1 as const,
    kind: "full-davis-certificate-replay" as const,
    valid: input.errors.length === 0,
    errors: [...new Set(input.errors)].sort(compareIds),
    checkedHashes: [...new Set(input.checkedHashes)].sort(compareIds),
    reconstructedHashes: Object.fromEntries(
      Object.entries(input.reconstructedHashes).sort(([left], [right]) =>
        compareIds(left, right),
      ),
    ),
    mandatoryStagesPassed: input.mandatoryStagesPassed,
    replayedCollapseCertificates: input.replayedCollapseCertificates,
    replayHashAlgorithm: "sha256" as const,
  };
  return { ...payload, replayHash: canonicalSha256(payload) };
}

/**
 * Rebuild every theorem-facing object from the finite action. Embedded cover,
 * wall, height, and link records are comparison targets, never replay roots.
 */
export function verifyFullDavisVirtualFiberingCertificate(
  certificate: FullDavisVirtualFiberingCertificate,
): FullDavisCertificateVerification {
  const errors: string[] = [];
  const checkedHashes: string[] = [];
  const reconstructedHashes: Record<string, string> = {};
  let replayedCollapseCertificates = 0;
  const expectHash = (
    label: string,
    actual: string | undefined,
    expected: string | undefined,
  ): void => {
    if (!actual || !expected || actual !== expected) {
      errors.push(`${label} hash is missing or does not match its contents.`);
    } else {
      checkedHashes.push(label);
    }
  };
  const compareRebuilt = (
    label: string,
    stored: unknown,
    rebuilt: unknown,
    declaredHash?: string,
  ): void => {
    const storedHash = canonicalSha256(jsonData(stored));
    const rebuiltHash = canonicalSha256(jsonData(rebuilt));
    reconstructedHashes[label] = rebuiltHash;
    if (declaredHash) expectHash(label, declaredHash, storedHash);
    if (storedHash !== rebuiltHash) {
      errors.push(`${label} does not match the action-rooted reconstruction.`);
    }
  };
  const system = certificate.source.coxeterSystem;
  let mandatoryStagesPassed = false;

  try {
    if (
      certificate.schemaVersion !== 2 ||
      certificate.kind !==
        "full-davis-virtual-algebraic-fibering-certificate" ||
      certificate.method !== "torsion-free-full-davis-pulling-morse"
    ) {
      errors.push("The full-Davis certificate header is unsupported.");
    }
    if (certificate.status === "passed" && certificate.errors.length > 0) {
      errors.push("A passed full-Davis certificate contains recorded errors.");
    }
    if (certificate.imm23Hypotheses) {
      errors.push(
        "Legacy caller-supplied IMM23 booleans are not replayable evidence and are unsupported.",
      );
    }
    const sourceHash = canonicalSha256(jsonData(system));
    reconstructedHashes["source-system"] = sourceHash;
    expectHash(
      "source-system",
      certificate.hashes.sourceSystemSha256,
      sourceHash,
    );
    if (certificate.source.coxeterSystemName !== system.name) {
      errors.push("The source-system name does not match the embedded system.");
    }

    let recertifiedAction: TorsionFreeCandidateResult | undefined;
    let canonicalQuotient: QuotientComplex | undefined;
    let canonicalVertexIds: string[] = [];
    if (certificate.subgroupAction) {
      const actionCertificate = certifyTorsionFreeAction(
        system,
        certificate.subgroupAction.candidate,
        planSphericalSpecialSubgroups(system),
      );
      if (actionCertificate.status !== "passed") {
        errors.push(
          `The exported action fails independent torsion checks: ${actionCertificate.errors.join(" ")}`,
        );
      } else {
        recertifiedAction = {
          candidate: certificate.subgroupAction.candidate,
          certificate: actionCertificate,
        };
      }
      if (
        canonicalSha256(jsonData(certificate.subgroupAction.certificate)) !==
        canonicalSha256(jsonData(actionCertificate))
      ) {
        errors.push("The embedded torsion-free action certificate is stale.");
      }
      canonicalVertexIds = Array.from(
        { length: certificate.subgroupAction.candidate.index },
        (_unused, point) => `q${point}`,
      );
      if (
        canonicalSha256(certificate.subgroupAction.sourceQuotientVertexIds) !==
        canonicalSha256(canonicalVertexIds)
      ) {
        errors.push(
          "The finite-action vertex order is not the canonical q0,...,q(n-1) order.",
        );
      }
      const actionHash = canonicalSha256({
        system: jsonData(system),
        sourceQuotientVertexIds: canonicalVertexIds,
        generatorImages: certificate.subgroupAction.candidate.generatorImages,
        certificate: jsonData(actionCertificate),
      });
      reconstructedHashes["finite-action"] = actionHash;
      expectHash("finite-action", certificate.hashes.actionSha256, actionHash);
      if (certificate.subgroupAction.actionHash !== actionHash) {
        errors.push("The finite-action evidence carries a stale action hash.");
      }
      if (recertifiedAction) {
        canonicalQuotient = canonicalQuotientFromAction(
          system,
          recertifiedAction,
          certificate.source.quotientName,
          certificate.source.subgroupName,
        );
        reconstructedHashes["canonical-quotient"] = canonicalSha256(
          jsonData(canonicalQuotient),
        );
        if (
          certificate.source.subgroupIndex !== recertifiedAction.candidate.index
        ) {
          errors.push(
            "The reported subgroup index disagrees with the action degree.",
          );
        }
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits its finite subgroup action.");
    }

    const rebuiltCover = canonicalQuotient
      ? buildCoverCompression(canonicalQuotient)
      : undefined;
    if (certificate.coverCompression && rebuiltCover) {
      compareRebuilt(
        "cover-compression",
        certificate.coverCompression,
        rebuiltCover,
        certificate.hashes.coverCompressionSha256,
      );
      if (rebuiltCover.certificate.status !== "passed") {
        errors.push(
          "The action-rooted cover/compression certificate is not passed.",
        );
      }
    } else if (certificate.status === "passed") {
      errors.push(
        "A passed artifact omits action-rooted finite-cover evidence.",
      );
    }

    const rebuiltPoset = recertifiedAction
      ? buildFullDavisQuotientCellPoset(system, recertifiedAction, {
          sourceQuotientVertexIds: canonicalVertexIds,
        })
      : undefined;
    if (certificate.fullCellPoset && rebuiltPoset) {
      const storedArchiveHash = computeFullDavisQuotientArchiveHash(
        system,
        certificate.fullCellPoset,
      );
      expectHash(
        "full-cell-poset",
        certificate.hashes.cellPoset,
        storedArchiveHash,
      );
      reconstructedHashes["full-cell-poset"] = rebuiltPoset.archiveHash;
      if (
        certificate.fullCellPoset.archiveHash !== storedArchiveHash ||
        certificate.fullCellPoset.certificate.archiveHash !== storedArchiveHash
      ) {
        errors.push("The full Davis cell poset carries a stale archive hash.");
      }
      if (
        canonicalSha256(jsonData(certificate.fullCellPoset)) !==
        canonicalSha256(jsonData(rebuiltPoset))
      ) {
        errors.push(
          "The complete cell poset does not match the certified action.",
        );
      }
      if (
        !rebuiltPoset.certificate.countChecks.every((check) => check.passed)
      ) {
        errors.push(
          "At least one reconstructed spherical-cell orbit count failed.",
        );
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits the complete Davis cell poset.");
    }

    const rebuiltWalls = rebuiltCover
      ? findWallSystem(rebuiltCover.barX)
      : undefined;
    if (certificate.wallSystem && rebuiltWalls) {
      compareRebuilt(
        "wall-system",
        certificate.wallSystem,
        rebuiltWalls,
        certificate.hashes.wallSystemSha256,
      );
      if (!rebuiltWalls.diagnostics.twoSided) {
        errors.push("The action-rooted quotient wall system is not two-sided.");
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits its quotient wall system.");
    }

    const rebuiltCoorientation =
      rebuiltWalls && certificate.coorientation
        ? createWallCoorientation(
            rebuiltWalls,
            certificate.coorientation.wallSigns,
          )
        : undefined;
    if (certificate.coorientation && rebuiltCoorientation) {
      compareRebuilt(
        "wall-coorientation",
        certificate.coorientation,
        rebuiltCoorientation,
        certificate.hashes.coorientationSha256,
      );
      if (!rebuiltCoorientation.valid) {
        errors.push("The action-rooted wall coorientation is invalid.");
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits its wall coorientation.");
    }

    const rebuiltWallHomomorphism =
      rebuiltCover && rebuiltWalls && rebuiltCoorientation
        ? certifyWallHomomorphismFiniteData(
            rebuiltCover.barX,
            rebuiltWalls,
            rebuiltCoorientation,
          )
        : undefined;
    if (certificate.wallHomomorphism && rebuiltWallHomomorphism) {
      compareRebuilt(
        "wall-homomorphism",
        certificate.wallHomomorphism,
        rebuiltWallHomomorphism,
        certificate.hashes.wallHomomorphismSha256,
      );
      if (
        !rebuiltWallHomomorphism.cocycle.closed ||
        !rebuiltWallHomomorphism.cocycle.relationChecks.every(
          (check) => check.passed && check.boundarySum === 0,
        )
      ) {
        errors.push(
          "At least one reconstructed rank-two cocycle equation fails.",
        );
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits its wall cocycle.");
    }

    const rebuiltPrimitive =
      canonicalQuotient && rebuiltCover && rebuiltWallHomomorphism
        ? certifyPrimitiveSchreierHomomorphism({
            quotient: canonicalQuotient,
            cover: rebuiltCover,
            finiteWallCertificate: rebuiltWallHomomorphism,
          })
        : undefined;
    if (certificate.primitiveHomomorphism && rebuiltPrimitive) {
      compareRebuilt(
        "primitive-homomorphism",
        certificate.primitiveHomomorphism,
        rebuiltPrimitive,
        certificate.hashes.primitiveHomomorphismSha256,
      );
      const values = rebuiltPrimitive.generatorValues.map(
        (entry) => entry.primitiveValue,
      );
      if (
        rebuiltPrimitive.status !== "passed" ||
        !rebuiltPrimitive.primitiveImage ||
        gcdIntegers(values) !== 1 ||
        !rebuiltPrimitive.relatorChecks.every(
          (check) => check.passed && check.primitiveValue === 0,
        )
      ) {
        errors.push(
          "The reconstructed Schreier values are not a primitive character.",
        );
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits its primitive Schreier character.");
    }

    const rebuiltTriangulation = rebuiltPoset
      ? buildCompatiblePullingTriangulation(rebuiltPoset)
      : undefined;
    if (certificate.triangulation && rebuiltTriangulation) {
      expectHash(
        "pulling-triangulation",
        certificate.hashes.triangulation,
        computePullingTriangulationHash(certificate.triangulation),
      );
      compareRebuilt(
        "pulling-triangulation-replay",
        certificate.triangulation,
        rebuiltTriangulation,
      );
      if (rebuiltTriangulation.status !== "passed") {
        errors.push("The action-rooted pulling triangulation is not passed.");
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits its pulling triangulation.");
    }

    const rebuiltHeight =
      rebuiltPoset &&
      rebuiltTriangulation &&
      rebuiltCover &&
      rebuiltWallHomomorphism &&
      rebuiltPrimitive
        ? buildPrimitiveMorseHeightCertificate({
            poset: rebuiltPoset,
            triangulation: rebuiltTriangulation,
            cover: rebuiltCover,
            finiteWallCertificate: rebuiltWallHomomorphism,
            primitiveHomomorphism: rebuiltPrimitive,
          })
        : undefined;
    if (certificate.heightFunction && rebuiltHeight) {
      expectHash(
        "primitive-height",
        certificate.hashes.heightFunction,
        computePrimitiveMorseHeightHash(certificate.heightFunction),
      );
      compareRebuilt(
        "primitive-height-replay",
        certificate.heightFunction,
        rebuiltHeight,
      );
      if (
        rebuiltHeight.status !== "passed" ||
        !Object.values(rebuiltHeight.checks).every(Boolean)
      ) {
        errors.push(
          "At least one action-rooted primitive PL-height check fails.",
        );
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits its primitive PL height.");
    }

    const rebuiltLinks =
      rebuiltPoset && rebuiltTriangulation && rebuiltHeight
        ? buildFullDirectedLinkCertificate({
            poset: rebuiltPoset,
            triangulation: rebuiltTriangulation,
            height: rebuiltHeight,
            // Link incidence is deterministic and independent of the optional
            // exponential collapse search.
            collapsibilityOptions: {
              maxStates: 1,
              maxTransitions: 1,
              maxMilliseconds: 0,
              deterministicStateBudgetOnly: true,
            },
          })
        : undefined;
    let replayedAllCollapses = true;
    if (certificate.directedLinks && rebuiltLinks) {
      expectHash(
        "full-directed-links",
        certificate.hashes.directedLinks,
        computeFullDirectedLinksHash(certificate.directedLinks),
      );
      reconstructedHashes["full-directed-link-incidence"] = canonicalSha256(
        directedLinkIncidencePayload(rebuiltLinks),
      );
      if (
        canonicalSha256(
          directedLinkIncidencePayload(certificate.directedLinks),
        ) !== reconstructedHashes["full-directed-link-incidence"]
      ) {
        errors.push(
          "The directed-link incidence does not match the certified action.",
        );
      }
      for (const vertex of certificate.directedLinks.vertices) {
        for (const link of [vertex.ascending, vertex.descending]) {
          const connectivity = linkConnectivityFromSimplices(
            link.maximalSimplices,
          );
          if (
            connectivity.nonempty !== link.nonempty ||
            connectivity.connected !== link.connected
          ) {
            errors.push(
              `${link.kind} link at ${vertex.vertexId} has stale connectivity data.`,
            );
          }
          if ("certificate" in link.collapsibility) {
            const replay = verifyCollapsibilityCertificate(
              { simplices: link.maximalSimplices },
              link.collapsibility.certificate,
            );
            replayedCollapseCertificates += 1;
            if (!replay.valid) {
              replayedAllCollapses = false;
              errors.push(
                `${link.kind} collapse certificate at ${vertex.vertexId} does not replay: ${replay.error ?? "unknown error"}`,
              );
            }
          }
        }
      }
    } else if (certificate.status === "passed") {
      errors.push("A passed artifact omits its directed links.");
    }

    const mandatoryProblems = mandatoryStageErrors(certificate.stages);
    mandatoryStagesPassed = mandatoryProblems.length === 0;
    const actionPassed = recertifiedAction?.certificate.status === "passed";
    const posetPassed = Boolean(
      rebuiltPoset?.certificate.status === "passed" &&
      rebuiltPoset.certificate.countChecks.every((check) => check.passed),
    );
    const coverPassed = rebuiltCover?.certificate.status === "passed";
    const wallsPassed = Boolean(rebuiltWalls?.diagnostics.twoSided);
    const coorientationPassed = Boolean(rebuiltCoorientation?.valid);
    const closedIntegralWallCocycle = Boolean(
      rebuiltWallHomomorphism?.cocycle.closed &&
      rebuiltWallHomomorphism.cocycle.edgeValues.every(
        (entry) => entry.value !== 0,
      ),
    );
    const primitive = Boolean(
      rebuiltPrimitive?.status === "passed" &&
      rebuiltPrimitive.primitiveImage &&
      gcdIntegers(
        rebuiltPrimitive.generatorValues.map((entry) => entry.primitiveValue),
      ) === 1,
    );
    const triangulationPassed = rebuiltTriangulation?.status === "passed";
    const fullCellExtension = Boolean(
      rebuiltHeight?.status === "passed" &&
      rebuiltHeight.checks.everyCellIntegrated &&
      rebuiltHeight.checks.overlapDifferencesConstant,
    );
    const linksPassed = Boolean(
      rebuiltLinks?.status === "passed" &&
      rebuiltLinks.vertices.every(
        (vertex) =>
          vertex.ascending.nonempty &&
          vertex.ascending.connected &&
          vertex.descending.nonempty &&
          vertex.descending.connected,
      ),
    );
    const collapsible = Boolean(
      certificate.directedLinks &&
      replayedAllCollapses &&
      certificate.directedLinks.vertices.every(
        (vertex) =>
          vertex.ascending.collapsibility.status === "collapsible" &&
          vertex.descending.collapsibility.status === "collapsible",
      ),
    );
    const allMandatoryEvidencePassed = Boolean(
      mandatoryStagesPassed &&
      actionPassed &&
      posetPassed &&
      coverPassed &&
      wallsPassed &&
      coorientationPassed &&
      closedIntegralWallCocycle &&
      primitive &&
      triangulationPassed &&
      fullCellExtension &&
      linksPassed,
    );
    const expectedResult = {
      closedIntegralWallCocycle,
      wallCocycleExtendsAcrossEveryCoxeterCell: fullCellExtension,
      explicitPrimitiveEpimorphismToZ: primitive,
      allAscendingAndDescendingLinksNonemptyConnected: linksPassed,
      finitelyGeneratedKernel: allMandatoryEvidencePassed,
      virtualAlgebraicFibration: allMandatoryEvidencePassed,
      allDirectedLinksCollapsible: collapsible,
      imm23TopologicalFibrationCertified: false,
    };
    for (const [key, expected] of Object.entries(expectedResult)) {
      if (certificate.result[key as keyof typeof expectedResult] !== expected) {
        errors.push(`The derived result flag ${key} is inconsistent.`);
      }
    }
    if (
      (certificate.status === "passed" ||
        certificate.result.virtualAlgebraicFibration) &&
      !mandatoryStagesPassed
    ) {
      errors.push(...mandatoryProblems);
    }

    expectHash(
      "artifact",
      certificate.hashes.artifactSha256,
      canonicalSha256(
        artifactHashPayload({
          sourceSystemSha256: certificate.hashes.sourceSystemSha256,
          quotientName: certificate.source.quotientName,
          subgroupName: certificate.source.subgroupName,
          stages: certificate.stages,
          hashes: certificate.hashes,
          coorientation: certificate.coorientation,
          primitiveHomomorphism: certificate.primitiveHomomorphism,
          result: certificate.result,
        }),
      ),
    );

    const requiredIncomplete = MANDATORY_FIBERING_STAGES.some((id) => {
      const matches = certificate.stages.filter((entry) => entry.id === id);
      return (
        matches.length !== 1 ||
        matches[0].status === "incomplete" ||
        matches[0].status === "not-run"
      );
    });
    const expectedStatus: FullDavisVirtualFiberingCertificate["status"] =
      allMandatoryEvidencePassed
        ? "passed"
        : requiredIncomplete
          ? "incomplete"
          : "failed";
    if (certificate.status !== expectedStatus) {
      errors.push(
        `Certificate status ${certificate.status} should be ${expectedStatus}.`,
      );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return finishFullDavisReplay({
    errors,
    checkedHashes,
    reconstructedHashes,
    mandatoryStagesPassed,
    replayedCollapseCertificates,
  });
}
