import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  GENERIC_H1_EXTERNAL_JOB_FILES,
  prepareGenericH1ExternalJob,
  type GenericH1ExternalJobManifest,
} from "../src/fibering/node/genericH1ExternalJob";
import type { TorsionFreeActionCandidate } from "../src/torsionFree";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SYSTEM = {
  schemaVersion: 1,
  name: "I2(3) external H1 job fixture",
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

function regularDihedralAction(m: number): TorsionFreeActionCandidate {
  const point = (rotation: number, reflected: number): number =>
    ((2 * ((rotation % m) + m)) % (2 * m)) + reflected;
  return {
    id: `i2-${m}-right-regular`,
    index: 2 * m,
    generatorImages: [0, 1].map((generator) =>
      Array.from({ length: 2 * m }, (_unused, state) => {
        const rotation = Math.floor(state / 2);
        const reflected = state % 2;
        return generator === 0
          ? point(rotation, reflected ^ 1)
          : point(rotation + (reflected === 0 ? 1 : -1), reflected ^ 1);
      }),
    ),
  };
}

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeFixture(
  directory: string,
  wrapped: boolean,
): {
  systemPath: string;
  actionPath: string;
} {
  const systemPath = join(directory, "system.json");
  const actionPath = join(directory, "action.json");
  writeFileSync(systemPath, `${JSON.stringify(SYSTEM)}\n`, "utf8");
  const candidate = regularDihedralAction(3);
  writeFileSync(
    actionPath,
    `${JSON.stringify(
      wrapped ? { candidate, certificate: { status: "untrusted" } } : candidate,
    )}\n`,
    "utf8",
  );
  return { systemPath, actionPath };
}

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "generic-h1-job-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("generic H1 external-job preparation", () => {
  it("writes a source-bound certificate, canonical LinBox matrix, replay, and manifest", () => {
    const directory = temporaryDirectory();
    const paths = writeFixture(directory, false);
    const outputDirectory = join(directory, "job");
    const result = prepareGenericH1ExternalJob({
      ...paths,
      outputDirectory,
      limits: { matrixWriteBatchBytes: 7 },
    });

    expect(result.manifest.status).toBe("prepared");
    expect(Object.values(result.manifest.checks).every(Boolean)).toBe(true);
    expect(result.manifest.boundary).toMatchObject({
      rowCount: 1,
      columnCount: 1,
      nonzeroCount: 1,
      maximumAbsoluteCoefficient: "1",
    });
    expect(
      readFileSync(join(outputDirectory, "boundary.linbox"), "ascii"),
    ).toBe("1 1 S\n1 0 -1\n");

    const stored = JSON.parse(
      readFileSync(
        join(outputDirectory, GENERIC_H1_EXTERNAL_JOB_FILES.manifest),
        "utf8",
      ),
    ) as GenericH1ExternalJobManifest;
    const { manifestDigest, ...payload } = stored;
    expect(manifestDigest).toBe(canonicalSha256(payload));
    for (const artifact of Object.values(stored.artifacts)) {
      expect(fileSha256(join(outputDirectory, artifact.path))).toBe(
        artifact.sha256,
      );
    }
    expect(stored.sourceBindings.map((binding) => binding.id)).toEqual([
      "action-rows",
      "generic-sparse-matrix",
      "oracle-structure",
      "preparation",
      "prepared-boundary",
      "torsion-free-certificate",
    ]);
  });

  it("accepts a candidate wrapper but ignores its supplied certificate", () => {
    const rawDirectory = temporaryDirectory();
    const wrappedDirectory = temporaryDirectory();
    const rawPaths = writeFixture(rawDirectory, false);
    const wrappedPaths = writeFixture(wrappedDirectory, true);
    const rawOutput = join(rawDirectory, "job");
    const wrappedOutput = join(wrappedDirectory, "job");
    const raw = prepareGenericH1ExternalJob({
      ...rawPaths,
      outputDirectory: rawOutput,
    });
    const wrapped = prepareGenericH1ExternalJob({
      ...wrappedPaths,
      outputDirectory: wrappedOutput,
    });

    expect(wrapped.manifest.source).toMatchObject({
      actionInputContainer: "candidate-wrapper",
      suppliedWrapperCertificateIgnored: true,
    });
    for (const name of [
      GENERIC_H1_EXTERNAL_JOB_FILES.preparation,
      GENERIC_H1_EXTERNAL_JOB_FILES.matrix,
      GENERIC_H1_EXTERNAL_JOB_FILES.torsionFreeCertificate,
    ]) {
      expect(readFileSync(join(wrappedOutput, name))).toEqual(
        readFileSync(join(rawOutput, name)),
      );
    }
    expect(wrapped.manifest.sourceBindings).toEqual(
      raw.manifest.sourceBindings,
    );
  });

  it("produces byte-identical bundles from the same source bytes", () => {
    const directory = temporaryDirectory();
    const paths = writeFixture(directory, false);
    const first = join(directory, "first-job");
    const second = join(directory, "second-job");
    prepareGenericH1ExternalJob({ ...paths, outputDirectory: first });
    prepareGenericH1ExternalJob({ ...paths, outputDirectory: second });

    for (const name of Object.values(GENERIC_H1_EXTERNAL_JOB_FILES)) {
      expect(readFileSync(join(first, name))).toEqual(
        readFileSync(join(second, name)),
      );
    }
  });

  it("enforces bounded inputs and never overwrites a published job", () => {
    const directory = temporaryDirectory();
    const paths = writeFixture(directory, false);
    const boundedOutput = join(directory, "bounded-job");
    expect(() =>
      prepareGenericH1ExternalJob({
        ...paths,
        outputDirectory: boundedOutput,
        limits: { maxActionInputBytes: 1 },
      }),
    ).toThrow(/input limit/i);
    expect(existsSync(boundedOutput)).toBe(false);

    const boundedMatrixOutput = join(directory, "bounded-matrix-job");
    expect(() =>
      prepareGenericH1ExternalJob({
        ...paths,
        outputDirectory: boundedMatrixOutput,
        limits: { maxMatrixOutputBytes: 1 },
      }),
    ).toThrow(/matrix exceeds/i);
    expect(existsSync(boundedMatrixOutput)).toBe(false);
    expect(
      readdirSync(directory).some((name) =>
        name.startsWith(".bounded-matrix-job.staging-"),
      ),
    ).toBe(false);

    const emptyOutput = join(directory, "existing-empty-job");
    mkdirSync(emptyOutput);
    expect(() =>
      prepareGenericH1ExternalJob({ ...paths, outputDirectory: emptyOutput }),
    ).toThrow(/already exists/i);
    expect(readdirSync(emptyOutput)).toEqual([]);

    const outputDirectory = join(directory, "job");
    prepareGenericH1ExternalJob({ ...paths, outputDirectory });
    const before = fileSha256(
      join(outputDirectory, GENERIC_H1_EXTERNAL_JOB_FILES.manifest),
    );
    expect(() =>
      prepareGenericH1ExternalJob({ ...paths, outputDirectory }),
    ).toThrow(/already exists/i);
    expect(
      fileSha256(join(outputDirectory, GENERIC_H1_EXTERNAL_JOB_FILES.manifest)),
    ).toBe(before);
  });

  it("runs through the documented tsx CLI", () => {
    const directory = temporaryDirectory();
    const paths = writeFixture(directory, false);
    const outputDirectory = join(directory, "cli-job");
    const command = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/prepare_generic_h1_external_job.ts",
        "--system",
        paths.systemPath,
        "--action",
        paths.actionPath,
        "--output-dir",
        outputDirectory,
        "--matrix-write-batch-bytes",
        "8",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    expect(command.status, command.stderr || command.stdout).toBe(0);
    expect(JSON.parse(command.stdout)).toMatchObject({
      status: "prepared",
      rows: 1,
      columns: 1,
      nonzeroCount: 1,
    });
    expect(existsSync(join(outputDirectory, "manifest.json"))).toBe(true);
  });
});
