#!/usr/bin/env tsx

import { createHash } from "node:crypto";
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
  replayStreamedRank19GlobalNormalCatalogue,
  type StreamedRank19GlobalNormalArtifact,
} from "../src/fibering/node/streamedRank19GlobalNormalCatalogue";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const MAX_JSON_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

interface Arguments {
  input: string;
  archive: string;
  manifest: string;
  verifyOnly: boolean;
}

interface CatalogueArchiveManifest {
  schemaVersion: 1;
  kind: "streamed-rank19-global-normal-catalogue-archive";
  archive: {
    path: string;
    encoding: "gzip-json";
    byteLength: number;
    sha256: string;
  };
  decoded: {
    byteLength: number;
    sha256: string;
    artifactDigest: string;
    bindingDigest: string;
    normalCatalogueDigest: string;
    chunkManifestDigest: string;
    degree: number;
    rank: number;
    germOccurrenceCount: number;
    identicallyZeroGermCount: number;
    normalCount: number;
  };
  replayChecks: ReturnType<
    typeof replayStreamedRank19GlobalNormalCatalogue
  >["checks"];
  compression: {
    method: "node-zlib-gzip-level-9";
    nodeVersion: string;
    zlibVersion: string;
  };
  manifestDigest: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Arguments must be supplied as --name value pairs.");
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
    input: values.get("--input") ?? ".tmp/rank19_global_normals.json",
    archive:
      values.get("--archive") ??
      "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_global_normals.json.gz",
    manifest:
      values.get("--manifest") ??
      "scripts/certificates/torsion-free/compact_5_cube_index34560_rank19_global_normals.archive.json",
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

function decodeJson(bytes: Buffer, path: string): Buffer {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  try {
    return gunzipSync(bytes, { maxOutputLength: MAX_JSON_BYTES });
  } catch (error) {
    throw new Error(
      `${path} is not a bounded gzip payload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseAndReplay(
  bytes: Buffer,
  path: string,
): {
  artifact: StreamedRank19GlobalNormalArtifact;
  replay: ReturnType<typeof replayStreamedRank19GlobalNormalCatalogue>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const replay = replayStreamedRank19GlobalNormalCatalogue(parsed);
  if (replay.status !== "passed") {
    throw new Error(
      `The global-normal catalogue failed replay: ${replay.errors.join(" ")}`,
    );
  }
  const artifact = parsed as StreamedRank19GlobalNormalArtifact;
  if (
    artifact.status !== "completed" ||
    artifact.nextPoint !== artifact.degree ||
    artifact.rank !== 19
  ) {
    throw new Error(
      "The supplied catalogue is not a completed rank-19 artifact.",
    );
  }
  return { artifact, replay };
}

function sealManifest(
  manifest: Omit<CatalogueArchiveManifest, "manifestDigest">,
): CatalogueArchiveManifest {
  const withoutDigest = { ...manifest, manifestDigest: "" };
  return { ...manifest, manifestDigest: canonicalSha256(withoutDigest) };
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

function expectedManifest(
  archivePath: string,
  archiveBytes: Buffer,
  decodedBytes: Buffer,
  artifact: StreamedRank19GlobalNormalArtifact,
  replay: ReturnType<typeof replayStreamedRank19GlobalNormalCatalogue>,
  compressionVersions: { nodeVersion: string; zlibVersion: string } = {
    nodeVersion: process.versions.node,
    zlibVersion: process.versions.zlib,
  },
): CatalogueArchiveManifest {
  return sealManifest({
    schemaVersion: 1,
    kind: "streamed-rank19-global-normal-catalogue-archive",
    archive: {
      path: portable(archivePath),
      encoding: "gzip-json",
      byteLength: archiveBytes.byteLength,
      sha256: sha256(archiveBytes),
    },
    decoded: {
      byteLength: decodedBytes.byteLength,
      sha256: sha256(decodedBytes),
      artifactDigest: artifact.artifactDigest,
      bindingDigest: artifact.binding.bindingDigest,
      normalCatalogueDigest: artifact.normalCatalogueDigest,
      chunkManifestDigest: artifact.chunkManifestDigest,
      degree: artifact.degree,
      rank: artifact.rank,
      germOccurrenceCount: artifact.germOccurrenceCount,
      identicallyZeroGermCount: artifact.identicallyZeroGermCount,
      normalCount: artifact.normalCount,
    },
    replayChecks: replay.checks,
    compression: {
      method: "node-zlib-gzip-level-9",
      ...compressionVersions,
    },
  });
}

function verify(args: Arguments): CatalogueArchiveManifest {
  const archivePath = resolve(args.archive);
  const manifestPath = resolve(args.manifest);
  const archiveBytes = boundedFile(archivePath, MAX_ARCHIVE_BYTES);
  if (archiveBytes[0] !== 0x1f || archiveBytes[1] !== 0x8b) {
    throw new Error(`${archivePath} is not a gzip archive.`);
  }
  const decodedBytes = decodeJson(archiveBytes, archivePath);
  const { artifact, replay } = parseAndReplay(decodedBytes, archivePath);
  const stored = JSON.parse(
    boundedFile(manifestPath, 4 * 1024 * 1024).toString("utf8"),
  ) as Partial<CatalogueArchiveManifest>;
  if (
    stored.compression?.method !== "node-zlib-gzip-level-9" ||
    typeof stored.compression.nodeVersion !== "string" ||
    stored.compression.nodeVersion.length === 0 ||
    typeof stored.compression.zlibVersion !== "string" ||
    stored.compression.zlibVersion.length === 0
  ) {
    throw new Error(
      "The stored archive manifest has invalid compression provenance.",
    );
  }
  const expected = expectedManifest(
    archivePath,
    archiveBytes,
    decodedBytes,
    artifact,
    replay,
    {
      nodeVersion: stored.compression.nodeVersion,
      zlibVersion: stored.compression.zlibVersion,
    },
  );
  if (canonicalSha256(stored) !== canonicalSha256(expected)) {
    throw new Error(
      "The stored archive manifest does not match the replayed archive.",
    );
  }
  return expected;
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
  if (existsSync(archivePath) || existsSync(manifestPath)) {
    throw new Error("Refusing to replace an existing archive or manifest.");
  }
  const sourceBytes = decodeJson(
    boundedFile(inputPath, MAX_JSON_BYTES),
    inputPath,
  );
  const { artifact, replay } = parseAndReplay(sourceBytes, inputPath);

  // Re-serialization removes presentation whitespace only. The artifact's
  // canonical digest and the exact normal vectors are replayed before this.
  const decodedBytes = Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8");
  if (decodedBytes.byteLength > MAX_JSON_BYTES) {
    throw new Error("The canonical catalogue JSON exceeds the replay bound.");
  }
  const archiveBytes = gzipSync(decodedBytes, { level: 9 });
  if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("The gzip catalogue exceeds the archive replay bound.");
  }
  const manifest = expectedManifest(
    archivePath,
    archiveBytes,
    decodedBytes,
    artifact,
    replay,
  );
  atomicWrite(archivePath, archiveBytes);
  atomicWrite(
    manifestPath,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  );
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main();
