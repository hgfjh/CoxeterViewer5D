import { parseCoxeterSystemInput } from "../coxeter";
import { validateBarX, validateHatX } from "../compression";
import type { CoverCompressionResult } from "../compression";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  torsionFreeActionFingerprint,
  type SphericalSpecialSubgroupPlan,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";

const DEFAULT_ROOT_CHUNK_SIZE = 4_096;
const DEFAULT_FIBER_CHUNK_SIZE = 256;
const DEFAULT_FACE_CHUNK_SIZE = 4_096;
const MAX_CHUNK_SIZE = 65_536;

export interface GeneralizedCompressionBuildOptions {
  rootHashChunkSize?: number;
  fiberHashChunkSize?: number;
  faceHashChunkSize?: number;
  /** Explicit point-to-source binding; array position is the action point. */
  sourceQuotientVertexIds?: readonly string[];
  /** When supplied, the rank-at-most-two bridge replays the actual hat-X map. */
  coverCompression?: CoverCompressionResult;
}

export interface GeneralizedCompressionFiberCommitment {
  typeIndex: number;
  sphericalSubsetId: string;
  generators: number[];
  dimension: number;
  subgroupOrder: number;
  rootedSourceCellCount: number;
  compressedCellCount: number;
  expectedFiberCardinality: number;
  rootImageEncoding: "canonical-minimum-action-point";
  rootImageChunkHashes: string[];
  fiberEncoding: "ordered-representative-and-member-list";
  fiberChunkHashes: string[];
  rootImageHash: string;
  fiberPartitionHash: string;
  checks: {
    everyRootHasOneImage: true;
    fibersPartitionEveryRoot: true;
    everyFiberHasExpectedCardinality: true;
    representativeIsFiberMinimum: true;
  };
}

export interface GeneralizedCompressionFaceCompatibility {
  faceTypeIndex: number;
  faceSphericalSubsetId: string;
  cofaceTypeIndex: number;
  cofaceSphericalSubsetId: string;
  codimension: number;
  immediate: boolean;
  expectedFacesPerCoface: number;
  rootedFaceRecordCount: number;
  compressedFaceIncidenceCount: number;
  rootedTranscriptEncoding: "factorized-root-image-pair";
  rootedTranscriptFactorHashes: [string, string];
  rootedTranscriptHash: string;
  compressedTranscriptChunkHashes: string[];
  transcriptHash: string;
  checks: {
    everyRootedFaceMapsIntoItsRootedCoface: true;
    distinctFacesPerCofaceMatchParabolicIndex: true;
    compressedIncidencesHaveExpectedCount: true;
  };
}

export interface GeneralizedCompressionRankTwoAgreement {
  status: "passed";
  scope: "definition-level" | "materialized-artifact";
  method:
    | "action-rooted-truncation"
    | "action-rooted-and-materialized-hat-x-to-bar-x";
  sourcePointBindingSha256?: string;
  edgeEndpointFiberSha256?: string;
  relationFiberBoundarySha256?: string;
  incidenceSha256?: string;
  transcriptSha256: string;
  counts: {
    vertices: number;
    geometricEdges: number;
    rankTwoCells: number;
  };
  checks: {
    truncationUsesExactlyRanksZeroOneTwo: true;
    rankOneFibersHaveCardinalityTwo: true;
    rankTwoFibersHaveCardinalityTwoM: true;
    rankTwoBoundariesUseExactAlternatingEdges: true;
    materializedCompressionSupplied: boolean;
    sourcePointBindingBijective?: true;
    hatAndBarCertificatesPassed?: true;
    vertexFibersAgree?: true;
    directedEdgeAndBigonFibersAgree?: true;
    relationFibersAgree?: true;
    signedAttachingMapsAgree?: true;
    rankAtMostTwoIncidencesAgreeBothWays?: true;
  };
}

export interface GeneralizedCompressionCertificate {
  schemaVersion: 1;
  kind: "generalized-spherical-compression-certificate";
  status: "passed";
  method: "exact-action-rooted-spherical-orbit-compression";
  source: {
    systemCanonicalSha256: string;
    actionRowsCanonicalSha256: string;
    actionFingerprint: string;
    candidateId: string;
    degree: number;
  };
  encoding: {
    rootHashChunkSize: number;
    fiberHashChunkSize: number;
    faceHashChunkSize: number;
    strictFaceIncidencesMaterialized: false;
    rootedSourceCellObjectsMaterialized: false;
  };
  sphericalTypes: GeneralizedCompressionFiberCommitment[];
  faceCompatibility: GeneralizedCompressionFaceCompatibility[];
  rankAtMostTwoAgreement: GeneralizedCompressionRankTwoAgreement;
  cellCountByDimension: Record<string, number>;
  rootedSourceCellCount: number;
  compressedCellCount: number;
  rootedFaceRecordCount: number;
  strictFaceIncidenceCount: number;
  immediateFaceIncidenceCount: number;
  checks: {
    sourceTorsionFreeCertificateReplayed: true;
    completeSphericalCatalogue: true;
    everyRootedCellRecorded: true;
    allFiberCardinalitiesEqualSphericalOrders: true;
    everyProperSphericalFaceTypeChecked: true;
    allFaceMapsCompatible: true;
    rankAtMostTwoDefinitionAgreementPassed: true;
    materializedRankAtMostTwoBridgePassed: boolean;
  };
  archiveHashAlgorithm: "sha256-canonical-json";
  archiveHash: string;
  warnings: string[];
}

export interface GeneralizedCompressionReplayResult {
  valid: boolean;
  errors: string[];
  expectedArchiveHash?: string;
  actualArchiveHash?: string;
}

export interface MaterializedGeneralizedCompressionFiber {
  representativePoint: number;
  actionPoints: number[];
}

export interface MaterializedGeneralizedCompressionRootedFaceRecord {
  actionPoint: number;
  faceRepresentativePoint: number;
  cofaceRepresentativePoint: number;
}

export interface MaterializedGeneralizedCompressionFaceIncidence {
  faceRepresentativePoint: number;
  cofaceRepresentativePoint: number;
}

export interface MaterializedGeneralizedCompressionFaceCompatibility {
  faceSphericalSubsetId: string;
  cofaceSphericalSubsetId: string;
  rootedRecords: MaterializedGeneralizedCompressionRootedFaceRecord[];
  compressedIncidences: MaterializedGeneralizedCompressionFaceIncidence[];
}

interface RuntimeType {
  typeIndex: number;
  id: string;
  generators: number[];
  dimension: number;
  subgroupOrder: number;
  representatives: number[];
  representativeByPoint: Uint32Array;
}

export class GeneralizedCompressionError extends Error {
  readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(`${message}:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "GeneralizedCompressionError";
    this.errors = errors;
  }
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function compareArrays(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function isSubset(
  subset: readonly number[],
  superset: readonly number[],
): boolean {
  const available = new Set(superset);
  return subset.every((generator) => available.has(generator));
}

function checkedChunkSize(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > MAX_CHUNK_SIZE) {
    throw new GeneralizedCompressionError(
      "Invalid generalized-compression chunk size",
      [
        `${label} must be an integer in 1..${MAX_CHUNK_SIZE}; received ${String(result)}.`,
      ],
    );
  }
  return result;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sameStringMultiset(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const sortedLeft = [...left].sort((a, b) => a.localeCompare(b));
  const sortedRight = [...right].sort((a, b) => a.localeCompare(b));
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function planOrder(plan: SphericalSpecialSubgroupPlan): number {
  const value = plan.order.safeInteger;
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
    throw new GeneralizedCompressionError("Unsafe spherical subgroup order", [
      `${plan.id} has order ${plan.order.decimal}, which cannot index an in-memory finite action exactly.`,
    ]);
  }
  return value;
}

function actionRowsSha256(candidate: TorsionFreeActionCandidate): string {
  return canonicalSha256({
    schemaVersion: 1,
    index: candidate.index,
    generatorImages: candidate.generatorImages,
  });
}

function prepareSource(
  input: unknown,
  accepted: TorsionFreeCandidateResult,
): {
  system: CoxeterSystemInput;
  candidate: TorsionFreeActionCandidate;
  plans: Array<{
    id: string;
    generators: number[];
    rank: number;
    order: number;
  }>;
  actionFingerprint: string;
  warnings: string[];
} {
  const system = parseCoxeterSystemInput(input);
  const { candidate, certificate } = accepted;
  const plan = planSphericalSpecialSubgroups(system);
  if (plan.status !== "complete") {
    throw new GeneralizedCompressionError(
      "Incomplete spherical catalogue",
      plan.warnings,
    );
  }
  const actionFingerprint = torsionFreeActionFingerprint(system, candidate);
  if (
    certificate.status !== "passed" ||
    certificate.candidateId !== candidate.id ||
    certificate.candidateIndex !== candidate.index ||
    certificate.actionFingerprint !== actionFingerprint
  ) {
    throw new GeneralizedCompressionError(
      "The accepted action certificate is stale or not passed",
      [
        `Candidate ${candidate.id} is not bound to a matching passed torsion-free certificate.`,
      ],
    );
  }
  const replay = certifyTorsionFreeAction(system, candidate, plan);
  if (replay.status !== "passed") {
    throw new GeneralizedCompressionError(
      "The torsion-free action replay failed",
      [
        ...replay.errors,
        ...replay.witnesses.map((witness) => JSON.stringify(witness)),
      ],
    );
  }
  const plans = [
    { id: "T:empty", generators: [] as number[], rank: 0, order: 1 },
    ...plan.sphericalSubgroups.map((subgroup) => ({
      id: subgroup.id,
      generators: [...subgroup.generators],
      rank: subgroup.rank,
      order: planOrder(subgroup),
    })),
  ].sort(
    (left, right) =>
      left.rank - right.rank ||
      compareArrays(left.generators, right.generators),
  );
  return {
    system,
    candidate,
    plans,
    actionFingerprint,
    warnings: sortedUnique([...plan.warnings, ...replay.warnings]),
  };
}

function orbitFromRoot(
  candidate: TorsionFreeActionCandidate,
  generators: readonly number[],
  root: number,
): number[] {
  const seen = new Set([root]);
  const queue = [root];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    for (const generator of generators) {
      const image = candidate.generatorImages[generator][point];
      if (!seen.has(image)) {
        seen.add(image);
        queue.push(image);
      }
    }
  }
  return [...seen].sort(compareNumbers);
}

function buildRuntimeType(
  candidate: TorsionFreeActionCandidate,
  plan: { id: string; generators: number[]; rank: number; order: number },
  typeIndex: number,
): RuntimeType {
  if (candidate.index % plan.order !== 0) {
    throw new GeneralizedCompressionError(
      "Nonintegral generalized-compression cell count",
      [
        `${plan.id}: degree ${candidate.index} is not divisible by |W_T|=${plan.order}.`,
      ],
    );
  }
  const sentinel = 0xffff_ffff;
  const representativeByPoint = new Uint32Array(candidate.index);
  representativeByPoint.fill(sentinel);
  const representatives: number[] = [];
  for (let root = 0; root < candidate.index; root += 1) {
    if (representativeByPoint[root] !== sentinel) continue;
    const orbit = orbitFromRoot(candidate, plan.generators, root);
    if (orbit.length !== plan.order || orbit[0] !== root) {
      throw new GeneralizedCompressionError(
        "Spherical action is not a free rooted fiber",
        [
          `${plan.id} at q${root} has orbit size ${orbit.length}; expected ${plan.order}.`,
        ],
      );
    }
    representatives.push(root);
    for (const point of orbit) {
      if (representativeByPoint[point] !== sentinel) {
        throw new GeneralizedCompressionError("Spherical fibers overlap", [
          `${plan.id}: q${point} occurs in more than one fiber.`,
        ]);
      }
      representativeByPoint[point] = root;
    }
  }
  if (representatives.length !== candidate.index / plan.order) {
    throw new GeneralizedCompressionError(
      "Wrong generalized-compression fiber count",
      [
        `${plan.id} produced ${representatives.length} fibers; expected ${candidate.index / plan.order}.`,
      ],
    );
  }
  return {
    typeIndex,
    id: plan.id,
    generators: [...plan.generators],
    dimension: plan.rank,
    subgroupOrder: plan.order,
    representatives,
    representativeByPoint,
  };
}

function hashRootImages(
  sourceHash: string,
  type: RuntimeType,
  chunkSize: number,
): { chunkHashes: string[]; hash: string } {
  const chunkHashes: string[] = [];
  for (
    let start = 0;
    start < type.representativeByPoint.length;
    start += chunkSize
  ) {
    const end = Math.min(type.representativeByPoint.length, start + chunkSize);
    chunkHashes.push(
      canonicalSha256({
        sphericalSubsetId: type.id,
        startPoint: start,
        representativeByPoint: Array.from(
          type.representativeByPoint.subarray(start, end),
        ),
      }),
    );
  }
  return {
    chunkHashes,
    hash: canonicalSha256({
      schemaVersion: 1,
      method: "root-image-chunk-sha256-tree",
      sourceHash,
      sphericalSubsetId: type.id,
      chunkSize,
      chunkHashes,
    }),
  };
}

function hashFibers(
  sourceHash: string,
  candidate: TorsionFreeActionCandidate,
  type: RuntimeType,
  chunkSize: number,
): { chunkHashes: string[]; hash: string } {
  const chunkHashes: string[] = [];
  for (let start = 0; start < type.representatives.length; start += chunkSize) {
    const end = Math.min(type.representatives.length, start + chunkSize);
    const fibers = type.representatives
      .slice(start, end)
      .map((representativePoint) => ({
        representativePoint,
        actionPoints: orbitFromRoot(
          candidate,
          type.generators,
          representativePoint,
        ),
      }));
    chunkHashes.push(
      canonicalSha256({
        sphericalSubsetId: type.id,
        startFiberIndex: start,
        fibers,
      }),
    );
  }
  return {
    chunkHashes,
    hash: canonicalSha256({
      schemaVersion: 1,
      method: "ordered-fiber-chunk-sha256-tree",
      sourceHash,
      sphericalSubsetId: type.id,
      chunkSize,
      chunkHashes,
    }),
  };
}

function flushChunk(
  target: string[],
  payload: Record<string, unknown>,
  records: unknown[],
): void {
  if (records.length === 0) return;
  target.push(canonicalSha256({ ...payload, records }));
  records.length = 0;
}

function createChunkCommitter(
  payload: Record<string, unknown>,
  chunkSize: number,
): {
  push: (record: unknown) => void;
  finish: () => { chunkHashes: string[]; recordCount: number; hash: string };
} {
  const chunkHashes: string[] = [];
  const records: unknown[] = [];
  let recordCount = 0;
  let chunkStart = 0;
  const flush = (): void => {
    flushChunk(chunkHashes, { ...payload, chunkStart }, records);
  };
  return {
    push(record): void {
      if (records.length === 0) chunkStart = recordCount;
      records.push(record);
      recordCount += 1;
      if (records.length === chunkSize) flush();
    },
    finish() {
      flush();
      return {
        chunkHashes,
        recordCount,
        hash: canonicalSha256({
          schemaVersion: 1,
          method: "ordered-record-chunk-sha256-tree",
          ...payload,
          chunkSize,
          recordCount,
          chunkHashes,
        }),
      };
    },
  };
}

function buildFaceCompatibility(
  sourceHash: string,
  candidate: TorsionFreeActionCandidate,
  face: RuntimeType,
  coface: RuntimeType,
  faceRootImageHash: string,
  cofaceRootImageHash: string,
  chunkSize: number,
): GeneralizedCompressionFaceCompatibility {
  // The two committed root-image arrays determine every rooted record
  // q -> (qW_T, qW_U). Rehashing all d triples for every U<T pair would
  // duplicate those arrays thousands of times at target scale.
  const rootedTranscriptFactorHashes: [string, string] = [
    faceRootImageHash,
    cofaceRootImageHash,
  ];
  const rootedTranscriptHash = canonicalSha256({
    schemaVersion: 1,
    method: "factorized-root-image-pair",
    sourceHash,
    faceSphericalSubsetId: face.id,
    cofaceSphericalSubsetId: coface.id,
    rootedFaceRecordCount: candidate.index,
    rootedTranscriptFactorHashes,
  });

  const expectedFacesPerCoface = coface.subgroupOrder / face.subgroupOrder;
  if (!Number.isSafeInteger(expectedFacesPerCoface)) {
    throw new GeneralizedCompressionError("Invalid parabolic face index", [
      `${face.id} < ${coface.id} gives |W_T|/|W_U|=${expectedFacesPerCoface}.`,
    ]);
  }
  const compressedTranscriptChunkHashes: string[] = [];
  const compressedRecords: unknown[] = [];
  let compressedChunkStart = 0;
  let compressedFaceIncidenceCount = 0;
  for (const representativePoint of coface.representatives) {
    const cofacePoints = orbitFromRoot(
      candidate,
      coface.generators,
      representativePoint,
    );
    const faceRepresentatives = [
      ...new Set(
        cofacePoints.map(
          (point) => face.representativeByPoint[point] as number,
        ),
      ),
    ].sort(compareNumbers);
    if (faceRepresentatives.length !== expectedFacesPerCoface) {
      throw new GeneralizedCompressionError(
        "Incompatible spherical face fiber",
        [
          `${face.id} < ${coface.id} at q${representativePoint} has ${faceRepresentatives.length} faces; expected ${expectedFacesPerCoface}.`,
        ],
      );
    }
    for (const faceRepresentative of faceRepresentatives) {
      if (compressedRecords.length === 0) {
        compressedChunkStart = compressedFaceIncidenceCount;
      }
      compressedRecords.push([representativePoint, faceRepresentative]);
      compressedFaceIncidenceCount += 1;
      if (compressedRecords.length === chunkSize) {
        flushChunk(
          compressedTranscriptChunkHashes,
          {
            faceSphericalSubsetId: face.id,
            cofaceSphericalSubsetId: coface.id,
            startCompressedIncidence: compressedChunkStart,
          },
          compressedRecords,
        );
      }
    }
  }
  flushChunk(
    compressedTranscriptChunkHashes,
    {
      faceSphericalSubsetId: face.id,
      cofaceSphericalSubsetId: coface.id,
      startCompressedIncidence: compressedChunkStart,
    },
    compressedRecords,
  );
  const expectedCompressedCount =
    coface.representatives.length * expectedFacesPerCoface;
  if (compressedFaceIncidenceCount !== expectedCompressedCount) {
    throw new GeneralizedCompressionError(
      "Wrong compressed face-incidence count",
      [
        `${face.id} < ${coface.id} produced ${compressedFaceIncidenceCount}; expected ${expectedCompressedCount}.`,
      ],
    );
  }
  const codimension = coface.dimension - face.dimension;
  const transcriptHash = canonicalSha256({
    schemaVersion: 1,
    method: "rooted-and-compressed-face-chunk-sha256-tree",
    sourceHash,
    faceSphericalSubsetId: face.id,
    cofaceSphericalSubsetId: coface.id,
    codimension,
    expectedFacesPerCoface,
    rootedFaceRecordCount: candidate.index,
    compressedFaceIncidenceCount,
    chunkSize,
    rootedTranscriptHash,
    compressedTranscriptChunkHashes,
  });
  return {
    faceTypeIndex: face.typeIndex,
    faceSphericalSubsetId: face.id,
    cofaceTypeIndex: coface.typeIndex,
    cofaceSphericalSubsetId: coface.id,
    codimension,
    immediate: codimension === 1,
    expectedFacesPerCoface,
    rootedFaceRecordCount: candidate.index,
    compressedFaceIncidenceCount,
    rootedTranscriptEncoding: "factorized-root-image-pair",
    rootedTranscriptFactorHashes,
    rootedTranscriptHash,
    compressedTranscriptChunkHashes,
    transcriptHash,
    checks: {
      everyRootedFaceMapsIntoItsRootedCoface: true,
      distinctFacesPerCofaceMatchParabolicIndex: true,
      compressedIncidencesHaveExpectedCount: true,
    },
  };
}

function actionTruncationAgreement(
  sourceHash: string,
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
  types: readonly RuntimeType[],
  chunkSize: number,
): GeneralizedCompressionRankTwoAgreement {
  const rankAtMostTwo = types.filter((type) => type.dimension <= 2);
  const vertices = candidate.index;
  const geometricEdges = rankAtMostTwo
    .filter((type) => type.dimension === 1)
    .reduce((sum, type) => sum + type.representatives.length, 0);
  const rankTwoCells = rankAtMostTwo
    .filter((type) => type.dimension === 2)
    .reduce((sum, type) => sum + type.representatives.length, 0);
  const rankOneByGenerator = new Map(
    rankAtMostTwo
      .filter((type) => type.dimension === 1)
      .map((type) => [type.generators[0], type] as const),
  );
  const transcript = rankAtMostTwo.map((type) => {
    const common = {
      sphericalSubsetId: type.id,
      generators: type.generators,
      dimension: type.dimension,
      subgroupOrder: type.subgroupOrder,
      representativeCount: type.representatives.length,
      representativesSha256: canonicalSha256(type.representatives),
      rootImageHash: canonicalSha256(Array.from(type.representativeByPoint)),
    };
    if (type.dimension !== 2) return common;
    const pair = type.generators as [number, number];
    const m = system.coxeterMatrix[pair[0]][pair[1]];
    if (m === "inf") {
      throw new GeneralizedCompressionError("Invalid rank-two truncation", [
        `${type.id} is spherical but has infinite Coxeter exponent.`,
      ]);
    }
    const boundaryChunkHashes: string[] = [];
    let records: unknown[] = [];
    let startCellIndex = 0;
    for (
      let cellIndex = 0;
      cellIndex < type.representatives.length;
      cellIndex += 1
    ) {
      const representativePoint = type.representatives[cellIndex];
      let current = representativePoint;
      const boundary: Array<[number, number, number, number]> = [];
      for (let step = 0; step < 2 * m; step += 1) {
        const generator = pair[step % 2];
        const next = candidate.generatorImages[generator][current];
        const edgeType = rankOneByGenerator.get(generator);
        if (edgeType === undefined) {
          throw new GeneralizedCompressionError(
            "Missing rank-one spherical type",
            [
              `Generator ${generator} has no rank-one generalized-compression type.`,
            ],
          );
        }
        boundary.push([
          current,
          generator,
          next,
          edgeType.representativeByPoint[current],
        ]);
        current = next;
      }
      if (current !== representativePoint) {
        throw new GeneralizedCompressionError(
          "Nonclosing rank-two truncation boundary",
          [
            `${type.id} at q${representativePoint} does not close after ${2 * m} steps.`,
          ],
        );
      }
      if (records.length === 0) startCellIndex = cellIndex;
      records.push({ representativePoint, m, boundary });
      if (records.length === chunkSize) {
        flushChunk(
          boundaryChunkHashes,
          { sphericalSubsetId: type.id, startCellIndex },
          records,
        );
        records = [];
      }
    }
    flushChunk(
      boundaryChunkHashes,
      { sphericalSubsetId: type.id, startCellIndex },
      records,
    );
    return { ...common, m, boundaryChunkHashes };
  });
  return {
    status: "passed",
    scope: "definition-level",
    method: "action-rooted-truncation",
    transcriptSha256: canonicalSha256({
      schemaVersion: 1,
      method: "generalized-compression-rank-at-most-two-truncation",
      sourceHash,
      chunkSize,
      transcript,
    }),
    counts: { vertices, geometricEdges, rankTwoCells },
    checks: {
      truncationUsesExactlyRanksZeroOneTwo: true,
      rankOneFibersHaveCardinalityTwo: true,
      rankTwoFibersHaveCardinalityTwoM: true,
      rankTwoBoundariesUseExactAlternatingEdges: true,
      materializedCompressionSupplied: false,
    },
  };
}

function setKey(values: readonly string[]): string {
  return sortedUnique(values).join("\u0001");
}

function edgeKey(generator: number, endpoints: readonly string[]): string {
  return `${generator}\u0000${setKey(endpoints)}`;
}

function pairKey(pair: readonly number[]): string {
  return pair.join(",");
}

function materializedRankTwoAgreement(
  sourceHash: string,
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
  types: readonly RuntimeType[],
  sourceQuotientVertexIds: readonly string[],
  cover: CoverCompressionResult,
  chunkSize: number,
): GeneralizedCompressionRankTwoAgreement {
  const errors: string[] = [];
  const hatValidation = validateHatX(cover.hatX);
  const barValidation = validateBarX(cover.barX);
  errors.push(
    ...hatValidation.errors.map((error) => `hat-X validation: ${error}`),
    ...barValidation.errors.map((error) => `bar-X validation: ${error}`),
  );
  if (cover.certificate.status !== "passed") {
    errors.push("The supplied ordinary compression certificate is not passed.");
  }
  if (canonicalSha256(cover.barX.sourceSystem) !== canonicalSha256(system)) {
    errors.push(
      "The supplied ordinary compression uses a different Coxeter system.",
    );
  }
  if (
    sourceQuotientVertexIds.length !== candidate.index ||
    new Set(sourceQuotientVertexIds).size !== candidate.index ||
    sourceQuotientVertexIds.some(
      (id) => typeof id !== "string" || id.length === 0,
    )
  ) {
    errors.push(
      "The action-point to source-vertex map is not a complete bijection.",
    );
  }
  if (errors.length > 0) {
    throw new GeneralizedCompressionError(
      "Cannot compare the materialized rank-two compression",
      errors,
    );
  }

  const pointBySourceId = new Map(
    sourceQuotientVertexIds.map((id, point) => [id, point] as const),
  );
  const barVertexById = new Map(
    cover.barX.vertices.map((vertex) => [vertex.id, vertex] as const),
  );
  const barVertexBySourceId = new Map(
    cover.barX.vertices.map(
      (vertex) => [vertex.sourceQuotientVertexId, vertex] as const,
    ),
  );
  const hatVertexBySourceId = new Map(
    cover.hatX.vertices.map(
      (vertex) => [vertex.sourceQuotientVertexId, vertex] as const,
    ),
  );
  const hatVertexById = new Map(
    cover.hatX.vertices.map((vertex) => [vertex.id, vertex] as const),
  );
  if (
    pointBySourceId.size !== sourceQuotientVertexIds.length ||
    barVertexById.size !== cover.barX.vertices.length ||
    hatVertexById.size !== cover.hatX.vertices.length ||
    barVertexBySourceId.size !== candidate.index ||
    hatVertexBySourceId.size !== candidate.index ||
    sourceQuotientVertexIds.some(
      (id) => !barVertexBySourceId.has(id) || !hatVertexBySourceId.has(id),
    )
  ) {
    throw new GeneralizedCompressionError(
      "Rank-zero compression fibers disagree",
      [
        "The supplied point/source map does not bijectively cover hat-X and bar-X vertices.",
      ],
    );
  }
  for (const sourceId of sourceQuotientVertexIds) {
    const hatVertex = hatVertexBySourceId.get(sourceId)!;
    const barVertex = barVertexBySourceId.get(sourceId)!;
    if (cover.compressionMap.vertexImages[hatVertex.id] !== barVertex.id) {
      errors.push(
        `Compression vertex image ${hatVertex.id} does not equal ${barVertex.id}.`,
      );
    }
  }
  if (
    Object.keys(cover.compressionMap.vertexImages).length !==
    cover.hatX.vertices.length
  ) {
    errors.push(
      "The ordinary compression vertex-image map has the wrong domain size.",
    );
  }

  const hatEdgeBySourceGenerator = new Map(
    cover.hatX.directedLiftEdges.map((edge) => {
      const source = hatVertexById.get(edge.sourceVertexId);
      if (source === undefined) {
        throw new GeneralizedCompressionError(
          "Invalid materialized ordinary compression",
          [`Directed edge ${edge.id} has an unknown source vertex.`],
        );
      }
      return [
        `${source.sourceQuotientVertexId}\u0000${edge.generator}`,
        edge,
      ] as const;
    }),
  );
  if (hatEdgeBySourceGenerator.size !== cover.hatX.directedLiftEdges.length) {
    errors.push(
      "The hat-X directed edges do not have unique source/generator keys.",
    );
  }
  const hatBigonsBySourceGenerator = new Map<string, string[]>();
  for (const bigon of cover.hatX.generatorBigonCells) {
    const source = hatVertexById.get(bigon.baseVertexId);
    if (source === undefined) {
      errors.push(`Bigon ${bigon.id} has an unknown base vertex.`);
      continue;
    }
    hatBigonsBySourceGenerator.set(
      `${source.sourceQuotientVertexId}\u0000${bigon.generator}`,
      [bigon.id],
    );
  }
  if (
    hatBigonsBySourceGenerator.size !== cover.hatX.generatorBigonCells.length
  ) {
    errors.push("The hat-X bigons do not have unique source/generator keys.");
  }
  const barEdgeByKey = new Map<
    string,
    (typeof cover.barX.geometricEdges)[number]
  >();
  for (const edge of cover.barX.geometricEdges) {
    const endpoints = [
      barVertexById.get(edge.sourceVertexId)!.sourceQuotientVertexId,
      barVertexById.get(edge.targetVertexId)!.sourceQuotientVertexId,
    ];
    const key = edgeKey(edge.generator, endpoints);
    if (barEdgeByKey.has(key)) errors.push(`Duplicate bar-X edge key ${key}.`);
    barEdgeByKey.set(key, edge);
  }
  const edgeFiberByBarId = new Map(
    cover.compressionMap.edgeFibers.map(
      (fiber) => [fiber.barEdgeId, fiber] as const,
    ),
  );
  const bigonFiberByBarId = new Map(
    cover.compressionMap.bigonFibers.map(
      (fiber) => [fiber.barEdgeId, fiber] as const,
    ),
  );
  if (
    edgeFiberByBarId.size !== cover.compressionMap.edgeFibers.length ||
    bigonFiberByBarId.size !== cover.compressionMap.bigonFibers.length ||
    cover.compressionMap.edgeFibers.length !==
      cover.barX.geometricEdges.length ||
    cover.compressionMap.bigonFibers.length !== cover.barX.geometricEdges.length
  ) {
    errors.push(
      "The ordinary rank-one compression fiber tables do not have exactly one row per bar-X edge.",
    );
  }
  const barEdgeIds = new Set(cover.barX.geometricEdges.map((edge) => edge.id));
  if (
    [...edgeFiberByBarId.keys()].some((id) => !barEdgeIds.has(id)) ||
    [...bigonFiberByBarId.keys()].some((id) => !barEdgeIds.has(id))
  ) {
    errors.push(
      "A rank-one compression fiber targets a nonexistent bar-X edge.",
    );
  }
  const generalizedEdgeByPointGenerator = new Map<string, string>();
  const usedBarEdgeIds = new Set<string>();
  const edgeCommitter = createChunkCommitter(
    { sourceHash, recordKind: "materialized-rank-one-bridge" },
    chunkSize,
  );
  for (const type of types.filter((entry) => entry.dimension === 1)) {
    const generator = type.generators[0];
    for (const representative of type.representatives) {
      const points = orbitFromRoot(candidate, type.generators, representative);
      const sourceIds = points.map((point) => sourceQuotientVertexIds[point]);
      const barEdge = barEdgeByKey.get(edgeKey(generator, sourceIds));
      if (barEdge === undefined) {
        errors.push(`${type.id} fiber q${representative} has no bar-X edge.`);
        continue;
      }
      usedBarEdgeIds.add(barEdge.id);
      for (const point of points) {
        generalizedEdgeByPointGenerator.set(
          `${point}\u0000${generator}`,
          barEdge.id,
        );
      }
      const expectedHatEdges = sourceIds.map((sourceId) => {
        const edge = hatEdgeBySourceGenerator.get(
          `${sourceId}\u0000${generator}`,
        );
        if (edge === undefined) {
          errors.push(
            `Missing rooted directed edge at ${sourceId}, generator ${generator}.`,
          );
          return "<missing-directed-edge>";
        }
        const point = pointBySourceId.get(sourceId);
        const targetSourceId = hatVertexById.get(
          edge.targetVertexId,
        )?.sourceQuotientVertexId;
        if (
          point === undefined ||
          targetSourceId !==
            sourceQuotientVertexIds[candidate.generatorImages[generator][point]]
        ) {
          errors.push(
            `Hat-X edge ${edge.id} does not realize the certified generator action.`,
          );
        }
        return edge.id;
      });
      const expectedBigons = sourceIds.flatMap(
        (sourceId) =>
          hatBigonsBySourceGenerator.get(`${sourceId}\u0000${generator}`) ?? [],
      );
      if (
        !sameStringMultiset(
          barEdge.sourceHatDirectedEdgeIds,
          expectedHatEdges,
        ) ||
        !sameStringMultiset(
          edgeFiberByBarId.get(barEdge.id)?.hatDirectedEdgeIds ?? [],
          expectedHatEdges,
        )
      ) {
        errors.push(
          `Directed-edge fiber ${barEdge.id} does not equal its two rooted rank-one cells.`,
        );
      }
      for (const edgeId of expectedHatEdges) {
        if (cover.compressionMap.directedEdgeImages[edgeId] !== barEdge.id) {
          errors.push(
            `Compression directed-edge image ${edgeId} does not equal ${barEdge.id}.`,
          );
        }
      }
      if (
        !sameStringMultiset(barEdge.sourceHatBigonCellIds, expectedBigons) ||
        !sameStringMultiset(
          bigonFiberByBarId.get(barEdge.id)?.hatBigonCellIds ?? [],
          expectedBigons,
        )
      ) {
        errors.push(
          `Bigon fiber ${barEdge.id} does not equal its two rooted rank-one cells.`,
        );
      }
      for (const bigonId of expectedBigons) {
        if (cover.compressionMap.generatorBigonImages[bigonId] !== barEdge.id) {
          errors.push(
            `Compression bigon image ${bigonId} does not equal ${barEdge.id}.`,
          );
        }
      }
      edgeCommitter.push({
        generalizedRepresentativePoint: representative,
        generator,
        actionPoints: points,
        sourceQuotientVertexIds: sourceIds,
        barEdgeId: barEdge.id,
        barEndpointVertexIds: [barEdge.sourceVertexId, barEdge.targetVertexId],
        barEndpointSourceIds: [
          barVertexById.get(barEdge.sourceVertexId)!.sourceQuotientVertexId,
          barVertexById.get(barEdge.targetVertexId)!.sourceQuotientVertexId,
        ],
        hatDirectedEdgeIds: [...expectedHatEdges].sort(),
        hatBigonCellIds: [...expectedBigons].sort(),
      });
    }
  }
  if (usedBarEdgeIds.size !== cover.barX.geometricEdges.length) {
    errors.push(
      "The generalized rank-one fibers do not cover every bar-X edge exactly once.",
    );
  }
  if (
    Object.keys(cover.compressionMap.directedEdgeImages).length !==
      cover.hatX.directedLiftEdges.length ||
    Object.keys(cover.compressionMap.generatorBigonImages).length !==
      cover.hatX.generatorBigonCells.length
  ) {
    errors.push(
      "The ordinary rank-one compression image maps do not have the exact hat-X domains.",
    );
  }

  const hatRelationByPairSource = new Map<string, string>();
  for (const cell of cover.hatX.liftedRelationCells) {
    const source = hatVertexById.get(cell.baseVertexId);
    if (source === undefined) {
      errors.push(`Relation lift ${cell.id} has an unknown base vertex.`);
      continue;
    }
    hatRelationByPairSource.set(
      `${pairKey(cell.generatorPair)}\u0000${source.sourceQuotientVertexId}`,
      cell.id,
    );
  }
  const relationFiberByBarId = new Map(
    cover.compressionMap.relationFibers.map(
      (fiber) => [fiber.barRelationCellId, fiber] as const,
    ),
  );
  if (
    relationFiberByBarId.size !== cover.compressionMap.relationFibers.length ||
    cover.compressionMap.relationFibers.length !==
      cover.barX.relationCells.length
  ) {
    errors.push(
      "The ordinary rank-two compression fiber table does not have exactly one row per bar-X relation.",
    );
  }
  const barRelationIds = new Set(
    cover.barX.relationCells.map((relation) => relation.id),
  );
  if ([...relationFiberByBarId.keys()].some((id) => !barRelationIds.has(id))) {
    errors.push(
      "A rank-two compression fiber targets a nonexistent bar-X relation.",
    );
  }
  const barRelationByKey = new Map<
    string,
    (typeof cover.barX.relationCells)[number]
  >();
  for (const relation of cover.barX.relationCells) {
    const sourceIds = relation.boundaryOccurrences.map(
      (occurrence) =>
        barVertexById.get(occurrence.sourceVertexId)!.sourceQuotientVertexId,
    );
    const key = `${pairKey(relation.generatorPair)}\u0000${setKey(sourceIds)}`;
    if (barRelationByKey.has(key))
      errors.push(`Duplicate bar-X relation key ${key}.`);
    barRelationByKey.set(key, relation);
  }
  const usedBarRelationIds = new Set<string>();
  const relationCommitter = createChunkCommitter(
    { sourceHash, recordKind: "materialized-rank-two-bridge" },
    chunkSize,
  );
  for (const type of types.filter((entry) => entry.dimension === 2)) {
    const pair = type.generators as [number, number];
    const m = system.coxeterMatrix[pair[0]][pair[1]];
    if (m === "inf") {
      errors.push(`${type.id} is rank two but has infinite Coxeter exponent.`);
      continue;
    }
    for (const representative of type.representatives) {
      const points = orbitFromRoot(candidate, type.generators, representative);
      const sourceIds = points.map((point) => sourceQuotientVertexIds[point]);
      const relation = barRelationByKey.get(
        `${pairKey(pair)}\u0000${setKey(sourceIds)}`,
      );
      if (relation === undefined) {
        errors.push(
          `${type.id} fiber q${representative} has no bar-X relation cell.`,
        );
        continue;
      }
      usedBarRelationIds.add(relation.id);
      const expectedHatRelations = sourceIds.map((sourceId) => {
        const relationId = hatRelationByPairSource.get(
          `${pairKey(pair)}\u0000${sourceId}`,
        );
        if (relationId === undefined) {
          errors.push(
            `Missing rooted relation at ${sourceId}, pair ${pairKey(pair)}.`,
          );
          return "<missing-relation>";
        }
        return relationId;
      });
      const relationFiber = relationFiberByBarId.get(relation.id);
      if (
        !sameStringMultiset(
          relation.sourceHatRelationCellIds,
          expectedHatRelations,
        ) ||
        !sameStringMultiset(
          relationFiber?.hatRelationCellIds ?? [],
          expectedHatRelations,
        ) ||
        relationFiber?.expectedCardinality !== 2 * m
      ) {
        errors.push(
          `Relation fiber ${relation.id} does not equal its ${2 * m} rooted cells.`,
        );
      }
      relationCommitter.push({
        generalizedRepresentativePoint: representative,
        generatorPair: pair,
        m,
        actionPoints: points,
        sourceQuotientVertexIds: sourceIds,
        barRelationCellId: relation.id,
        hatRelationCellIds: [...expectedHatRelations].sort(),
        boundary: relation.boundaryOccurrences.map((occurrence) => ({
          boundaryIndex: occurrence.boundaryIndex,
          edgeId: occurrence.edgeId,
          traversal: occurrence.traversal,
          generator: occurrence.generator,
          sourceVertexId: occurrence.sourceVertexId,
          targetVertexId: occurrence.targetVertexId,
          sourceQuotientVertexId:
            barVertexById.get(occurrence.sourceVertexId)
              ?.sourceQuotientVertexId ?? "<missing-source-vertex>",
          targetQuotientVertexId:
            barVertexById.get(occurrence.targetVertexId)
              ?.sourceQuotientVertexId ?? "<missing-target-vertex>",
        })),
      });
      for (const relationId of expectedHatRelations) {
        if (
          cover.compressionMap.liftedRelationCellImages[relationId] !==
          relation.id
        ) {
          errors.push(
            `Compression relation image ${relationId} does not equal ${relation.id}.`,
          );
        }
      }
      if (relation.boundaryOccurrences.length !== 2 * m) {
        errors.push(`Relation ${relation.id} has the wrong boundary length.`);
        continue;
      }
      const boundarySources = new Set<string>();
      const boundaryEdges = new Set<string>();
      for (
        let index = 0;
        index < relation.boundaryOccurrences.length;
        index += 1
      ) {
        const occurrence = relation.boundaryOccurrences[index];
        const sourceVertex = barVertexById.get(occurrence.sourceVertexId);
        const targetVertex = barVertexById.get(occurrence.targetVertexId);
        const next =
          relation.boundaryOccurrences[
            (index + 1) % relation.boundaryOccurrences.length
          ];
        if (sourceVertex === undefined || targetVertex === undefined) {
          errors.push(
            `Relation ${relation.id} references a missing bar-X vertex.`,
          );
          continue;
        }
        const sourceId = sourceVertex.sourceQuotientVertexId;
        const targetId = targetVertex.sourceQuotientVertexId;
        const point = pointBySourceId.get(sourceId);
        const expectedGenerator = pair[index % 2];
        if (
          point === undefined ||
          occurrence.generator !== expectedGenerator ||
          sourceQuotientVertexIds[
            candidate.generatorImages[occurrence.generator][point]
          ] !== targetId ||
          next.sourceVertexId !== occurrence.targetVertexId ||
          generalizedEdgeByPointGenerator.get(
            `${point}\u0000${occurrence.generator}`,
          ) !== occurrence.edgeId
        ) {
          errors.push(
            `Relation ${relation.id} has an incompatible signed attaching step at ${index}.`,
          );
        }
        const edge = barEdgeByKey.get(
          edgeKey(occurrence.generator, [sourceId, targetId]),
        );
        if (edge === undefined) {
          errors.push(
            `Relation ${relation.id} boundary step ${index} has no generalized rank-one face.`,
          );
        } else {
          const traversal =
            edge.sourceVertexId === occurrence.sourceVertexId &&
            edge.targetVertexId === occurrence.targetVertexId
              ? 1
              : -1;
          if (traversal !== occurrence.traversal) {
            errors.push(
              `Relation ${relation.id} has the wrong traversal sign at ${index}.`,
            );
          }
        }
        boundarySources.add(sourceId);
        boundaryEdges.add(occurrence.edgeId);
      }
      if (
        !sameStringMultiset([...boundarySources], sourceIds) ||
        boundaryEdges.size !== 2 * m
      ) {
        errors.push(
          `Relation ${relation.id} does not have the exact rank-zero/rank-one face set.`,
        );
      }
    }
  }
  if (usedBarRelationIds.size !== cover.barX.relationCells.length) {
    errors.push(
      "The generalized rank-two fibers do not cover every bar-X relation exactly once.",
    );
  }
  if (
    Object.keys(cover.compressionMap.liftedRelationCellImages).length !==
    cover.hatX.liftedRelationCells.length
  ) {
    errors.push(
      "The ordinary rank-two compression image map does not have the exact hat-X domain.",
    );
  }
  if (errors.length > 0) {
    throw new GeneralizedCompressionError(
      "The rank-at-most-two compression bridge failed",
      errors,
    );
  }

  const pointBinding = sourceQuotientVertexIds.map(
    (sourceQuotientVertexId, actionPoint) => ({
      actionPoint,
      sourceQuotientVertexId,
      hatVertexId: hatVertexBySourceId.get(sourceQuotientVertexId)!.id,
      barVertexId: barVertexBySourceId.get(sourceQuotientVertexId)!.id,
    }),
  );
  const sourcePointBindingSha256 = canonicalSha256(pointBinding);
  const edgeCommitment = edgeCommitter.finish();
  const relationCommitment = relationCommitter.finish();
  const edgeEndpointFiberSha256 = edgeCommitment.hash;
  const relationFiberBoundarySha256 = relationCommitment.hash;
  const incidenceSha256 = canonicalSha256({
    schemaVersion: 1,
    sourceHash,
    sourcePointBindingSha256,
    edgeRecordCount: edgeCommitment.recordCount,
    edgeEndpointFiberSha256,
    relationRecordCount: relationCommitment.recordCount,
    relationFiberBoundarySha256,
  });
  const transcriptSha256 = canonicalSha256({
    schemaVersion: 1,
    method: "materialized-generalized-compression-rank-at-most-two-bridge",
    sourceHash,
    sourcePointBindingSha256,
    edgeEndpointFiberSha256,
    relationFiberBoundarySha256,
    incidenceSha256,
    edgeIds: [...usedBarEdgeIds].sort(),
    relationIds: [...usedBarRelationIds].sort(),
    ordinaryCompressionChecks: cover.certificate.checks,
  });
  return {
    status: "passed",
    scope: "materialized-artifact",
    method: "action-rooted-and-materialized-hat-x-to-bar-x",
    sourcePointBindingSha256,
    edgeEndpointFiberSha256,
    relationFiberBoundarySha256,
    incidenceSha256,
    transcriptSha256,
    counts: {
      vertices: candidate.index,
      geometricEdges: usedBarEdgeIds.size,
      rankTwoCells: usedBarRelationIds.size,
    },
    checks: {
      truncationUsesExactlyRanksZeroOneTwo: true,
      rankOneFibersHaveCardinalityTwo: true,
      rankTwoFibersHaveCardinalityTwoM: true,
      rankTwoBoundariesUseExactAlternatingEdges: true,
      materializedCompressionSupplied: true,
      sourcePointBindingBijective: true,
      hatAndBarCertificatesPassed: true,
      vertexFibersAgree: true,
      directedEdgeAndBigonFibersAgree: true,
      relationFibersAgree: true,
      signedAttachingMapsAgree: true,
      rankAtMostTwoIncidencesAgreeBothWays: true,
    },
  };
}

function countByDimension(
  types: readonly RuntimeType[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const type of types) {
    const key = String(type.dimension);
    result[key] = (result[key] ?? 0) + type.representatives.length;
  }
  return result;
}

function certificateWithoutArchiveHash(
  certificate: GeneralizedCompressionCertificate,
): Omit<GeneralizedCompressionCertificate, "archiveHash"> {
  const payload: Partial<GeneralizedCompressionCertificate> = {
    ...certificate,
  };
  delete payload.archiveHash;
  return payload as Omit<GeneralizedCompressionCertificate, "archiveHash">;
}

export function computeGeneralizedCompressionArchiveHash(
  certificate: GeneralizedCompressionCertificate,
): string {
  return canonicalSha256(certificateWithoutArchiveHash(certificate));
}

/**
 * Certify the all-ranks compression without allocating the full strict face
 * poset. Every rooted cell, fiber member, and U<T face record contributes to
 * a deterministic SHA-256 chunk tree and is reconstructed during replay.
 */
export function buildGeneralizedCompressionCertificate(
  input: unknown,
  accepted: TorsionFreeCandidateResult,
  options: GeneralizedCompressionBuildOptions = {},
): GeneralizedCompressionCertificate {
  const rootHashChunkSize = checkedChunkSize(
    options.rootHashChunkSize,
    DEFAULT_ROOT_CHUNK_SIZE,
    "rootHashChunkSize",
  );
  const fiberHashChunkSize = checkedChunkSize(
    options.fiberHashChunkSize,
    DEFAULT_FIBER_CHUNK_SIZE,
    "fiberHashChunkSize",
  );
  const faceHashChunkSize = checkedChunkSize(
    options.faceHashChunkSize,
    DEFAULT_FACE_CHUNK_SIZE,
    "faceHashChunkSize",
  );
  const prepared = prepareSource(input, accepted);
  const { system, candidate } = prepared;
  const systemCanonicalSha256 = canonicalSha256(system);
  const actionRowsCanonicalSha256 = actionRowsSha256(candidate);
  const sourceHash = canonicalSha256({
    schemaVersion: 1,
    kind: "generalized-compression-source",
    systemCanonicalSha256,
    actionRowsCanonicalSha256,
    actionFingerprint: prepared.actionFingerprint,
    candidateId: candidate.id,
    degree: candidate.index,
  });
  const runtimeTypes = prepared.plans.map((plan, typeIndex) =>
    buildRuntimeType(candidate, plan, typeIndex),
  );
  const sphericalTypes = runtimeTypes.map((type) => {
    const rootImages = hashRootImages(sourceHash, type, rootHashChunkSize);
    const fibers = hashFibers(sourceHash, candidate, type, fiberHashChunkSize);
    return {
      typeIndex: type.typeIndex,
      sphericalSubsetId: type.id,
      generators: [...type.generators],
      dimension: type.dimension,
      subgroupOrder: type.subgroupOrder,
      rootedSourceCellCount: candidate.index,
      compressedCellCount: type.representatives.length,
      expectedFiberCardinality: type.subgroupOrder,
      rootImageEncoding: "canonical-minimum-action-point" as const,
      rootImageChunkHashes: rootImages.chunkHashes,
      fiberEncoding: "ordered-representative-and-member-list" as const,
      fiberChunkHashes: fibers.chunkHashes,
      rootImageHash: rootImages.hash,
      fiberPartitionHash: fibers.hash,
      checks: {
        everyRootHasOneImage: true as const,
        fibersPartitionEveryRoot: true as const,
        everyFiberHasExpectedCardinality: true as const,
        representativeIsFiberMinimum: true as const,
      },
    };
  });
  const faceCompatibility: GeneralizedCompressionFaceCompatibility[] = [];
  for (const coface of runtimeTypes) {
    for (const face of runtimeTypes) {
      if (
        face.dimension >= coface.dimension ||
        !isSubset(face.generators, coface.generators)
      ) {
        continue;
      }
      faceCompatibility.push(
        buildFaceCompatibility(
          sourceHash,
          candidate,
          face,
          coface,
          sphericalTypes[face.typeIndex].rootImageHash,
          sphericalTypes[coface.typeIndex].rootImageHash,
          faceHashChunkSize,
        ),
      );
    }
  }
  faceCompatibility.sort(
    (left, right) =>
      left.cofaceTypeIndex - right.cofaceTypeIndex ||
      left.faceTypeIndex - right.faceTypeIndex,
  );
  let rankAtMostTwoAgreement: GeneralizedCompressionRankTwoAgreement;
  if (options.coverCompression !== undefined) {
    if (options.sourceQuotientVertexIds === undefined) {
      throw new GeneralizedCompressionError(
        "The materialized compression bridge needs a point/source binding",
        ["Supply sourceQuotientVertexIds together with coverCompression."],
      );
    }
    rankAtMostTwoAgreement = materializedRankTwoAgreement(
      sourceHash,
      system,
      candidate,
      runtimeTypes,
      options.sourceQuotientVertexIds,
      options.coverCompression,
      faceHashChunkSize,
    );
  } else {
    rankAtMostTwoAgreement = actionTruncationAgreement(
      sourceHash,
      system,
      candidate,
      runtimeTypes,
      faceHashChunkSize,
    );
  }
  if (
    options.coverCompression === undefined &&
    options.sourceQuotientVertexIds !== undefined
  ) {
    const ids = options.sourceQuotientVertexIds;
    if (
      ids.length !== candidate.index ||
      new Set(ids).size !== candidate.index ||
      ids.some((id) => typeof id !== "string" || id.length === 0)
    ) {
      throw new GeneralizedCompressionError(
        "Invalid action-point/source binding",
        [
          "sourceQuotientVertexIds must contain one distinct nonempty id per action point.",
        ],
      );
    }
    rankAtMostTwoAgreement = {
      ...rankAtMostTwoAgreement,
      sourcePointBindingSha256: canonicalSha256(
        ids.map((sourceQuotientVertexId, actionPoint) => ({
          actionPoint,
          sourceQuotientVertexId,
        })),
      ),
    };
  }
  const cellCountByDimension = countByDimension(runtimeTypes);
  const rootedSourceCellCount = runtimeTypes.length * candidate.index;
  const compressedCellCount = runtimeTypes.reduce(
    (sum, type) => sum + type.representatives.length,
    0,
  );
  const rootedFaceRecordCount = faceCompatibility.reduce(
    (sum, relation) => sum + relation.rootedFaceRecordCount,
    0,
  );
  const strictFaceIncidenceCount = faceCompatibility.reduce(
    (sum, relation) => sum + relation.compressedFaceIncidenceCount,
    0,
  );
  const immediateFaceIncidenceCount = faceCompatibility
    .filter((relation) => relation.immediate)
    .reduce((sum, relation) => sum + relation.compressedFaceIncidenceCount, 0);
  const withoutArchiveHash: Omit<
    GeneralizedCompressionCertificate,
    "archiveHash"
  > = {
    schemaVersion: 1,
    kind: "generalized-spherical-compression-certificate",
    status: "passed",
    method: "exact-action-rooted-spherical-orbit-compression",
    source: {
      systemCanonicalSha256,
      actionRowsCanonicalSha256,
      actionFingerprint: prepared.actionFingerprint,
      candidateId: candidate.id,
      degree: candidate.index,
    },
    encoding: {
      rootHashChunkSize,
      fiberHashChunkSize,
      faceHashChunkSize,
      strictFaceIncidencesMaterialized: false,
      rootedSourceCellObjectsMaterialized: false,
    },
    sphericalTypes,
    faceCompatibility,
    rankAtMostTwoAgreement,
    cellCountByDimension,
    rootedSourceCellCount,
    compressedCellCount,
    rootedFaceRecordCount,
    strictFaceIncidenceCount,
    immediateFaceIncidenceCount,
    checks: {
      sourceTorsionFreeCertificateReplayed: true,
      completeSphericalCatalogue: true,
      everyRootedCellRecorded: true,
      allFiberCardinalitiesEqualSphericalOrders: true,
      everyProperSphericalFaceTypeChecked: true,
      allFaceMapsCompatible: true,
      rankAtMostTwoDefinitionAgreementPassed: true,
      materializedRankAtMostTwoBridgePassed:
        rankAtMostTwoAgreement.scope === "materialized-artifact",
    },
    archiveHashAlgorithm: "sha256-canonical-json",
    warnings: prepared.warnings,
  };
  return {
    ...withoutArchiveHash,
    archiveHash: canonicalSha256(withoutArchiveHash),
  };
}

export function verifyGeneralizedCompressionCertificate(
  input: unknown,
  accepted: TorsionFreeCandidateResult,
  certificate: GeneralizedCompressionCertificate,
  options: Pick<
    GeneralizedCompressionBuildOptions,
    "sourceQuotientVertexIds" | "coverCompression"
  > = {},
): GeneralizedCompressionReplayResult {
  const errors: string[] = [];
  let expected: GeneralizedCompressionCertificate;
  try {
    expected = buildGeneralizedCompressionCertificate(input, accepted, {
      ...options,
      rootHashChunkSize: checkedChunkSize(
        certificate?.encoding?.rootHashChunkSize,
        DEFAULT_ROOT_CHUNK_SIZE,
        "certificate.encoding.rootHashChunkSize",
      ),
      fiberHashChunkSize: checkedChunkSize(
        certificate?.encoding?.fiberHashChunkSize,
        DEFAULT_FIBER_CHUNK_SIZE,
        "certificate.encoding.fiberHashChunkSize",
      ),
      faceHashChunkSize: checkedChunkSize(
        certificate?.encoding?.faceHashChunkSize,
        DEFAULT_FACE_CHUNK_SIZE,
        "certificate.encoding.faceHashChunkSize",
      ),
    });
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
  let actualArchiveHash: string | undefined;
  try {
    actualArchiveHash = computeGeneralizedCompressionArchiveHash(certificate);
    if (certificate.archiveHash !== actualArchiveHash) {
      errors.push("The stored generalized-compression archive hash is stale.");
    }
    if (canonicalSha256(certificate) !== canonicalSha256(expected)) {
      errors.push(
        "The generalized-compression certificate does not equal action-rooted replay.",
      );
    }
  } catch (error) {
    errors.push(
      `The supplied generalized-compression artifact is not canonical certificate data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    valid: errors.length === 0,
    errors,
    expectedArchiveHash: expected.archiveHash,
    ...(actualArchiveHash === undefined ? {} : { actualArchiveHash }),
  };
}

/** Materialize one spherical type for inspection; large callers should use the certificate chunks. */
export function materializeGeneralizedCompressionFibers(
  input: unknown,
  accepted: TorsionFreeCandidateResult,
  sphericalSubsetId: string,
  options: { maxRootedSourceCells?: number } = {},
): MaterializedGeneralizedCompressionFiber[] {
  const prepared = prepareSource(input, accepted);
  const maximum = options.maxRootedSourceCells ?? 1_000_000;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    prepared.candidate.index > maximum
  ) {
    throw new GeneralizedCompressionError(
      "Fiber materialization exceeds its bound",
      [
        `Type ${sphericalSubsetId} has ${prepared.candidate.index} rooted source cells; bound ${String(maximum)}.`,
      ],
    );
  }
  const typeIndex = prepared.plans.findIndex(
    (plan) => plan.id === sphericalSubsetId,
  );
  if (typeIndex < 0) {
    throw new GeneralizedCompressionError("Unknown spherical type", [
      `${sphericalSubsetId} is absent from the complete spherical catalogue.`,
    ]);
  }
  const type = buildRuntimeType(
    prepared.candidate,
    prepared.plans[typeIndex],
    typeIndex,
  );
  return type.representatives.map((representativePoint) => ({
    representativePoint,
    actionPoints: orbitFromRoot(
      prepared.candidate,
      type.generators,
      representativePoint,
    ),
  }));
}

/** Reconstruct one U<T face map for inspection without materializing the full poset. */
export function materializeGeneralizedCompressionFaceCompatibility(
  input: unknown,
  accepted: TorsionFreeCandidateResult,
  faceSphericalSubsetId: string,
  cofaceSphericalSubsetId: string,
  options: { maxRecords?: number } = {},
): MaterializedGeneralizedCompressionFaceCompatibility {
  const prepared = prepareSource(input, accepted);
  const maximum = options.maxRecords ?? 1_000_000;
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new GeneralizedCompressionError(
      "Invalid face materialization bound",
      [
        `maxRecords must be a positive safe integer; received ${String(maximum)}.`,
      ],
    );
  }
  const faceTypeIndex = prepared.plans.findIndex(
    (plan) => plan.id === faceSphericalSubsetId,
  );
  const cofaceTypeIndex = prepared.plans.findIndex(
    (plan) => plan.id === cofaceSphericalSubsetId,
  );
  if (faceTypeIndex < 0 || cofaceTypeIndex < 0) {
    throw new GeneralizedCompressionError("Unknown spherical face type", [
      `${faceSphericalSubsetId} < ${cofaceSphericalSubsetId} is not in the complete catalogue.`,
    ]);
  }
  const facePlan = prepared.plans[faceTypeIndex];
  const cofacePlan = prepared.plans[cofaceTypeIndex];
  if (
    facePlan.rank >= cofacePlan.rank ||
    !isSubset(facePlan.generators, cofacePlan.generators)
  ) {
    throw new GeneralizedCompressionError("Invalid spherical face relation", [
      `${faceSphericalSubsetId} is not a proper subset of ${cofaceSphericalSubsetId}.`,
    ]);
  }
  const expectedCompressedRecords =
    (prepared.candidate.index / cofacePlan.order) *
    (cofacePlan.order / facePlan.order);
  if (
    prepared.candidate.index > maximum ||
    expectedCompressedRecords > maximum
  ) {
    throw new GeneralizedCompressionError(
      "Face materialization exceeds its bound",
      [
        `The relation has ${prepared.candidate.index} rooted and ${expectedCompressedRecords} compressed records; bound ${maximum}.`,
      ],
    );
  }
  const face = buildRuntimeType(prepared.candidate, facePlan, faceTypeIndex);
  const coface = buildRuntimeType(
    prepared.candidate,
    cofacePlan,
    cofaceTypeIndex,
  );
  const rootedRecords = Array.from(
    { length: prepared.candidate.index },
    (_unused, actionPoint) => ({
      actionPoint,
      faceRepresentativePoint: face.representativeByPoint[actionPoint],
      cofaceRepresentativePoint: coface.representativeByPoint[actionPoint],
    }),
  );
  const compressedIncidences: MaterializedGeneralizedCompressionFaceIncidence[] =
    [];
  for (const cofaceRepresentativePoint of coface.representatives) {
    const faceRepresentatives = [
      ...new Set(
        orbitFromRoot(
          prepared.candidate,
          coface.generators,
          cofaceRepresentativePoint,
        ).map((point) => face.representativeByPoint[point] as number),
      ),
    ].sort(compareNumbers);
    for (const faceRepresentativePoint of faceRepresentatives) {
      compressedIncidences.push({
        faceRepresentativePoint,
        cofaceRepresentativePoint,
      });
    }
  }
  if (compressedIncidences.length !== expectedCompressedRecords) {
    throw new GeneralizedCompressionError(
      "Materialized face incidence count disagrees with the certificate rule",
      [
        `Produced ${compressedIncidences.length}; expected ${expectedCompressedRecords}.`,
      ],
    );
  }
  return {
    faceSphericalSubsetId,
    cofaceSphericalSubsetId,
    rootedRecords,
    compressedIncidences,
  };
}
