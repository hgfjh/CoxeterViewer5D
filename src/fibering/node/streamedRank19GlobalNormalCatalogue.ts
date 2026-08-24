import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import type { GeneralizedCompressionCertificate } from "../../davis/generalizedCompression";
import { canonicalSha256 } from "../../utils/canonicalSha256";
import type { StreamedH1CompleteLatticeCertificate } from "../streamedH1Completion";
import type { StreamedLawfulDavisOracle } from "../streamedLawfulDavis";
import { bindStreamedFullH1Lattice } from "../streamedRank19TrackB";
import {
  computeStreamedTrackBLinearTemplateStreamHash,
  streamStreamedTrackBLinearLinkTemplates,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBLinearLinkTemplate,
  type StreamedTrackBLinearTemplateStreamOptions,
  type StreamedTrackBLinearTemplateStreamResult,
} from "../streamedTrackB";

const RANK = 19;
const STREAM_TEMPLATE_HASH_CHUNK_SIZE = 4_096;
const MINIMUM_PRODUCTION_CHUNK_SIZE = 4_096;
const DEFAULT_MAX_CHECKPOINT_BYTES = 512 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const INTEGER_PATTERN = /^(0|-?[1-9][0-9]*)$/u;

export interface StreamedRank19CatalogueH1Binding {
  certificateDigest: string;
  preparationDigest: string;
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  fullLatticeBasisDigest: string;
  fullCocycleSectionDigest: string;
  h1Rank: 19;
  h1IsomorphicTo: "Z^19";
  integralBasisIds: string[];
  fullIntegralBasisCertified: true;
}

export interface StreamedRank19GlobalCatalogueBinding {
  schemaVersion: 1;
  kind: "streamed-rank-19-global-normal-catalogue-binding";
  source: {
    degree: number;
    sourceHash: string;
    oracleStructureHash: string;
    actionRowsCanonicalSha256: string;
    generalizedCompressionArchiveHash: string;
  };
  h1: StreamedRank19CatalogueH1Binding;
  preflightStream: StreamedTrackBLinearTemplateStreamResult;
  bindingDigest: string;
}

export interface StreamedRank19GlobalNormalEntry {
  normalKey: string;
  primitiveNormal: string[];
  occurrenceCount: number;
  firstOccurrence: { point: number; germId: string };
}

export interface StreamedRank19GlobalNormalChunk {
  chunkIndex: number;
  firstPoint: number;
  lastPointExclusive: number;
  templateRecords: Array<[number, string]>;
  templateRecordDigest: string;
  streamReport: StreamedTrackBLinearTemplateStreamResult;
  streamReportHash: string;
  germOccurrenceCount: number;
  identicallyZeroGermCount: number;
  normalCatalogue: StreamedRank19GlobalNormalEntry[];
  normalCatalogueDigest: string;
  chunkDigest: string;
}

export interface StreamedRank19GlobalNormalCoverage {
  pointCoverage: "contiguous-prefix" | "all-quotient-points";
  linearGermNormalCoverageClaimed: boolean;
  rawIntegralCoefficientFormHyperplaneCoverageClaimed: boolean;
  rawIntegralCoefficientFormHyperplaneScope: "dot(form,w)=0 sign faces for primitive integral character vectors w";
  translatedAffineHyperplaneCoverageClaimed: false;
  adjacencyIncluded: false;
  adjacencyCoverageClaimed: false;
  ascendingDescendingLinkCoverageClaimed: false;
  nonClaim: "This catalogue exhausts raw coefficient-form hyperplanes dot(form,w)=0 only after all points are covered; it does not catalogue translated affine equations 4d*dot(form,w)+sigma*pointDifference=0, compute adjacency, or certify ascending/descending link connectivity.";
}

interface StreamedRank19GlobalNormalManifest {
  binding: StreamedRank19GlobalCatalogueBinding;
  degree: number;
  rank: 19;
  chunkSize: number;
  nextPoint: number;
  chunks: StreamedRank19GlobalNormalChunk[];
  chunkManifestDigest: string;
  germOccurrenceCount: number;
  identicallyZeroGermCount: number;
  normalCount: number;
  normalCatalogue: StreamedRank19GlobalNormalEntry[];
  normalCatalogueDigest: string;
  coverage: StreamedRank19GlobalNormalCoverage;
}

export interface StreamedRank19GlobalNormalCheckpoint extends StreamedRank19GlobalNormalManifest {
  schemaVersion: 1;
  kind: "streamed-rank-19-global-normal-catalogue-checkpoint";
  method: "gap-free-contiguous-no-adjacency-template-chunks";
  checkpointDigest: string;
}

export interface StreamedRank19GlobalNormalArtifact extends StreamedRank19GlobalNormalManifest {
  schemaVersion: 1;
  kind: "streamed-rank-19-global-normal-catalogue";
  status: "completed";
  method: "gap-free-contiguous-no-adjacency-template-chunks";
  artifactDigest: string;
}

export interface StreamedRank19GlobalNormalReplay {
  status: "passed" | "failed";
  checks: {
    envelopeValid: boolean;
    storedDigestValid: boolean;
    bindingValid: boolean;
    expectedBindingMatches: boolean;
    preflightReplayValid: boolean;
    gapFreePointCoverage: boolean;
    everyChunkStreamReportValid: boolean;
    adjacencyAndLinkNonClaimsExplicit: boolean;
    chunkManifestDigestValid: boolean;
    catalogueAndCountsRecomputed: boolean;
    completionClaimValid: boolean;
  };
  rebuiltDigest?: string;
  rebuiltChunkManifestDigest?: string;
  rebuiltNormalCatalogueDigest?: string;
  errors: string[];
}

export interface ReplayStreamedRank19GlobalNormalAgainstExactInputsOptions {
  oracle: StreamedLawfulDavisOracle;
  generalizedCompression: GeneralizedCompressionCertificate;
  generalizedCompressionReplayOptions?: StreamedTrackBLinearTemplateStreamOptions["generalizedCompressionReplayOptions"];
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
  h1Certificate: StreamedH1CompleteLatticeCertificate;
  /** Operational progress only; it is absent from every certificate digest. */
  onChunkReplayed?: (progress: {
    chunkIndex: number;
    chunkCount: number;
    firstPoint: number;
    lastPointExclusive: number;
  }) => void;
}

export interface StreamedRank19GlobalNormalExactReplay {
  status: "passed" | "failed";
  checks: {
    storedCatalogueReplayPassed: boolean;
    freshMathematicalBindingMatches: boolean;
    everyChunkRegenerated: boolean;
    everyRegeneratedChunkMatchesStored: boolean;
  };
  chunkCount: number;
  regeneratedChunkCount: number;
  regeneratedChunkSequenceDigest?: string;
  storedCompletionCertificateDigest?: string;
  freshCompletionCertificateDigest?: string;
  mathematicalBindingDigest?: string;
  catalogueReplay: StreamedRank19GlobalNormalReplay;
  errors: string[];
}

export interface RunStreamedRank19GlobalNormalCatalogueOptions {
  oracle: StreamedLawfulDavisOracle;
  generalizedCompression: GeneralizedCompressionCertificate;
  generalizedCompressionReplayOptions?: StreamedTrackBLinearTemplateStreamOptions["generalizedCompressionReplayOptions"];
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
  h1Certificate: StreamedH1CompleteLatticeCertificate;
  checkpointPath: string;
  chunkSize: number;
  /** Operational input/output bound; absent from certificate hashes. */
  maxCheckpointBytes?: number;
  /** Tiny chunks are useful only for bounded software fixtures. */
  allowSmallChunksForTesting?: true;
  /** Operational budget used for controlled runs and deterministic resume tests. */
  maxChunksThisRun?: number;
  onCheckpoint?: (checkpoint: StreamedRank19GlobalNormalCheckpoint) => void;
}

export type RunStreamedRank19GlobalNormalCatalogueResult =
  | {
      status: "checkpointed";
      checkpoint: StreamedRank19GlobalNormalCheckpoint;
    }
  | {
      status: "completed";
      artifact: StreamedRank19GlobalNormalArtifact;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireDigest(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}

function requirePositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function requireNonnegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function canonicalNormal(input: readonly bigint[]): {
  zero: boolean;
  primitive: string[];
  key: string;
} {
  if (input.length !== RANK) {
    throw new Error(`A global normal must have rank ${RANK}.`);
  }
  let divisor = 0n;
  for (const value of input) divisor = gcd(divisor, value);
  if (divisor === 0n) {
    const primitive = input.map(() => "0");
    return { zero: true, primitive, key: primitive.join(",") };
  }
  let primitive = input.map((value) => value / divisor);
  if (primitive.find((value) => value !== 0n)! < 0n) {
    primitive = primitive.map((value) => -value);
  }
  const serialized = primitive.map(String);
  return { zero: false, primitive: serialized, key: serialized.join(",") };
}

function compareNormals(
  left: readonly string[],
  right: readonly string[],
): number {
  for (let index = 0; index < RANK; index += 1) {
    const difference = BigInt(left[index]) - BigInt(right[index]);
    if (difference < 0n) return -1;
    if (difference > 0n) return 1;
  }
  return 0;
}

function cloneNormalEntry(
  entry: StreamedRank19GlobalNormalEntry,
): StreamedRank19GlobalNormalEntry {
  return {
    normalKey: entry.normalKey,
    primitiveNormal: [...entry.primitiveNormal],
    occurrenceCount: entry.occurrenceCount,
    firstOccurrence: { ...entry.firstOccurrence },
  };
}

function createNormalAccumulator(): {
  accept(template: StreamedTrackBLinearLinkTemplate): void;
  finish(): {
    germOccurrenceCount: number;
    identicallyZeroGermCount: number;
    normalCatalogue: StreamedRank19GlobalNormalEntry[];
    normalCatalogueDigest: string;
  };
} {
  const byKey = new Map<string, StreamedRank19GlobalNormalEntry>();
  let germOccurrenceCount = 0;
  let identicallyZeroGermCount = 0;
  return {
    accept(template) {
      if (template.adjacencyIncluded || template.adjacency.length !== 0) {
        throw new Error(
          `Global-normal template q${template.point} unexpectedly includes adjacency.`,
        );
      }
      for (const germ of template.germs) {
        germOccurrenceCount += 1;
        const dense = Array.from({ length: RANK }, () => 0n);
        let previousCoordinate = -1;
        for (const [coordinate, coefficientToken] of germ.coefficientPairs) {
          if (
            !Number.isInteger(coordinate) ||
            coordinate <= previousCoordinate ||
            coordinate < 0 ||
            coordinate >= RANK
          ) {
            throw new Error(`${germ.id} has noncanonical sparse coordinates.`);
          }
          if (!INTEGER_PATTERN.test(coefficientToken)) {
            throw new Error(
              `${germ.id} has a noncanonical integer coefficient.`,
            );
          }
          const coefficient = BigInt(coefficientToken);
          if (coefficient === 0n) {
            throw new Error(`${germ.id} stores a zero sparse coefficient.`);
          }
          dense[coordinate] = coefficient;
          previousCoordinate = coordinate;
        }
        const normal = canonicalNormal(dense);
        if (normal.zero) {
          identicallyZeroGermCount += 1;
          continue;
        }
        const previous = byKey.get(normal.key);
        if (previous) {
          previous.occurrenceCount += 1;
        } else {
          byKey.set(normal.key, {
            normalKey: normal.key,
            primitiveNormal: normal.primitive,
            occurrenceCount: 1,
            firstOccurrence: { point: template.point, germId: germ.id },
          });
        }
      }
    },
    finish() {
      const normalCatalogue = [...byKey.values()].sort((left, right) =>
        compareNormals(left.primitiveNormal, right.primitiveNormal),
      );
      return {
        germOccurrenceCount,
        identicallyZeroGermCount,
        normalCatalogue,
        normalCatalogueDigest: canonicalSha256(normalCatalogue),
      };
    },
  };
}

function validateH1Binding(
  h1: StreamedRank19CatalogueH1Binding,
  oracle: StreamedLawfulDavisOracle,
  cocycleBasis: StreamedTrackBIntegralCocycleBasis,
): void {
  for (const [label, digest] of [
    ["h1.certificateDigest", h1.certificateDigest],
    ["h1.preparationDigest", h1.preparationDigest],
    ["h1.oracleStructureHash", h1.oracleStructureHash],
    ["h1.actionRowsCanonicalSha256", h1.actionRowsCanonicalSha256],
    ["h1.fullLatticeBasisDigest", h1.fullLatticeBasisDigest],
    ["h1.fullCocycleSectionDigest", h1.fullCocycleSectionDigest],
  ] as const) {
    requireDigest(digest, label);
  }
  if (
    h1.h1Rank !== RANK ||
    h1.h1IsomorphicTo !== "Z^19" ||
    h1.fullIntegralBasisCertified !== true ||
    h1.integralBasisIds.length !== RANK ||
    new Set(h1.integralBasisIds).size !== RANK ||
    h1.integralBasisIds.some((id) => id.length === 0)
  ) {
    throw new Error(
      "The global catalogue requires an ordered full Z^19 basis.",
    );
  }
  if (
    h1.oracleStructureHash !== oracle.structureHash ||
    h1.actionRowsCanonicalSha256 !== oracle.actionRowsCanonicalSha256
  ) {
    throw new Error("The H1 binding belongs to another streamed oracle.");
  }
  if (!arraysEqual(h1.integralBasisIds, cocycleBasis.coordinateIds)) {
    throw new Error(
      "The H1 binding and cocycle basis have different coordinates.",
    );
  }
  if (
    h1.fullLatticeBasisDigest !== cocycleBasis.latticeBasisDigest ||
    h1.fullCocycleSectionDigest !== cocycleBasis.expectedCocycleSectionDigest
  ) {
    throw new Error("The H1 lattice or cocycle section binding is stale.");
  }
}

function heightRuleDigestValid(
  heightRule: StreamedTrackBLinearTemplateStreamResult["heightRule"],
): boolean {
  const { heightRuleDigest, ...withoutDigest } = heightRule;
  return (
    SHA256_PATTERN.test(heightRuleDigest) &&
    canonicalSha256(withoutDigest) === heightRuleDigest
  );
}

function emptyTemplateSetDigest(sourceHash: string): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "streamed-integral-pulling-link-template-chunk-tree",
    sourceHash,
    requestedPoints: [],
    checkedPointCount: 0,
    chunkSize: STREAM_TEMPLATE_HASH_CHUNK_SIZE,
    chunkHashes: [],
  });
}

function templateSetDigest(
  sourceHash: string,
  points: readonly number[],
  records: readonly (readonly [number, string])[],
): string {
  const chunkHashes: string[] = [];
  for (
    let start = 0;
    start < records.length;
    start += STREAM_TEMPLATE_HASH_CHUNK_SIZE
  ) {
    chunkHashes.push(
      canonicalSha256({
        chunkIndex: chunkHashes.length,
        records: records.slice(start, start + STREAM_TEMPLATE_HASH_CHUNK_SIZE),
      }),
    );
  }
  return canonicalSha256({
    schemaVersion: 1,
    method: "streamed-integral-pulling-link-template-chunk-tree",
    sourceHash,
    requestedPoints: points,
    checkedPointCount: records.length,
    chunkSize: STREAM_TEMPLATE_HASH_CHUNK_SIZE,
    chunkHashes,
  });
}

function preflightErrors(
  report: StreamedTrackBLinearTemplateStreamResult,
): string[] {
  const errors: string[] = [];
  if (
    report.schemaVersion !== 1 ||
    report.kind !== "streamed-full-k-track-b-linear-link-template-stream"
  ) {
    errors.push("The binding preflight has the wrong schema or kind.");
  }
  if (
    report.status !== "completed" ||
    report.scanOutcome !== "exhaustive-request" ||
    report.requestedPointCount !== 0 ||
    report.checkedPointCount !== 0 ||
    report.exhaustiveAllPoints ||
    report.adjacencyIncluded ||
    !report.checks.sourceReplayed ||
    !report.checks.coordinateIdsValid ||
    !report.checks.expectedCocycleSectionDigestMatches ||
    !report.checks.directedEdgesAntisymmetric ||
    !report.checks.rankTwoBoundariesClosed ||
    !report.checks.exactNumberPackingBoundProved ||
    !report.checks.everyRequestedPointStreamed ||
    report.checks.everyQuotientPointStreamed ||
    report.errors.length !== 0
  ) {
    errors.push("The zero-point binding preflight did not pass every check.");
  }
  if (report.coordinateCount !== RANK || report.coordinateIds.length !== RANK) {
    errors.push("The binding preflight is not expressed in rank 19.");
  }
  if (!heightRuleDigestValid(report.heightRule)) {
    errors.push("The binding preflight has an invalid height-rule digest.");
  }
  if (report.templateSetDigest !== emptyTemplateSetDigest(report.sourceHash)) {
    errors.push("The zero-point template-set digest is invalid.");
  }
  if (
    report.reportHash !== computeStreamedTrackBLinearTemplateStreamHash(report)
  ) {
    errors.push("The binding preflight report hash is invalid.");
  }
  return errors;
}

export function computeStreamedRank19GlobalCatalogueBindingDigest(
  binding: StreamedRank19GlobalCatalogueBinding,
): string {
  return canonicalSha256({ ...binding, bindingDigest: "" });
}

/**
 * Bind the mathematical inputs while keeping the completion-certificate hash
 * as separate provenance. Certificate prose or backend-label metadata may
 * change without changing the action, preparation, integral basis, cocycle
 * section, or streamed templates.
 */
export function computeStreamedRank19GlobalCatalogueMathematicalBindingDigest(
  binding: StreamedRank19GlobalCatalogueBinding,
): string {
  const h1 = {
    preparationDigest: binding.h1.preparationDigest,
    oracleStructureHash: binding.h1.oracleStructureHash,
    actionRowsCanonicalSha256: binding.h1.actionRowsCanonicalSha256,
    fullLatticeBasisDigest: binding.h1.fullLatticeBasisDigest,
    fullCocycleSectionDigest: binding.h1.fullCocycleSectionDigest,
    h1Rank: binding.h1.h1Rank,
    h1IsomorphicTo: binding.h1.h1IsomorphicTo,
    integralBasisIds: binding.h1.integralBasisIds,
    fullIntegralBasisCertified: binding.h1.fullIntegralBasisCertified,
  };
  return canonicalSha256({
    schemaVersion: 1,
    kind: "streamed-rank-19-global-normal-catalogue-mathematical-binding",
    source: binding.source,
    h1,
    preflightStream: binding.preflightStream,
  });
}

export function buildStreamedRank19GlobalCatalogueBinding(
  options: RunStreamedRank19GlobalNormalCatalogueOptions,
): StreamedRank19GlobalCatalogueBinding {
  const certified = bindStreamedFullH1Lattice(options.h1Certificate);
  const h1: StreamedRank19CatalogueH1Binding = {
    certificateDigest: certified.certificateDigest,
    preparationDigest: certified.preparationDigest,
    oracleStructureHash: certified.oracleStructureHash,
    actionRowsCanonicalSha256: certified.actionRowsCanonicalSha256,
    fullLatticeBasisDigest: certified.fullLatticeBasisDigest,
    fullCocycleSectionDigest: certified.fullCocycleSectionDigest,
    h1Rank: 19,
    h1IsomorphicTo: "Z^19",
    integralBasisIds: [...certified.integralBasisIds],
    fullIntegralBasisCertified: true,
  };
  validateH1Binding(h1, options.oracle, options.cocycleBasis);
  const preflightStream = streamStreamedTrackBLinearLinkTemplates(
    {
      oracle: options.oracle,
      generalizedCompression: options.generalizedCompression,
      ...(options.generalizedCompressionReplayOptions
        ? {
            generalizedCompressionReplayOptions:
              options.generalizedCompressionReplayOptions,
          }
        : {}),
      cocycleBasis: options.cocycleBasis,
      points: [],
      includeAdjacency: false,
    },
    () => {
      throw new Error("A zero-point binding preflight emitted a template.");
    },
  );
  const errors = preflightErrors(preflightStream);
  if (errors.length > 0) {
    throw new Error(
      `Global-normal binding preflight failed: ${errors.join(" ")}`,
    );
  }
  if (
    preflightStream.oracleStructureHash !== options.oracle.structureHash ||
    preflightStream.generalizedCompressionArchiveHash !==
      options.generalizedCompression.archiveHash ||
    preflightStream.latticeBasisDigest !== h1.fullLatticeBasisDigest ||
    preflightStream.cocycleSectionDigest !== h1.fullCocycleSectionDigest ||
    !arraysEqual(preflightStream.coordinateIds, h1.integralBasisIds)
  ) {
    throw new Error(
      "The binding preflight disagrees with its source or H1 input.",
    );
  }
  const binding: StreamedRank19GlobalCatalogueBinding = {
    schemaVersion: 1,
    kind: "streamed-rank-19-global-normal-catalogue-binding",
    source: {
      degree: options.oracle.degree,
      sourceHash: preflightStream.sourceHash,
      oracleStructureHash: options.oracle.structureHash,
      actionRowsCanonicalSha256: options.oracle.actionRowsCanonicalSha256,
      generalizedCompressionArchiveHash:
        options.generalizedCompression.archiveHash,
    },
    h1,
    preflightStream,
    bindingDigest: "",
  };
  binding.bindingDigest =
    computeStreamedRank19GlobalCatalogueBindingDigest(binding);
  return binding;
}

function bindingErrors(
  binding: StreamedRank19GlobalCatalogueBinding,
): string[] {
  const errors: string[] = [];
  if (
    binding.schemaVersion !== 1 ||
    binding.kind !== "streamed-rank-19-global-normal-catalogue-binding"
  ) {
    errors.push("The global-normal binding has the wrong schema or kind.");
    return errors;
  }
  try {
    requirePositiveSafeInteger(binding.source.degree, "binding.source.degree");
    for (const [label, digest] of [
      ["binding.source.sourceHash", binding.source.sourceHash],
      [
        "binding.source.oracleStructureHash",
        binding.source.oracleStructureHash,
      ],
      [
        "binding.source.actionRowsCanonicalSha256",
        binding.source.actionRowsCanonicalSha256,
      ],
      [
        "binding.source.generalizedCompressionArchiveHash",
        binding.source.generalizedCompressionArchiveHash,
      ],
    ] as const) {
      requireDigest(digest, label);
    }
    for (const [label, digest] of [
      ["binding.h1.certificateDigest", binding.h1.certificateDigest],
      ["binding.h1.preparationDigest", binding.h1.preparationDigest],
      ["binding.h1.oracleStructureHash", binding.h1.oracleStructureHash],
      [
        "binding.h1.actionRowsCanonicalSha256",
        binding.h1.actionRowsCanonicalSha256,
      ],
      ["binding.h1.fullLatticeBasisDigest", binding.h1.fullLatticeBasisDigest],
      [
        "binding.h1.fullCocycleSectionDigest",
        binding.h1.fullCocycleSectionDigest,
      ],
    ] as const) {
      requireDigest(digest, label);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (
    binding.h1.h1Rank !== RANK ||
    binding.h1.h1IsomorphicTo !== "Z^19" ||
    binding.h1.fullIntegralBasisCertified !== true ||
    binding.h1.integralBasisIds.length !== RANK ||
    new Set(binding.h1.integralBasisIds).size !== RANK ||
    binding.h1.integralBasisIds.some((id) => id.length === 0)
  ) {
    errors.push("The stored H1 binding is not an ordered full Z^19 basis.");
  }
  if (
    binding.h1.oracleStructureHash !== binding.source.oracleStructureHash ||
    binding.h1.actionRowsCanonicalSha256 !==
      binding.source.actionRowsCanonicalSha256
  ) {
    errors.push("The stored H1 and source bindings disagree.");
  }
  const preflight = binding.preflightStream;
  errors.push(...preflightErrors(preflight));
  if (
    preflight.sourceHash !== binding.source.sourceHash ||
    preflight.oracleStructureHash !== binding.source.oracleStructureHash ||
    preflight.generalizedCompressionArchiveHash !==
      binding.source.generalizedCompressionArchiveHash ||
    preflight.latticeBasisDigest !== binding.h1.fullLatticeBasisDigest ||
    preflight.cocycleSectionDigest !== binding.h1.fullCocycleSectionDigest ||
    !arraysEqual(preflight.coordinateIds, binding.h1.integralBasisIds)
  ) {
    errors.push("The zero-point preflight and structural binding disagree.");
  }
  if (
    binding.bindingDigest !==
    computeStreamedRank19GlobalCatalogueBindingDigest(binding)
  ) {
    errors.push("The global-normal binding digest is invalid.");
  }
  return [...new Set(errors)].sort();
}

function normalEntryErrors(
  entry: StreamedRank19GlobalNormalEntry,
  label: string,
  firstPoint: number,
  lastPointExclusive: number,
): string[] {
  const errors: string[] = [];
  try {
    if (
      !Array.isArray(entry.primitiveNormal) ||
      entry.primitiveNormal.length !== RANK ||
      entry.primitiveNormal.some((value) => !INTEGER_PATTERN.test(value))
    ) {
      throw new Error(`${label} has a malformed primitive normal.`);
    }
    const rebuilt = canonicalNormal(entry.primitiveNormal.map(BigInt));
    if (
      rebuilt.zero ||
      rebuilt.key !== entry.normalKey ||
      !arraysEqual(rebuilt.primitive, entry.primitiveNormal)
    ) {
      throw new Error(`${label} is not a canonical nonzero primitive normal.`);
    }
    requirePositiveSafeInteger(
      entry.occurrenceCount,
      `${label}.occurrenceCount`,
    );
    if (
      !Number.isSafeInteger(entry.firstOccurrence.point) ||
      entry.firstOccurrence.point < firstPoint ||
      entry.firstOccurrence.point >= lastPointExclusive ||
      entry.firstOccurrence.germId.length === 0
    ) {
      throw new Error(`${label} has an invalid first occurrence.`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

function catalogueErrors(
  entries: readonly StreamedRank19GlobalNormalEntry[],
  label: string,
  firstPoint: number,
  lastPointExclusive: number,
): string[] {
  const errors: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    errors.push(
      ...normalEntryErrors(
        entries[index],
        `${label}[${index}]`,
        firstPoint,
        lastPointExclusive,
      ),
    );
    if (
      index > 0 &&
      compareNormals(
        entries[index - 1].primitiveNormal,
        entries[index].primitiveNormal,
      ) >= 0
    ) {
      errors.push(`${label} is not strictly sorted without duplicates.`);
    }
  }
  return errors;
}

function aggregateChunks(chunks: readonly StreamedRank19GlobalNormalChunk[]): {
  germOccurrenceCount: number;
  identicallyZeroGermCount: number;
  normalCatalogue: StreamedRank19GlobalNormalEntry[];
  normalCatalogueDigest: string;
} {
  const byKey = new Map<string, StreamedRank19GlobalNormalEntry>();
  let germOccurrenceCount = 0;
  let identicallyZeroGermCount = 0;
  for (const chunk of chunks) {
    germOccurrenceCount += chunk.germOccurrenceCount;
    identicallyZeroGermCount += chunk.identicallyZeroGermCount;
    if (
      !Number.isSafeInteger(germOccurrenceCount) ||
      !Number.isSafeInteger(identicallyZeroGermCount)
    ) {
      throw new Error("Global germ counts exceed the safe-integer range.");
    }
    for (const entry of chunk.normalCatalogue) {
      const previous = byKey.get(entry.normalKey);
      if (previous) {
        previous.occurrenceCount += entry.occurrenceCount;
        if (!Number.isSafeInteger(previous.occurrenceCount)) {
          throw new Error(
            "A global normal count exceeds the safe-integer range.",
          );
        }
      } else {
        byKey.set(entry.normalKey, cloneNormalEntry(entry));
      }
    }
  }
  const normalCatalogue = [...byKey.values()].sort((left, right) =>
    compareNormals(left.primitiveNormal, right.primitiveNormal),
  );
  return {
    germOccurrenceCount,
    identicallyZeroGermCount,
    normalCatalogue,
    normalCatalogueDigest: canonicalSha256(normalCatalogue),
  };
}

function computeChunkManifestDigest(
  chunks: readonly StreamedRank19GlobalNormalChunk[],
): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "gap-free-contiguous-no-adjacency-template-chunk-manifest",
    chunks: chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      firstPoint: chunk.firstPoint,
      lastPointExclusive: chunk.lastPointExclusive,
      templateRecordDigest: chunk.templateRecordDigest,
      streamReportHash: chunk.streamReportHash,
      normalCatalogueDigest: chunk.normalCatalogueDigest,
      chunkDigest: chunk.chunkDigest,
    })),
  });
}

export function computeStreamedRank19GlobalNormalChunkDigest(
  chunk: StreamedRank19GlobalNormalChunk,
): string {
  return canonicalSha256({ ...chunk, chunkDigest: "" });
}

export function computeStreamedRank19GlobalNormalCheckpointDigest(
  checkpoint: StreamedRank19GlobalNormalCheckpoint,
): string {
  return canonicalSha256({ ...checkpoint, checkpointDigest: "" });
}

export function computeStreamedRank19GlobalNormalArtifactDigest(
  artifact: StreamedRank19GlobalNormalArtifact,
): string {
  return canonicalSha256({ ...artifact, artifactDigest: "" });
}

function chunkStreamErrors(
  chunk: StreamedRank19GlobalNormalChunk,
  binding: StreamedRank19GlobalCatalogueBinding,
): string[] {
  const errors: string[] = [];
  const report = chunk.streamReport;
  const points = Array.from(
    { length: chunk.lastPointExclusive - chunk.firstPoint },
    (_unused, index) => chunk.firstPoint + index,
  );
  if (
    report.schemaVersion !== 1 ||
    report.kind !== "streamed-full-k-track-b-linear-link-template-stream" ||
    report.status !== "completed" ||
    report.scanOutcome !== "exhaustive-request" ||
    report.requestedPointCount !== points.length ||
    report.checkedPointCount !== points.length ||
    report.adjacencyIncluded ||
    report.errors.length !== 0 ||
    !report.checks.sourceReplayed ||
    !report.checks.coordinateIdsValid ||
    !report.checks.expectedCocycleSectionDigestMatches ||
    !report.checks.directedEdgesAntisymmetric ||
    !report.checks.rankTwoBoundariesClosed ||
    !report.checks.exactNumberPackingBoundProved ||
    !report.checks.everyRequestedPointStreamed
  ) {
    errors.push(`Chunk ${chunk.chunkIndex} has an incomplete stream report.`);
  }
  const shouldBeExhaustive =
    chunk.firstPoint === 0 &&
    chunk.lastPointExclusive === binding.source.degree;
  if (
    report.exhaustiveAllPoints !== shouldBeExhaustive ||
    report.checks.everyQuotientPointStreamed !== shouldBeExhaustive
  ) {
    errors.push(
      `Chunk ${chunk.chunkIndex} has the wrong exhaustive-point claim.`,
    );
  }
  if (
    report.sourceHash !== binding.source.sourceHash ||
    report.oracleStructureHash !== binding.source.oracleStructureHash ||
    report.generalizedCompressionArchiveHash !==
      binding.source.generalizedCompressionArchiveHash ||
    report.latticeBasisDigest !== binding.h1.fullLatticeBasisDigest ||
    report.cocycleSectionDigest !== binding.h1.fullCocycleSectionDigest ||
    report.cocycleClosureDigest !==
      binding.preflightStream.cocycleClosureDigest ||
    !arraysEqual(report.coordinateIds, binding.h1.integralBasisIds) ||
    report.coordinateCount !== RANK ||
    canonicalSha256(report.heightRule) !==
      canonicalSha256(binding.preflightStream.heightRule)
  ) {
    errors.push(`Chunk ${chunk.chunkIndex} has stale source bindings.`);
  }
  if (
    chunk.streamReportHash !== report.reportHash ||
    report.reportHash !== computeStreamedTrackBLinearTemplateStreamHash(report)
  ) {
    errors.push(`Chunk ${chunk.chunkIndex} has an invalid stream report hash.`);
  }
  if (
    chunk.templateRecords.length !== points.length ||
    chunk.templateRecords.some(
      ([point, digest], index) =>
        point !== points[index] || !SHA256_PATTERN.test(digest),
    ) ||
    chunk.templateRecordDigest !== canonicalSha256(chunk.templateRecords)
  ) {
    errors.push(`Chunk ${chunk.chunkIndex} has invalid template records.`);
  } else if (
    report.templateSetDigest !==
    templateSetDigest(report.sourceHash, points, chunk.templateRecords)
  ) {
    errors.push(
      `Chunk ${chunk.chunkIndex} has an invalid template-set digest.`,
    );
  }
  return errors;
}

function chunkErrors(
  chunk: StreamedRank19GlobalNormalChunk,
  binding: StreamedRank19GlobalCatalogueBinding,
): string[] {
  const errors: string[] = [];
  try {
    requireNonnegativeSafeInteger(chunk.chunkIndex, "chunk.chunkIndex");
    requireNonnegativeSafeInteger(chunk.firstPoint, "chunk.firstPoint");
    requirePositiveSafeInteger(
      chunk.lastPointExclusive,
      "chunk.lastPointExclusive",
    );
    requireNonnegativeSafeInteger(
      chunk.germOccurrenceCount,
      "chunk.germOccurrenceCount",
    );
    requireNonnegativeSafeInteger(
      chunk.identicallyZeroGermCount,
      "chunk.identicallyZeroGermCount",
    );
    if (
      chunk.firstPoint >= chunk.lastPointExclusive ||
      chunk.lastPointExclusive > binding.source.degree
    ) {
      throw new Error(`Chunk ${chunk.chunkIndex} has an invalid point range.`);
    }
    errors.push(...chunkStreamErrors(chunk, binding));
    errors.push(
      ...catalogueErrors(
        chunk.normalCatalogue,
        `chunks[${chunk.chunkIndex}].normalCatalogue`,
        chunk.firstPoint,
        chunk.lastPointExclusive,
      ),
    );
    const nonzeroOccurrences = chunk.normalCatalogue.reduce(
      (sum, entry) => sum + entry.occurrenceCount,
      0,
    );
    if (
      !Number.isSafeInteger(nonzeroOccurrences) ||
      nonzeroOccurrences + chunk.identicallyZeroGermCount !==
        chunk.germOccurrenceCount
    ) {
      errors.push(`Chunk ${chunk.chunkIndex} has inconsistent germ counts.`);
    }
    if (
      chunk.normalCatalogueDigest !== canonicalSha256(chunk.normalCatalogue)
    ) {
      errors.push(`Chunk ${chunk.chunkIndex} has an invalid catalogue digest.`);
    }
    if (
      chunk.chunkDigest !== computeStreamedRank19GlobalNormalChunkDigest(chunk)
    ) {
      errors.push(`Chunk ${chunk.chunkIndex} has an invalid chunk digest.`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

function coverageFor(
  nextPoint: number,
  degree: number,
): StreamedRank19GlobalNormalCoverage {
  return {
    pointCoverage:
      nextPoint === degree ? "all-quotient-points" : "contiguous-prefix",
    linearGermNormalCoverageClaimed: true,
    rawIntegralCoefficientFormHyperplaneCoverageClaimed: nextPoint === degree,
    rawIntegralCoefficientFormHyperplaneScope:
      "dot(form,w)=0 sign faces for primitive integral character vectors w",
    translatedAffineHyperplaneCoverageClaimed: false,
    adjacencyIncluded: false,
    adjacencyCoverageClaimed: false,
    ascendingDescendingLinkCoverageClaimed: false,
    nonClaim:
      "This catalogue exhausts raw coefficient-form hyperplanes dot(form,w)=0 only after all points are covered; it does not catalogue translated affine equations 4d*dot(form,w)+sigma*pointDifference=0, compute adjacency, or certify ascending/descending link connectivity.",
  };
}

function manifestFromChunks(input: {
  binding: StreamedRank19GlobalCatalogueBinding;
  chunkSize: number;
  chunks: StreamedRank19GlobalNormalChunk[];
}): StreamedRank19GlobalNormalManifest {
  const nextPoint = input.chunks.at(-1)?.lastPointExclusive ?? 0;
  const aggregate = aggregateChunks(input.chunks);
  return {
    binding: input.binding,
    degree: input.binding.source.degree,
    rank: RANK,
    chunkSize: input.chunkSize,
    nextPoint,
    chunks: input.chunks,
    chunkManifestDigest: computeChunkManifestDigest(input.chunks),
    germOccurrenceCount: aggregate.germOccurrenceCount,
    identicallyZeroGermCount: aggregate.identicallyZeroGermCount,
    normalCount: aggregate.normalCatalogue.length,
    normalCatalogue: aggregate.normalCatalogue,
    normalCatalogueDigest: aggregate.normalCatalogueDigest,
    coverage: coverageFor(nextPoint, input.binding.source.degree),
  };
}

function buildCheckpoint(input: {
  binding: StreamedRank19GlobalCatalogueBinding;
  chunkSize: number;
  chunks: StreamedRank19GlobalNormalChunk[];
}): StreamedRank19GlobalNormalCheckpoint {
  const checkpoint: StreamedRank19GlobalNormalCheckpoint = {
    schemaVersion: 1,
    kind: "streamed-rank-19-global-normal-catalogue-checkpoint",
    method: "gap-free-contiguous-no-adjacency-template-chunks",
    ...manifestFromChunks(input),
    checkpointDigest: "",
  };
  checkpoint.checkpointDigest =
    computeStreamedRank19GlobalNormalCheckpointDigest(checkpoint);
  return checkpoint;
}

function buildArtifact(
  checkpoint: StreamedRank19GlobalNormalCheckpoint,
): StreamedRank19GlobalNormalArtifact {
  if (checkpoint.nextPoint !== checkpoint.degree) {
    throw new Error(
      "A partial normal catalogue cannot become a final artifact.",
    );
  }
  const artifact: StreamedRank19GlobalNormalArtifact = {
    schemaVersion: 1,
    kind: "streamed-rank-19-global-normal-catalogue",
    status: "completed",
    method: "gap-free-contiguous-no-adjacency-template-chunks",
    binding: checkpoint.binding,
    degree: checkpoint.degree,
    rank: checkpoint.rank,
    chunkSize: checkpoint.chunkSize,
    nextPoint: checkpoint.nextPoint,
    chunks: checkpoint.chunks,
    chunkManifestDigest: checkpoint.chunkManifestDigest,
    germOccurrenceCount: checkpoint.germOccurrenceCount,
    identicallyZeroGermCount: checkpoint.identicallyZeroGermCount,
    normalCount: checkpoint.normalCount,
    normalCatalogue: checkpoint.normalCatalogue,
    normalCatalogueDigest: checkpoint.normalCatalogueDigest,
    coverage: checkpoint.coverage,
    artifactDigest: "",
  };
  artifact.artifactDigest =
    computeStreamedRank19GlobalNormalArtifactDigest(artifact);
  return artifact;
}

/**
 * Purely replay the checkpoint/final-manifest arithmetic and all embedded
 * stream report hashes. This does not regenerate quotient templates.
 */
export function replayStreamedRank19GlobalNormalCatalogue(
  stored: unknown,
  expectedBinding?: StreamedRank19GlobalCatalogueBinding,
): StreamedRank19GlobalNormalReplay {
  const checks: StreamedRank19GlobalNormalReplay["checks"] = {
    envelopeValid: false,
    storedDigestValid: false,
    bindingValid: false,
    expectedBindingMatches: expectedBinding === undefined,
    preflightReplayValid: false,
    gapFreePointCoverage: false,
    everyChunkStreamReportValid: false,
    adjacencyAndLinkNonClaimsExplicit: false,
    chunkManifestDigestValid: false,
    catalogueAndCountsRecomputed: false,
    completionClaimValid: false,
  };
  const errors: string[] = [];
  let rebuiltDigest: string | undefined;
  let rebuiltChunkManifestDigest: string | undefined;
  let rebuiltNormalCatalogueDigest: string | undefined;

  try {
    if (!isObject(stored)) {
      throw new Error("The global-normal catalogue is not an object.");
    }
    const isCheckpoint =
      stored.schemaVersion === 1 &&
      stored.kind === "streamed-rank-19-global-normal-catalogue-checkpoint" &&
      stored.method === "gap-free-contiguous-no-adjacency-template-chunks";
    const isArtifact =
      stored.schemaVersion === 1 &&
      stored.kind === "streamed-rank-19-global-normal-catalogue" &&
      stored.status === "completed" &&
      stored.method === "gap-free-contiguous-no-adjacency-template-chunks";
    if (!isCheckpoint && !isArtifact) {
      throw new Error("The global-normal catalogue has the wrong envelope.");
    }
    checks.envelopeValid = true;
    const manifest = stored as unknown as
      | StreamedRank19GlobalNormalCheckpoint
      | StreamedRank19GlobalNormalArtifact;

    if (isCheckpoint) {
      const checkpoint = manifest as StreamedRank19GlobalNormalCheckpoint;
      rebuiltDigest =
        computeStreamedRank19GlobalNormalCheckpointDigest(checkpoint);
      checks.storedDigestValid = checkpoint.checkpointDigest === rebuiltDigest;
    } else {
      const artifact = manifest as StreamedRank19GlobalNormalArtifact;
      rebuiltDigest = computeStreamedRank19GlobalNormalArtifactDigest(artifact);
      checks.storedDigestValid = artifact.artifactDigest === rebuiltDigest;
    }
    if (!checks.storedDigestValid) {
      errors.push("The stored checkpoint/artifact digest is invalid.");
    }

    const bindingProblems = bindingErrors(manifest.binding);
    checks.bindingValid = bindingProblems.length === 0;
    checks.preflightReplayValid =
      preflightErrors(manifest.binding.preflightStream).length === 0;
    errors.push(...bindingProblems);
    if (expectedBinding !== undefined) {
      const expectedProblems = bindingErrors(expectedBinding);
      if (expectedProblems.length > 0) {
        errors.push(
          ...expectedProblems.map((error) => `Expected binding: ${error}`),
        );
      } else {
        checks.expectedBindingMatches =
          canonicalSha256(manifest.binding) ===
          canonicalSha256(expectedBinding);
        if (!checks.expectedBindingMatches) {
          errors.push(
            "The checkpoint belongs to another exact source/H1 binding.",
          );
        }
      }
    }

    requirePositiveSafeInteger(manifest.degree, "degree");
    requirePositiveSafeInteger(manifest.chunkSize, "chunkSize");
    requireNonnegativeSafeInteger(manifest.nextPoint, "nextPoint");
    if (
      manifest.rank !== RANK ||
      manifest.degree !== manifest.binding.source.degree ||
      manifest.nextPoint > manifest.degree ||
      !Array.isArray(manifest.chunks) ||
      !Array.isArray(manifest.normalCatalogue)
    ) {
      errors.push("The global-normal manifest dimensions are inconsistent.");
    }

    let cursor = 0;
    let gapFree = true;
    let chunkReportsValid = true;
    for (let index = 0; index < manifest.chunks.length; index += 1) {
      const chunk = manifest.chunks[index];
      if (
        chunk.chunkIndex !== index ||
        chunk.firstPoint !== cursor ||
        chunk.lastPointExclusive <= chunk.firstPoint ||
        chunk.lastPointExclusive - chunk.firstPoint > manifest.chunkSize ||
        (chunk.lastPointExclusive < manifest.degree &&
          chunk.lastPointExclusive - chunk.firstPoint !== manifest.chunkSize)
      ) {
        gapFree = false;
        errors.push(
          `Chunk ${index} breaks gap-free contiguous point coverage.`,
        );
      }
      const problems = chunkErrors(chunk, manifest.binding);
      if (problems.length > 0) chunkReportsValid = false;
      errors.push(...problems);
      cursor = chunk.lastPointExclusive;
    }
    checks.gapFreePointCoverage = gapFree && cursor === manifest.nextPoint;
    if (!checks.gapFreePointCoverage) {
      errors.push("The chunk ranges do not end at nextPoint.");
    }
    checks.everyChunkStreamReportValid = chunkReportsValid;

    rebuiltChunkManifestDigest = computeChunkManifestDigest(manifest.chunks);
    checks.chunkManifestDigestValid =
      manifest.chunkManifestDigest === rebuiltChunkManifestDigest;
    if (!checks.chunkManifestDigestValid) {
      errors.push("The chunk-manifest digest is invalid.");
    }

    const aggregate = aggregateChunks(manifest.chunks);
    rebuiltNormalCatalogueDigest = aggregate.normalCatalogueDigest;
    const globalCatalogueProblems = catalogueErrors(
      manifest.normalCatalogue,
      "normalCatalogue",
      0,
      Math.max(1, manifest.nextPoint),
    );
    errors.push(...globalCatalogueProblems);
    checks.catalogueAndCountsRecomputed =
      globalCatalogueProblems.length === 0 &&
      manifest.germOccurrenceCount === aggregate.germOccurrenceCount &&
      manifest.identicallyZeroGermCount ===
        aggregate.identicallyZeroGermCount &&
      manifest.normalCount === aggregate.normalCatalogue.length &&
      canonicalSha256(manifest.normalCatalogue) ===
        canonicalSha256(aggregate.normalCatalogue) &&
      manifest.normalCatalogueDigest === aggregate.normalCatalogueDigest;
    if (!checks.catalogueAndCountsRecomputed) {
      errors.push("The aggregate normal catalogue or germ counts are invalid.");
    }

    const expectedCoverage = coverageFor(manifest.nextPoint, manifest.degree);
    checks.adjacencyAndLinkNonClaimsExplicit =
      canonicalSha256(manifest.coverage) === canonicalSha256(expectedCoverage);
    if (!checks.adjacencyAndLinkNonClaimsExplicit) {
      errors.push("The adjacency/link non-claims are missing or altered.");
    }
    checks.completionClaimValid = isArtifact
      ? manifest.nextPoint === manifest.degree &&
        manifest.coverage.pointCoverage === "all-quotient-points"
      : manifest.coverage.pointCoverage ===
        (manifest.nextPoint === manifest.degree
          ? "all-quotient-points"
          : "contiguous-prefix");
    if (!checks.completionClaimValid) {
      errors.push("The final/prefix point-coverage claim is invalid.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const uniqueErrors = [...new Set(errors)].sort();
  const passed =
    uniqueErrors.length === 0 && Object.values(checks).every(Boolean);
  return {
    status: passed ? "passed" : "failed",
    checks,
    ...(rebuiltDigest ? { rebuiltDigest } : {}),
    ...(rebuiltChunkManifestDigest ? { rebuiltChunkManifestDigest } : {}),
    ...(rebuiltNormalCatalogueDigest ? { rebuiltNormalCatalogueDigest } : {}),
    errors: uniqueErrors,
  };
}

function atomicWriteJson(
  path: string,
  value: unknown,
  maxCheckpointBytes: number,
): void {
  if (path.length === 0) throw new Error("A checkpoint path is required.");
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const serialized = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > maxCheckpointBytes) {
    throw new Error(
      `The rank-19 catalogue checkpoint exceeds ${maxCheckpointBytes} bytes.`,
    );
  }
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, serialized, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The rename may already have committed the temporary file.
    }
    throw error;
  }
}

function loadCheckpoint(
  path: string,
  expectedBinding: StreamedRank19GlobalCatalogueBinding,
  chunkSize: number,
  maxCheckpointBytes: number,
): StreamedRank19GlobalNormalCheckpoint | undefined {
  if (!existsSync(path)) return undefined;
  const metadata = statSync(path);
  if (!metadata.isFile()) {
    throw new Error("The rank-19 catalogue checkpoint is not a regular file.");
  }
  if (metadata.size > maxCheckpointBytes) {
    throw new Error(
      `The rank-19 catalogue checkpoint exceeds ${maxCheckpointBytes} bytes.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `The rank-19 catalogue checkpoint is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const replay = replayStreamedRank19GlobalNormalCatalogue(
    parsed,
    expectedBinding,
  );
  if (replay.status !== "passed") {
    throw new Error(
      `The rank-19 catalogue checkpoint failed replay: ${replay.errors.join(" ")}`,
    );
  }
  const checkpoint = parsed as StreamedRank19GlobalNormalCheckpoint;
  if (
    checkpoint.kind !== "streamed-rank-19-global-normal-catalogue-checkpoint" ||
    checkpoint.chunkSize !== chunkSize ||
    checkpoint.degree !== expectedBinding.source.degree
  ) {
    throw new Error(
      "The rank-19 catalogue checkpoint has another chunking/source domain.",
    );
  }
  return checkpoint;
}

function buildChunk(input: {
  options: RunStreamedRank19GlobalNormalCatalogueOptions;
  binding: StreamedRank19GlobalCatalogueBinding;
  chunkIndex: number;
  firstPoint: number;
  lastPointExclusive: number;
}): StreamedRank19GlobalNormalChunk {
  const points = Array.from(
    { length: input.lastPointExclusive - input.firstPoint },
    (_unused, index) => input.firstPoint + index,
  );
  const accumulator = createNormalAccumulator();
  const templateRecords: Array<[number, string]> = [];
  const streamReport = streamStreamedTrackBLinearLinkTemplates(
    {
      oracle: input.options.oracle,
      generalizedCompression: input.options.generalizedCompression,
      ...(input.options.generalizedCompressionReplayOptions
        ? {
            generalizedCompressionReplayOptions:
              input.options.generalizedCompressionReplayOptions,
          }
        : {}),
      cocycleBasis: input.options.cocycleBasis,
      points,
      includeAdjacency: false,
    },
    (template) => {
      const expectedPoint = input.firstPoint + templateRecords.length;
      if (template.point !== expectedPoint) {
        throw new Error(
          `The chunk stream emitted q${template.point}, expected q${expectedPoint}.`,
        );
      }
      accumulator.accept(template);
      templateRecords.push([template.point, template.templateDigest]);
    },
  );
  if (templateRecords.length !== points.length) {
    throw new Error(
      `Chunk ${input.chunkIndex} emitted ${templateRecords.length}/${points.length} templates: ${streamReport.errors.join(" ")}`,
    );
  }
  const catalogue = accumulator.finish();
  const chunk: StreamedRank19GlobalNormalChunk = {
    chunkIndex: input.chunkIndex,
    firstPoint: input.firstPoint,
    lastPointExclusive: input.lastPointExclusive,
    templateRecords,
    templateRecordDigest: canonicalSha256(templateRecords),
    streamReport,
    streamReportHash: streamReport.reportHash,
    germOccurrenceCount: catalogue.germOccurrenceCount,
    identicallyZeroGermCount: catalogue.identicallyZeroGermCount,
    normalCatalogue: catalogue.normalCatalogue,
    normalCatalogueDigest: catalogue.normalCatalogueDigest,
    chunkDigest: "",
  };
  chunk.chunkDigest = computeStreamedRank19GlobalNormalChunkDigest(chunk);
  const problems = chunkErrors(chunk, input.binding);
  if (problems.length > 0) {
    throw new Error(
      `Chunk ${input.chunkIndex} failed exact replay: ${problems.join(" ")}`,
    );
  }
  return chunk;
}

/**
 * Regenerate every stored point interval from the supplied exact action,
 * compression, and integral cocycle section. The ordinary replay above proves
 * that an artifact is internally content-addressed; this replay additionally
 * proves that its template records, normals, and counts are the output of the
 * current exact source pipeline.
 */
export function replayStreamedRank19GlobalNormalCatalogueAgainstExactInputs(
  stored: unknown,
  options: ReplayStreamedRank19GlobalNormalAgainstExactInputsOptions,
): StreamedRank19GlobalNormalExactReplay {
  let catalogueReplay = replayStreamedRank19GlobalNormalCatalogue(stored);
  const checks: StreamedRank19GlobalNormalExactReplay["checks"] = {
    storedCatalogueReplayPassed: catalogueReplay.status === "passed",
    freshMathematicalBindingMatches: false,
    everyChunkRegenerated: false,
    everyRegeneratedChunkMatchesStored: false,
  };
  const errors = [...catalogueReplay.errors];
  let chunkCount = 0;
  let regeneratedChunkCount = 0;
  let regeneratedChunkSequenceDigest: string | undefined;
  let storedCompletionCertificateDigest: string | undefined;
  let freshCompletionCertificateDigest: string | undefined;
  let mathematicalBindingDigest: string | undefined;

  try {
    if (catalogueReplay.status !== "passed") {
      throw new Error(
        "The stored global-normal catalogue failed internal replay before exact regeneration.",
      );
    }
    const artifact = stored as StreamedRank19GlobalNormalArtifact;
    if (
      artifact.kind !== "streamed-rank-19-global-normal-catalogue" ||
      artifact.status !== "completed"
    ) {
      throw new Error(
        "Exact regeneration requires a completed global-normal artifact.",
      );
    }
    chunkCount = artifact.chunks.length;

    const runOptions: RunStreamedRank19GlobalNormalCatalogueOptions = {
      oracle: options.oracle,
      generalizedCompression: options.generalizedCompression,
      ...(options.generalizedCompressionReplayOptions
        ? {
            generalizedCompressionReplayOptions:
              options.generalizedCompressionReplayOptions,
          }
        : {}),
      cocycleBasis: options.cocycleBasis,
      h1Certificate: options.h1Certificate,
      checkpointPath: "unused-by-exact-global-catalogue-replay",
      chunkSize: artifact.chunkSize,
      allowSmallChunksForTesting: true,
    };
    const freshBinding = buildStreamedRank19GlobalCatalogueBinding(runOptions);
    const storedMathematicalBindingDigest =
      computeStreamedRank19GlobalCatalogueMathematicalBindingDigest(
        artifact.binding,
      );
    const freshMathematicalBindingDigest =
      computeStreamedRank19GlobalCatalogueMathematicalBindingDigest(
        freshBinding,
      );
    storedCompletionCertificateDigest = artifact.binding.h1.certificateDigest;
    freshCompletionCertificateDigest = freshBinding.h1.certificateDigest;
    mathematicalBindingDigest = freshMathematicalBindingDigest;
    checks.freshMathematicalBindingMatches =
      storedMathematicalBindingDigest === freshMathematicalBindingDigest;
    if (!checks.freshMathematicalBindingMatches) {
      throw new Error(
        "The archived catalogue and supplied exact inputs have different mathematical bindings.",
      );
    }

    // The archived completion hash is provenance and may differ after a
    // provenance-only certificate reseal. All mathematical H1 fields above must
    // still agree before any chunk is accepted.
    catalogueReplay = replayStreamedRank19GlobalNormalCatalogue(stored);
    checks.storedCatalogueReplayPassed = catalogueReplay.status === "passed";
    if (!checks.storedCatalogueReplayPassed) {
      throw new Error(
        "The stored catalogue changed during exact regeneration setup.",
      );
    }

    const regeneratedChunkDigests: string[] = [];
    let everyMatch = true;
    for (const storedChunk of artifact.chunks) {
      const regenerated = buildChunk({
        options: runOptions,
        binding: freshBinding,
        chunkIndex: storedChunk.chunkIndex,
        firstPoint: storedChunk.firstPoint,
        lastPointExclusive: storedChunk.lastPointExclusive,
      });
      regeneratedChunkCount += 1;
      regeneratedChunkDigests.push(regenerated.chunkDigest);
      if (canonicalSha256(regenerated) !== canonicalSha256(storedChunk)) {
        everyMatch = false;
        errors.push(
          `Freshly regenerated chunk ${storedChunk.chunkIndex} differs from the archived chunk.`,
        );
        break;
      }
      options.onChunkReplayed?.({
        chunkIndex: storedChunk.chunkIndex,
        chunkCount,
        firstPoint: storedChunk.firstPoint,
        lastPointExclusive: storedChunk.lastPointExclusive,
      });
    }
    checks.everyChunkRegenerated = regeneratedChunkCount === chunkCount;
    checks.everyRegeneratedChunkMatchesStored =
      everyMatch && checks.everyChunkRegenerated;
    regeneratedChunkSequenceDigest = canonicalSha256({
      schemaVersion: 1,
      method: "fresh-exact-global-normal-chunk-sequence",
      chunkDigests: regeneratedChunkDigests,
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const uniqueErrors = [...new Set(errors)].sort();
  const passed =
    uniqueErrors.length === 0 && Object.values(checks).every(Boolean);
  return {
    status: passed ? "passed" : "failed",
    checks,
    chunkCount,
    regeneratedChunkCount,
    ...(regeneratedChunkSequenceDigest
      ? { regeneratedChunkSequenceDigest }
      : {}),
    ...(storedCompletionCertificateDigest
      ? { storedCompletionCertificateDigest }
      : {}),
    ...(freshCompletionCertificateDigest
      ? { freshCompletionCertificateDigest }
      : {}),
    ...(mathematicalBindingDigest ? { mathematicalBindingDigest } : {}),
    catalogueReplay,
    errors: uniqueErrors,
  };
}

/**
 * Build or resume the exhaustive rank-19 linear-normal catalogue.
 *
 * Every chunk is a separate exact template-stream request. Its complete report
 * is checked before an atomic checkpoint replacement. No adjacency data is
 * requested or retained by this calculation.
 */
export function runStreamedRank19GlobalNormalCatalogue(
  options: RunStreamedRank19GlobalNormalCatalogueOptions,
): RunStreamedRank19GlobalNormalCatalogueResult {
  requirePositiveSafeInteger(options.chunkSize, "chunkSize");
  const maxCheckpointBytes =
    options.maxCheckpointBytes ?? DEFAULT_MAX_CHECKPOINT_BYTES;
  requirePositiveSafeInteger(maxCheckpointBytes, "maxCheckpointBytes");
  if (
    options.chunkSize < MINIMUM_PRODUCTION_CHUNK_SIZE &&
    options.allowSmallChunksForTesting !== true
  ) {
    throw new Error(
      `Production rank-19 catalogue chunks must contain at least ${MINIMUM_PRODUCTION_CHUNK_SIZE} points because every chunk repeats exact source/cocycle replay.`,
    );
  }
  if (options.maxChunksThisRun !== undefined) {
    requirePositiveSafeInteger(options.maxChunksThisRun, "maxChunksThisRun");
  }
  if (options.checkpointPath.length === 0) {
    throw new Error("A rank-19 catalogue checkpoint path is required.");
  }

  // This replay occurs even for a completed checkpoint. A stale checkpoint is
  // never promoted merely because its own self-digest is internally valid.
  const binding = buildStreamedRank19GlobalCatalogueBinding(options);
  const resumed = loadCheckpoint(
    options.checkpointPath,
    binding,
    options.chunkSize,
    maxCheckpointBytes,
  );
  const chunks = resumed
    ? resumed.chunks.map((chunk) => structuredClone(chunk))
    : [];
  let nextPoint = resumed?.nextPoint ?? 0;
  let chunksThisRun = 0;

  while (nextPoint < options.oracle.degree) {
    if (
      options.maxChunksThisRun !== undefined &&
      chunksThisRun >= options.maxChunksThisRun
    ) {
      const checkpoint = buildCheckpoint({
        binding,
        chunkSize: options.chunkSize,
        chunks,
      });
      return { status: "checkpointed", checkpoint };
    }
    const lastPointExclusive = Math.min(
      options.oracle.degree,
      nextPoint + options.chunkSize,
    );
    const chunk = buildChunk({
      options,
      binding,
      chunkIndex: chunks.length,
      firstPoint: nextPoint,
      lastPointExclusive,
    });
    chunks.push(chunk);
    nextPoint = lastPointExclusive;
    chunksThisRun += 1;

    const checkpoint = buildCheckpoint({
      binding,
      chunkSize: options.chunkSize,
      chunks,
    });
    const replay = replayStreamedRank19GlobalNormalCatalogue(
      checkpoint,
      binding,
    );
    if (replay.status !== "passed") {
      throw new Error(
        `Refusing to persist an invalid rank-19 checkpoint: ${replay.errors.join(" ")}`,
      );
    }
    atomicWriteJson(options.checkpointPath, checkpoint, maxCheckpointBytes);
    options.onCheckpoint?.(structuredClone(checkpoint));
  }

  const checkpoint = buildCheckpoint({
    binding,
    chunkSize: options.chunkSize,
    chunks,
  });
  const artifact = buildArtifact(checkpoint);
  const replay = replayStreamedRank19GlobalNormalCatalogue(artifact, binding);
  if (replay.status !== "passed") {
    throw new Error(
      `The final rank-19 normal catalogue failed replay: ${replay.errors.join(" ")}`,
    );
  }
  return { status: "completed", artifact };
}
