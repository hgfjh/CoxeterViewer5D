import { describe, expect, it } from "vitest";

import A2 from "../public/examples/A2.json";
import A3 from "../public/examples/A3.json";
import compact5CubeGamma1 from "../public/examples/compact_5_cube_gamma1.json";
import compact5PolytopeP1DoubleMakarov from "../public/examples/compact_5_polytope_p1_double_makarov.json";
import compact5PrismMakarov from "../public/examples/compact_5_prism_makarov.json";
import compact5PrismMakarovP2 from "../public/examples/compact_5_prism_makarov_p2.json";
import I2_5 from "../public/examples/I2_5.json";
import universalRank3 from "../public/examples/universal_rank3.json";
import {
  browserApproxBackend,
  collectGraphNeighborhood,
  generateCayleyBall,
  assignShellLayout,
} from "../src/cayley";
import {
  buildSimpleReflectionMatrices,
  evaluatePolynomial,
  finiteCoxeterGramValue,
  geometricGramEntryValue,
  identityMatrix,
  matrixPower,
  maxMatrixDifference,
  multiplyMatrices,
  validateCoxeterSystemInput,
} from "../src/coxeter";
import type { CoxeterSystemInput } from "../src/types";

const createdAt = "2026-01-01T00:00:00.000Z";

function expectValid(input: unknown): asserts input is CoxeterSystemInput {
  const result = validateCoxeterSystemInput(input);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
}

function expectNoDuplicateNodes(input: CoxeterSystemInput, radius: number) {
  const ball = generateCayleyBall(input, { radius, createdAt });
  expect(new Set(ball.nodes.map((node) => node.id)).size).toBe(
    ball.nodes.length,
  );
  expect(new Set(ball.nodes.map((node) => node.matrixKey)).size).toBe(
    ball.nodes.length,
  );
}

describe("Coxeter input validation", () => {
  it("accepts the bundled examples", () => {
    expectValid(I2_5);
    expectValid(A2);
    expectValid(A3);
    expectValid(universalRank3);
    expectValid(compact5CubeGamma1);
    expectValid(compact5PrismMakarov);
    expectValid(compact5PolytopeP1DoubleMakarov);
    expectValid(compact5PrismMakarovP2);
  });

  it("keeps the certified compact 5-cube source data explicit", () => {
    expectValid(compact5CubeGamma1);

    expect(compact5CubeGamma1.rank).toBe(10);
    expect(compact5CubeGamma1.coxeterMatrix[0][1]).toBe("inf");
    expect(compact5CubeGamma1.coxeterMatrix[2][8]).toBe("inf");
    expect(compact5CubeGamma1.coxeterMatrix[0][2]).toBe(3);
    expect(compact5CubeGamma1.geometry?.source).toContain("arXiv:1803.10462");
    expect(compact5CubeGamma1.geometry?.normalGram).toHaveLength(10);
    expect(compact5CubeGamma1.dataStatus).toBe("certified");
    expect(compact5CubeGamma1.certificate?.status).toBe("passed");
    expect(compact5CubeGamma1.certificate?.backend).toBe(
      "compact5CubeGamma1ExactChecker",
    );
    expect(compact5CubeGamma1.certificate?.diagnostics?.gram).toEqual(
      expect.objectContaining({
        rank: 6,
        signature: { positive: 5, negative: 1, zero: 4 },
      }),
    );
    expect(compact5CubeGamma1.sourceRefs?.[0]?.locator).toContain("Figure 3");
    expect(compact5CubeGamma1.warnings?.join(" ")).toContain(
      "computed numerically from normalGram",
    );
  });

  it("keeps compact 5-cube dotted weights as exact algebraic real data", () => {
    const boundary = compact5CubeGamma1.geometry?.normalGram?.[0]?.[1];
    const diagonal = compact5CubeGamma1.geometry?.normalGram?.[2]?.[8];

    expect(boundary?.kind).toBe("dotted");
    expect(diagonal?.kind).toBe("dotted");
    if (boundary?.kind !== "dotted" || diagonal?.kind !== "dotted") {
      throw new Error("Expected dotted compact 5-cube entries.");
    }

    expect(boundary.exact?.minimalPolynomial).toEqual([4, -2, -3]);
    expect(diagonal.exact?.minimalPolynomial).toEqual([16, 0, -20, 0, 3]);
    expect(
      Math.abs(
        evaluatePolynomial(
          boundary.exact!.minimalPolynomial,
          boundary.exact!.decimal,
        ),
      ),
    ).toBeLessThan(1e-8);
    expect(
      Math.abs(
        evaluatePolynomial(
          diagonal.exact!.minimalPolynomial,
          diagonal.exact!.decimal,
        ),
      ),
    ).toBeLessThan(1e-8);
  });

  it("keeps the certified compact 5-prism source data explicit", () => {
    expectValid(compact5PrismMakarov);

    expect(compact5PrismMakarov.rank).toBe(7);
    expect(compact5PrismMakarov.coxeterMatrix[0][1]).toBe(5);
    expect(compact5PrismMakarov.coxeterMatrix[5][6]).toBe("inf");
    expect(compact5PrismMakarov.geometry?.source).toContain(
      "Bredon-Kellerhals",
    );
    expect(compact5PrismMakarov.dataStatus).toBe("certified");
    expect(compact5PrismMakarov.certificate?.status).toBe("passed");
    expect(compact5PrismMakarov.certificate?.backend).toBe(
      "compact5PrismMakarovExactChecker",
    );
    expect(compact5PrismMakarov.certificate?.diagnostics?.gram).toEqual(
      expect.objectContaining({
        rank: 6,
        signature: { positive: 5, negative: 1, zero: 1 },
      }),
    );
    expect(compact5PrismMakarov.sourceRefs?.[0]?.locator).toContain(
      "Example 8",
    );
  });

  it("keeps compact 5-prism dotted weights as exact algebraic real data", () => {
    const dotted = compact5PrismMakarov.geometry?.normalGram?.[5]?.[6];

    expect(dotted?.kind).toBe("dotted");
    if (dotted?.kind !== "dotted") {
      throw new Error("Expected the compact 5-prism dotted entry.");
    }

    expect(dotted.exact?.minimalPolynomial).toEqual([16, 0, -28, 0, 11]);
    expect(dotted.exact?.isolatingInterval).toEqual([1.0744, 1.0745]);
    expect(
      Math.abs(
        evaluatePolynomial(
          dotted.exact!.minimalPolynomial,
          dotted.exact!.decimal,
        ),
      ),
    ).toBeLessThan(1e-8);
  });

  it("keeps the other Emery-Kellerhals compact 5D Coxeter examples certified but narrow", () => {
    expectValid(compact5PolytopeP1DoubleMakarov);
    expectValid(compact5PrismMakarovP2);

    expect(compact5PolytopeP1DoubleMakarov.dataStatus).toBe("certified");
    expect(compact5PolytopeP1DoubleMakarov.certificate?.status).toBe("passed");
    expect(compact5PolytopeP1DoubleMakarov.certificate?.backend).toBe(
      "compact5PrismFamilyExactChecker",
    );
    expect(
      compact5PolytopeP1DoubleMakarov.certificate?.diagnostics?.gram,
    ).toEqual(
      expect.objectContaining({
        rank: 6,
        signature: { positive: 5, negative: 1, zero: 1 },
      }),
    );
    expect(compact5PolytopeP1DoubleMakarov.description).toContain("double");
    expect(compact5PolytopeP1DoubleMakarov.coxeterMatrix[4][5]).toBe(3);
    expect(compact5PolytopeP1DoubleMakarov.coxeterMatrix[4][6]).toBe(3);
    expect(compact5PolytopeP1DoubleMakarov.coxeterMatrix[5][6]).toBe("inf");
    expect(compact5PolytopeP1DoubleMakarov.warnings?.join(" ")).toContain(
      "do not describe it as a simplicial prism",
    );

    expect(compact5PrismMakarovP2.dataStatus).toBe("certified");
    expect(compact5PrismMakarovP2.certificate?.status).toBe("passed");
    expect(compact5PrismMakarovP2.certificate?.backend).toBe(
      "compact5PrismFamilyExactChecker",
    );
    expect(compact5PrismMakarovP2.certificate?.diagnostics?.gram).toEqual(
      expect.objectContaining({
        rank: 6,
        signature: { positive: 5, negative: 1, zero: 1 },
      }),
    );
    expect(compact5PrismMakarovP2.coxeterMatrix[4][5]).toBe(4);
    expect(compact5PrismMakarovP2.coxeterMatrix[5][6]).toBe("inf");
    expect(compact5PrismMakarovP2.sourceRefs?.[0]?.locator).toContain(
      "Diagram",
    );
  });

  it("keeps the new compact 5D dotted weights as exact algebraic real data", () => {
    const p1Dotted =
      compact5PolytopeP1DoubleMakarov.geometry?.normalGram?.[5]?.[6];
    const p2Dotted = compact5PrismMakarovP2.geometry?.normalGram?.[5]?.[6];

    expect(p1Dotted?.kind).toBe("dotted");
    expect(p2Dotted?.kind).toBe("dotted");
    if (p1Dotted?.kind !== "dotted" || p2Dotted?.kind !== "dotted") {
      throw new Error("Expected dotted entries for P1 and P2.");
    }

    expect(p1Dotted.exact?.minimalPolynomial).toEqual([4, -6, 1]);
    expect(p2Dotted.exact?.minimalPolynomial).toEqual([4, 0, -6, 0, 1]);
    expect(
      Math.abs(
        evaluatePolynomial(
          p1Dotted.exact!.minimalPolynomial,
          p1Dotted.exact!.decimal,
        ),
      ),
    ).toBeLessThan(1e-8);
    expect(
      Math.abs(
        evaluatePolynomial(
          p2Dotted.exact!.minimalPolynomial,
          p2Dotted.exact!.decimal,
        ),
      ),
    ).toBeLessThan(1e-8);
  });

  it("preserves future provenance annotations without certifying them", () => {
    const annotated = {
      ...I2_5,
      dataStatus: "toy",
      sourceRefs: [
        {
          id: "local-fixture",
          citation: "Local test fixture",
          notes: "Combinatorial Coxeter matrix",
        },
      ],
      certification: {
        status: "not-certified",
        backend: "none",
        warnings: ["Forward-compatible metadata; not a certificate."],
      },
    };

    const result = validateCoxeterSystemInput(annotated);

    expect(result.ok).toBe(true);
    expect((result.value as typeof annotated | undefined)?.dataStatus).toBe(
      "toy",
    );
    expect((result.value as typeof annotated | undefined)?.sourceRefs).toEqual(
      annotated.sourceRefs,
    );
  });

  it("requires source refs for verified data and passed certificates for certified data", () => {
    expect(
      validateCoxeterSystemInput({ ...I2_5, dataStatus: "verified-source" })
        .errors,
    ).toContain("verified-source examples must declare sourceRefs.");

    expect(
      validateCoxeterSystemInput({
        ...I2_5,
        dataStatus: "certified",
        sourceRefs: [{ id: "fixture", citation: "Fixture" }],
        certificate: { status: "skipped", backend: "test" },
      }).errors,
    ).toContain('dataStatus "certified" requires certificate.status "passed".');
  });

  it("rejects duplicate generators and inconsistent normal Gram entries", () => {
    const duplicateGenerators = validateCoxeterSystemInput({
      ...I2_5,
      generators: [
        { id: "s", label: "s0" },
        { id: "s", label: "s1" },
      ],
    });

    expect(duplicateGenerators.errors).toContain(
      'generators contains duplicate id "s".',
    );

    const badGram = validateCoxeterSystemInput({
      ...I2_5,
      geometry: {
        model: "hyperboloid",
        dimension: 2,
        normalGram: [
          [{ kind: "numericGram", value: 1 }, { kind: "right" }],
          [
            { kind: "dotted", coshDistance: 1.25 },
            { kind: "numericGram", value: 1 },
          ],
        ],
      },
    });

    expect(badGram.errors).toEqual(
      expect.arrayContaining([
        "geometry.normalGram must be symmetric: values [0][1] and [1][0] differ.",
        "geometry.normalGram[0][1] value 0 does not match Coxeter entry m=5.",
      ]),
    );
  });

  it("reports human-readable matrix and generator errors", () => {
    const result = validateCoxeterSystemInput({
      schemaVersion: 1,
      name: "Bad example",
      rank: 2,
      generators: [{ id: "s0", label: "s0" }],
      coxeterMatrix: [
        [1, 3],
        [4, "inf"],
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "generators must contain exactly rank entries (2).",
        "coxeterMatrix[1][1] must be 1 on the diagonal.",
        "coxeterMatrix must be symmetric: entry [0][1] is 3, but [1][0] is 4.",
      ]),
    );
  });
});

describe("Gram conversion", () => {
  it("converts Coxeter and geometric entries to numeric Gram values", () => {
    expect(finiteCoxeterGramValue(2)).toBe(0);
    expect(finiteCoxeterGramValue(3)).toBeCloseTo(-0.5);
    expect(finiteCoxeterGramValue(5)).toBeCloseTo(-Math.cos(Math.PI / 5));
    expect(geometricGramEntryValue({ kind: "right" })).toBe(0);
    expect(
      geometricGramEntryValue({ kind: "dotted", coshDistance: 2.25 }),
    ).toBeCloseTo(-2.25);
    expect(geometricGramEntryValue({ kind: "numericGram", value: -1.75 })).toBe(
      -1.75,
    );
  });
});

describe("Tits reflection matrices", () => {
  it("makes each simple reflection an involution", () => {
    expectValid(A3);
    const reflections = buildSimpleReflectionMatrices(A3.coxeterMatrix);
    const identity = identityMatrix(A3.rank);

    for (const reflection of reflections) {
      expect(
        maxMatrixDifference(matrixPower(reflection, 2), identity),
      ).toBeLessThan(1e-10);
    }
  });

  it("satisfies finite rank-two Coxeter relations in small examples", () => {
    expectValid(A3);
    const reflections = buildSimpleReflectionMatrices(A3.coxeterMatrix);
    const identity = identityMatrix(A3.rank);

    for (let i = 0; i < A3.rank; i += 1) {
      for (let j = i + 1; j < A3.rank; j += 1) {
        const m = A3.coxeterMatrix[i][j];
        if (typeof m === "number") {
          const product = multiplyMatrices(reflections[i], reflections[j]);
          expect(
            maxMatrixDifference(matrixPower(product, m), identity),
          ).toBeLessThan(1e-10);
        }
      }
    }
  });
});

describe("Cayley ball generation", () => {
  it("respects radius zero and radius one", () => {
    expectValid(I2_5);
    const radiusZero = generateCayleyBall(I2_5, { radius: 0, createdAt });
    const radiusOne = generateCayleyBall(I2_5, { radius: 1, createdAt });

    expect(radiusZero.nodes).toHaveLength(1);
    expect(radiusZero.edges).toHaveLength(0);
    expect(radiusOne.nodes).toHaveLength(3);
    expect(radiusOne.edges).toHaveLength(2);
  });

  it("reaches known finite group orders without duplicate nodes", () => {
    expectValid(I2_5);
    expectValid(A2);
    expectValid(A3);

    expect(
      generateCayleyBall(I2_5, { radius: 5, createdAt }).nodes,
    ).toHaveLength(10);
    expect(generateCayleyBall(A2, { radius: 3, createdAt }).nodes).toHaveLength(
      6,
    );
    expect(generateCayleyBall(A3, { radius: 6, createdAt }).nodes).toHaveLength(
      24,
    );

    expectNoDuplicateNodes(I2_5, 5);
    expectNoDuplicateNodes(A2, 3);
    expectNoDuplicateNodes(A3, 6);
  });

  it("names rounded-matrix deduplication as an approximation", () => {
    expectValid(universalRank3);
    const ball = generateCayleyBall(universalRank3, { radius: 2, createdAt });

    expect(ball.metadata.generatorConvention).toBe("right-multiplication");
    expect(ball.metadata.deduplication).toBe("rounded-matrix");
    expect(ball.metadata.warnings.join(" ")).toContain("Approximate backend");
  });

  it("assigns deterministic shell positions outside React", () => {
    expectValid(A2);
    const ball = generateCayleyBall(A2, { radius: 2, createdAt });
    const first = assignShellLayout(ball.nodes);
    const second = assignShellLayout(ball.nodes);

    expect(second.map((node) => node.position)).toEqual(
      first.map((node) => node.position),
    );
    expect(first.find((node) => node.id === "e")?.position).toEqual([0, 0, 0]);
  });

  it("collects bounded on-graph neighborhoods around a selected vertex", () => {
    expectValid(I2_5);
    const ball = generateCayleyBall(I2_5, { radius: 5, createdAt });

    expect([
      ...collectGraphNeighborhood(ball.edges, "e", { depth: 0 }),
    ]).toEqual(["e"]);
    expect(collectGraphNeighborhood(ball.edges, "e", { depth: 1 }).size).toBe(
      3,
    );
    expect(
      collectGraphNeighborhood(ball.edges, "e", { depth: 2 }).size,
    ).toBeGreaterThan(3);
  });
});

describe("Rank-two Davis cells", () => {
  it("emits one decagon for the full I2(5) ball", async () => {
    expectValid(I2_5);
    const ball = await browserApproxBackend.generate(I2_5, 5, { createdAt });

    expect(ball.twoCells).toHaveLength(1);
    expect(ball.twoCells[0].generatorPair).toEqual([0, 1]);
    expect(ball.twoCells[0].boundaryNodeIds).toHaveLength(10);
  });

  it("uses boundary length 2m for finite rank-two cells", async () => {
    expectValid(A3);
    const ball = await browserApproxBackend.generate(A3, 6, { createdAt });

    expect(ball.twoCells.length).toBeGreaterThan(0);
    for (const cell of ball.twoCells) {
      const [i, j] = cell.generatorPair;
      const m = A3.coxeterMatrix[i][j];
      expect(typeof m).toBe("number");
      expect(cell.boundaryNodeIds).toHaveLength(2 * Number(m));
    }
  });

  it("does not fabricate rank-two cells for universal examples", async () => {
    expectValid(universalRank3);
    const ball = await browserApproxBackend.generate(universalRank3, 3, {
      createdAt,
    });

    expect(ball.twoCells).toHaveLength(0);
  });
});
