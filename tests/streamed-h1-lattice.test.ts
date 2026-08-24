import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { beforeAll, describe, expect, it } from "vitest";

import compact5Cube from "../src/examples/compact_5_cube_gamma1.json";
import {
  completeStreamedH1Lattice,
  parseStreamedH1IntegralCoreBasis,
} from "../src/fibering/streamedH1Completion";
import { parseStreamedH1ModularCoreTranscript } from "../src/fibering/streamedH1ModularTranscript";
import {
  certifyStreamedH1Lattice,
  COMPACT_5_CUBE_WALL_COORDINATES,
  prepareStreamedH1Lattice,
  type StreamedH1ExactModularCoreRankWitness,
  type StreamedH1LatticePreparation,
} from "../src/fibering/streamedH1Lattice";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import { buildExactZ2CharacterLift } from "../src/torsionFree/derivedCharacterLift";
import type { TorsionFreeActionCandidate } from "../src/torsionFree";

const ACTION_PATH = "coxeter5cube_index17280/index17280_permutations.json.gz";
const CHARACTER = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0] as const;
const PARENT_ROWS_SHA256 =
  "12e71c16b8698bce5a4ae3b3638a2613efd6e726c7baa9ae5b513b7eae6c393f";
const DERIVED_ROWS_SHA256 =
  "8b7782b43e64a1dc9da058fb198d029f60895ebfa9ca896986a2046cb4794d24";

const EXPECTED_PREPARATION_DIGEST =
  "6ca90097bf595a8ddc011e7fdb8b5b64fa9f5017a9b598c78b662b68964a5956";
const EXPECTED_CORE_DIGEST =
  "1437c25d58780bfa0818d2789bdc684932b4c799bfdfd44d307a5ed2aab9e99a";
const EXPECTED_LEDGER_DIGEST =
  "5ec3ec68d6aea009afde18942f7a5147efba9063c1305aa1f654e17c6711c5bc";
const EXPECTED_LATTICE_BASIS_DIGEST =
  "108cd3a4bfcb6417a707d03bedd2af73bc01c3439a72d49b6d3db70f46900c86";
const EXPECTED_COCYCLE_SECTION_DIGEST =
  "c1d28da8e1eae77cd124b7b63bfa6650f344c401c34e09cccbd7b364bfbff27b";
const CORE_BASIS_PATH =
  "scripts/certificates/torsion-free/compact_5_cube_h1_integral_core_basis.txt.gz";
const MODULAR_BASIS_PATHS = [
  {
    prime: 30_011,
    path: "scripts/certificates/torsion-free/compact_5_cube_h1_modular_basis_p30011.txt.gz",
    normalizedDigest:
      "8b4e12794d9bf1c4c21e0bd0f0f0cd00d778de500dbe929ae98f44db95d3d21d",
  },
  {
    prime: 32_749,
    path: "scripts/certificates/torsion-free/compact_5_cube_h1_modular_basis_p32749.txt.gz",
    normalizedDigest:
      "69202a4d2ab2649c481d8dea0f28f36040e5fe8c9ba32b224e2cfcabf370776d",
  },
] as const;

interface RawIndex17280Certificate {
  degree: number;
  generators: number[][];
}

function exactAction(): TorsionFreeActionCandidate {
  const raw = JSON.parse(
    gunzipSync(readFileSync(ACTION_PATH)).toString("utf8"),
  ) as RawIndex17280Certificate;
  return {
    id: "compact-5-cube-index-17280-h1-test",
    name: "Compact 5-cube H1 test source",
    index: raw.degree,
    generatorImages: raw.generators,
    backend: "exact-permutation-certificate",
  };
}

function rankWitness(
  preparation: StreamedH1LatticePreparation,
  overrides: Partial<StreamedH1ExactModularCoreRankWitness> = {},
): StreamedH1ExactModularCoreRankWitness {
  const certificate = preparation.certificate;
  return {
    schemaVersion: 1,
    kind: "streamed-h1-exact-modular-core-rank-witness",
    status: "passed",
    preparationDigest: certificate.preparationDigest,
    coreMatrixDigest: certificate.peel.coreMatrixDigest,
    ledgerDigest: certificate.peel.ledgerDigest,
    modulusPrime: 30_011,
    rowCount: certificate.peel.nonpivotRowCount,
    columnCount: certificate.peel.unresolvedColumnCount,
    rank: certificate.peel.unresolvedColumnCount,
    exactFieldArithmetic: true,
    backend: "unit-test-injected-exact-field-witness",
    backendVersion: "1",
    algorithm: "unit-test-certificate-binding",
    transcriptSha256: "a".repeat(64),
    normalizedKernelBasisSha256: "b".repeat(64),
    identityChartColumns: [
      0, 3, 7, 12, 15, 24, 30, 18_947, 18_950, 18_956, 18_959, 62_888, 62_889,
      62_906, 62_907,
    ],
    identityChartInvertible: true,
    normalizedBasisMatchesIntegralCoreBasis: true,
    ...overrides,
  };
}

function payload(path: string): { text: string; sha256: string } {
  const compressed = readFileSync(path);
  const decoded = gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 });
  return {
    text: decoded.toString("ascii"),
    sha256: createHash("sha256").update(decoded).digest("hex"),
  };
}

describe("streamed integral H1 lattice", () => {
  let preparation: StreamedH1LatticePreparation;
  let oracle: ReturnType<typeof buildStreamedLawfulDavisOracle>;

  beforeAll(() => {
    const lift = buildExactZ2CharacterLift(
      compact5Cube,
      exactAction(),
      CHARACTER,
      {
        candidateId: "compact-5-cube-index-34560-h1-test",
        expectedParentRowsSha256: PARENT_ROWS_SHA256,
        expectedDerivedRowsSha256: DERIVED_ROWS_SHA256,
      },
    );
    expect(lift.certificate.status).toBe("accepted");
    if (!lift.acceptedCandidate) {
      throw new Error("The exact character lift was unexpectedly rejected.");
    }
    oracle = buildStreamedLawfulDavisOracle({
      system: compact5Cube,
      generatorImages: lift.acceptedCandidate.generatorImages,
    });
    preparation = prepareStreamedH1Lattice(oracle);
  }, 120_000);

  it("binds the saturated wall lattice, boundary, peel ledger, and raw core", () => {
    const certificate = preparation.certificate;

    expect(certificate).toMatchObject({
      status: "prepared",
      degree: 34_560,
      graph: {
        vertexCount: 34_560,
        geometricEdgeCount: 172_800,
        treeEdgeCount: 34_559,
        cotreeEdgeCount: 138_241,
      },
      boundary: {
        rowCount: 316_800,
        columnCount: 138_241,
        nonzeroCount: 1_105_928,
        duplicateBoundaryEdgeCount: 0,
      },
      peel: {
        seedColumnCount: 4,
        pivotCount: 50_287,
        unresolvedColumnCount: 87_950,
        nonpivotRowCount: 266_513,
        coreNonzeroCount: 703_600,
        lowerBoundIfCoreHasFullColumnRank: 138_237,
      },
      saturation: {
        seedBetaDeterminant: "-1",
        rawWallRank: 4,
        saturationRank: 4,
        wallIndexInSaturation: "2",
        quotientInvariantFactors: ["2"],
        determinantProof: {
          determinantalDivisors: ["1", "1", "1", "2"],
          smithInvariantFactors: ["1", "1", "1", "2"],
          verified: true,
        },
      },
      preparationDigest: EXPECTED_PREPARATION_DIGEST,
      latticeBasisDigest: EXPECTED_LATTICE_BASIS_DIGEST,
      cocycleSectionDigest: EXPECTED_COCYCLE_SECTION_DIGEST,
    });
    expect(certificate.peel.coreMatrixDigest).toBe(EXPECTED_CORE_DIGEST);
    expect(certificate.peel.ledgerDigest).toBe(EXPECTED_LEDGER_DIGEST);
    expect(certificate.wallCoordinates).toEqual(
      COMPACT_5_CUBE_WALL_COORDINATES,
    );
    expect(Object.values(certificate.checks).every(Boolean)).toBe(true);
    expect(
      preparation.wallSaturationCocycleBasis.expectedCocycleSectionDigest,
    ).toBe(EXPECTED_COCYCLE_SECTION_DIGEST);

    let coreRowCount = 0;
    let coreNonzeroCount = 0;
    preparation.forEachCoreRow((row) => {
      expect(row.sourceRowIndex).toBeGreaterThanOrEqual(0);
      coreRowCount += 1;
      coreNonzeroCount += row.entries.length;
    });
    expect(coreRowCount).toBe(certificate.peel.nonpivotRowCount);
    expect(coreNonzeroCount).toBe(certificate.peel.coreNonzeroCount);

    let pivotCount = 0;
    preparation.forEachPeelPivot((pivot) => {
      expect(pivot.step).toBe(pivotCount);
      expect(Math.abs(pivot.coefficient)).toBe(1);
      pivotCount += 1;
    });
    expect(pivotCount).toBe(certificate.peel.pivotCount);
  }, 30_000);

  it("retires the disproved rank-four completion path", () => {
    const certificate = certifyStreamedH1Lattice(
      preparation,
      rankWitness(preparation),
    );

    expect(certificate).toMatchObject({
      status: "failed",
      preparationDigest: EXPECTED_PREPARATION_DIGEST,
      latticeBasisDigest: EXPECTED_LATTICE_BASIS_DIGEST,
      cocycleSectionDigest: EXPECTED_COCYCLE_SECTION_DIGEST,
      checks: {
        sourceBindingMatches: true,
        coreBindingMatches: true,
        ledgerBindingMatches: true,
        modulusIsPrime: true,
        exactFieldArithmetic: true,
        witnessDimensionsMatch: true,
        coreHasFullColumnRank: true,
        rationalBoundaryRankHitsUpperBound: true,
      },
      result: {
        h1Rank: null,
        h1IsomorphicTo: "not-certified",
        integralBasisIds: [],
        wallSublatticeRank: 4,
        wallSublatticeIndex: null,
        wallSaturationEqualsFullH1: false,
      },
    });
    expect(certificate.errors).toContain(
      "The former rank-four completion path is retired: the exact core has nullity fifteen. Use completeStreamedH1Lattice with the integral core frame.",
    );
    expect(certificate.certificateDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("replays the tracked rank-nineteen integral frame and two normalized modular transcripts", () => {
    const integralPayload = payload(CORE_BASIS_PATH);
    const coreBasis = parseStreamedH1IntegralCoreBasis(integralPayload.text, {
      sourceArtifactSha256: integralPayload.sha256,
      expectedCoreColumnCount:
        preparation.certificate.peel.unresolvedColumnCount,
      expectedCoreRowCount: preparation.certificate.peel.nonpivotRowCount,
    });
    const parsedTranscripts = MODULAR_BASIS_PATHS.map((artifact) => {
      const transcript = payload(artifact.path);
      const parsed = parseStreamedH1ModularCoreTranscript(transcript.text, {
        sourceArtifactSha256: transcript.sha256,
        modulusPrime: artifact.prime,
        preparation,
        integralCoreBasis: coreBasis,
        backend: "LinBox/Givaro",
        backendVersion: "1.7.0-4/4.2.0",
        algorithm:
          "GaussDomain::InPlaceLinearPivoting + GaussDomain::nullspacebasis",
      });
      expect(parsed.witness).toMatchObject({
        rank: 87_935,
        identityChartInvertible: true,
        normalizedBasisMatchesIntegralCoreBasis: true,
        normalizedKernelBasisSha256: artifact.normalizedDigest,
      });
      expect(parsed.normalizedComparisonEntryCount).toBe(87_950 * 15);
      return parsed;
    });
    const completion = completeStreamedH1Lattice({
      oracle,
      preparation,
      coreBasis,
      modularRankWitnesses: parsedTranscripts.map(
        (transcript) => transcript.witness,
      ),
    });
    expect(completion.certificate).toMatchObject({
      status: "passed",
      fullLatticeBasisDigest:
        "1a8a65a2c01ab263911558864bc51b85dc551c05a7691ffc0088b8c1ca08951e",
      fullCocycleSectionDigest:
        "ed6176b687e6487a03b01bbcccc4304cce72b3812069d4e2020773cb83914f3d",
      checks: {
        exactCoreBoundaryReplay: true,
        coreIdentityMinor: true,
        modularWitnessPrimesDistinct: true,
        modularKernelFramesMatch: true,
        rationalBoundaryRankIs138222: true,
        fullCoordinateMinorUnimodular: true,
        directedEdgeReversal: true,
        everyRankTwoBoundaryCloses: true,
      },
      replay: {
        coreBoundaryRowCount: 266_513,
        coreBoundaryNonzeroResidualCount: 0,
        coreBoundaryReplayDigest:
          "8a779756819919c7441ca5715ac3d915177cc9c36f5edd487342a6139feade5a",
        directedEdgeCount: 345_600,
        reversalFailureCount: 0,
        rankTwoBoundaryCount: 316_800,
        rankTwoBoundaryNonzeroResidualCount: 0,
        fullBoundaryReplayDigest:
          "80169d3311727c9a506763046e96765f24927072bcde75dcd4527cd2b49fbdc3",
      },
      result: {
        h1Rank: 19,
        h1IsomorphicTo: "Z^19",
        wallSublatticeRank: 4,
        wallSublatticeIndexInSaturation: 2,
        wallSublatticeIndexInFullH1: "infinite",
        quotientByWallLattice: "Z^15 + Z/2",
      },
      errors: [],
    });
  }, 120_000);

  it.each([
    ["source", "preparationDigest", "sourceBindingMatches"],
    ["core", "coreMatrixDigest", "coreBindingMatches"],
    ["ledger", "ledgerDigest", "ledgerBindingMatches"],
  ] as const)(
    "rejects a tampered %s binding",
    (_label, witnessField, checkField) => {
      const certificate = certifyStreamedH1Lattice(
        preparation,
        rankWitness(preparation, { [witnessField]: "0".repeat(64) }),
      );

      expect(certificate.status).toBe("failed");
      expect(certificate.checks[checkField]).toBe(false);
      expect(certificate.errors).toContain(
        `H^1 certification check failed: ${checkField}.`,
      );
      expect(certificate.result).toMatchObject({
        h1Rank: null,
        h1IsomorphicTo: "not-certified",
        integralBasisIds: [],
        wallSublatticeIndex: null,
        wallSaturationEqualsFullH1: false,
      });
    },
  );

  it("rejects a deficient or backend-failed rank witness", () => {
    const deficient = certifyStreamedH1Lattice(
      preparation,
      rankWitness(preparation, {
        rank: preparation.certificate.peel.unresolvedColumnCount - 1,
      }),
    );
    expect(deficient.status).toBe("failed");
    expect(deficient.checks).toMatchObject({
      coreHasFullColumnRank: false,
      rationalBoundaryRankHitsUpperBound: false,
    });

    const backendFailed = certifyStreamedH1Lattice(
      preparation,
      rankWitness(preparation, { status: "failed" }),
    );
    expect(backendFailed.status).toBe("failed");
    expect(backendFailed.checks).toMatchObject({
      coreHasFullColumnRank: false,
      rationalBoundaryRankHitsUpperBound: true,
    });
  });

  it.each([
    ["composite modulus", { modulusPrime: 30_012 }, "modulusIsPrime"],
    [
      "inexact arithmetic",
      { exactFieldArithmetic: false },
      "exactFieldArithmetic",
    ],
    ["wrong row count", { rowCount: 266_512 }, "witnessDimensionsMatch"],
  ] as const)("rejects %s", (_label, overrides, failedCheck) => {
    const certificate = certifyStreamedH1Lattice(
      preparation,
      rankWitness(preparation, overrides),
    );

    expect(certificate.status).toBe("failed");
    expect(certificate.checks[failedCheck]).toBe(false);
  });

  it("rejects an unbound transcript digest", () => {
    const certificate = certifyStreamedH1Lattice(
      preparation,
      rankWitness(preparation, { transcriptSha256: "not-a-sha256" }),
    );

    expect(certificate.status).toBe("failed");
    expect(certificate.errors).toContain(
      "The modular-rank transcript digest is not a lowercase SHA-256 hash.",
    );
  });
});
