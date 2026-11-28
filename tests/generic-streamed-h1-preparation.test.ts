import { beforeAll, describe, expect, it } from "vitest";

import i25 from "../public/examples/I2_5.json";
import jnw from "../public/examples/jnw_cube_graph.json";
import {
  buildGenericActionH1Certificate,
  type GenericActionH1Certificate,
} from "../src/fibering/genericActionH1";
import { computeGenericSparseIntegerMatrixDigest } from "../src/fibering/genericSparseModularRank";
import {
  boundaryRowJobs,
  computeGenericStreamedH1PreparationDigest,
  prepareGenericStreamedH1,
  prepareGenericStreamedH1Parallel,
  replayGenericStreamedH1Preparation,
  type GenericStreamedH1BoundaryRow,
  type GenericStreamedH1PreparationCertificate,
} from "../src/fibering/genericStreamedH1Preparation";
import { buildJnwCubePositiveControlCertificate } from "../src/fibering/jnwCubePositiveControl";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { KernelPool } from "../src/parallel/kernelPool";
import { runKernel } from "../src/parallel/kernels";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

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
  return {
    id: `i2-${m}-right-regular`,
    index: 2 * m,
    generatorImages: [0, 1].map((generator) =>
      Array.from({ length: 2 * m }, (_unused, state) => {
        const rotation = Math.floor(state / 2);
        const reflected = state % 2;
        return generator === 0
          ? point(rotation, reflected ^ 1)
          : point(rotation + (reflected === 0 ? 1 : -1), reflected ^ 1);
      }),
    ),
  };
}

function oracleFor(system: unknown, accepted: TorsionFreeCandidateResult) {
  return buildStreamedLawfulDavisOracle({
    system,
    generatorImages: accepted.candidate.generatorImages,
  });
}

function exactRationalRank(
  rows: readonly GenericStreamedH1BoundaryRow[],
  columnCount: number,
): number {
  const matrix = rows.map((row) => {
    const dense = Array<bigint>(columnCount).fill(0n);
    for (const [column, coefficient] of row.entries) {
      dense[column] = BigInt(coefficient);
    }
    return dense;
  });
  let rank = 0;
  for (
    let column = 0;
    column < columnCount && rank < matrix.length;
    column += 1
  ) {
    let pivot = rank;
    while (pivot < matrix.length && matrix[pivot][column] === 0n) pivot += 1;
    if (pivot === matrix.length) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const pivotValue = matrix[rank][column];
    for (let row = rank + 1; row < matrix.length; row += 1) {
      const entry = matrix[row][column];
      if (entry === 0n) continue;
      for (let trailing = column + 1; trailing < columnCount; trailing += 1) {
        matrix[row][trailing] =
          matrix[row][trailing] * pivotValue - entry * matrix[rank][trailing];
      }
      matrix[row][column] = 0n;
    }
    rank += 1;
  }
  return rank;
}

function denseCompatibilityDigest(
  oracleStructureHash: string,
  rows: readonly GenericStreamedH1BoundaryRow[],
): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "canonical-tree-gauged-rank-two-boundary",
    oracleStructureHash,
    rows: rows.map((row) => ({
      cellId: row.cellId,
      entries: row.entries,
    })),
  });
}

function compareWithDenseBackend(input: {
  system: unknown;
  accepted: TorsionFreeCandidateResult;
}): {
  streamed: ReturnType<typeof prepareGenericStreamedH1>;
  dense: GenericActionH1Certificate;
  rows: GenericStreamedH1BoundaryRow[];
} {
  const oracle = oracleFor(input.system, input.accepted);
  const streamed = prepareGenericStreamedH1(oracle);
  const dense = buildGenericActionH1Certificate(
    input.system,
    input.accepted,
  ).certificate;
  expect(dense.status).toBe("passed");
  const rows: GenericStreamedH1BoundaryRow[] = [];
  streamed.forEachBoundaryRow((row) => rows.push(row));
  const columns: Array<{
    column: number;
    edgeIndex: number;
    edgeId: string;
  }> = [];
  streamed.forEachCotreeColumn(({ column, edgeIndex, edgeId }) => {
    columns.push({ column, edgeIndex, edgeId });
  });

  expect(streamed.certificate.graph).toMatchObject({
    vertexCount: dense.graph?.vertexCount,
    geometricEdgeCount: dense.graph?.geometricEdgeCount,
    treeEdgeCount: dense.graph?.treeEdgeCount,
    cotreeEdgeCount: dense.graph?.cotreeEdgeCount,
  });
  expect(columns).toEqual(dense.graph?.cotreeEdges);
  expect(streamed.certificate.boundary).toMatchObject({
    rowCount: dense.boundary?.rowCount,
    columnCount: dense.boundary?.columnCount,
    nonzeroCount: dense.boundary?.nonzeroCount,
    maximumAbsoluteCoefficient: dense.boundary?.maximumAbsoluteCoefficient,
  });
  expect(denseCompatibilityDigest(oracle.structureHash, rows)).toBe(
    dense.boundary?.sparseBoundaryDigest,
  );
  const relationRank = exactRationalRank(
    rows,
    streamed.certificate.boundary.columnCount,
  );
  expect(relationRank).toBe(dense.h1?.relationRank);
  expect(streamed.certificate.boundary.columnCount - relationRank).toBe(
    dense.h1?.rank,
  );
  return { streamed, dense, rows };
}

describe("generic streamed integral H1 preparation", () => {
  let jnwAccepted: TorsionFreeCandidateResult;

  beforeAll(() => {
    jnwAccepted = buildJnwCubePositiveControlCertificate(jnw).finiteAction;
  });

  it("matches the dense exact backend for zero-, rank-zero-, and positive-b1 examples", () => {
    const universal = universalDihedralAction();
    const regular = {
      system: i25,
      accepted: certify(i25, finiteDihedralRegularAction(5)),
    };
    const controls = [
      universal,
      regular,
      { system: jnw, accepted: jnwAccepted },
    ];
    expect(
      controls.map(
        (control) => compareWithDenseBackend(control).dense.h1?.rank,
      ),
    ).toEqual([1, 0, 6]);
  });

  it("exports the complete canonical sparse matrix without zero entries", () => {
    const { streamed, rows } = compareWithDenseBackend({
      system: jnw,
      accepted: jnwAccepted,
    });
    const entries: Array<{ row: number; column: number; coefficient: string }> =
      [];
    streamed.forEachMatrixEntry((entry) => entries.push(entry));
    expect(entries).toHaveLength(streamed.certificate.boundary.nonzeroCount);
    expect(entries.every((entry) => entry.coefficient !== "0")).toBe(true);
    expect(entries).toEqual(
      rows.flatMap((row) =>
        row.entries.map(([column, coefficient]) => ({
          row: row.row,
          column,
          coefficient,
        })),
      ),
    );

    const lines: string[] = [];
    streamed.forEachMatrixMarketLine((line) => lines.push(line));
    expect(lines[0]).toBe("%%MatrixMarket matrix coordinate integer general");
    expect(lines[2]).toBe(
      `${streamed.certificate.boundary.rowCount} ${streamed.certificate.boundary.columnCount} ${streamed.certificate.boundary.nonzeroCount}`,
    );
    expect(lines).toHaveLength(entries.length + 3);
    expect(lines.slice(3)).toEqual(
      entries.map(
        (entry) => `${entry.row + 1} ${entry.column + 1} ${entry.coefficient}`,
      ),
    );

    const linboxLines: string[] = [];
    streamed.forEachLinBoxSparseRowLine((line) => linboxLines.push(line));
    expect(linboxLines[0]).toBe(
      `${streamed.certificate.boundary.rowCount} ${streamed.certificate.boundary.columnCount} S`,
    );
    expect(linboxLines).toHaveLength(rows.length + 1);
    expect(linboxLines.slice(1)).toEqual(
      rows.map((row) =>
        [
          String(row.entries.length),
          ...row.entries.flatMap(([column, coefficient]) => [
            String(column),
            coefficient,
          ]),
        ].join(" "),
      ),
    );
    expect(
      streamed.certificate.export.linboxSparseRow.genericSparseMatrixDigest,
    ).toBe(
      computeGenericSparseIntegerMatrixDigest({
        schemaVersion: 1,
        rowCount: streamed.certificate.boundary.rowCount,
        columnCount: streamed.certificate.boundary.columnCount,
        rows: rows.map((row) => ({ row: row.row, entries: row.entries })),
      }),
    );
  });

  it("matches every dense-backend two-sided wall cocycle and closes it on every row", () => {
    const { streamed, dense, rows } = compareWithDenseBackend({
      system: jnw,
      accepted: jnwAccepted,
    });
    const vectors: Array<{ wallId: string; dense: bigint[]; digest: string }> =
      [];
    streamed.forEachTwoSidedWallVector((vector) => {
      const denseVector = Array<bigint>(
        streamed.certificate.boundary.columnCount,
      ).fill(0n);
      for (const [column, coefficient] of vector.entries) {
        denseVector[column] = BigInt(coefficient);
      }
      for (const row of rows) {
        const residual = row.entries.reduce(
          (sum, [column, coefficient]) =>
            sum + BigInt(coefficient) * denseVector[column],
          0n,
        );
        expect(residual).toBe(0n);
      }
      vectors.push({
        wallId: vector.wallId,
        dense: denseVector,
        digest: vector.vectorDigest,
      });
    });
    expect(vectors.map((vector) => vector.wallId)).toEqual(
      dense.walls?.wallClasses.map((wall) => wall.wallId),
    );
    expect(
      vectors.map((vector) =>
        canonicalSha256(vector.dense.map((value) => value.toString())),
      ),
    ).toEqual(dense.walls?.wallClasses.map((wall) => wall.cotreeVectorDigest));
    expect(new Set(vectors.map((vector) => vector.digest)).size).toBe(
      vectors.length,
    );
    expect(streamed.certificate.checks.everyTwoSidedWallCocycleCloses).toBe(
      true,
    );
  });

  it("replays exactly and rejects a self-resealed source forgery", () => {
    const input = universalDihedralAction();
    const oracle = oracleFor(input.system, input.accepted);
    const preparation = prepareGenericStreamedH1(oracle).certificate;
    expect(
      replayGenericStreamedH1Preparation(oracle, preparation),
    ).toMatchObject({
      status: "passed",
      checks: {
        envelopeRecognized: true,
        storedPreparationDigestValid: true,
        sourceBindingMatches: true,
        actionRootedReconstructionMatches: true,
      },
    });

    const forged = structuredClone(
      preparation,
    ) as GenericStreamedH1PreparationCertificate;
    forged.source.actionRowsCanonicalSha256 = "0".repeat(64);
    forged.preparationDigest =
      computeGenericStreamedH1PreparationDigest(forged);
    expect(replayGenericStreamedH1Preparation(oracle, forged)).toMatchObject({
      status: "failed",
      checks: {
        storedPreparationDigestValid: true,
        sourceBindingMatches: false,
        actionRootedReconstructionMatches: false,
      },
    });
  });

  it("gives the identical preparation when boundary rows run on a kernel pool", async () => {
    // Kernels run inline, with results passed through structured clone as
    // they would be from a worker thread.
    const clonePool: KernelPool = {
      size: 3,
      kind: "node-workers",
      run: async (name, args) => structuredClone(runKernel(name, args)),
      close: async () => {},
    };
    for (const { system, accepted } of [
      universalDihedralAction(),
      { system: jnw, accepted: jnwAccepted },
    ]) {
      const oracle = oracleFor(system, accepted);
      const sequential = prepareGenericStreamedH1(oracle).certificate;
      const parallel = (
        await prepareGenericStreamedH1Parallel(oracle, clonePool)
      ).certificate;
      expect(canonicalSha256(parallel)).toBe(canonicalSha256(sequential));
    }
  });

  it("splits boundary rows into ordered jobs that cover every cell once", () => {
    const oracle = oracleFor(jnw, jnwAccepted);
    const expected: string[] = [];
    oracle.forEachRankTwoCellPacked((cell) => expected.push(cell.cellId));
    const walk = oracle.rankTwoWalkTables();
    const tables = {
      ...walk.tables,
      cotreeColumnByEdge: new Int32Array(0),
      edgeToWall: new Uint32Array(0),
      edgeParity: new Int8Array(0),
      twoSidedWallIndex: new Uint8Array(0),
    };
    // Odd job sizes force splits inside bitset words and across types.
    for (const jobRows of [1, 5, 37, 1000]) {
      const seen: string[] = [];
      let nextRow = 0;
      for (const job of boundaryRowJobs(walk, tables, jobRows)) {
        expect(job.firstRow).toBe(nextRow);
        let taken = 0;
        for (const segment of job.segments) {
          let skip = segment.skip;
          let take = segment.take;
          segment.rootBits.forEach((bits, word) => {
            for (let bit = 0; bit < 32; bit += 1) {
              if (((bits >>> bit) & 1) === 0) continue;
              if (skip > 0) {
                skip -= 1;
              } else if (take > 0) {
                take -= 1;
                seen.push(
                  `${segment.idPrefix}${(segment.firstWord + word) * 32 + bit}`,
                );
              }
            }
          });
          expect(take).toBe(0);
          taken += segment.take;
        }
        nextRow += taken;
        expect(taken).toBeLessThanOrEqual(jobRows);
        if (nextRow < expected.length) expect(taken).toBe(jobRows);
      }
      expect(seen).toEqual(expected);
    }
  });
});
