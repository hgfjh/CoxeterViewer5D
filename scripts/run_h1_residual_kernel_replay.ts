#!/usr/bin/env -S pnpm exec tsx
/** Regenerate the source-bound H1 core and replay its integral kernel frame. */

import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { prepareStreamedH1Lattice } from "../src/fibering/streamedH1Lattice";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import { buildExactZ2CharacterLift } from "../src/torsionFree/derivedCharacterLift";
import { adaptExactPermutationCertificate } from "../src/torsionFree/exactPermutationArtifact";

const DEFAULT_CERTIFICATE =
  "scripts/certificates/torsion-free/compact_5_cube_h1_residual_kernel_lift.json";
const SYSTEM_PATH = "public/examples/compact_5_cube_gamma1.json";
const SYSTEM_SHA256 =
  "3fce0c748df12dd42d5fd04ef113cad7de484429a19aa14b3388e29053d43d4c";
const ACTION_PATH = "coxeter5cube_index17280/index17280_permutations.json.gz";
const ACTION_SHA256 =
  "067c1c0683d7bf9bf14cefcdccb008bd09ffbf9b026cb0a6bce9f23db548a8a8";

interface LiftCertificate {
  schema: string;
  status: string;
  matrix: { path: string; sha256: string; rows: number; columns: number };
  sourceBinding?: {
    preparationDigest: string;
    coreMatrixDigest: string;
    ledgerDigest: string;
  };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireHash(path: string, expected: string): void {
  const actual = sha256(path);
  if (actual !== expected) {
    throw new Error(
      `${path} SHA-256 mismatch: expected ${expected}, found ${actual}.`,
    );
  }
}

function requireTemporaryMatrixPath(path: string): string {
  const workspace = resolve(".");
  const temporaryRoot = resolve(".tmp");
  const target = resolve(path);
  const withinTemporaryRoot = relative(temporaryRoot, target);
  if (
    isAbsolute(withinTemporaryRoot) ||
    withinTemporaryRoot === ".." ||
    withinTemporaryRoot.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    )
  ) {
    throw new Error(
      `Refusing to regenerate the core outside ${relative(workspace, temporaryRoot)}.`,
    );
  }
  return target;
}

function main(): void {
  const certificatePath = process.argv[2] ?? DEFAULT_CERTIFICATE;
  const python =
    process.argv[3] ?? (process.platform === "win32" ? "python" : "python3");
  const certificate = JSON.parse(
    readFileSync(certificatePath, "utf8"),
  ) as LiftCertificate;
  if (
    certificate.schema !==
      "coxeter-viewer.modular-kernel-lift-certificate.v2" ||
    certificate.status !==
      "verified-saturated-frame-in-reconstructed-rational-subspace" ||
    !certificate.sourceBinding
  ) {
    throw new Error(
      "The H1 lift certificate has no complete v2 source binding.",
    );
  }
  requireHash(SYSTEM_PATH, SYSTEM_SHA256);
  requireHash(ACTION_PATH, ACTION_SHA256);
  const system = JSON.parse(readFileSync(SYSTEM_PATH, "utf8"));
  const parent = adaptExactPermutationCertificate(
    system,
    JSON.parse(gunzipSync(readFileSync(ACTION_PATH)).toString("utf8")),
    {
      candidateId: "h1-residual-replay-parent",
      candidateName: "H1 residual replay parent",
      callerAssertedProvenance: {
        sourceArtifact: {
          path: ACTION_PATH,
          sha256: ACTION_SHA256,
          encoding: "gzip-json",
        },
        sourceSystemFile: { path: SYSTEM_PATH, sha256: SYSTEM_SHA256 },
      },
    },
  );
  const lift = buildExactZ2CharacterLift(
    parent.system,
    parent.action,
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    {
      candidateId: "h1-residual-replay-lift",
      candidateName: "H1 residual replay lift",
    },
  );
  if (!lift.acceptedCandidate)
    throw new Error("The exact derived action was rejected.");
  const preparation = prepareStreamedH1Lattice(
    buildStreamedLawfulDavisOracle({
      system: parent.system,
      generatorImages: lift.acceptedCandidate.generatorImages,
    }),
  );
  const binding = certificate.sourceBinding;
  if (
    preparation.certificate.preparationDigest !== binding.preparationDigest ||
    preparation.certificate.peel.coreMatrixDigest !==
      binding.coreMatrixDigest ||
    preparation.certificate.peel.ledgerDigest !== binding.ledgerDigest
  ) {
    throw new Error(
      "The regenerated H1 preparation does not match the certificate binding.",
    );
  }
  if (
    preparation.certificate.peel.nonpivotRowCount !== certificate.matrix.rows ||
    preparation.certificate.peel.unresolvedColumnCount !==
      certificate.matrix.columns
  ) {
    throw new Error(
      "The regenerated H1 core dimensions do not match the certificate.",
    );
  }

  const matrixPath = requireTemporaryMatrixPath(certificate.matrix.path);
  mkdirSync(dirname(matrixPath), { recursive: true });
  const file = openSync(matrixPath, "w");
  try {
    writeSync(
      file,
      `${certificate.matrix.rows} ${certificate.matrix.columns} S\n`,
    );
    let chunk = "";
    preparation.forEachCoreRow((row) => {
      chunk += `${row.entries.length}`;
      for (const [column, value] of row.entries) {
        chunk += ` ${column} ${value}`;
      }
      chunk += "\n";
      if (chunk.length >= 1_000_000) {
        writeSync(file, chunk);
        chunk = "";
      }
    });
    if (chunk) writeSync(file, chunk);
  } finally {
    closeSync(file);
  }
  requireHash(matrixPath, certificate.matrix.sha256);
  const replay = spawnSync(
    python,
    [
      "scripts/lift_modular_kernel.py",
      "replay",
      "--certificate",
      certificatePath,
    ],
    { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (replay.stdout) process.stdout.write(replay.stdout);
  if (replay.stderr) process.stderr.write(replay.stderr);
  if (replay.status !== 0) {
    throw new Error(`Exact Python replay exited with status ${replay.status}.`);
  }
}

main();
