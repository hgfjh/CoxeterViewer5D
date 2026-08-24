import { beforeAll, describe, expect, it } from "vitest";

import jnw from "../public/examples/jnw_cube_graph.json";
import { buildGenericActionH1Certificate } from "../src/fibering/genericActionH1";
import { buildJnwCubePositiveControlCertificate } from "../src/fibering/jnwCubePositiveControl";
import {
  certifyScalableIntegralH1Completion,
  computeScalableSparseIntegerMatrixDigest,
  deriveScalableIntegralLeftInverse,
  findScalableModularRankWitness,
  replayScalableIntegralH1Completion,
  type ScalableIntegralH1CompletionInput,
  type ScalableSparseIntegerMatrixInput,
  type ScalableSparseIntegerVectorInput,
} from "../src/fibering/scalableGenericH1Completion";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

function sparseVector(
  id: string,
  values: readonly bigint[],
): ScalableSparseIntegerVectorInput {
  return {
    id,
    entries: values.flatMap((value, index) =>
      value === 0n
        ? []
        : ([[index, value.toString()]] as Array<[number, string]>),
    ),
  };
}

function multiplyMatrixVector(
  matrix: readonly (readonly bigint[])[],
  vector: readonly bigint[],
): bigint[] {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0n),
  );
}

function primitiveNoUnitMinorFixture(): ScalableIntegralH1CompletionInput {
  // The 2x2 coordinate minors of K are 2, 3, and 5. Their gcd is one,
  // although no coordinate minor itself is unimodular.
  const boundary: ScalableSparseIntegerMatrixInput = {
    rowCount: 1,
    columnCount: 3,
    rows: [sparseVector("relation-0", [5n, -3n, 2n])],
  };
  return {
    schemaVersion: 1,
    source: {
      sourceDigest: canonicalSha256({ fixture: "primitive-no-unit-minor" }),
      preparationDigest: canonicalSha256({ preparation: "tree-gauge" }),
      boundaryDigest: computeScalableSparseIntegerMatrixDigest(boundary),
    },
    boundary,
    kernelBasis: [
      sparseVector("eta0", [1n, 1n, -1n]),
      sparseVector("eta1", [0n, 2n, 3n]),
    ],
    modularRankWitness: {
      prime: 7,
      rank: 1,
      pivotRows: [0],
      pivotColumns: [0],
    },
    walls: [
      sparseVector("wall-0", [2n, 2n, -2n]),
      sparseVector("wall-1", [0n, 6n, 9n]),
    ],
  };
}

describe("scalable generic integral H1 completion", () => {
  it("derives an integral left inverse without requiring a unit coordinate minor", () => {
    const input = primitiveNoUnitMinorFixture();
    const derived = deriveScalableIntegralLeftInverse(input.kernelBasis, 3);
    expect(derived.rows).toHaveLength(2);

    const certificate = certifyScalableIntegralH1Completion(input);
    expect(certificate.status).toBe("passed");
    expect(certificate.errors).toEqual([]);
    expect(certificate.h1).toMatchObject({
      rank: 2,
      relationRank: 1,
      isomorphicTo: "Z^2",
      integralLeftInverseOrigin: "derived-row-lattice-reduction",
      checks: {
        kernelClosed: true,
        integralLeftInverse: true,
        fullRationalKernelCertified: true,
        primitiveIntegralKernelCertified: true,
        fullIntegralKernelCertified: true,
      },
    });
    expect(certificate.walls).toMatchObject({
      wallRank: 2,
      smithInvariantFactors: ["1", "6"],
      wallIndexInSaturation: "6",
      saturationEqualsFullH1: true,
      quotientByWallLattice: {
        freeRank: 0,
        torsionInvariantFactors: ["6"],
        presentation: "Z/6",
      },
    });
    expect(certificate.walls?.saturationBasis).toHaveLength(2);
    expect(replayScalableIntegralH1Completion(input, certificate).status).toBe(
      "passed",
    );
  });

  it("streams the boundary on replay instead of requiring resident row objects", () => {
    const base = primitiveNoUnitMinorFixture();
    const resident = base.boundary as ScalableSparseIntegerMatrixInput;
    let passes = 0;
    const reader = {
      rowCount: resident.rowCount,
      columnCount: resident.columnCount,
      forEachRow: (
        visitor: (
          row: ScalableSparseIntegerVectorInput,
          rowIndex: number,
        ) => void,
      ) => {
        passes += 1;
        resident.rows.forEach(visitor);
      },
    };
    const input = { ...base, boundary: reader };
    expect(computeScalableSparseIntegerMatrixDigest(reader)).toBe(
      base.source.boundaryDigest,
    );
    expect(certifyScalableIntegralH1Completion(input).status).toBe("passed");
    expect(passes).toBeGreaterThan(3);
  });

  it("rejects nonprimitive, rank-deficient, and source-unbound witnesses", () => {
    const primitive = primitiveNoUnitMinorFixture();
    const nonprimitive = {
      ...primitive,
      kernelBasis: [sparseVector("eta", [2n, 2n, -2n])],
      modularRankWitness: {
        prime: 7,
        rank: 2,
        pivotRows: [0, 0],
        pivotColumns: [0, 1],
      },
    };
    const nonprimitiveCertificate =
      certifyScalableIntegralH1Completion(nonprimitive);
    expect(nonprimitiveCertificate.status).toBe("failed");
    expect(nonprimitiveCertificate.errors.join(" ")).toMatch(
      /not primitive|not linearly independent/i,
    );

    const singularBoundary: ScalableSparseIntegerMatrixInput = {
      rowCount: 2,
      columnCount: 3,
      rows: [
        sparseVector("zero-relation", [0n, 0n, 0n]),
        sparseVector("relation-0", [5n, -3n, 2n]),
      ],
    };
    const badMinor = {
      ...primitive,
      source: {
        ...primitive.source,
        boundaryDigest:
          computeScalableSparseIntegerMatrixDigest(singularBoundary),
      },
      boundary: singularBoundary,
      modularRankWitness: {
        prime: 7,
        rank: 1,
        pivotRows: [0],
        pivotColumns: [0],
      },
    };
    const badMinorCertificate = certifyScalableIntegralH1Completion(badMinor);
    expect(badMinorCertificate.status).toBe("failed");
    expect(badMinorCertificate.errors.join(" ")).toMatch(/minor is singular/i);

    const changedBoundary: ScalableSparseIntegerMatrixInput = {
      rowCount: 1,
      columnCount: 3,
      rows: [sparseVector("relation-0", [5n, -3n, 0n])],
    };
    const sourceUnbound = {
      ...primitive,
      boundary: changedBoundary,
    };
    const sourceUnboundCertificate =
      certifyScalableIntegralH1Completion(sourceUnbound);
    expect(sourceUnboundCertificate.status).toBe("failed");
    expect(sourceUnboundCertificate.checks.boundaryDigestMatches).toBe(false);

    const fillBound = certifyScalableIntegralH1Completion({
      ...primitive,
      budgets: { maxModularWorkingNonzeros: 0 },
    });
    expect(fillBound.status).toBe("incomplete");
    expect(fillBound.errors).toEqual([]);
    expect(fillBound.stopReason).toMatch(/working nonzeros/i);
  });

  it("rejects a boundary reader that changes rows between proof passes", () => {
    const base = primitiveNoUnitMinorFixture();
    const resident = base.boundary as ScalableSparseIntegerMatrixInput;
    let pass = 0;
    const input = {
      ...base,
      boundary: {
        rowCount: 1,
        columnCount: 3,
        forEachRow: (
          visitor: (
            row: ScalableSparseIntegerVectorInput,
            rowIndex: number,
          ) => void,
        ) => {
          const row =
            pass === 0
              ? resident.rows[0]
              : sparseVector("relation-0", [5n, -3n, 0n]);
          pass += 1;
          visitor(row, 0);
        },
      },
    };
    const certificate = certifyScalableIntegralH1Completion(input);
    expect(certificate.status).toBe("failed");
    expect(certificate.errors.join(" ")).toMatch(/changed row chunk 0/i);
  });

  it("records dimension and coefficient resource overruns as replayable incomplete artifacts", () => {
    const primitive = primitiveNoUnitMinorFixture();
    for (const [budgets, pattern] of [
      [{ maxBoundaryRows: 0 }, /1 rows; the bound is 0/i],
      [{ maxBoundaryColumns: 2 }, /3 columns; the bound is 2/i],
    ] as const) {
      const boundedInput = { ...primitive, budgets };
      const certificate = certifyScalableIntegralH1Completion(boundedInput);
      expect(certificate.status).toBe("incomplete");
      expect(certificate.errors).toEqual([]);
      expect(certificate.stopReason).toMatch(pattern);
      expect(
        replayScalableIntegralH1Completion(boundedInput, certificate).status,
      ).toBe("passed");
    }

    const oversized = "9".repeat(5_001);
    const oversizedVector = (id: string): ScalableSparseIntegerVectorInput => ({
      id,
      entries: [[0, oversized]],
    });
    const cases: ScalableIntegralH1CompletionInput[] = [
      {
        ...primitive,
        boundary: {
          rowCount: 1,
          columnCount: 3,
          rows: [oversizedVector("relation-0")],
        },
      },
      {
        ...primitive,
        kernelBasis: [
          oversizedVector("eta0"),
          sparseVector("eta1", [0n, 2n, 3n]),
        ],
      },
      {
        ...primitive,
        integralLeftInverseRows: [
          oversizedVector("lambda0"),
          sparseVector("lambda1", [0n, 0n, 1n]),
        ],
      },
      {
        ...primitive,
        walls: [
          oversizedVector("wall-0"),
          sparseVector("wall-1", [0n, 6n, 9n]),
        ],
      },
    ];
    for (const input of cases) {
      const certificate = certifyScalableIntegralH1Completion(input);
      expect(certificate.status).toBe("incomplete");
      expect(certificate.errors).toEqual([]);
      expect(certificate.stopReason).toMatch(
        /5001 decimal digits; the bound is 5000/i,
      );
    }

    const resident = primitive.boundary as ScalableSparseIntegerMatrixInput;
    let boundaryPasses = 0;
    const oversizedKernelBeforeStreaming: ScalableIntegralH1CompletionInput = {
      ...primitive,
      boundary: {
        rowCount: resident.rowCount,
        columnCount: resident.columnCount,
        forEachRow: (visitor) => {
          boundaryPasses += 1;
          resident.rows.forEach((row, rowIndex) => visitor(row, rowIndex));
        },
      },
      kernelBasis: [
        oversizedVector("eta0"),
        sparseVector("eta1", [0n, 2n, 3n]),
      ],
    };
    const preflightCertificate = certifyScalableIntegralH1Completion(
      oversizedKernelBeforeStreaming,
    );
    expect(preflightCertificate.status).toBe("incomplete");
    expect(boundaryPasses).toBe(0);
    expect(
      replayScalableIntegralH1Completion(
        oversizedKernelBeforeStreaming,
        preflightCertificate,
      ).status,
    ).toBe("passed");
    expect(boundaryPasses).toBe(0);
  });

  it("handles rank-deficient wall lattices and zero-rank H1", () => {
    const zeroBoundary: ScalableSparseIntegerMatrixInput = {
      rowCount: 0,
      columnCount: 3,
      rows: [],
    };
    const freeInput: ScalableIntegralH1CompletionInput = {
      schemaVersion: 1,
      source: {
        sourceDigest: canonicalSha256({ fixture: "free-rank-three" }),
        preparationDigest: canonicalSha256({ preparation: "empty-boundary" }),
        boundaryDigest: computeScalableSparseIntegerMatrixDigest(zeroBoundary),
      },
      boundary: zeroBoundary,
      kernelBasis: [
        sparseVector("eta0", [1n, 0n, 0n]),
        sparseVector("eta1", [0n, 1n, 0n]),
        sparseVector("eta2", [0n, 0n, 1n]),
      ],
      modularRankWitness: {
        prime: 7,
        rank: 0,
        pivotRows: [],
        pivotColumns: [],
      },
      walls: [
        sparseVector("wall-0", [2n, 0n, 0n]),
        sparseVector("wall-1", [0n, 3n, 0n]),
      ],
    };
    const freeCertificate = certifyScalableIntegralH1Completion(freeInput);
    expect(freeCertificate.status).toBe("passed");
    expect(freeCertificate.walls).toMatchObject({
      wallRank: 2,
      saturationRank: 2,
      saturationEqualsFullH1: false,
      smithInvariantFactors: ["1", "6"],
      quotientByWallLattice: {
        freeRank: 1,
        torsionInvariantFactors: ["6"],
        presentation: "Z + Z/6",
      },
    });

    const identityBoundary: ScalableSparseIntegerMatrixInput = {
      rowCount: 2,
      columnCount: 2,
      rows: [sparseVector("r0", [1n, 0n]), sparseVector("r1", [0n, 1n])],
    };
    const zeroInput: ScalableIntegralH1CompletionInput = {
      schemaVersion: 1,
      source: {
        sourceDigest: canonicalSha256({ fixture: "zero-h1" }),
        preparationDigest: canonicalSha256({ preparation: "identity" }),
        boundaryDigest:
          computeScalableSparseIntegerMatrixDigest(identityBoundary),
      },
      boundary: identityBoundary,
      kernelBasis: [],
      modularRankWitness: findScalableModularRankWitness(identityBoundary, 7),
      walls: [],
    };
    const zeroCertificate = certifyScalableIntegralH1Completion(zeroInput);
    expect(zeroCertificate.status).toBe("passed");
    expect(zeroCertificate.h1).toMatchObject({
      rank: 0,
      relationRank: 2,
      isomorphicTo: "0",
    });
    expect(zeroCertificate.walls).toMatchObject({
      wallRank: 0,
      smithInvariantFactors: [],
      wallIndexInSaturation: "1",
      quotientByWallLattice: {
        freeRank: 0,
        torsionInvariantFactors: [],
        presentation: "0",
      },
    });
  });

  describe("agreement with the dense genericActionH1 oracle", () => {
    let genericCertificate: ReturnType<
      typeof buildGenericActionH1Certificate
    >["certificate"];

    beforeAll(() => {
      const positiveControl = buildJnwCubePositiveControlCertificate(jnw);
      genericCertificate = buildGenericActionH1Certificate(
        jnw,
        positiveControl.finiteAction,
      ).certificate;
      expect(genericCertificate.status).toBe("passed");
    });

    it("reproduces the JNW H1 rank and wall Smith data", () => {
      const graph = genericCertificate.graph;
      const genericH1 = genericCertificate.h1;
      const genericWalls = genericCertificate.walls;
      if (
        graph === undefined ||
        genericH1 === undefined ||
        genericWalls === undefined
      ) {
        throw new Error("The dense JNW oracle omitted a passed stage.");
      }
      const ambient = graph.cotreeEdgeCount;
      const rank = genericH1.rank;
      const kernel = Array.from({ length: ambient }, () =>
        Array<bigint>(rank).fill(0n),
      );
      genericH1.basis.forEach((basis, coordinate) => {
        for (const [entry, value] of basis.entries) {
          kernel[entry][coordinate] = BigInt(value);
        }
      });
      const leftInverse = genericH1.leftInverseRows.map((row) => {
        const dense = Array<bigint>(ambient).fill(0n);
        for (const [entry, value] of row.entries) dense[entry] = BigInt(value);
        return dense;
      });
      const projection = Array.from({ length: ambient }, (_unused, row) =>
        Array.from({ length: ambient }, (_unusedColumn, column) => {
          let value = row === column ? 1n : 0n;
          for (let coordinate = 0; coordinate < rank; coordinate += 1) {
            value -= kernel[row][coordinate] * leftInverse[coordinate][column];
          }
          return value;
        }),
      );
      const boundary: ScalableSparseIntegerMatrixInput = {
        rowCount: ambient,
        columnCount: ambient,
        rows: projection.map((row, index) =>
          sparseVector(`projector-${index}`, row),
        ),
      };
      const kernelBasis = Array.from({ length: rank }, (_unused, coordinate) =>
        sparseVector(
          `eta${coordinate}`,
          kernel.map((row) => row[coordinate]),
        ),
      );
      const walls = genericWalls.wallClasses.map((wall) => {
        const coordinates = Array<bigint>(rank).fill(0n);
        for (const [coordinate, value] of wall.coordinatePairs) {
          coordinates[coordinate] = BigInt(value);
        }
        return sparseVector(
          wall.wallId,
          multiplyMatrixVector(kernel, coordinates),
        );
      });
      const witness = findScalableModularRankWitness(boundary, 65_521);
      const input: ScalableIntegralH1CompletionInput = {
        schemaVersion: 1,
        source: {
          sourceDigest: canonicalSha256({ source: "jnw-dense-oracle" }),
          preparationDigest: canonicalSha256({
            preparation: "integral-projector-from-oracle",
          }),
          boundaryDigest: computeScalableSparseIntegerMatrixDigest(boundary),
        },
        boundary,
        kernelBasis,
        integralLeftInverseRows: leftInverse.map((row, index) =>
          sparseVector(`lambda${index}`, row),
        ),
        modularRankWitness: witness,
        walls,
      };
      const scalable = certifyScalableIntegralH1Completion(input);
      expect(scalable.status).toBe("passed");
      expect(scalable.h1).toMatchObject({
        rank: genericH1.rank,
        relationRank: genericH1.relationRank,
        isomorphicTo: genericH1.isomorphicTo,
      });
      expect(scalable.walls).toMatchObject({
        wallRank: genericWalls.wallRank,
        smithInvariantFactors: genericWalls.smithInvariantFactors,
        wallIndexInSaturation: genericWalls.wallIndexInSaturation,
        saturationEqualsFullH1: genericWalls.saturationEqualsFullH1,
        quotientByWallLattice: genericWalls.quotientByWallLattice,
      });
    });
  });
});
