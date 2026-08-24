import { describe, expect, it } from "vitest";

import { canonicalSha256 } from "../src/utils/canonicalSha256";
import {
  buildGenericSparseModularRankWorkerRequest,
  certifyGenericSparseModularRank,
  computeGenericSparseModularRankCertificateDigest,
  computeGenericSparseModularRankRequestDigest,
  genericSparseModularRankRequestCanonicalBytes,
  replayGenericSparseModularRankCertificate,
  replayGenericSparseModularRankCertificateFromReader,
  type GenericSparseIntegerMatrix,
  type GenericSparseMatrixSourceBinding,
  type GenericSparseModularRankCertificate,
} from "../src/fibering/genericSparseModularRank";

const sourceBindings: GenericSparseMatrixSourceBinding[] = [
  { id: "preparation", sha256: canonicalSha256({ preparation: 7 }) },
  { id: "action", sha256: canonicalSha256({ action: [[1, 0]] }) },
];

const matrix: GenericSparseIntegerMatrix = {
  schemaVersion: 1,
  rowCount: 4,
  columnCount: 4,
  rows: [
    {
      row: 0,
      entries: [
        [0, "1"],
        [1, "2"],
        [3, "1"],
      ],
    },
    {
      row: 1,
      entries: [
        [1, "1"],
        [2, "1"],
      ],
    },
    {
      row: 2,
      entries: [
        [0, "1"],
        [1, "3"],
        [2, "1"],
        [3, "1"],
      ],
    },
    {
      row: 3,
      entries: [
        [0, "1"],
        [1, "2"],
        [3, "1"],
      ],
    },
  ],
};

function reseal(certificate: GenericSparseModularRankCertificate): void {
  certificate.certificateDigest =
    computeGenericSparseModularRankCertificateDigest(certificate);
}

function denseRankModulo(matrix: number[][], columnCount: number): number {
  const prime = 101;
  const rows = matrix.map((row) =>
    Array.from(
      { length: columnCount },
      (_unused, column) => ((row[column] ?? 0) + prime) % prime,
    ),
  );
  let rank = 0;
  for (
    let column = 0;
    column < columnCount && rank < rows.length;
    column += 1
  ) {
    const selected = rows.findIndex(
      (row, rowIndex) => rowIndex >= rank && row[column] !== 0,
    );
    if (selected < 0) continue;
    [rows[rank], rows[selected]] = [rows[selected], rows[rank]];
    let inverse = 1;
    while ((inverse * rows[rank][column]) % prime !== 1) inverse += 1;
    rows[rank] = rows[rank].map((value) => (value * inverse) % prime);
    for (let row = 0; row < rows.length; row += 1) {
      if (row === rank) continue;
      const factor = rows[row][column];
      rows[row] = rows[row].map(
        (value, cursor) =>
          (value - factor * rows[rank][cursor] + prime * prime) % prime,
      );
    }
    rank += 1;
  }
  return rank;
}

describe("generic proof-carrying sparse modular rank", () => {
  it("certifies both modular-rank inequalities without trusting a rank integer", () => {
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix,
      sourceBindings,
      modulusPrime: 101,
    });
    const certificate = certifyGenericSparseModularRank(request);
    expect(certificate).toMatchObject({
      status: "passed",
      rank: 2,
      nullity: 2,
      modulusPrime: 101,
      lowerBound: {
        pivotColumns: [0, 1],
      },
      upperBound: {
        freeColumns: [2, 3],
      },
    });
    expect(certificate.lowerBound.minorDeterminantResidue).not.toBe(0);
    expect(certificate.upperBound.kernelBasis).toHaveLength(2);

    const replay = replayGenericSparseModularRankCertificate({
      matrix,
      sourceBindings,
      certificate,
    });
    expect(replay.status).toBe("passed");
    expect(replay.certifiedRank).toBe(2);
    expect(replay.certifiedNullity).toBe(2);
    expect(Object.values(replay.checks).every(Boolean)).toBe(true);
  });

  it("handles rank-zero and nullity-zero edge cases", () => {
    const zero: GenericSparseIntegerMatrix = {
      schemaVersion: 1,
      rowCount: 2,
      columnCount: 3,
      rows: [
        { row: 0, entries: [] },
        { row: 1, entries: [] },
      ],
    };
    const zeroRequest = buildGenericSparseModularRankWorkerRequest({
      matrix: zero,
      sourceBindings,
      modulusPrime: 103,
    });
    const zeroCertificate = certifyGenericSparseModularRank(zeroRequest);
    expect(zeroCertificate).toMatchObject({
      rank: 0,
      nullity: 3,
      lowerBound: { minorDeterminantResidue: 1 },
    });
    expect(
      replayGenericSparseModularRankCertificate({
        matrix: zero,
        sourceBindings,
        certificate: zeroCertificate,
      }).status,
    ).toBe("passed");

    const injective: GenericSparseIntegerMatrix = {
      schemaVersion: 1,
      rowCount: 3,
      columnCount: 2,
      rows: [
        { row: 0, entries: [[0, "1"]] },
        { row: 1, entries: [[1, "1"]] },
        {
          row: 2,
          entries: [
            [0, "1"],
            [1, "1"],
          ],
        },
      ],
    };
    const injectiveRequest = buildGenericSparseModularRankWorkerRequest({
      matrix: injective,
      sourceBindings,
      modulusPrime: 107,
    });
    const injectiveCertificate =
      certifyGenericSparseModularRank(injectiveRequest);
    expect(injectiveCertificate).toMatchObject({ rank: 2, nullity: 0 });
    expect(injectiveCertificate.upperBound.kernelBasis).toEqual([]);
    expect(
      replayGenericSparseModularRankCertificate({
        matrix: injective,
        sourceBindings,
        certificate: injectiveCertificate,
      }).status,
    ).toBe("passed");
  });

  it("agrees with independent dense elimination on varied sparse shapes", () => {
    let state = 0x51f15e;
    const random = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };
    for (let trial = 0; trial < 30; trial += 1) {
      const rowCount = random() % 7;
      const columnCount = random() % 7;
      const dense = Array.from({ length: rowCount }, () =>
        Array.from({ length: columnCount }, () => (random() % 7) - 3),
      );
      const sparse: GenericSparseIntegerMatrix = {
        schemaVersion: 1,
        rowCount,
        columnCount,
        rows: dense.map((row, rowIndex) => ({
          row: rowIndex,
          entries: row.flatMap((coefficient, column) =>
            coefficient === 0
              ? []
              : ([[column, coefficient.toString()]] as Array<[number, string]>),
          ),
        })),
      };
      const request = buildGenericSparseModularRankWorkerRequest({
        matrix: sparse,
        sourceBindings,
        modulusPrime: 101,
      });
      const certificate = certifyGenericSparseModularRank(request);
      expect(certificate.rank).toBe(denseRankModulo(dense, columnCount));
      expect(
        replayGenericSparseModularRankCertificate({
          matrix: sparse,
          sourceBindings,
          certificate,
        }).status,
      ).toBe("passed");
    }
  });

  it("rejects a resealed singular pivot minor", () => {
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix,
      sourceBindings,
      modulusPrime: 101,
    });
    const tampered = structuredClone(certifyGenericSparseModularRank(request));
    tampered.lowerBound.pivotRows = [0, 3];
    tampered.lowerBound.minorDigest = canonicalSha256({ forged: "minor" });
    reseal(tampered);
    const replay = replayGenericSparseModularRankCertificate({
      matrix,
      sourceBindings,
      certificate: tampered,
    });
    expect(replay.status).toBe("failed");
    expect(replay.checks.certificateDigestMatches).toBe(true);
    expect(replay.checks.pivotMinorHasClaimedNonzeroDeterminant).toBe(false);
  });

  it("rejects a resealed non-closed kernel vector", () => {
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix,
      sourceBindings,
      modulusPrime: 101,
    });
    const tampered = structuredClone(certifyGenericSparseModularRank(request));
    const vector = tampered.upperBound.kernelBasis[0];
    const pivotEntry = vector.entries.find(([column]) => column === 0);
    if (pivotEntry === undefined) throw new Error("Expected a pivot entry.");
    pivotEntry[1] = (pivotEntry[1] % 100) + 1;
    tampered.upperBound.kernelBasisDigest = canonicalSha256({
      forged: "kernel",
    });
    reseal(tampered);
    const replay = replayGenericSparseModularRankCertificate({
      matrix,
      sourceBindings,
      certificate: tampered,
    });
    expect(replay.status).toBe("failed");
    expect(replay.checks.certificateDigestMatches).toBe(true);
    expect(replay.checks.everyKernelVectorIsClosed).toBe(false);
  });

  it("binds the matrix, preparation sources, and external-worker request", () => {
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix,
      sourceBindings: [...sourceBindings].reverse(),
      modulusPrime: 101,
    });
    expect(request.sourceBindings.map(({ id }) => id)).toEqual([
      "action",
      "preparation",
    ]);
    expect(request.requestDigest).toBe(
      computeGenericSparseModularRankRequestDigest(request),
    );
    expect(
      genericSparseModularRankRequestCanonicalBytes(request),
    ).toBeGreaterThan(0);
    const certificate = certifyGenericSparseModularRank(request);
    const wrongBindings = sourceBindings.map((binding) =>
      binding.id === "preparation"
        ? { ...binding, sha256: canonicalSha256({ preparation: 8 }) }
        : binding,
    );
    const replay = replayGenericSparseModularRankCertificate({
      matrix,
      sourceBindings: wrongBindings,
      certificate,
    });
    expect(replay.status).toBe("failed");
    expect(replay.checks.sourceBindingsMatch).toBe(false);
  });

  it("replays from a single-pass row source without retaining the full matrix", () => {
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix,
      sourceBindings,
      modulusPrime: 101,
    });
    const certificate = certifyGenericSparseModularRank(request);
    let readerInvocations = 0;
    let emittedRows = 0;
    const replay = replayGenericSparseModularRankCertificateFromReader({
      matrixReader: {
        schemaVersion: 1,
        rowCount: matrix.rowCount,
        columnCount: matrix.columnCount,
        forEachRow(visitor) {
          readerInvocations += 1;
          if (readerInvocations > 1) {
            throw new Error("This test reader cannot rewind.");
          }
          for (let row = 0; row < matrix.rowCount; row += 1) {
            emittedRows += 1;
            visitor({
              row,
              entries: matrix.rows[row].entries.map((entry) => [...entry]),
            });
          }
        },
      },
      sourceBindings,
      certificate,
    });
    expect(replay.status).toBe("passed");
    expect(readerInvocations).toBe(1);
    expect(emittedRows).toBe(matrix.rowCount);
  });

  it("rejects stale requests, composite moduli, and explicit resource overruns", () => {
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix,
      sourceBindings,
      modulusPrime: 101,
    });
    const stale = structuredClone(request);
    stale.matrix.rows[0].entries[0][1] = "2";
    expect(() => certifyGenericSparseModularRank(stale)).toThrow(/stale/i);
    expect(() =>
      buildGenericSparseModularRankWorkerRequest({
        matrix,
        sourceBindings,
        modulusPrime: 21,
      }),
    ).toThrow(/prime/i);
    expect(() =>
      certifyGenericSparseModularRank(request, {
        budgets: { maxFieldOperations: 1 },
      }),
    ).toThrow(/field operations/i);
    expect(() =>
      buildGenericSparseModularRankWorkerRequest({
        matrix,
        sourceBindings,
        modulusPrime: 101,
        budgets: { maxRows: 3 },
      }),
    ).toThrow(/row count/i);
  });

  it("reports replay resource exhaustion as incomplete, not invalid", () => {
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix,
      sourceBindings,
      modulusPrime: 101,
    });
    const certificate = certifyGenericSparseModularRank(request);
    const replay = replayGenericSparseModularRankCertificate({
      matrix,
      sourceBindings,
      certificate,
      budgets: { maxFieldOperations: 1 },
    });
    expect(replay.status).toBe("incomplete");
    expect(replay.stopReason).toMatch(/field operations/i);
    expect(replay.errors).toEqual([]);
    expect(replay.budgets).toMatchObject({
      maxFieldOperations: 1,
      maxCoefficientDigits: 4_096,
    });
  });

  it("bounds decimal coefficient tokens before constructing big integers", () => {
    const largeCoefficientMatrix: GenericSparseIntegerMatrix = {
      schemaVersion: 1,
      rowCount: 1,
      columnCount: 1,
      rows: [{ row: 0, entries: [[0, "123456"]] }],
    };
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix: largeCoefficientMatrix,
      sourceBindings,
      modulusPrime: 101,
    });
    const certificate = certifyGenericSparseModularRank(request);
    expect(() =>
      certifyGenericSparseModularRank(request, {
        budgets: { maxCoefficientDigits: 5 },
      }),
    ).toThrow(/coefficient digits/i);
    const replay = replayGenericSparseModularRankCertificate({
      matrix: largeCoefficientMatrix,
      sourceBindings,
      certificate,
      budgets: { maxCoefficientDigits: 5 },
    });
    expect(replay.status).toBe("incomplete");
    expect(replay.stopReason).toMatch(/coefficient digits/i);
    expect(replay.budgets.maxCoefficientDigits).toBe(5);
    expect(replay.errors).toEqual([]);
  });
});
