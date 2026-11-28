#!/usr/bin/env -S pnpm exec tsx

import { createHash } from "node:crypto";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { parseCoxeterSystemInput } from "../src/coxeter";
import {
  computeGenericStreamedH1PreparationDigest,
  prepareGenericStreamedH1,
  type GenericStreamedH1Preparation,
} from "../src/fibering/genericStreamedH1Preparation";
import type { GenericH1ExternalJobManifest } from "../src/fibering/node/genericH1ExternalJob";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import { loadPackedGeneratorPermutationFiles } from "../src/fibering/node/packedActionFiles";
import type { CoxeterSystemInput } from "../src/types";
import { scalableGenericActionH1SourceBindings } from "../src/fibering/scalableGenericActionH1";
import {
  certifyTorsionFreeAction,
  materializeFiniteQuotientSubgroupAction,
  parseCompactActionImport,
  planSphericalSpecialSubgroups,
  type CompactActionImportInput,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

interface ReceiptShape {
  schemaVersion: number;
  kind: string;
  status: string;
  target: { systemPath: string };
  acquisition: {
    inputKind: CompactActionImportInput["kind"];
    inputPath: string;
    inputArtifactSha256: string;
    actionPath?: string;
    actionArtifactSha256?: string;
  };
  exactReplay: {
    torsionFreeCertificatePath?: string;
    torsionFreeCertificateSha256?: string;
  };
  scalableH1Handoff: { manifestPath?: string; manifestDigest?: string };
  errors: string[];
  receiptSha256: string;
}

interface VerificationReport {
  schemaVersion: 1;
  kind: "compact-action-import-handoff-verification";
  valid: boolean;
  preparedActionReplayed: boolean;
  checkedBindings: string[];
  errors: string[];
  verificationSha256: string;
}

function readBoundedJson(path: string, maximumBytes: number): unknown {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(
      `${path} is not a regular JSON file within the byte bound.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function sha256File(path: string): string {
  const descriptor = openSync(path, "r");
  const digest = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      digest.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return digest.digest("hex");
}

function storedPath(path: string): string {
  return isAbsolute(path) ? path : resolve(REPOSITORY_ROOT, path);
}

function actionCandidate(
  raw: unknown,
  packed?: { path: string; system: CoxeterSystemInput },
): TorsionFreeActionCandidate {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("The stored action is not an object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.kind === "generator-permutation-files") {
    if (!packed) throw new Error("A packed action manifest needs its path.");
    const manifest = parseCompactActionImport(record, packed.system);
    if (manifest.kind !== "generator-permutation-files") {
      throw new Error("Unexpected action manifest kind.");
    }
    return loadPackedGeneratorPermutationFiles(manifest, packed.path);
  }
  const candidate =
    record.candidate !== null &&
    typeof record.candidate === "object" &&
    !Array.isArray(record.candidate)
      ? record.candidate
      : record;
  return candidate as unknown as TorsionFreeActionCandidate;
}

function candidateCore(candidate: TorsionFreeActionCandidate): unknown {
  return {
    id: candidate.id,
    index: candidate.index,
    generatorImages: candidate.generatorImages,
  };
}

function replaySubgroupMaterialization(
  systemPath: string,
  inputPath: string,
  maximumBytes: number,
): TorsionFreeActionCandidate {
  const directory = mkdtempSync(join(tmpdir(), "compact-action-replay-"));
  const outputPath = join(directory, "action.json");
  try {
    const process = spawnSync(
      "python",
      [
        join(REPOSITORY_ROOT, "scripts", "import_compact_subgroup_action.py"),
        "--system",
        systemPath,
        "--input",
        inputPath,
        "--output",
        outputPath,
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      },
    );
    if (process.error) throw process.error;
    if (process.status !== 0) {
      throw new Error(
        `Subgroup acquisition replay did not materialize an action: ${process.stdout || process.stderr}`,
      );
    }
    return actionCandidate(readBoundedJson(outputPath, maximumBytes));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function compare(
  condition: boolean,
  binding: string,
  checked: string[],
  errors: string[],
): void {
  if (condition) checked.push(binding);
  else errors.push(`${binding} does not replay.`);
}

function receiptPayload(
  receipt: ReceiptShape,
): Omit<ReceiptShape, "receiptSha256"> {
  return Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "receiptSha256"),
  ) as Omit<ReceiptShape, "receiptSha256">;
}

function canonicalLinBoxFileMatches(
  path: string,
  preparation: GenericStreamedH1Preparation,
): boolean {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let matched = true;
  try {
    preparation.forEachLinBoxSparseRowLine((line) => {
      const expected = Buffer.from(`${line}\n`, "ascii");
      let offset = 0;
      while (offset < expected.length) {
        const amount = Math.min(buffer.length, expected.length - offset);
        const count = readSync(descriptor, buffer, 0, amount, null);
        if (count !== amount) {
          matched = false;
          return;
        }
        if (
          !buffer
            .subarray(0, count)
            .equals(expected.subarray(offset, offset + count))
        ) {
          matched = false;
        }
        offset += count;
      }
    });
    if (readSync(descriptor, buffer, 0, 1, null) !== 0) matched = false;
  } finally {
    closeSync(descriptor);
  }
  return matched;
}

export function verifyCompactActionImportReceipt(
  raw: unknown,
  maximumBytes = 1024 * 1024 * 1024,
): VerificationReport {
  const errors: string[] = [];
  const checked: string[] = [];
  let receipt: ReceiptShape | undefined;
  try {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("The receipt must be an object.");
    }
    receipt = raw as ReceiptShape;
    if (
      receipt.schemaVersion !== 1 ||
      receipt.kind !== "compact-action-import-handoff"
    ) {
      throw new Error("The receipt header is unsupported.");
    }
    compare(
      receipt.receiptSha256 === canonicalSha256(receiptPayload(receipt)),
      "receipt-digest",
      checked,
      errors,
    );
    const inputPath = storedPath(receipt.acquisition.inputPath);
    compare(
      sha256File(inputPath) === receipt.acquisition.inputArtifactSha256,
      "acquisition-input-bytes",
      checked,
      errors,
    );
    if (receipt.status === "prepared") {
      if (
        !receipt.acquisition.actionPath ||
        !receipt.acquisition.actionArtifactSha256 ||
        !receipt.exactReplay.torsionFreeCertificatePath ||
        !receipt.exactReplay.torsionFreeCertificateSha256 ||
        !receipt.scalableH1Handoff.manifestPath ||
        !receipt.scalableH1Handoff.manifestDigest
      ) {
        throw new Error(
          "A prepared receipt omits a required artifact binding.",
        );
      }
      const systemPath = storedPath(receipt.target.systemPath);
      const actionPath = storedPath(receipt.acquisition.actionPath);
      const torsionPath = storedPath(
        receipt.exactReplay.torsionFreeCertificatePath,
      );
      const manifestPath = storedPath(receipt.scalableH1Handoff.manifestPath);
      compare(
        sha256File(actionPath) === receipt.acquisition.actionArtifactSha256,
        "action-bytes",
        checked,
        errors,
      );
      compare(
        sha256File(torsionPath) ===
          receipt.exactReplay.torsionFreeCertificateSha256,
        "torsion-certificate-bytes",
        checked,
        errors,
      );
      const manifest = readBoundedJson(
        manifestPath,
        maximumBytes,
      ) as GenericH1ExternalJobManifest;
      const { manifestDigest, ...manifestPayload } = manifest;
      compare(
        manifestDigest === canonicalSha256(manifestPayload) &&
          manifestDigest === receipt.scalableH1Handoff.manifestDigest,
        "h1-manifest-digest",
        checked,
        errors,
      );
      compare(
        sha256File(systemPath) === manifest.source.systemArtifactSha256,
        "manifest-system-bytes",
        checked,
        errors,
      );
      compare(
        sha256File(actionPath) === manifest.source.actionArtifactSha256,
        "manifest-action-bytes",
        checked,
        errors,
      );
      for (const artifact of Object.values(manifest.artifacts)) {
        compare(
          sha256File(join(dirname(manifestPath), artifact.path)) ===
            artifact.sha256,
          `manifest-artifact:${artifact.path}`,
          checked,
          errors,
        );
      }
      compare(
        Object.values(manifest.checks).every(Boolean),
        "manifest-checks",
        checked,
        errors,
      );

      const system = parseCoxeterSystemInput(
        readBoundedJson(systemPath, maximumBytes),
      );
      const storedAction = readBoundedJson(actionPath, maximumBytes);
      const candidate = actionCandidate(storedAction, {
        path: actionPath,
        system,
      });
      const acquisition = parseCompactActionImport(
        readBoundedJson(
          inputPath,
          Math.min(maximumBytes, manifest.limits.maxActionInputBytes),
        ),
        system,
      );
      compare(
        acquisition.kind === receipt.acquisition.inputKind,
        "acquisition-kind",
        checked,
        errors,
      );
      if (acquisition.kind === "generator-permutation-files") {
        // Row files are pinned by SHA-256 in both manifests and re-hashed on
        // load, so equal digests (with equal id and index) mean equal rows.
        const stored = parseCompactActionImport(storedAction, system);
        const digests = (value: typeof acquisition) =>
          value.action.files
            .map((file) => `${file.generator}:${file.sha256}`)
            .join(",");
        compare(
          stored.kind === "generator-permutation-files" &&
            stored.action.id === acquisition.action.id &&
            stored.action.index === acquisition.action.index &&
            digests(stored) === digests(acquisition),
          "acquisition-packed-action-files",
          checked,
          errors,
        );
      } else if (acquisition.kind === "generator-permutations") {
        compare(
          canonicalSha256(acquisition.action) === canonicalSha256(candidate),
          "acquisition-direct-action",
          checked,
          errors,
        );
      } else if (acquisition.kind === "finite-quotient-subgroup") {
        const replayed = materializeFiniteQuotientSubgroupAction(
          system,
          acquisition,
        );
        compare(
          canonicalSha256(replayed.candidate) === canonicalSha256(candidate),
          "acquisition-finite-quotient-action",
          checked,
          errors,
        );
      } else {
        const replayed = replaySubgroupMaterialization(
          systemPath,
          inputPath,
          Math.min(maximumBytes, manifest.limits.maxActionInputBytes),
        );
        compare(
          canonicalSha256(candidateCore(replayed)) ===
            canonicalSha256(candidateCore(candidate)),
          "acquisition-subgroup-coset-action",
          checked,
          errors,
        );
      }
      const sphericalPlan = planSphericalSpecialSubgroups(system, {
        maxRankForExhaustiveEnumeration:
          manifest.limits.maxRankForExhaustiveEnumeration,
        maxSubsetsToCheck: manifest.limits.maxSubsetsToCheck,
      });
      const certificate = certifyTorsionFreeAction(
        system,
        candidate,
        sphericalPlan,
        {
          maxSphericalSubgroupElements:
            manifest.limits.maxSphericalSubgroupElements,
          maxWitnesses: manifest.limits.maxWitnesses,
        },
      );
      compare(
        sphericalPlan.status === "complete" && certificate.status === "passed",
        "exact-spherical-freeness",
        checked,
        errors,
      );
      compare(
        canonicalSha256(certificate) ===
          manifest.torsionFree.certificateCanonicalSha256,
        "torsion-certificate-rebuild",
        checked,
        errors,
      );
      compare(
        canonicalSha256(readBoundedJson(torsionPath, maximumBytes)) ===
          canonicalSha256(certificate),
        "torsion-certificate-semantics",
        checked,
        errors,
      );
      const oracle = buildStreamedLawfulDavisOracle({
        system,
        generatorImages: candidate.generatorImages,
      });
      const rebuiltPreparation = prepareGenericStreamedH1(oracle);
      const preparation = rebuiltPreparation.certificate;
      compare(
        preparation.source.systemCanonicalSha256 ===
          manifest.source.systemCanonicalSha256 &&
          preparation.source.actionRowsCanonicalSha256 ===
            manifest.source.actionRowsCanonicalSha256 &&
          preparation.source.oracleStructureHash ===
            manifest.quotient.oracleStructureHash &&
          preparation.preparationDigest ===
            computeGenericStreamedH1PreparationDigest(preparation) &&
          preparation.boundary.rowCount === manifest.boundary.rowCount &&
          preparation.boundary.columnCount === manifest.boundary.columnCount &&
          preparation.boundary.nonzeroCount ===
            manifest.boundary.nonzeroCount &&
          preparation.boundary.maximumAbsoluteCoefficient ===
            manifest.boundary.maximumAbsoluteCoefficient &&
          preparation.boundary.sparseBoundaryDigest ===
            manifest.boundary.sparseBoundaryDigest &&
          preparation.export.linboxSparseRow.genericSparseMatrixDigest ===
            manifest.boundary.genericSparseMatrixDigest &&
          preparation.export.linboxSparseRow.logicalExportDigest ===
            manifest.boundary.linboxLogicalExportDigest,
        "streamed-h1-preparation-rebuild",
        checked,
        errors,
      );
      compare(
        canonicalSha256(
          readBoundedJson(
            join(dirname(manifestPath), manifest.artifacts.preparation.path),
            maximumBytes,
          ),
        ) === canonicalSha256(preparation),
        "preparation-artifact-semantics",
        checked,
        errors,
      );
      compare(
        canonicalSha256(
          scalableGenericActionH1SourceBindings(rebuiltPreparation, {
            candidate,
            certificate,
          }),
        ) === canonicalSha256(manifest.sourceBindings),
        "six-source-bindings",
        checked,
        errors,
      );
      compare(
        canonicalLinBoxFileMatches(
          join(dirname(manifestPath), manifest.artifacts.matrix.path),
          rebuiltPreparation,
        ),
        "canonical-linbox-bytes",
        checked,
        errors,
      );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-action-import-handoff-verification" as const,
    valid: errors.length === 0,
    preparedActionReplayed:
      receipt?.status === "prepared" && errors.length === 0,
    checkedBindings: checked.sort(),
    errors: [...new Set(errors)].sort(),
  };
  return {
    ...withoutDigest,
    verificationSha256: canonicalSha256(withoutDigest),
  };
}

function run(argv: readonly string[]): number {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  const receiptIndex = normalized.indexOf("--receipt");
  const outputIndex = normalized.indexOf("--output");
  if (
    receiptIndex < 0 ||
    outputIndex < 0 ||
    !normalized[receiptIndex + 1] ||
    !normalized[outputIndex + 1]
  ) {
    throw new Error(
      "Usage: verify_compact_action_import.ts --receipt RECEIPT.json --output REPORT.json",
    );
  }
  const report = verifyCompactActionImportReceipt(
    readBoundedJson(normalized[receiptIndex + 1], 64 * 1024 * 1024),
  );
  writeFileSync(
    normalized[outputIndex + 1],
    `${JSON.stringify(report, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(
    JSON.stringify({
      valid: report.valid,
      checked: report.checkedBindings.length,
    }),
  );
  return report.valid ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
