import { beforeAll, describe, expect, it } from "vitest";

import a3 from "../public/examples/A3.json";
import i25 from "../public/examples/I2_5.json";
import jnw from "../public/examples/jnw_cube_graph.json";
import {
  buildGenericActionH1Certificate,
  computeGenericActionH1CertificateDigest,
  replayGenericActionH1Certificate,
  type GenericActionH1Certificate,
} from "../src/fibering/genericActionH1";
import { buildJnwCubePositiveControlCertificate } from "../src/fibering/jnwCubePositiveControl";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";

function certify(
  system: unknown,
  candidate: TorsionFreeActionCandidate,
): TorsionFreeCandidateResult {
  const plan = planSphericalSpecialSubgroups(system as never);
  const certificate = certifyTorsionFreeAction(
    system as never,
    candidate,
    plan,
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
}

function universalDihedralAction(): {
  system: unknown;
  accepted: TorsionFreeCandidateResult;
} {
  const system = {
    schemaVersion: 1,
    name: "Universal dihedral group",
    rank: 2,
    generators: [
      { id: "a", label: "a" },
      { id: "b", label: "b" },
    ],
    coxeterMatrix: [
      [1, "inf"],
      ["inf", 1],
    ],
    dataStatus: "toy",
  };
  const candidate: TorsionFreeActionCandidate = {
    id: "universal-dihedral-index-two",
    index: 2,
    generatorImages: [
      [1, 0],
      [1, 0],
    ],
  };
  return { system, accepted: certify(system, candidate) };
}

function finiteDihedralRegularAction(m: number): TorsionFreeActionCandidate {
  const point = (rotation: number, reflected: number) =>
    ((2 * ((rotation % m) + m)) % (2 * m)) + reflected;
  const rows = [0, 1].map((generator) =>
    Array.from({ length: 2 * m }, (_unused, state) => {
      const rotation = Math.floor(state / 2);
      const reflected = state % 2;
      return generator === 0
        ? point(rotation, reflected ^ 1)
        : point(rotation + (reflected === 0 ? 1 : -1), reflected ^ 1);
    }),
  );
  return {
    id: `i2-${m}-right-regular`,
    index: 2 * m,
    generatorImages: rows,
  };
}

function permutations(values: number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_entry, other) => other !== index)).map(
      (suffix) => [value, ...suffix],
    ),
  );
}

function a3RegularAction(): TorsionFreeActionCandidate {
  const states = permutations([0, 1, 2, 3]);
  const byKey = new Map(states.map((state, point) => [state.join(","), point]));
  const generatorImages = [0, 1, 2].map((generator) =>
    states.map((state) => {
      const image = [...state];
      [image[generator], image[generator + 1]] = [
        image[generator + 1],
        image[generator],
      ];
      const point = byKey.get(image.join(","));
      if (point === undefined) throw new Error("Missing S4 permutation state.");
      return point;
    }),
  );
  return {
    id: "a3-right-regular",
    index: states.length,
    generatorImages,
  };
}

describe("generic exact action H1 and wall lattice", () => {
  let jnwAccepted: TorsionFreeCandidateResult;

  beforeAll(() => {
    const positiveControl = buildJnwCubePositiveControlCertificate(jnw);
    jnwAccepted = positiveControl.finiteAction;
  });

  it("finds Z and its saturated wall lattice for the index-two universal dihedral cover", () => {
    const input = universalDihedralAction();
    const result = buildGenericActionH1Certificate(
      input.system,
      input.accepted,
    );
    expect(result.certificate.errors).toEqual([]);
    expect(result.certificate.status).toBe("passed");
    expect(result.certificate.h1).toMatchObject({
      rank: 1,
      isomorphicTo: "Z",
      relationRank: 0,
    });
    expect(result.certificate.walls).toMatchObject({
      wallCount: 2,
      twoSidedWallCount: 2,
      wallRank: 1,
      smithInvariantFactors: ["1"],
      wallIndexInSaturation: "1",
      saturationEqualsFullH1: true,
      quotientByWallLattice: {
        freeRank: 0,
        torsionInvariantFactors: [],
        presentation: "0",
      },
    });
    expect(result.integralCocycleBasis?.coordinateIds).toEqual(["eta0"]);
    expect(
      replayGenericActionH1Certificate(
        input.system,
        input.accepted,
        result.certificate,
      ).status,
    ).toBe("passed");
  });

  it("certifies b1=0 for regular I2(5) and A3 actions", () => {
    for (const [system, candidate] of [
      [i25, finiteDihedralRegularAction(5)],
      [a3, a3RegularAction()],
    ] as const) {
      const accepted = certify(system, candidate);
      const result = buildGenericActionH1Certificate(system, accepted);
      expect(result.certificate.status).toBe("passed");
      expect(result.certificate.h1?.rank).toBe(0);
      expect(result.certificate.h1?.isomorphicTo).toBe("0");
      expect(result.certificate.walls?.wallRank).toBe(0);
      expect(result.integralCocycleBasis).toBeNull();
      expect(
        replayGenericActionH1Certificate(system, accepted, result.certificate)
          .status,
      ).toBe("passed");
    }
  });

  it("recomputes the JNW degree-four result as H1=Z^6", () => {
    const result = buildGenericActionH1Certificate(jnw, jnwAccepted);
    expect(result.certificate.status).toBe("passed");
    expect(result.certificate.h1).toMatchObject({
      rank: 6,
      isomorphicTo: "Z^6",
      relationRank: 7,
    });
    expect(
      Object.values(result.certificate.h1?.checks ?? {}).every(Boolean),
    ).toBe(true);
    expect(
      Object.values(result.certificate.walls?.checks ?? {}).every(Boolean),
    ).toBe(true);
    expect(result.certificate.walls).toMatchObject({
      wallRank: 6,
      smithInvariantFactors: ["1", "1", "1", "1", "1", "1"],
      wallIndexInSaturation: "1",
      saturationEqualsFullH1: true,
      quotientByWallLattice: {
        freeRank: 0,
        torsionInvariantFactors: [],
        presentation: "0",
      },
    });
    expect(result.integralCocycleBasis?.coordinateIds).toHaveLength(6);
    expect(
      replayGenericActionH1Certificate(jnw, jnwAccepted, result.certificate)
        .status,
    ).toBe("passed");
  });

  it("returns a replayable incomplete outcome at an exact resource bound", () => {
    const input = universalDihedralAction();
    const result = buildGenericActionH1Certificate(
      input.system,
      input.accepted,
      { budgets: { maxCotreeEdges: 1, maxDegree: 1 } },
    );
    expect(result.certificate.status).toBe("incomplete");
    expect(result.certificate.h1).toBeUndefined();
    expect(result.certificate.stopReason).toMatch(/degree 2 exceeds/i);
    expect(result.integralCocycleBasis).toBeNull();
    expect(
      replayGenericActionH1Certificate(
        input.system,
        input.accepted,
        result.certificate,
      ).status,
    ).toBe("passed");

    const operationBound = buildGenericActionH1Certificate(jnw, jnwAccepted, {
      budgets: { maxSmithOperations: 1 },
    });
    expect(operationBound.certificate.status).toBe("incomplete");
    expect(operationBound.certificate.stages).toContainEqual(
      expect.objectContaining({
        id: "integral-kernel",
        status: "incomplete",
      }),
    );
    expect(operationBound.certificate.stopReason).toMatch(
      /integer reduction exceeded 1 operations/i,
    );
    expect(
      replayGenericActionH1Certificate(
        jnw,
        jnwAccepted,
        operationBound.certificate,
      ).status,
    ).toBe("passed");
  });

  it("rejects a supplied certificate that only preserves the legacy action fingerprint", () => {
    const input = universalDihedralAction();
    const forgedAccepted = structuredClone(input.accepted);
    forgedAccepted.certificate.warnings.push("forged provenance");
    const result = buildGenericActionH1Certificate(
      input.system,
      forgedAccepted,
    );
    expect(result.certificate.status).toBe("failed");
    expect(result.certificate.checks.suppliedCertificateBoundToAction).toBe(
      false,
    );
    expect(result.integralCocycleBasis).toBeNull();
  });

  it("rejects a self-resealed basis or wall-coordinate forgery", () => {
    const input = universalDihedralAction();
    const original = buildGenericActionH1Certificate(
      input.system,
      input.accepted,
    ).certificate;
    for (const mutate of [
      (certificate: GenericActionH1Certificate) => {
        const entry = certificate.h1?.basis[0]?.entries[0];
        if (!entry) throw new Error("Missing test basis entry.");
        entry[1] = (BigInt(entry[1]) + 1n).toString();
      },
      (certificate: GenericActionH1Certificate) => {
        const wall = certificate.walls?.wallClasses[0];
        if (!wall) throw new Error("Missing test wall class.");
        wall.coordinatePairs = [[0, "17"]];
      },
    ]) {
      const forged = structuredClone(original);
      mutate(forged);
      forged.certificateDigest =
        computeGenericActionH1CertificateDigest(forged);
      const replay = replayGenericActionH1Certificate(
        input.system,
        input.accepted,
        forged,
      );
      expect(replay.status).toBe("failed");
      expect(replay.checks.storedCertificateDigestValid).toBe(true);
      expect(replay.checks.actionRootedReconstructionMatches).toBe(false);
    }
  });

  it("rejects a self-resealed unknown budget key", () => {
    const input = universalDihedralAction();
    const forged = structuredClone(
      buildGenericActionH1Certificate(input.system, input.accepted).certificate,
    ) as GenericActionH1Certificate & { budgets: Record<string, number> };
    forged.budgets.unknownBudget = 1;
    forged.certificateDigest = computeGenericActionH1CertificateDigest(forged);
    const replay = replayGenericActionH1Certificate(
      input.system,
      input.accepted,
      forged,
    );
    expect(replay).toMatchObject({
      status: "failed",
      checks: {
        storedCertificateDigestValid: true,
        actionRootedReconstructionMatches: false,
      },
    });
  });
});
