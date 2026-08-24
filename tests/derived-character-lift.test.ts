import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import compact5Cube from "../src/examples/compact_5_cube_gamma1.json";
import {
  buildExactZ2CharacterLift,
  type ExactZ2CharacterLiftResult,
} from "../src/torsionFree/derivedCharacterLift";
import type { CoxeterSystemInput } from "../src/types";

const GAMMA1_PARENT_ROWS_SHA256 =
  "12e71c16b8698bce5a4ae3b3638a2613efd6e726c7baa9ae5b513b7eae6c393f";
const GAMMA1_DERIVED_ROWS_SHA256 =
  "8b7782b43e64a1dc9da058fb198d029f60895ebfa9ca896986a2046cb4794d24";

const a2: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "A2 character-lift test",
  rank: 2,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
  ],
  coxeterMatrix: [
    [1, 3],
    [3, 1],
  ],
};

const trivialA2Action = {
  id: "a2-trivial-action",
  index: 1,
  generatorImages: [[0], [0]],
};

describe("exact Z/2 character lifts", () => {
  it("constructs and accepts the exact product action", () => {
    const result = buildExactZ2CharacterLift(a2, trivialA2Action, [1, 1], {
      candidateId: "a2-sign-action",
    });

    expect(result.certificate).toMatchObject({
      status: "accepted",
      character: {
        values: [1, 1],
        oddEdgeComponents: [[0, 1]],
        relationViolations: [],
      },
      pointEncoding: {
        formula: "2 * parentPoint + sheetBit",
      },
      derivedAction: {
        candidateId: "a2-sign-action",
        index: 2,
        generatorCount: 2,
        generatorImageEntryCount: 4,
      },
    });
    expect(Object.values(result.certificate.checks)).toEqual(
      Array(11).fill(true),
    );
    expect(result.acceptedCandidate).toMatchObject({
      id: "a2-sign-action",
      index: 2,
      generatorImages: [
        [1, 0],
        [1, 0],
      ],
      backend: "exact-z2-character-lift",
      backendVersion: "1",
    });
    expect(result.certificate.derivedAction.rowsCanonicalSha256).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(result.certificate.nonClaims).toContain(
      "The exact-z2-character-lift backend is not the packed-composite-permutation-module solver.",
    );
  });

  it("rejects a generator assignment that violates an odd Coxeter edge", () => {
    const result = buildExactZ2CharacterLift(a2, trivialA2Action, [1, 0]);

    expect(result.certificate.status).toBe("rejected");
    expect(result.acceptedCandidate).toBeUndefined();
    expect(result.certificate.character.relationViolations).toEqual([
      {
        generatorPair: [0, 1],
        exponent: 3,
        values: [1, 0],
      },
    ]);
    expect(result.certificate.witnesses.map((witness) => witness.kind)).toEqual(
      expect.arrayContaining([
        "character-relation-failure",
        "derived-relation-failure",
      ]),
    );
  });

  it("rejects an intransitive doubled action and expected-hash mismatch", () => {
    const result = buildExactZ2CharacterLift(a2, trivialA2Action, [0, 0], {
      expectedParentRowsSha256: "0".repeat(64),
    });

    expect(result.certificate.status).toBe("rejected");
    expect(result.acceptedCandidate).toBeUndefined();
    expect(result.certificate.checks).toMatchObject({
      derivedTransitive: false,
      parentRowsSha256MatchesExpectation: false,
    });
    expect(result.certificate.witnesses.map((witness) => witness.kind)).toEqual(
      expect.arrayContaining([
        "derived-intransitive",
        "parent-row-hash-mismatch",
      ]),
    );
  });

  it("rejects malformed character entries and non-permutation parent rows", () => {
    expect(() =>
      buildExactZ2CharacterLift(a2, trivialA2Action, [1, 2]),
    ).toThrow(/character\[1\] must be 0 or 1/u);
    expect(() =>
      buildExactZ2CharacterLift(
        a2,
        {
          id: "bad-parent",
          index: 2,
          generatorImages: [
            [0, 0],
            [1, 0],
          ],
        },
        [1, 1],
      ),
    ).toThrow(/is not a permutation/u);
  });
});

interface RawIndex17280Certificate {
  degree: number;
  generators: number[][];
}

function buildGamma1Lift(): ExactZ2CharacterLiftResult {
  const raw = JSON.parse(
    gunzipSync(
      readFileSync("coxeter5cube_index17280/index17280_permutations.json.gz"),
    ).toString("utf8"),
  ) as RawIndex17280Certificate;
  return buildExactZ2CharacterLift(
    compact5Cube,
    {
      id: "compact-5-cube-index-17280",
      name: "Compact 5-cube exact index-17280 action",
      index: raw.degree,
      generatorImages: raw.generators,
      backend: "exact-permutation-certificate",
    },
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    {
      candidateId: "compact-5-cube-index-34560-character-cover",
      expectedParentRowsSha256: GAMMA1_PARENT_ROWS_SHA256,
      expectedDerivedRowsSha256: GAMMA1_DERIVED_ROWS_SHA256,
    },
  );
}

describe("Gamma1 index-34560 character cover", () => {
  it("is an exact transitive Coxeter action with the declared 2q+b encoding", () => {
    const result = buildGamma1Lift();

    expect(result.certificate.status).toBe("accepted");
    expect(result.certificate.character).toMatchObject({
      values: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      oddEdgeComponents: [
        [0, 1, 2, 3, 4, 5, 6, 7],
        [8, 9],
      ],
      relationViolations: [],
    });
    expect(result.certificate.derivedAction).toMatchObject({
      index: 34_560,
      generatorCount: 10,
      generatorImageEntryCount: 345_600,
      rowsCanonicalSha256: GAMMA1_DERIVED_ROWS_SHA256,
    });
    expect(result.certificate.parentAction.rowsCanonicalSha256).toBe(
      GAMMA1_PARENT_ROWS_SHA256,
    );
    expect(result.certificate.checks).toMatchObject({
      characterRespectsOddCoxeterRelations: true,
      derivedRowsInBoundsAndPermutations: true,
      derivedTransitive: true,
      derivedGeneratorsInvolutive: true,
      derivedCoxeterRelations: true,
    });
    expect(result.acceptedCandidate).toBeDefined();

    const rows = result.acceptedCandidate?.generatorImages;
    expect(rows?.[0][0]).toBe(2 * 12_894 + 1);
    expect(rows?.[0][1]).toBe(2 * 12_894);
    expect(rows?.[8][0]).toBe(2 * 132);
    expect(rows?.[8][1]).toBe(2 * 132 + 1);
  });
});
