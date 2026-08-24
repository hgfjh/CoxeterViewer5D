#!/usr/bin/env tsx

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  replayStreamedRank19AdaptiveArchiveManifest,
  replayStreamedRank19AdaptiveTerminalEnvelope,
  sealStreamedRank19AdaptiveArchiveManifest,
  STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES,
  STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES,
  STREAMED_RANK19_ADAPTIVE_MAX_MANIFEST_BYTES,
} from "../src/fibering/node/streamedRank19AdaptiveArchive";
import { canonicalizeJson } from "../src/utils/canonicalSha256";

const MAX_DECODED_BYTES = STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES;
const MAX_ARCHIVE_BYTES = STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES;
const MAX_MANIFEST_BYTES = STREAMED_RANK19_ADAPTIVE_MAX_MANIFEST_BYTES;

interface Arguments {
  input: string;
  archive: string;
  manifest: string;
  verifyOnly: boolean;
}

function portable(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function parseBoolean(value: string | undefined, label: string): boolean {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

function parseArguments(argv: readonly string[]): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (normalized.length % 2 !== 0) {
    throw new Error("Arguments must be unique --name value pairs.");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      throw new Error("Arguments must be unique --name value pairs.");
    }
    values.set(key, value);
  }
  const supported = new Set([
    "--input",
    "--archive",
    "--manifest",
    "--verify-only",
  ]);
  for (const key of values.keys()) {
    if (!supported.has(key)) throw new Error(`Unknown argument ${key}.`);
  }
  return {
    input: values.get("--input") ?? ".tmp/compact_5_cube_rank19_adaptive.json",
    archive:
      values.get("--archive") ??
      "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.json.gz",
    manifest:
      values.get("--manifest") ??
      "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_adaptive.archive.json",
    verifyOnly: parseBoolean(values.get("--verify-only"), "--verify-only"),
  };
}

function boundedFile(path: string, maximumBytes: number): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(`${path} is not a bounded regular file.`);
  }
  return readFileSync(path);
}

function decodeMaybeGzip(bytes: Buffer, path: string): Buffer {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  try {
    return gunzipSync(bytes, { maxOutputLength: MAX_DECODED_BYTES });
  } catch (error) {
    throw new Error(
      `${path} is not a bounded gzip payload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseJson(bytes: Buffer, path: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function atomicWrite(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: "wx" });
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // A successful rename already removed the temporary path.
    }
    throw error;
  }
}

function deterministicGzip(decodedBytes: Buffer): Buffer {
  const archiveBytes = Buffer.from(gzipSync(decodedBytes, { level: 9 }));
  if (
    archiveBytes.byteLength < 18 ||
    archiveBytes[0] !== 0x1f ||
    archiveBytes[1] !== 0x8b ||
    archiveBytes[2] !== 0x08
  ) {
    throw new Error("Node zlib did not emit an ordinary gzip member.");
  }

  // The DEFLATE body is deterministic for a fixed recorded zlib version.
  // Normalize every variable gzip-header byte so OS and wall-clock metadata
  // cannot change the tracked container hash.
  archiveBytes[3] = 0x00;
  archiveBytes.fill(0x00, 4, 8);
  archiveBytes[8] = 0x02;
  archiveBytes[9] = 0xff;
  return archiveBytes;
}

function verify(args: Arguments) {
  const archivePath = resolve(args.archive);
  const manifestPath = resolve(args.manifest);
  const archiveBytes = boundedFile(archivePath, MAX_ARCHIVE_BYTES);
  if (archiveBytes[0] !== 0x1f || archiveBytes[1] !== 0x8b) {
    throw new Error(`${archivePath} is not a gzip archive.`);
  }
  const decodedBytes = decodeMaybeGzip(archiveBytes, archivePath);
  const terminalReplay = replayStreamedRank19AdaptiveTerminalEnvelope(
    parseJson(decodedBytes, archivePath),
  );
  if (terminalReplay.status !== "passed") {
    throw new Error(
      `The decoded adaptive artifact failed terminal-envelope replay: ${terminalReplay.errors.join(" ")}`,
    );
  }
  const storedManifest = parseJson(
    boundedFile(manifestPath, MAX_MANIFEST_BYTES),
    manifestPath,
  );
  const manifestReplay = replayStreamedRank19AdaptiveArchiveManifest(
    storedManifest,
    {
      archivePath: portable(archivePath),
      archiveBytes,
      decodedBytes,
      terminalReplay,
    },
  );
  if (manifestReplay.status !== "passed" || !manifestReplay.expectedManifest) {
    throw new Error(
      `The adaptive archive manifest failed replay: ${manifestReplay.errors.join(" ")}`,
    );
  }
  return manifestReplay.expectedManifest;
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  if (args.verifyOnly) {
    process.stdout.write(`${JSON.stringify(verify(args), null, 2)}\n`);
    return;
  }

  const inputPath = resolve(args.input);
  const archivePath = resolve(args.archive);
  const manifestPath = resolve(args.manifest);
  if (archivePath === manifestPath) {
    throw new Error("The adaptive archive and manifest paths must differ.");
  }
  if (existsSync(archivePath) || existsSync(manifestPath)) {
    throw new Error("Refusing to replace an existing archive or manifest.");
  }
  const inputContainer = boundedFile(inputPath, MAX_DECODED_BYTES);
  if (
    inputContainer[0] === 0x1f &&
    inputContainer[1] === 0x8b &&
    inputContainer.byteLength > MAX_ARCHIVE_BYTES
  ) {
    throw new Error(
      "The supplied gzip input exceeds the archive replay bound.",
    );
  }
  const inputBytes = decodeMaybeGzip(inputContainer, inputPath);
  const artifact = parseJson(inputBytes, inputPath);
  const terminalReplay = replayStreamedRank19AdaptiveTerminalEnvelope(artifact);
  if (terminalReplay.status !== "passed") {
    throw new Error(
      `The supplied adaptive artifact is not terminal and sealed: ${terminalReplay.errors.join(" ")}`,
    );
  }

  // Canonical JSON makes the payload independent of source indentation and
  // object-key insertion order. The gzip header is normalized separately.
  const decodedBytes = Buffer.from(`${canonicalizeJson(artifact)}\n`, "utf8");
  if (decodedBytes.byteLength > MAX_DECODED_BYTES) {
    throw new Error("The canonical adaptive JSON exceeds the replay bound.");
  }
  const archiveBytes = deterministicGzip(decodedBytes);
  if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("The gzip adaptive artifact exceeds the replay bound.");
  }
  const manifest = sealStreamedRank19AdaptiveArchiveManifest({
    archivePath: portable(archivePath),
    archiveBytes,
    decodedBytes,
    terminalReplay,
    nodeVersion: process.versions.node,
    zlibVersion: process.versions.zlib,
  });
  const manifestReplay = replayStreamedRank19AdaptiveArchiveManifest(manifest, {
    archivePath: portable(archivePath),
    archiveBytes,
    decodedBytes,
    terminalReplay,
  });
  if (manifestReplay.status !== "passed") {
    throw new Error(
      `The freshly constructed adaptive archive failed replay: ${manifestReplay.errors.join(" ")}`,
    );
  }
  const manifestBytes = Buffer.from(
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new Error("The adaptive archive manifest exceeds its replay bound.");
  }
  atomicWrite(archivePath, archiveBytes);
  atomicWrite(manifestPath, manifestBytes);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main();
