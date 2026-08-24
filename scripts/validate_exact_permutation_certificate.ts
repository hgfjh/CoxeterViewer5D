#!/usr/bin/env -S pnpm exec tsx

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import {
  adaptExactPermutationCertificate,
  replayExactPermutationActionArtifact,
  type ExactPermutationChecksumEvidence,
  type ExactPermutationImportProvenance,
  type ExactPermutationVerifierEvidence,
} from "../src/torsionFree/exactPermutationArtifact";

interface CliArguments {
  system: string;
  certificate: string;
  checksumManifest?: string;
  verifier?: string;
  actionOutput?: string;
  reportOutput?: string;
  candidateId?: string;
  candidateName?: string;
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
}

export const DEFAULT_MAX_COMPRESSED_CERTIFICATE_BYTES = 128 * 1024 * 1024;
export const DEFAULT_MAX_DECOMPRESSED_CERTIFICATE_BYTES = 256 * 1024 * 1024;
const MAX_SYSTEM_INPUT_BYTES = 16 * 1024 * 1024;

const usage = [
  "Usage:",
  "  pnpm exec tsx scripts/validate_exact_permutation_certificate.ts \\",
  "    --system SYSTEM.json --certificate ACTION.json[.gz] \\",
  "    [--checksum-manifest SHA256SUMS.txt] [--verifier VERIFY.py] \\",
  "    [--action-output ACTION.json] [--report-output REPORT.json] \\",
  "    [--max-compressed-bytes N] [--max-decompressed-bytes N]",
].join("\n");

function parseArguments(argv: readonly string[]): CliArguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 1) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (
      !flag?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error(usage);
    }
    values.set(flag, value);
    index += 1;
  }
  const known = new Set([
    "--system",
    "--certificate",
    "--checksum-manifest",
    "--verifier",
    "--action-output",
    "--report-output",
    "--candidate-id",
    "--candidate-name",
    "--max-compressed-bytes",
    "--max-decompressed-bytes",
  ]);
  for (const flag of values.keys()) {
    if (!known.has(flag)) throw new Error(`Unknown flag ${flag}.\n${usage}`);
  }
  const required = (flag: string): string => {
    const value = values.get(flag);
    if (value === undefined) throw new Error(`Missing ${flag}.\n${usage}`);
    return value;
  };
  const positiveInteger = (flag: string, fallback: number): number => {
    const raw = values.get(flag);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${flag} must be a positive safe integer.`);
    }
    return value;
  };
  return {
    system: required("--system"),
    certificate: required("--certificate"),
    ...(values.get("--checksum-manifest") === undefined
      ? {}
      : { checksumManifest: values.get("--checksum-manifest") }),
    ...(values.get("--verifier") === undefined
      ? {}
      : { verifier: values.get("--verifier") }),
    ...(values.get("--action-output") === undefined
      ? {}
      : { actionOutput: values.get("--action-output") }),
    ...(values.get("--report-output") === undefined
      ? {}
      : { reportOutput: values.get("--report-output") }),
    ...(values.get("--candidate-id") === undefined
      ? {}
      : { candidateId: values.get("--candidate-id") }),
    ...(values.get("--candidate-name") === undefined
      ? {}
      : { candidateName: values.get("--candidate-name") }),
    maxCompressedBytes: positiveInteger(
      "--max-compressed-bytes",
      DEFAULT_MAX_COMPRESSED_CERTIFICATE_BYTES,
    ),
    maxDecompressedBytes: positiveInteger(
      "--max-decompressed-bytes",
      DEFAULT_MAX_DECOMPRESSED_CERTIFICATE_BYTES,
    ),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function portablePath(path: string): string {
  return relative(process.cwd(), resolve(path)).replaceAll("\\", "/");
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertByteLength(
  byteLength: number,
  limit: number,
  description: string,
): void {
  if (byteLength > limit) {
    throw new Error(
      `${description} is ${byteLength} bytes; the configured limit is ${limit}.`,
    );
  }
}

function readBoundedFile(
  path: string,
  limit: number,
  description: string,
): Buffer {
  const stats = statSync(path);
  if (!stats.isFile()) throw new Error(`${path} is not a regular file.`);
  assertByteLength(stats.size, limit, description);
  return readFileSync(path);
}

export function decodeExactPermutationCertificateBytes(
  bytes: Uint8Array,
  path: string,
  maxCompressedBytes = DEFAULT_MAX_COMPRESSED_CERTIFICATE_BYTES,
  maxDecompressedBytes = DEFAULT_MAX_DECOMPRESSED_CERTIFICATE_BYTES,
): Uint8Array {
  assertByteLength(
    bytes.byteLength,
    maxCompressedBytes,
    "Compressed certificate input",
  );
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (path.toLowerCase().endsWith(".gz") && !gzip) {
    throw new Error(`${path} has a .gz suffix but no gzip header.`);
  }
  if (!gzip) {
    assertByteLength(
      bytes.byteLength,
      maxDecompressedBytes,
      "Certificate JSON input",
    );
    return bytes;
  }
  try {
    const decoded = gunzipSync(bytes, {
      maxOutputLength: maxDecompressedBytes,
    });
    assertByteLength(
      decoded.byteLength,
      maxDecompressedBytes,
      "Decompressed certificate JSON",
    );
    return decoded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("maxOutputLength") ||
      message.includes("larger than") ||
      (isErrorWithCode(error) && error.code === "ERR_BUFFER_TOO_LARGE")
    ) {
      throw new Error(
        `Decompressed certificate JSON exceeds the configured ${maxDecompressedBytes}-byte limit.`,
      );
    }
    throw error;
  }
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return isRecordWithStringCode(error);
}

function isRecordWithStringCode(value: unknown): value is { code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string"
  );
}

function checksumEvidence(
  manifestPath: string,
  certificatePath: string,
  actualSha256: string,
): ExactPermutationChecksumEvidence {
  const targetName = basename(certificatePath);
  const entries = readFileSync(manifestPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  const entry = entries.find(
    (match) => basename(match[2].replaceAll("\\", "/")) === targetName,
  );
  if (entry === undefined) {
    throw new Error(`${manifestPath} has no SHA-256 entry for ${targetName}.`);
  }
  const expectedSha256 = entry[1].toLowerCase();
  if (expectedSha256 !== actualSha256) {
    throw new Error(
      `SHA-256 mismatch for ${targetName}: manifest ${expectedSha256}, actual ${actualSha256}.`,
    );
  }
  return {
    manifestPath: portablePath(manifestPath),
    expectedSha256,
    matched: true,
  };
}

function bundledVerifierEvidence(
  verifierPath: string,
): ExactPermutationVerifierEvidence {
  const bytes = readFileSync(verifierPath);
  return {
    path: portablePath(verifierPath),
    sha256: sha256(bytes),
    // This CLI records the verifier source but uses the TypeScript spherical-
    // action replay below. It must not claim that an unexecuted command passed.
    status: "not-run",
  };
}

function pathKey(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

export function preflightExactPermutationOutputPaths(input: {
  protectedInputPaths: readonly string[];
  actionOutput?: string;
  reportOutput?: string;
}): { actionOutput?: string; reportOutput?: string } {
  const actionOutput =
    input.actionOutput === undefined ? undefined : resolve(input.actionOutput);
  const reportOutput =
    input.reportOutput === undefined ? undefined : resolve(input.reportOutput);
  if (
    actionOutput !== undefined &&
    reportOutput !== undefined &&
    pathKey(actionOutput) === pathKey(reportOutput)
  ) {
    throw new Error(
      "--action-output and --report-output must be different paths.",
    );
  }
  const protectedPaths = new Set(input.protectedInputPaths.map(pathKey));
  for (const [label, output] of [
    ["--action-output", actionOutput],
    ["--report-output", reportOutput],
  ] as const) {
    if (output === undefined) continue;
    if (protectedPaths.has(pathKey(output))) {
      throw new Error(`${label} must not overwrite an input or evidence file.`);
    }
    if (existsSync(output)) {
      throw new Error(`${label} path ${output} already exists.`);
    }
    const parent = statSync(dirname(output));
    if (!parent.isDirectory()) {
      throw new Error(`${label} parent ${dirname(output)} is not a directory.`);
    }
  }
  return {
    ...(actionOutput === undefined ? {} : { actionOutput }),
    ...(reportOutput === undefined ? {} : { reportOutput }),
  };
}

function writeJsonBatch(
  outputs: ReadonlyArray<{ path: string; value: unknown }>,
): void {
  const staged: Array<{ target: string; temporary: string }> = [];
  try {
    for (const output of outputs) {
      const target = resolve(output.path);
      const temporary = resolve(
        dirname(target),
        `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`,
      );
      const serialized = `${JSON.stringify(output.value, null, 2)}\n`;
      writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx" });
      staged.push({ target, temporary });
    }
    for (const output of staged) renameSync(output.temporary, output.target);
  } finally {
    for (const output of staged) {
      if (existsSync(output.temporary)) unlinkSync(output.temporary);
    }
  }
}

function defaultChecksumManifest(certificatePath: string): string | undefined {
  const candidate = resolve(dirname(certificatePath), "SHA256SUMS.txt");
  return existsSync(candidate) ? candidate : undefined;
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const systemPath = resolve(args.system);
  const certificatePath = resolve(args.certificate);
  const manifestPath =
    args.checksumManifest ?? defaultChecksumManifest(certificatePath);
  const verifierPath =
    args.verifier === undefined ? undefined : resolve(args.verifier);
  const outputPaths = preflightExactPermutationOutputPaths({
    protectedInputPaths: [
      systemPath,
      certificatePath,
      ...(manifestPath === undefined ? [] : [resolve(manifestPath)]),
      ...(verifierPath === undefined ? [] : [verifierPath]),
    ],
    ...(args.actionOutput === undefined
      ? {}
      : { actionOutput: args.actionOutput }),
    ...(args.reportOutput === undefined
      ? {}
      : { reportOutput: args.reportOutput }),
  });
  const systemBytes = readBoundedFile(
    systemPath,
    MAX_SYSTEM_INPUT_BYTES,
    "Coxeter system input",
  );
  const compressedCertificateBytes = readBoundedFile(
    certificatePath,
    args.maxCompressedBytes,
    "Compressed certificate input",
  );
  const certificateDigest = sha256(compressedCertificateBytes);
  const provenance: ExactPermutationImportProvenance = {
    sourceArtifact: {
      path: portablePath(certificatePath),
      sha256: certificateDigest,
      encoding:
        compressedCertificateBytes[0] === 0x1f &&
        compressedCertificateBytes[1] === 0x8b
          ? "gzip-json"
          : "json",
    },
    sourceSystemFile: {
      path: portablePath(systemPath),
      sha256: sha256(systemBytes),
    },
    ...(manifestPath === undefined
      ? {}
      : {
          checksum: checksumEvidence(
            resolve(manifestPath),
            certificatePath,
            certificateDigest,
          ),
        }),
    ...(verifierPath === undefined
      ? {}
      : {
          bundledVerifier: bundledVerifierEvidence(verifierPath),
        }),
  };
  const system = parseJson(systemBytes, systemPath);
  const rawCertificate = parseJson(
    decodeExactPermutationCertificateBytes(
      compressedCertificateBytes,
      certificatePath,
      args.maxCompressedBytes,
      args.maxDecompressedBytes,
    ),
    certificatePath,
  );
  const action = adaptExactPermutationCertificate(system, rawCertificate, {
    callerAssertedProvenance: provenance,
    ...(args.candidateId === undefined
      ? {}
      : { candidateId: args.candidateId }),
    ...(args.candidateName === undefined
      ? {}
      : { candidateName: args.candidateName }),
  });
  const report = replayExactPermutationActionArtifact(action);

  writeJsonBatch([
    ...(outputPaths.actionOutput === undefined
      ? []
      : [{ path: outputPaths.actionOutput, value: action }]),
    ...(outputPaths.reportOutput === undefined
      ? []
      : [{ path: outputPaths.reportOutput, value: report }]),
  ]);
  if (outputPaths.reportOutput === undefined) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `Exact permutation replay ${report.status}; compact report written to ${portablePath(outputPaths.reportOutput)}.\n`,
    );
  }
  if (report.status !== "passed") process.exitCode = 1;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  pathKey(fileURLToPath(import.meta.url)) === pathKey(invokedPath)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
