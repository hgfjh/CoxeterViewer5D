import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import compact5Cube from "../src/examples/compact_5_cube_gamma1.json";
import { computeGeneralizedLawfulDirectedLinkAtPointFromStreamed } from "../src/fibering/generalizedLawfulCertificate";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import { buildExactZ2CharacterLift } from "../src/torsionFree/derivedCharacterLift";

interface RawIndex17280Certificate {
  degree: number;
  generators: number[][];
}

const PARENT_ROWS_SHA256 =
  "12e71c16b8698bce5a4ae3b3638a2613efd6e726c7baa9ae5b513b7eae6c393f";
const DERIVED_ROWS_SHA256 =
  "8b7782b43e64a1dc9da058fb198d029f60895ebfa9ca896986a2046cb4794d24";
const CHARACTER = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0] as const;
const SURVIVOR_MASKS = [
  0x186, 0x18d, 0x196, 0x19d, 0x1e2, 0x1e9, 0x1f2, 0x1f9, 0x206, 0x20d, 0x216,
  0x21d, 0x262, 0x269, 0x272, 0x279,
];
const FULL_CELL_COUNTS = {
  "0": 34_560,
  "1": 172_800,
  "2": 316_800,
  "3": 259_200,
  "4": 90_792,
  "5": 10_152,
};
const RETAINED_CELL_COUNTS = {
  "0": 34_560,
  "1": 172_800,
  "2": 300_024,
  "3": 214_056,
  "4": 56_052,
  "5": 3_132,
};

function componentSizes(components: readonly (readonly string[])[]): number[] {
  return components.map((component) => component.length).sort((a, b) => b - a);
}

describe("compact 5-cube corrected generalized lawful calculation", () => {
  it("reconstructs all canonical candidates and checks an actual pulled-link obstruction", () => {
    const raw = JSON.parse(
      gunzipSync(
        readFileSync("coxeter5cube_index17280/index17280_permutations.json.gz"),
      ).toString("utf8"),
    ) as RawIndex17280Certificate;
    const lift = buildExactZ2CharacterLift(
      compact5Cube,
      {
        id: "compact-5-cube-index-17280",
        name: "Compact 5-cube exact index-17280 action",
        index: raw.degree,
        generatorImages: raw.generators,
        backend: "exact-permutation-certificate",
      },
      CHARACTER,
      {
        candidateId: "compact-5-cube-index-34560-character-cover",
        expectedParentRowsSha256: PARENT_ROWS_SHA256,
        expectedDerivedRowsSha256: DERIVED_ROWS_SHA256,
      },
    );
    expect(lift.certificate.status).toBe("accepted");
    expect(lift.certificate.character.values).toEqual(CHARACTER);
    expect(lift.certificate.parentAction.rowsCanonicalSha256).toBe(
      PARENT_ROWS_SHA256,
    );
    expect(lift.certificate.derivedAction.rowsCanonicalSha256).toBe(
      DERIVED_ROWS_SHA256,
    );
    if (!lift.acceptedCandidate) {
      throw new Error("The exact character lift was unexpectedly rejected.");
    }

    const oracle = buildStreamedLawfulDavisOracle({
      system: compact5Cube,
      generatorImages: lift.acceptedCandidate.generatorImages,
    });
    expect(oracle.degree).toBe(34_560);
    expect(oracle.walls).toMatchObject({
      wallCount: 10,
      twoSided: true,
    });
    expect(oracle.walls.walls.every((wall) => wall.twoSided)).toBe(true);
    expect(oracle.rankTwoCellCount).toBe(316_800);
    expect(oracle.cellCountByDimension).toEqual(FULL_CELL_COUNTS);
    expect(oracle.cellCount).toBe(884_304);

    const prefilter = oracle.enumerateNativeVertexLinkPrefilter();
    expect(prefilter.survivorMasks).toEqual(SURVIVOR_MASKS);
    expect(prefilter.survivorCandidates).toHaveLength(16);
    for (const mask of SURVIVOR_MASKS) {
      expect(prefilter.maskSummaries[mask]).toMatchObject({
        mask,
        passed: true,
        lawfulRankTwoCellCount: 300_024,
      });
    }

    const evaluation = oracle.bindCoorientations(prefilter.survivorCandidates);
    expect(evaluation.closure.status).toBe("passed");
    expect(evaluation.closure.downwardClosureViolationCount).toBe(0);
    for (const candidate of evaluation.closure.candidateSummaries) {
      expect(candidate.retainedCellCountByDimension).toEqual(
        RETAINED_CELL_COUNTS,
      );
      expect(candidate.retainedCellCount).toBe(780_624);
      expect(candidate.downwardClosureViolationCount).toBe(0);
    }

    // A zero witness limit retains no bulky examples, but still exhausts
    // every vertex/spherical-type pair for the exact metric-flag count.
    for (let candidateIndex = 0; candidateIndex < 16; candidateIndex += 1) {
      const metric = evaluation.checkMoussongMetricFlag(candidateIndex, 0);
      expect(metric).toMatchObject({
        status: "not-established",
        checkedPointTypePairs: 6_635_520,
        violationCount: 701_136,
        metricallyFlag: false,
        locallyCatZero: false,
        universalCoverContractibleByMoussongMetric: false,
        witnesses: [],
      });
    }

    const mask186Index = prefilter.survivorMasks.indexOf(0x186);
    expect(mask186Index).toBe(0);
    const q96 = computeGeneralizedLawfulDirectedLinkAtPointFromStreamed({
      oracle,
      evaluation,
      candidateIndex: mask186Index,
      point: 96,
    });
    const q97 = computeGeneralizedLawfulDirectedLinkAtPointFromStreamed({
      oracle,
      evaluation,
      candidateIndex: mask186Index,
      point: 97,
    });

    expect(q96.subdivision.introducedVertexIds).toEqual([]);
    expect(q97.subdivision.introducedVertexIds).toEqual([]);
    expect(q96.descending).toMatchObject({
      vertexCount: 8,
      componentCount: 2,
      nonempty: true,
      connected: false,
    });
    expect(componentSizes(q96.descending.components)).toEqual([7, 1]);
    expect(q97.ascending).toMatchObject({
      vertexCount: 21,
      componentCount: 2,
      nonempty: true,
      connected: false,
    });
    expect(componentSizes(q97.ascending.components)).toEqual([15, 6]);
  }, 90_000);
});
