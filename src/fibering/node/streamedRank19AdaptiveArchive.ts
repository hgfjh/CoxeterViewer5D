import { createHash } from "node:crypto";

import { canonicalizeJson, canonicalSha256 } from "../../utils/canonicalSha256";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
export const STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES = 256 * 1024 * 1024;
export const STREAMED_RANK19_ADAPTIVE_MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

export type StreamedRank19AdaptiveTerminalStatus =
  | "invariant-obstruction-cover"
  | "global-passing-witness";

export interface StreamedRank19AdaptiveArchiveSummary {
  artifactDigest: string;
  runnerDigest: string;
  reportDigest: string;
  terminalStatus: StreamedRank19AdaptiveTerminalStatus;
  degree: number;
  rank: 19;
  sourceHash: string;
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  generalizedCompressionArchiveHash: string;
  h1CertificateDigest: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  heightRuleDigest: string;
  searchResultDigest: string;
  templateRecordDigest: string;
  templateBatchDigest: string;
  polarityTransportDigest: string;
  selectedPointCount: number;
  selectedPointDigest: string;
  iterationCount: number;
  templateRecordCount: number;
  templateBatchCount: number;
  terminalObjectDigest: string;
}

export interface StreamedRank19AdaptiveTerminalEnvelopeReplay {
  status: "passed" | "failed";
  checks: {
    artifactEnvelopeValid: boolean;
    storedArtifactDigestValid: boolean;
    reportEnvelopeValid: boolean;
    storedReportDigestValid: boolean;
    terminalStatusValid: boolean;
    terminalObjectShapeValid: boolean;
    summaryFieldsValid: boolean;
    exactSchemaValid: boolean;
  };
  canonicalPayload?: {
    byteLength: number;
    sha256: string;
  };
  summary?: StreamedRank19AdaptiveArchiveSummary;
  errors: string[];
}

export interface StreamedRank19AdaptiveArchiveManifest {
  schemaVersion: 1;
  kind: "streamed-rank19-adaptive-track-b-archive";
  archive: {
    path: string;
    encoding: "gzip-canonical-json";
    byteLength: number;
    sha256: string;
  };
  decoded: {
    byteLength: number;
    sha256: string;
  } & StreamedRank19AdaptiveArchiveSummary;
  structuralReplayChecks: StreamedRank19AdaptiveTerminalEnvelopeReplay["checks"];
  replayBounds: {
    maximumArchiveByteLength: number;
    maximumDecodedByteLength: number;
  };
  compression: {
    method: "node-zlib-gzip-level-9-canonical-json-header-v1";
    nodeVersion: string;
    zlibVersion: string;
  };
  manifestDigest: string;
}

export interface StreamedRank19AdaptiveArchiveManifestReplay {
  status: "passed" | "failed";
  checks: {
    manifestEnvelopeValid: boolean;
    gzipMagicValid: boolean;
    canonicalGzipHeaderValid: boolean;
    boundedLengthsValid: boolean;
    decodedCanonicalJsonValid: boolean;
    terminalEnvelopeReplayPassed: boolean;
    compressionProvenanceValid: boolean;
    exactManifestMatches: boolean;
  };
  expectedManifest?: StreamedRank19AdaptiveArchiveManifest;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  return (
    actual.length === canonicalExpected.length &&
    actual.every((key, index) => key === canonicalExpected[index])
  );
}

function canonicalPointIds(value: unknown, degree: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (point, index) =>
        Number.isSafeInteger(point) &&
        point >= 0 &&
        point < degree &&
        (index === 0 || point > value[index - 1]),
    )
  );
}

/**
 * Check the self-contained terminal envelope before archival. Exact source,
 * cone, template, and link replay remains the finalizer's responsibility.
 */
export function replayStreamedRank19AdaptiveTerminalEnvelope(
  stored: unknown,
): StreamedRank19AdaptiveTerminalEnvelopeReplay {
  const checks: StreamedRank19AdaptiveTerminalEnvelopeReplay["checks"] = {
    artifactEnvelopeValid: false,
    storedArtifactDigestValid: false,
    reportEnvelopeValid: false,
    storedReportDigestValid: false,
    terminalStatusValid: false,
    terminalObjectShapeValid: false,
    summaryFieldsValid: false,
    exactSchemaValid: false,
  };
  const errors: string[] = [];
  let summary: StreamedRank19AdaptiveArchiveSummary | undefined;
  let canonicalPayload:
    | {
        byteLength: number;
        sha256: string;
      }
    | undefined;

  try {
    if (!isObject(stored)) {
      throw new Error("The adaptive runner artifact is not an object.");
    }
    const canonicalBytes = new TextEncoder().encode(
      `${canonicalizeJson(stored)}\n`,
    );
    canonicalPayload = {
      byteLength: canonicalBytes.byteLength,
      sha256: sha256(canonicalBytes),
    };
    const report = isObject(stored.report) ? stored.report : undefined;
    checks.artifactEnvelopeValid =
      stored.schemaVersion === 1 &&
      stored.kind === "compact-5-cube-rank19-adaptive-runner-artifact" &&
      report !== undefined &&
      Object.hasOwn(stored, "runner") &&
      isDigest(stored.artifactDigest);
    if (!checks.artifactEnvelopeValid || report === undefined) {
      throw new Error("The adaptive runner artifact has the wrong envelope.");
    }
    checks.storedArtifactDigestValid =
      stored.artifactDigest ===
      canonicalSha256({ ...stored, artifactDigest: "" });
    if (!checks.storedArtifactDigestValid) {
      errors.push("The adaptive runner artifact digest is invalid.");
    }

    const search = isObject(report.search) ? report.search : undefined;
    const source = isObject(report.source) ? report.source : undefined;
    const polarity = isObject(report.polarityCertification)
      ? report.polarityCertification
      : undefined;
    const reportChecks = isObject(report.checks) ? report.checks : undefined;
    const templateStreaming = isObject(report.templateStreaming)
      ? report.templateStreaming
      : undefined;
    checks.reportEnvelopeValid =
      report.schemaVersion === 3 &&
      report.kind ===
        "compact-5-cube-rank19-adaptive-obstruction-point-search" &&
      report.method ===
        "exact-provisional-witness-separation-with-source-bound-templates" &&
      isDigest(report.reportDigest) &&
      search?.schemaVersion === 2 &&
      search.kind === "adaptive-streamed-height-obstruction-point-search" &&
      search.method ===
        "first-survivor-depth-first-point-separation-and-exhaustive-terminal-cover" &&
      source !== undefined &&
      polarity !== undefined &&
      reportChecks !== undefined &&
      templateStreaming !== undefined;
    if (
      !checks.reportEnvelopeValid ||
      search === undefined ||
      source === undefined ||
      polarity === undefined ||
      reportChecks === undefined ||
      templateStreaming === undefined
    ) {
      throw new Error("The adaptive report has the wrong envelope.");
    }

    const exactArtifactSchema = hasExactKeys(stored, [
      "schemaVersion",
      "kind",
      "report",
      "runner",
      "artifactDigest",
    ]);
    const exactReportSchema = hasExactKeys(report, [
      "schemaVersion",
      "kind",
      "status",
      "method",
      "source",
      "h1CertificateDigest",
      "templateRecords",
      "templateRecordDigest",
      "templateStreaming",
      "search",
      "polarityCertification",
      "checks",
      "claims",
      "nonClaims",
      "reportDigest",
    ]);
    const exactSourceSchema = hasExactKeys(source, [
      "oracleStructureHash",
      "actionRowsCanonicalSha256",
      "generalizedCompressionArchiveHash",
      "degree",
      "sourceHash",
      "latticeBasisDigest",
      "cocycleSectionDigest",
      "heightRuleDigest",
    ]);
    const exactStreamingSchema = hasExactKeys(templateStreaming, [
      "method",
      "preparationCount",
      "streamInvocationCount",
      "streamedPointCount",
      "batches",
      "batchDigest",
    ]);
    const exactSearchSchema = hasExactKeys(search, [
      "schemaVersion",
      "kind",
      "status",
      "method",
      "sourceHash",
      "sigma",
      "rank",
      "ambientPointCount",
      "initialPointIds",
      "selectedPointIds",
      "iterations",
      "finalCover",
      "globalPassingWitness",
      "resultDigest",
    ]);
    const exactChecksSchema = hasExactKeys(reportChecks, [
      "negativeFinalObjectReplayed",
      "positiveAntipodeReplayed",
      "explicitPolarityTransportBound",
    ]);
    checks.exactSchemaValid =
      exactArtifactSchema &&
      exactReportSchema &&
      exactSourceSchema &&
      exactStreamingSchema &&
      exactSearchSchema &&
      exactChecksSchema &&
      Array.isArray(report.templateRecords) &&
      report.templateRecords.every(
        (record) =>
          isObject(record) &&
          hasExactKeys(record, [
            "point",
            "templateDigest",
            "topologyDigest",
            "germCount",
            "linkEdgeCount",
          ]),
      ) &&
      Array.isArray(templateStreaming.batches) &&
      templateStreaming.batches.every(
        (batch) =>
          isObject(batch) &&
          hasExactKeys(batch, [
            "batchIndex",
            "purpose",
            "requestedPointIds",
            "checkedPointIdsDigest",
            "stream",
            "batchDigest",
          ]),
      ) &&
      Array.isArray(report.claims) &&
      report.claims.every((claim) => typeof claim === "string") &&
      Array.isArray(report.nonClaims) &&
      report.nonClaims.every((claim) => typeof claim === "string");
    if (!checks.exactSchemaValid) {
      errors.push("The adaptive artifact has fields outside its exact schema.");
    }
    checks.storedReportDigestValid =
      report.reportDigest === canonicalSha256({ ...report, reportDigest: "" });
    if (!checks.storedReportDigestValid) {
      errors.push("The adaptive report digest is invalid.");
    }

    const terminalStatus = report.status;
    checks.terminalStatusValid =
      (terminalStatus === "invariant-obstruction-cover" ||
        terminalStatus === "global-passing-witness") &&
      search.status === terminalStatus;
    if (!checks.terminalStatusValid) {
      errors.push("The adaptive artifact is not terminal.");
    }

    const commonTerminalChecks =
      reportChecks.negativeFinalObjectReplayed === true &&
      reportChecks.positiveAntipodeReplayed === true &&
      reportChecks.explicitPolarityTransportBound === true &&
      Array.isArray(search.iterations) &&
      search.iterations.length > 0;
    const globalPassingWitness = isObject(search.globalPassingWitness)
      ? search.globalPassingWitness
      : undefined;
    const negativeWitness = isObject(polarity.negativeWitness)
      ? polarity.negativeWitness
      : undefined;
    const positiveWitness = isObject(polarity.positiveWitness)
      ? polarity.positiveWitness
      : undefined;
    const exactPolaritySchema =
      terminalStatus === "invariant-obstruction-cover"
        ? hasExactKeys(polarity, [
            "kind",
            "negativeReplay",
            "positiveCover",
            "positiveReplay",
            "transportDigest",
          ])
        : terminalStatus === "global-passing-witness" &&
          hasExactKeys(polarity, [
            "kind",
            "negativeWitness",
            "positiveWitness",
            "transportDigest",
          ]);
    const witnessCertificateShapeValid = (
      witness: Record<string, unknown> | undefined,
      sigma: -1 | 1,
    ): boolean =>
      witness !== undefined &&
      hasExactKeys(witness, [
        "schemaVersion",
        "kind",
        "sigma",
        "sourceHash",
        "latticeBasisDigest",
        "cocycleSectionDigest",
        "heightRuleDigest",
        "degree",
        "primitiveWitness",
        "checkedPointCount",
        "pointResultDigest",
        "witnessEvaluationDigest",
        "certificateDigest",
      ]) &&
      witness.schemaVersion === 1 &&
      witness.kind === "streamed-rank19-all-point-witness-certificate" &&
      witness.sigma === sigma &&
      witness.sourceHash === source.sourceHash &&
      witness.latticeBasisDigest === source.latticeBasisDigest &&
      witness.cocycleSectionDigest === source.cocycleSectionDigest &&
      witness.heightRuleDigest === source.heightRuleDigest &&
      witness.degree === source.degree &&
      witness.checkedPointCount === source.degree &&
      Array.isArray(witness.primitiveWitness) &&
      witness.primitiveWitness.length === 19 &&
      witness.primitiveWitness.every(
        (coordinate) =>
          typeof coordinate === "string" && /^-?\d+$/u.test(coordinate),
      ) &&
      isDigest(witness.pointResultDigest) &&
      isDigest(witness.witnessEvaluationDigest) &&
      isDigest(witness.certificateDigest);
    checks.terminalObjectShapeValid =
      commonTerminalChecks &&
      exactPolaritySchema &&
      (terminalStatus === "invariant-obstruction-cover"
        ? isObject(search.finalCover) &&
          search.globalPassingWitness === null &&
          polarity.kind === "explicit-antipodal-obstruction-cover"
        : terminalStatus === "global-passing-witness" &&
          search.finalCover === null &&
          globalPassingWitness !== undefined &&
          hasExactKeys(globalPassingWitness, [
            "primitiveWitness",
            "checkedPointCount",
            "pointResultDigest",
            "witnessHash",
          ]) &&
          typeof source.degree === "number" &&
          globalPassingWitness.checkedPointCount === source.degree &&
          polarity.kind === "explicit-all-point-antipodal-witnesses" &&
          witnessCertificateShapeValid(negativeWitness, -1) &&
          witnessCertificateShapeValid(positiveWitness, 1));
    if (!checks.terminalObjectShapeValid) {
      errors.push("The adaptive terminal object has the wrong shape.");
    }

    const degree = source.degree;
    const selectedPointIds = search.selectedPointIds;
    const templateRecords = report.templateRecords;
    const batches = templateStreaming.batches;
    checks.summaryFieldsValid =
      typeof degree === "number" &&
      Number.isSafeInteger(degree) &&
      degree > 0 &&
      search.rank === 19 &&
      search.ambientPointCount === degree &&
      search.sourceHash === source.sourceHash &&
      canonicalPointIds(selectedPointIds, degree) &&
      isDigest(source.sourceHash) &&
      isDigest(source.oracleStructureHash) &&
      isDigest(source.actionRowsCanonicalSha256) &&
      isDigest(source.generalizedCompressionArchiveHash) &&
      isDigest(report.h1CertificateDigest) &&
      isDigest(source.latticeBasisDigest) &&
      isDigest(source.cocycleSectionDigest) &&
      isDigest(source.heightRuleDigest) &&
      isDigest(search.resultDigest) &&
      isDigest(report.templateRecordDigest) &&
      isDigest(templateStreaming.batchDigest) &&
      isDigest(polarity.transportDigest) &&
      Array.isArray(templateRecords) &&
      templateRecords.length > 0 &&
      Array.isArray(batches) &&
      batches.length > 0;
    if (!checks.summaryFieldsValid) {
      errors.push("The adaptive archive summary fields are invalid.");
    } else if (checks.terminalStatusValid) {
      summary = {
        artifactDigest: stored.artifactDigest as string,
        runnerDigest: canonicalSha256(stored.runner),
        reportDigest: report.reportDigest as string,
        terminalStatus: terminalStatus as StreamedRank19AdaptiveTerminalStatus,
        degree: degree as number,
        rank: 19,
        sourceHash: source.sourceHash as string,
        oracleStructureHash: source.oracleStructureHash as string,
        actionRowsCanonicalSha256: source.actionRowsCanonicalSha256 as string,
        generalizedCompressionArchiveHash:
          source.generalizedCompressionArchiveHash as string,
        h1CertificateDigest: report.h1CertificateDigest as string,
        latticeBasisDigest: source.latticeBasisDigest as string,
        cocycleSectionDigest: source.cocycleSectionDigest as string,
        heightRuleDigest: source.heightRuleDigest as string,
        searchResultDigest: search.resultDigest as string,
        templateRecordDigest: report.templateRecordDigest as string,
        templateBatchDigest: templateStreaming.batchDigest as string,
        polarityTransportDigest: polarity.transportDigest as string,
        selectedPointCount: (selectedPointIds as number[]).length,
        selectedPointDigest: canonicalSha256(selectedPointIds as number[]),
        iterationCount: (search.iterations as unknown[]).length,
        templateRecordCount: (templateRecords as unknown[]).length,
        templateBatchCount: (batches as unknown[]).length,
        terminalObjectDigest: canonicalSha256(
          terminalStatus === "invariant-obstruction-cover"
            ? search.finalCover
            : search.globalPassingWitness,
        ),
      };
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
    ...(canonicalPayload ? { canonicalPayload } : {}),
    ...(summary ? { summary } : {}),
    errors: uniqueErrors,
  };
}

export function sealStreamedRank19AdaptiveArchiveManifest(input: {
  archivePath: string;
  archiveBytes: Uint8Array;
  decodedBytes: Uint8Array;
  terminalReplay: StreamedRank19AdaptiveTerminalEnvelopeReplay;
  nodeVersion: string;
  zlibVersion: string;
}): StreamedRank19AdaptiveArchiveManifest {
  if (
    input.terminalReplay.status !== "passed" ||
    !input.terminalReplay.summary
  ) {
    throw new Error("A failed adaptive terminal replay cannot be archived.");
  }
  if (input.nodeVersion.length === 0 || input.zlibVersion.length === 0) {
    throw new Error("Compression provenance versions must be nonempty.");
  }
  if (
    input.archiveBytes.byteLength >
      STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES ||
    input.decodedBytes.byteLength > STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES
  ) {
    throw new Error("The adaptive archive exceeds its recorded replay bounds.");
  }
  if (
    input.terminalReplay.canonicalPayload?.byteLength !==
      input.decodedBytes.byteLength ||
    input.terminalReplay.canonicalPayload.sha256 !== sha256(input.decodedBytes)
  ) {
    throw new Error("The adaptive archive payload is not canonical JSON.");
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "streamed-rank19-adaptive-track-b-archive" as const,
    archive: {
      path: input.archivePath,
      encoding: "gzip-canonical-json" as const,
      byteLength: input.archiveBytes.byteLength,
      sha256: sha256(input.archiveBytes),
    },
    decoded: {
      byteLength: input.decodedBytes.byteLength,
      sha256: sha256(input.decodedBytes),
      ...input.terminalReplay.summary,
    },
    structuralReplayChecks: input.terminalReplay.checks,
    replayBounds: {
      maximumArchiveByteLength: STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES,
      maximumDecodedByteLength: STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES,
    },
    compression: {
      method: "node-zlib-gzip-level-9-canonical-json-header-v1" as const,
      nodeVersion: input.nodeVersion,
      zlibVersion: input.zlibVersion,
    },
    manifestDigest: "",
  };
  return {
    ...withoutDigest,
    manifestDigest: canonicalSha256(withoutDigest),
  };
}

export function replayStreamedRank19AdaptiveArchiveManifest(
  stored: unknown,
  input: {
    archivePath: string;
    archiveBytes: Uint8Array;
    decodedBytes: Uint8Array;
    terminalReplay: StreamedRank19AdaptiveTerminalEnvelopeReplay;
  },
): StreamedRank19AdaptiveArchiveManifestReplay {
  const checks: StreamedRank19AdaptiveArchiveManifestReplay["checks"] = {
    manifestEnvelopeValid: false,
    gzipMagicValid: false,
    canonicalGzipHeaderValid: false,
    boundedLengthsValid: false,
    decodedCanonicalJsonValid: false,
    terminalEnvelopeReplayPassed: input.terminalReplay.status === "passed",
    compressionProvenanceValid: false,
    exactManifestMatches: false,
  };
  const errors: string[] = [];
  let expectedManifest: StreamedRank19AdaptiveArchiveManifest | undefined;
  try {
    if (!isObject(stored)) {
      throw new Error("The adaptive archive manifest is not an object.");
    }
    const compression = isObject(stored.compression)
      ? stored.compression
      : undefined;
    checks.manifestEnvelopeValid =
      stored.schemaVersion === 1 &&
      stored.kind === "streamed-rank19-adaptive-track-b-archive" &&
      isObject(stored.archive) &&
      isObject(stored.decoded) &&
      isObject(stored.structuralReplayChecks) &&
      isObject(stored.replayBounds) &&
      compression !== undefined &&
      isDigest(stored.manifestDigest);
    if (!checks.manifestEnvelopeValid || compression === undefined) {
      throw new Error("The adaptive archive manifest has the wrong envelope.");
    }
    checks.gzipMagicValid =
      input.archiveBytes[0] === 0x1f && input.archiveBytes[1] === 0x8b;
    if (!checks.gzipMagicValid) {
      errors.push("The adaptive archive does not have gzip magic.");
    }
    checks.canonicalGzipHeaderValid =
      input.archiveBytes.byteLength >= 18 &&
      input.archiveBytes[0] === 0x1f &&
      input.archiveBytes[1] === 0x8b &&
      input.archiveBytes[2] === 0x08 &&
      input.archiveBytes[3] === 0x00 &&
      input.archiveBytes[4] === 0x00 &&
      input.archiveBytes[5] === 0x00 &&
      input.archiveBytes[6] === 0x00 &&
      input.archiveBytes[7] === 0x00 &&
      input.archiveBytes[8] === 0x02 &&
      input.archiveBytes[9] === 0xff;
    if (!checks.canonicalGzipHeaderValid) {
      errors.push("The adaptive archive gzip header is not canonical v1.");
    }
    checks.boundedLengthsValid =
      input.archiveBytes.byteLength <=
        STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES &&
      input.decodedBytes.byteLength <=
        STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES;
    if (!checks.boundedLengthsValid) {
      errors.push("The adaptive archive exceeds its replay bounds.");
    }
    checks.decodedCanonicalJsonValid =
      input.terminalReplay.canonicalPayload?.byteLength ===
        input.decodedBytes.byteLength &&
      input.terminalReplay.canonicalPayload.sha256 ===
        sha256(input.decodedBytes);
    if (!checks.decodedCanonicalJsonValid) {
      errors.push("The decoded adaptive payload is not canonical JSON.");
    }
    checks.compressionProvenanceValid =
      compression.method ===
        "node-zlib-gzip-level-9-canonical-json-header-v1" &&
      typeof compression.nodeVersion === "string" &&
      compression.nodeVersion.length > 0 &&
      typeof compression.zlibVersion === "string" &&
      compression.zlibVersion.length > 0;
    if (!checks.compressionProvenanceValid) {
      errors.push("The adaptive compression provenance is invalid.");
    }
    if (!checks.terminalEnvelopeReplayPassed) {
      errors.push("The decoded adaptive terminal envelope failed replay.");
    }
    if (
      checks.compressionProvenanceValid &&
      checks.terminalEnvelopeReplayPassed
    ) {
      expectedManifest = sealStreamedRank19AdaptiveArchiveManifest({
        ...input,
        nodeVersion: compression.nodeVersion as string,
        zlibVersion: compression.zlibVersion as string,
      });
      checks.exactManifestMatches =
        canonicalSha256(stored) === canonicalSha256(expectedManifest);
      if (!checks.exactManifestMatches) {
        errors.push(
          "The adaptive archive manifest differs from the exact replayed manifest.",
        );
      }
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
    ...(expectedManifest ? { expectedManifest } : {}),
    errors: uniqueErrors,
  };
}
