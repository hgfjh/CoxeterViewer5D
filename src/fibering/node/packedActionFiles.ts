import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  openSync,
  readSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { endianness } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  validatePackedPermutationRow,
  type GeneratorPermutationFilesImport,
} from "../../torsionFree/compactActionImport";
import type { TorsionFreeActionCandidate } from "../../torsionFree/types";

const READ_CHUNK_BYTES = 64 * 1024 * 1024;

/**
 * Read one little-endian uint32 row straight into a Uint32Array while hashing
 * the same bytes.  The bytes are read into the typed array's own (shared)
 * buffer, so a 40M-point row costs its 160 MB once and is never re-encoded.
 */
export function readPackedRow(
  path: string,
  degree: number,
  expectedSha256: string,
  label: string,
): Uint32Array {
  if (endianness() !== "LE") {
    throw new Error(
      "Packed uint32le action rows require a little-endian host.",
    );
  }
  const descriptor = openSync(path, "r");
  try {
    const size = fstatSync(descriptor).size;
    if (size !== degree * 4) {
      throw new Error(
        `${label}: ${path} has ${size} bytes; expected ${degree * 4}.`,
      );
    }
    // Shared memory, so worker-thread kernels can read the row in place.
    const row = new Uint32Array(new SharedArrayBuffer(degree * 4));
    const bytes = new Uint8Array(row.buffer);
    const digest = createHash("sha256");
    let offset = 0;
    while (offset < size) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        Math.min(READ_CHUNK_BYTES, size - offset),
        offset,
      );
      if (count === 0) throw new Error(`${label}: ${path} ended early.`);
      digest.update(bytes.subarray(offset, offset + count));
      offset += count;
    }
    const sha256 = digest.digest("hex");
    if (sha256 !== expectedSha256) {
      throw new Error(
        `${label}: ${path} has SHA-256 ${sha256}; the manifest pins ${expectedSha256}.`,
      );
    }
    return row;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Materialize a candidate from a parsed `generator-permutation-files` manifest.
 * Each row is SHA-checked against the manifest and checked to be a
 * permutation of 0..index-1; Coxeter relations and transitivity are left to
 * the torsion-free certifier, exactly as for JSON candidates.
 */
export function loadPackedGeneratorPermutationFiles(
  manifest: GeneratorPermutationFilesImport,
  manifestPath: string,
): TorsionFreeActionCandidate {
  const base = dirname(resolve(manifestPath));
  const { action } = manifest;
  const generatorImages = action.files.map((file) => {
    const label = `generator ${file.generator}`;
    const row = readPackedRow(
      join(base, file.path),
      action.index,
      file.sha256,
      label,
    );
    validatePackedPermutationRow(
      row,
      action.index,
      `action.files[${file.generator}]`,
    );
    return row;
  });
  return {
    id: action.id,
    index: action.index,
    generatorImages,
    ...(action.name ? { name: action.name } : {}),
    ...(action.backend ? { backend: action.backend } : {}),
    ...(action.backendVersion ? { backendVersion: action.backendVersion } : {}),
    ...(action.source ? { source: action.source } : {}),
    ...(action.notes ? { notes: action.notes } : {}),
  };
}

/**
 * Write a candidate as `s{g}.u32` files plus a manifest in `directory`.
 * Each file is written to a temporary name and renamed only after its
 * digest is known, so a manifest never points at a partial row.
 */
export function writePackedGeneratorPermutationFiles(
  directory: string,
  candidate: TorsionFreeActionCandidate,
  manifestName = "action.manifest.json",
): GeneratorPermutationFilesImport {
  if (endianness() !== "LE") {
    throw new Error(
      "Packed uint32le action rows require a little-endian host.",
    );
  }
  const files = candidate.generatorImages.map((source, generator) => {
    const row =
      source instanceof Uint32Array ? source : Uint32Array.from(source);
    const bytes = new Uint8Array(row.buffer, row.byteOffset, row.byteLength);
    const path = `s${generator}.u32`;
    const target = join(directory, path);
    writeFileSync(`${target}.tmp`, bytes, { flag: "wx" });
    renameSync(`${target}.tmp`, target);
    return {
      generator,
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  const manifest: GeneratorPermutationFilesImport = {
    schemaVersion: 1,
    kind: "generator-permutation-files",
    action: {
      id: candidate.id,
      index: candidate.index,
      encoding: "uint32le",
      files,
      ...(candidate.name ? { name: candidate.name } : {}),
      ...(candidate.backend ? { backend: candidate.backend } : {}),
      ...(candidate.backendVersion
        ? { backendVersion: candidate.backendVersion }
        : {}),
      ...(candidate.source ? { source: candidate.source } : {}),
      ...(candidate.notes ? { notes: candidate.notes } : {}),
    },
  };
  writeFileSync(
    join(directory, manifestName),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );
  return manifest;
}
