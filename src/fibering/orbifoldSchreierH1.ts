import type {
  GenericSparseIntegerMatrix,
  GenericSparseIntegerMatrixReader,
  GenericSparseIntegerRow,
  GenericSparseMatrixSourceBinding,
} from "./genericSparseModularRank";
import type {
  ScalableSparseIntegerMatrixReader,
  ScalableSparseIntegerVectorInput,
} from "./scalableGenericH1Completion";
import {
  certifyOrbifoldFiniteActionStructure,
  type OrbifoldIntegralCharacter,
} from "./orbifoldIntersectionPromotion";
import type { TorsionFreeActionCandidate } from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";

const MATRIX_DIGEST_CHUNK_ROWS = 4_096;
const ALGORITHM_VERSION =
  "orbifold-reidemeister-schreier-tree-gauge-v1" as const;
const INTEGER_PATTERN = /^(0|-?[1-9][0-9]*)$/u;

interface DefiningRelator {
  id: string;
  word: number[];
}

export interface OrbifoldSchreierCotreeColumn {
  column: number;
  generator: number;
  sourcePoint: number;
  targetPoint: number;
  fixedLoop: boolean;
}

export interface OrbifoldSchreierH1PreparationCertificate {
  schemaVersion: 1;
  kind: "orbifold-schreier-h1-preparation";
  status: "prepared";
  method: "finite-action-reidemeister-schreier-tree-gauge";
  algorithmVersion: typeof ALGORITHM_VERSION;
  source: {
    systemDigest: string;
    actionRowsDigest: string;
    actionFingerprint: string;
    candidateId: string;
    degree: number;
    generatorCount: number;
  };
  action: {
    finiteTransitiveCoxeterAction: true;
    torsionFreeRequired: false;
    fixedGeneratorLoopCount: number;
  };
  graph: {
    vertexCount: number;
    reachedVertexCount: number;
    edgeOrbitCount: number;
    spanningTreeEdgeCount: number;
    cotreeColumnCount: number;
    bfsPointOrderDigest: string;
    spanningTreeDigest: string;
    cotreeDigest: string;
  };
  presentation: {
    definingRelatorCount: number;
    rewriteRowCount: number;
    rowOrdering: "bfs-basepoint-then-coxeter-relator";
    columnOrdering: "bfs-first-encounter-cotree-edge-orbit";
    fixedLoopConvention: "same-oriented-letter-so-involution-row-has-coefficient-two";
  };
  matrix: {
    rowCount: number;
    columnCount: number;
    nonzeroCount: number;
    maximumAbsoluteCoefficient: string;
    genericSparseMatrixDigest: string;
  };
  checks: {
    finiteActionStructurePassed: boolean;
    bfsReachedEveryPoint: boolean;
    spanningTreeHasExpectedSize: boolean;
    everyRelatorRewriteCloses: boolean;
    everyFixedGeneratorLoopRetained: boolean;
    matrixRowsCanonical: boolean;
  };
  claims: string[];
  nonClaims: string[];
  preparationDigest: string;
}

export interface OrbifoldSchreierH1Preparation {
  readonly certificate: OrbifoldSchreierH1PreparationCertificate;
  readonly genericMatrixReader: GenericSparseIntegerMatrixReader;
  readonly scalableMatrixReader: ScalableSparseIntegerMatrixReader;
  forEachCotreeColumn(
    visitor: (column: OrbifoldSchreierCotreeColumn) => void,
  ): void;
  forEachMatrixMarketLine(visitor: (line: string) => void): void;
  forEachLinBoxSparseRowLine(visitor: (line: string) => void): void;
  /** The signed cotree column used by q --s_g--> q.s_g, or null on the tree. */
  stepCoordinate(
    point: number,
    generator: number,
  ): { column: number; sign: -1 | 1 } | null;
}

export interface OrbifoldSchreierIntegralKernelVector {
  id: string;
  entries: Array<[column: number, coefficient: string]>;
}

export interface OrbifoldSchreierCocycleFamily {
  schemaVersion: 1;
  kind: "orbifold-schreier-integral-cocycle-family";
  preparationDigest: string;
  cocycles: Array<{
    id: string;
    primitive: boolean;
    coordinateGcd: string;
    coordinateDigest: string;
    character: OrbifoldIntegralCharacter;
  }>;
  familyDigest: string;
}

interface EdgeOrbitRecord extends OrbifoldSchreierCotreeColumn {
  key: string;
}

interface MatrixSummary {
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
  digest: string;
}

function edgeKey(generator: number, source: number, target: number): string {
  const left = Math.min(source, target);
  const right = Math.max(source, target);
  return `${generator}:${left}:${right}`;
}

function definingRelators(system: CoxeterSystemInput): DefiningRelator[] {
  const relators = Array.from(
    { length: system.rank },
    (_unused, generator) => ({
      id: `involution:g${generator}`,
      word: [generator, generator],
    }),
  );
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const order = system.coxeterMatrix[left][right];
      if (order === "inf") continue;
      relators.push({
        id: `finite-pair:g${left}-g${right}:m${order}`,
        word: Array.from({ length: 2 * order }, (_unused, step) =>
          step % 2 === 0 ? left : right,
        ),
      });
    }
  }
  return relators;
}

function actionRowsDigest(candidate: TorsionFreeActionCandidate): string {
  return canonicalSha256({
    index: candidate.index,
    generatorImages: candidate.generatorImages,
  });
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = abs(left);
  let b = abs(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function matrixDigestFromChunks(input: {
  rowCount: number;
  columnCount: number;
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
  chunkDigests: string[];
}): string {
  return canonicalSha256({
    schemaVersion: 1,
    method: "chunked-canonical-explicit-sparse-integer-matrix-v1",
    rowCount: input.rowCount,
    columnCount: input.columnCount,
    nonzeroCount: input.nonzeroCount,
    maximumAbsoluteCoefficient: input.maximumAbsoluteCoefficient.toString(),
    chunkRowCount: MATRIX_DIGEST_CHUNK_ROWS,
    chunkDigests: input.chunkDigests,
  });
}

function summarizeReader(
  reader: GenericSparseIntegerMatrixReader,
): MatrixSummary {
  const chunkDigests: string[] = [];
  let chunk: GenericSparseIntegerRow[] = [];
  let chunkFirstRow = 0;
  let expectedRow = 0;
  let nonzeroCount = 0;
  let maximumAbsoluteCoefficient = 0n;
  const flush = (): void => {
    if (chunk.length === 0) return;
    chunkDigests.push(
      canonicalSha256({
        schemaVersion: 1,
        method: "canonical-explicit-sparse-integer-matrix-row-chunk",
        chunkIndex: chunkDigests.length,
        firstRow: chunkFirstRow,
        rows: chunk,
      }),
    );
    chunk = [];
  };
  reader.forEachRow((row) => {
    if (row.row !== expectedRow) {
      throw new Error(
        `The Schreier reader emitted row ${row.row}; expected ${expectedRow}.`,
      );
    }
    let previousColumn = -1;
    for (const [column, coefficient] of row.entries) {
      if (
        !Number.isSafeInteger(column) ||
        column <= previousColumn ||
        column >= reader.columnCount ||
        !INTEGER_PATTERN.test(coefficient) ||
        coefficient === "0"
      ) {
        throw new Error(`Schreier matrix row ${row.row} is not canonical.`);
      }
      previousColumn = column;
      nonzeroCount += 1;
      maximumAbsoluteCoefficient =
        abs(BigInt(coefficient)) > maximumAbsoluteCoefficient
          ? abs(BigInt(coefficient))
          : maximumAbsoluteCoefficient;
    }
    if (chunk.length === 0) chunkFirstRow = row.row;
    chunk.push({
      row: row.row,
      entries: row.entries.map((entry) => [...entry]),
    });
    expectedRow += 1;
    if (chunk.length === MATRIX_DIGEST_CHUNK_ROWS) flush();
  });
  flush();
  if (expectedRow !== reader.rowCount) {
    throw new Error(
      `The Schreier reader emitted ${expectedRow}/${reader.rowCount} rows.`,
    );
  }
  return {
    nonzeroCount,
    maximumAbsoluteCoefficient,
    digest: matrixDigestFromChunks({
      rowCount: reader.rowCount,
      columnCount: reader.columnCount,
      nonzeroCount,
      maximumAbsoluteCoefficient,
      chunkDigests,
    }),
  };
}

/**
 * Build the Reidemeister--Schreier exponent-sum matrix for an arbitrary
 * transitive finite Coxeter action. Fixed generator loops are retained, so the
 * construction is valid when the point stabilizer has torsion.
 */
export function prepareOrbifoldSchreierH1(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): OrbifoldSchreierH1Preparation {
  const structure = certifyOrbifoldFiniteActionStructure(system, candidate);
  if (!Object.values(structure.checks).every(Boolean)) {
    throw new Error(
      structure.errors.join(" ") || "Invalid finite Coxeter action.",
    );
  }

  const visited = new Uint8Array(candidate.index);
  const bfsOrder: number[] = [0];
  const treeKeys = new Set<string>();
  visited[0] = 1;
  for (let cursor = 0; cursor < bfsOrder.length; cursor += 1) {
    const source = bfsOrder[cursor];
    for (let generator = 0; generator < system.rank; generator += 1) {
      const target = candidate.generatorImages[generator][source];
      if (visited[target] !== 0) continue;
      visited[target] = 1;
      bfsOrder.push(target);
      treeKeys.add(edgeKey(generator, source, target));
    }
  }
  if (bfsOrder.length !== candidate.index) {
    throw new Error("The finite action is not transitive from point zero.");
  }

  const seenEdgeKeys = new Set<string>();
  const cotreeColumns: EdgeOrbitRecord[] = [];
  let edgeOrbitCount = 0;
  let fixedGeneratorLoopCount = 0;
  const assignmentByKey = new Map<
    string,
    { column: number; positiveSource: number; fixedLoop: boolean } | null
  >();
  for (const source of bfsOrder) {
    for (let generator = 0; generator < system.rank; generator += 1) {
      const target = candidate.generatorImages[generator][source];
      const key = edgeKey(generator, source, target);
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      edgeOrbitCount += 1;
      if (source === target) fixedGeneratorLoopCount += 1;
      if (treeKeys.has(key)) {
        assignmentByKey.set(key, null);
        continue;
      }
      const column = cotreeColumns.length;
      const fixedLoop = source === target;
      cotreeColumns.push({
        key,
        column,
        generator,
        sourcePoint: source,
        targetPoint: target,
        fixedLoop,
      });
      assignmentByKey.set(key, {
        column,
        positiveSource: source,
        fixedLoop,
      });
    }
  }

  const stepColumn = Array.from({ length: system.rank }, () =>
    new Int32Array(candidate.index).fill(-1),
  );
  const stepSign = Array.from(
    { length: system.rank },
    () => new Int8Array(candidate.index),
  );
  for (let generator = 0; generator < system.rank; generator += 1) {
    for (let source = 0; source < candidate.index; source += 1) {
      const target = candidate.generatorImages[generator][source];
      const assignment = assignmentByKey.get(
        edgeKey(generator, source, target),
      );
      if (assignment === undefined)
        throw new Error("An action edge orbit was omitted.");
      if (assignment === null) continue;
      stepColumn[generator][source] = assignment.column;
      stepSign[generator][source] =
        assignment.fixedLoop || assignment.positiveSource === source ? 1 : -1;
    }
  }

  const relators = definingRelators(system);
  const rowCount = candidate.index * relators.length;
  let everyRelatorRewriteCloses = true;
  const forEachRow = (
    visitor: (row: GenericSparseIntegerRow) => void,
  ): void => {
    let rowIndex = 0;
    for (const basePoint of bfsOrder) {
      for (const relator of relators) {
        let point = basePoint;
        const sums = new Map<number, number>();
        for (const generator of relator.word) {
          const column = stepColumn[generator][point];
          if (column >= 0) {
            sums.set(
              column,
              (sums.get(column) ?? 0) + stepSign[generator][point],
            );
          }
          point = candidate.generatorImages[generator][point];
        }
        if (point !== basePoint) {
          everyRelatorRewriteCloses = false;
          throw new Error(`${relator.id} does not close at q${basePoint}.`);
        }
        const entries = [...sums.entries()]
          .filter(([, coefficient]) => coefficient !== 0)
          .sort(([left], [right]) => left - right)
          .map(
            ([column, coefficient]) =>
              [column, coefficient.toString()] as [number, string],
          );
        visitor({ row: rowIndex, entries });
        rowIndex += 1;
      }
    }
    if (rowIndex !== rowCount) {
      throw new Error(`Emitted ${rowIndex}/${rowCount} Schreier rows.`);
    }
  };
  const genericMatrixReader: GenericSparseIntegerMatrixReader = {
    schemaVersion: 1,
    rowCount,
    columnCount: cotreeColumns.length,
    forEachRow,
  };
  const matrixSummary = summarizeReader(genericMatrixReader);
  const scalableMatrixReader: ScalableSparseIntegerMatrixReader = {
    rowCount,
    columnCount: cotreeColumns.length,
    forEachRow(visitor) {
      forEachRow((row) =>
        visitor(
          { id: `rewrite-row-${row.row}`, entries: row.entries },
          row.row,
        ),
      );
    },
  };
  const checks: OrbifoldSchreierH1PreparationCertificate["checks"] = {
    finiteActionStructurePassed: true,
    bfsReachedEveryPoint: bfsOrder.length === candidate.index,
    spanningTreeHasExpectedSize: treeKeys.size === candidate.index - 1,
    everyRelatorRewriteCloses,
    everyFixedGeneratorLoopRetained:
      cotreeColumns.filter((column) => column.fixedLoop).length ===
      fixedGeneratorLoopCount,
    matrixRowsCanonical: true,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(
      "The orbifold Schreier preparation failed an internal check.",
    );
  }
  const withoutDigest: Omit<
    OrbifoldSchreierH1PreparationCertificate,
    "preparationDigest"
  > = {
    schemaVersion: 1,
    kind: "orbifold-schreier-h1-preparation",
    status: "prepared",
    method: "finite-action-reidemeister-schreier-tree-gauge",
    algorithmVersion: ALGORITHM_VERSION,
    source: {
      systemDigest: canonicalSha256(system),
      actionRowsDigest: actionRowsDigest(candidate),
      actionFingerprint: structure.actionFingerprint,
      candidateId: candidate.id,
      degree: candidate.index,
      generatorCount: system.rank,
    },
    action: {
      finiteTransitiveCoxeterAction: true,
      torsionFreeRequired: false,
      fixedGeneratorLoopCount,
    },
    graph: {
      vertexCount: candidate.index,
      reachedVertexCount: bfsOrder.length,
      edgeOrbitCount,
      spanningTreeEdgeCount: treeKeys.size,
      cotreeColumnCount: cotreeColumns.length,
      bfsPointOrderDigest: canonicalSha256(bfsOrder),
      spanningTreeDigest: canonicalSha256([...treeKeys].sort()),
      cotreeDigest: canonicalSha256(
        cotreeColumns.map(({ key, ...column }) => ({ key, ...column })),
      ),
    },
    presentation: {
      definingRelatorCount: relators.length,
      rewriteRowCount: rowCount,
      rowOrdering: "bfs-basepoint-then-coxeter-relator",
      columnOrdering: "bfs-first-encounter-cotree-edge-orbit",
      fixedLoopConvention:
        "same-oriented-letter-so-involution-row-has-coefficient-two",
    },
    matrix: {
      rowCount,
      columnCount: cotreeColumns.length,
      nonzeroCount: matrixSummary.nonzeroCount,
      maximumAbsoluteCoefficient:
        matrixSummary.maximumAbsoluteCoefficient.toString(),
      genericSparseMatrixDigest: matrixSummary.digest,
    },
    checks,
    claims: [
      "The displayed sparse matrix is the exponent-sum matrix of a complete Reidemeister--Schreier presentation for the point stabilizer.",
      "Integral H^1 of the point stabilizer is the integer right kernel of this matrix.",
    ],
    nonClaims: [
      "The finite action is not claimed to be torsion-free.",
      "Preparation alone does not compute the matrix rank or an integral kernel basis.",
      "Quotient links are not constructed or trusted by this H1 preparation.",
    ],
  };
  const certificate: OrbifoldSchreierH1PreparationCertificate = {
    ...withoutDigest,
    preparationDigest: canonicalSha256(withoutDigest),
  };

  return Object.freeze({
    certificate,
    genericMatrixReader,
    scalableMatrixReader,
    forEachCotreeColumn(
      visitor: (column: OrbifoldSchreierCotreeColumn) => void,
    ): void {
      for (const column of cotreeColumns) {
        visitor({
          column: column.column,
          generator: column.generator,
          sourcePoint: column.sourcePoint,
          targetPoint: column.targetPoint,
          fixedLoop: column.fixedLoop,
        });
      }
    },
    forEachMatrixMarketLine(visitor: (line: string) => void): void {
      visitor("%%MatrixMarket matrix coordinate integer general");
      visitor(
        `% orbifold Schreier source ${certificate.source.actionRowsDigest} boundary ${certificate.matrix.genericSparseMatrixDigest}`,
      );
      visitor(
        `${rowCount} ${cotreeColumns.length} ${matrixSummary.nonzeroCount}`,
      );
      forEachRow((row) => {
        for (const [column, coefficient] of row.entries) {
          visitor(`${row.row + 1} ${column + 1} ${coefficient}`);
        }
      });
    },
    forEachLinBoxSparseRowLine(visitor: (line: string) => void): void {
      visitor(`${rowCount} ${cotreeColumns.length} S`);
      forEachRow((row) =>
        visitor(
          [
            String(row.entries.length),
            ...row.entries.flatMap(([column, coefficient]) => [
              String(column),
              coefficient,
            ]),
          ].join(" "),
        ),
      );
    },
    stepCoordinate(point: number, generator: number) {
      if (
        !Number.isSafeInteger(point) ||
        point < 0 ||
        point >= candidate.index ||
        !Number.isSafeInteger(generator) ||
        generator < 0 ||
        generator >= system.rank
      ) {
        throw new RangeError("A Schreier step coordinate is out of range.");
      }
      const column = stepColumn[generator][point];
      if (column < 0) return null;
      return { column, sign: stepSign[generator][point] as -1 | 1 };
    },
  });
}

export function orbifoldSchreierH1SourceBindings(
  preparation: OrbifoldSchreierH1Preparation,
): GenericSparseMatrixSourceBinding[] {
  return [
    {
      id: "action-rows",
      sha256: preparation.certificate.source.actionRowsDigest,
    },
    {
      id: "orbifold-schreier-preparation",
      sha256: preparation.certificate.preparationDigest,
    },
    { id: "system", sha256: preparation.certificate.source.systemDigest },
  ];
}

export function materializeOrbifoldSchreierH1Matrix(
  preparation: OrbifoldSchreierH1Preparation,
  bounds: { maxRows?: number; maxNonzeros?: number } = {},
): GenericSparseIntegerMatrix {
  const maxRows = bounds.maxRows ?? 500_000;
  const maxNonzeros = bounds.maxNonzeros ?? 5_000_000;
  const certificate = preparation.certificate;
  if (certificate.matrix.rowCount > maxRows) {
    throw new RangeError(
      `Schreier matrix has ${certificate.matrix.rowCount} rows; materialization bound is ${maxRows}.`,
    );
  }
  if (certificate.matrix.nonzeroCount > maxNonzeros) {
    throw new RangeError(
      `Schreier matrix has ${certificate.matrix.nonzeroCount} nonzeros; materialization bound is ${maxNonzeros}.`,
    );
  }
  const rows: GenericSparseIntegerRow[] = [];
  preparation.genericMatrixReader.forEachRow((row) =>
    rows.push({
      row: row.row,
      entries: row.entries.map((entry) => [...entry]),
    }),
  );
  return {
    schemaVersion: 1,
    rowCount: certificate.matrix.rowCount,
    columnCount: certificate.matrix.columnCount,
    rows,
  };
}

function normalizeKernelVector(
  vector: OrbifoldSchreierIntegralKernelVector,
  columnCount: number,
): Map<number, bigint> {
  const result = new Map<number, bigint>();
  let previous = -1;
  for (const [column, coefficient] of vector.entries) {
    if (
      !Number.isSafeInteger(column) ||
      column <= previous ||
      column >= columnCount ||
      !INTEGER_PATTERN.test(coefficient) ||
      coefficient === "0"
    ) {
      throw new Error(`Kernel vector ${vector.id} is not canonical.`);
    }
    previous = column;
    result.set(column, BigInt(coefficient));
  }
  return result;
}

/**
 * Turn exact integer-kernel vectors into explicit cocycles on the action graph.
 * The supplied vectors are not claimed to span a saturated or independent
 * lattice; a separate integral-kernel certificate must establish that.
 */
export function buildOrbifoldSchreierCocycleFamily(
  preparation: OrbifoldSchreierH1Preparation,
  vectors: readonly OrbifoldSchreierIntegralKernelVector[],
): OrbifoldSchreierCocycleFamily {
  const maps = vectors.map((vector) =>
    normalizeKernelVector(vector, preparation.certificate.matrix.columnCount),
  );
  const closed = Array<boolean>(vectors.length).fill(true);
  preparation.genericMatrixReader.forEachRow((row) => {
    for (let vector = 0; vector < maps.length; vector += 1) {
      let sum = 0n;
      for (const [column, coefficient] of row.entries) {
        sum += BigInt(coefficient) * (maps[vector].get(column) ?? 0n);
      }
      if (sum !== 0n) closed[vector] = false;
    }
  });
  if (closed.some((value) => !value)) {
    throw new Error("At least one proposed Schreier cocycle is not closed.");
  }

  const cocycles = vectors.map((vector, vectorIndex) => {
    const coordinates = maps[vectorIndex];
    let coordinateGcd = 0n;
    for (const value of coordinates.values()) {
      coordinateGcd = gcd(coordinateGcd, value);
    }
    const edgeIncrements = Array.from(
      { length: preparation.certificate.source.generatorCount },
      (_unused, generator) =>
        Array.from(
          { length: preparation.certificate.source.degree },
          (_unusedPoint, point) => {
            const coordinate = preparation.stepCoordinate(point, generator);
            if (!coordinate) return "0";
            return (
              BigInt(coordinate.sign) *
              (coordinates.get(coordinate.column) ?? 0n)
            ).toString();
          },
        ),
    );
    const coordinateDigest = canonicalSha256({
      preparationDigest: preparation.certificate.preparationDigest,
      id: vector.id,
      entries: vector.entries,
    });
    return {
      id: vector.id,
      primitive: coordinateGcd === 1n,
      coordinateGcd: coordinateGcd.toString(),
      coordinateDigest,
      character: {
        id: vector.id,
        edgeIncrements,
        sourceCertificateDigest: coordinateDigest,
      },
    };
  });
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "orbifold-schreier-integral-cocycle-family" as const,
    preparationDigest: preparation.certificate.preparationDigest,
    cocycles,
  };
  return { ...withoutDigest, familyDigest: canonicalSha256(withoutDigest) };
}

export function orbifoldSchreierKernelVectorsForCompletion(
  vectors: readonly OrbifoldSchreierIntegralKernelVector[],
): ScalableSparseIntegerVectorInput[] {
  return vectors.map((vector) => ({
    id: vector.id,
    entries: vector.entries,
  }));
}
