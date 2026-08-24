import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { beforeAll, describe, expect, it } from "vitest";

import compact5Cube from "../src/examples/compact_5_cube_gamma1.json";
import {
  adaptExactPermutationCertificate,
  MAX_EXACT_PERMUTATION_ACTION_DEGREE,
  MAX_EXACT_PERMUTATION_IMAGE_ENTRIES,
  parseExactPermutationActionArtifact,
  replayExactPermutationActionArtifact,
  type ExactPermutationActionArtifact,
  type ExactPermutationValidationReport,
} from "../src/torsionFree/exactPermutationArtifact";
import type { CoxeterSystemInput } from "../src/types";

const CERTIFICATE_PATH =
  "coxeter5cube_index17280/index17280_permutations.json.gz";
const SYSTEM_PATH = "src/examples/compact_5_cube_gamma1.json";
const MANIFEST_PATH = "coxeter5cube_index17280/SHA256SUMS.txt";
const VERIFIER_PATH = "coxeter5cube_index17280/verify_index17280.py";
const EXPECTED_CERTIFICATE_SHA256 =
  "067c1c0683d7bf9bf14cefcdccb008bd09ffbf9b026cb0a6bce9f23db548a8a8";
const EXPECTED_SYSTEM_FILE_SHA256 =
  "3fce0c748df12dd42d5fd04ef113cad7de484429a19aa14b3388e29053d43d4c";

interface RawCertificate extends Record<string, unknown> {
  generators: number[][];
  m3_pairs: number[][];
}

const certificateBytes = readFileSync(CERTIFICATE_PATH);
const systemBytes = readFileSync(SYSTEM_PATH);
const rawCertificate = JSON.parse(
  gunzipSync(certificateBytes).toString("utf8"),
) as RawCertificate;
const system = compact5Cube as CoxeterSystemInput;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function buildArtifact(): ExactPermutationActionArtifact {
  return adaptExactPermutationCertificate(system, rawCertificate, {
    candidateId: "compact-5-cube-index-17280",
    candidateName: "Compact 5-cube exact index-17280 action",
    callerAssertedProvenance: {
      sourceArtifact: {
        path: CERTIFICATE_PATH,
        sha256: sha256(certificateBytes),
        encoding: "gzip-json",
      },
      sourceSystemFile: {
        path: SYSTEM_PATH,
        sha256: sha256(systemBytes),
      },
      checksum: {
        manifestPath: MANIFEST_PATH,
        expectedSha256: EXPECTED_CERTIFICATE_SHA256,
        matched: true,
      },
      bundledVerifier: {
        path: VERIFIER_PATH,
        sha256: sha256(readFileSync(VERIFIER_PATH)),
        status: "not-run",
      },
    },
  });
}

describe("generic exact permutation certificate import", () => {
  let artifact: ExactPermutationActionArtifact;
  let report: ExactPermutationValidationReport;

  beforeAll(() => {
    artifact = buildArtifact();
    report = replayExactPermutationActionArtifact(artifact);
  });

  it("binds the compressed source, system, generator ordering, and exact rows", () => {
    expect(sha256(certificateBytes)).toBe(EXPECTED_CERTIFICATE_SHA256);
    expect(sha256(systemBytes)).toBe(EXPECTED_SYSTEM_FILE_SHA256);
    expect(readFileSync(MANIFEST_PATH, "utf8")).toContain(
      `${EXPECTED_CERTIFICATE_SHA256}  index17280_permutations.json.gz`,
    );

    expect(artifact).toMatchObject({
      schemaVersion: 1,
      kind: "coxeter-exact-permutation-action",
      action: {
        id: "compact-5-cube-index-17280",
        index: 17_280,
        backend: "exact-permutation-certificate",
      },
      sourceCertificate: {
        sourcePresentationMetadataMatched: true,
        sourceConstructionReplayed: false,
      },
      provenance: {
        adapter: "coxeter-viewer-exact-permutation-adapter-v1",
        evidenceStatus: "caller-asserted-to-adapter",
        sourceArtifact: {
          sha256: EXPECTED_CERTIFICATE_SHA256,
          encoding: "gzip-json",
        },
        sourceSystemFile: { sha256: EXPECTED_SYSTEM_FILE_SHA256 },
        checksum: { matched: true },
        bundledVerifier: { status: "not-run" },
      },
    });
    expect(artifact.generatorMapping).toHaveLength(10);
    expect(artifact.generatorMapping[0]).toMatchObject({
      index: 0,
      certificateName: "s0",
      systemGeneratorId: "g0",
    });
    expect(artifact.action.generatorImages).toHaveLength(10);
    expect(artifact.action.generatorImages[0]).toHaveLength(17_280);
    expect(artifact.actionCanonicalSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(
      artifact.nonClaims.some((claim) =>
        claim.includes("packed-composite-permutation-module-solver"),
      ),
    ).toBe(true);
  });

  it("replays torsion-freeness and emits only compact Davis/link counts", () => {
    expect(report.status).toBe("passed");
    expect(Object.values(report.certificate.checks)).toEqual(
      Array(9).fill(true),
    );
    expect(report.action).toMatchObject({
      index: 17_280,
      generatorCount: 10,
      generatorImageEntryCount: 172_800,
      canonicalSha256: artifact.actionCanonicalSha256,
    });
    expect(report.sourceBinding.evidenceStatus).toBe(
      "caller-asserted-to-adapter",
    );
    expect(report.sphericalPlan).toMatchObject({
      status: "complete",
      candidateSubsetCount: { decimal: "1023", safeInteger: 1023 },
      checkedSubsetCount: 1023,
      sphericalSubsetCount: 242,
      maximalSphericalSubsetCount: 32,
      indexLowerBound: { decimal: "5760", safeInteger: 5760 },
    });
    expect(report.compactDavisQuotient).toMatchObject({
      status: "derived-without-materialization",
      quotientMaterialized: false,
      fullDavisPosetMaterialized: false,
      cellCountByDimension: {
        "0": { decimal: "17280", safeInteger: 17_280 },
        "1": { decimal: "86400", safeInteger: 86_400 },
        "2": { decimal: "158400", safeInteger: 158_400 },
        "3": { decimal: "129600", safeInteger: 129_600 },
        "4": { decimal: "45396", safeInteger: 45_396 },
        "5": { decimal: "5076", safeInteger: 5076 },
      },
      totalCellCount: { decimal: "442152", safeInteger: 442_152 },
      eulerCharacteristic: { decimal: "0", safeInteger: 0 },
    });
    expect(report.localLink).toMatchObject({
      coefficientRing: "F2",
      simplexCountByDimension: {
        "0": 10,
        "1": 40,
        "2": 80,
        "3": 80,
        "4": 32,
      },
      bettiNumbers: {
        "0": 1,
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 1,
      },
    });

    const compactJson = JSON.stringify(report);
    expect(compactJson).not.toContain("generatorImages");
    expect(compactJson.length).toBeLessThan(20_000);
  });

  it("rejects source Coxeter/pair metadata mismatches", () => {
    const mismatchedCertificate = {
      ...rawCertificate,
      m3_pairs: rawCertificate.m3_pairs.slice(1),
    };
    expect(() =>
      adaptExactPermutationCertificate(system, mismatchedCertificate, {
        callerAssertedProvenance: artifact.provenance,
      }),
    ).toThrow(/pair metadata does not match/u);
  });

  it("rejects checksum, source-hash, and action-payload mismatches", () => {
    const badChecksum = {
      ...artifact,
      provenance: {
        ...artifact.provenance,
        checksum: {
          ...artifact.provenance.checksum,
          expectedSha256: "0".repeat(64),
          matched: true,
        },
      },
    };
    expect(() => parseExactPermutationActionArtifact(badChecksum)).toThrow(
      /checksum-manifest digest does not match/u,
    );

    const tamperedChecksumEvidence = structuredClone(artifact);
    if (tamperedChecksumEvidence.provenance.checksum === undefined) {
      throw new Error("Test artifact must include checksum evidence.");
    }
    tamperedChecksumEvidence.provenance.checksum.manifestPath =
      "different/SHA256SUMS.txt";
    expect(() =>
      parseExactPermutationActionArtifact(tamperedChecksumEvidence),
    ).toThrow(/actionCanonicalSha256 does not match/u);

    const tamperedVerifierEvidence = structuredClone(artifact);
    if (tamperedVerifierEvidence.provenance.bundledVerifier === undefined) {
      throw new Error("Test artifact must include verifier evidence.");
    }
    tamperedVerifierEvidence.provenance.bundledVerifier.status = "passed";
    expect(() =>
      parseExactPermutationActionArtifact(tamperedVerifierEvidence),
    ).toThrow(/actionCanonicalSha256 does not match/u);

    const unboundPassedVerifier = structuredClone(artifact);
    if (unboundPassedVerifier.provenance.bundledVerifier === undefined) {
      throw new Error("Test artifact must include verifier evidence.");
    }
    delete unboundPassedVerifier.provenance.bundledVerifier.sha256;
    unboundPassedVerifier.provenance.bundledVerifier.status = "passed";
    expect(() =>
      parseExactPermutationActionArtifact(unboundPassedVerifier),
    ).toThrow(/sha256 is required when status is passed/u);

    const unlocatedPassedVerifier = structuredClone(artifact);
    if (unlocatedPassedVerifier.provenance.bundledVerifier === undefined) {
      throw new Error("Test artifact must include verifier evidence.");
    }
    delete unlocatedPassedVerifier.provenance.bundledVerifier.path;
    delete unlocatedPassedVerifier.provenance.bundledVerifier.command;
    unlocatedPassedVerifier.provenance.bundledVerifier.status = "passed";
    expect(() =>
      parseExactPermutationActionArtifact(unlocatedPassedVerifier),
    ).toThrow(/path or command is required when status is passed/u);

    const retargetedSource = {
      ...artifact,
      provenance: {
        ...artifact.provenance,
        sourceArtifact: {
          ...artifact.provenance.sourceArtifact,
          sha256: "1".repeat(64),
        },
        checksum: {
          ...artifact.provenance.checksum,
          expectedSha256: "1".repeat(64),
          matched: true,
        },
      },
    };
    expect(() => parseExactPermutationActionArtifact(retargetedSource)).toThrow(
      /actionCanonicalSha256 does not match/u,
    );

    const tamperedAction = structuredClone(artifact);
    const firstRow = tamperedAction.action.generatorImages[0];
    [firstRow[0], firstRow[1]] = [firstRow[1], firstRow[0]];
    expect(() => parseExactPermutationActionArtifact(tamperedAction)).toThrow(
      /actionCanonicalSha256 does not match/u,
    );
  });

  it("enforces the declared zero-based convention and bounded action size", () => {
    expect(MAX_EXACT_PERMUTATION_ACTION_DEGREE).toBeGreaterThanOrEqual(311_040);
    expect(MAX_EXACT_PERMUTATION_IMAGE_ENTRIES).toBeGreaterThanOrEqual(
      3_110_400,
    );
    const oneBasedDeclaration = structuredClone(artifact);
    oneBasedDeclaration.sourceCertificate.declaredIndexing =
      "one-based permutation rows";
    expect(() =>
      parseExactPermutationActionArtifact(oneBasedDeclaration),
    ).toThrow(/must declare zero-based/u);

    const oversizedCertificate = {
      ...rawCertificate,
      degree: MAX_EXACT_PERMUTATION_ACTION_DEGREE + 1,
    };
    expect(() =>
      adaptExactPermutationCertificate(system, oversizedCertificate, {
        callerAssertedProvenance: artifact.provenance,
      }),
    ).toThrow(/exceeds the adapter limit/u);
  });
});
