import { describe, expect, it } from "vitest";

import A3 from "../public/examples/A3.json";
import I2_5 from "../public/examples/I2_5.json";
import compact5Cube from "../public/examples/compact_5_cube_gamma1.json";
import idealHyperbolic3CubeM3 from "../public/examples/ideal_hyperbolic_3_cube_m3.json";
import { validateQuotientComplex } from "../src/quotient";
import {
  acceptedActionToQuotientComplex,
  buildIdealHyperbolic3CubeS4Cover,
  certifyTorsionFreeAction,
  computeTorsionFreeIndexLowerBound,
  discoverTorsionFreeCover,
  leastCommonMultiple,
  planSphericalSpecialSubgroups,
  createIdealHyperbolic3CubeS4Action,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const I2_5_SYSTEM = I2_5 as CoxeterSystemInput;
const A3_SYSTEM = A3 as CoxeterSystemInput;
const COMPACT_5_CUBE_SYSTEM = compact5Cube as CoxeterSystemInput;
const IDEAL_3_CUBE_SYSTEM = idealHyperbolic3CubeM3 as CoxeterSystemInput;

function i2RegularAction(m = 5): TorsionFreeActionCandidate {
  const index = 2 * m;
  const encode = (rotation: number, reflected: number): number =>
    2 * ((rotation + m) % m) + reflected;
  const s0 = Array.from({ length: index }, (_unused, point) => {
    const rotation = Math.floor(point / 2);
    const reflected = point % 2;
    return encode(rotation, 1 - reflected);
  });
  const s1 = Array.from({ length: index }, (_unused, point) => {
    const rotation = Math.floor(point / 2);
    const reflected = point % 2;
    return reflected === 0 ? encode(rotation - 1, 1) : encode(rotation + 1, 0);
  });
  return {
    id: `i2-${m}-regular`,
    name: `I2(${m}) identity-subgroup action`,
    index,
    generatorImages: [s0, s1],
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

function composeFunctions(left: number[], right: number[]): number[] {
  return right.map((image) => left[image]);
}

function explicitRestrictedActionCheck(
  action: TorsionFreeActionCandidate,
  generators: number[],
  expectedOrder: number,
): {
  imageOrder: number;
  fixedPointElementCount: number;
  faithful: boolean;
  free: boolean;
} {
  const identity = Array.from(
    { length: action.index },
    (_unused, point) => point,
  );
  const elements = [identity];
  const seen = new Set([identity.join(",")]);
  for (let cursor = 0; cursor < elements.length; cursor += 1) {
    const current = elements[cursor];
    for (const generator of generators) {
      const next = current.map(
        (image) => action.generatorImages[generator][image],
      );
      const key = next.join(",");
      if (!seen.has(key)) {
        seen.add(key);
        elements.push(next);
      }
    }
  }
  const fixedPointElementCount = elements.filter(
    (element) =>
      element.some((image, point) => image !== point) &&
      element.some((image, point) => image === point),
  ).length;
  const faithful = elements.length === expectedOrder;
  return {
    imageOrder: elements.length,
    fixedPointElementCount,
    faithful,
    free: faithful && fixedPointElementCount === 0,
  };
}

function a3RegularAction(): TorsionFreeActionCandidate {
  const elements = permutations([0, 1, 2, 3]);
  const indexByKey = new Map(
    elements.map((element, index) => [element.join(","), index]),
  );
  const transpositions = [
    [1, 0, 2, 3],
    [0, 2, 1, 3],
    [0, 1, 3, 2],
  ];
  return {
    id: "a3-regular",
    name: "A3 identity-subgroup action",
    index: elements.length,
    generatorImages: transpositions.map((generator) =>
      elements.map((element) => {
        const image = indexByKey.get(
          composeFunctions(element, generator).join(","),
        );
        if (image === undefined) {
          throw new Error("S4 regular-action test fixture is incomplete.");
        }
        return image;
      }),
    ),
    backend: "test-exact",
  };
}

function a3NaturalAction(): TorsionFreeActionCandidate {
  return {
    id: "a3-natural",
    name: "A3 natural action on four letters",
    index: 4,
    generatorImages: [
      [1, 0, 2, 3],
      [0, 2, 1, 3],
      [0, 1, 3, 2],
    ],
    pointLabels: ["1", "2", "3", "4"],
  };
}

describe("exact spherical planning and index bounds", () => {
  it("plans all spherical subsets of I2(5) and obtains lower bound 10", () => {
    const plan = planSphericalSpecialSubgroups(I2_5_SYSTEM);
    const lowerBound = computeTorsionFreeIndexLowerBound(plan);

    expect(plan.status).toBe("complete");
    expect(plan.sphericalSubgroups.map((subset) => subset.type)).toEqual([
      "A1",
      "A1",
      "I2(5)",
    ]);
    expect(
      plan.sphericalSubgroups.map((subset) => subset.order.decimal),
    ).toEqual(["2", "2", "10"]);
    expect(lowerBound.value).toEqual({ decimal: "10", safeInteger: 10 });
  });

  it("recognizes the full A3 subgroup exactly and obtains lower bound 24", () => {
    const plan = planSphericalSpecialSubgroups(A3_SYSTEM);
    const full = plan.sphericalSubgroups.find(
      (subset) => subset.id === "T:0,1,2",
    );

    expect(plan.status).toBe("complete");
    expect(plan.checkedSubsetCount).toBe(7);
    expect(full).toMatchObject({ type: "A3", order: { decimal: "24" } });
    expect(computeTorsionFreeIndexLowerBound(plan).value.safeInteger).toBe(24);
  });

  it("finds only A1 and A2 spherical subgroups in the ideal all-m=3 cube", () => {
    const plan = planSphericalSpecialSubgroups(IDEAL_3_CUBE_SYSTEM);
    const rankCounts = plan.sphericalSubgroups.reduce<Record<number, number>>(
      (counts, subgroup) => ({
        ...counts,
        [subgroup.rank]: (counts[subgroup.rank] ?? 0) + 1,
      }),
      {},
    );

    expect(plan.status).toBe("complete");
    expect(plan.checkedSubsetCount).toBe(63);
    expect(rankCounts).toEqual({ 1: 6, 2: 12 });
    expect(
      plan.sphericalSubgroups.filter((subgroup) => subgroup.rank === 2),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "I2(3)",
          order: expect.objectContaining({ decimal: "6" }),
        }),
      ]),
    );
    expect(computeTorsionFreeIndexLowerBound(plan).value).toEqual({
      decimal: "6",
      safeInteger: 6,
    });
  });

  it("locks the compact 5-cube search to 32 maximal spherical subgroups and lower bound 5760", () => {
    const plan = planSphericalSpecialSubgroups(COMPACT_5_CUBE_SYSTEM);
    const maximal = plan.sphericalSubgroups.filter(
      (candidate) =>
        !plan.sphericalSubgroups.some(
          (other) =>
            other.rank > candidate.rank &&
            candidate.generators.every((generator) =>
              other.generators.includes(generator),
            ),
        ),
    );

    expect(plan.status).toBe("complete");
    expect(maximal).toHaveLength(32);
    expect(computeTorsionFreeIndexLowerBound(plan).value).toEqual({
      decimal: "5760",
      safeInteger: 5760,
    });
  });

  it("marks rank and subset caps explicitly instead of claiming exhaustion", () => {
    const rankLimited = planSphericalSpecialSubgroups(A3_SYSTEM, {
      maxRankForExhaustiveEnumeration: 2,
      maxSubsetRankWhenIncomplete: 2,
    });
    const countLimited = planSphericalSpecialSubgroups(A3_SYSTEM, {
      maxSubsetsToCheck: 3,
    });

    expect(rankLimited).toMatchObject({
      status: "incomplete",
      omittedReason: "rank-limit",
      checkedSubsetCount: 6,
    });
    expect(
      rankLimited.sphericalSubgroups.some((subset) => subset.rank === 3),
    ).toBe(false);
    expect(countLimited).toMatchObject({
      status: "incomplete",
      omittedReason: "subset-cap",
      checkedSubsetCount: 3,
    });
  });

  it("computes LCMs beyond the safe-number range without rounding", () => {
    expect(leastCommonMultiple([9_007_199_254_740_991n, 2n])).toBe(
      18_014_398_509_481_982n,
    );
  });
});

describe("Tits-criterion finite-action certification", () => {
  it("matches explicit subgroup closure on small passing and failing actions", () => {
    const fixtures = [
      { system: I2_5_SYSTEM, action: i2RegularAction() },
      { system: A3_SYSTEM, action: a3RegularAction() },
      { system: A3_SYSTEM, action: a3NaturalAction() },
    ];

    for (const { system, action } of fixtures) {
      const plan = planSphericalSpecialSubgroups(system);
      const certificate = certifyTorsionFreeAction(system, action, plan);
      for (const subgroup of plan.sphericalSubgroups) {
        const expectedOrder = subgroup.order.safeInteger;
        if (expectedOrder === undefined) {
          throw new Error(
            "Small closure fixture has an unsafe subgroup order.",
          );
        }
        const explicit = explicitRestrictedActionCheck(
          action,
          subgroup.generators,
          expectedOrder,
        );
        const orbitCheck = certificate.sphericalActions.find(
          (check) => check.sphericalSubsetId === subgroup.id,
        );
        expect(orbitCheck, subgroup.id).toMatchObject({
          enumeratedImageElements: explicit.imageOrder,
          enumerationComplete: true,
          faithful: explicit.faithful,
          free: explicit.free,
          fixedPointElementCount: explicit.fixedPointElementCount,
        });
      }
    }
  });

  it("certifies the regular S4 action of the ideal cube at index 24", () => {
    const action = createIdealHyperbolic3CubeS4Action(IDEAL_3_CUBE_SYSTEM);
    const plan = planSphericalSpecialSubgroups(IDEAL_3_CUBE_SYSTEM);
    const certificate = certifyTorsionFreeAction(
      IDEAL_3_CUBE_SYSTEM,
      action,
      plan,
    );

    expect(action.index).toBe(24);
    expect(new Set(action.pointLabels).size).toBe(24);
    expect(certificate.status).toBe("passed");
    expect(certificate.witnesses).toEqual([]);
    expect(certificate.sphericalActions).toHaveLength(18);
    expect(
      certificate.sphericalActions
        .filter((check) => check.generators.length === 2)
        .every(
          (check) =>
            check.enumeratedImageElements === 6 && check.faithful && check.free,
        ),
    ).toBe(true);
  });

  it("passes the regular I2(5) action after complete subgroup checks", () => {
    const plan = planSphericalSpecialSubgroups(I2_5_SYSTEM);
    const certificate = certifyTorsionFreeAction(
      I2_5_SYSTEM,
      i2RegularAction(),
      plan,
    );

    expect(certificate.status).toBe("passed");
    expect(certificate.checks).toEqual({
      actionShape: true,
      transitive: true,
      involutiveGenerators: true,
      coxeterRelations: true,
      indexDivisibility: true,
      sphericalEnumerationComplete: true,
      sphericalSubgroupEnumerationsComplete: true,
      sphericalActionsFaithful: true,
      sphericalActionsFree: true,
    });
    expect(certificate.witnesses).toEqual([]);
    expect(certificate.sphericalActions.at(-1)).toMatchObject({
      sphericalSubsetId: "T:0,1",
      expectedOrder: { decimal: "10" },
      enumeratedImageElements: 10,
      free: true,
    });
  });

  it("passes the 24-point regular action of A3", () => {
    const plan = planSphericalSpecialSubgroups(A3_SYSTEM);
    const certificate = certifyTorsionFreeAction(
      A3_SYSTEM,
      a3RegularAction(),
      plan,
    );

    expect(certificate.status).toBe("passed");
    expect(
      certificate.sphericalActions.find(
        (check) => check.sphericalSubsetId === "T:0,1,2",
      ),
    ).toMatchObject({
      enumeratedImageElements: 24,
      faithful: true,
      free: true,
    });
  });

  it("reports fixed spherical elements in the natural A3 action", () => {
    const certificate = certifyTorsionFreeAction(
      A3_SYSTEM,
      a3NaturalAction(),
      planSphericalSpecialSubgroups(A3_SYSTEM),
    );

    expect(certificate.status).toBe("failed");
    expect(certificate.checks.transitive).toBe(true);
    expect(certificate.checks.coxeterRelations).toBe(true);
    expect(certificate.checks.sphericalActionsFree).toBe(false);
    expect(
      certificate.sphericalActions.find(
        (check) => check.sphericalSubsetId === "T:0,1,2",
      ),
    ).toMatchObject({
      enumeratedImageElements: 24,
      enumerationComplete: true,
      faithful: true,
      free: false,
    });
    expect(certificate.errors).toContain(
      "T:0,1,2 is not free: 1 orbit of size 4; every orbit must have size 24.",
    );
    expect(certificate.witnesses).toContainEqual(
      expect.objectContaining({
        kind: "fixed-point",
        sphericalSubsetId: "T:0",
        word: [0],
        point: 2,
        pointLabel: "3",
      }),
    );
  });

  it("reports the action kernel when a spherical subgroup image collapses", () => {
    const trivial: TorsionFreeActionCandidate = {
      id: "trivial-i2-action",
      index: 1,
      generatorImages: [[0], [0]],
    };
    const certificate = certifyTorsionFreeAction(
      I2_5_SYSTEM,
      trivial,
      planSphericalSpecialSubgroups(I2_5_SYSTEM),
    );

    expect(certificate.status).toBe("failed");
    expect(certificate.witnesses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "index-divisibility-failure" }),
        expect.objectContaining({
          kind: "spherical-action-kernel",
          sphericalSubsetId: "T:0,1",
          imageOrder: 1,
        }),
      ]),
    );
  });

  it("cannot pass with incomplete spherical planning", () => {
    const action = a3RegularAction();
    const incompletePlan = planSphericalSpecialSubgroups(A3_SYSTEM, {
      maxRankForExhaustiveEnumeration: 2,
    });
    const incompletePlanCertificate = certifyTorsionFreeAction(
      A3_SYSTEM,
      action,
      incompletePlan,
    );
    expect(incompletePlanCertificate.status).toBe("incomplete");
    expect(incompletePlanCertificate.checks.sphericalEnumerationComplete).toBe(
      false,
    );
  });

  it("does not let the legacy diagnostic cap block a passing orbit check", () => {
    const certificate = certifyTorsionFreeAction(
      I2_5_SYSTEM,
      i2RegularAction(),
      planSphericalSpecialSubgroups(I2_5_SYSTEM),
      { maxSphericalSubgroupElements: 4 },
    );

    expect(certificate.status).toBe("passed");
    expect(certificate.checks.sphericalSubgroupEnumerationsComplete).toBe(true);
    expect(certificate.witnesses).not.toContainEqual(
      expect.objectContaining({ kind: "subgroup-enumeration-capped" }),
    );
  });
});

describe("discovery and quotient conversion", () => {
  it("builds the golden 24-sheet S4-kernel cover with all hexagon orbits", () => {
    const quotient = buildIdealHyperbolic3CubeS4Cover(IDEAL_3_CUBE_SYSTEM);

    expect(quotient.name).toContain("S4-kernel cover");
    expect(quotient.vertices).toHaveLength(24);
    expect(quotient.edges).toHaveLength(24 * 6);
    expect(quotient.twoCells).toHaveLength(12 * 4);
    expect(
      quotient.twoCells.every(
        (cell) =>
          cell.m === 3 &&
          cell.boundaryVertexIds.length === 6 &&
          cell.boundaryEdgeIds?.length === 6,
      ),
    ).toBe(true);
    expect(quotient.subgroup).toMatchObject({
      name: "ker(W -> S4)",
      index: 24,
      manifoldClaimed: false,
      certificate: { status: "passed" },
    });
    expect(quotient.torsionFreeCertificate?.status).toBe("passed");
    expect(quotient.schreierCertificate?.status).toBe("passed");
    expect(validateQuotientComplex(quotient).ok).toBe(true);
  });

  it("chooses a passing action and emits exact rank-two quotient cells", () => {
    const progress: string[] = [];
    const result = discoverTorsionFreeCover(
      {
        schemaVersion: 1,
        system: I2_5_SYSTEM,
        candidates: [
          {
            id: "bad-one-point-action",
            index: 1,
            generatorImages: [[0], [0]],
          },
          i2RegularAction(),
        ],
        candidateEnumeration: {
          complete: true,
          method: "test candidate list",
          searchedThroughIndex: 10,
        },
      },
      (event) => progress.push(event.phase),
    );

    expect(result.status).toBe("found");
    expect(result.accepted?.candidate.id).toBe("i2-5-regular");
    expect(result.quotient).toBeDefined();
    expect(result.quotient?.vertices).toHaveLength(10);
    expect(result.quotient?.edges).toHaveLength(20);
    expect(result.quotient?.twoCells).toHaveLength(1);
    expect(result.quotient?.twoCells[0]).toMatchObject({
      generatorPair: [0, 1],
      m: 5,
    });
    expect(result.quotient?.twoCells[0].boundaryVertexIds).toHaveLength(10);
    expect(result.quotient?.twoCells[0].boundaryEdgeIds).toHaveLength(10);
    expect(validateQuotientComplex(result.quotient).ok).toBe(true);
    expect(progress).toContain("spherical-action");
    expect(progress.at(-1)).toBe("complete");
  });

  it("builds all A3 rank-two relation-cell orbits", () => {
    const action = a3RegularAction();
    const plan = planSphericalSpecialSubgroups(A3_SYSTEM);
    const accepted = {
      candidate: action,
      certificate: certifyTorsionFreeAction(A3_SYSTEM, action, plan),
    };
    const quotient = acceptedActionToQuotientComplex(A3_SYSTEM, accepted);

    expect(accepted.certificate.status).toBe("passed");
    expect(quotient.twoCells).toHaveLength(14);
    expect(
      quotient.twoCells.filter(
        (cell) => cell.generatorPair.join(",") === "0,2",
      ),
    ).toHaveLength(6);
    expect(
      quotient.twoCells.every(
        (cell) => cell.boundaryVertexIds.length === 2 * cell.m,
      ),
    ).toBe(true);
    expect(validateQuotientComplex(quotient).ok).toBe(true);
  });

  it("reports an inconclusive search when candidate enumeration is partial", () => {
    const result = discoverTorsionFreeCover({
      schemaVersion: 1,
      system: I2_5_SYSTEM,
      candidates: [],
      candidateEnumeration: {
        complete: false,
        method: "interrupted low-index search",
        searchedThroughIndex: 8,
      },
    });

    expect(result.status).toBe("incomplete");
    expect(result.accepted).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("incomplete");
  });
});
