import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import {
  replayGenericSparseModularRankCertificateFromReader,
  type GenericSparseIntegerMatrixReader,
  type GenericSparseMatrixSourceBinding,
  type GenericSparseModularRankBudgets,
  type GenericSparseModularRankCertificate,
  type GenericSparseModularRankReplay,
} from "./genericSparseModularRank";
import {
  prepareGenericStreamedH1,
  type GenericStreamedH1Preparation,
} from "./genericStreamedH1Preparation";
import {
  certifyScalableIntegralH1Completion,
  computeScalableSparseIntegerMatrixDigest,
  replayScalableIntegralH1Completion,
  type ScalableIntegralH1CompletionBudgets,
  type ScalableIntegralH1CompletionCertificate,
  type ScalableIntegralH1CompletionInput,
  type ScalableSparseIntegerMatrixReader,
  type ScalableSparseIntegerVectorInput,
} from "./scalableGenericH1Completion";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  type StreamedTrackBIntegralCocycleBasis,
} from "./streamedTrackB";

const ALGORITHM_VERSION =
  "action-rooted-sparse-rank-integral-kernel-wall-completion-v3" as const;
const INTEGER_PATTERN = /^(0|-?[1-9][0-9]*)$/u;

export interface ScalableGenericActionH1SparseVector {
  id: string;
  entries: Array<[number, string]>;
}

/**
 * External integral data completing a modular rank calculation. The witness
 * is bound to one action-rooted preparation and one exact modular certificate.
 */
export interface ScalableGenericActionH1IntegralKernelWitness {
  schemaVersion: 1;
  kind: "scalable-generic-action-integral-kernel-witness";
  method: "primitive-integral-kernel-basis-with-optional-left-inverse";
  source: {
    preparationDigest: string;
    boundaryMatrixDigest: string;
    modularRankCertificateDigest: string;
  };
  basis: ScalableGenericActionH1SparseVector[];
  integralLeftInverseRows?: ScalableGenericActionH1SparseVector[];
  witnessDigest: string;
}

export interface ScalableGenericActionH1Certificate {
  schemaVersion: 1;
  kind: "scalable-generic-action-integral-h1";
  status: "passed" | "incomplete" | "failed";
  method: "streamed-action-preparation-plus-proof-carrying-integral-completion";
  algorithmVersion: typeof ALGORITHM_VERSION;
  source: {
    systemCanonicalSha256: string;
    actionRowsCanonicalSha256: string;
    suppliedTorsionFreeCertificateDigest: string;
    replayedTorsionFreeCertificateDigest?: string;
    oracleStructureHash: string;
    preparationDigest: string;
    preparedBoundaryDigest: string;
    preparedGenericSparseMatrixDigest: string;
    preparedWallVectorDigest: string;
    modularBoundaryDigest: string;
    completionBoundaryDigest?: string;
    modularRankCertificateDigest: string;
    integralKernelWitnessDigest: string;
    adapterSourceDigest: string;
  };
  modularRank: {
    certificateDigest: string;
    replayDigest?: string;
    replayBudgets?: Required<GenericSparseModularRankBudgets>;
    status: "passed" | "incomplete" | "failed";
    prime?: number;
    rank?: number;
    nullity?: number;
  };
  torsionFree: {
    suppliedCertificateDigest: string;
    replayedCertificateDigest?: string;
    replayBudgets: Required<ScalableGenericActionH1TorsionFreeReplayBudgets>;
    status: "passed" | "failed";
  };
  integralKernel: {
    witnessDigest: string;
    basisRank: number;
    suppliedIntegralLeftInverse: boolean;
  };
  completion?: ScalableIntegralH1CompletionCertificate;
  h1?: {
    rank: number;
    relationRank: number;
    isomorphicTo: string;
    latticeBasisDigest: string;
    cocycleSectionDigest: string | null;
    wallRank: number;
    wallIndexInSaturation: string;
    wallSaturationEqualsFullH1: boolean;
  };
  checks: {
    actionRowsMatchOracle: boolean;
    suppliedOracleStructureMatchesCanonical: boolean;
    suppliedTorsionFreeCertificateBoundToAction: boolean;
    independentTorsionFreeReplayPassed: boolean;
    preparationReplayPassed: boolean;
    preparedGenericSparseMatrixDigestMatches: boolean;
    expectedModularSourceBindings: boolean;
    modularRankReplayPassed: boolean;
    integralKernelEnvelopeRecognized: boolean;
    integralKernelDigestValid: boolean;
    integralKernelSourceBound: boolean;
    integralKernelRankMatchesModularNullity: boolean;
    completionPassed: boolean;
    cocycleBasisConstructed: boolean;
    allClaimedChecksPassed: boolean;
  };
  errors: string[];
  stopReason?: string;
  nonClaims: string[];
  certificateDigest: string;
}

export interface ScalableGenericActionH1BuildInput {
  oracle: StreamedLawfulDavisOracle;
  accepted: TorsionFreeCandidateResult;
  preparation: GenericStreamedH1Preparation;
  modularRankCertificate: GenericSparseModularRankCertificate;
  integralKernelWitness: ScalableGenericActionH1IntegralKernelWitness;
  rankReplayBudgets?: GenericSparseModularRankBudgets;
  torsionFreeReplayBudgets?: ScalableGenericActionH1TorsionFreeReplayBudgets;
  completionBudgets?: ScalableIntegralH1CompletionBudgets;
}

export interface ScalableGenericActionH1TorsionFreeReplayBudgets {
  maxRankForExhaustiveEnumeration?: number;
  maxSubsetsToCheck?: number;
  maxSphericalSubgroupElements?: number;
  maxWitnesses?: number;
}

export interface ScalableGenericActionH1BuildResult {
  certificate: ScalableGenericActionH1Certificate;
  /** Null exactly when certification fails or b1 is zero. */
  integralCocycleBasis: StreamedTrackBIntegralCocycleBasis | null;
}

export interface ScalableGenericActionH1Replay {
  schemaVersion: 1;
  kind: "scalable-generic-action-integral-h1-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    storedCertificateDigestValid: boolean;
    oracleOutcomeMatches: boolean;
    torsionFreeOutcomeMatches: boolean;
    preparationOutcomeMatches: boolean;
    modularRankOutcomeMatches: boolean;
    integralKernelOutcomeMatches: boolean;
    completionOutcomeMatches: boolean;
    exactRebuildMatches: boolean;
  };
  rebuiltCertificateDigest?: string;
  errors: string[];
  replayDigest: string;
}

interface ValidatedKernelWitness {
  basis: ScalableGenericActionH1SparseVector[];
  integralLeftInverseRows?: ScalableGenericActionH1SparseVector[];
}

class ScalableGenericActionH1IncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScalableGenericActionH1IncompleteError";
  }
}

const DEFAULT_TORSION_FREE_REPLAY_BUDGETS: Required<ScalableGenericActionH1TorsionFreeReplayBudgets> =
  {
    maxRankForExhaustiveEnumeration: 12,
    maxSubsetsToCheck: 4_096,
    maxSphericalSubgroupElements: 100_000,
    maxWitnesses: 8_192,
  };

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveTorsionFreeReplayBudgets(
  supplied: ScalableGenericActionH1TorsionFreeReplayBudgets | undefined,
): Required<ScalableGenericActionH1TorsionFreeReplayBudgets> {
  const expectedKeys = Object.keys(DEFAULT_TORSION_FREE_REPLAY_BUDGETS);
  const unknownKeys = Object.keys(supplied ?? {}).filter(
    (key) => !expectedKeys.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown torsion-free replay budget keys: ${unknownKeys.sort().join(", ")}.`,
    );
  }
  const budgets = { ...DEFAULT_TORSION_FREE_REPLAY_BUDGETS, ...supplied };
  for (const [name, value] of Object.entries(budgets)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
  }
  return budgets;
}

function actionRowsMatchOracle(
  supplied: StreamedLawfulDavisOracle,
  canonical: StreamedLawfulDavisOracle,
  accepted: TorsionFreeCandidateResult,
): boolean {
  const candidate = accepted.candidate;
  return (
    candidate.index === canonical.degree &&
    candidate.generatorImages.length === canonical.generatorCount &&
    supplied.degree === canonical.degree &&
    supplied.generatorCount === canonical.generatorCount &&
    supplied.actionRowsCanonicalSha256 === canonical.actionRowsCanonicalSha256
  );
}

function oraclePublicStructure(
  oracle: StreamedLawfulDavisOracle,
): Record<string, unknown> {
  return {
    system: oracle.system,
    degree: oracle.degree,
    generatorCount: oracle.generatorCount,
    geometricEdgeCount: oracle.geometricEdgeCount,
    rankTwoCellCount: oracle.rankTwoCellCount,
    cellCount: oracle.cellCount,
    cellCountByDimension: oracle.cellCountByDimension,
    sphericalTypes: oracle.sphericalTypes,
    walls: oracle.walls,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    structureHash: oracle.structureHash,
  };
}

function suppliedOracleStructureMatchesCanonical(
  supplied: StreamedLawfulDavisOracle,
  canonical: StreamedLawfulDavisOracle,
): boolean {
  return (
    canonicalSha256(oraclePublicStructure(supplied)) ===
    canonicalSha256(oraclePublicStructure(canonical))
  );
}

function witnessPayload(
  witness: ScalableGenericActionH1IntegralKernelWitness,
): Omit<ScalableGenericActionH1IntegralKernelWitness, "witnessDigest"> {
  const { witnessDigest, ...payload } = witness;
  void witnessDigest;
  return payload;
}

export function computeScalableGenericActionH1IntegralKernelWitnessDigest(
  witness: ScalableGenericActionH1IntegralKernelWitness,
): string {
  return canonicalSha256(witnessPayload(witness));
}

function certificatePayload(
  certificate: ScalableGenericActionH1Certificate,
): Omit<ScalableGenericActionH1Certificate, "certificateDigest"> {
  const { certificateDigest, ...payload } = certificate;
  void certificateDigest;
  return payload;
}

export function computeScalableGenericActionH1CertificateDigest(
  certificate: ScalableGenericActionH1Certificate,
): string {
  return canonicalSha256(certificatePayload(certificate));
}

function normalizeSparseVectors(
  supplied: readonly ScalableGenericActionH1SparseVector[],
  dimension: number,
  label: string,
): ScalableGenericActionH1SparseVector[] {
  const ids = new Set<string>();
  return supplied.map((vector, vectorIndex) => {
    if (
      vector === null ||
      typeof vector !== "object" ||
      typeof vector.id !== "string" ||
      vector.id.length === 0 ||
      !Array.isArray(vector.entries)
    ) {
      throw new Error(`${label} ${vectorIndex} is not a sparse vector.`);
    }
    if (ids.has(vector.id)) {
      throw new Error(`${label} id ${vector.id} is repeated.`);
    }
    ids.add(vector.id);
    let previousColumn = -1;
    const entries = vector.entries.map((entry, entryIndex) => {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error(
          `${label} ${vectorIndex} entry ${entryIndex} is not a pair.`,
        );
      }
      const [column, coefficient] = entry;
      if (
        !Number.isSafeInteger(column) ||
        column < 0 ||
        column >= dimension ||
        column <= previousColumn
      ) {
        throw new Error(
          `${label} ${vectorIndex} columns must be strictly increasing and in range.`,
        );
      }
      if (
        typeof coefficient !== "string" ||
        !INTEGER_PATTERN.test(coefficient) ||
        coefficient === "0"
      ) {
        throw new Error(
          `${label} ${vectorIndex} entry ${entryIndex} is not a nonzero canonical integer.`,
        );
      }
      previousColumn = column;
      return [column, coefficient] as [number, string];
    });
    return { id: vector.id, entries };
  });
}

function validateIntegralKernelWitness(input: {
  witness: ScalableGenericActionH1IntegralKernelWitness;
  preparationDigest: string;
  boundaryMatrixDigest: string;
  modularRankCertificateDigest: string;
  columnCount: number;
}): {
  envelopeRecognized: boolean;
  digestValid: boolean;
  sourceBound: boolean;
  validated?: ValidatedKernelWitness;
} {
  const { witness } = input;
  const envelopeRecognized =
    witness?.schemaVersion === 1 &&
    witness.kind === "scalable-generic-action-integral-kernel-witness" &&
    witness.method ===
      "primitive-integral-kernel-basis-with-optional-left-inverse";
  let digestValid = false;
  try {
    digestValid =
      typeof witness.witnessDigest === "string" &&
      witness.witnessDigest ===
        computeScalableGenericActionH1IntegralKernelWitnessDigest(witness);
  } catch {
    digestValid = false;
  }
  const sourceBound =
    witness.source?.preparationDigest === input.preparationDigest &&
    witness.source?.boundaryMatrixDigest === input.boundaryMatrixDigest &&
    witness.source?.modularRankCertificateDigest ===
      input.modularRankCertificateDigest;
  if (!envelopeRecognized || !digestValid || !sourceBound) {
    return { envelopeRecognized, digestValid, sourceBound };
  }
  const basis = normalizeSparseVectors(
    witness.basis,
    input.columnCount,
    "Integral kernel basis vector",
  );
  const integralLeftInverseRows =
    witness.integralLeftInverseRows === undefined
      ? undefined
      : normalizeSparseVectors(
          witness.integralLeftInverseRows,
          input.columnCount,
          "Integral left-inverse row",
        );
  return {
    envelopeRecognized,
    digestValid,
    sourceBound,
    validated: {
      basis,
      ...(integralLeftInverseRows === undefined
        ? {}
        : { integralLeftInverseRows }),
    },
  };
}

export function sealScalableGenericActionH1IntegralKernelWitness(input: {
  preparation: GenericStreamedH1Preparation;
  modularRankCertificate: GenericSparseModularRankCertificate;
  basis: readonly ScalableGenericActionH1SparseVector[];
  integralLeftInverseRows?: readonly ScalableGenericActionH1SparseVector[];
}): ScalableGenericActionH1IntegralKernelWitness {
  const basis = normalizeSparseVectors(
    input.basis,
    input.preparation.certificate.boundary.columnCount,
    "Integral kernel basis vector",
  );
  const integralLeftInverseRows =
    input.integralLeftInverseRows === undefined
      ? undefined
      : normalizeSparseVectors(
          input.integralLeftInverseRows,
          input.preparation.certificate.boundary.columnCount,
          "Integral left-inverse row",
        );
  const witness: ScalableGenericActionH1IntegralKernelWitness = {
    schemaVersion: 1,
    kind: "scalable-generic-action-integral-kernel-witness",
    method: "primitive-integral-kernel-basis-with-optional-left-inverse",
    source: {
      preparationDigest: input.preparation.certificate.preparationDigest,
      boundaryMatrixDigest: input.modularRankCertificate.source.matrixDigest,
      modularRankCertificateDigest:
        input.modularRankCertificate.certificateDigest,
    },
    basis,
    ...(integralLeftInverseRows === undefined
      ? {}
      : { integralLeftInverseRows }),
    witnessDigest: "",
  };
  witness.witnessDigest =
    computeScalableGenericActionH1IntegralKernelWitnessDigest(witness);
  return witness;
}

export function scalableGenericActionH1SourceBindings(
  preparation: GenericStreamedH1Preparation,
  accepted: TorsionFreeCandidateResult,
): GenericSparseMatrixSourceBinding[] {
  const certificate = preparation.certificate;
  return [
    {
      id: "action-rows",
      sha256: certificate.source.actionRowsCanonicalSha256,
    },
    {
      id: "generic-sparse-matrix",
      sha256: certificate.export.linboxSparseRow.genericSparseMatrixDigest,
    },
    {
      id: "oracle-structure",
      sha256: certificate.source.oracleStructureHash,
    },
    { id: "preparation", sha256: certificate.preparationDigest },
    {
      id: "prepared-boundary",
      sha256: certificate.boundary.sparseBoundaryDigest,
    },
    {
      id: "torsion-free-certificate",
      sha256: canonicalSha256(accepted.certificate),
    },
  ].sort((left, right) => compareStrings(left.id, right.id));
}

export function scalableGenericActionH1SparseMatrixReader(
  preparation: GenericStreamedH1Preparation,
): GenericSparseIntegerMatrixReader {
  return {
    schemaVersion: 1,
    rowCount: preparation.certificate.boundary.rowCount,
    columnCount: preparation.certificate.boundary.columnCount,
    forEachRow(visitor): void {
      preparation.forEachBoundaryRow((row) => {
        visitor({ row: row.row, entries: row.entries });
      });
    },
  };
}

function scalableCompletionBoundaryReader(
  preparation: GenericStreamedH1Preparation,
): ScalableSparseIntegerMatrixReader {
  return {
    rowCount: preparation.certificate.boundary.rowCount,
    columnCount: preparation.certificate.boundary.columnCount,
    forEachRow(visitor): void {
      preparation.forEachBoundaryRow((row) => {
        visitor({ id: row.cellId, entries: row.entries }, row.row);
      });
    },
  };
}

function streamWalls(
  preparation: GenericStreamedH1Preparation,
): ScalableSparseIntegerVectorInput[] {
  const walls: ScalableSparseIntegerVectorInput[] = [];
  preparation.forEachTwoSidedWallVector((wall) => {
    walls.push({ id: wall.wallId, entries: wall.entries });
  });
  if (walls.length !== preparation.certificate.walls.twoSidedWallCount) {
    throw new Error(
      `Streamed ${walls.length}/${preparation.certificate.walls.twoSidedWallCount} two-sided walls.`,
    );
  }
  return walls;
}

function sourceObject(
  input: ScalableGenericActionH1BuildInput,
): Omit<
  ScalableGenericActionH1Certificate["source"],
  "completionBoundaryDigest" | "adapterSourceDigest"
> {
  const preparation = input.preparation.certificate;
  return {
    systemCanonicalSha256: preparation.source.systemCanonicalSha256,
    actionRowsCanonicalSha256: preparation.source.actionRowsCanonicalSha256,
    suppliedTorsionFreeCertificateDigest: canonicalSha256(
      input.accepted.certificate,
    ),
    oracleStructureHash: preparation.source.oracleStructureHash,
    preparationDigest: preparation.preparationDigest,
    preparedBoundaryDigest: preparation.boundary.sparseBoundaryDigest,
    preparedGenericSparseMatrixDigest:
      preparation.export.linboxSparseRow.genericSparseMatrixDigest,
    preparedWallVectorDigest: preparation.walls.wallVectorDigest,
    modularBoundaryDigest: input.modularRankCertificate.source.matrixDigest,
    modularRankCertificateDigest:
      input.modularRankCertificate.certificateDigest,
    integralKernelWitnessDigest: input.integralKernelWitness.witnessDigest,
  };
}

function adapterSourceDigest(
  source: Omit<
    ScalableGenericActionH1Certificate["source"],
    "adapterSourceDigest"
  >,
): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "action-rooted-scalable-integral-h1-source",
    source,
  });
}

function completionInput(input: {
  build: ScalableGenericActionH1BuildInput;
  witness: ValidatedKernelWitness;
  completionBoundaryDigest: string;
  sourceDigest: string;
  budgets?: ScalableIntegralH1CompletionBudgets;
}): ScalableIntegralH1CompletionInput {
  const rank = input.build.modularRankCertificate;
  return {
    schemaVersion: 1,
    source: {
      sourceDigest: input.sourceDigest,
      preparationDigest: input.build.preparation.certificate.preparationDigest,
      boundaryDigest: input.completionBoundaryDigest,
    },
    boundary: scalableCompletionBoundaryReader(input.build.preparation),
    kernelBasis: input.witness.basis,
    ...(input.witness.integralLeftInverseRows === undefined
      ? {}
      : {
          integralLeftInverseRows: input.witness.integralLeftInverseRows,
        }),
    modularRankWitness: {
      prime: rank.modulusPrime,
      rank: rank.rank,
      pivotRows: rank.lowerBound.pivotRows,
      pivotColumns: rank.lowerBound.pivotColumns,
    },
    walls: streamWalls(input.build.preparation),
    ...(input.budgets === undefined ? {} : { budgets: input.budgets }),
  };
}

function buildIntegralCocycleBasis(input: {
  oracle: StreamedLawfulDavisOracle;
  preparation: GenericStreamedH1Preparation;
  witness: ValidatedKernelWitness;
  latticeBasisDigest: string;
}): StreamedTrackBIntegralCocycleBasis | null {
  const coordinateIds = input.witness.basis.map((vector) => vector.id);
  if (coordinateIds.length === 0) return null;
  const pairsByCotreeColumn = new Map<
    number,
    Array<readonly [number, bigint]>
  >();
  input.witness.basis.forEach((vector, coordinate) => {
    for (const [column, coefficient] of vector.entries) {
      const pairs = pairsByCotreeColumn.get(column) ?? [];
      pairs.push([coordinate, BigInt(coefficient)]);
      pairsByCotreeColumn.set(column, pairs);
    }
  });
  const edgeCoordinatePairs = (point: number, generator: number) => {
    if (
      !Number.isSafeInteger(point) ||
      point < 0 ||
      point >= input.oracle.degree
    ) {
      throw new RangeError(`Cocycle point ${point} is outside the quotient.`);
    }
    if (
      !Number.isSafeInteger(generator) ||
      generator < 0 ||
      generator >= input.oracle.generatorCount
    ) {
      throw new RangeError(`Cocycle generator ${generator} is out of range.`);
    }
    const geometric = input.oracle.geometricEdge(point, generator);
    const column = input.preparation.cotreeColumnForEdgeIndex(
      geometric.edgeIndex,
    );
    if (column === null) return [];
    const traversal = geometric.sourcePoint === point ? 1n : -1n;
    return (pairsByCotreeColumn.get(column) ?? []).map(
      ([coordinate, coefficient]) =>
        [coordinate, (traversal * coefficient).toString()] as const,
    );
  };
  const expectedCocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(input.oracle, {
      coordinateIds,
      edgeCoordinatePairs,
    });
  return {
    coordinateIds,
    latticeBasisDigest: input.latticeBasisDigest,
    expectedCocycleSectionDigest,
    edgeCoordinatePairs,
  };
}

function makeCertificate(
  payload: Omit<ScalableGenericActionH1Certificate, "certificateDigest">,
): ScalableGenericActionH1Certificate {
  const certificate: ScalableGenericActionH1Certificate = {
    ...payload,
    certificateDigest: "",
  };
  certificate.certificateDigest =
    computeScalableGenericActionH1CertificateDigest(certificate);
  return certificate;
}

export function buildScalableGenericActionH1(
  input: ScalableGenericActionH1BuildInput,
): ScalableGenericActionH1BuildResult {
  const torsionFreeReplayBudgets = resolveTorsionFreeReplayBudgets(
    input.torsionFreeReplayBudgets,
  );
  const errors: string[] = [];
  let stopReason: string | undefined;
  const checks: ScalableGenericActionH1Certificate["checks"] = {
    actionRowsMatchOracle: false,
    suppliedOracleStructureMatchesCanonical: false,
    suppliedTorsionFreeCertificateBoundToAction: false,
    independentTorsionFreeReplayPassed: false,
    preparationReplayPassed: false,
    preparedGenericSparseMatrixDigestMatches: false,
    expectedModularSourceBindings: false,
    modularRankReplayPassed: false,
    integralKernelEnvelopeRecognized: false,
    integralKernelDigestValid: false,
    integralKernelSourceBound: false,
    integralKernelRankMatchesModularNullity: false,
    completionPassed: false,
    cocycleBasisConstructed: false,
    allClaimedChecksPassed: false,
  };
  let baseSource = sourceObject(input);
  let source: ScalableGenericActionH1Certificate["source"] = {
    ...baseSource,
    adapterSourceDigest: adapterSourceDigest(baseSource),
  };
  let rankReplay: GenericSparseModularRankReplay | undefined;
  let validatedWitness: ValidatedKernelWitness | undefined;
  let completion: ScalableIntegralH1CompletionCertificate | undefined;
  let replayedTorsionFreeCertificateDigest: string | undefined;
  let integralCocycleBasis: StreamedTrackBIntegralCocycleBasis | null = null;
  let h1: ScalableGenericActionH1Certificate["h1"];

  try {
    const canonicalOracle = buildStreamedLawfulDavisOracle({
      system: input.oracle.system,
      generatorImages: input.accepted.candidate.generatorImages,
    });
    checks.actionRowsMatchOracle = actionRowsMatchOracle(
      input.oracle,
      canonicalOracle,
      input.accepted,
    );
    checks.suppliedOracleStructureMatchesCanonical =
      suppliedOracleStructureMatchesCanonical(input.oracle, canonicalOracle);
    if (
      !checks.actionRowsMatchOracle ||
      !checks.suppliedOracleStructureMatchesCanonical
    ) {
      throw new Error(
        "The supplied oracle source structure does not match the accepted action's canonical oracle.",
      );
    }
    const sphericalPlan = planSphericalSpecialSubgroups(
      canonicalOracle.system,
      {
        maxRankForExhaustiveEnumeration:
          torsionFreeReplayBudgets.maxRankForExhaustiveEnumeration,
        maxSubsetsToCheck: torsionFreeReplayBudgets.maxSubsetsToCheck,
      },
    );
    const replayedTorsionFreeCertificate = certifyTorsionFreeAction(
      canonicalOracle.system,
      input.accepted.candidate,
      sphericalPlan,
      {
        maxSphericalSubgroupElements:
          torsionFreeReplayBudgets.maxSphericalSubgroupElements,
        maxWitnesses: torsionFreeReplayBudgets.maxWitnesses,
      },
    );
    replayedTorsionFreeCertificateDigest = canonicalSha256(
      replayedTorsionFreeCertificate,
    );
    checks.suppliedTorsionFreeCertificateBoundToAction =
      input.accepted.certificate.status === "passed" &&
      canonicalSha256(input.accepted.certificate) ===
        replayedTorsionFreeCertificateDigest;
    checks.independentTorsionFreeReplayPassed =
      sphericalPlan.status === "complete" &&
      replayedTorsionFreeCertificate.status === "passed" &&
      Object.values(replayedTorsionFreeCertificate.checks).every(Boolean);
    if (
      !checks.suppliedTorsionFreeCertificateBoundToAction ||
      !checks.independentTorsionFreeReplayPassed
    ) {
      throw new Error(
        "The supplied action did not pass an exact independent torsion-free replay.",
      );
    }
    baseSource = {
      ...baseSource,
      replayedTorsionFreeCertificateDigest,
    };
    source = {
      ...baseSource,
      adapterSourceDigest: adapterSourceDigest(baseSource),
    };

    // Reconstruct the runtime provider as well as its certificate. This keeps
    // later matrix streams source-rooted even if a caller fabricates an object
    // whose methods disagree with its claimed preparation certificate.
    const canonicalPreparation = prepareGenericStreamedH1(canonicalOracle);
    checks.preparationReplayPassed =
      canonicalSha256(canonicalPreparation.certificate) ===
      canonicalSha256(input.preparation.certificate);
    if (!checks.preparationReplayPassed) {
      throw new Error("The action-rooted sparse preparation did not replay.");
    }
    const canonicalInput: ScalableGenericActionH1BuildInput = {
      ...input,
      oracle: canonicalOracle,
      preparation: canonicalPreparation,
    };
    baseSource = {
      ...sourceObject(canonicalInput),
      replayedTorsionFreeCertificateDigest,
    };
    source = {
      ...baseSource,
      adapterSourceDigest: adapterSourceDigest(baseSource),
    };
    checks.preparedGenericSparseMatrixDigestMatches =
      canonicalPreparation.certificate.export.linboxSparseRow
        .genericSparseMatrixDigest ===
      input.modularRankCertificate.source.matrixDigest;

    const expectedBindings = scalableGenericActionH1SourceBindings(
      canonicalPreparation,
      input.accepted,
    );
    checks.expectedModularSourceBindings =
      canonicalSha256(input.modularRankCertificate.source.sourceBindings) ===
      canonicalSha256(expectedBindings);
    rankReplay = replayGenericSparseModularRankCertificateFromReader({
      matrixReader:
        scalableGenericActionH1SparseMatrixReader(canonicalPreparation),
      sourceBindings: expectedBindings,
      certificate: input.modularRankCertificate,
      budgets: input.rankReplayBudgets,
    });
    checks.modularRankReplayPassed = rankReplay.status === "passed";
    if (rankReplay.status === "incomplete") {
      throw new ScalableGenericActionH1IncompleteError(
        rankReplay.stopReason ??
          "The modular-rank replay reached an exact resource bound.",
      );
    }
    if (
      !checks.preparedGenericSparseMatrixDigestMatches ||
      !checks.expectedModularSourceBindings ||
      !checks.modularRankReplayPassed
    ) {
      throw new Error(
        "The proof-carrying modular rank certificate did not replay from the prepared boundary.",
      );
    }

    const witnessValidation = validateIntegralKernelWitness({
      witness: input.integralKernelWitness,
      preparationDigest: canonicalPreparation.certificate.preparationDigest,
      boundaryMatrixDigest: input.modularRankCertificate.source.matrixDigest,
      modularRankCertificateDigest:
        input.modularRankCertificate.certificateDigest,
      columnCount: canonicalPreparation.certificate.boundary.columnCount,
    });
    checks.integralKernelEnvelopeRecognized =
      witnessValidation.envelopeRecognized;
    checks.integralKernelDigestValid = witnessValidation.digestValid;
    checks.integralKernelSourceBound = witnessValidation.sourceBound;
    validatedWitness = witnessValidation.validated;
    checks.integralKernelRankMatchesModularNullity =
      validatedWitness !== undefined &&
      validatedWitness.basis.length === input.modularRankCertificate.nullity;
    if (
      validatedWitness === undefined ||
      !checks.integralKernelRankMatchesModularNullity
    ) {
      throw new Error(
        "The integral kernel witness is invalid, source-unbound, or has the wrong rank.",
      );
    }

    const boundaryReader =
      scalableCompletionBoundaryReader(canonicalPreparation);
    const completionBoundaryDigest = computeScalableSparseIntegerMatrixDigest(
      boundaryReader,
      input.completionBudgets,
    );
    source = {
      ...baseSource,
      completionBoundaryDigest,
      adapterSourceDigest: adapterSourceDigest({
        ...baseSource,
        completionBoundaryDigest,
      }),
    };
    const completionBuildInput = completionInput({
      build: canonicalInput,
      witness: validatedWitness,
      completionBoundaryDigest,
      sourceDigest: source.adapterSourceDigest,
      budgets: input.completionBudgets,
    });
    completion = certifyScalableIntegralH1Completion(completionBuildInput);
    checks.completionPassed = completion.status === "passed";
    if (completion.status === "incomplete") {
      throw new ScalableGenericActionH1IncompleteError(
        completion.stopReason ??
          "The integral H1 completion reached an exact resource bound.",
      );
    }
    if (
      !checks.completionPassed ||
      completion.h1 === undefined ||
      completion.walls === undefined
    ) {
      throw new Error(
        completion.errors.join(" ") ||
          "The saturated integral H1 completion failed.",
      );
    }
    const latticeBasisDigest = canonicalSha256({
      schemaVersion: 1,
      method: "action-rooted-full-integral-h1-basis",
      preparationDigest: source.preparationDigest,
      modularBoundaryDigest: source.modularBoundaryDigest,
      modularRankCertificateDigest: source.modularRankCertificateDigest,
      integralKernelWitnessDigest: input.integralKernelWitness.witnessDigest,
      kernelBasisDigest: completion.h1.kernelBasisDigest,
      integralLeftInverseDigest: completion.h1.integralLeftInverseDigest,
    });
    integralCocycleBasis = buildIntegralCocycleBasis({
      oracle: canonicalOracle,
      preparation: canonicalPreparation,
      witness: validatedWitness,
      latticeBasisDigest,
    });
    checks.cocycleBasisConstructed =
      completion.h1.rank === 0 || integralCocycleBasis !== null;
    h1 = {
      rank: completion.h1.rank,
      relationRank: completion.h1.relationRank,
      isomorphicTo: completion.h1.isomorphicTo,
      latticeBasisDigest,
      cocycleSectionDigest:
        integralCocycleBasis?.expectedCocycleSectionDigest ?? null,
      wallRank: completion.walls.wallRank,
      wallIndexInSaturation: completion.walls.wallIndexInSaturation,
      wallSaturationEqualsFullH1: completion.walls.saturationEqualsFullH1,
    };
  } catch (error) {
    if (
      error instanceof ScalableGenericActionH1IncompleteError ||
      (error instanceof Error && error.name === "ResourceBoundError")
    ) {
      stopReason = error.message;
    } else {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  checks.allClaimedChecksPassed =
    errors.length === 0 &&
    Object.entries(checks)
      .filter(([name]) => name !== "allClaimedChecksPassed")
      .every(([, passed]) => passed);
  if (!checks.allClaimedChecksPassed) integralCocycleBasis = null;
  const uniqueErrors = [...new Set(errors)].sort(compareStrings);
  const certificate = makeCertificate({
    schemaVersion: 1,
    kind: "scalable-generic-action-integral-h1",
    status: checks.allClaimedChecksPassed
      ? "passed"
      : stopReason === undefined
        ? "failed"
        : "incomplete",
    method:
      "streamed-action-preparation-plus-proof-carrying-integral-completion",
    algorithmVersion: ALGORITHM_VERSION,
    source,
    torsionFree: {
      suppliedCertificateDigest:
        baseSource.suppliedTorsionFreeCertificateDigest,
      ...(replayedTorsionFreeCertificateDigest === undefined
        ? {}
        : { replayedCertificateDigest: replayedTorsionFreeCertificateDigest }),
      replayBudgets: torsionFreeReplayBudgets,
      status:
        checks.actionRowsMatchOracle &&
        checks.suppliedOracleStructureMatchesCanonical &&
        checks.suppliedTorsionFreeCertificateBoundToAction &&
        checks.independentTorsionFreeReplayPassed
          ? "passed"
          : "failed",
    },
    modularRank: {
      certificateDigest: input.modularRankCertificate.certificateDigest,
      ...(rankReplay === undefined
        ? { status: "failed" as const }
        : {
            replayDigest: rankReplay.replayDigest,
            replayBudgets: rankReplay.budgets,
            status: rankReplay.status,
            ...(rankReplay.certifiedRank === undefined
              ? {}
              : { rank: rankReplay.certifiedRank }),
            ...(rankReplay.certifiedNullity === undefined
              ? {}
              : { nullity: rankReplay.certifiedNullity }),
            prime: input.modularRankCertificate.modulusPrime,
          }),
    },
    integralKernel: {
      witnessDigest: input.integralKernelWitness.witnessDigest,
      basisRank: input.integralKernelWitness.basis?.length ?? 0,
      suppliedIntegralLeftInverse:
        input.integralKernelWitness.integralLeftInverseRows !== undefined,
    },
    ...(completion === undefined ? {} : { completion }),
    ...(h1 === undefined ? {} : { h1 }),
    checks,
    errors: uniqueErrors,
    ...(stopReason === undefined ? {} : { stopReason }),
    nonClaims: [
      "The adapter does not generate the external integral kernel witness.",
      "Integral H1 and wall saturation alone do not prove a fibering theorem.",
      "No Morse-link or kernel-finite-generation conclusion is made here.",
    ],
  });
  return { certificate, integralCocycleBasis };
}

export function replayScalableGenericActionH1(
  input: ScalableGenericActionH1BuildInput,
  storedInput: unknown,
): ScalableGenericActionH1Replay {
  const checks: ScalableGenericActionH1Replay["checks"] = {
    envelopeRecognized: false,
    storedCertificateDigestValid: false,
    oracleOutcomeMatches: false,
    torsionFreeOutcomeMatches: false,
    preparationOutcomeMatches: false,
    modularRankOutcomeMatches: false,
    integralKernelOutcomeMatches: false,
    completionOutcomeMatches: false,
    exactRebuildMatches: false,
  };
  const errors: string[] = [];
  let rebuiltCertificateDigest: string | undefined;
  try {
    if (
      storedInput === null ||
      typeof storedInput !== "object" ||
      Array.isArray(storedInput)
    ) {
      throw new Error("The stored scalable action H1 certificate is invalid.");
    }
    const stored = storedInput as ScalableGenericActionH1Certificate;
    checks.envelopeRecognized =
      stored.schemaVersion === 1 &&
      stored.kind === "scalable-generic-action-integral-h1" &&
      stored.method ===
        "streamed-action-preparation-plus-proof-carrying-integral-completion" &&
      stored.algorithmVersion === ALGORITHM_VERSION &&
      ["passed", "incomplete", "failed"].includes(stored.status);
    checks.storedCertificateDigestValid =
      typeof stored.certificateDigest === "string" &&
      stored.certificateDigest ===
        computeScalableGenericActionH1CertificateDigest(stored);
    const canonicalOracle = buildStreamedLawfulDavisOracle({
      system: input.oracle.system,
      generatorImages: input.accepted.candidate.generatorImages,
    });
    const actionRowsMatch = actionRowsMatchOracle(
      input.oracle,
      canonicalOracle,
      input.accepted,
    );
    const oracleStructureMatches = suppliedOracleStructureMatchesCanonical(
      input.oracle,
      canonicalOracle,
    );
    checks.oracleOutcomeMatches =
      actionRowsMatch === stored.checks.actionRowsMatchOracle &&
      oracleStructureMatches ===
        stored.checks.suppliedOracleStructureMatchesCanonical;
    const canonicalPreparation = prepareGenericStreamedH1(canonicalOracle);
    const preparationPassed =
      canonicalSha256(canonicalPreparation.certificate) ===
      canonicalSha256(input.preparation.certificate);
    checks.preparationOutcomeMatches =
      preparationPassed === stored.checks.preparationReplayPassed;
    const canonicalInput: ScalableGenericActionH1BuildInput = {
      ...input,
      oracle: canonicalOracle,
      preparation: canonicalPreparation,
    };
    const rankReplay = replayGenericSparseModularRankCertificateFromReader({
      matrixReader:
        scalableGenericActionH1SparseMatrixReader(canonicalPreparation),
      sourceBindings: scalableGenericActionH1SourceBindings(
        canonicalPreparation,
        input.accepted,
      ),
      certificate: input.modularRankCertificate,
      budgets: stored.modularRank.replayBudgets,
    });
    checks.modularRankOutcomeMatches =
      (rankReplay.status === "passed") ===
      stored.checks.modularRankReplayPassed;
    const witnessValidation = validateIntegralKernelWitness({
      witness: input.integralKernelWitness,
      preparationDigest: canonicalPreparation.certificate.preparationDigest,
      boundaryMatrixDigest: input.modularRankCertificate.source.matrixDigest,
      modularRankCertificateDigest:
        input.modularRankCertificate.certificateDigest,
      columnCount: canonicalPreparation.certificate.boundary.columnCount,
    });
    const integralKernelValid =
      witnessValidation.envelopeRecognized &&
      witnessValidation.digestValid &&
      witnessValidation.sourceBound &&
      witnessValidation.validated !== undefined &&
      witnessValidation.validated.basis.length ===
        input.modularRankCertificate.nullity;
    checks.integralKernelOutcomeMatches =
      integralKernelValid ===
      (stored.checks.integralKernelEnvelopeRecognized &&
        stored.checks.integralKernelDigestValid &&
        stored.checks.integralKernelSourceBound &&
        stored.checks.integralKernelRankMatchesModularNullity);

    if (
      stored.completion !== undefined &&
      witnessValidation.validated !== undefined &&
      stored.source.completionBoundaryDigest !== undefined
    ) {
      const completionReplayInput = completionInput({
        build: canonicalInput,
        witness: witnessValidation.validated,
        completionBoundaryDigest: stored.source.completionBoundaryDigest,
        sourceDigest: stored.source.adapterSourceDigest,
        budgets: stored.completion.budgets,
      });
      checks.completionOutcomeMatches =
        replayScalableIntegralH1Completion(
          completionReplayInput,
          stored.completion,
        ).status === "passed";
    }
    const rebuilt = buildScalableGenericActionH1({
      ...input,
      rankReplayBudgets: stored.modularRank.replayBudgets,
      torsionFreeReplayBudgets: stored.torsionFree.replayBudgets,
      completionBudgets: stored.completion?.budgets,
    }).certificate;
    rebuiltCertificateDigest = rebuilt.certificateDigest;
    checks.preparationOutcomeMatches =
      rebuilt.checks.preparationReplayPassed ===
      stored.checks.preparationReplayPassed;
    checks.modularRankOutcomeMatches =
      rebuilt.checks.preparedGenericSparseMatrixDigestMatches ===
        stored.checks.preparedGenericSparseMatrixDigestMatches &&
      rebuilt.checks.expectedModularSourceBindings ===
        stored.checks.expectedModularSourceBindings &&
      rebuilt.checks.modularRankReplayPassed ===
        stored.checks.modularRankReplayPassed;
    checks.integralKernelOutcomeMatches =
      rebuilt.checks.integralKernelEnvelopeRecognized ===
        stored.checks.integralKernelEnvelopeRecognized &&
      rebuilt.checks.integralKernelDigestValid ===
        stored.checks.integralKernelDigestValid &&
      rebuilt.checks.integralKernelSourceBound ===
        stored.checks.integralKernelSourceBound &&
      rebuilt.checks.integralKernelRankMatchesModularNullity ===
        stored.checks.integralKernelRankMatchesModularNullity;
    checks.torsionFreeOutcomeMatches =
      canonicalSha256(rebuilt.torsionFree) ===
        canonicalSha256(stored.torsionFree) &&
      rebuilt.checks.actionRowsMatchOracle ===
        stored.checks.actionRowsMatchOracle &&
      rebuilt.checks.suppliedTorsionFreeCertificateBoundToAction ===
        stored.checks.suppliedTorsionFreeCertificateBoundToAction &&
      rebuilt.checks.independentTorsionFreeReplayPassed ===
        stored.checks.independentTorsionFreeReplayPassed;
    checks.oracleOutcomeMatches =
      rebuilt.checks.actionRowsMatchOracle ===
        stored.checks.actionRowsMatchOracle &&
      rebuilt.checks.suppliedOracleStructureMatchesCanonical ===
        stored.checks.suppliedOracleStructureMatchesCanonical;
    if (stored.completion === undefined) {
      checks.completionOutcomeMatches = rebuilt.completion === undefined;
    }
    checks.exactRebuildMatches =
      canonicalSha256(rebuilt) === canonicalSha256(stored);
    if (!checks.envelopeRecognized)
      errors.push("The stored certificate envelope is unrecognized.");
    if (!checks.storedCertificateDigestValid)
      errors.push("The stored certificate digest is stale.");
    if (!checks.oracleOutcomeMatches)
      errors.push("The supplied-oracle replay outcome changed.");
    if (!checks.torsionFreeOutcomeMatches)
      errors.push("The torsion-free replay outcome changed.");
    if (!checks.preparationOutcomeMatches)
      errors.push("The sparse-preparation replay outcome changed.");
    if (!checks.modularRankOutcomeMatches)
      errors.push("The modular-rank replay outcome changed.");
    if (!checks.integralKernelOutcomeMatches)
      errors.push("The integral-kernel replay outcome changed.");
    if (!checks.completionOutcomeMatches)
      errors.push("The scalable-completion replay outcome changed.");
    if (!checks.exactRebuildMatches)
      errors.push("The exact adapter rebuild differs from storage.");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const uniqueErrors = [...new Set(errors)].sort(compareStrings);
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "scalable-generic-action-integral-h1-replay" as const,
    status: (uniqueErrors.length === 0 && Object.values(checks).every(Boolean)
      ? "passed"
      : "failed") as "passed" | "failed",
    checks,
    ...(rebuiltCertificateDigest === undefined
      ? {}
      : { rebuiltCertificateDigest }),
    errors: uniqueErrors,
  };
  return {
    ...withoutDigest,
    replayDigest: canonicalSha256(withoutDigest),
  };
}
