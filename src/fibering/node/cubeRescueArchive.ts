import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import type { StreamedRank19AdaptiveRunnerArtifact } from "../streamedRank19Adaptive";
import {
  replayStreamedRank19AdaptiveArchiveManifest,
  replayStreamedRank19AdaptiveTerminalEnvelope,
  STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES,
  STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES,
  STREAMED_RANK19_ADAPTIVE_MAX_MANIFEST_BYTES,
  type StreamedRank19AdaptiveArchiveManifest,
  type StreamedRank19AdaptiveArchiveManifestReplay,
  type StreamedRank19AdaptiveTerminalEnvelopeReplay,
} from "./streamedRank19AdaptiveArchive";

export interface LoadedCubeRescueAdaptiveArchive {
  archivePath: string;
  manifestPath: string;
  archiveSha256: string;
  decodedSha256: string;
  artifact: StreamedRank19AdaptiveRunnerArtifact;
  manifest: StreamedRank19AdaptiveArchiveManifest;
  terminalReplay: StreamedRank19AdaptiveTerminalEnvelopeReplay;
  manifestReplay: StreamedRank19AdaptiveArchiveManifestReplay;
}

function boundedFile(path: string, maximumBytes: number): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(
      `${path} is not a regular file within ${maximumBytes} bytes.`,
    );
  }
  return readFileSync(path);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Load and structurally replay the sealed adaptive artifact without touching the normal catalogue. */
export function loadCubeRescueAdaptiveArchive(options: {
  archive: string;
  manifest: string;
}): LoadedCubeRescueAdaptiveArchive {
  const archivePath = resolve(options.archive);
  const manifestPath = resolve(options.manifest);
  const archiveBytes = boundedFile(
    archivePath,
    STREAMED_RANK19_ADAPTIVE_MAX_ARCHIVE_BYTES,
  );
  if (archiveBytes[0] !== 0x1f || archiveBytes[1] !== 0x8b) {
    throw new Error(
      "The cube rescue input must be the tracked gzip adaptive archive.",
    );
  }
  const decodedBytes = gunzipSync(archiveBytes, {
    maxOutputLength: STREAMED_RANK19_ADAPTIVE_MAX_DECODED_BYTES,
  });
  const artifact = parseJson(
    decodedBytes,
    archivePath,
  ) as StreamedRank19AdaptiveRunnerArtifact;
  const terminalReplay = replayStreamedRank19AdaptiveTerminalEnvelope(artifact);
  const manifest = parseJson(
    boundedFile(manifestPath, STREAMED_RANK19_ADAPTIVE_MAX_MANIFEST_BYTES),
    manifestPath,
  ) as StreamedRank19AdaptiveArchiveManifest;
  const manifestReplay = replayStreamedRank19AdaptiveArchiveManifest(manifest, {
    archivePath: relative(process.cwd(), archivePath).replaceAll("\\", "/"),
    archiveBytes,
    decodedBytes,
    terminalReplay,
  });
  if (
    terminalReplay.status !== "passed" ||
    manifestReplay.status !== "passed"
  ) {
    throw new Error(
      `The sealed adaptive archive failed replay: ${[
        ...terminalReplay.errors,
        ...manifestReplay.errors,
      ].join(" ")}`,
    );
  }
  return {
    archivePath,
    manifestPath,
    archiveSha256: sha256(archiveBytes),
    decodedSha256: sha256(decodedBytes),
    artifact,
    manifest,
    terminalReplay,
    manifestReplay,
  };
}
