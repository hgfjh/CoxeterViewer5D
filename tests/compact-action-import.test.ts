import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  materializeFiniteQuotientSubgroupAction,
  parseCompactActionImport,
} from "../src/torsionFree";
import { writePackedGeneratorPermutationFiles } from "../src/fibering/node/packedActionFiles";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "I2(3) compact-action import fixture",
  dataStatus: "toy",
  rank: 2,
  generators: [
    { id: "a", label: "a" },
    { id: "b", label: "b" },
  ],
  coxeterMatrix: [
    [1, 3],
    [3, 1],
  ],
};

function regularDihedralRows(): number[][] {
  const point = (rotation: number, reflected: number): number =>
    ((2 * ((rotation % 3) + 3)) % 6) + reflected;
  return [0, 1].map((generator) =>
    Array.from({ length: 6 }, (_unused, state) => {
      const rotation = Math.floor(state / 2);
      const reflected = state % 2;
      return generator === 0
        ? point(rotation, reflected ^ 1)
        : point(rotation + (reflected === 0 ? 1 : -1), reflected ^ 1);
    }),
  );
}

function reseal<T extends Record<string, unknown>>(
  value: T,
  digestKey: string,
): T {
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== digestKey),
  );
  return { ...payload, [digestKey]: canonicalSha256(payload) } as T;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "compact-action-import-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("compact action acquisition formats", () => {
  it("validates complete generator permutations without trusting metadata", () => {
    const parsed = parseCompactActionImport(
      {
        schemaVersion: 1,
        kind: "generator-permutations",
        action: {
          id: "regular-s3",
          index: 6,
          generatorImages: regularDihedralRows(),
          source: "test fixture",
        },
      },
      SYSTEM,
    );
    expect(parsed).toMatchObject({
      kind: "generator-permutations",
      action: { id: "regular-s3", index: 6 },
    });
    expect(() =>
      parseCompactActionImport(
        {
          schemaVersion: 1,
          kind: "generator-permutations",
          action: {
            id: "bad",
            index: 3,
            generatorImages: [
              [0, 0, 2],
              [0, 2, 1],
            ],
          },
        },
        SYSTEM,
      ),
    ).toThrow(/repeats image/i);
  });

  it("constructs L\\Q exactly from an enumerable finite quotient", () => {
    const parsed = parseCompactActionImport(
      {
        schemaVersion: 1,
        kind: "finite-quotient-subgroup",
        id: "s3-trivial-subgroup",
        quotient: {
          permutationDegree: 3,
          generatorImages: [
            [1, 0, 2],
            [0, 2, 1],
          ],
          expectedOrder: 6,
        },
        subgroupGeneratorWords: [],
        expectedIndex: 6,
      },
      SYSTEM,
    );
    expect(parsed.kind).toBe("finite-quotient-subgroup");
    if (parsed.kind !== "finite-quotient-subgroup") return;
    const result = materializeFiniteQuotientSubgroupAction(SYSTEM, parsed);
    expect(result.diagnostics).toEqual({
      quotientPermutationDegree: 3,
      quotientOrder: 6,
      subgroupOrder: 1,
      actionDegree: 6,
      quotientPermutationEntries: 18,
    });
    expect(result.candidate.generatorImages).toHaveLength(2);
    expect(result.candidate.generatorImages[0]).toHaveLength(6);

    const nontrivial = materializeFiniteQuotientSubgroupAction(SYSTEM, {
      ...parsed,
      id: "s3-order-two-subgroup",
      subgroupGeneratorWords: [[0]],
      expectedIndex: 3,
    });
    expect(nontrivial.diagnostics).toMatchObject({
      subgroupOrder: 2,
      actionDegree: 3,
    });
  });

  it("stops finite-quotient enumeration at an explicit bound", () => {
    const parsed = parseCompactActionImport(
      {
        schemaVersion: 1,
        kind: "finite-quotient-subgroup",
        id: "bounded-s3",
        quotient: {
          permutationDegree: 3,
          generatorImages: [
            [1, 0, 2],
            [0, 2, 1],
          ],
        },
        subgroupGeneratorWords: [],
        limits: { maxQuotientElements: 5, maxPermutationEntries: 100 },
      },
      SYSTEM,
    );
    if (parsed.kind !== "finite-quotient-subgroup") return;
    expect(() =>
      materializeFiniteQuotientSubgroupAction(SYSTEM, parsed),
    ).toThrow(/5-element enumeration bound/i);
  });

  it("runs direct import through exact torsion replay and the scalable-H1 handoff", () => {
    const directory = temporaryDirectory();
    const systemPath = join(directory, "system.json");
    const inputPath = join(directory, "import.json");
    const actionPath = join(directory, "action.json");
    const jobDirectory = join(directory, "h1-job");
    const receiptPath = join(directory, "receipt.json");
    writeFileSync(systemPath, `${JSON.stringify(SYSTEM)}\n`, "utf8");
    writeFileSync(
      inputPath,
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "generator-permutations",
        action: {
          id: "regular-s3",
          index: 6,
          generatorImages: regularDihedralRows(),
        },
      })}\n`,
      "utf8",
    );
    const command = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/import_compact_action.ts",
        "--system",
        systemPath,
        "--input",
        inputPath,
        "--action-output",
        actionPath,
        "--h1-job-dir",
        jobDirectory,
        "--receipt",
        receiptPath,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    expect(command.status, command.stderr || command.stdout).toBe(0);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt).toMatchObject({
      status: "prepared",
      outcome: "awaiting-external-integral-h1-proofs",
      acquisition: {
        inputKind: "generator-permutations",
        actionId: "regular-s3",
        actionDegree: 6,
      },
      exactReplay: { status: "passed" },
      scalableH1Handoff: { status: "prepared" },
      trackBHandoff: {
        status: "awaiting-rank-certificate-and-integral-kernel-witness",
      },
      errors: [],
    });
    expect(receipt.trackBHandoff.command).toContain("cover:fiber:scalable-h1");
    expect(existsSync(join(jobDirectory, "manifest.json"))).toBe(true);
    expect(
      existsSync(join(jobDirectory, "torsion-free-certificate.json")),
    ).toBe(true);

    const verificationPath = join(directory, "receipt.verification.json");
    const verify = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/verify_compact_action_import.ts",
        "--receipt",
        receiptPath,
        "--output",
        verificationPath,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    expect(verify.status, verify.stderr || verify.stdout).toBe(0);
    expect(JSON.parse(readFileSync(verificationPath, "utf8"))).toMatchObject({
      valid: true,
      preparedActionReplayed: true,
      errors: [],
    });

    // Resealing the mutable manifest and receipt is not enough to hide a
    // changed matrix: replay regenerates the canonical LinBox byte stream.
    const manifestPath = join(jobDirectory, "manifest.json");
    const matrixPath = join(jobDirectory, "boundary.linbox");
    const originalManifest = readFileSync(manifestPath, "utf8");
    const originalMatrix = readFileSync(matrixPath, "utf8");
    const originalReceipt = readFileSync(receiptPath, "utf8");
    const changedMatrix = originalMatrix.replace(/1\n$/u, "2\n");
    expect(changedMatrix).not.toBe(originalMatrix);
    writeFileSync(matrixPath, changedMatrix, "utf8");
    const mutableManifest = JSON.parse(originalManifest);
    mutableManifest.artifacts.matrix.sha256 = sha256Text(changedMatrix);
    mutableManifest.boundary.genericSparseMatrixDigest = sha256Text("fake");
    mutableManifest.boundary.linboxLogicalExportDigest = sha256Text("fake");
    const changedManifest = reseal(mutableManifest, "manifestDigest");
    writeFileSync(manifestPath, `${JSON.stringify(changedManifest)}\n`, "utf8");
    const mutableReceipt = JSON.parse(originalReceipt);
    mutableReceipt.scalableH1Handoff.manifestDigest =
      changedManifest.manifestDigest;
    const changedReceipt = reseal(mutableReceipt, "receiptSha256");
    writeFileSync(receiptPath, `${JSON.stringify(changedReceipt)}\n`, "utf8");
    const matrixTamperOutput = join(directory, "receipt.matrix-tamper.json");
    const matrixTamper = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/verify_compact_action_import.ts",
        "--receipt",
        receiptPath,
        "--output",
        matrixTamperOutput,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    expect(matrixTamper.status).toBe(1);
    const matrixTamperReport = JSON.parse(
      readFileSync(matrixTamperOutput, "utf8"),
    );
    expect(matrixTamperReport.valid).toBe(false);
    expect(matrixTamperReport.errors.join(" ")).toMatch(
      /streamed-h1-preparation|canonical-linbox/i,
    );
    writeFileSync(manifestPath, originalManifest, "utf8");
    writeFileSync(matrixPath, originalMatrix, "utf8");
    writeFileSync(receiptPath, originalReceipt, "utf8");

    const action = JSON.parse(readFileSync(actionPath, "utf8"));
    action.notes = ["tampered after certification"];
    writeFileSync(actionPath, `${JSON.stringify(action)}\n`, "utf8");
    const tamperedVerification = join(directory, "receipt.tampered.json");
    const tampered = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/verify_compact_action_import.ts",
        "--receipt",
        receiptPath,
        "--output",
        tamperedVerification,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    expect(tampered.status).toBe(1);
    expect(
      JSON.parse(readFileSync(tamperedVerification, "utf8")),
    ).toMatchObject({
      valid: false,
    });
  });

  it("imports a packed uint32 action with the same row digest as JSON", () => {
    const directory = temporaryDirectory();
    const systemPath = join(directory, "system.json");
    writeFileSync(
      systemPath,
      `${JSON.stringify(SYSTEM)}
`,
      "utf8",
    );
    const runImport = (inputPath: string, label: string) => {
      const paths = {
        action: join(directory, `${label}.action.json`),
        job: join(directory, `${label}-job`),
        receipt: join(directory, `${label}.receipt.json`),
      };
      const command = spawnSync(
        process.execPath,
        [
          resolve("node_modules/tsx/dist/cli.mjs"),
          "scripts/import_compact_action.ts",
          "--system",
          systemPath,
          "--input",
          inputPath,
          "--action-output",
          paths.action,
          "--h1-job-dir",
          paths.job,
          "--receipt",
          paths.receipt,
        ],
        { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
      );
      expect(command.status, command.stderr || command.stdout).toBe(0);
      return paths;
    };

    const jsonInput = join(directory, "import.json");
    writeFileSync(
      jsonInput,
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "generator-permutations",
        action: {
          id: "regular-s3",
          index: 6,
          generatorImages: regularDihedralRows(),
        },
      })}
`,
      "utf8",
    );
    const packedDirectory = join(directory, "packed-source");
    mkdirSync(packedDirectory);
    writePackedGeneratorPermutationFiles(packedDirectory, {
      id: "regular-s3",
      index: 6,
      generatorImages: regularDihedralRows(),
    });
    const fromJson = runImport(jsonInput, "json");
    const fromPacked = runImport(
      join(packedDirectory, "action.manifest.json"),
      "packed",
    );

    const jsonManifest = JSON.parse(
      readFileSync(join(fromJson.job, "manifest.json"), "utf8"),
    );
    const packedManifest = JSON.parse(
      readFileSync(join(fromPacked.job, "manifest.json"), "utf8"),
    );
    expect(packedManifest.source.actionInputContainer).toBe(
      "packed-files-manifest",
    );
    expect(packedManifest.source.actionRowsCanonicalSha256).toBe(
      jsonManifest.source.actionRowsCanonicalSha256,
    );
    expect(packedManifest.boundary).toMatchObject({
      rowCount: jsonManifest.boundary.rowCount,
      columnCount: jsonManifest.boundary.columnCount,
      nonzeroCount: jsonManifest.boundary.nonzeroCount,
    });
    const receipt = JSON.parse(readFileSync(fromPacked.receipt, "utf8"));
    expect(receipt).toMatchObject({
      status: "prepared",
      acquisition: {
        inputKind: "generator-permutation-files",
        actionId: "regular-s3",
        actionDegree: 6,
      },
      exactReplay: { status: "passed" },
    });
    expect(existsSync(`${fromPacked.action}.s0.u32`)).toBe(true);

    const verify = (output: string) =>
      spawnSync(
        process.execPath,
        [
          resolve("node_modules/tsx/dist/cli.mjs"),
          "scripts/verify_compact_action_import.ts",
          "--receipt",
          fromPacked.receipt,
          "--output",
          output,
        ],
        { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
      );
    const ok = verify(join(directory, "packed.verification.json"));
    expect(ok.status, ok.stderr || ok.stdout).toBe(0);

    // Swapping two images keeps a permutation but breaks the pinned digest.
    const rowPath = `${fromPacked.action}.s1.u32`;
    const bytes = readFileSync(rowPath);
    const row = new Uint32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    [row[0], row[1]] = [row[1], row[0]];
    rmSync(rowPath);
    writeFileSync(rowPath, new Uint8Array(row.buffer));
    const tampered = verify(join(directory, "packed.tampered.json"));
    expect(tampered.status).not.toBe(0);
  }, 120_000);

  it("rejects spherical torsion without publishing an action or H1 job", () => {
    const directory = temporaryDirectory();
    const systemPath = join(directory, "system.json");
    const inputPath = join(directory, "import.json");
    const actionPath = join(directory, "action.json");
    const jobDirectory = join(directory, "h1-job");
    const receiptPath = join(directory, "receipt.json");
    writeFileSync(systemPath, `${JSON.stringify(SYSTEM)}\n`, "utf8");
    writeFileSync(
      inputPath,
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "generator-permutations",
        action: {
          id: "trivial-action-with-torsion",
          index: 1,
          generatorImages: [[0], [0]],
        },
      })}\n`,
      "utf8",
    );
    const command = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/import_compact_action.ts",
        "--system",
        systemPath,
        "--input",
        inputPath,
        "--action-output",
        actionPath,
        "--h1-job-dir",
        jobDirectory,
        "--receipt",
        receiptPath,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    expect(command.status).toBe(1);
    expect(existsSync(actionPath)).toBe(false);
    expect(existsSync(jobDirectory)).toBe(false);
    expect(JSON.parse(readFileSync(receiptPath, "utf8"))).toMatchObject({
      status: "rejected",
      outcome: "action-rejected-before-h1",
      exactReplay: { status: "failed" },
      scalableH1Handoff: { status: "not-run" },
    });
  });

  it("preserves a pre-existing publication target", () => {
    const directory = temporaryDirectory();
    const systemPath = join(directory, "system.json");
    const inputPath = join(directory, "import.json");
    const actionPath = join(directory, "action.json");
    const jobDirectory = join(directory, "h1-job");
    const receiptPath = join(directory, "receipt.json");
    writeFileSync(systemPath, `${JSON.stringify(SYSTEM)}\n`, "utf8");
    writeFileSync(
      inputPath,
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "generator-permutations",
        action: {
          id: "regular-s3",
          index: 6,
          generatorImages: regularDihedralRows(),
        },
      })}\n`,
      "utf8",
    );
    writeFileSync(actionPath, "user-owned sentinel\n", "utf8");
    const command = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/import_compact_action.ts",
        "--system",
        systemPath,
        "--input",
        inputPath,
        "--action-output",
        actionPath,
        "--h1-job-dir",
        jobDirectory,
        "--receipt",
        receiptPath,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    expect(command.status).toBe(1);
    expect(readFileSync(actionPath, "utf8")).toBe("user-owned sentinel\n");
    expect(existsSync(jobDirectory)).toBe(false);
    expect(existsSync(receiptPath)).toBe(false);
  });

  it("validates the GAP/ACE subgroup request without starting enumeration", () => {
    const directory = temporaryDirectory();
    const systemPath = join(directory, "system.json");
    const inputPath = join(directory, "subgroup.json");
    writeFileSync(systemPath, `${JSON.stringify(SYSTEM)}\n`, "utf8");
    writeFileSync(
      inputPath,
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "subgroup-generators",
        id: "index-six-rotation-subgroup",
        subgroupGenerators: [[0, 1, 0, 1, 0, 1]],
        maxCosets: 100,
        timeoutSeconds: 10,
      })}\n`,
      "utf8",
    );
    const command = spawnSync(
      "python",
      [
        "scripts/import_compact_subgroup_action.py",
        "--system",
        systemPath,
        "--input",
        inputPath,
        "--validate-only",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
    );
    expect(command.status, command.stderr || command.stdout).toBe(0);
    expect(JSON.parse(command.stdout)).toMatchObject({
      status: "validated",
      kind: "subgroup-generators",
      rank: 2,
      subgroupGeneratorCount: 1,
    });
  });
});
