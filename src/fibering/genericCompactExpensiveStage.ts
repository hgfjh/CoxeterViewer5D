import { parseCoxeterSystemInput } from "../coxeter";
import {
  buildGeneralizedCompressionCertificate,
  verifyGeneralizedCompressionCertificate,
  type GeneralizedCompressionBuildOptions,
  type GeneralizedCompressionCertificate,
  type GeneralizedCompressionReplayResult,
} from "../davis/generalizedCompression";
import type { TorsionFreeCandidateResult } from "../torsionFree";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  computeGenericActionH1CertificateDigest,
  replayGenericActionH1Certificate,
  type GenericActionH1BuildResult,
} from "./genericActionH1";
import {
  replayExactCompactActionCheapScreen,
  type ExactCompactActionCheapScreenOptions,
  type ExactCompactActionCheapScreenReport,
  type ExactCompactActionCheapScreenReplay,
  type ExactCheapScreenPeriodicPotential,
  type ExactCheapScreenPullingOrder,
  type ExactCheapScreenTrial,
} from "./exactCompactActionCheapScreen";
import {
  buildExactTernaryHeightConeCover,
  canonicalizeHeightNormal,
  replayExactTernaryHeightConeCover,
  type HeightArrangementSign,
  type HeightConeContext,
  type HeightConeCoverCertificate,
  type HeightConeCoverNode,
  type HeightConeCoverReplay,
} from "./streamedHeightArrangement";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";
import {
  streamStreamedTrackBLinearLinkTemplates,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBLinearLinkTemplate,
  type StreamedTrackBLinearTemplateStreamResult,
  type StreamedTrackBLinkFailureKind,
} from "./streamedTrackB";

const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

export interface GenericCompactExpensiveStageBounds {
  maxActionEntries?: number;
  maxSphericalTypes?: number;
  maxSphericalRankForTemplates?: number;
  maxSphericalSubgroupOrder?: number;
  maxRootedSourceCells?: number;
  maxCompressedCells?: number;
  maxFaceTypeRelations?: number;
  maxRootedFaceRecords?: number;
  maxTemplates?: number;
  maxTemplateGerms?: number;
  maxTemplateAdjacencyEntries?: number;
  maxArrangementNormals?: number;
  maxConeNodes?: number;
  maxIntermediateInequalities?: number;
  maxLeafTemplateEvaluations?: number;
  maxLeafGermEvaluations?: number;
}

export type GenericCompactExpensiveStageId =
  | "upstream-replay"
  | "generalized-compression"
  | "full-integral-template-stream"
  | "exact-height-arrangement";

export interface GenericCompactExpensiveStageRecord {
  id: GenericCompactExpensiveStageId;
  status: "passed" | "incomplete" | "failed" | "not-run";
  detail: string;
}

export interface GenericHeightNormalCatalogueEntry {
  normalKey: string;
  primitiveNormal: string[];
  occurrenceCount: number;
  firstOccurrence: { point: number; germId: string };
}

export interface GenericHeightPolarityEvaluation {
  sigma: -1 | 1;
  checkedPointCount: number;
  allLinksPass: boolean;
  tieGermCount: number;
  failureCountByKind: Record<StreamedTrackBLinkFailureKind, number>;
  firstFailure?: {
    point: number;
    failures: StreamedTrackBLinkFailureKind[];
    templateDigest: string;
    linkDigest: string;
  };
  pointResultDigest: string;
  evaluationDigest: string;
}

export interface GenericHeightArrangementLeaf {
  schemaVersion: 1;
  kind: "exact-full-h1-height-arrangement-leaf";
  constraintDigest: string;
  actualFaceKey: string;
  actualSigns: HeightArrangementSign[];
  actualFaceDimension: number;
  primitiveRepresentative: string[];
  hasRawZeroDifference: boolean;
  polarities: [
    GenericHeightPolarityEvaluation,
    GenericHeightPolarityEvaluation,
  ];
  leafDigest: string;
}

type GenericHeightArrangementCover = HeightConeCoverCertificate<
  never,
  GenericHeightArrangementLeaf
>;

export interface GenericHeightArrangementFace {
  faceKey: string;
  signs: HeightArrangementSign[];
  dimension: number;
  primitiveRepresentative: string[];
  lowerDimensional: boolean;
  tieSensitive: boolean;
  supportingLeafCount: number;
  supportingLeafDigest: string;
  polarities: [
    GenericHeightPolarityEvaluation,
    GenericHeightPolarityEvaluation,
  ];
  faceDigest: string;
}

export interface GenericCompactExpensiveArrangement {
  method: "exhaustive-central-sign-face-cover-with-exact-global-order-ties";
  rank: number;
  coordinateIds: string[];
  heightRule: StreamedTrackBLinearTemplateStreamResult["heightRule"];
  templateStream: StreamedTrackBLinearTemplateStreamResult;
  templateCount: number;
  germOccurrenceCount: number;
  identicallyZeroGermCount: number;
  adjacencyEntryCount: number;
  normalCatalogue: GenericHeightNormalCatalogueEntry[];
  normalCatalogueDigest: string;
  cover: GenericHeightArrangementCover;
  coverReplay: HeightConeCoverReplay;
  faceCatalogue: GenericHeightArrangementFace[];
  faceCatalogueDigest: string;
  census: {
    arrangementFaceCount: number;
    fullDimensionalChamberCount: number;
    lowerDimensionalFaceCount: number;
    tieSensitiveFaceCount: number;
    zeroCharacterLeafCount: number;
    auxiliaryZeroIsolationLeafCount: number;
    passingFaceCountByPolarity: { "-1": number; "1": number };
  };
  checks: {
    exhaustiveTemplateStream: true;
    everyNonzeroNormalCatalogued: true;
    everyRealizableNonzeroFaceRepresented: true;
    lowerDimensionalZeroSignFacesIncluded: true;
    bothOffsetPolaritiesEvaluated: true;
    zeroCharacterSeparated: true;
    exactConeCoverReplayed: true;
  };
}

export interface GenericTemplateCompatibilityWitness {
  method: "sampled-cheap-pulling-links-equal-full-track-b-templates";
  characterId: string;
  characterCoordinates: string[];
  sigma: -1 | 1;
  sampledPointIds: number[];
  records: Array<{
    point: number;
    cheapLinkDigest: string;
    templateDigest: string;
    normalizedLinkDigest: string;
    rawZeroGermCount: number;
  }>;
  checks: {
    everySampledPointMatched: true;
    germSetsMatched: true;
    adjacencyMatched: true;
    exactDirectionsMatched: true;
    directedComponentsMatched: true;
    failureSetsMatched: true;
    sampledLinksPassed: true;
    pullingHasNoIntroducedVertices: true;
  };
  witnessDigest: string;
}

export interface GenericCompactExpensiveStageCertificate {
  schemaVersion: 1;
  kind: "generic-compact-action-expensive-stage";
  status: "completed" | "incomplete" | "failed";
  outcome:
    | "exact-arrangement-complete"
    | "compression-sidecar-only"
    | "incomplete-before-compression"
    | "failed";
  method: "action-rooted-generalized-compression-and-full-h1-height-arrangement";
  source: {
    systemCanonicalSha256: string;
    candidateId: string;
    degree: number;
    generatorCount: number;
    oracleStructureHash: string;
    oracleActionRowsCanonicalSha256: string;
    h1CertificateDigest: string;
    cheapScreenReportDigest: string;
    cheapScreenSurvivorTrialId: string;
  };
  budgets: Required<GenericCompactExpensiveStageBounds>;
  stages: GenericCompactExpensiveStageRecord[];
  upstream: {
    h1Rank?: number;
    latticeBasisDigest?: string;
    cocycleSectionDigest?: string;
    h1ReplayStatus?: "passed" | "failed";
    cheapScreenReplay?: ExactCompactActionCheapScreenReplay;
    survivor?: {
      trialId: string;
      characterId: string;
      orderId: string;
      potentialId: string;
      tiePolarity: -1 | 1;
      subdivisionFamily: ExactCheapScreenTrial["subdivisionFamily"];
      compatibility: {
        pullingSubdivision: boolean;
        canonicalPointOrder: boolean;
        zeroPeriodicPotential: boolean;
        existingTemplateApiCompatible: boolean;
      };
      compatibilityDigest: string;
    };
  };
  generalizedCompression?: {
    certificate: GeneralizedCompressionCertificate;
    replay: GeneralizedCompressionReplayResult;
  };
  templateCompatibility?: GenericTemplateCompatibilityWitness;
  arrangement?: GenericCompactExpensiveArrangement;
  stop?: {
    stage: GenericCompactExpensiveStageId;
    code: string;
    detail: string;
  };
  nonpromotableGap?: {
    code:
      | "cheap-survivor-rule-not-supported-by-full-template-api"
      | "full-h1-rank-exceeds-in-process-exact-cone-engine";
    detail: string;
    requiredCapability: string;
    preservedResult: "replayed-full-generalized-compression-sidecar";
  };
  checks: {
    oracleExactlyBoundToAcceptedAction: boolean;
    h1CertificateReplayed: boolean;
    fullIntegralH1BasisBound: boolean;
    cheapScreenReplayed: boolean;
    selectedCheapScreenTrialPassed: boolean;
    generalizedCompressionReplayed: boolean;
    templateRuleMatchesSelectedSurvivor: boolean;
    exactArrangementReplayed: boolean;
    allClaimedChecksPassed: boolean;
  };
  claims: string[];
  nonClaims: string[];
  errors: string[];
  warnings: string[];
  certificateDigest: string;
}

export interface GenericCompactExpensiveStageOptions {
  oracle: StreamedLawfulDavisOracle;
  h1: GenericActionH1BuildResult;
  cheapScreenOptions: Omit<
    ExactCompactActionCheapScreenOptions,
    "oracle" | "cocycleBasis"
  >;
  cheapScreenReport: ExactCompactActionCheapScreenReport;
  survivorTrialId: string;
  generalizedCompressionOptions?: GeneralizedCompressionBuildOptions;
  bounds?: GenericCompactExpensiveStageBounds;
}

export interface GenericCompactExpensiveStageReplay {
  schemaVersion: 1;
  kind: "generic-compact-action-expensive-stage-replay";
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

const DEFAULT_BOUNDS: Required<GenericCompactExpensiveStageBounds> = {
  maxActionEntries: 1_000_000,
  maxSphericalTypes: 512,
  maxSphericalRankForTemplates: 12,
  maxSphericalSubgroupOrder: 100_000,
  maxRootedSourceCells: 2_000_000,
  maxCompressedCells: 2_000_000,
  maxFaceTypeRelations: 65_536,
  maxRootedFaceRecords: 20_000_000,
  maxTemplates: 4_096,
  maxTemplateGerms: 2_000_000,
  maxTemplateAdjacencyEntries: 20_000_000,
  maxArrangementNormals: 128,
  maxConeNodes: 1_000_000,
  maxIntermediateInequalities: 250_000,
  maxLeafTemplateEvaluations: 5_000_000,
  maxLeafGermEvaluations: 250_000_000,
};

class StageResourceBoundError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StageResourceBoundError";
    this.code = code;
  }
}

function resolveBounds(
  supplied: GenericCompactExpensiveStageBounds | undefined,
): Required<GenericCompactExpensiveStageBounds> {
  const expectedKeys = Object.keys(DEFAULT_BOUNDS).sort();
  const suppliedKeys = Object.keys(supplied ?? {}).sort();
  const unknownKeys = suppliedKeys.filter((key) => !expectedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown expensive-stage bound keys: ${unknownKeys.join(", ")}.`,
    );
  }
  const result = { ...DEFAULT_BOUNDS, ...supplied };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
  }
  return result;
}

function stageRecords(): GenericCompactExpensiveStageRecord[] {
  return [
    "upstream-replay",
    "generalized-compression",
    "full-integral-template-stream",
    "exact-height-arrangement",
  ].map((id) => ({
    id: id as GenericCompactExpensiveStageId,
    status: "not-run" as const,
    detail: "Not reached.",
  }));
}

function setStage(
  stages: GenericCompactExpensiveStageRecord[],
  id: GenericCompactExpensiveStageId,
  status: GenericCompactExpensiveStageRecord["status"],
  detail: string,
): void {
  const stage = stages.find((entry) => entry.id === id);
  if (!stage) throw new Error(`Unknown expensive-stage id ${id}.`);
  stage.status = status;
  stage.detail = detail;
}

function certificatePayload(
  certificate: GenericCompactExpensiveStageCertificate,
): Omit<GenericCompactExpensiveStageCertificate, "certificateDigest"> {
  const { certificateDigest, ...payload } = certificate;
  void certificateDigest;
  return payload;
}

export function computeGenericCompactExpensiveStageDigest(
  certificate: GenericCompactExpensiveStageCertificate,
): string {
  return canonicalSha256(certificatePayload(certificate));
}

function exactInteger(
  value: number | string | bigint,
  context: string,
): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${context} is not a safe integer.`);
    }
    return BigInt(value);
  }
  if (!INTEGER_PATTERN.test(value)) {
    throw new Error(`${context} is not a canonical decimal integer.`);
  }
  return BigInt(value);
}

function compareIntegerVectors(
  left: readonly string[],
  right: readonly string[],
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = BigInt(left[index]) - BigInt(right[index]);
    if (difference < 0n) return -1;
    if (difference > 0n) return 1;
  }
  return left.length - right.length;
}

function isSubset(left: readonly number[], right: readonly number[]): boolean {
  const rightSet = new Set(right);
  return left.every((entry) => rightSet.has(entry));
}

function checkedProduct(
  left: number,
  right: number,
  bound: number,
  code: string,
  label: string,
): number {
  const product = BigInt(left) * BigInt(right);
  if (product > BigInt(bound)) {
    throw new StageResourceBoundError(
      code,
      `${label} ${product.toString()} exceeds the declared bound ${bound}.`,
    );
  }
  return Number(product);
}

function preflightSourceBounds(
  oracle: StreamedLawfulDavisOracle,
  bounds: Required<GenericCompactExpensiveStageBounds>,
): void {
  checkedProduct(
    oracle.degree,
    oracle.generatorCount,
    bounds.maxActionEntries,
    "maxActionEntries",
    "Action entry count",
  );
  if (oracle.sphericalTypes.length > bounds.maxSphericalTypes) {
    throw new StageResourceBoundError(
      "maxSphericalTypes",
      `Spherical type count ${oracle.sphericalTypes.length} exceeds the declared bound ${bounds.maxSphericalTypes}.`,
    );
  }
  const maximumRank = Math.max(
    0,
    ...oracle.sphericalTypes.map((type) => type.dimension),
  );
  if (maximumRank > bounds.maxSphericalRankForTemplates) {
    throw new StageResourceBoundError(
      "maxSphericalRankForTemplates",
      `Maximum spherical rank ${maximumRank} exceeds the declared template bound ${bounds.maxSphericalRankForTemplates}.`,
    );
  }
  const maximumOrder = Math.max(
    1,
    ...oracle.sphericalTypes.map((type) => type.subgroupOrder),
  );
  if (maximumOrder > bounds.maxSphericalSubgroupOrder) {
    throw new StageResourceBoundError(
      "maxSphericalSubgroupOrder",
      `Maximum spherical subgroup order ${maximumOrder} exceeds the declared bound ${bounds.maxSphericalSubgroupOrder}.`,
    );
  }
  checkedProduct(
    oracle.sphericalTypes.length,
    oracle.degree,
    bounds.maxRootedSourceCells,
    "maxRootedSourceCells",
    "Rooted source-cell count",
  );
  if (oracle.cellCount > bounds.maxCompressedCells) {
    throw new StageResourceBoundError(
      "maxCompressedCells",
      `Compressed cell count ${oracle.cellCount} exceeds the declared bound ${bounds.maxCompressedCells}.`,
    );
  }
  let relationCount = 0;
  for (const coface of oracle.sphericalTypes) {
    for (const face of oracle.sphericalTypes) {
      if (
        face.dimension < coface.dimension &&
        isSubset(face.generators, coface.generators)
      ) {
        relationCount += 1;
      }
    }
  }
  if (relationCount > bounds.maxFaceTypeRelations) {
    throw new StageResourceBoundError(
      "maxFaceTypeRelations",
      `Proper spherical face-type relation count ${relationCount} exceeds the declared bound ${bounds.maxFaceTypeRelations}.`,
    );
  }
  checkedProduct(
    relationCount,
    oracle.degree,
    bounds.maxRootedFaceRecords,
    "maxRootedFaceRecords",
    "Rooted face-record count",
  );
}

function oracleMatchesAcceptedAction(
  systemCanonicalSha256: string,
  accepted: TorsionFreeCandidateResult,
  oracle: StreamedLawfulDavisOracle,
): boolean {
  if (
    canonicalSha256(oracle.system) !== systemCanonicalSha256 ||
    accepted.candidate.index !== oracle.degree ||
    accepted.candidate.generatorImages.length !== oracle.generatorCount
  ) {
    return false;
  }
  for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
    const row = accepted.candidate.generatorImages[generator];
    if (row.length !== oracle.degree) return false;
    for (let point = 0; point < oracle.degree; point += 1) {
      if (oracle.neighbor(point, generator) !== row[point]) return false;
    }
  }
  return true;
}

/** Snapshot the callback once; all downstream replayers see identical data. */
function snapshotCocycleBasis(
  oracle: StreamedLawfulDavisOracle,
  basis: StreamedTrackBIntegralCocycleBasis,
): StreamedTrackBIntegralCocycleBasis {
  const rank = basis.coordinateIds.length;
  const table: Array<Array<readonly [number, string]>> = [];
  for (let point = 0; point < oracle.degree; point += 1) {
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      let previous = -1;
      const pairs = basis
        .edgeCoordinatePairs(point, generator)
        .map(([coordinate, value], pairIndex) => {
          if (
            !Number.isInteger(coordinate) ||
            coordinate <= previous ||
            coordinate < 0 ||
            coordinate >= rank
          ) {
            throw new Error(
              `Cocycle edge q${point}/g${generator} pair ${pairIndex} has a noncanonical coordinate index.`,
            );
          }
          previous = coordinate;
          const exact = exactInteger(
            value,
            `Cocycle edge q${point}/g${generator} coordinate ${coordinate}`,
          );
          if (exact === 0n) {
            throw new Error("A sparse cocycle edge stores an explicit zero.");
          }
          return [coordinate, exact.toString()] as const;
        });
      table.push(pairs);
    }
  }
  return {
    coordinateIds: [...basis.coordinateIds],
    latticeBasisDigest: basis.latticeBasisDigest,
    expectedCocycleSectionDigest: basis.expectedCocycleSectionDigest,
    edgeCoordinatePairs(point, generator) {
      if (
        !Number.isInteger(point) ||
        point < 0 ||
        point >= oracle.degree ||
        !Number.isInteger(generator) ||
        generator < 0 ||
        generator >= oracle.generatorCount
      ) {
        throw new RangeError("Cocycle snapshot lookup is out of range.");
      }
      return table[point * oracle.generatorCount + generator];
    },
  };
}

function moduloBigInt(value: bigint, modulus: bigint): bigint {
  return ((value % modulus) + modulus) % modulus;
}

function canonicalPointOrder(
  order: ExactCheapScreenPullingOrder,
  degree: number,
): boolean {
  if (order.degree !== degree) return false;
  const exactDegree = BigInt(degree);
  for (let point = 0; point < degree; point += 1) {
    if (
      moduloBigInt(
        BigInt(order.specification.multiplier) * BigInt(point) +
          BigInt(order.specification.shift),
        exactDegree,
      ) !== BigInt(point)
    ) {
      return false;
    }
  }
  return true;
}

function periodicPotentialValue(
  potential: ExactCheapScreenPeriodicPotential,
  point: number,
): bigint {
  const specification = potential.specification;
  if (specification.method === "zero") return 0n;
  const residue = moduloBigInt(
    BigInt(specification.multiplier) * BigInt(point) +
      BigInt(specification.shift),
    BigInt(potential.degree),
  );
  return (
    BigInt(specification.amplitude) *
    (2n * residue - BigInt(potential.degree - 1))
  );
}

function zeroPotential(
  potential: ExactCheapScreenPeriodicPotential,
  degree: number,
): boolean {
  if (potential.degree !== degree) return false;
  const first = periodicPotentialValue(potential, 0);
  for (let point = 1; point < degree; point += 1) {
    if (periodicPotentialValue(potential, point) !== first) return false;
  }
  return true;
}

/**
 * Prefer the earliest passing trial that the full template backend can
 * represent exactly. If none exists, retain the earliest pass so the caller
 * can still archive its generalized-compression sidecar and explicit gap.
 */
export function selectGenericCompactExpensiveStageSurvivor(input: {
  degree: number;
  pullingOrders: readonly ExactCheapScreenPullingOrder[];
  periodicPotentials: readonly ExactCheapScreenPeriodicPotential[];
  report: ExactCompactActionCheapScreenReport;
}): string | undefined {
  const trialById = new Map(
    input.report.trials.map((trial) => [trial.trialId, trial] as const),
  );
  if (trialById.size !== input.report.trials.length) {
    throw new Error("The cheap-screen report repeats a trial id.");
  }
  const passingTrials = input.report.passingTrialIds
    .map((trialId) => trialById.get(trialId))
    .filter((trial): trial is ExactCheapScreenTrial => trial !== undefined);
  if (
    passingTrials.length !== input.report.passingTrialIds.length ||
    new Set(input.report.passingTrialIds).size !==
      input.report.passingTrialIds.length
  ) {
    throw new Error(
      "The cheap-screen passing list references an unknown trial id.",
    );
  }
  const compatible = passingTrials.find((trial) => {
    if (trial.subdivisionFamily !== "pulling") return false;
    const order = input.pullingOrders.find(
      (candidate) => candidate.id === trial.orderId,
    );
    const potential = input.periodicPotentials.find(
      (candidate) => candidate.id === trial.potentialId,
    );
    return (
      order !== undefined &&
      potential !== undefined &&
      canonicalPointOrder(order, input.degree) &&
      zeroPotential(potential, input.degree)
    );
  });
  return (compatible ?? passingTrials[0])?.trialId;
}

function selectedSurvivor(
  report: ExactCompactActionCheapScreenReport,
  trialId: string,
): ExactCheapScreenTrial {
  const matches = report.trials.filter((trial) => trial.trialId === trialId);
  if (
    matches.length !== 1 ||
    !report.passingTrialIds.includes(trialId) ||
    matches[0].status !== "evaluated" ||
    !matches[0].allCheckedLinksPass
  ) {
    throw new Error(
      `Cheap-screen trial ${JSON.stringify(trialId)} is not one unique recorded passing survivor.`,
    );
  }
  return matches[0];
}

interface CollectedTemplates {
  templates: StreamedTrackBLinearLinkTemplate[];
  stream: StreamedTrackBLinearTemplateStreamResult;
  germCount: number;
  adjacencyEntryCount: number;
  stopCode?: string;
}

function collectTemplates(
  oracle: StreamedLawfulDavisOracle,
  compression: GeneralizedCompressionCertificate,
  compressionOptions: GeneralizedCompressionBuildOptions | undefined,
  basis: StreamedTrackBIntegralCocycleBasis,
  bounds: Required<GenericCompactExpensiveStageBounds>,
): CollectedTemplates {
  const templates: StreamedTrackBLinearLinkTemplate[] = [];
  let germCount = 0;
  let adjacencyEntryCount = 0;
  let stopCode: string | undefined;
  const stream = streamStreamedTrackBLinearLinkTemplates(
    {
      oracle,
      generalizedCompression: compression,
      ...(compressionOptions
        ? {
            generalizedCompressionReplayOptions: {
              ...(compressionOptions.sourceQuotientVertexIds
                ? {
                    sourceQuotientVertexIds:
                      compressionOptions.sourceQuotientVertexIds,
                  }
                : {}),
              ...(compressionOptions.coverCompression
                ? { coverCompression: compressionOptions.coverCompression }
                : {}),
            },
          }
        : {}),
      cocycleBasis: basis,
      includeAdjacency: true,
    },
    (template) => {
      const nextTemplateCount = templates.length + 1;
      const nextGermCount = germCount + template.germs.length;
      const nextAdjacencyEntryCount =
        adjacencyEntryCount +
        template.adjacency.reduce((sum, row) => sum + row.length, 0);
      if (nextTemplateCount > bounds.maxTemplates) {
        stopCode = "maxTemplates";
        return "stop";
      }
      if (nextGermCount > bounds.maxTemplateGerms) {
        stopCode = "maxTemplateGerms";
        return "stop";
      }
      if (nextAdjacencyEntryCount > bounds.maxTemplateAdjacencyEntries) {
        stopCode = "maxTemplateAdjacencyEntries";
        return "stop";
      }
      templates.push(template);
      germCount = nextGermCount;
      adjacencyEntryCount = nextAdjacencyEntryCount;
    },
  );
  return { templates, stream, germCount, adjacencyEntryCount, stopCode };
}

function normalCatalogue(
  templates: readonly StreamedTrackBLinearLinkTemplate[],
  rank: number,
): {
  entries: GenericHeightNormalCatalogueEntry[];
  identicallyZeroGermCount: number;
  digest: string;
} {
  const byKey = new Map<string, GenericHeightNormalCatalogueEntry>();
  let identicallyZeroGermCount = 0;
  for (const template of templates) {
    for (const germ of template.germs) {
      const dense = Array.from({ length: rank }, () => "0");
      let previous = -1;
      for (const [coordinate, coefficient] of germ.coefficientPairs) {
        if (
          !Number.isInteger(coordinate) ||
          coordinate <= previous ||
          coordinate < 0 ||
          coordinate >= rank ||
          !INTEGER_PATTERN.test(coefficient) ||
          coefficient === "0"
        ) {
          throw new Error(`${germ.id} has noncanonical sparse coordinates.`);
        }
        previous = coordinate;
        dense[coordinate] = coefficient;
      }
      const canonical = canonicalizeHeightNormal(dense);
      if (canonical.zero) {
        identicallyZeroGermCount += 1;
        continue;
      }
      const existing = byKey.get(canonical.key);
      if (existing) {
        existing.occurrenceCount += 1;
      } else {
        byKey.set(canonical.key, {
          normalKey: canonical.key,
          primitiveNormal: canonical.primitive,
          occurrenceCount: 1,
          firstOccurrence: { point: template.point, germId: germ.id },
        });
      }
    }
  }
  const entries = [...byKey.values()].sort((left, right) =>
    compareIntegerVectors(left.primitiveNormal, right.primitiveNormal),
  );
  return {
    entries,
    identicallyZeroGermCount,
    digest: canonicalSha256(entries),
  };
}

function selectedComponents(
  selected: readonly number[],
  adjacency: readonly Uint32Array[],
): number[][] {
  const unseen = new Uint8Array(adjacency.length);
  for (const index of selected) unseen[index] = 1;
  const components: number[][] = [];
  for (const root of selected) {
    if (unseen[root] === 0) continue;
    unseen[root] = 0;
    const component = [root];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of adjacency[component[cursor]]) {
        if (unseen[neighbor] === 0) continue;
        unseen[neighbor] = 0;
        component.push(neighbor);
      }
    }
    component.sort((left, right) => left - right);
    components.push(component);
  }
  return components;
}

function normalizedGermId(id: string, source: "cheap" | "template"): string {
  const prefix =
    source === "cheap" ? "exact-cheap-screen:germ:" : "track-b:germ:";
  if (!id.startsWith(prefix)) {
    throw new Error(`${source} link vertex ${id} is not a pulling germ.`);
  }
  return id.slice(prefix.length);
}

function canonicalStringPairs(
  pairs: readonly (readonly [string, string])[],
): Array<[string, string]> {
  return pairs
    .map(([left, right]) =>
      left < right
        ? ([left, right] as [string, string])
        : ([right, left] as [string, string]),
    )
    .sort((left, right) =>
      left[0] === right[0]
        ? left[1].localeCompare(right[1])
        : left[0].localeCompare(right[0]),
    );
}

function canonicalComponents(
  components: readonly (readonly string[])[],
): string[][] {
  return components
    .map((component) => [...component].sort())
    .sort((left, right) =>
      left.join("\u0000").localeCompare(right.join("\u0000")),
    );
}

function compatibilityWitness(options: {
  report: ExactCompactActionCheapScreenReport;
  trial: ExactCheapScreenTrial;
  characterId: string;
  characterCoordinates: readonly string[];
  templates: readonly StreamedTrackBLinearLinkTemplate[];
  degree: number;
}): GenericTemplateCompatibilityWitness {
  if (
    options.trial.subdivisionVertexLinks.length !== 0 ||
    options.trial.checkedSubdivisionVertexCount !== 0
  ) {
    throw new Error(
      "A survivor labeled pulling contains introduced subdivision vertices.",
    );
  }
  const character = options.characterCoordinates.map((value, coordinate) =>
    exactInteger(value, `survivor character coordinate ${coordinate}`),
  );
  const templateByPoint = new Map(
    options.templates.map((template) => [template.point, template]),
  );
  const linkByPoint = new Map(
    options.trial.originalVertexLinks.map((link) => {
      if (
        link.vertexKind !== "quotient-vertex" ||
        link.sourcePoint === undefined
      ) {
        throw new Error(
          "A pulling survivor contains a non-quotient original link.",
        );
      }
      return [link.sourcePoint, link] as const;
    }),
  );
  const sampledPointIds = [
    ...options.report.declaredPortfolio.processedPointIds,
  ];
  if (
    linkByPoint.size !== sampledPointIds.length ||
    sampledPointIds.some((point) => !linkByPoint.has(point))
  ) {
    throw new Error(
      "The selected cheap survivor does not contain one original link for every processed sample point.",
    );
  }
  const records: GenericTemplateCompatibilityWitness["records"] = [];
  for (const point of sampledPointIds) {
    const cheap = linkByPoint.get(point)!;
    const template = templateByPoint.get(point);
    if (!template) {
      throw new Error(`The full template stream is missing sampled q${point}.`);
    }
    const cheapVertices = cheap.heights.map((height) => {
      if (height.sourceKind !== "pulling-germ") {
        throw new Error(
          `Sampled pulling link q${point} contains ${height.sourceKind}.`,
        );
      }
      return normalizedGermId(height.vertexId, "cheap");
    });
    const templateVertices = template.germs.map((germ) =>
      normalizedGermId(germ.id, "template"),
    );
    if (
      canonicalSha256([...cheapVertices].sort()) !==
      canonicalSha256([...templateVertices].sort())
    ) {
      throw new Error(
        `Sampled q${point} germ sets disagree across template APIs.`,
      );
    }
    const cheapEdgeSet = new Set<string>();
    for (const simplex of cheap.fullMaximalSimplices) {
      const vertices = simplex.map((id) => normalizedGermId(id, "cheap"));
      for (let left = 0; left < vertices.length; left += 1) {
        for (let right = left + 1; right < vertices.length; right += 1) {
          const pair =
            vertices[left] < vertices[right]
              ? `${vertices[left]}\u0000${vertices[right]}`
              : `${vertices[right]}\u0000${vertices[left]}`;
          cheapEdgeSet.add(pair);
        }
      }
    }
    const cheapEdges = [...cheapEdgeSet]
      .sort()
      .map((pair) => pair.split("\u0000") as [string, string]);
    const templateEdges = canonicalStringPairs(
      template.edges.map(([left, right]) => [
        normalizedGermId(left, "template"),
        normalizedGermId(right, "template"),
      ]),
    );
    if (canonicalSha256(cheapEdges) !== canonicalSha256(templateEdges)) {
      throw new Error(
        `Sampled q${point} link adjacency disagrees across template APIs.`,
      );
    }
    const signByTemplateId = new Map<string, -1 | 1>();
    let rawZeroGermCount = 0;
    for (const germ of template.germs) {
      let raw = 0n;
      for (const [coordinate, coefficient] of germ.coefficientPairs) {
        raw += BigInt(coefficient) * character[coordinate];
      }
      if (raw === 0n) rawZeroGermCount += 1;
      const cleared =
        4n * BigInt(options.degree) * raw +
        BigInt(options.trial.tiePolarity) * BigInt(germ.pointDifference);
      if (cleared === 0n) {
        throw new Error(`${germ.id} has an unresolved compatibility tie.`);
      }
      signByTemplateId.set(
        normalizedGermId(germ.id, "template"),
        cleared < 0n ? -1 : 1,
      );
    }
    const cheapSigns = cheap.heights
      .map(
        (height) =>
          [normalizedGermId(height.vertexId, "cheap"), height.sign] as const,
      )
      .sort(([left], [right]) => left.localeCompare(right));
    const templateSigns = [...signByTemplateId.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    );
    if (canonicalSha256(cheapSigns) !== canonicalSha256(templateSigns)) {
      throw new Error(
        `Sampled q${point} exact height directions disagree across template APIs.`,
      );
    }
    const ascendingIndices: number[] = [];
    const descendingIndices: number[] = [];
    template.germs.forEach((germ, index) => {
      const sign = signByTemplateId.get(normalizedGermId(germ.id, "template"));
      (sign === 1 ? ascendingIndices : descendingIndices).push(index);
    });
    const templateIds = template.germs.map((germ) =>
      normalizedGermId(germ.id, "template"),
    );
    const ascendingComponents = selectedComponents(
      ascendingIndices,
      template.adjacency,
    ).map((component) => component.map((index) => templateIds[index]));
    const descendingComponents = selectedComponents(
      descendingIndices,
      template.adjacency,
    ).map((component) => component.map((index) => templateIds[index]));
    const failures: StreamedTrackBLinkFailureKind[] = [];
    if (ascendingIndices.length === 0) failures.push("ascending-empty");
    if (descendingIndices.length === 0) failures.push("descending-empty");
    if (ascendingIndices.length > 0 && ascendingComponents.length !== 1) {
      failures.push("ascending-disconnected");
    }
    if (descendingIndices.length > 0 && descendingComponents.length !== 1) {
      failures.push("descending-disconnected");
    }
    const normalized = {
      point,
      vertices: [...templateVertices].sort(),
      edges: templateEdges,
      signs: templateSigns,
      ascending: ascendingIndices.map((index) => templateIds[index]).sort(),
      descending: descendingIndices.map((index) => templateIds[index]).sort(),
      ascendingComponents: canonicalComponents(ascendingComponents),
      descendingComponents: canonicalComponents(descendingComponents),
      failures,
    };
    const normalizedCheap = {
      point,
      vertices: [...cheapVertices].sort(),
      edges: cheapEdges,
      signs: cheapSigns,
      ascending: cheap.ascending.vertexIds
        .map((id) => normalizedGermId(id, "cheap"))
        .sort(),
      descending: cheap.descending.vertexIds
        .map((id) => normalizedGermId(id, "cheap"))
        .sort(),
      ascendingComponents: canonicalComponents(
        cheap.ascending.components.map((component) =>
          component.map((id) => normalizedGermId(id, "cheap")),
        ),
      ),
      descendingComponents: canonicalComponents(
        cheap.descending.components.map((component) =>
          component.map((id) => normalizedGermId(id, "cheap")),
        ),
      ),
      failures: cheap.failures,
    };
    if (
      cheap.failures.length > 0 ||
      canonicalSha256(normalized) !== canonicalSha256(normalizedCheap)
    ) {
      throw new Error(
        `Sampled q${point} directed link does not match the full template calculation.`,
      );
    }
    records.push({
      point,
      cheapLinkDigest: cheap.linkDigest,
      templateDigest: template.templateDigest,
      normalizedLinkDigest: canonicalSha256(normalized),
      rawZeroGermCount,
    });
  }
  const payload = {
    method: "sampled-cheap-pulling-links-equal-full-track-b-templates" as const,
    characterId: options.characterId,
    characterCoordinates: options.characterCoordinates.map(String),
    sigma: options.trial.tiePolarity,
    sampledPointIds,
    records,
    checks: {
      everySampledPointMatched: true as const,
      germSetsMatched: true as const,
      adjacencyMatched: true as const,
      exactDirectionsMatched: true as const,
      directedComponentsMatched: true as const,
      failureSetsMatched: true as const,
      sampledLinksPassed: true as const,
      pullingHasNoIntroducedVertices: true as const,
    },
  };
  return { ...payload, witnessDigest: canonicalSha256(payload) };
}

function bigintMatrixRank(rows: readonly (readonly bigint[])[]): number {
  if (rows.length === 0) return 0;
  const matrix = rows.map((row) => [...row]);
  const columnCount = matrix[0].length;
  let rank = 0;
  for (let column = 0; column < columnCount; column += 1) {
    const pivot = matrix.findIndex(
      (row, index) => index >= rank && row[column] !== 0n,
    );
    if (pivot < 0) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const pivotValue = matrix[rank][column];
    for (let row = rank + 1; row < matrix.length; row += 1) {
      const factor = matrix[row][column];
      if (factor === 0n) continue;
      for (let other = column; other < columnCount; other += 1) {
        matrix[row][other] =
          matrix[row][other] * pivotValue - matrix[rank][other] * factor;
      }
    }
    rank += 1;
    if (rank === matrix.length) break;
  }
  return rank;
}

function arrangementFaceDimension(
  rank: number,
  normals: readonly GenericHeightNormalCatalogueEntry[],
  signs: readonly HeightArrangementSign[],
): number {
  const equalities = normals.flatMap((normal, index) =>
    signs[index] === 0 ? [normal.primitiveNormal.map(BigInt)] : [],
  );
  return rank - bigintMatrixRank(equalities);
}

interface EvaluationCounter {
  templateEvaluations: number;
  germEvaluations: number;
}

function evaluatePolarity(
  templates: readonly StreamedTrackBLinearLinkTemplate[],
  weight: readonly string[],
  sigma: -1 | 1,
  degree: number,
  bounds: Required<GenericCompactExpensiveStageBounds>,
  counter: EvaluationCounter,
): GenericHeightPolarityEvaluation {
  const exactWeight = weight.map(BigInt);
  let tieGermCount = 0;
  const failureCountByKind: Record<StreamedTrackBLinkFailureKind, number> = {
    "ascending-empty": 0,
    "descending-empty": 0,
    "ascending-disconnected": 0,
    "descending-disconnected": 0,
  };
  let firstFailure: GenericHeightPolarityEvaluation["firstFailure"];
  const pointResults: Array<{
    point: number;
    templateDigest: string;
    linkDigest: string;
    failures: StreamedTrackBLinkFailureKind[];
  }> = [];
  for (const template of templates) {
    counter.templateEvaluations += 1;
    if (counter.templateEvaluations > bounds.maxLeafTemplateEvaluations) {
      throw new StageResourceBoundError(
        "maxLeafTemplateEvaluations",
        `Leaf/template evaluations exceeded ${bounds.maxLeafTemplateEvaluations}.`,
      );
    }
    const ascending: number[] = [];
    const descending: number[] = [];
    for (let germIndex = 0; germIndex < template.germs.length; germIndex += 1) {
      counter.germEvaluations += 1;
      if (counter.germEvaluations > bounds.maxLeafGermEvaluations) {
        throw new StageResourceBoundError(
          "maxLeafGermEvaluations",
          `Leaf/germ evaluations exceeded ${bounds.maxLeafGermEvaluations}.`,
        );
      }
      const germ = template.germs[germIndex];
      let raw = 0n;
      for (const [coordinate, coefficient] of germ.coefficientPairs) {
        raw += BigInt(coefficient) * exactWeight[coordinate];
      }
      if (raw === 0n) tieGermCount += 1;
      const cleared =
        4n * BigInt(degree) * raw +
        BigInt(sigma) * BigInt(germ.pointDifference);
      if (cleared > 0n) ascending.push(germIndex);
      else if (cleared < 0n) descending.push(germIndex);
      else throw new Error(`${germ.id} has an unresolved exact height tie.`);
    }
    const ascendingComponents = selectedComponents(
      ascending,
      template.adjacency,
    );
    const descendingComponents = selectedComponents(
      descending,
      template.adjacency,
    );
    const failures: StreamedTrackBLinkFailureKind[] = [];
    if (ascending.length === 0) failures.push("ascending-empty");
    if (descending.length === 0) failures.push("descending-empty");
    if (ascending.length > 0 && ascendingComponents.length !== 1) {
      failures.push("ascending-disconnected");
    }
    if (descending.length > 0 && descendingComponents.length !== 1) {
      failures.push("descending-disconnected");
    }
    for (const failure of failures) failureCountByKind[failure] += 1;
    const germIds = template.germs.map((germ) => germ.id);
    const linkDigest = canonicalSha256({
      schemaVersion: 1,
      method: "exact-integral-height-directed-link-one-skeleton",
      templateDigest: template.templateDigest,
      sigma,
      ascending: ascending.map((index) => germIds[index]),
      descending: descending.map((index) => germIds[index]),
      ascendingComponents: ascendingComponents.map((component) =>
        component.map((index) => germIds[index]),
      ),
      descendingComponents: descendingComponents.map((component) =>
        component.map((index) => germIds[index]),
      ),
      failures,
    });
    pointResults.push({
      point: template.point,
      templateDigest: template.templateDigest,
      linkDigest,
      failures,
    });
    if (!firstFailure && failures.length > 0) {
      firstFailure = {
        point: template.point,
        failures,
        templateDigest: template.templateDigest,
        linkDigest,
      };
    }
  }
  const payload = {
    sigma,
    checkedPointCount: templates.length,
    allLinksPass: firstFailure === undefined,
    tieGermCount,
    failureCountByKind,
    ...(firstFailure ? { firstFailure } : {}),
    pointResultDigest: canonicalSha256(pointResults),
  };
  return {
    ...payload,
    evaluationDigest: canonicalSha256(payload),
  };
}

function buildLeaf(
  context: HeightConeContext,
  normals: readonly GenericHeightNormalCatalogueEntry[],
  templates: readonly StreamedTrackBLinearLinkTemplate[],
  degree: number,
  bounds: Required<GenericCompactExpensiveStageBounds>,
  counter: EvaluationCounter,
): GenericHeightArrangementLeaf {
  if (context.feasibility.primitiveWitness === null) {
    throw new Error("A nonzero arrangement face lacks a primitive witness.");
  }
  const assignmentByKey = new Map(
    context.assignments.map((assignment) => [
      assignment.normalKey,
      assignment.sign,
    ]),
  );
  const actualSigns = normals.map((normal) => {
    const sign = assignmentByKey.get(normal.normalKey);
    if (sign === undefined) {
      throw new Error(`Arrangement normal ${normal.normalKey} is unresolved.`);
    }
    return sign;
  });
  const primitiveRepresentative = [...context.feasibility.primitiveWitness];
  const polarities = [-1, 1].map((sigma) =>
    evaluatePolarity(
      templates,
      primitiveRepresentative,
      sigma as -1 | 1,
      degree,
      bounds,
      counter,
    ),
  ) as [GenericHeightPolarityEvaluation, GenericHeightPolarityEvaluation];
  const payload = {
    schemaVersion: 1 as const,
    kind: "exact-full-h1-height-arrangement-leaf" as const,
    constraintDigest: context.constraintDigest,
    actualFaceKey: actualSigns.join(","),
    actualSigns,
    actualFaceDimension: arrangementFaceDimension(
      context.rank,
      normals,
      actualSigns,
    ),
    primitiveRepresentative,
    hasRawZeroDifference: actualSigns.some((sign) => sign === 0),
    polarities,
  };
  return { ...payload, leafDigest: canonicalSha256(payload) };
}

function ordinaryLeaves(
  cover: GenericHeightArrangementCover,
): GenericHeightArrangementLeaf[] {
  const result: GenericHeightArrangementLeaf[] = [];
  const visit = (
    node: HeightConeCoverNode<never, GenericHeightArrangementLeaf>,
  ): void => {
    if (node.decision.kind === "leaf") {
      result.push(node.decision.value);
    } else if (node.decision.kind === "split") {
      for (const branch of node.decision.branches) {
        if (branch.outcome === "feasible") visit(branch.child);
      }
    }
  };
  visit(cover.root);
  return result;
}

function buildFaceCatalogue(
  cover: GenericHeightArrangementCover,
  rank: number,
  identicallyZeroGermCount: number,
): GenericHeightArrangementFace[] {
  const groups = new Map<string, GenericHeightArrangementLeaf[]>();
  for (const leaf of ordinaryLeaves(cover)) {
    const group = groups.get(leaf.actualFaceKey) ?? [];
    group.push(leaf);
    groups.set(leaf.actualFaceKey, group);
  }
  const result: GenericHeightArrangementFace[] = [];
  for (const [faceKey, leaves] of groups) {
    leaves.sort((left, right) =>
      compareIntegerVectors(
        left.primitiveRepresentative,
        right.primitiveRepresentative,
      ),
    );
    const representative = leaves[0];
    for (const leaf of leaves) {
      if (
        leaf.actualFaceDimension !== representative.actualFaceDimension ||
        canonicalSha256(leaf.actualSigns) !==
          canonicalSha256(representative.actualSigns) ||
        canonicalSha256(leaf.polarities) !==
          canonicalSha256(representative.polarities)
      ) {
        throw new Error(
          `Auxiliary zero-isolation leaves disagree on arrangement face ${faceKey}.`,
        );
      }
    }
    const supportingLeafDigests = leaves.map((leaf) => leaf.leafDigest).sort();
    const payload = {
      faceKey,
      signs: [...representative.actualSigns],
      dimension: representative.actualFaceDimension,
      primitiveRepresentative: [...representative.primitiveRepresentative],
      lowerDimensional: representative.actualFaceDimension < rank,
      tieSensitive:
        identicallyZeroGermCount > 0 ||
        representative.actualSigns.some((sign) => sign === 0),
      supportingLeafCount: leaves.length,
      supportingLeafDigest: canonicalSha256(supportingLeafDigests),
      polarities: representative.polarities,
    };
    result.push({ ...payload, faceDigest: canonicalSha256(payload) });
  }
  return result.sort((left, right) => {
    for (let index = 0; index < left.signs.length; index += 1) {
      if (left.signs[index] !== right.signs[index]) {
        return left.signs[index] - right.signs[index];
      }
    }
    return 0;
  });
}

function buildArrangement(
  oracle: StreamedLawfulDavisOracle,
  collected: CollectedTemplates,
  bounds: Required<GenericCompactExpensiveStageBounds>,
): GenericCompactExpensiveArrangement {
  const rank = collected.stream.coordinateCount;
  const normals = normalCatalogue(collected.templates, rank);
  if (normals.entries.length > bounds.maxArrangementNormals) {
    throw new StageResourceBoundError(
      "maxArrangementNormals",
      `Arrangement normal count ${normals.entries.length} exceeds the declared bound ${bounds.maxArrangementNormals}.`,
    );
  }
  const buildCounter: EvaluationCounter = {
    templateEvaluations: 0,
    germEvaluations: 0,
  };
  const decide = (context: HeightConeContext) => {
    const assignedKeys = new Set(
      context.assignments.map((assignment) => assignment.normalKey),
    );
    const unresolved = normals.entries.find(
      (normal) => !assignedKeys.has(normal.normalKey),
    );
    if (unresolved) {
      return { kind: "split" as const, normal: unresolved.primitiveNormal };
    }
    if (context.assignments.every((assignment) => assignment.sign === 0)) {
      // The cone engine separates the zero character. Coordinate cuts refine
      // only the common kernel; the face catalogue below folds them back to
      // the single genuine all-zero height-sign face.
      for (let coordinate = 0; coordinate < rank; coordinate += 1) {
        const coordinateNormal = Array.from(
          { length: rank },
          (_unused, index) => (index === coordinate ? "1" : "0"),
        );
        const canonical = canonicalizeHeightNormal(coordinateNormal);
        if (!assignedKeys.has(canonical.key)) {
          return { kind: "split" as const, normal: coordinateNormal };
        }
      }
      throw new Error(
        "A positive-dimensional all-zero cone has every coordinate cut assigned.",
      );
    }
    return {
      kind: "leaf" as const,
      value: buildLeaf(
        context,
        normals.entries,
        collected.templates,
        oracle.degree,
        bounds,
        buildCounter,
      ),
    };
  };
  const cover = buildExactTernaryHeightConeCover<
    never,
    GenericHeightArrangementLeaf
  >({
    rank,
    decide,
    maxNodes: bounds.maxConeNodes,
    maxIntermediateInequalities: bounds.maxIntermediateInequalities,
  });
  const replayCounter: EvaluationCounter = {
    templateEvaluations: 0,
    germEvaluations: 0,
  };
  const coverReplay = replayExactTernaryHeightConeCover(cover, {
    verifyLeaf(context, stored) {
      try {
        const rebuilt = buildLeaf(
          context,
          normals.entries,
          collected.templates,
          oracle.degree,
          bounds,
          replayCounter,
        );
        return canonicalSha256(rebuilt) === canonicalSha256(stored);
      } catch {
        return false;
      }
    },
    maxIntermediateInequalities: bounds.maxIntermediateInequalities,
  });
  if (coverReplay.status !== "passed") {
    throw new Error(
      `Exact arrangement replay failed: ${coverReplay.errors.join(" ")}`,
    );
  }
  if (cover.zeroCharacterLeafCount !== 1) {
    throw new Error(
      `The exact arrangement has ${cover.zeroCharacterLeafCount} zero-character leaves instead of one.`,
    );
  }
  const faceCatalogue = buildFaceCatalogue(
    cover,
    rank,
    normals.identicallyZeroGermCount,
  );
  const auxiliaryZeroIsolationLeafCount =
    ordinaryLeaves(cover).length - faceCatalogue.length;
  const passingFaceCountByPolarity = { "-1": 0, "1": 0 };
  for (const face of faceCatalogue) {
    if (face.polarities[0].allLinksPass) passingFaceCountByPolarity["-1"] += 1;
    if (face.polarities[1].allLinksPass) passingFaceCountByPolarity["1"] += 1;
  }
  return {
    method: "exhaustive-central-sign-face-cover-with-exact-global-order-ties",
    rank,
    coordinateIds: [...collected.stream.coordinateIds],
    heightRule: collected.stream.heightRule,
    templateStream: collected.stream,
    templateCount: collected.templates.length,
    germOccurrenceCount: collected.germCount,
    identicallyZeroGermCount: normals.identicallyZeroGermCount,
    adjacencyEntryCount: collected.adjacencyEntryCount,
    normalCatalogue: normals.entries,
    normalCatalogueDigest: normals.digest,
    cover,
    coverReplay,
    faceCatalogue,
    faceCatalogueDigest: canonicalSha256(faceCatalogue),
    census: {
      arrangementFaceCount: faceCatalogue.length,
      fullDimensionalChamberCount: faceCatalogue.filter(
        (face) => face.dimension === rank,
      ).length,
      lowerDimensionalFaceCount: faceCatalogue.filter(
        (face) => face.lowerDimensional,
      ).length,
      tieSensitiveFaceCount: faceCatalogue.filter((face) => face.tieSensitive)
        .length,
      zeroCharacterLeafCount: cover.zeroCharacterLeafCount,
      auxiliaryZeroIsolationLeafCount,
      passingFaceCountByPolarity,
    },
    checks: {
      exhaustiveTemplateStream: true,
      everyNonzeroNormalCatalogued: true,
      everyRealizableNonzeroFaceRepresented: true,
      lowerDimensionalZeroSignFacesIncluded: true,
      bothOffsetPolaritiesEvaluated: true,
      zeroCharacterSeparated: true,
      exactConeCoverReplayed: true,
    },
  };
}

/**
 * Run the expensive post-screen stage without silently changing the survivor.
 * The existing full template API supports exactly the canonical point-order
 * pulling rule. Other cheap-screen gauges remain a replayed compression
 * sidecar plus an explicit implementation gap.
 */
export function buildGenericCompactExpensiveStage(
  systemInput: unknown,
  accepted: TorsionFreeCandidateResult,
  options: GenericCompactExpensiveStageOptions,
): GenericCompactExpensiveStageCertificate {
  const system = parseCoxeterSystemInput(systemInput);
  const bounds = resolveBounds(options.bounds);
  const stages = stageRecords();
  const h1CertificateDigest = options.h1.certificate.certificateDigest;
  const source: GenericCompactExpensiveStageCertificate["source"] = {
    systemCanonicalSha256: canonicalSha256(system),
    candidateId: accepted.candidate.id,
    degree: accepted.candidate.index,
    generatorCount: system.rank,
    oracleStructureHash: options.oracle.structureHash,
    oracleActionRowsCanonicalSha256: options.oracle.actionRowsCanonicalSha256,
    h1CertificateDigest,
    cheapScreenReportDigest: options.cheapScreenReport.reportDigest,
    cheapScreenSurvivorTrialId: options.survivorTrialId,
  };
  const upstream: GenericCompactExpensiveStageCertificate["upstream"] = {};
  const checks: GenericCompactExpensiveStageCertificate["checks"] = {
    oracleExactlyBoundToAcceptedAction: false,
    h1CertificateReplayed: false,
    fullIntegralH1BasisBound: false,
    cheapScreenReplayed: false,
    selectedCheapScreenTrialPassed: false,
    generalizedCompressionReplayed: false,
    templateRuleMatchesSelectedSurvivor: false,
    exactArrangementReplayed: false,
    allClaimedChecksPassed: false,
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const claims: string[] = [];
  const nonClaims = [
    "This stage does not prove asphericity, CAT(0), or contractibility of a universal cover.",
    "The directed-link calculation checks only nonemptiness and connectivity of ascending and descending link one-skeleta for the fixed pulling subdivision.",
    "No fibering or finiteness property of a character kernel follows from this certificate alone.",
    "The exact cone engine used here supports full integral H1 ranks one through four; a higher-rank stop is an implementation gap, not a negative mathematical result.",
    "A resource-bound stop is incomplete and makes no claim about unvisited templates or arrangement faces.",
  ];
  let status: GenericCompactExpensiveStageCertificate["status"] = "failed";
  let outcome: GenericCompactExpensiveStageCertificate["outcome"] = "failed";
  let generalizedCompression:
    | GenericCompactExpensiveStageCertificate["generalizedCompression"]
    | undefined;
  let templateCompatibility: GenericTemplateCompatibilityWitness | undefined;
  let arrangement: GenericCompactExpensiveArrangement | undefined;
  let stop: GenericCompactExpensiveStageCertificate["stop"];
  let nonpromotableGap:
    | GenericCompactExpensiveStageCertificate["nonpromotableGap"]
    | undefined;
  let currentStage: GenericCompactExpensiveStageId = "upstream-replay";
  let actionRootedOracle: StreamedLawfulDavisOracle | undefined;

  const finish = (): GenericCompactExpensiveStageCertificate => {
    checks.allClaimedChecksPassed =
      checks.oracleExactlyBoundToAcceptedAction &&
      checks.h1CertificateReplayed &&
      checks.fullIntegralH1BasisBound &&
      checks.cheapScreenReplayed &&
      checks.selectedCheapScreenTrialPassed &&
      (generalizedCompression === undefined ||
        checks.generalizedCompressionReplayed) &&
      (arrangement === undefined ||
        (checks.templateRuleMatchesSelectedSurvivor &&
          checks.exactArrangementReplayed));
    const payload: Omit<
      GenericCompactExpensiveStageCertificate,
      "certificateDigest"
    > = {
      schemaVersion: 1,
      kind: "generic-compact-action-expensive-stage",
      status,
      outcome,
      method:
        "action-rooted-generalized-compression-and-full-h1-height-arrangement",
      source,
      budgets: bounds,
      stages,
      upstream,
      ...(generalizedCompression ? { generalizedCompression } : {}),
      ...(templateCompatibility ? { templateCompatibility } : {}),
      ...(arrangement ? { arrangement } : {}),
      ...(stop ? { stop } : {}),
      ...(nonpromotableGap ? { nonpromotableGap } : {}),
      checks,
      claims,
      nonClaims,
      errors: [...new Set(errors)].sort(),
      warnings: [...new Set(warnings)].sort(),
    };
    return { ...payload, certificateDigest: canonicalSha256(payload) };
  };

  try {
    checkedProduct(
      accepted.candidate.index,
      system.rank,
      bounds.maxActionEntries,
      "maxActionEntries",
      "Action entry count",
    );
    // Oracle callbacks are runtime conveniences, not certificate material.
    // Rebuild them from the accepted rows and use only this rooted instance.
    actionRootedOracle = buildStreamedLawfulDavisOracle({
      system,
      generatorImages: accepted.candidate.generatorImages,
    });
    source.oracleStructureHash = actionRootedOracle.structureHash;
    source.oracleActionRowsCanonicalSha256 =
      actionRootedOracle.actionRowsCanonicalSha256;
    preflightSourceBounds(actionRootedOracle, bounds);
    checks.oracleExactlyBoundToAcceptedAction =
      oracleMatchesAcceptedAction(
        source.systemCanonicalSha256,
        accepted,
        actionRootedOracle,
      ) &&
      options.oracle.structureHash === actionRootedOracle.structureHash &&
      options.oracle.actionRowsCanonicalSha256 ===
        actionRootedOracle.actionRowsCanonicalSha256;
    if (!checks.oracleExactlyBoundToAcceptedAction) {
      throw new Error(
        "The supplied oracle is not exactly bound to the accepted permutation action and Coxeter system.",
      );
    }
    const h1Replay = replayGenericActionH1Certificate(
      system,
      accepted,
      options.h1.certificate,
    );
    upstream.h1ReplayStatus = h1Replay.status;
    checks.h1CertificateReplayed = h1Replay.status === "passed";
    if (!checks.h1CertificateReplayed) {
      throw new Error("The full integral H1 certificate did not replay.");
    }
    const h1 = options.h1.certificate.h1;
    const basis = options.h1.integralCocycleBasis;
    if (
      options.h1.certificate.status !== "passed" ||
      !h1 ||
      h1.rank < 1 ||
      !h1.checks.fullIntegralKernelCertified ||
      !basis ||
      basis.coordinateIds.length !== h1.rank ||
      basis.latticeBasisDigest !== h1.latticeBasisDigest ||
      basis.expectedCocycleSectionDigest !== h1.cocycleSectionDigest ||
      computeGenericActionH1CertificateDigest(options.h1.certificate) !==
        h1CertificateDigest
    ) {
      throw new Error(
        "The runtime cocycle basis is not the certified nonzero full integral H1 basis.",
      );
    }
    upstream.h1Rank = h1.rank;
    upstream.latticeBasisDigest = h1.latticeBasisDigest;
    upstream.cocycleSectionDigest = h1.cocycleSectionDigest ?? undefined;
    const cocycleBasis = snapshotCocycleBasis(actionRootedOracle, basis);
    checks.fullIntegralH1BasisBound = true;
    const cheapReplay = replayExactCompactActionCheapScreen(
      {
        ...options.cheapScreenOptions,
        oracle: actionRootedOracle,
        cocycleBasis,
      },
      options.cheapScreenReport,
    );
    upstream.cheapScreenReplay = cheapReplay;
    checks.cheapScreenReplayed = cheapReplay.status === "passed";
    const acceptedCertificateDigest = canonicalSha256(accepted.certificate);
    if (
      options.cheapScreenOptions.actionBinding.upstreamCertificateDigest !==
        acceptedCertificateDigest ||
      options.cheapScreenReport.source.upstreamActionCertificateDigest !==
        acceptedCertificateDigest
    ) {
      checks.cheapScreenReplayed = false;
      throw new Error(
        "The replayed cheap screen is not bound to the accepted torsion-free certificate.",
      );
    }
    if (!checks.cheapScreenReplayed) {
      throw new Error("The exact cheap-screen report did not replay.");
    }
    const survivor = selectedSurvivor(
      options.cheapScreenReport,
      options.survivorTrialId,
    );
    checks.selectedCheapScreenTrialPassed = true;
    const order = options.cheapScreenOptions.pullingOrders.find(
      (entry) => entry.id === survivor.orderId,
    );
    const potential = options.cheapScreenOptions.periodicPotentials.find(
      (entry) => entry.id === survivor.potentialId,
    );
    const survivorCharacters = options.cheapScreenOptions.characters.filter(
      (entry) => entry.id === survivor.characterId,
    );
    if (!order || !potential || survivorCharacters.length !== 1) {
      throw new Error(
        "The selected survivor's character, order, or potential is not unique in the replayed portfolio.",
      );
    }
    const survivorCharacter = survivorCharacters[0];
    const compatibility = {
      pullingSubdivision: survivor.subdivisionFamily === "pulling",
      canonicalPointOrder: canonicalPointOrder(
        order,
        actionRootedOracle.degree,
      ),
      zeroPeriodicPotential: zeroPotential(
        potential,
        actionRootedOracle.degree,
      ),
      existingTemplateApiCompatible: false,
    };
    compatibility.existingTemplateApiCompatible =
      compatibility.pullingSubdivision &&
      compatibility.canonicalPointOrder &&
      compatibility.zeroPeriodicPotential;
    const survivorRecord = {
      trialId: survivor.trialId,
      characterId: survivor.characterId,
      orderId: survivor.orderId,
      potentialId: survivor.potentialId,
      tiePolarity: survivor.tiePolarity,
      subdivisionFamily: survivor.subdivisionFamily,
      compatibility,
      compatibilityDigest: "",
    };
    survivorRecord.compatibilityDigest = canonicalSha256({
      ...survivorRecord,
      compatibilityDigest: "",
    });
    upstream.survivor = survivorRecord;
    setStage(
      stages,
      "upstream-replay",
      "passed",
      "The action, full integral H1 basis, and selected cheap-screen survivor replayed exactly.",
    );

    currentStage = "generalized-compression";
    const compressionCertificate = buildGeneralizedCompressionCertificate(
      system,
      accepted,
      options.generalizedCompressionOptions,
    );
    const compressionReplay = verifyGeneralizedCompressionCertificate(
      system,
      accepted,
      compressionCertificate,
      {
        ...(options.generalizedCompressionOptions?.sourceQuotientVertexIds
          ? {
              sourceQuotientVertexIds:
                options.generalizedCompressionOptions.sourceQuotientVertexIds,
            }
          : {}),
        ...(options.generalizedCompressionOptions?.coverCompression
          ? {
              coverCompression:
                options.generalizedCompressionOptions.coverCompression,
            }
          : {}),
      },
    );
    generalizedCompression = {
      certificate: compressionCertificate,
      replay: compressionReplay,
    };
    checks.generalizedCompressionReplayed = compressionReplay.valid;
    if (!compressionReplay.valid) {
      throw new Error(
        `The generalized compression did not replay: ${compressionReplay.errors.join(" ")}`,
      );
    }
    claims.push(
      "The action-rooted generalized compression records and replays every spherical type, every |W_T|-element rooted fiber, and every proper spherical face map.",
    );
    setStage(
      stages,
      "generalized-compression",
      "passed",
      `Replayed ${compressionCertificate.sphericalTypes.length} spherical types and ${compressionCertificate.rootedFaceRecordCount} rooted face records.`,
    );

    if (!compatibility.existingTemplateApiCompatible) {
      checks.templateRuleMatchesSelectedSurvivor = false;
      status = "incomplete";
      outcome = "compression-sidecar-only";
      currentStage = "full-integral-template-stream";
      const detail =
        "The selected survivor uses a noncanonical pulling order, nonzero periodic potential, or stellar subdivision, while the existing full template API implements only canonical point-order pulling with zero periodic potential.";
      setStage(stages, currentStage, "incomplete", detail);
      stop = {
        stage: currentStage,
        code: "cheap-survivor-rule-not-supported-by-full-template-api",
        detail,
      };
      nonpromotableGap = {
        code: "cheap-survivor-rule-not-supported-by-full-template-api",
        detail,
        requiredCapability:
          "A full-quotient linear-template streamer for the selected global order, periodic potential, and subdivision family, including all introduced subdivision vertices.",
        preservedResult: "replayed-full-generalized-compression-sidecar",
      };
      warnings.push(
        "The generalized compression is complete, but this cheap-screen survivor was not promoted to a different height/subdivision rule.",
      );
      return finish();
    }
    if (h1.rank > 4) {
      status = "incomplete";
      outcome = "compression-sidecar-only";
      currentStage = "exact-height-arrangement";
      const detail = `Full integral H1 has rank ${h1.rank}; the in-process exact ternary cone engine supports ranks at most four.`;
      setStage(
        stages,
        "full-integral-template-stream",
        "incomplete",
        "Not run because no rank-generic in-process exact cone backend is available.",
      );
      setStage(stages, currentStage, "incomplete", detail);
      stop = {
        stage: currentStage,
        code: "full-h1-rank-exceeds-in-process-exact-cone-engine",
        detail,
      };
      nonpromotableGap = {
        code: "full-h1-rank-exceeds-in-process-exact-cone-engine",
        detail,
        requiredCapability:
          "A replayable exact rational-cone backend wired to exhaustive full-arrangement splitting in arbitrary H1 rank.",
        preservedResult: "replayed-full-generalized-compression-sidecar",
      };
      warnings.push(
        "No lower-rank slice was substituted for the certified full integral character lattice.",
      );
      return finish();
    }

    currentStage = "full-integral-template-stream";
    const collected = collectTemplates(
      actionRootedOracle,
      compressionCertificate,
      options.generalizedCompressionOptions,
      cocycleBasis,
      bounds,
    );
    if (
      collected.stopCode ||
      collected.stream.status !== "completed" ||
      collected.stream.scanOutcome !== "exhaustive-request" ||
      !collected.stream.checks.everyQuotientPointStreamed ||
      !collected.stream.adjacencyIncluded ||
      collected.templates.length !== actionRootedOracle.degree
    ) {
      if (collected.stopCode) {
        throw new StageResourceBoundError(
          collected.stopCode,
          `The full template stream stopped at ${collected.stopCode}.`,
        );
      }
      throw new Error(
        `The full integral template stream failed: ${collected.stream.errors.join(" ")}`,
      );
    }
    templateCompatibility = compatibilityWitness({
      report: options.cheapScreenReport,
      trial: survivor,
      characterId: survivorCharacter.id,
      characterCoordinates: survivorCharacter.coordinates,
      templates: collected.templates,
      degree: actionRootedOracle.degree,
    });
    checks.templateRuleMatchesSelectedSurvivor = true;
    setStage(
      stages,
      currentStage,
      "passed",
      `Streamed all ${collected.templates.length} quotient-point templates with ${collected.germCount} germ occurrences.`,
    );

    currentStage = "exact-height-arrangement";
    arrangement = buildArrangement(actionRootedOracle, collected, bounds);
    checks.exactArrangementReplayed =
      arrangement.coverReplay.status === "passed" &&
      Object.values(arrangement.checks).every(Boolean);
    if (!checks.exactArrangementReplayed) {
      throw new Error("The exact full-H1 arrangement did not replay.");
    }
    setStage(
      stages,
      currentStage,
      "passed",
      `Enumerated ${arrangement.census.arrangementFaceCount} realizable nonzero height-sign faces with both offset polarities.`,
    );
    claims.push(
      "For the compatible canonical pulling rule, every realizable nonzero height-sign face in the full integral H1 lattice has a primitive integral representative; raw-zero faces use the exact recorded point-order tie in both polarities.",
    );
    status = "completed";
    outcome = "exact-arrangement-complete";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exactConeBound =
      currentStage === "exact-height-arrangement" &&
      error instanceof RangeError &&
      /(?:cap|exceed|Fourier-Motzkin)/iu.test(message);
    if (error instanceof StageResourceBoundError || exactConeBound) {
      status = "incomplete";
      outcome = generalizedCompression
        ? "compression-sidecar-only"
        : "incomplete-before-compression";
      const code =
        error instanceof StageResourceBoundError
          ? error.code
          : "exact-cone-resource-bound";
      stop = { stage: currentStage, code, detail: message };
      setStage(stages, currentStage, "incomplete", message);
      warnings.push(
        "A declared exact resource bound stopped this stage; the stop is replayable and carries no negative conclusion.",
      );
    } else {
      status = "failed";
      outcome = "failed";
      setStage(stages, currentStage, "failed", message);
      errors.push(message);
    }
  }
  return finish();
}

export function replayGenericCompactExpensiveStage(
  systemInput: unknown,
  accepted: TorsionFreeCandidateResult,
  options: GenericCompactExpensiveStageOptions,
  storedInput: unknown,
): GenericCompactExpensiveStageReplay {
  const checks: GenericCompactExpensiveStageReplay["checks"] = {
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
        "The stored expensive-stage certificate must be an object.",
      );
    }
    const stored = storedInput as GenericCompactExpensiveStageCertificate;
    checks.envelopeRecognized =
      stored.schemaVersion === 1 &&
      stored.kind === "generic-compact-action-expensive-stage" &&
      stored.method ===
        "action-rooted-generalized-compression-and-full-h1-height-arrangement" &&
      ["completed", "incomplete", "failed"].includes(stored.status);
    if (!checks.envelopeRecognized) {
      errors.push(
        "The expensive-stage certificate envelope is not recognized.",
      );
    }
    checks.storedCertificateDigestValid =
      typeof stored.certificateDigest === "string" &&
      DIGEST_PATTERN.test(stored.certificateDigest) &&
      stored.certificateDigest ===
        computeGenericCompactExpensiveStageDigest(stored);
    if (!checks.storedCertificateDigestValid) {
      errors.push("The stored expensive-stage certificate digest is stale.");
    }
    if (!checks.envelopeRecognized || !checks.storedCertificateDigestValid) {
      throw new Error(
        "Refusing to rebuild from an unrecognized or stale expensive-stage certificate.",
      );
    }
    const rebuilt = buildGenericCompactExpensiveStage(systemInput, accepted, {
      ...options,
      bounds: stored.budgets,
    });
    rebuiltCertificateDigest = rebuilt.certificateDigest;
    checks.exactActionRootedRebuildMatches =
      canonicalSha256(rebuilt) === canonicalSha256(stored);
    if (!checks.exactActionRootedRebuildMatches) {
      errors.push(
        "The expensive-stage certificate differs from exact action-rooted replay.",
      );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const uniqueErrors = [...new Set(errors)].sort();
  const status =
    uniqueErrors.length === 0 && Object.values(checks).every(Boolean)
      ? "passed"
      : "failed";
  const payload = {
    schemaVersion: 1 as const,
    kind: "generic-compact-action-expensive-stage-replay" as const,
    status: status as "passed" | "failed",
    checks,
    ...(rebuiltCertificateDigest ? { rebuiltCertificateDigest } : {}),
    errors: uniqueErrors,
  };
  return { ...payload, replayDigest: canonicalSha256(payload) };
}
