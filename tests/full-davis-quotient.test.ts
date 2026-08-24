import { describe, expect, it } from "vitest";

import A3 from "../src/examples/A3.json";
import I2_5 from "../src/examples/I2_5.json";
import {
  buildFullDavisQuotientCellPoset,
  FullDavisQuotientError,
} from "../src/davis/fullQuotient";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const I2_5_SYSTEM = I2_5 as CoxeterSystemInput;
const A3_SYSTEM = A3 as CoxeterSystemInput;

function i2RegularAction(m = 5): TorsionFreeActionCandidate {
  const index = 2 * m;
  const encode = (rotation: number, reflected: number): number =>
    2 * ((rotation + m) % m) + reflected;
  return {
    id: `i2-${m}-regular-full-davis-test`,
    index,
    generatorImages: [
      Array.from({ length: index }, (_unused, point) => {
        const rotation = Math.floor(point / 2);
        return encode(rotation, 1 - (point % 2));
      }),
      Array.from({ length: index }, (_unused, point) => {
        const rotation = Math.floor(point / 2);
        return point % 2 === 0
          ? encode(rotation - 1, 1)
          : encode(rotation + 1, 0);
      }),
    ],
    pointLabels: Array.from({ length: index }, (_unused, point) => `d${point}`),
    backend: "test-exact",
  };
}

function permutations(values: number[]): number[][] {
  if (values.length === 0) {
    return [[]];
  }
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_entry, entryIndex) => entryIndex !== index),
    ).map((tail) => [value, ...tail]),
  );
}

function a3RegularAction(): TorsionFreeActionCandidate {
  const elements = permutations([0, 1, 2, 3]);
  const indexByKey = new Map(
    elements.map((element, index) => [element.join(","), index]),
  );
  const generators = [
    [1, 0, 2, 3],
    [0, 2, 1, 3],
    [0, 1, 3, 2],
  ];
  return {
    id: "a3-regular-full-davis-test",
    index: elements.length,
    generatorImages: generators.map((generator) =>
      elements.map((element) => {
        const imagePermutation = generator.map((point) => element[point]);
        const image = indexByKey.get(imagePermutation.join(","));
        if (image === undefined) {
          throw new Error("The regular S4 action fixture is incomplete.");
        }
        return image;
      }),
    ),
    backend: "test-exact",
  };
}

function certify(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): TorsionFreeCandidateResult {
  const certificate = certifyTorsionFreeAction(
    system,
    candidate,
    planSphericalSpecialSubgroups(system),
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
}

describe("full Davis quotient cell poset", () => {
  it("constructs the I2(5) quotient from exact restricted action orbits", () => {
    const accepted = certify(I2_5_SYSTEM, i2RegularAction());
    const first = buildFullDavisQuotientCellPoset(I2_5_SYSTEM, accepted);
    const second = buildFullDavisQuotientCellPoset(I2_5_SYSTEM, accepted);

    expect(second).toEqual(first);
    expect(first.dimension).toBe(2);
    expect(first.vertices).toHaveLength(10);
    expect(first.cellCountByDimension).toEqual({ "0": 10, "1": 10, "2": 1 });
    expect(first.sphericalTypes.map((type) => type.id)).toEqual([
      "T:empty",
      "T:0",
      "T:1",
      "T:0,1",
    ]);
    expect(first.certificate.countChecks).toEqual([
      expect.objectContaining({
        sphericalSubsetId: "T:empty",
        subgroupOrder: 1,
        expectedCellCount: 10,
        actualCellCount: 10,
        passed: true,
      }),
      expect.objectContaining({
        sphericalSubsetId: "T:0",
        subgroupOrder: 2,
        expectedCellCount: 5,
        actualCellCount: 5,
        passed: true,
      }),
      expect.objectContaining({
        sphericalSubsetId: "T:1",
        subgroupOrder: 2,
        expectedCellCount: 5,
        actualCellCount: 5,
        passed: true,
      }),
      expect.objectContaining({
        sphericalSubsetId: "T:0,1",
        subgroupOrder: 10,
        expectedCellCount: 1,
        actualCellCount: 1,
        orbitSizes: [10],
        passed: true,
      }),
    ]);

    const topCell = first.cells.find((cell) => cell.dimension === 2);
    expect(topCell).toBeDefined();
    expect(topCell?.actionPoints).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(topCell?.vertexIds).toHaveLength(10);
    expect(topCell?.facetCellIds).toHaveLength(10);
    expect(topCell?.properFaceCellIds).toHaveLength(20);
    expect(topCell?.incidenceHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(first.posetHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(first.archiveHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.certificate.archiveHash).toBe(first.archiveHash);

    const edgeCells = first.cells.filter((cell) => cell.dimension === 1);
    expect(edgeCells.every((cell) => cell.facetCellIds.length === 2)).toBe(
      true,
    );
    expect(edgeCells.every((cell) => cell.vertexIds.length === 2)).toBe(true);
    expect(first.faceIncidences).toHaveLength(40);
    expect(
      first.faceIncidences.filter((incidence) => incidence.immediate),
    ).toHaveLength(30);
  });

  it("builds every A3 face orbit and the complete rank-three incidence", () => {
    const result = buildFullDavisQuotientCellPoset(
      A3_SYSTEM,
      certify(A3_SYSTEM, a3RegularAction()),
    );

    expect(result.dimension).toBe(3);
    expect(result.cellCountByDimension).toEqual({
      "0": 24,
      "1": 36,
      "2": 14,
      "3": 1,
    });
    expect(result.cells).toHaveLength(75);
    expect(result.certificate.countChecks.every((check) => check.passed)).toBe(
      true,
    );
    expect(
      result.certificate.countChecks.map((check) => [
        check.sphericalSubsetId,
        check.subgroupOrder,
        check.actualCellCount,
      ]),
    ).toEqual([
      ["T:empty", 1, 24],
      ["T:0", 2, 12],
      ["T:1", 2, 12],
      ["T:2", 2, 12],
      ["T:0,1", 6, 4],
      ["T:0,2", 4, 6],
      ["T:1,2", 6, 4],
      ["T:0,1,2", 24, 1],
    ]);

    const topCell = result.cells.find((cell) => cell.dimension === 3);
    expect(topCell).toBeDefined();
    expect(topCell?.vertexIds).toHaveLength(24);
    expect(topCell?.facetCellIds).toHaveLength(14);
    expect(topCell?.properFaceCellIds).toHaveLength(74);
    expect(
      result.cells.reduce(
        (euler, cell) => euler + (cell.dimension % 2 === 0 ? 1 : -1),
        0,
      ),
    ).toBe(1);

    for (const incidence of result.faceIncidences) {
      const face = result.cells.find(
        (cell) => cell.id === incidence.faceCellId,
      );
      const coface = result.cells.find(
        (cell) => cell.id === incidence.cofaceCellId,
      );
      expect(face).toBeDefined();
      expect(coface).toBeDefined();
      expect(coface!.dimension - face!.dimension).toBe(incidence.codimension);
      const cofacePoints = new Set(coface!.actionPoints);
      expect(face!.actionPoints.every((point) => cofacePoints.has(point))).toBe(
        true,
      );
    }
  });

  it("rejects stale action certificates before enumerating cells", () => {
    const accepted = certify(I2_5_SYSTEM, i2RegularAction());
    const staleCandidate: TorsionFreeActionCandidate = {
      ...accepted.candidate,
      generatorImages: accepted.candidate.generatorImages.map((images) => [
        ...images,
      ]),
    };
    [
      staleCandidate.generatorImages[0][0],
      staleCandidate.generatorImages[0][1],
    ] = [
      staleCandidate.generatorImages[0][1],
      staleCandidate.generatorImages[0][0],
    ];

    expect(() =>
      buildFullDavisQuotientCellPoset(I2_5_SYSTEM, {
        candidate: staleCandidate,
        certificate: accepted.certificate,
      }),
    ).toThrowError(FullDavisQuotientError);
    expect(() =>
      buildFullDavisQuotientCellPoset(I2_5_SYSTEM, {
        candidate: staleCandidate,
        certificate: accepted.certificate,
      }),
    ).toThrowError(/fingerprint is stale or mismatched/);
  });
});
