import {
  canonicalSha256,
  createSha256Stream,
  sha256Hex,
} from "../utils/canonicalSha256";
import {
  allocShared,
  runOrdered,
  toShared,
  type KernelPool,
} from "../parallel/kernelPool";
import {
  runKernel,
  type KernelArgs,
  type KernelName,
  type KernelResult,
} from "../parallel/kernels";
import {
  type BoundaryRowInput,
  type BoundaryRowResult,
  type BoundaryRowSegment,
  type BoundaryRowTables,
} from "./boundaryRowKernel";
import {
  edgeStableId,
  StreamedLawfulDavisError,
  type PackedRankTwoCell,
  type RankTwoWalkTables,
  type StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";
import { popcount32 } from "./wallUnionKernel";

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

function assertSafeNonnegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer.`);
  }
}

/**
 * The preparation is written as a coroutine that yields batches of kernel
 * jobs and resumes with their results in job order.  runSync executes the
 * jobs inline; runOnPool spreads them over worker threads.  Every digest is
 * folded on the calling thread in job order, so both give the same
 * preparation.
 */
type KernelBatch = {
  [K in KernelName]: { name: K; jobs: Iterable<KernelArgs<K>> };
}[KernelName];
type PreparationSteps<T> = Generator<KernelBatch, T, unknown[]>;

function* runBatch<K extends KernelName>(
  name: K,
  jobs: Iterable<KernelArgs<K>>,
): PreparationSteps<KernelResult<K>[]> {
  const results = yield { name, jobs } as KernelBatch;
  return results as KernelResult<K>[];
}

function runSync<T>(steps: PreparationSteps<T>): T {
  let step = steps.next();
  while (!step.done) {
    const batch = step.value;
    const results: unknown[] = [];
    for (const job of batch.jobs) {
      results.push(runKernel(batch.name, job as never));
    }
    step = steps.next(results);
  }
  return step.value;
}

async function runOnPool<T>(
  steps: PreparationSteps<T>,
  pool: KernelPool,
): Promise<T> {
  let step = steps.next();
  while (!step.done) {
    const batch = step.value;
    const results: unknown[] = [];
    await runOrdered(
      pool,
      batch.jobs as Iterable<never>,
      (job) => pool.run(batch.name, job),
      (result) => results.push(result),
    );
    step = steps.next(results);
  }
  return step.value;
}

/** Records per hashing job: 64 chunks. */
const RECORD_JOB_SIZE = HASH_CHUNK_SIZE * 64;

/** [start, end) ranges of RECORD_JOB_SIZE records, chunk-aligned. */
function* recordRanges(count: number): Generator<[number, number]> {
  for (let start = 0; start < count; start += RECORD_JOB_SIZE) {
    yield [start, Math.min(count, start + RECORD_JOB_SIZE)];
  }
}

/** Typed arrays handed to kernels: shared on the pool path, as is inline. */
type Share = <T extends Uint32Array | Int32Array | Int8Array | Uint8Array>(
  array: T,
) => T;
const keep: Share = (array) => array;

// Chunk digests below are SHA-256 of literal canonical JSON (keys in sorted
// order, integers in decimal, coefficient strings quoted).  They equal
// canonicalSha256 of the corresponding record objects, which these passes
// used to build for every vertex, edge and 2-cell.

function packGeometricEdges(
  oracle: StreamedLawfulDavisOracle,
): PackedGeometricEdges {
  if (oracle.degree > UINT32_SENTINEL) {
    throw new RangeError(
      `A streamed H^1 quotient may have at most ${UINT32_SENTINEL} vertices.`,
    );
  }
  const { generator, source, target } = oracle.packedEdgeTables();
  if (generator.length !== oracle.geometricEdgeCount) {
    throw new Error("The packed edge table does not match the edge count.");
  }
  // Every directed generator step must land on an edge whose generator and
  // endpoints agree with the table: the same stability check as before,
  // without building an edge record per step.
  const occurrenceCount = new Uint8Array(oracle.geometricEdgeCount);
  for (let point = 0; point < oracle.degree; point += 1) {
    for (
      let currentGenerator = 0;
      currentGenerator < oracle.generatorCount;
      currentGenerator += 1
    ) {
      const edgeIndex = oracle.edgeIndexAt(point, currentGenerator);
      if (
        !Number.isSafeInteger(edgeIndex) ||
        edgeIndex < 0 ||
        edgeIndex >= oracle.geometricEdgeCount
      ) {
        throw new Error(
          `Geometric edge index ${edgeIndex} is outside the advertised edge stream.`,
        );
      }
      if (
        generator[edgeIndex] !== currentGenerator ||
        (source[edgeIndex] !== point && target[edgeIndex] !== point)
      ) {
        throw new Error(`Geometric edge ${edgeIndex} is not stable.`);
      }
      if (occurrenceCount[edgeIndex] === 0xff) {
        throw new Error(
          `Geometric edge ${edgeIndex} has more than 255 directed occurrences.`,
        );
      }
      occurrenceCount[edgeIndex] += 1;
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

function chunkRecordsDigest(chunkIndex: number, recordsJson: string): string {
  return sha256Hex(`{"chunkIndex":${chunkIndex},"records":[${recordsJson}]}`);
}

function* buildTreeGauge(
  oracle: StreamedLawfulDavisOracle,
): PreparationSteps<TreeGauge> {
  const parent = allocShared(Uint32Array, oracle.degree);
  parent.fill(UINT32_SENTINEL);
  const parentGenerator = allocShared(Int32Array, oracle.degree);
  parentGenerator.fill(-1);
  const treeEdge = new Uint8Array(oracle.geometricEdgeCount);
  const queue = allocShared(Uint32Array, oracle.degree);
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
      treeEdge[oracle.edgeIndexAt(point, generator)] = 1;
      treeEdgeCount += 1;
      queue[tail++] = target;
    }
  }

  // Records [point, parent, parentGenerator] in point order.
  const treeJobs = function* () {
    for (const [start, end] of recordRanges(oracle.degree)) {
      yield {
        parent,
        parentGenerator,
        firstPoint: start,
        pointCount: end - start,
        chunkSize: HASH_CHUNK_SIZE,
      };
    }
  };
  const chunks = (yield* runBatch("treeRecordChunks", treeJobs())).flat();
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

function* makeCotreeColumns(input: {
  oracle: StreamedLawfulDavisOracle;
  packedEdges: PackedGeometricEdges;
  tree: TreeGauge;
  share: Share;
}): PreparationSteps<{
  cotreeColumnByEdge: Int32Array;
  edgeIndexByCotreeColumn: Uint32Array;
  chunkDigests: string[];
  digest: string;
}> {
  const { oracle, packedEdges, tree, share } = input;
  const cotreeCount = oracle.geometricEdgeCount - tree.treeEdgeCount;
  if (cotreeCount > 0x7fff_ffff) {
    throw new RangeError(
      "The JavaScript streamed H^1 bridge supports at most 2^31-1 cotree columns.",
    );
  }
  const cotreeColumnByEdge = allocShared(Int32Array, oracle.geometricEdgeCount);
  cotreeColumnByEdge.fill(-1);
  const edgeIndexByCotreeColumn = allocShared(Uint32Array, cotreeCount);
  let column = 0;
  for (
    let edgeIndex = 0;
    edgeIndex < oracle.geometricEdgeCount;
    edgeIndex += 1
  ) {
    if (tree.treeEdge[edgeIndex] !== 0) continue;
    cotreeColumnByEdge[edgeIndex] = column;
    edgeIndexByCotreeColumn[column] = edgeIndex;
    column += 1;
  }
  if (column !== cotreeCount) {
    throw new Error(`Built ${column}/${cotreeCount} cotree columns.`);
  }
  const generator = share(packedEdges.generator);
  const source = share(packedEdges.source);
  const target = share(packedEdges.target);
  const columnJobs = function* () {
    for (const [start, end] of recordRanges(cotreeCount)) {
      yield {
        // A window: posting the whole table would copy it for every job.
        edgeIndexByColumn: edgeIndexByCotreeColumn.slice(start, end),
        firstColumn: start,
        chunkSize: HASH_CHUNK_SIZE,
        generator,
        source,
        target,
      };
    }
  };
  const chunkDigests = (yield* runBatch(
    "cotreeColumnChunks",
    columnJobs(),
  )).flat();
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

/**
 * Sparse boundary row of a 2-cell in the cotree gauge: summed traversal
 * signs per cotree column, nonzero only, columns increasing.  Fills the
 * scratch arrays and returns the entry count (at most the boundary length).
 */
function packedBoundaryEntries(
  cell: PackedRankTwoCell,
  cotreeColumnByEdge: Int32Array,
  columns: Int32Array,
  coefficients: Int32Array,
): number {
  let count = 0;
  for (let step = 0; step < cell.length; step += 1) {
    const column = cotreeColumnByEdge[cell.edgeIndex[step]];
    if (column < 0) continue;
    let slot = 0;
    while (slot < count && columns[slot] !== column) slot += 1;
    if (slot === count) {
      columns[count] = column;
      coefficients[count] = 0;
      count += 1;
    }
    coefficients[slot] += cell.traversal[step];
  }
  // Drop zero coefficients, then insertion-sort by column (<= 2m entries).
  let kept = 0;
  for (let slot = 0; slot < count; slot += 1) {
    if (coefficients[slot] === 0) continue;
    columns[kept] = columns[slot];
    coefficients[kept] = coefficients[slot];
    kept += 1;
  }
  for (let index = 1; index < kept; index += 1) {
    const column = columns[index];
    const coefficient = coefficients[index];
    let cursor = index - 1;
    while (cursor >= 0 && columns[cursor] > column) {
      columns[cursor + 1] = columns[cursor];
      coefficients[cursor + 1] = coefficients[cursor];
      cursor -= 1;
    }
    columns[cursor + 1] = column;
    coefficients[cursor + 1] = coefficient;
  }
  return kept;
}

/** Visits boundary rows in canonical order with reused scratch buffers. */
function forEachPackedBoundaryRow(
  oracle: StreamedLawfulDavisOracle,
  cotreeColumnByEdge: Int32Array,
  visit: (
    row: number,
    cell: PackedRankTwoCell,
    columns: Int32Array,
    coefficients: Int32Array,
    count: number,
  ) => void,
): number {
  let columns = new Int32Array(8);
  let coefficients = new Int32Array(8);
  let row = 0;
  oracle.forEachRankTwoCellPacked((cell) => {
    if (columns.length < cell.length) {
      columns = new Int32Array(cell.length);
      coefficients = new Int32Array(cell.length);
    }
    const count = packedBoundaryEntries(
      cell,
      cotreeColumnByEdge,
      columns,
      coefficients,
    );
    visit(row, cell, columns, coefficients, count);
    row += 1;
  });
  return row;
}

/** Boundary rows per kernel call: 64 hash chunks. */
const BOUNDARY_JOB_ROWS = HASH_CHUNK_SIZE * 64;

/**
 * Split the boundary rows into chunk-aligned ranges, in row order.  Each
 * range lists the rank-two types it covers as root-bitset windows, so a
 * kernel can walk exactly its rows without the rest of the oracle.
 */
export function* boundaryRowJobs(
  walk: RankTwoWalkTables,
  tables: BoundaryRowTables,
  /** Rows per job; a multiple of chunkSize except in planner tests. */
  jobRows = BOUNDARY_JOB_ROWS,
): Generator<BoundaryRowInput> {
  let segments: BoundaryRowSegment[] = [];
  let firstRow = 0;
  let rowsInJob = 0;
  const emit = (): BoundaryRowInput => {
    const job = {
      ...tables,
      firstRow,
      chunkSize: HASH_CHUNK_SIZE,
      segments,
    };
    firstRow += rowsInJob;
    rowsInJob = 0;
    segments = [];
    return job;
  };
  for (const type of walk.types) {
    const bits = type.rootBits;
    const segment = (start: number, end: number, skip: number, take: number) =>
      segments.push({
        typeId: type.typeId,
        idPrefix: type.idPrefix,
        left: type.left,
        right: type.right,
        relation: type.relation,
        rootBits: bits.slice(start, end),
        firstWord: start,
        skip,
        take,
      });
    let start = 0;
    let skip = 0;
    let take = 0;
    let consumedInWord = 0;
    for (let word = 0; word < bits.length; ) {
      const available = popcount32(bits[word]) - consumedInWord;
      const need = jobRows - rowsInJob;
      if (available <= need) {
        take += available;
        rowsInJob += available;
        word += 1;
        consumedInWord = 0;
        if (rowsInJob === jobRows) {
          if (take > 0) segment(start, word, skip, take);
          yield emit();
          start = word;
          skip = 0;
          take = 0;
        }
      } else {
        take += need;
        rowsInJob += need;
        consumedInWord += need;
        segment(start, word + 1, skip, take);
        yield emit();
        start = word;
        skip = consumedInWord;
        take = 0;
      }
    }
    if (take > 0) segment(start, bits.length, skip, take);
  }
  if (rowsInJob > 0) yield emit();
}

/** Folds kernel results, in row order, into the boundary scan. */
function createBoundaryAccumulator(input: {
  oracle: StreamedLawfulDavisOracle;
  columnCount: number;
}) {
  let rowCount = 0;
  let nonzeroCount = 0;
  let maximumAbsoluteCoefficient = 0;
  let duplicateBoundaryEdgeRowCount = 0;
  let everySignedBoundaryClosesInC0 = true;
  let everyTwoSidedWallCocycleCloses = true;
  const rowChunkDigests: string[] = [];
  const genericSparseRowChunkDigests: string[] = [];
  return {
    add(result: BoundaryRowResult) {
      if (!result.ok) {
        throw new StreamedLawfulDavisError(result.title, result.details);
      }
      rowCount += result.rowCount;
      nonzeroCount += result.nonzeroCount;
      assertSafeNonnegativeInteger(nonzeroCount, "Boundary nonzero count");
      maximumAbsoluteCoefficient = Math.max(
        maximumAbsoluteCoefficient,
        result.maximumAbsoluteCoefficient,
      );
      duplicateBoundaryEdgeRowCount += result.duplicateBoundaryEdgeRowCount;
      everySignedBoundaryClosesInC0 &&= result.everySignedBoundaryClosesInC0;
      everyTwoSidedWallCocycleCloses &&= result.everyTwoSidedWallCocycleCloses;
      for (const digest of result.recordChunkDigests) {
        rowChunkDigests.push(digest);
      }
      for (const digest of result.genericChunkDigests) {
        genericSparseRowChunkDigests.push(digest);
      }
    },
    finish(): BoundaryScan {
      const maximum = BigInt(maximumAbsoluteCoefficient);
      const sparseBoundaryDigest = canonicalSha256({
        schemaVersion: 1,
        method: "tree-gauged-rank-two-boundary-chunk-stream",
        oracleStructureHash: input.oracle.structureHash,
        rowCount,
        columnCount: input.columnCount,
        nonzeroCount,
        maximumAbsoluteCoefficient: maximum.toString(),
        chunkSize: HASH_CHUNK_SIZE,
        chunks: rowChunkDigests,
      });
      const genericSparseMatrixDigest = canonicalSha256({
        schemaVersion: 1,
        method: "chunked-canonical-explicit-sparse-integer-matrix-v1",
        rowCount,
        columnCount: input.columnCount,
        nonzeroCount,
        maximumAbsoluteCoefficient: maximum.toString(),
        chunkRowCount: HASH_CHUNK_SIZE,
        chunkDigests: genericSparseRowChunkDigests,
      });
      return {
        rowCount,
        nonzeroCount,
        maximumAbsoluteCoefficient: maximum,
        duplicateBoundaryEdgeRowCount,
        everySignedBoundaryClosesInC0,
        rowChunkDigests,
        sparseBoundaryDigest,
        genericSparseMatrixDigest,
        everyTwoSidedWallCocycleCloses,
      };
    },
  };
}

interface BoundaryScanInput {
  oracle: StreamedLawfulDavisOracle;
  cotreeColumnByEdge: Int32Array;
  columnCount: number;
  wallTables: { edgeToWall: Uint32Array; edgeParity: Int8Array };
  twoSidedWallIndex: Uint8Array;
}

function boundaryTables(
  input: BoundaryScanInput,
  walk: RankTwoWalkTables,
): BoundaryRowTables {
  return {
    ...walk.tables,
    cotreeColumnByEdge: input.cotreeColumnByEdge,
    edgeToWall: input.wallTables.edgeToWall,
    edgeParity: input.wallTables.edgeParity,
    twoSidedWallIndex: input.twoSidedWallIndex,
  };
}

function* scanBoundary(
  input: BoundaryScanInput,
  share: Share,
): PreparationSteps<BoundaryScan> {
  const walk = input.oracle.rankTwoWalkTables();
  const shared: RankTwoWalkTables = {
    ...walk,
    tables: {
      ...walk.tables,
      rows: walk.tables.rows.map(share),
      minimumBits: walk.tables.minimumBits.map(share),
      wordRank: walk.tables.wordRank.map(share),
      sourceBits: walk.tables.sourceBits.map(share),
    },
  };
  const tables = boundaryTables(
    {
      ...input,
      wallTables: {
        edgeToWall: share(input.wallTables.edgeToWall),
        edgeParity: share(input.wallTables.edgeParity),
      },
    },
    shared,
  );
  const accumulator = createBoundaryAccumulator(input);
  for (const result of yield* runBatch(
    "boundaryRows",
    boundaryRowJobs(shared, tables),
  )) {
    accumulator.add(result);
  }
  return accumulator.finish();
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Wall crossings along the BFS tree and along each cotree column, as
 * (wall index, signed coefficient) arrays.  Every wall vector is then plain
 * typed-array arithmetic instead of an edge-record lookup per step.
 */
interface WallCrossingTables {
  treeStepWall: Uint32Array;
  treeStepCoefficient: Int8Array;
  columnWall: Uint32Array;
  columnCoefficient: Int8Array;
}

function buildWallCrossingTables(input: {
  oracle: StreamedLawfulDavisOracle;
  packedEdges: PackedGeometricEdges;
  tree: TreeGauge;
  edgeIndexByCotreeColumn: Uint32Array;
  wallTables: { edgeToWall: Uint32Array; edgeParity: Int8Array };
}): WallCrossingTables {
  const { oracle, packedEdges, tree, edgeIndexByCotreeColumn, wallTables } =
    input;
  const treeStepWall = allocShared(Uint32Array, oracle.degree);
  const treeStepCoefficient = allocShared(Int8Array, oracle.degree);
  for (let order = 1; order < tree.reachedVertexCount; order += 1) {
    const point = tree.bfsOrder[order];
    const parent = tree.parent[point];
    const generator = tree.parentGenerator[point];
    if (parent === UINT32_SENTINEL || generator < 0) {
      throw new Error(`Missing BFS-tree parent for q${point}.`);
    }
    const edgeIndex = oracle.edgeIndexAt(parent, generator);
    const traversal = packedEdges.source[edgeIndex] === parent ? 1 : -1;
    treeStepWall[point] = wallTables.edgeToWall[edgeIndex];
    treeStepCoefficient[point] = wallTables.edgeParity[edgeIndex] * traversal;
  }
  const columnWall = allocShared(Uint32Array, edgeIndexByCotreeColumn.length);
  const columnCoefficient = allocShared(
    Int8Array,
    edgeIndexByCotreeColumn.length,
  );
  for (let column = 0; column < edgeIndexByCotreeColumn.length; column += 1) {
    const edgeIndex = edgeIndexByCotreeColumn[column];
    // Crossing taken from the stored source, i.e. traversal +1.
    columnWall[column] = wallTables.edgeToWall[edgeIndex];
    columnCoefficient[column] = wallTables.edgeParity[edgeIndex];
  }
  return { treeStepWall, treeStepCoefficient, columnWall, columnCoefficient };
}

function buildWallVector(input: {
  oracle: StreamedLawfulDavisOracle;
  packedEdges: PackedGeometricEdges;
  tree: TreeGauge;
  cotreeDigest: string;
  edgeIndexByCotreeColumn: Uint32Array;
  crossings: WallCrossingTables;
  potential: Float64Array;
  wall: number;
  wallId: string;
  oracleWallIndex: number;
  /**
   * Keep the sparse entries (export path).  The certificate scan needs only
   * the digest and count; at 10^7..10^8 cotree columns retaining every
   * entry exhausts the JavaScript heap.
   */
  retainEntries?: boolean;
}): GenericStreamedH1WallVector & { nonzeroCount: number } {
  const {
    oracle,
    packedEdges,
    tree,
    cotreeDigest,
    edgeIndexByCotreeColumn,
    crossings,
    potential,
    wall,
    wallId,
    oracleWallIndex,
  } = input;
  const retainEntries = input.retainEntries ?? true;
  // One potential vector is reused across walls. This keeps peak memory O(V+E)
  // instead of allocating the dense wall-by-vertex table used by the small
  // exact backend.
  potential[0] = 0;
  for (let order = 1; order < tree.reachedVertexCount; order += 1) {
    const point = tree.bfsOrder[order];
    const value =
      potential[tree.parent[point]] +
      (crossings.treeStepWall[point] === oracleWallIndex
        ? crossings.treeStepCoefficient[point]
        : 0);
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `The tree potential for ${wallId} is not a safe integer.`,
      );
    }
    potential[point] = value;
  }

  const entries: Array<[number, string]> = [];
  // Literal canonical JSON of the vector record, hashed incrementally so the
  // text never has to exist as one string.
  const digest = createSha256Stream();
  digest.update(`{"cotreeDigest":${JSON.stringify(cotreeDigest)},"entries":[`);
  let pending = "";
  let nonzeroCount = 0;
  for (let column = 0; column < edgeIndexByCotreeColumn.length; column += 1) {
    const edgeIndex = edgeIndexByCotreeColumn[column];
    const value =
      potential[packedEdges.source[edgeIndex]] -
      potential[packedEdges.target[edgeIndex]] +
      (crossings.columnWall[column] === oracleWallIndex
        ? crossings.columnCoefficient[column]
        : 0);
    if (!Number.isSafeInteger(value)) {
      throw new Error(`The cotree period for ${wallId} is not a safe integer.`);
    }
    if (value !== 0) {
      const coefficient = String(value);
      pending += `${nonzeroCount === 0 ? "" : ","}[${column},"${coefficient}"]`;
      nonzeroCount += 1;
      if (pending.length > 1 << 16) {
        digest.update(pending);
        pending = "";
      }
      if (retainEntries) entries.push([column, coefficient]);
    }
  }
  digest.update(pending);
  digest.update(
    `],"method":"lazy-tree-gauged-two-sided-wall-vector","oracleStructureHash":${JSON.stringify(oracle.structureHash)},"schemaVersion":1,"treeDigest":${JSON.stringify(tree.treeDigest)},"wall":${wall},"wallId":${JSON.stringify(wallId)}}`,
  );
  return {
    wall,
    wallId,
    entries,
    nonzeroCount,
    vectorDigest: digest.digestHex(),
  };
}

function* scanWalls(input: {
  oracle: StreamedLawfulDavisOracle;
  packedEdges: PackedGeometricEdges;
  tree: TreeGauge;
  cotreeDigest: string;
  edgeIndexByCotreeColumn: Uint32Array;
  crossings: WallCrossingTables;
  oracleWallIndexById: ReadonlyMap<string, number>;
  share: Share;
}): PreparationSteps<WallScan> {
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
  let records = "";
  let inChunk = 0;
  const { tree, crossings, share } = input;
  const source = share(input.packedEdges.source);
  const target = share(input.packedEdges.target);
  // One job per two-sided wall; each builds its own tree potential.
  const vectors = yield* runBatch(
    "wallVector",
    twoSidedWallIds.map((wallId, wall) => ({
      degree: oracle.degree,
      reachedVertexCount: tree.reachedVertexCount,
      bfsOrder: tree.bfsOrder,
      parent: tree.parent,
      treeStepWall: crossings.treeStepWall,
      treeStepCoefficient: crossings.treeStepCoefficient,
      columnWall: crossings.columnWall,
      columnCoefficient: crossings.columnCoefficient,
      edgeIndexByCotreeColumn: input.edgeIndexByCotreeColumn,
      source,
      target,
      oracleWallIndex: input.oracleWallIndexById.get(wallId)!,
      wall,
      wallId,
      cotreeDigest: input.cotreeDigest,
      oracleStructureHash: oracle.structureHash,
      treeDigest: tree.treeDigest,
    })),
  );
  for (let wall = 0; wall < twoSidedWallIds.length; wall += 1) {
    const vector = { ...vectors[wall], wallId: twoSidedWallIds[wall] };
    nonzeroCount += vector.nonzeroCount;
    assertSafeNonnegativeInteger(nonzeroCount, "Wall-vector nonzero count");
    records += `${inChunk === 0 ? "" : ","}{"nonzeroCount":${vector.nonzeroCount},"vectorDigest":${JSON.stringify(vector.vectorDigest)},"wall":${wall},"wallId":${JSON.stringify(vector.wallId)}}`;
    inChunk += 1;
    if (inChunk === HASH_CHUNK_SIZE) {
      vectorChunkDigests.push(
        chunkRecordsDigest(vectorChunkDigests.length, records),
      );
      records = "";
      inChunk = 0;
    }
  }
  if (inChunk > 0) {
    vectorChunkDigests.push(
      chunkRecordsDigest(vectorChunkDigests.length, records),
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
export interface GenericStreamedH1PreparationProgress {
  phase:
    | "pack-edges"
    | "tree-gauge"
    | "cotree-columns"
    | "boundary"
    | "wall-crossings"
    | "wall-vectors";
  elapsedMs: number;
}

export interface PrepareGenericStreamedH1Options {
  /** Called after each phase, e.g. for progress display. */
  onProgress?: (event: GenericStreamedH1PreparationProgress) => void;
}

export function prepareGenericStreamedH1(
  oracle: StreamedLawfulDavisOracle,
  options: PrepareGenericStreamedH1Options = {},
): GenericStreamedH1Preparation {
  return runSync(preparationSteps(oracle, options, keep));
}

/**
 * prepareGenericStreamedH1 with its hashing and scanning phases (tree and
 * cotree records, boundary rows, wall vectors) on a kernel pool.  The
 * preparation, and every digest in it, is identical.
 */
export async function prepareGenericStreamedH1Parallel(
  oracle: StreamedLawfulDavisOracle,
  pool: KernelPool,
  options: PrepareGenericStreamedH1Options = {},
): Promise<GenericStreamedH1Preparation> {
  if (pool.kind === "inline") return prepareGenericStreamedH1(oracle, options);
  return runOnPool(preparationSteps(oracle, options, toShared), pool);
}

function* preparationSteps(
  oracle: StreamedLawfulDavisOracle,
  options: PrepareGenericStreamedH1Options,
  share: Share,
): PreparationSteps<GenericStreamedH1Preparation> {
  let phaseStart = performance.now();
  const report = (phase: GenericStreamedH1PreparationProgress["phase"]) => {
    const now = performance.now();
    options.onProgress?.({ phase, elapsedMs: now - phaseStart });
    phaseStart = now;
  };
  assertSafeNonnegativeInteger(oracle.degree, "Quotient degree");
  assertSafeNonnegativeInteger(
    oracle.geometricEdgeCount,
    "Geometric edge count",
  );
  assertSafeNonnegativeInteger(oracle.rankTwoCellCount, "Rank-two cell count");
  const packedEdges = packGeometricEdges(oracle);
  report("pack-edges");
  const tree = yield* buildTreeGauge(oracle);
  report("tree-gauge");
  if (tree.reachedVertexCount !== oracle.degree) {
    throw new Error(
      `The canonical BFS reaches ${tree.reachedVertexCount}/${oracle.degree} quotient vertices.`,
    );
  }
  const cotree = yield* makeCotreeColumns({
    oracle,
    packedEdges,
    tree,
    share,
  });
  report("cotree-columns");
  const wallTables = oracle.packedWallTables();
  const twoSidedWallIndex = new Uint8Array(oracle.walls.wallCount);
  const oracleWallIndexById = new Map<string, number>();
  for (const wall of oracle.walls.walls) {
    oracleWallIndexById.set(wall.id, wall.wallIndex);
    if (wall.twoSided) twoSidedWallIndex[wall.wallIndex] = 1;
  }
  const boundary = yield* scanBoundary(
    {
      oracle,
      cotreeColumnByEdge: cotree.cotreeColumnByEdge,
      columnCount: cotree.edgeIndexByCotreeColumn.length,
      wallTables,
      twoSidedWallIndex,
    },
    share,
  );
  report("boundary");
  const crossings = buildWallCrossingTables({
    oracle,
    packedEdges,
    tree,
    edgeIndexByCotreeColumn: cotree.edgeIndexByCotreeColumn,
    wallTables,
  });
  report("wall-crossings");
  const walls = yield* scanWalls({
    oracle,
    packedEdges,
    tree,
    cotreeDigest: cotree.digest,
    edgeIndexByCotreeColumn: cotree.edgeIndexByCotreeColumn,
    crossings,
    oracleWallIndexById,
    share,
  });
  report("wall-vectors");
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
      visitor({
        column,
        edgeIndex,
        edgeId: edgeStableId(
          packedEdges.generator[edgeIndex],
          packedEdges.source[edgeIndex],
          packedEdges.target[edgeIndex],
        ),
        generator: packedEdges.generator[edgeIndex],
        sourcePoint: packedEdges.source[edgeIndex],
        targetPoint: packedEdges.target[edgeIndex],
      });
    }
  };
  const forEachBoundaryRow = (
    visitor: (row: GenericStreamedH1BoundaryRow) => void,
  ): void => {
    const row = forEachPackedBoundaryRow(
      oracle,
      cotree.cotreeColumnByEdge,
      (rowIndex, cell, columns, coefficients, count) => {
        const entries: Array<[number, string]> = [];
        for (let index = 0; index < count; index += 1) {
          entries.push([columns[index], String(coefficients[index])]);
        }
        visitor({ row: rowIndex, cellId: cell.cellId, entries });
      },
    );
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
      forEachPackedBoundaryRow(
        oracle,
        cotree.cotreeColumnByEdge,
        (_row, _cell, columns, coefficients, count) => {
          let line = String(count);
          for (let index = 0; index < count; index += 1) {
            line += ` ${columns[index]} ${coefficients[index]}`;
          }
          visitor(line);
        },
      );
    },
    forEachTwoSidedWallVector: (
      visitor: (vector: GenericStreamedH1WallVector) => void,
    ): void => {
      const potential = new Float64Array(oracle.degree);
      for (let wall = 0; wall < walls.twoSidedWallIds.length; wall += 1) {
        visitor(
          buildWallVector({
            oracle,
            packedEdges,
            tree,
            cotreeDigest: cotree.digest,
            edgeIndexByCotreeColumn: cotree.edgeIndexByCotreeColumn,
            crossings,
            potential,
            wall,
            wallId: walls.twoSidedWallIds[wall],
            oracleWallIndex: oracleWallIndexById.get(
              walls.twoSidedWallIds[wall],
            )!,
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
