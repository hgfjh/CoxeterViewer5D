import { canonicalSha256 } from "../utils/canonicalSha256";
import type {
  StreamedGeometricEdge,
  StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";

const HASH_CHUNK_SIZE = 4_096;
const UINT32_SENTINEL = 0xffff_ffff;
const ALGORITHM_VERSION = "generic-tree-gauge-sparse-boundary-v1";

export interface GenericStreamedH1CotreeColumn {
  column: number;
  edgeIndex: number;
  edgeId: string;
  generator: number;
  sourcePoint: number;
  targetPoint: number;
}

export interface GenericStreamedH1BoundaryRow {
  row: number;
  cellId: string;
  /** Sorted pairs `[cotree column, signed integral coefficient]`. */
  entries: Array<[number, string]>;
}

export interface GenericStreamedH1MatrixEntry {
  row: number;
  column: number;
  coefficient: string;
}

export interface GenericStreamedH1WallVector {
  /** Position in the sorted list of two-sided wall ids. */
  wall: number;
  wallId: string;
  /** Sparse cotree-gauged cocycle in canonical cotree-column order. */
  entries: Array<[number, string]>;
  vectorDigest: string;
}

export interface GenericStreamedH1PreparationCertificate {
  schemaVersion: 1;
  kind: "generic-streamed-integral-h1-preparation";
  status: "prepared";
  method: "canonical-bfs-tree-gauge-rank-two-boundary-stream";
  algorithmVersion: typeof ALGORITHM_VERSION;
  source: {
    systemCanonicalSha256: string;
    oracleStructureHash: string;
    actionRowsCanonicalSha256: string;
    degree: number;
    generatorCount: number;
    geometricEdgeCount: number;
    rankTwoCellCount: number;
  };
  graph: {
    rootPoint: 0;
    vertexCount: number;
    reachedVertexCount: number;
    geometricEdgeCount: number;
    treeEdgeCount: number;
    cotreeEdgeCount: number;
    treeDigest: string;
    cotreeDigest: string;
    cotreeChunkDigests: string[];
  };
  boundary: {
    rowCount: number;
    columnCount: number;
    nonzeroCount: number;
    maximumAbsoluteCoefficient: string;
    duplicateBoundaryEdgeRowCount: number;
    chunkSize: typeof HASH_CHUNK_SIZE;
    rowChunkDigests: string[];
    sparseBoundaryDigest: string;
  };
  walls: {
    wallCount: number;
    twoSidedWallCount: number;
    twoSidedWallIds: string[];
    oneSidedWallIds: string[];
    ordering: "lexicographic-two-sided-wall-id";
    potentialStrategy: "lazy-one-wall-at-a-time";
    maximumResidentPotentialEntries: number;
    nonzeroCount: number;
    chunkSize: typeof HASH_CHUNK_SIZE;
    vectorChunkDigests: string[];
    wallVectorDigest: string;
  };
  export: {
    matrixMarket: {
      format: "matrix-market-coordinate-integer-general";
      indexBase: 1;
      banner: "%%MatrixMarket matrix coordinate integer general";
      logicalExportDigest: string;
    };
    linboxSparseRow: {
      format: "linbox-sparse-row-integer";
      indexBase: 0;
      headerSuffix: "S";
      /** Exact digest consumed by genericSparseModularRank replay. */
      genericSparseMatrixDigest: string;
      logicalExportDigest: string;
    };
    rowOrdering: "canonical-oracle-rank-two-cell-stream";
    columnOrdering: "increasing-canonical-geometric-edge-index-after-tree-deletion";
    coefficientEncoding: "base-10-signed-integer";
  };
  checks: {
    quotientGraphConnected: boolean;
    bfsTreeHasExpectedSize: boolean;
    everyGeometricEdgeDiscovered: boolean;
    everyRankTwoCellStreamed: boolean;
    everySignedBoundaryClosesInC0: boolean;
    cotreePartitionComplete: boolean;
    boundaryDimensionsSafeIntegers: boolean;
    allOracleWallsAccountedFor: boolean;
    everyTwoSidedWallCocycleCloses: boolean;
  };
  claims: string[];
  nonClaims: string[];
  preparationDigest: string;
}

export interface GenericStreamedH1Preparation {
  readonly certificate: GenericStreamedH1PreparationCertificate;
  forEachCotreeColumn(
    visitor: (column: GenericStreamedH1CotreeColumn) => void,
  ): void;
  forEachBoundaryRow(
    visitor: (row: GenericStreamedH1BoundaryRow) => void,
  ): void;
  forEachMatrixEntry(
    visitor: (entry: GenericStreamedH1MatrixEntry) => void,
  ): void;
  forEachMatrixMarketLine(visitor: (line: string) => void): void;
  forEachLinBoxSparseRowLine(visitor: (line: string) => void): void;
  forEachTwoSidedWallVector(
    visitor: (vector: GenericStreamedH1WallVector) => void,
  ): void;
  cotreeColumnForEdgeIndex(edgeIndex: number): number | null;
}

export interface GenericStreamedH1PreparationReplay {
  schemaVersion: 1;
  kind: "generic-streamed-integral-h1-preparation-replay";
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    storedPreparationDigestValid: boolean;
    sourceBindingMatches: boolean;
    actionRootedReconstructionMatches: boolean;
  };
  rebuiltPreparationDigest?: string;
  errors: string[];
  replayDigest: string;
}

interface PackedGeometricEdges {
  generator: Uint32Array;
  source: Uint32Array;
  target: Uint32Array;
  occurrenceCount: Uint8Array;
  everyEdgeDiscovered: boolean;
}

interface TreeGauge {
  parent: Uint32Array;
  parentGenerator: Int32Array;
  treeEdge: Uint8Array;
  reachedVertexCount: number;
  treeEdgeCount: number;
  treeDigest: string;
  bfsOrder: Uint32Array;
}

interface BoundaryScan {
  rowCount: number;
  nonzeroCount: number;
  maximumAbsoluteCoefficient: bigint;
  duplicateBoundaryEdgeRowCount: number;
  everySignedBoundaryClosesInC0: boolean;
  rowChunkDigests: string[];
  sparseBoundaryDigest: string;
  genericSparseMatrixDigest: string;
  everyTwoSidedWallCocycleCloses: boolean;
}

interface WallScan {
  twoSidedWallIds: string[];
  oneSidedWallIds: string[];
  nonzeroCount: number;
  vectorChunkDigests: string[];
  wallVectorDigest: string;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function assertSafeNonnegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer.`);
  }
}

function geometricEdgeRecordEqual(
  left: StreamedGeometricEdge,
  rightGenerator: number,
  rightSource: number,
  rightTarget: number,
): boolean {
  return (
    left.generator === rightGenerator &&
    left.sourcePoint === rightSource &&
    left.targetPoint === rightTarget
  );
}

function packGeometricEdges(
  oracle: StreamedLawfulDavisOracle,
): PackedGeometricEdges {
  if (oracle.degree > UINT32_SENTINEL) {
    throw new RangeError(
      `A streamed H^1 quotient may have at most ${UINT32_SENTINEL} vertices.`,
    );
  }
  const generator = new Uint32Array(oracle.geometricEdgeCount);
  const source = new Uint32Array(oracle.geometricEdgeCount);
  const target = new Uint32Array(oracle.geometricEdgeCount);
  const occurrenceCount = new Uint8Array(oracle.geometricEdgeCount);

  for (let point = 0; point < oracle.degree; point += 1) {
    for (
      let currentGenerator = 0;
      currentGenerator < oracle.generatorCount;
      currentGenerator += 1
    ) {
      const edge = oracle.geometricEdge(point, currentGenerator);
      if (
        !Number.isSafeInteger(edge.edgeIndex) ||
        edge.edgeIndex < 0 ||
        edge.edgeIndex >= oracle.geometricEdgeCount
      ) {
        throw new Error(
          `Geometric edge index ${edge.edgeIndex} is outside the advertised edge stream.`,
        );
      }
      if (occurrenceCount[edge.edgeIndex] === 0) {
        generator[edge.edgeIndex] = edge.generator;
        source[edge.edgeIndex] = edge.sourcePoint;
        target[edge.edgeIndex] = edge.targetPoint;
      } else if (
        !geometricEdgeRecordEqual(
          edge,
          generator[edge.edgeIndex],
          source[edge.edgeIndex],
          target[edge.edgeIndex],
        )
      ) {
        throw new Error(`Geometric edge ${edge.edgeIndex} is not stable.`);
      }
      if (occurrenceCount[edge.edgeIndex] === 0xff) {
        throw new Error(
          `Geometric edge ${edge.edgeIndex} has more than 255 directed occurrences.`,
        );
      }
      occurrenceCount[edge.edgeIndex] += 1;
    }
  }

  return {
    generator,
    source,
    target,
    occurrenceCount,
    everyEdgeDiscovered: occurrenceCount.every((count) => count > 0),
  };
}

function buildTreeGauge(oracle: StreamedLawfulDavisOracle): TreeGauge {
  const parent = new Uint32Array(oracle.degree);
  parent.fill(UINT32_SENTINEL);
  const parentGenerator = new Int32Array(oracle.degree);
  parentGenerator.fill(-1);
  const treeEdge = new Uint8Array(oracle.geometricEdgeCount);
  const queue = new Uint32Array(oracle.degree);
  if (oracle.degree === 0) {
    throw new Error("A quotient action must contain a root vertex.");
  }
  parent[0] = 0;
  queue[0] = 0;
  let head = 0;
  let tail = 1;
  let treeEdgeCount = 0;
  while (head < tail) {
    const point = queue[head++];
    for (let generator = 0; generator < oracle.generatorCount; generator += 1) {
      const target = oracle.neighbor(point, generator);
      if (parent[target] !== UINT32_SENTINEL) continue;
      parent[target] = point;
      parentGenerator[target] = generator;
      const edgeIndex = oracle.geometricEdge(point, generator).edgeIndex;
      treeEdge[edgeIndex] = 1;
      treeEdgeCount += 1;
      queue[tail++] = target;
    }
  }

  const chunks: string[] = [];
  let records: Array<[number, number, number]> = [];
  for (let point = 0; point < oracle.degree; point += 1) {
    records.push([point, parent[point], parentGenerator[point]]);
    if (records.length === HASH_CHUNK_SIZE) {
      chunks.push(canonicalSha256({ chunkIndex: chunks.length, records }));
      records = [];
    }
  }
  if (records.length > 0) {
    chunks.push(canonicalSha256({ chunkIndex: chunks.length, records }));
  }
  return {
    parent,
    parentGenerator,
    treeEdge,
    reachedVertexCount: tail,
    treeEdgeCount,
    bfsOrder: queue,
    treeDigest: canonicalSha256({
      schemaVersion: 1,
      method: "canonical-generator-order-bfs-tree-chunk-stream",
      oracleStructureHash: oracle.structureHash,
      rootPoint: 0,
      vertexCount: oracle.degree,
      chunkSize: HASH_CHUNK_SIZE as typeof HASH_CHUNK_SIZE,
      chunks,
    }),
  };
}

function makeCotreeColumns(input: {
  oracle: StreamedLawfulDavisOracle;
  packedEdges: PackedGeometricEdges;
  tree: TreeGauge;
}): {
  cotreeColumnByEdge: Int32Array;
  edgeIndexByCotreeColumn: Uint32Array;
  chunkDigests: string[];
  digest: string;
} {
  const { oracle, packedEdges, tree } = input;
  const cotreeCount = oracle.geometricEdgeCount - tree.treeEdgeCount;
  if (cotreeCount > 0x7fff_ffff) {
    throw new RangeError(
      "The JavaScript streamed H^1 bridge supports at most 2^31-1 cotree columns.",
    );
  }
  const cotreeColumnByEdge = new Int32Array(oracle.geometricEdgeCount);
  cotreeColumnByEdge.fill(-1);
  const edgeIndexByCotreeColumn = new Uint32Array(cotreeCount);
  const chunkDigests: string[] = [];
  let records: Array<{
    column: number;
    edgeIndex: number;
    edgeId: string;
    generator: number;
    sourcePoint: number;
    targetPoint: number;
  }> = [];
  let column = 0;
  for (
    let edgeIndex = 0;
    edgeIndex < oracle.geometricEdgeCount;
    edgeIndex += 1
  ) {
    if (tree.treeEdge[edgeIndex] !== 0) continue;
    cotreeColumnByEdge[edgeIndex] = column;
    edgeIndexByCotreeColumn[column] = edgeIndex;
    const geometric = oracle.geometricEdge(
      packedEdges.source[edgeIndex],
      packedEdges.generator[edgeIndex],
    );
    records.push({
      column,
      edgeIndex,
      edgeId: geometric.id,
      generator: packedEdges.generator[edgeIndex],
      sourcePoint: packedEdges.source[edgeIndex],
      targetPoint: packedEdges.target[edgeIndex],
    });
    if (records.length === HASH_CHUNK_SIZE) {
      chunkDigests.push(
        canonicalSha256({ chunkIndex: chunkDigests.length, records }),
      );
      records = [];
    }
    column += 1;
  }
  if (records.length > 0) {
    chunkDigests.push(
      canonicalSha256({ chunkIndex: chunkDigests.length, records }),
    );
  }
  if (column !== cotreeCount) {
    throw new Error(`Built ${column}/${cotreeCount} cotree columns.`);
  }
  return {
    cotreeColumnByEdge,
    edgeIndexByCotreeColumn,
    chunkDigests,
    digest: canonicalSha256({
      schemaVersion: 1,
      method: "increasing-edge-index-cotree-column-chunk-stream",
      oracleStructureHash: oracle.structureHash,
      treeDigest: tree.treeDigest,
      columnCount: cotreeCount,
      chunkSize: HASH_CHUNK_SIZE as typeof HASH_CHUNK_SIZE,
      chunks: chunkDigests,
    }),
  };
}

function canonicalBoundaryEntries(
  cotreeColumnByEdge: Int32Array,
  boundary: readonly {
    edgeIndex: number;
    traversal: 1 | -1;
  }[],
): Array<[number, bigint]> {
  const sums = new Map<number, bigint>();
  for (const occurrence of boundary) {
    const column = cotreeColumnByEdge[occurrence.edgeIndex];
    if (column < 0) continue;
    sums.set(column, (sums.get(column) ?? 0n) + BigInt(occurrence.traversal));
  }
  return [...sums.entries()]
    .filter(([, coefficient]) => coefficient !== 0n)
    .sort(([left], [right]) => left - right);
}

function scanBoundary(input: {
  oracle: StreamedLawfulDavisOracle;
  cotreeColumnByEdge: Int32Array;
  columnCount: number;
  twoSidedWallIds: ReadonlySet<string>;
}): BoundaryScan {
  const { oracle, cotreeColumnByEdge, columnCount, twoSidedWallIds } = input;
  let rowCount = 0;
  let nonzeroCount = 0;
  let maximumAbsoluteCoefficient = 0n;
  let duplicateBoundaryEdgeRowCount = 0;
  let everySignedBoundaryClosesInC0 = true;
  let everyTwoSidedWallCocycleCloses = true;
  const rowChunkDigests: string[] = [];
  const genericSparseRowChunkDigests: string[] = [];
  let records: Array<{
    row: number;
    cellId: string;
    entries: Array<[number, string]>;
  }> = [];

  oracle.forEachRankTwoCell((cell) => {
    const vertexBoundary = new Map<number, bigint>();
    const wallBoundary = new Map<string, bigint>();
    for (const occurrence of cell.boundary) {
      vertexBoundary.set(
        occurrence.sourcePoint,
        (vertexBoundary.get(occurrence.sourcePoint) ?? 0n) - 1n,
      );
      vertexBoundary.set(
        occurrence.targetPoint,
        (vertexBoundary.get(occurrence.targetPoint) ?? 0n) + 1n,
      );
      const binding = oracle.wallBinding(
        occurrence.sourcePoint,
        occurrence.generator,
      );
      if (binding.edgeIndex !== occurrence.edgeIndex) {
        throw new Error(
          `Wall binding and cellular boundary disagree on edge ${occurrence.edgeIndex}.`,
        );
      }
      if (twoSidedWallIds.has(binding.wallId)) {
        wallBoundary.set(
          binding.wallId,
          (wallBoundary.get(binding.wallId) ?? 0n) +
            BigInt(binding.edgeParity * occurrence.traversal),
        );
      }
    }
    everySignedBoundaryClosesInC0 &&= [...vertexBoundary.values()].every(
      (value) => value === 0n,
    );
    everyTwoSidedWallCocycleCloses &&= [...wallBoundary.values()].every(
      (value) => value === 0n,
    );
    if (
      new Set(cell.boundary.map((occurrence) => occurrence.edgeIndex)).size !==
      cell.boundary.length
    ) {
      duplicateBoundaryEdgeRowCount += 1;
    }
    const entries = canonicalBoundaryEntries(cotreeColumnByEdge, cell.boundary);
    nonzeroCount += entries.length;
    assertSafeNonnegativeInteger(nonzeroCount, "Boundary nonzero count");
    for (const [, coefficient] of entries) {
      maximumAbsoluteCoefficient =
        abs(coefficient) > maximumAbsoluteCoefficient
          ? abs(coefficient)
          : maximumAbsoluteCoefficient;
    }
    records.push({
      row: rowCount,
      cellId: oracle.cellId(cell.cell),
      entries: entries.map(([column, coefficient]) => [
        column,
        coefficient.toString(),
      ]),
    });
    if (records.length === HASH_CHUNK_SIZE) {
      genericSparseRowChunkDigests.push(
        canonicalSha256({
          schemaVersion: 1,
          method: "canonical-explicit-sparse-integer-matrix-row-chunk",
          chunkIndex: genericSparseRowChunkDigests.length,
          firstRow: records[0].row,
          rows: records.map(({ row, entries }) => ({ row, entries })),
        }),
      );
      rowChunkDigests.push(
        canonicalSha256({ chunkIndex: rowChunkDigests.length, records }),
      );
      records = [];
    }
    rowCount += 1;
  });
  if (records.length > 0) {
    genericSparseRowChunkDigests.push(
      canonicalSha256({
        schemaVersion: 1,
        method: "canonical-explicit-sparse-integer-matrix-row-chunk",
        chunkIndex: genericSparseRowChunkDigests.length,
        firstRow: records[0].row,
        rows: records.map(({ row, entries }) => ({ row, entries })),
      }),
    );
    rowChunkDigests.push(
      canonicalSha256({ chunkIndex: rowChunkDigests.length, records }),
    );
  }
  const sparseBoundaryDigest = canonicalSha256({
    schemaVersion: 1,
    method: "tree-gauged-rank-two-boundary-chunk-stream",
    oracleStructureHash: oracle.structureHash,
    rowCount,
    columnCount,
    nonzeroCount,
    maximumAbsoluteCoefficient: maximumAbsoluteCoefficient.toString(),
    chunkSize: HASH_CHUNK_SIZE,
    chunks: rowChunkDigests,
  });
  const genericSparseMatrixDigest = canonicalSha256({
    schemaVersion: 1,
    method: "chunked-canonical-explicit-sparse-integer-matrix-v1",
    rowCount,
    columnCount,
    nonzeroCount,
    maximumAbsoluteCoefficient: maximumAbsoluteCoefficient.toString(),
    chunkRowCount: HASH_CHUNK_SIZE,
    chunkDigests: genericSparseRowChunkDigests,
  });
  return {
    rowCount,
    nonzeroCount,
    maximumAbsoluteCoefficient,
    duplicateBoundaryEdgeRowCount,
    everySignedBoundaryClosesInC0,
    rowChunkDigests,
    sparseBoundaryDigest,
    genericSparseMatrixDigest,
    everyTwoSidedWallCocycleCloses,
  };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function directedWallCrossing(
  oracle: StreamedLawfulDavisOracle,
  point: number,
  generator: number,
): { wallId: string; coefficient: number } {
  const geometric = oracle.geometricEdge(point, generator);
  const traversal = geometric.sourcePoint === point ? 1 : -1;
  const binding = oracle.wallBinding(point, generator);
  if (binding.edgeIndex !== geometric.edgeIndex) {
    throw new Error(
      `Wall binding and geometric edge disagree at q${point}s${generator}.`,
    );
  }
  return {
    wallId: binding.wallId,
    coefficient: binding.edgeParity * traversal,
  };
}

function buildWallVector(input: {
  oracle: StreamedLawfulDavisOracle;
  packedEdges: PackedGeometricEdges;
  tree: TreeGauge;
  cotreeDigest: string;
  edgeIndexByCotreeColumn: Uint32Array;
  wall: number;
  wallId: string;
}): GenericStreamedH1WallVector {
  const {
    oracle,
    packedEdges,
    tree,
    cotreeDigest,
    edgeIndexByCotreeColumn,
    wall,
    wallId,
  } = input;
  // One potential vector is reused per wall. This keeps peak memory O(V+E)
  // instead of allocating the dense wall-by-vertex table used by the small
  // exact backend.
  const potential = new Float64Array(oracle.degree);
  for (let order = 1; order < tree.reachedVertexCount; order += 1) {
    const point = tree.bfsOrder[order];
    const parent = tree.parent[point];
    const generator = tree.parentGenerator[point];
    if (parent === UINT32_SENTINEL || generator < 0) {
      throw new Error(`Missing BFS-tree parent for q${point}.`);
    }
    const crossing = directedWallCrossing(oracle, parent, generator);
    const value =
      potential[parent] +
      (crossing.wallId === wallId ? crossing.coefficient : 0);
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `The tree potential for ${wallId} is not a safe integer.`,
      );
    }
    potential[point] = value;
  }

  const entries: Array<[number, string]> = [];
  for (let column = 0; column < edgeIndexByCotreeColumn.length; column += 1) {
    const edgeIndex = edgeIndexByCotreeColumn[column];
    const sourcePoint = packedEdges.source[edgeIndex];
    const targetPoint = packedEdges.target[edgeIndex];
    const generator = packedEdges.generator[edgeIndex];
    const crossing = directedWallCrossing(oracle, sourcePoint, generator);
    const value =
      potential[sourcePoint] -
      potential[targetPoint] +
      (crossing.wallId === wallId ? crossing.coefficient : 0);
    if (!Number.isSafeInteger(value)) {
      throw new Error(`The cotree period for ${wallId} is not a safe integer.`);
    }
    if (value !== 0) entries.push([column, BigInt(value).toString()]);
  }
  return {
    wall,
    wallId,
    entries,
    vectorDigest: canonicalSha256({
      schemaVersion: 1,
      method: "lazy-tree-gauged-two-sided-wall-vector",
      oracleStructureHash: oracle.structureHash,
      treeDigest: tree.treeDigest,
      cotreeDigest,
      wall,
      wallId,
      entries,
    }),
  };
}

function scanWalls(input: {
  oracle: StreamedLawfulDavisOracle;
  packedEdges: PackedGeometricEdges;
  tree: TreeGauge;
  cotreeDigest: string;
  edgeIndexByCotreeColumn: Uint32Array;
}): WallScan {
  const { oracle } = input;
  const twoSidedWallIds = oracle.walls.walls
    .filter((wall) => wall.twoSided)
    .map((wall) => wall.id)
    .sort(compareStrings);
  const oneSidedWallIds = oracle.walls.walls
    .filter((wall) => !wall.twoSided)
    .map((wall) => wall.id)
    .sort(compareStrings);
  let nonzeroCount = 0;
  const vectorChunkDigests: string[] = [];
  let records: Array<{
    wall: number;
    wallId: string;
    nonzeroCount: number;
    vectorDigest: string;
  }> = [];
  for (let wall = 0; wall < twoSidedWallIds.length; wall += 1) {
    const vector = buildWallVector({
      ...input,
      wall,
      wallId: twoSidedWallIds[wall],
    });
    nonzeroCount += vector.entries.length;
    assertSafeNonnegativeInteger(nonzeroCount, "Wall-vector nonzero count");
    records.push({
      wall,
      wallId: vector.wallId,
      nonzeroCount: vector.entries.length,
      vectorDigest: vector.vectorDigest,
    });
    if (records.length === HASH_CHUNK_SIZE) {
      vectorChunkDigests.push(
        canonicalSha256({ chunkIndex: vectorChunkDigests.length, records }),
      );
      records = [];
    }
  }
  if (records.length > 0) {
    vectorChunkDigests.push(
      canonicalSha256({ chunkIndex: vectorChunkDigests.length, records }),
    );
  }
  return {
    twoSidedWallIds,
    oneSidedWallIds,
    nonzeroCount,
    vectorChunkDigests,
    wallVectorDigest: canonicalSha256({
      schemaVersion: 1,
      method: "lazy-tree-gauged-two-sided-wall-vector-chunk-stream",
      oracleStructureHash: oracle.structureHash,
      actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
      treeDigest: input.tree.treeDigest,
      cotreeDigest: input.cotreeDigest,
      twoSidedWallIds,
      oneSidedWallIds,
      nonzeroCount,
      chunkSize: HASH_CHUNK_SIZE as typeof HASH_CHUNK_SIZE,
      chunks: vectorChunkDigests,
    }),
  };
}

function certificatePayload(
  certificate: GenericStreamedH1PreparationCertificate,
): Omit<GenericStreamedH1PreparationCertificate, "preparationDigest"> {
  const { preparationDigest, ...payload } = certificate;
  void preparationDigest;
  return payload;
}

export function computeGenericStreamedH1PreparationDigest(
  certificate: GenericStreamedH1PreparationCertificate,
): string {
  return canonicalSha256(certificatePayload(certificate));
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

/**
 * Prepare the exact sparse matrix whose integer kernel is H^1 of the quotient
 * 2-complex. Tree edges are killed by an integral spanning-tree gauge; no
 * dense row-by-column matrix is materialized.
 */
export function prepareGenericStreamedH1(
  oracle: StreamedLawfulDavisOracle,
): GenericStreamedH1Preparation {
  assertSafeNonnegativeInteger(oracle.degree, "Quotient degree");
  assertSafeNonnegativeInteger(
    oracle.geometricEdgeCount,
    "Geometric edge count",
  );
  assertSafeNonnegativeInteger(oracle.rankTwoCellCount, "Rank-two cell count");
  const packedEdges = packGeometricEdges(oracle);
  const tree = buildTreeGauge(oracle);
  if (tree.reachedVertexCount !== oracle.degree) {
    throw new Error(
      `The canonical BFS reaches ${tree.reachedVertexCount}/${oracle.degree} quotient vertices.`,
    );
  }
  const cotree = makeCotreeColumns({ oracle, packedEdges, tree });
  const twoSidedWallIds = new Set(
    oracle.walls.walls.filter((wall) => wall.twoSided).map((wall) => wall.id),
  );
  const boundary = scanBoundary({
    oracle,
    cotreeColumnByEdge: cotree.cotreeColumnByEdge,
    columnCount: cotree.edgeIndexByCotreeColumn.length,
    twoSidedWallIds,
  });
  const walls = scanWalls({
    oracle,
    packedEdges,
    tree,
    cotreeDigest: cotree.digest,
    edgeIndexByCotreeColumn: cotree.edgeIndexByCotreeColumn,
  });
  const accountedWallIds = [...walls.twoSidedWallIds, ...walls.oneSidedWallIds];
  const checks = {
    quotientGraphConnected: tree.reachedVertexCount === oracle.degree,
    bfsTreeHasExpectedSize: tree.treeEdgeCount === oracle.degree - 1,
    everyGeometricEdgeDiscovered: packedEdges.everyEdgeDiscovered,
    everyRankTwoCellStreamed: boundary.rowCount === oracle.rankTwoCellCount,
    everySignedBoundaryClosesInC0: boundary.everySignedBoundaryClosesInC0,
    cotreePartitionComplete:
      tree.treeEdgeCount + cotree.edgeIndexByCotreeColumn.length ===
      oracle.geometricEdgeCount,
    boundaryDimensionsSafeIntegers:
      Number.isSafeInteger(boundary.rowCount) &&
      Number.isSafeInteger(cotree.edgeIndexByCotreeColumn.length) &&
      Number.isSafeInteger(boundary.nonzeroCount),
    allOracleWallsAccountedFor:
      new Set(accountedWallIds).size === oracle.walls.wallCount &&
      accountedWallIds.length === oracle.walls.wallCount,
    everyTwoSidedWallCocycleCloses: boundary.everyTwoSidedWallCocycleCloses,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedChecks.length > 0) {
    throw new Error(
      `The generic streamed H^1 preparation failed: ${failedChecks.join(", ")}.`,
    );
  }
  const matrixMarketLogicalExportDigest = canonicalSha256({
    schemaVersion: 1,
    method: "matrix-market-logical-export-binding",
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    cotreeDigest: cotree.digest,
    sparseBoundaryDigest: boundary.sparseBoundaryDigest,
    rowCount: boundary.rowCount,
    columnCount: cotree.edgeIndexByCotreeColumn.length,
    nonzeroCount: boundary.nonzeroCount,
  });
  const linboxSparseRowLogicalExportDigest = canonicalSha256({
    schemaVersion: 1,
    method: "linbox-sparse-row-logical-export-binding",
    header: `${boundary.rowCount} ${cotree.edgeIndexByCotreeColumn.length} S`,
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    cotreeDigest: cotree.digest,
    sparseBoundaryDigest: boundary.sparseBoundaryDigest,
    genericSparseMatrixDigest: boundary.genericSparseMatrixDigest,
    rowCount: boundary.rowCount,
    columnCount: cotree.edgeIndexByCotreeColumn.length,
    nonzeroCount: boundary.nonzeroCount,
  });
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "generic-streamed-integral-h1-preparation" as const,
    status: "prepared" as const,
    method: "canonical-bfs-tree-gauge-rank-two-boundary-stream" as const,
    algorithmVersion: ALGORITHM_VERSION as typeof ALGORITHM_VERSION,
    source: {
      systemCanonicalSha256: canonicalSha256(oracle.system),
      oracleStructureHash: oracle.structureHash,
      actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
      degree: oracle.degree,
      generatorCount: oracle.generatorCount,
      geometricEdgeCount: oracle.geometricEdgeCount,
      rankTwoCellCount: oracle.rankTwoCellCount,
    },
    graph: {
      rootPoint: 0 as const,
      vertexCount: oracle.degree,
      reachedVertexCount: tree.reachedVertexCount,
      geometricEdgeCount: oracle.geometricEdgeCount,
      treeEdgeCount: tree.treeEdgeCount,
      cotreeEdgeCount: cotree.edgeIndexByCotreeColumn.length,
      treeDigest: tree.treeDigest,
      cotreeDigest: cotree.digest,
      cotreeChunkDigests: cotree.chunkDigests,
    },
    boundary: {
      rowCount: boundary.rowCount,
      columnCount: cotree.edgeIndexByCotreeColumn.length,
      nonzeroCount: boundary.nonzeroCount,
      maximumAbsoluteCoefficient:
        boundary.maximumAbsoluteCoefficient.toString(),
      duplicateBoundaryEdgeRowCount: boundary.duplicateBoundaryEdgeRowCount,
      chunkSize: HASH_CHUNK_SIZE as typeof HASH_CHUNK_SIZE,
      rowChunkDigests: boundary.rowChunkDigests,
      sparseBoundaryDigest: boundary.sparseBoundaryDigest,
    },
    walls: {
      wallCount: oracle.walls.wallCount,
      twoSidedWallCount: walls.twoSidedWallIds.length,
      twoSidedWallIds: walls.twoSidedWallIds,
      oneSidedWallIds: walls.oneSidedWallIds,
      ordering: "lexicographic-two-sided-wall-id" as const,
      potentialStrategy: "lazy-one-wall-at-a-time" as const,
      maximumResidentPotentialEntries: oracle.degree,
      nonzeroCount: walls.nonzeroCount,
      chunkSize: HASH_CHUNK_SIZE as typeof HASH_CHUNK_SIZE,
      vectorChunkDigests: walls.vectorChunkDigests,
      wallVectorDigest: walls.wallVectorDigest,
    },
    export: {
      matrixMarket: {
        format: "matrix-market-coordinate-integer-general" as const,
        indexBase: 1 as const,
        banner: "%%MatrixMarket matrix coordinate integer general" as const,
        logicalExportDigest: matrixMarketLogicalExportDigest,
      },
      linboxSparseRow: {
        format: "linbox-sparse-row-integer" as const,
        indexBase: 0 as const,
        headerSuffix: "S" as const,
        genericSparseMatrixDigest: boundary.genericSparseMatrixDigest,
        logicalExportDigest: linboxSparseRowLogicalExportDigest,
      },
      rowOrdering: "canonical-oracle-rank-two-cell-stream" as const,
      columnOrdering:
        "increasing-canonical-geometric-edge-index-after-tree-deletion" as const,
      coefficientEncoding: "base-10-signed-integer" as const,
    },
    checks,
    claims: [
      "The displayed sparse matrix is the exact rank-two cellular coboundary after an integral spanning-tree gauge.",
      "The integral kernel of this matrix is H^1 of the connected quotient 2-complex.",
      "Rows and columns are exposed in deterministic source-bound order for external exact backends.",
      "Every two-sided quotient wall is exposed as a canonical integral cotree cocycle using one lazy tree-potential vector at a time.",
    ],
    nonClaims: [
      "Preparation does not compute the rational rank or the saturated integral kernel.",
      "Preparation does not certify torsion-freeness of the action.",
      "No fibering or Morse-link conclusion follows from this sparse matrix alone.",
    ],
  };
  const certificate: GenericStreamedH1PreparationCertificate = {
    ...withoutDigest,
    preparationDigest: canonicalSha256(withoutDigest),
  };

  const forEachCotreeColumn = (
    visitor: (column: GenericStreamedH1CotreeColumn) => void,
  ): void => {
    for (
      let column = 0;
      column < cotree.edgeIndexByCotreeColumn.length;
      column += 1
    ) {
      const edgeIndex = cotree.edgeIndexByCotreeColumn[column];
      const geometric = oracle.geometricEdge(
        packedEdges.source[edgeIndex],
        packedEdges.generator[edgeIndex],
      );
      visitor({
        column,
        edgeIndex,
        edgeId: geometric.id,
        generator: packedEdges.generator[edgeIndex],
        sourcePoint: packedEdges.source[edgeIndex],
        targetPoint: packedEdges.target[edgeIndex],
      });
    }
  };
  const forEachBoundaryRow = (
    visitor: (row: GenericStreamedH1BoundaryRow) => void,
  ): void => {
    let row = 0;
    oracle.forEachRankTwoCell((cell) => {
      visitor({
        row,
        cellId: oracle.cellId(cell.cell),
        entries: canonicalBoundaryEntries(
          cotree.cotreeColumnByEdge,
          cell.boundary,
        ).map(([column, coefficient]) => [column, coefficient.toString()]),
      });
      row += 1;
    });
    if (row !== certificate.boundary.rowCount) {
      throw new Error(
        `Re-streamed ${row}/${certificate.boundary.rowCount} boundary rows.`,
      );
    }
  };

  return Object.freeze({
    certificate,
    forEachCotreeColumn,
    forEachBoundaryRow,
    forEachMatrixEntry: (
      visitor: (entry: GenericStreamedH1MatrixEntry) => void,
    ): void => {
      forEachBoundaryRow((row) => {
        for (const [column, coefficient] of row.entries) {
          visitor({ row: row.row, column, coefficient });
        }
      });
    },
    forEachMatrixMarketLine: (visitor: (line: string) => void): void => {
      visitor(certificate.export.matrixMarket.banner);
      visitor(
        `% coxeter-viewer source ${certificate.source.oracleStructureHash} boundary ${certificate.boundary.sparseBoundaryDigest}`,
      );
      visitor(
        `${certificate.boundary.rowCount} ${certificate.boundary.columnCount} ${certificate.boundary.nonzeroCount}`,
      );
      forEachBoundaryRow((row) => {
        for (const [column, coefficient] of row.entries) {
          visitor(`${row.row + 1} ${column + 1} ${coefficient}`);
        }
      });
    },
    forEachLinBoxSparseRowLine: (visitor: (line: string) => void): void => {
      visitor(
        `${certificate.boundary.rowCount} ${certificate.boundary.columnCount} S`,
      );
      forEachBoundaryRow((row) => {
        visitor(
          [
            String(row.entries.length),
            ...row.entries.flatMap(([column, coefficient]) => [
              String(column),
              coefficient,
            ]),
          ].join(" "),
        );
      });
    },
    forEachTwoSidedWallVector: (
      visitor: (vector: GenericStreamedH1WallVector) => void,
    ): void => {
      for (let wall = 0; wall < walls.twoSidedWallIds.length; wall += 1) {
        visitor(
          buildWallVector({
            oracle,
            packedEdges,
            tree,
            cotreeDigest: cotree.digest,
            edgeIndexByCotreeColumn: cotree.edgeIndexByCotreeColumn,
            wall,
            wallId: walls.twoSidedWallIds[wall],
          }),
        );
      }
    },
    cotreeColumnForEdgeIndex: (edgeIndex: number): number | null => {
      if (
        !Number.isSafeInteger(edgeIndex) ||
        edgeIndex < 0 ||
        edgeIndex >= cotree.cotreeColumnByEdge.length
      ) {
        throw new RangeError(
          `Geometric edge index ${edgeIndex} is out of range.`,
        );
      }
      const column = cotree.cotreeColumnByEdge[edgeIndex];
      return column < 0 ? null : column;
    },
  });
}

/** Rebuild the sparse preparation from the supplied action-rooted oracle. */
export function replayGenericStreamedH1Preparation(
  oracle: StreamedLawfulDavisOracle,
  claimed: GenericStreamedH1PreparationCertificate,
): GenericStreamedH1PreparationReplay {
  const errors: string[] = [];
  const envelopeRecognized =
    claimed.schemaVersion === 1 &&
    claimed.kind === "generic-streamed-integral-h1-preparation" &&
    claimed.method === "canonical-bfs-tree-gauge-rank-two-boundary-stream" &&
    claimed.algorithmVersion === ALGORITHM_VERSION;
  if (!envelopeRecognized) errors.push("The preparation envelope is unknown.");

  let storedPreparationDigestValid = false;
  try {
    storedPreparationDigestValid =
      claimed.preparationDigest ===
      computeGenericStreamedH1PreparationDigest(claimed);
  } catch (error) {
    errors.push(
      `The stored preparation cannot be canonicalized: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!storedPreparationDigestValid) {
    errors.push("The stored preparation digest is invalid.");
  }
  const sourceBindingMatches =
    claimed.source?.systemCanonicalSha256 === canonicalSha256(oracle.system) &&
    claimed.source?.oracleStructureHash === oracle.structureHash &&
    claimed.source?.actionRowsCanonicalSha256 ===
      oracle.actionRowsCanonicalSha256 &&
    claimed.source?.degree === oracle.degree &&
    claimed.source?.generatorCount === oracle.generatorCount &&
    claimed.source?.geometricEdgeCount === oracle.geometricEdgeCount &&
    claimed.source?.rankTwoCellCount === oracle.rankTwoCellCount;
  if (!sourceBindingMatches) {
    errors.push("The preparation source does not match the supplied oracle.");
  }

  let rebuiltPreparationDigest: string | undefined;
  let actionRootedReconstructionMatches = false;
  try {
    const rebuilt = prepareGenericStreamedH1(oracle).certificate;
    rebuiltPreparationDigest = rebuilt.preparationDigest;
    actionRootedReconstructionMatches = sameCanonicalValue(rebuilt, claimed);
    if (!actionRootedReconstructionMatches) {
      errors.push("The action-rooted sparse preparation does not replay.");
    }
  } catch (error) {
    errors.push(
      `The action-rooted reconstruction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const checks = {
    envelopeRecognized,
    storedPreparationDigestValid,
    sourceBindingMatches,
    actionRootedReconstructionMatches,
  };
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "generic-streamed-integral-h1-preparation-replay" as const,
    status: (Object.values(checks).every(Boolean) ? "passed" : "failed") as
      | "passed"
      | "failed",
    checks,
    ...(rebuiltPreparationDigest === undefined
      ? {}
      : { rebuiltPreparationDigest }),
    errors: [...new Set(errors)].sort(),
  };
  return {
    ...withoutDigest,
    replayDigest: canonicalSha256(withoutDigest),
  };
}
