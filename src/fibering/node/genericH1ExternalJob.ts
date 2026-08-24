import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { parseCoxeterSystemInput } from "../../coxeter";
import {
  prepareGenericStreamedH1,
  computeGenericStreamedH1PreparationDigest,
  type GenericStreamedH1Preparation,
} from "../genericStreamedH1Preparation";
import { scalableGenericActionH1SourceBindings } from "../scalableGenericActionH1";
import { buildStreamedLawfulDavisOracle } from "../streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../../torsionFree";
import { canonicalSha256, canonicalizeJson } from "../../utils/canonicalSha256";

const JOB_ALGORITHM_VERSION =
  "bounded-action-replay-canonical-linbox-export-v1" as const;

export const GENERIC_H1_EXTERNAL_JOB_FILES = {
  preparation: "preparation.json",
  matrix: "boundary.linbox",
  torsionFreeCertificate: "torsion-free-certificate.json",
  manifest: "manifest.json",
} as const;

export interface GenericH1ExternalJobLimits {
  maxSystemInputBytes?: number;
  maxActionInputBytes?: number;
  maxMatrixOutputBytes?: number;
  matrixWriteBatchBytes?: number;
  maxRankForExhaustiveEnumeration?: number;
  maxSubsetsToCheck?: number;
  maxSphericalSubgroupElements?: number;
  maxWitnesses?: number;
}

interface ResolvedGenericH1ExternalJobLimits {
  maxSystemInputBytes: number;
  maxActionInputBytes: number;
  maxMatrixOutputBytes: number;
  matrixWriteBatchBytes: number;
  maxRankForExhaustiveEnumeration: number;
  maxSubsetsToCheck: number;
  maxSphericalSubgroupElements: number;
  maxWitnesses: number;
}

export interface GenericH1ExternalJobArtifactRecord {
  path: string;
  byteCount: number;
  sha256: string;
  mediaType: "application/json" | "text/x-linbox-sparse-row";
}

export interface GenericH1ExternalJobManifest {
  schemaVersion: 1;
  kind: "generic-integral-h1-external-job";
  status: "prepared";
  method: "independent-torsion-replay-plus-streamed-tree-gauge-export";
  algorithmVersion: typeof JOB_ALGORITHM_VERSION;
  limits: ResolvedGenericH1ExternalJobLimits;
  source: {
    actionInputContainer: "raw-candidate" | "candidate-wrapper";
    suppliedWrapperCertificateIgnored: boolean;
    systemArtifactByteCount: number;
    systemArtifactSha256: string;
    actionArtifactByteCount: number;
    actionArtifactSha256: string;
    systemCanonicalSha256: string;
    actionRowsCanonicalSha256: string;
    torsionFreeCertificateCanonicalSha256: string;
  };
  torsionFree: {
    status: "passed";
    candidateId: string;
    degree: number;
    sphericalPlanStatus: "complete";
    checkedSubsetCount: number;
    sphericalSubgroupCount: number;
    sphericalPlanCanonicalSha256: string;
    certificateCanonicalSha256: string;
  };
  quotient: {
    generatorCount: number;
    geometricEdgeCount: number;
    rankTwoCellCount: number;
    wallCount: number;
    twoSidedWallCount: number;
    oracleStructureHash: string;
  };
  boundary: {
    rowCount: number;
    columnCount: number;
    nonzeroCount: number;
    maximumAbsoluteCoefficient: string;
    sparseBoundaryDigest: string;
    genericSparseMatrixDigest: string;
    linboxLogicalExportDigest: string;
  };
  sourceBindings: Array<{ id: string; sha256: string }>;
  artifacts: {
    preparation: GenericH1ExternalJobArtifactRecord;
    matrix: GenericH1ExternalJobArtifactRecord;
    torsionFreeCertificate: GenericH1ExternalJobArtifactRecord;
  };
  checks: {
    sphericalPlanComplete: boolean;
    torsionFreeReplayPassed: boolean;
    allTorsionFreeChecksPassed: boolean;
    preparationChecksPassed: boolean;
    preparationDigestValid: boolean;
    preparationSourceBound: boolean;
    linboxHeaderMatches: boolean;
    linboxRowCountMatches: boolean;
    linboxNonzeroCountMatches: boolean;
    sourceBindingsComplete: boolean;
  };
  claims: string[];
  nonClaims: string[];
  manifestDigest: string;
}

export interface PrepareGenericH1ExternalJobInput {
  systemPath: string;
  actionPath: string;
  outputDirectory: string;
  limits?: GenericH1ExternalJobLimits;
}

export interface PrepareGenericH1ExternalJobResult {
  outputDirectory: string;
  manifest: GenericH1ExternalJobManifest;
}

const DEFAULT_LIMITS: ResolvedGenericH1ExternalJobLimits = {
  maxSystemInputBytes: 16 * 1024 * 1024,
  maxActionInputBytes: 512 * 1024 * 1024,
  maxMatrixOutputBytes: 16 * 1024 * 1024 * 1024,
  matrixWriteBatchBytes: 1024 * 1024,
  maxRankForExhaustiveEnumeration: 12,
  maxSubsetsToCheck: 4_096,
  maxSphericalSubgroupElements: 100_000,
  maxWitnesses: 8_192,
};

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function resolveLimits(
  supplied: GenericH1ExternalJobLimits | undefined,
): ResolvedGenericH1ExternalJobLimits {
  const unknown = Object.keys(supplied ?? {}).filter(
    (key) => !(key in DEFAULT_LIMITS),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown generic H1 job limits: ${unknown.sort().join(", ")}.`,
    );
  }
  const resolved: ResolvedGenericH1ExternalJobLimits = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(supplied ?? {})) {
    if (value !== undefined) {
      resolved[key as keyof ResolvedGenericH1ExternalJobLimits] = value;
    }
  }
  for (const [label, value] of Object.entries(resolved)) {
    positiveSafeInteger(value, label);
  }
  return resolved;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readBoundedJson(
  path: string,
  maximumBytes: number,
  label: string,
): { raw: unknown; bytes: Buffer; sha256: string } {
  const metadata = statSync(path);
  if (!metadata.isFile())
    throw new Error(`${label} is not a regular file: ${path}.`);
  if (metadata.size > maximumBytes) {
    throw new Error(
      `${label} is ${metadata.size} bytes; the input limit is ${maximumBytes}.`,
    );
  }
  const bytes = readFileSync(path);
  if (bytes.byteLength > maximumBytes) {
    throw new Error(
      `${label} changed while it was read and now exceeds the ${maximumBytes}-byte input limit.`,
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(
      `${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return {
      raw: JSON.parse(text) as unknown,
      bytes,
      sha256: sha256(bytes),
    };
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractCandidate(raw: unknown): {
  candidate: TorsionFreeActionCandidate;
  container: "raw-candidate" | "candidate-wrapper";
  suppliedWrapperCertificateIgnored: boolean;
} {
  if (!isRecord(raw)) {
    throw new Error(
      "The action input must be a candidate object or a candidate wrapper.",
    );
  }
  const wrapped = Object.hasOwn(raw, "candidate");
  const value = wrapped ? raw.candidate : raw;
  if (!isRecord(value)) throw new Error("action.candidate must be an object.");
  if (typeof value.id !== "string")
    throw new Error("candidate.id must be a string.");
  if (!Number.isSafeInteger(value.index) || (value.index as number) < 1) {
    throw new Error("candidate.index must be a positive safe integer.");
  }
  if (!Array.isArray(value.generatorImages)) {
    throw new Error("candidate.generatorImages must be an array.");
  }
  return {
    candidate: value as unknown as TorsionFreeActionCandidate,
    container: wrapped ? "candidate-wrapper" : "raw-candidate",
    suppliedWrapperCertificateIgnored:
      wrapped && Object.hasOwn(raw, "certificate"),
  };
}

function writeCanonicalJson(
  path: string,
  value: unknown,
): GenericH1ExternalJobArtifactRecord {
  const bytes = Buffer.from(`${canonicalizeJson(value)}\n`, "utf8");
  writeFileSync(path, bytes, { flag: "wx" });
  return {
    path: basename(path),
    byteCount: bytes.byteLength,
    sha256: sha256(bytes),
    mediaType: "application/json",
  };
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(fd, bytes, offset, bytes.byteLength - offset);
    if (written < 1)
      throw new Error("The LinBox matrix write made no progress.");
    offset += written;
  }
}

function writeCanonicalLinBoxMatrix(input: {
  path: string;
  preparation: GenericStreamedH1Preparation;
  maximumBytes: number;
  batchBytes: number;
}): {
  artifact: GenericH1ExternalJobArtifactRecord;
  headerMatches: boolean;
  rowCountMatches: boolean;
  nonzeroCountMatches: boolean;
} {
  const { path, preparation, maximumBytes, batchBytes } = input;
  const expected = preparation.certificate.boundary;
  const expectedHeader = `${expected.rowCount} ${expected.columnCount} S`;
  const digest = createHash("sha256");
  const descriptor = openSync(path, "wx");
  let batch = "";
  let batchByteCount = 0;
  let byteCount = 0;
  let lineCount = 0;
  let nonzeroCount = 0;
  let headerMatches = false;

  const flush = (): void => {
    if (batch.length === 0) return;
    const bytes = Buffer.from(batch, "ascii");
    writeAll(descriptor, bytes);
    batch = "";
    batchByteCount = 0;
  };

  try {
    preparation.forEachLinBoxSparseRowLine((line) => {
      if (
        !/^[\x20-\x7e]*$/u.test(line) ||
        line.includes("\n") ||
        line.includes("\r")
      ) {
        throw new Error(
          "The canonical LinBox exporter emitted a non-ASCII line.",
        );
      }
      if (lineCount === 0) {
        headerMatches = line === expectedHeader;
      } else {
        const separator = line.indexOf(" ");
        const token = separator < 0 ? line : line.slice(0, separator);
        const rowNonzeros = Number(token);
        if (!Number.isSafeInteger(rowNonzeros) || rowNonzeros < 0) {
          throw new Error(
            `LinBox row ${lineCount - 1} has an invalid entry count.`,
          );
        }
        nonzeroCount += rowNonzeros;
        if (!Number.isSafeInteger(nonzeroCount)) {
          throw new Error(
            "The LinBox nonzero counter exceeded safe integer range.",
          );
        }
      }
      const record = `${line}\n`;
      const recordBytes = Buffer.byteLength(record, "ascii");
      if (byteCount + recordBytes > maximumBytes) {
        throw new Error(
          `The LinBox matrix exceeds the ${maximumBytes}-byte output limit.`,
        );
      }
      digest.update(record, "ascii");
      byteCount += recordBytes;
      if (batchByteCount + recordBytes > batchBytes) flush();
      if (recordBytes > batchBytes) {
        writeAll(descriptor, Buffer.from(record, "ascii"));
      } else {
        batch += record;
        batchByteCount += recordBytes;
      }
      lineCount += 1;
    });
    flush();
  } finally {
    closeSync(descriptor);
  }

  return {
    artifact: {
      path: basename(path),
      byteCount,
      sha256: digest.digest("hex"),
      mediaType: "text/x-linbox-sparse-row",
    },
    headerMatches,
    rowCountMatches: lineCount === expected.rowCount + 1,
    nonzeroCountMatches: nonzeroCount === expected.nonzeroCount,
  };
}

function cleanStagingDirectory(path: string): void {
  for (const name of Object.values(GENERIC_H1_EXTERNAL_JOB_FILES)) {
    const target = join(path, name);
    if (existsSync(target)) unlinkSync(target);
  }
  if (existsSync(path)) rmdirSync(path);
}

function pathExistsWithoutFollowingSymlinks(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

function publishStagedJob(
  stagingDirectory: string,
  outputDirectory: string,
): void {
  // Exclusive directory creation catches ordinary entries and dangling
  // symlinks. The manifest is linked last and is the completion marker.
  mkdirSync(outputDirectory);
  const published: string[] = [];
  const order = [
    GENERIC_H1_EXTERNAL_JOB_FILES.preparation,
    GENERIC_H1_EXTERNAL_JOB_FILES.torsionFreeCertificate,
    GENERIC_H1_EXTERNAL_JOB_FILES.matrix,
    GENERIC_H1_EXTERNAL_JOB_FILES.manifest,
  ];
  try {
    for (const name of order) {
      linkSync(join(stagingDirectory, name), join(outputDirectory, name));
      published.push(name);
      unlinkSync(join(stagingDirectory, name));
    }
    rmdirSync(stagingDirectory);
  } catch (error) {
    // Remove only links this process successfully published. Never unlink a
    // path whose exclusive link operation failed because another entry won.
    for (const name of published.reverse()) {
      const path = join(outputDirectory, name);
      if (pathExistsWithoutFollowingSymlinks(path)) unlinkSync(path);
    }
    try {
      rmdirSync(outputDirectory);
    } catch {
      // A concurrent writer may have added an entry. Preserve it and report
      // the original publication failure rather than deleting unknown data.
    }
    throw error;
  }
}

function assertAllChecks(checks: Record<string, boolean>): void {
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(
      `Generic H1 preparation checks failed: ${failed.join(", ")}.`,
    );
  }
}

/**
 * Prepare one immutable external rank/lift job from a finite Coxeter action.
 * The output directory is published only after every source and export check
 * passes, so a failed run cannot be mistaken for a complete job.
 */
export function prepareGenericH1ExternalJob(
  input: PrepareGenericH1ExternalJobInput,
): PrepareGenericH1ExternalJobResult {
  const limits = resolveLimits(input.limits);
  const systemPath = resolve(input.systemPath);
  const actionPath = resolve(input.actionPath);
  const outputDirectory = resolve(input.outputDirectory);
  if (pathExistsWithoutFollowingSymlinks(outputDirectory)) {
    throw new Error(`Output directory already exists: ${outputDirectory}.`);
  }
  const outputName = basename(outputDirectory);
  if (outputName.length === 0 || outputName === "." || outputName === "..") {
    throw new Error("The output directory must name a new child directory.");
  }

  const systemArtifact = readBoundedJson(
    systemPath,
    limits.maxSystemInputBytes,
    "Coxeter system",
  );
  const actionArtifact = readBoundedJson(
    actionPath,
    limits.maxActionInputBytes,
    "Finite action",
  );
  const system = parseCoxeterSystemInput(systemArtifact.raw);
  const extracted = extractCandidate(actionArtifact.raw);
  const sphericalPlan = planSphericalSpecialSubgroups(system, {
    maxRankForExhaustiveEnumeration: limits.maxRankForExhaustiveEnumeration,
    maxSubsetsToCheck: limits.maxSubsetsToCheck,
  });
  if (sphericalPlan.status !== "complete") {
    throw new Error(
      `Torsion-free certification requires a complete spherical plan: ${sphericalPlan.warnings.join(" ")}`,
    );
  }
  const torsionFreeCertificate = certifyTorsionFreeAction(
    system,
    extracted.candidate,
    sphericalPlan,
    {
      maxSphericalSubgroupElements: limits.maxSphericalSubgroupElements,
      maxWitnesses: limits.maxWitnesses,
    },
  );
  if (torsionFreeCertificate.status !== "passed") {
    throw new Error(
      `Finite action ${extracted.candidate.id} is not certified torsion-free: ${[
        ...torsionFreeCertificate.errors,
        ...torsionFreeCertificate.warnings,
      ].join(" ")}`,
    );
  }
  const accepted: TorsionFreeCandidateResult = {
    candidate: extracted.candidate,
    certificate: torsionFreeCertificate,
  };
  const oracle = buildStreamedLawfulDavisOracle({
    system,
    generatorImages: extracted.candidate.generatorImages,
  });
  const preparation = prepareGenericStreamedH1(oracle);
  const certificate = preparation.certificate;
  const preparationSourceBound =
    certificate.source.systemCanonicalSha256 === canonicalSha256(system) &&
    certificate.source.actionRowsCanonicalSha256 ===
      oracle.actionRowsCanonicalSha256 &&
    certificate.source.oracleStructureHash === oracle.structureHash;

  mkdirSync(dirname(outputDirectory), { recursive: true });
  const stagingDirectory = mkdtempSync(
    join(dirname(outputDirectory), `.${outputName}.staging-${randomUUID()}-`),
  );
  try {
    const preparationArtifact = writeCanonicalJson(
      join(stagingDirectory, GENERIC_H1_EXTERNAL_JOB_FILES.preparation),
      certificate,
    );
    const torsionFreeArtifact = writeCanonicalJson(
      join(
        stagingDirectory,
        GENERIC_H1_EXTERNAL_JOB_FILES.torsionFreeCertificate,
      ),
      torsionFreeCertificate,
    );
    const matrixWrite = writeCanonicalLinBoxMatrix({
      path: join(stagingDirectory, GENERIC_H1_EXTERNAL_JOB_FILES.matrix),
      preparation,
      maximumBytes: limits.maxMatrixOutputBytes,
      batchBytes: limits.matrixWriteBatchBytes,
    });
    const sourceBindings = scalableGenericActionH1SourceBindings(
      preparation,
      accepted,
    );
    const checks = {
      sphericalPlanComplete: sphericalPlan.status === "complete",
      torsionFreeReplayPassed: torsionFreeCertificate.status === "passed",
      allTorsionFreeChecksPassed: Object.values(
        torsionFreeCertificate.checks,
      ).every(Boolean),
      preparationChecksPassed: Object.values(certificate.checks).every(Boolean),
      preparationDigestValid:
        certificate.preparationDigest ===
        computeGenericStreamedH1PreparationDigest(certificate),
      preparationSourceBound,
      linboxHeaderMatches: matrixWrite.headerMatches,
      linboxRowCountMatches: matrixWrite.rowCountMatches,
      linboxNonzeroCountMatches: matrixWrite.nonzeroCountMatches,
      sourceBindingsComplete:
        sourceBindings.length === 6 &&
        sourceBindings.map((binding) => binding.id).join(",") ===
          "action-rows,generic-sparse-matrix,oracle-structure,preparation,prepared-boundary,torsion-free-certificate",
    };
    assertAllChecks(checks);
    const torsionFreeCertificateCanonicalSha256 = canonicalSha256(
      torsionFreeCertificate,
    );
    const withoutDigest = {
      schemaVersion: 1 as const,
      kind: "generic-integral-h1-external-job" as const,
      status: "prepared" as const,
      method:
        "independent-torsion-replay-plus-streamed-tree-gauge-export" as const,
      algorithmVersion: JOB_ALGORITHM_VERSION,
      limits,
      source: {
        actionInputContainer: extracted.container,
        suppliedWrapperCertificateIgnored:
          extracted.suppliedWrapperCertificateIgnored,
        systemArtifactByteCount: systemArtifact.bytes.byteLength,
        systemArtifactSha256: systemArtifact.sha256,
        actionArtifactByteCount: actionArtifact.bytes.byteLength,
        actionArtifactSha256: actionArtifact.sha256,
        systemCanonicalSha256: certificate.source.systemCanonicalSha256,
        actionRowsCanonicalSha256: certificate.source.actionRowsCanonicalSha256,
        torsionFreeCertificateCanonicalSha256,
      },
      torsionFree: {
        status: "passed" as const,
        candidateId: extracted.candidate.id,
        degree: extracted.candidate.index,
        sphericalPlanStatus: "complete" as const,
        checkedSubsetCount: sphericalPlan.checkedSubsetCount,
        sphericalSubgroupCount: sphericalPlan.sphericalSubgroups.length,
        sphericalPlanCanonicalSha256: canonicalSha256(sphericalPlan),
        certificateCanonicalSha256: torsionFreeCertificateCanonicalSha256,
      },
      quotient: {
        generatorCount: oracle.generatorCount,
        geometricEdgeCount: oracle.geometricEdgeCount,
        rankTwoCellCount: oracle.rankTwoCellCount,
        wallCount: oracle.walls.wallCount,
        twoSidedWallCount: certificate.walls.twoSidedWallCount,
        oracleStructureHash: oracle.structureHash,
      },
      boundary: {
        rowCount: certificate.boundary.rowCount,
        columnCount: certificate.boundary.columnCount,
        nonzeroCount: certificate.boundary.nonzeroCount,
        maximumAbsoluteCoefficient:
          certificate.boundary.maximumAbsoluteCoefficient,
        sparseBoundaryDigest: certificate.boundary.sparseBoundaryDigest,
        genericSparseMatrixDigest:
          certificate.export.linboxSparseRow.genericSparseMatrixDigest,
        linboxLogicalExportDigest:
          certificate.export.linboxSparseRow.logicalExportDigest,
      },
      sourceBindings,
      artifacts: {
        preparation: preparationArtifact,
        matrix: matrixWrite.artifact,
        torsionFreeCertificate: torsionFreeArtifact,
      },
      checks,
      claims: [
        "The finite action passed an independently recomputed exhaustive torsion-free certificate.",
        "The LinBox file is the canonical streamed tree-gauged integral rank-two boundary bound by the preparation certificate.",
        "The manifest exposes the six exact source bindings required by the scalable action H1 adapter.",
      ],
      nonClaims: [
        "This preparation does not compute the boundary rank or H1.",
        "No integral kernel, wall saturation, or fibering conclusion is claimed.",
      ],
    };
    const manifest: GenericH1ExternalJobManifest = {
      ...withoutDigest,
      manifestDigest: canonicalSha256(withoutDigest),
    };
    writeCanonicalJson(
      join(stagingDirectory, GENERIC_H1_EXTERNAL_JOB_FILES.manifest),
      manifest,
    );
    publishStagedJob(stagingDirectory, outputDirectory);
    return { outputDirectory, manifest };
  } catch (error) {
    if (pathExistsWithoutFollowingSymlinks(stagingDirectory)) {
      cleanStagingDirectory(stagingDirectory);
    }
    throw error;
  }
}
